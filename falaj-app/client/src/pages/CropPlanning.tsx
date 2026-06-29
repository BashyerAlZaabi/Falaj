/**
 * FALAJ Crop Planning & Management
 * Auto crop planning, growth management, productivity prediction, cost/pricing analysis
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import {
  Sprout, Calendar, TrendingUp, DollarSign,
  Leaf, Sun, Droplets, Thermometer, Clock,
  CheckCircle2, AlertTriangle, ArrowRight,
  BarChart3, Target, Package, Truck, Scissors,
  ChevronRight, Sparkles, Brain, Gauge
} from "lucide-react";

type PlanTab = "planning" | "management" | "prediction" | "pricing";

/* ─── Auto Crop Plan ─── */
const autoPlan = {
  season: "Spring 2026",
  generatedBy: "FALAJ AI Engine",
  confidence: 94,
  zones: [
    {
      zone: "A", recommendedCrop: "Tomatoes", reason: "Optimal soil pH (6.5), high nitrogen, adequate sunlight (10.2h/day)",
      plantDate: "Mar 15", harvestDate: "Jun 20", expectedYield: "2,400 kg",
      waterNeeded: "500 L/day", fertilizerCost: "AED 85/month", suitability: 96
    },
    {
      zone: "B", recommendedCrop: "Cucumbers", reason: "Good moisture retention, partial shade suits cucumbers, calcium-rich soil",
      plantDate: "Mar 20", harvestDate: "May 30", expectedYield: "1,800 kg",
      waterNeeded: "350 L/day", fertilizerCost: "AED 65/month", suitability: 91
    },
    {
      zone: "C", recommendedCrop: "Lettuce", reason: "Low salinity, high organic matter, cooler microclimate from shade structures",
      plantDate: "Mar 10", harvestDate: "Apr 25", expectedYield: "900 kg",
      waterNeeded: "300 L/day", fertilizerCost: "AED 45/month", suitability: 88
    },
    {
      zone: "D", recommendedCrop: "Herbs (Basil, Mint)", reason: "Moderate sunlight, well-drained soil, low water requirement",
      plantDate: "Mar 12", harvestDate: "Continuous", expectedYield: "120 kg/month",
      waterNeeded: "200 L/day", fertilizerCost: "AED 30/month", suitability: 93
    },
    {
      zone: "E", recommendedCrop: "Date Palms", reason: "High salinity tolerance, deep root system, full sun exposure (11.5h/day)",
      plantDate: "Established", harvestDate: "Aug-Oct", expectedYield: "3,200 kg",
      waterNeeded: "600 L/day", fertilizerCost: "AED 120/month", suitability: 97
    },
  ],
};

/* ─── Crop Management ─── */
const cropManagement = [
  {
    zone: "A", crop: "Tomatoes", stage: "Flowering", progress: 55, daysPlanted: 42, daysToHarvest: 55,
    health: 92, tasks: [
      { task: "Apply calcium spray", due: "Today", priority: "high" },
      { task: "Prune lower branches", due: "Tomorrow", priority: "medium" },
      { task: "Check for aphids", due: "In 2 days", priority: "low" },
    ]
  },
  {
    zone: "B", crop: "Cucumbers", stage: "Vegetative Growth", progress: 35, daysPlanted: 28, daysToHarvest: 42,
    health: 87, tasks: [
      { task: "Increase irrigation by 10%", due: "Today", priority: "high" },
      { task: "Install trellis support", due: "This week", priority: "medium" },
    ]
  },
  {
    zone: "C", crop: "Lettuce", stage: "Head Formation", progress: 72, daysPlanted: 32, daysToHarvest: 13,
    health: 95, tasks: [
      { task: "Reduce nitrogen fertilizer", due: "Today", priority: "medium" },
    ]
  },
  {
    zone: "D", crop: "Herbs", stage: "Harvesting", progress: 100, daysPlanted: 60, daysToHarvest: 0,
    health: 90, tasks: [
      { task: "Harvest basil (ready)", due: "Today", priority: "high" },
      { task: "Replant mint cuttings", due: "This week", priority: "medium" },
    ]
  },
  {
    zone: "E", crop: "Date Palms", stage: "Fruit Development", progress: 40, daysPlanted: 0, daysToHarvest: 150,
    health: 88, tasks: [
      { task: "Apply potassium sulfate", due: "Overdue", priority: "high" },
      { task: "Thin fruit clusters", due: "This week", priority: "medium" },
    ]
  },
];

