/*
 * FALAJ Product Detail Page
 * Full product view with images, description, seller info, reviews, Add to Cart, Buy Now
 * Design: Desert Minimalism
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion } from "framer-motion";
import { useState } from "react";
import { useLocation, useParams, Link } from "wouter";
import {
  ArrowLeft, Star, Heart, Share2, ShoppingCart, Zap,
  MapPin, Shield, Truck, Package, MessageCircle, Phone,
  ChevronRight, Check, Clock, User, ThumbsUp
} from "lucide-react";
import { toast } from "sonner";

/* ─── Products Data (shared with Marketplace) ─── */
const allProducts = [
  {
    id: 1, name: "Organic Tomatoes — Zone A", price: "45 AED/kg", priceNum: 45, seller: "Al Ain Farm Co.",
    rating: 4.8, reviews: 124, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=800&h=600&fit=crop",
    tag: "Fresh Harvest", category: "Produce",
    description: "Premium organic tomatoes grown in Zone A of our Al Ain farm. Hand-picked at peak ripeness, these tomatoes are perfect for salads, cooking, and fresh consumption. No pesticides or chemical fertilizers used.",
    specs: [
      { label: "Origin", value: "Al Ain, Abu Dhabi" },
      { label: "Type", value: "Organic, Non-GMO" },
      { label: "Min Order", value: "5 kg" },
      { label: "Shelf Life", value: "7-10 days" },
      { label: "Certification", value: "UAE Organic" },
    ],
    sellerRating: 4.7, sellerOrders: 342, sellerSince: "2024",
    gallery: [
      "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1558818498-28c1e002b655?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1561136594-7f68413baa99?w=800&h=600&fit=crop",
    ],
  },
  {
    id: 2, name: "Falaj Soil Moisture Sensor", price: "299 AED", priceNum: 299, seller: "FALAJ Official",
    rating: 4.9, reviews: 87, type: "sell", source: "admin" as const,
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-11-33-36_1ef889c7.jpg",
    tag: "Best Seller", category: "Equipment",
    description: "Advanced soil moisture sensor with real-time monitoring capabilities. Connects to the FALAJ app for instant readings, historical data, and AI-powered irrigation recommendations. Waterproof IP67 rated.",
    specs: [
      { label: "Range", value: "0-100% VWC" },
      { label: "Accuracy", value: "±2%" },
      { label: "Battery", value: "2 years" },
      { label: "Connectivity", value: "LoRa + WiFi" },
      { label: "Warranty", value: "2 years" },
    ],
    sellerRating: 4.9, sellerOrders: 1250, sellerSince: "2023",
    gallery: [
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-11-33-36_1ef889c7.jpg",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-042_8c0cbad1.jpg",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-043_c7566b6c.jpg",
    ],
  },
  {
    id: 3, name: "Date Palm Seedlings (x50)", price: "1,200 AED", priceNum: 1200, seller: "UAE Nursery",
    rating: 4.7, reviews: 56, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&h=600&fit=crop",
    tag: "Bulk Deal", category: "Seeds & Plants",
    description: "Premium date palm seedlings, variety Khalas and Barhi. Each seedling is 6-12 months old, healthy root system, ready for transplanting. Includes planting guide and first-year care instructions.",
    specs: [
      { label: "Variety", value: "Khalas & Barhi" },
      { label: "Age", value: "6-12 months" },
      { label: "Height", value: "40-60 cm" },
      { label: "Quantity", value: "50 seedlings" },
      { label: "Guarantee", value: "90% survival" },
    ],
    sellerRating: 4.6, sellerOrders: 189, sellerSince: "2024",
    gallery: [
      "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=800&h=600&fit=crop",
      "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800&h=600&fit=crop",
    ],
  },
  {
    id: 4, name: "Falaj Complete Kit", price: "1,499 AED", priceNum: 1499, seller: "FALAJ Official",
    rating: 4.9, reviews: 43, type: "sell", source: "admin" as const,
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-04_c023b154.jpg",
    tag: "Popular", category: "Equipment",
    description: "The complete FALAJ smart agriculture kit includes soil moisture sensor, weather station, water flow meter, and gateway hub. Everything you need to start monitoring your farm with AI-powered insights.",
    specs: [
      { label: "Includes", value: "4 sensors + hub" },
      { label: "Coverage", value: "Up to 5 acres" },
      { label: "App", value: "iOS & Android" },
      { label: "Setup", value: "30 minutes" },
      { label: "Warranty", value: "3 years" },
    ],
    sellerRating: 4.9, sellerOrders: 1250, sellerSince: "2023",
    gallery: [
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-04_c023b154.jpg",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-042_8c0cbad1.jpg",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-043_c7566b6c.jpg",
    ],
  },
  {
    id: 5, name: "Organic Fertilizer — 25kg", price: "Trade for Compost", priceNum: 0, seller: "Green Valley",
    rating: 4.5, reviews: 31, type: "trade", source: "user" as const,
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop",
    tag: "Trade", category: "Supplies",
    description: "High-quality organic fertilizer, 25kg bag. Rich in nitrogen, phosphorus, and potassium. Perfect for vegetable gardens and fruit trees. Looking to trade for organic compost or mulch.",
    specs: [
      { label: "Weight", value: "25 kg" },
      { label: "NPK", value: "5-3-4" },
      { label: "Type", value: "Organic" },
      { label: "Use", value: "All crops" },
      { label: "Trade For", value: "Compost/Mulch" },
    ],
    sellerRating: 4.4, sellerOrders: 78, sellerSince: "2025",
    gallery: [
      "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=800&h=600&fit=crop",
    ],
  },
  {
    id: 6, name: "Drip Irrigation System", price: "850 AED", priceNum: 850, seller: "Aqua Solutions",
    rating: 4.6, reviews: 67, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?w=800&h=600&fit=crop",
    tag: null, category: "Equipment",
    description: "Complete drip irrigation system covering up to 1 acre. Includes main line, sub-lines, drippers, filters, and pressure regulator. Water-efficient design saves up to 60% water compared to flood irrigation.",
    specs: [
      { label: "Coverage", value: "Up to 1 acre" },
      { label: "Drippers", value: "200 units" },
      { label: "Flow Rate", value: "2-4 L/hr" },
      { label: "Material", value: "UV-resistant PE" },
      { label: "Warranty", value: "1 year" },
    ],
    sellerRating: 4.5, sellerOrders: 156, sellerSince: "2024",
    gallery: [
      "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?w=800&h=600&fit=crop",
    ],
  },
  {
    id: 7, name: "Falaj Weather Station", price: "899 AED", priceNum: 899, seller: "FALAJ Official",
    rating: 4.8, reviews: 34, type: "sell", source: "admin" as const,
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-043_c7566b6c.jpg",
    tag: "New", category: "Equipment",
    description: "Professional-grade weather station designed for UAE farms. Measures temperature, humidity, wind speed, rainfall, UV index, and barometric pressure. Connects to FALAJ app for real-time alerts.",
    specs: [
      { label: "Sensors", value: "6 parameters" },
      { label: "Range", value: "100m wireless" },
      { label: "Battery", value: "Solar powered" },
      { label: "Data", value: "Every 5 min" },
      { label: "Warranty", value: "2 years" },
    ],
    sellerRating: 4.9, sellerOrders: 1250, sellerSince: "2023",
    gallery: [
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-043_c7566b6c.jpg",
      "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-04_c023b154.jpg",
    ],
  },
  {
    id: 8, name: "Fresh Cucumbers — Organic", price: "35 AED/kg", priceNum: 35, seller: "Liwa Farms",
    rating: 4.6, reviews: 89, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=800&h=600&fit=crop",
    tag: "Organic", category: "Produce",
    description: "Fresh organic cucumbers from Liwa Farms. Crisp, juicy, and pesticide-free. Harvested daily for maximum freshness. Available for bulk orders with delivery across Abu Dhabi and Dubai.",
    specs: [
      { label: "Origin", value: "Liwa, Abu Dhabi" },
      { label: "Type", value: "Organic" },
      { label: "Min Order", value: "3 kg" },
      { label: "Shelf Life", value: "5-7 days" },
      { label: "Delivery", value: "Same day" },
    ],
    sellerRating: 4.5, sellerOrders: 267, sellerSince: "2024",
    gallery: [
      "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=800&h=600&fit=crop",
    ],
  },
];

