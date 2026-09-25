// ADAA I — monitoring dashboard (outside Vault). Open an indicator, discuss it
// with the assistant, drill into details and take a permitted action.
// Every number on this screen comes from /api/kpis (plus /api/projects and
// /api/tasks for drill-in details); the tables below only label and explain it.
import { api } from '../api.js';
import { h, icon, modal, toast, menu, segmented, skeleton, emptyState, errorState, dataTable } from '../ui.js';
import { L, t, fmtNum, fmtDate, fmtTime, getLang } from '../i18n.js';
import { runTool, undo, statusLabel } from '../widgets.js';
import * as Chat from '../chat.js';
import { state } from '../state.js';

// ---------- presentation metadata (labels & definitions, never values) ----------
const GROUPS = [['projects', 'المشاريع', 'Projects'], ['tasks', 'المهام', 'Tasks'], ['other', 'مؤشرات أخرى', 'Other indicators']];
const KPI = {
  active_projects: { group: 'projects', icon: 'folder', def: ['عدد المشاريع التي حالتها «نشط» ضمن نطاقك.', 'Projects whose status is “active” within your scope.'] },
  delayed_projects: { group: 'projects', icon: 'hourglass', def: ['مشاريع نشطة أو معلّقة تجاوزت تاريخ الاستحقاق.', 'Active or on-hold projects that are past their due date.'], rule: ['تظهر الحالة «حرج» عند وجود مشروع متأخر واحد على الأقل.', 'Shows “Critical” when at least one project is delayed.'] },
  avg_progress: { group: 'projects', icon: 'gauge', def: ['متوسط نسب الإنجاز للمشاريع النشطة التي سجّلت نسبة فقط؛ المشروع الذي لم يسجّل نسبته لا يُحتسب صفراً.', 'Average progress of active projects that report it; a project without a reported figure is not counted as zero.'] },
  task_completion: { group: 'tasks', icon: 'listChecks', def: ['نسبة المهام المنجزة من إجمالي المهام ضمن نطاقك.', 'Share of tasks marked done out of all tasks in your scope.'] },
  overdue_tasks: { group: 'tasks', icon: 'timer', def: ['مهام لم تُنجز بعد وتجاوزت تاريخ الاستحقاق.', 'Tasks not yet done that are past their due date.'], rule: ['تظهر الحالة «تنبيه» عند وجود مهمة متأخرة واحدة على الأقل.', 'Shows “Warning” when at least one task is overdue.'] },
  week_done: { group: 'tasks', icon: 'checkCheck', def: ['مهام أُنجزت منذ بداية الأسبوع (الأحد).', 'Tasks completed since the start of the week (Sunday).'] },
};
// Human names for the provenance fields the server reports (raw name stays in the tooltip)
const SOURCES = {
  projects: ['سجلّ المشاريع · الحالة', 'Projects register · status'],
  'projects.due_date, projects.status': ['المشاريع · تاريخ الاستحقاق والحالة', 'Projects · due date and status'],
  'projects.progress': ['المشاريع · نسبة الإنجاز المسجّلة', 'Projects · reported progress'],
  'tasks.status': ['المهام · الحالة', 'Tasks · status'],
  'tasks.due_date, tasks.status': ['المهام · تاريخ الاستحقاق والحالة', 'Tasks · due date and status'],
  'tasks.completed_at': ['المهام · تاريخ الإنجاز', 'Tasks · completion date'],
};
const STATUS = {
  good: { cls: 'good', icon: 'circleCheck', label: ['سليم', 'On track'] },
  warning: { cls: 'warn', icon: 'alert', label: ['تنبيه', 'Warning'] },
  critical: { cls: 'crit', icon: 'circleAlert', label: ['حرج', 'Critical'] },
};
const SCOPES = { organisation: ['المؤسسة', 'Organisation', 'building'], department: ['الإدارة', 'Department', 'people'], personal: ['شخصي', 'Personal', 'user'] };
const SORTS = [['attention', 'ما يحتاج متابعة أولاً', 'Needs attention first'], ['low', 'الأقل إنجازاً أولاً', 'Lowest progress first'], ['high', 'الأعلى إنجازاً أولاً', 'Highest progress first'], ['name', 'حسب الاسم', 'By name']];
const TASK_STATES = ['done', 'in_progress', 'todo'];
// Deep links into the task list (the Tasks view picks the matching filter from the route)
const TASK_LINKS = { overdue_tasks: '#/tasks/overdue', week_done: '#/tasks/done', task_completion: '#/tasks/all' };

const ui = { filter: 'all', sort: 'attention' }; // chart controls survive live refreshes
let lastValues = new Map(); // KPI key → value, to highlight what changed after a refresh
let drillOpen = false; // guards against a double tap opening two sheets

