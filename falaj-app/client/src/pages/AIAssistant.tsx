/*
 * OBAID — FALAJ AI Business Partner & Agriculture Expert
 * Design: Professional, sophisticated, mature — no cartoonish elements
 * Features: Voice commands, agriculture expertise, business advice, farm analysis
 * Personality: Warm Emirati advisor, data-driven, respectful
 */
import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation } from "wouter";
import { useAppState } from "@/contexts/AppStateContext";
import {
  ArrowLeft, Send, User, Leaf, Droplets,
  TrendingUp, CloudSun, Mic, MicOff, MoreVertical,
  Zap, ThumbsUp, ThumbsDown, Copy, BarChart3,
  Calendar, AlertTriangle, CheckCircle2, ChevronRight,
  Volume2, VolumeX, Settings2
} from "lucide-react";

interface Message {
  id: number;
  role: "user" | "obaid";
  content: string;
  timestamp: string;
  type?: "text" | "analysis" | "recommendation" | "alert" | "plan";
  isVoice?: boolean;
}

// Obaid's knowledge base — professional agriculture responses
const obaidResponses: Record<string, { content: string; type: string }> = {
  "greeting": {
    content: "Good morning, Ahmed. I've reviewed your farm's overnight data.\n\nHere's your situation:\n\n- Soil moisture in Zone A dropped to 42% — I've scheduled irrigation for 6:00 AM\n- Temperature in Zone B peaked at 34°C — shade nets are recommended\n- Your Jumeirah Group order (500 kg tomatoes) is confirmed for Friday delivery\n- Khalas date prices rose 8% this week — consider listing more stock\n\nWhat would you like to focus on first?",
    type: "analysis"
  },
  "crop": {
    content: "Crop Health Report — Zone A Date Palms\n\nOverall Health Score: 87/100\n\nLeaf Color Index: 0.82 (Healthy)\nGrowth Rate: +2.3 cm/week (Normal for season)\nWater Stress Index: 0.15 (Low)\nNutrient Status: Nitrogen slightly below optimal\n\nRecommendations:\n1. Apply 2 kg NPK fertilizer per tree within 3 days\n2. Increase morning irrigation cycle by 10%\n3. Set pheromone traps for red palm weevil prevention\n\nProjected Yield: 85 kg/tree this season — 12% improvement over last year.\n\nShall I auto-schedule the fertilizer application?",
    type: "analysis"
  },
  "irrigation": {
    content: "Irrigation Optimization — This Week\n\nBased on weather forecast, soil sensors, and crop growth stage:\n\nMonday: 45 min morning / 30 min evening (75 min total)\nTuesday: 40 min / 25 min (65 min)\nWednesday: 50 min / 35 min (85 min) — peak heat day\nThursday: 35 min / 20 min (55 min) — 30% rain probability\nFriday: 45 min / 30 min (75 min)\n\nEstimated water savings: 1,200 L compared to manual scheduling.\n\nI can apply this schedule directly to your smart valves. Want me to proceed?",
    type: "recommendation"
  },
  "pest": {
    content: "Pest Analysis — Tomato Yellow Leaf Curl Virus\n\nConfidence: 94% based on symptom description\n\nIdentified Cause: Whitefly transmission (Bemisia tabaci)\n\nImmediate Actions Required:\n1. Apply neem oil spray (2 ml/L) — organic-approved solution\n2. Install yellow sticky traps around affected area\n3. Remove severely infected plants to prevent spread\n4. Consider releasing Encarsia formosa for biological control\n\nPrevention Strategy:\n- Use reflective mulch to repel whiteflies\n- Plant resistant varieties (Ty-1, Ty-3 gene lines)\n- Maintain weed-free borders around growing zones\n\nEstimated cost of treatment: AED 180-250.\nIf untreated, projected crop loss: 30-40% of affected zone.",
    type: "alert"
  },
  "market": {
    content: "Market Intelligence — Organic Dates (Abu Dhabi)\n\nCurrent Prices:\nKhalas: AED 45/kg (+8% this week)\nBarhi: AED 38/kg (+5%)\nMedjool: AED 65/kg (stable)\nSukkari: AED 52/kg (+12%)\n\n30-Day Price Forecast:\nKhalas expected to reach AED 52/kg (+15%) — Ramadan demand surge in 2 weeks.\n\nDemand Analysis:\nLocal demand: High (Ramadan preparation)\nExport demand: Medium (GCC markets)\nOnline orders: +35% vs last month\n\nMy Recommendation:\nList your Khalas dates now at AED 48/kg for quick volume sales. Or hold inventory for the AED 52/kg peak window around March 20-25.\n\nYour current stock of 800 kg at peak pricing = AED 41,600 potential revenue.",
    type: "analysis"
  },
  "weather": {
    content: "Weather Impact Assessment — This Week\n\nForecast:\nMon-Wed: Hot and dry, 38-42°C\nThursday: Possible sandstorm — take precautions\nFri-Sat: Cooler, 32-35°C, 30% rain chance\n\nImpact by Zone:\n\nZone A (Date Palms): Low risk — heat tolerant\nAction: Increase evening irrigation by 15%\n\nZone B (Tomatoes): Medium risk — heat stress possible\nAction: Deploy shade nets Wednesday-Thursday\n\nZone C (Herbs): High risk — wilt danger above 40°C\nAction: Move to greenhouse or mist every 2 hours during peak\n\nSandstorm Preparation (Thursday):\n- Cover sensitive crops and seedlings\n- Secure greenhouse panels\n- Clean all sensors after storm passes\n\nI'll send real-time alerts if conditions change significantly.",
    type: "alert"
  },
  "sensor": {
    content: "Sensor Data Analysis — All Zones\n\nZone A (Date Palms):\nSoil Moisture: 42% (Target: 45-55%) — Action needed\nTemperature: 34°C — Normal\npH: 7.2 — Optimal\nRecommendation: Increase irrigation by 10%\n\nZone B (Vegetables):\nSoil Moisture: 55% — Optimal\nTemperature: 36°C — Slightly elevated\nNitrogen: Low — Fertilizer needed\nRecommendation: Apply NPK, deploy shade\n\nZone C (Greenhouse):\nAll readings optimal — No action required\n\nZone D (New Planting):\nSoil Moisture: 38% — Below target\npH: 7.5 — Slightly alkaline\nRecommendation: Water immediately, add sulfur for pH correction\n\nOverall Farm Score: 78/100\n3 zones need attention. I can auto-adjust irrigation for Zones A and D.",
    type: "analysis"
  },
  "plan": {
    content: "Your Farm Plan for Today — March 10, 2026\n\nMorning (6:00 - 10:00 AM):\n1. Irrigation cycle starts automatically at 6:00 AM — Zones A, C\n2. Check Zone B temperature sensors — shade nets may be needed\n3. Apply fertilizer to Zone A date palms (NPK 2 kg/tree)\n4. Review overnight sensor alerts\n\nMidday (10:00 AM - 2:00 PM):\n5. Prepare Jumeirah Group order — 500 kg tomatoes for Friday\n6. Inspect cucumber growth in Zone D — expected 60% maturity\n7. Check marketplace for new buyer requests\n\nAfternoon (2:00 - 6:00 PM):\n8. Evening irrigation cycle — Zones B, D at 4:00 PM\n9. Review daily financial summary\n10. Update crop progress records\n11. Community forum — respond to 2 pending questions\n\nReminders:\n- Jumeirah Group delivery deadline: Friday\n- Etihad Catering demand response pending\n- Fertilizer stock running low — reorder by Wednesday\n\nYou can edit any task or ask me to reschedule.",
    type: "plan"
  },
  "financial": {
    content: "Financial Summary — March 2026\n\nRevenue This Month: AED 12,450\nExpenses This Month: AED 3,200\nNet Profit: AED 9,250\n\nTop Revenue Sources:\n1. Jumeirah Group (B2B): AED 5,500\n2. Cleveland Clinic (B2B): AED 2,800\n3. Marketplace Sales: AED 4,150\n\nPending Invoices: AED 4,850\nOverdue: None\n\nCash Flow Forecast (Next 30 Days):\nExpected Income: AED 18,000-22,000\nExpected Expenses: AED 4,500-5,200\nProjected Net: AED 13,500-16,800\n\nMy Recommendation:\nYour B2B contracts are performing well. Consider increasing Khalas date production — demand is 40% higher than your current supply capacity.\n\nEstimated ROI on expanding Zone B by 20%: 340% over 6 months.",
    type: "analysis"
  }
};

