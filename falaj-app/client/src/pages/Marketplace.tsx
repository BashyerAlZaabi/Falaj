/*
 * FALAJ Marketplace — Full Business Ecosystem Hub
 * Products from users AND admin, buy/sell/trade, services, trade license
 * Tabs: Products, Services, My Listings, Trade License
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import { Link } from "wouter";
import {
  ShoppingCart, Star, Plus, Search, Filter,
  Truck, Package, Warehouse, Factory, Leaf, Tractor,
  FileText, Building2, Globe, BadgeCheck, ArrowRight,
  Repeat, Tag, TrendingUp, ChevronRight, Bell,
  Droplets, Settings, Shield, Crown, Eye
} from "lucide-react";
import { toast } from "sonner";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";

/* ─── Tab Type ─── */
type MarketTab = "products" | "services" | "myListings" | "license";

/* ─── Products Data — from users AND admin ─── */
const products = [
  {
    id: 1, name: "Organic Tomatoes — Zone A", price: "45 AED/kg", seller: "Al Ain Farm Co.",
    rating: 4.8, reviews: 124, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1592924357228-91a4daadcfea?w=400&h=300&fit=crop",
    tag: "Fresh Harvest", category: "Produce",
  },
  {
    id: 2, name: "Falaj Soil Moisture Sensor", price: "299 AED", seller: "FALAJ Official",
    rating: 4.9, reviews: 87, type: "sell", source: "admin" as const,
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-11-33-36_1ef889c7.jpg",
    tag: "Best Seller", category: "Equipment",
  },
  {
    id: 3, name: "Date Palm Seedlings (x50)", price: "1,200 AED", seller: "UAE Nursery",
    rating: 4.7, reviews: 56, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=400&h=300&fit=crop",
    tag: "Bulk Deal", category: "Seeds & Plants",
  },
  {
    id: 4, name: "Falaj Complete Kit", price: "1,499 AED", seller: "FALAJ Official",
    rating: 4.9, reviews: 43, type: "sell", source: "admin" as const,
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-04_c023b154.jpg",
    tag: "Popular", category: "Equipment",
  },
  {
    id: 5, name: "Organic Fertilizer — 25kg", price: "Trade for Compost", seller: "Green Valley",
    rating: 4.5, reviews: 31, type: "trade", source: "user" as const,
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=400&h=300&fit=crop",
    tag: "Trade", category: "Supplies",
  },
  {
    id: 6, name: "Drip Irrigation System", price: "850 AED", seller: "Aqua Solutions",
    rating: 4.6, reviews: 67, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1563514227147-6d2ff665a6a0?w=400&h=300&fit=crop",
    tag: null, category: "Equipment",
  },
  {
    id: 7, name: "Falaj Weather Station", price: "899 AED", seller: "FALAJ Official",
    rating: 4.8, reviews: 34, type: "sell", source: "admin" as const,
    image: "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/PHOTO-2026-02-18-15-01-043_c7566b6c.jpg",
    tag: "New", category: "Equipment",
  },
  {
    id: 8, name: "Fresh Cucumbers — Organic", price: "35 AED/kg", seller: "Liwa Farms",
    rating: 4.6, reviews: 89, type: "sell", source: "user" as const,
    image: "https://images.unsplash.com/photo-1449300079323-02e209d9d3a6?w=400&h=300&fit=crop",
    tag: "Organic", category: "Produce",
  },
];

const productCategories = ["All", "Produce", "Equipment", "Seeds & Plants", "Supplies", "Livestock"];
const sourceFilters = ["All Sources", "Admin Listed", "User Listed"];

