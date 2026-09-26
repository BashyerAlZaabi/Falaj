// Conflicts & Gifts — service layer. Every read and write is authorised here
// (the routes, workspace cards, game events and the procurement contract all go
// through these functions). Scopes:
//   discloser         → only their own declarations, disclosures, gifts, mitigations
//   compliance officer (integrity.officer) → everything; every view/change is logged
//   line manager      → only the minimal mitigation INSTRUCTIONS to enforce (no details)
//   president/officer → aggregates only (groups smaller than MIN_GROUP are hidden)
// HR, the platform admin flag and everyone else: no individual data.
import {
  one, all, run, uid, now, today, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, hasCap, lineManager, reportsOf, userBrief, staffUsers, usersWithCap, internalDepartments,
  logAccess, accessLog, changed, alert, audit, transition, clean, day, daysBetween, inList, requireConfirm, like,
} from '../kit.js';
import {
  KEY, MIN_GROUP, PROMPT_DAYS, RECENT_DAYS, DECL_STATUS, GIFT_STATUS, ALLOWED_DECISIONS,
  DECISION_LABEL, propose, policyRules, tokenLimit,
} from './model.js';

// ---------------- roles ----------------
export const isOfficer = (u) => isStaff(u) && hasCap(u, 'integrity.officer');
export const canSeeReports = (u) => isStaff(u) && (isOfficer(u) || u.role === 'president');
const officerIds = (except) => usersWithCap('integrity.officer').filter((id) => id !== except && one("SELECT 1 FROM users WHERE id=? AND user_type='staff'", id));
function requireOfficer(user) {
  if (!isOfficer(user)) throw new Forbidden('مراجعة الإفصاحات من صلاحية ضابط الامتثال فقط');
}
// Segregation of duties: nobody reviews or decides their own record.
function asReviewer(user, rec) {
  requireOfficer(user);
  if (rec.user_id === user.id) throw new Forbidden('لا يمكنك مراجعة إفصاحك بنفسك — يتطلب ذلك ضابط امتثال آخر');
}
// Staff whose NEAREST manager is this user (they are the one who must enforce instructions).
export function directReportIds(user) {
  if (!isStaff(user) || user.role === 'employee') return [];
  return reportsOf(user).filter((u) => lineManager(u.id) === user.id).map((u) => u.id);
}

// ---------------- lookups ----------------
const TABLE = { declaration: 'integrity_declarations', disclosure: 'integrity_disclosures', gift: 'integrity_gifts' };
const TYPE_LABEL = { declaration: 'الإقرار السنوي', disclosure: 'الإفصاح الطارئ', gift: 'الإفصاح عن الهدية' };
// Scope in SQL: the owner, or the compliance officer. Anyone else gets 404 (no existence leak).
function loadVisible(user, type, id) {
  const r = one(`SELECT * FROM ${TABLE[type]} WHERE id=? AND (user_id=? OR ?=1)`, String(id || ''), user.id, isOfficer(user) ? 1 : 0);
  if (!r) throw new NotFound('الإفصاح غير موجود أو غير متاح لك');
  return r;
}
function person(id) {
  const u = userBrief(id);
  return u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, department_id: u.department_id, dept_ar: u.dept_ar, dept_en: u.dept_en } : null;
}
export function providerOptions() {
  // Provider organisations known to the platform (external vendor organisations).
  return all("SELECT id,name_ar,name_en FROM departments WHERE is_external=1 AND id LIKE 'ext_v_%' ORDER BY name_ar");
}
const providerName = (id) => (id ? one('SELECT name_ar,name_en FROM departments WHERE id=? AND is_external=1', id) : null);
function providerRef(id) { const p = providerName(id); return p ? { id, name_ar: p.name_ar, name_en: p.name_en } : null; }
function checkProvider(id) {
  if (id && !providerOptions().some((p) => p.id === id)) throw new BadRequest('مقدّم الخدمة المحدد غير موجود في السجل');
  return id || null;
}
function event(refType, refId, actorId, action, note = null) {
  run('INSERT INTO integrity_events (id,ref_type,ref_id,actor_id,action,note,at) VALUES (?,?,?,?,?,?,?)', uid('ie_'), refType, refId, actorId, action, note ? clean(note, 1000) : null, now());
}
const eventsOf = (type, id) => all(`SELECT e.action,e.note,e.at,e.actor_id,u.name_ar,u.name_en FROM integrity_events e LEFT JOIN users u ON u.id=e.actor_id
  WHERE e.ref_type=? AND e.ref_id=? ORDER BY e.at`, type, id);
// Access log shown with a record: the officer sees every entry; the discloser sees who else looked.
function accessFor(user, type, rec) {
  const rows = accessLog(KEY, type, rec.id, 60);
  return rec.user_id === user.id ? rows.filter((r) => r.user_id !== user.id) : rows;
}
// Every officer view of someone else's record is logged.
function logView(user, type, rec) { if (rec.user_id !== user.id) logAccess(user, KEY, type, rec.id, 'view'); }