// ---------- formatting ----------
// Percent inside running text: isolate (LRI…PDI) so Arabic context can't flip it to "%49"
const pct = (v) => (v == null ? '—' : `\u2066${fmtNum(v)}%\u2069`);
const pctRaw = (v) => (v == null ? '—' : `${v}%`); // plain form for the assistant prompt
const num = (v, unit) => h('span.adaa-num', v == null ? [h('span', { 'aria-hidden': 'true' }, '—'), h('span.sr-only', L('غير متاح', 'not available'))] : [fmtNum(v), unit ? h('span.unit', unit) : null]);
const parseTs = (s) => (s ? new Date(s.endsWith('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z') : null);
const stamp = (s) => `${fmtDate(s)} ${fmtTime(s)}`;
function ago(s) {
  const d = parseTs(s); if (!d || Number.isNaN(+d)) return '';
  const sec = Math.round((d - Date.now()) / 1000); const a = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat(getLang() === 'ar' ? 'ar-AE' : 'en', { numeric: 'auto' });
  if (a < 45) return L('الآن', 'just now');
  if (a < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  return rtf.format(Math.round(sec / 86400), 'day');
}
// Arabic counted nouns (١ مشروع واحد · ٢ مشروعان/مشروعين · ٣–١٠ مشاريع · ١١+ مشروعاً)
const arRules = new Intl.PluralRules('ar');
const NOUNS = {
  project: { one: 'مشروع واحد', two: 'مشروعان', twoGen: 'مشروعين', few: 'مشاريع', many: 'مشروعاً', other: 'مشروع', en: ['project', 'projects'] },
  task: { one: 'مهمة واحدة', two: 'مهمتان', twoGen: 'مهمتين', few: 'مهام', many: 'مهمة', other: 'مهمة', en: ['task', 'tasks'] },
};
function count(n, noun, { gen = false } = {}) {
  const f = NOUNS[noun];
  if (getLang() === 'en') return `${fmtNum(n)} ${f.en[n === 1 ? 0 : 1]}`;
  const c = arRules.select(n);
  if (c === 'one') return f.one;
  if (c === 'two') return gen ? f.twoGen : f.two;
  return `${fmtNum(n)} ${f[c] || f.other}`;
}
function lateBy(days, fem = false) {
  if (!days) return fem ? L('متأخرة', 'Overdue') : L('متأخر', 'Delayed');
  if (getLang() === 'en') return `${fmtNum(days)} ${days === 1 ? 'day' : 'days'} late`;
  const w = fem ? 'متأخرة' : 'متأخر'; const c = arRules.select(days);
  if (c === 'one') return `${w} يوماً واحداً`;
  if (c === 'two') return `${w} يومين`;
  if (c === 'few') return `${w} ${fmtNum(days)} أيام`;
  if (c === 'many') return `${w} ${fmtNum(days)} يوماً`;
  return `${w} ${fmtNum(days)} يوم`;
}
const kpiLabel = (item) => L(item.label_ar, item.label_en).replace(/\s*\([^)]*\)\s*$/, ''); // qualifier moves to the context line
const sourceLabel = (s) => (SOURCES[s] ? L(...SOURCES[s]) : s || '—');
const scopeName = (k) => { const s = SCOPES[k.scope]; return s ? L(s[0], s[1]) : k.scope || '—'; };
const todayISO = () => new Date().toISOString().slice(0, 10);
const daysLate = (p) => p.days_overdue || (p.delayed && p.due_date ? Math.max(1, Math.round((Date.parse(todayISO()) - Date.parse(p.due_date)) / 864e5)) : 0);
const projState = (p) => (p.delayed ? 'late' : p.at_risk ? 'risk' : p.progress == null ? 'missing' : 'ok');
const needsAttention = (p) => projState(p) !== 'ok';
const weekStart = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); d.setUTCDate(d.getUTCDate() - d.getUTCDay()); return d.toISOString(); };

function statusChip(status, { tiny = true } = {}) {
  const s = STATUS[status]; if (!s) return null;
  return h(`span.chip.adaa-status.${s.cls}${tiny ? '.tiny' : ''}`, icon(s.icon), h('span.adaa-status-label', L(...s.label)));
}

function sortProjects(list, by) {
  const rank = { late: 0, risk: 1, missing: 2, ok: 3 };
  const cmp = {
    attention: (a, b) => rank[projState(a)] - rank[projState(b)] || daysLate(b) - daysLate(a) || (a.progress ?? 101) - (b.progress ?? 101),
    low: (a, b) => (a.progress ?? 999) - (b.progress ?? 999),
    high: (a, b) => (b.progress ?? -1) - (a.progress ?? -1),
    name: (a, b) => String(a.name).localeCompare(String(b.name), getLang()),
  }[by] || (() => 0);
  return [...list].sort(cmp);
}

// ---------- page ----------
export async function renderAdaa(root, _params, { soft } = {}) {
  const page = h('div.adaa');
  root.append(page);
  const run = () => api('/api/kpis').then((k) => paint(page, k)).catch((e) => paintError(page, e, retry));
  const retry = () => { paintSkeleton(page); run(); };
  // Live refreshes keep the current screen until fresh numbers arrive; a normal
  // visit shows the skeleton straight away instead of the previous screen.
  if (soft) { await run(); return; }
  paintSkeleton(page);
  run();
}

