/*
 * FALAJ Rewards — Gamified Agriculture System
 * Design: Desert Minimalism — full gamification with XP, levels, challenges, leaderboard
 * Linked to: Sensors, Marketplace, AI Recommendations, Community, Government
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import {
  Gift, Star, Trophy, Target, Droplets, Leaf, Zap, Award, ChevronRight,
  Shield, Building2, Globe, BadgeCheck, TrendingUp, Coins, Flame, Crown,
  Sprout, Timer, Users, ShoppingBag, Bot, Radio, Heart, Medal,
  Swords, CheckCircle2, XCircle, Clock, ArrowUp, Sparkles, Lock
} from "lucide-react";
import { toast } from "sonner";

type RewardsTab = "overview" | "challenges" | "leaderboard" | "badges" | "government";

/* ─── XP & Level System ─── */
const currentXP = 4820;
const currentLevel = 12;
const levelTitle = "Master Cultivator";
const xpForNextLevel = 5500;
const xpForCurrentLevel = 4000;
const xpProgress = ((currentXP - xpForCurrentLevel) / (xpForNextLevel - xpForCurrentLevel)) * 100;

const levels = [
  { level: 1, title: "Seedling", xp: 0 },
  { level: 5, title: "Sprout", xp: 500 },
  { level: 10, title: "Green Thumb", xp: 2500 },
  { level: 12, title: "Master Cultivator", xp: 4000 },
  { level: 15, title: "Farm Legend", xp: 5500 },
  { level: 20, title: "Agriculture Pioneer", xp: 10000 },
  { level: 25, title: "Zayed's Legacy", xp: 20000 },
];

/* ─── Daily & Weekly Challenges ─── */
const dailyChallenges = [
  { id: 1, title: "Check all sensors", xp: 25, icon: Radio, progress: 6, total: 6, done: true, category: "sensors" },
  { id: 2, title: "Apply 1 AI recommendation", xp: 50, icon: Bot, progress: 1, total: 1, done: true, category: "ai" },
  { id: 3, title: "List a product on marketplace", xp: 30, icon: ShoppingBag, progress: 0, total: 1, done: false, category: "marketplace" },
  { id: 4, title: "Share a tip in community", xp: 20, icon: Users, progress: 0, total: 1, done: false, category: "community" },
  { id: 5, title: "Save 10L water today", xp: 40, icon: Droplets, progress: 7, total: 10, done: false, category: "sensors" },
];

const weeklyChallenges = [
  { id: 10, title: "Complete 5 marketplace trades", xp: 200, icon: ShoppingBag, progress: 3, total: 5, done: false, category: "marketplace" },
  { id: 11, title: "Accept 10 AI recommendations", xp: 300, icon: Bot, progress: 7, total: 10, done: false, category: "ai" },
  { id: 12, title: "Maintain sensor uptime 99%", xp: 250, icon: Radio, progress: 98, total: 99, done: false, category: "sensors" },
  { id: 13, title: "Help 3 farmers in community", xp: 150, icon: Heart, progress: 2, total: 3, done: false, category: "community" },
  { id: 14, title: "Reduce water usage by 15%", xp: 500, icon: Droplets, progress: 12, total: 15, done: false, category: "government" },
];

const seasonalChallenge = {
  title: "Spring Harvest Champion",
  description: "Complete all spring planting goals and achieve 90%+ crop health",
  xp: 2000,
  progress: 65,
  total: 100,
  daysLeft: 18,
  rewards: ["Gold Badge", "500 AED Marketplace Credit", "Government Sustainability Certificate"],
};

