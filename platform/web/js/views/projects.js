// Projects list (#/projects), the strategic portfolio (#/projects?view=portfolio),
// team capacity (#/projects?view=capacity), project detail (#/projects/:id) with
// allocations and milestones, and the sheets: new project / new task / new
// strategic project wizard / allocate / decide. Layout: css/pages/work.css (wk-*, pf-*).
import { api } from '../api.js';
import { h, icon, toast, confirmDialog, menu, segmented, skeleton, emptyState, dataTable, avatar, debounce } from '../ui.js';
import { L, t, fmtDate, fmtTime, fmtNum, getLang } from '../i18n.js';
import { state, emit } from '../state.js';
import { remember } from '../palette.js';
import * as Chat from '../chat.js';
import {
  projectCard, taskRow, runTool, progressBar, projectState, projectTone, progressGap, stateChip, countText, daysText, dayDiff, pctText,
  formSheet, formField, formGroup, choice, dateControl, assigneeSelect, projectOptions, textArea, quote, undoToast, PRIORITY, PRIORITY_ORDER,
  captureFocus, restoreFocus, quickAdd, searchBox, loadError, normalize, isoDate, longDate,
  isSpmoUser, canSeePortfolio, canSeeCapacity, strategicChip, fmtAED, fteText, ALLOC_STATUS, allocChip, periodText, loadMeter,
  staffDirectory, portfolioMeta, personSelect, percentControl,
} from '../work-items.js';

const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { /* storage unavailable */ } } };
// View state survives live (soft) refreshes and navigation within the session.
const ui = { filter: 'all', sort: 'due', q: '', view: store.get('swp.projects.view', 'grid') };
const names = new Map(); // project id → name, so the toolbar title is right before the data arrives

// ====================================================================== list
const FILTERS = () => [['all', L('الكل', 'All')], ['delayed', L('المتأخرة', 'Delayed')], ['missing', L('بلا نسبة إنجاز', 'No progress')]];
const FILTER_FN = { all: () => true, delayed: (p) => p.delayed, missing: (p) => p.progress == null };
const rank = (p) => (p.delayed ? 0 : p.at_risk ? 1 : p.progress == null ? 2 : 3);
const SORTS = () => [
  ['due', L('الاستحقاق — الأقرب أولاً', 'Due date — soonest first'), null],
  ['attention', L('الأحوج للمتابعة', 'Needs attention'), (a, b) => rank(a) - rank(b) || (b.days_overdue || 0) - (a.days_overdue || 0) || (progressGap(a)?.gap ?? 0) - (progressGap(b)?.gap ?? 0)],
  ['progress', L('الإنجاز — الأقل أولاً', 'Progress — lowest first'), (a, b) => (a.progress ?? 101) - (b.progress ?? 101)],
  ['updated', L('آخر تحديث للنسبة', 'Recently updated'), (a, b) => String(b.progress_updated_at || '').localeCompare(String(a.progress_updated_at || ''))],
  ['name', L('الاسم', 'Name'), (a, b) => a.name.localeCompare(b.name, getLang())],
];
const matches = (p, needle) => !needle || normalize([p.name, p.description, p.dept_ar, p.dept_en, p.owner_name_ar, p.owner_name_en].filter(Boolean).join(' ')).includes(needle);

export async function renderProjects(root, { soft, query } = {}) {
  const view = query?.view;
  if (view === 'portfolio' && canSeePortfolio()) return renderPortfolio(root, { soft });
  if (view === 'capacity' && canSeeCapacity()) return renderCapacity(root, { soft });
  const page = h('div.wk.wk-list-page');
  root.append(page);
  const focus = soft ? captureFocus() : null;
  const load = api('/api/projects');
  const retry = () => { page.remove(); renderProjects(root); };
  if (soft) {
    try { buildList(page, await load); } catch (e) { page.replaceChildren(listHead(null), loadError(e, retry)); }
    restoreFocus(page, focus);
    return;
  }
  page.append(listHead(null), viewTabs('all'), h('div.wk-toolbar', { 'aria-hidden': 'true' }, h('div.sk.wk-sk-seg'), h('div.sk.wk-sk-search')),
    h('ul.wk-grid', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل المشاريع', 'Loading projects') }, [0, 1, 2].map(() => h('li', h('div.card.wk-proj.wk-sk-card', skeleton('card'))))));
  load.then((list) => buildList(page, list), (e) => page.replaceChildren(listHead(null), loadError(e, retry)));
}

function listHead(list) {
  return h('header.page-head.wk-head',
    h('div.wk-titles',
      h('h1', L('المشاريع', 'Projects')),
      h('p.sub', list ? (list.length ? L(`${countText(list.length, 'project')} ضمن نطاقك`, `${countText(list.length, 'project')} in your scope`) : L('لا مشاريع ضمن نطاقك بعد', 'No projects in your scope yet')) : L('جارٍ التحميل…', 'Loading…'))),
    h('div.actions',
      isSpmoUser() ? h('button.btn.tertiary.pf-new-strategic', { type: 'button', onclick: () => newStrategicProject() }, icon('compass'), h('span', L('مشروع استراتيجي', 'Strategic project'))) : null,
      h('button.btn.primary.wk-new', { type: 'button', 'aria-label': L('مشروع جديد', 'New project'), onclick: () => newProject() }, icon('plus'), h('span.wk-new-label', L('مشروع جديد', 'New project')))));
}

// Views of the projects area (navigation links, hash-driven, survive reloads).
function viewTabs(active) {
  const views = [['all', L('كل المشاريع', 'All projects'), 'folder'],
    ...(canSeePortfolio() ? [['portfolio', L('المحفظة الاستراتيجية', 'Strategic portfolio'), 'compass']] : []),
    ...(canSeeCapacity() ? [['capacity', L('سعة الفريق', 'Team capacity'), 'gauge']] : [])];
  if (views.length < 2) return null;
  return h('nav.pf-views', { 'aria-label': L('عروض المشاريع', 'Project views') },
    views.map(([k, label, ic]) => h('a.pf-view', { href: k === 'all' ? '#/projects' : `#/projects?view=${k}`, 'aria-current': k === active ? 'page' : null }, icon(ic), h('span', label))));
}

function buildList(page, list) {
  for (const p of list) names.set(p.id, p.name);
  const results = h('div.wk-results');
  const live = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });
  const seg = segmented(FILTERS().map(([k, l]) => [k, l, 0]), ui.filter, (v) => { ui.filter = v; draw(); }, { label: L('تصفية المشاريع', 'Filter projects') });
  const search = searchBox({ value: ui.q, key: 'projects-search', placeholder: L('ابحث في المشاريع', 'Search projects'), label: L('ابحث في المشاريع بالاسم أو الإدارة أو المالك', 'Search projects by name, department or owner'), onInput: (v) => { ui.q = v; draw(); } });
  const sortLabel = h('span.wk-sort-label');
  const sortBtn = h('button.btn.sm.ghost.wk-sort', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => menu(e.currentTarget, [{ title: L('ترتيب حسب', 'Sort by') }, ...SORTS().map(([k, l]) => ({ label: l, checked: ui.sort === k, onClick: () => { ui.sort = k; draw(); } }))], { width: 240 }) }, icon('sort'), sortLabel);
  const viewBtn = (k, ic, label) => h('button.icon-btn', { type: 'button', 'aria-label': label, 'data-tip': label, 'data-tip-pos': 'bottom', 'aria-pressed': String(ui.view === k), 'data-view': k, onclick: () => { ui.view = k; store.set('swp.projects.view', k); viewGroup.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === k))); draw(); } }, icon(ic));
  const viewGroup = h('div.wk-view', { role: 'group', 'aria-label': L('طريقة العرض', 'View') }, viewBtn('grid', 'grid', L('بطاقات', 'Cards')), viewBtn('table', 'table', L('جدول', 'Table')));
  page.replaceChildren(listHead(list), viewTabs('all'),
    h('div.wk-toolbar', h('div.wk-filters', seg), h('div.wk-toolbar-end', search, sortBtn, viewGroup)),
    results, live);

  function draw() {
    const needle = normalize(ui.q.trim());
    const found = list.filter((p) => matches(p, needle));
    for (const b of seg.querySelectorAll('button[data-v]')) { const c = b.querySelector('.count'); if (c) c.textContent = fmtNum(found.filter(FILTER_FN[b.dataset.v]).length); }
    const [, sortName, cmp] = SORTS().find(([k]) => k === ui.sort) || SORTS()[0];
    sortLabel.textContent = `${L('ترتيب:', 'Sort:')} ${sortName.split(' — ')[0]}`;
    sortBtn.setAttribute('aria-label', `${L('ترتيب حسب', 'Sort by')}: ${sortName}`);
    const rows = found.filter(FILTER_FN[ui.filter] || FILTER_FN.all);
    if (cmp) rows.sort(cmp);
    live.textContent = L(`يُعرض ${countText(rows.length, 'project')}`, `Showing ${countText(rows.length, 'project')}`);
    if (!list.length) {
      results.replaceChildren(h('section.card', emptyState({ icon: 'folder', title: L('لا مشاريع ضمن نطاقك بعد', 'No projects in your scope yet'), body: L('أنشئ مشروعاً لتتابع إنجازه ومهامه وفريقه في مكان واحد.', 'Create a project to track its progress, tasks and team in one place.'), actions: [{ label: L('إنشاء مشروع', 'Create a project'), icon: 'folderPlus', primary: true, onClick: () => newProject() }] })));
    } else if (!rows.length) {
      const reset = () => { ui.filter = 'all'; seg.querySelector('button[data-v="all"]')?.click(); };
      results.replaceChildren(h('section.card', needle && !found.length
        ? emptyState({ icon: 'search', title: L(`لا نتائج لـ${quote(ui.q.trim())}`, `No results for ${quote(ui.q.trim())}`), body: L('جرّب كلمة أخرى، أو ابحث باسم الإدارة أو المالك.', 'Try another word, or search by department or owner.'), actions: [{ label: L('مسح البحث', 'Clear search'), icon: 'x', onClick: () => search.clear() }] })
        : ui.filter === 'delayed'
          ? emptyState({ icon: 'circleCheck', title: L('لا مشاريع متأخرة', 'No delayed projects'), body: L('كل المشاريع المعروضة تسير ضمن مواعيدها.', 'Every project shown is on schedule.'), actions: [{ label: L('عرض كل المشاريع', 'Show all projects'), onClick: reset }] })
          : emptyState({ icon: 'circleCheck', title: L('كل المشاريع لديها نسبة إنجاز مسجّلة', 'Every project has reported progress'), body: L('لا يوجد مشروع ينتظر تسجيل نسبة إنجازه.', 'No project is waiting for a progress update.'), actions: [{ label: L('عرض كل المشاريع', 'Show all projects'), onClick: reset }] })));
    } else if (ui.view === 'table') {
      results.replaceChildren(h('section.card.wk-table-card', dataTable({
        rows, caption: L('المشاريع', 'Projects'),
        onRow: (p) => { state.selectedProjectId = p.id; state.projectName = p.name; location.hash = `#/projects/${p.id}`; },
        columns: [
          { key: 'name', label: L('المشروع', 'Project'), sort: (p) => p.name, render: (p) => h('div.wk-cell-name', h('a.wk-cell-title', { href: `#/projects/${p.id}`, onclick: () => { state.projectName = p.name; } }, p.name), h('span.wk-cell-sub', L(p.dept_ar, p.dept_en))) },
          { key: 'progress', label: L('الإنجاز', 'Progress'), sort: (p) => p.progress ?? -1, render: (p) => h('div.wk-cell-prog', progressBar(p.progress, { tone: projectTone(p) }), h('span.wk-cell-pct', p.progress == null ? L('لم تُسجَّل', 'n/a') : pctText(p.progress))) },
          { key: 'due', label: L('الاستحقاق', 'Due'), sort: (p) => p.due_date || '9999', render: (p) => (p.due_date ? fmtDate(p.due_date) : '—') },
          { key: 'state', label: L('الحالة', 'Status'), sort: rank, render: (p) => stateChip(projectState(p)) },
          { key: 'updated', label: L('آخر تحديث', 'Updated'), sort: (p) => p.progress_updated_at || '', render: (p) => (p.progress_updated_at ? fmtDate(p.progress_updated_at) : '—') },
        ],
      })));
    } else {
      results.replaceChildren(h('ul.wk-grid', { 'aria-label': L('المشاريع', 'Projects') }, rows.map(projectCard)));
    }
  }
  draw();
}

// ====================================================================== detail
let progressDraft = null; // { id, base, value } — survives a live refresh while typing

export async function renderProject(root, id, { soft } = {}) {
  state.selectedProjectId = id;
  if (!soft) state.projectName = names.get(id) || null;
  const page = h('div.wk.wk-detail');
  root.append(page);
  const focus = soft ? captureFocus() : null;
  const load = api(`/api/projects/${encodeURIComponent(id)}`);
  if (soft) {
    try { buildProject(page, await load); } catch (e) { page.replaceChildren(projectError(e, root, id)); }
    restoreFocus(page, focus);
    return;
  }
  page.append(detailSkeleton());
  load.then((p) => {
    buildProject(page, p);
    if (location.hash === `#/projects/${id}`) { // title + recents now that the name is known
      const vt = document.getElementById('view-title'); if (vt) vt.textContent = p.name;
      remember(location.hash, `${t('nav.projects')} › ${p.name}`);
      Chat.refreshContext();
    }
  }, (e) => page.replaceChildren(projectError(e, root, id)));
}

function projectError(e, root, id) {
  const missing = e?.status === 404 || e?.status === 403;
  return h('section.card.wk-error-card', emptyState({
    icon: missing ? 'lock' : 'circleAlert', error: true, title: L('تعذّر التحميل', 'Could not load'),
    body: missing ? L('المشروع غير موجود أو ليس ضمن نطاق صلاحياتك.', 'This project doesn’t exist or isn’t within your permissions.') : (e?.message || String(e || '')),
    actions: [
      missing ? null : { label: L('إعادة المحاولة', 'Try again'), icon: 'refresh', primary: true, onClick: () => { root.replaceChildren(); renderProject(root, id); } },
      { label: L('العودة إلى المشاريع', 'Back to projects'), icon: 'folder', onClick: () => { location.hash = '#/projects'; } },
    ].filter(Boolean),
  }));
}

function detailSkeleton() {
  return h('div.wk-sk-detail', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل المشروع', 'Loading project') },
    h('div.wk-sk-head', h('div.sk.sk-line.w-40'), h('div.sk.wk-sk-title'), h('div.sk.sk-line.w-60')),
    h('div.wk-detail-grid', h('div.card', skeleton('stat')), h('div.card', skeleton('card'))),
    h('div.card.wk-tasks-card', skeleton('list', 4)));
}

