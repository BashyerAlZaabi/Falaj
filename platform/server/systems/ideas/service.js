// Ideas management — domain service. Every read/write takes the authenticated
// user and enforces scope here (the routes, Ask AI tools and intents all call
// these functions, so the same authorization applies everywhere).
//
// Visibility:
//  * staff only (external identities never reach this system);
//  * ideas are visible to all staff, except drafts (authors only) and withdrawn
//    ideas (authors + committee);
//  * "hide my name": author identity, department and co-authors are hidden from
//    peers in every list, search, filter, aggregate and comment; the committee
//    sees the identity only when it opens the idea, and every such view is
//    access-logged (the author can see who looked);
//  * committee scores/notes stay committee-only (blind until the member scores)
//    until a final decision; afterwards everyone sees an anonymous summary
//    (only when at least MIN_SCORES members evaluated).
// Segregation of duties: nobody screens, scores, decides, sponsors or closes an
// idea they authored or co-authored, and nobody votes for their own idea.
import * as K from '../kit.js';
import * as W from '../../services/work.js';
import * as P from '../../policy.js';

const { one, all, run, uid, now, today, tx, Forbidden, NotFound, BadRequest, Conflict } = K;

export const KEY = 'ideas';
export const CAP = 'ideas.committee';
export const DOMAIN = 'ideas.pool';
export const MIN_SCORES = 2;
export const WEIGHTS = { impact: 0.35, feasibility: 0.25, cost: 0.2, alignment: 0.2 };
export const CRITERIA = Object.keys(WEIGHTS);
export const CRITERIA_LABELS = { impact: ['الأثر', 'Impact'], feasibility: ['قابلية التطبيق', 'Feasibility'], cost: ['الكلفة والجدوى', 'Cost-effectiveness'], alignment: ['المواءمة الاستراتيجية', 'Strategic alignment'] };
export const CATEGORIES = {
  process: ['تبسيط الإجراءات', 'Process simplification'],
  digital: ['التحول الرقمي', 'Digital transformation'],
  service: ['تجربة المتعاملين', 'Customer experience'],
  cost: ['كفاءة الإنفاق', 'Spending efficiency'],
  people: ['بيئة العمل والموظفين', 'People & workplace'],
  sustainability: ['الاستدامة', 'Sustainability'],
  governance: ['الحوكمة والامتثال', 'Governance & compliance'],
};
export const STATUS = {
  draft: ['مسودة', 'Draft'], submitted: ['مقدّمة', 'Submitted'], screening: ['قيد الفرز', 'Screening'], evaluation: ['قيد التقييم', 'Evaluation'],
  needs_info: ['بحاجة لمعلومات', 'Needs more info'], approved: ['معتمدة', 'Approved'], rejected: ['غير معتمدة', 'Not approved'],
  in_implementation: ['قيد التنفيذ', 'In implementation'], implemented: ['مُنفّذة', 'Implemented'], withdrawn: ['مسحوبة', 'Withdrawn'],
};
const LABELS_AR = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]]));
export const statusAr = (s) => LABELS_AR[s] || s;
export const categoryAr = (c) => CATEGORIES[c]?.[0] || c;
// Explicit state machine (kit.transition enforces it).
export const FLOW = {
  draft: ['submitted'],
  submitted: ['screening', 'withdrawn'],
  screening: ['evaluation', 'needs_info', 'rejected', 'withdrawn'],
  evaluation: ['approved', 'needs_info', 'rejected'],
  needs_info: ['screening', 'evaluation', 'withdrawn'],
  approved: ['in_implementation'],
  in_implementation: ['implemented'],
};
export const DECIDED = ['approved', 'rejected', 'in_implementation', 'implemented'];
export const ADOPTED = ['approved', 'in_implementation', 'implemented'];
export const PIPELINE = ['submitted', 'screening', 'evaluation', 'needs_info'];
const SOCIAL_CLOSED = ['draft', 'withdrawn', 'rejected'];
const HAPPINESS = ['low', 'medium', 'high'];

// ---------------- schema ----------------
export function schema() {
  K.db.exec(`
CREATE TABLE IF NOT EXISTS ideas_campaigns (
  id TEXT PRIMARY KEY, title_ar TEXT NOT NULL, title_en TEXT, description_ar TEXT NOT NULL DEFAULT '', description_en TEXT,
  starts_on TEXT NOT NULL, ends_on TEXT NOT NULL, objective_id TEXT, objective_ar TEXT, objective_en TEXT,
  sponsor_id TEXT REFERENCES users(id), closed_at TEXT, closed_by TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS ideas_ideas (
  id TEXT PRIMARY KEY, ref TEXT UNIQUE, title TEXT NOT NULL, problem TEXT NOT NULL DEFAULT '', solution TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT 'process', campaign_id TEXT REFERENCES ideas_campaigns(id),
  objective_id TEXT, objective_ar TEXT, objective_en TEXT,
  expected_saving REAL, expected_hours REAL, happiness TEXT,
  author_id TEXT NOT NULL REFERENCES users(id), department_id TEXT NOT NULL REFERENCES departments(id),
  hide_author INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','screening','evaluation','needs_info','approved','rejected','in_implementation','implemented','withdrawn')),
  info_from TEXT, info_by TEXT,
  decision_note TEXT, decided_by TEXT, decided_at TEXT, final_score REAL,
  sponsor_id TEXT REFERENCES users(id), project_id TEXT, implementation_started_at TEXT,
  benefits_note TEXT, realized_saving REAL, realized_hours REAL, implemented_at TEXT,
  submitted_at TEXT, approved_at TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ideas_ideas_status ON ideas_ideas(status);
CREATE INDEX IF NOT EXISTS ideas_ideas_author ON ideas_ideas(author_id);
CREATE INDEX IF NOT EXISTS ideas_ideas_campaign ON ideas_ideas(campaign_id);
CREATE TABLE IF NOT EXISTS ideas_coauthors (
  idea_id TEXT NOT NULL REFERENCES ideas_ideas(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  PRIMARY KEY (idea_id, user_id)
);
CREATE TABLE IF NOT EXISTS ideas_votes (
  idea_id TEXT NOT NULL REFERENCES ideas_ideas(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, PRIMARY KEY (idea_id, user_id)
);
CREATE TABLE IF NOT EXISTS ideas_follows (
  idea_id TEXT NOT NULL REFERENCES ideas_ideas(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  created_at TEXT NOT NULL, PRIMARY KEY (idea_id, user_id)
);
CREATE TABLE IF NOT EXISTS ideas_comments (
  id TEXT PRIMARY KEY, idea_id TEXT NOT NULL REFERENCES ideas_ideas(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  body TEXT NOT NULL, created_at TEXT NOT NULL, deleted_at TEXT, hidden_at TEXT, hidden_by TEXT, hidden_reason TEXT, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ideas_comments_idea ON ideas_comments(idea_id);
CREATE TABLE IF NOT EXISTS ideas_scores (
  idea_id TEXT NOT NULL REFERENCES ideas_ideas(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5), feasibility INTEGER NOT NULL CHECK (feasibility BETWEEN 1 AND 5),
  cost INTEGER NOT NULL CHECK (cost BETWEEN 1 AND 5), alignment INTEGER NOT NULL CHECK (alignment BETWEEN 1 AND 5),
  note TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, PRIMARY KEY (idea_id, user_id)
);
CREATE TABLE IF NOT EXISTS ideas_history (
  id TEXT PRIMARY KEY, idea_id TEXT NOT NULL REFERENCES ideas_ideas(id) ON DELETE CASCADE,
  from_status TEXT, to_status TEXT NOT NULL, user_id TEXT NOT NULL, note TEXT, private INTEGER NOT NULL DEFAULT 0, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ideas_history_idea ON ideas_history(idea_id);
`);
}

// ---------------- strategic objectives (guarded: the strategy system may be absent) ----------------
let Strategy = null;
try { Strategy = await import('../strategy.js'); } catch { Strategy = null; }
function normObjective(o) {
  if (!o || o.id == null) return null;
  const ar = o.title_ar ?? o.name_ar ?? o.title ?? o.name ?? String(o.id);
  return { id: String(o.id), code: o.code ?? o.ref ?? null, title_ar: String(ar), title_en: String(o.title_en ?? o.name_en ?? ar) };
}
// Synchronous read (seed); async-returning implementations are treated as unavailable here.
export function objectivesSync(user) {
  const fn = Strategy?.objectivesBrief;
  if (typeof fn !== 'function') return [];
  try { const r = fn(user); return Array.isArray(r) ? r.map(normObjective).filter(Boolean) : []; } catch { return []; }
}
export async function objectives(user) {
  const fn = Strategy?.objectivesBrief;
  if (typeof fn !== 'function') return [];
  try { const r = await fn(user); return Array.isArray(r) ? r.map(normObjective).filter(Boolean) : []; } catch { return []; }
}
async function resolveObjective(user, id) {
  if (!id) return null;
  const o = (await objectives(user)).find((x) => x.id === String(id));
  if (!o) throw new BadRequest('الهدف الاستراتيجي المختار غير موجود في الخطة المعتمدة');
  return o;
}