function paint(page, k) {
  page.replaceChildren(header(page, k), kpiSection(k), h('div.adaa-panels', progressCard(k), deptCard(k)));
  lastValues = new Map((k.items || []).map((i) => [i.key, i.value]));
  startTicker();
}

function paintSkeleton(page) {
  const tiles = (n) => h('div.adaa-kpis', Array.from({ length: n }, () => h('div.card.adaa-kpi.is-skel', skeleton('stat'))));
  page.replaceChildren(header(page, null),
    h('div.adaa-groups', { 'aria-busy': 'true' }, GROUPS.slice(0, 2).map(([, ar, en]) => h('section.adaa-group', h('h2.adaa-group-title', L(ar, en)), tiles(3)))),
    h('div.adaa-panels', h('section.card', h('div.sk.sk-title'), skeleton('list', 4)), h('section.card', h('div.sk.sk-title'), skeleton('table', 3))));
}

function paintError(page, e, retry) {
  const box = errorState({ message: L('تعذّر تحميل مؤشرات ADAA I. تحقّق من الاتصال ثم أعد المحاولة — لم تتغيّر أي بيانات.', 'The ADAA I indicators could not be loaded. Check your connection and try again — no data was changed.') }, retry);
  box.querySelector('h4')?.replaceChildren(L('تعذّر تحميل المؤشرات', 'Could not load the indicators'));
  if (e?.message) box.append(h('details.adaa-tech', h('summary', L('التفاصيل التقنية', 'Technical details')), h('code', e.message)));
  page.replaceChildren(header(page, null, { loading: false, retry }), h('section.card.adaa-error', box));
}

async function refresh(page, btn) {
  btn.classList.add('is-busy'); btn.disabled = true;
  try {
    const k = await api('/api/kpis');
    paint(page, k);
    const live = page.querySelector('.adaa-live');
    if (live) live.textContent = L('حُدّثت المؤشرات الآن', 'Indicators refreshed');
  } catch (e) {
    btn.classList.remove('is-busy'); btn.disabled = false;
    toast(`${L('تعذّر تحديث المؤشرات', 'Could not refresh the indicators')}: ${e.message}`, { kind: 'error' });
  }
}

// Relative "updated" time keeps itself current while the page is open
let ticker = null;
function startTicker() {
  if (ticker) return;
  ticker = setInterval(() => {
    const els = document.querySelectorAll('.adaa time[data-rel]');
    if (!els.length) { clearInterval(ticker); ticker = null; return; }
    els.forEach((el) => { el.textContent = ago(el.getAttribute('datetime')); });
  }, 30000);
}

function header(page, k, { loading = !k, retry } = {}) {
  const scope = k && SCOPES[k.scope];
  const askLabel = L('ناقش المؤشرات', 'Discuss indicators');
  const refreshLabel = L('تحديث المؤشرات', 'Refresh indicators');
  return h('header.page-head.adaa-head',
    h('div.adaa-head-row',
      h('div.adaa-titles', h('span.eyebrow', 'ADAA I'), h('h1', L('الرقابة والمتابعة', 'Monitoring & follow\u2011up'))),
      h('div.adaa-head-actions',
        h('button.icon-btn.adaa-refresh', { type: 'button', 'aria-label': refreshLabel, 'data-tip': refreshLabel, 'data-tip-pos': 'bottom', disabled: !k && !retry, onclick: (e) => (k ? refresh(page, e.currentTarget) : retry?.()) }, icon('refresh')),
        h('button.btn.tertiary.adaa-ask', { type: 'button', 'aria-label': askLabel, disabled: !k, onclick: () => Chat.focus(L(`بخصوص مؤشرات ADAA I (النطاق: ${scopeName(k)}): `, `About the ADAA I indicators (scope: ${scopeName(k)}): `)) }, icon('spark'), h('span.adaa-btn-label', askLabel)))),
    h('div.adaa-meta',
      k ? h('span.chip.adaa-scope', icon(scope?.[2] || 'building'), `${L('النطاق', 'Scope')}: ${scopeName(k)}`) : loading ? h('span.sk.adaa-sk-chip', { 'aria-hidden': 'true' }) : null,
      k ? h('span.adaa-updated', { title: stamp(k.generated_at) }, icon('clock'), t('dash.updated'), h('time', { datetime: k.generated_at, 'data-rel': '' }, ago(k.generated_at))) : null,
      h('span.adaa-vault', icon('lock'), L('بيانات FS ومرصاد تبقى داخل Vault ولا تظهر هنا', 'FS & Marsad data stays inside Vault and never appears here'))),
    h('div.sr-only.adaa-live', { role: 'status', 'aria-live': 'polite' }));
}

