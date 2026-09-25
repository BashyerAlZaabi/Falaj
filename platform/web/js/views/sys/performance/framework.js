// «الإطار» — the competency framework with behavioural indicators, the 1–5
// rating scale, how the weighted score and bands are computed, and the current
// cycle's phases and dates. Readable by every staff member.
import { h, icon, L, fmtNum } from '../../../sys-kit.js';
import * as C from './common.js';

export async function view() {
  const f = await C.call('/framework');
  const share = f.objectives_share;
  return h('div.perf-fw',
    h('section.card.perf-fw-hero',
      h('div.grow',
        h('span.perf-eyebrow', icon('compass'), L('إطار الأداء المؤسسي', 'Performance framework')),
        h('h2.perf-hero-title', L('كيف يُقاس الأداء؟', 'How is performance measured?')),
        h('p.perf-hero-sub', L(`تُحتسب الدرجة المرجّحة من ${fmtNum(share)}% للأهداف (متوسط تقديراتها بحسب أوزانها) و${fmtNum(100 - share)}% للجدارات الخمس، على مقياس من 1 إلى 5، ثم تُحوَّل إلى أحد خمسة تقديرات. تُعايَر النتائج مؤسسياً قبل اعتمادها.`, `The weighted score is ${share}% objectives (weighted average) and ${100 - share}% the five competencies on a 1–5 scale, mapped to one of five bands, then calibrated before release.`))),
      h('div.perf-formula', { role: 'img', 'aria-label': L(`الدرجة = ${share}% أهداف + ${100 - share}% جدارات`, `Score = ${share}% objectives + ${100 - share}% competencies`) },
        h('div.perf-f-part', h('b.num', `${fmtNum(share)}%`), h('span', L('الأهداف', 'Objectives'))), h('span.perf-f-op', '+'),
        h('div.perf-f-part', h('b.num', `${fmtNum(100 - share)}%`), h('span', L('الجدارات', 'Competencies'))), h('span.perf-f-op', '='),
        h('div.perf-f-part.total', h('b', L('الدرجة', 'Score')), h('span', L('من 1 إلى 5', '1 to 5'))))),
    h('div.perf-sec-h', h('h3', L('الجدارات المؤسسية', 'Core competencies')), h('span.faint.tiny', L('تنطبق على جميع الموظفين', 'Apply to everyone'))),
    h('div.perf-fw-grid', f.competencies.map((c) => h('section.card.perf-fw-comp',
      h('div.perf-fw-comp-head', h('span.perf-comp-ic.lg', icon(c.icon || 'star')), h('h3', L(c.name_ar, c.name_en))),
      h('p.muted', L(c.description_ar, c.description_en)),
      h('ul.perf-fw-beh', c.behaviours.map((b) => h('li', icon('check'), h('span', L(b.ar, b.en)))))))),
    h('div.sys-grid.two',
      h('section.card',
        h('div.card-head', h('h2.card-title', L('مقياس التقدير', 'Rating scale'))),
        h('ol.perf-scale', f.scale.map((s) => h('li', h('span.perf-scale-n', String(s.n)), C.stars(s.n), h('div.grow', h('b', L(s.ar, s.en)), h('p.tiny.muted', L(s.desc_ar, s.desc_en))))))),
      h('section.card',
        h('div.card-head', h('h2.card-title', L('التقديرات النهائية', 'Result bands'))),
        h('ul.perf-bandlist', f.bands.map((b, i) => h('li', C.bandChip(b.key, { tiny: false }), h('span.grow'), h('span.num.faint', i === 0 ? `≥ ${b.min}` : `${b.min} – ${(f.bands[i - 1].min - 0.01).toFixed(2)}`)))),
        h('p.tiny.faint', L(`عدد الأهداف من ${f.min_objectives} إلى ${f.max_objectives} بمجموع أوزان 100%، يعتمدها المدير المباشر. لا يقيّم أحد نفسه، ولا يعاير موظف الموارد البشرية مراجعته أو تقييماً أرسله.`, `${f.min_objectives}–${f.max_objectives} objectives totalling 100%, agreed by the line manager. Nobody rates themselves, and HR never calibrates their own review or one they assessed.`)))),
    f.cycle ? h('section.card',
      h('div.card-head', h('h2.card-title', L(`مراحل ${f.cycle.name_ar}`, `${f.cycle.name_en} phases`))),
      h('ol.perf-pc.compact', f.cycle.phases.map((p) => { const i = C.PHASES.indexOf(p.phase); const cur = C.PHASES.indexOf(f.cycle.phase); return h(`li.${i < cur ? 'done' : i === cur ? 'cur' : 'todo'}`, h('span.pc-dot', i < cur ? icon('check') : icon(C.PHASE[p.phase][2])), h('span.pc-name', C.phaseName(p.phase)), C.dateRange(p.starts_on, p.ends_on)); }))) : null);
}
