// Performance Management — demo seed (is_demo = 1). Two cycles, dated relative
// to today: last year's cycle (closed: calibrated, acknowledged, one resolved
// disagreement) and the current-year cycle in the self-assessment phase (some
// self-assessments submitted, some manager assessments done, a manager draft
// that the employee cannot see yet). Idempotent: runs only on an empty table.
import { one, all, run, uid, isEmpty, userIdByUsername, lineManager, staffUsers, day, at } from '../kit.js';
import * as M from './model.js';
import { computeScores, objectivesOf, normalizeGoals } from './service.js';

// Guarded dynamic import: the personal-goals system is optional.
let goalsMod = null;
try { goalsMod = await import('../goals.js'); } catch { goalsMod = null; }

// ---------------- current-year objectives per persona: [title, measure, weight] ----------------
const OBJ_NOW = {
  ahmed: [['إكمال ربط البوابة الموحدة بنظام الهوية الرقمية', 'تسجيل دخول موحد لجميع خدمات البوابة قبل نهاية الربع الرابع', 35], ['ترحيل ثلاثة أنظمة تشغيلية إلى السحابة الحكومية', 'ثلاثة أنظمة مُرحّلة دون توقف يتجاوز ساعتين', 30], ['رفع جاهزية الأنظمة الحرجة', 'نسبة توافر شهرية لا تقل عن 99.5%', 20], ['توثيق إجراءات الاستعادة من الكوارث واختبارها', 'دليل معتمد واختبار ناجح واحد على الأقل', 15]],
  sara: [['تحليل متطلبات أتمتة طلبات الموظفين واعتمادها', 'وثيقة متطلبات معتمدة من الإدارات المعنية', 30], ['تحسين تجربة المستخدم في البوابة الموحدة', 'رضا المستخدمين 85% في استبيان الربع الرابع', 30], ['إعداد لوحة مؤشرات لاستخدام الخدمات الرقمية', 'لوحة تُحدَّث بياناتها أسبوعياً', 25], ['نقل المعرفة وتدريب مستخدمي الإدارات', 'أربع ورش تدريبية على الأقل', 15]],
  fatima: [['تأسيس مركز خدمة المتعاملين الموحد', 'تشغيل المرحلة الأولى وخفض زمن الاستجابة 20%', 40], ['تحديث أدلة إجراءات التشغيل', 'تحديث 12 إجراءً واعتمادها', 30], ['خفض الطلبات المعادة بسبب نقص المستندات', 'انخفاض 15% مقارنة بالعام السابق', 30]],
  noura: [['إقفال الحسابات الشهرية في موعدها', 'الإقفال خلال خمسة أيام عمل من نهاية كل شهر', 35], ['تسوية الحسابات البنكية والذمم', 'لا فروقات معلّقة تتجاوز 30 يوماً', 25], ['دعم إعداد موازنة 2027', 'تسليم نماذج الإدارات مدققة قبل الموعد', 25], ['أتمتة تقرير الصرف الشهري', 'تقرير آلي يعتمده المدير المالي', 15]],
  reem: [['خفض دورة الشراء المباشر', 'متوسط 12 يوم عمل من الطلب إلى أمر الشراء', 35], ['تحديث سجل الموردين المؤهلين', 'تقييم جميع الموردين النشطين', 25], ['رفع نسبة المشتريات من الموردين المحليين', '40% من قيمة المشتريات', 20], ['الالتزام بضوابط الشراء والنزاهة', 'لا ملاحظات جوهرية في التدقيق', 20]],
  hamad: [['إعداد تقارير الأداء الاستراتيجي الربعية', 'أربعة تقارير في موعدها معتمدة من المديرة', 35], ['مراجعة مؤشرات الأداء الرئيسية وتحديث بطاقاتها', 'تحديث جميع بطاقات المؤشرات', 30], ['متابعة المبادرات الاستراتيجية المتأخرة', 'خطة معالجة لكل مبادرة متأخرة خلال أسبوعين', 20], ['نشر ثقافة إدارة الأداء', 'ثلاث جلسات توعوية للإدارات', 15]],
  salem: [['تنفيذ دورة تقييم الأداء 2026 وفق الجدول', 'اكتمال 95% من التقييمات في موعدها', 35], ['تنفيذ خطة التدريب السنوية', '90% من الموظفين أكملوا 20 ساعة تدريبية', 30], ['تحسين تجربة التعيين والإلحاق', 'رضا الموظفين الجدد 85% فأكثر', 20], ['استكمال ملفات الموظفين الرقمية', 'جميع الملفات مكتملة ومحدّثة', 15]],
  saeed: [['تنفيذ مهام خطة التدقيق السنوية المسندة', 'خمس مهام مكتملة وفق المنهجية', 40], ['متابعة تنفيذ توصيات التدقيق', 'متابعة جميع التوصيات المستحقة ربعياً', 30], ['تطبيق التدقيق المعتمد على البيانات', 'تحليلات بيانات في مهمتين على الأقل', 20], ['التطوير المهني', 'إتمام متطلبات شهادة مهنية في التدقيق', 10]],
  mariam: [['إطلاق البوابة الموحدة للخدمات', 'إطلاق المرحلة الأولى لجميع الموظفين', 30], ['تنفيذ خارطة التحول الرقمي 2026', '80% من مبادرات الخارطة في موعدها', 30], ['تعزيز الأمن السيبراني والامتثال', 'إغلاق جميع الملاحظات عالية الخطورة', 20], ['تطوير قدرات فريق التحول الرقمي', 'خطة تطوير فردية لكل عضو', 20]],
  omar: [['رفع كفاءة العمليات التشغيلية', 'خفض زمن إنجاز المعاملات 25%', 35], ['تأسيس مركز خدمة المتعاملين الموحد', 'تشغيل المركز ورضا المتعاملين 85% فأكثر', 35], ['إدارة المخاطر التشغيلية', 'تحديث سجل المخاطر ربعياً', 15], ['تطوير فريق العمليات', 'تنفيذ خطط التطوير الفردية', 15]],
  majed: [['إعداد الموازنة العامة 2027 ورفعها في الموعد', 'اعتماد الموازنة قبل الموعد المحدد', 30], ['ترشيد الإنفاق التشغيلي', 'وفر 5% من المصروفات التشغيلية', 25], ['رفع كفاءة المشتريات', 'خفض دورة الشراء 20%', 25], ['تعزيز الرقابة المالية', 'لا ملاحظات جوهرية من التدقيق الخارجي', 20]],
  latifa: [['متابعة تنفيذ الخطة الاستراتيجية 2026–2028', 'تقارير ربعية للقيادة في موعدها', 35], ['رفع نسبة إنجاز المبادرات الاستراتيجية', '85% من المبادرات على المسار', 30], ['تحديث منهجية إدارة المشاريع', 'اعتماد دليل منهجية محدّث', 20], ['بناء القدرات في إدارة المشاريع', 'عشرة موظفين حاصلون على تدريب معتمد', 15]],
  hessa: [['إدارة دورة الأداء المؤسسي بعدالة وشفافية', 'معايرة جميع التقييمات والرد على الاعتراضات خلال 15 يوماً', 30], ['تنفيذ خطة التوطين وجذب الكفاءات', 'تحقيق مستهدف التوطين السنوي', 25], ['رفع مؤشر السعادة الوظيفية', '80% فأكثر في المسح السنوي', 25], ['رقمنة خدمات الموارد البشرية', 'ست خدمات ذاتية عبر المنصة', 20]],
  yousef: [['مراجعة العقود والاتفاقيات في الموعد', '95% خلال خمسة أيام عمل', 35], ['تحديث منظومة السياسات واللوائح', 'تحديث ثماني سياسات واعتمادها', 25], ['تعزيز الامتثال وإدارة تضارب المصالح', 'اكتمال جميع الإفصاحات السنوية', 25], ['التوعية القانونية', 'أربع جلسات توعية', 15]],
  aisha: [['تنفيذ خطة التدقيق المبنية على المخاطر', 'إنجاز 90% من الخطة', 40], ['رفع تقارير ربعية للجنة التدقيق', 'أربعة تقارير في موعدها', 25], ['تطوير منهجية التدقيق وفق المعايير الدولية', 'تقييم جودة خارجي إيجابي', 20], ['تطوير فريق التدقيق', '40 ساعة تطوير مهني لكل مدقق', 15]],
};
const OBJ_DEFAULT = [['تحقيق مستهدفات الخطة التشغيلية للإدارة', 'إنجاز 90% من المبادرات المسندة', 40], ['تحسين جودة الخدمة المقدمة', 'رضا المتعاملين 85% فأكثر', 35], ['التطوير المهني', '30 ساعة تدريبية', 25]];

