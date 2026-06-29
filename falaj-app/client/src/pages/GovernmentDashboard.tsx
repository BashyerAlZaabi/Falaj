/*
 * FALAJ Government Dashboard — Restricted Access
 * Only accessible to government administrators via /government-dashboard
 * NOT visible in farmer navigation, bottom nav, or side menu
 * Provides: farmer behavior analytics, performance metrics, productivity data,
 * AI recommendation adaptability, and comprehensive oversight tools
 */
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import {
  Shield, Building2, Landmark, Users, TrendingUp, BarChart3,
  Droplets, Leaf, Bot, Radio, ShoppingBag, Globe, Eye,
  Download, Filter, Calendar, ChevronRight, ArrowUpRight,
  ArrowDownRight, Activity, Target, Zap, Award, Crown,
  BadgeCheck, FileText, MapPin, Thermometer, AlertTriangle,
  CheckCircle2, XCircle, Clock, Sprout, Lock, LogOut,
  PieChart, LineChart, Search
} from "lucide-react";
import { toast } from "sonner";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";
const UAE_EMBLEM = "https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Emblem_of_the_United_Arab_Emirates.svg/120px-Emblem_of_the_United_Arab_Emirates.svg.png";

type GovTab = "overview" | "farmers" | "productivity" | "ai_adaptability" | "sustainability" | "reports";

/* ─── Aggregate Platform Stats ─── */
const platformStats = {
  totalFarmers: 1247,
  activeFarmers: 1089,
  totalFarms: 892,
  totalSensors: 4328,
  activeSensors: 4012,
  totalArea: "12,450 hectares",
  avgCropHealth: 87,
  waterSaved: "2.4M liters",
  aiRecommendations: 18420,
  aiAccepted: 14736,
  aiRejected: 2210,
  aiPending: 1474,
  marketplaceTransactions: 8945,
  marketplaceVolume: "4.2M AED",
  avgFarmerLevel: 8.4,
  carbonCreditsEarned: 342,
};

/* ─── Regional Breakdown ─── */
const regions = [
  { name: "Abu Dhabi", farmers: 412, farms: 298, sensors: 1456, cropHealth: 89, waterEff: 82, aiAdoption: 84 },
  { name: "Al Ain", farmers: 356, farms: 245, sensors: 1124, cropHealth: 91, waterEff: 88, aiAdoption: 79 },
  { name: "Dubai", farmers: 189, farms: 134, sensors: 678, cropHealth: 85, waterEff: 76, aiAdoption: 88 },
  { name: "Sharjah", farmers: 134, farms: 98, sensors: 534, cropHealth: 83, waterEff: 74, aiAdoption: 72 },
  { name: "RAK", farmers: 87, farms: 62, sensors: 312, cropHealth: 86, waterEff: 79, aiAdoption: 68 },
  { name: "Fujairah", farmers: 69, farms: 55, sensors: 224, cropHealth: 84, waterEff: 71, aiAdoption: 65 },
];

/* ─── Farmer Performance Tiers ─── */
const performanceTiers = [
  { tier: "Elite", range: "Lv 20+", count: 45, percent: 3.6, color: "bg-amber-500", textColor: "text-amber-700" },
  { tier: "Advanced", range: "Lv 15-19", count: 156, percent: 12.5, color: "bg-emerald-500", textColor: "text-emerald-700" },
  { tier: "Intermediate", range: "Lv 10-14", count: 389, percent: 31.2, color: "bg-blue-500", textColor: "text-blue-700" },
  { tier: "Developing", range: "Lv 5-9", count: 412, percent: 33.0, color: "bg-orange-400", textColor: "text-orange-700" },
  { tier: "Beginner", range: "Lv 1-4", count: 245, percent: 19.6, color: "bg-slate-400", textColor: "text-slate-700" },
];

