// Surveys — domain service: authorisation scopes, lifecycle (draft → published →
// closed), builder operations, anonymous responses and aggregated results.
//
// Anonymity by design:
//  * surveys_participation (survey_id, user_id, responded_on) records WHO took part;
//  * surveys_responses / surveys_answers record WHAT was answered under a random
//    response id with a coarse period (week start) and the respondent's department
//    (segmentation only, ≥ 5 rule) — no user id for anonymous surveys and no key
//    that joins the two sides. Both are WITHOUT ROWID tables keyed by random ids /
//    user ids, so physical row order does not reveal submission order either;
//  * results are computed over RELEASED responses only: while a survey is open,
//    responses are released in batches of MIN_GROUP so an author watching the
//    results cannot attribute a change to one new respondent; closing releases all.
import crypto from 'node:crypto';
import {
  one, all, run, uid, now, today, json, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, hasCap, requireCap, isManagerOf, managedDepartments, deptSubtree, staffUsers, userBrief,
  usersWithCap, audit, logAccess, accessLog, changed, alert, transition, clean, inList, daysBetween,
  day, requireConfirm, check, S, str, bool, arr, date, aiAllowed,
} from '../kit.js';
import { complete } from '../../ai/services.js';
import { MIN_GROUP, TYPES, computeResults, aggregateQuestion, themesOf, localNarrative } from './analysis.js';

export const KEY = 'surveys';
export const CAP = 'surveys.author';
export { MIN_GROUP };
const FLOW = { draft: ['published'], published: ['closed'], closed: [] };
const STATUS_AR = { draft: 'مسودة', published: 'منشور', closed: 'مغلق' };
const ROLES = ['employee', 'manager', 'president'];
const ROLE_LABEL = { employee: ['الموظفون', 'Employees'], manager: ['المديرون', 'Managers'], president: ['الرئيس', 'President'] };
const CHOICE = ['single', 'multi'];
const MAX_QUESTIONS = 60;

