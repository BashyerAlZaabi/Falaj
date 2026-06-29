/*
 * FALAJ Community — Farmer community forum
 * Design: Desert Minimalism — social feed with posts, groups, events
 * Features: Create posts, join groups, attend events, discuss farming topics
 */
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useLocation, Link } from "wouter";
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import {
  ArrowLeft, Plus, Heart, MessageCircle, Share2, Bookmark,
  Users, Calendar, TrendingUp, Search, Image, MapPin,
  Award, Verified, MoreHorizontal, Send, ThumbsUp,
  Leaf, Droplets, Bug, Sun, Sprout, Filter
} from "lucide-react";

const FALAJ_LOGO_BLACK = "https://d2xsxph8kpxj0f.cloudfront.net/310519663369534371/YzyhT7oW72ZqXL5v7iMaru/Blacklogo-nobackground_15daed14.png";

const tabs = ["Feed", "Groups", "Events", "Trending"];

const posts = [
  {
    id: 1,
    author: "Ahmed Al Mazrouei",
    avatar: "AM",
    role: "Date Farm Owner",
    location: "Al Ain",
    verified: true,
    time: "2h ago",
    content: "Alhamdulillah! Our Khalas date palms are producing 20% more this season thanks to the FALAJ AI irrigation recommendations. The sensor data helped us optimize water usage perfectly. 🌴💧",
    image: "https://images.unsplash.com/photo-1509316975850-ff9c5deb0cd9?w=600&h=400&fit=crop",
    likes: 47,
    comments: 12,
    shares: 5,
    tags: ["dates", "irrigation", "success"],
    liked: false,
    saved: false,
  },
  {
    id: 2,
    author: "Fatima Al Dhaheri",
    avatar: "FD",
    role: "Organic Farmer",
    location: "Abu Dhabi",
    verified: true,
    time: "4h ago",
    content: "Has anyone tried companion planting with basil and tomatoes in the UAE climate? I'm seeing great results with pest reduction — almost 60% fewer whiteflies! Here's my setup 👇",
    image: "https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&h=400&fit=crop",
    likes: 32,
    comments: 24,
    shares: 8,
    tags: ["organic", "companion-planting", "pest-control"],
    liked: true,
    saved: false,
  },
  {
    id: 3,
    author: "Khalid Al Shamsi",
    avatar: "KS",
    role: "Greenhouse Manager",
    location: "Dubai",
    verified: false,
    time: "6h ago",
    content: "Question for the community: What's the best cooling system for greenhouses during summer? My current evaporative cooling isn't keeping up with 48°C outside temps. Budget around 15,000 AED. Any recommendations?",
    likes: 18,
    comments: 31,
    shares: 2,
    tags: ["greenhouse", "cooling", "question"],
    liked: false,
    saved: true,
  },
  {
    id: 4,
    author: "FALAJ AI Insights",
    avatar: "🤖",
    role: "AI Analysis",
    location: "UAE",
    verified: true,
    time: "8h ago",
    content: "📊 Weekly Market Trend: Organic vegetable prices are up 15% across UAE markets. Tomatoes, cucumbers, and bell peppers showing strongest demand. Farmers with organic certification can capitalize on this trend.\n\n🌱 Tip: Apply for ADAFSA organic certification through the FALAJ marketplace — processing time reduced to 2 weeks with our digital submission.",
    likes: 89,
    comments: 15,
    shares: 34,
    tags: ["market-trends", "organic", "ai-insight"],
    liked: false,
    saved: false,
  },
];

