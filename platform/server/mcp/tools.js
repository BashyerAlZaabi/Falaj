// Tool registry shared by Ask AI (in-process) and the MCP endpoint (/mcp).
// Every tool: declared schema, server-side validation, policy enforced inside
// the domain services, flags for reversibility and confirmation.
// There are deliberately NO tools that read Vault (FS / Marsad) content.
import * as W from '../services/work.js';
import * as D from '../services/documents.js';
import * as B from '../services/dashboard.js';
import { runSkill, SKILL_DEFS } from '../ai/skills.js';
import { one } from '../db.js';
import * as Policy from '../policy.js';
import * as O from '../services/office.js';
import * as G from '../services/game.js';

const S = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const int = (description, extra = {}) => ({ type: 'integer', description, ...extra });
const date = (description) => str(description, { format: 'date' });

// ---------- strategic portfolio: Arabic result texts for Ask AI ----------
const pctTxt = (v) => (v == null ? 'غير مسجّلة' : `${v}%`);
const aed = (n) => (n == null ? null : `${Math.round(n).toLocaleString('en-US')} درهم`);
const STATE_AR = { delayed: 'متأخر', at_risk: 'معرّض للتأخر', on_track: 'ضمن الخطة', missing: 'بلا نسبة مسجّلة', done: 'مكتمل', on_hold: 'متوقف مؤقتاً', cancelled: 'ملغى' };
const ALLOC_AR = { pending_manager: 'بانتظار اعتماد المدير', active: 'معتمد', declined: 'لم يُعتمد', ended: 'منتهٍ' };
const names = (list) => list.filter(Boolean).join('، ');
function fmtStrategic(res) {
  const allocs = res.allocations || []; const pending = allocs.filter((a) => a.status === 'pending_manager');
  const deciders = [...new Set(pending.flatMap((a) => a.deciders.map((d) => d.name_ar)))];
  const parts = [`أنشأت المشروع الاستراتيجي «${res.name}» في ${res.dept_ar} — المالك ${res.owner_name_ar}، الاستحقاق ${res.due_date}${res.budget != null ? `، الميزانية ${aed(res.budget)}` : ''}.`];
  if (allocs.length) parts.push(`خُصّص ${allocs.length} ${allocs.length === 1 ? 'مورد' : 'موارد'}${pending.length ? `، منها ${pending.length} بانتظار اعتماد ${names(deciders)}` : ''}.`);
  if ((res.tasks || []).length) parts.push(`أُسندت ${res.tasks.length} ${res.tasks.length === 1 ? 'مهمة' : 'مهام'} (${names(res.tasks.slice(0, 4).map((t) => `${t.title} ← ${t.assignee_ar}`))}).`);
  if ((res.milestones || []).length) parts.push(`${res.milestones.length} معالم زمنية.`);
  parts.push(`نسبة الإنجاز ${res.progress_mode === 'tasks' ? 'تُحسب تلقائياً من المهام' : 'يحدّثها المالك'}، وظهر المشروع فوراً على داشبورد المعنيين.`);
  return parts.join(' ');
}
function fmtAllocation(a) {
  const period = `${a.start_date} – ${a.end_date}`;
  if (a.status === 'pending_manager') return `اقترحت تخصيص ${a.percent}% من وقت ${a.person_ar} لمشروع «${a.project_name}» (${period}). الطلب بانتظار اعتماد ${names(a.deciders.map((d) => d.name_ar)) || 'مديره المباشر'}، وأُبلغ ${a.person_ar} بذلك.${a.over ? ` ⚠️ سيبلغ حمله ${a.load_with}% إن اعتُمد.` : ''}`;
  if (a.status === 'active') return `خُصّص ${a.percent}% من وقت ${a.person_ar} لمشروع «${a.project_name}» (${period}) واعتُمد مباشرة لأنك مديره.${a.over ? ` ⚠️ حمله الآن ${a.load_with}% — تجاوز للسعة.` : ''}`;
  return `تخصيص ${a.person_ar} لمشروع «${a.project_name}»: ${ALLOC_AR[a.status]}.`;
}
function fmtDecision(a) {
  if (a.undone) return 'سُحب طلب التخصيص ولم يعد بانتظار أي قرار.';
  if (a.status === 'active') return `اعتُمد تخصيص ${a.percent}% من وقت ${a.person_ar} لمشروع «${a.project_name}» (${a.start_date} – ${a.end_date})${a.proposed_percent && a.proposed_percent !== a.percent ? ` بعد تعديله من ${a.proposed_percent}%` : ''}. أُبلغ ${a.person_ar} و${a.allocated_by_ar}.${a.over ? ` ⚠️ حمله ${a.load_with}%.` : ''}`;
  if (a.status === 'declined') return `سُجّل الاعتذار عن تخصيص ${a.person_ar} لمشروع «${a.project_name}» مع السبب: ${a.decision_note}. أُبلغ ${a.allocated_by_ar}.`;
  if (a.status === 'ended') return `أُنهي تخصيص ${a.person_ar} لمشروع «${a.project_name}» اعتباراً من ${a.end_date}.`;
  return `تخصيص ${a.person_ar}: ${ALLOC_AR[a.status]}.`;
}
function fmtPortfolio(d) {
  const t = d.totals;
  if (!t.projects) return 'لا توجد مشاريع استراتيجية ضمن نطاقك.';
  const lines = [`**المحفظة الاستراتيجية** — ${t.projects} ${t.projects === 1 ? 'مشروع' : 'مشاريع'} في ${d.by_department.length} ${d.by_department.length === 1 ? 'إدارة' : 'إدارات'}`,
    `• متوسط الإنجاز ${pctTxt(t.avg_progress)} مقابل ${pctTxt(t.avg_expected)} متوقعاً زمنياً (${t.reported} ${t.reported === 1 ? 'مشروع يسجّل' : 'مشاريع تسجّل'} نسبة)`,
    `• متأخرة: ${t.delayed} · معرّضة للتأخر: ${t.at_risk} · ضمن الخطة: ${t.on_track}${t.milestones_late ? ` · معالم متأخرة: ${t.milestones_late}` : ''}`,
    `• الميزانية: ${aed(t.budget) || '—'} · الموارد المعتمدة: ${t.fte} FTE (${t.people} موظفاً)${t.pending_allocations ? ` · ${t.pending_allocations} تخصيص بانتظار الاعتماد` : ''}`, ''];
  for (const p of d.projects.slice(0, 12)) lines.push(`– «${p.name}» (${p.dept_ar}): ${pctTxt(p.progress)}${p.expected_progress != null && p.status === 'active' ? ` / المتوقع ${p.expected_progress}%` : ''} — ${STATE_AR[p.state]}${p.next_milestone ? ` · المعلم القادم: ${p.next_milestone.title} (${p.next_milestone.due_date})` : ''}`);
  lines.push(`\n_المصدر: ${d.source}_`);
  return lines.join('\n');
}
function fmtAssignments(d) {
  const open = d.tasks.filter((t) => t.status !== 'done');
  if (!open.length && !d.allocations.length) return 'لا توجد مهام أو تخصيصات أسندها إليك آخرون حالياً.';
  const lines = [];
  if (open.length) {
    lines.push(`**مهام كلّفك بها آخرون (${open.length}):**`);
    for (const t of open.slice(0, 10)) lines.push(`– «${t.title}» من ${t.assigner_ar || '—'}${t.project_name ? ` — ${t.project_name}` : ''}${t.due_date ? ` — الاستحقاق ${t.due_date}` : ''}${t.overdue ? ' ⚠️ متأخرة' : ''}`);
  }
  if (d.allocations.length) {
    lines.push(`\n**تخصيص وقتك (${d.allocations.length}):**`);
    for (const a of d.allocations) lines.push(`– ${a.percent}% لمشروع «${a.project_name}» (${a.start_date} – ${a.end_date}) — ${ALLOC_AR[a.status]}${a.status === 'pending_manager' ? ` لدى ${names(a.deciders.map((x) => x.name_ar))}` : ''}، اقترحه ${a.allocated_by_ar}`);
    lines.push(`حملك الحالي: ${d.counts.load_now}%`);
  }
  return lines.join('\n');
}
function fmtCapacity(d) {
  if (!d.people.length) return 'لا يوجد موظفون ضمن نطاق السعة لديك.';
  const s = d.summary;
  const lines = [`**سعة الفريق** — ${s.people} موظفاً · متوسط الحمل ${s.avg_load}% · ${s.over} يتجاوز 100%${s.pending_decisions ? ` · ${s.pending_decisions} بانتظار اعتمادك` : ''}`];
  for (const p of d.people.slice(0, 12)) lines.push(`– ${p.name_ar} (${p.dept_ar}): الآن ${p.load_now}%، الذروة ${p.peak}%${p.pending ? ` (+${p.pending}% بانتظار الاعتماد)` : ''}${p.over ? ' ⚠️ تجاوز' : ''}`);
  return lines.join('\n');
}

