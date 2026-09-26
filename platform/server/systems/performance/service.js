// Performance Management — service layer. Every function takes the
// authenticated user and enforces authorization itself (the same functions back
// the REST routes, Ask AI tools, intents and Home workspace cards).
//
// Visibility (confidential domain):
//  - the employee sees their own review; the manager's draft assessment stays
//    hidden until it is submitted, calibration until results are released;
//  - the line manager (review.manager_id = kit.lineManager at creation) or the
//    manager of the employee's own department sees and assesses the review;
//  - HR (performance.hr) sees every review — each view is logged; HR sees only
//    submitted content (drafts belong to their author);
//  - the president sees aggregated distributions only, unless he is the line manager;
//  - everyone else gets 404; external identities never reach the system.
import {
  one, all, run, uid, now, today, tx, Forbidden, NotFound, BadRequest, Conflict,
  hasCap, isStaff, lineManager, userBrief, deptBrief, staffUsers, usersWithCap,
  audit, logAccess, accessLog, changed, alert, transition, requireCap, requireConfirm,
  check, S, str, int, bool, arr, date, clean, daysBetween, round, aiAllowed,
} from '../kit.js';
import * as M from './model.js';

const K = M.KEY;
export const isHR = (u) => isStaff(u) && hasCap(u, M.HR_CAP);
export const isPresident = (u) => isStaff(u) && u.role === 'president';

// ---------------- cycles ----------------
export const cycleRow = (id) => one('SELECT * FROM performance_cycles WHERE id=?', id);
export function currentCycle() {
  return one("SELECT * FROM performance_cycles WHERE phase<>'closed' ORDER BY year DESC, created_at DESC LIMIT 1")
    || one('SELECT * FROM performance_cycles ORDER BY year DESC, created_at DESC LIMIT 1');
}
export function resolveCycle(id) {
  if (!id || id === 'current') return currentCycle();
  const c = cycleRow(String(id));
  if (!c) throw new NotFound('دورة الأداء غير موجودة');
  return c;
}
export const phasesOf = (cycleId) => all('SELECT phase,starts_on,ends_on,opened_at FROM performance_phases WHERE cycle_id=?', cycleId)
  .sort((a, b) => M.phaseIndex(a.phase) - M.phaseIndex(b.phase));
export const phaseEnd = (cycleId, phase) => one('SELECT ends_on FROM performance_phases WHERE cycle_id=? AND phase=?', cycleId, phase)?.ends_on || null;
export function cycleView(c) {
  if (!c) return null;
  const phases = phasesOf(c.id);
  const cur = phases.find((p) => p.phase === c.phase);
  return {
    id: c.id, year: c.year, name_ar: c.name_ar, name_en: c.name_en, phase: c.phase, objectives_share: c.objectives_share,
    is_demo: !!c.is_demo, phases, deadline: cur?.ends_on || null, days_left: cur ? daysBetween(today(), cur.ends_on) : null,
    next_phase: M.NEXT_PHASE[c.phase]?.[0] || null, closed: c.phase === 'closed',
  };
}
export const listCycles = () => all('SELECT id,year,name_ar,name_en,phase,is_demo FROM performance_cycles ORDER BY year DESC, created_at DESC')
  .map((c) => ({ ...c, is_demo: !!c.is_demo }));
function requirePhase(c, phases, msg) {
  if (!phases.includes(c.phase)) throw new Conflict(`${msg} (المرحلة الحالية: «${M.phaseAr(c.phase)}»)`);
}

// ---------------- scope & relation ----------------
// SQL scope of reviews a user may see at all (lists, counts, detail, tools).
// The department-manager path covers the department's employees only: a fellow
// manager (or the president) of the same department is a peer, never an assessor —
// their review belongs to their own line manager (review.manager_id).
const PEER_SQL = (a) => `NOT EXISTS (SELECT 1 FROM users pe WHERE pe.id=${a}.employee_id AND pe.role IN ('manager','president'))`;
export function scopeSql(user, a = 'r') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  if (isHR(user)) return { sql: '1', params: [] };
  return {
    sql: `(${a}.employee_id=? OR (${a}.employee_id<>? AND (${a}.manager_id=? OR (?='manager' AND ${a}.department_id=? AND ${PEER_SQL(a)}))))`,
    params: [user.id, user.id, user.id, user.role, user.department_id],
  };
}
// Reviews this user assesses (line manager, or manager of the employee's department; never themselves or a peer manager).
export function teamSql(user, a = 'r') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  return { sql: `(${a}.employee_id<>? AND (${a}.manager_id=? OR (?='manager' AND ${a}.department_id=? AND ${PEER_SQL(a)})))`, params: [user.id, user.id, user.role, user.department_id] };
}
const isPeerManager = (employeeId) => !!one("SELECT 1 FROM users WHERE id=? AND role IN ('manager','president')", employeeId);
export function relation(user, r) {
  const own = r.employee_id === user.id;
  const mgr = !own && isStaff(user) && (r.manager_id === user.id || (user.role === 'manager' && user.department_id === r.department_id && !isPeerManager(r.employee_id)));
  const hr = !own && isHR(user);
  return { own, mgr, hr };
}
export function reviewRow(user, id) {
  const s = scopeSql(user);
  const r = one(`SELECT r.* FROM performance_reviews r WHERE r.id=? AND ${s.sql}`, String(id || ''), ...s.params);
  if (!r) throw new NotFound('المراجعة غير موجودة أو غير متاحة لك');
  return r;
}
// Everyone who may see this review (realtime refresh targets).
const deptManagersFor = (r) => (isPeerManager(r.employee_id) ? [] : all("SELECT id FROM users WHERE role='manager' AND department_id=? AND active=1 AND user_type='staff'", r.department_id).map((x) => x.id));
export function viewersOf(r) {
  const deptMgrs = deptManagersFor(r);
  return [...new Set([r.employee_id, r.manager_id, ...deptMgrs, ...usersWithCap(M.HR_CAP)].filter(Boolean))];
}
const managersOf = (r) => [...new Set([r.manager_id, ...deptManagersFor(r)].filter((u) => u && u !== r.employee_id))];
// Access log for the confidential domain. Views are de-duplicated for 10 minutes
// (live refreshes re-read the record); every change is always logged.
export function logView(user, reviewId, action = 'view') {
  const recent = one(`SELECT 1 FROM access_log WHERE user_id=? AND system=? AND record_type='review' AND record_id=? AND action=? AND at >= datetime('now','-10 minutes') LIMIT 1`, user.id, K, reviewId, action);
  if (!recent) logAccess(user, K, 'review', reviewId, action);
}
const logChange = (user, reviewId, action) => logAccess(user, K, 'review', reviewId, action);

// ---------------- objectives & scores ----------------
export const objectivesOf = (reviewId) => all('SELECT * FROM performance_objectives WHERE review_id=? ORDER BY sort, created_at', reviewId);
export function objectivesCheck(objs) {
  const total = objs.reduce((s, o) => s + (o.weight || 0), 0);
  return { count: objs.length, weight_total: total, ready: objs.length >= M.OBJ_MIN && objs.length <= M.OBJ_MAX && total === 100 && objs.every((o) => o.weight > 0) };
}
export function computeScores(objs, compRatings, share = M.DEFAULT_SHARE) {
  const wsum = objs.reduce((s, o) => s + (o.weight || 0), 0);
  const obj = objs.length && wsum > 0 && objs.every((o) => o.mgr_rating != null) ? objs.reduce((s, o) => s + o.weight * o.mgr_rating, 0) / wsum : null;
  const rated = compRatings.filter((c) => c.rating != null);
  const comp = rated.length ? rated.reduce((s, c) => s + c.rating, 0) / rated.length : null;
  const overall = obj != null && comp != null ? (share / 100) * obj + (1 - share / 100) * comp : null;
  const score = round(overall, 2);
  return { obj_score: round(obj, 2), comp_score: round(comp, 2), score, band: M.bandOf(score) };
}
const effectiveBand = (r) => r.final_band || (r.mgr_submitted_at ? r.band : null);
function rebalance(reviewId) {
  const objs = objectivesOf(reviewId);
  if (!objs.length) return;
  const base = Math.floor(100 / objs.length); let rest = 100 - base * objs.length;
  for (const o of objs) { run('UPDATE performance_objectives SET weight=?, updated_at=? WHERE id=?', base + (rest > 0 ? 1 : 0), now(), o.id); rest--; }
}
const touch = (id) => run('UPDATE performance_reviews SET updated_at=? WHERE id=?', now(), id);

