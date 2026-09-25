// Performance Management — نظام الأداء.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "performance",
  name_ar: "نظام الأداء", name_en: "Performance Management",
  description_ar: "دورات تقييم الأداء: الأهداف، المراجعة المرحلية، التقييم الذاتي وتقييم المدير، المعايرة",
  description_en: "Performance cycles: objectives, mid-year check-in, self and manager assessment, calibration",
  icon: "chartLine", category: "people",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: "performance.hr", ar: "إدارة دورات الأداء والمعايرة (الموارد البشرية)", en: "Manage performance cycles and calibration (HR)" }
  ],
  domains: [
    { key: "performance.reviews", name_ar: "تقييمات الأداء", name_en: "Performance reviews", classification: "confidential", ai: "opt_in", note_ar: "للموظف ومديره المباشر والموارد البشرية فقط", note_en: "Employee, line manager and HR only" },
  ],
});
