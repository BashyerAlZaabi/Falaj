import { api } from '../api.js';
import { h, icon, modal, toast, confirmDialog } from '../ui.js';
import { L, t, fmtDate, fmtTime } from '../i18n.js';
import { state, emit } from '../state.js';
import { projectCard, taskRow, runTool, progressBar } from '../widgets.js';
import * as Chat from '../chat.js';

export async function renderProjects(root) {
  const [list] = await Promise.all([api('/api/projects')]);
  let filter = 'all';
  const body = h('div');
  const draw = () => {
    const rows = filter === 'delayed' ? list.filter((p) => p.delayed) : filter === 'missing' ? list.filter((p) => p.progress == null) : list;
    body.replaceChildren(rows.length ? h('ul.list', rows.map(projectCard)) : h('div.empty', L('لا توجد مشاريع مطابقة ضمن نطاقك', 'No matching projects in your scope')));
  };
  const tabs = h('div.tabs', [['all', L('الكل', 'All')], ['delayed', L('المتأخرة', 'Delayed')], ['missing', L('بلا نسبة', 'No progress')]].map(([k, l]) => h(`button${k === filter ? '.on' : ''}`, { onclick: (e) => { filter = k; tabs.querySelectorAll('button').forEach((b) => b.classList.remove('on')); e.target.classList.add('on'); draw(); } }, l)));
  root.append(h('div.toolbar', tabs, h('span', { style: { flex: 1 } }), h('button.btn.primary', { onclick: newProject }, icon('plus'), L('مشروع جديد', 'New project'))));
  root.append(h('section.card.size-l', body));
  draw();
}

async function newProject() {
  const name = h('input.field', { required: true }); const due = h('input.field', { type: 'date' }); const desc = h('textarea.field', { rows: 2 });
  const ok = await modal(L('مشروع جديد', 'New project'), h('div', h('label.lbl', L('الاسم', 'Name')), name, h('label.lbl', L('تاريخ الاستحقاق', 'Due date')), due, h('label.lbl', L('الوصف', 'Description')), desc,
    h('p.tiny.muted', L('لا تُسجَّل نسبة إنجاز افتراضية؛ حدّدها لاحقاً عند توفرها.', 'No default progress is recorded; set it when known.'))), [{ label: t('cancel'), value: false }, { label: L('إنشاء', 'Create'), value: true, primary: true }]);
  if (!ok) return;
  const r = await runTool('create_project', { name: name.value, due_date: due.value || undefined, description: desc.value || undefined });
  if (r) location.hash = `#/projects/${r.result.id}`;
}