const groups = [
  { id: 1, name: "UAE Date Farmers", members: 1240, icon: "🌴", description: "Everything about date palm cultivation in the UAE", joined: true, posts: 156 },
  { id: 2, name: "Organic Farming UAE", members: 890, icon: "🌿", description: "Organic farming practices and certification", joined: true, posts: 98 },
  { id: 3, name: "Smart Irrigation", members: 654, icon: "💧", description: "IoT and AI-powered irrigation systems", joined: false, posts: 72 },
  { id: 4, name: "Greenhouse Growers", members: 432, icon: "🏡", description: "Indoor farming and greenhouse management", joined: false, posts: 45 },
  { id: 5, name: "Livestock & Poultry", members: 567, icon: "🐄", description: "Animal husbandry in UAE climate", joined: false, posts: 89 },
  { id: 6, name: "Agricultural Tech", members: 1100, icon: "🤖", description: "Latest ag-tech innovations and tools", joined: true, posts: 203 },
  { id: 7, name: "Pest & Disease Control", members: 345, icon: "🐛", description: "Identifying and managing crop pests", joined: false, posts: 67 },
  { id: 8, name: "Water Conservation", members: 780, icon: "♻️", description: "Sustainable water management practices", joined: true, posts: 134 },
];

const events = [
  { id: 1, title: "Abu Dhabi Agriculture Expo 2026", date: "Mar 25-27", location: "ADNEC, Abu Dhabi", attendees: 2400, type: "Conference", image: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=400&h=200&fit=crop", registered: false },
  { id: 2, title: "Smart Farming Workshop", date: "Mar 18", location: "HBMSU, Dubai", attendees: 85, type: "Workshop", image: "https://images.unsplash.com/photo-1524178232363-1fb2b075b655?w=400&h=200&fit=crop", registered: true },
  { id: 3, title: "Organic Certification Webinar", date: "Mar 15", location: "Online", attendees: 320, type: "Webinar", image: "https://images.unsplash.com/photo-1587614382346-4ec70e388b28?w=400&h=200&fit=crop", registered: false },
  { id: 4, title: "Date Harvest Festival", date: "Apr 5-7", location: "Al Ain Oasis", attendees: 5000, type: "Festival", image: "https://images.unsplash.com/photo-1464226184884-fa280b87c399?w=400&h=200&fit=crop", registered: false },
];

const trending = [
  { tag: "organic-farming", posts: 234, trend: "+45%" },
  { tag: "date-harvest-2026", posts: 189, trend: "+32%" },
  { tag: "smart-irrigation", posts: 156, trend: "+28%" },
  { tag: "pest-control", posts: 134, trend: "+22%" },
  { tag: "greenhouse-cooling", posts: 98, trend: "+18%" },
  { tag: "water-conservation", posts: 87, trend: "+15%" },
  { tag: "soil-health", posts: 76, trend: "+12%" },
  { tag: "market-prices", posts: 65, trend: "+10%" },
];

export default function Community() {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("Feed");
  const [postLikes, setPostLikes] = useState<Record<number, boolean>>(
    Object.fromEntries(posts.map(p => [p.id, p.liked]))
  );
  const [postSaves, setPostSaves] = useState<Record<number, boolean>>(
    Object.fromEntries(posts.map(p => [p.id, p.saved]))
  );
  const [joinedGroups, setJoinedGroups] = useState<Record<number, boolean>>(
    Object.fromEntries(groups.map(g => [g.id, g.joined]))
  );
  const [registeredEvents, setRegisteredEvents] = useState<Record<number, boolean>>(
    Object.fromEntries(events.map(e => [e.id, e.registered]))
  );
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPostText, setNewPostText] = useState("");

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-xl border-b border-border/40 shadow-sm">
        <div className="max-w-[480px] mx-auto flex items-center gap-3 px-4 py-3">
          <button onClick={() => setLocation("/dashboard")} className="p-2 -ml-2 rounded-xl hover:bg-muted transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Community</h1>
            <p className="text-[10px] text-muted-foreground">3,400+ farmers connected</p>
          </div>
          <button className="p-2 rounded-xl hover:bg-muted transition-colors">
            <Search className="w-5 h-5 text-muted-foreground" />
          </button>
          <button
            onClick={() => setShowCreatePost(true)}
            className="p-2 bg-primary text-white rounded-xl hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="max-w-[480px] mx-auto flex px-4 gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2.5 text-xs font-semibold text-center transition-all relative ${
                activeTab === tab ? "text-primary" : "text-muted-foreground"
              }`}
            >
              {tab}
              {activeTab === tab && (
                <motion.div
                  layoutId="communityTab"
                  className="absolute bottom-0 left-2 right-2 h-0.5 bg-primary rounded-full"
                />
              )}
            </button>
          ))}
        </div>
      </header>

      <div className="max-w-[480px] mx-auto px-4 pt-4">
        {/* Create Post Modal */}
        <AnimatePresence>
          {showCreatePost && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50"
                onClick={() => setShowCreatePost(false)}
              />
              <motion.div
                initial={{ opacity: 0, y: 100 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 100 }}
                className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl p-5 max-w-[480px] mx-auto"
              >
                <div className="w-10 h-1 bg-muted rounded-full mx-auto mb-4" />
                <h3 className="text-base font-bold mb-3">Create Post</h3>
                <textarea
                  value={newPostText}
                  onChange={(e) => setNewPostText(e.target.value)}
                  placeholder="Share your farming experience, ask questions, or post tips..."
                  className="w-full h-32 p-3 bg-muted/50 rounded-xl text-sm outline-none resize-none border border-border/50 focus:border-primary/30"
                />
                <div className="flex items-center gap-2 mt-3">
                  <button className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <Image className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <button className="p-2 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                    <MapPin className="w-5 h-5 text-muted-foreground" />
                  </button>
                  <div className="flex-1" />
                  <button
                    onClick={() => { setShowCreatePost(false); setNewPostText(""); }}
                    className="px-4 py-2 text-sm font-medium text-muted-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { setShowCreatePost(false); setNewPostText(""); }}
                    className="px-5 py-2 bg-primary text-white text-sm font-semibold rounded-xl"
                  >
                    Post
                  </button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>

        {/* Feed Tab */}
        {activeTab === "Feed" && (
          <div className="space-y-4">
            {posts.map((post) => (
              <motion.div
                key={post.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-2xl border border-border/50 overflow-hidden"
              >
                {/* Post Header */}
                <div className="flex items-center gap-3 p-4 pb-2">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold ${
                    post.avatar === "🤖" ? "bg-emerald-100 text-lg" : "bg-primary/10 text-primary"
                  }`}>
                    {post.avatar}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-bold truncate">{post.author}</span>
                      {post.verified && <Verified className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                      <span>{post.role}</span>
                      <span>·</span>
                      <MapPin className="w-2.5 h-2.5" />
                      <span>{post.location}</span>
                      <span>·</span>
                      <span>{post.time}</span>
                    </div>
                  </div>
                  <button className="p-1.5 rounded-lg hover:bg-muted transition-colors">
                    <MoreHorizontal className="w-4 h-4 text-muted-foreground" />
                  </button>
                </div>

                {/* Post Content */}
                <div className="px-4 pb-3">
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">{post.content}</p>
                  {post.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {post.tags.map((tag) => (
                        <span key={tag} className="text-[10px] font-medium text-primary bg-primary/5 px-2 py-0.5 rounded-full">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Post Image */}
                {post.image && (
                  <img src={post.image} alt="" className="w-full h-48 object-cover" />
                )}

                {/* Post Actions */}
                <div className="flex items-center justify-between px-4 py-3 border-t border-border/30">
                  <button
                    onClick={() => setPostLikes(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                      postLikes[post.id] ? "text-red-500" : "text-muted-foreground"
                    }`}
                  >
                    <Heart className={`w-4 h-4 ${postLikes[post.id] ? "fill-red-500" : ""}`} />
                    {post.likes + (postLikes[post.id] && !post.liked ? 1 : 0)}
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <MessageCircle className="w-4 h-4" />
                    {post.comments}
                  </button>
                  <button className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Share2 className="w-4 h-4" />
                    {post.shares}
                  </button>
                  <button
                    onClick={() => setPostSaves(prev => ({ ...prev, [post.id]: !prev[post.id] }))}
                    className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
                      postSaves[post.id] ? "text-primary" : "text-muted-foreground"
                    }`}
                  >
                    <Bookmark className={`w-4 h-4 ${postSaves[post.id] ? "fill-primary" : ""}`} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Groups Tab */}
        {activeTab === "Groups" && (
          <div className="space-y-3">
            <div className="flex items-center gap-2 mb-2">
              <div className="flex-1 flex items-center gap-2 bg-muted/50 rounded-xl px-3 py-2.5 border border-border/50">
                <Search className="w-4 h-4 text-muted-foreground" />
                <input type="text" placeholder="Search groups..." className="flex-1 bg-transparent text-sm outline-none" />
              </div>
            </div>
            {groups.map((group) => (
              <motion.div
                key={group.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-2xl border border-border/50 p-4 flex items-center gap-3"
              >
                <div className="w-12 h-12 rounded-xl bg-muted/50 flex items-center justify-center text-2xl">
                  {group.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold truncate">{group.name}</h4>
                  <p className="text-[10px] text-muted-foreground truncate">{group.description}</p>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-[10px] text-muted-foreground flex items-center gap-0.5">
                      <Users className="w-2.5 h-2.5" /> {group.members.toLocaleString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">·</span>
                    <span className="text-[10px] text-muted-foreground">{group.posts} posts</span>
                  </div>
                </div>
                <button
                  onClick={() => setJoinedGroups(prev => ({ ...prev, [group.id]: !prev[group.id] }))}
                  className={`px-4 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                    joinedGroups[group.id]
                      ? "bg-muted text-muted-foreground"
                      : "bg-primary text-white"
                  }`}
                >
                  {joinedGroups[group.id] ? "Joined" : "Join"}
                </button>
              </motion.div>
            ))}
          </div>
        )}

        {/* Events Tab */}
        {activeTab === "Events" && (
          <div className="space-y-3">
            {events.map((event) => (
              <motion.div
                key={event.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-card rounded-2xl border border-border/50 overflow-hidden"
              >
                <div className="relative">
                  <img src={event.image} alt={event.title} className="w-full h-36 object-cover" />
                  <span className="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-[10px] font-bold px-2.5 py-1 rounded-lg">
                    {event.type}
                  </span>
                </div>
                <div className="p-4">
                  <h4 className="text-sm font-bold mb-1">{event.title}</h4>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground mb-3">
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" /> {event.date}
                    </span>
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3 h-3" /> {event.location}
                    </span>
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" /> {event.attendees.toLocaleString()}
                    </span>
                  </div>
                  <button
                    onClick={() => setRegisteredEvents(prev => ({ ...prev, [event.id]: !prev[event.id] }))}
                    className={`w-full py-2.5 rounded-xl text-xs font-semibold transition-all ${
                      registeredEvents[event.id]
                        ? "bg-green-50 text-green-700 border border-green-200"
                        : "bg-primary text-white"
                    }`}
                  >
                    {registeredEvents[event.id] ? "✓ Registered" : "Register Now"}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}

        {/* Trending Tab */}
        {activeTab === "Trending" && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground mb-3">Trending topics in UAE farming community this week</p>
            {trending.map((item, i) => (
              <motion.div
                key={item.tag}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                className="flex items-center gap-3 p-3.5 bg-card rounded-xl border border-border/50 hover:shadow-md transition-all"
              >
                <span className="text-lg font-bold text-muted-foreground/40 w-6 text-center">{i + 1}</span>
                <div className="flex-1">
                  <p className="text-sm font-bold text-primary">#{item.tag}</p>
                  <p className="text-[10px] text-muted-foreground">{item.posts} posts</p>
                </div>
                <span className="text-xs font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center gap-0.5">
                  <TrendingUp className="w-3 h-3" /> {item.trend}
                </span>
              </motion.div>
            ))}
          </div>
        )}
      </div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