function buildProject(page, p) {
  state.selectedProjectId = p.id; state.projectName = p.name; names.set(p.id, p.name);
  const s = projectState(p);
  const head = h('header.page-head.wk-head.wk-detail-head',
    h('div.wk-titles',
      h('span.eyebrow.wk-eyebrow', icon(p.is_strategic ? 'compass' : 'building', 'sm'), p.is_strategic ? L(`مشروع استراتيجي · ${p.dept_ar}`, `Strategic project · ${p.dept_en}`) : L(p.dept_ar, p.dept_en) || L('مشروع', 'Project')),
      h('h1', p.name),
      h('div.wk-head-chips', stateChip(s, { tiny: false }), p.is_strategic ? strategicChip(false) : null, p.is_demo ? h('span.chip.demo', t('demo')) : null, !p.can_edit ? h('span.chip.outline', icon('lock'), L('اطلاع فقط', 'View only')) : null),
      p.description ? h('p.sub', p.description) : null),
    h('div.actions',
      h('button.btn.tertiary.wk-ask', { type: 'button', onclick: () => Chat.focus(L('بخصوص هذا المشروع: ', 'About this project: ')) }, icon('spark'), L('ناقش مع المساعد', 'Discuss with assistant')),
      moreButton(p)));
  page.replaceChildren(head, prompts(p), h('div.wk-detail-grid', progressCard(p), detailsCard(p)),
    p.is_strategic || (p.allocations || []).length || (p.milestones || []).length ? h('div.wk-detail-grid.pf-detail-grid', allocationsCard(p), milestonesCard(p)) : null,
    tasksCard(p));
}

// Suggested questions prefill Ask AI (nothing is sent until the user confirms).
function prompts(p) {
  const qs = p.delayed ? [L('لماذا تأخر هذا المشروع؟', 'Why is this project late?'), L('اقترح خطة لاستعادة الجدول', 'Suggest a plan to get back on schedule')]
    : p.at_risk ? [L('ما الذي يعرّض هذا المشروع للتأخر؟', 'What is putting this project at risk?'), L('اقترح خطة لاستعادة الجدول', 'Suggest a plan to get back on schedule')]
      : p.progress == null ? [L('كيف أقدّر نسبة إنجاز هذا المشروع؟', 'How should I estimate this project’s progress?'), L('لخّص وضع هذا المشروع', 'Summarise where this project stands')]
        : [L('لخّص وضع هذا المشروع', 'Summarise where this project stands'), L('ما أولويات هذا الأسبوع في المشروع؟', 'What should this project focus on this week?')];
  return h('div.wk-prompts', { role: 'group', 'aria-label': L('أسئلة مقترحة للمساعد', 'Suggested questions for the assistant') },
    h('span.wk-prompts-label', icon('sparkle', 'sm'), L('اسأل المساعد', 'Ask the assistant')),
    qs.map((text) => h('button.chip.wk-prompt', { type: 'button', onclick: () => Chat.focus(text) }, text)));
}

function moreButton(p) {
  const label = L('إجراءات المشروع', 'Project actions');
  return h('button.icon-btn.wk-more', { type: 'button', 'aria-label': label, 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => menu(e.currentTarget, [
    p.can_edit ? { label: L('تعديل التفاصيل…', 'Edit details…'), icon: 'pencil', onClick: () => editProject(p) } : null,
    { label: L('نسخ رابط المشروع', 'Copy project link'), icon: 'link', onClick: () => copyLink(p) },
    p.can_edit ? { sep: true } : null,
    p.can_edit ? { label: L('حذف المشروع…', 'Delete project…'), icon: 'trash', danger: true, onClick: () => del(p) } : null,
  ], { width: 230 }) }, icon('more'));
}
function copyLink(p) {
  const url = `${location.origin}${location.pathname}#/projects/${p.id}`;
  (navigator.clipboard?.writeText(url) || Promise.reject()).then(
    () => toast(L(`نُسخ رابط ${quote(p.name)}`, `Copied the link to ${quote(p.name)}`)),
    () => toast(L('تعذّر النسخ — انسخ الرابط من شريط العنوان', 'Couldn’t copy — use the address bar'), { kind: 'error' }));
}

// ---------------------------------------------------------------- progress
function progressCard(p) {
  const gap = progressGap(p);
  const expected = p.status === 'active' ? p.expected_progress : null;
  const figure = h('div.wk-hero',
    p.progress == null
      ? h('div.wk-hero-num.is-missing', L('لم تُسجَّل', 'Not reported'))
      : h('div.wk-hero-num', h('bdi', fmtNum(p.progress)), h('span.wk-hero-unit', '%')),
    h('div.wk-hero-side',
      gap ? h(`span.chip.${gap.tone}`, icon(gap.gap <= -5 ? 'trendDown' : gap.gap >= 5 ? 'trendUp' : 'circleCheck'), gap.text) : null,
      expected != null ? h('span.wk-hero-exp', h('i.wk-exp-key', { 'aria-hidden': 'true' }), `${L('المتوقع زمنياً', 'Time-elapsed expectation')} ${pctText(expected)} · ${L('للاسترشاد', 'reference only')}`) : null));
  return h('section.card.wk-progress-card', { 'aria-labelledby': `wk-prog-${p.id}` },
    h('div.card-head', h('h2.card-title', { id: `wk-prog-${p.id}` }, L('نسبة الإنجاز', 'Progress'))),
    figure,
    progressBar(p.progress, { tone: projectTone(p), expected, lg: true }),
    p.progress_mode === 'tasks'
      ? h('div.pf-auto-note', icon('listChecks', 'sm'), h('span', p.tasks_total ? L(`تُحسب تلقائياً من المهام: ${fmtNum(p.tasks_done)} من ${fmtNum(p.tasks_total)} منجزة. تتحدّث فور إنجاز أي مهمة وتظهر على داشبورد المعنيين.`, `Computed from tasks: ${p.tasks_done} of ${p.tasks_total} done. Updates the moment a task is completed, on everyone’s dashboard.`)
        : L('تُحسب تلقائياً من المهام المنجزة؛ أضف مهام المشروع لتبدأ النسبة بالظهور.', 'Computed from completed tasks; add the project’s tasks to start the measure.')),
      p.can_edit ? h('button.btn.sm.ghost', { type: 'button', onclick: () => editProject(p) }, L('تغيير طريقة الاحتساب', 'Change')) : null)
      : p.can_edit ? progressEditor(p) : null,
    h('p.wk-stamp', icon('clock', 'sm'), p.progress_updated_at
      ? `${L('آخر تحديث للنسبة', 'Progress updated')} ${fmtDate(p.progress_updated_at)} ${fmtTime(p.progress_updated_at)} · ${L('المصدر: بيانات المشروع', 'Source: project record')}`
      : L('لم تُسجَّل نسبة إنجاز بعد — لا تُحتسب صفراً.', 'No progress reported yet — it isn’t counted as zero.')));
}

function progressEditor(p) {
  const base = p.progress;
  const draft = progressDraft?.id === p.id && progressDraft.base === base ? progressDraft.value : null;
  const start = draft ?? (base == null ? '' : String(base));
  const errId = `wk-prog-err-${p.id}`;
  const num = h('input.field.wk-prog-input', { type: 'number', min: 0, max: 100, step: 1, inputmode: 'numeric', value: start, placeholder: '—', 'data-refocus': 'progress', 'aria-describedby': errId });
  const range = h('input.wk-range', { type: 'range', min: 0, max: 100, step: 1, value: start === '' ? 0 : start, 'aria-label': L('نسبة الإنجاز — منزلق', 'Progress slider') });
  const err = h('div.error-text', { id: errId, hidden: true });
  const save = h('button.btn.sm.primary', { type: 'submit' }, t('save'));
  const cancel = h('button.btn.sm.ghost', { type: 'button', onclick: () => reset() }, t('cancel'));
  const form = h('form.wk-prog-edit', { novalidate: true },
    h('label.lbl', { for: `wk-prog-in-${p.id}` }, L('تحديث النسبة', 'Update progress')),
    h('div.wk-prog-row', range, h('div.wk-prog-num', num, h('span.wk-prog-pct', { 'aria-hidden': 'true' }, '%')), h('div.wk-prog-actions', cancel, save)),
    err);
  num.id = `wk-prog-in-${p.id}`;
  const fill = () => range.style.setProperty('--wk-fill', `${Math.max(0, Math.min(100, Number(num.value) || 0))}%`);
  const sync = () => {
    const dirty = num.value !== (base == null ? '' : String(base));
    form.classList.toggle('is-dirty', dirty);
    save.disabled = !dirty;
    range.setAttribute('aria-valuetext', num.value === '' ? L('غير محدد', 'Not set') : `${num.value}%`);
    progressDraft = dirty ? { id: p.id, base, value: num.value } : null;
    fill();
  };
  const showErr = (msg) => { err.replaceChildren(...(msg ? [icon('circleAlert', 'sm'), msg] : [])); err.hidden = !msg; msg ? num.setAttribute('aria-invalid', 'true') : num.removeAttribute('aria-invalid'); };
  function reset() { num.value = base == null ? '' : String(base); range.value = base ?? 0; showErr(null); sync(); }
  num.addEventListener('input', () => { if (num.value !== '') range.value = num.value; showErr(null); sync(); });
  num.addEventListener('keydown', (e) => { if (e.key === 'Escape' && form.classList.contains('is-dirty')) { e.stopPropagation(); reset(); } });
  range.addEventListener('input', () => { num.value = range.value; showErr(null); sync(); });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!form.classList.contains('is-dirty') || save.classList.contains('is-loading')) return;
    const v = num.value === '' ? null : Number(num.value);
    if (v == null || !Number.isInteger(v) || v < 0 || v > 100) { showErr(L('أدخل رقماً صحيحاً من 0 إلى 100', 'Enter a whole number from 0 to 100')); num.focus(); return; }
    save.classList.add('is-loading'); cancel.disabled = true;
    const r = await runTool('update_project', { id: p.id, progress: v }, { quiet: true, raw: true });
    save.classList.remove('is-loading'); cancel.disabled = false;
    if (!r || r.status === 'error') { showErr(r?.error || L('تعذّر الحفظ', 'Could not save')); return; }
    progressDraft = null;
    undoToast(L(`حُدّثت نسبة إنجاز ${quote(p.name)} إلى ${pctText(v)}`, `${quote(p.name)} progress set to ${v}%`), r);
    emit('data-changed', { entity: 'project', id: p.id });
  });
  sync();
  return form;
}

// ---------------------------------------------------------------- details
function detailsCard(p) {
  const members = p.members || [];
  const owner = L(p.owner_name_ar, p.owner_name_en);
  const d = dayDiff(p.due_date);
  const timing = !p.due_date || p.status !== 'active' ? null
    : d > 1 ? L(`يستحق بعد ${daysText(d)}`, `Due in ${daysText(d)}`)
      : d === 1 ? L('يستحق غداً', 'Due tomorrow') : d === 0 ? L('يستحق اليوم', 'Due today') : L(`تجاوز الموعد بـ${daysText(-d)}`, `${daysText(-d)} past due`);
  const row = (ic, label, value, sub, tone) => h('div.wk-info-row',
    h('span.wk-info-icon', { 'aria-hidden': 'true' }, icon(ic)),
    h('div.wk-info-text', h('dt', label), h('dd', value, sub ? h(`span.wk-info-sub${tone ? '.' + tone : ''}`, sub) : null)));
  const shown = members.slice(0, 5);
  return h('section.card.wk-details-card', { 'aria-labelledby': `wk-det-${p.id}` },
    h('div.card-head', h('h2.card-title', { id: `wk-det-${p.id}` }, L('تفاصيل المشروع', 'Details'))),
    h('dl.wk-info',
      row('building', L('الإدارة', 'Department'), L(p.dept_ar, p.dept_en) || '—'),
      row('user', L('المالك', 'Owner'), owner ? h('span.wk-person', avatar(p.owner_name_ar || owner), owner) : '—'),
      row('calendarDays', L('الفترة', 'Period'), period(p), timing, d != null && d < 0 && p.status === 'active' ? 'crit' : ''),
      p.is_strategic ? row('badgeCheck', L('الراعي', 'Sponsor'), p.sponsor_name_ar ? h('span.wk-person', avatar(p.sponsor_name_ar), L(p.sponsor_name_ar, p.sponsor_name_en)) : '—', p.initiative_ref ? L(`المبادرة: ${p.initiative_ref}`, `Initiative: ${p.initiative_ref}`) : null) : null,
      p.budget != null || p.is_strategic ? row('wallet', L('الميزانية', 'Budget'), p.budget != null ? fmtAED(p.budget) : L('غير محددة', 'Not set')) : null,
      row('people', L('الأعضاء', 'Members'), members.length
        ? h('span.wk-members',
          h('span.wk-avatars', shown.map((m) => avatar(m.name_ar)), members.length > shown.length ? h('span.avatar.wk-more-avatars', `+${members.length - shown.length}`) : null),
          h('span.wk-member-names', members.map((m) => L(m.name_ar, m.name_en)).join(L('، ', ', '))))
        : L('لا أعضاء بعد', 'No members yet'))));
}

function period(p) {
  if (p.start_date && p.due_date) return L(`من ${fmtDate(p.start_date)} إلى ${fmtDate(p.due_date)}`, `${fmtDate(p.start_date)} – ${fmtDate(p.due_date)}`);
  if (p.due_date) return L(`حتى ${fmtDate(p.due_date)}`, `Until ${fmtDate(p.due_date)}`);
  if (p.start_date) return L(`من ${fmtDate(p.start_date)} · بلا تاريخ استحقاق`, `From ${fmtDate(p.start_date)} · no due date`);
  return '—';
}

// ---------------------------------------------------------------- tasks
const doneOpen = new Set(); // project ids whose "Done" section is expanded
function tasksCard(p) {
  const tasks = p.tasks || [];
  const open = tasks.filter((x) => x.status !== 'done');
  const done = tasks.filter((x) => x.status === 'done');
  const total = p.tasks_total ?? tasks.length; const finished = p.tasks_done ?? done.length;
  const ratio = total ? Math.round((finished / total) * 100) : null;
  const titleId = `wk-tasks-${p.id}`;
  const row = (x) => taskRow(x, { hideProject: true });
  let doneList = null;
  if (done.length) {
    const expanded = doneOpen.has(p.id) || !open.length;
    const list = h('ul.list.wk-tasks', { id: `wk-done-${p.id}`, hidden: !expanded }, done.map(row));
    const toggle = h('button.wk-group-toggle', { type: 'button', 'aria-expanded': String(expanded), 'aria-controls': list.id, onclick: () => {
      const on = toggle.getAttribute('aria-expanded') !== 'true';
      toggle.setAttribute('aria-expanded', String(on)); list.hidden = !on; on ? doneOpen.add(p.id) : doneOpen.delete(p.id);
    } }, icon('chevronDown', 'sm wk-chev'), h('span', L('المنجزة', 'Done')), h('span.wk-group-count', fmtNum(done.length)));
    doneList = h('div.wk-group.wk-group-done', h('h3.wk-group-title', toggle), list);
  }
  return h('section.card.wk-tasks-card', { 'aria-labelledby': titleId },
    h('div.card-head.wk-tasks-head',
      h('div.wk-tasks-titles',
        h('h2.card-title', { id: titleId }, L('المهام', 'Tasks')),
        total ? h('span.wk-tasks-sum', L(`${fmtNum(finished)} من ${fmtNum(total)} منجزة`, `${finished} of ${total} done`)) : null),
      total ? h('div.wk-tasks-meter', progressBar(ratio, { tone: ratio === 100 ? 'good' : '', label: L('المهام المنجزة', 'Tasks done') })) : null,
      p.can_edit ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => newTask(p) }, icon('plus'), L('مهمة', 'Task')) : null),
    p.can_edit ? quickAdd({ key: `quick-${p.id}`, placeholder: L('أضف مهمة…', 'Add a task…'), label: L(`أضف مهمة إلى ${quote(p.name)}: اكتب العنوان واضغط Enter`, `Add a task to ${quote(p.name)}: type a title and press Enter`), input: { project_id: p.id } }) : null,
    tasks.length
      ? [open.length ? h('ul.list.wk-tasks', open.map(row)) : h('p.wk-all-done', icon('checkCheck', 'sm'), L('أُنجزت كل المهام المفتوحة', 'All open tasks are done')), doneList]
      : emptyState({ compact: true, icon: 'listTodo', title: L('لا مهام في هذا المشروع بعد', 'No tasks in this project yet'),
        body: p.can_edit ? L('اكتب عنوان أول مهمة في الحقل أعلاه، أو استخدم زر «مهمة» لإضافة التفاصيل.', 'Type the first task above, or use the “Task” button to add details.') : L('ستظهر هنا مهام المشروع عند إضافتها.', 'Tasks appear here once they’re added.') }));
}

