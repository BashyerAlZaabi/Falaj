# FALAJ — Smart Agriculture

A multi-page React web app for **FALAJ**, a smart-agriculture platform: farm
dashboards, IoT soil/water sensors, AI crop recommendations, a produce
marketplace, financial tools, rewards, and more. Multilingual (English / Arabic),
mobile-first, with light/dark themes.

> Named for the traditional *falaj* (aflaj) irrigation channels of the UAE and
> Oman — community water shared and managed wisely.

## Tech stack

- **React 19** + **TypeScript** + **Vite 7**
- **Tailwind CSS 4** + **shadcn/ui** (Radix primitives)
- **wouter** for routing, **framer-motion** for animation, **recharts** for charts
- A tiny **Express** server (`server/index.ts`) to serve the production build with
  SPA fallback

State (account, farm, language, theme) is kept client-side via React contexts and
`localStorage` — no backend is required to run the app.

## Getting started

```bash
pnpm install        # install dependencies
pnpm dev            # start the Vite dev server (http://localhost:3000)
```

### Production build

```bash
pnpm build          # builds the client to dist/public and bundles the server
pnpm start          # serves the build on http://localhost:3000
```

Other scripts: `pnpm check` (TypeScript type-check), `pnpm format` (Prettier).

## Configuration

Copy `.env.example` to `.env` and fill in the values you need. Everything is
optional — with no `.env` the app runs fully on-device. Only `VITE_`-prefixed
variables are exposed to the client.

| Variable | Purpose |
|----------|---------|
| `VITE_APP_ID`, `VITE_APP_TITLE` | App identity |
| `VITE_OAUTH_PORTAL_URL` | Sign-in portal (leave blank to skip auth) |
| `VITE_ANALYTICS_ENDPOINT`, `VITE_ANALYTICS_WEBSITE_ID` | Optional analytics |
| `PORT` | Server port (default `3000`) |

## Structure

```
client/
  index.html
  src/
    main.tsx            ← entry
    App.tsx             ← routes (wouter)
    pages/              ← screens (Dashboard, Marketplace, FarmHub, …)
    components/         ← shared UI + shadcn/ui primitives
    contexts/           ← Theme, Language, AppState providers
    lib/ , hooks/       ← utilities
server/index.ts         ← Express static server with SPA fallback
shared/                 ← code shared between client and server
```

---
صُنع لرؤية الأمن الغذائي الإماراتي 🇦🇪
