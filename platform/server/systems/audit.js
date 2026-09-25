// Internal Audit — التدقيق الداخلي.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "audit",
  name_ar: "التدقيق الداخلي", name_en: "Internal Audit",
  description_ar: "خطة التدقيق والمهام والملاحظات وخطط المعالجة والمتابعة، وطلبات المدقق الخارجي",
  description_en: "Audit plan, engagements, findings, action plans and follow-up, plus external auditor requests",
  icon: "searchCheck", category: "governance",
  external: true,
  access: (u) => isStaff(u) || hasCap(u, 'audit.external'),
  defaultPinned: (u) => hasCap(u, 'audit.head', 'audit.auditor', 'audit.committee', 'audit.external') || u.role === 'manager',
  caps: [
    { cap: "audit.head", ar: "رئاسة التدقيق الداخلي (اعتماد الخطة وإصدار التقارير)", en: "Chief audit executive (approve plan, issue reports)" },
    { cap: "audit.auditor", ar: "مدقق داخلي", en: "Internal auditor" },
    { cap: "audit.committee", ar: "لجنة التدقيق (اطلاع على التقارير الصادرة)", en: "Audit committee (issued reports)" },
    { cap: "audit.external", ar: "مدقق خارجي (بوابة الطلبات فقط)", en: "External auditor (requests portal only)", external: true }
  ],
  domains: [
    { key: "audit.workpapers", name_ar: "أوراق العمل وملفات التدقيق", name_en: "Audit working papers", classification: "restricted", ai: "off", locked: true, note_ar: "للمدققين الداخليين فقط", note_en: "Internal auditors only" },
    { key: "audit.findings", name_ar: "الملاحظات وخطط المعالجة الصادرة", name_en: "Issued findings and action plans", classification: "confidential", ai: "opt_in", note_ar: "تظهر للجهة الخاضعة للتدقيق بعد إصدارها", note_en: "Visible to the auditee once issued" },
  ],
});
