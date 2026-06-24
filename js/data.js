/* ===== بيانات التطبيق الثابتة (ثنائية اللغة) ===== */

// التمارين (mode: reps = عدّ بالحركة، hold = ثبات)
const WORKOUTS = [
  { id: 'run',     name: 'جري',      name_en: 'Run',        icon: 'figure',   mode: 'reps', reps: 20, seconds: 30, points: 40, coins: 25, desc: 'كارديو',       desc_en: 'Cardio' },
  { id: 'pushup',  name: 'ضغط',      name_en: 'Push-ups',   icon: 'dumbbell', mode: 'reps', reps: 10, seconds: 30, points: 30, coins: 18, desc: 'قوة',          desc_en: 'Strength' },
  { id: 'squat',   name: 'سكوات',    name_en: 'Squats',     icon: 'figure',   mode: 'reps', reps: 12, seconds: 30, points: 30, coins: 18, desc: 'أرجل',         desc_en: 'Legs' },
  { id: 'plank',   name: 'بلانك',     name_en: 'Plank',      icon: 'figure',   mode: 'hold', reps: 0,  seconds: 12, points: 35, coins: 20, desc: 'ثبات',         desc_en: 'Core' },
  { id: 'bike',    name: 'دراجة',     name_en: 'Cycling',    icon: 'bicycle',  mode: 'reps', reps: 20, seconds: 30, points: 45, coins: 28, desc: 'كارديو',       desc_en: 'Cardio' },
  { id: 'jump',    name: 'نط الحبل',  name_en: 'Jump rope',  icon: 'bolt',     mode: 'reps', reps: 20, seconds: 30, points: 38, coins: 22, desc: 'رشاقة',        desc_en: 'Agility' },
  { id: 'swim',    name: 'سباحة',     name_en: 'Swimming',   icon: 'waves',    mode: 'reps', reps: 16, seconds: 30, points: 55, coins: 32, desc: 'كامل الجسم',   desc_en: 'Full body' },
  { id: 'weights', name: 'حديد',      name_en: 'Weights',    icon: 'dumbbell', mode: 'reps', reps: 12, seconds: 30, points: 50, coins: 30, desc: 'قوة',          desc_en: 'Strength' },
  { id: 'burpee',  name: 'بيربي',     name_en: 'Burpees',    icon: 'bolt',     mode: 'reps', reps: 12, seconds: 30, points: 48, coins: 28, desc: 'كامل الجسم',   desc_en: 'Full body' },
  { id: 'lunge',   name: 'طعن',       name_en: 'Lunges',     icon: 'figure',   mode: 'reps', reps: 14, seconds: 30, points: 34, coins: 20, desc: 'أرجل',         desc_en: 'Legs' },
  { id: 'climber', name: 'متسلّق',    name_en: 'Climbers',   icon: 'figure',   mode: 'reps', reps: 24, seconds: 30, points: 42, coins: 26, desc: 'كارديو',       desc_en: 'Cardio' },
  { id: 'stretch', name: 'إطالة',     name_en: 'Stretch',    icon: 'waves',    mode: 'hold', reps: 0,  seconds: 15, points: 28, coins: 16, desc: 'مرونة',        desc_en: 'Mobility' },
];

