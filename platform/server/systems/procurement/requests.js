// Purchase requests: drafting, the approval chain (line manager → Finance budget
// check & commitment → Procurement officer), budget lines and direct purchase.
//
// Visibility (SQL scope, deny by default):
//   requester: own requests (drafts are private to the requester);
//   line manager / managers of the department: submitted requests of that department;
//   Finance (procurement.finance, finance.budget): requests that reached Finance;
//   Procurement officer: requests that Finance approved.
// Segregation of duties: nobody approves their own request and nobody approves
// two stages of the same request.
import {
  one, all, run, uid, now, today, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, requireStaff, usersWithCap, managedDepartments, isManagerOf, lineManager, userBrief, deptBrief,
  audit, changed, alert, transition, inList, clean, day, round,
} from '../kit.js';
import { SYS, THRESHOLD, CATEGORIES, PR_STATUS, PR_FLOW, labelsAr, nextNumber, isOfficer, isFinance, isBudget } from './schema.js';
import { providerEligibility, providerBrief, providerUserIds, createContract, eligibleProviders } from '../providers.js';

const PR_AR = labelsAr(PR_STATUS);
export const STEPS = ['draft', 'pending_manager', 'pending_finance', 'pending_procurement', 'sourcing', 'ordered'];
export const stageIndex = (s) => { const i = STEPS.indexOf(s); return i < 0 ? 0 : i; };

// ---------------- scope ----------------
export function requestScope(user, a = 'r') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  const depts = managedDepartments(user);
  const fin = isFinance(user) || isBudget(user) ? 1 : 0;
  const off = isOfficer(user) ? 1 : 0;
  return {
    sql: `(${a}.requester_id=? OR (${a}.status<>'draft' AND (${a}.manager_id=? OR ${a}.department_id IN (${inList(depts)}) OR (${fin}=1 AND ${a}.mgr_at IS NOT NULL) OR (${off}=1 AND ${a}.fin_at IS NOT NULL))))`,
    params: [user.id, user.id, ...depts],
  };
}
export function visibleRequest(user, id) {
  requireStaff(user);
  const s = requestScope(user);
  const r = one(`SELECT r.* FROM procurement_requests r WHERE r.id=? AND ${s.sql}`, id, ...s.params);
  if (!r) throw new NotFound('طلب الشراء غير موجود أو غير متاح لك');
  return r;
}
export const requestRow = (id) => one('SELECT * FROM procurement_requests WHERE id=?', id);
export const itemsOf = (id) => all('SELECT * FROM procurement_items WHERE request_id=? ORDER BY line_no', id);
export function event(requestId, rfqId, action, user, note = null) {
  run('INSERT INTO procurement_events (id,request_id,rfq_id,action,by_id,note,at) VALUES (?,?,?,?,?,?,?)', uid('pe_'), requestId, rfqId, action, user?.id || user || null, note ? clean(note, 1000) : null, now());
}
// Everyone who can see a request (for realtime refresh; no data is pushed).
export function prRecipients(pr) {
  const ids = new Set([pr.requester_id, pr.manager_id, pr.mgr_by, pr.fin_by, pr.proc_by]);
  if (pr.status !== 'draft') {
    for (const u of all("SELECT id,role,department_id,user_type FROM users WHERE role IN ('manager','president') AND active=1 AND user_type='staff'")) if (managedDepartments(u).includes(pr.department_id)) ids.add(u.id);
    if (pr.mgr_at) for (const c of ['procurement.finance', 'finance.budget']) for (const id of usersWithCap(c)) ids.add(id);
    if (pr.fin_at) for (const id of usersWithCap('procurement.officer')) ids.add(id);
  }
  return [...ids].filter(Boolean);
}
// The contract owner after award: the requester if they manage, else their line manager.
export function contractOwner(pr) {
  const u = one('SELECT role FROM users WHERE id=?', pr.requester_id);
  return u && u.role !== 'employee' ? pr.requester_id : lineManager(pr.requester_id) || pr.requester_id;
}

