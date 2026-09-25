// Dashboard widget renderers. Values always come from /api/dashboard/widgets/:id/data
// (computed server-side from source data within the user's scope). Fetching is
// split from rendering so the home view can repaint a card from its cached
// payload (stale-while-revalidate) without a round-trip or a skeleton flash.
import { api } from './api.js';
import { h, icon, toast, emptyState, dataTable, skeleton } from './ui.js';
import { L, t, fmtDate, fmtTime, fmtNum, getLang } from './i18n.js';
import { barChart, donutChart } from './charts.js';
import { state, emit } from './state.js';
import * as Editor from './editor.js';
import { statusLabel, priorityChip, runTool, undo, progressBar, taskRow, projectCard, STATUS, PRIORITY } from './work-items.js';
export { statusLabel, priorityChip, runTool, undo, progressBar, taskRow, projectCard };

// ---------------- metadata ----------------
export const TYPE_META = {
  summary: { icon: 'sparkle', name: ['ملخص اليوم', 'Daily summary'] },
  kpi: { icon: 'gauge', name: ['مؤشر', 'KPI'] },
  projects: { icon: 'folder', name: ['المشاريع', 'Projects'] },
  tasks: { icon: 'listTodo', name: ['المهام', 'Tasks'] },
  week_progress: { icon: 'chartBar', name: ['إنجاز هذا الأسبوع', 'This week'] },
  events: { icon: 'calendarDays', name: ['المواعيد', 'Appointments'] },
  alerts: { icon: 'bell', name: ['التنبيهات', 'Alerts'] },
  documents: { icon: 'fileText', name: ['آخر المستندات', 'Recent documents'] },
};
export const VIEW_META = {
  cards: { icon: 'rows', name: ['بطاقات', 'Cards'] }, list: { icon: 'list', name: ['قائمة', 'List'] }, table: { icon: 'table', name: ['جدول', 'Table'] },
  bar: { icon: 'chartBar', name: ['أعمدة', 'Bars'] }, donut: { icon: 'pie', name: ['دائري', 'Donut'] }, stat: { icon: 'gauge', name: ['رقم', 'Number'] },
};
export const KPI_META = {
  active_projects: { name: ['المشاريع النشطة', 'Active projects'], icon: 'folderOpen', href: '#/projects' },
  delayed_projects: { name: ['المشاريع المتأخرة', 'Delayed projects'], icon: 'flag', href: '#/projects' },
  avg_progress: { name: ['متوسط الإنجاز', 'Average progress'], icon: 'gauge', href: '#/adaa' },
  task_completion: { name: ['نسبة إنجاز المهام', 'Task completion'], icon: 'percent', href: '#/tasks' },
  overdue_tasks: { name: ['المهام المتأخرة', 'Overdue tasks'], icon: 'clock', href: '#/tasks' },
  week_done: { name: ['منجز هذا الأسبوع', 'Done this week'], icon: 'checkCheck', href: '#/tasks' },
};

// Titles store only the subject; a legacy "(رسم)"/"(دائري)" suffix is hidden so
// the title never contradicts the active view.
const VIEW_SUFFIX = /\s*[(（]\s*(?:رسم(?: بياني)?|دائري|أعمدة|جدول|قائمة|بطاقات|chart|donut|bars?|table|list|cards)\s*[)）]\s*$/i;
export function widgetTitle(w) {
  if (w.title) return String(w.title).replace(VIEW_SUFFIX, '') || String(w.title);
  const f = w.filters || {};
  if (w.type === 'kpi' && KPI_META[f.metric]) return L(...KPI_META[f.metric].name);
  if (w.type === 'projects' && f.delayed) return L('المشاريع المتأخرة', 'Delayed projects');
  if (w.type === 'tasks' && f.mine) return L('مهامي', 'My tasks');
  if (w.type === 'tasks' && f.overdue) return L('المهام المتأخرة', 'Overdue tasks');
  return L(...(TYPE_META[w.type]?.name || [w.type, w.type]));
}
export function widgetIcon(w) {
  if (w.type === 'kpi') return KPI_META[w.filters?.metric]?.icon || 'gauge';
  if (w.type === 'projects' && w.filters?.delayed) return 'flag';
  return TYPE_META[w.type]?.icon || 'grid';
}