// عناصر المتجر (cat: outfit | head | eyes | accessory | shoes)
const SHOP = [
  { id: 'outfit_classic', name: 'الزي التقليدي', name_en: 'Classic outfit',  cat: 'outfit', price: 0,   icon: 'tshirt', color: '#e9e9ec', default: true },
  { id: 'outfit_gold',    name: 'كندورة ذهبية',  name_en: 'Gold robe',       cat: 'outfit', price: 350, icon: 'tshirt', color: '#e7c454' },
  { id: 'outfit_navy',    name: 'كندورة كحلية',  name_en: 'Navy robe',       cat: 'outfit', price: 250, icon: 'tshirt', color: '#314a78' },
  { id: 'outfit_sport',   name: 'بدلة رياضية',   name_en: 'Sport suit',      cat: 'outfit', price: 300, icon: 'tshirt', color: '#23805f' },
  { id: 'outfit_red',     name: 'زي أحمر فاخر',  name_en: 'Red outfit',      cat: 'outfit', price: 400, icon: 'tshirt', color: '#a83535' },
  { id: 'outfit_emerald', name: 'زمردي',         name_en: 'Emerald',         cat: 'outfit', price: 320, icon: 'tshirt', color: '#1f9168' },
  { id: 'outfit_purple',  name: 'بنفسجي ملكي',   name_en: 'Royal purple',    cat: 'outfit', price: 360, icon: 'tshirt', color: '#6b3fa0' },
  { id: 'outfit_white',   name: 'أبيض فاخر',     name_en: 'Pure white',      cat: 'outfit', price: 280, icon: 'tshirt', color: '#f2f2f2' },

  { id: 'head_default',   name: 'الغترة البيضاء', name_en: 'White Ghutra',   cat: 'head', price: 0,   icon: 'cap', color: '#e9e9ec', default: true },
  { id: 'head_shemagh',   name: 'شماغ أحمر',      name_en: 'Red Shemagh',    cat: 'head', price: 200, icon: 'cap', color: '#d12f2f' },
  { id: 'head_cap',       name: 'كاب رياضي',      name_en: 'Sport cap',      cat: 'head', price: 150, icon: 'cap', color: '#23805f' },
  { id: 'head_band',      name: 'عصابة رأس',      name_en: 'Headband',       cat: 'head', price: 120, icon: 'cap', color: '#e84393' },

  { id: 'eyes_none',      name: 'بدون نظارة',     name_en: 'No glasses',     cat: 'eyes', price: 0,   icon: 'ring',    color: '#8a8a8e', default: true },
  { id: 'eyes_shades',    name: 'نظارة شمسية',    name_en: 'Sunglasses',     cat: 'eyes', price: 180, icon: 'glasses', color: '#1c1c1e' },
  { id: 'eyes_sport',     name: 'نظارة رياضية',   name_en: 'Sport goggles',  cat: 'eyes', price: 160, icon: 'glasses', color: '#23805f' },

  { id: 'acc_none',       name: 'بدون',           name_en: 'None',           cat: 'accessory', price: 0,   icon: 'ring',       color: '#8a8a8e', default: true },
  { id: 'acc_watch',      name: 'ساعة ذكية',      name_en: 'Smart watch',    cat: 'accessory', price: 220, icon: 'watch',      color: '#3a3a3c' },
  { id: 'acc_medal',      name: 'حقيبة ظهر',      name_en: 'Backpack',       cat: 'accessory', price: 500, icon: 'bag',        color: '#4a4d3a' },
  { id: 'acc_headphone',  name: 'سماعات',         name_en: 'Headset',        cat: 'accessory', price: 190, icon: 'headphones', color: '#1c1f24' },

  { id: 'shoes_default',  name: 'حذاء قتالي',     name_en: 'Combat boots',   cat: 'shoes', price: 0,   icon: 'shoe', color: '#2e2a22', default: true },
  { id: 'shoes_runner',   name: 'حذاء رياضي',     name_en: 'Running shoes',  cat: 'shoes', price: 170, icon: 'shoe', color: '#e9e9ec' },
  { id: 'shoes_gold',     name: 'حذاء ذهبي',       name_en: 'Gold shoes',     cat: 'shoes', price: 280, icon: 'shoe', color: '#e7c454' },
];

const SHOP_CATS = [
  { id: 'outfit',    name: 'الأزياء',     name_en: 'Outfits' },
  { id: 'head',      name: 'غطاء الرأس',   name_en: 'Headwear' },
  { id: 'eyes',      name: 'النظارات',     name_en: 'Glasses' },
  { id: 'accessory', name: 'إكسسوارات',   name_en: 'Accessories' },
  { id: 'shoes',     name: 'الأحذية',      name_en: 'Footwear' },
];

