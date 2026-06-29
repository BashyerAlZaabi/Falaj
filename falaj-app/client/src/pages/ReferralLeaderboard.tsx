/**
 * FALAJ Referral Leaderboard — Community rankings for top referrers
 * Shows monthly/all-time rankings, user's position, and rewards tiers
 */
import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import { Link, useLocation } from "wouter";
import { useAppState } from "@/contexts/AppStateContext";
import {
  ArrowLeft, Trophy, Medal, Crown, Star, Users,
  TrendingUp, Gift, ChevronRight, Sparkles, Flame
} from "lucide-react";

interface LeaderboardEntry {
  rank: number;
  name: string;
  avatar: string;
  farm: string;
  referrals: number;
  monthlyReferrals: number;
  rewardsEarned: number;
  streak: number;
  tier: "bronze" | "silver" | "gold" | "diamond";
  isCurrentUser?: boolean;
}

const leaderboardData: LeaderboardEntry[] = [
  { rank: 1, name: "Rashid Al Maktoum", avatar: "RM", farm: "Dubai Green Oasis", referrals: 47, monthlyReferrals: 8, rewardsEarned: 12, streak: 6, tier: "diamond" },
  { rank: 2, name: "Noura Al Nahyan", avatar: "NA", farm: "Al Wathba Organic Farm", referrals: 38, monthlyReferrals: 6, rewardsEarned: 10, streak: 5, tier: "diamond" },
  { rank: 3, name: "Sultan Al Qasimi", avatar: "SQ", farm: "Sharjah Heritage Farms", referrals: 31, monthlyReferrals: 5, rewardsEarned: 8, streak: 4, tier: "gold" },
  { rank: 4, name: "Fatima Al Ketbi", avatar: "FK", farm: "RAK Mountain Gardens", referrals: 24, monthlyReferrals: 4, rewardsEarned: 6, streak: 3, tier: "gold" },
  { rank: 5, name: "Mohammed Al Shamsi", avatar: "MS", farm: "Fujairah Coastal Farm", referrals: 19, monthlyReferrals: 3, rewardsEarned: 5, streak: 3, tier: "silver" },
  { rank: 6, name: "Aisha Al Zaabi", avatar: "AZ", farm: "Liwa Date Plantation", referrals: 15, monthlyReferrals: 3, rewardsEarned: 4, streak: 2, tier: "silver" },
  { rank: 7, name: "Khalid Al Mansoori", avatar: "KM", farm: "Al Ain Valley Farm", referrals: 12, monthlyReferrals: 2, rewardsEarned: 3, streak: 2, tier: "silver" },
  { rank: 8, name: "Hessa Al Falasi", avatar: "HF", farm: "Dubai Desert Bloom", referrals: 9, monthlyReferrals: 2, rewardsEarned: 2, streak: 1, tier: "bronze" },
  { rank: 9, name: "Omar Al Suwaidi", avatar: "OS", farm: "Abu Dhabi Green Belt", referrals: 7, monthlyReferrals: 1, rewardsEarned: 2, streak: 1, tier: "bronze" },
  { rank: 10, name: "Mariam Al Hashimi", avatar: "MH", farm: "Ajman Herb Garden", referrals: 5, monthlyReferrals: 1, rewardsEarned: 1, streak: 0, tier: "bronze" },
];

const rewardTiers = [
  { name: "Bronze Referrer", min: 1, max: 9, icon: Medal, color: "text-amber-700", bg: "bg-amber-100", reward: "1 free month per referral" },
  { name: "Silver Referrer", min: 10, max: 24, icon: Star, color: "text-gray-500", bg: "bg-gray-100", reward: "1.5 months per referral + badge" },
  { name: "Gold Referrer", min: 25, max: 39, icon: Trophy, color: "text-yellow-600", bg: "bg-yellow-100", reward: "2 months per referral + priority support" },
  { name: "Diamond Referrer", min: 40, max: 999, icon: Crown, color: "text-cyan-600", bg: "bg-cyan-100", reward: "Lifetime 50% discount + Ambassador title" },
];

const tierColors: Record<string, { bg: string; text: string; border: string; gradient: string }> = {
  bronze: { bg: "bg-amber-50", text: "text-amber-700", border: "border-amber-200", gradient: "from-amber-600 to-amber-700" },
  silver: { bg: "bg-gray-50", text: "text-gray-600", border: "border-gray-200", gradient: "from-gray-500 to-gray-600" },
  gold: { bg: "bg-yellow-50", text: "text-yellow-700", border: "border-yellow-200", gradient: "from-yellow-500 to-amber-500" },
  diamond: { bg: "bg-cyan-50", text: "text-cyan-700", border: "border-cyan-200", gradient: "from-cyan-500 to-blue-500" },
};

const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.05 } } };
const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };

