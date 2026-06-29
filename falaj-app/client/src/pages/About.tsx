/*
 * FALAJ About Page
 * Design: Desert Minimalism — brand story with product images and team info
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { Droplets, Target, Eye, Users, Award, Leaf, Zap, Globe } from "lucide-react";

const timeline = [
  { year: "2023", event: "FALAJ concept developed at HBMSU" },
  { year: "2024", event: "Prototype built and field tested" },
  { year: "2025", event: "AI model development & GIS integration" },
  { year: "2026", event: "Phase 2: Online marketplace & rewards" },
  { year: "2027", event: "Large-scale deployment across UAE" },
];

const stats = [
  { label: "Farms Connected", value: "40K+", icon: Globe },
  { label: "Water Saved", value: "70%", icon: Droplets },
  { label: "Crop Types", value: "70+", icon: Leaf },
  { label: "AI Accuracy", value: "92%", icon: Zap },
];

export default function About() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="About FALAJ" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Hero */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 bg-primary/5 px-4 py-2 rounded-2xl mb-4">
            <Droplets className="w-6 h-6 text-primary" />
            <span className="text-xl font-bold tracking-tight">FALAJ</span>
          </div>
          <h2 className="text-2xl font-bold tracking-tight mb-2">Smart Agriculture for the UAE</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Revolutionizing water management in farming through sustainable and efficient IoT solutions.
          </p>
        </div>

        {/* Product Gallery */}
        <div className="grid grid-cols-2 gap-2 mb-6">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-40_9524cdbb.jpg"
            alt="FALAJ product"
            className="w-full h-28 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-41_b22a2001.jpg"
            alt="FALAJ product"
            className="w-full h-28 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-412_f28ee747.jpg"
            alt="FALAJ product"
            className="w-full h-28 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-413_3935f421.jpg"
            alt="FALAJ product"
            className="w-full h-28 object-cover rounded-xl"
          />
        </div>

        {/* Zayed Heritage */}
        <div className="relative rounded-2xl overflow-hidden mb-6 h-32">
          <img src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/zayed-desert-garden-Mgf3NaaThAMGknNDn3AVSp.webp" alt="Zayed's Legacy" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/80 via-emerald-900/50 to-transparent" />
          <div className="absolute inset-0 flex items-center px-5">
            <div>
              <p className="text-white text-sm font-semibold mb-1" style={{ fontFamily: "'Playfair Display', serif" }}>Inspired by Sheikh Zayed</p>
              <p className="text-white/80 text-xs italic">"The real wealth of a nation lies in its soil and the hands that tend it."</p>
              <p className="text-white/50 text-[9px] mt-1">Continuing the founding father's agricultural vision</p>
            </div>
          </div>
        </div>

        {/* Mission & Vision */}
        <div className="space-y-3 mb-6">
          <div className="bg-card rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-blue-50">
                <Target className="w-4 h-4 text-blue-600" />
              </div>
              <h3 className="text-sm font-bold">Our Mission</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              To revolutionize water management in farming through sustainable and efficient solutions, 
              making smart agriculture accessible to every farmer in the UAE and beyond.
            </p>
          </div>
          <div className="bg-card rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-2 mb-2">
              <div className="p-2 rounded-xl bg-violet-50">
                <Eye className="w-4 h-4 text-violet-600" />
              </div>
              <h3 className="text-sm font-bold">Our Vision</h3>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              A future where every farm in the UAE operates at peak efficiency, contributing to the 
              2051 National Food Security Strategy through modern technology and data-driven agriculture.
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-card rounded-2xl border border-border/50 p-3 text-center">
                <Icon className="w-5 h-5 text-primary mx-auto mb-1" />
                <p className="text-xl font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground font-medium">{stat.label}</p>
              </div>
            );
          })}
        </div>

        {/* The Problem */}
        <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-2xl p-4 border border-red-100 mb-6">
          <h3 className="text-sm font-bold text-red-900 mb-2">The Problem We Solve</h3>
          <ul className="space-y-2">
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <span className="text-xs text-red-800">80% of UAE food is imported — local production must increase</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <span className="text-xs text-red-800">Farm resource over-consumption, especially water</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <span className="text-xs text-red-800">Complicated, expensive existing technology</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="w-1.5 h-1.5 rounded-full bg-red-400 mt-1.5 shrink-0" />
              <span className="text-xs text-red-800">Lack of business and technical know-how for farmers</span>
            </li>
          </ul>
        </div>

        {/* Competitive Advantages */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Why FALAJ?</h3>
        <div className="grid grid-cols-2 gap-2.5 mb-6">
          {[
            { label: "Ease of Use", desc: "Simple setup, intuitive interface" },
            { label: "Real-time Data", desc: "Live monitoring 24/7" },
            { label: "Modern Tech", desc: "AI-powered recommendations" },
            { label: "Affordable", desc: "Accessible pricing for all" },
            { label: "Financial Coverage", desc: "ROI tracking for farmers" },
            { label: "Community", desc: "Connect with stakeholders" },
          ].map((item) => (
            <div key={item.label} className="bg-card rounded-2xl border border-border/50 p-3">
              <p className="text-xs font-bold mb-0.5">{item.label}</p>
              <p className="text-[10px] text-muted-foreground">{item.desc}</p>
            </div>
          ))}
        </div>

        {/* Timeline */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Our Journey</h3>
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <div className="space-y-4">
            {timeline.map((item, i) => (
              <div key={item.year} className="flex items-start gap-3">
                <div className="flex flex-col items-center">
                  <div className={`w-3 h-3 rounded-full border-2 ${
                    i <= 2 ? "bg-primary border-primary" : "bg-white border-muted-foreground/30"
                  }`} />
                  {i < timeline.length - 1 && (
                    <div className={`w-0.5 h-8 ${i < 2 ? "bg-primary/30" : "bg-border"}`} />
                  )}
                </div>
                <div className="-mt-0.5">
                  <p className="text-xs font-bold text-primary">{item.year}</p>
                  <p className="text-xs text-muted-foreground">{item.event}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Our Team</h3>
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
              <Users className="w-6 h-6 text-primary" />
            </div>
            <div>
              <p className="text-sm font-bold">Bashyer AlZaabi</p>
              <p className="text-xs text-muted-foreground">Project Management & Development</p>
              <p className="text-[10px] text-muted-foreground">Computer Engineer & IT Specialist</p>
            </div>
          </div>
        </div>

        {/* More Product Images */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Our Product</h3>
        <div className="grid grid-cols-3 gap-2 mb-6">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-414_c6cdfb02.jpg"
            alt="FALAJ product"
            className="w-full h-24 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-415_8d36bda2.jpg"
            alt="FALAJ product"
            className="w-full h-24 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-416_b50523f7.jpg"
            alt="FALAJ product"
            className="w-full h-24 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-417_b60eda9f.jpg"
            alt="FALAJ product"
            className="w-full h-24 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-404_dddf61c1.jpg"
            alt="FALAJ product"
            className="w-full h-24 object-cover rounded-xl"
          />
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-01-20-18-11-405_760ee25b.jpg"
            alt="FALAJ product"
            className="w-full h-24 object-cover rounded-xl"
          />
        </div>

        {/* Footer */}
        <div className="text-center mb-4">
          <p className="text-xs text-muted-foreground">www.falajae.com</p>
          <p className="text-[10px] text-muted-foreground mt-1">Aligned with UAE 2051 National Food Security Strategy</p>
        </div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