// Human-readable, localized data source (replaces raw "projects.due_date" identifiers).
const SRC_TABLE = { projects: ['المشاريع', 'Projects'], tasks: ['المهام', 'Tasks'], events: ['المواعيد', 'Appointments'], alerts: ['التنبيهات', 'Alerts'], documents: ['المستندات', 'Documents'], derived: ['تنبيهات محسوبة تلقائياً', 'computed alerts'] };
const SRC_FIELD = { due_date: ['تاريخ الاستحقاق', 'due date'], status: ['الحالة', 'status'], progress: ['نسبة الإنجاز', 'progress'], completed_at: ['تاريخ الإنجاز', 'completion date'] };
export function sourceLabel(src) {
  if (!src) return '—';
  const groups = new Map();
  for (const part of String(src).split(/[,+]/).map((x) => x.trim()).filter(Boolean)) {
    const [tbl, field] = part.split('.');
    const k = SRC_TABLE[tbl] ? L(...SRC_TABLE[tbl]) : tbl;
    if (!groups.has(k)) groups.set(k, []);
    if (field) groups.get(k).push(SRC_FIELD[field] ? L(...SRC_FIELD[field]) : field);
  }
  return [...groups].map(([k, f]) => (f.length ? `${k} · ${f.join(L('، ', ', '))}` : k)).join(L('، ', ', '));
}

// ---------------- fetch / render ----------------
export const fetchWidgetData = (w) => api(`/api/dashboard/widgets/${w.id}/data`);

// Back-compatible: fetch + render in one call.
export async function renderWidgetBody(w, ctx) {
  const res = await fetchWidgetData(w);
  return { ...renderWidgetView(w, res, ctx), source: res.source, updated_at: res.updated_at };
}

// Pure render from a payload → { body, foot?, count?, demo?, empty? }.
// ctx: { expanded: Set, rerender(), onLocalChange() }
export function renderWidgetView(w, res, ctx = {}) {
  const c = { expanded: ctx.expanded || new Set(), rerender: ctx.rerender || (() => {}), local: ctx.onLocalChange || (() => {}), key: w.id };
  switch (w.type) {
    case 'summary': return renderSummary(res.data, c);
    case 'kpi': return renderKpi(w, res.data);
    case 'projects': return renderProjects(w, res, c);
    case 'tasks': return renderTasks(w, res, c);
    case 'week_progress': return renderWeek(w, res);
    case 'events': return renderEvents(res.data || [], c);
    case 'alerts': return renderAlerts(res.data || [], c);
    case 'documents': return renderDocuments(res.data || []);
    default: return { body: emptyState({ compact: true, title: L('نوع بطاقة غير مدعوم', 'Unsupported card') }), empty: true };
  }
}

// Skeleton sized like the final layout (so nothing jumps when data arrives).
export function widgetSkeleton(w) {
  const busy = { 'aria-busy': 'true', 'aria-label': L('جارٍ التحميل', 'Loading') };
  if (w.type === 'kpi') return h('div.dash-skel', busy, h('div.sk.sk-num'), h('div.sk.sk-line.w-60'));
  if (w.type === 'summary') return h('div.dash-skel.sum-skel', busy, h('div.skel-cells', Array.from({ length: 6 }, () => h('div.sk.skel-cell'))), h('div', h('div.sk.sk-line.w-40'), h('div.sk.sk-row'), h('div.sk.sk-row')));
  if (w.type === 'week_progress') return h('div.dash-skel', busy, h('div.sk.sk-num'), h('div.sk.sk-block.skel-chart'));
  if (w.view === 'bar' || w.view === 'donut') return h('div.dash-skel', busy, h('div.sk.sk-block.skel-chart'));
  return skeleton('list', 3);
}

// Designed inline error: localized message, retry for this card only, details on demand.
export function widgetError(err, retry) {
  const el = emptyState({ icon: 'circleAlert', error: true, compact: true, title: L('تعذّر تحميل البطاقة', 'Couldn’t load this card'), body: L('تحقّق من الاتصال ثم أعد المحاولة.', 'Check your connection, then try again.'), actions: retry ? [{ label: L('إعادة المحاولة', 'Try again'), icon: 'refresh', onClick: retry }] : [] });
  if (err?.message) el.append(h('details.err-details', h('summary', L('التفاصيل التقنية', 'Technical details')), h('code', err.message)));
  return el;
}

