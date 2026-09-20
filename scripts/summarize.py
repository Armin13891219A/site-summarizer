#!/usr/bin/env python3
# -*- coding: utf-8 -*-

"""
Website AI Summarizer using g4f (GPT4Free)
Automatically extracts web page content and generates Persian summaries, key highlights, and tags.
Designed to run serverless via GitHub Actions or locally.
"""

import os
import sys
import json
import re
import time
import argparse
from datetime import datetime
from urllib.parse import urlparse

try:
    import requests
    from bs4 import BeautifulSoup
except ImportError:
    print("Warning: requests or beautifulsoup4 not found. Please install requirements.txt")

# Try importing g4f
try:
    from g4f.client import Client
    G4F_AVAILABLE = True
except ImportError:
    G4F_AVAILABLE = False
    print("Warning: g4f not installed. Fallback extraction mode will be used.")

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
CONFIG_FILE = os.path.join(PROJECT_ROOT, "config", "sites.json")
OUTPUT_FILE = os.path.join(PROJECT_ROOT, "data", "sites.json")

# Models to attempt in order of reliability
MODELS = ["gpt-4", "gpt-4o", "deepseek-chat", "llama-3.1-70b", "gpt-3.5-turbo"]

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
    "Accept-Language": "fa-IR,fa;q=0.9,en-US;q=0.8,en;q=0.7",
}

def extract_favicon(soup, base_url):
    """Finds best favicon or falls back to Google Favicons API."""
    parsed = urlparse(base_url)
    domain = parsed.netloc
    
    # Check link tags
    icon_link = soup.find("link", rel=lambda r: r and ("icon" in r.lower() or "apple-touch-icon" in r.lower()))
    if icon_link and icon_link.get("href"):
        href = icon_link["href"]
        if href.startswith("//"):
            return f"{parsed.scheme}:{href}"
        elif href.startswith("/"):
            return f"{parsed.scheme}://{domain}{href}"
        elif href.startswith("http"):
            return href

    # Reliable 128px Google Favicon service
    return f"https://www.google.com/s2/favicons?domain={domain}&sz=128"

def scrape_website(url):
    """Fetches page and extracts title, meta description, and clean text."""
    try:
        resp = requests.get(url, headers=HEADERS, timeout=15, verify=False)
        resp.encoding = resp.apparent_encoding or "utf-8"
        html = resp.text
    except Exception as e:
        print(f"[-] Error fetching {url}: {e}")
        return None

    soup = BeautifulSoup(html, "html.parser")

    # Clean unneeded tags
    for tag in soup(["script", "style", "nav", "footer", "header", "noscript", "aside", "svg", "form", "iframe"]):
        tag.decompose()

    # Title
    title = ""
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        title = og_title["content"].strip()
    elif soup.title and soup.title.string:
        title = soup.title.string.strip()

    # Description
    description = ""
    meta_desc = soup.find("meta", attrs={"name": "description"}) or soup.find("meta", property="og:description")
    if meta_desc and meta_desc.get("content"):
        description = meta_desc["content"].strip()

    # Keywords (many JS-heavy sites only expose metadata)
    keywords = ""
    meta_kw = soup.find("meta", attrs={"name": "keywords"})
    if meta_kw and meta_kw.get("content"):
        keywords = meta_kw["content"].strip()

    # Favicon
    favicon = extract_favicon(soup, url)

    # Main text
    paragraphs = []
    for p in soup.find_all(["p", "h1", "h2", "h3", "article", "section"]):
        text = p.get_text(separator=" ", strip=True)
        if len(text) > 35 and not any(skip in text.lower() for skip in ["cookie", "privacy policy", "copyright", "حقوق محفوظ"]):
            paragraphs.append(text)

    full_text = " ".join(paragraphs).strip()

    # سایت‌های JS-heavy (مثل SPAها) گاهی فقط متا دارند — از لینک‌ها و متا کمک بگیر
    if len(full_text) < 120:
        link_texts = []
        for a in soup.find_all("a", href=True):
            t = a.get_text(separator=" ", strip=True)
            if 3 < len(t) < 80:
                link_texts.append(t)
        nav_text = " | ".join(dict.fromkeys(link_texts))[:1200]
        meta_blob = " ".join(x for x in [title, description, keywords, nav_text] if x).strip()
        if len(meta_blob) > len(full_text):
            print(f"  [~] Thin body text ({len(full_text)} chars) — using metadata + links ({len(meta_blob)} chars).")
            full_text = meta_blob
        elif not full_text:
            full_text = meta_blob

    # Truncate to reasonable context window (~2500 chars)
    clean_text = full_text[:2500].strip()

    return {
        "title": title,
        "description": description,
        "keywords": keywords,
        "favicon": favicon,
        "text": clean_text
    }

