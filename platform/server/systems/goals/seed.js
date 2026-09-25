// Demo seed for My Goals: 3–10 goals per staff persona across periods, aligned
// to the demo strategic objectives, with roll-ups, checklists, check-ins, a
// missed daily goal to carry over, and encouraging comments from line managers.
import { one, run, uid, isEmpty } from '../kit.js';
import { periodFor, addDays, localToday, isWorkday } from './core.js';

const NOW = () => Date.now();
// Dubai wall-clock (UTC+4) → ISO, never in the future.
function stamp(dayIso, h, m = 0, slackMin = 5) {
  const t = Date.parse(`${dayIso}T00:00:00Z`) + ((h - 4) * 60 + m) * 60e3;
  return new Date(Math.min(t, NOW() - slackMin * 60e3)).toISOString();
}

export function seed() {
  if (!isEmpty('goals_goals')) return;
  if (!one('SELECT 1 FROM users WHERE id=?', 'u_ahmed')) return;
  const today = localToday();
  let prevWork = addDays(today, -1);
  while (!isWorkday(prevWork)) prevWork = addDays(prevWork, -1);
  const objId = (code) => (code ? one('SELECT id FROM strategy_objectives WHERE code=?', code)?.id || null : null);
  const keys = new Map();
  const prevDate = (type) => {
    if (type === 'daily') return prevWork;
    return addDays(periodFor(type, today).start, -1 - (type === 'weekly' ? 2 : 0));
  };

  function add(u, key, type, when, title, o = {}) {
    const { measure = 'binary', target = null, cur = 0, unit = '', obj = null, vis, items = [], parent = null, desc = '', checkins = [] } = o;
    let status = o.status || 'active';
    const base = when === 'cur' ? today : prevDate(type);
    const p = periodFor(type, base);
    if (status === 'achieved' && p.start > today) status = 'active';
    const created = type === 'daily' ? stamp(p.start, 7, 40, 10) : stamp(addDays(p.start, -1), 14, 0, 10);
    let achieved = null;
    if (status === 'achieved') {
      let day = type === 'daily' ? p.start : addDays(p.start, type === 'weekly' ? 2 : 6);
      if (day > p.end) day = p.end;
      if (day > today) day = today;
      achieved = stamp(day, 11, 20);
      if (achieved <= created) achieved = new Date(Date.parse(created) + 60e3).toISOString();
    }
    const id = `g_demo_${key.toLowerCase()}`; // stable demo ids (deep links in docs/screens)
    const par = parent ? keys.get(parent) : null;
    const parentId = par && par.start <= p.start && par.end >= p.start ? par.id : null;
    const visibility = vis || (['monthly', 'quarterly', 'yearly'].includes(type) ? 'manager' : 'private');
    const value = measure === 'numeric' ? (status === 'achieved' ? target : cur) : 0;
    run(`INSERT INTO goals_goals (id,owner_id,title,description,period_type,period_start,period_end,measure,target_value,current_value,unit,status,objective_id,parent_id,visibility,achieved_at,is_demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, u, title, desc, type, p.start, p.end, measure, measure === 'numeric' ? target : null, value, unit, status, objId(obj), parentId, visibility, achieved, created, achieved || created);
    items.forEach(([t, done], i) => run('INSERT INTO goals_items (id,goal_id,title,done_at,sort) VALUES (?,?,?,?,?)', uid('gi_'), id, t, done || status === 'achieved' ? achieved || stamp(addDays(p.start, Math.min(i, 3)), 12) : null, i + 1));
    run('INSERT INTO goals_checkins (id,goal_id,user_id,kind,value,progress,note,created_at) VALUES (?,?,?,?,?,?,?,?)', uid('gc_'), id, u, 'created', null, 0, '', created);
    checkins.forEach(([dayOffset, v, note]) => {
      const at = stamp(addDays(p.start, dayOffset) > today ? today : addDays(p.start, dayOffset), 13, 10);
      if (at <= created) return;
      run('INSERT INTO goals_checkins (id,goal_id,user_id,kind,value,progress,note,created_at) VALUES (?,?,?,?,?,?,?,?)', uid('gc_'), id, u, 'progress', v, target ? Math.round((v / target) * 100) : null, note, at);
    });
    if (achieved) run('INSERT INTO goals_checkins (id,goal_id,user_id,kind,value,progress,note,created_at) VALUES (?,?,?,?,?,?,?,?)', uid('gc_'), id, u, 'achieved', null, 100, '', achieved);
    keys.set(key, { id, start: p.start, end: p.end });
    return id;
  }
  const comment = (key, author, body, dayOffset = -1) => {
    const gid = keys.get(key)?.id; if (!gid) return;
    const at = stamp(addDays(today, dayOffset), 15, 5);
    run('INSERT INTO goals_comments (id,goal_id,author_id,body,created_at) VALUES (?,?,?,?,?)', uid('gm_'), gid, author, body, at);
    run('INSERT INTO access_log (id,user_id,system,record_type,record_id,action,at) VALUES (?,?,?,?,?,?,?)', uid('ax_'), author, 'goals', 'goal', gid, 'view', at);
    run('INSERT INTO access_log (id,user_id,system,record_type,record_id,action,at) VALUES (?,?,?,?,?,?,?)', uid('ax_'), author, 'goals', 'goal', gid, 'comment', at);
  };

  // ---- Digital Transformation
  add('u_ahmed', 'A0', 'yearly', 'cur', 'رفع موثوقية الأنظمة الحرجة وأمنها', { measure: 'rollup', obj: 'SO-4.2', desc: 'هدفي السنوي الأبرز: أنظمة متاحة ومحمية تدعم الخدمات الاستباقية.' });
  add('u_ahmed', 'A1', 'yearly', 'cur', 'الحصول على شهادة معمارية الحلول السحابية', { measure: 'checklist', obj: 'SO-4.2', items: [['إكمال مسار التعلم المعتمد', 1], ['اجتياز الاختبار التجريبي', 1], ['اجتياز الاختبار النهائي', 0]] });
  add('u_ahmed', 'A2', 'quarterly', 'cur', 'ترحيل ثلاثة أنظمة تشغيلية إلى السحابة الحكومية', { measure: 'numeric', target: 3, cur: 1, unit: 'أنظمة', obj: 'SO-4.2', parent: 'A0', checkins: [[20, 1, 'اكتمل ترحيل نظام الموارد بنجاح']] });
  add('u_ahmed', 'A3', 'monthly', 'cur', 'إغلاق الثغرات الحرجة في الخوادم', { measure: 'numeric', target: 12, cur: 9, unit: 'ثغرة', obj: 'SO-4.2', parent: 'A2', checkins: [[6, 5, ''], [15, 9, 'تبقّت ثلاث ثغرات تنتظر نافذة صيانة']] });
  add('u_ahmed', 'A4', 'weekly', 'cur', 'إنهاء نقل قاعدة بيانات الموارد إلى السحابة', { parent: 'A2' });
  add('u_ahmed', 'A5', 'daily', 'cur', 'مراجعة سجلات المراقبة الصباحية', { status: 'achieved' });
  add('u_ahmed', 'A6', 'daily', 'cur', 'اختبار خطة الرجوع عند الفشل', { parent: 'A4' });
  add('u_ahmed', 'A7', 'daily', 'prev', 'توثيق إعدادات جدار الحماية', {});
  add('u_ahmed', 'A8', 'daily', 'prev', 'تحديث شهادات الأمان للبوابة الموحدة', { status: 'achieved' });
  add('u_ahmed', 'A9', 'weekly', 'prev', 'تجهيز بيئة الاختبار السحابية', { status: 'achieved', parent: 'A2' });
  comment('A2', 'u_mariam', 'عمل رائع في ترحيل نظام الموارد يا أحمد، استمر بنفس الوتيرة!', -2);

  add('u_sara', 'S1', 'yearly', 'cur', 'إطلاق ست خدمات استباقية جديدة', { measure: 'numeric', target: 6, cur: 2, unit: 'خدمات', obj: 'SO-1.2', checkins: [[120, 1, ''], [200, 2, 'أُطلقت خدمة تجديد البطاقة تلقائياً']] });
  add('u_sara', 'S2', 'monthly', 'cur', 'تحليل نماذج الطلبات الإدارية الحالية', { measure: 'checklist', obj: 'SO-4.1', items: [['حصر النماذج الحالية', 1], ['مقابلات المستخدمين', 1], ['خريطة الإجراء الحالي', 0], ['التوصيات', 0]] });
  add('u_sara', 'S3', 'weekly', 'cur', 'ورشة متطلبات مع إدارة الموارد البشرية', { status: 'achieved', parent: 'S2' });
  add('u_sara', 'S4', 'daily', 'cur', 'مراجعة قصص المستخدم للبوابة الموحدة', { status: 'achieved' });
  add('u_sara', 'S5', 'daily', 'cur', 'تحديث مصفوفة تتبع المتطلبات', {});
  add('u_sara', 'S6', 'monthly', 'prev', 'توثيق متطلبات البوابة الموحدة', { status: 'achieved', obj: 'SO-1.2', parent: 'S1' });
  add('u_sara', 'S7', 'weekly', 'prev', 'حضور مؤتمر التحول الرقمي الحكومي', { status: 'cancelled' });

  add('u_mariam', 'M1', 'yearly', 'cur', 'إطلاق البوابة الموحدة للخدمات', { measure: 'rollup', obj: 'SO-1.2' });
  add('u_mariam', 'M2', 'quarterly', 'cur', 'أتمتة عشرة إجراءات داخلية', { measure: 'numeric', target: 10, cur: 6, unit: 'إجراءات', obj: 'SO-4.1', checkins: [[30, 4, ''], [60, 6, 'اكتملت أتمتة إجراءات الإجازات والمهام الرسمية']] });
  add('u_mariam', 'M3', 'monthly', 'cur', 'إنهاء اختبارات قبول البوابة الموحدة', { parent: 'M1', obj: 'SO-1.2' });
  add('u_mariam', 'M4', 'monthly', 'cur', 'اعتماد سياسة الحوسبة السحابية', { obj: 'SO-4.2' });
  add('u_mariam', 'M5', 'weekly', 'cur', 'لقاءات فردية مع فريق التحول الرقمي', { measure: 'numeric', target: 2, cur: 2, unit: 'لقاءات', status: 'achieved' });
  add('u_mariam', 'M6', 'daily', 'cur', 'مراجعة تقرير الثغرات الأسبوعي', {});

  // ---- Operations
  add('u_omar', 'O1', 'quarterly', 'cur', 'خفض متوسط زمن إنجاز المعاملة إلى 3.5 أيام', { measure: 'rollup', obj: 'SO-1.1' });
  add('u_omar', 'O2', 'monthly', 'cur', 'اعتماد أربعة إجراءات تشغيل محدثة', { measure: 'numeric', target: 4, cur: 1, unit: 'إجراءات', obj: 'SO-1.1', parent: 'O1' });
  add('u_omar', 'O3', 'weekly', 'cur', 'متابعة جاهزية مركز خدمة المتعاملين', { parent: 'O1' });
  add('u_omar', 'O4', 'daily', 'cur', 'مراجعة المعاملات المتأخرة أكثر من خمسة أيام', { status: 'achieved' });
  add('u_omar', 'O5', 'monthly', 'prev', 'إطلاق لوحة متابعة زمن المعاملات', { status: 'achieved', obj: 'SO-1.1' });

  add('u_fatima', 'F1', 'monthly', 'cur', 'رفع رضا المتعاملين في مركز الخدمة إلى 88%', { measure: 'rollup', obj: 'SO-1.1' });
  add('u_fatima', 'F2', 'weekly', 'cur', 'اختيار نظام إدارة التذاكر', { measure: 'checklist', parent: 'F1', obj: 'SO-1.1', items: [['مقارنة العروض الفنية', 1], ['عرض تجريبي للمورّدين', 1], ['رفع التوصية للمدير', 0]] });
  add('u_fatima', 'F3', 'daily', 'cur', 'الرد على شكاوى المتعاملين المفتوحة', { measure: 'numeric', target: 8, cur: 5, unit: 'شكاوى', parent: 'F2' });
  add('u_fatima', 'F4', 'daily', 'prev', 'تحديث دليل الردود الجاهزة', { status: 'achieved' });
  add('u_fatima', 'F5', 'weekly', 'prev', 'تدريب موظفي الاستقبال على الإجراءات الجديدة', { status: 'achieved' });
  comment('F1', 'u_omar', 'بداية ممتازة يا فاطمة — نتائج الاستبيان الأخير مشجعة جداً.', -3);

  // ---- Finance & Procurement
  add('u_noura', 'N1', 'quarterly', 'cur', 'إعداد الميزانية التقديرية للعام القادم', { measure: 'checklist', obj: 'SO-2.1', items: [['جمع احتياجات الإدارات', 1], ['مراجعة التكاليف التشغيلية', 0], ['العرض على المدير المالي', 0]] });
  add('u_noura', 'N2', 'monthly', 'cur', 'إقفال حسابات الشهر خلال خمسة أيام عمل', { obj: 'SO-2.1' });
  add('u_noura', 'N3', 'weekly', 'cur', 'مطابقة كشوف الحسابات البنكية', { status: 'achieved' });
  add('u_noura', 'N4', 'daily', 'cur', 'مراجعة أوامر الصرف المعلقة', { status: 'achieved' });

  add('u_majed', 'J1', 'yearly', 'cur', 'تحقيق وفر 5% في التكاليف التشغيلية', { measure: 'numeric', target: 5, cur: 3.6, unit: '%', obj: 'SO-2.1' });
  add('u_majed', 'J2', 'quarterly', 'cur', 'تطبيق نموذج التكلفة حسب النشاط', { obj: 'SO-2.1', parent: 'J1' });
  add('u_majed', 'J3', 'weekly', 'cur', 'مراجعة مؤشرات الإنفاق مع مديري الإدارات', {});

  add('u_reem', 'R1', 'monthly', 'cur', 'تقليص دورة الشراء إلى 28 يوماً', { measure: 'rollup', obj: 'SO-2.1' });
  add('u_reem', 'R2', 'weekly', 'cur', 'تقييم عروض توريد أجهزة الحاسب', { parent: 'R1' });
  add('u_reem', 'R3', 'daily', 'cur', 'متابعة أوامر الشراء المعلقة', { status: 'achieved', parent: 'R2' });
  add('u_reem', 'R4', 'daily', 'cur', 'تحديث سجل المورّدين المؤهلين', {});

  // ---- Strategic Projects (SPMO)
  add('u_latifa', 'L1', 'yearly', 'cur', 'اعتماد مراجعة منتصف المدة للخطة الاستراتيجية', { measure: 'checklist', obj: 'SO-2.3', items: [['تحليل الأداء التراكمي', 1], ['ورش مراجعة مع الإدارات', 1], ['تحديث المستهدفات', 0], ['اعتماد الإدارة العليا', 0]] });
  add('u_latifa', 'L2', 'quarterly', 'cur', 'رفع نسبة المؤشرات المرصودة في موعدها إلى 95%', { obj: 'SO-2.3' });
  add('u_latifa', 'L3', 'weekly', 'cur', 'اعتماد القيم المرصودة للمؤشرات', { measure: 'numeric', target: 10, cur: 6, unit: 'قيم', parent: 'L2' });
  add('u_latifa', 'L4', 'daily', 'cur', 'مراجعة تقرير أداء المبادرات', {});

  add('u_hamad', 'H1', 'monthly', 'cur', 'تحديث لوحة أداء المبادرات للإدارة العليا', { obj: 'SO-2.3' });
  add('u_hamad', 'H2', 'weekly', 'cur', 'التحقق من اكتمال بيانات المؤشرات الربعية', { measure: 'numeric', target: 17, cur: 12, unit: 'مؤشراً', parent: 'H1' });
  add('u_hamad', 'H3', 'daily', 'cur', 'مراسلة ملّاك المؤشرات المتأخرة', { status: 'achieved', parent: 'H2' });
  add('u_hamad', 'H4', 'daily', 'prev', 'إعداد ملخص المؤشرات المتعثرة', { status: 'achieved' });
  comment('H1', 'u_latifa', 'ممتاز يا حمد — اللوحة الأخيرة كانت واضحة جداً للإدارة العليا.', -1);

  // ---- Human Resources
  add('u_hessa', 'E1', 'yearly', 'cur', 'إطلاق برنامج القيادات الوطنية الواعدة', { measure: 'rollup', obj: 'SO-3.1' });
  add('u_hessa', 'E2', 'quarterly', 'cur', 'استقطاب 12 كفاءة وطنية تخصصية', { measure: 'numeric', target: 12, cur: 7, unit: 'كفاءة', obj: 'SO-3.1', parent: 'E1' });
  add('u_hessa', 'E3', 'monthly', 'prev', 'اعتماد خطة التدريب السنوية', { status: 'achieved', obj: 'SO-3.1' });
  add('u_hessa', 'E4', 'weekly', 'cur', 'مقابلات المرشحين لوظائف التحول الرقمي', { parent: 'E2' });

  add('u_salem', 'T1', 'quarterly', 'cur', 'تنفيذ استبيان النبض الربعي لسعادة الموظفين', { measure: 'checklist', obj: 'SO-3.2', items: [['تحديث أسئلة الاستبيان', 1], ['إطلاق الاستبيان', 1], ['تحليل النتائج', 0]] });
  add('u_salem', 'T2', 'weekly', 'cur', 'تنظيم ثلاث دورات تدريبية تخصصية', { measure: 'numeric', target: 3, cur: 2, unit: 'دورات', obj: 'SO-3.1' });
  add('u_salem', 'T3', 'daily', 'cur', 'تحديث ملفات الموظفين الجدد', {});
  add('u_salem', 'T4', 'daily', 'prev', 'الرد على استفسارات الإجازات', { status: 'achieved' });

  // ---- Legal, Internal Audit, President
  add('u_yousef', 'Y1', 'quarterly', 'cur', 'تحديث سجل الامتثال التشريعي', { obj: 'SO-2.2' });
  add('u_yousef', 'Y2', 'monthly', 'cur', 'إنجاز الاستشارات القانونية خلال خمسة أيام عمل', { obj: 'SO-2.2' });
  add('u_yousef', 'Y3', 'weekly', 'cur', 'مراجعة عقود التوريد المحالة', { measure: 'numeric', target: 5, cur: 3, unit: 'عقود' });
  add('u_yousef', 'Y4', 'daily', 'cur', 'إعداد رأي قانوني بشأن اتفاقية الخدمات السحابية', {});

  add('u_aisha', 'I1', 'yearly', 'cur', 'تنفيذ خطة التدقيق السنوية المعتمدة', { measure: 'numeric', target: 8, cur: 5, unit: 'مهام تدقيق', obj: 'SO-2.2' });
  add('u_aisha', 'I2', 'monthly', 'cur', 'رفع تقرير ربعي إلى لجنة التدقيق', { parent: 'I1' });
  add('u_aisha', 'I3', 'weekly', 'cur', 'مراجعة أوراق عمل مهمة المشتريات', {});

  add('u_saeed', 'D1', 'monthly', 'cur', 'إنهاء اختبارات الضوابط لعملية الصرف', { measure: 'checklist', obj: 'SO-2.2', items: [['تصميم عينات الاختبار', 1], ['تنفيذ الاختبارات', 0], ['توثيق الملاحظات', 0]] });
  add('u_saeed', 'D2', 'weekly', 'cur', 'جمع أدلة التدقيق لمهمة المخازن', { parent: 'D1' });
  add('u_saeed', 'D3', 'daily', 'cur', 'توثيق نتائج مقابلة إدارة المشتريات', { status: 'achieved' });

  add('u_president', 'P1', 'yearly', 'cur', 'تحقيق 90% من مستهدفات الخطة الاستراتيجية', { measure: 'rollup', obj: 'SO-2.3' });
  add('u_president', 'P2', 'quarterly', 'cur', 'اجتماعات مراجعة الأداء الربعية مع الإدارات', { measure: 'numeric', target: 7, cur: 4, unit: 'اجتماعات', parent: 'P1' });
  add('u_president', 'P3', 'weekly', 'cur', 'زيارات ميدانية لمراكز الخدمة', { measure: 'numeric', target: 2, cur: 1, unit: 'زيارات' });
}
