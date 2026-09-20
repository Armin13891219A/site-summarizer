# 🤖 داشبورد هوشمند خلاصه‌ساز وب‌سایت‌ها

سایت استاتیک فارسی (راست‌چین) که لیست وب‌سایت‌های منتخب شما را با **خلاصه خودکار فارسی**،
نکته‌های کلیدی و تگ‌ها نمایش می‌دهد — **کاملاً رایگان، بدون هاست**، روی **GitHub Pages**.

## ✨ ویژگی‌ها

- 🎨 طراحی تیره با توکن‌های واقعی **vibefarsi/graphite** + تکنیک‌های **make-interfaces-feel-better**
  (شعاع هم‌مرکز، spotlight دنبال‌گر ماوس، reveal هنگام اسکرول، اعداد tabular، hit-area مناسب)
- 🤖 خلاصه‌سازی خودکار با کتابخانه **[g4f](https://github.com/xtekky/gpt4free)** (رایگان، بدون API Key)
- ⏰ اجرای روزانه خودکار با **GitHub Actions** (کرون هر روز + اجرای دستی + اجرا با تغییر لیست)
- 🔍 جست‌وجوی زنده + فیلتر دسته‌بندی، کاملاً آفلاین روی مرورگر
- 📱 ریسپانسیو و سازگار با `prefers-reduced-motion`

## 📁 ساختار

```
├── index.html                  # صفحه اصلی داشبورد
├── css/style.css               # استایل graphite + polish
├── js/app.js                   # رندر، جست‌وجو، فیلتر، reveal/spotlight
├── config/sites.json           # 👈 لیست سایت‌های شما — همین را ویرایش کنید
├── data/sites.json             # خروجی خودکار خلاصه‌ها (توسط اسکریپت/اکشن)
├── scripts/
│   ├── summarize.py            # اسکریپت استخراج + خلاصه‌سازی g4f
│   └── requirements.txt
└── .github/workflows/summarize.yml  # ورک‌فلوی روزانه
```

## 🚀 راه‌اندازی روی GitHub (۵ دقیقه)

1. **ریپوی جدید بسازید** (مثلاً `site-summarizer`) و همه فایل‌های این پوشه را پوش کنید:
   ```bash
   cd site-summarizer
   git init
   git add -A
   git commit -m "init: AI website summarizer dashboard"
   git branch -M main
   git remote add origin https://github.com/YOUR_USERNAME/site-summarizer.git
   git push -u origin main
   ```
2. **GitHub Pages را فعال کنید:**
   `Settings → Pages → Deploy from a branch → main / (root)` → آدرس سایت:
   `https://YOUR_USERNAME.github.io/site-summarizer/`
3. **اجرای دستی اول:** تب `Actions → Summarize Websites → Run workflow`
   (بعد از آن هر روز ساعت ۰۹:۳۰ تهران خودکار اجرا می‌شود.)

## ➕ افزودن سایت جدید

`config/sites.json` را ویرایش کنید — همین:

```json
{
  "id": "my-site",
  "name": "نام فارسی (English)",
  "url": "https://example.com",
  "category": "دسته‌بندی",
  "tags": ["تگ ۱", "تگ ۲"]
}
```

با هر پوش روی `config/sites.json` ورک‌فلو خودکار اجرا و خلاصه تولید می‌شود.
برای تولید دستی همه خلاصه‌ها:

```bash
pip install -r scripts/requirements.txt
python scripts/summarize.py --force
```

## 🧪 تست لوکال

بدون سرور خاصی — کافی است پوشه را سرو کنید (به‌خاطر `fetch` باید http باشد، نه `file://`):

```bash
python -m http.server 8000
# باز کنید: http://localhost:8000
```

## ⚠️ نکته‌ها

- `github.blog` از بعضی شبکه‌ها (از جمله شبکه فعلی توسعه) تایم‌اوت می‌خورد؛
  روی GitHub Actions مشکلی ندارد و ورودی آن با پرچم «در انتظار به‌روزرسانی» خودکار تازه می‌شود.
- اگر مدلی از g4f ریت‌لیمیت شد، اسکریپت خودکار مدل بعدی را امتحان می‌کند
  و در بدترین حالت خلاصه استخراجی از متادیتا می‌سازد تا سایت هیچ‌وقت خالی نماند.
