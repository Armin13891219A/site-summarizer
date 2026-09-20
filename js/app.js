/* داشبورد خلاصه‌ساز — لاجیک رندر، جست‌وجو، فیلتر + reveal و spotlight */
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

  function icon(name) {
    var paths = {
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4M16 3v4M3 10h18"/>',
      tag: '<path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9z"/><circle cx="8" cy="8" r="1.5"/>',
      ext: '<path d="M14 4h6v6M20 4 10 14M18 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h6"/>',
      globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c3 3.5 3 14 0 18M12 3c-3 3.5-3 14 0 18"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>'
    };
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      (paths[name] || paths.globe) + "</svg>";
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { return url; }
  }

  /* ——— Typewriter (تایپ‌شونده vibefarsi) — روی عنوان هیرو ——— */
  function typewriter(el, text, speed) {
    if (!el || el.dataset.tw) return;
    el.dataset.tw = "1";
    el.setAttribute("aria-label", text);
    var i = 0;
    el.innerHTML = '<span aria-hidden></span><span class="typewriter-cursor" aria-hidden="true"></span>';
    var out = el.querySelector("span");
    (function tick() {
      if (i <= text.length) {
        out.textContent = text.slice(0, i++);
        setTimeout(tick, speed || 70);
      } else {
        el.querySelector(".typewriter-cursor").style.display = "none";
      }
    })();
  }

  /* ——— Counter (شمارنده vibefarsi) — شمارش عدد با easing ——— */
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

  /* ——— BlurText (ظهور تار vibefarsi) — کلمه‌به‌کلمه ——— */
  function blurWords(text, delay) {
    return text.split(" ").map(function (w, i) {
      return '<span class="blur-word" style="animation-delay:' + (i * (delay || 90)) + 'ms">' + esc(w) + "&nbsp;</span>";
    }).join("");
  }

  /* ——— Marquee (نوار متحرک vibefarsi) — نام سایت‌ها ——— */
  function renderMarquee(sites) {
    if (!marqueeBox) return;
    var one = sites.map(function (s) {
      return '<span class="marquee-item">📓 ' + esc(s.name) + "</span>";
    }).join("");
    marqueeBox.innerHTML = '<div class="marquee-row" dir="rtl">' + one + "</div>" +
      '<div class="marquee-row" dir="rtl" aria-hidden="true">' + one + "</div>";
  }

  /* ——— ScrollProgress (پیشرفت خواندن vibefarsi) ——— */
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

  function cardHTML(s, i) {
    var topics = (s.key_topics || s.tags || []).slice(0, 3).map(function (t) {
      return '<span class="topic">' + esc(t) + "</span>";
    }).join("");
    var highlights = (s.highlights || []).slice(0, 3).map(function (h) {
      return "<li>" + esc(h) + "</li>";
    }).join("");
    var stale = s.stale ? '<span class="stale-flag">در انتظار به‌روزرسانی</span>' : "";
    return (
      '<article class="card tilt" style="transition-delay:' + Math.min(i * 60, 420) + 'ms">' +
        '<div class="card-body">' +
          '<div class="card-top">' +
            '<img class="favicon" loading="lazy" alt="" src="' + esc(s.favicon || "") + '" ' +
              'onerror="this.style.display=\'none\'">' +
            '<div>' +
              '<h2 class="card-name">' + blurWords(s.name || "") + "</h2>" +
              '<div class="card-url">' + esc(hostOf(s.url)) + "</div>" +
            "</div>" +
          "</div>" +
          '<div><span class="badge">' + icon("tag") + esc(s.category || "عمومی") + "</span> " +
            '<span class="badge muted">' + icon("globe") + esc(s.sentiment || "") + "</span></div>" +
          '<p class="summary">' + esc(s.summary || "خلاصه‌ای ثبت نشده است.") + "</p>" +
          (highlights ? '<ul class="hl-list">' + highlights + "</ul>" : "") +
          (topics ? '<div class="topics">' + topics + "</div>" : "") +
          '<div class="card-meta">' +
            "<span>" + icon("clock") + esc(s.read_time || "") + "</span>" +
            "<span>" + icon("cal") + esc(s.updated_at || "") + "</span>" + stale +
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
    return state.sites.filter(function (s) {
      var okCat = state.category === "همه" || (s.category || "عمومی") === state.category;
      if (!okCat) return false;
      if (!q) return true;
      var hay = [s.name, s.summary, s.category, (s.tags || []).join(" "),
        (s.key_topics || []).join(" "), (s.highlights || []).join(" ")].join(" ");
      return hay.indexOf(q) !== -1;
    });
  }

  function renderCards() {
    var list = filtered();
    if (!list.length) {
      grid.innerHTML = '<div class="empty">' +
        (state.error ? "خطا در بارگذاری داده‌ها. لطفاً اتصال را بررسی کنید." :
          "موردی با این جست‌وجو پیدا نشد. عبارت دیگری را امتحان کنید.") + "</div>";
      return;
    }
    grid.innerHTML = list.map(cardHTML).join("");
    observeReveals();
    bindSpotlights();
  }

  /* Reveal هنگام اسکرول — نسخه سبک IntersectionObserver */
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

  /* Spotlight دنبال‌گر ماوس روی کارت‌ها + Tilt سه‌بعدی */
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
      grid.innerHTML = '<div class="empty">خطا در بارگذاری داده‌ها. لطفاً صفحه را رفرش کنید.</div>';
    });
})();
