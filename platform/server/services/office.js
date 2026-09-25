// Agents Office — user-built agents that PREPARE recurring work on a schedule.
// Nothing an office agent proposes is executed until its owner reviews and
// approves it. Runs execute with the owner's identity & scope through the same
// executor (validation, policy, idempotency, undo). Destructive tools
// (delete/share/permissions) can never be proposed by an office agent.
import { one, all, run, uid, now, json, tx, audit } from '../db.js';
import * as W from './work.js';
import * as P from '../policy.js';
import { BadInput } from './work.js';
import { esc } from '../lib/html.js';
import { notify } from '../bus.js';

export const TEMPLATES = {
  daily_briefing: { name_ar: 'ملخص يومي', name_en: 'Daily briefing', icon: 'spark', description_ar: 'يجهّز ملخص يومك (المهام، المواعيد، الأولويات، المتأخرات) كمستند لمراجعتك', config: {} },
  delayed_report: { name_ar: 'تقرير المشاريع المتأخرة', name_en: 'Delayed projects report', icon: 'doc', description_ar: 'يرصد المشاريع المتأخرة ضمن نطاقك ويجهّز تقريراً عنها', config: {} },
  overdue_escalation: { name_ar: 'متابعة المهام المتأخرة', name_en: 'Overdue follow-up', icon: 'alert', description_ar: 'يقترح رفع أولوية المهام المتأخرة إلى «عاجلة»', config: { scope: { type: 'enum', values: ['mine', 'team'], default: 'mine', label_ar: 'النطاق' } } },
  progress_followup: { name_ar: 'متابعة تحديث نسب الإنجاز', name_en: 'Progress update follow-up', icon: 'gauge', description_ar: 'للمشاريع التي لم تُحدَّث نسبتها منذ مدة، يقترح إنشاء مهمة لمسؤول المشروع لتحديثها (دون افتراض أي نسبة)', config: { stale_days: { type: 'int', default: 7, label_ar: 'أيام دون تحديث' } } },
  recurring_task: { name_ar: 'مهمة متكررة', name_en: 'Recurring task', icon: 'check', description_ar: 'ينشئ مهمة تتكرر حسب الجدول (مثل رفع تقرير أسبوعي)', config: { title: { type: 'string', required: true, label_ar: 'عنوان المهمة' }, priority: { type: 'enum', values: ['low', 'medium', 'high', 'urgent'], default: 'medium', label_ar: 'الأولوية' }, due_in_days: { type: 'int', default: 2, label_ar: 'الاستحقاق بعد (أيام)' }, project_id: { type: 'project', label_ar: 'المشروع (اختياري)' }, assignee_id: { type: 'user', label_ar: 'المسؤول (اختياري)' } } },
  weekly_plan: { name_ar: 'خطة الأسبوع', name_en: 'Weekly plan', icon: 'calendar', description_ar: 'يجهّز خطة بمهام ومواعيد الأيام السبعة القادمة', config: {} },
  custom: { name_ar: 'وكيل مخصص (بالتعليمات)', name_en: 'Custom (instructions)', icon: 'settings', description_ar: 'تكتب التعليمات ويخطط الوكيل الإجراءات بالنموذج اللغوي؛ يتطلب خدمة نموذج متصلة', config: { instructions: { type: 'text', required: true, label_ar: 'التعليمات' } } },
};

const DAY = 864e5;
const addDays = (n) => new Date(Date.now() + n * DAY).toISOString().slice(0, 10);

