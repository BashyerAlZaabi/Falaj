// Strategic Performance — الأداء الاستراتيجي.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "strategy",
  name_ar: "الأداء الاستراتيجي", name_en: "Strategic Performance",
  description_ar: "الأهداف الاستراتيجية ومؤشراتها ومبادراتها — تديرها إدارة المشاريع الاستراتيجية",
  description_en: "Strategic objectives, KPIs and initiatives — managed by the Strategic Projects office",
  icon: "compass", category: "strategy",
  access: (u) => isStaff(u),
  defaultPinned: (u) => hasCap(u, 'strategy.admin') || u.role !== 'employee',
  caps: [
    { cap: "strategy.admin", ar: "إدارة الخطة الاستراتيجية والمؤشرات (إدارة المشاريع الاستراتيجية)", en: "Manage the strategic plan and KPIs (SPMO)" }
  ],
  domains: [
    { key: "strategy.plan", name_ar: "الخطة الاستراتيجية والمؤشرات", name_en: "Strategic plan and KPIs", classification: "internal", ai: "allowed" },
  ],
});