function getObaidResponse(userMessage: string): { content: string; type: string } {
  const msg = userMessage.toLowerCase();
  if (msg.includes("morning") || msg.includes("good") || msg.includes("hello") || msg.includes("hi") || msg.includes("assalam") || msg.includes("start")) return obaidResponses["greeting"];
  if (msg.includes("plan") || msg.includes("today") || msg.includes("schedule") || msg.includes("task") || msg.includes("day")) return obaidResponses["plan"];
  if (msg.includes("crop") || msg.includes("health") || msg.includes("palm") || msg.includes("tree") || msg.includes("grow")) return obaidResponses["crop"];
  if (msg.includes("irrigat") || msg.includes("water") || msg.includes("valve") || msg.includes("moisture")) return obaidResponses["irrigation"];
  if (msg.includes("pest") || msg.includes("bug") || msg.includes("spot") || msg.includes("disease") || msg.includes("yellow") || msg.includes("sick")) return obaidResponses["pest"];
  if (msg.includes("price") || msg.includes("market") || msg.includes("sell") || msg.includes("cost") || msg.includes("demand")) return obaidResponses["market"];
  if (msg.includes("weather") || msg.includes("rain") || msg.includes("temperature") || msg.includes("forecast") || msg.includes("hot")) return obaidResponses["weather"];
  if (msg.includes("sensor") || msg.includes("data") || msg.includes("analyz") || msg.includes("zone") || msg.includes("reading")) return obaidResponses["sensor"];
  if (msg.includes("money") || msg.includes("revenue") || msg.includes("profit") || msg.includes("financ") || msg.includes("invoice") || msg.includes("income")) return obaidResponses["financial"];
  return {
    content: "I've reviewed your query against your farm's current data.\n\nCurrent Status:\n- All sensors operational across 4 zones\n- 2 active B2B contracts in progress\n- Weather conditions stable for the next 48 hours\n- Crop health averaging 88% across all zones\n\nI can help you with:\n- Daily farm planning and task management\n- Crop health analysis and recommendations\n- Irrigation optimization and valve control\n- Pest and disease identification\n- Market pricing and demand intelligence\n- Weather impact assessment\n- Financial reporting and forecasting\n- Sensor data analysis\n\nWhat area would you like to explore?",
    type: "text"
  };
}

