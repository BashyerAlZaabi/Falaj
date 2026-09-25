// Internal Audit — «لوحة اللجنة» (audit committee & IA insights) and «التقارير
// الصادرة». Aggregates only: departments, never individual owners.
import { statRow, statTile, card, grid, dataTable } from '../../../sys-kit.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, riskChip, deptName, phaseChip, PHASES, emptyState, nextCard, btn, demoBadge } from './common.js';

export async function load(tab, me) {
  if (tab === 'reports') return { engagements: await call(`/engagements?year=${me.year}`) };
  return { d: await call(`/dashboard?year=${me.year}`) };
}
export function header(tab, me, ctx, data) {
  if (tab === 'reports') return { badges: demoBadge(data?.engagements), eyebrow: L('لجنة التدقيق', 'Audit committee'), title: L('التقارير الصادرة', 'Issued reports'), sub: L('تقارير مكتب التدقيق الداخلي الصادرة هذا العام وحالة ملاحظاتها.', 'Reports issued by Internal Audit this year and the status of their findings.') };
  return me.roles.ia
    ? { eyebrow: L(`التدقيق الداخلي · ${me.year}`, `Internal Audit · ${me.year}`), title: L('مؤشرات التدقيق', 'Audit insights'), sub: L('صورة شاملة للملاحظات الصادرة وخطط المعالجة وتقدم الخطة — كما تراها لجنة التدقيق للتقارير الصادرة.', 'Issued findings, action plans and plan delivery — the committee sees the same for issued reports.') }
    : { eyebrow: L(`لجنة التدقيق · ${me.year}`, `Audit committee · ${me.year}`), title: L('لوحة لجنة التدقيق', 'Audit committee dashboard'), sub: L('الملاحظات المفتوحة في التقارير الصادرة حسب الخطورة والإدارة، وخطط المعالجة المتأخرة، واتجاه الإصدار والإغلاق.', 'Open findings in issued reports by risk and department, overdue action plans, and the issue/close trend.') };
}

const RISKS = [['high', 'عالية', 'High'], ['medium', 'متوسطة', 'Medium'], ['low', 'منخفضة', 'Low']];
const legend = (items) => h('div.aud-legend', { 'aria-hidden': 'true' }, items.map(([cls, label]) => h('span', h(`i.sw.${cls}`), label)));
const tableToggle = (table) => h('details.aud-chart-table', h('summary', icon('table'), L('عرض البيانات كجدول', 'Show as table')), table);

function riskByDept(d) {
  const rows = d.by_department;
  if (!rows.length) return emptyState({ compact: true, icon: 'circleCheck', title: L('لا ملاحظات مفتوحة', 'No open findings') });
  const max = Math.max(...rows.map((r) => r.total));
  return h('div',
    legend(RISKS.map(([k, ar, en]) => [`risk-${k}`, L(ar, en)])),
    h('div.aud-hbars', { role: 'img', 'aria-label': L('الملاحظات المفتوحة حسب الإدارة والخطورة', 'Open findings by department and risk') }, rows.map((r) => h('div.aud-hbar',
      h('span.aud-hbar-label', deptName(r.department)),
      h('div.aud-hbar-track', h('div.aud-hbar-fill', { style: { width: `${(r.total / max) * 100}%` } },
        RISKS.filter(([k]) => r[k]).map(([k, ar, en]) => h(`i.risk-${k}`, { style: { flexGrow: r[k] }, 'data-tip': `${deptName(r.department)} — ${L(`خطورة ${ar}`, `${en} risk`)}: ${fmtNum(r[k])}` })))),
      h('span.aud-hbar-val.num', fmtNum(r.total), r.overdue ? h('span.aud-hbar-late', { 'data-tip': L('خطط متأخرة', 'Overdue plans') }, icon('clockAlert'), fmtNum(r.overdue)) : null)))),
    tableToggle(dataTable({ caption: L('الملاحظات المفتوحة حسب الإدارة', 'Open findings by department'), stackMobile: false, rows, columns: [
      { key: 'd', label: L('الإدارة', 'Department'), render: (r) => deptName(r.department) },
      ...RISKS.map(([k, ar, en]) => ({ key: k, label: L(ar, en), num: true, render: (r) => fmtNum(r[k]) })),
      { key: 't', label: L('الإجمالي', 'Total'), num: true, render: (r) => fmtNum(r.total) }, { key: 'o', label: L('متأخرة', 'Overdue'), num: true, render: (r) => fmtNum(r.overdue) },
    ] })));
}

