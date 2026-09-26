// Awards — domain service. Every function takes the authenticated user and
// enforces authorisation itself (routes, Ask AI tools, workspace cards and game
// events all go through these functions, so they share one scope).
//
// Confidentiality model (awards.evaluations is restricted, AI locked):
//  * nominators see the nominations they submitted (content + status, never scores);
//  * nominees (and team members) see their own nominations (content + status, never scores);
//  * committee members (awards.committee / awards.admin) see nominations only once a
//    programme is under evaluation, and never those they are recused from (self,
//    their own nomination, their own department, or a declared conflict of interest);
//  * individual reviews are visible to their author only; the awards admin (chair)
//    sees aggregates to rank and finalise; scores are never published;
//  * after the announcement, winners (name, department, category, citation) are
//    public to all staff (awards.public).
import * as K from '../kit.js';
import * as G from '../../services/game.js';

const { one, all, run, uid, now, today, json, tx, Forbidden, NotFound, BadRequest, Conflict } = K;
const { S, str, int, bool, arr, date } = K;

export const SYS = 'awards';
export const MIN_REVIEWS = 2;
export const MAX_NOMINATIONS_PER_NOMINATOR = 3;
const ACTIVE = ['awaiting_consent', 'submitted', 'in_evaluation', 'winner', 'not_selected'];
const EVALUATED = ['in_evaluation', 'winner', 'not_selected'];

export const P_STATUS = { draft: 'مسودة', nominations: 'باب الترشيح مفتوح', evaluation: 'قيد التقييم', announced: 'أُعلنت النتائج', cancelled: 'ملغى' };
export const N_STATUS = { awaiting_consent: 'بانتظار موافقة المرشح', submitted: 'مُقدَّم', declined: 'اعتذر المرشح', withdrawn: 'مسحوب', lapsed: 'انتهت المهلة دون موافقة', in_evaluation: 'قيد التقييم', winner: 'فائز', not_selected: 'لم يُختر' };
const P_FLOW = { draft: ['nominations', 'cancelled'], nominations: ['evaluation', 'cancelled'], evaluation: ['announced', 'cancelled'] };
const N_FLOW = { awaiting_consent: ['submitted', 'declined', 'withdrawn', 'lapsed'], submitted: ['withdrawn', 'in_evaluation'], in_evaluation: ['winner', 'not_selected'] };
export const RECUSAL = {
  self: ['أنت المرشح في هذا الترشيح', 'You are the nominee'],
  nominator: ['أنت من قدّم هذا الترشيح', 'You submitted this nomination'],
  department: ['المرشح من إدارتك', 'The nominee is from your department'],
  declared: ['أعلنت تعارض مصالح', 'You declared a conflict of interest'],
};
export const ELIGIBILITY = {
  employees: 'الموظفون (غير الإداريين)',
  managers: 'القيادات (المديرون)',
  all_staff: 'جميع موظفي الجهة',
  team: 'فرق العمل',
};

// ---------------- identity ----------------
export const isAdmin = (u) => K.isStaff(u) && K.hasCap(u, 'awards.admin');
export const isMember = (u) => K.isStaff(u) && K.hasCap(u, 'awards.admin', 'awards.committee');
export function committeeMembers() {
  return all(`SELECT DISTINCT u.id, u.department_id, u.name_ar, u.name_en FROM user_caps c JOIN users u ON u.id=c.user_id
    WHERE c.cap IN ('awards.admin','awards.committee') AND u.active=1 AND u.user_type='staff' ORDER BY u.name_ar`);
}
export const adminIds = () => all(`SELECT u.id FROM user_caps c JOIN users u ON u.id=c.user_id WHERE c.cap='awards.admin' AND u.active=1 AND u.user_type='staff'`).map((r) => r.id);
export const allStaffIds = () => all("SELECT id FROM users WHERE active=1 AND user_type='staff'").map((r) => r.id);
const pub = (id) => {
  const u = K.userBrief(id);
  return u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, dept_ar: u.dept_ar, dept_en: u.dept_en, department_id: u.department_id } : null;
};
const staffRow = (id) => (id ? one("SELECT id,role,department_id,user_type,active FROM users WHERE id=? AND active=1 AND user_type='staff'", id) : null);

// ---------------- programmes ----------------
const programRow = (id) => one('SELECT * FROM awards_programs WHERE id=?', id);
const categoriesOf = (pid) => all('SELECT * FROM awards_categories WHERE program_id=? ORDER BY sort, name_ar', pid);
const criteriaOf = (pid) => all('SELECT * FROM awards_criteria WHERE program_id=? ORDER BY sort', pid).map((c) => ({ ...c, descriptors: json(c.descriptors, []) }));

export function phase(p) {
  const t = today();
  const open = p.status === 'nominations' && t >= p.nomination_opens && t <= p.nomination_closes;
  return {
    window_open: open,
    not_yet_open: p.status === 'nominations' && t < p.nomination_opens,
    nominations_ended: p.status === 'nominations' && t > p.nomination_closes,
    evaluation_overdue: p.status === 'evaluation' && t > p.evaluation_closes,
    stage: { draft: 0, nominations: 0, evaluation: 1, announced: 2, cancelled: -1 }[p.status],
    days_left: p.status === 'nominations' ? K.daysBetween(t, p.nomination_closes) : p.status === 'evaluation' ? K.daysBetween(t, p.evaluation_closes) : null,
    days_to_announce: ['nominations', 'evaluation', 'draft'].includes(p.status) ? K.daysBetween(t, p.announce_on) : null,
  };
}

function adminStats(p) {
  const byStatus = Object.fromEntries(all('SELECT status, COUNT(*) n FROM awards_nominations WHERE program_id=? GROUP BY status', p.id).map((r) => [r.status, r.n]));
  const byCategory = Object.fromEntries(all(`SELECT category_id, COUNT(*) n FROM awards_nominations WHERE program_id=? AND status IN (${K.inList(ACTIVE)}) GROUP BY category_id`, p.id, ...ACTIVE).map((r) => [r.category_id, r.n]));
  let coverage = null;
  if (['evaluation', 'announced'].includes(p.status)) {
    const rows = all(`SELECT n.id, (SELECT COUNT(*) FROM awards_reviews r WHERE r.nomination_id=n.id) c FROM awards_nominations n WHERE n.program_id=? AND n.status IN (${K.inList(EVALUATED)})`, p.id, ...EVALUATED);
    coverage = { total: rows.length, complete: rows.filter((r) => r.c >= MIN_REVIEWS).length, reviews: rows.reduce((a, r) => a + r.c, 0) };
  }
  const active = ACTIVE.reduce((a, s) => a + (byStatus[s] || 0), 0);
  return { by_status: byStatus, by_category: byCategory, active, coverage };
}

function decorateProgram(user, p) {
  const ph = phase(p);
  const out = {
    id: p.id, name_ar: p.name_ar, name_en: p.name_en, description_ar: p.description_ar, description_en: p.description_en,
    kind: p.kind, cycle: p.cycle, eligibility: p.eligibility, allow_self: !!p.allow_self,
    nomination_opens: p.nomination_opens, nomination_closes: p.nomination_closes, evaluation_closes: p.evaluation_closes, announce_on: p.announce_on,
    status: p.status, announced_at: p.announced_at, is_demo: !!p.is_demo, phase: ph,
    categories: categoriesOf(p.id).map((c) => ({ id: c.id, name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, description_en: c.description_en, max_winners: c.max_winners })),
    criteria: criteriaOf(p.id).map((c) => ({ id: c.id, name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, description_en: c.description_en, weight: c.weight, descriptors: c.descriptors })),
    can_nominate: K.isStaff(user) && ph.window_open,
    my_nominations: one("SELECT COUNT(*) n FROM awards_nominations WHERE program_id=? AND nominator_id=? AND status NOT IN ('withdrawn','declined','lapsed')", p.id, user.id).n,
    winners_count: p.status === 'announced' ? one("SELECT COUNT(*) n FROM awards_nominations WHERE program_id=? AND status='winner'", p.id).n : null,
  };
  // the user's own active nominations here (never anyone else's): hides duplicates in the wizard
  out.my_nominees = all(`SELECT nominee_id FROM awards_nominations WHERE program_id=? AND nominator_id=? AND status IN (${K.inList(ACTIVE)})`, p.id, user.id, ...ACTIVE).map((r) => r.nominee_id);
  if (isAdmin(user)) out.admin = adminStats(p);
  return out;
}

