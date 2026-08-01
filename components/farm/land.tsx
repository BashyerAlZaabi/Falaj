"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Map as LeafletMap, LayerGroup, Marker } from "leaflet";
import { useFarm } from "./use-farm";
import { uid, type LandPoint } from "@/lib/farm/data";
import { landArea, subdivide, type Slice } from "@/lib/geo/subdivide";
import { useToast } from "@/components/ui/toast";
import { Note } from "@/components/ui/note";
import { SkeletonCard } from "@/components/ui/skeleton";

/**
 * قسم «الأرض» (المرحلة ٦): خريطة Leaflet، نقاط قابلة للسحب، الضغط على
 * نقطة يشيلها مع تراجع، أي تعديل يلغي التقسيم القديم، ثم التقسيم بالنسب
 * والحفظ كقطع. invalidateSize() بعد الحقن (PROMPT §11).
 */

const SLICE_COLORS = ["#FAA317", "#3F51B5", "#51B53F", "#FC532E", "#683FB5", "#F67707"];
const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });

export function LandSection() {
  const { farm, loading, mutate } = useFarm();
  const toast = useToast();

  const mapEl = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const sliceLayerRef = useRef<LayerGroup | null>(null);
  const pointsRef = useRef<LandPoint[]>([]);

  const [points, setPoints] = useState<LandPoint[]>([]);
  const [slices, setSlices] = useState<Slice[]>([]);
  const [percentText, setPercentText] = useState("40,25,20,15");
  const [ready, setReady] = useState(false);

  // مزامنة أولية من بيانات المزرعة
  useEffect(() => {
    if (!loading) setPoints(farm.land);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    pointsRef.current = points;
  }, [points]);

  const persist = useCallback(
    (next: LandPoint[]) => {
      void mutate((d) => {
        d.land = next;
      });
    },
    [mutate],
  );

  /** أي تعديل على الشكل يلغي التقسيم القديم. */
  const changeShape = useCallback(
    (next: LandPoint[]) => {
      setPoints(next);
      setSlices([]);
      sliceLayerRef.current?.clearLayers();
      persist(next);
    },
    [persist],
  );

  // تهيئة الخريطة
  useEffect(() => {
    if (loading || !mapEl.current || mapRef.current) return;
    let cancelled = false;

    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !mapEl.current) return;

      const map = L.map(mapEl.current, { zoomControl: true }).setView(
        farm.land.length ? [farm.land[0].lat, farm.land[0].lng] : [24.22, 55.75],
        farm.land.length ? 16 : 9,
      );

      L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
        { attribution: "Esri — World Imagery", maxZoom: 19 },
      ).addTo(map);

      layerRef.current = L.layerGroup().addTo(map);
      sliceLayerRef.current = L.layerGroup().addTo(map);

      map.on("click", (e) => {
        const next = [...pointsRef.current, { lat: e.latlng.lat, lng: e.latlng.lng }];
        changeShape(next);
      });

      mapRef.current = map;
      // invalidateSize بعد أي حقن لحاوية Leaflet
      setTimeout(() => map.invalidateSize(), 50);
      setReady(true);
    })();

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  // رسم النقاط والمضلع عند كل تغيير
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const layer = layerRef.current;
      if (!layer) return;
      layer.clearLayers();

      points.forEach((p, i) => {
        const marker: Marker = L.marker([p.lat, p.lng], {
          draggable: true,
          icon: L.divIcon({
            className: "",
            html: `<div style="width:14px;height:14px;border-radius:50%;background:#FAA317;border:2px solid #161038;box-shadow:0 1px 4px rgba(0,0,0,.4)"></div>`,
            iconSize: [14, 14],
            iconAnchor: [7, 7],
          }),
          keyboard: false,
        });
        marker.on("dragend", () => {
          const ll = marker.getLatLng();
          const next = pointsRef.current.map((q, j) =>
            j === i ? { lat: ll.lat, lng: ll.lng } : q,
          );
          changeShape(next);
        });
        marker.on("click", () => {
          const removed = pointsRef.current[i];
          const next = pointsRef.current.filter((_, j) => j !== i);
          changeShape(next);
          toast({
            message: "انحذفت النقطة",
            undoLabel: "تراجع",
            onUndo: () => {
              const restored = [...pointsRef.current];
              restored.splice(i, 0, removed);
              changeShape(restored);
            },
          });
        });
        marker.addTo(layer);
      });

      if (points.length >= 3) {
        L.polygon(
          points.map((p) => [p.lat, p.lng]),
          { color: "#161038", weight: 2, fillColor: "#FAA317", fillOpacity: 0.12 },
        ).addTo(layer);
      }
    })();
  }, [points, ready, changeShape, toast]);

  // رسم الشرائح
  useEffect(() => {
    if (!ready) return;
    (async () => {
      const L = (await import("leaflet")).default;
      const layer = sliceLayerRef.current;
      if (!layer) return;
      layer.clearLayers();
      slices.forEach((s, i) => {
        L.polygon(
          s.points.map((p) => [p.lat, p.lng]),
          {
            color: "#161038",
            weight: 1.5,
            fillColor: SLICE_COLORS[i % SLICE_COLORS.length],
            fillOpacity: 0.45,
          },
        ).addTo(layer);
      });
    })();
  }, [slices, ready]);

  if (loading) return <SkeletonCard />;

  const area = landArea(points);
  const percents = percentText
    .split(/[،,\s]+/)
    .map((x) => Number(x))
    .filter((x) => x > 0);
  const percentsOk = percents.length >= 2 && Math.abs(percents.reduce((a, b) => a + b, 0) - 100) < 0.01;

  function doSubdivide() {
    const r = subdivide(points, percents);
    setSlices(r.slices);
  }

  async function saveAsPlots() {
    const base = farm.plots.length;
    await mutate((d) => {
      slices.forEach((s, i) => {
        d.plots.push({ id: uid(), name: `قطعة ${base + i + 1}`, area_m2: Math.round(s.area_m2) });
      });
    });
    toast({ message: `انحفظت ${slices.length} قطع من التقسيم` });
  }

  return (
    <div className="space-y-4">
      <p className="subtle text-sm">
        اضغط على الخريطة لإضافة نقاط حدود أرضك — اسحب النقطة لتعديلها، واضغط عليها لحذفها.
      </p>

      <div
        ref={mapEl}
        role="application"
        aria-label="خريطة الأرض"
        className="h-72 w-full overflow-hidden rounded-lg border border-ink-24 shadow-sm"
      />

      {points.length >= 3 ? (
        <div className="rounded-lg bg-white p-4 shadow-sm">
          <p className="text-sm text-ink">
            مساحة الأرض: <b dir="ltr">{fmt.format(area)}</b> م²
            <span className="text-ink-45"> · {points.length} نقاط</span>
          </p>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label htmlFor="percents" className="text-xs font-medium text-ink-45">
              نسب التقسيم ٪
            </label>
            <input
              id="percents"
              value={percentText}
              onChange={(e) => setPercentText(e.target.value)}
              dir="ltr"
              className="w-40 rounded-md border border-ink-24 bg-white px-3 py-2 text-sm text-ink outline-none focus:border-falaj focus:ring-2 focus:ring-falaj/20"
            />
            <button
              type="button"
              disabled={!percentsOk}
              onClick={doSubdivide}
              className="rounded-full bg-falaj px-4 py-2 text-sm font-semibold text-ink transition-colors duration-200 ease-e hover:bg-falaj-d disabled:opacity-50"
            >
              قسّم
            </button>
            {!percentsOk && percentText.trim() && (
              <span className="text-xs text-rust">المجموع لازم يكون 100</span>
            )}
          </div>

          {slices.length > 0 && (
            <div className="mt-3 space-y-2" aria-live="polite">
              <ul className="space-y-1 text-sm">
                {slices.map((s, i) => (
                  <li key={i} className="flex items-center gap-2">
                    <span
                      aria-hidden="true"
                      className="inline-block h-3 w-3 rounded-sm"
                      style={{ background: SLICE_COLORS[i % SLICE_COLORS.length] }}
                    />
                    شريحة {i + 1}: <b dir="ltr">{fmt.format(s.area_m2)}</b> م² (
                    <span dir="ltr">{((100 * s.area_m2) / (area || 1)).toFixed(1)}٪</span>)
                  </li>
                ))}
              </ul>
              <button
                type="button"
                onClick={saveAsPlots}
                className="rounded-full bg-abyss-2 px-4 py-2 text-sm font-semibold text-white transition-opacity duration-200 ease-e hover:opacity-90"
              >
                احفظها كقطع
              </button>
            </div>
          )}
        </div>
      ) : (
        <Note>حط ٣ نقاط على الأقل عشان يترسم شكل أرضك وتقدر تقسّمها.</Note>
      )}
    </div>
  );
}
