/*
 * FALAJ Language Context
 * Supports English and Arabic with RTL layout switching
 */
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

type Lang = "en" | "ar";

interface Translations {
  [key: string]: { en: string; ar: string };
}

const translations: Translations = {
  // Navigation
  dashboard: { en: "Dashboard", ar: "لوحة التحكم" },
  sensors: { en: "Sensors", ar: "المستشعرات" },
  market: { en: "Market", ar: "السوق" },
  rewards: { en: "Rewards", ar: "المكافآت" },
  profile: { en: "Profile", ar: "الملف الشخصي" },
  // Dashboard
  goodMorning: { en: "Good morning", ar: "صباح الخير" },
  welcomeBack: { en: "Welcome back!", ar: "!مرحباً بعودتك" },
  currentWeather: { en: "Current Weather", ar: "الطقس الحالي" },
  quickActions: { en: "Quick Actions", ar: "إجراءات سريعة" },
  sensorStatus: { en: "Sensor Status", ar: "حالة المستشعرات" },
  viewAll: { en: "View all", ar: "عرض الكل" },
  orders: { en: "Orders", ar: "الطلبات" },
  admin: { en: "Admin", ar: "المسؤول" },
  faqs: { en: "FAQs", ar: "الأسئلة الشائعة" },
  // Marketplace
  products: { en: "Products", ar: "المنتجات" },
  services: { en: "Services", ar: "الخدمات" },
  myListings: { en: "My Listings", ar: "إعلاناتي" },
  license: { en: "License", ar: "الرخصة" },
  addToCart: { en: "Add to Cart", ar: "أضف إلى السلة" },
  buyNow: { en: "Buy Now", ar: "اشتري الآن" },
  sellItem: { en: "Sell Item", ar: "بيع منتج" },
  // Settings
  settings: { en: "Settings", ar: "الإعدادات" },
  notifications: { en: "Notifications", ar: "الإشعارات" },
  language: { en: "Language", ar: "اللغة" },
  appearance: { en: "Appearance", ar: "المظهر" },
  darkMode: { en: "Dark Mode", ar: "الوضع الداكن" },
  // AI Recommendations
  aiRecommendations: { en: "AI Recommendations", ar: "توصيات الذكاء الاصطناعي" },
  accept: { en: "Accept", ar: "قبول" },
  reject: { en: "Reject", ar: "رفض" },
  undo: { en: "Undo", ar: "تراجع" },
  pending: { en: "Pending", ar: "معلق" },
  accepted: { en: "Accepted", ar: "مقبول" },
  rejected: { en: "Rejected", ar: "مرفوض" },
  // General
  search: { en: "Search", ar: "بحث" },
  back: { en: "Back", ar: "رجوع" },
  save: { en: "Save", ar: "حفظ" },
  cancel: { en: "Cancel", ar: "إلغاء" },
  confirm: { en: "Confirm", ar: "تأكيد" },
  loading: { en: "Loading...", ar: "...جاري التحميل" },
  about: { en: "About", ar: "حول" },
  contactSupport: { en: "Contact Support", ar: "اتصل بالدعم" },
  messages: { en: "Messages", ar: "الرسائل" },
  bookService: { en: "Book Service", ar: "حجز خدمة" },
  recentActivity: { en: "Recent Activity", ar: "النشاط الأخير" },
  orderTracking: { en: "Order Tracking", ar: "تتبع الطلب" },
  chat: { en: "Chat", ar: "محادثة" },
  farmMap: { en: "Farm Map", ar: "خريطة المزرعة" },
  all: { en: "All", ar: "الكل" },
  high: { en: "High", ar: "عالي" },
  medium: { en: "Medium", ar: "متوسط" },
  low: { en: "Low", ar: "منخفض" },
  // AI & Community
  aiAssistant: { en: "AI Assistant", ar: "المساعد الذكي" },
  community: { en: "Community", ar: "المجتمع" },
  // Farm Features
  farmResources: { en: "Farm Resources", ar: "موارد المزرعة" },
  smartSensors: { en: "Smart Sensors", ar: "المستشعرات الذكية" },
  cropPlanning: { en: "Crop Planning", ar: "تخطيط المحاصيل" },
  supplyChain: { en: "Supply Chain", ar: "سلسلة التوريد" },
  resources: { en: "Resources", ar: "الموارد" },
  crops: { en: "Crops", ar: "المحاصيل" },
  supply: { en: "Supply", ar: "التوريد" },
  supplyAlerts: { en: "Supply Alerts", ar: "تنبيهات التوريد" },
  logistics: { en: "Logistics", ar: "الخدمات اللوجستية" },
  financials: { en: "Financials", ar: "المالية" },
};

interface LanguageContextType {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string) => string;
  isRTL: boolean;
}

const LanguageContext = createContext<LanguageContextType>({
  lang: "en",
  setLang: () => {},
  t: (key: string) => key,
  isRTL: false,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem("falaj-lang");
    return (saved === "ar" ? "ar" : "en") as Lang;
  });

  const isRTL = lang === "ar";

  useEffect(() => {
    localStorage.setItem("falaj-lang", lang);
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [lang, isRTL]);

  const t = (key: string): string => {
    const entry = translations[key];
    if (!entry) return key;
    return entry[lang] || entry.en || key;
  };

  return (
    <LanguageContext.Provider value={{ lang, setLang, t, isRTL }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
