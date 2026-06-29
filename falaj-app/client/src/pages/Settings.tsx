/*
 * FALAJ Settings Page — Enhanced with Language Toggle
 * Design: Desert Minimalism — grouped settings with toggles
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { useState } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import {
  Bell, Shield, Globe, Wifi, Database,
  ChevronRight, Moon, Volume2, Smartphone, Check
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export default function Settings() {
  const { lang, setLang, t } = useLanguage();
  const [notifications, setNotifications] = useState(true);
  const [sensorAlerts, setSensorAlerts] = useState(true);
  const [aiNotifs, setAiNotifs] = useState(true);
  const [darkMode, setDarkMode] = useState(false);
  const [sounds, setSounds] = useState(false);
  const [autoSync, setAutoSync] = useState(true);
  const [showLangPicker, setShowLangPicker] = useState(false);

  const handleLangChange = (newLang: "en" | "ar") => {
    setLang(newLang);
    setShowLangPicker(false);
    toast.success(newLang === "ar" ? "تم تغيير اللغة إلى العربية" : "Language changed to English");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title={t("settings")} />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Language */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">{t("language")}</h3>
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-5">
          <button
            onClick={() => setShowLangPicker(!showLangPicker)}
            className="w-full flex items-center justify-between px-4 py-3.5"
          >
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-primary/10"><Globe className="w-4 h-4 text-primary" /></div>
              <div className="text-left">
                <p className="text-sm font-medium">{t("language")}</p>
                <p className="text-[10px] text-muted-foreground">{lang === "en" ? "English" : "العربية"}</p>
              </div>
            </div>
            <ChevronRight className={`w-4 h-4 text-muted-foreground/40 transition-transform ${showLangPicker ? "rotate-90" : ""}`} />
          </button>
          {showLangPicker && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              className="border-t border-border/30"
            >
              <button
                onClick={() => handleLangChange("en")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🇬🇧</span>
                  <span className="text-sm font-medium">English</span>
                </div>
                {lang === "en" && <Check className="w-4 h-4 text-primary" />}
              </button>
              <button
                onClick={() => handleLangChange("ar")}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">🇦🇪</span>
                  <span className="text-sm font-medium">العربية</span>
                </div>
                {lang === "ar" && <Check className="w-4 h-4 text-primary" />}
              </button>
            </motion.div>
          )}
        </div>

        {/* Notifications */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">{t("notifications")}</h3>
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-5">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-blue-50"><Bell className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-sm font-medium">Push Notifications</p>
                <p className="text-[10px] text-muted-foreground">Receive alerts on your device</p>
              </div>
            </div>
            <Switch checked={notifications} onCheckedChange={setNotifications} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-amber-50"><Wifi className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-sm font-medium">Sensor Alerts</p>
                <p className="text-[10px] text-muted-foreground">Critical sensor notifications</p>
              </div>
            </div>
            <Switch checked={sensorAlerts} onCheckedChange={setSensorAlerts} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-violet-50"><Smartphone className="w-4 h-4 text-violet-600" /></div>
              <div>
                <p className="text-sm font-medium">AI Recommendations</p>
                <p className="text-[10px] text-muted-foreground">New AI insights alerts</p>
              </div>
            </div>
            <Switch checked={aiNotifs} onCheckedChange={setAiNotifs} />
          </div>
        </div>

        {/* Appearance */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">{t("appearance")}</h3>
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-5">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-slate-50"><Moon className="w-4 h-4 text-slate-600" /></div>
              <div>
                <p className="text-sm font-medium">{t("darkMode")}</p>
                <p className="text-[10px] text-muted-foreground">Switch to dark theme</p>
              </div>
            </div>
            <Switch checked={darkMode} onCheckedChange={setDarkMode} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-green-50"><Volume2 className="w-4 h-4 text-green-600" /></div>
              <div>
                <p className="text-sm font-medium">Sound Effects</p>
                <p className="text-[10px] text-muted-foreground">Play sounds for alerts</p>
              </div>
            </div>
            <Switch checked={sounds} onCheckedChange={setSounds} />
          </div>
        </div>

        {/* Data */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">Data & Privacy</h3>
        <div className="bg-card rounded-2xl border border-border/50 overflow-hidden mb-5">
          <div className="flex items-center justify-between px-4 py-3.5 border-b border-border/30">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-teal-50"><Database className="w-4 h-4 text-teal-600" /></div>
              <div>
                <p className="text-sm font-medium">Auto Sync</p>
                <p className="text-[10px] text-muted-foreground">Sync data automatically</p>
              </div>
            </div>
            <Switch checked={autoSync} onCheckedChange={setAutoSync} />
          </div>
          <div className="flex items-center justify-between px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-xl bg-red-50"><Shield className="w-4 h-4 text-red-600" /></div>
              <p className="text-sm font-medium">Privacy Policy</p>
            </div>
            <ChevronRight className="w-4 h-4 text-muted-foreground/40" />
          </div>
        </div>

        {/* Version */}
        <p className="text-center text-xs text-muted-foreground">
          FALAJ v2.1.0 — Smart Agriculture
        </p>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