// ---------------------------------------------------------------- edit details
const PROJECT_STATUS = () => [['active', L('نشط', 'Active')], ['on_hold', L('متوقف مؤقتاً', 'On hold')], ['done', L('مكتمل', 'Completed')], ['cancelled', L('ملغى', 'Cancelled')]];
async function editProject(p) {
  const name = h('input.field', { value: p.name, maxlength: 120, autocomplete: 'off' });
  const start = dateControl({ value: p.start_date || '', label: L('تاريخ البدء', 'Start date') });
  const due = dateControl({ value: p.due_date || '', label: L('تاريخ الاستحقاق', 'Due date') });
  const status = choice(PROJECT_STATUS(), p.status || 'active', { label: L('حالة المشروع', 'Project status') });
  const desc = textArea(p.description || '', { placeholder: L('الهدف والنطاق باختصار', 'Goal and scope, briefly') });
  const mode = choice([['manual', L('يحدّثها المالك', 'Reported by the owner')], ['tasks', L('تلقائياً من المهام', 'Automatic from tasks')]], p.progress_mode || 'manual', { label: L('طريقة احتساب الإنجاز', 'Progress measure') });
  const budget = h('input.field.pf-money', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: p.budget ?? '', placeholder: '0' });
  const ref = h('input.field', { maxlength: 160, autocomplete: 'off', value: p.initiative_ref || '', placeholder: L('مثال: م.ت 2.2 — الخدمات الاستباقية', 'e.g. SO 2.2 — Proactive services') });
  const governs = p.is_strategic && isSpmoUser();
  const sponsor = governs ? h('select.field', h('option', { value: p.sponsor_id || '' }, L(p.sponsor_name_ar, p.sponsor_name_en) || '—')) : null;
  if (sponsor) portfolioMeta().then((m) => { const cur = p.sponsor_id; sponsor.replaceChildren(...m.sponsors.map((u) => h('option', { value: u.id }, L(u.name_ar, u.name_en)))); if (cur && !m.sponsors.some((u) => u.id === cur)) sponsor.prepend(h('option', { value: cur }, L(p.sponsor_name_ar, p.sponsor_name_en))); sponsor.value = cur || ''; }).catch(() => {});
  const body = h('div.wk-form',
    formField(L('اسم المشروع', 'Project name'), name, { required: true }),
    h('div.wk-form-grid', formGroup(optional(L('تاريخ البدء', 'Start date')), start), formGroup(optional(L('تاريخ الاستحقاق', 'Due date')), due)),
    formGroup(L('الحالة', 'Status'), status),
    formGroup(L('نسبة الإنجاز', 'Progress'), mode),
    h('div.wk-form-grid', formField(optional(L('الميزانية (درهم)', 'Budget (AED)')), budget), formField(optional(L('مرجع المبادرة الاستراتيجية', 'Strategy initiative reference')), ref)),
    sponsor ? formField(L('راعي المشروع', 'Sponsor'), sponsor) : null,
    formField(optional(L('الوصف', 'Description')), desc),
    h('p.wk-sheet-meta', L('«تلقائياً من المهام»: النسبة = المهام المنجزة ÷ كل المهام، وتتحدّث فور إنجاز أي مهمة. «يحدّثها المالك»: من بطاقة «نسبة الإنجاز».', '“Automatic”: progress = done tasks ÷ all tasks, updated the moment a task is completed. “Reported”: set it from the Progress card.')));
  const r = await formSheet({
    title: L('تعديل تفاصيل المشروع', 'Edit project details'), body, wide: true, submitLabel: t('save'), autofocus: false,
    isValid: () => name.value.trim().length >= 2,
    onSubmit: async (ctl) => {
      const input = { id: p.id };
      if (name.value.trim() !== p.name) input.name = name.value.trim();
      if ((start.value || null) !== (p.start_date || null)) input.start_date = start.value || null;
      if ((due.value || null) !== (p.due_date || null)) input.due_date = due.value || null;
      if (status.value !== p.status) input.status = status.value;
      if (desc.value.trim() !== (p.description || '')) input.description = desc.value.trim();
      if (mode.value !== (p.progress_mode || 'manual')) input.progress_mode = mode.value;
      const b = budget.value === '' ? null : Number(budget.value);
      if (b !== (p.budget ?? null)) input.budget = b;
      if ((ref.value.trim() || null) !== (p.initiative_ref || null)) input.initiative_ref = ref.value.trim() || null;
      if (sponsor && sponsor.value && sponsor.value !== p.sponsor_id) input.sponsor_id = sponsor.value;
      if (Object.keys(input).length === 1) return true; // nothing changed
      const res = await runTool('update_project', input, { quiet: true, raw: true });
      if (!res || res.status === 'error') { ctl.setError(res?.error || L('تعذّر الحفظ', 'Could not save')); return undefined; }
      return res;
    },
  });
  if (!r || r === true) return;
  const nn = r.result?.name || p.name;
  names.set(p.id, nn); state.projectName = nn;
  undoToast(L(`حُفظت تفاصيل ${quote(nn)}`, `Saved details for ${quote(nn)}`), r);
  emit('data-changed', { entity: 'project', id: p.id });
}

// ---------------------------------------------------------------- delete
async function del(p) {
  const r = await runTool('delete_project', { id: p.id }, { quiet: true });
  if (r?.status !== 'needs_confirmation') return;
  const ok = await confirmDialog(L('حذف المشروع نهائياً؟', 'Delete this project permanently?'),
    `${r.confirmation.summary}. ${L('لا يمكن التراجع عن ذلك.', 'This can’t be undone.')}`,
    { danger: true, confirmLabel: L('حذف المشروع', 'Delete project') });
  const res = await api(`/api/confirmations/${r.confirmation.id}`, { method: 'POST', body: { accept: !!ok } }).catch((e) => e.body || { status: 'error', error: e.message });
  if (!ok) return;
  if (res?.status === 'ok') {
    names.delete(p.id);
    toast(L(`حُذف المشروع ${quote(p.name)}`, `Deleted ${quote(p.name)}`));
    location.hash = '#/projects';
    emit('data-changed', {});
  } else toast(res?.error || L('تعذّر الحذف', 'Could not delete'), { kind: 'error' });
}

// ====================================================================== sheets
export async function newProject() {
  const name = h('input.field', { maxlength: 120, autocomplete: 'off', placeholder: L('مثال: أتمتة طلبات الإجازات', 'e.g. Leave request automation') });
  const due = dateControl({ label: L('تاريخ الاستحقاق', 'Due date'), allowPast: false });
  const desc = textArea('', { placeholder: L('الهدف والنطاق باختصار', 'Goal and scope, briefly') });
  const body = h('div.wk-form',
    formField(L('اسم المشروع', 'Project name'), name, { required: true }),
    formGroup(optional(L('تاريخ الاستحقاق', 'Due date')), due),
    formField(optional(L('الوصف', 'Description')), desc),
    h('div.callout.wk-note', icon('info'), h('span', L('لا تُسجَّل نسبة إنجاز افتراضية؛ حدّدها لاحقاً من صفحة المشروع عند توفرها.', 'No default progress is recorded; set it on the project page once it’s known.'))));
  const r = await formSheet({
    title: L('مشروع جديد', 'New project'), body, submitLabel: L('إنشاء', 'Create'),
    isValid: () => name.value.trim().length >= 2,
    onSubmit: async (ctl) => {
      const res = await runTool('create_project', { name: name.value.trim(), due_date: due.value || undefined, description: desc.value.trim() || undefined }, { quiet: true, raw: true });
      if (!res || res.status === 'error') { ctl.setError(res?.error || L('تعذّر إنشاء المشروع', 'Could not create the project')); return undefined; }
      return res;
    },
  });
  if (!r?.result?.id) return;
  undoToast(L(`أُنشئ المشروع ${quote(r.result.name)}`, `Created ${quote(r.result.name)}`), r);
  names.set(r.result.id, r.result.name); state.projectName = r.result.name; state.selectedProjectId = r.result.id;
  location.hash = `#/projects/${r.result.id}`;
}
const optional = (label) => [label, h('span.wk-opt', L('اختياري', 'Optional'))];

// In a strategic project the SPMO may assign anyone internal; the owner and the
// department's managers may also assign the people allocated to it. People
// allocated to the project are listed first.
function strategicAssignee(p) {
  const me = state.me.user;
  const allocated = (p.allocations || []).filter((a) => a.status === 'active').map((a) => ({ id: a.user_id, name_ar: a.person_ar, name_en: a.person_en, title_ar: a.person_title_ar, title_en: a.person_title_en }));
  const sel = h('select.field', { disabled: true, 'aria-busy': 'true' }, h('option', { value: me.id }, L(me.name_ar, me.name_en)));
  sel.loaded = false;
  Promise.all([staffDirectory(), isSpmoUser() ? null : api('/api/users/assignable')]).then(([dir, assignable]) => {
    const ok = assignable ? new Set([...assignable.map((u) => u.id), ...allocated.map((a) => a.id)]) : null;
    const pool = ok ? dir.filter((u) => ok.has(u.id)) : dir;
    const tmp = personSelect(pool, { first: allocated, firstLabel: L('الموارد المخصصة للمشروع', 'People allocated to the project') });
    sel.replaceChildren(...tmp.childNodes);
    sel.value = allocated[0]?.id || me.id;
    sel.loaded = true;
  }).catch(() => { /* keep "me" */ }).finally(() => { sel.disabled = false; sel.removeAttribute('aria-busy'); });
  return sel;
}

export async function newTask(p) {
  const here = !p && state.route === 'projects' && state.params?.[0] ? { id: state.params[0], name: state.projectName } : null;
  const ctx = p || here;
  const title = h('input.field', { maxlength: 200, autocomplete: 'off', placeholder: L('ما الذي يجب إنجازه؟', 'What needs to be done?') });
  const who = p?.is_strategic && (isSpmoUser() || p.can_allocate || p.owner_id === state.me?.user?.id) ? strategicAssignee(p) : assigneeSelect(state.me?.user?.id);
  const due = dateControl({ label: L('الاستحقاق', 'Due'), allowPast: false });
  const prio = choice(PRIORITY_ORDER.map((k) => [k, L(PRIORITY[k][0], PRIORITY[k][1]), PRIORITY[k][2]]), 'medium', { label: L('الأولوية', 'Priority') });
  const proj = h('select.field', h('option', { value: '' }, L('بلا مشروع', 'No project')), ctx ? h('option', { value: ctx.id, selected: true }, ctx.name || L('المشروع الحالي', 'Current project')) : null);
  proj.value = ctx?.id || '';
  projectOptions().then((list) => {
    const keep = proj.value;
    const opts = list.filter((x) => (x.status !== 'cancelled' && x.status !== 'done') || x.id === keep);
    if (keep && !opts.some((x) => x.id === keep)) opts.unshift({ id: keep, name: ctx?.name || keep });
    proj.replaceChildren(h('option', { value: '' }, L('بلا مشروع', 'No project')), ...opts.map((x) => h('option', { value: x.id }, x.name)));
    proj.value = keep;
  }).catch(() => { /* keep the current choice */ });
  const body = h('div.wk-form',
    formField(L('العنوان', 'Title'), title, { required: true }),
    h('div.wk-form-grid', formField(optional(L('المشروع', 'Project')), proj), formField(L('المسؤول', 'Assignee'), who)),
    h('div.wk-form-grid', formGroup(optional(L('الاستحقاق', 'Due')), due), formGroup(L('الأولوية', 'Priority'), prio)));
  const r = await formSheet({
    title: ctx ? L(`مهمة جديدة في ${quote(ctx.name || '')}`, `New task in ${quote(ctx.name || '')}`) : L('مهمة جديدة', 'New task'),
    body, wide: true, submitLabel: L('إضافة', 'Add'),
    isValid: () => title.value.trim().length >= 2,
    onSubmit: async (ctl) => {
      const res = await runTool('create_task', { title: title.value.trim(), assignee_id: who.value || undefined, due_date: due.value || undefined, priority: prio.value, project_id: proj.value || undefined }, { quiet: true, raw: true });
      if (!res || res.status === 'error') { ctl.setError(res?.error || L('تعذّر إضافة المهمة', 'Could not add the task')); return undefined; }
      return res;
    },
  });
  if (!r) return;
  const tt = r.result?.title || title.value.trim();
  const pn = r.result?.project_name;
  undoToast(pn ? L(`أُضيفت ${quote(tt)} إلى ${quote(pn)}`, `Added ${quote(tt)} to ${quote(pn)}`) : L(`أُضيفت المهمة ${quote(tt)}`, `Added ${quote(tt)}`), r);
  emit('data-changed', { entity: 'task', id: r.result?.id });
}

// ====================================================================== portfolio (#/projects?view=portfolio)
// The SPMO's (and leadership's) view of every strategic project in scope:
// progress vs the time-elapsed expectation, people and FTE, budget, milestones,
// and a desktop timeline (start → due, today marker, milestones). Narrow
// containers get the same content as cards.
const pf = { status: 'all', dept: '', q: '' };
const PF_FILTERS = { all: () => true, attention: (p) => ['delayed', 'at_risk'].includes(p.state), on_track: (p) => p.state === 'on_track', missing: (p) => p.state === 'missing' };
const deptsText = (n) => (getLang() === 'en' ? `${fmtNum(n)} ${n === 1 ? 'department' : 'departments'}` : n === 1 ? 'إدارة واحدة' : n === 2 ? 'إدارتين' : n <= 10 ? `${fmtNum(n)} إدارات` : `${fmtNum(n)} إدارة`);
const peopleText = (n) => (getLang() === 'en' ? `${fmtNum(n)} ${n === 1 ? 'person' : 'people'}` : n === 1 ? 'موظف واحد' : n === 2 ? 'موظفان' : n <= 10 ? `${fmtNum(n)} موظفين` : `${fmtNum(n)} موظفاً`);
function aedParts(n) {
  if (n == null) return { num: '—', unit: '' };
  const loc = getLang() === 'ar' ? 'ar-AE' : 'en-US';
  if (n >= 1e6) return { num: (n / 1e6).toLocaleString(loc, { maximumFractionDigits: 1 }), unit: L('مليون درهم', 'M AED') };
  if (n >= 1e3) return { num: (n / 1e3).toLocaleString(loc, { maximumFractionDigits: 0 }), unit: L('ألف درهم', 'K AED') };
  return { num: fmtNum(n), unit: L('درهم', 'AED') };
}

