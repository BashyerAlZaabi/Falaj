/*
 * FALAJ Landing Page — International-level marketing page
 * Design: Blue/Green/White — Sheikh Zayed as the soul of the brand
 * Authentic Zayed illustrations, premium typography, cinematic sections
 */
import { Button } from "@/components/ui/button";
import { useLocation } from "wouter";
import { motion } from "framer-motion";
import {
  Radio, Bot, ShoppingBag, Shield, Droplets, Leaf,
  ChevronRight, Star, ArrowRight, BarChart3, Users,
  Zap, Globe, Award, CheckCircle2
} from "lucide-react";

const FALAJ_LOGO_WHITE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Whitelogo-nobackground_f8f7fb2f.png";
const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";

// Authentic Zayed illustrations
const HERO_BG = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-desert-farm-panorama-DTj3EKJZo5qEgc3k2XuybH.webp";
const ZAYED_FIELD = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-field-walk-M4293F7Fdgn8LaecFz2jzf.webp";
const ZAYED_GREENHOUSE = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-greenhouse-QU4TVeKaVMkWjRHTGcqBgn.webp";
const ZAYED_IRRIGATION = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-irrigation-AsWBrHPgZtR2T3N2bencmH.webp";
const ZAYED_YOUNG_FARMERS = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-young-farmers-FJL5S2BTLaJof9X97vfdsa.webp";
const ZAYED_DATE_PALMS = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-date-palms-XTf57Co6QRn2jH7hkHhkJP.webp";
const ZAYED_DESERT_GARDEN = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-desert-garden-Mgf3NaaThAMGknNDn3AVSp.webp";

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};
const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.12 } },
};

const stats = [
  { value: "1,200+", label: "Active Farmers", icon: Users },
  { value: "4,000+", label: "IoT Sensors", icon: Radio },
  { value: "2.4M L", label: "Water Saved", icon: Droplets },
  { value: "87%", label: "Crop Health", icon: Leaf },
];

const features = [
  {
    title: "Smart IoT Sensors",
    desc: "Deploy solar-powered sensors across your farm to monitor soil moisture, temperature, humidity, and light in real-time. Get instant alerts when conditions change.",
    image: ZAYED_GREENHOUSE,
    icon: Radio,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-600",
    points: ["Real-time soil monitoring", "Solar-powered & wireless", "Instant anomaly alerts", "Multi-zone coverage"],
  },
  {
    title: "AI-Powered Insights",
    desc: "Our artificial intelligence analyzes your farm data to provide personalized crop recommendations, pest detection, irrigation optimization, and harvest timing predictions.",
    image: ZAYED_YOUNG_FARMERS,
    icon: Bot,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-600",
    points: ["Personalized crop advice", "Pest & disease detection", "Irrigation optimization", "Harvest predictions"],
  },
  {
    title: "Agricultural Marketplace",
    desc: "Buy, sell, and trade agricultural products directly with other farmers and buyers. Access packaging, transportation, trade licensing, and virtual office services.",
    image: ZAYED_IRRIGATION,
    icon: ShoppingBag,
    iconBg: "bg-green-50",
    iconColor: "text-green-600",
    points: ["Direct farmer-to-buyer", "Packaging & logistics", "Trade licensing", "Virtual office"],
  },
];

const testimonials = [
  {
    name: "Ahmed Al Mansouri",
    role: "Date Palm Farmer, Al Ain",
    text: "FALAJ transformed my farm operations. The AI recommendations helped me reduce water usage by 35% while increasing my date yield significantly.",
    rating: 5,
  },
  {
    name: "Fatima Al Hashimi",
    role: "Organic Vegetable Grower, Abu Dhabi",
    text: "The marketplace feature connected me directly with buyers. I no longer worry about selling my produce — orders come in before harvest!",
    rating: 5,
  },
  {
    name: "Mohammed Al Ketbi",
    role: "Citrus Farmer, Fujairah",
    text: "The sensor alerts saved my entire citrus crop from a pest outbreak. I got notified before any visible damage appeared. Truly life-changing technology.",
    rating: 5,
  },
];