def clean_json_response(raw_text):
    """Extracts valid JSON object from LLM response."""
    raw_text = raw_text.strip()
    # Remove markdown backticks if present
    match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", raw_text, re.DOTALL)
    if match:
        raw_text = match.group(1)
    else:
        # Try finding outermost { ... }
        start = raw_text.find("{")
        end = raw_text.rfind("}")
        if start != -1 and end != -1:
            raw_text = raw_text[start:end+1]
            
    try:
        return json.loads(raw_text)
    except Exception:
        return None

def summarize_with_ai(site_info, site_meta):
    """Sends text to g4f and returns structured Persian summary."""
    if not G4F_AVAILABLE:
        return fallback_extractive_summary(site_info, site_meta)

    client = Client()
    prompt = f"""شما یک تحلیلگر و خلاصه‌ساز ارشد رسانه‌ها و وب‌سایت‌ها هستید.
اطلاعات زیر از یک وب‌سایت استخراج شده است:
نام سایت: {site_meta.get('name', '')}
آدرس: {site_meta.get('url', '')}
عنوان صفحه: {site_info.get('title', '')}
توضیحات متادیتا: {site_info.get('description', '')}
کلیدواژه‌ها: {site_info.get('keywords', '')}

متن استخراج شده از سایت:
{site_info.get('text', '')[:2000]}

وظیفه شما:
یک خلاصه دقیق، جذاب، خواندنی و روان به زبان فارسی بسازید.
خروجی باید دقیقاً یک JSON معتبر و بدون هیچ متن دیگری باشد با این ساختار:
{{
  "summary": "یک پاراگراف خلاصه جامع ۳ تا ۴ جمله در مورد فعالیت، ارزش پیشنهادی و آخرین مطالب سایت به فارسی روان",
  "highlights": [
    "نکته کلیدی و تمایز اول سایت",
    "نکته کلیدی و بخش مهم دوم سایت",
    "نکته کلیدی سوم سایت"
  ],
  "sentiment": "لحن و حوزه فعالیت (مثلاً: نوآورانه و تحلیلی / خبری و سریع / آموزشی و مرجع)",
  "key_topics": ["موضوع ۱", "موضوع ۲", "موضوع ۳"],
  "read_time": "زمان تخمینی مطالعه (مثلاً: ۳ دقیقه)"
}}
"""

    for model in MODELS:
        try:
            print(f"  -> Attempting AI model: {model}...")
            response = client.chat.completions.create(
                model=model,
                messages=[{"role": "user", "content": prompt}],
                timeout=30
            )
            content = response.choices[0].message.content
            parsed = clean_json_response(content)
            if parsed and "summary" in parsed and parsed.get("summary"):
                print(f"  [+] AI summary generated successfully with {model}!")
                return parsed
        except Exception as e:
            print(f"  [-] Model {model} failed ({type(e).__name__}). Trying next...")
            time.sleep(1)

    print("  [!] All AI models failed or rate-limited. Using smart fallback extractor.")
    return fallback_extractive_summary(site_info, site_meta)

def fallback_extractive_summary(site_info, site_meta):
    """Creates a clean Persian summary using metadata when AI is unreachable."""
    desc = site_info.get("description", "").strip()
    title = site_info.get("title", "").strip()
    name = site_meta.get("name", "این وب‌سایت")
    category = site_meta.get("category", "وب")

    if desc and len(desc) > 40:
        summary_text = f"{name} در حوزه {category} فعالیت دارد. {desc}"
    elif title:
        summary_text = f"{name} پایگاهی تخصصی با عنوان «{title}» است که محتوا و خدمات مرتبط با {category} را ارائه می‌دهد."
    else:
        summary_text = f"{name} یکی از مراجع فعال در حوزه {category} است که به انتشار به‌روزترین مطالب و خدمات می‌پردازد."

    tags = site_meta.get("tags", ["فناوری", "وب", "خدمات آنلاین"])

    highlights = [
        f"ارائه محتوا و سرویس‌های تخصصی در حوزه {category}",
        f"دسترسی سریع و مستقیم از طریق نشانی {site_meta.get('url', '')}",
        "پوشش تازه‌ترین عناوین و موضوعات دسته‌بندی‌شده"
    ]

    return {
        "summary": summary_text,
        "highlights": highlights,
        "sentiment": "تخصصی و اطلاع‌رسانی",
        "key_topics": tags[:3],
        "read_time": "۲ دقیقه"
    }

def to_persian_digits(num_str):
    """Converts English digits to Persian digits."""
    fa_digits = "۰۱۲۳۴۵۶۷۸۹"
    en_digits = "0123456789"
    mapping = str.maketrans("".join(en_digits), "".join(fa_digits))
    return str(num_str).translate(mapping)

def get_persian_date():
    """Generates simple Persian date representation."""
    now = datetime.now()
    # Simple approx or ISO timestamp with Persian digits
    return to_persian_digits(now.strftime("%Y/%m/%d - %H:%M"))