// ---------------- shared bits ----------------
const TONE_CHIP = { crit: '.crit', warn: '.warn', good: '.good', accent: '.info' };
const chip = (tone, ...kids) => h(`span.chip.tiny${TONE_CHIP[tone] || ''}`, ...kids);
const glyph = (name, tone) => h('span.row-glyph', { 'data-tone': tone || null, 'aria-hidden': 'true' }, icon(name));
const chev = () => icon('chevron', 'row-chev flip-rtl');
const undoOpts = (r) => (r?.undoable && r.actionId ? { action: t('undo'), onAction: () => undo(r.actionId) } : {});
const viewAll = (href, n) => h('a.btn.sm.ghost.dash-more-link', { href }, n != null ? L(`عرض الكل (${fmtNum(n)})`, `View all (${fmtNum(n)})`) : L('عرض الكل', 'View all'), icon('chevron', 'sm flip-rtl'));
function expander(c, key, total, limit) {
  const open = c.expanded.has(`${c.key}:${key}`);
  if (total <= limit) return { open, limit: total, toggle: null };
  const toggle = h('button.btn.sm.ghost.dash-more-link', { type: 'button', 'aria-expanded': String(open), onclick: () => { const k = `${c.key}:${key}`; open ? c.expanded.delete(k) : c.expanded.add(k); c.rerender(); } },
    open ? L('عرض أقل', 'Show less') : L(`عرض الكل (${fmtNum(total)})`, `Show all (${fmtNum(total)})`), icon(open ? 'chevronUp' : 'chevronDown', 'sm'));
  return { open, limit: open ? total : limit, toggle };
}
const daysAr = (n) => (n === 1 ? 'يوماً' : n === 2 ? 'يومين' : n <= 10 ? `${fmtNum(n)} أيام` : `${fmtNum(n)} يوماً`);
const lateText = (n) => (n > 0 ? L(`متأخر ${daysAr(n)}`, `${n} ${n === 1 ? 'day' : 'days'} late`) : L('متأخر', 'Delayed'));
const pct = (v) => `${fmtNum(v)}%`;
const parseTs = (s) => new Date(!s ? 0 : s.length === 10 ? `${s}T12:00:00Z` : s.endsWith('Z') || s.includes('+') ? s : `${s.replace(' ', 'T')}Z`);
const locale = () => (getLang() === 'ar' ? 'ar-AE' : 'en-GB');

// ---------------- Daily summary ----------------
const METRICS = [
  { k: 'open_tasks', label: ['مهام مفتوحة', 'Open tasks'], href: '#/tasks' },
  { k: 'due_today', label: ['مستحقة اليوم', 'Due today'], tone: 'warn', href: '#/tasks' },
  { k: 'overdue', label: ['متأخرة', 'Overdue'], tone: 'crit', href: '#/tasks' },
  { k: 'events_today', label: ['مواعيد اليوم', 'Meetings today'], tone: 'accent' },
  { k: 'delayed_projects', label: ['مشاريع متأخرة', 'Delayed projects'], tone: 'crit', href: '#/projects' },
  { k: 'pending_reviews', label: ['بانتظار موافقتك', 'Awaiting approval'], tone: 'warn', href: '#/office' },
];
const REASON = {
  overdue: { icon: 'clock', tone: 'crit', label: ['مهمة متأخرة', 'Overdue task'] },
  delayed: { icon: 'calendarClock', tone: 'crit', label: ['مشروع متأخر', 'Delayed project'] },
  missing_progress: { icon: 'gauge', tone: null, label: ['بلا نسبة إنجاز', 'No progress reported'] },
  review: { icon: 'userCheck', tone: 'warn', label: ['بانتظار موافقتك', 'Needs your approval'] },
};
function renderSummary(d, c) {
  const counts = d?.counts || {};
  const cell = (m) => {
    const v = counts[m.k] || 0;
    const kids = [h('span.sum-v', fmtNum(v)), h('span.sum-k', m.tone && v ? h('span.dot', { 'aria-hidden': 'true' }) : null, L(...m.label))];
    const attrs = { 'data-tone': m.tone || null, class: v ? '' : 'is-zero' };
    return m.href ? h('a.sum-cell', { ...attrs, href: m.href }, kids) : h('div.sum-cell', attrs, kids);
  };
  const na = d?.needs_action || [];
  const ex = expander(c, 'needs', na.length, 5);
  const list = na.length
    ? h('ul.dash-list', na.slice(0, ex.limit).map((a) => {
      const r = REASON[a.reason] || REASON.missing_progress;
      const href = a.type === 'project' ? `#/projects/${a.id}` : a.type === 'office_run' ? '#/office' : '#/tasks';
      return h('li', h('a.dash-row', { href, 'data-key': `na:${a.type}:${a.id}:${a.reason}`, onclick: () => { if (a.type === 'project') state.selectedProjectId = a.id; if (a.type === 'task') state.selectedTaskId = a.id; } },
        glyph(r.icon, r.tone), h('span.row-main', h('span.row-line', h('span.row-title', a.title), chip(r.tone, L(...r.label)))), chev()));
    }))
    : h('p.na-clear', icon('circleCheck'), L('لا شيء يحتاج إجراءً منك الآن.', 'Nothing needs your action right now.'));
  const body = h('div.sum',
    h('div.stats-row', METRICS.map(cell)),
    h('section.na', h('h3.dash-subhead', L('يحتاج إجراءً', 'Needs action'), na.length ? h('span.dash-count', fmtNum(na.length)) : null), list, ex.toggle ? h('div.na-more', ex.toggle) : null));
  return { body };
}