export function listPrograms(user, { status, q, publicOnly = false } = {}) {
  K.requireStaff(user);
  const where = []; const params = [];
  if (publicOnly || !isAdmin(user)) where.push("status<>'draft'");
  if (status === 'open') where.push("status='nominations'");
  else if (status && status !== 'all') { where.push('status=?'); params.push(status); }
  if (q) { where.push('(name_ar LIKE ? OR name_en LIKE ? OR cycle LIKE ?)'); params.push(K.like(q), K.like(q), K.like(q)); }
  const rows = all(`SELECT * FROM awards_programs ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY CASE status WHEN 'nominations' THEN 0 WHEN 'evaluation' THEN 1 WHEN 'draft' THEN 2 WHEN 'announced' THEN 3 ELSE 4 END, nomination_closes DESC`, ...params);
  let out = rows.map((p) => decorateProgram(user, p));
  if (status === 'open') out = out.filter((p) => p.phase.window_open);
  return out;
}

export function getProgram(user, id) {
  K.requireStaff(user);
  const p = programRow(id);
  if (!p || (p.status === 'draft' && !isAdmin(user))) throw new NotFound();
  return decorateProgram(user, p);
}

// ---- programme editor (awards.admin) ----
const catSchema = S({ id: str(), name_ar: str('', { maxLength: 120 }), name_en: str('', { maxLength: 120 }), description_ar: str('', { maxLength: 400 }), description_en: str('', { maxLength: 400 }), max_winners: int('', { minimum: 1, maximum: 5 }) }, ['name_ar']);
const descSchema = S({ level: int('', { minimum: 1, maximum: 5 }), ar: str('', { maxLength: 240 }), en: str('', { maxLength: 240 }) }, ['level', 'ar']);
const critSchema = S({ id: str(), name_ar: str('', { maxLength: 120 }), name_en: str('', { maxLength: 120 }), description_ar: str('', { maxLength: 400 }), description_en: str('', { maxLength: 400 }), weight: int('', { minimum: 5, maximum: 60 }), descriptors: arr(descSchema, { maxItems: 5 }) }, ['name_ar', 'weight', 'descriptors']);
const PROGRAM_FIELDS = {
  name_ar: str('', { maxLength: 140 }), name_en: str('', { maxLength: 140 }), description_ar: str('', { maxLength: 1200 }), description_en: str('', { maxLength: 1200 }),
  kind: str('', { enum: ['excellence', 'team', 'innovation', 'leadership'] }), cycle: str('', { maxLength: 60 }),
  eligibility: str('', { enum: ['employees', 'managers', 'all_staff', 'team'] }), allow_self: bool(),
  nomination_opens: date(), nomination_closes: date(), evaluation_closes: date(), announce_on: date(),
  categories: arr(catSchema, { maxItems: 6 }), criteria: arr(critSchema, { maxItems: 8 }),
};
export const programSchema = S(PROGRAM_FIELDS, ['name_ar', 'kind', 'eligibility', 'nomination_opens', 'nomination_closes', 'evaluation_closes', 'announce_on', 'categories', 'criteria']);
export const programPatchSchema = S(PROGRAM_FIELDS);
export const copySchema = S({ cycle: str('', { maxLength: 60 }), nomination_opens: date(), nomination_closes: date(), evaluation_closes: date(), announce_on: date() }, ['cycle', 'nomination_opens', 'nomination_closes', 'evaluation_closes', 'announce_on']);

function checkDates(d) {
  const iso = (x) => /^\d{4}-\d{2}-\d{2}$/.test(x) && !Number.isNaN(Date.parse(x));
  for (const k of ['nomination_opens', 'nomination_closes', 'evaluation_closes', 'announce_on']) if (!iso(d[k])) throw new BadRequest(`تاريخ غير صالح: ${k}`);
  if (!(d.nomination_opens <= d.nomination_closes && d.nomination_closes < d.evaluation_closes && d.evaluation_closes <= d.announce_on)) {
    throw new BadRequest('تسلسل التواريخ غير صحيح: فتح الترشيح ≤ إغلاقه < نهاية التقييم ≤ موعد الإعلان');
  }
}
function checkStructure(categories, criteria) {
  if (!categories?.length) throw new BadRequest('أضف فئة واحدة على الأقل');
  if (!criteria || criteria.length < 2) throw new BadRequest('أضف معيارين على الأقل');
  for (const c of categories) if (K.clean(c.name_ar, 120).length < 3) throw new BadRequest('اسم الفئة قصير جداً');
  const total = criteria.reduce((a, c) => a + c.weight, 0);
  if (total !== 100) throw new BadRequest(`مجموع أوزان المعايير يجب أن يساوي 100 (الحالي ${total})`);
  for (const c of criteria) {
    if (K.clean(c.name_ar, 120).length < 3) throw new BadRequest('اسم المعيار قصير جداً');
    const levels = new Set((c.descriptors || []).filter((d) => K.clean(d.ar, 240)).map((d) => d.level));
    if (![1, 3, 5].every((l) => levels.has(l))) throw new BadRequest(`حدّد وصف المستويات 1 و3 و5 للمعيار «${K.clean(c.name_ar, 60)}»`);
    if ((c.descriptors || []).length !== levels.size) throw new BadRequest('تكرار في مستويات الوصف');
  }
}
function writeStructure(pid, categories, criteria) {
  run('DELETE FROM awards_categories WHERE program_id=?', pid);
  run('DELETE FROM awards_criteria WHERE program_id=?', pid);
  categories.forEach((c, i) => run('INSERT INTO awards_categories (id,program_id,name_ar,name_en,description_ar,description_en,max_winners,sort) VALUES (?,?,?,?,?,?,?,?)',
    uid('awc_'), pid, K.clean(c.name_ar, 120), K.clean(c.name_en, 120), K.clean(c.description_ar, 400), K.clean(c.description_en, 400), c.max_winners || 1, i));
  criteria.forEach((c, i) => run('INSERT INTO awards_criteria (id,program_id,name_ar,name_en,description_ar,description_en,weight,descriptors,sort) VALUES (?,?,?,?,?,?,?,?,?)',
    uid('awk_'), pid, K.clean(c.name_ar, 120), K.clean(c.name_en, 120), K.clean(c.description_ar, 400), K.clean(c.description_en, 400), c.weight,
    JSON.stringify((c.descriptors || []).map((d) => ({ level: d.level, ar: K.clean(d.ar, 240), en: K.clean(d.en, 240) })).sort((a, b) => a.level - b.level)), i));
}
function programRecipients(p) { return p.status === 'draft' ? adminIds() : allStaffIds(); }

export function createProgram(user, body) {
  if (!isAdmin(user)) throw new Forbidden('إنشاء برامج الجوائز من صلاحية مسؤول برامج الجوائز');
  K.check(programSchema, body);
  if (K.clean(body.name_ar, 140).length < 4) throw new BadRequest('اسم البرنامج قصير جداً');
  checkDates(body);
  checkStructure(body.categories, body.criteria);
  const id = uid('awp_');
  tx(() => {
    run(`INSERT INTO awards_programs (id,name_ar,name_en,description_ar,description_en,kind,cycle,eligibility,allow_self,nomination_opens,nomination_closes,evaluation_closes,announce_on,status,created_by,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,'draft',?,?)`, id, K.clean(body.name_ar, 140), K.clean(body.name_en, 140), K.clean(body.description_ar, 1200), K.clean(body.description_en, 1200),
    body.kind, K.clean(body.cycle, 60), body.eligibility, body.allow_self === false ? 0 : 1, body.nomination_opens, body.nomination_closes, body.evaluation_closes, body.announce_on, user.id, now());
    writeStructure(id, body.categories, body.criteria);
  });
  K.audit(user, 'awards.program.create', id, { name: K.clean(body.name_ar, 140) });
  K.changed(SYS, adminIds(), id);
  return getProgram(user, id);
}

