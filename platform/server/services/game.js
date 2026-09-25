// Gamification for a government workplace — "نقاط التميّز".
// Principles:
//  * Everything is DERIVED from real work data (tasks, progress updates, documents,
//    Agents Office reviews). No client-reported points; undoing an action removes
//    its points automatically. Quests are memoised only once observed complete.
//  * Rewards quality and timeliness (on-time/early delivery, clearing backlog,
//    transparency of progress) — not raw volume. Daily cap prevents farming.
//  * Recognition, not shaming: department challenges use aggregates; personal
//    rankings show only colleagues who opted in; nobody sees another person's
//    detailed record.
import { systemGameEvents, systemGameRules } from '../systems/registry.js';
import { one, all, run, uid, now, today } from '../db.js';
import * as P from '../policy.js';
import { weekStart } from './work.js';

const DAY = 864e5;
const DAILY_CAP = 160;
export const LEVELS = [
  { n: 1, xp: 0, ar: 'مبادر', en: 'Initiator' },
  { n: 2, xp: 120, ar: 'منجز', en: 'Achiever' },
  { n: 3, xp: 320, ar: 'متقن', en: 'Proficient' },
  { n: 4, xp: 640, ar: 'رائد', en: 'Pioneer' },
  { n: 5, xp: 1100, ar: 'مُلهِم', en: 'Inspirer' },
  { n: 6, xp: 1750, ar: 'سفير التميّز', en: 'Excellence Ambassador' },
  { n: 7, xp: 2600, ar: 'قدوة التميّز', en: 'Excellence Exemplar' },
];
export const RULES = [
  { key: 'task_done', points: 10, ar: 'إنجاز مهمة', en: 'Complete a task' },
  { key: 'on_time', points: 5, ar: 'مكافأة الالتزام بالموعد', en: 'On-time bonus' },
  { key: 'early', points: 5, ar: 'مكافأة الإنجاز المبكر (قبل الموعد بيوم أو أكثر)', en: 'Early delivery bonus (≥1 day early)' },
  { key: 'priority', points: 5, ar: 'مهمة عاجلة أو عالية الأولوية', en: 'Urgent / high-priority task' },
  { key: 'backlog', points: 8, ar: 'إغلاق مهمة متأخرة', en: 'Clear an overdue task' },
  { key: 'progress', points: 5, ar: 'تحديث نسبة إنجاز مشروع (مرة لكل مشروع يومياً)', en: 'Update project progress (once per project per day)' },
  { key: 'document', points: 8, ar: 'إعداد تقرير أو خطة أو محضر أو خطاب', en: 'Prepare a report, plan, minutes or letter' },
  { key: 'review', points: 6, ar: 'مراجعة واعتماد عمل وكيل', en: 'Review & approve agent work' },
  { key: 'agent', points: 10, ar: 'بناء وكيل لعمل متكرر (أول مرة لكل نوع)', en: 'Build an agent for recurring work (first per type)' },
  { key: 'quest', points: 15, ar: 'إكمال مهمة يومية (Quest)', en: 'Complete a daily quest' },
];
const R = Object.fromEntries(RULES.map((r) => [r.key, r.points]));

export function ensureTables() {
  run(`CREATE TABLE IF NOT EXISTS quest_log (user_id TEXT NOT NULL, day TEXT NOT NULL, quest TEXT NOT NULL, completed_at TEXT NOT NULL, PRIMARY KEY (user_id, day, quest))`);
  run(`CREATE TABLE IF NOT EXISTS game_prefs (user_id TEXT PRIMARY KEY, leaderboard_opt_in INTEGER NOT NULL DEFAULT 0, celebrations INTEGER NOT NULL DEFAULT 1, weekly_goal INTEGER NOT NULL DEFAULT 5)`);
}
ensureTables();

const dayOf = (iso) => String(iso || '').slice(0, 10);
const utcDay = (d) => new Date(d).toISOString().slice(0, 10);
const isWeekend = (iso) => { const d = new Date(`${iso}T12:00:00Z`).getUTCDay(); return d === 5 || d === 6; }; // Fri/Sat

