/* پنل ادمین دفتر یادداشت هوشمند — GitHub API + تنظیمات provider */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var REPO = "Armin13891219A/site-summarizer";
  var BRANCH = "main";
  var API = "https://api.github.com";

  var token = null;
  var sitesSha = null;

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

  function toB64(str) { return btoa(unescape(encodeURIComponent(str))); }
  function fromB64(b64) { return decodeURIComponent(escape(atob(b64))); }

  function fetchFile(path) {
    return gh("/repos/" + REPO + "/contents/" + path + "?ref=" + BRANCH).then(function (f) {
      return { sha: f.sha, content: fromB64(f.content) };
    });
  }

  function commitFile(path, content, sha, msg) {
    return gh("/repos/" + REPO + "/contents/" + path, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: msg,
        content: toB64(content),
        sha: sha,
        branch: BRANCH
      })
    }).then(function (r) { return r; });
  }

  /* ——— ۱) ورود ——— */
  function unlock() {
    var t = $("token").value.trim();
    if (!t || (t.indexOf("ghp_") !== 0 && t.indexOf("github_pat_") !== 0)) {
      log("توکن معتبر نیست. باید با ghp_ یا github_pat_ شروع شود.", "err");
      return;
    }
    token = t;
    $("token").value = "";
    gh("/user").then(function (u) {
      $("unlock-panel").style.display = "none";
      $("admin-panel").style.display = "block";
      $("settings-panel").style.display = "block";
      $("sites-panel").style.display = "block";
      log("خوش آمدی " + (u.login || "admin") + " — پنل فعال شد", "ok");
      loadSites();
      loadSettings();
    }).catch(function (e) {
      log("توکن رد شد: " + e.message, "err");
      token = null;
    });
  }

  /* ——— ۲) لیست سایت‌ها ——— */
  function loadSites() {
    fetchFile("config/sites.json")
      .then(function (f) {
        var arr = JSON.parse(f.content);
        sitesSha = f.sha;
        renderSites(arr);
        log("لیست سایت‌ها بارگذاری شد (" + arr.length + " سایت)", "ok");
      })
      .catch(function (e) { log("خطا در خواندن لیست: " + e.message, "err"); });
  }

  function renderSites(arr) {
    var box = $("sites-list");
    box.innerHTML = arr.map(function (s, i) {
      var host = "";
      try { host = new URL(s.url).hostname; } catch (e) { host = s.url; }
      return '<div class="site-row">' +
        '<span class="favicon-mini"><img loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=' +
          encodeURIComponent(host) + '&sz=64" onerror="this.style.display=\'none\'"></span>' +
        '<span class="site-info"><b>' + esc(s.name) + '</b><span class="muted">' + esc(s.url) + '</span></span>' +
        '<span class="chip-mini">' + esc(s.category || "عمومی") + '</span>' +
        '<button class="btn-mini" data-del="' + i + '"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg> حذف</button>' +
      '</div>';
    }).join("");
    box.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () { delSite(+btn.getAttribute("data-del")); });
    });
  }

  /* ——— ۳) افزودن سایت (فقط URL — بقیه خودکار) ——— */
  function addSite() {
    var url = $("new-url").value.trim();
    if (!url) { log("یک آدرس وارد کن.", "err"); return; }
    if (!/^https?:\/\//.test(url)) { log("آدرس باید با http(s):// شروع شود.", "err"); return; }
    $("add-btn").disabled = true;
    $("add-btn").textContent = "در حال افزودن…";
    log("دریافت لیست فعلی از گیت‌هاب…");

    fetchFile("config/sites.json")
      .then(function (f) {
        var arr = JSON.parse(f.content);
        if (arr.some(function (s) { return s.url === url; })) {
          throw new Error("این سایت قبلاً اضافه شده.");
        }
        arr.push({ id: "pending", name: url, url: url, category: "عمومی", tags: [] });
        sitesSha = f.sha;
        return commitFile(
          "config/sites.json",
          JSON.stringify(arr, null, 2) + "\n",
          sitesSha,
          "add site: " + url
        );
      })
      .then(function () {
        log("سایت اضافه شد — ورک‌فلو خودکار فعال شد", "ok");
        $("new-url").value = "";
        loadSites();
        dispatchWorkflow(url);
      })
      .catch(function (e) { log("خطا: " + e.message, "err"); })
      .then(function () {
        $("add-btn").disabled = false;
        $("add-btn").textContent = "افزودن سایت";
      });
  }

  /* ——— ۴) حذف سایت ——— */
  function delSite(i) {
    fetchFile("config/sites.json")
      .then(function (f) {
        var arr = JSON.parse(f.content);
        var removed = arr.splice(i, 1)[0];
        sitesSha = f.sha;
        return commitFile(
          "config/sites.json",
          JSON.stringify(arr, null, 2) + "\n",
          sitesSha,
          "remove site: " + (removed ? removed.url : "")
        ).then(function () {
          log("حذف شد: " + (removed ? removed.name : ""), "ok");
          loadSites();
        });
      })
      .catch(function (e) { log("خطا در حذف: " + e.message, "err"); });
  }

  /* ——— ۵) اجرای ورک‌فلو ——— */
  function dispatchWorkflow(newUrl) {
    gh("/repos/" + REPO + "/actions/workflows")
      .then(function (w) {
        var wf = (w.workflows || []).find(function (x) { return x.path.indexOf("summarize") !== -1; });
        if (!wf) { log("ورک‌فلو پیدا نشد.", "err"); return; }
        return gh("/repos/" + REPO + "/actions/workflows/" + wf.id + "/dispatches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: BRANCH, inputs: { add_url: newUrl || "" } })
        }).then(function () {
          log("ورک‌فلو اجرا شد — نام/دسته/تگ/خلاصه خودکار ساخته می‌شوند", "ok");
        });
      })
      .catch(function (e) { log("خطا در اجرای ورک‌فلو: " + e.message, "err"); });
  }

  /* ——— ۶) تنظیمات provider ——— */
  function loadSettings() {
    fetchFile("config/settings.json")
      .then(function (f) {
        var s = JSON.parse(f.content);
        $("ai-provider").value = s.provider || "g4f";
        $("g4f-models").value = (s.g4f_models || []).join("\n");
        $("google-model").value = s.google_model || "";
        $("openrouter-model").value = s.openrouter_model || "";
      })
      .catch(function (e) { log("تنظیمات بارگذاری نشد: " + e.message, "err"); });
  }

  function saveSettings() {
    log("ذخیره تنظیمات…");
    var settings = {
      provider: $("ai-provider").value,
      g4f_models: $("g4f-models").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean),
      google_model: $("google-model").value.trim(),
      openrouter_model: $("openrouter-model").value.trim(),
      summary_max_chars: 180
    };
    fetchFile("config/settings.json")
      .then(function (f) {
        return commitFile(
          "config/settings.json",
          JSON.stringify(settings, null, 2) + "\n",
          f.sha,
          "settings: provider=" + settings.provider
        );
      })
      .then(function () { log("تنظیمات ذخیره شد", "ok"); })
      .catch(function (e) { log("خطا در ذخیره: " + e.message, "err"); });
  }

  /* ——— راه‌اندازی ——— */
  $("unlock-btn").addEventListener("click", unlock);
  $("token").addEventListener("keydown", function (e) {
    if (e.key === "Enter") unlock();
  });
  $("add-btn").addEventListener("click", addSite);
  $("save-settings-btn").addEventListener("click", saveSettings);
})();
