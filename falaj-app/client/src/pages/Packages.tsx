/**
 * FALAJ Packages — Subscription tier selection with 14-day trial
 * Design: Professional, clean pricing page with feature comparison
 * Colors: Emerald/green theme consistent with app
 */
import { useState } from "react";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  ChevronLeft, Check, X, Crown, Sprout, Zap, Shield, Star,
  ArrowRight, Sparkles, Clock, Gift, Users
} from "lucide-react";
import { useAppState, PACKAGE_TIERS, PackageTier, PackageFeatures } from "@/contexts/AppStateContext";
import { toast } from "sonner";

const featureLabels: { key: keyof PackageFeatures; label: string; labelAr: string; category: string }[] = [
  { key: "maxZones", label: "Farm Zones", labelAr: "مناطق المزرعة", category: "Farm" },
  { key: "maxSensorNodes", label: "Sensor Nodes", labelAr: "عقد الاستشعار", category: "Farm" },
  { key: "maxValves", label: "Smart Valves", labelAr: "الصمامات الذكية", category: "Farm" },
  { key: "automatedIrrigation", label: "Automated Irrigation", labelAr: "الري الآلي", category: "Farm" },
  { key: "customThresholds", label: "Custom Thresholds", labelAr: "حدود مخصصة", category: "Farm" },
  { key: "calibration", label: "Sensor Calibration", labelAr: "معايرة المستشعرات", category: "Farm" },
  { key: "sensorHistory", label: "Sensor History", labelAr: "سجل المستشعرات", category: "Farm" },
  { key: "aiAssistant", label: "Obaid AI Assistant", labelAr: "مساعد عبيد الذكي", category: "AI" },
  { key: "voiceCommands", label: "Voice Commands", labelAr: "الأوامر الصوتية", category: "AI" },
  { key: "dailyPlanner", label: "Daily Farm Planner", labelAr: "مخطط المزرعة اليومي", category: "AI" },
  { key: "cropPlanning", label: "AI Crop Planning", labelAr: "تخطيط المحاصيل بالذكاء", category: "AI" },
  { key: "marketplace", label: "Marketplace Access", labelAr: "الوصول للسوق", category: "Trade" },
  { key: "marketplaceListings", label: "Product Listings", labelAr: "قوائم المنتجات", category: "Trade" },
  { key: "b2bSupplyChain", label: "B2B Supply Chain", labelAr: "سلسلة التوريد", category: "Trade" },
  { key: "supplyNotifications", label: "Demand Alerts", labelAr: "تنبيهات الطلب", category: "Trade" },
  { key: "financialDashboard", label: "Financial Dashboard", labelAr: "لوحة المالية", category: "Finance" },
  { key: "logistics", label: "Logistics Tracking", labelAr: "تتبع اللوجستيات", category: "Finance" },
  { key: "exportReports", label: "Export Reports", labelAr: "تصدير التقارير", category: "Finance" },
  { key: "governmentReports", label: "Government Reports", labelAr: "تقارير حكومية", category: "Finance" },
  { key: "rewardsMultiplier", label: "XP Multiplier", labelAr: "مضاعف النقاط", category: "Rewards" },
  { key: "prioritySupport", label: "Priority Support", labelAr: "دعم أولوي", category: "Support" },
];

const tierIcons: Record<PackageTier, typeof Sprout> = {
  seedling: Sprout,
  harvest: Zap,
  falaj_elite: Crown,
};

const tierColors: Record<PackageTier, { bg: string; border: string; text: string; badge: string }> = {
  seedling: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", badge: "bg-emerald-100 text-emerald-700" },
  harvest: { bg: "bg-blue-50", border: "border-blue-400", text: "text-blue-700", badge: "bg-blue-100 text-blue-700" },
  falaj_elite: { bg: "bg-amber-50", border: "border-amber-400", text: "text-amber-700", badge: "bg-amber-100 text-amber-800" },
};

const fadeUp = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.25 } } };