/* ─── Badges ─── */
const allBadges = [
  { name: "Water Guardian", icon: Droplets, earned: true, xp: 100, description: "Save 500L water in a month", color: "text-blue-500 bg-blue-50", category: "sustainability" },
  { name: "Green Thumb", icon: Leaf, earned: true, xp: 100, description: "Maintain 90%+ crop health for 30 days", color: "text-green-500 bg-green-50", category: "farming" },
  { name: "Tech Pioneer", icon: Zap, earned: true, xp: 150, description: "Connect 5+ IoT sensors", color: "text-orange-500 bg-orange-50", category: "technology" },
  { name: "AI Adopter", icon: Bot, earned: true, xp: 200, description: "Accept 50 AI recommendations", color: "text-purple-500 bg-purple-50", category: "ai" },
  { name: "Market Trader", icon: ShoppingBag, earned: true, xp: 150, description: "Complete 20 marketplace trades", color: "text-pink-500 bg-pink-50", category: "marketplace" },
  { name: "Community Star", icon: Star, earned: true, xp: 100, description: "Help 10 farmers in community", color: "text-amber-500 bg-amber-50", category: "community" },
  { name: "Streak Master", icon: Flame, earned: true, xp: 200, description: "30-day login streak", color: "text-red-500 bg-red-50", category: "engagement" },
  { name: "Data Expert", icon: Target, earned: false, xp: 300, description: "Review 200 sensor data reports", color: "text-indigo-500 bg-indigo-50", category: "technology" },
  { name: "Master Farmer", icon: Trophy, earned: false, xp: 500, description: "Reach Level 15", color: "text-amber-600 bg-amber-50", category: "farming" },
  { name: "Gov Certified", icon: Shield, earned: false, xp: 500, description: "Government sustainability certified", color: "text-emerald-500 bg-emerald-50", category: "government" },
  { name: "Carbon Hero", icon: Globe, earned: false, xp: 400, description: "Reduce carbon footprint by 30%", color: "text-teal-500 bg-teal-50", category: "sustainability" },
  { name: "Zayed's Legacy", icon: Crown, earned: false, xp: 1000, description: "Reach Level 25 — Ultimate achievement", color: "text-yellow-600 bg-yellow-50", category: "legendary" },
];

/* ─── Leaderboard ─── */
const leaderboard = [
  { rank: 1, name: "Ahmed Al Mansouri", farm: "Al Ain Organic Farm", xp: 12450, level: 22, badge: "🥇", trend: "up" },
  { rank: 2, name: "Fatima Al Dhaheri", farm: "Desert Rose Farm", xp: 11200, level: 20, badge: "🥈", trend: "up" },
  { rank: 3, name: "Mohammed Khalifa", farm: "Green Valley Estate", xp: 9800, level: 18, badge: "🥉", trend: "down" },
  { rank: 4, name: "Sara Al Hashimi", farm: "Palm Oasis Farm", xp: 8500, level: 16, badge: "", trend: "up" },
  { rank: 5, name: "Khalid Al Dhaheri", farm: "Sunrise Agriculture", xp: 7200, level: 15, badge: "", trend: "same" },
  { rank: 6, name: "You", farm: "My Smart Farm", xp: currentXP, level: currentLevel, badge: "", trend: "up", isYou: true },
  { rank: 7, name: "Omar Al Suwaidi", farm: "Heritage Farm", xp: 4500, level: 11, badge: "", trend: "down" },
  { rank: 8, name: "Noura Al Ketbi", farm: "Future Greens", xp: 3800, level: 10, badge: "", trend: "up" },
];

/* ─── XP History ─── */
const xpHistory = [
  { action: "Accepted AI irrigation recommendation", xp: "+50", time: "2h ago", source: "ai", icon: Bot },
  { action: "Daily challenge completed", xp: "+25", time: "3h ago", source: "challenge", icon: Target },
  { action: "Sold organic tomatoes on marketplace", xp: "+30", time: "5h ago", source: "marketplace", icon: ShoppingBag },
  { action: "Sensor uptime bonus (7 days)", xp: "+100", time: "Yesterday", source: "sensors", icon: Radio },
  { action: "Government water saving milestone", xp: "+200", time: "2 days ago", source: "government", icon: Shield },
  { action: "Community post liked 10 times", xp: "+15", time: "2 days ago", source: "community", icon: Heart },
  { action: "Weekly challenge: 5 trades completed", xp: "+200", time: "3 days ago", source: "challenge", icon: Trophy },
  { action: "Carbon credit earned", xp: "+300", time: "1 week ago", source: "government", icon: Globe },
];

