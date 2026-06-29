/*
 * FALAJ More Hub — Everything else in one place
 * Connected to AppState for live user data
 */
import BottomNav from "@/components/BottomNav";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import {
  User, Gift, Settings, Shield, HelpCircle, Phone, Info,
  Bot, Users, Globe, ChevronRight, MessageSquare,
  Bell, Star, Crown
} from "lucide-react";
import { PACKAGE_TIERS } from "@/contexts/AppStateContext";

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.04 } } };
const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

export default function MoreHub() {
  const { lang, setLang } = useLanguage();
  const { user, unreadCount, challenges } = useAppState();

  const activeChallenges = challenges.filter(c => !c.completed).length;

  const pkgInfo = PACKAGE_TIERS[user.package || "seedling"];

  const menuItems = [
    {
      title: "Subscription",
      items: [
        { label: "My Plan: " + pkgInfo.name, icon: Crown, path: "/packages", badge: pkgInfo.price > 0 ? `${pkgInfo.price} AED/mo` : "Free", badgeColor: "bg-amber-50 text-amber-700" },
        { label: "Refer & Earn", icon: Gift, path: "/referrals", badge: `${user.referralsCount} referrals`, badgeColor: "bg-emerald-50 text-emerald-600" },
      ],
    },
    {
      title: "Features",
      items: [
        { label: "Rewards & Achievements", icon: Gift, path: "/rewards", badge: `Level ${user.level}`, badgeColor: "bg-emerald-50 text-emerald-600" },
        { label: "AI Assistant", icon: Bot, path: "/ai-assistant", badge: null, badgeColor: "" },
        { label: "Community", icon: Users, path: "/community", badge: "3.4K", badgeColor: "bg-blue-50 text-blue-600" },
        { label: "Messages", icon: MessageSquare, path: "/chat", badge: "2", badgeColor: "bg-red-50 text-red-600" },
        { label: "Notifications", icon: Bell, path: "/notification-history", badge: unreadCount > 0 ? `${unreadCount}` : null, badgeColor: "bg-red-50 text-red-600" },
      ],
    },
    {
      title: "Management",
      items: [
        { label: "Admin Panel", icon: Shield, path: "/admin", badge: null, badgeColor: "" },
        { label: "Settings", icon: Settings, path: "/settings", badge: null, badgeColor: "" },
      ],
    },
    {
      title: "Support",
      items: [
        { label: "FAQs", icon: HelpCircle, path: "/faqs", badge: null, badgeColor: "" },
        { label: "Contact Support", icon: Phone, path: "/contact-support", badge: null, badgeColor: "" },
        { label: "About FALAJ", icon: Info, path: "/about", badge: null, badgeColor: "" },
      ],
    },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-[480px] mx-auto px-4 pt-6">
        {/* Profile Card — Live Data */}
        <motion.div variants={fadeUp} className="mb-5">
          <Link href="/profile">
            <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20 hover:shadow-xl transition-all active:scale-[0.99]">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-white/20 flex items-center justify-center text-white font-bold text-xl backdrop-blur-sm">
                  {user.avatar}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-lg font-bold">{lang === "ar" ? user.nameAr : user.name}</p>
                  <p className="text-sm text-white/70">{lang === "ar" ? user.farmAr : user.farm}</p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] font-bold bg-white/15 px-2 py-0.5 rounded-full capitalize">{user.plan}</span>
                    <span className="text-[10px] font-bold bg-white/15 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <Star className="w-3 h-3" /> Level {user.level}
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-white/50" />
              </div>
              {/* XP Progress — Live */}
              <div className="mt-4 pt-3 border-t border-white/15">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[10px] text-white/60">{user.xp.toLocaleString()} / {user.xpToNext.toLocaleString()} XP</span>
                  <span className="text-[10px] text-white/60">Level {user.level + 1}</span>
                </div>
                <div className="h-1.5 bg-white/15 rounded-full overflow-hidden">
                  <div className="h-full bg-white/50 rounded-full transition-all duration-500" style={{ width: `${(user.xp / user.xpToNext) * 100}%` }} />
                </div>
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Active Challenges Quick View */}
        {activeChallenges > 0 && (
          <motion.div variants={fadeUp} className="mb-4">
            <Link href="/rewards">
              <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/50 rounded-xl p-3 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.99]">
                <div className="p-2 rounded-xl bg-amber-100">
                  <Gift className="w-5 h-5 text-amber-600" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-amber-900">{activeChallenges} Active Challenges</p>
                  <p className="text-[10px] text-amber-700/70">Complete them to earn XP and level up</p>
                </div>
                <ChevronRight className="w-4 h-4 text-amber-400" />
              </div>
            </Link>
          </motion.div>
        )}

        {/* Menu Sections */}
        {menuItems.map((section, si) => (
          <motion.div key={si} variants={fadeUp} className="mb-4">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 px-1">{section.title}</h3>
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
              {section.items.map((item, i) => {
                const Icon = item.icon;
                return (
                  <Link key={i} href={item.path}>
                    <div className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors active:bg-muted/50 ${
                      i < section.items.length - 1 ? "border-b border-border/15" : ""
                    }`}>
                      <div className="p-2 rounded-xl bg-muted/50">
                        <Icon className="w-4.5 h-4.5 text-muted-foreground" />
                      </div>
                      <span className="flex-1 text-sm font-medium">{item.label}</span>
                      {item.badge && (
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${item.badgeColor}`}>
                          {item.badge}
                        </span>
                      )}
                      <ChevronRight className="w-4 h-4 text-muted-foreground/30" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </motion.div>
        ))}

        {/* Language Toggle */}
        <motion.div variants={fadeUp} className="mb-4">
          <button
            onClick={() => {
              setLang(lang === "en" ? "ar" : "en");
              toast.success(lang === "en" ? "تم التبديل إلى العربية" : "Switched to English");
            }}
            className="w-full flex items-center justify-center gap-2 py-3.5 px-4 bg-card border border-border/40 rounded-xl hover:bg-muted/30 transition-colors active:scale-[0.99]"
          >
            <Globe className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm font-semibold">
              {lang === "en" ? "العربية" : "English"}
            </span>
          </button>
        </motion.div>

        {/* App Version */}
        <motion.div variants={fadeUp} className="text-center pb-4">
          <p className="text-[10px] text-muted-foreground/40">FALAJ v2.3.0</p>
        </motion.div>
      </motion.div>

      <BottomNav />
    </div>
  );
}
