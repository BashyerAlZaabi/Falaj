// Service Providers — registry, documents (metadata only), contracts,
// performance evaluations and the private vendor portal.
//
// Authorization (server-side, deny by default):
//  - providers.manage (Procurement): full registry, status changes, document
//    verification, access log.
//  - procurement.officer/finance/committee/legal: read the whole registry.
//  - other managers / the president: only providers holding a contract with a
//    department they manage (or a contract they own).
//  - contract owners evaluate their own contracts.
//  - external identities (providers.portal) only ever reach their own company
//    through /portal endpoints; every internal endpoint refuses them.
import {
  one, all, run, uid, now, today, json, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, isExternal, hasCap, requireStaff, usersWithCap, managedDepartments, userBrief,
  audit, logAccess, accessLog, changed, alert, transition, inList, clean, daysBetween, round,
} from '../kit.js';

export const SYS = 'providers';
export const CATEGORIES = {
  it: ['خدمات تقنية المعلومات', 'IT services'],
  supplies: ['التوريدات', 'Supplies'],
  consulting: ['الاستشارات', 'Consulting'],
  facilities: ['خدمات المرافق', 'Facilities'],
};
export const DOC_KINDS = {
  licence: ['الرخصة التجارية', 'Trade licence'],
  vat: ['شهادة التسجيل الضريبي', 'VAT certificate'],
  insurance: ['وثيقة التأمين', 'Insurance policy'],
};
export const STATUS = {
  pending: ['قيد التأهيل', 'Pending'],
  approved: ['معتمد', 'Approved'],
  suspended: ['معلّق', 'Suspended'],
  blacklisted: ['محظور', 'Blacklisted'],
};
const FLOW = { pending: ['approved'], approved: ['suspended', 'blacklisted'], suspended: ['approved', 'blacklisted'], blacklisted: [] };
const STATUS_AR = Object.fromEntries(Object.entries(STATUS).map(([k, v]) => [k, v[0]]));
const FULL_CAPS = ['providers.manage', 'procurement.officer', 'procurement.finance', 'procurement.committee', 'procurement.legal'];
export const EXPIRY_WARN_DAYS = 30;

// ---------------- schema ----------------
export function schema() {
  run(`CREATE TABLE IF NOT EXISTS providers_companies (
    id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
    category TEXT NOT NULL, categories TEXT NOT NULL DEFAULT '[]',
    contact_name TEXT, contact_email TEXT, contact_phone TEXT, org_id TEXT,
    status TEXT NOT NULL DEFAULT 'pending', status_reason TEXT, status_by TEXT, status_at TEXT,
    created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS providers_users (
    user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE, provider_id TEXT NOT NULL REFERENCES providers_companies(id),
    linked_by TEXT, linked_at TEXT NOT NULL)`);
  run(`CREATE TABLE IF NOT EXISTS providers_documents (
    id TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES providers_companies(id), kind TEXT NOT NULL,
    ref_no TEXT, issued_on TEXT, expires_on TEXT, verified_by TEXT, verified_at TEXT,
    pending_ref_no TEXT, pending_issued_on TEXT, pending_expires_on TEXT, pending_by TEXT, pending_at TEXT,
    updated_at TEXT NOT NULL, UNIQUE (provider_id, kind))`);
  run(`CREATE TABLE IF NOT EXISTS providers_contracts (
    id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, provider_id TEXT NOT NULL REFERENCES providers_companies(id),
    title TEXT NOT NULL, department_id TEXT NOT NULL, owner_id TEXT NOT NULL, value REAL NOT NULL,
    start_date TEXT NOT NULL, end_date TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    po_number TEXT, source TEXT, source_ref TEXT, request_id TEXT,
    created_by TEXT, created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS providers_evaluations (
    id TEXT PRIMARY KEY, contract_id TEXT NOT NULL REFERENCES providers_contracts(id), provider_id TEXT NOT NULL,
    evaluator_id TEXT NOT NULL, period TEXT NOT NULL, quality INTEGER NOT NULL, timeliness INTEGER NOT NULL, compliance INTEGER NOT NULL,
    score REAL NOT NULL, comment TEXT, created_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, UNIQUE (contract_id, period))`);
  run(`CREATE TABLE IF NOT EXISTS providers_history (
    id TEXT PRIMARY KEY, provider_id TEXT NOT NULL, action TEXT NOT NULL, from_status TEXT, to_status TEXT,
    reason TEXT, by_id TEXT, at TEXT NOT NULL)`);
  run('CREATE INDEX IF NOT EXISTS ix_providers_contracts_p ON providers_contracts(provider_id)');
  run('CREATE INDEX IF NOT EXISTS ix_providers_eval_c ON providers_evaluations(contract_id)');
}

// ---------------- roles & scopes ----------------
export const canManage = (u) => isStaff(u) && hasCap(u, 'providers.manage');
export const fullView = (u) => isStaff(u) && hasCap(u, ...FULL_CAPS);
function providerScope(user, alias = 'p') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  if (fullView(user)) return { sql: '1', params: [] };
  const depts = managedDepartments(user);
  return { sql: `EXISTS (SELECT 1 FROM providers_contracts sc WHERE sc.provider_id=${alias}.id AND (sc.owner_id=? OR sc.department_id IN (${inList(depts)})))`, params: [user.id, ...depts] };
}
function contractScope(user, alias = 'c') {
  if (!isStaff(user)) return { sql: '0', params: [] };
  if (fullView(user)) return { sql: '1', params: [] };
  const depts = managedDepartments(user);
  return { sql: `(${alias}.owner_id=? OR ${alias}.department_id IN (${inList(depts)}))`, params: [user.id, ...depts] };
}
export const catLabel = (k) => CATEGORIES[k] || [k, k];