// ---------------- budget ----------------
export const available = (l) => round((l.allocated || 0) - (l.committed || 0) - (l.spent || 0), 2);
const canSeeAllBudget = (u) => isBudget(u) || isFinance(u);
function budgetAmountsVisible(user, line) {
  return canSeeAllBudget(user) || managedDepartments(user).includes(line.department_id);
}
function pubLine(user, l) {
  const show = budgetAmountsVisible(user, l);
  const d = deptBrief(l.department_id);
  return {
    id: l.id, code: l.code, name_ar: l.name_ar, name_en: l.name_en || l.name_ar, fiscal_year: l.fiscal_year, department_id: l.department_id, dept_ar: d?.name_ar, dept_en: d?.name_en, is_demo: !!l.is_demo,
    amounts: show ? { allocated: l.allocated, committed: l.committed, spent: l.spent, available: available(l), utilisation: l.allocated ? round(((l.committed + l.spent) / l.allocated) * 100, 1) : null } : null,
    updated_at: show ? l.updated_at : null, updated_by: show && l.updated_by ? userBrief(l.updated_by) : null,
  };
}
export function listBudget(user) {
  requireStaff(user);
  const year = new Date().getUTCFullYear();
  let rows;
  if (canSeeAllBudget(user)) rows = all('SELECT * FROM procurement_budget_lines WHERE fiscal_year=? ORDER BY department_id, code', year);
  else {
    const depts = [...new Set([user.department_id, ...managedDepartments(user)])];
    rows = all(`SELECT * FROM procurement_budget_lines WHERE fiscal_year=? AND department_id IN (${inList(depts)}) ORDER BY department_id, code`, year, ...depts);
  }
  const lines = rows.map((l) => pubLine(user, l));
  const shown = lines.filter((l) => l.amounts);
  const sum = (k) => round(shown.reduce((a, l) => a + l.amounts[k], 0), 2);
  return {
    lines, can_edit: isBudget(user), fiscal_year: year,
    totals: shown.length ? { allocated: sum('allocated'), committed: sum('committed'), spent: sum('spent'), available: sum('available'), utilisation: sum('allocated') ? round(((sum('committed') + sum('spent')) / sum('allocated')) * 100, 1) : null } : null,
  };
}
// Lines a requester may charge: own department only.
export function budgetOptions(user) {
  requireStaff(user);
  const year = new Date().getUTCFullYear();
  return all('SELECT * FROM procurement_budget_lines WHERE fiscal_year=? AND department_id=? ORDER BY code', year, user.department_id).map((l) => pubLine(user, l));
}
export function getBudgetLine(user, id) {
  requireStaff(user);
  const l = one('SELECT * FROM procurement_budget_lines WHERE id=?', id);
  if (!l || !(canSeeAllBudget(user) || [user.department_id, ...managedDepartments(user)].includes(l.department_id))) throw new NotFound('بند الميزانية غير موجود أو غير متاح لك');
  const out = pubLine(user, l);
  if (out.amounts) {
    const s = requestScope(user);
    out.commitments = all(`SELECT r.id,r.number,r.title,r.status,r.reserved,r.po_number FROM procurement_requests r WHERE r.budget_line_id=? AND r.reserved>0 AND ${s.sql} ORDER BY r.updated_at DESC`, l.id, ...s.params)
      .map((r) => ({ ...r, status_ar: PR_STATUS[r.status][0], status_en: PR_STATUS[r.status][1] }));
  }
  return out;
}
export function createBudgetLine(user, b) {
  if (!isBudget(user)) throw new Forbidden('إدارة بنود الميزانية تتطلب صلاحية «إدارة اعتمادات الميزانية»');
  if (!deptBrief(b.department_id) || deptBrief(b.department_id).is_external) throw new BadRequest('إدارة غير صالحة');
  const year = new Date().getUTCFullYear();
  if (one('SELECT 1 FROM procurement_budget_lines WHERE code=? AND fiscal_year=?', clean(b.code, 30), year)) throw new Conflict('رمز البند مستخدم في هذه السنة المالية');
  const id = uid('bl_');
  run('INSERT INTO procurement_budget_lines (id,department_id,code,name_ar,name_en,fiscal_year,allocated,committed,spent,updated_by,updated_at) VALUES (?,?,?,?,?,?,?,0,?,?,?)',
    id, b.department_id, clean(b.code, 30), clean(b.name_ar, 160), clean(b.name_en || b.name_ar, 160), year, b.allocated, b.spent || 0, user.id, now());
  audit(user, 'procurement.budget.create', id, { code: b.code, allocated: b.allocated });
  changed(SYS, [...usersWithCap('finance.budget'), ...usersWithCap('procurement.finance')], id);
  return getBudgetLine(user, id);
}
export function updateBudgetLine(user, id, b) {
  if (!isBudget(user)) throw new Forbidden('إدارة بنود الميزانية تتطلب صلاحية «إدارة اعتمادات الميزانية»');
  const l = one('SELECT * FROM procurement_budget_lines WHERE id=?', id);
  if (!l) throw new NotFound('بند الميزانية غير موجود');
  const allocated = b.allocated ?? l.allocated; const spent = b.spent ?? l.spent;
  if (allocated < l.committed + spent) throw new Conflict(`لا يمكن أن يقل الاعتماد عن الالتزامات والمصروف (${round(l.committed + spent, 2)} د.إ)`);
  run('UPDATE procurement_budget_lines SET allocated=?, spent=?, name_ar=?, name_en=?, updated_by=?, updated_at=? WHERE id=?',
    allocated, spent, b.name_ar ? clean(b.name_ar, 160) : l.name_ar, b.name_en ? clean(b.name_en, 160) : l.name_en, user.id, now(), id);
  audit(user, 'procurement.budget.update', id, { from: { allocated: l.allocated, spent: l.spent }, to: { allocated, spent }, note: b.note ? clean(b.note, 300) : undefined });
  const mgrs = all("SELECT id,role,department_id,user_type FROM users WHERE role IN ('manager','president') AND active=1 AND user_type='staff'").filter((u) => managedDepartments(u).includes(l.department_id)).map((u) => u.id);
  changed(SYS, [...usersWithCap('finance.budget'), ...usersWithCap('procurement.finance'), ...mgrs], id);
  return getBudgetLine(user, id);
}
function adjustCommitment(lineId, delta) {
  if (!delta) return;
  run('UPDATE procurement_budget_lines SET committed=MAX(0, committed + ?), updated_at=? WHERE id=?', delta, now(), lineId);
}
function release(pr) { if (pr.reserved > 0) { adjustCommitment(pr.budget_line_id, -pr.reserved); run('UPDATE procurement_requests SET reserved=0 WHERE id=?', pr.id); } }
// Re-reserve for the PO amount (award or direct purchase); refuses when the line cannot cover the difference.
export function commitForPo(pr, amount) {
  const l = one('SELECT * FROM procurement_budget_lines WHERE id=?', pr.budget_line_id);
  const diff = round(amount - (pr.reserved || 0), 2);
  if (diff > 0 && diff > available(l)) throw new Conflict(`الرصيد المتاح في البند ${l.code} لا يغطي الفرق (${diff} د.إ) — يلزم تعزيز الميزانية من الإدارة المالية`);
  adjustCommitment(l.id, diff);
  run('UPDATE procurement_requests SET reserved=? WHERE id=?', amount, pr.id);
}

