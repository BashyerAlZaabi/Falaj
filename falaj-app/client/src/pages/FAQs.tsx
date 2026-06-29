/*
 * FALAJ FAQs Page
 * Design: Desert Minimalism — accordion-style FAQ list
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { useState } from "react";
import { ChevronDown, Search, HelpCircle } from "lucide-react";

const faqs = [
  {
    category: "Getting Started",
    items: [
      { q: "What is FALAJ?", a: "FALAJ is a smart irrigation system that uses IoT technology to optimize water usage in agriculture. Our sensors monitor soil moisture, temperature, humidity, and other parameters to help you make data-driven farming decisions." },
      { q: "How do I set up my first sensor?", a: "Simply unbox your FALAJ sensor, insert it into the soil at the desired depth, and power it on. The sensor will automatically connect to your FALAJ gateway and appear in your dashboard within 5 minutes." },
      { q: "What crops does FALAJ support?", a: "FALAJ supports over 70 types of crops commonly grown in the UAE and GCC region, including date palms, tomatoes, cucumbers, lettuce, herbs, and many more." },
    ],
  },
  {
    category: "Sensors & Hardware",
    items: [
      { q: "How long does the sensor battery last?", a: "With solar charging, FALAJ sensors can operate indefinitely in normal conditions. The backup battery lasts approximately 30 days without solar input." },
      { q: "Are the sensors waterproof?", a: "Yes, all FALAJ sensors are rated IP67, meaning they are fully protected against dust and can withstand temporary immersion in water." },
      { q: "What is the sensor range?", a: "Each sensor can communicate with the gateway up to 500 meters in open field conditions. For larger farms, additional gateways can be deployed." },
    ],
  },
  {
    category: "AI & Recommendations",
    items: [
      { q: "How accurate are the AI recommendations?", a: "Our AI model has been trained on extensive agricultural data from UAE farms and achieves over 90% accuracy in irrigation and crop management recommendations." },
      { q: "Can I customize AI settings?", a: "Yes, you can adjust AI sensitivity, notification preferences, and crop-specific parameters in the Settings page." },
    ],
  },
  {
    category: "Billing & Subscription",
    items: [
      { q: "What subscription plans are available?", a: "We offer Basic (free, up to 2 sensors), Pro (49 AED/month, up to 10 sensors), and Enterprise (custom pricing) plans." },
      { q: "Is there a free trial?", a: "Yes, all new users get a 30-day free trial of the Pro plan with full access to all features." },
    ],
  },
];

export default function FAQs() {
  const [openItems, setOpenItems] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");

  const toggleItem = (key: string) => {
    const next = new Set(openItems);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setOpenItems(next);
  };

  const filteredFaqs = searchQuery
    ? faqs.map(cat => ({
        ...cat,
        items: cat.items.filter(
          item =>
            item.q.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.a.toLowerCase().includes(searchQuery.toLowerCase())
        ),
      })).filter(cat => cat.items.length > 0)
    : faqs;

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="FAQs" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search FAQs..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-card rounded-2xl border border-border/50 text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary/50 transition-all"
          />
        </div>

        {/* FAQ Categories */}
        {filteredFaqs.map((category) => (
          <div key={category.category} className="mb-5">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-2.5">
              {category.category}
            </h3>
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
              {category.items.map((item, i) => {
                const key = `${category.category}-${i}`;
                const isOpen = openItems.has(key);
                return (
                  <div key={i} className={i < category.items.length - 1 ? "border-b border-border/30" : ""}>
                    <button
                      onClick={() => toggleItem(key)}
                      className="w-full flex items-center justify-between px-4 py-3.5 text-left hover:bg-muted/30 transition-colors"
                    >
                      <span className="text-sm font-medium pr-4">{item.q}</span>
                      <ChevronDown className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform duration-200 ${
                        isOpen ? "rotate-180" : ""
                      }`} />
                    </button>
                    {isOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        transition={{ duration: 0.2 }}
                        className="px-4 pb-3.5"
                      >
                        <p className="text-xs text-muted-foreground leading-relaxed">{item.a}</p>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {filteredFaqs.length === 0 && (
          <div className="text-center py-12">
            <HelpCircle className="w-12 h-12 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No FAQs found for "{searchQuery}"</p>
          </div>
        )}
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