// ---------------- schedule ----------------
// schedule: { type: 'manual'|'daily'|'weekdays'|'weekly', time: 'HH:MM', day: 0-6, tz_offset: minutes (JS getTimezoneOffset) }
export function validateSchedule(s = {}) {
  const type = s.type || 'manual';
  if (!['manual', 'daily', 'weekdays', 'weekly'].includes(type)) throw new BadInput('نوع جدول غير صالح');
  const time = s.time || '07:00';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) throw new BadInput('وقت غير صالح (HH:MM)');
  const day = s.day == null ? 0 : Number(s.day);
  if (!(Number.isInteger(day) && day >= 0 && day <= 6)) throw new BadInput('يوم غير صالح');
  const tz = Number.isFinite(+s.tz_offset) ? Math.max(-840, Math.min(840, +s.tz_offset)) : -240; // default Gulf (UTC+4)
  return { type, time, day, tz_offset: tz };
}
export function nextRunAt(s, from = Date.now()) {
  if (s.type === 'manual') return null;
  const [hh, mm] = s.time.split(':').map(Number);
  // Work in "local" time by shifting with the offset.
  const localNow = new Date(from - s.tz_offset * 60e3);
  for (let i = 0; i <= 8; i++) {
    const d = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() + i, hh, mm));
    const utc = d.getTime() + s.tz_offset * 60e3;
    if (utc <= from) continue;
    const dow = d.getUTCDay();
    if (s.type === 'weekdays' && (dow === 5 || dow === 6)) continue; // Fri/Sat weekend
    if (s.type === 'weekly' && dow !== s.day) continue;
    return new Date(utc).toISOString();
  }
  return null;
}

// ---------------- agents CRUD ----------------
const pubAgent = (a) => a && ({ ...a, config: json(a.config, {}), schedule: json(a.schedule, {}), enabled: !!a.enabled, template_info: TEMPLATES[a.template] });

export function listAgents(user) {
  return all('SELECT * FROM office_agents WHERE owner_id=? AND deleted_at IS NULL ORDER BY created_at DESC', user.id).map((a) => ({
    ...pubAgent(a),
    pending_runs: one("SELECT COUNT(*) n FROM office_runs WHERE agent_id=? AND status='awaiting_review'", a.id).n,
  }));
}
function ownAgent(user, id) {
  const a = one('SELECT * FROM office_agents WHERE id=? AND owner_id=? AND deleted_at IS NULL', id, user.id);
  if (!a) throw new P.NotFound('الوكيل غير موجود');
  return a;
}
export const getAgent = (user, id) => pubAgent(ownAgent(user, id));

function validateConfig(user, template, cfg = {}) {
  const t = TEMPLATES[template];
  if (!t) throw new BadInput('قالب وكيل غير معروف');
  const out = {};
  for (const [k, spec] of Object.entries(t.config)) {
    let v = cfg[k];
    if (v === undefined || v === '' || v === null) { if (spec.required) throw new BadInput(`الحقل «${spec.label_ar}» مطلوب`); if (spec.default !== undefined) out[k] = spec.default; continue; }
    if (spec.type === 'int') { v = Number(v); if (!Number.isInteger(v) || v < 0 || v > 365) throw new BadInput(`قيمة غير صالحة: ${spec.label_ar}`); }
    if (spec.type === 'enum' && !spec.values.includes(v)) throw new BadInput(`قيمة غير صالحة: ${spec.label_ar}`);
    if (spec.type === 'string' || spec.type === 'text') { v = String(v).trim().slice(0, spec.type === 'text' ? 4000 : 200); if (spec.required && !v) throw new BadInput(`الحقل «${spec.label_ar}» مطلوب`); }
    if (spec.type === 'project' && !P.canViewProject(user, v)) throw new P.Forbidden('المشروع خارج نطاقك');
    if (spec.type === 'user' && !P.canAssignTo(user, v)) throw new P.Forbidden('لا يمكنك إسناد مهام لهذا المستخدم');
    out[k] = v;
  }
  if (template === 'overdue_escalation' && out.scope === 'team' && user.role === 'employee') throw new BadInput('نطاق الفريق متاح للمديرين فقط');
  return out;
}

