// ————————————————————————————————————————
//  پنل ادمین دفتر یادداشت هوشمند
//  افزودن سایت از طریق GitHub API + reCAPTCHA-free admin
//  امنیت: توکن هرگز در سورس نیست — از session storage خوانده می‌شود
// ————————————————————————————————————————

(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  // آدرس ریپو — بعد از push خودکار پر می‌شود
  var REPO = "Armin13891219A/site-summarizer";
  var BRANCH = "main";
  var API = "https://api.github.com";

  var token = null;
  var adminUnlocked = false;

  // ——— utilities ———
  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function log(msg, kind) {
    var box = $("log");
    var line = document.createElement("div");
    line.className = "log-line" + (kind ? " log-" + kind : "");
    line.textContent = new Date().toLocaleTimeString("fa-IR") + " — " + msg;
    box.prepend(line);
  }

  // ——— gh api helpers ———
  function gh(url, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      "Authorization": "Bearer " + token,
      "Accept": "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28"
    }, opts.headers || {});
    return fetch(API + url, opts).then(function (r) {
      if (!r.ok) {
        return r.json().then(function (e) {
          throw new Error("HTTP " + r.status + ": " + (e.message || r.statusText));
        });
      }
      return r.status === 204 ? null : r.json();
    });
  }

  // محتوا را به صورت base64 آماده می‌کند (github api از base64 می‌خواهد)
  function toB64(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  // ——— 1) unlock ———
  function unlock() {
    var t = $("token").value.trim();
    if (!t || (t.indexOf("ghp_") !== 0 && t.indexOf("github_pat_") !== 0)) {
      log("توکن معتبر نیست. باید با ghp_ یا github_pat_ شروع شود.", "err");
      return;
    }
    token = t;
    $("token").value = "";
    gh("/user").then(function (u) {
      adminUnlocked = true;
      $("unlock-panel").style.display = "none";
      $("admin-panel").style.display = "block";
      $("sites-panel").style.display = "block";
      log("خوش آمدی " + (u.login || "admin") + " — پنل فعال شد ✅", "ok");
      loadSites();
    }).catch(function (e) {
      log("توکن رد شد: " + e.message, "err");
      token = null;
    });
  }

  // ——— 2) list ———
  function loadSites() {
    gh("/repos/" + REPO + "/contents/config/sites.json?ref=" + BRANCH)
      .then(function (f) {
        var raw = decodeURIComponent(escape(atob(f.content)));
        var arr = JSON.parse(raw);
        window.__sitesSha = f.sha;
        renderSites(arr);
        log("لیست سایت‌ها بارگذاری شد (" + arr.length + " سایت)", "ok");
      })
      .catch(function (e) {
        log("خطا در خواندن لیست: " + e.message, "err");
      });
  }

  function renderSites(arr) {
    var box = $("sites-list");
    box.innerHTML = arr.map(function (s, i) {
      return '<div class="site-row">' +
        '<span class="favicon-mini"><img loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=' +
          esc(new URL(s.url).hostname) + '&sz=64" onerror="this.style.display=\'none\'"></span>' +
        '<span class="site-info"><b>' + esc(s.name) + '</b><span class="muted">' + esc(s.url) + '</span></span>' +
        '<span class="chip-mini">' + esc(s.category || "عمومی") + '</span>' +
        '<button class="btn-mini btn-danger" data-del="' + i + '">حذف</button>' +
      '</div>';
    }).join("");
    box.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () { delSite(+btn.getAttribute("data-del")); });
    });
  }

  // ——— 3) add ———
  function addSite() {
    var url = $("new-url").value.trim();
    var name = ($("new-name").value.trim() || "").trim();
    var cat = $("new-cat").value.trim() || "عمومی";
    var tags = $("new-tags").value.trim().split(/[,\s]+/).filter(Boolean);
    var genSum = $("gen-summary").checked;

    if (!url) { log("یک آدرس وارد کن.", "err"); return; }
    if (!/^https?:\/\//.test(url)) { log("آدرس باید با http(s):// شروع شود.", "err"); return; }
    if (!name) name = url.replace(/^https?:\/\//, "").split("/")[0];
    $("add-btn").disabled = true;
    $("add-btn").textContent = "در حال افزودن…";
    log("دریافت لیست فعلی از گیت‌هاب…");

    gh("/repos/" + REPO + "/contents/config/sites.json?ref=" + BRANCH)
      .then(function (f) {
        var arr = JSON.parse(deURIComponent(atob(f.content)));
        if (arr.some(function (s) { return s.url === url; })) {
          throw new Error("این سایت قبلاً اضافه شده.");
        }
        var entry = { id: slugify(url), name: name, url: url, category: cat, tags: tags };
        arr.push(entry);
        window.__sitesSha = f.sha;
        return commitSites(arr, "➕ افزودن " + name);
      })
      .then(function () {
        log("سایت اضافه شد و ورک‌فلو خودکار فعال شد ✅", "ok");
        $("new-url").value = ""; $("new-name").value = ""; $("new-tags").value = "";
        loadSites();
        if (genSum) generateFor(url, name);
      })
      .catch(function (e) {
        log("خطا: " + e.message, "err");
      })
      .then(function () {
        $("add-btn").disabled = false;
        $("add-btn").textContent = "➕ افزودن سایت";
      });
  }

  function deURIComponent(s) { return decodeURIComponent(escape(s)); }

  function slugify(url) {
    return (url.replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0] || "site")
      .replace(/[^a-zA-Z0-9-]/g, "-").replace(/-+/g, "-").toLowerCase().slice(0, 40);
  }

  function commitSites(arr, msg) {
    var body = JSON.stringify({
      message: msg,
      content: toB64(JSON.stringify(arr, null, 2) + "\n"),
      sha: window.__sitesSha,
      branch: BRANCH
    });
    return gh("/repos/" + REPO + "/contents/config/sites.json", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: body
    }).then(function (r) {
      window.__sitesSha = r.content.sha;
      return r;
    });
  }

  // ——— 4) delete ———
  function delSite(i) {
    gh("/repos/" + REPO + "/contents/config/sites.json?ref=" + BRANCH)
      .then(function (f) {
        var arr = JSON.parse(deURIComponent(atob(f.content)));
        var removed = arr.splice(i, 1)[0];
        window.__sitesSha = f.sha;
        return commitSites(arr, "➖ حذف " + (removed ? removed.name : "")).then(function () {
          log("حذف شد: " + (removed ? removed.name : ""), "ok");
          loadSites();
        });
      })
      .catch(function (e) { log("خطا در حذف: " + e.message, "err"); });
  }

  // ——— 5) generate summary live (via our own workflow dispatch) ———
  function generateFor(url, name) {
    log("درخواست تولید خلاصه برای " + name + " (workflow)…");
    gh("/repos/" + REPO + "/actions/workflows")
      .then(function (w) {
        var wf = (w.workflows || []).find(function (x) { return x.path.indexOf("summarize") !== -1; });
        if (!wf) { log("ورک‌فلو پیدا نشد.", "err"); return; }
        return gh("/repos/" + REPO + "/actions/workflows/" + wf.id + "/dispatches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: BRANCH, inputs: { force: "true" } })
        }).then(function () {
          log("ورک‌فلو اجرا شد — خلاصه در چند دقیقه آماده و سایت به‌روز می‌شود 🚀", "ok");
        });
      })
      .catch(function (e) { log("خطا در اجرای ورک‌فلو: " + e.message, "err"); });
  }

  // ——— boot ———
  $("unlock-btn").addEventListener("click", unlock);
  $("token").addEventListener("keydown", function (e) {
    if (e.key === "Enter") unlock();
  });
  $("add-btn").addEventListener("click", addSite);
  var sw = $("gen-summary");
  sw.addEventListener("click", function () {
    var on = sw.classList.toggle("on");
    sw.setAttribute("aria-checked", on ? "true" : "false");
  });
})();