// ---------- KPI tiles ----------
function kpiSection(k) {
  const items = k.items || [];
  if (!items.length) {
    return h('section.card', emptyState({ icon: 'gauge', title: L('لا مؤشرات ضمن نطاقك', 'No indicators in your scope'),
      body: L('ستظهر هنا مؤشرات المشاريع والمهام بمجرد وجود أعمال ضمن نطاقك.', 'Project and task indicators appear here as soon as there is work in your scope.'),
      actions: [{ label: L('عرض المشاريع', 'View projects'), icon: 'folder', onClick: () => { location.hash = '#/projects'; } }] }));
  }
  const by = new Map();
  for (const item of items) { const g = KPI[item.key]?.group || 'other'; if (!by.has(g)) by.set(g, []); by.get(g).push(item); }
  return h('div.adaa-groups', GROUPS.filter(([g]) => by.has(g)).map(([g, ar, en]) => h('section.adaa-group', { 'aria-labelledby': `adaa-g-${g}` },
    h('h2.adaa-group-title', { id: `adaa-g-${g}` }, L(ar, en)),
    h('div.adaa-kpis', by.get(g).map((item) => kpiTile(item, k))))));
}

function kpiContext(item, k) {
  const ps = k.projects || [];
  const active = ps.filter((p) => p.status === 'active');
  switch (item.key) {
    case 'active_projects': return L(`من أصل ${count(ps.length, 'project', { gen: true })} ضمن النطاق`, `of ${count(ps.length, 'project')} in scope`);
    case 'delayed_projects': {
      const risk = ps.filter((p) => p.at_risk).length;
      return [L(`من أصل ${count(ps.length, 'project', { gen: true })}`, `of ${count(ps.length, 'project')}`), risk ? L(`معرّضة للتأخر: ${fmtNum(risk)}`, `at risk: ${fmtNum(risk)}`) : null].filter(Boolean).join(' · ');
    }
    case 'avg_progress': {
      if (!ps.length) return item.note_ar ? L(item.note_ar, item.note_en) : '';
      const n = active.filter((p) => p.progress != null).length;
      return L(`${fmtNum(n)} من ${fmtNum(active.length)} سجّلت نسبة إنجاز`, `${fmtNum(n)} of ${fmtNum(active.length)} report progress`);
    }
    case 'task_completion': return item.note_ar ? L(`${item.note_ar} منجزة`, `${item.note_en} done`) : '';
    case 'overdue_tasks': return L('غير منجزة وتجاوزت موعدها', 'Open and past due');
    case 'week_done': return L('منذ يوم الأحد', 'Since Sunday');
    default: return item.note_ar ? L(item.note_ar, item.note_en) : '';
  }
}

function kpiTile(item, k) {
  const meta = KPI[item.key] || { icon: 'gauge' };
  const vid = `adaa-kv-${item.key}`; const cid = `adaa-kc-${item.key}`;
  const changed = lastValues.has(item.key) && lastValues.get(item.key) !== item.value;
  // Per-tile time only when it differs from the page's "updated" time
  const own = item.updated_at && fmtTime(item.updated_at) !== fmtTime(k.generated_at) ? fmtTime(item.updated_at) : null;
  const ctx = [kpiContext(item, k), own].filter(Boolean).join(' · ');
  return h(`article.card.interactive.adaa-kpi${changed ? '.flash' : ''}`, { 'data-kpi': item.key, 'data-status': item.status || null },
    h('div.adaa-kpi-top',
      h('span.adaa-kpi-icon', { 'aria-hidden': 'true' }, icon(meta.icon)),
      h('h3.adaa-kpi-title', h('button.adaa-kpi-hit', { type: 'button', 'aria-haspopup': 'dialog', 'aria-describedby': `${vid} ${cid}`, onclick: () => openKpi(item, k) }, h('span.adaa-kpi-label', kpiLabel(item)))),
      icon('chevron', 'sm flip-rtl adaa-kpi-chev')),
    h('div.adaa-kpi-value', { id: vid }, num(item.value, item.unit), statusChip(item.status)),
    h('div.adaa-kpi-ctx', { id: cid }, ctx));
}

