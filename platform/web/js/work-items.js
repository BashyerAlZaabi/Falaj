// Shared work-item components (task rows, project cards, status/priority,
// progress bars) and the tool/undo helpers used by every screen.
import { api, rid } from './api.js';
import { h, icon, toast } from './ui.js';
import { L, t, fmtDate } from './i18n.js';
import { state, emit } from './state.js';

export const STATUS = { todo: ['قيد الانتظار', 'To do'], in_progress: ['قيد التنفيذ', 'In progress'], done: ['منجزة', 'Done'] };
export const PRIORITY = { urgent: ['عاجلة', 'Urgent', 'crit'], high: ['عالية', 'High', 'warn'], medium: ['متوسطة', 'Medium', ''], low: ['منخفضة', 'Low', ''] };
export const statusLabel = (s) => L(...STATUS[s]);
export const priorityChip = (p) => h(`span.chip.tiny${PRIORITY[p][2] ? '.' + PRIORITY[p][2] : ''}`, L(PRIORITY[p][0], PRIORITY[p][1]));

export async function runTool(name, input, { quiet } = {}) {
  const r = await api(`/api/tools/${name}`, { method: 'POST', body: { input, requestId: rid() } }).catch((e) => e.body || { status: 'error', error: e.message });
  if (r.status === 'error') { toast(r.error, { kind: 'error' }); return null; }
  if (r.status === 'needs_confirmation') return r;
  if (!quiet && r.undoable && r.actionId) toast(L('تم الحفظ', 'Saved'), { action: t('undo'), onAction: () => undo(r.actionId) });
  return r;
}
export async function undo(actionId) {
  const r = await api(`/api/actions/${actionId}/undo`, { method: 'POST' }).catch((e) => e.body);
  toast(r?.status === 'ok' ? L('تم التراجع', 'Undone') : (r?.error || 'error'), { kind: r?.status === 'ok' ? null : 'error' });
  emit('data-changed', { entity: 'all' });
}

export function progressBar(p) {
  return p == null
    ? h('div.progress.missing', { title: L('نسبة الإنجاز غير محددة', 'Progress not reported'), role: 'img', 'aria-label': L('غير محدد', 'not reported') })
    : h('div.progress', { role: 'progressbar', 'aria-valuenow': p, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('i', { style: { width: `${p}%` } }));
}

export function taskRow(tk, { onToggle } = {}) {
  const done = tk.status === 'done';
  return h('li.clickable', { 'data-id': tk.id, onclick: (e) => { if (e.target.closest('.check')) return; state.selectedTaskId = tk.id; if (tk.project_id) location.hash = `#/projects/${tk.project_id}`; } },
    h(`button.check${done ? '.on' : ''}`, { 'aria-label': L('تبديل الإنجاز', 'Toggle done'), onclick: async (e) => { e.stopPropagation(); await runTool('update_task', { id: tk.id, status: done ? 'todo' : 'done' }); onToggle?.(); } }, done ? icon('check') : null),
    h('div.grow', h('div.title', { style: done ? { textDecoration: 'line-through', color: 'var(--muted)' } : {} }, tk.title),
      h('div.tiny.muted', [tk.project_name, tk.due_date ? fmtDate(tk.due_date) : null, L(tk.assignee_ar, tk.assignee_en)].filter(Boolean).join(' · '))),
    tk.overdue ? h('span.chip.tiny.crit', L('متأخرة', 'Overdue')) : priorityChip(tk.priority),
    tk.is_demo ? h('span.chip.demo.tiny', t('demo')) : null);
}

export function projectCard(p) {
  return h('li.clickable', { onclick: () => { state.selectedProjectId = p.id; location.hash = `#/projects/${p.id}`; } },
    h('div.grow',
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } }, h('div.title', { style: { fontWeight: 500 } }, p.name), p.delayed ? h('span.chip.tiny.crit', `${L('متأخر', 'Delayed')} ${p.days_overdue}${L('ي', 'd')}`) : p.at_risk ? h('span.chip.tiny.warn', L('معرّض للتأخر', 'At risk')) : null),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '6px' } }, h('div', { style: { flex: 1 } }, progressBar(p.progress)), h('span.small', { style: { fontVariantNumeric: 'tabular-nums' } }, p.progress == null ? L('غير محدد', 'n/a') : `${p.progress}%`)),
      h('div.tiny.muted', `${L(p.dept_ar, p.dept_en)} · ${L('الاستحقاق', 'Due')} ${fmtDate(p.due_date)}${p.progress_updated_at ? ` · ${L('حُدّث', 'upd.')} ${fmtDate(p.progress_updated_at)}` : ''}`)));
}
