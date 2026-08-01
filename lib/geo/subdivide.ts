/**
 * خوارزمية تقسيم الأرض — منقولة بدقة من PROMPT §8:
 * 1) إسقاط مستوٍ حول أول نقطة    2) المساحة بـ shoelace
 * 3) تبديل المحاور لو الارتفاع أطول  4) بحث ثنائي (44 تكراراً) عن خط القص
 * 5) قص Sutherland–Hodgman على مستوٍ رأسي  6) إرجاع الإحداثيات
 *
 * اختبار القبول: نسب [40,25,20,15] على مضلع غير منتظم تعطي النسب نفسها
 * ومجموع الشرائح = المساحة الكلية بفرق < 1 م². (scripts/test-subdivide.ts)
 */

export type LatLng = { lat: number; lng: number };
type Pt = [number, number];

const R = 6378137;
const D2R = Math.PI / 180;

function project(points: LatLng[]): { pts: Pt[]; lat0: number; lng0: number } {
  const { lat: lat0, lng: lng0 } = points[0];
  const cos = Math.cos(lat0 * D2R);
  const pts: Pt[] = points.map((p) => [
    (p.lng - lng0) * D2R * R * cos,
    (p.lat - lat0) * D2R * R,
  ]);
  return { pts, lat0, lng0 };
}

function unproject(pt: Pt, lat0: number, lng0: number): LatLng {
  const cos = Math.cos(lat0 * D2R);
  return {
    lng: pt[0] / (D2R * R * cos) + lng0,
    lat: pt[1] / (D2R * R) + lat0,
  };
}

/** مساحة مضلع بالمتر المربع (shoelace، قيمة مطلقة). */
export function polygonArea(pts: Pt[]): number {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return Math.abs(a) / 2;
}

/** مساحة أرض من إحداثيات جغرافية. */
export function landArea(points: LatLng[]): number {
  if (points.length < 3) return 0;
  return polygonArea(project(points).pts);
}

/** قص Sutherland–Hodgman على مستوى رأسي: يبقي النقاط حيث keepLeft ? x<=cut : x>=cut */
function clipVertical(pts: Pt[], cut: number, keepLeft: boolean): Pt[] {
  const out: Pt[] = [];
  const inside = (p: Pt) => (keepLeft ? p[0] <= cut : p[0] >= cut);
  for (let i = 0; i < pts.length; i++) {
    const cur = pts[i];
    const prev = pts[(i + pts.length - 1) % pts.length];
    const curIn = inside(cur);
    const prevIn = inside(prev);
    if (curIn) {
      if (!prevIn) out.push(intersectX(prev, cur, cut));
      out.push(cur);
    } else if (prevIn) {
      out.push(intersectX(prev, cur, cut));
    }
  }
  return out;
}

function intersectX(a: Pt, b: Pt, x: number): Pt {
  const t = (x - a[0]) / (b[0] - a[0]);
  return [x, a[1] + t * (b[1] - a[1])];
}

export type Slice = { points: LatLng[]; area_m2: number };

export type SubdivideResult = {
  slices: Slice[];
  total_m2: number;
};

/**
 * يقسم المضلع إلى شرائح بنسب مئوية (مجموعها 100).
 * الشرائح تتبع حدود الأرض الحقيقية لا المستطيل المحيط.
 */
export function subdivide(points: LatLng[], percents: number[]): SubdivideResult {
  if (points.length < 3) return { slices: [], total_m2: 0 };

  const { pts: raw, lat0, lng0 } = project(points);

  // 3) لو ارتفاع الـ bbox أطول من عرضه بدّل المحاور عشان القص يمشي على الأطول
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const w = Math.max(...xs) - Math.min(...xs);
  const h = Math.max(...ys) - Math.min(...ys);
  const swapped = h > w;
  const pts: Pt[] = swapped ? raw.map(([x, y]) => [y, x]) : raw;

  const total = polygonArea(pts);
  const minX = Math.min(...pts.map((p) => p[0]));
  const maxX = Math.max(...pts.map((p) => p[0]));

  const slices: Slice[] = [];
  let prevCut = minX;
  let cumulative = 0;

  for (let s = 0; s < percents.length; s++) {
    const isLast = s === percents.length - 1;
    cumulative += percents[s];
    let cut = maxX;

    if (!isLast) {
      // 4) بحث ثنائي (44 تكراراً) عن x بحيث مساحة يسار القص = التراكمي المطلوب
      const target = (total * cumulative) / 100;
      let lo = minX;
      let hi = maxX;
      for (let i = 0; i < 44; i++) {
        cut = (lo + hi) / 2;
        const a = polygonArea(clipVertical(pts, cut, true));
        if (a < target) lo = cut;
        else hi = cut;
      }
    }

    // 5) الشريحة: قص بين خط القص السابق والحالي
    let piece = clipVertical(pts, prevCut, false);
    if (!isLast) piece = clipVertical(piece, cut, true);

    const area = polygonArea(piece);
    const restored: Pt[] = swapped ? piece.map(([x, y]) => [y, x]) : piece;
    slices.push({
      points: restored.map((p) => unproject(p, lat0, lng0)),
      area_m2: area,
    });
    prevCut = cut;
  }

  return { slices, total_m2: total };
}
