/*
 * FALAJ Admin Panel
 * Full admin access: manage products, users, orders, revenue, government access
 * Design: Desert Minimalism — professional dashboard with tabs
 */
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Shield, DollarSign, Users, Package, TrendingUp,
  Eye, Edit, Trash2, Plus, ChevronRight, Globe,
  BarChart3, Settings, Bell, Check, X, Crown,
  Building2, Landmark, BadgeCheck, Lock, Unlock,
  ShoppingCart, Truck, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { toast } from "sonner";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";

type AdminTab = "overview" | "products" | "orders" | "users" | "government" | "revenue";

/* ─── Mock Data ─── */
const revenueStats = {
  totalRevenue: "284,500",
  monthlyRevenue: "42,350",
  commission: "14,175",
  pendingPayouts: "8,200",
  growthPercent: 18.5,
  transactions: 1247,
};

const adminProducts = [
  { id: 1, name: "Falaj Soil Moisture Sensor", price: "299 AED", stock: 145, sold: 342, status: "active", source: "admin" },
  { id: 2, name: "Falaj Complete Kit", price: "1,499 AED", stock: 67, sold: 128, status: "active", source: "admin" },
  { id: 3, name: "Falaj Weather Station", price: "899 AED", stock: 23, sold: 89, status: "active", source: "admin" },
  { id: 4, name: "Organic Tomatoes — Zone A", price: "45 AED/kg", stock: 500, sold: 1200, status: "active", source: "user" },
  { id: 5, name: "Date Palm Seedlings (x50)", price: "1,200 AED", stock: 30, sold: 56, status: "active", source: "user" },
  { id: 6, name: "Drip Irrigation System", price: "850 AED", stock: 0, sold: 67, status: "out_of_stock", source: "user" },
];

const recentOrders = [
  { id: "ORD-2026-0847", buyer: "Ahmed Al Mansouri", product: "Falaj Complete Kit", amount: "1,499 AED", status: "delivered", date: "Mar 10" },
  { id: "ORD-2026-0846", buyer: "Sara Al Hashimi", product: "Soil Moisture Sensor x3", amount: "897 AED", status: "shipped", date: "Mar 9" },
  { id: "ORD-2026-0845", buyer: "Mohammed Khalifa", product: "Organic Tomatoes 50kg", amount: "2,250 AED", status: "processing", date: "Mar 9" },
  { id: "ORD-2026-0844", buyer: "Fatima Al Nuaimi", product: "Weather Station", amount: "899 AED", status: "pending", date: "Mar 8" },
  { id: "ORD-2026-0843", buyer: "Khalid Al Dhaheri", product: "Date Palm Seedlings", amount: "1,200 AED", status: "delivered", date: "Mar 7" },
];

const users = [
  { id: 1, name: "Ahmed Al Mansouri", role: "farmer", status: "active", orders: 12, spent: "8,450 AED", joined: "Jan 2026" },
  { id: 2, name: "Sara Al Hashimi", role: "farmer", status: "active", orders: 8, spent: "5,200 AED", joined: "Feb 2026" },
  { id: 3, name: "Mohammed Khalifa", role: "seller", status: "active", orders: 34, spent: "12,800 AED", joined: "Dec 2025" },
  { id: 4, name: "Fatima Al Nuaimi", role: "farmer", status: "active", orders: 5, spent: "3,100 AED", joined: "Mar 2026" },
  { id: 5, name: "Khalid Al Dhaheri", role: "seller", status: "suspended", orders: 2, spent: "1,200 AED", joined: "Mar 2026" },
];

const governmentAccess = [
  { id: 1, entity: "Abu Dhabi Agriculture Authority", access: "full", status: "active", lastAccess: "2 hours ago" },
  { id: 2, entity: "TAMM Government Services", access: "license_verification", status: "active", lastAccess: "1 day ago" },
  { id: 3, entity: "Ministry of Climate Change", access: "read_only", status: "pending", lastAccess: "Never" },
  { id: 4, entity: "Food Safety Authority", access: "marketplace_audit", status: "active", lastAccess: "3 days ago" },
];

