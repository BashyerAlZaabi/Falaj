/*
 * FALAJ Dashboard — Blue/Green/White Theme
 * Design: Zayed-inspired — emerald/blue tones, clean cards, polished micro-interactions
 * Improved visual hierarchy, depth, and spacing
 */
import BottomNav from "@/components/BottomNav";
import SideMenu from "@/components/SideMenu";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAppState } from "@/contexts/AppStateContext";
import {
  Thermometer, Wind, Sun, Bell, Menu,
  Radio, ShoppingBag, Gift,
  ChevronRight, CloudSun, Leaf, Droplets,
  Package, MessageSquare, Check, X, TrendingUp,
  Clock, ArrowUpRight, Bot, Users,
  BarChart3, Sprout, Waves, Handshake,
  BellRing, Truck, CircleDollarSign, Calendar, Mic, Sparkles
} from "lucide-react";
import FeatureLockedTooltip from "@/components/FeatureLockedTooltip";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";
const ZAYED_DATE_PALMS = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-date-palms-XTf57Co6QRn2jH7hkHhkJP.webp";



const quickActions: { labelKey: string; icon: any; path: string; gradient: string; lightBg: string; lockedFeature?: keyof import("@/contexts/AppStateContext").PackageFeatures }[] = [
  { labelKey: "sensors", icon: Radio, path: "/smart-sensors", gradient: "from-blue-600 to-blue-700", lightBg: "bg-blue-50" },
  { labelKey: "resources", icon: BarChart3, path: "/farm-resources", gradient: "from-cyan-600 to-blue-600", lightBg: "bg-cyan-50" },
  { labelKey: "crops", icon: Sprout, path: "/crop-planning", gradient: "from-emerald-600 to-green-600", lightBg: "bg-emerald-50", lockedFeature: "cropPlanning" },
  { labelKey: "supply", icon: Handshake, path: "/supply-chain", gradient: "from-teal-600 to-cyan-600", lightBg: "bg-teal-50", lockedFeature: "b2bSupplyChain" },
  { labelKey: "market", icon: ShoppingBag, path: "/marketplace", gradient: "from-green-600 to-emerald-600", lightBg: "bg-green-50" },
  { labelKey: "logistics", icon: Truck, path: "/logistics", gradient: "from-indigo-600 to-blue-600", lightBg: "bg-indigo-50", lockedFeature: "logistics" },
  { labelKey: "financials", icon: CircleDollarSign, path: "/financials", gradient: "from-amber-600 to-orange-600", lightBg: "bg-amber-50", lockedFeature: "financialDashboard" },
  { labelKey: "rewards", icon: Gift, path: "/rewards", gradient: "from-emerald-500 to-teal-600", lightBg: "bg-emerald-50" },
];

const recentAIActions = [
  { title: "Reduce Irrigation Zone B", status: "accepted", time: "2h ago", icon: Check, statusColor: "text-green-600 bg-green-50" },
  { title: "Heat Stress Alert Zone E", status: "rejected", time: "3h ago", icon: X, statusColor: "text-red-500 bg-red-50" },
  { title: "Nutrient Adjustment Zone A", status: "pending", time: "4h ago", icon: Clock, statusColor: "text-amber-600 bg-amber-50" },
];



const marketActivity = [
  { text: "New order: 50kg Organic Dates", time: "10m ago", type: "order" },
  { text: "Ahmed sent a message about tomatoes", time: "25m ago", type: "message" },
  { text: "Price alert: Mangoes up 15%", time: "1h ago", type: "price" },
];

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.06 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
};

