/* پنل ادمین دفتر یادداشت هوشمند — نشست پایدار + toast + بدون رفرش + API Keys */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var REPO = "Armin13891219A/site-summarizer";
  var BRANCH = "main";
  var API = "https://api.github.com";
  var TOKEN_KEY = "ss-admin-token";

  var token = null;

  /* ——— آیکون‌ها ——— */
  function icon(name) {
    var paths = {
      ok: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
      err: '<circle cx="12" cy="12" r="9"/><path d="M12 8v4.5M12 16h.01"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.book) + "</svg>";
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /* ——— پیام شناور (به‌جای لاگ ترمینالی) ——— */
  function toast(msg, kind) {
    var box = $("toasts");
    var t = document.createElement("div");
    t.className = "toast " + (kind || "");
    t.innerHTML = icon(kind === "ok" ? "ok" : kind === "err" ? "err" : "book") +
      "<span>" + esc(msg) + "</span>";
    box.appendChild(t);
    setTimeout(function () {
      t.classList.add("hide");
      setTimeout(function () { t.remove(); }, 300);
    }, 4200);
  }

  /* ——— GitHub API ——— */
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
          throw new Error(e.message || r.statusText);
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

  /* ——— کامیت با ری‌تری هوشمند (حل خطای 409) ——— */
  function commitWithRetry(path, newContent, msg, attempt) {
    attempt = attempt || 0;
    return fetchFile(path).then(function (f) {
      return gh("/repos/" + REPO + "/contents/" + path, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          content: toB64(newContent),
          sha: f.sha,
          branch: BRANCH
        })
      });
    }).catch(function (e) {
      if (attempt < 2) {
        // SHA ممکن است قدیمی باشد — یک بار دیگر تلاش کن
        return new Promise(function (resolve) { setTimeout(resolve, 800); })
          .then(function () { return commitWithRetry(path, newContent, msg, attempt + 1); });
      }
      throw e;
    });
  }

  /* ——— ۱) نشست پایدار ——— */
  function lockUi(locked) {
    $("unlock-panel").style.display = locked ? "block" : "none";
    $("admin-panel").style.display = locked ? "none" : "block";
    $("settings-panel").style.display = locked ? "none" : "block";
    $("keys-panel").style.display = locked ? "none" : "block";
    $("sites-panel").style.display = locked ? "none" : "block";
    $("logout-btn").style.display = locked ? "none" : "inline-flex";
  }

  function unlock() {
    var t = $("token").value.trim();
    if (!t || (t.indexOf("ghp_") !== 0 && t.indexOf("github_pat_") !== 0)) {
      toast("توکن معتبر نیست. باید با ghp_ یا github_pat_ شروع شود.", "err");
      return;
    }
    token = t;
    $("token").value = "";
    gh("/user").then(function (u) {
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
      lockUi(false);
      toast("خوش آمدی " + (u.login || "ادمین") + " — پنل فعال شد", "ok");
      loadSites();
      loadSettings();
    }).catch(function (e) {
      toast("توکن رد شد: " + e.message, "err");
      token = null;
    });
  }

  function logout() {
    token = null;
    try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
    lockUi(true);
    toast("از پنل خارج شدی", "ok");
  }

  /* ——— ۲) لیست سایت‌ها ——— */
  function loadSites() {
    fetchFile("config/sites.json")
      .then(function (f) {
        var arr = JSON.parse(f.content);
        renderSites(arr);
      })
      .catch(function (e) { toast("خطا در خواندن لیست: " + e.message, "err"); });
  }

  function renderSites(arr) {
    var box = $("sites-list");
    box.innerHTML = arr.map(function (s, i) {
      var host = "";
      try { host = new URL(s.url).hostname; } catch (e) { host = s.url; }
      return '<div class="site-row">' +
        '<span class="favicon-mini"><img loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=' +
          encodeURIComponent(host) + '&sz=64" onerror="this.remove(); this.nextElementSibling.style.display=\'flex\'">' +
          '<span class="favicon-letter-mini" aria-hidden="true">' + esc((s.name || host).trim().charAt(0).toUpperCase()) + "</span>" +
        "</span>" +
        '<span class="site-info"><b>' + esc(s.name) + '</b><span class="muted">' + esc(s.url) + '</span></span>' +
        '<span class="chip-mini">' + esc(s.category || "عمومی") + '</span>' +
        '<button class="btn-mini" data-del="' + i + '">' + icon("err") + " حذف</button>" +
      "</div>";
    }).join("");
    box.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () { delSite(+btn.getAttribute("data-del")); });
    });
  }

  /* ——— ۳) افزودن سایت (فقط URL + بدون رفرش) ——— */
  function addSite() {
    var url = $("new-url").value.trim();
    if (!url) { toast("یک آدرس وارد کن.", "err"); return; }
    if (!/^https?:\/\//.test(url)) { toast("آدرس باید با http(s):// شروع شود.", "err"); return; }
    $("add-btn").disabled = true;
    $("add-btn").textContent = "در حال افزودن…";

    fetchFile("config/sites.json")
      .then(function (f) {
        var arr = JSON.parse(f.content);
        if (arr.some(function (s) { return s.url === url; })) {
          throw new Error("این سایت قبلاً اضافه شده.");
        }
        arr.push({ id: "pending", name: url, url: url, category: "عمومی", tags: [] });
        return commitWithRetry(
          "config/sites.json",
          JSON.stringify(arr, null, 2) + "\n",
          "add site: " + url
        ).then(function () { return arr; });
      })
      .then(function (arr) {
        toast("سایت اضافه شد — ورک‌فلو خودکار فعال شد", "ok");
        $("new-url").value = "";
        renderSites(arr); /* به‌روزرسانی فوری بدون رفرش */
        dispatchWorkflow(url);
      })
      .catch(function (e) { toast("خطا: " + e.message, "err"); })
      .then(function () {
        $("add-btn").disabled = false;
        $("add-btn").textContent = "افزودن سایت";
      });
  }

  /* ——— ۴) حذف سایت (بدون رفرش) ——— */
  function delSite(i) {
    fetchFile("config/sites.json")
      .then(function (f) {
        var arr = JSON.parse(f.content);
        var removed = arr.splice(i, 1)[0];
        return commitWithRetry(
          "config/sites.json",
          JSON.stringify(arr, null, 2) + "\n",
          "remove site: " + (removed ? removed.url : "")
        ).then(function () {
          toast("حذف شد: " + (removed ? removed.name : ""), "ok");
          renderSites(arr); /* به‌روزرسانی فوری بدون رفرش */
        });
      })
      .catch(function (e) { toast("خطا در حذف: " + e.message, "err"); });
  }

  /* ——— ۵) اجرای ورک‌فلو ——— */
  function dispatchWorkflow(newUrl) {
    gh("/repos/" + REPO + "/actions/workflows")
      .then(function (w) {
        var wf = (w.workflows || []).find(function (x) { return x.path.indexOf("summarize") !== -1; });
        if (!wf) { toast("ورک‌فلو پیدا نشد.", "err"); return; }
        return gh("/repos/" + REPO + "/actions/workflows/" + wf.id + "/dispatches", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ref: BRANCH, inputs: { add_url: newUrl || "" } })
        }).then(function () {
          toast("ورک‌فلو اجرا شد — خلاصه خودکار ساخته می‌شود", "ok");
        });
      })
      .catch(function (e) { toast("خطا در اجرای ورک‌فلو: " + e.message, "err"); });
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
      .catch(function (e) { toast("تنظیمات بارگذاری نشد: " + e.message, "err"); });
  }

  function saveSettings() {
    var settings = {
      provider: $("ai-provider").value,
      g4f_models: $("g4f-models").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean),
      google_model: $("google-model").value.trim(),
      openrouter_model: $("openrouter-model").value.trim(),
      summary_max_chars: 180
    };
    commitWithRetry(
      "config/settings.json",
      JSON.stringify(settings, null, 2) + "\n",
      "settings: provider=" + settings.provider
    ).then(function () { toast("تنظیمات ذخیره شد", "ok"); })
      .catch(function (e) { toast("خطا در ذخیره: " + e.message, "err"); });
  }

  /* ——— ۷) کلیدهای API (GitHub Secrets) ——— */
  function saveKeys() {
    var g = $("google-key").value.trim();
    var o = $("openrouter-key").value.trim();
    if (!g && !o) { toast("حداقل یک کلید وارد کن.", "err"); return; }

    var promises = [];
    if (g) promises.push(setSecret("GOOGLE_API_KEY", g));
    if (o) promises.push(setSecret("OPENROUTER_API_KEY", o));

    Promise.all(promises)
      .then(function () {
        toast("کلیدها در GitHub Secrets ذخیره شدند", "ok");
        $("google-key").value = "";
        $("openrouter-key").value = "";
      })
      .catch(function (e) { toast("خطا در ذخیره کلید: " + e.message, "err"); });
  }

  function setSecret(name, value) {
    var payload = { encrypted_value: value };
    return gh("/repos/" + REPO + "/actions/secrets/" + name, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  }

  /* ——— راه‌اندازی ——— */
  $("unlock-btn").addEventListener("click", unlock);
  $("token").addEventListener("keydown", function (e) {
    if (e.key === "Enter") unlock();
  });
  $("logout-btn").addEventListener("click", logout);
  $("add-btn").addEventListener("click", addSite);
  $("save-settings-btn").addEventListener("click", saveSettings);
  $("save-keys-btn").addEventListener("click", saveKeys);

  /* ——— نشست پایدار: توکن از localStorage خوانده شود ——— */
  try {
    var saved = localStorage.getItem(TOKEN_KEY);
    if (saved && (saved.indexOf("ghp_") === 0 || saved.indexOf("github_pat_") === 0)) {
      token = saved;
      gh("/user").then(function (u) {
        lockUi(false);
        toast("خوش آمدی " + (u.login || "ادمین"), "ok");
        loadSites();
        loadSettings();
      }).catch(function () {
        token = null;
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      });
    }
  } catch (e) {}
})();