export function prefs(userId) {
  const p = one('SELECT * FROM game_prefs WHERE user_id=?', userId);
  return { leaderboard_opt_in: !!p?.leaderboard_opt_in, celebrations: p ? !!p.celebrations : true, weekly_goal: p?.weekly_goal || 5 };
}
export function setPrefs(userId, input) {
  const cur = prefs(userId);
  const goal = input.weekly_goal == null ? cur.weekly_goal : Math.max(1, Math.min(40, parseInt(input.weekly_goal, 10) || cur.weekly_goal));
  run(`INSERT INTO game_prefs (user_id,leaderboard_opt_in,celebrations,weekly_goal) VALUES (?,?,?,?)
       ON CONFLICT(user_id) DO UPDATE SET leaderboard_opt_in=excluded.leaderboard_opt_in, celebrations=excluded.celebrations, weekly_goal=excluded.weekly_goal`,
    userId, input.leaderboard_opt_in == null ? (cur.leaderboard_opt_in ? 1 : 0) : input.leaderboard_opt_in ? 1 : 0,
    input.celebrations == null ? (cur.celebrations ? 1 : 0) : input.celebrations ? 1 : 0, goal);
  return prefs(userId);
}

// ---------- event derivation ----------
function events(userId) {
  const ev = [];
  const tasks = all(`SELECT id,title,priority,due_date,completed_at FROM tasks WHERE assignee_id=? AND status='done' AND deleted_at IS NULL AND completed_at IS NOT NULL`, userId);
  for (const t of tasks) {
    const day = dayOf(t.completed_at);
    const add = (kind, pts) => ev.push({ kind, points: pts, day, at: t.completed_at, ref: t.title, entity: 'task', id: t.id });
    add('task_done', R.task_done);
    if (t.due_date) {
      if (day <= t.due_date) add('on_time', R.on_time);
      if (Date.parse(`${t.due_date}T00:00:00Z`) - Date.parse(`${day}T00:00:00Z`) >= DAY) add('early', R.early);
      if (day > t.due_date) add('backlog', R.backlog);
    }
    if (['urgent', 'high'].includes(t.priority)) add('priority', R.priority);
  }
  const seen = new Set();
  for (const a of all(`SELECT target, detail, created_at FROM audit WHERE user_id=? AND action='project.update' ORDER BY created_at`, userId)) {
    let d = {}; try { d = JSON.parse(a.detail || '{}'); } catch {}
    if (!d.after || d.after.progress === undefined) continue;
    const k = `${a.target}:${dayOf(a.created_at)}`;
    if (seen.has(k)) continue; seen.add(k);
    const p = one('SELECT name FROM projects WHERE id=? AND deleted_at IS NULL', a.target);
    if (!p) continue;
    ev.push({ kind: 'progress', points: R.progress, day: dayOf(a.created_at), at: a.created_at, ref: p.name, entity: 'project', id: a.target });
  }
  for (const d of all(`SELECT id,title,created_at FROM documents WHERE owner_id=? AND deleted_at IS NULL AND kind IN ('report','plan','minutes','letter')`, userId))
    ev.push({ kind: 'document', points: R.document, day: dayOf(d.created_at), at: d.created_at, ref: d.title, entity: 'document', id: d.id });
  for (const r of all(`SELECT r.id, r.reviewed_at, a.name FROM office_runs r JOIN office_agents a ON a.id=r.agent_id WHERE r.owner_id=? AND r.status IN ('completed','partially_completed') AND r.reviewed_at IS NOT NULL`, userId))
    ev.push({ kind: 'review', points: R.review, day: dayOf(r.reviewed_at), at: r.reviewed_at, ref: r.name, entity: 'office_run', id: r.id });
  const tpl = new Set();
  for (const a of all(`SELECT id,template,name,created_at FROM office_agents WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at`, userId)) {
    if (tpl.has(a.template)) continue; tpl.add(a.template);
    ev.push({ kind: 'agent', points: R.agent, day: dayOf(a.created_at), at: a.created_at, ref: a.name, entity: 'office_agent', id: a.id });
  }
  // enterprise systems (goals achieved, ideas adopted, disclosures on time, …)
  for (const e of systemGameEvents(userId)) ev.push({ kind: e.kind, points: e.points, day: dayOf(e.at), at: e.at, ref: e.ref, entity: e.entity, id: e.id });
  for (const q of all('SELECT day, quest, completed_at FROM quest_log WHERE user_id=?', userId))
    ev.push({ kind: 'quest', points: R.quest, day: q.day, at: q.completed_at, ref: q.quest, entity: 'quest', id: `${q.day}:${q.quest}` });
  // daily cap (anti-farming): keep the earliest events of each day up to the cap
  ev.sort((a, b) => String(a.at).localeCompare(String(b.at)));
  const perDay = {};
  for (const e of ev) { const used = perDay[e.day] || 0; e.counted = Math.max(0, Math.min(e.points, DAILY_CAP - used)); perDay[e.day] = used + e.counted; }
  return ev;
}

