/*
 * FALAJ App State — Central state management
 * Manages: user, sensors, crops, orders, valves, notifications, marketplace, financials
 * All data is reactive and shared across all pages
 */
import { createContext, useContext, useState, useCallback, ReactNode } from "react";

// ═══ TYPES ═══
export interface SensorNode {
  id: string;
  name: string;
  zone: string;
  moisture: number;       // % (0-100)
  ph: number;             // pH scale (0-14)
  nitrogen: number;       // mg/kg
  phosphorus: number;     // mg/kg
  potassium: number;      // mg/kg
  temperature: number;    // °C
  status: "normal" | "alert" | "critical";
  lastReading: string;
  battery: number;
  paired: boolean;
  depth: string;          // sensor depth e.g. "15cm", "30cm"
}

// Keep backward compat alias
export type Sensor = SensorNode;

export interface Valve {
  id: string;
  zone: string;
  status: "open" | "closed" | "scheduled";
  flowRate: number;
  schedule: string;
  auto: boolean;
  totalUsageToday: number;
  maxFlowRate: number;       // L/min threshold
  dailyWaterLimit: number;   // L/day threshold
}

export interface ZoneThreshold {
  zone: string;
  cropType: string;
  season: "summer" | "winter" | "spring" | "autumn";
  growthStage: string;
  moisture: { min: number; max: number; critical: number };
  ph: { min: number; max: number };
  nitrogen: { min: number; max: number };
  phosphorus: { min: number; max: number };
  potassium: { min: number; max: number };
  temperature: { min: number; max: number; critical: number };
  irrigationDuration: number;   // minutes per cycle
  irrigationFrequency: number;  // cycles per day
  fertilizerDose: number;       // kg per application
  lastAdjusted: string;
  adjustedBy: "ai" | "manual" | "crop_plan";
}

// Crop-specific threshold presets by season (UAE climate)
export const CROP_THRESHOLD_PRESETS: Record<string, Record<string, Partial<ZoneThreshold>>> = {
  "Organic Tomatoes": {
    summer: { moisture: { min: 45, max: 70, critical: 30 }, ph: { min: 6.0, max: 6.8 }, nitrogen: { min: 150, max: 250 }, phosphorus: { min: 40, max: 80 }, potassium: { min: 180, max: 300 }, temperature: { min: 20, max: 35, critical: 42 }, irrigationDuration: 45, irrigationFrequency: 3, fertilizerDose: 1.0 },
    winter: { moisture: { min: 35, max: 60, critical: 25 }, ph: { min: 6.0, max: 6.8 }, nitrogen: { min: 130, max: 220 }, phosphorus: { min: 35, max: 70 }, potassium: { min: 160, max: 280 }, temperature: { min: 15, max: 30, critical: 38 }, irrigationDuration: 30, irrigationFrequency: 2, fertilizerDose: 0.8 },
  },
  "Khalas Dates": {
    summer: { moisture: { min: 25, max: 50, critical: 15 }, ph: { min: 7.0, max: 8.0 }, nitrogen: { min: 100, max: 200 }, phosphorus: { min: 30, max: 60 }, potassium: { min: 150, max: 250 }, temperature: { min: 25, max: 45, critical: 50 }, irrigationDuration: 60, irrigationFrequency: 2, fertilizerDose: 1.5 },
    winter: { moisture: { min: 20, max: 40, critical: 10 }, ph: { min: 7.0, max: 8.0 }, nitrogen: { min: 80, max: 180 }, phosphorus: { min: 25, max: 55 }, potassium: { min: 130, max: 230 }, temperature: { min: 15, max: 35, critical: 42 }, irrigationDuration: 40, irrigationFrequency: 1, fertilizerDose: 1.2 },
  },
  "Fresh Herbs": {
    summer: { moisture: { min: 50, max: 75, critical: 35 }, ph: { min: 6.0, max: 7.0 }, nitrogen: { min: 170, max: 280 }, phosphorus: { min: 45, max: 90 }, potassium: { min: 200, max: 320 }, temperature: { min: 18, max: 32, critical: 38 }, irrigationDuration: 30, irrigationFrequency: 3, fertilizerDose: 0.5 },
    winter: { moisture: { min: 40, max: 65, critical: 28 }, ph: { min: 6.0, max: 7.0 }, nitrogen: { min: 150, max: 250 }, phosphorus: { min: 40, max: 80 }, potassium: { min: 180, max: 300 }, temperature: { min: 12, max: 28, critical: 35 }, irrigationDuration: 20, irrigationFrequency: 2, fertilizerDose: 0.3 },
  },
  "Cucumbers": {
    summer: { moisture: { min: 50, max: 80, critical: 35 }, ph: { min: 5.8, max: 6.5 }, nitrogen: { min: 160, max: 260 }, phosphorus: { min: 45, max: 85 }, potassium: { min: 190, max: 310 }, temperature: { min: 22, max: 35, critical: 40 }, irrigationDuration: 40, irrigationFrequency: 3, fertilizerDose: 0.8 },
    winter: { moisture: { min: 40, max: 70, critical: 28 }, ph: { min: 5.8, max: 6.5 }, nitrogen: { min: 140, max: 240 }, phosphorus: { min: 40, max: 75 }, potassium: { min: 170, max: 290 }, temperature: { min: 18, max: 30, critical: 36 }, irrigationDuration: 30, irrigationFrequency: 2, fertilizerDose: 0.6 },
  },
};

export interface Crop {
  id: string;
  name: string;
  zone: string;
  stage: string;
  progress: number;
  health: number;
  icon: string;
  plantedDate: string;
  expectedHarvest: string;
  waterNeeded: number;
  fertilizerNeeded: number;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  unit: string;
  stock: number;
  sold: number;
  icon: string;
  category: string;
  organic: boolean;
  listed: boolean;
  image?: string;
}

export interface Order {
  id: string;
  product: string;
  buyer: string;
  quantity: string;
  total: string;
  status: "pending" | "confirmed" | "shipped" | "delivered" | "cancelled";
  date: string;
  type: "marketplace" | "b2b";
}