// ---------------- abilities & next action ----------------
function managerPending(r, c) {
  const t = today();
  if (r.status === 'planning' && M.OBJECTIVE_PHASES.includes(c.phase)) return objectivesCheck(objectivesOf(r.id)).ready;
  if (c.phase === 'midyear' && ['planning', 'active'].includes(r.status) && !r.mid_mgr_note) return true;
  if (r.status === 'self_submitted' && M.ASSESS_PHASES.includes(c.phase)) return true;
  const selfEnd = phaseEnd(c.id, 'self_assessment');
  return r.status === 'active' && c.phase === 'manager_assessment' && !!selfEnd && t > selfEnd;
}
export function abilities(user, r, c, rel = relation(user, r)) {
  const ph = c.phase;
  const selfEnd = phaseEnd(c.id, 'self_assessment');
  const lateSelf = ph === 'manager_assessment' && !!selfEnd && today() > selfEnd;
  const objectivesOpen = r.status === 'planning' && M.OBJECTIVE_PHASES.includes(ph);
  const assess = rel.mgr && ['active', 'self_submitted'].includes(r.status) && M.ASSESS_PHASES.includes(ph);
  return {
    edit_objectives: (rel.own || rel.mgr) && objectivesOpen,
    agree: rel.mgr && objectivesOpen,
    reopen: rel.mgr && r.status === 'active' && M.REOPEN_PHASES.includes(ph),
    midyear: (rel.own || rel.mgr) && ph === 'midyear' && ['planning', 'active'].includes(r.status),
    self: rel.own && r.status === 'active' && M.ASSESS_PHASES.includes(ph),
    assess,
    submit_assessment: assess && (r.status === 'self_submitted' || lateSelf),
    calibrate: rel.hr && r.assessed_by !== user.id && ph === 'calibration' && r.status === 'assessed',
    acknowledge: rel.own && ph === 'acknowledgement' && r.status === 'assessed',
    resolve: rel.hr && r.assessed_by !== user.id && r.disagreement_status === 'open',
  };
}
const A = (key, ar, en, due = null, actionable = false) => ({ key, ar, en, due, actionable });
export function nextFor(user, r, c, rel, can, oc) {
  const due = (p) => phaseEnd(c.id, p);
  if (rel.own) {
    if (r.status === 'planning') {
      if (!can.edit_objectives) return A('objectives_closed', 'الأهداف لم تُعتمد — تواصل مع مديرك', 'Objectives not agreed — contact your manager');
      return oc.ready ? A('await_agree', 'أهدافك جاهزة وبانتظار اعتماد مديرك', 'Your objectives are ready and awaiting your manager’s agreement')
        : A('set_objectives', 'أكمل أهدافك: من 3 إلى 7 أهداف مجموع أوزانها 100', 'Complete your objectives: 3–7 with weights totalling 100', due(c.phase), true);
    }
    if (can.midyear && !r.mid_emp_note) return A('midyear', 'سجّل ملاحظاتك في المراجعة المرحلية', 'Add your mid-year check-in notes', due('midyear'), true);
    if (can.self) return A('self', 'أكمل تقييمك الذاتي وأرسله', 'Complete and submit your self-assessment', due('self_assessment'), true);
    if (r.status === 'active') {
      if (M.phaseIndex(c.phase) < M.phaseIndex('self_assessment')) return A('in_progress', 'أهدافك معتمدة — تابع إنجازها حتى مرحلة التقييم الذاتي', 'Objectives agreed — keep delivering until the self-assessment phase');
      return A('missed', 'لم يُرسل التقييم الذاتي ضمن نافذته', 'The self-assessment window has closed');
    }
    if (r.status === 'self_submitted') return A('await_manager', 'أرسلت تقييمك الذاتي — بانتظار تقييم مديرك', 'Self-assessment sent — waiting for your manager');
    if (can.acknowledge) return A('acknowledge', 'راجع نتيجتك النهائية وأقرّ بالاطلاع', 'Review your final result and acknowledge it', due('acknowledgement'), true);
    if (r.status === 'assessed') return M.RELEASED_PHASES.includes(c.phase) ? A('closed', 'أُغلقت الدورة', 'The cycle is closed')
      : A('await_calibration', 'تقييم مديرك متاح — تُعتمد النتيجة بعد المعايرة', 'Your manager’s assessment is available — final after calibration');
    return A('done', 'اكتملت مراجعتك لهذه الدورة', 'Your review for this cycle is complete');
  }
  if (rel.mgr) {
    if (r.status === 'planning') return can.agree && oc.ready ? A('agree', 'راجع الأهداف واعتمدها', 'Review and agree the objectives', due(c.phase), true)
      : A('objectives', 'الأهداف قيد الصياغة', 'Objectives being drafted');
    if (can.midyear && !r.mid_mgr_note) return A('midyear', 'سجّل ملاحظات المراجعة المرحلية', 'Add mid-year check-in notes', due('midyear'), true);
    if (can.submit_assessment) return A('assess', r.status === 'active' ? 'قيّم الأداء (دون تقييم ذاتي)' : 'قيّم الأداء وأرسل التقييم', r.status === 'active' ? 'Assess (no self-assessment received)' : 'Assess and submit', due('manager_assessment'), true);
    if (r.status === 'active') return can.assess ? A('await_self', 'بانتظار التقييم الذاتي', 'Waiting for the self-assessment') : A('in_progress', 'الأهداف معتمدة', 'Objectives agreed');
    if (r.status === 'self_submitted') return A('window_closed', 'انتهت نافذة التقييم', 'Assessment window closed');
    if (r.status === 'assessed') return A('assessed', c.phase === 'calibration' ? 'أُرسل التقييم — قيد المعايرة' : 'أُرسل التقييم', c.phase === 'calibration' ? 'Submitted — in calibration' : 'Assessment submitted');
    return A('done', 'اكتملت المراجعة', 'Review complete');
  }
  if (can.calibrate) return A('calibrate', 'بانتظار المعايرة', 'Awaiting calibration', due('calibration'), true);
  if (can.resolve) return A('resolve', 'ملاحظة اعتراض بانتظار الرد', 'Disagreement awaiting a response', null, true);
  const [ar, en] = M.STATUS_LABEL[r.status];
  return A('monitor', ar, en);
}

// ---------------- presentation (redacted per viewer) ----------------
const brief = (id) => { const u = userBrief(id); return u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, dept_ar: u.dept_ar, dept_en: u.dept_en, role: u.role } : null; };
const iso = (s) => (s && /^\d{4}-\d{2}-\d{2} \d/.test(s) ? `${s.replace(' ', 'T')}Z` : s || null);

export function present(user, r, { detail = false, c = cycleRow(r.cycle_id) } = {}) {
  const rel = relation(user, r);
  const released = M.RELEASED_PHASES.includes(c.phase);
  const showSelf = rel.own || !!r.self_submitted_at;           // self-assessment draft belongs to the employee
  const showMgr = rel.mgr || !!r.mgr_submitted_at;             // manager draft belongs to the managers
  const showCal = rel.hr || released;                          // calibration is released with the results
  const objs = objectivesOf(r.id);
  const oc = objectivesCheck(objs);
  const can = abilities(user, r, c, rel);
  const dept = deptBrief(r.department_id);
  const out = {
    id: r.id, cycle_id: r.cycle_id, status: r.status, is_demo: !!r.is_demo,
    relation: rel.own ? 'employee' : rel.mgr ? 'manager' : 'hr',
    employee: brief(r.employee_id), manager: brief(r.manager_id),
    department: dept ? { id: dept.id, name_ar: dept.name_ar, name_en: dept.name_en } : null,
    objectives_count: oc.count, weight_total: oc.weight_total, objectives_ready: oc.ready,
    objectives_agreed_at: r.objectives_agreed_at, self_submitted_at: r.self_submitted_at, mgr_submitted_at: r.mgr_submitted_at,
    no_self: !!r.no_self, ack_at: r.ack_at,
    self_visible: showSelf, assessment_visible: showMgr, calibration_visible: showCal, released,
    self_progress: showSelf ? objs.filter((o) => o.self_pct != null).length : null,
    rated_progress: showMgr ? objs.filter((o) => o.mgr_rating != null).length : null,
    next: nextFor(user, r, c, rel, can, oc), can,
  };
  if (rel.own) out.has_self_draft = !!r.self_saved_at && !r.self_submitted_at;
  if (rel.mgr) out.has_draft = !!r.mgr_saved_at && !r.mgr_submitted_at;
  if (showMgr) Object.assign(out, { obj_score: r.obj_score, comp_score: r.comp_score, score: r.score, band: r.band });
  if (showCal) Object.assign(out, { final_band: effectiveBand(r), calibrated: !!r.calibrated_at });
  if (rel.own || rel.hr) out.disagreement_status = r.disagreement_status;
  if (rel.hr) out.sod = { assessor: r.assessed_by === user.id };
  if (!detail) return out;

  out.cycle = cycleView(c);
  out.objectives = objs.map((o) => {
    const x = { id: o.id, title: o.title, measure: o.measure, weight: o.weight, source: o.source };
    if (showSelf) Object.assign(x, { self_pct: o.self_pct, self_note: o.self_note });
    if (showMgr) Object.assign(x, { mgr_rating: o.mgr_rating, mgr_note: o.mgr_note });
    return x;
  });
  out.competencies = M.competencies();
  out.comp_ratings = showMgr ? all('SELECT competency_id, rating, note FROM performance_comp_ratings WHERE review_id=?', r.id) : [];
  out.midyear = { employee_note: r.mid_emp_note, employee_at: r.mid_emp_at, manager_note: r.mid_mgr_note, manager_at: r.mid_mgr_at, manager_by: brief(r.mid_mgr_by) };
  if (showSelf) out.self_comment = r.self_comment;
  if (showMgr) { out.mgr_comment = r.mgr_comment; out.assessed_by = brief(r.assessed_by); }
  if (showCal) {
    out.calibration_note = r.calibration_note; out.calibrated_at = r.calibrated_at; out.calibrated_by = brief(r.calibrated_by);
    out.calibrations = all(`SELECT k.from_band, k.to_band, k.justification, k.at, u.name_ar, u.name_en FROM performance_calibrations k JOIN users u ON u.id=k.by_user WHERE k.review_id=? ORDER BY k.at DESC`, r.id);
  }
  if (rel.own || rel.hr) Object.assign(out, { disagreement: r.disagreement, hr_response: r.hr_response, hr_response_at: r.hr_response_at, hr_response_by: brief(r.hr_response_by) });
  if (rel.own || rel.hr) out.access_log = accessLog(K, 'review', r.id, 60).filter((x) => !(rel.own && x.user_id === user.id)).slice(0, 25).map((x) => ({ ...x, at: iso(x.at) }));
  out.timeline = timelineOf(r, { showCal, showPrivate: rel.own || rel.hr });
  return out;
}
function timelineOf(r, { showCal, showPrivate }) {
  const ev = [];
  const add = (at, ar, en, icon, tone, who) => { if (at) ev.push({ at: iso(at), ar, en, icon, tone, who: who ? brief(who) : null }); };
  add(r.created_at, 'فُتحت مراجعة الأداء', 'Review opened', 'circleDot');
  add(r.objectives_agreed_at, 'اعتُمدت الأهداف', 'Objectives agreed', 'target', 'good', r.objectives_agreed_by);
  add(r.mid_emp_at, 'ملاحظات الموظف في المراجعة المرحلية', 'Employee mid-year notes', 'messageSquare', null, r.employee_id);
  add(r.mid_mgr_at, 'ملاحظات المدير في المراجعة المرحلية', 'Manager mid-year notes', 'messageSquare', null, r.mid_mgr_by);
  add(r.self_submitted_at, 'أُرسل التقييم الذاتي', 'Self-assessment submitted', 'userCheck', 'good', r.employee_id);
  add(r.mgr_submitted_at, 'أُرسل تقييم المدير', 'Manager assessment submitted', 'clipboardCheck', 'good', r.assessed_by);
  if (showCal) add(r.calibrated_at, 'اعتُمدت المعايرة', 'Calibration confirmed', 'scale', 'emph', r.calibrated_by);
  add(r.ack_at, showPrivate && r.disagreement ? 'أقرّ الموظف بالاطلاع مع ملاحظة اعتراض' : 'أقرّ الموظف بالاطلاع', showPrivate && r.disagreement ? 'Acknowledged with a disagreement note' : 'Acknowledged', 'badgeCheck', 'good', r.employee_id);
  if (showPrivate) add(r.hr_response_at, 'ردّت الموارد البشرية على الملاحظة', 'HR responded to the note', 'reply', null, r.hr_response_by);
  return ev.sort((a, b) => String(a.at).localeCompare(String(b.at)));
}

