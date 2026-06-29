/**
 * FALAJ B2B Supply Chain
 * Connect farms as suppliers to hotels, hospitals, government, airlines, companies
 * View stakeholder demand, manage orders, supply matching
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Building2, Hotel, Heart, Plane, ShoppingBag,
  Landmark, Package, Truck, ArrowRight, ChevronRight,
  CheckCircle2, Clock, AlertTriangle, TrendingUp,
  BarChart3, Users, Handshake, FileText, Star,
  Calendar, MapPin, Phone, Mail, Globe, Filter,
  Search, Bell, Plus, Eye, MessageSquare
} from "lucide-react";
import { toast } from "sonner";

type SupplyTab = "demand" | "contracts" | "matching" | "profile";

/* ─── Stakeholder Types ─── */
const stakeholderTypes = [
  { type: "hotel", label: "Hotels & Resorts", icon: Hotel, color: "text-blue-600", bg: "bg-blue-50", count: 18 },
  { type: "hospital", label: "Hospitals & Healthcare", icon: Heart, color: "text-red-600", bg: "bg-red-50", count: 8 },
  { type: "government", label: "Government Entities", icon: Landmark, color: "text-slate-700", bg: "bg-slate-100", count: 12 },
  { type: "airline", label: "Airlines & Catering", icon: Plane, color: "text-sky-600", bg: "bg-sky-50", count: 6 },
  { type: "company", label: "Food Companies & Retail", icon: ShoppingBag, color: "text-purple-600", bg: "bg-purple-50", count: 24 },
];

/* ─── Demand Board ─── */
const demandBoard = [
  {
    id: 1, name: "Jumeirah Group", type: "hotel", icon: Hotel, color: "text-blue-600", bg: "bg-blue-50",
    location: "Dubai", rating: 4.9, verified: true,
    demands: [
      { product: "Organic Tomatoes", qty: "500 kg/week", price: "AED 5.5/kg", frequency: "Weekly", urgency: "high", deadline: "Mar 15" },
      { product: "Fresh Herbs (Mixed)", qty: "50 kg/week", price: "AED 28/kg", frequency: "Weekly", urgency: "medium", deadline: "Ongoing" },
      { product: "Premium Dates", qty: "200 kg/month", price: "AED 15/kg", frequency: "Monthly", urgency: "low", deadline: "Aug 2026" },
    ]
  },
  {
    id: 2, name: "Cleveland Clinic Abu Dhabi", type: "hospital", icon: Heart, color: "text-red-600", bg: "bg-red-50",
    location: "Abu Dhabi", rating: 4.8, verified: true,
    demands: [
      { product: "Organic Lettuce", qty: "200 kg/week", price: "AED 7/kg", frequency: "Weekly", urgency: "high", deadline: "Mar 12" },
      { product: "Cucumbers", qty: "150 kg/week", price: "AED 3.8/kg", frequency: "Weekly", urgency: "medium", deadline: "Ongoing" },
    ]
  },
  {
    id: 3, name: "Abu Dhabi Agriculture Authority", type: "government", icon: Landmark, color: "text-slate-700", bg: "bg-slate-100",
    location: "Abu Dhabi", rating: 5.0, verified: true,
    demands: [
      { product: "Date Palms (Khalas)", qty: "2,000 kg/season", price: "AED 14/kg", frequency: "Seasonal", urgency: "medium", deadline: "Aug 2026" },
      { product: "Local Vegetables (Mixed)", qty: "1,000 kg/month", price: "AED 4.5/kg", frequency: "Monthly", urgency: "high", deadline: "Ongoing" },
    ]
  },
  {
    id: 4, name: "Etihad Airways Catering", type: "airline", icon: Plane, color: "text-sky-600", bg: "bg-sky-50",
    location: "Abu Dhabi", rating: 4.7, verified: true,
    demands: [
      { product: "Cherry Tomatoes", qty: "300 kg/week", price: "AED 6/kg", frequency: "Weekly", urgency: "high", deadline: "Mar 20" },
      { product: "Fresh Basil", qty: "30 kg/week", price: "AED 35/kg", frequency: "Weekly", urgency: "medium", deadline: "Ongoing" },
      { product: "Organic Cucumbers", qty: "200 kg/week", price: "AED 4/kg", frequency: "Weekly", urgency: "low", deadline: "Ongoing" },
    ]
  },
  {
    id: 5, name: "Lulu Hypermarket", type: "company", icon: ShoppingBag, color: "text-purple-600", bg: "bg-purple-50",
    location: "UAE-wide", rating: 4.6, verified: true,
    demands: [
      { product: "Tomatoes (All Varieties)", qty: "2,000 kg/week", price: "AED 4/kg", frequency: "Weekly", urgency: "high", deadline: "Ongoing" },
      { product: "Lettuce & Greens", qty: "800 kg/week", price: "AED 5.5/kg", frequency: "Weekly", urgency: "high", deadline: "Ongoing" },
      { product: "Herbs (Packaged)", qty: "200 kg/week", price: "AED 22/kg", frequency: "Weekly", urgency: "medium", deadline: "Ongoing" },
    ]
  },
  {
    id: 6, name: "Emirates Flight Catering", type: "airline", icon: Plane, color: "text-sky-600", bg: "bg-sky-50",
    location: "Dubai", rating: 4.8, verified: true,
    demands: [
      { product: "Premium Salad Mix", qty: "500 kg/week", price: "AED 8/kg", frequency: "Weekly", urgency: "high", deadline: "Ongoing" },
      { product: "Organic Tomatoes", qty: "400 kg/week", price: "AED 5.5/kg", frequency: "Weekly", urgency: "medium", deadline: "Ongoing" },
    ]
  },
];