export interface B2BDemand {
  id: string;
  buyer: string;
  buyerType: "hotel" | "hospital" | "airline" | "government" | "company";
  product: string;
  quantity: string;
  urgency: "high" | "medium" | "low";
  priceRange: string;
  matched: boolean;
  contractId?: string;
}

export interface Delivery {
  id: string;
  orderId: string;
  buyer: string;
  product: string;
  status: "packing" | "in_transit" | "delivered";
  eta: string;
  driver: string;
  vehicle: string;
}

export interface Transaction {
  id: string;
  name: string;
  amount: number;
  type: "income" | "expense";
  category: string;
  date: string;
  product: string;
}

export interface SensorAlert {
  nodeId: string;
  nodeName: string;
  zone: string;
  metric: "moisture" | "ph" | "nitrogen" | "phosphorus" | "potassium" | "temperature";
  value: number;
  threshold: { min: number; max: number; critical?: number };
  severity: "warning" | "critical";
  message: string;
  time: string;
}

export interface SensorHistoryPoint {
  time: string;
  moisture: number;
  ph: number;
  nitrogen: number;
  phosphorus: number;
  potassium: number;
  temperature: number;
}

export interface CalibrationStep {
  step: number;
  title: string;
  description: string;
  action: string;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  type: "alert" | "demand" | "order" | "reward" | "system";
  read: boolean;
  time: string;
  actionUrl?: string;
}

// ═══ SUBSCRIPTION PACKAGES ═══
export type PackageTier = "seedling" | "harvest" | "falaj_elite";

export interface PackageFeatures {
  maxZones: number;
  maxSensorNodes: number;
  maxValves: number;
  aiAssistant: boolean;
  voiceCommands: boolean;
  dailyPlanner: boolean;
  cropPlanning: boolean;
  b2bSupplyChain: boolean;
  financialDashboard: boolean;
  logistics: boolean;
  governmentReports: boolean;
  sensorHistory: "7d" | "30d" | "unlimited";
  calibration: boolean;
  marketplace: boolean;
  marketplaceListings: number;
  rewardsMultiplier: number;
  supplyNotifications: boolean;
  exportReports: boolean;
  prioritySupport: boolean;
  customThresholds: boolean;
  automatedIrrigation: boolean;
}

export const PACKAGE_TIERS: Record<PackageTier, {
  name: string;
  nameAr: string;
  price: number; // AED/month
  yearlyPrice: number; // AED/year
  tagline: string;
  taglineAr: string;
  features: PackageFeatures;
}> = {
  seedling: {
    name: "Seedling",
    nameAr: "بذرة",
    price: 0,
    yearlyPrice: 0,
    tagline: "Start your smart farming journey",
    taglineAr: "ابدأ رحلتك في الزراعة الذكية",
    features: {
      maxZones: 2,
      maxSensorNodes: 4,
      maxValves: 2,
      aiAssistant: false,
      voiceCommands: false,
      dailyPlanner: false,
      cropPlanning: false,
      b2bSupplyChain: false,
      financialDashboard: false,
      logistics: false,
      governmentReports: false,
      sensorHistory: "7d",
      calibration: false,
      marketplace: true,
      marketplaceListings: 5,
      rewardsMultiplier: 1,
      supplyNotifications: false,
      exportReports: false,
      prioritySupport: false,
      customThresholds: false,
      automatedIrrigation: false,
    },
  },
  harvest: {
    name: "Harvest Pro",
    nameAr: "حصاد برو",
    price: 149,
    yearlyPrice: 1490,
    tagline: "Scale your farm with AI-powered tools",
    taglineAr: "وسّع مزرعتك بأدوات الذكاء الاصطناعي",
    features: {
      maxZones: 8,
      maxSensorNodes: 24,
      maxValves: 8,
      aiAssistant: true,
      voiceCommands: true,
      dailyPlanner: true,
      cropPlanning: true,
      b2bSupplyChain: false,
      financialDashboard: true,
      logistics: false,
      governmentReports: false,
      sensorHistory: "30d",
      calibration: true,
      marketplace: true,
      marketplaceListings: 25,
      rewardsMultiplier: 1.5,
      supplyNotifications: true,
      exportReports: true,
      prioritySupport: false,
      customThresholds: true,
      automatedIrrigation: true,
    },
  },
  falaj_elite: {
    name: "Falaj Elite",
    nameAr: "فلج النخبة",
    price: 399,
    yearlyPrice: 3990,
    tagline: "Enterprise-grade farming intelligence",
    taglineAr: "ذكاء زراعي بمستوى المؤسسات",
    features: {
      maxZones: 50,
      maxSensorNodes: 200,
      maxValves: 50,
      aiAssistant: true,
      voiceCommands: true,
      dailyPlanner: true,
      cropPlanning: true,
      b2bSupplyChain: true,
      financialDashboard: true,
      logistics: true,
      governmentReports: true,
      sensorHistory: "unlimited",
      calibration: true,
      marketplace: true,
      marketplaceListings: -1, // unlimited
      rewardsMultiplier: 2,
      supplyNotifications: true,
      exportReports: true,
      prioritySupport: true,
      customThresholds: true,
      automatedIrrigation: true,
    },
  },
};

export interface UserProfile {
  name: string;
  nameAr: string;
  farm: string;
  farmAr: string;
  plan: "free" | "premium" | "enterprise";
  package: PackageTier;
  level: number;
  xp: number;
  xpToNext: number;
  avatar: string;
  phone: string;
  email: string;
  location: string;
  joinDate: string;
  badges: string[];
  subscriptionStart: string;
  subscriptionEnd: string;
  billingCycle: "monthly" | "yearly";
  // Trial
  trialActive: boolean;
  trialStartDate: string;
  trialEndDate: string;
  trialUsed: boolean;
  // Referral
  referralCode: string;
  referralsCount: number;
  referralRewardsEarned: number; // months earned
  referredBy: string;
}

export interface Challenge {
  id: string;
  title: string;
  description: string;
  xpReward: number;
  progress: number;
  total: number;
  completed: boolean;
  type: "daily" | "weekly" | "seasonal";
  category: string;
}

export interface Resource {
  id: string;
  name: string;
  value: number;
  unit: string;
  trend: number;
  trendLabel: string;
  optimal: { min: number; max: number };
  history: number[];
}