// ---------------- reads ----------------
export function bootstrap(user) {
  const cur = currentCycle();
  const hr = isHR(user); const pres = isPresident(user);
  const ts = teamSql(user);
  const teamAll = one(`SELECT COUNT(*) n FROM performance_reviews r WHERE ${ts.sql}`, ...ts.params).n;
  const ownAll = one('SELECT COUNT(*) n FROM performance_reviews WHERE employee_id=?', user.id).n;
  let teamCur = 0; let pending = 0; let ownCur = null;
  if (cur) {
    const rows = all(`SELECT r.* FROM performance_reviews r WHERE r.cycle_id=? AND ${ts.sql}`, cur.id, ...ts.params);
    teamCur = rows.length; pending = rows.filter((r) => managerPending(r, cur)).length;
    ownCur = one('SELECT id FROM performance_reviews WHERE cycle_id=? AND employee_id=?', cur.id, user.id)?.id || null;
  }
  const landing = hr ? 'hr' : pres ? (pending ? 'team' : 'org') : teamCur ? 'team' : ownAll ? 'mine' : 'framework';
  return {
    cycles: listCycles(), current: cycleView(cur),
    me: { is_hr: hr, is_president: pres, has_review: ownAll > 0, current_review_id: ownCur, has_team: teamAll > 0, team_count: teamCur, pending_team: pending, landing },
  };
}

export function myReview(user, cycleId) {
  const c = resolveCycle(cycleId);
  const history = all(`SELECT r.*, c.name_ar cname_ar, c.name_en cname_en, c.year, c.phase FROM performance_reviews r JOIN performance_cycles c ON c.id=r.cycle_id WHERE r.employee_id=? ORDER BY c.year DESC`, user.id)
    .map((r) => ({ cycle_id: r.cycle_id, name_ar: r.cname_ar, name_en: r.cname_en, year: r.year, phase: r.phase, status: r.status,
      final_band: M.RELEASED_PHASES.includes(r.phase) ? effectiveBand(r) : null, current: c ? r.cycle_id === c.id : false }));
  if (!c) return { cycle: null, review: null, history };
  const row = one('SELECT * FROM performance_reviews WHERE cycle_id=? AND employee_id=?', c.id, user.id);
  if (row) logView(user, row.id);
  return { cycle: cycleView(c), review: row ? present(user, row, { detail: true, c }) : null, history };
}

export function reviewDetail(user, id) {
  const r = reviewRow(user, id);
  logView(user, r.id);
  return present(user, r, { detail: true });
}

export function teamList(user, cycleId) {
  const c = resolveCycle(cycleId);
  if (!c) return { cycle: null, reviews: [], stats: null };
  const ts = teamSql(user);
  const rows = all(`SELECT r.* FROM performance_reviews r JOIN users u ON u.id=r.employee_id WHERE r.cycle_id=? AND ${ts.sql} ORDER BY u.name_ar`, c.id, ...ts.params);
  for (const r of rows) logView(user, r.id, 'list');
  const reviews = rows.map((r) => present(user, r, { c }));
  const stats = {
    total: reviews.length,
    agreed: rows.filter((r) => r.status !== 'planning').length,
    self: rows.filter((r) => r.self_submitted_at).length,
    assessed: rows.filter((r) => r.mgr_submitted_at).length,
    acknowledged: rows.filter((r) => r.ack_at).length,
    pending: reviews.filter((r) => r.next.actionable).length,
    deadline: phaseEnd(c.id, 'manager_assessment'),
  };
  return { cycle: cycleView(c), reviews, stats };
}

function cycleRows(c) {
  return all(`SELECT r.*, u.name_ar, u.name_en FROM performance_reviews r JOIN users u ON u.id=r.employee_id WHERE r.cycle_id=? ORDER BY u.name_ar`, c.id);
}
function completion(rows) {
  const n = rows.length; const pct = (k) => (n ? Math.round((k / n) * 100) : null);
  const agreed = rows.filter((r) => r.status !== 'planning').length;
  const self = rows.filter((r) => r.self_submitted_at).length;
  const assessed = rows.filter((r) => r.mgr_submitted_at).length;
  const acknowledged = rows.filter((r) => r.ack_at).length;
  return { total: n, agreed, self, assessed, acknowledged, agreed_pct: pct(agreed), self_pct: pct(self), assessed_pct: pct(assessed), ack_pct: pct(acknowledged) };
}
// The completion metric that matters in each phase.
const PHASE_METRIC = { goal_setting: 'agreed_pct', midyear: 'agreed_pct', self_assessment: 'self_pct', manager_assessment: 'assessed_pct', calibration: 'assessed_pct', acknowledgement: 'ack_pct', closed: 'ack_pct' };
function distribution(rows) {
  const counted = rows.map(effectiveBand).filter(Boolean);
  return { n: counted.length, bands: M.BANDS.map((b) => ({ key: b.key, count: counted.filter((x) => x === b.key).length })) };
}
function byDepartment(rows) {
  const groups = new Map();
  for (const r of rows) { if (!groups.has(r.department_id)) groups.set(r.department_id, []); groups.get(r.department_id).push(r); }
  return [...groups].map(([id, rs]) => { const d = deptBrief(id); return { id, name_ar: d?.name_ar, name_en: d?.name_en, ...completion(rs) }; })
    .sort((a, b) => String(a.name_ar).localeCompare(String(b.name_ar), 'ar'));
}

export function hrOverview(user, cycleId) {
  requireCap(user, M.HR_CAP);
  const c = resolveCycle(cycleId);
  const openDisagreements = all(`SELECT r.id, r.cycle_id, r.ack_at, r.employee_id, u.name_ar, u.name_en, c.name_ar cname_ar, c.name_en cname_en FROM performance_reviews r
    JOIN users u ON u.id=r.employee_id JOIN performance_cycles c ON c.id=r.cycle_id WHERE r.disagreement_status='open' ORDER BY r.ack_at`)
    .map((x) => ({ id: x.id, cycle_id: x.cycle_id, at: x.ack_at, employee: { id: x.employee_id, name_ar: x.name_ar, name_en: x.name_en }, cycle_ar: x.cname_ar, cycle_en: x.cname_en, own: x.employee_id === user.id }));
  if (!c) return { cycle: null, stats: null, departments: [], distribution: null, reviews: [], disagreements: openDisagreements, advance: null };
  const rows = cycleRows(c);
  for (const r of rows) logView(user, r.id, 'list');
  const comp = completion(rows);
  const metric = PHASE_METRIC[c.phase];
  const next = M.NEXT_PHASE[c.phase]?.[0] || null;
  const advance = next ? {
    to: next,
    not_agreed: rows.filter((r) => r.status === 'planning').length,
    no_self: rows.filter((r) => r.status === 'active').length,
    not_assessed: rows.filter((r) => ['active', 'self_submitted'].includes(r.status)).length,
    not_calibrated: rows.filter((r) => r.status === 'assessed' && !r.calibrated_at).length,
    not_acknowledged: rows.filter((r) => r.status === 'assessed').length,
  } : null;
  return {
    cycle: cycleView(c),
    stats: { ...comp, metric, metric_pct: comp[metric], calibrated: rows.filter((r) => r.calibrated_at).length, adjusted: rows.filter((r) => r.final_band && r.final_band !== r.band).length, open_disagreements: rows.filter((r) => r.disagreement_status === 'open').length },
    departments: byDepartment(rows).map((d) => ({ ...d, metric_pct: d[metric] })),
    distribution: distribution(rows),
    reviews: rows.map((r) => present(user, r, { c })),
    disagreements: openDisagreements,
    advance,
  };
}