export function createAgent(user, input) {
  const name = String(input.name || '').trim() || TEMPLATES[input.template]?.name_ar;
  if (!name) throw new BadInput('اسم الوكيل مطلوب');
  const config = validateConfig(user, input.template, input.config);
  const schedule = validateSchedule(input.schedule);
  const id = uid('oa_');
  run(`INSERT INTO office_agents (id,owner_id,name,description,template,config,schedule,enabled,next_run_at) VALUES (?,?,?,?,?,?,?,1,?)`,
    id, user.id, name.slice(0, 120), String(input.description || TEMPLATES[input.template].description_ar).slice(0, 500), input.template, JSON.stringify(config), JSON.stringify(schedule), nextRunAt(schedule));
  audit(user.id, 'office.agent.create', id, { template: input.template });
  notify([user.id], { type: 'changed', entity: 'office', id });
  return { result: getAgent(user, id), undo: { tool: '_undo_create_office_agent', input: { id } } };
}

export function updateAgent(user, id, input) {
  const a = ownAgent(user, id);
  const config = input.config !== undefined ? validateConfig(user, a.template, input.config) : json(a.config, {});
  const schedule = input.schedule !== undefined ? validateSchedule(input.schedule) : json(a.schedule, {});
  const enabled = input.enabled === undefined ? a.enabled : input.enabled ? 1 : 0;
  run('UPDATE office_agents SET name=?, description=?, config=?, schedule=?, enabled=?, next_run_at=?, updated_at=? WHERE id=?',
    String(input.name ?? a.name).slice(0, 120), String(input.description ?? a.description).slice(0, 500), JSON.stringify(config), JSON.stringify(schedule), enabled, enabled ? nextRunAt(schedule) : null, now(), id);
  notify([user.id], { type: 'changed', entity: 'office', id });
  return getAgent(user, id);
}

export function deleteAgent(user, id) {
  ownAgent(user, id);
  tx(() => {
    run('UPDATE office_agents SET deleted_at=?, enabled=0, next_run_at=NULL WHERE id=?', now(), id);
    run("UPDATE office_runs SET status='cancelled' WHERE agent_id=? AND status='awaiting_review'", id);
  });
  notify([user.id], { type: 'changed', entity: 'office', id });
  return { id, deleted: true };
}

// ---------------- prepare (read-only; produces a proposal) ----------------
const MUTATING_ALLOWED = new Set(['create_task', 'update_task', 'update_project', 'create_project', 'create_event', 'create_document', 'edit_document', 'run_skill', 'add_widget', 'update_widget']);

function item(tool, input, summary, preview) { return { id: uid('it_'), tool, input, summary, preview: preview || null, selected: true, status: 'proposed' }; }