// ---------------- last year's objectives per department ----------------
const OBJ_PREV = {
  dept_it: [['تطوير خدمات رقمية جديدة للموظفين', 'إطلاق أربع خدمات رقمية', 40], ['رفع توافر الأنظمة الحرجة', 'توافر 99% شهرياً', 35], ['تحسين ضوابط أمن المعلومات', 'إغلاق ملاحظات الفحص الأمني', 25]],
  dept_ops: [['تحسين إجراءات العمل الرئيسية', 'تبسيط عشرة إجراءات', 40], ['خفض زمن إنجاز المعاملات', 'خفض 15%', 35], ['رفع رضا المتعاملين', '80% فأكثر', 25]],
  dept_fin: [['إقفال السنة المالية في موعده', 'إصدار القوائم المالية قبل الموعد', 40], ['تحسين دقة التقارير المالية', 'لا تعديلات جوهرية بعد الإصدار', 35], ['دعم إعداد موازنة العام التالي', 'تسليم النماذج في موعدها', 25]],
  dept_proc: [['خفض دورة الشراء', 'متوسط 15 يوم عمل', 40], ['تأهيل الموردين', 'تقييم 80% من الموردين النشطين', 35], ['الالتزام بضوابط الشراء', 'لا ملاحظات جوهرية', 25]],
  dept_spmo: [['إعداد الخطة الاستراتيجية 2026–2028', 'اعتماد الخطة من القيادة', 40], ['متابعة المبادرات الاستراتيجية', 'تقارير ربعية منتظمة', 35], ['تطوير مؤشرات الأداء', 'بطاقات مؤشرات محدثة', 25]],
  dept_hr: [['تنفيذ دورة الأداء السنوية', 'اكتمال 90% من التقييمات', 40], ['تنفيذ خطة التدريب', '85% من الموظفين أكملوا التدريب', 35], ['تحسين خدمات الموظفين', 'رضا 80% فأكثر', 25]],
  dept_legal: [['مراجعة العقود في الموعد', '90% خلال خمسة أيام عمل', 40], ['تحديث اللوائح الداخلية', 'تحديث خمس لوائح', 35], ['التوعية القانونية', 'ثلاث جلسات', 25]],
  dept_ia: [['تنفيذ خطة التدقيق السنوية', 'إنجاز 85% من الخطة', 40], ['متابعة التوصيات', 'متابعة ربعية', 35], ['تطوير منهجية التدقيق', 'دليل منهجية محدث', 25]],
  dept_exec: OBJ_DEFAULT,
};

