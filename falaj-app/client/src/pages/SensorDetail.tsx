/*
 * FALAJ Sensor Detail Page
 * Design: Desert Minimalism — detailed sensor view with chart, readings, history
 */
import PageHeader from "@/components/PageHeader";
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { useParams } from "wouter";
import {
  Droplets, Thermometer, Wind, Sun, Gauge, Leaf,
  Wifi, Battery, Clock, TrendingUp, TrendingDown, Minus
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";

const sensorsDB: Record<string, {
  name: string; zone: string; value: string; unit: string; status: string;
  battery: number; icon: any; color: string; bg: string; optimal: string;
  trend: string; lastUpdate: string;
}> = {
  "1": { name: "Soil Moisture Sensor", zone: "Zone A - Tomatoes", value: "42", unit: "%", status: "online", battery: 87, icon: Droplets, color: "text-blue-500", bg: "bg-blue-50", optimal: "35-50%", trend: "up", lastUpdate: "2 min ago" },
  "2": { name: "Temperature Sensor", zone: "Zone B - Cucumbers", value: "34", unit: "°C", status: "online", battery: 92, icon: Thermometer, color: "text-amber-500", bg: "bg-amber-50", optimal: "25-32°C", trend: "up", lastUpdate: "1 min ago" },
  "3": { name: "Humidity Sensor", zone: "Zone C - Lettuce", value: "65", unit: "%", status: "online", battery: 45, icon: Wind, color: "text-teal-500", bg: "bg-teal-50", optimal: "60-75%", trend: "stable", lastUpdate: "3 min ago" },
  "4": { name: "Light Sensor", zone: "Zone D - Herbs", value: "850", unit: " lux", status: "online", battery: 78, icon: Sun, color: "text-orange-500", bg: "bg-orange-50", optimal: "800-1200 lux", trend: "down", lastUpdate: "1 min ago" },
  "5": { name: "Soil pH Sensor", zone: "Zone A - Tomatoes", value: "6.5", unit: "", status: "offline", battery: 12, icon: Gauge, color: "text-purple-500", bg: "bg-purple-50", optimal: "6.0-7.0", trend: "stable", lastUpdate: "2 hours ago" },
  "6": { name: "Nutrient Sensor", zone: "Zone E - Date Palms", value: "NPK", unit: " OK", status: "online", battery: 63, icon: Leaf, color: "text-green-500", bg: "bg-green-50", optimal: "Balanced", trend: "stable", lastUpdate: "5 min ago" },
};

const chartData = [
  { time: "6AM", value: 35 }, { time: "8AM", value: 38 }, { time: "10AM", value: 42 },
  { time: "12PM", value: 45 }, { time: "2PM", value: 43 }, { time: "4PM", value: 40 },
  { time: "6PM", value: 38 }, { time: "8PM", value: 36 },
];

const history = [
  { time: "10:30 AM", value: "42%", status: "Normal" },
  { time: "10:00 AM", value: "41%", status: "Normal" },
  { time: "9:30 AM", value: "39%", status: "Normal" },
  { time: "9:00 AM", value: "37%", status: "Low" },
  { time: "8:30 AM", value: "36%", status: "Low" },
];

export default function SensorDetail() {
  const params = useParams<{ id: string }>();
  const sensor = sensorsDB[params.id || "1"] || sensorsDB["1"];
  const Icon = sensor.icon;

  const TrendIcon = sensor.trend === "up" ? TrendingUp : sensor.trend === "down" ? TrendingDown : Minus;
  const trendColor = sensor.trend === "up" ? "text-green-500" : sensor.trend === "down" ? "text-red-500" : "text-muted-foreground";

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Sensor Details" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Sensor Info Card */}
        <div className="bg-card rounded-2xl border border-border/50 p-5 mb-4">
          <div className="flex items-center gap-3 mb-4">
            <div className={`p-3 rounded-xl ${sensor.bg}`}>
              <Icon className={`w-6 h-6 ${sensor.color}`} />
            </div>
            <div>
              <h2 className="text-base font-bold">{sensor.name}</h2>
              <p className="text-xs text-muted-foreground">{sensor.zone}</p>
            </div>
          </div>

          {/* Big Value */}
          <div className="text-center py-4">
            <p className="text-5xl font-bold tracking-tight">{sensor.value}<span className="text-xl text-muted-foreground">{sensor.unit}</span></p>
            <div className="flex items-center justify-center gap-2 mt-2">
              <TrendIcon className={`w-4 h-4 ${trendColor}`} />
              <span className={`text-sm font-medium ${trendColor}`}>{sensor.trend === "up" ? "+3%" : sensor.trend === "down" ? "-2%" : "Stable"}</span>
            </div>
          </div>

          {/* Status Row */}
          <div className="flex items-center justify-between bg-muted/50 rounded-xl p-3 mt-2">
            <div className="flex items-center gap-1.5">
              <Wifi className={`w-3.5 h-3.5 ${sensor.status === "online" ? "text-green-500" : "text-red-400"}`} />
              <span className="text-xs font-medium capitalize">{sensor.status}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Battery className={`w-3.5 h-3.5 ${sensor.battery < 20 ? "text-red-400" : "text-muted-foreground"}`} />
              <span className="text-xs font-medium">{sensor.battery}%</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-muted-foreground" />
              <span className="text-xs text-muted-foreground">{sensor.lastUpdate}</span>
            </div>
          </div>
        </div>

        {/* Chart */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
          <h3 className="text-sm font-semibold mb-3">Today's Readings</h3>
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#5B8FB9" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#5B8FB9" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} width={30} />
                <Tooltip
                  contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", fontSize: 12 }}
                />
                <Area type="monotone" dataKey="value" stroke="#5B8FB9" strokeWidth={2} fill="url(#colorValue)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Optimal Range */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
          <h3 className="text-sm font-semibold mb-2">Optimal Range</h3>
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Target</span>
            <span className="text-sm font-bold text-primary">{sensor.optimal}</span>
          </div>
          <div className="w-full bg-muted rounded-full h-2 mt-3 overflow-hidden">
            <div className="bg-primary h-full rounded-full" style={{ width: "72%" }} />
          </div>
        </div>

        {/* History */}
        <div className="bg-card rounded-2xl border border-border/50 p-4">
          <h3 className="text-sm font-semibold mb-3">Recent History</h3>
          <div className="space-y-2.5">
            {history.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
                <span className="text-xs text-muted-foreground">{item.time}</span>
                <span className="text-xs font-semibold">{item.value}</span>
                <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                  item.status === "Normal" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                }`}>{item.status}</span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
