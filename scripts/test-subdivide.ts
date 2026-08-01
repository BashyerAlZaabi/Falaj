/**
 * اختبار قبول خوارزمية التقسيم (PROMPT §8):
 * مضلع غير منتظم + نسب [40,25,20,15] ← الناتج [40,25,20,15]
 * ومجموع الشرائح = المساحة الكلية بفرق < 1 م².
 * تشغيل: npx tsx scripts/test-subdivide.ts
 */
import { landArea, subdivide, type LatLng } from "../lib/geo/subdivide";

// مضلع غير منتظم قرب العين (٥ رؤوس، أضلاع غير متوازية)
const poly: LatLng[] = [
  { lat: 24.2201, lng: 55.744 },
  { lat: 24.2244, lng: 55.7462 },
  { lat: 24.2262, lng: 55.7513 },
  { lat: 24.2212, lng: 55.7541 },
  { lat: 24.2178, lng: 55.7488 },
];

const percents = [40, 25, 20, 15];
const total = landArea(poly);
const { slices, total_m2 } = subdivide(poly, percents);

const sum = slices.reduce((a, s) => a + s.area_m2, 0);
const ratios = slices.map((s) => (100 * s.area_m2) / total_m2);

console.log(`المساحة الكلية: ${total.toFixed(1)} م² (داخلياً ${total_m2.toFixed(1)})`);
console.log(`مجموع الشرائح: ${sum.toFixed(1)} م² · الفرق: ${Math.abs(sum - total_m2).toFixed(4)} م²`);
console.log(`النسب الناتجة: [${ratios.map((r) => r.toFixed(3)).join(", ")}]`);

let failed = false;
if (Math.abs(sum - total_m2) >= 1) {
  console.error("✗ فشل: فرق المجموع ≥ 1 م²");
  failed = true;
}
ratios.forEach((r, i) => {
  if (Math.abs(r - percents[i]) > 0.01) {
    console.error(`✗ فشل: الشريحة ${i + 1} نسبتها ${r.toFixed(3)} بدل ${percents[i]}`);
    failed = true;
  }
});

// حالة إضافية: تبديل المحاور (مضلع طولي) + نسبتان
const tall: LatLng[] = [
  { lat: 24.2, lng: 55.75 },
  { lat: 24.21, lng: 55.7512 },
  { lat: 24.2205, lng: 55.7508 },
  { lat: 24.2198, lng: 55.7495 },
  { lat: 24.209, lng: 55.7491 },
];
const r2 = subdivide(tall, [60, 40]);
const ratios2 = r2.slices.map((s) => (100 * s.area_m2) / r2.total_m2);
console.log(`مضلع طولي [60,40] ← [${ratios2.map((r) => r.toFixed(3)).join(", ")}]`);
if (Math.abs(ratios2[0] - 60) > 0.01 || Math.abs(ratios2[1] - 40) > 0.01) {
  console.error("✗ فشل: حالة تبديل المحاور");
  failed = true;
}

if (failed) process.exit(1);
console.log("✓ نجح اختبار القبول");
