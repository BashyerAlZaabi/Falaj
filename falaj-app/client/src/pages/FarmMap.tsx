/*
 * FALAJ Farm Map Page
 * Design: Desert Minimalism — aerial farm view with zone overlays
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { MapPin, Droplets, Thermometer, Leaf, Sun, ChevronRight } from "lucide-react";
import { Link } from "wouter";

const zones = [
  { id: "A", name: "Zone A", crop: "Tomatoes", status: "healthy", moisture: "42%", temp: "34°C", color: "bg-green-500", sensors: 2 },
  { id: "B", name: "Zone B", crop: "Cucumbers", status: "warning", moisture: "28%", temp: "36°C", color: "bg-amber-500", sensors: 1 },
  { id: "C", name: "Zone C", crop: "Lettuce", status: "healthy", moisture: "65%", temp: "30°C", color: "bg-green-500", sensors: 1 },
  { id: "D", name: "Zone D", crop: "Herbs", status: "healthy", moisture: "55%", temp: "32°C", color: "bg-green-500", sensors: 1 },
  { id: "E", name: "Zone E", crop: "Date Palms", status: "critical", moisture: "18%", temp: "38°C", color: "bg-red-500", sensors: 1 },
];

export default function FarmMap() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Farm Map" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Map Image */}
        <div className="relative rounded-2xl overflow-hidden mb-4 border border-border/50">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/farm-aerial-dvA8wiWsHMaPvgY8TpZeXt.webp"
            alt="Aerial farm view"
            className="w-full h-52 object-cover"
          />
          <div className="absolute inset-0 bg-black/20" />
          
          {/* Zone Pins */}
          <div className="absolute top-6 left-8 flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow animate-pulse" />
            <span className="text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">A</span>
          </div>
          <div className="absolute top-10 right-12 flex items-center gap-1">
            <div className="w-3 h-3 bg-amber-500 rounded-full border-2 border-white shadow animate-pulse" />
            <span className="text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">B</span>
          </div>
          <div className="absolute bottom-16 left-16 flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow animate-pulse" />
            <span className="text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">C</span>
          </div>
          <div className="absolute bottom-12 right-20 flex items-center gap-1">
            <div className="w-3 h-3 bg-green-500 rounded-full border-2 border-white shadow animate-pulse" />
            <span className="text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">D</span>
          </div>
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-1">
            <div className="w-3 h-3 bg-red-500 rounded-full border-2 border-white shadow animate-pulse" />
            <span className="text-[10px] font-bold text-white bg-black/40 px-1.5 py-0.5 rounded">E</span>
          </div>

          {/* Legend */}
          <div className="absolute bottom-2 right-2 bg-white/90 backdrop-blur-sm rounded-lg px-2 py-1 flex items-center gap-2">
            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-green-500 rounded-full" /><span className="text-[9px]">Healthy</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-amber-500 rounded-full" /><span className="text-[9px]">Warning</span></div>
            <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full" /><span className="text-[9px]">Critical</span></div>
          </div>
        </div>

        {/* Zone Cards */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Farm Zones</h3>
        <div className="space-y-2.5">
          {zones.map((zone) => (
            <motion.div
              key={zone.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: zones.indexOf(zone) * 0.05 }}
            >
              <div className="bg-card rounded-2xl border border-border/50 p-4 hover:shadow-md transition-all duration-200">
                <div className="flex items-center justify-between mb-2.5">
                  <div className="flex items-center gap-2">
                    <div className={`w-2.5 h-2.5 rounded-full ${zone.color}`} />
                    <h4 className="text-sm font-bold">{zone.name}</h4>
                    <span className="text-xs text-muted-foreground">— {zone.crop}</span>
                  </div>
                  <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full capitalize ${
                    zone.status === "healthy" ? "bg-green-50 text-green-600" :
                    zone.status === "warning" ? "bg-amber-50 text-amber-600" :
                    "bg-red-50 text-red-600"
                  }`}>{zone.status}</span>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-1">
                    <Droplets className="w-3.5 h-3.5 text-blue-400" />
                    <span className="text-xs text-muted-foreground">{zone.moisture}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Thermometer className="w-3.5 h-3.5 text-amber-400" />
                    <span className="text-xs text-muted-foreground">{zone.temp}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                    <span className="text-xs text-muted-foreground">{zone.sensors} sensors</span>
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
