// Awards — نظام الجوائز.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "awards",
  name_ar: "نظام الجوائز", name_en: "Awards",
  description_ar: "برامج الجوائز والترشيحات وتقييم اللجنة وإعلان الفائزين",
  description_en: "Award programmes, nominations, committee scoring and winners",
  icon: "trophy", category: "people",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: "awards.admin", ar: "إدارة برامج الجوائز", en: "Manage award programmes" },
    { cap: "awards.committee", ar: "عضو لجنة الجوائز", en: "Awards committee member" }
  ],
  domains: [
    { key: "awards.public", name_ar: "البرامج والفائزون المعلنون", name_en: "Programmes and announced winners", classification: "internal", ai: "allowed" },
    { key: "awards.evaluations", name_ar: "الترشيحات وتقييمات اللجنة", name_en: "Nominations and committee scores", classification: "restricted", ai: "off", locked: true, note_ar: "سرية حتى إعلان النتائج", note_en: "Confidential until results are announced" },
  ],
});
