// Demo seed for AI Procurement (is_demo = 1), idempotent and dated relative to
// today. Coherent with the personas, departments and the providers seed:
//  • budget lines per department (Finance maintains them here; FS stays in Vault);
//  • 8 purchase requests across every stage of the chain;
//  • RFQ-2026-0022 OPEN (Horizon & Oasis invited, closes in 3 days, Horizon's bid sealed);
//  • RFQ-2026-0021 closed → opened with two keys → scored → analysed → recommended →
//    committee → legal → awarded (PO + contract) and evaluated by the contract owner.
import { run, one, uid, isEmpty, day, at, json, round } from '../kit.js';
import { DEFAULT_CRITERIA, DEFAULT_TECH_WEIGHT, DEFAULT_MIN_TECH } from './schema.js';
import { templateSpec, localAnalysisText } from './ai.js';
import { createDocument } from '../../services/documents.js';
import { quarterOf } from '../providers/service.js';

const YEAR = new Date().getUTCFullYear();

export function seed() {
  if (!isEmpty('procurement_requests')) return;
  if (!one("SELECT 1 FROM users WHERE id='u_reem'") || !one("SELECT 1 FROM providers_companies WHERE id='pv_oasis'")) return;

  // ---------------- budget lines ----------------
  const line = (id, dept, code, ar, en, allocated, committed, spent, updDays) => run(
    'INSERT INTO procurement_budget_lines (id,department_id,code,name_ar,name_en,fiscal_year,allocated,committed,spent,updated_by,updated_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    id, dept, code, ar, en, YEAR, allocated, committed, spent, 'u_noura', at(-updDays, 7));
  line('bl_it_hw', 'dept_it', `IT-${YEAR}-301`, 'الأجهزة والبنية التقنية', 'Hardware & infrastructure', 1200000, 435000, 420000, 6);
  line('bl_it_sw', 'dept_it', `IT-${YEAR}-305`, 'التراخيص والبرمجيات والخدمات التقنية', 'Licences, software & IT services', 450000, 261900, 96500, 4);
  line('bl_ops_ctr', 'dept_ops', `OPS-${YEAR}-210`, 'تجهيزات مراكز خدمة المتعاملين', 'Customer service centre fit-out', 600000, 271820, 142300, 25);
  line('bl_ops_sup', 'dept_ops', `OPS-${YEAR}-215`, 'المستلزمات التشغيلية', 'Operational supplies', 150000, 22500, 61200, 12);
  line('bl_hr_trn', 'dept_hr', `HR-${YEAR}-120`, 'التدريب والتطوير', 'Training & development', 380000, 95000, 164000, 9);
  line('bl_fin_prof', 'dept_fin', `FIN-${YEAR}-050`, 'الخدمات المهنية والتدقيق', 'Professional & audit services', 200000, 60000, 45000, 30);
  line('bl_spmo_std', 'dept_spmo', `SPMO-${YEAR}-080`, 'الدراسات والاستشارات', 'Studies & consulting', 300000, 120000, 88000, 15);
  line('bl_legal', 'dept_legal', `LEG-${YEAR}-040`, 'الاستشارات القانونية', 'Legal counsel', 150000, 35000, 42000, 40);
  line('bl_ia_tools', 'dept_ia', `IA-${YEAR}-030`, 'أدوات وبرمجيات التدقيق', 'Audit tools & software', 90000, 18000, 31000, 22);
  line('bl_exec', 'dept_exec', `EXE-${YEAR}-010`, 'مصروفات مكتب الرئيس', 'President Office expenses', 250000, 40000, 97000, 18);

  // ---------------- purchase requests ----------------
  const ev = (req, rfq, action, by, days, h = 9, note = null) => run('INSERT INTO procurement_events (id,request_id,rfq_id,action,by_id,note,at) VALUES (?,?,?,?,?,?,?)', uid('pev_'), req, rfq, action, by, note, at(-days, h));
  const pr = (o) => {
    run(`INSERT INTO procurement_requests (id,number,requester_id,department_id,title,category,justification,needed_by,budget_line_id,est_total,status,method,manager_id,mgr_by,mgr_at,fin_by,fin_at,proc_by,proc_at,reserved,return_note,reject_note,rfq_id,po_number,provider_id,po_amount,contract_id,created_at,submitted_at,updated_at,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    o.id, o.number, o.requester, o.dept, o.title, o.category, o.justification, o.needed_by, o.line, round(o.items.reduce((a, i) => a + i[1] * i[3], 0), 2), o.status, o.method || null,
    o.manager || null, o.mgr?.[0] || null, o.mgr ? at(-o.mgr[1], 10) : null, o.fin?.[0] || null, o.fin ? at(-o.fin[1], 11) : null, o.proc?.[0] || null, o.proc ? at(-o.proc[1], 9) : null,
    o.reserved || 0, o.return_note || null, o.reject_note || null, o.rfq || null, o.po || null, o.provider || null, o.po_amount || null, o.contract || null,
    at(-o.created, 8), o.submitted == null ? null : at(-o.submitted, 8, 30), at(-(o.updated ?? 0), 12));
    const ids = o.items.map((it, i) => { const iid = o.itemIds?.[i] || uid('pit_'); run('INSERT INTO procurement_items (id,request_id,line_no,description,qty,unit,est_unit_price) VALUES (?,?,?,?,?,?,?)', iid, o.id, i + 1, it[0], it[1], it[2], it[3]); return iid; });
    ev(o.id, null, 'created', o.requester, o.created, 8);
    if (o.submitted != null) ev(o.id, null, 'submitted', o.requester, o.submitted, 8);
    if (o.mgr) ev(o.id, null, 'mgr_approved', o.mgr[0], o.mgr[1], 10);
    if (o.fin) ev(o.id, null, 'fin_approved', o.fin[0], o.fin[1], 11);
    return ids;
  };

  // 1) IT laptops — sourcing through the OPEN RFQ (Horizon & Oasis invited, closes in 3 days)
  const pr1Items = pr({
    id: 'prq_demo_laptops', number: `PR-${YEAR}-0139`, requester: 'u_ahmed', dept: 'dept_it', category: 'supplies', line: 'bl_it_hw',
    title: 'أجهزة حاسب محمولة ومحطات إرساء لفريق التحول الرقمي',
    justification: 'انتهاء العمر الافتراضي لأجهزة الفريق (أكثر من خمس سنوات) وتكرار الأعطال التي أثّرت على تنفيذ مشروعي البوابة الموحدة وترحيل الأنظمة إلى السحابة، مع الحاجة لأجهزة تدعم أدوات التطوير والتشفير المعتمدة.',
    needed_by: day(40), status: 'sourcing', method: 'rfq', manager: 'u_mariam', mgr: ['u_mariam', 12], fin: ['u_majed', 10], proc: ['u_reem', 9], reserved: 125000, rfq: 'rfq_demo_open',
    created: 14, submitted: 13, updated: 1,
    items: [['حاسب محمول للأعمال: معالج من الفئة العليا، ذاكرة 32 جيجابايت، تخزين 1 تيرابايت SSD، شاشة 14 بوصة', 20, 'جهاز', 5600], ['محطة إرساء USB-C متوافقة مع شاشتين خارجيتين', 20, 'قطعة', 650]],
  });
  // 2) Operations customer service centre — awarded via RFQ-0021 (PO + contract + evaluation)
  const pr2Items = pr({
    id: 'prq_demo_service_ctr', number: `PR-${YEAR}-0134`, requester: 'u_fatima', dept: 'dept_ops', category: 'supplies', line: 'bl_ops_ctr',
    title: 'تجهيز مركز خدمة المتعاملين الموحد',
    justification: 'ضمن مشروع «مركز خدمة العملاء» المعتمد لتوحيد قنوات خدمة المتعاملين؛ يلزم تجهيز صالة الانتظار ومنصات الخدمة ونظام إدارة الطابور لتقليل زمن الانتظار إلى أقل من عشر دقائق.',
    needed_by: day(20), status: 'ordered', method: 'rfq', manager: 'u_omar', mgr: ['u_omar', 56], fin: ['u_majed', 54], proc: ['u_reem', 52], reserved: 175820, rfq: 'rfq_demo_awarded',
    po: `PO-${YEAR}-0418`, provider: 'pv_oasis', po_amount: 175820, contract: 'ct_demo_service_ctr', created: 58, submitted: 57, updated: 25,
    items: [['مقاعد انتظار ثلاثية للمتعاملين بإطار معدني وتنجيد قابل للتنظيف', 24, 'طقم', 1450], ['شاشة عرض 55 بوصة لنظام الطابور مع حامل جداري', 6, 'جهاز', 4200], ['نظام إدارة الطابور: جهاز إصدار تذاكر لمسي وبرمجيات وتركيب', 2, 'نظام', 38000], ['منصة خدمة متعاملين بتصميم مريح ووحدة أدراج', 10, 'منصة', 5000]],
  });
  // 3) IT design licences — direct purchase (below 50,000 AED) from Horizon
  pr({
    id: 'prq_demo_licences', number: `PR-${YEAR}-0136`, requester: 'u_sara', dept: 'dept_it', category: 'it', line: 'bl_it_sw',
    title: 'تجديد تراخيص برنامج التصميم الجرافيكي لفريق تجربة المستخدم',
    justification: 'انتهاء التراخيص الحالية نهاية الشهر؛ البرنامج مستخدم في تصميم واجهات البوابة الموحدة وخدمات المتعاملين الرقمية.',
    needed_by: day(-10), status: 'ordered', method: 'direct', manager: 'u_mariam', mgr: ['u_mariam', 46], fin: ['u_majed', 44], proc: ['u_reem', 40], reserved: 17900,
    po: `PO-${YEAR}-0416`, provider: 'pv_horizon', po_amount: 17900, contract: 'ct_demo_licences', created: 48, submitted: 47, updated: 40,
    items: [['ترخيص سنوي لبرنامج تصميم واجهات احترافي (مستخدم واحد)', 10, 'ترخيص', 1850]],
  });
  ev('prq_demo_licences', null, 'direct_po', 'u_reem', 40, 13, `PO-${YEAR}-0416 — عرض السعر HZ-Q-2291`);
  // 4) Operations workshop supplies — awaiting the line manager (Omar)
  pr({
    id: 'prq_demo_workshop', number: `PR-${YEAR}-0141`, requester: 'u_fatima', dept: 'dept_ops', category: 'supplies', line: 'bl_ops_sup',
    title: 'مستلزمات ورشة تحديث إجراءات التشغيل',
    justification: 'ورشة عمل لمدة ثلاثة أيام لاعتماد أدلة الإجراءات المحدّثة بمشاركة 40 موظفاً من الأقسام التشغيلية.',
    needed_by: day(9), status: 'pending_manager', manager: 'u_omar', created: 2, submitted: 1, updated: 1,
    items: [['طباعة وتجليد دليل الإجراءات المحدّث', 120, 'نسخة', 45], ['لوحة عرض ورقية مع حامل', 6, 'قطعة', 180], ['طقم قرطاسية للورشة', 1, 'طقم', 1200]],
  });
  // 5) HR leadership programme — awaiting Finance (budget check)
  pr({
    id: 'prq_demo_training', number: `PR-${YEAR}-0140`, requester: 'u_salem', dept: 'dept_hr', category: 'consulting', line: 'bl_hr_trn',
    title: 'برنامج تدريبي في القيادة الحكومية للمشرفين',
    justification: 'تنفيذ خطة التطوير القيادي المعتمدة لعام ' + YEAR + ' لعدد 25 مشرفاً، وربط مخرجات البرنامج بأهداف الأداء الفردية.',
    needed_by: day(45), status: 'pending_finance', manager: 'u_hessa', mgr: ['u_hessa', 2], created: 5, submitted: 4, updated: 2,
    items: [['تصميم وتنفيذ برنامج قيادي (6 أيام تدريبية) مع أدوات تقييم قبلي وبعدي', 1, 'برنامج', 64000]],
  });
  // 6) IT network security monitoring — with Procurement (≥ 50,000 → RFQ)
  pr({
    id: 'prq_demo_soc', number: `PR-${YEAR}-0138`, requester: 'u_ahmed', dept: 'dept_it', category: 'it', line: 'bl_it_sw',
    title: 'خدمة مراقبة أمن الشبكات على مدار الساعة لمدة 12 شهراً',
    justification: 'متطلب إلزامي ضمن معايير الأمن السيبراني الوطنية بعد ترحيل الأنظمة إلى السحابة الحكومية، ولا يتوفر فريق داخلي للمراقبة خارج أوقات الدوام.',
    needed_by: day(30), status: 'pending_procurement', manager: 'u_mariam', mgr: ['u_mariam', 6], fin: ['u_majed', 4], reserved: 96000, created: 9, submitted: 8, updated: 4,
    items: [['مراقبة أمنية مُدارة (SOC) على مدار الساعة مع تقارير شهرية', 12, 'شهر', 8000]],
  });
  // 7) a private draft
  pr({
    id: 'prq_demo_draft', number: `PR-${YEAR}-0142`, requester: 'u_sara', dept: 'dept_it', category: 'supplies', line: 'bl_it_hw',
    title: 'شاشتا عرض لقاعة اجتماعات التحول الرقمي',
    justification: 'تجهيز قاعة الاجتماعات لعروض المشاريع والاجتماعات الهجينة.',
    needed_by: day(35), status: 'draft', created: 1, updated: 1,
    items: [['شاشة عرض تفاعلية 75 بوصة مع نظام مؤتمرات مدمج', 2, 'جهاز', 3900]],
  });
  // 8) rejected by the line manager (with reason)
  pr({
    id: 'prq_demo_rejected', number: `PR-${YEAR}-0135`, requester: 'u_hamad', dept: 'dept_spmo', category: 'it', line: 'bl_spmo_std',
    title: 'اشتراك سنوي في منصة بيانات مؤشرات الأداء الدولية',
    justification: 'الحاجة لمقارنات معيارية دولية لمؤشرات الخطة الاستراتيجية.',
    needed_by: day(15), status: 'rejected', manager: 'u_latifa', reject_note: 'الاشتراك مغطّى ضمن اتفاقية قائمة مع مركز الإحصاء — يُرجى طلب الوصول عبر الاتفاقية.', created: 20, submitted: 19, updated: 17,
    items: [['اشتراك سنوي لمستخدمَين في منصة البيانات', 1, 'اشتراك', 42000]],
  });
  ev('prq_demo_rejected', null, 'rejected', 'u_latifa', 17, 10, 'الاشتراك مغطّى ضمن اتفاقية قائمة مع مركز الإحصاء — يُرجى طلب الوصول عبر الاتفاقية.');

  // ---------------- contracts from orders (providers registry) ----------------
  const contract = (id, number, provider, title, dept, owner, value, startDays, endDays, po, source, req) => run(
    `INSERT INTO providers_contracts (id,number,provider_id,title,department_id,owner_id,value,start_date,end_date,status,po_number,source,source_ref,request_id,created_by,created_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,'active',?,'procurement',?,?,'u_reem',?,1)`,
    id, number, provider, title, dept, owner, value, day(startDays), day(endDays), po, source, req, at(startDays, 13));
  contract('ct_demo_licences', `CN-${YEAR}-0098`, 'pv_horizon', 'تجديد تراخيص برنامج التصميم الجرافيكي لفريق تجربة المستخدم', 'dept_it', 'u_mariam', 17900, -40, 325, `PO-${YEAR}-0416`, `PR-${YEAR}-0136`, 'prq_demo_licences');
  contract('ct_demo_service_ctr', `CN-${YEAR}-0111`, 'pv_oasis', 'تجهيز مركز خدمة المتعاملين الموحد', 'dept_ops', 'u_omar', 175820, -25, 155, `PO-${YEAR}-0418`, `RFQ-${YEAR}-0021`, 'prq_demo_service_ctr');
  const evalDay = -8;
  run('INSERT INTO providers_evaluations (id,contract_id,provider_id,evaluator_id,period,quality,timeliness,compliance,score,comment,created_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    uid('pe_'), 'ct_demo_service_ctr', 'pv_oasis', 'u_omar', quarterOf(day(evalDay)), 4, 5, 4, round(13 / 3, 2), 'التوريد اكتمل قبل الموعد بأسبوع، وتركيب نظام الطابور تم دون تعطيل للخدمة؛ ملاحظة بسيطة على تشطيب منصتين تمت معالجتها.', at(evalDay, 11));

  // ---------------- RFQ documents (scope of work drafted from the request) ----------------
  const reem = one("SELECT id, department_id FROM users WHERE id='u_reem'");
  const specDoc = (rfq, prRow) => {
    const html = `<p><em>تحليل محلي — نموذج الذكاء الاصطناعي غير متصل: استُخدم القالب المعتمد للمشتريات</em></p>${templateSpec(rfq, prRow)}`;
    return { id: createDocument(reem, { title: `نطاق العمل — ${rfq.number} — ${prRow.title}`, kind: 'report', content_html: html }).result.id, html };
  };
  const rfq = (o) => run(`INSERT INTO procurement_rfqs (id,number,request_id,title,category,officer_id,status,closes_at,spec_doc_id,spec_html,spec_mode,spec_at,criteria,tech_weight,min_tech,key1_by,key1_at,opened_by,opened_at,recommended_bid,recommended_by,recommended_at,recommendation_note,legal_by,legal_at,legal_note,po_number,po_amount,contract_id,awarded_at,published_at,created_at,updated_at,is_demo)
    VALUES (?,?,?,?,?,'u_reem',?,?,?,?,'template',?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
  o.id, o.number, o.request, o.title, o.category, o.status, o.closes_at, o.spec.id, o.spec.html, o.spec_at, JSON.stringify(DEFAULT_CRITERIA), DEFAULT_TECH_WEIGHT, DEFAULT_MIN_TECH,
  o.key1?.[0] || null, o.key1?.[1] || null, o.opened?.[0] || null, o.opened?.[1] || null, o.rec?.[0] || null, o.rec ? 'u_reem' : null, o.rec?.[1] || null, o.rec?.[2] || null,
  o.legal?.[0] || null, o.legal?.[1] || null, o.legal?.[2] || null, o.po || null, o.po_amount || null, o.contract || null, o.awarded_at || null, o.published_at, o.created_at, o.updated_at);
  const invite = (q, p, days) => run('INSERT INTO procurement_invites (rfq_id,provider_id,invited_by,invited_at) VALUES (?,?,?,?)', q, p, 'u_reem', at(-days, 9));
  const member = (q, m) => run('INSERT INTO procurement_committee (rfq_id,member_id) VALUES (?,?)', q, m);
  const bid = (id, q, p, user, lines, delivery, validity, note, days) => run(
    `INSERT INTO procurement_bids (id,rfq_id,provider_id,submitted_by,status,lines,total,delivery_days,validity_days,technical_note,submitted_at,updated_at,is_demo) VALUES (?,?,?,?,'submitted',?,?,?,?,?,?,?,1)`,
    id, q, p, user, JSON.stringify(lines.map(([item_id, unit_price]) => ({ item_id, unit_price }))), round(lines.reduce((a, [iid, price]) => a + (price == null ? 0 : price * (itemQty[iid] || 0)), 0), 2), delivery, validity, note, at(-days, 10), at(-days, 10));
  const itemQty = {};
  for (const r of [...pr1Items, ...pr2Items]) itemQty[r] = one('SELECT qty FROM procurement_items WHERE id=?', r).qty;

  // RFQ-0021: awarded
  const q2 = { id: 'rfq_demo_awarded', number: `RFQ-${YEAR}-0021`, category: 'supplies', tech_weight: DEFAULT_TECH_WEIGHT, min_tech: DEFAULT_MIN_TECH, criteria: JSON.stringify(DEFAULT_CRITERIA) };
  const pr2 = one('SELECT * FROM procurement_requests WHERE id=?', 'prq_demo_service_ctr');
  rfq({
    ...q2, request: pr2.id, title: pr2.title, status: 'awarded', closes_at: at(-36, 10), spec: specDoc(q2, pr2), spec_at: at(-51, 12),
    key1: ['u_majed', at(-35, 9, 5)], opened: ['u_mariam', at(-35, 9, 40)], rec: ['bid_demo_oasis', at(-29, 11), null], legal: ['u_yousef', at(-26, 12), 'لا ملاحظات قانونية؛ نموذج العقد الموحد للتوريد مع بند غرامات التأخير.'],
    po: `PO-${YEAR}-0418`, po_amount: 175820, contract: 'ct_demo_service_ctr', awarded_at: at(-25, 10), published_at: at(-50, 10), created_at: at(-52, 9), updated_at: at(-25, 10),
  });
  for (const [p, d] of [['pv_oasis', 50], ['pv_horizon', 50], ['pv_bayan', 50], ['pv_madar', 50]]) invite(q2.id, p, d);
  member(q2.id, 'u_majed'); member(q2.id, 'u_mariam');
  const [c1, c2, c3, c4] = pr2Items;
  bid('bid_demo_oasis', q2.id, 'pv_oasis', 'u_ext_oasis', [[c1, 1380], [c2, 3950], [c3, 36500], [c4, 4600]], 30, 90, 'توريد مقاعد معتمدة وفق مواصفات الدفاع المدني، وشاشات تجارية بضمان 3 سنوات، ونظام طابور متكامل مع الربط بلوحة مؤشرات زمن الانتظار، وتركيب خلال 30 يوماً مع تدريب الموظفين.', 38);
  bid('bid_demo_horizon', q2.id, 'pv_horizon', 'u_ext_horizon', [[c1, 1600], [c2, 3600], [c3, 41000], [c4, null]], 25, 90, 'نركّز على البنود التقنية (الشاشات ونظام الطابور) مع تكامل برمجي متقدم؛ لا نورّد منصات الخدمة الخشبية.', 37);
  bid('bid_demo_bayan', q2.id, 'pv_bayan', 'u_ext_oasis', [[c1, 900], [c2, 4100], [c3, 35000], [c4, 4800]], 45, 60, 'توريد وتركيب شامل مع صيانة وقائية لمدة سنة للبنود الكهربائية.', 36);
  run("UPDATE procurement_bids SET submitted_by='u_reem' WHERE id='bid_demo_bayan'"); // offline bid entered on behalf of a provider without a portal account
  const score = (b, m, [c, e, d], days) => { for (const [k, v] of [['compliance', c], ['experience', e], ['delivery', d]]) run('INSERT INTO procurement_scores (rfq_id,bid_id,member_id,criterion,score,at) VALUES (?,?,?,?,?,?)', q2.id, b, m, k, v, at(-days, 12)); };
  score('bid_demo_oasis', 'u_majed', [9, 8, 8], 32); score('bid_demo_oasis', 'u_mariam', [8, 8, 8], 31);
  score('bid_demo_horizon', 'u_majed', [6, 8, 7], 32); score('bid_demo_horizon', 'u_mariam', [6, 7, 7], 31);
  score('bid_demo_bayan', 'u_majed', [7, 6, 7], 32); score('bid_demo_bayan', 'u_mariam', [8, 6, 7], 31);
  run('INSERT INTO procurement_votes (rfq_id,member_id,bid_id,decision,note,at) VALUES (?,?,?,?,?,?)', q2.id, 'u_majed', 'bid_demo_oasis', 'approve', null, at(-28, 10));
  run('INSERT INTO procurement_votes (rfq_id,member_id,bid_id,decision,note,at) VALUES (?,?,?,?,?,?)', q2.id, 'u_mariam', 'bid_demo_oasis', 'approve', 'العرض الأعلى في الدرجة المركبة ومكتمل التسعير.', at(-28, 13));
  const rq = (action, by, days, h, note = null) => ev(pr2.id, q2.id, action, by, days, h, note);
  rq('rfq_started', 'u_reem', 52, 9); rq('rfq_published', 'u_reem', 50, 10, '4 موردين — الإغلاق بعد 14 يوماً'); rq('key1', 'u_majed', 35, 9); rq('opened', 'u_mariam', 35, 9, '3 عروض');
  rq('evaluated', 'u_reem', 30, 14); rq('recommended', 'u_reem', 29, 11); rq('vote_approve', 'u_majed', 28, 10); rq('vote_approve', 'u_mariam', 28, 13); rq('committee_approved', null, 28, 13);
  rq('legal_approved', 'u_yousef', 26, 12, 'لا ملاحظات قانونية؛ نموذج العقد الموحد للتوريد مع بند غرامات التأخير.'); rq('awarded', 'u_reem', 25, 10, `PO-${YEAR}-0418`);
  run('UPDATE procurement_rfqs SET analysis=?, analysis_mode=?, analysis_at=?, analysis_by=? WHERE id=?', JSON.stringify({ text: localAnalysisText(q2.id), model: null }), 'local', at(-33, 9), 'u_reem', q2.id);
  const log = (u, action, days, h) => run('INSERT INTO access_log (id,user_id,system,record_type,record_id,action,at) VALUES (?,?,?,?,?,?,?)', uid('ax_'), u, 'procurement', 'rfq', q2.id, action, at(-days, h));
  log('u_majed', 'view_bids', 35, 10); log('u_mariam', 'view_bids', 34, 11); log('u_reem', 'view_bids', 33, 9); log('u_reem', 'analysis', 33, 9); log('u_yousef', 'view_bids', 26, 11); log('u_yousef', 'legal:approve', 26, 12);

  // RFQ-0022: OPEN — closes in 3 days; Horizon already submitted a sealed bid
  const q1 = { id: 'rfq_demo_open', number: `RFQ-${YEAR}-0022`, category: 'supplies', tech_weight: DEFAULT_TECH_WEIGHT, min_tech: DEFAULT_MIN_TECH, criteria: JSON.stringify(DEFAULT_CRITERIA) };
  const pr1 = one('SELECT * FROM procurement_requests WHERE id=?', 'prq_demo_laptops');
  rfq({ ...q1, request: pr1.id, title: pr1.title, status: 'open', closes_at: at(3, 10), spec: specDoc(q1, pr1), spec_at: at(-8, 12), published_at: at(-7, 10), created_at: at(-9, 9), updated_at: at(-1, 10) });
  invite(q1.id, 'pv_horizon', 7); invite(q1.id, 'pv_oasis', 7);
  member(q1.id, 'u_majed'); member(q1.id, 'u_mariam');
  bid('bid_demo_open_horizon', q1.id, 'pv_horizon', 'u_ext_horizon', [[pr1Items[0], 5350], [pr1Items[1], 610]], 21, 90, 'أجهزة من فئة الأعمال بمعالج من الجيل الأحدث وذاكرة 32 جيجابايت وتخزين 1 تيرابايت، ضمان 3 سنوات في الموقع، ومحطات إرساء USB-C معتمدة من الشركة المصنّعة.', 1);
  ev(pr1.id, q1.id, 'rfq_started', 'u_reem', 9, 9); ev(pr1.id, q1.id, 'rfq_published', 'u_reem', 7, 10, '2 مورد — الإغلاق بعد 10 أيام');

  // numbering continues after the demo records
  for (const [k, n] of [[`PR-${YEAR}`, 142], [`RFQ-${YEAR}`, 22], [`PO-${YEAR}`, 418]]) run('INSERT INTO procurement_counters (key,n) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET n=MAX(n, excluded.n)', k, n);
  void json;
}