export default function Packages() {
  const [, navigate] = useLocation();
  const { user, upgradePackage, startTrial, trialDaysLeft, isTrialExpired } = useAppState();
  const [billing, setBilling] = useState<"monthly" | "yearly">("yearly");
  const [selectedTier, setSelectedTier] = useState<PackageTier | null>(null);
  const [showCheckout, setShowCheckout] = useState(false);
  const [showComparison, setShowComparison] = useState(false);

  const currentPkg = user.package || "seedling";
  const daysLeft = trialDaysLeft();
  const trialExpired = isTrialExpired();

  const handleSelectTier = (tier: PackageTier) => {
    if (tier === currentPkg && !user.trialActive) return;
    setSelectedTier(tier);
    if (tier === "seedling") {
      upgradePackage(tier, billing);
      navigate("/dashboard");
    } else {
      setShowCheckout(true);
    }
  };

  const handleStartTrial = () => {
    startTrial();
    toast.success("Your 14-day Harvest Pro trial has started!");
    navigate("/dashboard");
  };

  const handleConfirmUpgrade = () => {
    if (selectedTier) {
      upgradePackage(selectedTier, billing);
      setShowCheckout(false);
      toast.success(`Upgraded to ${PACKAGE_TIERS[selectedTier].name}!`);
      navigate("/dashboard");
    }
  };

  const formatFeatureValue = (key: keyof PackageFeatures, value: boolean | number | string) => {
    if (typeof value === "boolean") return value;
    if (key === "marketplaceListings") return value === -1 ? "Unlimited" : `${value}`;
    if (key === "maxZones" || key === "maxSensorNodes" || key === "maxValves") return `${value}`;
    if (key === "rewardsMultiplier") return `${value}x`;
    if (key === "sensorHistory") return value === "unlimited" ? "Unlimited" : `${value}`;
    return value;
  };

  const tiers = Object.entries(PACKAGE_TIERS) as [PackageTier, typeof PACKAGE_TIERS[PackageTier]][];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => navigate(-1 as any)} className="p-2 hover:bg-gray-100 rounded-xl transition-colors">
            <ChevronLeft className="w-5 h-5 text-gray-600" />
          </button>
          <h1 className="text-xl font-bold text-gray-900">Choose Your Plan</h1>
        </div>
        <p className="text-sm text-gray-500 ml-10">Select the package that fits your farm's needs</p>
      </div>

      {/* Trial Banner — Active Trial */}
      {user.trialActive && !trialExpired && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4"
        >
          <div className="bg-gradient-to-r from-emerald-500 to-teal-600 rounded-2xl p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Harvest Pro Trial Active</p>
                <p className="text-xs text-white/70 mt-0.5">
                  {daysLeft} day{daysLeft !== 1 ? "s" : ""} remaining — Subscribe to keep all features
                </p>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-white/15 rounded-full overflow-hidden">
              <div
                className="h-full bg-white/60 rounded-full transition-all duration-500"
                style={{ width: `${((14 - daysLeft) / 14) * 100}%` }}
              />
            </div>
          </div>
        </motion.div>
      )}

      {/* Trial Banner — Expired */}
      {user.trialActive && trialExpired && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mx-4 mt-4"
        >
          <div className="bg-gradient-to-r from-red-500 to-rose-600 rounded-2xl p-4 text-white">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/15 backdrop-blur-sm">
                <Clock className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Trial Expired</p>
                <p className="text-xs text-white/70 mt-0.5">
                  Subscribe now to keep your Harvest Pro features
                </p>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Referral Link */}
      <div className="px-4 pt-4">
        <button
          onClick={() => navigate("/referrals")}
          className="w-full flex items-center gap-3 bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200/50 rounded-xl p-3.5 hover:shadow-md transition-all active:scale-[0.99]"
        >
          <div className="p-2 rounded-xl bg-emerald-100">
            <Users className="w-4.5 h-4.5 text-emerald-600" />
          </div>
          <div className="flex-1 text-left">
            <p className="text-sm font-semibold text-emerald-900">Refer & Earn Free Months</p>
            <p className="text-[10px] text-emerald-600/70">Get 1 free month for each friend who subscribes</p>
          </div>
          <ArrowRight className="w-4 h-4 text-emerald-400" />
        </button>
      </div>

      {/* Billing Toggle */}
      <div className="px-4 pt-5 pb-2">
        <div className="flex items-center justify-center gap-2 bg-white rounded-2xl p-1.5 border border-gray-200 max-w-xs mx-auto">
          <button
            onClick={() => setBilling("monthly")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all ${
              billing === "monthly" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500"
            }`}
          >
            Monthly
          </button>
          <button
            onClick={() => setBilling("yearly")}
            className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-medium transition-all relative ${
              billing === "yearly" ? "bg-emerald-600 text-white shadow-sm" : "text-gray-500"
            }`}
          >
            Yearly
            <span className="absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              -17%
            </span>
          </button>
        </div>
      </div>

      {/* Package Cards */}
      <div className="px-4 pt-4 space-y-4">
        {tiers.map(([tier, pkg]) => {
          const Icon = tierIcons[tier];
          const colors = tierColors[tier];
          const isCurrent = tier === currentPkg && !user.trialActive;
          const isTrialTier = user.trialActive && tier === "harvest";
          const price = billing === "yearly" ? Math.round(pkg.yearlyPrice / 12) : pkg.price;
          const isPopular = tier === "harvest";
          const canStartTrial = tier === "harvest" && !user.trialUsed && currentPkg === "seedling";

          return (
            <motion.div
              key={tier}
              variants={fadeUp}
              initial="hidden"
              animate="show"
              className={`relative rounded-2xl border-2 overflow-hidden transition-all ${
                isCurrent ? `${colors.border} ${colors.bg}` : isTrialTier ? "border-emerald-400 bg-emerald-50/30 ring-1 ring-emerald-200" : "border-gray-200 bg-white"
              } ${isPopular && !isCurrent && !isTrialTier ? "border-blue-400 ring-1 ring-blue-200" : ""}`}
            >
              {/* Popular Badge */}
              {isPopular && !isCurrent && !isTrialTier && (
                <div className="absolute top-0 right-0 bg-blue-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl">
                  MOST POPULAR
                </div>
              )}

              {/* Current Badge */}
              {isCurrent && (
                <div className={`absolute top-0 right-0 ${colors.badge} text-[10px] font-bold px-3 py-1 rounded-bl-xl`}>
                  CURRENT PLAN
                </div>
              )}

              {/* Trial Badge */}
              {isTrialTier && (
                <div className="absolute top-0 right-0 bg-emerald-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  TRIAL — {daysLeft}d LEFT
                </div>
              )}

              <div className="p-5">
                {/* Tier Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className={`p-2.5 rounded-xl ${colors.bg}`}>
                    <Icon className={`w-5 h-5 ${colors.text}`} />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900 text-lg">{pkg.name}</h3>
                    <p className="text-xs text-gray-500 mt-0.5">{pkg.tagline}</p>
                  </div>
                </div>

                {/* Price */}
                <div className="mb-4">
                  {price === 0 ? (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-gray-900">Free</span>
                      <span className="text-sm text-gray-400">forever</span>
                    </div>
                  ) : (
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-gray-900">{price}</span>
                      <span className="text-sm text-gray-500">AED/mo</span>
                      {billing === "yearly" && (
                        <span className="text-xs text-gray-400 line-through ml-2">{pkg.price} AED/mo</span>
                      )}
                    </div>
                  )}
                  {billing === "yearly" && price > 0 && (
                    <p className="text-xs text-emerald-600 mt-1">Billed {pkg.yearlyPrice} AED/year</p>
                  )}
                </div>

                {/* Key Features */}
                <div className="space-y-2 mb-4">
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>Up to <strong>{pkg.features.maxZones}</strong> farm zones</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-gray-700">
                    <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                    <span>Up to <strong>{pkg.features.maxSensorNodes}</strong> sensor nodes</span>
                  </div>
                  {pkg.features.aiAssistant && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>Obaid AI Assistant + Voice</span>
                    </div>
                  )}
                  {pkg.features.cropPlanning && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>AI Crop Planning & Predictions</span>
                    </div>
                  )}
                  {pkg.features.b2bSupplyChain && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                      <span>B2B Supply Chain & Logistics</span>
                    </div>
                  )}
                  {pkg.features.prioritySupport && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Shield className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span>Priority 24/7 Support</span>
                    </div>
                  )}
                  {pkg.features.rewardsMultiplier > 1 && (
                    <div className="flex items-center gap-2 text-sm text-gray-700">
                      <Star className="w-4 h-4 text-amber-500 flex-shrink-0" />
                      <span><strong>{pkg.features.rewardsMultiplier}x</strong> XP Rewards Multiplier</span>
                    </div>
                  )}
                </div>

                {/* CTA Buttons */}
                <div className="space-y-2">
                  {/* Trial Button — Only for Harvest Pro when eligible */}
                  {canStartTrial && (
                    <button
                      onClick={handleStartTrial}
                      className="w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-200/50 active:scale-[0.98]"
                    >
                      <Sparkles className="w-4 h-4" />
                      Start 14-Day Free Trial
                    </button>
                  )}

                  {/* Main CTA */}
                  <button
                    onClick={() => handleSelectTier(tier)}
                    disabled={isCurrent}
                    className={`w-full py-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 ${
                      isCurrent
                        ? "bg-gray-100 text-gray-400 cursor-not-allowed"
                        : isTrialTier
                        ? "bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200"
                        : tier === "falaj_elite"
                        ? "bg-gradient-to-r from-amber-500 to-amber-600 text-white hover:from-amber-600 hover:to-amber-700 shadow-lg shadow-amber-200"
                        : tier === "harvest"
                        ? canStartTrial
                          ? "bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100"
                          : "bg-gradient-to-r from-blue-600 to-blue-700 text-white hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-200"
                        : "bg-emerald-600 text-white hover:bg-emerald-700"
                    }`}
                  >
                    {isCurrent
                      ? "Current Plan"
                      : isTrialTier
                      ? "Subscribe to Keep Features"
                      : canStartTrial
                      ? "Or Subscribe Now"
                      : tier === "seedling"
                      ? "Downgrade"
                      : "Upgrade Now"}
                    {!isCurrent && <ArrowRight className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </motion.div>
          );
        })}
      </div>

      {/* Compare All Features */}
      <div className="px-4 pt-6">
        <button
          onClick={() => setShowComparison(!showComparison)}
          className="w-full py-3 text-sm font-medium text-emerald-700 bg-emerald-50 rounded-xl hover:bg-emerald-100 transition-colors"
        >
          {showComparison ? "Hide" : "Compare"} All Features
        </button>
      </div>

      {/* Feature Comparison Table */}
      {showComparison && (
        <div className="px-4 pt-4 pb-8">
          <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
            {/* Table Header */}
            <div className="grid grid-cols-4 gap-0 border-b border-gray-200 bg-gray-50">
              <div className="p-3 text-xs font-medium text-gray-500">Feature</div>
              {tiers.map(([tier, pkg]) => (
                <div key={tier} className="p-3 text-center">
                  <span className={`text-xs font-bold ${tierColors[tier].text}`}>{pkg.name}</span>
                </div>
              ))}
            </div>

            {/* Feature Rows */}
            {(() => {
              let lastCategory = "";
              return featureLabels.map(({ key, label, category }) => {
                const showCategory = category !== lastCategory;
                lastCategory = category;
                return (
                  <div key={key}>
                    {showCategory && (
                      <div className="grid grid-cols-4 gap-0 bg-gray-50 border-t border-gray-100">
                        <div className="col-span-4 p-2 px-3 text-[10px] font-bold text-gray-400 uppercase tracking-wider">
                          {category}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-4 gap-0 border-t border-gray-100">
                      <div className="p-3 text-xs text-gray-700 flex items-center">{label}</div>
                      {tiers.map(([tier, pkg]) => {
                        const val = formatFeatureValue(key, pkg.features[key]);
                        return (
                          <div key={tier} className="p-3 flex items-center justify-center">
                            {typeof val === "boolean" ? (
                              val ? (
                                <Check className="w-4 h-4 text-emerald-500" />
                              ) : (
                                <X className="w-4 h-4 text-gray-300" />
                              )
                            ) : (
                              <span className={`text-xs font-semibold ${tierColors[tier].text}`}>{val}</span>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      {/* Checkout Modal */}
      {showCheckout && selectedTier && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end justify-center">
          <div className="bg-white rounded-t-3xl w-full max-w-lg p-6 pb-8">
            <div className="w-12 h-1 bg-gray-300 rounded-full mx-auto mb-6" />
            
            <div className="text-center mb-6">
              <div className={`w-16 h-16 rounded-2xl ${tierColors[selectedTier].bg} flex items-center justify-center mx-auto mb-3`}>
                {(() => { const Icon = tierIcons[selectedTier]; return <Icon className={`w-8 h-8 ${tierColors[selectedTier].text}`} />; })()}
              </div>
              <h2 className="text-xl font-bold text-gray-900">
                {user.trialActive && selectedTier === "harvest"
                  ? "Subscribe to Harvest Pro"
                  : `Upgrade to ${PACKAGE_TIERS[selectedTier].name}`}
              </h2>
              <p className="text-sm text-gray-500 mt-1">{PACKAGE_TIERS[selectedTier].tagline}</p>
            </div>

            {/* Price Summary */}
            <div className="bg-gray-50 rounded-2xl p-4 mb-6">
              <div className="flex justify-between items-center mb-2">
                <span className="text-sm text-gray-600">{PACKAGE_TIERS[selectedTier].name} ({billing})</span>
                <span className="font-bold text-gray-900">
                  {billing === "yearly"
                    ? `${PACKAGE_TIERS[selectedTier].yearlyPrice} AED`
                    : `${PACKAGE_TIERS[selectedTier].price} AED/mo`}
                </span>
              </div>
              {billing === "yearly" && (
                <div className="flex justify-between items-center text-xs">
                  <span className="text-emerald-600">Annual savings</span>
                  <span className="text-emerald-600 font-semibold">
                    Save {PACKAGE_TIERS[selectedTier].price * 12 - PACKAGE_TIERS[selectedTier].yearlyPrice} AED
                  </span>
                </div>
              )}
              {user.referredBy && (
                <div className="flex justify-between items-center text-xs mt-1 pt-1 border-t border-gray-200">
                  <span className="text-blue-600">Referral discount (first month)</span>
                  <span className="text-blue-600 font-semibold">-10%</span>
                </div>
              )}
            </div>

            {/* Payment Methods */}
            <div className="space-y-3 mb-6">
              <h3 className="text-sm font-semibold text-gray-700">Payment Method</h3>
              <div className="flex gap-3">
                <button className="flex-1 py-3 px-4 rounded-xl border-2 border-emerald-500 bg-emerald-50 text-sm font-medium text-emerald-700">
                  Card
                </button>
                <button className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-500">
                  Apple Pay
                </button>
                <button className="flex-1 py-3 px-4 rounded-xl border-2 border-gray-200 text-sm font-medium text-gray-500">
                  Bank
                </button>
              </div>
            </div>

            {/* Card Input Placeholder */}
            <div className="bg-gray-50 rounded-xl p-4 mb-6 border border-gray-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-7 bg-gradient-to-r from-blue-600 to-blue-800 rounded-md" />
                <div className="flex-1">
                  <p className="text-sm font-medium text-gray-700">**** **** **** 4242</p>
                  <p className="text-xs text-gray-400">Expires 12/27</p>
                </div>
                <Check className="w-5 h-5 text-emerald-500" />
              </div>
            </div>

            {/* Confirm Button */}
            <button
              onClick={handleConfirmUpgrade}
              className={`w-full py-4 rounded-xl font-bold text-white text-sm transition-all active:scale-[0.98] ${
                selectedTier === "falaj_elite"
                  ? "bg-gradient-to-r from-amber-500 to-amber-600 shadow-lg shadow-amber-200"
                  : "bg-gradient-to-r from-blue-600 to-blue-700 shadow-lg shadow-blue-200"
              }`}
            >
              Confirm & Subscribe
            </button>

            <button
              onClick={() => setShowCheckout(false)}
              className="w-full py-3 mt-2 text-sm text-gray-500 hover:text-gray-700"
            >
              Cancel
            </button>

            <p className="text-[10px] text-gray-400 text-center mt-3">
              Cancel anytime. Secure payment powered by Stripe. VAT included.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