// ---------------- KPI ----------------
function renderKpi(w, d) {
  if (!d) return { body: emptyState({ compact: true, icon: 'gauge', title: L('المؤشر غير متاح', 'Indicator unavailable'), body: L('لا توجد بيانات لهذا المؤشر ضمن نطاقك.', 'No data for this indicator in your scope.') }), empty: true };
  const meta = KPI_META[w.filters?.metric] || {};
  const tone = d.status === 'critical' ? 'crit' : d.status === 'warning' ? 'warn' : d.status === 'good' ? 'good' : null;
  const risk = (tone === 'crit' || tone === 'warn') && d.value ? tone : null;
  const title = widgetTitle(w);
  const labelText = L(d.label_ar, d.label_en);
  const note = d.note_ar ? L(d.note_ar, d.note_en) : labelText && labelText !== title ? labelText : null;
  const valueStr = d.value == null ? '—' : `${fmtNum(d.value)}${d.unit || ''}`;
  const kids = [
    h('div.kpi-value', { 'data-tone': risk }, h('span.kpi-num', d.value == null ? '—' : fmtNum(d.value)), d.unit && d.value != null ? h('span.kpi-unit', d.unit) : null),
    d.unit === '%' && d.value != null ? h(`div.progress.kpi-meter${risk ? `.${risk}` : ''}`, { 'aria-hidden': 'true' }, h('i', { style: { width: `${Math.max(0, Math.min(100, d.value))}%` } })) : null,
    note ? h('div.kpi-note', note) : null,
    tone ? h('div.kpi-foot', chip(tone, icon(tone === 'good' ? 'circleCheck' : 'alert'), tone === 'good' ? L('سليم', 'On track') : L('يحتاج متابعة', 'Needs attention'))) : null,
  ];
  const body = meta.href
    ? h('a.kpi', { href: meta.href, 'aria-label': `${title}: ${valueStr}${note ? ` — ${note}` : ''}. ${L('عرض التفاصيل', 'View details')}` }, kids)
    : h('div.kpi', kids);
  return { body, empty: d.value == null };
}

