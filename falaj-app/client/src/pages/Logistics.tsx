/**
 * FALAJ Logistics & Delivery Tracking
 * Manage transport, packaging, delivery schedules for B2B contracts
 * Track shipments, manage fleet, schedule pickups
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { useState } from "react";
import {
  Truck, Package, MapPin, Clock, Calendar,
  CheckCircle2, ChevronRight, Box, Snowflake,
  Route, User, PackageCheck, PackageOpen, Fuel, Thermometer
} from "lucide-react";
import { toast } from "sonner";

type LogTab = "active" | "schedule" | "packaging" | "fleet";

const activeDeliveries = [
  {
    id: "DEL-001", buyer: "Jumeirah Group", product: "Organic Tomatoes",
    quantity: "500 kg", status: "in-transit", progress: 65,
    pickup: "Al Ain Heritage Farm", destination: "Jumeirah Beach Hotel, Dubai",
    driver: "Mohammed Al Rashid", vehicle: "Refrigerated Van (14°C)", plateNo: "ABD 5432",
    departedAt: "10:30 AM", estimatedArrival: "12:45 PM",
    temperature: "14°C", tempStatus: "optimal",
    steps: [
      { label: "Packed", time: "9:00 AM", done: true },
      { label: "Quality Check", time: "9:45 AM", done: true },
      { label: "Departed Farm", time: "10:30 AM", done: true },
      { label: "In Transit", time: "Now", done: true },
      { label: "Arriving Dubai", time: "12:30 PM", done: false },
      { label: "Delivered", time: "12:45 PM", done: false },
    ],
  },
  {
    id: "DEL-002", buyer: "Cleveland Clinic", product: "Organic Lettuce",
    quantity: "200 kg", status: "packing", progress: 25,
    pickup: "Al Ain Heritage Farm", destination: "Cleveland Clinic, Abu Dhabi",
    driver: "Ahmed Hassan", vehicle: "Refrigerated Van (8°C)", plateNo: "ABD 7891",
    departedAt: "—", estimatedArrival: "2:00 PM",
    temperature: "8°C", tempStatus: "optimal",
    steps: [
      { label: "Packed", time: "11:00 AM", done: true },
      { label: "Quality Check", time: "In Progress", done: false },
      { label: "Depart Farm", time: "12:00 PM", done: false },
      { label: "In Transit", time: "—", done: false },
      { label: "Delivered", time: "2:00 PM", done: false },
    ],
  },
  {
    id: "DEL-003", buyer: "Etihad Catering", product: "Cherry Tomatoes",
    quantity: "300 kg", status: "delivered", progress: 100,
    pickup: "Al Ain Heritage Farm", destination: "Etihad Catering Facility, Abu Dhabi",
    driver: "Khalid Omar", vehicle: "Refrigerated Truck (12°C)", plateNo: "ABD 3210",
    departedAt: "6:00 AM", estimatedArrival: "8:15 AM",
    temperature: "12°C", tempStatus: "optimal",
    steps: [
      { label: "Packed", time: "5:00 AM", done: true },
      { label: "Quality Check", time: "5:30 AM", done: true },
      { label: "Departed Farm", time: "6:00 AM", done: true },
      { label: "In Transit", time: "6:00 AM", done: true },
      { label: "Arrived", time: "8:00 AM", done: true },
      { label: "Delivered", time: "8:15 AM", done: true },
    ],
  },
];

const scheduledDeliveries = [
  { id: "SCH-001", buyer: "Lulu Hypermarket", product: "Herbs (Packaged)", qty: "200 kg", date: "Mar 12", time: "6:00 AM", recurring: "Weekly", status: "confirmed" },
  { id: "SCH-002", buyer: "Jumeirah Group", product: "Fresh Herbs", qty: "50 kg", date: "Mar 13", time: "7:00 AM", recurring: "Weekly", status: "confirmed" },
  { id: "SCH-003", buyer: "Emirates Catering", product: "Salad Mix", qty: "500 kg", date: "Mar 14", time: "5:30 AM", recurring: "Weekly", status: "pending" },
  { id: "SCH-004", buyer: "Cleveland Clinic", product: "Cucumbers", qty: "150 kg", date: "Mar 15", time: "8:00 AM", recurring: "Weekly", status: "confirmed" },
  { id: "SCH-005", buyer: "ADAA", product: "Mixed Vegetables", qty: "1,000 kg", date: "Mar 20", time: "6:00 AM", recurring: "Monthly", status: "confirmed" },
];

const packagingOptions = [
  { type: "Standard Crate", material: "Recycled Plastic", capacity: "25 kg", cost: "AED 5/unit", temp: "Ambient", icon: Box, stock: 120 },
  { type: "Insulated Box", material: "EPS Foam + Cardboard", capacity: "15 kg", cost: "AED 12/unit", temp: "Cold Chain", icon: Snowflake, stock: 45 },
  { type: "Premium Gift Box", material: "Branded Cardboard", capacity: "5 kg", cost: "AED 18/unit", temp: "Ambient", icon: Package, stock: 80 },
  { type: "Bulk Pallet", material: "Wooden Pallet + Wrap", capacity: "500 kg", cost: "AED 35/unit", temp: "Ambient", icon: PackageOpen, stock: 15 },
  { type: "Herb Container", material: "Ventilated Plastic", capacity: "2 kg", cost: "AED 3/unit", temp: "Ambient", icon: PackageCheck, stock: 200 },
];

const fleet = [
  { id: "V-001", type: "Refrigerated Van", plate: "ABD 5432", driver: "Mohammed Al Rashid", status: "on-delivery", capacity: "1,000 kg", fuel: 72, nextService: "Mar 25" },
  { id: "V-002", type: "Refrigerated Van", plate: "ABD 7891", driver: "Ahmed Hassan", status: "loading", capacity: "800 kg", fuel: 85, nextService: "Apr 5" },
  { id: "V-003", type: "Refrigerated Truck", plate: "ABD 3210", driver: "Khalid Omar", status: "available", capacity: "3,000 kg", fuel: 90, nextService: "Mar 30" },
  { id: "V-004", type: "Pickup Truck", plate: "ABD 9876", driver: "Saeed Ali", status: "maintenance", capacity: "500 kg", fuel: 45, nextService: "Today" },
];

export default function Logistics() {
  const [activeTab, setActiveTab] = useState<LogTab>("active");
  const [expandedDelivery, setExpandedDelivery] = useState<string | null>("DEL-001");

  const tabs: { key: LogTab; label: string; icon: React.ReactNode }[] = [
    { key: "active", label: "Live Tracking", icon: <Truck className="w-3.5 h-3.5" /> },
    { key: "schedule", label: "Schedule", icon: <Calendar className="w-3.5 h-3.5" /> },
    { key: "packaging", label: "Packaging", icon: <Package className="w-3.5 h-3.5" /> },
    { key: "fleet", label: "Fleet", icon: <Route className="w-3.5 h-3.5" /> },
  ];

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
              <Truck className="w-5 h-5 text-emerald-600" />
              <span className="text-lg font-bold tracking-tight">Logistics</span>
            </div>
            <div className="flex items-center gap-1 bg-emerald-50 px-2.5 py-1 rounded-full">
              <Truck className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-[10px] font-bold text-emerald-700">3 Active</span>
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

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* ═══════ LIVE TRACKING ═══════ */}
        {activeTab === "active" && (
          <div className="space-y-3">
            {activeDeliveries.map((d) => {
              const isExpanded = expandedDelivery === d.id;
              return (
                <div key={d.id} className="bg-card rounded-xl border border-border/40 overflow-hidden">
                  <button onClick={() => setExpandedDelivery(isExpanded ? null : d.id)} className="w-full p-3 text-left">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                          d.status === "in-transit" ? "bg-blue-50" : d.status === "packing" ? "bg-amber-50" : "bg-emerald-50"
                        }`}>
                          {d.status === "in-transit" ? <Truck className="w-5 h-5 text-blue-600" /> :
                           d.status === "packing" ? <PackageOpen className="w-5 h-5 text-amber-600" /> :
                           <PackageCheck className="w-5 h-5 text-emerald-600" />}
                        </div>
                        <div>
                          <p className="text-xs font-semibold">{d.buyer}</p>
                          <p className="text-[9px] text-muted-foreground">{d.product} · {d.quantity}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${
                          d.status === "in-transit" ? "bg-blue-50 text-blue-700" :
                          d.status === "packing" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"
                        }`}>{d.status.replace("-", " ")}</span>
                        <ChevronRight className={`w-4 h-4 text-muted-foreground transition-transform ${isExpanded ? "rotate-90" : ""}`} />
                      </div>
                    </div>
                    <div className="w-full bg-muted rounded-full h-1.5">
                      <div className={`rounded-full h-1.5 transition-all ${d.status === "delivered" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${d.progress}%` }} />
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-border/20">
                      <div className="grid grid-cols-2 gap-2 mt-2 mb-3">
                        <div className="bg-muted/30 rounded-lg p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <MapPin className="w-3 h-3 text-emerald-600" />
                            <p className="text-[8px] text-muted-foreground">From</p>
                          </div>
                          <p className="text-[10px] font-semibold">{d.pickup}</p>
                        </div>
                        <div className="bg-muted/30 rounded-lg p-2">
                          <div className="flex items-center gap-1 mb-1">
                            <MapPin className="w-3 h-3 text-red-500" />
                            <p className="text-[8px] text-muted-foreground">To</p>
                          </div>
                          <p className="text-[10px] font-semibold">{d.destination}</p>
                        </div>
                      </div>
                      <div className="bg-muted/20 rounded-lg p-2 mb-3 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center">
                            <User className="w-4 h-4 text-emerald-700" />
                          </div>
                          <div>
                            <p className="text-[10px] font-semibold">{d.driver}</p>
                            <p className="text-[9px] text-muted-foreground">{d.vehicle}</p>
                          </div>
                        </div>
                        <div className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-bold ${
                          d.tempStatus === "optimal" ? "bg-blue-50 text-blue-700" : "bg-red-50 text-red-700"
                        }`}>
                          <Thermometer className="w-2.5 h-2.5" />
                          {d.temperature}
                        </div>
                      </div>
                      <div className="space-y-0">
                        {d.steps.map((step, i) => (
                          <div key={i} className="flex items-start gap-2">
                            <div className="flex flex-col items-center">
                              <div className={`w-3 h-3 rounded-full border-2 flex items-center justify-center ${
                                step.done ? "bg-emerald-500 border-emerald-500" : "bg-white border-muted-foreground/30"
                              }`}>
                                {step.done && <CheckCircle2 className="w-3 h-3 text-white" />}
                              </div>
                              {i < d.steps.length - 1 && <div className={`w-0.5 h-6 ${step.done ? "bg-emerald-300" : "bg-muted"}`} />}
                            </div>
                            <div className="pb-4">
                              <p className={`text-[10px] font-semibold ${step.done ? "text-foreground" : "text-muted-foreground"}`}>{step.label}</p>
                              <p className="text-[9px] text-muted-foreground">{step.time}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ═══════ SCHEDULE ═══════ */}
        {activeTab === "schedule" && (
          <div className="space-y-2">
            {scheduledDeliveries.map((s) => (
              <div key={s.id} className="bg-card rounded-xl border border-border/40 p-3">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center">
                      <Calendar className="w-5 h-5 text-blue-600" />
                    </div>
                    <div>
                      <p className="text-xs font-semibold">{s.buyer}</p>
                      <p className="text-[9px] text-muted-foreground">{s.product} · {s.qty}</p>
                    </div>
                  </div>
                  <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${
                    s.status === "confirmed" ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"
                  }`}>{s.status}</span>
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                    <p className="text-[10px] font-bold">{s.date}</p>
                    <p className="text-[7px] text-muted-foreground">Date</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                    <p className="text-[10px] font-bold">{s.time}</p>
                    <p className="text-[7px] text-muted-foreground">Pickup</p>
                  </div>
                  <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                    <p className="text-[10px] font-bold text-blue-600">{s.recurring}</p>
                    <p className="text-[7px] text-muted-foreground">Frequency</p>
                  </div>
                </div>
              </div>
            ))}
            <button onClick={() => toast.success("New delivery scheduled")} className="w-full mt-4 py-3 rounded-xl bg-gradient-to-r from-emerald-600 to-green-600 text-white text-sm font-semibold shadow-md">
              Schedule New Delivery
            </button>
          </div>
        )}

        {/* ═══════ PACKAGING ═══════ */}
        {activeTab === "packaging" && (
          <div className="space-y-2">
            {packagingOptions.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.type} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{p.type}</p>
                        <p className="text-[9px] text-muted-foreground">{p.material}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-emerald-600">{p.cost}</p>
                      <p className="text-[8px] text-muted-foreground">{p.stock} in stock</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{p.capacity}</p>
                      <p className="text-[7px] text-muted-foreground">Capacity</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{p.temp}</p>
                      <p className="text-[7px] text-muted-foreground">Temperature</p>
                    </div>
                  </div>
                </div>
              );
            })}
            <button onClick={() => toast.success("Packaging order placed")} className="w-full mt-4 py-3 rounded-xl border-2 border-emerald-600 text-emerald-700 text-sm font-semibold hover:bg-emerald-50 transition-colors">
              Order More Packaging
            </button>
          </div>
        )}

        {/* ═══════ FLEET ═══════ */}
        {activeTab === "fleet" && (
          <div>
            <div className="bg-gradient-to-br from-blue-600 to-indigo-600 rounded-2xl p-5 text-white mb-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/5 rounded-full -translate-y-8 translate-x-8" />
              <div className="relative z-10 grid grid-cols-4 gap-2">
                <div className="text-center">
                  <p className="text-xl font-bold">{fleet.length}</p>
                  <p className="text-[9px] text-white/70">Total</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-emerald-300">{fleet.filter(v => v.status === "available").length}</p>
                  <p className="text-[9px] text-white/70">Available</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-blue-300">{fleet.filter(v => v.status === "on-delivery" || v.status === "loading").length}</p>
                  <p className="text-[9px] text-white/70">Active</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-bold text-amber-300">{fleet.filter(v => v.status === "maintenance").length}</p>
                  <p className="text-[9px] text-white/70">Service</p>
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {fleet.map((v) => (
                <div key={v.id} className="bg-card rounded-xl border border-border/40 p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                        v.status === "on-delivery" ? "bg-blue-50" : v.status === "loading" ? "bg-amber-50" :
                        v.status === "available" ? "bg-emerald-50" : "bg-red-50"
                      }`}>
                        <Truck className={`w-5 h-5 ${
                          v.status === "on-delivery" ? "text-blue-600" : v.status === "loading" ? "text-amber-600" :
                          v.status === "available" ? "text-emerald-600" : "text-red-600"
                        }`} />
                      </div>
                      <div>
                        <p className="text-xs font-semibold">{v.type}</p>
                        <p className="text-[9px] text-muted-foreground">{v.plate} · {v.driver}</p>
                      </div>
                    </div>
                    <span className={`text-[8px] font-bold uppercase px-2 py-0.5 rounded-full ${
                      v.status === "on-delivery" ? "bg-blue-50 text-blue-700" : v.status === "loading" ? "bg-amber-50 text-amber-700" :
                      v.status === "available" ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                    }`}>{v.status.replace("-", " ")}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{v.capacity}</p>
                      <p className="text-[7px] text-muted-foreground">Capacity</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <div className="flex items-center justify-center gap-0.5">
                        <Fuel className="w-2.5 h-2.5 text-muted-foreground" />
                        <p className="text-[10px] font-bold">{v.fuel}%</p>
                      </div>
                      <p className="text-[7px] text-muted-foreground">Fuel</p>
                    </div>
                    <div className="bg-muted/30 rounded-lg p-1.5 text-center">
                      <p className="text-[10px] font-bold">{v.nextService}</p>
                      <p className="text-[7px] text-muted-foreground">Next Service</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
