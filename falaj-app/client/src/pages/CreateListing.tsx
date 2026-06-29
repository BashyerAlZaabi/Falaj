/*
 * FALAJ Create Listing Page
 * Full listing creation with image upload, preview, and form
 * Design: Desert Minimalism
 */
import BottomNav from "@/components/BottomNav";
import FloatingAI from "@/components/FloatingAI";
import PageHeader from "@/components/PageHeader";
import { motion } from "framer-motion";
import { useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  Camera, Tag, Repeat, Package, FileText,
  MapPin, DollarSign, ImagePlus, X, Check, Plus
} from "lucide-react";
import { toast } from "sonner";

const categories = [
  "Produce", "Equipment", "Seeds & Plants", "Supplies",
  "Livestock", "Services", "Land & Facilities", "Other"
];

export default function CreateListing() {
  const [, setLocation] = useLocation();
  const [listingType, setListingType] = useState<"sell" | "trade">("sell");
  const [images, setImages] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "",
    price: "",
    tradeFor: "",
    location: "",
    quantity: "",
    unit: "kg",
    condition: "new",
    deliveryOption: "both",
  });

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach(file => {
      if (images.length >= 6) {
        toast.error("Maximum 6 images allowed");
        return;
      }
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setImages(prev => [...prev, ev.target!.result as string]);
          toast.success("Image added!");
        }
      };
      reader.readAsDataURL(file);
    });

    // Reset input so same file can be selected again
    e.target.value = "";
  };

  const removeImage = (index: number) => {
    setImages(prev => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!formData.title) {
      toast.error("Please enter a title");
      return;
    }
    if (!formData.category) {
      toast.error("Please select a category");
      return;
    }
    if (images.length === 0) {
      toast.error("Please add at least one photo");
      return;
    }
    if (listingType === "sell" && !formData.price) {
      toast.error("Please enter a price");
      return;
    }
    toast.success("Listing created successfully! It will appear in the marketplace shortly.");
    setLocation("/marketplace");
  };

  return (
    <div className="min-h-screen bg-background pb-24">
      <PageHeader title="Create Listing" />

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-[480px] mx-auto px-4 pt-4"
      >
        {/* Listing Type Toggle */}
        <div className="flex gap-2 mb-5">
          <button
            onClick={() => setListingType("sell")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
              listingType === "sell"
                ? "bg-primary text-white shadow-sm shadow-primary/20"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            <Tag className="w-4 h-4" />
            Sell
          </button>
          <button
            onClick={() => setListingType("trade")}
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all ${
              listingType === "trade"
                ? "bg-amber-500 text-white shadow-sm shadow-amber-500/20"
                : "bg-muted/50 text-muted-foreground"
            }`}
          >
            <Repeat className="w-4 h-4" />
            Trade
          </button>
        </div>

        {/* ═══════ PHOTO UPLOAD ═══════ */}
        <div className="mb-5">
          <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">
            Photos * <span className="normal-case font-normal">({images.length}/6)</span>
          </label>

          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            onChange={handleImageUpload}
            className="hidden"
          />

          <div className="flex flex-wrap gap-2">
            {/* Uploaded image previews */}
            {images.map((img, i) => (
              <div key={i} className="relative w-20 h-20 rounded-xl overflow-hidden border-2 border-border/50 group">
                <img src={img} alt={`Upload ${i + 1}`} className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(i)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
                {i === 0 && (
                  <span className="absolute bottom-0 left-0 right-0 bg-primary/80 text-white text-[8px] font-bold text-center py-0.5">
                    COVER
                  </span>
                )}
              </div>
            ))}

            {/* Add photo buttons */}
            {images.length < 6 && (
              <>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 bg-primary/5 border-2 border-dashed border-primary/30 rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-primary/10 transition-colors"
                >
                  <Camera className="w-5 h-5 text-primary" />
                  <span className="text-[9px] text-primary font-semibold">Photo</span>
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-20 h-20 bg-muted/50 border-2 border-dashed border-border rounded-xl flex flex-col items-center justify-center gap-1 hover:bg-muted transition-colors"
                >
                  <ImagePlus className="w-5 h-5 text-muted-foreground" />
                  <span className="text-[9px] text-muted-foreground">Gallery</span>
                </button>
              </>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground mt-1.5">First photo will be the cover image. Add up to 6 photos.</p>
        </div>

        {/* Form Fields */}
        <div className="space-y-4">
          {/* Title */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Title *
            </label>
            <input
              type="text"
              placeholder="e.g., Fresh Organic Tomatoes"
              value={formData.title}
              onChange={(e) => setFormData({ ...formData, title: e.target.value })}
              className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
            />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Description *
            </label>
            <textarea
              placeholder="Describe your product or service in detail — quality, origin, certifications, etc."
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              rows={4}
              className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20 resize-none"
            />
          </div>

          {/* Category */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Category *
            </label>
            <div className="flex flex-wrap gap-2">
              {categories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFormData({ ...formData, category: cat })}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    formData.category === cat
                      ? "bg-primary text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Condition */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Condition
            </label>
            <div className="flex gap-2">
              {["new", "like-new", "used"].map(c => (
                <button
                  key={c}
                  onClick={() => setFormData({ ...formData, condition: c })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                    formData.condition === c
                      ? "bg-primary text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {c === "like-new" ? "Like New" : c}
                </button>
              ))}
            </div>
          </div>

          {/* Price or Trade */}
          {listingType === "sell" ? (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Price (AED) *
              </label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm font-semibold text-muted-foreground">AED</span>
                <input
                  type="number"
                  placeholder="0.00"
                  value={formData.price}
                  onChange={(e) => setFormData({ ...formData, price: e.target.value })}
                  className="w-full pl-14 pr-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Trade For *
              </label>
              <input
                type="text"
                placeholder="What would you like in exchange?"
                value={formData.tradeFor}
                onChange={(e) => setFormData({ ...formData, tradeFor: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          )}

          {/* Quantity & Unit */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Quantity
              </label>
              <input
                type="text"
                placeholder="e.g., 50"
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                className="w-full px-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
            <div>
              <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
                Unit
              </label>
              <div className="flex gap-1.5">
                {["kg", "units", "box", "ton"].map(u => (
                  <button
                    key={u}
                    onClick={() => setFormData({ ...formData, unit: u })}
                    className={`flex-1 py-2.5 rounded-lg text-[10px] font-semibold uppercase transition-all ${
                      formData.unit === u ? "bg-primary text-white" : "bg-muted/50 text-muted-foreground"
                    }`}
                  >
                    {u}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Location */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Location
            </label>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Farm location or pickup point"
                value={formData.location}
                onChange={(e) => setFormData({ ...formData, location: e.target.value })}
                className="w-full pl-9 pr-4 py-2.5 bg-card border border-border/50 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/20"
              />
            </div>
          </div>

          {/* Delivery Options */}
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1.5 block">
              Delivery Options
            </label>
            <div className="flex gap-2">
              {[
                { key: "delivery", label: "Delivery" },
                { key: "pickup", label: "Pickup" },
                { key: "both", label: "Both" },
              ].map(opt => (
                <button
                  key={opt.key}
                  onClick={() => setFormData({ ...formData, deliveryOption: opt.key })}
                  className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all ${
                    formData.deliveryOption === opt.key
                      ? "bg-primary text-white"
                      : "bg-muted/50 text-muted-foreground hover:bg-muted"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Preview Card */}
        {(formData.title || images.length > 0) && (
          <div className="mt-6 mb-4">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Preview</h3>
            <div className="bg-card rounded-2xl border border-border/50 overflow-hidden">
              {images.length > 0 && (
                <img src={images[0]} alt="Preview" className="w-full h-40 object-cover" />
              )}
              <div className="p-3">
                <h4 className="text-sm font-bold">{formData.title || "Your listing title"}</h4>
                <p className="text-xs text-muted-foreground mt-0.5">
                  {formData.category || "Category"} · {formData.quantity ? `${formData.quantity} ${formData.unit}` : "Qty"}
                </p>
                <p className="text-sm font-bold text-primary mt-1">
                  {listingType === "sell"
                    ? formData.price ? `${formData.price} AED` : "Price"
                    : formData.tradeFor ? `Trade for: ${formData.tradeFor}` : "Trade offer"
                  }
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          className="w-full mt-4 mb-8 bg-gradient-to-r from-primary to-blue-600 text-white rounded-2xl py-3.5 text-sm font-bold hover:shadow-lg hover:shadow-primary/20 transition-all flex items-center justify-center gap-2"
        >
          <Check className="w-4 h-4" />
          {listingType === "sell" ? "Publish Listing" : "Post Trade Offer"}
        </button>
      </motion.div>

      <FloatingAI />
      <BottomNav />
    </div>
  );
}
