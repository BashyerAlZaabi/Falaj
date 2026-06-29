/*
 * FALAJ Service Booking Page
 * Book transportation, packaging, storage, and other services
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { useState } from "react";
import { useParams, useLocation } from "wouter";
import {
  Truck, Package, Warehouse, Factory, Leaf, Wrench,
  FlaskConical, FileText, Calendar, Clock, MapPin,
  Star, Check, ChevronRight, Phone, Shield
} from "lucide-react";
import { toast } from "sonner";

const serviceTypes: Record<string, { name: string; icon: typeof Truck; color: string; bg: string; description: string }> = {
  transportation: { name: "Transportation", icon: Truck, color: "text-blue-600", bg: "bg-blue-50", description: "Farm-to-market delivery and logistics" },
  packaging: { name: "Packaging", icon: Package, color: "text-orange-600", bg: "bg-orange-50", description: "Professional packaging for your produce" },
  storage: { name: "Cold Storage", icon: Warehouse, color: "text-teal-600", bg: "bg-teal-50", description: "Temperature-controlled storage facilities" },
  processing: { name: "Food Processing", icon: Factory, color: "text-purple-600", bg: "bg-purple-50", description: "Value-added food processing services" },
  organic: { name: "Organic Certification", icon: Leaf, color: "text-green-600", bg: "bg-green-50", description: "Get your farm certified organic" },
  equipment: { name: "Equipment Rental", icon: Wrench, color: "text-red-600", bg: "bg-red-50", description: "Rent farming equipment and machinery" },
  soil: { name: "Soil Testing", icon: FlaskConical, color: "text-amber-600", bg: "bg-amber-50", description: "Professional soil analysis and reports" },
  export: { name: "Export Documentation", icon: FileText, color: "text-indigo-600", bg: "bg-indigo-50", description: "Export permits and documentation" },
};

interface Provider {
  id: number;
  name: string;
  rating: number;
  reviews: number;
  price: string;
  location: string;
  verified: boolean;
  eta: string;
}

const providers: Provider[] = [
  { id: 1, name: "Desert Express Logistics", rating: 4.8, reviews: 234, price: "150 AED", location: "Al Ain", verified: true, eta: "Same day" },
  { id: 2, name: "Green Valley Transport", rating: 4.6, reviews: 189, price: "120 AED", location: "Abu Dhabi", verified: true, eta: "Next day" },
  { id: 3, name: "Oasis Freight Services", rating: 4.4, reviews: 97, price: "95 AED", location: "Dubai", verified: false, eta: "2-3 days" },
  { id: 4, name: "Palm Coast Delivery", rating: 4.9, reviews: 312, price: "180 AED", location: "Al Ain", verified: true, eta: "Same day" },
];

type Step = "provider" | "schedule" | "confirm";

export default function ServiceBooking() {
  const params = useParams<{ type: string }>();
  const [, setLocation] = useLocation();
  const serviceType = params.type || "transportation";
  const service = serviceTypes[serviceType] || serviceTypes.transportation;
  const ServiceIcon = service.icon;

  const [step, setStep] = useState<Step>("provider");
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedTime, setSelectedTime] = useState("");
  const [notes, setNotes] = useState("");

  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i);
    return {
      label: d.toLocaleDateString("en-US", { weekday: "short" }),
      date: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      value: d.toISOString().split("T")[0],
    };
  });

  const times = ["08:00 AM", "09:00 AM", "10:00 AM", "11:00 AM", "12:00 PM", "01:00 PM", "02:00 PM", "03:00 PM", "04:00 PM", "05:00 PM"];

  const handleConfirm = () => {
    toast.success("Service booked successfully!", {
      description: `${service.name} with ${selectedProvider?.name} on ${selectedDate}`,
    });
    setTimeout(() => setLocation("/marketplace"), 1500);
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title={`Book ${service.name}`} />

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Service Info Card */}
        <div className={`${service.bg} rounded-2xl p-4 mb-5 border border-border/30`}>
          <div className="flex items-center gap-3">
            <div className="p-3 bg-white rounded-xl shadow-sm">
              <ServiceIcon className={`w-6 h-6 ${service.color}`} />
            </div>
            <div>
              <h3 className="text-sm font-bold">{service.name}</h3>
              <p className="text-xs text-muted-foreground">{service.description}</p>
            </div>
          </div>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2 mb-5">
          {(["provider", "schedule", "confirm"] as Step[]).map((s, i) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
                step === s ? "bg-primary text-white" :
                (["provider", "schedule", "confirm"].indexOf(step) > i) ? "bg-green-500 text-white" :
                "bg-muted text-muted-foreground"
              }`}>
                {["provider", "schedule", "confirm"].indexOf(step) > i ? <Check className="w-3.5 h-3.5" /> : i + 1}
              </div>
              {i < 2 && <div className={`flex-1 h-0.5 rounded-full ${
                ["provider", "schedule", "confirm"].indexOf(step) > i ? "bg-green-500" : "bg-muted"
              }`} />}
            </div>
          ))}
        </div>

        {/* Step 1: Select Provider */}
        {step === "provider" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="text-sm font-semibold mb-3">Select a Provider</h3>
            <div className="space-y-2.5">
              {providers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => setSelectedProvider(p)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all duration-200 ${
                    selectedProvider?.id === p.id
                      ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                      : "border-border/50 bg-card hover:shadow-md"
                  }`}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold">{p.name}</p>
                        {p.verified && <Shield className="w-3.5 h-3.5 text-blue-500" />}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <MapPin className="w-3 h-3 text-muted-foreground" />
                        <span className="text-[10px] text-muted-foreground">{p.location}</span>
                      </div>
                    </div>
                    <p className="text-sm font-bold text-primary">{p.price}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1">
                      <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                      <span className="text-xs font-medium">{p.rating}</span>
                      <span className="text-[10px] text-muted-foreground">({p.reviews})</span>
                    </div>
                    <span className="text-[10px] text-muted-foreground">ETA: {p.eta}</span>
                  </div>
                </button>
              ))}
            </div>
            <button
              onClick={() => selectedProvider && setStep("schedule")}
              disabled={!selectedProvider}
              className="w-full mt-4 py-3 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              Continue
            </button>
          </motion.div>
        )}

        {/* Step 2: Schedule */}
        {step === "schedule" && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="text-sm font-semibold mb-3">Select Date</h3>
            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
              {dates.map((d) => (
                <button
                  key={d.value}
                  onClick={() => setSelectedDate(d.value)}
                  className={`shrink-0 w-16 py-3 rounded-xl text-center border transition-all ${
                    selectedDate === d.value
                      ? "border-primary bg-primary text-white"
                      : "border-border/50 bg-card hover:bg-muted"
                  }`}
                >
                  <p className="text-[10px] font-medium opacity-70">{d.label}</p>
                  <p className="text-xs font-bold mt-0.5">{d.date}</p>
                </button>
              ))}
            </div>

            <h3 className="text-sm font-semibold mb-3">Select Time</h3>
            <div className="grid grid-cols-3 gap-2 mb-4">
              {times.map((t) => (
                <button
                  key={t}
                  onClick={() => setSelectedTime(t)}
                  className={`py-2.5 rounded-xl text-xs font-medium border transition-all ${
                    selectedTime === t
                      ? "border-primary bg-primary text-white"
                      : "border-border/50 bg-card hover:bg-muted"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>

            <h3 className="text-sm font-semibold mb-2">Notes (optional)</h3>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions..."
              className="w-full bg-muted/50 rounded-xl px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/20 resize-none h-20 mb-4"
            />

            <div className="flex gap-3">
              <button
                onClick={() => setStep("provider")}
                className="flex-1 py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors"
              >
                Back
              </button>
              <button
                onClick={() => selectedDate && selectedTime && setStep("confirm")}
                disabled={!selectedDate || !selectedTime}
                className="flex-1 py-3 bg-primary text-white rounded-xl font-semibold text-sm hover:bg-primary/90 transition-colors disabled:opacity-40"
              >
                Continue
              </button>
            </div>
          </motion.div>
        )}

        {/* Step 3: Confirm */}
        {step === "confirm" && selectedProvider && (
          <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}>
            <h3 className="text-sm font-semibold mb-3">Booking Summary</h3>
            <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4 space-y-3">
              <div className="flex items-center justify-between pb-3 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <ServiceIcon className={`w-5 h-5 ${service.color}`} />
                  <span className="text-sm font-semibold">{service.name}</span>
                </div>
                <span className="text-sm font-bold text-primary">{selectedProvider.price}</span>
              </div>
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{selectedProvider.name}</span>
              </div>
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{new Date(selectedDate).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</span>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm">{selectedTime}</span>
              </div>
              {notes && (
                <div className="pt-2 border-t border-border/30">
                  <p className="text-xs text-muted-foreground">Notes: {notes}</p>
                </div>
              )}
            </div>

            {/* Payment Summary */}
            <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
              <h4 className="text-sm font-semibold mb-2">Payment</h4>
              <div className="space-y-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Service fee</span>
                  <span>{selectedProvider.price}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Platform fee</span>
                  <span>5 AED</span>
                </div>
                <div className="flex justify-between text-sm font-bold pt-2 border-t border-border/30">
                  <span>Total</span>
                  <span className="text-primary">{parseInt(selectedProvider.price) + 5} AED</span>
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={() => setStep("schedule")}
                className="flex-1 py-3 border border-border rounded-xl font-semibold text-sm hover:bg-muted transition-colors"
              >
                Back
              </button>
              <button
                onClick={handleConfirm}
                className="flex-1 py-3 bg-green-500 text-white rounded-xl font-semibold text-sm hover:bg-green-600 transition-colors"
              >
                Confirm & Pay
              </button>
            </div>
          </motion.div>
        )}
      </div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