// ---------------- Projects ----------------
const projTone = (p) => (p.delayed ? 'crit' : p.at_risk ? 'warn' : null);
const projColor = (p) => (p?.delayed ? 'var(--red)' : p?.at_risk ? 'var(--orange)' : 'var(--series-1)');
function projRow(p) {
  const tone = projTone(p);
  return h('li', h('a.dash-row.proj-row', { href: `#/projects/${p.id}`, 'data-key': `proj:${p.id}`, onclick: () => { state.selectedProjectId = p.id; } },
    h('div.row-main',
      h('div.row-line', h('span.row-title', p.name), p.delayed ? chip('crit', lateText(p.days_overdue)) : p.at_risk ? chip('warn', L('معرّض للتأخر', 'At risk')) : null),
      p.progress == null
        ? h('div.row-line', chip(null, icon('gauge'), L('نسبة الإنجاز غير مسجّلة', 'Progress not reported')))
        : h('div.row-line.proj-progress', h(`div.progress${tone ? `.${tone}` : ''}`, { role: 'progressbar', 'aria-valuenow': p.progress, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('نسبة الإنجاز', 'Progress') }, h('i', { style: { width: `${p.progress}%` } })), h('span.pct', pct(p.progress))),
      h('div.row-meta', [L(p.dept_ar, p.dept_en), p.due_date ? `${L('الاستحقاق', 'Due')} ${fmtDate(p.due_date)}` : null].filter(Boolean).join(' · '))),
    chev()));
}
function renderProjects(w, res, c) {
  const d = res.data || [];
  const demo = d.some((p) => p.is_demo);
  if (!d.length) {
    return { empty: true, body: w.filters?.delayed
      ? emptyState({ compact: true, icon: 'circleCheck', title: L('لا مشاريع متأخرة', 'No delayed projects'), body: L('كل المشاريع ضمن نطاقك تسير وفق مواعيدها.', 'Every project in your scope is on schedule.') })
      : emptyState({ compact: true, icon: 'folder', title: L('لا مشاريع بعد', 'No projects yet'), body: L('ستظهر هنا المشاريع التي تشارك فيها.', 'Projects you take part in will appear here.'), actions: [{ label: L('فتح المشاريع', 'Open projects'), icon: 'folderOpen', tertiary: true, onClick: () => { location.hash = '#/projects'; } }] }) };
  }
  if (w.view === 'bar') {
    const series = (res.series || d.map((p) => ({ label: p.name, value: p.progress, missing: p.progress == null }))).map((x, i) => ({ ...x, color: projColor(d[i]) }));
    const missing = series.some((x) => x.missing || x.value == null);
    const body = h('div.dash-chart', barChart(series, { unit: '%', max: 100, label: L('نسبة إنجاز المشاريع', 'Project progress'), orientation: 'horizontal' }),
      h('div.chart-key', h('span', h('i.key-sw', { 'data-tone': 'accent' }), L('ضمن الموعد', 'On time')), h('span', h('i.key-sw', { 'data-tone': 'crit' }), L('متأخر', 'Delayed')), d.some((p) => p.at_risk && !p.delayed) ? h('span', h('i.key-sw', { 'data-tone': 'warn' }), L('معرّض للتأخر', 'At risk')) : null,
        missing ? h('span', h('i.key-sw.is-missing'), L('غير مسجّلة (لا تُحتسب صفراً)', 'Not reported (not counted as zero)')) : null));
    return { body, count: d.length, demo };
  }
  if (w.view === 'table') {
    const body = dataTable({
      rows: d, caption: widgetTitle(w), onRow: (p) => { state.selectedProjectId = p.id; location.hash = `#/projects/${p.id}`; },
      columns: [
        { key: 'name', label: L('المشروع', 'Project'), sort: (p) => p.name },
        { key: 'progress', label: L('الإنجاز', 'Progress'), num: true, sort: (p) => p.progress ?? -1, render: (p) => (p.progress == null ? chip(null, L('غير محدد', 'n/a')) : pct(p.progress)) },
        { key: 'due_date', label: L('الاستحقاق', 'Due'), sort: (p) => p.due_date || '', render: (p) => fmtDate(p.due_date) },
        { key: 'state', label: L('الحالة', 'State'), sort: (p) => (p.delayed ? 0 : p.at_risk ? 1 : 2), render: (p) => (p.delayed ? chip('crit', lateText(p.days_overdue)) : p.at_risk ? chip('warn', L('معرّض للتأخر', 'At risk')) : chip('good', L('ضمن الموعد', 'On time'))) },
      ],
    });
    return { body, count: d.length, demo };
  }
  const limit = 5;
  return { body: h('ul.dash-list.proj-list', d.slice(0, limit).map(projRow)), foot: d.length > limit ? viewAll('#/projects', d.length) : null, count: d.length, demo };
}