// Aggregated view for the president (and HR): no individual appears; the rating
// distribution is suppressed below the minimum group size.
export function insights(user, cycleId) {
  if (!isPresident(user) && !isHR(user)) throw new Forbidden('النظرة المجمّعة متاحة للرئيس والموارد البشرية فقط');
  const c = resolveCycle(cycleId);
  if (!c) return { cycle: null };
  const rows = cycleRows(c);
  const dist = distribution(rows);
  const prev = one("SELECT * FROM performance_cycles WHERE year<? AND phase='closed' ORDER BY year DESC LIMIT 1", c.year);
  const prevDist = prev ? distribution(cycleRows(prev)) : null;
  const safe = (d) => (d && d.n >= M.MIN_GROUP ? d : d ? { n: d.n, bands: null, suppressed: true } : null);
  return {
    cycle: cycleView(c), min_group: M.MIN_GROUP,
    completion: completion(rows), metric: PHASE_METRIC[c.phase],
    departments: byDepartment(rows).map((d) => ({ id: d.id, name_ar: d.name_ar, name_en: d.name_en, total: d.total, agreed_pct: d.agreed_pct, self_pct: d.self_pct, assessed_pct: d.assessed_pct, ack_pct: d.ack_pct })),
    distribution: safe(dist),
    previous: prev ? { cycle: { id: prev.id, year: prev.year, name_ar: prev.name_ar, name_en: prev.name_en }, distribution: safe(prevDist) } : null,
  };
}

export function framework() {
  const c = currentCycle();
  return { competencies: M.competencies(), bands: M.BANDS, scale: M.SCALE, objectives_share: c?.objectives_share ?? M.DEFAULT_SHARE, cycle: cycleView(c), min_objectives: M.OBJ_MIN, max_objectives: M.OBJ_MAX };
}

// ---------------- review writes ----------------
const OBJ_ITEM = S({ id: str('objective id', { maxLength: 40 }), title: str('objective title', { maxLength: 300 }), measure: str('measure / target', { maxLength: 600 }), weight: int('weight %', { minimum: 0, maximum: 100 }) }, ['title', 'weight']);
export const OBJECTIVES_BODY = S({ objectives: arr(OBJ_ITEM, { maxItems: M.OBJ_MAX }) }, ['objectives']);

function editable(user, r, c) {
  const rel = relation(user, r);
  if (!rel.own && !rel.mgr) throw new Forbidden('تحرير الأهداف متاح للموظف ومديره المباشر فقط');
  if (r.status !== 'planning') throw new Conflict('الأهداف معتمدة؛ يمكن للمدير إعادة فتحها خلال مرحلة تحديد الأهداف أو المراجعة المرحلية');
  requirePhase(c, M.OBJECTIVE_PHASES, 'تحرير الأهداف غير متاح في هذه المرحلة');
  return rel;
}

export function saveObjectives(user, id, body) {
  const b = check(OBJECTIVES_BODY, body);
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id);
  editable(user, r, c);
  const items = b.objectives.map((o) => ({ id: o.id || null, title: clean(o.title, 300), measure: clean(o.measure || '', 600), weight: o.weight }));
  if (items.some((o) => o.title.length < 3)) throw new BadRequest('عنوان كل هدف يجب ألا يقل عن 3 أحرف');
  const existing = objectivesOf(r.id); const known = new Set(existing.map((o) => o.id));
  if (items.some((o) => o.id && !known.has(o.id))) throw new BadRequest('أحد الأهداف لا ينتمي إلى هذه المراجعة');
  if (new Set(items.filter((o) => o.id).map((o) => o.id)).size !== items.filter((o) => o.id).length) throw new BadRequest('هدف مكرر');
  tx(() => {
    const keep = new Set(items.filter((o) => o.id).map((o) => o.id));
    for (const o of existing) if (!keep.has(o.id)) run('DELETE FROM performance_objectives WHERE id=?', o.id);
    items.forEach((o, i) => {
      if (o.id) run('UPDATE performance_objectives SET title=?, measure=?, weight=?, sort=?, updated_at=? WHERE id=? AND review_id=?', o.title, o.measure, o.weight, i, now(), o.id, r.id);
      else run('INSERT INTO performance_objectives (id,review_id,sort,title,measure,weight,source) VALUES (?,?,?,?,?,?,?)', uid('po_'), r.id, i, o.title, o.measure, o.weight, 'manual');
    });
    touch(r.id);
  });
  logChange(user, r.id, 'objectives');
  audit(user, 'performance.objectives', r.id, { count: items.length, total: items.reduce((s, o) => s + o.weight, 0) });
  changed(K, viewersOf(r), r.id);
  return present(user, reviewRow(user, id), { detail: true });
}

// Personal yearly goals (goals system) → objectives. The goals module is built
// separately; its absence is tolerated.
let goalsModP = null;
async function goalsForReviewFn() {
  goalsModP ||= import('../goals.js').catch(() => null);
  const m = await goalsModP;
  return typeof m?.goalsForReview === 'function' ? m.goalsForReview : null;
}
export function normalizeGoals(list) {
  if (!Array.isArray(list)) return [];
  return list.map((g) => ({
    ref: String(g?.id ?? g?.goal_id ?? g?.title ?? ''),
    title: clean(g?.title_ar || g?.title || g?.name_ar || g?.name || '', 300),
    measure: clean(g?.measure || g?.target || g?.kpi || g?.description || (g?.objective_code ? `مرتبط بالهدف الاستراتيجي ${g.objective_code}` : ''), 600),
    weight: Number.isInteger(g?.weight) && g.weight > 0 && g.weight <= 100 ? g.weight : null,
  })).filter((g) => g.ref && g.title.length >= 3);
}
export async function importGoals(user, id) {
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id);
  editable(user, r, c);
  const fn = await goalsForReviewFn();
  if (!fn) return { available: false, imported: 0, review: present(user, r, { detail: true }) };
  let goals = [];
  // The owner may import all their yearly goals; a manager only those the owner shared.
  try { goals = normalizeGoals(await fn(r.employee_id, c.year, { includePrivate: r.employee_id === user.id })); } catch (e) { console.error('[performance] goalsForReview:', e.message); return { available: false, imported: 0, review: present(user, r, { detail: true }) }; }
  const fresh = reviewRow(user, id); // re-read after the await
  if (fresh.status !== 'planning') throw new Conflict('تغيّرت حالة المراجعة أثناء الاستيراد');
  const existing = objectivesOf(r.id);
  const have = new Set(existing.filter((o) => o.source_ref).map((o) => o.source_ref));
  const add = goals.filter((g) => !have.has(g.ref)).slice(0, Math.max(0, M.OBJ_MAX - existing.length));
  if (add.length) {
    tx(() => {
      add.forEach((g, i) => run('INSERT INTO performance_objectives (id,review_id,sort,title,measure,weight,source,source_ref) VALUES (?,?,?,?,?,?,?,?)',
        uid('po_'), r.id, existing.length + i, g.title, g.measure, g.weight || 0, 'goals', g.ref));
      if (!objectivesCheck(objectivesOf(r.id)).ready) rebalance(r.id);
      touch(r.id);
    });
    logChange(user, r.id, 'objectives');
    audit(user, 'performance.import_goals', r.id, { imported: add.length });
    changed(K, viewersOf(r), r.id);
  }
  return { available: true, imported: add.length, found: goals.length, review: present(user, reviewRow(user, id), { detail: true }) };
}

export function agreeObjectives(user, id) {
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (rel.own) throw new Forbidden('لا يمكنك اعتماد أهدافك بنفسك — يعتمدها مديرك المباشر');
  if (!rel.mgr) throw new Forbidden('اعتماد الأهداف من صلاحية المدير المباشر');
  requirePhase(c, M.OBJECTIVE_PHASES, 'اعتماد الأهداف غير متاح في هذه المرحلة');
  const to = transition(r.status, 'active', M.REVIEW_FLOW, M.statusLabels);
  const oc = objectivesCheck(objectivesOf(r.id));
  if (!oc.ready) throw new Conflict(`يجب أن تكون الأهداف بين ${M.OBJ_MIN} و${M.OBJ_MAX} ومجموع أوزانها 100 (الحالي: ${oc.count} أهداف بمجموع ${oc.weight_total})`);
  run('UPDATE performance_reviews SET status=?, objectives_agreed_at=?, objectives_agreed_by=?, updated_at=? WHERE id=?', to, now(), user.id, now(), r.id);
  logChange(user, r.id, 'agree');
  audit(user, 'performance.agree_objectives', r.id, { count: oc.count });
  changed(K, viewersOf(r), r.id);
  return present(user, reviewRow(user, id), { detail: true });
}

export function reopenObjectives(user, id) {
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (!rel.mgr) throw new Forbidden('إعادة فتح الأهداف من صلاحية المدير المباشر');
  requirePhase(c, M.REOPEN_PHASES, 'إعادة فتح الأهداف متاحة في مرحلتي تحديد الأهداف والمراجعة المرحلية فقط');
  const to = transition(r.status, 'planning', M.REVIEW_FLOW, M.statusLabels);
  run('UPDATE performance_reviews SET status=?, objectives_agreed_at=NULL, objectives_agreed_by=NULL, updated_at=? WHERE id=?', to, now(), r.id);
  logChange(user, r.id, 'reopen');
  audit(user, 'performance.reopen_objectives', r.id);
  changed(K, viewersOf(r), r.id);
  return present(user, reviewRow(user, id), { detail: true });
}

