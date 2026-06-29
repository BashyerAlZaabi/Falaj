/*
 * FALAJ Farm Hub — One-stop farm management
 * Connected to AppState for live data
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useState, useMemo } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import FeatureGate from "@/components/FeatureGate";
import FeatureLockedTooltip from "@/components/FeatureLockedTooltip";
import {
  Radio, BarChart3, Sprout, Gauge, Droplets, Thermometer,
  Wind, Sun, ChevronRight, Leaf, Zap, Settings2,
  ArrowRight, Activity, Waves, Battery, TrendingUp, Calendar,
  CheckCircle2, Power, ToggleLeft, ToggleRight
} from "lucide-react";

type FarmTab = "overview" | "sensors" | "resources" | "crops";

const sensorMeta: Record<string, { icon: any; color: string; bg: string; label: string }> = {
  soil_moisture: { icon: Droplets, color: "text-blue-600", bg: "bg-blue-50", label: "Soil Moisture" },
  temperature: { icon: Thermometer, color: "text-amber-600", bg: "bg-amber-50", label: "Temperature" },
  humidity: { icon: Wind, color: "text-teal-600", bg: "bg-teal-50", label: "Humidity" },
  light: { icon: Sun, color: "text-orange-600", bg: "bg-orange-50", label: "Light Level" },
  ph: { icon: Leaf, color: "text-green-600", bg: "bg-green-50", label: "pH Level" },
  wind: { icon: Wind, color: "text-cyan-600", bg: "bg-cyan-50", label: "Wind Speed" },
};

const resourceMeta: Record<string, { icon: any; color: string; bg: string }> = {
  "Water Usage": { icon: Waves, color: "text-blue-600", bg: "bg-blue-50" },
  "Soil Health": { icon: Leaf, color: "text-emerald-600", bg: "bg-emerald-50" },
  "Energy": { icon: Zap, color: "text-amber-600", bg: "bg-amber-50" },
  "Fertilizer": { icon: Battery, color: "text-purple-600", bg: "bg-purple-50" },
  "Sunlight": { icon: Sun, color: "text-orange-600", bg: "bg-orange-50" },
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function FarmHub() {
  const [activeTab, setActiveTab] = useState<FarmTab>("overview");
  const { sensors, valves, crops, resources, zoneThresholds, toggleValve, setValveAuto, addXP } = useAppState();

  // Group sensor nodes by zone
  const zoneGroups = useMemo(() => {
    const zones: Record<string, typeof sensors> = {};
    sensors.forEach(s => { if (!zones[s.zone]) zones[s.zone] = []; zones[s.zone].push(s); });
    return Object.entries(zones).map(([zone, nodes]) => ({
      zone, nodes: nodes.length,
      avgMoisture: Math.round(nodes.reduce((a, n) => a + n.moisture, 0) / nodes.length),
      avgTemp: Math.round(nodes.reduce((a, n) => a + n.temperature, 0) / nodes.length * 10) / 10,
      avgPh: Math.round(nodes.reduce((a, n) => a + n.ph, 0) / nodes.length * 10) / 10,
      avgN: Math.round(nodes.reduce((a, n) => a + n.nitrogen, 0) / nodes.length),
      avgP: Math.round(nodes.reduce((a, n) => a + n.phosphorus, 0) / nodes.length),
      avgK: Math.round(nodes.reduce((a, n) => a + n.potassium, 0) / nodes.length),
      hasAlert: nodes.some(n => n.status !== "normal"),
      threshold: zoneThresholds.find(t => t.zone === zone),
    }));
  }, [sensors, zoneThresholds]);

  const farmHealth = useMemo(() => {
    const avg = crops.reduce((sum, c) => sum + c.health, 0) / (crops.length || 1);
    return Math.round(avg);
  }, [crops]);

  const tabs: { key: FarmTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <Activity className="w-3.5 h-3.5" /> },
    { key: "sensors", label: "Sensors", icon: <Radio className="w-3.5 h-3.5" /> },
    { key: "resources", label: "Resources", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: "crops", label: "Crops", icon: <Sprout className="w-3.5 h-3.5" /> },
  ];

  const handleToggleValve = (id: string, zone: string) => {
    toggleValve(id);
    const valve = valves.find(v => v.id === id);
    const newStatus = valve?.status === "open" ? "Closed" : "Opened";
    toast.success(`${zone} valve ${newStatus}`);
    addXP(5);
  };

  const handleToggleAuto = (id: string, zone: string, currentAuto: boolean) => {
    setValveAuto(id, !currentAuto);
    toast.success(`${zone} ${!currentAuto ? "Auto mode ON" : "Manual mode ON"}`);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Leaf className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">My Farm</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full">{crops.length} Zones Active</span>
            </div>
          </div>
          <div className="flex gap-1">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-[11px] font-semibold whitespace-nowrap transition-all duration-200 ${
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

      <motion.div variants={stagger} initial="hidden" animate="show" key={activeTab} className="max-w-[480px] mx-auto px-4 pt-4">
        {/* ═══ OVERVIEW TAB ═══ */}
        {activeTab === "overview" && (
          <>
            <motion.div variants={fadeUp} className="mb-4">
              <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-white/70 font-medium">Farm Health Score</p>
                    <p className="text-4xl font-bold mt-1">{farmHealth}<span className="text-lg text-white/60">/100</span></p>
                    <p className="text-xs text-white/50 mt-1 flex items-center gap-1">
                      <TrendingUp className="w-3 h-3" /> +3 from last week
                    </p>
                  </div>
                  <div className="w-20 h-20 rounded-full border-4 border-white/20 flex items-center justify-center">
                    <CheckCircle2 className="w-10 h-10 text-white/80" />
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Sensor Nodes by Zone */}
            <motion.div variants={fadeUp} className="mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Sensor Nodes</h3>
                <button onClick={() => setActiveTab("sensors")} className="text-xs font-semibold text-primary flex items-center gap-0.5">
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {zoneGroups.map((z) => (
                  <Link key={z.zone} href="/smart-sensors">
                    <div className={`bg-card rounded-xl border ${z.hasAlert ? 'border-amber-200/60' : 'border-emerald-200/60'} p-3.5 hover:shadow-md transition-all active:scale-[0.98]`}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-bold">{z.zone}</p>
                          <span className="text-[9px] text-muted-foreground bg-muted/50 px-1.5 py-0.5 rounded-full">{z.threshold?.cropType}</span>
                        </div>
                        <div className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold ${z.hasAlert ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${z.hasAlert ? 'bg-amber-500 animate-pulse' : 'bg-green-500'}`} />
                          {z.nodes} nodes
                        </div>
                      </div>
                      <div className="grid grid-cols-4 gap-2">
                        <div><p className="text-[8px] text-muted-foreground/60 uppercase">Moisture</p><p className="text-sm font-bold text-blue-600">{z.avgMoisture}%</p></div>
                        <div><p className="text-[8px] text-muted-foreground/60 uppercase">Temp</p><p className={`text-sm font-bold ${z.avgTemp > 33 ? 'text-amber-600' : 'text-emerald-600'}`}>{z.avgTemp}°C</p></div>
                        <div><p className="text-[8px] text-muted-foreground/60 uppercase">pH</p><p className="text-sm font-bold text-green-600">{z.avgPh}</p></div>
                        <div><p className="text-[8px] text-muted-foreground/60 uppercase">NPK</p><p className="text-sm font-bold text-teal-600">{z.avgN}</p></div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Quick Actions */}
            <motion.div variants={fadeUp} className="mb-4">
              <div className="flex gap-2">
                <Link href="/sensor-history" className="flex-1">
                  <div className="bg-card rounded-xl border border-border/40 p-3.5 hover:shadow-md transition-all active:scale-[0.98] text-center">
                    <BarChart3 className="w-5 h-5 mx-auto text-blue-600 mb-1.5" />
                    <p className="text-[10px] font-bold">Sensor History</p>
                    <p className="text-[8px] text-muted-foreground">7d / 30d charts</p>
                  </div>
                </Link>
                <FeatureLockedTooltip feature="calibration" position="bottom">
                  <Link href="/sensor-calibration" className="flex-1">
                    <div className="bg-card rounded-xl border border-border/40 p-3.5 hover:shadow-md transition-all active:scale-[0.98] text-center">
                      <Settings2 className="w-5 h-5 mx-auto text-emerald-600 mb-1.5" />
                      <p className="text-[10px] font-bold">Calibrate Nodes</p>
                      <p className="text-[8px] text-muted-foreground">Step-by-step</p>
                    </div>
                  </Link>
                </FeatureLockedTooltip>
                <FeatureLockedTooltip feature="cropPlanning" position="bottom">
                  <Link href="/crop-planning" className="flex-1">
                    <div className="bg-card rounded-xl border border-border/40 p-3.5 hover:shadow-md transition-all active:scale-[0.98] text-center">
                      <Calendar className="w-5 h-5 mx-auto text-purple-600 mb-1.5" />
                      <p className="text-[10px] font-bold">Crop Planning</p>
                      <p className="text-[8px] text-muted-foreground">AI optimized</p>
                    </div>
                  </Link>
                </FeatureLockedTooltip>
              </div>
            </motion.div>

            {/* Resource Cards from live state */}
            <motion.div variants={fadeUp} className="mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Resources Today</h3>
                <button onClick={() => setActiveTab("resources")} className="text-xs font-semibold text-primary flex items-center gap-0.5">
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {resources.slice(0, 4).map((r) => {
                  const meta = resourceMeta[r.name] || { icon: BarChart3, color: "text-gray-600", bg: "bg-gray-50" };
                  const Icon = meta.icon;
                  const good = r.trend <= 0 || r.name === "Soil Health" || r.name === "Sunlight";
                  return (
                    <Link key={r.id} href="/farm-resources">
                      <div className="bg-card rounded-xl border border-border/40 p-3 hover:shadow-md transition-all active:scale-[0.98]">
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`p-1.5 rounded-lg ${meta.bg}`}>
                            <Icon className={`w-4 h-4 ${meta.color}`} />
                          </div>
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${good ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
                            {r.trendLabel}
                          </span>
                        </div>
                        <p className="text-lg font-bold">{r.value.toLocaleString()} {r.unit}</p>
                        <p className="text-[10px] text-muted-foreground">{r.name}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>

            {/* Crops from live state */}
            <motion.div variants={fadeUp} className="mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Crops</h3>
                <button onClick={() => setActiveTab("crops")} className="text-xs font-semibold text-primary flex items-center gap-0.5">
                  View All <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              <div className="space-y-2">
                {crops.slice(0, 3).map((c) => (
                  <Link key={c.id} href="/crop-planning">
                    <div className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.99]">
                      <span className="text-2xl">{c.icon}</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{c.name}</p>
                        <p className="text-[10px] text-muted-foreground">{c.zone} · {c.stage}</p>
                        <div className="mt-1.5 h-1.5 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full" style={{ width: `${c.progress}%` }} />
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-emerald-600">{c.health}%</p>
                        <p className="text-[9px] text-muted-foreground">Health</p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>

            {/* Smart Valves — FUNCTIONAL toggle */}
            <motion.div variants={fadeUp} className="mb-4">
              <div className="flex items-center justify-between mb-2.5">
                <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em]">Smart Valves</h3>
                <Link href="/smart-sensors">
                  <span className="text-xs font-semibold text-primary flex items-center gap-0.5">
                    Manage <ChevronRight className="w-3.5 h-3.5" />
                  </span>
                </Link>
              </div>
              <div className="space-y-2">
                {valves.map((v) => (
                  <div key={v.id} className="bg-card rounded-xl border border-border/40 p-3 flex items-center gap-3">
                    <button
                      onClick={() => handleToggleValve(v.id, v.zone)}
                      className={`p-2 rounded-xl transition-colors ${v.status === "open" ? "bg-blue-50 hover:bg-blue-100" : "bg-slate-100 hover:bg-slate-200"}`}
                    >
                      <Power className={`w-4 h-4 ${v.status === "open" ? "text-blue-600" : "text-slate-400"}`} />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{v.zone}</p>
                        <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                          v.status === "open" ? "bg-blue-100 text-blue-700" : "bg-slate-100 text-slate-500"
                        }`}>{v.status}</span>
                      </div>
                      <p className="text-[10px] text-muted-foreground">{v.flowRate} L/min · {v.schedule}</p>
                    </div>
                    <button
                      onClick={() => handleToggleAuto(v.id, v.zone, v.auto)}
                      className="p-1"
                    >
                      {v.auto ? (
                        <ToggleRight className="w-6 h-6 text-emerald-600" />
                      ) : (
                        <ToggleLeft className="w-6 h-6 text-slate-400" />
                      )}
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}

        {/* ═══ SENSORS TAB ═══ */}
        {activeTab === "sensors" && (
          <>
            <motion.div variants={fadeUp} className="mb-4">
              <div className="flex gap-2 mb-3">
                <Link href="/smart-sensors" className="flex-1">
                  <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl p-4 text-white text-center hover:shadow-lg transition-all active:scale-[0.98]">
                    <Radio className="w-6 h-6 mx-auto mb-2 opacity-80" />
                    <p className="text-xs font-bold">Pair New Sensor</p>
                  </div>
                </Link>
                <Link href="/smart-sensors" className="flex-1">
                  <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-xl p-4 text-white text-center hover:shadow-lg transition-all active:scale-[0.98]">
                    <Gauge className="w-6 h-6 mx-auto mb-2 opacity-80" />
                    <p className="text-xs font-bold">Valve Control</p>
                  </div>
                </Link>
              </div>
            </motion.div>
            <motion.div variants={fadeUp}>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2.5">All Sensor Nodes ({sensors.length})</h3>
              {zoneGroups.map((z) => (
                <div key={z.zone} className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <p className="text-xs font-bold text-foreground">{z.zone}</p>
                    <span className="text-[9px] text-muted-foreground">{z.threshold?.cropType} · {z.threshold?.growthStage}</span>
                  </div>
                  <div className="space-y-1.5">
                    {sensors.filter(s => s.zone === z.zone).map((s) => (
                      <Link key={s.id} href="/smart-sensors">
                        <div className={`bg-card rounded-xl border p-3 flex items-center gap-3 transition-all active:scale-[0.99] ${s.paired ? 'border-border/40 hover:shadow-md' : 'border-dashed border-gray-300'}`}>
                          <div className={`p-2 rounded-lg ${s.paired ? 'bg-emerald-50' : 'bg-gray-50'}`}>
                            <Radio className={`w-4 h-4 ${s.paired ? 'text-emerald-600' : 'text-gray-300'}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${!s.paired ? 'text-gray-400' : ''}`}>{s.name}</p>
                            <p className="text-[10px] text-muted-foreground">Depth: {s.depth} · {s.paired ? s.lastReading : 'Not paired'}</p>
                          </div>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div><p className="text-[8px] text-muted-foreground/60">M</p><p className={`text-xs font-bold ${s.paired ? 'text-blue-600' : 'text-gray-300'}`}>{s.paired ? `${s.moisture}%` : '--'}</p></div>
                            <div><p className="text-[8px] text-muted-foreground/60">T</p><p className={`text-xs font-bold ${s.paired ? 'text-amber-600' : 'text-gray-300'}`}>{s.paired ? `${s.temperature}°` : '--'}</p></div>
                            <div><p className="text-[8px] text-muted-foreground/60">pH</p><p className={`text-xs font-bold ${s.paired ? 'text-green-600' : 'text-gray-300'}`}>{s.paired ? s.ph : '--'}</p></div>
                            <div><p className="text-[8px] text-muted-foreground/60">N</p><p className={`text-xs font-bold ${s.paired ? 'text-teal-600' : 'text-gray-300'}`}>{s.paired ? s.nitrogen : '--'}</p></div>
                          </div>
                          <span className={`w-2 h-2 rounded-full shrink-0 ${!s.paired ? 'bg-gray-300' : s.status === "normal" ? "bg-green-500" : "bg-amber-500 animate-pulse"}`} />
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              ))}
            </motion.div>
            <motion.div variants={fadeUp} className="mt-4">
              <Link href="/sensors-map">
                <div className="bg-muted/30 rounded-xl border border-border/40 p-4 text-center hover:bg-muted/50 transition-all active:scale-[0.99]">
                  <p className="text-sm font-semibold text-primary">View Sensor Map</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">See all sensors on the farm map</p>
                </div>
              </Link>
            </motion.div>
          </>
        )}

        {/* ═══ RESOURCES TAB ═══ */}
        {activeTab === "resources" && (
          <>
            <motion.div variants={fadeUp} className="mb-4">
              <div className="grid grid-cols-2 gap-2">
                {resources.map((r) => {
                  const meta = resourceMeta[r.name] || { icon: BarChart3, color: "text-gray-600", bg: "bg-gray-50" };
                  const Icon = meta.icon;
                  const good = r.trend <= 0 || r.name === "Soil Health" || r.name === "Sunlight";
                  return (
                    <Link key={r.id} href="/farm-resources">
                      <div className="bg-card rounded-xl border border-border/40 p-4 hover:shadow-md transition-all active:scale-[0.98]">
                        <div className="flex items-center justify-between mb-3">
                          <div className={`p-2 rounded-xl ${meta.bg}`}>
                            <Icon className={`w-5 h-5 ${meta.color}`} />
                          </div>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${good ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"}`}>
                            {r.trendLabel}
                          </span>
                        </div>
                        <p className="text-xl font-bold">{r.value.toLocaleString()} {r.unit}</p>
                        <p className="text-[11px] text-muted-foreground font-medium mt-0.5">{r.name}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </motion.div>
            <motion.div variants={fadeUp}>
              <Link href="/farm-resources">
                <div className="bg-gradient-to-r from-emerald-50 to-teal-50 rounded-xl border border-emerald-100 p-4 flex items-center gap-3 hover:shadow-md transition-all active:scale-[0.99]">
                  <BarChart3 className="w-5 h-5 text-emerald-600" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-emerald-900">Detailed Resource Analytics</p>
                    <p className="text-[10px] text-emerald-700/70">View historical data, trends, and AI recommendations</p>
                  </div>
                  <ArrowRight className="w-4 h-4 text-emerald-400" />
                </div>
              </Link>
            </motion.div>
          </>
        )}

        {/* ═══ CROPS TAB ═══ */}
        {activeTab === "crops" && (
          <>
            <motion.div variants={fadeUp} className="mb-4">
              <Link href="/crop-planning">
                <div className="bg-gradient-to-br from-emerald-600 to-green-600 rounded-xl p-4 text-white flex items-center gap-3 hover:shadow-lg transition-all active:scale-[0.98]">
                  <Calendar className="w-6 h-6 opacity-80" />
                  <div>
                    <p className="text-sm font-bold">AI Crop Planner</p>
                    <p className="text-xs text-white/70">Get automated crop planning recommendations</p>
                  </div>
                  <ArrowRight className="w-5 h-5 opacity-60 ml-auto" />
                </div>
              </Link>
            </motion.div>
            <motion.div variants={fadeUp}>
              <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2.5">Active Crops ({crops.length})</h3>
              <div className="space-y-2">
                {crops.map((c) => (
                  <Link key={c.id} href="/crop-planning">
                    <div className="bg-card rounded-xl border border-border/40 p-4 hover:shadow-md transition-all active:scale-[0.99]">
                      <div className="flex items-center gap-3 mb-3">
                        <span className="text-3xl">{c.icon}</span>
                        <div className="flex-1">
                          <p className="text-sm font-bold">{c.name}</p>
                          <p className="text-[10px] text-muted-foreground">{c.zone} · {c.stage}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-lg font-bold text-emerald-600">{c.health}%</p>
                          <p className="text-[9px] text-muted-foreground">Health</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex-1 h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all" style={{ width: `${c.progress}%` }} />
                        </div>
                        <span className="text-[10px] font-bold text-muted-foreground">{c.progress}%</span>
                      </div>
                      <div className="flex items-center gap-4 mt-2 pt-2 border-t border-border/20">
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Droplets className="w-3 h-3 text-blue-500" /> {c.waterNeeded} L/day</span>
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Leaf className="w-3 h-3 text-green-500" /> {c.fertilizerNeeded} kg/day</span>
                        <span className="text-[9px] text-muted-foreground flex items-center gap-1"><Calendar className="w-3 h-3 text-amber-500" /> {c.expectedHarvest}</span>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
