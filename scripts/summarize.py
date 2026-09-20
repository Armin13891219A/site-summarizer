#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Website AI Summarizer — Multi-provider (g4f / Google AI Studio / OpenRouter)
استخراج خودکار محتوا + خلاصه فارسی + نکات کلیدی + دسته‌بندی هوشمند.

Modes:
  python summarize.py                      # پردازش config/sites.json
  python summarize.py --add https://site   # scrape + دسته‌بندی خودکار + افزودن + خلاصه
  python summarize.py --force              # بازتولید همه خلاصه‌ها

Providers و مدل‌ها از config/settings.json خوانده می‌شوند (قابل ویرایش از پنل ادمین).
کلیدهای API از متغیرهای محیطی (GitHub Actions Secrets) خوانده می‌شوند.
"""

import os
import sys
import json
import re
import time
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Warning: requests or beautifulsoup4 not found.")

try:
    from g4f.client import Client as G4FClient
    G4F_AVAILABLE = True
except ImportError:
    G4F_AVAILABLE = False
    print("Warning: g4f not installed.")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
CONFIG_FILE = os.path.join(PROJECT_ROOT, "config", "sites.json")
SETTINGS_FILE = os.path.join(PROJECT_ROOT, "config", "settings.json")
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "data", "sites.json")

GOOGLE_API_KEY = os.environ.get("GOOGLE_API_KEY", "").strip()
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY", "").strip()

# طول زیادی مجاز خلاصه (نهایتاً ۴ خط)
SUMMARY_MAX_CHARS = 180

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
}


# ——————————————————————————————————————————————————————
#  تنظیمات (config/settings.json) — قابل ویرایش از پنل ادمین
# ——————————————————————————————————————————————————————
DEFAULT_SETTINGS = {
    "provider": "g4f",
    "g4f_models": ["gpt-4", "gpt-4o", "deepseek-chat", "llama-3.1-70b", "gpt-3.5-turbo"],
    "google_model": "gemini-1.5-flash",
    "openrouter_model": "google/gemini-2.0-flash-exp:free",
    "summary_max_chars": 180,
}


def load_settings():
    """تنظیمات را از فایل می‌خواند؛ در نبود فایل از مقادیر پیش‌فرض استفاده می‌کند."""
    settings = dict(DEFAULT_SETTINGS)
    try:
        with open(SETTINGS_FILE, "r", encoding="utf-8") as f:
            user = json.load(f)
        if isinstance(user, dict):
            for k in DEFAULT_SETTINGS:
                if k in user and user[k] not in (None, "", []):
                    settings[k] = user[k]
    except Exception:
        pass
    return settings


SETTINGS = load_settings()


# ——————————————————————————————————————————————————————
#  Provider layer — g4f (رایگان) / Google AI Studio / OpenRouter
# ——————————————————————————————————————————————————————
def _chat_g4f(prompt):
    if not G4F_AVAILABLE:
        raise RuntimeError("g4f not installed")
    client = G4FClient()
    last_err = None
    for model in SETTINGS["g4f_models"]:
        try:
            print(f"  -> g4f / {model}")
            resp = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                timeout=45,
            )
            content = resp.choices[0].message.content
            if content and content.strip():
                return content.strip()
        except Exception as e:
            last_err = e
            print(f"  [-] {model} failed ({type(e).__name__})")
            time.sleep(1)
    raise RuntimeError("all g4f models failed: " + str(last_err))


def _chat_google(prompt):
    if not GOOGLE_API_KEY:
        raise RuntimeError("GOOGLE_API_KEY not set")
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           + SETTINGS["google_model"] + ":generateContent?key=" + GOOGLE_API_KEY)
    payload = json.dumps({
        "contents": [{"parts": [{"text": prompt}]}],
        "generationConfig": {"temperature": 0.7, "maxOutputTokens": 1200},
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    try:
        return data["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception:
        raise RuntimeError("google parse failed: " + str(data)[:200])


def _chat_openrouter(prompt):
    if not OPENROUTER_API_KEY:
        raise RuntimeError("OPENROUTER_API_KEY not set")
    url = "https://openrouter.ai/api/v1/chat/completions"
    payload = json.dumps({
        "model": SETTINGS["openrouter_model"],
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.7,
        "max_tokens": 1200,
    }).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={
        "Content-Type": "application/json",
        "Authorization": "Bearer " + OPENROUTER_API_KEY,
        "HTTP-Referer": "https://github.com/Armin13891219A/site-summarizer",
    })
    with urllib.request.urlopen(req, timeout=60) as r:
        data = json.loads(r.read().decode("utf-8"))
    try:
        return data["choices"][0]["message"]["content"].strip()
    except Exception:
        raise RuntimeError("openrouter parse failed: " + str(data)[:200])


PROVIDERS = {"g4f": _chat_g4f, "google": _chat_google, "openrouter": _chat_openrouter}


def _available_providers():
    out = []
    if G4F_AVAILABLE:
        out.append("g4f")
    if GOOGLE_API_KEY:
        out.append("google")
    if OPENROUTER_API_KEY:
        out.append("openrouter")
    return out


def _clamp_summary(text):
    """خلاصه را به نهایتاً ۴ خط (حدود ۱۸۰ کاراکتر) محدود می‌کند."""
    t = (text or "").strip()
    if len(t) <= SUMMARY_MAX_CHARS:
        return t
    cut = t[:SUMMARY_MAX_CHARS]
    sp = cut.rfind(" ")
    if sp > 40:
        cut = cut[:sp]
    return cut.rstrip(" ،,.") + "."


# ——————————————————————————————————————————————————————
#  Scraping
# ——————————————————————————————————————————————————————
def extract_favicon(soup, base_url):
    parsed = urlparse(base_url)
    domain = parsed.netloc
    icon_link = soup.find("link", rel=lambda r: r and ("icon" in r.lower() or "apple-touch-icon" in r.lower()))
    if icon_link and icon_link.get("href"):
        href = icon_link["href"]
        if href.startswith("//"):
            return f"{parsed.scheme}:{href}"
        elif href.startswith("/"):
            return f"{parsed.scheme}://{domain}{href}"
        elif href.startswith("http"):
            return href
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=128"


def scrape_website(url):
    """دریافت صفحه و استخراج عنوان، توضیحات، کلیدواژه‌ها و متن تمیز."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, verify=False)
        resp.encoding = resp.apparent_encoding or "utf-8"
        html = resp.text
    except Exception as e:
        print(f"[-] Error fetching {url}: {e}")
        return None

    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "aside", "svg", "form", "iframe"]):
        tag.decompose()

    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    description = ""
    meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    if meta_desc and meta_desc.get("content"):
        description = meta_desc["content"].strip()

    keywords = ""
    meta_kw = soup.find("meta", attrs={"name": "keywords"})
    if meta_kw and meta_kw.get("content"):
        keywords = meta_kw["content"].strip()

    favicon = extract_favicon(soup, url)

    paragraphs = []
    for p in soup.find_all(["p", "h1", "h2", "h3", "article", "section"]):
        text = p.get_text(separator=" ", strip=True)
        if len(text) > 35 and not any(skip in text.lower() for skip in ["cookie", "privacy policy", "copyright", "حقوق محفوظ"]):
            paragraphs.append(text)

    full_text = " ".join(paragraphs).strip()

    # سایت‌های JS-heavy: استفاده از متا + لینک‌ها
    if len(full_text) < 120:
        link_texts = []
        for a in soup.find_all("a", href=True):
            t = a.get_text(separator=" ", strip=True)
            if 3 < len(t) < 80:
                link_texts.append(t)
        nav_text = " | ".join(dict.fromkeys(link_texts))[:1200]
        meta_blob = " ".join(x for x in [title, description, keywords, nav_text] if x).strip()
        if len(meta_blob) > len(full_text):
            print(f"  [~] Thin body ({len(full_text)} chars) — using metadata ({len(meta_blob)} chars).")
            full_text = meta_blob
        elif not full_text:
            full_text = meta_blob

    return {
        "title": title,
        "description": description,
        "keywords": keywords,
        "favicon": favicon,
        "text": full_text[:2500].strip(),
    }


