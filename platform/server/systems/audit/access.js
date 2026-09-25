// Internal Audit — who may see what. Every list, count, card, tool and alert
// builds on these scope helpers so that the same rule applies everywhere.
//
//  • Internal Audit (audit.auditor / audit.head): everything inside IA.
//  • Audit committee (audit.committee): the plan, engagements, issued reports
//    and the findings of issued reports (no requests, no working papers).
//  • Auditee managers (role manager over the auditee department): launched
//    engagements on their departments, their departments' ISSUED findings,
//    information requests addressed to them, external requests assigned to them.
//  • Action owners: the issued findings whose action plan is assigned to them.
//  • External auditor (audit.external, external identity): only his own
//    external requests and their released responses.
//  • Everyone else: nothing (404 on direct access).
// The platform admin flag (is_admin) is configuration only and unlocks nothing here.
import { one, all, hasCap, isStaff, isExternal, managedDepartments, usersWithCap, inList } from '../kit.js';

export const KEY = 'audit';

export const isIA = (u) => isStaff(u) && hasCap(u, 'audit.auditor', 'audit.head');
export const isHead = (u) => isStaff(u) && hasCap(u, 'audit.head');
export const isCommittee = (u) => isStaff(u) && hasCap(u, 'audit.committee');
export const isExtAuditor = (u) => isExternal(u) && hasCap(u, 'audit.external');
// Auditee scope: department managers only (the president's organisation-wide
// monitoring scope is served through the committee view, read-only).
export const auditeeDepts = (u) => (isStaff(u) && u.role === 'manager' ? managedDepartments(u) : []);
export const isAuditeeOf = (u, deptId) => auditeeDepts(u).includes(deptId);

// ---------------- scopes (SQL fragments) ----------------
export function findingScope(u, f = 'f') {
  if (!isStaff(u)) return { sql: '0', params: [] };
  if (isIA(u)) return { sql: `${f}.withdrawn_at IS NULL`, params: [] };
  const parts = []; const params = [];
  const depts = auditeeDepts(u);
  if (depts.length) { parts.push(`${f}.department_id IN (${inList(depts)})`); params.push(...depts); }
  parts.push(`EXISTS (SELECT 1 FROM audit_actions sa WHERE sa.finding_id=${f}.id AND sa.owner_id=?)`); params.push(u.id);
  if (isCommittee(u)) parts.push(`EXISTS (SELECT 1 FROM audit_engagements se WHERE se.id=${f}.engagement_id AND se.report_issued_at IS NOT NULL)`);
  return { sql: `(${f}.withdrawn_at IS NULL AND ${f}.status<>'draft' AND (${parts.join(' OR ')}))`, params };
}

export function engagementScope(u, e = 'e') {
  if (!isStaff(u)) return { sql: '0', params: [] };
  if (isIA(u) || isCommittee(u)) return { sql: '1', params: [] };
  const depts = auditeeDepts(u);
  if (!depts.length) return { sql: '0', params: [] };
  return { sql: `(${e}.phase<>'planned' AND ${e}.department_id IN (${inList(depts)}))`, params: depts };
}

export function requestScope(u, r = 'r') {
  if (!isStaff(u)) return { sql: '0', params: [] };
  if (isIA(u)) return { sql: '1', params: [] };
  return { sql: `${r}.to_user_id=?`, params: [u.id] };
}

export function extScope(u, x = 'x') {
  if (isExtAuditor(u)) return { sql: `${x}.requester_id=?`, params: [u.id] };
  if (!isStaff(u)) return { sql: '0', params: [] };
  if (isIA(u)) return { sql: '1', params: [] };
  return { sql: `(${x}.assigned_to=? AND ${x}.status<>'submitted')`, params: [u.id] };
}

export const canSeeFinding = (u, id) => { const s = findingScope(u); return !!one(`SELECT 1 FROM audit_findings f WHERE f.id=? AND ${s.sql}`, id, ...s.params); };
export const canSeeEngagement = (u, id) => { const s = engagementScope(u); return !!one(`SELECT 1 FROM audit_engagements e WHERE e.id=? AND ${s.sql}`, id, ...s.params); };
export const canSeeRequest = (u, id) => { const s = requestScope(u); return !!one(`SELECT 1 FROM audit_requests r WHERE r.id=? AND ${s.sql}`, id, ...s.params); };
export const canSeeExt = (u, id) => { const s = extScope(u); return !!one(`SELECT 1 FROM audit_ext_requests x WHERE x.id=? AND ${s.sql}`, id, ...s.params); };

// ---------------- people ----------------
const staffOnly = (ids) => (ids.length ? all(`SELECT id FROM users WHERE active=1 AND user_type='staff' AND id IN (${inList(ids)})`, ...ids).map((r) => r.id) : []);
export const iaIds = () => staffOnly([...new Set([...usersWithCap('audit.auditor'), ...usersWithCap('audit.head')])]);
export const headIds = () => staffOnly(usersWithCap('audit.head'));
export const committeeIds = () => staffOnly(usersWithCap('audit.committee'));

// Department managers (role manager) whose scope covers the department.
export function managersOf(deptId) {
  return all("SELECT id,role,department_id,user_type FROM users WHERE active=1 AND user_type='staff' AND role='manager'")
    .filter((m) => managedDepartments(m).includes(deptId)).map((m) => m.id);
}
// The addressee for information requests: the manager of the department itself,
// else the nearest manager above it (e.g. Procurement → Finance).
export function auditeeManager(deptId) {
  let d = deptId; const seen = new Set();
  while (d && !seen.has(d)) {
    seen.add(d);
    const m = one("SELECT id FROM users WHERE department_id=? AND role='manager' AND active=1 AND user_type='staff' ORDER BY name_ar LIMIT 1", d);
    if (m) return m.id;
    d = one('SELECT parent_id FROM departments WHERE id=?', d)?.parent_id;
  }
  return null;
}

// Who is affected by a change (realtime refresh only — clients refetch through
// the authorised APIs, so this list must never be wider than the read scope).
export function findingAudience(f) {
  const ids = [...iaIds()];
  if (f.status !== 'draft' && !f.withdrawn_at) {
    ids.push(...managersOf(f.department_id));
    const a = one('SELECT owner_id FROM audit_actions WHERE finding_id=?', f.id);
    if (a) ids.push(a.owner_id);
    if (one('SELECT 1 FROM audit_engagements WHERE id=? AND report_issued_at IS NOT NULL', f.engagement_id)) ids.push(...committeeIds());
  }
  return [...new Set(ids)];
}
export function engagementAudience(e) {
  const ids = [...iaIds(), ...committeeIds()];
  if (e.phase !== 'planned') ids.push(...managersOf(e.department_id));
  return [...new Set(ids)];
}