function trend(d) {
  const max = Math.max(1, ...d.trend.flatMap((t) => [t.issued, t.closed]));
  const cq = Math.floor(new Date().getUTCMonth() / 3) + 1;
  return h('div',
    legend([['s1', L('صادرة', 'Issued')], ['s2', L('مغلقة', 'Closed')]]),
    h('div.aud-cols', { role: 'img', 'aria-label': L('الملاحظات الصادرة والمغلقة حسب الربع', 'Findings issued and closed by quarter') },
      h('div.aud-cols-grid', { 'aria-hidden': 'true' }, h('i'), h('i'), h('i')),
      d.trend.map((t) => h(`div.aud-colgroup${t.quarter === cq && d.year === new Date().getUTCFullYear() ? '.now' : ''}`,
        h('div.aud-colbars',
          h(`div.aud-col.s1${t.issued ? '' : '.zero'}`, { style: { height: `${(t.issued / max) * 100}%` }, 'data-tip': L(`الربع ${t.quarter}: ${t.issued} صادرة`, `Q${t.quarter}: ${t.issued} issued`) }, t.issued ? h('span.num', fmtNum(t.issued)) : null),
          h(`div.aud-col.s2${t.closed ? '' : '.zero'}`, { style: { height: `${(t.closed / max) * 100}%` }, 'data-tip': L(`الربع ${t.quarter}: ${t.closed} مغلقة`, `Q${t.quarter}: ${t.closed} closed`) }, t.closed ? h('span.num', fmtNum(t.closed)) : null)),
        h('div.aud-col-label', L(`الربع ${fmtNum(t.quarter)}`, `Q${t.quarter}`))))),
    tableToggle(dataTable({ caption: L('حسب الربع', 'By quarter'), stackMobile: false, rows: d.trend, columns: [
      { key: 'q', label: L('الربع', 'Quarter'), render: (t) => L(`الربع ${t.quarter}`, `Q${t.quarter}`) },
      { key: 'i', label: L('صادرة', 'Issued'), num: true, render: (t) => fmtNum(t.issued) }, { key: 'c', label: L('مغلقة', 'Closed'), num: true, render: (t) => fmtNum(t.closed) },
    ] })));
}

function planProgress(d) {
  const p = d.plan; const total = p.total || 1;
  const shown = PHASES.filter((ph) => p.by_phase[ph.key]);
  return h('div.stack',
    h('div.aud-planbar', { role: 'img', 'aria-label': L('توزيع مهام الخطة حسب المرحلة', 'Plan engagements by phase') }, shown.map((ph) => h(`i.ph-${ph.key}`, { style: { flexGrow: p.by_phase[ph.key] }, 'data-tip': `${L(ph.ar, ph.en)}: ${p.by_phase[ph.key]}` }))),
    h('ul.aud-planlegend', PHASES.map((ph) => h('li', h(`i.sw.ph-${ph.key}`), h('span.grow', L(ph.ar, ph.en)), h('strong.num', fmtNum(p.by_phase[ph.key] || 0))))),
    h('p.tiny.faint', L(`${fmtNum(p.reports_issued)} من ${fmtNum(p.total)} مهام صدر تقريرها (${fmtNum(Math.round((p.reports_issued / total) * 100))}%).`, `${p.reports_issued} of ${p.total} engagements have an issued report.`)));
}

function overdueTable(d, ia) {
  return dataTable({
    caption: L('خطط المعالجة المتأخرة', 'Overdue action plans'), rows: d.overdue, onRow: (o) => { location.hash = `${HREF}/f/${o.id}`; },
    empty: emptyState({ compact: true, icon: 'circleCheck', title: L('لا خطط معالجة متأخرة', 'No overdue action plans') }),
    columns: [
      { key: 't', label: L('الملاحظة', 'Finding'), render: (o) => h('a', { href: `${HREF}/f/${o.id}` }, o.title), sort: (o) => o.title },
      { key: 'd', label: L('الإدارة', 'Department'), render: (o) => deptName(o.department), sort: (o) => o.department?.name_ar },
      ia ? { key: 'o', label: L('المسؤول', 'Owner'), render: (o) => (o.owner ? L(o.owner.name_ar, o.owner.name_en) : '—') } : null,
      { key: 'r', label: L('الخطورة', 'Risk'), render: (o) => riskChip(o.risk, { prefix: false }), sort: (o) => ({ high: 0, medium: 1, low: 2 }[o.risk]) },
      { key: 'l', label: L('التأخير', 'Late by'), num: true, render: (o) => h('span.aud-late-days', L(`${fmtNum(o.days_overdue)} يوماً`, `${o.days_overdue} d`)), sort: (o) => -o.days_overdue },
    ].filter(Boolean), sortKey: 'l',
  });
}

