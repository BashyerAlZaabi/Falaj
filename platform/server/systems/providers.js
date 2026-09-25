// Service Providers — منصة مقدمي الخدمات.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "providers",
  name_ar: "منصة مقدمي الخدمات", name_en: "Service Providers",
  description_ar: "سجل مقدمي الخدمات ووثائقهم وعقودهم وتقييم أدائهم، وبوابة خاصة لكل مورد",
  description_en: "Provider registry, documents, contracts and performance evaluations, with a private portal per provider",
  icon: "handshake", category: "operations",
  external: true,
  access: (u) => (isStaff(u) && (hasCap(u, 'providers.manage', 'procurement.officer', 'procurement.finance', 'procurement.committee', 'procurement.legal') || u.role !== 'employee')) || hasCap(u, 'providers.portal'),
  defaultPinned: (u) => hasCap(u, 'providers.manage', 'providers.portal'),
  caps: [
    { cap: "providers.manage", ar: "إدارة سجل مقدمي الخدمات والعقود", en: "Manage the provider registry and contracts" },
    { cap: "providers.portal", ar: "حساب مقدم خدمة (بوابة المورد فقط)", en: "Service provider account (supplier portal only)", external: true }
  ],
  domains: [
    { key: "providers.registry", name_ar: "سجل مقدمي الخدمات والعقود والتقييمات", name_en: "Provider registry, contracts and evaluations", classification: "confidential", ai: "opt_in" },
  ],
});
