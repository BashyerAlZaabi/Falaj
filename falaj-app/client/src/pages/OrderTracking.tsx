/*
 * FALAJ Order Tracking Page
 * Track orders, select packaging & transportation services, payment flow
 * Design: Desert Minimalism — step-by-step order progress
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { useState } from "react";
import { Link } from "wouter";
import {
  Package, Truck, Check, Clock, MapPin, CreditCard,
  ChevronRight, Star, Phone, MessageCircle, Box,
  ShoppingBag, ArrowRight, Warehouse, CheckCircle2
} from "lucide-react";
import { toast } from "sonner";

/* ─── Order Status Steps ─── */
const orderSteps = [
  { key: "placed", label: "Order Placed", time: "Mar 10, 2:30 PM", done: true },
  { key: "confirmed", label: "Confirmed", time: "Mar 10, 2:45 PM", done: true },
  { key: "packaging", label: "Packaging", time: "Mar 10, 4:00 PM", done: true },
  { key: "shipped", label: "Shipped", time: "Mar 11, 9:00 AM", done: false },
  { key: "delivered", label: "Delivered", time: "Estimated Mar 12", done: false },
];

/* ─── Packaging Services ─── */
const packagingOptions = [
  { id: 1, name: "PackFresh UAE", type: "Standard Crates", price: "50 AED", rating: 4.7, eta: "Same day" },
  { id: 2, name: "AgroPack Emirates", type: "Vacuum Sealed", price: "85 AED", rating: 4.8, eta: "Same day" },
  { id: 3, name: "GreenBox Co.", type: "Eco-Friendly", price: "65 AED", rating: 4.5, eta: "Next day" },
];

/* ─── Transportation Services ─── */
const transportOptions = [
  { id: 1, name: "UAE Agri Logistics", type: "Refrigerated Truck", price: "150 AED", rating: 4.8, eta: "Same day" },
  { id: 2, name: "FarmFleet Express", type: "Standard Delivery", price: "100 AED", rating: 4.6, eta: "Next day" },
  { id: 3, name: "CoolChain Emirates", type: "Cold Chain", price: "220 AED", rating: 4.9, eta: "Same day" },
];

/* ─── Orders List ─── */
const myOrders = [
  {
    id: "ORD-2026-0847", product: "Falaj Complete Kit", seller: "FALAJ Official",
    amount: "1,499 AED", status: "packaging", date: "Mar 10, 2026",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-04_c023b154.jpg",
  },
  {
    id: "ORD-2026-0840", product: "Organic Tomatoes 20kg", seller: "Al Ain Farm Co.",
    amount: "900 AED", status: "delivered", date: "Mar 7, 2026",
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop",
  },
  {
    id: "ORD-2026-0835", product: "Soil Moisture Sensor x2", seller: "FALAJ Official",
    amount: "598 AED", status: "shipped", date: "Mar 5, 2026",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-11-33-36_1ef889c7.jpg",
  },
];

const statusColor: Record<string, string> = {
  placed: "bg-slate-100 text-slate-600",
  confirmed: "bg-blue-50 text-blue-600",
  packaging: "bg-amber-50 text-amber-600",
  shipped: "bg-blue-50 text-blue-600",
  delivered: "bg-green-50 text-green-600",
};