# ——————————————————————————————————————————————————————
#  AI summarization
# ——————————————————————————————————————————————————————
def clean_json_response(raw_text):
    raw_text = (raw_text or "").strip()
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    if match:
        raw_text = match.group(1)
    else:
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start != -1 and end != -1:
            raw_text = raw_text[start:end + 1]
    try:
        return json.loads(raw_text)
    except Exception:
        return None


def _build_prompt(site_info, site_meta, auto=False):
    auto_block = ""
    if auto:
        auto_block = """
  "suggested_category": "یک دسته‌بندی کوتاه فارسی از: فناوری، هوش مصنوعی، توسعه نرم‌افزار، فناوری و کسب‌وکار، استارتاپ و سرمایه‌گذاری، فرهنگ دیجیتال و رسانه، سخت‌افزار و موبایل، امنیت سایبری، طراحی و خلاقیت، بازی، علم و دانش، عمومی",
  "suggested_tags": ["تگ اول", "تگ دوم", "تگ سوم"],
"""
    return f"""شما یک تحلیلگر و خلاصه‌ساز ارشد رسانه‌ها و وب‌سایت‌ها هستید.
اطلاعات زیر از یک وب‌سایت استخراج شده است:
نام سایت: {site_meta.get('name', '')}
آدرس: {site_meta.get('url', '')}
عنوان صفحه: {site_info.get('title', '')}
توضیحات متادیتا: {site_info.get('description', '')}
کلیدواژه‌ها: {site_info.get('keywords', '')}

متن استخراج شده از سایت:
{site_info.get('text', '')[:2000]}

وظیفه شما:
یک خلاصه دقیق، جذاب و روان به زبان فارسی بسازید.
خلاصه باید نهایتاً ۴ خط (حدود ۱۸۰ کاراکتر) باشد.
خروجی باید دقیقاً یک JSON معتبر بدون هیچ متن دیگری باشد:
{{
  "summary": "خلاصه جامع ۳ تا ۴ جمله کوتاه — حداکثر ۱۸۰ کاراکتر",
  "highlights": ["نکته کلیدی اول", "نکته کلیدی دوم", "نکته کلیدی سوم"],
  "sentiment": "لحن و حوزه فعالیت",
  "key_topics": ["موضوع ۱", "موضوع ۲", "موضوع ۳"],{auto_block}
  "read_time": "زمان تخمینی مطالعه (مثلاً: ۳ دقیقه)"
}}
"""


