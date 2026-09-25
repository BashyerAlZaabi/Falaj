// Strategic Performance — data model, reporting calendar, RAG evaluation and the
// authorised service functions shared by the REST routes, Ask AI tools,
// workspace cards, game events and other systems (objectivesBrief()).
//
// Visibility: every staff member may VIEW the active plan, its objectives, KPIs,
// actuals and initiatives (transparency). Writes are split by role:
//   strategy.admin (SPMO)        plan/pillars/objectives/KPIs/targets/initiatives, validate/return actuals
//   KPI owner                    submits actuals (owner user, or the manager of the owner department)
//   initiative owner             ticks milestones and links a project they can see
// Segregation of duties: nobody validates an actual they submitted.
import {
  db, one, all, run, uid, now, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, hasCap, requireCap, audit, changed, alert, transition, clean, userBrief, deptBrief,
  usersWithCap, staffUsers, inList, round,
} from '../kit.js';
import * as W from '../../services/work.js';
import { canViewProject } from '../../policy.js';

export const KEY = 'strategy';
export const ADMIN_CAP = 'strategy.admin';
export const REPORT_DAYS = 15; // actuals are due 15 days after the period closes

// ---------------------------------------------------------------- schema
export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS strategy_plans (
  id TEXT PRIMARY KEY, title_ar TEXT NOT NULL, title_en TEXT NOT NULL,
  vision_ar TEXT NOT NULL DEFAULT '', vision_en TEXT NOT NULL DEFAULT '',
  start_year INTEGER NOT NULL, end_year INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','archived')),
  is_demo INTEGER NOT NULL DEFAULT 0, created_by TEXT,
  created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_pillars (
  id TEXT PRIMARY KEY, plan_id TEXT NOT NULL REFERENCES strategy_plans(id), code TEXT NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL, UNIQUE (plan_id, code)
);
CREATE TABLE IF NOT EXISTS strategy_objectives (
  id TEXT PRIMARY KEY, pillar_id TEXT NOT NULL REFERENCES strategy_pillars(id), code TEXT NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  owner_dept_id TEXT NOT NULL REFERENCES departments(id), weight REAL NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_kpis (
  id TEXT PRIMARY KEY, objective_id TEXT NOT NULL REFERENCES strategy_objectives(id), code TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, definition_ar TEXT NOT NULL DEFAULT '', definition_en TEXT NOT NULL DEFAULT '',
  formula_ar TEXT NOT NULL DEFAULT '', unit_ar TEXT NOT NULL DEFAULT '%', unit_en TEXT NOT NULL DEFAULT '%',
  direction TEXT NOT NULL CHECK (direction IN ('higher','lower')),
  measure TEXT NOT NULL DEFAULT 'level' CHECK (measure IN ('level','cumulative')),
  frequency TEXT NOT NULL CHECK (frequency IN ('monthly','quarterly')),
  baseline REAL, baseline_year INTEGER, decimals INTEGER NOT NULL DEFAULT 1, min_value REAL, max_value REAL,
  owner_dept_id TEXT NOT NULL REFERENCES departments(id), owner_user_id TEXT REFERENCES users(id),
  data_source_ar TEXT NOT NULL DEFAULT '', data_source_en TEXT NOT NULL DEFAULT '',
  weight REAL NOT NULL DEFAULT 1, active INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_targets (
  kpi_id TEXT NOT NULL REFERENCES strategy_kpis(id) ON DELETE CASCADE, year INTEGER NOT NULL, target REAL NOT NULL,
  PRIMARY KEY (kpi_id, year)
);
CREATE TABLE IF NOT EXISTS strategy_actuals (
  id TEXT PRIMARY KEY, kpi_id TEXT NOT NULL REFERENCES strategy_kpis(id) ON DELETE CASCADE, period TEXT NOT NULL,
  value REAL NOT NULL, note TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','validated','returned')),
  submitted_by TEXT NOT NULL REFERENCES users(id), submitted_at TEXT NOT NULL, first_submitted_at TEXT NOT NULL,
  reviewed_by TEXT, reviewed_at TEXT, review_comment TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, UNIQUE (kpi_id, period)
);
CREATE TABLE IF NOT EXISTS strategy_actual_log (
  id TEXT PRIMARY KEY, actual_id TEXT NOT NULL REFERENCES strategy_actuals(id) ON DELETE CASCADE,
  action TEXT NOT NULL, user_id TEXT NOT NULL, value REAL, comment TEXT, at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_initiatives (
  id TEXT PRIMARY KEY, objective_id TEXT NOT NULL REFERENCES strategy_objectives(id), code TEXT NOT NULL,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  owner_dept_id TEXT NOT NULL REFERENCES departments(id), owner_user_id TEXT REFERENCES users(id), project_id TEXT,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','in_progress','at_risk','on_hold','completed','cancelled')),
  progress INTEGER CHECK (progress IS NULL OR (progress BETWEEN 0 AND 100)),
  start_date TEXT, end_date TEXT, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS strategy_milestones (
  id TEXT PRIMARY KEY, initiative_id TEXT NOT NULL REFERENCES strategy_initiatives(id) ON DELETE CASCADE,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL DEFAULT '', due_date TEXT, done_at TEXT, done_by TEXT,
  sort INTEGER NOT NULL DEFAULT 0, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_strategy_actuals_kpi ON strategy_actuals(kpi_id, period);
CREATE INDEX IF NOT EXISTS ix_strategy_actuals_status ON strategy_actuals(status);
CREATE INDEX IF NOT EXISTS ix_strategy_kpis_obj ON strategy_kpis(objective_id);
`);
}

// ---------------------------------------------------------------- calendar
// The entity works on Gulf Standard Time (UTC+4, no daylight saving).
export const localToday = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);
const pad = (n) => String(n).padStart(2, '0');
export const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lastDayOf = (y, m) => new Date(Date.UTC(y, m, 0)).getUTCDate();
export const MONTHS_AR = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر'];
export const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const Q_AR = ['الأول', 'الثاني', 'الثالث', 'الرابع'];
const PERIOD_RE = { monthly: /^(\d{4})-(0[1-9]|1[0-2])$/, quarterly: /^(\d{4})-Q([1-4])$/ };
export const perYear = (freq) => (freq === 'monthly' ? 12 : 4);
export const periodKey = (freq, y, i) => (freq === 'monthly' ? `${y}-${pad(i)}` : `${y}-Q${i}`);

export function parsePeriod(freq, key) {
  const m = PERIOD_RE[freq]?.exec(String(key || ''));
  if (!m) return null;
  const y = +m[1]; const i = +m[2];
  const m0 = freq === 'monthly' ? i : (i - 1) * 3 + 1; const m1 = freq === 'monthly' ? i : i * 3;
  const end = `${y}-${pad(m1)}-${pad(lastDayOf(y, m1))}`;
  return {
    key: periodKey(freq, y, i), freq, year: y, index: i, ord: y * 12 + (freq === 'monthly' ? i : i * 3),
    start: `${y}-${pad(m0)}-01`, end, due: addDays(end, REPORT_DAYS),
    label_ar: freq === 'monthly' ? `${MONTHS_AR[i - 1]} ${y}` : `الربع ${Q_AR[i - 1]} ${y}`,
    label_en: freq === 'monthly' ? `${MONTHS_EN[i - 1]} ${y}` : `Q${i} ${y}`,
    short_ar: freq === 'monthly' ? MONTHS_AR[i - 1] : `ر${i} ${String(y).slice(2)}`,
    short_en: freq === 'monthly' ? MONTHS_EN[i - 1] : `Q${i} ’${String(y).slice(2)}`,
  };
}
export function shiftPeriod(freq, key, n) {
  const p = parsePeriod(freq, key);
  const per = perYear(freq);
  const idx = p.year * per + (p.index - 1) + n;
  return periodKey(freq, Math.floor(idx / per), (idx % per) + 1);
}
// The latest period that has fully closed (its last day is before today).
export function lastClosedPeriod(freq, today = localToday()) {
  const [y, m] = today.split('-').map(Number);
  if (freq === 'monthly') return m === 1 ? periodKey('monthly', y - 1, 12) : periodKey('monthly', y, m - 1);
  const q = Math.floor((m - 1) / 3) + 1;
  return q === 1 ? periodKey('quarterly', y - 1, 4) : periodKey('quarterly', y, q - 1);
}
// All closed periods from the plan start up to the last closed one (capped at the plan end).
export function planPeriods(freq, plan, today = localToday()) {
  if (!plan) return [];
  const out = [];
  let k = periodKey(freq, plan.start_year, 1);
  const last = lastClosedPeriod(freq, today);
  const lastOrd = parsePeriod(freq, last).ord;
  for (let i = 0; i < 400; i++) {
    const p = parsePeriod(freq, k);
    if (p.ord > lastOrd || p.year > plan.end_year) break;
    out.push(p);
    k = shiftPeriod(freq, k, 1);
  }
  return out;
}

// ---------------------------------------------------------------- RAG
export const STATUS = ['on_track', 'at_risk', 'off_track', 'no_data'];
export const STATUS_AR = { on_track: 'على المسار', at_risk: 'معرّض للخطر', off_track: 'خارج المسار', no_data: 'لم يُرصد' };
export const STATUS_EN = { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track', no_data: 'Not reported' };
// Attainment of target (%). Lower-is-better KPIs are mirrored (target ÷ actual).
export function attainment(actual, target, direction) {
  if (actual == null || target == null || !Number.isFinite(+actual) || !Number.isFinite(+target)) return null;
  if (direction === 'lower') {
    if (actual <= 0) return 100;
    return round((target / actual) * 100, 1);
  }
  if (target === 0) return actual >= 0 ? 100 : 0;
  return round((actual / target) * 100, 1);
}
export function rag(att) {
  if (att == null) return 'no_data';
  if (att >= 95) return 'on_track';
  if (att >= 80) return 'at_risk';
  return 'off_track';
}
// Weighted roll-up; each item's attainment counts up to 100% so an over-achieving
// KPI can never mask another one; items without data are excluded (never zero).
export function rollup(items) {
  const totalW = items.reduce((s, i) => s + (i.weight > 0 ? i.weight : 0), 0) || items.length || 1;
  const withData = items.filter((i) => i.attainment != null);
  if (!withData.length) return { attainment: null, status: 'no_data', coverage: 0 };
  const w = withData.reduce((s, i) => s + (i.weight > 0 ? i.weight : 0), 0) || withData.length;
  const att = withData.reduce((s, i) => s + Math.min(100, i.attainment) * (i.weight > 0 ? i.weight : 1), 0) / w;
  return { attainment: round(att, 1), status: rag(att), coverage: Math.round((w / totalW) * 100) };
}

// ---------------------------------------------------------------- snapshot
export const activePlan = () => one("SELECT * FROM strategy_plans WHERE status='active' ORDER BY start_year DESC, created_at DESC LIMIT 1");
const COUNTED = new Set(['submitted', 'validated']);

// Evaluate one KPI over its closed periods: comparable value (level, or year-to-date
// for cumulative KPIs), period target, attainment and status per period.
export function evaluateKpi(kpi, actualRows, targets, plan, today = localToday()) {
  const byPeriod = new Map(actualRows.map((a) => [a.period, a]));
  const periods = planPeriods(kpi.frequency, plan, today);
  const series = [];
  const ytd = new Map(); // year -> { sum, gap }
  for (const p of periods) {
    const a = byPeriod.get(p.key) || null;
    const counted = !!a && COUNTED.has(a.status);
    const annual = targets.get(p.year) ?? null;
    let comparable = null; let target = annual;
    if (kpi.measure === 'cumulative') {
      const acc = ytd.get(p.year) || { sum: 0, gap: false };
      if (counted) acc.sum += a.value; else acc.gap = true;
      ytd.set(p.year, acc);
      comparable = counted && !acc.gap ? round(acc.sum, 3) : null;
      target = annual == null ? null : round((annual * p.index) / perYear(kpi.frequency), 3);
    } else comparable = counted ? a.value : null;
    const att = attainment(comparable, target, kpi.direction);
    series.push({
      ...p, actual_id: a?.id || null, value: a ? a.value : null, counted, comparable, target, annual_target: annual,
      attainment: att, status: counted ? rag(att) : 'no_data', actual_status: a?.status || null,
      note: a?.note || '', submitted_by: a?.submitted_by || null, submitted_at: a?.submitted_at || null, first_submitted_at: a?.first_submitted_at || null,
      reviewed_by: a?.reviewed_by || null, reviewed_at: a?.reviewed_at || null, review_comment: a?.review_comment || null,
      late: !!a && String(a.first_submitted_at).slice(0, 10) > p.due, overdue: !counted && p.due < today,
    });
  }
  const reported = series.filter((s) => s.counted);
  const last = reported.at(-1) || null;
  const lastDue = [...series].reverse().find((s) => s.due < today) || null;
  const state = last
    ? { status: last.comparable == null ? 'no_data' : last.status, attainment: last.attainment, period: last.key, period_ar: last.label_ar, period_en: last.label_en,
      value: last.value, comparable: last.comparable, target: last.target, pending: last.actual_status === 'submitted', stale: !!lastDue && last.ord < lastDue.ord }
    : { status: 'no_data', attainment: null, period: null, period_ar: null, period_en: null, value: null, comparable: null, target: null, pending: false, stale: !!lastDue };
  // trend: compare the last two reported comparable values (direction-aware)
  const prev = reported.length > 1 ? reported.at(-2) : null;
  let trend = null;
  if (last?.comparable != null && prev?.comparable != null && last.comparable !== prev.comparable) {
    const up = last.comparable > prev.comparable;
    trend = (up === (kpi.direction === 'higher')) ? 'improving' : 'worsening';
  }
  return { series, state: { ...state, trend } };
}

// Loads the whole active plan and evaluates it (small data; computed per request).
export function snapshot(today = localToday()) {
  const plan = activePlan();
  if (!plan) return { plan: null, pillars: [], objectives: [], kpis: [], overall: { attainment: null, status: 'no_data', coverage: 0 } };
  const pillars = all('SELECT * FROM strategy_pillars WHERE plan_id=? ORDER BY sort, code', plan.id);
  const pids = pillars.map((p) => p.id);
  const objectives = all(`SELECT o.*, d.name_ar AS dept_ar, d.name_en AS dept_en FROM strategy_objectives o JOIN departments d ON d.id=o.owner_dept_id WHERE o.pillar_id IN (${inList(pids)}) ORDER BY o.sort, o.code`, ...pids);
  const oids = objectives.map((o) => o.id);
  const kpis = all(`SELECT k.*, d.name_ar AS dept_ar, d.name_en AS dept_en, u.name_ar AS owner_ar, u.name_en AS owner_en
    FROM strategy_kpis k JOIN departments d ON d.id=k.owner_dept_id LEFT JOIN users u ON u.id=k.owner_user_id
    WHERE k.active=1 AND k.objective_id IN (${inList(oids)}) ORDER BY k.sort, k.code`, ...oids);
  const kids = kpis.map((k) => k.id);
  const targets = new Map();
  for (const t of all(`SELECT * FROM strategy_targets WHERE kpi_id IN (${inList(kids)})`, ...kids)) {
    if (!targets.has(t.kpi_id)) targets.set(t.kpi_id, new Map());
    targets.get(t.kpi_id).set(t.year, t.target);
  }
  const actuals = new Map();
  for (const a of all(`SELECT * FROM strategy_actuals WHERE kpi_id IN (${inList(kids)}) ORDER BY period`, ...kids)) {
    if (!actuals.has(a.kpi_id)) actuals.set(a.kpi_id, []);
    actuals.get(a.kpi_id).push(a);
  }
  for (const k of kpis) {
    const ev = evaluateKpi(k, actuals.get(k.id) || [], targets.get(k.id) || new Map(), plan, today);
    k.series = ev.series; k.state = ev.state; k.targets = targets.get(k.id) || new Map();
  }
  const objById = new Map(objectives.map((o) => [o.id, o]));
  for (const o of objectives) { o.kpis = kpis.filter((k) => k.objective_id === o.id); Object.assign(o, rollup(o.kpis.map((k) => ({ attainment: k.state.attainment, weight: k.weight })))); }
  for (const p of pillars) { p.objectives = objectives.filter((o) => o.pillar_id === p.id); Object.assign(p, rollup(p.objectives.map((o) => ({ attainment: o.attainment, weight: o.weight })))); }
  const overall = rollup(pillars.map((p) => ({ attainment: p.attainment, weight: p.weight })));
  for (const k of kpis) { const o = objById.get(k.objective_id); k.objective = o; k.pillar = pillars.find((p) => p.id === o.pillar_id); }
  return { plan, pillars, objectives, kpis, overall, today };
}

// ---------------------------------------------------------------- roles
export const isAdmin = (u) => isStaff(u) && hasCap(u, ADMIN_CAP);
// KPI owner: the named owner, or the manager of the owner department itself.
export const isKpiOwner = (u, k) => isStaff(u) && !!k && (k.owner_user_id === u.id || (u.role === 'manager' && u.department_id === k.owner_dept_id));
const allStaffIds = () => staffUsers().map((u) => u.id);
function requireViewer(user) { if (!isStaff(user)) throw new NotFound(); }

// ---------------------------------------------------------------- presenters
const kpiBrief = (k) => ({
  id: k.id, code: k.code, name_ar: k.name_ar, name_en: k.name_en, unit_ar: k.unit_ar, unit_en: k.unit_en, direction: k.direction,
  measure: k.measure, frequency: k.frequency, decimals: k.decimals, weight: k.weight,
  owner_dept_id: k.owner_dept_id, dept_ar: k.dept_ar, dept_en: k.dept_en, owner_user_id: k.owner_user_id, owner_ar: k.owner_ar, owner_en: k.owner_en,
  objective_id: k.objective_id, objective_code: k.objective?.code, objective_ar: k.objective?.title_ar, objective_en: k.objective?.title_en,
  pillar_id: k.pillar?.id, pillar_code: k.pillar?.code, pillar_ar: k.pillar?.title_ar, pillar_en: k.pillar?.title_en,
  status: k.state.status, attainment: k.state.attainment, period: k.state.period, period_ar: k.state.period_ar, period_en: k.state.period_en,
  value: k.state.value, comparable: k.state.comparable, target: k.state.target, pending: k.state.pending, stale: k.state.stale, trend: k.state.trend,
  spark: k.series.slice(-8).map((s) => ({ key: s.key, v: s.comparable, t: s.target, status: s.status })),
  is_demo: !!k.is_demo,
});
const objBrief = (o) => ({
  id: o.id, code: o.code, title_ar: o.title_ar, title_en: o.title_en, owner_dept_id: o.owner_dept_id, dept_ar: o.dept_ar, dept_en: o.dept_en,
  weight: o.weight, attainment: o.attainment, status: o.status, coverage: o.coverage,
  kpis: o.kpis.map((k) => ({ id: k.id, code: k.code, name_ar: k.name_ar, name_en: k.name_en, status: k.state.status, attainment: k.state.attainment, pending: k.state.pending })),
});
const planBrief = (p) => (p ? { id: p.id, title_ar: p.title_ar, title_en: p.title_en, vision_ar: p.vision_ar, vision_en: p.vision_en, start_year: p.start_year, end_year: p.end_year, status: p.status, is_demo: !!p.is_demo } : null);
const countBy = (list) => Object.fromEntries(STATUS.map((s) => [s, list.filter((k) => k.state.status === s).length]));

// ---------------------------------------------------------------- reads
export function getMap(user) {
  requireViewer(user);
  const s = snapshot();
  const initCounts = new Map(all('SELECT objective_id, COUNT(*) n FROM strategy_initiatives WHERE status<>\'cancelled\' GROUP BY objective_id').map((r) => [r.objective_id, r.n]));
  return {
    plan: planBrief(s.plan), overall: s.overall, counts: countBy(s.kpis), kpi_total: s.kpis.length, today: s.today,
    pillars: s.pillars.map((p) => ({ id: p.id, code: p.code, title_ar: p.title_ar, title_en: p.title_en, description_ar: p.description_ar, description_en: p.description_en, sort: p.sort, weight: p.weight, attainment: p.attainment, status: p.status, coverage: p.coverage,
      objectives: p.objectives.map((o) => ({ ...objBrief(o), initiatives: initCounts.get(o.id) || 0, mine: o.owner_dept_id === user.department_id })) })),
  };
}

export function listKpis(user, { status, department_id, pillar_id, objective_id, q, mine } = {}) {
  requireViewer(user);
  const s = snapshot();
  let rows = s.kpis;
  if (status) rows = rows.filter((k) => k.state.status === status);
  if (department_id) rows = rows.filter((k) => k.owner_dept_id === department_id);
  if (pillar_id) rows = rows.filter((k) => k.pillar?.id === pillar_id);
  if (objective_id) rows = rows.filter((k) => k.objective_id === objective_id || k.objective?.code === objective_id);
  if (mine) rows = rows.filter((k) => isKpiOwner(user, k));
  if (q) { const n = String(q).trim().toLowerCase(); rows = rows.filter((k) => [k.code, k.name_ar, k.name_en, k.objective?.code].some((x) => String(x || '').toLowerCase().includes(n))); }
  return { plan: planBrief(s.plan), counts: countBy(s.kpis), rows: rows.map((k) => ({ ...kpiBrief(k), can_submit: isKpiOwner(user, k) })) };
}

function kpiFromSnapshot(s, id) {
  const k = s.kpis.find((x) => x.id === id || x.code.toLowerCase() === String(id).toLowerCase());
  if (!k) throw new NotFound('المؤشر غير موجود في الخطة النشطة');
  return k;
}
const people = new Map();
const who = (id) => { if (!id) return null; if (!people.has(id)) { const u = userBrief(id); people.set(id, u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en } : null); } return people.get(id); };

export function getKpi(user, id) {
  requireViewer(user);
  people.clear();
  const s = snapshot();
  const k = kpiFromSnapshot(s, id);
  const history = k.series.filter((p) => p.actual_id).map((p) => p.actual_id);
  const logs = history.length ? all(`SELECT l.*, a.period FROM strategy_actual_log l JOIN strategy_actuals a ON a.id=l.actual_id WHERE l.actual_id IN (${inList(history)}) ORDER BY l.at DESC LIMIT 40`, ...history) : [];
  const window = k.frequency === 'monthly' ? 12 : 8;
  const due = ownerDueItems(user, [k], s);
  return {
    ...kpiBrief(k),
    definition_ar: k.definition_ar, definition_en: k.definition_en, formula_ar: k.formula_ar, baseline: k.baseline, baseline_year: k.baseline_year,
    min_value: k.min_value, max_value: k.max_value, data_source_ar: k.data_source_ar, data_source_en: k.data_source_en,
    owner: who(k.owner_user_id), targets: [...k.targets].map(([year, target]) => ({ year, target })).sort((a, b) => a.year - b.year),
    series: k.series.slice(-window).map((p) => ({ ...p, submitted_by: who(p.submitted_by), reviewed_by: who(p.reviewed_by) })),
    log: logs.map((l) => ({ action: l.action, at: l.at, period: l.period, value: l.value, comment: l.comment, who: who(l.user_id) })),
    can_submit: isKpiOwner(user, k), can_validate: isAdmin(user), due,
    plan: planBrief(s.plan),
  };
}

export function getObjective(user, id) {
  requireViewer(user);
  const s = snapshot();
  const o = s.objectives.find((x) => x.id === id || x.code.toLowerCase() === String(id).toLowerCase());
  if (!o) throw new NotFound('الهدف الاستراتيجي غير موجود');
  const pillar = s.pillars.find((p) => p.id === o.pillar_id);
  return {
    ...objBrief(o), description_ar: o.description_ar, description_en: o.description_en,
    pillar: { id: pillar.id, code: pillar.code, title_ar: pillar.title_ar, title_en: pillar.title_en },
    kpis: o.kpis.map((k) => ({ ...kpiBrief(k), can_submit: isKpiOwner(user, k) })),
    initiatives: listInitiatives(user, { objective_id: o.id }).rows,
  };
}

function projectView(user, projectId) {
  if (!projectId) return null;
  try {
    const p = W.getProject(user, projectId);
    return { id: p.id, name: p.name, progress: p.progress, status: p.status, delayed: p.delayed, at_risk: p.at_risk, due_date: p.due_date, expected_progress: p.expected_progress, dept_ar: p.dept_ar, dept_en: p.dept_en, tasks_total: p.tasks_total, tasks_done: p.tasks_done, available: true };
  } catch (e) {
    if (e.status === 404 || e.status === 403) return { available: false }; // out of the viewer's own project scope: nothing about it is revealed
    throw e;
  }
}
function initiativeRow(user, i, objectives) {
  const o = objectives.get(i.objective_id);
  const ms = all('SELECT * FROM strategy_milestones WHERE initiative_id=? ORDER BY sort, due_date', i.id);
  const project = projectView(user, i.project_id);
  const progress = project?.available && project.progress != null ? project.progress : i.progress;
  return {
    id: i.id, code: i.code, title_ar: i.title_ar, title_en: i.title_en, description_ar: i.description_ar, description_en: i.description_en,
    status: i.status, progress, own_progress: i.progress, progress_source: project?.available && project.progress != null ? 'project' : i.progress != null ? 'spmo' : null,
    start_date: i.start_date, end_date: i.end_date, delayed: !!i.end_date && i.end_date < localToday() && !['completed', 'cancelled'].includes(i.status),
    objective_id: i.objective_id, objective_code: o?.code, objective_ar: o?.title_ar, objective_en: o?.title_en,
    owner_dept_id: i.owner_dept_id, dept_ar: i.dept_ar, dept_en: i.dept_en, owner: i.owner_user_id ? { id: i.owner_user_id, name_ar: i.owner_ar, name_en: i.owner_en } : null,
    project, has_project: !!i.project_id,
    milestones: ms.map((m) => ({ id: m.id, title_ar: m.title_ar, title_en: m.title_en || m.title_ar, due_date: m.due_date, done: !!m.done_at, done_at: m.done_at, overdue: !m.done_at && !!m.due_date && m.due_date < localToday() })),
    milestones_done: ms.filter((m) => m.done_at).length, milestones_total: ms.length,
    can_tick: isAdmin(user) || i.owner_user_id === user.id, can_link: isAdmin(user) || i.owner_user_id === user.id, is_demo: !!i.is_demo,
  };
}
export function listInitiatives(user, { status, objective_id, department_id, q } = {}) {
  requireViewer(user);
  const plan = activePlan();
  if (!plan) return { rows: [] };
  const objectives = new Map(all('SELECT o.id,o.code,o.title_ar,o.title_en FROM strategy_objectives o JOIN strategy_pillars p ON p.id=o.pillar_id WHERE p.plan_id=?', plan.id).map((o) => [o.id, o]));
  const oids = [...objectives.keys()];
  let sql = `SELECT i.*, d.name_ar AS dept_ar, d.name_en AS dept_en, u.name_ar AS owner_ar, u.name_en AS owner_en FROM strategy_initiatives i
    JOIN departments d ON d.id=i.owner_dept_id LEFT JOIN users u ON u.id=i.owner_user_id WHERE i.objective_id IN (${inList(oids)})`;
  const params = [...oids];
  if (status) { sql += ' AND i.status=?'; params.push(status); }
  if (objective_id) { sql += ' AND i.objective_id=?'; params.push(objective_id); }
  if (department_id) { sql += ' AND i.owner_dept_id=?'; params.push(department_id); }
  if (q) { sql += ' AND (i.title_ar LIKE ? OR i.title_en LIKE ? OR i.code LIKE ?)'; const l = `%${String(q).replace(/[%_\\]/g, '')}%`; params.push(l, l, l); }
  sql += ' ORDER BY i.code';
  return { rows: all(sql, ...params).map((i) => initiativeRow(user, i, objectives)) };
}
export function getInitiative(user, id) {
  requireViewer(user);
  const r = listInitiatives(user).rows.find((i) => i.id === id);
  if (!r) throw new NotFound('المبادرة غير موجودة');
  return r;
}

// ---------------------------------------------------------------- my updates (owners) & validation queue (SPMO)
// Items an owner must report: the latest closed period (if not reported or
// returned), earlier missing periods of the current year, and returned values.
export function ownerDueItems(user, kpis, s) {
  const out = [];
  const year = Number(s.today.slice(0, 4));
  for (const k of kpis) {
    if (!isKpiOwner(user, k)) continue;
    const lastKey = lastClosedPeriod(k.frequency, s.today);
    for (const p of k.series) {
      const returned = p.actual_status === 'returned';
      const isLast = p.key === lastKey;
      if (!(returned || (!p.counted && (isLast || p.year === year)))) continue;
      out.push({
        kpi_id: k.id, code: k.code, name_ar: k.name_ar, name_en: k.name_en, unit_ar: k.unit_ar, unit_en: k.unit_en, direction: k.direction, measure: k.measure, decimals: k.decimals,
        min_value: k.min_value, max_value: k.max_value,
        period: p.key, period_ar: p.label_ar, period_en: p.label_en, due: p.due, state: returned ? 'returned' : p.due < s.today ? 'overdue' : 'due',
        target: k.measure === 'cumulative' ? p.annual_target : p.target, cumulative_target: k.measure === 'cumulative' ? p.target : null,
        previous_value: [...k.series].reverse().find((x) => x.ord < p.ord && x.counted)?.value ?? null,
        value: returned ? p.value : null, review_comment: returned ? p.review_comment : null, reviewed_by: returned ? who(p.reviewed_by) : null, actual_id: p.actual_id,
      });
    }
  }
  const rank = { returned: 0, overdue: 1, due: 2 };
  return out.sort((a, b) => rank[a.state] - rank[b.state] || a.due.localeCompare(b.due));
}

export function validationQueue(user, s = snapshot()) {
  if (!isAdmin(user)) return [];
  people.clear();
  const out = [];
  for (const k of s.kpis) for (const p of k.series) {
    if (p.actual_status !== 'submitted') continue;
    out.push({
      actual_id: p.actual_id, kpi_id: k.id, code: k.code, name_ar: k.name_ar, name_en: k.name_en, unit_ar: k.unit_ar, unit_en: k.unit_en, decimals: k.decimals,
      dept_ar: k.dept_ar, dept_en: k.dept_en, period: p.key, period_ar: p.label_ar, period_en: p.label_en, due: p.due, late: p.late,
      value: p.value, comparable: p.comparable, target: p.target, attainment: p.attainment, status: p.status, measure: k.measure, direction: k.direction,
      note: p.note, submitted_at: p.submitted_at, submitted_by: who(p.submitted_by), own: p.submitted_by === user.id,
    });
  }
  return out.sort((a, b) => String(a.submitted_at).localeCompare(String(b.submitted_at)));
}

export function updatesFor(user) {
  requireViewer(user);
  people.clear();
  const s = snapshot();
  const owned = s.kpis.filter((k) => isKpiOwner(user, k));
  const recent = all(`SELECT a.*, k.code, k.name_ar, k.name_en, k.unit_ar, k.unit_en, k.decimals, k.frequency FROM strategy_actuals a JOIN strategy_kpis k ON k.id=a.kpi_id
    WHERE a.submitted_by=? ORDER BY a.submitted_at DESC LIMIT 12`, user.id).map((a) => {
    const p = parsePeriod(a.frequency, a.period);
    return { actual_id: a.id, kpi_id: a.kpi_id, code: a.code, name_ar: a.name_ar, name_en: a.name_en, unit_ar: a.unit_ar, unit_en: a.unit_en, decimals: a.decimals, period: a.period, period_ar: p?.label_ar, period_en: p?.label_en,
      value: a.value, status: a.status, submitted_at: a.submitted_at, on_time: !!p && String(a.first_submitted_at).slice(0, 10) <= p.due, review_comment: a.review_comment, reviewed_by: who(a.reviewed_by) };
  });
  return {
    plan: planBrief(s.plan), today: s.today, report_days: REPORT_DAYS,
    owned: owned.map((k) => ({ ...kpiBrief(k), can_submit: true })),
    due: ownerDueItems(user, owned, s), recent,
    queue: validationQueue(user, s), is_admin: isAdmin(user),
  };
}

export function summary(user) {
  requireViewer(user);
  const s = snapshot();
  const owned = s.kpis.filter((k) => isKpiOwner(user, k));
  const due = ownerDueItems(user, owned, s);
  const queue = validationQueue(user, s);
  const admin = isAdmin(user);
  const landing = admin && queue.some((q) => !q.own) ? 'updates' : due.length ? 'updates' : 'map';
  return {
    plan: planBrief(s.plan), overall: s.overall, counts: countBy(s.kpis), is_admin: admin, is_owner: owned.length > 0,
    owned_count: owned.length, due_count: due.length, overdue_count: due.filter((d) => d.state !== 'due').length, queue_count: queue.length,
    queue_actionable: queue.filter((q) => !q.own).length, landing, department_id: user.department_id,
  };
}

// ---------------------------------------------------------------- writes: actuals
function kpiRow(id) {
  const plan = activePlan();
  if (!plan) throw new NotFound('لا توجد خطة استراتيجية نشطة');
  const k = one(`SELECT k.* FROM strategy_kpis k JOIN strategy_objectives o ON o.id=k.objective_id JOIN strategy_pillars p ON p.id=o.pillar_id
    WHERE p.plan_id=? AND k.active=1 AND (k.id=? OR lower(k.code)=lower(?))`, plan.id, id, id);
  if (!k) throw new NotFound('المؤشر غير موجود في الخطة النشطة');
  return { k, plan };
}
function logActual(actualId, action, userId, value = null, comment = null) {
  run('INSERT INTO strategy_actual_log (id,actual_id,action,user_id,value,comment,at) VALUES (?,?,?,?,?,?,?)', uid('sal_'), actualId, action, userId, value, comment, now());
}
const fmtVal = (v, d = 1) => (v == null ? '—' : String(round(v, d)));

export function submitActual(user, kpiId, { period, value, note } = {}) {
  if (!isStaff(user)) throw new NotFound();
  const { k, plan } = kpiRow(kpiId);
  if (!isKpiOwner(user, k)) throw new Forbidden('إدخال قيم هذا المؤشر متاح لمالكه أو لمدير الإدارة المالكة فقط');
  const today = localToday();
  const key = period || lastClosedPeriod(k.frequency, today);
  const p = parsePeriod(k.frequency, key);
  if (!p) throw new BadRequest(k.frequency === 'monthly' ? 'صيغة الفترة الشهرية غير صالحة (مثال: 2026-08)' : 'صيغة الفترة الربعية غير صالحة (مثال: 2026-Q2)');
  if (p.end >= today) throw new BadRequest('لا يمكن رصد قيمة لفترة لم تنتهِ بعد');
  if (p.year < plan.start_year || p.year > plan.end_year) throw new BadRequest('الفترة خارج نطاق الخطة الاستراتيجية النشطة');
  const v = Number(value);
  if (value == null || value === '' || !Number.isFinite(v)) throw new BadRequest('القيمة مطلوبة ويجب أن تكون رقماً');
  if (k.min_value != null && v < k.min_value) throw new BadRequest(`القيمة يجب ألا تقل عن ${k.min_value}`);
  if (k.max_value != null && v > k.max_value) throw new BadRequest(`القيمة يجب ألا تزيد على ${k.max_value}`);
  const text = clean(note, 1000);
  const existing = one('SELECT * FROM strategy_actuals WHERE kpi_id=? AND period=?', k.id, p.key);
  const at = now();
  let id;
  tx(() => {
    if (existing) {
      if (existing.status === 'validated') throw new Conflict('هذه القيمة معتمدة من إدارة المشاريع الاستراتيجية ولا يمكن تعديلها');
      id = existing.id;
      run(`UPDATE strategy_actuals SET value=?, note=?, status='submitted', submitted_by=?, submitted_at=?, reviewed_by=NULL, reviewed_at=NULL,
        review_comment=CASE WHEN status='returned' THEN review_comment ELSE NULL END WHERE id=?`, v, text, user.id, at, id);
      logActual(id, existing.status === 'returned' ? 'resubmitted' : 'updated', user.id, v, text || null);
    } else {
      id = uid('sa_');
      run('INSERT INTO strategy_actuals (id,kpi_id,period,value,note,status,submitted_by,submitted_at,first_submitted_at) VALUES (?,?,?,?,?,?,?,?,?)', id, k.id, p.key, v, text, 'submitted', user.id, at, at);
      logActual(id, 'submitted', user.id, v, text || null);
    }
  });
  audit(user, 'strategy.actual.submit', id, { kpi: k.code, period: p.key, value: v });
  for (const adminId of usersWithCap(ADMIN_CAP)) {
    if (adminId === user.id) continue;
    alert(adminId, { level: 'info', title: `قيمة مؤشر بانتظار الاعتماد: ${k.code}`, body: `${k.name_ar} — ${p.label_ar}`, system: KEY, id: k.id });
  }
  changed(KEY, allStaffIds(), k.id);
  const a = one('SELECT * FROM strategy_actuals WHERE id=?', id);
  return {
    result: { id, kpi_id: k.id, code: k.code, name_ar: k.name_ar, name_en: k.name_en, unit_ar: k.unit_ar, period: p.key, period_ar: p.label_ar, period_en: p.label_en, value: v, status: a.status, on_time: String(a.first_submitted_at).slice(0, 10) <= p.due, resubmitted: existing?.status === 'returned', value_text: fmtVal(v, k.decimals) },
    undo: existing ? null : { tool: 'strategy_undo_actual', input: { id } },
  };
}

// Withdraw a just-submitted (not yet reviewed) actual — used by Ask AI undo.
export function withdrawActual(user, id) {
  const a = one('SELECT * FROM strategy_actuals WHERE id=?', id);
  if (!a || !isStaff(user)) throw new NotFound();
  if (a.submitted_by !== user.id) throw new Forbidden('يمكن سحب القيمة لمن أدخلها فقط');
  if (a.status !== 'submitted' || one("SELECT 1 FROM strategy_actual_log WHERE actual_id=? AND action<>'submitted'", id)) throw new Conflict('لا يمكن سحب قيمة بعد مراجعتها أو تعديلها');
  run('DELETE FROM strategy_actuals WHERE id=?', id);
  audit(user, 'strategy.actual.withdraw', id, { kpi_id: a.kpi_id, period: a.period });
  changed(KEY, allStaffIds(), a.kpi_id);
  return { result: { id, withdrawn: true } };
}

const REVIEW_FLOW = { submitted: ['validated', 'returned'] };
const ACTUAL_LABELS = { submitted: 'بانتظار الاعتماد', validated: 'معتمدة', returned: 'مُعادة للمالك' };
export function reviewActual(user, actualId, { decision, comment } = {}) {
  if (!isStaff(user)) throw new NotFound();
  const a = one(`SELECT a.*, k.code, k.name_ar, k.frequency, k.owner_user_id FROM strategy_actuals a JOIN strategy_kpis k ON k.id=a.kpi_id WHERE a.id=?`, actualId);
  if (!a) throw new NotFound('القيمة غير موجودة');
  requireCap(user, ADMIN_CAP);
  if (a.submitted_by === user.id) throw new Forbidden('فصل المهام: لا يمكنك اعتماد أو إعادة قيمة أدخلتها بنفسك — يراجعها زميل آخر في إدارة المشاريع الاستراتيجية');
  const to = decision === 'validate' ? 'validated' : decision === 'return' ? 'returned' : null;
  if (!to) throw new BadRequest('القرار يجب أن يكون اعتماد أو إعادة');
  const text = clean(comment, 1000);
  if (to === 'returned' && text.length < 3) throw new BadRequest('اكتب سبب الإعادة ليتمكن مالك المؤشر من التصحيح');
  transition(a.status, to, REVIEW_FLOW, ACTUAL_LABELS);
  const at = now();
  run('UPDATE strategy_actuals SET status=?, reviewed_by=?, reviewed_at=?, review_comment=? WHERE id=?', to, user.id, at, text || null, a.id);
  logActual(a.id, to, user.id, a.value, text || null);
  audit(user, `strategy.actual.${decision}`, a.id, { kpi: a.code, period: a.period });
  const p = parsePeriod(a.frequency, a.period);
  if (to === 'returned') {
    for (const uidTo of new Set([a.submitted_by, a.owner_user_id].filter(Boolean))) {
      alert(uidTo, { level: 'warning', title: `أُعيدت قيمة المؤشر ${a.code} للمراجعة`, body: `${p?.label_ar || a.period}: ${text}`, system: KEY, id: a.kpi_id });
    }
  }
  changed(KEY, allStaffIds(), a.kpi_id);
  return { id: a.id, status: to, reviewed_at: at };
}

// ---------------------------------------------------------------- writes: initiatives (owner/SPMO)
export function toggleMilestone(user, initiativeId, milestoneId, done) {
  if (!isStaff(user)) throw new NotFound();
  const i = one('SELECT * FROM strategy_initiatives WHERE id=?', initiativeId);
  const m = i && one('SELECT * FROM strategy_milestones WHERE id=? AND initiative_id=?', milestoneId, i.id);
  if (!i || !m) throw new NotFound('المرحلة غير موجودة');
  if (!(isAdmin(user) || i.owner_user_id === user.id)) throw new Forbidden('تحديث مراحل المبادرة متاح لمالكها ولإدارة المشاريع الاستراتيجية');
  const on = done == null ? !m.done_at : !!done;
  run('UPDATE strategy_milestones SET done_at=?, done_by=? WHERE id=?', on ? now() : null, on ? user.id : null, m.id);
  audit(user, 'strategy.milestone', m.id, { done: on });
  changed(KEY, allStaffIds(), i.id);
  return { id: m.id, done: on };
}
export function linkProject(user, initiativeId, projectId) {
  if (!isStaff(user)) throw new NotFound();
  const i = one('SELECT * FROM strategy_initiatives WHERE id=?', initiativeId);
  if (!i) throw new NotFound('المبادرة غير موجودة');
  if (!(isAdmin(user) || i.owner_user_id === user.id)) throw new Forbidden('ربط المشروع متاح لمالك المبادرة ولإدارة المشاريع الاستراتيجية');
  if (projectId && !canViewProject(user, projectId)) throw new NotFound('المشروع غير موجود أو غير متاح لك');
  run('UPDATE strategy_initiatives SET project_id=?, updated_at=? WHERE id=?', projectId || null, now(), i.id);
  audit(user, 'strategy.initiative.link', i.id, { project_id: projectId || null });
  changed(KEY, allStaffIds(), i.id);
  return { id: i.id, project_id: projectId || null };
}

// ---------------------------------------------------------------- admin (strategy.admin)
const CODE = /^[A-Za-z0-9][A-Za-z0-9.\-_]{0,23}$/;
function need(user) { if (!isStaff(user)) throw new NotFound(); requireCap(user, ADMIN_CAP); }
function planOrThrow() { const p = activePlan(); if (!p) throw new NotFound('لا توجد خطة نشطة'); return p; }
const deptOk = (id) => !!one('SELECT 1 FROM departments WHERE id=? AND is_external=0', id);
const staffOk = (id) => !!one("SELECT 1 FROM users WHERE id=? AND active=1 AND user_type='staff'", id);
function codeCheck(code) { if (!CODE.test(String(code || ''))) throw new BadRequest('الرمز غير صالح (أحرف لاتينية وأرقام ونقاط وشرطات، حتى 24 حرفاً)'); return String(code).trim(); }
const broadcast = (id) => changed(KEY, allStaffIds(), id);

export function adminData(user) {
  need(user);
  const plan = activePlan();
  if (!plan) return { plan: null, pillars: [], objectives: [], kpis: [], initiatives: [], departments: [], projects: [] };
  const pillars = all('SELECT * FROM strategy_pillars WHERE plan_id=? ORDER BY sort, code', plan.id);
  const pids = pillars.map((p) => p.id);
  const objectives = all(`SELECT o.*, d.name_ar dept_ar, d.name_en dept_en FROM strategy_objectives o JOIN departments d ON d.id=o.owner_dept_id WHERE o.pillar_id IN (${inList(pids)}) ORDER BY o.sort, o.code`, ...pids);
  const oids = objectives.map((o) => o.id);
  const kpis = all(`SELECT k.*, d.name_ar dept_ar, d.name_en dept_en, u.name_ar owner_ar, u.name_en owner_en, (SELECT COUNT(*) FROM strategy_actuals a WHERE a.kpi_id=k.id) actuals
    FROM strategy_kpis k JOIN departments d ON d.id=k.owner_dept_id LEFT JOIN users u ON u.id=k.owner_user_id WHERE k.objective_id IN (${inList(oids)}) ORDER BY k.active DESC, k.sort, k.code`, ...oids);
  for (const k of kpis) k.targets = all('SELECT year, target FROM strategy_targets WHERE kpi_id=? ORDER BY year', k.id);
  const initiatives = all(`SELECT i.*, d.name_ar dept_ar, d.name_en dept_en, u.name_ar owner_ar, u.name_en owner_en FROM strategy_initiatives i JOIN departments d ON d.id=i.owner_dept_id LEFT JOIN users u ON u.id=i.owner_user_id WHERE i.objective_id IN (${inList(oids)}) ORDER BY i.code`, ...oids);
  for (const i of initiatives) {
    i.milestones = all('SELECT id,title_ar,title_en,due_date,done_at FROM strategy_milestones WHERE initiative_id=? ORDER BY sort, due_date', i.id);
    i.project_visible = i.project_id ? canViewProject(user, i.project_id) : null;
  }
  return {
    plan: planBrief(plan), pillars, objectives, kpis, initiatives,
    departments: all('SELECT id,name_ar,name_en FROM departments WHERE is_external=0 ORDER BY name_ar'),
    projects: W.listProjects(user).map((p) => ({ id: p.id, name: p.name, dept_ar: p.dept_ar, dept_en: p.dept_en })),
  };
}

export function savePlan(user, b) {
  need(user);
  const p = planOrThrow();
  const sy = b.start_year ?? p.start_year; const ey = b.end_year ?? p.end_year;
  if (!(Number.isInteger(sy) && Number.isInteger(ey) && sy >= 2000 && ey <= 2100 && ey >= sy && ey - sy <= 10)) throw new BadRequest('سنوات الخطة غير صالحة');
  run('UPDATE strategy_plans SET title_ar=?, title_en=?, vision_ar=?, vision_en=?, start_year=?, end_year=?, updated_at=? WHERE id=?',
    clean(b.title_ar ?? p.title_ar, 200) || p.title_ar, clean(b.title_en ?? p.title_en, 200) || p.title_en, clean(b.vision_ar ?? p.vision_ar, 1000), clean(b.vision_en ?? p.vision_en, 1000), sy, ey, now(), p.id);
  audit(user, 'strategy.plan.update', p.id, { start_year: sy, end_year: ey });
  broadcast(p.id);
  return planBrief(activePlan());
}

export function savePillar(user, id, b) {
  need(user);
  const plan = planOrThrow();
  const cur = id ? one('SELECT * FROM strategy_pillars WHERE id=? AND plan_id=?', id, plan.id) : null;
  if (id && !cur) throw new NotFound('المحور غير موجود');
  const code = codeCheck(b.code ?? cur?.code);
  if (one('SELECT 1 FROM strategy_pillars WHERE plan_id=? AND lower(code)=lower(?) AND id<>?', plan.id, code, id || '')) throw new Conflict('يوجد محور بنفس الرمز');
  const title = clean(b.title_ar ?? cur?.title_ar, 200);
  if (title.length < 3) throw new BadRequest('عنوان المحور مطلوب');
  const vals = [code, title, clean(b.title_en ?? cur?.title_en, 200) || title, clean(b.description_ar ?? cur?.description_ar ?? '', 1000), clean(b.description_en ?? cur?.description_en ?? '', 1000), b.weight ?? cur?.weight ?? 1, b.sort ?? cur?.sort ?? 0];
  if (cur) run('UPDATE strategy_pillars SET code=?, title_ar=?, title_en=?, description_ar=?, description_en=?, weight=?, sort=? WHERE id=?', ...vals, cur.id);
  else { id = uid('sp_'); run('INSERT INTO strategy_pillars (code,title_ar,title_en,description_ar,description_en,weight,sort,id,plan_id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)', ...vals, id, plan.id, now()); }
  audit(user, cur ? 'strategy.pillar.update' : 'strategy.pillar.create', id, { code });
  broadcast(id);
  return one('SELECT * FROM strategy_pillars WHERE id=?', id);
}
export function deletePillar(user, id) {
  need(user);
  const cur = one('SELECT * FROM strategy_pillars WHERE id=?', id);
  if (!cur) throw new NotFound('المحور غير موجود');
  if (one('SELECT 1 FROM strategy_objectives WHERE pillar_id=?', id)) throw new Conflict('لا يمكن حذف محور يضم أهدافاً استراتيجية — انقل الأهداف أو احذفها أولاً');
  run('DELETE FROM strategy_pillars WHERE id=?', id);
  audit(user, 'strategy.pillar.delete', id, { code: cur.code, title: cur.title_ar });
  broadcast(id);
  return { id, deleted: true };
}

export function saveObjective(user, id, b) {
  need(user);
  const plan = planOrThrow();
  const cur = id ? one('SELECT o.* FROM strategy_objectives o JOIN strategy_pillars p ON p.id=o.pillar_id WHERE o.id=? AND p.plan_id=?', id, plan.id) : null;
  if (id && !cur) throw new NotFound('الهدف غير موجود');
  const pillarId = b.pillar_id ?? cur?.pillar_id;
  if (!one('SELECT 1 FROM strategy_pillars WHERE id=? AND plan_id=?', pillarId, plan.id)) throw new BadRequest('المحور غير صالح');
  const code = codeCheck(b.code ?? cur?.code);
  if (one(`SELECT 1 FROM strategy_objectives o JOIN strategy_pillars p ON p.id=o.pillar_id WHERE p.plan_id=? AND lower(o.code)=lower(?) AND o.id<>?`, plan.id, code, id || '')) throw new Conflict('يوجد هدف بنفس الرمز');
  const title = clean(b.title_ar ?? cur?.title_ar, 300);
  if (title.length < 3) throw new BadRequest('عنوان الهدف مطلوب');
  const dept = b.owner_dept_id ?? cur?.owner_dept_id;
  if (!deptOk(dept)) throw new BadRequest('الإدارة المالكة غير صالحة');
  const weight = b.weight ?? cur?.weight ?? 1;
  if (!(weight > 0 && weight <= 100)) throw new BadRequest('الوزن بين 0 و100');
  const vals = [pillarId, code, title, clean(b.title_en ?? cur?.title_en, 300) || title, clean(b.description_ar ?? cur?.description_ar ?? '', 2000), clean(b.description_en ?? cur?.description_en ?? '', 2000), dept, weight, b.sort ?? cur?.sort ?? 0];
  if (cur) run('UPDATE strategy_objectives SET pillar_id=?, code=?, title_ar=?, title_en=?, description_ar=?, description_en=?, owner_dept_id=?, weight=?, sort=? WHERE id=?', ...vals, cur.id);
  else { id = uid('so_'); run('INSERT INTO strategy_objectives (pillar_id,code,title_ar,title_en,description_ar,description_en,owner_dept_id,weight,sort,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)', ...vals, id, now()); }
  audit(user, cur ? 'strategy.objective.update' : 'strategy.objective.create', id, { code });
  broadcast(id);
  return one('SELECT * FROM strategy_objectives WHERE id=?', id);
}
export function deleteObjective(user, id) {
  need(user);
  const cur = one('SELECT * FROM strategy_objectives WHERE id=?', id);
  if (!cur) throw new NotFound('الهدف غير موجود');
  if (one('SELECT 1 FROM strategy_kpis WHERE objective_id=?', id) || one('SELECT 1 FROM strategy_initiatives WHERE objective_id=?', id)) throw new Conflict('لا يمكن حذف هدف مرتبط بمؤشرات أو مبادرات — احذفها أو انقلها أولاً');
  run('DELETE FROM strategy_objectives WHERE id=?', id);
  audit(user, 'strategy.objective.delete', id, { code: cur.code, title: cur.title_ar });
  broadcast(id);
  return { id, deleted: true };
}

export function saveKpi(user, id, b) {
  need(user);
  const plan = planOrThrow();
  const cur = id ? one('SELECT * FROM strategy_kpis WHERE id=?', id) : null;
  if (id && !cur) throw new NotFound('المؤشر غير موجود');
  const objectiveId = b.objective_id ?? cur?.objective_id;
  if (!one('SELECT 1 FROM strategy_objectives o JOIN strategy_pillars p ON p.id=o.pillar_id WHERE o.id=? AND p.plan_id=?', objectiveId, plan.id)) throw new BadRequest('الهدف الاستراتيجي غير صالح');
  const code = codeCheck(b.code ?? cur?.code);
  if (one('SELECT 1 FROM strategy_kpis WHERE lower(code)=lower(?) AND id<>?', code, id || '')) throw new Conflict('يوجد مؤشر بنفس الرمز');
  const name = clean(b.name_ar ?? cur?.name_ar, 300);
  if (name.length < 3) throw new BadRequest('اسم المؤشر مطلوب');
  const direction = b.direction ?? cur?.direction; const frequency = b.frequency ?? cur?.frequency; const measure = b.measure ?? cur?.measure ?? 'level';
  if (!['higher', 'lower'].includes(direction)) throw new BadRequest('اتجاه المؤشر غير صالح');
  if (!['monthly', 'quarterly'].includes(frequency)) throw new BadRequest('دورية الرصد غير صالحة');
  if (!['level', 'cumulative'].includes(measure)) throw new BadRequest('طريقة الاحتساب غير صالحة');
  if (cur && frequency !== cur.frequency && one('SELECT 1 FROM strategy_actuals WHERE kpi_id=?', cur.id)) throw new Conflict('لا يمكن تغيير دورية مؤشر له قيم مرصودة');
  const dept = b.owner_dept_id ?? cur?.owner_dept_id;
  if (!deptOk(dept)) throw new BadRequest('الإدارة المالكة غير صالحة');
  const owner = b.owner_user_id === undefined ? cur?.owner_user_id ?? null : b.owner_user_id || null;
  if (owner && !staffOk(owner)) throw new BadRequest('مالك المؤشر يجب أن يكون موظفاً نشطاً');
  const min = b.min_value === undefined ? cur?.min_value ?? 0 : b.min_value; const max = b.max_value === undefined ? cur?.max_value ?? null : b.max_value;
  if (min != null && max != null && max <= min) throw new BadRequest('الحد الأعلى يجب أن يكون أكبر من الحد الأدنى');
  const targets = b.targets;
  if (targets) for (const t of targets) if (!(Number.isInteger(t.year) && t.year >= plan.start_year && t.year <= plan.end_year && Number.isFinite(t.target))) throw new BadRequest('المستهدفات السنوية يجب أن تقع ضمن سنوات الخطة');
  const at = now();
  const vals = [objectiveId, code, name, clean(b.name_en ?? cur?.name_en, 300) || name, clean(b.definition_ar ?? cur?.definition_ar ?? '', 2000), clean(b.definition_en ?? cur?.definition_en ?? '', 2000), clean(b.formula_ar ?? cur?.formula_ar ?? '', 1000),
    clean(b.unit_ar ?? cur?.unit_ar ?? '%', 30) || '%', clean(b.unit_en ?? cur?.unit_en ?? b.unit_ar ?? '%', 30) || '%', direction, measure, frequency,
    b.baseline === undefined ? cur?.baseline ?? null : b.baseline, b.baseline_year === undefined ? cur?.baseline_year ?? null : b.baseline_year, b.decimals ?? cur?.decimals ?? 1, min, max,
    dept, owner, clean(b.data_source_ar ?? cur?.data_source_ar ?? '', 300), clean(b.data_source_en ?? cur?.data_source_en ?? '', 300), b.weight ?? cur?.weight ?? 1, at];
  tx(() => {
    if (cur) run(`UPDATE strategy_kpis SET objective_id=?, code=?, name_ar=?, name_en=?, definition_ar=?, definition_en=?, formula_ar=?, unit_ar=?, unit_en=?, direction=?, measure=?, frequency=?, baseline=?, baseline_year=?, decimals=?, min_value=?, max_value=?, owner_dept_id=?, owner_user_id=?, data_source_ar=?, data_source_en=?, weight=?, updated_at=? WHERE id=?`, ...vals, cur.id);
    else { id = uid('sk_'); run(`INSERT INTO strategy_kpis (objective_id,code,name_ar,name_en,definition_ar,definition_en,formula_ar,unit_ar,unit_en,direction,measure,frequency,baseline,baseline_year,decimals,min_value,max_value,owner_dept_id,owner_user_id,data_source_ar,data_source_en,weight,updated_at,id,created_at) VALUES (${vals.map(() => '?').join(',')},?,?)`, ...vals, id, at); }
    if (targets) { run('DELETE FROM strategy_targets WHERE kpi_id=?', id); for (const t of targets) run('INSERT INTO strategy_targets (kpi_id,year,target) VALUES (?,?,?)', id, t.year, t.target); }
  });
  audit(user, cur ? 'strategy.kpi.update' : 'strategy.kpi.create', id, { code, targets: targets?.length });
  broadcast(id);
  return one('SELECT * FROM strategy_kpis WHERE id=?', id);
}
export function deleteKpi(user, id) {
  need(user);
  const cur = one('SELECT * FROM strategy_kpis WHERE id=?', id);
  if (!cur) throw new NotFound('المؤشر غير موجود');
  if (one('SELECT 1 FROM strategy_actuals WHERE kpi_id=?', id)) throw new Conflict('للمؤشر قيم مرصودة — أرشفه بدلاً من حذفه للحفاظ على السجل');
  run('DELETE FROM strategy_kpis WHERE id=?', id);
  audit(user, 'strategy.kpi.delete', id, { code: cur.code, name: cur.name_ar });
  broadcast(id);
  return { id, deleted: true };
}
export function setKpiActive(user, id, active) {
  need(user);
  const cur = one('SELECT * FROM strategy_kpis WHERE id=?', id);
  if (!cur) throw new NotFound('المؤشر غير موجود');
  run('UPDATE strategy_kpis SET active=?, updated_at=? WHERE id=?', active ? 1 : 0, now(), id);
  audit(user, active ? 'strategy.kpi.restore' : 'strategy.kpi.archive', id, { code: cur.code });
  broadcast(id);
  return { id, active: !!active };
}

const INIT_STATUS = ['planned', 'in_progress', 'at_risk', 'on_hold', 'completed', 'cancelled'];
export function saveInitiative(user, id, b) {
  need(user);
  const plan = planOrThrow();
  const cur = id ? one('SELECT * FROM strategy_initiatives WHERE id=?', id) : null;
  if (id && !cur) throw new NotFound('المبادرة غير موجودة');
  const objectiveId = b.objective_id ?? cur?.objective_id;
  if (!one('SELECT 1 FROM strategy_objectives o JOIN strategy_pillars p ON p.id=o.pillar_id WHERE o.id=? AND p.plan_id=?', objectiveId, plan.id)) throw new BadRequest('الهدف الاستراتيجي غير صالح');
  const code = codeCheck(b.code ?? cur?.code);
  if (one('SELECT 1 FROM strategy_initiatives WHERE lower(code)=lower(?) AND id<>?', code, id || '')) throw new Conflict('توجد مبادرة بنفس الرمز');
  const title = clean(b.title_ar ?? cur?.title_ar, 300);
  if (title.length < 3) throw new BadRequest('عنوان المبادرة مطلوب');
  const dept = b.owner_dept_id ?? cur?.owner_dept_id;
  if (!deptOk(dept)) throw new BadRequest('الإدارة المالكة غير صالحة');
  const owner = b.owner_user_id === undefined ? cur?.owner_user_id ?? null : b.owner_user_id || null;
  if (owner && !staffOk(owner)) throw new BadRequest('مالك المبادرة يجب أن يكون موظفاً نشطاً');
  const status = b.status ?? cur?.status ?? 'planned';
  if (!INIT_STATUS.includes(status)) throw new BadRequest('حالة المبادرة غير صالحة');
  let project = cur?.project_id ?? null;
  if (b.project_id !== undefined && (b.project_id || null) !== project) {
    if (b.project_id && !canViewProject(user, b.project_id)) throw new NotFound('المشروع غير موجود أو غير متاح لك');
    project = b.project_id || null;
  }
  const sd = b.start_date === undefined ? cur?.start_date ?? null : b.start_date || null; const ed = b.end_date === undefined ? cur?.end_date ?? null : b.end_date || null;
  if (sd && ed && ed < sd) throw new BadRequest('تاريخ الانتهاء قبل تاريخ البدء');
  const progress = b.progress === undefined ? cur?.progress ?? null : b.progress;
  const at = now();
  const vals = [objectiveId, code, title, clean(b.title_en ?? cur?.title_en, 300) || title, clean(b.description_ar ?? cur?.description_ar ?? '', 2000), clean(b.description_en ?? cur?.description_en ?? '', 2000), dept, owner, project, status, progress, sd, ed, at];
  if (cur) run('UPDATE strategy_initiatives SET objective_id=?, code=?, title_ar=?, title_en=?, description_ar=?, description_en=?, owner_dept_id=?, owner_user_id=?, project_id=?, status=?, progress=?, start_date=?, end_date=?, updated_at=? WHERE id=?', ...vals, cur.id);
  else { id = uid('si_'); run('INSERT INTO strategy_initiatives (objective_id,code,title_ar,title_en,description_ar,description_en,owner_dept_id,owner_user_id,project_id,status,progress,start_date,end_date,updated_at,id,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', ...vals, id, at); }
  audit(user, cur ? 'strategy.initiative.update' : 'strategy.initiative.create', id, { code, status });
  broadcast(id);
  return one('SELECT * FROM strategy_initiatives WHERE id=?', id);
}
export function deleteInitiative(user, id) {
  need(user);
  const cur = one('SELECT * FROM strategy_initiatives WHERE id=?', id);
  if (!cur) throw new NotFound('المبادرة غير موجودة');
  run('DELETE FROM strategy_initiatives WHERE id=?', id);
  audit(user, 'strategy.initiative.delete', id, { code: cur.code, title: cur.title_ar });
  broadcast(id);
  return { id, deleted: true };
}
export function saveMilestone(user, initiativeId, id, b) {
  need(user);
  const i = one('SELECT * FROM strategy_initiatives WHERE id=?', initiativeId);
  if (!i) throw new NotFound('المبادرة غير موجودة');
  const cur = id ? one('SELECT * FROM strategy_milestones WHERE id=? AND initiative_id=?', id, i.id) : null;
  if (id && !cur) throw new NotFound('المرحلة غير موجودة');
  const title = clean(b.title_ar ?? cur?.title_ar, 300);
  if (title.length < 2) throw new BadRequest('عنوان المرحلة مطلوب');
  const due = b.due_date === undefined ? cur?.due_date ?? null : b.due_date || null;
  if (cur) run('UPDATE strategy_milestones SET title_ar=?, title_en=?, due_date=? WHERE id=?', title, clean(b.title_en ?? cur.title_en, 300), due, cur.id);
  else { id = uid('sm_'); const sort = (one('SELECT MAX(sort) m FROM strategy_milestones WHERE initiative_id=?', i.id)?.m ?? 0) + 1; run('INSERT INTO strategy_milestones (id,initiative_id,title_ar,title_en,due_date,sort) VALUES (?,?,?,?,?,?)', id, i.id, title, clean(b.title_en, 300), due, sort); }
  audit(user, cur ? 'strategy.milestone.update' : 'strategy.milestone.create', id, { initiative: i.code });
  broadcast(i.id);
  return one('SELECT * FROM strategy_milestones WHERE id=?', id);
}
export function deleteMilestone(user, initiativeId, id) {
  need(user);
  const m = one('SELECT * FROM strategy_milestones WHERE id=? AND initiative_id=?', id, initiativeId);
  if (!m) throw new NotFound('المرحلة غير موجودة');
  run('DELETE FROM strategy_milestones WHERE id=?', id);
  audit(user, 'strategy.milestone.delete', id, { title: m.title_ar });
  broadcast(initiativeId);
  return { id, deleted: true };
}

// ---------------------------------------------------------------- cross-system contract
// objectivesBrief() — the active plan's strategic objectives with their status.
// Safe for any staff member (the plan is transparent to all staff).
export function objectivesBriefData() {
  const s = snapshot();
  const pillars = new Map(s.pillars.map((p) => [p.id, p]));
  return s.objectives.map((o) => ({ id: o.id, code: o.code, title_ar: o.title_ar, title_en: o.title_en, pillar_ar: pillars.get(o.pillar_id)?.title_ar, pillar_en: pillars.get(o.pillar_id)?.title_en, status: o.status }));
}

export { planBrief, kpiBrief, countBy, deptBrief };
