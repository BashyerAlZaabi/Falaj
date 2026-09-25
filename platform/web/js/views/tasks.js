// Tasks (#/tasks[/mine|assigned|all|overdue|done]): filter tabs with counts,
// search, grouping (due date · project · priority), quick add, collapsible
// "Done". «كُلّفت بها» lists work other people gave me (who, project, due),
// with my time allocations to projects above it.
import { api } from '../api.js';
import { h, icon, menu, segmented, skeleton, emptyState } from '../ui.js';
import { L, fmtNum } from '../i18n.js';
import { state } from '../state.js';
import { taskRow, dueInfo, countText, PRIORITY, captureFocus, restoreFocus, quickAdd, searchBox, loadError, normalize, allocChip, periodText, pctText } from '../work-items.js';
import { newTask } from './projects.js';

const KEYS = ['mine', 'assigned', 'all', 'overdue', 'done'];
const QUERY = { mine: '?mine=1', all: '', overdue: '?overdue=1', done: '?status=done' };
// «كُلّفت بها»: tasks others gave me (+ my allocations), from /api/assignments
const fetchKey = (k) => (k === 'assigned' ? api('/api/assignments') : api(`/api/tasks${QUERY[k]}`));
// View state survives live (soft) refreshes; the filter is also in the URL (#/tasks/overdue).
const ui = { filter: null, q: '', group: 'due', doneOpen: false };

// [key, full label, short label for phones]
const FILTERS = () => [
  ['mine', L('مهامي المفتوحة', 'My open tasks'), L('مهامي', 'Mine')],
  ['assigned', L('كُلّفت بها من الآخرين', 'Assigned by others'), L('كُلّفت بها', 'Assigned')],
  ['all', ...(state.me?.user?.role === 'employee' ? [L('كل ما يخصني', 'All mine'), L('الكل', 'All')] : [L('مهام الفريق', 'Team tasks'), L('الفريق', 'Team')])],
  ['overdue', L('المتأخرة', 'Overdue')],
  ['done', L('المنجزة', 'Done')],
];
const tabLabel = (full, short) => (short ? [h('span.wk-lbl-long', full), h('span.wk-lbl-short', short)] : full);
const GROUPS = () => [['due', L('موعد الاستحقاق', 'Due date')], ['project', L('المشروع', 'Project')], ['priority', L('الأولوية', 'Priority')], ['by', L('من كلّفني', 'Assigned by')]];
const matches = (x, needle) => !needle || normalize([x.title, x.description, x.project_name, x.assignee_ar, x.assignee_en].filter(Boolean).join(' ')).includes(needle);

export async function renderTasks(root, params = [], { soft } = {}) {
  if (KEYS.includes(params[0])) ui.filter = params[0];
  else if (!ui.filter) ui.filter = 'mine';
  const page = h('div.wk.wk-tasks-page');
  root.append(page);
  const focus = soft ? captureFocus() : null;
  const load = Promise.all(KEYS.map(fetchKey));
  const retry = () => { page.remove(); renderTasks(root, [ui.filter]); };
  if (soft) {
    try { build(page, await load); } catch (e) { page.replaceChildren(head(), loadError(e, retry)); }
    restoreFocus(page, focus);
    return;
  }
  page.append(head(), h('div.wk-toolbar', { 'aria-hidden': 'true' }, h('div.sk.wk-sk-seg.wide'), h('div.sk.wk-sk-search')), h('section.card.wk-list-card', skeleton('list', 5)));
  load.then((lists) => build(page, lists), (e) => page.replaceChildren(head(), loadError(e, retry)));
}

function head() {
  return h('header.page-head.wk-head',
    h('div.wk-titles', h('h1', L('المهام', 'Tasks')), h('p.sub', L('ما هو مسند إليك وإلى فريقك، مجمّعاً حسب ما يحتاج انتباهك أولاً.', 'Work assigned to you and your team, grouped by what needs attention first.'))),
    h('div.actions', h('button.btn.primary.wk-new', { type: 'button', 'aria-label': L('مهمة جديدة', 'New task'), onclick: () => newTask(null) }, icon('plus'), h('span.wk-new-label', L('مهمة جديدة', 'New task')))));
}