/* ─── Active Contracts ─── */
const contracts = [
  {
    id: 1, buyer: "Jumeirah Group", type: "hotel", product: "Organic Tomatoes",
    qty: "500 kg/week", price: "AED 5.5/kg", value: "AED 11,000/month",
    status: "active", startDate: "Jan 2026", endDate: "Dec 2026",
    deliveries: 12, onTime: 11, rating: 4.8
  },
  {
    id: 2, buyer: "Cleveland Clinic", type: "hospital", product: "Organic Lettuce",
    qty: "200 kg/week", price: "AED 7/kg", value: "AED 5,600/month",
    status: "active", startDate: "Feb 2026", endDate: "Jan 2027",
    deliveries: 6, onTime: 6, rating: 5.0
  },
  {
    id: 3, buyer: "Etihad Catering", type: "airline", product: "Cherry Tomatoes",
    qty: "300 kg/week", price: "AED 6/kg", value: "AED 7,200/month",
    status: "pending", startDate: "Mar 2026", endDate: "Feb 2027",
    deliveries: 0, onTime: 0, rating: 0
  },
  {
    id: 4, buyer: "Lulu Hypermarket", type: "company", product: "Herbs (Packaged)",
    qty: "200 kg/week", price: "AED 22/kg", value: "AED 17,600/month",
    status: "negotiating", startDate: "TBD", endDate: "TBD",
    deliveries: 0, onTime: 0, rating: 0
  },
];

/* ─── Supply Matching ─── */
const supplyMatches = [
  { crop: "Tomatoes", farmCapacity: "600 kg/week", totalDemand: "3,200 kg/week", matchRate: 18.8, canFulfill: 1, totalBuyers: 5, topBuyer: "Lulu Hypermarket", topPrice: "AED 4/kg" },
  { crop: "Cucumbers", farmCapacity: "450 kg/week", totalDemand: "350 kg/week", matchRate: 100, canFulfill: 2, totalBuyers: 2, topBuyer: "Cleveland Clinic", topPrice: "AED 3.8/kg" },
  { crop: "Lettuce", farmCapacity: "225 kg/week", totalDemand: "1,000 kg/week", matchRate: 22.5, canFulfill: 1, totalBuyers: 3, topBuyer: "Cleveland Clinic", topPrice: "AED 7/kg" },
  { crop: "Herbs", farmCapacity: "120 kg/month", totalDemand: "280 kg/week", matchRate: 10.7, canFulfill: 0, totalBuyers: 4, topBuyer: "Etihad Catering", topPrice: "AED 35/kg" },
  { crop: "Dates", farmCapacity: "3,200 kg/season", totalDemand: "2,200 kg/season", matchRate: 100, canFulfill: 2, totalBuyers: 2, topBuyer: "ADAA", topPrice: "AED 14/kg" },
];