export const TOOLS = [
  // ---------- read ----------
  { name: 'get_daily_summary', group: 'work', description: 'Daily summary for the current user: tasks due, overdue, priorities, events today, delayed projects, alerts, items needing action.', input_schema: S({}), handler: (u) => ({ result: W.dailySummary(u) }) },
  { name: 'list_projects', group: 'work', description: 'List projects visible to the user. Filter by status or delayed.', input_schema: S({ status: str('active|on_hold|done|cancelled', { enum: ['active', 'on_hold', 'done', 'cancelled'] }), delayed: { type: 'boolean' }, q: str('text search') }), handler: (u, i) => ({ result: W.listProjects(u, i) }) },
  { name: 'get_project', group: 'work', description: 'Get one project with its tasks and progress (progress may be null = not reported).', input_schema: S({ id: str('project id') }, ['id']), handler: (u, i) => ({ result: W.getProject(u, i.id) }) },
  { name: 'find_project', group: 'work', description: 'Find visible projects by (partial) name.', input_schema: S({ name: str('project name') }, ['name']), handler: (u, i) => ({ result: W.findProjects(u, i.name).map((p) => ({ id: p.id, name: p.name, progress: p.progress, due_date: p.due_date, status: p.status })) }) },
  { name: 'list_tasks', group: 'work', description: 'List tasks visible to the user.', input_schema: S({ status: str('todo|in_progress|done', { enum: ['todo', 'in_progress', 'done'] }), project_id: str('project id'), mine: { type: 'boolean' }, overdue: { type: 'boolean' }, q: str('text') }), handler: (u, i) => ({ result: W.listTasks(u, i) }) },
  { name: 'list_events', group: 'work', description: 'List upcoming appointments (default next 14 days).', input_schema: S({ from: str('ISO date'), to: str('ISO date') }), handler: (u, i) => ({ result: W.listEvents(u, i) }) },
  { name: 'search_workspace', group: 'work', description: 'Search projects, tasks, documents and events the user may access.', input_schema: S({ q: str('query') }, ['q']), handler: (u, i) => ({ result: W.search(u, i.q) }) },
  { name: 'get_kpis', group: 'monitor', description: 'ADAA I monitoring indicators within the user scope (outside-Vault sources only), with source and update time.', input_schema: S({}), handler: (u) => ({ result: W.kpis(u) }) },
  { name: 'list_assignable_users', group: 'work', description: 'Users the current user may assign tasks to.', input_schema: S({}), handler: (u) => ({ result: Policy.assignableUsers(u) }) },
  { name: 'get_dashboard', group: 'dashboard', description: 'Current dashboard layout (widgets: id, type, view, filters, size, title).', input_schema: S({}), handler: (u) => ({ result: B.getDashboard(u) }) },
  { name: 'list_documents', group: 'docs', description: 'List documents the user can access.', input_schema: S({}), handler: (u) => ({ result: D.listDocuments(u) }) },
  { name: 'read_document', group: 'docs', description: 'Read a document (HTML content, version).', input_schema: S({ id: str('document id') }, ['id']), handler: (u, i) => ({ result: D.getDocument(u, i.id) }) },
  { name: 'list_document_versions', group: 'docs', description: 'Version history of a document.', input_schema: S({ id: str('document id') }, ['id']), handler: (u, i) => ({ result: D.listVersions(u, i.id) }) },

  // ---------- write (reversible, executed directly with undo) ----------
  { name: 'create_project', group: 'work', mutates: true, description: 'Create a project. Do not invent progress; leave it unset unless the user states it.', input_schema: S({ name: str('name'), description: str('description'), due_date: str('YYYY-MM-DD'), start_date: str('YYYY-MM-DD'), progress: int('0-100, only if user stated', { minimum: 0, maximum: 100 }), progress_mode: str('manual (owner reports %) | tasks (auto from task completion)', { enum: ['manual', 'tasks'] }) }, ['name']), handler: W.createProject },
  { name: 'update_project', group: 'work', mutates: true, voiceSensitive: ['progress', 'due_date'], description: 'Update project fields (progress 0-100 ONLY when the user gave the exact value; status; dates; name; budget in AED; initiative_ref; progress_mode manual|tasks). Strategic governance (is_strategic, sponsor_id) is for the SPMO only.', input_schema: S({ id: str('project id'), progress: int('0-100', { minimum: 0, maximum: 100 }), status: str('status', { enum: ['active', 'on_hold', 'done', 'cancelled'] }), due_date: str('YYYY-MM-DD'), start_date: str('YYYY-MM-DD'), name: str('name'), description: str('description'), budget: { type: 'number', minimum: 0, description: 'budget (AED)' }, initiative_ref: str('reference to a strategy initiative'), progress_mode: str('progress mode', { enum: ['manual', 'tasks'] }), is_strategic: { type: 'boolean' }, sponsor_id: str('sponsor user id (SPMO)'), owner_id: str('owner user id') }, ['id']), handler: W.updateProject },
  { name: 'create_task', group: 'work', mutates: true, description: 'Create a task (optionally in a project, assigned to a permitted user). In a STRATEGIC project the SPMO (strategy.admin) may assign any internal staff member; the owner may assign people actively allocated to it.', input_schema: S({ title: str('title'), description: str('description'), project_id: str('project id'), assignee_id: str('user id (default: me)'), priority: str('priority', { enum: ['low', 'medium', 'high', 'urgent'] }), due_date: str('YYYY-MM-DD') }, ['title']), handler: W.createTask },
  { name: 'update_task', group: 'work', mutates: true, voiceSensitive: ['due_date', 'assignee_id'], description: 'Update a task (status, priority, due date, assignee, title).', input_schema: S({ id: str('task id'), status: str('status', { enum: ['todo', 'in_progress', 'done'] }), priority: str('priority', { enum: ['low', 'medium', 'high', 'urgent'] }), due_date: str('YYYY-MM-DD'), assignee_id: str('user id'), title: str('title'), description: str('description') }, ['id']), handler: W.updateTask },
  { name: 'create_event', group: 'work', mutates: true, description: 'Create an appointment for the user.', input_schema: S({ title: str('title'), starts_at: str('ISO datetime'), ends_at: str('ISO datetime'), location: str('location') }, ['title', 'starts_at']), handler: W.createEvent },
  { name: 'add_widget', group: 'dashboard', mutates: true, description: 'Add a dashboard widget. type: summary|kpi|projects|tasks|week_progress|events|alerts|documents. filters e.g. {delayed:true} for projects, {mine:true,open:true,overdue:true,group_by:"status"|"priority"} for tasks, {metric:"delayed_projects"|"avg_progress"|"task_completion"|"overdue_tasks"|"active_projects"|"week_done"} for kpi. View: projects cards|table|bar; tasks list|table|bar|donut.', input_schema: S({ type: str('widget type', { enum: Object.keys(B.WIDGET_TYPES) }), title: str('title'), view: str('view'), filters: { type: 'object' }, size: str('s|m|l', { enum: ['s', 'm', 'l'] }), position: int('0-based position') }, ['type']), handler: B.addWidget },
  { name: 'update_widget', group: 'dashboard', mutates: true, description: 'Change how a widget displays (view, filters, sort, size, title). This changes presentation only, never source data.', input_schema: S({ id: str('widget id'), view: str('view'), filters: { type: 'object' }, sort: str('sort key'), size: str('size', { enum: ['s', 'm', 'l'] }), title: str('title') }, ['id']), handler: B.updateWidget },
  { name: 'reorder_widgets', group: 'dashboard', mutates: true, description: 'Reorder dashboard widgets by full or partial id list (listed first).', input_schema: S({ order: { type: 'array', items: { type: 'string' } } }, ['order']), handler: B.reorderWidgets },
  { name: 'remove_widget', group: 'dashboard', mutates: true, description: 'Remove a widget from the dashboard view (reversible; no data is deleted).', input_schema: S({ id: str('widget id') }, ['id']), handler: B.removeWidget },
  { name: 'restore_dashboard', group: 'dashboard', mutates: true, description: 'Restore previous dashboard settings (a version number, the previous one, or reset=true for defaults).', input_schema: S({ version: int('version'), reset: { type: 'boolean' } }), handler: B.restoreDashboard },
  { name: 'create_document', group: 'docs', mutates: true, description: 'Create a document with real content (HTML: h2,h3,p,ul,ol,li,table...). Opens in the editor panel.', input_schema: S({ title: str('title'), kind: str('kind', { enum: ['report', 'letter', 'plan', 'minutes', 'note', 'summary'] }), content_html: str('HTML body') }, ['title', 'content_html']), handler: (u, i) => { const r = D.createDocument(u, i); return { ...r, open_document: r.result.id }; } },
  { name: 'edit_document', group: 'docs', mutates: true, description: 'Edit the SAME document (creates a new version). operation.type: replace_paragraph{index(1-based), html|text} | shorten_intro | formalize | add_table{headers[], rows[][], heading?} | append{html} | replace_all{html}. Keep untouched parts identical.', input_schema: S({ id: str('document id'), operation: { type: 'object' } }, ['id', 'operation']), handler: (u, i) => ({ ...D.editDocument(u, i), open_document: i.id }) },
  { name: 'restore_document_version', group: 'docs', mutates: true, description: 'Restore a previous version of a document (creates a new version; reversible).', input_schema: S({ id: str('document id'), version: int('version number') }, ['id', 'version']), handler: (u, i) => ({ ...D.restoreVersion(u, i), open_document: i.id }) },
  { name: 'export_document', group: 'docs', description: 'Get a download link for a document as docx or pdf.', input_schema: S({ id: str('document id'), format: str('docx|pdf', { enum: ['docx', 'pdf'] }) }, ['id', 'format']), handler: (u, i) => { const d = D.getDocument(u, i.id); return { result: { id: d.id, title: d.title, format: i.format, url: `/api/documents/${d.id}/export.${i.format}` }, open_document: d.id }; } },
  { name: 'run_skill', group: 'docs', mutates: true, description: `Run a reusable skill. Skills: ${SKILL_DEFS.map((s) => `${s.key} (${s.name_en}; inputs ${JSON.stringify(s.inputs.properties)})`).join('; ')}`, input_schema: S({ key: str('skill key', { enum: SKILL_DEFS.map((s) => s.key) }), input: { type: 'object' } }, ['key']), handler: (u, i) => runSkill(u, i.key, i.input || {}) },

  // ---------- strategic portfolio execution ----------
  { name: 'portfolio_overview', group: 'work', description: 'Strategic portfolio within the user scope (SPMO & president: all strategic projects; managers: their department): progress vs time-elapsed expectation, delayed / at-risk counts, budget, allocated FTE, milestones.', input_schema: S({ department_id: str('department id filter'), status: str('delayed|at_risk|on_track|missing|attention', { enum: ['delayed', 'at_risk', 'on_track', 'missing', 'attention'] }) }), handler: (u, i) => ({ result: W.portfolio(u, i) }), format: fmtPortfolio },
  { name: 'my_assignments', group: 'work', description: 'Work other people gave the current user: tasks (with who assigned them, project, due date, status) and time allocations to projects (pending the manager or active).', input_schema: S({}), handler: (u) => ({ result: W.myAssignments(u) }), format: fmtAssignments },
  { name: 'team_capacity', group: 'work', description: 'Capacity of the user\'s team (managers: their staff; SPMO: people on strategic work): current and peak load %, over-allocation (>100%), allocations pending the user\'s decision.', input_schema: S({ department_id: str('department id filter') }), handler: (u, i) => ({ result: W.teamCapacity(u, i) }), format: fmtCapacity },
  { name: 'create_strategic_project', group: 'work', mutates: true, description: 'SPMO only: create a STRATEGIC project in any internal department with an owner from that department, sponsor, budget (AED), initiative reference, timeline, initial allocations (pending each person\'s manager), initial tasks with assignees across departments, and milestones. Never invent values the user did not give.', input_schema: S({
    name: str('project name'), department_id: str('executing department id'), owner_id: str('owner user id (from that department)'), description: str('goal and scope'),
    start_date: date('YYYY-MM-DD'), due_date: date('YYYY-MM-DD'), budget: { type: 'number', minimum: 0, description: 'AED' }, initiative_ref: str('strategy initiative reference'), sponsor_id: str('sponsor user id (default: me)'),
    progress_mode: str('tasks (default, auto from task completion) | manual', { enum: ['manual', 'tasks'] }),
    allocations: { type: 'array', maxItems: 40, items: S({ user_id: str('user id'), percent: int('5-100', { minimum: 5, maximum: 100 }), start_date: date('YYYY-MM-DD'), end_date: date('YYYY-MM-DD'), role_ar: str('role in the project') }, ['user_id', 'percent']) },
    tasks: { type: 'array', maxItems: 60, items: S({ title: str('title'), assignee_id: str('user id'), due_date: date('YYYY-MM-DD'), priority: str('priority', { enum: ['low', 'medium', 'high', 'urgent'] }), description: str('description') }, ['title']) },
    milestones: { type: 'array', maxItems: 30, items: S({ title: str('title'), due_date: date('YYYY-MM-DD'), owner_id: str('user id') }, ['title', 'due_date']) },
  }, ['name', 'department_id', 'owner_id', 'due_date']), handler: W.createStrategicProject, format: fmtStrategic },
  { name: 'allocate_resource', group: 'work', mutates: true, description: 'Propose allocating a % of a staff member\'s time to a strategic project for a period. Pending the person\'s line manager unless the proposer is that manager. Returns the capacity impact (load > 100% = over-allocated).', input_schema: S({ project_id: str('project id'), user_id: str('user id'), percent: int('5-100', { minimum: 5, maximum: 100 }), start_date: date('YYYY-MM-DD (default: today / project start)'), end_date: date('YYYY-MM-DD (default: project due date)'), role_ar: str('role'), note: str('note to the manager') }, ['project_id', 'user_id', 'percent']), handler: W.proposeAllocation, format: fmtAllocation },
  { name: 'decide_allocation', group: 'work', mutates: true, description: 'Line manager decision on a pending allocation of their staff: confirm, adjust (percent/dates) or decline (reason required); or end an active allocation. Never on one\'s own allocation.', input_schema: S({ id: str('allocation id'), decision: str('decision (withdraw = the proposer takes back a pending request)', { enum: ['confirm', 'adjust', 'decline', 'end', 'withdraw'] }), percent: int('adjusted % (5-100)', { minimum: 5, maximum: 100 }), start_date: date('YYYY-MM-DD'), end_date: date('YYYY-MM-DD'), reason: str('reason (required to decline)') }, ['id', 'decision']), handler: W.decideAllocation, format: fmtDecision },
  { name: 'add_milestone', group: 'work', mutates: true, description: 'Add a milestone to a project the user can edit.', input_schema: S({ project_id: str('project id'), title: str('title'), due_date: date('YYYY-MM-DD'), owner_id: str('user id') }, ['project_id', 'title', 'due_date']), handler: W.addMilestone, format: (r) => `أضفت المعلم «${r.title}» بتاريخ ${r.due_date}.` },
  { name: 'update_milestone', group: 'work', mutates: true, description: 'Update a milestone (title, date, owner) or mark it done / not done.', input_schema: S({ id: str('milestone id'), title: str('title'), due_date: date('YYYY-MM-DD'), owner_id: str('user id'), done: { type: 'boolean' } }, ['id']), handler: W.updateMilestone, format: (r) => `حُدّث المعلم «${r.title}»${r.done ? ' — مُنجز' : ''}.` },
  { name: 'delete_milestone', group: 'work', mutates: true, description: 'Remove a milestone from a project (reversible with undo).', input_schema: S({ id: str('milestone id') }, ['id']), handler: W.deleteMilestone, format: (r) => `أُزيل المعلم «${r.title}» (يمكن التراجع).` },

  { name: 'get_my_achievements', group: 'work', description: "The user's excellence points (derived from real work), level, streak, weekly rings, today's quests and badges.", input_schema: S({}), handler: (u) => ({ result: G.profile(u) }) },

  // ---------- Agents Office (proposals only; approval happens in the UI by the owner) ----------
  { name: 'list_office_templates', group: 'office', description: 'Agent templates available in the Agents Office.', input_schema: S({}), handler: () => ({ result: Object.entries(O.TEMPLATES).map(([k, v]) => ({ key: k, name_ar: v.name_ar, name_en: v.name_en, description_ar: v.description_ar, config: v.config })) }) },
  { name: 'list_office_agents', group: 'office', description: "The user's own office agents.", input_schema: S({}), handler: (u) => ({ result: O.listAgents(u) }) },
  { name: 'create_office_agent', group: 'office', mutates: true, description: 'Create an office agent that prepares recurring work for the user to review and approve. template: daily_briefing|delayed_report|overdue_escalation|progress_followup|recurring_task|weekly_plan|custom. schedule: {type: manual|daily|weekdays|weekly, time:"HH:MM", day:0-6 (0=Sunday), tz_offset}. config per template (recurring_task: {title, priority, due_in_days, project_id?, assignee_id?}; custom: {instructions}).', input_schema: S({ name: str('agent name'), template: str('template', { enum: Object.keys(O.TEMPLATES) }), config: { type: 'object' }, schedule: { type: 'object' }, description: str('description') }, ['template']), handler: (u, i) => O.createAgent(u, i) },
  { name: 'schedule_office_agent', group: 'office', mutates: true, description: 'Change when an office agent prepares its work (or pause it with enabled=false).', input_schema: S({ id: str('office agent id'), schedule: { type: 'object' }, enabled: { type: 'boolean' } }, ['id']), handler: (u, i) => { const before = O.getAgent(u, i.id); const r = O.updateAgent(u, i.id, { schedule: i.schedule, enabled: i.enabled }); return { result: r, undo: { tool: 'schedule_office_agent', input: { id: i.id, schedule: before.schedule, enabled: before.enabled } } }; } },
  { name: 'run_office_agent', group: 'office', mutates: true, description: 'Run an office agent now. It only PREPARES a proposal; nothing is executed until the user approves it in the Agents Office.', input_schema: S({ id: str('office agent id') }, ['id']), handler: async (u, i) => ({ result: await O.prepareRun(u, i.id, 'manual') }) },
  { name: 'list_office_runs', group: 'office', description: 'Office agent runs (status awaiting_review = waiting for the user).', input_schema: S({ status: str('status', { enum: ['awaiting_review', 'completed', 'partially_completed', 'failed', 'rejected', 'nothing_to_do', 'skipped'] }) }), handler: (u, i) => ({ result: O.listRuns(u, i) }) },

  // ---------- require explicit confirmation ----------
  { name: 'delete_project', group: 'work', mutates: true, destructive: 'delete', description: 'Permanently delete a project and its tasks. Requires user confirmation.', input_schema: S({ id: str('project id') }, ['id']), handler: W.deleteProject, summarize: (u, i) => `حذف المشروع «${one('SELECT name FROM projects WHERE id=?', i.id)?.name || i.id}» ومهامه نهائياً` },
  { name: 'delete_task', group: 'work', mutates: true, destructive: 'delete', description: 'Permanently delete a task. Requires confirmation.', input_schema: S({ id: str('task id') }, ['id']), handler: W.deleteTask, summarize: (u, i) => `حذف المهمة «${one('SELECT title FROM tasks WHERE id=?', i.id)?.title || i.id}» نهائياً` },
  { name: 'delete_document', group: 'docs', mutates: true, destructive: 'delete', description: 'Permanently delete a document. Requires confirmation.', input_schema: S({ id: str('document id') }, ['id']), handler: D.deleteDocument, summarize: (u, i) => `حذف المستند «${one('SELECT title FROM documents WHERE id=?', i.id)?.title || i.id}» نهائياً` },
  { name: 'share_document', group: 'docs', mutates: true, destructive: 'permissions', description: 'Share a document with another user (changes permissions). Requires confirmation.', input_schema: S({ id: str('document id'), user_id: str('user id'), permission: str('view|edit', { enum: ['view', 'edit'] }) }, ['id', 'user_id']), handler: D.shareDocument, summarize: (u, i) => `مشاركة المستند «${one('SELECT title FROM documents WHERE id=?', i.id)?.title}» مع ${one('SELECT name_ar FROM users WHERE id=?', i.user_id)?.name_ar || i.user_id} (${i.permission === 'edit' ? 'تحرير' : 'اطلاع'})` },

  // ---------- internal (undo only, not exposed to model/MCP) ----------
  { name: '_undo_create_project', internal: true, input_schema: S({ id: str('') }, ['id']), handler: (u, i) => W.undoCreate(u, 'projects', i.id) },
  { name: '_undo_create_task', internal: true, input_schema: S({ id: str('') }, ['id']), handler: (u, i) => W.undoCreate(u, 'tasks', i.id) },
  { name: '_undo_create_event', internal: true, input_schema: S({ id: str('') }, ['id']), handler: (u, i) => W.deleteOwnEvent(u, i.id) },
  { name: '_undo_create_office_agent', internal: true, input_schema: S({ id: str('') }, ['id']), handler: (u, i) => ({ result: O.deleteAgent(u, i.id) }) },
  { name: '_undo_create_document', internal: true, input_schema: S({ id: str('') }, ['id']), handler: D.undoCreateDocument },
  { name: '_undo_allocation', internal: true, input_schema: S({ id: str('') }, ['id']), handler: W.cancelAllocation },
  { name: '_restore_milestone', internal: true, input_schema: S({ id: str('') }, ['id']), handler: W.restoreMilestone },
];


export const toolByName = new Map(TOOLS.map((t) => [t.name, t]));
export const publicTools = () => TOOLS.filter((t) => !t.internal);
// Enterprise systems (server/systems/*) contribute their own tools at startup.
export function registerTools(list) {
  for (const t of list) {
    if (toolByName.has(t.name)) throw new Error(`duplicate tool ${t.name}`);
    TOOLS.push(t); toolByName.set(t.name, t);
  }
}

export { validate } from '../lib/validate.js';
