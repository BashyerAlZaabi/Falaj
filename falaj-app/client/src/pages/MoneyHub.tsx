/*
 * FALAJ Money Hub — Revenue, Orders & Logistics
 * Connected to AppState for live data
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useMemo } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import {
  CircleDollarSign, Package, Truck, FileText, ChevronRight,
  TrendingUp, ArrowUpRight, ArrowDownRight,
  CheckCircle2, BarChart3
} from "lucide-react";
import FeatureLockedTooltip from "@/components/FeatureLockedTooltip";

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function MoneyHub() {
  const { orders, deliveries, transactions, updateOrder, updateDelivery } = useAppState();

  const income = useMemo(() => transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0), [transactions]);
  const expenses = useMemo(() => transactions.filter(t => t.type === "expense").reduce((s, t) => s + Math.abs(t.amount), 0), [transactions]);
  const profit = income - expenses;
  const margin = income > 0 ? ((profit / income) * 100).toFixed(1) : "0";
  const b2bIncome = useMemo(() => transactions.filter(t => t.type === "income" && t.category === "B2B").reduce((s, t) => s + t.amount, 0), [transactions]);
  const marketIncome = useMemo(() => transactions.filter(t => t.type === "income" && t.category === "Marketplace").reduce((s, t) => s + t.amount, 0), [transactions]);

  const activeOrders = orders.filter(o => o.status === "confirmed" || o.status === "pending").length;
  const shippedOrders = orders.filter(o => o.status === "shipped").length;
  const deliveredOrders = orders.filter(o => o.status === "delivered").length;

  const activeDeliveries = deliveries.filter(d => d.status !== "delivered");

  const handleConfirmOrder = (id: string) => {
    updateOrder(id, { status: "shipped" });
    toast.success("Order marked as shipped");
  };

  const handleDeliveryComplete = (id: string) => {
    updateDelivery(id, { status: "delivered" });
    toast.success("Delivery marked as complete");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CircleDollarSign className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Money</span>
            </div>
            <Link href="/financials">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                Full Report <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
        </div>
      </header>

      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Revenue Card */}
        <motion.div variants={fadeUp} className="mb-4">
          <FeatureLockedTooltip feature="financialDashboard">
          <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20">
            <p className="text-sm text-white/70 font-medium">Total Revenue · March 2026</p>
            <p className="text-3xl font-bold mt-1">AED {income.toLocaleString()}</p>
            <div className="flex items-center gap-1 mt-1">
              <TrendingUp className="w-3.5 h-3.5 text-green-300" />
              <span className="text-xs text-green-200 font-semibold">+8.1% vs last month</span>
            </div>
            <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/15">
              <div>
                <p className="text-lg font-bold">AED {profit.toLocaleString()}</p>
                <p className="text-[10px] text-white/50">Net Profit</p>
              </div>
              <div>
                <p className="text-lg font-bold">{margin}%</p>
                <p className="text-[10px] text-white/50">Margin</p>
              </div>
              <div className="text-right">
                <Link href="/financials">
                  <button className="bg-white/15 hover:bg-white/25 text-white text-[10px] font-bold px-3 py-1.5 rounded-lg transition-colors">
                    Details
                  </button>
                </Link>
              </div>
            </div>
          </div>
          </FeatureLockedTooltip>
        </motion.div>

        {/* Revenue Split */}
        <motion.div variants={fadeUp} className="flex gap-2 mb-4">
          <Link href="/financials" className="flex-1">
            <div className="bg-card rounded-xl border border-border/40 p-3 hover:shadow-md transition-all active:scale-[0.98]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-emerald-50">
                  <BarChart3 className="w-4 h-4 text-emerald-600" />
                </div>
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                  {income > 0 ? ((b2bIncome / income) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <p className="text-lg font-bold">AED {b2bIncome.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">B2B Contracts</p>
            </div>
          </Link>
          <Link href="/financials" className="flex-1">
            <div className="bg-card rounded-xl border border-border/40 p-3 hover:shadow-md transition-all active:scale-[0.98]">
              <div className="flex items-center gap-2 mb-2">
                <div className="p-1.5 rounded-lg bg-blue-50">
                  <Package className="w-4 h-4 text-blue-600" />
                </div>
                <span className="text-[9px] font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded-full">
                  {income > 0 ? ((marketIncome / income) * 100).toFixed(0) : 0}%
                </span>
              </div>
              <p className="text-lg font-bold">AED {marketIncome.toLocaleString()}</p>
              <p className="text-[10px] text-muted-foreground">Marketplace</p>
            </div>
          </Link>
        </motion.div>

        {/* Orders Summary */}
        <motion.div variants={fadeUp} className="mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Orders</h3>
            <Link href="/orders">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="flex gap-2">
            {[
              { label: "Active", count: activeOrders, color: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200/50" },
              { label: "Shipped", count: shippedOrders, color: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200/50" },
              { label: "Delivered", count: deliveredOrders, color: "text-green-600", bg: "bg-green-50", border: "border-green-200/50" },
            ].map((o) => (
              <Link key={o.label} href="/orders" className="flex-1">
                <div className={`rounded-xl border ${o.border} p-3 text-center bg-card hover:shadow-md transition-all active:scale-[0.98]`}>
                  <p className={`text-2xl font-bold ${o.color}`}>{o.count}</p>
                  <p className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider mt-0.5">{o.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Active Deliveries — Functional */}
        <motion.div variants={fadeUp} className="mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Active Deliveries</h3>
            <Link href="/logistics">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                Track All <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          {activeDeliveries.length === 0 ? (
            <div className="bg-card rounded-xl border border-border/40 p-6 text-center">
              <CheckCircle2 className="w-8 h-8 text-green-500 mx-auto mb-2" />
              <p className="text-sm font-semibold text-muted-foreground">All deliveries complete</p>
            </div>
          ) : (
            <div className="space-y-2">
              {activeDeliveries.map((d) => (
                <div key={d.id} className="bg-card rounded-xl border border-border/40 p-3 hover:shadow-md transition-all">
                  <div className="flex items-center gap-3">
                    <div className={`p-2 rounded-xl ${d.status === "in_transit" ? "bg-blue-50" : "bg-amber-50"}`}>
                      <Truck className={`w-4 h-4 ${d.status === "in_transit" ? "text-blue-600" : "text-amber-600"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{d.buyer}</p>
                      <p className="text-[10px] text-muted-foreground">{d.product}</p>
                    </div>
                    <div className="text-right">
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        d.status === "in_transit" ? "bg-blue-100 text-blue-700" : "bg-amber-100 text-amber-700"
                      }`}>{d.status === "in_transit" ? "In Transit" : "Packing"}</span>
                      <p className="text-[9px] text-muted-foreground mt-0.5">ETA {d.eta}</p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeliveryComplete(d.id)}
                    className="w-full mt-2 text-[10px] font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg py-1.5 transition-colors active:scale-[0.97]"
                  >
                    Mark as Delivered
                  </button>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Recent Transactions — Live */}
        <motion.div variants={fadeUp} className="mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Recent Transactions</h3>
            <Link href="/financials">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                View All <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="bg-card rounded-xl border border-border/40 overflow-hidden">
            {transactions.slice(0, 5).map((t, i) => (
              <div key={t.id} className={`flex items-center gap-3 px-3 py-3 ${i < Math.min(transactions.length, 5) - 1 ? "border-b border-border/20" : ""}`}>
                <div className={`p-2 rounded-xl ${t.type === "income" ? "bg-green-50" : "bg-red-50"}`}>
                  {t.type === "income" ? <ArrowUpRight className="w-4 h-4 text-green-600" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold truncate">{t.name}</p>
                  <p className="text-[10px] text-muted-foreground">{t.product}</p>
                </div>
                <div className="text-right">
                  <p className={`text-sm font-bold ${t.type === "income" ? "text-green-600" : "text-red-500"}`}>
                    {t.type === "income" ? "+" : "-"}AED {Math.abs(t.amount).toLocaleString()}
                  </p>
                  <p className="text-[9px] text-muted-foreground">{t.date}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Pending Orders — Actionable */}
        <motion.div variants={fadeUp} className="mb-4">
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Pending Actions</h3>
          </div>
          <div className="space-y-2">
            {orders.filter(o => o.status === "pending" || o.status === "confirmed").slice(0, 3).map((o) => (
              <div key={o.id} className="bg-card rounded-xl border border-border/40 p-3 hover:shadow-md transition-all">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-blue-50">
                    <FileText className="w-4 h-4 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold">{o.buyer}</p>
                    <p className="text-[10px] text-muted-foreground">{o.product} · {o.quantity}</p>
                  </div>
                  <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                    o.status === "pending" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                  }`}>{o.status}</span>
                </div>
                <div className="flex gap-2 mt-2 pt-2 border-t border-border/20">
                  {o.status === "pending" && (
                    <button
                      onClick={() => { updateOrder(o.id, { status: "confirmed" }); toast.success(`Order from ${o.buyer} confirmed`); }}
                      className="flex-1 text-[10px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg py-1.5 transition-colors active:scale-[0.97]"
                    >
                      Confirm Order
                    </button>
                  )}
                  {o.status === "confirmed" && (
                    <button
                      onClick={() => handleConfirmOrder(o.id)}
                      className="flex-1 text-[10px] font-bold text-white bg-blue-600 hover:bg-blue-700 rounded-lg py-1.5 transition-colors active:scale-[0.97]"
                    >
                      Mark as Shipped
                    </button>
                  )}
                  <Link href="/orders" className="flex-1">
                    <button className="w-full text-[10px] font-bold text-muted-foreground bg-muted/50 hover:bg-muted rounded-lg py-1.5 transition-colors active:scale-[0.97]">
                      View Details
                    </button>
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
