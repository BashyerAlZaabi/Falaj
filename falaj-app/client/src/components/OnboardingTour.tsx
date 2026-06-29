/**
 * OnboardingTour — Guided walkthrough for new trial users
 * Highlights premium features they just unlocked
 * Shows as a full-screen overlay with step-by-step cards
 * Persists "seen" state in localStorage
 */
import { useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState } from "@/contexts/AppStateContext";
import {
  X, ArrowRight, ArrowLeft, Sparkles, Bot, BarChart3,
  Sprout, Truck, ShoppingBag, Radio, Crown, Check,
  Zap, ChevronRight
} from "lucide-react";

interface TourStep {
  id: string;
  title: string;
  description: string;
  icon: typeof Sparkles;
  iconBg: string;
  iconColor: string;
  feature: string;
  route: string;
  image?: string;
}

const tourSteps: TourStep[] = [
  {
    id: "welcome",
    title: "Welcome to Harvest Pro!",
    description: "You've unlocked powerful premium features. Let's take a quick tour of what's now available to you.",
    icon: Crown,
    iconBg: "bg-amber-100",
    iconColor: "text-amber-600",
    feature: "Premium Access",
    route: "/dashboard",
  },
  {
    id: "ai-assistant",
    title: "AI Farming Assistant",
    description: "Ask Obaid anything — crop analysis, pest detection, irrigation schedules, market prices. Your personal AI agronomist is ready 24/7.",
    icon: Bot,
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    feature: "AI Assistant",
    route: "/ai-assistant",
  },
  {
    id: "crop-planning",
    title: "Smart Crop Planning",
    description: "Plan your entire growing season with AI-optimized schedules. Get recommendations for planting, harvesting, and rotation based on UAE climate data.",
    icon: Sprout,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    feature: "Crop Planning",
    route: "/crop-planning",
  },
  {
    id: "financial-dashboard",
    title: "Financial Dashboard",
    description: "Track revenue, expenses, and profitability across all your farm operations. Get AI-powered financial insights and forecasts.",
    icon: BarChart3,
    iconBg: "bg-purple-100",
    iconColor: "text-purple-600",
    feature: "Financial Analytics",
    route: "/financials",
  },
  {
    id: "advanced-sensors",
    title: "Advanced Sensor Analytics",
    description: "Unlock detailed sensor history, predictive alerts, and zone-by-zone analytics. Set custom thresholds for every crop type.",
    icon: Radio,
    iconBg: "bg-cyan-100",
    iconColor: "text-cyan-600",
    feature: "Sensor Analytics",
    route: "/smart-sensors",
  },
  {
    id: "marketplace-pro",
    title: "Priority Marketplace",
    description: "Your listings get featured placement. Access bulk pricing tools and connect with premium buyers across the UAE.",
    icon: ShoppingBag,
    iconBg: "bg-orange-100",
    iconColor: "text-orange-600",
    feature: "Priority Listings",
    route: "/marketplace",
  },
  {
    id: "done",
    title: "You're All Set!",
    description: "Explore these features at your own pace. Your 14-day trial gives you full access. Need help? Ask Obaid anytime.",
    icon: Sparkles,
    iconBg: "bg-emerald-100",
    iconColor: "text-emerald-600",
    feature: "All Features",
    route: "/dashboard",
  },
];

const STORAGE_KEY = "falaj-onboarding-seen";

export default function OnboardingTour() {
  const [, navigate] = useLocation();
  const { user } = useAppState();
  const [visible, setVisible] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    // Show tour only for trial users who haven't seen it
    if (user.trialActive && !localStorage.getItem(STORAGE_KEY)) {
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
  }, [user.trialActive]);

  const handleClose = useCallback(() => {
    setVisible(false);
    localStorage.setItem(STORAGE_KEY, "true");
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < tourSteps.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      handleClose();
    }
  }, [currentStep, handleClose]);

  const handlePrev = useCallback(() => {
    setCurrentStep(prev => Math.max(0, prev - 1));
  }, []);

  const handleGoToFeature = useCallback((route: string) => {
    handleClose();
    navigate(route);
  }, [navigate, handleClose]);

  if (!visible) return null;

  const step = tourSteps[currentStep];
  const Icon = step.icon;
  const isLast = currentStep === tourSteps.length - 1;
  const isFirst = currentStep === 0;
  const progress = ((currentStep + 1) / tourSteps.length) * 100;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={handleClose} />

          {/* Tour Card */}
          <motion.div
            initial={{ opacity: 0, y: 100, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 100, scale: 0.95 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="relative w-full max-w-[420px] mx-2 mb-2 sm:mb-0"
          >
            <div className="bg-white rounded-3xl overflow-hidden shadow-2xl">
              {/* Progress bar */}
              <div className="h-1 bg-gray-100">
                <motion.div
                  className="h-full bg-gradient-to-r from-emerald-500 to-green-500"
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>

              {/* Close button */}
              <button
                onClick={handleClose}
                className="absolute top-4 right-4 p-2 rounded-xl bg-gray-100 hover:bg-gray-200 transition-colors z-10"
              >
                <X className="w-4 h-4 text-gray-500" />
              </button>

              {/* Step indicator */}
              <div className="px-6 pt-5 pb-0">
                <div className="flex items-center gap-1.5">
                  <Zap className="w-3 h-3 text-emerald-500" />
                  <span className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider">
                    Step {currentStep + 1} of {tourSteps.length}
                  </span>
                </div>
              </div>

              {/* Content */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={step.id}
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.25 }}
                  className="px-6 pt-4 pb-6"
                >
                  {/* Icon */}
                  <div className={`w-16 h-16 rounded-2xl ${step.iconBg} flex items-center justify-center mb-4`}>
                    <Icon className={`w-8 h-8 ${step.iconColor}`} />
                  </div>

                  {/* Feature badge */}
                  <div className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-bold mb-3">
                    <Sparkles className="w-3 h-3" />
                    {step.feature}
                  </div>

                  <h3 className="text-xl font-bold tracking-tight mb-2">{step.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{step.description}</p>

                  {/* Try it button (not on first/last) */}
                  {!isFirst && !isLast && (
                    <button
                      onClick={() => handleGoToFeature(step.route)}
                      className="mt-4 flex items-center gap-1.5 text-xs font-semibold text-emerald-600 hover:text-emerald-700 transition-colors"
                    >
                      Try it now
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  )}
                </motion.div>
              </AnimatePresence>

              {/* Navigation */}
              <div className="px-6 pb-6 flex items-center gap-3">
                {!isFirst && (
                  <button
                    onClick={handlePrev}
                    className="p-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all active:scale-95"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                )}

                <button
                  onClick={handleNext}
                  className="flex-1 py-3.5 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-sm font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/40 active:scale-[0.98] transition-transform"
                >
                  {isLast ? (
                    <>
                      <Check className="w-4 h-4" />
                      Start Exploring
                    </>
                  ) : (
                    <>
                      Next
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </button>

                {!isLast && (
                  <button
                    onClick={handleClose}
                    className="text-xs text-muted-foreground font-medium hover:text-foreground transition-colors whitespace-nowrap"
                  >
                    Skip
                  </button>
                )}
              </div>

              {/* Step dots */}
              <div className="flex items-center justify-center gap-1.5 pb-5">
                {tourSteps.map((_, i) => (
                  <div
                    key={i}
                    className={`h-1.5 rounded-full transition-all ${
                      i === currentStep ? "w-6 bg-emerald-500" : i < currentStep ? "w-1.5 bg-emerald-300" : "w-1.5 bg-gray-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