// ---------------- Tasks ----------------
const STATUS_COLOR = { todo: 'var(--gray-400)', in_progress: 'var(--series-1)', done: 'var(--series-4)' };
const PRIORITY_COLOR = { urgent: 'var(--red)', high: 'var(--orange)', medium: 'var(--series-1)', low: 'var(--gray-400)' };
function taskSeries(res) {
  const byPriority = res.group_by === 'priority';
  return (res.series || []).map((x) => ({
    label: byPriority ? (PRIORITY[x.key] ? L(PRIORITY[x.key][0], PRIORITY[x.key][1]) : x.label) : (STATUS[x.key] ? L(...STATUS[x.key]) : x.label),
    value: x.value, color: (byPriority ? PRIORITY_COLOR : STATUS_COLOR)[x.key],
  }));
}
function taskItem(tk, c) {
  let done = tk.status === 'done';
  const li = h('li.task-item');
  const check = h('button.check', { type: 'button', 'data-key': `check:${tk.id}` });
  const paint = () => {
    li.classList.toggle('is-done', done); check.classList.toggle('on', done);
    check.setAttribute('aria-pressed', String(done));
    check.setAttribute('aria-label', done ? L(`إعادة فتح «${tk.title}»`, `Reopen “${tk.title}”`) : L(`تعليم «${tk.title}» كمنجزة`, `Mark “${tk.title}” as done`));
    check.replaceChildren(...(done ? [icon('check')] : []));
  };
  check.addEventListener('click', async (e) => {
    e.stopPropagation();
    const next = done ? 'todo' : 'done';
    done = next === 'done'; paint(); c.local(); // optimistic
    const r = await runTool('update_task', { id: tk.id, status: next }, { quiet: true });
    if (!r || r.status !== 'ok') { done = !done; paint(); return; }
    tk.status = next;
    toast(next === 'done' ? L(`أُنجزت «${tk.title}»`, `Completed “${tk.title}”`) : L(`أُعيد فتح «${tk.title}»`, `Reopened “${tk.title}”`), undoOpts(r));
  });
  paint();
  const meta = [tk.project_name, tk.due_date ? fmtDate(tk.due_date) : null, L(tk.assignee_ar, tk.assignee_en)].filter(Boolean).join(' · ');
  const tag = tk.overdue && tk.status !== 'done' ? chip('crit', L('متأخرة', 'Overdue')) : ['urgent', 'high'].includes(tk.priority) ? priorityChip(tk.priority) : null;
  li.append(...[check, h('a.row-main.task-link', { href: tk.project_id ? `#/projects/${tk.project_id}` : '#/tasks', 'data-key': `task:${tk.id}`, onclick: () => { state.selectedTaskId = tk.id; } }, h('span.row-title', tk.title), meta ? h('span.row-meta', meta) : null), tag].filter(Boolean));
  return li;
}
function renderTasks(w, res, c) {
  const d = res.data || [];
  const demo = d.some((x) => x.is_demo);
  const emptyTasks = () => emptyState({ compact: true, icon: 'checkCheck', title: w.filters?.open ? L('لا مهام مفتوحة', 'No open tasks') : L('لا مهام', 'No tasks'), body: w.filters?.open ? L('أنجزت كل ما هو مسند إليك. أحسنت!', 'You’re all caught up. Nice work!') : L('لا توجد مهام ضمن هذا العرض.', 'There are no tasks in this view.'), actions: [{ label: L('مهمة جديدة', 'New task'), icon: 'taskPlus', tertiary: true, onClick: () => import('./views/projects.js').then((m) => m.newTask(null)) }] });
  if (w.view === 'bar' || w.view === 'donut') {
    const series = taskSeries(res);
    const total = series.reduce((a, x) => a + (x.value || 0), 0);
    const lbl = res.group_by === 'priority' ? L('المهام حسب الأولوية', 'Tasks by priority') : L('المهام حسب الحالة', 'Tasks by status');
    // An all-zero chart is still a true reading of the source, so the chosen view is kept.
    const chart = w.view === 'bar' ? barChart(series, { label: lbl, integer: true, height: total ? 180 : 140 }) : donutChart(total ? series.filter((x) => x.value) : series, { label: lbl, totalLabel: L('مهمة', 'tasks') });
    const note = total ? null : h('p.chart-note', icon('checkCheck', 'sm'), w.filters?.open ? L('لا مهام مفتوحة ضمن هذا العرض الآن.', 'No open tasks in this view right now.') : L('لا مهام ضمن هذا العرض الآن.', 'No tasks in this view right now.'));
    return { body: h('div.dash-chart', note, chart), count: total, demo };
  }
  if (!d.length) return { body: emptyTasks(), empty: true };
  if (w.view === 'table') {
    return { count: d.length, demo, body: dataTable({
      rows: d, caption: widgetTitle(w), onRow: (x) => { state.selectedTaskId = x.id; location.hash = x.project_id ? `#/projects/${x.project_id}` : '#/tasks'; },
      columns: [
        { key: 'title', label: L('المهمة', 'Task'), sort: (x) => x.title },
        { key: 'status', label: L('الحالة', 'Status'), sort: (x) => x.status, render: (x) => statusLabel(x.status) },
        { key: 'priority', label: L('الأولوية', 'Priority'), sort: (x) => ['urgent', 'high', 'medium', 'low'].indexOf(x.priority), render: (x) => priorityChip(x.priority) },
        { key: 'due_date', label: L('الاستحقاق', 'Due'), sort: (x) => x.due_date || '9999', render: (x) => (x.overdue && x.status !== 'done' ? chip('crit', fmtDate(x.due_date)) : fmtDate(x.due_date)) },
      ],
    }) };
  }
  const limit = 6;
  return { body: h('ul.dash-list.task-list', d.slice(0, limit).map((x) => taskItem(x, c))), foot: d.length > limit ? viewAll('#/tasks', d.length) : null, count: d.length, demo };
}

