/*
 * Sensor Calibration — Guided step-by-step recalibration flow
 * Design: Professional, clean, matches FALAJ green/blue/white theme
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAppState } from "@/contexts/AppStateContext";
import { motion, AnimatePresence } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import {
  ChevronLeft, ChevronRight, Radio, CheckCircle2,
  Droplets, Thermometer, FlaskConical, Leaf,
  RotateCcw, Zap, Shield, AlertTriangle, Check
} from "lucide-react";


const CALIBRATION_STEPS = [
  {
    step: 1,
    title: "Select Sensor Node",
    description: "Choose the sensor node you want to calibrate from your farm zones.",
    icon: Radio,
  },
  {
    step: 2,
    title: "Prepare Environment",
    description: "Ensure the sensor is clean and the soil around it is undisturbed. Remove any debris or buildup from the sensor probes.",
    icon: Shield,
  },
  {
    step: 3,
    title: "Reference Solution Test",
    description: "Place the pH probe in the reference buffer solution (pH 7.0). Wait 30 seconds for the reading to stabilize.",
    icon: FlaskConical,
  },
  {
    step: 4,
    title: "Moisture Calibration",
    description: "Pour 100ml of distilled water at the sensor base. The moisture reading should reach 85-95%. Adjust the offset if needed.",
    icon: Droplets,
  },
  {
    step: 5,
    title: "Temperature Verification",
    description: "Compare the sensor temperature reading with a reference thermometer. The difference should be within ±0.5°C.",
    icon: Thermometer,
  },
  {
    step: 6,
    title: "NPK Baseline Check",
    description: "Insert the NPK probe into the calibration soil sample. Verify readings match the lab-tested values within ±10%.",
    icon: Leaf,
  },
  {
    step: 7,
    title: "Calibration Complete",
    description: "All sensor readings have been verified and calibrated. The node is now ready for accurate monitoring.",
    icon: CheckCircle2,
  },
];

export default function SensorCalibration() {
  const { sensors, calibrateSensor } = useAppState();

  const [, navigate] = useLocation();
  const [currentStep, setCurrentStep] = useState(0);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [stepCompleted, setStepCompleted] = useState<boolean[]>(new Array(7).fill(false));

  const zones = useMemo(() => {
    const grouped: Record<string, typeof sensors> = {};
    sensors.forEach(s => {
      if (!grouped[s.zone]) grouped[s.zone] = [];
      grouped[s.zone].push(s);
    });
    return Object.entries(grouped);
  }, [sensors]);

  const selectedSensor = sensors.find(s => s.id === selectedNode);

  const handleSelectNode = (nodeId: string) => {
    setSelectedNode(nodeId);
    const newCompleted = [...stepCompleted];
    newCompleted[0] = true;
    setStepCompleted(newCompleted);
  };

  const handleCompleteStep = () => {
    const newCompleted = [...stepCompleted];
    newCompleted[currentStep] = true;
    setStepCompleted(newCompleted);

    if (currentStep === CALIBRATION_STEPS.length - 2) {
      // Last action step — calibrate the sensor
      if (selectedNode) {
        calibrateSensor(selectedNode);
      }
      newCompleted[currentStep + 1] = true;
      setStepCompleted(newCompleted);
      setCurrentStep(currentStep + 1);
    } else if (currentStep < CALIBRATION_STEPS.length - 1) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleReset = () => {
    setCurrentStep(0);
    setSelectedNode(null);
    setStepCompleted(new Array(7).fill(false));
  };

  const progress = Math.round((stepCompleted.filter(Boolean).length / CALIBRATION_STEPS.length) * 100);
  const step = CALIBRATION_STEPS[currentStep];
  const StepIcon = step.icon;

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate("/smart-sensors")} className="p-2 -ml-2 rounded-xl hover:bg-muted/60 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Sensor Calibration</h1>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs font-semibold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
              {progress}%
            </span>
          </div>
        </div>
      </header>

      <div className="max-w-[480px] mx-auto px-4 pt-5">
        {/* Progress Bar */}
        <div className="mb-6">
          <div className="flex items-center gap-1 mb-2">
            {CALIBRATION_STEPS.map((s, i) => (
              <div key={i} className="flex-1 h-1.5 rounded-full overflow-hidden bg-muted/40">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    stepCompleted[i] ? 'bg-emerald-500' : i === currentStep ? 'bg-emerald-300 w-1/2' : ''
                  }`}
                  style={{ width: stepCompleted[i] ? '100%' : i === currentStep ? '50%' : '0%' }}
                />
              </div>
            ))}
          </div>
          <p className="text-[10px] text-muted-foreground text-center">
            Step {currentStep + 1} of {CALIBRATION_STEPS.length}
          </p>
        </div>

        {/* Step Content */}
        <AnimatePresence mode="wait">
          <motion.div
            key={currentStep}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            transition={{ duration: 0.25 }}
          >
            {/* Step Header */}
            <div className="text-center mb-6">
              <div className={`w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center ${
                stepCompleted[currentStep] ? 'bg-emerald-100' : 'bg-blue-50'
              }`}>
                <StepIcon className={`w-8 h-8 ${stepCompleted[currentStep] ? 'text-emerald-600' : 'text-blue-600'}`} />
              </div>
              <h2 className="text-xl font-bold mb-2">{step.title}</h2>
              <p className="text-sm text-muted-foreground leading-relaxed max-w-xs mx-auto">
                {step.description}
              </p>
            </div>

            {/* Step 1: Select Node */}
            {currentStep === 0 && (
              <div className="space-y-3">
                {zones.map(([zone, nodes]) => (
                  <div key={zone}>
                    <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">{zone}</p>
                    <div className="space-y-2">
                      {nodes.map(node => (
                        <button
                          key={node.id}
                          onClick={() => handleSelectNode(node.id)}
                          className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                            selectedNode === node.id
                              ? 'border-emerald-400 bg-emerald-50 shadow-md'
                              : 'border-border/40 bg-card hover:border-emerald-200'
                          }`}
                        >
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            selectedNode === node.id ? 'bg-emerald-600' : 'bg-muted/60'
                          }`}>
                            <Radio className={`w-5 h-5 ${selectedNode === node.id ? 'text-white' : 'text-muted-foreground'}`} />
                          </div>
                          <div className="flex-1 text-left">
                            <p className="text-sm font-bold">{node.name}</p>
                            <p className="text-[11px] text-muted-foreground">
                              Depth: {node.depth} · Battery: {node.battery}% · {node.status === "normal" ? "Healthy" : "Needs Attention"}
                            </p>
                          </div>
                          {selectedNode === node.id && (
                            <Check className="w-5 h-5 text-emerald-600" />
                          )}
                          {node.status !== "normal" && selectedNode !== node.id && (
                            <AlertTriangle className="w-4 h-4 text-amber-500" />
                          )}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Steps 2-6: Action Steps with sensor info */}
            {currentStep > 0 && currentStep < 6 && selectedSensor && (
              <div className="space-y-4">
                {/* Current Sensor Info */}
                <div className="bg-card rounded-2xl border border-border/40 p-4">
                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Radio className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold">{selectedSensor.name}</p>
                      <p className="text-[11px] text-muted-foreground">{selectedSensor.zone} · Depth: {selectedSensor.depth}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    {currentStep === 3 && (
                      <div className="col-span-3 bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Moisture</p>
                        <p className="text-2xl font-bold text-blue-600">{selectedSensor.moisture}%</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Target: 85-95% with reference water</p>
                      </div>
                    )}
                    {currentStep === 2 && (
                      <div className="col-span-3 bg-purple-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current pH</p>
                        <p className="text-2xl font-bold text-purple-600">{selectedSensor.ph}</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Reference buffer: pH 7.0</p>
                      </div>
                    )}
                    {currentStep === 4 && (
                      <div className="col-span-3 bg-amber-50 rounded-xl p-3 text-center">
                        <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1">Current Temperature</p>
                        <p className="text-2xl font-bold text-amber-600">{selectedSensor.temperature}°C</p>
                        <p className="text-[10px] text-muted-foreground mt-1">Compare with reference thermometer (±0.5°C)</p>
                      </div>
                    )}
                    {currentStep === 5 && (
                      <>
                        <div className="bg-green-50 rounded-xl p-3 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">N</p>
                          <p className="text-lg font-bold text-green-600">{selectedSensor.nitrogen}</p>
                          <p className="text-[9px] text-muted-foreground">mg/kg</p>
                        </div>
                        <div className="bg-blue-50 rounded-xl p-3 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">P</p>
                          <p className="text-lg font-bold text-blue-600">{selectedSensor.phosphorus}</p>
                          <p className="text-[9px] text-muted-foreground">mg/kg</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-3 text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">K</p>
                          <p className="text-lg font-bold text-orange-600">{selectedSensor.potassium}</p>
                          <p className="text-[9px] text-muted-foreground">mg/kg</p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Instruction Card */}
                <div className="bg-amber-50 border border-amber-200/60 rounded-2xl p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-amber-800">Important</p>
                      <p className="text-xs text-amber-700 mt-1 leading-relaxed">
                        {currentStep === 2 && "Use only certified pH buffer solutions. Rinse the probe with distilled water between tests."}
                        {currentStep === 3 && "Use room-temperature distilled water only. Allow 60 seconds for the reading to stabilize."}
                        {currentStep === 4 && "Keep the reference thermometer at the same depth as the sensor probe for accurate comparison."}
                        {currentStep === 5 && "Use the lab-certified soil sample provided in your calibration kit. Do not use field soil."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Step 7: Complete */}
            {currentStep === 6 && selectedSensor && (
              <div className="space-y-4">
                <div className="bg-emerald-50 border border-emerald-200/60 rounded-2xl p-5 text-center">
                  <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-emerald-800">Calibration Successful</h3>
                  <p className="text-sm text-emerald-700 mt-2">
                    {selectedSensor.name} in {selectedSensor.zone} has been recalibrated. All readings are now verified and accurate.
                  </p>
                </div>
                <div className="bg-card rounded-2xl border border-border/40 p-4">
                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Calibration Summary</p>
                  <div className="space-y-2.5">
                    {["pH Reference Test", "Moisture Calibration", "Temperature Verification", "NPK Baseline Check"].map((item, i) => (
                      <div key={i} className="flex items-center gap-3">
                        <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        <p className="text-sm text-foreground">{item}</p>
                        <span className="ml-auto text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Passed</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>

        {/* Action Buttons */}
        <div className="mt-8 flex gap-3">
          {currentStep > 0 && currentStep < 6 && (
            <button
              onClick={() => setCurrentStep(prev => prev - 1)}
              className="flex-1 py-3.5 rounded-2xl border border-border/40 text-sm font-semibold hover:bg-muted/40 transition-all active:scale-[0.98]"
            >
              Back
            </button>
          )}
          {currentStep === 0 && (
            <button
              onClick={handleCompleteStep}
              disabled={!selectedNode}
              className={`flex-1 py-3.5 rounded-2xl text-sm font-semibold transition-all active:scale-[0.98] ${
                selectedNode
                  ? 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-lg shadow-emerald-600/20'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
              }`}
            >
              Start Calibration
            </button>
          )}
          {currentStep > 0 && currentStep < 6 && (
            <button
              onClick={handleCompleteStep}
              className="flex-1 py-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
            >
              {currentStep === 5 ? "Complete Calibration" : "Confirm & Continue"}
              <ChevronRight className="w-4 h-4" />
            </button>
          )}
          {currentStep === 6 && (
            <div className="flex gap-3 w-full">
              <button
                onClick={handleReset}
                className="flex-1 py-3.5 rounded-2xl border border-border/40 text-sm font-semibold hover:bg-muted/40 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
              >
                <RotateCcw className="w-4 h-4" /> Calibrate Another
              </button>
              <Link href="/smart-sensors" className="flex-1">
                <button className="w-full py-3.5 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]">
                  Back to Sensors
                </button>
              </Link>
            </div>
          )}
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
