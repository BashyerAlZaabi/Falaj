/**
 * FALAJ Farm Resources — Measurable Natural Resources
 * All farm natural resources tracked: Water, Soil, Sunlight, Fertilizer, Energy
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Droplets, Thermometer, Sun, Leaf, Zap, Gauge,
  TrendingUp, TrendingDown, ArrowRight, ChevronRight,
  Battery, CloudRain, Wind, Waves, Beaker, Sprout,
  BarChart3, AlertTriangle, CheckCircle2, Clock
} from "lucide-react";

type ResourceTab = "water" | "soil" | "sunlight" | "fertilizer" | "energy";

/* ─── Water Data ─── */
const waterData = {
  reservoirLevel: 72,
  reservoirCapacity: 50000,
  currentFlow: 12.4,
  todayUsage: 1840,
  weeklyUsage: 11200,
  monthlyUsage: 42800,
  dailyTarget: 2000,
  savedVsTraditional: 35,
  zones: [
    { zone: "A", crop: "Tomatoes", usage: 420, target: 500, status: "optimal" },
    { zone: "B", crop: "Cucumbers", usage: 380, target: 350, status: "over" },
    { zone: "C", crop: "Lettuce", usage: 290, target: 300, status: "optimal" },
    { zone: "D", crop: "Herbs", usage: 180, target: 200, status: "optimal" },
    { zone: "E", crop: "Date Palms", usage: 570, target: 600, status: "optimal" },
  ],
  hourlyFlow: [8, 10, 14, 18, 22, 20, 16, 12, 10, 8, 6, 5, 4, 6, 10, 14, 18, 16, 12, 8, 6, 4, 3, 2],
};

/* ─── Soil Data ─── */
const soilData = {
  zones: [
    { zone: "A", crop: "Tomatoes", pH: 6.5, nitrogen: 42, phosphorus: 28, potassium: 35, organic: 3.2, salinity: 1.8, status: "good" },
    { zone: "B", crop: "Cucumbers", pH: 6.8, nitrogen: 38, phosphorus: 22, potassium: 30, organic: 2.8, salinity: 2.1, status: "warning" },
    { zone: "C", crop: "Lettuce", pH: 6.3, nitrogen: 45, phosphorus: 32, potassium: 38, organic: 3.5, salinity: 1.5, status: "good" },
    { zone: "D", crop: "Herbs", pH: 6.6, nitrogen: 40, phosphorus: 25, potassium: 33, organic: 3.0, salinity: 1.9, status: "good" },
    { zone: "E", crop: "Date Palms", pH: 7.2, nitrogen: 30, phosphorus: 18, potassium: 28, organic: 2.2, salinity: 3.5, status: "alert" },
  ],
};

/* ─── Sunlight Data ─── */
const sunlightData = {
  currentUV: 8,
  solarRadiation: 920,
  daylightHours: 12.5,
  par: 1450,
  todayPeak: 1100,
  zones: [
    { zone: "A", exposure: "Full Sun", hours: 10.2, par: 1420, status: "optimal" },
    { zone: "B", exposure: "Partial Shade", hours: 7.5, par: 980, status: "low" },
    { zone: "C", exposure: "Full Sun", hours: 10.8, par: 1480, status: "optimal" },
    { zone: "D", exposure: "Partial Shade", hours: 8.0, par: 1050, status: "optimal" },
    { zone: "E", exposure: "Full Sun", hours: 11.5, par: 1520, status: "optimal" },
  ],
};

/* ─── Fertilizer Data ─── */
const fertilizerData = {
  totalApplied: 12.5,
  monthlyBudget: 20,
  costPerLiter: 8.5,
  monthlyCost: 170,
  schedule: [
    { zone: "A", crop: "Tomatoes", type: "NPK 20-20-20", concentration: 250, applied: 3.2, nextDose: "Tomorrow 6:00 AM", status: "on_schedule" },
    { zone: "B", crop: "Cucumbers", type: "Calcium Nitrate", concentration: 180, applied: 2.1, nextDose: "Today 4:00 PM", status: "due" },
    { zone: "C", crop: "Lettuce", type: "NPK 15-5-30", concentration: 200, applied: 1.8, nextDose: "In 2 days", status: "on_schedule" },
    { zone: "D", crop: "Herbs", type: "Organic Compost Tea", concentration: 150, applied: 1.5, nextDose: "In 3 days", status: "on_schedule" },
    { zone: "E", crop: "Date Palms", type: "Potassium Sulfate", concentration: 300, applied: 3.9, nextDose: "Overdue", status: "overdue" },
  ],
};

