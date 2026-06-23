/* ===== بيانات التطبيق الثابتة ===== */

// التمارين المتاحة
const WORKOUTS = [
  { id: 'run',    name: 'جري',          emoji: '🏃', seconds: 8,  points: 40, coins: 25, desc: 'كارديو' },
  { id: 'pushup', name: 'ضغط',          emoji: '💪', seconds: 6,  points: 30, coins: 18, desc: 'قوة' },
  { id: 'squat',  name: 'سكوات',        emoji: '🦵', seconds: 6,  points: 30, coins: 18, desc: 'أرجل' },
  { id: 'plank',  name: 'بلانك',         emoji: '🧘', seconds: 7,  points: 35, coins: 20, desc: 'ثبات' },
  { id: 'bike',   name: 'دراجة',         emoji: '🚴', seconds: 9,  points: 45, coins: 28, desc: 'كارديو' },
  { id: 'jump',   name: 'نط الحبل',      emoji: '🤸', seconds: 7,  points: 38, coins: 22, desc: 'رشاقة' },
  { id: 'swim',   name: 'سباحة',         emoji: '🏊', seconds: 10, points: 55, coins: 32, desc: 'كامل الجسم' },
  { id: 'weights',name: 'حديد',          emoji: '🏋️', seconds: 8,  points: 50, coins: 30, desc: 'قوة' },
];

// عناصر المتجر — كل عنصر يغيّر مظهر الشخصية
// category: outfit | head | eyes | accessory | shoes
const SHOP = [
  // الأزياء (الأساسي مجاني ومملوك)
  { id: 'outfit_classic', name: 'الزي التقليدي', cat: 'outfit', price: 0,   icon: '🤍', default: true },
  { id: 'outfit_gold',    name: 'كندورة ذهبية',  cat: 'outfit', price: 350, icon: '🟡' },
  { id: 'outfit_navy',    name: 'كندورة كحلية',  cat: 'outfit', price: 250, icon: '🔵' },
  { id: 'outfit_sport',   name: 'بدلة رياضية',   cat: 'outfit', price: 300, icon: '🎽' },
  { id: 'outfit_red',     name: 'زي أحمر فاخر',  cat: 'outfit', price: 400, icon: '🔴' },

  // غطاء الرأس
  { id: 'head_default',   name: 'الغترة البيضاء', cat: 'head', price: 0,   icon: '⚪', default: true },
  { id: 'head_shemagh',   name: 'شماغ أحمر',      cat: 'head', price: 200, icon: '🔴' },
  { id: 'head_cap',       name: 'كاب رياضي',      cat: 'head', price: 150, icon: '🧢' },
  { id: 'head_band',      name: 'عصابة رأس',      cat: 'head', price: 120, icon: '🎀' },

  // العيون
  { id: 'eyes_none',      name: 'بدون نظارة',     cat: 'eyes', price: 0,   icon: '👀', default: true },
  { id: 'eyes_shades',    name: 'نظارة شمسية',    cat: 'eyes', price: 180, icon: '🕶️' },
  { id: 'eyes_sport',     name: 'نظارة رياضية',   cat: 'eyes', price: 160, icon: '🥽' },

  // إكسسوارات
  { id: 'acc_none',       name: 'بدون',           cat: 'accessory', price: 0,   icon: '➖', default: true },
  { id: 'acc_watch',      name: 'ساعة ذكية',      cat: 'accessory', price: 220, icon: '⌚' },
  { id: 'acc_medal',      name: 'ميدالية ذهبية',  cat: 'accessory', price: 500, icon: '🥇' },
  { id: 'acc_headphone',  name: 'سماعات',         cat: 'accessory', price: 190, icon: '🎧' },

  // الأحذية
  { id: 'shoes_default',  name: 'نعال عادي',      cat: 'shoes', price: 0,   icon: '👞', default: true },
  { id: 'shoes_runner',   name: 'حذاء جري',       cat: 'shoes', price: 170, icon: '👟' },
  { id: 'shoes_gold',     name: 'حذاء ذهبي',      cat: 'shoes', price: 280, icon: '✨' },
];

const SHOP_CATS = [
  { id: 'outfit',    name: 'الأزياء' },
  { id: 'head',      name: 'غطاء الرأس' },
  { id: 'eyes',      name: 'النظارات' },
  { id: 'accessory', name: 'إكسسوارات' },
  { id: 'shoes',     name: 'الأحذية' },
];

// لاعبون وهميون للتصنيف العالمي (نقاط أساسية + علم الدولة + رمز)
const BOTS = [
  { name: 'راشد الكتبي',  flag: '🇦🇪', ava: '🧔🏻', base: 9850 },
  { name: 'Sofia M.',     flag: '🇧🇷', ava: '👩🏽', base: 9420 },
  { name: 'علياء النعيمي', flag: '🇦🇪', ava: '🧕🏻', base: 8970 },
  { name: 'Kenji T.',     flag: '🇯🇵', ava: '🧑🏻', base: 8610 },
  { name: 'Liam O.',      flag: '🇮🇪', ava: '👨🏼', base: 8240 },
  { name: 'فاطمة الزعابي', flag: '🇦🇪', ava: '🧕🏽', base: 7880 },
  { name: 'Carlos R.',    flag: '🇪🇸', ava: '🧔🏽', base: 7510 },
  { name: 'Anya K.',      flag: '🇷🇺', ava: '👩🏼', base: 7190 },
  { name: 'سعيد المنصوري', flag: '🇦🇪', ava: '🧔🏻', base: 6850 },
  { name: 'Mei L.',       flag: '🇨🇳', ava: '👩🏻', base: 6420 },
  { name: 'David S.',     flag: '🇺🇸', ava: '👨🏾', base: 6080 },
  { name: 'حمدان الشامسي', flag: '🇦🇪', ava: '🧔🏻', base: 5740 },
  { name: 'Elena P.',     flag: '🇮🇹', ava: '👩🏼', base: 5390 },
  { name: 'Omar F.',      flag: '🇪🇬', ava: '🧔🏽', base: 5010 },
  { name: 'مريم البلوشي',  flag: '🇦🇪', ava: '🧕🏻', base: 4680 },
  { name: 'Tariq N.',     flag: '🇵🇰', ava: '🧔🏽', base: 4300 },
  { name: 'Lucas G.',     flag: '🇫🇷', ava: '👨🏼', base: 3950 },
  { name: 'نورة الحمادي',  flag: '🇦🇪', ava: '🧕🏽', base: 3600 },
  { name: 'Priya R.',     flag: '🇮🇳', ava: '👩🏽', base: 3240 },
  { name: 'خالد العامري',  flag: '🇦🇪', ava: '🧔🏻', base: 2900 },
  { name: 'Hassan A.',    flag: '🇲🇦', ava: '🧔🏽', base: 2550 },
  { name: 'Yuki S.',      flag: '🇯🇵', ava: '👩🏻', base: 2200 },
  { name: 'شيخة الظاهري',  flag: '🇦🇪', ava: '🧕🏻', base: 1870 },
  { name: 'Marco B.',     flag: '🇩🇪', ava: '👨🏼', base: 1520 },
  { name: 'Aisha B.',     flag: '🇳🇬', ava: '👩🏿', base: 1180 },
];