/* ─── Government Programs ─── */
const govPrograms = [
  {
    name: "Water Conservation Subsidy",
    ministry: "Ministry of Climate Change & Environment",
    reward: "Up to 5,000 AED",
    status: "eligible" as const,
    description: "Farmers who reduce water usage by 20%+ qualify for government subsidies.",
    progress: 78,
    xpBonus: 500,
    metrics: { waterSaved: "2,340L", efficiency: "78%", target: "3,000L" },
  },
  {
    name: "Smart Agriculture Grant",
    ministry: "Abu Dhabi Agriculture & Food Safety Authority",
    reward: "Up to 15,000 AED",
    status: "applied" as const,
    description: "Grants for farms using IoT sensors and AI-driven agriculture.",
    progress: 100,
    xpBonus: 1000,
    metrics: { sensorsActive: "6/6", aiAdoption: "92%", dataShared: "100%" },
  },
  {
    name: "Carbon Credit Program",
    ministry: "UAE Net Zero 2050 Initiative",
    reward: "Carbon Credits",
    status: "active" as const,
    description: "Earn carbon credits for sustainable farming practices tracked by FALAJ sensors.",
    progress: 45,
    xpBonus: 750,
    metrics: { carbonReduced: "1.2 tons", target: "3 tons", credits: "4" },
  },
  {
    name: "Organic Farming Incentive",
    ministry: "Ministry of Economy",
    reward: "Up to 10,000 AED",
    status: "not_started" as const,
    description: "Incentives for transitioning to certified organic farming methods.",
    progress: 0,
    xpBonus: 800,
    metrics: { organicArea: "0%", certification: "Not started", timeline: "6 months" },
  },
];

const sourceColors: Record<string, string> = {
  ai: "text-purple-600 bg-purple-50",
  sensors: "text-blue-600 bg-blue-50",
  marketplace: "text-pink-600 bg-pink-50",
  community: "text-amber-600 bg-amber-50",
  government: "text-emerald-600 bg-emerald-50",
  challenge: "text-orange-600 bg-orange-50",
  engagement: "text-red-600 bg-red-50",
};