/* ─── AI Recommendation Categories ─── */
const aiCategories = [
  { category: "Irrigation Optimization", total: 5240, accepted: 4450, rate: 84.9, impact: "+22% water efficiency", trend: "up" },
  { category: "Pest & Disease Prevention", total: 3180, accepted: 2670, rate: 84.0, impact: "-35% crop loss", trend: "up" },
  { category: "Fertilizer Management", total: 2890, accepted: 2168, rate: 75.0, impact: "+18% yield", trend: "same" },
  { category: "Harvest Timing", total: 2450, accepted: 2058, rate: 84.0, impact: "+12% quality", trend: "up" },
  { category: "Soil Health", total: 2100, accepted: 1512, rate: 72.0, impact: "+15% fertility", trend: "down" },
  { category: "Climate Adaptation", total: 1680, accepted: 1176, rate: 70.0, impact: "Resilience +28%", trend: "up" },
  { category: "Market Price Optimization", total: 880, accepted: 702, rate: 79.8, impact: "+8% revenue", trend: "up" },
];

/* ─── Monthly Trends (last 6 months) ─── */
const monthlyTrends = [
  { month: "Oct", farmers: 890, aiRate: 72, waterEff: 68, cropHealth: 82, revenue: 2.8 },
  { month: "Nov", farmers: 945, aiRate: 74, waterEff: 71, cropHealth: 83, revenue: 3.1 },
  { month: "Dec", farmers: 1020, aiRate: 76, waterEff: 74, cropHealth: 85, revenue: 3.4 },
  { month: "Jan", farmers: 1089, aiRate: 78, waterEff: 77, cropHealth: 86, revenue: 3.6 },
  { month: "Feb", farmers: 1156, aiRate: 79, waterEff: 79, cropHealth: 87, revenue: 3.9 },
  { month: "Mar", farmers: 1247, aiRate: 80, waterEff: 82, cropHealth: 87, revenue: 4.2 },
];

/* ─── Top Performing Farmers ─── */
const topFarmers = [
  { name: "Ahmed Al Mansouri", farm: "Al Ain Organic Farm", region: "Al Ain", level: 22, xp: 12450, aiRate: 96, waterEff: 94, cropHealth: 97, sensors: 12 },
  { name: "Fatima Al Dhaheri", farm: "Desert Rose Farm", region: "Abu Dhabi", level: 20, xp: 11200, aiRate: 92, waterEff: 91, cropHealth: 95, sensors: 8 },
  { name: "Mohammed Khalifa", farm: "Green Valley Estate", region: "Al Ain", level: 18, xp: 9800, aiRate: 88, waterEff: 87, cropHealth: 93, sensors: 10 },
  { name: "Sara Al Hashimi", farm: "Palm Oasis Farm", region: "Dubai", level: 16, xp: 8500, aiRate: 90, waterEff: 85, cropHealth: 91, sensors: 6 },
  { name: "Khalid Al Dhaheri", farm: "Sunrise Agriculture", region: "Abu Dhabi", level: 15, xp: 7200, aiRate: 85, waterEff: 82, cropHealth: 89, sensors: 8 },
];

/* ─── Sustainability Metrics ─── */
const sustainabilityMetrics = {
  totalWaterSaved: "2.4M liters",
  waterSavedTrend: 18,
  carbonReduced: "156 tons",
  carbonTrend: 24,
  organicFarms: 89,
  organicTrend: 32,
  renewableEnergy: "34%",
  renewableTrend: 12,
  biodiversityIndex: 7.8,
  soilHealthAvg: 82,
};

/* ─── Alerts ─── */
const govAlerts = [
  { type: "warning", message: "12 farms in Fujairah showing declining water efficiency", time: "2h ago" },
  { type: "info", message: "New batch of 45 farmers onboarded this week", time: "5h ago" },
  { type: "success", message: "Al Ain region achieved 90%+ AI adoption rate", time: "1 day ago" },
  { type: "warning", message: "Sensor connectivity issues reported in RAK region", time: "1 day ago" },
  { type: "success", message: "Carbon credit milestone: 300 tons reduced across platform", time: "3 days ago" },
];

