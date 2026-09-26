// My Goals — personal goals (daily → yearly) with check-ins, checklists, roll-up
// to longer periods, alignment to strategic objectives and carry-over.
//
// Isolation (confidential domain goals.personal):
//  * A goal belongs to its owner. Nobody else sees a PRIVATE goal — ever.
//  * A goal shared with visibility 'manager' is also visible (read-only, with
//    encouraging comments) to exactly two people: the owner's line manager
//    (kit.lineManager) and the manager of the owner's own department. Never the
//    wider hierarchy, never HR/SPMO, never the platform admin.
//  * Every non-list view and every change is written to the access log; the
//    owner can see who looked at their shared goals.
import {
  db, one, all, run, uid, now, tx, Forbidden, NotFound, BadRequest, Conflict, isStaff, audit, changed, transition,
  clean, lineManager, logAccess, inList, round, staffUsers, userBrief,
} from '../kit.js';
import { objectivesBrief } from '../strategy.js';

export const KEY = 'goals';
export const TYPES = ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'];
export const RANK = { daily: 1, weekly: 2, monthly: 3, quarterly: 4, yearly: 5 };
export const MEASURES = ['binary', 'numeric', 'checklist', 'rollup'];
export const TYPE_AR = { daily: 'يومي', weekly: 'أسبوعي', monthly: 'شهري', quarterly: 'ربع سنوي', yearly: 'سنوي' };
export const STATUS_AR = { active: 'نشط', achieved: 'تحقق', missed: 'لم يتحقق', cancelled: 'ملغى' };
const MAX_PER_PERIOD = 25;