async function renderPortfolio(root, { soft } = {}) {
  const page = h('div.wk.pf-page');
  root.append(page);
  const focus = soft ? captureFocus() : null;
  const load = api('/api/portfolio');
  const retry = () => { page.remove(); renderPortfolio(root); };
  const failed = (e) => page.replaceChildren(pfHead(null), viewTabs('portfolio'), loadError(e, retry));
  if (soft) {
    try { buildPortfolio(page, await load); } catch (e) { failed(e); }
    restoreFocus(page, focus);
    return;
  }
  page.append(pfHead(null), viewTabs('portfolio'),
    h('div.pf-kpis', { 'aria-hidden': 'true' }, [0, 1, 2, 3].map(() => h('div.card.pf-kpi', skeleton('stat')))),
    h('section.card.pf-timeline-card', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل المحفظة', 'Loading the portfolio') }, skeleton('list', 5)));
  load.then((d) => buildPortfolio(page, d), failed);
}

function pfHead(d) {
  const scope = d?.scope;
  const eyebrow = scope === 'portfolio' ? L('إدارة المشاريع الاستراتيجية · كل الإدارات', 'Strategic Projects Office · all departments')
    : scope === 'organisation' ? L('المؤسسة · خارج Vault', 'Organisation · outside Vault')
      : scope === 'department' ? L(state.me.user.dept_ar, state.me.user.dept_en) : L('مشاريع أشارك فيها', 'Projects I take part in');
  const t = d?.totals;
  const sub = !d ? L('جارٍ التحميل…', 'Loading…') : !t.projects ? L('لا مشاريع استراتيجية ضمن نطاقك بعد.', 'No strategic projects in your scope yet.')
    : L(`${countText(t.projects, 'project')} في ${deptsText(d.by_department.length)} · ${fteText(t.fte)} معتمدة · ${fmtAED(t.budget, { compact: true })}`,
      `${countText(t.projects, 'project')} across ${deptsText(d.by_department.length)} · ${fteText(t.fte)} confirmed · ${fmtAED(t.budget, { compact: true })}`);
  return h('header.page-head.wk-head.pf-head',
    h('div.wk-titles', h('span.eyebrow.wk-eyebrow', icon('compass', 'sm'), eyebrow), h('h1', L('المحفظة الاستراتيجية', 'Strategic portfolio')), h('p.sub', sub)),
    h('div.actions',
      h('button.btn.tertiary.wk-ask', { type: 'button', onclick: () => Chat.focus(L('بخصوص المحفظة الاستراتيجية: ', 'About the strategic portfolio: ')) }, icon('spark'), h('span.wk-new-label', L('ناقش مع المساعد', 'Discuss with assistant'))),
      isSpmoUser() ? h('button.btn.primary.wk-new', { type: 'button', 'aria-label': L('مشروع استراتيجي جديد', 'New strategic project'), onclick: () => newStrategicProject() }, icon('plus'), h('span.wk-new-label', L('مشروع استراتيجي جديد', 'New strategic project'))) : null));
}

function pfKpis(t) {
  const tile = (label, value, sub, extra, tone, ic) => h('div.card.pf-kpi', { role: 'listitem', 'data-tone': tone || null },
    h('span.pf-kpi-label', ic ? icon(ic, 'sm') : null, label), value, sub ? h('span.pf-kpi-sub', sub) : null, extra || null);
  const num = (v, unit) => h('span.pf-kpi-value', h('bdi', v), unit ? h('span.pf-kpi-unit', unit) : null);
  const gap = t.avg_progress != null && t.avg_expected != null ? t.avg_progress - t.avg_expected : null;
  const attn = t.delayed + t.at_risk;
  const money = aedParts(t.budget);
  return h('div.pf-kpis', { role: 'list', 'aria-label': L('مؤشرات المحفظة', 'Portfolio indicators') },
    tile(L('متوسط الإنجاز', 'Average progress'), t.avg_progress == null ? num('—') : num(fmtNum(t.avg_progress), '%'),
      t.avg_expected != null ? L(`المتوقع زمنياً ${pctText(t.avg_expected)}${gap != null ? ` · ${gap < 0 ? 'أقل' : 'أعلى'} بـ${countText(Math.abs(gap), 'point')}` : ''}`, `Expected ${t.avg_expected}%${gap != null ? ` · ${Math.abs(gap)} pts ${gap < 0 ? 'behind' : 'ahead'}` : ''}`) : null,
      progressBar(t.avg_progress, { expected: t.avg_expected, tone: gap != null && gap <= -15 ? 'crit' : gap != null && gap <= -5 ? 'warn' : '' }), null, 'gauge'),
    tile(L('تحتاج انتباهاً', 'Need attention'), num(fmtNum(attn)),
      attn ? L(`${fmtNum(t.delayed)} متأخر · ${fmtNum(t.at_risk)} معرّض للتأخر${t.milestones_late ? ` · ${fmtNum(t.milestones_late)} معلم متأخر` : ''}`, `${t.delayed} delayed · ${t.at_risk} at risk${t.milestones_late ? ` · ${t.milestones_late} late milestones` : ''}`) : L('كل المشاريع ضمن الخطة', 'Everything is on plan'),
      null, t.delayed ? 'crit' : t.at_risk ? 'warn' : 'good', t.delayed || t.at_risk ? 'alert' : 'circleCheck'),
    tile(L('الميزانية المعتمدة', 'Approved budget'), num(money.num, money.unit), L(`لـ${countText(t.projects, 'project')}`, `for ${countText(t.projects, 'project')}`), null, null, 'wallet'),
    tile(L('الموارد المخصصة', 'Allocated people'), num(fmtNum(t.fte), 'FTE'),
      L(`${peopleText(t.people)}${t.pending_allocations ? ` · ${fmtNum(t.pending_allocations)} بانتظار الاعتماد` : ''}`, `${peopleText(t.people)}${t.pending_allocations ? ` · ${t.pending_allocations} awaiting approval` : ''}`),
      null, t.pending_allocations ? 'warn' : null, 'people'));
}

function buildPortfolio(page, d) {
  if (pf.dept && !d.departments.some((x) => x.id === pf.dept)) pf.dept = '';
  const results = h('div.pf-results');
  const live = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });
  const seg = segmented([['all', L('الكل', 'All'), 0], ['attention', L('تحتاج انتباهاً', 'Needs attention'), 0], ['on_track', L('ضمن الخطة', 'On track'), 0], ['missing', L('بلا نسبة', 'Not reported'), 0]],
    pf.status, (v) => { pf.status = v; draw(); }, { label: L('تصفية حسب الحالة', 'Filter by status') });
  const dept = d.departments.length > 1 ? h('select.field.pf-dept', { 'aria-label': L('الإدارة', 'Department'), onchange: (e) => { pf.dept = e.target.value; draw(); } },
    h('option', { value: '' }, L('كل الإدارات', 'All departments')), d.departments.map((x) => h('option', { value: x.id }, L(x.name_ar, x.name_en)))) : null;
  if (dept) dept.value = pf.dept;
  const search = searchBox({ value: pf.q, key: 'pf-search', placeholder: L('ابحث في المحفظة', 'Search the portfolio'), label: L('ابحث بالاسم أو الإدارة أو المالك أو المبادرة', 'Search by name, department, owner or initiative'), onInput: (v) => { pf.q = v; draw(); } });
  page.replaceChildren(pfHead(d), viewTabs('portfolio'),
    d.totals.projects ? pfKpis(d.totals) : null,
    d.projects.length ? h('div.wk-toolbar.pf-toolbar', h('div.wk-filters', seg), h('div.wk-toolbar-end', dept, search)) : null,
    results, live);
  function draw() {
    const needle = normalize(pf.q.trim());
    const found = d.projects.filter((p) => (!pf.dept || p.department_id === pf.dept) && (!needle || normalize([p.name, p.dept_ar, p.dept_en, p.owner_name_ar, p.owner_name_en, p.initiative_ref, p.sponsor_name_ar].filter(Boolean).join(' ')).includes(needle)));
    for (const b of seg.querySelectorAll('button[data-v]')) { const c = b.querySelector('.count'); if (c) c.textContent = fmtNum(found.filter(PF_FILTERS[b.dataset.v]).length); }
    const rows = found.filter(PF_FILTERS[pf.status] || PF_FILTERS.all);
    live.textContent = L(`يُعرض ${countText(rows.length, 'project')}`, `Showing ${countText(rows.length, 'project')}`);
    if (!d.projects.length) {
      results.replaceChildren(h('section.card', emptyState({ icon: 'compass', title: L('لا مشاريع استراتيجية بعد', 'No strategic projects yet'),
        body: isSpmoUser() ? L('أنشئ أول مشروع استراتيجي: اختر الإدارة والمالك، وخصّص الموارد، ووزّع المهام — وسيظهر فوراً على داشبورد كل المعنيين.', 'Create the first strategic project: pick the department and owner, allocate people and hand out tasks — it shows up on everyone’s dashboard at once.')
          : L('تظهر هنا المشاريع الاستراتيجية في نطاقك عندما تُسندها إدارة المشاريع الاستراتيجية.', 'Strategic projects in your scope appear here once the Strategic Projects Office assigns them.'),
        actions: isSpmoUser() ? [{ label: L('مشروع استراتيجي جديد', 'New strategic project'), icon: 'plus', primary: true, onClick: () => newStrategicProject() }] : [] })));
      return;
    }
    if (!rows.length) {
      results.replaceChildren(h('section.card', emptyState({ icon: needle ? 'search' : 'circleCheck', title: needle ? L('لا نتائج مطابقة', 'No matching projects') : pf.status === 'attention' ? L('لا مشاريع تحتاج انتباهاً', 'Nothing needs attention') : L('لا مشاريع في هذا التصنيف', 'No projects in this filter'),
        body: needle ? L('جرّب كلمة أخرى أو امسح البحث.', 'Try another word or clear the search.') : L('كل المشاريع المعروضة تسير وفق خطتها.', 'Every project shown is on plan.'),
        actions: [{ label: L('عرض الكل', 'Show all'), onClick: () => { pf.status = 'all'; pf.dept = ''; search.clear(); seg.querySelector('button[data-v="all"]')?.click(); if (dept) dept.value = ''; draw(); } }] })));
      return;
    }
    results.replaceChildren(timelineCard(rows, d.date), h('ul.pf-cards', { 'aria-label': L('المشاريع الاستراتيجية', 'Strategic projects') }, rows.map(pfCard)));
  }
  draw();
}

// ---------------------------------------------------------------- timeline (Gantt)
const dISO = (iso) => Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`);
const daysBetween = (a, b) => Math.round((dISO(b) - dISO(a)) / 864e5);
const monthStart = (iso) => `${String(iso).slice(0, 7)}-01`;
const addMonths = (iso, n) => { const d = new Date(dISO(iso)); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 10); };
const monthName = (iso, withYear) => new Date(dISO(iso) + 432e5).toLocaleDateString(getLang() === 'ar' ? 'ar-AE' : 'en-GB', { month: 'short', ...(withYear ? { year: 'numeric' } : {}), timeZone: 'UTC' });

function groupByDept(rows) {
  const g = new Map();
  for (const p of rows) { if (!g.has(p.department_id)) g.set(p.department_id, { id: p.department_id, name: L(p.dept_ar, p.dept_en), rows: [] }); g.get(p.department_id).rows.push(p); }
  return [...g.values()].sort((a, b) => a.name.localeCompare(b.name, getLang()));
}

function timelineCard(rows, today) {
  const t = today || isoDate(new Date());
  const starts = rows.map((p) => p.start_date || t); const ends = rows.map((p) => p.due_date || p.start_date || t);
  const from = monthStart([...starts, t].sort()[0]);
  const to = addMonths(monthStart([...ends, t].sort().at(-1)), 1);
  const span = Math.max(1, daysBetween(from, to));
  const x = (iso) => Math.max(0, Math.min(100, (daysBetween(from, iso) / span) * 100));
  const months = []; for (let m = from; m < to; m = addMonths(m, 1)) months.push(m);
  const step = Math.max(1, Math.ceil(months.length / 9));
  const lines = () => h('div.pf-g-lines', { 'aria-hidden': 'true' }, months.map((m) => h('i', { style: { insetInlineStart: `${x(m)}%` } })), h('i.pf-g-today', { style: { insetInlineStart: `${x(t)}%` } }));
  const head = h('div.pf-g-row.pf-g-headrow', { 'aria-hidden': 'true' },
    h('div.pf-g-cell.pf-g-c-name', L('المشروع', 'Project')), h('div.pf-g-cell.pf-g-c-prog', L('الإنجاز / المتوقع', 'Progress / expected')),
    h('div.pf-g-cell.pf-g-c-team', L('الفريق', 'Team')), h('div.pf-g-cell.pf-g-c-budget', L('الميزانية', 'Budget')),
    h('div.pf-g-cell.pf-g-track.pf-g-scale', months.map((m, i) => (i % step ? null : h('span.pf-g-month', { style: { insetInlineStart: `${x(m)}%` } }, monthName(m, i === 0 || m.endsWith('-01-01'))))),
      h('span.pf-g-now', { style: { insetInlineStart: `${x(t)}%` } }, L('اليوم', 'Today'))));
  const row = (p) => {
    const s = projectState(p);
    const exp = p.status === 'active' ? p.expected_progress : null;
    const start = p.start_date || t; const due = p.due_date || start;
    const left = x(start); const width = Math.max(1.2, x(due) - left);
    const team = (p.team || []).filter((m) => m.status === 'active');
    const pendingN = (p.team || []).filter((m) => m.status === 'pending_manager').length;
    const barLabel = L(`من ${fmtDate(start)} إلى ${fmtDate(due)} · الإنجاز ${p.progress == null ? 'غير مسجّل' : `${p.progress}%`}${exp != null ? ` مقابل ${exp}% متوقعاً` : ''} · ${s.label}`,
      `${fmtDate(start)} to ${fmtDate(due)} · progress ${p.progress == null ? 'not reported' : `${p.progress}%`}${exp != null ? ` vs ${exp}% expected` : ''} · ${s.label}`);
    return h('div.pf-g-row', { 'data-state': p.state, role: 'row' },
      h('div.pf-g-cell.pf-g-c-name', { role: 'rowheader' },
        h('a.pf-g-name', { href: `#/projects/${p.id}`, onclick: () => { state.selectedProjectId = p.id; state.projectName = p.name; } }, p.name),
        h('span.pf-g-sub', h('span.truncate', L(p.owner_name_ar, p.owner_name_en)), p.state !== 'on_track' ? stateChip(s) : null)),
      h('div.pf-g-cell.pf-g-c-prog', { role: 'cell' },
        h('div.pf-prog-nums', h('b', p.progress == null ? L('غير مسجّلة', 'n/a') : pctText(p.progress)), exp != null ? h('span', L(`/ ${fmtNum(exp)}%`, `/ ${exp}%`)) : null,
          p.progress_mode === 'tasks' ? h('span.pf-auto', { title: L('تُحسب من المهام المنجزة', 'Computed from completed tasks') }, icon('listChecks', 'sm')) : null),
        progressBar(p.progress, { tone: projectTone(p), expected: exp })),
      h('div.pf-g-cell.pf-g-c-team', { role: 'cell' },
        team.length ? h('span.wk-avatars', team.slice(0, 3).map((m) => avatar(m.name_ar)), team.length > 3 ? h('span.avatar.wk-more-avatars', `+${team.length - 3}`) : null) : h('span.pf-none', L('لا موارد', 'No people')),
        h('span.pf-fte', fteText(p.fte || 0)), pendingN ? h('span.pf-pending', { title: L(`${pendingN} بانتظار الاعتماد`, `${pendingN} awaiting approval`) }, icon('hourglass', 'sm'), fmtNum(pendingN)) : null),
      h('div.pf-g-cell.pf-g-c-budget', { role: 'cell' }, p.budget != null ? fmtAED(p.budget, { compact: true }) : '—'),
      h('div.pf-g-cell.pf-g-track', { role: 'cell' }, lines(),
        h('div.pf-g-bar', { 'data-state': p.state, role: 'img', 'aria-label': barLabel, title: barLabel, style: { insetInlineStart: `${left}%`, width: `${width}%` } },
          h('i.pf-g-fill', { style: { width: `${Math.max(0, Math.min(100, p.progress || 0))}%` } }),
          exp != null ? h('i.pf-g-exp', { style: { insetInlineStart: `${exp}%` } }) : null),
        (p.milestones || []).map((m) => {
          const st = m.done ? L('منجز', 'done') : m.late ? L('متأخر', 'late') : L('قادم', 'upcoming');
          return h('span.pf-g-ms', { role: 'img', 'data-state': m.done ? 'done' : m.late ? 'late' : 'next', style: { insetInlineStart: `${x(m.due_date)}%` }, 'aria-label': `${L('معلم', 'Milestone')}: ${m.title} — ${fmtDate(m.due_date)} (${st})`, title: `${m.title} — ${fmtDate(m.due_date)} (${st})` });
        })));
  };
  const key = (tone, label, cls = 'pf-key-bar') => h('span', h(`i.${cls}`, { 'data-state': tone }), label);
  return h('section.card.pf-timeline-card', { 'aria-labelledby': 'pf-tl-title' },
    h('div.card-head.pf-tl-head', h('h2.card-title#pf-tl-title', L('الجدول الزمني للمحفظة', 'Portfolio timeline')),
      h('div.pf-legend', key('on_track', L('ضمن الخطة', 'On track')), key('at_risk', L('معرّض للتأخر', 'At risk')), key('delayed', L('متأخر', 'Delayed')),
        h('span', h('i.pf-key-exp'), L('المتوقع زمنياً', 'Expected')), key('next', L('معلم', 'Milestone'), 'pf-key-ms'), h('span', h('i.pf-key-today'), L('اليوم', 'Today')))),
    h('div.pf-gantt', { role: 'table', 'aria-label': L('الجدول الزمني للمشاريع الاستراتيجية', 'Strategic projects timeline') },
      head,
      groupByDept(rows).map((g) => h('div.pf-g-group', { role: 'rowgroup' },
        h('div.pf-g-dept', { role: 'row' }, h('span', { role: 'rowheader' }, icon('building', 'sm'), g.name), h('span.pf-g-dept-n', countText(g.rows.length, 'project'))),
        g.rows.map(row)))));
}