// ═══ INITIAL DATA ═══
const initialUser: UserProfile = {
  name: "Ahmed Al Dhaheri",
  nameAr: "أحمد الظاهري",
  farm: "Al Ain Heritage Farm",
  farmAr: "مزرعة العين التراثية",
  plan: "premium",
  package: "harvest" as PackageTier,
  level: 12,
  xp: 2450,
  xpToNext: 3000,
  avatar: "AF",
  phone: "+971 50 123 4567",
  email: "ahmed@alain-farm.ae",
  location: "Al Ain, Abu Dhabi",
  joinDate: "2024-06-15",
  badges: ["early_adopter", "water_saver", "top_seller", "ai_pioneer", "community_leader"],
  subscriptionStart: "2025-01-15",
  subscriptionEnd: "2026-01-15",
  billingCycle: "yearly" as const,
  trialActive: false,
  trialStartDate: "",
  trialEndDate: "",
  trialUsed: false,
  referralCode: "AHMED-FALAJ-7X2K",
  referralsCount: 3,
  referralRewardsEarned: 2,
  referredBy: "",
};

const initialSensors: SensorNode[] = [
  // All sensors start UNPAIRED — readings are zeroed/vague until paired
  // Zone A — Organic Tomatoes (3 nodes)
  { id: "sn-a1", name: "Node A-1", zone: "Zone A", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "15cm" },
  { id: "sn-a2", name: "Node A-2", zone: "Zone A", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "30cm" },
  { id: "sn-a3", name: "Node A-3", zone: "Zone A", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "15cm" },
  // Zone B — Khalas Dates (3 nodes)
  { id: "sn-b1", name: "Node B-1", zone: "Zone B", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "30cm" },
  { id: "sn-b2", name: "Node B-2", zone: "Zone B", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "15cm" },
  { id: "sn-b3", name: "Node B-3", zone: "Zone B", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "45cm" },
  // Zone C — Fresh Herbs (2 nodes)
  { id: "sn-c1", name: "Node C-1", zone: "Zone C", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "15cm" },
  { id: "sn-c2", name: "Node C-2", zone: "Zone C", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "15cm" },
  // Zone D — Cucumbers (2 nodes)
  { id: "sn-d1", name: "Node D-1", zone: "Zone D", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "15cm" },
  { id: "sn-d2", name: "Node D-2", zone: "Zone D", moisture: 0, ph: 0, nitrogen: 0, phosphorus: 0, potassium: 0, temperature: 0, status: "normal", lastReading: "--", battery: 0, paired: false, depth: "30cm" },
];

const initialValves: Valve[] = [
  { id: "v1", zone: "Zone A", status: "open", flowRate: 12, schedule: "6:00 AM - 8:00 AM", auto: true, totalUsageToday: 1440, maxFlowRate: 15, dailyWaterLimit: 2000 },
  { id: "v2", zone: "Zone B", status: "closed", flowRate: 0, schedule: "Next: 4:00 PM", auto: true, totalUsageToday: 960, maxFlowRate: 20, dailyWaterLimit: 2500 },
  { id: "v3", zone: "Zone C", status: "open", flowRate: 8, schedule: "5:30 AM - 7:30 AM", auto: false, totalUsageToday: 720, maxFlowRate: 12, dailyWaterLimit: 1500 },
  { id: "v4", zone: "Zone D", status: "closed", flowRate: 0, schedule: "Next: 6:00 PM", auto: true, totalUsageToday: 480, maxFlowRate: 15, dailyWaterLimit: 1800 },
];

const initialCrops: Crop[] = [
  { id: "c1", name: "Organic Tomatoes", zone: "Zone A", stage: "Fruiting", progress: 75, health: 92, icon: "🍅", plantedDate: "2025-12-01", expectedHarvest: "2026-04-15", waterNeeded: 2.5, fertilizerNeeded: 0.8 },
  { id: "c2", name: "Khalas Dates", zone: "Zone B", stage: "Pollination", progress: 45, health: 88, icon: "🌴", plantedDate: "2024-03-01", expectedHarvest: "2026-08-01", waterNeeded: 3.0, fertilizerNeeded: 1.2 },
  { id: "c3", name: "Fresh Herbs", zone: "Zone C", stage: "Harvesting", progress: 90, health: 95, icon: "🌿", plantedDate: "2026-01-15", expectedHarvest: "2026-03-20", waterNeeded: 1.5, fertilizerNeeded: 0.3 },
  { id: "c4", name: "Cucumbers", zone: "Zone D", stage: "Growing", progress: 60, health: 85, icon: "🥒", plantedDate: "2026-01-01", expectedHarvest: "2026-04-01", waterNeeded: 2.0, fertilizerNeeded: 0.6 },
];

const initialProducts: Product[] = [
  { id: "p1", name: "Organic Tomatoes", price: 5.5, unit: "kg", stock: 450, sold: 23, icon: "🍅", category: "vegetables", organic: true, listed: true },
  { id: "p2", name: "Khalas Dates", price: 15, unit: "kg", stock: 800, sold: 12, icon: "🌴", category: "fruits", organic: true, listed: true },
  { id: "p3", name: "Fresh Basil", price: 28, unit: "kg", stock: 30, sold: 45, icon: "🌿", category: "herbs", organic: true, listed: true },
  { id: "p4", name: "Organic Cucumbers", price: 4, unit: "kg", stock: 200, sold: 8, icon: "🥒", category: "vegetables", organic: true, listed: true },
  { id: "p5", name: "Premium Honey", price: 85, unit: "jar", stock: 50, sold: 15, icon: "🍯", category: "specialty", organic: true, listed: true },
];

const initialOrders: Order[] = [
  { id: "o1", product: "Organic Tomatoes", buyer: "Jumeirah Group", quantity: "500 kg", total: "AED 2,750", status: "confirmed", date: "2026-03-10", type: "b2b" },
  { id: "o2", product: "Organic Lettuce", buyer: "Cleveland Clinic", quantity: "200 kg", total: "AED 1,400", status: "shipped", date: "2026-03-09", type: "b2b" },
  { id: "o3", product: "Khalas Dates", buyer: "Mohammed S.", quantity: "10 kg", total: "AED 150", status: "pending", date: "2026-03-10", type: "marketplace" },
  { id: "o4", product: "Fresh Basil", buyer: "Sara K.", quantity: "2 kg", total: "AED 56", status: "delivered", date: "2026-03-08", type: "marketplace" },
  { id: "o5", product: "Cherry Tomatoes", buyer: "Etihad Catering", quantity: "300 kg", total: "AED 2,100", status: "confirmed", date: "2026-03-10", type: "b2b" },
];