// لاعبو التصنيف العالمي (ثنائيو اللغة)
const BOTS = [
  { name: 'راشد الكتبي',   name_en: 'Rashed A.',   country: 'الإمارات', country_en: 'UAE',     base: 9850 },
  { name: 'صوفيا م.',      name_en: 'Sofia M.',    country: 'البرازيل', country_en: 'Brazil',  base: 9420 },
  { name: 'علياء النعيمي',  name_en: 'Alia N.',     country: 'الإمارات', country_en: 'UAE',     base: 8970 },
  { name: 'كينجي ت.',      name_en: 'Kenji T.',    country: 'اليابان',  country_en: 'Japan',   base: 8610 },
  { name: 'ليام أو.',      name_en: 'Liam O.',     country: 'أيرلندا',  country_en: 'Ireland', base: 8240 },
  { name: 'فاطمة الزعابي',  name_en: 'Fatima Z.',   country: 'الإمارات', country_en: 'UAE',     base: 7880 },
  { name: 'كارلوس ر.',     name_en: 'Carlos R.',   country: 'إسبانيا',  country_en: 'Spain',   base: 7510 },
  { name: 'آنيا ك.',       name_en: 'Anya K.',     country: 'روسيا',    country_en: 'Russia',  base: 7190 },
  { name: 'سعيد المنصوري',  name_en: 'Saeed M.',    country: 'الإمارات', country_en: 'UAE',     base: 6850 },
  { name: 'مي ل.',         name_en: 'Mei L.',      country: 'الصين',    country_en: 'China',   base: 6420 },
  { name: 'ديفيد س.',      name_en: 'David S.',    country: 'أمريكا',   country_en: 'USA',     base: 6080 },
  { name: 'حمدان الشامسي',  name_en: 'Hamdan S.',   country: 'الإمارات', country_en: 'UAE',     base: 5740 },
  { name: 'إيلينا ب.',     name_en: 'Elena P.',    country: 'إيطاليا',  country_en: 'Italy',   base: 5390 },
  { name: 'عمر ف.',        name_en: 'Omar F.',     country: 'مصر',      country_en: 'Egypt',   base: 5010 },
  { name: 'مريم البلوشي',   name_en: 'Maryam B.',   country: 'الإمارات', country_en: 'UAE',     base: 4680 },
  { name: 'طارق ن.',       name_en: 'Tariq N.',    country: 'باكستان',  country_en: 'Pakistan',base: 4300 },
  { name: 'لوكاس ج.',      name_en: 'Lucas G.',    country: 'فرنسا',    country_en: 'France',  base: 3950 },
  { name: 'نورة الحمادي',   name_en: 'Noura H.',    country: 'الإمارات', country_en: 'UAE',     base: 3600 },
  { name: 'بريا ر.',       name_en: 'Priya R.',    country: 'الهند',    country_en: 'India',   base: 3240 },
  { name: 'خالد العامري',   name_en: 'Khalid A.',   country: 'الإمارات', country_en: 'UAE',     base: 2900 },
  { name: 'حسن أ.',        name_en: 'Hassan A.',   country: 'المغرب',   country_en: 'Morocco', base: 2550 },
  { name: 'يوكي س.',       name_en: 'Yuki S.',     country: 'اليابان',  country_en: 'Japan',   base: 2200 },
  { name: 'شيخة الظاهري',   name_en: 'Shaikha Z.',  country: 'الإمارات', country_en: 'UAE',     base: 1870 },
  { name: 'ماركو ب.',      name_en: 'Marco B.',    country: 'ألمانيا',  country_en: 'Germany', base: 1520 },
  { name: 'عائشة ب.',      name_en: 'Aisha B.',    country: 'نيجيريا',  country_en: 'Nigeria', base: 1180 },
];

// الإنجازات (badge) — check تُحسب من الحالة، reward عملات تُمنح عند الفتح
const ACHIEVEMENTS = [
  { id: 'first',      name: 'البداية',        name_en: 'First Step',    desc: 'أكمل أول تمرين',          desc_en: 'Complete your first workout', icon: 'bolt',    reward: 50,  check: s => s.totalWorkouts >= 1 },
  { id: 'streak3',    name: 'ثلاثة أيام',      name_en: '3-Day Streak',  desc: 'حافظ على 3 أيام متتالية', desc_en: 'Keep a 3-day streak',         icon: 'flame',   reward: 80,  check: s => s.streak >= 3 },
  { id: 'ten',        name: 'مثابر',           name_en: 'Committed',     desc: 'أكمل 10 تمارين',          desc_en: 'Complete 10 workouts',        icon: 'dumbbell',reward: 120, check: s => s.totalWorkouts >= 10 },
  { id: 'level5',     name: 'صاعد',            name_en: 'Rising',        desc: 'اوصل للمستوى 5',          desc_en: 'Reach level 5',               icon: 'star',    reward: 150, check: s => Math.floor(s.points / 250) + 1 >= 5 },
  { id: 'collector',  name: 'أنيق',            name_en: 'Stylish',       desc: 'امتلك 5 قطع',             desc_en: 'Own 5 items',                 icon: 'tshirt',  reward: 120, check: s => ownedCount(s) >= 5 },
  { id: 'marathon',   name: 'ماراثون',         name_en: 'Marathon',      desc: 'أكمل 25 تمريناً',         desc_en: 'Complete 25 workouts',        icon: 'trophy',  reward: 250, check: s => s.totalWorkouts >= 25 },
  { id: 'level10',    name: 'محترف',           name_en: 'Pro',           desc: 'اوصل للمستوى 10',         desc_en: 'Reach level 10',              icon: 'trophy',  reward: 300, check: s => Math.floor(s.points / 250) + 1 >= 10 },
  { id: 'wardrobe',   name: 'خزانة كاملة',     name_en: 'Full Wardrobe', desc: 'امتلك 10 قطع',            desc_en: 'Own 10 items',                icon: 'bag',     reward: 300, check: s => ownedCount(s) >= 10 },
];
function ownedCount(s) {
  return (s.owned || []).filter(id => { const it = SHOP.find(x => x.id === id); return it && !it.default; }).length;
}