// ---------- project progress (horizontal bullet bars, rendered here so labels stay readable at any width) ----------
function progressCard(k) {
  const all = k.projects || [];
  const attn = all.filter(needsAttention).length;
  const slot = h('div.adaa-bars-slot');
  let filterCtl = null;
  const draw = () => {
    if (!all.length) {
      slot.replaceChildren(emptyState({ compact: true, icon: 'folder', title: L('لا مشاريع ضمن نطاقك', 'No projects in your scope'),
        body: L('ستظهر هنا نسب الإنجاز عند إسناد مشاريع إليك أو إلى إدارتك.', 'Progress appears here once projects are assigned to you or your department.'),
        actions: [{ label: L('عرض المشاريع', 'View projects'), onClick: () => { location.hash = '#/projects'; } }] }));
      return;
    }
    const rows = sortProjects(ui.filter === 'attention' ? all.filter(needsAttention) : all, ui.sort);
    slot.replaceChildren(rows.length ? barList(rows) : emptyState({ compact: true, icon: 'circleCheck', title: L('لا مشاريع تحتاج متابعة', 'Nothing needs attention'),
      body: L('كل المشاريع ضمن المسار وسجّلت نسب إنجازها.', 'Every project is on track and reporting its progress.'),
      actions: [{ label: L('عرض كل المشاريع', 'Show all projects'), onClick: () => filterCtl?.querySelector('[data-v="all"]')?.click() }] }));
  };
  if (all.length) {
    filterCtl = segmented([['all', L('الكل', 'All'), fmtNum(all.length)], ['attention', L('تحتاج متابعة', 'Needs attention'), fmtNum(attn)]], ui.filter, (v) => { ui.filter = v; draw(); }, { label: L('تصفية المشاريع', 'Filter projects') });
  }
  const sortLabel = L('ترتيب المشاريع', 'Sort projects');
  const sortBtn = h('button.icon-btn', { type: 'button', 'aria-label': sortLabel, 'data-tip': sortLabel, 'aria-haspopup': 'menu', 'aria-expanded': 'false',
    onclick: (e) => menu(e.currentTarget, [{ title: L('ترتيب حسب', 'Sort by') }, ...SORTS.map(([v, ar, en]) => ({ label: L(ar, en), checked: ui.sort === v, onClick: () => { ui.sort = v; draw(); } }))], { width: 240 }) }, icon('sort'));
  draw();
  return h('section.card.adaa-progress', { 'aria-labelledby': 'adaa-progress-title' },
    h('div.card-head.adaa-card-head',
      h('div.grow', h('h2.card-title#adaa-progress-title', L('نسبة إنجاز المشاريع', 'Project progress')), h('div.card-sub', L('الإنجاز المسجّل مقارنةً بالمتوقع حتى اليوم', 'Reported progress against what is expected by today'))),
      all.length ? h('div.adaa-controls', filterCtl, sortBtn) : null),
    slot,
    all.length ? legend(all) : null);
}

function barList(rows) { return h('ul.adaa-bars', rows.map(barRow)); }

function barRow(p) {
  const st = projState(p);
  const exp = p.status === 'active' && p.expected_progress != null ? p.expected_progress : null;
  const chip = st === 'late' ? h('span.chip.tiny.crit', icon('circleAlert'), lateBy(daysLate(p)))
    : st === 'risk' ? h('span.chip.tiny.warn', icon('alert'), L('معرّض للتأخر', 'At risk')) : null;
  const meta = [L(p.dept_ar, p.dept_en), p.due_date ? `${L('الاستحقاق', 'Due')} ${fmtDate(p.due_date)}` : null].filter(Boolean).join(' · ');
  return h('li', h('a.adaa-bar', { href: `#/projects/${p.id}`, 'data-state': st, title: p.name, onclick: () => { state.selectedProjectId = p.id; } },
    h('span.adaa-bar-label', h('span.adaa-bar-name', p.name), h('span.adaa-bar-meta', chip, meta ? h('span', meta) : null)),
    h('span.adaa-track', { 'aria-hidden': 'true' },
      p.progress != null ? h('i.adaa-fill', { style: { width: `${Math.max(0, Math.min(100, p.progress))}%` } }) : null,
      exp != null ? h('i.adaa-expected', { style: { insetInlineStart: `${exp}%` } }) : null),
    h('span.adaa-bar-value', p.progress == null ? h('span.adaa-missing', L('غير مسجّل', 'Not reported')) : num(p.progress, '%')),
    exp != null ? h('span.sr-only', `${L('المتوقع حتى اليوم', 'Expected by today')} ${pct(exp)}`) : null,
    icon('chevron', 'sm flip-rtl adaa-chev')));
}

function legend(ps) {
  const has = (s) => ps.some((p) => projState(p) === s);
  const items = [
    ['ok', L('ضمن المسار', 'On track')],
    has('risk') && ['risk', L('معرّض للتأخر', 'At risk')],
    has('late') && ['late', L('متأخر', 'Delayed')],
    has('missing') && ['missing', L('غير مسجّل — لا يُحتسب صفراً', 'Not reported — not counted as zero')],
    ps.some((p) => p.status === 'active' && p.expected_progress != null) && ['expected', L('المتوقع حتى اليوم', 'Expected by today')],
  ].filter(Boolean);
  return h('div.adaa-legend-row',
    h('div.legend', items.map(([s, l]) => h('span', h(`i.adaa-sw.${s}`), l))),
    h('span.adaa-source', { title: 'projects.progress' }, `${t('dash.source')}: ${sourceLabel('projects.progress')}`));
}

