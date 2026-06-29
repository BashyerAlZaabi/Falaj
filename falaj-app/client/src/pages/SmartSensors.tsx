/**
 * FALAJ Smart Sensors — Pairing, Smart Valves, Water/Fertilizer Metering
 * Full sensor management: pair new sensors, control valves, monitor flow
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion, AnimatePresence } from "framer-motion";
import { useState, useMemo } from "react";
import { Link } from "wouter";
import {
  Droplets, Thermometer, Wind, Sun, Gauge, Leaf,
  ChevronRight, Wifi, WifiOff, Battery, QrCode,
  Plus, Power, PowerOff, Clock, Timer, Settings,
  Waves, Beaker, ArrowRight, CheckCircle2, Radio,
  AlertTriangle, ToggleLeft, ToggleRight, Pipette,
  Link2
} from "lucide-react";
import { toast } from "sonner";
import { useAppState } from "@/contexts/AppStateContext";

type SensorTab = "overview" | "valves" | "metering" | "pair";

/* ─── Sensor Display Config ─── */
const sensorDisplayConfig: Record<string, { icon: typeof Droplets; color: string; bg: string }> = {
  moisture: { icon: Droplets, color: "text-blue-500", bg: "bg-blue-50" },
  temperature: { icon: Thermometer, color: "text-amber-500", bg: "bg-amber-50" },
  ph: { icon: Gauge, color: "text-purple-500", bg: "bg-purple-50" },
  nitrogen: { icon: Leaf, color: "text-green-500", bg: "bg-green-50" },
};

/* ─── Smart Valves ─── */
const valves = [
  { id: 1, zone: "A", crop: "Tomatoes", status: "open", flowRate: 12.4, todayUsage: 420, schedule: "6:00 AM - 8:00 AM, 5:00 PM - 6:30 PM", autoMode: true },
  { id: 2, zone: "B", crop: "Cucumbers", status: "closed", flowRate: 0, todayUsage: 380, schedule: "7:00 AM - 9:00 AM", autoMode: true },
  { id: 3, zone: "C", crop: "Lettuce", status: "open", flowRate: 8.2, todayUsage: 290, schedule: "6:30 AM - 8:30 AM, 4:00 PM - 5:30 PM", autoMode: false },
  { id: 4, zone: "D", crop: "Herbs", status: "scheduled", flowRate: 0, todayUsage: 180, schedule: "Next: 5:00 PM today", autoMode: true },
  { id: 5, zone: "E", crop: "Date Palms", status: "open", flowRate: 15.8, todayUsage: 570, schedule: "5:00 AM - 9:00 AM, 4:00 PM - 7:00 PM", autoMode: true },
];

/* ─── Water Metering ─── */
const waterMetering = [
  { zone: "A", crop: "Tomatoes", flowRate: 12.4, todayL: 420, weekL: 2800, monthL: 11200, costPerL: 0.012, status: "normal" },
  { zone: "B", crop: "Cucumbers", flowRate: 0, todayL: 380, weekL: 2500, monthL: 10500, costPerL: 0.012, status: "over" },
  { zone: "C", crop: "Lettuce", flowRate: 8.2, todayL: 290, weekL: 1900, monthL: 7800, costPerL: 0.012, status: "normal" },
  { zone: "D", crop: "Herbs", flowRate: 0, todayL: 180, weekL: 1200, monthL: 4800, costPerL: 0.012, status: "normal" },
  { zone: "E", crop: "Date Palms", flowRate: 15.8, todayL: 570, weekL: 3800, monthL: 15200, costPerL: 0.012, status: "normal" },
];

/* ─── Fertilizer Metering ─── */
const fertilizerMetering = [
  { zone: "A", crop: "Tomatoes", type: "NPK 20-20-20", ppm: 250, appliedML: 3200, costAED: 27.2, status: "optimal" },
  { zone: "B", crop: "Cucumbers", type: "Calcium Nitrate", ppm: 180, appliedML: 2100, costAED: 17.85, status: "due" },
  { zone: "C", crop: "Lettuce", type: "NPK 15-5-30", ppm: 200, appliedML: 1800, costAED: 15.3, status: "optimal" },
  { zone: "E", crop: "Date Palms", type: "Potassium Sulfate", ppm: 300, appliedML: 3900, costAED: 33.15, status: "overdue" },
];