const statusColor: Record<string, string> = {
  delivered: "bg-green-50 text-green-600",
  shipped: "bg-blue-50 text-blue-600",
  processing: "bg-amber-50 text-amber-600",
  pending: "bg-slate-100 text-slate-600",
  active: "bg-green-50 text-green-600",
  suspended: "bg-red-50 text-red-600",
  out_of_stock: "bg-red-50 text-red-600",
};

export default function Admin() {
  const [activeTab, setActiveTab] = useState<AdminTab>("overview");

  const tabs: { key: AdminTab; label: string; icon: React.ReactNode }[] = [
    { key: "overview", label: "Overview", icon: <BarChart3 className="w-3.5 h-3.5" /> },
    { key: "products", label: "Products", icon: <Package className="w-3.5 h-3.5" /> },
    { key: "orders", label: "Orders", icon: <ShoppingCart className="w-3.5 h-3.5" /> },
    { key: "users", label: "Users", icon: <Users className="w-3.5 h-3.5" /> },
    { key: "government", label: "Gov", icon: <Landmark className="w-3.5 h-3.5" /> },
    { key: "revenue", label: "Revenue", icon: <DollarSign className="w-3.5 h-3.5" /> },
  ];

  return (
    <div className="min-h-screen bg-background pb-8">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/80 backdrop-blur-xl border-b border-border/50">
        <div className="max-w-[480px] mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.history.back()}
                className="p-1.5 -ml-1.5 rounded-xl hover:bg-muted transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <Shield className="w-5 h-5 text-red-600" />
              <span className="text-lg font-bold tracking-tight">Admin Panel</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="text-[10px] font-semibold bg-red-50 text-red-600 px-2 py-1 rounded-full">Admin</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 overflow-x-auto scrollbar-hide">
            {tabs.map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`flex items-center gap-1 px-2.5 py-2 rounded-xl text-[10px] font-semibold whitespace-nowrap transition-all duration-200 ${
                  activeTab === tab.key
                    ? "bg-red-600 text-white shadow-sm"
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
        {/* ═══════ OVERVIEW TAB ═══════ */}
        {activeTab === "overview" && (
          <motion.div
            key="overview"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            {/* Stats Grid */}
            <div className="grid grid-cols-2 gap-3 mb-5">
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <DollarSign className="w-4 h-4 text-green-600" />
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-green-600">
                    <ArrowUpRight className="w-3 h-3" /> +{revenueStats.growthPercent}%
                  </span>
                </div>
                <p className="text-lg font-bold">{revenueStats.totalRevenue}</p>
                <p className="text-[10px] text-muted-foreground">Total Revenue (AED)</p>
              </div>
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <ShoppingCart className="w-4 h-4 text-blue-600" />
                  <span className="flex items-center gap-0.5 text-[10px] font-semibold text-blue-600">
                    <ArrowUpRight className="w-3 h-3" /> +12%
                  </span>
                </div>
                <p className="text-lg font-bold">{revenueStats.transactions}</p>
                <p className="text-[10px] text-muted-foreground">Total Transactions</p>
              </div>
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <TrendingUp className="w-4 h-4 text-amber-600" />
                </div>
                <p className="text-lg font-bold">{revenueStats.commission}</p>
                <p className="text-[10px] text-muted-foreground">Commission (AED)</p>
              </div>
              <div className="bg-card rounded-2xl border border-border/50 p-4">
                <div className="flex items-center justify-between mb-2">
                  <Users className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-lg font-bold">{users.length}</p>
                <p className="text-[10px] text-muted-foreground">Active Users</p>
              </div>
            </div>

            {/* Recent Orders */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Orders</h3>
            <div className="space-y-2 mb-5">
              {recentOrders.slice(0, 3).map((order) => (
                <div key={order.id} className="bg-card rounded-2xl border border-border/50 p-3 flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate">{order.product}</p>
                    <p className="text-[10px] text-muted-foreground">{order.buyer} · {order.date}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-xs font-bold">{order.amount}</p>
                    <span className={`text-[9px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Quick Actions */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Admin Actions</h3>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setActiveTab("products")}
                className="bg-card rounded-2xl border border-border/50 p-4 text-left hover:shadow-md transition-all"
              >
                <Package className="w-5 h-5 text-blue-600 mb-2" />
                <p className="text-xs font-bold">Manage Products</p>
                <p className="text-[10px] text-muted-foreground">{adminProducts.length} products</p>
              </button>
              <button
                onClick={() => setActiveTab("government")}
                className="bg-card rounded-2xl border border-border/50 p-4 text-left hover:shadow-md transition-all"
              >
                <Landmark className="w-5 h-5 text-green-600 mb-2" />
                <p className="text-xs font-bold">Gov Access</p>
                <p className="text-[10px] text-muted-foreground">{governmentAccess.length} entities</p>
              </button>
              <button
                onClick={() => setActiveTab("users")}
                className="bg-card rounded-2xl border border-border/50 p-4 text-left hover:shadow-md transition-all"
              >
                <Users className="w-5 h-5 text-purple-600 mb-2" />
                <p className="text-xs font-bold">Manage Users</p>
                <p className="text-[10px] text-muted-foreground">{users.length} users</p>
              </button>
              <button
                onClick={() => setActiveTab("revenue")}
                className="bg-card rounded-2xl border border-border/50 p-4 text-left hover:shadow-md transition-all"
              >
                <DollarSign className="w-5 h-5 text-amber-600 mb-2" />
                <p className="text-xs font-bold">Revenue</p>
                <p className="text-[10px] text-muted-foreground">{revenueStats.monthlyRevenue} AED/mo</p>
              </button>
            </div>
          </motion.div>
        )}

        {/* ═══════ PRODUCTS TAB ═══════ */}
        {activeTab === "products" && (
          <motion.div
            key="products"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">Manage all marketplace products</p>
              <button
                onClick={() => toast.success("Add product form coming soon")}
                className="flex items-center gap-1 bg-primary text-white px-3 py-1.5 rounded-xl text-xs font-semibold"
              >
                <Plus className="w-3 h-3" /> Add Product
              </button>
            </div>

            <div className="space-y-2.5">
              {adminProducts.map((product) => (
                <div key={product.id} className="bg-card rounded-2xl border border-border/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <h4 className="text-sm font-bold">{product.name}</h4>
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                        product.source === "admin" ? "bg-red-50 text-red-600" : "bg-blue-50 text-blue-600"
                      }`}>
                        {product.source === "admin" ? "Admin" : "User"}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-2">
                    <span>Price: <strong className="text-foreground">{product.price}</strong></span>
                    <span>Stock: <strong className="text-foreground">{product.stock}</strong></span>
                    <span>Sold: <strong className="text-foreground">{product.sold}</strong></span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[product.status]}`}>
                      {product.status.replace("_", " ")}
                    </span>
                    <div className="flex items-center gap-1">
                      <button onClick={() => toast.info("Viewing product details...")} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                        <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => toast.info("Editing product...")} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                        <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                      </button>
                      <button onClick={() => toast.error("Product deleted")} className="p-1.5 hover:bg-red-50 rounded-lg transition-colors">
                        <Trash2 className="w-3.5 h-3.5 text-red-400" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ ORDERS TAB ═══════ */}
        {activeTab === "orders" && (
          <motion.div
            key="orders"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            <p className="text-xs text-muted-foreground mb-4">All marketplace orders</p>
            <div className="space-y-2.5">
              {recentOrders.map((order) => (
                <div key={order.id} className="bg-card rounded-2xl border border-border/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-mono text-muted-foreground">{order.id}</span>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[order.status]}`}>
                      {order.status}
                    </span>
                  </div>
                  <h4 className="text-sm font-bold mb-1">{order.product}</h4>
                  <div className="flex items-center justify-between">
                    <p className="text-[10px] text-muted-foreground">{order.buyer} · {order.date}</p>
                    <p className="text-sm font-bold text-primary">{order.amount}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
                    {order.status === "pending" && (
                      <>
                        <button
                          onClick={() => toast.success(`Order ${order.id} accepted! Packaging & transport services assigned.`)}
                          className="flex-1 flex items-center justify-center gap-1 bg-green-50 text-green-600 py-2 rounded-xl text-xs font-semibold hover:bg-green-100 transition-colors"
                        >
                          <Check className="w-3 h-3" /> Accept
                        </button>
                        <button
                          onClick={() => toast.error(`Order ${order.id} rejected`)}
                          className="flex-1 flex items-center justify-center gap-1 bg-red-50 text-red-600 py-2 rounded-xl text-xs font-semibold hover:bg-red-100 transition-colors"
                        >
                          <X className="w-3 h-3" /> Reject
                        </button>
                      </>
                    )}
                    {order.status === "processing" && (
                      <button
                        onClick={() => toast.success(`Order ${order.id} marked as shipped`)}
                        className="flex-1 flex items-center justify-center gap-1 bg-blue-50 text-blue-600 py-2 rounded-xl text-xs font-semibold hover:bg-blue-100 transition-colors"
                      >
                        <Truck className="w-3 h-3" /> Mark Shipped
                      </button>
                    )}
                    {(order.status === "shipped" || order.status === "delivered") && (
                      <button
                        onClick={() => toast.info("Viewing order tracking...")}
                        className="flex-1 flex items-center justify-center gap-1 bg-muted text-foreground py-2 rounded-xl text-xs font-semibold hover:bg-muted/80 transition-colors"
                      >
                        <Eye className="w-3 h-3" /> Track Order
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ USERS TAB ═══════ */}
        {activeTab === "users" && (
          <motion.div
            key="users"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            <p className="text-xs text-muted-foreground mb-4">Manage platform users</p>
            <div className="space-y-2.5">
              {users.map((user) => (
                <div key={user.id} className="bg-card rounded-2xl border border-border/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-primary/10 rounded-full flex items-center justify-center">
                        <span className="text-xs font-bold text-primary">{user.name.charAt(0)}</span>
                      </div>
                      <div>
                        <h4 className="text-sm font-bold">{user.name}</h4>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                          user.role === "seller" ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"
                        }`}>{user.role}</span>
                      </div>
                    </div>
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize ${statusColor[user.status]}`}>
                      {user.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground">
                    <span>{user.orders} orders</span>
                    <span>{user.spent} spent</span>
                    <span>Joined {user.joined}</span>
                  </div>
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border/30">
                    <button
                      onClick={() => toast.info(`Viewing ${user.name}'s profile...`)}
                      className="flex-1 flex items-center justify-center gap-1 bg-muted text-foreground py-1.5 rounded-xl text-[10px] font-semibold"
                    >
                      <Eye className="w-3 h-3" /> View
                    </button>
                    {user.status === "active" ? (
                      <button
                        onClick={() => toast.error(`${user.name} suspended`)}
                        className="flex-1 flex items-center justify-center gap-1 bg-red-50 text-red-600 py-1.5 rounded-xl text-[10px] font-semibold"
                      >
                        <Lock className="w-3 h-3" /> Suspend
                      </button>
                    ) : (
                      <button
                        onClick={() => toast.success(`${user.name} reactivated`)}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-50 text-green-600 py-1.5 rounded-xl text-[10px] font-semibold"
                      >
                        <Unlock className="w-3 h-3" /> Activate
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════ GOVERNMENT ACCESS TAB ═══════ */}
        {activeTab === "government" && (
          <motion.div
            key="government"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            <div className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-5 mb-4 text-white">
              <div className="flex items-center gap-2 mb-2">
                <Landmark className="w-5 h-5 text-blue-300" />
                <h3 className="text-sm font-bold">Government Access Control</h3>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Grant or revoke access for government entities to monitor marketplace data, rewards, and compliance metrics.
              </p>
            </div>

            <button
              onClick={() => toast.success("Government entity invitation sent")}
              className="w-full flex items-center justify-center gap-2 bg-primary text-white py-3 rounded-2xl text-sm font-semibold mb-4 hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-4 h-4" /> Grant New Government Access
            </button>

            <div className="space-y-2.5">
              {governmentAccess.map((gov) => (
                <div key={gov.id} className="bg-card rounded-2xl border border-border/50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <div className="p-2 bg-blue-50 rounded-xl">
                        <Building2 className="w-4 h-4 text-blue-600" />
                      </div>
                      <div>
                        <h4 className="text-xs font-bold">{gov.entity}</h4>
                        <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded-full capitalize ${
                          gov.status === "active" ? "bg-green-50 text-green-600" : "bg-amber-50 text-amber-600"
                        }`}>{gov.status}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] text-muted-foreground mb-2">
                    <span>Access: <strong className="text-foreground capitalize">{gov.access.replace("_", " ")}</strong></span>
                    <span>Last: {gov.lastAccess}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => toast.info(`Editing ${gov.entity} access...`)}
                      className="flex-1 flex items-center justify-center gap-1 bg-muted text-foreground py-1.5 rounded-xl text-[10px] font-semibold"
                    >
                      <Edit className="w-3 h-3" /> Edit Access
                    </button>
                    {gov.status === "active" ? (
                      <button
                        onClick={() => toast.error(`Access revoked for ${gov.entity}`)}
                        className="flex-1 flex items-center justify-center gap-1 bg-red-50 text-red-600 py-1.5 rounded-xl text-[10px] font-semibold"
                      >
                        <Lock className="w-3 h-3" /> Revoke
                      </button>
                    ) : (
                      <button
                        onClick={() => toast.success(`Access approved for ${gov.entity}`)}
                        className="flex-1 flex items-center justify-center gap-1 bg-green-50 text-green-600 py-1.5 rounded-xl text-[10px] font-semibold"
                      >
                        <BadgeCheck className="w-3 h-3" /> Approve
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Rewards Monitoring for Government */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mt-5 mb-3">Government Rewards Monitoring</h3>
            <div className="bg-card rounded-2xl border border-border/50 p-4">
              <p className="text-xs text-muted-foreground mb-3">
                Government entities can monitor the rewards system to track farmer engagement, sustainability metrics, and agricultural productivity.
              </p>
              <div className="space-y-2">
                <div className="flex items-center justify-between py-2 border-b border-border/30">
                  <span className="text-xs font-medium">Water Conservation Rewards</span>
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Monitored</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/30">
                  <span className="text-xs font-medium">Sustainability Badges</span>
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Monitored</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b border-border/30">
                  <span className="text-xs font-medium">Farmer Engagement Score</span>
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Monitored</span>
                </div>
                <div className="flex items-center justify-between py-2">
                  <span className="text-xs font-medium">Trade License Compliance</span>
                  <span className="text-[10px] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">Monitored</span>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════ REVENUE TAB ═══════ */}
        {activeTab === "revenue" && (
          <motion.div
            key="revenue"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="max-w-[480px] mx-auto px-4 pt-4"
          >
            {/* Revenue Card */}
            <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-5 text-white mb-5 shadow-lg">
              <p className="text-sm text-white/80 font-medium mb-1">Total Revenue</p>
              <p className="text-3xl font-bold mb-3">{revenueStats.totalRevenue} AED</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-xs text-white/70">Monthly</p>
                  <p className="text-sm font-bold">{revenueStats.monthlyRevenue} AED</p>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <p className="text-xs text-white/70">Commission</p>
                  <p className="text-sm font-bold">{revenueStats.commission} AED</p>
                </div>
              </div>
            </div>

            {/* Monetization Controls */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Monetization Settings</h3>
            <div className="space-y-2.5 mb-5">
              {[
                { label: "Marketplace Commission", value: "5%", desc: "Per transaction fee on all sales" },
                { label: "Featured Listing Fee", value: "50 AED", desc: "Charge sellers to feature products" },
                { label: "Trade License Fee", value: "2,500 AED", desc: "Application processing fee" },
                { label: "Virtual Office Subscription", value: "200 AED/mo", desc: "Monthly virtual office access" },
                { label: "Premium Services Fee", value: "10%", desc: "Commission on service bookings" },
                { label: "Advertising Revenue", value: "Custom", desc: "In-app advertising slots" },
              ].map((item, i) => (
                <div key={i} className="bg-card rounded-2xl border border-border/50 p-4 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold">{item.label}</p>
                    <p className="text-[10px] text-muted-foreground">{item.desc}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-primary">{item.value}</span>
                    <button onClick={() => toast.info(`Editing ${item.label}...`)} className="p-1.5 hover:bg-muted rounded-lg transition-colors">
                      <Edit className="w-3.5 h-3.5 text-muted-foreground" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pending Payouts */}
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Pending Payouts</h3>
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-bold text-amber-900">{revenueStats.pendingPayouts} AED</p>
                <button
                  onClick={() => toast.success("Payouts processed!")}
                  className="bg-amber-500 text-white px-3 py-1.5 rounded-xl text-xs font-semibold hover:bg-amber-600 transition-colors"
                >
                  Process All
                </button>
              </div>
              <p className="text-[10px] text-amber-700">Pending seller payouts from completed orders</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
