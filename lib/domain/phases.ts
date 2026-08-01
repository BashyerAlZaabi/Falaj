import { activityMode } from "./activities";

/**
 * خارطة الطريق — ٤ مراحل، وخطواتها تتبدّل حسب الإمارة والنشاط،
 * والخطوات الاتحادية موسومة (PROMPT §9).
 * أسماء الجهات المحلية غير المؤكدة تُترك «الجهة المختصة في {الإمارة}»
 * ويجيب المساعد تفاصيلها ببحث حي.
 */

export type RoadmapStep = {
  id: string;
  title: string;
  federal: boolean;
  entity?: string;
};

export type RoadmapPhase = {
  key: string;
  title: string;
  steps: RoadmapStep[];
};

export function buildRoadmap(
  emirate: string | null | undefined,
  activity: string | null | undefined,
): RoadmapPhase[] {
  const em = emirate || "إمارتك";
  const mode = activityMode(activity);
  const land = mode === "land";
  const localAuthority =
    em === "أبوظبي" && land
      ? "هيئة أبوظبي للزراعة والسلامة الغذائية"
      : `الجهة المختصة في ${em}`;

  return [
    {
      key: "idea",
      title: "فكرة وتخطيط",
      steps: [
        { id: "idea-1", title: `حدّد نشاطك (${activity || "نشاطك"}) ونموذج مشروعك`, federal: false },
        { id: "idea-2", title: "جهّز دراسة جدوى مبسطة: التكاليف والإيراد المتوقع", federal: false },
        ...(land
          ? [{ id: "idea-3", title: `حدّد موقع الأرض أو الحيازة في ${em}`, federal: false }]
          : [{ id: "idea-3", title: `حدّد موقع المنشأة أو المخزن في ${em}`, federal: false }]),
        { id: "idea-4", title: "استكشف برامج الدعم والتمويل المناسبة", federal: false },
      ],
    },
    {
      key: "license",
      title: "ترخيص وتأسيس",
      steps: [
        { id: "lic-1", title: "احجز الاسم التجاري وأصدر الرخصة الاقتصادية", federal: false, entity: localAuthority },
        ...(land
          ? [{ id: "lic-2", title: "سجّل الحيازة الزراعية", federal: false, entity: localAuthority }]
          : [{ id: "lic-2", title: "استوفِ اشتراطات المنشأة والسجل الصناعي إن لزم", federal: true, entity: "وزارة الصناعة والتكنولوجيا المتقدمة" }]),
        { id: "lic-3", title: "استوفِ الاشتراطات الزراعية والبيئية للنشاط", federal: true, entity: "وزارة التغير المناخي والبيئة" },
        { id: "lic-4", title: "سجّل في المنظومة الضريبية إذا تجاوزت الحد", federal: true, entity: "الهيئة الاتحادية للضرائب" },
        { id: "lic-5", title: "وثّق النشاط في السجل الاقتصادي الوطني", federal: true, entity: "وزارة الاقتصاد والسياحة" },
      ],
    },
    {
      key: "setup",
      title: "تجهيز وتشغيل",
      steps: [
        ...(land
          ? [
              { id: "set-1", title: "جهّز الأرض: تسوية، ري، وبنية أساسية", federal: false },
              { id: "set-2", title: "قسّم الأرض لقطع وخطط الدورات الزراعية", federal: false },
            ]
          : [
              { id: "set-1", title: "جهّز المنشأة والمعدات واستوفِ اشتراطات السلامة", federal: false },
              { id: "set-2", title: "أمّن سلسلة التوريد والتخزين", federal: false },
            ]),
        { id: "set-3", title: "استقدم العمالة ووثّق عقودها", federal: true, entity: "وزارة الموارد البشرية والتوطين" },
        { id: "set-4", title: "أصدر إقامات العمال", federal: true, entity: "الهيئة الاتحادية للهوية والجنسية والجمارك وأمن المنافذ" },
        { id: "set-5", title: "ابدأ الإنتاج وسجّل عملياتك في التطبيق", federal: false },
      ],
    },
    {
      key: "grow",
      title: "نمو وتوسع",
      steps: [
        { id: "grow-1", title: "افتح قنوات بيع: أسواق محلية ومنصات وتجزئة", federal: false },
        ...(em === "أبوظبي" && land
          ? [{ id: "grow-2", title: "استكشف التوريد لسلال وسلاسل الإمداد", federal: false, entity: "سلال" }]
          : [{ id: "grow-2", title: "استكشف الشراكات التجارية في إمارتك", federal: false }]),
        { id: "grow-3", title: "قدّم على تمويل توسع إذا احتجت", federal: true, entity: "مصرف الإمارات للتنمية" },
        { id: "grow-4", title: "اعرض شراكة أو استثماراً عبر «الشراكات»", federal: false },
      ],
    },
  ];
}
