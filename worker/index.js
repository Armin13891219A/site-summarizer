/**
 * دفتر یادداشت هوشمند — Cloudflare Worker API
 * جایگزین GitHub API: سریع، بدون rate-limit، بدون ارور ۴۰۹
 */

const REPO = "Armin13891219A/site-summarizer";

const JSON_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Cache-Control": "no-store, no-cache, must-revalidate",
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: JSON_HEADERS,
  });
}

/** توکن ادمین رو بررسی کن */
function isAdmin(request, env) {
  const auth = request.headers.get("Authorization") || "";
  const token = auth.replace(/^Bearer\s+/i, "").trim();
  return token && token === env.ADMIN_TOKEN;
}

/** میدلویر CORS */
function handleOptions() {
  return new Response(null, { status: 204, headers: JSON_HEADERS });
}

/** تبدیل ردیف D1 به آبجکت سایت */
function rowToSite(r) {
  if (!r) return null;
  let tags = [], highlights = [], keyTopics = [];
  try { tags = JSON.parse(r.tags || "[]"); } catch (e) {}
  try { highlights = JSON.parse(r.highlights || "[]"); } catch (e) {}
  try { keyTopics = JSON.parse(r.key_topics || "[]"); } catch (e) {}
  return {
    id: r.id,
    url: r.url,
    name: r.name,
    category: r.category,
    tags,
    favicon: r.favicon,
    summary: r.summary,
    highlights,
    sentiment: r.sentiment,
    key_topics: keyTopics,
    read_time: r.read_time,
    provider: r.provider,
    stale: r.stale === 1,
    updated_at: r.updated_at,
  };
}

/** داده‌های عمومی برای سایت */
async function handlePublicData(env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM sites ORDER BY updated_at DESC"
  ).all();
  const settings = await env.DB.prepare(
    "SELECT key, value FROM settings"
  ).all();
  const meta = await env.DB.prepare("SELECT key, value FROM meta").all();

  const settingsObj = {};
  for (const s of settings.results || []) settingsObj[s.key] = s.value;
  const metaObj = {};
  for (const m of meta.results || []) metaObj[m.key] = m.value;

  return json({
    meta: {
      title: "داشبورد هوشمند خلاصه‌ساز وب‌سایت‌ها",
      last_updated: metaObj.last_updated || "",
      total_sites: String((rows.results || []).length),
      generator: "multi-provider AI + Cloudflare Workers",
      version: "2.0.0",
    },
    settings: settingsObj,
    sites: (rows.results || []).map(rowToSite),
  });
}

/** لیست سایت‌ها (ادمین) */
async function handleListSites(env) {
  const rows = await env.DB.prepare(
    "SELECT * FROM sites ORDER BY created_at ASC"
  ).all();
  return json({ sites: (rows.results || []).map(rowToSite) });
}

/** حدس دسته از روی متن (سبک، بدون AI) */
function guessCategory(blob) {
  const low = (blob || "").toLowerCase();
  if (!low) return "عمومی";
  const hints = [
    ["هوش مصنوعی", ["ai", "artificial intelligence", "machine learning", "هوش مصنوعی", "یادگیری ماشین", "مدل زبانی"]],
    ["توسعه نرم‌افزار", ["code", "programming", "developer", "software", "github", "api", "sdk", "react", "python", "javascript", "css", "framework", "frontend", "front-end", "library", "فرانت‌اند", "کتابخانه", "برنامه‌نویسی", "توسعه", "متن‌باز"]],
    ["امنیت سایبری", ["security", "cyber", "hack", "vulnerability", "امنیت", "نفوذ"]],
    ["سخت‌افزار و موبایل", ["phone", "mobile", "laptop", "hardware", "gpu", "گوشی", "موبایل", "سخت‌افزار"]],
    ["استارتاپ و سرمایه‌گذاری", ["startup", "funding", "investment", "استارتاپ", "سرمایه‌گذاری"]],
    ["بازی", ["game", "gaming", "بازی", "گیم"]],
    ["طراحی و خلاقیت", ["design", "creative", "ui", "ux", "graphic", "طراحی", "خلاقیت", "گرافیک"]],
    ["علم و دانش", ["science", "research", "academic", "علم", "پژوهش", "دانشگاه"]],
    ["فناوری و کسب‌وکار", ["business", "enterprise", "saas", "کسب‌وکار", "سرویس", "platform", "فروشگاه", "فروش", "shop", "store", "خرید", "market", "قیمت", "تخفیف", "سفارش"]],
    ["فرهنگ دیجیتال و رسانه", ["news", "media", "culture", "خبر", "رسانه", "فرهنگ", "مجله"]],
    ["فناوری", ["tech", "technology", "digital", "فناوری", "تکنولوژی", "دیجیتال"]],
  ];
  let best = "عمومی", bestScore = 0;
  for (const [cat, kws] of hints) {
    let score = 0;
    for (const kw of kws) {
      if (kw.length <= 3) {
        // کلمات کوتاه فقط با مرز کلمه (مثلاً ai داخل tailwind مچ نشود)
        try {
          if (new RegExp("(?<![a-zآ-ی])" + kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "(?![a-zآ-ی])").test(low)) score++;
        } catch (e) { if (low.includes(kw)) score++; }
      } else if (low.includes(kw)) score++;
    }
    if (score > bestScore) { bestScore = score; best = cat; }
  }
  return best;
}

