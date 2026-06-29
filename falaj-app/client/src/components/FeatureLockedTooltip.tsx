/**
 * FeatureLockedTooltip — Appears when free-tier users tap a premium feature
 * Shows feature name, required tier, and one-tap upgrade/trial buttons
 * Design: Professional glass-morphism tooltip with smooth animation
 */
import { useState, useRef, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import { Lock, Zap, Crown, Sparkles, X, ArrowRight } from "lucide-react";
import { useAppState, PackageFeatures, PACKAGE_TIERS, PackageTier } from "@/contexts/AppStateContext";

// Feature descriptions for tooltips
const FEATURE_DESCRIPTIONS: Partial<Record<keyof PackageFeatures, string>> = {
  aiAssistant: "Get AI-powered farming advice from Obaid, your personal farm advisor",
  voiceCommands: "Control your farm hands-free with voice commands",
  dailyPlanner: "Auto-generated daily farm tasks based on sensor data and weather",
  cropPlanning: "AI-optimized crop rotation, planting schedules, and yield predictions",
  b2bSupplyChain: "Connect directly with hotels, hospitals, and airlines for bulk orders",
  financialDashboard: "Track revenue, expenses, P&L, and cash flow forecasting",
  logistics: "Real-time delivery tracking, fleet management, and route optimization",
  governmentReports: "Generate compliance reports for government agricultural programs",
  calibration: "Professional sensor calibration wizard for accurate readings",
  customThresholds: "Set custom alert thresholds per zone based on crop requirements",
  automatedIrrigation: "AI-controlled irrigation that adjusts to real-time soil conditions",
  supplyNotifications: "Get instant alerts when buyers post matching demand requests",
  exportReports: "Export detailed farm reports as PDF, CSV, or Excel files",
  prioritySupport: "24/7 priority support with dedicated account manager",
};

// Find the cheapest tier that includes this feature
function getMinTierForFeature(feature: keyof PackageFeatures): PackageTier {
  const tiers: PackageTier[] = ["seedling", "harvest", "falaj_elite"];
  for (const tier of tiers) {
    const val = PACKAGE_TIERS[tier].features[feature];
    if (typeof val === "boolean" && val) return tier;
    if (typeof val === "number" && val !== 0) return tier;
    if (typeof val === "string") return tier;
  }
  return "falaj_elite";
}

const tierIcons: Record<PackageTier, typeof Zap> = {
  seedling: Sparkles,
  harvest: Zap,
  falaj_elite: Crown,
};

interface FeatureLockedTooltipProps {
  feature: keyof PackageFeatures;
  children: ReactNode;
  /** Position of the tooltip */
  position?: "top" | "bottom" | "center";
}

export default function FeatureLockedTooltip({ feature, children, position = "center" }: FeatureLockedTooltipProps) {
  const [, navigate] = useLocation();
  const { hasFeature, user, startTrial } = useAppState();
  const [showTooltip, setShowTooltip] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!showTooltip) return;
    const handler = (e: MouseEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showTooltip]);

  // If user has the feature, just render children normally
  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  const minTier = getMinTierForFeature(feature);
  const tierInfo = PACKAGE_TIERS[minTier];
  const TierIcon = tierIcons[minTier];
  const description = FEATURE_DESCRIPTIONS[feature] || `This feature requires ${tierInfo.name}`;
  const canTrial = !user.trialUsed && minTier === "harvest";

  const handleTap = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setShowTooltip(true);
  };

  const handleStartTrial = () => {
    startTrial();
    setShowTooltip(false);
  };

  const handleUpgrade = () => {
    setShowTooltip(false);
    navigate("/packages");
  };

  const positionClasses = {
    top: "bottom-full mb-3 left-1/2 -translate-x-1/2",
    bottom: "top-full mt-3 left-1/2 -translate-x-1/2",
    center: "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
  };

  return (
    <div className="relative" ref={tooltipRef}>
      {/* Wrapped content — tappable but locked */}
      <div
        onClick={handleTap}
        onTouchEnd={handleTap}
        className="cursor-pointer relative"
      >
        {/* Slight opacity to indicate locked state */}
        <div className="opacity-60 pointer-events-none select-none">
          {children}
        </div>
        {/* Lock overlay badge */}
        <div className="absolute top-2 right-2 bg-white/90 backdrop-blur-sm rounded-full p-1.5 shadow-sm border border-gray-200/50">
          <Lock className="w-3.5 h-3.5 text-gray-400" />
        </div>
      </div>

      {/* Tooltip popup */}
      {showTooltip && (
        <>
          {/* Backdrop for center position */}
          {position === "center" && (
            <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setShowTooltip(false)} />
          )}
          <div
            className={`${
              position === "center"
                ? "fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-[calc(100%-2rem)] max-w-sm"
                : `absolute z-50 w-72 ${positionClasses[position]}`
            }`}
          >
            <div className="bg-white rounded-2xl shadow-2xl shadow-black/15 border border-gray-200/60 overflow-hidden">
              {/* Header */}
              <div className={`px-4 pt-4 pb-3 ${
                minTier === "falaj_elite"
                  ? "bg-gradient-to-r from-amber-50 to-orange-50"
                  : "bg-gradient-to-r from-blue-50 to-cyan-50"
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2.5">
                    <div className={`p-2 rounded-xl ${
                      minTier === "falaj_elite" ? "bg-amber-100" : "bg-blue-100"
                    }`}>
                      <TierIcon className={`w-5 h-5 ${
                        minTier === "falaj_elite" ? "text-amber-600" : "text-blue-600"
                      }`} />
                    </div>
                    <div>
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                        {tierInfo.name} Feature
                      </p>
                      <p className="text-sm font-bold text-gray-900 mt-0.5">
                        Premium Required
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTooltip(false)}
                    className="p-1 rounded-lg hover:bg-black/5 transition-colors"
                  >
                    <X className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>

              {/* Body */}
              <div className="px-4 py-3">
                <p className="text-sm text-gray-600 leading-relaxed">
                  {description}
                </p>
                <p className="text-xs text-gray-400 mt-2">
                  Available in <strong className={
                    minTier === "falaj_elite" ? "text-amber-600" : "text-blue-600"
                  }>{tierInfo.name}</strong>
                  {tierInfo.price > 0 && ` — from ${tierInfo.price} AED/mo`}
                </p>
              </div>

              {/* Actions */}
              <div className="px-4 pb-4 space-y-2">
                {/* Trial button — only if eligible */}
                {canTrial && (
                  <button
                    onClick={handleStartTrial}
                    className="w-full py-3 bg-gradient-to-r from-emerald-500 to-teal-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/50 active:scale-[0.98] transition-transform"
                  >
                    <Sparkles className="w-4 h-4" />
                    Start 14-Day Free Trial
                  </button>
                )}

                {/* Upgrade button */}
                <button
                  onClick={handleUpgrade}
                  className={`w-full py-3 rounded-xl text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition-transform ${
                    canTrial
                      ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      : minTier === "falaj_elite"
                      ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-lg shadow-amber-200/50"
                      : "bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg shadow-blue-200/50"
                  }`}
                >
                  {canTrial ? "View All Plans" : "Upgrade Now"}
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * Inline lock indicator for nav items and list items
 * Shows a small lock + tier badge when feature is locked
 */
export function InlineLockBadge({ feature }: { feature: keyof PackageFeatures }) {
  const { hasFeature } = useAppState();
  const [, navigate] = useLocation();

  if (hasFeature(feature)) return null;

  const minTier = getMinTierForFeature(feature);
  const tierInfo = PACKAGE_TIERS[minTier];

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        navigate("/packages");
      }}
      className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
        minTier === "falaj_elite"
          ? "bg-amber-50 text-amber-600"
          : "bg-blue-50 text-blue-600"
      }`}
    >
      <Lock className="w-2.5 h-2.5" />
      {tierInfo.name}
    </button>
  );
}