def summarize_with_ai(site_info, site_meta, auto=False):
    """ارسال به provider فعال و دریافت خلاصه ساختاریافته فارسی."""
    prompt = _build_prompt(site_info, site_meta, auto=auto)

    chosen = SETTINGS.get("provider", "g4f")
    available = _available_providers()
    if not available:
        print("  [!] No provider available — using fallback extractor.")
        return fallback_extractive_summary(site_info, site_meta)

    # provider انتخابی اول، بقیه به‌عنوان پشتیبان
    attempts = [chosen] if chosen in available else []
    for p in available:
        if p not in attempts:
            attempts.append(p)

    last_err = None
    for p in attempts:
        try:
            print(f"  -> provider: {p}")
            content = PROVIDERS[p](prompt)
            parsed = clean_json_response(content)
            if parsed and parsed.get("summary"):
                print(f"  [+] Summary generated with {p}")
                parsed["summary"] = _clamp_summary(parsed["summary"])
                parsed["provider"] = p
                return parsed
            raise RuntimeError("empty summary")
        except Exception as e:
            last_err = e
            print(f"  [-] {p} failed: {type(e).__name__}: {e}")
            time.sleep(1)

    print("  [!] All providers failed — using fallback extractor.")
    return fallback_extractive_summary(site_info, site_meta)


def fallback_extractive_summary(site_info, site_meta):
    """خلاصه استخراجی هوشمند وقتی هیچ provider ای در دسترس نیست."""
    desc = site_info.get("description", "").strip()
    title = site_info.get("title", "").strip()
    name = site_meta.get("name", "این وب‌سایت")
    category = site_meta.get("category", "وب")

    if desc and len(desc) > 40:
        summary_text = f"{name} در حوزه {category} فعالیت دارد. {desc}"
    elif title:
        summary_text = f"{name} پایگاهی تخصصی با عنوان «{title}» است که محتوای مرتبط با {category} ارائه می‌دهد."
    else:
        summary_text = f"{name} یکی از مراجع فعال در حوزه {category} است که به انتشار به‌روزترین مطالب می‌پردازد."

    tags = site_meta.get("tags", ["فناوری", "وب", "خدمات آنلاین"])
    return {
        "summary": _clamp_summary(summary_text),
        "highlights": [
            f"ارائه محتوا و سرویس‌های تخصصی در حوزه {category}",
            f"دسترسی مستقیم از طریق {site_meta.get('url', '')}",
            "پوشش تازه‌ترین عناوین و موضوعات دسته‌بندی‌شده",
        ],
        "sentiment": "تخصصی و اطلاع‌رسانی",
        "key_topics": tags[:3],
        "read_time": "۲ دقیقه",
        "provider": "fallback",
    }