// Target scores for last year (overall ≈ target; band is computed, never typed).
const PREV = {
  mariam: 4.1, ahmed: 3.8, sara: 4.6, omar: 3.7, fatima: 3.1, noura: 3.3, majed: 3.9, reem: 2.9,
  latifa: 4.6, hamad: 3.4, hessa: 4.0, salem: 3.2, yousef: 3.7, aisha: 4.2, saeed: 2.3,
};
const PREV_CAL = {
  omar: ['meets', 'hessa', 'لضمان الاتساق مع نتائج مؤشرات إدارة العمليات للعام نفسه: تأخر مشروع تحديث الإجراءات عن موعده رغم الجهد المبذول.'],
  hamad: ['exceeds', 'salem', 'مساهمته الموثقة في إعداد الخطة الاستراتيجية 2026–2028 تجاوزت أهدافه المعتمدة ولم تنعكس بالكامل في تقديرات الأهداف.'],
};
const PREV_DISAGREE = {
  reem: {
    note: 'أرى أن مساهمتي في خفض دورة الشراء وتحديث سجل الموردين لم تنعكس بشكل كافٍ، إذ تحقق خفض الدورة إلى 14 يوماً وهو أفضل من المستهدف.',
    by: 'hessa',
    response: 'راجعنا ملاحظتك مع المدير المالي: أُضيف إنجاز خفض دورة الشراء إلى ملفك، وتبقى النتيجة «يلبي التوقعات» لأن هدف تأهيل الموردين لم يكتمل. نوصي بإدراج هدف لتأهيل الموردين في دورة هذا العام.',
  },
};

