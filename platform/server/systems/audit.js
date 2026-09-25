// Internal Audit — التدقيق الداخلي (+ external auditor portal).
// Risk-based annual plan, engagements (planning → fieldwork → reporting →
// follow-up → closed), information requests, restricted working papers,
// findings with management responses and action plans, report issuance into the
// Documents module, and a confined portal for the external auditor.
// Services: ./audit/service.js · scopes: ./audit/access.js · seed: ./audit/seed.js
import { defineSystem } from './registry.js';
import { isStaff, hasCap, wrap, check, S, str, int, bool, arr, date, all, one, today, daysBetween, BadRequest } from './kit.js';
import { schema } from './audit/schema.js';
import { seed } from './audit/seed.js';
import * as A from './audit/service.js';
import { isIA, isHead, isCommittee, isExtAuditor, auditeeDepts, findingScope, requestScope, extScope } from './audit/access.js';

const RISK = ['high', 'medium', 'low'];
const RISK_AR = { high: 'عالية', medium: 'متوسطة', low: 'منخفضة' };
const PHASE_AR = { planned: 'مخطط لها', planning: 'التخطيط', fieldwork: 'العمل الميداني', reporting: 'إعداد التقرير', follow_up: 'المتابعة', closed: 'مغلقة' };
const FSTAT_AR = { issued: 'بانتظار رد الإدارة', in_follow_up: 'قيد المعالجة', implemented: 'منفذة — بانتظار التحقق', closed: 'مغلقة' };
const ids = arr(str('document id'), { maxItems: 10 });
const text = (d, max = 4000, min = 0) => str(d, { maxLength: max, ...(min ? { minLength: min } : {}) });

// ---------------- request schemas ----------------
const SCH = {
  plan: S({ year: int('year', { minimum: 2000, maximum: 2100 }), notes: text('notes', 2000), note: text('note', 2000) }),
  universe: S({ name_ar: text('name', 200, 3), name_en: text('name (en)', 200), department_id: str('department'), likelihood: int('1-5', { minimum: 1, maximum: 5 }), impact: int('1-5', { minimum: 1, maximum: 5 }), rationale: text('rationale', 2000) }, ['name_ar', 'department_id', 'likelihood', 'impact']),
  universeUpd: S({ likelihood: int('1-5', { minimum: 1, maximum: 5 }), impact: int('1-5', { minimum: 1, maximum: 5 }), rationale: text('rationale', 2000), active: bool('active') }),
  engagement: S({ title: text('title', 200, 5), department_id: str('auditee department'), universe_id: str('audit universe item'), quarter: int('1-4', { minimum: 1, maximum: 4 }), plan_year: int('year', { minimum: 2000, maximum: 2100 }), scope: text('scope', 3000), objectives: text('objectives', 3000), lead_id: str('lead auditor'), team: arr(str('auditor'), { maxItems: 8 }), start_date: date(), end_date: date() }, ['title', 'department_id', 'quarter']),
  engagementUpd: S({ title: text('title', 200, 5), quarter: int('1-4', { minimum: 1, maximum: 4 }), scope: text('scope', 3000), objectives: text('objectives', 3000), lead_id: str('lead'), team: arr(str('auditor'), { maxItems: 8 }), start_date: date(), end_date: date() }),
  phase: S({ to: str('phase', { enum: ['planning', 'fieldwork', 'reporting', 'follow_up', 'closed'] }) }, ['to']),
  summary: S({ exec_summary: text('executive summary', 6000) }, ['exec_summary']),
  issueReport: S({ exec_summary: text('executive summary', 6000), confirm: bool('explicit confirmation') }),
  request: S({ title: text('request', 300, 5), details: text('details', 3000), due_date: date('due date') }, ['title', 'due_date']),
  respond: S({ response_text: text('response', 6000, 5), doc_ids: ids }, ['response_text']),
  review: S({ decision: str('accept|return', { enum: ['accept', 'return'] }), note: text('note', 2000) }, ['decision']),
  workpaper: S({ title: text('title', 300, 3), procedure: text('test steps', 6000), evidence: text('evidence notes', 6000), conclusion: text('conclusion', 3000), result: str('result', { enum: ['pending', 'satisfactory', 'exception'] }) }, ['title']),
  workpaperUpd: S({ title: text('title', 300, 3), procedure: text('test steps', 6000), evidence: text('evidence notes', 6000), conclusion: text('conclusion', 3000), result: str('result', { enum: ['pending', 'satisfactory', 'exception'] }) }),
  wpReview: S({ note: text('note', 2000) }),
  finding: S({ title: text('title', 300, 5), criteria: text('criteria'), condition: text('condition'), cause: text('cause'), effect: text('effect'), risk: str('risk', { enum: RISK }), recommendation: text('recommendation', 3000), workpaper_id: str('working paper') }, ['title', 'risk', 'condition', 'recommendation']),
  findingUpd: S({ title: text('title', 300, 5), criteria: text('criteria'), condition: text('condition'), cause: text('cause'), effect: text('effect'), risk: str('risk', { enum: RISK }), recommendation: text('recommendation', 3000) }),
  confirm: S({ confirm: bool('explicit confirmation') }),
  mgmt: S({ position: str('agree|partial', { enum: ['agree', 'partial'] }), response_text: text('management response', 4000, 10), action_description: text('action plan', 3000, 10), owner_id: str('action owner'), due_date: date('implementation date') }, ['position', 'response_text', 'action_description', 'owner_id', 'due_date']),
  progress: S({ status: str('in_progress|implemented', { enum: ['in_progress', 'implemented'] }), note: text('note / evidence', 3000), doc_ids: ids }, ['status']),
  close: S({ decision: str('close|return', { enum: ['close', 'return'] }), note: text('note', 3000) }, ['decision']),
  note: S({ note: text('note', 3000, 3) }, ['note']),
  ext: S({ title: text('request', 300, 5), details: text('details', 3000), due_date: date('requested by') }, ['title']),
  assign: S({ to_user_id: str('department manager'), note: text('internal instructions', 2000) }, ['to_user_id']),
  prepare: S({ response_text: text('response', 6000, 5), doc_ids: ids }, ['response_text']),
  ret: S({ note: text('what to change', 2000, 5) }, ['note']),
  release: S({ released_text: text('released response', 6000, 5), confirm: bool('explicit confirmation') }),
};
const q = (req, key, allowed) => {
  const v = req.query[key];
  if (v == null || v === '') return undefined;
  if (typeof v !== 'string' || (allowed && !allowed.includes(v))) throw new BadRequest(`قيمة غير صالحة للمعامل ${key}`);
  return v;
};
const qYear = (req) => { const v = q(req, 'year'); if (v === undefined) return undefined; const n = Number(v); if (!Number.isInteger(n) || n < 2000 || n > 2100) throw new BadRequest('سنة غير صالحة'); return n; };
const flag = (req, key) => req.query[key] === '1' || req.query[key] === 'true';

