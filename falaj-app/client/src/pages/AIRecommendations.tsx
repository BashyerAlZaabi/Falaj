/*
 * FALAJ AI Recommendations / Notifications Page
 * Design: Desert Minimalism — AI-generated tips with priority badges
 * Accessed via bell notification icon from Dashboard and Sensors & Map headers
 * Users can Accept or Reject each recommendation
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Link } from "wouter";
import {
  Brain, Droplets, Thermometer, Leaf, Bug, Clock,
  AlertTriangle, CheckCircle, Info, Zap, Bell,
  Check, X, Undo2, ThumbsUp, ThumbsDown, History
} from "lucide-react";
import { toast } from "sonner";

type RecStatus = "pending" | "accepted" | "rejected";

interface Recommendation {
  id: number;
  priority: string;
  title: string;
  description: string;
  category: string;
  icon: typeof Droplets;
  iconColor: string;
  iconBg: string;
  time: string;
  impact: string;
}

const initialRecommendations: Recommendation[] = [
  {
    id: 1,
    priority: "high",
    title: "Reduce Irrigation in Zone B",
    description: "Soil moisture in Zone B is 28%, which is below optimal. Increase irrigation by 20% for the next 3 days to prevent crop stress.",
    category: "Water Management",
    icon: Droplets,
    iconColor: "text-blue-500",
    iconBg: "bg-blue-50",
    time: "2 hours ago",
    impact: "Save 15% water",
  },
  {
    id: 2,
    priority: "high",
    title: "Heat Stress Alert — Zone E",
    description: "Temperature in Zone E has exceeded 38°C for 4 consecutive hours. Consider deploying shade nets or increasing misting frequency.",
    category: "Temperature",
    icon: Thermometer,
    iconColor: "text-red-500",
    iconBg: "bg-red-50",
    time: "1 hour ago",
    impact: "Prevent crop loss",
  },
  {
    id: 3,
    priority: "medium",
    title: "Nutrient Adjustment Needed",
    description: "Nitrogen levels in Zone A are slightly elevated. Reduce fertilizer application by 10% in the next cycle.",
    category: "Nutrients",
    icon: Leaf,
    iconColor: "text-green-500",
    iconBg: "bg-green-50",
    time: "4 hours ago",
    impact: "Optimize growth",
  },
  {
    id: 4,
    priority: "low",
    title: "Pest Prevention Reminder",
    description: "Based on current humidity levels (65%), conditions are favorable for fungal growth in Zone C. Schedule preventive spray.",
    category: "Pest Control",
    icon: Bug,
    iconColor: "text-purple-500",
    iconBg: "bg-purple-50",
    time: "6 hours ago",
    impact: "Early prevention",
  },
  {
    id: 5,
    priority: "medium",
    title: "Optimal Harvest Window",
    description: "Tomatoes in Zone A are approaching peak ripeness. Recommended harvest window is within the next 48-72 hours for best quality.",
    category: "Harvest",
    icon: Zap,
    iconColor: "text-orange-500",
    iconBg: "bg-orange-50",
    time: "8 hours ago",
    impact: "Max yield quality",
  },
];

const priorityConfig = {
  high: { label: "High", color: "bg-red-50 text-red-600", icon: AlertTriangle },
  medium: { label: "Medium", color: "bg-amber-50 text-amber-600", icon: Info },
  low: { label: "Low", color: "bg-green-50 text-green-600", icon: CheckCircle },
};

type FilterTab = "all" | "pending" | "accepted" | "rejected";

export default function AIRecommendations() {
  const [statuses, setStatuses] = useState<Record<number, RecStatus>>(
    Object.fromEntries(initialRecommendations.map(r => [r.id, "pending" as RecStatus]))
  );
  const [filter, setFilter] = useState<FilterTab>("all");

  const handleAccept = (rec: Recommendation) => {
    setStatuses(prev => ({ ...prev, [rec.id]: "accepted" }));
    toast.success(`Accepted: "${rec.title}"`, {
      description: "This recommendation will be applied to your farm operations.",
    });
  };

  const handleReject = (rec: Recommendation) => {
    setStatuses(prev => ({ ...prev, [rec.id]: "rejected" }));
    toast("Rejected: " + rec.title, {
      description: "You can undo this action anytime.",
    });
  };

  const handleUndo = (rec: Recommendation) => {
    setStatuses(prev => ({ ...prev, [rec.id]: "pending" }));
    toast.info(`Reset: "${rec.title}" back to pending`);
  };

  const counts = {
    all: initialRecommendations.length,
    pending: Object.values(statuses).filter(s => s === "pending").length,
    accepted: Object.values(statuses).filter(s => s === "accepted").length,
    rejected: Object.values(statuses).filter(s => s === "rejected").length,
  };

  const filteredRecs = initialRecommendations.filter(rec => {
    if (filter === "all") return true;
    return statuses[rec.id] === filter;
  });

  const filterTabs: { key: FilterTab; label: string; count: number }[] = [
    { key: "all", label: "All", count: counts.all },
    { key: "pending", label: "Pending", count: counts.pending },
    { key: "accepted", label: "Accepted", count: counts.accepted },
    { key: "rejected", label: "Rejected", count: counts.rejected },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader
        title="Notifications"
        rightAction={
          <Link href="/notification-history">
            <div className="p-2 rounded-xl bg-primary/10 hover:bg-primary/20 transition-colors">
              <History className="w-4 h-4 text-primary" />
            </div>
          </Link>
        }
      />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* AI Summary */}
        <div className="bg-gradient-to-br from-violet-50 to-indigo-50 rounded-2xl p-4 border border-violet-100 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Brain className="w-5 h-5 text-violet-600" />
            <h3 className="text-sm font-bold text-violet-900">AI Analysis Summary</h3>
          </div>
          <p className="text-xs text-violet-700 leading-relaxed">
            Based on the last 24 hours of sensor data, your farm is performing at 78% efficiency. 
            Addressing the high-priority recommendations below could improve this to 92%.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <div className="flex-1 bg-white/60 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-amber-500">{counts.pending}</p>
              <p className="text-[10px] text-muted-foreground">Pending</p>
            </div>
            <div className="flex-1 bg-white/60 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-green-500">{counts.accepted}</p>
              <p className="text-[10px] text-muted-foreground">Accepted</p>
            </div>
            <div className="flex-1 bg-white/60 rounded-xl p-2 text-center">
              <p className="text-lg font-bold text-red-400">{counts.rejected}</p>
              <p className="text-[10px] text-muted-foreground">Rejected</p>
            </div>
          </div>
        </div>

        {/* Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
          {filterTabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => setFilter(tab.key)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all duration-200 flex items-center gap-1.5 ${
                filter === tab.key
                  ? "bg-primary text-white shadow-md shadow-primary/20"
                  : "bg-card border border-border/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              {tab.label}
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                filter === tab.key ? "bg-white/20" : "bg-muted"
              }`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Recommendations */}
        <div className="space-y-3">
          <AnimatePresence mode="popLayout">
            {filteredRecs.length === 0 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="text-center py-12"
              >
                <div className="w-14 h-14 bg-muted rounded-full flex items-center justify-center mx-auto mb-3">
                  <Bell className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">No {filter} recommendations</p>
              </motion.div>
            )}
            {filteredRecs.map((rec, i) => {
              const Icon = rec.icon;
              const priority = priorityConfig[rec.priority as keyof typeof priorityConfig];
              const PriorityIcon = priority.icon;
              const status = statuses[rec.id];

              return (
                <motion.div
                  key={rec.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ delay: i * 0.04 }}
                  className={`bg-card rounded-2xl border p-4 transition-all duration-300 ${
                    status === "accepted"
                      ? "border-green-200 bg-green-50/30"
                      : status === "rejected"
                      ? "border-red-200 bg-red-50/20 opacity-70"
                      : "border-border/50 hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`p-2.5 rounded-xl ${rec.iconBg} shrink-0`}>
                      <Icon className={`w-5 h-5 ${rec.iconColor}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full flex items-center gap-1 ${priority.color}`}>
                          <PriorityIcon className="w-2.5 h-2.5" />
                          {priority.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{rec.category}</span>
                        {/* Status Badge */}
                        {status === "accepted" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 flex items-center gap-1">
                            <Check className="w-2.5 h-2.5" /> Accepted
                          </span>
                        )}
                        {status === "rejected" && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-red-100 text-red-600 flex items-center gap-1">
                            <X className="w-2.5 h-2.5" /> Rejected
                          </span>
                        )}
                      </div>
                      <h4 className="text-sm font-bold mb-1">{rec.title}</h4>
                      <p className="text-xs text-muted-foreground leading-relaxed">{rec.description}</p>
                      <div className="flex items-center justify-between mt-2">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          <Clock className="w-3 h-3" />
                          {rec.time}
                        </div>
                        <span className="text-[10px] font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                          {rec.impact}
                        </span>
                      </div>

                      {/* Action Buttons */}
                      <div className="mt-3 pt-3 border-t border-border/30">
                        {status === "pending" ? (
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleAccept(rec)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-green-500 hover:bg-green-600 text-white rounded-xl text-xs font-semibold transition-all duration-200 shadow-sm shadow-green-500/20 active:scale-[0.97]"
                            >
                              <ThumbsUp className="w-3.5 h-3.5" />
                              Accept
                            </button>
                            <button
                              onClick={() => handleReject(rec)}
                              className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 bg-red-500 hover:bg-red-600 text-white rounded-xl text-xs font-semibold transition-all duration-200 shadow-sm shadow-red-500/20 active:scale-[0.97]"
                            >
                              <ThumbsDown className="w-3.5 h-3.5" />
                              Reject
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center justify-between">
                            <p className={`text-xs font-medium ${
                              status === "accepted" ? "text-green-600" : "text-red-500"
                            }`}>
                              {status === "accepted"
                                ? "Applied to farm operations"
                                : "Dismissed — will not be applied"}
                            </p>
                            <button
                              onClick={() => handleUndo(rec)}
                              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1 rounded-lg hover:bg-muted"
                            >
                              <Undo2 className="w-3 h-3" />
                              Undo
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