// ---------------- cycles ----------------
export function currentCycle() {
  return one("SELECT * FROM integrity_cycles WHERE status='open' ORDER BY year DESC LIMIT 1") || one('SELECT * FROM integrity_cycles ORDER BY year DESC LIMIT 1');
}
function cycleOut(c) {
  if (!c) return null;
  const left = daysBetween(today(), c.due_on);
  return { id: c.id, year: c.year, title_ar: c.title_ar, title_en: c.title_en, opens_on: c.opens_on, due_on: c.due_on, status: c.status, days_left: left, overdue: c.status === 'open' && left < 0, last_reminder_at: c.last_reminder_at, is_demo: !!c.is_demo };
}
export function createCycle(user, b) {
  requireOfficer(user);
  const year = b.year; const due = b.due_on; const opens = b.opens_on || today();
  if (due < opens) throw new BadRequest('يجب أن يكون الموعد النهائي بعد تاريخ فتح الدورة');
  if (one("SELECT 1 FROM integrity_cycles WHERE status='open'")) throw new Conflict('توجد دورة إقرار مفتوحة بالفعل؛ أغلقها أولاً');
  if (one('SELECT 1 FROM integrity_cycles WHERE year=?', year)) throw new Conflict(`توجد دورة لعام ${year} بالفعل`);
  const id = uid('icy_');
  run('INSERT INTO integrity_cycles (id,year,title_ar,title_en,opens_on,due_on,created_by) VALUES (?,?,?,?,?,?,?)', id, year, `الإقرار السنوي لتضارب المصالح ${year}`, `Annual conflict-of-interest declaration ${year}`, opens, due, user.id);
  audit(user, 'integrity.cycle_open', id, { year, due_on: due });
  changed(KEY, staffUsers().map((u) => u.id), id);
  return cycleOut(one('SELECT * FROM integrity_cycles WHERE id=?', id));
}
export function closeCycle(user, id, b) {
  requireOfficer(user);
  requireConfirm(b, 'إغلاق دورة الإقرار يمنع تقديم أي إقرار جديد فيها، ويتطلب تأكيداً صريحاً');
  const c = one('SELECT * FROM integrity_cycles WHERE id=?', id);
  if (!c) throw new NotFound('الدورة غير موجودة');
  transition(c.status, 'closed', { open: ['closed'] }, { open: 'مفتوحة', closed: 'مغلقة' });
  run("UPDATE integrity_cycles SET status='closed', closed_at=?, closed_by=? WHERE id=?", now(), user.id, id);
  audit(user, 'integrity.cycle_close', id, { year: c.year });
  changed(KEY, staffUsers().map((u) => u.id), id);
  return cycleOut(one('SELECT * FROM integrity_cycles WHERE id=?', id));
}
// Remind everyone who has not submitted (alerts go only to people who must act).
export function remindPending(user, id) {
  requireOfficer(user);
  const c = one('SELECT * FROM integrity_cycles WHERE id=?', id);
  if (!c) throw new NotFound('الدورة غير موجودة');
  if (c.status !== 'open') throw new Conflict('الدورة مغلقة');
  if (c.last_reminder_at && Date.now() - Date.parse(c.last_reminder_at) < 24 * 3600e3) throw new Conflict('أُرسل تذكير خلال آخر 24 ساعة؛ جرّب لاحقاً');
  const pending = pendingPeople(c);
  for (const p of pending) alert(p.id, { level: 'info', title: `تذكير: الإقرار السنوي ${c.year} مستحق في ${c.due_on}`, body: 'الإفصاح يحميك. أكمل إقرارك من نظام «الإفصاح والهدايا» — يستغرق دقيقتين.', system: KEY, id: c.id });
  run('UPDATE integrity_cycles SET last_reminder_at=? WHERE id=?', now(), id);
  audit(user, 'integrity.remind', id, { count: pending.length });
  return { reminded: pending.length };
}
function pendingPeople(c) {
  return staffUsers().filter((u) => !one("SELECT 1 FROM integrity_declarations WHERE cycle_id=? AND user_id=? AND status<>'draft'", c.id, u.id))
    .map((u) => ({ id: u.id, name_ar: u.name_ar, name_en: u.name_en, dept_ar: u.dept_ar, dept_en: u.dept_en, started: !!one('SELECT 1 FROM integrity_declarations WHERE cycle_id=? AND user_id=?', c.id, u.id) }));
}

// ---------------- shaping ----------------
const interestsOf = (declId) => all('SELECT id,kind,party_name,provider_id,details FROM integrity_interests WHERE declaration_id=? ORDER BY sort', declId)
  .map((i) => ({ ...i, provider: providerRef(i.provider_id) }));
function mitigationOut(m) {
  return { id: m.id, kind: m.kind, matter: m.matter, provider: providerRef(m.provider_id), instruction: m.instruction, manager_visible: !!m.manager_visible, status: m.status, created_at: m.created_at, acknowledged_at: m.acknowledged_at, lifted_at: m.lifted_at, lift_note: m.lift_note };
}
const mitigationsOf = (type, id) => all('SELECT * FROM integrity_mitigations WHERE source_type=? AND source_id=? ORDER BY created_at', type, id).map(mitigationOut);

function declOut(user, d, { detail = false } = {}) {
  const c = one('SELECT * FROM integrity_cycles WHERE id=?', d.cycle_id);
  const out = {
    type: 'declaration', id: d.id, status: d.status, own: d.user_id === user.id, person: person(d.user_id), cycle: cycleOut(c),
    no_conflict: d.no_conflict == null ? null : !!d.no_conflict, statement: d.statement || '', interests: interestsOf(d.id),
    submitted_at: d.submitted_at, review_started_at: d.review_started_at, decided_at: d.decided_at, outcome: d.outcome,
    decision_note: d.decision_note, return_note: d.return_note, closed_at: d.closed_at, updated_at: d.updated_at,
    on_time: d.submitted_at && c ? d.submitted_at.slice(0, 10) <= c.due_on : null,
    mitigations: mitigationsOf('declaration', d.id), is_demo: !!d.is_demo,
  };
  if (detail) { out.events = eventsOf('declaration', d.id); out.access_log = accessFor(user, 'declaration', d); }
  return out;
}
function discOut(user, x, { detail = false } = {}) {
  const out = {
    type: 'disclosure', id: x.id, status: x.status, own: x.user_id === user.id, person: person(x.user_id),
    matter: x.matter, related_party: x.related_party, provider: providerRef(x.provider_id), relationship: x.relationship || '',
    proposed_recusal: x.proposed_recusal || '', submitted_at: x.submitted_at, review_started_at: x.review_started_at,
    decided_at: x.decided_at, outcome: x.outcome, decision_note: x.decision_note, closed_at: x.closed_at,
    mitigations: mitigationsOf('disclosure', x.id), is_demo: !!x.is_demo,
  };
  if (detail) { out.events = eventsOf('disclosure', x.id); out.access_log = accessFor(user, 'disclosure', x); }
  return out;
}
function giftOut(user, g, { detail = false } = {}) {
  const p = propose(g);
  const out = {
    type: 'gift', id: g.id, status: g.status, own: g.user_id === user.id, person: person(g.user_id),
    giver_name: g.giver_name, giver_type: g.giver_type, provider: providerRef(g.provider_id), description: g.description,
    kind: g.kind, value_aed: g.value_aed, occasion: g.occasion || '', received_on: g.received_on,
    offered_only: !!g.offered_only, cash: !!g.cash, active_tender: !!g.active_tender,
    proposal: { decision: g.proposal, rule: g.proposal_rule, reason_ar: p.reason_ar, reason_en: p.reason_en },
    allowed_decisions: ALLOWED_DECISIONS[g.proposal_rule] || [],
    decision: g.decision, decided_at: g.decided_at, decision_note: g.decision_note, completed_at: g.completed_at,
    declared_at: g.created_at, days_to_declare: daysBetween(g.received_on, g.created_at), prompt: daysBetween(g.received_on, g.created_at) <= PROMPT_DAYS,
    is_demo: !!g.is_demo,
  };
  if (detail) { out.events = eventsOf('gift', g.id); out.access_log = accessFor(user, 'gift', g); }
  return out;
}

