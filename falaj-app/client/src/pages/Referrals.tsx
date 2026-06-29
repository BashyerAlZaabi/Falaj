/**
 * FALAJ Referral Program — Earn 1 free month per referral
 * Design: Professional, clean with green/blue theme
 * Features: Unique referral code, tracking, reward distribution
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronLeft, Copy, Share2, Gift, Users, Check,
  Clock, UserPlus, Crown, ArrowRight, Sparkles,
  CheckCircle2, Timer, UserCheck
} from "lucide-react";
import { useAppState } from "@/contexts/AppStateContext";
import { toast } from "sonner";

const fadeUp = { hidden: { opacity: 0, y: 12 }, show: { opacity: 1, y: 0, transition: { duration: 0.3 } } };
const stagger = { hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.06 } } };

const statusConfig: Record<string, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  subscribed: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50", label: "Subscribed" },
  trial: { icon: Timer, color: "text-blue-600", bg: "bg-blue-50", label: "On Trial" },
  pending: { icon: Clock, color: "text-amber-600", bg: "bg-amber-50", label: "Pending" },
};

export default function Referrals() {
  const [, navigate] = useLocation();
  const { user, getReferralStats, applyReferralCode } = useAppState();
  const [referredByCode, setReferredByCode] = useState("");
  const [showApplyCode, setShowApplyCode] = useState(false);
  const [copied, setCopied] = useState(false);

  const stats = getReferralStats();
  const subscribedCount = stats.referrals.filter(r => r.status === "subscribed").length;

  const handleCopyCode = () => {
    navigator.clipboard.writeText(stats.code).then(() => {
      setCopied(true);
      toast.success("Referral code copied!");
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      toast.success(`Your code: ${stats.code}`);
    });
  };

  const handleShare = () => {
    const shareText = `Join FALAJ - Smart Agriculture for UAE Farmers! Use my referral code "${stats.code}" to get started. Download now and transform your farm with AI-powered tools.`;
    if (navigator.share) {
      navigator.share({
        title: "Join FALAJ Smart Agriculture",
        text: shareText,
        url: "https://falaj.ae",
      }).catch(() => {});
    } else {
      navigator.clipboard.writeText(shareText).then(() => {
        toast.success("Share text copied to clipboard!");
      }).catch(() => {});
    }
  };

  const handleApplyCode = () => {
    if (!referredByCode.trim()) {
      toast.error("Please enter a referral code");
      return;
    }
    const success = applyReferralCode(referredByCode.trim().toUpperCase());
    if (success) {
      toast.success("Referral code applied successfully!");
      setShowApplyCode(false);
      setReferredByCode("");
    } else {
      toast.error("Invalid referral code. Please try again.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-br from-emerald-600 via-green-600 to-teal-600 px-4 pt-12 pb-8 text-white">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={() => navigate(-1 as any)} className="p-2 hover:bg-white/10 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl font-bold">Referral Program</h1>
        </div>

        {/* Hero Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <div className="w-16 h-16 bg-white/15 rounded-2xl flex items-center justify-center mx-auto mb-3 backdrop-blur-sm">
            <Gift className="w-8 h-8 text-white" />
          </div>
          <h2 className="text-2xl font-bold mb-1">Earn Free Months</h2>
          <p className="text-sm text-white/70">
            Invite friends and earn 1 free month of your current plan for each referral who subscribes
          </p>
        </motion.div>

        {/* Stats Row */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="grid grid-cols-3 gap-3 mt-6"
        >
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.count}</p>
            <p className="text-[10px] text-white/60 mt-0.5">Total Referrals</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{subscribedCount}</p>
            <p className="text-[10px] text-white/60 mt-0.5">Subscribed</p>
          </div>
          <div className="bg-white/10 backdrop-blur-sm rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{stats.rewardsEarned}</p>
            <p className="text-[10px] text-white/60 mt-0.5">Months Earned</p>
          </div>
        </motion.div>
      </div>

      <motion.div variants={stagger} initial="hidden" animate="show" className="px-4 -mt-4">
        {/* Referral Code Card */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
          <div className="p-5">
            <div className="flex items-center gap-2 mb-3">
              <UserPlus className="w-4.5 h-4.5 text-emerald-600" />
              <h3 className="font-bold text-gray-900 text-sm">Your Referral Code</h3>
            </div>

            {/* Code Display */}
            <div className="bg-gray-50 rounded-xl p-4 flex items-center justify-between mb-4 border border-gray-100">
              <div>
                <p className="text-xs text-gray-400 mb-1">Share this code</p>
                <p className="text-xl font-mono font-bold text-gray-900 tracking-wider">{stats.code}</p>
              </div>
              <button
                onClick={handleCopyCode}
                className={`p-3 rounded-xl transition-all active:scale-95 ${
                  copied
                    ? "bg-emerald-100 text-emerald-600"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
              >
                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
              </button>
            </div>

            {/* Share Button */}
            <button
              onClick={handleShare}
              className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/50 active:scale-[0.98] transition-transform"
            >
              <Share2 className="w-4 h-4" />
              Share with Friends
            </button>
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
          <div className="p-5">
            <h3 className="font-bold text-gray-900 text-sm mb-4">How It Works</h3>
            <div className="space-y-4">
              {[
                { step: 1, icon: Share2, title: "Share Your Code", desc: "Send your unique referral code to fellow farmers" },
                { step: 2, icon: UserCheck, title: "Friend Signs Up", desc: "They create an account and enter your code" },
                { step: 3, icon: Crown, title: "Friend Subscribes", desc: "When they subscribe to any paid plan" },
                { step: 4, icon: Gift, title: "Both Get Rewarded", desc: "You earn 1 free month, they get 10% off first month" },
              ].map(({ step, icon: Icon, title, desc }) => (
                <div key={step} className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-50 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-bold text-emerald-600">{step}</span>
                  </div>
                  <div className="flex-1 pt-0.5">
                    <div className="flex items-center gap-2">
                      <Icon className="w-3.5 h-3.5 text-emerald-600" />
                      <p className="text-sm font-semibold text-gray-900">{title}</p>
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>

        {/* Leaderboard Link */}
        <motion.div variants={fadeUp}>
          <button
            onClick={() => navigate("/referral-leaderboard")}
            className="w-full bg-gradient-to-r from-emerald-600 to-green-600 rounded-2xl p-4 mb-4 text-white text-left shadow-lg shadow-emerald-200/30 active:scale-[0.98] transition-transform flex items-center gap-3"
          >
            <div className="p-2.5 rounded-xl bg-white/20">
              <Users className="w-5 h-5" />
            </div>
            <div className="flex-1">
              <p className="text-sm font-bold">Referral Leaderboard</p>
              <p className="text-xs text-white/70">See how you rank among UAE farmers</p>
            </div>
            <ArrowRight className="w-5 h-5 text-white/60" />
          </button>
        </motion.div>

        {/* Reward Tracker */}
        <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
          <div className="p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 text-sm">Your Referrals</h3>
              <span className="text-xs text-gray-400">{stats.referrals.length} total</span>
            </div>

            {stats.referrals.length === 0 ? (
              <div className="text-center py-8">
                <Users className="w-10 h-10 text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-gray-400">No referrals yet</p>
                <p className="text-xs text-gray-300 mt-1">Share your code to get started</p>
              </div>
            ) : (
              <div className="space-y-3">
                {stats.referrals.map((referral, i) => {
                  const config = statusConfig[referral.status] || statusConfig.pending;
                  const StatusIcon = config.icon;
                  return (
                    <div key={i} className="flex items-center gap-3 py-2 border-b border-gray-50 last:border-0">
                      <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center">
                        <span className="text-sm font-bold text-gray-600">
                          {referral.name.split(" ").map(n => n[0]).join("")}
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{referral.name}</p>
                        <p className="text-[10px] text-gray-400">Joined {referral.date}</p>
                      </div>
                      <div className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-full ${config.bg} ${config.color}`}>
                        <StatusIcon className="w-3 h-3" />
                        {config.label}
                      </div>
                      {referral.status === "subscribed" && (
                        <div className="flex items-center gap-1 text-[10px] font-bold text-emerald-600">
                          <Sparkles className="w-3 h-3" />
                          +1 mo
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </motion.div>

        {/* Rewards Summary */}
        <motion.div variants={fadeUp} className="bg-gradient-to-br from-emerald-50 to-teal-50 rounded-2xl border border-emerald-200/50 p-5 mb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="p-2.5 rounded-xl bg-emerald-100">
              <Gift className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm font-bold text-emerald-900">Rewards Earned</p>
              <p className="text-xs text-emerald-600/70">From successful referrals</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white/70 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">{stats.rewardsEarned}</p>
              <p className="text-[10px] text-emerald-600/60">Free Months</p>
            </div>
            <div className="bg-white/70 rounded-xl p-3 text-center">
              <p className="text-2xl font-bold text-emerald-700">
                {stats.rewardsEarned * (user.package === "falaj_elite" ? 399 : 149)}
              </p>
              <p className="text-[10px] text-emerald-600/60">AED Saved</p>
            </div>
          </div>
        </motion.div>

        {/* Apply Referral Code (if not already referred) */}
        {!user.referredBy && (
          <motion.div variants={fadeUp} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-4">
            <div className="p-5">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-gray-900 text-sm">Have a Referral Code?</h3>
                <button
                  onClick={() => setShowApplyCode(!showApplyCode)}
                  className="text-xs font-semibold text-emerald-600"
                >
                  {showApplyCode ? "Cancel" : "Enter Code"}
                </button>
              </div>
              {showApplyCode && (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={referredByCode}
                    onChange={e => setReferredByCode(e.target.value.toUpperCase())}
                    placeholder="Enter code (e.g. AHMED-FALAJ-7X2K)"
                    className="flex-1 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-mono uppercase placeholder:text-gray-300 focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-400"
                  />
                  <button
                    onClick={handleApplyCode}
                    className="px-5 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition-colors active:scale-95"
                  >
                    Apply
                  </button>
                </div>
              )}
              {!showApplyCode && (
                <p className="text-xs text-gray-400">
                  If a friend referred you, enter their code to get 10% off your first month
                </p>
              )}
            </div>
          </motion.div>
        )}

        {/* Already referred badge */}
        {user.referredBy && (
          <motion.div variants={fadeUp} className="bg-blue-50 rounded-2xl border border-blue-200/50 p-4 mb-4 flex items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <div>
              <p className="text-sm font-semibold text-blue-900">Referred by: {user.referredBy}</p>
              <p className="text-xs text-blue-600/70">You received 10% off your first month</p>
            </div>
          </motion.div>
        )}

        {/* Upgrade CTA for free users */}
        {user.package === "seedling" && (
          <motion.div variants={fadeUp} className="mb-4">
            <button
              onClick={() => navigate("/packages")}
              className="w-full py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-2xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-blue-200/50 active:scale-[0.98] transition-transform"
            >
              Upgrade to Earn Referral Rewards
              <ArrowRight className="w-4 h-4" />
            </button>
            <p className="text-[10px] text-gray-400 text-center mt-2">
              Referral rewards are available for paid plan subscribers
            </p>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