// ---------------- scope & relationships ----------------
export const isCommittee = (user) => K.hasCap(user, CAP);
// Drafts: authors only. Withdrawn: authors + committee. Everything else: all staff.
export function scopeSql(user, a = 'i') {
  return {
    sql: `(${a}.status NOT IN ('draft','withdrawn') OR ${a}.author_id=? OR EXISTS (SELECT 1 FROM ideas_coauthors sc WHERE sc.idea_id=${a}.id AND sc.user_id=?)${isCommittee(user) ? ` OR ${a}.status='withdrawn'` : ''})`,
    params: [user.id, user.id],
  };
}
// Author identity may be used in lists/search/filters only when public or the viewer is an author.
const identitySql = (a = 'i') => `(${a}.hide_author=0 OR ${a}.author_id=? OR EXISTS (SELECT 1 FROM ideas_coauthors ic WHERE ic.idea_id=${a}.id AND ic.user_id=?))`;
export const coauthorIds = (ideaId) => all('SELECT user_id FROM ideas_coauthors WHERE idea_id=? ORDER BY user_id', ideaId).map((r) => r.user_id);
export function relOf(user, idea, co = coauthorIds(idea.id)) {
  const author = idea.author_id === user.id;
  const coauthor = co.includes(user.id);
  const owner = author || coauthor;
  const committee = isCommittee(user);
  return { author, coauthor, owner, committee, judge: committee && !owner, sponsor: !!idea.sponsor_id && idea.sponsor_id === user.id && !owner, identity: !idea.hide_author || owner || committee };
}
export function load(user, id) {
  K.requireStaff(user);
  const s = scopeSql(user);
  const idea = one(`SELECT i.* FROM ideas_ideas i WHERE i.id=? AND ${s.sql}`, String(id || ''), ...s.params);
  if (!idea) throw new NotFound('الفكرة غير موجودة أو غير متاحة لك');
  return idea;
}
const ownersOf = (idea) => [idea.author_id, ...coauthorIds(idea.id)];
const committeeIds = () => K.usersWithCap(CAP);
const followerIds = (ideaId) => all('SELECT user_id FROM ideas_follows WHERE idea_id=?', ideaId).map((r) => r.user_id);
// Realtime: the people involved (never pushes data; clients refetch through the scoped API).
function notifyIdea(idea, actor, extra = []) {
  K.changed(KEY, [...ownersOf(idea), ...followerIds(idea.id), ...committeeIds(), idea.sponsor_id, actor?.id, ...extra], idea.id);
}
function history(idea, from, to, user, note = null, priv = false, at = now()) {
  run('INSERT INTO ideas_history (id,idea_id,from_status,to_status,user_id,note,private,at) VALUES (?,?,?,?,?,?,?,?)', uid('ih_'), idea.id, from, to, user.id ?? user, note, priv ? 1 : 0, at);
}