function build(page, [mine, assigned, all, overdue, done]) {
  const lists = { mine: mine.filter((x) => x.status !== 'done'), assigned: assigned.tasks || [], all, overdue, done };
  const allocations = assigned.allocations || [];
  const results = h('section.card.wk-list-card');
  const live = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });
  const seg = segmented(FILTERS().map(([k, l, short]) => [k, tabLabel(l, short), 0]), ui.filter, (v) => {
    ui.filter = v;
    try { history.replaceState(history.state, '', `#/tasks/${v}`); } catch { /* ignore */ }
    draw();
  }, { label: L('تصفية المهام', 'Filter tasks') });
  const search = searchBox({ value: ui.q, key: 'tasks-search', placeholder: L('ابحث في المهام', 'Search tasks'), label: L('ابحث في المهام بالعنوان أو المشروع أو المسؤول', 'Search tasks by title, project or assignee'), onInput: (v) => { ui.q = v; draw(); } });
  const groupLabel = h('span.wk-sort-label');
  const groupBtn = h('button.btn.sm.ghost.wk-sort', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => menu(e.currentTarget, [{ title: L('تجميع حسب', 'Group by') }, ...GROUPS().map(([k, l]) => ({ label: l, checked: ui.group === k, onClick: () => { ui.group = k; draw(); } }))], { width: 220 }) }, icon('rows'), groupLabel);
  page.replaceChildren(head(), h('div.wk-toolbar', h('div.wk-filters', seg), h('div.wk-toolbar-end', search, groupBtn)), results, live);
  const demo = all.some((x) => x.is_demo) || mine.some((x) => x.is_demo);

  function draw() {
    const needle = normalize(ui.q.trim());
    const found = Object.fromEntries(KEYS.map((k) => [k, lists[k].filter((x) => matches(x, needle))]));
    for (const b of seg.querySelectorAll('button[data-v]')) { const c = b.querySelector('.count'); if (c) c.textContent = fmtNum(found[b.dataset.v].length); }
    const gName = (GROUPS().find(([k]) => k === ui.group) || GROUPS()[0])[1];
    groupLabel.textContent = `${L('تجميع:', 'Group:')} ${gName}`;
    groupBtn.setAttribute('aria-label', `${L('تجميع حسب', 'Group by')}: ${gName}`);
    groupBtn.hidden = ui.filter === 'done';
    const rows = found[ui.filter];
    live.textContent = L(`يُعرض ${countText(rows.length, 'task')}`, `Showing ${countText(rows.length, 'task')}`);
    const add = !['done', 'assigned'].includes(ui.filter) ? quickAdd({ key: 'quick-tasks', placeholder: L('أضف مهمة لك…', 'Add a task for yourself…'), label: L('أضف مهمة سريعة لك: اكتب العنوان واضغط Enter', 'Add a quick task for yourself: type a title and press Enter'), input: {} }) : null;
    const strip = ui.filter === 'assigned' && allocations.length && !needle ? allocationsStrip(allocations) : null;
    const foot = demo ? h('p.wk-demo-note', h('span.chip.demo.tiny', L('تجريبي', 'Demo')), L('بعض المهام بيانات تجريبية للعرض.', 'Some tasks are demo data.')) : null;
    if (!rows.length) { results.replaceChildren(...[add, strip, empty(found, needle, search)].filter(Boolean)); return; }
    results.replaceChildren(...[add, strip, ...grouped(rows).map(section), foot].filter(Boolean));
  }
  draw();
}

