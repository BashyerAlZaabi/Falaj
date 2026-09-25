// Server-side authorization. Every read/write/search goes through these helpers.
// Scopes:
//  - employee : own work (assigned / created / member projects / own documents)
//  - manager  : everything in own department subtree + own work
//  - president: organisation-wide monitoring scope (outside Vault only)
import { all, one } from './db.js';

export class Forbidden extends Error {
  constructor(message = 'غير مصرّح لك بهذا الإجراء') { super(message); this.status = 403; this.code = 'forbidden'; }
}
export class NotFound extends Error {
  constructor(message = 'العنصر غير موجود أو غير متاح لك') { super(message); this.status = 404; this.code = 'not_found'; }
}

export function deptSubtree(rootId) {
  const rows = all('SELECT id,parent_id FROM departments');
  const out = new Set([rootId]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const r of rows) if (r.parent_id && out.has(r.parent_id) && !out.has(r.id)) { out.add(r.id); grew = true; }
  }
  return [...out];
}

export function managedDepartments(user) {
  if (!user || user.user_type === 'external') return []; // external organisations never manage internal data
  if (user.role === 'president') return all('SELECT id FROM departments WHERE is_external=0').map((r) => r.id);
  if (user.role === 'manager') return deptSubtree(user.department_id);
  return [];
}

const inList = (arr) => (arr.length ? arr.map(() => '?').join(',') : "''");

// ----- projects -----
export function projectScopeSql(user, alias = 'p') {
  const depts = managedDepartments(user);
  return {
    sql: `(${alias}.deleted_at IS NULL AND (${alias}.department_id IN (${inList(depts)})
          OR ${alias}.owner_id = ?
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=${alias}.id AND pm.user_id=?)
          OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id=${alias}.id AND t.assignee_id=? AND t.deleted_at IS NULL)))`,
    params: [...depts, user.id, user.id, user.id],
  };
}
export function canViewProject(user, projectId) {
  const s = projectScopeSql(user);
  return !!one(`SELECT 1 FROM projects p WHERE p.id=? AND ${s.sql}`, projectId, ...s.params);
}
export function canEditProject(user, project) {
  if (!project || project.deleted_at) return false;
  if (managedDepartments(user).includes(project.department_id)) return true;
  if (project.owner_id === user.id) return true;
  return !!one('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', project.id, user.id);
}
export function canDeleteProject(user, project) {
  return project.owner_id === user.id || (user.role !== 'employee' && managedDepartments(user).includes(project.department_id));
}

// ----- tasks -----
export function taskScopeSql(user, alias = 't') {
  const depts = managedDepartments(user);
  return {
    sql: `(${alias}.deleted_at IS NULL AND (${alias}.department_id IN (${inList(depts)})
          OR ${alias}.assignee_id = ? OR ${alias}.created_by = ?
          OR (${alias}.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=${alias}.project_id AND pm.user_id=?))))`,
    params: [...depts, user.id, user.id, user.id],
  };
}
export function canViewTask(user, taskId) {
  const s = taskScopeSql(user);
  return !!one(`SELECT 1 FROM tasks t WHERE t.id=? AND ${s.sql}`, taskId, ...s.params);
}
export function canEditTask(user, task) {
  if (!task || task.deleted_at) return false;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  return managedDepartments(user).includes(task.department_id);
}
// Who may this user assign work to?
export function canAssignTo(user, assigneeId) {
  if (assigneeId === user.id) return true;
  const a = one("SELECT department_id FROM users WHERE id=? AND active=1 AND user_type='staff'", assigneeId);
  if (!a) return false;
  return managedDepartments(user).includes(a.department_id);
}
export function assignableUsers(user) {
  const depts = managedDepartments(user);
  return all(`SELECT id,name_ar,name_en,department_id,role FROM users WHERE active=1 AND user_type='staff' AND (id=? OR department_id IN (${inList(depts)})) ORDER BY name_ar`, user.id, ...depts);
}

// ----- events -----
export function eventScopeSql(user, alias = 'e') {
  return {
    sql: `(${alias}.owner_id=? OR EXISTS (SELECT 1 FROM event_attendees ea WHERE ea.event_id=${alias}.id AND ea.user_id=?))`,
    params: [user.id, user.id],
  };
}

// ----- documents -----
export function documentScopeSql(user, alias = 'd') {
  return {
    sql: `(${alias}.deleted_at IS NULL AND (${alias}.owner_id=? OR EXISTS (SELECT 1 FROM document_shares ds WHERE ds.document_id=${alias}.id AND ds.user_id=?)))`,
    params: [user.id, user.id],
  };
}
export function documentAccess(user, docId) {
  const d = one('SELECT * FROM documents WHERE id=? AND deleted_at IS NULL', docId);
  if (!d) return { doc: null, level: null };
  if (d.owner_id === user.id) return { doc: d, level: 'owner' };
  const sh = one('SELECT permission FROM document_shares WHERE document_id=? AND user_id=?', docId, user.id);
  return sh ? { doc: d, level: sh.permission } : { doc: null, level: null };
}

// ----- apps -----
// Visibility in My Apps only. It does NOT grant data access: each app's API
// still applies the scopes above.
export function visibleApps(user) {
  if (user.user_type === 'external') return []; // external users only see their portal systems
  const depts = new Set([user.department_id, ...managedDepartments(user)]);
  return all('SELECT * FROM apps ORDER BY sort').filter((a) => {
    const roles = JSON.parse(a.roles);
    if (!roles.includes(user.role) && !(roles.includes('admin') && user.is_admin)) return false;
    return !a.department_id || depts.has(a.department_id);
  });
}

// Recipients for realtime notifications about an entity (never broadcast to all).
export function recipientsForProject(p) {
  if (!p) return [];
  const ids = new Set([p.owner_id]);
  for (const r of all('SELECT user_id FROM project_members WHERE project_id=?', p.id)) ids.add(r.user_id);
  for (const r of all('SELECT DISTINCT assignee_id FROM tasks WHERE project_id=? AND deleted_at IS NULL', p.id)) ids.add(r.assignee_id);
  for (const u of all("SELECT id,role,department_id FROM users WHERE role IN ('manager','president') AND active=1")) {
    if (managedDepartments(u).includes(p.department_id)) ids.add(u.id);
  }
  return [...ids];
}
export function recipientsForTask(t) {
  if (!t) return [];
  const ids = new Set([t.assignee_id, t.created_by]);
  if (t.project_id) for (const r of all('SELECT user_id FROM project_members WHERE project_id=?', t.project_id)) ids.add(r.user_id);
  for (const u of all("SELECT id,role,department_id FROM users WHERE role IN ('manager','president') AND active=1")) {
    if (managedDepartments(u).includes(t.department_id)) ids.add(u.id);
  }
  return [...ids];
}