async function prepareTemplate(user, agent) {
  const cfg = json(agent.config, {});
  const today = new Date().toISOString().slice(0, 10);
  switch (agent.template) {
    case 'daily_briefing': {
      const s = W.dailySummary(user);
      const li = (arr, f) => (arr.length ? `<ul>${arr.map((x) => `<li>${f(x)}</li>`).join('')}</ul>` : '<p>لا يوجد.</p>');
      const html = `<h2>الأرقام الرئيسية</h2><table><tbody>
<tr><th>المهام المفتوحة</th><td>${s.counts.open_tasks}</td></tr><tr><th>مستحقة اليوم</th><td>${s.counts.due_today}</td></tr>
<tr><th>متأخرة</th><td>${s.counts.overdue}</td></tr><tr><th>مواعيد اليوم</th><td>${s.counts.events_today}</td></tr>
<tr><th>مشاريع متأخرة</th><td>${s.counts.delayed_projects}</td></tr></tbody></table>
<h2>مواعيد اليوم</h2>${li(s.events_today, (e) => `${esc(e.title)} — ${e.starts_at.slice(11, 16)} UTC`)}
<h2>الأولويات</h2>${li(s.priorities, (t) => `${esc(t.title)}${t.due_date ? ` (${t.due_date})` : ''}`)}
<h2>يحتاج إجراءً</h2>${li(s.needs_action, (a) => `${esc(a.title)} — ${{ overdue: 'مهمة متأخرة', delayed: 'مشروع متأخر', missing_progress: 'لا توجد نسبة إنجاز مسجلة' }[a.reason]}`)}
<p><em>المصدر: بيانات المنصة ضمن صلاحياتك، ${s.generated_at.slice(0, 16).replace('T', ' ')} UTC.</em></p>`;
      return { items: [item('create_document', { title: `ملخص اليوم — ${today}`, kind: 'summary', content_html: html }, `إنشاء مستند «ملخص اليوم — ${today}»`, html)], summary: `${s.counts.open_tasks} مهمة مفتوحة، ${s.counts.overdue} متأخرة، ${s.counts.events_today} موعد اليوم` };
    }
    case 'delayed_report': {
      const d = W.listProjects(user, { delayed: true });
      if (!d.length) return { items: [], summary: 'لا توجد مشاريع متأخرة ضمن نطاقك — لا شيء لمراجعته.' };
      const prev = `<ul>${d.map((p) => `<li>${esc(p.name)} — متأخر ${p.days_overdue} يوماً، الإنجاز ${p.progress == null ? 'غير محدد' : p.progress + '%'}</li>`).join('')}</ul>`;
      return { items: [item('run_skill', { key: 'delayed_projects_report', input: {} }, `إعداد تقرير عن ${d.length} مشروع متأخر`, prev)], summary: `${d.length} مشروع متأخر` };
    }
    case 'overdue_escalation': {
      const tasks = W.listTasks(user, { overdue: true, mine: cfg.scope !== 'team' }).filter((t) => t.priority !== 'urgent' && P.canEditTask(user, t));
      if (!tasks.length) return { items: [], summary: 'لا توجد مهام متأخرة تحتاج تصعيداً.' };
      return { items: tasks.slice(0, 30).map((t) => item('update_task', { id: t.id, priority: 'urgent' }, `رفع أولوية «${t.title}» إلى عاجلة (متأخرة منذ ${t.due_date}، المسؤول ${t.assignee_ar})`)), summary: `${tasks.length} مهمة متأخرة` };
    }
    case 'progress_followup': {
      const cutoff = new Date(Date.now() - (cfg.stale_days ?? 7) * DAY).toISOString();
      const ps = W.listProjects(user, { status: 'active' }).filter((p) => !p.progress_updated_at || p.progress_updated_at < cutoff);
      const items = [];
      for (const p of ps) {
        const full = one('SELECT * FROM projects WHERE id=?', p.id);
        if (!P.canEditProject(user, full)) continue;
        const assignee = P.canAssignTo(user, p.owner_id) ? p.owner_id : user.id;
        const open = one("SELECT 1 FROM tasks WHERE project_id=? AND title LIKE 'تحديث نسبة إنجاز%' AND status!='done' AND deleted_at IS NULL", p.id);
        if (open) continue; // don't duplicate an existing follow-up
        items.push(item('create_task', { title: `تحديث نسبة إنجاز «${p.name}»`, project_id: p.id, assignee_id: assignee, priority: 'high', due_date: addDays(2), description: `آخر تحديث: ${p.progress_updated_at ? p.progress_updated_at.slice(0, 10) : 'لم تُسجَّل نسبة بعد'}` }, `مهمة لـ${one('SELECT name_ar FROM users WHERE id=?', assignee).name_ar} لتحديث نسبة «${p.name}» (${p.progress == null ? 'غير محددة' : p.progress + '%'})`));
      }
      return { items, summary: items.length ? `${items.length} مشروع يحتاج تحديث نسبة` : 'جميع المشاريع محدّثة أو لديها مهمة متابعة مفتوحة.' };
    }
    case 'recurring_task': {
      const input = { title: cfg.title, priority: cfg.priority || 'medium', due_date: addDays(cfg.due_in_days ?? 2) };
      if (cfg.project_id) input.project_id = cfg.project_id;
      if (cfg.assignee_id) input.assignee_id = cfg.assignee_id;
      return { items: [item('create_task', input, `إنشاء المهمة «${cfg.title}» باستحقاق ${input.due_date}`)], summary: 'مهمة متكررة' };
    }
    case 'weekly_plan': {
      const end = addDays(7);
      const tasks = W.listTasks(user, { mine: user.role === 'employee' }).filter((t) => t.status !== 'done' && t.due_date && t.due_date <= end);
      const events = W.listEvents(user, { to: new Date(Date.now() + 7 * DAY).toISOString() });
      const html = `<h2>المهام المستحقة حتى ${end}</h2>${tasks.length ? `<table><thead><tr><th>المهمة</th><th>المسؤول</th><th>الاستحقاق</th><th>الأولوية</th></tr></thead><tbody>${tasks.map((t) => `<tr><td>${esc(t.title)}</td><td>${esc(t.assignee_ar || '')}</td><td>${t.due_date}</td><td>${t.priority}</td></tr>`).join('')}</tbody></table>` : '<p>لا توجد مهام مستحقة.</p>'}
<h2>المواعيد</h2>${events.length ? `<ul>${events.map((e) => `<li>${esc(e.title)} — ${e.starts_at.slice(0, 16).replace('T', ' ')} UTC</li>`).join('')}</ul>` : '<p>لا توجد مواعيد.</p>'}
<h2>ملاحظات</h2><p>[يُستكمل: أولويات الأسبوع]</p>`;
      return { items: [item('create_document', { title: `خطة الأسبوع — ${today}`, kind: 'plan', content_html: html }, `إنشاء «خطة الأسبوع — ${today}» (${tasks.length} مهمة، ${events.length} موعد)`, html)], summary: `${tasks.length} مهمة و${events.length} موعد خلال 7 أيام` };
    }
    case 'custom': return prepareCustom(user, agent, cfg);
    default: throw new BadInput('قالب غير معروف');
  }
}

