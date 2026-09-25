// Strategic Performance — الأداء الاستراتيجي.
// Tabs (hash sub-routes #/sys/strategy/<tab>/<id>):
//   map          strategy map: vision → pillars → objectives with RAG and attainment rings (hero)
//   kpis         scorecard + KPI sheet with an actual-vs-target trend
//   initiatives  board by status with linked-project progress (viewer's own project scope)
//   updates      KPI owners: actuals to report · SPMO: validation queue
//   admin        strategy.admin only: plan, pillars, objectives, KPIs, initiatives
// The landing tab is role-aware (SPMO with pending validations / owners with due
// actuals land on «تحديثاتي»; everyone else on the map).
import {
  h, icon, L, fmtDate, getLang, state, sysHeader, sysTabs, currentTab, go, statusChip, statTile, statRow, progress, openSheet, board,
  dataTable, filterBar, formDialog, toast, act, emptyState, errorState, skeleton, sysApi, dateTime, api,
} from '../../sys-kit.js';
import { ring, sparkline, trendChart, nf, pctText, withUnit, TONE, bidi } from './strategy/viz.js';
import { renderAdmin } from './strategy/admin.js';

const call = sysApi('strategy');
export const RAG = {
  on_track: ['على المسار', 'On track', 'good', 'circleCheck'],
  at_risk: ['معرّض للخطر', 'At risk', 'warn', 'alert'],
  off_track: ['خارج المسار', 'Off track', 'crit', 'circleAlert'],
  no_data: ['لم يُرصد', 'Not reported', 'outline', 'circleDashed'],
};
const ACTUAL = { submitted: ['بانتظار الاعتماد', 'Awaiting validation', 'info', 'hourglass'], validated: ['معتمدة', 'Validated', 'good', 'badgeCheck'], returned: ['مُعادة للتصحيح', 'Returned', 'warn', 'undo'] };
export const INIT = {
  planned: ['مخططة', 'Planned', 'outline', 'calendar'], in_progress: ['قيد التنفيذ', 'In progress', 'info', 'play'], at_risk: ['معرّضة للخطر', 'At risk', 'warn', 'alert'],
  on_hold: ['متوقفة', 'On hold', 'sand', 'pause'], completed: ['مكتملة', 'Completed', 'good', 'circleCheck'], cancelled: ['ملغاة', 'Cancelled', 'outline', 'circleX'],
};
const DUE = { returned: ['مُعادة للتصحيح', 'Returned', 'warn', 'undo'], overdue: ['متأخرة', 'Overdue', 'crit', 'clockAlert'], due: ['مستحقة', 'Due', 'info', 'calendarClock'] };
export const FREQ = { monthly: ['شهري', 'Monthly'], quarterly: ['ربع سنوي', 'Quarterly'] };
const ragLabel = (s) => L(RAG[s]?.[0] || s, RAG[s]?.[1] || s);
const rag = (s) => statusChip(s, RAG);

// transient view state that must survive live (soft) re-renders
const ui = { lastTab: null, mapMine: false, kpi: { q: '', status: '', dept: '', pillar: '' }, admin: 'structure' };
let sheetRef = null;

const TABS = (sum) => [
  { key: 'map', ar: 'الخريطة', en: 'Strategy map', icon: 'network' },
  { key: 'kpis', ar: 'المؤشرات', en: 'KPIs', icon: 'gauge', count: sum?.counts?.off_track || 0 },
  { key: 'initiatives', ar: 'المبادرات', en: 'Initiatives', icon: 'rocket' },
  { key: 'updates', ar: 'تحديثاتي', en: 'My updates', icon: 'inbox', count: (sum?.due_count || 0) + (sum?.queue_actionable || 0) },
  sum?.is_admin ? { key: 'admin', ar: 'الإدارة', en: 'Manage', icon: 'settings' } : null,
].filter(Boolean);

export async function render(root, ctx) {
  const page = h('div.stg');
  root.append(page);
  const asked = ctx.params[0];
  const quiet = ctx.soft || (asked && ui.lastTab === asked);
  const reload = () => load(true);
  async function load(silent) {
    try {
      const sum = await call('/summary');
      const tabs = TABS(sum);
      const tab = currentTab(ctx, tabs, sum.landing);
      const body = await TAB_RENDER[tab](ctx, sum, reload);
      page.replaceChildren(header(ctx, sum, tab), sysTabs(ctx, tabs, tab), body);
      ui.lastTab = tab;
    } catch (e) {
      if (silent && page.childElementCount) { toast(e.message, { kind: 'error' }); return; }
      page.replaceChildren(sysHeader(ctx), h('div.card', errorState(e, () => { page.replaceChildren(sysHeader(ctx), skeletonBody()); load(); })));
    }
  }
  if (quiet) { await load(true); return; }
  page.append(sysHeader(ctx, { sub: false }), skeletonBody());
  load();
}
const skeletonBody = () => h('div.stg-skel', { 'aria-busy': 'true' }, h('div.card', skeleton('card')), h('div.stg-skel-grid', [0, 1, 2, 3].map(() => h('div.card', skeleton('list', 3)))));

function header(ctx, sum, tab) {
  const actions = [];
  // one clear next step per role; on «تحديثاتي» the work itself is the call to action
  if (tab !== 'updates' && sum.is_admin && sum.queue_actionable) actions.push({ label: L(`راجع القيم المرصودة (${sum.queue_actionable})`, `Review submitted values (${sum.queue_actionable})`), icon: 'badgeCheck', primary: true, onClick: () => go(ctx, 'updates') });
  else if (tab !== 'updates' && sum.due_count) actions.push({ label: L(`أدخل القيم المطلوبة (${sum.due_count})`, `Enter due values (${sum.due_count})`), icon: 'pencil', primary: true, onClick: () => go(ctx, 'updates') });
  else if (tab !== 'kpis') actions.push({ label: L('بطاقة الأداء', 'Scorecard'), icon: 'gauge', onClick: () => go(ctx, 'kpis') });
  else actions.push({ label: L('الخريطة الاستراتيجية', 'Strategy map'), icon: 'network', onClick: () => go(ctx, 'map') });
  const badges = [];
  if (sum.plan) badges.push(h('span.chip.tiny.sand', icon('flag'), bidi(L(sum.plan.title_ar, sum.plan.title_en))));
  if (sum.plan?.is_demo) badges.push(h('span.chip.tiny.demo', L('تجريبي', 'Demo')));
  return sysHeader(ctx, { actions, badges });
}

