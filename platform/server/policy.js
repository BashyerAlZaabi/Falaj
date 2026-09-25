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

// ----- strategic portfolio (SPMO = strategy.admin) -----
// The SPMO sees and steers every STRATEGIC project across departments, but never
// other departments' non-strategic work. External identities are never SPMO.
export const SPMO_CAP = 'strategy.admin';
export const isInternal = (user) => !!user && user.user_type !== 'external';
export function isSpmo(user) {
  if (!isInternal(user)) return false;
  if (Array.isArray(user.caps)) return user.caps.includes(SPMO_CAP);
  return !!one('SELECT 1 FROM user_caps WHERE user_id=? AND cap=?', user.id, SPMO_CAP);
}
export const spmoUserIds = () => all("SELECT u.id FROM users u JOIN user_caps c ON c.user_id=u.id AND c.cap=? WHERE u.active=1 AND u.user_type='staff'", SPMO_CAP).map((r) => r.id);
// Nearest line managers of a person: managers of their own department (never the
// person themself), else of the parent department, …, else the president.
export function lineManagers(userId) {
  const u = one('SELECT id, department_id FROM users WHERE id=?', userId);
  if (!u) return [];
  const seen = new Set();
  let dept = u.department_id;
  while (dept && !seen.has(dept)) {
    seen.add(dept);
    const ms = all("SELECT id FROM users WHERE role='manager' AND active=1 AND user_type='staff' AND department_id=? AND id!=?", dept, userId).map((r) => r.id);
    if (ms.length) return ms;
    dept = one('SELECT parent_id FROM departments WHERE id=?', dept)?.parent_id;
  }
  return all("SELECT id FROM users WHERE role='president' AND active=1 AND id!=?", userId).map((r) => r.id);
}
// Everyone whose management scope covers a department (managers up the tree + president).
export function managersOf(departmentId) {
  return all("SELECT id,role,department_id,user_type FROM users WHERE role IN ('manager','president') AND active=1 AND user_type='staff'")
    .filter((u) => managedDepartments(u).includes(departmentId)).map((u) => u.id);
}