function routes(r) {
  r.get('/me', wrap((req) => A.me(req.user)));
  // plan & universe
  r.get('/plan', wrap((req) => A.getPlan(req.user, { year: qYear(req) })));
  r.post('/plan/submit', wrap((req) => A.submitPlan(req.user, check(SCH.plan, req.body))));
  r.post('/plan/approve', wrap((req) => A.approvePlan(req.user, check(SCH.plan, req.body))));
  r.post('/plan/return', wrap((req) => A.returnPlan(req.user, check(SCH.plan, req.body))));
  r.post('/universe', wrap((req) => A.addUniverse(req.user, check(SCH.universe, req.body))));
  r.put('/universe/:id', wrap((req) => A.updateUniverse(req.user, req.params.id, check(SCH.universeUpd, req.body))));
  // engagements
  r.get('/engagements', wrap((req) => A.listEngagements(req.user, { year: qYear(req), phase: q(req, 'phase', A.PHASES), department_id: q(req, 'department_id') })));
  r.post('/engagements', wrap((req) => A.createEngagement(req.user, check(SCH.engagement, req.body))));
  r.get('/engagements/:id', wrap((req) => A.getEngagement(req.user, req.params.id)));
  r.put('/engagements/:id', wrap((req) => A.updateEngagement(req.user, req.params.id, check(SCH.engagementUpd, req.body))));
  r.post('/engagements/:id/phase', wrap((req) => A.advancePhase(req.user, req.params.id, check(SCH.phase, req.body))));
  r.put('/engagements/:id/summary', wrap((req) => A.saveSummary(req.user, req.params.id, check(SCH.summary, req.body))));
  r.post('/engagements/:id/summary-draft', wrap((req) => A.draftSummary(req.user, req.params.id)));
  r.post('/engagements/:id/issue-report', wrap((req) => A.issueReport(req.user, req.params.id, check(SCH.issueReport, req.body))));
  r.get('/engagements/:id/workpapers', wrap((req) => A.listWorkpapers(req.user, req.params.id)));
  r.post('/engagements/:id/workpapers', wrap((req) => A.createWorkpaper(req.user, req.params.id, check(SCH.workpaper, req.body))));
  r.post('/engagements/:id/requests', wrap((req) => A.createRequest(req.user, req.params.id, check(SCH.request, req.body))));
  r.post('/engagements/:id/findings', wrap((req) => A.createFinding(req.user, req.params.id, check(SCH.finding, req.body))));
  // working papers (restricted)
  r.get('/workpapers/:id', wrap((req) => A.getWorkpaper(req.user, req.params.id)));
  r.put('/workpapers/:id', wrap((req) => A.updateWorkpaper(req.user, req.params.id, check(SCH.workpaperUpd, req.body))));
  r.post('/workpapers/:id/review', wrap((req) => A.reviewWorkpaper(req.user, req.params.id, check(SCH.wpReview, req.body))));
  // information requests (PBC)
  r.get('/requests', wrap((req) => A.listRequests(req.user, { engagement_id: q(req, 'engagement_id'), status: q(req, 'status', ['open', 'responded', 'returned', 'accepted']), mine: flag(req, 'mine') })));
  r.get('/requests/:id', wrap((req) => A.getRequest(req.user, req.params.id)));
  r.post('/requests/:id/respond', wrap((req) => A.respondRequest(req.user, req.params.id, check(SCH.respond, req.body))));
  r.post('/requests/:id/review', wrap((req) => A.reviewRequest(req.user, req.params.id, check(SCH.review, req.body))));
  // findings & action plans
  r.get('/findings', wrap((req) => A.listFindings(req.user, { engagement_id: q(req, 'engagement_id'), status: q(req, 'status', ['draft', 'issued', 'in_follow_up', 'implemented', 'closed']), risk: q(req, 'risk', RISK), department_id: q(req, 'department_id'), open: flag(req, 'open'), overdue: flag(req, 'overdue'), mine: flag(req, 'mine') })));
  r.get('/findings/:id', wrap((req) => A.getFinding(req.user, req.params.id)));
  r.put('/findings/:id', wrap((req) => A.updateFinding(req.user, req.params.id, check(SCH.findingUpd, req.body))));
  r.post('/findings/:id/withdraw', wrap((req) => A.withdrawFinding(req.user, req.params.id, check(SCH.confirm, req.body))));
  r.post('/findings/:id/issue', wrap((req) => A.issueFinding(req.user, req.params.id, check(SCH.confirm, req.body))));
  r.post('/findings/:id/respond', wrap((req) => A.respondFinding(req.user, req.params.id, check(SCH.mgmt, req.body))));
  r.post('/findings/:id/progress', wrap((req) => A.progressAction(req.user, req.params.id, check(SCH.progress, req.body))));
  r.post('/findings/:id/close', wrap((req) => A.closeFinding(req.user, req.params.id, check(SCH.close, req.body))));
  r.post('/findings/:id/note', wrap((req) => A.noteFinding(req.user, req.params.id, check(SCH.note, req.body))));
  // external auditor portal
  r.get('/ext', wrap((req) => A.listExt(req.user, { status: q(req, 'status', ['submitted', 'assigned', 'prepared', 'released']) })));
  r.post('/ext', wrap((req) => A.createExt(req.user, check(SCH.ext, req.body))));
  r.get('/ext/:id', wrap((req) => A.getExt(req.user, req.params.id)));
  r.post('/ext/:id/assign', wrap((req) => A.assignExt(req.user, req.params.id, check(SCH.assign, req.body))));
  r.post('/ext/:id/prepare', wrap((req) => A.prepareExt(req.user, req.params.id, check(SCH.prepare, req.body))));
  r.post('/ext/:id/return', wrap((req) => A.returnExt(req.user, req.params.id, check(SCH.ret, req.body))));
  r.post('/ext/:id/release', wrap((req) => A.releaseExt(req.user, req.params.id, check(SCH.release, req.body))));
  // linked documents & dashboards
  r.get('/people', wrap((req) => A.people(req.user)));
  r.get('/links/:id', wrap((req) => A.viewLink(req.user, req.params.id)));
  r.get('/dashboard', wrap((req) => A.dashboard(req.user, { year: qYear(req) })));
}