// Card (narrow containers): the same facts, with a compact timeline strip.
function pfCard(p) {
  const s = projectState(p);
  const exp = p.status === 'active' ? p.expected_progress : null;
  const team = (p.team || []).filter((m) => m.status === 'active');
  const t = isoDate(new Date());
  const span = p.start_date && p.due_date ? Math.max(1, daysBetween(p.start_date, p.due_date)) : null;
  const nowPos = span ? Math.max(0, Math.min(100, (daysBetween(p.start_date, t) / span) * 100)) : null;
  return h('li.pf-card-item', h('a.card.interactive.pf-card', { href: `#/projects/${p.id}`, onclick: () => { state.selectedProjectId = p.id; state.projectName = p.name; } },
    h('div.wk-proj-top', h('span.wk-proj-dept', icon('building', 'sm'), h('span.truncate', L(p.dept_ar, p.dept_en))), stateChip(s)),
    h('h3.pf-card-name', p.name),
    h('div.wk-proj-figure', p.progress == null ? h('span.wk-pct.is-missing', L('لم تُسجَّل نسبة بعد', 'No progress yet')) : h('span.wk-pct', h('bdi', fmtNum(p.progress)), h('span.wk-pct-unit', '%')),
      exp != null ? h('span.wk-gap', L(`المتوقع ${fmtNum(exp)}%`, `Expected ${exp}%`)) : null),
    progressBar(p.progress, { tone: projectTone(p), expected: exp }),
    span ? h('div.pf-strip', { role: 'img', 'aria-label': L(`من ${fmtDate(p.start_date)} إلى ${fmtDate(p.due_date)}`, `${fmtDate(p.start_date)} to ${fmtDate(p.due_date)}`) },
      h('span', fmtDate(p.start_date)), h('span.pf-strip-track', h('i', { style: { insetInlineStart: `${nowPos}%` } }), (p.milestones || []).map((m) => h('b', { 'data-state': m.done ? 'done' : m.late ? 'late' : 'next', style: { insetInlineStart: `${Math.max(0, Math.min(100, (daysBetween(p.start_date, m.due_date) / span) * 100))}%` } }))), h('span', fmtDate(p.due_date))) : null,
    h('div.wk-proj-foot',
      h('span', icon('user', 'sm'), L(p.owner_name_ar, p.owner_name_en)),
      h('span', icon('people', 'sm'), `${fmtNum(team.length)} · ${fteText(p.fte || 0)}`),
      p.budget != null ? h('span', icon('wallet', 'sm'), fmtAED(p.budget, { compact: true })) : null,
      p.next_milestone ? h('span', icon('milestone', 'sm'), `${p.next_milestone.title} · ${fmtDate(p.next_milestone.due_date)}`) : null)));
}

// ====================================================================== team capacity (#/projects?view=capacity)
const capUi = { filter: 'all', dept: '', q: '', open: new Set() };
const CAP_FILTERS = { all: () => true, over: (p) => p.over || p.over_with_pending, allocated: (p) => p.allocations.length > 0, free: (p) => p.peak_with_pending < 60 };
async function renderCapacity(root, { soft } = {}) {
  const page = h('div.wk.cap-page');
  root.append(page);
  const focus = soft ? captureFocus() : null;
  const load = api('/api/capacity/team');
  const retry = () => { page.remove(); renderCapacity(root); };
  const failed = (e) => page.replaceChildren(capHead(null), viewTabs('capacity'), loadError(e, retry));
  if (soft) { try { buildCapacity(page, await load); } catch (e) { failed(e); } restoreFocus(page, focus); return; }
  page.append(capHead(null), viewTabs('capacity'), h('section.card.cap-card', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل السعة', 'Loading capacity') }, skeleton('list', 6)));
  load.then((d) => buildCapacity(page, d), failed);
}
function capHead(d) {
  const s = d?.summary;
  const eyebrow = !d ? '' : d.scope === 'portfolio' ? L('الموارد على المشاريع الاستراتيجية وفريق إدارتك', 'People on strategic work and your team') : d.scope === 'organisation' ? L('المؤسسة', 'Organisation') : d.scope === 'department' ? L(state.me.user.dept_ar, state.me.user.dept_en) : L('وقتي', 'My time');
  const sub = !d ? L('جارٍ التحميل…', 'Loading…') : L(`${peopleText(s.people)} · متوسط الحمل اليوم ${pctText(s.avg_load)} · ${fmtNum(s.over)} فوق السعة${s.pending_decisions ? ` · ${fmtNum(s.pending_decisions)} بانتظار اعتمادك` : ''}`,
    `${peopleText(s.people)} · average load today ${s.avg_load}% · ${s.over} over capacity${s.pending_decisions ? ` · ${s.pending_decisions} awaiting your decision` : ''}`);
  return h('header.page-head.wk-head.pf-head',
    h('div.wk-titles', h('span.eyebrow.wk-eyebrow', icon('gauge', 'sm'), eyebrow), h('h1', L('سعة الفريق', 'Team capacity')), h('p.sub', sub)),
    h('div.actions', h('button.btn.tertiary.wk-ask', { type: 'button', onclick: () => Chat.focus(L('بخصوص سعة فريقي: ', 'About my team’s capacity: ')) }, icon('spark'), h('span.wk-new-label', L('ناقش مع المساعد', 'Discuss with assistant')))));
}
function buildCapacity(page, d) {
  const depts = d.by_department;
  if (capUi.dept && !depts.some((x) => x.department_id === capUi.dept)) capUi.dept = '';
  const results = h('div.cap-results');
  const live = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });
  const seg = segmented([['all', L('الكل', 'All'), 0], ['over', L('فوق السعة', 'Over capacity'), 0], ['allocated', L('لديهم تخصيصات', 'Allocated'), 0], ['free', L('متاحون', 'Available'), 0]], capUi.filter, (v) => { capUi.filter = v; draw(); }, { label: L('تصفية', 'Filter') });
  const dept = depts.length > 1 ? h('select.field.pf-dept', { 'aria-label': L('الإدارة', 'Department'), onchange: (e) => { capUi.dept = e.target.value; draw(); } }, h('option', { value: '' }, L('كل الإدارات', 'All departments')), depts.map((x) => h('option', { value: x.department_id }, L(x.name_ar, x.name_en)))) : null;
  if (dept) dept.value = capUi.dept;
  const search = searchBox({ value: capUi.q, key: 'cap-search', placeholder: L('ابحث عن موظف', 'Search people'), onInput: (v) => { capUi.q = v; draw(); } });
  page.replaceChildren(capHead(d), viewTabs('capacity'),
    d.pending.length ? pendingDecisions(d.pending) : null,
    h('div.wk-toolbar', h('div.wk-filters', seg), h('div.wk-toolbar-end', dept, search)),
    results, live);
  function draw() {
    const needle = normalize(capUi.q.trim());
    const found = d.people.filter((p) => (!capUi.dept || p.department_id === capUi.dept) && (!needle || normalize([p.name_ar, p.name_en, p.title_ar, p.dept_ar].join(' ')).includes(needle)));
    for (const b of seg.querySelectorAll('button[data-v]')) { const c = b.querySelector('.count'); if (c) c.textContent = fmtNum(found.filter(CAP_FILTERS[b.dataset.v]).length); }
    const rows = found.filter(CAP_FILTERS[capUi.filter] || CAP_FILTERS.all);
    live.textContent = L(`يُعرض ${peopleText(rows.length)}`, `Showing ${peopleText(rows.length)}`);
    if (!rows.length) { results.replaceChildren(h('section.card', emptyState({ icon: capUi.filter === 'over' ? 'circleCheck' : 'people', title: capUi.filter === 'over' ? L('لا أحد فوق السعة', 'Nobody is over capacity') : L('لا نتائج', 'No people match'), body: capUi.filter === 'over' ? L('أحمال الفريق ضمن 100% خلال الأشهر الثلاثة القادمة.', 'Everyone stays within 100% for the next three months.') : L('غيّر التصفية أو البحث.', 'Change the filter or the search.') }))); return; }
    const groups = new Map();
    for (const p of rows) { const k = p.department_id; if (!groups.has(k)) groups.set(k, { name: L(p.dept_ar, p.dept_en), rows: [] }); groups.get(k).rows.push(p); }
    results.replaceChildren(h('section.card.cap-card', { 'aria-label': L('أحمال الموظفين', 'People load') },
      h('div.card-head.cap-head', h('h2.card-title', L('الحمل خلال 90 يوماً', 'Load over the next 90 days')),
        h('div.pf-legend', h('span', h('i.cap-key-a'), L('معتمد', 'Confirmed')), h('span', h('i.cap-key-p'), L('بانتظار الاعتماد', 'Pending')), h('span', h('i.cap-key-cap'), L('حد 100%', '100% line')))),
      [...groups.values()].map((g) => h('div.cap-group', h('h3.cap-dept', icon('building', 'sm'), h('span', g.name), h('span.cap-dept-n', peopleText(g.rows.length))), h('ul.cap-list', g.rows.map(capRow))))));
  }
  draw();
}
function capRow(p) {
  const open = capUi.open.has(p.id);
  const detailId = `cap-d-${p.id}`;
  const li = h('li.cap-row', { 'data-over': p.over ? 'yes' : p.over_with_pending ? 'pending' : null });
  const toggle = h('button.cap-main', { type: 'button', 'aria-expanded': String(open), 'aria-controls': detailId, onclick: () => { const on = !capUi.open.has(p.id); on ? capUi.open.add(p.id) : capUi.open.delete(p.id); toggle.setAttribute('aria-expanded', String(on)); details.hidden = !on; } },
    avatar(p.name_ar),
    h('span.cap-who', h('span.cap-name', L(p.name_ar, p.name_en)), h('span.cap-title', L(p.title_ar, p.title_en) || '')),
    h('span.cap-meter', loadMeter(p.peak, { pending: Math.max(0, p.peak_with_pending - p.peak) })),
    h('span.cap-nums', h('b', { 'data-tone': p.over ? 'crit' : p.over_with_pending ? 'warn' : null }, pctText(p.peak)), h('span', L(`الآن ${fmtNum(p.load_now)}%`, `now ${p.load_now}%`))),
    h('span.cap-flags', p.over ? h('span.chip.tiny.crit', icon('alert'), L('فوق السعة', 'Over')) : p.over_with_pending ? h('span.chip.tiny.warn', icon('hourglass'), L('سيتجاوز إن اعتُمد', 'Over if approved')) : p.pending ? h('span.chip.tiny.warn', icon('hourglass'), `+${fmtNum(p.pending)}%`) : null),
    icon('chevronDown', 'sm cap-chev'));
  const details = h('div.cap-details', { id: detailId, hidden: !open },
    p.allocations.length ? h('ul.cap-allocs', p.allocations.map((a) => h('li',
      a.project_name ? h('a', { href: `#/projects/${a.project_id}` }, a.project_name) : h('span.pf-none', L('مشروع خارج نطاقك', 'A project outside your scope')),
      h('span.cap-a-pct', pctText(a.percent)), h('span.cap-a-when', periodText(a.start_date, a.end_date)), allocChip(a))))
      : h('p.pf-none', L('لا تخصيصات على وقته خلال الفترة — متاح بالكامل.', 'No allocations in this period — fully available.')));
  li.append(toggle, details);
  return li;
}
function pendingDecisions(list) {
  return h('section.card.cap-pending', { 'aria-labelledby': 'cap-pend-t' },
    h('div.card-head', h('span.cap-pend-ic', { 'aria-hidden': 'true' }, icon('userCheck')), h('h2.card-title#cap-pend-t', L('طلبات تخصيص بانتظار اعتمادك', 'Allocation requests awaiting your decision')), h('span.dash-count', fmtNum(list.length))),
    h('ul.al-list', list.map((a) => allocRow(a, { showProject: true }))));
}

