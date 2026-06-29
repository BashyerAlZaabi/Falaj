/*
 * FALAJ Cart & Checkout Page
 * Cart items, shipping address, packaging/transport selection, payment
 * Design: Desert Minimalism
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { useLocation, Link } from "wouter";
import {
  ShoppingCart, Trash2, Plus, Minus, MapPin, Truck, Package,
  CreditCard, Check, Star, Shield, ChevronRight, CheckCircle2,
  Warehouse, ArrowRight, X
} from "lucide-react";
import { toast } from "sonner";

/* ─── Cart Items ─── */
const initialCartItems = [
  {
    id: 1, name: "Falaj Soil Moisture Sensor", price: 299, quantity: 2,
    seller: "FALAJ Official", source: "admin",
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-11-33-36_1ef889c7.jpg",
  },
  {
    id: 2, name: "Organic Tomatoes — Zone A", price: 45, quantity: 10,
    seller: "Al Ain Farm Co.", source: "user",
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop",
  },
];

/* ─── Packaging Services ─── */
const packagingOptions = [
  { id: 1, name: "PackFresh UAE", type: "Standard Crates", price: 50, rating: 4.7, eta: "Same day" },
  { id: 2, name: "AgroPack Emirates", type: "Vacuum Sealed", price: 85, rating: 4.8, eta: "Same day" },
  { id: 3, name: "GreenBox Co.", type: "Eco-Friendly", price: 65, rating: 4.5, eta: "Next day" },
];

/* ─── Transportation Services ─── */
const transportOptions = [
  { id: 1, name: "UAE Agri Logistics", type: "Refrigerated Truck", price: 150, rating: 4.8, eta: "Same day" },
  { id: 2, name: "FarmFleet Express", type: "Standard Delivery", price: 100, rating: 4.6, eta: "Next day" },
  { id: 3, name: "CoolChain Emirates", type: "Cold Chain", price: 220, rating: 4.9, eta: "Same day" },
];

type Step = "cart" | "shipping" | "services" | "payment" | "confirmation";
type ActiveStep = Exclude<Step, "confirmation">;