// ---------------------------------------------------------------- schema
export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS goals_goals (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
  period_type TEXT NOT NULL CHECK (period_type IN ('daily','weekly','monthly','quarterly','yearly')),
  period_start TEXT NOT NULL, period_end TEXT NOT NULL,
  measure TEXT NOT NULL DEFAULT 'binary' CHECK (measure IN ('binary','numeric','checklist','rollup')),
  target_value REAL, current_value REAL NOT NULL DEFAULT 0, unit TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','achieved','missed','cancelled')),
  objective_id TEXT, parent_id TEXT REFERENCES goals_goals(id) ON DELETE SET NULL,
  visibility TEXT NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','manager')),
  achieved_at TEXT, carried_from TEXT, carried_to TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals_items (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals_goals(id) ON DELETE CASCADE,
  title TEXT NOT NULL, done_at TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS goals_checkins (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals_goals(id) ON DELETE CASCADE, user_id TEXT NOT NULL,
  kind TEXT NOT NULL, value REAL, progress INTEGER, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS goals_comments (
  id TEXT PRIMARY KEY, goal_id TEXT NOT NULL REFERENCES goals_goals(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL REFERENCES users(id), body TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_goals_owner ON goals_goals(owner_id, period_type, period_start);
CREATE INDEX IF NOT EXISTS ix_goals_parent ON goals_goals(parent_id);
CREATE INDEX IF NOT EXISTS ix_goals_checkins ON goals_checkins(goal_id, created_at);
`);
}

// ---------------------------------------------------------------- calendar (Gulf Standard Time; UAE work week Mon–Fri)
export const localToday = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const pad = (n) => String(n).padStart(2, '0');
const dow = (iso) => new Date(`${iso}T12:00:00Z`).getUTCDay(); // 0 Sun … 6 Sat
export const isWorkday = (iso) => dow(iso) >= 1 && dow(iso) <= 5;
export function periodFor(type, iso = localToday()) {
  const [y, m] = iso.split('-').map(Number);
  switch (type) {
    case 'daily': return { start: iso, end: iso };
    case 'weekly': {
      const d = dow(iso); // weekend days plan the coming work week
      const monday = d === 6 ? addDays(iso, 2) : d === 0 ? addDays(iso, 1) : addDays(iso, 1 - d);
      return { start: monday, end: addDays(monday, 4) };
    }
    case 'monthly': return { start: `${y}-${pad(m)}-01`, end: `${y}-${pad(m)}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}` };
    case 'quarterly': { const q = Math.floor((m - 1) / 3); const m0 = q * 3 + 1; const m1 = m0 + 2; return { start: `${y}-${pad(m0)}-01`, end: `${y}-${pad(m1)}-${pad(new Date(Date.UTC(y, m1, 0)).getUTCDate())}` }; }
    case 'yearly': return { start: `${y}-01-01`, end: `${y}-12-31` };
    default: throw new BadRequest('نوع الفترة غير صالح');
  }
}
const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
const Q_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
export function periodLabel(type, start, end) {
  const [y, m, d] = start.split('-').map(Number);
  if (type === 'daily') return start === localToday() ? 'اليوم' : `${d} ${MONTHS_AR[m - 1]}`;
  if (type === 'weekly') { const [, m2, d2] = end.split('-').map(Number); return m2 === m ? `أسبوع ${d}–${d2} ${MONTHS_AR[m - 1]}` : `أسبوع ${d} ${MONTHS_AR[m - 1]} – ${d2} ${MONTHS_AR[m2 - 1]}`; }
  if (type === 'monthly') return `${MONTHS_AR[m - 1]} ${y}`;
  if (type === 'quarterly') return `الربع ${Q_AR[Math.floor((m - 1) / 3)]} ${y}`;
  return String(y);
}
export const currentPeriods = (iso = localToday()) => Object.fromEntries(TYPES.map((t) => { const p = periodFor(t, iso); return [t, { ...p, label_ar: periodLabel(t, p.start, p.end) }]; }));

// ---------------------------------------------------------------- scope
// People whose SHARED goals this viewer may read: their direct reports (line
// manager) and, for a department manager, the members of their own department.
export function teamIds(viewer) {
  if (!isStaff(viewer)) return [];
  const out = [];
  for (const u of staffUsers()) {
    if (u.id === viewer.id) continue;
    if ((viewer.role === 'manager' && u.department_id === viewer.department_id) || lineManager(u.id) === viewer.id) out.push(u.id);
  }
  return out;
}
export function scopeSql(viewer, alias = 'g') {
  const team = teamIds(viewer);
  return { sql: `(${alias}.owner_id=? OR (${alias}.visibility='manager' AND ${alias}.owner_id IN (${inList(team)})))`, params: [viewer.id, ...team], team };
}
function loadVisible(user, id) {
  if (!isStaff(user)) throw new NotFound();
  const s = scopeSql(user);
  const g = one(`SELECT g.* FROM goals_goals g WHERE g.id=? AND ${s.sql}`, id, ...s.params);
  if (!g) throw new NotFound('الهدف غير موجود أو غير متاح لك');
  return g;
}
function loadOwn(user, id, action = 'تعديل الهدف') {
  const g = loadVisible(user, id);
  if (g.owner_id !== user.id) throw new Forbidden(`${action} متاح لصاحب الهدف فقط — يمكنك الاطلاع والتشجيع`);
  return g;
}

// ---------------------------------------------------------------- decoration
export const effectiveStatus = (g, today = localToday()) => (g.status === 'active' && g.period_end < today ? 'missed' : g.status);
function objectivesMap() { try { return new Map(objectivesBrief().map((o) => [o.id, o])); } catch { return new Map(); } }

// Decorate a set of goals of ONE owner. `pool` is every goal of that owner the
// viewer may see (children progress for roll-ups uses the owner's goals).
function decorate(rows, { viewer, ownerPool, objectives = objectivesMap() } = {}) {
  const today = localToday();
  const pool = ownerPool || rows;
  const ids = pool.map((g) => g.id);
  const items = new Map();
  for (const it of all(`SELECT * FROM goals_items WHERE goal_id IN (${inList(ids)}) ORDER BY sort, rowid`, ...ids)) {
    if (!items.has(it.goal_id)) items.set(it.goal_id, []);
    items.get(it.goal_id).push(it);
  }
  const byParent = new Map();
  for (const g of pool) if (g.parent_id) { if (!byParent.has(g.parent_id)) byParent.set(g.parent_id, []); byParent.get(g.parent_id).push(g); }
  const canSee = (c) => !viewer || c.owner_id === viewer.id || c.visibility === 'manager';
  const progress = new Map();
  const prog = (g) => {
    if (progress.has(g.id)) return progress.get(g.id);
    let p = 0;
    if (g.status === 'achieved') p = 100;
    else if (g.measure === 'numeric') p = g.target_value > 0 ? Math.max(0, Math.min(100, Math.round((g.current_value / g.target_value) * 100))) : 0;
    else if (g.measure === 'checklist') { const its = items.get(g.id) || []; p = its.length ? Math.round((its.filter((i) => i.done_at).length / its.length) * 100) : 0; }
    // A viewer other than the owner only ever sees SHARED sub-goals, so a roll-up
    // never reveals (even as an aggregate) the progress of private sub-goals.
    else if (g.measure === 'rollup') { const kids = (byParent.get(g.id) || []).filter((c) => c.status !== 'cancelled' && canSee(c)); p = kids.length ? Math.round(kids.reduce((s, c) => s + prog(c), 0) / kids.length) : 0; }
    progress.set(g.id, p);
    return p;
  };
  const visibleIds = new Set(rows.map((g) => g.id));
  return rows.map((g) => {
    const kids = (byParent.get(g.id) || []).filter(canSee);
    const o = g.objective_id ? objectives.get(g.objective_id) : null;
    const its = items.get(g.id) || [];
    const parent = g.parent_id ? pool.find((p) => p.id === g.parent_id) : null;
    const parentVisible = parent && canSee(parent);
    return {
      id: g.id, owner_id: g.owner_id, title: g.title, description: g.description, period_type: g.period_type, period_start: g.period_start, period_end: g.period_end,
      period_label: periodLabel(g.period_type, g.period_start, g.period_end), measure: g.measure, target_value: g.target_value, current_value: g.current_value, unit: g.unit,
      status: effectiveStatus(g, today), stored_status: g.status, progress: prog(g), visibility: g.visibility, achieved_at: g.achieved_at,
      objective: o ? { id: o.id, code: o.code, title_ar: o.title_ar, title_en: o.title_en, status: o.status } : g.objective_id ? { id: g.objective_id, code: null, missing: true } : null,
      parent: parentVisible ? { id: parent.id, title: parent.title, period_type: parent.period_type } : null,
      children: kids.map((c) => ({ id: c.id, title: c.title, period_type: c.period_type, status: effectiveStatus(c, today), progress: prog(c), period_label: periodLabel(c.period_type, c.period_start, c.period_end) })),
      items: its.map((i) => ({ id: i.id, title: i.title, done: !!i.done_at, done_at: i.done_at })),
      items_done: its.filter((i) => i.done_at).length, items_total: its.length,
      carried_from: !viewer || g.owner_id === viewer.id ? g.carried_from : null, carried_to: !viewer || g.owner_id === viewer.id ? g.carried_to : null, is_current: g.period_start <= today && g.period_end >= today, is_future: g.period_start > today,
      can_carry: g.period_type === 'daily' && effectiveStatus(g, today) === 'missed' && !g.carried_to,
      is_demo: !!g.is_demo, created_at: g.created_at, updated_at: g.updated_at, in_list: visibleIds.has(g.id),
    };
  });
}
const ownPool = (ownerId) => all('SELECT * FROM goals_goals WHERE owner_id=?', ownerId);

// ---------------------------------------------------------------- reads
export function listOwn(user, { scope = 'current', period_type, status, limit = 200 } = {}) {
  if (!isStaff(user)) throw new NotFound();
  const today = localToday();
  const pool = ownPool(user.id);
  let rows = pool;
  if (scope === 'current') rows = rows.filter((g) => g.period_end >= today);
  else if (scope === 'today') rows = rows.filter((g) => g.period_start <= today && g.period_end >= today);
  else if (scope === 'history') rows = rows.filter((g) => g.period_end < today);
  if (period_type) rows = rows.filter((g) => g.period_type === period_type);
  let out = decorate(rows, { ownerPool: pool });
  if (status) out = out.filter((g) => g.status === status);
  out.sort((a, b) => RANK[b.period_type] - RANK[a.period_type] || (scope === 'history' ? b.period_start.localeCompare(a.period_start) : a.period_start.localeCompare(b.period_start)) || a.created_at.localeCompare(b.created_at));
  return out.slice(0, limit);
}

export function getGoal(user, id) {
  const g = loadVisible(user, id);
  const owner = g.owner_id === user.id;
  const [d] = decorate([g], { viewer: user, ownerPool: ownPool(g.owner_id) });
  logAccess(user, KEY, 'goal', g.id, 'view');
  const who = (uid2) => { const u = userBrief(uid2); return u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en } : null; };
  d.checkins = all('SELECT * FROM goals_checkins WHERE goal_id=? ORDER BY created_at DESC LIMIT 50', g.id).map((c) => ({ id: c.id, kind: c.kind, value: c.value, progress: c.progress, note: c.note, at: c.created_at, who: who(c.user_id) }));
  d.comments = all('SELECT * FROM goals_comments WHERE goal_id=? ORDER BY created_at', g.id).map((c) => ({ id: c.id, body: c.body, at: c.created_at, author: who(c.author_id), mine: c.author_id === user.id }));
  d.is_owner = owner;
  d.owner = who(g.owner_id);
  d.can_edit = owner; d.can_comment = true;
  if (owner) {
    d.viewers = all(`SELECT a.user_id, a.action, a.at, u.name_ar, u.name_en FROM access_log a JOIN users u ON u.id=a.user_id
      WHERE a.system=? AND a.record_type='goal' AND a.record_id=? AND a.user_id<>? ORDER BY a.at DESC LIMIT 20`, KEY, g.id, user.id);
    d.shared_with = sharedWith(user);
  }
  return d;
}

// Who can see my goals marked "manager" (names only, for transparency).
export function sharedWith(user) {
  const ids = new Set();
  const lm = lineManager(user.id); if (lm) ids.add(lm);
  for (const u of all("SELECT id FROM users WHERE department_id=? AND role='manager' AND active=1 AND user_type='staff' AND id<>?", user.department_id, user.id)) ids.add(u.id);
  return [...ids].map((i) => userBrief(i)).filter(Boolean).map((u) => ({ id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en }));
}

export function summary(user) {
  if (!isStaff(user)) throw new NotFound();
  const today = localToday();
  const periods = currentPeriods(today);
  const pool = ownPool(user.id);
  const dec = decorate(pool.filter((g) => g.period_end >= addDays(today, -7)), { ownerPool: pool });
  const todays = dec.filter((g) => g.period_type === 'daily' && g.period_start === today && g.status !== 'cancelled');
  const week = dec.filter((g) => g.period_type === 'weekly' && g.period_start === periods.weekly.start && g.status !== 'cancelled');
  const missed = dec.filter((g) => g.can_carry && g.period_start >= addDays(today, -7)).sort((a, b) => b.period_start.localeCompare(a.period_start));
  const current = dec.filter((g) => g.is_current && g.status !== 'cancelled');
  // working-day streak: consecutive past working days (ending yesterday or today) with ≥1 achieved daily goal
  const achievedDays = new Set(pool.filter((g) => g.period_type === 'daily' && g.status === 'achieved').map((g) => g.period_start));
  let streak = 0; let d = achievedDays.has(today) ? today : addDays(today, -1);
  for (let i = 0; i < 120; i++) { if (!isWorkday(d)) { d = addDays(d, -1); continue; } if (!achievedDays.has(d)) break; streak++; d = addDays(d, -1); }
  const viewers = all(`SELECT a.user_id, a.action, a.at, a.record_type, u.name_ar, u.name_en FROM access_log a JOIN users u ON u.id=a.user_id
    WHERE a.system=? AND a.user_id<>? AND ((a.record_type='member' AND a.record_id=?) OR (a.record_type='goal' AND a.record_id IN (SELECT id FROM goals_goals WHERE owner_id=?)))
    ORDER BY a.at DESC LIMIT 6`, KEY, user.id, user.id, user.id);
  const team = teamIds(user);
  const avg = (list) => (list.length ? Math.round(list.reduce((s, g) => s + g.progress, 0) / list.length) : null);
  return {
    today, weekday: dow(today), workday: isWorkday(today), periods,
    today_goals: todays, today_done: todays.filter((g) => g.status === 'achieved').length, today_total: todays.length,
    week_goals: week, week_progress: avg(week), week_done: week.filter((g) => g.status === 'achieved').length,
    missed, streak,
    counts: Object.fromEntries(TYPES.map((t) => [t, current.filter((g) => g.period_type === t).length])),
    shared_count: current.filter((g) => g.visibility === 'manager').length, private_count: current.filter((g) => g.visibility === 'private').length,
    aligned_count: current.filter((g) => g.objective && !g.objective.missing).length, current_count: current.length,
    shared_with: sharedWith(user), viewers, team_size: team.length, has_any: pool.length > 0,
  };
}

// Current goals per period type (lanes) + recent history.
export function lanes(user) {
  if (!isStaff(user)) throw new NotFound();
  const today = localToday();
  const periods = currentPeriods(today);
  const pool = ownPool(user.id);
  const cur = pool.filter((g) => g.period_start === periods[g.period_type].start);
  const dec = decorate(cur, { ownerPool: pool });
  const history = decorate(pool.filter((g) => g.period_end < today && g.period_end >= addDays(today, -120)), { ownerPool: pool })
    .sort((a, b) => b.period_end.localeCompare(a.period_end) || RANK[b.period_type] - RANK[a.period_type]).slice(0, 60);
  return {
    today, periods,
    lanes: TYPES.map((t) => {
      const list = dec.filter((g) => g.period_type === t).sort((a, b) => (a.status === 'cancelled') - (b.status === 'cancelled') || a.created_at.localeCompare(b.created_at));
      const live = list.filter((g) => g.status !== 'cancelled');
      return { type: t, ...periods[t], goals: list, progress: live.length ? Math.round(live.reduce((s, g) => s + g.progress, 0) / live.length) : null, achieved: live.filter((g) => g.status === 'achieved').length, total: live.length };
    }),
    history,
  };
}

export function alignment(user) {
  if (!isStaff(user)) throw new NotFound();
  const today = localToday();
  const pool = ownPool(user.id);
  const dec = decorate(pool.filter((g) => g.period_end >= today || (['yearly', 'quarterly'].includes(g.period_type) && g.period_end >= `${today.slice(0, 4)}-01-01`)), { ownerPool: pool })
    .filter((g) => g.status !== 'cancelled');
  const objs = (() => { try { return objectivesBrief(); } catch { return []; } })();
  const byObj = new Map();
  for (const g of dec) if (g.objective?.id) { if (!byObj.has(g.objective.id)) byObj.set(g.objective.id, []); byObj.get(g.objective.id).push(g); }
  const pillars = [];
  for (const o of objs) {
    let p = pillars.find((x) => x.pillar_ar === o.pillar_ar);
    if (!p) { p = { pillar_ar: o.pillar_ar, pillar_en: o.pillar_en, objectives: [] }; pillars.push(p); }
    p.objectives.push({ ...o, goals: (byObj.get(o.id) || []).sort((a, b) => RANK[b.period_type] - RANK[a.period_type]) });
  }
  return {
    pillars, unaligned: dec.filter((g) => !g.objective || g.objective.missing).sort((a, b) => RANK[b.period_type] - RANK[a.period_type]),
    aligned_count: dec.filter((g) => g.objective && !g.objective.missing).length, total: dec.length,
  };
}

export function parentCandidates(user, type, dateIso) {
  if (!isStaff(user)) throw new NotFound();
  if (!TYPES.includes(type)) throw new BadRequest('نوع الفترة غير صالح');
  const p = periodFor(type, dateIso || localToday());
  return decorate(all(`SELECT * FROM goals_goals WHERE owner_id=? AND status='active' AND period_start<=? AND period_end>=?`, user.id, p.start, p.start).filter((g) => RANK[g.period_type] > RANK[type]), { ownerPool: ownPool(user.id) })
    .map((g) => ({ id: g.id, title: g.title, period_type: g.period_type, period_label: g.period_label, measure: g.measure }));
}

// ---------------------------------------------------------------- team (managers; shared goals only)
export function team(user) {
  if (!isStaff(user)) throw new NotFound();
  const ids = teamIds(user);
  if (!ids.length) return { members: [], is_manager: false };
  const today = localToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const rows = all(`SELECT * FROM goals_goals WHERE visibility='manager' AND owner_id IN (${inList(ids)}) AND period_end>=?`, ...ids, addDays(today, -45));
  const dec = new Map();
  for (const oid of ids) dec.set(oid, decorate(rows.filter((g) => g.owner_id === oid), { viewer: user, ownerPool: ownPool(oid) }));
  const members = staffUsers().filter((u) => ids.includes(u.id)).map((u) => {
    const list = dec.get(u.id) || [];
    const cur = list.filter((g) => g.is_current && g.status !== 'cancelled');
    return {
      id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, dept_ar: u.dept_ar, dept_en: u.dept_en,
      shared_current: cur.length, progress: cur.length ? Math.round(cur.reduce((s, g) => s + g.progress, 0) / cur.length) : null,
      achieved_month: list.filter((g) => g.status === 'achieved' && String(g.achieved_at || '').slice(0, 10) >= monthStart).length,
      aligned: cur.filter((g) => g.objective && !g.objective.missing).length,
      top: cur.sort((a, b) => RANK[b.period_type] - RANK[a.period_type]).slice(0, 3).map((g) => ({ id: g.id, title: g.title, period_type: g.period_type, progress: g.progress, status: g.status })),
    };
  });
  return { members, is_manager: true };
}
export function memberGoals(user, memberId) {
  if (!isStaff(user)) throw new NotFound();
  if (!teamIds(user).includes(memberId)) throw new NotFound('الموظف غير موجود ضمن فريقك');
  const today = localToday();
  const rows = all("SELECT * FROM goals_goals WHERE owner_id=? AND visibility='manager' AND period_end>=? ORDER BY period_start DESC", memberId, addDays(today, -90));
  logAccess(user, KEY, 'member', memberId, 'view');
  const u = userBrief(memberId);
  const goals = decorate(rows, { viewer: user, ownerPool: ownPool(memberId) }).sort((a, b) => Number(b.is_current) - Number(a.is_current) || RANK[b.period_type] - RANK[a.period_type]);
  return { member: { id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, dept_ar: u.dept_ar, dept_en: u.dept_en }, goals };
}

// ---------------------------------------------------------------- writes
const recipients = (g) => (g.visibility === 'manager' ? [g.owner_id, ...viewersOf(g.owner_id)] : [g.owner_id]);
function viewersOf(ownerId) { return staffUsers().filter((v) => v.id !== ownerId && ((v.role === 'manager' && v.department_id === one('SELECT department_id FROM users WHERE id=?', ownerId)?.department_id) || lineManager(ownerId) === v.id)).map((v) => v.id); }
function logCheckin(g, user, kind, { value = null, progress = null, note = '' } = {}) {
  const id = uid('gc_');
  run('INSERT INTO goals_checkins (id,goal_id,user_id,kind,value,progress,note,created_at) VALUES (?,?,?,?,?,?,?,?)', id, g.id, user.id, kind, value, progress, clean(note, 1000), now());
  return id;
}
const progressOf = (g) => decorate([g], { ownerPool: ownPool(g.owner_id) })[0];
function resolveObjective(input) {
  const ref = input.objective_id || input.objective_code;
  if (!ref) return null;
  const o = objectivesBrief().find((x) => x.id === ref || x.code.toLowerCase() === String(ref).toLowerCase());
  if (!o) throw new BadRequest('الهدف الاستراتيجي غير موجود في الخطة النشطة');
  return o.id;
}
function validateParent(user, parentId, type, start) {
  if (!parentId) return null;
  const p = one('SELECT * FROM goals_goals WHERE id=? AND owner_id=?', parentId, user.id);
  if (!p) throw new BadRequest('الهدف الأعلى غير موجود ضمن أهدافك');
  if (RANK[p.period_type] <= RANK[type]) throw new BadRequest('الهدف الأعلى يجب أن يكون لفترة أطول');
  if (p.status === 'cancelled') throw new BadRequest('لا يمكن الربط بهدف ملغى');
  if (!(p.period_start <= start && p.period_end >= start)) throw new BadRequest('فترة الهدف يجب أن تقع ضمن فترة الهدف الأعلى');
  return p.id;
}

export function createGoal(user, input) {
  if (!isStaff(user)) throw new NotFound();
  const title = clean(input.title, 200);
  if (title.length < 2) throw new BadRequest('عنوان الهدف مطلوب');
  const type = input.period_type;
  if (!TYPES.includes(type)) throw new BadRequest('نوع الفترة غير صالح');
  const today = localToday();
  const p = periodFor(type, input.date || today);
  if (p.end < today) throw new BadRequest('لا يمكن إضافة هدف لفترة انتهت');
  if (p.start > addDays(today, 366)) throw new BadRequest('لا يمكن التخطيط لفترة تتجاوز سنة من اليوم');
  const measure = input.measure || 'binary';
  if (!MEASURES.includes(measure)) throw new BadRequest('طريقة القياس غير صالحة');
  let target = null;
  if (measure === 'numeric') {
    target = Number(input.target_value);
    if (!Number.isFinite(target) || target <= 0 || target > 1e9) throw new BadRequest('حدد مستهدفاً رقمياً أكبر من صفر');
  }
  const items = (input.items || []).map((t) => clean(t, 200)).filter(Boolean);
  if (measure === 'checklist' && !items.length) throw new BadRequest('أضف خطوة واحدة على الأقل لقائمة التحقق');
  if (items.length > 20) throw new BadRequest('الحد الأقصى 20 خطوة');
  if (measure === 'rollup' && type === 'daily') throw new BadRequest('الهدف اليومي لا يُجمَّع من أهداف فرعية');
  const visibility = input.visibility || (RANK[type] >= RANK.monthly ? 'manager' : 'private');
  if (!['private', 'manager'].includes(visibility)) throw new BadRequest('إعداد الظهور غير صالح');
  const objectiveId = resolveObjective(input);
  const parentId = validateParent(user, input.parent_id, type, p.start);
  if ((one('SELECT COUNT(*) n FROM goals_goals WHERE owner_id=? AND period_type=? AND period_start=?', user.id, type, p.start)?.n || 0) >= MAX_PER_PERIOD) throw new Conflict(`الحد الأقصى ${MAX_PER_PERIOD} هدفاً لكل فترة — ركّز على الأهم`);
  const id = uid('g_'); const at = now();
  tx(() => {
    run(`INSERT INTO goals_goals (id,owner_id,title,description,period_type,period_start,period_end,measure,target_value,current_value,unit,status,objective_id,parent_id,visibility,carried_from,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,'active',?,?,?,?,?,?)`, id, user.id, title, clean(input.description, 2000), type, p.start, p.end, measure, target, Number(input.current_value) > 0 ? Number(input.current_value) : 0, clean(input.unit, 30), objectiveId, parentId, visibility, input.carried_from || null, at, at);
    items.forEach((t, i) => run('INSERT INTO goals_items (id,goal_id,title,sort) VALUES (?,?,?,?)', uid('gi_'), id, t, i + 1));
    logCheckin({ id }, user, 'created', { progress: 0 });
  });
  logAccess(user, KEY, 'goal', id, 'create');
  const g = one('SELECT * FROM goals_goals WHERE id=?', id);
  changed(KEY, recipients(g), id);
  return { result: progressOf(g), undo: { tool: 'goals_undo_create', input: { id } } };
}

export function updateGoal(user, id, input) {
  const g = loadOwn(user, id);
  const fields = {};
  if (input.title !== undefined) { const t = clean(input.title, 200); if (t.length < 2) throw new BadRequest('عنوان الهدف مطلوب'); fields.title = t; }
  if (input.description !== undefined) fields.description = clean(input.description, 2000);
  if (input.unit !== undefined) fields.unit = clean(input.unit, 30);
  if (input.target_value !== undefined) {
    if (g.measure !== 'numeric') throw new BadRequest('المستهدف الرقمي متاح للأهداف الرقمية فقط');
    const t = Number(input.target_value); if (!Number.isFinite(t) || t <= 0) throw new BadRequest('حدد مستهدفاً رقمياً أكبر من صفر'); fields.target_value = t;
  }
  if (input.objective_id !== undefined || input.objective_code !== undefined) fields.objective_id = input.objective_id === null && !input.objective_code ? null : resolveObjective(input);
  if (input.parent_id !== undefined) fields.parent_id = input.parent_id ? validateParent(user, input.parent_id, g.period_type, g.period_start) : null;
  if (input.visibility !== undefined && input.visibility !== g.visibility) {
    if (!['private', 'manager'].includes(input.visibility)) throw new BadRequest('إعداد الظهور غير صالح');
    if (input.confirm !== true) { const e = new Error(input.visibility === 'manager' ? 'مشاركة الهدف مع مديرك تتطلب تأكيداً صريحاً' : 'إخفاء الهدف عن مديرك يتطلب تأكيداً صريحاً'); e.status = 428; e.code = 'confirmation_required'; throw e; }
    fields.visibility = input.visibility;
  }
  if (!Object.keys(fields).length) return progressOf(g);
  const before = { ...g };
  run(`UPDATE goals_goals SET ${Object.keys(fields).map((k) => `${k}=?`).join(', ')}, updated_at=? WHERE id=?`, ...Object.values(fields), now(), g.id);
  if (fields.visibility) audit(user, 'goals.visibility', g.id, { from: g.visibility, to: fields.visibility });
  logAccess(user, KEY, 'goal', g.id, fields.visibility ? 'share' : 'update');
  const after = one('SELECT * FROM goals_goals WHERE id=?', g.id);
  changed(KEY, [...new Set([...recipients(before), ...recipients(after)])], g.id);
  return progressOf(after);
}

// Check-in: progress value / delta, done toggle, checklist item, or a note.
export function checkin(user, id, input = {}) {
  const g = loadOwn(user, id, 'تسجيل التقدم');
  const status = effectiveStatus(g);
  if (status !== 'active') throw new Conflict(status === 'missed' ? 'انتهت فترة هذا الهدف — يمكنك نقله إلى اليوم إن كان يومياً' : status === 'achieved' ? 'الهدف متحقق بالفعل — أعد فتحه لتسجيل تقدم جديد' : 'الهدف ملغى');
  const snapshot = { status: g.status, current_value: g.current_value, achieved_at: g.achieved_at, items: all('SELECT id, done_at FROM goals_items WHERE goal_id=?', g.id) };
  const at = now();
  let achieved = false; let value = null;
  const note = clean(input.note, 1000);
  tx(() => {
    if (input.item_id) {
      if (g.measure !== 'checklist') throw new BadRequest('هذا الهدف ليس قائمة تحقق');
      const it = one('SELECT * FROM goals_items WHERE id=? AND goal_id=?', input.item_id, g.id);
      if (!it) throw new NotFound('الخطوة غير موجودة');
      const on = input.item_done == null ? !it.done_at : !!input.item_done;
      run('UPDATE goals_items SET done_at=? WHERE id=?', on ? at : null, it.id);
      const left = one('SELECT COUNT(*) n FROM goals_items WHERE goal_id=? AND done_at IS NULL', g.id).n;
      achieved = left === 0;
    } else if (input.value != null || input.delta != null) {
      if (g.measure !== 'numeric') throw new BadRequest('القيمة الرقمية متاحة للأهداف الرقمية فقط');
      value = input.value != null ? Number(input.value) : g.current_value + Number(input.delta);
      if (!Number.isFinite(value) || value < 0 || value > 1e9) throw new BadRequest('قيمة غير صالحة');
      run('UPDATE goals_goals SET current_value=? WHERE id=?', value, g.id);
      achieved = g.target_value > 0 && value >= g.target_value;
    } else if (input.done === true) {
      if (g.measure === 'rollup') throw new BadRequest('يتحقق الهدف التجميعي من أهدافه الفرعية، أو اختر «تحقق» يدوياً');
      achieved = true;
      if (g.measure === 'numeric' && g.target_value) run('UPDATE goals_goals SET current_value=MAX(current_value, ?) WHERE id=?', g.target_value, g.id);
      if (g.measure === 'checklist') run('UPDATE goals_items SET done_at=COALESCE(done_at, ?) WHERE goal_id=?', at, g.id);
    } else if (!note) throw new BadRequest('لا يوجد تحديث لتسجيله');
    if (achieved) run("UPDATE goals_goals SET status='achieved', achieved_at=? WHERE id=?", at, g.id);
    run('UPDATE goals_goals SET updated_at=? WHERE id=?', at, g.id);
  });
  const after = progressOf(one('SELECT * FROM goals_goals WHERE id=?', g.id));
  const checkinId = logCheckin(g, user, achieved ? 'achieved' : input.item_id ? 'item' : value != null ? 'progress' : 'note', { value, progress: after.progress, note });
  logAccess(user, KEY, 'goal', g.id, 'checkin');
  changed(KEY, recipients(g), g.id);
  return { result: { ...after, just_achieved: achieved }, undo: { tool: 'goals_undo_checkin', input: { id: g.id, checkin_id: checkinId, snapshot: JSON.stringify(snapshot) } } };
}
export function undoCheckin(user, { id, checkin_id, snapshot }) {
  const g = loadOwn(user, id);
  const last = one('SELECT id FROM goals_checkins WHERE goal_id=? ORDER BY created_at DESC, rowid DESC LIMIT 1', g.id);
  if (last?.id !== checkin_id) throw new Conflict('سُجّل تحديث أحدث على الهدف؛ لا يمكن التراجع عن هذا التحديث');
  let s; try { s = JSON.parse(snapshot); } catch { throw new BadRequest('بيانات التراجع غير صالحة'); }
  tx(() => {
    run('UPDATE goals_goals SET status=?, current_value=?, achieved_at=?, updated_at=? WHERE id=?', s.status, s.current_value, s.achieved_at, now(), g.id);
    for (const it of s.items || []) run('UPDATE goals_items SET done_at=? WHERE id=? AND goal_id=?', it.done_at, it.id, g.id);
    run('DELETE FROM goals_checkins WHERE id=?', checkin_id);
  });
  logAccess(user, KEY, 'goal', g.id, 'undo');
  changed(KEY, recipients(g), g.id);
  return { result: progressOf(one('SELECT * FROM goals_goals WHERE id=?', g.id)) };
}

const FLOW = { active: ['achieved', 'cancelled'], achieved: ['active'], cancelled: ['active'], missed: [] };
export function setStatus(user, id, to) {
  const g = loadOwn(user, id, 'تغيير حالة الهدف');
  const from = effectiveStatus(g);
  transition(from, to, FLOW, STATUS_AR);
  const at = now();
  run('UPDATE goals_goals SET status=?, achieved_at=?, updated_at=? WHERE id=?', to, to === 'achieved' ? at : null, at, g.id);
  logCheckin(g, user, to === 'achieved' ? 'achieved' : to === 'cancelled' ? 'cancelled' : 'reopened');
  logAccess(user, KEY, 'goal', g.id, to === 'active' ? 'reopen' : to);
  changed(KEY, recipients(g), g.id);
  return progressOf(one('SELECT * FROM goals_goals WHERE id=?', g.id));
}

// Carry a missed daily goal over to today (the original stays «لم يتحقق»).
export function carry(user, id) {
  const g = loadOwn(user, id, 'نقل الهدف');
  if (g.period_type !== 'daily') throw new Conflict('النقل إلى اليوم متاح للأهداف اليومية فقط');
  if (effectiveStatus(g) !== 'missed' || g.carried_to) throw new Conflict('يمكن نقل هدف يومي فات موعده ولم يتحقق ولم يُنقل من قبل');
  const today = localToday();
  const parentOk = g.parent_id && one("SELECT 1 FROM goals_goals WHERE id=? AND status<>'cancelled' AND period_start<=? AND period_end>=?", g.parent_id, today, today);
  const items = all('SELECT title FROM goals_items WHERE goal_id=? AND done_at IS NULL ORDER BY sort', g.id).map((i) => i.title);
  let created;
  tx(() => {
    created = createGoal(user, { title: g.title, description: g.description, period_type: 'daily', date: today, measure: g.measure === 'checklist' && !items.length ? 'binary' : g.measure,
      target_value: g.target_value ?? undefined, current_value: g.current_value, unit: g.unit, objective_id: g.objective_id || undefined, parent_id: parentOk ? g.parent_id : undefined,
      visibility: g.visibility, items, carried_from: g.id }).result;
    run("UPDATE goals_goals SET status='missed', carried_to=?, updated_at=? WHERE id=?", created.id, now(), g.id);
    logCheckin(g, user, 'carried', { note: '' });
  });
  logAccess(user, KEY, 'goal', g.id, 'carry');
  changed(KEY, recipients(g), g.id);
  return created;
}

export function addItem(user, id, title) {
  const g = loadOwn(user, id);
  if (g.measure !== 'checklist') throw new BadRequest('هذا الهدف ليس قائمة تحقق');
  if (effectiveStatus(g) !== 'active') throw new Conflict('لا يمكن تعديل خطوات هدف غير نشط');
  const t = clean(title, 200); if (!t) throw new BadRequest('عنوان الخطوة مطلوب');
  if ((one('SELECT COUNT(*) n FROM goals_items WHERE goal_id=?', g.id).n) >= 20) throw new Conflict('الحد الأقصى 20 خطوة');
  run('INSERT INTO goals_items (id,goal_id,title,sort) VALUES (?,?,?,?)', uid('gi_'), g.id, t, (one('SELECT MAX(sort) m FROM goals_items WHERE goal_id=?', g.id).m || 0) + 1);
  logAccess(user, KEY, 'goal', g.id, 'update');
  changed(KEY, recipients(g), g.id);
  return progressOf(one('SELECT * FROM goals_goals WHERE id=?', g.id));
}
export function removeItem(user, id, itemId) {
  const g = loadOwn(user, id);
  const it = one('SELECT * FROM goals_items WHERE id=? AND goal_id=?', itemId, g.id);
  if (!it) throw new NotFound('الخطوة غير موجودة');
  if (one('SELECT COUNT(*) n FROM goals_items WHERE goal_id=?', g.id).n <= 1) throw new Conflict('قائمة التحقق تحتاج خطوة واحدة على الأقل');
  run('DELETE FROM goals_items WHERE id=?', it.id);
  logAccess(user, KEY, 'goal', g.id, 'update');
  changed(KEY, recipients(g), g.id);
  return progressOf(one('SELECT * FROM goals_goals WHERE id=?', g.id));
}

export function deleteGoal(user, id) {
  const g = loadOwn(user, id, 'حذف الهدف');
  tx(() => {
    run('UPDATE goals_goals SET parent_id=NULL WHERE parent_id=?', g.id);
    run('DELETE FROM goals_goals WHERE id=?', g.id);
  });
  audit(user, 'goals.delete', g.id, { period_type: g.period_type });
  logAccess(user, KEY, 'goal', g.id, 'delete');
  changed(KEY, recipients(g), g.id);
  return { id: g.id, deleted: true };
}
export function undoCreate(user, id) {
  const g = loadOwn(user, id);
  if (one('SELECT 1 FROM goals_checkins WHERE goal_id=? AND kind<>\'created\'', g.id) || one('SELECT 1 FROM goals_comments WHERE goal_id=?', g.id)) throw new Conflict('سُجّل نشاط على الهدف بعد إنشائه؛ احذفه من صفحة الهدف إن أردت');
  run('UPDATE goals_goals SET parent_id=NULL WHERE parent_id=?', g.id);
  run('DELETE FROM goals_goals WHERE id=?', g.id);
  logAccess(user, KEY, 'goal', g.id, 'delete');
  changed(KEY, recipients(g), g.id);
  return { result: { id: g.id, removed: true } };
}

export function comment(user, id, body) {
  const g = loadVisible(user, id); // the owner, or a manager allowed to see this SHARED goal
  const text = clean(body, 500);
  if (text.length < 1) throw new BadRequest('اكتب تعليقاً');
  const cid = uid('gm_');
  run('INSERT INTO goals_comments (id,goal_id,author_id,body,created_at) VALUES (?,?,?,?,?)', cid, g.id, user.id, text, now());
  logAccess(user, KEY, 'goal', g.id, 'comment');
  changed(KEY, recipients(g), g.id);
  return { id: cid, body: text };
}

export function getGoalForDelete(user, id) { return loadOwn(user, id, 'حذف الهدف'); }
export function objectivesForPicker(user) { if (!isStaff(user)) throw new NotFound(); try { return objectivesBrief(); } catch { return []; } }

// ---------------------------------------------------------------- tool helpers
export function resolveOwnGoal(user, ref) {
  const t = String(ref || '').trim();
  if (!t) throw new BadRequest('حدّد الهدف');
  const own = one('SELECT * FROM goals_goals WHERE id=? AND owner_id=?', t, user.id);
  if (own) return own;
  const today = localToday();
  const pool = all("SELECT * FROM goals_goals WHERE owner_id=? AND status='active' AND period_start<=? AND period_end>=?", user.id, addDays(today, 7), today);
  const norm = (x) => String(x || '').replace(/[ً-ْـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').toLowerCase();
  const nt = norm(t);
  const exact = pool.filter((g) => norm(g.title) === nt || nt.includes(norm(g.title)));
  if (exact.length === 1) return exact[0];
  const words = nt.split(/\s+/).map((w) => w.replace(/^(ال|وال|بال|لل)/, '')).filter((w) => w.length > 2);
  const ranked = pool.map((g) => ({ g, sc: words.filter((w) => norm(g.title).includes(w)).length })).filter((x) => x.sc > 0).sort((a, b) => b.sc - a.sc || RANK[a.g.period_type] - RANK[b.g.period_type]);
  if (!ranked.length) throw new BadRequest(`لم أجد هدفاً نشطاً مطابقاً لـ«${t}»${pool.length ? `. أهدافك النشطة: ${pool.slice(0, 6).map((g) => `«${g.title}»`).join('، ')}` : ''}`);
  const top = ranked.filter((x) => x.sc === ranked[0].sc);
  if (top.length > 1) throw new BadRequest(`وجدت أكثر من هدف مطابق: ${top.slice(0, 5).map((x) => `«${x.g.title}»`).join('، ')}. اذكر العنوان بدقة أكبر.`);
  return top[0].g;
}

// ---------------------------------------------------------------- contract for performance reviews
// goalsForReview(userId, year) → the user's yearly and quarterly goals of that
// year. The caller authorises who may read them. Only goals the owner SHARED
// with their manager are returned unless { includePrivate: true } is passed
// (e.g. when the owner reviews their own self-assessment).
export function goalsForReviewData(userId, year, { includePrivate = false } = {}) {
  const y = String(year);
  const rows = all(`SELECT * FROM goals_goals WHERE owner_id=? AND period_type IN ('yearly','quarterly') AND substr(period_start,1,4)=? ${includePrivate ? '' : "AND visibility='manager'"} ORDER BY period_type DESC, period_start`, userId, y);
  const objs = objectivesMap();
  return decorate(rows, { ownerPool: ownPool(userId), objectives: objs, viewer: includePrivate ? null : { id: null } }).map((g) => ({ id: g.id, title: g.title, period_type: g.period_type, progress: g.progress, status: g.status, objective_code: g.objective?.code || null }));
}

// ---------------------------------------------------------------- excellence points (derived; anti-farming)
export const GAME_RULES = [
  { key: 'goal_daily', points: 3, ar: 'تحقيق هدف يومي (يُحتسب هدف واحد يومياً)', en: 'Achieve a daily goal (one counted per day)' },
  { key: 'goal_weekly', points: 6, ar: 'تحقيق هدف أسبوعي خُطط له مسبقاً (حتى هدفين أسبوعياً)', en: 'Achieve a pre-planned weekly goal (up to 2 per week)' },
  { key: 'goal_monthly', points: 10, ar: 'تحقيق هدف شهري خُطط له مسبقاً (حتى هدفين شهرياً)', en: 'Achieve a pre-planned monthly goal (up to 2 per month)' },
  { key: 'goal_quarterly', points: 15, ar: 'تحقيق هدف ربع سنوي خُطط له مسبقاً (حتى هدفين لكل ربع)', en: 'Achieve a pre-planned quarterly goal (up to 2 per quarter)' },
  { key: 'goal_yearly', points: 25, ar: 'تحقيق هدف سنوي خُطط له مسبقاً (حتى ثلاثة أهداف سنوياً)', en: 'Achieve a pre-planned yearly goal (up to 3 per year)' },
];
const CAP = { daily: 1, weekly: 2, monthly: 2, quarterly: 2, yearly: 3 };
const localDay = (iso) => new Date(Date.parse(iso) + 4 * 3600e3).toISOString().slice(0, 10);
export function gameEvents(userId) {
  const out = [];
  const used = new Map();
  for (const g of all("SELECT id, title, period_type, period_start, period_end, created_at, achieved_at FROM goals_goals WHERE owner_id=? AND status='achieved' AND achieved_at IS NOT NULL ORDER BY achieved_at", userId)) {
    const day = localDay(g.achieved_at);
    if (day > g.period_end || day < g.period_start || g.created_at > g.achieved_at) continue; // achieved within its own period (never before it starts), after it was set
    if (g.period_type !== 'daily' && localDay(g.created_at) >= day) continue; // planned at least a day ahead: no instant create-and-complete
    const bucket = `${g.period_type}:${g.period_type === 'daily' ? day : g.period_start}`;
    const n = used.get(bucket) || 0;
    if (n >= CAP[g.period_type]) continue;
    used.set(bucket, n + 1);
    const rule = GAME_RULES.find((r) => r.key === `goal_${g.period_type}`);
    out.push({ kind: rule.key, points: rule.points, at: g.achieved_at, ref: g.title, id: `goals:${g.id}` });
  }
  return out;
}
export { round };
