// Meetings — domain service (نظام الاجتماعات).
// Every function takes the authenticated user and enforces the system's rules
// itself (routes, Ask AI tools, workspace cards and the calendar feed all call
// through here, so they share exactly the same scope):
//  - a meeting (existence included) is visible only to its organizer, its
//    secretary and its invitees — never to managers, the president or the
//    platform admin by virtue of their role;
//  - confidential (restricted) meetings are logged on every view/change, their
//    titles and contents are masked in every list/card/alert/task/game event and
//    only revealed inside the logged detail view; Ask AI never reaches them;
//  - workflows are explicit state machines with segregation of duties
//    (whoever circulates the minutes can never approve them).
import * as K from '../kit.js';
import * as W from '../../services/work.js';
import * as D from '../../services/documents.js';
import { canAssignTo, canViewProject, documentAccess } from '../../policy.js';
import { getUser } from '../../identity.js';
import { complete } from '../../ai/services.js';

const { one, all, run, uid, now, today, tx, Forbidden, NotFound, BadRequest, Conflict, clean } = K;

export const SYS = 'meetings';
export const ORG_TZ = -240; // organisation wall clock (UTC+4), JS getTimezoneOffset convention
export const MASK = { ar: 'اجتماع سري للغاية', en: 'Restricted meeting' };
const HOUR = 36e5;
const DAY = 864e5;

export const TYPES = {
  management: ['اجتماع إدارة', 'Management meeting'],
  committee: ['اجتماع لجنة', 'Committee meeting'],
  project: ['اجتماع مشروع', 'Project meeting'],
  coordination: ['اجتماع تنسيقي', 'Coordination meeting'],
};
export const MINUTES_FLOW = { none: ['draft'], draft: ['circulated'], circulated: ['approved', 'draft'], approved: [] };
export const MINUTES_LABELS = { none: 'لا يوجد محضر', draft: 'مسودة', circulated: 'معمّم للاعتماد', approved: 'معتمد' };
export const DECISION_FLOW = { open: ['in_progress', 'done', 'cancelled'], in_progress: ['done', 'open', 'cancelled'], done: ['in_progress'], cancelled: ['open'] };
export const DECISION_LABELS = { open: 'مفتوح', in_progress: 'قيد التنفيذ', done: 'منفّذ', cancelled: 'ملغى' };

