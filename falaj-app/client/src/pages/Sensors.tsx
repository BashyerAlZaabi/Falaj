/**
 * FALAJ Sensors Page
 * Design: Desert Minimalism — list of sensor cards with status indicators
 * Shows unpaired state when sensors haven't been paired yet
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { Link } from "wouter";
import { useMemo } from "react";
import { useAppState } from "@/contexts/AppStateContext";
import {
  Droplets, Thermometer, Wind, Sun, Gauge, Leaf,
  ChevronRight, Wifi, WifiOff, Battery, Radio
} from "lucide-react";

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.05 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function Sensors() {
  const { sensors } = useAppState();
  const pairedSensors = useMemo(() => sensors.filter(s => s.paired), [sensors]);
  const hasPairedSensors = pairedSensors.length > 0;

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Sensors" />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Summary */}
        <motion.div variants={fadeUp} className="flex items-center gap-3 mb-4">
          <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
            <p className="text-2xl font-bold text-primary">{sensors.length}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Total</p>
          </div>
          <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
            <p className={`text-2xl font-bold ${hasPairedSensors ? 'text-green-600' : 'text-gray-300'}`}>{pairedSensors.length}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Paired</p>
          </div>
          <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
            <p className={`text-2xl font-bold ${!hasPairedSensors ? 'text-gray-300' : 'text-amber-500'}`}>{sensors.length - pairedSensors.length}</p>
            <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Unpaired</p>
          </div>
        </motion.div>

        {/* Sensor List */}
        <div className="space-y-2.5">
          {sensors.map((sensor) => {
            const isPaired = sensor.paired;
            return (
              <motion.div key={sensor.id} variants={fadeUp}>
                <Link href={`/sensors/${sensor.id}`}>
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
                </Link>
              </motion.div>
            );
          })}
        </div>

        {/* Empty state hint */}
        {!hasPairedSensors && (
          <motion.div variants={fadeUp} className="mt-4 bg-blue-50/50 rounded-2xl border border-blue-100 p-5 text-center">
            <Radio className="w-10 h-10 text-blue-300 mx-auto mb-2" />
            <p className="text-sm font-bold text-foreground mb-1">Sensors Awaiting Pairing</p>
            <p className="text-xs text-muted-foreground mb-4">Go to Smart Sensors to pair your IoT devices and start receiving live data.</p>
            <Link href="/smart-sensors">
              <button className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-200/40 active:scale-[0.98] transition-transform">
                Go to Smart Sensors
              </button>
            </Link>
          </motion.div>
        )}
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
