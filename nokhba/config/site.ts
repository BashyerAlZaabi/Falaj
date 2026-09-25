export const siteConfig = {
  name: "Nokhba",
  nameAr: "نخبة",
  tagline: "Learn differently. Powered by intelligence.",
  taglineAr: "تعلّم بطريقة مختلفة. مدعومًا بالذكاء.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  supportEmail: "support@nokhba.example",
};

export const CATEGORIES = [
  { slug: "ai", nameEn: "Artificial Intelligence", nameAr: "الذكاء الاصطناعي", icon: "Sparkles" },
  { slug: "cybersecurity", nameEn: "Cybersecurity", nameAr: "الأمن السيبراني", icon: "ShieldCheck" },
  { slug: "cloud", nameEn: "Cloud", nameAr: "الحوسبة السحابية", icon: "Cloud" },
  { slug: "programming", nameEn: "Programming", nameAr: "البرمجة", icon: "Code2" },
  { slug: "data", nameEn: "Data", nameAr: "البيانات", icon: "Database" },
  { slug: "business", nameEn: "Business", nameAr: "الأعمال", icon: "Briefcase" },
  { slug: "leadership", nameEn: "Leadership", nameAr: "القيادة", icon: "Crown" },
  { slug: "finance", nameEn: "Finance", nameAr: "المالية", icon: "Landmark" },
  { slug: "digital-transformation", nameEn: "Digital Transformation", nameAr: "التحول الرقمي", icon: "Rocket" },
  { slug: "innovation", nameEn: "Innovation", nameAr: "الابتكار", icon: "Lightbulb" },
] as const;

export const LEVELS = ["beginner", "intermediate", "advanced"] as const;
export const GOALS = ["career", "certification", "university", "professional", "personal"] as const;
export const STYLES = ["video", "reading", "practice", "projects", "mixed"] as const;
export const WEEKLY_HOURS = [2, 5, 10] as const;
export const EXPLANATION_LEVELS = ["simple", "standard", "technical", "expert"] as const;