// ---------------- helpers ----------------
export const providerOfUser = (userId) => one(`SELECT p.* FROM providers_users pu JOIN providers_companies p ON p.id=pu.provider_id WHERE pu.user_id=?`, userId) || null;
export const providerUserIds = (providerId) => all("SELECT pu.user_id FROM providers_users pu JOIN users u ON u.id=pu.user_id WHERE pu.provider_id=? AND u.active=1", providerId).map((r) => r.user_id);
export const providerRow = (id) => one('SELECT * FROM providers_companies WHERE id=?', id);
export function providerBrief(id) {
  const p = providerRow(id);
  return p ? { id: p.id, name_ar: p.name_ar, name_en: p.name_en, category: p.category, status: p.status } : null;
}
function docsOf(providerId) {
  const rows = all('SELECT * FROM providers_documents WHERE provider_id=?', providerId);
  const out = {};
  for (const k of Object.keys(DOC_KINDS)) out[k] = rows.find((r) => r.kind === k) || null;
  return out;
}
function docState(d, t = today()) {
  if (!d || !d.expires_on) return 'missing';
  if (d.expires_on < t) return 'expired';
  if (daysBetween(t, d.expires_on) <= EXPIRY_WARN_DAYS) return 'expiring';
  return 'valid';
}
const pubDoc = (d, kind, { internal = true } = {}) => {
  const state = docState(d);
  return {
    kind, name_ar: DOC_KINDS[kind][0], name_en: DOC_KINDS[kind][1], state,
    ref_no: d?.ref_no || null, issued_on: d?.issued_on || null, expires_on: d?.expires_on || null,
    days_left: d?.expires_on ? daysBetween(today(), d.expires_on) : null,
    verified_at: d?.verified_at || null, verified_by: internal && d?.verified_by ? userBrief(d.verified_by) : null,
    pending: d?.pending_at ? { ref_no: d.pending_ref_no, issued_on: d.pending_issued_on, expires_on: d.pending_expires_on, at: d.pending_at } : null,
  };
};
// Eligibility for sourcing: approved + licence, VAT and insurance present and not expired.
export function eligibilityOf(p, docs = docsOf(p.id)) {
  const reasons = []; const warnings = [];
  if (p.status !== 'approved') reasons.push({ code: `status_${p.status}`, ar: `حالة المورد: ${STATUS_AR[p.status] || p.status}`, en: `Provider status: ${STATUS[p.status]?.[1] || p.status}` });
  for (const [k, [ar, en]] of Object.entries(DOC_KINDS)) {
    const s = docState(docs[k]);
    if (s === 'missing') reasons.push({ code: `missing_${k}`, ar: `${ar} غير مسجّلة`, en: `${en} missing` });
    else if (s === 'expired') reasons.push({ code: `expired_${k}`, ar: `${ar} منتهية منذ ${docs[k].expires_on}`, en: `${en} expired on ${docs[k].expires_on}` });
    else if (s === 'expiring') warnings.push({ code: `expiring_${k}`, ar: `${ar} تنتهي في ${docs[k].expires_on}`, en: `${en} expires on ${docs[k].expires_on}` });
  }
  return { eligible: !reasons.length, reasons, warnings };
}
export function providerEligibility(id) {
  const p = providerRow(id);
  if (!p) return { eligible: false, reasons: [{ code: 'unknown', ar: 'مورد غير موجود', en: 'Unknown provider' }], warnings: [] };
  return eligibilityOf(p);
}
function ratingOf(providerId) {
  const r = one('SELECT AVG(score) s, COUNT(*) n, AVG(quality) q, AVG(timeliness) t, AVG(compliance) c FROM providers_evaluations WHERE provider_id=?', providerId);
  return { rating: r.n ? round(r.s, 1) : null, count: r.n, quality: r.n ? round(r.q, 1) : null, timeliness: r.n ? round(r.t, 1) : null, compliance: r.n ? round(r.c, 1) : null };
}
function summaryRow(p) {
  const docs = docsOf(p.id);
  const el = eligibilityOf(p, docs);
  const r = ratingOf(p.id);
  const lic = docs.licence;
  return {
    id: p.id, name_ar: p.name_ar, name_en: p.name_en, category: p.category, categories: json(p.categories, [p.category]),
    status: p.status, is_demo: !!p.is_demo, licence_no: lic?.ref_no || null, licence_expiry: lic?.expires_on || null,
    rating: r.rating, rating_count: r.count, eligible: el.eligible, reasons: el.reasons, warnings: el.warnings,
    docs: Object.fromEntries(Object.keys(DOC_KINDS).map((k) => [k, docState(docs[k])])),
    pending_renewals: Object.values(docs).filter((d) => d?.pending_at).length,
    contracts: one('SELECT COUNT(*) n FROM providers_contracts WHERE provider_id=?', p.id).n,
  };
}
// Eligible providers for a sourcing category (approved, documents valid; never
// suspended, blacklisted, pending or with an expired document).
export function eligibleProviders(category) {
  return all("SELECT * FROM providers_companies WHERE status='approved' ORDER BY name_ar")
    .filter((p) => !category || json(p.categories, [p.category]).includes(category) || p.category === category)
    .map(summaryRow).filter((p) => p.eligible);
}
// Shortlist for an officer: eligible first, then the excluded ones with the reason.
export function shortlist(category) {
  const rows = all('SELECT * FROM providers_companies ORDER BY name_ar')
    .filter((p) => !category || json(p.categories, [p.category]).includes(category) || p.category === category).map(summaryRow);
  return { eligible: rows.filter((r) => r.eligible).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0)), excluded: rows.filter((r) => !r.eligible) };
}
function recipients(providerId, { includeProvider = false } = {}) {
  const ids = new Set(usersWithCap('providers.manage'));
  for (const c of FULL_CAPS) for (const id of usersWithCap(c)) ids.add(id);
  for (const r of all('SELECT DISTINCT owner_id FROM providers_contracts WHERE provider_id=?', providerId)) ids.add(r.owner_id);
  if (includeProvider) for (const id of providerUserIds(providerId)) ids.add(id);
  return [...ids];
}
function history(providerId, action, user, { from = null, to = null, reason = null } = {}) {
  run('INSERT INTO providers_history (id,provider_id,action,from_status,to_status,reason,by_id,at) VALUES (?,?,?,?,?,?,?,?)', uid('ph_'), providerId, action, from, to, reason, user?.id || null, now());
}
const HISTORY_LABEL = {
  created: ['تسجيل المورد', 'Provider registered'], status: ['تغيير الحالة', 'Status changed'], updated: ['تحديث البيانات', 'Details updated'],
  document: ['تحديث وثيقة', 'Document updated'], renewal: ['طلب تحديث وثيقة من المورد', 'Document renewal submitted by provider'],
  verified: ['التحقق من وثيقة', 'Document verified'], renewal_rejected: ['رفض تحديث وثيقة', 'Document renewal rejected'], contact: ['تحديث بيانات التواصل من المورد', 'Contact details updated by provider'],
};

