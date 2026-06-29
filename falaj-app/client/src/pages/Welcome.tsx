/*
 * FALAJ Welcome — Onboarding + Login (Mobile-first)
 * Design: Blue/Green/White — Zayed as the soul of the brand
 * Government Portal access on login page
 */
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Radio, ShoppingBag, Bot, ChevronRight, ChevronLeft, Landmark, ArrowLeft, Sprout, Zap, Crown, Check, ArrowRight } from "lucide-react";
import { useAppState, PACKAGE_TIERS, PackageTier } from "@/contexts/AppStateContext";

const FALAJ_LOGO_WHITE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Whitelogo-nobackground_f8f7fb2f.png";
const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";
const HERO_IMAGE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-field-walk-M4293F7Fdgn8LaecFz2jzf.webp";
const ZAYED_GREENHOUSE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-greenhouse-QU4TVeKaVMkWjRHTGcqBgn.webp";
const ZAYED_YOUNG_FARMERS = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-young-farmers-FJL5S2BTLaJof9X97vfdsa.webp";
const ZAYED_IRRIGATION = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-irrigation-AsWBrHPgZtR2T3N2bencmH.webp";

const onboardingSlides = [
  {
    icon: Radio,
    gradient: "from-emerald-600 to-teal-500",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    title: "Smart Sensors",
    titleAr: "مستشعرات ذكية",
    desc: "Monitor soil moisture, temperature, and humidity in real-time across all your farm zones.",
    descAr: "راقب رطوبة التربة ودرجة الحرارة والرطوبة في الوقت الفعلي عبر جميع مناطق مزرعتك.",
    image: ZAYED_GREENHOUSE,
  },
  {
    icon: Bot,
    gradient: "from-blue-600 to-sky-500",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    title: "AI-Powered Insights",
    titleAr: "رؤى مدعومة بالذكاء الاصطناعي",
    desc: "Get personalized crop recommendations, pest detection, and irrigation optimization powered by AI.",
    descAr: "احصل على توصيات محاصيل مخصصة واكتشاف الآفات وتحسين الري بالذكاء الاصطناعي.",
    image: ZAYED_YOUNG_FARMERS,
  },
  {
    icon: ShoppingBag,
    gradient: "from-green-600 to-emerald-500",
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    title: "Marketplace & Trade",
    titleAr: "السوق والتجارة",
    desc: "Buy, sell, and trade agricultural products. Access packaging, transportation, and trade licensing.",
    descAr: "اشترِ وبع وتاجر بالمنتجات الزراعية. الوصول إلى التعبئة والنقل وترخيص التجارة.",
    image: ZAYED_IRRIGATION,
  },
];

const tierIcons: Record<PackageTier, typeof Sprout> = { seedling: Sprout, harvest: Zap, falaj_elite: Crown };
const tierColors: Record<PackageTier, { gradient: string; text: string; bg: string }> = {
  seedling: { gradient: "from-emerald-500 to-green-500", text: "text-emerald-700", bg: "bg-emerald-50" },
  harvest: { gradient: "from-blue-500 to-sky-500", text: "text-blue-700", bg: "bg-blue-50" },
  falaj_elite: { gradient: "from-amber-500 to-orange-500", text: "text-amber-700", bg: "bg-amber-50" },
};

