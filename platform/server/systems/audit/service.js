// Internal Audit — domain services. Every function takes the authenticated user
// and enforces authorisation itself (routes and Ask AI tools share them).
// Records outside the user's scope → 404; forbidden actions on visible records → 403.
import {
  one, all, run, uid, now, today, tx, Forbidden, NotFound, BadRequest, Conflict,
  isStaff, requireStaff, logAccess, accessLog, audit, changed, alert, transition, inList, daysBetween, clean, userBrief, deptBrief, requireConfirm, aiAllowed,
} from '../kit.js';
import * as D from '../../services/documents.js';
import { complete } from '../../ai/services.js';
import {
  KEY, isIA, isHead, isCommittee, isExtAuditor, auditeeDepts, isAuditeeOf,
  findingScope, engagementScope, requestScope, extScope, canSeeFinding,
  iaIds, headIds, committeeIds, managersOf, auditeeManager, findingAudience, engagementAudience,
} from './access.js';
import { localSummary, reportHtml, RISK_AR } from './report.js';

export const PHASES = ['planned', 'planning', 'fieldwork', 'reporting', 'follow_up', 'closed'];
const PHASE_AR = { planned: 'مخطط لها', planning: 'التخطيط', fieldwork: 'العمل الميداني', reporting: 'إعداد التقرير', follow_up: 'المتابعة', closed: 'مغلقة' };
const FINDING_AR = { draft: 'مسودة', issued: 'صادرة — بانتظار رد الإدارة', in_follow_up: 'قيد المعالجة', implemented: 'منفذة — بانتظار التحقق', closed: 'مغلقة' };
const REQ_AR = { open: 'مفتوح', responded: 'تم الرد', returned: 'معاد للاستكمال', accepted: 'مقبول' };
const EXT_AR = { submitted: 'مستلم', assigned: 'لدى الإدارة المختصة', prepared: 'بانتظار مراجعة التدقيق', released: 'تم الرد' };
const OPEN_FINDING = ['issued', 'in_follow_up', 'implemented'];

export const year = () => new Date().getUTCFullYear();
const brief = (id) => { const u = userBrief(id); return u ? { id: u.id, name_ar: u.name_ar, name_en: u.name_en, title_ar: u.title_ar, title_en: u.title_en, dept_ar: u.dept_ar, dept_en: u.dept_en } : null; };
const deptOf = (id) => { const d = deptBrief(id); return d ? { id: d.id, name_ar: d.name_ar, name_en: d.name_en } : null; };
const isOverdue = (due, doneStates, status) => !!due && due < today() && !doneStates.includes(status);
const staffUser = (id) => one("SELECT id,role,department_id FROM users WHERE id=? AND active=1 AND user_type='staff'", id);

// ---------------- document links (responder's own documents only) ----------------
function linkDocs(user, kind, refId, docIds = [], { replace = false } = {}) {
  const ids = [...new Set(docIds || [])];
  if (ids.length > 10) throw new BadRequest('يمكن إرفاق 10 مستندات كحد أقصى');
  const docs = ids.map((id) => {
    const d = one('SELECT id,title FROM documents WHERE id=? AND owner_id=? AND deleted_at IS NULL', id, user.id);
    if (!d) throw new BadRequest('يمكن إرفاق مستنداتك أنت فقط من وحدة المستندات');
    return d;
  });
  if (replace) run('DELETE FROM audit_links WHERE kind=? AND ref_id=? AND linked_by=?', kind, refId, user.id);
  for (const d of docs) {
    if (one('SELECT 1 FROM audit_links WHERE kind=? AND ref_id=? AND document_id=?', kind, refId, d.id)) continue;
    run('INSERT INTO audit_links (id,kind,ref_id,document_id,title,linked_by,linked_at) VALUES (?,?,?,?,?,?,?)', uid('al_'), kind, refId, d.id, d.title, user.id, now());
  }
}
const linksOf = (kind, refId) => all('SELECT id,title,document_id,linked_by,linked_at FROM audit_links WHERE kind=? AND ref_id=? ORDER BY linked_at', kind, refId)
  .map((l) => ({ id: l.id, title: l.title, linked_at: l.linked_at, missing: !one('SELECT 1 FROM documents WHERE id=? AND deleted_at IS NULL', l.document_id) }));

// View a linked document through the record that carries it (never through the
// Documents module's sharing): allowed only when the viewer may see that record.
export function viewLink(user, id) {
  const l = one('SELECT * FROM audit_links WHERE id=?', id);
  if (!l) throw new NotFound();
  let ok = false;
  if (l.kind === 'pbc') { const s = requestScope(user); ok = !!one(`SELECT 1 FROM audit_requests r WHERE r.id=? AND ${s.sql}`, l.ref_id, ...s.params); }
  else if (l.kind === 'ext') {
    const x = one('SELECT * FROM audit_ext_requests WHERE id=?', l.ref_id);
    ok = !!x && (isIA(user) || (isStaff(user) && x.assigned_to === user.id) || (isExtAuditor(user) && x.requester_id === user.id && x.status === 'released'));
  } else if (l.kind === 'action') ok = canSeeFinding(user, l.ref_id);
  if (!ok) throw new NotFound();
  logAccess(user, KEY, 'link', id, 'view');
  if (l.kind === 'ext' && isExtAuditor(user) && l.released_html != null) return { id: l.id, title: l.released_title || l.title, content_html: l.released_html, updated_at: null, missing: false };
  const d = one('SELECT title,content_html,updated_at FROM documents WHERE id=? AND deleted_at IS NULL', l.document_id);
  return { id: l.id, title: d?.title || l.title, content_html: d?.content_html || '', updated_at: d?.updated_at || null, missing: !d };
}

// ---------------- roles summary (drives the UI landing tab) ----------------
export function me(user) {
  const ia = isIA(user); const head = isHead(user); const committee = isCommittee(user); const ext = isExtAuditor(user);
  const depts = auditeeDepts(user);
  const ownsActions = isStaff(user) && !!one("SELECT 1 FROM audit_actions a JOIN audit_findings f ON f.id=a.finding_id WHERE a.owner_id=? AND f.status<>'draft' AND f.withdrawn_at IS NULL", user.id);
  const auditee = depts.length > 0 && !!one(`SELECT 1 FROM audit_engagements WHERE department_id IN (${inList(depts)}) AND phase<>'planned' LIMIT 1`, ...depts);
  const t = today();
  const counts = {};
  if (depts.length) {
    counts.awaiting_response = one(`SELECT COUNT(*) n FROM audit_findings f WHERE f.status='issued' AND f.withdrawn_at IS NULL AND f.department_id IN (${inList(depts)})`, ...depts).n;
  }
  if (isStaff(user)) {
    counts.my_requests_open = one("SELECT COUNT(*) n FROM audit_requests WHERE to_user_id=? AND status IN ('open','returned')", user.id).n;
    counts.my_ext_open = one("SELECT COUNT(*) n FROM audit_ext_requests WHERE assigned_to=? AND status='assigned'", user.id).n;
    counts.my_actions_open = one("SELECT COUNT(*) n FROM audit_actions a JOIN audit_findings f ON f.id=a.finding_id WHERE a.owner_id=? AND a.status IN ('open','in_progress') AND f.withdrawn_at IS NULL", user.id).n;
    counts.my_actions_overdue = one("SELECT COUNT(*) n FROM audit_actions a JOIN audit_findings f ON f.id=a.finding_id WHERE a.owner_id=? AND a.status IN ('open','in_progress') AND a.due_date<? AND f.withdrawn_at IS NULL", user.id, t).n;
  }
  if (ia) {
    counts.engagements_open = one("SELECT COUNT(*) n FROM audit_engagements WHERE phase NOT IN ('planned','closed')").n;
    counts.requests_overdue = one("SELECT COUNT(*) n FROM audit_requests WHERE status IN ('open','returned') AND due_date<?", t).n;
    counts.requests_to_review = one("SELECT COUNT(*) n FROM audit_requests WHERE status='responded'").n;
    counts.ext_pending = one("SELECT COUNT(*) n FROM audit_ext_requests WHERE status IN ('submitted','prepared')").n;
    counts.closures_pending = one("SELECT COUNT(*) n FROM audit_findings WHERE status='implemented' AND withdrawn_at IS NULL").n;
    counts.drafts = one("SELECT COUNT(*) n FROM audit_findings WHERE status='draft' AND withdrawn_at IS NULL").n;
  }
  if (ext) counts.ext_mine_open = one("SELECT COUNT(*) n FROM audit_ext_requests WHERE requester_id=? AND status<>'released'", user.id).n;
  return { year: year(), roles: { ia, head, auditor: ia, committee, external: ext, auditee, auditee_depts: depts, owner: ownsActions }, counts };
}

// ---------------- plan & audit universe ----------------
const rating = (score) => (score >= 15 ? 'high' : score >= 8 ? 'medium' : 'low');
function requirePlanReader(user) { if (!isIA(user) && !isCommittee(user)) throw new Forbidden('خطة التدقيق متاحة لمكتب التدقيق الداخلي ولجنة التدقيق فقط'); }
function requireIA(user) { if (!isIA(user)) throw new Forbidden('هذا الإجراء متاح لمكتب التدقيق الداخلي فقط'); }
function requireHead(user) { if (!isHead(user)) throw new Forbidden('هذا الإجراء يتطلب صلاحية رئيس التدقيق الداخلي'); }

