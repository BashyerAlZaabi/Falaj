// Unified Portal home: greeting, daily summary and the customisable dashboard.
import { api } from '../api.js';
import { h, icon, toast, modal, esc } from '../ui.js';
import { L, t, fmtTime } from '../i18n.js';
import { state } from '../state.js';
import { renderWidgetBody, widgetTitle, runTool } from '../widgets.js';
import * as Chat from '../chat.js';

let prevLayout = new Map();

const VIEW_ICONS = { cards: 'list', list: 'list', table: 'table', bar: 'bar', donut: 'pie', stat: 'gauge' };
const VIEW_NAMES = { cards: ['بطاقات', 'Cards'], list: ['قائمة', 'List'], table: ['جدول', 'Table'], bar: ['أعمدة', 'Bars'], donut: ['دائري', 'Donut'], stat: ['رقم', 'Number'] };

export async function renderHome(root) {
  const [dash, me] = [await api('/api/dashboard'), state.me];
  const u = me.user;
  const hour = new Date().getHours();
  root.append(h('div.greet',
    h('div', h('div.small.muted', new Date().toLocaleDateString(L('ar-AE', 'en-GB'), { weekday: 'long', day: 'numeric', month: 'long' })),
      h('h1', `${hour < 12 ? t('greet.morning') : t('greet.evening')}، ${L(u.name_ar, u.name_en).split(' ')[0]}`),
      h('div.small.muted', `${t('role.' + u.role)} · ${L(u.dept_ar, u.dept_en)} · ${L('نطاق العرض', 'Scope')}: ${u.role === 'president' ? L('المؤسسة (خارج Vault)', 'Organisation (outside Vault)') : u.role === 'manager' ? L('إدارتك', 'Your department') : L('أعمالك', 'Your work')}`)),
    h('div.toolbar', { style: { marginBottom: 0 } },
      h('button.btn.sm', { onclick: () => Chat.send(L('جهّز لي ملخص اليوم', 'Prepare my daily summary')) }, icon('spark'), L('ملخص اليوم', 'Daily summary')),
      h('button.btn.sm', { onclick: addWidgetDialog }, icon('plus'), t('dash.add')),
      h(`button.btn.sm${state.arranging ? '.primary' : ''}`, { onclick: () => { state.arranging = !state.arranging; root.dispatchEvent(new Event('rerender', { bubbles: true })); location.hash = '#/home'; window.dispatchEvent(new HashChangeEvent('hashchange')); } }, icon('drag'), state.arranging ? t('dash.done') : t('dash.arrange')),
      h('button.btn.sm', { onclick: restoreDialog }, icon('history'), t('dash.restore')))));

  const grid = h('div.grid', { class: state.arranging ? 'arranging' : '' });
  root.append(grid);
  const nextLayout = new Map();
  for (const w of dash.layout) {
    const sig = JSON.stringify(w);
    nextLayout.set(w.id, sig);
    const card = h(`section.card.size-${w.size || 'm'}`, { 'data-id': w.id, tabindex: -1, 'aria-label': widgetTitle(w) });
    if (state.selectedWidgetId === w.id) card.classList.add('selected');
    if (prevLayout.size && prevLayout.get(w.id) !== sig) card.classList.add('flash');
    const views = dash.types[w.type].views;
    const head = h('div.card-head', h('h4', widgetTitle(w)),
      h('div.card-tools',
        views.length > 1 ? views.map((v) => h('button.icon-btn', { title: L(...VIEW_NAMES[v]), 'aria-pressed': String(w.view === v), onclick: () => runTool('update_widget', { id: w.id, view: v }) }, icon(VIEW_ICONS[v]))) : null,
        h('button.icon-btn', { title: L('ناقش مع المساعد', 'Discuss with assistant'), onclick: () => { state.selectedWidgetId = w.id; document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected')); card.classList.add('selected'); Chat.refreshContext(); Chat.focus(L(`بخصوص بطاقة «${widgetTitle(w)}»: `, `About the "${widgetTitle(w)}" card: `)); } }, icon('chat')),
        h('button.icon-btn', { title: L('إزالة من الداشبورد', 'Remove from dashboard'), onclick: () => runTool('remove_widget', { id: w.id }) }, icon('x'))));
    card.append(head);
    const bodySlot = h('div', h('div.empty.small', '…'));
    card.append(bodySlot);
    grid.append(card);
    renderWidgetBody(w).then(({ body, source, updated_at }) => {
      bodySlot.replaceChildren(body);
      card.append(h('div.card-foot', h('span', `${t('dash.source')}: ${source || '—'}`), h('span', `${t('dash.updated')} ${fmtTime(updated_at)}`)));
    }).catch((e) => bodySlot.replaceChildren(h('div.empty.small', e.message)));
    if (state.arranging) enableDrag(card, grid);
  }
  prevLayout = nextLayout;
  if (!dash.layout.length) grid.append(h('div.card.size-l', h('div.empty', L('الداشبورد فارغ. أضف بطاقة أو استعد الإعداد الافتراضي.', 'Dashboard is empty. Add a card or reset to default.'))));
}

function enableDrag(card, grid) {
  card.draggable = true;
  card.addEventListener('dragstart', () => card.classList.add('dragging'));
  card.addEventListener('dragend', async () => {
    card.classList.remove('dragging');
    const order = [...grid.querySelectorAll('.card[data-id]')].map((c) => c.dataset.id);
    await runTool('reorder_widgets', { order });
  });
  grid.addEventListener('dragover', (e) => {
    e.preventDefault();
    const dragging = grid.querySelector('.dragging');
    if (!dragging) return;
    const after = [...grid.querySelectorAll('.card:not(.dragging)')].find((c) => { const b = c.getBoundingClientRect(); return e.clientY < b.top + b.height / 2 && e.clientX > b.left - 10; });
    after ? grid.insertBefore(dragging, after) : grid.append(dragging);
  });
  // keyboard alternative
  const move = (dir) => async () => {
    const ids = [...grid.querySelectorAll('.card[data-id]')].map((c) => c.dataset.id);
    const i = ids.indexOf(card.dataset.id); const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    await runTool('reorder_widgets', { order: ids });
  };
  card.querySelector('.card-tools').prepend(h('button.icon-btn', { title: L('للأعلى', 'Move up'), onclick: move(-1) }, icon('chevronL')), h('button.icon-btn', { title: L('للأسفل', 'Move down'), onclick: move(1) }, icon('chevron')));
}

async function addWidgetDialog() {
  const opts = [
    ['projects|{"delayed":true}|cards', L('المشاريع المتأخرة', 'Delayed projects')],
    ['projects|{}|bar', L('تقدم المشاريع (رسم)', 'Project progress (chart)')],
    ['tasks|{"mine":true,"open":true}|list', L('مهامي', 'My tasks')],
    ['tasks|{}|donut', L('المهام حسب الحالة (دائري)', 'Tasks by status (donut)')],
    ['week_progress|{}|bar', L('إنجاز هذا الأسبوع', 'This week')],
    ['kpi|{"metric":"avg_progress"}|stat', L('مؤشر: متوسط الإنجاز', 'KPI: avg progress')],
    ['kpi|{"metric":"overdue_tasks"}|stat', L('مؤشر: المهام المتأخرة', 'KPI: overdue tasks')],
    ['events|{}|list', L('المواعيد', 'Appointments')], ['alerts|{}|list', L('التنبيهات', 'Alerts')], ['documents|{}|list', L('آخر المستندات', 'Recent documents')], ['summary|{}|cards', L('ملخص اليوم', 'Daily summary')],
  ];
  const sel = h('select.field', opts.map(([v, l]) => h('option', { value: v }, l)));
  const v = await modal(t('dash.add'), h('div', h('label.lbl', L('نوع البطاقة', 'Card type')), sel), [{ label: t('cancel'), value: null }, { label: L('إضافة', 'Add'), value: 'ok', primary: true }]);
  if (!v) return;
  const [type, filters, view] = sel.value.split('|');
  const label = opts.find((o) => o[0] === sel.value)[1];
  await runTool('add_widget', { type, filters: JSON.parse(filters), view, title: type === 'kpi' ? undefined : label, size: type === 'kpi' ? 's' : 'm' });
}

async function restoreDialog() {
  const versions = await api('/api/dashboard/versions');
  const sel = h('select.field', h('option', { value: 'prev' }, L('الإعداد السابق مباشرة', 'The previous settings')), versions.map((v) => h('option', { value: v.version }, `v${v.version} · ${v.reason || ''} · ${new Date(v.created_at + 'Z').toLocaleString()}`)), h('option', { value: 'reset' }, L('الإعداد الافتراضي', 'Default layout')));
  const r = await modal(t('dash.restore'), h('div', h('p.small.muted', L('يغيّر طريقة العرض فقط ولا يمس البيانات. يمكن التراجع.', 'Changes the view only, never the data. Undoable.')), sel), [{ label: t('cancel'), value: null }, { label: t('restore'), value: 'ok', primary: true }]);
  if (!r) return;
  await runTool('restore_dashboard', sel.value === 'reset' ? { reset: true } : sel.value === 'prev' ? {} : { version: Number(sel.value) });
}
