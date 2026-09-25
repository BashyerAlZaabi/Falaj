// Dashboard widget renderers. Values always come from /api/dashboard/widgets/:id/data
// (computed server-side from source data within the user's scope).
import { api, rid } from './api.js';
import { h, icon, toast, esc } from './ui.js';
import { L, t, fmtDate, fmtTime, fmtNum } from './i18n.js';
import { barChart, donutChart } from './charts.js';
import { state, emit } from './state.js';
import * as Editor from './editor.js';
import { statusLabel, priorityChip, runTool, undo, progressBar, taskRow, projectCard, STATUS, PRIORITY } from './work-items.js';
export { statusLabel, priorityChip, runTool, undo, progressBar, taskRow, projectCard };

function tableView(cols, rows, onRow) {
  if (!rows.length) return h('div.empty', L('لا توجد بيانات', 'No data'));
  return h('div', { style: { overflowX: 'auto' } }, h('table.tbl', h('thead', h('tr', cols.map((c) => h('th', c[0])))), h('tbody', rows.map((r) => h(`tr${onRow ? '.clickable' : ''}`, { onclick: onRow ? () => onRow(r) : null }, cols.map((c) => h('td', c[1](r))))))));
}

const KPI_NAMES = { active_projects: ['المشاريع النشطة', 'Active projects'], delayed_projects: ['المشاريع المتأخرة', 'Delayed projects'], avg_progress: ['متوسط الإنجاز', 'Average progress'], task_completion: ['نسبة إنجاز المهام', 'Task completion'], overdue_tasks: ['المهام المتأخرة', 'Overdue tasks'], week_done: ['منجز هذا الأسبوع', 'Done this week'] };
export function widgetTitle(w) {
  if (w.title) return w.title;
  if (w.type === 'kpi' && KPI_NAMES[w.filters?.metric]) return L(...KPI_NAMES[w.filters.metric]);
  const map = { summary: ['ملخص اليوم', 'Daily summary'], kpi: ['مؤشر', 'KPI'], projects: ['المشاريع', 'Projects'], tasks: ['المهام', 'Tasks'], week_progress: ['إنجاز هذا الأسبوع', 'This week'], events: ['المواعيد', 'Appointments'], alerts: ['التنبيهات', 'Alerts'], documents: ['آخر المستندات', 'Recent documents'] };
  return L(...map[w.type]);
}