export function ensurePlan(y, userId = null) {
  let p = one('SELECT * FROM audit_plans WHERE year=?', y);
  if (!p) { run('INSERT INTO audit_plans (id,year,status,created_by,created_at) VALUES (?,?,?,?,?)', uid('ap_'), y, 'draft', userId, now()); p = one('SELECT * FROM audit_plans WHERE year=?', y); }
  return p;
}
const decorateUniverse = (u, y) => ({
  ...u, is_demo: !!u.is_demo, active: !!u.active, score: u.likelihood * u.impact, rating: rating(u.likelihood * u.impact), department: deptOf(u.department_id),
  engagements: all('SELECT id,title,quarter,phase FROM audit_engagements WHERE universe_id=? AND plan_year=? ORDER BY quarter', u.id, y),
});

export function getPlan(user, { year: y = year() } = {}) {
  requirePlanReader(user);
  y = Number(y) || year();
  const plan = one('SELECT * FROM audit_plans WHERE year=?', y);
  const universe = all('SELECT * FROM audit_universe WHERE active=1 ORDER BY likelihood*impact DESC, name_ar').map((u) => decorateUniverse(u, y));
  const engagements = listEngagements(user, { year: y });
  const coveredHigh = universe.filter((u) => u.rating === 'high' && u.engagements.length).length;
  return {
    year: y,
    plan: plan ? { ...plan, is_demo: !!plan.is_demo, submitted_by_user: brief(plan.submitted_by), approved_by_user: brief(plan.approved_by) } : { year: y, status: 'draft', missing: true },
    universe, engagements,
    stats: {
      engagements: engagements.length,
      by_quarter: [1, 2, 3, 4].map((q) => engagements.filter((e) => e.quarter === q).length),
      high_risk: universe.filter((u) => u.rating === 'high').length, high_risk_covered: coveredHigh,
      completed: engagements.filter((e) => e.report_issued_at).length,
    },
    can: {
      edit: isIA(user),
      submit: isIA(user) && (!plan || plan.status === 'draft') && engagements.length > 0,
      approve: isHead(user) && plan?.status === 'submitted' && plan.submitted_by !== user.id,
      approve_blocked_sod: isHead(user) && plan?.status === 'submitted' && plan.submitted_by === user.id,
      return: isHead(user) && plan?.status === 'submitted',
    },
  };
}

export function submitPlan(user, { year: y = year(), notes }) {
  requireIA(user);
  const p = ensurePlan(y, user.id);
  transition(p.status, 'submitted', { draft: ['submitted'] }, { draft: 'مسودة', submitted: 'مرفوعة للاعتماد', approved: 'معتمدة' });
  if (!one('SELECT 1 FROM audit_engagements WHERE plan_year=?', y)) throw new Conflict('أضف مهمة تدقيق واحدة على الأقل قبل رفع الخطة للاعتماد');
  run('UPDATE audit_plans SET status=?, notes=COALESCE(?,notes), submitted_by=?, submitted_at=?, updated_at=? WHERE id=?', 'submitted', notes != null ? clean(notes, 2000) : null, user.id, now(), now(), p.id);
  audit(user, 'audit.plan.submit', p.id, { year: y });
  for (const h of headIds()) if (h !== user.id) alert(h, { level: 'info', title: `خطة التدقيق لعام ${y} بانتظار اعتمادك`, system: KEY, id: p.id });
  changed(KEY, [...iaIds(), ...committeeIds()], p.id);
  return getPlan(user, { year: y });
}
export function approvePlan(user, { year: y = year() }) {
  requireHead(user);
  const p = one('SELECT * FROM audit_plans WHERE year=?', y);
  if (!p) throw new NotFound();
  transition(p.status, 'approved', { submitted: ['approved'] }, { draft: 'مسودة', submitted: 'مرفوعة للاعتماد', approved: 'معتمدة' });
  if (p.submitted_by === user.id) throw new Forbidden('فصل المهام: لا يمكنك اعتماد خطة رفعتها بنفسك');
  run('UPDATE audit_plans SET status=?, approved_by=?, approved_at=?, updated_at=? WHERE id=?', 'approved', user.id, now(), now(), p.id);
  audit(user, 'audit.plan.approve', p.id, { year: y });
  for (const c of committeeIds()) alert(c, { level: 'info', title: `اعتُمدت خطة التدقيق الداخلي لعام ${y}`, system: KEY, id: p.id });
  changed(KEY, [...iaIds(), ...committeeIds()], p.id);
  return getPlan(user, { year: y });
}
export function returnPlan(user, { year: y = year(), note }) {
  requireHead(user);
  const p = one('SELECT * FROM audit_plans WHERE year=?', y);
  if (!p) throw new NotFound();
  transition(p.status, 'draft', { submitted: ['draft'] }, { draft: 'مسودة', submitted: 'مرفوعة للاعتماد', approved: 'معتمدة' });
  if (!clean(note)) throw new BadRequest('اذكر سبب الإعادة');
  run('UPDATE audit_plans SET status=?, notes=?, updated_at=? WHERE id=?', 'draft', clean(note, 2000), now(), p.id);
  audit(user, 'audit.plan.return', p.id, { year: y });
  if (p.submitted_by) alert(p.submitted_by, { level: 'warning', title: `أُعيدت خطة التدقيق لعام ${y} للتعديل`, body: clean(note, 300), system: KEY, id: p.id });
  changed(KEY, iaIds(), p.id);
  return getPlan(user, { year: y });
}

