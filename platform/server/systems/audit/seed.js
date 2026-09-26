// Internal Audit — demo seed: this year's risk-based plan (6 engagements across
// HR, Operations, Procurement, IT and Finance), ~10 findings (issued and draft),
// action plans (some overdue), information requests, working papers and three
// external-auditor requests (one released). Idempotent; every row is_demo=1.
import { one, all, run, uid, isEmpty, day, at, tx } from '../kit.js';
import * as D from '../../services/documents.js';
import { reportHtml } from './report.js';

const U = (id) => {
  const u = one('SELECT u.*, d.name_ar AS dept_ar, d.name_en AS dept_en FROM users u JOIN departments d ON d.id=u.department_id WHERE u.id=?', id);
  if (u) u.caps = all('SELECT cap FROM user_caps WHERE user_id=?', id).map((r) => r.cap);
  return u;
};
const quarterOf = (iso, y) => (Number(iso.slice(0, 4)) === y ? Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1 : Number(iso.slice(0, 4)) < y ? 1 : 4);
// Create a document owned by a persona, dated in the past (Documents module).
function doc(user, title, kind, html, when) {
  const id = D.createDocument(user, { title, kind, content_html: html }).result.id;
  run('UPDATE documents SET created_at=?, updated_at=? WHERE id=?', when, when, id);
  run('UPDATE document_versions SET created_at=? WHERE document_id=?', when, id);
  return id;
}