/* ─── Services Data ─── */
const services = [
  {
    id: 1, name: "Farm-to-Market Transport", provider: "UAE Agri Logistics",
    price: "From 150 AED", icon: Truck, color: "bg-blue-50 text-blue-600",
    description: "Refrigerated transport for fresh produce across UAE. Same-day delivery available.",
    rating: 4.8, bookings: 342, bookingType: "transportation",
  },
  {
    id: 2, name: "Produce Packaging", provider: "PackFresh UAE",
    price: "From 50 AED", icon: Package, color: "bg-orange-50 text-orange-600",
    description: "Professional packaging solutions: vacuum seal, crates, branded boxes, export-grade.",
    rating: 4.7, bookings: 218, bookingType: "packaging",
  },
  {
    id: 3, name: "Cold Storage", provider: "CoolChain Emirates",
    price: "From 200 AED/day", icon: Warehouse, color: "bg-teal-50 text-teal-600",
    description: "Temperature-controlled storage facilities in Abu Dhabi, Dubai, and Al Ain.",
    rating: 4.9, bookings: 156, bookingType: "storage",
  },
  {
    id: 4, name: "Food Processing", provider: "AgriProcess Co.",
    price: "Custom Quote", icon: Factory, color: "bg-purple-50 text-purple-600",
    description: "Juice extraction, drying, canning, and value-added processing services.",
    rating: 4.6, bookings: 89, bookingType: "processing",
  },
  {
    id: 5, name: "Organic Certification", provider: "UAE Organic Council",
    price: "From 2,500 AED", icon: Leaf, color: "bg-green-50 text-green-600",
    description: "Get your farm and products certified organic. Full audit and documentation support.",
    rating: 4.8, bookings: 67, bookingType: "organic",
  },
  {
    id: 6, name: "Farm Equipment Rental", provider: "AgriRent UAE",
    price: "From 300 AED/day", icon: Tractor, color: "bg-amber-50 text-amber-600",
    description: "Tractors, harvesters, sprayers, and specialized equipment available for rent.",
    rating: 4.5, bookings: 203, bookingType: "equipment",
  },
  {
    id: 7, name: "Soil Testing Lab", provider: "AgroLab Emirates",
    price: "From 120 AED", icon: Droplets, color: "bg-cyan-50 text-cyan-600",
    description: "Comprehensive soil analysis: pH, nutrients, contaminants, and recommendations.",
    rating: 4.9, bookings: 445, bookingType: "soil",
  },
  {
    id: 8, name: "Export Documentation", provider: "TradeGate UAE",
    price: "From 500 AED", icon: FileText, color: "bg-rose-50 text-rose-600",
    description: "Complete export documentation, phytosanitary certificates, and customs clearance.",
    rating: 4.7, bookings: 134, bookingType: "export",
  },
];

/* ─── My Listings Data ─── */
const myListings = [
  {
    id: 1, name: "Fresh Cucumbers — Zone B", price: "35 AED/kg", status: "active",
    views: 234, inquiries: 12, type: "sell", daysLeft: 14,
  },
  {
    id: 2, name: "Used Drip System (50m)", price: "Trade for Sensors", status: "active",
    views: 89, inquiries: 5, type: "trade", daysLeft: 7,
  },
  {
    id: 3, name: "Organic Lettuce Batch", price: "28 AED/kg", status: "sold",
    views: 456, inquiries: 23, type: "sell", daysLeft: 0,
  },
];

