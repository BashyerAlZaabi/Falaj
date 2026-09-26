// Work domain: projects, tasks, events, alerts, search, daily summary, KPIs —
// plus strategic portfolio execution: strategic projects (SPMO), resource
// allocations with manager confirmation, capacity, milestones and "assigned to
// me" views. All functions take the authenticated user and enforce policy
// themselves; every change notifies exactly the people in scope.
import { one, all, run, uid, now, today, tx, audit } from '../db.js';
import * as P from '../policy.js';
import { notify } from '../bus.js';

const PRIORITIES = ['low', 'medium', 'high', 'urgent'];
const TASK_STATUSES = ['todo', 'in_progress', 'done'];
const PROJECT_STATUSES = ['active', 'on_hold', 'done', 'cancelled'];
const PROGRESS_MODES = ['manual', 'tasks'];
const LIVE = "('pending_manager','active')";

export class BadInput extends Error {
  constructor(message, field) { super(message); this.status = 400; this.code = 'bad_input'; this.field = field; }
}

const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s)) && !Number.isNaN(Date.parse(s));
const inList = (arr) => (arr.length ? arr.map(() => '?').join(',') : "''");
const addDays = (iso, n) => { const d = new Date(`${iso}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysAgoIso = (n) => new Date(Date.now() - n * 864e5).toISOString();
// Arabic long date for alert texts ("25 أكتوبر").
const arDate = (iso) => { try { return new Date(`${String(iso).slice(0, 10)}T12:00:00Z`).toLocaleDateString('ar-AE', { day: 'numeric', month: 'long', timeZone: 'UTC' }); } catch { return iso; } };
const round2 = (n) => Math.round(n * 100) / 100;
const changed = (ids, entity, id, extra = {}) => notify(ids, { type: 'changed', entity, id, ...extra });
function alertUser(userId, level, title, body, entity, entityId) {
  if (!userId) return;
  run('INSERT INTO alerts (id,user_id,level,title,body,entity,entity_id,created_at) VALUES (?,?,?,?,?,?,?,?)', uid('al_'), userId, level, title, body || '', entity || null, entityId || null, now());
}
export function userBrief(id) {
  if (!id) return null;
  const u = one('SELECT u.id,u.name_ar,u.name_en,u.title_ar,u.title_en,u.role,u.department_id,d.name_ar dept_ar,d.name_en dept_en FROM users u JOIN departments d ON d.id=u.department_id WHERE u.id=?', id);
  return u || null;
}

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
  let atRisk = !delayed && p.status === 'active' && p.progress != null && expected != null && p.progress < expected - 15;
  const owner = one('SELECT name_ar,name_en FROM users WHERE id=?', p.owner_id);
  const dept = one('SELECT name_ar,name_en FROM departments WHERE id=?', p.department_id);
  const sponsor = p.sponsor_id ? one('SELECT name_ar,name_en FROM users WHERE id=?', p.sponsor_id) : null;
  const out = {
    ...p, is_demo: !!p.is_demo,
    owner_name_ar: owner?.name_ar, owner_name_en: owner?.name_en,
    dept_ar: dept?.name_ar, dept_en: dept?.name_en,
    tasks_total: counts.total || 0, tasks_done: counts.done || 0, tasks_overdue: counts.overdue || 0,
    delayed: !!delayed, at_risk: !!atRisk, expected_progress: expected,
    days_overdue: delayed ? Math.round((Date.parse(t) - Date.parse(p.due_date)) / 864e5) : 0,
    is_strategic: !!p.is_strategic, progress_mode: p.progress_mode || 'manual', budget: p.budget ?? null, initiative_ref: p.initiative_ref || null,
    sponsor_name_ar: sponsor?.name_ar || null, sponsor_name_en: sponsor?.name_en || null,
  };
  if (p.is_strategic) {
    const al = one(`SELECT COUNT(DISTINCT user_id) people, SUM(CASE WHEN status='active' AND end_date >= ? THEN percent ELSE 0 END) act, SUM(status='pending_manager') pend
                    FROM project_allocations WHERE project_id=? AND status IN ${LIVE}`, t, p.id);
    const ms = one(`SELECT COUNT(*) n, SUM(done_at IS NOT NULL) done, SUM(done_at IS NULL AND due_date < ?) late FROM project_milestones WHERE project_id=? AND deleted_at IS NULL`, t, p.id);
    const next = one('SELECT title,due_date FROM project_milestones WHERE project_id=? AND deleted_at IS NULL AND done_at IS NULL ORDER BY due_date LIMIT 1', p.id);
    Object.assign(out, {
      fte: round2((al.act || 0) / 100), people: al.people || 0, pending_allocations: al.pend || 0,
      milestones_total: ms.n || 0, milestones_done: ms.done || 0, milestones_late: ms.late || 0, next_milestone: next || null,
    });
    // a strategic project with an overdue milestone is at risk even when its % looks fine
    if (!delayed && p.status === 'active' && (ms.late || 0) > 0) atRisk = true;
    out.at_risk = !!atRisk;
  }
  return out;
}

export function listProjects(user, { status, delayed, q, limit = 200, strategic, department_id } = {}) {
  const s = P.projectScopeSql(user);
  let sql = `SELECT p.* FROM projects p WHERE ${s.sql}`;
  const params = [...s.params];
  if (status) { sql += ' AND p.status=?'; params.push(status); }
  if (strategic) sql += ' AND p.is_strategic=1';
  if (department_id) { sql += ' AND p.department_id=?'; params.push(department_id); }
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
  p.can_govern = P.canGovernProject(user, p);
  p.can_allocate = P.canProposeAllocation(user, p);
  const ts = P.taskScopeSql(user);
  p.tasks = all(`SELECT t.* FROM tasks t WHERE t.project_id=? AND ${ts.sql} ORDER BY t.due_date`, id, ...ts.params).map(decorateTask);
  p.allocations = projectAllocations(user, p);
  p.milestones = listMilestones(id);
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
  const mode = input.progress_mode || 'manual';
  if (!PROGRESS_MODES.includes(mode)) throw new BadInput('طريقة احتساب الإنجاز غير صالحة', 'progress_mode');
  const id = uid('pr_');
  tx(() => {
    run(`INSERT INTO projects (id,name,description,department_id,owner_id,status,progress,progress_updated_at,progress_updated_by,start_date,due_date,created_by,progress_mode)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      id, name, input.description || '', deptId, user.id, 'active', mode === 'tasks' ? null : input.progress ?? null,
      mode !== 'tasks' && input.progress != null ? now() : null, mode !== 'tasks' && input.progress != null ? user.id : null,
      input.start_date || today(), input.due_date || null, user.id, mode);
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

// Validates a strategic owner: an active staff member of the project's department (or below it).
function checkOwner(ownerId, deptId) {
  const o = one("SELECT id,department_id FROM users WHERE id=? AND active=1 AND user_type='staff'", ownerId);
  if (!o) throw new BadInput('مالك المشروع غير موجود', 'owner_id');
  if (!P.deptSubtree(deptId).includes(o.department_id)) throw new BadInput('يجب أن يكون مالك المشروع من الإدارة المنفِّذة', 'owner_id');
  return o;
}
function checkStaff(id, field) {
  const u = one("SELECT id,department_id,name_ar FROM users WHERE id=? AND active=1 AND user_type='staff'", id);
  if (!u) throw new BadInput('الموظف غير موجود أو ليس من موظفي الجهة', field);
  return u;
}
const checkBudget = (b) => {
  if (b == null || b === '') return null;
  const v = Number(b);
  if (!Number.isFinite(v) || v < 0 || v > 1e12) throw new BadInput('الميزانية يجب أن تكون رقماً موجباً بالدرهم', 'budget');
  return Math.round(v);
};

export function updateProject(user, input) {
  const p = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', input.id);
  if (!p || !P.canViewProject(user, input.id)) throw new P.NotFound();
  if (!P.canEditProject(user, p)) throw new P.Forbidden('لا تملك صلاحية تعديل هذا المشروع');
  const fields = {};
  if (input.progress_mode !== undefined) {
    if (!PROGRESS_MODES.includes(input.progress_mode)) throw new BadInput('طريقة احتساب الإنجاز غير صالحة', 'progress_mode');
    if (input.progress_mode !== (p.progress_mode || 'manual')) fields.progress_mode = input.progress_mode;
  }
  const mode = fields.progress_mode || p.progress_mode || 'manual';
  if (input.progress !== undefined) {
    if (mode === 'tasks') throw new BadInput('نسبة إنجاز هذا المشروع تُحسب تلقائياً من المهام المنجزة. غيّر طريقة الاحتساب إلى «يدوي» لتحديدها بنفسك.', 'progress');
    if (input.progress === null) { fields.progress = null; fields.progress_updated_at = now(); fields.progress_updated_by = user.id; }
    else {
      const v = Number(input.progress);
      if (!Number.isInteger(v) || v < 0 || v > 100) throw new BadInput('نسبة الإنجاز يجب أن تكون عدداً صحيحاً بين 0 و100', 'progress');
      fields.progress = v; fields.progress_updated_at = now(); fields.progress_updated_by = user.id;
    }
  }
  if (input.status !== undefined) {
    if (!PROJECT_STATUSES.includes(input.status)) throw new BadInput('حالة غير صالحة', 'status');
    fields.status = input.status;
  }
  for (const f of ['name', 'description']) if (input[f] !== undefined) fields[f] = String(input[f]);
  if (fields.name !== undefined && fields.name.trim().length < 2) throw new BadInput('اسم المشروع مطلوب', 'name');
  for (const f of ['due_date', 'start_date']) if (input[f] !== undefined) {
    if (input[f] !== null && !isDate(input[f])) throw new BadInput('تاريخ غير صالح', f);
    fields[f] = input[f];
  }
  if (input.budget !== undefined) fields.budget = checkBudget(input.budget);
  // Strategic projects: scope, budget, timeline and status are governed by SPMO, the owner and
  // the executing department's managers — not by every member who was given a task.
  if (p.is_strategic && ['budget', 'due_date', 'start_date', 'status', 'initiative_ref', 'name'].some((f) => fields[f] !== undefined || input[f] !== undefined)) {
    const governs = (user.caps || []).includes('strategy.admin') || p.owner_id === user.id || P.managedDepartments(user).includes(p.department_id);
    if (!governs) throw new P.Forbidden('تعديل نطاق المشروع الاستراتيجي وميزانيته وجدوله للإدارة المالكة وإدارة المشاريع الاستراتيجية فقط');
  }
  if (input.initiative_ref !== undefined) {
    const r = input.initiative_ref == null ? null : String(input.initiative_ref).trim().slice(0, 160) || null;
    fields.initiative_ref = r;
  }
  // governance of strategic projects: designation, sponsor and owner
  if (input.is_strategic !== undefined) {
    if (!P.isSpmo(user)) throw new P.Forbidden('تصنيف المشاريع الاستراتيجية من صلاحية إدارة المشاريع الاستراتيجية');
    fields.is_strategic = input.is_strategic ? 1 : 0;
    if (fields.is_strategic && !p.sponsor_id && input.sponsor_id === undefined) fields.sponsor_id = user.id;
  }
  if (input.sponsor_id !== undefined) {
    if (!P.isSpmo(user)) throw new P.Forbidden('تحديد راعي المشروع من صلاحية إدارة المشاريع الاستراتيجية');
    if (input.sponsor_id !== null) checkStaff(input.sponsor_id, 'sponsor_id');
    fields.sponsor_id = input.sponsor_id;
  }
  if (input.owner_id !== undefined && input.owner_id !== p.owner_id) {
    if (!(P.isSpmo(user) && p.is_strategic) && !P.managedDepartments(user).includes(p.department_id)) throw new P.Forbidden('تغيير مالك المشروع من صلاحية مدير الإدارة أو إدارة المشاريع الاستراتيجية');
    checkOwner(input.owner_id, p.department_id);
    fields.owner_id = input.owner_id;
  }
  if ((fields.start_date ?? p.start_date) && (fields.due_date ?? p.due_date) && (fields.due_date ?? p.due_date) < (fields.start_date ?? p.start_date)) throw new BadInput('تاريخ الاستحقاق يسبق تاريخ البدء', 'due_date');
  if (!Object.keys(fields).length) throw new BadInput('لا توجد حقول للتحديث');
  const before = Object.fromEntries(Object.keys(fields).filter((k) => !['progress_updated_at', 'progress_updated_by'].includes(k)).map((k) => [k, p[k]]));
  if (fields.progress_mode === 'tasks') before.progress = p.progress; // undo restores the manual value too
  const beforeRecipients = fields.is_strategic !== undefined ? P.recipientsForProject(p) : [];
  fields.updated_at = now();
  const keys = Object.keys(fields);
  run(`UPDATE projects SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), p.id);
  if (fields.owner_id) run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', p.id, fields.owner_id);
  if (fields.progress_mode === 'tasks') recalcProgress(p.id, user.id);
  audit(user.id, 'project.update', p.id, { before, after: fields });
  // verify persisted
  const raw = one('SELECT * FROM projects WHERE id=?', p.id);
  for (const k of Object.keys(before)) if (k in fields && String(raw[k]) !== String(fields[k])) throw new Error('فشل التحقق من حفظ التحديث');
  // e.g. the SPMO removing the strategic designation of another department's
  // project: the change is saved, and the project simply leaves the SPMO's scope.
  const after = P.canViewProject(user, p.id) ? getProject(user, p.id) : { id: p.id, name: p.name, is_strategic: !!raw.is_strategic, visible: false };
  if (fields.owner_id && fields.owner_id !== user.id) alertUser(fields.owner_id, 'info', `أصبحت مالكاً للمشروع «${p.name}»`, `بقرار من ${user.name_ar}`, 'project', p.id);
  changed([...new Set([...beforeRecipients, ...P.recipientsForProject(after.visible === false ? raw : after)])], 'project', p.id);
  const undoInput = { id: p.id, ...before };
  if (undoInput.progress_mode === 'tasks' && 'progress' in undoInput) delete undoInput.progress;
  return { result: after, before, undo: { tool: 'update_project', input: undoInput } };
}

export function deleteProject(user, { id }) {
  const p = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', id);
  if (!p || !P.canViewProject(user, id)) throw new P.NotFound();
  if (!P.canDeleteProject(user, p)) throw new P.Forbidden('لا تملك صلاحية حذف هذا المشروع');
  const rec = P.recipientsForProject(p);
  tx(() => {
    run('UPDATE tasks SET deleted_at=? WHERE project_id=? AND deleted_at IS NULL', now(), id);
    run('UPDATE projects SET deleted_at=? WHERE id=?', now(), id);
    run(`UPDATE project_allocations SET status='ended', updated_at=? WHERE project_id=? AND status IN ${LIVE}`, now(), id);
  });
  audit(user.id, 'project.delete', id, { name: p.name });
  notify(rec, { type: 'changed', entity: 'project', id });
  return { result: { id, name: p.name, deleted: true } };
}

// Task-driven progress: done / total of the project's live tasks (null when the
// project has no tasks — "not reported", never zero). Recorded as an automatic
// update so it never counts as a person's manual progress report. Returns
// undefined for projects whose progress is reported manually.
export function recalcProgress(projectId, byUserId) {
  const p = one('SELECT id,progress,progress_mode FROM projects WHERE id=? AND deleted_at IS NULL', projectId);
  if (!p || p.progress_mode !== 'tasks') return undefined;
  const c = one("SELECT COUNT(*) total, SUM(status='done') done FROM tasks WHERE project_id=? AND deleted_at IS NULL", projectId);
  const v = c.total ? Math.round(((c.done || 0) * 100) / c.total) : null;
  if (v === p.progress) return v;
  run('UPDATE projects SET progress=?, progress_updated_at=?, progress_updated_by=?, updated_at=? WHERE id=?', v, now(), byUserId || null, now(), projectId);
  audit(byUserId || null, 'project.progress_auto', projectId, { from: p.progress, to: v, done: c.done || 0, total: c.total });
  return v;
}

// ---------------- strategic projects (SPMO) ----------------
// One transaction: the project, its initial allocations (pending the people's
// managers), initial tasks (assigned across departments) and milestones.
export function createStrategicProject(user, input) {
  if (!P.isSpmo(user)) throw new P.Forbidden('إنشاء المشاريع الاستراتيجية من صلاحية إدارة المشاريع الاستراتيجية');
  const name = String(input.name || '').trim();
  if (name.length < 2) throw new BadInput('اسم المشروع مطلوب', 'name');
  const dept = one('SELECT id,name_ar FROM departments WHERE id=? AND is_external=0', input.department_id || '');
  if (!dept) throw new BadInput('اختر الإدارة المنفِّذة', 'department_id');
  if (!input.owner_id) throw new BadInput('اختر مالك المشروع من الإدارة المنفِّذة', 'owner_id');
  checkOwner(input.owner_id, dept.id);
  const sponsor = input.sponsor_id || user.id;
  checkStaff(sponsor, 'sponsor_id');
  const start = input.start_date || today();
  if (!isDate(start)) throw new BadInput('تاريخ البدء غير صالح', 'start_date');
  if (!input.due_date || !isDate(input.due_date)) throw new BadInput('حدّد تاريخ استحقاق المشروع', 'due_date');
  if (input.due_date < start) throw new BadInput('تاريخ الاستحقاق يسبق تاريخ البدء', 'due_date');
  const mode = input.progress_mode || 'tasks';
  if (!PROGRESS_MODES.includes(mode)) throw new BadInput('طريقة احتساب الإنجاز غير صالحة', 'progress_mode');
  const budget = checkBudget(input.budget);
  const id = uid('pr_');
  tx(() => {
    run(`INSERT INTO projects (id,name,description,department_id,owner_id,status,progress,start_date,due_date,created_by,is_strategic,sponsor_id,budget,initiative_ref,progress_mode)
         VALUES (?,?,?,?,?,'active',NULL,?,?,?,1,?,?,?,?)`,
      id, name, String(input.description || ''), dept.id, input.owner_id, start, input.due_date, user.id, sponsor, budget,
      input.initiative_ref ? String(input.initiative_ref).trim().slice(0, 160) : null, mode);
    run('INSERT INTO project_members (project_id,user_id) VALUES (?,?)', id, input.owner_id);
    const project = one('SELECT * FROM projects WHERE id=?', id);
    (input.allocations || []).forEach((a, i) => { try { insertAllocation(user, { ...a, project_id: id }, project); } catch (e) { e.message = `التخصيص ${i + 1}: ${e.message}`; throw e; } });
    (input.tasks || []).forEach((tk, i) => { try { insertTask(user, { ...tk, project_id: id }, project); } catch (e) { e.message = `المهمة ${i + 1}: ${e.message}`; throw e; } });
    (input.milestones || []).forEach((m, i) => { try { insertMilestone(user, { ...m, project_id: id }); } catch (e) { e.message = `المعلم ${i + 1}: ${e.message}`; throw e; } });
    recalcProgress(id, user.id);
  });
  audit(user.id, 'project.create_strategic', id, { name, department_id: dept.id, owner_id: input.owner_id, allocations: (input.allocations || []).length, tasks: (input.tasks || []).length });
  if (input.owner_id !== user.id) alertUser(input.owner_id, 'info', `أُسند إليك المشروع الاستراتيجي «${name}»`, `بقرار من ${user.name_ar} · الاستحقاق ${arDate(input.due_date)}`, 'project', id);
  const p = getProject(user, id);
  changed(P.recipientsForProject(p), 'project,task', id);
  return { result: p, undo: { tool: '_undo_create_project', input: { id } } };
}

// ---------------- tasks ----------------
function decorateTask(t) {
  if (!t) return t;
  const a = one('SELECT name_ar,name_en FROM users WHERE id=?', t.assignee_id);
  const p = t.project_id ? one('SELECT name,is_strategic FROM projects WHERE id=?', t.project_id) : null;
  const by = t.assigned_by || t.created_by;
  const assigner = by && by !== t.assignee_id ? one('SELECT name_ar,name_en FROM users WHERE id=?', by) : null;
  return { ...t, is_demo: !!t.is_demo, assignee_ar: a?.name_ar, assignee_en: a?.name_en, project_name: p?.name || null,
    project_is_strategic: !!p?.is_strategic,
    assigned_by: by || null, assigner_ar: assigner?.name_ar || null, assigner_en: assigner?.name_en || null, assigned_at: t.assigned_at || null,
    overdue: t.status !== 'done' && !!t.due_date && t.due_date < today() };
}

export function listTasks(user, { status, project_id, mine, overdue, week_done, q, limit = 300, assigned_by_others } = {}) {
  const s = P.taskScopeSql(user);
  let sql = `SELECT t.* FROM tasks t WHERE ${s.sql}`;
  const params = [...s.params];
  if (status) { sql += ' AND t.status=?'; params.push(status); }
  if (project_id) { sql += ' AND t.project_id=?'; params.push(project_id); }
  if (mine) { sql += ' AND t.assignee_id=?'; params.push(user.id); }
  if (assigned_by_others) { sql += ' AND t.assignee_id=? AND COALESCE(t.assigned_by, t.created_by) != ?'; params.push(user.id, user.id); }
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

// Clear alert to the person who must act on an assignment.
function assignmentAlert(user, assigneeId, title, taskId, project, due) {
  if (!assigneeId || assigneeId === user.id) return;
  if (project?.is_strategic) {
    alertUser(assigneeId, 'info', `تكليف جديد من ${user.name_ar}: «${title}»`,
      `ضمن المشروع الاستراتيجي «${project.name}»${due ? ` — الاستحقاق ${arDate(due)}` : ''}`, 'task', taskId);
  } else {
    alertUser(assigneeId, 'info', `مهمة جديدة: ${title}`, `أسندها ${user.name_ar}`, 'task', taskId);
  }
}

// Validates and inserts one task row with its alert (no realtime notification). Returns { id }.
function insertTask(user, input, projectRow) {
  const title = String(input.title || '').trim();
  if (title.length < 2) throw new BadInput('عنوان المهمة مطلوب', 'title');
  const assignee = input.assignee_id || user.id;
  let project = projectRow || null;
  if (!project && input.project_id) {
    project = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', input.project_id);
    if (!project || !P.canViewProject(user, project.id)) {
      // base rule first: someone who may not assign to this person gets the assignment error
      if (!P.canAssignTo(user, assignee)) throw new P.Forbidden('لا يمكنك إسناد مهمة لهذا المستخدم');
      throw new P.NotFound('المشروع غير موجود أو غير متاح لك');
    }
  }
  if (!P.canAssignInProject(user, assignee, project)) throw new P.Forbidden('لا يمكنك إسناد مهمة لهذا المستخدم');
  if (project && !projectRow && !P.canEditProject(user, project)) throw new P.Forbidden('لا تملك صلاحية إضافة مهام لهذا المشروع');
  const who = one('SELECT department_id FROM users WHERE id=?', assignee);
  if (!who) throw new BadInput('المسؤول غير موجود', 'assignee_id');
  const deptId = project ? project.department_id : who.department_id;
  if (input.priority && !PRIORITIES.includes(input.priority)) throw new BadInput('أولوية غير صالحة', 'priority');
  if (input.due_date && !isDate(input.due_date)) throw new BadInput('تاريخ الاستحقاق غير صالح', 'due_date');
  const id = uid('tk_');
  const at = now();
  run(`INSERT INTO tasks (id,title,description,project_id,assignee_id,department_id,status,priority,due_date,created_by,assigned_by,assigned_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, id, title, input.description || '', project?.id || null, assignee, deptId,
    'todo', input.priority || 'medium', input.due_date || null, user.id, user.id, at);
  if (project) run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', project.id, assignee);
  assignmentAlert(user, assignee, title, id, project, input.due_date);
  audit(user.id, 'task.create', id, { title });
  return { id };
}

export function createTask(user, input) {
  const { id } = insertTask(user, input, null);
  const t = getTask(user, id);
  const progressChanged = t.project_id ? recalcProgress(t.project_id, user.id) !== undefined : false;
  notify(P.recipientsForTask(t), { type: 'changed', entity: progressChanged ? 'task,project' : 'task', id });
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
  const project = t.project_id ? one('SELECT * FROM projects WHERE id=?', t.project_id) : null;
  if (input.assignee_id !== undefined && input.assignee_id !== t.assignee_id) {
    if (!P.canAssignInProject(user, input.assignee_id, project)) throw new P.Forbidden('لا يمكنك إسناد المهمة لهذا المستخدم');
    fields.assignee_id = input.assignee_id;
  } else if (input.assignee_id !== undefined && !P.canAssignInProject(user, input.assignee_id, project)) {
    throw new P.Forbidden('لا يمكنك إسناد المهمة لهذا المستخدم');
  }
  for (const f of ['title', 'description']) if (input[f] !== undefined) fields[f] = String(input[f]);
  if (!Object.keys(fields).length) throw new BadInput('لا توجد حقول للتحديث');
  const before = Object.fromEntries(Object.keys(fields).map((k) => [k, t[k]]));
  const beforeRecipients = P.recipientsForTask(t);
  if (fields.assignee_id) { fields.assigned_by = user.id; fields.assigned_at = now(); }
  fields.updated_at = now();
  const keys = Object.keys(fields);
  run(`UPDATE tasks SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), t.id);
  if (fields.assignee_id && t.project_id) run('INSERT OR IGNORE INTO project_members (project_id,user_id) VALUES (?,?)', t.project_id, fields.assignee_id);
  if (fields.assignee_id) assignmentAlert(user, fields.assignee_id, fields.title ?? t.title, t.id, project, fields.due_date ?? t.due_date);
  audit(user.id, 'task.update', t.id, { before, after: fields });
  const progressChanged = fields.status !== undefined && t.project_id ? recalcProgress(t.project_id, user.id) !== undefined : false;
  const after = getTask(user, t.id);
  notify([...new Set([...beforeRecipients, ...P.recipientsForTask(after)])], { type: 'changed', entity: progressChanged ? 'task,project' : 'task', id: t.id });
  const undoInput = { id: t.id, ...before }; delete undoInput.completed_at;
  return { result: after, before, undo: { tool: 'update_task', input: undoInput } };
}

export function deleteTask(user, { id }) {
  const t = one('SELECT * FROM tasks WHERE id=? AND deleted_at IS NULL', id);
  if (!t || !P.canViewTask(user, id)) throw new P.NotFound();
  if (!P.canEditTask(user, t)) throw new P.Forbidden('لا تملك صلاحية حذف هذه المهمة');
  run('UPDATE tasks SET deleted_at=? WHERE id=?', now(), id);
  audit(user.id, 'task.delete', id, { title: t.title });
  const progressChanged = t.project_id ? recalcProgress(t.project_id, user.id) !== undefined : false;
  notify(P.recipientsForTask(t), { type: 'changed', entity: progressChanged ? 'task,project' : 'task', id });
  return { result: { id, title: t.title, deleted: true } };
}

// Internal (undo of creation): soft delete without confirmation — only the creator, immediately.
export function undoCreate(user, table, id) {
  const r = one(`SELECT * FROM ${table} WHERE id=? AND created_by=? AND deleted_at IS NULL`, id, user.id);
  if (!r) throw new P.NotFound();
  const rec = table === 'projects' ? P.recipientsForProject(r) : P.recipientsForTask(r);
  run(`UPDATE ${table} SET deleted_at=? WHERE id=?`, now(), id);
  if (table === 'projects') {
    run('UPDATE tasks SET deleted_at=? WHERE project_id=? AND deleted_at IS NULL', now(), id);
    run(`UPDATE project_allocations SET status='ended', updated_at=? WHERE project_id=? AND status IN ${LIVE}`, now(), id);
  }
  if (table === 'tasks' && r.project_id) recalcProgress(r.project_id, user.id);
  notify(rec, { type: 'changed', entity: table === 'tasks' && r.project_id ? 'task,project' : table.slice(0, -1), id });
  return { result: { id, undone: true } };
}

// ---------------- allocations & capacity ----------------
// Load = sum of a person's ACTIVE allocation % overlapping a date (> 100 = over-allocated).
// Allocations on deleted projects never count.
const loadRows = (userId, from, to, { includePending = false, excludeId } = {}) => all(
  `SELECT a.* FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL
   WHERE a.user_id=? AND a.status IN (${includePending ? "'active','pending_manager'" : "'active'"}) AND a.start_date<=? AND a.end_date>=? AND a.id!=?`,
  userId, to, from, excludeId || '');
export function loadAt(userId, date = today(), opts = {}) {
  return loadRows(userId, date, date, opts).reduce((s, a) => s + a.percent, 0);
}
// Peak load over [from, to]: the load is piecewise constant, so it is enough to
// evaluate it at the window start and at every allocation start inside it.
export function peakLoad(userId, from, to, opts = {}) {
  const rows = loadRows(userId, from, to, opts);
  const points = new Set([from, ...rows.map((r) => r.start_date).filter((d) => d > from && d <= to)]);
  let peak = 0;
  for (const d of points) peak = Math.max(peak, rows.filter((r) => r.start_date <= d && r.end_date >= d).reduce((s, r) => s + r.percent, 0));
  return peak;
}

function decorateAllocation(a, user, projectRow) {
  const p = projectRow || one('SELECT id,name,department_id,owner_id,sponsor_id,is_strategic,deleted_at FROM projects WHERE id=?', a.project_id);
  const pd = p ? one('SELECT name_ar,name_en FROM departments WHERE id=?', p.department_id) : null;
  const person = userBrief(a.user_id);
  const by = userBrief(a.allocated_by);
  const dec = a.decided_by ? userBrief(a.decided_by) : null;
  const t = today();
  const live = ['pending_manager', 'active'].includes(a.status) && a.end_date >= t;
  const from = a.start_date > t ? a.start_date : t;
  const others = live ? peakLoad(a.user_id, from, a.end_date, { excludeId: a.id }) : null;
  const decide = a.status === 'pending_manager' && P.canDecideAllocation(user, a);
  return {
    ...a, is_demo: !!a.is_demo,
    person_ar: person?.name_ar, person_en: person?.name_en, person_title_ar: person?.title_ar, person_title_en: person?.title_en,
    person_department_id: person?.department_id, person_dept_ar: person?.dept_ar, person_dept_en: person?.dept_en,
    project_name: p?.name || null, project_department_id: p?.department_id || null, project_dept_ar: pd?.name_ar || null, project_dept_en: pd?.name_en || null,
    project_is_strategic: !!p?.is_strategic,
    allocated_by_ar: by?.name_ar || null, allocated_by_en: by?.name_en || null,
    decided_by_ar: dec?.name_ar || null, decided_by_en: dec?.name_en || null,
    current: a.status === 'active' && a.start_date <= t && a.end_date >= t,
    load_others: others, load_with: others == null ? null : others + a.percent, over: others != null && others + a.percent > 100,
    can_decide: decide,
    can_end: a.status === 'active' && a.end_date >= t && (P.canDecideAllocation(user, a) || (!!p && P.canProposeAllocation(user, p))),
    can_cancel: a.status === 'pending_manager' && a.allocated_by === user.id,
    deciders: a.status === 'pending_manager' ? P.lineManagers(a.user_id).map((id) => { const u = userBrief(id); return { id, name_ar: u?.name_ar, name_en: u?.name_en }; }) : [],
  };
}

const ALLOC_ORDER = "CASE a.status WHEN 'pending_manager' THEN 0 WHEN 'active' THEN 1 WHEN 'declined' THEN 2 ELSE 3 END";
function projectAllocations(user, p) {
  const history = P.canEditProject(user, p) || P.isSpmo(user);
  return all(`SELECT a.* FROM project_allocations a WHERE a.project_id=? ORDER BY ${ALLOC_ORDER}, a.percent DESC, a.created_at`, p.id)
    .filter((a) => ['pending_manager', 'active'].includes(a.status) || history || a.user_id === user.id || P.canDecideAllocation(user, a))
    .map((a) => decorateAllocation(a, user, p));
}

// Who may see an allocation: the person, the proposer, the person's managers
// (all allocations of their staff), the project's department managers / owner /
// sponsor, and the SPMO for strategic projects.
function allocationScope(user) {
  const depts = P.managedDepartments(user);
  return {
    sql: `(a.user_id=? OR a.allocated_by=? OR u.department_id IN (${inList(depts)}) OR p.department_id IN (${inList(depts)}) OR p.owner_id=? OR p.sponsor_id=?${P.isSpmo(user) ? ' OR p.is_strategic=1' : ''})`,
    params: [user.id, user.id, ...depts, ...depts, user.id, user.id],
  };
}
export function listAllocations(user, { project_id, user_id, scope, status } = {}) {
  if (!P.isInternal(user)) throw new P.Forbidden();
  const s = allocationScope(user);
  let sql = `SELECT a.* FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL JOIN users u ON u.id=a.user_id WHERE ${s.sql}`;
  const params = [...s.params];
  if (project_id) { sql += ' AND a.project_id=?'; params.push(project_id); }
  if (user_id) { sql += ' AND a.user_id=?'; params.push(user_id); }
  if (status) { sql += ' AND a.status=?'; params.push(status); }
  if (scope === 'mine') { sql += ' AND a.user_id=?'; params.push(user.id); }
  if (scope === 'decide') sql += " AND a.status='pending_manager'";
  sql += ` ORDER BY ${ALLOC_ORDER}, a.start_date`;
  let rows = all(sql, ...params).map((a) => decorateAllocation(a, user));
  if (scope === 'decide') rows = rows.filter((a) => a.can_decide);
  return rows;
}
// The raw allocation row when it is inside the user's scope (else 404, never 403:
// an out-of-scope id must not reveal that it exists or what state it is in).
function scopedAllocation(user, id) {
  if (!P.isInternal(user)) throw new P.NotFound('التخصيص غير موجود أو غير متاح لك');
  const s = allocationScope(user);
  const a = one(`SELECT a.* FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL JOIN users u ON u.id=a.user_id WHERE a.id=? AND ${s.sql}`, String(id || ''), ...s.params);
  if (!a) throw new P.NotFound('التخصيص غير موجود أو غير متاح لك');
  return a;
}
export function getAllocation(user, id) {
  return decorateAllocation(scopedAllocation(user, id), user);
}

function checkPercent(v) {
  const n = Number(v);
  if (!Number.isInteger(n) || n < 5 || n > 100) throw new BadInput('نسبة التخصيص يجب أن تكون عدداً صحيحاً بين 5 و100', 'percent');
  return n;
}
// Validates and inserts one allocation with its alerts (no realtime notification). Returns { id, status, over }.
function insertAllocation(user, input, projectRow) {
  const project = projectRow || one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', input.project_id || '');
  if (!project || !P.canViewProject(user, project.id)) throw new P.NotFound('المشروع غير موجود أو غير متاح لك');
  if (!project.is_strategic) throw new BadInput('تخصيص الموارد متاح للمشاريع الاستراتيجية', 'project_id');
  if (!P.canProposeAllocation(user, project)) throw new P.Forbidden('تخصيص الموارد من صلاحية إدارة المشاريع الاستراتيجية أو مدير الإدارة المنفِّذة');
  const person = checkStaff(input.user_id, 'user_id');
  const percent = checkPercent(input.percent);
  const t = today();
  const start = input.start_date || (project.start_date && project.start_date > t ? project.start_date : t);
  const end = input.end_date || project.due_date;
  if (!isDate(start)) throw new BadInput('تاريخ بداية التخصيص غير صالح', 'start_date');
  if (!end || !isDate(end)) throw new BadInput('حدّد تاريخ نهاية التخصيص', 'end_date');
  if (end < start) throw new BadInput('نهاية التخصيص تسبق بدايته', 'end_date');
  if (one(`SELECT 1 FROM project_allocations WHERE project_id=? AND user_id=? AND status IN ${LIVE} AND start_date<=? AND end_date>=?`, project.id, person.id, end, start)) {
    throw new BadInput(`يوجد تخصيص قائم لـ${person.name_ar} في هذا المشروع خلال الفترة نفسها — عدّله بدلاً من إضافة تخصيص جديد`, 'user_id');
  }
  // The person's line manager allocating their own staff confirms it at once (never self-approval).
  const auto = person.id !== user.id && P.managedDepartments(user).includes(person.department_id);
  const id = uid('pa_');
  const at = now();
  run(`INSERT INTO project_allocations (id,project_id,user_id,role_ar,percent,proposed_percent,start_date,end_date,allocated_by,status,decided_by,decided_at,note,created_at,updated_at)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, project.id, person.id, String(input.role_ar || '').trim().slice(0, 80), percent, percent, start, end, user.id,
    auto ? 'active' : 'pending_manager', auto ? user.id : null, auto ? at : null, input.note ? String(input.note).slice(0, 500) : null, at, at);
  const peak = peakLoad(person.id, start > t ? start : t, end, { excludeId: id });
  const over = peak + percent > 100;
  audit(user.id, 'allocation.propose', id, { project_id: project.id, user_id: person.id, percent, start, end, status: auto ? 'active' : 'pending_manager' });
  const period = `${arDate(start)} – ${arDate(end)}`;
  if (auto) {
    if (person.id !== user.id) alertUser(person.id, 'info', `خُصّص ${percent}% من وقتك لمشروع «${project.name}»`, `بقرار من ${user.name_ar} · ${period}`, 'allocation', id);
  } else {
    alertUser(person.id, 'info', `طُلب تخصيص ${percent}% من وقتك لمشروع «${project.name}»`, `اقترحه ${user.name_ar} · ${period} · بانتظار اعتماد مديرك`, 'allocation', id);
    for (const m of P.lineManagers(person.id)) {
      alertUser(m, 'warning', `طلب تخصيص ${percent}% من وقت ${person.name_ar} لمشروع «${project.name}» بانتظار موافقتك`,
        `اقترحه ${user.name_ar} · ${period}${over ? ` · سيبلغ حمله ${peak + percent}%` : ''}`, 'allocation', id);
    }
  }
  return { id, status: auto ? 'active' : 'pending_manager', over };
}

export function proposeAllocation(user, input) {
  const r = insertAllocation(user, input, null);
  const a = one('SELECT * FROM project_allocations WHERE id=?', r.id);
  changed(P.recipientsForAllocation(a), 'project', a.project_id, { allocation: a.id });
  return { result: getAllocation(user, r.id), undo: { tool: '_undo_allocation', input: { id: r.id } } };
}

// Manager decision: confirm, adjust (percent/dates, then confirm) or decline with
// a reason; end an active allocation. Every decision is audited and announced.
export function decideAllocation(user, input) {
  const a = scopedAllocation(user, input.id);
  const project = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', a.project_id);
  if (!project) throw new P.NotFound('المشروع غير موجود');
  const decision = input.decision;
  if (decision === 'withdraw') return cancelAllocation(user, { id: a.id }); // the proposer takes back a pending request
  if (!['confirm', 'adjust', 'decline', 'end'].includes(decision)) throw new BadInput('القرار غير صالح', 'decision');
  const person = userBrief(a.user_id);
  const fields = {};
  if (decision === 'end') {
    if (a.status !== 'active') throw new BadInput('يمكن إنهاء التخصيصات المعتمدة فقط');
    if (!P.canDecideAllocation(user, a) && !P.canProposeAllocation(user, project)) throw new P.Forbidden('لا تملك صلاحية إنهاء هذا التخصيص');
    fields.status = 'ended';
    if (a.end_date > today()) fields.end_date = today();
  } else {
    if (a.status !== 'pending_manager') throw new BadInput('اتُّخذ قرار في هذا التخصيص مسبقاً');
    if (a.user_id === user.id) throw new P.Forbidden('لا يمكنك اعتماد تخصيص وقتك بنفسك');
    if (!P.canDecideAllocation(user, a)) throw new P.Forbidden('اعتماد التخصيص من صلاحية المدير المباشر للموظف');
    if (decision === 'decline') {
      const reason = String(input.reason || '').trim();
      if (reason.length < 3) throw new BadInput('اذكر سبب الاعتذار عن التخصيص', 'reason');
      fields.status = 'declined'; fields.decision_note = reason.slice(0, 500);
    } else {
      fields.status = 'active';
      if (decision === 'adjust') {
        if (input.percent != null) fields.percent = checkPercent(input.percent);
        for (const f of ['start_date', 'end_date']) if (input[f] != null) { if (!isDate(input[f])) throw new BadInput('تاريخ غير صالح', f); fields[f] = input[f]; }
        if ((fields.end_date || a.end_date) < (fields.start_date || a.start_date)) throw new BadInput('نهاية التخصيص تسبق بدايته', 'end_date');
        if (!('percent' in fields) && !('start_date' in fields) && !('end_date' in fields)) throw new BadInput('حدّد النسبة أو التواريخ المعدّلة', 'percent');
        if (input.reason) fields.decision_note = String(input.reason).trim().slice(0, 500);
      }
    }
    fields.decided_by = user.id; fields.decided_at = now();
  }
  fields.updated_at = now();
  const before = Object.fromEntries(Object.keys(fields).map((k) => [k, a[k]]));
  const keys = Object.keys(fields);
  run(`UPDATE project_allocations SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), a.id);
  audit(user.id, `allocation.${decision}`, a.id, { before, after: fields, project_id: a.project_id, user_id: a.user_id });
  const pct = fields.percent ?? a.percent;
  if (decision === 'confirm' || decision === 'adjust') {
    const adj = decision === 'adjust' ? ` (بعد التعديل من ${a.percent}%)` : '';
    alertUser(a.user_id, 'info', `اعتُمد تخصيص ${pct}% من وقتك لمشروع «${project.name}»${adj}`, `بقرار من ${user.name_ar} · ${arDate(fields.start_date || a.start_date)} – ${arDate(fields.end_date || a.end_date)}`, 'allocation', a.id);
    if (a.allocated_by !== user.id) alertUser(a.allocated_by, 'info', `اعتُمد تخصيص ${pct}% من وقت ${person?.name_ar} لمشروع «${project.name}»${adj}`, `بقرار من ${user.name_ar}`, 'allocation', a.id);
  } else if (decision === 'decline') {
    alertUser(a.user_id, 'info', `لم يُعتمد تخصيص وقتك لمشروع «${project.name}»`, `بقرار من ${user.name_ar}: ${fields.decision_note}`, 'allocation', a.id);
    if (a.allocated_by !== user.id) alertUser(a.allocated_by, 'warning', `اعتذار عن تخصيص ${person?.name_ar} لمشروع «${project.name}»`, `من ${user.name_ar}: ${fields.decision_note}`, 'allocation', a.id);
  } else if (a.user_id !== user.id) {
    alertUser(a.user_id, 'info', `انتهى تخصيص وقتك لمشروع «${project.name}»`, `بقرار من ${user.name_ar}`, 'allocation', a.id);
  }
  const after = one('SELECT * FROM project_allocations WHERE id=?', a.id);
  changed(P.recipientsForAllocation(after), 'project', a.project_id, { allocation: a.id });
  return { result: decorateAllocation(after, user) };
}

// Undo of a proposal: only its proposer, only while nobody else has decided on it.
export function cancelAllocation(user, { id }) {
  const a = scopedAllocation(user, id);
  if (a.allocated_by !== user.id) throw new P.Forbidden('سحب طلب التخصيص من صلاحية من اقترحه');
  if (a.status === 'pending_manager' || (a.status === 'active' && a.decided_by === user.id)) {
    const rec = P.recipientsForAllocation(a);
    run('DELETE FROM project_allocations WHERE id=?', id);
    run("UPDATE alerts SET read_at=? WHERE entity='allocation' AND entity_id=? AND read_at IS NULL", now(), id);
    audit(user.id, 'allocation.cancel', id, { project_id: a.project_id, user_id: a.user_id });
    changed(rec, 'project', a.project_id, { allocation: id });
    return { result: { id, undone: true, project_id: a.project_id } };
  }
  throw new BadInput('اتُّخذ قرار في هذا التخصيص؛ لم يعد التراجع عنه ممكناً');
}

// Live capacity check for one person (wizard / allocation sheet / "what if").
export function personCapacity(user, { user_id, from, to, percent, project_id, exclude_id } = {}) {
  if (!P.isInternal(user)) throw new P.Forbidden();
  const target = one("SELECT id,department_id FROM users WHERE id=? AND active=1 AND user_type='staff'", user_id || '');
  if (!target) throw new P.NotFound('الموظف غير موجود');
  const project = project_id ? one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', project_id) : null;
  const allowed = target.id === user.id || P.isSpmo(user) || P.managedDepartments(user).includes(target.department_id) || (project && P.canProposeAllocation(user, project));
  if (!allowed) throw new P.Forbidden('لا يمكنك الاطلاع على سعة هذا الموظف');
  const t = today();
  const f = from && isDate(from) ? from : t;
  const e = to && isDate(to) && to >= f ? to : addDays(f, 90);
  const pct = percent != null && percent !== '' ? Math.max(0, Math.min(100, Number(percent) || 0)) : 0;
  const rows = loadRows(target.id, f, e, { includePending: true, excludeId: exclude_id });
  const activePeak = peakLoad(target.id, f, e, { excludeId: exclude_id });
  const pendingPeak = peakLoad(target.id, f, e, { includePending: true, excludeId: exclude_id });
  const person = userBrief(target.id);
  const auto = target.id !== user.id && P.managedDepartments(user).includes(target.department_id);
  return {
    person: { id: person.id, name_ar: person.name_ar, name_en: person.name_en, title_ar: person.title_ar, title_en: person.title_en, dept_ar: person.dept_ar, dept_en: person.dept_en },
    from: f, to: e, current: loadAt(target.id, t), active_peak: activePeak, pending_peak: pendingPeak,
    percent: pct, with_this: activePeak + pct, with_pending: pendingPeak + pct, over: activePeak + pct > 100, over_with_pending: pendingPeak + pct > 100,
    allocations: rows.map((a) => {
      const visible = P.canViewProject(user, a.project_id) || P.managedDepartments(user).includes(target.department_id) || target.id === user.id;
      const p = one('SELECT name FROM projects WHERE id=?', a.project_id);
      return { id: a.id, project_id: visible ? a.project_id : null, project_name: visible ? p?.name : null, percent: a.percent, start_date: a.start_date, end_date: a.end_date, status: a.status };
    }),
    approval: { auto, deciders: auto ? [] : P.lineManagers(target.id).map((id) => { const u = userBrief(id); return { id, name_ar: u?.name_ar, name_en: u?.name_en }; }) },
  };
}

// Team capacity: managers see their staff; the SPMO sees everyone allocated to
// strategic work; the president sees the organisation; others see themselves.
export function teamCapacity(user, { department_id, days = 90 } = {}) {
  if (!P.isInternal(user)) throw new P.Forbidden();
  const t = today();
  const horizon = addDays(t, Math.max(7, Math.min(365, Number(days) || 90)));
  const depts = P.managedDepartments(user);
  const spmo = P.isSpmo(user);
  const scope = user.role === 'president' ? 'organisation' : spmo ? 'portfolio' : depts.length ? 'department' : 'self';
  const ids = new Set();
  if (depts.length) for (const r of all(`SELECT id FROM users WHERE active=1 AND user_type='staff' AND department_id IN (${inList(depts)})`, ...depts)) ids.add(r.id);
  if (spmo) for (const r of all(`SELECT DISTINCT a.user_id FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL WHERE p.is_strategic=1 AND a.status IN ${LIVE} AND a.end_date>=?`, t)) ids.add(r.user_id);
  if (scope === 'self') ids.add(user.id);
  let people = [...ids].map(userBrief).filter(Boolean);
  if (department_id) people = people.filter((u) => u.department_id === department_id);
  const visibleAlloc = new Set(listAllocations(user, {}).map((a) => a.id));
  const rows = people.map((u) => {
    const allocs = all(`SELECT a.*, p.name project_name FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL
                        WHERE a.user_id=? AND a.status IN ${LIVE} AND a.end_date>=? AND a.start_date<=? ORDER BY a.status='pending_manager', a.percent DESC`, u.id, t, horizon);
    const now0 = loadAt(u.id, t);
    const peak = peakLoad(u.id, t, horizon);
    const peakP = peakLoad(u.id, t, horizon, { includePending: true });
    return {
      id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, role: u.role,
      department_id: u.department_id, dept_ar: u.dept_ar, dept_en: u.dept_en,
      load_now: now0, peak, peak_with_pending: peakP, pending: allocs.filter((a) => a.status === 'pending_manager').reduce((s, a) => s + a.percent, 0),
      over: peak > 100, over_with_pending: peakP > 100, free: Math.max(0, 100 - peak),
      // allocations outside the viewer's scope count toward the load but stay anonymous
      allocations: allocs.map((a) => { const v = visibleAlloc.has(a.id); return { id: v ? a.id : null, project_id: v ? a.project_id : null, project_name: v ? a.project_name : null, percent: a.percent, start_date: a.start_date, end_date: a.end_date, status: a.status, role_ar: v ? a.role_ar : null, current: a.status === 'active' && a.start_date <= t }; }),
    };
  }).sort((a, b) => b.peak_with_pending - a.peak_with_pending || a.name_ar.localeCompare(b.name_ar, 'ar'));
  const pending = listAllocations(user, { scope: 'decide' });
  const byDept = {};
  for (const r of rows) {
    byDept[r.department_id] ??= { department_id: r.department_id, name_ar: r.dept_ar, name_en: r.dept_en, people: 0, over: 0, load_sum: 0 };
    const d = byDept[r.department_id]; d.people++; if (r.over) d.over++; d.load_sum += r.load_now;
  }
  return {
    scope, date: t, horizon, generated_at: now(),
    people: rows, pending,
    by_department: Object.values(byDept).map((d) => ({ ...d, avg_load: d.people ? Math.round(d.load_sum / d.people) : 0 })),
    summary: {
      people: rows.length, over: rows.filter((r) => r.over).length, over_with_pending: rows.filter((r) => r.over_with_pending).length,
      pending_decisions: pending.length, avg_load: rows.length ? Math.round(rows.reduce((s, r) => s + r.load_now, 0) / rows.length) : 0,
      fte_now: round2(rows.reduce((s, r) => s + r.load_now, 0) / 100),
    },
    source: 'project_allocations',
  };
}

// ---------------- milestones ----------------
function decorateMilestone(m) {
  const o = m.owner_id ? one('SELECT name_ar,name_en FROM users WHERE id=?', m.owner_id) : null;
  return { ...m, is_demo: !!m.is_demo, owner_ar: o?.name_ar || null, owner_en: o?.name_en || null, done: !!m.done_at, late: !m.done_at && m.due_date < today() };
}
export function listMilestones(projectId) {
  return all('SELECT * FROM project_milestones WHERE project_id=? AND deleted_at IS NULL ORDER BY due_date, created_at', projectId).map(decorateMilestone);
}
function insertMilestone(user, input) {
  const title = String(input.title || '').trim();
  if (title.length < 2) throw new BadInput('عنوان المعلم مطلوب', 'title');
  if (!input.due_date || !isDate(input.due_date)) throw new BadInput('حدّد تاريخ المعلم', 'due_date');
  if (input.owner_id) checkStaff(input.owner_id, 'owner_id');
  const id = uid('ms_');
  run('INSERT INTO project_milestones (id,project_id,title,due_date,owner_id,created_by,created_at) VALUES (?,?,?,?,?,?,?)', id, input.project_id, title.slice(0, 160), input.due_date, input.owner_id || null, user.id, now());
  return id;
}
function editableProject(user, projectId) {
  const p = one('SELECT * FROM projects WHERE id=? AND deleted_at IS NULL', projectId || '');
  if (!p || !P.canViewProject(user, p.id)) throw new P.NotFound('المشروع غير موجود أو غير متاح لك');
  return p;
}
export function addMilestone(user, input) {
  const p = editableProject(user, input.project_id);
  if (!P.canEditProject(user, p)) throw new P.Forbidden('لا تملك صلاحية تعديل معالم هذا المشروع');
  const id = insertMilestone(user, { ...input, project_id: p.id });
  audit(user.id, 'milestone.create', id, { project_id: p.id, title: input.title });
  changed(P.recipientsForProject(p), 'project', p.id);
  return { result: decorateMilestone(one('SELECT * FROM project_milestones WHERE id=?', id)), undo: { tool: 'delete_milestone', input: { id } } };
}
export function updateMilestone(user, input) {
  const m = one('SELECT * FROM project_milestones WHERE id=? AND deleted_at IS NULL', input.id || '');
  if (!m) throw new P.NotFound('المعلم غير موجود');
  const p = editableProject(user, m.project_id);
  const onlyDone = Object.keys(input).every((k) => ['id', 'done'].includes(k));
  if (!P.canEditProject(user, p) && !(onlyDone && m.owner_id === user.id)) throw new P.Forbidden('لا تملك صلاحية تعديل هذا المعلم');
  const fields = {};
  if (input.title !== undefined) { const tt = String(input.title).trim(); if (tt.length < 2) throw new BadInput('عنوان المعلم مطلوب', 'title'); fields.title = tt.slice(0, 160); }
  if (input.due_date !== undefined) { if (!isDate(input.due_date)) throw new BadInput('تاريخ غير صالح', 'due_date'); fields.due_date = input.due_date; }
  if (input.owner_id !== undefined) { if (input.owner_id) checkStaff(input.owner_id, 'owner_id'); fields.owner_id = input.owner_id || null; }
  if (input.done !== undefined) fields.done_at = input.done ? (m.done_at || now()) : null;
  if (!Object.keys(fields).length) throw new BadInput('لا توجد حقول للتحديث');
  const before = Object.fromEntries(Object.keys(fields).map((k) => [k, m[k]]));
  const keys = Object.keys(fields);
  run(`UPDATE project_milestones SET ${keys.map((k) => `${k}=?`).join(',')} WHERE id=?`, ...keys.map((k) => fields[k]), m.id);
  audit(user.id, 'milestone.update', m.id, { before, after: fields });
  changed(P.recipientsForProject(p), 'project', p.id);
  const undoInput = { id: m.id };
  for (const [k, v] of Object.entries(before)) { if (k === 'done_at') undoInput.done = !!v; else undoInput[k] = v; }
  return { result: decorateMilestone(one('SELECT * FROM project_milestones WHERE id=?', m.id)), undo: { tool: 'update_milestone', input: undoInput } };
}
export function deleteMilestone(user, { id }) {
  const m = one('SELECT * FROM project_milestones WHERE id=? AND deleted_at IS NULL', id || '');
  if (!m) throw new P.NotFound('المعلم غير موجود');
  const p = editableProject(user, m.project_id);
  if (!P.canEditProject(user, p)) throw new P.Forbidden('لا تملك صلاحية تعديل معالم هذا المشروع');
  run('UPDATE project_milestones SET deleted_at=? WHERE id=?', now(), m.id);
  audit(user.id, 'milestone.delete', m.id, { title: m.title });
  changed(P.recipientsForProject(p), 'project', p.id);
  return { result: { id: m.id, title: m.title, deleted: true }, undo: { tool: '_restore_milestone', input: { id: m.id } } };
}
export function restoreMilestone(user, { id }) {
  const m = one('SELECT * FROM project_milestones WHERE id=? AND deleted_at IS NOT NULL', id || '');
  if (!m) throw new P.NotFound();
  const p = editableProject(user, m.project_id);
  if (!P.canEditProject(user, p)) throw new P.Forbidden();
  run('UPDATE project_milestones SET deleted_at=NULL WHERE id=?', m.id);
  changed(P.recipientsForProject(p), 'project', p.id);
  return { result: { id: m.id, restored: true } };
}

// ---------------- portfolio ----------------
export function projectStateKey(p) {
  if (p.delayed) return 'delayed';
  if (p.status === 'done') return 'done';
  if (p.status === 'cancelled') return 'cancelled';
  if (p.status === 'on_hold') return 'on_hold';
  if (p.at_risk) return 'at_risk';
  if (p.progress == null) return 'missing';
  return 'on_track';
}
// Strategic projects in the user's scope (SPMO & president: all; managers: their
// department's; others: the ones they take part in), with people, milestones,
// budget and progress vs the time-elapsed expectation.
export function portfolio(user, { department_id, status } = {}) {
  if (!P.isInternal(user)) throw new P.Forbidden();
  let rows = listProjects(user, { strategic: true, department_id: department_id || undefined, limit: 500 });
  const withState = rows.map((p) => {
    const allocs = all(`SELECT a.id,a.user_id,a.percent,a.status,a.role_ar,a.start_date,a.end_date,u.name_ar,u.name_en FROM project_allocations a JOIN users u ON u.id=a.user_id
                        WHERE a.project_id=? AND a.status IN ${LIVE} AND a.end_date>=? ORDER BY a.status='pending_manager', a.percent DESC`, p.id, today());
    return { ...p, state: projectStateKey(p), gap: p.progress != null && p.expected_progress != null && p.status === 'active' ? p.progress - p.expected_progress : null,
      team: allocs.map((a) => ({ id: a.id, user_id: a.user_id, name_ar: a.name_ar, name_en: a.name_en, percent: a.percent, status: a.status, role_ar: a.role_ar })),
      milestones: listMilestones(p.id).map((m) => ({ id: m.id, title: m.title, due_date: m.due_date, done: m.done, late: m.late })) };
  });
  const all0 = withState;
  if (status) rows = withState.filter((p) => (status === 'attention' ? ['delayed', 'at_risk'].includes(p.state) : p.state === status));
  else rows = withState;
  const sum = (arr, f) => arr.reduce((s, x) => s + (f(x) || 0), 0);
  const reported = rows.filter((p) => p.progress != null && p.status === 'active');
  const expectedOnes = rows.filter((p) => p.expected_progress != null && p.status === 'active');
  const byDept = {};
  for (const p of rows) {
    byDept[p.department_id] ??= { department_id: p.department_id, name_ar: p.dept_ar, name_en: p.dept_en, projects: 0, delayed: 0, at_risk: 0, budget: 0, fte: 0, progress_sum: 0, progress_n: 0, expected_sum: 0, expected_n: 0 };
    const d = byDept[p.department_id];
    d.projects++; if (p.state === 'delayed') d.delayed++; if (p.state === 'at_risk') d.at_risk++;
    d.budget += p.budget || 0; d.fte += p.fte || 0;
    if (p.progress != null) { d.progress_sum += p.progress; d.progress_n++; }
    if (p.expected_progress != null && p.status === 'active') { d.expected_sum += p.expected_progress; d.expected_n++; }
  }
  const t = today();
  return {
    scope: user.role === 'president' ? 'organisation' : P.isSpmo(user) ? 'portfolio' : P.managedDepartments(user).length ? 'department' : 'personal',
    can_create: P.isSpmo(user), generated_at: now(), date: t,
    projects: rows,
    departments: [...new Map(all0.map((p) => [p.department_id, { id: p.department_id, name_ar: p.dept_ar, name_en: p.dept_en }])).values()],
    by_department: Object.values(byDept).map((d) => ({ ...d, fte: round2(d.fte), avg_progress: d.progress_n ? Math.round(d.progress_sum / d.progress_n) : null, avg_expected: d.expected_n ? Math.round(d.expected_sum / d.expected_n) : null })),
    totals: {
      projects: rows.length, delayed: rows.filter((p) => p.state === 'delayed').length, at_risk: rows.filter((p) => p.state === 'at_risk').length,
      on_track: rows.filter((p) => p.state === 'on_track').length, missing: rows.filter((p) => p.state === 'missing').length,
      budget: sum(rows, (p) => p.budget), fte: round2(sum(rows, (p) => p.fte)), people: new Set(rows.flatMap((p) => p.team.filter((m) => m.status === 'active').map((m) => m.user_id))).size,
      pending_allocations: sum(rows, (p) => p.pending_allocations),
      avg_progress: reported.length ? Math.round(sum(reported, (p) => p.progress) / reported.length) : null,
      avg_expected: expectedOnes.length ? Math.round(sum(expectedOnes, (p) => p.expected_progress) / expectedOnes.length) : null,
      reported: reported.length, milestones_late: sum(rows, (p) => p.milestones_late),
      tasks_overdue: sum(rows, (p) => p.tasks_overdue),
    },
    source: 'projects (strategic), project_allocations, project_milestones, tasks',
  };
}

// What the portfolio wizard needs: departments (with their managers), sponsors.
export function portfolioMeta(user) {
  if (!P.isInternal(user)) throw new P.Forbidden();
  const depts = all('SELECT id,name_ar,name_en,parent_id FROM departments WHERE is_external=0 ORDER BY name_ar');
  return {
    can_create: P.isSpmo(user),
    departments: depts.map((d) => ({ ...d, managers: all("SELECT id,name_ar,name_en FROM users WHERE department_id=? AND role IN ('manager','president') AND active=1 AND user_type='staff'", d.id), people: one("SELECT COUNT(*) n FROM users WHERE department_id=? AND active=1 AND user_type='staff'", d.id).n })),
    sponsors: all(`SELECT u.id,u.name_ar,u.name_en,u.title_ar,u.title_en FROM users u JOIN user_caps c ON c.user_id=u.id AND c.cap=? WHERE u.active=1 AND u.user_type='staff' ORDER BY u.name_ar`, P.SPMO_CAP),
  };
}

// Work given to me by other people: tasks (open + done this week) and allocations.
export function myAssignments(user) {
  if (!P.isInternal(user)) throw new P.Forbidden();
  const t = today();
  const tasks = listTasks(user, { assigned_by_others: true, limit: 300 });
  const week = daysAgoIso(7);
  const open = tasks.filter((x) => x.status !== 'done');
  const done = tasks.filter((x) => x.status === 'done' && (x.completed_at || '') >= week);
  const allocations = all(`SELECT a.* FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL
                           WHERE a.user_id=? AND a.allocated_by!=? AND a.status IN ${LIVE} AND a.end_date>=? ORDER BY ${ALLOC_ORDER}, a.start_date`, user.id, user.id, t).map((a) => decorateAllocation(a, user));
  const since = daysAgoIso(3);
  return {
    tasks: [...open, ...done], allocations,
    counts: {
      open: open.length, overdue: open.filter((x) => x.overdue).length, done_week: done.length,
      new: open.filter((x) => (x.assigned_at || '') >= since).length,
      pending_allocations: allocations.filter((a) => a.status === 'pending_manager').length,
      active_allocations: allocations.filter((a) => a.status === 'active').length,
      load_now: loadAt(user.id, t),
    },
    generated_at: now(), source: 'tasks (assigned_by), project_allocations',
  };
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
  // strategic execution: allocation decisions waiting for me, and work newly given to me
  const internal = P.isInternal(user);
  const decisions = internal ? listAllocations(user, { scope: 'decide' }) : [];
  const since = daysAgoIso(3);
  const newTasks = internal ? myTasks.filter((x) => x.assigned_by && x.assigned_by !== user.id && x.status === 'todo' && (x.assigned_at || '') >= since) : [];
  const newAllocs = internal ? all(`SELECT a.*, p.name project_name FROM project_allocations a JOIN projects p ON p.id=a.project_id AND p.deleted_at IS NULL
                          WHERE a.user_id=? AND a.allocated_by!=? AND a.status IN ${LIVE} AND a.created_at>=? ORDER BY a.created_at DESC`, user.id, user.id, since) : [];
  return {
    date: t, generated_at: now(),
    counts: { open_tasks: myTasks.length, due_today: dueToday.length, overdue: overdue.length, events_today: eventsToday.length, projects: projects.length, delayed_projects: delayed.length, alerts: alerts.length, pending_reviews: pendingReviews.length, pending_allocations: decisions.length, new_assignments: newTasks.length + newAllocs.length },
    due_today: dueToday, overdue, priorities, events_today: eventsToday,
    delayed_projects: delayed, projects_missing_progress: noProgress, alerts,
    needs_action: [
      ...pendingReviews.map((r) => ({ type: 'office_run', id: r.id, title: `مراجعة عمل الوكيل «${r.name}»`, reason: 'review' })),
      ...decisions.map((a) => ({ type: 'allocation', id: a.id, project_id: a.project_id, title: `تخصيص ${a.percent}% من وقت ${a.person_ar} — ${a.project_name}`, title_en: `${a.percent}% of ${a.person_en}’s time — ${a.project_name}`, reason: 'allocation_decision', by_ar: a.allocated_by_ar, by_en: a.allocated_by_en })),
      ...newTasks.map((x) => ({ type: 'task', id: x.id, project_id: x.project_id, title: x.title, reason: 'assigned', by_ar: x.assigner_ar, by_en: x.assigner_en })),
      ...newAllocs.map((a) => ({ type: 'allocation', id: a.id, project_id: a.project_id, title: `${a.percent}% من وقتك — ${a.project_name}`, title_en: `${a.percent}% of your time — ${a.project_name}`, reason: a.status === 'pending_manager' ? 'allocation_pending' : 'allocation_new' })),
      ...overdue.map((x) => ({ type: 'task', id: x.id, title: x.title, reason: 'overdue' })),
      ...delayed.map((p) => ({ type: 'project', id: p.id, title: p.name, reason: 'delayed' })),
      ...noProgress.map((p) => ({ type: 'project', id: p.id, title: p.name, reason: 'missing_progress' })),
    ],
    source: 'portal.db (projects, tasks, events, alerts, project_allocations)',
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