export function updateProgram(user, id, body) {
  if (!isAdmin(user)) throw new Forbidden('تعديل برامج الجوائز من صلاحية مسؤول برامج الجوائز');
  K.check(programPatchSchema, body);
  const p = programRow(id);
  if (!p) throw new NotFound();
  if (!['draft', 'nominations'].includes(p.status)) throw new Conflict('لا يمكن تعديل البرنامج بعد إغلاق باب الترشيح');
  const structural = ['categories', 'criteria', 'kind', 'eligibility', 'allow_self', 'nomination_opens'].filter((k) => body[k] !== undefined);
  if (p.status === 'nominations' && structural.length) throw new Conflict('بعد فتح باب الترشيح يمكن تعديل الوصف والتواريخ اللاحقة فقط؛ الفئات والمعايير والأهلية مقفلة');
  const next = { ...p, ...Object.fromEntries(Object.entries(body).filter(([k]) => !['categories', 'criteria'].includes(k))) };
  checkDates(next);
  if (p.status === 'nominations' && next.nomination_closes < today()) throw new BadRequest('لا يمكن جعل إغلاق الترشيح في تاريخ مضى');
  if (body.categories || body.criteria) checkStructure(body.categories || categoriesOf(id), body.criteria || criteriaOf(id));
  tx(() => {
    run(`UPDATE awards_programs SET name_ar=?,name_en=?,description_ar=?,description_en=?,kind=?,cycle=?,eligibility=?,allow_self=?,nomination_opens=?,nomination_closes=?,evaluation_closes=?,announce_on=?,updated_at=? WHERE id=?`,
      K.clean(next.name_ar, 140), K.clean(next.name_en, 140), K.clean(next.description_ar, 1200), K.clean(next.description_en, 1200), next.kind, K.clean(next.cycle, 60), next.eligibility,
      next.allow_self === false || next.allow_self === 0 ? 0 : 1, next.nomination_opens, next.nomination_closes, next.evaluation_closes, next.announce_on, now(), id);
    if (body.categories || body.criteria) writeStructure(id, body.categories || categoriesOf(id), body.criteria || criteriaOf(id));
  });
  K.audit(user, 'awards.program.update', id, { fields: Object.keys(body) });
  K.changed(SYS, programRecipients(p), id);
  return getProgram(user, id);
}

export function copyProgram(user, id, body) {
  if (!isAdmin(user)) throw new Forbidden('إنشاء دورة جديدة من صلاحية مسؤول برامج الجوائز');
  K.check(copySchema, body);
  const p = programRow(id);
  if (!p) throw new NotFound();
  checkDates(body);
  return createProgram(user, {
    name_ar: p.name_ar, name_en: p.name_en || undefined, description_ar: p.description_ar, description_en: p.description_en, kind: p.kind, cycle: body.cycle,
    eligibility: p.eligibility, allow_self: !!p.allow_self, nomination_opens: body.nomination_opens, nomination_closes: body.nomination_closes,
    evaluation_closes: body.evaluation_closes, announce_on: body.announce_on,
    categories: categoriesOf(id).map((c) => ({ name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, description_en: c.description_en, max_winners: c.max_winners })),
    criteria: criteriaOf(id).map((c) => ({ name_ar: c.name_ar, name_en: c.name_en, description_ar: c.description_ar, description_en: c.description_en, weight: c.weight, descriptors: c.descriptors.map((d) => ({ level: d.level, ar: d.ar, en: d.en || '' })) })),
  });
}

export const transitionSchema = S({ to: str('', { enum: ['nominations', 'evaluation', 'cancelled'] }), confirm: bool() }, ['to']);
export function transitionProgram(user, id, body) {
  if (!isAdmin(user)) throw new Forbidden('إدارة مراحل البرنامج من صلاحية مسؤول برامج الجوائز');
  K.check(transitionSchema, body);
  const p = programRow(id);
  if (!p) throw new NotFound();
  K.transition(p.status, body.to, P_FLOW, P_STATUS);
  const t = now();
  if (body.to === 'nominations') {
    if (today() > p.nomination_closes) throw new Conflict('تاريخ إغلاق الترشيح قد مضى؛ حدّث التواريخ أولاً');
    checkStructure(categoriesOf(id), criteriaOf(id));
    run("UPDATE awards_programs SET status='nominations', updated_at=? WHERE id=?", t, id);
    K.audit(user, 'awards.program.open', id, {});
    K.changed(SYS, allStaffIds(), id);
    return getProgram(user, id);
  }
  if (body.to === 'evaluation') {
    const ready = one("SELECT COUNT(*) n FROM awards_nominations WHERE program_id=? AND status='submitted'", id).n;
    if (!ready) throw new Conflict('لا توجد ترشيحات مكتملة (بموافقة المرشحين) لبدء التقييم');
    K.requireConfirm(body, 'إغلاق باب الترشيح وبدء التقييم إجراء نهائي ويتطلب تأكيداً صريحاً');
    const lapsed = all("SELECT * FROM awards_nominations WHERE program_id=? AND status='awaiting_consent'", id);
    const moved = all("SELECT * FROM awards_nominations WHERE program_id=? AND status='submitted'", id);
    tx(() => {
      for (const n of moved) { run("UPDATE awards_nominations SET status='in_evaluation', updated_at=? WHERE id=?", t, n.id); event(n.id, user.id, 'evaluation'); }
      for (const n of lapsed) { run("UPDATE awards_nominations SET status='lapsed', updated_at=? WHERE id=?", t, n.id); event(n.id, null, 'lapsed'); }
      run("UPDATE awards_programs SET status='evaluation', updated_at=? WHERE id=?", t, id);
    });
    for (const n of lapsed) {
      K.alert(n.nominee_id, { title: `أُغلق باب الترشيح لـ«${p.name_ar}»`, body: 'انتهت مهلة الموافقة على الترشيح دون رد', system: SYS, id: n.id });
      K.alert(n.nominator_id, { title: `أُغلق باب الترشيح لـ«${p.name_ar}»`, body: 'لم يؤكد المرشح موافقته قبل الإغلاق', system: SYS, id: n.id });
    }
    for (const m of committeeMembers()) {
      const n = moved.filter((x) => !recusalOf({ id: m.id, department_id: m.department_id }, x)).length;
      if (n) K.alert(m.id, { title: `بدأ تقييم «${p.name_ar}»`, body: `لديك ${n === 1 ? 'ترشيح واحد' : n === 2 ? 'ترشيحان' : `${n} ${n <= 10 ? 'ترشيحات' : 'ترشيحاً'}`} للتقييم ضمن لجنة الجوائز`, system: SYS, id });
    }
    K.audit(user, 'awards.program.evaluate', id, { nominations: moved.length, lapsed: lapsed.length });
    K.changed(SYS, allStaffIds(), id);
    return getProgram(user, id);
  }
  // cancelled
  K.requireConfirm(body, 'إلغاء البرنامج إجراء نهائي ويتطلب تأكيداً صريحاً');
  run("UPDATE awards_programs SET status='cancelled', updated_at=? WHERE id=?", t, id);
  for (const n of all(`SELECT DISTINCT nominee_id, nominator_id FROM awards_nominations WHERE program_id=? AND status IN (${K.inList(ACTIVE)})`, id, ...ACTIVE)) {
    for (const uidTo of new Set([n.nominee_id, n.nominator_id])) K.alert(uidTo, { title: `أُلغي برنامج «${p.name_ar}»`, body: 'لن يُستكمل تقييم ترشيحات هذه الدورة', system: SYS, id });
  }
  K.audit(user, 'awards.program.cancel', id, {});
  K.changed(SYS, programRecipients(p), id);
  return getProgram(user, id);
}