// ====================================================================== allocations (project page, capacity)
function allocRow(a, { showProject = false } = {}) {
  const me = state.me?.user?.id;
  const pendingForMe = a.status === 'pending_manager' && a.can_decide;
  const load = a.load_with != null ? (a.status === 'active' ? loadMeter(a.load_with) : loadMeter(a.load_others || 0, { pending: a.percent })) : null;
  const who = L(a.person_ar, a.person_en);
  const meta1 = [L(a.person_title_ar, a.person_title_en), L(a.person_dept_ar, a.person_dept_en), a.role_ar].filter(Boolean).join(' · ');
  const menuItems = [
    a.can_end ? { label: L('إنهاء التخصيص…', 'End allocation…'), icon: 'circleX', onClick: () => endAllocation(a) } : null,
    a.can_cancel ? { label: L('سحب الطلب', 'Withdraw request'), icon: 'undo', onClick: () => withdrawAllocation(a) } : null,
  ].filter(Boolean);
  return h('li.al-row', { 'data-status': a.status, 'data-over': a.over ? 'yes' : null },
    avatar(a.person_ar),
    h('div.al-main',
      h('div.al-line', h('span.al-name', who), h('span.al-pct', pctText(a.percent)), allocChip(a), a.proposed_percent && a.proposed_percent !== a.percent ? h('span.al-adj', L(`عُدّل من ${fmtNum(a.proposed_percent)}%`, `adjusted from ${a.proposed_percent}%`)) : null),
      meta1 ? h('div.al-meta', meta1) : null,
      h('div.al-meta', showProject ? h('a.al-proj', { href: `#/projects/${a.project_id}` }, icon('compass', 'sm'), a.project_name) : null, h('span', periodText(a.start_date, a.end_date)),
        h('span', a.status === 'pending_manager' ? L(`اقترحه ${a.allocated_by_ar}`, `Proposed by ${a.allocated_by_en}`) : a.decided_by_ar ? L(`${a.status === 'declined' ? 'قرار' : 'اعتماد'}: ${a.decided_by_ar}`, `${a.status === 'declined' ? 'Decision' : 'Confirmed'} by ${a.decided_by_en}`) : null)),
      load ? h('div.al-load', load, h('span', { 'data-tone': a.over ? 'crit' : null }, a.over ? L(`سيبلغ حمله ${a.load_with}%`, `Load reaches ${a.load_with}%`) : L(`حمله مع هذا التخصيص ${a.load_with}%`, `Load with this: ${a.load_with}%`))) : null,
      a.status === 'declined' && a.decision_note ? h('p.al-note', icon('messageSquare', 'sm'), a.decision_note) : null,
      a.status === 'pending_manager' && !pendingForMe ? h('p.al-route', icon('hourglass', 'sm'), a.user_id === me ? L(`بانتظار اعتماد ${(a.deciders || []).map((d) => d.name_ar).join('، ') || 'مديرك'}`, `Awaiting ${(a.deciders || []).map((d) => d.name_en).join(', ') || 'your manager'}`) : L(`بانتظار اعتماد ${(a.deciders || []).map((d) => d.name_ar).join('، ') || 'المدير المباشر'}`, `Awaiting ${(a.deciders || []).map((d) => d.name_en).join(', ') || 'the line manager'}`)) : null,
      pendingForMe ? h('div.al-actions',
        h('button.btn.sm.primary', { type: 'button', onclick: (e) => decide(a, 'confirm', {}, e.currentTarget) }, icon('check'), L('اعتماد', 'Confirm')),
        h('button.btn.sm', { type: 'button', onclick: () => adjustSheet(a) }, icon('sliders'), L('تعديل واعتماد', 'Adjust')),
        h('button.btn.sm.ghost', { type: 'button', onclick: () => declineSheet(a) }, L('اعتذار', 'Decline'))) : null),
    menuItems.length ? h('button.icon-btn.al-more', { type: 'button', 'aria-label': L(`إجراءات تخصيص ${who}`, `Actions for ${who}’s allocation`), 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => menu(e.currentTarget, menuItems, { width: 220 }) }, icon('more')) : null);
}

async function decide(a, decision, extra = {}, btn = null) {
  btn?.classList.add('is-loading');
  const r = await runTool('decide_allocation', { id: a.id, decision, ...extra }, { quiet: true, raw: true });
  btn?.classList.remove('is-loading');
  if (!r || r.status === 'error') { toast(r?.error || L('تعذّر تنفيذ القرار', 'Could not record the decision'), { kind: 'error' }); return null; }
  const who = L(a.person_ar, a.person_en); const res = r.result || {};
  toast(decision === 'decline' ? L(`سُجّل الاعتذار عن تخصيص ${who} وأُبلغ ${a.allocated_by_ar}`, `Declined — ${a.allocated_by_en} has been told`)
    : decision === 'end' ? L(`أُنهي تخصيص ${who}`, `Ended ${who}’s allocation`)
      : L(`اعتُمد تخصيص ${pctText(res.percent ?? a.percent)} من وقت ${who}`, `Confirmed ${res.percent ?? a.percent}% of ${who}’s time`));
  emit('data-changed', { entity: 'project', id: a.project_id });
  return r;
}
async function endAllocation(a) {
  const ok = await confirmDialog(L('إنهاء التخصيص؟', 'End this allocation?'), L(`يتوقف احتساب ${pctText(a.percent)} من وقت ${a.person_ar} على «${a.project_name}» اعتباراً من اليوم، ويُبلغ بذلك.`, `${a.percent}% of ${a.person_en}’s time stops counting towards “${a.project_name}” from today; they will be told.`), { confirmLabel: L('إنهاء التخصيص', 'End allocation') });
  if (ok) await decide(a, 'end');
}
async function withdrawAllocation(a) {
  const r = await runTool('decide_allocation', { id: a.id, decision: 'withdraw' }, { quiet: true, raw: true });
  if (!r || r.status === 'error') { toast(r?.error || L('تعذّر سحب الطلب', 'Could not withdraw'), { kind: 'error' }); return; }
  toast(L(`سُحب طلب تخصيص ${a.person_ar}`, `Withdrew the request for ${a.person_en}`));
  emit('data-changed', { entity: 'project', id: a.project_id });
}
async function adjustSheet(a) {
  const pct = percentControl(a.percent, { label: L('النسبة المعتمدة', 'Confirmed percentage') });
  const start = dateControl({ value: a.start_date, label: L('من', 'From') });
  const end = dateControl({ value: a.end_date, label: L('إلى', 'To') });
  const note = textArea('', { placeholder: L('سبب التعديل (يصل إلى مقترح التخصيص)', 'Why (sent to the proposer)') });
  const body = h('div.wk-form',
    h('p.wk-sheet-meta', L(`طلب ${a.allocated_by_ar} تخصيص ${pctText(a.percent)} من وقت ${a.person_ar} لمشروع «${a.project_name}».`, `${a.allocated_by_en} asked for ${a.percent}% of ${a.person_en}’s time on “${a.project_name}”.`)),
    formGroup(L('النسبة المعتمدة', 'Confirmed share'), pct),
    h('div.wk-form-grid', formGroup(L('من', 'From'), start), formGroup(L('إلى', 'To'), end)),
    formField(optional(L('ملاحظة', 'Note')), note));
  const r = await formSheet({ title: L(`تعديل واعتماد تخصيص ${a.person_ar}`, `Adjust ${a.person_en}’s allocation`), body, submitLabel: L('اعتماد بالتعديل', 'Confirm with changes'), autofocus: false,
    isValid: () => pct.valid() && !!start.value && !!end.value && end.value >= start.value,
    onSubmit: async (ctl) => {
      const input = { id: a.id, decision: 'adjust', percent: pct.value, start_date: start.value, end_date: end.value };
      if (note.value.trim()) input.reason = note.value.trim();
      const res = await runTool('decide_allocation', input, { quiet: true, raw: true });
      if (!res || res.status === 'error') { ctl.setError(res?.error || L('تعذّر الحفظ', 'Could not save')); return undefined; }
      return res;
    } });
  if (!r) return;
  toast(L(`اعتُمد تخصيص ${pctText(r.result.percent)} من وقت ${a.person_ar} بعد التعديل`, `Confirmed ${r.result.percent}% of ${a.person_en}’s time`));
  emit('data-changed', { entity: 'project', id: a.project_id });
}
async function declineSheet(a) {
  const reason = textArea('', { placeholder: L('مثال: ملتزم بإطلاق البوابة حتى نهاية الشهر؛ يمكن البدء بعدها بنسبة 20%', 'e.g. Committed to the portal launch until month-end; could start at 20% afterwards'), 'data-refocus': 'decline-reason' });
  const body = h('div.wk-form',
    h('p.wk-sheet-meta', L(`سيصل السبب إلى ${a.allocated_by_ar} وإلى ${a.person_ar}، ويُحفظ في سجل التدقيق.`, `The reason goes to ${a.allocated_by_en} and ${a.person_en} and is kept in the audit trail.`)),
    formField(L('سبب الاعتذار', 'Reason'), reason, { required: true }));
  const r = await formSheet({ title: L(`الاعتذار عن تخصيص ${a.person_ar}`, `Decline ${a.person_en}’s allocation`), body, submitLabel: L('إرسال الاعتذار', 'Send'),
    isValid: () => reason.value.trim().length >= 3,
    onSubmit: async (ctl) => {
      const res = await runTool('decide_allocation', { id: a.id, decision: 'decline', reason: reason.value.trim() }, { quiet: true, raw: true });
      if (!res || res.status === 'error') { ctl.setError(res?.error || L('تعذّر الحفظ', 'Could not save')); return undefined; }
      return res;
    } });
  if (!r) return;
  toast(L(`سُجّل الاعتذار وأُبلغ ${a.allocated_by_ar}`, `Declined — ${a.allocated_by_en} has been told`));
  emit('data-changed', { entity: 'project', id: a.project_id });
}

// Live capacity preview for a person over a period (what-if with the new %).
function capacityPreview(c) {
  const name = L(c.person.name_ar, c.person.name_en);
  const tone = c.over ? 'crit' : c.over_with_pending ? 'warn' : 'good';
  const deciders = (c.approval.deciders || []).map((d) => L(d.name_ar, d.name_en)).join(L('، ', ', '));
  return h('div.al-cap', { 'data-tone': tone },
    h('div.al-cap-head', icon(c.over ? 'alert' : 'gauge', 'sm'), h('span', L(`حمل ${name} خلال الفترة`, `${name}’s load in this period`)),
      h('b', h('bdi', `${fmtNum(c.active_peak)}% ← ${fmtNum(c.with_this)}%`))),
    loadMeter(c.active_peak, { pending: c.percent, lg: true }),
    c.over ? h('p.al-cap-warn', icon('alert', 'sm'), L('سيتجاوز حمله 100% — خفّض النسبة أو غيّر الفترة، أو أرسل الطلب ليقرر مديره.', 'This takes them over 100% — lower the share, change the dates, or send it for their manager to decide.'))
      : c.over_with_pending ? h('p.al-cap-note', L(`لديه ${fmtNum(c.pending_peak - c.active_peak)}% أخرى بانتظار الاعتماد؛ قد يتجاوز 100% إن اعتُمدت كلها.`, `${c.pending_peak - c.active_peak}% more is pending; together they would exceed 100%.`)) : null,
    c.allocations.length ? h('ul.al-cap-list', c.allocations.map((a) => h('li', h('span.truncate', a.project_name || L('مشروع خارج نطاقك', 'A project outside your scope')), h('span', periodText(a.start_date, a.end_date)), h('b', pctText(a.percent)), allocChip(a))))
      : h('p.al-cap-note', L('لا تخصيصات أخرى خلال الفترة.', 'No other allocations in this period.')),
    h('p.al-cap-route', icon(c.approval.auto ? 'circleCheck' : 'userCheck', 'sm'), c.approval.auto ? L('يُعتمد مباشرة لأنك المدير المباشر.', 'Confirmed at once — you are the line manager.') : L(`يُرسل إلى ${deciders || 'المدير المباشر'} للاعتماد.`, `Goes to ${deciders || 'the line manager'} for approval.`)));
}
const capacityQuery = (userId, from, to, percent, projectId) => api(`/api/capacity?${new URLSearchParams({ user_id: userId, ...(from ? { from } : {}), ...(to ? { to } : {}), percent: String(percent || 0), ...(projectId ? { project_id: projectId } : {}) })}`);

async function allocateSheet(p) {
  let people = [];
  try { people = await staffDirectory(); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  const t = isoDate(new Date());
  const taken = new Set((p.allocations || []).filter((a) => ['active', 'pending_manager'].includes(a.status)).map((a) => a.user_id));
  const who = personSelect(people.filter((u) => !taken.has(u.id)), { placeholder: L('اختر موظفاً…', 'Choose a person…') });
  const role = h('input.field', { maxlength: 80, autocomplete: 'off', placeholder: L('مثال: محلل أعمال رئيسي', 'e.g. Lead business analyst') });
  const pct = percentControl(40, { label: L('نسبة الوقت', 'Share of time') });
  const start = dateControl({ value: p.start_date && p.start_date > t ? p.start_date : t, label: L('من', 'From') });
  const end = dateControl({ value: p.due_date || '', label: L('إلى', 'To') });
  const note = textArea('', { placeholder: L('ملاحظة للمدير المباشر (اختياري)', 'Note to the line manager (optional)') });
  const preview = h('div.al-preview', { 'aria-live': 'polite' }, h('p.al-cap-note', icon('info', 'sm'), L('اختر الموظف لعرض حمله الحالي قبل الإرسال.', 'Pick a person to see their current load before sending.')));
  let seq = 0;
  const check = debounce(async () => {
    if (!who.value) return;
    const my = ++seq;
    preview.classList.add('is-loading');
    try { const c = await capacityQuery(who.value, start.value, end.value, pct.value, p.id); if (my === seq) preview.replaceChildren(capacityPreview(c)); }
    catch (e) { if (my === seq) preview.replaceChildren(h('p.al-cap-note', icon('circleAlert', 'sm'), e.message)); }
    finally { if (my === seq) preview.classList.remove('is-loading'); }
  }, 220);
  for (const el of [who, pct, start, end]) { el.addEventListener('change', check); el.addEventListener('input', check); }
  const body = h('div.wk-form',
    formField(L('الموظف', 'Person'), who, { required: true, helper: L('من أي إدارة؛ يعتمد التخصيص مديره المباشر ما لم تكن أنت مديره.', 'From any department; their line manager confirms unless that is you.') }),
    h('div.wk-form-grid', formGroup(L('نسبة الوقت', 'Share of time'), pct), formField(optional(L('الدور في المشروع', 'Role in the project')), role)),
    h('div.wk-form-grid', formGroup(L('من', 'From'), start), formGroup(L('إلى', 'To'), end)),
    preview,
    formField(optional(L('ملاحظة', 'Note')), note));
  const r = await formSheet({ title: L(`تخصيص مورد لـ${quote(p.name)}`, `Allocate someone to ${quote(p.name)}`), body, wide: true, submitLabel: L('إرسال التخصيص', 'Allocate'), submitIcon: 'userPlus',
    isValid: () => !!who.value && pct.valid() && !!end.value && (!start.value || end.value >= start.value),
    onSubmit: async (ctl) => {
      const res = await runTool('allocate_resource', { project_id: p.id, user_id: who.value, percent: pct.value, start_date: start.value || undefined, end_date: end.value || undefined, role_ar: role.value.trim() || undefined, note: note.value.trim() || undefined }, { quiet: true, raw: true });
      if (!res || res.status === 'error') { ctl.setError(res?.error || L('تعذّر التخصيص', 'Could not allocate')); return undefined; }
      return res;
    } });
  if (!r?.result) return;
  const a = r.result;
  undoToast(a.status === 'active' ? L(`خُصّص ${pctText(a.percent)} من وقت ${a.person_ar} واعتُمد`, `Allocated ${a.percent}% of ${a.person_en}’s time`)
    : L(`أُرسل طلب تخصيص ${pctText(a.percent)} من وقت ${a.person_ar} إلى ${(a.deciders || []).map((d) => d.name_ar).join('، ')}`, `Sent ${a.percent}% of ${a.person_en}’s time to ${(a.deciders || []).map((d) => d.name_en).join(', ')} for approval`), r);
  emit('data-changed', { entity: 'project', id: p.id });
}

function allocationsCard(p) {
  const list = p.allocations || [];
  const live = list.filter((a) => ['active', 'pending_manager'].includes(a.status));
  const past = list.filter((a) => !['active', 'pending_manager'].includes(a.status));
  const fte = live.filter((a) => a.status === 'active').reduce((s, a) => s + a.percent, 0) / 100;
  const pending = live.filter((a) => a.status === 'pending_manager').length;
  const titleId = `al-t-${p.id}`;
  let history = null;
  if (past.length) {
    const ul = h('ul.al-list', { id: `al-h-${p.id}`, hidden: true }, past.map((a) => allocRow(a)));
    const tg = h('button.wk-group-toggle', { type: 'button', 'aria-expanded': 'false', 'aria-controls': ul.id, onclick: () => { const on = tg.getAttribute('aria-expanded') !== 'true'; tg.setAttribute('aria-expanded', String(on)); ul.hidden = !on; } }, icon('chevronDown', 'sm wk-chev'), h('span', L('السجل', 'History')), h('span.wk-group-count', fmtNum(past.length)));
    history = h('div.wk-group.wk-group-done', h('h3.wk-group-title', tg), ul);
  }
  return h('section.card.al-card', { 'aria-labelledby': titleId },
    h('div.card-head.wk-tasks-head',
      h('div.wk-tasks-titles', h('h2.card-title', { id: titleId }, L('الموارد المخصصة', 'Allocated people')),
        h('span.wk-tasks-sum', L(`${fteText(fte)} معتمدة${pending ? ` · ${fmtNum(pending)} بانتظار الاعتماد` : ''}`, `${fteText(fte)} confirmed${pending ? ` · ${pending} pending` : ''}`))),
      p.can_allocate ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => allocateSheet(p) }, icon('userPlus'), L('تخصيص مورد', 'Allocate')) : null),
    live.length ? h('ul.al-list', live.map((a) => allocRow(a))) : emptyState({ compact: true, icon: 'people', title: L('لم تُخصَّص موارد بعد', 'Nobody allocated yet'),
      body: p.can_allocate ? L('خصّص نسبة من وقت الموظفين من أي إدارة؛ يعتمدها مديرهم المباشر.', 'Allocate a share of people’s time from any department; their line manager confirms it.') : L('تظهر هنا الموارد المخصصة للمشروع ونسب وقتهم.', 'People allocated to the project and their share of time appear here.') }),
    history);
}

