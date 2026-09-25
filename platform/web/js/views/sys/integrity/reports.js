// «التقارير» — compliance officer and president: aggregates only. Groups smaller
// than the minimum size are hidden; nothing here identifies an individual.
import { h, icon, L, fmtNum, fmtDate, statTile, statRow, grid, emptyState } from '../../../sys-kit.js';
import { call, DECISION, lbl, money } from './common.js';

export async function reportsTab() {
  const r = await call('/reports');
  const t = r.totals; const c = r.cycle;
  if (!c) return { actions: [], body: emptyState({ icon: 'chartBar', title: L('لا توجد دورة إقرار بعد', 'No declaration cycle yet'), body: L('تظهر المؤشرات المجمّعة بعد فتح أول دورة.', 'Aggregates appear once the first cycle opens.') }) };
  const pct = (v) => (v == null ? '—' : `⁦${fmtNum(v)}%⁩`);

  // submission rate by department (magnitude → one hue; hidden groups drawn distinctly, never as zero)
  const barRow = (name, row, { pooled = false } = {}) => h(`li.integ-bar-row${row.hidden ? '.masked' : ''}${pooled ? '.pooled' : ''}`,
    h('span.integ-bar-name', name),
    h('span.integ-bar-track', { role: 'img', 'aria-label': row.hidden ? L(`${name}: محجوبة لحماية الخصوصية`, `${name}: hidden for privacy`) : `${name}: ${row.rate}%`, 'data-tip': row.hidden ? L(`أقل من ${r.min_group} موظفين — محجوبة`, `Fewer than ${r.min_group} staff — hidden`) : L(`${row.submitted} من ${row.staff} قدّموا`, `${row.submitted} of ${row.staff} submitted`) },
      row.hidden ? null : h('i', { style: { width: `${Math.max(2, row.rate)}%` } })),
    h('span.integ-bar-val', row.hidden ? h('span.integ-hidden-val', icon('lock'), L('محجوبة', 'Hidden')) : h('span.num.tabular', pct(row.rate))));
  const deptCard = h('section.card.integ-report-card',
    h('div.card-head', h('h2.card-title', L('نسبة تقديم الإقرار حسب الإدارة', 'Submission rate by department'))),
    h('p.integ-card-sub', L(`تُحجب الإدارات التي يقل عدد موظفيها عن ${r.min_group}، وتُجمع معاً في صف واحد متى بلغ مجموعها الحد الأدنى.`, `Departments with fewer than ${r.min_group} staff are hidden, and pooled into one row once the pool reaches the minimum.`)),
    h('ul.integ-bars', r.departments.filter((d) => !d.hidden).map((d) => barRow(L(d.name_ar, d.name_en), d)),
      r.pooled ? barRow(L(`الإدارات الصغيرة مجمّعة (${fmtNum(r.pooled.departments)})`, `Small departments pooled (${r.pooled.departments})`), r.pooled, { pooled: true }) : null),
    r.departments.some((d) => d.hidden) ? h('div.integ-masked', h('span.integ-masked-title', icon('lock'), L('محجوبة منفردةً (أقل من 3 موظفين):', 'Hidden individually (fewer than 3 staff):')),
      h('div.integ-masked-list', r.departments.filter((d) => d.hidden).map((d) => h('span.chip.tiny.outline', L(d.name_ar, d.name_en))))) : null);

  // outcomes: part-to-whole of this cycle (≤ 5 categories, legend + direct labels)
  const O = [['cleared', L('مُعتمد — لا يلزم إجراء', 'Cleared'), 1], ['mitigation', L('مع تعليمات', 'With instructions'), 3], ['pending', L('قيد المراجعة', 'Pending review'), 2], ['closed', L('مغلق', 'Closed'), 4]];
  const oTotal = O.reduce((s, [k]) => s + (r.outcomes[k] || 0), 0);
  const outcomeCard = h('section.card.integ-report-card',
    h('div.card-head', h('h2.card-title', L('نتائج المراجعة', 'Review outcomes')), h('span.card-sub', L(`${fmtNum(oTotal)} إقراراً مُقدَّماً`, `${oTotal} submitted`))),
    oTotal ? [h('div.integ-stack', { role: 'img', 'aria-label': O.map(([k, n]) => `${n}: ${r.outcomes[k] || 0}`).join('، ') }, O.filter(([k]) => r.outcomes[k]).map(([k, n, s]) => h(`i.s${s}`, { style: { width: `${(r.outcomes[k] / oTotal) * 100}%` }, 'data-tip': `${n}: ${fmtNum(r.outcomes[k])}` }))),
      h('ul.integ-legend', O.map(([k, n, s]) => h('li', h(`span.integ-swatch.s${s}`), h('span.grow', n), h('strong.num.tabular', fmtNum(r.outcomes[k] || 0)))))]
      : h('p.muted', L('لا إقرارات مُقدَّمة بعد.', 'No submissions yet.')),
    h('p.integ-card-sub', L(`مسودات لم تُقدَّم: ${fmtNum(r.outcomes.draft)} · إفصاحات طارئة هذا العام: ${fmtNum(r.disclosures)}`, `Unsubmitted drafts: ${r.outcomes.draft} · ad-hoc disclosures this year: ${r.disclosures}`)));

  // cumulative submissions per week (single series, columns grow from one baseline)
  const maxW = Math.max(t.staff || 1, ...r.weeks.map((w) => w.cumulative));
  const weeksCard = h('section.card.integ-report-card',
    h('div.card-head', h('h2.card-title', L('مسار التقديم التراكمي', 'Cumulative submissions')), h('span.card-sub', L(`الموعد النهائي ${fmtDate(c.due_on)}`, `Due ${fmtDate(c.due_on)}`))),
    r.weeks.length ? h('div.integ-cols', { role: 'img', 'aria-label': r.weeks.map((w) => `${fmtDate(w.week_of)}: ${w.cumulative}`).join('، ') }, r.weeks.map((w, i) => h(`div.integ-col${i === r.weeks.length - 1 ? '.last' : ''}`, { 'data-tip': L(`أسبوع ${fmtDate(w.week_of)}: ${w.cumulative} من ${t.staff}`, `Week of ${fmtDate(w.week_of)}: ${w.cumulative} of ${t.staff}`) },
      h('span.integ-col-val.num.tabular', i === r.weeks.length - 1 ? fmtNum(w.cumulative) : ''), h('span.integ-col-bar', h('i', { style: { height: `${Math.max(3, (w.cumulative / maxW) * 100)}%` } })), h('span.integ-col-lbl', fmtDate(w.week_of)))))
      : h('p.muted', L('غير متاح.', 'Not available.')));

  const g = r.gifts; const D = ['keep', 'handover', 'decline_return', 'donate', 'pending'];
  const gMax = Math.max(1, ...D.map((k) => g.by_decision[k] || 0));
  const giftsCard = h('section.card.integ-report-card',
    h('div.card-head', h('h2.card-title', L(`الهدايا والضيافة ${g.year}`, `Gifts & hospitality ${g.year}`))),
    h('div.integ-gift-kpis', h('div', h('strong.num.tabular', fmtNum(g.count)), h('span', L('إفصاحاً', 'declarations'))), h('div', h('strong.num.tabular', money(g.value)), h('span', L('القيمة التقديرية', 'estimated value'))), h('div', h('strong.num.tabular', pct(g.prompt_rate)), h('span', L('خلال 5 أيام', 'within 5 days')))),
    h('ul.integ-bars.compact', D.map((k) => { const n = g.by_decision[k] || 0; const name = k === 'pending' ? L('بانتظار القرار', 'Awaiting decision') : lbl(DECISION, k); return h('li.integ-bar-row', h('span.integ-bar-name', name), h('span.integ-bar-track', { 'data-tip': `${name}: ${n}` }, n ? h('i', { style: { width: `${(n / gMax) * 100}%` } }) : null), h('span.integ-bar-val.num.tabular', fmtNum(n))); })));

  return {
    actions: [],
    body: h('div.integ-reports',
      h('div.callout.integ-agg-callout', icon('eyeOff'), h('span', L(`مؤشرات مجمّعة فقط — لا تتضمن أي بيانات فردية، وتُحجب المجموعات الأصغر من ${r.min_group} موظفين.`, `Aggregates only — no individual data; groups smaller than ${r.min_group} are hidden.`))),
      statRow([
        statTile({ label: L('نسبة تقديم الإقرار', 'Submission rate'), value: t.hidden ? null : pct(t.rate), icon: 'percentCircle', tone: t.rate >= 80 ? 'good' : 'emph', hint: t.hidden ? L('محجوبة لحماية الخصوصية', 'Hidden for privacy') : L(`${fmtNum(t.submitted)} من ${fmtNum(t.staff)} موظفاً · دورة ${c.year}`, `${t.submitted} of ${t.staff} staff · ${c.year}`) }),
        statTile({ label: L('قُدّم قبل الموعد', 'Before the deadline'), value: t.on_time, icon: 'calendarCheck', hint: c.status === 'open' ? L(`متبقٍ ${Math.max(0, c.days_left)} يوماً`, `${Math.max(0, c.days_left)} days left`) : L('الدورة مغلقة', 'Cycle closed') }),
        statTile({ label: L('تعليمات سارية', 'Instructions in force'), value: r.mitigations_active, icon: 'shieldAlert', hint: L('تنحٍّ أو إعادة توزيع أو تخارج', 'Recusal, reassignment or divestment') }),
        statTile({ label: L('هدايا مُفصح عنها', 'Gifts declared'), value: g.count, icon: 'gift', hint: money(g.value) }),
      ]),
      grid('main-side', deptCard, outcomeCard),
      grid('two', weeksCard, giftsCard)),
  };
}
