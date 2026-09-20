# دفتر یادداشت هوشمند وب‌سایت‌ها

> یک لینک بده، بقیه‌اش با خودمان. خلاصه فارسی خودکار هر وب‌سایت — رایگان، بدون هاست، روی GitHub Pages.

**نمونه زنده:** https://armin13891219a.github.io/site-summarizer/

---

## امکانات

- **خلاصه هوشمند فارسی** — با g4f (رایگان)، Google AI Studio یا OpenRouter
- **خودکارسازی کامل** — نام، دسته، تگ‌ها و خلاصه فقط از روی آدرس سایت ساخته می‌شوند
- **پنل مدیریت** — فقط لینک رو بده: [پنل ادمین](https://armin13891219a.github.io/site-summarizer/admin/)
- **تنظیمات هوش مصنوعی** — انتخاب provider و مدل‌ها از پنل (در `config/settings.json`)
- **تم روشن/تاریک + ۶ رنگ تاکیدی** — ذخیره در مرورگر
- **خلاصه‌های ۴ خطی** — کوتاه و خوانا
- **افکت‌های متنی vibefarsi** — Aurora، Typewriter، Counter، BlurText، WipeText، TiltCard، Marquee، ScrollProgress، GradientText، TextShimmer، HighlightText، SpotlightCard
- **آیکون‌های SVG** — بدون هیچ ایموجی
- **صفر هزینه** — کاملاً رایگان

## نصب

```bash
git clone https://github.com/Armin13891219A/site-summarizer.git
cd site-summarizer

# پردازش همه سایت‌ها
uv run --with g4f --with requests --with beautifulsoup4 python scripts/summarize.py
```

سپس: **Settings → Pages → Source: Deploy from a branch → `main` / `/root`**

## افزودن سایت

### از پنل (پیشنهادی)
به [پنل ادمین](https://armin13891219a.github.io/site-summarizer/admin/) برو، توکن وارد کن، فقط آدرس سایت رو بده. خودش:
1. سایت رو به config اضافه می‌کند
2. ورک‌فلو اجرا می‌شود
3. نام، دسته، تگ‌ها و خلاصه خودکار ساخته می‌شوند

### از خط فرمان
```bash
python scripts/summarize.py --add https://example.com
```

## تنظیمات هوش مصنوعی

فایل `config/settings.json` (قابل ویرایش از پنل):

```json
{
  "provider": "g4f",
  "g4f_models": ["gpt-4", "gpt-4o", "deepseek-chat"],
  "google_model": "gemini-1.5-flash",
  "openrouter_model": "google/gemini-2.0-flash-exp:free"
}
```

کلیدهای API به‌صورت GitHub Actions Secrets:
- `GOOGLE_API_KEY` — [Google AI Studio](https://aistudio.google.com/api-key)
- `OPENROUTER_API_KEY` — [OpenRouter](https://openrouter.ai/keys)
- `AI_PROVIDER` — `g4f` / `google` / `openrouter`

## اتوماسیون (GitHub Actions)

فایل `.github/workflows/summarize.yml`:
- `schedule` — هر روز ۰۹:۳۰ تهران
- `push` به `config/` — خودکار پس از افزودن سایت
- `workflow_dispatch` — اجرای دستی با گزینه‌های `force` و `add_url`

## ساختار پروژه

```
site-summarizer/
├── index.html              # صفحه اصلی
├── admin/                  # پنل مدیریت
│   ├── index.html
│   ├── css/panel.css
│   └── js/panel.js
├── css/style.css           # تم + light/dark + رنگ‌های تاکیدی
├── js/app.js               # منطق + افکت‌ها
├── data/sites.json         # خلاصه‌های تولیدشده
├── config/sites.json       # لیست سایت‌ها
├── config/settings.json    # تنظیمات provider و مدل‌ها
├── scripts/
│   ├── summarize.py        # استخراج + خلاصه چندپایانه‌ای
│   └── requirements.txt
└── .github/workflows/      # اتوماسیون
```

## امنیت

- توکن گیت‌هاب فقط در حافظه مرورگر می‌ماند
- صفحه admin با `noindex` علامت‌گذاری شده
- کلیدهای API فقط در GitHub Secrets هستند

## لایسنس

MIT
