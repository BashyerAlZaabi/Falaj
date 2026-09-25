// Projects list (#/projects), project detail (#/projects/:id) and the
// new-project / new-task sheets. Layout: css/pages/work.css (wk-*).
import { api } from '../api.js';
import { h, icon, toast, confirmDialog, menu, segmented, skeleton, emptyState, dataTable, avatar } from '../ui.js';
import { L, t, fmtDate, fmtTime, fmtNum, getLang } from '../i18n.js';
import { state, emit } from '../state.js';
import { remember } from '../palette.js';
import * as Chat from '../chat.js';
import {
  projectCard, taskRow, runTool, progressBar, projectState, projectTone, progressGap, stateChip, countText, daysText, dayDiff, pctText,
  formSheet, formField, formGroup, choice, dateControl, assigneeSelect, projectOptions, textArea, quote, undoToast, PRIORITY, PRIORITY_ORDER,
  captureFocus, restoreFocus, quickAdd, searchBox, loadError, normalize,
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

export async function renderProjects(root, { soft } = {}) {
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
  page.append(listHead(null), h('div.wk-toolbar', { 'aria-hidden': 'true' }, h('div.sk.wk-sk-seg'), h('div.sk.wk-sk-search')),
    h('ul.wk-grid', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل المشاريع', 'Loading projects') }, [0, 1, 2].map(() => h('li', h('div.card.wk-proj.wk-sk-card', skeleton('card'))))));
  load.then((list) => buildList(page, list), (e) => page.replaceChildren(listHead(null), loadError(e, retry)));
}

function listHead(list) {
  return h('header.page-head.wk-head',
    h('div.wk-titles',
      h('h1', L('المشاريع', 'Projects')),
      h('p.sub', list ? (list.length ? L(`${countText(list.length, 'project')} ضمن نطاقك`, `${countText(list.length, 'project')} in your scope`) : L('لا مشاريع ضمن نطاقك بعد', 'No projects in your scope yet')) : L('جارٍ التحميل…', 'Loading…'))),
    h('div.actions',
      h('button.btn.primary.wk-new', { type: 'button', 'aria-label': L('مشروع جديد', 'New project'), onclick: () => newProject() }, icon('plus'), h('span.wk-new-label', L('مشروع جديد', 'New project')))));
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
  page.replaceChildren(listHead(list),
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
      h('span.eyebrow.wk-eyebrow', icon('building', 'sm'), L(p.dept_ar, p.dept_en) || L('مشروع', 'Project')),
      h('h1', p.name),
      h('div.wk-head-chips', stateChip(s, { tiny: false }), p.is_demo ? h('span.chip.demo', t('demo')) : null, !p.can_edit ? h('span.chip.outline', icon('lock'), L('اطلاع فقط', 'View only')) : null),
      p.description ? h('p.sub', p.description) : null),
    h('div.actions',
      h('button.btn.tertiary.wk-ask', { type: 'button', onclick: () => Chat.focus(L('بخصوص هذا المشروع: ', 'About this project: ')) }, icon('spark'), L('ناقش مع المساعد', 'Discuss with assistant')),
      moreButton(p)));
  page.replaceChildren(head, prompts(p), h('div.wk-detail-grid', progressCard(p), detailsCard(p)), tasksCard(p));
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
    p.can_edit ? progressEditor(p) : null,
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
  const body = h('div.wk-form',
    formField(L('اسم المشروع', 'Project name'), name, { required: true }),
    h('div.wk-form-grid', formGroup(optional(L('تاريخ البدء', 'Start date')), start), formGroup(optional(L('تاريخ الاستحقاق', 'Due date')), due)),
    formGroup(L('الحالة', 'Status'), status),
    formField(optional(L('الوصف', 'Description')), desc),
    h('p.wk-sheet-meta', L('تُحدَّث نسبة الإنجاز من بطاقة «نسبة الإنجاز» في صفحة المشروع.', 'Progress is updated from the Progress card on the project page.')));
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

export async function newTask(p) {
  const here = !p && state.route === 'projects' && state.params?.[0] ? { id: state.params[0], name: state.projectName } : null;
  const ctx = p || here;
  const title = h('input.field', { maxlength: 200, autocomplete: 'off', placeholder: L('ما الذي يجب إنجازه؟', 'What needs to be done?') });
  const who = assigneeSelect(state.me?.user?.id);
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