// ---------------- presentation ----------------
const clip = (s, n) => { const t = String(s || '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1).trim()}…` : t; };
const brief = (u) => (u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, dept_ar: u.dept_ar, dept_en: u.dept_en } : null);
function agg(rows) {
  if (!rows.length) return null;
  const avg = {};
  for (const c of CRITERIA) avg[c] = K.round(rows.reduce((a, r) => a + r[c], 0) / rows.length, 1);
  const weighted = CRITERIA.reduce((a, c) => a + WEIGHTS[c] * (rows.reduce((x, r) => x + r[c], 0) / rows.length), 0);
  return { count: rows.length, avg, weighted: K.round(weighted, 2), pct: Math.round((weighted / 5) * 100) };
}
const weightedOf = (r) => K.round(CRITERIA.reduce((a, c) => a + WEIGHTS[c] * r[c], 0), 2);
function daysLeft(c) { return K.daysBetween(today(), c.ends_on); }
export function campaignState(c, t = today()) { if (c.closed_at) return 'closed'; if (t < c.starts_on) return 'upcoming'; if (t > c.ends_on) return 'closed'; return 'active'; }

const LIST_COLS = (recent) => ({
  sql: `i.*,
    (SELECT COUNT(*) FROM ideas_votes v WHERE v.idea_id=i.id) AS votes,
    (SELECT COUNT(*) FROM ideas_votes v WHERE v.idea_id=i.id AND v.created_at>=?) AS votes_recent,
    (SELECT COUNT(*) FROM ideas_comments c WHERE c.idea_id=i.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL) AS comments,
    (SELECT COUNT(*) FROM ideas_comments c WHERE c.idea_id=i.id AND c.deleted_at IS NULL AND c.hidden_at IS NULL AND c.created_at>=?) AS comments_recent,
    (SELECT COUNT(*) FROM ideas_scores s WHERE s.idea_id=i.id) AS n_scores,
    EXISTS (SELECT 1 FROM ideas_votes v WHERE v.idea_id=i.id AND v.user_id=?) AS my_vote,
    EXISTS (SELECT 1 FROM ideas_follows f WHERE f.idea_id=i.id AND f.user_id=?) AS following,
    EXISTS (SELECT 1 FROM ideas_coauthors ca WHERE ca.idea_id=i.id AND ca.user_id=?) AS is_coauthor`,
  params: [recent, recent],
});
export function selectIdeas(user, { where = '', params = [], order = 'COALESCE(i.submitted_at, i.created_at) DESC', limit = 300 } = {}) {
  K.requireStaff(user);
  const s = scopeSql(user);
  const recent = new Date(Date.now() - 14 * 864e5).toISOString();
  const cols = LIST_COLS(recent);
  return all(`SELECT ${cols.sql} FROM ideas_ideas i WHERE ${s.sql} ${where} ORDER BY ${order} LIMIT ?`, ...cols.params, user.id, user.id, user.id, ...s.params, ...params, limit);
}
const trendOf = (r) => r.votes_recent * 3 + r.comments_recent * 2 + r.votes + (r.submitted_at && Date.now() - Date.parse(r.submitted_at) < 7 * 864e5 ? 3 : 0);
// List card. Identity of hidden authors is only included for the authors themselves
// (the committee sees it when opening the idea — logged).
export function present(user, r, cache = {}) {
  const owner = r.author_id === user.id || !!r.is_coauthor;
  const identity = !r.hide_author || owner;
  cache.camps ||= new Map(all('SELECT id,title_ar,title_en FROM ideas_campaigns').map((c) => [c.id, c]));
  const camp = r.campaign_id ? cache.camps.get(r.campaign_id) : null;
  const au = identity ? K.userBrief(r.author_id) : null;
  const decided = DECIDED.includes(r.status);
  return {
    id: r.id, ref: r.ref, title: r.title, summary: clip(r.problem || r.solution, 220), category: r.category, status: r.status,
    campaign: camp ? { id: camp.id, title_ar: camp.title_ar, title_en: camp.title_en || camp.title_ar } : null,
    objective: r.objective_id ? { id: r.objective_id, title_ar: r.objective_ar, title_en: r.objective_en || r.objective_ar } : null,
    author: brief(au), author_hidden: !!r.hide_author,
    department: au ? { id: au.department_id, name_ar: au.dept_ar, name_en: au.dept_en } : null,
    impact: { saving: r.expected_saving, hours: r.expected_hours, happiness: r.happiness },
    realized: r.status === 'implemented' ? { saving: r.realized_saving, hours: r.realized_hours } : null,
    votes: r.votes ?? 0, my_vote: !!r.my_vote, comments: r.comments ?? 0, following: !!r.following, trend: trendOf(r),
    mine: owner, is_author: r.author_id === user.id,
    score_pct: decided && r.final_score != null && (r.n_scores ?? 0) >= MIN_SCORES ? Math.round((r.final_score / 5) * 100) : null,
    created_at: r.created_at, submitted_at: r.submitted_at, decided_at: r.decided_at, implemented_at: r.implemented_at, updated_at: r.updated_at,
    is_demo: !!r.is_demo,
  };
}

// ---------------- lists ----------------
const SORTS = ['trending', 'newest', 'votes'];
export function listIdeas(user, q = {}) {
  const where = []; const params = [];
  if (q.status) { if (!STATUS[q.status]) throw new BadRequest('حالة غير صالحة'); where.push('i.status=?'); params.push(q.status); }
  else where.push("i.status NOT IN ('draft','withdrawn')");
  if (q.category) { if (!CATEGORIES[q.category]) throw new BadRequest('فئة غير صالحة'); where.push('i.category=?'); params.push(q.category); }
  if (q.campaign) { where.push('i.campaign_id=?'); params.push(String(q.campaign)); }
  if (q.department) { where.push(`i.department_id=? AND ${identitySql()}`); params.push(String(q.department), user.id, user.id); }
  if (q.q) {
    const l = K.like(q.q);
    where.push(`(i.title LIKE ? OR i.problem LIKE ? OR i.solution LIKE ? OR i.ref LIKE ? OR (${identitySql()} AND EXISTS (SELECT 1 FROM users u WHERE u.id=i.author_id AND (u.name_ar LIKE ? OR u.name_en LIKE ?))))`);
    params.push(l, l, l, l, user.id, user.id, l, l);
  }
  const sort = SORTS.includes(q.sort) ? q.sort : 'trending';
  const order = sort === 'votes' ? 'votes DESC, i.submitted_at DESC' : 'COALESCE(i.submitted_at, i.created_at) DESC';
  const limit = Math.max(1, Math.min(200, parseInt(q.limit, 10) || 120));
  const cache = {};
  let rows = selectIdeas(user, { where: where.length ? `AND ${where.join(' AND ')}` : '', params, order, limit }).map((r) => present(user, r, cache));
  if (sort === 'trending') rows = rows.sort((a, b) => b.trend - a.trend || String(b.submitted_at).localeCompare(String(a.submitted_at)));
  return rows;
}
export function topIdeas(user, { limit = 5, campaign_id, period = 'all' } = {}) {
  const where = ["i.status NOT IN ('draft','withdrawn','rejected')"]; const params = [];
  if (campaign_id) { where.push('i.campaign_id=?'); params.push(campaign_id); }
  if (period === 'week' || period === 'month') { where.push('i.submitted_at>=?'); params.push(new Date(Date.now() - (period === 'week' ? 7 : 30) * 864e5).toISOString()); }
  const cache = {};
  return selectIdeas(user, { where: `AND ${where.join(' AND ')}`, params, order: 'votes DESC', limit: 200 })
    .map((r) => present(user, r, cache)).sort((a, b) => b.trend - a.trend || b.votes - a.votes).slice(0, Math.max(1, Math.min(10, limit)));
}
export function myIdeas(user) {
  K.requireStaff(user);
  const cache = {};
  const ideas = selectIdeas(user, { where: 'AND (i.author_id=? OR EXISTS (SELECT 1 FROM ideas_coauthors x WHERE x.idea_id=i.id AND x.user_id=?))', params: [user.id, user.id], order: 'i.updated_at DESC' }).map((r) => present(user, r, cache));
  const following = selectIdeas(user, { where: "AND i.status NOT IN ('draft','withdrawn') AND EXISTS (SELECT 1 FROM ideas_follows y WHERE y.idea_id=i.id AND y.user_id=?)", params: [user.id], order: 'i.updated_at DESC', limit: 50 }).map((r) => present(user, r, cache));
  const pts = gameEvents(user.id).reduce((a, e) => a + e.points, 0);
  const live = ideas.filter((i) => i.status !== 'withdrawn');
  return {
    ideas, following,
    stats: {
      total: live.filter((i) => i.status !== 'draft').length, drafts: live.filter((i) => i.status === 'draft').length,
      in_progress: live.filter((i) => PIPELINE.includes(i.status)).length, needs_info: live.filter((i) => i.status === 'needs_info' && i.is_author).length,
      adopted: live.filter((i) => ADOPTED.includes(i.status)).length, implemented: live.filter((i) => i.status === 'implemented').length,
      votes: live.reduce((a, i) => a + i.votes, 0), points: pts,
    },
  };
}

// ---------------- detail ----------------
export function detail(user, id) {
  const idea = load(user, id);
  const co = coauthorIds(idea.id);
  const rel = relOf(user, idea, co);
  if (idea.hide_author && rel.committee && !rel.owner) K.logAccess(user, KEY, 'idea_identity', idea.id, 'view');
  const row = selectIdeas(user, { where: 'AND i.id=?', params: [idea.id], limit: 1 })[0];
  const base = present(user, row);
  if (rel.identity && !base.author) {
    const au = K.userBrief(idea.author_id);
    base.author = brief(au); base.department = au ? { id: au.department_id, name_ar: au.dept_ar, name_en: au.dept_en } : null;
  }
  const privileged = rel.owner || rel.committee || (idea.sponsor_id && idea.sponsor_id === user.id);
  const scores = all('SELECT s.*, u.name_ar, u.name_en FROM ideas_scores s JOIN users u ON u.id=s.user_id WHERE s.idea_id=? ORDER BY s.created_at', idea.id);
  const project = idea.project_id ? projectBrief(user, idea.project_id) : null;
  const n = scores.length;
  const can = {
    edit: rel.author && ['draft', 'needs_info'].includes(idea.status),
    submit: rel.author && idea.status === 'draft',
    resubmit: rel.author && idea.status === 'needs_info',
    withdraw: rel.author && ['submitted', 'screening', 'needs_info'].includes(idea.status),
    delete: rel.author && idea.status === 'draft',
    vote: !rel.owner && !SOCIAL_CLOSED.includes(idea.status),
    comment: !['draft', 'withdrawn'].includes(idea.status),
    follow: !rel.owner && !['draft', 'withdrawn'].includes(idea.status),
    screen: rel.judge && idea.status === 'submitted',
    refer: rel.judge && idea.status === 'screening',
    request_info: rel.judge && ['screening', 'evaluation'].includes(idea.status),
    reject: rel.judge && ['screening', 'evaluation'].includes(idea.status),
    score: rel.judge && idea.status === 'evaluation',
    approve: rel.judge && idea.status === 'evaluation' && n >= MIN_SCORES,
    implement: (rel.judge || rel.sponsor) && idea.status === 'approved',
    complete: (rel.judge || rel.sponsor) && idea.status === 'in_implementation',
    assist: rel.judge && ['submitted', 'screening', 'evaluation', 'needs_info'].includes(idea.status),
    moderate: rel.committee,
  };
  return {
    ...base,
    problem: idea.problem, solution: idea.solution,
    coauthors: rel.identity ? co.map((u) => brief(K.userBrief(u))).filter(Boolean) : null,
    coauthor_ids: rel.committee || rel.owner ? co : undefined,
    author_id: rel.identity ? idea.author_id : undefined,
    sponsor: idea.sponsor_id ? brief(K.userBrief(idea.sponsor_id)) : null,
    decision: DECIDED.includes(idea.status) && idea.decided_at && privileged ? { note: idea.decision_note, at: idea.decided_at, by: idea.decided_by && rel.committee ? brief(K.userBrief(idea.decided_by)) : null } : null,
    info_request: idea.status === 'needs_info' && privileged ? { note: idea.decision_note, at: idea.decided_at } : null,
    evaluation: evaluationView(user, idea, rel, scores),
    project,
    benefits: ['implemented'].includes(idea.status) ? { note: idea.benefits_note, saving: idea.realized_saving, hours: idea.realized_hours, at: idea.implemented_at } : null,
    history: historyView(user, idea, rel, co, privileged),
    comments: commentsView(user, idea, rel, co),
    identity_log: idea.hide_author && rel.owner ? K.accessLog(KEY, 'idea_identity', idea.id, 30) : null,
    relation: { owner: rel.owner, author: rel.author, committee: rel.committee, judge: rel.judge, sponsor: rel.sponsor },
    can,
  };
}
function projectBrief(user, projectId) {
  if (!P.canViewProject(user, projectId)) return { linked: true, visible: false };
  try {
    const p = W.getProject(user, projectId);
    return { linked: true, visible: true, id: p.id, name: p.name, progress: p.progress, status: p.status, due_date: p.due_date, delayed: p.delayed, dept_ar: p.dept_ar, dept_en: p.dept_en };
  } catch { return { linked: true, visible: false }; }
}
function evaluationView(user, idea, rel, rows) {
  const decided = DECIDED.includes(idea.status);
  const out = { weights: WEIGHTS, min_scores: MIN_SCORES };
  if (rel.judge) {
    const mine = rows.find((r) => r.user_id === user.id) || null;
    out.view = 'committee';
    out.count = rows.length;
    out.mine = mine ? { impact: mine.impact, feasibility: mine.feasibility, cost: mine.cost, alignment: mine.alignment, note: mine.note, weighted: weightedOf(mine), updated_at: mine.updated_at } : null;
    // Blind scoring: other members' scores appear once you have scored (or after the decision).
    if (mine || decided) {
      out.members = rows.map((r) => ({ user: { id: r.user_id, name_ar: r.name_ar, name_en: r.name_en }, impact: r.impact, feasibility: r.feasibility, cost: r.cost, alignment: r.alignment, weighted: weightedOf(r), note: r.note, me: r.user_id === user.id }));
      out.aggregate = agg(rows);
    } else out.blind = true;
    return out;
  }
  if (decided && rows.length >= MIN_SCORES) return { ...out, view: 'summary', aggregate: agg(rows) };
  return { ...out, view: decided ? 'none' : 'pending' };
}
function historyView(user, idea, rel, co, privileged) {
  const authors = new Set([idea.author_id, ...co]);
  const committeeActs = ['screening', 'evaluation', 'needs_info', 'rejected', 'approved'];
  return all('SELECT h.*, u.name_ar, u.name_en FROM ideas_history h JOIN users u ON u.id=h.user_id WHERE h.idea_id=? ORDER BY h.at, h.rowid', idea.id).map((h) => {
    let who;
    if (authors.has(h.user_id) && !rel.identity) who = { role: 'author' };
    else if (committeeActs.includes(h.to_status) && h.from_status !== 'needs_info' && !rel.committee) who = { role: 'committee' };
    else who = { id: h.user_id, name_ar: h.name_ar, name_en: h.name_en };
    return { at: h.at, from: h.from_status, to: h.to_status, who, note: h.private && !privileged ? null : h.note, private: !!h.private };
  });
}
function commentsView(user, idea, rel, co) {
  const authors = new Set([idea.author_id, ...co]);
  return all('SELECT c.*, u.name_ar, u.name_en FROM ideas_comments c JOIN users u ON u.id=c.user_id WHERE c.idea_id=? AND c.deleted_at IS NULL ORDER BY c.created_at', idea.id).map((c) => {
    const byAuthor = authors.has(c.user_id);
    const hidden = !!c.hidden_at;
    const mine = c.user_id === user.id;
    return {
      id: c.id, created_at: c.created_at, hidden, mine, by_idea_author: byAuthor,
      body: !hidden || rel.committee || mine ? c.body : null,
      hidden_reason: hidden && (rel.committee || mine) ? c.hidden_reason : null,
      user: !byAuthor || rel.identity ? { id: c.user_id, name_ar: c.name_ar, name_en: c.name_en } : null,
      can_delete: mine && !hidden, can_hide: rel.committee && !hidden && !mine,
      is_demo: !!c.is_demo,
    };
  });
}

// ---------------- create / edit / submit ----------------
export const IdeaInput = K.S({
  title: K.str('Short title of the idea', { maxLength: 140 }),
  problem: K.str('The problem or opportunity', { maxLength: 3000 }),
  solution: K.str('The proposed solution', { maxLength: 4000 }),
  category: K.str('Category', { enum: Object.keys(CATEGORIES) }),
  campaign_id: K.str('Challenge (campaign) id', { maxLength: 64 }),
  objective_id: K.str('Strategic objective id', { maxLength: 64 }),
  expected_saving: K.num('Expected annual saving in AED', { minimum: 0, maximum: 1e9 }),
  expected_hours: K.num('Expected work hours saved per year', { minimum: 0, maximum: 1e6 }),
  happiness: K.str('Expected customer-happiness impact', { enum: HAPPINESS }),
  coauthor_ids: K.arr(K.str('user id', { maxLength: 64 }), { maxItems: 6 }),
  hide_author: K.bool('Hide my name from colleagues (the committee still sees it)'),
  submit: K.bool('Send to the committee now (otherwise saved as a draft)'),
});
function openCampaign(id, { forSubmit }) {
  if (!id) return null;
  const c = one('SELECT * FROM ideas_campaigns WHERE id=?', id);
  if (!c) throw new BadRequest('التحدي المختار غير موجود');
  const st = campaignState(c);
  if (st === 'closed') throw new Conflict(`انتهى موعد المشاركة في «${c.title_ar}»`);
  if (forSubmit && st === 'upcoming') throw new Conflict(`لم تبدأ المشاركة في «${c.title_ar}» بعد`);
  return c;
}
function checkCoauthors(user, ids = []) {
  const out = [...new Set(ids.map(String))].filter((x) => x !== user.id);
  for (const id of out) if (!one("SELECT 1 FROM users WHERE id=? AND active=1 AND user_type='staff'", id)) throw new BadRequest('أحد الشركاء المختارين غير صالح');
  return out;
}
function completeness(v) {
  if (K.clean(v.problem).length < 20) throw new BadRequest('صِف المشكلة أو الفرصة في 20 حرفاً على الأقل قبل الإرسال');
  if (K.clean(v.solution).length < 20) throw new BadRequest('صِف الحل المقترح في 20 حرفاً على الأقل قبل الإرسال');
}
function nextRef() {
  const y = new Date().getUTCFullYear();
  const n = one("SELECT MAX(CAST(substr(ref, 11) AS INTEGER)) n FROM ideas_ideas WHERE ref LIKE ?", `IDEA-${y}-%`)?.n || 0;
  return `IDEA-${y}-${String(n + 1).padStart(3, '0')}`;
}
function alertCommittee(idea, title, body, level = 'info') {
  const owners = new Set(ownersOf(idea));
  for (const id of committeeIds()) if (!owners.has(id)) K.alert(id, { level, title, body, system: KEY, id: idea.id });
}
export async function createIdea(user, input) {
  K.requireStaff(user);
  const v = K.check(IdeaInput, input);
  const title = K.clean(v.title, 140);
  if (title.length < 4) throw new BadRequest('عنوان الفكرة قصير جداً (4 أحرف على الأقل)');
  const submit = !!v.submit;
  if (submit) completeness(v);
  const camp = openCampaign(v.campaign_id, { forSubmit: submit });
  const obj = await resolveObjective(user, v.objective_id);
  const co = checkCoauthors(user, v.coauthor_ids);
  const id = uid('idea_'); const t = now();
  tx(() => {
    run(`INSERT INTO ideas_ideas (id,ref,title,problem,solution,category,campaign_id,objective_id,objective_ar,objective_en,expected_saving,expected_hours,happiness,author_id,department_id,hide_author,status,submitted_at,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, nextRef(), title, K.clean(v.problem, 3000), K.clean(v.solution, 4000), v.category || 'process', camp?.id || null,
    obj?.id || null, obj?.title_ar || null, obj?.title_en || null, v.expected_saving ?? null, v.expected_hours ?? null, v.happiness || null,
    user.id, user.department_id, v.hide_author ? 1 : 0, submit ? 'submitted' : 'draft', submit ? t : null, user.id, t, t);
    for (const c of co) run('INSERT INTO ideas_coauthors (idea_id,user_id) VALUES (?,?)', id, c);
    history({ id }, null, submit ? 'submitted' : 'draft', user, null, false, t);
  });
  const idea = one('SELECT * FROM ideas_ideas WHERE id=?', id);
  K.audit(user, submit ? 'ideas.submit' : 'ideas.draft', id, { title, campaign: camp?.id || null });
  if (submit) alertCommittee(idea, `فكرة جديدة بانتظار الفرز: «${clip(title, 80)}»`, `${idea.ref}${camp ? ` · ${camp.title_ar}` : ''}`);
  if (submit) notifyIdea(idea, user); else K.changed(KEY, [user.id, ...co], id);
  return detail(user, id);
}
export async function updateIdea(user, id, input) {
  const idea = load(user, id);
  const rel = relOf(user, idea);
  if (!rel.author) throw new Forbidden('يعدّل الفكرة مقدّمها فقط');
  if (!['draft', 'needs_info'].includes(idea.status)) throw new Conflict(`لا يمكن تعديل فكرة في حالة «${statusAr(idea.status)}»`);
  const v = K.check(IdeaInput, input);
  if (v.submit !== undefined) throw new BadRequest('استخدم إجراء الإرسال لإرسال الفكرة');
  const f = {};
  if (v.title !== undefined) { const t = K.clean(v.title, 140); if (t.length < 4) throw new BadRequest('عنوان الفكرة قصير جداً (4 أحرف على الأقل)'); f.title = t; }
  if (v.problem !== undefined) f.problem = K.clean(v.problem, 3000);
  if (v.solution !== undefined) f.solution = K.clean(v.solution, 4000);
  if (v.category !== undefined) f.category = v.category;
  for (const k of ['expected_saving', 'expected_hours']) if (k in (input || {})) f[k] = v[k] ?? null;
  if ('happiness' in (input || {})) f.happiness = v.happiness || null;
  if (v.hide_author !== undefined) f.hide_author = v.hide_author ? 1 : 0;
  // Unchanged references are kept as they are (a challenge may have closed since the idea was entered).
  if ('campaign_id' in (input || {}) && (v.campaign_id || null) !== idea.campaign_id) f.campaign_id = openCampaign(v.campaign_id, { forSubmit: false })?.id || null;
  if ('objective_id' in (input || {}) && (v.objective_id || null) !== idea.objective_id) { const o = await resolveObjective(user, v.objective_id); f.objective_id = o?.id || null; f.objective_ar = o?.title_ar || null; f.objective_en = o?.title_en || null; }
  const co = v.coauthor_ids !== undefined ? checkCoauthors(user, v.coauthor_ids) : null;
  if (!Object.keys(f).length && !co) throw new BadRequest('لا توجد حقول للتحديث');
  f.updated_at = now();
  tx(() => {
    const keys = Object.keys(f);
    run(`UPDATE ideas_ideas SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => f[k]), idea.id);
    if (co) { run('DELETE FROM ideas_coauthors WHERE idea_id=?', idea.id); for (const c of co) run('INSERT INTO ideas_coauthors (idea_id,user_id) VALUES (?,?)', idea.id, c); }
  });
  K.audit(user, 'ideas.update', idea.id, { fields: Object.keys(f).filter((k) => k !== 'updated_at'), coauthors: co ? co.length : undefined });
  notifyIdea(one('SELECT * FROM ideas_ideas WHERE id=?', idea.id), user);
  return detail(user, idea.id);
}
// draft → submitted, or needs_info → back to the stage that asked (with the author's response).
export function submitIdea(user, id, input = {}) {
  const v = K.check(K.S({ response: K.str('Response to the committee', { maxLength: 2000 }) }), input);
  const idea = load(user, id);
  if (!relOf(user, idea).author) throw new Forbidden('يرسل الفكرة مقدّمها فقط');
  completeness(idea);
  if (idea.campaign_id && idea.status === 'draft') openCampaign(idea.campaign_id, { forSubmit: true });
  const t = now();
  if (idea.status === 'draft') {
    K.transition(idea.status, 'submitted', FLOW, LABELS_AR);
    tx(() => {
      run("UPDATE ideas_ideas SET status='submitted', submitted_at=?, updated_at=? WHERE id=?", t, t, idea.id);
      history(idea, 'draft', 'submitted', user, null, false, t);
    });
    K.audit(user, 'ideas.submit', idea.id, {});
    const fresh = one('SELECT * FROM ideas_ideas WHERE id=?', idea.id);
    alertCommittee(fresh, `فكرة جديدة بانتظار الفرز: «${clip(idea.title, 80)}»`, idea.ref);
    notifyIdea(fresh, user);
    return detail(user, idea.id);
  }
  if (idea.status !== 'needs_info') throw new Conflict(`لا يمكن إرسال فكرة في حالة «${statusAr(idea.status)}»`);
  const response = K.clean(v.response, 2000);
  if (response.length < 5) throw new BadRequest('اكتب ردّك على ملاحظات اللجنة');
  const back = FLOW.needs_info.includes(idea.info_from) && idea.info_from !== 'withdrawn' ? idea.info_from : 'screening';
  K.transition(idea.status, back, FLOW, LABELS_AR);
  tx(() => {
    run('UPDATE ideas_ideas SET status=?, updated_at=? WHERE id=?', back, t, idea.id);
    history(idea, 'needs_info', back, user, response, true, t);
  });
  K.audit(user, 'ideas.resubmit', idea.id, { to: back });
  const fresh = one('SELECT * FROM ideas_ideas WHERE id=?', idea.id);
  const asker = idea.info_by && committeeIds().includes(idea.info_by) ? idea.info_by : null;
  if (asker) K.alert(asker, { title: `أُعيد إرسال الفكرة بعد استكمال المعلومات: «${clip(idea.title, 80)}»`, body: idea.ref, system: KEY, id: idea.id });
  else alertCommittee(fresh, `أُعيد إرسال الفكرة بعد استكمال المعلومات: «${clip(idea.title, 80)}»`, idea.ref);
  notifyIdea(fresh, user);
  return detail(user, idea.id);
}
const ConfirmBody = K.S({ confirm: K.bool('explicit confirmation') });
export function withdrawIdea(user, id, body = {}) {
  K.check(ConfirmBody, body);
  const idea = load(user, id);
  if (!relOf(user, idea).author) throw new Forbidden('يسحب الفكرة مقدّمها فقط');
  K.transition(idea.status, 'withdrawn', FLOW, LABELS_AR);
  K.requireConfirm(body, 'سحب الفكرة يتطلب تأكيداً صريحاً');
  const t = now();
  tx(() => { run("UPDATE ideas_ideas SET status='withdrawn', updated_at=? WHERE id=?", t, idea.id); history(idea, idea.status, 'withdrawn', user, null, false, t); });
  K.audit(user, 'ideas.withdraw', idea.id, { from: idea.status });
  notifyIdea(idea, user);
  return { id: idea.id, status: 'withdrawn' };
}
export function deleteDraft(user, id, body = {}) {
  K.check(ConfirmBody, body);
  const idea = load(user, id);
  if (!relOf(user, idea).author) throw new Forbidden('يحذف المسودة صاحبها فقط');
  if (idea.status !== 'draft') throw new Conflict('يمكن حذف المسودات فقط؛ استخدم «سحب الفكرة» بعد الإرسال');
  K.requireConfirm(body, 'حذف المسودة يتطلب تأكيداً صريحاً');
  const co = coauthorIds(idea.id);
  run('DELETE FROM ideas_ideas WHERE id=?', idea.id);
  K.audit(user, 'ideas.delete_draft', idea.id, { title: idea.title });
  K.changed(KEY, [user.id, ...co], idea.id);
  return { id: idea.id, deleted: true };
}
// Undo of an Ask AI submission: only the creator, only while nobody else interacted with it.
export function undoCreate(user, id) {
  const idea = one('SELECT * FROM ideas_ideas WHERE id=? AND created_by=?', String(id || ''), user.id);
  if (!idea) throw new NotFound();
  if (!['draft', 'submitted'].includes(idea.status)) throw new Conflict('بدأت اللجنة التعامل مع الفكرة؛ لا يمكن التراجع عنها الآن. يمكنك سحبها من «أفكاري».');
  if (one('SELECT 1 FROM ideas_votes WHERE idea_id=? UNION SELECT 1 FROM ideas_comments WHERE idea_id=? LIMIT 1', idea.id, idea.id)) throw new Conflict('تفاعل الزملاء مع الفكرة؛ يمكنك سحبها من «أفكاري» بدلاً من التراجع.');
  const rec = [...ownersOf(idea), ...committeeIds()];
  tx(() => { run("DELETE FROM alerts WHERE entity='sys:ideas' AND entity_id=?", idea.id); run('DELETE FROM ideas_ideas WHERE id=?', idea.id); });
  K.audit(user, 'ideas.undo_create', idea.id, { title: idea.title });
  K.changed(KEY, rec, idea.id);
  return { result: { id: idea.id, undone: true } };
}