// ---------------- Ask AI tools ----------------
const dLate = (a) => (a?.overdue ? ` — متأخرة ${a.days_overdue} يوماً` : '');
const fmtActions = (res, { step } = {}) => {
  if (!res.length) return step?.input?.overdue ? 'لا توجد خطط معالجة متأخرة ضمن نطاقك.' : 'لا توجد ملاحظات تدقيق صادرة أو خطط معالجة ضمن نطاقك.';
  return `${step?.input?.overdue ? 'خطط المعالجة المتأخرة' : 'ملاحظات التدقيق وخطط المعالجة ضمن نطاقك'} (${res.length}):\n${res.slice(0, 12).map((f) => `– ${f.title} [${f.department?.name_ar || ''}، خطورة ${RISK_AR[f.risk]}] — ${FSTAT_AR[f.status] || f.status}${f.action ? `، الاستحقاق ${f.action.due_date}${dLate(f.action)}` : ''}`).join('\n')}`;
};
const tools = [
  {
    name: 'audit_my_actions', domain: 'audit.findings',
    description: 'Issued internal-audit findings for the departments the user manages, or whose action plan is assigned to the user: title, risk, status, action plan owner/due date, overdue flag. Optional overdue=true for overdue action plans only. Drafts and working papers are never included.',
    input_schema: S({ overdue: bool('only overdue action plans') }),
    handler: (u, i) => ({ result: A.myActions(u, i) }),
    format: fmtActions,
  },
  {
    name: 'audit_findings_summary', domain: 'audit.findings',
    description: 'Aggregates for Internal Audit and the Audit Committee only: open issued findings by risk and department, overdue action plans, findings awaiting management response or closure validation, plan progress by phase. Refused for other users.',
    input_schema: S({}),
    handler: (u) => ({ result: A.dashboard(u) }),
    format: (r) => [
      `ملخص ملاحظات التدقيق لعام ${r.year}: ${r.open.total} ملاحظة مفتوحة (عالية ${r.open.high}، متوسطة ${r.open.medium}، منخفضة ${r.open.low}).`,
      `بانتظار رد الإدارة: ${r.awaiting_response} · بانتظار التحقق من الإغلاق: ${r.awaiting_validation} · مغلقة: ${r.closed}.`,
      r.overdue.length ? `خطط معالجة متأخرة (${r.overdue.length}):\n${r.overdue.slice(0, 8).map((o) => `– ${o.title} [${o.department?.name_ar || ''}] متأخرة ${o.days_overdue} يوماً`).join('\n')}` : 'لا توجد خطط معالجة متأخرة.',
      r.by_department.length ? `حسب الإدارة: ${r.by_department.map((d) => `${d.department?.name_ar} ${d.total}`).join('، ')}.` : '',
      `تقدم الخطة: ${r.plan.reports_issued} تقارير صادرة من ${r.plan.total} مهام.`,
    ].filter(Boolean).join('\n'),
  },
  {
    name: 'audit_update_action', domain: 'audit.findings', mutates: true,
    description: 'The action-plan owner reports progress on an issued audit finding: status in_progress, or implemented with a note describing what was done and the evidence (at least 10 characters). Only the owner may do this; closure is validated later by the Chief Audit Executive.',
    input_schema: S({ finding_id: str('audit finding id'), status: str('in_progress|implemented', { enum: ['in_progress', 'implemented'] }), note: str('what was done / evidence', { maxLength: 3000 }) }, ['finding_id', 'status']),
    handler: (u, i) => ({ result: A.progressAction(u, i.finding_id, { status: i.status, note: i.note || '' }) }),
    format: (r) => `تم تحديث خطة معالجة «${r.title}» إلى «${r.action?.status === 'implemented' ? 'منفذة — بانتظار تحقق التدقيق الداخلي' : 'قيد التنفيذ'}».`,
  },
];

