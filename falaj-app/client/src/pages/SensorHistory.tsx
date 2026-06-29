/*
 * Sensor History — Historical data charts for each zone
 * 7-day and 30-day views for moisture, pH, NPK, temperature
 * Design: Professional, matches FALAJ green/blue/white theme
 */
import { useState, useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useAppState } from "@/contexts/AppStateContext";
import { motion } from "framer-motion";
import BottomNav from "@/components/BottomNav";
import {
  ChevronLeft, Droplets, Thermometer, FlaskConical, Leaf,
  TrendingUp, TrendingDown, Minus, Calendar, AlertTriangle, BarChart3
} from "lucide-react";

// Generate realistic historical data for a metric
function generateHistory(base: number, variance: number, days: number, trend: number = 0): number[] {
  const data: number[] = [];
  let val = base - (trend * days * 0.3);
  for (let i = 0; i < days; i++) {
    val += (Math.random() - 0.45) * variance + trend * 0.3;
    data.push(Math.round(val * 10) / 10);
  }
  return data;
}

function MiniChart({ data, color, height = 80, showDots = false }: { data: number[]; color: string; height?: number; showDots?: boolean }) {
  const min = Math.min(...data);
  const max = Math.max(...data);
  const range = max - min || 1;
  const w = 320;
  const h = height;
  const padding = 8;

  const points = data.map((v, i) => ({
    x: padding + (i / (data.length - 1)) * (w - padding * 2),
    y: h - padding - ((v - min) / range) * (h - padding * 2),
  }));

  const pathD = points.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(" ");
  const areaD = pathD + ` L ${points[points.length - 1].x} ${h} L ${points[0].x} ${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-full" style={{ height }}>
      <defs>
        <linearGradient id={`grad-${color}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={areaD} fill={`url(#grad-${color})`} />
      <path d={pathD} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {showDots && points.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r="3" fill="white" stroke={color} strokeWidth="2" />
      ))}
      {/* Last point highlight */}
      <circle cx={points[points.length - 1].x} cy={points[points.length - 1].y} r="4" fill={color} />
    </svg>
  );
}

type TimeRange = "7d" | "30d";
type MetricKey = "moisture" | "temperature" | "ph" | "nitrogen" | "phosphorus" | "potassium";

const METRICS: { key: MetricKey; label: string; unit: string; color: string; icon: typeof Droplets }[] = [
  { key: "moisture", label: "Moisture", unit: "%", color: "#2563eb", icon: Droplets },
  { key: "temperature", label: "Temperature", unit: "°C", color: "#d97706", icon: Thermometer },
  { key: "ph", label: "pH Level", unit: "", color: "#7c3aed", icon: FlaskConical },
  { key: "nitrogen", label: "Nitrogen (N)", unit: "mg/kg", color: "#059669", icon: Leaf },
  { key: "phosphorus", label: "Phosphorus (P)", unit: "mg/kg", color: "#2563eb", icon: Leaf },
  { key: "potassium", label: "Potassium (K)", unit: "mg/kg", color: "#ea580c", icon: Leaf },
];