/* ─── Sample Reviews ─── */
const sampleReviews = [
  { id: 1, user: "Ahmed M.", rating: 5, date: "Feb 28, 2026", text: "Excellent quality! Exactly as described. Fast delivery too.", helpful: 12 },
  { id: 2, user: "Sara K.", rating: 4, date: "Feb 20, 2026", text: "Good product, well packaged. Would buy again.", helpful: 8 },
  { id: 3, user: "Mohammed A.", rating: 5, date: "Feb 15, 2026", text: "Best I've found in the UAE. The seller was very responsive and helpful.", helpful: 15 },
];

export default function ProductDetail() {
  const params = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [selectedImage, setSelectedImage] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [isFavorite, setIsFavorite] = useState(false);

  const product = allProducts.find(p => p.id === Number(params.id));

  if (!product) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-bold mb-2">Product not found</p>
          <button onClick={() => setLocation("/marketplace")} className="text-primary text-sm font-semibold">
            Back to Marketplace
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-32">
      {/* Image Gallery */}
      <div className="relative">
        <motion.img
          key={selectedImage}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          src={product.gallery[selectedImage]}
          alt={product.name}
          className="w-full h-72 object-cover"
        />
        {/* Top Bar */}
        <div className="absolute top-0 left-0 right-0 flex items-center justify-between p-4">
          <button
            onClick={() => setLocation("/marketplace")}
            className="p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex gap-2">
            <button
              onClick={() => {
                setIsFavorite(!isFavorite);
                toast.success(isFavorite ? "Removed from favorites" : "Added to favorites");
              }}
              className="p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm"
            >
              <Heart className={`w-5 h-5 ${isFavorite ? "fill-red-500 text-red-500" : ""}`} />
            </button>
            <button
              onClick={() => toast.success("Link copied!")}
              className="p-2 bg-white/80 backdrop-blur-sm rounded-full shadow-sm"
            >
              <Share2 className="w-5 h-5" />
            </button>
          </div>
        </div>
        {/* Source Badge */}
        <span className={`absolute bottom-3 left-3 text-[10px] font-bold px-2.5 py-1 rounded-full ${
          product.source === "admin" ? "bg-red-500 text-white" : "bg-white/90 text-slate-600"
        }`}>
          {product.source === "admin" ? "FALAJ Official" : "User Listed"}
        </span>
        {/* Gallery Dots */}
        {product.gallery.length > 1 && (
          <div className="absolute bottom-3 right-3 flex gap-1.5">
            {product.gallery.map((_, i) => (
              <button
                key={i}
                onClick={() => setSelectedImage(i)}
                className={`w-2 h-2 rounded-full transition-all ${
                  i === selectedImage ? "bg-white w-5" : "bg-white/50"
                }`}
              />
            ))}
          </div>
        )}
      </div>

      {/* Thumbnail Strip */}
      {product.gallery.length > 1 && (
        <div className="flex gap-2 px-4 py-3 overflow-x-auto">
          {product.gallery.map((img, i) => (
            <button
              key={i}
              onClick={() => setSelectedImage(i)}
              className={`w-16 h-16 rounded-xl overflow-hidden shrink-0 border-2 transition-all ${
                i === selectedImage ? "border-primary" : "border-transparent opacity-60"
              }`}
            >
              <img src={img} alt="" className="w-full h-full object-cover" />
            </button>
          ))}
        </div>
      )}

      <div className="max-w-[480px] mx-auto px-4">
        {/* Title & Price */}
        <div className="mb-4">
          {product.tag && (
            <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mb-2 ${
              product.type === "trade" ? "bg-amber-100 text-amber-700" : "bg-primary/10 text-primary"
            }`}>
              {product.tag}
            </span>
          )}
          <h1 className="text-xl font-bold mb-1">{product.name}</h1>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-sm font-bold">{product.rating}</span>
              <span className="text-xs text-muted-foreground">({product.reviews} reviews)</span>
            </div>
            <span className="text-xs text-muted-foreground">·</span>
            <span className="text-xs text-muted-foreground">{product.category}</span>
          </div>
          <p className="text-2xl font-bold text-primary mt-2">{product.price}</p>
        </div>

        {/* Description */}
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2">Description</h3>
          <p className="text-xs text-muted-foreground leading-relaxed">{product.description}</p>
        </div>

        {/* Specifications */}
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2">Specifications</h3>
          <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
            {product.specs.map((spec, i) => (
              <div key={i} className={`flex items-center justify-between px-4 py-2.5 ${
                i < product.specs.length - 1 ? "border-b border-border/30" : ""
              }`}>
                <span className="text-xs text-muted-foreground">{spec.label}</span>
                <span className="text-xs font-semibold">{spec.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Quantity Selector (for sell items) */}
        {product.type === "sell" && (
          <div className="mb-4">
            <h3 className="text-sm font-bold mb-2">Quantity</h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setQuantity(Math.max(1, quantity - 1))}
                className="w-10 h-10 bg-card border border-border/50 rounded-xl flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
              >
                -
              </button>
              <span className="text-lg font-bold w-8 text-center">{quantity}</span>
              <button
                onClick={() => setQuantity(quantity + 1)}
                className="w-10 h-10 bg-card border border-border/50 rounded-xl flex items-center justify-center text-lg font-bold hover:bg-muted transition-colors"
              >
                +
              </button>
            </div>
          </div>
        )}

        {/* Seller Info */}
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2">Seller</h3>
          <div className="bg-card rounded-2xl border border-border/50 p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                product.source === "admin" ? "bg-primary" : "bg-slate-200"
              }`}>
                {product.source === "admin" ? (
                  <Shield className="w-5 h-5 text-white" />
                ) : (
                  <User className="w-5 h-5 text-slate-500" />
                )}
              </div>
              <div className="flex-1">
                <h4 className="text-sm font-bold">{product.seller}</h4>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <div className="flex items-center gap-0.5">
                    <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                    <span>{product.sellerRating}</span>
                  </div>
                  <span>·</span>
                  <span>{product.sellerOrders} orders</span>
                  <span>·</span>
                  <span>Since {product.sellerSince}</span>
                </div>
              </div>
              {product.source === "admin" && (
                <span className="text-[9px] font-bold bg-primary/10 text-primary px-2 py-1 rounded-full">Verified</span>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => toast.info("Opening chat with seller...")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-muted/50 rounded-xl text-xs font-semibold hover:bg-muted transition-colors"
              >
                <MessageCircle className="w-3.5 h-3.5 text-blue-600" /> Message
              </button>
              <button
                onClick={() => toast.info("Calling seller...")}
                className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-muted/50 rounded-xl text-xs font-semibold hover:bg-muted transition-colors"
              >
                <Phone className="w-3.5 h-3.5 text-green-600" /> Call
              </button>
            </div>
          </div>
        </div>

        {/* Delivery Info */}
        <div className="mb-4">
          <h3 className="text-sm font-bold mb-2">Delivery</h3>
          <div className="space-y-2">
            <div className="flex items-center gap-3 bg-card rounded-xl border border-border/50 p-3">
              <Truck className="w-4 h-4 text-blue-600" />
              <div>
                <p className="text-xs font-semibold">Standard Delivery</p>
                <p className="text-[10px] text-muted-foreground">1-3 business days across UAE</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-card rounded-xl border border-border/50 p-3">
              <Package className="w-4 h-4 text-orange-600" />
              <div>
                <p className="text-xs font-semibold">Packaging Options</p>
                <p className="text-[10px] text-muted-foreground">Choose packaging at checkout</p>
              </div>
            </div>
            <div className="flex items-center gap-3 bg-card rounded-xl border border-border/50 p-3">
              <MapPin className="w-4 h-4 text-green-600" />
              <div>
                <p className="text-xs font-semibold">Pickup Available</p>
                <p className="text-[10px] text-muted-foreground">Collect from seller location</p>
              </div>
            </div>
          </div>
        </div>

        {/* Reviews */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-bold">Reviews ({product.reviews})</h3>
            <button className="text-xs text-primary font-semibold">See All</button>
          </div>
          <div className="space-y-2.5">
            {sampleReviews.map((review) => (
              <div key={review.id} className="bg-card rounded-2xl border border-border/50 p-3">
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 bg-muted rounded-full flex items-center justify-center">
                      <User className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <p className="text-xs font-bold">{review.user}</p>
                      <p className="text-[9px] text-muted-foreground">{review.date}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-0.5">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`w-3 h-3 ${i < review.rating ? "text-amber-400 fill-amber-400" : "text-muted"}`} />
                    ))}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed mb-2">{review.text}</p>
                <button className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors">
                  <ThumbsUp className="w-3 h-3" /> Helpful ({review.helpful})
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Action Bar */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/95 backdrop-blur-xl border-t border-border/50 p-4 z-50">
        <div className="max-w-[480px] mx-auto flex gap-3">
          {product.type === "trade" ? (
            <button
              onClick={() => {
                toast.success("Trade request sent to seller!");
              }}
              className="flex-1 bg-amber-500 text-white py-3.5 rounded-2xl text-sm font-bold hover:bg-amber-600 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-amber-500/20"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
              Send Trade Offer
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  toast.success(`${quantity}x ${product.name} added to cart!`);
                }}
                className="flex-1 bg-card border-2 border-primary text-primary py-3.5 rounded-2xl text-sm font-bold hover:bg-primary/5 transition-colors flex items-center justify-center gap-2"
              >
                <ShoppingCart className="w-4 h-4" /> Add to Cart
              </button>
              <Link href="/marketplace/checkout">
                <button
                  onClick={() => {
                    toast.success("Proceeding to checkout...");
                  }}
                  className="flex-1 bg-primary text-white py-3.5 rounded-2xl text-sm font-bold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-primary/20"
                >
                  <Zap className="w-4 h-4" /> Buy Now
                </button>
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