// Current cycle (self-assessment phase) — who has done what.
const NOW = {
  ahmed: { self: 'draft' },
  sara: { self: -5, assess: [-2, 4.3] },
  fatima: { self: -6, draft: true },
  noura: { self: -3 },
  reem: {},
  hamad: { self: -8, assess: [-1, 3.6] },
  salem: { self: -4 },
  saeed: { self: -7, assess: [-3, 3.2] },
  mariam: { self: -2 },
  omar: {},
  majed: { self: -9, assess: [-4, 4.0] },
  latifa: { self: -1 },
  hessa: {},
  yousef: { self: -5 },
  aisha: {},
};
const SELF_PCT = { ahmed: [80, 60], sara: [100, 90, 100, 100], fatima: [85, 100, 70], noura: [100, 95, 90, 100], hamad: [100, 100, 80, 100], salem: [90, 85, 100, 95], saeed: [100, 90, 60, 100], mariam: [90, 85, 100, 90], majed: [100, 90, 85, 100], latifa: [100, 80, 90, 100], yousef: [95, 100, 90, 100] };
const SELF_COMMENT = {
  sara: 'ركّزت هذا العام على تجربة المستخدم في البوابة الموحدة وتحليل متطلبات الأتمتة مع الإدارات. أتطلع إلى تعميق مهاراتي في تحليل البيانات وقياس الأثر.',
  fatima: 'أسهمت في تشغيل المرحلة الأولى من مركز خدمة المتعاملين وتحديث أدلة الإجراءات. التحدي الأكبر كان في خفض الطلبات المعادة ويحتاج إلى تكامل أكبر مع الإدارات.',
  noura: 'التزمت بمواعيد الإقفال الشهري طوال العام، وبدأت أتمتة تقرير الصرف. أحتاج إلى دعم في أدوات التحليل المالي المتقدمة.',
  hamad: 'أعددت التقارير الربعية في موعدها وحدّثت بطاقات المؤشرات. متابعة المبادرات المتأخرة ما زالت تعتمد على سرعة تجاوب بعض الإدارات.',
  salem: 'نفذت خطة التدريب السنوية وأطلقت تجربة الإلحاق الرقمية. أعمل على استكمال الملفات الرقمية المتبقية قبل نهاية العام.',
  saeed: 'أنجزت مهام التدقيق المسندة ومتابعة التوصيات، وطبّقت تحليل البيانات في مهمة واحدة وأخطط لتوسيعه في المهمة القادمة.',
  mariam: 'أُطلقت المرحلة الأولى من البوابة الموحدة وتحقق معظم مبادرات خارطة التحول الرقمي. أولويتي القادمة تعزيز الأمن السيبراني وتمكين الفريق.',
  majed: 'رُفعت مسودة موازنة 2027 مبكراً وتحقق وفر في المصروفات التشغيلية. أعمل مع قسم المشتريات على خفض دورة الشراء.',
  latifa: 'تابعنا تنفيذ الخطة الاستراتيجية بتقارير منتظمة، وارتفعت نسبة المبادرات على المسار. تحديث منهجية المشاريع في مراحله الأخيرة.',
  yousef: 'راجعنا العقود في المواعيد المستهدفة وحُدّثت معظم السياسات، واكتملت الإفصاحات السنوية لتضارب المصالح.',
};
const MGR_COMMENT = {
  sara: 'أداء متميز في تحليل المتطلبات وتجربة المستخدم، وكان لورش نقل المعرفة أثر واضح في تبنّي البوابة. نوصي بقيادة مبادرة لوحة المؤشرات في العام القادم.',
  hamad: 'التزام عالٍ بمواعيد التقارير ودقة في تحديث المؤشرات. نتطلع إلى دور أكبر في معالجة المبادرات المتأخرة بالتنسيق المباشر مع الإدارات.',
  saeed: 'أداء يلبي التوقعات في تنفيذ المهام ومتابعة التوصيات. نوصي بتسريع تطبيق التدقيق المعتمد على البيانات ضمن خطة تطوير واضحة.',
  majed: 'قيادة مالية منضبطة ورفع الموازنة قبل موعدها وتحقيق وفر ملموس. نتطلع إلى استكمال خفض دورة الشراء بالتعاون مع قسم المشتريات.',
};
const MID = {
  ahmed: ['أنجزت ربط 60% من الخدمات بالهوية الرقمية، وتأخر ترحيل النظام الثالث بانتظار موافقة مزود السحابة.', 'تقدم جيد؛ اتفقنا على نقل ترحيل النظام الثالث إلى الربع الرابع مع متابعة أسبوعية.'],
  sara: ['اكتملت وثيقة متطلبات الأتمتة وبدأت اختبارات قابلية الاستخدام للبوابة.', 'عمل ممتاز؛ نركّز في النصف الثاني على لوحة المؤشرات والتدريب.'],
  fatima: ['بدأ تشغيل المرحلة الأولى من مركز الخدمة، وأحتاج إلى دعم في ربط أنظمة الإدارات.', 'سننسق مع التحول الرقمي لتسريع الربط، ونراجع مؤشر الطلبات المعادة شهرياً.'],
  noura: ['الإقفال الشهري منتظم، وبدأت أتمتة تقرير الصرف.', 'استمري على النهج نفسه، ونراجع نماذج الموازنة مبكراً.'],
  reem: ['خُفّضت دورة الشراء إلى 13 يوماً في المتوسط، وتحديث سجل الموردين جارٍ.', 'نتيجة مشجعة؛ الأولوية الآن لإكمال تقييم الموردين قبل نهاية الربع الثالث.'],
  hamad: ['سُلّمت تقارير الربعين الأول والثاني في موعدها.', 'دقة عالية؛ نطلب خطط معالجة أسرع للمبادرات المتأخرة.'],
  salem: ['أُطلقت تجربة الإلحاق الرقمية ونُفذ 60% من خطة التدريب.', 'جيد؛ نركز على استكمال الملفات الرقمية.'],
  saeed: ['أُنجزت مهمتان من خطة التدقيق ومتابعة التوصيات منتظمة.', 'نشجع تطبيق تحليلات البيانات في المهمة القادمة.'],
  mariam: ['أُطلقت النسخة التجريبية من البوابة ونفذنا 70% من مبادرات الخارطة.', 'تقدم ملموس؛ الأمن السيبراني أولوية للنصف الثاني.'],
  omar: ['انخفض زمن إنجاز المعاملات 15% حتى الآن.', 'نتطلع إلى تسريع تشغيل مركز الخدمة.'],
  majed: ['مسودة الموازنة في مراحلها الأولى، وتحقق وفر 3% حتى الآن.', 'عمل منضبط؛ نتابع خفض دورة الشراء.'],
  latifa: ['78% من المبادرات على المسار ويجري تحديث المنهجية.', 'أداء قيادي واضح في متابعة الخطة.'],
  hessa: ['جرى الإعداد لدورة الأداء وإطلاق مسح السعادة.', 'نركز على التوطين في النصف الثاني.'],
  yousef: ['راجعنا 93% من العقود في موعدها.', 'نتابع استكمال السياسات المتبقية.'],
  aisha: ['أُنجز 50% من خطة التدقيق ورُفع تقريران للجنة.', 'نتابع خطة تطوير الفريق.'],
};
const PREV_MGR_COMMENT = {
  exceptional: 'أداء استثنائي تجاوز المستهدفات بوضوح وكان له أثر ممتد على عمل الإدارة. نموذج يُحتذى به في المبادرة والجودة.',
  exceeds: 'أداء يفوق التوقعات مع التزام واضح بالمواعيد والجودة. نوصي بتوسيع الدور القيادي في مبادرات العام القادم.',
  meets: 'أداء يلبي التوقعات في معظم الأهداف. نوصي بالتركيز على الأهداف غير المكتملة ضمن خطة تطوير متفق عليها.',
  improve: 'تحقق جزء من المستهدفات. نتفق على خطة تحسين بمؤشرات ربعية ودعم تدريبي محدد، مع متابعة شهرية.',
  unsatisfactory: 'لم تتحقق المستهدفات. تُعد خطة تحسين أداء رسمية بالتنسيق مع الموارد البشرية.',
};
const selfNote = (p) => (p >= 100 ? 'أُنجز الهدف بالكامل وفق الخطة المعتمدة، والتوثيق متاح في ملف العمل.' : p >= 85 ? 'تحقق الجزء الأكبر من المستهدف؛ المتبقي مرتبط بمدخلات من جهة أخرى.' : 'قيد الإنجاز؛ أُعيد ترتيب الأولويات بالاتفاق مع المدير في المراجعة المرحلية.');
// Integer ratings whose mean is close to a target score.
function ratingsFor(t, n) {
  const base = Math.min(5, Math.max(1, Math.floor(t))); const hi = Math.min(5, base + 1); const k = Math.round((t - base) * n);
  return Array.from({ length: n }, (_, i) => (i < k ? hi : base));
}