// ---------------- listing & detail ----------------
function pubSummary(r) {
  const req = userBrief(r.requester_id); const d = deptBrief(r.department_id);
  const rfq = r.rfq_id ? one('SELECT id,number,status,closes_at FROM procurement_rfqs WHERE id=?', r.rfq_id) : null;
  return {
    id: r.id, number: r.number, title: r.title, category: r.category, status: r.status, method: r.method, est_total: r.est_total, needed_by: r.needed_by,
    requester: req, dept_ar: d?.name_ar, dept_en: d?.name_en, department_id: r.department_id, stage: stageIndex(r.status), updated_at: r.updated_at, submitted_at: r.submitted_at,
    items_count: one('SELECT COUNT(*) n FROM procurement_items WHERE request_id=?', r.id).n, po_number: r.po_number,
    rfq: rfq ? { id: rfq.id, number: rfq.number, status: rfq.status, closes_at: rfq.closes_at } : null, is_demo: !!r.is_demo,
    return_note: r.status === 'draft' ? r.return_note : null,
  };
}
export function listRequests(user, { scope = 'all', status, q } = {}) {
  requireStaff(user);
  const s = requestScope(user);
  const where = [s.sql]; const params = [...s.params];
  if (scope === 'mine') { where.push('r.requester_id=?'); params.push(user.id); }
  if (status) { where.push('r.status=?'); params.push(status); }
  if (q) { where.push('(r.title LIKE ? OR r.number LIKE ?)'); params.push(`%${clean(q, 80)}%`, `%${clean(q, 80)}%`); }
  return all(`SELECT r.* FROM procurement_requests r WHERE ${where.join(' AND ')} ORDER BY r.updated_at DESC LIMIT 300`, ...params).map(pubSummary);
}
function canManagerDecide(user, r) { return user.id !== r.requester_id && (r.manager_id === user.id || isManagerOf(user, r.requester_id)); }
function canFinanceDecide(user, r) { return isFinance(user) && user.id !== r.requester_id && user.id !== r.mgr_by; }
function canOfficerDecide(user, r) { return isOfficer(user) && ![r.requester_id, r.mgr_by, r.fin_by].includes(user.id); }
export function allowed(user, r) {
  const mine = r.requester_id === user.id;
  return {
    edit: mine && r.status === 'draft',
    submit: mine && r.status === 'draft',
    cancel: mine && ['draft', 'pending_manager', 'pending_finance', 'pending_procurement'].includes(r.status),
    decide: (r.status === 'pending_manager' && canManagerDecide(user, r)) || (r.status === 'pending_finance' && canFinanceDecide(user, r)) || (r.status === 'pending_procurement' && canOfficerDecide(user, r)),
    source: r.status === 'pending_procurement' && canOfficerDecide(user, r),
    stage: r.status,
  };
}
const EVENT = {
  created: ['أُنشئ الطلب', 'Request created'], submitted: ['أُرسل للاعتماد', 'Submitted for approval'], edited: ['عُدّل الطلب', 'Request edited'],
  mgr_approved: ['اعتمده المدير المباشر', 'Approved by line manager'], fin_approved: ['اعتمدته المالية وحُجز المبلغ في الميزانية', 'Finance approved — amount committed'],
  returned: ['أُعيد للتعديل', 'Returned for changes'], rejected: ['رُفض الطلب', 'Request rejected'], cancelled: ['ألغاه مقدّم الطلب', 'Cancelled by requester'],
  rfq_started: ['بدأت المشتريات إعداد طلب عروض', 'Procurement started an RFQ'], rfq_published: ['نُشر طلب العروض للموردين', 'RFQ published to providers'],
  rfq_cancelled: ['أُلغي طلب العروض وعاد الطلب للمشتريات', 'RFQ cancelled — back to procurement'], direct_po: ['شراء مباشر: صدر أمر الشراء', 'Direct purchase: PO issued'],
  awarded: ['تمت الترسية وصدر أمر الشراء', 'Awarded — PO issued'],
};
export function timelineOf(requestId) {
  return all('SELECT * FROM procurement_events WHERE request_id=? ORDER BY at', requestId).map((e) => ({ action: e.action, ar: EVENT[e.action]?.[0] || e.action, en: EVENT[e.action]?.[1] || e.action, note: e.note, at: e.at, who: e.by_id ? userBrief(e.by_id) : null }));
}
export function getRequest(user, id) {
  const r = visibleRequest(user, id);
  const line = one('SELECT * FROM procurement_budget_lines WHERE id=?', r.budget_line_id);
  const rfq = r.rfq_id ? one('SELECT * FROM procurement_rfqs WHERE id=?', r.rfq_id) : null;
  const provider = r.provider_id ? providerBrief(r.provider_id) : null;
  return {
    ...pubSummary(r), justification: r.justification, reject_note: r.reject_note, return_note: r.return_note, reserved: r.reserved, po_amount: r.po_amount,
    manager: r.manager_id ? userBrief(r.manager_id) : null,
    approvals: { manager: r.mgr_by ? { by: userBrief(r.mgr_by), at: r.mgr_at } : null, finance: r.fin_by ? { by: userBrief(r.fin_by), at: r.fin_at } : null, procurement: r.proc_by ? { by: userBrief(r.proc_by), at: r.proc_at } : null },
    items: itemsOf(r.id).map((i) => ({ id: i.id, line_no: i.line_no, description: i.description, qty: i.qty, unit: i.unit, est_unit_price: i.est_unit_price, est_total: round(i.qty * i.est_unit_price, 2) })),
    budget_line: line ? pubLine(user, line) : null,
    sourcing: rfq ? { rfq_id: rfq.id, number: rfq.number, status: rfq.status, closes_at: rfq.closes_at, awarded: rfq.status === 'awarded' } : null,
    order: r.po_number ? { po_number: r.po_number, amount: r.po_amount, provider, contract_id: r.contract_id, method: r.method } : null,
    threshold: THRESHOLD, suggested_method: r.est_total >= THRESHOLD ? 'rfq' : 'direct',
    timeline: timelineOf(r.id), can: allowed(user, r),
    direct_candidates: allowed(user, r).source && r.est_total < THRESHOLD ? eligibleProviders(r.category).map((p) => ({ id: p.id, name_ar: p.name_ar, name_en: p.name_en, rating: p.rating })) : undefined,
  };
}

