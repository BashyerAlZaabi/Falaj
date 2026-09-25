// My Goals — أهدافي.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "goals",
  name_ar: "أهدافي", name_en: "My Goals",
  description_ar: "أهداف شخصية يومية وأسبوعية وشهرية وربعية وسنوية، مرتبطة بالأهداف الاستراتيجية",
  description_en: "Personal daily, weekly, monthly, quarterly and yearly goals aligned to strategy",
  icon: "goal", category: "strategy",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [],
  domains: [
    { key: "goals.personal", name_ar: "الأهداف الشخصية", name_en: "Personal goals", classification: "confidential", ai: "opt_in", note_ar: "تظهر لصاحبها ولمديره المباشر حسب إعداد الظهور", note_en: "Visible to the owner and their line manager per the visibility setting" },
  ],
});