/* ─── Business Activities (120+) ─── */
const businessActivities = [
  "Crop Farming", "Greenhouse Cultivation", "Organic Farming", "Hydroponics",
  "Aquaponics", "Vertical Farming", "Date Palm Cultivation", "Fruit Orchards",
  "Vegetable Production", "Herb Growing", "Flower Cultivation", "Seed Production",
  "Nursery Operations", "Livestock Farming", "Poultry Farming", "Dairy Farming",
  "Beekeeping & Honey", "Fish Farming (Aquaculture)", "Shrimp Farming",
  "Animal Feed Production", "Fodder Growing", "Silage Production",
  "Agri-Tourism", "Farm Stays & Hospitality", "Educational Farm Tours",
  "Farm-to-Table Restaurant", "Cooking Classes", "Farm Events & Weddings",
  "Agricultural Trading", "Wholesale Produce", "Retail Farm Shop",
  "Online Produce Sales", "Export Trading", "Import Trading",
  "Commodity Brokerage", "Auction Services", "B2B Agricultural Supply",
  "Food Processing", "Juice & Beverage Production", "Canning & Preservation",
  "Drying & Dehydration", "Milling & Grinding", "Oil Extraction",
  "Dairy Processing", "Meat Processing", "Bakery & Confectionery",
  "Spice Processing", "Herbal Products", "Essential Oils",
  "Transportation & Logistics", "Cold Chain Logistics", "Farm Delivery Service",
  "Warehouse & Storage", "Distribution Center", "Last-Mile Delivery",
  "Packaging Services", "Labeling & Branding", "Quality Inspection",
  "Agricultural Consulting", "Farm Management", "Irrigation Design",
  "Soil Analysis Services", "Pest Control Services", "Crop Advisory",
  "Precision Agriculture", "Drone Services", "IoT & Sensor Solutions",
  "Agricultural Software", "Farm Data Analytics", "AI Crop Monitoring",
  "Equipment Manufacturing", "Irrigation Equipment", "Greenhouse Construction",
  "Farm Infrastructure", "Solar Farm Solutions", "Water Treatment",
  "Fertilizer Production", "Organic Compost", "Bio-Pesticides",
  "Seed Development", "Plant Breeding", "Tissue Culture Lab",
  "Agricultural Research", "Soil Research", "Climate Research",
  "Veterinary Services", "Animal Health Products", "Breeding Services",
  "Agricultural Insurance", "Farm Finance & Loans", "Investment Advisory",
  "Land Leasing", "Farm Equipment Leasing", "Water Rights Trading",
  "Organic Certification", "Halal Certification", "Export Certification",
  "Environmental Consulting", "Sustainability Auditing", "Carbon Credit Trading",
  "Waste Management", "Composting Services", "Biogas Production",
  "Agricultural Training", "Workforce Recruitment", "Safety Compliance",
  "Market Research", "Brand Development", "Digital Marketing for Farms",
  "E-Commerce Platform", "Marketplace Operations", "Auction Platform",
  "Agricultural Media", "Farm Photography", "Content Creation",
  "Cooperative Management", "Farmers Association", "Community Supported Agriculture",
  "Government Liaison", "Subsidy Advisory", "Regulatory Compliance",
  "International Trade", "Free Zone Operations", "Customs Brokerage",
  "Agricultural Events", "Trade Shows", "Farm Exhibitions",
  "Landscaping Services", "Garden Design", "Urban Farming Solutions",
  "Rooftop Farming", "Indoor Farming", "Container Farming",
];