export const MIDYEAR_BODY = S({ note: str('mid-year note', { maxLength: 3000 }) }, ['note']);
export function saveMidyear(user, id, body) {
  const b = check(MIDYEAR_BODY, body);
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (!rel.own && !rel.mgr) throw new Forbidden('ملاحظات المراجعة المرحلية للموظف ومديره فقط');
  requirePhase(c, ['midyear'], 'ملاحظات المراجعة المرحلية متاحة في مرحلتها فقط');
  if (!['planning', 'active'].includes(r.status)) throw new Conflict('لا يمكن تعديل ملاحظات المراجعة المرحلية بعد بدء التقييم');
  const note = clean(b.note, 3000);
  if (note.length < 3) throw new BadRequest('الملاحظة قصيرة جداً');
  if (rel.own) run('UPDATE performance_reviews SET mid_emp_note=?, mid_emp_at=?, updated_at=? WHERE id=?', note, now(), now(), r.id);
  else run('UPDATE performance_reviews SET mid_mgr_note=?, mid_mgr_at=?, mid_mgr_by=?, updated_at=? WHERE id=?', note, now(), user.id, now(), r.id);
  logChange(user, r.id, 'midyear');
  changed(K, viewersOf(r), r.id);
  return present(user, reviewRow(user, id), { detail: true });
}

export const SELF_BODY = S({
  items: arr(S({ objective_id: str('objective id', { maxLength: 40 }), pct: int('achievement %', { minimum: 0, maximum: 100 }), note: str('note', { maxLength: 1500 }) }, ['objective_id']), { maxItems: M.OBJ_MAX }),
  comment: str('overall comment', { maxLength: 4000 }),
  submit: bool('submit (true) or save a draft'),
});
export function saveSelf(user, id, body) {
  const b = check(SELF_BODY, body);
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (!rel.own) throw new Forbidden('التقييم الذاتي يكتبه الموظف صاحب المراجعة فقط');
  if (r.status !== 'active') throw new Conflict(r.status === 'planning' ? 'لم تُعتمد الأهداف بعد' : 'أُرسل التقييم الذاتي مسبقاً ولا يمكن تعديله');
  requirePhase(c, M.ASSESS_PHASES, 'التقييم الذاتي متاح في مرحلتي التقييم الذاتي وتقييم المدير');
  const objs = objectivesOf(r.id); const ids = new Set(objs.map((o) => o.id));
  for (const it of b.items || []) if (!ids.has(it.objective_id)) throw new BadRequest('أحد الأهداف لا ينتمي إلى هذه المراجعة');
  tx(() => {
    for (const it of b.items || []) run('UPDATE performance_objectives SET self_pct=?, self_note=?, updated_at=? WHERE id=? AND review_id=?', it.pct ?? null, clean(it.note || '', 1500) || null, now(), it.objective_id, r.id);
    if (b.comment !== undefined) run('UPDATE performance_reviews SET self_comment=? WHERE id=?', clean(b.comment, 4000) || null, r.id);
    run('UPDATE performance_reviews SET self_saved_at=?, updated_at=? WHERE id=?', now(), now(), r.id);
    if (b.submit) {
      const cur = objectivesOf(r.id);
      if (cur.some((o) => o.self_pct == null)) throw new BadRequest('أدخل نسبة الإنجاز لكل هدف قبل الإرسال');
      const comment = one('SELECT self_comment FROM performance_reviews WHERE id=?', r.id).self_comment || '';
      if (comment.length < 10) throw new BadRequest('أضف تعليقاً عاماً على أدائك (10 أحرف على الأقل) قبل الإرسال');
      const to = transition(r.status, 'self_submitted', M.REVIEW_FLOW, M.statusLabels);
      run('UPDATE performance_reviews SET status=?, self_submitted_at=? WHERE id=?', to, now(), r.id);
    }
  });
  logChange(user, r.id, b.submit ? 'self_submit' : 'self_draft');
  if (b.submit) {
    audit(user, 'performance.self_submit', r.id);
    const emp = userBrief(r.employee_id);
    if (r.manager_id) alert(r.manager_id, { level: 'info', title: `تقييم ذاتي بانتظار تقييمك: ${emp?.name_ar || ''}`, body: `أرسل ${emp?.name_ar || 'الموظف'} تقييمه الذاتي في «${c.name_ar}». أكمل تقييمك قبل ${phaseEnd(c.id, 'manager_assessment') || 'نهاية المرحلة'}.`, system: K, id: r.id });
    changed(K, viewersOf(r), r.id);
  } else changed(K, [r.employee_id], r.id); // a draft is visible to its author only
  return present(user, reviewRow(user, id), { detail: true });
}

const RATING = int('rating 1–5', { minimum: 1, maximum: 5 });
export const ASSESS_BODY = S({
  objectives: arr(S({ objective_id: str('objective id', { maxLength: 40 }), rating: RATING, note: str('note', { maxLength: 1500 }) }, ['objective_id']), { maxItems: M.OBJ_MAX }),
  competencies: arr(S({ competency_id: str('competency id', { maxLength: 40 }), rating: RATING, note: str('note', { maxLength: 1500 }) }, ['competency_id']), { maxItems: 20 }),
  comment: str('overall comment', { maxLength: 4000 }),
  submit: bool('submit (true) or save a draft'),
});
export function saveAssessment(user, id, body) {
  const b = check(ASSESS_BODY, body);
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (rel.own) throw new Forbidden('لا يمكنك تقييم نفسك — يقيّمك مديرك المباشر');
  if (!rel.mgr) throw new Forbidden('تقييم الأداء من صلاحية المدير المباشر فقط');
  requirePhase(c, M.ASSESS_PHASES, 'تقييم المدير متاح في مرحلتي التقييم الذاتي وتقييم المدير');
  if (!['active', 'self_submitted'].includes(r.status)) throw new Conflict(r.status === 'planning' ? 'لم تُعتمد الأهداف بعد' : 'أُرسل التقييم مسبقاً ولا يمكن تعديله');
  const objs = objectivesOf(r.id); const oids = new Set(objs.map((o) => o.id));
  const comps = M.competencies(); const cids = new Set(comps.map((x) => x.id));
  for (const it of b.objectives || []) if (!oids.has(it.objective_id)) throw new BadRequest('أحد الأهداف لا ينتمي إلى هذه المراجعة');
  for (const it of b.competencies || []) if (!cids.has(it.competency_id)) throw new BadRequest('جدارة غير معروفة');
  let lateNoSelf = false;
  if (b.submit && r.status === 'active') {
    const selfEnd = phaseEnd(c.id, 'self_assessment');
    if (!(c.phase === 'manager_assessment' && selfEnd && today() > selfEnd)) throw new Conflict('بانتظار التقييم الذاتي — يمكنك حفظ مسودة، أو الإرسال دونه بعد انتهاء نافذة التقييم الذاتي');
    lateNoSelf = true;
  }
  let scores = null;
  tx(() => {
    for (const it of b.objectives || []) run('UPDATE performance_objectives SET mgr_rating=?, mgr_note=?, updated_at=? WHERE id=? AND review_id=?', it.rating ?? null, clean(it.note || '', 1500) || null, now(), it.objective_id, r.id);
    for (const it of b.competencies || []) run(`INSERT INTO performance_comp_ratings (review_id,competency_id,rating,note) VALUES (?,?,?,?)
      ON CONFLICT(review_id,competency_id) DO UPDATE SET rating=excluded.rating, note=excluded.note`, r.id, it.competency_id, it.rating ?? null, clean(it.note || '', 1500) || null);
    if (b.comment !== undefined) run('UPDATE performance_reviews SET mgr_comment=? WHERE id=?', clean(b.comment, 4000) || null, r.id);
    run('UPDATE performance_reviews SET mgr_saved_at=?, updated_at=? WHERE id=?', now(), now(), r.id);
    if (b.submit) {
      const cur = objectivesOf(r.id);
      const cr = all('SELECT competency_id, rating FROM performance_comp_ratings WHERE review_id=?', r.id);
      if (cur.some((o) => o.mgr_rating == null)) throw new BadRequest('قيّم كل هدف (1–5) قبل الإرسال');
      if (comps.some((x) => !cr.find((y) => y.competency_id === x.id && y.rating != null))) throw new BadRequest('قيّم كل جدارة (1–5) قبل الإرسال');
      const comment = one('SELECT mgr_comment FROM performance_reviews WHERE id=?', r.id).mgr_comment || '';
      if (comment.length < 20) throw new BadRequest('أضف ملاحظة عامة واضحة للموظف (20 حرفاً على الأقل) قبل الإرسال');
      scores = computeScores(cur, cr.filter((x) => cids.has(x.competency_id)), c.objectives_share);
      const to = transition(r.status, 'assessed', M.REVIEW_FLOW, M.statusLabels);
      run(`UPDATE performance_reviews SET status=?, mgr_submitted_at=?, assessed_by=?, no_self=?, obj_score=?, comp_score=?, score=?, band=? WHERE id=?`,
        to, now(), user.id, lateNoSelf ? 1 : 0, scores.obj_score, scores.comp_score, scores.score, scores.band, r.id);
    }
  });
  logChange(user, r.id, b.submit ? 'assess_submit' : 'assess_draft');
  if (b.submit) {
    audit(user, 'performance.assess_submit', r.id, { score: scores.score, band: scores.band, no_self: lateNoSelf });
    alert(r.employee_id, { level: 'info', title: 'تقييم مديرك لأدائك متاح الآن', body: `أرسل مديرك تقييم أدائك في «${c.name_ar}». تُعتمد النتيجة النهائية بعد المعايرة.`, system: K, id: r.id });
    changed(K, viewersOf(r), r.id);
  } else {
    changed(K, managersOf(r), r.id); // a draft is visible to the managers only
  }
  return present(user, reviewRow(user, id), { detail: true });
}