def run_pipeline(force=False, limit=None):
    """Main execution loop."""
    print("=" * 60)
    print("🚀 Running AI Website Summarizer Pipeline")
    print("=" * 60)

    if not os.path.exists(CONFIG_FILE):
        print(f"[-] Config file not found: {CONFIG_FILE}")
        sys.exit(1)

    with open(CONFIG_FILE, "r", encoding="utf-8") as f:
        sites_config = json.load(f)

    # Load existing summaries if available
    existing_summaries = {}
    if os.path.exists(OUTPUT_FILE):
        try:
            with open(OUTPUT_FILE, "r", encoding="utf-8") as f:
                existing_data = json.load(f)
                for item in existing_data.get("sites", []):
                    existing_summaries[item["url"]] = item
        except Exception:
            pass

    results = []
    targets = sites_config[:limit] if limit else sites_config

    for idx, site in enumerate(targets, 1):
        url = site.get("url")
        name = site.get("name", url)
        print(f"\n[{idx}/{len(targets)}] Processing: {name} ({url})")

        # Check cache if not forcing
        if not force and url in existing_summaries:
            cached = existing_summaries[url]
            # If summary is present and fresh, reuse it
            if cached.get("summary") and cached.get("highlights"):
                print("  [*] Reusing cached summary.")
                # Update any changed config tags/category
                cached["name"] = name
                cached["category"] = site.get("category", cached.get("category", "عمومی"))
                cached["tags"] = site.get("tags", cached.get("tags", []))
                results.append(cached)
                continue

        # Scrape (retry once on transient failure)
        scraped = scrape_website(url)
        if not scraped:
            print("  [!] First fetch failed, retrying once with longer patience...")
            time.sleep(3)
            scraped = scrape_website(url)
        if not scraped:
            # Fallback to existing or placeholder
            if url in existing_summaries:
                print("  [!] Scraping failed, keeping old cached data.")
                results.append(existing_summaries[url])
            else:
                print("  [!] Scraping failed with no cache — creating placeholder entry.")
                ai_data = fallback_extractive_summary(
                    {"title": "", "description": "", "text": ""}, site
                )
                parsed = urlparse(url)
                entry = {
                    "id": site.get("id", re.sub(r'[^a-zA-Z0-9]', '_', url)),
                    "name": name,
                    "url": url,
                    "category": site.get("category", "عمومی"),
                    "tags": site.get("tags", []),
                    "favicon": f"https://www.google.com/s2/favicons?domain={parsed.netloc}&sz=128",
                    "page_title": "",
                    "summary": ai_data.get("summary", ""),
                    "highlights": ai_data.get("highlights", []),
                    "sentiment": ai_data.get("sentiment", "اطلاع‌رسانی"),
                    "key_topics": ai_data.get("key_topics", site.get("tags", [])),
                    "read_time": ai_data.get("read_time", "۳ دقیقه"),
                    "updated_at": get_persian_date(),
                    "updated_at_iso": datetime.utcnow().isoformat() + "Z",
                    "stale": True,
                }
                results.append(entry)
            continue

        # AI Summary
        ai_data = summarize_with_ai(scraped, site)

        # Merge
        entry = {
            "id": site.get("id", re.sub(r'[^a-zA-Z0-9]', '_', url)),
            "name": name,
            "url": url,
            "category": site.get("category", "عمومی"),
            "tags": site.get("tags", []),
            "favicon": scraped["favicon"],
            "page_title": scraped["title"],
            "summary": ai_data.get("summary", ""),
            "highlights": ai_data.get("highlights", []),
            "sentiment": ai_data.get("sentiment", "اطلاع‌رسانی"),
            "key_topics": ai_data.get("key_topics", site.get("tags", [])),
            "read_time": ai_data.get("read_time", "۳ دقیقه"),
            "updated_at": get_persian_date(),
            "updated_at_iso": datetime.utcnow().isoformat() + "Z"
        }
        results.append(entry)
        time.sleep(1)  # Polite pacing

    # Output structure
    output_payload = {
        "meta": {
            "title": "داشبورد هوشمند خلاصه‌ساز وب‌سایت‌ها",
            "last_updated": get_persian_date(),
            "last_updated_iso": datetime.utcnow().isoformat() + "Z",
            "total_sites": len(results),
            "generator": "g4f + GitHub Actions",
            "version": "1.0.0"
        },
        "sites": results
    }

    os.makedirs(os.path.dirname(OUTPUT_FILE), exist_ok=True)
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output_payload, f, ensure_ascii=False, indent=2)

    print(f"\n[✔] Successfully processed {len(results)} websites.")
    print(f"[✔] Output saved to: {OUTPUT_FILE}")
    print("=" * 60)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="AI Website Summarizer")
    parser.add_argument("--force", action="store_true", help="Force regenerate all summaries")
    parser.add_argument("--limit", type=int, default=None, help="Limit number of sites to process")
    args = parser.parse_args()

    # Disable SSL warnings
    import urllib3
    urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

    run_pipeline(force=args.force, limit=args.limit)
