// Ideas — demo seed: two challenges and ideas from across departments at every
// stage of the pipeline (votes, comments, committee scores, a sponsor, one idea
// implemented through an existing project). Dates are relative to today.
import * as K from '../kit.js';
import { objectivesSync, WEIGHTS, CRITERIA } from './service.js';

const T = (d, h = 9, m = 0) => K.at(-d, h, m);
const norm = (s) => String(s || '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

const CAMPAIGNS = [
  { id: 'camp_zero_bureaucracy', title_ar: 'تحدي تصفير البيروقراطية', title_en: 'Zero Bureaucracy Challenge',
    description_ar: 'ابحث عن إجراء أو نموذج أو موافقة يمكن إلغاؤها أو دمجها أو أتمتتها لتقليل الوقت والجهد على المتعاملين والموظفين. الأولوية للأفكار ذات الأثر القابل للقياس في زمن الخدمة وعدد الخطوات.',
    description_en: 'Find a procedure, form or approval that can be removed, merged or automated to save customers and staff time. Ideas with measurable impact on service time and number of steps come first.',
    starts: -35, ends: 16, sponsor: 'u_president', objective: /رقمنه الاجراءات/ },
  { id: 'camp_proactive_services', title_ar: 'تحدي الخدمات الاستباقية', title_en: 'Proactive Services Challenge',
    description_ar: 'كيف نقدّم الخدمة للمتعامل قبل أن يطلبها؟ شارك بأفكار تعتمد على البيانات لتذكير المتعاملين وتجديد خدماتهم تلقائياً وتقليل المراجعات.',
    description_en: 'How do we serve customers before they ask? Share data-driven ideas that remind customers, renew services automatically and cut visits.',
    starts: -12, ends: 45, sponsor: 'u_mariam', objective: /خدمات استباقيه/ },
];

// flow: [status, daysAgo, actor, note?]
const IDEAS = [
  { id: 'idea_demo01', obj: /رضا المتعاملين/, author: 'u_ahmed', cat: 'digital', camp: 'camp_zero_bureaucracy', saving: 120000, hours: 1800, happy: 'high',
    title: 'التحقق الآلي من المستندات عبر الهوية الرقمية',
    problem: 'نطلب من المتعاملين إرفاق نسخ من الهوية وشهادات صادرة من جهات حكومية أخرى، ثم نتحقق منها يدوياً. تستغرق المراجعة نحو 15 دقيقة لكل معاملة، وتُعاد قرابة 20% من الطلبات بسبب مرفقات ناقصة أو غير واضحة.',
    solution: 'الربط مع الهوية الرقمية وخدمة تبادل البيانات الحكومية لجلب المستندات الموثقة تلقائياً عند تقديم الطلب، وإلغاء شرط رفع المرفقات في 9 خدمات كمرحلة أولى، مع سجل تدقيق لكل استعلام.',
    flow: [['submitted', 24, 'u_ahmed'], ['screening', 21, 'u_latifa'], ['evaluation', 18, 'u_latifa', 'الفكرة مكتملة وقابلة للتقييم.']],
    scores: [['u_president', 5, 4, 3, 5, 'أثر مباشر على زمن المعاملة؛ الكلفة تعتمد على جاهزية الربط.', 14], ['u_latifa', 4, 4, 4, 5, 'متوافقة تماماً مع برنامج تصفير البيروقراطية.', 12]],
    votes: [['u_sara', 22], ['u_fatima', 20], ['u_omar', 19], ['u_noura', 17], ['u_hessa', 15], ['u_salem', 12], ['u_reem', 9], ['u_hamad', 6]],
    comments: [['u_fatima', 19, 'نواجه المشكلة نفسها في طلبات صرف المواد؛ هل يمكن أن يشمل الربط خدمات العمليات أيضاً؟'], ['u_ahmed', 18, 'نعم، سيكون الربط عبر واجهة موحدة تستطيع أي خدمة استخدامها دون تطوير إضافي.'], ['u_omar', 10, 'أقترح البدء بالخدمات الثلاث الأعلى طلباً لقياس الأثر بسرعة.']],
    follows: ['u_noura'] },
  { id: 'idea_demo02', obj: /رقمنه الاجراءات/, author: 'u_fatima', cat: 'process', camp: null, saving: 48000, hours: 620, happy: 'medium',
    title: 'دمج نماذج طلب صرف المواد في نموذج إلكتروني واحد',
    problem: 'يعبّئ الموظف سبعة نماذج ورقية مختلفة لطلب صرف المواد من المخازن حسب نوع المادة، وتمر بثلاث موافقات متتالية. يستغرق الاعتماد ثلاثة أيام عمل في المتوسط، وتُعاد طلبات كثيرة لاختيار نموذج خاطئ.',
    solution: 'نموذج إلكتروني واحد يتكيف حقوله حسب نوع المادة، مع اعتماد واحد من المدير المباشر للطلبات ضمن الحد المعتمد، وربط تلقائي برصيد المخزون.',
    flow: [['submitted', 72, 'u_fatima'], ['screening', 69, 'u_mariam'], ['evaluation', 66, 'u_mariam'], ['approved', 58, 'u_president', 'معتمدة. يُنفَّذ النموذج ضمن مشروع تحديث إجراءات التشغيل بإشراف إدارة العمليات.'], ['in_implementation', 55, 'u_omar'], ['implemented', 12, 'u_omar']],
    sponsor: 'u_omar', project: 'pr_procedures',
    benefits: { note: 'أُلغيت 7 نماذج ورقية، وانخفض زمن اعتماد طلب صرف المواد من 3 أيام عمل إلى 4 ساعات، وتراجعت الطلبات المعادة بنسبة 60% خلال أول شهرين.', saving: 52000, hours: 700 },
    scores: [['u_president', 4, 5, 5, 4, 'حل بسيط وسريع التطبيق.', 63], ['u_mariam', 4, 4, 5, 4, 'يمكن تنفيذه بأدوات النماذج الحالية دون كلفة ترخيص.', 62], ['u_latifa', 5, 5, 4, 4, 'أثر ملموس على رضا الموظفين.', 61]],
    votes: [['u_ahmed', 70], ['u_sara', 70], ['u_noura', 68], ['u_reem', 67], ['u_hessa', 66], ['u_salem', 64], ['u_yousef', 63], ['u_saeed', 60], ['u_hamad', 59], ['u_majed', 58]],
    comments: [['u_reem', 50, 'وفّر علينا في المشتريات مطابقة الطلبات يدوياً مع المخزون — شكراً!'], ['u_hessa', 11, 'نتطلع إلى تطبيق النهج نفسه على نماذج الموارد البشرية.']],
    follows: ['u_hessa'] },
  { id: 'idea_demo03', obj: /خدمات استباقيه/, author: 'u_sara', coauthors: ['u_ahmed'], cat: 'service', camp: 'camp_proactive_services', saving: 35000, hours: 900, happy: 'high',
    title: 'إشعار استباقي للمتعاملين قبل انتهاء صلاحية خدماتهم',
    problem: 'يكتشف كثير من المتعاملين انتهاء تصاريحهم أو اشتراكاتهم بعد فوات الموعد، فيراجعون مركز الخدمة ويدفعون رسوم تأخير، وترتفع الاتصالات الواردة في نهاية كل شهر.',
    solution: 'إرسال إشعارات عبر البوابة الموحدة والرسائل النصية قبل 30 و7 أيام من الانتهاء، مع رابط تجديد بنقرة واحدة للحالات التي لا تتغير بياناتها.',
    flow: [['submitted', 11, 'u_sara'], ['screening', 10, 'u_latifa'], ['evaluation', 9, 'u_latifa'], ['approved', 4, 'u_president', 'معتمدة كمرحلة أولى ضمن البوابة الموحدة، مع قياس نسبة التجديد قبل الانتهاء.'], ['in_implementation', 2, 'u_mariam']],
    sponsor: 'u_mariam', project: 'pr_portal',
    scores: [['u_president', 5, 4, 4, 5, 'نموذج واضح للخدمة الاستباقية.', 7], ['u_latifa', 5, 4, 4, 4, 'تتطلب ضبط موافقة المتعامل على الإشعارات.', 6], ['u_mariam', 5, 5, 4, 5, 'البنية التقنية متوفرة في البوابة.', 6]],
    votes: [['u_fatima', 10], ['u_omar', 9], ['u_noura', 8], ['u_hessa', 7], ['u_hamad', 5], ['u_yousef', 3]],
    comments: [['u_omar', 8, 'يمكن ربطها بمركز خدمة العملاء لتقليل الاتصالات الواردة عن التجديد.']] },
  { id: 'idea_demo04', obj: /كفاءه الانفاق/, author: 'u_noura', cat: 'cost', camp: 'camp_zero_bureaucracy', saving: 90000, hours: 1100, happy: 'low',
    title: 'أتمتة مطابقة الفواتير مع أوامر الشراء وسندات الاستلام',
    problem: 'تطابق المحاسبة كل فاتورة يدوياً مع أمر الشراء وسند الاستلام قبل الصرف، ما يؤخر سداد الموردين ويستهلك قرابة يومين أسبوعياً من وقت الفريق.',
    solution: 'مطابقة ثلاثية آلية تقارن البنود والكميات والأسعار، وتُحيل الفروقات فقط للمراجعة البشرية، مع لوحة لحالة كل فاتورة.',
    flow: [['submitted', 6, 'u_noura'], ['screening', 3, 'u_president']],
    votes: [['u_majed', 5], ['u_reem', 4], ['u_sara', 2]],
    comments: [['u_reem', 4, 'سنحتاج أولاً إلى توحيد صيغة أوامر الشراء — أستطيع المساعدة من جهة المشتريات.']] },
  { id: 'idea_demo05', obj: /رقمنه الاجراءات/, author: 'u_reem', cat: 'digital', camp: 'camp_zero_bureaucracy', saving: 60000, hours: 750, happy: 'medium',
    title: 'تحديث بيانات الموردين ذاتياً عبر البوابة',
    problem: 'يرسل الموردون تحديثات الرخص والحسابات البنكية بالبريد الإلكتروني، ويُدخلها قسم المشتريات يدوياً، ما يسبب أخطاء في الدفعات وتأخراً في التأهيل.',
    solution: 'تمكين الموردين من تحديث بياناتهم ومستنداتهم ذاتياً عبر منصة مقدمي الخدمات، مع تحقق آلي من صلاحية الرخص واعتماد تغييرات الحساب البنكي من المالية.',
    flow: [['submitted', 28, 'u_reem'], ['screening', 26, 'u_mariam'], ['evaluation', 22, 'u_mariam'], ['approved', 6, 'u_latifa', 'معتمدة للتنفيذ خلال الربع القادم بالتنسيق مع منصة مقدمي الخدمات، مع إشراك الشؤون القانونية في شروط الاستخدام.']],
    sponsor: 'u_majed',
    scores: [['u_president', 4, 4, 4, 3, null, 18], ['u_mariam', 4, 5, 4, 4, 'تتكامل مع منصة مقدمي الخدمات القائمة.', 17], ['u_latifa', 4, 4, 3, 4, null, 15]],
    votes: [['u_noura', 27], ['u_majed', 25], ['u_ahmed', 20], ['u_fatima', 14]] },
  { id: 'idea_demo06', obj: /استقطاب الكفاءات/, author: 'u_salem', cat: 'people', camp: 'camp_zero_bureaucracy', saving: null, hours: 480, happy: null,
    title: 'رحلة تعيين رقمية بلا ورق للموظف الجديد',
    problem: 'يحتاج الموظف الجديد إلى 11 توقيعاً ورقياً ومراجعة أربع إدارات قبل استلام بطاقة العمل والحاسوب، وتمتد الرحلة إلى أسبوعين أحياناً.',
    solution: 'رحلة تعيين رقمية واحدة تبدأ بعد قبول العرض: توقيع إلكتروني للنماذج، وطلبات تلقائية للأجهزة والصلاحيات، ولوحة متابعة للموظف ومديره.',
    flow: [['submitted', 19, 'u_salem'], ['screening', 16, 'u_latifa'], ['evaluation', 13, 'u_latifa'], ['needs_info', 5, 'u_latifa', 'فكرة واعدة. نرجو توضيح الأنظمة التي تحتاج إلى الربط (الموارد البشرية، التحول الرقمي، المالية) وتقدير الكلفة التقريبية وعدد التعيينات السنوية.']],
    scores: [['u_president', 4, 3, 3, 4, 'بحاجة إلى تقدير الكلفة قبل القرار.', 9]],
    votes: [['u_hessa', 18], ['u_sara', 15], ['u_fatima', 12], ['u_aisha', 8]],
    comments: [['u_hessa', 17, 'نستقبل قرابة 40 موظفاً جديداً سنوياً، والرحلة الحالية تتطلب 11 توقيعاً ورقياً.']] },
  { id: 'idea_demo07', obj: /المحفظه الاستراتيجيه/, author: 'u_hamad', cat: 'digital', camp: null, saving: null, hours: 320, happy: 'low',
    title: 'لوحة لحظية لمؤشرات المبادرات الاستراتيجية بدل التقارير الشهرية',
    problem: 'نجمع بيانات المبادرات الاستراتيجية شهرياً من ملفات متفرقة، فتصل الصورة للإدارة العليا متأخرة ثلاثة أسابيع أحياناً.',
    solution: 'لوحة لحظية تسحب التقدم من سجل المشاريع والمهام مباشرة، مع تنبيه تلقائي للمبادرات المتعثرة بدل التقرير الشهري اليدوي.',
    flow: [['submitted', 2, 'u_hamad']],
    votes: [['u_omar', 1], ['u_majed', 1]] },
  { id: 'idea_demo08', obj: /الحوكمه والامتثال/, author: 'u_yousef', cat: 'governance', camp: null, saving: 15000, hours: 260, happy: null,
    title: 'مكتبة نماذج عقود ذكية بحقول تُملأ تلقائياً',
    problem: 'تُصاغ العقود المتكررة من نسخ سابقة يدوياً، ما يؤدي إلى بنود قديمة أو غير متسقة ويطيل المراجعة القانونية.',
    solution: 'مكتبة نماذج عقود معتمدة بحقول تُملأ تلقائياً من بيانات الطلب، مع تمييز أي تعديل على البنود القياسية للمراجعة.',
    flow: [['submitted', 40, 'u_yousef'], ['screening', 37, 'u_mariam'], ['rejected', 31, 'u_mariam', 'الفكرة مشمولة في مشروع توحيد نماذج العقود الذي تنفذه إدارة المشتريات حالياً. نقترح ضم مقترحاتك إلى فريق المشروع بدلاً من مسار مستقل، ونشكرك على المبادرة.']],
    votes: [['u_reem', 39], ['u_majed', 38]] },
  { id: 'idea_demo09', obj: /الحوكمه والامتثال/, author: 'u_saeed', hide: true, cat: 'governance', camp: null, saving: null, hours: 900, happy: null,
    title: 'تدقيق مستمر آلي على المصروفات بقواعد إنذار مبكر',
    problem: 'يعتمد التدقيق على عينات دورية بعد إقفال الفترة، فتُكتشف المخالفات المتكررة أو المدفوعات المكررة متأخرة.',
    solution: 'قواعد آلية تعمل يومياً على بيانات الصرف (مدفوعات مكررة، تجزئة المشتريات، موردون جدد بمبالغ كبيرة) وتنبّه المدقق فقط دون إضافة أي خطوة موافقة.',
    flow: [['submitted', 14, 'u_saeed'], ['screening', 12, 'u_president'], ['evaluation', 9, 'u_president']],
    scores: [['u_latifa', 4, 3, 4, 4, 'يحتاج توضيح مصادر البيانات وحوكمة التنبيهات.', 7]],
    votes: [['u_aisha', 13], ['u_majed', 12], ['u_noura', 10], ['u_yousef', 6]],
    comments: [['u_majed', 11, 'مفيدة للرقابة المالية، بشرط ألا تضيف خطوات موافقة جديدة.'], ['u_saeed', 10, 'القواعد تعمل في الخلفية على بيانات الصرف ولا تضيف أي خطوة موافقة؛ تُرسل التنبيهات للمدقق فقط.']] },
  { id: 'idea_demo10', obj: /رضا المتعاملين/, author: 'u_omar', cat: 'service', camp: 'camp_proactive_services', saving: 40000, hours: 300, happy: 'medium',
    title: 'جدولة استباقية لصيانة المرافق بناءً على بيانات الأعطال',
    problem: 'تُجرى الصيانة بعد وقوع العطل غالباً، فتتعطل قاعات خدمة المتعاملين وأجهزة الانتظار في أوقات الذروة.',
    solution: 'تحليل سجل الأعطال لتحديد الأجهزة المرجح تعطلها، وجدولة صيانتها خارج أوقات الذروة مع إشعار الفرق مسبقاً.',
    flow: [['submitted', 3, 'u_omar']],
    votes: [['u_fatima', 2], ['u_ahmed', 1]] },
  { id: 'idea_demo11', obj: /سعاده الموظفين/, author: 'u_hessa', cat: 'process', camp: 'camp_zero_bureaucracy', saving: 25000, hours: 1400, happy: 'low',
    title: 'اعتماد تلقائي للإجازات الاعتيادية وفق الرصيد والسياسة',
    problem: 'تمر كل إجازة اعتيادية بموافقة يدوية حتى عندما يكون الرصيد كافياً ولا يوجد تعارض في الفريق، ما يستهلك وقت المديرين ويؤخر الرد على الموظف.',
    solution: 'اعتماد تلقائي فوري للإجازات الاعتيادية ضمن الرصيد وعدم وجود تعارض في جدول الفريق، مع إشعار المدير وإمكانية الاعتراض خلال 24 ساعة.',
    flow: [['submitted', 16, 'u_hessa'], ['screening', 14, 'u_mariam'], ['evaluation', 10, 'u_mariam']],
    scores: [['u_president', 4, 5, 5, 4, null, 8], ['u_mariam', 4, 4, 5, 4, 'يتطلب ضبط الاستثناءات في السياسة.', 7]],
    votes: [['u_salem', 15], ['u_fatima', 14], ['u_ahmed', 12], ['u_sara', 11], ['u_noura', 9], ['u_reem', 7], ['u_saeed', 4]],
    comments: [['u_salem', 13, 'سيوفر علينا مئات المراجعات اليدوية شهرياً.'], ['u_fatima', 6, 'هل يشمل الاعتماد التلقائي الإجازات الطارئة؟'], ['u_hessa', 5, 'الإجازات الاعتيادية ضمن الرصيد فقط؛ الطارئة تبقى لدى المدير المباشر.']],
    follows: ['u_sara'] },
  { id: 'idea_demo12', obj: /رقمنه الاجراءات/, author: 'u_majed', cat: 'digital', camp: 'camp_zero_bureaucracy', saving: 30000, hours: 650, happy: null,
    title: 'التوقيع الإلكتروني لأوامر الصرف بدل الدورة الورقية',
    problem: 'تنتقل أوامر الصرف ورقياً بين المالية والإدارات لجمع التوقيعات، وقد يتأخر الأمر أياماً بسبب غياب أحد المعتمدين.',
    solution: 'دورة اعتماد إلكترونية بتوقيع رقمي معتمد، مع تفويض تلقائي عند الغياب وسجل تدقيق كامل.',
    flow: [['submitted', 8, 'u_majed'], ['screening', 6, 'u_president'], ['evaluation', 4, 'u_president']],
    votes: [['u_noura', 7], ['u_reem', 6]] },
  { id: 'idea_demo13', obj: /المحفظه الاستراتيجيه/, author: 'u_latifa', cat: 'process', camp: null, saving: null, hours: 400, happy: null,
    title: 'بنك معرفة للدروس المستفادة من المشاريع',
    problem: 'تتكرر الأخطاء نفسها في المشاريع لأن الدروس المستفادة تبقى في تقارير الإغلاق ولا يرجع إليها أحد عند بدء مشروع جديد.',
    solution: 'بنك معرفة قابل للبحث يربط الدروس المستفادة بنوع المشروع، ويعرضها تلقائياً عند إنشاء مشروع مشابه.',
    flow: [['submitted', 5, 'u_latifa'], ['screening', 2, 'u_president']],
    votes: [['u_hamad', 4], ['u_mariam', 3]] },
  { id: 'idea_demo14', author: 'u_fatima', cat: 'process', camp: null, saving: null, hours: null, happy: null,
    title: 'رمز QR على الأصول لتتبّع العهد',
    problem: 'جرد العهد السنوي يدوي ويستغرق أسبوعاً.', solution: '',
    flow: [['draft', 1, 'u_fatima']] },
];

export function seed() {
  if (!K.isEmpty('ideas_campaigns') || !K.isEmpty('ideas_ideas')) return;
  const people = new Set(K.all('SELECT id FROM users').map((r) => r.id));
  const need = ['u_president', 'u_mariam', 'u_latifa', 'u_ahmed', 'u_sara', 'u_fatima', 'u_omar', 'u_noura', 'u_majed', 'u_reem', 'u_hamad', 'u_hessa', 'u_salem', 'u_yousef', 'u_saeed', 'u_aisha'];
  if (!need.every((u) => people.has(u))) return; // demo personas are not seeded
  const objs = objectivesSync();
  const objFor = (re) => (re ? objs.find((o) => re.test(norm(o.title_ar))) || null : null);
  const year = new Date().getUTCFullYear();
  for (const c of CAMPAIGNS) {
    const o = objFor(c.objective);
    K.run(`INSERT INTO ideas_campaigns (id,title_ar,title_en,description_ar,description_en,starts_on,ends_on,objective_id,objective_ar,objective_en,sponsor_id,created_by,created_at,updated_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
      c.id, c.title_ar, c.title_en, c.description_ar, c.description_en, K.day(c.starts), K.day(c.ends), o?.id || null, o?.title_ar || null, o?.title_en || null, c.sponsor, 'u_latifa', T(-c.starts + 2), T(-c.starts + 2));
  }
  const ordered = [...IDEAS].sort((a, b) => b.flow[0][1] - a.flow[0][1]);
  let seq = 0;
  for (const d of ordered) {
    const dept = K.one('SELECT department_id FROM users WHERE id=?', d.author).department_id;
    const last = d.flow[d.flow.length - 1];
    const status = last[0];
    const created = T(d.flow[0][1], 8, 30);
    const at = (s) => { const f = d.flow.find((x) => x[0] === s); return f ? T(f[1], 10, 15) : null; };
    const obj = objFor(d.obj);
    const scores = (d.scores || []).map(([u, impact, feasibility, cost, alignment, note, ago]) => ({ u, impact, feasibility, cost, alignment, note, ago }));
    const weighted = scores.length ? CRITERIA.reduce((a, c) => a + WEIGHTS[c] * (scores.reduce((x, s) => x + s[c], 0) / scores.length), 0) : null;
    const decisionStep = d.flow.find((x) => ['approved', 'rejected'].includes(x[0]));
    const infoStep = d.flow.find((x) => x[0] === 'needs_info');
    const ref = status === 'draft' ? null : `IDEA-${year}-${String(++seq).padStart(3, '0')}`;
    K.run(`INSERT INTO ideas_ideas (id,ref,title,problem,solution,category,campaign_id,objective_id,objective_ar,objective_en,expected_saving,expected_hours,happiness,author_id,department_id,hide_author,status,
        info_from,info_by,decision_note,decided_by,decided_at,final_score,sponsor_id,project_id,implementation_started_at,benefits_note,realized_saving,realized_hours,implemented_at,submitted_at,approved_at,created_by,created_at,updated_at,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    d.id, ref, d.title, d.problem, d.solution, d.cat, d.camp, obj?.id || null, obj?.title_ar || null, obj?.title_en || null, d.saving ?? null, d.hours ?? null, d.happy ?? null,
    d.author, dept, d.hide ? 1 : 0, status,
    infoStep ? d.flow[d.flow.indexOf(infoStep) - 1][0] : null, infoStep ? infoStep[2] : null,
    decisionStep ? decisionStep[3] || null : infoStep ? infoStep[3] : null, decisionStep ? decisionStep[2] : null, decisionStep ? T(decisionStep[1], 10, 15) : infoStep ? T(infoStep[1], 10, 15) : null,
    decisionStep ? (weighted == null ? null : K.round(weighted, 2)) : null, d.sponsor || null,
    d.project && K.one('SELECT 1 FROM projects WHERE id=?', d.project) ? d.project : null, at('in_implementation'),
    d.benefits?.note || null, d.benefits?.saving ?? null, d.benefits?.hours ?? null, at('implemented'),
    at('submitted'), at('approved'), d.author, created, T(last[1], 10, 15));
    let prev = null;
    for (const [st, ago, actor, note] of d.flow) {
      K.run('INSERT INTO ideas_history (id,idea_id,from_status,to_status,user_id,note,private,at) VALUES (?,?,?,?,?,?,?,?)', K.uid('ih_'), d.id, prev, st, actor, note || null, note ? 1 : 0, T(ago, 10, 15));
      prev = st;
    }
    for (const c of d.coauthors || []) K.run('INSERT INTO ideas_coauthors (idea_id,user_id) VALUES (?,?)', d.id, c);
    for (const s of scores) K.run('INSERT INTO ideas_scores (idea_id,user_id,impact,feasibility,cost,alignment,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', d.id, s.u, s.impact, s.feasibility, s.cost, s.alignment, s.note, T(s.ago, 13), T(s.ago, 13));
    for (const [u, ago] of d.votes || []) K.run('INSERT INTO ideas_votes (idea_id,user_id,created_at) VALUES (?,?,?)', d.id, u, T(ago, 11, 20));
    for (const [u, ago, body] of d.comments || []) K.run('INSERT INTO ideas_comments (id,idea_id,user_id,body,created_at,is_demo) VALUES (?,?,?,?,?,1)', K.uid('ic_'), d.id, u, body, T(ago, 12, 5));
    for (const u of d.follows || []) K.run('INSERT INTO ideas_follows (idea_id,user_id,created_at) VALUES (?,?,?)', d.id, u, T(1));
  }
  // Demo alerts for the people who must act (needs-info author, implementation sponsor).
  const alert = (user, level, title, body, id) => K.run('INSERT INTO alerts (id,user_id,level,title,body,entity,entity_id,is_demo) VALUES (?,?,?,?,?,?,?,1)', K.uid('al_'), user, level, title, body, 'sys:ideas', id);
  alert('u_salem', 'warning', 'تطلب لجنة الأفكار معلومات إضافية عن فكرتك «رحلة تعيين رقمية بلا ورق للموظف الجديد»', 'افتح الفكرة لقراءة الملاحظات وإعادة الإرسال', 'idea_demo06');
  alert('u_majed', 'warning', 'كُلّفت برعاية تنفيذ فكرة معتمدة: «تحديث بيانات الموردين ذاتياً عبر البوابة»', 'ابدأ التنفيذ بإنشاء مشروع أو ربط مشروع قائم', 'idea_demo05');
}