export const CALIBRATE_BODY = S({ band: str('final band', { enum: M.BAND_KEYS }), justification: str('justification', { maxLength: 2000 }) }, ['band']);
export function calibrate(user, id, body) {
  requireCap(user, M.HR_CAP);
  const b = check(CALIBRATE_BODY, body);
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id);
  if (r.employee_id === user.id) throw new Forbidden('لا يمكنك معايرة مراجعة أدائك — يعايرها زميل آخر في الموارد البشرية');
  if (r.assessed_by === user.id) throw new Forbidden('لا يمكنك معايرة تقييم أرسلته بنفسك كمدير — فصل المهام');
  requirePhase(c, ['calibration'], 'المعايرة متاحة في مرحلة المعايرة فقط');
  if (r.status !== 'assessed') throw new Conflict('لا تُعاير إلا المراجعات التي أرسل المدير تقييمها');
  const from = effectiveBand(r);
  const justification = clean(b.justification || '', 2000);
  const adjusted = b.band !== r.band;
  if (b.band !== from && justification.length < 15) throw new BadRequest('تعديل التقدير يتطلب مبرراً موثقاً (15 حرفاً على الأقل)');
  if (adjusted && justification.length < 15) throw new BadRequest('التقدير المعتمد يختلف عن تقدير المدير ويتطلب مبرراً موثقاً (15 حرفاً على الأقل)');
  tx(() => {
    run('UPDATE performance_reviews SET final_band=?, calibrated_at=?, calibrated_by=?, calibration_note=?, updated_at=? WHERE id=?', b.band, now(), user.id, justification || null, now(), r.id);
    run('INSERT INTO performance_calibrations (id,review_id,from_band,to_band,justification,by_user,at) VALUES (?,?,?,?,?,?,?)', uid('pk_'), r.id, from, b.band, justification || null, user.id, now());
  });
  logChange(user, r.id, 'calibrate');
  audit(user, 'performance.calibrate', r.id, { from, to: b.band, manager_band: r.band, justification: justification || null });
  changed(K, usersWithCap(M.HR_CAP), r.id); // calibration is released to the employee/manager with the results
  return present(user, reviewRow(user, id), { detail: true });
}

export const ACK_BODY = S({ disagree: bool('record a disagreement note'), note: str('disagreement note', { maxLength: 3000 }) });
export function acknowledge(user, id, body) {
  const b = check(ACK_BODY, body);
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (!rel.own) throw new Forbidden('الإقرار بالاطلاع يقوم به الموظف صاحب المراجعة فقط');
  requirePhase(c, ['acknowledgement'], 'الإقرار بالاطلاع متاح في مرحلة الاطلاع والإقرار');
  const to = transition(r.status, 'acknowledged', M.REVIEW_FLOW, M.statusLabels);
  const note = clean(b.note || '', 3000);
  if (b.disagree && note.length < 10) throw new BadRequest('اكتب ملاحظة الاعتراض بوضوح (10 أحرف على الأقل)');
  run('UPDATE performance_reviews SET status=?, ack_at=?, disagreement=?, disagreement_status=?, updated_at=? WHERE id=?', to, now(), b.disagree ? note : null, b.disagree ? 'open' : null, now(), r.id);
  logChange(user, r.id, b.disagree ? 'acknowledge_disagree' : 'acknowledge');
  audit(user, 'performance.acknowledge', r.id, { disagree: !!b.disagree });
  if (b.disagree) {
    const emp = userBrief(r.employee_id);
    const hr = usersWithCap(M.HR_CAP).filter((u) => u !== r.employee_id);
    const able = hr.filter((u) => u !== r.assessed_by);
    for (const u of (able.length ? able : hr)) alert(u, { level: 'warning', title: `ملاحظة اعتراض على نتيجة تقييم: ${emp?.name_ar || ''}`, body: `سجّل ${emp?.name_ar || 'موظف'} (${emp?.dept_ar || ''}) ملاحظة على نتيجة «${c.name_ar}» وهي بانتظار رد الموارد البشرية.`, system: K, id: r.id });
  }
  changed(K, viewersOf(r), r.id);
  return present(user, reviewRow(user, id), { detail: true });
}

export const RESOLVE_BODY = S({ response: str('HR response', { maxLength: 3000 }) }, ['response']);
export function resolveDisagreement(user, id, body) {
  requireCap(user, M.HR_CAP);
  const b = check(RESOLVE_BODY, body);
  const r = reviewRow(user, id);
  if (r.employee_id === user.id) throw new Forbidden('لا يمكنك الرد على ملاحظة تخص مراجعتك');
  if (r.assessed_by === user.id) throw new Forbidden('لا يمكنك الرد على اعتراض على تقييم أرسلته بنفسك — فصل المهام');
  if (r.disagreement_status !== 'open') throw new Conflict('لا توجد ملاحظة اعتراض مفتوحة على هذه المراجعة');
  const response = clean(b.response, 3000);
  if (response.length < 10) throw new BadRequest('اكتب رداً واضحاً (10 أحرف على الأقل)');
  run("UPDATE performance_reviews SET disagreement_status='resolved', hr_response=?, hr_response_by=?, hr_response_at=?, updated_at=? WHERE id=?", response, user.id, now(), now(), r.id);
  logChange(user, r.id, 'resolve');
  audit(user, 'performance.resolve_disagreement', r.id);
  alert(r.employee_id, { level: 'info', title: 'ردّت الموارد البشرية على ملاحظتك', body: 'اطّلع على الرد في «مراجعتي» ضمن نظام الأداء.', system: K, id: r.id });
  changed(K, [r.employee_id, ...usersWithCap(M.HR_CAP)], r.id);
  return present(user, reviewRow(user, id), { detail: true });
}

// ---------------- cycles (HR) ----------------
const RANGE = S({ starts_on: date('start YYYY-MM-DD'), ends_on: date('end YYYY-MM-DD') }, ['starts_on', 'ends_on']);
const PHASES_SCHEMA = S(Object.fromEntries(M.SCHEDULED.map((p) => [p, RANGE])), M.SCHEDULED);
export const CYCLE_BODY = S({ year: int('year', { minimum: 2020, maximum: 2100 }), name_ar: str('Arabic name', { maxLength: 120 }), name_en: str('English name', { maxLength: 120 }), objectives_share: int('objectives share %', { minimum: 50, maximum: 90 }), phases: PHASES_SCHEMA, confirm: bool() }, ['year', 'phases']);
export const DATES_BODY = S({ phases: PHASES_SCHEMA }, ['phases']);
export const ADVANCE_BODY = S({ to: str('next phase', { enum: M.PHASES }), confirm: bool() }, ['to']);

function validDates(phases) {
  let prevEnd = null;
  for (const p of M.SCHEDULED) {
    const { starts_on: s, ends_on: e } = phases[p];
    if (Number.isNaN(Date.parse(s)) || Number.isNaN(Date.parse(e))) throw new BadRequest(`تاريخ غير صالح في «${M.phaseAr(p)}»`);
    if (e < s) throw new BadRequest(`تاريخ نهاية «${M.phaseAr(p)}» يسبق بدايتها`);
    if (prevEnd && s < prevEnd) throw new BadRequest(`«${M.phaseAr(p)}» يجب أن تبدأ بعد انتهاء المرحلة السابقة`);
    prevEnd = e;
  }
}
const eligibleStaff = () => staffUsers().filter((u) => u.user_type === 'staff' && lineManager(u.id));
function createReview(cycleId, u, extra = {}) {
  const id = uid('pr_');
  run('INSERT INTO performance_reviews (id,cycle_id,employee_id,manager_id,department_id,is_demo) VALUES (?,?,?,?,?,?)', id, cycleId, u.id, lineManager(u.id), u.department_id, extra.is_demo ? 1 : 0);
  return id;
}
const participants = (cycleId) => [...new Set(all('SELECT employee_id, manager_id FROM performance_reviews WHERE cycle_id=?', cycleId).flatMap((r) => [r.employee_id, r.manager_id]).concat(usersWithCap(M.HR_CAP)).filter(Boolean))];

export function createCycle(user, body) {
  requireCap(user, M.HR_CAP);
  const b = check(CYCLE_BODY, body);
  requireConfirm(b, 'إنشاء دورة أداء جديدة يتطلب تأكيداً صريحاً');
  validDates(b.phases);
  if (one("SELECT 1 FROM performance_cycles WHERE phase<>'closed'")) throw new Conflict('توجد دورة أداء مفتوحة؛ أغلقها قبل إنشاء دورة جديدة');
  if (one('SELECT 1 FROM performance_cycles WHERE year=?', b.year)) throw new Conflict(`توجد دورة أداء لعام ${b.year} مسبقاً`);
  const id = uid('pc_');
  let reviews = 0; const staff = eligibleStaff();
  tx(() => {
    run('INSERT INTO performance_cycles (id,year,name_ar,name_en,phase,objectives_share,created_by,updated_at) VALUES (?,?,?,?,?,?,?,?)', id, b.year,
      clean(b.name_ar || '', 120) || `دورة تقييم الأداء ${b.year}`, clean(b.name_en || '', 120) || `Performance cycle ${b.year}`, 'goal_setting', b.objectives_share ?? M.DEFAULT_SHARE, user.id, now());
    for (const p of M.SCHEDULED) run('INSERT INTO performance_phases (cycle_id,phase,starts_on,ends_on,opened_at,opened_by) VALUES (?,?,?,?,?,?)', id, p, b.phases[p].starts_on, b.phases[p].ends_on, p === 'goal_setting' ? now() : null, p === 'goal_setting' ? user.id : null);
    for (const u of staff) { createReview(id, u); reviews++; }
  });
  audit(user, 'performance.cycle_create', id, { year: b.year, reviews });
  const c = cycleRow(id);
  for (const u of staff) alert(u.id, { level: 'info', title: `بدأت ${c.name_ar}: حدّد أهدافك`, body: `صِغ من ${M.OBJ_MIN} إلى ${M.OBJ_MAX} أهداف مجموع أوزانها 100 قبل ${b.phases.goal_setting.ends_on}، ثم يعتمدها مديرك.`, system: K, id });
  changed(K, participants(id), id);
  return { cycle: cycleView(c), reviews };
}