export default function LandingPage() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-white overflow-x-hidden">
      {/* ═══════ NAVIGATION ═══════ */}
      <nav className="fixed top-0 left-0 right-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16 sm:h-20">
            <img src={FALAJ_LOGO_WHITE} alt="FALAJ" className="h-7 sm:h-8" />
            <div className="hidden md:flex items-center gap-8">
              <a href="#features" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Features</a>
              <a href="#how-it-works" className="text-white/80 hover:text-white text-sm font-medium transition-colors">How It Works</a>
              <a href="#testimonials" className="text-white/80 hover:text-white text-sm font-medium transition-colors">Testimonials</a>
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                className="text-white/90 hover:text-white hover:bg-white/10 text-sm hidden sm:inline-flex"
                onClick={() => setLocation("/welcome")}
              >
                Sign In
              </Button>
              <Button
                className="bg-white text-emerald-800 hover:bg-white/90 text-sm font-semibold rounded-full px-5 h-9 shadow-lg"
                onClick={() => setLocation("/register")}
              >
                Get Started
              </Button>
            </div>
          </div>
        </div>
      </nav>

      {/* ═══════ HERO SECTION — Zayed walking between falaj channels ═══════ */}
      <section className="relative min-h-[100vh] flex items-center">
        <div className="absolute inset-0">
          <img src={HERO_BG} alt="Zayed's agricultural vision" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/80 via-slate-900/50 to-transparent" />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-slate-900/30" />
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-20">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={stagger}
            className="max-w-2xl"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-md border border-white/15 rounded-full px-4 py-1.5 mb-6">
              <Leaf className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white/90 text-xs font-medium tracking-wide">Continuing Sheikh Zayed's Agricultural Vision</span>
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-[1.1] mb-5 tracking-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              The Future of
              <br />
              <span className="bg-gradient-to-r from-emerald-300 to-green-300 bg-clip-text text-transparent">
                Smart Agriculture
              </span>
              <br />
              in the UAE
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg sm:text-xl text-white/70 leading-relaxed mb-8 max-w-lg">
              Monitor your farm with IoT sensors, get AI-powered insights, and trade on the agricultural marketplace — all in one platform.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-start gap-3">
              <Button
                size="lg"
                className="bg-gradient-to-r from-emerald-500 to-green-500 hover:from-emerald-600 hover:to-green-600 text-white text-base font-semibold rounded-full px-8 h-13 shadow-xl shadow-emerald-500/30 flex items-center gap-2"
                onClick={() => setLocation("/register")}
              >
                Start Free Trial <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="text-white border border-white/25 hover:bg-white/10 rounded-full px-8 h-13 text-base"
                onClick={() => {
                  document.getElementById("features")?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                Learn More
              </Button>
            </motion.div>
          </motion.div>
        </div>

        {/* Stats bar */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.6 }}
          className="absolute bottom-0 left-0 right-0 bg-white/10 backdrop-blur-xl border-t border-white/10"
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {stats.map((stat) => {
                const Icon = stat.icon;
                return (
                  <div key={stat.label} className="flex items-center gap-3">
                    <div className="p-2 bg-emerald-500/20 rounded-xl">
                      <Icon className="w-5 h-5 text-emerald-300" />
                    </div>
                    <div>
                      <div className="text-xl font-bold text-white">{stat.value}</div>
                      <div className="text-xs text-white/60">{stat.label}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>
      </section>

      {/* ═══════ ZAYED QUOTE SECTION ═══════ */}
      <section className="py-16 sm:py-20 bg-gradient-to-b from-emerald-50/80 to-white">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="flex flex-col md:flex-row items-center gap-10"
          >
            <motion.div variants={fadeUp} className="w-48 h-48 md:w-56 md:h-56 rounded-3xl overflow-hidden shadow-xl shadow-emerald-900/10 shrink-0 border-4 border-white">
              <img src={ZAYED_DATE_PALMS} alt="Sheikh Zayed among date palms" className="w-full h-full object-cover object-top" />
            </motion.div>
            <motion.div variants={fadeUp} className="text-center md:text-left">
              <blockquote className="text-xl sm:text-2xl text-slate-800 leading-relaxed mb-4 font-medium" style={{ fontFamily: "'Playfair Display', serif" }}>
                "Give me agriculture, I will give you civilization."
              </blockquote>
              <p className="text-emerald-700 font-semibold text-sm tracking-wide uppercase">
                — Inspired by Sheikh Zayed bin Sultan Al Nahyan
              </p>
              <p className="text-slate-500 text-sm mt-2 leading-relaxed max-w-lg">
                FALAJ carries forward the founding father's vision of transforming the desert into a green oasis through innovation, technology, and unwavering dedication to the land.
              </p>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════ FEATURES SECTION ═══════ */}
      <section id="features" className="py-20 sm:py-28 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-emerald-50 border border-emerald-100 rounded-full px-4 py-1.5 mb-4">
              <BarChart3 className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-700 text-xs font-semibold uppercase tracking-wider">Platform Features</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Everything You Need to
              <br />
              <span className="text-emerald-600">Grow Smarter</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-slate-500 text-lg max-w-2xl mx-auto">
              From soil monitoring to market trading, FALAJ provides a complete ecosystem for modern agriculture in the UAE.
            </motion.p>
          </motion.div>

          <div className="space-y-20">
            {features.map((feature, idx) => {
              const Icon = feature.icon;
              const isReversed = idx % 2 === 1;
              return (
                <motion.div
                  key={feature.title}
                  initial="hidden"
                  whileInView="visible"
                  viewport={{ once: true, margin: "-100px" }}
                  variants={stagger}
                  className={`flex flex-col ${isReversed ? "lg:flex-row-reverse" : "lg:flex-row"} items-center gap-10 lg:gap-16`}
                >
                  <motion.div variants={fadeUp} className="flex-1 w-full">
                    <div className="relative rounded-3xl overflow-hidden shadow-2xl shadow-slate-900/10 aspect-[4/3]">
                      <img src={feature.image} alt={feature.title} className="w-full h-full object-cover" />
                      <div className="absolute inset-0 bg-gradient-to-t from-emerald-900/20 to-transparent" />
                    </div>
                  </motion.div>
                  <motion.div variants={fadeUp} className="flex-1">
                    <div className={`inline-flex p-3 rounded-2xl ${feature.iconBg} mb-5`}>
                      <Icon className={`w-6 h-6 ${feature.iconColor}`} />
                    </div>
                    <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>{feature.title}</h3>
                    <p className="text-slate-500 text-base leading-relaxed mb-6">{feature.desc}</p>
                    <div className="grid grid-cols-2 gap-3">
                      {feature.points.map((point) => (
                        <div key={point} className="flex items-center gap-2">
                          <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="text-sm text-slate-700 font-medium">{point}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ═══════ HOW IT WORKS ═══════ */}
      <section id="how-it-works" className="py-20 sm:py-28 bg-gradient-to-b from-slate-50 to-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-blue-50 border border-blue-100 rounded-full px-4 py-1.5 mb-4">
              <Globe className="w-3.5 h-3.5 text-blue-600" />
              <span className="text-blue-700 text-xs font-semibold uppercase tracking-wider">How It Works</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Get Started in <span className="text-blue-600">3 Simple Steps</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-8"
          >
            {[
              { step: "01", title: "Install Sensors", desc: "Place our solar-powered IoT sensors across your farm zones. They connect automatically and start monitoring.", icon: Radio, color: "bg-blue-600" },
              { step: "02", title: "Get AI Insights", desc: "Our AI analyzes your farm data and provides personalized recommendations for irrigation, pest control, and more.", icon: Bot, color: "bg-emerald-600" },
              { step: "03", title: "Trade & Grow", desc: "List your produce on the marketplace, connect with buyers, and access services like packaging and transportation.", icon: ShoppingBag, color: "bg-green-600" },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <motion.div key={item.step} variants={fadeUp} className="relative bg-white rounded-3xl p-8 shadow-sm border border-slate-100 hover:shadow-lg hover:border-emerald-100 transition-all duration-300">
                  <div className="text-6xl font-black text-slate-100 absolute top-4 right-6" style={{ fontFamily: "'Playfair Display', serif" }}>{item.step}</div>
                  <div className={`${item.color} w-12 h-12 rounded-2xl flex items-center justify-center mb-5 shadow-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2">{item.title}</h3>
                  <p className="text-slate-500 text-sm leading-relaxed">{item.desc}</p>
                </motion.div>
              );
            })}
          </motion.div>
        </div>
      </section>

      {/* ═══════ VISION SECTION — Zayed walking through fields ═══════ */}
      <section className="relative py-24 sm:py-32 overflow-hidden">
        <div className="absolute inset-0">
          <img src={ZAYED_DESERT_GARDEN} alt="Zayed's vision — walking through desert garden" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900/85 via-slate-900/60 to-slate-900/40" />
        </div>
        <div className="relative z-10 max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
            className="max-w-xl"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white/10 backdrop-blur-sm border border-white/15 rounded-full px-4 py-1.5 mb-5">
              <Leaf className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white/80 text-xs font-medium tracking-wide">Our Heritage</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-white mb-5 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
              Rooted in Tradition,
              <br />
              <span className="text-emerald-300">Powered by Innovation</span>
            </motion.h2>
            <motion.p variants={fadeUp} className="text-white/70 text-base leading-relaxed mb-6">
              Sheikh Zayed believed that agriculture was the foundation of civilization. FALAJ honors that legacy by combining traditional farming wisdom with cutting-edge technology — IoT sensors, artificial intelligence, and a connected marketplace that empowers every farmer in the UAE.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-3">
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/10">
                <Shield className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-white/90 text-sm font-medium">Government Backed</span>
              </div>
              <div className="flex items-center gap-3 bg-white/10 backdrop-blur-sm rounded-2xl px-4 py-3 border border-white/10">
                <Award className="w-5 h-5 text-emerald-400 shrink-0" />
                <span className="text-white/90 text-sm font-medium">UAE PASS Integrated</span>
              </div>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════ TESTIMONIALS ═══════ */}
      <section id="testimonials" className="py-20 sm:py-28 bg-slate-900">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="text-center mb-16"
          >
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-4">
              <Award className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-white/70 text-xs font-semibold uppercase tracking-wider">Testimonials</span>
            </motion.div>
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold text-white mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Trusted by UAE <span className="text-emerald-400">Farmers</span>
            </motion.h2>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={stagger}
            className="grid md:grid-cols-3 gap-6"
          >
            {testimonials.map((t) => (
              <motion.div key={t.name} variants={fadeUp} className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-3xl p-6 hover:bg-white/8 transition-colors">
                <div className="flex gap-1 mb-4">
                  {Array.from({ length: t.rating }).map((_, i) => (
                    <Star key={i} className="w-4 h-4 text-emerald-400 fill-emerald-400" />
                  ))}
                </div>
                <p className="text-white/80 text-sm leading-relaxed mb-5">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-500 to-green-500 flex items-center justify-center text-white font-bold text-sm">
                    {t.name.split(" ").map(n => n[0]).join("")}
                  </div>
                  <div>
                    <div className="text-white text-sm font-semibold">{t.name}</div>
                    <div className="text-white/50 text-xs">{t.role}</div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* ═══════ CTA SECTION ═══════ */}
      <section className="relative py-20 sm:py-28 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-emerald-700 via-green-700 to-blue-800" />
        <div className="absolute inset-0 opacity-5">
          <div className="absolute inset-0" style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "40px 40px" }} />
        </div>
        <div className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={stagger}
          >
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl lg:text-5xl font-bold text-white mb-5" style={{ fontFamily: "'Playfair Display', serif" }}>
              Ready to Transform
              <br />
              Your Farm?
            </motion.h2>
            <motion.p variants={fadeUp} className="text-white/75 text-lg max-w-xl mx-auto mb-8">
              Join over 1,200 UAE farmers already using FALAJ to grow smarter, save water, and increase their yields.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <Button
                size="lg"
                className="bg-white text-emerald-800 hover:bg-white/90 text-base font-semibold rounded-full px-8 h-14 shadow-xl flex items-center gap-2"
                onClick={() => setLocation("/register")}
              >
                Get Started Free <ArrowRight className="w-5 h-5" />
              </Button>
              <Button
                variant="ghost"
                size="lg"
                className="text-white border border-white/25 hover:bg-white/10 rounded-full px-8 h-14 text-base"
                onClick={() => setLocation("/welcome")}
              >
                Contact Sales
              </Button>
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* ═══════ FOOTER ═══════ */}
      <footer className="bg-slate-950 py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="flex items-center gap-3">
              <img src={FALAJ_LOGO_WHITE} alt="FALAJ" className="h-6" />
              <span className="text-white/40 text-sm">Smart Agriculture Platform</span>
            </div>
            <div className="flex items-center gap-6">
              <a href="#features" className="text-white/50 hover:text-white/80 text-sm transition-colors">Features</a>
              <a href="#how-it-works" className="text-white/50 hover:text-white/80 text-sm transition-colors">How It Works</a>
              <a href="#testimonials" className="text-white/50 hover:text-white/80 text-sm transition-colors">Testimonials</a>
              <button onClick={() => setLocation("/about")} className="text-white/50 hover:text-white/80 text-sm transition-colors">About</button>
            </div>
            <div className="text-white/30 text-xs">
              &copy; 2026 FALAJ. All rights reserved. | www.falajae.com
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