// ---------------- committee workflow ----------------
function judgeOf(user, idea) {
  const rel = relOf(user, idea);
  if (!rel.committee) throw new Forbidden('هذا الإجراء لأعضاء لجنة تقييم الأفكار');
  if (rel.owner) throw new Forbidden('تعارض مصالح: لا يمكنك اتخاذ إجراء لجنة على فكرة أنت من مقدّميها');
  return rel;
}
export const TransitionInput = K.S({
  to: K.str('Target stage', { enum: ['screening', 'evaluation', 'needs_info', 'rejected', 'approved'] }),
  note: K.str('Feedback to the author (required for needs_info / rejected)', { maxLength: 2000 }),
  sponsor_id: K.str('Implementation sponsor (required to approve)', { maxLength: 64 }),
}, ['to']);
export function transitionIdea(user, id, input) {
  const v = K.check(TransitionInput, input);
  const idea = load(user, id);
  judgeOf(user, idea);
  K.transition(idea.status, v.to, FLOW, LABELS_AR);
  const note = K.clean(v.note, 2000);
  if (['needs_info', 'rejected'].includes(v.to) && note.length < 10) throw new BadRequest(v.to === 'rejected' ? 'اكتب سبب القرار وملاحظاتك لمقدّم الفكرة (10 أحرف على الأقل)' : 'حدّد المعلومات المطلوبة من مقدّم الفكرة (10 أحرف على الأقل)');
  const scores = all('SELECT * FROM ideas_scores WHERE idea_id=?', idea.id);
  const owners = new Set(ownersOf(idea));
  let sponsor = null;
  if (v.to === 'approved') {
    if (scores.length < MIN_SCORES) throw new Conflict(`يتطلب الاعتماد تقييم ${MIN_SCORES} من أعضاء اللجنة على الأقل (الحالي: ${scores.length})`);
    if (!v.sponsor_id) throw new BadRequest('حدّد راعي التنفيذ قبل الاعتماد');
    sponsor = one("SELECT id FROM users WHERE id=? AND active=1 AND user_type='staff'", v.sponsor_id);
    if (!sponsor) throw new BadRequest('راعي التنفيذ غير صالح');
    if (owners.has(sponsor.id)) throw new BadRequest('فصل المهام: لا يكون راعي التنفيذ من مقدّمي الفكرة');
  }
  const t = now();
  const a = agg(scores);
  tx(() => {
    if (v.to === 'screening' || v.to === 'evaluation') run('UPDATE ideas_ideas SET status=?, updated_at=? WHERE id=?', v.to, t, idea.id);
    else if (v.to === 'needs_info') run("UPDATE ideas_ideas SET status='needs_info', info_from=?, info_by=?, decision_note=?, decided_at=?, updated_at=? WHERE id=?", idea.status, user.id, note, t, t, idea.id);
    else if (v.to === 'rejected') run("UPDATE ideas_ideas SET status='rejected', decision_note=?, decided_by=?, decided_at=?, final_score=?, updated_at=? WHERE id=?", note, user.id, t, a?.weighted ?? null, t, idea.id);
    else run("UPDATE ideas_ideas SET status='approved', decision_note=?, decided_by=?, decided_at=?, approved_at=?, final_score=?, sponsor_id=?, updated_at=? WHERE id=?", note || null, user.id, t, t, a.weighted, sponsor.id, t, idea.id);
    history(idea, idea.status, v.to, user, note || null, !!note, t);
  });
  K.audit(user, 'ideas.transition', idea.id, { from: idea.status, to: v.to, sponsor: sponsor?.id });
  const fresh = one('SELECT * FROM ideas_ideas WHERE id=?', idea.id);
  const short = clip(idea.title, 80);
  const authors = [...owners];
  if (v.to === 'needs_info') for (const u of authors) K.alert(u, { level: 'warning', title: `تطلب لجنة الأفكار معلومات إضافية عن فكرتك «${short}»`, body: 'افتح الفكرة لقراءة الملاحظات وإعادة الإرسال', system: KEY, id: idea.id });
  if (v.to === 'rejected') for (const u of authors) K.alert(u, { title: `صدر قرار اللجنة بشأن فكرتك «${short}»`, body: 'افتح الفكرة لقراءة ملاحظات اللجنة', system: KEY, id: idea.id });
  if (v.to === 'approved') {
    for (const u of authors) K.alert(u, { title: `اعتُمدت فكرتك «${short}»`, body: 'تنتقل الآن إلى التنفيذ', system: KEY, id: idea.id });
    K.alert(sponsor.id, { level: 'warning', title: `كُلّفت برعاية تنفيذ فكرة معتمدة: «${short}»`, body: 'ابدأ التنفيذ بإنشاء مشروع أو ربط مشروع قائم', system: KEY, id: idea.id });
  }
  notifyIdea(fresh, user);
  return detail(user, idea.id);
}
export const ScoreInput = K.S({
  impact: K.int('1-5', { minimum: 1, maximum: 5 }), feasibility: K.int('1-5', { minimum: 1, maximum: 5 }),
  cost: K.int('1-5 (5 = low cost / high value for money)', { minimum: 1, maximum: 5 }), alignment: K.int('1-5', { minimum: 1, maximum: 5 }),
  note: K.str('Private note to the committee', { maxLength: 1500 }),
}, ['impact', 'feasibility', 'cost', 'alignment']);
export function scoreIdea(user, id, input) {
  const v = K.check(ScoreInput, input);
  const idea = load(user, id);
  judgeOf(user, idea);
  if (idea.status !== 'evaluation') throw new Conflict(`التقييم متاح في مرحلة «قيد التقييم» فقط (الحالة: ${statusAr(idea.status)})`);
  const t = now();
  const had = one('SELECT 1 FROM ideas_scores WHERE idea_id=? AND user_id=?', idea.id, user.id);
  run(`INSERT INTO ideas_scores (idea_id,user_id,impact,feasibility,cost,alignment,note,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(idea_id,user_id) DO UPDATE SET impact=excluded.impact, feasibility=excluded.feasibility, cost=excluded.cost, alignment=excluded.alignment, note=excluded.note, updated_at=excluded.updated_at`,
  idea.id, user.id, v.impact, v.feasibility, v.cost, v.alignment, K.clean(v.note, 1500) || null, t, t);
  K.audit(user, had ? 'ideas.score_update' : 'ideas.score', idea.id, {});
  K.changed(KEY, [...committeeIds(), user.id], idea.id);
  return detail(user, idea.id);
}
export const ImplementInput = K.S({
  mode: K.str('create a new project or link an existing one', { enum: ['create', 'link'] }),
  project_id: K.str('Existing project id (mode=link)', { maxLength: 64 }),
  name: K.str('New project name (mode=create)', { maxLength: 160 }),
  due_date: K.date('Project due date (mode=create)'),
}, ['mode']);
export function implementIdea(user, id, input) {
  const v = K.check(ImplementInput, input);
  const idea = load(user, id);
  const rel = relOf(user, idea);
  if (!rel.judge && !rel.sponsor) throw new Forbidden(rel.owner ? 'فصل المهام: يبدأ التنفيذ راعي الفكرة أو اللجنة' : 'يبدأ التنفيذ راعي الفكرة أو لجنة التقييم فقط');
  K.transition(idea.status, 'in_implementation', FLOW, LABELS_AR);
  let projectId;
  if (v.mode === 'create') {
    // Created through the Work service, so the platform's project rules apply
    // (department scope of the acting user, audit, realtime).
    const r = W.createProject(user, { name: K.clean(v.name, 160) || `تنفيذ: ${clip(idea.title, 120)}`, description: `تنفيذ الفكرة المعتمدة ${idea.ref}: ${idea.title}`, due_date: v.due_date || undefined });
    projectId = r.result.id;
  } else {
    if (!v.project_id) throw new BadRequest('اختر المشروع المراد ربطه');
    const p = W.getProject(user, v.project_id);
    if (!p.can_edit) throw new Forbidden('لا تملك صلاحية تعديل هذا المشروع لربطه بالفكرة');
    if (['done', 'cancelled'].includes(p.status)) throw new Conflict('لا يمكن الربط بمشروع منتهٍ أو ملغى');
    projectId = p.id;
  }
  const t = now();
  tx(() => {
    run("UPDATE ideas_ideas SET status='in_implementation', project_id=?, implementation_started_at=?, updated_at=? WHERE id=?", projectId, t, t, idea.id);
    history(idea, 'approved', 'in_implementation', user, null, false, t);
  });
  K.audit(user, 'ideas.implement', idea.id, { mode: v.mode, project: projectId });
  notifyIdea(one('SELECT * FROM ideas_ideas WHERE id=?', idea.id), user);
  return detail(user, idea.id);
}
export const CompleteInput = K.S({
  benefits_note: K.str('Benefits realised (what changed, evidence)', { maxLength: 2000 }),
  realized_saving: K.num('Realised annual saving in AED', { minimum: 0, maximum: 1e9 }),
  realized_hours: K.num('Realised hours saved per year', { minimum: 0, maximum: 1e6 }),
}, ['benefits_note']);
export function completeIdea(user, id, input) {
  const v = K.check(CompleteInput, input);
  const idea = load(user, id);
  const rel = relOf(user, idea);
  if (!rel.judge && !rel.sponsor) throw new Forbidden('يسجّل الأثر المحقق راعي الفكرة أو لجنة التقييم فقط');
  K.transition(idea.status, 'implemented', FLOW, LABELS_AR);
  const note = K.clean(v.benefits_note, 2000);
  if (note.length < 10) throw new BadRequest('صِف الأثر المحقق بالأدلة (10 أحرف على الأقل)');
  const t = now();
  tx(() => {
    run("UPDATE ideas_ideas SET status='implemented', benefits_note=?, realized_saving=?, realized_hours=?, implemented_at=?, updated_at=? WHERE id=?", note, v.realized_saving ?? null, v.realized_hours ?? null, t, t, idea.id);
    history(idea, 'in_implementation', 'implemented', user, null, false, t);
  });
  K.audit(user, 'ideas.implemented', idea.id, { saving: v.realized_saving ?? null, hours: v.realized_hours ?? null });
  for (const u of ownersOf(idea)) K.alert(u, { title: `نُفّذت فكرتك «${clip(idea.title, 80)}» وتحقق أثرها`, body: 'شكراً لمساهمتك في تطوير العمل', system: KEY, id: idea.id });
  notifyIdea(one('SELECT * FROM ideas_ideas WHERE id=?', idea.id), user);
  return detail(user, idea.id);
}