/* ─── Pairing Steps ─── */
const pairingSteps = [
  { step: 1, title: "Scan QR Code", desc: "Scan the QR code on your sensor or enter the sensor ID manually", icon: QrCode },
  { step: 2, title: "Select Sensor Type", desc: "Choose: Soil Moisture, Temperature, Humidity, Light, pH, NPK, Smart Valve, or Fertilizer Meter", icon: Radio },
  { step: 3, title: "Assign to Zone", desc: "Select which farm zone this sensor belongs to (A, B, C, D, or E)", icon: Gauge },
  { step: 4, title: "Select Crop Type", desc: "Choose the crop in this zone: Date Palms, Tomatoes, Cucumbers, Citrus, Mangoes, Herbs, etc.", icon: Leaf },
  { step: 5, title: "Test Connection", desc: "Verify the sensor is transmitting data correctly", icon: Wifi },
  { step: 6, title: "Done!", desc: "Sensor is paired and monitoring. You'll receive alerts automatically.", icon: CheckCircle2 },
];

const cropTypes = ["Date Palms", "Tomatoes", "Cucumbers", "Citrus", "Mangoes", "Lettuce", "Herbs", "Strawberries", "Peppers", "Eggplant"];
const sensorTypes = ["Soil Moisture", "Temperature", "Humidity", "Light", "Soil pH", "Nutrient (NPK)", "Smart Valve", "Fertilizer Meter"];