// ---------- by department ----------
function deptCard(k) {
  const depts = k.by_department || [];
  if (!(depts.length > 1 || state.me.user.role !== 'employee')) {
    return h('div.callout.adaa-note', icon('info'), h('span', L('تظهر مقارنة الإدارات عندما يشمل نطاقك أكثر من إدارة.', 'The department comparison appears when your scope covers more than one department.')));
  }
  const tot = depts.reduce((a, d) => ({ projects: a.projects + (d.projects || 0), delayed: a.delayed + (d.delayed || 0), sum: a.sum + (d.progress_sum || 0), n: a.n + (d.progress_n || 0) }), { projects: 0, delayed: 0, sum: 0, n: 0 });
  const avg = tot.n ? Math.round(tot.sum / tot.n) : null;
  const avgCell = (v) => h('div.adaa-avg', v == null
    ? [h('div.progress.missing', { 'aria-hidden': 'true' }), h('span.adaa-missing', L('غير مسجّل', 'Not reported'))]
    : [h('div.progress', { 'aria-hidden': 'true' }, h('i', { style: { width: `${v}%` } })), num(v, '%')]);
  const table = dataTable({
    columns: [
      { key: 'name', label: L('الإدارة', 'Department'), sort: (d) => L(d.name_ar, d.name_en), render: (d) => h('span.adaa-dept-name', L(d.name_ar, d.name_en)) },
      { key: 'projects', label: L('المشاريع', 'Projects'), num: true, width: '104px', sort: (d) => d.projects, render: (d) => h('span.adaa-count-cell', fmtNum(d.projects)) },
      { key: 'delayed', label: L('المتأخرة', 'Delayed'), num: true, width: '104px', sort: (d) => d.delayed, render: (d) => (d.delayed ? h('span.adaa-late-count', h('i.dot', { 'aria-hidden': 'true' }), fmtNum(d.delayed)) : h('span.adaa-zero', fmtNum(0))) },
      { key: 'avg', label: L('متوسط الإنجاز', 'Avg progress'), width: '36%', sort: (d) => d.avg_progress, render: (d) => avgCell(d.avg_progress) },
    ],
    rows: depts, sortKey: 'delayed', sortDir: 'desc', stackMobile: false,
    caption: L('ملخص الإنجاز حسب الإدارة — اختر إدارة لعرض مشاريعها', 'Progress by department — choose a department to see its projects'),
    onRow: (d) => openDept(d, k),
    empty: emptyState({ compact: true, icon: 'building', title: L('لا إدارات ضمن النطاق', 'No departments in scope') }),
  });
  return h('section.card.adaa-dept', { 'aria-labelledby': 'adaa-dept-title' },
    h('div.card-head', h('div.grow', h('h2.card-title#adaa-dept-title', L('حسب الإدارة', 'By department')),
      h('div.card-sub', L(`الإجمالي: ${count(tot.projects, 'project')} · المتأخرة: ${fmtNum(tot.delayed)} · متوسط الإنجاز: ${pct(avg)}`, `Total: ${count(tot.projects, 'project')} · delayed: ${fmtNum(tot.delayed)} · avg progress: ${pct(avg)}`)))),
    table);
}

// ---------- drill-in sheets ----------
// Wraps modal(): the body carries its own action bar (so it can stay pinned
// under a scrolling list), the sheet closes itself on navigation, starts on the
// close button (a stray Enter must not jump into chat) and resolves with the
// chosen action.
function openSheet(title, body) {
  drillOpen = true;
  let choice = null;
  const opener = document.activeElement;
  const openerKey = opener?.closest?.('[data-kpi]')?.dataset.kpi;
  const shown = modal(title, body, []);
  const dlg = body.closest('.modal');
  dlg?.classList.add('adaa-sheet');
  const close = (v = null) => { choice = v; dlg?.querySelector('.modal-close')?.click(); };
  const onNav = () => close('nav');
  window.addEventListener('hashchange', onNav);
  setTimeout(() => dlg?.querySelector('.modal-close')?.focus(), 50);
  const done = shown.then(() => {
    drillOpen = false;
    window.removeEventListener('hashchange', onNav);
    // A live refresh may have re-rendered the page underneath: return focus to the same tile.
    if (!choice && openerKey && !opener.isConnected) setTimeout(() => document.querySelector(`.adaa [data-kpi="${openerKey}"] .adaa-kpi-hit`)?.focus(), 240);
    return choice;
  });
  return { close, done };
}

function sheetBody(content, actions) {
  return h('div.adaa-drill', h('div.adaa-drill-body', content), actions?.length ? h('div.adaa-sheet-actions', actions) : null);
}

