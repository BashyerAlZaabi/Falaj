/*
 * FALAJ Profile Page
 * Design: Desert Minimalism — user profile with farm stats and menu items
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  User, MapPin, Calendar, ChevronRight, Settings,
  HelpCircle, MessageCircle, Gift, ShoppingBag,
  Info, LogOut, Shield, Bell, Droplets
} from "lucide-react";

const menuItems = [
  { label: "Settings", icon: Settings, path: "/settings", color: "text-slate-600 bg-slate-50" },
  { label: "Rewards", icon: Gift, path: "/rewards", color: "text-pink-600 bg-pink-50" },
  { label: "Marketplace", icon: ShoppingBag, path: "/marketplace", color: "text-orange-600 bg-orange-50" },
  { label: "FAQs", icon: HelpCircle, path: "/faqs", color: "text-blue-600 bg-blue-50" },
  { label: "Contact Support", icon: MessageCircle, path: "/contact-support", color: "text-teal-600 bg-teal-50" },
  { label: "About FALAJ", icon: Info, path: "/about", color: "text-violet-600 bg-violet-50" },
];

const farmStats = [
  { label: "Farm Size", value: "12 ha" },
  { label: "Active Sensors", value: "5" },
  { label: "Zones", value: "5" },
  { label: "Water Saved", value: "23%" },
];

export default function Profile() {
  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header with gradient */}
      <div className="bg-gradient-to-br from-emerald-700 via-green-600 to-teal-600 pt-12 pb-16 px-4">
        <div className="max-w-[480px] mx-auto">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-white/80" />
              <span className="text-sm font-semibold text-white/80">FALAJ</span>
            </div>
            <Link href="/settings">
              <button className="p-2 rounded-xl bg-white/10 hover:bg-white/20 transition-colors">
                <Settings className="w-4 h-4 text-white" />
              </button>
            </Link>
          </div>
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center">
              <User className="w-8 h-8 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Ahmed Al Zaabi</h2>
              <div className="flex items-center gap-1 mt-0.5">
                <MapPin className="w-3 h-3 text-white/60" />
                <span className="text-sm text-white/70">Al Ain, UAE</span>
              </div>
              <div className="flex items-center gap-1 mt-0.5">
                <Calendar className="w-3 h-3 text-white/60" />
                <span className="text-xs text-white/60">Member since Jan 2024</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 -mt-8"
      >
        {/* Farm Stats */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 shadow-lg mb-5">
          <div className="grid grid-cols-4 gap-2">
            {farmStats.map((stat) => (
              <div key={stat.label} className="text-center">
                <p className="text-lg font-bold text-primary">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{stat.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Menu Items */}
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-5">
          {menuItems.map((item, i) => {
            const Icon = item.icon;
            const [iconColor, iconBg] = item.color.split(" ");
            return (
              <Link key={item.path} href={item.path}>
                <div className={`flex items-center gap-3 px-4 py-4 hover:bg-muted/50 transition-colors active:bg-muted/70 ${
                  i < menuItems.length - 1 ? "border-b border-border/30" : ""
                }`}>
                  <div className={`p-2 rounded-xl ${iconBg}`}>
                    <Icon className={`w-4 h-4 ${iconColor}`} />
                  </div>
                  <span className="flex-1 text-sm font-medium">{item.label}</span>
                  <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                </div>
              </Link>
            );
          })}
        </div>

        {/* Logout */}
        <button className="w-full flex items-center justify-center gap-2 py-3 text-red-500 hover:bg-red-50 rounded-2xl transition-colors">
          <LogOut className="w-4 h-4" />
          <span className="text-sm font-medium">Log Out</span>
        </button>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
