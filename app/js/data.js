/* ===== FALAJ — static data ===== */

// Irrigation zones. nameKey/cropKey are i18n keys. moistureMin = auto-water threshold.
const ZONES = [
  { id: 'A', cropKey: 'crop.dates',  area: 4.0, moistureMin: 35, baseMoisture: 58 },
  { id: 'B', cropKey: 'crop.tomato', area: 1.5, moistureMin: 45, baseMoisture: 49 },
  { id: 'C', cropKey: 'crop.wheat',  area: 3.0, moistureMin: 30, baseMoisture: 62 },
  { id: 'D', cropKey: 'crop.veg',    area: 0.8, moistureMin: 50, baseMoisture: 71 },
];

// Subscription plans (deck slide 26). featureKeys are inlined English+translated below.
const PLANS = [
  {
    id: 'basic', nameKey: 'plan.basic.name', price: 99, accent: '#16a34a',
    features: {
      en: ['Essential farm management tools', 'Basic irrigation support', 'Limited chat support'],
      ar: ['أدوات إدارة المزرعة الأساسية', 'دعم الريّ الأساسي', 'دعم محادثة محدود'],
      ur: ['بنیادی فارم منیجمنٹ ٹولز', 'بنیادی آبپاشی سپورٹ', 'محدود چیٹ سپورٹ'],
      hi: ['आवश्यक फ़ार्म प्रबंधन उपकरण', 'बेसिक सिंचाई सहायता', 'सीमित चैट सहायता'],
    },
  },
  {
    id: 'standard', nameKey: 'plan.standard.name', price: 249, accent: '#2f4cff', popular: true,
    features: {
      en: ['Advanced farm management tools', 'Smart irrigation integration', 'Chat & email support', 'Weekly analytics reports'],
      ar: ['أدوات إدارة متقدّمة', 'تكامل الريّ الذكي', 'دعم محادثة وبريد', 'تقارير تحليلية أسبوعية'],
      ur: ['ایڈوانسڈ فارم منیجمنٹ ٹولز', 'سمارٹ آبپاشی انضمام', 'چیٹ اور ای میل سپورٹ', 'ہفتہ وار تجزیاتی رپورٹس'],
      hi: ['उन्नत फ़ार्म प्रबंधन उपकरण', 'स्मार्ट सिंचाई एकीकरण', 'चैट और ईमेल सहायता', 'साप्ताहिक विश्लेषण रिपोर्ट'],
    },
  },
  {
    id: 'premium', nameKey: 'plan.premium.name', price: 499, accent: '#a855ff',
    features: {
      en: ['Full access to all tools', 'Customizable smart irrigation', 'Priority support & account manager', 'Custom analytics & insights'],
      ar: ['وصول كامل لكل الأدوات', 'ريّ ذكي قابل للتخصيص', 'دعم أولوية ومدير حساب', 'تحليلات ورؤى مخصّصة'],
      ur: ['تمام ٹولز تک مکمل رسائی', 'حسبِ ضرورت سمارٹ آبپاشی', 'ترجیحی سپورٹ اور اکاؤنٹ مینیجر', 'حسبِ ضرورت تجزیات و بصیرت'],
      hi: ['सभी उपकरणों तक पूर्ण पहुँच', 'अनुकूलन योग्य स्मार्ट सिंचाई', 'प्राथमिकता सहायता व खाता प्रबंधक', 'कस्टम विश्लेषण व अंतर्दृष्टि'],
    },
  },
  {
    id: 'custom', nameKey: 'plan.custom.name', price: null, accent: '#0ea5b7',
    features: {
      en: ['Tailored to your farm', 'Flexible feature-based pricing', 'Personalized support', 'Continuous improvement'],
      ar: ['مصمّم لمزرعتك', 'تسعير مرن حسب الميزات', 'دعم شخصي', 'تحسين مستمر'],
      ur: ['آپ کے فارم کے مطابق', 'فیچر کے مطابق لچکدار قیمت', 'ذاتی سپورٹ', 'مسلسل بہتری'],
      hi: ['आपके फ़ार्म के अनुरूप', 'फ़ीचर-आधारित लचीली कीमत', 'व्यक्तिगत सहायता', 'निरंतर सुधार'],
    },
  },
];

// Market crops for the online-market preview (Phase 2). prices in AED/kg, trend = weekly %.
const MARKET = [
  { cropKey: 'crop.tomato', price: 6.5,  trend: +5 },
  { cropKey: 'crop.dates',  price: 22.0, trend: +2 },
  { cropKey: 'crop.veg',    price: 8.0,  trend: -3 },
  { cropKey: 'crop.wheat',  price: 3.2,  trend: +1 },
];

// National facts (deck slide 4) for the About screen.
const FACTS = [
  { value: '80%', key: 'about.fact1' },
  { value: '70+', key: 'about.fact2' },
  { value: '<5%', key: 'about.fact3' },
  { value: '40k', key: 'about.fact4' },
];

// Alert templates. Each generates a notification with translated title/body + params.
const ALERT_TEMPLATES = [
  { type: 'market',   icon: 'trend',   tone: 'amber',  param: () => ({ n: 5 }) },
  { type: 'weather',  icon: 'cloud',   tone: 'blue',   param: () => ({ n: 12 }) },
  { type: 'water',    icon: 'drop',    tone: 'cyan',   param: () => ({ n: 10 }) },
  { type: 'crop',     icon: 'leaf',    tone: 'green',  param: () => ({ z: 'B' }) },
  { type: 'sales',    icon: 'cash',    tone: 'green',  param: () => ({ n: '1,200' }) },
  { type: 'nutrient', icon: 'flask',   tone: 'red',    param: () => ({ n: 15, z: 'C' }) },
];

// Seed alerts shown on first load (matches the deck's notification mockup order).
const SEED_ALERTS = ['market', 'weather', 'water', 'crop', 'sales', 'nutrient'];