// ---------------- my overview (discloser) ----------------
export function roles(user) {
  const officer = isOfficer(user);
  const reports = directReportIds(user);
  const unack = reports.length ? one(`SELECT COUNT(*) n FROM integrity_mitigations WHERE status='active' AND manager_visible=1 AND acknowledged_at IS NULL AND user_id IN (${inList(reports)})`, ...reports).n : 0;
  const review = officer ? queueCounts(user) : null;
  const landing = officer ? 'review' : unack ? 'instructions' : user.role === 'president' ? 'reports' : 'mine';
  return { officer, line_manager: reports.length > 0, reports: canSeeReports(user), president: user.role === 'president', landing, counts: { review: review ? review.new + review.review : 0, instructions: unack } };
}
export function overview(user) {
  const cycle = currentCycle();
  const decl = cycle ? one('SELECT * FROM integrity_declarations WHERE cycle_id=? AND user_id=?', cycle.id, user.id) : null;
  return {
    cycle: cycleOut(cycle),
    declaration: decl ? declOut(user, decl, { detail: true }) : null,
    disclosures: all('SELECT * FROM integrity_disclosures WHERE user_id=? ORDER BY submitted_at DESC', user.id).map((x) => discOut(user, x)),
    gifts: all('SELECT * FROM integrity_gifts WHERE user_id=? ORDER BY received_on DESC, created_at DESC', user.id).map((g) => giftOut(user, g)),
    mitigations: all("SELECT * FROM integrity_mitigations WHERE user_id=? AND status='active' ORDER BY created_at DESC", user.id).map(mitigationOut),
    access_log: myAccessLog(user),
    roles: roles(user),
  };
}
// «من اطّلع على إفصاحي»: every access by someone else to any of my records.
export function myAccessLog(user, limit = 30) {
  return all(`SELECT a.user_id,a.action,a.at,a.record_type,u.name_ar,u.name_en FROM access_log a JOIN users u ON u.id=a.user_id
    WHERE a.system=? AND a.user_id<>? AND (
      (a.record_type='declaration' AND a.record_id IN (SELECT id FROM integrity_declarations WHERE user_id=?)) OR
      (a.record_type='disclosure' AND a.record_id IN (SELECT id FROM integrity_disclosures WHERE user_id=?)) OR
      (a.record_type='gift' AND a.record_id IN (SELECT id FROM integrity_gifts WHERE user_id=?)) OR
      (a.record_type='mitigation' AND a.record_id IN (SELECT id FROM integrity_mitigations WHERE user_id=?)))
    ORDER BY a.at DESC LIMIT ?`, KEY, user.id, user.id, user.id, user.id, user.id, limit);
}

// ---------------- annual declaration ----------------
function cleanInterests(list = []) {
  return list.map((i, k) => ({
    kind: i.kind, party_name: clean(i.party_name, 200), provider_id: checkProvider(i.provider_id), details: clean(i.details, 1000), sort: k,
  })).filter((i) => i.party_name);
}
export function saveDraft(user, b) {
  const c = currentCycle();
  if (!c || c.status !== 'open') throw new Conflict('لا توجد دورة إقرار مفتوحة حالياً');
  const interests = cleanInterests(b.interests || []);
  if (b.no_conflict === true && interests.length) throw new BadRequest('اخترت «لا يوجد تضارب» مع وجود مصالح مدرجة؛ احذف المصالح أو غيّر الاختيار');
  return tx(() => {
    let d = one('SELECT * FROM integrity_declarations WHERE cycle_id=? AND user_id=?', c.id, user.id);
    if (d && d.status !== 'draft') throw new Conflict('قُدّم الإقرار بالفعل ولا يمكن تعديله؛ تواصل مع ضابط الامتثال إن احتجت إلى تحديثه');
    const noConflict = b.no_conflict == null ? null : b.no_conflict ? 1 : 0;
    if (!d) {
      const id = uid('idc_');
      run('INSERT INTO integrity_declarations (id,cycle_id,user_id,no_conflict,statement) VALUES (?,?,?,?,?)', id, c.id, user.id, noConflict, clean(b.statement, 2000) || null);
      event('declaration', id, user.id, 'created');
      d = one('SELECT * FROM integrity_declarations WHERE id=?', id);
    } else {
      run('UPDATE integrity_declarations SET no_conflict=?, statement=?, updated_at=? WHERE id=?', noConflict, clean(b.statement, 2000) || null, now(), d.id);
    }
    run('DELETE FROM integrity_interests WHERE declaration_id=?', d.id);
    for (const i of interests) run('INSERT INTO integrity_interests (id,declaration_id,kind,party_name,provider_id,details,sort) VALUES (?,?,?,?,?,?,?)', uid('iin_'), d.id, i.kind, i.party_name, i.provider_id, i.details || null, i.sort);
    changed(KEY, [user.id], d.id);
    return declOut(user, one('SELECT * FROM integrity_declarations WHERE id=?', d.id), { detail: true });
  });
}
export function submitDeclaration(user, id, b) {
  const d = loadVisible(user, 'declaration', id);
  if (d.user_id !== user.id) throw new Forbidden('يقدّم الإقرار صاحبه فقط');
  const c = one('SELECT * FROM integrity_cycles WHERE id=?', d.cycle_id);
  if (c.status !== 'open') throw new Conflict('دورة الإقرار مغلقة');
  if (b.attest !== true) throw new BadRequest('يلزم الإقرار بصحة المعلومات واكتمالها قبل التقديم');
  transition(d.status, 'submitted', { draft: ['submitted'] }, DECL_LABELS);
  const n = one('SELECT COUNT(*) n FROM integrity_interests WHERE declaration_id=?', d.id).n;
  if (d.no_conflict == null || (!d.no_conflict && !n)) throw new BadRequest('أكمل الإقرار: اختر «لا يوجد تضارب» أو أضف المصالح التي تفصح عنها');
  const ts = now();
  run("UPDATE integrity_declarations SET status='submitted', submitted_at=?, first_submitted_at=COALESCE(first_submitted_at,?), attested_at=?, updated_at=? WHERE id=?", ts, ts, ts, ts, d.id);
  event('declaration', d.id, user.id, 'submitted');
  logAccess(user, KEY, 'declaration', d.id, 'submit');
  const officers = officerIds(user.id);
  for (const o of officers) alert(o, { title: `إقرار سنوي جديد بانتظار المراجعة (${c.year})`, body: 'افتح «المراجعة» في نظام الإفصاح والهدايا.', system: KEY, id: d.id });
  changed(KEY, [user.id, ...officers], d.id);
  return declOut(user, one('SELECT * FROM integrity_declarations WHERE id=?', d.id), { detail: true });
}
const DECL_LABELS = Object.fromEntries(Object.entries(DECL_STATUS).map(([k, v]) => [k, v[0]]));

