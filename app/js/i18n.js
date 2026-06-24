/* ===== FALAJ — Multilingual support (EN / AR / UR / HI) =====
   Friendly smart-farming app. Arabic & Urdu render right-to-left. */

const LANGS = [
  { code: 'en', name: 'English',  native: 'English', dir: 'ltr', flag: '🇬🇧' },
  { code: 'ar', name: 'Arabic',   native: 'العربية', dir: 'rtl', flag: '🇦🇪' },
  { code: 'ur', name: 'Urdu',     native: 'اردو',    dir: 'rtl', flag: '🇵🇰' },
  { code: 'hi', name: 'Hindi',    native: 'हिन्दी',   dir: 'ltr', flag: '🇮🇳' },
];

const I18N = {
  en: {
    'app.name': 'FALAJ',
    'common.skip': 'Skip', 'common.next': 'Next', 'common.back': 'Back',
    'common.save': 'Save', 'common.clear': 'Clear', 'common.viewAll': 'View all',
    'common.getStarted': 'Get Started', 'common.continue': 'Continue', 'common.done': 'Done',

    'ob.s1.title': 'Farming made easy',
    'ob.s1.body': 'Let us help you get started on your journey to becoming a plant parent in very little time.',
    'ob.s2.title': 'Harvesting becomes fun',
    'ob.s2.body': 'We have a team of experts to help keep your farm healthy and disease-free.',
    'ob.s3.title': 'Boost your yields',
    'ob.s3.body': 'Become a successful farmer and bring your produce to the market.',

    'auth.login': 'Log in', 'auth.signup': 'Sign Up',
    'auth.username': 'User Name / Email', 'auth.name': 'User Name',
    'auth.email': 'Email', 'auth.password': 'Password', 'auth.confirm': 'Confirm Password',
    'auth.forgot': 'Forgot password?',
    'auth.orLogin': 'Or log in with', 'auth.orSignup': 'Or sign up with',
    'auth.noAccount': "Don't have an account?", 'auth.haveAccount': 'Already have an account?',
    'auth.enterEmail': 'Enter email', 'auth.sendCode': 'Send Code', 'auth.verify': 'Verify',
    'auth.savePass': 'Save Password', 'auth.otpHint': 'You will get an OTP by mail in 15 seconds',
    'auth.resetTitle': 'Reset password', 'auth.newPass': 'Enter Password',
    'auth.mismatch': 'Your passwords do not match.',
    'pass.min': 'Minimum 8 characters', 'pass.case': 'An uppercase & lowercase',
    'pass.special': 'A special character',

    'farm.add': 'Add farm details',
    'farm.intro': 'In the registration form, if unsure or lacking specific information, use an approximate value or “–” to indicate missing data. Completing all fields is required.',
    'farm.name': 'The farm Name', 'farm.enter': 'Enter Details',
    'farm.location': 'Farm Location', 'farm.country': 'Select Country', 'farm.state': 'Select State',
    'farm.city': 'Select City', 'farm.pincode': 'Enter Pincode',
    'farm.field': 'Select Field', 'farm.clickField': 'Click here to select your field',
    'farm.selectField': 'Select Field', 'farm.saveField': 'Save field',
    'farm.waterUse': 'Monthly water consumption', 'farm.waterCost': 'Monthly water cost',
    'farm.monthRev': 'Farm monthly revenue', 'farm.annualRev': 'Farm annual revenue',
    'farm.monthExp': 'Monthly total expenses', 'farm.annualExp': 'Annual total expenses',
    'farm.otherExp': 'Other expenses (pesticides, fertilizer, seeds)',
    'farm.cropsType': 'Type of crops farmed', 'farm.desc': 'Description',

    'nav.home': 'Home', 'nav.fields': 'Fields', 'nav.support': 'Support', 'nav.settings': 'Settings',
    'home.morning': 'Good Morning', 'home.afternoon': 'Good Afternoon', 'home.evening': 'Good Evening',
    'home.hello': 'Hello,', 'home.today': 'Today', 'home.wind': 'Wind', 'home.rain': 'Rain',
    'home.market': "Today's market", 'home.myFields': 'My Fields',
    'weather.cloudy': 'Cloudy', 'weather.sunny': 'Sunny', 'weather.clear': 'Clear',

    'field.water': 'Water level', 'field.normal': 'Normal',
    'field.expense': 'Expense', 'field.revenue': 'Revenue', 'field.perKg': '/ kg',

    'fd.field': 'Field', 'fd.cropHealth': 'Crop Health', 'fd.good': 'Good', 'fd.fair': 'Fair',
    'fd.planting': 'Planting Date', 'fd.revenue': 'Revenue', 'fd.harvest': 'Harvest time',
    'fd.months': '~{n} Months', 'fd.waterTitle': 'Water Consumption',
    'fd.waterUse': 'Water consumption', 'fd.workTime': 'Working time', 'fd.workedHa': 'Worked hectares',
    'fd.expTitle': 'Expense', 'fd.totalExp': 'Total Expense',
    'exp.seeds': 'Seeds', 'exp.fertilizer': 'Fertilizer', 'exp.pesticide': 'Pesticide', 'exp.chemicals': 'Chemicals',
    'days': 'Days',

    'notif.title': 'Notifications', 'notif.empty': "You're all caught up",
    'notif.emptyHint': 'Come back later for reminders, water tips, harvest and new event notifications.',
    'notif.weather': "Tomorrow looks sunny ahead! Don't forget to plan your tasks accordingly. Happy farming!",
    'notif.water': "Don't forget to hydrate your crops! It's time for a watering reminder.",
    'notif.harvest': "Time to reap what you've sown! Don't miss out on harvesting your crops.",
    'notif.checkin': "Monthly check-in time! Update your farm's details for accurate records and planning.",
    'notif.event': "Exciting news! Don't miss our upcoming event — learning, networking and fun.",
    'notif.market': 'Stay ahead of the game! Time for a market price update reminder.',

    'set.title': 'Settings', 'set.language': 'Language', 'set.profile': 'Profile',
    'set.about': 'About FALAJ', 'set.logout': 'Log out',
    'set.aboutBody': 'FALAJ is a smart irrigation system that uses IoT technology to optimize water usage in agriculture — saving water, increasing productivity and lowering costs for farmers.',
    'support.title': 'Support', 'support.body': 'Our agriculture experts are here to help. Reach us anytime.',
    'support.chat': 'Start a chat', 'support.call': 'Call us',

    'crop.tomato': 'Tomato', 'crop.potato': 'Potato', 'crop.dates': 'Dates',
    'crop.maize': 'Maize', 'crop.wheat': 'Wheat',
  },

  ar: {
    'app.name': 'فلج',
    'common.skip': 'تخطّي', 'common.next': 'التالي', 'common.back': 'رجوع',
    'common.save': 'حفظ', 'common.clear': 'مسح', 'common.viewAll': 'عرض الكل',
    'common.getStarted': 'لنبدأ', 'common.continue': 'متابعة', 'common.done': 'تم',

    'ob.s1.title': 'الزراعة بكل سهولة',
    'ob.s1.body': 'دعنا نساعدك على بدء رحلتك في الزراعة في وقت قصير جداً.',
    'ob.s2.title': 'الحصاد يصبح ممتعاً',
    'ob.s2.body': 'لدينا فريق من الخبراء للحفاظ على مزرعتك صحّية وخالية من الأمراض.',
    'ob.s3.title': 'ضاعِف إنتاجك',
    'ob.s3.body': 'كُن مزارعاً ناجحاً وأوصِل محصولك إلى السوق.',

    'auth.login': 'تسجيل الدخول', 'auth.signup': 'إنشاء حساب',
    'auth.username': 'اسم المستخدم / البريد', 'auth.name': 'اسم المستخدم',
    'auth.email': 'البريد الإلكتروني', 'auth.password': 'كلمة المرور', 'auth.confirm': 'تأكيد كلمة المرور',
    'auth.forgot': 'نسيت كلمة المرور؟',
    'auth.orLogin': 'أو سجّل الدخول عبر', 'auth.orSignup': 'أو أنشئ حساباً عبر',
    'auth.noAccount': 'ليس لديك حساب؟', 'auth.haveAccount': 'لديك حساب بالفعل؟',
    'auth.enterEmail': 'أدخل البريد', 'auth.sendCode': 'إرسال الرمز', 'auth.verify': 'تحقّق',
    'auth.savePass': 'حفظ كلمة المرور', 'auth.otpHint': 'ستصلك رسالة برمز التحقق خلال ١٥ ثانية',
    'auth.resetTitle': 'إعادة تعيين كلمة المرور', 'auth.newPass': 'أدخل كلمة المرور',
    'auth.mismatch': 'كلمتا المرور غير متطابقتين.',
    'pass.min': '٨ أحرف على الأقل', 'pass.case': 'حرف كبير وصغير',
    'pass.special': 'رمز خاص واحد',

    'farm.add': 'إضافة تفاصيل المزرعة',
    'farm.intro': 'في نموذج التسجيل، إن لم تكن متأكداً أو تنقصك معلومة، استخدم قيمة تقريبية أو «–» للإشارة إلى نقص البيانات. تعبئة كل الحقول مطلوبة.',
    'farm.name': 'اسم المزرعة', 'farm.enter': 'أدخل التفاصيل',
    'farm.location': 'موقع المزرعة', 'farm.country': 'اختر الدولة', 'farm.state': 'اختر الإمارة',
    'farm.city': 'اختر المدينة', 'farm.pincode': 'الرمز البريدي',
    'farm.field': 'تحديد الحقل', 'farm.clickField': 'اضغط هنا لتحديد حقلك',
    'farm.selectField': 'تحديد الحقل', 'farm.saveField': 'حفظ الحقل',
    'farm.waterUse': 'استهلاك الماء الشهري', 'farm.waterCost': 'تكلفة الماء الشهرية',
    'farm.monthRev': 'الإيراد الشهري', 'farm.annualRev': 'الإيراد السنوي',
    'farm.monthExp': 'إجمالي المصروفات الشهرية', 'farm.annualExp': 'إجمالي المصروفات السنوية',
    'farm.otherExp': 'مصروفات أخرى (مبيدات، سماد، بذور)',
    'farm.cropsType': 'نوع المحاصيل المزروعة', 'farm.desc': 'الوصف',

    'nav.home': 'الرئيسية', 'nav.fields': 'الحقول', 'nav.support': 'الدعم', 'nav.settings': 'الإعدادات',
    'home.morning': 'صباح الخير', 'home.afternoon': 'مساء الخير', 'home.evening': 'مساء الخير',
    'home.hello': 'مرحباً،', 'home.today': 'اليوم', 'home.wind': 'الرياح', 'home.rain': 'المطر',
    'home.market': 'سوق اليوم', 'home.myFields': 'حقولي',
    'weather.cloudy': 'غائم', 'weather.sunny': 'مشمس', 'weather.clear': 'صافٍ',

    'field.water': 'مستوى الماء', 'field.normal': 'طبيعي',
    'field.expense': 'المصروف', 'field.revenue': 'الإيراد', 'field.perKg': '/ كجم',

    'fd.field': 'الحقل', 'fd.cropHealth': 'صحة المحصول', 'fd.good': 'جيدة', 'fd.fair': 'متوسطة',
    'fd.planting': 'تاريخ الزراعة', 'fd.revenue': 'الإيراد', 'fd.harvest': 'موعد الحصاد',
    'fd.months': '~{n} أشهر', 'fd.waterTitle': 'استهلاك الماء',
    'fd.waterUse': 'استهلاك الماء', 'fd.workTime': 'وقت العمل', 'fd.workedHa': 'هكتارات مزروعة',
    'fd.expTitle': 'المصروفات', 'fd.totalExp': 'إجمالي المصروفات',
    'exp.seeds': 'بذور', 'exp.fertilizer': 'سماد', 'exp.pesticide': 'مبيدات', 'exp.chemicals': 'كيماويات',
    'days': 'الأيام',

    'notif.title': 'الإشعارات', 'notif.empty': 'لا جديد لديك',
    'notif.emptyHint': 'عُد لاحقاً لتذكيرات الريّ ونصائح الماء والحصاد وإشعارات الفعاليات الجديدة.',
    'notif.weather': 'غداً مشمس! لا تنسَ تخطيط مهامك وفقاً لذلك. زراعةً سعيدة!',
    'notif.water': 'لا تنسَ ريّ محاصيلك! حان وقت تذكير الريّ.',
    'notif.harvest': 'حان وقت حصاد ما زرعت! لا تفوّت حصاد محاصيلك.',
    'notif.checkin': 'موعد المراجعة الشهرية! حدّث تفاصيل مزرعتك لسجلات وتخطيط دقيق.',
    'notif.event': 'أخبار رائعة! لا تفوّت فعاليتنا القادمة — تعلّم وتواصل ومتعة.',
    'notif.market': 'كُن في الصدارة! حان وقت تذكير تحديث أسعار السوق.',

    'set.title': 'الإعدادات', 'set.language': 'اللغة', 'set.profile': 'الملف الشخصي',
    'set.about': 'عن فلج', 'set.logout': 'تسجيل الخروج',
    'set.aboutBody': 'فلج نظام ريّ ذكي يستخدم تقنية إنترنت الأشياء لتحسين استهلاك المياه في الزراعة — يوفّر الماء، يرفع الإنتاجية، ويخفّض التكاليف للمزارعين.',
    'support.title': 'الدعم', 'support.body': 'خبراؤنا الزراعيون هنا لمساعدتك. تواصل معنا في أي وقت.',
    'support.chat': 'ابدأ محادثة', 'support.call': 'اتصل بنا',

    'crop.tomato': 'طماطم', 'crop.potato': 'بطاطس', 'crop.dates': 'تمر',
    'crop.maize': 'ذرة', 'crop.wheat': 'قمح',
  },

  ur: {
    'app.name': 'فلج',
    'common.skip': 'چھوڑیں', 'common.next': 'اگلا', 'common.back': 'واپس',
    'common.save': 'محفوظ', 'common.clear': 'صاف کریں', 'common.viewAll': 'سب دیکھیں',
    'common.getStarted': 'شروع کریں', 'common.continue': 'جاری رکھیں', 'common.done': 'مکمل',

    'ob.s1.title': 'کاشتکاری آسان بنائی',
    'ob.s1.body': 'بہت کم وقت میں کسان بننے کے سفر میں ہم آپ کی مدد کرتے ہیں۔',
    'ob.s2.title': 'کٹائی مزیدار بن گئی',
    'ob.s2.body': 'آپ کے فارم کو صحت مند اور بیماری سے پاک رکھنے کے لیے ماہرین کی ٹیم موجود ہے۔',
    'ob.s3.title': 'اپنی پیداوار بڑھائیں',
    'ob.s3.body': 'کامیاب کسان بنیں اور اپنی پیداوار مارکیٹ تک پہنچائیں۔',

    'auth.login': 'لاگ اِن', 'auth.signup': 'سائن اپ',
    'auth.username': 'یوزر نیم / ای میل', 'auth.name': 'یوزر نیم',
    'auth.email': 'ای میل', 'auth.password': 'پاس ورڈ', 'auth.confirm': 'پاس ورڈ کی تصدیق',
    'auth.forgot': 'پاس ورڈ بھول گئے؟',
    'auth.orLogin': 'یا اس سے لاگ اِن کریں', 'auth.orSignup': 'یا اس سے سائن اپ کریں',
    'auth.noAccount': 'اکاؤنٹ نہیں ہے؟', 'auth.haveAccount': 'پہلے سے اکاؤنٹ ہے؟',
    'auth.enterEmail': 'ای میل درج کریں', 'auth.sendCode': 'کوڈ بھیجیں', 'auth.verify': 'تصدیق',
    'auth.savePass': 'پاس ورڈ محفوظ کریں', 'auth.otpHint': '15 سیکنڈ میں ای میل پر OTP موصول ہوگا',
    'auth.resetTitle': 'پاس ورڈ ری سیٹ کریں', 'auth.newPass': 'پاس ورڈ درج کریں',
    'auth.mismatch': 'آپ کے پاس ورڈ مماثل نہیں۔',
    'pass.min': 'کم از کم 8 حروف', 'pass.case': 'بڑا اور چھوٹا حرف',
    'pass.special': 'ایک خاص حرف',

    'farm.add': 'فارم کی تفصیلات شامل کریں',
    'farm.intro': 'رجسٹریشن فارم میں اگر یقین نہ ہو یا معلومات کم ہو تو تخمینی قیمت یا «–» استعمال کریں۔ تمام خانے بھرنا لازمی ہے۔',
    'farm.name': 'فارم کا نام', 'farm.enter': 'تفصیلات درج کریں',
    'farm.location': 'فارم کا مقام', 'farm.country': 'ملک منتخب کریں', 'farm.state': 'ریاست منتخب کریں',
    'farm.city': 'شہر منتخب کریں', 'farm.pincode': 'پن کوڈ درج کریں',
    'farm.field': 'کھیت منتخب کریں', 'farm.clickField': 'اپنا کھیت منتخب کرنے کے لیے یہاں کلک کریں',
    'farm.selectField': 'کھیت منتخب کریں', 'farm.saveField': 'کھیت محفوظ کریں',
    'farm.waterUse': 'ماہانہ پانی کا استعمال', 'farm.waterCost': 'ماہانہ پانی کی لاگت',
    'farm.monthRev': 'فارم کی ماہانہ آمدنی', 'farm.annualRev': 'فارم کی سالانہ آمدنی',
    'farm.monthExp': 'کل ماہانہ اخراجات', 'farm.annualExp': 'کل سالانہ اخراجات',
    'farm.otherExp': 'دیگر اخراجات (کیڑے مار دوا، کھاد، بیج)',
    'farm.cropsType': 'کاشت کی گئی فصلوں کی قسم', 'farm.desc': 'تفصیل',

    'nav.home': 'ہوم', 'nav.fields': 'کھیت', 'nav.support': 'سپورٹ', 'nav.settings': 'ترتیبات',
    'home.morning': 'صبح بخیر', 'home.afternoon': 'سہ پہر بخیر', 'home.evening': 'شام بخیر',
    'home.hello': 'سلام،', 'home.today': 'آج', 'home.wind': 'ہوا', 'home.rain': 'بارش',
    'home.market': 'آج کی مارکیٹ', 'home.myFields': 'میرے کھیت',
    'weather.cloudy': 'ابر آلود', 'weather.sunny': 'دھوپ', 'weather.clear': 'صاف',

    'field.water': 'پانی کی سطح', 'field.normal': 'نارمل',
    'field.expense': 'اخراجات', 'field.revenue': 'آمدنی', 'field.perKg': '/ کلو',

    'fd.field': 'کھیت', 'fd.cropHealth': 'فصل کی صحت', 'fd.good': 'اچھی', 'fd.fair': 'درمیانی',
    'fd.planting': 'کاشت کی تاریخ', 'fd.revenue': 'آمدنی', 'fd.harvest': 'کٹائی کا وقت',
    'fd.months': '~{n} ماہ', 'fd.waterTitle': 'پانی کا استعمال',
    'fd.waterUse': 'پانی کا استعمال', 'fd.workTime': 'کام کا وقت', 'fd.workedHa': 'کاشت شدہ ہیکٹر',
    'fd.expTitle': 'اخراجات', 'fd.totalExp': 'کل اخراجات',
    'exp.seeds': 'بیج', 'exp.fertilizer': 'کھاد', 'exp.pesticide': 'کیڑے مار دوا', 'exp.chemicals': 'کیمیکل',
    'days': 'دن',

    'notif.title': 'اطلاعات', 'notif.empty': 'سب کچھ دیکھ لیا',
    'notif.emptyHint': 'ریمائنڈرز، پانی کی تجاویز، کٹائی اور نئے ایونٹ کی اطلاعات کے لیے بعد میں آئیں۔',
    'notif.weather': 'کل دھوپ متوقع ہے! اپنے کام اسی حساب سے ترتیب دیں۔ خوش کاشتکاری!',
    'notif.water': 'اپنی فصلوں کو پانی دینا نہ بھولیں! آبپاشی کا وقت ہے۔',
    'notif.harvest': 'جو بویا ہے اسے کاٹنے کا وقت! فصل کی کٹائی نہ چھوڑیں۔',
    'notif.checkin': 'ماہانہ جائزے کا وقت! درست ریکارڈ کے لیے فارم کی تفصیلات اپڈیٹ کریں۔',
    'notif.event': 'دلچسپ خبر! ہمارے آنے والے ایونٹ کو نہ چھوڑیں — سیکھنا، رابطہ اور تفریح۔',
    'notif.market': 'آگے رہیں! مارکیٹ قیمت اپڈیٹ کا وقت ہے۔',

    'set.title': 'ترتیبات', 'set.language': 'زبان', 'set.profile': 'پروفائل',
    'set.about': 'فلج کے بارے میں', 'set.logout': 'لاگ آؤٹ',
    'set.aboutBody': 'فلج ایک سمارٹ آبپاشی نظام ہے جو IoT ٹیکنالوجی سے زراعت میں پانی کے استعمال کو بہتر بناتا ہے — پانی بچاتا ہے، پیداوار بڑھاتا ہے اور لاگت کم کرتا ہے۔',
    'support.title': 'سپورٹ', 'support.body': 'ہمارے زرعی ماہرین مدد کے لیے حاضر ہیں۔ کسی بھی وقت رابطہ کریں۔',
    'support.chat': 'چیٹ شروع کریں', 'support.call': 'ہمیں کال کریں',

    'crop.tomato': 'ٹماٹر', 'crop.potato': 'آلو', 'crop.dates': 'کھجور',
    'crop.maize': 'مکئی', 'crop.wheat': 'گندم',
  },

  hi: {
    'app.name': 'फलज',
    'common.skip': 'छोड़ें', 'common.next': 'आगे', 'common.back': 'वापस',
    'common.save': 'सहेजें', 'common.clear': 'साफ़ करें', 'common.viewAll': 'सभी देखें',
    'common.getStarted': 'शुरू करें', 'common.continue': 'जारी रखें', 'common.done': 'पूर्ण',

    'ob.s1.title': 'खेती हुई आसान',
    'ob.s1.body': 'बहुत कम समय में किसान बनने की आपकी यात्रा में हम मदद करते हैं।',
    'ob.s2.title': 'कटाई बनी मज़ेदार',
    'ob.s2.body': 'आपके फ़ार्म को स्वस्थ और रोगमुक्त रखने के लिए विशेषज्ञों की टीम है।',
    'ob.s3.title': 'अपनी उपज बढ़ाएँ',
    'ob.s3.body': 'सफल किसान बनें और अपनी उपज बाज़ार तक पहुँचाएँ।',

    'auth.login': 'लॉग इन', 'auth.signup': 'साइन अप',
    'auth.username': 'यूज़र नेम / ईमेल', 'auth.name': 'यूज़र नेम',
    'auth.email': 'ईमेल', 'auth.password': 'पासवर्ड', 'auth.confirm': 'पासवर्ड की पुष्टि',
    'auth.forgot': 'पासवर्ड भूल गए?',
    'auth.orLogin': 'या इससे लॉग इन करें', 'auth.orSignup': 'या इससे साइन अप करें',
    'auth.noAccount': 'खाता नहीं है?', 'auth.haveAccount': 'पहले से खाता है?',
    'auth.enterEmail': 'ईमेल दर्ज करें', 'auth.sendCode': 'कोड भेजें', 'auth.verify': 'सत्यापित करें',
    'auth.savePass': 'पासवर्ड सहेजें', 'auth.otpHint': '15 सेकंड में ईमेल पर OTP मिलेगा',
    'auth.resetTitle': 'पासवर्ड रीसेट करें', 'auth.newPass': 'पासवर्ड दर्ज करें',
    'auth.mismatch': 'आपके पासवर्ड मेल नहीं खाते।',
    'pass.min': 'न्यूनतम 8 अक्षर', 'pass.case': 'एक बड़ा व छोटा अक्षर',
    'pass.special': 'एक विशेष अक्षर',

    'farm.add': 'फ़ार्म विवरण जोड़ें',
    'farm.intro': 'रजिस्ट्रेशन फ़ॉर्म में अनिश्चित होने या जानकारी न होने पर अनुमानित मान या «–» का उपयोग करें। सभी फ़ील्ड भरना आवश्यक है।',
    'farm.name': 'फ़ार्म का नाम', 'farm.enter': 'विवरण दर्ज करें',
    'farm.location': 'फ़ार्म स्थान', 'farm.country': 'देश चुनें', 'farm.state': 'राज्य चुनें',
    'farm.city': 'शहर चुनें', 'farm.pincode': 'पिनकोड दर्ज करें',
    'farm.field': 'खेत चुनें', 'farm.clickField': 'अपना खेत चुनने के लिए यहाँ क्लिक करें',
    'farm.selectField': 'खेत चुनें', 'farm.saveField': 'खेत सहेजें',
    'farm.waterUse': 'मासिक जल खपत', 'farm.waterCost': 'मासिक जल लागत',
    'farm.monthRev': 'फ़ार्म मासिक राजस्व', 'farm.annualRev': 'फ़ार्म वार्षिक राजस्व',
    'farm.monthExp': 'कुल मासिक व्यय', 'farm.annualExp': 'कुल वार्षिक व्यय',
    'farm.otherExp': 'अन्य व्यय (कीटनाशक, खाद, बीज)',
    'farm.cropsType': 'उगाई गई फसलों के प्रकार', 'farm.desc': 'विवरण',

    'nav.home': 'होम', 'nav.fields': 'खेत', 'nav.support': 'सहायता', 'nav.settings': 'सेटिंग्स',
    'home.morning': 'सुप्रभात', 'home.afternoon': 'नमस्कार', 'home.evening': 'शुभ संध्या',
    'home.hello': 'नमस्ते,', 'home.today': 'आज', 'home.wind': 'हवा', 'home.rain': 'वर्षा',
    'home.market': 'आज का बाज़ार', 'home.myFields': 'मेरे खेत',
    'weather.cloudy': 'बादल', 'weather.sunny': 'धूप', 'weather.clear': 'साफ़',

    'field.water': 'जल स्तर', 'field.normal': 'सामान्य',
    'field.expense': 'व्यय', 'field.revenue': 'राजस्व', 'field.perKg': '/ किग्रा',

    'fd.field': 'खेत', 'fd.cropHealth': 'फसल स्वास्थ्य', 'fd.good': 'अच्छा', 'fd.fair': 'ठीक',
    'fd.planting': 'रोपण तिथि', 'fd.revenue': 'राजस्व', 'fd.harvest': 'कटाई समय',
    'fd.months': '~{n} माह', 'fd.waterTitle': 'जल खपत',
    'fd.waterUse': 'जल खपत', 'fd.workTime': 'कार्य समय', 'fd.workedHa': 'जोते गए हेक्टेयर',
    'fd.expTitle': 'व्यय', 'fd.totalExp': 'कुल व्यय',
    'exp.seeds': 'बीज', 'exp.fertilizer': 'खाद', 'exp.pesticide': 'कीटनाशक', 'exp.chemicals': 'रसायन',
    'days': 'दिन',

    'notif.title': 'सूचनाएँ', 'notif.empty': 'आप सब देख चुके हैं',
    'notif.emptyHint': 'रिमाइंडर, जल सुझाव, कटाई और नए इवेंट की सूचनाओं के लिए बाद में आएँ।',
    'notif.weather': 'कल धूप रहेगी! अपने कार्य उसी अनुसार नियोजित करें। शुभ खेती!',
    'notif.water': 'अपनी फसलों को पानी देना न भूलें! सिंचाई का समय है।',
    'notif.harvest': 'जो बोया उसे काटने का समय! फसल कटाई न चूकें।',
    'notif.checkin': 'मासिक जाँच का समय! सटीक रिकॉर्ड हेतु फ़ार्म विवरण अपडेट करें।',
    'notif.event': 'रोमांचक खबर! हमारे आगामी इवेंट को न चूकें — सीखना, नेटवर्किंग और मज़ा।',
    'notif.market': 'आगे रहें! बाज़ार मूल्य अपडेट का समय है।',

    'set.title': 'सेटिंग्स', 'set.language': 'भाषा', 'set.profile': 'प्रोफ़ाइल',
    'set.about': 'फलज के बारे में', 'set.logout': 'लॉग आउट',
    'set.aboutBody': 'फलज एक स्मार्ट सिंचाई प्रणाली है जो IoT तकनीक से खेती में पानी के उपयोग को अनुकूलित करती है — पानी बचाती है, उत्पादकता बढ़ाती है और लागत घटाती है।',
    'support.title': 'सहायता', 'support.body': 'हमारे कृषि विशेषज्ञ मदद के लिए हैं। कभी भी संपर्क करें।',
    'support.chat': 'चैट शुरू करें', 'support.call': 'हमें कॉल करें',

    'crop.tomato': 'टमाटर', 'crop.potato': 'आलू', 'crop.dates': 'खजूर',
    'crop.maize': 'मक्का', 'crop.wheat': 'गेहूँ',
  },
};

let CURRENT_LANG = localStorage.getItem('falaj_lang') || 'en';

function t(key, params) {
  const dict = I18N[CURRENT_LANG] || I18N.en;
  let str = dict[key] != null ? dict[key] : (I18N.en[key] != null ? I18N.en[key] : key);
  if (params) for (const p in params) str = str.replace('{' + p + '}', params[p]);
  return str;
}
function langDir(code) {
  const l = LANGS.find(x => x.code === (code || CURRENT_LANG));
  return l ? l.dir : 'ltr';
}
function setLang(code) {
  if (!I18N[code]) return;
  CURRENT_LANG = code;
  localStorage.setItem('falaj_lang', code);
  document.documentElement.lang = code;
  document.documentElement.dir = langDir(code);
}