// ---------------- create / edit / submit / cancel ----------------
function validateItems(items) {
  if (!Array.isArray(items) || !items.length) throw new BadRequest('أضف بنداً واحداً على الأقل');
  if (items.length > 40) throw new BadRequest('الحد الأقصى 40 بنداً في الطلب الواحد');
  return items.map((it, i) => {
    const description = clean(it.description, 300);
    if (description.length < 3) throw new BadRequest(`وصف البند ${i + 1} قصير جداً`);
    if (!(it.qty > 0) || it.qty > 1e6) throw new BadRequest(`كمية البند ${i + 1} غير صالحة`);
    if (!(it.est_unit_price > 0) || it.est_unit_price > 1e8) throw new BadRequest(`السعر التقديري للبند ${i + 1} غير صالح`);
    const unit = clean(it.unit, 30);
    if (!unit) throw new BadRequest(`وحدة البند ${i + 1} مطلوبة`);
    return { line_no: i + 1, description, qty: round(it.qty, 3), unit, est_unit_price: round(it.est_unit_price, 2) };
  });
}
function validateHeader(user, b) {
  if (!CATEGORIES[b.category]) throw new BadRequest('فئة غير صالحة');
  const title = clean(b.title, 200);
  if (title.length < 3) throw new BadRequest('عنوان الطلب مطلوب');
  const justification = clean(b.justification, 2000);
  if (justification.length < 10) throw new BadRequest('اكتب مبرراً واضحاً للطلب (10 أحرف على الأقل)');
  if (!b.needed_by || b.needed_by < today()) throw new BadRequest('تاريخ الحاجة يجب ألا يكون في الماضي');
  const line = one('SELECT * FROM procurement_budget_lines WHERE id=?', b.budget_line_id);
  if (!line || line.department_id !== user.department_id) throw new BadRequest('اختر بند ميزانية تابعاً لإدارتك');
  return { title, justification, category: b.category, needed_by: b.needed_by, budget_line_id: line.id };
}
export function createRequest(user, b, { demo = false } = {}) {
  requireStaff(user);
  const h = validateHeader(user, b);
  const items = validateItems(b.items);
  const total = round(items.reduce((a, i) => a + i.qty * i.est_unit_price, 0), 2);
  const id = uid('prq_'); const t = now();
  tx(() => {
    run(`INSERT INTO procurement_requests (id,number,requester_id,department_id,title,category,justification,needed_by,budget_line_id,est_total,status,created_at,updated_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?,?, 'draft', ?,?,?)`,
      id, nextNumber('PR', 142), user.id, user.department_id, h.title, h.category, h.justification, h.needed_by, h.budget_line_id, total, t, t, demo ? 1 : 0);
    for (const i of items) run('INSERT INTO procurement_items (id,request_id,line_no,description,qty,unit,est_unit_price) VALUES (?,?,?,?,?,?,?)', uid('pit_'), id, i.line_no, i.description, i.qty, i.unit, i.est_unit_price);
    event(id, null, 'created', user);
  });
  audit(user, 'procurement.request.create', id, { total });
  changed(SYS, [user.id], id);
  if (b.submit) return submitRequest(user, id);
  return getRequest(user, id);
}
export function updateRequest(user, id, b) {
  const r = visibleRequest(user, id);
  if (r.requester_id !== user.id) throw new Forbidden('يعدّل الطلبَ مقدّمُه فقط');
  if (r.status !== 'draft') throw new Conflict('لا يمكن تعديل الطلب بعد إرساله — اطلب إعادته للتعديل');
  const h = validateHeader(user, { ...r, ...b });
  const items = b.items ? validateItems(b.items) : null;
  tx(() => {
    run('UPDATE procurement_requests SET title=?, category=?, justification=?, needed_by=?, budget_line_id=?, updated_at=? WHERE id=?', h.title, h.category, h.justification, h.needed_by, h.budget_line_id, now(), id);
    if (items) {
      run('DELETE FROM procurement_items WHERE request_id=?', id);
      for (const i of items) run('INSERT INTO procurement_items (id,request_id,line_no,description,qty,unit,est_unit_price) VALUES (?,?,?,?,?,?,?)', uid('pit_'), id, i.line_no, i.description, i.qty, i.unit, i.est_unit_price);
      run('UPDATE procurement_requests SET est_total=? WHERE id=?', round(items.reduce((a, i) => a + i.qty * i.est_unit_price, 0), 2), id);
    }
    event(id, null, 'edited', user);
  });
  audit(user, 'procurement.request.update', id);
  changed(SYS, [user.id], id);
  return getRequest(user, id);
}
export function submitRequest(user, id) {
  const r = visibleRequest(user, id);
  if (r.requester_id !== user.id) throw new Forbidden('يرسل الطلبَ مقدّمُه فقط');
  transition(r.status, 'pending_manager', PR_FLOW, PR_AR);
  if (!itemsOf(id).length) throw new BadRequest('أضف بنداً واحداً على الأقل');
  if (r.needed_by < today()) throw new BadRequest('تاريخ الحاجة أصبح في الماضي — حدّثه قبل الإرسال');
  const mgr = lineManager(user.id);
  if (!mgr) throw new Conflict('لا يوجد مدير مباشر لاعتماد الطلب — تواصل مع مدير المنصة');
  run(`UPDATE procurement_requests SET status='pending_manager', manager_id=?, mgr_by=NULL, mgr_at=NULL, fin_by=NULL, fin_at=NULL, proc_by=NULL, proc_at=NULL, return_note=NULL, submitted_at=?, updated_at=? WHERE id=?`, mgr, now(), now(), id);
  event(id, null, 'submitted', user);
  audit(user, 'procurement.request.submit', id);
  alert(mgr, { title: `طلب شراء بانتظار اعتمادك: ${r.number}`, body: r.title, system: SYS, id });
  changed(SYS, prRecipients(requestRow(id)), id);
  return getRequest(user, id);
}
export function cancelRequest(user, id, { reason }) {
  const r = visibleRequest(user, id);
  if (r.requester_id !== user.id) throw new Forbidden('يلغي الطلبَ مقدّمُه فقط');
  transition(r.status, 'cancelled', PR_FLOW, PR_AR);
  tx(() => {
    release(r);
    run("UPDATE procurement_requests SET status='cancelled', updated_at=? WHERE id=?", now(), id);
    event(id, null, 'cancelled', user, reason);
  });
  audit(user, 'procurement.request.cancel', id, { reason: clean(reason, 300) });
  changed(SYS, prRecipients(r), id);
  return getRequest(user, id);
}