export function getRecord(user, type, id) {
  const r = loadVisible(user, type, id);
  logView(user, type, r);
  if (type === 'declaration') return declOut(user, r, { detail: true });
  if (type === 'disclosure') return discOut(user, r, { detail: true });
  return giftOut(user, r, { detail: true });
}

// ---------------- ad-hoc disclosures ----------------
export function createDisclosure(user, b) {
  const id = uid('ids_');
  const ts = now();
  run('INSERT INTO integrity_disclosures (id,user_id,matter,related_party,provider_id,relationship,proposed_recusal,submitted_at) VALUES (?,?,?,?,?,?,?,?)',
    id, user.id, clean(b.matter, 300), clean(b.related_party, 200), checkProvider(b.provider_id), clean(b.relationship, 1000) || null, clean(b.proposed_recusal, 1000) || null, ts);
  event('disclosure', id, user.id, 'submitted');
  logAccess(user, KEY, 'disclosure', id, 'submit');
  const officers = officerIds(user.id);
  for (const o of officers) alert(o, { title: 'إفصاح طارئ جديد بانتظار المراجعة', body: 'افتح «المراجعة» في نظام الإفصاح والهدايا.', system: KEY, id });
  changed(KEY, [user.id, ...officers], id);
  return discOut(user, one('SELECT * FROM integrity_disclosures WHERE id=?', id), { detail: true });
}

// ---------------- review workflow (declarations & disclosures) ----------------
const CASE_FLOW = {
  start: { submitted: ['under_review'] },
  decide: { under_review: ['cleared', 'mitigation'] },
  close: { cleared: ['closed'], mitigation: ['closed'] },
  return: { submitted: ['draft'], under_review: ['draft'] },
};
function afterChange(user, type, rec, action, { ownerAlert, managers = [] } = {}) {
  logAccess(user, KEY, type, rec.id, action);
  if (ownerAlert) alert(rec.user_id, { title: ownerAlert, body: 'الاطلاع من «إفصاحاتي» في نظام الإفصاح والهدايا.', system: KEY, id: rec.id });
  changed(KEY, [rec.user_id, ...officerIds(null), ...managers], rec.id);
}
function reload(user, type, id) { return getShape(user, type, one(`SELECT * FROM ${TABLE[type]} WHERE id=?`, id)); }
const getShape = (user, type, r) => (type === 'declaration' ? declOut(user, r, { detail: true }) : type === 'disclosure' ? discOut(user, r, { detail: true }) : giftOut(user, r, { detail: true }));