// ---------------- local-planner intents ----------------
const reviewer = (u) => isIA(u) || isCommittee(u);
const intents = [
  {
    // «خطط المعالجة المتأخرة»
    test: (n) => /خط(ط|ه)\s+(ال)?معالجه/.test(n) && /متاخر/.test(n),
    plan: (user, clause, ctx, { norm }) => (reviewer(user) && !/(ادارتي|قسمي|المسنده الي|الخاصه بي)/.test(norm(clause))
      ? [{ tool: 'audit_findings_summary', input: {}, label: 'ملخص ملاحظات التدقيق والخطط المتأخرة' }]
      : [{ tool: 'audit_my_actions', input: { overdue: true }, label: 'خطط المعالجة المتأخرة' }]),
  },
  {
    // «ملاحظات التدقيق على إدارتي» · «خطط المعالجة»
    test: (n) => /(ملاحظات|ملاحظه)\s+(ال)?تدقيق/.test(n) || /خط(ط|ه)\s+(ال)?معالجه/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const mine = /(ادارتي|قسمي|المسنده الي|الخاصه بي|علي ادار)/.test(n);
      if (reviewer(user) && !mine) return [{ tool: 'audit_findings_summary', input: {}, label: 'ملخص ملاحظات التدقيق' }];
      if (!auditeeDepts(user).length && !reviewer(user) && !one('SELECT 1 FROM audit_actions WHERE owner_id=?', user.id)) return [{ say: 'لا توجد ملاحظات تدقيق صادرة على إدارتك أو خطط معالجة مسندة إليك.' }];
      return [{ tool: 'audit_my_actions', input: {}, label: 'ملاحظات التدقيق على إدارتي' }];
    },
  },
];