// ---------------------------------------------------------------- time helpers
const tzOf = (tz) => (Number.isFinite(+tz) && Math.abs(+tz) <= 840 ? +tz : ORG_TZ);
export const localDay = (iso, tz = ORG_TZ) => new Date(Date.parse(iso) - tzOf(tz) * 6e4).toISOString().slice(0, 10);
export const dayStartUtc = (day, tz = ORG_TZ) => new Date(Date.parse(`${day}T00:00:00Z`) + tzOf(tz) * 6e4).toISOString();
const addDays = (day, n) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);
// Platform convention (see services/game.js): Friday and Saturday are the weekend.
export const isWeekend = (day) => [5, 6].includes(new Date(`${day}T12:00:00Z`).getUTCDay());
export function addWorkingDays(day, n) { let d = day; let k = 0; while (k < n) { d = addDays(d, 1); if (!isWeekend(d)) k++; } return d; }
// Minutes count as "on time" when circulated no later than 2 working days after the meeting day.
export const circulatedOnTime = (endsAt, circulatedAt) => !!circulatedAt && localDay(circulatedAt) <= addWorkingDays(localDay(endsAt), 2);
const AR_DAYS = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export function arWhen(iso, tz = ORG_TZ) {
  const d = new Date(Date.parse(iso) - tzOf(tz) * 6e4);
  return `${AR_DAYS[d.getUTCDay()]} ${d.toISOString().slice(0, 10)} الساعة ${d.toISOString().slice(11, 16)}`;
}
export const hhmm = (iso, tz = ORG_TZ) => new Date(Date.parse(iso) - tzOf(tz) * 6e4).toISOString().slice(11, 16);
const isIso = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(s) && !Number.isNaN(Date.parse(s));
const isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`));

// ---------------------------------------------------------------- scope
// The one and only visibility rule. Put it in the SQL of every read.
export function scopeSql(user, alias = 'm') {
  return {
    sql: `(${alias}.organizer_id=? OR ${alias}.secretary_id=? OR EXISTS (SELECT 1 FROM meetings_attendees va WHERE va.meeting_id=${alias}.id AND va.user_id=?))`,
    params: [user.id, user.id, user.id],
  };
}
export function loadVisible(user, id, { ai = false } = {}) {
  if (!K.isStaff(user) || !id) throw new NotFound('الاجتماع غير موجود أو غير متاح لك');
  const s = scopeSql(user);
  const m = one(`SELECT m.* FROM meetings_meetings m WHERE m.id=? AND ${s.sql}${ai ? ' AND m.confidential=0' : ''}`, id, ...s.params);
  if (!m) throw new NotFound('الاجتماع غير موجود أو غير متاح لك');
  return m;
}
export const participants = (meetingId) => all('SELECT user_id FROM meetings_attendees WHERE meeting_id=?', meetingId).map((r) => r.user_id);
function touch(m, userIds = participants(m.id)) {
  run('UPDATE meetings_meetings SET updated_at=? WHERE id=?', now(), m.id);
  K.changed(SYS, [...userIds, m.organizer_id, m.secretary_id], m.id);
}
function history(m, user, action, detail = null) {
  run('INSERT INTO meetings_history (id,meeting_id,user_id,action,detail,at) VALUES (?,?,?,?,?,?)', uid('mh_'), m.id, user?.id ?? null, action, detail ? JSON.stringify(detail) : null, now());
  if (m.confidential && user?.id) K.logAccess(user, SYS, 'meeting', m.id, action);
}
// Alert text never carries restricted content: confidential meetings get a neutral wording.
const titleFor = (m) => (m.confidential ? MASK.ar : `«${m.title}»`);

export function phase(m, t = now()) {
  if (m.status === 'cancelled') return 'cancelled';
  if (t < m.starts_at) return 'upcoming';
  if (t < m.ends_at) return 'live';
  return 'ended';
}
const briefRow = (u) => u && { id: u.id, name_ar: u.name_ar, name_en: u.name_en, dept_ar: u.dept_ar, dept_en: u.dept_en, title_ar: u.title_ar, title_en: u.title_en };
const brief = (id) => briefRow(K.userBrief(id));
const committeeBrief = (id) => (id ? one('SELECT id,name_ar,name_en,confidential FROM meetings_committees WHERE id=?', id) : null);
const attendeeOf = (meetingId, userId) => one('SELECT * FROM meetings_attendees WHERE meeting_id=? AND user_id=?', meetingId, userId);

// List row: restricted meetings are masked here — the title is only revealed in
// the (logged) detail view.
export function listRow(user, m) {
  const me = attendeeOf(m.id, user.id);
  const c = one(`SELECT COUNT(*) n, SUM(rsvp='accepted') acc, SUM(rsvp='declined') dec, SUM(rsvp='tentative') ten, SUM(rsvp='pending') pen
    FROM meetings_attendees WHERE meeting_id=?`, m.id);
  const people = all(`SELECT a.user_id id, u.name_ar, u.name_en, a.rsvp FROM meetings_attendees a JOIN users u ON u.id=a.user_id
    WHERE a.meeting_id=? ORDER BY (a.user_id=?) DESC, a.required DESC, u.name_ar LIMIT 6`, m.id, m.organizer_id);
  const cm = committeeBrief(m.committee_id);
  return {
    id: m.id, title: m.confidential ? null : m.title, masked: !!m.confidential, type: m.type,
    committee: cm ? { id: cm.id, name_ar: cm.name_ar, name_en: cm.name_en } : null,
    starts_at: m.starts_at, ends_at: m.ends_at, location: m.location, virtual: !!m.virtual_link,
    confidential: !!m.confidential, status: m.status, phase: phase(m), minutes_status: m.minutes_status,
    organizer: brief(m.organizer_id),
    my: { role: m.organizer_id === user.id ? 'organizer' : m.secretary_id === user.id ? 'secretary' : 'attendee', rsvp: me?.rsvp || null, required: !!me?.required, attendance: me?.attendance || null, review: me?.review || 'none' },
    counts: { invited: c.n || 0, accepted: c.acc || 0, declined: c.dec || 0, tentative: c.ten || 0, pending: c.pen || 0 },
    people, is_demo: !!m.is_demo,
  };
}

export function listVisible(user, { from, to, q, includeCancelled = true, ai = false, limit = 300, order = 'ASC' } = {}) {
  if (!K.isStaff(user)) return [];
  const s = scopeSql(user);
  let sql = `SELECT m.* FROM meetings_meetings m WHERE ${s.sql}`;
  const params = [...s.params];
  if (ai) sql += ' AND m.confidential=0';
  if (!includeCancelled) sql += " AND m.status='scheduled'";
  if (from) { sql += ' AND m.ends_at >= ?'; params.push(from); }
  if (to) { sql += ' AND m.starts_at < ?'; params.push(to); }
  // Text search never matches restricted meetings (their titles are not searchable).
  if (q) { sql += ' AND m.confidential=0 AND (m.title LIKE ? OR m.description LIKE ?)'; params.push(K.like(q), K.like(q)); }
  sql += ` ORDER BY m.starts_at ${order === 'DESC' ? 'DESC' : 'ASC'} LIMIT ?`; params.push(limit);
  return all(sql, ...params);
}

// ---------------------------------------------------------------- detail
function quorumOf(m) {
  if (!m.committee_id) return null;
  const c = one('SELECT quorum FROM meetings_committees WHERE id=?', m.committee_id);
  const members = all('SELECT user_id FROM meetings_committee_members WHERE committee_id=?', m.committee_id).map((r) => r.user_id);
  const present = one(`SELECT COUNT(*) n FROM meetings_attendees WHERE meeting_id=? AND attendance='present' AND user_id IN (${K.inList(members)})`, m.id, ...members).n;
  const recorded = !!one('SELECT 1 FROM meetings_attendees WHERE meeting_id=? AND attendance IS NOT NULL', m.id);
  return { required: c?.quorum || 1, members: members.length, present, recorded, met: recorded && present >= (c?.quorum || 1) };
}
export function reviewers(m) {
  return all("SELECT user_id, review, review_at FROM meetings_attendees WHERE meeting_id=? AND review<>'none'", m.id);
}
function perms(user, m) {
  const ph = phase(m); const org = m.organizer_id === user.id; const sec = m.secretary_id === user.id; const manage = org || sec;
  const me = attendeeOf(m.id, user.id);
  const open = m.status !== 'cancelled';
  const started = ph === 'live' || ph === 'ended';
  const editable = ['none', 'draft'].includes(m.minutes_status);
  return {
    manage, organizer: org, secretary: sec,
    edit: org && open && ph !== 'ended',
    cancel: org && open && ph === 'upcoming',
    invite: org && open && m.minutes_status !== 'approved',
    rsvp: !org && !!me && open && ph !== 'ended',
    agenda: manage && open && editable,
    link_docs: org && open && editable,
    minutes: manage && open && started && editable,
    attendance: manage && open && started && editable,
    decisions: manage && open && started && editable,
    actions: manage && open && started && editable,
    circulate: manage && open && started && editable,
    revise: manage && m.minutes_status === 'circulated',
    review: !!me && m.minutes_status === 'circulated' && ['pending', 'commented'].includes(me.review),
    comment: !!me && m.minutes_status === 'circulated',
    finalize: org && m.minutes_status === 'circulated' && m.minutes_circulated_by !== user.id,
    export_doc: manage && !m.confidential && m.minutes_status !== 'none',
    access_log: !!m.confidential && manage,
  };
}
function taskStatus(taskId) {
  if (!taskId) return null;
  const t = one('SELECT id,status,due_date,completed_at,deleted_at FROM tasks WHERE id=?', taskId);
  return t ? { id: t.id, status: t.deleted_at ? 'removed' : t.status, completed_at: t.completed_at } : null;
}
export function actionView(a) {
  const task = taskStatus(a.task_id);
  let status = a.status;
  if (a.status === 'open' && task) status = task.status === 'done' ? 'done' : task.status === 'removed' ? 'task_removed' : task.status === 'in_progress' ? 'in_progress' : 'open';
  const overdue = ['open', 'in_progress', 'pending_acceptance'].includes(status) && !!a.due_date && a.due_date < today();
  return { id: a.id, meeting_id: a.meeting_id, decision_id: a.decision_id, agenda_id: a.agenda_id, title: a.title, assignee: brief(a.assignee_id), due_date: a.due_date, priority: a.priority, status, stored_status: a.status, task, overdue, decline_reason: a.decline_reason, created_at: a.created_at, is_demo: !!a.is_demo };
}
export function decisionView(d) {
  return { id: d.id, meeting_id: d.meeting_id, agenda_id: d.agenda_id, number: d.number, text: d.text, owner: brief(d.owner_id), due_date: d.due_date, status: d.status, overdue: ['open', 'in_progress'].includes(d.status) && !!d.due_date && d.due_date < today(), created_at: d.created_at, updated_at: d.updated_at };
}

export function getMeeting(user, id) {
  const m = loadVisible(user, id);
  if (m.confidential) K.logAccess(user, SYS, 'meeting', m.id, 'view');
  return detail(user, m);
}
export function detail(user, m) {
  const can = perms(user, m);
  const attendees = all(`SELECT a.*, u.name_ar, u.name_en, u.title_ar, u.title_en, d.name_ar dept_ar, d.name_en dept_en FROM meetings_attendees a
    JOIN users u ON u.id=a.user_id JOIN departments d ON d.id=u.department_id WHERE a.meeting_id=? ORDER BY (a.user_id=?) DESC, (a.user_id=?) DESC, a.required DESC, u.name_ar`, m.id, m.organizer_id, m.secretary_id || '')
    .map((a) => ({ id: a.user_id, name_ar: a.name_ar, name_en: a.name_en, title_ar: a.title_ar, title_en: a.title_en, dept_ar: a.dept_ar, dept_en: a.dept_en, required: !!a.required, rsvp: a.rsvp, rsvp_note: a.rsvp_note, rsvp_at: a.rsvp_at, attendance: a.attendance, review: a.review, review_at: a.review_at, role: a.user_id === m.organizer_id ? 'organizer' : a.user_id === m.secretary_id ? 'secretary' : 'attendee' }));
  const agenda = all('SELECT * FROM meetings_agenda WHERE meeting_id=? ORDER BY seq, created_at', m.id).map((g) => {
    let doc = null;
    if (g.document_id) {
      const d = one('SELECT id,title,deleted_at FROM documents WHERE id=?', g.document_id);
      const acc = d && !d.deleted_at ? documentAccess(user, d.id).level : null;
      doc = d && !d.deleted_at ? { id: d.id, title: acc ? d.title : null, accessible: !!acc } : { id: g.document_id, title: null, accessible: false, removed: true };
    }
    return { id: g.id, seq: g.seq, title: g.title, presenter: brief(g.presenter_id), duration_min: g.duration_min, document: doc, minutes: g.minutes || '', minutes_updated_at: g.minutes_updated_at, minutes_updated_by: brief(g.minutes_updated_by) };
  });
  const decisions = all('SELECT * FROM meetings_decisions WHERE meeting_id=? ORDER BY number', m.id).map(decisionView);
  const actions = all('SELECT * FROM meetings_actions WHERE meeting_id=? ORDER BY created_at', m.id).map(actionView);
  const comments = all('SELECT c.*, u.name_ar, u.name_en FROM meetings_comments c JOIN users u ON u.id=c.user_id WHERE c.meeting_id=? ORDER BY c.created_at', m.id)
    .map((c) => ({ id: c.id, body: c.body, agenda_id: c.agenda_id, created_at: c.created_at, user: { id: c.user_id, name_ar: c.name_ar, name_en: c.name_en } }));
  const hist = all('SELECT h.*, u.name_ar, u.name_en FROM meetings_history h LEFT JOIN users u ON u.id=h.user_id WHERE h.meeting_id=? ORDER BY h.at DESC LIMIT 40', m.id)
    .map((x) => ({ action: x.action, at: x.at, detail: K.json(x.detail), who: x.user_id ? { id: x.user_id, name_ar: x.name_ar, name_en: x.name_en } : null }));
  const revs = reviewers(m);
  // The linked project is named only to invitees who may see that project themselves.
  const project = m.project_id && canViewProject(user, m.project_id) ? one('SELECT id,name FROM projects WHERE id=? AND deleted_at IS NULL', m.project_id) : null;
  const cm = committeeBrief(m.committee_id);
  return {
    id: m.id, title: m.title, description: m.description || '', type: m.type,
    committee: cm, project: project ? { id: project.id, name: project.name } : null,
    starts_at: m.starts_at, ends_at: m.ends_at, location: m.location, virtual_link: m.virtual_link,
    confidential: !!m.confidential, status: m.status, cancel_reason: m.cancel_reason, phase: phase(m),
    minutes: {
      status: m.minutes_status, circulated_at: m.minutes_circulated_at, circulated_by: brief(m.minutes_circulated_by),
      approved_at: m.minutes_approved_at, approved_by: m.minutes_approved_by === 'all' ? 'all' : brief(m.minutes_approved_by),
      reviewers: revs.map((r) => ({ id: r.user_id, review: r.review, review_at: r.review_at })),
      approvals: revs.filter((r) => r.review === 'approved').length,
      on_time: m.minutes_circulated_at ? circulatedOnTime(m.ends_at, m.minutes_circulated_at) : null,
      due_day: addWorkingDays(localDay(m.ends_at), 2),
    },
    organizer: brief(m.organizer_id), secretary: brief(m.secretary_id),
    attendees, agenda, decisions, actions, comments, history: hist,
    quorum: quorumOf(m),
    attendance_taken_at: m.attendance_taken_at,
    can, is_demo: !!m.is_demo, created_at: m.created_at, updated_at: m.updated_at,
    access_log: can.access_log ? K.accessLog(SYS, 'meeting', m.id, 30) : null,
  };
}

// ---------------------------------------------------------------- validation helpers
const requireManage = (user, m) => { if (m.organizer_id !== user.id && m.secretary_id !== user.id) throw new Forbidden('هذا الإجراء لمنظّم الاجتماع أو أمين السر فقط'); };
const requireOrganizer = (user, m) => { if (m.organizer_id !== user.id) throw new Forbidden('هذا الإجراء لمنظّم الاجتماع فقط'); };
const requireOpen = (m) => { if (m.status === 'cancelled') throw new Conflict('الاجتماع ملغى'); };
const requireStarted = (m) => { if (phase(m) === 'upcoming') throw new Conflict('لم يبدأ الاجتماع بعد'); };
const requireMinutesEditable = (m) => { if (!['none', 'draft'].includes(m.minutes_status)) throw new Conflict(m.minutes_status === 'approved' ? 'المحضر معتمد ولا يمكن تعديله' : 'المحضر معمّم للاعتماد؛ أعده إلى المسودة أولاً لتعديله'); };
function requireInvitee(m, userId, what = 'الشخص') {
  if (!userId) return null;
  if (!attendeeOf(m.id, userId)) throw new BadRequest(`${what} يجب أن يكون من المدعوين للاجتماع`);
  return userId;
}
function staffId(id) {
  const u = one("SELECT id FROM users WHERE id=? AND active=1 AND user_type='staff'", id);
  if (!u) throw new BadRequest('يمكن دعوة موظفي الجهة فقط');
  return u.id;
}
function cleanLink(url) {
  if (!url) return null;
  const s = String(url).trim();
  if (!/^https:\/\/[^\s<>"']{3,500}$/i.test(s)) throw new BadRequest('رابط الاجتماع الافتراضي يجب أن يبدأ بـ https://');
  return s;
}
function timesFrom(input, cur = {}) {
  const starts = input.starts_at ?? cur.starts_at;
  if (!isIso(starts)) throw new BadRequest('وقت بدء الاجتماع غير صالح');
  let ends = input.ends_at ?? null;
  if (!ends && input.duration_min) ends = new Date(Date.parse(starts) + input.duration_min * 6e4).toISOString();
  if (!ends && cur.ends_at && input.starts_at && cur.starts_at) ends = new Date(Date.parse(input.starts_at) + (Date.parse(cur.ends_at) - Date.parse(cur.starts_at))).toISOString();
  ends ||= cur.ends_at || new Date(Date.parse(starts) + HOUR).toISOString();
  if (!isIso(ends)) throw new BadRequest('وقت انتهاء الاجتماع غير صالح');
  const s = new Date(starts).toISOString(); const e = new Date(ends).toISOString();
  if (e <= s) throw new BadRequest('يجب أن ينتهي الاجتماع بعد بدايته');
  if (Date.parse(e) - Date.parse(s) > 12 * HOUR) throw new BadRequest('مدة الاجتماع لا تتجاوز 12 ساعة');
  return { starts_at: s, ends_at: e };
}

// ---------------------------------------------------------------- create / update / cancel
export function createMeeting(user, input) {
  K.requireStaff(user);
  const title = clean(input.title, 200);
  if (title.length < 3) throw new BadRequest('عنوان الاجتماع مطلوب (3 أحرف على الأقل)');
  let type = input.type || 'management';
  if (!TYPES[type]) throw new BadRequest('نوع الاجتماع غير صالح');
  const { starts_at, ends_at } = timesFrom(input);
  if (Date.parse(starts_at) < Date.now() - 7 * DAY) throw new BadRequest('لا يمكن تسجيل اجتماع مضى عليه أكثر من 7 أيام');
  if (Date.parse(starts_at) > Date.now() + 400 * DAY) throw new BadRequest('موعد الاجتماع بعيد جداً');
  let confidential = input.confidential ? 1 : 0;
  let secretary = input.secretary_id ? staffId(input.secretary_id) : null;
  if (secretary === user.id) secretary = null; // the organizer keeps the minutes themselves
  let committee = null;
  const invite = new Map(); // user_id -> required
  if (input.committee_id) {
    committee = one('SELECT * FROM meetings_committees WHERE id=? AND active=1', input.committee_id);
    const role = committee && one('SELECT role FROM meetings_committee_members WHERE committee_id=? AND user_id=?', committee.id, user.id)?.role;
    if (!committee || (committee.confidential && !role)) throw new NotFound('اللجنة غير موجودة أو غير متاحة لك');
    if (!['chair', 'secretary'].includes(role)) throw new Forbidden('يجدول اجتماعات اللجنة رئيسها أو أمين سرها فقط');
    type = 'committee';
    if (committee.confidential) confidential = 1;
    secretary ||= committee.secretary_id && committee.secretary_id !== user.id ? committee.secretary_id : null;
    for (const r of all('SELECT user_id FROM meetings_committee_members WHERE committee_id=?', committee.id)) invite.set(r.user_id, 1);
  } else if (type === 'committee') throw new BadRequest('اختر اللجنة لاجتماع من نوع «لجنة»');
  let projectId = null;
  if (input.project_id) { W.getProject(user, input.project_id); projectId = input.project_id; } // 404 when not visible
  for (const a of input.attendees || []) invite.set(staffId(a.user_id), a.required === false ? 0 : 1);
  for (const id of input.attendee_ids || []) if (!invite.has(id)) invite.set(staffId(id), 1);
  invite.delete(user.id);
  if (secretary) invite.set(secretary, 1);
  const agenda = (input.agenda || []).map((g) => (typeof g === 'string' ? { title: g } : g)).filter((g) => clean(g.title, 300).length >= 2);
  const id = uid('mt_');
  tx(() => {
    run(`INSERT INTO meetings_meetings (id,title,type,committee_id,project_id,description,organizer_id,secretary_id,department_id,starts_at,ends_at,location,virtual_link,confidential,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, title, type, committee?.id || null, projectId, clean(input.description, 2000), user.id, secretary, user.department_id,
    starts_at, ends_at, clean(input.location, 200) || null, cleanLink(input.virtual_link), confidential, user.id, now(), now());
    run("INSERT INTO meetings_attendees (meeting_id,user_id,required,rsvp,rsvp_at) VALUES (?,?,1,'accepted',?)", id, user.id, now());
    for (const [uidv, req] of invite) run('INSERT INTO meetings_attendees (meeting_id,user_id,required) VALUES (?,?,?)', id, uidv, req);
    agenda.forEach((g, i) => {
      const presenter = g.presenter_id && (g.presenter_id === user.id || invite.has(g.presenter_id)) ? g.presenter_id : null;
      run('INSERT INTO meetings_agenda (id,meeting_id,seq,title,presenter_id,duration_min,created_at) VALUES (?,?,?,?,?,?,?)', uid('ag_'), id, i + 1, clean(g.title, 300), presenter, Number.isInteger(g.duration_min) ? Math.min(240, Math.max(5, g.duration_min)) : 15, now());
    });
  });
  const m = one('SELECT * FROM meetings_meetings WHERE id=?', id);
  history(m, user, 'created');
  K.audit(user, 'meetings.create', id, { confidential: !!confidential, invitees: invite.size });
  for (const uidv of invite.keys()) {
    K.alert(uidv, { level: 'info', title: `دعوة إلى ${m.confidential ? MASK.ar : `اجتماع «${m.title}»`}`, body: m.confidential ? 'افتح نظام الاجتماعات للاطلاع على التفاصيل والرد على الدعوة' : `${arWhen(m.starts_at)} — بدعوة من ${user.name_ar}`, system: SYS, id });
  }
  touch(m);
  return getMeeting(user, id);
}