export async function renderWidgetBody(w) {
  const res = await api(`/api/dashboard/widgets/${w.id}/data`);
  const body = h('div');
  const d = res.data;
  switch (w.type) {
    case 'summary': {
      const c = d.counts;
      const mini = (v, k, cls) => h('div.mini', h('div.v', { class: cls || '' }, fmtNum(v)), h('div.k', k));
      body.append(h('div.stats-row',
        mini(c.open_tasks, L('مهام مفتوحة', 'Open tasks')), mini(c.due_today, L('مستحقة اليوم', 'Due today')),
        mini(c.overdue, L('متأخرة', 'Overdue')), mini(c.events_today, L('مواعيد اليوم', 'Meetings today')),
        mini(c.delayed_projects, L('مشاريع متأخرة', 'Delayed projects')), mini(c.pending_reviews || 0, L('بانتظار موافقتك', 'Awaiting approval'))));
      if (d.needs_action.length) body.append(h('div.section', L('يحتاج إجراءً', 'Needs action')), h('ul.list', d.needs_action.slice(0, 5).map((a) => h('li.clickable', { onclick: () => { if (a.type === 'project') location.hash = `#/projects/${a.id}`; else if (a.type === 'office_run') location.hash = '#/office'; else location.hash = '#/tasks'; } },
        icon(a.reason === 'overdue' ? 'alert' : a.reason === 'delayed' ? 'calendar' : a.reason === 'review' ? 'people' : 'info'), h('div.grow.title', a.title),
        h(`span.chip.tiny${a.reason === 'missing_progress' ? '' : a.reason === 'review' ? '.warn' : '.crit'}`, { overdue: L('مهمة متأخرة', 'Overdue task'), delayed: L('مشروع متأخر', 'Delayed project'), missing_progress: L('بلا نسبة إنجاز', 'No progress'), review: L('بانتظار موافقتك', 'Needs approval') }[a.reason])))));
      break;
    }
    case 'kpi': {
      if (!d) { body.append(h('div.empty', '—')); break; }
      body.append(h('div.stat', d.value == null ? '—' : fmtNum(d.value), d.unit && d.value != null ? h('span.unit', d.unit) : null));
      body.append(h('div.small.muted', L(d.label_ar, d.label_en)));
      if (d.note_ar) body.append(h('div.tiny.muted', L(d.note_ar, d.note_en)));
      if (d.status) body.append(h(`span.chip.tiny.${d.status === 'good' ? 'good' : d.status === 'warning' ? 'warn' : 'crit'}`, { style: { marginTop: '6px' } }, icon(d.status === 'good' ? 'check' : 'alert'), d.status === 'good' ? L('سليم', 'OK') : L('يحتاج متابعة', 'Attention')));
      break;
    }
    case 'projects': {
      if (w.view === 'bar') body.append(d.length ? barChart(res.series, { unit: '%', max: 100, label: L('نسبة إنجاز المشاريع', 'Project progress') }) : h('div.empty', L('لا مشاريع', 'No projects')), d.some((p) => p.progress == null) ? h('div.tiny.muted', L('الأعمدة المنقطة = نسبة غير مسجلة', 'Dashed = progress not reported')) : null);
      else if (w.view === 'table') body.append(tableView([[L('المشروع', 'Project'), (p) => p.name], [L('الإنجاز', 'Progress'), (p) => (p.progress == null ? L('غير محدد', 'n/a') : `${p.progress}%`)], [L('الاستحقاق', 'Due'), (p) => fmtDate(p.due_date)], [L('الحالة', 'State'), (p) => (p.delayed ? L('متأخر', 'Delayed') : L('ضمن الموعد', 'On time'))]], d, (p) => (location.hash = `#/projects/${p.id}`)));
      else body.append(d.length ? h('ul.list', d.map(projectCard)) : h('div.empty', w.filters?.delayed ? L('لا توجد مشاريع متأخرة ضمن نطاقك', 'No delayed projects in your scope') : L('لا مشاريع', 'No projects')));
      break;
    }
    case 'tasks': {
      if (w.view === 'bar') body.append(barChart(res.series.map((s) => ({ label: s.label, value: s.value })), { label: L('المهام حسب الحالة', 'Tasks by status') }));
      else if (w.view === 'donut') body.append(donutChart(res.series.filter((s) => s.value), { label: L('المهام', 'Tasks') }));
      else if (w.view === 'table') body.append(tableView([[L('المهمة', 'Task'), (x) => x.title], [L('الحالة', 'Status'), (x) => statusLabel(x.status)], [L('الأولوية', 'Priority'), (x) => L(...PRIORITY[x.priority].slice(0, 2))], [L('الاستحقاق', 'Due'), (x) => fmtDate(x.due_date)]], d.slice(0, 20)));
      else body.append(d.length ? h('ul.list', d.slice(0, 8).map((x) => taskRow(x))) : h('div.empty', L('لا مهام', 'No tasks')));
      break;
    }
    case 'week_progress': body.append(h('div.small', `${L('المنجز منذ بداية الأسبوع', 'Completed since week start')}: `, h('strong', fmtNum(res.total))), w.view === 'table' ? tableView([[L('اليوم', 'Day'), (x) => x.label], [L('منجزة', 'Done'), (x) => fmtNum(x.value)]], res.series) : barChart(res.series, { label: L('المهام المنجزة يومياً', 'Tasks done per day') })); break;
    case 'events': body.append(d.length ? h('ul.list', d.slice(0, 6).map((e) => h('li', icon('calendar'), h('div.grow', h('div.title', e.title), h('div.tiny.muted', `${fmtDate(e.starts_at)} · ${fmtTime(e.starts_at)}${e.location ? ` · ${e.location}` : ''}`)), e.is_demo ? h('span.chip.demo.tiny', t('demo')) : null))) : h('div.empty', L('لا مواعيد قادمة', 'No upcoming appointments'))); break;
    case 'alerts': body.append(d.length ? h('ul.list', d.slice(0, 6).map((a) => h('li', { style: { alignItems: 'flex-start' } }, h(`span.chip.tiny.${a.level === 'critical' ? 'crit' : a.level === 'warning' ? 'warn' : ''}`, icon(a.level === 'info' ? 'info' : 'alert')), h('div.grow', h('div', a.title), a.body ? h('div.tiny.muted', a.body) : null),
      !a.derived && !a.read_at ? h('button.btn.sm.ghost', { onclick: async () => { await api(`/api/alerts/${a.id}/read`, { method: 'POST' }); emit('data-changed', {}); } }, L('تمت القراءة', 'Mark read')) : null))) : h('div.empty', L('لا تنبيهات', 'No alerts'))); break;
    case 'documents': body.append(d.length ? h('ul.list', d.map((x) => h('li.clickable', { onclick: () => Editor.open(x.id) }, icon('doc'), h('div.grow', h('div.title', x.title), h('div.tiny.muted', `v${x.current_version} · ${fmtDate(x.updated_at)}`))))) : h('div.empty', L('لا مستندات بعد — اطلب من المساعد إعداد تقرير', 'No documents yet — ask the assistant for a report'))); break;
  }
  return { body, source: res.source, updated_at: res.updated_at };
}