// ====================================================================== milestones
function milestonesCard(p) {
  const list = p.milestones || [];
  const me = state.me?.user?.id;
  const titleId = `ms-t-${p.id}`;
  const done = list.filter((m) => m.done).length;
  const row = (m) => {
    const canToggle = p.can_edit || m.owner_id === me;
    const d = dayDiff(m.due_date);
    const when = m.done ? L(`أُنجز ${fmtDate(m.done_at)}`, `Done ${fmtDate(m.done_at)}`) : d < 0 ? L(`متأخر ${daysText(-d)}`, `${daysText(-d)} late`) : d === 0 ? L('اليوم', 'Today') : L(`بعد ${daysText(d)}`, `In ${daysText(d)}`);
    const check = canToggle ? h('button.check.ms-check', { type: 'button', role: 'checkbox', 'aria-checked': String(m.done), class: m.done ? 'on' : '', 'aria-label': m.done ? L(`إعادة فتح المعلم ${quote(m.title)}`, `Reopen milestone ${quote(m.title)}`) : L(`تحديد المعلم ${quote(m.title)} كمنجز`, `Mark milestone ${quote(m.title)} done`),
      onclick: async (e) => { const b = e.currentTarget; b.disabled = true; const r = await runTool('update_milestone', { id: m.id, done: !m.done }, { quiet: true }); b.disabled = false; if (r) { undoToast(m.done ? L(`أُعيد فتح ${quote(m.title)}`, `Reopened ${quote(m.title)}`) : L(`أُنجز المعلم ${quote(m.title)}`, `Milestone ${quote(m.title)} done`), r); emit('data-changed', { entity: 'project', id: p.id }); } } }, m.done ? icon('check') : null)
      : h('span.ms-glyph', { 'aria-hidden': 'true', 'data-state': m.done ? 'done' : m.late ? 'late' : 'next' });
    return h('li.ms-row', { 'data-state': m.done ? 'done' : m.late ? 'late' : 'next' },
      check,
      h('div.ms-main', h('span.ms-title', m.title), h('span.ms-meta', h('span', { title: longDate(m.due_date) }, fmtDate(m.due_date)), m.owner_ar ? h('span', L(m.owner_ar, m.owner_en)) : null)),
      h(`span.ms-when${m.late ? '.crit' : m.done ? '.good' : ''}`, when),
      p.can_edit ? h('button.icon-btn.ms-del', { type: 'button', 'aria-label': L(`إزالة المعلم ${quote(m.title)}`, `Remove milestone ${quote(m.title)}`), 'data-tip': L('إزالة', 'Remove'), onclick: async () => { const r = await runTool('delete_milestone', { id: m.id }, { quiet: true }); if (r) { undoToast(L(`أُزيل المعلم ${quote(m.title)}`, `Removed ${quote(m.title)}`), r); emit('data-changed', { entity: 'project', id: p.id }); } } }, icon('trash')) : null);
  };
  let add = null;
  if (p.can_edit) {
    const title = h('input.field', { maxlength: 160, placeholder: L('معلم جديد…', 'New milestone…'), 'aria-label': L('عنوان المعلم', 'Milestone title'), 'data-refocus': `ms-${p.id}`, 'data-keep-value': '' });
    const due = h('input.field.ms-date', { type: 'date', 'aria-label': L('تاريخ المعلم', 'Milestone date'), value: p.due_date && p.due_date >= isoDate(new Date()) ? '' : '' });
    const btn = h('button.btn.sm.tertiary', { type: 'submit' }, icon('plus'), L('إضافة', 'Add'));
    add = h('form.ms-add', { novalidate: true, onsubmit: async (e) => {
      e.preventDefault();
      if (title.value.trim().length < 2) { title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
      if (!due.value) { due.setAttribute('aria-invalid', 'true'); due.focus(); toast(L('حدّد تاريخ المعلم', 'Pick the milestone date'), { kind: 'info', timeout: 2500 }); return; }
      btn.classList.add('is-loading');
      const r = await runTool('add_milestone', { project_id: p.id, title: title.value.trim(), due_date: due.value }, { quiet: true });
      btn.classList.remove('is-loading');
      if (!r) return;
      undoToast(L(`أُضيف المعلم ${quote(r.result.title)}`, `Added ${quote(r.result.title)}`), r);
      title.value = ''; due.value = '';
      emit('data-changed', { entity: 'project', id: p.id });
    } }, title, due, btn);
    title.addEventListener('input', () => title.removeAttribute('aria-invalid'));
    due.addEventListener('input', () => due.removeAttribute('aria-invalid'));
  }
  return h('section.card.ms-card', { 'aria-labelledby': titleId },
    h('div.card-head.wk-tasks-head', h('div.wk-tasks-titles', h('h2.card-title', { id: titleId }, L('المعالم الزمنية', 'Milestones')), list.length ? h('span.wk-tasks-sum', L(`${fmtNum(done)} من ${fmtNum(list.length)} منجزة`, `${done} of ${list.length} done`)) : null)),
    list.length ? h('ol.ms-list', list.map(row)) : emptyState({ compact: true, icon: 'milestone', title: L('لا معالم زمنية بعد', 'No milestones yet'), body: p.can_edit ? L('أضف محطات المشروع الرئيسية لتظهر على الجدول الزمني للمحفظة.', 'Add the key checkpoints so they show on the portfolio timeline.') : L('تظهر هنا محطات المشروع الرئيسية.', 'The project’s key checkpoints appear here.') }),
    add);
}

// ====================================================================== new strategic project (wizard)
// Department → owner → timeline/budget/initiative → allocations (people picker
// grouped by department, % and dates, live capacity check) → initial tasks →
// milestones → review & create. One atomic call (create_strategic_project).
export async function newStrategicProject() {
  if (!isSpmoUser()) { toast(L('إنشاء المشاريع الاستراتيجية من صلاحية إدارة المشاريع الاستراتيجية.', 'Creating strategic projects is for the Strategic Projects Office.'), { kind: 'error' }); return; }
  let meta; let people;
  try { [meta, people] = await Promise.all([portfolioMeta(), staffDirectory()]); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  const me = state.me.user;
  const today = isoDate(new Date());
  const st = { step: 0, name: '', dept: '', owner: '', desc: '', start: today, due: '', budget: '', ref: '', sponsor: me.id, mode: 'tasks', allocs: [], tasks: [], milestones: [] };
  const STEPS = [
    { title: L('الإدارة والمالك', 'Department & owner'), icon: 'building' },
    { title: L('الزمن والميزانية', 'Timeline & budget'), icon: 'calendarDays' },
    { title: L('الموارد', 'People'), icon: 'people' },
    { title: L('المهام الأولية', 'First tasks'), icon: 'listTodo' },
    { title: L('المعالم', 'Milestones'), icon: 'milestone' },
    { title: L('المراجعة والإنشاء', 'Review & create'), icon: 'circleCheck' },
  ];
  const LAST = STEPS.length - 1;
  const deptById = new Map(meta.departments.map((d) => [d.id, d]));
  const subtree = (id) => { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const d of meta.departments) if (d.parent_id && out.has(d.parent_id) && !out.has(d.id)) { out.add(d.id); grew = true; } } return out; };
  const deptPeople = (id) => { const sub = subtree(id); return people.filter((u) => sub.has(u.department_id)); };
  const person = (id) => people.find((u) => u.id === id);
  const pname = (id) => { const u = person(id); return u ? L(u.name_ar, u.name_en) : '—'; };
  const valid = (i) => {
    if (i === 0) return st.name.trim().length >= 2 && !!st.dept && !!st.owner;
    if (i === 1) return !!st.due && (!st.start || st.due >= st.start) && (st.budget === '' || Number(st.budget) >= 0);
    return true;
  };
  let ctl = null;
  const stepper = h('ol.pf-steps', { 'aria-label': L('خطوات الإنشاء', 'Steps') });
  const panel = h('div.pf-step-panel');
  const back = h('button.btn.ghost', { type: 'button', onclick: () => go(st.step - 1) }, icon('chevronL', 'sm flip-rtl'), L('السابق', 'Back'));
  const body = h('div.pf-wizard', stepper, panel);

  function go(i) {
    if (i < 0 || i > LAST) return;
    if (i > st.step) for (let k = st.step; k < i; k++) if (!valid(k)) { st.step = k; paint(); return; }
    st.step = i; paint();
  }
  function paint() {
    stepper.replaceChildren(...STEPS.map((s, i) => h('li', { 'data-state': i < st.step ? 'done' : i === st.step ? 'current' : 'todo' },
      h('button.pf-step', { type: 'button', 'aria-current': i === st.step ? 'step' : null, disabled: i > st.step && ![...Array(i).keys()].every(valid) ? true : null, onclick: () => go(i) },
        h('span.pf-step-dot', i < st.step ? icon('check') : icon(s.icon)), h('span.pf-step-label', h('small', L(`الخطوة ${fmtNum(i + 1)}`, `Step ${i + 1}`)), s.title)))));
    panel.replaceChildren(renderStep(st.step));
    back.hidden = st.step === 0;
    const submit = ctl?.form.querySelector('.actions .btn.primary');
    if (submit) submit.replaceChildren(...(st.step === LAST ? [icon('compass'), L('إنشاء المشروع الاستراتيجي', 'Create strategic project')] : [L('التالي', 'Next'), icon('chevron', 'sm flip-rtl')]));
    ctl?.revalidate();
    setTimeout(() => panel.querySelector('input:not([type=hidden]):not([tabindex="-1"]), select, textarea')?.focus({ preventScroll: true }), 30);
  }
  const noEnter = (el, fn) => el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); fn?.(); } });

  function renderStep(i) {
    if (i === 0) {
      const name = h('input.field', { value: st.name, maxlength: 120, autocomplete: 'off', placeholder: L('مثال: منصة الخدمات الاستباقية', 'e.g. Proactive services platform') });
      name.addEventListener('input', () => { st.name = name.value; });
      const dept = h('select.field', h('option', { value: '' }, L('اختر الإدارة المنفِّذة…', 'Choose the executing department…')), meta.departments.map((d) => h('option', { value: d.id }, `${L(d.name_ar, d.name_en)}${d.managers[0] ? ` — ${L(d.managers[0].name_ar, d.managers[0].name_en)}` : ''}`)));
      dept.value = st.dept;
      const owner = h('select.field');
      const fillOwner = () => {
        const list = deptPeople(st.dept);
        owner.replaceChildren(h('option', { value: '' }, st.dept ? L('اختر مالك المشروع…', 'Choose the owner…') : L('اختر الإدارة أولاً', 'Choose a department first')),
          ...list.map((u) => h('option', { value: u.id }, `${L(u.name_ar, u.name_en)} — ${L(u.title_ar, u.title_en) || L(u.dept_ar, u.dept_en)}`)));
        owner.disabled = !st.dept; owner.value = st.owner;
      };
      dept.addEventListener('change', () => { st.dept = dept.value; const m = deptById.get(st.dept)?.managers?.[0]; st.owner = m && deptPeople(st.dept).some((u) => u.id === m.id) ? m.id : ''; fillOwner(); });
      owner.addEventListener('change', () => { st.owner = owner.value; });
      fillOwner();
      const desc = textArea(st.desc, { placeholder: L('الهدف والنطاق والأثر المتوقع باختصار', 'Goal, scope and expected impact, briefly') });
      desc.addEventListener('input', () => { st.desc = desc.value; });
      return h('div.wk-form',
        h('div.callout.wk-note', icon('compass'), h('span', L('المشروع الاستراتيجي يُنفَّذ في أي إدارة: تختار أنت المالك منها، وتتابعه إدارة المشاريع الاستراتيجية في المحفظة، ويراه مدير الإدارة ومالكه وفريقه فوراً.', 'A strategic project runs in any department: you choose its owner there; the SPMO follows it in the portfolio, and the department’s manager, owner and team see it at once.'))),
        formField(L('اسم المشروع', 'Project name'), name, { required: true }),
        h('div.wk-form-grid', formField(L('الإدارة المنفِّذة', 'Executing department'), dept, { required: true }), formField(L('مالك المشروع', 'Project owner'), owner, { required: true, helper: L('من موظفي الإدارة؛ يتابع المهام ويحدّث الإنجاز', 'From that department; runs tasks and progress') })),
        formField(optional(L('الهدف والنطاق', 'Goal & scope')), desc));
    }
    if (i === 1) {
      const start = dateControl({ value: st.start, label: L('تاريخ البدء', 'Start date') });
      const due = dateControl({ value: st.due, label: L('تاريخ الاستحقاق', 'Due date'), allowPast: false });
      const err = h('div.error-text', { hidden: true }, icon('circleAlert', 'sm'), L('تاريخ الاستحقاق يسبق تاريخ البدء', 'The due date is before the start date'));
      const sync = () => { st.start = start.value; st.due = due.value; err.hidden = !(st.due && st.start && st.due < st.start); };
      start.addEventListener('change', sync); due.addEventListener('change', sync);
      const budget = h('input.field.pf-money', { type: 'number', min: 0, step: 1000, inputmode: 'numeric', value: st.budget, placeholder: '0' });
      budget.addEventListener('input', () => { st.budget = budget.value; });
      const ref = h('input.field', { value: st.ref, maxlength: 160, autocomplete: 'off', placeholder: L('مثال: م.ت 2.2 — الخدمات الاستباقية', 'e.g. SO 2.2 — Proactive services') });
      ref.addEventListener('input', () => { st.ref = ref.value; });
      const sponsor = h('select.field', meta.sponsors.map((u) => h('option', { value: u.id }, `${L(u.name_ar, u.name_en)}${u.id === me.id ? L(' (أنا)', ' (me)') : ''}`)));
      sponsor.value = st.sponsor; sponsor.addEventListener('change', () => { st.sponsor = sponsor.value; });
      const mode = choice([['tasks', L('تلقائياً من المهام', 'Automatic from tasks')], ['manual', L('يحدّثها المالك', 'Reported by the owner')]], st.mode, { label: L('احتساب الإنجاز', 'Progress measure'), onChange: (v) => { st.mode = v; } });
      return h('div.wk-form',
        h('div.wk-form-grid', formGroup(L('تاريخ البدء', 'Start date'), start), h('div', formGroup([L('تاريخ الاستحقاق', 'Due date'), h('span.wk-req', L('مطلوب', 'Required'))], due), err)),
        h('div.wk-form-grid', formField(optional(L('الميزانية المعتمدة (درهم)', 'Approved budget (AED)')), budget), formField(L('راعي المشروع', 'Sponsor'), sponsor)),
        formField(optional(L('مرجع المبادرة الاستراتيجية', 'Strategy initiative reference')), ref, { helper: L('رمز أو اسم المبادرة في الخطة الاستراتيجية التي يخدمها المشروع.', 'Code or name of the strategy initiative this project serves.') }),
        formGroup(L('احتساب نسبة الإنجاز', 'Progress measure'), mode),
        h('p.wk-sheet-meta', L('«تلقائياً من المهام» يجعل النسبة = المهام المنجزة ÷ كل المهام، فتتحدّث على داشبورد الجميع فور إنجاز أي مهمة.', '“Automatic” makes progress = done tasks ÷ all tasks, so everyone’s dashboard updates the moment a task is done.')));
    }
    if (i === 2) return peopleStep();
    if (i === 3) return tasksStep();
    if (i === 4) return milestonesStep();
    return reviewStep();
  }

  function peopleStep() {
    const taken = new Set(st.allocs.map((a) => a.user_id));
    const who = personSelect(people.filter((u) => !taken.has(u.id)), { placeholder: L('اختر موظفاً من أي إدارة…', 'Choose someone from any department…') });
    const pct = percentControl(40, { label: L('نسبة الوقت', 'Share of time') });
    const from = h('input.field', { type: 'date', value: st.start || today, 'aria-label': L('من', 'From') });
    const to = h('input.field', { type: 'date', value: st.due, 'aria-label': L('إلى', 'To') });
    const role = h('input.field', { maxlength: 80, autocomplete: 'off', placeholder: L('الدور (اختياري)', 'Role (optional)'), 'aria-label': L('الدور في المشروع', 'Role in the project') });
    const preview = h('div.al-preview', { 'aria-live': 'polite' });
    let last = null; let seq = 0;
    const check = debounce(async () => {
      last = null;
      if (!who.value) { preview.replaceChildren(); return; }
      const my = ++seq; preview.classList.add('is-loading');
      try { const c = await capacityQuery(who.value, from.value, to.value, pct.value); if (my === seq) { last = c; preview.replaceChildren(capacityPreview(c)); } }
      catch (e) { if (my === seq) preview.replaceChildren(h('p.al-cap-note', icon('circleAlert', 'sm'), e.message)); }
      finally { if (my === seq) preview.classList.remove('is-loading'); }
    }, 200);
    for (const el of [who, pct, from, to]) { el.addEventListener('change', check); el.addEventListener('input', check); }
    const add = h('button.btn.tertiary', { type: 'button', onclick: async () => {
      if (!who.value) { who.focus(); return; }
      if (!pct.valid()) return;
      if (!to.value || (from.value && to.value < from.value)) { to.setAttribute('aria-invalid', 'true'); to.focus(); return; }
      let c = last;
      if (!c) { try { c = await capacityQuery(who.value, from.value, to.value, pct.value); } catch { c = null; } }
      st.allocs.push({ user_id: who.value, percent: pct.value, start_date: from.value || undefined, end_date: to.value, role_ar: role.value.trim() || undefined, cap: c });
      paint();
    } }, icon('userPlus'), L('إضافة إلى الفريق', 'Add to team'));
    noEnter(role, () => add.click()); noEnter(from); noEnter(to);
    const total = st.allocs.reduce((s, a) => s + a.percent, 0) / 100;
    return h('div.wk-form',
      h('div.pf-add-box', h('h4.pf-add-title', icon('userPlus', 'sm'), L('خصّص نسبة من وقت الموظفين', 'Allocate a share of people’s time')),
        formField(L('الموظف', 'Person'), who),
        h('div.wk-form-grid', formGroup(L('نسبة الوقت', 'Share of time'), pct), formField(optional(L('الدور', 'Role')), role)),
        h('div.wk-form-grid', formField(L('من', 'From'), from), formField(L('إلى', 'To'), to)),
        preview, h('div.pf-add-actions', add)),
      st.allocs.length ? h('div.pf-picked', h('div.pf-picked-head', h('span', L('الفريق المقترح', 'Proposed team')), h('b', fteText(total))),
        h('ul.al-list', st.allocs.map((a, k) => {
          const u = person(a.user_id); const c = a.cap;
          return h('li.al-row', { 'data-over': c?.over ? 'yes' : null }, avatar(u?.name_ar),
            h('div.al-main', h('div.al-line', h('span.al-name', pname(a.user_id)), h('span.al-pct', pctText(a.percent)), a.role_ar ? h('span.al-meta', a.role_ar) : null),
              h('div.al-meta', L(u?.dept_ar, u?.dept_en), ' · ', periodText(a.start_date || st.start, a.end_date)),
              c ? h('div.al-load', loadMeter(c.active_peak, { pending: a.percent }), h('span', { 'data-tone': c.over ? 'crit' : null }, c.over ? L(`سيبلغ حمله ${c.with_this}%`, `Load reaches ${c.with_this}%`) : L(`حمله سيصبح ${c.with_this}%`, `Load becomes ${c.with_this}%`))) : null,
              c ? h('p.al-route', icon(c.approval.auto ? 'circleCheck' : 'hourglass', 'sm'), c.approval.auto ? L('يُعتمد مباشرة (أنت مديره)', 'Confirmed at once (you manage them)') : L(`بانتظار اعتماد ${c.approval.deciders.map((d) => d.name_ar).join('، ')}`, `Pending ${c.approval.deciders.map((d) => d.name_en).join(', ')}`)) : null),
            h('button.icon-btn', { type: 'button', 'aria-label': L(`إزالة ${pname(a.user_id)}`, `Remove ${pname(a.user_id)}`), onclick: () => { st.allocs.splice(k, 1); paint(); } }, icon('x')));
        }))) : h('p.wk-sheet-meta', icon('info', 'sm'), L('يمكنك التخطي وإضافة الموارد لاحقاً من صفحة المشروع.', 'You can skip this and allocate people later from the project page.')));
  }

  function tasksStep() {
    const allocated = st.allocs.map((a) => person(a.user_id)).filter(Boolean);
    const title = h('input.field', { maxlength: 200, autocomplete: 'off', placeholder: L('عنوان المهمة', 'Task title'), 'aria-label': L('عنوان المهمة', 'Task title') });
    const who = personSelect(people, { value: allocated[0]?.id || st.owner, first: allocated, firstLabel: L('الموارد المخصصة', 'Allocated people') });
    who.setAttribute('aria-label', L('المسؤول', 'Assignee'));
    const due = h('input.field', { type: 'date', value: '', 'aria-label': L('الاستحقاق', 'Due'), max: st.due || null });
    const add = h('button.btn.tertiary', { type: 'button', onclick: () => {
      if (title.value.trim().length < 2) { title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
      st.tasks.push({ title: title.value.trim(), assignee_id: who.value || st.owner, due_date: due.value || undefined });
      paint();
    } }, icon('plus'), L('إضافة مهمة', 'Add task'));
    noEnter(title, () => add.click()); noEnter(due, () => add.click());
    title.addEventListener('input', () => title.removeAttribute('aria-invalid'));
    return h('div.wk-form',
      h('div.pf-add-box', h('h4.pf-add-title', icon('taskPlus', 'sm'), L('وزّع المهام الأولى', 'Hand out the first tasks')),
        formField(L('المهمة', 'Task'), title),
        h('div.wk-form-grid', formField(L('المسؤول', 'Assignee'), who, { helper: L('أي موظف في الجهة؛ يصله تنبيه فوري باسمك.', 'Anyone internal; they are alerted at once, with your name.') }), formField(optional(L('الاستحقاق', 'Due')), due)),
        h('div.pf-add-actions', add)),
      st.tasks.length ? h('ul.pf-mini-list', st.tasks.map((tk, k) => h('li', icon('listTodo', 'sm'), h('span.grow', h('b', tk.title), h('small', `${pname(tk.assignee_id)}${tk.due_date ? ` · ${fmtDate(tk.due_date)}` : ''}`)),
        h('button.icon-btn', { type: 'button', 'aria-label': L(`إزالة ${tk.title}`, `Remove ${tk.title}`), onclick: () => { st.tasks.splice(k, 1); paint(); } }, icon('x')))))
        : h('p.wk-sheet-meta', icon('info', 'sm'), L('اختياري — يمكن إضافة المهام لاحقاً من صفحة المشروع.', 'Optional — tasks can be added later from the project page.')));
  }

  function milestonesStep() {
    const title = h('input.field', { maxlength: 160, autocomplete: 'off', placeholder: L('مثال: إطلاق النسخة التجريبية', 'e.g. Pilot launch'), 'aria-label': L('المعلم', 'Milestone') });
    const due = h('input.field', { type: 'date', 'aria-label': L('التاريخ', 'Date'), min: st.start || null, max: st.due || null });
    const add = h('button.btn.tertiary', { type: 'button', onclick: () => {
      if (title.value.trim().length < 2) { title.setAttribute('aria-invalid', 'true'); title.focus(); return; }
      if (!due.value) { due.setAttribute('aria-invalid', 'true'); due.focus(); return; }
      st.milestones.push({ title: title.value.trim(), due_date: due.value }); st.milestones.sort((a, b) => a.due_date.localeCompare(b.due_date));
      paint();
    } }, icon('plus'), L('إضافة معلم', 'Add milestone'));
    noEnter(title, () => add.click()); noEnter(due, () => add.click());
    return h('div.wk-form',
      h('div.pf-add-box', h('h4.pf-add-title', icon('milestone', 'sm'), L('المحطات الرئيسية على الجدول الزمني', 'Key checkpoints on the timeline')),
        h('div.wk-form-grid', formField(L('المعلم', 'Milestone'), title), formField(L('التاريخ', 'Date'), due)), h('div.pf-add-actions', add)),
      st.milestones.length ? h('ul.pf-mini-list', st.milestones.map((m, k) => h('li', h('span.ms-glyph', { 'data-state': 'next', 'aria-hidden': 'true' }), h('span.grow', h('b', m.title), h('small', longDate(m.due_date))),
        h('button.icon-btn', { type: 'button', 'aria-label': L(`إزالة ${m.title}`, `Remove ${m.title}`), onclick: () => { st.milestones.splice(k, 1); paint(); } }, icon('x')))))
        : h('p.wk-sheet-meta', icon('info', 'sm'), L('اختياري — تظهر المعالم على الجدول الزمني للمحفظة.', 'Optional — milestones show on the portfolio timeline.')));
  }

  function reviewStep() {
    const d = deptById.get(st.dept);
    const pending = st.allocs.filter((a) => !a.cap?.approval?.auto).length;
    const row = (k, v) => h('div.pf-rev-row', h('dt', k), h('dd', v));
    return h('div.pf-review',
      h('dl.pf-rev', row(L('المشروع', 'Project'), st.name), row(L('الإدارة', 'Department'), L(d?.name_ar, d?.name_en)), row(L('المالك', 'Owner'), pname(st.owner)), row(L('الراعي', 'Sponsor'), pname(st.sponsor)),
        row(L('الفترة', 'Period'), periodText(st.start, st.due)), row(L('الميزانية', 'Budget'), st.budget === '' ? L('غير محددة', 'Not set') : fmtAED(Number(st.budget))),
        st.ref ? row(L('المبادرة', 'Initiative'), st.ref) : null, row(L('الإنجاز', 'Progress'), st.mode === 'tasks' ? L('تلقائياً من المهام', 'Automatic from tasks') : L('يحدّثه المالك', 'Reported by the owner'))),
      h('div.pf-rev-grid',
        h('div.pf-rev-box', h('b', fmtNum(st.allocs.length)), h('span', L('موارد', 'people')), h('small', st.allocs.length ? fteText(st.allocs.reduce((s, a) => s + a.percent, 0) / 100) : '—')),
        h('div.pf-rev-box', h('b', fmtNum(st.tasks.length)), h('span', L('مهام', 'tasks')), h('small', st.tasks.length ? L(`لـ${new Set(st.tasks.map((x) => x.assignee_id)).size} أشخاص`, `for ${new Set(st.tasks.map((x) => x.assignee_id)).size} people`) : '—')),
        h('div.pf-rev-box', h('b', fmtNum(st.milestones.length)), h('span', L('معالم', 'milestones')), h('small', st.milestones[0] ? fmtDate(st.milestones[0].due_date) : '—'))),
      h('div.callout.wk-note', icon('info'), h('span', L(`عند الإنشاء يظهر المشروع فوراً في المحفظة وعلى داشبورد ${pname(st.owner)} ومدير الإدارة${st.tasks.length ? '، ويتلقى كل مكلَّف تنبيهاً بمهمته' : ''}${pending ? `، وتُرسل ${fmtNum(pending)} ${pending === 1 ? 'طلب تخصيص' : 'طلبات تخصيص'} إلى المديرين للاعتماد` : ''}.`,
        `Once created, it appears in the portfolio and on the dashboards of ${pname(st.owner)} and the department’s manager${st.tasks.length ? '; every assignee is alerted' : ''}${pending ? `; ${pending} allocation request(s) go to managers for approval` : ''}.`))));
  }

  const r = await formSheet({
    title: L('مشروع استراتيجي جديد', 'New strategic project'), body, wide: true, submitLabel: L('التالي', 'Next'), extra: back, autofocus: true,
    onReady: (c) => { ctl = c; c.form.classList.add('pf-wizard-sheet'); paint(); },
    isValid: () => valid(st.step),
    onSubmit: async (c) => {
      if (st.step < LAST) { go(st.step + 1); return undefined; }
      const input = { name: st.name.trim(), department_id: st.dept, owner_id: st.owner, due_date: st.due, progress_mode: st.mode, sponsor_id: st.sponsor };
      if (st.start) input.start_date = st.start;
      if (st.desc.trim()) input.description = st.desc.trim();
      if (st.budget !== '') input.budget = Number(st.budget);
      if (st.ref.trim()) input.initiative_ref = st.ref.trim();
      if (st.allocs.length) input.allocations = st.allocs.map(({ cap, ...a }) => Object.fromEntries(Object.entries(a).filter(([, v]) => v !== undefined)));
      if (st.tasks.length) input.tasks = st.tasks.map((x) => Object.fromEntries(Object.entries(x).filter(([, v]) => v !== undefined)));
      if (st.milestones.length) input.milestones = st.milestones;
      const res = await runTool('create_strategic_project', input, { quiet: true, raw: true });
      if (!res || res.status === 'error') { c.setError(res?.error || L('تعذّر إنشاء المشروع', 'Could not create the project')); return undefined; }
      return res;
    },
  });
  if (!r?.result?.id) return;
  undoToast(L(`أُنشئ المشروع الاستراتيجي ${quote(r.result.name)}`, `Created the strategic project ${quote(r.result.name)}`), r);
  names.set(r.result.id, r.result.name); state.projectName = r.result.name; state.selectedProjectId = r.result.id;
  location.hash = `#/projects/${r.result.id}`;
  emit('data-changed', { entity: 'project', id: r.result.id });
}