// ---------------- Home workspace cards ----------------
const H = '#/sys/audit';
function workspace(user) {
  const cards = [];
  const t = today();
  if (isExtAuditor(user)) {
    const s = extScope(user);
    const rows = all(`SELECT x.id,x.title,x.status,x.due_date FROM audit_ext_requests x WHERE ${s.sql} ORDER BY x.status='released', x.created_at DESC`, ...s.params);
    const open = rows.filter((x) => x.status !== 'released');
    const st = (x) => (x.status === 'released' ? ['تم الرد', 'Answered'] : x.status === 'submitted' ? ['مستلم', 'Received'] : ['قيد الإعداد', 'In progress']);
    return [{ title_ar: 'حالة طلباتي', title_en: 'My requests', value: open.length, unit_ar: 'قيد المعالجة', unit_en: 'in progress', tone: null,
      hint_ar: `${rows.length - open.length} طلب تم الرد عليه`, hint_en: `${rows.length - open.length} answered`, href: `${H}/portal`,
      items: rows.slice(0, 3).map((x) => ({ title: x.title, meta_ar: st(x)[0], meta_en: st(x)[1], href: `${H}/x/${x.id}` })),
      cta: { label_ar: 'طلب جديد', label_en: 'New request', href: `${H}/portal/new` } }];
  }
  if (!isStaff(user)) return [];
  if (isIA(user)) {
    const open = A.listEngagements(user, {}).filter((e) => !['planned', 'closed'].includes(e.phase)).sort((a, b) => Number(b.mine) - Number(a.mine));
    cards.push({ title_ar: 'مهام التدقيق الجارية', title_en: 'Open engagements', value: open.length, unit_ar: 'مهمة', unit_en: 'engagements', tone: null,
      hint_ar: 'مرتبة بمهامك أولاً', hint_en: 'Yours first', href: `${H}/board`,
      items: open.slice(0, 3).map((e) => ({ title: e.title, meta_ar: PHASE_AR[e.phase], meta_en: e.phase.replace('_', '-'), href: `${H}/e/${e.id}` })),
      cta: { label_ar: 'لوحة المهام', label_en: 'Engagement board', href: `${H}/board` } });
    const late = all("SELECT r.id,r.title,r.due_date,d.name_ar dept FROM audit_requests r JOIN departments d ON d.id=r.department_id WHERE r.status IN ('open','returned') AND r.due_date<? ORDER BY r.due_date", t);
    cards.push({ title_ar: 'ردود متأخرة من الإدارات', title_en: 'Overdue responses', value: late.length, unit_ar: 'طلب', unit_en: 'requests', tone: late.length ? 'warn' : 'good',
      hint_ar: late.length ? 'طلبات معلومات تجاوزت موعدها' : 'جميع الطلبات ضمن موعدها', hint_en: late.length ? 'Information requests past due' : 'All requests on time', href: `${H}/requests`,
      items: late.slice(0, 3).map((r) => ({ title: r.title, meta_ar: `${r.dept} · ${daysBetween(r.due_date, t)} يوم`, meta_en: `${daysBetween(r.due_date, t)} d late`, href: `${H}/requests/${r.id}` })),
      cta: { label_ar: 'طلبات المعلومات', label_en: 'Information requests', href: `${H}/requests` } });
    if (isHead(user)) {
      const val = all("SELECT id,title FROM audit_findings WHERE status='implemented' AND withdrawn_at IS NULL AND raised_by<>?", user.id).map((f) => ({ title: f.title, meta_ar: 'تحقق من الإغلاق', meta_en: 'Validate closure', href: `${H}/f/${f.id}` }));
      const iss = all("SELECT id,title FROM audit_findings WHERE status='draft' AND withdrawn_at IS NULL AND raised_by<>?", user.id).map((f) => ({ title: f.title, meta_ar: 'مسودة للإصدار', meta_en: 'Draft to issue', href: `${H}/f/${f.id}` }));
      const ext = all("SELECT id,title,status FROM audit_ext_requests WHERE status IN ('submitted','prepared') ORDER BY created_at").map((x) => ({ title: x.title, meta_ar: x.status === 'submitted' ? 'إسناد' : 'إفراج', meta_en: x.status === 'submitted' ? 'Assign' : 'Release', href: `${H}/x/${x.id}` }));
      const items = [...val, ...ext, ...iss];
      cards.push({ title_ar: 'بانتظار قرارك', title_en: 'Awaiting your decision', value: items.length, unit_ar: 'إجراء', unit_en: 'items', tone: items.length ? 'emph' : 'good',
        hint_ar: `${val.length} إغلاق · ${ext.length} طلب خارجي · ${iss.length} مسودة`, hint_en: `${val.length} closures · ${ext.length} external · ${iss.length} drafts`, href: `${H}/findings`,
        items: items.slice(0, 3), cta: { label_ar: 'مراجعة', label_en: 'Review', href: val.length ? `${H}/findings` : ext.length ? `${H}/external` : `${H}/findings` } });
    } else {
      const rv = all("SELECT r.id,r.title,d.name_ar dept FROM audit_requests r JOIN departments d ON d.id=r.department_id WHERE r.status='responded' ORDER BY r.responded_at");
      cards.push({ title_ar: 'ردود بانتظار مراجعتك', title_en: 'Responses to review', value: rv.length, unit_ar: 'رد', unit_en: 'responses', tone: rv.length ? 'emph' : 'good',
        hint_ar: 'راجع الرد واقبله أو أعده للاستكمال', hint_en: 'Accept or return for completion', href: `${H}/requests`,
        items: rv.slice(0, 3).map((r) => ({ title: r.title, meta_ar: r.dept, meta_en: r.dept, href: `${H}/requests/${r.id}` })), cta: { label_ar: 'مراجعة الردود', label_en: 'Review responses', href: `${H}/requests` } });
    }
    return cards.slice(0, 3);
  }
  if (isCommittee(user)) {
    const s = findingScope(user);
    const high = all(`SELECT f.id,f.title,d.name_ar dept FROM audit_findings f JOIN departments d ON d.id=f.department_id WHERE ${s.sql} AND f.risk='high' AND f.status IN ('issued','in_follow_up','implemented')`, ...s.params);
    const late = one(`SELECT COUNT(*) n FROM audit_findings f JOIN audit_actions a ON a.finding_id=f.id WHERE ${s.sql} AND a.status IN ('open','in_progress') AND a.due_date<?`, ...s.params, t).n;
    cards.push({ title_ar: 'ملاحظات عالية الخطورة مفتوحة', title_en: 'Open high-risk findings', value: high.length, unit_ar: 'ملاحظة', unit_en: 'findings', tone: high.length ? 'emph' : 'good',
      hint_ar: late ? `${late} خطة معالجة متأخرة في التقارير الصادرة` : 'لا خطط معالجة متأخرة', hint_en: late ? `${late} overdue action plans in issued reports` : 'No overdue action plans', href: `${H}/committee`,
      items: high.slice(0, 3).map((f) => ({ title: f.title, meta_ar: f.dept, meta_en: f.dept, href: `${H}/f/${f.id}` })), cta: { label_ar: 'لوحة اللجنة', label_en: 'Committee dashboard', href: `${H}/committee` } });
  }
  const depts = auditeeDepts(user);
  if (depts.length) {
    const s = findingScope(user);
    const waiting = all(`SELECT f.id,f.title,f.risk FROM audit_findings f WHERE ${s.sql} AND f.status='issued' AND f.department_id IN (${depts.map(() => '?').join(',')})`, ...s.params, ...depts);
    if (waiting.length) cards.push({ title_ar: 'ملاحظات بانتظار ردّك', title_en: 'Findings awaiting your response', value: waiting.length, unit_ar: 'ملاحظة', unit_en: 'findings', tone: 'warn',
      hint_ar: 'قدّم رد الإدارة وخطة المعالجة', hint_en: 'Give the management response and action plan', href: `${H}/mine`,
      items: waiting.slice(0, 3).map((f) => ({ title: f.title, meta_ar: `خطورة ${RISK_AR[f.risk]}`, meta_en: `${f.risk} risk`, href: `${H}/f/${f.id}` })), cta: { label_ar: 'الرد الآن', label_en: 'Respond now', href: waiting.length === 1 ? `${H}/f/${waiting[0].id}` : `${H}/mine` } });
  }
  const rs = requestScope(user);
  const reqs = all(`SELECT r.id,r.title,r.due_date FROM audit_requests r WHERE ${rs.sql} AND r.to_user_id=? AND r.status IN ('open','returned') ORDER BY r.due_date`, ...rs.params, user.id);
  const exts = all("SELECT id,title,due_date FROM audit_ext_requests WHERE assigned_to=? AND status='assigned' ORDER BY due_date", user.id);
  if (reqs.length || exts.length) {
    const lateN = [...reqs, ...exts].filter((r) => r.due_date && r.due_date < t).length;
    cards.push({ title_ar: 'طلبات معلومات مفتوحة', title_en: 'Open information requests', value: reqs.length + exts.length, unit_ar: 'طلب', unit_en: 'requests', tone: lateN ? 'warn' : null,
      hint_ar: lateN ? `${lateN} تجاوز موعده` : 'ضمن المواعيد', hint_en: lateN ? `${lateN} past due` : 'On time', href: `${H}/requests`,
      items: [...reqs.map((r) => ({ ...r, href: `${H}/requests/${r.id}` })), ...exts.map((x) => ({ ...x, href: `${H}/x/${x.id}` }))].slice(0, 3).map((r) => ({ title: r.title, meta_ar: r.due_date ? `الاستحقاق ${r.due_date}` : '', meta_en: r.due_date ? `Due ${r.due_date}` : '', href: r.href })),
      cta: { label_ar: 'الرد على الطلبات', label_en: 'Respond', href: `${H}/requests` } });
  }
  const mine = all("SELECT f.id,f.title,a.due_date FROM audit_actions a JOIN audit_findings f ON f.id=a.finding_id WHERE a.owner_id=? AND a.status IN ('open','in_progress') AND f.status='in_follow_up' AND f.withdrawn_at IS NULL ORDER BY a.due_date", user.id);
  if (mine.length) {
    const lateN = mine.filter((m) => m.due_date < t).length;
    cards.push({ title_ar: 'خطط المعالجة المسندة إليك', title_en: 'Your audit action plans', value: mine.length, unit_ar: 'خطة', unit_en: 'plans', tone: lateN ? 'warn' : null,
      hint_ar: lateN ? `${lateN} تجاوزت تاريخ الاستحقاق` : 'نفّذها قبل الاستحقاق لتكسب نقاط التميّز', hint_en: lateN ? `${lateN} past due` : 'Deliver by the due date to earn excellence points', href: `${H}/actions`,
      items: mine.slice(0, 3).map((m) => ({ title: m.title, meta_ar: `الاستحقاق ${m.due_date}`, meta_en: `Due ${m.due_date}`, href: `${H}/f/${m.id}` })), cta: { label_ar: 'تحديث الحالة', label_en: 'Update status', href: mine.length === 1 ? `${H}/f/${mine[0].id}` : `${H}/actions` } });
  }
  return cards.slice(0, 3);
}