function levelFor(xp) {
  let cur = LEVELS[0];
  for (const l of LEVELS) if (xp >= l.xp) cur = l;
  const next = LEVELS.find((l) => l.xp > xp) || null;
  return { n: cur.n, ar: cur.ar, en: cur.en, from: cur.xp, to: next?.xp ?? null, next_ar: next?.ar ?? null, next_en: next?.en ?? null, progress: next ? Math.round(((xp - cur.xp) / (next.xp - cur.xp)) * 100) : 100 };
}

function streak(ev) {
  const days = new Set(ev.filter((e) => e.kind !== 'quest').map((e) => e.day));
  const count = (fromIso) => {
    let n = 0; let d = new Date(`${fromIso}T12:00:00Z`);
    for (let i = 0; i < 400; i++) {
      const iso = utcDay(d);
      if (isWeekend(iso)) { d = new Date(d.getTime() - DAY); continue; } // weekends never break a streak
      if (days.has(iso)) n++; else break;
      d = new Date(d.getTime() - DAY);
    }
    return n;
  };
  const t = today();
  let current = count(t);
  if (!current) { // today not active yet → streak continues from the last working day
    let d = new Date(`${t}T12:00:00Z`); do { d = new Date(d.getTime() - DAY); } while (isWeekend(utcDay(d)));
    current = count(utcDay(d));
  }
  let best = 0; for (const day of days) best = Math.max(best, count(day));
  return { current, best: Math.max(best, current), active_today: days.has(t) };
}

// ---------- quests (today, from real state) ----------
function quests(user, ev) {
  const t = today();
  const doneToday = ev.filter((e) => e.day === t);
  const has = (kind) => doneToday.some((e) => e.kind === kind);
  const q = [];
  const open = all(`SELECT id,priority,due_date FROM tasks WHERE assignee_id=? AND status!='done' AND deleted_at IS NULL`, user.id);
  const overdue = open.filter((x) => x.due_date && x.due_date < t);
  const logged = new Set(all('SELECT quest FROM quest_log WHERE user_id=? AND day=?', user.id, t).map((r) => r.quest));
  const push = (key, ar, en, done, cta, icon) => { if (done || logged.has(key)) { q.push({ key, ar, en, done: true, cta, icon }); } else q.push({ key, ar, en, done: false, cta, icon }); };
  if (overdue.length || has('backlog') || logged.has('clear_overdue')) push('clear_overdue', `أغلق مهمة متأخرة (${overdue.length} متبقية)`, `Clear an overdue task (${overdue.length} left)`, has('backlog'), { route: '#/tasks', filter: 'overdue' }, 'alert');
  if (open.some((x) => ['urgent', 'high'].includes(x.priority)) || has('priority') || logged.has('priority_task')) push('priority_task', 'أنجز مهمة ذات أولوية عالية', 'Complete a high-priority task', has('priority'), { route: '#/tasks' }, 'zap');
  const staleCutoff = new Date(Date.now() - 7 * DAY).toISOString();
  const editable = all(`SELECT p.* FROM projects p WHERE p.deleted_at IS NULL AND p.status='active' AND (p.progress_updated_at IS NULL OR p.progress_updated_at < ?)`, staleCutoff).filter((p) => P.canViewProject(user, p.id) && P.canEditProject(user, p));
  if (editable.length || has('progress') || logged.has('update_progress')) push('update_progress', `حدّث نسبة إنجاز مشروع (${editable.length} بحاجة لتحديث)`, `Update a project's progress (${editable.length} stale)`, has('progress'), { route: editable[0] ? `#/projects/${editable[0].id}` : '#/projects' }, 'gauge');
  const pending = one("SELECT COUNT(*) n FROM office_runs WHERE owner_id=? AND status='awaiting_review'", user.id).n;
  if (pending || has('review') || logged.has('review_agents')) push('review_agents', `راجع أعمال وكلائك (${pending} بانتظارك)`, `Review your agents' work (${pending} waiting)`, has('review'), { route: '#/office' }, 'bot');
  if (q.length < 3) push('deliver_one', 'أنجز مهمة واحدة اليوم', 'Complete one task today', has('task_done'), { route: '#/tasks' }, 'check');
  // memoise newly completed quests (idempotent)
  for (const x of q) if (x.done && !logged.has(x.key)) run('INSERT OR IGNORE INTO quest_log (user_id,day,quest,completed_at) VALUES (?,?,?,?)', user.id, t, x.key, now());
  return q.slice(0, 4);
}

