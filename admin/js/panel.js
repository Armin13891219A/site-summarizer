/* پنل ادمین دفتر یادداشت هوشمند — Cloudflare Worker API
   سریع، بدون rate-limit، بدون ارور ۴۰۹، بدون نیاز به توکن گیت‌هاب */
(function () {
  "use strict";
  var $ = function (id) { return document.getElementById(id); };

  var API = "https://site-summarizer-api.armin13891219.workers.dev/api";
  var TOKEN_KEY = "ss-admin-token";
  var THEME_KEY = "ss-theme";
  var ACCENT_KEY = "ss-accent";

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

  /* ——— پیام شناور ——— */
  function toast(msg, kind) {
    var box = $("toasts");
    if (!box) return;
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

  /* ——— درخواست به ورکر ——— */
  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      "Content-Type": "application/json",
      "Authorization": "Bearer " + (token || "")
    }, opts.headers || {});
    return fetch(API + path + (path.includes("?") ? "&" : "?") + "_=" + Date.now(), opts).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d.error || ("HTTP " + r.status));
        return d;
      });
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
    if (!t) { toast("توکن ادمین را وارد کن.", "err"); return; }
    token = t;
    $("token").value = "";
    api("/settings").then(function () {
      try { localStorage.setItem(TOKEN_KEY, token); } catch (e) {}
      lockUi(false);
      toast("پنل فعال شد", "ok");
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
    api("/admin/list")
      .then(function (d) { renderSites(d.sites || []); })
      .catch(function (e) { toast("خطا در خواندن لیست: " + e.message, "err"); });
  }

  function renderSites(arr) {
    var box = $("sites-list");
    box.innerHTML = arr.map(function (s, i) {
      var host = "";
      try { host = new URL(s.url).hostname; } catch (e) { host = s.url; }
      var fav = s.favicon || ("https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=64");
      return '<div class="site-row" data-id="' + esc(s.id) + '">' +
        '<span class="favicon-mini"><img loading="lazy" alt="" src="' + esc(fav) + '" ' +
          'onerror="this.remove(); this.nextElementSibling.style.display=\'flex\'">' +
          '<span class="favicon-letter-mini" aria-hidden="true">' + esc((s.name || host).trim().charAt(0).toUpperCase()) + "</span>" +
        "</span>" +
        '<span class="site-info"><b>' + esc(s.name) + '</b><span class="muted">' + esc(s.url) + '</span></span>' +
        '<span class="chip-mini">' + esc(s.category || "عمومی") + '</span>' +
        '<button class="btn-mini" data-del="' + esc(s.id) + '">' + icon("err") + " حذف</button>" +
      "</div>";
    }).join("");
    box.querySelectorAll("[data-del]").forEach(function (btn) {
      btn.addEventListener("click", function () { delSite(btn.getAttribute("data-del")); });
    });
  }

  /* ——— ۳) افزودن سایت (فقط URL + فوری) ——— */
  function addSite() {
    var url = $("new-url").value.trim();
    if (!url) { toast("یک آدرس وارد کن.", "err"); return; }
    if (!/^https?:\/\//.test(url)) { toast("آدرس باید با http(s):// شروع شود.", "err"); return; }
    $("add-btn").disabled = true;
    $("add-btn").textContent = "در حال افزودن…";

    api("/sites", { method: "POST", body: JSON.stringify({ url: url }) })
      .then(function () {
        toast("سایت اضافه شد", "ok");
        $("new-url").value = "";
        loadSites(); /* به‌روزرسانی فوری */
      })
      .catch(function (e) { toast("خطا: " + e.message, "err"); })
      .then(function () {
        $("add-btn").disabled = false;
        $("add-btn").textContent = "افزودن سایت";
      });
  }

  /* ——— ۴) حذف سایت (فوری) ——— */
  function delSite(id) {
    api("/sites/" + encodeURIComponent(id), { method: "DELETE" })
      .then(function () {
        toast("حذف شد", "ok");
        loadSites(); /* به‌روزرسانی فوری */
      })
      .catch(function (e) { toast("خطا در حذف: " + e.message, "err"); });
  }

  /* ——— ۵) تنظیمات ——— */
  function loadSettings() {
    api("/settings")
      .then(function (s) {
        if (s.provider) $("ai-provider").value = s.provider;
        if (s.g4f_models) {
          try { $("g4f-models").value = JSON.parse(s.g4f_models).join("\n"); }
          catch (e) { $("g4f-models").value = s.g4f_models; }
        }
        if (s.google_model) $("google-model").value = s.google_model;
        if (s.openrouter_model) $("openrouter-model").value = s.openrouter_model;
      })
      .catch(function (e) { toast("تنظیمات بارگذاری نشد: " + e.message, "err"); });
  }

  function saveSettings() {
    var settings = {
      provider: $("ai-provider").value,
      g4f_models: JSON.stringify(
        $("g4f-models").value.split("\n").map(function (l) { return l.trim(); }).filter(Boolean)
      ),
      google_model: $("google-model").value.trim(),
      openrouter_model: $("openrouter-model").value.trim(),
      summary_max_chars: "180"
    };
    api("/settings", { method: "PUT", body: JSON.stringify(settings) })
      .then(function () { toast("تنظیمات ذخیره شد", "ok"); })
      .catch(function (e) { toast("خطا در ذخیره: " + e.message, "err"); });
  }

  /* ——— ۶) کلیدهای API ——— */
  function saveKeys() {
    var g = $("google-key").value.trim();
    var o = $("openrouter-key").value.trim();
    if (!g && !o) { toast("حداقل یک کلید وارد کن.", "err"); return; }

    var settings = {};
    if (g) settings.google_api_key = g;
    if (o) settings.openrouter_api_key = o;

    api("/settings", { method: "PUT", body: JSON.stringify(settings) })
      .then(function () {
        toast("کلیدها ذخیره شدند", "ok");
        $("google-key").value = "";
        $("openrouter-key").value = "";
      })
      .catch(function (e) { toast("خطا در ذخیره کلید: " + e.message, "err"); });
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

  /* ——— تم و رنگ تاکیدی ——— */
  function initTheme() {
    var root = document.documentElement;
    try {
      var t = localStorage.getItem(THEME_KEY);
      var a = localStorage.getItem(ACCENT_KEY);
      if (t === "light" || t === "dark") {
        root.setAttribute("data-theme", t);
        $("p-theme-dark").classList.toggle("active", t === "dark");
        $("p-theme-light").classList.toggle("active", t === "light");
      }
      if (a) {
        root.setAttribute("data-accent", a);
        document.querySelectorAll("[data-p-accent]").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-p-accent") === a);
        });
      }
    } catch (e) {}
  }
  initTheme();

  $("p-theme-dark").addEventListener("click", function () {
    document.documentElement.setAttribute("data-theme", "dark");
    $("p-theme-dark").classList.add("active");
    $("p-theme-light").classList.remove("active");
    try { localStorage.setItem(THEME_KEY, "dark"); } catch (e) {}
  });

  $("p-theme-light").addEventListener("click", function () {
    document.documentElement.setAttribute("data-theme", "light");
    $("p-theme-light").classList.add("active");
    $("p-theme-dark").classList.remove("active");
    try { localStorage.setItem(THEME_KEY, "light"); } catch (e) {}
  });

  document.querySelectorAll("[data-p-accent]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var a = btn.getAttribute("data-p-accent");
      document.documentElement.setAttribute("data-accent", a);
      document.querySelectorAll("[data-p-accent]").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      try { localStorage.setItem(ACCENT_KEY, a); } catch (e) {}
    });
  });

  /* ——— نشست پایدار ——— */
  try {
    var saved = localStorage.getItem(TOKEN_KEY);
    if (saved) {
      token = saved;
      api("/settings").then(function () {
        lockUi(false);
        toast("خوش آمدی — پنل فعال شد", "ok");
        loadSites();
        loadSettings();
      }).catch(function () {
        token = null;
        try { localStorage.removeItem(TOKEN_KEY); } catch (e) {}
      });
    }
  } catch (e) {}
})();