const initialDemand: B2BDemand[] = [
  { id: "d1", buyer: "Jumeirah Group", buyerType: "hotel", product: "Organic Tomatoes", quantity: "500 kg/week", urgency: "high", priceRange: "AED 5-6/kg", matched: true, contractId: "ct1" },
  { id: "d2", buyer: "Cleveland Clinic", buyerType: "hospital", product: "Organic Lettuce", quantity: "200 kg/week", urgency: "high", priceRange: "AED 7-9/kg", matched: true, contractId: "ct2" },
  { id: "d3", buyer: "Etihad Catering", buyerType: "airline", product: "Cherry Tomatoes", quantity: "300 kg/week", urgency: "medium", priceRange: "AED 6-8/kg", matched: false },
  { id: "d4", buyer: "ADAA", buyerType: "government", product: "Premium Dates", quantity: "2,000 kg", urgency: "low", priceRange: "AED 12-18/kg", matched: false },
  { id: "d5", buyer: "Lulu Hypermarket", buyerType: "company", product: "Mixed Vegetables", quantity: "1,000 kg/week", urgency: "medium", priceRange: "AED 4-7/kg", matched: false },
];

const initialDeliveries: Delivery[] = [
  { id: "dl1", orderId: "o1", buyer: "Jumeirah Group", product: "Organic Tomatoes · 500 kg", status: "in_transit", eta: "12:30 PM", driver: "Hassan M.", vehicle: "Refrigerated Van #3" },
  { id: "dl2", orderId: "o2", buyer: "Cleveland Clinic", product: "Organic Lettuce · 200 kg", status: "packing", eta: "2:00 PM", driver: "Ali K.", vehicle: "Refrigerated Van #1" },
];

const initialTransactions: Transaction[] = [
  { id: "t1", name: "Jumeirah Group", amount: 2750, type: "income", category: "B2B", date: "2026-03-10", product: "Organic Tomatoes" },
  { id: "t2", name: "Fertilizer Purchase", amount: -450, type: "expense", category: "Supplies", date: "2026-03-10", product: "NPK 20-20-20" },
  { id: "t3", name: "Cleveland Clinic", amount: 1400, type: "income", category: "B2B", date: "2026-03-09", product: "Organic Lettuce" },
  { id: "t4", name: "Water Bill", amount: -320, type: "expense", category: "Utilities", date: "2026-03-08", product: "Monthly utility" },
  { id: "t5", name: "Sara K.", amount: 56, type: "income", category: "Marketplace", date: "2026-03-08", product: "Fresh Basil" },
  { id: "t6", name: "Seed Purchase", amount: -180, type: "expense", category: "Supplies", date: "2026-03-07", product: "Tomato seeds" },
  { id: "t7", name: "Mohammed S.", amount: 150, type: "income", category: "Marketplace", date: "2026-03-07", product: "Khalas Dates" },
  { id: "t8", name: "Equipment Maintenance", amount: -250, type: "expense", category: "Equipment", date: "2026-03-06", product: "Pump repair" },
];

const initialNotifications: Notification[] = [
  { id: "n1", title: "Urgent Demand", message: "Jumeirah Group needs 500 kg Organic Tomatoes by Friday", type: "demand", read: false, time: "10 min ago", actionUrl: "/supply-chain" },
  { id: "n2", title: "Order Confirmed", message: "Your order #o1 has been confirmed by Jumeirah Group", type: "order", read: false, time: "30 min ago", actionUrl: "/orders" },
  { id: "n3", title: "Temperature Alert", message: "Zone B temperature reached 34°C — above optimal range", type: "alert", read: false, time: "1h ago", actionUrl: "/smart-sensors" },
  { id: "n4", title: "Achievement Unlocked", message: "You earned the 'Water Saver' badge! +200 XP", type: "reward", read: true, time: "2h ago", actionUrl: "/rewards" },
  { id: "n5", title: "New B2B Demand", message: "Etihad Catering is looking for Cherry Tomatoes", type: "demand", read: true, time: "3h ago", actionUrl: "/supply-chain" },
];

const initialChallenges: Challenge[] = [
  { id: "ch1", title: "Water Efficiency Master", description: "Reduce water usage by 10% this week", xpReward: 150, progress: 7, total: 10, completed: false, type: "weekly", category: "sustainability" },
  { id: "ch2", title: "Sensor Check", description: "Review all sensor readings today", xpReward: 50, progress: 4, total: 6, completed: false, type: "daily", category: "monitoring" },
  { id: "ch3", title: "Market Leader", description: "Complete 5 marketplace sales this week", xpReward: 200, progress: 3, total: 5, completed: false, type: "weekly", category: "trading" },
  { id: "ch4", title: "AI Adopter", description: "Accept 3 AI recommendations today", xpReward: 75, progress: 1, total: 3, completed: false, type: "daily", category: "ai" },
  { id: "ch5", title: "Community Contributor", description: "Share 2 tips in the community", xpReward: 100, progress: 1, total: 2, completed: false, type: "weekly", category: "community" },
  { id: "ch6", title: "Harvest Season", description: "Harvest 500 kg of produce this season", xpReward: 500, progress: 320, total: 500, completed: false, type: "seasonal", category: "farming" },
];