// ---------------- nominations ----------------
const nominationRow = (id) => one('SELECT * FROM awards_nominations WHERE id=?', id);
const teamOf = (nid) => all('SELECT user_id, department_id FROM awards_team WHERE nomination_id=?', nid);
function event(nid, actor, action, at = now()) { run('INSERT INTO awards_events (id,nomination_id,actor_id,action,at) VALUES (?,?,?,?,?)', uid('awe_'), nid, actor, action, at); }

// Why a committee member must not evaluate a nomination (null = may evaluate).
export function recusalOf(member, n, team = teamOf(n.id)) {
  if (n.nominee_id === member.id || team.some((t) => t.user_id === member.id)) return 'self';
  if (n.nominator_id === member.id) return 'nominator';
  if (n.nominee_department_id === member.department_id || team.some((t) => t.department_id === member.department_id)) return 'department';
  if (one('SELECT 1 FROM awards_recusals WHERE nomination_id=? AND member_id=?', n.id, member.id)) return 'declared';
  return null;
}
const eligibleReviewers = (n, team = teamOf(n.id)) => committeeMembers().filter((m) => !recusalOf(m, n, team));

// Which view of a nomination this user has (null → it does not exist for them).
function viewOf(user, n, p, team = teamOf(n.id)) {
  if (!K.isStaff(user)) return null;
  if (n.nominee_id === user.id || team.some((t) => t.user_id === user.id)) return 'nominee';
  if (n.nominator_id === user.id) return 'nominator';
  if (['evaluation', 'announced'].includes(p.status) && EVALUATED.includes(n.status)) {
    if (isAdmin(user)) return 'admin';
    if (isMember(user)) return recusalOf(user, n, team) ? 'recused' : 'committee';
  }
  return null;
}
function load(user, id) {
  const n = nominationRow(id);
  if (!n) throw new NotFound();
  const p = programRow(n.program_id);
  const team = teamOf(n.id);
  const view = viewOf(user, n, p, team);
  if (!view) throw new NotFound();
  return { n, p, team, view };
}
function recipients(n, team = teamOf(n.id), p = programRow(n.program_id)) {
  const ids = [n.nominator_id, n.nominee_id, ...team.map((t) => t.user_id)];
  if (['evaluation', 'announced'].includes(p.status)) ids.push(...committeeMembers().map((m) => m.id));
  return ids;
}

function eligibilityError(p, u) {
  if (!u) return 'المرشَّح غير صالح: يجب أن يكون موظفاً في الجهة';
  if (u.role === 'president') return 'رئيس الجهة غير مشمول بالترشيح لبرامج الجوائز';
  if (p.eligibility === 'employees' && u.role !== 'employee') return 'هذه الجائزة مخصصة للموظفين غير الإداريين';
  if (p.eligibility === 'managers' && u.role !== 'manager') return 'هذه الجائزة مخصصة للقيادات (المديرين)';
  return null;
}

export function excellenceOf(user) {
  const g = G.profile(user);
  return {
    xp: g.xp, level: { n: g.level.n, ar: g.level.ar, en: g.level.en }, streak_best: g.streak.best,
    badges: g.badges.filter((b) => b.earned).map((b) => ({ key: b.key, icon: b.icon, ar: b.ar, en: b.en })).slice(0, 10), badges_total: g.badges.length, at: now(),
  };
}

export const nominationSchema = S({
  program_id: str(), category_id: str(), nominee_id: str('user id; omit to nominate yourself'),
  team_name: str('', { maxLength: 120 }), team_member_ids: arr(str(), { maxItems: 12 }),
  summary: str('', { maxLength: 300 }),
  justifications: arr(S({ criterion_id: str(), text: str('', { maxLength: 2000 }) }, ['criterion_id', 'text']), { maxItems: 8 }),
  evidence: arr(S({ title: str('', { maxLength: 200 }), link: str('', { maxLength: 500 }), note: str('', { maxLength: 500 }) }, ['title']), { maxItems: 10 }),
  attach_excellence: bool(),
}, ['program_id', 'category_id', 'summary', 'justifications']);