export default function Marketplace() {
  const [activeTab, setActiveTab] = useState<MarketTab>("products");
  const [productFilter, setProductFilter] = useState("All");
  const [sourceFilter, setSourceFilter] = useState("All Sources");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedActivities, setSelectedActivities] = useState<string[]>([]);
  const [licenseStatus, setLicenseStatus] = useState<"none" | "pending" | "approved" | "tamm">("none");
  const [activitySearch, setActivitySearch] = useState("");
  const [cart, setCart] = useState<number[]>([]);

  const filteredProducts = products.filter(p =>
    (productFilter === "All" || p.category === productFilter) &&
    (sourceFilter === "All Sources" ||
      (sourceFilter === "Admin Listed" && p.source === "admin") ||
      (sourceFilter === "User Listed" && p.source === "user")) &&
    (searchQuery === "" || p.name.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  const filteredActivities = businessActivities.filter(a =>
    activitySearch === "" || a.toLowerCase().includes(activitySearch.toLowerCase())
  );

  const addToCart = (productId: number) => {
    setCart(prev => [...prev, productId]);
    toast.success("Added to cart!");
  };

  const tabs: { key: MarketTab; label: string; icon: React.ReactNode }[] = [
    { key: "products", label: "Products", icon: <Tag className="w-3.5 h-3.5" /> },
    { key: "services", label: "Services", icon: <Truck className="w-3.5 h-3.5" /> },
    { key: "myListings", label: "My Listings", icon: <TrendingUp className="w-3.5 h-3.5" /> },
    { key: "license", label: "License", icon: <FileText className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <img src={FALAJ_LOGO_BLACK} alt="FALAJ" className="h-5" />
              <span className="text-lg font-bold tracking-tight">Marketplace</span>
            </div>
            <div className="flex items-center gap-1">
              <Link href="/orders">
                <button className="p-2 rounded-xl hover:bg-muted transition-colors relative">
                  <Package className="w-5 h-5 text-muted-foreground" />
                  <span className="absolute top-1 right-1 text-[8px] font-bold bg-primary text-white w-4 h-4 rounded-full flex items-center justify-center">3</span>
                </button>
              </Link>
              <Link href="/marketplace/create">
                <button className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <Plus className="w-5 h-5 text-primary" />
                </button>
              </Link>
              <Link href="/ai-recommendations">
                <button className="p-2 rounded-xl hover:bg-muted transition-colors relative">
                  <Bell className="w-5 h-5 text-muted-foreground" />
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                </button>
              </Link>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-primary text-white shadow-sm shadow-primary/20"
                    : "bg-muted/50 text-muted-foreground hover:bg-muted"
                }`}
              >
                {tab.icon}
                {tab.label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <AnimatePresence mode="wait">
        {/* ═══════ PRODUCTS TAB ═══════ */}
        {activeTab === "products" && (
          <motion.div
            key="products"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            {/* Search */}
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search products, equipment, produce..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-3 bg-card border border-border/50 rounded-2xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 h-12"
              />
            </div>

            {/* Buy / Sell / Trade Badges */}
            <div className="flex gap-2 mb-3">
              <div className="flex-1 bg-blue-50 rounded-xl p-2.5 text-center">
                <ShoppingCart className="w-4 h-4 text-blue-600 mx-auto mb-1" />
                <p className="text-[10px] font-semibold text-blue-700">Buy</p>
              </div>
              <div className="flex-1 bg-green-50 rounded-xl p-2.5 text-center">
                <Tag className="w-4 h-4 text-green-600 mx-auto mb-1" />
                <p className="text-[10px] font-semibold text-green-700">Sell</p>
              </div>
              <div className="flex-1 bg-amber-50 rounded-xl p-2.5 text-center">
                <Repeat className="w-4 h-4 text-amber-600 mx-auto mb-1" />
                <p className="text-[10px] font-semibold text-amber-700">Trade</p>
              </div>
            </div>

            {/* Source Filter */}
            <div className="flex gap-2 mb-2">
              {sourceFilters.map((sf) => (
                <button
                  key={sf}
                  onClick={() => setSourceFilter(sf)}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-semibold whitespace-nowrap transition-all ${
                    sourceFilter === sf
                      ? "bg-slate-800 text-white"
                      : "bg-card border border-border/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {sf === "Admin Listed" && <Crown className="w-2.5 h-2.5" />}
                  {sf === "User Listed" && <Eye className="w-2.5 h-2.5" />}
                  {sf}
                </button>
              ))}
            </div>

            {/* Categories */}
            <div className="flex gap-2 overflow-x-auto pb-3 mb-3 scrollbar-hide">
              {productCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setProductFilter(cat)}
                  className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold whitespace-nowrap transition-all ${
                    productFilter === cat
                      ? "bg-primary text-white shadow-sm"
                      : "bg-card border border-border/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {/* Cart Banner */}
            {cart.length > 0 && (
              <Link href="/marketplace/cart">
                <div className="bg-primary rounded-2xl p-3 mb-3 flex items-center justify-between text-white">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4" />
                    <span className="text-xs font-semibold">{cart.length} items in cart</span>
                  </div>
                  <span className="text-xs font-bold flex items-center gap-1">
                    View Cart <ChevronRight className="w-3 h-3" />
                  </span>
                </div>
              </Link>
            )}

            {/* Products Grid */}
            <div className="grid grid-cols-2 gap-3">
              {filteredProducts.map((product, i) => (
                <Link key={product.id} href={`/marketplace/product/${product.id}`}>
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-2xl border border-border/50 overflow-hidden hover:shadow-md transition-all duration-200 cursor-pointer"
                >
                  <div className="relative">
                    <img src={product.image} alt={product.name} className="w-full h-28 object-cover" />
                    {product.tag && (
                      <span className={`absolute top-2 left-2 text-[9px] font-bold px-2 py-0.5 rounded-full ${
                        product.type === "trade" ? "bg-amber-500 text-white" : "bg-primary text-white"
                      }`}>
                        {product.tag}
                      </span>
                    )}
                    {/* Source Badge */}
                    <span className={`absolute top-2 right-2 text-[8px] font-bold px-1.5 py-0.5 rounded-full ${
                      product.source === "admin"
                        ? "bg-red-500 text-white"
                        : "bg-white/90 text-slate-600"
                    }`}>
                      {product.source === "admin" ? "Official" : "User"}
                    </span>
                    {product.type === "trade" && (
                      <div className="absolute bottom-2 right-2 p-1 bg-amber-100 rounded-full">
                        <Repeat className="w-3 h-3 text-amber-600" />
                      </div>
                    )}
                  </div>
                  <div className="p-2.5">
                    <h4 className="text-[11px] font-bold leading-tight mb-0.5 line-clamp-2">{product.name}</h4>
                    <p className="text-[9px] text-muted-foreground mb-1">{product.seller}</p>
                    <div className="flex items-center gap-1 mb-1.5">
                      <Star className="w-2.5 h-2.5 text-amber-400 fill-amber-400" />
                      <span className="text-[9px] font-medium">{product.rating}</span>
                      <span className="text-[9px] text-muted-foreground">({product.reviews})</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-bold text-primary">{product.price}</span>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (product.type === "trade") {
                            toast.success("Trade request sent!");
                          } else {
                            addToCart(product.id);
                          }
                        }}
                        className="p-1.5 bg-primary/10 rounded-lg hover:bg-primary/20 transition-colors"
                      >
                        {product.type === "trade" ? (
                          <Repeat className="w-3 h-3 text-primary" />
                        ) : (
                          <ShoppingCart className="w-3 h-3 text-primary" />
                        )}
                      </button>
                    </div>
                  </div>
                </motion.div>
                </Link>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ SERVICES TAB ═══════ */}
        {activeTab === "services" && (
          <motion.div
            key="services"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            <p className="text-xs text-muted-foreground mb-4">
              Access the full marketplace ecosystem — transportation, packaging, storage, processing, and more.
            </p>

            <div className="space-y-2.5">
              {services.map((service, i) => {
                const Icon = service.icon;
                return (
                  <motion.div
                    key={service.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className="bg-card rounded-2xl border border-border/50 p-4 hover:shadow-md transition-all duration-200 cursor-pointer"
                    onClick={() => window.location.href = `/services/book/${service.bookingType}`}
                  >
                    <div className="flex items-start gap-3">
                      <div className={`p-2.5 rounded-xl ${service.color} shrink-0`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-bold mb-0.5">{service.name}</h4>
                        <p className="text-[10px] text-muted-foreground mb-1.5">{service.provider}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mb-2">{service.description}</p>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-0.5">
                              <Star className="w-3 h-3 text-amber-400 fill-amber-400" />
                              <span className="text-[10px] font-medium">{service.rating}</span>
                            </div>
                            <span className="text-[10px] text-muted-foreground">{service.bookings} bookings</span>
                          </div>
                          <span className="text-xs font-bold text-primary">{service.price}</span>
                        </div>
                        <div className="mt-2.5 flex items-center justify-between">
                          <span className="text-[10px] text-primary font-semibold">Book Now →</span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        )}

        {/* ═══════ MY LISTINGS TAB ═══════ */}
        {activeTab === "myListings" && (
          <motion.div
            key="myListings"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            {/* Stats */}
            <div className="flex gap-3 mb-4">
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-primary">{myListings.filter(l => l.status === "active").length}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Active</p>
              </div>
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-green-600">{myListings.filter(l => l.status === "sold").length}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Sold</p>
              </div>
              <div className="flex-1 bg-card rounded-2xl border border-border/50 p-3 text-center">
                <p className="text-xl font-bold text-amber-500">{myListings.reduce((a, l) => a + l.inquiries, 0)}</p>
                <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider">Inquiries</p>
              </div>
            </div>

            {/* Create New Listing Button */}
            <Link href="/marketplace/create">
              <div className="bg-gradient-to-r from-primary to-blue-600 rounded-2xl p-4 mb-4 text-white flex items-center justify-between hover:shadow-lg transition-all duration-200">
                <div>
                  <p className="text-sm font-bold">Create New Listing</p>
                  <p className="text-xs text-white/80">Sell or trade your products and services</p>
                </div>
                <Plus className="w-6 h-6 text-white/80" />
              </div>
            </Link>

            {/* Listings */}
            <div className="space-y-2.5">
              {myListings.map((listing, i) => (
                <motion.div
                  key={listing.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="bg-card rounded-2xl border border-border/50 p-4 hover:shadow-md transition-all duration-200"
                >
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-bold flex-1 mr-2">{listing.name}</h4>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${
                      listing.status === "active" ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-500"
                    }`}>{listing.status}</span>
                  </div>
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full ${
                      listing.type === "trade" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                    }`}>
                      {listing.type === "trade" ? "Trade" : "For Sale"}
                    </span>
                    <span className="text-xs font-semibold text-primary">{listing.price}</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span>{listing.views} views</span>
                    <span>{listing.inquiries} inquiries</span>
                    {listing.daysLeft > 0 && <span>{listing.daysLeft} days left</span>}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ TRADE LICENSE TAB ═══════ */}
        {activeTab === "license" && (
          <motion.div
            key="license"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            {/* TAMM Connection Banner */}
            {licenseStatus === "none" && (
              <>
                <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 mb-4 text-white">
                  <div className="flex items-center gap-2 mb-2">
                    <Globe className="w-5 h-5 text-blue-300" />
                    <h3 className="text-sm font-bold">Connect to TAMM</h3>
                  </div>
                  <p className="text-xs text-slate-300 leading-relaxed mb-3">
                    Already have a trade license? Connect to TAMM (Abu Dhabi Government Services) to verify your existing license and unlock all marketplace features instantly.
                  </p>
                  <button
                    onClick={() => {
                      setLicenseStatus("tamm");
                      toast.success("Connecting to TAMM...");
                    }}
                    className="w-full bg-white text-slate-900 rounded-xl py-2.5 text-sm font-semibold hover:bg-slate-100 transition-colors flex items-center justify-center gap-2"
                  >
                    <BadgeCheck className="w-4 h-4" />
                    Connect TAMM Account
                  </button>
                </div>

                {/* Or Apply New */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="flex-1 h-px bg-border" />
                  <span className="text-[10px] text-muted-foreground font-medium uppercase">Or apply for a new license</span>
                  <div className="flex-1 h-px bg-border" />
                </div>
              </>
            )}

            {/* TAMM Connected State */}
            {licenseStatus === "tamm" && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <BadgeCheck className="w-5 h-5 text-green-600" />
                  <h3 className="text-sm font-bold text-green-900">TAMM Connected</h3>
                </div>
                <p className="text-xs text-green-700 leading-relaxed mb-2">
                  Your TAMM account is linked. We found an active agricultural trade license.
                </p>
                <div className="bg-white rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">License No.</span>
                    <span className="font-semibold">CN-2025-AG-04821</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Type</span>
                    <span className="font-semibold">Agricultural Trading</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-semibold text-green-600">Active</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Expiry</span>
                    <span className="font-semibold">Dec 31, 2026</span>
                  </div>
                </div>
                <Link href="/marketplace/virtual-office">
                  <button className="w-full mt-3 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Open Virtual Office
                  </button>
                </Link>
              </div>
            )}

            {/* Pending State */}
            {licenseStatus === "pending" && (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <FileText className="w-5 h-5 text-amber-600" />
                  <h3 className="text-sm font-bold text-amber-900">Application Under Review</h3>
                </div>
                <p className="text-xs text-amber-700 leading-relaxed mb-2">
                  Your trade license application has been submitted and is being reviewed. This typically takes 3-5 business days.
                </p>
                <div className="bg-white rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Application ID</span>
                    <span className="font-semibold">APP-2026-03-0847</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Submitted</span>
                    <span className="font-semibold">Mar 10, 2026</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-semibold text-amber-600">Under Review</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Activities</span>
                    <span className="font-semibold">{selectedActivities.length} selected</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    setLicenseStatus("approved");
                    toast.success("License approved! Virtual Office unlocked.");
                  }}
                  className="w-full mt-3 bg-amber-500 text-white rounded-xl py-2.5 text-xs font-semibold hover:bg-amber-600 transition-colors"
                >
                  Simulate Approval (Demo)
                </button>
              </div>
            )}

            {/* Approved State */}
            {licenseStatus === "approved" && (
              <div className="bg-green-50 border border-green-200 rounded-2xl p-4 mb-4">
                <div className="flex items-center gap-2 mb-2">
                  <BadgeCheck className="w-5 h-5 text-green-600" />
                  <h3 className="text-sm font-bold text-green-900">Trade License Approved</h3>
                </div>
                <p className="text-xs text-green-700 leading-relaxed mb-2">
                  Congratulations! Your trade license has been approved. You now have access to your Virtual Office and all marketplace features.
                </p>
                <div className="bg-white rounded-xl p-3 space-y-1.5">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">License No.</span>
                    <span className="font-semibold">CN-2026-AG-0847</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Activities</span>
                    <span className="font-semibold">{selectedActivities.length} approved</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Status</span>
                    <span className="font-semibold text-green-600">Active</span>
                  </div>
                </div>
                <Link href="/marketplace/virtual-office">
                  <button className="w-full mt-3 bg-primary text-white rounded-xl py-2.5 text-sm font-semibold hover:bg-primary/90 transition-colors flex items-center justify-center gap-2">
                    <Building2 className="w-4 h-4" />
                    Open Virtual Office
                  </button>
                </Link>
              </div>
            )}

            {/* Apply for License Form */}
            {(licenseStatus === "none") && (
              <div className="bg-card rounded-2xl border border-border/50 p-4 mb-4">
                <h3 className="text-sm font-bold mb-1">Apply for Trade License</h3>
                <p className="text-xs text-muted-foreground leading-relaxed mb-3">
                  Select from 120+ agricultural business activities to include in your trade license. Once approved, you'll get a Virtual Office to manage your farm business.
                </p>

                {/* Activity Search */}
                <div className="relative mb-3">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search activities..."
                    value={activitySearch}
                    onChange={(e) => setActivitySearch(e.target.value)}
                    className="w-full pl-9 pr-4 py-2 bg-muted/50 border border-border/50 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                {/* Selected Count */}
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Business Activities ({businessActivities.length}+)
                  </span>
                  <span className="text-[10px] font-bold text-primary">
                    {selectedActivities.length} selected
                  </span>
                </div>

                {/* Activities List */}
                <div className="max-h-60 overflow-y-auto space-y-1 mb-4 pr-1">
                  {filteredActivities.map((activity) => {
                    const isSelected = selectedActivities.includes(activity);
                    return (
                      <button
                        key={activity}
                        onClick={() => {
                          setSelectedActivities(prev =>
                            isSelected ? prev.filter(a => a !== activity) : [...prev, activity]
                          );
                        }}
                        className={`w-full text-left px-3 py-2 rounded-lg text-xs transition-all ${
                          isSelected
                            ? "bg-primary/10 text-primary font-semibold border border-primary/20"
                            : "bg-muted/30 text-foreground hover:bg-muted/60"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                            isSelected ? "bg-primary border-primary" : "border-border"
                          }`}>
                            {isSelected && (
                              <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                              </svg>
                            )}
                          </div>
                          {activity}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Submit */}
                <button
                  onClick={() => {
                    if (selectedActivities.length === 0) {
                      toast.error("Please select at least one business activity");
                      return;
                    }
                    setLicenseStatus("pending");
                    toast.success("Application submitted successfully!");
                  }}
                  className="w-full bg-primary text-white rounded-xl py-3 text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                  Submit Application ({selectedActivities.length} activities)
                </button>
              </div>
            )}

            {/* Info Cards */}
            <div className="space-y-2.5">
              <div className="bg-blue-50 rounded-2xl p-4 border border-blue-100">
                <div className="flex items-start gap-3">
                  <Building2 className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-blue-900 mb-1">Virtual Office</h4>
                    <p className="text-[11px] text-blue-700 leading-relaxed">
                      Once your trade license is approved, you'll get a Virtual Office to manage invoices, contracts, business analytics, and connect with buyers and suppliers.
                    </p>
                  </div>
                </div>
              </div>
              <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-100">
                <div className="flex items-start gap-3">
                  <BadgeCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <h4 className="text-xs font-bold text-emerald-900 mb-1">120+ Business Activities</h4>
                    <p className="text-[11px] text-emerald-700 leading-relaxed">
                      From crop farming and food processing to agri-tourism and export trading — choose the activities that match your farm business goals.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