// Custom agents plan with the connected model in DRY-RUN mode: read tools run
// for real (within scope); every mutating call is captured as a proposal.
async function prepareCustom(user, agent, cfg) {
  const { resolve, complete } = await import('../ai/services.js');
  const { publicTools, toolByName } = await import('../mcp/tools.js');
  const { executeTool, allowedToolNames } = await import('../ai/executor.js');
  if (resolve('chat').provider.kind === 'local') throw Object.assign(new Error('الوكيل المخصص يتطلب خدمة نموذج لغوي متصلة (AI Services). اختر قالباً جاهزاً أو اضبط مزوّد النموذج.'), { status: 503 });
  const allowed = allowedToolNames(user);
  const tools = publicTools().filter((t) => allowed.has(t.name) && !t.destructive && (!t.mutates || MUTATING_ALLOWED.has(t.name))).map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const msgs = [{ role: 'user', content: `التاريخ ${new Date().toISOString().slice(0, 10)}. نفّذ تعليمات الوكيل التالية بتحضير الإجراءات فقط (ستُعرض على المستخدم للموافقة):\n${cfg.instructions}` }];
  const items = [];
  let text = '';
  for (let i = 0; i < 6; i++) {
    const out = await complete({ capability: 'chat', user, system: `أنت وكيل مكتب بعنوان «${agent.name}» تعمل لصالح ${user.name_ar}. أدوات القراءة تُنفّذ فعلياً، أما أدوات التعديل فتُسجَّل كمقترحات بانتظار موافقة المستخدم ولا تُنفّذ الآن. لا تفترض قيماً غير موجودة في البيانات.`, messages: msgs, tools, maxTokens: 2000 });
    text = out.text || text;
    if (!out.tool_calls.length) break;
    msgs.push({ role: 'assistant', content: out.raw_content });
    const results = [];
    for (const c of out.tool_calls) {
      const t = toolByName.get(c.name);
      let payload;
      if (t?.mutates) { items.push(item(c.name, c.input || {}, `${c.name}: ${JSON.stringify(c.input).slice(0, 160)}`)); payload = { status: 'proposed', message: 'سُجّل كمقترح بانتظار موافقة المستخدم' }; }
      else { const r = await executeTool(user, c.name, c.input || {}, { source: 'office' }); payload = r.status === 'ok' ? { status: 'ok', result: r.result } : { status: 'error', error: r.error }; }
      results.push({ type: 'tool_result', tool_use_id: c.id, content: JSON.stringify(payload).slice(0, 8000) });
    }
    msgs.push({ role: 'user', content: results });
  }
  return { items, summary: text.slice(0, 600) || `${items.length} إجراء مقترح` };
}