export default function GovernmentDashboard() {
  const [authenticated, setAuthenticated] = useState(false);
  const [activeTab, setActiveTab] = useState<GovTab>("overview");
  const [selectedRegion, setSelectedRegion] = useState<string>("all");
  const [dateRange, setDateRange] = useState("6m");

  const aiAcceptanceRate = ((platformStats.aiAccepted / platformStats.aiRecommendations) * 100).toFixed(1);

  const tabs: { key: GovTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: "farmers", label: "Farmers", icon: <Users className="w-3.5 h-3.5" /> },
    { key: "productivity", label: "Productivity", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: "ai_adaptability", label: "AI Insights", icon: <Bot className="w-3.5 h-3.5" /> },
    { key: "sustainability", label: "Sustainability", icon: <Leaf className="w-3.5 h-3.5" /> },
    { key: "reports", label: "Reports", icon: <FileText className="w-3.5 h-3.5" /> },
  ];

  /* ─── Login Gate ─── */
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-emerald-950 to-slate-900 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-[400px]"
        >
          <div className="text-center mb-8">
            <div className="flex items-center justify-center gap-3 mb-4">
              <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-8 invert" />
            </div>
            <div className="flex items-center justify-center gap-2 mb-3">
              <Shield className="w-6 h-6 text-emerald-400" />
              <h1 className="text-xl font-bold text-white">Government Portal</h1>
            </div>
            <p className="text-sm text-slate-400">Authorized access only. This dashboard is restricted to UAE government officials and authorized personnel.</p>
          </div>

          <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6">
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Government Entity</label>
                <select className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="" className="text-slate-900">Select entity...</option>
                  <option value="adafsa" className="text-slate-900">Abu Dhabi Agriculture & Food Safety Authority</option>
                  <option value="moccae" className="text-slate-900">Ministry of Climate Change & Environment</option>
                  <option value="tamm" className="text-slate-900">TAMM Government Services</option>
                  <option value="fsa" className="text-slate-900">Food Safety Authority</option>
                  <option value="moe" className="text-slate-900">Ministry of Economy</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Official ID</label>
                <input
                  type="text"
                  placeholder="Enter your government ID"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1.5">Access Code</label>
                <input
                  type="password"
                  placeholder="Enter access code"
                  className="w-full bg-white/10 border border-white/20 rounded-xl px-3 py-2.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                onClick={() => { setAuthenticated(true); toast.success("Government access granted"); }}
                className="w-full bg-emerald-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
              >
                <BadgeCheck className="w-4 h-4" />
                Authenticate via UAE PASS
              </button>
            </div>
            <p className="text-[10px] text-slate-500 text-center mt-4">
              Protected by UAE Government Security Protocol. All access is logged and audited.
            </p>
          </div>
        </motion.div>
      </div>
    );
  }

  /* ─── Authenticated Dashboard ─── */
  return (
    <div className="min-h-screen bg-slate-50 pb-8">
      {/* Government Header */}
      <header className="sticky top-0 z-40 bg-gradient-to-r from-slate-900 to-emerald-900 text-white shadow-lg">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-emerald-400" />
              <div>
                <span className="text-sm font-bold">FALAJ Gov Dashboard</span>
                <p className="text-[9px] text-slate-400">Abu Dhabi Agriculture Authority</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => toast.info("Downloading report...")} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <Download className="w-4 h-4 text-slate-400" />
              </button>
              <button onClick={() => setAuthenticated(false)} className="p-1.5 hover:bg-white/10 rounded-lg transition-colors">
                <LogOut className="w-4 h-4 text-slate-400" />
              </button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide -mx-1 px-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-emerald-600 text-white"
                    : "bg-white/10 text-slate-400 hover:bg-white/15 hover:text-white"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* ═══════ OVERVIEW ═══════ */}
        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Key Metrics */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {[
                { label: "Total Farmers", value: platformStats.totalFarmers.toLocaleString(), icon: Users, color: "text-blue-600 bg-blue-50", trend: "+14.5%", up: true },
                { label: "Active Sensors", value: platformStats.activeSensors.toLocaleString(), icon: Radio, color: "text-emerald-600 bg-emerald-50", trend: "+8.2%", up: true },
                { label: "AI Acceptance", value: `${aiAcceptanceRate}%`, icon: Bot, color: "text-purple-600 bg-purple-50", trend: "+6.1%", up: true },
                { label: "Water Saved", value: platformStats.waterSaved, icon: Droplets, color: "text-cyan-600 bg-cyan-50", trend: "+18%", up: true },
                { label: "Crop Health Avg", value: `${platformStats.avgCropHealth}%`, icon: Leaf, color: "text-green-600 bg-green-50", trend: "+3.2%", up: true },
                { label: "Market Volume", value: platformStats.marketplaceVolume, icon: ShoppingBag, color: "text-pink-600 bg-pink-50", trend: "+22%", up: true },
              ].map((stat) => {
                const Icon = stat.icon;
                const [tc, bg] = stat.color.split(" ");
                return (
                  <div key={stat.label} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                    <div className="flex items-center justify-between mb-2">
                      <div className={`p-1.5 rounded-lg ${bg}`}>
                        <Icon className={`w-4 h-4 ${tc}`} />
                      </div>
                      <span className={`text-[10px] font-semibold flex items-center gap-0.5 ${stat.up ? "text-green-600" : "text-red-600"}`}>
                        {stat.up ? <ArrowUpRight className="w-3 h-3" /> : <ArrowDownRight className="w-3 h-3" />}
                        {stat.trend}
                      </span>
                    </div>
                    <p className="text-lg font-bold text-slate-900">{stat.value}</p>
                    <p className="text-[10px] text-slate-500">{stat.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Growth Trend (Visual Bar Chart) */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-slate-900">Platform Growth</h3>
                <span className="text-[10px] text-slate-500">Last 6 months</span>
              </div>
              <div className="flex items-end gap-2 h-28">
                {monthlyTrends.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-slate-600">{m.farmers}</span>
                    <div className="w-full bg-blue-100 rounded-t-lg relative" style={{ height: `${(m.farmers / 1300) * 100}%` }}>
                      <div className="absolute inset-0 bg-blue-500 rounded-t-lg opacity-80" />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Alerts */}
            <h3 className="text-sm font-bold text-slate-900 mb-3">Recent Alerts</h3>
            <div className="space-y-2 mb-5">
              {govAlerts.map((alert, i) => (
                <div key={i} className={`rounded-xl p-3 flex items-start gap-2.5 ${
                  alert.type === "warning" ? "bg-amber-50 border border-amber-200" :
                  alert.type === "success" ? "bg-green-50 border border-green-200" :
                  "bg-blue-50 border border-blue-200"
                }`}>
                  {alert.type === "warning" && <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />}
                  {alert.type === "success" && <CheckCircle2 className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />}
                  {alert.type === "info" && <Activity className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className="text-xs font-medium text-slate-800">{alert.message}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5">{alert.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ FARMERS ═══════ */}
        {activeTab === "farmers" && (
          <motion.div key="farmers" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Farmer Distribution by Level */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Farmer Performance Tiers</h3>
              <div className="space-y-3">
                {performanceTiers.map((tier) => (
                  <div key={tier.tier}>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-800">{tier.tier}</span>
                        <span className="text-[10px] text-slate-500">{tier.range}</span>
                      </div>
                      <span className="text-xs font-semibold text-slate-700">{tier.count} ({tier.percent}%)</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden">
                      <div className={`${tier.color} h-full rounded-full transition-all`} style={{ width: `${tier.percent}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 pt-3 border-t border-slate-100 flex items-center justify-between">
                <span className="text-[10px] text-slate-500">Average Level</span>
                <span className="text-sm font-bold text-slate-900">{platformStats.avgFarmerLevel}</span>
              </div>
            </div>

            {/* Regional Breakdown */}
            <h3 className="text-sm font-bold text-slate-900 mb-3">Regional Breakdown</h3>
            <div className="space-y-2.5 mb-5">
              {regions.map((region) => (
                <div key={region.name} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-blue-500" />
                      <span className="text-sm font-bold text-slate-900">{region.name}</span>
                    </div>
                    <span className="text-xs text-slate-500">{region.farmers} farmers</span>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    <div className="text-center">
                      <p className="text-xs font-bold text-slate-800">{region.farms}</p>
                      <p className="text-[9px] text-slate-500">Farms</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-green-600">{region.cropHealth}%</p>
                      <p className="text-[9px] text-slate-500">Health</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-blue-600">{region.waterEff}%</p>
                      <p className="text-[9px] text-slate-500">Water</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs font-bold text-purple-600">{region.aiAdoption}%</p>
                      <p className="text-[9px] text-slate-500">AI</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Top Farmers */}
            <h3 className="text-sm font-bold text-slate-900 mb-3">Top Performing Farmers</h3>
            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
              {topFarmers.map((farmer, i) => (
                <div key={farmer.name} className={`px-4 py-3 ${i < topFarmers.length - 1 ? "border-b border-slate-100" : ""}`}>
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-xs font-bold text-blue-700 shrink-0">
                      #{i + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{farmer.name}</p>
                      <p className="text-[10px] text-slate-500">{farmer.farm} · {farmer.region}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-xs font-bold text-slate-900">Lv.{farmer.level}</p>
                      <p className="text-[10px] text-slate-500">{farmer.xp.toLocaleString()} XP</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-2 mt-2 ml-11">
                    <div className="text-center bg-purple-50 rounded-lg py-1">
                      <p className="text-[10px] font-bold text-purple-700">{farmer.aiRate}%</p>
                      <p className="text-[8px] text-purple-500">AI</p>
                    </div>
                    <div className="text-center bg-blue-50 rounded-lg py-1">
                      <p className="text-[10px] font-bold text-blue-700">{farmer.waterEff}%</p>
                      <p className="text-[8px] text-blue-500">Water</p>
                    </div>
                    <div className="text-center bg-green-50 rounded-lg py-1">
                      <p className="text-[10px] font-bold text-green-700">{farmer.cropHealth}%</p>
                      <p className="text-[8px] text-green-500">Health</p>
                    </div>
                    <div className="text-center bg-slate-50 rounded-lg py-1">
                      <p className="text-[10px] font-bold text-slate-700">{farmer.sensors}</p>
                      <p className="text-[8px] text-slate-500">Sensors</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ PRODUCTIVITY ═══════ */}
        {activeTab === "productivity" && (
          <motion.div key="productivity" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Productivity KPIs */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                <Leaf className="w-5 h-5 text-green-600 mb-2" />
                <p className="text-xl font-bold text-slate-900">{platformStats.avgCropHealth}%</p>
                <p className="text-[10px] text-slate-500">Avg Crop Health</p>
                <span className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5 mt-1">
                  <ArrowUpRight className="w-3 h-3" /> +3.2% vs last month
                </span>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                <Droplets className="w-5 h-5 text-blue-600 mb-2" />
                <p className="text-xl font-bold text-slate-900">82%</p>
                <p className="text-[10px] text-slate-500">Water Efficiency</p>
                <span className="text-[10px] font-semibold text-green-600 flex items-center gap-0.5 mt-1">
                  <ArrowUpRight className="w-3 h-3" /> +5.1% vs last month
                </span>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                <Target className="w-5 h-5 text-amber-600 mb-2" />
                <p className="text-xl font-bold text-slate-900">{platformStats.totalArea}</p>
                <p className="text-[10px] text-slate-500">Total Farm Area</p>
              </div>
              <div className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                <Activity className="w-5 h-5 text-red-500 mb-2" />
                <p className="text-xl font-bold text-slate-900">{((platformStats.activeSensors / platformStats.totalSensors) * 100).toFixed(1)}%</p>
                <p className="text-[10px] text-slate-500">Sensor Uptime</p>
              </div>
            </div>

            {/* Productivity Trends */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Crop Health Trend</h3>
              <div className="flex items-end gap-2 h-24">
                {monthlyTrends.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-green-700">{m.cropHealth}%</span>
                    <div className="w-full rounded-t-lg relative" style={{ height: `${(m.cropHealth / 100) * 100}%` }}>
                      <div className="absolute inset-0 bg-green-400 rounded-t-lg opacity-80" />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Water Efficiency Trend */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Water Efficiency Trend</h3>
              <div className="flex items-end gap-2 h-24">
                {monthlyTrends.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-blue-700">{m.waterEff}%</span>
                    <div className="w-full rounded-t-lg relative" style={{ height: `${(m.waterEff / 100) * 100}%` }}>
                      <div className="absolute inset-0 bg-blue-400 rounded-t-lg opacity-80" />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Marketplace Economy */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Marketplace Economy</h3>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-pink-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-pink-700">{platformStats.marketplaceTransactions.toLocaleString()}</p>
                  <p className="text-[10px] text-pink-500">Transactions</p>
                </div>
                <div className="bg-pink-50 rounded-xl p-3 text-center">
                  <p className="text-lg font-bold text-pink-700">{platformStats.marketplaceVolume}</p>
                  <p className="text-[10px] text-pink-500">Total Volume</p>
                </div>
              </div>
              <div className="flex items-end gap-2 h-20 mt-4">
                {monthlyTrends.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-pink-700">{m.revenue}M</span>
                    <div className="w-full rounded-t-lg relative" style={{ height: `${(m.revenue / 5) * 100}%` }}>
                      <div className="absolute inset-0 bg-pink-400 rounded-t-lg opacity-80" />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════ AI ADAPTABILITY ═══════ */}
        {activeTab === "ai_adaptability" && (
          <motion.div key="ai" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* AI Overview Card */}
            <div className="bg-gradient-to-br from-purple-600 to-indigo-700 rounded-2xl p-5 text-white mb-5 shadow-lg">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-6 h-6" />
                <h3 className="text-sm font-bold">AI Recommendation Analytics</h3>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold">{platformStats.aiRecommendations.toLocaleString()}</p>
                  <p className="text-[9px] text-white/70">Total Sent</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold">{aiAcceptanceRate}%</p>
                  <p className="text-[9px] text-white/70">Acceptance</p>
                </div>
                <div className="bg-white/10 rounded-xl p-2.5 text-center">
                  <p className="text-lg font-bold">{platformStats.aiPending.toLocaleString()}</p>
                  <p className="text-[9px] text-white/70">Pending</p>
                </div>
              </div>
            </div>

            {/* Acceptance Breakdown */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Response Breakdown</h3>
              <div className="flex gap-1 h-6 rounded-full overflow-hidden mb-3">
                <div className="bg-green-500 flex items-center justify-center" style={{ width: `${(platformStats.aiAccepted / platformStats.aiRecommendations) * 100}%` }}>
                  <span className="text-[8px] font-bold text-white">Accepted</span>
                </div>
                <div className="bg-red-400 flex items-center justify-center" style={{ width: `${(platformStats.aiRejected / platformStats.aiRecommendations) * 100}%` }}>
                  <span className="text-[8px] font-bold text-white">Rejected</span>
                </div>
                <div className="bg-slate-300 flex items-center justify-center" style={{ width: `${(platformStats.aiPending / platformStats.aiRecommendations) * 100}%` }}>
                  <span className="text-[8px] font-bold text-slate-600">Pending</span>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{platformStats.aiAccepted.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-500">Accepted</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <XCircle className="w-3.5 h-3.5 text-red-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{platformStats.aiRejected.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-500">Rejected</p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400" />
                  <div>
                    <p className="text-xs font-bold text-slate-900">{platformStats.aiPending.toLocaleString()}</p>
                    <p className="text-[9px] text-slate-500">Pending</p>
                  </div>
                </div>
              </div>
            </div>

            {/* AI Category Breakdown */}
            <h3 className="text-sm font-bold text-slate-900 mb-3">By Category</h3>
            <div className="space-y-2.5 mb-5">
              {aiCategories.map((cat) => (
                <div key={cat.category} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900">{cat.category}</span>
                    <div className="flex items-center gap-1">
                      {cat.trend === "up" && <ArrowUpRight className="w-3 h-3 text-green-500" />}
                      {cat.trend === "down" && <ArrowDownRight className="w-3 h-3 text-red-500" />}
                      <span className={`text-xs font-bold ${cat.rate >= 80 ? "text-green-600" : cat.rate >= 70 ? "text-amber-600" : "text-red-600"}`}>
                        {cat.rate}%
                      </span>
                    </div>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden mb-2">
                    <div className={`h-full rounded-full ${cat.rate >= 80 ? "bg-green-500" : cat.rate >= 70 ? "bg-amber-500" : "bg-red-500"}`} style={{ width: `${cat.rate}%` }} />
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-500">{cat.accepted.toLocaleString()} / {cat.total.toLocaleString()} accepted</span>
                    <span className="text-[10px] font-semibold text-blue-600">{cat.impact}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* AI Adoption Trend */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">AI Adoption Trend</h3>
              <div className="flex items-end gap-2 h-24">
                {monthlyTrends.map((m) => (
                  <div key={m.month} className="flex-1 flex flex-col items-center gap-1">
                    <span className="text-[9px] font-semibold text-purple-700">{m.aiRate}%</span>
                    <div className="w-full rounded-t-lg relative" style={{ height: `${(m.aiRate / 100) * 100}%` }}>
                      <div className="absolute inset-0 bg-purple-400 rounded-t-lg opacity-80" />
                    </div>
                    <span className="text-[9px] text-slate-500">{m.month}</span>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════ SUSTAINABILITY ═══════ */}
        {activeTab === "sustainability" && (
          <motion.div key="sustainability" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Sustainability Hero */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-700 rounded-2xl p-5 text-white mb-5 shadow-lg">
              <div className="flex items-center gap-2 mb-2">
                <Globe className="w-5 h-5" />
                <h3 className="text-sm font-bold">UAE Net Zero 2050 Contribution</h3>
              </div>
              <p className="text-xs text-white/80 mb-3">FALAJ platform's contribution to UAE sustainability goals</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-lg font-bold">{sustainabilityMetrics.totalWaterSaved}</p>
                  <p className="text-[9px] text-white/70">Water Saved</p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-lg font-bold">{sustainabilityMetrics.carbonReduced}</p>
                  <p className="text-[9px] text-white/70">Carbon Reduced</p>
                </div>
              </div>
            </div>

            {/* Sustainability KPIs */}
            <div className="grid grid-cols-2 gap-2.5 mb-5">
              {[
                { label: "Water Saved", value: sustainabilityMetrics.totalWaterSaved, trend: `+${sustainabilityMetrics.waterSavedTrend}%`, icon: Droplets, color: "text-blue-600 bg-blue-50" },
                { label: "Carbon Reduced", value: sustainabilityMetrics.carbonReduced, trend: `+${sustainabilityMetrics.carbonTrend}%`, icon: Globe, color: "text-teal-600 bg-teal-50" },
                { label: "Organic Farms", value: String(sustainabilityMetrics.organicFarms), trend: `+${sustainabilityMetrics.organicTrend}%`, icon: Sprout, color: "text-green-600 bg-green-50" },
                { label: "Renewable Energy", value: sustainabilityMetrics.renewableEnergy, trend: `+${sustainabilityMetrics.renewableTrend}%`, icon: Zap, color: "text-amber-600 bg-amber-50" },
              ].map((kpi) => {
                const Icon = kpi.icon;
                const [tc, bg] = kpi.color.split(" ");
                return (
                  <div key={kpi.label} className="bg-white rounded-2xl border border-slate-200 p-3.5 shadow-sm">
                    <div className={`p-1.5 rounded-lg ${bg} w-fit mb-2`}>
                      <Icon className={`w-4 h-4 ${tc}`} />
                    </div>
                    <p className="text-lg font-bold text-slate-900">{kpi.value}</p>
                    <p className="text-[10px] text-slate-500">{kpi.label}</p>
                    <span className="text-[10px] font-semibold text-green-600">{kpi.trend}</span>
                  </div>
                );
              })}
            </div>

            {/* Carbon Credits */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Carbon Credits Earned</h3>
              <div className="flex items-center gap-4">
                <div className="w-20 h-20 rounded-full border-4 border-teal-500 flex items-center justify-center bg-teal-50">
                  <div className="text-center">
                    <p className="text-xl font-bold text-teal-700">{platformStats.carbonCreditsEarned}</p>
                    <p className="text-[8px] text-teal-500">Credits</p>
                  </div>
                </div>
                <div className="flex-1 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">Water conservation</span>
                    <span className="text-[10px] font-bold text-slate-900">142</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">Renewable energy</span>
                    <span className="text-[10px] font-bold text-slate-900">89</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">Organic farming</span>
                    <span className="text-[10px] font-bold text-slate-900">67</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-slate-600">Soil restoration</span>
                    <span className="text-[10px] font-bold text-slate-900">44</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Soil Health */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Soil Health by Region</h3>
              <div className="space-y-2.5">
                {regions.map((r) => {
                  const soilHealth = Math.floor(65 + Math.random() * 25);
                  return (
                    <div key={r.name}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-slate-700">{r.name}</span>
                        <span className={`text-xs font-bold ${soilHealth >= 80 ? "text-green-600" : soilHealth >= 70 ? "text-amber-600" : "text-red-600"}`}>{soilHealth}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                        <div className={`h-full rounded-full ${soilHealth >= 80 ? "bg-green-400" : soilHealth >= 70 ? "bg-amber-400" : "bg-red-400"}`} style={{ width: `${soilHealth}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════ REPORTS ═══════ */}
        {activeTab === "reports" && (
          <motion.div key="reports" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            <div className="bg-white rounded-2xl border border-slate-200 p-4 mb-5 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-2">Generate Reports</h3>
              <p className="text-xs text-slate-500 mb-4">Export comprehensive data reports for government analysis and policy-making.</p>
              <div className="space-y-2.5">
                {[
                  { name: "Farmer Performance Report", desc: "Individual and aggregate farmer metrics", icon: Users, format: "PDF / Excel" },
                  { name: "AI Adoption Analysis", desc: "AI recommendation acceptance rates and impact", icon: Bot, format: "PDF / Excel" },
                  { name: "Water Conservation Report", desc: "Water usage, savings, and efficiency data", icon: Droplets, format: "PDF / Excel" },
                  { name: "Sustainability Impact Report", desc: "Carbon credits, organic farming, environmental impact", icon: Globe, format: "PDF" },
                  { name: "Marketplace Economy Report", desc: "Transaction volumes, revenue, and trade data", icon: ShoppingBag, format: "PDF / Excel" },
                  { name: "Sensor Infrastructure Report", desc: "Sensor deployment, uptime, and coverage", icon: Radio, format: "PDF" },
                  { name: "Regional Comparison Report", desc: "Cross-region performance benchmarks", icon: MapPin, format: "PDF / Excel" },
                  { name: "Compliance & Licensing Report", desc: "Trade license status and regulatory compliance", icon: FileText, format: "PDF" },
                ].map((report) => {
                  const Icon = report.icon;
                  return (
                    <div key={report.name} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                      <div className="p-2 bg-white rounded-lg shadow-sm shrink-0">
                        <Icon className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-bold text-slate-900">{report.name}</p>
                        <p className="text-[10px] text-slate-500">{report.desc}</p>
                      </div>
                      <button
                        onClick={() => toast.success(`Generating ${report.name}...`)}
                        className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors shrink-0"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Scheduled Reports */}
            <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
              <h3 className="text-sm font-bold text-slate-900 mb-3">Scheduled Reports</h3>
              <div className="space-y-2">
                {[
                  { name: "Weekly Performance Summary", schedule: "Every Monday 8:00 AM", status: "active" },
                  { name: "Monthly Sustainability Report", schedule: "1st of every month", status: "active" },
                  { name: "Quarterly Policy Brief", schedule: "Every quarter", status: "active" },
                ].map((sr) => (
                  <div key={sr.name} className="flex items-center justify-between py-2.5 border-b border-slate-100 last:border-0">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{sr.name}</p>
                      <p className="text-[10px] text-slate-500">{sr.schedule}</p>
                    </div>
                    <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">{sr.status}</span>
                  </div>
                ))}
              </div>
              <button
                onClick={() => toast.info("Schedule new report...")}
                className="w-full mt-3 bg-blue-50 text-blue-600 py-2.5 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors"
              >
                + Schedule New Report
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
