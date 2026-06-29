/*
 * FALAJ Sensors & Map Page (Combined)
 * Design: Desert Minimalism — tabbed view: Sensors list + Farm Map
 * Tabs at top to switch between sensor list view and map view
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import { useAppState } from "@/contexts/AppStateContext";
import {
  Droplets, Thermometer, Wind, Sun, Gauge, Leaf,
  ChevronRight, Wifi, WifiOff, Battery,
  MapPin, Radio, Map as MapIcon, Bell, Settings
} from "lucide-react";



const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function SensorsMap() {
  const { sensors: contextSensors, pairSensor, pairAllSensors } = useAppState();
  const [activeTab, setActiveTab] = useState<"sensors" | "map">("sensors");
  const pairedSensors = useMemo(() => contextSensors.filter(s => s.paired), [contextSensors]);
  const hasPairedSensors = pairedSensors.length > 0;

  // Build zone data from context sensors
  const zoneData = useMemo(() => {
    const zones: Record<string, typeof contextSensors> = {};
    contextSensors.forEach(s => {
      if (!zones[s.zone]) zones[s.zone] = [];
      zones[s.zone].push(s);
    });
    return Object.entries(zones).map(([zone, nodes]) => {
      const paired = nodes.filter(n => n.paired);
      const allPaired = paired.length === nodes.length;
      const avgMoisture = allPaired ? Math.round(nodes.reduce((a, n) => a + n.moisture, 0) / nodes.length) : 0;
      const avgTemp = allPaired ? Math.round(nodes.reduce((a, n) => a + n.temperature, 0) / nodes.length * 10) / 10 : 0;
      return { zone, nodes: nodes.length, paired: paired.length, allPaired, moisture: avgMoisture, temp: avgTemp };
    });
  }, [contextSensors]);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Droplets className="w-5 h-5 text-primary" />
              <span className="text-lg font-bold tracking-tight">Sensors & Map</span>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/ai-recommendations">
                <button className="p-2 rounded-xl hover:bg-muted transition-colors relative">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                </button>
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab("sensors")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === "sensors"
                  ? "bg-primary text-white shadow-sm shadow-primary/20"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <Radio className="w-4 h-4" />
              Sensors
            </button>
            <button
              onClick={() => setActiveTab("map")}
              className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all duration-200 ${
                activeTab === "map"
                  ? "bg-primary text-white shadow-sm shadow-primary/20"
                  : "bg-muted/50 text-muted-foreground hover:bg-muted"
              }`}
            >
              <MapIcon className="w-4 h-4" />
              Farm Map
            </button>
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {activeTab === "sensors" ? (
          <motion.div
            key="sensors"
            variants={stagger}
            initial="hidden"
            animate="show"
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            {/* Summary Stats */}
            <motion.div variants={fadeUp} className="flex items-center gap-3 mb-4">
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-2xl font-bold text-primary">{contextSensors.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</p>
              </div>
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className={`text-2xl font-bold ${hasPairedSensors ? 'text-green-600' : 'text-gray-300'}`}>{pairedSensors.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Paired</p>
              </div>
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className={`text-2xl font-bold ${!hasPairedSensors ? 'text-gray-300' : 'text-amber-500'}`}>{contextSensors.length - pairedSensors.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Unpaired</p>
              </div>
            </motion.div>

            {/* Sensor List */}
            <div className="space-y-2.5">
              {contextSensors.map((sensor) => {
                const isPaired = sensor.paired;
                return (
                  <motion.div key={sensor.id} variants={fadeUp}>
                    <div className={`flex items-center gap-3 p-3.5 bg-card rounded-2xl border transition-all duration-200 ${isPaired ? 'border-border/50 hover:shadow-md' : 'border-dashed border-gray-300'}`}>
                      <div className={`p-2.5 rounded-xl ${isPaired ? 'bg-blue-50' : 'bg-gray-50'}`}>
                        <Radio className={`w-5 h-5 ${isPaired ? 'text-blue-500' : 'text-gray-300'}`} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-semibold truncate ${!isPaired ? 'text-gray-400' : ''}`}>{sensor.name}</p>
                        <p className="text-xs text-muted-foreground truncate">{sensor.zone} · {sensor.depth}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {isPaired ? (
                            <Wifi className="w-3 h-3 text-green-500" />
                          ) : (
                            <WifiOff className="w-3 h-3 text-gray-300" />
                          )}
                          <span className={`text-[10px] font-medium ${isPaired ? 'text-green-600' : 'text-gray-400'}`}>
                            {isPaired ? 'Paired' : 'Not Paired'}
                          </span>
                          {isPaired && (
                            <>
                              <span className="text-muted-foreground/30">|</span>
                              <Battery className={`w-3 h-3 ${sensor.battery < 20 ? "text-red-400" : "text-muted-foreground"}`} />
                              <span className="text-[10px] text-muted-foreground">{sensor.battery}%</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right flex flex-col items-end gap-1">
                        {isPaired ? (
                          <p className="text-sm font-bold">{sensor.moisture}%</p>
                        ) : (
                          <p className="text-sm font-bold text-gray-300">--</p>
                        )}
                        <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        ) : (
          <motion.div
            key="map"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
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
              {zoneData.map((z, i) => (
                <motion.div
                  key={z.zone}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <div className={`bg-card rounded-2xl border p-4 transition-all duration-200 ${z.allPaired ? 'border-border/50 hover:shadow-md' : 'border-dashed border-gray-300'}`}>
                    <div className="flex items-center justify-between mb-2.5">
                      <div className="flex items-center gap-2">
                        <div className={`w-2.5 h-2.5 rounded-full ${z.allPaired ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <h4 className="text-sm font-bold">{z.zone}</h4>
                      </div>
                      <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                        z.allPaired ? 'bg-green-50 text-green-600' : 'bg-gray-100 text-gray-400'
                      }`}>{z.allPaired ? 'Online' : `${z.paired}/${z.nodes} paired`}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-1">
                        <Droplets className={`w-3.5 h-3.5 ${z.allPaired ? 'text-blue-400' : 'text-gray-300'}`} />
                        <span className={`text-xs ${z.allPaired ? 'text-muted-foreground' : 'text-gray-300'}`}>{z.allPaired ? `${z.moisture}%` : '--'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Thermometer className={`w-3.5 h-3.5 ${z.allPaired ? 'text-amber-400' : 'text-gray-300'}`} />
                        <span className={`text-xs ${z.allPaired ? 'text-muted-foreground' : 'text-gray-300'}`}>{z.allPaired ? `${z.temp}°C` : '--'}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                        <span className="text-xs text-muted-foreground">{z.nodes} sensors</span>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