function paintDashboard(me, { d }) {
  const ia = me.roles.ia;
  const top = d.overdue.find((o) => o.risk === 'high') || d.overdue[0];
  return h('div.aud-committee',
    top ? nextCard({ tone: 'warn', icon: 'clockAlert', title: L(`${fmtNum(d.overdue.length)} ${d.overdue.length === 1 ? 'خطة معالجة متأخرة' : 'خطط معالجة متأخرة'} — الأطول تأخراً: ${top.days_overdue} يوماً`, `${d.overdue.length} overdue action plan(s) — longest ${top.days_overdue} days`), body: `${top.title} · ${deptName(top.department)}`, action: btn(L('عرض الملاحظة', 'View finding'), { primary: true, href: `${HREF}/f/${top.id}` }) })
      : nextCard({ tone: 'good', icon: 'circleCheck', title: L('لا خطط معالجة متأخرة', 'No overdue action plans'), body: L('جميع خطط المعالجة في التقارير الصادرة ضمن مواعيدها.', 'All action plans in issued reports are on schedule.') }),
    statRow([
      statTile({ label: L('ملاحظات مفتوحة', 'Open findings'), value: d.open.total, icon: 'fileWarning', hint: L(`${fmtNum(d.awaiting_response)} بانتظار رد الإدارة`, `${d.awaiting_response} awaiting response`) }),
      statTile({ label: L('عالية الخطورة', 'High risk'), value: d.open.high, icon: 'flame', tone: d.open.high ? 'emph' : 'good' }),
      statTile({ label: L('خطط معالجة متأخرة', 'Overdue plans'), value: d.overdue.length, icon: 'clockAlert', tone: d.overdue.length ? 'warn' : 'good' }),
      statTile({ label: L('الإغلاق في الموعد', 'Closed on time'), value: d.on_time_rate == null ? null : `${fmtNum(d.on_time_rate)}%`, icon: 'badgeCheck', tone: d.on_time_rate == null ? null : d.on_time_rate >= 80 ? 'good' : 'warn', hint: d.closed_actions ? L(`من ${fmtNum(d.closed_actions)} خطة مغلقة`, `of ${d.closed_actions} closed plans`) : L('لا خطط مغلقة بعد', 'No closed plans yet') }),
      statTile({ label: L('تقارير صادرة', 'Reports issued'), value: `${fmtNum(d.plan.reports_issued)}/${fmtNum(d.plan.total)}`, icon: 'fileCheck', href: ia ? `${HREF}/plan` : `${HREF}/reports` }),
    ]),
    grid('two', card(L('الملاحظات المفتوحة حسب الإدارة والخطورة', 'Open findings by department and risk'), riskByDept(d)), card(L('الملاحظات الصادرة والمغلقة حسب الربع', 'Findings issued and closed by quarter'), trend(d))),
    grid('main-side', card(h('div.row.grow', h('h2.card-title', L('خطط المعالجة المتأخرة', 'Overdue action plans')), ia ? null : h('span.chip.tiny.outline', icon('shield'), L('على مستوى الإدارة', 'Department level'))), overdueTable(d, ia)), card(L('تقدم خطة التدقيق', 'Audit plan progress'), planProgress(d))),
    ia ? null : h('p.tiny.faint.aud-foot', icon('lock'), L('تعرض اللوحة الملاحظات الواردة في التقارير الصادرة فقط، دون المسودات أو أوراق العمل أو أسماء المسؤولين.', 'Only findings from issued reports are shown — no drafts, working papers or owner names.')));
}

function paintReports(me, { engagements }) {
  const issued = engagements.filter((e) => e.report_issued_at).sort((a, b) => b.report_issued_at.localeCompare(a.report_issued_at));
  const upcoming = engagements.filter((e) => !e.report_issued_at);
  return h('div.aud-reports',
    issued.length ? h('div.aud-report-grid', issued.map((e) => h('article.card.aud-report',
      h('div.aud-req-head', h('span.chip.tiny.good', icon('fileCheck'), L('صادر', 'Issued')), h('span.tiny.faint', fmtDate(e.report_issued_at))),
      h('h3.aud-req-title', h('a', { href: `${HREF}/e/${e.id}/report` }, e.title)),
      h('div.tiny.faint', `${deptName(e.department)} · ${L(`الربع ${e.quarter}`, `Q${e.quarter}`)}`),
      h('div.aud-report-risk', RISKS.map(([k, ar, en]) => h(`span.aud-pill.risk-${k}`, { 'data-tip': L(`خطورة ${ar}`, `${en} risk`) }, fmtNum(e.findings[k]), ' ', L(ar, en))), h('span.grow'), h('span.tiny', L(`${fmtNum(e.findings.open)} مفتوحة`, `${e.findings.open} open`))),
      h('div.aud-report-foot', phaseChip(e.phase), h('span.grow'), btn(L('عرض التقرير', 'View report'), { sm: true, tertiary: true, href: `${HREF}/e/${e.id}/report` })))))
      : h('div.card', emptyState({ icon: 'fileText', title: L('لا تقارير صادرة بعد', 'No issued reports yet') })),
    upcoming.length ? h('section.aud-group', h('div.section', L('مهام لم يصدر تقريرها', 'Engagements without an issued report'), h('span.count', fmtNum(upcoming.length))),
      h('ul.list.inset', upcoming.map((e) => h('li', h('span.grow', h('span.title', e.title), h('span.meta', `${deptName(e.department)} · ${L(`الربع ${e.quarter}`, `Q${e.quarter}`)}`)), phaseChip(e.phase))))) : null);
}

export function paint(tab, me, ctx, data) {
  return tab === 'reports' ? paintReports(me, data) : paintDashboard(me, data);
}
