/** Skill taxonomy: slug, names, category, optional parent slug. */
export const SKILLS: Array<{ slug: string; nameEn: string; nameAr: string; category: string; parent?: string }> = [
  // AI
  { slug: "artificial-intelligence", nameEn: "Artificial Intelligence", nameAr: "الذكاء الاصطناعي", category: "ai" },
  { slug: "machine-learning", nameEn: "Machine Learning", nameAr: "تعلّم الآلة", category: "ai", parent: "artificial-intelligence" },
  { slug: "deep-learning", nameEn: "Deep Learning", nameAr: "التعلّم العميق", category: "ai", parent: "machine-learning" },
  { slug: "generative-ai", nameEn: "Generative AI", nameAr: "الذكاء الاصطناعي التوليدي", category: "ai", parent: "artificial-intelligence" },
  { slug: "prompt-engineering", nameEn: "Prompt Engineering", nameAr: "هندسة الأوامر", category: "ai", parent: "generative-ai" },
  { slug: "llms", nameEn: "Large Language Models", nameAr: "النماذج اللغوية الكبيرة", category: "ai", parent: "generative-ai" },
  { slug: "ai-agents", nameEn: "AI Agents", nameAr: "وكلاء الذكاء الاصطناعي", category: "ai", parent: "llms" },
  { slug: "rag", nameEn: "Retrieval-Augmented Generation", nameAr: "التوليد المعزّز بالاسترجاع", category: "ai", parent: "llms" },
  { slug: "responsible-ai", nameEn: "Responsible AI", nameAr: "الذكاء الاصطناعي المسؤول", category: "ai", parent: "artificial-intelligence" },
  { slug: "model-evaluation", nameEn: "Model Evaluation", nameAr: "تقييم النماذج", category: "ai", parent: "machine-learning" },
  // Data
  { slug: "data-analysis", nameEn: "Data Analysis", nameAr: "تحليل البيانات", category: "data" },
  { slug: "python", nameEn: "Python", nameAr: "بايثون", category: "programming" },
  { slug: "pandas", nameEn: "pandas", nameAr: "pandas", category: "data", parent: "python" },
  { slug: "sql", nameEn: "SQL", nameAr: "SQL", category: "data", parent: "data-analysis" },
  { slug: "data-visualization", nameEn: "Data Visualization", nameAr: "تصوير البيانات", category: "data", parent: "data-analysis" },
  { slug: "statistics", nameEn: "Statistics", nameAr: "الإحصاء", category: "data", parent: "data-analysis" },
  { slug: "data-storytelling", nameEn: "Data Storytelling", nameAr: "سرد البيانات", category: "data", parent: "data-analysis" },
  // Programming
  { slug: "programming-fundamentals", nameEn: "Programming Fundamentals", nameAr: "أساسيات البرمجة", category: "programming" },
  { slug: "javascript", nameEn: "JavaScript", nameAr: "جافاسكريبت", category: "programming", parent: "programming-fundamentals" },
  { slug: "problem-solving", nameEn: "Problem Solving", nameAr: "حل المشكلات", category: "programming" },
  { slug: "apis", nameEn: "APIs & Integration", nameAr: "الواجهات البرمجية والتكامل", category: "programming" },
  // Cybersecurity
  { slug: "cybersecurity-fundamentals", nameEn: "Cybersecurity Fundamentals", nameAr: "أساسيات الأمن السيبراني", category: "cybersecurity" },
  { slug: "threat-modeling", nameEn: "Threat Modeling", nameAr: "نمذجة التهديدات", category: "cybersecurity", parent: "cybersecurity-fundamentals" },
  { slug: "network-security", nameEn: "Network Security", nameAr: "أمن الشبكات", category: "cybersecurity", parent: "cybersecurity-fundamentals" },
  { slug: "incident-response", nameEn: "Incident Response", nameAr: "الاستجابة للحوادث", category: "cybersecurity", parent: "cybersecurity-fundamentals" },
  { slug: "identity-access", nameEn: "Identity & Access Management", nameAr: "إدارة الهوية والوصول", category: "cybersecurity", parent: "cybersecurity-fundamentals" },
  { slug: "security-awareness", nameEn: "Security Awareness", nameAr: "الوعي الأمني", category: "cybersecurity" },
  // Cloud
  { slug: "cloud-fundamentals", nameEn: "Cloud Fundamentals", nameAr: "أساسيات الحوسبة السحابية", category: "cloud" },
  { slug: "devops", nameEn: "DevOps", nameAr: "DevOps", category: "cloud", parent: "cloud-fundamentals" },
  // Leadership / business / DT
  { slug: "digital-transformation", nameEn: "Digital Transformation", nameAr: "التحول الرقمي", category: "digital-transformation" },
  { slug: "change-management", nameEn: "Change Management", nameAr: "إدارة التغيير", category: "leadership", parent: "digital-transformation" },
  { slug: "strategic-thinking", nameEn: "Strategic Thinking", nameAr: "التفكير الاستراتيجي", category: "leadership" },
  { slug: "leadership", nameEn: "Leadership", nameAr: "القيادة", category: "leadership" },
  { slug: "project-management", nameEn: "Project Management", nameAr: "إدارة المشاريع", category: "business" },
  { slug: "agile", nameEn: "Agile Delivery", nameAr: "المنهجية الرشيقة", category: "business", parent: "project-management" },
  { slug: "communication", nameEn: "Communication", nameAr: "التواصل", category: "leadership" },
  { slug: "service-design", nameEn: "Service Design", nameAr: "تصميم الخدمات", category: "digital-transformation" },
  { slug: "product-management", nameEn: "Product Management", nameAr: "إدارة المنتجات", category: "business" },
  { slug: "innovation", nameEn: "Innovation Methods", nameAr: "أساليب الابتكار", category: "innovation" },
  { slug: "financial-literacy", nameEn: "Financial Literacy", nameAr: "الثقافة المالية", category: "finance" },
];
