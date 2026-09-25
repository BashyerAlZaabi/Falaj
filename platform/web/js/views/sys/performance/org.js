// «نظرة المؤسسة» — aggregated view for the president: participation and
// completion by department (procedural, no ratings) and the organisation-wide
// rating distribution, suppressed below the minimum group size. No individual
// review is reachable from here; the president sees individual reviews only for
// the directors he line-manages («فريقي»).
import { h, icon, L, fmtNum, statTile, statRow, confidentialBanner } from '../../../sys-kit.js';
import * as C from './common.js';

export async function view(ctx, boot, { cycleId }) {
  const data = await C.call(`/insights${C.q(cycleId)}`);
  if (!data.cycle) return C.emptyCard('chartBar', L('لا توجد دورة أداء بعد', 'No performance cycle yet'), '');
  const c = data.completion;
  const distCard = (title, d, sub) => h('section.card',
    h('div.card-head', h('h2.card-title', title), sub ? h('span.chip.tiny.outline', sub) : null),
    !d ? h('p.muted', L('لا توجد بيانات.', 'No data.'))
      : d.suppressed ? h('div.perf-suppressed', icon('eyeOff'), h('div', h('strong', L('التوزيع محجوب مؤقتاً', 'Distribution withheld')), h('p.muted', L(`يظهر التوزيع عند اكتمال ${fmtNum(data.min_group)} تقييمات على الأقل حمايةً لخصوصية الأفراد (المكتمل حالياً: ${fmtNum(d.n)}).`, `Shown once at least ${data.min_group} assessments are complete, to protect individuals (currently ${d.n}).`))))
        : C.distributionChart(d, { caption: title }));
  return h('div.perf-org',
    confidentialBanner('بيانات مجمّعة فقط: لا تُعرض أي تقديرات فردية، ويُحجب التوزيع حين تقل المجموعة عن الحد الأدنى. نسب الإنجاز إجرائية ولا تتضمن أي تقدير.', 'Aggregated data only: no individual ratings; distributions are withheld below the minimum group size. Completion rates are procedural and contain no ratings.'),
    statRow([
      statTile({ label: L('المشاركون في الدورة', 'Participants'), value: c.total, icon: 'usersRound', hint: `${L(data.cycle.name_ar, data.cycle.name_en)} · ${C.phaseName(data.cycle.phase)}` }),
      statTile({ label: L('اعتماد الأهداف', 'Objectives agreed'), value: C.pctTxt(c.agreed_pct), icon: 'target' }),
      statTile({ label: L('التقييم الذاتي', 'Self-assessment'), value: C.pctTxt(c.self_pct), icon: 'userCheck', tone: data.metric === 'self_pct' ? 'emph' : null }),
      statTile({ label: L('تقييم المدراء', 'Manager assessment'), value: C.pctTxt(c.assessed_pct), icon: 'clipboardCheck', tone: data.metric === 'assessed_pct' ? 'emph' : null }),
      statTile({ label: L('الإقرار بالنتائج', 'Acknowledged'), value: C.pctTxt(c.ack_pct), icon: 'badgeCheck' }),
    ]),
    h('div.sys-grid.two',
      distCard(L('توزيع التقديرات — الدورة المختارة', 'Rating distribution — selected cycle'), data.distribution, L(data.cycle.name_ar, data.cycle.name_en)),
      data.previous ? distCard(L('للمقارنة — الدورة السابقة', 'For comparison — previous cycle'), data.previous.distribution, L(data.previous.cycle.name_ar, data.previous.cycle.name_en)) : null),
    h('section.card',
      h('div.card-head', h('h2.card-title', L('الإنجاز حسب الإدارة', 'Completion by department')), h('span.chip.tiny.outline', icon('shield'), L('إجرائي — بلا تقديرات', 'Procedural — no ratings'))),
      C.completionBars(data.departments, [{ key: 'self_pct', ar: 'التقييم الذاتي', en: 'Self-assessment' }, { key: 'assessed_pct', ar: 'تقييم المدير', en: 'Manager assessment' }])));
}