export function updateDates(user, id, body) {
  requireCap(user, M.HR_CAP);
  const b = check(DATES_BODY, body);
  const c = resolveCycle(id);
  if (!c) throw new NotFound('دورة الأداء غير موجودة');
  if (c.phase === 'closed') throw new Conflict('لا يمكن تعديل مواعيد دورة مغلقة');
  validDates(b.phases);
  const before = phasesOf(c.id);
  tx(() => { for (const p of M.SCHEDULED) run('UPDATE performance_phases SET starts_on=?, ends_on=? WHERE cycle_id=? AND phase=?', b.phases[p].starts_on, b.phases[p].ends_on, c.id, p); run('UPDATE performance_cycles SET updated_at=? WHERE id=?', now(), c.id); });
  audit(user, 'performance.cycle_dates', c.id, { before: Object.fromEntries(before.map((p) => [p.phase, [p.starts_on, p.ends_on]])), after: b.phases });
  changed(K, participants(c.id), c.id);
  return cycleView(cycleRow(c.id));
}

export function advanceCycle(user, id, body) {
  requireCap(user, M.HR_CAP);
  const b = check(ADVANCE_BODY, body);
  const c = resolveCycle(id);
  if (!c) throw new NotFound('دورة الأداء غير موجودة');
  requireConfirm(b, 'الانتقال بين مراحل دورة الأداء يتطلب تأكيداً صريحاً');
  const to = transition(c.phase, b.to, M.NEXT_PHASE, M.phaseLabels);
  const rows = all('SELECT * FROM performance_reviews WHERE cycle_id=?', c.id);
  tx(() => {
    run('UPDATE performance_cycles SET phase=?, updated_at=? WHERE id=?', to, now(), c.id);
    run('UPDATE performance_phases SET opened_at=?, opened_by=? WHERE cycle_id=? AND phase=?', now(), user.id, c.id, to);
  });
  const counts = { total: rows.length, planning: rows.filter((r) => r.status === 'planning').length, active: rows.filter((r) => r.status === 'active').length, self_submitted: rows.filter((r) => r.status === 'self_submitted').length, assessed: rows.filter((r) => r.status === 'assessed').length };
  audit(user, 'performance.cycle_advance', c.id, { from: c.phase, to, counts });
  const name = c.name_ar; const end = phaseEnd(c.id, to);
  const once = new Set();
  const tell = (uidv, title, bodyTxt, level = 'info') => { if (uidv && !once.has(uidv)) { once.add(uidv); alert(uidv, { level, title, body: bodyTxt, system: K, id: c.id }); } };
  if (to === 'midyear') for (const r of rows) if (['planning', 'active'].includes(r.status)) tell(r.manager_id, `بدأت المراجعة المرحلية في ${name}`, `ناقش تقدم فريقك وسجّل ملاحظاتك قبل ${end}.`);
  if (to === 'self_assessment') for (const r of rows) if (r.status === 'active') tell(r.employee_id, `بدأ التقييم الذاتي في ${name}`, `قيّم إنجاز أهدافك وأرسل تقييمك الذاتي قبل ${end}.`);
  if (to === 'manager_assessment') for (const r of rows) if (['active', 'self_submitted'].includes(r.status)) tell(r.manager_id, `بدأ تقييم المدراء في ${name}`, `أكمل تقييمات فريقك وأرسلها قبل ${end}.`);
  if (to === 'calibration') for (const u of usersWithCap(M.HR_CAP)) if (u !== user.id) tell(u, `بدأت المعايرة في ${name}`, `راجع توزيع التقديرات واعتمد المعايرة قبل ${end}.`);
  if (to === 'acknowledgement') for (const r of rows) if (r.status === 'assessed') tell(r.employee_id, `نتيجة تقييم أدائك متاحة في ${name}`, `اطّلع على نتيجتك النهائية وأقرّ بالاطلاع قبل ${end}.`);
  changed(K, participants(c.id), c.id);
  return { cycle: cycleView(cycleRow(c.id)), counts };
}

export function syncReviews(user, id) {
  requireCap(user, M.HR_CAP);
  const c = resolveCycle(id);
  if (!c) throw new NotFound('دورة الأداء غير موجودة');
  if (c.phase === 'closed' || M.phaseIndex(c.phase) >= M.phaseIndex('calibration')) throw new Conflict('لا تُضاف مراجعات جديدة بعد بدء المعايرة');
  const have = new Set(all('SELECT employee_id FROM performance_reviews WHERE cycle_id=?', c.id).map((r) => r.employee_id));
  const add = eligibleStaff().filter((u) => !have.has(u.id));
  tx(() => { for (const u of add) createReview(c.id, u); });
  if (add.length) {
    audit(user, 'performance.cycle_sync', c.id, { added: add.map((u) => u.id) });
    for (const u of add) alert(u.id, { level: 'info', title: `أُضيفت مراجعة أدائك إلى ${c.name_ar}`, body: 'صِغ أهدافك واطلب اعتمادها من مديرك.', system: K, id: c.id });
    changed(K, participants(c.id), c.id);
  }
  return { added: add.length, cycle: cycleView(cycleRow(c.id)) };
}

// ---------------- AI-assisted overall comment (manager) ----------------
export const DRAFT_BODY = S({
  objectives: arr(S({ objective_id: str('', { maxLength: 40 }), rating: RATING }, ['objective_id']), { maxItems: M.OBJ_MAX }),
  competencies: arr(S({ competency_id: str('', { maxLength: 40 }), rating: RATING }, ['competency_id']), { maxItems: 20 }),
  lang: str('ar|en', { enum: ['ar', 'en'] }),
});
function localComment(objs, comps, share, lang) {
  const ar = lang !== 'en';
  const s = computeScores(objs, comps, share);
  const band = M.BANDS.find((x) => x.key === s.band);
  const strong = [...objs.filter((o) => o.mgr_rating >= 4).map((o) => o.title), ...comps.filter((c) => c.rating >= 4).map((c) => (ar ? c.name_ar : c.name_en))];
  const grow = [...objs.filter((o) => o.mgr_rating != null && o.mgr_rating <= 2).map((o) => o.title), ...comps.filter((c) => c.rating != null && c.rating <= 2).map((c) => (ar ? c.name_ar : c.name_en))];
  const mid = comps.filter((c) => c.rating === 3).map((c) => (ar ? c.name_ar : c.name_en));
  if (ar) {
    return [
      band ? `جاء الأداء خلال الدورة في مستوى «${band.ar}» (الدرجة المرجّحة ${s.score}).` : 'لم تكتمل التقديرات بعد لحساب الدرجة المرجّحة.',
      strong.length ? `أبرز نقاط القوة: ${strong.slice(0, 4).join('، ')}.` : null,
      grow.length ? `مجالات تحتاج إلى تطوير: ${grow.slice(0, 3).join('، ')}، ونقترح الاتفاق على خطة تطوير بمؤشرات واضحة.` : mid.length ? `يُنصح بمواصلة تطوير: ${mid.slice(0, 2).join('، ')}.` : null,
      'نشكر الجهد المبذول ونتطلع إلى استمرار التقدم في الدورة القادمة.',
    ].filter(Boolean).join(' ');
  }
  return [
    band ? `Overall performance this cycle was “${band.en}” (weighted score ${s.score}).` : 'Ratings are incomplete, so no weighted score yet.',
    strong.length ? `Key strengths: ${strong.slice(0, 4).join(', ')}.` : null,
    grow.length ? `Areas to develop: ${grow.slice(0, 3).join(', ')}; we suggest agreeing a development plan with clear measures.` : mid.length ? `Keep developing: ${mid.slice(0, 2).join(', ')}.` : null,
    'Thank you for the effort; we look forward to continued progress next cycle.',
  ].filter(Boolean).join(' ');
}
export async function draftComment(user, id, body, completeFn) {
  const b = check(DRAFT_BODY, body || {});
  const r = reviewRow(user, id); const c = cycleRow(r.cycle_id); const rel = relation(user, r);
  if (!rel.mgr) throw new Forbidden('صياغة ملاحظة التقييم متاحة للمدير المباشر فقط');
  const lang = b.lang || 'ar';
  const given = new Map((b.objectives || []).map((x) => [x.objective_id, x.rating]));
  const objs = objectivesOf(r.id).map((o) => ({ ...o, mgr_rating: given.has(o.id) ? given.get(o.id) : o.mgr_rating }));
  const saved = new Map(all('SELECT competency_id, rating FROM performance_comp_ratings WHERE review_id=?', r.id).map((x) => [x.competency_id, x.rating]));
  const givenC = new Map((b.competencies || []).map((x) => [x.competency_id, x.rating]));
  const comps = M.competencies().map((x) => ({ ...x, rating: givenC.has(x.id) ? givenC.get(x.id) : saved.get(x.id) ?? null }));
  const local = localComment(objs, comps, c.objectives_share, lang);
  const localOut = (reason, ar, en) => ({ text: local, source: 'local', reason, label_ar: ar, label_en: en });
  if (!aiAllowed(user, M.DOMAIN)) return localOut('policy', 'صياغة محلية — وصول المساعد الذكي لبيانات الأداء غير مفعّل لحسابك', 'Local draft — Ask AI access to performance data is off for your account');
  // Data minimisation: no names or identifiers, only objective titles, weights and ratings.
  const facts = [
    ...objs.map((o) => `- ${o.title} (weight ${o.weight}%): ${o.mgr_rating ?? 'not rated'}/5`),
    ...comps.map((x) => `- ${lang === 'en' ? x.name_en : x.name_ar}: ${x.rating ?? 'not rated'}/5`),
  ].join('\n');
  try {
    const out = await completeFn({
      capability: 'generate', user, maxTokens: 500,
      system: lang === 'en' ? 'You write concise, respectful, evidence-based performance review summaries for a UAE government entity. 3–4 sentences. No names. Do not invent facts beyond the ratings given.'
        : 'تكتب ملاحظات تقييم أداء موجزة ومحترمة ومبنية على الأدلة لجهة حكومية إماراتية، من 3 إلى 4 جمل بالعربية الفصحى، دون أسماء، ودون اختلاق وقائع تتجاوز التقديرات المعطاة.',
      messages: [{ role: 'user', content: `${lang === 'en' ? 'Ratings (1–5):' : 'التقديرات (1–5):'}\n${facts}` }],
    });
    const text = clean(out?.text || '', 4000);
    if (!text) return localOut('empty', 'صياغة محلية — لم يُرجع النموذج نصاً', 'Local draft — the model returned no text');
    return { text, source: 'ai', label_ar: 'مسودة من المساعد الذكي — راجعها وعدّلها قبل الإرسال', label_en: 'AI draft — review and edit before submitting' };
  } catch (e) {
    return e.local ? localOut('no_model', 'تحليل محلي — نموذج الذكاء الاصطناعي غير متصل', 'Local analysis — the AI model is not connected')
      : localOut('error', 'صياغة محلية — تعذّر الوصول إلى نموذج الذكاء الاصطناعي', 'Local draft — the AI model could not be reached');
  }
}