export async function prepareRun(user, agentId, trigger = 'manual') {
  const a = ownAgent(user, agentId);
  const id = uid('or_');
  run("INSERT INTO office_runs (id,agent_id,owner_id,trigger,status,proposal) VALUES (?,?,?,?,'preparing','[]')", id, a.id, user.id, trigger);
  try {
    const { items, summary } = await prepareTemplate(user, a);
    for (const it of items) if (!MUTATING_ALLOWED.has(it.tool)) throw new Error(`أداة غير مسموحة لوكلاء المكتب: ${it.tool}`);
    const status = items.length ? 'awaiting_review' : 'nothing_to_do';
    run('UPDATE office_runs SET status=?, proposal=?, summary=? WHERE id=?', status, JSON.stringify(items), summary, id);
    run('UPDATE office_agents SET last_run_at=? WHERE id=?', now(), a.id);
    if (status === 'awaiting_review') {
      run('INSERT INTO alerts (id,user_id,level,title,body,entity,entity_id) VALUES (?,?,?,?,?,?,?)', uid('al_'), user.id, 'info', `الوكيل «${a.name}» جهّز ${items.length} إجراء بانتظار مراجعتك`, summary, 'office_run', id);
    }
  } catch (e) {
    run("UPDATE office_runs SET status='failed', error=? WHERE id=?", String(e.message).slice(0, 500), id);
  }
  notify([user.id], { type: 'changed', entity: 'office', id });
  return getRun(user, id);
}

// ---------------- review & execute ----------------
const pubRun = (r) => r && ({ ...r, proposal: json(r.proposal, []), agent_name: one('SELECT name FROM office_agents WHERE id=?', r.agent_id)?.name, template: one('SELECT template FROM office_agents WHERE id=?', r.agent_id)?.template });
export function getRun(user, id) {
  const r = one('SELECT * FROM office_runs WHERE id=? AND owner_id=?', id, user.id);
  if (!r) throw new P.NotFound('التشغيل غير موجود');
  return pubRun(r);
}
export function listRuns(user, { status, agent_id, limit = 30 } = {}) {
  let sql = 'SELECT * FROM office_runs WHERE owner_id=?'; const p = [user.id];
  if (status) { sql += ' AND status=?'; p.push(status); }
  if (agent_id) { sql += ' AND agent_id=?'; p.push(agent_id); }
  sql += ' ORDER BY created_at DESC LIMIT ?'; p.push(limit);
  return all(sql, ...p).map(pubRun);
}
export const pendingReviewCount = (user) => one("SELECT COUNT(*) n FROM office_runs WHERE owner_id=? AND status='awaiting_review'", user.id).n;

const EDITABLE = { create_task: ['title', 'priority', 'due_date', 'description'], update_task: ['priority', 'status', 'due_date'], create_document: ['title'], create_event: ['title', 'starts_at'], update_project: ['status', 'due_date'] };