export default function ReferralLeaderboard() {
  const [, navigate] = useLocation();
  const { user } = useAppState();
  const [tab, setTab] = useState<"monthly" | "allTime">("monthly");

  // Insert current user into leaderboard
  const fullLeaderboard = useMemo(() => {
    const currentUserEntry: LeaderboardEntry = {
      rank: 11,
      name: user.name,
      avatar: user.avatar,
      farm: user.farm,
      referrals: user.referralsCount,
      monthlyReferrals: 1,
      rewardsEarned: user.referralRewardsEarned,
      streak: 1,
      tier: user.referralsCount >= 40 ? "diamond" : user.referralsCount >= 25 ? "gold" : user.referralsCount >= 10 ? "silver" : "bronze",
      isCurrentUser: true,
    };
    // Recalculate rank based on referrals
    const all = [...leaderboardData, currentUserEntry].sort((a, b) =>
      tab === "monthly" ? b.monthlyReferrals - a.monthlyReferrals : b.referrals - a.referrals
    );
    return all.map((e, i) => ({ ...e, rank: i + 1 }));
  }, [user, tab]);

  const currentUserRank = fullLeaderboard.find(e => e.isCurrentUser)?.rank || 0;
  const currentUserTier = user.referralsCount >= 40 ? "diamond" : user.referralsCount >= 25 ? "gold" : user.referralsCount >= 10 ? "silver" : "bronze";
  const nextTier = rewardTiers.find(t => user.referralsCount < t.min) || rewardTiers[rewardTiers.length - 1];
  const currentTierInfo = rewardTiers.find(t => user.referralsCount >= t.min && user.referralsCount <= t.max) || rewardTiers[0];

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto flex items-center justify-between px-4 h-14">
          <button onClick={() => navigate("/referrals")} className="p-2 -ml-2 rounded-xl hover:bg-muted/60 transition-colors active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-base font-bold tracking-tight">Referral Leaderboard</span>
          <div className="w-9" />
        </div>
      </header>

      <motion.div variants={stagger} initial="hidden" animate="show" className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Your Position Card */}
        <motion.div variants={fadeUp} className="mb-5">
          <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-600/20">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-xs text-white/60 font-medium uppercase tracking-wider">Your Ranking</p>
                <p className="text-4xl font-bold mt-1">#{currentUserRank}</p>
              </div>
              <div className="text-right">
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${tierColors[currentUserTier].bg} ${tierColors[currentUserTier].text}`}>
                  <Trophy className="w-3.5 h-3.5" />
                  {currentTierInfo.name}
                </div>
                <p className="text-xs text-white/50 mt-1.5">{user.referralsCount} total referrals</p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/15">
              <div>
                <p className="text-lg font-bold">{user.referralRewardsEarned}</p>
                <p className="text-[10px] text-white/50">Months Earned</p>
              </div>
              <div>
                <p className="text-lg font-bold">{user.referralsCount}</p>
                <p className="text-[10px] text-white/50">Referrals</p>
              </div>
              <div>
                <p className="text-lg font-bold">1</p>
                <p className="text-[10px] text-white/50">Month Streak</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Next Tier Progress */}
        {currentUserTier !== "diamond" && (
          <motion.div variants={fadeUp} className="mb-5">
            <div className="bg-card rounded-2xl border border-border/40 p-4">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold">Next Tier: {nextTier.name}</span>
                </div>
                <span className="text-xs text-muted-foreground">{nextTier.min - user.referralsCount} more needed</span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-500 rounded-full transition-all"
                  style={{ width: `${Math.min(100, (user.referralsCount / nextTier.min) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-muted-foreground mt-1.5">Unlock: {nextTier.reward}</p>
            </div>
          </motion.div>
        )}

        {/* Tab Toggle */}
        <motion.div variants={fadeUp} className="flex gap-1 p-1 bg-muted/40 rounded-xl mb-4">
          {(["monthly", "allTime"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex-1 py-2.5 rounded-lg text-xs font-bold transition-all ${
                tab === t
                  ? "bg-white text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t === "monthly" ? "This Month" : "All Time"}
            </button>
          ))}
        </motion.div>

        {/* Top 3 Podium */}
        <motion.div variants={fadeUp} className="flex items-end justify-center gap-3 mb-6 pt-4">
          {[1, 0, 2].map((podiumIdx) => {
            const entry = fullLeaderboard[podiumIdx];
            if (!entry) return null;
            const isFirst = entry.rank === 1;
            const heights = { 1: "h-24", 2: "h-16", 3: "h-12" };
            const sizes = { 1: "w-16 h-16", 2: "w-13 h-13", 3: "w-13 h-13" };
            const textSizes = { 1: "text-lg", 2: "text-sm", 3: "text-sm" };
            const rankKey = entry.rank as 1 | 2 | 3;
            return (
              <div key={entry.rank} className="flex flex-col items-center">
                <div className={`relative ${entry.isCurrentUser ? "ring-2 ring-emerald-400 ring-offset-2" : ""} ${sizes[rankKey]} rounded-full bg-gradient-to-br ${tierColors[entry.tier].gradient} flex items-center justify-center text-white font-bold ${textSizes[rankKey]} shadow-lg mb-2`}>
                  {entry.avatar}
                  {isFirst && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                      <Crown className="w-5 h-5 text-yellow-400 drop-shadow-lg" />
                    </div>
                  )}
                </div>
                <p className={`text-xs font-bold text-center ${entry.isCurrentUser ? "text-emerald-600" : ""}`}>
                  {entry.name.split(" ")[0]}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {tab === "monthly" ? entry.monthlyReferrals : entry.referrals} refs
                </p>
                <div className={`${heights[rankKey]} w-16 mt-2 rounded-t-xl bg-gradient-to-t ${
                  entry.rank === 1 ? "from-yellow-400 to-yellow-300" :
                  entry.rank === 2 ? "from-gray-300 to-gray-200" :
                  "from-amber-600 to-amber-500"
                } flex items-center justify-center`}>
                  <span className="text-white font-bold text-lg">#{entry.rank}</span>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Full Rankings */}
        <motion.div variants={fadeUp} className="mb-5">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">Full Rankings</h3>
          <div className="space-y-1.5">
            {fullLeaderboard.map((entry) => {
              const tc = tierColors[entry.tier];
              return (
                <div
                  key={entry.rank + entry.name}
                  className={`flex items-center gap-3 p-3 rounded-xl transition-all ${
                    entry.isCurrentUser
                      ? "bg-emerald-50 border-2 border-emerald-300 shadow-sm"
                      : "bg-card border border-border/30 hover:shadow-sm"
                  }`}
                >
                  {/* Rank */}
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    entry.rank <= 3
                      ? entry.rank === 1 ? "bg-yellow-100 text-yellow-700" : entry.rank === 2 ? "bg-gray-100 text-gray-600" : "bg-amber-100 text-amber-700"
                      : "bg-gray-50 text-gray-500"
                  }`}>
                    {entry.rank <= 3 ? (
                      <Trophy className={`w-4 h-4 ${entry.rank === 1 ? "text-yellow-600" : entry.rank === 2 ? "text-gray-500" : "text-amber-600"}`} />
                    ) : (
                      entry.rank
                    )}
                  </div>

                  {/* Avatar */}
                  <div className={`w-9 h-9 rounded-full bg-gradient-to-br ${tc.gradient} flex items-center justify-center text-white text-xs font-bold shrink-0`}>
                    {entry.avatar}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className={`text-sm font-semibold truncate ${entry.isCurrentUser ? "text-emerald-700" : ""}`}>
                        {entry.name}
                        {entry.isCurrentUser && <span className="text-[10px] text-emerald-500 ml-1">(You)</span>}
                      </p>
                      {entry.streak >= 3 && (
                        <span className="flex items-center gap-0.5 text-[9px] font-bold text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded-full">
                          <Flame className="w-2.5 h-2.5" />{entry.streak}
                        </span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground truncate">{entry.farm}</p>
                  </div>

                  {/* Stats */}
                  <div className="text-right shrink-0">
                    <p className="text-sm font-bold">
                      {tab === "monthly" ? entry.monthlyReferrals : entry.referrals}
                    </p>
                    <p className="text-[9px] text-muted-foreground">referrals</p>
                  </div>

                  {/* Tier badge */}
                  <div className={`px-2 py-1 rounded-full text-[8px] font-bold uppercase ${tc.bg} ${tc.text} shrink-0`}>
                    {entry.tier}
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* Reward Tiers */}
        <motion.div variants={fadeUp} className="mb-5">
          <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-3">Reward Tiers</h3>
          <div className="space-y-2">
            {rewardTiers.map((tier) => {
              const Icon = tier.icon;
              const isActive = user.referralsCount >= tier.min && user.referralsCount <= tier.max;
              return (
                <div
                  key={tier.name}
                  className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all ${
                    isActive
                      ? "border-emerald-300 bg-emerald-50 shadow-sm"
                      : "border-border/30 bg-card"
                  }`}
                >
                  <div className={`p-2.5 rounded-xl ${tier.bg}`}>
                    <Icon className={`w-5 h-5 ${tier.color}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold">{tier.name}</p>
                      {isActive && (
                        <span className="text-[9px] font-bold text-emerald-600 bg-emerald-100 px-2 py-0.5 rounded-full">Current</span>
                      )}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{tier.min}+ referrals — {tier.reward}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* CTA */}
        <motion.div variants={fadeUp} className="mb-8">
          <Link href="/referrals">
            <div className="bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl p-4 text-white text-center shadow-lg shadow-emerald-200/30 active:scale-[0.98] transition-transform">
              <Gift className="w-6 h-6 mx-auto mb-2 opacity-80" />
              <p className="text-sm font-bold">Invite More Friends</p>
              <p className="text-xs text-white/70 mt-0.5">Share your code and climb the leaderboard</p>
            </div>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  );
}