// ---------------- approval chain ----------------
export function decide(user, id, { decision, note }) {
  const r = visibleRequest(user, id);
  const stage = r.status;
  const ok = stage === 'pending_manager' ? canManagerDecide(user, r) : stage === 'pending_finance' ? canFinanceDecide(user, r) : stage === 'pending_procurement' ? canOfficerDecide(user, r) : null;
  if (ok === null) throw new Conflict(`لا يوجد اعتماد مطلوب في حالة «${PR_AR[stage]}»`);
  if (!ok) {
    if (user.id === r.requester_id) throw new Forbidden('لا يمكنك اعتماد طلب قدّمته بنفسك');
    if ([r.mgr_by, r.fin_by].includes(user.id)) throw new Forbidden('لا يعتمد الشخص نفسه مرحلتين من الطلب نفسه');
    throw new Forbidden('هذه المرحلة ليست ضمن صلاحياتك');
  }
  const why = clean(note, 1000);
  if (decision !== 'approve' && why.length < 5) throw new BadRequest('اذكر سبب الرفض أو الإعادة');
  const t = now();
  if (decision === 'return') {
    transition(stage, 'draft', PR_FLOW, PR_AR);
    tx(() => {
      release(r);
      run(`UPDATE procurement_requests SET status='draft', return_note=?, mgr_by=NULL, mgr_at=NULL, fin_by=NULL, fin_at=NULL, updated_at=? WHERE id=?`, why, t, id);
      event(id, null, 'returned', user, why);
    });
    alert(r.requester_id, { level: 'warning', title: `أُعيد طلب الشراء ${r.number} للتعديل`, body: why, system: SYS, id });
  } else if (decision === 'reject') {
    transition(stage, 'rejected', PR_FLOW, PR_AR);
    tx(() => {
      release(r);
      run(`UPDATE procurement_requests SET status='rejected', reject_note=?, updated_at=? WHERE id=?`, why, t, id);
      event(id, null, 'rejected', user, why);
    });
    alert(r.requester_id, { level: 'warning', title: `رُفض طلب الشراء ${r.number}`, body: why, system: SYS, id });
  } else if (stage === 'pending_manager') {
    transition(stage, 'pending_finance', PR_FLOW, PR_AR);
    run(`UPDATE procurement_requests SET status='pending_finance', mgr_by=?, mgr_at=?, updated_at=? WHERE id=?`, user.id, t, t, id);
    event(id, null, 'mgr_approved', user, why || null);
    for (const f of usersWithCap('procurement.finance')) if (f !== r.requester_id && f !== user.id) alert(f, { title: `طلب شراء بانتظار اعتماد الميزانية: ${r.number}`, body: r.title, system: SYS, id });
  } else if (stage === 'pending_finance') {
    transition(stage, 'pending_procurement', PR_FLOW, PR_AR);
    tx(() => {
      const line = one('SELECT * FROM procurement_budget_lines WHERE id=?', r.budget_line_id);
      if (!line) throw new Conflict('بند الميزانية غير موجود');
      if (r.est_total > available(line)) throw new Conflict(`الرصيد المتاح في البند ${line.code} (${available(line)} د.إ) لا يغطي قيمة الطلب (${r.est_total} د.إ)`);
      adjustCommitment(line.id, r.est_total);
      run(`UPDATE procurement_requests SET status='pending_procurement', fin_by=?, fin_at=?, reserved=?, updated_at=? WHERE id=?`, user.id, t, r.est_total, t, id);
      event(id, null, 'fin_approved', user, why || null);
    });
    for (const o of usersWithCap('procurement.officer')) if (o !== r.requester_id) alert(o, { title: `طلب شراء جاهز للطرح: ${r.number}`, body: r.title, system: SYS, id });
  } else {
    throw new Conflict('في مرحلة المشتريات اختر طريقة الشراء: طلب عروض أو شراء مباشر');
  }
  audit(user, `procurement.request.${decision}`, id, { stage });
  changed(SYS, prRecipients(requestRow(id)), id);
  return getRequest(user, id);
}
export function markOfficer(user, r) {
  if (r.status !== 'pending_procurement') throw new Conflict(`لا يمكن الطرح في حالة «${PR_AR[r.status]}»`);
  if (!canOfficerDecide(user, r)) {
    if (!isOfficer(user)) throw new Forbidden('الطرح من صلاحية أخصائي المشتريات');
    throw new Forbidden('لا يطرح أخصائي المشتريات طلباً قدّمه أو اعتمده بنفسه');
  }
}
// Direct purchase (below the RFQ threshold): eligible provider + quotation → PO → contract.
export function directPurchase(user, id, { provider_id, amount, quote_ref, note }) {
  const r = visibleRequest(user, id);
  markOfficer(user, r);
  if (r.est_total >= THRESHOLD) throw new Conflict(`القيمة التقديرية ${r.est_total} د.إ تتجاوز حد الشراء المباشر (${THRESHOLD} د.إ) — يلزم طلب عروض`);
  if (!(amount > 0) || amount >= THRESHOLD) throw new BadRequest(`قيمة أمر الشراء المباشر يجب أن تكون أقل من ${THRESHOLD} د.إ`);
  const el = providerEligibility(provider_id);
  if (!el.eligible) throw new Conflict(`المورد غير مؤهل: ${el.reasons.map((x) => x.ar).join('، ')}`);
  if (!eligibleProviders(r.category).some((p) => p.id === provider_id)) throw new Conflict('المورد غير مسجّل في فئة هذا الطلب');
  const po = issuePo(user, r, { provider_id, amount, method: 'direct', note: [quote_ref ? `عرض السعر ${clean(quote_ref, 60)}` : null, note ? clean(note, 300) : null].filter(Boolean).join(' — ') });
  return { ...getRequest(user, id), po };
}
// Shared by direct purchase and RFQ award.
export function issuePo(user, r, { provider_id, amount, method, rfq = null, note = null }) {
  let po; let contract;
  tx(() => {
    commitForPo(r, amount);
    po = nextNumber('PO', 419);
    const owner = contractOwner(r);
    const start = today();
    const end = day(180, new Date(`${(r.needed_by > start ? r.needed_by : start)}T12:00:00Z`));
    contract = createContract({ provider_id, title: r.title, department_id: r.department_id, owner_id: owner, value: amount, start_date: start, end_date: end, po_number: po, source_ref: rfq?.number || r.number, request_id: r.id, created_by: user.id });
    run(`UPDATE procurement_requests SET status='ordered', method=?, po_number=?, provider_id=?, po_amount=?, contract_id=?, proc_by=COALESCE(proc_by, ?), proc_at=COALESCE(proc_at, ?), updated_at=? WHERE id=?`,
      method, po, provider_id, amount, contract.id, user.id, now(), now(), r.id);
    event(r.id, rfq?.id || null, method === 'direct' ? 'direct_po' : 'awarded', user, `${po}${note ? ` — ${note}` : ''}`);
  });
  audit(user, 'procurement.po.issue', r.id, { po, amount, provider_id, method });
  const p = providerBrief(provider_id);
  alert(r.requester_id, { title: `صدر أمر الشراء ${po} لطلبك ${r.number}`, body: `${p?.name_ar || ''}`, system: SYS, id: r.id });
  const owner = contract.owner_id;
  if (owner !== r.requester_id) alert(owner, { title: `عقد جديد لإدارتك: ${contract.number}`, body: `${p?.name_ar || ''} — قيّم أداء المورد خلال التنفيذ`, system: 'providers', id: contract.id });
  if (method === 'direct') for (const u of providerUserIds(provider_id)) alert(u, { title: `صدر لكم أمر شراء ${po}`, body: r.title, system: SYS, id: null });
  changed(SYS, prRecipients(requestRow(r.id)), r.id);
  return { po_number: po, contract_id: contract.id, contract_number: contract.number, amount };
}
export function toSourcing(user, r, rfqId) {
  transition(r.status, 'sourcing', PR_FLOW, PR_AR);
  run(`UPDATE procurement_requests SET status='sourcing', method='rfq', rfq_id=?, proc_by=?, proc_at=?, updated_at=? WHERE id=?`, rfqId, user.id, now(), now(), r.id);
  event(r.id, rfqId, 'rfq_started', user);
}
export function backToProcurement(user, r, rfqId, note) {
  transition(r.status, 'pending_procurement', PR_FLOW, PR_AR);
  run(`UPDATE procurement_requests SET status='pending_procurement', method=NULL, rfq_id=NULL, updated_at=? WHERE id=?`, now(), r.id);
  event(r.id, rfqId, 'rfq_cancelled', user, note);
}

// ---------------- approval queues ----------------
export function requestQueues(user) {
  if (!isStaff(user)) return { manager: [], finance: [], procurement: [] };
  const s = requestScope(user);
  const rows = all(`SELECT r.* FROM procurement_requests r WHERE r.status IN ('pending_manager','pending_finance','pending_procurement') AND ${s.sql} ORDER BY r.submitted_at`, ...s.params);
  return {
    manager: rows.filter((r) => r.status === 'pending_manager' && canManagerDecide(user, r)).map(pubSummary),
    finance: rows.filter((r) => r.status === 'pending_finance' && canFinanceDecide(user, r)).map((r) => {
      const l = one('SELECT * FROM procurement_budget_lines WHERE id=?', r.budget_line_id);
      return { ...pubSummary(r), budget: l ? { code: l.code, name_ar: l.name_ar, available: available(l), sufficient: available(l) >= r.est_total } : null };
    }),
    procurement: rows.filter((r) => r.status === 'pending_procurement' && canOfficerDecide(user, r)).map((r) => ({ ...pubSummary(r), suggested_method: r.est_total >= THRESHOLD ? 'rfq' : 'direct' })),
  };
}
