/* ===== FALAJ — demo farm data served by the MCP server =====
   Mirrors app/js/data.js so the assistant and the app talk about the same farm.
   Kept in memory: irrigation started through the MCP tools raises zone moisture
   for as long as the server process runs. Swap these functions for real IoT /
   database calls when the sensors are online. */

export const MOIST_MIN = 40;

const zones = [
  { id: 'Z1', crop: 'tomato', moisture: 26, temp: 34, humidity: 38, ph: 6.4, n: 55, p: 40, k: 48, device: 'FLJ-001' },
  { id: 'Z2', crop: 'dates',  moisture: 63, temp: 33, humidity: 45, ph: 7.0, n: 70, p: 58, k: 62, device: null },
  { id: 'Z3', crop: 'wheat',  moisture: 57, temp: 35, humidity: 41, ph: 6.8, n: 64, p: 55, k: 60, device: 'FLJ-002' },
  { id: 'Z4', crop: 'maize',  moisture: 21, temp: 36, humidity: 30, ph: 5.8, n: 48, p: 40, k: 45, device: 'FLJ-004' },
  { id: 'Z5', crop: 'potato', moisture: 70, temp: 32, humidity: 50, ph: 7.1, n: 75, p: 65, k: 68, device: null },
  { id: 'Z6', crop: 'tomato', moisture: 48, temp: 34, humidity: 44, ph: 6.9, n: 60, p: 52, k: 58, device: 'FLJ-005' },
];

const fields = [
  { id: 'f1', name: 'Al Ain Grove', crop: 'dates',  hectares: 296, waterLevel: 75, expenseAED: 12500, revenueAED: 25000, health: 'good', planting: '2024-01-12', harvestInMonths: 4 },
  { id: 'f2', name: 'Tomato Field', crop: 'tomato', hectares: 42,  waterLevel: 10, expenseAED: 2500,  revenueAED: 0,     health: 'fair', planting: '2025-03-03', harvestInMonths: 2 },
  { id: 'f3', name: 'Maize Field',  crop: 'maize',  hectares: 120, waterLevel: 85, expenseAED: 6000,  revenueAED: 4000,  health: 'good', planting: '2025-02-01', harvestInMonths: 3 },
  { id: 'f4', name: 'Wheat Field',  crop: 'wheat',  hectares: 90,  waterLevel: 60, expenseAED: 3500,  revenueAED: 5200,  health: 'good', planting: '2024-12-15', harvestInMonths: 5 },
];

const devices = [
  { id: 'FLJ-001', zone: 'Z1', location: 'Al Ain',  status: 'active' },
  { id: 'FLJ-002', zone: 'Z3', location: 'Al Ain',  status: 'active' },
  { id: 'FLJ-004', zone: 'Z4', location: 'Liwa',    status: 'offline', note: 'No data for 6h — check the solar panel.' },
  { id: 'FLJ-005', zone: 'Z6', location: 'Sharjah', status: 'error',   note: 'Inactive for 24h — check the power source.' },
];

const market = [
  { crop: 'tomato', priceAEDPerKg: '15–20', region: 'Al Ain',  weeklyChangePct: 5 },
  { crop: 'potato', priceAEDPerKg: '20–22', region: 'Al Ain',  weeklyChangePct: 1 },
  { crop: 'dates',  priceAEDPerKg: '22–30', region: 'Liwa',    weeklyChangePct: -2 },
  { crop: 'wheat',  priceAEDPerKg: '3–5',   region: 'Sharjah', weeklyChangePct: 0 },
];

const weather = {
  location: 'Al Ain, UAE', tempC: 25, condition: 'cloudy', windKmh: 9, rainChancePct: 2,
  tomorrow: { condition: 'cloudy', rainChancePct: 15, advice: 'Reduce irrigation by ~12% tomorrow.' },
};

const irrigationLog = [];

const zoneStatus = (z) => (z.moisture < MOIST_MIN ? 'needs_water' : 'ok');

export function getOverview() {
  const needs = zones.filter((z) => z.moisture < MOIST_MIN).sort((a, b) => a.moisture - b.moisture);
  return {
    farm: 'FALAJ demo farm — Al Ain, UAE',
    moistureThresholdPct: MOIST_MIN,
    zones: zones.map((z) => ({ id: z.id, crop: z.crop, moisture: z.moisture, status: zoneStatus(z) })),
    zonesNeedingWater: needs.map((z) => z.id),
    driestZone: needs[0] ? { id: needs[0].id, moisture: needs[0].moisture } : null,
    devicesWithProblems: devices.filter((d) => d.status !== 'active').map((d) => d.id),
    fields: fields.map(({ id, name, crop, health }) => ({ id, name, crop, health })),
  };
}

export function getZone(id) {
  const z = zones.find((x) => x.id.toLowerCase() === String(id).toLowerCase());
  return z ? { ...z, status: zoneStatus(z) } : null;
}

export const listFields = () => fields;
export const listDevices = () => devices;
export const getWeather = () => weather;
export const getMarket = (crop) => (crop ? market.filter((m) => m.crop === crop.toLowerCase()) : market);
export const getIrrigationLog = () => irrigationLog;

// Rough demo model: every minute of drip irrigation adds ~0.8 moisture points.
export function recommendIrrigation(id) {
  const z = getZone(id);
  if (!z) return null;
  const target = 55;
  if (z.moisture >= MOIST_MIN) return { zone: z.id, irrigate: false, moisture: z.moisture, reason: `Moisture ${z.moisture}% is above the ${MOIST_MIN}% threshold.` };
  const minutes = Math.ceil((target - z.moisture) / 0.8);
  const hot = z.temp >= 35;
  return {
    zone: z.id, irrigate: true, moisture: z.moisture, targetMoisture: target, minutes,
    bestTime: hot ? 'after sunset (hot day — less evaporation)' : 'early morning (05:00–07:00)',
    reason: `Moisture ${z.moisture}% is below the ${MOIST_MIN}% threshold.`,
  };
}

export function startIrrigation(id, minutes) {
  const z = zones.find((x) => x.id.toLowerCase() === String(id).toLowerCase());
  if (!z) return null;
  const before = z.moisture;
  z.moisture = Math.min(90, Math.round(z.moisture + minutes * 0.8));
  const entry = { zone: z.id, minutes, moistureBefore: before, moistureAfter: z.moisture, at: new Date().toISOString() };
  irrigationLog.push(entry);
  return entry;
}