export async function renderProject(root, id) {
  const p = await api(`/api/projects/${id}`);
  state.selectedProjectId = p.id; state.projectName = p.name;
  root.append(h('div.toolbar', h('a.btn.sm.ghost', { href: '#/projects' }, icon(document.dir === 'rtl' ? 'chevron' : 'chevronL'), L('المشاريع', 'Projects')), h('span', { style: { flex: 1 } }),
    h('button.btn.sm', { onclick: () => Chat.focus(L('بخصوص هذا المشروع: ', 'About this project: ')) }, icon('chat'), L('ناقش مع المساعد', 'Discuss with assistant')),
    p.can_edit ? h('button.btn.sm.danger', { onclick: () => del(p) }, icon('trash'), t('delete')) : null));
  const progressIn = h('input.field', { type: 'number', min: 0, max: 100, step: 1, value: p.progress ?? '', placeholder: L('غير محدد', 'Not set'), style: { width: '110px' }, disabled: !p.can_edit || null });
  root.append(h('section.card.size-l',
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } }, h('h1', { style: { margin: 0, fontSize: '24px' } }, p.name),
      p.delayed ? h('span.chip.crit', `${L('متأخر', 'Delayed')} ${p.days_overdue} ${L('يوم', 'days')}`) : p.at_risk ? h('span.chip.warn', L('معرّض للتأخر', 'At risk')) : h('span.chip.good', L('ضمن الموعد', 'On track')),
      p.is_demo ? h('span.chip.demo', t('demo')) : null),
    p.description ? h('p.muted', p.description) : null,
    h('div.kv', { style: { margin: '12px 0' } },
      h('span.muted', L('الإدارة', 'Department')), h('span', L(p.dept_ar, p.dept_en)),
      h('span.muted', L('المالك', 'Owner')), h('span', L(p.owner_name_ar, p.owner_name_en)),
      h('span.muted', L('الفترة', 'Period')), h('span', `${fmtDate(p.start_date)} → ${fmtDate(p.due_date)}`),
      h('span.muted', L('الأعضاء', 'Members')), h('span', p.members.map((m) => L(m.name_ar, m.name_en)).join('، '))),
    h('div', { style: { display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' } },
      h('strong', L('نسبة الإنجاز', 'Progress')), h('div', { style: { flex: 1, minWidth: '160px' } }, progressBar(p.progress)), progressIn,
      p.can_edit ? h('button.btn.sm.primary', { onclick: async () => {
        const v = progressIn.value === '' ? null : Number(progressIn.value);
        if (v == null || !Number.isInteger(v) || v < 0 || v > 100) { toast(L('أدخل رقماً صحيحاً بين 0 و100', 'Enter an integer 0-100'), { kind: 'error' }); return; }
        await runTool('update_project', { id: p.id, progress: v });
      } }, t('save')) : h('span.tiny.muted', L('اطلاع فقط', 'View only'))),
    h('div.tiny.muted', { style: { marginTop: '6px' } }, p.progress_updated_at ? `${L('آخر تحديث للنسبة', 'Progress updated')} ${fmtDate(p.progress_updated_at)} ${fmtTime(p.progress_updated_at)} · ${L('المصدر: بيانات المشروع', 'Source: project record')}` : L('لم تُسجَّل نسبة إنجاز بعد', 'No progress reported yet')),
    p.expected_progress != null ? h('div.tiny.muted', `${L('المتوقع زمنياً', 'Time-elapsed expectation')}: ${p.expected_progress}% (${L('للاسترشاد', 'reference only')})`) : null));

  const tasksCard = h('section.card.size-l', { style: { marginTop: '14px' } }, h('div.card-head', h('h4', `${L('المهام', 'Tasks')} (${p.tasks_done}/${p.tasks_total})`), p.can_edit ? h('button.btn.sm', { onclick: () => newTask(p) }, icon('plus'), L('مهمة', 'Task')) : null),
    p.tasks.length ? h('ul.list', p.tasks.map((x) => taskRow(x))) : h('div.empty', L('لا مهام', 'No tasks')));
  root.append(tasksCard);
}

export async function newTask(p) {
  const users = await api('/api/users/assignable');
  const title = h('input.field'); const due = h('input.field', { type: 'date' });
  const prio = h('select.field', [['medium', L('متوسطة', 'Medium')], ['high', L('عالية', 'High')], ['urgent', L('عاجلة', 'Urgent')], ['low', L('منخفضة', 'Low')]].map(([v, l]) => h('option', { value: v }, l)));
  const who = h('select.field', users.map((u) => h('option', { value: u.id, selected: u.id === state.me.user.id || null }, L(u.name_ar, u.name_en))));
  const ok = await modal(L('مهمة جديدة', 'New task'), h('div', h('label.lbl', L('العنوان', 'Title')), title, h('label.lbl', L('المسؤول', 'Assignee')), who, h('label.lbl', L('الاستحقاق', 'Due')), due, h('label.lbl', L('الأولوية', 'Priority')), prio), [{ label: t('cancel'), value: false }, { label: L('إضافة', 'Add'), value: true, primary: true }]);
  if (!ok) return;
  await runTool('create_task', { title: title.value, assignee_id: who.value, due_date: due.value || undefined, priority: prio.value, project_id: p?.id });
}

async function del(p) {
  const r = await runTool('delete_project', { id: p.id }, { quiet: true });
  if (r?.status !== 'needs_confirmation') return;
  const ok = await confirmDialog(L('حذف نهائي', 'Permanent deletion'), r.confirmation.summary, { danger: true });
  const res = await api(`/api/confirmations/${r.confirmation.id}`, { method: 'POST', body: { accept: !!ok } });
  if (res.status === 'ok') { toast(L('تم الحذف', 'Deleted')); location.hash = '#/projects'; emit('data-changed', {}); }
}