export function updateMeeting(user, id, input) {
  const m = loadVisible(user, id);
  requireOrganizer(user, m); requireOpen(m);
  if (phase(m) === 'ended') throw new Conflict('لا يمكن تعديل بيانات اجتماع انتهى');
  const f = {};
  if (input.title !== undefined) { const t = clean(input.title, 200); if (t.length < 3) throw new BadRequest('عنوان الاجتماع مطلوب'); f.title = t; }
  if (input.description !== undefined) f.description = clean(input.description, 2000);
  if (input.location !== undefined) f.location = clean(input.location, 200) || null;
  if (input.virtual_link !== undefined) f.virtual_link = cleanLink(input.virtual_link);
  if (input.starts_at !== undefined || input.ends_at !== undefined || input.duration_min !== undefined) Object.assign(f, timesFrom(input, m));
  if (input.secretary_id !== undefined) {
    f.secretary_id = input.secretary_id ? staffId(input.secretary_id) : null;
    if (f.secretary_id === m.organizer_id) f.secretary_id = null;
  }
  if (input.confidential !== undefined && !!input.confidential !== !!m.confidential) {
    const cm = committeeBrief(m.committee_id);
    if (!input.confidential) {
      if (cm?.confidential) throw new Conflict('اجتماعات اللجان السرية سرية دائماً');
      // Lowering the classification widens exposure (lists, Ask AI): explicit confirmation + audit.
      K.requireConfirm(input, 'إلغاء سرية الاجتماع يتيح عنوانه في القوائم وللمساعد الذكي؛ يتطلب تأكيداً صريحاً');
    }
    f.confidential = input.confidential ? 1 : 0;
  }
  if (!Object.keys(f).length) throw new BadRequest('لا توجد حقول للتحديث');
  const keys = Object.keys(f);
  tx(() => {
    run(`UPDATE meetings_meetings SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=? WHERE id=?`, ...keys.map((k) => f[k]), now(), m.id);
    if (f.secretary_id && !attendeeOf(m.id, f.secretary_id)) run('INSERT INTO meetings_attendees (meeting_id,user_id,required) VALUES (?,?,1)', m.id, f.secretary_id);
  });
  const after = one('SELECT * FROM meetings_meetings WHERE id=?', m.id);
  history(after, user, 'updated', { fields: keys });
  K.audit(user, 'meetings.update', m.id, { fields: keys, confidential: f.confidential });
  if (f.starts_at && f.starts_at !== m.starts_at) {
    for (const u of participants(m.id)) if (u !== user.id) K.alert(u, { level: 'warning', title: `تغيّر موعد ${titleFor(after)}`, body: after.confidential ? 'افتح نظام الاجتماعات للاطلاع على الموعد الجديد' : `الموعد الجديد: ${arWhen(after.starts_at)}`, system: SYS, id: m.id });
  }
  touch(after);
  return getMeeting(user, m.id);
}

export function cancelMeeting(user, id, input = {}) {
  const m = loadVisible(user, id);
  requireOrganizer(user, m);
  K.transition(m.status, 'cancelled', { scheduled: ['cancelled'] }, { scheduled: 'مجدول', cancelled: 'ملغى' });
  if (phase(m) !== 'upcoming') throw new Conflict('لا يمكن إلغاء اجتماع بدأ أو انتهى');
  K.requireConfirm(input, 'إلغاء الاجتماع يُبلغ جميع المدعوين؛ يتطلب تأكيداً صريحاً');
  const reason = clean(input.reason, 500);
  run("UPDATE meetings_meetings SET status='cancelled', cancel_reason=?, updated_at=? WHERE id=?", reason || null, now(), m.id);
  history(m, user, 'cancelled', { reason });
  K.audit(user, 'meetings.cancel', m.id, { reason });
  for (const u of participants(m.id)) if (u !== user.id) K.alert(u, { level: 'warning', title: `أُلغي ${m.confidential ? MASK.ar : `اجتماع «${m.title}»`}`, body: m.confidential ? '' : reason, system: SYS, id: m.id });
  touch(m);
  return getMeeting(user, m.id);
}

// ---------------------------------------------------------------- attendees & RSVP & attendance
export function inviteAttendees(user, id, input) {
  const m = loadVisible(user, id);
  requireOrganizer(user, m); requireOpen(m);
  if (m.minutes_status === 'approved') throw new Conflict('المحضر معتمد؛ لا يمكن تعديل قائمة المدعوين');
  const ids = [...new Set((input.user_ids || []).map(staffId))].filter((u) => !attendeeOf(m.id, u));
  if (!ids.length) throw new BadRequest('لا يوجد مدعوون جدد');
  for (const u of ids) run('INSERT INTO meetings_attendees (meeting_id,user_id,required) VALUES (?,?,?)', m.id, u, input.required === false ? 0 : 1);
  history(m, user, 'invited', { count: ids.length });
  K.audit(user, 'meetings.invite', m.id, { user_ids: ids });
  for (const u of ids) K.alert(u, { level: 'info', title: `دعوة إلى ${m.confidential ? MASK.ar : `اجتماع «${m.title}»`}`, body: m.confidential ? 'افتح نظام الاجتماعات للاطلاع على التفاصيل والرد على الدعوة' : arWhen(m.starts_at), system: SYS, id: m.id });
  touch(m);
  return getMeeting(user, m.id);
}

export function removeAttendee(user, id, userId, input = {}) {
  const m = loadVisible(user, id);
  requireOrganizer(user, m); requireOpen(m);
  const a = attendeeOf(m.id, userId);
  if (!a) throw new NotFound('المدعو غير موجود في هذا الاجتماع');
  if (userId === m.organizer_id || userId === m.secretary_id) throw new Conflict('لا يمكن إزالة المنظّم أو أمين السر؛ غيّر أمين السر أولاً');
  if (m.minutes_status === 'approved') throw new Conflict('المحضر معتمد؛ لا يمكن تعديل قائمة المدعوين');
  const busy = one("SELECT 1 FROM meetings_actions WHERE meeting_id=? AND assignee_id=? AND status IN ('open','pending_acceptance')", m.id, userId)
    || one("SELECT 1 FROM meetings_decisions WHERE meeting_id=? AND owner_id=? AND status IN ('open','in_progress')", m.id, userId)
    || one('SELECT 1 FROM meetings_agenda WHERE meeting_id=? AND presenter_id=?', m.id, userId);
  if (busy) throw new Conflict('لهذا المدعو بنود أو قرارات أو تكليفات مفتوحة في الاجتماع؛ أعد إسنادها أولاً');
  // Removing an invitee revokes their access to the meeting: explicit confirmation + audit.
  K.requireConfirm(input, 'إزالة المدعو تسحب اطلاعه على الاجتماع؛ يتطلب تأكيداً صريحاً');
  run('DELETE FROM meetings_attendees WHERE meeting_id=? AND user_id=?', m.id, userId);
  history(m, user, 'uninvited', { user_id: userId });
  K.audit(user, 'meetings.uninvite', m.id, { user_id: userId });
  K.changed(SYS, [userId], m.id);
  touch(m);
  return getMeeting(user, m.id);
}

