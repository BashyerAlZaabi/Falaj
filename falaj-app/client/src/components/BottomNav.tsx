/*
 * FALAJ Bottom Navigation — 5 Hub Tabs
 * Home | Farm | Trade | Money | More
 * Every feature is max 3 taps away
 */
import { useLocation, Link } from "wouter";
import { LayoutDashboard, Leaf, ShoppingBag, CircleDollarSign, MoreHorizontal } from "lucide-react";
import { motion } from "framer-motion";

const navItems = [
  { path: "/dashboard", label: "Home", matchPaths: ["/dashboard", "/ai-recommendations", "/ai-assistant", "/chat", "/notification-history"], icon: LayoutDashboard },
  { path: "/farm", label: "Farm", matchPaths: ["/farm", "/smart-sensors", "/farm-resources", "/crop-planning", "/sensors-map", "/sensors"], icon: Leaf },
  { path: "/trade", label: "Trade", matchPaths: ["/trade", "/marketplace", "/supply-chain", "/supply-notifications"], icon: ShoppingBag },
  { path: "/money", label: "Money", matchPaths: ["/money", "/financials", "/orders", "/logistics"], icon: CircleDollarSign },
  { path: "/more", label: "More", matchPaths: ["/more", "/profile", "/rewards", "/settings", "/admin", "/about", "/faqs", "/contact-support", "/community"], icon: MoreHorizontal },
];

export default function BottomNav() {
  const [location] = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white/90 backdrop-blur-2xl border-t border-border/15 shadow-[0_-2px_24px_rgba(0,0,0,0.04)]">
      <div className="max-w-[480px] mx-auto flex items-stretch justify-around">
        {navItems.map((item) => {
          const isActive = item.matchPaths.some(p => location === p || location.startsWith(p + "/"));
          const Icon = item.icon;
          return (
            <Link key={item.path} href={item.path}>
              <button className="relative flex flex-col items-center justify-center gap-0.5 min-w-[64px] min-h-[56px] px-2 py-2 transition-colors active:bg-muted/30">
                {isActive && (
                  <motion.div
                    layoutId="bottomNavBar"
                    className="absolute top-0 left-3 right-3 h-[2.5px] bg-gradient-to-r from-emerald-500 to-green-500 rounded-b-full"
                    transition={{ type: "spring", stiffness: 400, damping: 30 }}
                  />
                )}
                <div className={`p-1.5 rounded-xl transition-all duration-200 ${isActive ? "bg-emerald-50" : ""}`}>
                  <Icon
                    className={`w-[22px] h-[22px] transition-all duration-200 ${
                      isActive ? "text-emerald-600" : "text-muted-foreground/70"
                    }`}
                    strokeWidth={isActive ? 2.5 : 1.8}
                  />
                </div>
                <span className={`text-[10px] leading-none transition-all duration-200 ${
                  isActive ? "font-bold text-emerald-600" : "font-medium text-muted-foreground/60"
                }`}>
                  {item.label}
                </span>
              </button>
            </Link>
          );
        })}
      </div>
      <div className="h-[env(safe-area-inset-bottom)]" />
    </nav>
  );
}