// decisions: [{ id, selected, edits: {field: value} }]
export async function approveRun(user, runId, decisions = []) {
  const { executeTool } = await import('../ai/executor.js');
  const r = one('SELECT * FROM office_runs WHERE id=? AND owner_id=?', runId, user.id);
  if (!r) throw new P.NotFound('التشغيل غير موجود');
  // Atomic claim: approving twice (double click / retry) can never execute twice.
  const claimed = run("UPDATE office_runs SET status='executing', reviewed_at=? WHERE id=? AND status='awaiting_review'", now(), runId);
  if (!claimed.changes) throw Object.assign(new Error('تمت مراجعة هذا التشغيل مسبقاً'), { status: 409 });
  const items = json(r.proposal, []);
  const byId = new Map(decisions.map((d) => [d.id, d]));
  for (const it of items) {
    const d = byId.get(it.id);
    if (d) {
      it.selected = d.selected !== false;
      for (const [k, v] of Object.entries(d.edits || {})) if ((EDITABLE[it.tool] || []).includes(k)) { it.input[k] = v; it.edited = true; }
    }
    if (!it.selected) { it.status = 'skipped'; continue; }
    if (!MUTATING_ALLOWED.has(it.tool)) { it.status = 'failed'; it.error = 'أداة غير مسموحة'; continue; }
    const res = await executeTool(user, it.tool, it.input, { source: 'office', requestId: `office:${runId}:${it.id}` });
    if (res.status === 'ok') { it.status = 'done'; it.actionId = res.actionId; it.undoable = res.undoable; it.open_document = res.open_document || res.result?.document?.id || (it.tool === 'create_document' ? res.result?.id : undefined); }
    else if (res.status === 'needs_confirmation') { it.status = 'failed'; it.error = 'يتطلب تأكيداً منفصلاً'; }
    else { it.status = 'failed'; it.error = res.error; }
  }
  const done = items.filter((i) => i.status === 'done').length; const failed = items.filter((i) => i.status === 'failed').length;
  const status = failed && done ? 'partially_completed' : failed ? 'failed' : done ? 'completed' : 'skipped';
  run('UPDATE office_runs SET status=?, proposal=?, completed_at=? WHERE id=?', status, JSON.stringify(items), now(), runId);
  audit(user.id, 'office.run.approve', runId, { done, failed });
  notify([user.id], { type: 'changed', entity: 'office', id: runId });
  return getRun(user, runId);
}
export function rejectRun(user, runId) {
  const claimed = run("UPDATE office_runs SET status='rejected', reviewed_at=? WHERE id=? AND owner_id=? AND status='awaiting_review'", now(), runId, user.id);
  if (!claimed.changes) throw Object.assign(new Error('تمت مراجعة هذا التشغيل مسبقاً'), { status: 409 });
  notify([user.id], { type: 'changed', entity: 'office', id: runId });
  return getRun(user, runId);
}

// ---------------- scheduler ----------------
export function startScheduler(getUser, intervalMs = 30000) {
  const tick = async () => {
    const due = all('SELECT id, owner_id, schedule FROM office_agents WHERE enabled=1 AND deleted_at IS NULL AND next_run_at IS NOT NULL AND next_run_at <= ?', now());
    for (const a of due) {
      // advance first so a slow run never double-fires
      run('UPDATE office_agents SET next_run_at=? WHERE id=?', nextRunAt(json(a.schedule, {}), Date.now() + 1000), a.id);
      const user = getUser(a.owner_id);
      if (!user) continue;
      // Skip if the previous proposal is still waiting for review (avoid piling up).
      if (one("SELECT 1 FROM office_runs WHERE agent_id=? AND status='awaiting_review'", a.id)) continue;
      await prepareRun(user, a.id, 'schedule').catch((e) => console.error('[office]', e.message));
    }
  };
  const t = setInterval(() => tick().catch(() => {}), intervalMs); t.unref();
  return { tick };
}