export function createNomination(user, body) {
  K.requireStaff(user);
  K.check(nominationSchema, body);
  const p = programRow(body.program_id);
  if (!p || p.status === 'draft') throw new NotFound('البرنامج غير موجود أو غير متاح');
  if (!phase(p).window_open) throw new Conflict('باب الترشيح لهذا البرنامج غير مفتوح حالياً');
  const cat = one('SELECT * FROM awards_categories WHERE id=? AND program_id=?', body.category_id, p.id);
  if (!cat) throw new BadRequest('الفئة غير صالحة لهذا البرنامج');
  const nomineeId = body.nominee_id || user.id;
  const nominee = staffRow(nomineeId);
  const self = nomineeId === user.id;
  const err = eligibilityError(p, nominee);
  if (err) throw new BadRequest(err);
  if (self && !p.allow_self) throw new BadRequest('هذا البرنامج لا يقبل الترشيح الذاتي');
  if (body.attach_excellence && !self) throw new Forbidden('يرفق ملخص نقاط التميّز صاحبه فقط عند موافقته على الترشيح');
  // team
  let team = [];
  if (p.eligibility === 'team') {
    const name = K.clean(body.team_name, 120);
    if (name.length < 3) throw new BadRequest('اكتب اسم الفريق');
    const ids = [...new Set([nomineeId, ...(body.team_member_ids || [])])];
    if (ids.length < 2) throw new BadRequest('الفريق يتكون من عضوين على الأقل');
    if (ids.length > 10) throw new BadRequest('الحد الأقصى 10 أعضاء في الفريق');
    for (const tid of ids) {
      const m = staffRow(tid);
      const e = eligibilityError(p, m);
      if (e) throw new BadRequest(`عضو فريق غير صالح: ${e}`);
      team.push({ user_id: m.id, department_id: m.department_id });
    }
  } else if (body.team_name || body.team_member_ids?.length) throw new BadRequest('بيانات الفريق متاحة لجوائز الفرق فقط');
  // content
  const summary = K.clean(body.summary, 300);
  if (summary.length < 10) throw new BadRequest('اكتب ملخصاً لا يقل عن 10 أحرف');
  const criteria = criteriaOf(p.id);
  const just = {};
  for (const j of body.justifications) {
    if (!criteria.some((c) => c.id === j.criterion_id)) throw new BadRequest('معيار غير موجود في هذا البرنامج');
    just[j.criterion_id] = K.clean(j.text, 2000);
  }
  for (const c of criteria) if ((just[c.id] || '').length < 20) throw new BadRequest(`اكتب مبرراً لا يقل عن 20 حرفاً لمعيار «${c.name_ar}»`);
  const evidence = (body.evidence || []).map((e) => ({ title: K.clean(e.title, 200), link: K.clean(e.link, 500), note: K.clean(e.note, 500) })).filter((e) => e.title);
  for (const e of evidence) if (e.link && !/^(https?:\/\/|#\/)/.test(e.link)) throw new BadRequest('رابط الدليل يجب أن يبدأ بـ https:// أو يكون رابطاً داخلياً في المنصة');
  // limits (own records only — never reveals other people's nominations)
  if (one(`SELECT 1 FROM awards_nominations WHERE program_id=? AND nominator_id=? AND nominee_id=? AND status IN (${K.inList(ACTIVE)})`, p.id, user.id, nomineeId, ...ACTIVE)) {
    throw new Conflict(self ? 'سبق أن رشّحت نفسك في هذا البرنامج' : 'سبق أن قدّمت ترشيحاً لهذا الزميل في هذا البرنامج');
  }
  if (one(`SELECT COUNT(*) n FROM awards_nominations WHERE program_id=? AND nominator_id=? AND status IN (${K.inList(ACTIVE)})`, p.id, user.id, ...ACTIVE).n >= MAX_NOMINATIONS_PER_NOMINATOR) {
    throw new Conflict(`الحد الأقصى ${MAX_NOMINATIONS_PER_NOMINATOR} ترشيحات لكل موظف في البرنامج الواحد`);
  }
  const kind = self ? 'self' : K.isManagerOf(user, nomineeId) ? 'manager' : 'colleague';
  const id = uid('awn_');
  const t = now();
  const excellence = self && body.attach_excellence ? excellenceOf(user) : null;
  tx(() => {
    run(`INSERT INTO awards_nominations (id,program_id,category_id,nominee_id,nominee_department_id,nominator_id,kind,team_name,summary,justifications,evidence,status,consent_at,excellence,excellence_at,created_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, p.id, cat.id, nomineeId, nominee.department_id, user.id, kind, team.length ? K.clean(body.team_name, 120) : null,
    summary, JSON.stringify(just), JSON.stringify(evidence), self ? 'submitted' : 'awaiting_consent', self ? t : null, excellence ? JSON.stringify(excellence) : null, excellence ? t : null, t);
    for (const m of team) run('INSERT INTO awards_team (nomination_id,user_id,department_id) VALUES (?,?,?)', id, m.user_id, m.department_id);
    event(id, user.id, 'created', t);
    if (self) event(id, user.id, 'consented', t);
  });
  if (!self) K.alert(nomineeId, { level: 'info', title: team.length ? `رُشّح فريقك لـ«${p.name_ar}»` : `رُشّحت لـ«${p.name_ar}»`, body: 'راجع الترشيح وأكّد موافقتك قبل إغلاق باب الترشيح', system: SYS, id });
  for (const m of team) if (m.user_id !== nomineeId && m.user_id !== user.id) K.alert(m.user_id, { title: `رُشّح فريقك لـ«${p.name_ar}»`, body: 'يؤكد قائد الفريق الموافقة على الترشيح', system: SYS, id });
  K.logAccess(user, SYS, 'nomination', id, 'create');
  K.audit(user, 'awards.nominate', id, { program: p.id, kind });
  K.changed(SYS, [user.id, nomineeId, ...team.map((m) => m.user_id)], id);
  return getNomination(user, id, { log: false });
}

function publicEvents(nid) {
  return all('SELECT e.action, e.at, e.actor_id FROM awards_events e WHERE e.nomination_id=? ORDER BY e.at, e.rowid', nid).map((e) => ({
    action: e.action, at: e.at,
    // committee-side actors are shown as the committee, never by name
    who: ['created', 'consented', 'declined', 'withdrawn', 'excellence'].includes(e.action) ? pub(e.actor_id) : null,
  }));
}
function myReview(user, nid) {
  const r = one('SELECT scores, weighted, comment, submitted_at, updated_at FROM awards_reviews WHERE nomination_id=? AND member_id=?', nid, user.id);
  return r ? { scores: json(r.scores, {}), weighted: r.weighted, comment: r.comment || '', submitted_at: r.submitted_at, updated_at: r.updated_at } : null;
}
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

function nominationView(user, n, p, team, view) {
  const cat = one('SELECT id,name_ar,name_en,description_ar,description_en FROM awards_categories WHERE id=?', n.category_id);
  const base = {
    id: n.id, view, status: n.status, kind: n.kind, created_at: n.created_at, is_demo: !!n.is_demo,
    program: { id: p.id, name_ar: p.name_ar, name_en: p.name_en, kind: p.kind, cycle: p.cycle, status: p.status, eligibility: p.eligibility,
      nomination_closes: p.nomination_closes, evaluation_closes: p.evaluation_closes, announce_on: p.announce_on, announced_at: p.announced_at, window_open: phase(p).window_open },
    category: cat, nominee: pub(n.nominee_id), team_name: n.team_name, team: team.map((t) => pub(t.user_id)),
  };
  if (view === 'recused') return { ...base, limited: true, recusal: recusalOf(user, n, team) };
  const criteria = criteriaOf(p.id);
  const just = json(n.justifications, {});
  const out = {
    ...base, nominator: pub(n.nominator_id), summary: n.summary,
    justifications: criteria.map((c) => ({ criterion_id: c.id, name_ar: c.name_ar, name_en: c.name_en, weight: c.weight, text: just[c.id] || '' })),
    evidence: json(n.evidence, []), consent_at: n.consent_at,
    result: ['winner', 'not_selected'].includes(n.status) && p.status === 'announced' ? { winner: n.status === 'winner', citation_ar: n.citation_ar, citation_en: n.citation_en, announced_at: p.announced_at } : null,
  };
  if (view === 'nominee' || view === 'nominator') out.timeline = publicEvents(n.id);
  if (view === 'nominee') {
    Object.assign(out, { excellence: json(n.excellence), excellence_at: n.excellence_at, consent_note: n.consent_note, decline_reason: n.decline_reason });
    const lead = n.nominee_id === user.id;
    out.can_consent = lead && n.status === 'awaiting_consent' && phase(p).window_open;
    out.can_attach_excellence = lead && n.status === 'submitted' && p.status === 'nominations';
    out.can_withdraw = p.status === 'nominations' && ((lead && n.status === 'submitted') || (n.nominator_id === user.id && ['awaiting_consent', 'submitted'].includes(n.status)));
  }
  if (view === 'nominator') out.can_withdraw = ['awaiting_consent', 'submitted'].includes(n.status) && p.status === 'nominations';
  if (view === 'committee' || view === 'admin') {
    const rec = recusalOf(user, n, team);
    Object.assign(out, {
      excellence: json(n.excellence), consent_note: n.consent_note, criteria,
      recusal: rec, review: rec ? null : myReview(user, n.id),
      can_review: !rec && p.status === 'evaluation' && n.status === 'in_evaluation',
      can_recuse: !rec && p.status === 'evaluation' && n.status === 'in_evaluation',
    });
  }
  if (view === 'admin') {
    const reviews = all('SELECT weighted FROM awards_reviews WHERE nomination_id=?', n.id);
    out.aggregate = { reviews: reviews.length, eligible: eligibleReviewers(n, team).length, average: reviews.length ? K.round(avg(reviews.map((r) => r.weighted)), 2) : null, final_score: n.final_score, final_rank: n.final_rank };
    out.access_log = K.accessLog(SYS, 'nomination', n.id, 30);
  }
  return out;
}

export function getNomination(user, id, { log = true } = {}) {
  const { n, p, team, view } = load(user, id);
  if (log) K.logAccess(user, SYS, 'nomination', id, 'view');
  return nominationView(user, n, p, team, view);
}

function brief(user, n, p) {
  const cat = one('SELECT id,name_ar,name_en FROM awards_categories WHERE id=?', n.category_id);
  const inTeam = n.nominee_id === user.id || !!one('SELECT 1 FROM awards_team WHERE nomination_id=? AND user_id=?', n.id, user.id);
  return {
    id: n.id, status: n.status, kind: n.kind, created_at: n.created_at, consent_at: n.consent_at, is_demo: !!n.is_demo, summary: n.summary,
    program: { id: p.id, name_ar: p.name_ar, name_en: p.name_en, kind: p.kind, cycle: p.cycle, status: p.status, nomination_closes: p.nomination_closes, announce_on: p.announce_on },
    category: cat, nominee: pub(n.nominee_id), nominator: pub(n.nominator_id), team_name: n.team_name,
    role: inTeam ? 'nominee' : 'nominator',
    can_consent: n.nominee_id === user.id && n.status === 'awaiting_consent' && phase(p).window_open,
  };
}

export function myNominations(user) {
  K.requireStaff(user);
  const rows = all(`SELECT n.* FROM awards_nominations n WHERE n.nominator_id=? OR n.nominee_id=? OR n.id IN (SELECT nomination_id FROM awards_team WHERE user_id=?)
    ORDER BY n.created_at DESC`, user.id, user.id, user.id);
  const progs = new Map();
  const list = rows.map((n) => { if (!progs.has(n.program_id)) progs.set(n.program_id, programRow(n.program_id)); return brief(user, n, progs.get(n.program_id)); });
  return {
    as_nominee: list.filter((x) => x.role === 'nominee'),
    as_nominator: list.filter((x) => x.role === 'nominator'),
    pending_consent: list.filter((x) => x.can_consent).length,
  };
}

export const consentSchema = S({ accept: bool(), note: str('', { maxLength: 500 }), attach_excellence: bool(), decline_reason: str('', { maxLength: 500 }) }, ['accept']);
export function consent(user, id, body) {
  K.check(consentSchema, body);
  const { n, p, team } = load(user, id);
  if (n.nominee_id !== user.id) throw new Forbidden('الموافقة على الترشيح من صلاحية المرشح نفسه فقط');
  K.transition(n.status, body.accept ? 'submitted' : 'declined', N_FLOW, N_STATUS);
  if (!phase(p).window_open) throw new Conflict('انتهت مدة الترشيح لهذا البرنامج');
  const t = now();
  if (body.accept) {
    const ex = body.attach_excellence ? excellenceOf(user) : null;
    run("UPDATE awards_nominations SET status='submitted', consent_at=?, consent_note=?, excellence=?, excellence_at=?, updated_at=? WHERE id=?",
      t, K.clean(body.note, 500) || null, ex ? JSON.stringify(ex) : null, ex ? t : null, t, id);
    event(id, user.id, 'consented', t);
    if (ex) event(id, user.id, 'excellence', t);
  } else {
    run("UPDATE awards_nominations SET status='declined', decline_reason=?, updated_at=? WHERE id=?", K.clean(body.decline_reason, 500) || null, t, id);
    event(id, user.id, 'declined', t);
  }
  K.alert(n.nominator_id, { title: `تحديث على ترشيحك لـ«${p.name_ar}»`, body: body.accept ? 'وافق المرشح على الترشيح' : 'اعتذر المرشح عن قبول الترشيح', system: SYS, id });
  K.logAccess(user, SYS, 'nomination', id, body.accept ? 'consent' : 'decline');
  K.audit(user, body.accept ? 'awards.consent' : 'awards.decline', id, {});
  K.changed(SYS, recipients(n, team, p), id);
  return getNomination(user, id, { log: false });
}

export const excellenceSchema = S({ attach: bool() }, ['attach']);
export function setExcellence(user, id, body) {
  K.check(excellenceSchema, body);
  const { n, p, team } = load(user, id);
  if (n.nominee_id !== user.id) throw new Forbidden('يرفق ملخص نقاط التميّز صاحبه فقط');
  if (n.status !== 'submitted' || p.status !== 'nominations') throw new Conflict('يمكن تحديث الملخص قبل إغلاق باب الترشيح فقط');
  const t = now();
  const ex = body.attach ? excellenceOf(user) : null;
  run('UPDATE awards_nominations SET excellence=?, excellence_at=?, updated_at=? WHERE id=?', ex ? JSON.stringify(ex) : null, ex ? t : null, t, id);
  event(id, user.id, body.attach ? 'excellence' : 'excellence_removed', t);
  K.logAccess(user, SYS, 'nomination', id, 'update');
  K.audit(user, 'awards.excellence', id, { attach: !!body.attach });
  K.changed(SYS, recipients(n, team, p), id);
  return getNomination(user, id, { log: false });
}

export const withdrawSchema = S({ confirm: bool() });
export function withdraw(user, id, body) {
  K.check(withdrawSchema, body);
  const { n, p, team } = load(user, id);
  const byNominator = n.nominator_id === user.id;
  const byNominee = n.nominee_id === user.id;
  if (!byNominator && !byNominee) throw new Forbidden('سحب الترشيح من صلاحية مقدّمه أو المرشح نفسه');
  if (p.status !== 'nominations') throw new Conflict('لا يمكن سحب الترشيح بعد إغلاق باب الترشيح');
  if (!byNominator && n.status === 'awaiting_consent') throw new Conflict('للرد على ترشيح بانتظار موافقتك استخدم «أعتذر»');
  K.transition(n.status, 'withdrawn', N_FLOW, N_STATUS);
  K.requireConfirm(body, 'سحب الترشيح نهائي ويتطلب تأكيداً صريحاً');
  const t = now();
  run("UPDATE awards_nominations SET status='withdrawn', withdrawn_by=?, updated_at=? WHERE id=?", user.id, t, id);
  event(id, user.id, 'withdrawn', t);
  const other = byNominator ? n.nominee_id : n.nominator_id;
  if (other !== user.id) K.alert(other, { title: `سُحب ترشيح في «${p.name_ar}»`, body: byNominator ? 'سحب مقدّم الترشيح ترشيحه' : 'سحب المرشح موافقته على الترشيح', system: SYS, id });
  K.logAccess(user, SYS, 'nomination', id, 'withdraw');
  K.audit(user, 'awards.withdraw', id, {});
  K.changed(SYS, recipients(n, team, p), id);
  return getNomination(user, id, { log: false });
}

// ---------------- committee ----------------
export function committeeQueue(user) {
  if (!isMember(user)) throw new Forbidden('قائمة التقييم متاحة لأعضاء لجنة الجوائز فقط');
  const programs = all("SELECT * FROM awards_programs WHERE status='evaluation' ORDER BY evaluation_closes, name_ar");
  const stats = { pending: 0, done: 0, recused: 0 };
  const out = programs.map((p) => {
    const cats = Object.fromEntries(categoriesOf(p.id).map((c) => [c.id, { id: c.id, name_ar: c.name_ar, name_en: c.name_en }]));
    const items = all("SELECT * FROM awards_nominations WHERE program_id=? AND status='in_evaluation' ORDER BY created_at", p.id).map((n) => {
      const team = teamOf(n.id);
      const rec = recusalOf(user, n, team);
      const r = rec ? null : myReview(user, n.id);
      if (rec) stats.recused++; else if (r) stats.done++; else stats.pending++;
      return {
        id: n.id, nominee: pub(n.nominee_id), team_name: n.team_name, team_size: team.length, category: cats[n.category_id], is_demo: !!n.is_demo,
        recusal: rec, summary: rec ? null : n.summary, kind: rec ? null : n.kind,
        my_review: r ? { weighted: r.weighted, submitted_at: r.submitted_at, updated_at: r.updated_at } : null,
      };
    });
    return { id: p.id, name_ar: p.name_ar, name_en: p.name_en, kind: p.kind, cycle: p.cycle, evaluation_closes: p.evaluation_closes, announce_on: p.announce_on, phase: phase(p), criteria_count: one('SELECT COUNT(*) n FROM awards_criteria WHERE program_id=?', p.id).n, items };
  });
  return { programs: out, stats, min_reviews: MIN_REVIEWS, is_admin: isAdmin(user) };
}

export const reviewSchema = S({
  scores: arr(S({ criterion_id: str(), score: int('', { minimum: 1, maximum: 5 }) }, ['criterion_id', 'score']), { maxItems: 8 }),
  comment: str('', { maxLength: 1500 }),
}, ['scores']);
export function saveReview(user, id, body) {
  K.check(reviewSchema, body);
  const { n, p, team } = load(user, id);
  if (!isMember(user)) throw new Forbidden('التقييم من صلاحية لجنة الجوائز فقط');
  const rec = recusalOf(user, n, team);
  if (rec) throw new Forbidden(`لا يمكنك تقييم هذا الترشيح: ${RECUSAL[rec][0]}`);
  if (p.status !== 'evaluation' || n.status !== 'in_evaluation') throw new Conflict('التقييم متاح أثناء مرحلة التقييم فقط');
  const criteria = criteriaOf(p.id);
  const scores = {};
  for (const s of body.scores) {
    if (!criteria.some((c) => c.id === s.criterion_id)) throw new BadRequest('معيار غير موجود في هذا البرنامج');
    if (scores[s.criterion_id] != null) throw new BadRequest('تكرار في درجة المعيار');
    scores[s.criterion_id] = s.score;
  }
  for (const c of criteria) if (scores[c.id] == null) throw new BadRequest(`امنح درجة لمعيار «${c.name_ar}»`);
  const weighted = K.round(criteria.reduce((a, c) => a + scores[c.id] * c.weight, 0) / criteria.reduce((a, c) => a + c.weight, 0), 3);
  const t = now();
  run(`INSERT INTO awards_reviews (id,nomination_id,member_id,scores,weighted,comment,submitted_at) VALUES (?,?,?,?,?,?,?)
    ON CONFLICT(nomination_id, member_id) DO UPDATE SET scores=excluded.scores, weighted=excluded.weighted, comment=excluded.comment, updated_at=?`,
  uid('awr_'), id, user.id, JSON.stringify(scores), weighted, K.clean(body.comment, 1500) || null, t, t);
  K.logAccess(user, SYS, 'nomination', id, 'review');
  K.audit(user, 'awards.review', id, {}); // never the scores
  K.changed(SYS, [user.id, ...adminIds()], id);
  return { ok: true, review: myReview(user, id), next: nextPending(user, p.id, id) };
}
function nextPending(user, programId, afterId) {
  const q = committeeQueue(user).programs;
  const all2 = [...q.filter((p) => p.id === programId), ...q.filter((p) => p.id !== programId)].flatMap((p) => p.items);
  return all2.find((x) => x.id !== afterId && !x.recusal && !x.my_review)?.id || null;
}

export const recuseSchema = S({ reason: str('', { maxLength: 500 }), confirm: bool() }, ['reason']);
export function declareRecusal(user, id, body) {
  K.check(recuseSchema, body);
  const { n, p, team } = load(user, id);
  if (!isMember(user)) throw new Forbidden('التنحي متاح لأعضاء لجنة الجوائز فقط');
  if (recusalOf(user, n, team)) throw new Conflict('أنت متنحٍّ عن تقييم هذا الترشيح مسبقاً');
  if (p.status !== 'evaluation' || n.status !== 'in_evaluation') throw new Conflict('التنحي متاح أثناء مرحلة التقييم فقط');
  const reason = K.clean(body.reason, 500);
  if (reason.length < 5) throw new BadRequest('اذكر سبب التنحي باختصار');
  K.requireConfirm(body, 'إعلان تعارض المصالح نهائي لهذا الترشيح ويحذف تقييمك إن وُجد');
  tx(() => {
    run('DELETE FROM awards_reviews WHERE nomination_id=? AND member_id=?', id, user.id);
    run('INSERT INTO awards_recusals (nomination_id,member_id,reason,at) VALUES (?,?,?,?)', id, user.id, reason, now());
  });
  K.logAccess(user, SYS, 'nomination', id, 'recuse');
  K.audit(user, 'awards.recuse', id, {});
  K.changed(SYS, [user.id, ...adminIds()], id);
  return { ok: true, next: nextPending(user, p.id, id) };
}

// ---- ranking & finalisation (awards.admin, the committee chair) ----
function rankingData(p) {
  const members = committeeMembers();
  const criteria = criteriaOf(p.id);
  const cats = categoriesOf(p.id);
  const noms = all(`SELECT * FROM awards_nominations WHERE program_id=? AND status IN (${K.inList(EVALUATED)}) ORDER BY created_at`, p.id, ...EVALUATED);
  const rows = noms.map((n) => {
    const team = teamOf(n.id);
    const reviews = all('SELECT member_id, scores, weighted, comment FROM awards_reviews WHERE nomination_id=?', n.id);
    const eligible = members.filter((m) => !recusalOf(m, n, team));
    const reviewed = new Set(reviews.map((r) => r.member_id));
    const recusals = members.map((m) => ({ m, r: recusalOf(m, n, team) })).filter((x) => x.r).map((x) => ({ member: { id: x.m.id, name_ar: x.m.name_ar, name_en: x.m.name_en }, reason: x.r }));
    const perCriterion = criteria.map((c) => ({ criterion_id: c.id, name_ar: c.name_ar, name_en: c.name_en, weight: c.weight, average: reviews.length ? K.round(avg(reviews.map((r) => json(r.scores, {})[c.id]).filter((x) => x != null)), 2) : null }));
    return {
      id: n.id, category_id: n.category_id, status: n.status, nominee: pub(n.nominee_id), team_name: n.team_name, team: team.map((t) => pub(t.user_id)), summary: n.summary, is_demo: !!n.is_demo,
      reviews: reviews.length, eligible: eligible.length, average: reviews.length ? K.round(avg(reviews.map((r) => r.weighted)), 3) : null,
      percent: reviews.length ? Math.round((avg(reviews.map((r) => r.weighted)) / 5) * 100) : null,
      complete: reviews.length >= MIN_REVIEWS, short_of_reviewers: eligible.length < MIN_REVIEWS,
      pending_reviewers: eligible.filter((m) => !reviewed.has(m.id)).map((m) => ({ id: m.id, name_ar: m.name_ar, name_en: m.name_en })),
      recusals, per_criterion: perCriterion, comments: reviews.map((r) => r.comment).filter(Boolean),
      final_score: n.final_score, final_rank: n.final_rank, citation_ar: n.citation_ar, citation_en: n.citation_en,
    };
  });
  const categories = cats.map((c) => {
    // quorum-complete nominations are ranked first; the rest wait for reviews (no rank yet)
    const list = rows.filter((r) => r.category_id === c.id).sort((a, b) => Number(b.complete) - Number(a.complete) || (b.average ?? -1) - (a.average ?? -1) || b.reviews - a.reviews || String(a.id).localeCompare(String(b.id)));
    let n = 0;
    list.forEach((r) => { r.rank = r.complete && r.average != null ? ++n : null; });
    const top = list.filter((r) => r.complete && r.average != null).slice(0, c.max_winners).map((r) => r.id);
    return { id: c.id, name_ar: c.name_ar, name_en: c.name_en, max_winners: c.max_winners, nominations: list, suggested: top };
  });
  const missing = rows.filter((r) => !r.complete).length;
  return { categories, missing, ready: rows.length > 0 && missing === 0, total: rows.length };
}

export function ranking(user, programId) {
  if (!isAdmin(user)) throw new Forbidden('الترتيب والاعتماد من صلاحية مسؤول برامج الجوائز');
  const p = programRow(programId);
  if (!p) throw new NotFound();
  if (!['evaluation', 'announced'].includes(p.status)) throw new Conflict('الترتيب متاح بعد بدء التقييم');
  K.logAccess(user, SYS, 'ranking', p.id, 'view');
  const conflicted = !!one(`SELECT 1 FROM awards_nominations n WHERE n.program_id=? AND n.status IN (${K.inList([...ACTIVE])}) AND (n.nominator_id=? OR n.nominee_id=? OR n.id IN (SELECT nomination_id FROM awards_team WHERE user_id=?))`, p.id, ...ACTIVE, user.id, user.id, user.id);
  const data = rankingData(p);
  // An admin who nominated or was nominated in this programme never sees scores,
  // ranks or committee notes (their own or anyone else's — the relative order
  // would reveal their own standing): coverage only.
  if (conflicted) {
    for (const c of data.categories) {
      c.suggested = [];
      for (const x of c.nominations) {
        Object.assign(x, { average: null, percent: null, rank: null, final_score: null, final_rank: null, comments: [], redacted: true });
        x.per_criterion = x.per_criterion.map((pc) => ({ ...pc, average: null }));
      }
    }
  }
  return { program: decorateProgram(user, p), ...data, min_reviews: MIN_REVIEWS, members: committeeMembers().map((m) => ({ id: m.id, name_ar: m.name_ar, name_en: m.name_en })), conflicted, redacted: conflicted, decision_note: p.decision_note };
}

export const finalizeSchema = S({
  winners: arr(S({ nomination_id: str(), citation_ar: str('', { maxLength: 400 }), citation_en: str('', { maxLength: 400 }) }, ['nomination_id']), { maxItems: 30 }),
  note: str('', { maxLength: 1000 }), confirm: bool(),
}, ['winners']);
export function finalize(user, programId, body) {
  if (!isAdmin(user)) throw new Forbidden('اعتماد الفائزين من صلاحية مسؤول برامج الجوائز');
  K.check(finalizeSchema, body);
  const p = programRow(programId);
  if (!p) throw new NotFound();
  if (p.status !== 'evaluation') throw new Conflict(`لا يمكن الاعتماد والبرنامج في حالة «${P_STATUS[p.status]}»`);
  // segregation of duties: nobody finalises a programme they nominated in or are nominated in
  if (one(`SELECT 1 FROM awards_nominations n WHERE n.program_id=? AND n.status IN (${K.inList(EVALUATED)}) AND (n.nominator_id=? OR n.nominee_id=? OR n.id IN (SELECT nomination_id FROM awards_team WHERE user_id=?))`, p.id, ...EVALUATED, user.id, user.id, user.id)) {
    throw new Forbidden('لا يمكنك اعتماد نتائج برنامج قدّمت فيه ترشيحاً أو رُشّحت فيه؛ يعتمدها مسؤول آخر');
  }
  const r = rankingData(p);
  if (!r.ready) throw new Conflict(`لا يمكن الاعتماد: ${r.missing === 1 ? 'ترشيح واحد لم يستكمل' : `${r.missing} ترشيحات لم تستكمل`} حدّ التقييمين على الأقل`);
  const byId = new Map(r.categories.flatMap((c) => c.nominations.map((x) => [x.id, { ...x, cat: c }])));
  const ids = [...new Set(body.winners.map((w) => w.nomination_id))];
  if (!ids.length) throw new BadRequest('اختر فائزاً واحداً على الأقل');
  if (ids.length !== body.winners.length) throw new BadRequest('تكرار في قائمة الفائزين');
  let override = false;
  const perCat = {};
  for (const w of body.winners) {
    const x = byId.get(w.nomination_id);
    if (!x) throw new BadRequest('ترشيح غير صالح ضمن هذا البرنامج');
    perCat[x.cat.id] = (perCat[x.cat.id] || 0) + 1;
    if (perCat[x.cat.id] > x.cat.max_winners) throw new BadRequest(`تجاوزت الحد الأقصى للفائزين في فئة «${x.cat.name_ar}»`);
    if (!x.cat.suggested.includes(x.id)) override = true;
  }
  const note = K.clean(body.note, 1000);
  if (override && note.length < 20) throw new BadRequest('اختيار فائز من خارج الترتيب الأعلى يتطلب مبرراً مكتوباً (20 حرفاً على الأقل)');
  K.requireConfirm(body, 'اعتماد الفائزين وإعلان النتائج إجراء نهائي ويتطلب تأكيداً صريحاً');
  const t = now();
  const winners = new Map(body.winners.map((w) => [w.nomination_id, w]));
  const all2 = r.categories.flatMap((c) => c.nominations);
  tx(() => {
    for (const x of all2) {
      const w = winners.get(x.id);
      const n = nominationRow(x.id);
      run('UPDATE awards_nominations SET status=?, final_score=?, final_rank=?, citation_ar=?, citation_en=?, decided_at=?, updated_at=? WHERE id=?',
        w ? 'winner' : 'not_selected', x.average, x.rank, w ? (K.clean(w.citation_ar, 400) || n.summary) : null, w ? (K.clean(w.citation_en, 400) || null) : null, t, t, x.id);
      event(x.id, user.id, w ? 'winner' : 'not_selected', t);
    }
    run("UPDATE awards_programs SET status='announced', announced_at=?, announced_by=?, decision_note=?, updated_at=? WHERE id=?", t, user.id, note || null, t, p.id);
  });
  const notified = new Set();
  for (const x of all2) {
    const n = nominationRow(x.id);
    const cat = r.categories.find((c) => c.id === n.category_id);
    const people = [n.nominee_id, ...teamOf(n.id).map((m) => m.user_id)];
    for (const pid of new Set(people)) {
      if (notified.has(pid)) continue; notified.add(pid);
      if (winners.has(n.id)) K.alert(pid, { title: `مبروك! فزت بـ«${p.name_ar}»`, body: `فئة «${cat.name_ar}» — شهادتك في قاعة التميّز`, system: SYS, id: n.id });
      else K.alert(pid, { title: `صدرت نتائج «${p.name_ar}»`, body: 'شكراً لمشاركتك — اطّلع على النتيجة في «ترشيحاتي»', system: SYS, id: n.id });
    }
    if (!notified.has(n.nominator_id)) { notified.add(n.nominator_id); K.alert(n.nominator_id, { title: `صدرت نتائج «${p.name_ar}»`, body: 'اطّلع على نتيجة ترشيحك في «ترشيحاتي»', system: SYS, id: n.id }); }
  }
  K.audit(user, 'awards.finalize', p.id, { winners: ids.length, override });
  K.changed(SYS, allStaffIds(), p.id);
  return { program: getProgram(user, p.id), winners: winnersList(user, { program_id: p.id }) };
}

// ---------------- public recognition (awards.public) ----------------
export function winnersList(user, { program_id, q } = {}) {
  K.requireStaff(user);
  const where = ["p.status='announced'", "n.status='winner'"]; const params = [];
  if (program_id) { where.push('p.id=?'); params.push(program_id); }
  if (q) { where.push('(p.name_ar LIKE ? OR p.name_en LIKE ? OR c.name_ar LIKE ? OR p.cycle LIKE ?)'); params.push(K.like(q), K.like(q), K.like(q), K.like(q)); }
  return all(`SELECT n.id, n.nominee_id, n.team_name, n.citation_ar, n.citation_en, n.is_demo, p.id pid, p.name_ar p_ar, p.name_en p_en, p.cycle, p.kind, p.announced_at,
      c.id cid, c.name_ar c_ar, c.name_en c_en, c.sort
    FROM awards_nominations n JOIN awards_programs p ON p.id=n.program_id JOIN awards_categories c ON c.id=n.category_id
    WHERE ${where.join(' AND ')} ORDER BY p.announced_at DESC, c.sort, n.final_rank`, ...params).map((r) => {
    const team = all('SELECT user_id FROM awards_team WHERE nomination_id=?', r.id).map((t) => pub(t.user_id));
    return {
      id: r.id, is_demo: !!r.is_demo,
      program: { id: r.pid, name_ar: r.p_ar, name_en: r.p_en, cycle: r.cycle, kind: r.kind, announced_at: r.announced_at },
      category: { id: r.cid, name_ar: r.c_ar, name_en: r.c_en },
      nominee: pub(r.nominee_id), team_name: r.team_name, team, citation_ar: r.citation_ar, citation_en: r.citation_en,
      mine: r.nominee_id === user.id || team.some((t) => t.id === user.id),
    };
  });
}
export function winner(user, id) {
  K.requireStaff(user);
  const w = winnersList(user).find((x) => x.id === id);
  if (!w) throw new NotFound();
  const p = programRow(w.program.id);
  return { ...w, announced_by: pub(p.announced_by) };
}
export function hall(user) {
  const winners = winnersList(user);
  const programs = [...new Map(winners.map((w) => [w.program.id, w.program])).values()];
  const people = new Set(winners.flatMap((w) => (w.team.length ? w.team.map((t) => t.id) : [w.nominee.id])));
  const depts = new Set(winners.flatMap((w) => (w.team.length ? w.team.map((t) => t.department_id) : [w.nominee.department_id])));
  return { winners, programs, stats: { winners: winners.length, people: people.size, departments: depts.size, programs: programs.length }, mine: winners.filter((w) => w.mine).map((w) => w.id) };
}

// ---------------- summary for the landing page ----------------
export function me(user) {
  K.requireStaff(user);
  const admin = isAdmin(user); const member = isMember(user);
  const mine = myNominations(user);
  const queue = member ? committeeQueue(user) : null;
  const open = listPrograms(user, { status: 'open' }).length;
  const announced = one("SELECT COUNT(*) n FROM awards_programs WHERE status='announced'").n;
  const pendingReviews = queue?.stats.pending || 0;
  const landing = member && pendingReviews ? 'committee' : mine.pending_consent ? 'mine' : admin || open ? 'programs' : announced ? 'hall' : 'programs';
  return {
    admin, member, pending_consent: mine.pending_consent, pending_reviews: pendingReviews, open_programs: open,
    my_nominations: mine.as_nominee.length + mine.as_nominator.length, my_wins: mine.as_nominee.filter((x) => x.status === 'winner' && x.program.status === 'announced').length,
    announced_programs: announced, landing, min_reviews: MIN_REVIEWS, max_per_nominator: MAX_NOMINATIONS_PER_NOMINATOR,
  };
}