function openKpi(item, k) {
  if (drillOpen) return;
  const label = kpiLabel(item);
  const meta = KPI[item.key] || {};
  const ctx = kpiContext(item, k);
  const relatedSlot = h('div.adaa-related');
  const countEl = h('span.adaa-count');
  let relatedText = []; // what the assistant should know about the related items
  const projectKey = ['delayed_projects', 'avg_progress', 'active_projects'].includes(item.key);
  const taskKey = !!TASK_LINKS[item.key];

  const pinBtn = h('button.btn', { type: 'button', onclick: () => pin(item, label, pinBtn) }, icon('pin'), L('أضف إلى الداشبورد', 'Add to dashboard'));
  const chatBtn = h('button.btn.primary', { type: 'button', onclick: () => sheet.close('chat') }, icon('chat'), L('ناقش مع المساعد', 'Discuss with assistant'));
  const body = sheetBody([
    h('div.adaa-hero', h('div.adaa-hero-value', num(item.value, item.unit), statusChip(item.status, { tiny: false })), ctx ? h('p.adaa-hero-ctx', ctx) : null),
    meta.def ? h('div.callout.adaa-about', icon('info'), h('div', h('strong', L('كيف يُحسب؟', 'How is it calculated?')), h('p', L(...meta.def)), meta.rule ? h('p', L(...meta.rule)) : null)) : null,
    projectKey || taskKey ? [h('h4.adaa-sec', item.key === 'task_completion' ? L('توزيع المهام حسب الحالة', 'Tasks by status') : L('العناصر المرتبطة', 'Related items'), countEl), relatedSlot] : null,
    h('div.kv.adaa-facts',
      h('span', t('dash.source')), h('span', { title: item.source || '' }, sourceLabel(item.source)),
      h('span', L('آخر تحديث', 'Last updated')), h('span', stamp(item.updated_at)),
      h('span', L('النطاق', 'Scope')), h('span', scopeName(k))),
  ], [pinBtn, chatBtn]);
  const sheet = openSheet(label, body);

  // Already pinned? (read-only check of the user's own dashboard)
  api('/api/dashboard').then((d) => { if ((d.layout || []).some((w) => w.type === 'kpi' && w.filters?.metric === item.key)) setPinned(pinBtn, true); }).catch(() => {});

  if (projectKey) {
    const pick = (list) => list.filter((p) => (item.key === 'delayed_projects' ? p.delayed : p.status === 'active'));
    const fill = (list) => {
      const rows = sortProjects(pick(list), 'attention');
      countEl.textContent = fmtNum(rows.length);
      relatedText = rows.map((p) => (p.delayed ? `${p.name} (${lateBy(daysLate(p))}، ${pctRaw(p.progress)})` : `${p.name} (${pctRaw(p.progress)})`));
      relatedSlot.replaceChildren(rows.length ? barList(rows) : emptyState({ compact: true, icon: 'circleCheck', title: item.key === 'delayed_projects' ? L('لا مشاريع متأخرة', 'No delayed projects') : L('لا مشاريع نشطة', 'No active projects') }));
    };
    fill(k.projects || []); // instant, from the numbers already on screen…
    api('/api/projects').then((full) => { if (body.isConnected) fill(full); }).catch(() => {}); // …then the full records (exact days overdue)
  } else if (taskKey) {
    const load = () => {
      relatedSlot.replaceChildren(skeleton('list', 3));
      const q = item.key === 'overdue_tasks' ? '?overdue=1' : item.key === 'week_done' ? '?status=done' : '';
      api(`/api/tasks${q}`).then((list) => {
        if (!body.isConnected) return;
        const since = weekStart();
        const rows = item.key === 'week_done' ? list.filter((x) => x.completed_at && x.completed_at >= since) : list;
        if (item.key === 'task_completion') { countEl.textContent = fmtNum(rows.length); relatedSlot.replaceChildren(taskBreakdown(rows), moreLink(item.key, rows.length)); return; }
        countEl.textContent = fmtNum(rows.length);
        relatedText = rows.slice(0, 5).map((x) => x.title);
        relatedSlot.replaceChildren(rows.length ? h('ul.adaa-tasks', rows.slice(0, 6).map(taskItem)) : emptyState({ compact: true, icon: 'circleCheck', title: item.key === 'overdue_tasks' ? L('لا مهام متأخرة', 'No overdue tasks') : L('لم تُنجز مهام هذا الأسبوع بعد', 'Nothing completed this week yet') }), rows.length ? moreLink(item.key, rows.length) : null);
      }).catch((e) => { if (body.isConnected) relatedSlot.replaceChildren(h('div.adaa-inline-error', errorState(e, load))); });
    };
    load();
  }

  sheet.done.then((choice) => {
    if (choice !== 'chat') return;
    const v = item.value == null ? '—' : `${item.value}${item.unit || ''}`;
    const st = STATUS[item.status];
    const rel = relatedText.slice(0, 5);
    // after the sheet has handed focus back, so the composer keeps it
    setTimeout(() => Chat.focus(L(
      `بخصوص مؤشر «${label}» (${v} · النطاق: ${scopeName(k)}${st ? ` · الحالة: ${st.label[0]}` : ''})${rel.length ? ` — ${rel.join('، ')}` : ''}: `,
      `About the “${label}” indicator (${v} · scope: ${scopeName(k)}${st ? ` · status: ${st.label[1]}` : ''})${rel.length ? ` — ${rel.join('; ')}` : ''}: `)), 240);
  });
}

function moreLink(key, n) {
  return h(`a.btn.sm.tertiary.adaa-more`, { href: TASK_LINKS[key] }, L(`عرض الكل في المهام (${fmtNum(n)})`, `View all in Tasks (${fmtNum(n)})`), icon('chevron', 'sm flip-rtl'));
}

