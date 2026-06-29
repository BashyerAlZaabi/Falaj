/**
 * TrialReminder — In-app push notification reminders for trial expiry
 * Shows contextual banners at 3 days, 1 day, and expiry
 * Auto-dismisses, persists dismissed state per session
 */
import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "@/contexts/AppStateContext";
import {
  Clock, Sparkles, AlertTriangle, X, ArrowRight, Bell, Zap
} from "lucide-react";

type ReminderLevel = "info" | "warning" | "urgent" | "expired" | null;

export default function TrialReminder() {
  const [, navigate] = useLocation();
  const { user, trialDaysLeft, isTrialExpired } = useAppState();
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [showBanner, setShowBanner] = useState(false);

  const daysLeft = trialDaysLeft();
  const expired = isTrialExpired();

  const reminderLevel: ReminderLevel = useMemo(() => {
    if (!user.trialActive) return null;
    if (expired) return "expired";
    if (daysLeft <= 1) return "urgent";
    if (daysLeft <= 3) return "warning";
    if (daysLeft <= 7) return "info";
    return null;
  }, [user.trialActive, expired, daysLeft]);

  const reminderKey = `trial-${reminderLevel}-${daysLeft}`;

  useEffect(() => {
    if (reminderLevel && !dismissed.has(reminderKey)) {
      // Small delay so it appears after page load
      const timer = setTimeout(() => setShowBanner(true), 1500);
      return () => clearTimeout(timer);
    } else {
      setShowBanner(false);
    }
  }, [reminderLevel, reminderKey, dismissed]);

  const handleDismiss = () => {
    setShowBanner(false);
    setDismissed(prev => new Set(prev).add(reminderKey));
  };

  const handleUpgrade = () => {
    setShowBanner(false);
    navigate("/packages");
  };

  if (!reminderLevel || !showBanner) return null;

  const config = {
    info: {
      icon: Sparkles,
      title: `${daysLeft} days left on your trial`,
      message: "Enjoying Harvest Pro? Subscribe now to keep all premium features.",
      bg: "from-blue-600 to-blue-700",
      iconBg: "bg-blue-500",
      btnText: "View Plans",
      btnStyle: "bg-white/20 hover:bg-white/30",
    },
    warning: {
      icon: Clock,
      title: `Only ${daysLeft} day${daysLeft > 1 ? "s" : ""} left!`,
      message: "Your Harvest Pro trial is ending soon. Don't lose access to AI insights, crop planning, and more.",
      bg: "from-amber-500 to-orange-600",
      iconBg: "bg-amber-400",
      btnText: "Subscribe Now",
      btnStyle: "bg-white text-amber-700 hover:bg-white/90 shadow-lg",
    },
    urgent: {
      icon: AlertTriangle,
      title: "Trial expires today!",
      message: "This is your last day with Harvest Pro. Subscribe now to avoid losing your premium features.",
      bg: "from-red-500 to-red-600",
      iconBg: "bg-red-400",
      btnText: "Subscribe Now",
      btnStyle: "bg-white text-red-700 hover:bg-white/90 shadow-lg",
    },
    expired: {
      icon: AlertTriangle,
      title: "Your trial has expired",
      message: "You've been moved back to the Seedling plan. Upgrade to restore premium features.",
      bg: "from-gray-700 to-gray-800",
      iconBg: "bg-gray-600",
      btnText: "Upgrade Now",
      btnStyle: "bg-emerald-500 text-white hover:bg-emerald-600 shadow-lg",
    },
  };

  const c = config[reminderLevel];
  const Icon = c.icon;

  return (
    <AnimatePresence>
      {showBanner && (
        <motion.div
          initial={{ opacity: 0, y: -80, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -80, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed top-2 left-2 right-2 z-[100] max-w-[480px] mx-auto"
        >
          <div className={`bg-gradient-to-r ${c.bg} rounded-2xl p-4 text-white shadow-2xl shadow-black/20`}>
            {/* Close button */}
            <button
              onClick={handleDismiss}
              className="absolute top-3 right-3 p-1 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>

            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className={`p-2.5 rounded-xl ${c.iconBg}/30 shrink-0`}>
                <Icon className="w-5 h-5" />
              </div>

              <div className="flex-1 min-w-0">
                {/* Notification label */}
                <div className="flex items-center gap-1.5 mb-1">
                  <Bell className="w-3 h-3 text-white/60" />
                  <span className="text-[9px] font-bold text-white/60 uppercase tracking-wider">Trial Reminder</span>
                </div>

                <p className="text-sm font-bold leading-tight">{c.title}</p>
                <p className="text-xs text-white/70 mt-1 leading-relaxed">{c.message}</p>

                {/* Action button */}
                <button
                  onClick={handleUpgrade}
                  className={`mt-3 px-4 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all active:scale-[0.97] ${c.btnStyle}`}
                >
                  <Zap className="w-3.5 h-3.5" />
                  {c.btnText}
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {/* Progress bar for non-expired */}
            {reminderLevel !== "expired" && (
              <div className="mt-3 h-1 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${Math.max(0, ((14 - daysLeft) / 14) * 100)}%` }}
                  transition={{ duration: 1, delay: 0.5 }}
                  className="h-full bg-white/40 rounded-full"
                />
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
