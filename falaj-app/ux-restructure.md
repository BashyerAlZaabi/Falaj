# FALAJ UX Restructure — 3-Click Rule

## Current Problem
- Too many pages scattered across BottomNav (5 items), SideMenu (16 items), Dashboard quick actions (8 items)
- Farmer has to think "where is X?" — cognitive overload
- Some features buried 4+ clicks deep

## 3-Click Architecture

### Click 1: BottomNav (always visible) — 5 tabs
| Tab | Label | What it opens |
|-----|-------|---------------|
| 1 | Home | Dashboard (hub) |
| 2 | Farm | Farm Hub (sensors + resources + crops + valves) |
| 3 | Market | Marketplace + Supply Chain combined |
| 4 | Money | Financials + Orders + Logistics |
| 5 | More | Profile + Settings + Rewards + Help |

### Click 2: Hub pages (each BottomNav tab opens a hub)
- **Home**: Weather, alerts, AI actions, quick stats → tap any card = Click 2
- **Farm Hub**: 4 clear sections — My Sensors, Resources, Crop Plan, Smart Valves
- **Market Hub**: 2 sections — Marketplace (buy/sell) + B2B Supply Chain
- **Money Hub**: Revenue overview + Orders + Logistics + Invoices
- **More Hub**: Profile, Rewards, Settings, Admin, Help, About, Community

### Click 3: Detail pages
- Sensor detail, product detail, order detail, crop detail, etc.

## Key Principles
1. Group by farmer's mental model: "My Farm", "Buy/Sell", "My Money", "Everything Else"
2. Each hub shows summary cards that link to details
3. No scrolling menus — everything visible at a glance
4. Side menu becomes optional (power users only), not required
