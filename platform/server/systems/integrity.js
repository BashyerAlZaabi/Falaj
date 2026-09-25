// Conflicts & Gifts — الإفصاح والهدايا.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "integrity",
  name_ar: "الإفصاح والهدايا", name_en: "Conflicts & Gifts",
  description_ar: "الإفصاح عن تضارب المصالح وسجل الهدايا والضيافة ومراجعة الامتثال",
  description_en: "Conflict-of-interest disclosures, gifts & hospitality register, compliance review",
  icon: "scale", category: "governance",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: "integrity.officer", ar: "مراجعة الإفصاحات والهدايا (ضابط الامتثال)", en: "Review disclosures and gifts (compliance officer)" }
  ],
  domains: [
    { key: "integrity.disclosures", name_ar: "إفصاحات تضارب المصالح وسجل الهدايا", name_en: "Conflict disclosures and gift register", classification: "restricted", ai: "off", locked: true, note_ar: "لا يطّلع عليها إلا مقدّمها وضابط الامتثال؛ كل اطلاع يُسجَّل", note_en: "Only the discloser and the compliance officer; every view is logged" },
  ],
});