export function seed() {
  if (!isEmpty('performance_cycles')) return;
  const staff = staffUsers().filter((u) => u.user_type === 'staff' && lineManager(u.id));
  if (!staff.length) return;
  const uname = new Map(all("SELECT id, username FROM users WHERE user_type='staff'").map((u) => [u.id, u.username]));
  const byName = (n) => userIdByUsername(n);
  const comps = M.competencies();
  const year = new Date().getUTCFullYear();

  const cycle = (id, y, phase, phases, closedAt) => {
    run('INSERT INTO performance_cycles (id,year,name_ar,name_en,phase,objectives_share,created_by,created_at,updated_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,1)',
      id, y, `دورة تقييم الأداء ${y}`, `Performance cycle ${y}`, phase, M.DEFAULT_SHARE, byName('hessa'), at(phases.goal_setting[0] - 3, 6), closedAt || at(0, 5));
    for (const p of M.SCHEDULED) {
      const [s, e] = phases[p];
      const opened = M.phaseIndex(p) <= M.phaseIndex(phase);
      run('INSERT INTO performance_phases (cycle_id,phase,starts_on,ends_on,opened_at,opened_by) VALUES (?,?,?,?,?,?)', id, p, day(s), day(e), opened ? at(s, 5, 30) : null, opened ? byName('hessa') : null);
    }
  };
  // Deterministic ids for demo reviews (pr_demo_<year>_<username>) keep demo links stable.
  const review = (cycleId, u, createdAt) => {
    const id = `pr_demo_${cycleId.slice(-4)}_${uname.get(u.id) || uid('')}`;
    run('INSERT INTO performance_reviews (id,cycle_id,employee_id,manager_id,department_id,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,1,?,?)', id, cycleId, u.id, lineManager(u.id), u.department_id, createdAt, createdAt);
    return id;
  };
  const addObjectives = (rid, list, source = 'manual') => list.forEach(([title, measure, weight, ref], i) => run(
    'INSERT INTO performance_objectives (id,review_id,sort,title,measure,weight,source,source_ref) VALUES (?,?,?,?,?,?,?,?)', uid('po_'), rid, i, title, measure, weight, source, ref || null));
  const rateAll = (rid, t) => {
    const objs = objectivesOf(rid);
    ratingsFor(t, objs.length).forEach((v, i) => run('UPDATE performance_objectives SET mgr_rating=? WHERE id=?', v, objs[i].id));
    ratingsFor(t, comps.length).forEach((v, i) => run('INSERT OR REPLACE INTO performance_comp_ratings (review_id,competency_id,rating) VALUES (?,?,?)', rid, comps[i].id, v));
    return computeScores(objectivesOf(rid), all('SELECT competency_id, rating FROM performance_comp_ratings WHERE review_id=?', rid), M.DEFAULT_SHARE);
  };
  const selfFill = (rid, pcts) => objectivesOf(rid).forEach((o, i) => { if (pcts[i] != null) run('UPDATE performance_objectives SET self_pct=?, self_note=? WHERE id=?', pcts[i], selfNote(pcts[i]), o.id); });

  // ---------- last year: closed ----------
  const prevId = `pc_demo_${year - 1}`;
  const PP = { goal_setting: [-600, -570], midyear: [-470, -450], self_assessment: [-330, -318], manager_assessment: [-317, -300], calibration: [-299, -290], acknowledgement: [-289, -275] };
  cycle(prevId, year - 1, 'closed', PP, at(-274, 8));
  staff.forEach((u, i) => {
    const name = uname.get(u.id);
    const target = PREV[name] ?? 3.4;
    const rid = review(prevId, u, at(-600, 6, i));
    addObjectives(rid, OBJ_PREV[u.department_id] || OBJ_DEFAULT);
    selfFill(rid, [100, target >= 3.5 ? 95 : 80, target >= 4 ? 100 : 75]);
    const s = rateAll(rid, target);
    const assessor = lineManager(u.id);
    run(`UPDATE performance_reviews SET status='acknowledged', objectives_agreed_at=?, objectives_agreed_by=?, mid_emp_note=?, mid_emp_at=?, mid_mgr_note=?, mid_mgr_at=?, mid_mgr_by=?,
      self_comment=?, self_saved_at=?, self_submitted_at=?, mgr_comment=?, mgr_saved_at=?, mgr_submitted_at=?, assessed_by=?, obj_score=?, comp_score=?, score=?, band=?, ack_at=?, updated_at=? WHERE id=?`,
    at(-575, 9, i), assessor, 'سير العمل وفق الخطة مع بعض التحديات في التوقيت.', at(-460, 10), 'تقدم مقبول؛ اتفقنا على أولويات النصف الثاني.', at(-458, 11), assessor,
    'أنجزت معظم أهدافي هذا العام، وأتطلع إلى تطوير مهاراتي في المجالات التي تحتاج إلى تحسين.', at(-322, 12, i), at(-322, 12, i),
    PREV_MGR_COMMENT[s.band], at(-306, 10, i), at(-305, 10, i), assessor, s.obj_score, s.comp_score, s.score, s.band, at(-284, 9, i), at(-284, 9, i), rid);
    const cal = PREV_CAL[name];
    if (cal) {
      const by = byName(cal[1]);
      run('UPDATE performance_reviews SET final_band=?, calibrated_at=?, calibrated_by=?, calibration_note=? WHERE id=?', cal[0], at(-295, 11), by, cal[2], rid);
      run('INSERT INTO performance_calibrations (id,review_id,from_band,to_band,justification,by_user,at) VALUES (?,?,?,?,?,?,?)', uid('pk_'), rid, s.band, cal[0], cal[2], by, at(-295, 11));
    } else {
      // Confirmed without change by an HR colleague who is neither the employee nor the assessor (SoD).
      const hr = ['salem', 'hessa'].map(byName).find((x) => x && x !== u.id && x !== assessor);
      if (hr) {
        run('UPDATE performance_reviews SET final_band=band, calibrated_at=?, calibrated_by=? WHERE id=?', at(-294, 9, i), hr, rid);
        run('INSERT INTO performance_calibrations (id,review_id,from_band,to_band,justification,by_user,at) VALUES (?,?,?,?,?,?,?)', uid('pk_'), rid, s.band, s.band, null, hr, at(-294, 9, i));
      }
    }
    const dis = PREV_DISAGREE[name];
    if (dis) run("UPDATE performance_reviews SET disagreement=?, disagreement_status='resolved', hr_response=?, hr_response_by=?, hr_response_at=? WHERE id=?", dis.note, dis.response, byName(dis.by), at(-280, 10), rid);
  });

  // ---------- this year: self-assessment phase ----------
  const curId = `pc_demo_${year}`;
  const CP = { goal_setting: [-235, -205], midyear: [-110, -85], self_assessment: [-12, 4], manager_assessment: [5, 21], calibration: [22, 33], acknowledgement: [34, 45] };
  cycle(curId, year, 'self_assessment', CP);
  const goalsFn = typeof goalsMod?.goalsForReview === 'function' ? goalsMod.goalsForReview : null;
  staff.forEach((u, i) => {
    const name = uname.get(u.id);
    const plan = NOW[name] || {};
    const rid = review(curId, u, at(-235, 6, i));
    // Objectives: imported from personal yearly goals when that system provides them.
    let imported = false;
    if (goalsFn && ['ahmed', 'sara', 'hamad'].includes(name)) {
      try {
        const got = goalsFn(u.id, year);
        const list = got && typeof got.then !== 'function' ? normalizeGoals(got).slice(0, 5) : [];
        if (list.length >= M.OBJ_MIN) {
          const base = Math.floor(100 / list.length); let rest = 100 - base * list.length;
          addObjectives(rid, list.map((g) => [g.title, g.measure, base + (rest-- > 0 ? 1 : 0), g.ref]), 'goals');
          imported = true;
        }
      } catch (e) { console.error('[performance] seed goals import:', e.message); }
    }
    if (!imported) addObjectives(rid, OBJ_NOW[name] || OBJ_DEFAULT);
    const assessor = lineManager(u.id);
    const [midE, midM] = MID[name] || ['العمل يسير وفق الخطة.', 'تقدم جيد؛ نتابع في النصف الثاني.'];
    run(`UPDATE performance_reviews SET status='active', objectives_agreed_at=?, objectives_agreed_by=?, mid_emp_note=?, mid_emp_at=?, mid_mgr_note=?, mid_mgr_at=?, mid_mgr_by=?, updated_at=? WHERE id=?`,
      at(-212, 9, i), assessor, midE, at(-96, 10, i), midM, at(-92, 11, i), assessor, at(-92, 11, i), rid);
    const pcts = SELF_PCT[name] || [];
    if (plan.self === 'draft') {
      selfFill(rid, pcts);
      run('UPDATE performance_reviews SET self_saved_at=?, updated_at=? WHERE id=?', at(-1, 14), at(-1, 14), rid);
    } else if (typeof plan.self === 'number') {
      selfFill(rid, objectivesOf(rid).map((_, k) => pcts[k] ?? 90));
      run("UPDATE performance_reviews SET status='self_submitted', self_comment=?, self_saved_at=?, self_submitted_at=?, updated_at=? WHERE id=?",
        SELF_COMMENT[name] || 'أنجزت أهدافي الرئيسية لهذا العام وأتطلع إلى مناقشة خطة التطوير مع مديري.', at(plan.self, 11, i), at(plan.self, 11, i), at(plan.self, 11, i), rid);
    }
    if (plan.assess) {
      const [when, t] = plan.assess;
      const s = rateAll(rid, t);
      run(`UPDATE performance_reviews SET status='assessed', mgr_comment=?, mgr_saved_at=?, mgr_submitted_at=?, assessed_by=?, obj_score=?, comp_score=?, score=?, band=?, updated_at=? WHERE id=?`,
        MGR_COMMENT[name] || PREV_MGR_COMMENT[s.band], at(when, 13), at(when, 13, 30), assessor, s.obj_score, s.comp_score, s.score, s.band, at(when, 13, 30), rid);
    } else if (plan.draft) {
      // A manager draft in progress: hidden from the employee until it is submitted.
      const objs = objectivesOf(rid);
      [4, 3].forEach((v, k) => objs[k] && run('UPDATE performance_objectives SET mgr_rating=? WHERE id=?', v, objs[k].id));
      [4, 4, 3].forEach((v, k) => run('INSERT OR REPLACE INTO performance_comp_ratings (review_id,competency_id,rating) VALUES (?,?,?)', rid, comps[k].id, v));
      run('UPDATE performance_reviews SET mgr_saved_at=? WHERE id=?', at(-1, 16), rid);
    }
  });
  void one;
}