# ——————————————————————————————————————————————————————
#  دسته‌بندی خودکار — نام/دسته/تگ فقط از روی محتوا
# ——————————————————————————————————————————————————————
def _slugify(url):
    host = urlparse(url).hostname or "site"
    if host.startswith("www."):
        host = host[4:]
    return re.sub(r"[^a-zA-Z0-9-]", "-", host.split("/")[0]).replace("--", "-").lower()[:40]


def _pretty_name(scraped, url):
    """ساخت نام نمایشی مناسب از عنوان صفحه یا دامنه."""
    t = (scraped.get("title") or "").strip()
    if t:
        t = re.sub(r"\s*[|\-–—»]\s*.*$", "", t)
        t = t.strip()
        if 2 < len(t) <= 60:
            return t
        if len(t) > 60:
            return t[:57].rstrip() + "…"
    host = urlparse(url).hostname or url
    if host.startswith("www."):
        host = host[4:]
    return host.split(".")[0].capitalize()


CATEGORY_HINTS = [
    ("هوش مصنوعی", ["ai", "artificial intelligence", "machine learning", "neural", "gpt", "llm", "هوش مصنوعی", "یادگیری ماشین", "مدل زبانی"]),
    ("توسعه نرم‌افزار", ["code", "programming", "developer", "software", "github", "api", "sdk", "react", "python", "javascript", "برنامه‌نویسی", "توسعه", "کد", "متن‌باز"]),
    ("امنیت سایبری", ["security", "cyber", "hack", "vulnerability", "pentest", "امنیت", "نفوذ"]),
    ("سخت‌افزار و موبایل", ["phone", "mobile", "laptop", "hardware", "gpu", "cpu", "گوشی", "موبایل", "لپ‌تاپ", "سخت‌افزار"]),
    ("استارتاپ و سرمایه‌گذاری", ["startup", "funding", "venture", "investment", "استارتاپ", "سرمایه‌گذاری", "invest"]),
    ("بازی", ["game", "gaming", "بازی", "گیم"]),
    ("طراحی و خلاقیت", ["design", "creative", "ui", "ux", "graphic", "طراحی", "خلاقیت", "گرافیک"]),
    ("علم و دانش", ["science", "research", "academic", "علم", "پژوهش", "دانشگاه"]),
    ("فناوری و کسب‌وکار", ["business", "enterprise", "saas", "کسب‌وکار", "سرویس", "platform"]),
    ("فرهنگ دیجیتال و رسانه", ["news", "media", "culture", "خبر", "رسانه", "فرهنگ", "مجله"]),
    ("فناوری", ["tech", "technology", "digital", "فناوری", "تکنولوژی", "دیجیتال"]),
]

_STOPWORDS = {"و", "در", "از", "به", "با", "است", "که", "این", "برای", "را", "های", "یا", "تا", "نه", "اما", "بر", "شد", "شده", "می", "هایِ"}


def _guess_category(text, default="عمومی"):
    low = (text or "").lower()
    if not low:
        return default
    scores = {}
    for cat, kws in CATEGORY_HINTS:
        score = sum(1 for kw in kws if kw in low)
        if score:
            scores[cat] = score
    if not scores:
        return default
    return max(scores, key=scores.get)


def _guess_tags(text, name, max_tags=4):
    """استخراج برچسب از کلمات پرتکرار محتوای فارسی."""
    words = re.findall(r"[آ-ی]+", text or "")
    freq = {}
    for w in words:
        if len(w) < 3 or w in _STOPWORDS:
            continue
        freq[w] = freq.get(w, 0) + 1
    top = sorted(freq, key=freq.get, reverse=True)[:max_tags]
    return top if top else [name]