export default function AIAssistant() {
  const [, setLocation] = useLocation();
  const { user, sensors, crops, orders, notifications } = useAppState();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 0,
      role: "obaid",
      content: `Assalamu alaikum, ${user.name.split(" ")[0]}. I'm Obaid, your agriculture business partner.\n\nI've been monitoring your farm overnight. Here's what needs your attention:\n\n- ${sensors.filter(s => s.status === "alert").length} sensor alerts require review\n- ${orders.filter(o => o.status === "pending").length} pending orders awaiting confirmation\n- ${crops.filter(c => c.health < 90).length} crops below optimal health\n- ${notifications.filter(n => !n.read).length} unread notifications\n\nSay "plan my day" to get your personalized farm schedule, or ask me anything about your operation.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "text"
    }
  ]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = "en-US";

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInput(transcript);
        setIsListening(false);
        // Auto-send voice messages
        setTimeout(() => {
          sendMessage(transcript);
        }, 300);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
    }
  }, []);

  const toggleVoice = useCallback(() => {
    if (!recognitionRef.current) return;

    if (isListening) {
      recognitionRef.current.stop();
      setIsListening(false);
    } else {
      recognitionRef.current.start();
      setIsListening(true);
    }
  }, [isListening]);

  const speakResponse = useCallback((text: string) => {
    if (!voiceEnabled || !window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    // Clean text for speech
    const cleanText = text.replace(/[*#\-|]/g, "").replace(/\n+/g, ". ").replace(/\d+\./g, "").slice(0, 500);
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 0.95;
    utterance.pitch = 0.9;
    utterance.lang = "en-US";
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, [voiceEnabled]);

  const stopSpeaking = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const sendMessage = useCallback((text?: string) => {
    const messageText = text || input.trim();
    if (!messageText) return;

    const userMsg: Message = {
      id: Date.now(),
      role: "user",
      content: messageText,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      type: "text",
      isVoice: !!text
    };

    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsTyping(true);

    // Simulate Obaid thinking
    setTimeout(() => {
      const response = getObaidResponse(messageText);
      const obaidMsg: Message = {
        id: Date.now() + 1,
        role: "obaid",
        content: response.content,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        type: response.type as any
      };
      setMessages(prev => [...prev, obaidMsg]);
      setIsTyping(false);

      // Auto-speak response if voice enabled
      if (voiceEnabled && userMsg.isVoice) {
        speakResponse(response.content);
      }
    }, 1200 + Math.random() * 800);
  }, [input, voiceEnabled, speakResponse]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const quickActions = [
    { icon: Calendar, label: "Plan My Day", prompt: "Plan my day as a farmer", color: "text-emerald-700 bg-emerald-50 border-emerald-200" },
    { icon: Leaf, label: "Crop Report", prompt: "Give me a full crop health report", color: "text-green-700 bg-green-50 border-green-200" },
    { icon: Droplets, label: "Irrigation", prompt: "Optimize my irrigation schedule for this week", color: "text-blue-700 bg-blue-50 border-blue-200" },
    { icon: TrendingUp, label: "Market Intel", prompt: "What are the current market prices and demand?", color: "text-teal-700 bg-teal-50 border-teal-200" },
    { icon: CloudSun, label: "Weather Impact", prompt: "How will this week's weather affect my crops?", color: "text-sky-700 bg-sky-50 border-sky-200" },
    { icon: BarChart3, label: "Financials", prompt: "Show me my financial summary and projections", color: "text-indigo-700 bg-indigo-50 border-indigo-200" },
  ];

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case "analysis": return <BarChart3 className="w-3.5 h-3.5" />;
      case "recommendation": return <CheckCircle2 className="w-3.5 h-3.5" />;
      case "alert": return <AlertTriangle className="w-3.5 h-3.5" />;
      case "plan": return <Calendar className="w-3.5 h-3.5" />;
      default: return null;
    }
  };

  const getTypeBadge = (type?: string) => {
    switch (type) {
      case "analysis": return { label: "Analysis", class: "bg-emerald-100 text-emerald-700" };
      case "recommendation": return { label: "Recommendation", class: "bg-blue-100 text-blue-700" };
      case "alert": return { label: "Alert", class: "bg-red-100 text-red-700" };
      case "plan": return { label: "Daily Plan", class: "bg-teal-100 text-teal-700" };
      default: return null;
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => setLocation("/dashboard")} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3 flex-1">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-sm">O</span>
            </div>
            <div>
              <h1 className="text-base font-bold tracking-tight">Obaid</h1>
              <div className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                <span className="text-[10px] text-emerald-600 font-medium">Agriculture Business Partner</span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setVoiceEnabled(!voiceEnabled); if (isSpeaking) stopSpeaking(); }}
              className={`p-2 rounded-xl transition-colors ${voiceEnabled ? "text-emerald-600 hover:bg-emerald-50" : "text-muted-foreground hover:bg-muted"}`}
            >
              {voiceEnabled ? <Volume2 className="w-4.5 h-4.5" /> : <VolumeX className="w-4.5 h-4.5" />}
            </button>
            <button className="p-2 rounded-xl hover:bg-muted transition-colors">
              <Settings2 className="w-4.5 h-4.5 text-muted-foreground" />
            </button>
          </div>
        </div>
      </header>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 max-w-[480px] mx-auto w-full">
        <AnimatePresence>
          {messages.map((msg) => {
            const badge = msg.role === "obaid" ? getTypeBadge(msg.type) : null;
            return (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25 }}
                className={`mb-4 flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
              >
                {msg.role === "obaid" && (
                  <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center mr-2 mt-1 shrink-0">
                    <span className="text-white font-bold text-[10px]">O</span>
                  </div>
                )}
                <div className={`max-w-[85%] ${msg.role === "user" ? "order-1" : ""}`}>
                  {/* Type badge */}
                  {badge && msg.id !== 0 && (
                    <div className="flex items-center gap-1.5 mb-1.5">
                      {getTypeIcon(msg.type)}
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${badge.class}`}>
                        {badge.label}
                      </span>
                    </div>
                  )}
                  <div className={`rounded-2xl px-4 py-3 ${
                    msg.role === "user"
                      ? "bg-emerald-700 text-white rounded-br-md"
                      : msg.type === "alert"
                      ? "bg-red-50/80 border border-red-100 rounded-bl-md"
                      : msg.type === "analysis"
                      ? "bg-emerald-50/80 border border-emerald-100 rounded-bl-md"
                      : msg.type === "recommendation"
                      ? "bg-blue-50/80 border border-blue-100 rounded-bl-md"
                      : msg.type === "plan"
                      ? "bg-teal-50/80 border border-teal-100 rounded-bl-md"
                      : "bg-card border border-border/50 rounded-bl-md"
                  }`}>
                    <div className={`text-[13px] leading-relaxed whitespace-pre-wrap ${
                      msg.role === "user" ? "text-white" : "text-foreground"
                    }`}>
                      {msg.content.split("\n").map((line, i) => {
                        const parts = line.split(/(\*\*[^*]+\*\*)/g);
                        return (
                          <p key={i} className={i > 0 ? "mt-1" : ""}>
                            {parts.map((part, j) => {
                              if (part.startsWith("**") && part.endsWith("**")) {
                                return <strong key={j} className="font-semibold">{part.slice(2, -2)}</strong>;
                              }
                              return <span key={j}>{part}</span>;
                            })}
                          </p>
                        );
                      })}
                    </div>
                  </div>
                  <div className={`flex items-center gap-2 mt-1.5 ${msg.role === "user" ? "justify-end" : ""}`}>
                    <span className="text-[10px] text-muted-foreground">{msg.timestamp}</span>
                    {msg.isVoice && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                        <Mic className="w-2.5 h-2.5" /> Voice
                      </span>
                    )}
                    {msg.role === "obaid" && msg.id !== 0 && (
                      <div className="flex items-center gap-0.5">
                        <button
                          onClick={() => speakResponse(msg.content)}
                          className="p-1 rounded hover:bg-muted transition-colors"
                          title="Read aloud"
                        >
                          <Volume2 className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button className="p-1 rounded hover:bg-muted transition-colors">
                          <ThumbsUp className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button className="p-1 rounded hover:bg-muted transition-colors">
                          <ThumbsDown className="w-3 h-3 text-muted-foreground" />
                        </button>
                        <button
                          onClick={() => navigator.clipboard?.writeText(msg.content)}
                          className="p-1 rounded hover:bg-muted transition-colors"
                        >
                          <Copy className="w-3 h-3 text-muted-foreground" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {msg.role === "user" && (
                  <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center ml-2 mt-1 shrink-0">
                    <User className="w-4 h-4 text-emerald-700" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Typing indicator */}
        {isTyping && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 mb-4"
          >
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 flex items-center justify-center shrink-0">
              <span className="text-white font-bold text-[10px]">O</span>
            </div>
            <div className="bg-card border border-border/50 rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground font-medium">Obaid is analyzing</span>
                <div className="flex gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Quick Actions — show only at start */}
        {messages.length <= 1 && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="mt-6"
          >
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
              What can I help you with?
            </p>
            <div className="space-y-2">
              {quickActions.map((action, i) => {
                const Icon = action.icon;
                return (
                  <button
                    key={i}
                    onClick={() => sendMessage(action.prompt)}
                    className={`w-full flex items-center gap-3 p-3.5 rounded-xl border text-left hover:shadow-sm transition-all active:scale-[0.98] ${action.color}`}
                  >
                    <Icon className="w-5 h-5 shrink-0" />
                    <span className="text-sm font-medium flex-1">{action.label}</span>
                    <ChevronRight className="w-4 h-4 opacity-40" />
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Voice Listening Overlay */}
      <AnimatePresence>
        {isListening && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center"
            onClick={toggleVoice}
          >
            <motion.div
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.8 }}
              className="flex flex-col items-center gap-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="relative">
                <div className="absolute inset-0 rounded-full bg-emerald-400/30 animate-ping" style={{ animationDuration: "1.5s" }} />
                <div className="absolute -inset-4 rounded-full bg-emerald-400/15 animate-ping" style={{ animationDuration: "2s" }} />
                <button
                  onClick={toggleVoice}
                  className="relative w-24 h-24 rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center shadow-2xl shadow-emerald-500/30"
                >
                  <MicOff className="w-10 h-10 text-white" />
                </button>
              </div>
              <div className="text-center">
                <p className="text-white text-lg font-semibold">Listening...</p>
                <p className="text-white/60 text-sm mt-1">Speak your command to Obaid</p>
              </div>
              <button
                onClick={toggleVoice}
                className="text-white/60 text-sm underline hover:text-white transition-colors"
              >
                Tap to cancel
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Speaking indicator */}
      <AnimatePresence>
        {isSpeaking && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-32 left-1/2 -translate-x-1/2 z-50"
          >
            <button
              onClick={stopSpeaking}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-full shadow-lg text-sm font-medium"
            >
              <Volume2 className="w-4 h-4 animate-pulse" />
              Obaid is speaking — tap to stop
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input Bar */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur-xl border-t border-border/40 shadow-[0_-2px_20px_rgba(0,0,0,0.04)] pb-safe">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center gap-2 bg-muted/50 rounded-2xl px-3 py-2 border border-border/50 focus-within:border-emerald-300 focus-within:ring-2 focus-within:ring-emerald-100 transition-all">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask Obaid anything about your farm..."
              className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              disabled={isTyping}
            />
            <button
              onClick={toggleVoice}
              disabled={isTyping}
              className={`p-2 rounded-xl transition-all ${
                isListening
                  ? "bg-red-100 text-red-600"
                  : "hover:bg-emerald-50 text-muted-foreground hover:text-emerald-600"
              }`}
            >
              <Mic className="w-5 h-5" />
            </button>
            <button
              onClick={() => sendMessage()}
              disabled={!input.trim() || isTyping}
              className="p-2 bg-emerald-700 text-white rounded-xl disabled:opacity-40 hover:bg-emerald-800 transition-all active:scale-95"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
          <p className="text-center text-[9px] text-muted-foreground mt-1.5">
            Obaid provides data-driven insights. Always verify critical farming decisions.
          </p>
        </div>
      </div>
    </div>
  );
}
