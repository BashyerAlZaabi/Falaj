/** الإمارات السبع — بترتيب يحاكي امتداد الساحل من الغرب للشرق. */
export const EMIRATES = [
  "أبوظبي",
  "دبي",
  "الشارقة",
  "عجمان",
  "أم القيوين",
  "رأس الخيمة",
  "الفجيرة",
] as const;

export type Emirate = (typeof EMIRATES)[number];

export const STAGES = ["فكرة", "تأسيس", "تشغيل"] as const;
export type Stage = (typeof STAGES)[number];
