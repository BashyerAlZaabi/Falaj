/*
 * FALAJ Trade Hub — Buy, Sell & Supply
 * Connected to AppState for live data
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useMemo } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import { B2BDemand } from "@/contexts/AppStateContext";
import {
  ShoppingBag, Handshake, Plus, Search, ChevronRight,
  Star, Building2, Hotel, Heart,
  Plane, Landmark, Bell, ShoppingCart
} from "lucide-react";
import FeatureLockedTooltip from "@/components/FeatureLockedTooltip";

const buyerIcons: Record<string, any> = {
  Hotel: Hotel,
  Hospital: Heart,
  Airline: Plane,
  Government: Landmark,
  Company: Building2,
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function TradeHub() {
  const { orders, demand, notifications, matchDemand, addXP } = useAppState();

  const myListings = useMemo(() => [
    { name: "Organic Tomatoes", price: "AED 5.5/kg", stock: "450 kg", status: "active", sales: orders.filter(o => o.product === "Organic Tomatoes").length || 23, icon: "🍅" },
    { name: "Khalas Dates", price: "AED 15/kg", stock: "800 kg", status: "active", sales: orders.filter(o => o.product === "Khalas Dates").length || 12, icon: "🌴" },
    { name: "Fresh Basil", price: "AED 28/kg", stock: "30 kg", status: "low", sales: 45, icon: "🌿" },
  ], [orders]);

  const trendingProducts = [
    { name: "Organic Mangoes", price: "AED 12/kg", seller: "Al Ain Farms", rating: 4.8, icon: "🥭" },
    { name: "Premium Honey", price: "AED 85/jar", seller: "Desert Bee Co.", rating: 4.9, icon: "🍯" },
    { name: "Fresh Lettuce", price: "AED 6/kg", seller: "Green Valley", rating: 4.7, icon: "🥬" },
  ];

  const supplyAlerts = notifications.filter(n => n.type === "demand").length;

  const handleAcceptDemand = (id: string, buyer: string) => {
    matchDemand(id);
    toast.success(`Accepted supply request from ${buyer}`);
    addXP(50);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingBag className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Trade</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/supply-notifications">
                <button className="relative p-2 rounded-xl hover:bg-muted/60 transition-colors active:scale-95">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  {supplyAlerts > 0 && (
                    <span className="absolute top-0.5 right-0.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                      <span className="text-[8px] font-bold text-white">{supplyAlerts}</span>
                    </span>
                  )}
                </button>
              </Link>
              <Link href="/marketplace">
                <button className="p-2 rounded-xl hover:bg-muted/60 transition-colors active:scale-95">
                  <Search className="w-5 h-5 text-muted-foreground" />
                </button>
              </Link>
            </div>
          </div>
        </div>
      </header>

      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Quick Actions */}
        <motion.div variants={fadeUp} className="flex gap-2 mb-5">
          <Link href="/marketplace" className="flex-1">
            <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-xl p-4 text-white text-center hover:shadow-lg transition-all active:scale-[0.98]">
              <Plus className="w-6 h-6 mx-auto mb-1.5 opacity-80" />
              <p className="text-xs font-bold">Sell Product</p>
            </div>
          </Link>
          <Link href="/marketplace" className="flex-1">
            <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white text-center hover:shadow-lg transition-all active:scale-[0.98]">
              <ShoppingCart className="w-6 h-6 mx-auto mb-1.5 opacity-80" />
              <p className="text-xs font-bold">Browse Market</p>
            </div>
          </Link>
          <FeatureLockedTooltip feature="b2bSupplyChain" position="bottom">
            <Link href="/supply-chain" className="flex-1">
              <div className="bg-gradient-to-br from-teal-600 to-cyan-600 rounded-xl p-4 text-white text-center hover:shadow-lg transition-all active:scale-[0.98]">
                <Handshake className="w-6 h-6 mx-auto mb-1.5 opacity-80" />
                <p className="text-xs font-bold">B2B Deals</p>
              </div>
            </Link>
          </FeatureLockedTooltip>
        </motion.div>

        {/* My Listings */}
        <motion.div variants={fadeUp} className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">My Listings</h3>
            <Link href="/marketplace">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                Manage <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {myListings.map((item, i) => (
              <Link key={i} href="/marketplace">
                <div className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.99]">
                  <span className="text-2xl">{item.icon}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{item.name}</p>
                    <p className="text-[10px] text-muted-foreground">{item.price} · {item.stock} available</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-emerald-600">{item.sales}</p>
                    <p className="text-[9px] text-muted-foreground">Sales</p>
                  </div>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                    item.status === "active" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                  }`}>{item.status === "low" ? "Low Stock" : item.status}</span>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* B2B Demand — FUNCTIONAL accept */}
        <motion.div variants={fadeUp} className="mb-5">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">B2B Demand</h3>
            <Link href="/supply-chain">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {demand.filter((d: B2BDemand) => !d.matched).slice(0, 4).map((d: B2BDemand) => {
              const Icon = buyerIcons[d.buyerType === "hotel" ? "Hotel" : d.buyerType === "hospital" ? "Hospital" : d.buyerType === "airline" ? "Airline" : d.buyerType === "government" ? "Government" : "Company"] || Building2;
              return (
                <div key={d.id} className="bg-card rounded-xl border border-border/40 p-3 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${
                      d.buyerType === "hotel" ? "bg-blue-50" : d.buyerType === "hospital" ? "bg-red-50" :
                      d.buyerType === "airline" ? "bg-sky-50" : "bg-slate-100"
                    }`}>
                      <Icon className={`w-4 h-4 ${
                        d.buyerType === "hotel" ? "text-blue-600" : d.buyerType === "hospital" ? "text-red-600" :
                        d.buyerType === "airline" ? "text-sky-600" : "text-slate-600"
                      }`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{d.buyer}</p>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          d.urgency === "high" ? "bg-red-50 text-red-600" :
                          d.urgency === "medium" ? "bg-amber-50 text-amber-600" : "bg-slate-100 text-slate-500"
                        }`}>{d.urgency}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{d.product} - {d.quantity}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-2 pt-2 border-t border-border/20">
                    <button
                      onClick={() => handleAcceptDemand(d.id, d.buyer)}
                      className="flex-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg py-1.5 transition-colors active:scale-[0.97]"
                    >
                      Accept & Supply
                    </button>
                    <Link href="/supply-chain" className="flex-1">
                      <button className="w-full text-[10px] font-bold text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg py-1.5 transition-colors active:scale-[0.97]">
                        View Details
                      </button>
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Trending Products */}
        <motion.div variants={fadeUp} className="mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Trending</h3>
            <Link href="/marketplace">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                Browse <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {trendingProducts.map((p, i) => (
              <Link key={i} href="/marketplace">
                <div className="bg-card rounded-xl border border-border/40 p-3 min-w-[140px] hover:shadow-md transition-all active:scale-[0.98]">
                  <span className="text-3xl block mb-2">{p.icon}</span>
                  <p className="text-xs font-bold truncate">{p.name}</p>
                  <p className="text-[10px] text-emerald-600 font-semibold">{p.price}</p>
                  <div className="flex items-center gap-1 mt-1">
                    <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                    <span className="text-[9px] text-muted-foreground">{p.rating}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
