/**
 * FALAJ Financial Dashboard
 * Revenue aggregation from marketplace + B2B contracts
 * Monthly P&L reports and cash flow forecasting
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { useState } from "react";
import {
  DollarSign, TrendingUp, TrendingDown, BarChart3,
  PieChart, ArrowUpRight, ArrowDownRight, Calendar,
  Download, Filter, ChevronRight, Wallet,
  Receipt, CreditCard, Building2, ShoppingBag,
  Landmark, Plane, Heart, Hotel, CircleDollarSign
} from "lucide-react";
import { toast } from "sonner";

type FinTab = "overview" | "pnl" | "cashflow" | "invoices";

const monthlyRevenue = [
  { month: "Oct", marketplace: 12400, b2b: 28600, total: 41000 },
  { month: "Nov", marketplace: 14200, b2b: 31200, total: 45400 },
  { month: "Dec", marketplace: 11800, b2b: 35800, total: 47600 },
  { month: "Jan", marketplace: 15600, b2b: 38400, total: 54000 },
  { month: "Feb", marketplace: 16800, b2b: 42200, total: 59000 },
  { month: "Mar", marketplace: 18200, b2b: 45600, total: 63800 },
];

const revenueByChannel = [
  { channel: "B2B Contracts", amount: 45600, pct: 71.5, color: "bg-emerald-500", icon: Building2 },
  { channel: "Marketplace", amount: 18200, pct: 28.5, color: "bg-blue-500", icon: ShoppingBag },
];

const revenueByBuyer = [
  { buyer: "Jumeirah Group", type: "hotel", amount: 14200, orders: 12, icon: Hotel },
  { buyer: "Cleveland Clinic", type: "hospital", amount: 8400, orders: 8, icon: Heart },
  { buyer: "ADAA", type: "government", amount: 9800, orders: 4, icon: Landmark },
  { buyer: "Etihad Catering", type: "airline", amount: 7200, orders: 10, icon: Plane },
  { buyer: "Lulu Hypermarket", type: "company", amount: 6000, orders: 16, icon: ShoppingBag },
];

const pnlData = {
  revenue: {
    b2bContracts: 45600,
    marketplace: 18200,
    govSubsidies: 3200,
    totalRevenue: 67000,
  },
  cogs: {
    seeds: 2800,
    fertilizer: 3400,
    water: 1200,
    labor: 8500,
    packaging: 2100,
    logistics: 4200,
    totalCOGS: 22200,
  },
  grossProfit: 44800,
  grossMargin: 66.9,
  opex: {
    sensorMaintenance: 800,
    appSubscription: 200,
    insurance: 1500,
    marketing: 600,
    miscellaneous: 400,
    totalOpex: 3500,
  },
  netProfit: 41300,
  netMargin: 61.6,
};

const cashFlowData = [
  { month: "Jan", inflow: 54000, outflow: 24800, net: 29200 },
  { month: "Feb", inflow: 59000, outflow: 25400, net: 33600 },
  { month: "Mar", inflow: 63800, outflow: 25700, net: 38100 },
  { month: "Apr (F)", inflow: 68000, outflow: 26200, net: 41800 },
  { month: "May (F)", inflow: 72000, outflow: 27000, net: 45000 },
  { month: "Jun (F)", inflow: 75000, outflow: 27500, net: 47500 },
];

const invoices = [
  { id: "INV-2026-042", buyer: "Jumeirah Group", amount: 2750, status: "paid", date: "Mar 8", dueDate: "Mar 15", product: "Organic Tomatoes" },
  { id: "INV-2026-041", buyer: "Cleveland Clinic", amount: 1400, status: "paid", date: "Mar 6", dueDate: "Mar 13", product: "Organic Lettuce" },
  { id: "INV-2026-040", buyer: "Etihad Catering", amount: 1050, status: "pending", date: "Mar 5", dueDate: "Mar 12", product: "Cherry Tomatoes" },
  { id: "INV-2026-039", buyer: "Lulu Hypermarket", amount: 4400, status: "pending", date: "Mar 3", dueDate: "Mar 17", product: "Mixed Herbs" },
  { id: "INV-2026-038", buyer: "ADAA", amount: 28000, status: "overdue", date: "Feb 20", dueDate: "Mar 5", product: "Khalas Dates" },
  { id: "INV-2026-037", buyer: "Emirates Catering", amount: 4000, status: "paid", date: "Feb 28", dueDate: "Mar 7", product: "Salad Mix" },
];

const maxBar = Math.max(...monthlyRevenue.map(m => m.total));

export default function FinancialDashboard() {
  const [activeTab, setActiveTab] = useState<FinTab>("overview");

  const tabs: { key: FinTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: "pnl", label: "P&L", icon: <Receipt className="w-3.5 h-3.5" /> },
    { key: "cashflow", label: "Cash Flow", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: "invoices", label: "Invoices", icon: <CreditCard className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => window.history.back()} className="p-1.5 -ml-1.5 rounded-xl hover:bg-muted transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <CircleDollarSign className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Financials</span>
            </div>
            <button onClick={() => toast.success("Report downloaded")} className="flex items-center gap-1 bg-emerald-50 px-2.5 py-1.5 rounded-xl hover:bg-emerald-100 transition-colors">
              <Download className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-[10px] font-bold text-emerald-700">Export</span>
            </button>
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md shadow-emerald-200/40"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* ═══════ OVERVIEW ═══════ */}
        {activeTab === "overview" && (
          <div>
            {/* Revenue Summary Card */}
            <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-40 h-40 bg-white/5 rounded-full -translate-y-12 translate-x-12" />
              <div className="relative z-10">
                <p className="text-[10px] text-white/70 mb-1">Total Revenue · March 2026</p>
                <p className="text-3xl font-bold tracking-tight mb-1">AED 63,800</p>
                <div className="flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-[10px] font-semibold text-emerald-300">+8.1% vs last month</span>
                </div>
              </div>
            </div>

            {/* KPI Row */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">AED 41.3K</p>
                <p className="text-[8px] text-muted-foreground">Net Profit</p>
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-[8px] font-bold text-emerald-600">+12%</span>
                </div>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">61.6%</p>
                <p className="text-[8px] text-muted-foreground">Net Margin</p>
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-[8px] font-bold text-emerald-600">+2.4%</span>
                </div>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-amber-600">50</p>
                <p className="text-[8px] text-muted-foreground">Orders</p>
                <div className="flex items-center justify-center gap-0.5 mt-0.5">
                  <ArrowUpRight className="w-2.5 h-2.5 text-emerald-500" />
                  <span className="text-[8px] font-bold text-emerald-600">+8</span>
                </div>
              </div>
            </div>

            {/* Revenue Chart */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">6-Month Revenue Trend</h3>
            <div className="bg-card rounded-xl border border-border/40 p-3 mb-4">
              <div className="flex items-end gap-1.5 h-32">
                {monthlyRevenue.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-0.5">
                    <p className="text-[7px] font-bold text-muted-foreground">{(m.total / 1000).toFixed(0)}K</p>
                    <div className="w-full flex flex-col gap-0.5" style={{ height: `${(m.total / maxBar) * 100}%` }}>
                      <div className="flex-[0_0_auto] bg-emerald-500 rounded-t-sm" style={{ height: `${(m.b2b / m.total) * 100}%`, minHeight: 2 }} />
                      <div className="flex-[0_0_auto] bg-blue-400 rounded-b-sm" style={{ height: `${(m.marketplace / m.total) * 100}%`, minHeight: 2 }} />
                    </div>
                    <p className="text-[8px] text-muted-foreground">{m.month}</p>
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border/20">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-emerald-500" />
                  <span className="text-[8px] text-muted-foreground">B2B</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-blue-400" />
                  <span className="text-[8px] text-muted-foreground">Marketplace</span>
                </div>
              </div>
            </div>

            {/* Revenue by Channel */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Revenue by Channel</h3>
            <div className="space-y-2 mb-4">
              {revenueByChannel.map((ch) => {
                const Icon = ch.icon;
                return (
                  <div key={ch.channel} className="bg-card rounded-xl border border-border/40 p-3">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg ${ch.color}/10 flex items-center justify-center`}>
                          <Icon className={`w-4 h-4 ${ch.color === "bg-emerald-500" ? "text-emerald-600" : "text-blue-600"}`} />
                        </div>
                        <p className="text-xs font-semibold">{ch.channel}</p>
                      </div>
                      <p className="text-xs font-bold">AED {ch.amount.toLocaleString()}</p>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className={`${ch.color} rounded-full h-2`} style={{ width: `${ch.pct}%` }} />
                    </div>
                    <p className="text-[8px] text-muted-foreground mt-1">{ch.pct}% of total revenue</p>
                  </div>
                );
              })}
            </div>

            {/* Top Buyers */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Top Buyers</h3>
            <div className="space-y-1.5">
              {revenueByBuyer.map((b, i) => {
                const Icon = b.icon;
                return (
                  <div key={b.buyer} className="bg-card rounded-xl border border-border/40 p-2.5 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-muted-foreground w-4">{i + 1}</span>
                      <div className="w-8 h-8 rounded-lg bg-muted/40 flex items-center justify-center">
                        <Icon className="w-4 h-4 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="text-[11px] font-semibold">{b.buyer}</p>
                        <p className="text-[8px] text-muted-foreground">{b.orders} orders</p>
                      </div>
                    </div>
                    <p className="text-xs font-bold text-emerald-600">AED {b.amount.toLocaleString()}</p>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ═══════ P&L ═══════ */}
        {activeTab === "pnl" && (
          <div>
            <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <p className="text-[10px] text-white/70">Profit & Loss · March 2026</p>
                <div className="grid grid-cols-2 gap-3 mt-2">
                  <div>
                    <p className="text-2xl font-bold">AED 41.3K</p>
                    <p className="text-[10px] text-white/70">Net Profit</p>
                  </div>
                  <div>
                    <p className="text-2xl font-bold">61.6%</p>
                    <p className="text-[10px] text-white/70">Net Margin</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Section */}
            <h3 className="text-[11px] font-bold text-emerald-700 uppercase tracking-[0.15em] mb-2">Revenue</h3>
            <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/20 mb-3">
              <div className="p-3 flex justify-between">
                <span className="text-[11px]">B2B Contracts</span>
                <span className="text-[11px] font-bold text-emerald-600">AED {pnlData.revenue.b2bContracts.toLocaleString()}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-[11px]">Marketplace Sales</span>
                <span className="text-[11px] font-bold text-emerald-600">AED {pnlData.revenue.marketplace.toLocaleString()}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-[11px]">Government Subsidies</span>
                <span className="text-[11px] font-bold text-emerald-600">AED {pnlData.revenue.govSubsidies.toLocaleString()}</span>
              </div>
              <div className="p-3 flex justify-between bg-emerald-50/50">
                <span className="text-[11px] font-bold">Total Revenue</span>
                <span className="text-[11px] font-bold text-emerald-700">AED {pnlData.revenue.totalRevenue.toLocaleString()}</span>
              </div>
            </div>

            {/* COGS Section */}
            <h3 className="text-[11px] font-bold text-red-700 uppercase tracking-[0.15em] mb-2">Cost of Goods Sold</h3>
            <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/20 mb-3">
              {Object.entries(pnlData.cogs).filter(([k]) => k !== "totalCOGS").map(([key, val]) => (
                <div key={key} className="p-3 flex justify-between">
                  <span className="text-[11px] capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="text-[11px] font-bold text-red-600">AED {val.toLocaleString()}</span>
                </div>
              ))}
              <div className="p-3 flex justify-between bg-red-50/50">
                <span className="text-[11px] font-bold">Total COGS</span>
                <span className="text-[11px] font-bold text-red-700">AED {pnlData.cogs.totalCOGS.toLocaleString()}</span>
              </div>
            </div>

            {/* Gross Profit */}
            <div className="bg-blue-50 rounded-xl border border-blue-200/50 p-3 mb-3 flex justify-between items-center">
              <div>
                <p className="text-[11px] font-bold text-blue-900">Gross Profit</p>
                <p className="text-[9px] text-blue-600">{pnlData.grossMargin}% margin</p>
              </div>
              <p className="text-lg font-bold text-blue-700">AED {pnlData.grossProfit.toLocaleString()}</p>
            </div>

            {/* Operating Expenses */}
            <h3 className="text-[11px] font-bold text-amber-700 uppercase tracking-[0.15em] mb-2">Operating Expenses</h3>
            <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/20 mb-3">
              {Object.entries(pnlData.opex).filter(([k]) => k !== "totalOpex").map(([key, val]) => (
                <div key={key} className="p-3 flex justify-between">
                  <span className="text-[11px] capitalize">{key.replace(/([A-Z])/g, " $1")}</span>
                  <span className="text-[11px] font-bold text-amber-600">AED {val.toLocaleString()}</span>
                </div>
              ))}
              <div className="p-3 flex justify-between bg-amber-50/50">
                <span className="text-[11px] font-bold">Total OpEx</span>
                <span className="text-[11px] font-bold text-amber-700">AED {pnlData.opex.totalOpex.toLocaleString()}</span>
              </div>
            </div>

            {/* Net Profit */}
            <div className="bg-emerald-50 rounded-xl border border-emerald-200/50 p-4 flex justify-between items-center">
              <div>
                <p className="text-sm font-bold text-emerald-900">Net Profit</p>
                <p className="text-[10px] text-emerald-600">{pnlData.netMargin}% net margin</p>
              </div>
              <p className="text-2xl font-bold text-emerald-700">AED {pnlData.netProfit.toLocaleString()}</p>
            </div>
          </div>
        )}

        {/* ═══════ CASH FLOW ═══════ */}
        {activeTab === "cashflow" && (
          <div>
            {/* Cash Balance */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <p className="text-[10px] text-white/70">Current Cash Balance</p>
                <p className="text-3xl font-bold tracking-tight mb-1">AED 187,400</p>
                <div className="flex items-center gap-1">
                  <ArrowUpRight className="w-3.5 h-3.5 text-emerald-300" />
                  <span className="text-[10px] font-semibold text-emerald-300">+AED 38,100 this month</span>
                </div>
              </div>
            </div>

            {/* Cash Flow Table */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Monthly Cash Flow</h3>
            <div className="bg-card rounded-xl border border-border/40 overflow-hidden mb-4">
              <div className="grid grid-cols-4 gap-0 bg-muted/30 p-2">
                <p className="text-[9px] font-bold text-muted-foreground">Month</p>
                <p className="text-[9px] font-bold text-emerald-600 text-right">Inflow</p>
                <p className="text-[9px] font-bold text-red-600 text-right">Outflow</p>
                <p className="text-[9px] font-bold text-blue-600 text-right">Net</p>
              </div>
              {cashFlowData.map((cf) => (
                <div key={cf.month} className={`grid grid-cols-4 gap-0 p-2 border-t border-border/10 ${cf.month.includes("(F)") ? "bg-blue-50/30" : ""}`}>
                  <p className="text-[10px] font-semibold">{cf.month}</p>
                  <p className="text-[10px] font-bold text-emerald-600 text-right">{(cf.inflow / 1000).toFixed(1)}K</p>
                  <p className="text-[10px] font-bold text-red-600 text-right">{(cf.outflow / 1000).toFixed(1)}K</p>
                  <p className="text-[10px] font-bold text-blue-600 text-right">{(cf.net / 1000).toFixed(1)}K</p>
                </div>
              ))}
            </div>

            {/* Cash Flow Visualization */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Cash Flow Trend</h3>
            <div className="bg-card rounded-xl border border-border/40 p-3 mb-4">
              <div className="flex items-end gap-2 h-28">
                {cashFlowData.map((cf) => {
                  const maxVal = Math.max(...cashFlowData.map(c => c.inflow));
                  return (
                    <div key={cf.month} className="flex-1 flex flex-col items-center gap-0.5">
                      <p className="text-[7px] font-bold text-emerald-600">{(cf.net / 1000).toFixed(0)}K</p>
                      <div className="w-full flex gap-0.5" style={{ height: `${(cf.inflow / maxVal) * 100}%` }}>
                        <div className="flex-1 bg-emerald-400 rounded-t-sm" />
                        <div className="flex-1 bg-red-300 rounded-t-sm" style={{ height: `${(cf.outflow / cf.inflow) * 100}%`, marginTop: "auto" }} />
                      </div>
                      <p className={`text-[7px] ${cf.month.includes("(F)") ? "text-blue-500 font-bold" : "text-muted-foreground"}`}>{cf.month.replace(" (F)", "")}</p>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-center gap-4 mt-2 pt-2 border-t border-border/20">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-emerald-400" />
                  <span className="text-[8px] text-muted-foreground">Inflow</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 rounded-sm bg-red-300" />
                  <span className="text-[8px] text-muted-foreground">Outflow</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  <span className="text-[8px] text-blue-500">Forecast</span>
                </div>
              </div>
            </div>

            {/* Forecast Summary */}
            <div className="bg-blue-50 rounded-xl border border-blue-200/50 p-3">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-bold text-blue-900">AI Cash Flow Forecast</p>
              </div>
              <p className="text-[10px] text-blue-700 leading-relaxed">
                Based on current B2B contracts and seasonal demand patterns, your projected cash balance by June 2026 is <span className="font-bold">AED 321,700</span>. 
                Recommended: reinvest 15% into sensor upgrades for Zone E (Date Palms) to capture increasing Ramadan demand.
              </p>
            </div>
          </div>
        )}

        {/* ═══════ INVOICES ═══════ */}
        {activeTab === "invoices" && (
          <div>
            {/* Invoice Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-emerald-50 rounded-xl border border-emerald-200/50 p-3 text-center">
                <p className="text-lg font-bold text-emerald-700">AED 8.2K</p>
                <p className="text-[8px] text-emerald-600 font-semibold">Paid</p>
              </div>
              <div className="bg-amber-50 rounded-xl border border-amber-200/50 p-3 text-center">
                <p className="text-lg font-bold text-amber-700">AED 5.5K</p>
                <p className="text-[8px] text-amber-600 font-semibold">Pending</p>
              </div>
              <div className="bg-red-50 rounded-xl border border-red-200/50 p-3 text-center">
                <p className="text-lg font-bold text-red-700">AED 28K</p>
                <p className="text-[8px] text-red-600 font-semibold">Overdue</p>
              </div>
            </div>

            {/* Invoice List */}
            <div className="space-y-2">
              {invoices.map((inv) => (
                <div key={inv.id} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-1.5">
                    <div>
                      <p className="text-xs font-semibold">{inv.buyer}</p>
                      <p className="text-[9px] text-muted-foreground">{inv.id} · {inv.product}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold">AED {inv.amount.toLocaleString()}</p>
                      <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                        inv.status === "paid" ? "bg-emerald-50 text-emerald-700" :
                        inv.status === "pending" ? "bg-amber-50 text-amber-700" :
                        "bg-red-50 text-red-700"
                      }`}>{inv.status}</span>
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-muted-foreground">Issued: {inv.date}</p>
                    <p className="text-[9px] text-muted-foreground">Due: {inv.dueDate}</p>
                  </div>
                  {inv.status === "overdue" && (
                    <button
                      onClick={() => toast.success(`Payment reminder sent to ${inv.buyer}`)}
                      className="w-full mt-2 py-1.5 rounded-lg bg-red-50 text-red-700 text-[10px] font-semibold hover:bg-red-100 transition-colors"
                    >
                      Send Payment Reminder
                    </button>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => toast.success("New invoice created")} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-md">
              Create New Invoice
            </button>
          </div>
        )}
      </div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