/* ─── Productivity Prediction ─── */
const predictions = [
  { crop: "Tomatoes", zone: "A", currentYield: 1200, predictedTotal: 2400, confidence: 92, trend: "up", marketPrice: 4.5, revenue: 10800 },
  { crop: "Cucumbers", zone: "B", currentYield: 600, predictedTotal: 1800, confidence: 88, trend: "up", marketPrice: 3.2, revenue: 5760 },
  { crop: "Lettuce", zone: "C", currentYield: 720, predictedTotal: 900, confidence: 95, trend: "stable", marketPrice: 6.0, revenue: 5400 },
  { crop: "Herbs", zone: "D", currentYield: 240, predictedTotal: 480, confidence: 85, trend: "up", marketPrice: 25.0, revenue: 12000 },
  { crop: "Date Palms", zone: "E", currentYield: 0, predictedTotal: 3200, confidence: 78, trend: "stable", marketPrice: 12.0, revenue: 38400 },
];

/* ─── Cost & Pricing ─── */
const costBreakdown = {
  totalMonthlyCost: 4850,
  totalMonthlyRevenue: 12060,
  profitMargin: 59.8,
  items: [
    { category: "Seeds & Seedlings", monthly: 420, annual: 5040, percentage: 8.7 },
    { category: "Water (Irrigation)", monthly: 580, annual: 6960, percentage: 12.0 },
    { category: "Fertilizer & Nutrients", monthly: 345, annual: 4140, percentage: 7.1 },
    { category: "Energy (Solar + Grid)", monthly: 375, annual: 4500, percentage: 7.7 },
    { category: "Labor", monthly: 2200, annual: 26400, percentage: 45.4 },
    { category: "Packaging", monthly: 350, annual: 4200, percentage: 7.2 },
    { category: "Transport & Logistics", monthly: 280, annual: 3360, percentage: 5.8 },
    { category: "Maintenance & Repairs", monthly: 180, annual: 2160, percentage: 3.7 },
    { category: "Licensing & Compliance", monthly: 120, annual: 1440, percentage: 2.5 },
  ],
  cropPricing: [
    { crop: "Tomatoes", costPerKg: 2.1, marketPrice: 4.5, margin: 53.3, demand: "High" },
    { crop: "Cucumbers", costPerKg: 1.8, marketPrice: 3.2, margin: 43.8, demand: "Medium" },
    { crop: "Lettuce", costPerKg: 3.2, marketPrice: 6.0, margin: 46.7, demand: "High" },
    { crop: "Herbs", costPerKg: 12.0, marketPrice: 25.0, margin: 52.0, demand: "Very High" },
    { crop: "Dates", costPerKg: 5.5, marketPrice: 12.0, margin: 54.2, demand: "High" },
  ],
};