export default function Welcome() {
  const [, setLocation] = useLocation();
  const { upgradePackage } = useAppState();
  const [step, setStep] = useState<"hero" | "onboarding" | "packages" | "login">("hero");
  const [selectedPkg, setSelectedPkg] = useState<PackageTier>("harvest");

  // Zero bureaucracy: quick access function
  const quickAccess = () => setLocation("/dashboard");
  const [slideIndex, setSlideIndex] = useState(0);

  // Hero screen
  if (step === "hero") {
    return (
      <div className="min-h-screen flex flex-col bg-white relative overflow-hidden">
        {/* Back to landing */}
        <button
          onClick={() => setLocation("/")}
          className="absolute top-5 left-5 z-20 p-2 rounded-full bg-white/80 backdrop-blur-sm hover:bg-white transition-colors shadow-sm"
        >
          <ArrowLeft className="w-5 h-5 text-slate-700" />
        </button>

        {/* Hero image */}
        <div className="relative h-[60vh] overflow-hidden">
          <img
            src={HERO_IMAGE}
            alt="Zayed's Vision — Walking through the fields"
            className="w-full h-full object-cover object-top"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-white" />
          
          {/* Floating logo */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute top-6 left-0 right-0 flex justify-center"
          >
            <div className="bg-white/90 backdrop-blur-md px-5 py-2 rounded-2xl shadow-lg">
              <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-7" />
            </div>
          </motion.div>
        </div>

        {/* Content below image */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="flex-1 flex flex-col px-6 -mt-6 relative z-10"
        >
          {/* Zayed quote */}
          <div className="bg-gradient-to-r from-emerald-50 to-blue-50 rounded-2xl p-4 mb-5 border border-emerald-100/50">
            <p className="text-sm text-emerald-900/80 italic leading-relaxed text-center">
              "The real wealth of a nation lies in its soil and the hands that tend it."
            </p>
            <p className="text-[11px] text-emerald-700/60 text-center mt-1.5 font-medium">
              — Inspired by Sheikh Zayed's Vision
            </p>
          </div>

          <div className="text-center mb-4">
            <h1 className="text-2xl font-bold tracking-tight text-slate-900 mb-1.5" style={{ fontFamily: "'Playfair Display', serif" }}>
              Smart Agriculture
            </h1>
            <p className="text-muted-foreground text-sm leading-relaxed max-w-xs mx-auto">
              The future of farming in the UAE — powered by AI and IoT technology.
            </p>
          </div>

          <div className="flex flex-col gap-2.5 mt-auto mb-5">
            <Button
              size="lg"
              className="w-full h-13 text-base font-semibold rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
              onClick={() => setStep("onboarding")}
            >
              Get Started <ChevronRight className="w-5 h-5" />
            </Button>
            <Button
              variant="ghost"
              size="lg"
              className="w-full h-11 text-sm text-muted-foreground hover:text-emerald-700"
              onClick={() => setStep("login")}
            >
              I already have an account
            </Button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/50 mb-3">www.falajae.com</p>
        </motion.div>
      </div>
    );
  }

  // Onboarding slides
  if (step === "onboarding") {
    const slide = onboardingSlides[slideIndex];
    const Icon = slide.icon;
    return (
      <div className="min-h-screen flex flex-col bg-white">
        {/* Top bar */}
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <button onClick={() => slideIndex > 0 ? setSlideIndex(slideIndex - 1) : setStep("hero")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-5" />
          <button
            onClick={() => setStep("login")}
            className="text-sm font-medium text-emerald-600 hover:text-emerald-700 transition-colors px-3 py-1.5 rounded-lg"
          >
            Skip
          </button>
        </div>

        {/* Slide image */}
        <div className="px-5 pt-3">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.3 }}
              className="rounded-3xl overflow-hidden h-52 relative"
            >
              <img
                src={slide.image}
                alt={slide.title}
                className="w-full h-full object-cover"
              />
              <div className={`absolute inset-0 bg-gradient-to-t ${slide.gradient} opacity-10`} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Slide content */}
        <div className="flex-1 flex flex-col items-center justify-center px-8">
          <AnimatePresence mode="wait">
            <motion.div
              key={slideIndex}
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.3, delay: 0.1 }}
              className="flex flex-col items-center text-center"
            >
              <div className={`w-16 h-16 rounded-2xl ${slide.iconBg} flex items-center justify-center mb-5`}>
                <Icon className={`w-8 h-8 ${slide.iconColor}`} />
              </div>
              <h2 className="text-2xl font-bold mb-3 text-slate-900" style={{ fontFamily: "'Playfair Display', serif" }}>{slide.title}</h2>
              <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
                {slide.desc}
              </p>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Dots + Navigation */}
        <div className="px-6 pb-8">
          <div className="flex items-center justify-center gap-2 mb-8">
            {onboardingSlides.map((_, i) => (
              <button
                key={i}
                onClick={() => setSlideIndex(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  i === slideIndex ? "w-8 bg-emerald-600" : "w-2 bg-slate-200"
                }`}
              />
            ))}
          </div>
          <div className="flex items-center gap-3">
            {slideIndex > 0 && (
              <Button
                variant="outline"
                size="lg"
                className="h-13 px-5 rounded-2xl border-slate-200"
                onClick={() => setSlideIndex(slideIndex - 1)}
              >
                <ChevronLeft className="w-5 h-5" />
              </Button>
            )}
            <Button
              size="lg"
              className="flex-1 h-13 text-base font-semibold rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-600/25"
              onClick={() => {
                if (slideIndex < onboardingSlides.length - 1) {
                  setSlideIndex(slideIndex + 1);
                } else {
                  setStep("packages");
                }
              }}
            >
              {slideIndex < onboardingSlides.length - 1 ? "Next" : "Continue"}
              <ChevronRight className="w-5 h-5 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Package selection screen
  if (step === "packages") {
    const tiers = Object.entries(PACKAGE_TIERS) as [PackageTier, typeof PACKAGE_TIERS[PackageTier]][];
    return (
      <div className="min-h-screen flex flex-col bg-white">
        <div className="flex items-center justify-between px-5 pt-5 pb-2">
          <button onClick={() => setStep("onboarding")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5 text-foreground" />
          </button>
          <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-5" />
          <button onClick={() => setStep("login")} className="text-sm font-medium text-emerald-600">
            Skip
          </button>
        </div>

        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 flex flex-col px-5 pt-3">
          <div className="text-center mb-5">
            <h2 className="text-xl font-bold text-slate-900" style={{ fontFamily: "'Playfair Display', serif" }}>Choose Your Plan</h2>
            <p className="text-sm text-muted-foreground mt-1">Select the package that fits your farm</p>
          </div>

          <div className="space-y-3 flex-1">
            {tiers.map(([tier, pkg]) => {
              const Icon = tierIcons[tier];
              const colors = tierColors[tier];
              const isSelected = selectedPkg === tier;
              return (
                <button
                  key={tier}
                  onClick={() => setSelectedPkg(tier)}
                  className={`w-full text-left rounded-2xl border-2 p-4 transition-all ${
                    isSelected ? `border-emerald-500 bg-emerald-50/50 shadow-md` : "border-slate-200 bg-white"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-2.5 rounded-xl ${colors.bg}`}>
                      <Icon className={`w-5 h-5 ${colors.text}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900">{pkg.name}</span>
                        {tier === "harvest" && <span className="text-[9px] font-bold bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">POPULAR</span>}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{pkg.tagline}</p>
                    </div>
                    <div className="text-right">
                      {pkg.price === 0 ? (
                        <span className="text-lg font-bold text-slate-900">Free</span>
                      ) : (
                        <div>
                          <span className="text-lg font-bold text-slate-900">{Math.round(pkg.yearlyPrice / 12)}</span>
                          <span className="text-xs text-slate-400"> AED/mo</span>
                        </div>
                      )}
                    </div>
                  </div>
                  {isSelected && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} className="mt-3 pt-3 border-t border-emerald-200/50">
                      <div className="grid grid-cols-2 gap-1.5">
                        {[
                          `${pkg.features.maxZones} zones`,
                          `${pkg.features.maxSensorNodes} sensors`,
                          pkg.features.aiAssistant ? "AI Assistant" : "Basic monitoring",
                          pkg.features.b2bSupplyChain ? "B2B Supply Chain" : pkg.features.cropPlanning ? "Crop Planning" : "Marketplace",
                        ].map((f, i) => (
                          <div key={i} className="flex items-center gap-1.5 text-xs text-emerald-700">
                            <Check className="w-3 h-3 flex-shrink-0" />
                            <span>{f}</span>
                          </div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </button>
              );
            })}
          </div>

          <div className="pt-4 pb-6">
            <Button
              size="lg"
              className="w-full h-13 text-base font-semibold rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-600/25 flex items-center justify-center gap-2"
              onClick={() => {
                upgradePackage(selectedPkg, "yearly");
                setStep("login");
              }}
            >
              Continue with {PACKAGE_TIERS[selectedPkg].name} <ArrowRight className="w-5 h-5" />
            </Button>
            <button onClick={() => { setStep("login"); }} className="w-full text-center text-xs text-slate-400 mt-3 hover:text-emerald-600">
              Compare all features
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // Login / Sign up screen
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* Header */}
      <div className="flex items-center justify-between px-5 pt-5 pb-2">
        <button onClick={() => setStep("hero")} className="p-1.5 rounded-lg hover:bg-muted transition-colors">
          <ArrowLeft className="w-5 h-5 text-foreground" />
        </button>
        <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-6" />
        <div className="w-8" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex-1 flex flex-col px-6 pt-4"
      >
        {/* Header with subtle Zayed accent */}
        <div className="text-center mb-6">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-50 to-blue-50 flex items-center justify-center mx-auto mb-4 border border-emerald-100/50">
            <img
              src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-inspecting-crops-Pdx2M32B8375Gaq5NqD3Xf.webp"
              alt=""
              className="w-12 h-12 rounded-xl object-cover"
            />
          </div>
          <h2 className="text-2xl font-bold mb-1.5 text-slate-900" style={{ fontFamily: "'Playfair Display', serif" }}>Welcome Back</h2>
          <p className="text-muted-foreground text-sm">Sign in to access your smart farm</p>
        </div>

        {/* Login form */}
        <div className="space-y-3.5 mb-5">
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wider">Email or Phone</label>
            <input
              type="text"
              placeholder="Enter your email or phone"
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder:text-slate-400"
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-slate-600 mb-1.5 block uppercase tracking-wider">Password</label>
            <input
              type="password"
              placeholder="Enter your password"
              className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-slate-50/50 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all placeholder:text-slate-400"
            />
          </div>
          <div className="flex justify-end">
            <button className="text-xs text-emerald-600 font-semibold">Forgot password?</button>
          </div>
        </div>

        <Button
          size="lg"
          className="w-full h-13 text-base font-semibold rounded-2xl bg-gradient-to-r from-emerald-600 to-green-600 hover:from-emerald-700 hover:to-green-700 shadow-lg shadow-emerald-600/25 mb-3"
          onClick={() => setLocation("/dashboard")}
        >
          Sign In
        </Button>

        {/* UAE PASS */}
        <Button
          variant="outline"
          size="lg"
          className="w-full h-13 text-sm font-semibold rounded-2xl border-2 border-slate-200 mb-3 flex items-center justify-center gap-2.5 hover:bg-slate-50"
          onClick={() => setLocation("/dashboard")}
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <rect width="24" height="24" rx="4" fill="#C8102E"/>
            <path d="M6 8h12v2H6zM6 11h12v2H6zM6 14h12v2H6z" fill="white"/>
          </svg>
          Sign in with UAE PASS
        </Button>

        <div className="flex items-center gap-3 my-3">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">or</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <Button
          variant="ghost"
          size="lg"
          className="w-full h-11 text-sm text-slate-500 hover:text-emerald-600 mb-2"
          onClick={() => setLocation("/dashboard")}
        >
          Continue as Guest
        </Button>

        {/* Zero Bureaucracy: Quick Access */}
        <div className="flex items-center gap-3 my-1">
          <div className="flex-1 h-px bg-slate-200" />
          <span className="text-[10px] text-slate-400 uppercase tracking-wider font-medium">quick access</span>
          <div className="flex-1 h-px bg-slate-200" />
        </div>

        <Button
          variant="ghost"
          size="lg"
          className="w-full h-11 text-sm text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 font-semibold mb-1"
          onClick={quickAccess}
        >
          Explore Dashboard Instantly
        </Button>

        <p className="text-center text-xs text-muted-foreground mb-3">
          Don't have an account?{" "}
          <button className="text-emerald-600 font-semibold" onClick={() => setLocation("/dashboard")}>
            Sign Up
          </button>
        </p>

        {/* ═══════ GOVERNMENT PORTAL ═══════ */}
        <div className="mt-auto pt-3 pb-2 border-t border-slate-100">
          <button
            onClick={() => setLocation("/government-dashboard")}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl bg-gradient-to-r from-slate-800 to-slate-700 text-white hover:from-slate-700 hover:to-slate-600 transition-all shadow-lg shadow-slate-800/20"
          >
            <div className="p-2 bg-emerald-500/20 rounded-xl border border-emerald-400/20">
              <Landmark className="w-5 h-5 text-emerald-400" />
            </div>
            <div className="text-left flex-1">
              <span className="text-sm font-semibold block">Government Portal</span>
              <span className="text-[10px] text-slate-400">Authorized officials only</span>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-500" />
          </button>
        </div>

        <p className="text-center text-[10px] text-slate-400/50 py-3">www.falajae.com</p>
      </motion.div>
    </div>
  );
}
