/*
 * FALAJ Floating Obaid Button — Quick access to AI assistant and daily planner
 * Design: Professional, no cartoonish elements
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "wouter";
import { X, MessageCircle, Calendar, Mic, BarChart3 } from "lucide-react";

const quickActions = [
  { label: "Ask Obaid", icon: MessageCircle, path: "/ai-assistant", color: "bg-emerald-600" },
  { label: "Daily Plan", icon: Calendar, path: "/daily-planner", color: "bg-teal-600" },
  { label: "Voice Command", icon: Mic, path: "/ai-assistant", color: "bg-blue-600" },
  { label: "Farm Report", icon: BarChart3, path: "/ai-assistant", color: "bg-indigo-600" },
];

export default function FloatingAI() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="fixed bottom-24 right-4 z-50 flex flex-col items-end gap-2.5">
      <AnimatePresence>
        {expanded && (
          <>
            {quickActions.map((action, i) => {
              const Icon = action.icon;
              return (
                <motion.div
                  key={action.label}
                  initial={{ opacity: 0, y: 20, scale: 0.8 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 10, scale: 0.8 }}
                  transition={{ delay: i * 0.06, type: "spring", stiffness: 400, damping: 25 }}
                >
                  <Link href={action.path}>
                    <button
                      onClick={() => setExpanded(false)}
                      className="flex items-center gap-2.5 pl-4 pr-3 py-2.5 bg-white/95 backdrop-blur-xl rounded-full shadow-lg shadow-black/5 border border-border/30 hover:shadow-xl hover:-translate-y-0.5 transition-all duration-200"
                    >
                      <span className="text-sm font-semibold text-foreground whitespace-nowrap">{action.label}</span>
                      <div className={`p-1.5 rounded-full ${action.color} shadow-sm`}>
                        <Icon className="w-3.5 h-3.5 text-white" />
                      </div>
                    </button>
                  </Link>
                </motion.div>
              );
            })}
          </>
        )}
      </AnimatePresence>

      <div className="relative">
        {/* Subtle pulse */}
        {!expanded && (
          <div className="absolute inset-0 rounded-full bg-emerald-400/20 animate-ping" style={{ animationDuration: "3s" }} />
        )}
        <motion.button
          onClick={() => setExpanded(!expanded)}
          className="relative w-14 h-14 rounded-full bg-gradient-to-br from-emerald-600 to-teal-700 text-white shadow-xl shadow-emerald-500/20 flex items-center justify-center hover:shadow-2xl hover:shadow-emerald-500/30 transition-shadow active:scale-95"
          whileTap={{ scale: 0.92 }}
          animate={{ rotate: expanded ? 135 : 0 }}
          transition={{ type: "spring", stiffness: 300, damping: 20 }}
        >
          {expanded ? (
            <X className="w-6 h-6" />
          ) : (
            <span className="text-lg font-bold">O</span>
          )}
        </motion.button>
      </div>
    </div>
  );
}
