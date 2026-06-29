/**
 * FeatureGate — Wraps features that require a specific package tier
 * Shows an upgrade prompt when the user's package doesn't include the feature
 */
import { ReactNode } from "react";
import { useLocation } from "wouter";
import { Lock, ArrowRight } from "lucide-react";
import { useAppState, PackageFeatures, PACKAGE_TIERS, PackageTier } from "@/contexts/AppStateContext";

interface FeatureGateProps {
  feature: keyof PackageFeatures;
  children: ReactNode;
  /** Compact mode shows a small lock icon inline instead of full overlay */
  compact?: boolean;
  /** Custom message for the upgrade prompt */
  message?: string;
}

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

export default function FeatureGate({ feature, children, compact, message }: FeatureGateProps) {
  const [, navigate] = useLocation();
  const { hasFeature } = useAppState();

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  const minTier = getMinTierForFeature(feature);
  const tierInfo = PACKAGE_TIERS[minTier];

  if (compact) {
    return (
      <button
        onClick={() => navigate("/packages")}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-emerald-600 transition-colors"
      >
        <Lock className="w-3.5 h-3.5" />
        <span>{tierInfo.name}+</span>
      </button>
    );
  }

  return (
    <div className="relative">
      {/* Blurred content behind */}
      <div className="blur-sm opacity-40 pointer-events-none select-none">
        {children}
      </div>

      {/* Upgrade overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-white/95 backdrop-blur-sm rounded-2xl p-5 mx-4 border border-gray-200 shadow-lg max-w-sm text-center">
          <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-emerald-600" />
          </div>
          <h3 className="font-bold text-gray-900 text-sm mb-1">
            {message || `Upgrade to ${tierInfo.name}`}
          </h3>
          <p className="text-xs text-gray-500 mb-4">
            This feature requires the {tierInfo.name} plan or higher.
            {tierInfo.price > 0 && ` Starting at ${tierInfo.price} AED/month.`}
          </p>
          <button
            onClick={() => navigate("/packages")}
            className="w-full py-2.5 bg-emerald-600 text-white rounded-xl text-sm font-semibold hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2"
          >
            View Plans <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/** Small inline lock badge for nav items */
export function LockBadge({ feature }: { feature: keyof PackageFeatures }) {
  const { hasFeature } = useAppState();
  if (hasFeature(feature)) return null;
  return (
    <span className="ml-1 inline-flex items-center">
      <Lock className="w-3 h-3 text-gray-400" />
    </span>
  );
}