// ---------------- social: votes, follows, comments ----------------
const Toggle = K.S({ on: K.bool('true to add, false to remove') }, ['on']);
export function vote(user, id, input) {
  const v = K.check(Toggle, input);
  const idea = load(user, id);
  if (relOf(user, idea).owner) throw new Forbidden('لا يمكنك التصويت لفكرة أنت من مقدّميها');
  if (SOCIAL_CLOSED.includes(idea.status)) throw new Conflict(`التصويت غير متاح لفكرة في حالة «${statusAr(idea.status)}»`);
  if (v.on) run('INSERT OR IGNORE INTO ideas_votes (idea_id,user_id,created_at) VALUES (?,?,?)', idea.id, user.id, now());
  else run('DELETE FROM ideas_votes WHERE idea_id=? AND user_id=?', idea.id, user.id);
  K.changed(KEY, [...ownersOf(idea), ...followerIds(idea.id), user.id], idea.id);
  return { id: idea.id, votes: one('SELECT COUNT(*) n FROM ideas_votes WHERE idea_id=?', idea.id).n, my_vote: !!v.on };
}
export function follow(user, id, input) {
  const v = K.check(Toggle, input);
  const idea = load(user, id);
  if (relOf(user, idea).owner) throw new Conflict('تتابع أفكارك تلقائياً');
  if (['draft', 'withdrawn'].includes(idea.status)) throw new Conflict('لا يمكن متابعة هذه الفكرة');
  if (v.on) run('INSERT OR IGNORE INTO ideas_follows (idea_id,user_id,created_at) VALUES (?,?,?)', idea.id, user.id, now());
  else run('DELETE FROM ideas_follows WHERE idea_id=? AND user_id=?', idea.id, user.id);
  K.changed(KEY, [user.id], idea.id);
  return { id: idea.id, following: !!v.on };
}
export function addComment(user, id, input) {
  const v = K.check(K.S({ body: K.str('Comment', { maxLength: 1500 }) }, ['body']), input);
  const idea = load(user, id);
  if (['draft', 'withdrawn'].includes(idea.status)) throw new Conflict('التعليقات غير متاحة لهذه الفكرة');
  const body = K.clean(v.body, 1500);
  if (body.length < 2) throw new BadRequest('اكتب تعليقاً');
  const cid = uid('ic_');
  run('INSERT INTO ideas_comments (id,idea_id,user_id,body,created_at) VALUES (?,?,?,?,?)', cid, idea.id, user.id, body, now());
  K.audit(user, 'ideas.comment', idea.id, { comment: cid });
  notifyIdea(idea, user);
  return commentsView(user, idea, relOf(user, idea), coauthorIds(idea.id)).find((c) => c.id === cid);
}
function loadComment(idea, cid) {
  const c = one('SELECT * FROM ideas_comments WHERE id=? AND idea_id=? AND deleted_at IS NULL', String(cid || ''), idea.id);
  if (!c) throw new NotFound('التعليق غير موجود');
  return c;
}
export function deleteComment(user, id, cid, body = {}) {
  K.check(ConfirmBody, body);
  const idea = load(user, id);
  const c = loadComment(idea, cid);
  if (c.user_id !== user.id) throw new Forbidden('يحذف التعليق كاتبه فقط؛ يمكن للجنة إخفاؤه');
  K.requireConfirm(body, 'حذف التعليق يتطلب تأكيداً صريحاً');
  run('UPDATE ideas_comments SET deleted_at=? WHERE id=?', now(), c.id);
  K.audit(user, 'ideas.comment_delete', idea.id, { comment: c.id });
  notifyIdea(idea, user);
  return { id: c.id, deleted: true };
}
export function hideComment(user, id, cid, input = {}) {
  const v = K.check(K.S({ reason: K.str('Reason shown to the comment author and committee', { maxLength: 300 }), confirm: K.bool() }, ['reason']), input);
  const idea = load(user, id);
  if (!isCommittee(user)) throw new Forbidden('إخفاء التعليقات صلاحية لجنة الأفكار');
  const c = loadComment(idea, cid);
  if (c.hidden_at) throw new Conflict('التعليق مخفي مسبقاً');
  const reason = K.clean(v.reason, 300);
  if (reason.length < 5) throw new BadRequest('اذكر سبب الإخفاء');
  K.requireConfirm(input, 'إخفاء التعليق يتطلب تأكيداً صريحاً');
  run('UPDATE ideas_comments SET hidden_at=?, hidden_by=?, hidden_reason=? WHERE id=?', now(), user.id, reason, c.id);
  K.audit(user, 'ideas.comment_hide', idea.id, { comment: c.id, reason });
  notifyIdea(idea, user, [c.user_id]);
  return { id: c.id, hidden: true };
}

