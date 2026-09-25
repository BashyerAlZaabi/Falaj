// Work domain: projects, tasks, events, alerts, search, daily summary, KPIs.
// All functions take the authenticated user and enforce policy themselves.
import { one, all, run, uid, now, today, tx, audit } from '../db.js';
import * as P from '../policy.js';
import { notify } from '../bus.js';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const PROJECT_STATUSES = ['active', 'on_hold', 'done', 'cancelled'];

export class BadInput extends Error {
  constructor(message, field) { super(message); this.status = 400; this.code = 'bad_input'; this.field = field; }
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));

// ---------------- projects ----------------
function decorateProject(p) {
  if (!p) return p;
  const t = today();
  const counts = one(`SELECT COUNT(*) total, SUM(status='done') done, SUM(status!='done' AND due_date < ?) overdue
                      FROM tasks WHERE project_id=? AND deleted_at IS NULL`, t, p.id);
  const delayed = ['active', 'on_hold'].includes(p.status) && p.due_date && p.due_date < t;
  let expected = null;
  if (p.start_date && p.due_date && p.due_date > p.start_date) {
    const span = Date.parse(p.due_date) - Date.parse(p.start_date);
    expected = Math.max(0, Math.min(100, Math.round(((Date.now() - Date.parse(p.start_date)) / span) * 100)));
  }
  const atRisk = !delayed && p.status === 'active' && p.progress != null && expected != null && p.progress < expected - 15;
  const owner = one('SELECT name_ar,name_en FROM users WHERE id=?', p.owner_id);
  const dept = one('SELECT name_ar,name_en FROM departments WHERE id=?', p.department_id);
  return {
    ...p, is_demo: !!p.is_demo,
    owner_name_ar: owner?.name_ar, owner_name_en: owner?.name_en,
    dept_ar: dept?.name_ar, dept_en: dept?.name_en,
    tasks_total: counts.total || 0, tasks_done: counts.done || 0, tasks_overdue: counts.overdue || 0,
    delayed: !!delayed, at_risk: !!atRisk, expected_progress: expected,
    days_overdue: delayed ? Math.round((Date.parse(t) - Date.parse(p.due_date)) / 864e5) : 0,
  };
}

