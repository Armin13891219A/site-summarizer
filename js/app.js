/* داشبورد دفتر یادداشت هوشمند */
(function () {
  "use strict";

  var state = { sites: [], meta: null, query: "", category: "همه", error: null };

  var grid = document.getElementById("cards");
  var searchInput = document.getElementById("search");
  var chipsBox = document.getElementById("chips");
  var statSites = document.getElementById("stat-sites");
  var statUpdated = document.getElementById("stat-updated");
  var hl = document.getElementById("hero-hl");
  var marqueeBox = document.getElementById("marquee");
  var scrollBar = document.getElementById("scroll-bar");

  function icon(name) {
    var paths = {
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
      tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
      ext: '<path d="M14 4h6v6M20 4 10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
      spark: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M5.6 18.4l2.8-2.8M15.6 8.4l2.8-2.8"/>',
      book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 5.5v15"/>',
      check: '<circle cx="12" cy="12" r="9"/><path d="m8 12.5 2.5 2.5L16 9.5"/>',
      alert: '<path d="M12 3 2 20h20z"/><path d="M12 9v5M12 17.5v.01"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.globe) + "</svg>";
  }

  function faNum(s) {
    return String(s == null ? "" : s).replace(/[0-9]/g, function (d) {
      return "۰۱۲۳۴۵۶۷۸۹"[+d];
    });
  }

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;")
      .replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { return url; }
  }

  function initTheme() {
    var root = document.documentElement;
    try {
      var t = localStorage.getItem("ss-theme");
      var a = localStorage.getItem("ss-accent");
      if (t === "light" || t === "dark") {
        root.setAttribute("data-theme", t);
        document.getElementById("theme-dark").classList.toggle("active", t === "dark");
        document.getElementById("theme-light").classList.toggle("active", t === "light");
      }
      if (a) {
        root.setAttribute("data-accent", a);
        document.querySelectorAll(".accent-btn").forEach(function (b) {
          b.classList.toggle("active", b.getAttribute("data-accent") === a);
        });
      }
    } catch (e) {}
  }
  initTheme();

  document.getElementById("theme-dark").addEventListener("click", function () {
    document.documentElement.setAttribute("data-theme", "dark");
    document.getElementById("theme-dark").classList.add("active");
    document.getElementById("theme-light").classList.remove("active");
    try { localStorage.setItem("ss-theme", "dark"); } catch (e) {}
  });

  document.getElementById("theme-light").addEventListener("click", function () {
    document.documentElement.setAttribute("data-theme", "light");
    document.getElementById("theme-light").classList.add("active");
    document.getElementById("theme-dark").classList.remove("active");
    try { localStorage.setItem("ss-theme", "light"); } catch (e) {}
  });

  document.querySelectorAll(".accent-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      var a = btn.getAttribute("data-accent");
      document.documentElement.setAttribute("data-accent", a);
      document.querySelectorAll(".accent-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      try { localStorage.setItem("ss-accent", a); } catch (e) {}
    });
  });

  function counter(el, to, duration) {
    if (!el) return;
    var from = 0, start = null;
    function tick(t) {
      if (start === null) start = t;
      var p = Math.min(1, (t - start) / (duration || 1400));
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = faNum(Math.round(from + (to - from) * eased));
      if (p < 1) requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }

  function blurWords(text, delay) {
    return text.split(" ").map(function (w, i) {
      return '<span class="blur-word" style="animation-delay:' + (i * (delay || 90)) + 'ms">' + esc(w) + "&nbsp;</span>";
    }).join("");
  }

  function renderMarquee(sites) {
    if (!marqueeBox) return;
    var one = sites.map(function (s) {
      return '<span class="marquee-item">' + icon("book") + esc(s.name) + "</span>";
    }).join("");
    marqueeBox.innerHTML = '<div class="marquee-row" dir="rtl">' + one + "</div>" +
      '<div class="marquee-row" dir="rtl" aria-hidden="true">' + one + "</div>";
  }

  function bindScrollProgress() {
    if (!scrollBar) return;
    function read() {
      var max = document.documentElement.scrollHeight - window.innerHeight;
      var p = max > 0 ? Math.min(1, window.scrollY / max) : 0;
      scrollBar.style.transform = "scaleX(" + p + ")";
    }
    window.addEventListener("scroll", read, { passive: true });
    read();
  }

  /* ——— Favicon fallback چندلایه (گوگل → داکرداک → حرف اول) ——— */
  function faviconStack(url, name) {
    var host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { host = url; }
    var letter = (name || host).trim().charAt(0).toUpperCase();
    return (
      '<span class="favicon-wrap">' +
        '<img class="favicon" loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=' +
          encodeURIComponent(host) + '&sz=128" ' +
          'onerror="this.remove(); this.nextElementSibling.style.display=\'flex\'">' +
        '<span class="favicon-letter" aria-hidden="true">' + esc(letter) + "</span>" +
      "</span>"
    );
  }

  function cardHTML(s, i) {
    var topics = (s.key_topics || s.tags || []).slice(0, 3).map(function (t) {
      return '<span class="topic">' + esc(t) + "</span>";
    }).join("");
    var highlights = (s.highlights || []).slice(0, 3).map(function (h) {
      return "<li>" + icon("check") + esc(h) + "</li>";
    }).join("");
    var stale = s.stale ? '<span class="stale-flag">' + icon("alert") + "در انتظار به‌روزرسانی</span>" : "";
    var provider = s.provider ? '<span class="provider-pill">' + esc(s.provider) + "</span>" : "";
    return (
      '<article class="card tilt" style="transition-delay:' + Math.min(i * 60, 420) + 'ms">' +
        '<div class="card-body">' +
          '<div class="card-top">' +
            faviconStack(s.url, s.name) +
            '<div>' +
              '<h2 class="card-name">' + blurWords(s.name || "") + "</h2>" +
              '<div class="card-url">' + esc(hostOf(s.url)) + "</div>" +
            "</div>" +
          "</div>" +
          '<div class="badge-row"><span class="badge">' + icon("tag") + esc(s.category || "عمومی") + "</span>" +
            '<span class="badge muted">' + icon("spark") + esc(s.sentiment || "اطلاع‌رسانی") + "</span></div>" +
          '<p class="summary">' + esc(s.summary || "خلاصه‌ای ثبت نشده است.") + "</p>" +
          (highlights ? '<ul class="hl-list">' + highlights + "</ul>" : "") +
          (topics ? '<div class="topics">' + topics + "</div>" : "") +
          '<div class="card-meta">' +
            "<span>" + icon("clock") + esc(s.read_time || "") + "</span>" +
            "<span>" + icon("cal") + esc(s.updated_at || "") + "</span>" +
            provider + stale +
          "</div>" +
          '<a class="visit" href="' + esc(s.url) + '" target="_blank" rel="noopener">' +
            "مشاهده وب‌سایت " + icon("ext") + "</a>" +
        "</div>" +
      "</article>"
    );
  }

  function renderChips() {
    var cats = ["همه"];
    state.sites.forEach(function (s) {
      var c = s.category || "عمومی";
      if (cats.indexOf(c) === -1) cats.push(c);
    });
    chipsBox.innerHTML = cats.map(function (c) {
      return '<button class="chip' + (state.category === c ? " active" : "") +
        '" data-cat="' + esc(c) + '">' + esc(c) + "</button>";
    }).join("");
    chipsBox.querySelectorAll(".chip").forEach(function (btn) {
      btn.addEventListener("click", function () {
        state.category = btn.getAttribute("data-cat");
        renderChips();
        renderCards();
      });
    });
  }

  function filtered() {
    var q = state.query.trim();
    var out = [];
    state.sites.forEach(function (s, idx) {
      var okCat = state.category === "همه" || (s.category || "عمومی") === state.category;
      if (!okCat) return;
      if (!q) { out.push({ s: s, i: idx }); return; }
      var hay = [s.name, s.summary, s.category, (s.tags || []).join(" "),
        (s.key_topics || []).join(" "), (s.highlights || []).join(" ")].join(" ");
      if (hay.indexOf(q) !== -1) out.push({ s: s, i: idx });
    });
    return out;
  }

  function renderCards() {
    var list = filtered();
    if (!list.length) {
      grid.innerHTML = '<div class="empty">' +
        (state.error ? "خطا در بارگذاری داده‌ها. اتصال را بررسی کنید." :
          "موردی با این جست‌وجو پیدا نشد. عبارت دیگری را امتحان کنید.") + "</div>";
      return;
    }
    grid.innerHTML = list.map(function (x) { return cardHTML(x.s, x.i); }).join("");
    observeReveals();
    bindSpotlights();
  }

  var revealIO = null;
  function observeReveals() {
    var cards = grid.querySelectorAll(".card");
    if (!("IntersectionObserver" in window)) {
      cards.forEach(function (c) { c.classList.add("shown"); });
      return;
    }
    if (revealIO) revealIO.disconnect();
    revealIO = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          e.target.classList.add("shown");
          revealIO.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    cards.forEach(function (c) { revealIO.observe(c); });
  }

  function bindSpotlights() {
    grid.querySelectorAll(".card").forEach(function (card) {
      card.addEventListener("pointermove", function (e) {
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.setProperty("--ry", (px * 10).toFixed(2) + "deg");
        card.style.setProperty("--rx", (py * -10).toFixed(2) + "deg");
      });
      card.addEventListener("pointerleave", function () {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  searchInput.addEventListener("input", function () {
    state.query = searchInput.value;
    renderCards();
  });

  fetch("data/sites.json", { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(function (data) {
      state.sites = data.sites || [];
      state.meta = data.meta || null;
      counter(statSites.querySelector("b"), state.sites.length, 1400);
      statUpdated.innerHTML = "به‌روزرسانی: <b>" + esc((state.meta && state.meta.last_updated) || "—") + "</b>";
      if (hl) requestAnimationFrame(function () { hl.classList.add("on"); });
      renderMarquee(state.sites);
      bindScrollProgress();
      renderChips();
      renderCards();
    })
    .catch(function (err) {
      state.error = String(err && err.message || err);
      grid.innerHTML = '<div class="empty">خطا در بارگذاری داده‌ها. صفحه را رفرش کنید.</div>';
    });
})();