// ---------------- campaigns (challenges) ----------------
function campaignStats(c) {
  const s = one(`SELECT COUNT(*) ideas, COUNT(DISTINCT author_id) participants, SUM(status IN ('approved','in_implementation','implemented')) adopted, SUM(status='implemented') implemented
    FROM ideas_ideas WHERE campaign_id=? AND status NOT IN ('draft','withdrawn')`, c.id);
  return { ideas: s.ideas || 0, participants: s.participants || 0, adopted: s.adopted || 0, implemented: s.implemented || 0 };
}
export function presentCampaign(c) {
  const state = campaignState(c);
  const span = Math.max(1, K.daysBetween(c.starts_on, c.ends_on));
  const elapsed = Math.max(0, Math.min(span, K.daysBetween(c.starts_on, today())));
  return {
    id: c.id, title_ar: c.title_ar, title_en: c.title_en || c.title_ar, description_ar: c.description_ar, description_en: c.description_en || c.description_ar,
    starts_on: c.starts_on, ends_on: c.ends_on, state, days_left: state === 'active' ? Math.max(0, daysLeft(c)) : null,
    elapsed_pct: state === 'upcoming' ? 0 : state === 'closed' ? 100 : Math.round((elapsed / span) * 100),
    objective: c.objective_id ? { id: c.objective_id, title_ar: c.objective_ar, title_en: c.objective_en || c.objective_ar } : null,
    sponsor: c.sponsor_id ? brief(K.userBrief(c.sponsor_id)) : null,
    stats: campaignStats(c), is_demo: !!c.is_demo,
  };
}
export function listCampaigns(user) {
  K.requireStaff(user);
  const rank = { active: 0, upcoming: 1, closed: 2 };
  return all('SELECT * FROM ideas_campaigns ORDER BY ends_on').map(presentCampaign).sort((a, b) => rank[a.state] - rank[b.state] || String(a.ends_on).localeCompare(String(b.ends_on)));
}
export function getCampaign(user, id) {
  K.requireStaff(user);
  const c = one('SELECT * FROM ideas_campaigns WHERE id=?', String(id || ''));
  if (!c) throw new NotFound('التحدي غير موجود');
  return { ...presentCampaign(c), ideas: listIdeas(user, { campaign: c.id, sort: 'trending' }), can_edit: isCommittee(user) };
}
export const CampaignInput = K.S({
  title_ar: K.str('Title (Arabic)', { maxLength: 140 }), title_en: K.str('Title (English)', { maxLength: 140 }),
  description_ar: K.str('Description', { maxLength: 2000 }), description_en: K.str('Description (English)', { maxLength: 2000 }),
  starts_on: K.date(), ends_on: K.date(), objective_id: K.str('', { maxLength: 64 }), sponsor_id: K.str('', { maxLength: 64 }),
  close: K.bool('Close the challenge now'), confirm: K.bool(),
});
async function campaignFields(user, v, cur = {}) {
  const f = {};
  if (v.title_ar !== undefined) { f.title_ar = K.clean(v.title_ar, 140); if (f.title_ar.length < 4) throw new BadRequest('عنوان التحدي قصير جداً'); }
  if (v.title_en !== undefined) f.title_en = K.clean(v.title_en, 140) || null;
  if (v.description_ar !== undefined) { f.description_ar = K.clean(v.description_ar, 2000); if (f.description_ar.length < 10) throw new BadRequest('صِف التحدي والنتيجة المرجوّة (10 أحرف على الأقل)'); }
  if (v.description_en !== undefined) f.description_en = K.clean(v.description_en, 2000) || null;
  for (const k of ['starts_on', 'ends_on']) if (v[k] !== undefined) { if (Number.isNaN(Date.parse(v[k]))) throw new BadRequest('تاريخ غير صالح'); f[k] = v[k]; }
  const s = f.starts_on ?? cur.starts_on; const e = f.ends_on ?? cur.ends_on;
  if (s && e && e <= s) throw new BadRequest('يجب أن يكون موعد الإغلاق بعد تاريخ البدء');
  if (f.ends_on && f.ends_on < today()) throw new BadRequest('موعد الإغلاق في الماضي');
  if (v.objective_id !== undefined) { const o = await resolveObjective(user, v.objective_id); f.objective_id = o?.id || null; f.objective_ar = o?.title_ar || null; f.objective_en = o?.title_en || null; }
  if (v.sponsor_id !== undefined) { if (v.sponsor_id && !one("SELECT 1 FROM users WHERE id=? AND active=1 AND user_type='staff'", v.sponsor_id)) throw new BadRequest('راعي التحدي غير صالح'); f.sponsor_id = v.sponsor_id || null; }
  return f;
}
export async function createCampaign(user, input) {
  K.requireStaff(user); K.requireCap(user, CAP);
  const v = K.check(K.S({ ...CampaignInput.properties, close: undefined, confirm: undefined }, ['title_ar', 'description_ar', 'starts_on', 'ends_on']), input);
  const f = await campaignFields(user, v);
  const id = uid('camp_'); const t = now();
  run(`INSERT INTO ideas_campaigns (id,title_ar,title_en,description_ar,description_en,starts_on,ends_on,objective_id,objective_ar,objective_en,sponsor_id,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, f.title_ar, f.title_en ?? null, f.description_ar, f.description_en ?? null, f.starts_on, f.ends_on, f.objective_id ?? null, f.objective_ar ?? null, f.objective_en ?? null, f.sponsor_id ?? null, user.id, t, t);
  K.audit(user, 'ideas.campaign_create', id, { title: f.title_ar });
  K.changed(KEY, K.staffUsers().map((u) => u.id), id);
  return getCampaign(user, id);
}
export async function updateCampaign(user, id, input) {
  K.requireStaff(user); K.requireCap(user, CAP);
  const c = one('SELECT * FROM ideas_campaigns WHERE id=?', String(id || ''));
  if (!c) throw new NotFound('التحدي غير موجود');
  const v = K.check(CampaignInput, input);
  if (v.close) {
    if (campaignState(c) === 'closed') throw new Conflict('التحدي مغلق مسبقاً');
    K.requireConfirm(input, 'إغلاق التحدي قبل موعده يتطلب تأكيداً صريحاً');
    run('UPDATE ideas_campaigns SET closed_at=?, closed_by=?, updated_at=? WHERE id=?', now(), user.id, now(), c.id);
    K.audit(user, 'ideas.campaign_close', c.id, {});
  } else {
    const f = await campaignFields(user, v, c);
    if (!Object.keys(f).length) throw new BadRequest('لا توجد حقول للتحديث');
    f.updated_at = now();
    const keys = Object.keys(f);
    run(`UPDATE ideas_campaigns SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => f[k]), c.id);
    K.audit(user, 'ideas.campaign_update', c.id, { fields: keys });
  }
  K.changed(KEY, K.staffUsers().map((u) => u.id), c.id);
  return getCampaign(user, c.id);
}