def auto_classify_site(url, scraped):
    """ساخت کامل config entry فقط از روی آدرس و محتوای استخراج‌شده."""
    name = _pretty_name(scraped, url)
    blob = " ".join(x for x in [
        scraped.get("title", ""), scraped.get("description", ""),
        scraped.get("keywords", ""), scraped.get("text", "")[:800],
    ] if x)
    entry = {
        "id": _slugify(url),
        "name": name,
        "url": url,
        "category": _guess_category(blob),
        "tags": _guess_tags(blob, name),
    }
    print(f"  [~] auto: name={name!r} category={entry['category']!r} tags={entry['tags']}")
    return entry


# ——————————————————————————————————————————————————————
#  Pipeline
# ——————————————————————————————————————————————————————
def to_persian_digits(num_str):
    mapping = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")
    return str(num_str).translate(mapping)


def get_persian_date():
    return to_persian_digits(datetime.now().strftime("%Y/%m/%d - %H:%M"))


def _load_json(path, default=None):
    try:
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return default


def _save_json(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def _upsert_config(entry):
    """افزودن/به‌روزرسانی یک سایت در config/sites.json."""
    sites = _load_json(CONFIG_FILE, [])
    if not isinstance(sites, list):
        sites = []
    sites = [s for s in sites if s.get("url") != entry["url"]]
    sites.append(entry)
    _save_json(CONFIG_FILE, sites)
    return sites


def _summarize_one(entry, scraped, existing):
    """تولید خلاصه برای یک سایت و ساخت output entry کامل."""
    ai = summarize_with_ai(scraped, entry)
    return {
        "id": entry.get("id", _slugify(entry["url"])),
        "name": entry.get("name"),
        "url": entry["url"],
        "category": ai.get("suggested_category") or entry.get("category", "عمومی"),
        "tags": ai.get("suggested_tags") or entry.get("tags", []),
        "favicon": scraped["favicon"],
        "page_title": scraped["title"],
        "summary": _clamp_summary(ai.get("summary", "")),
        "highlights": ai.get("highlights", []),
        "sentiment": ai.get("sentiment", "اطلاع‌رسانی"),
        "key_topics": ai.get("key_topics", entry.get("tags", [])),
        "read_time": ai.get("read_time", "۳ دقیقه"),
        "provider": ai.get("provider", "g4f"),
        "updated_at": get_persian_date(),
        "updated_at_iso": datetime.utcnow().isoformat() + "Z",
    }


def cmd_add(url):
    """مد افزودن: scrape + دسته‌بندی خودکار + افزودن به config + تولید خلاصه."""
    print("=" * 60)
    print(f"[+] ADD MODE: {url}")
    print("=" * 60)
    if not re.match(r"^https?://", url):
        print("[-] URL must start with http(s)://")
        sys.exit(1)

    scraped = scrape_website(url)
    if not scraped:
        print("[-] Scraping failed. Retry later.")
        sys.exit(1)

    entry = auto_classify_site(url, scraped)
    _upsert_config(entry)
    print(f"[✔] Added to config/sites.json: {entry['name']}")

    # به‌روزرسانی data/sites.json
    existing = _load_json(OUTPUT_FILE, {"sites": []})
    sites_out = [s for s in existing.get("sites", []) if s.get("url") != url]
    try:
        new_entry = _summarize_one(entry, scraped, existing)
        sites_out.append(new_entry)
        print(f"[✔] Summary generated for {entry['name']}")
    except Exception as e:
        print(f"[!] Summary failed ({e}) — site added, will summarize on next run.")

    payload = {
        "meta": {
            "title": "داشبورد هوشمند خلاصه‌ساز وب‌سایت‌ها",
            "last_updated": get_persian_date(),
            "last_updated_iso": datetime.utcnow().isoformat() + "Z",
            "total_sites": len(sites_out),
            "generator": "multi-provider AI + GitHub Actions",
            "version": "1.0.0",
        },
        "sites": sites_out,
    }
    _save_json(OUTPUT_FILE, payload)
    print(f"[✔] Output saved: {OUTPUT_FILE}")
    print("=" * 60)


def run_pipeline(force=False, limit=None):
    """پردازش همه سایت‌های config/sites.json."""
    print("=" * 60)
    print("[*] AI Website Summarizer Pipeline")
    print(f"[*] Provider: {SETTINGS.get('provider')} | available: {_available_providers()}")
    print("=" * 60)

    sites_config = _load_json(CONFIG_FILE, [])
    if not sites_config:
        print(f"[-] No sites in {CONFIG_FILE}")
        sys.exit(1)

    existing = _load_json(OUTPUT_FILE, {"sites": []})
    existing_summaries = {s["url"]: s for s in existing.get("sites", []) if s.get("url")}

    results = []
    targets = sites_config[:limit] if limit else sites_config

    for idx, site in enumerate(targets, 1):
        url = site.get("url")
        name = site.get("name", url)
        print(f"\n[{idx}/{len(targets)}] {name} ({url})")

        if not force and url in existing_summaries:
            cached = existing_summaries[url]
            if cached.get("summary") and cached.get("highlights"):
                print("  [*] Reusing cached summary.")
                cached["name"] = name
                cached["category"] = site.get("category", cached.get("category", "عمومی"))
                cached["tags"] = site.get("tags", cached.get("tags", []))
                results.append(cached)
                continue

        scraped = scrape_website(url)
        if not scraped:
            print("  [!] First fetch failed, retrying...")
            time.sleep(3)
            scraped = scrape_website(url)
        if not scraped:
            if url in existing_summaries:
                print("  [!] Scraping failed — keeping cached data.")
                results.append(existing_summaries[url])
            else:
                print("  [!] Scraping failed — placeholder entry.")
                ai = fallback_extractive_summary({"title": "", "description": "", "text": ""}, site)
                results.append({
                    "id": site.get("id", _slugify(url)),
                    "name": name, "url": url,
                    "category": site.get("category", "عمومی"),
                    "tags": site.get("tags", []),
                    "favicon": f"https://www.google.com/s2/favicons?domain={urlparse(url).netloc}&sz=128",
                    "page_title": "",
                    "summary": ai.get("summary", ""),
                    "highlights": ai.get("highlights", []),
                    "sentiment": ai.get("sentiment", "اطلاع‌رسانی"),
                    "key_topics": ai.get("key_topics", site.get("tags", [])),
                    "read_time": ai.get("read_time", "۳ دقیقه"),
                    "provider": "fallback",
                    "updated_at": get_persian_date(),
                    "updated_at_iso": datetime.utcnow().isoformat() + "Z",
                    "stale": True,
                })
            continue

        try:
            results.append(_summarize_one(site, scraped, existing))
        except Exception as e:
            print(f"  [!] Summarize failed ({e}) — fallback.")
            fb = fallback_extractive_summary(scraped, site)
            results.append({
                "id": site.get("id", _slugify(url)),
                "name": name, "url": url,
                "category": site.get("category", "عمومی"),
                "tags": site.get("tags", []),
                "favicon": scraped["favicon"],
                "page_title": scraped["title"],
                "summary": fb.get("summary", ""),
                "highlights": fb.get("highlights", []),
                "sentiment": fb.get("sentiment", "اطلاع‌رسانی"),
                "key_topics": fb.get("key_topics", site.get("tags", [])),
                "read_time": fb.get("read_time", "۳ دقیقه"),
                "provider": "fallback",
                "updated_at": get_persian_date(),
                "updated_at_iso": datetime.utcnow().isoformat() + "Z",
            })
        time.sleep(1)

    payload = {
        "meta": {
            "title": "داشبورد هوشمند خلاصه‌ساز وب‌سایت‌ها",
            "last_updated": get_persian_date(),
            "last_updated_iso": datetime.utcnow().isoformat() + "Z",
            "total_sites": len(results),
            "generator": "multi-provider AI + GitHub Actions",
            "version": "1.0.0",
        },
        "sites": results,
    }
    _save_json(OUTPUT_FILE, payload)
    print(f"\n[✔] Processed {len(results)} websites.")
    print(f"[✔] Output saved: {OUTPUT_FILE}")
    print("=" * 60)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Website Summarizer (g4f / Google AI / OpenRouter)")
    parser.add_argument("--add", metavar="URL", help="Scrape + auto-classify + add a site")
    parser.add_argument("--force", action="store_true", help="Force regenerate all summaries")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of sites")
    args = parser.parse_args()

    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    if args.add:
        cmd_add(args.add)
    else:
        run_pipeline(force=args.force, limit=args.limit)