export function startReview(user, type, id) {
  const r = loadVisible(user, type, id);
  asReviewer(user, r);
  transition(r.status, 'under_review', CASE_FLOW.start, DECL_LABELS);
  run(`UPDATE ${TABLE[type]} SET status='under_review', reviewer_id=?, review_started_at=? WHERE id=?`, user.id, now(), r.id);
  event(type, r.id, user.id, 'review_started');
  afterChange(user, type, r, 'start_review');
  return reload(user, type, r.id);
}
export function returnDeclaration(user, id, b) {
  const r = loadVisible(user, 'declaration', id);
  asReviewer(user, r);
  transition(r.status, 'draft', CASE_FLOW.return, DECL_LABELS);
  const note = clean(b.note, 1000);
  run("UPDATE integrity_declarations SET status='draft', return_note=?, updated_at=? WHERE id=?", note, now(), r.id);
  event('declaration', r.id, user.id, 'returned', note);
  afterChange(user, 'declaration', r, 'return', { ownerAlert: 'طلب ضابط الامتثال استيضاحاً بشأن إقرارك السنوي' });
  return reload(user, 'declaration', r.id);
}
export function decideCase(user, type, id, b) {
  const r = loadVisible(user, type, id);
  asReviewer(user, r);
  const mits = b.mitigations || [];
  if (b.outcome === 'mitigation' && !mits.length) throw new BadRequest('حدّد تعليمات التخفيف (تنحٍّ أو تخارج أو إعادة توزيع) قبل الاعتماد');
  if (b.outcome === 'cleared' && mits.length) throw new BadRequest('قرار «لا يلزم إجراء» لا يتضمن تعليمات تخفيف');
  transition(r.status, b.outcome, CASE_FLOW.decide, DECL_LABELS);
  const managerIds = new Set();
  tx(() => {
    run(`UPDATE ${TABLE[type]} SET status=?, outcome=?, decided_by=?, decided_at=?, decision_note=? WHERE id=?`, b.outcome, b.outcome, user.id, now(), clean(b.note, 1000) || null, r.id);
    for (const m of mits) {
      const visible = m.kind === 'recusal' || m.kind === 'reassignment' ? 1 : m.kind === 'divestment' ? 0 : m.notify_manager ? 1 : 0;
      const mid = uid('imt_');
      run('INSERT INTO integrity_mitigations (id,source_type,source_id,user_id,kind,matter,provider_id,instruction,manager_visible,created_by) VALUES (?,?,?,?,?,?,?,?,?,?)',
        mid, type, r.id, r.user_id, m.kind, clean(m.matter, 200), checkProvider(m.provider_id), clean(m.instruction, 240), visible, user.id);
      if (visible) { const mgr = lineManager(r.user_id); if (mgr) managerIds.add(mgr); }
    }
    event(type, r.id, user.id, b.outcome === 'cleared' ? 'cleared' : 'mitigation', b.note);
  });
  // The manager is told only that an instruction exists (details stay in the system).
  for (const mgr of managerIds) alert(mgr, { title: 'تعليمات امتثال جديدة لأحد أعضاء فريقك', body: 'افتح «التعليمات» في نظام الإفصاح والهدايا لتطبيقها.', system: KEY });
  afterChange(user, type, r, 'decide', { ownerAlert: b.outcome === 'cleared' ? `صدر قرار بشأن ${TYPE_LABEL[type]}: لا يلزم إجراء` : `صدر قرار بشأن ${TYPE_LABEL[type]} مع تعليمات يلزم الالتزام بها`, managers: [...managerIds] });
  return reload(user, type, r.id);
}
export function closeCase(user, type, id, b) {
  const r = loadVisible(user, type, id);
  asReviewer(user, r);
  transition(r.status, 'closed', CASE_FLOW.close, DECL_LABELS);
  run(`UPDATE ${TABLE[type]} SET status='closed', closed_at=? WHERE id=?`, now(), r.id);
  event(type, r.id, user.id, 'closed', b?.note);
  afterChange(user, type, r, 'close');
  return reload(user, type, r.id);
}

// ---------------- mitigations ----------------
export function liftMitigation(user, id, b) {
  requireOfficer(user);
  const m = one('SELECT * FROM integrity_mitigations WHERE id=?', String(id || ''));
  if (!m) throw new NotFound('التعليمات غير موجودة');
  if (m.user_id === user.id) throw new Forbidden('لا يمكنك رفع تعليمات تخصك — يتطلب ذلك ضابط امتثال آخر');
  requireConfirm(b, 'رفع تعليمات التنحي يعيد صلاحيات المشاركة للموظف ويتطلب تأكيداً صريحاً');
  transition(m.status, 'lifted', { active: ['lifted'] }, { active: 'سارية', lifted: 'مرفوعة' });
  run("UPDATE integrity_mitigations SET status='lifted', lifted_by=?, lifted_at=?, lift_note=? WHERE id=?", user.id, now(), clean(b.note, 500) || null, m.id);
  event(m.source_type, m.source_id, user.id, 'mitigation_lifted', b.note);
  logAccess(user, KEY, 'mitigation', m.id, 'lift');
  audit(user, 'integrity.mitigation_lift', m.id, { user_id: m.user_id, kind: m.kind });
  const mgr = m.manager_visible ? lineManager(m.user_id) : null;
  alert(m.user_id, { title: 'رُفعت إحدى تعليمات الامتثال الخاصة بك', body: 'الاطلاع من «إفصاحاتي».', system: KEY, id: m.source_id });
  if (mgr) alert(mgr, { title: 'رُفعت تعليمات امتثال لأحد أعضاء فريقك', body: 'راجع «التعليمات».', system: KEY });
  changed(KEY, [m.user_id, ...officerIds(null), mgr], m.id);
  return mitigationOut(one('SELECT * FROM integrity_mitigations WHERE id=?', m.id));
}
// Line manager's view: ONLY the instruction to enforce (never the declaration).
export function instructions(user) {
  const ids = directReportIds(user);
  if (!ids.length) return [];
  const rows = all(`SELECT m.id,m.user_id,m.kind,m.instruction,m.created_at,m.acknowledged_at,m.manager_seen_at FROM integrity_mitigations m
    WHERE m.status='active' AND m.manager_visible=1 AND m.user_id IN (${inList(ids)}) ORDER BY m.acknowledged_at IS NOT NULL, m.created_at DESC`, ...ids);
  for (const r of rows) if (!r.manager_seen_at) { run('UPDATE integrity_mitigations SET manager_seen_at=? WHERE id=?', now(), r.id); logAccess(user, KEY, 'mitigation', r.id, 'view'); }
  return rows.map((r) => { const p = person(r.user_id); return { id: r.id, person: p && { id: p.id, name_ar: p.name_ar, name_en: p.name_en, title_ar: p.title_ar, title_en: p.title_en, dept_ar: p.dept_ar, dept_en: p.dept_en }, kind: r.kind, instruction: r.instruction, text_ar: `${p?.name_ar}: ${r.instruction}`, since: r.created_at, acknowledged_at: r.acknowledged_at }; });
}
// Home card for line managers: who has an active instruction (names + kind only;
// the instruction itself is read — and logged — in the «التعليمات» tab).
export function instructionSummary(user) {
  const ids = directReportIds(user);
  if (!ids.length) return [];
  return all(`SELECT m.id,m.user_id,m.kind,m.acknowledged_at,u.name_ar,u.name_en FROM integrity_mitigations m JOIN users u ON u.id=m.user_id
    WHERE m.status='active' AND m.manager_visible=1 AND m.user_id IN (${inList(ids)}) ORDER BY m.acknowledged_at IS NOT NULL, m.created_at DESC`, ...ids);
}
export function acknowledge(user, id) {
  const ids = directReportIds(user);
  const m = ids.length ? one(`SELECT * FROM integrity_mitigations WHERE id=? AND manager_visible=1 AND user_id IN (${inList(ids)})`, String(id || ''), ...ids) : null;
  if (!m) throw new NotFound('التعليمات غير موجودة أو غير موجّهة إليك');
  if (m.status !== 'active') throw new Conflict('هذه التعليمات لم تعد سارية');
  if (m.acknowledged_at) throw new Conflict('سبق تأكيد تطبيق هذه التعليمات');
  run('UPDATE integrity_mitigations SET acknowledged_by=?, acknowledged_at=? WHERE id=?', user.id, now(), m.id);
  logAccess(user, KEY, 'mitigation', m.id, 'acknowledge');
  changed(KEY, [user.id, m.user_id, ...officerIds(null)], m.id);
  return instructions(user).find((x) => x.id === m.id) || { id: m.id, acknowledged_at: now() };
}