export default function SmartSensors() {
  const { sensors: contextSensors, pairSensor, pairAllSensors } = useAppState();
  const [activeTab, setActiveTab] = useState<SensorTab>("overview");
  const [pairingStep, setPairingStep] = useState(0);
  const [selectedSensorType, setSelectedSensorType] = useState("");
  const [selectedZone, setSelectedZone] = useState("");
  const [selectedCrop, setSelectedCrop] = useState("");
  const [valveStates, setValveStates] = useState<Record<number, string>>(
    Object.fromEntries(valves.map(v => [v.id, v.status]))
  );

  const pairedCount = contextSensors.filter(s => s.paired).length;
  const totalCount = contextSensors.length;
  const hasPairedSensors = pairedCount > 0;

  const tabs: { key: SensorTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Sensors", icon: <Radio className="w-3.5 h-3.5" /> },
    { key: "valves", label: "Valves", icon: <Waves className="w-3.5 h-3.5" /> },
    { key: "metering", label: "Metering", icon: <Gauge className="w-3.5 h-3.5" /> },
    { key: "pair", label: "Pair New", icon: <Plus className="w-3.5 h-3.5" /> },
  ];

  const toggleValve = (id: number) => {
    setValveStates(prev => ({
      ...prev,
      [id]: prev[id] === "open" ? "closed" : "open"
    }));
    toast.success(valveStates[id] === "open" ? "Valve closed" : "Valve opened");
  };

  const startPairing = () => {
    setPairingStep(1);
    setSelectedSensorType("");
    setSelectedZone("");
    setSelectedCrop("");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button onClick={() => window.history.back()} className="p-1.5 -ml-1.5 rounded-xl hover:bg-muted transition-colors">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <Radio className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Smart Sensors</span>
            </div>
            <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full ${hasPairedSensors ? 'bg-emerald-50' : 'bg-gray-100'}`}>
              <Wifi className={`w-3.5 h-3.5 ${hasPairedSensors ? 'text-emerald-500' : 'text-gray-400'}`} />
              <span className={`text-xs font-bold ${hasPairedSensors ? 'text-emerald-700' : 'text-gray-500'}`}>{pairedCount}/{totalCount}</span>
            </div>
          </div>
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-gradient-to-r from-emerald-600 to-green-600 text-white shadow-md shadow-emerald-200/40"
                    : "bg-muted/40 text-muted-foreground hover:bg-muted/70"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* ═══════ SENSOR OVERVIEW ═══════ */}
        {activeTab === "overview" && (
          <motion.div key="overview" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Pair All button when some sensors are unpaired */}
            {pairedCount < totalCount && pairedCount > 0 && (
              <button
                onClick={() => { pairAllSensors(); toast.success("All sensors paired!"); }}
                className="w-full mb-3 py-2.5 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-md active:scale-[0.98] transition-transform"
              >
                <Link2 className="w-4 h-4" />
                Pair All Remaining Sensors
              </button>
            )}

            <div className="space-y-2">
              {contextSensors.map((s) => {
                const isPaired = s.paired;
                return (
                  <div key={s.id} className={`bg-card rounded-xl border p-3 flex items-center gap-3 transition-all ${isPaired ? 'border-border/40 hover:shadow-md active:scale-[0.98]' : 'border-dashed border-gray-300'}`}>
                    <div className={`p-2.5 rounded-xl ${isPaired ? 'bg-blue-50' : 'bg-gray-50'}`}>
                      <Radio className={`w-5 h-5 ${isPaired ? 'text-blue-500' : 'text-gray-300'}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className={`text-sm font-semibold truncate ${!isPaired ? 'text-gray-400' : ''}`}>{s.name}</p>
                        {isPaired ? (
                          <Wifi className="w-3 h-3 text-emerald-500 shrink-0" />
                        ) : (
                          <WifiOff className="w-3 h-3 text-gray-300 shrink-0" />
                        )}
                      </div>
                      <p className="text-[10px] text-muted-foreground">{s.zone} · {s.depth}</p>
                    </div>
                    <div className="text-right shrink-0">
                      {isPaired ? (
                        <>
                          <p className="text-sm font-bold">{s.moisture}%</p>
                          <div className="flex items-center gap-0.5 justify-end">
                            <Battery className={`w-3 h-3 ${s.battery < 20 ? "text-red-500" : s.battery < 50 ? "text-amber-500" : "text-emerald-500"}`} />
                            <span className="text-[9px] text-muted-foreground">{s.battery}%</span>
                          </div>
                        </>
                      ) : (
                        <button
                          onClick={() => { pairSensor(s.id); toast.success(`${s.name} paired!`); }}
                          className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-[10px] font-bold active:scale-95 transition-transform"
                        >
                          Pair
                        </button>
                      )}
                    </div>
                    {isPaired && <ChevronRight className="w-4 h-4 text-muted-foreground/30 shrink-0" />}
                  </div>
                );
              })}
            </div>

            {/* Empty state when no sensors paired */}
            {!hasPairedSensors && (
              <div className="mt-4 bg-blue-50/50 rounded-2xl border border-blue-100 p-5 text-center">
                <Radio className="w-10 h-10 text-blue-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-foreground mb-1">Sensors Awaiting Pairing</p>
                <p className="text-xs text-muted-foreground mb-4">Tap "Pair" on each sensor above, or pair them all at once to start receiving live data.</p>
                <button
                  onClick={() => { pairAllSensors(); toast.success("All sensors paired!"); }}
                  className="w-full py-3 bg-gradient-to-r from-emerald-600 to-green-600 text-white rounded-xl text-xs font-bold flex items-center justify-center gap-2 shadow-lg shadow-emerald-200/40 active:scale-[0.98] transition-transform"
                >
                  <Link2 className="w-4 h-4" />
                  Pair All {totalCount} Sensors
                </button>
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════ SMART VALVES ═══════ */}
        {activeTab === "valves" && (
          <motion.div key="valves" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            <div className="space-y-3">
              {valves.map((v) => {
                const isOpen = valveStates[v.id] === "open";
                return (
                  <div key={v.id} className="bg-card rounded-xl border border-border/40 p-4">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${isOpen ? "bg-cyan-50" : "bg-slate-100"}`}>
                          <Waves className={`w-5 h-5 ${isOpen ? "text-cyan-600" : "text-slate-400"}`} />
                        </div>
                        <div>
                          <p className="text-sm font-semibold">Zone {v.zone} — {v.crop}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {isOpen ? `Flowing: ${v.flowRate} L/min` : "Valve Closed"}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => toggleValve(v.id)}
                        className={`p-2 rounded-xl transition-all ${isOpen ? "bg-cyan-100 text-cyan-700" : "bg-slate-100 text-slate-500"}`}
                      >
                        {isOpen ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className={`text-sm font-bold ${isOpen ? "text-cyan-600" : "text-slate-500"}`}>
                          {isOpen ? "OPEN" : "CLOSED"}
                        </p>
                        <p className="text-[8px] text-muted-foreground">Status</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-sm font-bold text-blue-600">{v.todayUsage}L</p>
                        <p className="text-[8px] text-muted-foreground">Today</p>
                      </div>
                      <div className="bg-muted/30 rounded-lg p-2 text-center">
                        <p className="text-sm font-bold">{v.autoMode ? "AUTO" : "MANUAL"}</p>
                        <p className="text-[8px] text-muted-foreground">Mode</p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 bg-muted/20 rounded-lg px-2.5 py-1.5">
                      <Clock className="w-3 h-3 text-muted-foreground" />
                      <span className="text-[10px] text-muted-foreground">{v.schedule}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══════ METERING ═══════ */}
        {activeTab === "metering" && (
          <motion.div key="metering" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {/* Water Metering */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
              <Droplets className="w-3.5 h-3.5 text-blue-500" /> Water Consumption
            </h3>
            <div className="space-y-2 mb-5">
              {waterMetering.map((w) => (
                <div key={w.zone} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-blue-50 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-blue-600">{w.zone}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{w.crop}</p>
                        <p className="text-[9px] text-muted-foreground">
                          {w.flowRate > 0 ? `${w.flowRate} L/min flowing` : "Valve closed"}
                        </p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      w.status === "over" ? "bg-red-50 text-red-700 border-red-200" : "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>{w.status}</span>
                  </div>
                  <div className="grid grid-cols-4 gap-1.5">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-blue-600">{w.todayL}L</p>
                      <p className="text-[7px] text-muted-foreground">Today</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{(w.weekL / 1000).toFixed(1)}K</p>
                      <p className="text-[7px] text-muted-foreground">Week</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{(w.monthL / 1000).toFixed(1)}K</p>
                      <p className="text-[7px] text-muted-foreground">Month</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600">{(w.monthL * w.costPerL).toFixed(0)}</p>
                      <p className="text-[7px] text-muted-foreground">AED/mo</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Fertilizer Metering */}
            <h3 className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.15em] mb-2 flex items-center gap-1.5">
              <Pipette className="w-3.5 h-3.5 text-green-500" /> Fertilizer Injection
            </h3>
            <div className="space-y-2">
              {fertilizerMetering.map((f) => (
                <div key={f.zone} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-lg bg-green-50 flex items-center justify-center">
                        <span className="text-[10px] font-bold text-green-700">{f.zone}</span>
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{f.crop}</p>
                        <p className="text-[9px] text-muted-foreground">{f.type}</p>
                      </div>
                    </div>
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-full border ${
                      f.status === "overdue" ? "bg-red-50 text-red-700 border-red-200" :
                      f.status === "due" ? "bg-orange-50 text-orange-700 border-orange-200" :
                      "bg-emerald-50 text-emerald-700 border-emerald-200"
                    }`}>{f.status}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-green-600">{f.ppm} ppm</p>
                      <p className="text-[7px] text-muted-foreground">Concentration</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{f.appliedML} mL</p>
                      <p className="text-[7px] text-muted-foreground">Applied</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold text-emerald-600">{f.costAED} AED</p>
                      <p className="text-[7px] text-muted-foreground">Cost</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ PAIR NEW SENSOR ═══════ */}
        {activeTab === "pair" && (
          <motion.div key="pair" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} className="max-w-[480px] mx-auto px-4 pt-4">
            {pairingStep === 0 ? (
              <div className="text-center py-8">
                <div className="w-20 h-20 rounded-3xl bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                  <Plus className="w-10 h-10 text-emerald-600" />
                </div>
                <h3 className="text-lg font-bold mb-2">Add New Sensor</h3>
                <p className="text-sm text-muted-foreground mb-6 max-w-[280px] mx-auto">
                  Pair a new IoT sensor to your farm in just a few steps. Solar-powered, no wiring needed.
                </p>
                <button
                  onClick={startPairing}
                  className="bg-gradient-to-r from-emerald-600 to-green-600 text-white px-8 py-3 rounded-xl font-semibold shadow-lg shadow-emerald-200/40 hover:shadow-xl transition-all active:scale-[0.97]"
                >
                  Start Pairing
                </button>

                {/* Steps Preview */}
                <div className="mt-8 space-y-3">
                  {pairingSteps.map((s) => {
                    const Icon = s.icon;
                    return (
                      <div key={s.step} className="flex items-center gap-3 bg-card rounded-xl border border-border/40 p-3 text-left">
                        <div className="w-8 h-8 rounded-lg bg-emerald-50 flex items-center justify-center shrink-0">
                          <span className="text-xs font-bold text-emerald-600">{s.step}</span>
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{s.title}</p>
                          <p className="text-[9px] text-muted-foreground">{s.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div>
                {/* Progress Bar */}
                <div className="flex items-center gap-1 mb-6">
                  {pairingSteps.map((s) => (
                    <div
                      key={s.step}
                      className={`flex-1 h-1.5 rounded-full transition-all ${
                        s.step <= pairingStep ? "bg-emerald-500" : "bg-muted"
                      }`}
                    />
                  ))}
                </div>

                <div className="text-center mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-50 flex items-center justify-center mx-auto mb-3">
                    {(() => { const Icon = pairingSteps[pairingStep - 1].icon; return <Icon className="w-8 h-8 text-emerald-600" />; })()}
                  </div>
                  <h3 className="text-lg font-bold">{pairingSteps[pairingStep - 1].title}</h3>
                  <p className="text-xs text-muted-foreground mt-1">{pairingSteps[pairingStep - 1].desc}</p>
                </div>

                {/* Step Content */}
                {pairingStep === 1 && (
                  <div className="space-y-3">
                    <div className="bg-muted/30 rounded-2xl p-8 flex items-center justify-center border-2 border-dashed border-muted-foreground/20">
                      <div className="text-center">
                        <QrCode className="w-16 h-16 text-muted-foreground/40 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">Tap to scan QR code</p>
                      </div>
                    </div>
                    <div className="text-center text-[10px] text-muted-foreground">or enter sensor ID manually</div>
                    <input
                      type="text"
                      placeholder="Enter Sensor ID (e.g., FALAJ-S-001)"
                      className="w-full border border-border rounded-xl px-4 py-3 text-sm bg-card focus:outline-none focus:ring-2 focus:ring-emerald-500/30"
                    />
                  </div>
                )}

                {pairingStep === 2 && (
                  <div className="grid grid-cols-2 gap-2">
                    {sensorTypes.map((type) => (
                      <button
                        key={type}
                        onClick={() => setSelectedSensorType(type)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedSensorType === type
                            ? "border-emerald-500 bg-emerald-50 shadow-md"
                            : "border-border/40 bg-card hover:border-emerald-300"
                        }`}
                      >
                        <p className="text-xs font-semibold">{type}</p>
                      </button>
                    ))}
                  </div>
                )}

                {pairingStep === 3 && (
                  <div className="grid grid-cols-5 gap-2">
                    {["A", "B", "C", "D", "E"].map((zone) => (
                      <button
                        key={zone}
                        onClick={() => setSelectedZone(zone)}
                        className={`p-4 rounded-xl border text-center transition-all ${
                          selectedZone === zone
                            ? "border-emerald-500 bg-emerald-50 shadow-md"
                            : "border-border/40 bg-card hover:border-emerald-300"
                        }`}
                      >
                        <p className="text-lg font-bold">{zone}</p>
                        <p className="text-[8px] text-muted-foreground">Zone</p>
                      </button>
                    ))}
                  </div>
                )}

                {pairingStep === 4 && (
                  <div className="grid grid-cols-2 gap-2">
                    {cropTypes.map((crop) => (
                      <button
                        key={crop}
                        onClick={() => setSelectedCrop(crop)}
                        className={`p-3 rounded-xl border text-left transition-all ${
                          selectedCrop === crop
                            ? "border-emerald-500 bg-emerald-50 shadow-md"
                            : "border-border/40 bg-card hover:border-emerald-300"
                        }`}
                      >
                        <p className="text-xs font-semibold">{crop}</p>
                      </button>
                    ))}
                  </div>
                )}

                {pairingStep === 5 && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-full border-4 border-emerald-200 border-t-emerald-600 animate-spin mx-auto mb-4" />
                    <p className="text-sm font-semibold">Testing connection...</p>
                    <p className="text-xs text-muted-foreground mt-1">This usually takes 5-10 seconds</p>
                  </div>
                )}

                {pairingStep === 6 && (
                  <div className="text-center py-4">
                    <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-4">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600" />
                    </div>
                    <p className="text-lg font-bold text-emerald-700">Sensor Paired!</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      {selectedSensorType} → Zone {selectedZone} → {selectedCrop}
                    </p>
                  </div>
                )}

                {/* Navigation Buttons */}
                <div className="flex gap-2 mt-6">
                  {pairingStep > 1 && (
                    <button
                      onClick={() => setPairingStep(pairingStep - 1)}
                      className="flex-1 py-3 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
                    >
                      Back
                    </button>
                  )}
                  <button
                    onClick={() => {
                      if (pairingStep < 6) {
                        setPairingStep(pairingStep + 1);
                      } else {
                        setPairingStep(0);
                        toast.success("Sensor successfully paired!");
                      }
                    }}
                    className="flex-1 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-md hover:shadow-lg transition-all active:scale-[0.97]"
                  >
                    {pairingStep === 6 ? "Done" : pairingStep === 5 ? "Verify" : "Next"}
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
