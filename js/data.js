/* ===== بيانات التطبيق الثابتة ===== */

// فئات التمارين (للتصفية)
const WORKOUT_CATS = [
  { id: 'all',      name: 'الكل' },
  { id: 'cardio',   name: 'كارديو' },
  { id: 'strength', name: 'قوة' },
  { id: 'agility',  name: 'رشاقة' },
  { id: 'core',     name: 'ثبات' },
  { id: 'legs',     name: 'أرجل' },
  { id: 'full',     name: 'كامل الجسم' },
];

// مستويات الصعوبة
const LEVELS = {
  easy:   { name: 'سهل',   color: 'var(--green)' },
  medium: { name: 'متوسط', color: 'var(--orange)' },
  hard:   { name: 'صعب',   color: 'var(--red)' },
};

// التمارين المتاحة (icon = اسم أيقونة SVG، cat = الفئة، level = الصعوبة)
const WORKOUTS = [
  { id: 'run',     name: 'جري',       icon: 'figure',   seconds: 8,  points: 40, coins: 25, cat: 'cardio',   level: 'medium', desc: 'كارديو' },
  { id: 'pushup',  name: 'ضغط',       icon: 'dumbbell', seconds: 6,  points: 30, coins: 18, cat: 'strength', level: 'easy',   desc: 'قوة' },
  { id: 'squat',   name: 'سكوات',     icon: 'figure',   seconds: 6,  points: 30, coins: 18, cat: 'legs',     level: 'easy',   desc: 'أرجل' },
  { id: 'plank',   name: 'بلانك',      icon: 'figure',   seconds: 7,  points: 35, coins: 20, cat: 'core',     level: 'medium', desc: 'ثبات' },
  { id: 'bike',    name: 'دراجة',      icon: 'bicycle',  seconds: 9,  points: 45, coins: 28, cat: 'cardio',   level: 'medium', desc: 'كارديو' },
  { id: 'jump',    name: 'نط الحبل',   icon: 'bolt',     seconds: 7,  points: 38, coins: 22, cat: 'agility',  level: 'medium', desc: 'رشاقة' },
  { id: 'swim',    name: 'سباحة',      icon: 'waves',    seconds: 10, points: 55, coins: 32, cat: 'full',     level: 'hard',   desc: 'كامل الجسم' },
  { id: 'weights', name: 'حديد',       icon: 'dumbbell', seconds: 8,  points: 50, coins: 30, cat: 'strength', level: 'hard',   desc: 'قوة' },
];

// عناصر المتجر — كل عنصر يغيّر مظهر الشخصية
// cat: outfit | head | eyes | accessory | shoes ، icon = أيقونة ، color = لون التمثيل
const SHOP = [
  // الأزياء
  { id: 'outfit_classic', name: 'الزي التقليدي', cat: 'outfit', price: 0,   icon: 'tshirt', color: '#e9e9ec', default: true },
  { id: 'outfit_gold',    name: 'كندورة ذهبية',  cat: 'outfit', price: 350, icon: 'tshirt', color: '#e7c454' },
  { id: 'outfit_navy',    name: 'كندورة كحلية',  cat: 'outfit', price: 250, icon: 'tshirt', color: '#314a78' },
  { id: 'outfit_sport',   name: 'بدلة رياضية',   cat: 'outfit', price: 300, icon: 'tshirt', color: '#23805f' },
  { id: 'outfit_red',     name: 'زي أحمر فاخر',  cat: 'outfit', price: 400, icon: 'tshirt', color: '#a83535' },

  // غطاء الرأس
  { id: 'head_default',   name: 'الغترة البيضاء', cat: 'head', price: 0,   icon: 'cap', color: '#e9e9ec', default: true },
  { id: 'head_shemagh',   name: 'شماغ أحمر',      cat: 'head', price: 200, icon: 'cap', color: '#d12f2f' },
  { id: 'head_cap',       name: 'كاب رياضي',      cat: 'head', price: 150, icon: 'cap', color: '#23805f' },
  { id: 'head_band',      name: 'عصابة رأس',      cat: 'head', price: 120, icon: 'cap', color: '#e84393' },

  // العيون
  { id: 'eyes_none',      name: 'بدون نظارة',     cat: 'eyes', price: 0,   icon: 'ring',    color: '#8a8a8e', default: true },
  { id: 'eyes_shades',    name: 'نظارة شمسية',    cat: 'eyes', price: 180, icon: 'glasses', color: '#1c1c1e' },
  { id: 'eyes_sport',     name: 'نظارة رياضية',   cat: 'eyes', price: 160, icon: 'glasses', color: '#23805f' },

  // إكسسوارات
  { id: 'acc_none',       name: 'بدون',           cat: 'accessory', price: 0,   icon: 'ring',       color: '#8a8a8e', default: true },
  { id: 'acc_watch',      name: 'ساعة ذكية',      cat: 'accessory', price: 220, icon: 'watch',      color: '#3a3a3c' },
  { id: 'acc_medal',      name: 'ميدالية ذهبية',  cat: 'accessory', price: 500, icon: 'medal',      color: '#f1c40f' },
  { id: 'acc_headphone',  name: 'سماعات',         cat: 'accessory', price: 190, icon: 'headphones', color: '#ec4359' },

  // الأحذية
  { id: 'shoes_default',  name: 'نعال عادي',      cat: 'shoes', price: 0,   icon: 'shoe', color: '#7a6147', default: true },
  { id: 'shoes_runner',   name: 'حذاء جري',       cat: 'shoes', price: 170, icon: 'shoe', color: '#e9e9ec' },
  { id: 'shoes_gold',     name: 'حذاء ذهبي',       cat: 'shoes', price: 280, icon: 'shoe', color: '#e7c454' },
];

