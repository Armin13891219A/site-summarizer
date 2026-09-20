# 📓 دفتر یادداشت هوشمند وب‌سایت‌ها

> یک لینک بده، بقیه‌اش با خودمان. خلاصه فارسی خودکار هر وب‌سایت — رایگان، بدون هاست، روی GitHub Pages.

**نمونه زنده:** https://armin13891219a.github.io/site-summarizer/

---

## ✨ امکانات

- **خلاصه هوشمند فارسی** — با کتابخانه رایگان [g4f](https://github.com/xtekky/gpt4free) (بدون API پولی)
- **خلاصه‌سازی خودکار** — هر روز ساعت ۰۹:۳۰ به وقت تهران با GitHub Actions
- **پنل مدیریت** — سایت اضافه/حذف کن بدون لمس فایل‌ها: [`/admin/`](https://armin13891219a.github.io/site-summarizer/admin/)
- **استایل واقعی vibefarsi** — تم گرافیت، RTL کامل، Vazirmatn، انیمیشن‌های واقعی رجیستری
- **هیچ هزینه‌ای** — صفر دلار در ماه، کاملاً رایگان

## 🚀 نصب و راه‌اندازی

```bash
git clone https://github.com/Armin13891219A/site-summarizer.git
cd site-summarizer

# ساخت خلاصه برای سایت‌های config/sites.json
uv run --with g4f --with requests --with beautifulsoup4 \
  python scripts/summarize.py
```

سپس در گیت‌هاب: **Settings → Pages → Source: Deploy from a branch → `main` / `/root`**.

## ➕ افزودن سایت جدید — ۲ راه

### راه اول: پنل مدیریت (پیشنهادی)
به [`/admin/`](https://armin13891219a.github.io/site-summarizer/admin/) برو، توکن گیت‌هاب با دسترسی `repo` وارد کن، آدرس سایت رو بده. خودش:
1. سایت رو به `config/sites.json` اضافه می‌کند (commit مستقیم)
2. ورک‌فلو خلاصه‌ساز را اجرا می‌کند
3. خلاصه آماده و صفحه به‌روز می‌شود

### راه دوم: دستی
فایل [`config/sites.json`](config/sites.json) را ویرایش کن:
```json
{
  "id": "site-id",
  "name": "نام سایت",
  "url": "https://example.com",
  "category": "فناوری",
  "tags": ["اخبار", "متن‌باز"]
}
```
سپس اسکریپت رو اجرا کن. فقط سایت‌های جدید پردازش می‌شوند (cache هوشمند).

## 🤖 اتوماسیون (GitHub Actions)

فایل [`.github/workflows/summarize.yml`](.github/workflows/summarize.yml):
- `schedule` — هر روز ۰۹:۳۰ تهران
- `push` به `config/sites.json` — پس از افزودن سایت از پنل، خودکار اجرا می‌شود
- `workflow_dispatch` — اجرای دستی با گزینه `force` از تب Actions

## 🎨 افکت‌های vibefarsi استفاده‌شده

همه از [رجیستری رسمی](https://vibefarsi.ir) و با توکن‌های تم `graphite`:
- **Aurora** — پس‌زمینه شفق قطبی هیرو
- **Typewriter** — تایپ زیرعنوان
- **Counter** — شمارش تعداد سایت‌ها
- **BlurText** — ظاهر شدن کلمات کارت
- **TiltCard** — کج شدن سه‌بعدی کارت‌ها
- **Marquee** — نوار متحرک نام سایت‌ها
- **ScrollProgress** — نوار پیشرفت بالای صفحه
- **GradientText + TextShimmer** — متن‌های گرادیانی
- **SpotlightCard** — نورافکن روی کارت
- **Reveal** — ظاهر شدن با اسکرول
- **GridBackground** — پس‌زمینه شبکه

## 📁 ساختار پروژه

```
site-summarizer/
├── index.html              # صفحه اصلی داشبورد
├── admin/                  # پنل مدیریت
│   ├── index.html
│   ├── css/panel.css
│   └── js/panel.js
├── css/style.css           # تم graphite + همه افکت‌ها
├── js/app.js               # منطق داشبورد + انیمیشن‌ها
├── data/sites.json          # خلاصه‌های تولیدشده (خروجی)
├── config/sites.json       # لیست سایت‌ها (ورودی)
├── scripts/
│   ├── summarize.py        # استخراج + خلاصه g4f
│   └── requirements.txt
└── .github/workflows/      # اتوماسیون روزانه
```

## 🔒 امنیت

- توکن گیت‌هاب فقط در حافظه مرورگر می‌ماند — هیچ‌جا ذخیره نمی‌شود
- صفحه admin با `noindex` علامت‌گذاری شده
- نیازی به سرور نیست — همه چیز از طریق GitHub API کار می‌کند

## 📜 لایسنس

MIT — آزاد برای استفاده