// ---------------- gamification (derived from validated records only) ----------------
const gameRules = [
  { key: 'audit_action_on_time', points: 10, ar: 'تنفيذ خطة معالجة ملاحظة تدقيق في موعدها (بعد تحقق التدقيق الداخلي)', en: 'Audit action plan implemented by its due date (validated by Internal Audit)' },
  { key: 'audit_info_on_time', points: 5, ar: 'الرد على طلب معلومات للتدقيق في موعده (بعد قبوله)', en: 'Audit information request answered on time (accepted)' },
];
function gameEvents(userId) {
  const out = [];
  // Generic refs only: game history is visible to Ask AI, audit details are not.
  for (const a of all("SELECT id,closed_at FROM audit_actions WHERE owner_id=? AND status='closed' AND implemented_at IS NOT NULL AND substr(implemented_at,1,10)<=due_date AND closed_at IS NOT NULL", userId))
    out.push({ kind: 'audit_action_on_time', points: 10, at: a.closed_at, ref: 'خطة معالجة ملاحظة تدقيق', id: `audit_action:${a.id}` });
  for (const r of all("SELECT id,reviewed_at FROM audit_requests WHERE responded_by=? AND status='accepted' AND substr(responded_at,1,10)<=due_date AND reviewed_at IS NOT NULL", userId))
    out.push({ kind: 'audit_info_on_time', points: 5, at: r.reviewed_at, ref: 'طلب معلومات للتدقيق الداخلي', id: `audit_pbc:${r.id}` });
  for (const x of all("SELECT id,released_at FROM audit_ext_requests WHERE prepared_by=? AND status='released' AND due_date IS NOT NULL AND substr(prepared_at,1,10)<=due_date", userId))
    out.push({ kind: 'audit_info_on_time', points: 5, at: x.released_at, ref: 'طلب معلومات للمدقق الخارجي', id: `audit_ext:${x.id}` });
  return out;
}

