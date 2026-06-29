/**
 * FALAJ Registration — Multi-step sign-up flow
 * Steps: 1) Personal Info  2) Farm Details  3) Package Selection  4) Confirmation
 * Design: Emerald/green brand, polished mobile-first
 */
import { useState, useMemo } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { useAppState, PACKAGE_TIERS, PackageTier } from "@/contexts/AppStateContext";
import { toast } from "sonner";
import {
  ArrowLeft, ArrowRight, User, MapPin, Sprout, Check,
  Eye, EyeOff, Phone, Mail, Lock, Building2,
  Leaf, Crown, Zap, Sparkles, ChevronRight, CheckCircle2
} from "lucide-react";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";

const steps = [
  { id: 1, label: "Personal", icon: User },
  { id: 2, label: "Farm", icon: Sprout },
  { id: 3, label: "Plan", icon: Crown },
  { id: 4, label: "Done", icon: Check },
];

const uaeLocations = [
  "Abu Dhabi", "Al Ain", "Dubai", "Sharjah", "Ajman",
  "Ras Al Khaimah", "Fujairah", "Umm Al Quwain",
  "Liwa Oasis", "Al Dhafra", "Madinat Zayed",
];

const farmTypes = [
  { value: "dates", label: "Date Palm Farm", icon: "🌴" },
  { value: "vegetables", label: "Vegetable Farm", icon: "🥬" },
  { value: "fruits", label: "Fruit Orchard", icon: "🍊" },
  { value: "herbs", label: "Herb Garden", icon: "🌿" },
  { value: "mixed", label: "Mixed Agriculture", icon: "🌾" },
  { value: "livestock", label: "Livestock & Crops", icon: "🐄" },
];

const fadeSlide = {
  initial: (dir: number) => ({ opacity: 0, x: dir > 0 ? 60 : -60 }),
  animate: { opacity: 1, x: 0, transition: { duration: 0.3 } },
  exit: (dir: number) => ({ opacity: 0, x: dir > 0 ? -60 : 60, transition: { duration: 0.2 } }),
};