const initialResources: Resource[] = [
  { id: "r1", name: "Water Usage", value: 2400, unit: "L", trend: -12, trendLabel: "-12%", optimal: { min: 1800, max: 3000 }, history: [2800, 2600, 2500, 2400, 2300, 2400] },
  { id: "r2", name: "Soil Health", value: 78, unit: "/100", trend: 5, trendLabel: "+5", optimal: { min: 70, max: 100 }, history: [72, 73, 75, 76, 78, 78] },
  { id: "r3", name: "Energy", value: 45, unit: "kWh", trend: 8, trendLabel: "+8%", optimal: { min: 30, max: 50 }, history: [38, 40, 42, 43, 44, 45] },
  { id: "r4", name: "Fertilizer", value: 3.2, unit: "kg", trend: -15, trendLabel: "-15%", optimal: { min: 2, max: 5 }, history: [4.2, 3.8, 3.5, 3.4, 3.3, 3.2] },
  { id: "r5", name: "Sunlight", value: 8.5, unit: "hrs", trend: 2, trendLabel: "+2%", optimal: { min: 6, max: 12 }, history: [7.8, 8.0, 8.2, 8.3, 8.4, 8.5] },
];

// ═══ CONTEXT ═══
interface AppState {
  user: UserProfile;
  sensors: SensorNode[];
  valves: Valve[];
  crops: Crop[];
  products: Product[];
  orders: Order[];
  demand: B2BDemand[];
  deliveries: Delivery[];
  transactions: Transaction[];
  notifications: Notification[];
  challenges: Challenge[];
  resources: Resource[];
  zoneThresholds: ZoneThreshold[];
  // Actions
  updateUser: (updates: Partial<UserProfile>) => void;
  addXP: (amount: number) => void;
  toggleValve: (id: string) => void;
  setValveAuto: (id: string, auto: boolean) => void;
  updateSensor: (id: string, updates: Partial<SensorNode>) => void;
  addSensor: (sensor: SensorNode) => void;
  removeSensor: (id: string) => void;
  pairSensor: (id: string) => void;
  pairAllSensors: () => void;
  updateCrop: (id: string, updates: Partial<Crop>) => void;
  addCrop: (crop: Crop) => void;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  addProduct: (product: Product) => void;
  toggleProductListing: (id: string) => void;
  updateOrder: (id: string, updates: Partial<Order>) => void;
  addOrder: (order: Order) => void;
  matchDemand: (id: string) => void;
  updateDelivery: (id: string, updates: Partial<Delivery>) => void;
  addTransaction: (transaction: Transaction) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  addNotification: (notification: Notification) => void;
  updateChallenge: (id: string, progress: number) => void;
  completeChallenge: (id: string) => void;
  updateZoneThreshold: (zone: string, updates: Partial<ZoneThreshold>) => void;
  applyThresholdsFromCropPlan: (zone: string, cropType: string, season: string, growthStage: string) => void;
  getSensorAlerts: () => SensorAlert[];
  getZoneAlertCount: (zone: string) => number;
  getSensorHistory: (nodeId: string) => SensorHistoryPoint[];
  calibrateSensor: (nodeId: string) => void;
  upgradePackage: (tier: PackageTier, billing: "monthly" | "yearly") => void;
  hasFeature: (feature: keyof PackageFeatures) => boolean;
  getPackageInfo: () => typeof PACKAGE_TIERS[PackageTier];
  startTrial: () => void;
  applyReferralCode: (code: string) => boolean;
  getReferralStats: () => { code: string; count: number; rewardsEarned: number; referrals: { name: string; date: string; status: string }[] };
  isTrialExpired: () => boolean;
  trialDaysLeft: () => number;
  unreadCount: number;
}