// ----- projects -----
export function projectScopeSql(user, alias = 'p') {
  const depts = managedDepartments(user);
  return {
    sql: `(${alias}.deleted_at IS NULL AND (${alias}.department_id IN (${inList(depts)})
          OR ${alias}.owner_id = ?
          OR EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=${alias}.id AND pm.user_id=?)
          OR EXISTS (SELECT 1 FROM tasks t WHERE t.project_id=${alias}.id AND t.assignee_id=? AND t.deleted_at IS NULL)
          OR (${alias}.is_strategic=1 AND ${alias}.sponsor_id = ?)
          OR EXISTS (SELECT 1 FROM project_allocations pa WHERE pa.project_id=${alias}.id AND pa.user_id=? AND pa.status IN ('pending_manager','active'))${isSpmo(user) ? `
          OR ${alias}.is_strategic=1` : ''}))`,
    params: [...depts, user.id, user.id, user.id, user.id, user.id],
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
  if (project.is_strategic && isSpmo(user)) return true; // SPMO steers strategic projects
  return !!one('SELECT 1 FROM project_members WHERE project_id=? AND user_id=?', project.id, user.id);
}
export function canDeleteProject(user, project) {
  return project.owner_id === user.id || (user.role !== 'employee' && managedDepartments(user).includes(project.department_id))
    || (!!project.is_strategic && isSpmo(user) && project.created_by === user.id);
}
// Governance fields of a strategic project (designation, sponsor, owner) are the SPMO's.
export const canGovernProject = (user, project) => !!project && !project.deleted_at && isSpmo(user);

// ----- tasks -----
export function taskScopeSql(user, alias = 't') {
  const depts = managedDepartments(user);
  // Strategic work only: the SPMO sees every strategic task; managers see strategic
  // tasks given to their own staff (wherever the project sits); sponsors and
  // actively-allocated people see the tasks of their project. Non-strategic rules are unchanged.
  const strategic = `EXISTS (SELECT 1 FROM projects sp WHERE sp.id=${alias}.project_id AND sp.is_strategic=1 AND sp.deleted_at IS NULL`;
  return {
    sql: `(${alias}.deleted_at IS NULL AND (${alias}.department_id IN (${inList(depts)})
          OR ${alias}.assignee_id = ? OR ${alias}.created_by = ?
          OR (${alias}.project_id IS NOT NULL AND EXISTS (SELECT 1 FROM project_members pm WHERE pm.project_id=${alias}.project_id AND pm.user_id=?))
          OR (${alias}.project_id IS NOT NULL AND ${strategic} AND (sp.sponsor_id=?
              OR EXISTS (SELECT 1 FROM project_allocations pa WHERE pa.project_id=sp.id AND pa.user_id=? AND pa.status='active')
              OR EXISTS (SELECT 1 FROM users au WHERE au.id=${alias}.assignee_id AND au.department_id IN (${inList(depts)})))))${isSpmo(user) ? `
          OR (${alias}.project_id IS NOT NULL AND ${strategic}))` : ''}))`,
    params: [...depts, user.id, user.id, user.id, user.id, user.id, ...depts],
  };
}
export function canViewTask(user, taskId) {
  const s = taskScopeSql(user);
  return !!one(`SELECT 1 FROM tasks t WHERE t.id=? AND ${s.sql}`, taskId, ...s.params);
}
export function canEditTask(user, task) {
  if (!task || task.deleted_at) return false;
  if (task.assignee_id === user.id || task.created_by === user.id) return true;
  if (managedDepartments(user).includes(task.department_id)) return true;
  if (!task.project_id) return false;
  const p = one('SELECT id,owner_id,sponsor_id,is_strategic,deleted_at FROM projects WHERE id=?', task.project_id);
  if (!p?.is_strategic || p.deleted_at) return false;
  return isSpmo(user) || p.owner_id === user.id || p.sponsor_id === user.id;
}
// Who may this user assign work to?
export function canAssignTo(user, assigneeId) {
  if (assigneeId === user.id) return true;
  const a = one("SELECT department_id FROM users WHERE id=? AND active=1 AND user_type='staff'", assigneeId);
  if (!a) return false;
  return managedDepartments(user).includes(a.department_id);
}
// Assignment inside a project: the base rule, plus for STRATEGIC projects the SPMO
// may assign any internal staff member, and the project owner / sponsor / managers
// of its department may assign people actively allocated to that project.
export function canAssignInProject(user, assigneeId, project) {
  if (canAssignTo(user, assigneeId)) return true;
  if (!project?.is_strategic || !isInternal(user)) return false;
  if (!one("SELECT 1 FROM users WHERE id=? AND active=1 AND user_type='staff'", assigneeId)) return false;
  if (isSpmo(user)) return true;
  if (project.owner_id === user.id || project.sponsor_id === user.id || managedDepartments(user).includes(project.department_id)) {
    return !!one("SELECT 1 FROM project_allocations WHERE project_id=? AND user_id=? AND status='active'", project.id, assigneeId);
  }
  return false;
}
// Allocations: proposed on strategic projects by the SPMO or managers of the
// project's department; decided by a manager of the person (never the person).
export function canProposeAllocation(user, project) {
  if (!project?.is_strategic || project.deleted_at || !isInternal(user)) return false;
  return isSpmo(user) || managedDepartments(user).includes(project.department_id);
}
export function canDecideAllocation(user, alloc) {
  if (!alloc || !isInternal(user) || alloc.user_id === user.id) return false;
  const person = one('SELECT department_id FROM users WHERE id=?', alloc.user_id);
  return !!person && managedDepartments(user).includes(person.department_id);
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
  const sp = p.is_strategic === undefined ? one('SELECT is_strategic,sponsor_id FROM projects WHERE id=?', p.id) : p;
  if (sp?.is_strategic) {
    // strategic: the SPMO, the sponsor, and the people allocated to it
    for (const id of spmoUserIds()) ids.add(id);
    if (sp.sponsor_id) ids.add(sp.sponsor_id);
    for (const r of all("SELECT DISTINCT user_id FROM project_allocations WHERE project_id=? AND status IN ('pending_manager','active')", p.id)) ids.add(r.user_id);
  }
  ids.delete(null); ids.delete(undefined);
  return [...ids];
}
export function recipientsForTask(t) {
  if (!t) return [];
  const ids = new Set([t.assignee_id, t.created_by]);
  if (t.assigned_by) ids.add(t.assigned_by);
  if (t.project_id) for (const r of all('SELECT user_id FROM project_members WHERE project_id=?', t.project_id)) ids.add(r.user_id);
  for (const u of all("SELECT id,role,department_id FROM users WHERE role IN ('manager','president') AND active=1")) {
    if (managedDepartments(u).includes(t.department_id)) ids.add(u.id);
  }
  const p = t.project_id ? one('SELECT id,owner_id,sponsor_id,is_strategic FROM projects WHERE id=?', t.project_id) : null;
  if (p?.is_strategic) {
    // strategic: the SPMO, sponsor, owner, and the managers of the assignee (who see their staff's strategic work)
    for (const id of spmoUserIds()) ids.add(id);
    if (p.sponsor_id) ids.add(p.sponsor_id);
    ids.add(p.owner_id);
    const a = one('SELECT department_id FROM users WHERE id=?', t.assignee_id);
    if (a) for (const id of managersOf(a.department_id)) ids.add(id);
  }
  ids.delete(null); ids.delete(undefined);
  return [...ids];
}
// Everyone concerned by an allocation: the person, their managers, the proposer,
// the project's people and (strategic) the SPMO.
export function recipientsForAllocation(a) {
  if (!a) return [];
  const ids = new Set([a.user_id, a.allocated_by, a.decided_by]);
  const person = one('SELECT department_id FROM users WHERE id=?', a.user_id);
  if (person) for (const id of managersOf(person.department_id)) ids.add(id);
  const p = one('SELECT * FROM projects WHERE id=?', a.project_id);
  for (const id of recipientsForProject(p)) ids.add(id);
  ids.delete(null); ids.delete(undefined);
  return [...ids];
}