export default function Registration() {
  const [, navigate] = useLocation();
  const { updateUser, startTrial } = useAppState();
  const [step, setStep] = useState(1);
  const [direction, setDirection] = useState(1);
  const [showPassword, setShowPassword] = useState(false);

  // Form state
  const [form, setForm] = useState({
    fullName: "",
    email: "",
    phone: "+971 ",
    password: "",
    farmName: "",
    farmType: "",
    location: "",
    farmSize: "",
    zones: "2",
    selectedPackage: "seedling" as PackageTier,
    referralCode: "",
    agreeTerms: false,
  });

  const updateField = (field: string, value: string | boolean) => {
    setForm(prev => ({ ...prev, [field]: value }));
  };

  const goNext = () => {
    setDirection(1);
    setStep(prev => Math.min(prev + 1, 4));
  };
  const goBack = () => {
    setDirection(-1);
    setStep(prev => Math.max(prev - 1, 1));
  };

  const canProceed = useMemo(() => {
    if (step === 1) return form.fullName.length >= 3 && form.email.includes("@") && form.phone.length > 6 && form.password.length >= 6;
    if (step === 2) return form.farmName.length >= 2 && form.farmType && form.location;
    if (step === 3) return form.agreeTerms;
    return true;
  }, [step, form]);

  const handleComplete = () => {
    const initials = form.fullName.split(" ").map(n => n[0]).join("").toUpperCase().slice(0, 2);
    updateUser({
      name: form.fullName,
      email: form.email,
      phone: form.phone,
      farm: form.farmName,
      location: form.location + ", UAE",
      avatar: initials,
      package: form.selectedPackage,
      plan: form.selectedPackage === "seedling" ? "free" : form.selectedPackage === "harvest" ? "premium" : "enterprise",
      joinDate: new Date().toISOString().split("T")[0],
    });

    if (form.selectedPackage === "harvest") {
      startTrial();
    }

    toast.success("Welcome to FALAJ! Your farm journey begins now.");
    goNext(); // go to step 4 (confirmation)
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white via-emerald-50/30 to-white">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto flex items-center justify-between px-4 h-14">
          <button onClick={() => step > 1 ? goBack() : navigate("/")} className="p-2 -ml-2 rounded-xl hover:bg-muted/60 transition-colors active:scale-95">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-5" />
          <div className="w-9" />
        </div>
      </header>

      <div className="max-w-[480px] mx-auto px-4 pt-6 pb-32">
        {/* Progress Steps */}
        <div className="flex items-center justify-between mb-8 px-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const isActive = step === s.id;
            const isDone = step > s.id;
            return (
              <div key={s.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center transition-all duration-300 ${
                    isDone ? "bg-emerald-600 text-white" :
                    isActive ? "bg-emerald-600 text-white shadow-lg shadow-emerald-200/50" :
                    "bg-gray-100 text-gray-400"
                  }`}>
                    {isDone ? <Check className="w-5 h-5" /> : <Icon className="w-4.5 h-4.5" />}
                  </div>
                  <span className={`text-[10px] font-semibold mt-1.5 ${
                    isActive || isDone ? "text-emerald-700" : "text-gray-400"
                  }`}>{s.label}</span>
                </div>
                {i < steps.length - 1 && (
                  <div className={`w-12 h-0.5 mx-1 mt-[-12px] rounded-full transition-all ${
                    step > s.id ? "bg-emerald-500" : "bg-gray-200"
                  }`} />
                )}
              </div>
            );
          })}
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait" custom={direction}>
          {step === 1 && (
            <motion.div key="step1" custom={direction} variants={fadeSlide} initial="initial" animate="animate" exit="exit">
              <h2 className="text-2xl font-bold tracking-tight mb-1">Create Your Account</h2>
              <p className="text-sm text-muted-foreground mb-6">Join 1,200+ UAE farmers on FALAJ</p>

              <div className="space-y-4">
                {/* Full Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Full Name</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="text"
                      value={form.fullName}
                      onChange={e => updateField("fullName", e.target.value)}
                      placeholder="Ahmed Al Dhaheri"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Email */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Email Address</label>
                  <div className="relative">
                    <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="email"
                      value={form.email}
                      onChange={e => updateField("email", e.target.value)}
                      placeholder="ahmed@farm.ae"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Phone */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="tel"
                      value={form.phone}
                      onChange={e => updateField("phone", e.target.value)}
                      placeholder="+971 50 123 4567"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Password */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Password</label>
                  <div className="relative">
                    <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type={showPassword ? "text" : "password"}
                      value={form.password}
                      onChange={e => updateField("password", e.target.value)}
                      placeholder="Min 6 characters"
                      className="w-full pl-11 pr-12 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 p-1 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {showPassword ? <EyeOff className="w-4 h-4 text-gray-400" /> : <Eye className="w-4 h-4 text-gray-400" />}
                    </button>
                  </div>
                  {form.password.length > 0 && form.password.length < 6 && (
                    <p className="text-[10px] text-red-500 mt-1">Password must be at least 6 characters</p>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" custom={direction} variants={fadeSlide} initial="initial" animate="animate" exit="exit">
              <h2 className="text-2xl font-bold tracking-tight mb-1">Your Farm Details</h2>
              <p className="text-sm text-muted-foreground mb-6">Tell us about your agricultural operation</p>

              <div className="space-y-4">
                {/* Farm Name */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Farm Name</label>
                  <div className="relative">
                    <Building2 className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="text"
                      value={form.farmName}
                      onChange={e => updateField("farmName", e.target.value)}
                      placeholder="Al Ain Heritage Farm"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>

                {/* Farm Type */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Farm Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {farmTypes.map(ft => (
                      <button
                        key={ft.value}
                        onClick={() => updateField("farmType", ft.value)}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border text-left transition-all active:scale-[0.97] ${
                          form.farmType === ft.value
                            ? "border-emerald-500 bg-emerald-50 shadow-sm"
                            : "border-gray-200 bg-white hover:border-gray-300"
                        }`}
                      >
                        <span className="text-xl">{ft.icon}</span>
                        <span className={`text-xs font-semibold ${form.farmType === ft.value ? "text-emerald-700" : "text-gray-700"}`}>{ft.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Location */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Location</label>
                  <div className="relative">
                    <MapPin className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <select
                      value={form.location}
                      onChange={e => updateField("location", e.target.value)}
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all appearance-none"
                    >
                      <option value="">Select emirate / region</option>
                      {uaeLocations.map(loc => (
                        <option key={loc} value={loc}>{loc}</option>
                      ))}
                    </select>
                    <ChevronRight className="absolute right-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 rotate-90" />
                  </div>
                </div>

                {/* Farm Size */}
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Farm Size (approx.)</label>
                  <div className="relative">
                    <Leaf className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-gray-400" />
                    <input
                      type="text"
                      value={form.farmSize}
                      onChange={e => updateField("farmSize", e.target.value)}
                      placeholder="e.g. 5 hectares"
                      className="w-full pl-11 pr-4 py-3.5 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                    />
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" custom={direction} variants={fadeSlide} initial="initial" animate="animate" exit="exit">
              <h2 className="text-2xl font-bold tracking-tight mb-1">Choose Your Plan</h2>
              <p className="text-sm text-muted-foreground mb-6">Start free or unlock premium features instantly</p>

              <div className="space-y-3 mb-6">
                {(["seedling", "harvest", "falaj_elite"] as PackageTier[]).map(tier => {
                  const pkg = PACKAGE_TIERS[tier];
                  const isSelected = form.selectedPackage === tier;
                  const TierIcon = tier === "seedling" ? Sparkles : tier === "harvest" ? Zap : Crown;
                  const colors = tier === "seedling"
                    ? { border: "border-emerald-500", bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" }
                    : tier === "harvest"
                    ? { border: "border-blue-500", bg: "bg-blue-50", text: "text-blue-700", ring: "ring-blue-200" }
                    : { border: "border-amber-500", bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-200" };

                  return (
                    <button
                      key={tier}
                      onClick={() => updateField("selectedPackage", tier)}
                      className={`w-full text-left p-4 rounded-2xl border-2 transition-all active:scale-[0.98] ${
                        isSelected
                          ? `${colors.border} ${colors.bg} shadow-md ring-4 ${colors.ring}/30`
                          : "border-gray-200 bg-white hover:border-gray-300"
                      }`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className={`p-2.5 rounded-xl ${isSelected ? colors.bg : "bg-gray-100"}`}>
                            <TierIcon className={`w-5 h-5 ${isSelected ? colors.text : "text-gray-500"}`} />
                          </div>
                          <div>
                            <p className="text-sm font-bold">{pkg.name}</p>
                            <p className="text-xs text-muted-foreground mt-0.5">{pkg.tagline}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {pkg.price === 0 ? (
                            <p className="text-lg font-bold text-emerald-600">Free</p>
                          ) : (
                            <>
                              <p className="text-lg font-bold">{pkg.price} <span className="text-xs font-medium text-muted-foreground">AED/mo</span></p>
                              {tier === "harvest" && (
                                <p className="text-[10px] text-blue-600 font-semibold">14-day free trial</p>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <div className="mt-3 pt-3 border-t border-current/10">
                          <div className="grid grid-cols-2 gap-1.5">
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              Up to {pkg.features.maxZones} zones
                            </div>
                            <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                              {pkg.features.maxSensorNodes} sensor nodes
                            </div>
                            {pkg.features.aiAssistant && (
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                AI Assistant
                              </div>
                            )}
                            {pkg.features.cropPlanning && (
                              <div className="flex items-center gap-1.5 text-[11px] text-gray-600">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                                Crop Planning
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Referral Code */}
              <div className="mb-5">
                <label className="text-xs font-semibold text-gray-600 uppercase tracking-wider mb-1.5 block">Referral Code (Optional)</label>
                <input
                  type="text"
                  value={form.referralCode}
                  onChange={e => updateField("referralCode", e.target.value.toUpperCase())}
                  placeholder="e.g. AHMED-FALAJ-7X2K"
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition-all"
                />
                {form.referralCode && (
                  <p className="text-[10px] text-emerald-600 mt-1 font-medium">You'll get 10% off your first month!</p>
                )}
              </div>

              {/* Terms */}
              <label className="flex items-start gap-3 cursor-pointer">
                <div
                  onClick={() => updateField("agreeTerms", !form.agreeTerms)}
                  className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                    form.agreeTerms ? "bg-emerald-600 border-emerald-600" : "border-gray-300"
                  }`}
                >
                  {form.agreeTerms && <Check className="w-3.5 h-3.5 text-white" />}
                </div>
                <span className="text-xs text-gray-600 leading-relaxed">
                  I agree to FALAJ's <span className="text-emerald-600 font-semibold">Terms of Service</span> and <span className="text-emerald-600 font-semibold">Privacy Policy</span>. I understand that my farm data will be securely stored and used to improve my farming experience.
                </span>
              </label>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" custom={direction} variants={fadeSlide} initial="initial" animate="animate" exit="exit" className="text-center pt-8">
              <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>
              <h2 className="text-2xl font-bold tracking-tight mb-2">Welcome to FALAJ!</h2>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs mx-auto">
                Your account has been created successfully. {form.selectedPackage === "harvest" ? "Your 14-day Harvest Pro trial is now active!" : "Start exploring your smart farming dashboard."}
              </p>

              <div className="bg-emerald-50 rounded-2xl p-5 mb-6 text-left">
                <h3 className="text-sm font-bold text-emerald-800 mb-3">Your Setup Summary</h3>
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Name</span>
                    <span className="font-semibold">{form.fullName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Farm</span>
                    <span className="font-semibold">{form.farmName}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Location</span>
                    <span className="font-semibold">{form.location}</span>
                  </div>
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600">Plan</span>
                    <span className="font-bold text-emerald-700">{PACKAGE_TIERS[form.selectedPackage].name}</span>
                  </div>
                </div>
              </div>

              {form.selectedPackage === "harvest" && (
                <div className="bg-blue-50 rounded-2xl p-4 mb-6 text-left flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-blue-100 shrink-0">
                    <Sparkles className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-bold text-blue-800">14-Day Free Trial Active</p>
                    <p className="text-xs text-blue-600">Enjoy all Harvest Pro features. No charge until trial ends.</p>
                  </div>
                </div>
              )}

              <button
                onClick={() => navigate("/dashboard")}
                className="w-full py-4 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-2xl text-sm font-bold shadow-lg shadow-emerald-200/50 active:scale-[0.98] transition-transform flex items-center justify-center gap-2"
              >
                Go to Dashboard
                <ArrowRight className="w-4 h-4" />
              </button>

              <button
                onClick={() => navigate("/welcome")}
                className="w-full py-3 mt-3 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                Take a Quick Tour First
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Bottom Action Bar (steps 1-3 only) */}
      {step < 4 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur-2xl border-t border-border/20 z-40">
          <div className="max-w-[480px] mx-auto px-4 py-4 flex items-center gap-3">
            {step > 1 && (
              <button
                onClick={goBack}
                className="px-5 py-3.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-700 hover:bg-gray-50 transition-all active:scale-[0.97]"
              >
                Back
              </button>
            )}
            <button
              onClick={step === 3 ? handleComplete : goNext}
              disabled={!canProceed}
              className={`flex-1 py-3.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all active:scale-[0.98] ${
                canProceed
                  ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-lg shadow-emerald-200/50"
                  : "bg-gray-100 text-gray-400 cursor-not-allowed"
              }`}
            >
              {step === 3 ? "Create Account" : "Continue"}
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Sign in link */}
      {step === 1 && (
        <div className="fixed bottom-20 left-0 right-0 text-center">
          <p className="text-xs text-muted-foreground">
            Already have an account?{" "}
            <button onClick={() => navigate("/welcome")} className="text-emerald-600 font-semibold hover:underline">
              Sign In
            </button>
          </p>
        </div>
      )}
    </div>
  );
}