// ---------------- Week progress ----------------
const DAYS = { ar: ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'], arShort: ['أحد', 'اثنين', 'ثلاثاء', 'أربعاء', 'خميس', 'جمعة', 'سبت'], en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], enShort: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] };
function renderWeek(w, res) {
  const today = new Date().getDay(); // week starts Sunday, matching the server
  const ar = getLang() === 'ar';
  const series = (res.series || []).map((x, i) => ({ label: (ar ? DAYS.arShort : DAYS.enShort)[i] || x.label, title: (ar ? DAYS.ar : DAYS.en)[i] || x.label, value: x.value, emphasis: i === today, muted: i > today }));
  const total = res.total ?? series.reduce((a, x) => a + (x.value || 0), 0);
  const hero = h('div.week-hero', h('span.kpi-num', { class: total ? '' : 'is-zero' }, fmtNum(total)), h('span.week-cap', total ? L('مهام أُنجزت منذ بداية الأسبوع', 'tasks completed since the week began') : L('لم تُنجز مهام بعد هذا الأسبوع', 'No tasks completed yet this week')));
  if (w.view === 'table') {
    return { body: h('div.week', hero, dataTable({ rows: series, stackMobile: false, caption: widgetTitle(w), columns: [{ key: 'title', label: L('اليوم', 'Day') }, { key: 'value', label: L('منجزة', 'Done'), num: true, render: (x) => fmtNum(x.value) }] })) };
  }
  return { body: h('div.week', hero, barChart(series, { label: L('المهام المنجزة يومياً', 'Tasks done per day'), integer: true, height: 150, orientation: 'vertical', barWidth: 22 })) };
}

// ---------------- Events ----------------
function renderEvents(d, c) {
  if (!d.length) return { empty: true, body: emptyState({ compact: true, icon: 'calendarDays', title: L('لا مواعيد قادمة', 'No upcoming appointments'), body: L('لا شيء في جدولك خلال الأسبوعين القادمين.', 'Nothing on your calendar for the next two weeks.') }) };
  const ex = expander(c, 'events', d.length, 5);
  const todayStr = new Date().toDateString();
  const rows = d.slice(0, ex.limit).map((e) => {
    const dt = parseTs(e.starts_at);
    const isToday = dt.toDateString() === todayStr;
    return h('li.ev-item', { 'data-key': `ev:${e.id}` },
      h('div.ev-date', { class: isToday ? 'is-today' : '', 'aria-hidden': 'true' }, h('span.ev-m', isToday ? L('اليوم', 'Today') : dt.toLocaleDateString(locale(), { month: 'short' })), h('span.ev-d', dt.toLocaleDateString(locale(), { day: 'numeric' }))),
      h('div.row-main', h('span.row-title', e.title), h('span.row-meta', [isToday ? L('اليوم', 'Today') : fmtDate(e.starts_at), fmtTime(e.starts_at), e.location].filter(Boolean).join(' · '))));
  });
  return { body: h('ul.dash-list.ev-list', rows), foot: ex.toggle, count: d.length, demo: d.some((e) => e.is_demo) };
}

// ---------------- Alerts ----------------
const LEVEL = { critical: { rank: 0, tone: 'crit', icon: 'shieldAlert' }, warning: { rank: 1, tone: 'warn', icon: 'alert' }, info: { rank: 2, tone: 'accent', icon: 'info' } };
async function markRead(ids, rows, c) {
  c.local();
  rows.forEach((li) => { li.classList.add('is-read'); li.querySelector('.alert-read')?.remove(); });
  try { await Promise.all(ids.map((id) => api(`/api/alerts/${id}/read`, { method: 'POST' }))); }
  catch (e) { rows.forEach((li) => li.classList.remove('is-read')); toast(e.message, { kind: 'error' }); }
  emit('data-changed', { entity: 'alert' });
}
function renderAlerts(list, c) {
  if (!list.length) return { empty: true, body: emptyState({ compact: true, icon: 'bell', title: L('لا تنبيهات', 'No alerts'), body: L('ستظهر هنا التنبيهات المهمة فور حدوثها.', 'Important alerts will show up here.') }) };
  const d = [...list].sort((a, b) => (LEVEL[a.level]?.rank ?? 3) - (LEVEL[b.level]?.rank ?? 3));
  const unread = d.filter((a) => a.derived || !a.read_at).length;
  const ex = expander(c, 'alerts', d.length, 5);
  const markable = [];
  const rows = d.slice(0, ex.limit).map((a) => {
    const lv = LEVEL[a.level] || LEVEL.info;
    const canRead = !a.derived && !a.read_at;
    const li = h('li.alert-item', { class: canRead || a.derived ? '' : 'is-read' });
    li.append(...[glyph(lv.icon, lv.tone), h('div.row-main', h('span.row-title.wrap', a.title), a.body ? h('span.row-body', a.body) : null),
      canRead ? h('button.btn.sm.ghost.alert-read', { type: 'button', 'data-key': `read:${a.id}`, onclick: () => markRead([a.id], [li], c) }, L('تمت القراءة', 'Mark read')) : null].filter(Boolean));
    if (canRead) markable.push([a.id, li]);
    return li;
  });
  const foot = markable.length > 1 || ex.toggle ? h('div.foot-actions', ex.toggle, markable.length > 1 ? h('button.btn.sm.ghost', { type: 'button', onclick: () => markRead(markable.map((m) => m[0]), markable.map((m) => m[1]), c) }, icon('checkCheck', 'sm'), L('تعليم الكل كمقروء', 'Mark all as read')) : null) : null;
  return { body: h('ul.dash-list.alert-list', rows), foot, count: unread, demo: d.some((a) => a.is_demo) };
}

// ---------------- Documents ----------------
function renderDocuments(d) {
  if (!d.length) {
    return { empty: true, body: emptyState({ compact: true, icon: 'fileText', title: L('لا مستندات بعد', 'No documents yet'), body: L('اطلب من المساعد إعداد تقرير وسيظهر هنا.', 'Ask the assistant for a report and it will appear here.'), actions: [{ label: L('اطلب تقريراً', 'Ask for a report'), icon: 'spark', tertiary: true, onClick: () => import('./chat.js').then((m) => m.focus(L('ابنِ تقريراً عن ', 'Build a report about '))) }] }) };
  }
  const rows = d.map((x) => h('li', h('button.dash-row', { type: 'button', 'data-key': `doc:${x.id}`, onclick: () => Editor.open(x.id) }, glyph('fileText', 'accent'),
    h('span.row-main', h('span.row-title', x.title), h('span.row-meta', `${L('الإصدار', 'Version')} ${fmtNum(x.current_version)} · ${fmtDate(x.updated_at)}`)), chev())));
  return { body: h('ul.dash-list.doc-list', rows), foot: viewAll('#/documents'), demo: d.some((x) => x.is_demo) };
}
