/*
 * FALAJ Contact Support Page
 * Design: Desert Minimalism — contact form with support channels
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useState } from "react";
import {
  Phone, Mail, MessageCircle, MapPin, Clock,
  Send, Globe, ChevronRight
} from "lucide-react";

const supportChannels = [
  { icon: Phone, label: "Call Us", value: "+971 50 123 4567", color: "text-green-600 bg-green-50" },
  { icon: Mail, label: "Email", value: "support@falajae.com", color: "text-blue-600 bg-blue-50" },
  { icon: MessageCircle, label: "WhatsApp", value: "+971 50 123 4567", color: "text-emerald-600 bg-emerald-50" },
  { icon: Globe, label: "Website", value: "www.falajae.com", color: "text-violet-600 bg-violet-50" },
];

export default function ContactSupport() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) {
      toast.error("Please fill in all required fields");
      return;
    }
    toast.success("Message sent! We'll get back to you within 24 hours.");
    setName("");
    setEmail("");
    setSubject("");
    setMessage("");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Contact Support" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Support Image */}
        <div className="flex justify-center mb-4">
          <img
            src="https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/support-illustration-8JdGLjaLgVyVd7ArQtfskq.webp"
            alt="Support"
            className="w-24 h-24 object-contain"
          />
        </div>

        <p className="text-center text-sm text-muted-foreground mb-5">
          We're here to help! Reach out through any channel below or send us a message.
        </p>

        {/* Support Channels */}
        <div className="grid grid-cols-2 gap-2.5 mb-5">
          {supportChannels.map((channel) => {
            const Icon = channel.icon;
            const [iconColor, iconBg] = channel.color.split(" ");
            return (
              <div
                key={channel.label}
                className="bg-card rounded-2xl border border-border/50 p-3 hover:shadow-md transition-all duration-200 cursor-pointer"
              >
                <div className={`p-2 rounded-xl ${iconBg} w-fit mb-2`}>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <p className="text-xs font-semibold">{channel.label}</p>
                <p className="text-[10px] text-muted-foreground truncate">{channel.value}</p>
              </div>
            );
          })}
        </div>

        {/* Office Hours */}
        <div className="bg-card rounded-2xl border border-border/50 p-4 mb-5">
          <div className="flex items-center gap-2 mb-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">Office Hours</h3>
          </div>
          <div className="space-y-1">
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Sunday - Thursday</span>
              <span className="font-medium">8:00 AM - 5:00 PM</span>
            </div>
            <div className="flex justify-between text-xs">
              <span className="text-muted-foreground">Friday - Saturday</span>
              <span className="font-medium text-red-500">Closed</span>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">Send a Message</h3>
        <form onSubmit={handleSubmit} className="bg-card rounded-2xl border border-border/50 p-4 space-y-3">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Name *</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
              className="w-full px-3 py-2.5 bg-muted/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Email *</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="your@email.com"
              className="w-full px-3 py-2.5 bg-muted/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Subject</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="What's this about?"
              className="w-full px-3 py-2.5 bg-muted/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">Message *</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Describe your issue or question..."
              rows={4}
              className="w-full px-3 py-2.5 bg-muted/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 border border-transparent focus:border-primary/30 transition-all resize-none"
            />
          </div>
          <Button type="submit" className="w-full rounded-xl h-11 font-semibold">
            <Send className="w-4 h-4 mr-2" />
            Send Message
          </Button>
        </form>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