export default function OrderTracking() {
  const [selectedOrder, setSelectedOrder] = useState<string | null>(null);
  const [selectedPackaging, setSelectedPackaging] = useState<number | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<number | null>(null);
  const [showPayment, setShowPayment] = useState(false);

  const activeOrder = myOrders.find(o => o.id === selectedOrder);

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="My Orders" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {!selectedOrder ? (
          <>
            {/* Orders Summary */}
            <div className="flex gap-3 mb-5">
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-primary">{myOrders.length}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Total</p>
              </div>
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-amber-500">{myOrders.filter(o => o.status !== "delivered").length}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Active</p>
              </div>
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-green-600">{myOrders.filter(o => o.status === "delivered").length}</p>
                <p className="text-[10px] text-muted-foreground font-medium">Delivered</p>
              </div>
            </div>

            {/* Orders List */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Your Orders</h3>
            <div className="space-y-2.5">
              {myOrders.map((order, i) => (
                <motion.div
                  key={order.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                >
                  <button
                    onClick={() => setSelectedOrder(order.id)}
                    className="w-full bg-card rounded-2xl border border-border/50 p-4 hover:shadow-md transition-all duration-200 text-left"
                  >
                    <div className="flex items-center gap-3">
                      <img src={order.image} alt={order.product} className="w-16 h-16 rounded-xl object-cover" />
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold truncate">{order.product}</h4>
                        <p className="text-[10px] text-muted-foreground">{order.seller} · {order.date}</p>
                        <div className="flex items-center justify-between mt-1.5">
                          <span className="text-xs font-bold text-primary">{order.amount}</span>
                          <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[order.status]}`}>
                            {order.status}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0" />
                    </div>
                  </button>
                </motion.div>
              ))}
            </div>
          </>
        ) : (
          <>
            {/* Order Detail View */}
            <button
              onClick={() => { setSelectedOrder(null); setShowPayment(false); }}
              className="flex items-center gap-1 text-xs font-medium text-primary mb-4"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
              Back to Orders
            </button>

            {activeOrder && (
              <>
                {/* Order Header */}
                <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
                  <div className="flex items-center gap-3 mb-3">
                    <img src={activeOrder.image} alt={activeOrder.product} className="w-16 h-16 rounded-xl object-cover" />
                    <div>
                      <h4 className="text-sm font-bold">{activeOrder.product}</h4>
                      <p className="text-[10px] text-muted-foreground">{activeOrder.seller}</p>
                      <p className="text-xs font-bold text-primary mt-1">{activeOrder.amount}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span className="font-mono">{activeOrder.id}</span>
                    <span>·</span>
                    <span>{activeOrder.date}</span>
                  </div>
                </div>

                {/* Tracking Timeline */}
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Order Progress</h3>
                <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
                  <div className="space-y-0">
                    {orderSteps.map((step, i) => (
                      <div key={step.key} className="flex gap-3">
                        <div className="flex flex-col items-center">
                          <div className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                            step.done ? "bg-green-500" : "bg-muted"
                          }`}>
                            {step.done ? (
                              <Check className="w-3.5 h-3.5 text-white" />
                            ) : (
                              <Clock className="w-3 h-3 text-muted-foreground" />
                            )}
                          </div>
                          {i < orderSteps.length - 1 && (
                            <div className={`w-0.5 h-8 ${step.done ? "bg-green-300" : "bg-muted"}`} />
                          )}
                        </div>
                        <div className="pb-6">
                          <p className={`text-xs font-semibold ${step.done ? "text-foreground" : "text-muted-foreground"}`}>
                            {step.label}
                          </p>
                          <p className="text-[10px] text-muted-foreground">{step.time}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Packaging Service Selection */}
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  <Box className="w-3.5 h-3.5 inline mr-1" />
                  Packaging Service
                </h3>
                <div className="space-y-2 mb-4">
                  {packagingOptions.map((pkg) => (
                    <button
                      key={pkg.id}
                      onClick={() => {
                        setSelectedPackaging(pkg.id);
                        toast.success(`${pkg.name} selected for packaging`);
                      }}
                      className={`w-full bg-card rounded-2xl border p-3 text-left transition-all ${
                        selectedPackaging === pkg.id
                          ? "border-primary shadow-md shadow-primary/10"
                          : "border-border/50 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold">{pkg.name}</h4>
                          <p className="text-[10px] text-muted-foreground">{pkg.type} · ETA: {pkg.eta}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-primary">{pkg.price}</p>
                          <div className="flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                            <span className="text-[10px]">{pkg.rating}</span>
                          </div>
                        </div>
                      </div>
                      {selectedPackaging === pkg.id && (
                        <div className="mt-2 pt-2 border-t border-primary/20 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-semibold text-primary">Selected</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Transportation Service Selection */}
                <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                  <Truck className="w-3.5 h-3.5 inline mr-1" />
                  Transportation Service
                </h3>
                <div className="space-y-2 mb-4">
                  {transportOptions.map((transport) => (
                    <button
                      key={transport.id}
                      onClick={() => {
                        setSelectedTransport(transport.id);
                        toast.success(`${transport.name} selected for delivery`);
                      }}
                      className={`w-full bg-card rounded-2xl border p-3 text-left transition-all ${
                        selectedTransport === transport.id
                          ? "border-primary shadow-md shadow-primary/10"
                          : "border-border/50 hover:shadow-sm"
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <h4 className="text-xs font-bold">{transport.name}</h4>
                          <p className="text-[10px] text-muted-foreground">{transport.type} · ETA: {transport.eta}</p>
                        </div>
                        <div className="text-right">
                          <p className="text-xs font-bold text-primary">{transport.price}</p>
                          <div className="flex items-center gap-0.5">
                            <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                            <span className="text-[10px]">{transport.rating}</span>
                          </div>
                        </div>
                      </div>
                      {selectedTransport === transport.id && (
                        <div className="mt-2 pt-2 border-t border-primary/20 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-primary" />
                          <span className="text-[10px] font-semibold text-primary">Selected</span>
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Payment Button */}
                {!showPayment ? (
                  <button
                    onClick={() => setShowPayment(true)}
                    className="w-full bg-gradient-to-r from-primary to-blue-600 text-white py-3.5 rounded-2xl text-sm font-semibold shadow-lg shadow-primary/20 hover:shadow-xl transition-all flex items-center justify-center gap-2"
                  >
                    <CreditCard className="w-4 h-4" />
                    Proceed to Payment
                  </button>
                ) : (
                  <div className="bg-card rounded-2xl border border-border/50 p-4">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-primary" />
                      Payment
                    </h3>

                    {/* Order Summary */}
                    <div className="space-y-2 mb-4 pb-4 border-b border-border/30">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">Product</span>
                        <span className="font-semibold">{activeOrder.amount}</span>
                      </div>
                      {selectedPackaging && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Packaging</span>
                          <span className="font-semibold">{packagingOptions.find(p => p.id === selectedPackaging)?.price}</span>
                        </div>
                      )}
                      {selectedTransport && (
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">Transportation</span>
                          <span className="font-semibold">{transportOptions.find(t => t.id === selectedTransport)?.price}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-sm font-bold pt-2 border-t border-border/30">
                        <span>Total</span>
                        <span className="text-primary">
                          {(
                            parseInt(activeOrder.amount.replace(/[^0-9]/g, "")) +
                            (selectedPackaging ? parseInt(packagingOptions.find(p => p.id === selectedPackaging)?.price.replace(/[^0-9]/g, "") || "0") : 0) +
                            (selectedTransport ? parseInt(transportOptions.find(t => t.id === selectedTransport)?.price.replace(/[^0-9]/g, "") || "0") : 0)
                          ).toLocaleString()} AED
                        </span>
                      </div>
                    </div>

                    {/* Payment Methods */}
                    <div className="space-y-2 mb-4">
                      <button
                        onClick={() => toast.success("Payment successful! Order confirmed.")}
                        className="w-full flex items-center gap-3 p-3 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
                      >
                        <div className="p-2 bg-blue-50 rounded-lg">
                          <CreditCard className="w-4 h-4 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold">Credit / Debit Card</p>
                          <p className="text-[10px] text-muted-foreground">Visa, Mastercard, AMEX</p>
                        </div>
                      </button>
                      <button
                        onClick={() => toast.success("Apple Pay payment successful!")}
                        className="w-full flex items-center gap-3 p-3 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
                      >
                        <div className="p-2 bg-slate-900 rounded-lg">
                          <span className="text-white text-xs font-bold">AP</span>
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold">Apple Pay</p>
                          <p className="text-[10px] text-muted-foreground">Quick & secure payment</p>
                        </div>
                      </button>
                      <button
                        onClick={() => toast.success("Bank transfer initiated!")}
                        className="w-full flex items-center gap-3 p-3 bg-muted/50 rounded-xl hover:bg-muted transition-colors"
                      >
                        <div className="p-2 bg-green-50 rounded-lg">
                          <Warehouse className="w-4 h-4 text-green-600" />
                        </div>
                        <div className="text-left">
                          <p className="text-xs font-bold">Bank Transfer</p>
                          <p className="text-[10px] text-muted-foreground">Direct bank payment</p>
                        </div>
                      </button>
                    </div>

                    <button
                      onClick={() => {
                        toast.success("Payment completed! Your order is being processed.");
                        setShowPayment(false);
                      }}
                      className="w-full bg-green-600 text-white py-3 rounded-xl text-sm font-semibold hover:bg-green-700 transition-colors flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      Confirm Payment
                    </button>
                  </div>
                )}

                {/* Contact Seller */}
                <div className="flex gap-3 mt-4">
                  <button
                    onClick={() => toast.info("Calling seller...")}
                    className="flex-1 flex items-center justify-center gap-2 bg-card border border-border/50 py-3 rounded-2xl text-xs font-semibold hover:shadow-md transition-all"
                  >
                    <Phone className="w-4 h-4 text-green-600" /> Call Seller
                  </button>
                  <button
                    onClick={() => toast.info("Opening chat...")}
                    className="flex-1 flex items-center justify-center gap-2 bg-card border border-border/50 py-3 rounded-2xl text-xs font-semibold hover:shadow-md transition-all"
                  >
                    <MessageCircle className="w-4 h-4 text-blue-600" /> Message
                  </button>
                </div>
              </>
            )}
          </>
        )}
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
