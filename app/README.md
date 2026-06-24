# FALAJ — Smart Farming App | تطبيق فلج للزراعة الذكية

A multilingual, pure-web prototype of the **FALAJ** smart-farming app — built around FALAJ's IoT
smart-irrigation system that optimizes water usage in agriculture. The design is *inspired by* the
FALAJ product mockups (friendly green identity, illustrated onboarding, farm dashboards) rather than
pixel-matching them.

نموذج ويب متعدّد اللغات لتطبيق **فلج** للزراعة الذكية — مبني حول نظام فلج الذكي للريّ
بتقنية إنترنت الأشياء لتحسين استهلاك المياه في الزراعة.

## ✨ Flows

- **Onboarding** — illustrated carousel (Farming made easy → Harvesting becomes fun → Boost your yields)
  with an in-app language switcher.
- **Auth** — log in, sign up with **live password-strength rules**, social buttons, and a full
  forgot-password flow (email → OTP → reset).
- **Add farm details** — a 2-step wizard: farm name + cascading country/state/city + pincode +
  field-on-map selection, then water/revenue/expense/crops financials.
- **Home** — greeting, weather card, *Today's market* prices, and *My Fields*.
- **Fields & Field detail** — field cards (water level, expense, revenue) and a detail screen with
  crop health, planting date, revenue, harvest time, a **7-day water-consumption bar chart** and an
  **expense donut chart**.
- **Notifications** — friendly reminders with an "all caught up" empty state.
- **Support** & **Settings** — profile, language, about FALAJ, log out.

## 🌍 Languages

Switchable anywhere (language chip / Settings → Language):

| Language | code | Direction |
|----------|------|-----------|
| English  | `en` | LTR |
| العربية   | `ar` | RTL |
| اردو      | `ur` | RTL |
| हिन्दी     | `hi` | LTR |

Urdu & Hindi are included because they cover much of the UAE's farm-worker audience.
*(The mockup's placeholder dropdown listed European languages — swap the set in `js/i18n.js` if needed.)*

## 🚀 Run

No build step, no dependencies. Open `app/index.html`, or serve the repo:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/app/
```

To reset to onboarding, clear the site's `localStorage` (key `falaj_state_v2`).

## 🗂️ Structure

```
app/
  index.html        ← shell + script order
  css/styles.css    ← FALAJ green identity, mobile-app layout, charts
  js/i18n.js        ← translations (en / ar / ur / hi) + t() + setLang()
  js/icons.js       ← inline SVG icons, social glyphs, rainbow logo, onboarding scenes
  js/data.js        ← fields, market, notifications, countries, onboarding slides
  js/app.js         ← onboarding, auth+OTP, farm wizard, home, fields, detail, charts, settings
```

State (onboarding, account, farm, fields, language) is saved in the browser via `localStorage`.
Weather, market and sensor figures are demo data for the prototype.

---
صُنع لرؤية الأمن الغذائي الإماراتي 2051 🇦🇪
