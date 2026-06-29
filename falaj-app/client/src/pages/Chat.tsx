/*
 * FALAJ In-App Messaging / Chat
 * Buyer-seller communication for orders and trade negotiations
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion, AnimatePresence } from "framer-motion";
import { useState } from "react";
import {
  Send, Search, MessageSquare, Image, Paperclip,
  Check, CheckCheck, Clock, ArrowLeft, Phone, MoreVertical
} from "lucide-react";

interface Message {
  id: number;
  text: string;
  sender: "me" | "other";
  time: string;
  read: boolean;
}

interface Conversation {
  id: number;
  name: string;
  avatar: string;
  lastMessage: string;
  time: string;
  unread: number;
  online: boolean;
  role: string;
}

const conversations: Conversation[] = [
  {
    id: 1,
    name: "Ahmed Al Mazrouei",
    avatar: "AM",
    lastMessage: "The organic dates are ready for pickup",
    time: "2m ago",
    unread: 3,
    online: true,
    role: "Seller",
  },
  {
    id: 2,
    name: "Desert Express Logistics",
    avatar: "DE",
    lastMessage: "Your shipment has been dispatched",
    time: "15m ago",
    unread: 1,
    online: true,
    role: "Transport",
  },
  {
    id: 3,
    name: "Fatima Al Dhaheri",
    avatar: "FD",
    lastMessage: "Can you do 500 AED for the batch?",
    time: "1h ago",
    unread: 0,
    online: false,
    role: "Buyer",
  },
  {
    id: 4,
    name: "Green Pack Solutions",
    avatar: "GP",
    lastMessage: "Packaging quote attached for 200 units",
    time: "3h ago",
    unread: 0,
    online: false,
    role: "Packaging",
  },
  {
    id: 5,
    name: "Khalid Farm Supplies",
    avatar: "KF",
    lastMessage: "New sensor kits available this week",
    time: "Yesterday",
    unread: 0,
    online: false,
    role: "Supplier",
  },
];

const sampleMessages: Message[] = [
  { id: 1, text: "Assalamu alaikum! I'm interested in the organic dates you listed.", sender: "other", time: "10:30 AM", read: true },
  { id: 2, text: "Wa alaikum assalam! Yes, we have 200kg available. Premium Khalas variety.", sender: "me", time: "10:32 AM", read: true },
  { id: 3, text: "What's the price per kg?", sender: "other", time: "10:33 AM", read: true },
  { id: 4, text: "45 AED/kg for bulk orders over 50kg. We can also arrange packaging and delivery.", sender: "me", time: "10:35 AM", read: true },
  { id: 5, text: "That sounds good. Can I get a sample first?", sender: "other", time: "10:38 AM", read: true },
  { id: 6, text: "Of course! I'll prepare a 2kg sample box. Where should I send it?", sender: "me", time: "10:40 AM", read: true },
  { id: 7, text: "The organic dates are ready for pickup", sender: "other", time: "11:02 AM", read: false },
];

export default function Chat() {
  const [activeChat, setActiveChat] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>(sampleMessages);
  const [newMessage, setNewMessage] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredConversations = conversations.filter(c =>
    c.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSend = () => {
    if (!newMessage.trim()) return;
    const msg: Message = {
      id: messages.length + 1,
      text: newMessage,
      sender: "me",
      time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      read: false,
    };
    setMessages([...messages, msg]);
    setNewMessage("");
  };

  if (activeChat) {
    return (
      <div className="min-h-screen bg-background flex flex-col">
        {/* Chat Header */}
        <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-border/50 shadow-sm">
          <div className="max-w-[480px] mx-auto flex items-center gap-3 px-4 py-3">
            <button
              onClick={() => setActiveChat(null)}
              className="p-1.5 -ml-1.5 rounded-xl hover:bg-muted transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white ${
              activeChat.online ? "bg-green-500" : "bg-slate-400"
            }`}>
              {activeChat.avatar}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold">{activeChat.name}</p>
              <p className="text-[10px] text-muted-foreground">
                {activeChat.online ? "Online" : "Last seen recently"} · {activeChat.role}
              </p>
            </div>
            <button className="p-2 rounded-xl hover:bg-muted transition-colors">
              <Phone className="w-4 h-4 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-xl hover:bg-muted transition-colors">
              <MoreVertical className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </header>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-4 py-4 max-w-[480px] mx-auto w-full">
          <div className="space-y-3">
            {messages.map((msg) => (
              <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex ${msg.sender === "me" ? "justify-end" : "justify-start"}`}
              >
                <div className={`max-w-[75%] px-3.5 py-2.5 rounded-2xl ${
                  msg.sender === "me"
                    ? "bg-primary text-white rounded-br-md"
                    : "bg-card border border-border/50 rounded-bl-md"
                }`}>
                  <p className="text-sm leading-relaxed">{msg.text}</p>
                  <div className={`flex items-center gap-1 mt-1 ${
                    msg.sender === "me" ? "justify-end" : ""
                  }`}>
                    <span className={`text-[9px] ${
                      msg.sender === "me" ? "text-white/60" : "text-muted-foreground"
                    }`}>{msg.time}</span>
                    {msg.sender === "me" && (
                      msg.read
                        ? <CheckCheck className="w-3 h-3 text-white/60" />
                        : <Check className="w-3 h-3 text-white/60" />
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Message Input */}
        <div className="sticky bottom-0 bg-white border-t border-border/50 shadow-[0_-2px_10px_rgba(0,0,0,0.04)]">
          <div className="max-w-[480px] mx-auto flex items-center gap-2 px-4 py-3">
            <button className="p-2 rounded-xl hover:bg-muted transition-colors">
              <Paperclip className="w-5 h-5 text-muted-foreground" />
            </button>
            <button className="p-2 rounded-xl hover:bg-muted transition-colors">
              <Image className="w-5 h-5 text-muted-foreground" />
            </button>
            <input
              type="text"
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="flex-1 bg-muted/50 rounded-xl px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
            />
            <button
              onClick={handleSend}
              disabled={!newMessage.trim()}
              className="p-2.5 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-40"
            >
              <Send className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Messages" rightAction={
        <div className="p-2 rounded-xl bg-primary/10">
          <MessageSquare className="w-4 h-4 text-primary" />
        </div>
      } />

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Search */}
        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search conversations..."
            className="w-full bg-muted/50 rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-primary/20 transition-all"
          />
        </div>

        {/* Conversations */}
        <div className="space-y-1">
          {filteredConversations.map((conv, i) => (
            <motion.button
              key={conv.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.04 }}
              onClick={() => setActiveChat(conv)}
              className="w-full flex items-center gap-3 p-3 rounded-2xl hover:bg-muted/50 transition-all duration-200"
            >
              <div className="relative">
                <div className={`w-11 h-11 rounded-full flex items-center justify-center text-sm font-bold text-white ${
                  conv.online ? "bg-primary" : "bg-slate-400"
                }`}>
                  {conv.avatar}
                </div>
                {conv.online && (
                  <span className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 border-2 border-white rounded-full" />
                )}
              </div>
              <div className="flex-1 min-w-0 text-left">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold truncate">{conv.name}</p>
                  <span className="text-[10px] text-muted-foreground ml-2 shrink-0">{conv.time}</span>
                </div>
                <div className="flex items-center justify-between mt-0.5">
                  <p className="text-xs text-muted-foreground truncate">{conv.lastMessage}</p>
                  {conv.unread > 0 && (
                    <span className="ml-2 shrink-0 w-5 h-5 bg-primary text-white text-[10px] font-bold rounded-full flex items-center justify-center">
                      {conv.unread}
                    </span>
                  )}
                </div>
                <span className="text-[9px] text-muted-foreground/60 font-medium">{conv.role}</span>
              </div>
            </motion.button>
          ))}
        </div>
      </div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
