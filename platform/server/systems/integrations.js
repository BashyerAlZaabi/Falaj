// Integration & Control Center — مركز التكامل والتحكم.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "integrations",
  name_ar: "مركز التكامل والتحكم", name_en: "Integration & Control Center",
  description_ar: "اختر الأنظمة التي تظهر لك، واربط التطبيقات المناسبة، وتحكّم في وصول المساعد الذكي إلى بياناتك",
  description_en: "Choose your systems, connect the apps that suit you, and control what Ask AI may read",
  icon: "plug", category: "platform",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [],
  domains: [
    { key: "integrations.config", name_ar: "إعدادات الربط والتكامل", name_en: "Integration settings", classification: "internal", ai: "off" },
  ],
});
