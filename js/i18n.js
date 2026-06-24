/* ===== نظام التعدّد اللغوي (i18n) — عربي / إنجليزي ===== */
(function () {
  'use strict';

  const STRINGS = {
    ar: {
      tagline: 'تمرّن، اجمع نقاطاً، وتصدّر العالم',
      name_label: 'الاسم',
      name_ph: 'اكتب اسمك',
      choose_char: 'اختر شخصيتك',
      male: 'رجل', male_sub: 'كندورة وغترة',
      female: 'أنثى', female_sub: 'عباية وشيلة',
      start: 'ابدأ',
      default_player: 'لاعب',
      rank_label: 'الترتيب العالمي',
      level: 'المستوى',
      level_hint: 'باقي {n} نقطة للمستوى {m}',
      streak: 'أيام متتالية',
      workouts_done: 'تمرين مكتمل',
      owned: 'قطعة مملوكة',
      start_workout: 'ابدأ تمرين',
      workouts_title: 'التمارين',
      workouts_sub: 'كل تمرين يمنحك نقاطاً ترفع تصنيفك وعملات للشراء.',
      shop_title: 'المتجر',
      shop_sub: 'اشترِ ملابس وإكسسوارات لشخصيتك. لا تملك عملات كافية؟ شاهد فيديو واكسب.',
      watch_video: 'شاهد فيديو واكسب 50',
      lb_title: 'المتصدرون',
      lb_sub: 'تنافس مع لاعبين من حول العالم. اجمع نقاطاً لترتفع.',
      nav_home: 'الرئيسية', nav_workouts: 'تمارين', nav_shop: 'المتجر', nav_rank: 'التصنيف',
      goal_reps: 'الهدف: {n} عدّة',
      goal_hold: 'اثبت {n} ثانية',
      hint_pre_hold: 'ضع جهازك على جسمك واضغط ابدأ',
      hint_pre_reps: 'امسك جهازك وحرّكه مع كل عدّة',
      hint_hold: 'اثبت بثبات… لا تتحرّك',
      hint_reps: 'حرّك جهازك مع كل عدّة',
      hint_hold_ok: 'ممتاز… استمر بالثبات',
      hint_hold_move: 'ثبّت! لا تتحرّك',
      hint_manual_hold: 'اضغط مع الاستمرار وثبّت',
      hint_manual_reps: 'لا يوجد مستشعر — اضغط لكل عدّة',
      press_hold: 'اضغط مع الاستمرار',
      tap_rep: 'عدّة +1',
      verified: 'تم التحقّق — أحسنت!',
      cancel: 'إلغاء',
      ad_label: 'إعلان',
      ad_playing: 'جارٍ تشغيل الفيديو…',
      buy: 'شراء', equip: 'ارتدِ', equipped: 'مُرتدى', free: 'مجاني',
      toast_no_coins: 'لا تملك عملات كافية — شاهد فيديو',
      toast_bought: 'تم شراء {name}',
      toast_equipped: 'ارتديت {name}',
      toast_reward: '+{n} مكافأة المشاهدة',
      you: '(أنت)',
      nav_profile: 'الملف',
      profile_title: 'الملف الشخصي',
      your_stats: 'إحصاءاتك',
      achievements: 'الإنجازات',
      total_points: 'مجموع النقاط',
      ach_progress: '{n} من {m}',
      levelup_title: 'مستوى جديد!',
      levelup_sub: 'وصلت للمستوى {n}',
      reward_coins: '+{n} عملة مكافأة',
      awesome: 'رائع!',
      ach_unlocked: 'إنجاز جديد: {name}',
      lang_name: 'العربية',
    },
    en: {
      tagline: 'Train, earn points, top the world',
      name_label: 'Name',
      name_ph: 'Enter your name',
      choose_char: 'Choose your character',
      male: 'Male', male_sub: 'Kandura & Ghutra',
      female: 'Female', female_sub: 'Abaya & Shayla',
      start: 'Start',
      default_player: 'Player',
      rank_label: 'Global rank',
      level: 'Level',
      level_hint: '{n} pts to level {m}',
      streak: 'Day streak',
      workouts_done: 'Workouts',
      owned: 'Items owned',
      start_workout: 'Start workout',
      workouts_title: 'Workouts',
      workouts_sub: 'Every workout earns points to climb the ranks and coins to spend.',
      shop_title: 'Shop',
      shop_sub: 'Buy outfits and accessories for your character. Low on coins? Watch a video to earn more.',
      watch_video: 'Watch a video, earn 50',
      lb_title: 'Leaderboard',
      lb_sub: 'Compete with players around the world. Earn points to climb.',
      nav_home: 'Home', nav_workouts: 'Workouts', nav_shop: 'Shop', nav_rank: 'Ranking',
      goal_reps: 'Goal: {n} reps',
      goal_hold: 'Hold for {n}s',
      hint_pre_hold: 'Place the device on your body and press Start',
      hint_pre_reps: 'Hold your device and move it with every rep',
      hint_hold: 'Hold steady… don’t move',
      hint_reps: 'Move your device with every rep',
      hint_hold_ok: 'Great… keep holding',
      hint_hold_move: 'Steady! Don’t move',
      hint_manual_hold: 'Press and hold steady',
      hint_manual_reps: 'No motion sensor — tap for each rep',
      press_hold: 'Press and hold',
      tap_rep: 'Rep +1',
      verified: 'Verified — well done!',
      cancel: 'Cancel',
      ad_label: 'Ad',
      ad_playing: 'Playing video…',
      buy: 'Buy', equip: 'Equip', equipped: 'Equipped', free: 'Free',
      toast_no_coins: 'Not enough coins — watch a video',
      toast_bought: '{name} purchased',
      toast_equipped: '{name} equipped',
      toast_reward: '+{n} watch reward',
      you: '(You)',
      nav_profile: 'Profile',
      profile_title: 'Profile',
      your_stats: 'Your stats',
      achievements: 'Achievements',
      total_points: 'Total points',
      ach_progress: '{n} of {m}',
      levelup_title: 'Level up!',
      levelup_sub: 'You reached level {n}',
      reward_coins: '+{n} coins bonus',
      awesome: 'Awesome!',
      ach_unlocked: 'Achievement: {name}',
      lang_name: 'English',
    },
  };

  let LANG = localStorage.getItem('falaj_lang');
  if (!LANG) LANG = (navigator.language || 'en').toLowerCase().startsWith('ar') ? 'ar' : 'en';

  function t(key, vars) {
    let s = (STRINGS[LANG] && STRINGS[LANG][key] != null) ? STRINGS[LANG][key] : (STRINGS.ar[key] || key);
    if (vars) for (const k in vars) s = s.split('{' + k + '}').join(vars[k]);
    return s;
  }
  // اختيار حقل مترجم من كائن البيانات (name / name_en ...)
  function loc(obj, field) {
    if (!obj) return '';
    return LANG === 'en' ? (obj[field + '_en'] || obj[field]) : obj[field];
  }
  function applyDir() {
    const el = document.documentElement;
    el.lang = LANG;
    el.dir = LANG === 'ar' ? 'rtl' : 'ltr';
  }
  function applyStatic(root) {
    (root || document).querySelectorAll('[data-i18n]').forEach(e => { e.textContent = t(e.dataset.i18n); });
    (root || document).querySelectorAll('[data-i18n-ph]').forEach(e => { e.placeholder = t(e.dataset.i18nPh); });
  }
  function setLang(l) {
    LANG = l;
    localStorage.setItem('falaj_lang', l);
    applyDir();
  }

  applyDir();

  window.I18N = {
    t, loc, setLang, applyStatic, applyDir,
    get lang() { return LANG; },
    other() { return LANG === 'ar' ? 'en' : 'ar'; },
    otherLabel() { return LANG === 'ar' ? 'EN' : 'ع'; },
  };
})();