export default function CropPlanning() {
  const [activeTab, setActiveTab] = useState<PlanTab>("planning");
  const [expandedZone, setExpandedZone] = useState<string | null>(null);
  const { zoneThresholds, applyThresholdsFromCropPlan, addXP, addNotification } = useAppState();

  const handleApplyPlan = () => {
    // Map zone letters to zone names
    const zoneMap: Record<string, string> = { "A": "Zone A", "B": "Zone B", "C": "Zone C", "D": "Zone D" };
    autoPlan.zones.forEach(z => {
      const zoneName = zoneMap[z.zone];
      if (zoneName) {
        applyThresholdsFromCropPlan(zoneName, z.recommendedCrop, "spring", "Planting");
      }
    });
    addXP(150);
    toast.success("AI Crop Plan Applied", { description: "Sensor & valve thresholds auto-adjusted for all zones. +150 XP" });
  };

  const handleApplyZonePlan = (zone: string, crop: string) => {
    const zoneName = `Zone ${zone}`;
    applyThresholdsFromCropPlan(zoneName, crop, "spring", "Planting");
    addXP(30);
    toast.success(`Zone ${zone} Updated`, { description: `Thresholds adjusted for ${crop}. +30 XP` });
  };

  const tabs: { key: PlanTab; label: string; icon: React.ReactNode }[] = [
    { key: "planning", label: "AI Planning", icon: <Brain className="w-3.5 h-3.5" /> },
    { key: "management", label: "Manage", icon: <Sprout className="w-3.5 h-3.5" /> },
    { key: "prediction", label: "Predict", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: "pricing", label: "Cost & Price", icon: <DollarSign className="w-3.5 h-3.5" /> },
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
              <Sprout className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Crop Planning</span>
            </div>
            <div className="flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-700">AI Powered</span>
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

      <AnimatePresence mode="wait">
        {/* ═══════ AI CROP PLANNING ═══════ */}
        {activeTab === "planning" && (
          <motion.div key="planning" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* AI Banner */}
            <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <Brain className="w-5 h-5" />
                  <span className="text-xs font-medium text-white/70">AI-Generated Crop Plan</span>
                </div>
                <p className="text-xl font-bold mb-1">{autoPlan.season}</p>
                <p className="text-[10px] text-white/60">Generated by {autoPlan.generatedBy} · {autoPlan.confidence}% confidence</p>
                <p className="text-[10px] text-white/50 mt-1">Based on soil analysis, weather forecast, water availability, and market demand</p>
              </div>
            </div>

            {/* Zone Recommendations */}
            <div className="space-y-2">
              {autoPlan.zones.map((z) => (
                <div key={z.zone} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                  <button
                    onClick={() => setExpandedZone(expandedZone === z.zone ? null : z.zone)}
                    className="w-full p-3 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <span className="text-sm font-bold text-emerald-700">{z.zone}</span>
                      </div>
                      <div className="text-left">
                        <p className="text-sm font-semibold">{z.recommendedCrop}</p>
                        <p className="text-[9px] text-muted-foreground">Suitability: {z.suitability}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${z.suitability}%` }} />
                      </div>
                      <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${expandedZone === z.zone ? "rotate-90" : ""}`} />
                    </div>
                  </button>
                  {expandedZone === z.zone && (
                    <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="px-3 pb-3 border-t border-border/20">
                      <p className="text-[10px] text-muted-foreground mt-2 mb-3 italic">"{z.reason}"</p>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="text-[8px] text-muted-foreground">Plant Date</p>
                          <p className="text-[10px] font-bold">{z.plantDate}</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="text-[8px] text-muted-foreground">Harvest Date</p>
                          <p className="text-[10px] font-bold">{z.harvestDate}</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="text-[8px] text-muted-foreground">Expected Yield</p>
                          <p className="text-[10px] font-bold text-emerald-600">{z.expectedYield}</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <p className="text-[8px] text-muted-foreground">Water Needed</p>
                          <p className="text-[10px] font-bold text-blue-600">{z.waterNeeded}</p>
                        </div>
                      </div>
                      <button onClick={() => handleApplyZonePlan(z.zone, z.recommendedCrop)} className="mt-2 w-full py-2 rounded-lg bg-emerald-50 text-emerald-700 text-[10px] font-semibold hover:bg-emerald-100 transition-colors active:scale-[0.98]">
                        Apply to Zone {z.zone} Sensors & Valves
                      </button>
                    </motion.div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={handleApplyPlan} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-md active:scale-[0.98] transition-transform">
              Apply AI Plan to All Zones
            </button>
            <p className="text-[9px] text-muted-foreground text-center mt-2">This will auto-adjust sensor thresholds, valve schedules, and fertilizer doses for each zone</p>
          </motion.div>
        )}

        {/* ═══════ CROP MANAGEMENT ═══════ */}
        {activeTab === "management" && (
          <motion.div key="management" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            <div className="space-y-3">
              {cropManagement.map((c) => (
                <div key={c.zone} className="bg-card rounded-xl border border-border/40 p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Sprout className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-semibold">{c.crop}</p>
                        <p className="text-[10px] text-muted-foreground">Zone {c.zone} · {c.stage}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${c.health >= 90 ? "text-emerald-600" : c.health >= 80 ? "text-amber-600" : "text-red-600"}`}>
                        {c.health}%
                      </p>
                      <p className="text-[8px] text-muted-foreground">Health</p>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mb-3">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[9px] text-muted-foreground">Growth Progress</span>
                      <span className="text-[9px] font-semibold">{c.progress}%</span>
                    </div>
                    <div className="w-full bg-muted rounded-full h-2">
                      <div className="bg-gradient-to-r from-emerald-500 to-green-500 rounded-full h-2 transition-all" style={{ width: `${c.progress}%` }} />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[8px] text-muted-foreground">{c.daysPlanted}d planted</span>
                      <span className="text-[8px] text-muted-foreground">{c.daysToHarvest > 0 ? `${c.daysToHarvest}d to harvest` : "Ready to harvest"}</span>
                    </div>
                  </div>

                  {/* Tasks */}
                  <div className="space-y-1.5">
                    {c.tasks.map((t, i) => (
                      <div key={i} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${
                        t.priority === "high" ? "bg-red-50" : t.priority === "medium" ? "bg-amber-50" : "bg-muted/30"
                      }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${
                          t.priority === "high" ? "bg-red-500" : t.priority === "medium" ? "bg-amber-500" : "bg-slate-400"
                        }`} />
                        <span className="text-[10px] flex-1">{t.task}</span>
                        <span className="text-[9px] text-muted-foreground font-medium">{t.due}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ PRODUCTIVITY PREDICTION ═══════ */}
        {activeTab === "prediction" && (
          <motion.div key="prediction" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Total Forecast */}
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10 grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-white/70">Total Predicted Yield</p>
                  <p className="text-3xl font-bold">{predictions.reduce((a, p) => a + p.predictedTotal, 0).toLocaleString()}</p>
                  <p className="text-[10px] text-white/50">kg this season</p>
                </div>
                <div>
                  <p className="text-xs text-white/70">Projected Revenue</p>
                  <p className="text-3xl font-bold">{(predictions.reduce((a, p) => a + p.revenue, 0) / 1000).toFixed(1)}K</p>
                  <p className="text-[10px] text-white/50">AED</p>
                </div>
              </div>
            </div>

            {/* Per Crop */}
            <div className="space-y-2">
              {predictions.map((p) => (
                <div key={p.crop} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Target className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{p.crop}</p>
                        <p className="text-[9px] text-muted-foreground">Zone {p.zone} · {p.confidence}% confidence</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <TrendingUp className={`w-3.5 h-3.5 ${p.trend === "up" ? "text-emerald-500" : "text-blue-500"}`} />
                      <span className="text-[9px] font-semibold text-emerald-600">{p.trend}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{p.currentYield.toLocaleString()}</p>
                      <p className="text-[7px] text-muted-foreground">Current (kg)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-blue-600">{p.predictedTotal.toLocaleString()}</p>
                      <p className="text-[7px] text-muted-foreground">Predicted (kg)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{p.marketPrice}</p>
                      <p className="text-[7px] text-muted-foreground">AED/kg</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600">{(p.revenue / 1000).toFixed(1)}K</p>
                      <p className="text-[7px] text-muted-foreground">Revenue</p>
                    </div>
                  </div>
                  {/* Progress to predicted */}
                  <div className="mt-2">
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className="bg-blue-500 rounded-full h-1.5" style={{ width: `${(p.currentYield / p.predictedTotal) * 100}%` }} />
                    </div>
                    <p className="text-[8px] text-muted-foreground mt-0.5 text-right">{((p.currentYield / p.predictedTotal) * 100).toFixed(0)}% of predicted yield</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ COST & PRICING ═══════ */}
        {activeTab === "pricing" && (
          <motion.div key="pricing" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Profit Summary */}
            <div className="bg-gradient-to-br from-emerald-600 to-teal-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <div className="grid grid-cols-3 gap-3 mb-3">
                  <div>
                    <p className="text-[10px] text-white/70">Monthly Cost</p>
                    <p className="text-xl font-bold">{costBreakdown.totalMonthlyCost.toLocaleString()}</p>
                    <p className="text-[9px] text-white/50">AED</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/70">Monthly Revenue</p>
                    <p className="text-xl font-bold">{costBreakdown.totalMonthlyRevenue.toLocaleString()}</p>
                    <p className="text-[9px] text-white/50">AED</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-white/70">Profit Margin</p>
                    <p className="text-xl font-bold">{costBreakdown.profitMargin}%</p>
                    <p className="text-[9px] text-white/50">Net</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Cost Breakdown */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Monthly Cost Breakdown</h3>
            <div className="bg-card rounded-xl border border-border/40 p-3 mb-4">
              {costBreakdown.items.map((item) => (
                <div key={item.category} className="flex items-center justify-between py-2 border-b border-border/10 last:border-0">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-emerald-500" style={{ opacity: 0.3 + item.percentage / 100 }} />
                    <span className="text-[10px]">{item.category}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-bold">{item.monthly} AED</span>
                    <span className="text-[9px] text-muted-foreground w-10 text-right">{item.percentage}%</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Crop Pricing */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Crop Pricing Analysis</h3>
            <div className="space-y-2">
              {costBreakdown.cropPricing.map((cp) => (
                <div key={cp.crop} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold">{cp.crop}</p>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${
                      cp.demand === "Very High" ? "bg-emerald-50 text-emerald-700" :
                      cp.demand === "High" ? "bg-blue-50 text-blue-700" :
                      "bg-amber-50 text-amber-700"
                    }`}>{cp.demand} Demand</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-red-600">{cp.costPerKg}</p>
                      <p className="text-[7px] text-muted-foreground">Cost/kg (AED)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-blue-600">{cp.marketPrice}</p>
                      <p className="text-[7px] text-muted-foreground">Market/kg (AED)</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600">{cp.margin}%</p>
                      <p className="text-[7px] text-muted-foreground">Margin</p>
                    </div>
                  </div>
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