/** استخراج title/description + حدس نام و دسته — سبک، با timeout کوتاه */
async function quickMeta(url) {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; site-summarizer/1.0)" },
      redirect: "follow",
    });
    clearTimeout(t);
    if (!res.ok) return null;
    const html = await res.text();
    const pick = (re) => {
      const m = html.match(re);
      return m ? m[1].trim().slice(0, 120) : "";
    };
    const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i)
      || pick(/<title[^>]*>([^<]+)<\/title>/i);
    const desc = pick(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)
      || pick(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i);
    return { title, desc };
  } catch (e) {
    return null;
  }
}

/** استخراج چند تگ از کلمات عنوان (فقط فوری، CI دقیق‌ترش می‌کند) */
function quickTags(title, name) {
  const stop = new Set(["و", "در", "از", "به", "با", "است", "که", "این", "برای", "را", "های", "یا", "تا", "نه", "اما", "بر", "شد", "شده", "the", "and", "for", "with", "from", "your"]);
  const words = (title || "").split(/[\s|،,؛:()«»"'-]+/).filter((w) => w.length >= 3 && !stop.has(w.toLowerCase()));
  const tags = [];
  for (const w of words) {
    if (tags.length >= 3) break;
    if (!tags.includes(w)) tags.push(w);
  }
  return tags.length ? tags : [name];
}

/** افزودن سایت */
async function handleAddSite(request, env) {
  const body = await request.json().catch(() => ({}));
  const url = (body.url || "").trim();
  if (!url || !/^https?:\/\//.test(url)) {
    return json({ error: "آدرس باید با http(s):// شروع شود." }, 400);
  }

  const existing = await env.DB.prepare("SELECT id FROM sites WHERE url = ?")
    .bind(url)
    .first();
  if (existing) return json({ error: "این سایت قبلاً اضافه شده." }, 409);

  let host = url;
  try { host = new URL(url).hostname; } catch (e) {}

  const id = (body.id || host).replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  // نام/دسته/تگ فوری از متای صفحه (بدون انتظار برای CI)
  let name = (body.name || "").trim();
  let category = (body.category || "").trim();
  let tags = body.tags || [];
  if (!body.name || !body.category) {
    const meta = await quickMeta(url);
    if (meta) {
      if (!name) {
        name = meta.title
          ? meta.title.split(/[|–—»-]/)[0].trim().slice(0, 60)
          : host.replace(/^www\./, "").split(".")[0];
      }
      if (!category) category = guessCategory(meta.title + " " + meta.desc);
      if (!tags.length && name) tags = quickTags(meta.title, name);
    }
  }
  if (!name) name = host;
  if (!category) category = "عمومی";

  await env.DB.prepare(
    `INSERT INTO sites (id, url, name, category, tags, favicon, summary, highlights, sentiment, key_topics, read_time, provider, stale, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))`
  )
    .bind(
      id, url, name,
      category,
      JSON.stringify(tags),
      `https://www.google.com/s2/favicons?domain=${host}&sz=128`,
      body.summary || "در حال تولید خلاصه…",
      JSON.stringify(body.highlights || []),
      body.sentiment || "اطلاع‌رسانی",
      JSON.stringify(body.key_topics || (body.tags || [])),
      body.read_time || "۳ دقیقه",
      body.provider || "pending"
    )
    .run();

  await touchMeta(env);
  // config/sites.json رو در گیت‌هاب commit کن + ورک‌فلو رو روشن کن
  await syncConfigToGitHub(env);
  await dispatchWorkflow(env);
  return json({ ok: true, id, url, name });
}

/** حذف سایت */
async function handleDeleteSite(env, id) {
  await env.DB.prepare("DELETE FROM sites WHERE id = ?").bind(id).run();
  await touchMeta(env);
  await syncConfigToGitHub(env);
  await dispatchWorkflow(env);
  return json({ ok: true, id });
}

/** همگام‌سازی config/sites.json با گیت‌هاب (push trigger) */
async function syncConfigToGitHub(env) {
  if (!env.GITHUB_TOKEN) return; // اگر توکن تنظیم نشده، رد شو
  const rows = await env.DB.prepare(
    "SELECT id, url, name, category, tags FROM sites ORDER BY created_at ASC"
  ).all();
  const cfg = (rows.results || []).map((r) => ({
    id: r.id, url: r.url, name: r.name,
    category: r.category || "عمومی",
    tags: JSON.parse(r.tags || "[]"),
  }));

  const apiBase = "https://api.github.com/repos/" + REPO;
  const headers = {
    Authorization: "token " + env.GITHUB_TOKEN,
    Accept: "application/vnd.github+json",
    "User-Agent": "site-summarizer-worker",
    "Content-Type": "application/json; charset=utf-8",
  };

  // SHA فعلی فایل
  let sha = null;
  try {
    const res = await fetch(apiBase + "/contents/config/sites.json", { headers });
    if (res.ok) sha = (await res.json()).sha;
  } catch (e) {}

  const content = btoa(unescape(encodeURIComponent(JSON.stringify(cfg, null, 2))));
  await fetch(apiBase + "/contents/config/sites.json", {
    method: "PUT",
    headers,
    body: JSON.stringify({
      message: "chore: sync sites from Worker " + new Date().toISOString().slice(0, 10),
      content, sha, branch: "main",
    }),
  });
}

/** روشن کردن ورک‌فلو خلاصه‌ساز */
async function dispatchWorkflow(env, force) {
  if (!env.GITHUB_TOKEN) return;
  try {
    const res = await fetch(
      "https://api.github.com/repos/" + REPO + "/actions/workflows/summarize.yml/dispatches",
      {
        method: "POST",
        headers: {
          Authorization: "token " + env.GITHUB_TOKEN,
          Accept: "application/vnd.github+json",
          "User-Agent": "site-summarizer-worker",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ ref: "main", inputs: { force: force ? "true" : "false" } }),
      }
    );
    if (!res.ok) console.error("dispatch failed:", res.status);
  } catch (e) {}
}

/** ویرایش سایت */
async function handleUpdateSite(request, env, id) {
  const body = await request.json().catch(() => ({}));
  const fields = ["name", "category", "summary", "sentiment", "read_time", "provider", "favicon"];
  const sets = [];
  const values = [];
  for (const f of fields) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      values.push(body[f]);
    }
  }
  if (body.tags !== undefined) { sets.push("tags = ?"); values.push(JSON.stringify(body.tags)); }
  if (body.highlights !== undefined) { sets.push("highlights = ?"); values.push(JSON.stringify(body.highlights)); }
  if (body.key_topics !== undefined) { sets.push("key_topics = ?"); values.push(JSON.stringify(body.key_topics)); }
  if (body.stale !== undefined) { sets.push("stale = ?"); values.push(body.stale ? 1 : 0); }

  if (!sets.length) return json({ error: "چیزی برای به‌روزرسانی نیست." }, 400);
  sets.push("updated_at = datetime('now')");
  values.push(id);

  await env.DB.prepare(`UPDATE sites SET ${sets.join(", ")} WHERE id = ?`)
    .bind(...values)
    .run();
  await touchMeta(env);
  return json({ ok: true });
}

