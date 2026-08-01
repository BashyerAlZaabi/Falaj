/**
 * أدوات المساعد — القائمة منقولة كما هي من PROMPT §7.
 * التعريفات تعيش على الخادم (route handler)؛ التنفيذ محلي في العميل.
 */

type ToolDef = {
  name: string;
  description: string;
  input_schema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
};

export const AGENT_TOOLS: ToolDef[] = [
  {
    name: "add_plot",
    description:
      "أضف قطعة أرض جديدة للمزرعة. استخدمها عندما يطلب المستخدم إضافة قطعة بمساحة معيّنة.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم القطعة، مثل: القطعة الشمالية" },
        area_m2: { type: "number", description: "المساحة بالمتر المربع" },
      },
      required: ["name", "area_m2"],
    },
  },
  {
    name: "add_cycle",
    description:
      "ابدأ دورة محصول على قطعة. استخدمها عند طلب زراعة محصول (خيار، طماطم…).",
    input_schema: {
      type: "object",
      properties: {
        crop: { type: "string", description: "اسم المحصول" },
        plot_name: {
          type: "string",
          description: "اسم القطعة. اتركه فارغاً لآخر قطعة مضافة",
        },
        harvest_days: {
          type: "number",
          description: "عدد أيام الحصاد المتوقعة إن ذُكرت",
        },
      },
      required: ["crop"],
    },
  },
  {
    name: "add_task",
    description: "أضف مهمة جديدة، مع تاريخ استحقاق اختياري (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "نص المهمة" },
        due: { type: "string", description: "تاريخ الاستحقاق YYYY-MM-DD" },
      },
      required: ["title"],
    },
  },
  {
    name: "complete_task",
    description: "سكّر مهمة مفتوحة بذكر نصها أو جزء منه.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "نص المهمة أو جزء مميز منه" },
      },
      required: ["title"],
    },
  },
  {
    name: "add_stock",
    description:
      "أضف صنفاً للمخزون أو زد كميته (بذور، سماد، مستلزمات) مع حد أدنى اختياري.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم الصنف" },
        qty: { type: "number", description: "الكمية" },
        unit: { type: "string", description: "الوحدة: كجم، لتر، كيس…" },
        min_qty: { type: "number", description: "حد التنبيه الأدنى" },
      },
      required: ["name", "qty", "unit"],
    },
  },
  {
    name: "log_harvest",
    description: "سجّل حصاداً: المحصول والكمية والوحدة.",
    input_schema: {
      type: "object",
      properties: {
        crop: { type: "string", description: "المحصول" },
        qty: { type: "number", description: "الكمية" },
        unit: { type: "string", description: "الوحدة" },
      },
      required: ["crop", "qty", "unit"],
    },
  },
  {
    name: "log_sale",
    description: "سجّل عملية بيع: الصنف والمبلغ بالدرهم.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "الصنف المباع" },
        amount: { type: "number", description: "المبلغ بالدرهم" },
      },
      required: ["item", "amount"],
    },
  },
  {
    name: "log_cost",
    description: "سجّل مصروفاً: البند والمبلغ بالدرهم.",
    input_schema: {
      type: "object",
      properties: {
        item: { type: "string", description: "بند المصروف" },
        amount: { type: "number", description: "المبلغ بالدرهم" },
      },
      required: ["item", "amount"],
    },
  },
  {
    name: "add_doc",
    description: "أضف ترخيصاً أو وثيقة مع تاريخ انتهاء اختياري (YYYY-MM-DD).",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string", description: "اسم الترخيص أو الوثيقة" },
        expiry: { type: "string", description: "تاريخ الانتهاء YYYY-MM-DD" },
      },
      required: ["name"],
    },
  },
  {
    name: "backup_data",
    description: "نزّل نسخة احتياطية من كل بيانات المزرعة كملف JSON.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "print_report",
    description: "اطبع تقريراً شاملاً عن المزرعة.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "open_module",
    description:
      "افتح قسماً من التطبيق للمستخدم. الأقسام: land, plots, crops, tasks, stock, sensors, money, docs, roadmap, funds, partners, entities, rewards, today, assistant.",
    input_schema: {
      type: "object",
      properties: {
        module: { type: "string", description: "مفتاح القسم" },
      },
      required: ["module"],
    },
  },
];

/** أداة الاستقبال المحادثي (المرحلة ٤) — تُفعَّل من صفحة الاستقبال فقط. */
export const ONBOARDING_TOOL: ToolDef = {
  name: "set_profile",
  description:
    "احفظ ملف المستخدم عندما تعرف الثلاثة: النشاط والإمارة والمرحلة. لا تستدعها قبل اكتمالها.",
  input_schema: {
    type: "object",
    properties: {
      activity: { type: "string", description: "النشاط الزراعي" },
      emirate: { type: "string", description: "الإمارة" },
      stage: { type: "string", description: "مرحلة المشروع: فكرة، تأسيس، تشغيل" },
    },
    required: ["activity", "emirate", "stage"],
  },
};