export default function SensorHistory() {
  const { sensors, getSensorAlerts, zoneThresholds } = useAppState();
  const [, navigate] = useLocation();
  const [timeRange, setTimeRange] = useState<TimeRange>("7d");
  const [selectedZone, setSelectedZone] = useState<string | null>(null);
  const [expandedMetric, setExpandedMetric] = useState<MetricKey | null>(null);

  const zones = useMemo(() => {
    const grouped: Record<string, typeof sensors> = {};
    sensors.forEach(s => {
      if (!grouped[s.zone]) grouped[s.zone] = [];
      grouped[s.zone].push(s);
    });
    return Object.entries(grouped);
  }, [sensors]);

  // Auto-select first zone
  const activeZone = selectedZone || (zones.length > 0 ? zones[0][0] : "");
  const zoneNodes = zones.find(([z]) => z === activeZone)?.[1] || [];
  const alerts = getSensorAlerts();
  const zoneAlerts = alerts.filter(a => a.zone === activeZone);

  // Generate historical data based on current zone averages
  const historyData = useMemo((): Record<MetricKey, number[]> | null => {
    if (zoneNodes.length === 0) return null;
    const days = timeRange === "7d" ? 7 : 30;
    const avgMoisture = zoneNodes.reduce((a, n) => a + n.moisture, 0) / zoneNodes.length;
    const avgTemp = zoneNodes.reduce((a, n) => a + n.temperature, 0) / zoneNodes.length;
    const avgPh = zoneNodes.reduce((a, n) => a + n.ph, 0) / zoneNodes.length;
    const avgN = zoneNodes.reduce((a, n) => a + n.nitrogen, 0) / zoneNodes.length;
    const avgP = zoneNodes.reduce((a, n) => a + n.phosphorus, 0) / zoneNodes.length;
    const avgK = zoneNodes.reduce((a, n) => a + n.potassium, 0) / zoneNodes.length;

    return {
      moisture: generateHistory(avgMoisture, 5, days, 0.2),
      temperature: generateHistory(avgTemp, 3, days, 0.1),
      ph: generateHistory(avgPh, 0.3, days, 0),
      nitrogen: generateHistory(avgN, 8, days, 0.5),
      phosphorus: generateHistory(avgP, 5, days, 0.3),
      potassium: generateHistory(avgK, 6, days, 0.2),
    };
  }, [zoneNodes, timeRange]);

  const getTrend = (data: number[] | undefined) => {
    if (!data || data.length < 2) return { direction: "stable" as const, pct: 0 };
    const first = data.slice(0, Math.floor(data.length / 3)).reduce((a, b) => a + b, 0) / Math.floor(data.length / 3);
    const last = data.slice(-Math.floor(data.length / 3)).reduce((a, b) => a + b, 0) / Math.floor(data.length / 3);
    const pct = Math.round(((last - first) / first) * 100);
    return { direction: pct > 2 ? "up" as const : pct < -2 ? "down" as const : "stable" as const, pct: Math.abs(pct) };
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-2xl border-b border-border/20">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate("/farm")} className="p-2 -ml-2 rounded-xl hover:bg-muted/60 transition-colors">
            <ChevronLeft className="w-5 h-5" />
          </button>
          <h1 className="text-lg font-bold">Sensor History</h1>
        </div>
      </header>

      <div className="max-w-[480px] mx-auto px-4 pt-5">
        {/* Unpaired state */}
        {sensors.every(s => !s.paired) && (
          <div className="bg-card rounded-2xl border border-dashed border-gray-300 p-8 text-center mb-6">
            <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mx-auto mb-3">
              <BarChart3 className="w-8 h-8 text-blue-300" />
            </div>
            <h3 className="text-base font-bold text-foreground mb-1">No Sensor Data Yet</h3>
            <p className="text-xs text-muted-foreground leading-relaxed mb-4">
              Pair your sensors first to start collecting historical data. Charts will populate automatically once sensors are online.
            </p>
            <Link href="/smart-sensors">
              <button className="w-full py-3 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-200/40 active:scale-[0.98] transition-transform">
                Pair Sensors
              </button>
            </Link>
          </div>
        )}

        {/* Zone Selector */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-1 no-scrollbar">
          {zones.map(([zone, nodes]) => {
            const zAlerts = alerts.filter(a => a.zone === zone);
            return (
              <button
                key={zone}
                onClick={() => setSelectedZone(zone)}
                className={`relative shrink-0 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  activeZone === zone
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                    : 'bg-card border border-border/40 text-foreground hover:border-emerald-200'
                }`}
              >
                {zone}
                <span className={`ml-1.5 text-[10px] ${activeZone === zone ? 'text-white/70' : 'text-muted-foreground'}`}>
                  ({nodes.length})
                </span>
                {zAlerts.length > 0 && activeZone !== zone && (
                  <span className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-red-500 rounded-full flex items-center justify-center">
                    <span className="text-[8px] font-bold text-white">{zAlerts.length}</span>
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Time Range Toggle */}
        <div className="flex gap-2 mb-5">
          {(["7d", "30d"] as TimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                timeRange === range
                  ? 'bg-foreground text-background shadow-md'
                  : 'bg-card border border-border/40 text-muted-foreground hover:border-foreground/20'
              }`}
            >
              <Calendar className="w-3.5 h-3.5 inline mr-1.5" />
              {range === "7d" ? "7 Days" : "30 Days"}
            </button>
          ))}
        </div>

        {/* Active Alerts */}
        {zoneAlerts.length > 0 && (
          <div className="mb-5 bg-red-50 border border-red-200/60 rounded-2xl p-4">
            <div className="flex items-center gap-2 mb-2.5">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              <p className="text-sm font-bold text-red-800">{zoneAlerts.length} Active Alert{zoneAlerts.length > 1 ? 's' : ''}</p>
            </div>
            <div className="space-y-2">
              {zoneAlerts.slice(0, 3).map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-xs text-red-700">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shrink-0" />
                  <span className="font-medium">{alert.nodeName}</span>: {alert.message}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Metric Charts */}
        <div className="space-y-3">
          {METRICS.map(metric => {
            const data = historyData ? historyData[metric.key] : undefined;
            if (!data) return null;
            const trend = getTrend(data);
            const current = data[data.length - 1];
            const isExpanded = expandedMetric === metric.key;
            const Icon = metric.icon;
            const TrendIcon = trend.direction === "up" ? TrendingUp : trend.direction === "down" ? TrendingDown : Minus;

            return (
              <motion.div
                key={metric.key}
                layout
                className="bg-card rounded-2xl border border-border/40 overflow-hidden"
              >
                <button
                  onClick={() => setExpandedMetric(isExpanded ? null : metric.key)}
                  className="w-full p-4 flex items-center gap-3 text-left"
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${metric.color}15` }}>
                    <Icon className="w-5 h-5" style={{ color: metric.color }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{metric.label}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-lg font-bold" style={{ color: metric.color }}>{current}{metric.unit}</span>
                      <span className={`flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${
                        trend.direction === "up" ? "bg-green-50 text-green-600" :
                        trend.direction === "down" ? "bg-red-50 text-red-600" :
                        "bg-gray-50 text-gray-500"
                      }`}>
                        <TrendIcon className="w-3 h-3" />
                        {trend.pct}%
                      </span>
                    </div>
                  </div>
                  <div className="w-20 h-10 shrink-0">
                    <MiniChart data={data.slice(-7)} color={metric.color} height={40} />
                  </div>
                </button>

                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="px-4 pb-4"
                  >
                    <div className="border-t border-border/20 pt-4">
                      <MiniChart data={data} color={metric.color} height={120} showDots={timeRange === "7d"} />
                      <div className="flex justify-between mt-2 text-[9px] text-muted-foreground">
                        <span>{timeRange === "7d" ? "7 days ago" : "30 days ago"}</span>
                        <span>Today</span>
                      </div>

                      {/* Stats */}
                      <div className="grid grid-cols-4 gap-2 mt-4">
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">Min</p>
                          <p className="text-sm font-bold">{Math.min(...data).toFixed(1)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">Max</p>
                          <p className="text-sm font-bold">{Math.max(...data).toFixed(1)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">Avg</p>
                          <p className="text-sm font-bold">{(data.reduce((a: number, b: number) => a + b, 0) / data.length).toFixed(1)}</p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] text-muted-foreground uppercase">Trend</p>
                          <p className={`text-sm font-bold ${
                            trend.direction === "up" ? "text-green-600" :
                            trend.direction === "down" ? "text-red-600" :
                            "text-gray-500"
                          }`}>
                            {trend.direction === "up" ? "+" : trend.direction === "down" ? "-" : ""}{trend.pct}%
                          </p>
                        </div>
                      </div>

                      {/* Per-node breakdown */}
                      <div className="mt-4">
                        <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-2">Node Readings</p>
                        <div className="space-y-1.5">
                          {zoneNodes.map(node => {
                            const val = node[metric.key as keyof typeof node] as number;
                            return (
                              <div key={node.id} className="flex items-center gap-2 text-xs">
                                <span className="w-2 h-2 rounded-full" style={{ backgroundColor: metric.color }} />
                                <span className="text-muted-foreground flex-1">{node.name}</span>
                                <span className="font-bold">{val}{metric.unit}</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Quick Actions */}
        <div className="mt-6 flex gap-3">
          <Link href="/sensor-calibration" className="flex-1">
            <button className="w-full py-3 rounded-2xl border border-border/40 text-sm font-semibold hover:bg-muted/40 transition-all active:scale-[0.98]">
              Calibrate Nodes
            </button>
          </Link>
          <Link href="/smart-sensors" className="flex-1">
            <button className="w-full py-3 rounded-2xl bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 shadow-lg shadow-emerald-600/20 transition-all active:scale-[0.98]">
              Manage Sensors
            </button>
          </Link>
        </div>
      </div>

      <BottomNav />
    </div>
  );
}