// ---------------- registry (internal) ----------------
export function listProviders(user, { status, category, q } = {}) {
  requireStaff(user);
  const s = providerScope(user);
  const where = [s.sql]; const params = [...s.params];
  if (status) { where.push('p.status=?'); params.push(status); }
  if (q) { where.push('(p.name_ar LIKE ? OR p.name_en LIKE ?)'); params.push(`%${clean(q, 80)}%`, `%${clean(q, 80)}%`); }
  let rows = all(`SELECT p.* FROM providers_companies p WHERE ${where.join(' AND ')} ORDER BY CASE p.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 WHEN 'suspended' THEN 2 ELSE 3 END, p.name_ar`, ...params);
  if (category) rows = rows.filter((p) => json(p.categories, [p.category]).includes(category) || p.category === category);
  return rows.map(summaryRow);
}
function visibleProvider(user, id) {
  requireStaff(user);
  const s = providerScope(user);
  const p = one(`SELECT p.* FROM providers_companies p WHERE p.id=? AND ${s.sql}`, id, ...s.params);
  if (!p) throw new NotFound('المورد غير موجود أو غير متاح لك');
  return p;
}
export function getProvider(user, id) {
  const p = visibleProvider(user, id);
  logAccess(user, SYS, 'provider', p.id, 'view');
  const docs = docsOf(p.id);
  const cs = contractScope(user);
  const contracts = all(`SELECT c.* FROM providers_contracts c WHERE c.provider_id=? AND ${cs.sql} ORDER BY c.start_date DESC`, p.id, ...cs.params).map(pubContract);
  const evals = all(`SELECT e.*, c.number FROM providers_evaluations e JOIN providers_contracts c ON c.id=e.contract_id WHERE e.provider_id=? AND ${cs.sql} ORDER BY e.created_at DESC`, p.id, ...cs.params)
    .map((e) => ({ id: e.id, contract_id: e.contract_id, contract_number: e.number, period: e.period, quality: e.quality, timeliness: e.timeliness, compliance: e.compliance, score: e.score, comment: e.comment, evaluator: userBrief(e.evaluator_id), created_at: e.created_at, is_demo: !!e.is_demo }));
  const manage = canManage(user);
  return {
    ...summaryRow(p),
    contact_name: p.contact_name, contact_email: p.contact_email, contact_phone: p.contact_phone,
    status_reason: p.status_reason, status_at: p.status_at, status_by: p.status_by ? userBrief(p.status_by) : null,
    documents: Object.keys(DOC_KINDS).map((k) => pubDoc(docs[k], k)),
    rating_detail: ratingOf(p.id), contracts, evaluations: evals,
    history: all('SELECT * FROM providers_history WHERE provider_id=? ORDER BY at DESC LIMIT 40', p.id).map((h) => ({ ...h, label: HISTORY_LABEL[h.action] || [h.action, h.action], by: h.by_id ? userBrief(h.by_id) : null, from_label: h.from_status ? STATUS[h.from_status] : null, to_label: h.to_status ? STATUS[h.to_status] : null })),
    portal_users: manage ? all('SELECT u.id,u.name_ar,u.name_en,u.title_ar,u.title_en FROM providers_users pu JOIN users u ON u.id=pu.user_id WHERE pu.provider_id=?', p.id) : undefined,
    access_log: manage ? accessLog(SYS, 'provider', p.id, 30) : undefined,
    can: { manage, transitions: manage ? FLOW[p.status] : [] },
  };
}
const PHONE = /^[+0-9 ()-]{6,20}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
function checkContact(b) {
  if (b.contact_email && !EMAIL.test(b.contact_email)) throw new BadRequest('البريد الإلكتروني غير صالح');
  if (b.contact_phone && !PHONE.test(b.contact_phone)) throw new BadRequest('رقم الهاتف غير صالح');
}
function checkCategories(category, categories = []) {
  if (!CATEGORIES[category]) throw new BadRequest('فئة غير صالحة');
  const list = [...new Set([category, ...(categories || [])])];
  for (const c of list) if (!CATEGORIES[c]) throw new BadRequest('فئة غير صالحة');
  return list;
}
export function createProvider(user, b) {
  if (!canManage(user)) throw new Forbidden('تسجيل الموردين يتطلب صلاحية إدارة سجل مقدمي الخدمات');
  checkContact(b);
  const cats = checkCategories(b.category, b.categories);
  const name = clean(b.name_ar, 160);
  if (name.length < 3) throw new BadRequest('اسم الشركة بالعربية مطلوب');
  if (one('SELECT 1 FROM providers_companies WHERE name_ar=?', name)) throw new Conflict('يوجد مورد مسجّل بالاسم نفسه');
  if (b.licence_expiry < today()) throw new BadRequest('تاريخ انتهاء الرخصة التجارية منتهٍ — لا يمكن تسجيل مورد برخصة منتهية');
  const id = uid('pv_'); const t = now();
  tx(() => {
    run(`INSERT INTO providers_companies (id,name_ar,name_en,category,categories,contact_name,contact_email,contact_phone,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?, 'pending', ?,?,?)`,
      id, name, clean(b.name_en || b.name_ar, 160), b.category, JSON.stringify(cats), clean(b.contact_name, 120) || null, clean(b.contact_email, 160) || null, clean(b.contact_phone, 40) || null, user.id, t, t);
    run('INSERT INTO providers_documents (id,provider_id,kind,ref_no,expires_on,verified_by,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?)', uid('pd_'), id, 'licence', clean(b.licence_no, 60), b.licence_expiry, user.id, t, t);
    history(id, 'created', user, { to: 'pending' });
  });
  audit(user, 'providers.create', id, { name });
  logAccess(user, SYS, 'provider', id, 'create');
  changed(SYS, recipients(id), id);
  return getProvider(user, id);
}
export function updateProvider(user, id, b) {
  if (!canManage(user)) { visibleProvider(user, id); throw new Forbidden('تعديل بيانات المورد يتطلب صلاحية إدارة سجل مقدمي الخدمات'); }
  const p = visibleProvider(user, id);
  checkContact(b);
  const cats = b.category ? checkCategories(b.category, b.categories) : json(p.categories, [p.category]);
  run(`UPDATE providers_companies SET name_ar=?, name_en=?, category=?, categories=?, contact_name=?, contact_email=?, contact_phone=?, updated_at=? WHERE id=?`,
    b.name_ar ? clean(b.name_ar, 160) : p.name_ar, b.name_en ? clean(b.name_en, 160) : p.name_en, b.category || p.category, JSON.stringify(cats),
    b.contact_name !== undefined ? clean(b.contact_name, 120) : p.contact_name, b.contact_email !== undefined ? clean(b.contact_email, 160) : p.contact_email,
    b.contact_phone !== undefined ? clean(b.contact_phone, 40) : p.contact_phone, now(), id);
  history(id, 'updated', user);
  audit(user, 'providers.update', id, { fields: Object.keys(b) });
  logAccess(user, SYS, 'provider', id, 'update');
  changed(SYS, recipients(id, { includeProvider: true }), id);
  return getProvider(user, id);
}
// Status workflow: pending → approved → suspended/blacklisted; suspended → approved (reinstate).
// Every change needs a reason; suspension, blacklisting and reinstatement need explicit confirmation.
export function setStatus(user, id, { to, reason }, { confirm } = {}) {
  const p = visibleProvider(user, id);
  if (!canManage(user)) throw new Forbidden('تغيير حالة المورد يتطلب صلاحية إدارة سجل مقدمي الخدمات');
  transition(p.status, to, FLOW, STATUS_AR);
  if (!(p.status === 'pending' && to === 'approved')) confirm?.();
  const why = clean(reason, 500);
  if (why.length < 5) throw new BadRequest('يجب ذكر سبب واضح لتغيير الحالة');
  if (to === 'approved' && p.status === 'pending') {
    const el = eligibilityOf({ ...p, status: 'approved' });
    const blocking = el.reasons.filter((r) => r.code.startsWith('expired_licence') || r.code.startsWith('missing_licence'));
    if (blocking.length) throw new Conflict('لا يمكن اعتماد مورد رخصته التجارية منتهية أو غير مسجّلة');
  }
  run('UPDATE providers_companies SET status=?, status_reason=?, status_by=?, status_at=?, updated_at=? WHERE id=?', to, why, user.id, now(), now(), id);
  history(id, 'status', user, { from: p.status, to, reason: why });
  audit(user, `providers.status.${to}`, id, { from: p.status, to, reason: why });
  logAccess(user, SYS, 'provider', id, `status:${to}`);
  const msg = { approved: p.status === 'pending' ? 'تم اعتماد تأهيل شركتكم في سجل مقدمي الخدمات' : 'تمت إعادة تفعيل تأهيل شركتكم', suspended: 'تم تعليق تأهيل شركتكم مؤقتاً — يُرجى التواصل مع قسم المشتريات', blacklisted: 'تم إيقاف التعامل مع شركتكم — يُرجى التواصل مع قسم المشتريات' }[to];
  for (const uidp of providerUserIds(id)) alert(uidp, { level: to === 'approved' ? 'info' : 'warning', title: msg, system: SYS, id });
  changed(SYS, recipients(id, { includeProvider: true }), id);
  return getProvider(user, id);
}
function validDocDates(b) {
  if (!b.expires_on) throw new BadRequest('تاريخ الانتهاء مطلوب');
  if (b.issued_on && b.issued_on > b.expires_on) throw new BadRequest('تاريخ الإصدار بعد تاريخ الانتهاء');
  if (b.issued_on && b.issued_on > today()) throw new BadRequest('تاريخ الإصدار في المستقبل');
}
// Internal update of a document's metadata (verified immediately).
export function setDocument(user, id, kind, b) {
  const p = visibleProvider(user, id);
  if (!canManage(user)) throw new Forbidden('تحديث الوثائق يتطلب صلاحية إدارة سجل مقدمي الخدمات');
  if (!DOC_KINDS[kind]) throw new NotFound('نوع وثيقة غير معروف');
  validDocDates(b);
  const t = now();
  run(`INSERT INTO providers_documents (id,provider_id,kind,ref_no,issued_on,expires_on,verified_by,verified_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(provider_id,kind) DO UPDATE SET ref_no=excluded.ref_no, issued_on=excluded.issued_on, expires_on=excluded.expires_on, verified_by=excluded.verified_by, verified_at=excluded.verified_at,
    pending_ref_no=NULL, pending_issued_on=NULL, pending_expires_on=NULL, pending_by=NULL, pending_at=NULL, updated_at=excluded.updated_at`,
  uid('pd_'), p.id, kind, clean(b.ref_no, 60) || null, b.issued_on || null, b.expires_on, user.id, t, t);
  history(p.id, 'document', user, { reason: DOC_KINDS[kind][0] });
  audit(user, 'providers.document', p.id, { kind, expires_on: b.expires_on });
  logAccess(user, SYS, 'provider', p.id, 'document');
  changed(SYS, recipients(p.id, { includeProvider: true }), p.id);
  return getProvider(user, p.id);
}
export function verifyRenewal(user, id, kind, { decision, note }) {
  const p = visibleProvider(user, id);
  if (!canManage(user)) throw new Forbidden('التحقق من الوثائق يتطلب صلاحية إدارة سجل مقدمي الخدمات');
  const d = one('SELECT * FROM providers_documents WHERE provider_id=? AND kind=?', p.id, kind);
  if (!d?.pending_at) throw new Conflict('لا يوجد تحديث بانتظار التحقق لهذه الوثيقة');
  if (d.pending_by === user.id) throw new Forbidden('لا يمكنك التحقق من تحديث قدّمته بنفسك');
  const t = now();
  if (decision === 'accept') {
    run(`UPDATE providers_documents SET ref_no=?, issued_on=?, expires_on=?, verified_by=?, verified_at=?, pending_ref_no=NULL, pending_issued_on=NULL, pending_expires_on=NULL, pending_by=NULL, pending_at=NULL, updated_at=? WHERE id=?`,
      d.pending_ref_no, d.pending_issued_on, d.pending_expires_on, user.id, t, t, d.id);
    history(p.id, 'verified', user, { reason: DOC_KINDS[kind][0] });
  } else {
    run('UPDATE providers_documents SET pending_ref_no=NULL, pending_issued_on=NULL, pending_expires_on=NULL, pending_by=NULL, pending_at=NULL, updated_at=? WHERE id=?', t, d.id);
    history(p.id, 'renewal_rejected', user, { reason: `${DOC_KINDS[kind][0]}${note ? ` — ${clean(note, 300)}` : ''}` });
  }
  audit(user, `providers.document.${decision}`, p.id, { kind });
  logAccess(user, SYS, 'provider', p.id, `verify:${decision}`);
  for (const u of providerUserIds(p.id)) alert(u, { title: decision === 'accept' ? `تم التحقق من ${DOC_KINDS[kind][0]} المحدّثة` : `لم يُقبل تحديث ${DOC_KINDS[kind][0]} — راجع قسم المشتريات`, level: decision === 'accept' ? 'info' : 'warning', system: SYS, id: p.id });
  changed(SYS, recipients(p.id, { includeProvider: true }), p.id);
  return getProvider(user, p.id);
}
// Documents needing attention (providers.manage): expired, expiring soon, renewals awaiting verification.
export function documentsAttention(user) {
  if (!canManage(user)) throw new Forbidden('متاح لمسؤولي سجل مقدمي الخدمات');
  const t = today();
  const rows = all(`SELECT d.*, p.name_ar, p.name_en, p.status FROM providers_documents d JOIN providers_companies p ON p.id=d.provider_id
    WHERE p.status IN ('pending','approved','suspended') AND (d.pending_at IS NOT NULL OR d.expires_on IS NULL OR d.expires_on <= date(?, '+${EXPIRY_WARN_DAYS} days')) ORDER BY d.pending_at IS NULL, d.expires_on`, t);
  return rows.map((d) => ({ provider_id: d.provider_id, provider_ar: d.name_ar, provider_en: d.name_en, provider_status: d.status, ...pubDoc(d, d.kind) }));
}