export default function Checkout() {
  const [, setLocation] = useLocation();
  const [step, setStep] = useState<Step>("cart");
  const [cartItems, setCartItems] = useState(initialCartItems);
  const [selectedPackaging, setSelectedPackaging] = useState<number | null>(null);
  const [selectedTransport, setSelectedTransport] = useState<number | null>(null);
  const [shippingAddress, setShippingAddress] = useState({
    name: "Ahmed Al Falasi",
    phone: "+971 50 123 4567",
    address: "Farm Zone B, Al Ain Road",
    city: "Abu Dhabi",
    emirate: "Abu Dhabi",
  });
  const [paymentMethod, setPaymentMethod] = useState<string | null>(null);

  const subtotal = cartItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const packagingCost = selectedPackaging ? packagingOptions.find(p => p.id === selectedPackaging)?.price || 0 : 0;
  const transportCost = selectedTransport ? transportOptions.find(t => t.id === selectedTransport)?.price || 0 : 0;
  const total = subtotal + packagingCost + transportCost;

  const updateQuantity = (id: number, delta: number) => {
    setCartItems(prev => prev.map(item =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + delta) } : item
    ));
  };

  const removeItem = (id: number) => {
    setCartItems(prev => prev.filter(item => item.id !== id));
    toast.success("Item removed from cart");
  };

  const steps: { key: Step; label: string; num: number }[] = [
    { key: "cart", label: "Cart", num: 1 },
    { key: "shipping", label: "Address", num: 2 },
    { key: "services", label: "Services", num: 3 },
    { key: "payment", label: "Payment", num: 4 },
  ];

  const activeStep = step as string;
  const stepIndex = steps.findIndex(s => s.key === activeStep);

  if (step === "confirmation") {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-[400px] w-full text-center"
        >
          <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Check className="w-10 h-10 text-green-600" />
          </div>
          <h1 className="text-2xl font-bold mb-2">Order Confirmed!</h1>
          <p className="text-sm text-muted-foreground mb-2">Order #ORD-2026-0851</p>
          <p className="text-xs text-muted-foreground leading-relaxed mb-6">
            Your order has been placed successfully. You'll receive a confirmation notification shortly.
            You can track your order in the Orders section.
          </p>
          <div className="bg-card rounded-2xl border border-border/50 p-4 mb-6 text-left">
            <div className="space-y-2">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Items</span>
                <span className="font-semibold">{cartItems.length} products</span>
              </div>
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-semibold">{subtotal.toLocaleString()} AED</span>
              </div>
              {selectedPackaging && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Packaging</span>
                  <span className="font-semibold">{packagingCost} AED</span>
                </div>
              )}
              {selectedTransport && (
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Transport</span>
                  <span className="font-semibold">{transportCost} AED</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold pt-2 border-t border-border/30">
                <span>Total Paid</span>
                <span className="text-primary">{total.toLocaleString()} AED</span>
              </div>
            </div>
          </div>
          <div className="flex gap-3">
            <Link href="/orders">
              <button className="flex-1 bg-primary text-white py-3 rounded-2xl text-sm font-semibold hover:bg-primary/90 transition-colors">
                Track Order
              </button>
            </Link>
            <Link href="/marketplace">
              <button className="flex-1 bg-card border border-border/50 py-3 rounded-2xl text-sm font-semibold hover:bg-muted transition-colors">
                Continue Shopping
              </button>
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      <PageHeader title="Checkout" />

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Step Indicator */}
        <div className="flex items-center gap-1 mb-6">
          {steps.map((s, i) => (
            <div key={s.key} className="flex items-center flex-1">
              <div className={`flex items-center gap-1.5 ${i <= stepIndex ? "text-primary" : "text-muted-foreground"}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold ${
                  i < stepIndex ? "bg-primary text-white" :
                  i === stepIndex ? "bg-primary text-white" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {i < stepIndex ? <Check className="w-3.5 h-3.5" /> : s.num}
                </div>
                <span className="text-[10px] font-semibold hidden sm:block">{s.label}</span>
              </div>
              {i < steps.length - 1 && (
                <div className={`flex-1 h-0.5 mx-1 ${i < stepIndex ? "bg-primary" : "bg-muted"}`} />
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ═══════ CART STEP ═══════ */}
          {step === "cart" && (
            <motion.div key="cart" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-sm font-bold mb-3">Your Cart ({cartItems.length} items)</h2>

              {cartItems.length === 0 ? (
                <div className="text-center py-12">
                  <ShoppingCart className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                  <p className="text-sm font-semibold mb-1">Your cart is empty</p>
                  <p className="text-xs text-muted-foreground mb-4">Browse the marketplace to find products</p>
                  <Link href="/marketplace">
                    <button className="bg-primary text-white px-6 py-2.5 rounded-xl text-sm font-semibold">
                      Browse Marketplace
                    </button>
                  </Link>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5 mb-4">
                    {cartItems.map((item) => (
                      <div key={item.id} className="bg-card rounded-2xl border border-border/50 p-3">
                        <div className="flex gap-3">
                          <img src={item.image} alt={item.name} className="w-20 h-20 rounded-xl object-cover" />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between">
                              <div>
                                <h4 className="text-xs font-bold leading-tight mb-0.5">{item.name}</h4>
                                <p className="text-[10px] text-muted-foreground">{item.seller}</p>
                              </div>
                              <button onClick={() => removeItem(item.id)} className="p-1 hover:bg-red-50 rounded-lg transition-colors">
                                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                              </button>
                            </div>
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-sm font-bold text-primary">{item.price} AED</span>
                              <div className="flex items-center gap-2 bg-muted/50 rounded-lg">
                                <button onClick={() => updateQuantity(item.id, -1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                                  <Minus className="w-3 h-3" />
                                </button>
                                <span className="text-xs font-bold w-5 text-center">{item.quantity}</span>
                                <button onClick={() => updateQuantity(item.id, 1)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                                  <Plus className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Order Summary */}
                  <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
                    <h3 className="text-xs font-bold mb-3 uppercase tracking-wider text-muted-foreground">Order Summary</h3>
                    {cartItems.map(item => (
                      <div key={item.id} className="flex justify-between text-xs mb-1.5">
                        <span className="text-muted-foreground">{item.name} x{item.quantity}</span>
                        <span className="font-semibold">{(item.price * item.quantity).toLocaleString()} AED</span>
                      </div>
                    ))}
                    <div className="flex justify-between text-sm font-bold pt-2 mt-2 border-t border-border/30">
                      <span>Subtotal</span>
                      <span className="text-primary">{subtotal.toLocaleString()} AED</span>
                    </div>
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* ═══════ SHIPPING STEP ═══════ */}
          {step === "shipping" && (
            <motion.div key="shipping" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-sm font-bold mb-3">Shipping Address</h2>
              <div className="space-y-3">
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Full Name</label>
                  <input
                    type="text" value={shippingAddress.name}
                    onChange={e => setShippingAddress({...shippingAddress, name: e.target.value})}
                    className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Phone</label>
                  <input
                    type="text" value={shippingAddress.phone}
                    onChange={e => setShippingAddress({...shippingAddress, phone: e.target.value})}
                    className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Address</label>
                  <input
                    type="text" value={shippingAddress.address}
                    onChange={e => setShippingAddress({...shippingAddress, address: e.target.value})}
                    className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">City</label>
                    <input
                      type="text" value={shippingAddress.city}
                      onChange={e => setShippingAddress({...shippingAddress, city: e.target.value})}
                      className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Emirate</label>
                    <input
                      type="text" value={shippingAddress.emirate}
                      onChange={e => setShippingAddress({...shippingAddress, emirate: e.target.value})}
                      className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                    />
                  </div>
                </div>
              </div>

              {/* Saved Address */}
              <div className="mt-4 bg-green-50 rounded-2xl border border-green-200 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <MapPin className="w-4 h-4 text-green-600" />
                  <span className="text-xs font-bold text-green-900">Default Farm Address</span>
                </div>
                <p className="text-[11px] text-green-700">Farm Zone B, Al Ain Road, Abu Dhabi</p>
              </div>
            </motion.div>
          )}

          {/* ═══════ SERVICES STEP ═══════ */}
          {step === "services" && (
            <motion.div key="services" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* Packaging */}
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Package className="w-4 h-4 text-orange-600" /> Select Packaging
              </h2>
              <div className="space-y-2 mb-6">
                {packagingOptions.map((pkg) => (
                  <button
                    key={pkg.id}
                    onClick={() => setSelectedPackaging(selectedPackaging === pkg.id ? null : pkg.id)}
                    className={`w-full bg-card rounded-2xl border p-3 text-left transition-all ${
                      selectedPackaging === pkg.id ? "border-primary shadow-md shadow-primary/10" : "border-border/50 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold">{pkg.name}</h4>
                        <p className="text-[10px] text-muted-foreground">{pkg.type} · ETA: {pkg.eta}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-primary">{pkg.price} AED</p>
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
                <button
                  onClick={() => setSelectedPackaging(null)}
                  className={`w-full bg-card rounded-2xl border p-3 text-left transition-all ${
                    selectedPackaging === null ? "border-slate-400" : "border-border/50"
                  }`}
                >
                  <p className="text-xs font-semibold text-muted-foreground">No packaging needed (self-pickup)</p>
                </button>
              </div>

              {/* Transportation */}
              <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" /> Select Transportation
              </h2>
              <div className="space-y-2">
                {transportOptions.map((transport) => (
                  <button
                    key={transport.id}
                    onClick={() => setSelectedTransport(selectedTransport === transport.id ? null : transport.id)}
                    className={`w-full bg-card rounded-2xl border p-3 text-left transition-all ${
                      selectedTransport === transport.id ? "border-primary shadow-md shadow-primary/10" : "border-border/50 hover:shadow-sm"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="text-xs font-bold">{transport.name}</h4>
                        <p className="text-[10px] text-muted-foreground">{transport.type} · ETA: {transport.eta}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-bold text-primary">{transport.price} AED</p>
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
                <button
                  onClick={() => setSelectedTransport(null)}
                  className={`w-full bg-card rounded-2xl border p-3 text-left transition-all ${
                    selectedTransport === null ? "border-slate-400" : "border-border/50"
                  }`}
                >
                  <p className="text-xs font-semibold text-muted-foreground">Self-pickup from seller</p>
                </button>
              </div>
            </motion.div>
          )}

          {/* ═══════ PAYMENT STEP ═══════ */}
          {step === "payment" && (
            <motion.div key="payment" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <h2 className="text-sm font-bold mb-3">Order Summary</h2>

              {/* Summary */}
              <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
                {cartItems.map(item => (
                  <div key={item.id} className="flex items-center gap-3 mb-2.5">
                    <img src={item.image} alt={item.name} className="w-12 h-12 rounded-lg object-cover" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold truncate">{item.name}</p>
                      <p className="text-[10px] text-muted-foreground">Qty: {item.quantity}</p>
                    </div>
                    <span className="text-xs font-bold">{(item.price * item.quantity).toLocaleString()} AED</span>
                  </div>
                ))}
                <div className="border-t border-border/30 pt-2 mt-2 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Subtotal</span>
                    <span className="font-semibold">{subtotal.toLocaleString()} AED</span>
                  </div>
                  {selectedPackaging && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Packaging ({packagingOptions.find(p => p.id === selectedPackaging)?.name})</span>
                      <span className="font-semibold">{packagingCost} AED</span>
                    </div>
                  )}
                  {selectedTransport && (
                    <div className="flex justify-between text-xs">
                      <span className="text-muted-foreground">Transport ({transportOptions.find(t => t.id === selectedTransport)?.name})</span>
                      <span className="font-semibold">{transportCost} AED</span>
                    </div>
                  )}
                  <div className="flex justify-between text-sm font-bold pt-2 border-t border-border/30">
                    <span>Total</span>
                    <span className="text-primary">{total.toLocaleString()} AED</span>
                  </div>
                </div>
              </div>

              {/* Shipping Address Summary */}
              <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
                <h3 className="text-xs font-bold mb-2 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-green-600" /> Delivery Address
                </h3>
                <p className="text-xs">{shippingAddress.name}</p>
                <p className="text-[10px] text-muted-foreground">{shippingAddress.address}, {shippingAddress.city}, {shippingAddress.emirate}</p>
                <p className="text-[10px] text-muted-foreground">{shippingAddress.phone}</p>
              </div>

              {/* Payment Methods */}
              <h2 className="text-sm font-bold mb-3">Payment Method</h2>
              <div className="space-y-2 mb-4">
                <button
                  onClick={() => setPaymentMethod("card")}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                    paymentMethod === "card" ? "border-primary bg-primary/5 shadow-sm" : "border-border/50 bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="p-2 bg-blue-50 rounded-xl">
                    <CreditCard className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-xs font-bold">Credit / Debit Card</p>
                    <p className="text-[10px] text-muted-foreground">Visa, Mastercard, AMEX</p>
                  </div>
                  {paymentMethod === "card" && <CheckCircle2 className="w-5 h-5 text-primary" />}
                </button>
                <button
                  onClick={() => setPaymentMethod("apple")}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                    paymentMethod === "apple" ? "border-primary bg-primary/5 shadow-sm" : "border-border/50 bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="p-2 bg-slate-900 rounded-xl">
                    <span className="text-white text-sm font-bold">AP</span>
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-xs font-bold">Apple Pay</p>
                    <p className="text-[10px] text-muted-foreground">Quick & secure payment</p>
                  </div>
                  {paymentMethod === "apple" && <CheckCircle2 className="w-5 h-5 text-primary" />}
                </button>
                <button
                  onClick={() => setPaymentMethod("bank")}
                  className={`w-full flex items-center gap-3 p-3.5 rounded-2xl border transition-all ${
                    paymentMethod === "bank" ? "border-primary bg-primary/5 shadow-sm" : "border-border/50 bg-card hover:bg-muted/50"
                  }`}
                >
                  <div className="p-2 bg-green-50 rounded-xl">
                    <Warehouse className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="text-left flex-1">
                    <p className="text-xs font-bold">Bank Transfer</p>
                    <p className="text-[10px] text-muted-foreground">Direct bank payment</p>
                  </div>
                  {paymentMethod === "bank" && <CheckCircle2 className="w-5 h-5 text-primary" />}
                </button>
              </div>

              {/* Card Details (if card selected) */}
              {paymentMethod === "card" && (
                <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4 space-y-3">
                  <div>
                    <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Card Number</label>
                    <input type="text" placeholder="1234 5678 9012 3456" className="w-full px-4 py-2.5 bg-muted/30 border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">Expiry</label>
                      <input type="text" placeholder="MM/YY" className="w-full px-4 py-2.5 bg-muted/30 border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                    <div>
                      <label className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1 block">CVV</label>
                      <input type="text" placeholder="123" className="w-full px-4 py-2.5 bg-muted/30 border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20" />
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Fixed Bottom Action Bar */}
      {(step as string) !== "confirmation" && (
        <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-border/50 p-4 z-50">
          <div className="max-w-[480px] mx-auto">
            {/* Total */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-primary">{total.toLocaleString()} AED</span>
            </div>
            <div className="flex gap-3">
              {stepIndex > 0 && (
                <button
                  onClick={() => setStep(steps[stepIndex - 1].key)}
                  className="px-6 py-3 bg-card border border-border/50 rounded-2xl text-sm font-semibold hover:bg-muted transition-colors"
                >
                  Back
                </button>
              )}
              <button
                onClick={() => {
                  if (step === "payment") {
                    if (!paymentMethod) {
                      toast.error("Please select a payment method");
                      return;
                    }
                    toast.success("Payment successful!");
                    setStep("confirmation");
                  } else {
                    setStep(steps[stepIndex + 1].key);
                  }
                }}
                disabled={step === "cart" && cartItems.length === 0}
                className="flex-1 bg-primary text-white py-3 rounded-2xl text-sm font-bold hover:bg-primary/90 transition-colors shadow-lg shadow-primary/20 flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {step === "payment" ? (
                  <>
                    <Shield className="w-4 h-4" /> Pay {total.toLocaleString()} AED
                  </>
                ) : (
                  <>
                    Continue <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
