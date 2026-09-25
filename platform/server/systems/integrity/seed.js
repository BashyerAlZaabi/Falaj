// Conflicts & Gifts — realistic demo data (Arabic), dated relative to today.
// Idempotent: runs once on an empty system. Deterministic ids keep deep links stable.
import { one, run, day, at, isEmpty } from '../kit.js';
import { propose } from './model.js';

const ts = (n, h = 9, m = 0) => at(n, h, m);                                     // ISO timestamp n days from today
const logTs = (n, h = 9, m = 0) => at(n, h, m).replace('T', ' ').slice(0, 19);   // access_log format (datetime('now'))

export function seed() {
  if (!isEmpty('integrity_cycles')) return;
  if (!one("SELECT 1 FROM users WHERE id='u_ahmed'")) return; // demo personas not present
  const year = new Date().getUTCFullYear();
  const cycle = `icy_${year}`;
  run(`INSERT INTO integrity_cycles (id,year,title_ar,title_en,opens_on,due_on,status,created_by,created_at,is_demo) VALUES (?,?,?,?,?,?, 'open', 'u_yousef', ?, 1)`,
    cycle, year, `الإقرار السنوي لتضارب المصالح ${year}`, `Annual conflict-of-interest declaration ${year}`, day(-20), day(30), ts(-20, 6));

  const ev = (type, id, actor, action, n, h, note = null) => run('INSERT INTO integrity_events (id,ref_type,ref_id,actor_id,action,note,at) VALUES (?,?,?,?,?,?,?)', `ie_${id}_${action}`, type, id, actor, action, note, ts(n, h));
  const seen = (actor, type, id, action, n, h, m = 0) => run('INSERT INTO access_log (id,user_id,system,record_type,record_id,action,at) VALUES (?,?,?,?,?,?,?)', `ax_${id}_${actor}_${action}_${n}_${h}`, actor, 'integrity', type, id, action, logTs(n, h, m));

  // ---- annual declarations ----
  // status: draft | submitted | under_review | cleared | mitigation
  const decl = (user, { status, noConflict = null, statement = null, submitted, started, decided, note, interests = [] }) => {
    const id = `idc_${user.slice(2)}_${year}`;
    run(`INSERT INTO integrity_declarations (id,cycle_id,user_id,status,no_conflict,statement,attested_at,submitted_at,first_submitted_at,reviewer_id,review_started_at,decided_by,decided_at,outcome,decision_note,created_at,updated_at,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`,
    id, cycle, user, status, noConflict, statement, submitted != null ? ts(submitted, 8) : null, submitted != null ? ts(submitted, 8) : null, submitted != null ? ts(submitted, 8) : null,
    started != null ? 'u_yousef' : null, started != null ? ts(started, 10) : null, decided != null ? 'u_yousef' : null, decided != null ? ts(decided, 12) : null,
    ['cleared', 'mitigation'].includes(status) ? status : null, note || null, ts((submitted ?? -2) - 1, 7), ts(submitted ?? -1, 8));
    interests.forEach((i, k) => run('INSERT INTO integrity_interests (id,declaration_id,kind,party_name,provider_id,details,sort) VALUES (?,?,?,?,?,?,?)', `iin_${user.slice(2)}_${k}`, id, i.kind, i.party, i.provider || null, i.details || null, k));
    ev('declaration', id, user, 'created', (submitted ?? -2) - 1, 7);
    if (submitted != null) ev('declaration', id, user, 'submitted', submitted, 8);
    if (started != null) { ev('declaration', id, 'u_yousef', 'review_started', started, 10); seen('u_yousef', 'declaration', id, 'view', started, 10); seen('u_yousef', 'declaration', id, 'start_review', started, 10, 2); }
    if (decided != null) { ev('declaration', id, 'u_yousef', status, decided, 12, note); seen('u_yousef', 'declaration', id, 'view', decided, 11, 40); seen('u_yousef', 'declaration', id, 'decide', decided, 12); }
    return id;
  };

  const ahmed = decl('u_ahmed', {
    status: 'mitigation', noConflict: 0, submitted: -6, started: -4, decided: -2,
    statement: 'أفصح عن علاقة قرابة بأحد الشركاء في مقدّم خدمة يتعامل مع الإدارة.',
    note: 'العلاقة قائمة ومؤثرة في نطاق عمل الموظف؛ يكفي التنحي عن تقييم عروض الشركة ولا يلزم إجراء آخر.',
    interests: [{ kind: 'provider', party: 'شركة الأفق للحلول التقنية', provider: 'ext_v_horizon', details: 'شقيقي شريك بنسبة 15% في الشركة، وهي من مقدّمي الخدمات التقنية المسجّلين لدى الجهة.' }],
  });
  run(`INSERT INTO integrity_mitigations (id,source_type,source_id,user_id,kind,matter,provider_id,instruction,manager_visible,created_by,created_at,is_demo)
    VALUES ('imt_ahmed_horizon','declaration',?,'u_ahmed','recusal','تقييم عروض شركة الأفق للحلول التقنية وقرارات الشراء الخاصة بها','ext_v_horizon',
    'يمتنع عن تقييم عروض شركة الأفق للحلول التقنية أو المشاركة في أي قرار شراء يخصها',1,'u_yousef',?,1)`, ahmed, ts(-2, 12));
  decl('u_sara', { status: 'cleared', noConflict: 1, submitted: -9, started: -7, decided: -5, note: 'لا يوجد ما يستدعي إجراءً.' });
  decl('u_majed', { status: 'cleared', noConflict: 1, submitted: -12, started: -10, decided: -8 });
  decl('u_hessa', { status: 'cleared', noConflict: 1, submitted: -7, started: -6, decided: -5 });
  decl('u_aisha', { status: 'cleared', noConflict: 1, submitted: -15, started: -13, decided: -11 });
  decl('u_president', { status: 'cleared', noConflict: 1, submitted: -11, started: -10, decided: -9 });
  decl('u_omar', { status: 'submitted', noConflict: 1, submitted: -3 });
  decl('u_yousef', { status: 'submitted', noConflict: 1, submitted: -10 }); // needs another reviewer (segregation of duties)
  decl('u_noura', {
    status: 'under_review', noConflict: 0, submitted: -5, started: -1,
    interests: [{ kind: 'financial', party: 'محفظة أسهم في شركات مدرجة بسوق أبوظبي', details: 'أسهم تقل عن 1% في بنك محلي تتعامل معه الإدارة المالية في الخدمات المصرفية.' }],
  });
  decl('u_reem', {
    status: 'submitted', noConflict: 0, submitted: -1,
    interests: [{ kind: 'relative', party: 'مؤسسة الواحة للتوريدات', provider: 'ext_v_oasis', details: 'زوج شقيقتي يعمل مديراً للمبيعات في المؤسسة.' }],
  });
  decl('u_latifa', {
    status: 'under_review', noConflict: 0, submitted: -4, started: -2,
    interests: [{ kind: 'outside_role', party: 'جمعية أهلية للعمل التطوعي', details: 'عضو مجلس أمناء (تطوعي دون مقابل)، اجتماع ربع سنوي خارج أوقات الدوام.' }],
  });
  decl('u_fatima', { status: 'draft', noConflict: null });
  decl('u_hamad', { status: 'draft', noConflict: 0, interests: [{ kind: 'other', party: 'مكتب استشارات عائلي', details: 'أعمل على تحديد طبيعة المصلحة قبل التقديم.' }] });
  decl('u_saeed', { status: 'draft', noConflict: null });
  // mariam and salem have not started yet.

  // ---- ad-hoc disclosures ----
  const disc = (id, user, f) => {
    run(`INSERT INTO integrity_disclosures (id,user_id,status,matter,related_party,provider_id,relationship,proposed_recusal,submitted_at,reviewer_id,review_started_at,decided_by,decided_at,outcome,decision_note,closed_at,created_at,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, id, user, f.status, f.matter, f.party, f.provider || null, f.relationship, f.recusal || null, ts(f.submitted, 9),
    f.decided != null ? 'u_yousef' : null, f.decided != null ? ts(f.decided - 1, 9) : null, f.decided != null ? 'u_yousef' : null, f.decided != null ? ts(f.decided, 11) : null,
    f.decided != null ? 'cleared' : null, f.note || null, f.closed != null ? ts(f.closed, 12) : null, ts(f.submitted, 9));
    ev('disclosure', id, user, 'submitted', f.submitted, 9);
    if (f.decided != null) { ev('disclosure', id, 'u_yousef', 'review_started', f.decided - 1, 9); ev('disclosure', id, 'u_yousef', 'cleared', f.decided, 11, f.note); seen('u_yousef', 'disclosure', id, 'view', f.decided - 1, 9); seen('u_yousef', 'disclosure', id, 'decide', f.decided, 11); }
    if (f.closed != null) ev('disclosure', id, 'u_yousef', 'closed', f.closed, 12);
  };
  disc('ids_sara_oasis', 'u_sara', {
    status: 'submitted', submitted: -1, matter: 'عضوية لجنة الفحص الفني لطلب عروض توريد أجهزة حاسب للبوابة الموحدة',
    party: 'مؤسسة الواحة للتوريدات', provider: 'ext_v_oasis', relationship: 'ابن عمي يعمل مديراً للمبيعات لدى المؤسسة المتقدّمة بعرض.',
    recusal: 'أتنحى عن تقييم عرض مؤسسة الواحة وعن أي نقاش يخصه داخل اللجنة.',
  });
  disc('ids_omar_horizon', 'u_omar', {
    status: 'closed', submitted: -26, decided: -22, closed: -21, matter: 'اختيار نظام إدارة التذاكر لمركز خدمة العملاء',
    party: 'شركة الأفق للحلول التقنية', provider: 'ext_v_horizon', relationship: 'عملت مستشاراً لدى الشركة قبل انضمامي، وانتهت العلاقة منذ أكثر من سنتين.',
    recusal: 'لا أرى حاجة للتنحي، وأترك التقدير لضابط الامتثال.', note: 'علاقة عمل سابقة منتهية منذ أكثر من سنتين دون مصلحة قائمة؛ لا يلزم إجراء.',
  });

  // ---- gifts & hospitality ----
  const gift = (id, user, g) => {
    const p = propose({ value_aed: g.value, cash: g.cash, active_tender: g.tender, kind: g.kind || 'gift' });
    const status = g.decision ? (g.decision === 'keep' || g.completed != null ? 'completed' : 'decided') : 'declared';
    run(`INSERT INTO integrity_gifts (id,user_id,giver_name,giver_type,provider_id,description,kind,value_aed,occasion,received_on,offered_only,cash,active_tender,proposal,proposal_rule,status,decision,decided_by,decided_at,decision_note,completed_at,created_at,is_demo)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1)`, id, user, g.giver, g.giverType || 'organisation', g.provider || null, g.desc, g.kind || 'gift', g.value, g.occasion || null,
    day(g.received), g.offered ? 1 : 0, g.cash ? 1 : 0, g.tender ? 1 : 0, p.decision, p.rule, status, g.decision || null, g.decision ? 'u_yousef' : null,
    g.decided != null ? ts(g.decided, 11) : null, g.note || null, status === 'completed' ? ts(g.completed ?? g.decided, 13) : null, ts(g.declared, 9));
    ev('gift', id, user, 'declared', g.declared, 9);
    if (g.decision) { ev('gift', id, 'u_yousef', `decision_${g.decision}`, g.decided, 11, g.note); seen('u_yousef', 'gift', id, 'view', g.decided, 10, 30); seen('u_yousef', 'gift', id, 'decide', g.decided, 11); }
    if (g.completed != null) ev('gift', id, user, 'completed', g.completed, 13);
  };
  gift('igf_ahmed_shield', 'u_ahmed', { giver: 'هيئة أبوظبي الرقمية', desc: 'درع تذكاري ومجموعة أقلام', value: 150, occasion: 'ورشة عمل مشتركة حول الهوية الرقمية', received: -20, declared: -19, decision: 'keep', decided: -17 });
  gift('igf_ahmed_watch', 'u_ahmed', {
    giver: 'شركة الأفق للحلول التقنية', provider: 'ext_v_horizon', tender: true, desc: 'ساعة يد فاخرة', value: 1800, occasion: 'زيارة تعريفية بحلول الشركة',
    received: -12, declared: -11, decision: 'decline_return', decided: -9, completed: -8, note: 'أُعيدت الساعة مع خطاب شكر واعتذار وفق السياسة.',
  });
  gift('igf_fatima_dates', 'u_fatima', { giver: 'مؤسسة الواحة للتوريدات', provider: 'ext_v_oasis', desc: 'سلة تمور وقهوة فاخرة', value: 350, occasion: 'تهنئة بافتتاح مركز خدمة العملاء', received: -4, declared: -3 });
  gift('igf_majed_dinner', 'u_majed', { giver: 'بنك محلي', kind: 'hospitality', offered: true, desc: 'دعوة عشاء عمل في فندق', value: 450, occasion: 'ملتقى القطاع المالي السنوي', received: -3, declared: -2 });
  gift('igf_noura_book', 'u_noura', { giver: 'جمعية المحاسبين والمدققين', desc: 'كتاب مهني ومفكرة', value: 90, occasion: 'حضور مؤتمر مهني', received: -30, declared: -29, decision: 'keep', decided: -27 });
  gift('igf_hessa_flowers', 'u_hessa', { giver: 'متدرّبة سابقة', giverType: 'person', desc: 'باقة ورد وعلبة شوكولاتة', value: 120, occasion: 'شكر بعد انتهاء برنامج التدريب', received: -2, declared: -1 });
  gift('igf_reem_card', 'u_reem', { giver: 'مؤسسة الواحة للتوريدات', provider: 'ext_v_oasis', cash: true, desc: 'بطاقة هدايا لمتجر إلكترونيات', value: 500, occasion: 'نهاية العام المالي', received: -6, declared: -5, decision: 'decline_return', decided: -3, note: 'بطاقات الهدايا في حكم النقد؛ تُعاد مع خطاب اعتذار.' });
}