// ---------------- contracts & evaluations ----------------
export const quarterOf = (iso = today()) => `${iso.slice(0, 4)}-Q${Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1}`;
function pubContract(c) {
  const p = providerBrief(c.provider_id);
  const period = quarterOf();
  const evaluated = !!one('SELECT 1 FROM providers_evaluations WHERE contract_id=? AND period=?', c.id, period);
  const last = one('SELECT score, period FROM providers_evaluations WHERE contract_id=? ORDER BY created_at DESC LIMIT 1', c.id);
  const dept = one('SELECT name_ar,name_en FROM departments WHERE id=?', c.department_id);
  return {
    id: c.id, number: c.number, title: c.title, provider: p, value: c.value, start_date: c.start_date, end_date: c.end_date, status: c.status,
    po_number: c.po_number, department_id: c.department_id, dept_ar: dept?.name_ar, dept_en: dept?.name_en, owner: userBrief(c.owner_id), is_demo: !!c.is_demo,
    period, evaluated_this_period: evaluated, last_score: last?.score ?? null, last_period: last?.period ?? null, source_ref: c.source_ref,
  };
}
export function listContracts(user, { mine, needs_evaluation } = {}) {
  requireStaff(user);
  const s = contractScope(user);
  const rows = all(`SELECT c.* FROM providers_contracts c WHERE ${s.sql} ${mine ? 'AND c.owner_id=?' : ''} ORDER BY c.start_date DESC`, ...s.params, ...(mine ? [user.id] : [])).map((c) => ({ ...pubContract(c), can_evaluate: c.owner_id === user.id && c.status !== 'terminated' }));
  return needs_evaluation ? rows.filter((c) => c.can_evaluate && !c.evaluated_this_period) : rows;
}
function visibleContract(user, id) {
  requireStaff(user);
  const s = contractScope(user);
  const c = one(`SELECT c.* FROM providers_contracts c WHERE c.id=? AND ${s.sql}`, id, ...s.params);
  if (!c) throw new NotFound('العقد غير موجود أو غير متاح لك');
  return c;
}
export function getContract(user, id) {
  const c = visibleContract(user, id);
  logAccess(user, SYS, 'contract', c.id, 'view');
  return {
    ...pubContract(c), can_evaluate: c.owner_id === user.id && c.status !== 'terminated',
    evaluations: all('SELECT * FROM providers_evaluations WHERE contract_id=? ORDER BY created_at DESC', c.id).map((e) => ({ id: e.id, period: e.period, quality: e.quality, timeliness: e.timeliness, compliance: e.compliance, score: e.score, comment: e.comment, evaluator: userBrief(e.evaluator_id), created_at: e.created_at })),
  };
}
// Performance evaluation by the contract owner (1–5 per criterion), once per contract per quarter.
export function evaluateContract(user, id, b) {
  const c = visibleContract(user, id);
  if (c.owner_id !== user.id) throw new Forbidden('يقيّم أداء المورد مالكُ العقد فقط');
  if (c.status === 'terminated') throw new Conflict('لا يمكن تقييم عقد منتهٍ بالإنهاء');
  if (c.start_date > today()) throw new Conflict('لم يبدأ تنفيذ العقد بعد');
  for (const k of ['quality', 'timeliness', 'compliance']) if (!Number.isInteger(b[k]) || b[k] < 1 || b[k] > 5) throw new BadRequest('كل معيار يُقيَّم من 1 إلى 5');
  const period = quarterOf();
  if (one('SELECT 1 FROM providers_evaluations WHERE contract_id=? AND period=?', c.id, period)) throw new Conflict('تم تقييم هذا العقد في الربع الحالي');
  const score = round((b.quality + b.timeliness + b.compliance) / 3, 2);
  const eid = uid('pe_');
  run('INSERT INTO providers_evaluations (id,contract_id,provider_id,evaluator_id,period,quality,timeliness,compliance,score,comment,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
    eid, c.id, c.provider_id, user.id, period, b.quality, b.timeliness, b.compliance, score, clean(b.comment, 1000) || null, now());
  audit(user, 'providers.evaluate', c.id, { period, score });
  logAccess(user, SYS, 'contract', c.id, 'evaluate');
  for (const u of providerUserIds(c.provider_id)) alert(u, { title: `صدر تقييم أداء جديد للعقد ${c.number}`, system: SYS, id: c.id });
  changed(SYS, [...recipients(c.provider_id, { includeProvider: true }), user.id], c.id);
  return getContract(user, c.id);
}
// Called by procurement when a purchase order is issued (never from a route).
export function createContract({ provider_id, title, department_id, owner_id, value, start_date, end_date, po_number, source = 'procurement', source_ref = null, request_id = null, created_by = null, is_demo = 0, number = null }) {
  if (!providerRow(provider_id)) throw new BadRequest('مورد غير موجود');
  const id = uid('ct_');
  const year = (start_date || today()).slice(0, 4);
  const n = number || `CN-${year}-${String((one("SELECT COUNT(*) n FROM providers_contracts WHERE number LIKE ?", `CN-${year}-%`).n || 0) + 112).padStart(4, '0')}`;
  run(`INSERT INTO providers_contracts (id,number,provider_id,title,department_id,owner_id,value,start_date,end_date,status,po_number,source,source_ref,request_id,created_by,created_at,is_demo) VALUES (?,?,?,?,?,?,?,?,?, 'active', ?,?,?,?,?,?,?)`,
    id, n, provider_id, clean(title, 200), department_id, owner_id, value, start_date, end_date, po_number, source, source_ref, request_id, created_by, now(), is_demo);
  changed(SYS, recipients(provider_id, { includeProvider: true }), id);
  return one('SELECT * FROM providers_contracts WHERE id=?', id);
}