export function respond(user, id, input) {
  const m = loadVisible(user, id);
  requireOpen(m);
  if (m.organizer_id === user.id) throw new Conflict('المنظّم لا يرد على دعوته');
  if (phase(m) === 'ended') throw new Conflict('انتهى الاجتماع');
  const a = attendeeOf(m.id, user.id);
  if (!a) throw new Forbidden('لست من المدعوين لهذا الاجتماع');
  const note = clean(input.note, 300) || null;
  if (input.response === 'declined' && a.required && !note) throw new BadRequest('يُرجى ذكر سبب الاعتذار عن اجتماع حضورك فيه مطلوب');
  run('UPDATE meetings_attendees SET rsvp=?, rsvp_note=?, rsvp_at=? WHERE meeting_id=? AND user_id=?', input.response, note, now(), m.id, user.id);
  history(m, user, `rsvp_${input.response}`);
  if (input.response === 'declined' && a.required) {
    K.alert(m.organizer_id, { level: 'info', title: `اعتذر ${user.name_ar} عن ${m.confidential ? MASK.ar : `اجتماع «${m.title}»`}`, body: m.confidential ? '' : note || '', system: SYS, id: m.id });
  }
  touch(m);
  return getMeeting(user, m.id);
}

export function setAttendance(user, id, input) {
  const m = loadVisible(user, id);
  requireManage(user, m); requireOpen(m); requireStarted(m); requireMinutesEditable(m);
  const entries = input.entries || [];
  if (!entries.length) throw new BadRequest('لا توجد بيانات حضور');
  tx(() => {
    for (const e of entries) {
      if (!attendeeOf(m.id, e.user_id)) throw new BadRequest('أحد الأشخاص ليس من المدعوين');
      run('UPDATE meetings_attendees SET attendance=? WHERE meeting_id=? AND user_id=?', e.status || null, m.id, e.user_id);
    }
    run('UPDATE meetings_meetings SET attendance_taken_at=? WHERE id=?', now(), m.id);
  });
  history(m, user, 'attendance', { count: entries.length });
  touch(m);
  return getMeeting(user, m.id);
}