/** به‌روزرسانی متا */
async function touchMeta(env) {
  const c = await env.DB.prepare("SELECT COUNT(*) as n FROM sites").first();
  await env.DB.prepare(
    "INSERT OR REPLACE INTO meta (key, value) VALUES ('total_sites', ?), ('last_updated', ?)"
  )
    .bind(String(c.n || 0), new Date().toISOString())
    .run();
}

/** تنظیمات */
async function handleGetSettings(env) {
  const rows = await env.DB.prepare("SELECT key, value FROM settings").all();
  const obj = {};
  for (const r of rows.results || []) obj[r.key] = r.value;
  return json(obj);
}

async function handleSaveSettings(request, env) {
  const body = await request.json().catch(() => ({}));
  const stmts = [];
  for (const [key, value] of Object.entries(body)) {
    stmts.push(
      env.DB.prepare(
        "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)"
      ).bind(key, typeof value === "object" ? JSON.stringify(value) : String(value))
    );
  }
  if (stmts.length) await env.DB.batch(stmts);
  return json({ ok: true });
}

/** مسیریابی */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");
    const method = request.method;

    if (method === "OPTIONS") return handleOptions();

    // ——— مسیرهای عمومی (بدون توکن) ———
    if (path === "/api/data" && method === "GET") return handlePublicData(env);
    if (path === "/api/sites" && method === "GET") return handlePublicData(env);
    if (path === "/api/sites" && method === "POST") {
      if (!isAdmin(request, env)) return json({ error: "توکن ادمین لازم است." }, 401);
      return handleAddSite(request, env);
    }

    // ——— مسیرهای ادمین ———
    if (!isAdmin(request, env)) return json({ error: "توکن ادمین لازم است." }, 401);

    // /api/sites/:id
    const siteMatch = path.match(/^\/api\/sites\/([^/]+)$/);
    if (siteMatch) {
      const id = decodeURIComponent(siteMatch[1]);
      if (method === "PUT") return handleUpdateSite(request, env, id);
      if (method === "DELETE") return handleDeleteSite(env, id);
    }

    if (path === "/api/settings") {
      if (method === "GET") return handleGetSettings(env);
      if (method === "PUT" || method === "POST") return handleSaveSettings(request, env);
    }

    if (path === "/api/admin/list") return handleListSites(env);

    // بازتولید همه خلاصه‌ها (force=true → ignore cache)
    if (path === "/api/refresh" && method === "POST") {
      const body = await request.json().catch(() => ({}));
      await dispatchWorkflow(env, !!body.force);
      return json({ ok: true, force: !!body.force });
    }

    return json({ error: "مسیر پیدا نشد.", path }, 404);
  },
};
