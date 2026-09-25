// Demo seed for Strategic Performance: an active 4-year plan (relative to the
// current year), 4 pillars, 9 objectives across departments, 17 KPIs with 6–8
// closed periods of actuals (some missing, some awaiting validation, one returned
// by SPMO) and 7 initiatives linked to the existing demo projects.
import { one, run, uid, isEmpty } from '../kit.js';
import { lastClosedPeriod, shiftPeriod, parsePeriod, addDays, localToday } from './core.js';

const ts = (dateIso, h = 10, m = 0) => `${dateIso}T${String(h - 4).padStart(2, '0')}:${String(m).padStart(2, '0')}:00.000Z`; // Dubai wall-clock → UTC ISO
const exists = (table, id) => !!one(`SELECT 1 FROM ${table} WHERE id=?`, id);

export function seed() {
  if (!isEmpty('strategy_plans')) return;
  if (!exists('users', 'u_latifa')) return; // demo personas are required
  const today = localToday();
  const Y = Number(today.slice(0, 4));
  const y0 = Y - 1; const y3 = y0 + 3;
  const created = ts(`${y0}-01-12`, 9);
  const plan = 'spl_demo';
  run(`INSERT INTO strategy_plans (id,title_ar,title_en,vision_ar,vision_en,start_year,end_year,status,is_demo,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,'active',1,'u_latifa',?,?)`,
    plan, `الخطة الاستراتيجية ${y0}–${y3}`, `Strategic Plan ${y0}–${y3}`,
    'جهة حكومية رائدة في تقديم خدمات استباقية ذكية ترتقي بجودة حياة المتعاملين وتُمكّن كوادرها الوطنية',
    'A leading government entity delivering proactive, smart services that raise quality of life and empower national talent', y0, y3, created, created);

  const pillars = [
    ['sp_p1', 'P1', 'خدمات حكومية استباقية', 'Proactive government services', 'خدمات تُقدَّم قبل أن يطلبها المتعامل، بتجربة سلسة وقنوات موحّدة', 'Services delivered before they are requested, through seamless unified channels'],
    ['sp_p2', 'P2', 'تميّز مؤسسي وكفاءة تشغيلية', 'Institutional excellence & efficiency', 'حوكمة رشيدة وإنفاق كفء وإدارة محفظة استراتيجية منضبطة', 'Sound governance, efficient spending and a disciplined strategic portfolio'],
    ['sp_p3', 'P3', 'كوادر وطنية ممكّنة', 'Empowered national talent', 'استقطاب الكفاءات الوطنية وتطويرها وبيئة عمل سعيدة ومنتجة', 'Attract and develop national talent in a happy, productive workplace'],
    ['sp_p4', 'P4', 'تحول رقمي آمن', 'Secure digital transformation', 'رقمنة الإجراءات الداخلية وأنظمة موثوقة ومحمية سيبرانياً', 'Digitised internal processes on reliable, cyber-secure systems'],
  ];
  pillars.forEach(([id, code, ar, en, dar, den], i) => run('INSERT INTO strategy_pillars (id,plan_id,code,title_ar,title_en,description_ar,description_en,weight,sort,is_demo,created_at) VALUES (?,?,?,?,?,?,?,1,?,1,?)', id, plan, code, ar, en, dar, den, i + 1, created));

  const objectives = [
    ['so_11', 'sp_p1', 'SO-1.1', 'رفع رضا المتعاملين وجودة تجربتهم', 'Raise customer satisfaction and experience quality', 'dept_ops', 55],
    ['so_12', 'sp_p1', 'SO-1.2', 'التحول إلى خدمات استباقية مؤتمتة دون طلب', 'Shift to automated, request-free proactive services', 'dept_it', 45],
    ['so_21', 'sp_p2', 'SO-2.1', 'رفع كفاءة الإنفاق وترشيد التكاليف التشغيلية', 'Improve spending efficiency and rationalise operating costs', 'dept_fin', 40],
    ['so_22', 'sp_p2', 'SO-2.2', 'تعزيز الحوكمة والامتثال التشريعي', 'Strengthen governance and regulatory compliance', 'dept_legal', 30],
    ['so_23', 'sp_p2', 'SO-2.3', 'التميز في إدارة المحفظة الاستراتيجية وقياس الأداء', 'Excellence in strategic portfolio and performance management', 'dept_spmo', 30],
    ['so_31', 'sp_p3', 'SO-3.1', 'استقطاب الكفاءات الوطنية وتطويرها', 'Attract and develop national talent', 'dept_hr', 55],
    ['so_32', 'sp_p3', 'SO-3.2', 'رفع سعادة الموظفين وإنتاجيتهم', 'Raise employee happiness and productivity', 'dept_hr', 45],
    ['so_41', 'sp_p4', 'SO-4.1', 'رقمنة الإجراءات الداخلية بالكامل', 'Fully digitise internal procedures', 'dept_it', 55],
    ['so_42', 'sp_p4', 'SO-4.2', 'تعزيز الأمن السيبراني وموثوقية الأنظمة', 'Strengthen cyber security and system reliability', 'dept_it', 45],
  ];
  objectives.forEach(([id, p, code, ar, en, dept, w], i) => run('INSERT INTO strategy_objectives (id,pillar_id,code,title_ar,title_en,owner_dept_id,weight,sort,is_demo,created_at) VALUES (?,?,?,?,?,?,?,?,1,?)', id, p, code, ar, en, dept, w, i + 1, created));

  // [id, objective, code, name_ar, name_en, unit_ar, unit_en, direction, measure, frequency, baseline, targets[y0..y3], owner dept, owner user,
  //  decimals, max, definition, formula, source_ar, source_en, weight, values (oldest → newest closed periods; null = not reported), latest status]
  const K = [
    ['sk_111', 'so_11', 'KPI-1.1.1', 'مؤشر رضا المتعاملين', 'Customer satisfaction index', '%', '%', 'higher', 'level', 'quarterly', 81.5, [84, 87, 89, 91], 'dept_ops', 'u_fatima', 1, 100,
      'متوسط رضا المتعاملين عن الخدمات المقدّمة عبر جميع القنوات وفق منهجية قياس السعادة الحكومية.', 'مجموع درجات الرضا ÷ عدد الاستبيانات المكتملة × 100', 'استبيانات قياس رضا المتعاملين', 'Customer satisfaction surveys', 2,
      [82.4, 83.9, 85.1, 86.0, 86.8, 87.9], 'validated'],
    ['sk_112', 'so_11', 'KPI-1.1.2', 'متوسط زمن إنجاز المعاملة', 'Average transaction turnaround time', 'يوم عمل', 'working days', 'lower', 'level', 'monthly', 5.2, [4.5, 3.5, 3.0, 2.5], 'dept_ops', 'u_omar', 1, 60,
      'متوسط عدد أيام العمل من استلام الطلب المكتمل حتى إنجاز المعاملة.', 'مجموع أيام الإنجاز ÷ عدد المعاملات المنجزة', 'نظام إدارة المعاملات', 'Case management system', 1,
      [4.2, 4.0, 3.9, 4.4, 3.8, 3.7, 3.9, 4.1], 'returned'],
    ['sk_121', 'so_12', 'KPI-1.2.1', 'نسبة الخدمات الاستباقية المفعّلة', 'Share of proactive services enabled', '%', '%', 'higher', 'level', 'quarterly', 8, [20, 35, 50, 65], 'dept_it', 'u_sara', 0, 100,
      'نسبة الخدمات التي تُقدَّم تلقائياً للمتعامل بناءً على بياناته دون تقديم طلب.', 'عدد الخدمات الاستباقية ÷ إجمالي الخدمات المؤهلة × 100', 'كتالوج الخدمات الرقمية', 'Digital service catalogue', 1,
      [11, 14, 18, 21, 24, 27], 'submitted'],
    ['sk_122', 'so_12', 'KPI-1.2.2', 'نسبة المعاملات المنجزة رقمياً بالكامل', 'End-to-end digital transactions', '%', '%', 'higher', 'level', 'monthly', 58, [68, 76, 84, 90], 'dept_it', 'u_ahmed', 1, 100,
      'نسبة المعاملات التي أُنجزت دون أي تدخل ورقي أو حضوري.', 'المعاملات الرقمية بالكامل ÷ إجمالي المعاملات × 100', 'البوابة الموحدة وسجلات التكامل', 'Unified portal & integration logs', 1,
      [70.5, 71.2, 72.8, 73.1, 74.6, 75.3, 75.9, null], 'validated'],
    ['sk_211', 'so_21', 'KPI-2.1.1', 'نسبة تنفيذ الميزانية التشغيلية', 'Operating budget execution', '%', '%', 'higher', 'level', 'quarterly', 88, [92, 95, 96, 97], 'dept_fin', 'u_noura', 1, 120,
      'نسبة المنصرف الفعلي من الميزانية التشغيلية المخططة حتى نهاية الفترة.', 'المنصرف الفعلي حتى تاريخه ÷ المخطط حتى تاريخه × 100', 'النظام المالي — تقارير الموازنة', 'Financial system — budget reports', 1,
      [90.2, 91.5, 93.0, 94.1, 92.6, 94.8], 'validated'],
    ['sk_212', 'so_21', 'KPI-2.1.2', 'نسبة الوفر في التكاليف التشغيلية', 'Operating cost savings', '%', '%', 'higher', 'level', 'quarterly', 1.5, [3, 5, 6, 7], 'dept_fin', 'u_majed', 1, 100,
      'نسبة الوفر المحقق في التكاليف التشغيلية مقارنة بسنة الأساس مع ثبات مستوى الخدمة.', '(تكلفة الأساس − التكلفة الفعلية) ÷ تكلفة الأساس × 100', 'تقارير الإدارة المالية', 'Finance reports', 1,
      [1.2, 2.1, 2.8, 3.4, 2.9, 3.6], 'validated'],
    ['sk_213', 'so_21', 'KPI-2.1.3', 'متوسط مدة دورة الشراء', 'Average procurement cycle time', 'يوم', 'days', 'lower', 'level', 'monthly', 46, [38, 30, 26, 22], 'dept_proc', 'u_reem', 0, 365,
      'متوسط عدد الأيام من اعتماد طلب الشراء حتى إصدار أمر الشراء.', 'مجموع أيام الدورة ÷ عدد أوامر الشراء الصادرة', 'نظام المشتريات', 'Procurement system', 1,
      [34, 33, 31, 35, 30, 29, 30, 31], 'submitted'],
    ['sk_221', 'so_22', 'KPI-2.2.1', 'نسبة الامتثال للمتطلبات التشريعية والتنظيمية', 'Regulatory compliance rate', '%', '%', 'higher', 'level', 'quarterly', 88, [92, 95, 97, 98], 'dept_legal', 'u_yousef', 1, 100,
      'نسبة المتطلبات التشريعية والتنظيمية المطبقة بالكامل من إجمالي المتطلبات السارية.', 'المتطلبات المطبقة ÷ المتطلبات السارية × 100', 'سجل الامتثال المؤسسي', 'Compliance register', 2,
      [89.5, 90.8, 92.4, 93.1, 94.0, null], 'validated'],
    ['sk_222', 'so_22', 'KPI-2.2.2', 'متوسط زمن إنجاز الاستشارات القانونية', 'Legal advice turnaround time', 'يوم عمل', 'working days', 'lower', 'level', 'monthly', 9, [7, 5, 4, 4], 'dept_legal', 'u_yousef', 1, 90,
      'متوسط أيام العمل لإصدار الرأي القانوني من تاريخ استلام الطلب المكتمل.', 'مجموع أيام الإنجاز ÷ عدد الاستشارات', 'سجل الاستشارات القانونية', 'Legal advice log', 1,
      [6.2, 5.9, 6.4, 6.8, 7.1, 6.6, 6.9, 6.5], 'validated'],
    ['sk_231', 'so_23', 'KPI-2.3.1', 'نسبة المبادرات الاستراتيجية المنجزة وفق الخطة الزمنية', 'Strategic initiatives on schedule', '%', '%', 'higher', 'level', 'quarterly', 62, [70, 78, 84, 90], 'dept_spmo', 'u_hamad', 0, 100,
      'نسبة المبادرات التي أنجزت مراحلها المستحقة في مواعيدها.', 'المبادرات الملتزمة بالجدول ÷ المبادرات النشطة × 100', 'نظام الأداء الاستراتيجي', 'Strategic performance system', 1,
      [64, 66, 69, 71, 72, 74], 'submitted'],
    ['sk_232', 'so_23', 'KPI-2.3.2', 'نسبة المؤشرات المرصودة في موعدها', 'KPIs reported on time', '%', '%', 'higher', 'level', 'monthly', 70, [85, 92, 95, 97], 'dept_spmo', 'u_hamad', 0, 100,
      'نسبة قيم المؤشرات التي رصدها ملّاكها خلال 15 يوماً من نهاية الفترة.', 'القيم المرصودة في موعدها ÷ القيم المستحقة × 100', 'نظام الأداء الاستراتيجي', 'Strategic performance system', 1,
      [84, 86, 88, 83, 90, 91, 93, 89], 'validated'],
    ['sk_311', 'so_31', 'KPI-3.1.1', 'نسبة التوطين في الوظائف القيادية والتخصصية', 'Emiratisation in leadership & specialist roles', '%', '%', 'higher', 'level', 'quarterly', 61, [66, 70, 74, 78], 'dept_hr', 'u_hessa', 1, 100,
      'نسبة المواطنين في الوظائف القيادية والتخصصية من إجمالي شاغلي هذه الوظائف.', 'المواطنون في الوظائف المستهدفة ÷ إجمالي شاغليها × 100', 'نظام الموارد البشرية', 'HR system', 1,
      [62.5, 63.8, 65.2, 66.9, 67.4, 68.1], 'validated'],
    ['sk_312', 'so_31', 'KPI-3.1.2', 'متوسط ساعات التدريب التخصصي لكل موظف', 'Specialised training hours per employee', 'ساعة', 'hours', 'higher', 'cumulative', 'quarterly', 28, [32, 40, 44, 48], 'dept_hr', 'u_salem', 1, 200,
      'متوسط ساعات التدريب التخصصي المعتمد لكل موظف منذ بداية السنة (يُرصد ما تحقق في كل ربع ويُجمع تراكمياً).', 'إجمالي ساعات التدريب المعتمدة ÷ عدد الموظفين', 'منصة التعلم المؤسسي', 'Corporate learning platform', 1,
      [7, 8.5, 9, 8, 8.5, 10], 'validated'],
    ['sk_321', 'so_32', 'KPI-3.2.1', 'مؤشر سعادة الموظفين', 'Employee happiness index', '%', '%', 'higher', 'level', 'quarterly', 76, [80, 83, 85, 87], 'dept_hr', 'u_salem', 1, 100,
      'نتيجة استبيان النبض الربعي لسعادة الموظفين وفق منهجية قياس السعادة المؤسسية.', 'متوسط درجات الاستبيان × 100 ÷ الدرجة القصوى', 'استبيان النبض الربعي', 'Quarterly pulse survey', 1,
      [77.2, null, 79.5, 80.1, 81.6, 82.4], 'validated'],
    ['sk_411', 'so_41', 'KPI-4.1.1', 'نسبة الإجراءات الداخلية المؤتمتة', 'Automated internal procedures', '%', '%', 'higher', 'level', 'quarterly', 35, [50, 65, 80, 90], 'dept_it', 'u_mariam', 0, 100,
      'نسبة الإجراءات الداخلية المعتمدة التي تُنفَّذ إلكترونياً بالكامل.', 'الإجراءات المؤتمتة ÷ إجمالي الإجراءات المعتمدة × 100', 'دليل الإجراءات وسجل الأتمتة', 'Procedures manual & automation log', 1,
      [38, 42, 47, 51, 55, 58], 'validated'],
    ['sk_421', 'so_42', 'KPI-4.2.1', 'نسبة جاهزية الأنظمة الحرجة (التوافرية)', 'Critical systems availability', '%', '%', 'higher', 'level', 'monthly', 99.1, [99.5, 99.5, 99.7, 99.9], 'dept_it', 'u_ahmed', 2, 100,
      'نسبة الوقت الذي كانت فيه الأنظمة الحرجة متاحة للمستخدمين خلال الفترة.', 'وقت التشغيل الفعلي ÷ وقت التشغيل المخطط × 100', 'منصة مراقبة الأنظمة', 'Systems monitoring platform', 1,
      [99.82, 99.91, 99.64, 99.12, 99.87, 99.93, 99.71, 99.88], 'submitted'],
    ['sk_422', 'so_42', 'KPI-4.2.2', 'نسبة معالجة الثغرات الحرجة خلال 72 ساعة', 'Critical vulnerabilities fixed within 72h', '%', '%', 'higher', 'level', 'quarterly', 70, [90, 95, 97, 98], 'dept_it', 'u_mariam', 0, 100,
      'نسبة الثغرات الأمنية الحرجة التي عولجت خلال 72 ساعة من اكتشافها.', 'الثغرات المعالجة خلال 72 ساعة ÷ إجمالي الثغرات الحرجة × 100', 'مركز العمليات الأمنية', 'Security operations centre', 1,
      [78, 83, 86, 88, 90, 92], 'validated'],
  ];
  const yesterday = addDays(today, -1);
  let sort = 0;
  for (const [id, obj, code, ar, en, uar, uen, dir, measure, freq, baseline, targets, dept, owner, decimals, max, def, formula, sar, sen, weight, values, latest] of K) {
    run(`INSERT INTO strategy_kpis (id,objective_id,code,name_ar,name_en,definition_ar,formula_ar,unit_ar,unit_en,direction,measure,frequency,baseline,baseline_year,decimals,min_value,max_value,owner_dept_id,owner_user_id,data_source_ar,data_source_en,weight,active,sort,is_demo,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,0,?,?,?,?,?,?,1,?,1,?,?)`, id, obj, code, ar, en, def, formula, uar, uen, dir, measure, freq, baseline, y0 - 1, decimals, max, dept, owner, sar, sen, weight, ++sort, created, created);
    targets.forEach((t, i) => run('INSERT INTO strategy_targets (kpi_id,year,target) VALUES (?,?,?)', id, y0 + i, t));
    const last = lastClosedPeriod(freq, today);
    const n = values.length;
    values.forEach((v, i) => {
      if (v == null) return;
      const key = shiftPeriod(freq, last, i - (n - 1));
      const p = parsePeriod(freq, key);
      if (p.year < y0) return;
      const isLatest = i === n - 1;
      // submitted within the reporting window (a couple of late ones for realism)
      const offset = (code.charCodeAt(code.length - 1) + i) % 7 === 0 ? 19 : 4 + ((i * 3 + sort) % 9);
      let subDay = addDays(p.end, offset);
      if (subDay > yesterday) subDay = yesterday;
      if (subDay <= p.end) return; // period just closed: not reported yet
      const status = isLatest ? latest : 'validated';
      const reviewer = owner === 'u_hamad' ? 'u_latifa' : (sort % 2 ? 'u_hamad' : 'u_latifa');
      let revDay = addDays(subDay, 2); if (revDay > today) revDay = today;
      const aid = uid('sa_');
      const note = isLatest && status === 'returned' ? 'تشمل القيمة المعاملات المعلّقة لدى جهات خارجية.' : '';
      const comment = status === 'returned' ? 'القيمة لا تطابق تقرير نظام إدارة المعاملات (4.3 يوم)؛ يرجى استبعاد المعاملات المعلّقة لدى جهات خارجية وإعادة الرصد.' : null;
      run(`INSERT INTO strategy_actuals (id,kpi_id,period,value,note,status,submitted_by,submitted_at,first_submitted_at,reviewed_by,reviewed_at,review_comment,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,1)`,
        aid, id, p.key, v, note, status, owner, ts(subDay, 10, 15), ts(subDay, 10, 15), status === 'submitted' ? null : reviewer, status === 'submitted' ? null : ts(revDay, 12, 30), comment);
      run('INSERT INTO strategy_actual_log (id,actual_id,action,user_id,value,comment,at) VALUES (?,?,?,?,?,?,?)', uid('sal_'), aid, 'submitted', owner, v, note || null, ts(subDay, 10, 15));
      if (status !== 'submitted') run('INSERT INTO strategy_actual_log (id,actual_id,action,user_id,value,comment,at) VALUES (?,?,?,?,?,?,?)', uid('sal_'), aid, status, reviewer, v, comment, ts(revDay, 12, 30));
    });
  }

  const d = (n) => addDays(today, n);
  const initiatives = [
    ['si_01', 'so_12', 'INI-01', 'إطلاق البوابة الموحدة للخدمات', 'Launch the unified services portal', 'بوابة واحدة لجميع خدمات الموظفين والمتعاملين مع هوية رقمية موحّدة.', 'dept_it', 'u_mariam', 'pr_portal', 'in_progress', null, d(-60), d(30),
      [['تحليل المتطلبات ورحلات المتعاملين', -45, true], ['تصميم تجربة المستخدم', -20, true], ['الربط مع الهوية الرقمية الموحدة', 3, false], ['الإطلاق التجريبي', 28, false]]],
    ['si_02', 'so_42', 'INI-02', 'ترحيل الأنظمة التشغيلية إلى السحابة الحكومية', 'Migrate operational systems to the government cloud', 'نقل الأنظمة التشغيلية إلى السحابة الحكومية مع خطة استمرارية وأمن معتمدة.', 'dept_it', 'u_ahmed', 'pr_cloud', 'at_risk', null, d(-90), d(-10),
      [['تقييم جاهزية الأنظمة', -70, true], ['نقل قاعدة بيانات الموارد', -12, false], ['خطة الرجوع عند الفشل', -1, false]]],
    ['si_03', 'so_41', 'INI-03', 'أتمتة دورة طلبات الموظفين', 'Automate employee request workflows', 'أتمتة الطلبات الإدارية من التقديم حتى الاعتماد دون ورق.', 'dept_it', 'u_sara', 'pr_automation', 'in_progress', null, d(-10), d(60),
      [['حصر النماذج الحالية', 5, false], ['تصميم مسارات الاعتماد', 25, false], ['التشغيل التجريبي', 55, false]]],
    ['si_04', 'so_11', 'INI-04', 'تحديث أدلة إجراءات التشغيل وتبسيطها', 'Update and simplify operating procedures', 'مراجعة أدلة الإجراءات وحذف الخطوات غير الضرورية لتقليص زمن إنجاز المعاملة.', 'dept_ops', 'u_omar', 'pr_procedures', 'at_risk', null, d(-80), d(-5),
      [['مراجعة دليل إجراءات المخازن', -8, true], ['اعتماد الإجراءات المحدثة', -3, false]]],
    ['si_05', 'so_11', 'INI-05', 'تأسيس مركز موحد لخدمة المتعاملين', 'Establish a unified customer service centre', 'مركز واحد متعدد القنوات لخدمة المتعاملين بمستويات خدمة معلنة.', 'dept_ops', 'u_fatima', 'pr_service', 'in_progress', null, d(-20), d(45),
      [['اختيار نظام إدارة التذاكر', 3, false], ['تدريب فريق المركز', 30, false], ['الافتتاح', 44, false]]],
    ['si_06', 'so_31', 'INI-06', 'برنامج القيادات الوطنية الواعدة', 'Emerging national leaders programme', 'برنامج تطوير لمدة عام لإعداد صف ثانٍ من القيادات الوطنية.', 'dept_hr', 'u_hessa', null, 'in_progress', 45, d(-120), d(240),
      [['اختيار المشاركين', -100, true], ['الوحدة الأولى: القيادة الاستراتيجية', -40, true], ['مشاريع التطبيق العملي', 60, false], ['التقييم والتخرج', 230, false]]],
    ['si_07', 'so_21', 'INI-07', 'منصة المشتريات الذكية المدعومة بالذكاء الاصطناعي', 'AI-assisted smart procurement platform', 'تحليل العروض ومقارنة الأسعار آلياً لتقليص دورة الشراء وتحقيق الوفر.', 'dept_proc', 'u_reem', null, 'planned', null, d(20), d(200),
      [['اعتماد كراسة المتطلبات', 20, false], ['التعاقد والتنفيذ', 120, false]]],
    ['si_08', 'so_22', 'INI-08', 'إطار إدارة المخاطر والامتثال المؤسسي', 'Enterprise risk & compliance framework', 'سجل موحد للمتطلبات التشريعية ومصفوفة مخاطر معتمدة من الإدارة العليا.', 'dept_legal', 'u_yousef', null, 'completed', 100, d(-200), d(-30),
      [['حصر المتطلبات التشريعية', -170, true], ['اعتماد مصفوفة المخاطر', -35, true]]],
  ];
  for (const [id, obj, code, ar, en, desc, dept, owner, project, status, progress, sd, ed, ms] of initiatives) {
    const proj = project && one('SELECT 1 FROM projects WHERE id=?', project) ? project : null;
    run(`INSERT INTO strategy_initiatives (id,objective_id,code,title_ar,title_en,description_ar,owner_dept_id,owner_user_id,project_id,status,progress,start_date,end_date,is_demo,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)`,
      id, obj, code, ar, en, desc, dept, owner, proj, status, progress, sd, ed, created, created);
    ms.forEach(([t, due, done], i) => run('INSERT INTO strategy_milestones (id,initiative_id,title_ar,due_date,done_at,done_by,sort,is_demo) VALUES (?,?,?,?,?,?,?,1)', uid('sm_'), id, t, d(due), done ? ts(d(due - 1), 13) : null, done ? owner : null, i + 1));
  }
}
