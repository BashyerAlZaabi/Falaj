/* ===== FALAJ — static data (UAE demo, AED currency) ===== */

const ONBOARDING = [
  { titleKey: 'ob.s1.title', bodyKey: 'ob.s1.body', scene: 'plant' },
  { titleKey: 'ob.s2.title', bodyKey: 'ob.s2.body', scene: 'harvest' },
  { titleKey: 'ob.s3.title', bodyKey: 'ob.s3.body', scene: 'market' },
];

// Demo farms/fields. revenue/expense in AED. bars = 7-day water-use (relative %).
const FIELDS = [
  { id: 'f1', name: 'Al Ain Grove', cropKey: 'crop.dates', water: 75, expense: 12500, revenue: 25000,
    revChange: 8, health: 'good', planting: '12/01/2024', harvest: 4,
    consumption: 5392, workTime: 420, hectares: 296, bars: [30, 42, 28, 33, 26, 40, 31],
    exp: { seeds: 42, fertilizer: 20, pesticide: 26, chemicals: 12 }, hue: 96 },
  { id: 'f2', name: 'Tomato Field', cropKey: 'crop.tomato', water: 10, expense: 2500, revenue: 0,
    revChange: -10, health: 'fair', planting: '03/03/2025', harvest: 2,
    consumption: 1820, workTime: 160, hectares: 42, bars: [18, 22, 15, 20, 24, 17, 21],
    exp: { seeds: 35, fertilizer: 25, pesticide: 28, chemicals: 12 }, hue: 28 },
  { id: 'f3', name: 'Maize Field', cropKey: 'crop.maize', water: 85, expense: 6000, revenue: 4000,
    revChange: 5, health: 'good', planting: '01/02/2025', harvest: 3,
    consumption: 3960, workTime: 300, hectares: 120, bars: [26, 30, 22, 28, 34, 24, 29],
    exp: { seeds: 30, fertilizer: 30, pesticide: 25, chemicals: 15 }, hue: 78 },
  { id: 'f4', name: 'Wheat Field', cropKey: 'crop.wheat', water: 60, expense: 3500, revenue: 5200,
    revChange: 3, health: 'good', planting: '15/12/2024', harvest: 5,
    consumption: 2800, workTime: 210, hectares: 90, bars: [20, 24, 18, 26, 22, 28, 21],
    exp: { seeds: 38, fertilizer: 28, pesticide: 20, chemicals: 14 }, hue: 64 },
];

const EXPENSE_KEYS = [
  { k: 'exp.seeds', c: '#e23b32' }, { k: 'exp.fertilizer', c: '#f0962a' },
  { k: 'exp.pesticide', c: '#3aa55f' }, { k: 'exp.chemicals', c: '#f4c531' },
];

// Today's market prices (AED / kg ranges).
const MARKET = [
  { cropKey: 'crop.tomato', price: '15–20', region: 'Al Ain', hue: 6 },
  { cropKey: 'crop.potato', price: '20–22', region: 'Al Ain', hue: 38 },
  { cropKey: 'crop.dates',  price: '22–30', region: 'Liwa',   hue: 30 },
  { cropKey: 'crop.wheat',  price: '3–5',   region: 'Sharjah', hue: 52 },
];

const WEATHER = { tempC: 25, condKey: 'weather.cloudy', wind: 9, rain: 2, location: 'Al Ain, UAE', date: '19 Aug' };

const NOTIFICATIONS = [
  { id: 'n1', key: 'notif.weather', icon: 'cloudsun', unread: true },
  { id: 'n2', key: 'notif.water',   icon: 'drop',     unread: true },
  { id: 'n3', key: 'notif.harvest', icon: 'wheat',    unread: false },
  { id: 'n4', key: 'notif.checkin', icon: 'list',     unread: false },
  { id: 'n5', key: 'notif.event',   icon: 'calendar', unread: false },
  { id: 'n6', key: 'notif.market',  icon: 'tag',      unread: false },
];

// AI assistant intents. First intent whose keyword appears in the message wins.
// Keywords span EN/AR/UR/HI so localized questions match too.
const AI_INTENTS = [
  { key: 'ans.water',      kw: ['water', 'irrigat', 'moisture', 'سقي', 'ريّ', 'رطوبة', 'مياه', 'پانی', 'آبپاش', 'पानी', 'सिंच', 'नमी'] },
  { key: 'ans.pest',       kw: ['pest', 'disease', 'sick', 'bug', 'آفة', 'مرض', 'مريض', 'کیڑ', 'بیمار', 'कीट', 'रोग', 'बीमार'] },
  { key: 'ans.fertilizer', kw: ['fertil', 'nutrient', 'سماد', 'مغذّ', 'کھاد', 'खाद', 'पोषक'] },
  { key: 'ans.market',     kw: ['price', 'market', 'sell', 'tomato', 'سعر', 'سوق', 'طماطم', 'قیمت', 'مارکیٹ', 'ٹماٹر', 'दाम', 'मूल्य', 'बाज़ार', 'टमाटर'] },
  { key: 'ans.weather',    kw: ['weather', 'rain', 'طقس', 'مطر', 'موسم', 'بارش', 'मौसम', 'वर्षा', 'बारिश'] },
  { key: 'ans.harvest',    kw: ['harvest', 'reap', 'حصد', 'کٹائی', 'कटाई'] },
  { key: 'ans.hello',      kw: ['hello', 'hey', 'salam', 'مرحبا', 'سلام', 'नमस्ते', 'नमस्कार'] },
];

// Cascading location picker (UAE-first).
const COUNTRIES = [
  { name: 'United Arab Emirates', states: [
    { name: 'Abu Dhabi', cities: ['Al Ain', 'Liwa', 'Madinat Zayed', 'Al Dhafra'] },
    { name: 'Dubai', cities: ['Hatta', 'Al Marmoom', 'Al Lisaili'] },
    { name: 'Sharjah', cities: ['Al Dhaid', 'Kalba', 'Mleiha'] },
    { name: 'Ras Al Khaimah', cities: ['Digdaga', 'Al Rams'] },
  ] },
  { name: 'Saudi Arabia', states: [
    { name: 'Riyadh', cities: ['Al Kharj', 'Al Quwayiyah'] },
    { name: 'Eastern Province', cities: ['Al Ahsa', 'Qatif'] },
  ] },
  { name: 'Oman', states: [
    { name: 'Al Batinah', cities: ['Sohar', 'Rustaq'] },
    { name: 'Ad Dakhiliyah', cities: ['Nizwa', 'Bahla'] },
  ] },
  { name: 'Egypt', states: [
    { name: 'Fayoum', cities: ['Fayoum City', 'Sinnuris'] },
    { name: 'Beheira', cities: ['Damanhur', 'Kafr El Dawwar'] },
  ] },
];