// ---------------------------------------------------------------- schema
export function schema() {
  run(`CREATE TABLE IF NOT EXISTS surveys_surveys (
    id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '',
    author_id TEXT NOT NULL REFERENCES users(id),
    status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','closed')),
    anonymous INTEGER NOT NULL DEFAULT 1,
    audience_type TEXT NOT NULL DEFAULT 'all' CHECK (audience_type IN ('all','departments','roles')),
    audience TEXT NOT NULL DEFAULT '[]',
    opens_on TEXT NOT NULL, closes_on TEXT NOT NULL,
    share_results INTEGER NOT NULL DEFAULT 0,
    eligible_count INTEGER, announced INTEGER NOT NULL DEFAULT 0, last_reminder_on TEXT,
    published_at TEXT, closed_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  run('CREATE INDEX IF NOT EXISTS ix_surveys_author ON surveys_surveys(author_id, status)');
  run('CREATE INDEX IF NOT EXISTS ix_surveys_status ON surveys_surveys(status, closes_on)');
  run(`CREATE TABLE IF NOT EXISTS surveys_sections (
    id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys_surveys(id) ON DELETE CASCADE,
    title TEXT NOT NULL, description TEXT NOT NULL DEFAULT '', position INTEGER NOT NULL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS surveys_questions (
    id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys_surveys(id) ON DELETE CASCADE,
    section_id TEXT NOT NULL REFERENCES surveys_sections(id) ON DELETE CASCADE,
    position INTEGER NOT NULL DEFAULT 0,
    type TEXT NOT NULL CHECK (type IN ('single','multi','rating','nps','text','yesno')),
    text TEXT NOT NULL, help TEXT NOT NULL DEFAULT '', required INTEGER NOT NULL DEFAULT 1, options TEXT NOT NULL DEFAULT '[]')`);
  run('CREATE INDEX IF NOT EXISTS ix_surveys_questions ON surveys_questions(survey_id, section_id, position)');
  // WHO took part — never joined to the answers.
  run(`CREATE TABLE IF NOT EXISTS surveys_participation (
    survey_id TEXT NOT NULL REFERENCES surveys_surveys(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL REFERENCES users(id), responded_on TEXT NOT NULL,
    PRIMARY KEY (survey_id, user_id)) WITHOUT ROWID`);
  // WHAT was answered — random id, coarse period, department for ≥5 segmentation;
  // user_id is set ONLY for surveys published as non-anonymous (respondents are told).
  run(`CREATE TABLE IF NOT EXISTS surveys_responses (
    id TEXT PRIMARY KEY, survey_id TEXT NOT NULL REFERENCES surveys_surveys(id) ON DELETE CASCADE,
    dept_id TEXT, period TEXT NOT NULL, batch INTEGER, user_id TEXT) WITHOUT ROWID`);
  run('CREATE INDEX IF NOT EXISTS ix_surveys_responses ON surveys_responses(survey_id, batch)');
  run(`CREATE TABLE IF NOT EXISTS surveys_answers (
    response_id TEXT NOT NULL REFERENCES surveys_responses(id) ON DELETE CASCADE,
    question_id TEXT NOT NULL, survey_id TEXT NOT NULL,
    num REAL, text TEXT, choices TEXT,
    PRIMARY KEY (response_id, question_id)) WITHOUT ROWID`);
  run('CREATE INDEX IF NOT EXISTS ix_surveys_answers_q ON surveys_answers(survey_id, question_id)');
  // Cached model summaries of open-text THEMES (aggregates only) per released count.
  run(`CREATE TABLE IF NOT EXISTS surveys_summaries (
    question_id TEXT NOT NULL, n INTEGER NOT NULL, text TEXT NOT NULL, model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (question_id, n))`);
}

// ---------------------------------------------------------------- helpers
const rid = () => crypto.randomBytes(16).toString('hex');
const oid = () => `o${crypto.randomBytes(4).toString('hex')}`;
export const weekStart = (iso = today()) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString().slice(0, 10); };
const ancestors = (deptId) => { const out = []; const seen = new Set(); let d = deptId; while (d && !seen.has(d)) { seen.add(d); out.push(d); d = one('SELECT parent_id FROM departments WHERE id=?', d)?.parent_id; } return out; };
const isOpen = (s) => s.status === 'published' && s.opens_on <= today() && s.closes_on >= today();
const daysLeft = (s) => daysBetween(today(), s.closes_on);
const pctOf = (k, n) => (n ? Math.min(100, Math.round((100 * k) / n)) : null);
const participated = (userId, surveyId) => !!one('SELECT 1 FROM surveys_participation WHERE survey_id=? AND user_id=?', surveyId, userId);

// Who is in the audience (live membership; frozen as a count when the survey closes).
export function eligibleUsers(s) {
  const aud = json(s.audience, []);
  const users = staffUsers();
  if (s.audience_type === 'all') return users;
  if (s.audience_type === 'departments') { const set = new Set(aud.flatMap((id) => deptSubtree(id))); return users.filter((u) => set.has(u.department_id)); }
  if (s.audience_type === 'roles') return users.filter((u) => aud.includes(u.role));
  return [];
}
export function isEligible(user, s) {
  if (!isStaff(user)) return false;
  const aud = json(s.audience, []);
  if (s.audience_type === 'all') return true;
  if (s.audience_type === 'departments') return ancestors(user.department_id).some((d) => aud.includes(d));
  if (s.audience_type === 'roles') return aud.includes(user.role);
  return false;
}
function audienceSql(user, a = 's') {
  const anc = ancestors(user.department_id);
  return {
    sql: `(${a}.audience_type='all' OR (${a}.audience_type='departments' AND EXISTS (SELECT 1 FROM json_each(${a}.audience) j WHERE j.value IN (${inList(anc)})))
      OR (${a}.audience_type='roles' AND EXISTS (SELECT 1 FROM json_each(${a}.audience) j WHERE j.value = ?)))`,
    params: [...anc, user.role],
  };
}
// Authors (surveys.author) who manage the author's department may oversee
// non-draft surveys read-only ("the HR director may see HR-authored ones").
function overseenAuthorsSql(user, a = 's') {
  if (!hasCap(user, CAP)) return null;
  const depts = managedDepartments(user);
  if (!depts.length) return null;
  return { sql: `(${a}.status <> 'draft' AND ${a}.author_id IN (SELECT id FROM users WHERE department_id IN (${inList(depts)}) AND id <> ? AND user_type='staff'))`, params: [...depts, user.id] };
}
// Everything a user may see about a survey is decided HERE, in SQL.
export function scopeSql(user, a = 's') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  const parts = [`${a}.author_id = ?`]; const params = [user.id];
  const ov = overseenAuthorsSql(user, a);
  if (ov) { parts.push(ov.sql); params.push(...ov.params); }
  const aud = audienceSql(user, a);
  parts.push(`(${a}.status = 'published' AND ${aud.sql})`); params.push(...aud.params);
  parts.push(`(${a}.status <> 'draft' AND EXISTS (SELECT 1 FROM surveys_participation p WHERE p.survey_id = ${a}.id AND p.user_id = ?))`); params.push(user.id);
  return { sql: `(${parts.join(' OR ')})`, params };
}
export function visible(user, id) {
  const sc = scopeSql(user);
  const s = one(`SELECT s.* FROM surveys_surveys s WHERE s.id=? AND ${sc.sql}`, String(id || ''), ...sc.params);
  if (!s) throw new NotFound('الاستبيان غير موجود أو غير متاح لك');
  return s;
}
export function roleOf(user, s) {
  if (s.author_id === user.id) return 'author';
  if (s.status !== 'draft' && hasCap(user, CAP) && isManagerOf(user, s.author_id)) return 'overseer';
  return 'respondent';
}
function resultsAccess(user, s, role, took) {
  if (s.status === 'draft') return null;
  if (role === 'author' || role === 'overseer') return 'full';
  if (s.status === 'closed' && s.share_results && took) return 'shared';
  return null;
}
function requireAuthor(user, s) {
  if (roleOf(user, s) !== 'author') throw new Forbidden('يدير الاستبيانَ مُعِدُّه فقط؛ يمكنك الاطلاع دون تعديل');
  requireCap(user, CAP);
}
function overseersOf(s) {
  const author = one('SELECT department_id FROM users WHERE id=?', s.author_id);
  if (!author) return [];
  return usersWithCap(CAP).filter((id) => id !== s.author_id).filter((id) => {
    const u = one("SELECT id, role, department_id, user_type FROM users WHERE id=? AND user_type='staff'", id);
    return u && managedDepartments(u).includes(author.department_id);
  });
}
const participantIds = (surveyId) => all('SELECT user_id FROM surveys_participation WHERE survey_id=?', surveyId).map((r) => r.user_id);

// ---------------------------------------------------------------- lifecycle sweep
// Surveys past their close date are closed (all pending responses released) and
// scheduled surveys whose opening day arrived are announced to their audience.
export function sweep() {
  const t = today();
  for (const s of all("SELECT * FROM surveys_surveys WHERE status='published' AND closes_on < ?", t)) {
    tx(() => closeNow(s, null));
    changed(KEY, [s.author_id, ...overseersOf(s), ...participantIds(s.id)], s.id);
  }
  for (const s of all("SELECT * FROM surveys_surveys WHERE status='published' AND announced=0 AND opens_on <= ? AND closes_on >= ?", t, t)) {
    run('UPDATE surveys_surveys SET announced=1 WHERE id=?', s.id);
    announce(s);
  }
}
function announce(s) {
  const users = eligibleUsers(s).filter((u) => u.id !== s.author_id);
  for (const u of users) alert(u.id, { level: 'info', title: `استبيان جديد بانتظار مشاركتك: «${s.title}»`, body: `يُغلق في ${s.closes_on}${s.anonymous ? ' · إجاباتك مجهولة الهوية' : ''}`, system: KEY, id: s.id });
  changed(KEY, [s.author_id, ...users.map((u) => u.id)], s.id);
}
function releaseBatches(surveyId, { force = false } = {}) {
  const pending = one('SELECT COUNT(*) n FROM surveys_responses WHERE survey_id=? AND batch IS NULL', surveyId).n;
  if (!pending || (!force && pending < MIN_GROUP)) return false;
  const next = (one('SELECT MAX(batch) m FROM surveys_responses WHERE survey_id=?', surveyId).m || 0) + 1;
  run('UPDATE surveys_responses SET batch=? WHERE survey_id=? AND batch IS NULL', next, surveyId);
  return true;
}
function closeNow(s, user) {
  const eligible = eligibleUsers(s).length;
  run("UPDATE surveys_surveys SET status='closed', closed_at=?, eligible_count=?, updated_at=? WHERE id=? AND status='published'", now(), eligible, now(), s.id);
  releaseBatches(s.id, { force: true });
  audit(user, user ? 'surveys.close' : 'surveys.auto_close', s.id, { title: s.title, eligible });
}

// ---------------------------------------------------------------- serialisation
function sectionsOf(surveyId) { return all('SELECT id,title,description,position FROM surveys_sections WHERE survey_id=? ORDER BY position, rowid', surveyId); }
export function questionsOf(surveyId) {
  return all(`SELECT q.id,q.section_id,q.position,q.type,q.text,q.help,q.required,q.options FROM surveys_questions q JOIN surveys_sections s ON s.id=q.section_id
    WHERE q.survey_id=? ORDER BY s.position, q.position, q.rowid`, surveyId).map((q) => ({ ...q, required: !!q.required, options: json(q.options, []) }));
}
function estMinutes(qs) { return Math.max(1, Math.ceil(qs.reduce((s, q) => s + (q.type === 'text' ? 60 : q.type === 'multi' ? 20 : 12), 0) / 60)); }
function audienceLabel(s) {
  const aud = json(s.audience, []);
  if (s.audience_type === 'all') return { ar: 'جميع الموظفين', en: 'All staff' };
  if (s.audience_type === 'roles') return { ar: aud.map((r) => ROLE_LABEL[r]?.[0] || r).join('، '), en: aud.map((r) => ROLE_LABEL[r]?.[1] || r).join(', ') };
  const ds = aud.length ? all(`SELECT id,name_ar,name_en FROM departments WHERE id IN (${inList(aud)})`, ...aud) : [];
  return { ar: ds.map((d) => d.name_ar).join('، '), en: ds.map((d) => d.name_en).join(', ') };
}
function authorOf(s) {
  const u = userBrief(s.author_id);
  return u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en, dept_ar: u.dept_ar, dept_en: u.dept_en, department_id: u.department_id } : null;
}
function statsOf(s) {
  const responded = one('SELECT COUNT(*) n FROM surveys_participation WHERE survey_id=?', s.id).n;
  const released = one('SELECT COUNT(*) n FROM surveys_responses WHERE survey_id=? AND batch IS NOT NULL', s.id).n;
  const eligible = s.status === 'closed' && s.eligible_count != null ? s.eligible_count : eligibleUsers(s).length;
  return { eligible, responded, rate: pctOf(responded, eligible), released, pending_release: s.status === 'published' ? responded - released : 0, results_visible: released >= MIN_GROUP };
}
export function brief(user, s, { role = roleOf(user, s), withStats } = {}) {
  const qs = questionsOf(s.id);
  const aud = audienceLabel(s);
  const took = participated(user.id, s.id);
  const out = {
    id: s.id, title: s.title, description: s.description, status: s.status, anonymous: !!s.anonymous,
    audience_type: s.audience_type, audience: json(s.audience, []), audience_ar: aud.ar, audience_en: aud.en,
    opens_on: s.opens_on, closes_on: s.closes_on, days_left: daysLeft(s), is_open: isOpen(s), scheduled: s.status === 'published' && s.opens_on > today(),
    share_results: !!s.share_results, demo: !!s.is_demo, author: authorOf(s), role,
    question_count: qs.length, section_count: sectionsOf(s.id).length, est_minutes: estMinutes(qs),
    published_at: s.published_at, closed_at: s.closed_at, updated_at: s.updated_at, last_reminder_on: s.last_reminder_on,
    responded: took,
  };
  const access = resultsAccess(user, s, role, took);
  out.results_available = !!access && (access === 'full' || statsOf(s).results_visible);
  if (withStats ?? (role === 'author' || role === 'overseer')) out.stats = statsOf(s);
  return out;
}
function canOf(user, s, role) {
  const author = role === 'author';
  const took = participated(user.id, s.id);
  return {
    edit: author && s.status === 'draft',
    settings: author && s.status !== 'closed',
    publish: author && s.status === 'draft',
    close: author && s.status === 'published',
    remind: author && isOpen(s) && s.last_reminder_on !== today(),
    delete: author && s.status === 'draft',
    share: author && s.status !== 'draft',
    duplicate: hasCap(user, CAP) && (author || role === 'overseer'),
    results: !!resultsAccess(user, s, role, took),
    respond: isOpen(s) && !took && isEligible(user, s),
    participants: (author || role === 'overseer') && !s.anonymous && s.status !== 'draft',
  };
}
export function getSurvey(user, id) {
  const s = visible(user, id);
  const role = roleOf(user, s);
  const out = brief(user, s, { role });
  const qs = questionsOf(s.id);
  out.sections = sectionsOf(s.id).map((sec) => ({ ...sec, questions: qs.filter((q) => q.section_id === sec.id) }));
  out.can = canOf(user, s, role);
  out.eligible = isEligible(user, s);
  if (role === 'author' && s.status === 'draft') out.checklist = checklist(s, qs);
  return out;
}
function checklist(s, qs) {
  const elig = eligibleUsers(s).length;
  const badChoice = qs.filter((q) => CHOICE.includes(q.type) && q.options.length < 2);
  return [
    { key: 'questions', ok: qs.length > 0, ar: 'سؤال واحد على الأقل', en: 'At least one question' },
    { key: 'choices', ok: !badChoice.length, ar: 'لكل سؤال اختيار خياران على الأقل', en: 'Every choice question has 2+ options' },
    { key: 'audience', ok: elig >= MIN_GROUP, ar: `جمهور من ${MIN_GROUP} موظفين أو أكثر (الحالي: ${elig})`, en: `An audience of ${MIN_GROUP}+ staff (now: ${elig})` },
    { key: 'dates', ok: s.closes_on >= today() && s.closes_on >= s.opens_on, ar: 'تاريخ إغلاق صالح في المستقبل', en: 'A valid close date in the future' },
  ];
}

// ---------------------------------------------------------------- lists
export function pending(user) {
  if (!isStaff(user)) return [];
  const aud = audienceSql(user); const t = today();
  return all(`SELECT s.* FROM surveys_surveys s WHERE s.status='published' AND s.opens_on <= ? AND s.closes_on >= ? AND ${aud.sql}
    AND NOT EXISTS (SELECT 1 FROM surveys_participation p WHERE p.survey_id=s.id AND p.user_id=?) ORDER BY s.closes_on, s.title`, t, t, ...aud.params, user.id)
    .map((s) => brief(user, s, { withStats: false }));
}
export function upcoming(user) {
  if (!isStaff(user)) return [];
  const aud = audienceSql(user);
  return all(`SELECT s.* FROM surveys_surveys s WHERE s.status='published' AND s.opens_on > ? AND ${aud.sql} ORDER BY s.opens_on`, today(), ...aud.params)
    .map((s) => brief(user, s, { withStats: false }));
}
export function answered(user) {
  if (!isStaff(user)) return [];
  return all(`SELECT s.*, p.responded_on FROM surveys_participation p JOIN surveys_surveys s ON s.id=p.survey_id
    WHERE p.user_id=? AND s.status <> 'draft' ORDER BY p.responded_on DESC, s.title`, user.id)
    .map((s) => ({ ...brief(user, s, { withStats: false }), responded_on: s.responded_on }));
}
export function mine(user) {
  if (!isStaff(user)) return { authored: [], overseen: [] };
  const authored = all('SELECT s.* FROM surveys_surveys s WHERE s.author_id=? ORDER BY CASE s.status WHEN \'published\' THEN 0 WHEN \'draft\' THEN 1 ELSE 2 END, s.closes_on DESC, s.updated_at DESC', user.id)
    .map((s) => brief(user, s, { role: 'author' }));
  const ov = overseenAuthorsSql(user);
  const overseen = ov ? all(`SELECT s.* FROM surveys_surveys s WHERE ${ov.sql} ORDER BY s.status='closed', s.closes_on DESC`, ...ov.params).map((s) => brief(user, s, { role: 'overseer' })) : [];
  return { authored, overseen, is_author: hasCap(user, CAP) };
}
// Managers: participation of THEIR team in open surveys — shown only for teams of
// MIN_GROUP or more invited staff (never names).
export function team(user) {
  if (!isStaff(user) || !['manager', 'president'].includes(user.role)) return { managed: false, surveys: [] };
  const depts = managedDepartments(user);
  const members = new Set(staffUsers({ departmentIds: depts }).filter((u) => u.id !== user.id).map((u) => u.id));
  const t = today();
  const out = [];
  for (const s of all("SELECT s.* FROM surveys_surveys s WHERE s.status='published' AND s.opens_on <= ? AND s.closes_on >= ? ORDER BY s.closes_on", t, t)) {
    const invited = eligibleUsers(s).filter((u) => members.has(u.id)).map((u) => u.id);
    if (!invited.length) continue;
    const shown = invited.length >= MIN_GROUP;
    const responded = shown ? one(`SELECT COUNT(*) n FROM surveys_participation WHERE survey_id=? AND user_id IN (${inList(invited)})`, s.id, ...invited).n : null;
    const a = authorOf(s);
    out.push({ id: s.id, title: s.title, closes_on: s.closes_on, days_left: daysLeft(s), anonymous: !!s.anonymous, demo: !!s.is_demo,
      author_dept_ar: a?.dept_ar, author_dept_en: a?.dept_en, invited: invited.length, hidden: !shown, responded, rate: shown ? pctOf(responded, invited.length) : null });
  }
  return { managed: true, team_size: members.size, min_group: MIN_GROUP, surveys: out };
}

// ---------------------------------------------------------------- create / update
const AUD_TYPES = ['all', 'departments', 'roles'];
const META = {
  title: str('title', { minLength: 3, maxLength: 200 }), description: str('description', { maxLength: 2000 }),
  anonymous: bool(), audience_type: str('audience', { enum: AUD_TYPES }), audience: arr(str('', { maxLength: 40 }), { maxItems: 40 }),
  opens_on: date(), closes_on: date(), share_results: bool(),
};
const CREATE = S({ ...META, template: str('template', { enum: ['blank', 'pulse', 'service', 'poll'] }) }, ['title']);
const UPDATE = S({ ...META, confirm: bool() });
function validAudience(type, list) {
  const aud = [...new Set(list || [])];
  if (type === 'all') return [];
  if (!aud.length) throw new BadRequest('حدّد الجمهور المستهدف');
  if (type === 'roles') { if (aud.some((r) => !ROLES.includes(r))) throw new BadRequest('دور غير معروف في الجمهور المستهدف'); return aud; }
  const known = all(`SELECT id FROM departments WHERE is_external=0 AND id IN (${inList(aud)})`, ...aud).map((r) => r.id);
  if (known.length !== aud.length) throw new BadRequest('إدارة غير معروفة في الجمهور المستهدف');
  return aud;
}
function validDates(opens, closes) {
  if (closes < opens) throw new BadRequest('تاريخ الإغلاق يجب أن يكون بعد تاريخ الفتح');
}
const TEMPLATES = {
  blank: { sections: [{ title: 'القسم الأول', questions: [] }] },
  pulse: { sections: [{ title: 'نبض الفريق', questions: [
    { type: 'rating', text: 'أنا راضٍ عن عملي بشكل عام' },
    { type: 'rating', text: 'أحصل على الدعم الذي أحتاجه من فريقي ومديري' },
    { type: 'nps', text: 'ما مدى احتمال أن توصي بالجهة كمكان عمل لصديق؟' },
    { type: 'text', text: 'ما الأمر الذي لو تغيّر لجعل عملك أفضل؟', required: false },
  ] }] },
  service: { sections: [{ title: 'تقييم الخدمة', questions: [
    { type: 'rating', text: 'سرعة إنجاز الخدمة' },
    { type: 'rating', text: 'وضوح الإجراءات والمتطلبات' },
    { type: 'rating', text: 'تعامل الموظفين ومهنيتهم' },
    { type: 'yesno', text: 'هل حصلت على الخدمة من المحاولة الأولى؟' },
    { type: 'text', text: 'ما اقتراحك لتحسين الخدمة؟', required: false },
  ] }] },
  poll: { sections: [{ title: 'التصويت', questions: [
    { type: 'single', text: 'أي الخيارات تفضّل؟', options: ['الخيار الأول', 'الخيار الثاني', 'الخيار الثالث'] },
  ] }] },
};
export function createSurvey(user, body) {
  requireCap(user, CAP);
  const b = check(CREATE, body);
  const type = b.audience_type || 'all';
  const aud = validAudience(type, b.audience);
  const opens = b.opens_on || today(); const closes = b.closes_on || day(14);
  validDates(opens, closes);
  const id = uid('sv_');
  tx(() => {
    run(`INSERT INTO surveys_surveys (id,title,description,author_id,status,anonymous,audience_type,audience,opens_on,closes_on,share_results) VALUES (?,?,?,?,'draft',?,?,?,?,?,?)`,
      id, clean(b.title, 200), clean(b.description, 2000), user.id, b.anonymous === false ? 0 : 1, type, JSON.stringify(aud), opens, closes, b.share_results ? 1 : 0);
    const tpl = TEMPLATES[b.template || 'blank'];
    tpl.sections.forEach((sec, si) => {
      const sid = uid('ss_');
      run('INSERT INTO surveys_sections (id,survey_id,title,position) VALUES (?,?,?,?)', sid, id, sec.title, si);
      sec.questions.forEach((q, qi) => run('INSERT INTO surveys_questions (id,survey_id,section_id,position,type,text,required,options) VALUES (?,?,?,?,?,?,?,?)',
        uid('sq_'), id, sid, qi, q.type, q.text, q.required === false ? 0 : 1, JSON.stringify((q.options || []).map((label) => ({ id: oid(), label })))));
    });
  });
  audit(user, 'surveys.create', id, { title: b.title, template: b.template || 'blank' });
  changed(KEY, [user.id], id);
  return getSurvey(user, id);
}
export function updateSurvey(user, id, body) {
  const b = check(UPDATE, body);
  const s = visible(user, id);
  requireAuthor(user, s);
  const fields = Object.keys(b).filter((k) => k !== 'confirm' && b[k] !== undefined);
  const differs = (k) => (k === 'audience' ? JSON.stringify(b.audience || []) !== s.audience : k === 'anonymous' || k === 'share_results' ? (b[k] ? 1 : 0) !== s[k] : b[k] !== s[k]);
  const changedFields = fields.filter(differs);
  if (s.status === 'closed' && changedFields.some((k) => k !== 'share_results')) throw new Conflict('الاستبيان مغلق؛ يمكن فقط تغيير مشاركة النتائج مع المشاركين');
  if (s.status === 'published') {
    const locked = changedFields.filter((k) => ['title', 'anonymous', 'audience_type', 'audience', 'opens_on'].includes(k));
    if (locked.length) throw new Conflict('لا يمكن تغيير العنوان أو الجمهور أو إعداد إخفاء الهوية أو تاريخ الفتح بعد النشر');
  }
  // Sharing results with participants widens who can see them: explicit confirmation.
  if (s.status !== 'draft' && changedFields.includes('share_results')) requireConfirm(b, 'تغيير مشاركة النتائج يتطلب تأكيداً صريحاً');
  const next = { ...s };
  if (changedFields.includes('title')) next.title = clean(b.title, 200);
  if (b.description !== undefined) next.description = clean(b.description, 2000);
  if (changedFields.includes('anonymous')) next.anonymous = b.anonymous ? 1 : 0;
  if (b.audience_type !== undefined || b.audience !== undefined) {
    const type = b.audience_type || s.audience_type;
    next.audience_type = type; next.audience = JSON.stringify(validAudience(type, b.audience ?? json(s.audience, [])));
  }
  if (b.opens_on) next.opens_on = b.opens_on;
  if (b.closes_on) next.closes_on = b.closes_on;
  if (changedFields.includes('share_results')) next.share_results = b.share_results ? 1 : 0;
  validDates(next.opens_on, next.closes_on);
  if (s.status === 'published' && changedFields.includes('closes_on') && next.closes_on < today()) throw new BadRequest('لا يمكن تحديد تاريخ إغلاق في الماضي؛ استخدم «إغلاق الاستبيان» بدلاً من ذلك');
  run(`UPDATE surveys_surveys SET title=?,description=?,anonymous=?,audience_type=?,audience=?,opens_on=?,closes_on=?,share_results=?,updated_at=? WHERE id=?`,
    next.title, next.description, next.anonymous, next.audience_type, next.audience, next.opens_on, next.closes_on, next.share_results, now(), s.id);
  if (changedFields.length) audit(user, changedFields.includes('share_results') ? 'surveys.share_results' : 'surveys.update', s.id, { fields: changedFields, share_results: changedFields.includes('share_results') ? !!next.share_results : undefined });
  changed(KEY, [user.id, ...(s.status === 'draft' ? [] : overseersOf(s)), ...(changedFields.includes('share_results') ? participantIds(s.id) : [])], s.id);
  return getSurvey(user, s.id);
}
export function deleteSurvey(user, id, body) {
  const s = visible(user, id);
  requireAuthor(user, s);
  if (s.status !== 'draft') throw new Conflict('يمكن حذف المسودات فقط؛ الاستبيانات المنشورة تُغلق ولا تُحذف حفاظاً على السجل');
  requireConfirm(body, 'حذف المسودة يتطلب تأكيداً صريحاً');
  run('DELETE FROM surveys_surveys WHERE id=?', s.id);
  audit(user, 'surveys.delete', s.id, { title: s.title });
  changed(KEY, [user.id], s.id);
  return { ok: true, id: s.id };
}
export function publish(user, id) {
  const s = visible(user, id);
  requireAuthor(user, s);
  transition(s.status, 'published', FLOW, STATUS_AR);
  const qs = questionsOf(s.id);
  if (!qs.length) throw new BadRequest('أضف سؤالاً واحداً على الأقل قبل النشر');
  const bad = qs.find((q) => CHOICE.includes(q.type) && q.options.length < 2);
  if (bad) throw new BadRequest(`السؤال «${bad.text}» يحتاج خيارين على الأقل`);
  const t = today();
  if (s.closes_on < t) throw new BadRequest('تاريخ الإغلاق في الماضي — عدّله قبل النشر');
  const elig = eligibleUsers(s);
  if (elig.length < MIN_GROUP) throw new BadRequest(`الجمهور المستهدف ${elig.length} موظفين فقط؛ لا تُعرض النتائج لأقل من ${MIN_GROUP} مشاركين — وسّع الجمهور قبل النشر`);
  const opens = s.opens_on < t ? t : s.opens_on;
  const openNow = opens <= t;
  run("UPDATE surveys_surveys SET status='published', opens_on=?, published_at=?, announced=?, updated_at=? WHERE id=? AND status='draft'", opens, now(), openNow ? 1 : 0, now(), s.id);
  audit(user, 'surveys.publish', s.id, { title: s.title, eligible: elig.length, anonymous: !!s.anonymous });
  const fresh = one('SELECT * FROM surveys_surveys WHERE id=?', s.id);
  if (openNow) announce(fresh);
  changed(KEY, [user.id, ...overseersOf(s)], s.id);
  return getSurvey(user, s.id);
}
export function closeSurvey(user, id, body) {
  const s = visible(user, id);
  requireAuthor(user, s);
  transition(s.status, 'closed', FLOW, STATUS_AR);
  requireConfirm(body, 'إغلاق الاستبيان نهائي ويوقف استقبال الإجابات — يتطلب تأكيداً صريحاً');
  tx(() => closeNow(s, user));
  changed(KEY, [user.id, ...overseersOf(s), ...participantIds(s.id)], s.id);
  return getSurvey(user, s.id);
}
export function remind(user, id) {
  const s = visible(user, id);
  requireAuthor(user, s);
  if (!isOpen(s)) throw new Conflict('التذكير متاح للاستبيانات المفتوحة فقط');
  if (s.last_reminder_on === today()) throw new Conflict('أُرسل تذكير لهذا الاستبيان اليوم بالفعل');
  const took = new Set(participantIds(s.id));
  const targets = eligibleUsers(s).filter((u) => !took.has(u.id) && u.id !== user.id);
  for (const u of targets) alert(u.id, { level: 'info', title: `تذكير: «${s.title}» بانتظار مشاركتك`, body: `يُغلق في ${s.closes_on}${s.anonymous ? ' · إجاباتك مجهولة الهوية' : ''}`, system: KEY, id: s.id });
  run('UPDATE surveys_surveys SET last_reminder_on=? WHERE id=?', today(), s.id);
  audit(user, 'surveys.remind', s.id, { sent: targets.length });
  changed(KEY, [user.id], s.id);
  return { sent: targets.length };
}
export function duplicate(user, id) {
  requireCap(user, CAP);
  const s = visible(user, id);
  const role = roleOf(user, s);
  if (role !== 'author' && role !== 'overseer') throw new Forbidden('يمكن نسخ استبياناتك أو استبيانات فريقك فقط');
  const nid = uid('sv_');
  tx(() => {
    run(`INSERT INTO surveys_surveys (id,title,description,author_id,status,anonymous,audience_type,audience,opens_on,closes_on,share_results) VALUES (?,?,?,?,'draft',?,?,?,?,?,?)`,
      nid, clean(`${s.title} (نسخة)`, 200), s.description, user.id, s.anonymous, s.audience_type, s.audience, today(), day(14), s.share_results);
    const map = new Map();
    for (const sec of sectionsOf(s.id)) { const sid = uid('ss_'); map.set(sec.id, sid); run('INSERT INTO surveys_sections (id,survey_id,title,description,position) VALUES (?,?,?,?,?)', sid, nid, sec.title, sec.description, sec.position); }
    for (const q of questionsOf(s.id)) run('INSERT INTO surveys_questions (id,survey_id,section_id,position,type,text,help,required,options) VALUES (?,?,?,?,?,?,?,?,?)',
      uid('sq_'), nid, map.get(q.section_id), q.position, q.type, q.text, q.help, q.required ? 1 : 0, JSON.stringify(q.options));
  });
  audit(user, 'surveys.duplicate', nid, { from: s.id });
  changed(KEY, [user.id], nid);
  return getSurvey(user, nid);
}

// ---------------------------------------------------------------- builder: sections & questions
function editable(user, id) {
  const s = visible(user, id);
  requireAuthor(user, s);
  if (s.status !== 'draft') throw new Conflict('لا يمكن تعديل الأقسام أو الأسئلة بعد النشر حفاظاً على اتساق النتائج');
  return s;
}
const touch = (user, s) => { run('UPDATE surveys_surveys SET updated_at=? WHERE id=?', now(), s.id); changed(KEY, [user.id], s.id); };
const SECTION = S({ title: str('title', { minLength: 2, maxLength: 160 }), description: str('description', { maxLength: 600 }) }, ['title']);
const SECTION_UPD = S({ title: str('title', { minLength: 2, maxLength: 160 }), description: str('description', { maxLength: 600 }) });
const MOVE = S({ dir: str('up|down', { enum: ['up', 'down'] }) }, ['dir']);
const OPTION = S({ id: str('option id', { maxLength: 20 }), label: str('label', { maxLength: 120 }) }, ['label']);
const QFIELDS = { section_id: str('section id', { maxLength: 40 }), type: str('type', { enum: TYPES }), text: str('question', { minLength: 3, maxLength: 500 }), help: str('help', { maxLength: 500 }), required: bool(), options: arr(OPTION, { maxItems: 12 }) };
const QUESTION = S(QFIELDS, ['type', 'text']);
const QUESTION_UPD = S(QFIELDS);

function sectionOf(s, sid) {
  const sec = one('SELECT * FROM surveys_sections WHERE id=? AND survey_id=?', String(sid || ''), s.id);
  if (!sec) throw new NotFound('القسم غير موجود في هذا الاستبيان');
  return sec;
}
function questionOf(s, qid) {
  const q = one('SELECT * FROM surveys_questions WHERE id=? AND survey_id=?', String(qid || ''), s.id);
  if (!q) throw new NotFound('السؤال غير موجود في هذا الاستبيان');
  return { ...q, options: json(q.options, []) };
}
function normOptions(type, options, existing = []) {
  if (!CHOICE.includes(type)) return [];
  const list = (options ?? existing).map((o) => ({ id: o.id, label: clean(o.label, 120) })).filter((o) => o.label);
  if (list.length < 2) throw new BadRequest('أسئلة الاختيار تحتاج خيارين على الأقل');
  const seenL = new Set(); const seenId = new Set();
  for (const o of list) {
    const k = o.label.toLowerCase();
    if (seenL.has(k)) throw new BadRequest(`الخيار «${o.label}» مكرر`);
    seenL.add(k);
    if (!o.id || !/^o[a-z0-9]{1,16}$/.test(o.id) || seenId.has(o.id)) o.id = oid();
    seenId.add(o.id);
  }
  return list;
}
export function addSection(user, id, body) {
  const b = check(SECTION, body);
  const s = editable(user, id);
  const pos = (one('SELECT MAX(position) m FROM surveys_sections WHERE survey_id=?', s.id).m ?? -1) + 1;
  const sid = uid('ss_');
  run('INSERT INTO surveys_sections (id,survey_id,title,description,position) VALUES (?,?,?,?,?)', sid, s.id, clean(b.title, 160), clean(b.description, 600), pos);
  touch(user, s);
  return getSurvey(user, s.id);
}
export function updateSection(user, id, sid, body) {
  const b = check(SECTION_UPD, body);
  const s = editable(user, id); const sec = sectionOf(s, sid);
  run('UPDATE surveys_sections SET title=?, description=? WHERE id=?', b.title !== undefined ? clean(b.title, 160) : sec.title, b.description !== undefined ? clean(b.description, 600) : sec.description, sec.id);
  touch(user, s);
  return getSurvey(user, s.id);
}
export function deleteSection(user, id, sid, body) {
  const s = editable(user, id); const sec = sectionOf(s, sid);
  if (one('SELECT COUNT(*) n FROM surveys_sections WHERE survey_id=?', s.id).n <= 1) throw new Conflict('يجب أن يبقى قسم واحد على الأقل');
  const n = one('SELECT COUNT(*) n FROM surveys_questions WHERE section_id=?', sec.id).n;
  if (n) requireConfirm(body, `حذف القسم يحذف أسئلته (${n}) — يتطلب تأكيداً صريحاً`);
  run('DELETE FROM surveys_sections WHERE id=?', sec.id);
  renumberSections(s.id);
  audit(user, 'surveys.section_delete', s.id, { section: sec.title, questions: n });
  touch(user, s);
  return getSurvey(user, s.id);
}
function renumberSections(surveyId) { sectionsOf(surveyId).forEach((x, i) => run('UPDATE surveys_sections SET position=? WHERE id=?', i, x.id)); }
function renumberQuestions(sectionId) { all('SELECT id FROM surveys_questions WHERE section_id=? ORDER BY position, rowid', sectionId).forEach((x, i) => run('UPDATE surveys_questions SET position=? WHERE id=?', i, x.id)); }
export function moveSection(user, id, sid, body) {
  const b = check(MOVE, body);
  const s = editable(user, id); const sec = sectionOf(s, sid);
  const list = sectionsOf(s.id); const i = list.findIndex((x) => x.id === sec.id); const j = b.dir === 'up' ? i - 1 : i + 1;
  if (j < 0 || j >= list.length) throw new Conflict(b.dir === 'up' ? 'القسم في الأعلى بالفعل' : 'القسم في الأسفل بالفعل');
  [list[i], list[j]] = [list[j], list[i]];
  tx(() => list.forEach((x, k) => run('UPDATE surveys_sections SET position=? WHERE id=?', k, x.id)));
  touch(user, s);
  return getSurvey(user, s.id);
}
export function addQuestion(user, id, body) {
  const b = check(QUESTION, body);
  const s = editable(user, id);
  if (one('SELECT COUNT(*) n FROM surveys_questions WHERE survey_id=?', s.id).n >= MAX_QUESTIONS) throw new Conflict(`الحد الأقصى ${MAX_QUESTIONS} سؤالاً لكل استبيان`);
  const sec = b.section_id ? sectionOf(s, b.section_id) : sectionsOf(s.id).at(-1);
  if (!sec) throw new Conflict('أضف قسماً أولاً');
  const options = normOptions(b.type, b.options || []);
  const pos = (one('SELECT MAX(position) m FROM surveys_questions WHERE section_id=?', sec.id).m ?? -1) + 1;
  const qid = uid('sq_');
  run('INSERT INTO surveys_questions (id,survey_id,section_id,position,type,text,help,required,options) VALUES (?,?,?,?,?,?,?,?,?)',
    qid, s.id, sec.id, pos, b.type, clean(b.text, 500), clean(b.help, 500), b.required === false ? 0 : 1, JSON.stringify(options));
  touch(user, s);
  return { ...getSurvey(user, s.id), question_id: qid };
}
export function updateQuestion(user, id, qid, body) {
  const b = check(QUESTION_UPD, body);
  const s = editable(user, id); const q = questionOf(s, qid);
  const type = b.type || q.type;
  const options = normOptions(type, b.options, q.options);
  let sectionId = q.section_id; let position = q.position;
  if (b.section_id && b.section_id !== q.section_id) { sectionId = sectionOf(s, b.section_id).id; position = (one('SELECT MAX(position) m FROM surveys_questions WHERE section_id=?', sectionId).m ?? -1) + 1; }
  run('UPDATE surveys_questions SET type=?,text=?,help=?,required=?,options=?,section_id=?,position=? WHERE id=?',
    type, b.text !== undefined ? clean(b.text, 500) : q.text, b.help !== undefined ? clean(b.help, 500) : q.help, b.required === undefined ? q.required : b.required ? 1 : 0, JSON.stringify(options), sectionId, position, q.id);
  if (sectionId !== q.section_id) renumberQuestions(q.section_id);
  touch(user, s);
  return getSurvey(user, s.id);
}
export function deleteQuestion(user, id, qid, body) {
  const s = editable(user, id); const q = questionOf(s, qid);
  requireConfirm(body, 'حذف السؤال يتطلب تأكيداً صريحاً');
  run('DELETE FROM surveys_questions WHERE id=?', q.id);
  renumberQuestions(q.section_id);
  audit(user, 'surveys.question_delete', s.id, { question: q.text });
  touch(user, s);
  return getSurvey(user, s.id);
}
// Move a question up/down; at a section edge it moves into the neighbouring section.
export function moveQuestion(user, id, qid, body) {
  const b = check(MOVE, body);
  const s = editable(user, id); const q = questionOf(s, qid);
  const secs = sectionsOf(s.id); const si = secs.findIndex((x) => x.id === q.section_id);
  const siblings = all('SELECT id FROM surveys_questions WHERE section_id=? ORDER BY position, rowid', q.section_id).map((r) => r.id);
  const i = siblings.indexOf(q.id);
  tx(() => {
    if (b.dir === 'up' && i > 0) { [siblings[i - 1], siblings[i]] = [siblings[i], siblings[i - 1]]; siblings.forEach((x, k) => run('UPDATE surveys_questions SET position=? WHERE id=?', k, x)); }
    else if (b.dir === 'down' && i < siblings.length - 1) { [siblings[i + 1], siblings[i]] = [siblings[i], siblings[i + 1]]; siblings.forEach((x, k) => run('UPDATE surveys_questions SET position=? WHERE id=?', k, x)); }
    else if (b.dir === 'up' && si > 0) { const to = secs[si - 1].id; run('UPDATE surveys_questions SET section_id=?, position=? WHERE id=?', to, (one('SELECT MAX(position) m FROM surveys_questions WHERE section_id=?', to).m ?? -1) + 1, q.id); renumberQuestions(q.section_id); }
    else if (b.dir === 'down' && si < secs.length - 1) { const to = secs[si + 1].id; run('UPDATE surveys_questions SET position=position+1 WHERE section_id=?', to); run('UPDATE surveys_questions SET section_id=?, position=0 WHERE id=?', to, q.id); renumberQuestions(q.section_id); renumberQuestions(to); }
    else throw new Conflict(b.dir === 'up' ? 'السؤال في أول الاستبيان بالفعل' : 'السؤال في آخر الاستبيان بالفعل');
  });
  touch(user, s);
  return getSurvey(user, s.id);
}

// ---------------------------------------------------------------- responding
const RESPONSE = S({ answers: { type: 'object', description: 'question id → answer' } }, ['answers']);
function normalizeAnswer(q, v) {
  const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim()) || (Array.isArray(v) && !v.length);
  if (empty) { if (q.required) throw new BadRequest(`السؤال «${q.text}» مطلوب`); return null; }
  const bad = () => new BadRequest(`إجابة غير صالحة للسؤال «${q.text}»`);
  const ids = new Set(q.options.map((o) => o.id));
  switch (q.type) {
    case 'single': if (typeof v !== 'string' || !ids.has(v)) throw bad(); return { choices: JSON.stringify([v]) };
    case 'multi': if (!Array.isArray(v) || v.some((x) => typeof x !== 'string' || !ids.has(x)) || new Set(v).size !== v.length) throw bad(); return { choices: JSON.stringify(v) };
    case 'rating': if (!Number.isInteger(v) || v < 1 || v > 5) throw bad(); return { num: v };
    case 'nps': if (!Number.isInteger(v) || v < 0 || v > 10) throw bad(); return { num: v };
    case 'yesno': if (typeof v !== 'boolean') throw bad(); return { num: v ? 1 : 0 };
    case 'text': if (typeof v !== 'string' || v.length > 2000) throw bad(); return { text: clean(v, 2000) };
    default: throw bad();
  }
}
export function submitResponse(user, id, body) {
  const b = check(RESPONSE, body);
  if (typeof b.answers !== 'object' || Array.isArray(b.answers)) throw new BadRequest('مدخلات غير صالحة: answers');
  const s = visible(user, id);
  if (s.status !== 'published') throw new Conflict(s.status === 'closed' ? 'أُغلق الاستبيان ولم يعد يستقبل إجابات' : 'الاستبيان غير منشور');
  if (s.opens_on > today()) throw new Conflict(`يُفتح الاستبيان للإجابة في ${s.opens_on}`);
  if (s.closes_on < today()) throw new Conflict('انتهت مدة الاستبيان');
  if (!isEligible(user, s)) throw new Forbidden('هذا الاستبيان غير موجّه إليك');
  if (participated(user.id, s.id)) throw new Conflict('سبق أن شاركت في هذا الاستبيان — يُقبل رد واحد لكل موظف');
  const qs = questionsOf(s.id);
  const known = new Set(qs.map((q) => q.id));
  const unknown = Object.keys(b.answers).find((k) => !known.has(k));
  if (unknown) throw new BadRequest('إجابة لسؤال غير موجود في هذا الاستبيان');
  const rows = qs.map((q) => [q, normalizeAnswer(q, b.answers[q.id])]).filter(([, v]) => v);
  if (!rows.length) throw new BadRequest('لم تُجب عن أي سؤال');
  const t = today();
  tx(() => {
    // Participation first: the primary key enforces one response per person.
    try { run('INSERT INTO surveys_participation (survey_id,user_id,responded_on) VALUES (?,?,?)', s.id, user.id, t); }
    catch { throw new Conflict('سبق أن شاركت في هذا الاستبيان — يُقبل رد واحد لكل موظف'); }
    const r = rid();
    run('INSERT INTO surveys_responses (id,survey_id,dept_id,period,batch,user_id) VALUES (?,?,?,?,NULL,?)', r, s.id, user.department_id, weekStart(t), s.anonymous ? null : user.id);
    for (const [q, v] of rows) run('INSERT INTO surveys_answers (response_id,question_id,survey_id,num,text,choices) VALUES (?,?,?,?,?,?)', r, q.id, s.id, v.num ?? null, v.text ?? null, v.choices ?? null);
    releaseBatches(s.id);
  });
  changed(KEY, [user.id, s.author_id, ...overseersOf(s)], s.id);
  const next = pending(user)[0];
  return { ok: true, anonymous: !!s.anonymous, points: 3, next: next ? { id: next.id, title: next.title } : null };
}
// Non-anonymous surveys only: a respondent may review what they submitted.
export function myResponse(user, id) {
  const s = visible(user, id);
  if (!participated(user.id, s.id)) throw new NotFound('لم تشارك في هذا الاستبيان');
  if (s.anonymous) return { anonymous: true, message_ar: 'إجابتك غير مرتبطة بهويتك، لذلك لا يمكن استرجاعها — هذا ما يضمن إخفاء الهوية.', message_en: 'Your answer is not linked to your identity, so it cannot be retrieved — that is what guarantees anonymity.' };
  const r = one('SELECT id FROM surveys_responses WHERE survey_id=? AND user_id=?', s.id, user.id);
  const ans = r ? all('SELECT question_id,num,text,choices FROM surveys_answers WHERE response_id=?', r.id) : [];
  return { anonymous: false, answers: Object.fromEntries(ans.map((a) => [a.question_id, a.choices ? json(a.choices, []) : a.text ?? a.num])) };
}
export function participants(user, id) {
  const s = visible(user, id);
  const role = roleOf(user, s);
  if (role !== 'author' && role !== 'overseer') throw new Forbidden('قائمة المشاركين متاحة لمُعِدّ الاستبيان فقط');
  if (s.anonymous) throw new Forbidden('لا توجد قائمة بأسماء المشاركين في الاستبيانات المجهولة — المشاركة لا ترتبط بالإجابات');
  if (s.status === 'draft') throw new Conflict('الاستبيان مسودة');
  logAccess(user, KEY, 'participants', s.id, 'view');
  const done = new Map(all('SELECT user_id, responded_on FROM surveys_participation WHERE survey_id=?', s.id).map((r) => [r.user_id, r.responded_on]));
  const people = eligibleUsers(s).map((u) => ({ id: u.id, name_ar: u.name_ar, name_en: u.name_en, dept_ar: u.dept_ar, dept_en: u.dept_en, responded_on: done.get(u.id) || null }));
  return { responded: people.filter((p) => p.responded_on), pending: people.filter((p) => !p.responded_on), access_log: accessLog(KEY, 'participants', s.id, 30) };
}

// ---------------------------------------------------------------- results
function releasedData(surveyId) {
  const responses = all('SELECT id, dept_id FROM surveys_responses WHERE survey_id=? AND batch IS NOT NULL', surveyId);
  const answers = all(`SELECT a.response_id, a.question_id, a.num, a.text, a.choices FROM surveys_answers a JOIN surveys_responses r ON r.id=a.response_id
    WHERE r.survey_id=? AND r.batch IS NOT NULL`, surveyId);
  return { responses, answers };
}
function audienceDepartments(s) {
  const ids = [...new Set(eligibleUsers(s).map((u) => u.department_id))];
  return ids.length ? all(`SELECT id,name_ar,name_en FROM departments WHERE id IN (${inList(ids)}) ORDER BY name_ar`, ...ids) : [];
}
// Participation per department: counts shown only for departments with MIN_GROUP+
// invited staff, with the same secondary suppression as the answers.
function participationByDepartment(s) {
  const elig = eligibleUsers(s);
  const took = new Set(participantIds(s.id));
  const groups = new Map();
  for (const u of elig) { const g = groups.get(u.department_id) || { id: u.department_id, name_ar: u.dept_ar, name_en: u.dept_en, invited: 0, responded: 0 }; g.invited++; if (took.has(u.id)) g.responded++; groups.set(u.department_id, g); }
  const list = [...groups.values()];
  const shown = new Set(list.filter((g) => g.invited >= MIN_GROUP).map((g) => g.id));
  const hiddenInv = () => list.filter((g) => !shown.has(g.id)).reduce((a, g) => a + g.invited, 0);
  while (hiddenInv() > 0 && hiddenInv() < MIN_GROUP && shown.size) shown.delete([...shown].sort((a, b) => groups.get(a).invited - groups.get(b).invited)[0]);
  const rest = list.filter((g) => !shown.has(g.id));
  const restInv = rest.reduce((a, g) => a + g.invited, 0); const restResp = rest.reduce((a, g) => a + g.responded, 0);
  return {
    rows: list.map((g) => (shown.has(g.id) ? { ...g, hidden: false, rate: pctOf(g.responded, g.invited) } : { id: g.id, name_ar: g.name_ar, name_en: g.name_en, invited: g.invited, hidden: true }))
      .sort((a, b) => Number(a.hidden) - Number(b.hidden) || String(a.name_ar).localeCompare(String(b.name_ar), 'ar')),
    other: shown.size && restInv >= MIN_GROUP ? { invited: restInv, responded: restResp, rate: pctOf(restResp, restInv) } : null,
  };
}
export function results(user, id) {
  const s = visible(user, id);
  const role = roleOf(user, s);
  const took = participated(user.id, s.id);
  const access = resultsAccess(user, s, role, took);
  if (!access) throw new Forbidden(s.status === 'draft' ? 'لا نتائج لمسودة' : 'النتائج متاحة لمُعِدّ الاستبيان، وتُتاح للمشاركين بعد الإغلاق إذا قرر المُعِدّ مشاركتها');
  const full = access === 'full';
  const { responses, answers } = releasedData(s.id);
  const res = computeResults({ questions: questionsOf(s.id), sections: sectionsOf(s.id), responses, answers, departments: full ? audienceDepartments(s) : [], includeComments: false, includeSegments: full });
  const st = statsOf(s);
  const out = { survey: brief(user, s, { role, withStats: false }), access, ...res };
  if (!full && out.questions) out.questions = out.questions.map((q) => (q.analysis ? { ...q, analysis: { ...q.analysis, keywords: [] } } : q));
  out.participation = { eligible: st.eligible, responded: st.responded, rate: st.rate };
  if (full) {
    out.participation.released = st.released;
    out.participation.pending_release = st.pending_release;
    let cum = 0;
    out.participation.by_day = all('SELECT responded_on d, COUNT(*) n FROM surveys_participation WHERE survey_id=? GROUP BY responded_on ORDER BY responded_on', s.id).map((r) => ({ date: r.d, n: r.n, cumulative: (cum += r.n) }));
    out.participation.by_department = participationByDepartment(s);
    out.access_log = accessLog(KEY, 'comments', s.id, 30);
    out.can = canOf(user, s, role);
  }
  return out;
}
// Compact aggregates for Ask AI / MCP: authors and overseers only, never comments
// or keywords — themes as counts at most.
export function resultsForAI(user, s) {
  const role = roleOf(user, s);
  if (role !== 'author' && role !== 'overseer') throw new Forbidden('نتائج الاستبيان متاحة لمُعِدّه فقط');
  if (s.status === 'draft') throw new Conflict('الاستبيان ما زال مسودة ولا نتائج له');
  const { responses, answers } = releasedData(s.id);
  const res = computeResults({ questions: questionsOf(s.id), sections: sectionsOf(s.id), responses, answers, departments: audienceDepartments(s), includeComments: false, includeSegments: true });
  const st = statsOf(s);
  const q = (res.questions || []).map((x) => {
    const base = { text: x.text, type: x.type, answers: x.n };
    if (x.suppressed) return { ...base, suppressed: true };
    if (x.type === 'rating') return { ...base, average: x.avg, favourable_pct: x.favourable };
    if (x.type === 'nps') return { ...base, nps: x.nps, promoters_pct: x.promoters.pct, detractors_pct: x.detractors.pct };
    if (x.type === 'yesno') return { ...base, yes_pct: x.yes.pct };
    if (x.type === 'single' || x.type === 'multi') return { ...base, options: x.options.map((o) => ({ label: o.label, pct: o.pct })) };
    if (x.type === 'text') return { ...base, themes: (x.analysis?.themes || []).map((t) => ({ theme: t.ar, mentions: t.mentions, tone: t.tone })) };
    return base;
  });
  return {
    id: s.id, title: s.title, status: s.status, anonymous: !!s.anonymous, closes_on: s.closes_on,
    eligible: st.eligible, responded: st.responded, response_rate: st.rate, released_responses: st.released, min_group: MIN_GROUP,
    hidden: res.hidden, questions: res.hidden ? [] : q, highlights: res.highlights || null,
    segments_shown: res.segments?.shown_groups ?? 0,
  };
}
// Verbatim open-text comments: the survey's author (or overseer) only, pooled
// (≥ MIN_GROUP), ordered by content hash, without date/department — and every
// view is written to the access log shown on the results page.
export function comments(user, id, qid) {
  const s = visible(user, id);
  const role = roleOf(user, s);
  if (role !== 'author' && role !== 'overseer') throw new Forbidden('التعليقات النصية متاحة لمُعِدّ الاستبيان فقط؛ يطّلع المشاركون على المحاور المجمّعة');
  const q = questionOf(s, qid);
  if (q.type !== 'text') throw new BadRequest('التعليقات متاحة للأسئلة النصية فقط');
  const texts = all(`SELECT a.text FROM surveys_answers a JOIN surveys_responses r ON r.id=a.response_id WHERE r.survey_id=? AND r.batch IS NOT NULL AND a.question_id=? AND a.text IS NOT NULL AND a.text <> ''`, s.id, q.id).map((r) => r.text);
  if (texts.length < MIN_GROUP) return { n: texts.length, hidden: true, min_group: MIN_GROUP };
  logAccess(user, KEY, 'comments', s.id, 'view');
  const agg = aggregateQuestion({ ...q, options: [] }, texts.map((text) => ({ text })), { includeComments: true });
  return { n: texts.length, question: q.text, comments: agg.comments, access_log: accessLog(KEY, 'comments', s.id, 30) };
}
export function resultsViewable(user) {
  if (!isStaff(user) || !hasCap(user, CAP)) return [];
  const ov = overseenAuthorsSql(user);
  return all(`SELECT s.* FROM surveys_surveys s WHERE s.status <> 'draft' AND (s.author_id = ?${ov ? ` OR ${ov.sql}` : ''}) ORDER BY s.status='closed', s.closes_on DESC`, user.id, ...(ov ? ov.params : []));
}

// Open-text themes + summary. The model (when connected and allowed by the data
// policy) receives ONLY the aggregated themes — never an individual answer.
const LABELS = {
  ai: ['ملخص بالذكاء الاصطناعي — أُعدّ من المحاور المجمّعة فقط، ولم تُرسل أي إجابة فردية إلى النموذج', 'AI summary — built from aggregated themes only; no individual answer was sent to the model'],
  no_model: ['تحليل محلي — نموذج الذكاء الاصطناعي غير متصل', 'Local analysis — AI model not connected'],
  policy: ['تحليل محلي — سياسة البيانات لا تسمح بإرسال هذه البيانات إلى المساعد الذكي', 'Local analysis — the data policy does not allow sending this to AI'],
  error: ['تحليل محلي — تعذّر الوصول إلى نموذج الذكاء الاصطناعي', 'Local analysis — the AI model could not be reached'],
};
export async function textSummary(user, id, qid) {
  const s = visible(user, id);
  const role = roleOf(user, s);
  const access = resultsAccess(user, s, role, participated(user.id, s.id));
  if (!access) throw new Forbidden('النتائج غير متاحة لك');
  const q = questionOf(s, qid);
  if (q.type !== 'text') throw new BadRequest('الملخص متاح للأسئلة النصية فقط');
  const texts = all(`SELECT a.text FROM surveys_answers a JOIN surveys_responses r ON r.id=a.response_id WHERE r.survey_id=? AND r.batch IS NOT NULL AND a.question_id=? AND a.text IS NOT NULL AND a.text <> ''`, s.id, q.id).map((r) => r.text);
  if (texts.length < MIN_GROUP) return { n: texts.length, hidden: true, min_group: MIN_GROUP };
  const analysis = themesOf(texts);
  if (access !== 'full') analysis.keywords = [];
  const local = localNarrative(analysis);
  let ai = null; let reason = 'no_model';
  if (!aiAllowed(user, 'surveys.results')) reason = 'policy';
  else {
    const cached = one('SELECT text, model FROM surveys_summaries WHERE question_id=? AND n=?', q.id, texts.length);
    if (cached) ai = { text: cached.text, model: cached.model };
    else {
      try {
        const payload = { question: q.text, comments_count: analysis.n, themes: analysis.themes.map((t) => ({ theme: t.ar, mentions: t.mentions, positive: t.positive, negative: t.negative })), unclassified: analysis.other, sentiment: analysis.sentiment };
        const out = await complete({ capability: 'summarize', user, maxTokens: 400,
          system: 'أنت محلل استبيانات في جهة حكومية. تتلقى محاور مجمّعة (أعداد فقط) مستخرجة من تعليقات نصية لسؤال استبيان؛ لا تتوفر لديك التعليقات الأصلية. اكتب بالعربية ملخصاً تنفيذياً من جملتين إلى ثلاث يذكر أبرز المحاور واتجاهها واقتراحاً عملياً واحداً. لا تخترع أرقاماً أو اقتباسات.',
          messages: [{ role: 'user', content: JSON.stringify(payload) }] });
        const text = clean(out.text, 1500);
        if (text) { ai = { text, model: out.model || null }; run('INSERT OR REPLACE INTO surveys_summaries (question_id,n,text,model) VALUES (?,?,?,?)', q.id, texts.length, text, ai.model); }
      } catch (e) { reason = e.local ? 'no_model' : 'error'; }
    }
  }
  const [ar, en] = LABELS[ai ? 'ai' : reason];
  return { n: texts.length, question: q.text, analysis, local, ai, source: ai ? 'ai' : 'local', reason: ai ? null : reason, label_ar: ar, label_en: en };
}
