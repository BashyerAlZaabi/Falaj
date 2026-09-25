export type SeedPath = {
  slug: string;
  titleEn: string; titleAr: string;
  summaryEn: string; summaryAr: string;
  descriptionEn: string; descriptionAr: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  weeks: number;
  cover: string;
  skills: string[];
  outcomesEn: string[]; outcomesAr: string[];
  /** Ordered stages; courseSlugs are ordered within the stage; projectSlugs reference seeded projects; capstone marks the final stage. */
  stages: Array<{ key: string; titleEn: string; titleAr: string; descriptionEn: string; descriptionAr: string; courseSlugs: string[]; projectSlugs?: string[]; kind: "foundation" | "core" | "applied" | "advanced" | "capstone" | "certification" }>;
};

export const PATHS: SeedPath[] = [
  {
    slug: "ai-generative-ai-professional",
    titleEn: "AI & Generative AI Professional", titleAr: "محترف الذكاء الاصطناعي والذكاء التوليدي",
    summaryEn: "From AI literacy to building a production-grade, bilingual AI assistant — eight modules, two projects, one capstone.",
    summaryAr: "من محو الأمية في الذكاء الاصطناعي إلى بناء مساعد ذكي ثنائي اللغة بجودة الإنتاج — ثماني وحدات، مشروعان، ومشروع ختامي.",
    descriptionEn: "The flagship Nokhba path. Modules: 1 AI Fundamentals · 2 Machine Learning Fundamentals · 3 Generative AI · 4 Prompt Engineering · 5 Large Language Models · 6 AI Agents · 7 Responsible AI · 8 AI Projects. Capstone: build an AI-powered enterprise assistant.",
    descriptionAr: "مسار نخبة الرئيسي. الوحدات: 1 أساسيات الذكاء الاصطناعي · 2 أساسيات تعلّم الآلة · 3 الذكاء التوليدي · 4 هندسة الأوامر · 5 النماذج اللغوية الكبيرة · 6 وكلاء الذكاء الاصطناعي · 7 الذكاء الاصطناعي المسؤول · 8 مشاريع الذكاء الاصطناعي. المشروع الختامي: بناء مساعد مؤسسي بالذكاء الاصطناعي.",
    difficulty: "INTERMEDIATE", weeks: 20, cover: "cover-aurora",
    skills: ["artificial-intelligence", "machine-learning", "generative-ai", "prompt-engineering", "llms", "ai-agents", "rag", "responsible-ai"],
    outcomesEn: ["Explain and evaluate AI systems critically", "Engineer prompts and structured outputs for real workflows", "Build RAG pipelines and tool-using agents", "Govern AI responsibly in an organisation", "Ship a bilingual enterprise AI assistant"],
    outcomesAr: ["شرح أنظمة الذكاء الاصطناعي وتقييمها بعين ناقدة", "هندسة الأوامر والمخرجات المنظّمة لسير عمل حقيقي", "بناء خطوط RAG ووكلاء يستخدمون الأدوات", "حوكمة الذكاء الاصطناعي بمسؤولية في المؤسسة", "إطلاق مساعد مؤسسي ثنائي اللغة"],
    stages: [
      { key: "foundation", kind: "foundation", titleEn: "Foundation", titleAr: "الأساس", descriptionEn: "Modules 1-2: AI Fundamentals and Machine Learning Fundamentals.", descriptionAr: "الوحدتان 1-2: أساسيات الذكاء الاصطناعي وأساسيات تعلّم الآلة.", courseSlugs: ["ai-fundamentals", "machine-learning-fundamentals"] },
      { key: "core", kind: "core", titleEn: "Core skills", titleAr: "المهارات الجوهرية", descriptionEn: "Modules 3-4: Generative AI and Prompt Engineering.", descriptionAr: "الوحدتان 3-4: الذكاء التوليدي وهندسة الأوامر.", courseSlugs: ["generative-ai-and-prompt-engineering"], projectSlugs: ["prompt-library"] },
      { key: "applied", kind: "applied", titleEn: "Applied projects", titleAr: "المشاريع التطبيقية", descriptionEn: "Apply the fundamentals: opportunity map and model evaluation report.", descriptionAr: "طبّق الأساسيات: خريطة الفرص وتقرير تقييم النموذج.", courseSlugs: [], projectSlugs: ["ai-opportunity-map", "churn-model-report"] },
      { key: "advanced", kind: "advanced", titleEn: "Advanced skills", titleAr: "المهارات المتقدمة", descriptionEn: "Modules 5-7: LLMs, AI Agents and Responsible AI.", descriptionAr: "الوحدات 5-7: النماذج اللغوية الكبيرة ووكلاء الذكاء الاصطناعي والذكاء المسؤول.", courseSlugs: ["llms-and-ai-agents", "responsible-ai-and-governance"] },
      { key: "capstone", kind: "capstone", titleEn: "Capstone project", titleAr: "المشروع الختامي", descriptionEn: "Module 8: build an AI-powered enterprise assistant.", descriptionAr: "الوحدة 8: بناء مساعد مؤسسي بالذكاء الاصطناعي.", courseSlugs: [], projectSlugs: ["enterprise-assistant-capstone"] },
      { key: "certification", kind: "certification", titleEn: "Certification", titleAr: "الشهادة", descriptionEn: "Pass the final assessments and receive the path certificate.", descriptionAr: "اجتز الاختبارات النهائية واحصل على شهادة المسار.", courseSlugs: [] },
    ],
  },
  {
    slug: "cybersecurity-analyst",
    titleEn: "Cybersecurity Analyst", titleAr: "محلل الأمن السيبراني",
    summaryEn: "Foundations, cloud security and hands-on threat modeling for a first role in a security operations team.",
    summaryAr: "الأساسيات وأمن السحابة ونمذجة التهديدات العملية لأول دور في فريق عمليات الأمن.",
    descriptionEn: "Build defender instincts: the CIA triad, STRIDE threat modeling, identity and access, incident response and cloud shared responsibility — with a threat-model project reviewed against a professional rubric.",
    descriptionAr: "ابنِ غرائز المدافع: ثالوث CIA، ونمذجة التهديدات بـ STRIDE، والهوية والوصول، والاستجابة للحوادث، والمسؤولية المشتركة في السحابة — مع مشروع نمذجة تهديدات يُراجع وفق معيار مهني.",
    difficulty: "BEGINNER", weeks: 10, cover: "cover-ember",
    skills: ["cybersecurity-fundamentals", "threat-modeling", "identity-access", "incident-response", "cloud-fundamentals"],
    outcomesEn: ["Model threats for real systems", "Design identity and access controls", "Respond to incidents methodically", "Secure cloud workloads at the customer layer"],
    outcomesAr: ["نمذجة التهديدات لأنظمة حقيقية", "تصميم ضوابط الهوية والوصول", "الاستجابة للحوادث بمنهجية", "تأمين أحمال العمل السحابية في طبقة العميل"],
    stages: [
      { key: "foundation", kind: "foundation", titleEn: "Foundation", titleAr: "الأساس", descriptionEn: "Cybersecurity Foundations.", descriptionAr: "أساسيات الأمن السيبراني.", courseSlugs: ["cybersecurity-foundations"] },
      { key: "core", kind: "core", titleEn: "Core skills", titleAr: "المهارات الجوهرية", descriptionEn: "Cloud Fundamentals with the shared-responsibility model.", descriptionAr: "أساسيات السحابة مع نموذج المسؤولية المشتركة.", courseSlugs: ["cloud-fundamentals"] },
      { key: "capstone", kind: "capstone", titleEn: "Capstone project", titleAr: "المشروع الختامي", descriptionEn: "Threat model for a real system.", descriptionAr: "نموذج تهديدات لنظام حقيقي.", courseSlugs: [], projectSlugs: ["threat-model-report"] },
      { key: "certification", kind: "certification", titleEn: "Certification", titleAr: "الشهادة", descriptionEn: "Final assessments and path certificate.", descriptionAr: "الاختبارات النهائية وشهادة المسار.", courseSlugs: [] },
    ],
  },
  {
    slug: "data-analyst",
    titleEn: "Data Analyst", titleAr: "محلل البيانات",
    summaryEn: "Python, pandas, honest charts and insight briefs — the analyst's loop, end to end.",
    summaryAr: "بايثون وpandas والرسوم الأمينة وموجزات الرؤى — حلقة المحلل من البداية للنهاية.",
    descriptionEn: "Start with Python, move to data analytics, and finish with a machine-learning foundation so you can partner with data scientists confidently.",
    descriptionAr: "ابدأ ببايثون، وانتقل إلى تحليل البيانات، واختتم بأساس في تعلّم الآلة لتتعاون مع علماء البيانات بثقة.",
    difficulty: "BEGINNER", weeks: 14, cover: "cover-sand",
    skills: ["python", "pandas", "data-analysis", "data-visualization", "statistics", "machine-learning"],
    outcomesEn: ["Write Python for data work", "Clean, aggregate and join datasets", "Communicate insights with honest charts", "Understand how ML models are built and evaluated"],
    outcomesAr: ["كتابة بايثون للعمل مع البيانات", "تنظيف البيانات وتجميعها وربطها", "إيصال الرؤى برسوم أمينة", "فهم كيفية بناء نماذج تعلّم الآلة وتقييمها"],
    stages: [
      { key: "foundation", kind: "foundation", titleEn: "Foundation", titleAr: "الأساس", descriptionEn: "Python Programming Essentials.", descriptionAr: "أساسيات البرمجة بلغة بايثون.", courseSlugs: ["python-programming-essentials"] },
      { key: "core", kind: "core", titleEn: "Core skills", titleAr: "المهارات الجوهرية", descriptionEn: "Data Analytics with Python.", descriptionAr: "تحليل البيانات باستخدام بايثون.", courseSlugs: ["data-analytics-with-python"], projectSlugs: ["insight-brief"] },
      { key: "advanced", kind: "advanced", titleEn: "Advanced skills", titleAr: "المهارات المتقدمة", descriptionEn: "Machine Learning Fundamentals.", descriptionAr: "أساسيات تعلّم الآلة.", courseSlugs: ["machine-learning-fundamentals"] },
      { key: "capstone", kind: "capstone", titleEn: "Capstone project", titleAr: "المشروع الختامي", descriptionEn: "Model evaluation report.", descriptionAr: "تقرير تقييم نموذج.", courseSlugs: [], projectSlugs: ["churn-model-report"] },
      { key: "certification", kind: "certification", titleEn: "Certification", titleAr: "الشهادة", descriptionEn: "Final assessments and path certificate.", descriptionAr: "الاختبارات النهائية وشهادة المسار.", courseSlugs: [] },
    ],
  },
  {
    slug: "digital-transformation-leader",
    titleEn: "Digital Transformation Leader", titleAr: "قائد التحول الرقمي",
    summaryEn: "Strategy, service design, responsible AI and cloud literacy for leaders who own outcomes.",
    summaryAr: "الاستراتيجية وتصميم الخدمات والذكاء المسؤول والثقافة السحابية للقادة الذين يملكون النتائج.",
    descriptionEn: "A leadership path that pairs transformation practice with enough AI and cloud literacy to make good calls and ask hard questions.",
    descriptionAr: "مسار قيادي يجمع ممارسة التحول مع قدر كافٍ من ثقافة الذكاء الاصطناعي والسحابة لاتخاذ قرارات جيدة وطرح أسئلة صعبة.",
    difficulty: "INTERMEDIATE", weeks: 12, cover: "cover-mint",
    skills: ["digital-transformation", "change-management", "service-design", "responsible-ai", "cloud-fundamentals", "leadership"],
    outcomesEn: ["Diagnose and steer transformations", "Design services around people", "Govern AI use responsibly", "Make informed cloud decisions"],
    outcomesAr: ["تشخيص التحولات وتوجيهها", "تصميم الخدمات حول الناس", "حوكمة استخدام الذكاء الاصطناعي بمسؤولية", "اتخاذ قرارات سحابية مستنيرة"],
    stages: [
      { key: "foundation", kind: "foundation", titleEn: "Foundation", titleAr: "الأساس", descriptionEn: "AI Fundamentals and Cloud Fundamentals.", descriptionAr: "أساسيات الذكاء الاصطناعي وأساسيات السحابة.", courseSlugs: ["ai-fundamentals", "cloud-fundamentals"] },
      { key: "core", kind: "core", titleEn: "Core skills", titleAr: "المهارات الجوهرية", descriptionEn: "Digital Transformation Leadership.", descriptionAr: "قيادة التحول الرقمي.", courseSlugs: ["digital-transformation-leadership"] },
      { key: "advanced", kind: "advanced", titleEn: "Advanced skills", titleAr: "المهارات المتقدمة", descriptionEn: "Responsible AI & Governance.", descriptionAr: "الذكاء الاصطناعي المسؤول والحوكمة.", courseSlugs: ["responsible-ai-and-governance"] },
      { key: "capstone", kind: "capstone", titleEn: "Capstone project", titleAr: "المشروع الختامي", descriptionEn: "AI opportunity map for one process.", descriptionAr: "خريطة فرص الذكاء الاصطناعي لعملية واحدة.", courseSlugs: [], projectSlugs: ["ai-opportunity-map"] },
      { key: "certification", kind: "certification", titleEn: "Certification", titleAr: "الشهادة", descriptionEn: "Final assessments and path certificate.", descriptionAr: "الاختبارات النهائية وشهادة المسار.", courseSlugs: [] },
    ],
  },
];
