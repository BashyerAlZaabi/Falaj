// Surveys — الاستبيانات.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "surveys",
  name_ar: "الاستبيانات", name_en: "Surveys",
  description_ar: "استبيانات الموظفين والمتعاملين بإجابات مجهولة ونتائج مجمّعة",
  description_en: "Employee and customer surveys with anonymous answers and aggregated results",
  icon: "clipboardList", category: "people",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: "surveys.author", ar: "إعداد الاستبيانات ونشرها", en: "Create and publish surveys" }
  ],
  domains: [
    { key: "surveys.results", name_ar: "النتائج المجمّعة", name_en: "Aggregated results", classification: "internal", ai: "allowed" },
    { key: "surveys.responses", name_ar: "الإجابات الفردية", name_en: "Individual responses", classification: "restricted", ai: "off", locked: true, note_ar: "لا تُعرض إجابة فردية لأحد؛ النتائج مجمّعة بحد أدنى 5 مشاركين", note_en: "No individual answer is ever shown; results aggregate at least 5 respondents" },
  ],
});