function internalDept(id) {
  const d = one('SELECT id FROM departments WHERE id=? AND is_external=0', id);
  if (!d) throw new BadRequest('إدارة غير صالحة');
  return d.id;
}
export function addUniverse(user, b) {
  requireIA(user);
  const id = uid('au_');
  run('INSERT INTO audit_universe (id,name_ar,name_en,department_id,likelihood,impact,rationale,updated_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, clean(b.name_ar, 200), clean(b.name_en, 200), internalDept(b.department_id), b.likelihood, b.impact, clean(b.rationale, 2000), user.id, now(), now());
  audit(user, 'audit.universe.add', id, { likelihood: b.likelihood, impact: b.impact });
  changed(KEY, [...iaIds(), ...committeeIds()], id);
  return decorateUniverse(one('SELECT * FROM audit_universe WHERE id=?', id), year());
}
export function updateUniverse(user, id, b) {
  requireIA(user);
  const u = one('SELECT * FROM audit_universe WHERE id=?', id);
  if (!u) throw new NotFound();
  const next = { likelihood: b.likelihood ?? u.likelihood, impact: b.impact ?? u.impact, rationale: b.rationale != null ? clean(b.rationale, 2000) : u.rationale, active: b.active == null ? u.active : b.active ? 1 : 0 };
  run('UPDATE audit_universe SET likelihood=?, impact=?, rationale=?, active=?, updated_by=?, updated_at=? WHERE id=?', next.likelihood, next.impact, next.rationale, next.active, user.id, now(), id);
  audit(user, 'audit.universe.update', id, { from: { likelihood: u.likelihood, impact: u.impact }, to: { likelihood: next.likelihood, impact: next.impact } });
  changed(KEY, [...iaIds(), ...committeeIds()], id);
  return decorateUniverse(one('SELECT * FROM audit_universe WHERE id=?', id), year());
}

// ---------------- engagements ----------------
const team = (id) => all('SELECT u.id,u.name_ar,u.name_en,u.title_ar,u.title_en FROM audit_team t JOIN users u ON u.id=t.user_id WHERE t.engagement_id=? ORDER BY u.name_ar', id);
function decorateEngagement(e, user) {
  const ia = isIA(user);
  const fs = findingScope(user);
  const fr = one(`SELECT COUNT(*) n, SUM(f.status='draft') drafts, SUM(f.status IN ('issued','in_follow_up','implemented')) open, SUM(f.status='closed') closed,
    SUM(f.risk='high') high, SUM(f.risk='medium') medium, SUM(f.risk='low') low FROM audit_findings f WHERE f.engagement_id=? AND ${fs.sql}`, e.id, ...fs.params);
  const rs = requestScope(user);
  const rq = one(`SELECT COUNT(*) n, SUM(r.status IN ('open','returned')) open, SUM(r.status IN ('open','returned') AND r.due_date<?) overdue, SUM(r.status='responded') to_review
    FROM audit_requests r WHERE r.engagement_id=? AND ${rs.sql}`, today(), e.id, ...rs.params);
  const u = e.universe_id ? one('SELECT likelihood,impact FROM audit_universe WHERE id=?', e.universe_id) : null;
  const out = {
    id: e.id, title: e.title, plan_year: e.plan_year, quarter: e.quarter, phase: e.phase, phase_index: PHASES.indexOf(e.phase),
    department: deptOf(e.department_id), department_id: e.department_id, scope: e.scope, objectives: e.objectives,
    start_date: e.start_date, end_date: e.end_date, started_at: e.started_at, closed_at: e.closed_at,
    lead: brief(e.lead_id), team: team(e.id), report_issued_at: e.report_issued_at, report_issued_by: brief(e.report_issued_by),
    added_after_approval: !!e.added_after_approval, is_demo: !!e.is_demo,
    risk_score: u && (ia || isCommittee(user)) ? u.likelihood * u.impact : null,
    findings: { total: fr.n || 0, drafts: ia ? fr.drafts || 0 : 0, open: fr.open || 0, closed: fr.closed || 0, high: fr.high || 0, medium: fr.medium || 0, low: fr.low || 0 },
    requests: { total: rq.n || 0, open: rq.open || 0, overdue: rq.overdue || 0, to_review: rq.to_review || 0 },
    overdue: !!e.end_date && e.end_date < today() && !['follow_up', 'closed'].includes(e.phase),
    mine: e.lead_id === user.id || !!one('SELECT 1 FROM audit_team WHERE engagement_id=? AND user_id=?', e.id, user.id),
  };
  if (ia) out.workpapers = one("SELECT COUNT(*) n, SUM(status='draft') draft FROM audit_workpapers WHERE engagement_id=?", e.id);
  return out;
}
export function listEngagements(user, { year: y, phase, department_id } = {}) {
  requireStaff(user);
  const s = engagementScope(user);
  let sql = `SELECT e.* FROM audit_engagements e WHERE ${s.sql}`; const params = [...s.params];
  if (y) { sql += ' AND e.plan_year=?'; params.push(Number(y)); }
  if (phase) { sql += ' AND e.phase=?'; params.push(phase); }
  if (department_id) { sql += ' AND e.department_id=?'; params.push(department_id); }
  sql += ' ORDER BY e.plan_year DESC, e.quarter, e.title';
  return all(sql, ...params).map((e) => decorateEngagement(e, user));
}
function loadEngagement(user, id) {
  const s = engagementScope(user);
  const e = one(`SELECT e.* FROM audit_engagements e WHERE e.id=? AND ${s.sql}`, id, ...s.params);
  if (!e) throw new NotFound('مهمة التدقيق غير موجودة أو غير متاحة لك');
  return e;
}
const onTeam = (user, e) => e.lead_id === user.id || !!one('SELECT 1 FROM audit_team WHERE engagement_id=? AND user_id=?', e.id, user.id);
const canWork = (user, e) => isIA(user) && (isHead(user) || onTeam(user, e));

export function getEngagement(user, id) {
  const e = loadEngagement(user, id);
  const ia = isIA(user);
  const out = decorateEngagement(e, user);
  const reportIssued = !!e.report_issued_at;
  out.requests_list = ia || isAuditeeOf(user, e.department_id) ? listRequests(user, { engagement_id: id }) : [];
  out.findings_list = listFindings(user, { engagement_id: id });
  out.report = {
    issued_at: e.report_issued_at, issued_by: brief(e.report_issued_by),
    exec_summary: ia || reportIssued ? e.exec_summary : null,
    doc_id: e.report_doc_id && one('SELECT 1 FROM documents d WHERE d.id=? AND d.deleted_at IS NULL AND (d.owner_id=? OR EXISTS (SELECT 1 FROM document_shares s WHERE s.document_id=d.id AND s.user_id=?))', e.report_doc_id, user.id, user.id) ? e.report_doc_id : null,
  };
  const drafts = ia ? one("SELECT COUNT(*) n FROM audit_findings WHERE engagement_id=? AND status='draft' AND withdrawn_at IS NULL", id).n : 0;
  const open = one("SELECT COUNT(*) n FROM audit_findings WHERE engagement_id=? AND status IN ('issued','in_follow_up','implemented') AND withdrawn_at IS NULL", id).n;
  const work = canWork(user, e); const manage = isHead(user) || (ia && e.lead_id === user.id);
  const next = { planned: 'planning', planning: 'fieldwork', fieldwork: 'reporting' }[e.phase] || null;
  out.can = {
    edit: ia && e.phase !== 'closed',
    advance: manage && !!next ? next : null,
    add_request: work && ['planning', 'fieldwork', 'reporting'].includes(e.phase),
    add_workpaper: work && ['planning', 'fieldwork', 'reporting'].includes(e.phase),
    add_finding: work && ['fieldwork', 'reporting'].includes(e.phase),
    draft_summary: work && ['reporting'].includes(e.phase),
    edit_summary: work && e.phase === 'reporting',
    issue_report: isHead(user) && e.phase === 'reporting' && drafts === 0,
    issue_report_blocked: isHead(user) && e.phase === 'reporting' && drafts > 0 ? drafts : 0,
    close: isHead(user) && e.phase === 'follow_up' && open === 0,
    close_blocked: isHead(user) && e.phase === 'follow_up' && open > 0 ? open : 0,
    workpapers: ia,
  };
  out.viewer = { ia, head: isHead(user), committee: isCommittee(user), auditee: isAuditeeOf(user, e.department_id) };
  return out;
}

const engagementSchemaFields = (b) => ({
  title: b.title != null ? clean(b.title, 200) : undefined, scope: b.scope != null ? clean(b.scope, 3000) : undefined,
  objectives: b.objectives != null ? clean(b.objectives, 3000) : undefined,
});
function validTeam(ids = []) {
  const set = [...new Set(ids)];
  if (set.length > 8) throw new BadRequest('فريق المهمة 8 أعضاء كحد أقصى');
  const ia = new Set(iaIds());
  for (const id of set) if (!ia.has(id)) throw new BadRequest('أعضاء الفريق يجب أن يكونوا من مكتب التدقيق الداخلي');
  return set;
}
export function createEngagement(user, b) {
  requireIA(user);
  const y = Number(b.plan_year) || year();
  const dept = internalDept(b.department_id);
  if (b.universe_id) { const u = one('SELECT department_id FROM audit_universe WHERE id=?', b.universe_id); if (!u || u.department_id !== dept) throw new BadRequest('عنصر مجال التدقيق لا يتبع الإدارة المختارة'); }
  const lead = b.lead_id || user.id;
  const teamIds = validTeam([lead, ...(b.team || [])]);
  if (b.start_date && b.end_date && b.end_date < b.start_date) throw new BadRequest('تاريخ النهاية قبل تاريخ البداية');
  const plan = ensurePlan(y, user.id);
  const id = uid('ae_');
  const f = engagementSchemaFields(b);
  tx(() => {
    run(`INSERT INTO audit_engagements (id,plan_year,universe_id,title,department_id,scope,objectives,quarter,phase,lead_id,start_date,end_date,added_after_approval,created_by,created_at,updated_at)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, y, b.universe_id || null, f.title, dept, f.scope || '', f.objectives || '', b.quarter, 'planned', lead, b.start_date || null, b.end_date || null,
    plan.status === 'approved' ? 1 : 0, user.id, now(), now());
    for (const t of teamIds) run('INSERT INTO audit_team (engagement_id,user_id) VALUES (?,?)', id, t);
  });
  audit(user, 'audit.engagement.create', id, { title: f.title, department_id: dept, quarter: b.quarter, after_approval: plan.status === 'approved' });
  changed(KEY, [...iaIds(), ...committeeIds()], id);
  return getEngagement(user, id);
}
export function updateEngagement(user, id, b) {
  requireIA(user);
  const e = loadEngagement(user, id);
  if (e.phase === 'closed') throw new Conflict('لا يمكن تعديل مهمة مغلقة');
  if (b.quarter != null && e.phase !== 'planned') throw new Conflict('يُعدَّل ربع التنفيذ قبل بدء المهمة فقط');
  const f = engagementSchemaFields(b);
  const start = b.start_date !== undefined ? b.start_date : e.start_date; const end = b.end_date !== undefined ? b.end_date : e.end_date;
  if (start && end && end < start) throw new BadRequest('تاريخ النهاية قبل تاريخ البداية');
  tx(() => {
    run('UPDATE audit_engagements SET title=?, scope=?, objectives=?, quarter=?, lead_id=?, start_date=?, end_date=?, updated_at=? WHERE id=?',
      f.title || e.title, f.scope ?? e.scope, f.objectives ?? e.objectives, b.quarter ?? e.quarter, b.lead_id || e.lead_id, start || null, end || null, now(), id);
    if (b.team || b.lead_id) {
      const teamIds = validTeam([b.lead_id || e.lead_id, ...(b.team || team(id).map((t) => t.id))]);
      run('DELETE FROM audit_team WHERE engagement_id=?', id);
      for (const t of teamIds) run('INSERT INTO audit_team (engagement_id,user_id) VALUES (?,?)', id, t);
    }
  });
  audit(user, 'audit.engagement.update', id, { fields: Object.keys(b) });
  changed(KEY, engagementAudience({ ...e }), id);
  return getEngagement(user, id);
}

export function advancePhase(user, id, { to }) {
  requireIA(user);
  const e = loadEngagement(user, id);
  if (!(isHead(user) || e.lead_id === user.id)) throw new Forbidden('يغيّر مرحلة المهمة قائدُها أو رئيس التدقيق');
  if (to === 'follow_up') throw new Conflict('تنتقل المهمة إلى المتابعة عند إصدار التقرير من رئيس التدقيق');
  if (to === 'closed') return closeEngagement(user, id);
  transition(e.phase, to, { planned: ['planning'], planning: ['fieldwork'], fieldwork: ['reporting'] }, PHASE_AR);
  run('UPDATE audit_engagements SET phase=?, started_at=COALESCE(started_at, ?), updated_at=? WHERE id=?', to, to === 'planning' ? now() : null, now(), id);
  audit(user, 'audit.engagement.phase', id, { from: e.phase, to });
  if (to === 'planning') {
    const m = auditeeManager(e.department_id);
    if (m) alert(m, { level: 'info', title: `بدء مهمة تدقيق على إدارتكم: ${e.title}`, body: 'سيتواصل معكم فريق التدقيق الداخلي بطلبات المعلومات اللازمة.', system: KEY, id });
  }
  changed(KEY, engagementAudience({ ...e, phase: to }), id);
  return getEngagement(user, id);
}
function closeEngagement(user, id) {
  requireHead(user);
  const e = loadEngagement(user, id);
  transition(e.phase, 'closed', { follow_up: ['closed'] }, PHASE_AR);
  const open = one("SELECT COUNT(*) n FROM audit_findings WHERE engagement_id=? AND status IN ('issued','in_follow_up','implemented') AND withdrawn_at IS NULL", id).n;
  if (open) throw new Conflict(`لا يمكن إغلاق المهمة: ${open} ملاحظة ما زالت مفتوحة`);
  run('UPDATE audit_engagements SET phase=?, closed_at=?, updated_at=? WHERE id=?', 'closed', now(), now(), id);
  audit(user, 'audit.engagement.close', id, {});
  changed(KEY, engagementAudience(e), id);
  return getEngagement(user, id);
}

export function saveSummary(user, id, { exec_summary }) {
  requireIA(user);
  const e = loadEngagement(user, id);
  if (!canWork(user, e)) throw new Forbidden('يحرر الملخص فريق المهمة أو رئيس التدقيق');
  if (e.phase !== 'reporting') throw new Conflict('يُحرَّر الملخص التنفيذي في مرحلة إعداد التقرير');
  run('UPDATE audit_engagements SET exec_summary=?, updated_at=? WHERE id=?', clean(exec_summary, 6000), now(), id);
  audit(user, 'audit.engagement.summary', id, {});
  changed(KEY, iaIds(), id);
  return getEngagement(user, id);
}

function reportFindings(engagementId) {
  return all("SELECT * FROM audit_findings WHERE engagement_id=? AND status<>'draft' AND withdrawn_at IS NULL ORDER BY CASE risk WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, ref", engagementId).map((f) => {
    const a = one('SELECT a.*, u.name_ar owner_name_ar FROM audit_actions a JOIN users u ON u.id=a.owner_id WHERE a.finding_id=?', f.id);
    return { ...f, action: a };
  });
}

// Executive-summary draft: a model when one is connected AND the user opted in to
// share audit findings with Ask AI (the domain is opt-in); otherwise a transparent
// deterministic draft. Working papers are never sent anywhere.
export async function draftSummary(user, id) {
  requireIA(user);
  const e0 = loadEngagement(user, id);
  if (!canWork(user, e0)) throw new Forbidden('يُعدّ الملخص فريق المهمة أو رئيس التدقيق');
  const e = { ...e0, dept_ar: deptOf(e0.department_id)?.name_ar || '' };
  const findings = reportFindings(id);
  const local = () => localSummary(e, findings);
  if (!aiAllowed(user, 'audit.findings')) {
    return { text: local(), method: 'local', note_ar: 'تحليل محلي — لم تفعّل مشاركة ملاحظات التدقيق مع المساعد الذكي (سياسة البيانات: بموافقتك)', note_en: 'Local analysis — sharing audit findings with Ask AI is not enabled (opt-in data policy)' };
  }
  try {
    const facts = findings.map((f, i) => `${i + 1}. ${f.title} — خطورة ${RISK_AR[f.risk]}. الوضع القائم: ${f.condition}. التوصية: ${f.recommendation}.${f.action ? ` خطة المعالجة حتى ${f.action.due_date}.` : ''}`).join('\n');
    const r = await complete({
      capability: 'generate', user,
      system: 'أنت مدقق داخلي حكومي خبير. اكتب ملخصاً تنفيذياً رسمياً موجزاً (فقرة أو فقرتان، 120 كلمة كحد أقصى) لتقرير تدقيق داخلي، بالعربية الفصحى، دون اختلاق أي رقم أو واقعة غير واردة في المعطيات.',
      messages: [{ role: 'user', content: `المهمة: ${e.title}\nالجهة: ${e.dept_ar}\nالنطاق: ${e.scope}\nالأهداف: ${e.objectives}\nالملاحظات:\n${facts || 'لا توجد ملاحظات'}` }],
      maxTokens: 600,
    });
    const text = String(r.text || '').trim();
    if (!text) throw Object.assign(new Error('empty'), { local: true });
    return { text, method: 'ai', note_ar: `مسودة من المساعد الذكي (${r.provider || 'نموذج'}) — راجعها قبل الاعتماد`, note_en: `Ask AI draft (${r.provider || 'model'}) — review before use` };
  } catch (err) {
    return { text: local(), method: 'local', note_ar: err.local ? 'تحليل محلي — نموذج الذكاء الاصطناعي غير متصل' : 'تحليل محلي — تعذّر الوصول إلى نموذج الذكاء الاصطناعي', note_en: err.local ? 'Local analysis — no AI model connected' : 'Local analysis — the AI model could not be reached' };
  }
}

export function issueReport(user, id, b) {
  requireHead(user);
  const e = loadEngagement(user, id);
  transition(e.phase, 'follow_up', { reporting: ['follow_up'] }, PHASE_AR);
  requireConfirm(b, 'إصدار التقرير يتيحه للجنة التدقيق وللإدارة الخاضعة للتدقيق ويتطلب تأكيداً صريحاً');
  const drafts = one("SELECT COUNT(*) n FROM audit_findings WHERE engagement_id=? AND status='draft' AND withdrawn_at IS NULL", id).n;
  if (drafts) throw new Conflict(`أصدِر الملاحظات المسودة (${drafts}) أو اسحبها قبل إصدار التقرير`);
  const summary = clean(b.exec_summary ?? e.exec_summary, 6000);
  if (summary.length < 30) throw new BadRequest('الملخص التنفيذي مطلوب (30 حرفاً على الأقل)');
  const issuedAt = now();
  const dept = deptOf(e.department_id);
  const html = reportHtml({ ...e, exec_summary: summary, dept_ar: dept?.name_ar || '' }, reportFindings(id), user, issuedAt);
  let docId;
  tx(() => {
    docId = D.createDocument(user, { title: `تقرير التدقيق الداخلي — ${e.title}`, kind: 'report', content_html: html, sources: [{ type: 'audit_engagement', id }] }).result.id;
    // Distribute the issued report (read-only) to the audit committee and the auditee managers.
    for (const uid2 of new Set([...committeeIds(), ...managersOf(e.department_id)])) if (uid2 !== user.id) D.shareDocument(user, { id: docId, user_id: uid2, permission: 'view' });
    run('UPDATE audit_engagements SET exec_summary=?, phase=?, report_doc_id=?, report_issued_by=?, report_issued_at=?, updated_at=? WHERE id=?', summary, 'follow_up', docId, user.id, issuedAt, now(), id);
  });
  audit(user, 'audit.report.issue', id, { document_id: docId });
  logAccess(user, KEY, 'engagement', id, 'issue_report');
  for (const c of committeeIds()) alert(c, { level: 'info', title: `صدر تقرير تدقيق: ${e.title}`, system: KEY, id });
  for (const m of managersOf(e.department_id)) if (m !== user.id) alert(m, { level: 'info', title: `صدر تقرير التدقيق على إدارتكم: ${e.title}`, system: KEY, id });
  const ids = new Set([...engagementAudience({ ...e, phase: 'follow_up' })]);
  for (const f of all("SELECT * FROM audit_findings WHERE engagement_id=? AND status<>'draft'", id)) for (const x of findingAudience(f)) ids.add(x);
  changed(KEY, [...ids], id);
  return { ...getEngagement(user, id), document_id: docId };
}

// ---------------- information requests (PBC) ----------------
function decorateRequest(r, user) {
  const e = one('SELECT id,title,phase FROM audit_engagements WHERE id=?', r.engagement_id);
  return {
    id: r.id, engagement: e ? { id: e.id, title: e.title, phase: e.phase } : null, department: deptOf(r.department_id),
    to: brief(r.to_user_id), title: r.title, details: r.details, due_date: r.due_date, status: r.status,
    overdue: isOverdue(r.due_date, ['responded', 'accepted'], r.status), days_left: daysBetween(today(), r.due_date),
    response_text: r.response_text, responded_by: brief(r.responded_by), responded_at: r.responded_at,
    review_note: r.review_note, reviewed_by: brief(r.reviewed_by), reviewed_at: r.reviewed_at,
    created_by: brief(r.created_by), created_at: r.created_at, is_demo: !!r.is_demo,
    docs: linksOf('pbc', r.id),
    can: { respond: r.to_user_id === user.id && ['open', 'returned'].includes(r.status), review: isIA(user) && r.status === 'responded' && r.responded_by !== user.id },
  };
}
export function listRequests(user, { engagement_id, status, mine } = {}) {
  requireStaff(user);
  const s = requestScope(user);
  let sql = `SELECT r.* FROM audit_requests r WHERE ${s.sql}`; const params = [...s.params];
  if (engagement_id) { sql += ' AND r.engagement_id=?'; params.push(engagement_id); }
  if (status === 'open') sql += " AND r.status IN ('open','returned')";
  else if (status) { sql += ' AND r.status=?'; params.push(status); }
  if (mine) { sql += ' AND r.to_user_id=?'; params.push(user.id); }
  sql += " ORDER BY CASE r.status WHEN 'returned' THEN 0 WHEN 'open' THEN 1 WHEN 'responded' THEN 2 ELSE 3 END, r.due_date";
  return all(sql, ...params).map((r) => decorateRequest(r, user));
}
function loadRequest(user, id) {
  const s = requestScope(user);
  const r = one(`SELECT r.* FROM audit_requests r WHERE r.id=? AND ${s.sql}`, id, ...s.params);
  if (!r) throw new NotFound('طلب المعلومات غير موجود أو غير متاح لك');
  return r;
}
export const getRequest = (user, id) => decorateRequest(loadRequest(user, id), user);

export function createRequest(user, engagementId, b) {
  requireIA(user);
  const e = loadEngagement(user, engagementId);
  if (!canWork(user, e)) throw new Forbidden('يرسل طلبات المعلومات فريق المهمة أو رئيس التدقيق');
  if (!['planning', 'fieldwork', 'reporting'].includes(e.phase)) throw new Conflict(`لا تُرسل طلبات معلومات في مرحلة «${PHASE_AR[e.phase]}»`);
  if (b.due_date < today()) throw new BadRequest('تاريخ الاستحقاق يجب ألا يكون في الماضي');
  const to = auditeeManager(e.department_id);
  if (!to) throw new Conflict('لا يوجد مدير مسؤول عن الإدارة الخاضعة للتدقيق');
  const id = uid('ar_');
  run('INSERT INTO audit_requests (id,engagement_id,department_id,to_user_id,title,details,due_date,status,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)',
    id, e.id, e.department_id, to, clean(b.title, 300), clean(b.details, 3000), b.due_date, 'open', user.id, now());
  audit(user, 'audit.request.create', id, { engagement_id: e.id });
  alert(to, { level: 'info', title: 'طلب معلومات من التدقيق الداخلي', body: `${clean(b.title, 200)} — الاستحقاق ${b.due_date}`, system: KEY, id });
  changed(KEY, [...iaIds(), to], id);
  return getRequest(user, id);
}
export function respondRequest(user, id, b) {
  const r = loadRequest(user, id);
  if (r.to_user_id !== user.id) throw new Forbidden('يرد على الطلب المدير الموجَّه إليه فقط');
  transition(r.status, 'responded', { open: ['responded'], returned: ['responded'] }, REQ_AR);
  tx(() => {
    run('UPDATE audit_requests SET status=?, response_text=?, responded_by=?, responded_at=? WHERE id=?', 'responded', clean(b.response_text, 6000), user.id, now(), id);
    linkDocs(user, 'pbc', id, b.doc_ids || []);
  });
  audit(user, 'audit.request.respond', id, { docs: (b.doc_ids || []).length });
  alert(r.created_by, { level: 'info', title: 'رد على طلب معلومات', body: r.title, system: KEY, id });
  changed(KEY, [...iaIds(), r.to_user_id], id);
  return getRequest(user, id);
}
export function reviewRequest(user, id, b) {
  requireIA(user);
  const r = loadRequest(user, id);
  const to = b.decision === 'accept' ? 'accepted' : 'returned';
  transition(r.status, to, { responded: ['accepted', 'returned'] }, REQ_AR);
  if (r.responded_by === user.id) throw new Forbidden('فصل المهام: لا تراجع رداً قدّمته بنفسك');
  if (to === 'returned' && clean(b.note).length < 5) throw new BadRequest('اذكر ما ينقص الرد');
  run('UPDATE audit_requests SET status=?, review_note=?, reviewed_by=?, reviewed_at=? WHERE id=?', to, clean(b.note, 2000) || null, user.id, now(), id);
  audit(user, `audit.request.${to}`, id, {});
  if (to === 'returned') alert(r.to_user_id, { level: 'warning', title: 'أُعيد طلب معلومات للاستكمال', body: r.title, system: KEY, id });
  changed(KEY, [...iaIds(), r.to_user_id], id);
  return getRequest(user, id);
}

// ---------------- working papers (restricted: internal auditors only) ----------------
function loadWorkpaper(user, id) {
  if (!isIA(user)) throw new NotFound();
  const w = one('SELECT * FROM audit_workpapers WHERE id=?', id);
  if (!w) throw new NotFound();
  return w;
}
const decorateWorkpaper = (w, user, e) => ({
  ...w, is_demo: !!w.is_demo, prepared_by_user: brief(w.prepared_by), reviewed_by_user: brief(w.reviewed_by),
  can: {
    edit: w.status === 'draft' && (w.prepared_by === user.id || isHead(user)) && e.phase !== 'closed',
    review: w.status === 'draft' && w.prepared_by !== user.id && (isHead(user) || e.lead_id === user.id),
    review_blocked_sod: w.status === 'draft' && w.prepared_by === user.id && (isHead(user) || e.lead_id === user.id),
  },
});
export function listWorkpapers(user, engagementId) {
  if (!isIA(user)) throw new NotFound();
  const e = loadEngagement(user, engagementId);
  logAccess(user, KEY, 'workpapers', e.id, 'list');
  return all('SELECT * FROM audit_workpapers WHERE engagement_id=? ORDER BY ref, created_at', e.id).map((w) => decorateWorkpaper(w, user, e));
}
export function getWorkpaper(user, id) {
  const w = loadWorkpaper(user, id);
  const e = one('SELECT * FROM audit_engagements WHERE id=?', w.engagement_id);
  logAccess(user, KEY, 'workpaper', id, 'view');
  return { ...decorateWorkpaper(w, user, e), engagement: { id: e.id, title: e.title }, access_log: isHead(user) ? accessLog(KEY, 'workpaper', id) : null };
}
const WP_RESULTS = ['pending', 'satisfactory', 'exception'];
export function createWorkpaper(user, engagementId, b) {
  if (!isIA(user)) throw new NotFound();
  const e = loadEngagement(user, engagementId);
  if (!canWork(user, e)) throw new Forbidden('يعدّ أوراق العمل فريق المهمة أو رئيس التدقيق');
  if (!['planning', 'fieldwork', 'reporting'].includes(e.phase)) throw new Conflict(`لا تُضاف أوراق عمل في مرحلة «${PHASE_AR[e.phase]}»`);
  const n = one('SELECT COUNT(*) n FROM audit_workpapers WHERE engagement_id=?', e.id).n + 1;
  const id = uid('aw_');
  run('INSERT INTO audit_workpapers (id,engagement_id,ref,title,procedure,evidence,conclusion,result,status,prepared_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
    id, e.id, `WP-${String(n).padStart(2, '0')}`, clean(b.title, 300), clean(b.procedure, 6000), clean(b.evidence, 6000), clean(b.conclusion, 3000), b.result || 'pending', 'draft', user.id, now(), now());
  logAccess(user, KEY, 'workpaper', id, 'create');
  audit(user, 'audit.workpaper.create', id, { engagement_id: e.id });
  changed(KEY, iaIds(), id);
  return getWorkpaper(user, id);
}
export function updateWorkpaper(user, id, b) {
  const w = loadWorkpaper(user, id);
  if (w.status !== 'draft') throw new Conflict('ورقة العمل مراجعة ومعتمدة ولا يمكن تعديلها');
  if (!(w.prepared_by === user.id || isHead(user))) throw new Forbidden('يعدّل ورقة العمل معدّها أو رئيس التدقيق');
  if (b.result && !WP_RESULTS.includes(b.result)) throw new BadRequest('نتيجة غير صالحة');
  run('UPDATE audit_workpapers SET title=?, procedure=?, evidence=?, conclusion=?, result=?, updated_at=? WHERE id=?',
    b.title != null ? clean(b.title, 300) : w.title, b.procedure != null ? clean(b.procedure, 6000) : w.procedure, b.evidence != null ? clean(b.evidence, 6000) : w.evidence,
    b.conclusion != null ? clean(b.conclusion, 3000) : w.conclusion, b.result || w.result, now(), id);
  logAccess(user, KEY, 'workpaper', id, 'update');
  changed(KEY, iaIds(), id);
  return getWorkpaper(user, id);
}
export function reviewWorkpaper(user, id, b) {
  const w = loadWorkpaper(user, id);
  const e = one('SELECT * FROM audit_engagements WHERE id=?', w.engagement_id);
  if (!(isHead(user) || e.lead_id === user.id)) throw new Forbidden('يراجع أوراق العمل قائد المهمة أو رئيس التدقيق');
  if (w.prepared_by === user.id) throw new Forbidden('فصل المهام: لا تراجع ورقة عمل أعددتها بنفسك');
  transition(w.status, 'reviewed', { draft: ['reviewed'] }, { draft: 'مسودة', reviewed: 'تمت المراجعة' });
  if (w.result === 'pending') throw new Conflict('حدّد نتيجة الاختبار قبل المراجعة');
  run('UPDATE audit_workpapers SET status=?, reviewed_by=?, reviewed_at=?, review_note=?, updated_at=? WHERE id=?', 'reviewed', user.id, now(), clean(b.note, 2000) || null, now(), id);
  logAccess(user, KEY, 'workpaper', id, 'review');
  audit(user, 'audit.workpaper.review', id, {});
  if (w.prepared_by !== user.id) alert(w.prepared_by, { level: 'info', title: 'تمت مراجعة ورقة عمل', body: w.title, system: KEY, id: w.engagement_id });
  changed(KEY, iaIds(), id);
  return getWorkpaper(user, id);
}

// ---------------- findings & action plans ----------------
function actionOf(fid) { return one('SELECT * FROM audit_actions WHERE finding_id=?', fid); }
function decorateFinding(f, user, { full = false } = {}) {
  const ia = isIA(user);
  const a = actionOf(f.id);
  const auditee = isAuditeeOf(user, f.department_id);
  const owner = a?.owner_id === user.id;
  const e = one('SELECT id,title,phase,report_issued_at,plan_year,quarter FROM audit_engagements WHERE id=?', f.engagement_id);
  const detailed = ia || auditee || isCommittee(user); // action owners see an action-focused view
  const ownerVisible = ia || auditee || owner;
  const out = {
    id: f.id, ref: f.ref, title: f.title, risk: f.risk, status: f.status, department: deptOf(f.department_id),
    engagement: e ? { id: e.id, title: e.title, phase: e.phase, plan_year: e.plan_year, quarter: e.quarter } : null,
    condition: f.condition, recommendation: f.recommendation,
    issued_at: f.issued_at, closed_at: f.closed_at, is_demo: !!f.is_demo,
    position: f.position, response_text: f.response_text, response_at: f.response_at,
    action: a ? {
      id: a.id, description: a.description, due_date: a.due_date, status: a.status, implemented_at: a.implemented_at, closed_at: a.closed_at,
      owner: ownerVisible ? brief(a.owner_id) : null, mine: owner, returned_count: a.returned_count,
      overdue: isOverdue(a.due_date, ['implemented', 'closed'], a.status), days_overdue: Math.max(0, daysBetween(a.due_date, today())),
    } : null,
  };
  if (detailed) Object.assign(out, { criteria: f.criteria, cause: f.cause, effect: f.effect });
  if (ia) Object.assign(out, { raised_by: brief(f.raised_by), issued_by: brief(f.issued_by), workpaper_id: f.workpaper_id, created_at: f.created_at });
  if (full) {
    out.updates = all(`SELECT * FROM audit_updates WHERE finding_id=? ${ia ? '' : 'AND internal=0'} ORDER BY created_at`, f.id).map((u) => ({ id: u.id, kind: u.kind, note: u.note, internal: !!u.internal, at: u.created_at, who: brief(u.user_id) }));
    out.evidence = linksOf('action', f.id);
    out.response_by = f.response_by ? brief(f.response_by) : null;
    out.closed_by = f.closed_by && (ia || auditee || owner) ? brief(f.closed_by) : null;
    out.can = {
      edit: ia && f.status === 'draft',
      withdraw: ia && f.status === 'draft',
      issue: isHead(user) && f.status === 'draft' && f.raised_by !== user.id,
      issue_blocked_sod: isHead(user) && f.status === 'draft' && f.raised_by === user.id,
      respond: auditee && f.status === 'issued',
      progress: owner && f.status === 'in_follow_up' && ['open', 'in_progress'].includes(a?.status),
      close: isHead(user) && f.status === 'implemented' && ![f.raised_by, f.response_by, a?.owner_id].includes(user.id),
      close_blocked_sod: isHead(user) && f.status === 'implemented' && [f.raised_by, f.response_by, a?.owner_id].includes(user.id),
      note: ia && f.status !== 'closed',
    };
    out.viewer = { ia, head: isHead(user), auditee, owner, committee: isCommittee(user) };
    out.access_log = isHead(user) ? accessLog(KEY, 'finding', f.id) : null;
  }
  return out;
}
function addUpdate(fid, userId, kind, note = '', internal = 0) {
  run('INSERT INTO audit_updates (id,finding_id,user_id,kind,note,internal,created_at) VALUES (?,?,?,?,?,?,?)', uid('au_'), fid, userId, kind, clean(note, 3000), internal ? 1 : 0, now());
}
export function listFindings(user, { engagement_id, status, risk, department_id, open, overdue, mine } = {}) {
  requireStaff(user);
  const s = findingScope(user);
  let sql = `SELECT f.* FROM audit_findings f LEFT JOIN audit_actions a ON a.finding_id=f.id WHERE ${s.sql}`; const params = [...s.params];
  if (engagement_id) { sql += ' AND f.engagement_id=?'; params.push(engagement_id); }
  if (status) { sql += ' AND f.status=?'; params.push(status); }
  if (risk) { sql += ' AND f.risk=?'; params.push(risk); }
  if (department_id) { sql += ' AND f.department_id=?'; params.push(department_id); }
  if (open) { sql += ` AND f.status IN (${inList(OPEN_FINDING)})`; params.push(...OPEN_FINDING); }
  if (overdue) { sql += " AND a.status IN ('open','in_progress') AND a.due_date<?"; params.push(today()); }
  if (mine) { sql += ' AND a.owner_id=?'; params.push(user.id); }
  sql += " ORDER BY CASE f.status WHEN 'issued' THEN 0 WHEN 'implemented' THEN 1 WHEN 'in_follow_up' THEN 2 WHEN 'draft' THEN 3 ELSE 4 END, CASE f.risk WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, a.due_date";
  return all(sql, ...params).map((f) => decorateFinding(f, user));
}
function loadFinding(user, id) {
  const s = findingScope(user);
  const f = one(`SELECT f.* FROM audit_findings f WHERE f.id=? AND ${s.sql}`, id, ...s.params);
  if (!f) throw new NotFound('الملاحظة غير موجودة أو غير متاحة لك');
  return f;
}
export function getFinding(user, id) {
  const f = loadFinding(user, id);
  logAccess(user, KEY, 'finding', id, 'view');
  return decorateFinding(f, user, { full: true });
}
const FINDING_FIELDS = ['title', 'criteria', 'condition', 'cause', 'effect', 'recommendation'];
export function createFinding(user, engagementId, b) {
  requireIA(user);
  const e = loadEngagement(user, engagementId);
  if (!canWork(user, e)) throw new Forbidden('يثبت الملاحظات فريق المهمة أو رئيس التدقيق');
  if (!['fieldwork', 'reporting'].includes(e.phase)) throw new Conflict(`لا تُثبت ملاحظات في مرحلة «${PHASE_AR[e.phase]}»`);
  if (b.workpaper_id && !one('SELECT 1 FROM audit_workpapers WHERE id=? AND engagement_id=?', b.workpaper_id, e.id)) throw new BadRequest('ورقة العمل لا تتبع هذه المهمة');
  const n = one('SELECT COUNT(*) n FROM audit_findings WHERE engagement_id=?', e.id).n + 1;
  const id = uid('af_');
  run(`INSERT INTO audit_findings (id,engagement_id,department_id,ref,title,criteria,condition,cause,effect,risk,recommendation,workpaper_id,status,raised_by,created_at,updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, e.id, e.department_id, `F-${String(n).padStart(2, '0')}`, clean(b.title, 300), clean(b.criteria, 3000), clean(b.condition, 4000),
  clean(b.cause, 3000), clean(b.effect, 3000), b.risk, clean(b.recommendation, 3000), b.workpaper_id || null, 'draft', user.id, now(), now());
  addUpdate(id, user.id, 'created', '', 1);
  logAccess(user, KEY, 'finding', id, 'create');
  audit(user, 'audit.finding.create', id, { engagement_id: e.id, risk: b.risk });
  changed(KEY, iaIds(), id);
  return getFinding(user, id);
}
export function updateFinding(user, id, b) {
  requireIA(user);
  const f = loadFinding(user, id);
  if (f.status !== 'draft') throw new Conflict('لا تُعدّل الملاحظة بعد إصدارها');
  const next = Object.fromEntries(FINDING_FIELDS.map((k) => [k, b[k] != null ? clean(b[k], 4000) : f[k]]));
  if (!next.title) throw new BadRequest('عنوان الملاحظة مطلوب');
  run('UPDATE audit_findings SET title=?, criteria=?, condition=?, cause=?, effect=?, recommendation=?, risk=?, updated_at=? WHERE id=?',
    next.title, next.criteria, next.condition, next.cause, next.effect, next.recommendation, b.risk || f.risk, now(), id);
  logAccess(user, KEY, 'finding', id, 'update');
  audit(user, 'audit.finding.update', id, { fields: Object.keys(b) });
  changed(KEY, iaIds(), id);
  return getFinding(user, id);
}
export function withdrawFinding(user, id, b) {
  requireIA(user);
  const f = loadFinding(user, id);
  if (f.status !== 'draft') throw new Conflict('تُسحب الملاحظات المسودة فقط');
  requireConfirm(b, 'سحب الملاحظة يتطلب تأكيداً صريحاً');
  run('UPDATE audit_findings SET withdrawn_at=?, withdrawn_by=?, updated_at=? WHERE id=?', now(), user.id, now(), id);
  logAccess(user, KEY, 'finding', id, 'withdraw');
  audit(user, 'audit.finding.withdraw', id, {});
  changed(KEY, iaIds(), id);
  return { id, withdrawn: true };
}
export function issueFinding(user, id, b) {
  requireHead(user);
  const f = loadFinding(user, id);
  transition(f.status, 'issued', { draft: ['issued'] }, FINDING_AR);
  if (f.raised_by === user.id) throw new Forbidden('فصل المهام: لا تُصدر ملاحظة أثبتّها بنفسك؛ يُصدرها رئيس تدقيق آخر');
  requireConfirm(b, 'إصدار الملاحظة يتيحها لمدير الإدارة الخاضعة للتدقيق ويتطلب تأكيداً صريحاً');
  if (!f.condition || !f.recommendation) throw new BadRequest('أكمل الوضع القائم والتوصية قبل الإصدار');
  run('UPDATE audit_findings SET status=?, issued_by=?, issued_at=?, updated_at=? WHERE id=?', 'issued', user.id, now(), now(), id);
  addUpdate(id, user.id, 'issued');
  logAccess(user, KEY, 'finding', id, 'issue');
  audit(user, 'audit.finding.issue', id, {});
  for (const m of managersOf(f.department_id)) alert(m, { level: 'warning', title: 'ملاحظة تدقيق صادرة بانتظار ردّكم', body: f.title, system: KEY, id });
  changed(KEY, findingAudience({ ...f, status: 'issued' }), id);
  return getFinding(user, id);
}
export function respondFinding(user, id, b) {
  const f = loadFinding(user, id);
  if (!isAuditeeOf(user, f.department_id)) throw new Forbidden('يرد على الملاحظة مدير الإدارة الخاضعة للتدقيق');
  transition(f.status, 'in_follow_up', { issued: ['in_follow_up'] }, FINDING_AR);
  const owner = staffUser(b.owner_id);
  if (!owner || !(owner.id === user.id || auditeeDepts(user).includes(owner.department_id))) throw new BadRequest('مسؤول التنفيذ يجب أن يكون من موظفي إدارتك');
  if (b.due_date < today()) throw new BadRequest('تاريخ التنفيذ يجب ألا يكون في الماضي');
  if (daysBetween(today(), b.due_date) > 730) throw new BadRequest('تاريخ التنفيذ يتجاوز سنتين؛ قسّم الخطة إلى مراحل');
  tx(() => {
    run('UPDATE audit_findings SET status=?, position=?, response_text=?, response_by=?, response_at=?, updated_at=? WHERE id=?', 'in_follow_up', b.position, clean(b.response_text, 4000), user.id, now(), now(), id);
    run('INSERT INTO audit_actions (id,finding_id,description,owner_id,due_date,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)', uid('aa_'), id, clean(b.action_description, 3000), owner.id, b.due_date, 'open', user.id, now(), now());
    addUpdate(id, user.id, 'response', clean(b.response_text, 3000));
  });
  logAccess(user, KEY, 'finding', id, 'respond');
  audit(user, 'audit.finding.respond', id, { position: b.position, owner_id: owner.id, due_date: b.due_date });
  if (owner.id !== user.id) alert(owner.id, { level: 'info', title: 'خطة معالجة ملاحظة تدقيق مسندة إليك', body: `${f.title} — الاستحقاق ${b.due_date}`, system: KEY, id });
  for (const x of new Set([f.raised_by, ...headIds()])) alert(x, { level: 'info', title: 'رد الإدارة على ملاحظة تدقيق', body: f.title, system: KEY, id });
  changed(KEY, findingAudience({ ...f, status: 'in_follow_up' }), id);
  return getFinding(user, id);
}
export function progressAction(user, id, b) {
  const f = loadFinding(user, id);
  const a = actionOf(id);
  if (!a || a.owner_id !== user.id) throw new Forbidden('يحدّث حالة خطة المعالجة مسؤولُ تنفيذها فقط');
  if (f.status !== 'in_follow_up') throw new Conflict(`لا يمكن تحديث خطة المعالجة والملاحظة «${FINDING_AR[f.status]}»`);
  transition(a.status, b.status, { open: ['in_progress', 'implemented'], in_progress: ['in_progress', 'implemented'] }, { open: 'مفتوحة', in_progress: 'قيد التنفيذ', implemented: 'منفذة', closed: 'مغلقة' });
  const note = clean(b.note, 3000);
  if (b.status === 'implemented' && note.length < 10) throw new BadRequest('صف ما نُفّذ والدليل عليه (10 أحرف على الأقل)');
  if (a.status === 'in_progress' && b.status === 'in_progress' && note.length < 5) throw new BadRequest('اكتب ما استجد في التنفيذ');
  tx(() => {
    run('UPDATE audit_actions SET status=?, implemented_at=?, updated_at=? WHERE id=?', b.status, b.status === 'implemented' ? now() : a.implemented_at, now(), a.id);
    if (b.status === 'implemented') run('UPDATE audit_findings SET status=?, updated_at=? WHERE id=?', 'implemented', now(), id);
    addUpdate(id, user.id, b.status === 'implemented' ? 'implemented' : 'progress', note);
    linkDocs(user, 'action', id, b.doc_ids || []);
  });
  logAccess(user, KEY, 'finding', id, 'progress');
  audit(user, 'audit.action.progress', a.id, { to: b.status });
  if (b.status === 'implemented') for (const h of headIds()) alert(h, { level: 'info', title: 'خطة معالجة منفذة بانتظار التحقق والإغلاق', body: f.title, system: KEY, id });
  changed(KEY, findingAudience({ ...f, status: b.status === 'implemented' ? 'implemented' : f.status }), id);
  return getFinding(user, id);
}
export function closeFinding(user, id, b) {
  requireHead(user);
  const f = loadFinding(user, id);
  const to = b.decision === 'close' ? 'closed' : 'in_follow_up';
  transition(f.status, to, { implemented: ['closed', 'in_follow_up'] }, FINDING_AR);
  if (f.raised_by === user.id) throw new Forbidden('فصل المهام: لا تعتمد إغلاق ملاحظة أثبتّها بنفسك');
  const a = actionOf(id);
  // The validator must be independent of the remediation as well: not the manager who
  // answered the finding nor the owner who reported the action plan as implemented.
  if (a?.owner_id === user.id || f.response_by === user.id) throw new Forbidden('فصل المهام: لا تتحقق من تنفيذ خطة معالجة أنت مسؤول عنها أو قدّمت رد الإدارة عليها');
  const note = clean(b.note, 3000);
  if (to === 'in_follow_up' && note.length < 5) throw new BadRequest('اذكر سبب إعادة الخطة للتنفيذ');
  tx(() => {
    if (to === 'closed') {
      run('UPDATE audit_findings SET status=?, closed_by=?, closed_at=?, updated_at=? WHERE id=?', 'closed', user.id, now(), now(), id);
      run('UPDATE audit_actions SET status=?, closed_at=?, updated_at=? WHERE id=?', 'closed', now(), now(), a.id);
    } else {
      run('UPDATE audit_findings SET status=?, updated_at=? WHERE id=?', 'in_follow_up', now(), id);
      run('UPDATE audit_actions SET status=?, implemented_at=NULL, returned_count=returned_count+1, updated_at=? WHERE id=?', 'in_progress', now(), a.id);
    }
    addUpdate(id, user.id, to === 'closed' ? 'closed' : 'returned', note);
  });
  logAccess(user, KEY, 'finding', id, to === 'closed' ? 'close' : 'return');
  audit(user, to === 'closed' ? 'audit.finding.close' : 'audit.finding.return', id, {});
  alert(a.owner_id, { level: to === 'closed' ? 'info' : 'warning', title: to === 'closed' ? 'اعتُمد إغلاق ملاحظة التدقيق' : 'أُعيدت خطة المعالجة للاستكمال', body: f.title, system: KEY, id });
  changed(KEY, findingAudience({ ...f, status: to }), id);
  return getFinding(user, id);
}
export function noteFinding(user, id, b) {
  requireIA(user);
  const f = loadFinding(user, id);
  if (f.status === 'closed') throw new Conflict('الملاحظة مغلقة');
  addUpdate(id, user.id, 'note', clean(b.note, 3000), 1);
  logAccess(user, KEY, 'finding', id, 'note');
  changed(KEY, iaIds(), id);
  return getFinding(user, id);
}

// ---------------- external auditor requests ----------------
function publicExt(x) {
  const released = x.status === 'released';
  return {
    id: x.id, title: x.title, details: x.details, due_date: x.due_date, created_at: x.created_at, is_demo: !!x.is_demo,
    status: released ? 'released' : x.status === 'submitted' ? 'submitted' : 'in_progress',
    released_text: released ? x.released_text : null, released_at: released ? x.released_at : null,
    docs: released ? linksOf('ext', x.id) : [], external_view: true,
  };
}
function decorateExt(x, user) {
  if (isExtAuditor(user)) return publicExt(x);
  const ia = isIA(user);
  return {
    id: x.id, title: x.title, details: x.details, due_date: x.due_date, created_at: x.created_at, status: x.status, is_demo: !!x.is_demo,
    overdue: isOverdue(x.due_date, ['released'], x.status),
    requester: ia ? brief(x.requester_id) : null, org: deptOf(x.org_id),
    assigned_to: brief(x.assigned_to), assigned_at: x.assigned_at, internal_note: x.internal_note, return_note: x.return_note,
    response_text: x.response_text, prepared_by: brief(x.prepared_by), prepared_at: x.prepared_at,
    released_text: x.released_text, released_by: brief(x.released_by), released_at: x.released_at,
    docs: linksOf('ext', x.id),
    can: {
      assign: isHead(user) && ['submitted', 'assigned'].includes(x.status),
      prepare: x.assigned_to === user.id && x.status === 'assigned',
      release: isHead(user) && x.status === 'prepared' && x.prepared_by !== user.id,
      return: isHead(user) && x.status === 'prepared',
    },
  };
}
export function listExt(user, { status } = {}) {
  const s = extScope(user);
  let sql = `SELECT x.* FROM audit_ext_requests x WHERE ${s.sql}`; const params = [...s.params];
  // The external auditor only knows submitted / in progress / released: internal routing
  // states (assigned vs prepared) must not be inferable through the filter.
  if (status && isExtAuditor(user) && ['assigned', 'prepared'].includes(status)) sql += " AND x.status IN ('assigned','prepared')";
  else if (status) { sql += ' AND x.status=?'; params.push(status); }
  sql += " ORDER BY CASE x.status WHEN 'submitted' THEN 0 WHEN 'prepared' THEN 1 WHEN 'assigned' THEN 2 ELSE 3 END, x.created_at DESC";
  return all(sql, ...params).map((x) => decorateExt(x, user));
}
function loadExt(user, id) {
  const s = extScope(user);
  const x = one(`SELECT x.* FROM audit_ext_requests x WHERE x.id=? AND ${s.sql}`, id, ...s.params);
  if (!x) throw new NotFound('الطلب غير موجود أو غير متاح لك');
  return x;
}
export function getExt(user, id) {
  const x = loadExt(user, id);
  logAccess(user, KEY, 'ext', id, 'view');
  const out = decorateExt(x, user);
  if (isHead(user)) out.access_log = accessLog(KEY, 'ext', id);
  return out;
}
const extAudience = (x) => [...new Set([...iaIds(), x.assigned_to, x.requester_id].filter(Boolean))];
export function createExt(user, b) {
  if (!isExtAuditor(user)) throw new Forbidden('تُقدَّم هذه الطلبات من المدقق الخارجي عبر البوابة');
  if (b.due_date && b.due_date < today()) throw new BadRequest('التاريخ المطلوب يجب ألا يكون في الماضي');
  const id = uid('ax_');
  run('INSERT INTO audit_ext_requests (id,requester_id,org_id,title,details,due_date,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)',
    id, user.id, user.department_id, clean(b.title, 300), clean(b.details, 3000), b.due_date || null, 'submitted', now(), now());
  audit(user, 'audit.ext.create', id, {});
  for (const h of headIds()) alert(h, { level: 'info', title: 'طلب جديد من المدقق الخارجي', body: clean(b.title, 200), system: KEY, id });
  changed(KEY, [...iaIds(), user.id], id);
  return getExt(user, id);
}
export function assignExt(user, id, b) {
  requireHead(user);
  const x = loadExt(user, id);
  transition(x.status, 'assigned', { submitted: ['assigned'], assigned: ['assigned'] }, EXT_AR);
  const m = one("SELECT id FROM users WHERE id=? AND active=1 AND user_type='staff' AND role='manager'", b.to_user_id);
  if (!m) throw new BadRequest('يُسند الطلب إلى مدير إدارة');
  if (m.id === user.id) throw new BadRequest('فصل المهام: أسند الطلب إلى الإدارة المختصة لا إلى نفسك');
  run('UPDATE audit_ext_requests SET status=?, assigned_to=?, assigned_by=?, assigned_at=?, internal_note=?, updated_at=? WHERE id=?', 'assigned', m.id, user.id, now(), clean(b.note, 2000) || null, now(), id);
  audit(user, 'audit.ext.assign', id, { to: m.id });
  alert(m.id, { level: 'info', title: 'طلب من المدقق الخارجي أُسند لإدارتكم', body: x.title, system: KEY, id });
  changed(KEY, [...extAudience(x), m.id], id);
  return getExt(user, id);
}
export function prepareExt(user, id, b) {
  const x = loadExt(user, id);
  if (x.assigned_to !== user.id) throw new Forbidden('يُعد الرد المدير المسند إليه الطلب');
  transition(x.status, 'prepared', { assigned: ['prepared'] }, EXT_AR);
  tx(() => {
    run('UPDATE audit_ext_requests SET status=?, response_text=?, prepared_by=?, prepared_at=?, updated_at=? WHERE id=?', 'prepared', clean(b.response_text, 6000), user.id, now(), now(), id);
    linkDocs(user, 'ext', id, b.doc_ids || [], { replace: true });
  });
  audit(user, 'audit.ext.prepare', id, {});
  for (const h of headIds()) alert(h, { level: 'info', title: 'رد جاهز لطلب المدقق الخارجي بانتظار مراجعتك', body: x.title, system: KEY, id });
  changed(KEY, extAudience(x), id);
  return getExt(user, id);
}
export function returnExt(user, id, b) {
  requireHead(user);
  const x = loadExt(user, id);
  transition(x.status, 'assigned', { prepared: ['assigned'] }, EXT_AR);
  if (clean(b.note).length < 5) throw new BadRequest('اذكر المطلوب تعديله');
  run('UPDATE audit_ext_requests SET status=?, return_note=?, updated_at=? WHERE id=?', 'assigned', clean(b.note, 2000), now(), id);
  audit(user, 'audit.ext.return', id, {});
  alert(x.assigned_to, { level: 'warning', title: 'أُعيد رد طلب المدقق الخارجي للتعديل', body: x.title, system: KEY, id });
  changed(KEY, extAudience(x), id);
  return getExt(user, id);
}
export function releaseExt(user, id, b) {
  requireHead(user);
  const x = loadExt(user, id);
  transition(x.status, 'released', { prepared: ['released'] }, EXT_AR);
  if (x.prepared_by === user.id) throw new Forbidden('فصل المهام: لا تُفرج عن رد أعددته بنفسك');
  requireConfirm(b, 'الإفراج عن الرد يتيحه للمدقق الخارجي ويتطلب تأكيداً صريحاً');
  const text = clean(b.released_text ?? x.response_text, 6000);
  if (text.length < 5) throw new BadRequest('نص الرد المُفرج عنه مطلوب');
  tx(() => {
    run('UPDATE audit_ext_requests SET status=?, released_text=?, released_by=?, released_at=?, updated_at=? WHERE id=?', 'released', text, user.id, now(), now(), id);
    // Freeze what was reviewed: the external auditor reads this snapshot, never the live
    // document (which its internal owner could keep editing after the release).
    for (const l of all("SELECT id, document_id FROM audit_links WHERE kind='ext' AND ref_id=?", id)) {
      const d = one('SELECT title, content_html FROM documents WHERE id=? AND deleted_at IS NULL', l.document_id);
      run('UPDATE audit_links SET released_html=?, released_title=? WHERE id=?', d?.content_html ?? '', d?.title ?? null, l.id);
    }
  });
  audit(user, 'audit.ext.release', id, { docs: linksOf('ext', id).length });
  logAccess(user, KEY, 'ext', id, 'release');
  alert(x.requester_id, { level: 'info', title: 'تم الرد على طلبك', body: x.title, system: KEY, id });
  changed(KEY, extAudience(x), id);
  return getExt(user, id);
}

// ---------------- dashboards (IA & committee aggregates) ----------------
export function dashboard(user, { year: y = year() } = {}) {
  requirePlanReader(user);
  const ia = isIA(user);
  const s = findingScope(user);
  const t = today();
  const rows = all(`SELECT f.id,f.risk,f.status,f.department_id,f.issued_at,f.closed_at,a.due_date,a.status astatus,a.implemented_at,a.owner_id,f.title
    FROM audit_findings f LEFT JOIN audit_actions a ON a.finding_id=f.id WHERE ${s.sql} AND f.status<>'draft'`, ...s.params);
  const open = rows.filter((r) => OPEN_FINDING.includes(r.status));
  const byDept = new Map();
  for (const r of open) {
    if (!byDept.has(r.department_id)) byDept.set(r.department_id, { department: deptOf(r.department_id), high: 0, medium: 0, low: 0, total: 0, overdue: 0 });
    const d = byDept.get(r.department_id); d[r.risk]++; d.total++;
    if (r.due_date && r.due_date < t && ['open', 'in_progress'].includes(r.astatus)) d.overdue++;
  }
  const overdue = rows.filter((r) => r.due_date && r.due_date < t && ['open', 'in_progress'].includes(r.astatus))
    .map((r) => ({ id: r.id, title: r.title, risk: r.risk, department: deptOf(r.department_id), due_date: r.due_date, days_overdue: daysBetween(r.due_date, t), owner: ia ? brief(r.owner_id) : null }))
    .sort((a, b) => b.days_overdue - a.days_overdue);
  const qOf = (iso) => (iso && iso.slice(0, 4) === String(y) ? Math.floor((Number(iso.slice(5, 7)) - 1) / 3) + 1 : null);
  const trend = [1, 2, 3, 4].map((q) => ({ quarter: q, issued: rows.filter((r) => qOf(r.issued_at) === q).length, closed: rows.filter((r) => qOf(r.closed_at) === q).length }));
  const closedActions = rows.filter((r) => r.astatus === 'closed' && r.implemented_at);
  const onTime = closedActions.filter((r) => r.implemented_at.slice(0, 10) <= r.due_date).length;
  const engs = all('SELECT phase, report_issued_at FROM audit_engagements WHERE plan_year=?', y);
  return {
    year: y, scope: ia ? 'ia' : 'committee',
    open: { total: open.length, high: open.filter((r) => r.risk === 'high').length, medium: open.filter((r) => r.risk === 'medium').length, low: open.filter((r) => r.risk === 'low').length },
    awaiting_response: rows.filter((r) => r.status === 'issued').length,
    awaiting_validation: rows.filter((r) => r.status === 'implemented').length,
    closed: rows.filter((r) => r.status === 'closed').length,
    by_department: [...byDept.values()].sort((a, b) => b.high - a.high || b.total - a.total),
    overdue, trend,
    on_time_rate: closedActions.length ? Math.round((onTime / closedActions.length) * 100) : null, closed_actions: closedActions.length,
    plan: { total: engs.length, by_phase: Object.fromEntries(PHASES.map((p) => [p, engs.filter((e) => e.phase === p).length])), reports_issued: engs.filter((e) => e.report_issued_at).length },
  };
}

// Issued findings on the user's departments (auditee manager) or with an action
// plan assigned to the user — used by the Ask AI tool and Home cards. A strict
// subset of findingScope (drafts and withdrawn findings never appear).
export function myActions(user, { overdue = false } = {}) {
  if (!isStaff(user)) return [];
  const depts = auditeeDepts(user);
  const parts = ['a.owner_id=?']; const params = [user.id];
  if (depts.length) { parts.unshift(`f.department_id IN (${inList(depts)})`); params.unshift(...depts); }
  let sql = `SELECT f.* FROM audit_findings f LEFT JOIN audit_actions a ON a.finding_id=f.id
    WHERE f.withdrawn_at IS NULL AND f.status<>'draft' AND (${parts.join(' OR ')})`;
  if (overdue) { sql += " AND a.status IN ('open','in_progress') AND a.due_date<?"; params.push(today()); }
  sql += " ORDER BY CASE f.status WHEN 'issued' THEN 0 WHEN 'in_follow_up' THEN 1 WHEN 'implemented' THEN 2 ELSE 3 END, a.due_date";
  return all(sql, ...params).map((f) => decorateFinding(f, user));
}

// People pickers for IA forms: auditors (team) and department managers (external
// request routing). Staff directory data only, and only for Internal Audit.
export function people(user) {
  requireIA(user);
  const cols = 'u.id,u.name_ar,u.name_en,u.title_ar,u.title_en,u.department_id,d.name_ar dept_ar,d.name_en dept_en';
  const ia = iaIds();
  return {
    auditors: ia.length ? all(`SELECT ${cols} FROM users u JOIN departments d ON d.id=u.department_id WHERE u.id IN (${inList(ia)}) ORDER BY u.name_ar`, ...ia) : [],
    managers: all(`SELECT ${cols} FROM users u JOIN departments d ON d.id=u.department_id WHERE u.active=1 AND u.user_type='staff' AND u.role='manager' AND u.id<>? ORDER BY d.name_ar`, user.id),
  };
}
