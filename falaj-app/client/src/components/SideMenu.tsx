/*
 * FALAJ Side Menu — Simplified for hub navigation
 * Mirrors the 5-tab structure: Home, Farm, Trade, Money, More
 * Power users can access everything from here too
 */
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  X, Settings, HelpCircle, Phone, Info, Shield,
  Package, MessageSquare, Globe, ChevronRight, User, Bot, Users,
  Award, BarChart3, Sprout, Radio, Handshake,
  BellRing, Truck, CircleDollarSign, LayoutDashboard, Leaf,
  ShoppingBag, MoreHorizontal, Star
} from "lucide-react";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";

interface SideMenuProps {
  open: boolean;
  onClose: () => void;
}

const menuSections = [
  {
    title: "Navigate",
    titleAr: "التنقل",
    items: [
      { label: "Home", labelAr: "الرئيسية", icon: LayoutDashboard, path: "/dashboard" },
      { label: "My Farm", labelAr: "مزرعتي", icon: Leaf, path: "/farm" },
      { label: "Trade", labelAr: "التجارة", icon: ShoppingBag, path: "/trade" },
      { label: "Money", labelAr: "المالية", icon: CircleDollarSign, path: "/money" },
    ],
  },
  {
    title: "Farm Tools",
    titleAr: "أدوات المزرعة",
    items: [
      { label: "Smart Sensors", labelAr: "المستشعرات الذكية", icon: Radio, path: "/smart-sensors" },
      { label: "Farm Resources", labelAr: "موارد المزرعة", icon: BarChart3, path: "/farm-resources" },
      { label: "Crop Planning", labelAr: "تخطيط المحاصيل", icon: Sprout, path: "/crop-planning" },
    ],
  },
  {
    title: "Trade Tools",
    titleAr: "أدوات التجارة",
    items: [
      { label: "Marketplace", labelAr: "السوق", icon: Package, path: "/marketplace" },
      { label: "B2B Supply", labelAr: "سلسلة التوريد", icon: Handshake, path: "/supply-chain" },
      { label: "Supply Alerts", labelAr: "تنبيهات التوريد", icon: BellRing, path: "/supply-notifications" },
      { label: "Logistics", labelAr: "اللوجستيات", icon: Truck, path: "/logistics" },
    ],
  },
  {
    title: "More",
    titleAr: "المزيد",
    items: [
      { label: "AI Assistant", labelAr: "المساعد الذكي", icon: Bot, path: "/ai-assistant" },
      { label: "Community", labelAr: "المجتمع", icon: Users, path: "/community" },
      { label: "Rewards", labelAr: "المكافآت", icon: Award, path: "/rewards" },
      { label: "Admin", labelAr: "الإدارة", icon: Shield, path: "/admin" },
      { label: "Settings", labelAr: "الإعدادات", icon: Settings, path: "/settings" },
      { label: "About", labelAr: "حول", icon: Info, path: "/about" },
    ],
  },
];

export default function SideMenu({ open, onClose }: SideMenuProps) {
  const { t, lang, setLang } = useLanguage();

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/20 backdrop-blur-md z-[60]"
            onClick={onClose}
          />
          <motion.div
            initial={{ x: lang === "ar" ? 320 : -320 }}
            animate={{ x: 0 }}
            exit={{ x: lang === "ar" ? 320 : -320 }}
            transition={{ type: "spring", stiffness: 350, damping: 35 }}
            className={`fixed top-0 ${lang === "ar" ? "right-0" : "left-0"} h-full w-[300px] bg-white/95 backdrop-blur-2xl z-[70] shadow-2xl flex flex-col`}
          >
            {/* Header with user profile */}
            <div className="p-5 border-b border-border/15 bg-gradient-to-br from-emerald-50/50 to-green-50/30">
              <div className="flex items-center justify-between mb-4">
                <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-5" />
                <button
                  onClick={onClose}
                  className="p-2.5 rounded-xl hover:bg-white/80 transition-colors active:scale-95"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <Link href="/profile">
                <button onClick={onClose} className="flex items-center gap-3 w-full text-left">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-600 to-green-600 flex items-center justify-center text-white font-bold text-lg shadow-md">
                    A
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold truncate">Ahmed Al Dhaheri</p>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <span className="text-[10px] text-muted-foreground">Al Ain Farm</span>
                      <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full flex items-center gap-0.5">
                        <Star className="w-2.5 h-2.5" /> Lv.12
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                </button>
              </Link>
            </div>

            {/* Menu Items */}
            <div className="flex-1 overflow-y-auto py-2">
              {menuSections.map((section, si) => (
                <div key={si} className="mb-1">
                  <p className="px-5 py-2 text-[10px] font-bold text-muted-foreground uppercase tracking-widest">
                    {lang === "ar" ? section.titleAr : section.title}
                  </p>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    return (
                      <Link key={item.path} href={item.path}>
                        <button
                          onClick={onClose}
                          className="w-full flex items-center gap-3 px-5 py-3 hover:bg-muted/40 transition-colors active:bg-muted/60"
                        >
                          <div className="p-2 rounded-xl bg-muted/50">
                            <Icon className="w-4.5 h-4.5 text-muted-foreground" />
                          </div>
                          <span className="flex-1 text-sm font-medium text-left">
                            {lang === "ar" ? item.labelAr : item.label}
                          </span>
                          <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                        </button>
                      </Link>
                    );
                  })}
                </div>
              ))}
            </div>

            {/* Language Toggle */}
            <div className="p-4 border-t border-border/30">
              <button
                onClick={() => setLang(lang === "en" ? "ar" : "en")}
                className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-muted/40 hover:bg-muted rounded-xl transition-colors active:scale-[0.98]"
              >
                <Globe className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-semibold">
                  {lang === "en" ? "العربية" : "English"}
                </span>
              </button>
              <p className="text-center text-[10px] text-muted-foreground mt-2">
                FALAJ v2.3.0
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