// ---------------------------------------------------------------- sheets (hash-synced)
function showSheet(ctx, key, conf) {
  if (sheetRef && sheetRef.key === key && sheetRef.sheet.el.isConnected) { sheetRef.sheet.setBody(conf.body); return sheetRef.sheet; }
  const sheet = openSheet(conf);
  sheetRef = { key, sheet };
  const tab = ctx.params[0]; const id = ctx.params[1];
  const obs = new MutationObserver(() => {
    if (sheet.el.isConnected) return;
    obs.disconnect();
    if (sheetRef?.sheet === sheet) sheetRef = null;
    if (id && location.hash.startsWith(`#/sys/${ctx.key}/${tab}/${id}`)) history.replaceState(null, '', `#/sys/${ctx.key}/${tab}`);
  });
  obs.observe(document.body, { childList: true });
  return sheet;
}
const closeStale = (key) => { if (sheetRef && sheetRef.key !== key && sheetRef.sheet.el.isConnected) sheetRef.sheet.close(); };

// ================================================================ MAP (hero)
async function renderMap(ctx, sum, reload) {
  const m = await call('/map');
  if (!m.plan) return noPlan(sum);
  const wrap = h('div.stg-map-page');
  const k = m.counts;
  const legend = h('div.stg-legend', ['on_track', 'at_risk', 'off_track', 'no_data'].map((s) => h(`a.stg-pill.t-${TONE[s]}`, { href: `#/sys/strategy/kpis`, onclick: () => { ui.kpi = { q: '', status: s, dept: '', pillar: '' }; } },
    h('span.dot-i', { 'aria-hidden': 'true' }), h('span.grow', ragLabel(s)), h('strong.num.tabular', nf(k[s], 0)))));
  const overall = m.overall;
  wrap.append(h('section.stg-hero', { 'aria-label': L('الرؤية ونسبة تحقق الخطة', 'Vision and plan attainment') },
    h('div.stg-hero-main',
      h('span.eyebrow', L('الرؤية', 'Vision')),
      h('p.stg-vision', L(m.plan.vision_ar, m.plan.vision_en || m.plan.vision_ar)),
      h('div.stg-hero-facts',
        h('span', icon('layers'), L(`${m.pillars.length} محاور`, `${m.pillars.length} pillars`)),
        h('span', icon('target'), L(`${m.pillars.reduce((a, p) => a + p.objectives.length, 0)} أهداف استراتيجية`, `${m.pillars.reduce((a, p) => a + p.objectives.length, 0)} strategic objectives`)),
        h('span', icon('gauge'), L(`${m.kpi_total} مؤشر أداء`, `${m.kpi_total} KPIs`))),
      legend),
    h('div.stg-hero-ring',
      ring({ value: overall.attainment, size: 156, stroke: 12, tone: 'brand', label: overall.attainment == null ? '—' : pctText(overall.attainment), sub: ragLabel(overall.status), title: L(`نسبة تحقق الخطة ${nf(overall.attainment, 0)}%`, `Plan attainment ${nf(overall.attainment, 0)}%`) }),
      h('div.stg-ring-cap', h('strong', L('نسبة تحقق الخطة', 'Plan attainment')), h('span.tiny.faint', L(`تغطية البيانات ${pctText(overall.coverage)}`, `Data coverage ${pctText(overall.coverage)}`))))));

  const mineCount = m.pillars.reduce((a, p) => a + p.objectives.filter((o) => o.mine).length, 0);
  const tools = h('div.stg-map-tools',
    h('h2.stg-section-title', L('الخريطة الاستراتيجية', 'Strategy map')),
    h('span.grow'),
    mineCount ? h('div.tabs.stg-seg', { role: 'tablist', 'aria-label': L('عرض الأهداف', 'Objectives view') },
      h(`button${!ui.mapMine ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(!ui.mapMine), onclick: () => { ui.mapMine = false; reload(); } }, L('كل الإدارات', 'All departments')),
      h(`button${ui.mapMine ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(ui.mapMine), onclick: () => { ui.mapMine = true; reload(); } }, L(`أهداف إدارتي (${mineCount})`, `My department (${mineCount})`))) : null);
  wrap.append(tools);
  wrap.append(h(`div.stg-map${ui.mapMine ? '.is-filtered' : ''}`, m.pillars.map((p, i) => pillarColumn(ctx, p, i))));
  wrap.append(h('p.stg-foot.tiny.faint', icon('info'), L('الحالة: على المسار ≥ 95% من المستهدف · معرّض للخطر 80–95% · خارج المسار < 80% · «لم يُرصد» عند غياب القيمة ولا تُحتسب صفراً. المؤشرات التي «الأقل فيها أفضل» تُحتسب بالعكس.',
    'Status: on track ≥ 95% of target · at risk 80–95% · off track < 80% · “not reported” when a value is missing (never counted as zero). Lower-is-better KPIs are mirrored.')));
  if (ctx.params[1]) objectiveSheet(ctx, ctx.params[1], reload); else closeStale(null);
  return wrap;
}
function pillarColumn(ctx, p, i) {
  return h(`section.stg-pillar.s${(i % 4) + 1}`, { 'aria-label': L(p.title_ar, p.title_en) },
    h('header.stg-pillar-head',
      ring({ value: p.attainment, size: 58, tone: TONE[p.status], label: p.attainment == null ? '—' : nf(p.attainment, 0), title: `${L(p.title_ar, p.title_en)} — ${ragLabel(p.status)}` }),
      h('div.grow', h('span.stg-code', p.code), h('h3', L(p.title_ar, p.title_en)), h('div.stg-pillar-sub', rag(p.status)))),
    h('div.stg-objs', p.objectives.map((o) => objectiveCard(ctx, o))));
}
function objectiveCard(ctx, o) {
  const dim = ui.mapMine && !o.mine;
  return h(`button.stg-obj${dim ? '.dim' : ''}${o.mine ? '.mine' : ''}`, { type: 'button', onclick: () => go(ctx, 'map', o.id), 'aria-label': `${o.code} ${L(o.title_ar, o.title_en)} — ${ragLabel(o.status)} ${o.attainment == null ? '' : `${nf(o.attainment, 0)}%`}` },
    h('div.so-top', h('span.stg-code', o.code), h('span.so-dept', L(o.dept_ar, o.dept_en)), o.mine ? h('span.chip.tiny.navy', L('إدارتي', 'Mine')) : null),
    h('div.so-title', L(o.title_ar, o.title_en)),
    h('div.so-bar', progress(o.attainment, { tone: TONE[o.status] === 'none' ? null : TONE[o.status], label: L('نسبة التحقق', 'Attainment') }), h('strong.num.tabular', o.attainment == null ? '—' : pctText(o.attainment))),
    h('div.so-foot',
      h('span.so-kpis', { 'aria-hidden': 'true' }, o.kpis.map((k) => h(`i.kdot.t-${TONE[k.status]}`, { 'data-tip': `${k.code} · ${ragLabel(k.status)}` }))),
      h('span.grow'),
      o.initiatives ? h('span.so-inits', icon('rocket'), nf(o.initiatives, 0)) : null,
      h('span.so-status', icon(RAG[o.status][3]), ragLabel(o.status))));
}
async function objectiveSheet(ctx, id, reload) {
  let o;
  try { o = await call(`/objectives/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, { kind: 'error' }); history.replaceState(null, '', `#/sys/${ctx.key}/map`); return; }
  closeStale(`obj:${id}`);
  const body = h('div.stg-sheet',
    h('div.stg-sheet-hero',
      ring({ value: o.attainment, size: 96, tone: TONE[o.status] === 'none' ? 'none' : TONE[o.status], label: o.attainment == null ? '—' : pctText(o.attainment), sub: ragLabel(o.status) }),
      h('dl.sys-kv',
        h('dt', L('المحور', 'Pillar')), h('dd', `${o.pillar.code} · ${L(o.pillar.title_ar, o.pillar.title_en)}`),
        h('dt', L('الإدارة المالكة', 'Owner department')), h('dd', L(o.dept_ar, o.dept_en)),
        h('dt', L('الوزن في المحور', 'Weight in pillar')), h('dd', h('span.num', nf(o.weight, 1))),
        h('dt', L('تغطية البيانات', 'Data coverage')), h('dd', h('span.num', pctText(o.coverage))))),
    o.description_ar ? h('p.muted', L(o.description_ar, o.description_en || o.description_ar)) : null,
    h('h3.stg-sub', L('مؤشرات الأداء', 'Key performance indicators'), h('span.count', nf(o.kpis.length, 0))),
    o.kpis.length ? h('ul.stg-kpi-list', o.kpis.map((k) => h('li', h('button.stg-kpi-row', { type: 'button', onclick: () => go(ctx, 'kpis', k.id) },
      h('div.grow', h('div.kr-name', h('span.stg-code', k.code), L(k.name_ar, k.name_en)), h('div.kr-meta', kpiValueLine(k))),
      sparkline(k.spark.map((p) => ({ v: p.v, t: p.t, status: p.status }))), rag(k.status))))) : emptyState({ compact: true, icon: 'gauge', title: L('لا مؤشرات بعد', 'No KPIs yet') }),
    h('h3.stg-sub', L('المبادرات', 'Initiatives'), h('span.count', nf(o.initiatives.length, 0))),
    o.initiatives.length ? h('ul.stg-kpi-list', o.initiatives.map((i) => h('li', h('button.stg-kpi-row', { type: 'button', onclick: () => go(ctx, 'initiatives', i.id) },
      h('div.grow', h('div.kr-name', h('span.stg-code', i.code), L(i.title_ar, i.title_en)), h('div.kr-meta', progress(i.progress, { label: L('التقدم', 'Progress') }))), statusChip(i.status, INIT))))) : h('p.tiny.faint', L('لا مبادرات مرتبطة بهذا الهدف.', 'No initiatives linked to this objective.')));
  showSheet(ctx, `obj:${id}`, { title: `${o.code} · ${L(o.title_ar, o.title_en)}`, subtitle: L(o.dept_ar, o.dept_en), badges: [rag(o.status)], body, wide: true });
  void reload;
}
function kpiValueLine(k) {
  if (k.value == null) return h('span.faint', L('لم يُرصد بعد', 'Not reported yet'));
  const cum = k.measure === 'cumulative';
  return h('span', h('strong.tabular', withUnit(cum ? k.comparable : k.value, k.unit_ar, k.unit_en, k.decimals)), cum ? h('span.faint', L(' تراكمي', ' YTD')) : null,
    h('span.faint', ` / ${L('المستهدف', 'target')} `), h('span.tabular', withUnit(k.target, k.unit_ar, k.unit_en, k.decimals)), h('span.faint', ` · ${L(k.period_ar, k.period_en)}`));
}

// ================================================================ KPIs
async function renderKpis(ctx, sum, reload) {
  const f = ui.kpi;
  const qs = () => new URLSearchParams(Object.entries({ status: f.status, dept: f.dept, pillar: f.pillar, q: f.q }).filter(([, v]) => v)).toString();
  const fetchRows = () => call(`/kpis${qs() ? `?${qs()}` : ''}`);
  const [r, map] = await Promise.all([fetchRows(), call('/map')]);
  const wrap = h('div.stg-kpis');
  const c = r.counts;
  wrap.append(statRow(['on_track', 'at_risk', 'off_track', 'no_data'].map((s) => statTile({ label: ragLabel(s), value: c[s], tone: { on_track: 'good', at_risk: 'warn', off_track: 'crit', no_data: null }[s], icon: RAG[s][3], hint: f.status === s ? L('مُفعّل كمرشّح — اضغط للإلغاء', 'Filter on — click to clear') : L('اضغط للتصفية', 'Click to filter'), onClick: () => { ui.kpi.status = f.status === s ? '' : s; reload(); } }))));
  const depts = new Map(); for (const p of map.pillars) for (const o of p.objectives) depts.set(o.owner_dept_id, L(o.dept_ar, o.dept_en));
  const table = h('div');
  const draw = (rows) => table.replaceChildren(rows.length ? dataTable({
    caption: L('بطاقة الأداء الاستراتيجي', 'Strategic scorecard'),
    columns: [
      { key: 'name', label: L('المؤشر', 'KPI'), sort: (k) => k.code, render: (k) => h('div.kt-name', h('span.stg-code', k.code), h('strong', L(k.name_ar, k.name_en)), h('span.tiny.faint', `${k.objective_code} · ${L(k.objective_ar, k.objective_en)}`)) },
      { key: 'dept', label: L('الإدارة', 'Department'), sort: (k) => L(k.dept_ar, k.dept_en), render: (k) => h('span.kt-dept', L(k.dept_ar, k.dept_en)) },
      { key: 'period', label: L('آخر رصد', 'Last reported'), sort: (k) => k.period || '', render: (k) => h('div.kt-period', k.period ? L(k.period_ar, k.period_en) : h('span.faint', '—'), k.pending ? h('span.chip.tiny.info', icon('hourglass'), L('بانتظار الاعتماد', 'Pending')) : null, k.stale ? h('span.chip.tiny.warn', icon('clockAlert'), L('متأخر الرصد', 'Overdue')) : null) },
      { key: 'value', label: L('الفعلي', 'Actual'), num: true, sort: (k) => k.comparable, render: (k) => h('span.tabular', k.value == null ? '—' : withUnit(k.measure === 'cumulative' ? k.comparable : k.value, k.unit_ar, k.unit_en, k.decimals)) },
      { key: 'target', label: L('المستهدف', 'Target'), num: true, sort: (k) => k.target, render: (k) => h('span.tabular.faint', withUnit(k.target, k.unit_ar, k.unit_en, k.decimals)) },
      { key: 'att', label: L('التحقق', 'Attainment'), sort: (k) => k.attainment ?? -1, render: (k) => h('div.kt-att', progress(k.attainment, { tone: TONE[k.status] === 'none' ? null : TONE[k.status], label: L('نسبة التحقق', 'Attainment') }), h('span.num.tabular', pctText(k.attainment))) },
      { key: 'status', label: L('الحالة', 'Status'), sort: (k) => ['off_track', 'at_risk', 'no_data', 'on_track'].indexOf(k.status), render: (k) => rag(k.status) },
      { key: 'trend', label: L('الاتجاه', 'Trend'), render: (k) => h('span.kt-trend', sparkline(k.spark.map((p) => ({ v: p.v, t: p.t, status: p.status }))), k.trend ? h(`span.sr-only`, k.trend === 'improving' ? L('يتحسن', 'improving') : L('يتراجع', 'worsening')) : null) },
    ],
    rows, sortKey: 'status', sortDir: 'asc', onRow: (k) => go(ctx, 'kpis', k.id),
  }) : emptyState({ icon: 'search', title: L('لا مؤشرات مطابقة', 'No matching KPIs'), body: L('غيّر عوامل التصفية لعرض مؤشرات أخرى.', 'Change the filters to see other KPIs.'), actions: [{ label: L('مسح التصفية', 'Clear filters'), onClick: () => { ui.kpi = { q: '', status: '', dept: '', pillar: '' }; reload(); } }] }));
  // filters refresh the table only (the search field keeps focus while typing)
  const refine = async () => { try { draw((await fetchRows()).rows); } catch (e) { toast(e.message, { kind: 'error' }); } };
  wrap.append(h('section.card.stg-table-card',
    filterBar({
      search: { placeholder: L('ابحث برمز المؤشر أو اسمه…', 'Search by KPI code or name…'), value: f.q, onInput: (v) => { ui.kpi.q = v; refine(); } },
      selects: [
        { label: L('الحالة', 'Status'), value: f.status, options: [{ value: '', label: L('كل الحالات', 'All statuses') }, ...Object.keys(RAG).map((s) => ({ value: s, label: ragLabel(s) }))], onChange: (v) => { ui.kpi.status = v; reload(); } },
        { label: L('الإدارة', 'Department'), value: f.dept, options: [{ value: '', label: L('كل الإدارات', 'All departments') }, ...[...depts].map(([v, l]) => ({ value: v, label: l }))], onChange: (v) => { ui.kpi.dept = v; refine(); } },
        { label: L('المحور', 'Pillar'), value: f.pillar, options: [{ value: '', label: L('كل المحاور', 'All pillars') }, ...map.pillars.map((p) => ({ value: p.id, label: `${p.code} · ${L(p.title_ar, p.title_en)}` }))], onChange: (v) => { ui.kpi.pillar = v; refine(); } },
      ],
    }),
    table));
  draw(r.rows);
  if (ctx.params[1]) kpiSheet(ctx, ctx.params[1], reload); else closeStale(null);
  return wrap;
}

async function kpiSheet(ctx, id, reload) {
  let k;
  try { k = await call(`/kpis/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, { kind: 'error' }); history.replaceState(null, '', `#/sys/${ctx.key}/kpis`); return; }
  closeStale(`kpi:${id}`);
  const cum = k.measure === 'cumulative';
  const last = [...k.series].reverse().find((p) => p.counted);
  const u = (v) => withUnit(v, k.unit_ar, k.unit_en, k.decimals);
  const refresh = () => { reload(); };
  const actionsBar = h('div.stg-sheet-actions',
    k.can_submit ? h('button.btn.primary', { type: 'button', onclick: (e) => submitDialog(e.currentTarget, k, k.due?.[0]?.period, refresh) }, icon('pencil'), L('أدخل قيمة', 'Enter a value')) : null,
    h('span.grow'),
    h('span.chip.tiny.outline', icon('calendarClock'), L(FREQ[k.frequency][0], FREQ[k.frequency][1])),
    h('span.chip.tiny.outline', icon(k.direction === 'higher' ? 'trendUp' : 'trendDown'), k.direction === 'higher' ? L('الأعلى أفضل', 'Higher is better') : L('الأقل أفضل', 'Lower is better')),
    cum ? h('span.chip.tiny.sand', icon('sigma'), L('تراكمي منذ بداية السنة', 'Year-to-date')) : null);
  const due = (k.due || []).map((d) => h(`div.callout.stg-due.${d.state}`, icon(DUE[d.state][3]), h('div.grow',
    h('strong', d.state === 'returned' ? L(`أُعيدت قيمة ${d.period_ar} للتصحيح`, `${d.period_en} value was returned`) : L(`قيمة ${d.period_ar} ${d.state === 'overdue' ? 'متأخرة' : 'مستحقة'} — آخر موعد ${fmtDate(d.due)}`, `${d.period_en} value ${d.state === 'overdue' ? 'is overdue' : 'is due'} — by ${fmtDate(d.due)}`)),
    d.review_comment ? h('div.tiny', `${L('ملاحظة إدارة المشاريع الاستراتيجية', 'SPMO note')}: ${d.review_comment}`) : null),
  h('button.btn.sm.tertiary', { type: 'button', onclick: (e) => submitDialog(e.currentTarget, k, d.period, refresh) }, L('أدخل', 'Enter'))));
  // leading periods before the first report carry no information: start the trend at the first reported period
  const firstIdx = k.series.findIndex((p) => p.actual_id);
  const series = (firstIdx > 0 ? k.series.slice(firstIdx) : k.series).map((p) => ({ key: p.key, label: L(p.label_ar, p.label_en), short: L(p.short_ar, p.short_en), v: p.counted ? p.comparable : null, t: p.target, status: p.status }));
  const history = [...k.series].reverse().filter((p) => p.actual_id);
  const body = h('div.stg-sheet',
    actionsBar,
    ...due,
    h('div.stg-kpi-stats',
      miniStat(cum ? L('الفعلي التراكمي', 'Actual (YTD)') : L('آخر قيمة', 'Latest actual'), last ? u(cum ? last.comparable : last.value) : '—', last ? L(last.label_ar, last.label_en) : L('لم يُرصد', 'Not reported')),
      miniStat(L('المستهدف', 'Target'), u(last ? last.target : k.target), cum ? L('حتى نهاية الفترة', 'to period end') : L(`مستهدف ${last?.year || ''}`, `${last?.year || ''} target`)),
      miniStat(L('نسبة التحقق', 'Attainment'), pctText(last?.attainment), ragLabel(k.status), TONE[k.status])),
    k.stale ? h('div.callout.stg-note', icon('clockAlert'), L('آخر قيمة مرصودة أقدم من الفترة المستحقة — الحالة تعكس آخر فترة مرصودة.', 'The latest reported value is older than the period now due — status reflects the last reported period.')) : null,
    h('section.stg-chart-card', h('h3.stg-sub', cum ? L('الفعلي التراكمي مقابل المستهدف', 'Year-to-date actual vs target') : L('الفعلي مقابل المستهدف', 'Actual vs target')),
      trendChart(series, { unitAr: k.unit_ar, unitEn: k.unit_en, decimals: k.decimals, statusLabel: ragLabel, valueLabel: cum ? L('الفعلي التراكمي', 'Actual YTD') : L('الفعلي', 'Actual'), label: `${k.code} ${L(k.name_ar, k.name_en)}` })),
    h('dl.sys-kv.stg-kv',
      h('dt', L('التعريف', 'Definition')), h('dd', L(k.definition_ar, k.definition_en || k.definition_ar) || '—'),
      h('dt', L('طريقة الاحتساب', 'Formula')), h('dd', k.formula_ar || '—'),
      h('dt', L('مصدر البيانات', 'Data source')), h('dd', L(k.data_source_ar, k.data_source_en || k.data_source_ar) || '—'),
      h('dt', L('خط الأساس', 'Baseline')), h('dd', h('span.tabular', k.baseline == null ? '—' : u(k.baseline)), k.baseline_year ? h('span.faint', ` (${k.baseline_year})`) : null),
      h('dt', L('المالك', 'Owner')), h('dd', [k.owner ? L(k.owner.name_ar, k.owner.name_en) : null, L(k.dept_ar, k.dept_en)].filter(Boolean).join(' · ')),
      h('dt', L('الهدف الاستراتيجي', 'Strategic objective')), h('dd', `${k.objective_code} · ${L(k.objective_ar, k.objective_en)}`),
      h('dt', L('المستهدفات السنوية', 'Annual targets')), h('dd', h('div.stg-targets', k.targets.map((t) => h('span.chip.tiny.outline', h('span.faint', `${t.year}`), h('strong.tabular', u(t.target)))))),
    ),
    h('h3.stg-sub', L('سجل القيم', 'Reported values'), h('span.count', nf(history.length, 0))),
    history.length ? h('ul.stg-history', history.map((p) => historyRow(k, p, refresh))) : h('p.tiny.faint', L('لم تُرصد أي قيمة بعد.', 'No values reported yet.')));
  showSheet(ctx, `kpi:${id}`, { title: `${k.code} · ${L(k.name_ar, k.name_en)}`, subtitle: L(k.dept_ar, k.dept_en), badges: [rag(k.status), k.pending ? h('span.chip.tiny.info', icon('hourglass'), L('بانتظار الاعتماد', 'Pending')) : null].filter(Boolean), body, wide: true });
}
const miniStat = (label, value, hint, tone) => h(`div.stg-mini${tone ? `.t-${tone}` : ''}`, h('span.ms-label', label), h('strong.ms-value.tabular', value), hint ? h('span.ms-hint', hint) : null);
function historyRow(k, p, refresh) {
  const me = state.me?.user?.id;
  const canReview = k.can_validate && p.actual_status === 'submitted';
  const own = p.submitted_by?.id === me;
  return h(`li.stg-hrow.st-${p.actual_status}`,
    h('div.hr-period', h('strong', L(p.label_ar, p.label_en)), p.late ? h('span.chip.tiny.warn', L('بعد الموعد', 'Late')) : null),
    h('div.hr-value.tabular', withUnit(p.value, k.unit_ar, k.unit_en, k.decimals)),
    h('div.hr-status', statusChip(p.actual_status, ACTUAL)),
    h('div.hr-who.tiny.faint', p.submitted_by ? `${L(p.submitted_by.name_ar, p.submitted_by.name_en)} · ${fmtDate(p.submitted_at)}` : ''),
    p.review_comment ? h('div.hr-comment', icon('messageSquare'), p.review_comment) : null,
    p.note ? h('div.hr-note.tiny', `${L('ملاحظة المالك', 'Owner note')}: ${p.note}`) : null,
    canReview ? h('div.hr-actions', own
      ? h('span.chip.tiny.outline', icon('shield'), L('أدخلتها بنفسك — يعتمدها زميل (فصل المهام)', 'You submitted this — a colleague validates it (segregation of duties)'))
      : [h('button.btn.sm.primary', { type: 'button', onclick: (e) => review(e.currentTarget, p.actual_id, 'validate', refresh) }, icon('check'), L('اعتماد', 'Validate')),
        h('button.btn.sm', { type: 'button', onclick: (e) => review(e.currentTarget, p.actual_id, 'return', refresh) }, icon('undo'), L('إعادة للمالك', 'Return'))]) : null);
}

async function submitDialog(btn, k, period, done) {
  const due = k.due || [];
  const opts = due.length ? due.map((d) => ({ value: d.period, label: `${L(d.period_ar, d.period_en)}${d.state === 'returned' ? L(' — مُعادة', ' — returned') : d.state === 'overdue' ? L(' — متأخرة', ' — overdue') : ''}` })) : null;
  const cur = due.find((d) => d.period === period) || due[0];
  const fields = [
    opts ? { name: 'period', label: L('الفترة', 'Period'), type: 'select', options: opts, required: true } : { type: 'info', label: L('ستُرصد القيمة لآخر فترة مكتملة.', 'The value will be recorded for the latest closed period.') },
    { name: 'value', label: `${L('القيمة', 'Value')} (${L(k.unit_ar, k.unit_en)})`, type: 'number', required: true, min: k.min_value ?? undefined, max: k.max_value ?? undefined, step: 'any', help: cur ? L(`المستهدف ${withUnit(cur.cumulative_target ?? cur.target, k.unit_ar, k.unit_en, k.decimals)}${cur.previous_value != null ? ` · القيمة السابقة ${withUnit(cur.previous_value, k.unit_ar, k.unit_en, k.decimals)}` : ''}${k.measure === 'cumulative' ? ' · أدخل ما تحقق في هذه الفترة فقط' : ''}`, `Target ${withUnit(cur.cumulative_target ?? cur.target, k.unit_ar, k.unit_en, k.decimals)}${cur.previous_value != null ? ` · previous ${withUnit(cur.previous_value, k.unit_ar, k.unit_en, k.decimals)}` : ''}${k.measure === 'cumulative' ? ' · enter this period’s amount only' : ''}`) : null },
    { name: 'note', label: L('ملاحظة للمراجع (اختياري)', 'Note for the reviewer (optional)'), type: 'textarea', rows: 3, maxLength: 1000, placeholder: L('مثال: مصدر القيمة أو سبب التغيّر', 'e.g. source of the value or reason for a change') },
  ];
  const v = await formDialog({ title: L(`رصد قيمة ${k.code}`, `Report ${k.code}`), intro: L(k.name_ar, k.name_en), fields, values: { period: cur?.period, value: cur?.state === 'returned' ? cur.value : null }, submitLabel: L('إرسال للاعتماد', 'Submit for validation') });
  if (!v) return;
  const body = { value: v.value, ...(v.period ? { period: v.period } : {}), ...(v.note ? { note: v.note } : {}) };
  const r = await act(btn, () => call(`/kpis/${k.id}/actuals`, { method: 'POST', body }));
  if (r) { toast(r.on_time ? L('أُرسلت القيمة للاعتماد — شكراً لالتزامك بالموعد', 'Sent for validation — thanks for reporting on time') : L('أُرسلت القيمة للاعتماد', 'Sent for validation')); done(); }
}
async function review(btn, actualId, decision, done) {
  let comment;
  if (decision === 'return') {
    const v = await formDialog({ title: L('إعادة القيمة لمالك المؤشر', 'Return the value to the KPI owner'), fields: [{ name: 'comment', label: L('سبب الإعادة', 'Reason'), type: 'textarea', required: true, rows: 4, maxLength: 1000, placeholder: L('وضّح ما يلزم تصحيحه ليتمكن المالك من إعادة الرصد', 'Explain what must be corrected') }], submitLabel: L('إعادة', 'Return') });
    if (!v) return;
    comment = v.comment;
  }
  const r = await act(btn, () => call(`/actuals/${actualId}/review`, { method: 'POST', body: { decision, ...(comment ? { comment } : {}) } }));
  if (r) { toast(decision === 'validate' ? L('اعتُمدت القيمة', 'Value validated') : L('أُعيدت القيمة لمالك المؤشر', 'Returned to the KPI owner')); done(); }
}

// ================================================================ INITIATIVES
async function renderInitiatives(ctx, sum, reload) {
  const r = await call('/initiatives');
  const wrap = h('div.stg-inits');
  const rows = r.rows;
  const cols = ['planned', 'in_progress', 'at_risk', 'on_hold', 'completed'].filter((s) => s !== 'on_hold' || rows.some((i) => i.status === 'on_hold'));
  const tone = { planned: null, in_progress: 'info', at_risk: 'warn', on_hold: 'sand', completed: 'good' };
  if (!rows.length) wrap.append(h('div.card', emptyState({ icon: 'rocket', title: L('لا مبادرات بعد', 'No initiatives yet'), body: L('تضيف إدارة المشاريع الاستراتيجية المبادرات وتربطها بالأهداف.', 'The SPMO adds initiatives and links them to objectives.') })));
  else {
    const late = rows.filter((i) => i.delayed).length;
    wrap.append(statRow([
      statTile({ label: L('مبادرات نشطة', 'Active initiatives'), value: rows.filter((i) => ['in_progress', 'at_risk'].includes(i.status)).length, icon: 'rocket' }),
      statTile({ label: L('معرّضة للخطر', 'At risk'), value: rows.filter((i) => i.status === 'at_risk').length, icon: 'alert', tone: 'warn' }),
      statTile({ label: L('تجاوزت موعدها', 'Past end date'), value: late, icon: 'clockAlert', tone: late ? 'crit' : null }),
      statTile({ label: L('مكتملة', 'Completed'), value: rows.filter((i) => i.status === 'completed').length, icon: 'circleCheck', tone: 'good' }),
    ]));
    wrap.append(board(cols.map((c) => ({ key: c, ar: INIT[c][0], en: INIT[c][1], tone: tone[c] })), rows.filter((i) => i.status !== 'cancelled'), {
      columnOf: (i) => i.status,
      renderCard: (i) => h('button.board-card.stg-init', { type: 'button', onclick: () => go(ctx, 'initiatives', i.id) },
        h('div.bc-meta', h('span.stg-code', i.code), h('span', i.objective_code)),
        h('div.bc-title', L(i.title_ar, i.title_en)),
        h('div.si-progress', progress(i.progress, { tone: i.status === 'at_risk' ? 'warn' : i.status === 'completed' ? 'good' : null, label: L('التقدم', 'Progress') }), h('strong.num.tabular', i.progress == null ? '—' : pctText(i.progress))),
        h('div.bc-meta',
          i.milestones_total ? h('span', icon('milestone'), `${nf(i.milestones_done, 0)}/${nf(i.milestones_total, 0)}`) : null,
          i.end_date ? h('span', icon('calendar'), fmtDate(i.end_date)) : null,
          i.delayed ? h('span.chip.tiny.crit', L('تجاوز الموعد', 'Overdue')) : null,
          i.has_project ? (i.project?.available ? h('span.si-src', icon('folder'), L('من المشروع', 'From project')) : h('span.si-src.locked', icon('lock'), L('المشروع غير متاح لك', 'Project not available to you'))) : null),
        h('div.bc-meta', h('span', L(i.dept_ar, i.dept_en)))),
      emptyText: L('لا مبادرات', 'None'),
    }));
  }
  if (ctx.params[1]) initiativeSheet(ctx, ctx.params[1], reload); else closeStale(null);
  return wrap;
}
async function initiativeSheet(ctx, id, reload) {
  let i;
  try { i = await call(`/initiatives/${encodeURIComponent(id)}`); } catch (e) { toast(e.message, { kind: 'error' }); history.replaceState(null, '', `#/sys/${ctx.key}/initiatives`); return; }
  closeStale(`ini:${id}`);
  const p = i.project;
  const projectBlock = !i.has_project
    ? h('div.stg-proj.none', icon('link'), h('div.grow', h('strong', L('لا يوجد مشروع مرتبط', 'No linked project')), h('div.tiny.faint', i.progress_source === 'spmo' ? L('نسبة التقدم معلنة من إدارة المشاريع الاستراتيجية.', 'Progress is reported by the SPMO.') : L('لم تُعلن نسبة تقدم بعد.', 'No progress reported yet.'))),
      i.can_link ? h('button.btn.sm', { type: 'button', onclick: (e) => linkProject(e.currentTarget, i, reload) }, icon('link'), L('ربط بمشروع', 'Link a project')) : null)
    : p?.available
      ? h('div.stg-proj', icon('folder'), h('div.grow',
        h('strong', p.name), h('div.stg-proj-bar', progress(p.progress, { tone: p.delayed ? 'crit' : p.at_risk ? 'warn' : null, label: L('تقدم المشروع', 'Project progress') }), h('span.num.tabular', p.progress == null ? L('لم يُحدَّث', 'Not reported') : pctText(p.progress))),
        h('div.bc-meta', p.delayed ? h('span.chip.tiny.crit', L('متأخر', 'Delayed')) : p.at_risk ? h('span.chip.tiny.warn', L('معرّض للتأخر', 'At risk')) : h('span.chip.tiny.good', L('ضمن الجدول', 'On schedule')),
          h('span.tiny.faint', L(`المهام: ${nf(p.tasks_done, 0)}/${nf(p.tasks_total, 0)}`, `Tasks: ${nf(p.tasks_done, 0)}/${nf(p.tasks_total, 0)}`)), p.due_date ? h('span.tiny.faint', `${L('الاستحقاق', 'Due')} ${fmtDate(p.due_date)}`) : null)),
      h('a.btn.sm', { href: `#/projects/${p.id}` }, L('فتح المشروع', 'Open project'), icon('chevron', 'flip-rtl')))
      : h('div.stg-proj.locked', icon('lock'), h('div.grow', h('strong', L('غير متاح لك', 'Not available to you')),
        h('div.tiny.faint', L('المشروع المرتبط خارج نطاق صلاحياتك في المشاريع؛ لا تُعرض تفاصيله. نسبة التقدم الظاهرة هنا معلنة من إدارة المشاريع الاستراتيجية.', 'The linked project is outside your project scope, so its details are hidden. Any progress shown here is reported by the SPMO.'))));
  const ms = h('ul.stg-ms', i.milestones.map((m) => h(`li${m.done ? '.done' : ''}`,
    i.can_tick ? h('button.stg-check', { type: 'button', 'aria-pressed': String(m.done), 'aria-label': `${L(m.title_ar, m.title_en)} — ${m.done ? L('منجزة', 'done') : L('غير منجزة', 'not done')}`, onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/initiatives/${i.id}/milestones/${m.id}/toggle`, { method: 'POST', body: { done: !m.done } })); if (r) reload(); } }, icon(m.done ? 'check' : 'circle'))
      : h('span.stg-check.ro', { 'aria-hidden': 'true' }, icon(m.done ? 'check' : 'circle')),
    h('div.grow', h('div', L(m.title_ar, m.title_en)), h('div.tiny.faint', m.due_date ? `${L('الموعد', 'Due')} ${fmtDate(m.due_date)}` : '')),
    m.overdue ? h('span.chip.tiny.crit', L('متأخرة', 'Overdue')) : null)));
  const body = h('div.stg-sheet',
    h('div.stg-sheet-hero',
      ring({ value: i.progress, size: 96, tone: i.status === 'at_risk' ? 'warn' : i.status === 'completed' ? 'good' : 'accent', label: i.progress == null ? '—' : pctText(i.progress), sub: i.progress_source === 'project' ? L('من المشروع', 'from project') : i.progress_source === 'spmo' ? L('معلنة', 'reported') : L('لا بيانات', 'no data') }),
      h('dl.sys-kv',
        h('dt', L('الهدف الاستراتيجي', 'Objective')), h('dd', `${i.objective_code} · ${L(i.objective_ar, i.objective_en)}`),
        h('dt', L('الإدارة المالكة', 'Owner department')), h('dd', L(i.dept_ar, i.dept_en)),
        h('dt', L('المالك', 'Owner')), h('dd', i.owner ? L(i.owner.name_ar, i.owner.name_en) : '—'),
        h('dt', L('المدة', 'Timeline')), h('dd', `${i.start_date ? fmtDate(i.start_date) : '—'} → ${i.end_date ? fmtDate(i.end_date) : '—'}`, i.delayed ? h('span.chip.tiny.crit', { style: { marginInlineStart: '6px' } }, L('تجاوز الموعد', 'Overdue')) : null))),
    i.description_ar ? h('p.muted', L(i.description_ar, i.description_en || i.description_ar)) : null,
    h('h3.stg-sub', L('المشروع المرتبط', 'Linked project')), projectBlock,
    h('h3.stg-sub', L('المراحل الرئيسية', 'Milestones'), h('span.count', `${nf(i.milestones_done, 0)}/${nf(i.milestones_total, 0)}`)),
    i.milestones.length ? ms : h('p.tiny.faint', L('لا مراحل محددة.', 'No milestones defined.')),
    !i.can_tick && i.milestones.length ? h('p.tiny.faint', icon('info'), L('يحدّث المراحلَ مالكُ المبادرة وإدارة المشاريع الاستراتيجية.', 'Milestones are updated by the initiative owner and the SPMO.')) : null);
  showSheet(ctx, `ini:${id}`, { title: `${i.code} · ${L(i.title_ar, i.title_en)}`, subtitle: L(i.dept_ar, i.dept_en), badges: [statusChip(i.status, INIT)], body, wide: true });
}
async function linkProject(btn, i, done) {
  const projects = await api('/api/projects').catch(() => []);
  if (!projects.length) { toast(L('لا توجد مشاريع ضمن نطاقك لربطها', 'No projects in your scope to link'), { kind: 'info' }); return; }
  const v = await formDialog({ title: L('ربط المبادرة بمشروع', 'Link the initiative to a project'), intro: L('تظهر المشاريع التي تملك صلاحية الاطلاع عليها فقط. يرى كل مستخدم تقدم المشروع حسب صلاحياته.', 'Only projects you can see are listed. Each viewer sees project progress according to their own scope.'),
    fields: [{ name: 'project_id', label: L('المشروع', 'Project'), type: 'select', required: true, options: projects.map((p) => ({ value: p.id, label: `${p.name} — ${L(p.dept_ar, p.dept_en)}` })) }], submitLabel: L('ربط', 'Link') });
  if (!v) return;
  const r = await act(btn, () => call(`/initiatives/${i.id}/project`, { method: 'PUT', body: { project_id: v.project_id } }));
  if (r) { toast(L('رُبطت المبادرة بالمشروع', 'Initiative linked')); done(); }
}

// ================================================================ MY UPDATES / VALIDATION QUEUE
async function renderUpdates(ctx, sum, reload) {
  const u = await call('/updates');
  const wrap = h('div.stg-updates');
  const refresh = () => reload();
  if (u.is_admin) {
    const own = u.queue.filter((q) => q.own).length;
    wrap.append(h('section.card.stg-queue',
      h('div.card-head', h('h2.card-title', L('قائمة الاعتماد', 'Validation queue')), h('span.chip.tiny.info', `${nf(u.queue.length, 0)}`), h('span.grow'), own ? h('span.tiny.faint', icon('shield'), L(`${nf(own, 0)} أدخلتها بنفسك ويعتمدها زميل`, `${nf(own, 0)} submitted by you — a colleague validates`)) : null),
      u.queue.length ? h('ul.stg-qlist', u.queue.map((q) => queueRow(ctx, q, refresh)))
        : emptyState({ compact: true, icon: 'badgeCheck', title: L('لا قيم بانتظار الاعتماد', 'Nothing waiting for validation'), body: L('ستظهر هنا القيم التي يرصدها ملّاك المؤشرات.', 'Values submitted by KPI owners appear here.') })));
  }
  if (u.owned.length) {
    const box = h('section.card.stg-due-card',
      h('div.card-head', h('h2.card-title', L('مطلوب منك', 'Due from you')), u.due.length ? h('span.chip.tiny.warn', nf(u.due.length, 0)) : h('span.chip.tiny.good', icon('check'), L('مكتمل', 'All done')), h('span.grow'), h('span.tiny.faint', L(`مهلة الرصد ${u.report_days} يوماً بعد نهاية الفترة`, `Due ${u.report_days} days after the period ends`))));
    if (!u.due.length) box.append(emptyState({ compact: true, icon: 'circleCheck', title: L('كل قيم مؤشراتك مرصودة', 'All your KPI values are reported'), body: L('أحسنت! ستظهر القيمة التالية هنا عند انتهاء الفترة.', 'Well done! The next value appears here when the period closes.') }));
    else box.append(h('div.stg-due-grid', u.due.map((d) => dueCard(d, u.owned.find((k) => k.id === d.kpi_id), refresh))));
    wrap.append(box);
    wrap.append(h('div.sys-grid.two',
      h('section.card', h('div.card-head', h('h2.card-title', L('مؤشراتي', 'My KPIs')), h('span.count.tiny.faint', nf(u.owned.length, 0))),
        h('ul.stg-kpi-list', u.owned.map((k) => h('li', h('button.stg-kpi-row', { type: 'button', onclick: () => go(ctx, 'kpis', k.id) },
          h('div.grow', h('div.kr-name', h('span.stg-code', k.code), L(k.name_ar, k.name_en)), h('div.kr-meta', kpiValueLine(k))), sparkline(k.spark.map((p) => ({ v: p.v, t: p.t, status: p.status }))), rag(k.status)))))),
      h('section.card', h('div.card-head', h('h2.card-title', L('آخر ما رصدته', 'Recently reported'))),
        u.recent.length ? h('ul.list.stg-recent', u.recent.map((a) => h('li', h('div.grow', h('div', h('span.stg-code', a.code), L(a.name_ar, a.name_en)), h('div.tiny.faint', `${L(a.period_ar, a.period_en)} · ${withUnit(a.value, a.unit_ar, a.unit_en, a.decimals)} · ${dateTime(a.submitted_at)}`), a.review_comment && a.status === 'returned' ? h('div.tiny.stg-warn-text', a.review_comment) : null),
          a.on_time && a.status !== 'returned' ? h('span.chip.tiny.outline', { 'data-tip': L('رُصدت في موعدها (+8 نقاط تميّز)', 'Reported on time (+8 pts)') }, icon('timer'), L('في الموعد', 'On time')) : null, statusChip(a.status, ACTUAL))))
          : h('p.tiny.faint', L('لم ترصد أي قيمة بعد.', 'You have not reported any value yet.')))));
  }
  if (!u.is_admin && !u.owned.length) {
    wrap.append(h('div.card', emptyState({ icon: 'inbox', title: L('لا مؤشرات تملكها', 'You do not own any KPI'), body: L('يرصد قيمَ المؤشرات مالكُها أو مديرُ الإدارة المالكة، وتعتمدها إدارة المشاريع الاستراتيجية. يمكنك متابعة أداء الخطة من الخريطة وبطاقة الأداء.', 'KPI values are reported by their owner (or the owner department’s manager) and validated by the SPMO. You can follow the plan on the map and scorecard.'),
      actions: [{ label: L('بطاقة الأداء', 'Open the scorecard'), primary: true, onClick: () => go(ctx, 'kpis') }] })));
  }
  return wrap;
}
function dueCard(d, k, refresh) {
  const kk = k ? { ...k, due: [d], min_value: d.min_value, max_value: d.max_value } : { id: d.kpi_id, code: d.code, name_ar: d.name_ar, name_en: d.name_en, unit_ar: d.unit_ar, unit_en: d.unit_en, decimals: d.decimals, measure: d.measure, due: [d], min_value: d.min_value, max_value: d.max_value };
  return h(`article.stg-due-item.${d.state}`,
    h('div.di-top', statusChip(d.state, DUE), h('span.grow'), h('span.tiny.faint', `${L('آخر موعد', 'Due')} ${fmtDate(d.due)}`)),
    h('div.di-name', h('span.stg-code', d.code), L(d.name_ar, d.name_en)),
    h('div.di-period', icon('calendar'), L(d.period_ar, d.period_en)),
    h('div.di-facts', h('span', L('المستهدف', 'Target'), h('strong.tabular', withUnit(d.cumulative_target ?? d.target, d.unit_ar, d.unit_en, d.decimals))), d.previous_value != null ? h('span', L('السابقة', 'Previous'), h('strong.tabular', withUnit(d.previous_value, d.unit_ar, d.unit_en, d.decimals))) : null),
    d.review_comment ? h('div.callout.stg-return-note', icon('messageSquare'), h('div', h('strong', d.reviewed_by ? L(d.reviewed_by.name_ar, d.reviewed_by.name_en) : L('إدارة المشاريع الاستراتيجية', 'SPMO')), h('div', d.review_comment))) : null,
    h('button.btn.primary.block', { type: 'button', onclick: (e) => submitDialog(e.currentTarget, kk, d.period, refresh) }, icon('pencil'), d.state === 'returned' ? L('صحّح وأعد الإرسال', 'Correct and resubmit') : L('أدخل القيمة', 'Enter value')));
}
function queueRow(ctx, q, refresh) {
  return h(`li.stg-q${q.own ? '.own' : ''}`,
    h('div.q-main', h('div.q-name', h('span.stg-code', q.code), h('button.linklike', { type: 'button', onclick: () => go(ctx, 'kpis', q.kpi_id) }, L(q.name_ar, q.name_en))),
      h('div.tiny.faint', `${L(q.dept_ar, q.dept_en)} · ${L(q.period_ar, q.period_en)} · ${q.submitted_by ? L(q.submitted_by.name_ar, q.submitted_by.name_en) : ''} · ${dateTime(q.submitted_at)}`),
      q.note ? h('div.tiny', `${L('ملاحظة المالك', 'Owner note')}: ${q.note}`) : null),
    h('div.q-val', h('strong.tabular', withUnit(q.measure === 'cumulative' ? q.comparable : q.value, q.unit_ar, q.unit_en, q.decimals)), h('span.tiny.faint', `${L('المستهدف', 'Target')} ${withUnit(q.target, q.unit_ar, q.unit_en, q.decimals)}`)),
    h('div.q-status', rag(q.status), q.late ? h('span.chip.tiny.warn', L('بعد الموعد', 'Late')) : null),
    h('div.q-actions', q.own
      ? h('span.chip.tiny.outline', { 'data-tip': L('فصل المهام: لا يعتمد أحد قيمة أدخلها بنفسه', 'Segregation of duties: nobody validates their own value') }, icon('shield'), L('يعتمدها زميل', 'Colleague validates'))
      : [h('button.btn.sm.primary', { type: 'button', onclick: (e) => review(e.currentTarget, q.actual_id, 'validate', refresh) }, icon('check'), L('اعتماد', 'Validate')),
        h('button.btn.sm', { type: 'button', onclick: (e) => review(e.currentTarget, q.actual_id, 'return', refresh) }, icon('undo'), L('إعادة', 'Return'))]));
}

function noPlan(sum) {
  return h('div.card', emptyState({ icon: 'compass', title: L('لا توجد خطة استراتيجية نشطة', 'No active strategic plan'), body: sum.is_admin ? L('ابدأ بإعداد الخطة من تبويب الإدارة.', 'Set up the plan from the Manage tab.') : L('ستظهر الخطة هنا عندما تعتمدها إدارة المشاريع الاستراتيجية.', 'The plan appears here once the SPMO publishes it.') }));
}

const TAB_RENDER = {
  map: renderMap,
  kpis: renderKpis,
  initiatives: renderInitiatives,
  updates: renderUpdates,
  admin: (ctx, sum, reload) => renderAdmin(ctx, sum, reload, { call, ui, RAG, INIT, FREQ }),
};
void getLang;