defineSystem({
  key: 'audit',
  name_ar: 'التدقيق الداخلي', name_en: 'Internal Audit',
  description_ar: 'خطة التدقيق المبنية على المخاطر والمهام والملاحظات وخطط المعالجة والمتابعة، وطلبات المدقق الخارجي',
  description_en: 'Risk-based audit plan, engagements, findings, action plans and follow-up, plus external auditor requests',
  icon: 'searchCheck', category: 'governance',
  external: true,
  access: (u) => isStaff(u) || hasCap(u, 'audit.external'),
  defaultPinned: (u) => hasCap(u, 'audit.head', 'audit.auditor', 'audit.committee', 'audit.external') || u.role === 'manager',
  caps: [
    { cap: 'audit.head', ar: 'رئاسة التدقيق الداخلي (اعتماد الخطة وإصدار التقارير)', en: 'Chief audit executive (approve plan, issue reports)' },
    { cap: 'audit.auditor', ar: 'مدقق داخلي', en: 'Internal auditor' },
    { cap: 'audit.committee', ar: 'لجنة التدقيق (اطلاع على التقارير الصادرة)', en: 'Audit committee (issued reports)' },
    { cap: 'audit.external', ar: 'مدقق خارجي (بوابة الطلبات فقط)', en: 'External auditor (requests portal only)', external: true },
  ],
  domains: [
    { key: 'audit.workpapers', name_ar: 'أوراق العمل وملفات التدقيق', name_en: 'Audit working papers', classification: 'restricted', ai: 'off', locked: true, note_ar: 'للمدققين الداخليين فقط', note_en: 'Internal auditors only' },
    { key: 'audit.findings', name_ar: 'الملاحظات وخطط المعالجة الصادرة', name_en: 'Issued findings and action plans', classification: 'confidential', ai: 'opt_in', note_ar: 'تظهر للجهة الخاضعة للتدقيق بعد إصدارها', note_en: 'Visible to the auditee once issued' },
  ],
  agent: {
    name_ar: 'مساعد التدقيق الداخلي', name_en: 'Internal Audit assistant',
    description_ar: 'يعرض ملاحظات التدقيق الصادرة على إدارتك وخطط المعالجة المسندة إليك، وملخصات اللجنة ومكتب التدقيق.',
    description_en: 'Shows issued audit findings for your department, your action plans, and committee/IA summaries.',
    instructions: 'ينفّذ ضمن صلاحيات المستخدم في نظام التدقيق فقط. لا يطّلع على أوراق العمل أو المسودات مطلقاً، ولا يدّعي إغلاق ملاحظة؛ الإغلاق يعتمده رئيس التدقيق الداخلي من الواجهة.',
  },
  schema, seed, routes, tools, intents, workspace, gameRules, gameEvents,
});
