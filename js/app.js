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
      var host = hostOf(s.url);
      return '<span class="marquee-item">' +
        '<img class="marquee-favicon" loading="lazy" alt="" src="https://www.google.com/s2/favicons?domain=' +
          encodeURIComponent(host) + '&sz=64" data-fallback="https://icons.duckduckgo.com/ip3/' +
          encodeURIComponent(host) + '.ico">' +
        esc(s.name) + "</span>";
    }).join("");
    marqueeBox.innerHTML = '<div class="marquee-row" dir="rtl">' + one + "</div>" +
      '<div class="marquee-row" dir="rtl" aria-hidden="true">' + one + "</div>";
    bindFavicons();
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

  /* ——— افکت‌های هیرو: StarsBackground + Meteors + Sparkles + TextScramble (پورت وانیلی vibefarsi) ——— */
  var POOL = "ابپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی";

  function scramble(el, speed) {
    var text = el.getAttribute("data-text") || el.textContent;
    el.setAttribute("data-text", text);
    el.setAttribute("aria-label", text);
    var frame = 0, resolved = 0;
    var chars = Array.from(text);
    var id = setInterval(function () {
      frame += 1;
      if (frame % 2 === 0) resolved += 1;
      el.textContent = chars.map(function (ch, i) {
        if (i < resolved || ch === " " || ch === "‌") return ch;
        return POOL[(frame * 7 + i * 13) % POOL.length];
      }).join("");
      if (resolved >= chars.length) clearInterval(id);
    }, speed || 40);
  }

  function buildHeroFx() {
    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) return;
    var starsBox = document.getElementById("hero-stars");
    if (starsBox) {
      var stars = "";
      for (var i = 0; i < 50; i++) {
        var sz = 1 + (i % 3);
        stars += '<span class="star" style="left:' + ((i * 37) % 100) + "%;top:" + ((i * 53) % 100) +
          "%;width:" + sz + "px;height:" + sz + "px;animation:twinkle " + (2 + ((i * 7) % 5)) +
          "s ease-in-out " + (((i * 11) % 30) / 10) + 's infinite"></span>';
      }
      starsBox.innerHTML = stars;
    }
    var metBox = document.getElementById("hero-meteors");
    if (metBox) {
      var mets = "";
      for (var j = 0; j < 10; j++) {
        var dur = 3 + ((j * 17) % 40) / 10;
        var delay = ((j * 37) % 60) / 10;
        mets += '<span class="meteor" style="left:' + (((j * 53) % 100)) + "%;animation:meteor " +
          dur + "s linear " + delay + 's infinite"><span class="meteor-head"></span></span>';
      }
      metBox.innerHTML = mets;
    }
    var badge = document.querySelector(".hero-inner .badge");
    if (badge) {
      var path = '<path fill="currentColor" d="M12 0c.6 6.9 5.1 11.4 12 12-6.9.6-11.4 5.1-12 12-.6-6.9-5.1-11.4-12-12 6.9-.6 11.4-5.1 12-12z"/>';
      for (var k = 0; k < 7; k++) {
        var r1 = (((k * 9973 + 1 * 7919) % 100) / 100);
        var r2 = (((k * 9973 + 2 * 7919) % 100) / 100);
        var r3 = (((k * 9973 + 3 * 7919) % 100) / 100);
        var r4 = (((k * 9973 + 4 * 7919) % 100) / 100);
        badge.insertAdjacentHTML("beforeend",
          '<svg class="sparkle-star" viewBox="0 0 24 24" aria-hidden="true" style="left:' +
          (r1 * 110 - 5) + "%;top:" + (r2 * 110 - 15) + "%;animation:sparkle " + (1.6 + r3) +
          "s ease-in-out " + (r4 * 2) + 's infinite">' + path + "</svg>");
      }
      var label = badge.childNodes;
      for (var n = 0; n < label.length; n++) {
        if (label[n].nodeType === 3 && label[n].textContent.trim()) {
          var span = document.createElement("span");
          span.textContent = label[n].textContent.trim();
          badge.replaceChild(span, label[n]);
          scramble(span, 35);
          break;
        }
      }
    }
    var search = document.querySelector(".search-wrap");
    if (search) search.classList.add("beam");
  }
  buildHeroFx();

  /* ——— GSAP: hero timeline + TextLoop + ScrollTrigger.batch + parallax (gsap-core/scrolltrigger/react-bits) ——— */
  function initGsapFx() {
    if (!window.gsap) return;
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (window.ScrollTrigger) gsap.registerPlugin(ScrollTrigger);
    } catch (e) {}
    document.body.classList.add("gsap-on");
    gsap.defaults({ duration: 0.7, ease: "power3.out" });
    var mm = gsap.matchMedia ? gsap.matchMedia() : null;

    function heroIntro(onDone) {
      var tl = gsap.timeline({
        defaults: { ease: "power3.out" },
        onComplete: function () {
          gsap.set(".hero-inner .badge, .hero-title, .hero-sub, .stats .stat, .search-wrap",
            { clearProps: "transform,opacity,visibility" });
          if (onDone) onDone();
        }
      });
      tl.from(".hero-inner .badge", { y: -18, autoAlpha: 0, duration: 0.6 })
        .from(".hero-title", { y: 34, autoAlpha: 0, duration: 0.8 }, "-=0.35")
        .from(".hero-sub", { y: 22, autoAlpha: 0, duration: 0.6 }, "-=0.5")
        .from(".stats .stat", { y: 16, autoAlpha: 0, duration: 0.5, stagger: 0.08 }, "-=0.4")
        .from(".search-wrap", { y: 18, autoAlpha: 0, duration: 0.6 }, "-=0.35");
      /* چتر نجات: اگه rAF گیر کرد (تب بک‌گراند)، بعد ۳ ثانیه همه رو وانیلی نشون بده */
      setTimeout(function () {
        if (!tl.isActive() && tl.progress() === 1) return;
        tl.kill();
        var els = document.querySelectorAll(".hero-inner .badge, .hero-title, .hero-sub, .stats .stat, .search-wrap");
        for (var i = 0; i < els.length; i++) {
          els[i].style.opacity = "1";
          els[i].style.visibility = "visible";
          els[i].style.transform = "none";
        }
      }, 3000);
      return tl;
    }

    /* TextLoop وانیلی (react-bits) — عمودی تا با RTL نسازد؛ ارتفاع ثابت ضد CLS */
    function heroLoop() {
      var el = document.getElementById("hero-loop-word");
      if (!el) return;
      var words = ["خلاصه", "نکته", "ترند", "ایده"];
      var i = 0;
      el.textContent = words[0];
      setInterval(function () {
        if (gsap.isTweening(el)) return;
        gsap.to(el, {
          y: -14, autoAlpha: 0, duration: 0.3, ease: "power2.in",
          onComplete: function () {
            i = (i + 1) % words.length;
            el.textContent = words[i];
            gsap.fromTo(el, { y: 14, autoAlpha: 0 }, { y: 0, autoAlpha: 1, duration: 0.35, ease: "power2.out" });
          }
        });
      }, 2600);
    }

    if (mm) {
      mm.add({ reduceMotion: "(prefers-reduced-motion: reduce)", all: "(min-width: 0px)" }, function (ctx) {
        if (ctx.conditions && ctx.conditions.reduceMotion) return;
        /* تب مخفی/بک‌گراند: rAF نمی‌تickد و from() با immediateRender محتوا رو مخفی نگه می‌داره —
           پس انیمیشن رو فقط وقتی تب واقعاً دیده میشه اجرا کن، وگرنه همه‌چی visible می‌مونه */
        if (document.visibilityState === "visible") {
          heroIntro(heroLoop);
        } else {
          var onVis = function () {
            if (document.visibilityState === "visible") {
              document.removeEventListener("visibilitychange", onVis);
              heroIntro(heroLoop);
            }
          };
          document.addEventListener("visibilitychange", onVis);
          /* اگه تا ۵ ثانیه visible نشد، حلقه کلمه رو بدون اینترودو شروع کن */
          setTimeout(function () {
            if (document.visibilityState !== "visible") {
              document.removeEventListener("visibilitychange", onVis);
              heroLoop();
            }
          }, 5000);
        }
        return function () {};
      });
    } else {
      heroIntro(heroLoop);
    }

    /* پارالاکس aurora با scrub — فقط دسکتاپ */
    if (window.ScrollTrigger && mm) {
      mm.add("(min-width: 800px)", function () {
        gsap.to(".aurora", {
          yPercent: 14, ease: "none",
          scrollTrigger: { trigger: ".hero", start: "top top", end: "bottom top", scrub: 0.6 }
        });
      });
      /* ورود دسته‌ای کارت‌ها — جایگزین سبک IO وقتی GSAP هست */
      if (ScrollTrigger.batch) {
        ScrollTrigger.batch(".card", {
          start: "top 88%",
          once: true,
          onEnter: function (batch) {
            gsap.fromTo(batch,
              { y: 36, autoAlpha: 0 },
              { y: 0, autoAlpha: 1, duration: 0.7, ease: "power3.out", stagger: 0.08, overwrite: true, clearProps: "transform" });
          }
        });
      }
    }
  }
  initGsapFx();

  /* ——— دکمه مغناطیسی وانیلی (react-bits magnetic-button) ——— */
  function bindMagnetic() {
    if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    grid.addEventListener("pointermove", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".visit") : null;
      if (!btn) return;
      var r = btn.getBoundingClientRect();
      var dx = e.clientX - (r.left + r.width / 2);
      var dy = e.clientY - (r.top + r.height / 2);
      btn.style.transform = "translate(" + (dx * 0.08).toFixed(1) + "px," + (dy * 0.12).toFixed(1) + "px)";
    });
    grid.addEventListener("pointerout", function (e) {
      var btn = e.target && e.target.closest ? e.target.closest(".visit") : null;
      if (btn) btn.style.transform = "";
    });
  }
  bindMagnetic();

  /* ——— Blobatar وانیلی (zero-dep): آواتار هندسی قطعی از روی seed ——— */
  function blobHash(str) {
    var h = 0;
    str = String(str == null ? "?" : str);
    for (var i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(h);
  }
  function blobFace(expr) {
    var eye = '<circle cx="15" cy="18" r="2.6" fill="#fff"/><circle cx="29" cy="18" r="2.6" fill="#fff"/>';
    if (expr === 1) eye = '<circle cx="15" cy="18" r="2.6" fill="#fff"/><path d="M26 18h6" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>';
    if (expr === 3) eye = '<path d="M12 18q3 2.4 6 0M26 18q3 2.4 6 0" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round"/>';
    var shades = '<g fill="#fff" opacity="0.92"><rect x="11" y="13.5" width="10" height="8" rx="2.5"/><rect x="23" y="13.5" width="10" height="8" rx="2.5"/><rect x="20" y="16" width="4" height="2.4" rx="1.2"/></g>';
    var mouth = '<path d="M15 28q7 6 14 0" stroke="#fff" stroke-width="2.6" fill="none" stroke-linecap="round"/>';
    if (expr === 3) mouth = '<circle cx="22" cy="29" r="2.4" stroke="#fff" stroke-width="2.4" fill="none"/>';
    return '<svg viewBox="0 0 44 44" aria-hidden="true">' + (expr === 2 ? shades + mouth : eye + mouth) + "</svg>";
  }
  function blobatarHTML(seed) {
    var h = blobHash(seed);
    var hue = h % 360, hue2 = (hue + 40) % 360;
    var shapes = ["50%", "26%", "38% 62% 55% 45% / 45% 42% 58% 55%"];
    return '<span class="favicon-blob" aria-hidden="true" style="background:linear-gradient(135deg,hsl(' +
      hue + ',60%,46%),hsl(' + hue2 + ',62%,34%));border-radius:' + shapes[h % 3] + '">' +
      blobFace((h >> 3) % 4) + "</span>";
  }

  /* ——— Favicon fallback چندلایه (گوگل → داکرداک → Blobatar) ——— */
  function faviconStack(url, name) {
    var host = "";
    try { host = new URL(url).hostname.replace(/^www\./, ""); }
    catch (e) { host = url; }
    var g = "https://www.google.com/s2/favicons?domain=" + encodeURIComponent(host) + "&sz=128";
    var d = "https://icons.duckduckgo.com/ip3/" + encodeURIComponent(host) + ".ico";
    return (
      '<span class="favicon-wrap">' +
        '<img class="favicon" loading="lazy" alt="" src="' + g + '" ' +
          'data-fallback="' + d + '">' +
        blobatarHTML(name || host) +
      "</span>"
    );
  }

  /* ——— همه فاوآیکون‌ها را بعد از رندر مقید کن ——— */
  function bindFavicons() {
    document.querySelectorAll(".favicon[data-fallback], .marquee-favicon[data-fallback]").forEach(function (img) {
      if (img.dataset.bound) return;
      img.dataset.bound = "1";
      img.addEventListener("error", function () {
        if (img.dataset.tried === "1") {
          img.remove();
          var sib = img.parentElement.querySelector(".favicon-blob");
          if (sib) sib.style.display = "flex";
          return;
        }
        img.dataset.tried = "1";
        img.src = img.dataset.fallback;
      });
    });
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
    bindFavicons();
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
        card.style.setProperty("--ry", (px * 14).toFixed(2) + "deg");
        card.style.setProperty("--rx", (py * -14).toFixed(2) + "deg");
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

  var WORKER_API = "https://site-summarizer-api.armin13891219.workers.dev/api";

  function fetchPublicData() {
    return fetch(WORKER_API + "/data?cache=no", { cache: "no-store" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .catch(function (e) {
        /* fallback: اگه ورکر خواب بود، دیتای کامیت‌شده لوکال رو بخون */
        return fetch("data/sites.json", { cache: "no-store" }).then(function (r2) {
          if (!r2.ok) throw e;
          return r2.json();
        });
      });
  }

  fetchPublicData()
    .then(function (data) {
      state.sites = data.sites || [];
      state.meta = data.meta || null;
      counter(statSites.querySelector("b"), state.sites.length, 1400);
      var lu = (state.meta && state.meta.last_updated) || "";
      try {
        var d = new Date(lu);
        if (!isNaN(d)) lu = d.toLocaleDateString("fa-IR") + " " + d.toLocaleTimeString("fa-IR", { hour: "2-digit", minute: "2-digit" });
      } catch (e) {}
      statUpdated.innerHTML = "به‌روزرسانی: <b>" + esc(lu || "—") + "</b>";
      if (hl) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () { hl.classList.add("on"); });
        });
      }
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