// ---------- badges ----------
function badges(user, ev) {
  const count = (k) => ev.filter((e) => e.kind === k).length;
  const ownOverdue = one(`SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status!='done' AND deleted_at IS NULL AND due_date < ?`, user.id, today()).n;
  const openCount = one(`SELECT COUNT(*) n FROM tasks WHERE assignee_id=? AND status!='done' AND deleted_at IS NULL`, user.id).n;
  const enabled = one(`SELECT COUNT(*) n FROM tasks WHERE created_by=? AND assignee_id!=? AND status='done' AND deleted_at IS NULL`, user.id, user.id).n;
  const st = streak(ev);
  const urgentOnTime = ev.some((e) => e.kind === 'priority' && ev.some((o) => o.kind === 'on_time' && o.id === e.id));
  const B = [
    { key: 'first_step', icon: 'sparkle', ar: 'الخطوة الأولى', en: 'First step', desc_ar: 'أنجزت أول مهمة', desc_en: 'Completed your first task', have: count('task_done'), need: 1 },
    { key: 'on_time', icon: 'clock', ar: 'في الموعد', en: 'Right on time', desc_ar: 'أنجزت 10 مهام في موعدها', desc_en: '10 tasks completed on time', have: count('on_time'), need: 10 },
    { key: 'early_bird', icon: 'rocket', ar: 'سبّاق', en: 'Early bird', desc_ar: 'أنجزت 5 مهام قبل موعدها', desc_en: '5 tasks delivered early', have: count('early'), need: 5 },
    { key: 'zero_backlog', icon: 'shield', ar: 'صفر متأخرات', en: 'Zero backlog', desc_ar: 'لا مهام متأخرة لديك (مع 3 مهام مفتوحة أو أكثر)', desc_en: 'No overdue tasks (with 3+ open tasks)', have: ownOverdue === 0 && openCount >= 3 ? 1 : 0, need: 1, live: true },
    { key: 'transparency', icon: 'gauge', ar: 'شفافية', en: 'Transparency', desc_ar: 'حدّثت نسبة الإنجاز في 5 أيام مختلفة', desc_en: 'Updated progress on 5 separate days', have: count('progress'), need: 5 },
    { key: 'documented', icon: 'fileCheck', ar: 'موثّق', en: 'Well documented', desc_ar: 'أعددت 3 تقارير أو خطط أو محاضر', desc_en: 'Prepared 3 reports, plans or minutes', have: count('document'), need: 3 },
    { key: 'agent_lead', icon: 'bot', ar: 'قائد الوكلاء', en: 'Agent lead', desc_ar: 'راجعت واعتمدت 3 أعمال وكلاء', desc_en: 'Reviewed & approved 3 agent runs', have: count('review'), need: 3 },
    { key: 'streak5', icon: 'flag', ar: 'أسبوع متواصل', en: 'Full week', desc_ar: 'سلسلة 5 أيام عمل متتالية', desc_en: '5 consecutive working days', have: st.best, need: 5 },
    { key: 'enabler', icon: 'users', ar: 'ممكّن الفريق', en: 'Team enabler', desc_ar: '5 مهام أسندتها لزملائك أُنجزت', desc_en: '5 tasks you assigned were completed', have: enabled, need: 5 },
    { key: 'service_excellence', icon: 'badgeCheck', ar: 'خدمة متميزة', en: 'Service excellence', desc_ar: 'أنجزت مهمة عاجلة/عالية الأولوية في موعدها', desc_en: 'Delivered an urgent/high task on time', have: urgentOnTime ? 1 : 0, need: 1 },
  ];
  return B.map((b) => ({ ...b, icon: b.icon === 'users' ? 'people' : b.icon, earned: b.have >= b.need, progress: Math.min(100, Math.round((b.have / b.need) * 100)) }));
}

// ---------- rings (this week) ----------
function rings(user, ev) {
  const ws = weekStart().slice(0, 10);
  const wk = ev.filter((e) => e.day >= ws);
  const goal = prefs(user.id).weekly_goal;
  const delivered = wk.filter((e) => e.kind === 'task_done').length;
  const withDue = wk.filter((e) => e.kind === 'task_done' && one('SELECT due_date FROM tasks WHERE id=?', e.id)?.due_date);
  const onTime = wk.filter((e) => e.kind === 'on_time').length;
  const engage = wk.filter((e) => ['progress', 'document', 'review'].includes(e.kind)).length;
  return [
    { key: 'deliver', ar: 'الإنجاز', en: 'Deliver', value: delivered, goal, unit_ar: 'مهام', unit_en: 'tasks', pct: Math.round((delivered / goal) * 100), color: 'series-1' },
    { key: 'on_time', ar: 'الالتزام', en: 'On time', value: withDue.length ? Math.round((onTime / withDue.length) * 100) : null, goal: 100, unit_ar: '%', unit_en: '%', pct: withDue.length ? Math.round((onTime / withDue.length) * 100) : 0, color: 'series-4' },
    { key: 'engage', ar: 'المبادرة', en: 'Initiative', value: engage, goal: 3, unit_ar: 'تحديثات', unit_en: 'updates', pct: Math.round((engage / 3) * 100), color: 'series-3' },
  ];
}

