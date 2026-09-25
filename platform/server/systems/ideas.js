// Ideas — إدارة الأفكار.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "ideas",
  name_ar: "إدارة الأفكار", name_en: "Ideas",
  description_ar: "اقتراح الأفكار والتصويت والتقييم من اللجنة وتحويلها إلى مشاريع",
  description_en: "Submit ideas, vote, committee evaluation and turning ideas into projects",
  icon: "lightbulb", category: "people",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: "ideas.committee", ar: "لجنة تقييم الأفكار", en: "Ideas evaluation committee" }
  ],
  domains: [
    { key: "ideas.pool", name_ar: "بنك الأفكار", name_en: "Ideas pool", classification: "internal", ai: "allowed" },
  ],
});
