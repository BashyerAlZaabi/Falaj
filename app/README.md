# FALAJ — Smart Irrigation App | تطبيق فلج للريّ الذكي

A multilingual, pure-web prototype of the **FALAJ** smart-irrigation farm-management app — an IoT
system that optimizes water usage in agriculture (saves water, raises productivity, lowers costs).
Built to match the FALAJ pitch deck.

نموذج ويب متعدّد اللغات لتطبيق **فلج** لإدارة المزرعة والريّ الذكي — نظام إنترنت أشياء يُحسّن
استهلاك المياه في الزراعة (يوفّر الماء، يرفع الإنتاجية، يخفّض التكاليف).

## ✨ Features

- **Login / Sign up** with two roles — *Business Manager* and *Agriculture Expert*.
- **Live dashboard** — real-time (simulated) IoT sensor readings: soil moisture, tank level,
  temperature, humidity, soil nutrients — plus water saved, money saved, productivity and active zones.
- **Smart irrigation** — per-zone control with **Auto** (waters only when soil moisture drops below the
  crop threshold) or **Manual** valve control, with live moisture bars and water usage.
- **Alerts feed** — the six notification types from the deck: market price, weather, water efficiency,
  crop health, weekly sales, low nutrients.
- **Insights** — 7-day water-usage chart and savings vs. traditional irrigation (water / cost / yield).
- **Subscription plans** — Basic, Standard, Premium and Customized.
- **Online market** (Phase 2 preview) and **About FALAJ** with national food-security facts.

## 🌍 Languages

Switchable at any time (top-bar globe icon, or *More → Language*):

| Language | الكود | Direction |
|----------|-------|-----------|
| English  | `en`  | LTR |
| العربية   | `ar`  | RTL |
| اردو      | `ur`  | RTL |
| हिन्दी     | `hi`  | LTR |

Urdu & Hindi are included because they cover much of the UAE's farm-worker audience — directly serving
FALAJ's "communication & access for stakeholders" advantage.

## 🚀 Run

No build step, no dependencies. Open `app/index.html`, or serve the repo:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/app/
```

## 🗂️ Structure

```
app/
  index.html        ← shell + script order
  css/styles.css    ← FALAJ brand (royal blue + agri green), mobile-app layout
  js/i18n.js        ← translations (en / ar / ur / hi) + t() + setLang()
  js/icons.js       ← inline SVG icons + FALAJ wordmark
  js/data.js        ← zones, crops, subscription plans, market, alert templates
  js/app.js         ← auth, routing, live sensor simulation, all screen renderers
```

State (account, plan, zones, language) is saved in the browser via `localStorage`.
Sensor values, irrigation and metrics are simulated client-side for the prototype.

---
صُنع لرؤية الأمن الغذائي الإماراتي 2051 🇦🇪
