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

No build step, no dependencies. Open `index.html`, or serve the repo:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/
```

The app is an installable PWA (web manifest + offline service worker), so you can
add it to your home screen and launch it full-screen.

To reset to onboarding, clear the site's `localStorage` (key `falaj_state_v2`).

## 🗂️ Structure

```
index.html              ← shell + script order + PWA links
manifest.webmanifest    ← installable-app metadata
sw.js                   ← service worker (offline app shell)
css/styles.css          ← FALAJ identity, mobile-app layout, charts
js/i18n.js              ← translations (en / ar / ur / hi) + t() + setLang()
js/icons.js             ← inline SVG icons, social glyphs, logo, onboarding scenes
js/data.js              ← fields, market, notifications, countries, onboarding slides
js/config.js            ← optional Supabase keys (backend toggle)
js/backend.js           ← Supabase auth + cloud-sync adapter
js/app.js               ← onboarding, auth+OTP, farm wizard, home, fields, detail, charts, settings
assets/                 ← brand logos, hero image, app icons
```

State (onboarding, account, farm, fields, language) is saved in the browser via `localStorage`.
Weather, market and sensor figures are demo data for the prototype.

## 🔌 Turn on the backend (real accounts + cloud sync)

The app is **backend-ready**. With no keys it runs on-device (localStorage). Add a free
[Supabase](https://supabase.com) project and it switches to **real email/password accounts** whose
data syncs across devices — no other code changes needed.

1. **Create a project** — supabase.com → *New project* (free tier is enough).
2. **Copy your keys** — Project → *Settings → API*: copy the **Project URL** and the **anon public** key.
3. **Paste them** into `js/config.js`:
   ```js
   window.FALAJ_CONFIG = {
     SUPABASE_URL: 'https://YOURPROJECT.supabase.co',
     SUPABASE_ANON_KEY: 'eyJhbGciOi...'   // anon public key (safe to publish)
   };
   ```
4. **Create the table** — Supabase → *SQL Editor* → run:
   ```sql
   create table if not exists app_state (
     user_id uuid primary key references auth.users(id) on delete cascade,
     state jsonb,
     updated_at timestamptz default now()
   );
   alter table app_state enable row level security;
   create policy "own_select" on app_state for select using (auth.uid() = user_id);
   create policy "own_insert" on app_state for insert with check (auth.uid() = user_id);
   create policy "own_update" on app_state for update using (auth.uid() = user_id);
   ```
5. **Email auth** — *Authentication → Providers → Email* is on by default. For instant login during
   testing, turn **off** "Confirm email" (*Authentication → Sign In / Providers*).
6. **Redeploy** (commit the edited `config.js`). Sign Up now creates real accounts; each user's farm,
   fields and progress are stored in the cloud and load on any device.

The anon key is meant to be public — Row Level Security (step 4) ensures each user only ever reads or
writes their **own** row.

---
صُنع لرؤية الأمن الغذائي الإماراتي 2051 🇦🇪