// ---------------- committee queue & scoring matrix ----------------
export function committeeQueue(user) {
  K.requireStaff(user); K.requireCap(user, CAP);
  const cache = {};
  const rows = selectIdeas(user, { where: "AND i.status IN ('submitted','screening','evaluation','needs_info','approved','in_implementation')", order: 'COALESCE(i.submitted_at, i.created_at) ASC' });
  const myScores = new Map(all('SELECT * FROM ideas_scores WHERE user_id=?', user.id).map((s) => [s.idea_id, s]));
  const items = rows.map((r) => {
    const conflict = r.author_id === user.id || !!r.is_coauthor;
    const mine = myScores.get(r.id) || null;
    const scores = r.status === 'evaluation' && !conflict && mine ? all('SELECT * FROM ideas_scores WHERE idea_id=?', r.id) : null;
    const it = present(user, r, cache);
    return {
      ...it, conflict, n_scores: r.n_scores,
      my_score: mine && !conflict ? { impact: mine.impact, feasibility: mine.feasibility, cost: mine.cost, alignment: mine.alignment, weighted: weightedOf(mine) } : null,
      aggregate: scores ? agg(scores) : null,
      ready: r.status === 'evaluation' && r.n_scores >= MIN_SCORES,
      waiting_days: K.daysBetween((r.status === 'needs_info' ? r.decided_at : r.updated_at) || r.created_at, today()),
      sponsor: r.sponsor_id ? brief(K.userBrief(r.sponsor_id)) : null,
    };
  });
  const act = items.filter((i) => !i.conflict);
  return {
    items, min_scores: MIN_SCORES, weights: WEIGHTS, members: committeeIds().length,
    stats: {
      new: act.filter((i) => i.status === 'submitted').length,
      screening: act.filter((i) => i.status === 'screening').length,
      to_score: act.filter((i) => i.status === 'evaluation' && !i.my_score).length,
      ready: act.filter((i) => i.ready).length,
      waiting_author: items.filter((i) => i.status === 'needs_info').length,
      approved: items.filter((i) => i.status === 'approved').length,
      in_implementation: items.filter((i) => i.status === 'in_implementation').length,
    },
  };
}
// Distinct ideas that need this committee member's action now.
export function committeeActionable(user) {
  if (!isCommittee(user)) return [];
  const s = scopeSql(user);
  return all(`SELECT i.id, i.title, i.status, i.ref, i.submitted_at, (SELECT COUNT(*) FROM ideas_scores x WHERE x.idea_id=i.id) n,
      EXISTS (SELECT 1 FROM ideas_scores m WHERE m.idea_id=i.id AND m.user_id=?) mine
    FROM ideas_ideas i WHERE ${s.sql} AND i.status IN ('submitted','screening','evaluation')
      AND i.author_id<>? AND NOT EXISTS (SELECT 1 FROM ideas_coauthors c WHERE c.idea_id=i.id AND c.user_id=?)
    ORDER BY i.submitted_at`, user.id, ...s.params, user.id, user.id)
    .filter((r) => r.status !== 'evaluation' || !r.mine || r.n >= MIN_SCORES);
}

// ---------------- overview (bank hero) ----------------
export function overview(user) {
  K.requireStaff(user);
  const s = scopeSql(user);
  const month = new Date(Date.now() - 30 * 864e5).toISOString();
  const st = one(`SELECT COUNT(*) total, SUM(i.submitted_at>=?) month, SUM(i.status IN ('submitted','screening','evaluation','needs_info')) pipeline,
      SUM(i.status IN ('approved','in_implementation')) adopted, SUM(i.status='implemented') implemented,
      SUM(CASE WHEN i.status='implemented' THEN COALESCE(i.realized_saving,0) ELSE 0 END) saving,
      SUM(CASE WHEN i.status='implemented' THEN COALESCE(i.realized_hours,0) ELSE 0 END) hours,
      COUNT(DISTINCT i.author_id) participants
    FROM ideas_ideas i WHERE ${s.sql} AND i.status NOT IN ('draft','withdrawn')`, month, ...s.params);
  // Aggregates by department use public ideas only (anonymous ideas never contribute).
  const depts = all(`SELECT i.department_id id, d.name_ar, d.name_en, COUNT(*) ideas, SUM(i.status IN ('approved','in_implementation','implemented')) adopted, SUM(i.status='implemented') implemented
    FROM ideas_ideas i JOIN departments d ON d.id=i.department_id WHERE i.status NOT IN ('draft','withdrawn') AND i.hide_author=0
    GROUP BY i.department_id ORDER BY adopted DESC, ideas DESC, d.name_ar LIMIT 6`);
  const campaigns = listCampaigns(user).filter((c) => c.state === 'active');
  const trending = topIdeas(user, { limit: 3 });
  const mine = myIdeas(user);
  const queue = committeeActionable(user);
  const sponsor = all("SELECT id,title,ref FROM ideas_ideas WHERE sponsor_id=? AND status IN ('approved','in_implementation') AND author_id<>? ORDER BY approved_at", user.id, user.id);
  return {
    role: { committee: isCommittee(user), sponsor: sponsor.length },
    stats: { total: st.total || 0, month: st.month || 0, pipeline: st.pipeline || 0, adopted: st.adopted || 0, implemented: st.implemented || 0, realized_saving: st.saving || 0, realized_hours: st.hours || 0, participants: st.participants || 0 },
    departments: depts.map((d) => ({ ...d, adopted: d.adopted || 0, implemented: d.implemented || 0 })),
    campaigns, trending,
    counts: { mine_action: mine.stats.needs_info + mine.stats.drafts, committee: queue.length, sponsor: sponsor.length },
    next: nextAction(user, mine, queue, sponsor, campaigns),
  };
}
function nextAction(user, mine, queue, sponsor, campaigns) {
  const ni = mine.ideas.find((i) => i.status === 'needs_info' && i.is_author);
  if (ni) return { kind: 'needs_info', tone: 'warn', id: ni.id, ar: `طلبت اللجنة معلومات إضافية عن فكرتك «${ni.title}»`, en: `The committee asked for more information on “${ni.title}”`, cta_ar: 'استكمل وأعد الإرسال', cta_en: 'Complete & resubmit', href: `#/sys/ideas/mine/${ni.id}` };
  if (queue.length) {
    const toScore = queue.filter((q) => q.status === 'evaluation' && !q.mine).length;
    return { kind: 'committee', tone: 'emph', ar: `${queue.length} ${queue.length === 1 ? 'فكرة تنتظر' : queue.length === 2 ? 'فكرتان تنتظران' : 'أفكار تنتظر'} إجراء اللجنة${toScore ? ` — منها ${toScore} بانتظار تقييمك` : ''}`, en: `${queue.length} ${queue.length === 1 ? 'idea awaits' : 'ideas await'} committee action${toScore ? ` — ${toScore} ${toScore === 1 ? 'needs' : 'need'} your score` : ''}`, cta_ar: 'افتح قائمة اللجنة', cta_en: 'Open committee queue', href: '#/sys/ideas/committee' };
  }
  const sp = sponsor.find(Boolean);
  if (sp) return { kind: 'sponsor', tone: 'emph', id: sp.id, ar: `أنت راعي تنفيذ الفكرة «${sp.title}»`, en: `You sponsor the implementation of “${sp.title}”`, cta_ar: 'تابع التنفيذ', cta_en: 'Follow implementation', href: `#/sys/ideas/bank/${sp.id}` };
  const dr = mine.ideas.find((i) => i.status === 'draft' && i.is_author);
  if (dr) return { kind: 'draft', tone: null, id: dr.id, ar: `لديك مسودة لم تُرسل بعد: «${dr.title}»`, en: `You have an unsent draft: “${dr.title}”`, cta_ar: 'أكمل المسودة', cta_en: 'Finish the draft', href: `#/sys/ideas/mine/${dr.id}` };
  const c = campaigns[0];
  if (c) return { kind: 'challenge', tone: c.days_left <= 7 ? 'warn' : null, id: c.id, ar: `«${c.title_ar}» مفتوح للمشاركة — يُغلق خلال ${c.days_left} ${c.days_left === 1 ? 'يوم' : c.days_left === 2 ? 'يومين' : c.days_left <= 10 ? 'أيام' : 'يوماً'}`, en: `“${c.title_en}” is open — closes in ${c.days_left} ${c.days_left === 1 ? 'day' : 'days'}`, cta_ar: 'شارك بفكرة', cta_en: 'Share an idea', href: `#/sys/ideas/challenges/${c.id}`, campaign_id: c.id };
  return { kind: 'submit', tone: null, ar: 'هل لديك فكرة لتحسين خدماتنا أو تبسيط إجراء؟ شاركها الآن', en: 'Have an idea to improve a service or simplify a process? Share it now', cta_ar: 'قدّم فكرة', cta_en: 'Submit an idea' };
}