export function profile(user) {
  const ev = events(user.id);
  const xp = ev.reduce((a, e) => a + e.counted, 0);
  const q = quests(user, ev); // may memoise completions → recompute once if new
  const ev2 = q.some((x) => x.done) ? events(user.id) : ev;
  const xp2 = ev2.reduce((a, e) => a + e.counted, 0);
  const t = today();
  const ws = weekStart().slice(0, 10);
  return {
    xp: xp2, today_xp: ev2.filter((e) => e.day === t).reduce((a, e) => a + e.counted, 0), week_xp: ev2.filter((e) => e.day >= ws).reduce((a, e) => a + e.counted, 0),
    daily_cap: DAILY_CAP, level: levelFor(xp2), streak: streak(ev2), rings: rings(user, ev2), quests: q, badges: badges(user, ev2),
    recent: ev2.filter((e) => e.counted > 0).slice(-12).reverse().map((e) => ({ kind: e.kind, points: e.counted, day: e.day, ref: e.ref, entity: e.entity, id: e.id })),
    heat: (() => { const map = {}; for (const e of ev2) map[e.day] = (map[e.day] || 0) + e.counted; const out = []; for (let i = 27; i >= 0; i--) { const d = utcDay(Date.now() - i * DAY); out.push({ day: d, xp: map[d] || 0, weekend: isWeekend(d) }); } return out; })(),
    prefs: prefs(user.id), rules: [...RULES, ...systemGameRules()], levels: LEVELS, xp_counted_before: xp,
  };
}

// ---------- team challenge (aggregates) & opt-in board ----------
export function team(user) {
  const ws = weekStart().slice(0, 10);
  const depts = all('SELECT id,name_ar,name_en FROM departments');
  const board = [];
  for (const d of depts) {
    const members = all('SELECT id FROM users WHERE department_id=? AND active=1', d.id);
    if (!members.length) continue;
    const done = all(`SELECT due_date, completed_at FROM tasks WHERE department_id=? AND status='done' AND deleted_at IS NULL AND completed_at >= ?`, d.id, ws);
    const withDue = done.filter((x) => x.due_date);
    const onTime = withDue.filter((x) => dayOf(x.completed_at) <= x.due_date).length;
    const xp = members.reduce((a, m) => a + events(m.id).filter((e) => e.day >= ws).reduce((s, e) => s + e.counted, 0), 0);
    board.push({ department_id: d.id, name_ar: d.name_ar, name_en: d.name_en, members: members.length, week_done: done.length, on_time_rate: withDue.length ? Math.round((onTime / withDue.length) * 100) : null, week_xp: xp, xp_per_member: Math.round(xp / members.length), mine: d.id === user.department_id });
  }
  board.sort((a, b) => b.xp_per_member - a.xp_per_member);
  const mine = board.find((b) => b.mine);
  const goal = 90;
  // personal board: only colleagues in my department who opted in (+ me if opted in)
  const people = all(`SELECT u.id,u.name_ar,u.name_en FROM users u JOIN game_prefs g ON g.user_id=u.id WHERE g.leaderboard_opt_in=1 AND u.department_id=? AND u.active=1`, user.department_id)
    .map((u) => ({ id: u.id, name_ar: u.name_ar, name_en: u.name_en, week_xp: events(u.id).filter((e) => e.day >= ws).reduce((s, e) => s + e.counted, 0), me: u.id === user.id }))
    .sort((a, b) => b.week_xp - a.week_xp);
  return {
    week_start: ws,
    challenge: mine ? { ar: 'تحدي الالتزام بالمواعيد', en: 'On-time delivery challenge', goal, value: mine.on_time_rate, department_ar: mine.name_ar, department_en: mine.name_en, week_done: mine.week_done } : null,
    departments: board.map((b, i) => ({ ...b, rank: i + 1 })),
    people, opted_in: prefs(user.id).leaderboard_opt_in,
  };
}