const AppStateContext = createContext<AppState | null>(null);

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserProfile>(initialUser);
  const [sensors, setSensors] = useState<SensorNode[]>(initialSensors);
  const [valves, setValves] = useState<Valve[]>(initialValves);
  const [crops, setCrops] = useState<Crop[]>(initialCrops);
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [orders, setOrders] = useState<Order[]>(initialOrders);
  const [demand, setDemand] = useState<B2BDemand[]>(initialDemand);
  const [deliveries, setDeliveries] = useState<Delivery[]>(initialDeliveries);
  const [transactions, setTransactions] = useState<Transaction[]>(initialTransactions);
  const [notifications, setNotifications] = useState<Notification[]>(initialNotifications);
  const [challenges, setChallenges] = useState<Challenge[]>(initialChallenges);
  const [resources] = useState<Resource[]>(initialResources);

  const getCurrentSeason = (): "summer" | "winter" | "spring" | "autumn" => {
    const month = new Date().getMonth();
    if (month >= 5 && month <= 9) return "summer";
    if (month >= 11 || month <= 1) return "winter";
    if (month >= 2 && month <= 4) return "spring";
    return "autumn";
  };

  const [zoneThresholds, setZoneThresholds] = useState<ZoneThreshold[]>([
    { zone: "Zone A", cropType: "Organic Tomatoes", season: getCurrentSeason(), growthStage: "Fruiting", moisture: { min: 45, max: 70, critical: 30 }, ph: { min: 6.0, max: 6.8 }, nitrogen: { min: 150, max: 250 }, phosphorus: { min: 40, max: 80 }, potassium: { min: 180, max: 300 }, temperature: { min: 20, max: 35, critical: 42 }, irrigationDuration: 45, irrigationFrequency: 3, fertilizerDose: 1.0, lastAdjusted: "Today", adjustedBy: "crop_plan" },
    { zone: "Zone B", cropType: "Khalas Dates", season: getCurrentSeason(), growthStage: "Pollination", moisture: { min: 25, max: 50, critical: 15 }, ph: { min: 7.0, max: 8.0 }, nitrogen: { min: 100, max: 200 }, phosphorus: { min: 30, max: 60 }, potassium: { min: 150, max: 250 }, temperature: { min: 25, max: 45, critical: 50 }, irrigationDuration: 60, irrigationFrequency: 2, fertilizerDose: 1.5, lastAdjusted: "Today", adjustedBy: "crop_plan" },
    { zone: "Zone C", cropType: "Fresh Herbs", season: getCurrentSeason(), growthStage: "Vegetative", moisture: { min: 50, max: 75, critical: 35 }, ph: { min: 6.0, max: 7.0 }, nitrogen: { min: 170, max: 280 }, phosphorus: { min: 45, max: 90 }, potassium: { min: 200, max: 320 }, temperature: { min: 18, max: 32, critical: 38 }, irrigationDuration: 30, irrigationFrequency: 3, fertilizerDose: 0.5, lastAdjusted: "Yesterday", adjustedBy: "ai" },
    { zone: "Zone D", cropType: "Cucumbers", season: getCurrentSeason(), growthStage: "Flowering", moisture: { min: 50, max: 80, critical: 35 }, ph: { min: 5.8, max: 6.5 }, nitrogen: { min: 160, max: 260 }, phosphorus: { min: 45, max: 85 }, potassium: { min: 190, max: 310 }, temperature: { min: 22, max: 35, critical: 40 }, irrigationDuration: 40, irrigationFrequency: 3, fertilizerDose: 0.8, lastAdjusted: "2 days ago", adjustedBy: "manual" },
  ]);

  const unreadCount = notifications.filter(n => !n.read).length;

  // Generate sensor history (simulated 7-day / 30-day data)
  const getSensorHistory = useCallback((nodeId: string): SensorHistoryPoint[] => {
    const node = sensors.find(s => s.id === nodeId);
    if (!node) return [];
    const points: SensorHistoryPoint[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const dayVar = Math.sin(i * 0.5) * 5;
      points.push({
        time: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        moisture: Math.max(5, Math.min(95, node.moisture + dayVar + (Math.random() - 0.5) * 8)),
        ph: Math.max(4, Math.min(9, node.ph + (Math.random() - 0.5) * 0.6)),
        nitrogen: Math.max(50, Math.min(350, node.nitrogen + dayVar * 3 + (Math.random() - 0.5) * 20)),
        phosphorus: Math.max(10, Math.min(120, node.phosphorus + (Math.random() - 0.5) * 10)),
        potassium: Math.max(80, Math.min(400, node.potassium + dayVar * 2 + (Math.random() - 0.5) * 15)),
        temperature: Math.max(15, Math.min(50, node.temperature + dayVar * 0.5 + (Math.random() - 0.5) * 3)),
      });
    }
    return points;
  }, [sensors]);

  // Check all sensor nodes against zone thresholds and return alerts
  const getSensorAlerts = useCallback((): SensorAlert[] => {
    const alerts: SensorAlert[] = [];
    sensors.forEach(node => {
      const threshold = zoneThresholds.find(t => t.zone === node.zone);
      if (!threshold) return;
      const checks: { metric: SensorAlert["metric"]; value: number; th: { min: number; max: number; critical?: number } }[] = [
        { metric: "moisture", value: node.moisture, th: threshold.moisture },
        { metric: "ph", value: node.ph, th: threshold.ph },
        { metric: "nitrogen", value: node.nitrogen, th: threshold.nitrogen },
        { metric: "phosphorus", value: node.phosphorus, th: threshold.phosphorus },
        { metric: "potassium", value: node.potassium, th: threshold.potassium },
        { metric: "temperature", value: node.temperature, th: threshold.temperature },
      ];
      checks.forEach(({ metric, value, th }) => {
        const crit = (th as any).critical;
        if (crit !== undefined && (value <= crit || value >= crit)) {
          if ((metric === "moisture" && value <= crit) || (metric === "temperature" && value >= crit)) {
            alerts.push({ nodeId: node.id, nodeName: node.name, zone: node.zone, metric, value, threshold: th, severity: "critical", message: `${metric} at ${value} — CRITICAL`, time: node.lastReading });
            return;
          }
        }
        if (value < th.min || value > th.max) {
          alerts.push({ nodeId: node.id, nodeName: node.name, zone: node.zone, metric, value, threshold: th, severity: "warning", message: `${metric} at ${value} — outside range (${th.min}–${th.max})`, time: node.lastReading });
        }
      });
    });
    return alerts;
  }, [sensors, zoneThresholds]);

  const getZoneAlertCount = useCallback((zone: string): number => {
    return getSensorAlerts().filter(a => a.zone === zone).length;
  }, [getSensorAlerts]);

  const calibrateSensor = useCallback((nodeId: string) => {
    setSensors(prev => prev.map(s => s.id === nodeId ? { ...s, status: "normal", lastReading: "Just now", battery: Math.min(100, s.battery + 5) } : s));
    addNotification({
      id: `n-${Date.now()}`, title: "Sensor Calibrated",
      message: `${sensors.find(s => s.id === nodeId)?.name || nodeId} has been recalibrated successfully`,
      type: "system", read: false, time: "Just now", actionUrl: "/smart-sensors"
    });
  }, [sensors]);

  const updateUser = useCallback((updates: Partial<UserProfile>) => {
    setUser(prev => ({ ...prev, ...updates }));
  }, []);

  const upgradePackage = useCallback((tier: PackageTier, billing: "monthly" | "yearly") => {
    const now = new Date();
    const end = new Date(now);
    if (billing === "yearly") end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    setUser(prev => ({
      ...prev,
      package: tier,
      plan: tier === "seedling" ? "free" : tier === "harvest" ? "premium" : "enterprise",
      billingCycle: billing,
      subscriptionStart: now.toISOString().split("T")[0],
      subscriptionEnd: end.toISOString().split("T")[0],
    }));
    addNotification({
      id: `n-${Date.now()}`, title: "Package Upgraded",
      message: `Welcome to ${PACKAGE_TIERS[tier].name}! Enjoy your new features.`,
      type: "reward", read: false, time: "Just now", actionUrl: "/packages"
    });
  }, []);

  const hasFeature = useCallback((feature: keyof PackageFeatures): boolean => {
    const pkg = PACKAGE_TIERS[user.package || "seedling"];
    const val = pkg.features[feature];
    if (typeof val === "boolean") return val;
    if (typeof val === "number") return val !== 0;
    if (typeof val === "string") return true;
    return false;
  }, [user.package]);

  const getPackageInfo = useCallback(() => {
    return PACKAGE_TIERS[user.package || "seedling"];
  }, [user.package]);

  const startTrial = useCallback(() => {
    const now = new Date();
    const end = new Date(now);
    end.setDate(end.getDate() + 14);
    setUser(prev => ({
      ...prev,
      trialActive: true,
      trialStartDate: now.toISOString().split("T")[0],
      trialEndDate: end.toISOString().split("T")[0],
      trialUsed: true,
      package: "harvest" as PackageTier,
      plan: "premium",
    }));
    addNotification({
      id: `n-${Date.now()}`, title: "Free Trial Activated",
      message: "Your 14-day Harvest Pro trial has started. Enjoy all premium features!",
      type: "reward", read: false, time: "Just now", actionUrl: "/packages"
    });
  }, []);

  const applyReferralCode = useCallback((code: string): boolean => {
    if (!code || code.length < 5) return false;
    setUser(prev => ({
      ...prev,
      referredBy: code,
    }));
    addNotification({
      id: `n-${Date.now()}`, title: "Referral Applied",
      message: "Referral code applied successfully! Both you and your referrer will receive rewards.",
      type: "reward", read: false, time: "Just now", actionUrl: "/referrals"
    });
    return true;
  }, []);

  const getReferralStats = useCallback(() => {
    return {
      code: user.referralCode,
      count: user.referralsCount,
      rewardsEarned: user.referralRewardsEarned,
      referrals: [
        { name: "Khalid Al Mansoori", date: "2025-11-20", status: "subscribed" },
        { name: "Fatima Al Hashimi", date: "2025-12-05", status: "subscribed" },
        { name: "Omar Al Suwaidi", date: "2026-01-18", status: "subscribed" },
        { name: "Mariam Al Ketbi", date: "2026-02-28", status: "trial" },
        { name: "Saeed Al Mazrouei", date: "2026-03-05", status: "pending" },
      ]
    };
  }, [user.referralCode, user.referralsCount, user.referralRewardsEarned]);

  const isTrialExpired = useCallback((): boolean => {
    if (!user.trialActive) return false;
    return new Date() > new Date(user.trialEndDate);
  }, [user.trialActive, user.trialEndDate]);

  const trialDaysLeft = useCallback((): number => {
    if (!user.trialActive) return 0;
    const end = new Date(user.trialEndDate);
    const now = new Date();
    const diff = Math.ceil((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
  }, [user.trialActive, user.trialEndDate]);

  const addXP = useCallback((amount: number) => {
    setUser(prev => {
      let newXP = prev.xp + amount;
      let newLevel = prev.level;
      let newXPToNext = prev.xpToNext;
      while (newXP >= newXPToNext) {
        newXP -= newXPToNext;
        newLevel++;
        newXPToNext = Math.floor(newXPToNext * 1.2);
      }
      return { ...prev, xp: newXP, level: newLevel, xpToNext: newXPToNext };
    });
  }, []);

  const toggleValve = useCallback((id: string) => {
    setValves(prev => prev.map(v =>
      v.id === id ? { ...v, status: v.status === "open" ? "closed" : "open", flowRate: v.status === "open" ? 0 : 12 } : v
    ));
  }, []);

  const setValveAuto = useCallback((id: string, auto: boolean) => {
    setValves(prev => prev.map(v => v.id === id ? { ...v, auto } : v));
  }, []);

  const updateSensor = useCallback((id: string, updates: Partial<SensorNode>) => {
    setSensors(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
  }, []);

  const addSensor = useCallback((sensor: SensorNode) => {
    setSensors(prev => [...prev, sensor]);
    addNotification({
      id: `n-${Date.now()}`, title: "Sensor Node Paired", message: `${sensor.name} paired in ${sensor.zone}`,
      type: "system", read: false, time: "Just now", actionUrl: "/smart-sensors"
    });
  }, []);

  const removeSensor = useCallback((id: string) => {
    setSensors(prev => prev.filter(s => s.id !== id));
  }, []);

  // Simulated real readings that populate when a sensor is paired
  const PAIRED_READINGS: Record<string, Partial<SensorNode>> = {
    "sn-a1": { moisture: 42, ph: 6.5, nitrogen: 180, phosphorus: 45, potassium: 210, temperature: 28, status: "normal", lastReading: "2 min ago", battery: 85 },
    "sn-a2": { moisture: 38, ph: 6.3, nitrogen: 165, phosphorus: 42, potassium: 195, temperature: 29, status: "normal", lastReading: "2 min ago", battery: 78 },
    "sn-a3": { moisture: 45, ph: 6.7, nitrogen: 190, phosphorus: 48, potassium: 220, temperature: 27, status: "normal", lastReading: "3 min ago", battery: 92 },
    "sn-b1": { moisture: 31, ph: 7.2, nitrogen: 140, phosphorus: 35, potassium: 180, temperature: 34, status: "alert", lastReading: "1 min ago", battery: 72 },
    "sn-b2": { moisture: 28, ph: 7.4, nitrogen: 130, phosphorus: 32, potassium: 170, temperature: 35, status: "alert", lastReading: "1 min ago", battery: 65 },
    "sn-b3": { moisture: 33, ph: 7.1, nitrogen: 145, phosphorus: 38, potassium: 185, temperature: 33, status: "normal", lastReading: "2 min ago", battery: 80 },
    "sn-c1": { moisture: 55, ph: 6.8, nitrogen: 200, phosphorus: 55, potassium: 240, temperature: 26, status: "normal", lastReading: "3 min ago", battery: 91 },
    "sn-c2": { moisture: 52, ph: 6.6, nitrogen: 195, phosphorus: 52, potassium: 235, temperature: 27, status: "normal", lastReading: "3 min ago", battery: 88 },
    "sn-d1": { moisture: 48, ph: 6.4, nitrogen: 175, phosphorus: 50, potassium: 200, temperature: 30, status: "normal", lastReading: "1 min ago", battery: 68 },
    "sn-d2": { moisture: 44, ph: 6.2, nitrogen: 160, phosphorus: 46, potassium: 190, temperature: 31, status: "normal", lastReading: "2 min ago", battery: 74 },
  };

  const pairSensor = useCallback((id: string) => {
    const readings = PAIRED_READINGS[id] || { moisture: 40, ph: 6.5, nitrogen: 170, phosphorus: 45, potassium: 200, temperature: 29, status: "normal" as const, lastReading: "Just now", battery: 80 };
    setSensors(prev => prev.map(s => s.id === id ? { ...s, ...readings, paired: true } : s));
    addNotification({
      id: `n-${Date.now()}`, title: "Sensor Paired",
      message: `${sensors.find(s => s.id === id)?.name || id} is now paired and transmitting data`,
      type: "system", read: false, time: "Just now", actionUrl: "/smart-sensors"
    });
  }, [sensors]);

  const pairAllSensors = useCallback(() => {
    setSensors(prev => prev.map(s => {
      const readings = PAIRED_READINGS[s.id] || { moisture: 40, ph: 6.5, nitrogen: 170, phosphorus: 45, potassium: 200, temperature: 29, status: "normal" as const, lastReading: "Just now", battery: 80 };
      return { ...s, ...readings, paired: true };
    }));
    addNotification({
      id: `n-${Date.now()}`, title: "All Sensors Paired",
      message: "All sensor nodes are now paired and transmitting live data",
      type: "system", read: false, time: "Just now", actionUrl: "/smart-sensors"
    });
  }, []);

  const updateCrop = useCallback((id: string, updates: Partial<Crop>) => {
    setCrops(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  }, []);

  const addCrop = useCallback((crop: Crop) => {
    setCrops(prev => [...prev, crop]);
  }, []);

  const updateProduct = useCallback((id: string, updates: Partial<Product>) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, ...updates } : p));
  }, []);

  const addProduct = useCallback((product: Product) => {
    setProducts(prev => [...prev, product]);
  }, []);

  const toggleProductListing = useCallback((id: string) => {
    setProducts(prev => prev.map(p => p.id === id ? { ...p, listed: !p.listed } : p));
  }, []);

  const updateOrder = useCallback((id: string, updates: Partial<Order>) => {
    setOrders(prev => prev.map(o => o.id === id ? { ...o, ...updates } : o));
  }, []);

  const addOrder = useCallback((order: Order) => {
    setOrders(prev => [order, ...prev]);
    addNotification({
      id: `n-${Date.now()}`, title: "New Order", message: `New order for ${order.product} from ${order.buyer}`,
      type: "order", read: false, time: "Just now", actionUrl: "/orders"
    });
  }, []);

  const matchDemand = useCallback((id: string) => {
    setDemand(prev => prev.map(d => d.id === id ? { ...d, matched: true, contractId: `ct-${Date.now()}` } : d));
    addXP(100);
    addNotification({
      id: `n-${Date.now()}`, title: "Demand Matched", message: "You matched a B2B demand! +100 XP",
      type: "reward", read: false, time: "Just now", actionUrl: "/supply-chain"
    });
  }, []);

  const updateDelivery = useCallback((id: string, updates: Partial<Delivery>) => {
    setDeliveries(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
  }, []);

  const addTransaction = useCallback((transaction: Transaction) => {
    setTransactions(prev => [transaction, ...prev]);
  }, []);

  const markNotificationRead = useCallback((id: string) => {
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }, []);

  const markAllNotificationsRead = useCallback(() => {
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);

  const addNotification = useCallback((notification: Notification) => {
    setNotifications(prev => [notification, ...prev]);
  }, []);

  const updateChallenge = useCallback((id: string, progress: number) => {
    setChallenges(prev => prev.map(c => c.id === id ? { ...c, progress: Math.min(progress, c.total) } : c));
  }, []);

  const updateZoneThreshold = useCallback((zone: string, updates: Partial<ZoneThreshold>) => {
    setZoneThresholds(prev => prev.map(t => t.zone === zone ? { ...t, ...updates, lastAdjusted: "Just now" } : t));
  }, []);

  const applyThresholdsFromCropPlan = useCallback((zone: string, cropType: string, season: string, growthStage: string) => {
    const presets = CROP_THRESHOLD_PRESETS[cropType];
    const seasonKey = season || getCurrentSeason();
    const preset = presets?.[seasonKey] || presets?.summer;
    if (preset) {
      setZoneThresholds(prev => prev.map(t => t.zone === zone ? {
        ...t, ...preset, zone, cropType, season: seasonKey as any, growthStage, lastAdjusted: "Just now", adjustedBy: "crop_plan"
      } : t));
      // Also adjust valve thresholds based on crop plan
      setValves(prev => prev.map(v => {
        if (v.zone !== zone) return v;
        const dur = preset.irrigationDuration || v.maxFlowRate;
        const freq = preset.irrigationFrequency || 2;
        return { ...v, dailyWaterLimit: dur * freq * 15, schedule: `${freq}x daily, ${dur} min each` };
      }));
      addNotification({
        id: `n-${Date.now()}`, title: "Thresholds Updated",
        message: `${zone} thresholds adjusted for ${cropType} (${seasonKey}, ${growthStage})`,
        type: "system", read: false, time: "Just now", actionUrl: "/smart-sensors"
      });
    }
  }, []);

  const completeChallenge = useCallback((id: string) => {
    setChallenges(prev => {
      const challenge = prev.find(c => c.id === id);
      if (challenge && !challenge.completed) {
        addXP(challenge.xpReward);
        addNotification({
          id: `n-${Date.now()}`, title: "Challenge Complete!", message: `${challenge.title} — +${challenge.xpReward} XP`,
          type: "reward", read: false, time: "Just now", actionUrl: "/rewards"
        });
      }
      return prev.map(c => c.id === id ? { ...c, completed: true, progress: c.total } : c);
    });
  }, []);

  return (
    <AppStateContext.Provider value={{
      user, sensors, valves, crops, products, orders, demand, deliveries,
      transactions, notifications, challenges, resources, zoneThresholds, unreadCount,
      updateUser, addXP, toggleValve, setValveAuto, updateSensor, addSensor,
      removeSensor, pairSensor, pairAllSensors, updateCrop, addCrop, updateProduct, addProduct,
      toggleProductListing, updateOrder, addOrder, matchDemand, updateDelivery,
      addTransaction, markNotificationRead, markAllNotificationsRead,
      addNotification, updateChallenge, completeChallenge,
      updateZoneThreshold, applyThresholdsFromCropPlan,
      getSensorAlerts, getZoneAlertCount, getSensorHistory, calibrateSensor,
      upgradePackage, hasFeature, getPackageInfo,
      startTrial, applyReferralCode, getReferralStats, isTrialExpired, trialDaysLeft,
    }}>
      {children}
    </AppStateContext.Provider>
  );
}

export function useAppState() {
  const ctx = useContext(AppStateContext);
  if (!ctx) throw new Error("useAppState must be used within AppStateProvider");
  return ctx;
}