function taskItem(tk) {
  const late = tk.overdue && tk.due_date ? Math.max(1, Math.round((Date.parse(todayISO()) - Date.parse(tk.due_date)) / 864e5)) : 0;
  return h('li', h('a.adaa-task', { href: tk.project_id ? `#/projects/${tk.project_id}` : '#/tasks', onclick: () => { state.selectedTaskId = tk.id; if (tk.project_id) state.selectedProjectId = tk.project_id; } },
    h('span.adaa-task-main', h('span.adaa-task-title', tk.title),
      h('span.adaa-task-meta', [tk.project_name, tk.due_date ? `${L('الاستحقاق', 'Due')} ${fmtDate(tk.due_date)}` : null, L(tk.assignee_ar, tk.assignee_en)].filter(Boolean).join(' · '))),
    tk.overdue ? h('span.chip.tiny.crit', icon('circleAlert'), lateBy(late, true)) : tk.status === 'done' ? h('span.chip.tiny.good', icon('check'), statusLabel('done')) : null,
    icon('chevron', 'sm flip-rtl adaa-chev')));
}

function taskBreakdown(tasks) {
  const c = Object.fromEntries(TASK_STATES.map((s) => [s, tasks.filter((x) => x.status === s).length]));
  const total = tasks.length || 1;
  return h('div.adaa-breakdown',
    h('div.adaa-stack', { 'aria-hidden': 'true' }, TASK_STATES.map((s) => (c[s] ? h(`i.adaa-seg.${s}`, { style: { width: `${(c[s] / total) * 100}%` } }) : null))),
    h('ul.adaa-breakdown-list', TASK_STATES.map((s) => h('li', h(`i.adaa-sw.${s}`, { 'aria-hidden': 'true' }), h('span.grow', statusLabel(s)), num(c[s])))));
}

function setPinned(btn, on) {
  btn.disabled = on;
  btn.replaceChildren(icon(on ? 'check' : 'pin'), on ? L('مُضاف إلى الداشبورد', 'On your dashboard') : L('أضف إلى الداشبورد', 'Add to dashboard'));
}

async function pin(item, label, btn) {
  btn.classList.add('is-loading'); btn.disabled = true;
  const r = await runTool('add_widget', { type: 'kpi', filters: { metric: item.key }, size: 's', position: 0 }, { quiet: true });
  btn.classList.remove('is-loading');
  if (!r || r.status === 'needs_confirmation') { btn.disabled = false; return; }
  setPinned(btn, true);
  toast(L(`أُضيفت بطاقة «${label}» إلى الداشبورد`, `“${label}” was added to your dashboard`),
    r.undoable && r.actionId ? { action: t('undo'), onAction: async () => { await undo(r.actionId); if (btn.isConnected) setPinned(btn, false); } } : {});
}

function openDept(d, k) {
  if (drillOpen) return;
  const name = L(d.name_ar, d.name_en);
  const projects = sortProjects((k.projects || []).filter((p) => p.dept_ar === d.name_ar), 'attention');
  const mini = (label, value, cls) => h(`div.adaa-mini${cls ? `.${cls}` : ''}`, value, h('span.k', label));
  const chatBtn = h('button.btn.primary', { type: 'button', onclick: () => sheet.close('chat') }, icon('chat'), L('ناقش مع المساعد', 'Discuss with assistant'));
  const body = sheetBody([
    h('div.adaa-mini-stats',
      mini(L('المشاريع', 'Projects'), num(d.projects)),
      mini(L('المتأخرة', 'Delayed'), num(d.delayed), d.delayed ? 'crit' : null),
      mini(L('متوسط الإنجاز', 'Avg progress'), num(d.avg_progress, '%'))),
    h('h4.adaa-sec', L('مشاريع الإدارة', 'Department projects'), h('span.adaa-count', fmtNum(projects.length))),
    h('div.adaa-related', projects.length ? barList(projects) : emptyState({ compact: true, icon: 'folder', title: L('لا مشاريع ظاهرة لهذه الإدارة', 'No visible projects for this department') })),
  ], [chatBtn]);
  const sheet = openSheet(name, body);
  sheet.done.then((choice) => {
    if (choice !== 'chat') return;
    const late = projects.filter((p) => p.delayed).map((p) => `${p.name} (${lateBy(daysLate(p))})`);
    setTimeout(() => Chat.focus(L(
      `بخصوص ${name} (${d.projects} مشاريع · المتأخرة: ${d.delayed} · متوسط الإنجاز: ${d.avg_progress ?? '—'}%)${late.length ? ` — ${late.join('، ')}` : ''}: `,
      `About ${name} (${d.projects} projects · delayed: ${d.delayed} · avg progress: ${d.avg_progress ?? '—'}%)${late.length ? ` — ${late.join('; ')}` : ''}: `)), 240);
  });
}