export function seed() {
  if (!isEmpty('audit_plans')) return;
  const need = ['u_aisha', 'u_saeed', 'u_hessa', 'u_salem', 'u_omar', 'u_fatima', 'u_majed', 'u_reem', 'u_mariam', 'u_ext_rashid', 'u_president'];
  if (need.some((id) => !one('SELECT 1 FROM users WHERE id=?', id))) return;
  const y = new Date().getUTCFullYear();
  const aisha = U('u_aisha'); const mariam = U('u_mariam'); const majed = U('u_majed');

  tx(() => {
    // ---------- plan ----------
    run('INSERT INTO audit_plans (id,year,status,notes,submitted_by,submitted_at,approved_by,approved_at,is_demo,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)',
      'ap_demo', y, 'approved', 'خطة مبنية على تقييم المخاطر لمجال التدقيق، تغطي العمليات ذات الخطورة العالية والمتوسطة، مع ترك سعة للمهام الطارئة بطلب من لجنة التدقيق.',
      'u_saeed', at(-262, 9), 'u_aisha', at(-258, 11), 'u_saeed', at(-270, 8), at(-258, 11));

    // ---------- audit universe (likelihood × impact) ----------
    const uni = [
      ['au_hr_recruit', 'التوظيف والتعيين', 'Recruitment and appointment', 'dept_hr', 3, 3, 'تعدد مراحل الاختيار واعتماد الوثائق الورقية في التحقق من المؤهلات.', y - 3],
      ['au_hr_payroll', 'احتساب الرواتب والبدلات', 'Payroll and allowances', 'dept_hr', 3, 5, 'أثر مالي مباشر وتعديلات يدوية شهرية على البدلات.', y - 2],
      ['au_fin_cash', 'السلف والعهد النقدية', 'Advances and petty cash', 'dept_fin', 3, 4, 'تسويات متأخرة لعهد مفتوحة وتعدد أمناء العهد.', y - 2],
      ['au_fin_budget', 'إعداد الموازنة ومتابعة الصرف', 'Budget preparation and spending', 'dept_fin', 2, 4, 'ضوابط آلية في النظام المالي مع مراجعة ربعية.', y - 1],
      ['au_proc_direct', 'الشراء المباشر وإدارة العقود', 'Direct purchasing and contracts', 'dept_proc', 4, 5, 'ارتفاع قيمة الشراء المباشر وتكرار التعامل مع موردين محددين.', y - 3],
      ['au_it_access', 'ضوابط الوصول وإدارة الصلاحيات', 'Access control and privileges', 'dept_it', 4, 4, 'ترحيل الأنظمة إلى السحابة وتغيّر أدوار المستخدمين.', null],
      ['au_it_bcp', 'استمرارية الأعمال والتعافي من الكوارث', 'Business continuity and DR', 'dept_it', 3, 5, 'خطة التعافي لم تُختبر بعد الترحيل السحابي — مقترحة للخطة القادمة.', null],
      ['au_ops_cs', 'خدمة المتعاملين ومعالجة الشكاوى', 'Customer service and complaints', 'dept_ops', 3, 3, 'زيادة حجم الشكاوى بعد إطلاق القنوات الرقمية.', y - 4],
      ['au_ops_assets', 'إدارة المخزون والأصول الثابتة', 'Inventory and fixed assets', 'dept_ops', 3, 4, 'جرد سنوي واحد وفروقات متكررة في المخازن.', y - 3],
      ['au_legal_cases', 'إدارة القضايا والعقود القانونية', 'Legal cases and contracts', 'dept_legal', 2, 3, 'حجم قضايا محدود ومتابعة منتظمة مع المستشار الخارجي.', y - 2],
      ['au_spmo_init', 'متابعة المبادرات الاستراتيجية', 'Strategic initiatives monitoring', 'dept_spmo', 2, 3, 'منهجية متابعة مستقرة وتقارير ربعية للإدارة العليا.', y - 1],
    ];
    for (const [id, ar, en, dept, l, i, why, last] of uni) run('INSERT INTO audit_universe (id,name_ar,name_en,department_id,likelihood,impact,rationale,last_audit_year,is_demo,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,1,?,?,?)', id, ar, en, dept, l, i, why, last, 'u_saeed', at(-275, 9), at(-275, 9));

    // ---------- engagements ----------
    const eng = (id, uniId, title, dept, phase, start, end, lead, teamIds, scope, objectives, extra = {}) => {
      run(`INSERT INTO audit_engagements (id,plan_year,universe_id,title,department_id,scope,objectives,quarter,phase,lead_id,start_date,end_date,exec_summary,started_at,closed_at,is_demo,created_by,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?,?)`, id, y, uniId, title, dept, scope, objectives, quarterOf(start, y), phase, lead, start, end, extra.summary || '',
      phase === 'planned' ? null : `${start}T08:00:00.000Z`, extra.closed_at || null, 'u_saeed', at(-268, 10), at(-2, 10));
      for (const t of teamIds) run('INSERT INTO audit_team (engagement_id,user_id) VALUES (?,?)', id, t);
    };
    eng('ae_demo_hr_recruit', 'au_hr_recruit', 'تدقيق إجراءات التوظيف والتعيين', 'dept_hr', 'closed', day(-230), day(-170), 'u_saeed', ['u_saeed', 'u_aisha'],
      'عمليات التوظيف والتعيين خلال النصف الثاني من العام الماضي: الإعلان، المفاضلة، التحقق من المؤهلات، وإصدار قرارات التعيين.',
      'التحقق من التزام إجراءات التوظيف بقانون الموارد البشرية ولائحته التنفيذية، وتقييم كفاية ضوابط التحقق من المؤهلات والخبرات.',
      { summary: 'نفّذ مكتب التدقيق الداخلي مهمة تدقيق إجراءات التوظيف والتعيين، وتبيّن أن الإجراءات متوافقة بشكل عام مع اللائحة. رُصدت ملاحظتان تتعلقان باكتمال ملفات التحقق من المؤهلات وتأخر إنهاء إجراءات فترة التجربة، وقد نفّذت الإدارة خطط المعالجة وتحقق المكتب من إغلاقهما.', closed_at: at(-45, 12) });
    eng('ae_demo_ops_cs', 'au_ops_cs', 'تدقيق إجراءات خدمة المتعاملين ومعالجة الشكاوى', 'dept_ops', 'follow_up', day(-140), day(-90), 'u_saeed', ['u_saeed'],
      'استقبال الشكاوى وتصنيفها ومعالجتها عبر القنوات الرقمية ومركز الاتصال خلال الربع الأول، وقياس رضا المتعاملين.',
      'تقييم فاعلية ضوابط معالجة الشكاوى ضمن المدد المعيارية، والتحقق من دقة مؤشرات الأداء المرفوعة للإدارة العليا.',
      { summary: 'نفّذ مكتب التدقيق الداخلي مهمة تدقيق إجراءات خدمة المتعاملين ومعالجة الشكاوى. أسفرت المهمة عن ثلاث ملاحظات أبرزها تجاوز المدة المعيارية لمعالجة الشكاوى دون تصعيد، ووافقت الإدارة على خطط معالجة لجميع الملاحظات.' });
    eng('ae_demo_proc', 'au_proc_direct', 'تدقيق عمليات الشراء المباشر وإدارة العقود', 'dept_proc', 'reporting', day(-60), day(10), 'u_saeed', ['u_saeed', 'u_aisha'],
      'أوامر الشراء المباشر والعقود المبرمة من يناير إلى يونيو من العام الحالي، وسجل الموردين المؤهلين.',
      'التحقق من الالتزام بحدود الصلاحيات المالية ودليل المشتريات، وتقييم ضوابط تأهيل الموردين وتوثيق مبررات الشراء المباشر.');
    eng('ae_demo_it_access', 'au_it_access', 'تدقيق ضوابط الوصول وإدارة الصلاحيات في الأنظمة', 'dept_it', 'fieldwork', day(-18), day(30), 'u_saeed', ['u_saeed'],
      'منح الصلاحيات وتعديلها وإلغاؤها في النظام المالي ونظام الموارد البشرية والبوابة الموحدة بعد الترحيل إلى السحابة الحكومية.',
      'التحقق من إلغاء صلاحيات الموظفين المنتهية خدماتهم في الوقت المناسب، ومن وجود مراجعة دورية للصلاحيات وفصل المهام.');
    eng('ae_demo_fin_cash', 'au_fin_cash', 'تدقيق السلف والعهد النقدية', 'dept_fin', 'planned', day(20), day(60), 'u_saeed', ['u_saeed'],
      'العهد النقدية المستديمة والسلف المؤقتة القائمة، وتسوياتها خلال العام الحالي.',
      'التحقق من وجود ضوابط كافية لصرف السلف وتسويتها في المواعيد المحددة، ومطابقة أرصدة العهد مع السجلات المالية.');
    eng('ae_demo_hr_payroll', 'au_hr_payroll', 'تدقيق احتساب الرواتب والبدلات', 'dept_hr', 'planned', day(50), day(95), 'u_aisha', ['u_aisha', 'u_saeed'],
      'احتساب الرواتب والبدلات الشهرية والتعديلات اليدوية عليها للأشهر التسعة الأولى من العام.',
      'التحقق من دقة احتساب الرواتب والبدلات وفق الجداول المعتمدة، وكفاية ضوابط اعتماد التعديلات اليدوية.');

    // ---------- findings, action plans, timelines ----------
    const upd = (fid, userId, kind, note, when, internal = 0) => run('INSERT INTO audit_updates (id,finding_id,user_id,kind,note,internal,is_demo,created_at) VALUES (?,?,?,?,?,?,1,?)', uid('au_'), fid, userId, kind, note, internal, when);
    const finding = (id, engId, dept, ref, risk, status, t, x = {}) => {
      run(`INSERT INTO audit_findings (id,engagement_id,department_id,ref,title,criteria,condition,cause,effect,risk,recommendation,workpaper_id,status,raised_by,issued_by,issued_at,position,response_text,response_by,response_at,closed_by,closed_at,is_demo,created_at,updated_at)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, engId, dept, ref, t.title, t.criteria, t.condition, t.cause, t.effect, risk, t.rec, x.wp || null, status, 'u_saeed',
      x.issued ? 'u_aisha' : null, x.issued || null, x.position || null, x.response || null, x.responder || null, x.responded || null,
      x.closed ? 'u_aisha' : null, x.closed || null, x.created || at(-10, 9), at(-1, 9));
      upd(id, 'u_saeed', 'created', '', x.created || at(-10, 9), 1);
      if (x.issued) upd(id, 'u_aisha', 'issued', '', x.issued);
      if (x.responded) upd(id, x.responder, 'response', x.response, x.responded);
    };
    const action = (fid, desc, owner, due, status, createdBy, created, x = {}) => run(`INSERT INTO audit_actions (id,finding_id,description,owner_id,due_date,status,implemented_at,closed_at,created_by,is_demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,1,?,?)`, uid('aa_'), fid, desc, owner, due, status, x.implemented || null, x.closed || null, createdBy, created, x.closed || x.implemented || created);

    // E1 — HR recruitment (closed)
    finding('af_demo_01', 'ae_demo_hr_recruit', 'dept_hr', 'F-01', 'medium', 'closed', {
      title: 'عدم اكتمال ملفات التحقق من المؤهلات لبعض المعيّنين',
      criteria: 'تشترط اللائحة التنفيذية لقانون الموارد البشرية التحقق من صحة المؤهلات العلمية ومعادلتها قبل إصدار قرار التعيين.',
      condition: 'تبيّن من فحص عينة من 25 ملف تعيين أن 4 ملفات (16%) لم تتضمن ما يثبت التحقق من المؤهل أو معادلته قبل مباشرة العمل.',
      cause: 'غياب قائمة تحقق إلزامية في نظام التوظيف تمنع إصدار القرار قبل استكمال المرفقات.',
      effect: 'احتمال تعيين موظفين بمؤهلات غير مستوفاة للشروط وما يترتب عليه من آثار قانونية ومالية.',
      rec: 'إضافة قائمة تحقق إلزامية في نظام التوظيف، واستكمال التحقق من الملفات الأربعة خلال 60 يوماً.',
    }, { issued: at(-168, 10), position: 'agree', response: 'نتفق مع الملاحظة، وسيتم تفعيل قائمة التحقق الإلزامية واستكمال الملفات الناقصة.', responder: 'u_hessa', responded: at(-163, 12), closed: at(-95, 11), created: at(-185, 9) });
    action('af_demo_01', 'تفعيل قائمة تحقق إلزامية للمرفقات في نظام التوظيف واستكمال التحقق من الملفات الأربعة.', 'u_salem', day(-90), 'closed', 'u_hessa', at(-163, 12), { implemented: at(-101, 13), closed: at(-95, 11) });
    upd('af_demo_01', 'u_salem', 'progress', 'تم استكمال التحقق من ثلاثة ملفات والتنسيق مع الجهة المانحة للمؤهل الرابع.', at(-120, 10));
    upd('af_demo_01', 'u_salem', 'implemented', 'فُعّلت قائمة التحقق في نظام التوظيف واستُكمل التحقق من الملفات الأربعة؛ أرفقنا محضر الاستكمال.', at(-101, 13));
    upd('af_demo_01', 'u_aisha', 'closed', 'تحقق المكتب من عينة بعد التفعيل؛ الضابط يعمل كما صُمّم.', at(-95, 11));

    finding('af_demo_02', 'ae_demo_hr_recruit', 'dept_hr', 'F-02', 'low', 'closed', {
      title: 'تأخر إنهاء إجراءات تقييم فترة التجربة',
      criteria: 'يجب تقييم الموظف المعيّن قبل نهاية فترة التجربة المحددة بستة أشهر واتخاذ قرار التثبيت أو الإنهاء.',
      condition: 'لم تُستكمل تقييمات فترة التجربة لـ 3 موظفين من أصل 18 إلا بعد انتهاء المدة بفترة تراوحت بين 12 و40 يوماً.',
      cause: 'عدم وجود تنبيه آلي للمدير المباشر قبل انتهاء فترة التجربة.',
      effect: 'تثبيت ضمني للموظفين دون تقييم موثق لأدائهم.',
      rec: 'إعداد تنبيه آلي للمديرين قبل 30 يوماً من نهاية فترة التجربة ومتابعته من إدارة الموارد البشرية.',
    }, { issued: at(-168, 10), position: 'agree', response: 'سيتم إعداد التنبيه الآلي ضمن نظام الخدمة الذاتية.', responder: 'u_hessa', responded: at(-163, 12), closed: at(-50, 10), created: at(-184, 9) });
    action('af_demo_02', 'تفعيل تنبيه آلي للمدير المباشر قبل 30 يوماً من نهاية فترة التجربة.', 'u_hessa', day(-60), 'closed', 'u_hessa', at(-163, 12), { implemented: at(-68, 9), closed: at(-50, 10) });
    upd('af_demo_02', 'u_hessa', 'implemented', 'فُعّل التنبيه في نظام الخدمة الذاتية واختُبر على دفعة التعيينات الأخيرة.', at(-68, 9));
    upd('af_demo_02', 'u_aisha', 'closed', 'تم التحقق من عمل التنبيه.', at(-50, 10));

    // E2 — Operations customer service (follow-up)
    finding('af_demo_03', 'ae_demo_ops_cs', 'dept_ops', 'F-01', 'high', 'in_follow_up', {
      title: 'تجاوز المدة المعيارية لمعالجة الشكاوى دون تصعيد',
      criteria: 'يحدد دليل خدمة المتعاملين مدة معالجة قصوى قدرها 5 أيام عمل للشكوى، مع تصعيد تلقائي للمشرف عند التجاوز.',
      condition: 'من أصل 120 شكوى في العينة، تجاوزت 31 شكوى (26%) المدة المعيارية، ولم تُصعَّد 22 منها للمشرف.',
      cause: 'قاعدة التصعيد غير مفعّلة في نظام إدارة التذاكر منذ تحديثه، والاعتماد على المتابعة اليدوية.',
      effect: 'انخفاض رضا المتعاملين وتعرّض الجهة لملاحظات جهات الرقابة على الخدمات الحكومية.',
      rec: 'تفعيل قاعدة التصعيد الآلي في نظام التذاكر، وإعداد تقرير أسبوعي بالشكاوى المتجاوزة للمدة يُرفع لمدير العمليات.',
    }, { issued: at(-82, 10), position: 'agree', response: 'نتفق مع الملاحظة. سيتم تفعيل التصعيد الآلي ضمن مشروع مركز خدمة العملاء، مع تقرير أسبوعي مؤقت.', responder: 'u_omar', responded: at(-76, 11), created: at(-100, 9) });
    action('af_demo_03', 'تفعيل قاعدة التصعيد الآلي في نظام إدارة التذاكر وإصدار تقرير أسبوعي بالشكاوى المتجاوزة.', 'u_fatima', day(-12), 'in_progress', 'u_omar', at(-76, 11));
    upd('af_demo_03', 'u_fatima', 'progress', 'أُعدّ التقرير الأسبوعي المؤقت، وتفعيل التصعيد الآلي بانتظار اختيار نظام إدارة التذاكر الجديد.', at(-20, 10));
    upd('af_demo_03', 'u_saeed', 'note', 'نتابع مع إدارة العمليات موعداً بديلاً بعد تجاوز تاريخ الاستحقاق.', at(-4, 9), 1);

    finding('af_demo_04', 'ae_demo_ops_cs', 'dept_ops', 'F-02', 'medium', 'implemented', {
      title: 'غياب التحقق الدوري من رضا المتعاملين بعد إغلاق الطلب',
      criteria: 'يتطلب ميثاق خدمة المتعاملين قياس رضا المتعامل عن كل طلب مغلق ورفع النتائج شهرياً.',
      condition: 'لا يُرسل استبيان الرضا إلا للطلبات المقدمة عبر البوابة (42% من الإجمالي)، ولا تُقاس طلبات مركز الاتصال.',
      cause: 'عدم ربط مركز الاتصال بأداة الاستبيانات.',
      effect: 'مؤشر رضا غير ممثل لجميع القنوات وقرارات تحسين مبنية على بيانات جزئية.',
      rec: 'ربط جميع قنوات الخدمة بأداة قياس الرضا وتوحيد المؤشر الشهري.',
    }, { issued: at(-82, 10), position: 'agree', response: 'سيتم ربط مركز الاتصال بأداة الاستبيان خلال الربع الحالي.', responder: 'u_omar', responded: at(-76, 11), created: at(-99, 9) });
    action('af_demo_04', 'ربط مركز الاتصال بأداة قياس رضا المتعاملين وتوحيد المؤشر الشهري لجميع القنوات.', 'u_fatima', day(20), 'implemented', 'u_omar', at(-76, 11), { implemented: at(-3, 13) });
    upd('af_demo_04', 'u_fatima', 'implemented', 'رُبط مركز الاتصال بأداة الاستبيان منذ بداية الشهر، وصدر أول مؤشر موحد لجميع القنوات.', at(-3, 13));

    finding('af_demo_05', 'ae_demo_ops_cs', 'dept_ops', 'F-03', 'low', 'in_follow_up', {
      title: 'عدم توحيد نماذج تسجيل الشكاوى بين القنوات',
      criteria: 'يتطلب دليل الإجراءات استخدام نموذج موحد لتصنيف الشكاوى.',
      condition: 'تُستخدم ثلاثة نماذج مختلفة لتسجيل الشكاوى بتصنيفات غير متطابقة.',
      cause: 'تحديث الدليل دون سحب النماذج القديمة.',
      effect: 'صعوبة تحليل أسباب الشكاوى الجذرية على مستوى الجهة.',
      rec: 'اعتماد نموذج موحد وسحب النماذج القديمة من جميع القنوات.',
    }, { issued: at(-82, 10), position: 'partial', response: 'نتفق جزئياً؛ سيتم توحيد التصنيف مع الإبقاء على حقول خاصة بمركز الاتصال.', responder: 'u_omar', responded: at(-76, 11), created: at(-98, 9) });
    action('af_demo_05', 'اعتماد نموذج موحد لتسجيل الشكاوى وتوحيد التصنيفات في جميع القنوات.', 'u_omar', day(-5), 'open', 'u_omar', at(-76, 11));

    // E3 — Procurement (reporting)
    finding('af_demo_06', 'ae_demo_proc', 'dept_proc', 'F-01', 'high', 'issued', {
      title: 'تجزئة أوامر الشراء لتفادي حدود الصلاحيات المالية',
      criteria: 'يحظر دليل المشتريات تجزئة الاحتياج الواحد إلى أوامر متعددة للبقاء دون حد الشراء المباشر (50,000 درهم).',
      condition: 'رُصدت 6 حالات صدرت فيها أوامر شراء متتالية للمورد نفسه وللبند نفسه خلال أقل من 30 يوماً بإجمالي 212,400 درهم.',
      cause: 'عدم وجود ضابط آلي يرصد الأوامر المتكررة للمورد والبند خلال فترة قصيرة.',
      effect: 'تجاوز حدود الصلاحيات المالية وحرمان الجهة من المنافسة والحصول على أفضل الأسعار.',
      rec: 'تفعيل تنبيه آلي للأوامر المتكررة للمورد والبند نفسيهما خلال 30 يوماً، ومراجعة الحالات الست مع الإدارة المالية.',
    }, { issued: at(-6, 10), created: at(-25, 9), wp: 'aw_demo_p1' });
    finding('af_demo_07', 'ae_demo_proc', 'dept_proc', 'F-02', 'medium', 'in_follow_up', {
      title: 'عدم تحديث سجل الموردين المؤهلين',
      criteria: 'يجب تحديث بيانات تأهيل الموردين (الرخصة التجارية وشهادات الجودة) سنوياً.',
      condition: '11 مورداً من أصل 48 في السجل انتهت صلاحية رخصهم التجارية، وصدرت لثلاثة منهم أوامر شراء خلال فترة الانتهاء.',
      cause: 'غياب تنبيه بانتهاء صلاحية مستندات التأهيل في منصة مقدمي الخدمات.',
      effect: 'التعامل مع موردين غير مستوفين لشروط التأهيل.',
      rec: 'تفعيل تنبيه بانتهاء صلاحية مستندات التأهيل وإيقاف إصدار الأوامر للموردين منتهي الصلاحية.',
    }, { issued: at(-6, 10), position: 'agree', response: 'نتفق مع الملاحظة. سيتم تحديث السجل وتفعيل التنبيه في منصة مقدمي الخدمات.', responder: 'u_majed', responded: at(-3, 12), created: at(-24, 9), wp: 'aw_demo_p2' });
    action('af_demo_07', 'تحديث بيانات الموردين الأحد عشر وتفعيل تنبيه انتهاء صلاحية مستندات التأهيل في منصة مقدمي الخدمات.', 'u_reem', day(45), 'open', 'u_majed', at(-3, 12));
    finding('af_demo_08', 'ae_demo_proc', 'dept_proc', 'F-03', 'low', 'draft', {
      title: 'نقص توثيق مبررات اللجوء إلى الشراء المباشر',
      criteria: 'يشترط دليل المشتريات توثيق مبرر الشراء المباشر واعتماده قبل إصدار الأمر.',
      condition: '9 أوامر من أصل 40 في العينة خلت من مذكرة المبرر أو اعتمادها.',
      cause: 'حقل المبرر اختياري في نموذج طلب الشراء.',
      effect: 'ضعف الشفافية وصعوبة التحقق من مشروعية قرارات الشراء.',
      rec: 'جعل حقل المبرر واعتماده إلزامياً في نموذج طلب الشراء.',
    }, { created: at(-5, 9), wp: 'aw_demo_p3' });

    // E4 — IT access (fieldwork, drafts only)
    finding('af_demo_09', 'ae_demo_it_access', 'dept_it', 'F-01', 'high', 'draft', {
      title: 'حسابات نشطة لموظفين انتهت خدماتهم',
      criteria: 'تتطلب سياسة أمن المعلومات إلغاء صلاحيات الموظف خلال يوم عمل واحد من انتهاء خدمته.',
      condition: 'ما زالت 7 حسابات نشطة في النظام المالي والبوابة الموحدة لموظفين انتهت خدماتهم منذ 20 إلى 95 يوماً، استُخدم أحدها بعد تاريخ الانتهاء.',
      cause: 'عدم ربط إجراء إنهاء الخدمة في الموارد البشرية بإلغاء الحسابات آلياً.',
      effect: 'خطر وصول غير مصرح به إلى بيانات مالية وشخصية.',
      rec: 'ربط إنهاء الخدمة بإلغاء الحسابات آلياً، وتعطيل الحسابات السبعة فوراً والتحقق من سجل استخدام الحساب المستخدم.',
    }, { created: at(-4, 11), wp: 'aw_demo_i1' });
    finding('af_demo_10', 'ae_demo_it_access', 'dept_it', 'F-02', 'medium', 'draft', {
      title: 'عدم إجراء المراجعة الدورية لصلاحيات المستخدمين',
      criteria: 'تنص سياسة إدارة الصلاحيات على مراجعة نصف سنوية لصلاحيات المستخدمين من مالكي الأنظمة.',
      condition: 'لم تُجرَ آخر مراجعة دورية إلا قبل 14 شهراً، ولم تشمل النظام المالي.',
      cause: 'انشغال الفريق بمشروع الترحيل إلى السحابة وعدم تحديد مالكي الأنظمة بعد الترحيل.',
      effect: 'تراكم صلاحيات زائدة عن الحاجة وضعف فصل المهام.',
      rec: 'تحديد مالكي الأنظمة وإجراء مراجعة شاملة للصلاحيات خلال 60 يوماً ثم كل ستة أشهر.',
    }, { created: at(-2, 12) });

    // ---------- working papers (restricted) ----------
    const wp = (id, engId, ref, title, proc, ev, concl, result, status, reviewedAt) => run(`INSERT INTO audit_workpapers (id,engagement_id,ref,title,procedure,evidence,conclusion,result,status,prepared_by,reviewed_by,reviewed_at,is_demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, engId, ref, title, proc, ev, concl, result, status, 'u_saeed', status === 'reviewed' ? 'u_aisha' : null, reviewedAt || null, at(-30, 9), reviewedAt || at(-3, 9));
    wp('aw_demo_p1', 'ae_demo_proc', 'WP-01', 'فحص عينة أوامر الشراء المباشر', '1. سحب عينة عشوائية من 40 أمر شراء مباشر.\n2. مطابقة قيمة كل أمر مع حد الشراء المباشر.\n3. تحليل الأوامر المتتالية للمورد والبند نفسيهما خلال 30 يوماً.', 'تقرير أوامر الشراء من النظام المالي (يناير–يونيو)، وملف تحليل التكرار مع ترقيم الحالات الست.', 'استثناء: 6 حالات تجزئة محتملة بإجمالي 212,400 درهم.', 'exception', 'reviewed', at(-20, 14));
    wp('aw_demo_p2', 'ae_demo_proc', 'WP-02', 'مطابقة الموردين مع سجل التأهيل', 'مطابقة الموردين الذين صدرت لهم أوامر مع سجل التأهيل وتواريخ صلاحية الرخص.', 'سجل الموردين المؤهلين (48 مورداً) ونسخ الرخص التجارية.', 'استثناء: 11 رخصة منتهية، 3 منها صدرت لها أوامر.', 'exception', 'reviewed', at(-18, 11));
    wp('aw_demo_p3', 'ae_demo_proc', 'WP-03', 'مراجعة مبررات الشراء المباشر', 'فحص وجود مذكرة المبرر واعتمادها لكل أمر في العينة.', 'مذكرات المبرر المرفقة بأوامر العينة.', 'استثناء: 9 أوامر بلا مبرر معتمد.', 'exception', 'draft');
    wp('aw_demo_i1', 'ae_demo_it_access', 'WP-01', 'اختبار إلغاء صلاحيات الموظفين المنتهية خدماتهم', 'مطابقة قائمة المنتهية خدماتهم من الموارد البشرية مع الحسابات النشطة في الأنظمة الثلاثة، وفحص سجل آخر دخول.', 'قائمة إنهاء الخدمة (طلب مباشر من الموارد البشرية) وتقارير الحسابات النشطة.', 'استثناء: 7 حسابات نشطة؛ حساب واحد استُخدم بعد انتهاء الخدمة — يتطلب تصعيداً.', 'exception', 'draft');
    wp('aw_demo_i2', 'ae_demo_it_access', 'WP-02', 'مراجعة مصفوفة فصل المهام في النظام المالي', 'مراجعة الأدوار المتعارضة (إنشاء المورد/اعتماد الدفع) لجميع المستخدمين.', 'مصفوفة الأدوار المصدّرة من النظام المالي.', 'مرضٍ: لا تعارضات في الأدوار الحالية.', 'satisfactory', 'reviewed', at(-6, 15));
    wp('aw_demo_o1', 'ae_demo_ops_cs', 'WP-01', 'تحليل مدد معالجة الشكاوى', 'تحليل عينة 120 شكوى وحساب مدة المعالجة ومقارنتها بالمعيار.', 'تصدير نظام التذاكر للربع الأول.', 'استثناء: 26% تجاوزت المدة.', 'exception', 'reviewed', at(-95, 10));

    // ---------- information requests (PBC) ----------
    const req = (id, engId, dept, to, title, details, due, status, x = {}) => run(`INSERT INTO audit_requests (id,engagement_id,department_id,to_user_id,title,details,due_date,status,response_text,responded_by,responded_at,review_note,reviewed_by,reviewed_at,is_demo,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, engId, dept, to, title, details, due, status, x.response || null, x.responded ? to : null, x.responded || null, x.note || null, x.reviewed ? 'u_saeed' : null, x.reviewed || null, 'u_saeed', x.created);
    req('ar_demo_hr1', 'ae_demo_hr_recruit', 'dept_hr', 'u_hessa', 'ملفات التعيين للنصف الثاني من العام الماضي', 'نسخة من ملفات التعيين كاملة (25 ملفاً) مع مرفقات التحقق من المؤهلات.', day(-220), 'accepted', { response: 'أُتيحت الملفات في القاعة المخصصة للتدقيق مع فهرس بالمرفقات.', responded: at(-222, 12), reviewed: at(-219, 9), created: at(-228, 9) });
    req('ar_demo_ops1', 'ae_demo_ops_cs', 'dept_ops', 'u_omar', 'سجل الشكاوى المستلمة خلال الربع الأول', 'تصدير كامل من نظام التذاكر يتضمن تاريخ الاستلام والإغلاق والقناة والتصنيف.', day(-128), 'accepted', { response: 'مرفق التصدير الكامل (1,420 شكوى) بصيغة جدول.', responded: at(-130, 11), reviewed: at(-127, 10), created: at(-136, 9) });
    req('ar_demo_ops2', 'ae_demo_ops_cs', 'dept_ops', 'u_omar', 'مؤشرات زمن الاستجابة الشهرية المرفوعة للإدارة العليا', 'التقارير الشهرية لمؤشرات زمن الاستجابة ونسبة الرضا للربع الأول.', day(-120), 'accepted', { response: 'مرفقة التقارير الشهرية الثلاثة.', responded: at(-117, 14), reviewed: at(-116, 9), created: at(-134, 9) });
    req('ar_demo_p1', 'ae_demo_proc', 'dept_proc', 'u_majed', 'كشف أوامر الشراء المباشر من يناير إلى يونيو', 'تقرير من النظام المالي بجميع أوامر الشراء المباشر يتضمن المورد والبند والقيمة وتاريخ الاعتماد.', day(-45), 'accepted', { response: 'مرفق التقرير المستخرج من النظام المالي (312 أمراً).', responded: at(-47, 10), reviewed: at(-44, 9), created: at(-55, 9) });
    req('ar_demo_p2', 'ae_demo_proc', 'dept_proc', 'u_majed', 'محاضر لجنة المشتريات للربعين الأول والثاني', 'جميع محاضر اجتماعات لجنة المشتريات وقراراتها.', day(-40), 'accepted', { response: 'أُرسلت المحاضر الثمانية بعد استكمال التواقيع.', responded: at(-36, 13), reviewed: at(-35, 9), created: at(-52, 9) });
    req('ar_demo_p3', 'ae_demo_proc', 'dept_proc', 'u_majed', 'سجل الموردين المؤهلين وتواريخ آخر تحديث', 'السجل الحالي مع تواريخ صلاحية الرخص التجارية وشهادات الجودة.', day(-20), 'accepted', { response: 'مرفق السجل كما هو في منصة مقدمي الخدمات.', responded: at(-21, 11), reviewed: at(-19, 9), created: at(-30, 9) });
    req('ar_demo_i1', 'ae_demo_it_access', 'dept_it', 'u_mariam', 'قائمة بجميع حسابات المستخدمين في الأنظمة الرئيسية مع تاريخ آخر دخول', 'الأنظمة: النظام المالي، نظام الموارد البشرية، البوابة الموحدة. يُرجى تضمين حالة الحساب والدور المسند.', day(3), 'open', { created: at(-10, 9) });
    req('ar_demo_i2', 'ae_demo_it_access', 'dept_it', 'u_mariam', 'سياسة إدارة الصلاحيات المعتمدة ومحاضر آخر مراجعة دورية', 'النسخة المعتمدة من السياسة، وآخر محضرين لمراجعة الصلاحيات مع قائمة الإجراءات المتخذة.', day(-2), 'open', { created: at(-12, 9) });
    req('ar_demo_i3', 'ae_demo_it_access', 'dept_it', 'u_mariam', 'قائمة الحسابات ذات الصلاحيات العليا', 'جميع حسابات المسؤولين (Admin) في الأنظمة الثلاثة مع مبرر الصلاحية ومالكها.', day(-6), 'responded', { response: 'مرفق سجل الحسابات ذات الصلاحيات العليا مع المبررات. حسابان خدميان مشتركان قيد الإلغاء.', responded: at(-7, 15), created: at(-15, 9) });

    // ---------- external auditor requests ----------
    const ext = (id, title, details, due, status, created, x = {}) => run(`INSERT INTO audit_ext_requests (id,requester_id,org_id,title,details,due_date,status,assigned_to,assigned_by,assigned_at,internal_note,response_text,prepared_by,prepared_at,released_text,released_by,released_at,is_demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`, id, 'u_ext_rashid', 'ext_audit', title, details, due, status, x.to || null, x.to ? 'u_aisha' : null, x.assigned || null, x.note || null,
    x.response || null, x.prepared ? x.to : null, x.prepared || null, x.released_text || null, x.released ? 'u_aisha' : null, x.released || null, created, x.released || x.prepared || x.assigned || created);
    ext('ax_demo_1', `تزويدنا بسجل الأصول الثابتة لعام ${y - 1}`, 'السجل التفصيلي للأصول الثابتة كما في 31 ديسمبر مع الإضافات والاستبعادات خلال العام ومجمع الإهلاك.', day(-10), 'released', at(-20, 10), {
      to: 'u_majed', assigned: at(-19, 9), note: 'يرجى إرفاق السجل المعتمد من النظام المالي مع تسوية الإضافات والاستبعادات؛ لا تُرفق مراسلات داخلية.',
      response: 'مرفق سجل الأصول الثابتة المعتمد مع جدول تسوية الإضافات والاستبعادات.', prepared: at(-14, 13),
      released_text: 'نرفق لكم سجل الأصول الثابتة المعتمد كما في نهاية العام، متضمناً جدول تسوية الإضافات والاستبعادات ومجمع الإهلاك.', released: at(-12, 11) });
    ext('ax_demo_2', 'كشوفات المطابقة البنكية لشهري يوليو وأغسطس', 'كشوفات المطابقة لجميع الحسابات البنكية مع الكشوف الصادرة من البنوك.', day(4), 'prepared', at(-8, 10), {
      to: 'u_majed', assigned: at(-7, 9), note: 'المطابقات المعتمدة فقط.', response: 'أُعدّت كشوفات المطابقة للحسابات الأربعة، وتُرفق بعد مراجعة مكتب التدقيق.', prepared: at(-2, 12) });
    ext('ax_demo_3', 'نسخ من عقود الإيجار السارية وجدول الالتزامات التعاقدية', 'جميع عقود الإيجار السارية ومدة كل عقد وقيمة الالتزامات المستقبلية.', day(12), 'submitted', at(-1, 9));
  });

  // ---------- documents (Documents module): responders' own files and issued reports ----------
  try {
    const d1 = doc(mariam, 'سجل الحسابات ذات الصلاحيات العليا — الأنظمة الرئيسية', 'note',
      '<h2>الحسابات ذات الصلاحيات العليا</h2><table><thead><tr><th>النظام</th><th>عدد حسابات المسؤولين</th><th>المبرر</th></tr></thead><tbody><tr><td>النظام المالي</td><td>3</td><td>إدارة الإعدادات والتقارير</td></tr><tr><td>نظام الموارد البشرية</td><td>2</td><td>إدارة الهيكل والصلاحيات</td></tr><tr><td>البوابة الموحدة</td><td>4 (منها حسابان خدميان قيد الإلغاء)</td><td>التشغيل والدعم الفني</td></tr></tbody></table>', at(-7, 14));
    run('INSERT INTO audit_links (id,kind,ref_id,document_id,title,linked_by,linked_at) VALUES (?,?,?,?,?,?,?)', uid('al_'), 'pbc', 'ar_demo_i3', d1, 'سجل الحسابات ذات الصلاحيات العليا — الأنظمة الرئيسية', 'u_mariam', at(-7, 15));
    const d2 = doc(majed, `سجل الأصول الثابتة ${y - 1} — ملخص معتمد`, 'report',
      `<h2>ملخص سجل الأصول الثابتة كما في 31 ديسمبر ${y - 1}</h2><table><thead><tr><th>الفئة</th><th>الرصيد الافتتاحي</th><th>الإضافات</th><th>الاستبعادات</th><th>الرصيد الختامي</th></tr></thead><tbody><tr><td>مبانٍ وتحسينات</td><td>18,450,000</td><td>620,000</td><td>0</td><td>19,070,000</td></tr><tr><td>أجهزة وتقنية المعلومات</td><td>4,210,000</td><td>1,140,000</td><td>385,000</td><td>4,965,000</td></tr><tr><td>أثاث ومعدات مكتبية</td><td>1,380,000</td><td>96,000</td><td>54,000</td><td>1,422,000</td></tr><tr><td>مركبات</td><td>2,050,000</td><td>310,000</td><td>240,000</td><td>2,120,000</td></tr></tbody></table><p>المبالغ بالدرهم الإماراتي. جدول الإهلاك التفصيلي متاح عند الطلب.</p>`, at(-14, 12));
    // released to the external auditor → the released snapshot is frozen with it
    run('INSERT INTO audit_links (id,kind,ref_id,document_id,title,linked_by,linked_at,released_html,released_title) VALUES (?,?,?,?,?,?,?,?,?)', uid('al_'), 'ext', 'ax_demo_1', d2, `سجل الأصول الثابتة ${y - 1} — ملخص معتمد`, 'u_majed', at(-14, 13),
      one('SELECT content_html FROM documents WHERE id=?', d2)?.content_html ?? '', `سجل الأصول الثابتة ${y - 1} — ملخص معتمد`);
    // Issued reports for the two completed engagements (owned by the Chief Audit Executive, shared read-only).
    for (const [engId, issuedAt] of [['ae_demo_hr_recruit', at(-160, 11)], ['ae_demo_ops_cs', at(-80, 11)]]) {
      const e = one('SELECT e.*, d.name_ar dept_ar FROM audit_engagements e JOIN departments d ON d.id=e.department_id WHERE e.id=?', engId);
      const fs = all("SELECT * FROM audit_findings WHERE engagement_id=? AND status<>'draft' ORDER BY ref", engId).map((f) => ({ ...f, action: one('SELECT a.*, u.name_ar owner_name_ar FROM audit_actions a JOIN users u ON u.id=a.owner_id WHERE a.finding_id=?', f.id) }));
      const id = doc(aisha, `تقرير التدقيق الداخلي — ${e.title}`, 'report', reportHtml(e, fs, aisha, issuedAt), issuedAt);
      const readers = new Set(['u_president', ...all("SELECT id FROM users WHERE role='manager' AND user_type='staff' AND active=1 AND department_id=?", e.department_id).map((r) => r.id)]);
      for (const r of readers) D.shareDocument(aisha, { id, user_id: r, permission: 'view' });
      run('UPDATE audit_engagements SET report_doc_id=?, report_issued_by=?, report_issued_at=? WHERE id=?', id, 'u_aisha', issuedAt, engId);
    }
  } catch (e) { console.error('[audit] demo documents:', e.message); }
}