export function listProjects(user, { status, delayed, q, limit = 200 } = {}) {
  const s = P.projectScopeSql(user);
  let sql = `SELECT p.* FROM projects p WHERE ${s.sql}`;
  const params = [...s.params];
  if (status) { sql += ' AND p.status=?'; params.push(status); }
  if (q) { sql += ' AND (p.name LIKE ? OR p.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += ' ORDER BY p.due_date IS NULL, p.due_date LIMIT ?';
  params.push(limit);
  let rows = all(sql, ...params).map(decorateProject);
  if (delayed) rows = rows.filter((p) => p.delayed);
  return rows;
}

export function getProject(user, id) {
  if (!P.canViewProject(user, id)) throw new P.NotFound();
  const p = decorateProject(one('SELECT * FROM projects WHERE id=?', id));
  p.members = all('SELECT u.id,u.name_ar,u.name_en FROM project_members pm JOIN users u ON u.id=pm.user_id WHERE pm.project_id=?', id);
  p.can_edit = P.canEditProject(user, p);
  const ts = P.taskScopeSql(user);
  p.tasks = all(`SELECT t.* FROM tasks t WHERE t.project_id=? AND ${ts.sql} ORDER BY t.due_date`, id, ...ts.params).map(decorateTask);
  return p;
}

export function findProjects(user, text) {
  const q = String(text || '').trim();
  if (!q) return [];
  const rows = listProjects(user);
  const norm = (s) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي').replace(/^ال/, '');
  const nq = norm(q);
  const exact = rows.filter((p) => norm(p.name) === nq);
  if (exact.length) return exact;
  return rows.filter((p) => norm(p.name).includes(nq) || nq.includes(norm(p.name)));
}

export function createProject(user, input) {
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new BadInput('اسم المشروع مطلوب', 'name');
  const deptId = input.department_id || user.department_id;
  if (deptId !== user.department_id && !P.managedDepartments(user).includes(deptId)) throw new P.Forbidden('لا يمكنك إنشاء مشروع في إدارة خارج نطاقك');
  for (const f of ['start_date', 'due_date']) if (input[f] && !isDate(input[f])) throw new BadInput(`تاريخ غير صالح: ${f}`, f);
  if (input.progress != null && !(Number.isInteger(input.progress) && input.progress >= 0 && input.progress <= 100)) throw new BadInput('نسبة الإنجاز يجب أن تكون بين 0 و100', 'progress');
  const id = uid('pr_');
  tx(() => {
    run(`INSERT INTO projects (id,name,description,department_id,owner_id,status,progress,progress_updated_at,progress_updated_by,start_date,due_date,created_by)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, name, input.description || '', deptId, user.id, 'active', input.progress ?? null,
      input.progress != null ? now() : null, input.progress != null ? user.id : null,
      input.start_date || today(), input.due_date || null, user.id);
    run('INSERT INTO project_members (project_id,user_id) VALUES (?,?)', id, user.id);
    for (const m of input.member_ids || []) {
      if (!P.canAssignTo(user, m)) throw new P.Forbidden('لا يمكنك إضافة عضو من خارج نطاقك');
      run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', id, m);
    }
  });
  audit(user.id, 'project.create', id, { name });
  const p = getProject(user, id);
  notify(P.recipientsForProject(p), { type: 'changed', entity: 'project', id });
  return { result: p, undo: { tool: '_undo_create_project', input: { id } } };
}

export function updateProject(user, input) {
  const p = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', input.id);
  if (!p || !P.canViewProject(user, input.id)) throw new P.NotFound();
  if (!P.canEditProject(user, p)) throw new P.Forbidden('لا تملك صلاحية تعديل هذا المشروع');
  const fields = {};
  if (input.progress !== undefined) {
    const v = Number(input.progress);
    if (!Number.isInteger(v) || v < 0 || v > 100) throw new BadInput('نسبة الإنجاز يجب أن تكون عدداً صحيحاً بين 0 و100', 'progress');
    fields.progress = v; fields.progress_updated_at = now(); fields.progress_updated_by = user.id;
  }
  if (input.status !== undefined) {
    if (!PROJECT_STATUSES.includes(input.status)) throw new BadInput('حالة غير صالحة', 'status');
    fields.status = input.status;
  }
  for (const f of ['name', 'description']) if (input[f] !== undefined) fields[f] = String(input[f]);
  for (const f of ['due_date', 'start_date']) if (input[f] !== undefined) {
    if (input[f] !== null && !isDate(input[f])) throw new BadInput('تاريخ غير صالح', f);
    fields[f] = input[f];
  }
  if (!Object.keys(fields).length) throw new BadInput('لا توجد حقول للتحديث');
  const before = Object.fromEntries(Object.keys(fields).map((k) => [k, p[k]]));
  fields.updated_at = now();
  const keys = Object.keys(fields);
  run(`UPDATE projects SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), p.id);
  audit(user.id, 'project.update', p.id, { before, after: fields });
  const after = getProject(user, p.id);
  // verify persisted
  for (const k of Object.keys(before)) if (String(after[k]) !== String(fields[k])) throw new Error('فشل التحقق من حفظ التحديث');
  notify(P.recipientsForProject(after), { type: 'changed', entity: 'project', id: p.id });
  return { result: after, before, undo: { tool: 'update_project', input: { id: p.id, ...before } } };
}

export function deleteProject(user, { id }) {
  const p = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', id);
  if (!p || !P.canViewProject(user, id)) throw new P.NotFound();
  if (!P.canDeleteProject(user, p)) throw new P.Forbidden('لا تملك صلاحية حذف هذا المشروع');
  const rec = P.recipientsForProject(p);
  tx(() => {
    run('UPDATE tasks SET deleted_at=? WHERE project_id=? AND deleted_at IS NULL', now(), id);
    run('UPDATE projects SET deleted_at=? WHERE id=?', now(), id);
  });
  audit(user.id, 'project.delete', id, { name: p.name });
  notify(rec, { type: 'changed', entity: 'project', id });
  return { result: { id, name: p.name, deleted: true } };
}

// ---------------- tasks ----------------
function decorateTask(t) {
  if (!t) return t;
  const a = one('SELECT name_ar,name_en FROM users WHERE id=?', t.assignee_id);
  const p = t.project_id ? one('SELECT name FROM projects WHERE id=?', t.project_id) : null;
  return { ...t, is_demo: !!t.is_demo, assignee_ar: a?.name_ar, assignee_en: a?.name_en, project_name: p?.name || null,
    overdue: t.status !== 'done' && !!t.due_date && t.due_date < today() };
}

export function listTasks(user, { status, project_id, mine, overdue, week_done, q, limit = 300 } = {}) {
  const s = P.taskScopeSql(user);
  let sql = `SELECT t.* FROM tasks t WHERE ${s.sql}`;
  const params = [...s.params];
  if (status) { sql += ' AND t.status=?'; params.push(status); }
  if (project_id) { sql += ' AND t.project_id=?'; params.push(project_id); }
  if (mine) { sql += ' AND t.assignee_id=?'; params.push(user.id); }
  if (overdue) { sql += " AND t.status!='done' AND t.due_date < ?"; params.push(today()); }
  if (week_done) { sql += " AND t.status='done' AND t.completed_at >= ?"; params.push(weekStart()); }
  if (q) { sql += ' AND (t.title LIKE ? OR t.description LIKE ?)'; params.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY t.status='done', CASE t.priority WHEN 'urgent' THEN 0 WHEN 'high' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END, t.due_date IS NULL, t.due_date LIMIT ?";
  params.push(limit);
  return all(sql, ...params).map(decorateTask);
}

export function weekStart() {
  // Week starts Sunday (regional convention)
  const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString();
}

export function getTask(user, id) {
  if (!P.canViewTask(user, id)) throw new P.NotFound();
  return decorateTask(one('SELECT * FROM tasks WHERE id=?', id));
}

export function createTask(user, input) {
  const title = String(input.title || '').trim();
  if (title.length < 2) throw new BadInput('عنوان المهمة مطلوب', 'title');
  const assignee = input.assignee_id || user.id;
  if (!P.canAssignTo(user, assignee)) throw new P.Forbidden('لا يمكنك إسناد مهمة لهذا المستخدم');
  let deptId = one('SELECT department_id FROM users WHERE id=?', assignee).department_id;
  if (input.project_id) {
    const p = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', input.project_id);
    if (!p || !P.canViewProject(user, p.id)) throw new P.NotFound('المشروع غير موجود أو غير متاح لك');
    if (!P.canEditProject(user, p)) throw new P.Forbidden('لا تملك صلاحية إضافة مهام لهذا المشروع');
    deptId = p.department_id;
  }
  if (input.priority && !PRIORITIES.includes(input.priority)) throw new BadInput('أولوية غير صالحة', 'priority');
  if (input.due_date && !isDate(input.due_date)) throw new BadInput('تاريخ الاستحقاق غير صالح', 'due_date');
  const id = uid('tk_');
  run(`INSERT INTO tasks (id,title,description,project_id,assignee_id,department_id,status,priority,due_date,created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?)`, id, title, input.description || '', input.project_id || null, assignee, deptId,
    'todo', input.priority || 'medium', input.due_date || null, user.id);
  if (input.project_id) run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', input.project_id, assignee);
  if (assignee !== user.id) {
    run('INSERT INTO alerts (id,user_id,level,title,body,entity,entity_id) VALUES (?,?,?,?,?,?,?)',
      uid('al_'), assignee, 'info', `مهمة جديدة: ${title}`, `أسندها ${user.name_ar}`, 'task', id);
  }
  audit(user.id, 'task.create', id, { title });
  const t = getTask(user, id);
  notify(P.recipientsForTask(t), { type: 'changed', entity: 'task', id });
  return { result: t, undo: { tool: '_undo_create_task', input: { id } } };
}

export function updateTask(user, input) {
  const t = one('SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL', input.id);
  if (!t || !P.canViewTask(user, input.id)) throw new P.NotFound();
  if (!P.canEditTask(user, t)) throw new P.Forbidden('لا تملك صلاحية تعديل هذه المهمة');
  const fields = {};
  if (input.status !== undefined) {
    if (!TASK_STATUSES.includes(input.status)) throw new BadInput('حالة غير صالحة', 'status');
    fields.status = input.status;
    fields.completed_at = input.status === 'done' ? (t.completed_at || now()) : null;
  }
  if (input.priority !== undefined) {
    if (!PRIORITIES.includes(input.priority)) throw new BadInput('أولوية غير صالحة', 'priority');
    fields.priority = input.priority;
  }
  if (input.due_date !== undefined) {
    if (input.due_date !== null && !isDate(input.due_date)) throw new BadInput('تاريخ غير صالح', 'due_date');
    fields.due_date = input.due_date;
  }
  if (input.assignee_id !== undefined) {
    if (!P.canAssignTo(user, input.assignee_id)) throw new P.Forbidden('لا يمكنك إسناد المهمة لهذا المستخدم');
    fields.assignee_id = input.assignee_id;
  }
  for (const f of ['title', 'description']) if (input[f] !== undefined) fields[f] = String(input[f]);
  if (!Object.keys(fields).length) throw new BadInput('لا توجد حقول للتحديث');
  const before = Object.fromEntries(Object.keys(fields).map((k) => [k, t[k]]));
  fields.updated_at = now();
  const keys = Object.keys(fields);
  run(`UPDATE tasks SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), t.id);
  audit(user.id, 'task.update', t.id, { before, after: fields });
  const after = getTask(user, t.id);
  notify(P.recipientsForTask(after), { type: 'changed', entity: 'task', id: t.id });
  const undoInput = { id: t.id, ...before }; delete undoInput.completed_at;
  return { result: after, before, undo: { tool: 'update_task', input: undoInput } };
}

export function deleteTask(user, { id }) {
  const t = one('SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL', id);
  if (!t || !P.canViewTask(user, id)) throw new P.NotFound();
  if (!P.canEditTask(user, t)) throw new P.Forbidden('لا تملك صلاحية حذف هذه المهمة');
  run('UPDATE tasks SET deleted_at=? WHERE id=?', now(), id);
  audit(user.id, 'task.delete', id, { title: t.title });
  notify(P.recipientsForTask(t), { type: 'changed', entity: 'task', id });
  return { result: { id, title: t.title, deleted: true } };
}

// Internal (undo of creation): soft delete without confirmation — only the creator, immediately.
export function undoCreate(user, table, id) {
  const r = one(`SELECT * FROM ${table} WHERE id=? AND created_by=? AND deleted_at IS NULL`, id, user.id);
  if (!r) throw new P.NotFound();
  run(`UPDATE ${table} SET deleted_at=? WHERE id=?`, now(), id);
  if (table === 'projects') run('UPDATE tasks SET deleted_at=? WHERE project_id=? AND deleted_at IS NULL', now(), id);
  notify(table === 'projects' ? P.recipientsForProject(r) : P.recipientsForTask(r), { type: 'changed', entity: table.slice(0, -1), id });
  return { result: { id, undone: true } };
}

// ---------------- events & alerts ----------------
export function listEvents(user, { from, to } = {}) {
  const s = P.eventScopeSql(user);
  const f = from || today();
  const tt = to || new Date(Date.now() + 14 * 864e5).toISOString();
  return all(`SELECT e.* FROM events e WHERE ${s.sql} AND e.starts_at >= ? AND e.starts_at <= ? ORDER BY e.starts_at`, ...s.params, f, tt)
    .map((e) => ({ ...e, is_demo: !!e.is_demo }));
}
export function createEvent(user, input) {
  const title = String(input.title || '').trim();
  if (!title) throw new BadInput('عنوان الموعد مطلوب', 'title');
  if (!input.starts_at || Number.isNaN(Date.parse(input.starts_at))) throw new BadInput('وقت الموعد غير صالح', 'starts_at');
  const id = uid('ev_');
  run('INSERT INTO events (id,title,starts_at,ends_at,location,owner_id) VALUES (?,?,?,?,?,?)', id, title,
    new Date(input.starts_at).toISOString(), input.ends_at ? new Date(input.ends_at).toISOString() : null, input.location || null, user.id);
  notify([user.id], { type: 'changed', entity: 'event', id });
  return { result: one('SELECT * FROM events WHERE id=?', id), undo: { tool: '_undo_create_event', input: { id } } };
}
export function deleteOwnEvent(user, id) {
  const e = one('SELECT * FROM events WHERE id=? AND owner_id=?', id, user.id);
  if (!e) throw new P.NotFound();
  run('DELETE FROM events WHERE id=?', id);
  notify([user.id], { type: 'changed', entity: 'event', id });
  return { result: { id, undone: true } };
}

export function listAlerts(user, { unread } = {}) {
  const rows = all(`SELECT * FROM alerts WHERE user_id=? ${unread ? 'AND read_at IS NULL' : ''} ORDER BY created_at DESC LIMIT 50`, user.id);
  // Derived alerts computed live from source data (never stored duplicates)
  const derived = [];
  const overdue = listTasks(user, { mine: true, overdue: true });
  if (overdue.length) derived.push({ id: 'derived-overdue', level: 'warning', title: `لديك ${overdue.length} مهمة متأخرة`, body: overdue.slice(0, 3).map((t) => t.title).join('، '), entity: 'tasks', derived: true, created_at: now() });
  const delayed = listProjects(user, { delayed: true });
  if (delayed.length && user.role !== 'employee') derived.push({ id: 'derived-delayed', level: 'critical', title: `${delayed.length} مشروع متأخر ضمن نطاقك`, body: delayed.slice(0, 3).map((p) => p.name).join('، '), entity: 'projects', derived: true, created_at: now() });
  return [...derived, ...rows.map((r) => ({ ...r, is_demo: !!r.is_demo }))];
}
export function markAlertRead(user, id) {
  run('UPDATE alerts SET read_at=? WHERE id=? AND user_id=?', now(), id, user.id);
}

// ---------------- search ----------------
export function search(user, q) {
  const text = String(q || '').trim();
  if (!text) return [];
  const out = [];
  for (const p of listProjects(user, { q: text, limit: 10 })) out.push({ type: 'project', id: p.id, title: p.name, subtitle: p.dept_ar });
  for (const t of listTasks(user, { q: text, limit: 10 })) out.push({ type: 'task', id: t.id, title: t.title, subtitle: t.project_name || '' });
  const ds = P.documentScopeSql(user);
  for (const d of all(`SELECT id,title,kind FROM documents d WHERE ${ds.sql} AND (d.title LIKE ? OR d.content_html LIKE ?) LIMIT 10`, ...ds.params, `%${text}%`, `%${text}%`))
    out.push({ type: 'document', id: d.id, title: d.title, subtitle: d.kind });
  const es = P.eventScopeSql(user);
  for (const e of all(`SELECT id,title,starts_at FROM events e WHERE ${es.sql} AND e.title LIKE ? LIMIT 10`, ...es.params, `%${text}%`))
    out.push({ type: 'event', id: e.id, title: e.title, subtitle: e.starts_at });
  return out;
}

// ---------------- daily summary ----------------
export function dailySummary(user) {
  const t = today();
  const myTasks = listTasks(user, { mine: true }).filter((x) => x.status !== 'done');
  const dueToday = myTasks.filter((x) => x.due_date === t);
  const overdue = myTasks.filter((x) => x.overdue);
  const priorities = myTasks.filter((x) => ['urgent', 'high'].includes(x.priority)).slice(0, 5);
  const eventsToday = listEvents(user, { from: `${t}T00:00:00.000Z`, to: `${t}T23:59:59.999Z` });
  const projects = listProjects(user);
  const delayed = projects.filter((p) => p.delayed);
  const noProgress = projects.filter((p) => p.status === 'active' && p.progress == null);
  const alerts = listAlerts(user, { unread: true });
  const pendingReviews = all("SELECT r.id, a.name FROM office_runs r JOIN office_agents a ON a.id=r.agent_id WHERE r.owner_id=? AND r.status='awaiting_review' ORDER BY r.created_at DESC", user.id);
  return {
    date: t, generated_at: now(),
    counts: { open_tasks: myTasks.length, due_today: dueToday.length, overdue: overdue.length, events_today: eventsToday.length, projects: projects.length, delayed_projects: delayed.length, alerts: alerts.length, pending_reviews: pendingReviews.length },
    due_today: dueToday, overdue, priorities, events_today: eventsToday,
    delayed_projects: delayed, projects_missing_progress: noProgress, alerts,
    needs_action: [
      ...pendingReviews.map((r) => ({ type: 'office_run', id: r.id, title: `مراجعة عمل الوكيل «${r.name}»`, reason: 'review' })),
      ...overdue.map((x) => ({ type: 'task', id: x.id, title: x.title, reason: 'overdue' })),
      ...delayed.map((p) => ({ type: 'project', id: p.id, title: p.name, reason: 'delayed' })),
      ...noProgress.map((p) => ({ type: 'project', id: p.id, title: p.name, reason: 'missing_progress' })),
    ],
    source: 'portal.db (projects, tasks, events, alerts)',
  };
}

// ---------------- ADAA I KPIs (outside-Vault sources only) ----------------
export function kpis(user) {
  const at = now();
  const projects = listProjects(user);
  const tasks = listTasks(user, { limit: 5000 });
  const active = projects.filter((p) => p.status === 'active');
  const withProgress = active.filter((p) => p.progress != null);
  const done = tasks.filter((x) => x.status === 'done').length;
  const src = (s) => ({ source: s, updated_at: at });
  const byDept = {};
  for (const p of projects) {
    const k = p.department_id;
    byDept[k] ??= { department_id: k, name_ar: p.dept_ar, name_en: p.dept_en, projects: 0, delayed: 0, progress_sum: 0, progress_n: 0 };
    byDept[k].projects++; if (p.delayed) byDept[k].delayed++;
    if (p.progress != null) { byDept[k].progress_sum += p.progress; byDept[k].progress_n++; }
  }
  const weekDone = tasks.filter((x) => x.status === 'done' && x.completed_at && x.completed_at >= weekStart());
  return {
    scope: user.role === 'president' ? 'organisation' : user.role === 'manager' ? 'department' : 'personal',
    generated_at: at,
    items: [
      { key: 'active_projects', label_ar: 'المشاريع النشطة', label_en: 'Active projects', value: active.length, ...src('projects') },
      { key: 'delayed_projects', label_ar: 'المشاريع المتأخرة', label_en: 'Delayed projects', value: projects.filter((p) => p.delayed).length, status: projects.some((p) => p.delayed) ? 'critical' : 'good', ...src('projects.due_date, projects.status') },
      { key: 'avg_progress', label_ar: 'متوسط الإنجاز (المحدَّد فقط)', label_en: 'Avg progress (reported only)', value: withProgress.length ? Math.round(withProgress.reduce((a, p) => a + p.progress, 0) / withProgress.length) : null, unit: '%', note_ar: `${withProgress.length} من ${active.length} مشروع لديها نسبة مسجلة`, note_en: `${withProgress.length} of ${active.length} projects report progress`, ...src('projects.progress') },
      { key: 'task_completion', label_ar: 'نسبة إنجاز المهام', label_en: 'Task completion', value: tasks.length ? Math.round((done / tasks.length) * 100) : null, unit: '%', note_ar: `${done} من ${tasks.length}`, note_en: `${done} of ${tasks.length}`, ...src('tasks.status') },
      { key: 'overdue_tasks', label_ar: 'المهام المتأخرة', label_en: 'Overdue tasks', value: tasks.filter((x) => x.overdue).length, status: tasks.some((x) => x.overdue) ? 'warning' : 'good', ...src('tasks.due_date, tasks.status') },
      { key: 'week_done', label_ar: 'مهام أُنجزت هذا الأسبوع', label_en: 'Done this week', value: weekDone.length, ...src('tasks.completed_at') },
    ],
    by_department: Object.values(byDept).map((d) => ({ ...d, avg_progress: d.progress_n ? Math.round(d.progress_sum / d.progress_n) : null })),
    projects: projects.map((p) => ({ id: p.id, name: p.name, progress: p.progress, expected_progress: p.expected_progress, delayed: p.delayed, at_risk: p.at_risk, due_date: p.due_date, status: p.status, dept_ar: p.dept_ar, dept_en: p.dept_en, progress_updated_at: p.progress_updated_at, is_demo: p.is_demo })),
    vault_notice: 'بيانات FS ومرصاد تبقى داخل Vault ولا تظهر هنا.',
  };
}