// ---------------------------------------------------------------- grouping
function grouped(rows) {
  if (ui.filter === 'done') return [{ key: 'done-all', rows }];
  const open = rows.filter((x) => x.status !== 'done');
  const done = rows.filter((x) => x.status === 'done');
  let gs;
  if (ui.group === 'project') {
    const by = new Map();
    for (const x of open) { const k = x.project_id || ''; if (!by.has(k)) by.set(k, { key: `p:${k}`, title: x.project_name || L('بلا مشروع', 'No project'), icon: k ? 'folder' : 'inbox', rows: [] }); by.get(k).rows.push(x); }
    gs = [...by.values()].sort((a, b) => (a.key === 'p:' ? 1 : b.key === 'p:' ? -1 : a.title.localeCompare(b.title)));
  } else if (ui.group === 'by') {
    const by = new Map();
    for (const x of open) { const k = x.assigner_ar ? x.assigned_by : ''; if (!by.has(k)) by.set(k, { key: `b:${k}`, title: x.assigner_ar ? L(x.assigner_ar, x.assigner_en) : L('أنشأها المسؤول بنفسه', 'Self-assigned'), icon: x.assigner_ar ? 'userCheck' : 'user', rows: [] }); by.get(k).rows.push(x); }
    gs = [...by.values()].sort((a, b) => (a.key === 'b:' ? 1 : b.key === 'b:' ? -1 : a.title.localeCompare(b.title)));
  } else if (ui.group === 'priority') {
    gs = ['urgent', 'high', 'medium', 'low'].map((k) => ({ key: k, title: L(PRIORITY[k][0], PRIORITY[k][1]), icon: k === 'urgent' ? 'zap' : 'flag', tone: PRIORITY[k][2], rows: open.filter((x) => (x.priority || 'medium') === k) }));
  } else {
    const bucket = (x) => { const d = dueInfo(x); if (!d) return 'none'; if (d.tone === 'crit') return 'overdue'; if (d.diff === 0) return 'today'; if (d.diff < 7) return 'week'; return 'later'; };
    const B = [['overdue', L('متأخرة', 'Overdue'), 'clock', 'crit'], ['today', L('اليوم', 'Today'), 'sun', 'warn'], ['week', L('الأيام السبعة القادمة', 'Next 7 days'), 'calendarDays', ''], ['later', L('لاحقاً', 'Later'), 'calendar', ''], ['none', L('بلا تاريخ استحقاق', 'No due date'), 'circleDashed', '']];
    gs = B.map(([k, title, ic, tone]) => ({ key: k, title, icon: ic, tone, rows: open.filter((x) => bucket(x) === k) }));
  }
  gs = gs.filter((g) => g.rows.length);
  // The Overdue tab grouped by due date is a single "Overdue" group — its header would only repeat the tab.
  if (ui.filter === 'overdue' && ui.group === 'due' && gs.length === 1 && !done.length) gs[0].plain = true;
  if (done.length) gs.push({ key: 'done', title: L('المنجزة', 'Done'), icon: 'checkCheck', rows: done, collapsible: true });
  return gs;
}

function section(g) {
  const list = h('ul.list.wk-tasks', { id: `wk-g-${g.key.replace(/[^\w-]/g, '_')}` }, g.rows.map((x) => taskRow(x)));
  if (!g.title || g.plain) return h('div.wk-group', list);
  if (g.collapsible) {
    const expanded = ui.doneOpen;
    list.hidden = !expanded;
    const toggle = h('button.wk-group-toggle', { type: 'button', 'aria-expanded': String(expanded), 'aria-controls': list.id, onclick: () => {
      ui.doneOpen = !ui.doneOpen; toggle.setAttribute('aria-expanded', String(ui.doneOpen)); list.hidden = !ui.doneOpen;
    } }, icon('chevronDown', 'sm wk-chev'), h('span', g.title), h('span.wk-group-count', fmtNum(g.rows.length)));
    return h('div.wk-group.wk-group-done', h('h2.wk-group-title', toggle), list);
  }
  return h('div.wk-group', { role: 'group', 'aria-label': g.title },
    h(`h2.wk-group-title${g.tone ? '.' + g.tone : ''}`, icon(g.icon || 'list', 'sm'), h('span', g.title), h('span.wk-group-count', fmtNum(g.rows.length))),
    list);
}