/* ─── Farm Supplier Profile ─── */
const farmProfile = {
  name: "Al Ain Heritage Farm",
  location: "Al Ain, Abu Dhabi",
  certifications: ["Organic Certified", "GlobalG.A.P.", "UAE Food Safety"],
  totalArea: "12 hectares",
  activeZones: 5,
  crops: ["Tomatoes", "Cucumbers", "Lettuce", "Herbs", "Date Palms"],
  monthlyCapacity: "8,500 kg",
  avgRating: 4.8,
  totalContracts: 4,
  onTimeDelivery: 97,
  totalRevenue: "AED 41,400/month",
};

export default function SupplyChain() {
  const [activeTab, setActiveTab] = useState<SupplyTab>("demand");
  const [selectedType, setSelectedType] = useState<string | null>(null);
  const [expandedDemand, setExpandedDemand] = useState<number | null>(null);

  const tabs: { key: SupplyTab; label: string; icon: React.ReactNode }[] = [
    { key: "demand", label: "Demand Board", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: "contracts", label: "Contracts", icon: <FileText className="w-3.5 h-3.5" /> },
    { key: "matching", label: "Matching", icon: <Handshake className="w-3.5 h-3.5" /> },
    { key: "profile", label: "My Farm", icon: <Building2 className="w-3.5 h-3.5" /> },
  ];

  const filteredDemand = selectedType
    ? demandBoard.filter(d => d.type === selectedType)
    : demandBoard;

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
              <Handshake className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Supply Chain</span>
            </div>
            <div className="flex items-center gap-1 bg-blue-50 px-2.5 py-1 rounded-full">
              <Users className="w-3.5 h-3.5 text-blue-500" />
              <span className="text-[10px] font-bold text-blue-700">68 Buyers</span>
            </div>
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

      {/* Quick Links */}
      <div className="max-w-[480px] mx-auto px-4 pt-3 flex gap-2">
        <a href="/supply-notifications" className="flex-1 flex items-center gap-1.5 bg-amber-50 border border-amber-200/50 rounded-xl px-3 py-2 hover:bg-amber-100 transition-colors">
          <Bell className="w-3.5 h-3.5 text-amber-600" />
          <span className="text-[9px] font-bold text-amber-700">Alerts</span>
          <span className="ml-auto bg-amber-500 text-white text-[7px] font-bold px-1.5 py-0.5 rounded-full">5</span>
        </a>
        <a href="/logistics" className="flex-1 flex items-center gap-1.5 bg-blue-50 border border-blue-200/50 rounded-xl px-3 py-2 hover:bg-blue-100 transition-colors">
          <Truck className="w-3.5 h-3.5 text-blue-600" />
          <span className="text-[9px] font-bold text-blue-700">Logistics</span>
        </a>
        <a href="/financials" className="flex-1 flex items-center gap-1.5 bg-emerald-50 border border-emerald-200/50 rounded-xl px-3 py-2 hover:bg-emerald-100 transition-colors">
          <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
          <span className="text-[9px] font-bold text-emerald-700">Financials</span>
        </a>
      </div>

      <AnimatePresence mode="wait">
        {/* ═══════ DEMAND BOARD ═══════ */}
        {activeTab === "demand" && (
          <motion.div key="demand" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Stakeholder Type Filter */}
            <div className="flex gap-1.5 overflow-x-auto scrollbar-hide mb-4 pb-1">
              <button
                onClick={() => setSelectedType(null)}
                className={`px-3 py-1.5 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-all ${
                  !selectedType ? "bg-emerald-600 text-white" : "bg-muted/40 text-muted-foreground"
                }`}
              >
                All ({demandBoard.length})
              </button>
              {stakeholderTypes.map((st) => {
                const Icon = st.icon;
                return (
                  <button
                    key={st.type}
                    onClick={() => setSelectedType(selectedType === st.type ? null : st.type)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-all ${
                      selectedType === st.type ? "bg-emerald-600 text-white" : "bg-muted/40 text-muted-foreground"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                    {st.label.split(" ")[0]} ({st.count})
                  </button>
                );
              })}
            </div>

            {/* Demand Cards */}
            <div className="space-y-3">
              {filteredDemand.map((d) => {
                const Icon = d.icon;
                const isExpanded = expandedDemand === d.id;
                return (
                  <div key={d.id} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                    <button
                      onClick={() => setExpandedDemand(isExpanded ? null : d.id)}
                      className="w-full p-3 flex items-center justify-between"
                    >
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl ${d.bg} flex items-center justify-center`}>
                          <Icon className={`w-5 h-5 ${d.color}`} />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-1.5">
                            <p className="text-sm font-semibold">{d.name}</p>
                            {d.verified && <CheckCircle2 className="w-3.5 h-3.5 text-blue-500" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[9px] text-muted-foreground">{d.location}</span>
                            <span className="text-[9px] text-amber-600 flex items-center gap-0.5">
                              <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" /> {d.rating}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                          {d.demands.length} items
                        </span>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </button>

                    {isExpanded && (
                      <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="px-3 pb-3 border-t border-border/20 space-y-2 pt-2">
                        {d.demands.map((item, i) => (
                          <div key={i} className="bg-muted/20 rounded-lg p-2.5">
                            <div className="flex items-center justify-between mb-1.5">
                              <p className="text-xs font-semibold">{item.product}</p>
                              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                item.urgency === "high" ? "bg-red-50 text-red-700" :
                                item.urgency === "medium" ? "bg-amber-50 text-amber-700" :
                                "bg-slate-50 text-slate-600"
                              }`}>{item.urgency}</span>
                            </div>
                            <div className="grid grid-cols-3 gap-1.5">
                              <div>
                                <p className="text-[8px] text-muted-foreground">Quantity</p>
                                <p className="text-[10px] font-bold">{item.qty}</p>
                              </div>
                              <div>
                                <p className="text-[8px] text-muted-foreground">Price</p>
                                <p className="text-[10px] font-bold text-emerald-600">{item.price}</p>
                              </div>
                              <div>
                                <p className="text-[8px] text-muted-foreground">Deadline</p>
                                <p className="text-[10px] font-bold">{item.deadline}</p>
                              </div>
                            </div>
                            <button
                              onClick={(e) => { e.stopPropagation(); toast.success("Offer sent!"); }}
                              className="w-full mt-2 py-1.5 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700 transition-colors"
                            >
                              Send Supply Offer
                            </button>
                          </div>
                        ))}
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══════ CONTRACTS ═══════ */}
        {activeTab === "contracts" && (
          <motion.div key="contracts" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Summary */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10 grid grid-cols-3 gap-3">
                <div>
                  <p className="text-[10px] text-white/70">Active</p>
                  <p className="text-2xl font-bold">{contracts.filter(c => c.status === "active").length}</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/70">Monthly Value</p>
                  <p className="text-2xl font-bold">41.4K</p>
                  <p className="text-[9px] text-white/50">AED</p>
                </div>
                <div>
                  <p className="text-[10px] text-white/70">On-Time</p>
                  <p className="text-2xl font-bold">97%</p>
                </div>
              </div>
            </div>

            {/* Contract List */}
            <div className="space-y-2">
              {contracts.map((c) => (
                <div key={c.id} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <p className="text-xs font-semibold">{c.buyer}</p>
                      <p className="text-[9px] text-muted-foreground">{c.product} · {c.qty}</p>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      c.status === "active" ? "bg-emerald-50 text-emerald-700 border-emerald-200" :
                      c.status === "pending" ? "bg-amber-50 text-amber-700 border-amber-200" :
                      "bg-blue-50 text-blue-700 border-blue-200"
                    }`}>{c.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600">{c.price}</p>
                      <p className="text-[7px] text-muted-foreground">Price</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{c.value.split("/")[0].replace("AED ", "")}</p>
                      <p className="text-[7px] text-muted-foreground">AED/mo</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{c.deliveries}</p>
                      <p className="text-[7px] text-muted-foreground">Deliveries</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{c.rating > 0 ? c.rating : "—"}</p>
                      <p className="text-[7px] text-muted-foreground">Rating</p>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-2">{c.startDate} → {c.endDate}</p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ SUPPLY MATCHING ═══════ */}
        {activeTab === "matching" && (
          <motion.div key="matching" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            <div className="bg-emerald-50 rounded-xl p-3 mb-4 flex items-center gap-2">
              <Handshake className="w-5 h-5 text-emerald-600 shrink-0" />
              <p className="text-[10px] text-emerald-800">AI matches your farm capacity with buyer demand. Green means you can fully supply, amber means partial.</p>
            </div>

            <div className="space-y-3">
              {supplyMatches.map((m) => (
                <div key={m.crop} className="bg-card rounded-xl border border-border/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold">{m.crop}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      m.matchRate >= 100 ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                    }`}>
                      {m.matchRate >= 100 ? "Full Supply" : `${m.matchRate.toFixed(0)}% of Demand`}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div className="bg-emerald-50/50 rounded-lg p-2">
                      <p className="text-[8px] text-muted-foreground">Your Capacity</p>
                      <p className="text-xs font-bold text-emerald-700">{m.farmCapacity}</p>
                    </div>
                    <div className="bg-blue-50/50 rounded-lg p-2">
                      <p className="text-[8px] text-muted-foreground">Total Demand</p>
                      <p className="text-xs font-bold text-blue-700">{m.totalDemand}</p>
                    </div>
                  </div>

                  {/* Match Bar */}
                  <div className="w-full bg-muted rounded-full h-2 mb-2">
                    <div
                      className={`rounded-full h-2 transition-all ${m.matchRate >= 100 ? "bg-emerald-500" : "bg-amber-500"}`}
                      style={{ width: `${Math.min(m.matchRate, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between">
                    <p className="text-[9px] text-muted-foreground">
                      Can fulfill {m.canFulfill} of {m.totalBuyers} buyers · Top: {m.topBuyer}
                    </p>
                    <p className="text-[9px] font-bold text-emerald-600">{m.topPrice}</p>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-md">
              Auto-Match with Best Buyers
            </button>
          </motion.div>
        )}

        {/* ═══════ FARM SUPPLIER PROFILE ═══════ */}
        {activeTab === "profile" && (
          <motion.div key="profile" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Profile Card */}
            <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-14 h-14 rounded-2xl bg-white/10 flex items-center justify-center">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <p className="text-lg font-bold">{farmProfile.name}</p>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-3 h-3 text-white/60" />
                      <span className="text-[10px] text-white/70">{farmProfile.location}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 flex-wrap">
                  {farmProfile.certifications.map((cert) => (
                    <span key={cert} className="text-[8px] bg-white/15 px-2 py-0.5 rounded-full">{cert}</span>
                  ))}
                </div>
              </div>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{farmProfile.totalArea}</p>
                <p className="text-[9px] text-muted-foreground">Total Area</p>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{farmProfile.monthlyCapacity}</p>
                <p className="text-[9px] text-muted-foreground">Monthly Capacity</p>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-amber-600">{farmProfile.avgRating}</p>
                <p className="text-[9px] text-muted-foreground">Avg Rating</p>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-emerald-600">{farmProfile.onTimeDelivery}%</p>
                <p className="text-[9px] text-muted-foreground">On-Time Delivery</p>
              </div>
            </div>

            {/* Crops */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Available Crops</h3>
            <div className="flex flex-wrap gap-1.5 mb-4">
              {farmProfile.crops.map((crop) => (
                <span key={crop} className="text-[10px] font-medium bg-emerald-50 text-emerald-700 px-3 py-1.5 rounded-lg border border-emerald-200">
                  {crop}
                </span>
              ))}
            </div>

            {/* Revenue */}
            <div className="bg-card rounded-xl border border-border/40 p-3 mb-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-muted-foreground">Total B2B Revenue</p>
                  <p className="text-xl font-bold text-emerald-600">{farmProfile.totalRevenue}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-muted-foreground">Active Contracts</p>
                  <p className="text-xl font-bold">{farmProfile.totalContracts}</p>
                </div>
              </div>
            </div>

            <button className="w-full py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition-colors">
              Edit Supplier Profile
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
