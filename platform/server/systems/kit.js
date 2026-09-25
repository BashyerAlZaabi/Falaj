// Shared server kit for enterprise system modules: authorization helpers,
// org lookups, validation, routing, audit/access logging, realtime, alerts,
// workflow transitions, AI data-policy checks and seeding helpers.
// System modules import from here instead of editing shared platform files.
import express from 'express';
import { db, one, all, run, uid, now, today, json, tx, audit as auditRow } from '../db.js';
import { Forbidden, NotFound, managedDepartments, deptSubtree } from '../policy.js';
import { notify } from '../bus.js';
import { validate } from '../lib/validate.js';

export { db, one, all, run, uid, now, today, json, tx, Forbidden, NotFound, managedDepartments, deptSubtree };

export class BadRequest extends Error { constructor(message = 'مدخلات غير صالحة') { super(message); this.status = 400; this.code = 'bad_input'; } }
export class Conflict extends Error { constructor(message = 'تعارض مع الحالة الحالية') { super(message); this.status = 409; this.code = 'conflict'; } }

// ---------------- identity & capabilities ----------------
export const isExternal = (user) => user?.user_type === 'external';
export const isStaff = (user) => !!user && !isExternal(user);
export const hasCap = (user, ...caps) => !!user && caps.some((c) => (user.caps || []).includes(c));
export function requireCap(user, ...caps) {
  if (!hasCap(user, ...caps)) throw new Forbidden('هذا الإجراء يتطلب صلاحية خاصة بالنظام لم تُمنح لحسابك');
}
export function requireStaff(user) { if (!isStaff(user)) throw new Forbidden('متاح لموظفي الجهة فقط'); }
export const usersWithCap = (cap) => all("SELECT u.id FROM user_caps c JOIN users u ON u.id=c.user_id WHERE c.cap=? AND u.active=1", cap).map((r) => r.id);

// ---------------- org lookups ----------------
const USER_BRIEF = `u.id,u.username,u.name_ar,u.name_en,u.role,u.department_id,u.title_ar,u.title_en,u.user_type,d.name_ar AS dept_ar,d.name_en AS dept_en`;
export const userBrief = (id) => (id ? one(`SELECT ${USER_BRIEF} FROM users u JOIN departments d ON d.id=u.department_id WHERE u.id=?`, id) : null);
export const deptBrief = (id) => (id ? one('SELECT id,name_ar,name_en,parent_id,is_external FROM departments WHERE id=?', id) : null);
export const internalDepartments = () => all('SELECT id,name_ar,name_en,parent_id FROM departments WHERE is_external=0 ORDER BY name_ar');
export function staffUsers({ departmentIds } = {}) {
  const rows = all(`SELECT ${USER_BRIEF} FROM users u JOIN departments d ON d.id=u.department_id WHERE u.active=1 AND u.user_type='staff' ORDER BY u.name_ar`);
  return departmentIds ? rows.filter((r) => departmentIds.includes(r.department_id)) : rows;
}
export const userIdByUsername = (username) => one('SELECT id FROM users WHERE username=?', username)?.id || null;

// Nearest manager above a staff member: a manager of the same department (not
// the person), else the manager of the parent department, … up to the president.
export function lineManager(userId) {
  const u = one('SELECT id,department_id FROM users WHERE id=?', userId);
  if (!u) return null;
  let dept = u.department_id;
  const seen = new Set();
  while (dept && !seen.has(dept)) {
    seen.add(dept);
    const m = one("SELECT id FROM users WHERE department_id=? AND role IN ('manager','president') AND active=1 AND user_type='staff' AND id<>? ORDER BY role='president', name_ar LIMIT 1", dept, userId);
    if (m) return m.id;
    dept = one('SELECT parent_id FROM departments WHERE id=?', dept)?.parent_id;
  }
  return one("SELECT id FROM users WHERE role='president' AND active=1 AND id<>? LIMIT 1", userId)?.id || null;
}
// Is `manager` responsible for `userId` (department scope, never for themselves)?
export function isManagerOf(manager, userId) {
  if (!manager || manager.id === userId || isExternal(manager)) return false;
  const u = one("SELECT department_id FROM users WHERE id=? AND user_type='staff'", userId);
  return !!u && managedDepartments(manager).includes(u.department_id);
}
export function reportsOf(manager) {
  const depts = managedDepartments(manager);
  return staffUsers({ departmentIds: depts }).filter((u) => u.id !== manager.id);
}

// ---------------- validation (JSON-schema subset) ----------------
export const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
export const str = (description = '', extra = {}) => ({ type: 'string', description, ...extra });
export const int = (description = '', extra = {}) => ({ type: 'integer', description, ...extra });
export const num = (description = '', extra = {}) => ({ type: 'number', description, ...extra });
export const bool = (description = '') => ({ type: 'boolean', description });
export const arr = (items, extra = {}) => ({ type: 'array', items, ...extra });
export const obj = (description = '') => ({ type: 'object', description });
export const date = (description = 'YYYY-MM-DD') => ({ type: 'string', format: 'date', description });
export function check(schema, body) {
  const errs = validate(schema, body ?? {});
  if (errs.length) throw new BadRequest(`مدخلات غير صالحة: ${errs.join('; ')}`);
  return body ?? {};
}
export const clean = (s, max = 4000) => String(s ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);