// ---------------------------------------------------------------- empty states
function empty(found, needle, search) {
  if (needle) {
    const elsewhere = KEYS.filter((k) => k !== ui.filter && found[k].length);
    return emptyState({ icon: 'search', title: L('لا نتائج في هذا التبويب', 'No results in this tab'), body: elsewhere.length ? L('توجد نتائج في تبويب آخر — راجع الأرقام أعلاه.', 'There are matches in another tab — check the counts above.') : L('جرّب كلمة أخرى أو امسح البحث.', 'Try another word or clear the search.'), actions: [{ label: L('مسح البحث', 'Clear search'), icon: 'x', onClick: () => search.clear() }] });
  }
  const go = (k) => () => document.querySelector(`.wk-tasks-page .tabs button[data-v="${k}"]`)?.click();
  const team = found.all.filter((x) => x.status !== 'done').length;
  const teamLabel = state.me?.user?.role === 'employee' ? L('عرض كل ما يخصني', 'Show all mine') : L('عرض مهام الفريق', 'Show team tasks');
  switch (ui.filter) {
    case 'mine': return emptyState({ icon: 'checkCheck', title: L('لا مهام مفتوحة مسندة إليك', 'No open tasks assigned to you'),
      body: team ? L(`أنجزت كل ما هو مسند إليك. في النطاق ${countText(team, 'task')} مفتوحة لدى آخرين.`, `You’re all caught up. ${countText(team, 'task')} are open for others in your scope.`) : L('أنجزت كل ما هو مسند إليك — أحسنت!', 'You’re all caught up — nice work!'),
      actions: team ? [{ label: teamLabel, icon: 'people', tertiary: true, onClick: go('all') }] : [] });
    case 'overdue': return emptyState({ icon: 'circleCheck', title: L('لا مهام متأخرة', 'Nothing overdue'), body: L('كل المهام ضمن نطاقك في مواعيدها.', 'Everything in your scope is on time.') });
    case 'assigned': return emptyState({ icon: 'userCheck', title: L('لا مهام أسندها إليك آخرون', 'Nothing assigned to you by others'), body: L('عندما يكلّفك مديرك أو إدارة المشاريع الاستراتيجية بمهمة، تظهر هنا مع اسم من كلّفك ومشروعها وموعدها.', 'When your manager or the Strategic Projects Office gives you a task, it appears here with who assigned it, the project and the due date.') });
    case 'done': return emptyState({ icon: 'listChecks', title: L('لم تُنجز مهام بعد', 'No completed tasks yet'), body: L('تظهر هنا المهام بعد تعليمها كمنجزة، ويمكنك إعادة فتحها في أي وقت.', 'Tasks appear here once marked done, and you can reopen them any time.') });
    default: return emptyState({ icon: 'inbox', title: L('لا مهام بعد', 'No tasks yet'), body: L('اكتب عنوان مهمة في الحقل أعلاه لتبدأ.', 'Type a task title above to get started.') });
  }
}

// My time allocations to projects (pending my manager / confirmed), above the list.
function allocationsStrip(list) {
  return h('section.tk-allocs', { 'aria-label': L('تخصيص وقتي للمشاريع', 'My time allocations') },
    h('h2.wk-group-title', icon('people', 'sm'), h('span', L('تخصيص وقتك للمشاريع', 'Your time on projects')), h('span.wk-group-count', fmtNum(list.length))),
    h('ul.tk-alloc-list', list.map((a) => h('li', h('a.tk-alloc', { href: `#/projects/${a.project_id}` },
      h('span.tk-alloc-pct', pctText(a.percent)),
      h('span.tk-alloc-main', h('span.tk-alloc-title', a.project_name), h('span.tk-alloc-meta', `${periodText(a.start_date, a.end_date)} · ${a.status === 'pending_manager' ? L(`بانتظار اعتماد ${(a.deciders || []).map((d) => d.name_ar).join('، ') || 'مديرك'}`, `awaiting ${(a.deciders || []).map((d) => d.name_en).join(', ') || 'your manager'}`) : L(`اقترحه ${a.allocated_by_ar}`, `by ${a.allocated_by_en}`)}`)),
      allocChip(a))))));
}
