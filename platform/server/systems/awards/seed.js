// Awards — demo seed (is_demo = 1), dated relative to today and coherent with
// the personas: one programme open for nominations, one under evaluation, one
// announced with winners, plus a draft only the awards admin sees.
import * as K from '../kit.js';

const { one, run, day, at, isEmpty } = K;

const D = (ar, en = '') => ({ ar, en });
const desc = (a, b, c) => [{ level: 1, ...D(a[0], a[1]) }, { level: 3, ...D(b[0], b[1]) }, { level: 5, ...D(c[0], c[1]) }];

function program(p) {
  run(`INSERT INTO awards_programs (id,name_ar,name_en,description_ar,description_en,kind,cycle,eligibility,allow_self,nomination_opens,nomination_closes,evaluation_closes,announce_on,status,announced_at,announced_by,created_by,created_at,is_demo)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, p.id, p.name_ar, p.name_en, p.description_ar, p.description_en, p.kind, p.cycle, p.eligibility, p.allow_self ? 1 : 0,
  p.dates[0], p.dates[1], p.dates[2], p.dates[3], p.status, p.announced_at || null, p.announced_by || null, 'u_hessa', p.created_at);
  p.categories.forEach((c, i) => run('INSERT INTO awards_categories (id,program_id,name_ar,name_en,description_ar,description_en,max_winners,sort) VALUES (?,?,?,?,?,?,?,?)', c.id, p.id, c.ar, c.en, c.dar || '', c.den || '', c.max || 1, i));
  p.criteria.forEach((c, i) => run('INSERT INTO awards_criteria (id,program_id,name_ar,name_en,description_ar,description_en,weight,descriptors,sort) VALUES (?,?,?,?,?,?,?,?,?)', c.id, p.id, c.ar, c.en, c.dar || '', c.den || '', c.w, JSON.stringify(c.d), i));
}

function nomination(n) {
  run(`INSERT INTO awards_nominations (id,program_id,category_id,nominee_id,nominee_department_id,nominator_id,kind,team_name,summary,justifications,evidence,status,consent_at,consent_note,decline_reason,final_score,final_rank,citation_ar,citation_en,decided_at,created_at,is_demo)
    VALUES (?,?,?,?,(SELECT department_id FROM users WHERE id=?),?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, n.id, n.program, n.category, n.nominee, n.nominee, n.nominator, n.kind, n.team_name || null, n.summary,
  JSON.stringify(n.just), JSON.stringify(n.evidence || []), n.status, n.consent_at || null, n.consent_note || null, n.decline_reason || null,
  n.final_score ?? null, n.final_rank ?? null, n.citation_ar || null, n.citation_en || null, n.decided_at || null, n.created_at);
  for (const m of n.team || []) run('INSERT INTO awards_team (nomination_id,user_id,department_id) VALUES (?,?,(SELECT department_id FROM users WHERE id=?))', n.id, m, m);
  for (const [action, when, actor] of n.events || []) run('INSERT INTO awards_events (id,nomination_id,actor_id,action,at) VALUES (?,?,?,?,?)', K.uid('awe_'), n.id, actor ?? null, action, when);
}

function review(nid, member, crit, scores, when, comment = null) {
  const map = Object.fromEntries(crit.map((c, i) => [c.id, scores[i]]));
  const weighted = K.round(crit.reduce((a, c, i) => a + scores[i] * c.w, 0) / crit.reduce((a, c) => a + c.w, 0), 3);
  run('INSERT INTO awards_reviews (id,nomination_id,member_id,scores,weighted,comment,submitted_at,is_demo) VALUES (?,?,?,?,?,?,?,1)', K.uid('awr_'), nid, member, JSON.stringify(map), weighted, comment, when);
  return weighted;
}

export function seed() {
  if (!isEmpty('awards_programs')) return;
  if (!one("SELECT 1 FROM users WHERE id='u_hessa'")) return;

  // ---------------- 1) open for nominations ----------------
  const C1 = [
    { id: 'awk_emp_results', ar: 'الإنجاز والنتائج', en: 'Delivery and results', dar: 'حجم الإنجاز وجودته والتزامه بالمواعيد مقارنة بالمستهدف', den: 'Volume, quality and timeliness of results against targets', w: 35,
      d: desc(['نتائج دون المتوقع وتتأخر غالباً', 'Below expectations, often late'], ['يحقق النتائج المطلوبة في مواعيدها', 'Delivers expected results on time'], ['نتائج استثنائية موثقة تتجاوز المستهدف بأثر واضح', 'Exceptional, documented results beyond target']) },
    { id: 'awk_emp_initiative', ar: 'المبادرة والتطوير', en: 'Initiative and improvement', dar: 'المبادرات التي اقترحها أو قادها لتحسين العمل', den: 'Improvements proposed or led', w: 25,
      d: desc(['يلتزم بالمطلوب دون مبادرات', 'Does what is asked, no initiatives'], ['يقترح تحسينات وينفّذ بعضها', 'Proposes and implements some improvements'], ['يقود مبادرات تطوير مؤثرة يتبناها الفريق', 'Leads impactful improvements adopted by the team']) },
    { id: 'awk_emp_team', ar: 'التعاون وروح الفريق', en: 'Collaboration', dar: 'مشاركة المعرفة ودعم الزملاء', den: 'Sharing knowledge and supporting colleagues', w: 20,
      d: desc(['تعاون محدود مع الزملاء', 'Limited collaboration'], ['متعاون ويشارك المعرفة', 'Collaborative, shares knowledge'], ['مرجع لزملائه ويمكّن الآخرين', 'A go-to colleague who enables others']) },
    { id: 'awk_emp_integrity', ar: 'الالتزام والنزاهة', en: 'Commitment and integrity', dar: 'الالتزام بالأنظمة والقيم المؤسسية', den: 'Adherence to rules and institutional values', w: 20,
      d: desc(['ملاحظات متكررة على الالتزام', 'Repeated compliance remarks'], ['ملتزم بالأنظمة والقيم', 'Follows rules and values'], ['قدوة في الالتزام والنزاهة والشفافية', 'A role model of integrity and transparency']) },
  ];
  program({
    id: 'awp_employee_2026', name_ar: 'جائزة الموظف المتميز', name_en: 'Outstanding Employee Award', kind: 'excellence', cycle: 'الدورة الثانية 2026', eligibility: 'employees', allow_self: true, status: 'nominations',
    description_ar: 'تكرّم الموظفين الذين قدّموا أداءً استثنائياً موثقاً وأسهموا في تحسين الخدمة الحكومية خلال الدورة.',
    description_en: 'Recognises employees whose documented, exceptional performance improved public service this cycle.',
    dates: [day(-10), day(12), day(30), day(38)], created_at: at(-14, 8),
    categories: [
      { id: 'awc_emp_perf', ar: 'التميز في الأداء الوظيفي', en: 'Job performance excellence', dar: 'إنجاز نوعي في مهام الوظيفة الأساسية', den: 'Outstanding delivery in core duties' },
      { id: 'awc_emp_service', ar: 'التميز في خدمة المتعاملين', en: 'Customer service excellence', dar: 'تجربة متعاملين متميزة وأثر ملموس على رضاهم', den: 'Remarkable customer experience and satisfaction impact' },
    ],
    criteria: C1,
  });
  nomination({
    id: 'awn_demo_fatima_service', program: 'awp_employee_2026', category: 'awc_emp_service', nominee: 'u_fatima', nominator: 'u_omar', kind: 'manager', status: 'awaiting_consent', created_at: at(-3, 10),
    summary: 'أسست نموذج الاستقبال الموحد في مركز خدمة المتعاملين وخفّضت متوسط زمن الانتظار بشكل ملموس',
    just: {
      awk_emp_results: 'قادت تشغيل نموذج الاستقبال الموحد خلال ستة أسابيع، وانخفض متوسط زمن الانتظار من 18 دقيقة إلى 7 دقائق وفق تقارير المركز الأسبوعية.',
      awk_emp_initiative: 'اقترحت فرز الطلبات حسب نوع الخدمة عند الاستقبال وصمّمت نموذج الفرز بنفسها، وتبنّته الإدارة كإجراء معتمد.',
      awk_emp_team: 'درّبت ثلاثة زملاء جدد على النموذج وأعدّت دليلاً مختصراً يستخدمه الفريق يومياً.',
      awk_emp_integrity: 'ملتزمة بمواعيد العمل ومعايير السرية في التعامل مع بيانات المتعاملين، ولم تُسجّل عليها أي ملاحظة خلال العام.',
    },
    evidence: [{ title: 'مشروع مركز خدمة العملاء', link: '#/projects/pr_service', note: 'مؤشرات زمن الانتظار الأسبوعية' }, { title: 'رسائل شكر من المتعاملين', note: '12 رسالة خلال الربع الثالث' }],
    events: [['created', at(-3, 10), 'u_omar']],
  });
  nomination({
    id: 'awn_demo_sara_self', program: 'awp_employee_2026', category: 'awc_emp_perf', nominee: 'u_sara', nominator: 'u_sara', kind: 'self', status: 'submitted', created_at: at(-6, 9), consent_at: at(-6, 9),
    summary: 'قادت توثيق متطلبات البوابة الموحدة وأنجزت تصميم واجهة الدخول قبل موعدها',
    just: {
      awk_emp_results: 'أنجزت توثيق متطلبات البوابة الموحدة كاملة وسلّمت تصميم واجهة تسجيل الدخول قبل الموعد المخطط بيومين دون إعادة عمل.',
      awk_emp_initiative: 'بادرت بتحليل نماذج الطلبات الحالية لمشروع أتمتة طلبات الموظفين قبل بدء المشروع رسمياً لتسريع مرحلة التصميم.',
      awk_emp_team: 'نظّمت جلسات أسبوعية قصيرة مع فريق التطوير لمراجعة المتطلبات وشاركت قوالب التوثيق مع الإدارات الأخرى.',
      awk_emp_integrity: 'تلتزم بإجراءات إدارة التغيير وتوثّق كل قرار تصميم مع مبرراته في سجل المشروع.',
    },
    evidence: [{ title: 'مشروع البوابة الموحدة', link: '#/projects/pr_portal' }],
    events: [['created', at(-6, 9), 'u_sara'], ['consented', at(-6, 9), 'u_sara']],
  });
  nomination({
    id: 'awn_demo_ahmed_perf', program: 'awp_employee_2026', category: 'awc_emp_perf', nominee: 'u_ahmed', nominator: 'u_mariam', kind: 'manager', status: 'submitted', created_at: at(-5, 11), consent_at: at(-2, 8), consent_note: 'أشكر إدارتي على الترشيح، والفضل لفريق العمل كاملاً.',
    summary: 'أنجز ربط الهوية الموحدة وقاد ترحيل قاعدة بيانات الموارد إلى السحابة الحكومية',
    just: {
      awk_emp_results: 'أكمل ربط البوابة بالهوية الموحدة وترحيل قاعدة بيانات الموارد، وهما من أعقد مراحل مشروعي البوابة والسحابة.',
      awk_emp_initiative: 'أعدّ خطة رجوع عند الفشل لعملية الترحيل رغم أنها لم تكن ضمن نطاق المشروع الأصلي، ما قلّل مخاطر التوقف.',
      awk_emp_team: 'يدعم زملاءه في الفريق تقنياً ويشارك في مراجعة الحلول قبل اعتمادها.',
      awk_emp_integrity: 'ملتزم بمعايير أمن المعلومات وسياسات الوصول في كل أعمال الترحيل.',
    },
    evidence: [{ title: 'مشروع ترحيل الأنظمة إلى السحابة', link: '#/projects/pr_cloud' }, { title: 'مشروع البوابة الموحدة', link: '#/projects/pr_portal' }],
    events: [['created', at(-5, 11), 'u_mariam'], ['consented', at(-2, 8), 'u_ahmed']],
  });

  // ---------------- 2) under evaluation ----------------
  const C2 = [
    { id: 'awk_inn_origin', ar: 'الأصالة والجِدّة', en: 'Originality', dar: 'مدى جِدّة الفكرة في سياق الجهة', den: 'How new the idea is for the entity', w: 30,
      d: desc(['فكرة منقولة دون تكييف', 'Copied without adaptation'], ['تكييف مبتكر لفكرة قائمة', 'Creative adaptation of an existing idea'], ['فكرة أصيلة غير مسبوقة في الجهة', 'Original, a first for the entity']) },
    { id: 'awk_inn_impact', ar: 'الأثر القابل للقياس', en: 'Measurable impact', dar: 'نتائج موثقة بمؤشرات قبل التطبيق وبعده', den: 'Results documented with before/after indicators', w: 35,
      d: desc(['أثر غير موثق', 'Impact not documented'], ['أثر موثق بمؤشر واحد', 'Documented with one indicator'], ['أثر كبير موثق بمؤشرات قبل وبعد', 'Large impact, before/after indicators']) },
    { id: 'awk_inn_scale', ar: 'قابلية التطبيق والتوسع', en: 'Scalability', dar: 'إمكانية تعميم الفكرة على إدارات أخرى', den: 'Can it be rolled out to other departments', w: 20,
      d: desc(['تجربة محدودة', 'Limited pilot'], ['مطبقة في إدارة واحدة', 'Running in one department'], ['قابلة للتعميم على الجهة بتكلفة منخفضة', 'Entity-wide at low cost']) },
    { id: 'awk_inn_sustain', ar: 'الاستدامة', en: 'Sustainability', dar: 'استمرارية الحل دون الاعتماد على شخص واحد', den: 'Keeps working without depending on one person', w: 15,
      d: desc(['تعتمد على شخص واحد', 'Depends on one person'], ['موثقة ولها مالك', 'Documented with an owner'], ['مؤسسية ومدمجة في الإجراءات', 'Institutionalised in procedures']) },
  ];
  program({
    id: 'awp_innovation_2026', name_ar: 'جائزة الابتكار', name_en: 'Innovation Award', kind: 'innovation', cycle: 'دورة 2026', eligibility: 'all_staff', allow_self: true, status: 'evaluation',
    description_ar: 'تحتفي بالأفكار المطبّقة التي حسّنت الخدمات أو العمليات الداخلية بأثر موثق وقابل للتعميم.',
    description_en: 'Celebrates implemented ideas that improved services or internal operations with documented, scalable impact.',
    dates: [day(-40), day(-5), day(9), day(16)], created_at: at(-45, 8),
    categories: [
      { id: 'awc_inn_services', ar: 'ابتكار في الخدمات', en: 'Service innovation', dar: 'تحسين تجربة المتعاملين وقنوات الخدمة', den: 'Better customer experience and channels' },
      { id: 'awc_inn_ops', ar: 'ابتكار في العمليات الداخلية', en: 'Internal process innovation', dar: 'رفع كفاءة الإجراءات والأنظمة الداخلية', den: 'More efficient internal processes and systems' },
    ],
    criteria: C2,
  });
  const inEval = (id, nominee, nominator, kind, category, summary, just, created, consent, evidence = []) => nomination({
    id, program: 'awp_innovation_2026', category, nominee, nominator, kind, status: 'in_evaluation', created_at: at(created, 10), consent_at: at(consent, 12), summary, just, evidence,
    events: [['created', at(created, 10), nominator], ['consented', at(consent, 12), nominee], ['evaluation', at(-5, 14), 'u_hessa']],
  });
  inEval('awn_demo_hamad_dash', 'u_hamad', 'u_latifa', 'manager', 'awc_inn_ops', 'لوحة مؤشرات الأداء الاستراتيجي الآنية بدلاً من التقارير الربعية اليدوية', {
    awk_inn_origin: 'استبدل إعداد التقارير الربعية اليدوية بلوحة مؤشرات تتحدث آلياً من مصادر البيانات المعتمدة، وهو نهج جديد في الجهة.',
    awk_inn_impact: 'انخفض زمن إعداد تقرير الأداء الربعي من 12 يوم عمل إلى يومين، وارتفعت دقة البيانات بعد إلغاء النسخ اليدوي.',
    awk_inn_scale: 'صُممت اللوحة بقوالب قابلة لإعادة الاستخدام، وبدأت إدارتان بطلب نسخ خاصة بهما.',
    awk_inn_sustain: 'وثّق مصادر البيانات وقواعد الاحتساب وسلّم الملكية التشغيلية لفريق الإدارة.',
  }, -32, -30, [{ title: 'مقارنة زمن إعداد التقرير قبل وبعد', note: 'مرفق في سجل الإدارة' }]);
  inEval('awn_demo_salem_hiring', 'u_salem', 'u_salem', 'self', 'awc_inn_ops', 'أتمتة إجراءات التعيين ورقمنة ملفات الموظفين الجدد', {
    awk_inn_origin: 'حوّل مسار التعيين الورقي إلى نموذج رقمي متصل بقائمة تحقق آلية للمستندات، مع تكييف الفكرة لمتطلبات الجهة.',
    awk_inn_impact: 'تقلّص متوسط مدة استكمال ملف الموظف الجديد من 9 أيام إلى 4 أيام خلال الربعين الأخيرين.',
    awk_inn_scale: 'يمكن تطبيق النموذج على إجراءات النقل والترقيات بتعديلات بسيطة.',
    awk_inn_sustain: 'أُدرج النموذج في دليل إجراءات الموارد البشرية وله مالك محدد.',
  }, -28, -28);
  inEval('awn_demo_noura_match', 'u_noura', 'u_majed', 'manager', 'awc_inn_ops', 'المطابقة الآلية للمصروفات مع أوامر الشراء قبل الصرف', {
    awk_inn_origin: 'طوّرت قواعد مطابقة آلية بين الفواتير وأوامر الشراء وسجلات الاستلام، بدلاً من المطابقة اليدوية بالعيّنات.',
    awk_inn_impact: 'اكتُشفت 14 حالة فروقات قبل الصرف خلال شهرين، وانخفض زمن إقفال الشهر المالي بثلاثة أيام.',
    awk_inn_scale: 'القواعد قابلة للتطبيق على جميع أوامر الشراء في الجهة دون تكلفة إضافية.',
    awk_inn_sustain: 'موثقة ضمن إجراءات الإدارة المالية مع جدول مراجعة ربعي للقواعد.',
  }, -25, -24);
  inEval('awn_demo_reem_portal', 'u_reem', 'u_yousef', 'colleague', 'awc_inn_services', 'بوابة التأهيل الذاتي للموردين مع التحقق الآلي من الوثائق', {
    awk_inn_origin: 'أتاحت للموردين تقديم وثائق التأهيل ذاتياً مع تحقق آلي من صلاحية الرخص، بعد أن كان التأهيل يتم عبر البريد.',
    awk_inn_impact: 'انخفض زمن تأهيل المورد من ثلاثة أسابيع إلى خمسة أيام، وقلّت الاستفسارات الواردة للقسم بنحو النصف.',
    awk_inn_scale: 'يمكن تعميم آلية التحقق الآلي على طلبات الشركاء الآخرين.',
    awk_inn_sustain: 'ترتبط البوابة بسجل الموردين المعتمد ولها إجراء تشغيل موثق.',
  }, -22, -20, [{ title: 'ملخص أثر البوابة على زمن التأهيل' }]);
  inEval('awn_demo_fatima_booking', 'u_fatima', 'u_fatima', 'self', 'awc_inn_services', 'الحجز المسبق لمواعيد مركز خدمة المتعاملين عبر رسالة نصية', {
    awk_inn_origin: 'أضافت خيار الحجز المسبق للمواعيد عبر رسالة نصية تفاعلية دون الحاجة إلى تطبيق إضافي.',
    awk_inn_impact: 'انخفضت ذروة الازدحام في المركز صباحاً بنسبة 30% خلال شهر التجربة.',
    awk_inn_scale: 'قابل للتطبيق في مراكز الخدمة الأخرى بنفس المزوّد الحالي.',
    awk_inn_sustain: 'موثق في إجراءات المركز، لكن التشغيل ما زال يعتمد على متابعة يومية من فريق صغير.',
  }, -18, -18);
  nomination({
    id: 'awn_demo_saeed_declined', program: 'awp_innovation_2026', category: 'awc_inn_ops', nominee: 'u_saeed', nominator: 'u_aisha', kind: 'manager', status: 'declined', created_at: at(-20, 9),
    decline_reason: 'أفضّل ترشيح فريق التدقيق كاملاً في دورة قادمة.',
    summary: 'منهجية التدقيق المبني على المخاطر باستخدام تحليل البيانات',
    just: {
      awk_inn_origin: 'طبّق تحليل البيانات لاختيار عينات التدقيق بناءً على المخاطر بدلاً من العينات العشوائية.',
      awk_inn_impact: 'ارتفعت نسبة الملاحظات الجوهرية المكتشفة في العينات المختارة خلال مهمتين.',
      awk_inn_scale: 'قابلة للتطبيق على مهام التدقيق المالي والتشغيلي.',
      awk_inn_sustain: 'موثقة في دليل منهجية التدقيق الداخلي.',
    },
    events: [['created', at(-20, 9), 'u_aisha'], ['declined', at(-18, 11), 'u_saeed']],
  });
  review('awn_demo_hamad_dash', 'u_president', C2, [4, 5, 4, 4], at(-3, 9), 'أثر واضح وموثق على زمن إعداد التقارير.');
  review('awn_demo_salem_hiring', 'u_latifa', C2, [4, 4, 3, 4], at(-2, 10));
  review('awn_demo_noura_match', 'u_president', C2, [5, 4, 4, 4], at(-3, 11));
  review('awn_demo_noura_match', 'u_latifa', C2, [4, 5, 4, 3], at(-2, 12), 'يُنصح بتوثيق الحالات المكتشفة بالتفصيل.');
  review('awn_demo_fatima_booking', 'u_hessa', C2, [4, 4, 5, 3], at(-1, 9));
  review('awn_demo_fatima_booking', 'u_latifa', C2, [4, 3, 4, 3], at(-1, 11));

  // ---------------- 3) announced ----------------
  const C3 = [
    { id: 'awk_team_goals', ar: 'تحقيق الأهداف', en: 'Goal achievement', w: 35, d: desc(['أهداف جزئية', 'Partial goals'], ['حقق الأهداف المخططة', 'Met planned goals'], ['تجاوز الأهداف بأثر مؤسسي', 'Exceeded goals with institutional impact']) },
    { id: 'awk_team_collab', ar: 'التكامل والتعاون', en: 'Collaboration', w: 25, d: desc(['عمل فردي متوازٍ', 'Parallel individual work'], ['تنسيق جيد بين الأعضاء', 'Good coordination'], ['تكامل مثالي وأدوار واضحة', 'Seamless teamwork, clear roles']) },
    { id: 'awk_team_method', ar: 'الابتكار في أسلوب العمل', en: 'Innovative ways of working', w: 20, d: desc(['أساليب تقليدية', 'Traditional methods'], ['تحسينات على الأسلوب', 'Improved methods'], ['أسلوب عمل جديد يُحتذى', 'A new model others adopt']) },
    { id: 'awk_team_customer', ar: 'الأثر على المتعاملين', en: 'Impact on customers', w: 20, d: desc(['أثر غير ملموس', 'No visible impact'], ['أثر ملموس', 'Visible impact'], ['تحسن كبير في تجربة المتعاملين', 'Major customer experience gains']) },
  ];
  program({
    id: 'awp_team_2026', name_ar: 'جائزة الفريق المتميز', name_en: 'Outstanding Team Award', kind: 'team', cycle: 'الدورة الأولى 2026', eligibility: 'team', allow_self: true, status: 'announced',
    description_ar: 'تكرّم فرق العمل التي حققت نتائج مؤسسية بتكامل وتعاون نموذجي بين أعضائها.',
    description_en: 'Honours teams that delivered institutional results through exemplary collaboration.',
    dates: [day(-130), day(-100), day(-70), day(-60)], created_at: at(-140, 8), announced_at: at(-60, 9), announced_by: 'u_hessa',
    categories: [
      { id: 'awc_team_projects', ar: 'فريق المشاريع', en: 'Project team', dar: 'فرق المشاريع الاستراتيجية والتشغيلية', den: 'Strategic and operational project teams' },
      { id: 'awc_team_support', ar: 'فريق الخدمات المساندة', en: 'Support services team', dar: 'فرق المالية والموارد والخدمات المشتركة', den: 'Finance, resources and shared services teams' },
    ],
    criteria: C3,
  });
  const done = (id, nominee, nominator, category, team, teamName, summary, status, created, consent, extra = {}) => nomination({
    id, program: 'awp_team_2026', category, nominee, nominator, kind: extra.kind || 'manager', status, team, team_name: teamName, created_at: at(created, 10), consent_at: at(consent, 12), summary, decided_at: at(-60, 9),
    just: Object.fromEntries(C3.map((c) => [c.id, extra.just[c.id]])), ...extra,
    events: [['created', at(created, 10), nominator], ['consented', at(consent, 12), nominee], ['evaluation', at(-100, 16), 'u_hessa'], [status, at(-60, 9), 'u_hessa']],
  });
  done('awn_demo_team_portal', 'u_ahmed', 'u_mariam', 'awc_team_projects', ['u_ahmed', 'u_sara'], 'فريق البوابة الموحدة', 'أطلق المرحلة الأولى من البوابة الموحدة وربطها بالهوية الرقمية', 'winner', -120, -118, {
    final_rank: 1, citation_ar: 'تقديراً لإطلاق المرحلة الأولى من البوابة الموحدة وربط الهوية الرقمية بتعاون مثالي بين أعضاء الفريق.', citation_en: 'For launching phase one of the Unified Portal and digital identity integration through exemplary teamwork.',
    just: { awk_team_goals: 'أطلق الفريق المرحلة الأولى من البوابة في موعدها مع ربط الهوية الرقمية لجميع الموظفين.', awk_team_collab: 'توزيع واضح للأدوار بين التحليل والتطوير مع مراجعات يومية قصيرة.', awk_team_method: 'اعتمد الفريق أسلوب الإصدارات الأسبوعية القصيرة لأول مرة في الإدارة.', awk_team_customer: 'أصبح الموظفون ينجزون طلباتهم من نقطة دخول واحدة بدلاً من خمسة أنظمة.' },
  });
  done('awn_demo_team_closing', 'u_noura', 'u_majed', 'awc_team_support', ['u_noura', 'u_reem'], 'فريق إغلاق الحسابات الختامية', 'أغلق الحسابات الختامية قبل الموعد النظامي دون ملاحظات تدقيقية', 'winner', -118, -117, {
    final_rank: 1, citation_ar: 'تقديراً لإغلاق الحسابات الختامية قبل الموعد النظامي بعشرة أيام دون ملاحظات تدقيقية.', citation_en: 'For closing the annual accounts ten days ahead of the statutory deadline with no audit findings.',
    just: { awk_team_goals: 'أُغلقت الحسابات الختامية قبل الموعد النظامي بعشرة أيام.', awk_team_collab: 'تكامل بين المحاسبة والمشتريات في مطابقة الالتزامات المفتوحة.', awk_team_method: 'قائمة تحقق مشتركة للإقفال تُستخدم الآن في الإقفالات الشهرية.', awk_team_customer: 'سُدّدت مستحقات الموردين دون تأخير خلال فترة الإقفال.' },
  });
  done('awn_demo_team_procedures', 'u_fatima', 'u_omar', 'awc_team_projects', ['u_fatima', 'u_omar'], 'فريق تحديث إجراءات التشغيل', 'راجع أدلة إجراءات المخازن والتشغيل وحدّثها', 'not_selected', -115, -113, {
    final_rank: 2,
    just: { awk_team_goals: 'حُدّث دليل إجراءات المخازن وجزء من أدلة التشغيل.', awk_team_collab: 'تعاون جيد بين الإدارة والمنفذين في جلسات المراجعة.', awk_team_method: 'اعتماد نماذج موحدة لكتابة الإجراءات.', awk_team_customer: 'وضوح أكبر في خطوات الخدمة الداخلية.' },
  });
  const s1 = [review('awn_demo_team_portal', 'u_president', C3, [5, 5, 4, 4], at(-80, 9)), review('awn_demo_team_portal', 'u_latifa', C3, [5, 4, 5, 4], at(-79, 9)), review('awn_demo_team_portal', 'u_hessa', C3, [4, 5, 4, 5], at(-78, 9))];
  const s2 = [review('awn_demo_team_closing', 'u_president', C3, [5, 4, 4, 4], at(-80, 10)), review('awn_demo_team_closing', 'u_latifa', C3, [5, 4, 3, 4], at(-79, 10)), review('awn_demo_team_closing', 'u_hessa', C3, [4, 4, 4, 4], at(-78, 10))];
  const s3 = [review('awn_demo_team_procedures', 'u_president', C3, [4, 4, 3, 4], at(-80, 11)), review('awn_demo_team_procedures', 'u_latifa', C3, [4, 3, 4, 3], at(-79, 11))];
  const mean = (xs) => K.round(xs.reduce((a, b) => a + b, 0) / xs.length, 3);
  run('UPDATE awards_nominations SET final_score=? WHERE id=?', mean(s1), 'awn_demo_team_portal');
  run('UPDATE awards_nominations SET final_score=? WHERE id=?', mean(s2), 'awn_demo_team_closing');
  run('UPDATE awards_nominations SET final_score=? WHERE id=?', mean(s3), 'awn_demo_team_procedures');

  // ---------------- 4) draft (visible to the awards admin only) ----------------
  program({
    id: 'awp_leader_2027', name_ar: 'جائزة القائد الملهم', name_en: 'Inspiring Leader Award', kind: 'leadership', cycle: 'دورة 2027', eligibility: 'managers', allow_self: false, status: 'draft',
    description_ar: 'تكرّم القيادات التي ألهمت فرقها وطوّرت قدراتها وحققت نتائج مؤسسية مستدامة.',
    description_en: 'Honours leaders who inspired and developed their teams and delivered sustainable results.',
    dates: [day(20), day(50), day(75), day(90)], created_at: at(-2, 9),
    categories: [{ id: 'awc_leader_main', ar: 'القيادة الملهمة', en: 'Inspiring leadership' }],
    criteria: [
      { id: 'awk_lead_vision', ar: 'الرؤية والتوجيه', en: 'Vision and direction', w: 30, d: desc(['توجيه غير واضح', 'Unclear direction'], ['رؤية واضحة للفريق', 'Clear vision'], ['رؤية ملهمة يتبناها الفريق', 'An inspiring vision the team owns']) },
      { id: 'awk_lead_enable', ar: 'تمكين الفريق وتطويره', en: 'Enabling the team', w: 30, d: desc(['تطوير محدود', 'Little development'], ['خطط تطوير للأعضاء', 'Development plans in place'], ['قادة جدد تخرّجوا من فريقه', 'Grew new leaders']) },
      { id: 'awk_lead_results', ar: 'النتائج المؤسسية', en: 'Institutional results', w: 25, d: desc(['نتائج دون المستهدف', 'Below target'], ['حقق المستهدف', 'Met targets'], ['نتائج استثنائية مستدامة', 'Exceptional, sustained results']) },
      { id: 'awk_lead_role', ar: 'القدوة والنزاهة', en: 'Role model and integrity', w: 15, d: desc(['ملاحظات على السلوك القيادي', 'Leadership conduct remarks'], ['قدوة في الالتزام', 'Role model of commitment'], ['مرجع مؤسسي في النزاهة', 'Institutional reference for integrity']) },
    ],
  });

  // one alert for the pending consent (demo)
  run('INSERT INTO alerts (id,user_id,level,title,body,entity,entity_id,is_demo) VALUES (?,?,?,?,?,?,?,1)', K.uid('al_'), 'u_fatima', 'info', 'رُشّحتِ لـ«جائزة الموظف المتميز»', 'راجع الترشيح وأكّد موافقتك قبل إغلاق باب الترشيح', 'sys:awards', 'awn_demo_fatima_service');
}