// ---------------- vendor portal (external) ----------------
export function portalProvider(user) {
  if (!isExternal(user) || !hasCap(user, 'providers.portal')) throw new Forbidden('بوابة المورد مخصصة لحسابات مقدمي الخدمات');
  const p = providerOfUser(user.id);
  if (!p) throw new NotFound('حسابك غير مرتبط بمورد مسجّل — تواصل مع قسم المشتريات');
  return p;
}
export function portal(user) {
  const p = portalProvider(user);
  const docs = docsOf(p.id);
  const el = eligibilityOf(p, docs);
  const contracts = all('SELECT * FROM providers_contracts WHERE provider_id=? ORDER BY start_date DESC', p.id).map((c) => {
    const dept = one('SELECT name_ar,name_en FROM departments WHERE id=?', c.department_id);
    const ev = all('SELECT period,quality,timeliness,compliance,score,comment,created_at FROM providers_evaluations WHERE contract_id=? ORDER BY created_at DESC', c.id);
    return { id: c.id, number: c.number, title: c.title, value: c.value, start_date: c.start_date, end_date: c.end_date, status: c.status, po_number: c.po_number, dept_ar: dept?.name_ar, dept_en: dept?.name_en, evaluations: ev, is_demo: !!c.is_demo };
  });
  return {
    company: {
      id: p.id, name_ar: p.name_ar, name_en: p.name_en, category: p.category, categories: json(p.categories, [p.category]), status: p.status,
      contact_name: p.contact_name, contact_email: p.contact_email, contact_phone: p.contact_phone, is_demo: !!p.is_demo,
    },
    eligibility: el,
    documents: Object.keys(DOC_KINDS).map((k) => pubDoc(docs[k], k, { internal: false })),
    contracts,
    evaluation: ratingOf(p.id),
  };
}
export function portalContact(user, b) {
  const p = portalProvider(user);
  checkContact(b);
  run('UPDATE providers_companies SET contact_name=?, contact_email=?, contact_phone=?, updated_at=? WHERE id=?',
    b.contact_name !== undefined ? clean(b.contact_name, 120) : p.contact_name, b.contact_email !== undefined ? clean(b.contact_email, 160) : p.contact_email, b.contact_phone !== undefined ? clean(b.contact_phone, 40) : p.contact_phone, now(), p.id);
  history(p.id, 'contact', user);
  audit(user, 'providers.portal.contact', p.id);
  changed(SYS, recipients(p.id, { includeProvider: true }), p.id);
  return portal(user);
}
// A provider submits renewed document metadata; it only counts after Procurement verifies it.
export function portalRenewal(user, kind, b) {
  const p = portalProvider(user);
  if (!DOC_KINDS[kind]) throw new NotFound('نوع وثيقة غير معروف');
  if (p.status === 'blacklisted') throw new Conflict('لا يمكن تحديث وثائق مورد موقوف التعامل معه');
  validDocDates(b);
  if (b.expires_on < today()) throw new BadRequest('الوثيقة المحدّثة منتهية الصلاحية');
  const t = now();
  run(`INSERT INTO providers_documents (id,provider_id,kind,pending_ref_no,pending_issued_on,pending_expires_on,pending_by,pending_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)
    ON CONFLICT(provider_id,kind) DO UPDATE SET pending_ref_no=excluded.pending_ref_no, pending_issued_on=excluded.pending_issued_on, pending_expires_on=excluded.pending_expires_on, pending_by=excluded.pending_by, pending_at=excluded.pending_at, updated_at=excluded.updated_at`,
  uid('pd_'), p.id, kind, clean(b.ref_no, 60) || null, b.issued_on || null, b.expires_on, user.id, t, t);
  history(p.id, 'renewal', user, { reason: DOC_KINDS[kind][0] });
  audit(user, 'providers.portal.renewal', p.id, { kind, expires_on: b.expires_on });
  for (const m of usersWithCap('providers.manage')) alert(m, { title: `تحديث وثيقة بانتظار التحقق: ${p.name_ar}`, body: DOC_KINDS[kind][0], system: SYS, id: p.id });
  changed(SYS, recipients(p.id, { includeProvider: true }), p.id);
  return portal(user);
}