/* ─── Energy Data ─── */
const energyData = {
  solarOutput: 4.2,
  solarCapacity: 6.0,
  batteryAvg: 74,
  pumpEnergy: 2.8,
  dailyCost: 12.5,
  monthlyCost: 375,
  devices: [
    { name: "Solar Panel Array", output: "4.2 kW", status: "generating", efficiency: 92 },
    { name: "Water Pump - Main", consumption: "1.8 kW", status: "active", runtime: "6h 20m" },
    { name: "Fertilizer Injector", consumption: "0.5 kW", status: "standby", runtime: "1h 45m" },
    { name: "Sensor Network", consumption: "0.3 kW", status: "active", runtime: "24/7" },
    { name: "Cooling System", consumption: "0.2 kW", status: "active", runtime: "8h 10m" },
  ],
};

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function FarmResources() {
  const [activeTab, setActiveTab] = useState<ResourceTab>("water");

  const tabs: { key: ResourceTab; label: string; icon: React.ReactNode; color: string }[] = [
    { key: "water", label: "Water", icon: <Droplets className="w-3.5 h-3.5" />, color: "from-blue-600 to-cyan-600" },
    { key: "soil", label: "Soil", icon: <Sprout className="w-3.5 h-3.5" />, color: "from-amber-600 to-orange-600" },
    { key: "sunlight", label: "Sun", icon: <Sun className="w-3.5 h-3.5" />, color: "from-yellow-500 to-orange-500" },
    { key: "fertilizer", label: "Fertilizer", icon: <Beaker className="w-3.5 h-3.5" />, color: "from-green-600 to-emerald-600" },
    { key: "energy", label: "Energy", icon: <Zap className="w-3.5 h-3.5" />, color: "from-violet-600 to-purple-600" },
  ];

  const StatusBadge = ({ status }: { status: string }) => {
    const styles: Record<string, string> = {
      optimal: "bg-emerald-50 text-emerald-700 border-emerald-200",
      good: "bg-emerald-50 text-emerald-700 border-emerald-200",
      on_schedule: "bg-emerald-50 text-emerald-700 border-emerald-200",
      generating: "bg-emerald-50 text-emerald-700 border-emerald-200",
      active: "bg-blue-50 text-blue-700 border-blue-200",
      warning: "bg-amber-50 text-amber-700 border-amber-200",
      low: "bg-amber-50 text-amber-700 border-amber-200",
      over: "bg-red-50 text-red-700 border-red-200",
      alert: "bg-red-50 text-red-700 border-red-200",
      overdue: "bg-red-50 text-red-700 border-red-200",
      due: "bg-orange-50 text-orange-700 border-orange-200",
      standby: "bg-slate-50 text-slate-600 border-slate-200",
    };
    return (
      <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${styles[status] || styles.active}`}>
        {status.replace("_", " ")}
      </span>
    );
  };

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
              <BarChart3 className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Farm Resources</span>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.key
                    ? `bg-gradient-to-r ${tab.color} text-white shadow-md`
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

      <AnimatePresence mode="wait">
        {/* ═══════ WATER ═══════ */}
        {activeTab === "water" && (
          <motion.div key="water" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Reservoir */}
            <div className="bg-gradient-to-br from-blue-600 to-cyan-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <p className="text-xs text-white/70 font-medium">Reservoir Level</p>
                    <p className="text-3xl font-bold">{waterData.reservoirLevel}%</p>
                    <p className="text-[10px] text-white/50">{(waterData.reservoirCapacity * waterData.reservoirLevel / 100).toLocaleString()} / {waterData.reservoirCapacity.toLocaleString()} L</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-white/70">Current Flow</p>
                    <p className="text-xl font-bold">{waterData.currentFlow} <span className="text-sm font-normal">L/min</span></p>
                  </div>
                </div>
                <div className="w-full bg-white/20 rounded-full h-3 mb-2">
                  <div className="bg-white rounded-full h-3 transition-all" style={{ width: `${waterData.reservoirLevel}%` }} />
                </div>
              </div>
            </div>

            {/* Usage Summary */}
            <div className="grid grid-cols-3 gap-2 mb-4">
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{waterData.todayUsage.toLocaleString()}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Today (L)</p>
                <div className="flex items-center justify-center gap-0.5 mt-1">
                  <TrendingDown className="w-3 h-3 text-emerald-500" />
                  <span className="text-[9px] text-emerald-600 font-semibold">-{waterData.savedVsTraditional}%</span>
                </div>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{(waterData.weeklyUsage / 1000).toFixed(1)}K</p>
                <p className="text-[9px] text-muted-foreground font-medium">This Week (L)</p>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-blue-600">{(waterData.monthlyUsage / 1000).toFixed(1)}K</p>
                <p className="text-[9px] text-muted-foreground font-medium">This Month (L)</p>
              </div>
            </div>

            {/* Zone Usage */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Water Usage by Zone</h3>
            <div className="space-y-2 mb-4">
              {waterData.zones.map((z) => (
                <div key={z.zone} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-blue-600">{z.zone}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{z.crop}</p>
                        <p className="text-[9px] text-muted-foreground">{z.usage}L / {z.target}L target</p>
                      </div>
                    </div>
                    <StatusBadge status={z.status} />
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5">
                    <div
                      className={`rounded-full h-1.5 transition-all ${z.status === "over" ? "bg-red-500" : "bg-blue-500"}`}
                      style={{ width: `${Math.min((z.usage / z.target) * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>

            {/* Hourly Flow Chart */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">24h Water Flow (L/min)</h3>
            <div className="bg-card rounded-xl border border-border/40 p-3 mb-4">
              <div className="flex items-end gap-0.5 h-20">
                {waterData.hourlyFlow.map((v, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-blue-400/60 rounded-t-sm min-h-[2px]"
                      style={{ height: `${(v / 22) * 100}%` }}
                    />
                  </div>
                ))}
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[8px] text-muted-foreground">12AM</span>
                <span className="text-[8px] text-muted-foreground">6AM</span>
                <span className="text-[8px] text-muted-foreground">12PM</span>
                <span className="text-[8px] text-muted-foreground">6PM</span>
                <span className="text-[8px] text-muted-foreground">Now</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════ SOIL ═══════ */}
        {activeTab === "soil" && (
          <motion.div key="soil" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            <div className="space-y-3">
              {soilData.zones.map((z) => (
                <div key={z.zone} className="bg-card rounded-xl border border-border/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-amber-50 flex items-center justify-center">
                        <span className="text-xs font-bold text-amber-700">{z.zone}</span>
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{z.crop}</p>
                        <p className="text-[10px] text-muted-foreground">Zone {z.zone}</p>
                      </div>
                    </div>
                    <StatusBadge status={z.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-xs font-bold">{z.pH}</p>
                      <p className="text-[8px] text-muted-foreground">pH Level</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-xs font-bold text-blue-600">{z.nitrogen}</p>
                      <p className="text-[8px] text-muted-foreground">N (ppm)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-xs font-bold text-orange-600">{z.phosphorus}</p>
                      <p className="text-[8px] text-muted-foreground">P (ppm)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-xs font-bold text-purple-600">{z.potassium}</p>
                      <p className="text-[8px] text-muted-foreground">K (ppm)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className="text-xs font-bold text-green-600">{z.organic}%</p>
                      <p className="text-[8px] text-muted-foreground">Organic</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-2 text-center">
                      <p className={`text-xs font-bold ${z.salinity > 3 ? "text-red-600" : "text-emerald-600"}`}>{z.salinity}</p>
                      <p className="text-[8px] text-muted-foreground">Salinity (dS/m)</p>
                    </div>
                  </div>
                  {z.status === "alert" && (
                    <div className="mt-2 flex items-center gap-1.5 bg-red-50 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 text-red-500" />
                      <span className="text-[10px] text-red-700 font-medium">High salinity — flush irrigation recommended</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ SUNLIGHT ═══════ */}
        {activeTab === "sunlight" && (
          <motion.div key="sunlight" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Current Conditions */}
            <div className="bg-gradient-to-br from-yellow-500 to-orange-500 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/70">UV Index</p>
                  <p className="text-3xl font-bold">{sunlightData.currentUV}</p>
                  <p className="text-[10px] text-white/50">Very High</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">Solar Radiation</p>
                  <p className="text-3xl font-bold">{sunlightData.solarRadiation}</p>
                  <p className="text-[10px] text-white/50">W/m²</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">Daylight Hours</p>
                  <p className="text-2xl font-bold">{sunlightData.daylightHours}h</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">PAR</p>
                  <p className="text-2xl font-bold">{sunlightData.par}</p>
                  <p className="text-[10px] text-white/50">µmol/m²/s</p>
                </div>
              </div>
            </div>

            {/* Zone Exposure */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Zone Sun Exposure</h3>
            <div className="space-y-2">
              {sunlightData.zones.map((z) => (
                <div key={z.zone} className="bg-card rounded-xl border border-border/40 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-yellow-50 flex items-center justify-center">
                      <Sun className="w-4 h-4 text-yellow-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">Zone {z.zone}</p>
                      <p className="text-[9px] text-muted-foreground">{z.exposure} · {z.hours}h today</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{z.par}</p>
                    <p className="text-[9px] text-muted-foreground">PAR µmol</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ FERTILIZER ═══════ */}
        {activeTab === "fertilizer" && (
          <motion.div key="fertilizer" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Summary */}
            <div className="bg-gradient-to-br from-green-600 to-emerald-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/70">Applied This Month</p>
                  <p className="text-3xl font-bold">{fertilizerData.totalApplied}L</p>
                  <p className="text-[10px] text-white/50">of {fertilizerData.monthlyBudget}L budget</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">Monthly Cost</p>
                  <p className="text-3xl font-bold">{fertilizerData.monthlyCost}</p>
                  <p className="text-[10px] text-white/50">AED</p>
                </div>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2 mt-3">
                <div className="bg-white rounded-full h-2" style={{ width: `${(fertilizerData.totalApplied / fertilizerData.monthlyBudget) * 100}%` }} />
              </div>
            </div>

            {/* Schedule */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Fertilizer Schedule</h3>
            <div className="space-y-2">
              {fertilizerData.schedule.map((s) => (
                <div key={s.zone} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-green-700">{s.zone}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{s.crop}</p>
                        <p className="text-[9px] text-muted-foreground">{s.type}</p>
                      </div>
                    </div>
                    <StatusBadge status={s.status} />
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{s.concentration}</p>
                      <p className="text-[8px] text-muted-foreground">ppm</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{s.applied}L</p>
                      <p className="text-[8px] text-muted-foreground">Applied</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600">{s.nextDose}</p>
                      <p className="text-[8px] text-muted-foreground">Next Dose</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ ENERGY ═══════ */}
        {activeTab === "energy" && (
          <motion.div key="energy" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Solar Output */}
            <div className="bg-gradient-to-br from-violet-600 to-purple-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/70">Solar Output</p>
                  <p className="text-3xl font-bold">{energyData.solarOutput} kW</p>
                  <p className="text-[10px] text-white/50">of {energyData.solarCapacity} kW capacity</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">Avg Battery</p>
                  <p className="text-3xl font-bold">{energyData.batteryAvg}%</p>
                  <p className="text-[10px] text-white/50">Across all sensors</p>
                </div>
              </div>
              <div className="w-full bg-white/20 rounded-full h-2 mt-3">
                <div className="bg-white rounded-full h-2" style={{ width: `${(energyData.solarOutput / energyData.solarCapacity) * 100}%` }} />
              </div>
            </div>

            {/* Cost */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-violet-600">{energyData.dailyCost}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Daily Cost (AED)</p>
              </div>
              <div className="bg-card rounded-xl border border-border/40 p-3 text-center">
                <p className="text-lg font-bold text-violet-600">{energyData.monthlyCost}</p>
                <p className="text-[9px] text-muted-foreground font-medium">Monthly Cost (AED)</p>
              </div>
            </div>

            {/* Devices */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Energy Devices</h3>
            <div className="space-y-2">
              {energyData.devices.map((d) => (
                <div key={d.name} className="bg-card rounded-xl border border-border/40 p-3 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-violet-50 flex items-center justify-center">
                      <Zap className="w-4 h-4 text-violet-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{d.name}</p>
                      <p className="text-[9px] text-muted-foreground">
                        {d.output || d.consumption} · {d.runtime || `${d.efficiency}% eff.`}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
