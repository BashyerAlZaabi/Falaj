/*
 * FALAJ Virtual Office
 * Design: Desert Minimalism — business dashboard unlocked after trade license approval
 * Features: invoices, contracts, analytics, buyer/supplier connections
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { Link } from "wouter";
import {
  Building2, FileText, Users, BarChart3, Receipt,
  Handshake, Globe, Shield, Phone, Mail,
  TrendingUp, TrendingDown, DollarSign, Package,
  ChevronRight, Clock, BadgeCheck, Briefcase,
  Truck, Warehouse, Scale, BookOpen
} from "lucide-react";

const quickStats = [
  { label: "Revenue", value: "12,450 AED", change: "+18%", up: true, icon: DollarSign, color: "text-green-600" },
  { label: "Orders", value: "34", change: "+5", up: true, icon: Package, color: "text-blue-600" },
  { label: "Clients", value: "12", change: "+3", up: true, icon: Users, color: "text-purple-600" },
  { label: "Pending", value: "4", change: "-2", up: false, icon: Clock, color: "text-amber-600" },
];

const officeModules = [
  { name: "Invoices & Billing", description: "Create and manage invoices", icon: Receipt, color: "bg-blue-50 text-blue-600", count: "8 pending" },
  { name: "Contracts", description: "Manage business agreements", icon: FileText, color: "bg-purple-50 text-purple-600", count: "3 active" },
  { name: "Business Analytics", description: "Sales, revenue, and insights", icon: BarChart3, color: "bg-green-50 text-green-600", count: "View" },
  { name: "Buyer Network", description: "Connect with buyers", icon: Handshake, color: "bg-orange-50 text-orange-600", count: "24 contacts" },
  { name: "Supplier Directory", description: "Find trusted suppliers", icon: Truck, color: "bg-teal-50 text-teal-600", count: "156 listed" },
  { name: "Inventory", description: "Track stock and products", icon: Warehouse, color: "bg-amber-50 text-amber-600", count: "12 items" },
  { name: "Compliance", description: "Regulations and certifications", icon: Scale, color: "bg-rose-50 text-rose-600", count: "All clear" },
  { name: "Business Docs", description: "Templates and documents", icon: BookOpen, color: "bg-slate-50 text-slate-600", count: "15 files" },
];

const recentActivity = [
  { action: "Invoice #INV-0034 sent to Al Ain Fresh Market", time: "2 hours ago", type: "invoice" },
  { action: "New order received: 50kg Organic Tomatoes", time: "5 hours ago", type: "order" },
  { action: "Contract signed with UAE Nursery Co.", time: "1 day ago", type: "contract" },
  { action: "Payment received: 2,450 AED from Green Valley", time: "2 days ago", type: "payment" },
  { action: "New buyer inquiry from Dubai Fresh Foods", time: "3 days ago", type: "inquiry" },
];

const stagger = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { staggerChildren: 0.04 } },
};
const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
};

export default function VirtualOffice() {
  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader
        title="Virtual Office"
        rightAction={
          <div className="p-2 rounded-xl bg-primary/10">
            <Building2 className="w-4 h-4 text-primary" />
          </div>
        }
      />

      <motion.div
        variants={stagger}
        initial="hidden"
        animate="show"
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* License Badge */}
        <motion.div variants={fadeUp}>
          <div className="bg-gradient-to-br from-primary to-blue-600 rounded-2xl p-4 mb-5 text-white">
            <div className="flex items-center gap-2 mb-2">
              <BadgeCheck className="w-5 h-5 text-white/90" />
              <span className="text-sm font-bold">Licensed Business</span>
            </div>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-white/70">Trade License Active</p>
                <p className="text-lg font-bold">FALAJ Smart Farm</p>
              </div>
              <div className="text-right">
                <p className="text-[10px] text-white/60">License No.</p>
                <p className="text-xs font-semibold">CN-2026-AG-4821</p>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Quick Stats */}
        <motion.div variants={fadeUp} className="grid grid-cols-2 gap-2.5 mb-5">
          {quickStats.map((stat) => {
            const Icon = stat.icon;
            return (
              <div key={stat.label} className="bg-card rounded-2xl border border-border/50 p-3">
                <div className="flex items-center justify-between mb-1">
                  <Icon className={`w-4 h-4 ${stat.color}`} />
                  <div className={`flex items-center gap-0.5 text-[10px] font-semibold ${
                    stat.up ? "text-green-600" : "text-red-500"
                  }`}>
                    {stat.up ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                    {stat.change}
                  </div>
                </div>
                <p className="text-lg font-bold">{stat.value}</p>
                <p className="text-[10px] text-muted-foreground">{stat.label}</p>
              </div>
            );
          })}
        </motion.div>

        {/* Office Modules */}
        <motion.div variants={fadeUp} className="mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Office Modules</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {officeModules.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.name}
                  onClick={() => {}}
                  className="bg-card rounded-2xl border border-border/50 p-3 text-left hover:shadow-md transition-all duration-200"
                >
                  <div className={`p-2 rounded-xl ${mod.color} w-fit mb-2`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-bold mb-0.5">{mod.name}</p>
                  <p className="text-[10px] text-muted-foreground mb-1.5">{mod.description}</p>
                  <span className="text-[10px] font-medium text-primary">{mod.count}</span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Business Contact */}
        <motion.div variants={fadeUp} className="mb-5">
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Business Contact</h3>
          <div className="bg-card rounded-2xl border border-border/50 p-4">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-50 rounded-xl">
                  <Globe className="w-4 h-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Business Website</p>
                  <p className="text-xs font-semibold">farm.falajae.com</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-50 rounded-xl">
                  <Phone className="w-4 h-4 text-green-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Business Phone</p>
                  <p className="text-xs font-semibold">+971 50 123 4567</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-50 rounded-xl">
                  <Mail className="w-4 h-4 text-purple-600" />
                </div>
                <div>
                  <p className="text-[10px] text-muted-foreground">Business Email</p>
                  <p className="text-xs font-semibold">business@falajae.com</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Recent Activity */}
        <motion.div variants={fadeUp}>
          <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Recent Activity</h3>
          <div className="space-y-2">
            {recentActivity.map((activity, i) => (
              <div key={i} className="bg-card rounded-xl border border-border/50 p-3 flex items-start gap-3">
                <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                  activity.type === "payment" ? "bg-green-500" :
                  activity.type === "order" ? "bg-blue-500" :
                  activity.type === "contract" ? "bg-purple-500" :
                  activity.type === "invoice" ? "bg-amber-500" :
                  "bg-slate-400"
                }`} />
                <div>
                  <p className="text-xs font-medium leading-relaxed">{activity.action}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{activity.time}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