// ---------------- gifts ----------------
export function policy() {
  return { rules: policyRules(), token_limit: tokenLimit(), prompt_days: PROMPT_DAYS, decisions: DECISION_LABEL, providers: providerOptions() };
}
export function checkPolicy(b) { return propose({ value_aed: b.value_aed, cash: !!b.cash, active_tender: !!b.active_tender, kind: b.kind || 'gift' }); }
export function declareGift(user, b) {
  if (b.received_on > today()) throw new BadRequest('تاريخ الاستلام لا يمكن أن يكون في المستقبل');
  if (daysBetween(b.received_on, today()) > 365) throw new BadRequest('تاريخ الاستلام أقدم من سنة؛ تواصل مع ضابط الامتثال مباشرة');
  const g = { value_aed: b.value_aed, cash: b.cash ? 1 : 0, active_tender: b.active_tender ? 1 : 0, kind: b.kind || 'gift' };
  const p = propose(g);
  const id = uid('igf_');
  run(`INSERT INTO integrity_gifts (id,user_id,giver_name,giver_type,provider_id,description,kind,value_aed,occasion,received_on,offered_only,cash,active_tender,proposal,proposal_rule)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, user.id, clean(b.giver_name, 200), b.giver_type || 'organisation', checkProvider(b.provider_id), clean(b.description, 500),
  g.kind, b.value_aed, clean(b.occasion, 200) || null, b.received_on, b.offered_only ? 1 : 0, g.cash, g.active_tender, p.decision, p.rule);
  event('gift', id, user.id, 'declared');
  logAccess(user, KEY, 'gift', id, 'submit');
  const officers = officerIds(user.id);
  for (const o of officers) alert(o, { title: 'إفصاح عن هدية بانتظار القرار', body: 'افتح «المراجعة» في نظام الإفصاح والهدايا.', system: KEY, id });
  changed(KEY, [user.id, ...officers], id);
  return giftOut(user, one('SELECT * FROM integrity_gifts WHERE id=?', id), { detail: true });
}
export function decideGift(user, id, b) {
  const g = loadVisible(user, 'gift', id);
  asReviewer(user, g);
  transition(g.status, 'decided', { declared: ['decided'] }, { declared: GIFT_STATUS.declared[0], decided: GIFT_STATUS.decided[0], completed: GIFT_STATUS.completed[0] });
  const allowed = ALLOWED_DECISIONS[g.proposal_rule] || [];
  if (!allowed.includes(b.decision)) throw new Conflict(`القرار «${DECISION_LABEL[b.decision]?.[0] || b.decision}» يخالف سياسة الهدايا لهذه الحالة`);
  const note = clean(b.note, 1000);
  if (b.decision !== g.proposal && note.length < 5) throw new BadRequest('اذكر سبب اختلاف القرار عن المقترح');
  const status = b.decision === 'keep' ? 'completed' : 'decided';
  const ts = now();
  run('UPDATE integrity_gifts SET status=?, decision=?, decided_by=?, decided_at=?, decision_note=?, completed_at=? WHERE id=?', status, b.decision, user.id, ts, note || null, status === 'completed' ? ts : null, g.id);
  event('gift', g.id, user.id, `decision_${b.decision}`, note);
  afterChange(user, 'gift', g, 'decide', { ownerAlert: b.decision === 'keep' ? 'اعتُمد الإفصاح عن هديتك: يمكنك الاحتفاظ بها' : `صدر قرار بشأن الهدية المُفصح عنها: ${DECISION_LABEL[b.decision][0]}` });
  return reload(user, 'gift', g.id);
}
export function completeGift(user, id, b) {
  const g = loadVisible(user, 'gift', id);
  if (g.user_id !== user.id) throw new Forbidden('يؤكد تنفيذ القرار صاحب الإفصاح فقط');
  transition(g.status, 'completed', { decided: ['completed'] }, { declared: GIFT_STATUS.declared[0], decided: GIFT_STATUS.decided[0], completed: GIFT_STATUS.completed[0] });
  run("UPDATE integrity_gifts SET status='completed', completed_at=? WHERE id=?", now(), g.id);
  event('gift', g.id, user.id, 'completed', b?.note);
  logAccess(user, KEY, 'gift', g.id, 'complete');
  changed(KEY, [user.id, ...officerIds(null)], g.id);
  return reload(user, 'gift', g.id);
}

// ---------------- officer queue ----------------
const COLUMN = { submitted: 'new', declared: 'new', under_review: 'review', mitigation: 'followup', decided: 'followup', cleared: 'done', closed: 'done', completed: 'done' };
export function queueCounts(user) {
  if (!isOfficer(user)) return null;
  // actionable work only: the officer's own records need another reviewer
  const n = (sql) => one(sql, user.id).n;
  return {
    new: n("SELECT COUNT(*) n FROM integrity_declarations WHERE status='submitted' AND user_id<>?") + n("SELECT COUNT(*) n FROM integrity_disclosures WHERE status='submitted' AND user_id<>?") + n("SELECT COUNT(*) n FROM integrity_gifts WHERE status='declared' AND user_id<>?"),
    review: n("SELECT COUNT(*) n FROM integrity_declarations WHERE status='under_review' AND user_id<>?") + n("SELECT COUNT(*) n FROM integrity_disclosures WHERE status='under_review' AND user_id<>?"),
    gifts: n("SELECT COUNT(*) n FROM integrity_gifts WHERE status='declared' AND user_id<>?"),
    mitigations: one("SELECT COUNT(*) n FROM integrity_mitigations WHERE status='active'").n,
  };
}
export function queue(user, { type = 'all', q = '' } = {}) {
  requireOfficer(user);
  const since = day(-RECENT_DAYS);
  const nameSql = q ? ' AND (u.name_ar LIKE ? OR u.name_en LIKE ?)' : '';
  const nameP = q ? [like(q), like(q)] : [];
  const items = [];
  const base = (r, t) => ({ ref: `${t}:${r.id}`, type: t, id: r.id, status: r.status, column: COLUMN[r.status], own: r.user_id === user.id, is_demo: !!r.is_demo,
    person: { id: r.user_id, name_ar: r.name_ar, name_en: r.name_en, dept_ar: r.dept_ar, dept_en: r.dept_en } });
  // open work always; finished work only when it finished in the last RECENT_DAYS days
  const recentCase = "(x.status NOT IN ('cleared','closed') OR COALESCE(x.closed_at, x.decided_at, '') >= ?)";
  const recentGift = "(x.status <> 'completed' OR COALESCE(x.completed_at, x.decided_at, '') >= ?)";
  if (type === 'all' || type === 'declaration') {
    for (const r of all(`SELECT x.*, c.year, u.name_ar, u.name_en, d.name_ar dept_ar, d.name_en dept_en,
        (SELECT COUNT(*) FROM integrity_interests i WHERE i.declaration_id=x.id) n_int,
        (SELECT COUNT(*) FROM integrity_interests i WHERE i.declaration_id=x.id AND (i.kind='provider' OR i.provider_id IS NOT NULL)) n_prov
      FROM integrity_declarations x JOIN integrity_cycles c ON c.id=x.cycle_id JOIN users u ON u.id=x.user_id JOIN departments d ON d.id=u.department_id
      WHERE x.status<>'draft' AND ${recentCase}${nameSql} ORDER BY x.submitted_at`, since, ...nameP)) {
      items.push({ ...base(r, 'declaration'), title_ar: `الإقرار السنوي ${r.year}`, title_en: `Annual declaration ${r.year}`, at: r.submitted_at,
        flags: [r.no_conflict ? 'no_conflict' : `interests:${r.n_int}`, r.n_prov ? 'provider' : null].filter(Boolean) });
    }
  }
  if (type === 'all' || type === 'disclosure') {
    for (const r of all(`SELECT x.*, u.name_ar, u.name_en, d.name_ar dept_ar, d.name_en dept_en FROM integrity_disclosures x JOIN users u ON u.id=x.user_id JOIN departments d ON d.id=u.department_id
      WHERE ${recentCase}${nameSql} ORDER BY x.submitted_at`, since, ...nameP)) {
      items.push({ ...base(r, 'disclosure'), title_ar: 'إفصاح طارئ', title_en: 'Ad-hoc disclosure', at: r.submitted_at, flags: [r.provider_id ? 'provider' : null].filter(Boolean) });
    }
  }
  if (type === 'all' || type === 'gift') {
    for (const r of all(`SELECT x.*, u.name_ar, u.name_en, d.name_ar dept_ar, d.name_en dept_en FROM integrity_gifts x JOIN users u ON u.id=x.user_id JOIN departments d ON d.id=u.department_id
      WHERE ${recentGift}${nameSql} ORDER BY x.created_at`, since, ...nameP)) {
      items.push({ ...base(r, 'gift'), title_ar: 'إفصاح عن هدية', title_en: 'Gift declaration', at: r.created_at, value_aed: r.value_aed, proposal: r.proposal,
        flags: [r.cash ? 'cash' : null, r.active_tender ? 'tender' : null, r.provider_id ? 'provider' : null, r.value_aed > tokenLimit() ? 'over_limit' : null].filter(Boolean) });
    }
  }
  const c = currentCycle();
  return {
    items, counts: queueCounts(user), cycle: cycleOut(c), staff: staffUsers().length,
    pending: c && c.status === 'open' ? pendingPeople(c) : [],
  };
}

// ---------------- aggregates (officer + president) ----------------
export function reports(user) {
  if (!canSeeReports(user)) throw new Forbidden('التقارير المجمّعة متاحة لضابط الامتثال والرئيس فقط');
  const c = currentCycle();
  const staff = staffUsers();
  const submittedIds = new Set(c ? all("SELECT user_id FROM integrity_declarations WHERE cycle_id=? AND status<>'draft'", c.id).map((r) => r.user_id) : []);
  const onTime = c ? one("SELECT COUNT(*) n FROM integrity_declarations WHERE cycle_id=? AND status<>'draft' AND substr(submitted_at,1,10)<=?", c.id, c.due_on).n : 0;
  const byDept = new Map();
  for (const u of staff) { const e = byDept.get(u.department_id) || { staff: 0, submitted: 0 }; e.staff++; if (submittedIds.has(u.id)) e.submitted++; byDept.set(u.department_id, e); }
  const rows = []; const pool = { staff: 0, submitted: 0, count: 0 };
  for (const d of internalDepartments()) {
    const e = byDept.get(d.id); if (!e) continue;
    if (e.staff >= MIN_GROUP) rows.push({ id: d.id, name_ar: d.name_ar, name_en: d.name_en, staff: e.staff, submitted: e.submitted, rate: Math.round((e.submitted / e.staff) * 100), hidden: false });
    else { rows.push({ id: d.id, name_ar: d.name_ar, name_en: d.name_en, staff: null, submitted: null, rate: null, hidden: true }); pool.staff += e.staff; pool.submitted += e.submitted; pool.count++; }
  }
  const poolRow = pool.count ? (pool.staff >= MIN_GROUP
    ? { pooled: true, departments: pool.count, staff: pool.staff, submitted: pool.submitted, rate: Math.round((pool.submitted / pool.staff) * 100), hidden: false }
    : { pooled: true, departments: pool.count, staff: null, submitted: null, rate: null, hidden: true }) : null;
  // If the pooled group itself is too small, the organisation total would reveal it by difference.
  const orgHidden = !!poolRow?.hidden;
  const total = staff.length; const submitted = orgHidden ? null : [...submittedIds].filter((id) => staff.some((u) => u.id === id)).length;
  const status = c ? Object.fromEntries(all('SELECT status, COUNT(*) n FROM integrity_declarations WHERE cycle_id=? GROUP BY status', c.id).map((r) => [r.status, r.n])) : {};
  const outcomes = { pending: (status.submitted || 0) + (status.under_review || 0), cleared: status.cleared || 0, mitigation: status.mitigation || 0, closed: status.closed || 0, draft: status.draft || 0 };
  // weekly cumulative submissions across the cycle (organisation-wide only)
  const weeks = [];
  if (c && !orgHidden) {
    const start = c.opens_on; const end = c.status === 'open' ? today() : c.due_on;
    for (let d = start; d <= end; d = day(7, new Date(`${d}T12:00:00Z`))) weeks.push({ week_of: d, cumulative: one("SELECT COUNT(*) n FROM integrity_declarations WHERE cycle_id=? AND status<>'draft' AND substr(submitted_at,1,10)<=?", c.id, day(6, new Date(`${d}T12:00:00Z`))).n });
  }
  const year = String(new Date().getUTCFullYear());
  const gifts = one("SELECT COUNT(*) n, COALESCE(SUM(value_aed),0) v FROM integrity_gifts WHERE substr(received_on,1,4)=?", year);
  const byDecision = Object.fromEntries(all("SELECT COALESCE(decision,'pending') k, COUNT(*) n FROM integrity_gifts WHERE substr(received_on,1,4)=? GROUP BY k", year).map((r) => [r.k, r.n]));
  const prompt = one("SELECT COUNT(*) n FROM integrity_gifts WHERE substr(received_on,1,4)=? AND julianday(substr(created_at,1,10)) - julianday(received_on) <= ?", year, PROMPT_DAYS).n;
  return {
    cycle: cycleOut(c), min_group: MIN_GROUP,
    totals: { staff: total, submitted, rate: submitted == null || !total ? null : Math.round((submitted / total) * 100), on_time: orgHidden ? null : onTime, hidden: orgHidden },
    departments: rows, pooled: poolRow, outcomes,
    mitigations_active: one("SELECT COUNT(*) n FROM integrity_mitigations WHERE status='active'").n,
    disclosures: one("SELECT COUNT(*) n FROM integrity_disclosures WHERE substr(submitted_at,1,4)=?", year).n,
    weeks,
    gifts: { year: Number(year), count: gifts.n, value: gifts.v, by_decision: byDecision, prompt_rate: gifts.n ? Math.round((prompt / gifts.n) * 100) : null },
  };
}

// ---------------- procurement contract (server-side only) ----------------
// Provider-related interests a person has declared that are active (submitted and
// not superseded) or cleared with mitigation. Minimal fields — never details.
export function declaredConflicts(userId) {
  const out = [];
  // The person's latest annual declaration that has ever been submitted — across cycles,
  // so opening a new cycle does not wipe last year's declared conflicts before the new
  // declaration is filed, and a declaration returned for clarification (back to draft)
  // still counts: the conflict has been disclosed.
  const d = one(`SELECT d.id, d.status, d.outcome FROM integrity_declarations d JOIN integrity_cycles c ON c.id=d.cycle_id
    WHERE d.user_id=? AND COALESCE(d.first_submitted_at, d.submitted_at) IS NOT NULL ORDER BY c.year DESC LIMIT 1`, userId);
  if (d && (ACTIVE.includes(d.status) || (d.status === 'closed' && d.outcome === 'mitigation') || d.status === 'draft')) {
    for (const r of all("SELECT i.id, i.party_name, i.provider_id, i.kind FROM integrity_interests i WHERE i.declaration_id=? AND (i.kind='provider' OR i.provider_id IS NOT NULL) ORDER BY i.sort", d.id)) {
      out.push({ id: r.id, party_name: r.party_name, provider_id: r.provider_id || null, kind: r.kind, status: d.status === 'draft' ? 'pending_review' : statusOf(d.status) });
    }
  }
  for (const r of all(`SELECT x.id, x.related_party, x.provider_id, x.status FROM integrity_disclosures x WHERE x.user_id=? AND x.provider_id IS NOT NULL AND ${ACTIVE_CASE('x')} ORDER BY x.submitted_at`, userId)) {
    out.push({ id: r.id, party_name: r.related_party, provider_id: r.provider_id, kind: 'provider', status: statusOf(r.status) });
  }
  return out;
}
const ACTIVE = ['submitted', 'under_review', 'mitigation'];
// active = submitted and awaiting review; or decided with mitigation (still in force when closed)
const ACTIVE_CASE = (a) => `(${a}.status IN ('submitted','under_review','mitigation') OR (${a}.status='closed' AND ${a}.outcome='mitigation'))`;
const statusOf = (s) => (s === 'submitted' || s === 'under_review' ? 'pending_review' : 'mitigation');
export function recusalsFor(userId) {
  return all("SELECT matter, provider_id, instruction FROM integrity_mitigations WHERE user_id=? AND status='active' AND kind='recusal' ORDER BY created_at", userId)
    .map((r) => ({ matter: r.matter, provider_id: r.provider_id || null, instruction: r.instruction }));
}
