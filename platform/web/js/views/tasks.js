import { api } from '../api.js';
import { h, icon } from '../ui.js';
import { L } from '../i18n.js';
import { state } from '../state.js';
import { taskRow } from '../widgets.js';
import { newTask } from './projects.js';

let filter = 'mine';
export async function renderTasks(root) {
  const q = filter === 'mine' ? '?mine=1' : filter === 'overdue' ? '?overdue=1' : filter === 'done' ? '?status=done' : '';
  const list = await api(`/api/tasks${q}`);
  const rows = filter === 'mine' ? list.filter((x) => x.status !== 'done') : list;
  const tabs = [['mine', L('مهامي المفتوحة', 'My open tasks')], ['all', state.me.user.role === 'employee' ? L('كل ما يخصني', 'All mine') : L('مهام الفريق', 'Team tasks')], ['overdue', L('المتأخرة', 'Overdue')], ['done', L('المنجزة', 'Done')]];
  root.append(h('div.toolbar', h('div.tabs', tabs.map(([k, l]) => h(`button${k === filter ? '.on' : ''}`, { onclick: () => { filter = k; window.dispatchEvent(new HashChangeEvent('hashchange')); } }, l))), h('span', { style: { flex: 1 } }), h('button.btn.primary', { onclick: () => newTask(null) }, icon('plus'), L('مهمة جديدة', 'New task'))));
  root.append(h('section.card.size-l', rows.length ? h('ul.list', rows.map((x) => taskRow(x))) : h('div.empty', L('لا مهام هنا', 'No tasks here'))));
}