export default function Dashboard() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { t } = useLanguage();
  const { user, sensors, orders, notifications, unreadCount, getSensorAlerts, getZoneAlertCount, pairAllSensors } = useAppState();

  const pairedSensors = useMemo(() => sensors.filter(s => s.paired), [sensors]);
  const hasPairedSensors = pairedSensors.length > 0;

  // Group sensor nodes by zone (only paired sensors show real data)
  const zoneData = useMemo(() => {
    const zones: Record<string, typeof sensors> = {};
    sensors.forEach(s => {
      if (!zones[s.zone]) zones[s.zone] = [];
      zones[s.zone].push(s);
    });
    return Object.entries(zones).map(([zone, nodes]) => {
      const avgMoisture = Math.round(nodes.reduce((a, n) => a + n.moisture, 0) / nodes.length);
      const avgTemp = Math.round(nodes.reduce((a, n) => a + n.temperature, 0) / nodes.length * 10) / 10;
      const avgPh = Math.round(nodes.reduce((a, n) => a + n.ph, 0) / nodes.length * 10) / 10;
      const avgN = Math.round(nodes.reduce((a, n) => a + n.nitrogen, 0) / nodes.length);
      const hasAlert = nodes.some(n => n.status !== "normal");
      return { zone, nodes: nodes.length, moisture: avgMoisture, temp: avgTemp, ph: avgPh, nitrogen: avgN, hasAlert };
    });
  }, [sensors]);

  const orderSummary = useMemo(() => [
    { label: "Active", count: orders.filter(o => o.status === "pending" || o.status === "confirmed").length, color: "text-blue-600", bg: "bg-blue-50", accent: "border-blue-200/50" },
    { label: "Shipped", count: orders.filter(o => o.status === "shipped").length, color: "text-purple-600", bg: "bg-purple-50", accent: "border-purple-200/50" },
    { label: "Delivered", count: orders.filter(o => o.status === "delivered").length, color: "text-green-600", bg: "bg-green-50", accent: "border-green-200/50" },
  ], [orders]);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return { en: "Good Morning", ar: "صباح الخير", emoji: "☀️" };
    if (hour < 17) return { en: "Good Afternoon", ar: "مساء الخير", emoji: "🌤️" };
    return { en: "Good Evening", ar: "مساء الخير", emoji: "🌙" };
  }, []);

  return (
    <div className="min-h-screen bg-background pb-24">
      <SideMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto flex items-center justify-between px-4 h-14">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen(true)}
              className="p-2.5 -ml-2 rounded-xl hover:bg-muted/60 transition-colors active:scale-95"
              aria-label="Menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-5" />
          </div>
          <div className="flex items-center gap-0.5">
            <Link href="/chat">
              <button className="p-2.5 rounded-xl hover:bg-muted/60 transition-colors relative active:scale-95" aria-label="Messages">
                <MessageSquare className="w-5 h-5 text-muted-foreground" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-blue-500 rounded-full ring-2 ring-white" />
              </button>
            </Link>
            <Link href="/ai-recommendations">
              <button className="p-2.5 rounded-xl hover:bg-muted/60 transition-colors relative active:scale-95" aria-label="Notifications">
                <Bell className="w-5 h-5 text-muted-foreground" />
                {unreadCount > 0 && <span className="absolute top-1 right-1 min-w-[18px] h-[18px] bg-red-500 rounded-full ring-2 ring-white flex items-center justify-center">
                  <span className="text-[9px] font-bold text-white">{unreadCount}</span>
                </span>}
              </button>
            </Link>
          </div>
        </div>
      </header>

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-[480px] mx-auto px-4 pt-5"
      >
        {/* Greeting + Weather */}
        <motion.div variants={fadeUp} className="mb-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <p className="text-sm text-muted-foreground font-medium">{greeting.emoji} {greeting.en}</p>
              <h2 className="text-2xl font-bold tracking-tight mt-0.5">Welcome back, {user.name.split(' ')[0]}!</h2>
            </div>
            <Link href="/profile">
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-emerald-600 to-green-600 flex items-center justify-center text-white font-bold text-sm shadow-md shadow-emerald-600/20">
                {user.avatar}
              </div>
            </Link>
          </div>

          {/* Trial Banner */}
          {user.trialActive && (
            <Link href="/packages">
              <div className="flex items-center gap-3 p-3 bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl mb-3 text-white hover:shadow-lg transition-all active:scale-[0.99]">
                <div className="p-2 rounded-xl bg-white/15">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div className="flex-1">
                  <p className="text-sm font-bold">Harvest Pro Trial</p>
                  <p className="text-[10px] text-white/70">Enjoying premium features — subscribe to keep them</p>
                </div>
                <span className="text-xs font-bold bg-white/20 px-2.5 py-1 rounded-full">View</span>
              </div>
            </Link>
          )}

          {/* Zayed Inspiration Banner */}
          <div className="relative rounded-2xl overflow-hidden mb-4 h-24">
            <img src={ZAYED_DATE_PALMS} alt="Zayed's Vision" className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/50 to-transparent" />
            <div className="absolute inset-0 flex items-center px-4">
              <div>
                <p className="text-white/90 text-xs font-medium italic" style={{ fontFamily: "'Playfair Display', serif" }}>"Give me agriculture, I will give you civilization."</p>
                <p className="text-white/50 text-[9px] mt-1">Sheikh Zayed's Vision</p>
              </div>
            </div>
          </div>

          {/* Daily Planner Card */}
          <Link href="/daily-planner">
            <div className="flex items-center gap-3 p-3.5 bg-emerald-50 border border-emerald-200/60 rounded-2xl mb-4 hover:shadow-md transition-all active:scale-[0.98]">
              <div className="w-10 h-10 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
                <Calendar className="w-5 h-5 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-foreground">Today's Farm Plan</p>
                <p className="text-[11px] text-muted-foreground">Obaid prepared your daily schedule</p>
              </div>
              <ChevronRight className="w-4 h-4 text-emerald-600 shrink-0" />
            </div>
          </Link>

          {/* Weather Card */}
          <div className="relative bg-gradient-to-br from-emerald-700 via-green-600 to-teal-600 rounded-3xl p-5 text-white shadow-xl shadow-emerald-700/20 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
            <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
            <div className="relative z-10">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <p className="text-sm text-white/80 font-medium">Abu Dhabi, UAE</p>
                  <p className="text-4xl font-bold mt-1 tracking-tight">36°C</p>
                  <p className="text-xs text-white/60 mt-1">Partly Cloudy</p>
                </div>
                <CloudSun className="w-16 h-16 text-white/40" />
              </div>
              <div className="flex items-center gap-5 text-sm text-white/70 mt-3 pt-3 border-t border-white/10">
                <span className="flex items-center gap-1.5"><Droplets className="w-4 h-4" /> 28%</span>
                <span className="flex items-center gap-1.5"><Wind className="w-4 h-4" /> 12 km/h</span>
                <span className="flex items-center gap-1.5"><Sun className="w-4 h-4" /> UV 8</span>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Actions */}
        <motion.div variants={fadeUp} className="mb-6">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">{t("quickActions")}</h3>
          <div className="grid grid-cols-3 gap-2.5">
            {quickActions.map((action) => {
              const Icon = action.icon;
              const card = (
                <div className="flex flex-col items-center gap-2.5 p-4 bg-card rounded-2xl border border-border/40 hover:shadow-lg hover:border-primary/20 hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.96]">
                  <div className={`p-3 rounded-2xl ${action.lightBg}`}>
                    <Icon className={`w-5 h-5 ${action.gradient.split(" ")[0].replace("from-", "text-")}`} />
                  </div>
                  <span className="text-[11px] font-semibold text-foreground">{t(action.labelKey)}</span>
                </div>
              );
              if (action.lockedFeature) {
                return (
                  <FeatureLockedTooltip key={action.path} feature={action.lockedFeature}>
                    <Link href={action.path}>{card}</Link>
                  </FeatureLockedTooltip>
                );
              }
              return (
                <Link key={action.path} href={action.path}>{card}</Link>
              );
            })}
          </div>
        </motion.div>

        {/* Order Summary */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">{t("orders")}</h3>
            <Link href="/orders">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5 hover:underline">
                {t("viewAll")} <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="flex gap-2.5">
            {orderSummary.map((o) => (
              <Link key={o.label} href="/orders" className="flex-1">
                <div className={`rounded-2xl border ${o.accent} p-4 text-center hover:shadow-md transition-all bg-card`}>
                  <p className={`text-2xl font-bold ${o.color}`}>{o.count}</p>
                  <p className="text-[10px] font-semibold text-muted-foreground mt-0.5 uppercase tracking-wider">{o.label}</p>
                </div>
              </Link>
            ))}
          </div>
        </motion.div>

        {/* Sensor Nodes Overview — grouped by zone */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Sensor Nodes</h3>
            <Link href="/smart-sensors">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5 hover:underline">
                {t("viewAll")} <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          {!hasPairedSensors ? (
            /* Empty state — no sensors paired yet */
            <div className="bg-card rounded-2xl border border-dashed border-gray-300 p-6 text-center">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
                <Radio className="w-7 h-7 text-blue-400" />
              </div>
              <h4 className="text-sm font-bold text-foreground mb-1">No Sensors Paired Yet</h4>
              <p className="text-xs text-muted-foreground leading-relaxed mb-4">
                Pair your IoT sensors to start monitoring soil moisture, temperature, pH, and nutrients in real time.
              </p>
              <div className="grid grid-cols-2 gap-2 mb-4">
                {zoneData.map((z) => (
                  <div key={z.zone} className="bg-gray-50 rounded-xl p-3 border border-gray-100">
                    <div className="flex items-center justify-between mb-2">
                      <p className="text-xs font-bold text-foreground">{z.zone}</p>
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-gray-100 text-gray-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
                        {z.nodes} nodes
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1">
                      <div>
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Moisture</p>
                        <p className="text-sm font-bold text-gray-300">--</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">Temp</p>
                        <p className="text-sm font-bold text-gray-300">--</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">pH</p>
                        <p className="text-sm font-bold text-gray-300">--</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground/40 uppercase tracking-wider">N (NPK)</p>
                        <p className="text-sm font-bold text-gray-300">--</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
              <Link href="/smart-sensors">
                <button className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200/40 active:scale-[0.98] transition-transform">
                  <Radio className="w-4 h-4" />
                  Pair Your Sensors
                </button>
              </Link>
            </div>
          ) : (
            /* Paired sensors — show real data */
            <div className="grid grid-cols-2 gap-2.5">
              {zoneData.map((z) => {
                const alertCount = getZoneAlertCount(z.zone);
                const hasThresholdAlert = alertCount > 0;
                const zonePaired = sensors.filter(s => s.zone === z.zone && s.paired).length;
                const zoneTotal = sensors.filter(s => s.zone === z.zone).length;
                const allPaired = zonePaired === zoneTotal;
                return (
                <Link key={z.zone} href="/sensor-history">
                  <div className={`bg-card rounded-2xl border relative ${!allPaired ? 'border-gray-200 border-dashed' : hasThresholdAlert ? 'border-red-300 shadow-red-100/50 shadow-md' : z.hasAlert ? 'border-amber-200/60' : 'border-emerald-200/60'} p-4 hover:shadow-md hover:-translate-y-0.5 transition-all duration-200 active:scale-[0.98]`}>
                    {hasThresholdAlert && allPaired && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 rounded-full flex items-center justify-center ring-2 ring-white shadow-lg z-10">
                        <span className="text-[10px] font-bold text-white">{alertCount}</span>
                      </div>
                    )}
                    <div className="flex items-center justify-between mb-2.5">
                      <p className="text-xs font-bold text-foreground">{z.zone}</p>
                      <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${!allPaired ? 'bg-gray-100 text-gray-400' : hasThresholdAlert ? 'bg-red-50 text-red-600' : z.hasAlert ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${!allPaired ? 'bg-gray-300' : hasThresholdAlert ? 'bg-red-500 animate-pulse' : z.hasAlert ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
                        {allPaired ? `${z.nodes} nodes` : `${zonePaired}/${zoneTotal} paired`}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                      <div>
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Moisture</p>
                        <p className={`text-sm font-bold ${allPaired ? 'text-blue-600' : 'text-gray-300'}`}>{allPaired ? `${z.moisture}%` : '--'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">Temp</p>
                        <p className={`text-sm font-bold ${!allPaired ? 'text-gray-300' : z.temp > 33 ? 'text-amber-600' : 'text-emerald-600'}`}>{allPaired ? `${z.temp}°C` : '--'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">pH</p>
                        <p className={`text-sm font-bold ${allPaired ? 'text-green-600' : 'text-gray-300'}`}>{allPaired ? z.ph : '--'}</p>
                      </div>
                      <div>
                        <p className="text-[9px] text-muted-foreground/60 uppercase tracking-wider">N (NPK)</p>
                        <p className={`text-sm font-bold ${allPaired ? 'text-teal-600' : 'text-gray-300'}`}>{allPaired ? z.nitrogen : '--'}</p>
                      </div>
                    </div>
                  </div>
                </Link>
                );
              })}
            </div>
          )}
        </motion.div>

        {/* Recent AI Actions */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">AI Actions</h3>
            <Link href="/ai-recommendations">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5 hover:underline">
                {t("viewAll")} <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="bg-card rounded-2xl border border-border/40 overflow-hidden shadow-sm">
            {recentAIActions.map((action, i) => {
              const StatusIcon = action.icon;
              return (
                <Link key={i} href="/ai-recommendations">
                  <div className={`flex items-center gap-3 px-4 py-3.5 hover:bg-muted/30 transition-colors active:bg-muted/50 ${
                    i < recentAIActions.length - 1 ? "border-b border-border/20" : ""
                  }`}>
                    <div className={`p-2 rounded-xl ${action.statusColor}`}>
                      <StatusIcon className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{action.title}</p>
                      <p className="text-[10px] text-muted-foreground capitalize font-medium">{action.status}</p>
                    </div>
                    <span className="text-[10px] text-muted-foreground/60 shrink-0">{action.time}</span>
                  </div>
                </Link>
              );
            })}
          </div>
        </motion.div>

        {/* Marketplace Activity */}
        <motion.div variants={fadeUp} className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">{t("recentActivity")}</h3>
            <Link href="/marketplace">
              <span className="text-xs font-semibold text-primary flex items-center gap-0.5 hover:underline">
                {t("viewAll")} <ChevronRight className="w-3.5 h-3.5" />
              </span>
            </Link>
          </div>
          <div className="space-y-2">
            {marketActivity.map((item, i) => (
              <div key={i} className="flex items-center gap-3 p-3.5 bg-card rounded-2xl border border-border/40 hover:shadow-sm hover:-translate-y-0.5 transition-all active:scale-[0.99]">
                <div className={`p-2.5 rounded-xl ${
                  item.type === "order" ? "bg-green-50" : item.type === "message" ? "bg-blue-50" : "bg-amber-50"
                }`}>
                  {item.type === "order" ? <Package className="w-4 h-4 text-green-600" /> :
                   item.type === "message" ? <MessageSquare className="w-4 h-4 text-blue-600" /> :
                   <TrendingUp className="w-4 h-4 text-amber-600" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{item.text}</p>
                  <p className="text-[10px] text-muted-foreground/60">{item.time}</p>
                </div>
                <ArrowUpRight className="w-4 h-4 text-muted-foreground/20" />
              </div>
            ))}
          </div>
        </motion.div>

        {/* AI Assistant Card */}
        <motion.div variants={fadeUp} className="mb-4">
          <Link href="/ai-assistant">
            <div className="relative bg-gradient-to-br from-emerald-50 to-teal-50 rounded-3xl p-5 border border-emerald-100/80 hover:shadow-lg transition-all duration-200 active:scale-[0.99] overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-100/30 rounded-full -translate-y-6 translate-x-6" />
              <div className="relative z-10 flex items-start gap-3">
                <div className="p-3 bg-gradient-to-br from-emerald-400 to-teal-500 rounded-2xl shadow-lg shadow-emerald-500/20">
                  <Bot className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-emerald-900">FALAJ AI Assistant</p>
                  <p className="text-sm text-emerald-700/80 mt-1 leading-relaxed">
                    Ask anything — crop analysis, irrigation, pest detection, market prices
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-emerald-400 mt-1" />
              </div>
            </div>
          </Link>
        </motion.div>

        {/* Community Card */}
        <motion.div variants={fadeUp} className="mb-2">
          <Link href="/community">
            <div className="relative bg-gradient-to-br from-indigo-50 to-blue-50 rounded-3xl p-5 border border-indigo-100/80 hover:shadow-lg transition-all duration-200 active:scale-[0.99] overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-100/30 rounded-full -translate-y-6 translate-x-6" />
              <div className="relative z-10 flex items-start gap-3">
                <div className="p-3 bg-gradient-to-br from-indigo-400 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/20">
                  <Users className="w-6 h-6 text-white" />
                </div>
                <div className="flex-1">
                  <p className="text-base font-bold text-indigo-900">Farmer Community</p>
                  <p className="text-sm text-indigo-700/80 mt-1 leading-relaxed">
                    3,400+ farmers sharing tips, trading, and growing together
                  </p>
                </div>
                <ChevronRight className="w-5 h-5 text-indigo-400 mt-1" />
              </div>
            </div>
          </Link>
        </motion.div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
