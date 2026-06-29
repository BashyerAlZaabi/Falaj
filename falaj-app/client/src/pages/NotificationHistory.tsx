/*
 * FALAJ Notification History
 * Archive of past AI recommendations and system notifications
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { useState } from "react";
import {
  Check, X, Clock, Leaf, Droplets, Thermometer,
  Wind, AlertTriangle, Calendar, Filter
} from "lucide-react";

type HistoryFilter = "all" | "accepted" | "rejected" | "expired";

interface HistoryItem {
  id: number;
  title: string;
  description: string;
  status: "accepted" | "rejected" | "expired";
  date: string;
  category: string;
  icon: typeof Leaf;
  impact: string;
}

const historyItems: HistoryItem[] = [
  {
    id: 1, title: "Reduce Irrigation Zone B by 20%",
    description: "Soil moisture levels were above optimal. Reduced irrigation saved 450L water.",
    status: "accepted", date: "Mar 8, 2026", category: "Water", icon: Droplets,
    impact: "Saved 450L water",
  },
  {
    id: 2, title: "Apply Nitrogen Fertilizer Zone A",
    description: "Nitrogen levels were below threshold. Applied 5kg NPK fertilizer.",
    status: "accepted", date: "Mar 7, 2026", category: "Nutrients", icon: Leaf,
    impact: "Yield +12%",
  },
  {
    id: 3, title: "Heat Stress Alert Zone E",
    description: "Temperature exceeded 45°C. Recommended shade deployment.",
    status: "rejected", date: "Mar 6, 2026", category: "Temperature", icon: Thermometer,
    impact: "No action taken",
  },
  {
    id: 4, title: "Increase Ventilation Greenhouse 2",
    description: "Humidity reached 85%. Ventilation fans recommended.",
    status: "expired", date: "Mar 5, 2026", category: "Humidity", icon: Wind,
    impact: "Expired — auto-resolved",
  },
  {
    id: 5, title: "Pest Detection Zone C",
    description: "AI detected early signs of aphid infestation on tomato plants.",
    status: "accepted", date: "Mar 4, 2026", category: "Pest Control", icon: AlertTriangle,
    impact: "Prevented crop loss",
  },
  {
    id: 6, title: "Optimize Drip Schedule Zone D",
    description: "Weather forecast shows rain. Recommended pausing irrigation for 48h.",
    status: "accepted", date: "Mar 3, 2026", category: "Water", icon: Droplets,
    impact: "Saved 800L water",
  },
  {
    id: 7, title: "Soil pH Adjustment Zone A",
    description: "pH dropped to 5.8. Recommended lime application.",
    status: "rejected", date: "Mar 2, 2026", category: "Soil", icon: Leaf,
    impact: "Farmer chose alternative",
  },
  {
    id: 8, title: "Harvest Window Alert — Dates",
    description: "Optimal harvest window for Khalas dates in Zone F.",
    status: "accepted", date: "Mar 1, 2026", category: "Harvest", icon: Calendar,
    impact: "Harvested at peak quality",
  },
];

export default function NotificationHistory() {
  const [filter, setFilter] = useState<HistoryFilter>("all");

  const filtered = filter === "all" ? historyItems : historyItems.filter(h => h.status === filter);

  const statusConfig = {
    accepted: { label: "Accepted", icon: Check, color: "text-green-600 bg-green-50", border: "border-green-200" },
    rejected: { label: "Rejected", icon: X, color: "text-red-500 bg-red-50", border: "border-red-200" },
    expired: { label: "Expired", icon: Clock, color: "text-slate-500 bg-slate-50", border: "border-slate-200" },
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Notification History" />

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Summary */}
        <div className="flex gap-2.5 mb-4">
          <div className="flex-1 bg-green-50 rounded-xl p-3 text-center border border-green-100">
            <p className="text-lg font-bold text-green-700">{historyItems.filter(h => h.status === "accepted").length}</p>
            <p className="text-[10px] text-green-600 font-medium">Applied</p>
          </div>
          <div className="flex-1 bg-red-50 rounded-xl p-3 text-center border border-red-100">
            <p className="text-lg font-bold text-red-600">{historyItems.filter(h => h.status === "rejected").length}</p>
            <p className="text-[10px] text-red-500 font-medium">Dismissed</p>
          </div>
          <div className="flex-1 bg-slate-50 rounded-xl p-3 text-center border border-slate-100">
            <p className="text-lg font-bold text-slate-600">{historyItems.filter(h => h.status === "expired").length}</p>
            <p className="text-[10px] text-slate-500 font-medium">Expired</p>
          </div>
        </div>

        {/* Filter */}
        <div className="flex gap-2 mb-4 overflow-x-auto">
          {(["all", "accepted", "rejected", "expired"] as HistoryFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`shrink-0 px-4 py-2 rounded-full text-xs font-semibold transition-all ${
                filter === f ? "bg-primary text-white" : "bg-muted text-muted-foreground hover:bg-muted/80"
              }`}
            >
              {f === "all" ? "All" : f.charAt(0).toUpperCase() + f.slice(1)} ({f === "all" ? historyItems.length : historyItems.filter(h => h.status === f).length})
            </button>
          ))}
        </div>

        {/* History Items */}
        <div className="space-y-2.5">
          {filtered.map((item, i) => {
            const Icon = item.icon;
            const status = statusConfig[item.status];
            const StatusIcon = status.icon;
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
                className={`bg-card rounded-2xl border ${status.border} p-4`}
              >
                <div className="flex items-start gap-3">
                  <div className={`p-2 rounded-xl ${status.color} shrink-0`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <h4 className="text-sm font-semibold">{item.title}</h4>
                      <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${status.color} shrink-0`}>
                        <StatusIcon className="w-2.5 h-2.5" />
                        <span className="text-[9px] font-bold">{status.label}</span>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground leading-relaxed mb-2">{item.description}</p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">{item.date}</span>
                      <span className="text-[10px] font-medium text-primary">{item.impact}</span>
                    </div>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