// ---------------------------------------------------------------- agenda & minutes
export function addAgendaItem(user, id, input) {
  const m = loadVisible(user, id);
  requireManage(user, m); requireOpen(m); requireMinutesEditable(m);
  const title = clean(input.title, 300);
  if (title.length < 2) throw new BadRequest('عنوان البند مطلوب');
  const presenter = requireInvitee(m, input.presenter_id || null, 'مقدّم البند');
  const docId = input.document_id ? linkableDoc(user, m, input.document_id) : null;
  const seq = (one('SELECT MAX(seq) s FROM meetings_agenda WHERE meeting_id=?', m.id).s || 0) + 1;
  const aid = uid('ag_');
  run('INSERT INTO meetings_agenda (id,meeting_id,seq,title,presenter_id,duration_min,document_id,created_at) VALUES (?,?,?,?,?,?,?,?)', aid, m.id, seq, title, presenter, input.duration_min ?? 15, docId, now());
  history(m, user, 'agenda_added');
  touch(m);
  return getMeeting(user, m.id);
}
// Only the organizer may attach a document, and only one of their own Documents.
function linkableDoc(user, m, docId) {
  if (m.organizer_id !== user.id) throw new Forbidden('يرفق المنظّم مستنداته فقط');
  if (documentAccess(user, docId).level !== 'owner') throw new NotFound('المستند غير موجود ضمن مستنداتك');
  return docId;
}
function loadAgenda(m, agendaId) {
  const g = one('SELECT * FROM meetings_agenda WHERE id=? AND meeting_id=?', agendaId, m.id);
  if (!g) throw new NotFound('البند غير موجود');
  return g;
}
export function updateAgendaItem(user, id, agendaId, input) {
  const m = loadVisible(user, id);
  requireManage(user, m); requireOpen(m); requireMinutesEditable(m);
  const g = loadAgenda(m, agendaId);
  const f = {};
  if (input.title !== undefined) { const t = clean(input.title, 300); if (t.length < 2) throw new BadRequest('عنوان البند مطلوب'); f.title = t; }
  if (input.presenter_id !== undefined) f.presenter_id = requireInvitee(m, input.presenter_id || null, 'مقدّم البند');
  if (input.duration_min !== undefined) f.duration_min = input.duration_min;
  if (input.document_id !== undefined) f.document_id = input.document_id ? linkableDoc(user, m, input.document_id) : (m.organizer_id === user.id ? null : g.document_id);
  if (input.minutes !== undefined) {
    requireStarted(m);
    f.minutes = clean(input.minutes, 8000); f.minutes_updated_at = now(); f.minutes_updated_by = user.id;
  }
  if (input.move) {
    const other = one(`SELECT id,seq FROM meetings_agenda WHERE meeting_id=? AND seq ${input.move === 'up' ? '<' : '>'} ? ORDER BY seq ${input.move === 'up' ? 'DESC' : 'ASC'} LIMIT 1`, m.id, g.seq);
    if (other) { run('UPDATE meetings_agenda SET seq=? WHERE id=?', g.seq, other.id); f.seq = other.seq; }
  }
  if (!Object.keys(f).length) throw new BadRequest('لا توجد حقول للتحديث');
  const keys = Object.keys(f);
  run(`UPDATE meetings_agenda SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => f[k]), g.id);
  if (input.minutes !== undefined && m.minutes_status === 'none') run("UPDATE meetings_meetings SET minutes_status='draft' WHERE id=?", m.id);
  history(m, user, input.minutes !== undefined ? 'minutes_saved' : 'agenda_updated');
  touch(m);
  return getMeeting(user, m.id);
}
export function removeAgendaItem(user, id, agendaId, input = {}) {
  const m = loadVisible(user, id);
  requireManage(user, m); requireOpen(m); requireMinutesEditable(m);
  const g = loadAgenda(m, agendaId);
  K.requireConfirm(input, 'حذف البند يحذف محضره أيضاً؛ يتطلب تأكيداً صريحاً');
  tx(() => {
    run('UPDATE meetings_decisions SET agenda_id=NULL WHERE agenda_id=?', g.id);
    run('UPDATE meetings_actions SET agenda_id=NULL WHERE agenda_id=?', g.id);
    run('DELETE FROM meetings_agenda WHERE id=?', g.id);
  });
  history(m, user, 'agenda_removed', { title: m.confidential ? null : g.title });
  K.audit(user, 'meetings.agenda.remove', m.id, { agenda_id: g.id });
  touch(m);
  return getMeeting(user, m.id);
}
// Share an agenda document (organizer's own) with every invitee — a permission change.
export function shareAgendaDocument(user, id, agendaId, input = {}) {
  const m = loadVisible(user, id);
  requireOrganizer(user, m); requireOpen(m);
  const g = loadAgenda(m, agendaId);
  if (!g.document_id) throw new BadRequest('لا يوجد مستند مرفق بهذا البند');
  if (documentAccess(user, g.document_id).level !== 'owner') throw new Forbidden('يشارك مالك المستند فقط');
  K.requireConfirm(input, 'مشاركة المستند تمنح المدعوين صلاحية الاطلاع عليه؛ يتطلب تأكيداً صريحاً');
  const targets = participants(m.id).filter((u) => u !== user.id && !one('SELECT 1 FROM document_shares WHERE document_id=? AND user_id=?', g.document_id, u));
  for (const u of targets) D.shareDocument(user, { id: g.document_id, user_id: u, permission: 'view' });
  history(m, user, 'document_shared', { count: targets.length });
  K.audit(user, 'meetings.share_document', m.id, { document_id: g.document_id, count: targets.length });
  touch(m);
  return { ...getMeeting(user, m.id), shared_with: targets.length };
}

// ---------------------------------------------------------------- decisions
function requireQuorum(m) {
  const q = quorumOf(m);
  if (!q) return;
  if (!q.recorded) throw new Conflict('سجّل حضور أعضاء اللجنة أولاً للتحقق من النصاب');
  if (!q.met) throw new Conflict(`النصاب غير مكتمل (الحاضرون ${q.present} من ${q.required} مطلوبين)؛ لا يمكن تسجيل قرارات للجنة`);
}
export function addDecision(user, id, input) {
  const m = loadVisible(user, id);
  requireManage(user, m); requireOpen(m); requireStarted(m); requireMinutesEditable(m);
  requireQuorum(m);
  const text = clean(input.text, 1500);
  if (text.length < 5) throw new BadRequest('نص القرار مطلوب');
  const owner = requireInvitee(m, input.owner_id || null, 'المسؤول عن القرار');
  if (input.agenda_id) loadAgenda(m, input.agenda_id);
  if (input.due_date && !isDate(input.due_date)) throw new BadRequest('تاريخ غير صالح');
  const number = (one('SELECT MAX(number) n FROM meetings_decisions WHERE meeting_id=?', m.id).n || 0) + 1;
  const did = uid('md_');
  run('INSERT INTO meetings_decisions (id,meeting_id,agenda_id,number,text,owner_id,due_date,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    did, m.id, input.agenda_id || null, number, text, owner, input.due_date || null, 'open', user.id, now(), now());
  if (m.minutes_status === 'none') run("UPDATE meetings_meetings SET minutes_status='draft' WHERE id=?", m.id);
  history(m, user, 'decision_added', { number });
  if (owner && owner !== user.id) K.alert(owner, { level: 'info', title: `قرار مسند إليك في ${titleFor(m)}`, body: m.confidential ? 'افتح نظام الاجتماعات للاطلاع' : text.slice(0, 160), system: SYS, id: m.id });
  touch(m);
  return decisionView(one('SELECT * FROM meetings_decisions WHERE id=?', did));
}
export function updateDecision(user, decisionId, input) {
  const d = one('SELECT * FROM meetings_decisions WHERE id=?', decisionId);
  if (!d) throw new NotFound('القرار غير موجود أو غير متاح لك');
  const m = loadVisible(user, d.meeting_id); // 404 when the meeting is not visible
  requireOpen(m);
  const manage = m.organizer_id === user.id || m.secretary_id === user.id;
  const f = {};
  if (input.status !== undefined) {
    if (!manage && d.owner_id !== user.id) throw new Forbidden('يحدّث حالة القرار المسؤول عنه أو منظّم الاجتماع');
    f.status = K.transition(d.status, input.status, DECISION_FLOW, DECISION_LABELS);
  }
  if (input.text !== undefined || input.owner_id !== undefined || input.due_date !== undefined) {
    if (!manage) throw new Forbidden('يعدّل نص القرار منظّم الاجتماع أو أمين السر');
    requireMinutesEditable(m);
    if (input.text !== undefined) { const t = clean(input.text, 1500); if (t.length < 5) throw new BadRequest('نص القرار مطلوب'); f.text = t; }
    if (input.owner_id !== undefined) f.owner_id = requireInvitee(m, input.owner_id || null, 'المسؤول عن القرار');
    if (input.due_date !== undefined) { if (input.due_date && !isDate(input.due_date)) throw new BadRequest('تاريخ غير صالح'); f.due_date = input.due_date || null; }
  }
  if (!Object.keys(f).length) throw new BadRequest('لا توجد حقول للتحديث');
  const keys = Object.keys(f);
  run(`UPDATE meetings_decisions SET ${keys.map((k) => `${k}=?`).join(',')}, updated_at=? WHERE id=?`, ...keys.map((k) => f[k]), now(), d.id);
  history(m, user, f.status ? `decision_${f.status}` : 'decision_updated', { number: d.number });
  touch(m);
  return decisionView(one('SELECT * FROM meetings_decisions WHERE id=?', d.id));
}

// ---------------------------------------------------------------- action items (→ real tasks)
const taskTitle = (m, title) => (m.confidential ? 'تكليف من اجتماع سري — التفاصيل في نظام الاجتماعات' : title);
const taskDesc = (m) => (m.confidential ? 'تكليف مرتبط باجتماع سري للغاية؛ لا تُعرض تفاصيله خارج نظام الاجتماعات.' : `تكليف من اجتماع «${m.title}» (${localDay(m.starts_at)}) — نظام الاجتماعات`);
export function addAction(user, id, input, { ai = false } = {}) {
  const m = loadVisible(user, id, { ai });
  requireManage(user, m); requireOpen(m); requireStarted(m); requireMinutesEditable(m);
  const title = clean(input.title, 300);
  if (title.length < 3) throw new BadRequest('عنوان التكليف مطلوب');
  const assignee = requireInvitee(m, input.assignee_id, 'المكلّف');
  if (!assignee) throw new BadRequest('حدّد المكلّف');
  if (input.due_date && !isDate(input.due_date)) throw new BadRequest('تاريخ الاستحقاق غير صالح');
  if (input.due_date && input.due_date < localDay(m.starts_at)) throw new BadRequest('تاريخ الاستحقاق قبل موعد الاجتماع');
  if (input.decision_id && !one('SELECT 1 FROM meetings_decisions WHERE id=? AND meeting_id=?', input.decision_id, m.id)) throw new NotFound('القرار غير موجود');
  if (input.agenda_id) loadAgenda(m, input.agenda_id);
  const priority = input.priority || 'medium';
  const organizer = getUser(m.organizer_id);
  const aid = uid('ma_');
  let taskId = null; let status = 'pending_acceptance';
  // Real task when the organizer may assign work to that person (platform policy);
  // otherwise the assignee is asked to accept the action item first.
  if (organizer && canAssignTo(organizer, assignee)) {
    const t = W.createTask(organizer, { title: taskTitle(m, title), description: taskDesc(m), assignee_id: assignee, due_date: input.due_date || undefined, priority });
    taskId = t.result.id; status = 'open';
  }
  run('INSERT INTO meetings_actions (id,meeting_id,decision_id,agenda_id,title,assignee_id,due_date,priority,status,task_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    aid, m.id, input.decision_id || null, input.agenda_id || null, title, assignee, input.due_date || null, priority, status, taskId, user.id, now());
  if (m.minutes_status === 'none') run("UPDATE meetings_meetings SET minutes_status='draft' WHERE id=?", m.id);
  history(m, user, 'action_added', { status });
  if (status === 'pending_acceptance') {
    K.alert(assignee, { level: 'info', title: `تكليف من ${titleFor(m)} بانتظار قبولك`, body: m.confidential ? 'افتح نظام الاجتماعات للاطلاع والرد' : title, system: SYS, id: m.id });
  }
  touch(m);
  return actionView(one('SELECT * FROM meetings_actions WHERE id=?', aid));
}
function loadAction(user, actionId) {
  const a = one('SELECT * FROM meetings_actions WHERE id=?', actionId);
  if (!a) throw new NotFound('التكليف غير موجود أو غير متاح لك');
  const m = loadVisible(user, a.meeting_id);
  return { a, m };
}
export function acceptAction(user, actionId) {
  const { a, m } = loadAction(user, actionId);
  if (a.assignee_id !== user.id) throw new Forbidden('يقبل التكليف المكلّف به فقط');
  K.transition(a.status, 'open', { pending_acceptance: ['open', 'declined'] }, { pending_acceptance: 'بانتظار القبول', open: 'مقبول', declined: 'معتذر عنه', cancelled: 'ملغى' });
  const t = W.createTask(user, { title: taskTitle(m, a.title), description: taskDesc(m), assignee_id: user.id, due_date: a.due_date || undefined, priority: a.priority || 'medium' });
  run("UPDATE meetings_actions SET status='open', task_id=?, responded_at=? WHERE id=?", t.result.id, now(), a.id);
  history(m, user, 'action_accepted');
  touch(m);
  return actionView(one('SELECT * FROM meetings_actions WHERE id=?', a.id));
}
export function declineAction(user, actionId, input) {
  const { a, m } = loadAction(user, actionId);
  if (a.assignee_id !== user.id) throw new Forbidden('يعتذر عن التكليف المكلّف به فقط');
  const reason = clean(input.reason, 500);
  if (reason.length < 3) throw new BadRequest('يُرجى ذكر سبب الاعتذار');
  K.transition(a.status, 'declined', { pending_acceptance: ['open', 'declined'] }, { pending_acceptance: 'بانتظار القبول', declined: 'معتذر عنه', open: 'مقبول', cancelled: 'ملغى' });
  run("UPDATE meetings_actions SET status='declined', decline_reason=?, responded_at=? WHERE id=?", reason, now(), a.id);
  history(m, user, 'action_declined');
  for (const u of new Set([m.organizer_id, m.secretary_id].filter(Boolean))) K.alert(u, { level: 'warning', title: `اعتذر ${user.name_ar} عن تكليف في ${titleFor(m)}`, body: m.confidential ? '' : `${a.title} — ${reason}`, system: SYS, id: m.id });
  touch(m);
  return actionView(one('SELECT * FROM meetings_actions WHERE id=?', a.id));
}
export function cancelAction(user, actionId, input = {}) {
  const { a, m } = loadAction(user, actionId);
  requireManage(user, m);
  K.transition(a.status, 'cancelled', { pending_acceptance: ['cancelled'], open: ['cancelled'] }, { declined: 'معتذر عنه', cancelled: 'ملغى', open: 'مفتوح', pending_acceptance: 'بانتظار القبول' });
  K.requireConfirm(input, 'إلغاء التكليف يلغي المهمة المرتبطة إن لم تُنجز؛ يتطلب تأكيداً صريحاً');
  const t = a.task_id ? one('SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL', a.task_id) : null;
  let taskRemoved = false;
  if (t && t.status !== 'done' && t.created_by === m.organizer_id) {
    const organizer = getUser(m.organizer_id);
    try { W.deleteTask(organizer, { id: t.id }); taskRemoved = true; } catch { /* the assignee keeps the task */ }
  }
  run("UPDATE meetings_actions SET status='cancelled', responded_at=? WHERE id=?", now(), a.id);
  history(m, user, 'action_cancelled');
  K.audit(user, 'meetings.action.cancel', m.id, { action_id: a.id, task_removed: taskRemoved });
  if (a.assignee_id !== user.id) K.alert(a.assignee_id, { level: 'info', title: `أُلغي تكليف من ${titleFor(m)}`, body: m.confidential ? '' : a.title, system: SYS, id: m.id });
  touch(m);
  return actionView(one('SELECT * FROM meetings_actions WHERE id=?', a.id));
}

// ---------------------------------------------------------------- minutes lifecycle
function hasMinutesContent(m) {
  return !!one("SELECT 1 FROM meetings_agenda WHERE meeting_id=? AND length(trim(coalesce(minutes,'')))>0", m.id) || !!one('SELECT 1 FROM meetings_decisions WHERE meeting_id=?', m.id);
}
export function circulateMinutes(user, id) {
  const m = loadVisible(user, id);
  requireManage(user, m); requireOpen(m); requireStarted(m);
  K.transition(m.minutes_status === 'none' ? 'draft' : m.minutes_status, 'circulated', MINUTES_FLOW, MINUTES_LABELS);
  if (!hasMinutesContent(m)) throw new Conflict('اكتب محضر بند واحد على الأقل أو سجّل قراراً قبل التعميم');
  if (!m.attendance_taken_at) throw new Conflict('سجّل الحضور قبل تعميم المحضر');
  // Segregation of duties: whoever circulates can never approve.
  const revs = all("SELECT user_id FROM meetings_attendees WHERE meeting_id=? AND attendance='present' AND user_id<>?", m.id, user.id).map((r) => r.user_id);
  if (!revs.length) throw new Conflict('لا يوجد حاضرون آخرون لاعتماد المحضر');
  tx(() => {
    run("UPDATE meetings_attendees SET review='none', review_at=NULL WHERE meeting_id=?", m.id);
    run(`UPDATE meetings_attendees SET review='pending' WHERE meeting_id=? AND user_id IN (${K.inList(revs)})`, m.id, ...revs);
    run("UPDATE meetings_meetings SET minutes_status='circulated', minutes_circulated_at=?, minutes_circulated_by=?, minutes_approved_at=NULL, minutes_approved_by=NULL, updated_at=? WHERE id=?", now(), user.id, now(), m.id);
  });
  history(m, user, 'minutes_circulated', { reviewers: revs.length });
  K.audit(user, 'meetings.minutes.circulate', m.id, { reviewers: revs.length });
  for (const u of revs) K.alert(u, { level: 'info', title: `محضر ${titleFor(m)} بانتظار اعتمادك`, body: m.confidential ? 'افتح نظام الاجتماعات لمراجعة المحضر' : `عمّمه ${user.name_ar}`, system: SYS, id: m.id });
  touch(m);
  return getMeeting(user, m.id);
}
export function reviseMinutes(user, id) {
  const m = loadVisible(user, id);
  requireManage(user, m);
  K.transition(m.minutes_status, 'draft', MINUTES_FLOW, MINUTES_LABELS);
  tx(() => {
    run("UPDATE meetings_attendees SET review='none', review_at=NULL WHERE meeting_id=?", m.id);
    run("UPDATE meetings_meetings SET minutes_status='draft', minutes_circulated_at=NULL, minutes_circulated_by=NULL, updated_at=? WHERE id=?", now(), m.id);
  });
  history(m, user, 'minutes_revised');
  touch(m);
  return getMeeting(user, m.id);
}
function maybeApproveAll(m, user) {
  const rows = reviewers(m);
  if (rows.length && rows.every((r) => r.review === 'approved')) {
    run("UPDATE meetings_meetings SET minutes_status='approved', minutes_approved_at=?, minutes_approved_by='all', updated_at=? WHERE id=?", now(), now(), m.id);
    history(m, user, 'minutes_approved', { by: 'all' });
    K.audit(user, 'meetings.minutes.approved', m.id, { by: 'all' });
    for (const u of new Set([m.organizer_id, m.secretary_id].filter(Boolean))) if (u !== user.id) K.alert(u, { level: 'info', title: `اعتُمد محضر ${titleFor(m)}`, body: 'اعتمده جميع الحاضرين', system: SYS, id: m.id });
  }
}
export function approveMinutes(user, id) {
  const m = loadVisible(user, id);
  if (m.minutes_status !== 'circulated') throw new Conflict('المحضر ليس معمّماً للاعتماد');
  if (m.minutes_circulated_by === user.id) throw new Forbidden('لا يعتمد معمّم المحضر محضره (فصل المهام)');
  const a = attendeeOf(m.id, user.id);
  if (!a || !['pending', 'commented'].includes(a.review)) throw new Forbidden(a?.review === 'approved' ? 'اعتمدت هذا المحضر مسبقاً' : 'اعتماد المحضر للحاضرين المدعوين للمراجعة');
  run("UPDATE meetings_attendees SET review='approved', review_at=? WHERE meeting_id=? AND user_id=?", now(), m.id, user.id);
  history(m, user, 'minutes_review_approved');
  maybeApproveAll(m, user);
  touch(m);
  return getMeeting(user, m.id);
}
export function commentMinutes(user, id, input) {
  const m = loadVisible(user, id);
  if (m.minutes_status !== 'circulated') throw new Conflict('تُضاف الملاحظات على المحضر أثناء تعميمه فقط');
  const a = attendeeOf(m.id, user.id);
  if (!a) throw new Forbidden('الملاحظات للمدعوين فقط');
  const body = clean(input.body, 2000);
  if (body.length < 2) throw new BadRequest('نص الملاحظة مطلوب');
  if (input.agenda_id) loadAgenda(m, input.agenda_id);
  run('INSERT INTO meetings_comments (id,meeting_id,user_id,agenda_id,body,created_at) VALUES (?,?,?,?,?,?)', uid('mc_'), m.id, user.id, input.agenda_id || null, body, now());
  if (['pending', 'approved'].includes(a.review)) run("UPDATE meetings_attendees SET review='commented', review_at=? WHERE meeting_id=? AND user_id=?", now(), m.id, user.id);
  history(m, user, 'minutes_commented');
  const author = m.minutes_circulated_by || m.secretary_id || m.organizer_id;
  if (author !== user.id) K.alert(author, { level: 'info', title: `ملاحظة جديدة على محضر ${titleFor(m)}`, body: m.confidential ? '' : `${user.name_ar}: ${body.slice(0, 140)}`, system: SYS, id: m.id });
  touch(m);
  return getMeeting(user, m.id);
}
// Organizer's final approval when some reviewers did not respond: never by the
// person who circulated (SoD), needs a majority of approvals and no open comments.
export function finalizeMinutes(user, id, input = {}) {
  const m = loadVisible(user, id);
  requireOrganizer(user, m);
  if (m.minutes_circulated_by === user.id) throw new Forbidden('لا يعتمد معمّم المحضر محضره نهائياً (فصل المهام)');
  K.transition(m.minutes_status, 'approved', MINUTES_FLOW, MINUTES_LABELS);
  const rows = reviewers(m);
  if (rows.some((r) => r.review === 'commented')) throw new Conflict('توجد ملاحظات لم تُعالج؛ أعد المحضر إلى المسودة لمعالجتها');
  const approved = rows.filter((r) => r.review === 'approved').length;
  if (approved * 2 < rows.length) throw new Conflict(`يلزم اعتماد أغلبية الحاضرين أولاً (${approved} من ${rows.length})`);
  K.requireConfirm(input, 'الاعتماد النهائي يغلق المحضر أمام التعديل؛ يتطلب تأكيداً صريحاً');
  run("UPDATE meetings_meetings SET minutes_status='approved', minutes_approved_at=?, minutes_approved_by=?, updated_at=? WHERE id=?", now(), user.id, now(), m.id);
  history(m, user, 'minutes_approved', { by: 'organizer', approvals: approved, reviewers: rows.length });
  K.audit(user, 'meetings.minutes.finalize', m.id, { approvals: approved, reviewers: rows.length });
  touch(m);
  return getMeeting(user, m.id);
}

function minutesText(m) {
  const agenda = all('SELECT * FROM meetings_agenda WHERE meeting_id=? ORDER BY seq', m.id);
  const decisions = all('SELECT * FROM meetings_decisions WHERE meeting_id=? ORDER BY number', m.id);
  const actions = all('SELECT * FROM meetings_actions WHERE meeting_id=? AND status<>? ORDER BY created_at', m.id, 'cancelled');
  const name = (id) => K.userBrief(id)?.name_ar || '—';
  return { agenda, decisions, actions, name };
}
// Deterministic, transparent summary used when no model is connected (and always for restricted meetings).
function localSummary(m) {
  const { agenda, decisions, actions, name } = minutesText(m);
  const present = all("SELECT u.name_ar FROM meetings_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=? AND a.attendance='present'", m.id).map((r) => r.name_ar);
  const lines = [];
  lines.push(`عُقد الاجتماع ${arWhen(m.starts_at)}${present.length ? ` بحضور ${present.length} ${present.length > 10 ? 'عضواً' : 'أعضاء'}` : ''}، وناقش ${agenda.length} ${agenda.length === 1 ? 'بنداً' : 'بنود'}.`);
  const covered = agenda.filter((g) => (g.minutes || '').trim());
  for (const g of covered.slice(0, 6)) lines.push(`• ${g.title}: ${g.minutes.trim().split(/(?<=[.!؟?])\s+/)[0].slice(0, 220)}`);
  if (decisions.length) { lines.push(`القرارات (${decisions.length}):`); for (const d of decisions) lines.push(`${d.number}. ${d.text}${d.owner_id ? ` — المسؤول: ${name(d.owner_id)}` : ''}`); }
  if (actions.length) { lines.push(`التكليفات (${actions.length}):`); for (const a of actions) lines.push(`– ${a.title} — ${name(a.assignee_id)}${a.due_date ? ` (حتى ${a.due_date})` : ''}`); }
  return lines.join('\n');
}
export async function summarizeMinutes(user, id) {
  const m = loadVisible(user, id);
  if (m.confidential) K.logAccess(user, SYS, 'meeting', m.id, 'summary');
  const local = () => ({ text: localSummary(m), source: 'local', label_ar: m.confidential ? 'تحليل محلي — لا تُرسل بيانات الاجتماعات السرية إلى أي نموذج' : 'تحليل محلي — نموذج الذكاء الاصطناعي غير متصل', label_en: m.confidential ? 'Local analysis — restricted meetings are never sent to a model' : 'Local analysis — AI model not connected' });
  if (!hasMinutesContent(m)) throw new Conflict('لا يوجد محضر أو قرارات لتلخيصها بعد');
  // Restricted data never goes to a model; the domain AI policy is honoured too.
  if (m.confidential) return local();
  if (!K.aiAllowed(user, 'meetings.general')) return { ...local(), label_ar: 'تحليل محلي — سياسة البيانات لا تسمح بإرسال محاضر الاجتماعات إلى النموذج', label_en: 'Local analysis — data policy keeps meeting minutes away from the model' };
  const { agenda, decisions, actions, name } = minutesText(m);
  const src = [`الاجتماع: ${m.title} (${arWhen(m.starts_at)})`, ...agenda.map((g) => `بند ${g.seq}: ${g.title}\n${g.minutes || '(لا محضر)'}`),
    ...decisions.map((d) => `قرار ${d.number}: ${d.text} — المسؤول ${name(d.owner_id)}`), ...actions.map((a) => `تكليف: ${a.title} — ${name(a.assignee_id)} ${a.due_date || ''}`)].join('\n\n');
  try {
    const out = await complete({ capability: 'summarize', user, maxTokens: 700,
      system: 'أنت أمين سر محترف في جهة حكومية. لخّص محضر الاجتماع بالعربية الرسمية في فقرة قصيرة ثم نقاط للقرارات والتكليفات. لا تضف معلومات غير موجودة في النص.',
      messages: [{ role: 'user', content: src.slice(0, 12000) }] });
    const text = String(out.text || '').trim();
    if (!text) return local();
    return { text, source: 'ai', label_ar: `ملخص بالذكاء الاصطناعي (${out.model || out.provider}) — راجعه قبل الاعتماد`, label_en: `AI summary (${out.model || out.provider}) — review before use` };
  } catch (e) {
    if (e.local) return local();
    return { ...local(), label_ar: 'تحليل محلي — تعذّر الوصول إلى نموذج الذكاء الاصطناعي', label_en: 'Local analysis — the AI model could not be reached' };
  }
}
// Save the minutes as a Documents item (never for restricted meetings — Documents are readable by Ask AI).
export function exportMinutes(user, id) {
  const m = loadVisible(user, id);
  requireManage(user, m);
  if (m.confidential) throw new Conflict('محاضر الاجتماعات السرية تبقى داخل نظام الاجتماعات ولا تُنسخ إلى المستندات');
  if (m.minutes_status === 'none') throw new Conflict('لا يوجد محضر بعد');
  const { agenda, decisions, actions, name } = minutesText(m);
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const present = all("SELECT u.name_ar FROM meetings_attendees a JOIN users u ON u.id=a.user_id WHERE a.meeting_id=? AND a.attendance='present' ORDER BY u.name_ar", m.id).map((r) => r.name_ar);
  const html = [`<h2>محضر اجتماع: ${esc(m.title)}</h2>`, `<p>التاريخ: ${esc(arWhen(m.starts_at))}${m.location ? ` — ${esc(m.location)}` : ''}</p>`,
    `<p>حالة المحضر: ${esc(MINUTES_LABELS[m.minutes_status])}</p>`, present.length ? `<p>الحضور: ${present.map(esc).join('، ')}</p>` : '',
    '<h3>جدول الأعمال والمداولات</h3>', ...agenda.map((g) => `<h3>${g.seq}. ${esc(g.title)}</h3><p>${esc(g.minutes || '—')}</p>`),
    decisions.length ? `<h3>القرارات</h3><ol>${decisions.map((d) => `<li>${esc(d.text)}${d.owner_id ? ` — المسؤول: ${esc(name(d.owner_id))}` : ''}</li>`).join('')}</ol>` : '',
    actions.length ? `<h3>التكليفات</h3><table><tr><th>التكليف</th><th>المكلّف</th><th>الاستحقاق</th></tr>${actions.map((a) => `<tr><td>${esc(a.title)}</td><td>${esc(name(a.assignee_id))}</td><td>${esc(a.due_date || '—')}</td></tr>`).join('')}</table>` : ''].join('');
  const r = D.createDocument(user, { title: `محضر: ${m.title}`, kind: 'minutes', content_html: html });
  history(m, user, 'minutes_exported');
  return { document_id: r.result.id, title: r.result.title };
}

// ---------------------------------------------------------------- overview (landing), tracker, calendar
export function overview(user, { tz } = {}) {
  const z = tzOf(tz);
  const t = now();
  const day = localDay(t, z);
  const dayStart = dayStartUtc(day, z); const dayEnd = dayStartUtc(addDays(day, 1), z);
  const horizon = dayStartUtc(addDays(day, 15), z);
  const rows = listVisible(user, { from: dayStart, to: horizon });
  const decorated = rows.map((m) => listRow(user, m));
  const todayList = decorated.filter((m) => m.starts_at < dayEnd);
  const upcoming = decorated.filter((m) => m.starts_at >= dayEnd);
  const s = scopeSql(user);
  const recent = all(`SELECT m.* FROM meetings_meetings m WHERE ${s.sql} AND m.ends_at < ? AND m.ends_at >= ? ORDER BY m.starts_at DESC LIMIT 6`, ...s.params, dayStart, new Date(Date.now() - 45 * DAY).toISOString()).map((m) => listRow(user, m));
  const rsvp = all(`SELECT m.* FROM meetings_meetings m JOIN meetings_attendees a ON a.meeting_id=m.id AND a.user_id=? WHERE a.rsvp='pending' AND m.organizer_id<>? AND m.status='scheduled' AND m.ends_at > ? ORDER BY m.starts_at LIMIT 10`, user.id, user.id, t).map((m) => listRow(user, m));
  const review = all(`SELECT m.* FROM meetings_meetings m JOIN meetings_attendees a ON a.meeting_id=m.id AND a.user_id=? WHERE a.review IN ('pending','commented') AND m.minutes_status='circulated' ORDER BY m.minutes_circulated_at LIMIT 10`, user.id).map((m) => listRow(user, m));
  const circulate = all(`SELECT m.* FROM meetings_meetings m WHERE (m.organizer_id=? OR m.secretary_id=?) AND m.status='scheduled' AND m.minutes_status IN ('none','draft') AND m.starts_at <= ? AND m.ends_at >= ? ORDER BY m.ends_at LIMIT 10`, user.id, user.id, t, new Date(Date.now() - 30 * DAY).toISOString())
    .map((m) => ({ ...listRow(user, m), due_day: addWorkingDays(localDay(m.ends_at), 2), ended: m.ends_at <= t }));
  const myActions = myActionItems(user);
  return {
    now: t, today: day, tz: z,
    today_meetings: todayList,
    upcoming,
    recent,
    inbox: { rsvp, review, circulate, accept: myActions.filter((a) => a.status === 'pending_acceptance'), actions: myActions.filter((a) => ['open', 'in_progress'].includes(a.status)) },
    committees: all(`SELECT c.id,c.name_ar,c.name_en,c.confidential,cm.role FROM meetings_committees c JOIN meetings_committee_members cm ON cm.committee_id=c.id AND cm.user_id=? WHERE c.active=1 ORDER BY c.name_ar`, user.id),
    governance: governance(user),
  };
}
// Action items assigned to me (masked for restricted meetings — they open in the logged detail view).
export function myActionItems(user, { ai = false } = {}) {
  const s = scopeSql(user);
  return all(`SELECT a.*, m.title m_title, m.confidential m_conf, m.starts_at m_starts, m.committee_id m_committee FROM meetings_actions a JOIN meetings_meetings m ON m.id=a.meeting_id
    WHERE a.assignee_id=? AND ${s.sql} ${ai ? 'AND m.confidential=0' : ''} AND a.status IN ('open','pending_acceptance') ORDER BY a.due_date IS NULL, a.due_date`, user.id, ...s.params)
    .map((a) => ({ ...actionView(a), title: a.m_conf ? null : a.title, masked: !!a.m_conf, meeting: meetingRef(a.meeting_id, a.m_title, a.m_conf, a.m_starts, a.m_committee) }))
    .filter((a) => ['open', 'in_progress', 'pending_acceptance'].includes(a.status));
}
function meetingRef(id, title, conf, starts, committeeId) {
  const cm = committeeBrief(committeeId);
  return { id, title: conf ? null : title, masked: !!conf, starts_at: starts, committee: cm ? { id: cm.id, name_ar: cm.name_ar, name_en: cm.name_en } : null };
}
// Tracker across meetings: decisions + action items the user can see.
export function tracker(user, { mine = false, status, q } = {}) {
  const s = scopeSql(user);
  const like = q ? K.like(q) : null;
  const dec = all(`SELECT d.*, m.title m_title, m.confidential m_conf, m.starts_at m_starts, m.committee_id m_committee FROM meetings_decisions d JOIN meetings_meetings m ON m.id=d.meeting_id
    WHERE ${s.sql} ${mine ? 'AND d.owner_id=?' : ''} ${like ? 'AND m.confidential=0 AND (d.text LIKE ? OR m.title LIKE ?)' : ''} ORDER BY m.starts_at DESC, d.number LIMIT 400`,
  ...s.params, ...(mine ? [user.id] : []), ...(like ? [like, like] : []))
    .map((d) => ({ ...decisionView(d), text: d.m_conf ? null : d.text, masked: !!d.m_conf, meeting: meetingRef(d.meeting_id, d.m_title, d.m_conf, d.m_starts, d.m_committee) }));
  const act = all(`SELECT a.*, m.title m_title, m.confidential m_conf, m.starts_at m_starts, m.committee_id m_committee FROM meetings_actions a JOIN meetings_meetings m ON m.id=a.meeting_id
    WHERE ${s.sql} ${mine ? 'AND a.assignee_id=?' : ''} ${like ? 'AND m.confidential=0 AND (a.title LIKE ? OR m.title LIKE ?)' : ''} ORDER BY a.due_date IS NULL, a.due_date LIMIT 400`,
  ...s.params, ...(mine ? [user.id] : []), ...(like ? [like, like] : []))
    .map((a) => ({ ...actionView(a), title: a.m_conf ? null : a.title, masked: !!a.m_conf, meeting: meetingRef(a.meeting_id, a.m_title, a.m_conf, a.m_starts, a.m_committee) }));
  const OPEN = ['open', 'in_progress', 'pending_acceptance'];
  const filt = (x) => !status || (status === 'open' ? OPEN.includes(x.status) : status === 'overdue' ? x.overdue : status === 'done' ? x.status === 'done' : x.status === status);
  const monthAgo = new Date(Date.now() - 30 * DAY).toISOString();
  return {
    decisions: dec.filter(filt), actions: act.filter(filt),
    stats: {
      decisions_open: dec.filter((d) => ['open', 'in_progress'].includes(d.status)).length,
      actions_open: act.filter((a) => OPEN.includes(a.status)).length,
      overdue: [...dec, ...act].filter((x) => x.overdue).length,
      done_30d: act.filter((a) => a.status === 'done' && a.task?.completed_at >= monthAgo).length + dec.filter((d) => d.status === 'done' && d.updated_at >= monthAgo).length,
      mine_open: act.filter((a) => a.assignee?.id === user.id && OPEN.includes(a.status)).length,
    },
  };
}
export function calendar(user, { month, tz } = {}) {
  const z = tzOf(tz);
  const mth = /^\d{4}-\d{2}$/.test(month || '') ? month : localDay(now(), z).slice(0, 7);
  const first = `${mth}-01`;
  const next = new Date(Date.UTC(+mth.slice(0, 4), +mth.slice(5, 7), 1)).toISOString().slice(0, 10);
  const rows = listVisible(user, { from: dayStartUtc(first, z), to: dayStartUtc(next, z), includeCancelled: false });
  const days = {};
  for (const m of rows) { const d = localDay(m.starts_at, z); days[d] = (days[d] || 0) + 1; }
  return { month: mth, days };
}
export function meetingsForRange(user, { from, to, tz } = {}) {
  const z = tzOf(tz);
  if (!isDate(from)) throw new BadRequest('تاريخ غير صالح');
  const end = isDate(to) ? to : addDays(from, 1);
  if (Date.parse(end) - Date.parse(from) > 62 * DAY) throw new BadRequest('المدة طويلة جداً');
  return listVisible(user, { from: dayStartUtc(from, z), to: dayStartUtc(end, z) }).map((m) => listRow(user, m));
}

// ---------------------------------------------------------------- governance aggregates (managers / president)
// No names, no titles, no restricted meetings; groups smaller than the minimum are suppressed.
export const MIN_GROUP = { meetings: 3, organizers: 2 };
export function governance(user) {
  if (!K.isStaff(user) || !['manager', 'president'].includes(user.role)) return null;
  const depts = K.managedDepartments(user);
  if (!depts.length) return null;
  const since = new Date(Date.now() - 90 * DAY).toISOString();
  const rows = all(`SELECT m.id, m.department_id, m.organizer_id, m.ends_at, m.minutes_status, m.minutes_circulated_at FROM meetings_meetings m
    WHERE m.confidential=0 AND m.status='scheduled' AND m.ends_at < ? AND m.ends_at >= ? AND m.department_id IN (${K.inList(depts)})`, now(), since, ...depts);
  const summarise = (list) => {
    const organizers = new Set(list.map((r) => r.organizer_id)).size;
    if (list.length < MIN_GROUP.meetings || organizers < MIN_GROUP.organizers) return { suppressed: true, meetings: null };
    const withMin = list.filter((r) => r.minutes_circulated_at);
    const ids = list.map((r) => r.id);
    const acts = all(`SELECT * FROM meetings_actions WHERE meeting_id IN (${K.inList(ids)}) AND status IN ('open','pending_acceptance')`, ...ids).map(actionView);
    return {
      suppressed: false, meetings: list.length,
      minutes_on_time_pct: Math.round((list.filter((r) => circulatedOnTime(r.ends_at, r.minutes_circulated_at)).length / list.length) * 100),
      minutes_approved_pct: Math.round((list.filter((r) => r.minutes_status === 'approved').length / list.length) * 100),
      minutes_missing: list.length - withMin.length,
      actions_open: acts.filter((a) => ['open', 'in_progress', 'pending_acceptance'].includes(a.status)).length,
      actions_overdue: acts.filter((a) => a.overdue).length,
    };
  };
  const byDept = depts.length > 1 ? depts.map((d) => ({ department: K.deptBrief(d), ...summarise(rows.filter((r) => r.department_id === d)) })).filter((d) => d.department) : null;
  return { scope: user.role === 'president' ? 'organisation' : 'department', window_days: 90, min_group: MIN_GROUP, total: summarise(rows), by_department: byDept };
}

// ---------------------------------------------------------------- committees
function committeeVisibleSql(user, alias = 'c') {
  return { sql: `(${alias}.active=1 AND (${alias}.confidential=0 OR EXISTS (SELECT 1 FROM meetings_committee_members vm WHERE vm.committee_id=${alias}.id AND vm.user_id=?)))`, params: [user.id] };
}
function committeeMembers(id) {
  return all(`SELECT cm.user_id id, cm.role, u.name_ar, u.name_en, u.title_ar, u.title_en, d.name_ar dept_ar, d.name_en dept_en FROM meetings_committee_members cm
    JOIN users u ON u.id=cm.user_id JOIN departments d ON d.id=u.department_id WHERE cm.committee_id=? ORDER BY CASE cm.role WHEN 'chair' THEN 0 WHEN 'secretary' THEN 1 ELSE 2 END, u.name_ar`, id);
}
function committeeRow(user, c) {
  const members = committeeMembers(c.id);
  const my = members.find((x) => x.id === user.id)?.role || null;
  const s = scopeSql(user);
  const next = one(`SELECT m.* FROM meetings_meetings m WHERE m.committee_id=? AND ${s.sql} AND m.status='scheduled' AND m.ends_at > ? ORDER BY m.starts_at LIMIT 1`, c.id, ...s.params, now());
  const count = one(`SELECT COUNT(*) n FROM meetings_meetings m WHERE m.committee_id=? AND ${s.sql} AND m.status='scheduled' AND m.ends_at <= ?`, c.id, ...s.params, now()).n;
  return { id: c.id, name_ar: c.name_ar, name_en: c.name_en, description: c.description, confidential: !!c.confidential, quorum: c.quorum, chair: brief(c.chair_id), secretary: brief(c.secretary_id), members, my_role: my, next_meeting: next ? listRow(user, next) : null, held_visible: count, is_demo: !!c.is_demo };
}
export function listCommittees(user) {
  if (!K.isStaff(user)) return [];
  const v = committeeVisibleSql(user);
  return all(`SELECT c.* FROM meetings_committees c WHERE ${v.sql} ORDER BY c.confidential, c.name_ar`, ...v.params).map((c) => committeeRow(user, c))
    .sort((a, b) => Number(!!b.my_role) - Number(!!a.my_role));
}
function loadCommittee(user, id) {
  if (!K.isStaff(user)) throw new NotFound('اللجنة غير موجودة أو غير متاحة لك');
  const v = committeeVisibleSql(user);
  const c = one(`SELECT c.* FROM meetings_committees c WHERE c.id=? AND ${v.sql}`, id, ...v.params);
  if (!c) throw new NotFound('اللجنة غير موجودة أو غير متاحة لك');
  return c;
}
export function getCommittee(user, id) {
  const c = loadCommittee(user, id);
  if (c.confidential) K.logAccess(user, SYS, 'committee', c.id, 'view');
  const s = scopeSql(user);
  const meetings = all(`SELECT m.* FROM meetings_meetings m WHERE m.committee_id=? AND ${s.sql} ORDER BY m.starts_at DESC LIMIT 60`, c.id, ...s.params).map((m) => listRow(user, m));
  const ids = meetings.map((m) => m.id);
  const decisions = ids.length ? all(`SELECT status FROM meetings_decisions WHERE meeting_id IN (${K.inList(ids)})`, ...ids) : [];
  const actions = ids.length ? all(`SELECT * FROM meetings_actions WHERE meeting_id IN (${K.inList(ids)}) AND status<>'cancelled'`, ...ids).map(actionView) : [];
  const row = committeeRow(user, c);
  const held = meetings.filter((m) => m.phase === 'ended');
  return {
    ...row, meetings,
    stats: {
      held: held.length,
      decisions: decisions.length, decisions_done: decisions.filter((d) => d.status === 'done').length,
      actions_open: actions.filter((a) => ['open', 'in_progress', 'pending_acceptance'].includes(a.status)).length,
      actions_overdue: actions.filter((a) => a.overdue).length,
      minutes_approved: held.filter((m) => m.minutes_status === 'approved').length,
    },
    can: { manage: row.my_role === 'chair', schedule: ['chair', 'secretary'].includes(row.my_role) },
    access_log: c.confidential && row.my_role === 'chair' ? K.accessLog(SYS, 'committee', c.id, 20) : null,
  };
}
export function createCommittee(user, input) {
  K.requireStaff(user);
  if (!['manager', 'president'].includes(user.role)) throw new Forbidden('يشكّل اللجان المديرون والقيادة فقط');
  const name = clean(input.name_ar, 120);
  if (name.length < 3) throw new BadRequest('اسم اللجنة مطلوب');
  const members = [...new Set((input.member_ids || []).map(staffId))].filter((u) => u !== user.id);
  const secretary = input.secretary_id ? staffId(input.secretary_id) : null;
  const size = 1 + new Set([...members, ...(secretary ? [secretary] : [])]).size;
  const quorum = input.quorum ?? Math.floor(size / 2) + 1;
  if (quorum < 1 || quorum > size) throw new BadRequest('النصاب يجب أن يكون بين 1 وعدد الأعضاء');
  const id = uid('cm_');
  tx(() => {
    run('INSERT INTO meetings_committees (id,name_ar,name_en,description,confidential,quorum,chair_id,secretary_id,department_id,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
      id, name, clean(input.name_en, 120) || name, clean(input.description, 1000), input.confidential ? 1 : 0, quorum, user.id, secretary, user.department_id, user.id, now());
    run("INSERT INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,'chair')", id, user.id);
    if (secretary && secretary !== user.id) run("INSERT OR IGNORE INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,'secretary')", id, secretary);
    for (const u of members) run("INSERT OR IGNORE INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,'member')", id, u);
  });
  K.audit(user, 'meetings.committee.create', id, { confidential: !!input.confidential, members: size });
  const ids = [user.id, ...members, ...(secretary ? [secretary] : [])];
  for (const u of ids) if (u !== user.id) K.alert(u, { level: 'info', title: `أُضفت إلى ${input.confidential ? 'لجنة سرية' : `«${name}»`}`, body: `بقرار من ${user.name_ar}`, system: SYS, id });
  K.changed(SYS, ids, id);
  return getCommittee(user, id);
}
export function setCommitteeMember(user, id, input) {
  const c = loadCommittee(user, id);
  if (c.chair_id !== user.id) throw new Forbidden('يدير عضوية اللجنة رئيسها فقط');
  // Membership reveals the committee (and its roster) — a permission change.
  K.requireConfirm(input, 'تغيير عضوية اللجنة يتطلب تأكيداً صريحاً');
  const target = staffId(input.user_id);
  if (target === c.chair_id) throw new Conflict('لا يمكن تغيير عضوية رئيس اللجنة');
  const members = committeeMembers(c.id);
  if (input.remove) {
    if (!members.some((mm) => mm.id === target)) throw new NotFound('العضو غير موجود في اللجنة');
    if (members.length - 1 < c.quorum) throw new Conflict('عدد الأعضاء بعد الإزالة أقل من النصاب؛ عدّل النصاب أولاً');
    run('DELETE FROM meetings_committee_members WHERE committee_id=? AND user_id=?', c.id, target);
    if (c.secretary_id === target) run('UPDATE meetings_committees SET secretary_id=NULL WHERE id=?', c.id);
  } else {
    const role = input.role === 'secretary' ? 'secretary' : 'member';
    run('INSERT INTO meetings_committee_members (committee_id,user_id,role) VALUES (?,?,?) ON CONFLICT(committee_id,user_id) DO UPDATE SET role=excluded.role', c.id, target, role);
    if (role === 'secretary') {
      if (c.secretary_id && c.secretary_id !== target) run("UPDATE meetings_committee_members SET role='member' WHERE committee_id=? AND user_id=?", c.id, c.secretary_id);
      run('UPDATE meetings_committees SET secretary_id=? WHERE id=?', target, c.id);
    }
    K.alert(target, { level: 'info', title: `أُضفت إلى ${c.confidential ? 'لجنة سرية' : `«${c.name_ar}»`}`, body: `بقرار من ${user.name_ar}`, system: SYS, id: c.id });
  }
  K.audit(user, input.remove ? 'meetings.committee.remove_member' : 'meetings.committee.add_member', c.id, { user_id: target, role: input.role || 'member' });
  K.changed(SYS, [...members.map((mm) => mm.id), target], c.id);
  return getCommittee(user, c.id);
}
export function updateCommittee(user, id, input) {
  const c = loadCommittee(user, id);
  if (c.chair_id !== user.id) throw new Forbidden('يعدّل بيانات اللجنة رئيسها فقط');
  const f = {};
  if (input.quorum !== undefined) {
    const n = committeeMembers(c.id).length;
    if (input.quorum < 1 || input.quorum > n) throw new BadRequest(`النصاب يجب أن يكون بين 1 و${n}`);
    f.quorum = input.quorum;
  }
  if (input.description !== undefined) f.description = clean(input.description, 1000);
  if (!Object.keys(f).length) throw new BadRequest('لا توجد حقول للتحديث');
  const keys = Object.keys(f);
  run(`UPDATE meetings_committees SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => f[k]), c.id);
  K.audit(user, 'meetings.committee.update', c.id, f);
  K.changed(SYS, committeeMembers(c.id).map((mm) => mm.id), c.id);
  return getCommittee(user, c.id);
}