// ---------------- Ask AI tool payloads (same scope, minimised) ----------------
export function myReviewSummary(user) {
  const c = currentCycle();
  if (!c) return { cycle: null, review: null };
  const row = one('SELECT * FROM performance_reviews WHERE cycle_id=? AND employee_id=?', c.id, user.id);
  const cv = cycleView(c);
  const cycle = { name_ar: c.name_ar, name_en: c.name_en, phase: c.phase, phase_ar: M.phaseAr(c.phase), deadline: cv.deadline, days_left: cv.days_left };
  if (!row) return { cycle, review: null };
  logView(user, row.id, 'ai_view');
  const p = present(user, row, { detail: true, c });
  return {
    cycle,
    review: {
      id: p.id, status: p.status, status_ar: M.STATUS_LABEL[p.status][0], next_ar: p.next.ar, next_due: p.next.due,
      manager_ar: p.manager?.name_ar || null,
      objectives: p.objectives.map((o) => ({ title: o.title, weight: o.weight, self_pct: o.self_pct ?? null })),
      self_submitted: !!p.self_submitted_at, assessment_released: !!p.mgr_submitted_at,
      band_ar: p.assessment_visible && p.band ? M.bandAr(p.band) : null,
      final_band_ar: p.released && p.final_band ? M.bandAr(p.final_band) : null,
      link: `#/sys/performance/mine`,
    },
  };
}
export function teamStatus(user) {
  const c = currentCycle();
  if (!c) return { cycle: null, members: [] };
  const t = teamList(user, c.id);
  return {
    cycle: { name_ar: c.name_ar, phase_ar: M.phaseAr(c.phase), manager_deadline: t.stats.deadline },
    total: t.stats.total, pending: t.stats.pending, self: t.stats.self, assessed: t.stats.assessed,
    members: t.reviews.map((r) => ({ name_ar: r.employee.name_ar, status_ar: M.STATUS_LABEL[r.status][0], next_ar: r.next.ar, needs_you: r.next.actionable })),
    link: '#/sys/performance/team',
  };
}

// ---------------- Home workspace ----------------
export function workspace(user) {
  const c = currentCycle();
  if (!c || c.phase === 'closed') return [];
  const cards = [];
  const cv = cycleView(c);
  const phase = M.PHASE_LABEL[c.phase];
  const own = one('SELECT * FROM performance_reviews WHERE cycle_id=? AND employee_id=?', c.id, user.id);
  if (own) {
    const p = present(user, own, { c });
    const days = p.next.due ? daysBetween(today(), p.next.due) : null;
    cards.push({
      title_ar: 'مراجعة أدائي', title_en: 'My performance review', value: phase[0], unit_ar: '', unit_en: '',
      tone: p.next.actionable ? (days != null && days <= 3 ? 'warn' : 'emph') : null,
      hint_ar: `${p.next.ar}${p.next.due ? ` · قبل ${p.next.due}` : ''}`, hint_en: `${p.next.en}${p.next.due ? ` · by ${p.next.due}` : ''}`,
      href: '#/sys/performance/mine', items: [],
      cta: { label_ar: p.next.actionable ? 'ابدأ الآن' : 'افتح مراجعتي', label_en: p.next.actionable ? 'Start now' : 'Open my review', href: '#/sys/performance/mine' },
    });
  }
  const t = teamList(user, c.id);
  const pending = t.reviews.filter((r) => r.next.actionable);
  if (pending.length) {
    cards.push({
      title_ar: 'تقييمات فريقي بانتظارك', title_en: 'Team reviews awaiting you', value: pending.length, unit_ar: pending.length === 1 ? 'مراجعة' : 'مراجعات', unit_en: pending.length === 1 ? 'review' : 'reviews',
      tone: cv.days_left != null && cv.days_left <= 3 ? 'warn' : 'emph',
      hint_ar: `${phase[0]}${t.stats.deadline ? ` · آخر موعد لتقييم المدير ${t.stats.deadline}` : ''}`, hint_en: `${phase[1]}${t.stats.deadline ? ` · manager deadline ${t.stats.deadline}` : ''}`,
      href: '#/sys/performance/team',
      items: pending.slice(0, 3).map((r) => ({ title: r.employee.name_ar, meta_ar: r.next.ar, meta_en: r.next.en, href: `#/sys/performance/team/${c.id}/${r.id}` })),
      cta: { label_ar: 'افتح فريقي', label_en: 'Open my team', href: '#/sys/performance/team' },
    });
  }
  if (isHR(user)) {
    const rows = cycleRows(c);
    const metric = PHASE_METRIC[c.phase];
    const comp = completion(rows);
    const depts = byDepartment(rows).map((d) => ({ ...d, v: d[metric] })).sort((a, b) => (a.v ?? 0) - (b.v ?? 0));
    cards.push({
      title_ar: `اكتمال ${phase[0]}`, title_en: `${phase[1]} completion`, value: comp[metric] ?? 0, unit_ar: '%', unit_en: '%',
      tone: (comp[metric] ?? 0) >= 80 ? 'good' : cv.days_left != null && cv.days_left <= 3 ? 'warn' : null,
      hint_ar: `${comp.total} مراجعة · ${cv.deadline ? `تنتهي المرحلة ${cv.deadline}` : ''}`, hint_en: `${comp.total} reviews · ${cv.deadline ? `phase ends ${cv.deadline}` : ''}`,
      href: '#/sys/performance/hr',
      items: depts.slice(0, 3).map((d) => ({ title: d.name_ar, meta_ar: `${d.v ?? 0}%`, meta_en: `${d.v ?? 0}%`, href: '#/sys/performance/hr' })),
      cta: { label_ar: 'لوحة الموارد البشرية', label_en: 'HR console', href: '#/sys/performance/hr' },
    });
  }
  return cards.slice(0, 3);
}

// ---------------- excellence points (derived from real records) ----------------
export function gameEvents(userId) {
  const out = [];
  for (const r of all(`SELECT r.id, r.self_submitted_at, c.name_ar, p.ends_on FROM performance_reviews r JOIN performance_cycles c ON c.id=r.cycle_id
      JOIN performance_phases p ON p.cycle_id=c.id AND p.phase='self_assessment' WHERE r.employee_id=? AND r.self_submitted_at IS NOT NULL`, userId)) {
    if (r.self_submitted_at.slice(0, 10) <= r.ends_on) out.push({ kind: 'perf_self_on_time', points: 10, at: r.self_submitted_at, ref: r.name_ar, id: `perf_self:${r.id}` });
  }
  for (const g of all(`SELECT c.id, c.name_ar, p.ends_on, COUNT(*) n, SUM(r.mgr_submitted_at IS NOT NULL AND substr(r.mgr_submitted_at,1,10) <= p.ends_on) ok, MAX(r.mgr_submitted_at) last
      FROM performance_reviews r JOIN performance_cycles c ON c.id=r.cycle_id JOIN performance_phases p ON p.cycle_id=c.id AND p.phase='manager_assessment'
      WHERE r.manager_id=? GROUP BY c.id`, userId)) {
    if (g.n > 0 && g.ok === g.n && g.last) out.push({ kind: 'perf_team_on_time', points: 15, at: g.last, ref: g.name_ar, id: `perf_team:${g.id}` });
  }
  return out;
}