// ---------------- similar ideas (transparent, deterministic) ----------------
const STOP = new Set(['من', 'في', 'على', 'الى', 'عن', 'مع', 'او', 'ثم', 'التي', 'الذي', 'هذه', 'هذا', 'ذلك', 'تلك', 'كل', 'بعد', 'قبل', 'عند', 'حتي', 'بين', 'غير', 'عبر', 'بدل', 'بدلا', 'ضمن', 'خلال', 'لدي', 'لها', 'كما', 'وفق', 'اجل', 'يتم', 'تتم', 'بشكل', 'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this']);
export function tokens(s) {
  const n = String(s || '').toLowerCase().replace(/[ً-ْـٰ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ؤ/g, 'و').replace(/ئ/g, 'ي');
  const out = new Set();
  for (let w of n.split(/[^\p{L}\p{N}]+/u)) {
    w = w.replace(/^(وال|بال|فال|كال|لل|ال)(?=\S{3,})/, '').replace(/(ات|ون|ين|يه|ها|ه)$(?<=\S{5,})/, '');
    if (w.length >= 3 && !STOP.has(w)) out.add(w);
  }
  return out;
}
const jaccard = (a, b) => { if (!a.size || !b.size) return 0; let k = 0; for (const x of a) if (b.has(x)) k++; return k / (a.size + b.size - k); };
export function similarIdeas(user, text, { exclude, limit = 5 } = {}) {
  const t = String(text || '').trim();
  if (t.length < 4) return [];
  const q = tokens(t);
  if (!q.size) return [];
  const s = scopeSql(user);
  return all(`SELECT i.id,i.ref,i.title,i.problem,i.status,i.campaign_id FROM ideas_ideas i WHERE ${s.sql} AND i.status NOT IN ('draft','withdrawn') AND i.id<>?`, ...s.params, exclude || '')
    .map((r) => ({ r, sim: 0.6 * jaccard(q, tokens(r.title)) + 0.4 * jaccard(q, tokens(`${r.title} ${r.problem}`)) }))
    .filter((x) => x.sim >= 0.12).sort((a, b) => b.sim - a.sim).slice(0, limit)
    .map(({ r, sim }) => ({ id: r.id, ref: r.ref, title: r.title, status: r.status, similarity: Math.round(Math.min(1, sim * 1.6) * 100) }));
}

// ---------------- workspace, game ----------------
export function workspace(user) {
  if (!K.isStaff(user)) return [];
  const cards = [];
  const queue = committeeActionable(user);
  if (isCommittee(user)) {
    cards.push({
      title_ar: 'أفكار بانتظار إجراء اللجنة', title_en: 'Ideas awaiting the committee', value: queue.length, unit_ar: queue.length === 1 ? 'فكرة' : 'أفكار', unit_en: 'ideas',
      tone: queue.length ? 'emph' : 'good', hint_ar: queue.length ? 'الفرز والتقييم والقرار — دون الأفكار التي أنت من مقدّميها' : 'لا شيء بانتظارك الآن', hint_en: queue.length ? 'Screening, scoring and decisions (excluding your own ideas)' : 'Nothing waiting for you',
      href: '#/sys/ideas/committee',
      items: queue.slice(0, 3).map((q) => ({ title: q.title, meta_ar: q.status === 'evaluation' ? (q.mine ? 'جاهزة للقرار' : 'بانتظار تقييمك') : statusAr(q.status), meta_en: q.status === 'evaluation' ? (q.mine ? 'Ready for decision' : 'Needs your score') : STATUS[q.status][1], href: `#/sys/ideas/committee/${q.id}` })),
      cta: { label_ar: 'افتح قائمة اللجنة', label_en: 'Open the queue', href: '#/sys/ideas/committee' },
    });
  }
  const sponsor = all("SELECT id,title,status FROM ideas_ideas WHERE sponsor_id=? AND status IN ('approved','in_implementation') AND author_id<>? ORDER BY approved_at", user.id, user.id);
  if (sponsor.length) {
    cards.push({
      title_ar: 'أفكار معتمدة ترعى تنفيذها', title_en: 'Approved ideas you sponsor', value: sponsor.length, unit_ar: sponsor.length === 1 ? 'فكرة' : 'أفكار', unit_en: 'ideas', tone: sponsor.some((x) => x.status === 'approved') ? 'warn' : null,
      hint_ar: 'ابدأ التنفيذ بمشروع ثم سجّل الأثر المحقق', hint_en: 'Start with a project, then record the realised benefits', href: `#/sys/ideas/bank/${sponsor[0].id}`,
      items: sponsor.slice(0, 3).map((x) => ({ title: x.title, meta_ar: x.status === 'approved' ? 'بانتظار بدء التنفيذ' : 'قيد التنفيذ', meta_en: x.status === 'approved' ? 'Awaiting start' : 'In implementation', href: `#/sys/ideas/bank/${x.id}` })),
      cta: { label_ar: 'تابع التنفيذ', label_en: 'Follow up', href: `#/sys/ideas/bank/${sponsor[0].id}` },
    });
  }
  const camp = listCampaigns(user).find((c) => c.state === 'active');
  if (camp) {
    cards.push({
      title_ar: camp.title_ar, title_en: camp.title_en, value: camp.days_left, unit_ar: camp.days_left === 1 ? 'يوم متبقٍ' : 'يوماً متبقياً', unit_en: 'days left', tone: camp.days_left <= 7 ? 'warn' : 'emph',
      hint_ar: `${camp.stats.ideas} فكرة مشاركة حتى الآن`, hint_en: `${camp.stats.ideas} ideas so far`, href: `#/sys/ideas/challenges/${camp.id}`,
      items: topIdeas(user, { campaign_id: camp.id, limit: 3 }).map((i) => ({ title: i.title, meta_ar: `${i.votes} صوت`, meta_en: `${i.votes} votes`, href: `#/sys/ideas/challenges/${camp.id}/${i.id}` })),
      cta: { label_ar: 'شارك بفكرة', label_en: 'Share an idea', href: `#/sys/ideas/challenges/${camp.id}` },
    });
  }
  const mine = myIdeas(user);
  const live = mine.ideas.filter((i) => i.status !== 'withdrawn');
  if (live.length || !camp) {
    const ni = mine.stats.needs_info;
    cards.push({
      title_ar: 'أفكاري', title_en: 'My ideas', value: live.length, unit_ar: live.length === 1 ? 'فكرة' : 'أفكار', unit_en: 'ideas', tone: ni ? 'warn' : mine.stats.adopted ? 'good' : null,
      hint_ar: ni ? `${ni} بحاجة لمعلومات منك` : `${mine.stats.adopted} معتمدة · ${mine.stats.implemented} مُنفّذة`, hint_en: ni ? `${ni} need information from you` : `${mine.stats.adopted} adopted · ${mine.stats.implemented} implemented`,
      href: '#/sys/ideas/mine',
      items: live.slice(0, 3).map((i) => ({ title: i.title, meta_ar: statusAr(i.status), meta_en: STATUS[i.status][1], href: `#/sys/ideas/mine/${i.id}` })),
      cta: live.length ? { label_ar: 'افتح أفكاري', label_en: 'Open my ideas', href: '#/sys/ideas/mine' } : { label_ar: 'قدّم أول فكرة', label_en: 'Submit your first idea', href: '#/sys/ideas/bank' },
    });
  }
  return cards.slice(0, 3);
}
export const GAME_RULES = [
  { key: 'idea_submitted', points: 5, ar: 'تقديم فكرة للجنة (تُحتسب واحدة يومياً)', en: 'Submit an idea (one counted per day)' },
  { key: 'idea_approved', points: 20, ar: 'اعتماد فكرتك من لجنة الأفكار', en: 'Your idea is approved by the committee' },
  { key: 'idea_implemented', points: 40, ar: 'تنفيذ فكرتك وتحقق أثرها', en: 'Your idea is implemented with realised benefits' },
];
// Derived from real records only (withdrawn ideas never count; undo removes points).
export function gameEvents(userId) {
  const out = [];
  const days = new Set();
  for (const s of all("SELECT id,title,submitted_at FROM ideas_ideas WHERE author_id=? AND submitted_at IS NOT NULL AND status<>'withdrawn' ORDER BY submitted_at", userId)) {
    const d = String(s.submitted_at).slice(0, 10);
    if (days.has(d)) continue;
    days.add(d);
    out.push({ kind: 'idea_submitted', points: 5, at: s.submitted_at, ref: s.title, id: `ideas:sub:${s.id}` });
  }
  for (const i of all(`SELECT i.id,i.title,i.approved_at,i.implemented_at,i.status FROM ideas_ideas i WHERE i.approved_at IS NOT NULL AND i.status IN ('approved','in_implementation','implemented')
      AND (i.author_id=? OR EXISTS (SELECT 1 FROM ideas_coauthors c WHERE c.idea_id=i.id AND c.user_id=?))`, userId, userId)) {
    out.push({ kind: 'idea_approved', points: 20, at: i.approved_at, ref: i.title, id: `ideas:app:${i.id}` });
    if (i.status === 'implemented' && i.implemented_at) out.push({ kind: 'idea_implemented', points: 40, at: i.implemented_at, ref: i.title, id: `ideas:impl:${i.id}` });
  }
  return out;
}