const SHOP_CATS = [
  { id: 'outfit',    name: 'الأزياء' },
  { id: 'head',      name: 'غطاء الرأس' },
  { id: 'eyes',      name: 'النظارات' },
  { id: 'accessory', name: 'إكسسوارات' },
  { id: 'shoes',     name: 'الأحذية' },
];

// الإنجازات — تُفتح تلقائياً عند تحقّق الشرط على الحالة المشتقّة (d)
const ACHIEVEMENTS = [
  { id: 'first_workout', name: 'الانطلاقة',      desc: 'أكمل أول تمرين',          icon: 'flame',    test: d => d.totalWorkouts >= 1 },
  { id: 'ten_workouts',  name: 'نشيط',           desc: 'أكمل 10 تمارين',          icon: 'dumbbell', test: d => d.totalWorkouts >= 10 },
  { id: 'fifty_workouts',name: 'لا يتوقّف',       desc: 'أكمل 50 تمريناً',         icon: 'bolt',     test: d => d.totalWorkouts >= 50 },
  { id: 'goal_day',      name: 'هدف اليوم',       desc: 'أكمل هدف اليوم',          icon: 'target',   test: d => d.goalDone },
  { id: 'points_1k',     name: 'ألف نقطة',       desc: 'اجمع 1000 نقطة',          icon: 'star',     test: d => d.points >= 1000 },
  { id: 'points_5k',     name: 'خمسة آلاف',      desc: 'اجمع 5000 نقطة',          icon: 'sparkle',  test: d => d.points >= 5000 },
  { id: 'level_5',       name: 'صاعد',           desc: 'بلغ المستوى 5',           icon: 'award',    test: d => d.level >= 5 },
  { id: 'level_10',      name: 'خبير',           desc: 'بلغ المستوى 10',          icon: 'award',    test: d => d.level >= 10 },
  { id: 'streak_7',      name: 'أسبوع كامل',     desc: 'سلسلة 7 أيام متتالية',     icon: 'flame',    test: d => d.streak >= 7 },
  { id: 'streak_30',     name: 'شهر من الالتزام', desc: 'سلسلة 30 يوماً',          icon: 'calendar', test: d => d.streak >= 30 },
  { id: 'collector',     name: 'جامع الأناقة',    desc: 'امتلك 5 قطع',             icon: 'bag',      test: d => d.ownedCount >= 5 },
  { id: 'fashionista',   name: 'خزانة كاملة',     desc: 'امتلك 10 قطع',            icon: 'tshirt',   test: d => d.ownedCount >= 10 },
  { id: 'top10',         name: 'نخبة العالم',     desc: 'ادخل أفضل 10 عالمياً',     icon: 'globe',    test: d => d.rank <= 10 },
  { id: 'top3',          name: 'منصة التتويج',    desc: 'ادخل أفضل 3 عالمياً',      icon: 'medal',    test: d => d.rank <= 3 },
  { id: 'champion',      name: 'بطل العالم',      desc: 'احتل المركز الأول',        icon: 'crown',    test: d => d.rank === 1 },
];

// لاعبون للتصنيف العالمي (الأحرف الأولى تُحسب من الاسم، اللون يُولّد تلقائياً)
const BOTS = [
  { name: 'راشد الكتبي',   country: 'الإمارات', base: 9850 },
  { name: 'صوفيا م.',      country: 'البرازيل', base: 9420 },
  { name: 'علياء النعيمي',  country: 'الإمارات', base: 8970 },
  { name: 'كينجي ت.',      country: 'اليابان',  base: 8610 },
  { name: 'ليام أو.',      country: 'أيرلندا',  base: 8240 },
  { name: 'فاطمة الزعابي',  country: 'الإمارات', base: 7880 },
  { name: 'كارلوس ر.',     country: 'إسبانيا',  base: 7510 },
  { name: 'آنيا ك.',       country: 'روسيا',    base: 7190 },
  { name: 'سعيد المنصوري',  country: 'الإمارات', base: 6850 },
  { name: 'مي ل.',         country: 'الصين',    base: 6420 },
  { name: 'ديفيد س.',      country: 'أمريكا',   base: 6080 },
  { name: 'حمدان الشامسي',  country: 'الإمارات', base: 5740 },
  { name: 'إيلينا ب.',     country: 'إيطاليا',  base: 5390 },
  { name: 'عمر ف.',        country: 'مصر',      base: 5010 },
  { name: 'مريم البلوشي',   country: 'الإمارات', base: 4680 },
  { name: 'طارق ن.',       country: 'باكستان',  base: 4300 },
  { name: 'لوكاس ج.',      country: 'فرنسا',    base: 3950 },
  { name: 'نورة الحمادي',   country: 'الإمارات', base: 3600 },
  { name: 'بريا ر.',       country: 'الهند',    base: 3240 },
  { name: 'خالد العامري',   country: 'الإمارات', base: 2900 },
  { name: 'حسن أ.',        country: 'المغرب',   base: 2550 },
  { name: 'يوكي س.',       country: 'اليابان',  base: 2200 },
  { name: 'شيخة الظاهري',   country: 'الإمارات', base: 1870 },
  { name: 'ماركو ب.',      country: 'ألمانيا',  base: 1520 },
  { name: 'عائشة ب.',      country: 'نيجيريا',  base: 1180 },
];
