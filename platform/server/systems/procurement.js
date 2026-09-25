// AI Procurement — المشتريات الذكية.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "procurement",
  name_ar: "المشتريات الذكية", name_en: "AI Procurement",
  description_ar: "طلبات الشراء والاعتمادات وطلبات العروض وتقييمها بمساعدة الذكاء الاصطناعي حتى أمر الشراء",
  description_en: "Purchase requests, approvals, RFQs and AI-assisted evaluation through to purchase order",
  icon: "cart", category: "operations",
  external: true,
  access: (u) => isStaff(u) || hasCap(u, 'providers.portal'),
  defaultPinned: (u) => hasCap(u, 'procurement.officer', 'procurement.finance', 'procurement.committee', 'procurement.legal', 'providers.portal') || u.role !== 'employee',
  caps: [
    { cap: "procurement.officer", ar: "أخصائي مشتريات (طلبات العروض والترسية)", en: "Procurement officer (RFQs and award)" },
    { cap: "procurement.finance", ar: "اعتماد الميزانية للمشتريات (المالية)", en: "Budget approval for procurement (Finance)" },
    { cap: "procurement.legal", ar: "مراجعة قانونية للعقود", en: "Legal contract review" },
    { cap: "procurement.committee", ar: "لجنة تقييم العروض", en: "Bid evaluation committee" },
    { cap: "finance.budget", ar: "إدارة اعتمادات الميزانية", en: "Manage budget allocations" }
  ],
  domains: [
    { key: "procurement.requests", name_ar: "طلبات الشراء والاعتمادات", name_en: "Purchase requests and approvals", classification: "internal", ai: "allowed" },
    { key: "procurement.bids", name_ar: "العروض المالية والفنية", name_en: "Financial and technical bids", classification: "restricted", ai: "off", locked: true, note_ar: "مختومة حتى موعد الفتح؛ التحليل الذكي داخل النظام بأسماء مقنّعة", note_en: "Sealed until opening; in-system AI analysis uses masked bidder names" },
  ],
});
