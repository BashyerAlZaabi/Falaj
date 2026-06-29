/**
 * FALAJ Supply Chain Notifications
 * Real-time demand alerts when buyers post urgent demand matching your crops
 * Push notification management, alert preferences, demand matching alerts
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useEffect } from "react";
import {
  Bell, BellRing, Filter, Check, CheckCheck,
  Hotel, Heart, Plane, ShoppingBag, Landmark,
  AlertTriangle, Clock, TrendingUp, Zap,
  ChevronRight, Settings, Trash2, Eye,
  Volume2, VolumeX, Star, Package,
  ArrowRight, X, Sparkles
} from "lucide-react";
import { toast } from "sonner";

type NotifTab = "all" | "urgent" | "matches" | "settings";

interface Notification {
  id: number;
  type: "demand" | "match" | "price" | "contract" | "delivery";
  urgency: "urgent" | "high" | "medium" | "low";
  title: string;
  message: string;
  buyer: string;
  buyerType: "hotel" | "hospital" | "government" | "airline" | "company";
  crop: string;
  quantity: string;
  price: string;
  matchScore: number;
  time: string;
  read: boolean;
  actionTaken: boolean;
}

const iconMap = {
  hotel: Hotel,
  hospital: Heart,
  government: Landmark,
  airline: Plane,
  company: ShoppingBag,
};

const colorMap = {
  hotel: { text: "text-blue-600", bg: "bg-blue-50", border: "border-blue-200" },
  hospital: { text: "text-red-600", bg: "bg-red-50", border: "border-red-200" },
  government: { text: "text-slate-700", bg: "bg-slate-100", border: "border-slate-200" },
  airline: { text: "text-sky-600", bg: "bg-sky-50", border: "border-sky-200" },
  company: { text: "text-purple-600", bg: "bg-purple-50", border: "border-purple-200" },
};

const initialNotifications: Notification[] = [
  {
    id: 1, type: "demand", urgency: "urgent",
    title: "Urgent: Organic Tomatoes Needed",
    message: "Jumeirah Group needs 500 kg organic tomatoes by March 15. Your farm can supply this — 96% match.",
    buyer: "Jumeirah Group", buyerType: "hotel", crop: "Tomatoes",
    quantity: "500 kg", price: "AED 5.5/kg", matchScore: 96,
    time: "2 min ago", read: false, actionTaken: false,
  },
  {
    id: 2, type: "match", urgency: "high",
    title: "New Match: Lettuce Supply",
    message: "Cleveland Clinic Abu Dhabi posted demand for 200 kg/week organic lettuce. Your Zone C lettuce is a perfect match.",
    buyer: "Cleveland Clinic", buyerType: "hospital", crop: "Lettuce",
    quantity: "200 kg/week", price: "AED 7/kg", matchScore: 92,
    time: "15 min ago", read: false, actionTaken: false,
  },
  {
    id: 3, type: "price", urgency: "medium",
    title: "Price Alert: Herbs Market Surge",
    message: "Fresh herb prices increased 18% this week. Etihad Catering is offering AED 35/kg for basil — above your target price.",
    buyer: "Etihad Airways Catering", buyerType: "airline", crop: "Herbs",
    quantity: "30 kg/week", price: "AED 35/kg", matchScore: 88,
    time: "1 hour ago", read: false, actionTaken: false,
  },
  {
    id: 4, type: "demand", urgency: "urgent",
    title: "Bulk Order: Premium Dates",
    message: "Abu Dhabi Agriculture Authority requires 2,000 kg Khalas dates for government food program. Seasonal contract available.",
    buyer: "ADAA", buyerType: "government", crop: "Dates",
    quantity: "2,000 kg", price: "AED 14/kg", matchScore: 97,
    time: "2 hours ago", read: true, actionTaken: false,
  },
  {
    id: 5, type: "contract", urgency: "medium",
    title: "Contract Renewal: Lulu Hypermarket",
    message: "Your herbs supply contract with Lulu Hypermarket expires in 30 days. They want to renew at AED 22/kg with 10% volume increase.",
    buyer: "Lulu Hypermarket", buyerType: "company", crop: "Herbs",
    quantity: "220 kg/week", price: "AED 22/kg", matchScore: 85,
    time: "3 hours ago", read: true, actionTaken: false,
  },
  {
    id: 6, type: "demand", urgency: "high",
    title: "Emirates Catering: Salad Mix",
    message: "Emirates Flight Catering needs 500 kg premium salad mix weekly. Your lettuce and herbs can partially fulfill this order.",
    buyer: "Emirates Flight Catering", buyerType: "airline", crop: "Lettuce",
    quantity: "500 kg/week", price: "AED 8/kg", matchScore: 68,
    time: "4 hours ago", read: true, actionTaken: true,
  },
  {
    id: 7, type: "delivery", urgency: "low",
    title: "Delivery Confirmed: Jumeirah",
    message: "Your 500 kg tomato delivery to Jumeirah Group was received and rated 4.9/5. Payment of AED 2,750 processed.",
    buyer: "Jumeirah Group", buyerType: "hotel", crop: "Tomatoes",
    quantity: "500 kg", price: "AED 2,750", matchScore: 100,
    time: "Yesterday", read: true, actionTaken: true,
  },
  {
    id: 8, type: "match", urgency: "medium",
    title: "New Buyer: Rotana Hotels",
    message: "Rotana Hotels Group joined FALAJ and posted demand for cucumbers and tomatoes. Your farm is in their preferred supplier zone.",
    buyer: "Rotana Hotels", buyerType: "hotel", crop: "Cucumbers",
    quantity: "300 kg/week", price: "AED 4.2/kg", matchScore: 78,
    time: "Yesterday", read: true, actionTaken: false,
  },
];

const alertPreferences = [
  { crop: "Tomatoes", enabled: true, minPrice: 4.0, urgentOnly: false },
  { crop: "Cucumbers", enabled: true, minPrice: 3.0, urgentOnly: false },
  { crop: "Lettuce", enabled: true, minPrice: 5.0, urgentOnly: false },
  { crop: "Herbs", enabled: true, minPrice: 20.0, urgentOnly: true },
  { crop: "Dates", enabled: true, minPrice: 10.0, urgentOnly: false },
];

export default function SupplyNotifications() {
  const [activeTab, setActiveTab] = useState<NotifTab>("all");
  const [notifications, setNotifications] = useState(initialNotifications);
  const [preferences, setPreferences] = useState(alertPreferences);
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Simulate new notification arriving
  useEffect(() => {
    const timer = setTimeout(() => {
      toast("New demand alert: Marriott Hotels needs 400 kg cucumbers", {
        icon: <BellRing className="w-4 h-4 text-emerald-600" />,
        action: { label: "View", onClick: () => setActiveTab("urgent") },
      });
    }, 8000);
    return () => clearTimeout(timer);
  }, []);

  const unreadCount = notifications.filter(n => !n.read).length;
  const urgentCount = notifications.filter(n => n.urgency === "urgent" || n.urgency === "high").length;

  const markAsRead = (id: number) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  };

  const markAllRead = () => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    toast.success("All notifications marked as read");
  };

  const filteredNotifications = notifications.filter(n => {
    if (activeTab === "urgent") return n.urgency === "urgent" || n.urgency === "high";
    if (activeTab === "matches") return n.type === "match" || n.type === "demand";
    return true;
  });

  const tabs: { key: NotifTab; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: "all", label: "All", icon: <Bell className="w-3.5 h-3.5" />, count: unreadCount },
    { key: "urgent", label: "Urgent", icon: <Zap className="w-3.5 h-3.5" />, count: urgentCount },
    { key: "matches", label: "Matches", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: "settings", label: "Alerts", icon: <Settings className="w-3.5 h-3.5" /> },
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
              <BellRing className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Supply Alerts</span>
            </div>
            <div className="flex items-center gap-2">
              {unreadCount > 0 && (
                <button onClick={markAllRead} className="text-[10px] font-semibold text-emerald-600 hover:text-emerald-700">
                  Mark all read
                </button>
              )}
              <div className="flex items-center gap-1 bg-red-50 px-2.5 py-1 rounded-full">
                <Bell className="w-3.5 h-3.5 text-red-500" />
                <span className="text-[10px] font-bold text-red-700">{unreadCount} new</span>
              </div>
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
                {tab.count !== undefined && tab.count > 0 && (
                  <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                    activeTab === tab.key ? "bg-white/20 text-white" : "bg-red-100 text-red-700"
                  }`}>{tab.count}</span>
                )}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* ═══════ NOTIFICATION LIST ═══════ */}
        {activeTab !== "settings" && (
          <motion.div key={activeTab} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {filteredNotifications.length === 0 ? (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No notifications</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filteredNotifications.map((n) => {
                  const Icon = iconMap[n.buyerType];
                  const colors = colorMap[n.buyerType];
                  const isExpanded = expandedId === n.id;

                  return (
                    <motion.div
                      key={n.id}
                      layout
                      className={`rounded-xl border overflow-hidden transition-all ${
                        !n.read ? "bg-emerald-50/30 border-emerald-200/50" : "bg-card border-border/40"
                      }`}
                    >
                      <button
                        onClick={() => { setExpandedId(isExpanded ? null : n.id); markAsRead(n.id); }}
                        className="w-full p-3 text-left"
                      >
                        <div className="flex items-start gap-2.5">
                          <div className={`w-10 h-10 rounded-xl ${colors.bg} flex items-center justify-center shrink-0 mt-0.5`}>
                            <Icon className={`w-5 h-5 ${colors.text}`} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5">
                              {!n.read && <div className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />}
                              <span className={`text-[8px] font-bold uppercase px-1.5 py-0.5 rounded-full ${
                                n.urgency === "urgent" ? "bg-red-100 text-red-700" :
                                n.urgency === "high" ? "bg-amber-100 text-amber-700" :
                                n.urgency === "medium" ? "bg-blue-100 text-blue-700" :
                                "bg-slate-100 text-slate-600"
                              }`}>{n.urgency}</span>
                              <span className="text-[9px] text-muted-foreground ml-auto">{n.time}</span>
                            </div>
                            <p className="text-xs font-semibold leading-tight mb-0.5">{n.title}</p>
                            <p className="text-[10px] text-muted-foreground line-clamp-2">{n.message}</p>
                          </div>
                          <ChevronRight className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                        </div>
                      </button>

                      {isExpanded && (
                        <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} className="px-3 pb-3 border-t border-border/20">
                          <div className="grid grid-cols-4 gap-1.5 mt-2 mb-3">
                            <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                              <p className="text-[10px] font-bold">{n.crop}</p>
                              <p className="text-[7px] text-muted-foreground">Crop</p>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                              <p className="text-[10px] font-bold">{n.quantity}</p>
                              <p className="text-[7px] text-muted-foreground">Quantity</p>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                              <p className="text-[10px] font-bold text-emerald-600">{n.price}</p>
                              <p className="text-[7px] text-muted-foreground">Price</p>
                            </div>
                            <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                              <p className="text-[10px] font-bold text-blue-600">{n.matchScore}%</p>
                              <p className="text-[7px] text-muted-foreground">Match</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 mb-2">
                            <p className="text-[10px] text-muted-foreground">From: <span className="font-semibold text-foreground">{n.buyer}</span></p>
                          </div>
                          {!n.actionTaken ? (
                            <div className="flex gap-2">
                              <button
                                onClick={() => {
                                  setNotifications(prev => prev.map(x => x.id === n.id ? { ...x, actionTaken: true } : x));
                                  toast.success(`Supply offer sent to ${n.buyer}`);
                                }}
                                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-[10px] font-semibold hover:bg-emerald-700 transition-colors"
                              >
                                Send Supply Offer
                              </button>
                              <button
                                onClick={() => setExpandedId(null)}
                                className="px-4 py-2 rounded-lg border border-border text-[10px] font-semibold hover:bg-muted transition-colors"
                              >
                                Dismiss
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 text-emerald-600 bg-emerald-50 rounded-lg px-3 py-2">
                              <CheckCheck className="w-4 h-4" />
                              <span className="text-[10px] font-semibold">Action taken</span>
                            </div>
                          )}
                        </motion.div>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════ ALERT SETTINGS ═══════ */}
        {activeTab === "settings" && (
          <motion.div key="settings" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Global Settings */}
            <div className="bg-gradient-to-br from-emerald-600 to-green-700 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10">
                <div className="flex items-center gap-2 mb-2">
                  <BellRing className="w-5 h-5" />
                  <span className="text-sm font-bold">Notification Preferences</span>
                </div>
                <p className="text-[10px] text-white/70 mb-3">Configure which demand alerts you receive based on your crops and pricing targets</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-white/10 rounded-lg p-2">
                    <p className="text-[10px] text-white/70">Active Alerts</p>
                    <p className="text-lg font-bold">{preferences.filter(p => p.enabled).length}/{preferences.length}</p>
                  </div>
                  <div className="bg-white/10 rounded-lg p-2">
                    <p className="text-[10px] text-white/70">Avg Alerts/Day</p>
                    <p className="text-lg font-bold">4.2</p>
                  </div>
                </div>
              </div>
            </div>

            {/* Per-Crop Preferences */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2">Crop Alert Settings</h3>
            <div className="space-y-2">
              {preferences.map((pref, idx) => (
                <div key={pref.crop} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold">{pref.crop}</p>
                    <button
                      onClick={() => {
                        const updated = [...preferences];
                        updated[idx] = { ...updated[idx], enabled: !updated[idx].enabled };
                        setPreferences(updated);
                      }}
                      className={`w-10 h-5 rounded-full transition-colors relative ${pref.enabled ? "bg-emerald-500" : "bg-muted"}`}
                    >
                      <div className={`w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm ${pref.enabled ? "left-5.5 right-0.5" : "left-0.5"}`}
                        style={{ left: pref.enabled ? "22px" : "2px" }}
                      />
                    </button>
                  </div>
                  {pref.enabled && (
                    <div className="grid grid-cols-2 gap-2">
                      <div className="bg-muted/30 rounded-lg p-2">
                        <p className="text-[8px] text-muted-foreground">Min Price Alert</p>
                        <p className="text-[10px] font-bold">AED {pref.minPrice}/kg</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2 flex items-center justify-between">
                        <div>
                          <p className="text-[8px] text-muted-foreground">Urgent Only</p>
                          <p className="text-[10px] font-bold">{pref.urgentOnly ? "Yes" : "No"}</p>
                        </div>
                        <button
                          onClick={() => {
                            const updated = [...preferences];
                            updated[idx] = { ...updated[idx], urgentOnly: !updated[idx].urgentOnly };
                            setPreferences(updated);
                          }}
                          className={`w-8 h-4 rounded-full transition-colors relative ${pref.urgentOnly ? "bg-amber-500" : "bg-muted"}`}
                        >
                          <div className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-all shadow-sm`}
                            style={{ left: pref.urgentOnly ? "17px" : "2px" }}
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Notification Channels */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 mt-4">Notification Channels</h3>
            <div className="bg-card rounded-xl border border-border/40 divide-y divide-border/20">
              {[
                { label: "Push Notifications", desc: "Instant alerts on your device", enabled: true },
                { label: "Email Digest", desc: "Daily summary at 8:00 AM", enabled: true },
                { label: "SMS Alerts", desc: "Urgent demands only", enabled: false },
                { label: "WhatsApp", desc: "Connected: +971 50 XXX XXXX", enabled: true },
              ].map((ch) => (
                <div key={ch.label} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-xs font-semibold">{ch.label}</p>
                    <p className="text-[9px] text-muted-foreground">{ch.desc}</p>
                  </div>
                  <div className={`w-10 h-5 rounded-full transition-colors relative ${ch.enabled ? "bg-emerald-500" : "bg-muted"}`}>
                    <div className="w-4 h-4 rounded-full bg-white absolute top-0.5 transition-all shadow-sm"
                      style={{ left: ch.enabled ? "22px" : "2px" }}
                    />
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