// Organizer's own documents (for linking to agenda items).
export function myDocuments(user) {
  return D.listDocuments(user).filter((d) => d.owner_id === user.id).map((d) => ({ id: d.id, title: d.title, kind: d.kind, updated_at: d.updated_at }));
}

// ---------------------------------------------------------------- Integration center calendar feed
// Meetings the user organizes or is invited to (not declined, not cancelled).
// Restricted meetings are included but flagged so the feed can mask them.
export function upcomingForUser(userId, days = 60) {
  const u = one("SELECT id FROM users WHERE id=? AND active=1 AND user_type='staff'", userId);
  if (!u) return [];
  const n = Math.max(1, Math.min(366, Number(days) || 60));
  const from = new Date(Date.now() - DAY).toISOString();
  const to = new Date(Date.now() + n * DAY).toISOString();
  return all(`SELECT m.id, m.title, m.starts_at, m.ends_at, m.location, m.confidential FROM meetings_meetings m
    WHERE m.status='scheduled' AND m.ends_at >= ? AND m.starts_at < ?
      AND (m.organizer_id=? OR EXISTS (SELECT 1 FROM meetings_attendees a WHERE a.meeting_id=m.id AND a.user_id=? AND a.rsvp<>'declined'))
    ORDER BY m.starts_at`, from, to, userId, userId)
    .map((m) => ({ id: m.id, title: m.title, starts_at: m.starts_at, ends_at: m.ends_at, location: m.location || null, confidential: !!m.confidential }));
}