// ---------------- summary for the UI & workspace ----------------
export function me(user) {
  if (isExternal(user)) {
    const p = providerOfUser(user.id);
    return { external: true, provider: p ? { id: p.id, name_ar: p.name_ar, name_en: p.name_en, status: p.status } : null, roles: { portal: !!p } };
  }
  const manage = canManage(user);
  const contractsToEvaluate = listContracts(user, { needs_evaluation: true }).length;
  const attention = manage ? documentsAttention(user) : [];
  return {
    external: false,
    roles: { manage, full: fullView(user), owner: !!one('SELECT 1 FROM providers_contracts WHERE owner_id=?', user.id) },
    counts: {
      providers: listProviders(user).length,
      pending: manage ? one("SELECT COUNT(*) n FROM providers_companies WHERE status='pending'").n : 0,
      renewals: attention.filter((d) => d.pending).length,
      expired: attention.filter((d) => d.state === 'expired').length,
      expiring: attention.filter((d) => d.state === 'expiring').length,
      to_evaluate: contractsToEvaluate,
    },
  };
}
export function workspace(user) {
  if (isExternal(user)) {
    const p = providerOfUser(user.id);
    if (!p) return [];
    const docs = docsOf(p.id);
    const bad = Object.entries(docs).filter(([, d]) => ['expired', 'expiring', 'missing'].includes(docState(d)));
    const ev = ratingOf(p.id);
    return [{
      title_ar: 'ملف شركتي', title_en: 'My company file', value: ev.rating, unit_ar: ev.rating != null ? 'من 5' : '', unit_en: ev.rating != null ? 'of 5' : '',
      tone: bad.some(([, d]) => docState(d) === 'expired') ? 'crit' : bad.length ? 'warn' : 'good',
      hint_ar: bad.length ? `${bad.length} وثيقة تحتاج تحديثاً` : 'الوثائق سارية', hint_en: bad.length ? `${bad.length} document(s) need renewal` : 'Documents valid',
      href: '#/sys/providers/company',
      items: bad.slice(0, 3).map(([k, d]) => ({ title: DOC_KINDS[k][0], meta_ar: d?.expires_on ? `تنتهي ${d.expires_on}` : 'غير مسجّلة', meta_en: d?.expires_on ? `expires ${d.expires_on}` : 'missing', href: '#/sys/providers/company' })),
      cta: { label_ar: 'تحديث الوثائق', label_en: 'Update documents', href: '#/sys/providers/company' },
    }];
  }
  const cards = [];
  if (canManage(user)) {
    const att = documentsAttention(user);
    const pending = one("SELECT COUNT(*) n FROM providers_companies WHERE status='pending'").n;
    const n = att.length + pending;
    cards.push({
      title_ar: 'سجل الموردين: يحتاج انتباهك', title_en: 'Provider registry: needs you', value: n, unit_ar: 'بند', unit_en: 'items',
      tone: att.some((d) => d.state === 'expired') ? 'crit' : n ? 'warn' : 'good',
      hint_ar: `${pending} بانتظار التأهيل · ${att.filter((d) => d.pending).length} تحديث وثائق · ${att.filter((d) => d.state === 'expired').length} منتهية`,
      hint_en: `${pending} pending · ${att.filter((d) => d.pending).length} renewals · ${att.filter((d) => d.state === 'expired').length} expired`,
      href: '#/sys/providers/documents',
      items: att.slice(0, 3).map((d) => ({ title: `${d.provider_ar} — ${d.name_ar}`, meta_ar: d.pending ? 'بانتظار التحقق' : d.state === 'expired' ? 'منتهية' : `تنتهي ${d.expires_on}`, meta_en: d.pending ? 'awaiting verification' : d.state === 'expired' ? 'expired' : `expires ${d.expires_on}`, href: `#/sys/providers/registry/${d.provider_id}` })),
      cta: { label_ar: 'مراجعة الوثائق', label_en: 'Review documents', href: '#/sys/providers/documents' },
    });
  }
  const toEval = listContracts(user, { needs_evaluation: true });
  if (toEval.length) {
    cards.push({
      title_ar: 'تقييم أداء الموردين', title_en: 'Supplier performance reviews', value: toEval.length, unit_ar: 'عقد', unit_en: 'contracts', tone: 'emph',
      hint_ar: `عقود تملكها لم تُقيَّم في ${quarterOf()}`, hint_en: `Contracts you own not yet reviewed in ${quarterOf()}`,
      href: '#/sys/providers/contracts',
      items: toEval.slice(0, 3).map((c) => ({ title: `${c.number} — ${c.provider?.name_ar || ''}`, meta_ar: c.title, meta_en: c.title, href: `#/sys/providers/contracts/${c.id}` })),
      cta: { label_ar: 'قيّم الآن', label_en: 'Review now', href: '#/sys/providers/contracts' },
    });
  }
  return cards.slice(0, 3);
}
export function gameEvents(userId) {
  return all('SELECT e.id, e.created_at, c.number FROM providers_evaluations e JOIN providers_contracts c ON c.id=e.contract_id WHERE e.evaluator_id=?', userId)
    .map((e) => ({ kind: 'provider_evaluation', points: 8, at: e.created_at, ref: e.number, id: `pev:${e.id}` }));
}