export default function Rewards() {
  const { user, addXP, challenges, completeChallenge } = useAppState();
  const [activeTab, setActiveTab] = useState<RewardsTab>("overview");
  const [govConnected, setGovConnected] = useState(false);
  const [claimedChallenges, setClaimedChallenges] = useState<number[]>([]);
  const [streakDays] = useState(14);

  const tabs: { key: RewardsTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <Sparkles className="w-3.5 h-3.5" /> },
    { key: "challenges", label: "Challenges", icon: <Swords className="w-3.5 h-3.5" /> },
    { key: "leaderboard", label: "Ranking", icon: <Medal className="w-3.5 h-3.5" /> },
    { key: "badges", label: "Badges", icon: <Award className="w-3.5 h-3.5" /> },
    { key: "government", label: "Gov", icon: <Shield className="w-3.5 h-3.5" /> },
  ];

  const claimChallenge = (id: number, xp: number) => {
    setClaimedChallenges([...claimedChallenges, id]);
    addXP(xp);
    toast.success(`+${xp} XP earned!`, { description: `Level ${user.level} · ${user.xp + xp} XP total` });
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => window.history.back()} className="p-1.5 -ml-1.5 rounded-xl hover:bg-muted transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <Trophy className="w-5 h-5 text-amber-500" />
              <span className="text-lg font-bold tracking-tight">Rewards</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 bg-amber-50 px-2.5 py-1 rounded-full">
                <Flame className="w-3.5 h-3.5 text-orange-500" />
                <span className="text-xs font-bold text-amber-700">{streakDays} day streak</span>
              </div>
            </div>
          </div>

          {/* Tabs */}
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
        {/* ═══════ OVERVIEW ═══════ */}
        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* XP & Level Card */}
            <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-5 text-white mb-5 shadow-lg shadow-emerald-200/40 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="absolute bottom-0 left-0 w-24 h-24 bg-white/5 rounded-full translate-y-6 -translate-x-6" />
              <div className="relative z-10">
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
                      <Crown className="w-6 h-6" />
                    </div>
                    <div>
                      <p className="text-xs text-white/70">Level {currentLevel}</p>
                      <p className="text-lg font-bold leading-tight">{levelTitle}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-2xl font-bold">{currentXP.toLocaleString()}</p>
                    <p className="text-[10px] text-white/70">Total XP</p>
                  </div>
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-[10px] text-white/70">Next: Level {currentLevel + 1}</span>
                    <span className="text-[10px] text-white/70">{currentXP - xpForCurrentLevel} / {xpForNextLevel - xpForCurrentLevel} XP</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${xpProgress}%` }}
                      transition={{ duration: 1, ease: "easeOut" }}
                      className="bg-white h-full rounded-full"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* XP Sources Summary */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                { label: "Sensors", xp: 1200, icon: Radio, color: "text-blue-600 bg-blue-50" },
                { label: "AI", xp: 950, icon: Bot, color: "text-purple-600 bg-purple-50" },
                { label: "Market", xp: 720, icon: ShoppingBag, color: "text-pink-600 bg-pink-50" },
                { label: "Community", xp: 450, icon: Users, color: "text-amber-600 bg-amber-50" },
                { label: "Gov", xp: 1100, icon: Shield, color: "text-emerald-600 bg-emerald-50" },
                { label: "Streaks", xp: 400, icon: Flame, color: "text-red-600 bg-red-50" },
              ].map((src) => {
                const Icon = src.icon;
                const [tc, bg] = src.color.split(" ");
                return (
                  <div key={src.label} className="bg-card rounded-xl border border-border/50 p-2.5 text-center">
                    <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mx-auto mb-1`}>
                      <Icon className={`w-4 h-4 ${tc}`} />
                    </div>
                    <p className="text-xs font-bold">{src.xp}</p>
                    <p className="text-[9px] text-muted-foreground">{src.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Seasonal Challenge */}
            <div className="bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200 rounded-2xl p-4 mb-5">
              <div className="flex items-center gap-2 mb-2">
                <Sprout className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-emerald-900">{seasonalChallenge.title}</h3>
                <span className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold ml-auto">{seasonalChallenge.daysLeft} days left</span>
              </div>
              <p className="text-xs text-emerald-700 mb-3">{seasonalChallenge.description}</p>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[10px] font-semibold text-emerald-800">+{seasonalChallenge.xp} XP</span>
                <span className="text-[10px] text-emerald-600">{seasonalChallenge.progress}%</span>
              </div>
              <div className="w-full bg-emerald-200 rounded-full h-2 overflow-hidden">
                <div className="bg-emerald-500 h-full rounded-full" style={{ width: `${seasonalChallenge.progress}%` }} />
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {seasonalChallenge.rewards.map((r) => (
                  <span key={r} className="text-[9px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">{r}</span>
                ))}
              </div>
            </div>

            {/* Recent XP */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent XP</h3>
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-5">
              {xpHistory.slice(0, 6).map((item, i) => {
                const Icon = item.icon;
                const [tc, bg] = (sourceColors[item.source] || "text-slate-600 bg-slate-50").split(" ");
                return (
                  <div key={i} className={`flex items-center gap-3 px-4 py-3 ${i < 5 ? "border-b border-border/30" : ""}`}>
                    <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center shrink-0`}>
                      <Icon className={`w-4 h-4 ${tc}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{item.action}</p>
                      <p className="text-[10px] text-muted-foreground">{item.time}</p>
                    </div>
                    <span className="text-sm font-bold text-green-600 shrink-0">{item.xp}</span>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══════ CHALLENGES ═══════ */}
        {activeTab === "challenges" && (
          <motion.div key="challenges" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Daily Challenges */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Daily Challenges</h3>
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">Resets in 8h</span>
              </div>
            </div>
            <div className="space-y-2.5 mb-6">
              {dailyChallenges.map((ch) => {
                const Icon = ch.icon;
                const claimed = claimedChallenges.includes(ch.id);
                const [tc, bg] = (sourceColors[ch.category] || "text-slate-600 bg-slate-50").split(" ");
                return (
                  <div key={ch.id} className={`bg-card rounded-2xl border border-border/50 p-3.5 transition-all ${ch.done && !claimed ? "ring-2 ring-green-200" : ""} ${claimed ? "opacity-60" : ""}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
                        <Icon className={`w-5 h-5 ${tc}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold truncate">{ch.title}</p>
                          <span className="text-xs font-bold text-amber-600">+{ch.xp} XP</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className={`h-full rounded-full transition-all ${ch.done ? "bg-green-500" : "bg-primary"}`} style={{ width: `${(ch.progress / ch.total) * 100}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{ch.progress}/{ch.total}</p>
                      </div>
                      {ch.done && !claimed && (
                        <button onClick={() => claimChallenge(ch.id, ch.xp)} className="bg-green-500 text-white px-3 py-1.5 rounded-xl text-[10px] font-bold hover:bg-green-600 transition-colors shrink-0">
                          Claim
                        </button>
                      )}
                      {claimed && <CheckCircle2 className="w-5 h-5 text-green-500 shrink-0" />}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Weekly Challenges */}
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Weekly Challenges</h3>
              <div className="flex items-center gap-1">
                <Timer className="w-3 h-3 text-muted-foreground" />
                <span className="text-[10px] text-muted-foreground">4 days left</span>
              </div>
            </div>
            <div className="space-y-2.5 mb-5">
              {weeklyChallenges.map((ch) => {
                const Icon = ch.icon;
                const [tc, bg] = (sourceColors[ch.category] || "text-slate-600 bg-slate-50").split(" ");
                return (
                  <div key={ch.id} className="bg-card rounded-2xl border border-border/50 p-3.5">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 ${bg} rounded-xl flex items-center justify-center shrink-0`}>
                        <Icon className={`w-5 h-5 ${tc}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-xs font-bold truncate">{ch.title}</p>
                          <span className="text-xs font-bold text-amber-600">+{ch.xp} XP</span>
                        </div>
                        <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                          <div className="bg-primary h-full rounded-full" style={{ width: `${(ch.progress / ch.total) * 100}%` }} />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1">{ch.progress}/{ch.total}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══════ LEADERBOARD ═══════ */}
        {activeTab === "leaderboard" && (
          <motion.div key="leaderboard" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Top 3 Podium */}
            <div className="flex items-end justify-center gap-3 mb-6 pt-4">
              {/* 2nd */}
              <div className="flex flex-col items-center">
                <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center mb-1 border-2 border-slate-300">
                  <span className="text-lg font-bold text-slate-600">F</span>
                </div>
                <p className="text-[10px] font-bold text-center truncate w-16">{leaderboard[1].name.split(" ")[0]}</p>
                <p className="text-[9px] text-muted-foreground">{leaderboard[1].xp.toLocaleString()} XP</p>
                <div className="w-16 h-16 bg-slate-200 rounded-t-xl mt-1 flex items-center justify-center">
                  <span className="text-2xl">🥈</span>
                </div>
              </div>
              {/* 1st */}
              <div className="flex flex-col items-center -mt-4">
                <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mb-1 border-2 border-amber-400 ring-4 ring-amber-100">
                  <span className="text-xl font-bold text-amber-700">A</span>
                </div>
                <p className="text-xs font-bold text-center truncate w-20">{leaderboard[0].name.split(" ")[0]}</p>
                <p className="text-[9px] text-muted-foreground">{leaderboard[0].xp.toLocaleString()} XP</p>
                <div className="w-16 h-24 bg-amber-200 rounded-t-xl mt-1 flex items-center justify-center">
                  <span className="text-3xl">🥇</span>
                </div>
              </div>
              {/* 3rd */}
              <div className="flex flex-col items-center">
                <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center mb-1 border-2 border-orange-300">
                  <span className="text-lg font-bold text-orange-600">M</span>
                </div>
                <p className="text-[10px] font-bold text-center truncate w-16">{leaderboard[2].name.split(" ")[0]}</p>
                <p className="text-[9px] text-muted-foreground">{leaderboard[2].xp.toLocaleString()} XP</p>
                <div className="w-16 h-12 bg-orange-100 rounded-t-xl mt-1 flex items-center justify-center">
                  <span className="text-2xl">🥉</span>
                </div>
              </div>
            </div>

            {/* Full Rankings */}
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
              {leaderboard.map((entry, i) => (
                <div key={entry.rank} className={`flex items-center gap-3 px-4 py-3 ${i < leaderboard.length - 1 ? "border-b border-border/30" : ""} ${(entry as any).isYou ? "bg-primary/5" : ""}`}>
                  <span className={`w-7 text-center text-xs font-bold ${entry.rank <= 3 ? "text-amber-600" : "text-muted-foreground"}`}>
                    {entry.badge || `#${entry.rank}`}
                  </span>
                  <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold ${(entry as any).isYou ? "bg-primary text-white" : "bg-muted text-muted-foreground"}`}>
                    {entry.name[0]}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-bold truncate ${(entry as any).isYou ? "text-primary" : ""}`}>
                      {entry.name} {(entry as any).isYou && "(You)"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">Lv.{entry.level} · {entry.farm}</p>
                  </div>
                  <div className="text-right shrink-0 flex items-center gap-1.5">
                    <span className="text-xs font-bold">{entry.xp.toLocaleString()}</span>
                    {entry.trend === "up" && <ArrowUp className="w-3 h-3 text-green-500" />}
                    {entry.trend === "down" && <ArrowUp className="w-3 h-3 text-red-500 rotate-180" />}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ BADGES ═══════ */}
        {activeTab === "badges" && (
          <motion.div key="badges" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            <div className="flex items-center justify-between mb-4">
              <p className="text-sm text-muted-foreground">{allBadges.filter(b => b.earned).length}/{allBadges.length} earned</p>
            </div>
            <div className="grid grid-cols-3 gap-3">
              {allBadges.map((badge) => {
                const Icon = badge.icon;
                const [iconColor, iconBg] = badge.color.split(" ");
                return (
                  <motion.div
                    key={badge.name}
                    whileHover={{ scale: 1.03 }}
                    className={`flex flex-col items-center gap-2 p-3.5 rounded-2xl border transition-all relative ${
                      badge.earned ? "bg-card border-border/50 shadow-sm" : "bg-muted/20 border-border/10 opacity-40"
                    }`}
                  >
                    {!badge.earned && <Lock className="w-3 h-3 text-muted-foreground absolute top-2 right-2" />}
                    <div className={`p-2.5 rounded-xl ${badge.earned ? iconBg : "bg-muted"}`}>
                      <Icon className={`w-6 h-6 ${badge.earned ? iconColor : "text-muted-foreground"}`} />
                    </div>
                    <span className="text-[10px] font-bold text-center leading-tight">{badge.name}</span>
                    <span className="text-[9px] text-muted-foreground text-center leading-tight">{badge.description}</span>
                    <span className="text-[9px] font-semibold text-amber-600">+{badge.xp} XP</span>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══════ GOVERNMENT ═══════ */}
        {activeTab === "government" && (
          <motion.div key="government" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Government Connection */}
            {!govConnected ? (
              <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 mb-5 text-white">
                <div className="flex items-center gap-2 mb-2">
                  <Building2 className="w-5 h-5 text-blue-300" />
                  <h3 className="text-sm font-bold">Connect to Government</h3>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed mb-3">
                  Link your FALAJ account to UAE government programs to earn XP for sustainable farming, qualify for subsidies, and climb the leaderboard.
                </p>
                <button
                  onClick={() => { setGovConnected(true); toast.success("Connected to government programs! +500 XP Bonus"); }}
                  className="w-full bg-white text-slate-900 rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                >
                  <BadgeCheck className="w-4 h-4" />
                  Connect via UAE PASS
                </button>
              </div>
            ) : (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-5">
                <div className="flex items-center gap-2 mb-1">
                  <BadgeCheck className="w-5 h-5 text-green-600" />
                  <h3 className="text-sm font-bold text-green-900">Government Connected</h3>
                </div>
                <p className="text-xs text-green-700">Your farm data earns you XP through government sustainability programs.</p>
              </div>
            )}

            {/* Government Programs with XP */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Programs & XP Bonuses</h3>
            <div className="space-y-3">
              {govPrograms.map((program, i) => (
                <motion.div
                  key={program.name}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-2xl border border-border/50 p-4"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex-1 mr-2">
                      <h4 className="text-sm font-bold mb-0.5">{program.name}</h4>
                      <p className="text-[10px] text-muted-foreground">{program.ministry}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                        program.status === "active" ? "bg-green-50 text-green-600" :
                        program.status === "eligible" ? "bg-blue-50 text-blue-600" :
                        program.status === "applied" ? "bg-amber-50 text-amber-600" :
                        "bg-slate-100 text-slate-500"
                      }`}>
                        {program.status === "not_started" ? "Not Started" : program.status}
                      </span>
                      <span className="text-[10px] font-bold text-amber-600">+{program.xpBonus} XP</span>
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed mb-3">{program.description}</p>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-primary">{program.reward}</span>
                    <span className="text-[10px] text-muted-foreground">{program.progress}%</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-1.5 overflow-hidden">
                    <div className={`h-full rounded-full ${
                      program.status === "active" ? "bg-green-500" :
                      program.status === "eligible" ? "bg-blue-500" :
                      program.status === "applied" ? "bg-amber-500" : "bg-slate-300"
                    }`} style={{ width: `${program.progress}%` }} />
                  </div>
                  {program.status === "eligible" && (
                    <button onClick={() => toast.success("Application submitted! +100 XP")} className="w-full mt-3 bg-primary text-white rounded-xl py-2 text-xs font-semibold">
                      Apply Now
                    </button>
                  )}
                </motion.div>
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
