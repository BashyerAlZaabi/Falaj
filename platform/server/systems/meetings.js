// Meetings — نظام الاجتماعات.
// PLACEHOLDER: metadata and access rules are final; routes, schema, seed, tools,
// intents, workspace cards and game events are built in this module.
import { defineSystem } from './registry.js';
import { isStaff, hasCap } from './kit.js';

defineSystem({
  key: "meetings",
  name_ar: "نظام الاجتماعات", name_en: "Meetings",
  description_ar: "جدولة الاجتماعات وجداول الأعمال والمحاضر والقرارات والتكليفات",
  description_en: "Schedule meetings, agendas, minutes, decisions and action items",
  icon: "calendarClock", category: "operations",
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [],
  domains: [
    { key: "meetings.general", name_ar: "الاجتماعات ومحاضرها", name_en: "Meetings and minutes", classification: "internal", ai: "allowed" },
    { key: "meetings.confidential", name_ar: "اجتماعات اللجان السرية", name_en: "Confidential committee meetings", classification: "restricted", ai: "off", locked: true, note_ar: "للحضور المدعوين فقط، ولا يصل إليها المساعد الذكي", note_en: "Invited attendees only; never available to Ask AI" },
  ],
});