// ---------------- routing ----------------
export const router = () => express.Router();
// wrap(handler): the handler's return value is sent as JSON; thrown errors map
// to their status (403/404/400/409) with an Arabic message.
export const wrap = (fn) => (req, res) => Promise.resolve().then(() => fn(req, res)).then((out) => {
  if (out !== undefined && !res.headersSent) res.json(out);
}).catch((e) => {
  const status = e.status || 500;
  if (status === 500) console.error('[system]', req.originalUrl, e);
  if (!res.headersSent) res.status(status).json({ error: e.code || 'error', message: status === 500 ? 'خطأ غير متوقع في الخادم' : e.message });
});
// Destructive/permission-changing endpoints require an explicit confirm flag
// set by the UI after a confirmation dialog.
export function requireConfirm(body, message = 'هذا الإجراء يتطلب تأكيداً صريحاً') {
  if (body?.confirm !== true) { const e = new Error(message); e.status = 428; e.code = 'confirmation_required'; throw e; }
}

// ---------------- audit, access log, realtime, alerts ----------------
export const audit = (user, action, target, detail) => auditRow(user?.id ?? user ?? null, action, target, detail);
export function logAccess(user, system, recordType, recordId, action = 'view') {
  run('INSERT INTO access_log (id,user_id,system,record_type,record_id,action) VALUES (?,?,?,?,?,?)', uid('ax_'), user.id, system, recordType, recordId, action);
}
export function accessLog(system, recordType, recordId, limit = 50) {
  return all(`SELECT a.user_id, a.action, a.at, u.name_ar, u.name_en FROM access_log a JOIN users u ON u.id=a.user_id
    WHERE a.system=? AND a.record_type=? AND a.record_id=? ORDER BY a.at DESC LIMIT ?`, system, recordType, recordId, limit);
}
// Realtime: tell these users that something in <system> changed (clients refetch
// through authorised APIs — no data is pushed).
export function changed(system, userIds, id = null) {
  notify([...new Set((userIds || []).filter(Boolean))], { type: 'changed', entity: `sys:${system}`, id });
}
export function alert(userId, { level = 'info', title, body = '', system, id = null }) {
  if (!userId || !title) return;
  run('INSERT INTO alerts (id,user_id,level,title,body,entity,entity_id) VALUES (?,?,?,?,?,?,?)', uid('al_'), userId, level, clean(title, 200), clean(body, 500), system ? `sys:${system}` : null, id);
  notify([userId], { type: 'changed', entity: 'alert' });
}

// ---------------- workflow ----------------
// allowed: { fromStatus: [toStatus, …] }
export function transition(current, to, allowed, labels = {}) {
  if (!(allowed[current] || []).includes(to)) throw new Conflict(`لا يمكن الانتقال من «${labels[current] || current}» إلى «${labels[to] || to}»`);
  return to;
}

// ---------------- AI data policy ----------------
// Domain policy: allowed (Ask AI/MCP may read), opt_in (only when the user enabled
// it for that system in the Integration & Control Center), off (never; locked
// domains cannot be switched on by anyone).
export function domainPolicy(domainKey) { return one('SELECT * FROM data_domains WHERE key=?', domainKey); }
export function aiAllowed(user, domainKey) {
  const d = domainPolicy(domainKey);
  if (!d) return false;
  if (d.ai_policy === 'allowed') return true;
  if (d.ai_policy === 'off') return false;
  return !!one('SELECT ai_enabled FROM user_system_prefs WHERE user_id=? AND system=?', user.id, d.system)?.ai_enabled;
}

// ---------------- dates, numbers, text ----------------
export const day = (n = 0, base = new Date()) => { const d = new Date(base); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
export const at = (n = 0, h = 9, m = 0) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); d.setUTCHours(h, m, 0, 0); return d.toISOString(); };
export const daysBetween = (a, b) => Math.round((Date.parse(`${String(b).slice(0, 10)}T00:00:00Z`) - Date.parse(`${String(a).slice(0, 10)}T00:00:00Z`)) / 864e5);
export const round = (n, d = 1) => (n == null || !Number.isFinite(+n) ? null : Math.round(+n * 10 ** d) / 10 ** d);
export const like = (q) => `%${String(q || '').replace(/[%_\\]/g, '').trim()}%`;
export const inList = (arr2) => (arr2.length ? arr2.map(() => '?').join(',') : "''");

// ---------------- seeding ----------------
export const DEMO = process.env.SEED_DEMO !== '0';
export const isEmpty = (table) => !one(`SELECT 1 FROM ${table} LIMIT 1`);
