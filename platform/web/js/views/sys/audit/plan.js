// Internal Audit — «الخطة»: risk heat-map of the audit universe (likelihood ×
// impact), coverage, quarterly plan and approval (IA prepares, CAE approves).
import { card, grid, dataTable, openSheet, confirmDialog, departments } from '../../../sys-kit.js';
import { h, icon, L, fmtNum, fmtDate, call, HREF, deptName, phaseChip, riskChip, nextCard, btn, formDialog, toast, act, demoBadge } from './common.js';
import { newEngagement } from './board.js';

const ZONE = (s) => (s >= 15 ? 'high' : s >= 8 ? 'medium' : 'low');

export const load = (tab, me) => call(`/plan?year=${me.year}`);

export function header(tab, me, ctx, plan) {
  const actions = [];
  if (plan.can.edit) actions.push({ label: L('عنصر في مجال التدقيق', 'Universe item'), icon: 'plus', onClick: () => addUniverse() });
  if (plan.can.edit) actions.push({ label: L('مهمة جديدة', 'New engagement'), icon: 'plus', primary: !plan.can.approve && !plan.can.submit, onClick: () => newEngagement(ctx) });
  return {
    eyebrow: L(`خطة التدقيق · ${plan.year}`, `Audit plan · ${plan.year}`),
    title: L('الخطة المبنية على المخاطر', 'Risk-based audit plan'),
    sub: L('درجة المخاطر = الاحتمالية × الأثر (1–25). تُعطى الأولوية في الخطة للعناصر عالية الخطورة، ويعتمد رئيس التدقيق الخطة ويطّلع عليها أعضاء لجنة التدقيق.', 'Risk score = likelihood × impact (1–25). High-risk items get priority; the CAE approves the plan and the audit committee can see it.'),
    actions, badges: demoBadge(plan.universe),
  };
}

function statusCard(plan, me) {
  const p = plan.plan;
  const decide = async (kind, el) => {
    if (kind === 'return') {
      const v = await formDialog({ title: L('إعادة الخطة للتعديل', 'Return the plan'), fields: [{ name: 'note', type: 'textarea', label: L('ما المطلوب تعديله؟', 'What should change?'), required: true, rows: 3 }], submitLabel: L('إعادة', 'Return') });
      if (!v) return;
      await act(el, () => call('/plan/return', { method: 'POST', body: { year: plan.year, note: v.note } }), { success: L('أُعيدت الخطة للتعديل', 'Plan returned') });
      return;
    }
    if (kind === 'approve' && !(await confirmDialog(L('اعتماد خطة التدقيق', 'Approve the audit plan'), L(`ستُعتمد خطة ${plan.year} بمهامها (${plan.engagements.length}) ويُبلَّغ أعضاء لجنة التدقيق.`, `The ${plan.year} plan (${plan.engagements.length} engagements) will be approved and the committee notified.`), { confirmLabel: L('اعتماد', 'Approve') }))) return;
    await act(el, () => call(`/plan/${kind}`, { method: 'POST', body: { year: plan.year } }), { success: kind === 'approve' ? L('اعتُمدت الخطة', 'Plan approved') : L('رُفعت الخطة للاعتماد', 'Plan submitted') });
  };
  if (p.status === 'approved') {
    return nextCard({ tone: 'good', icon: 'badgeCheck', title: L('الخطة معتمدة', 'Plan approved'),
      body: L(`اعتمدها ${p.approved_by_user?.name_ar || '—'} في ${fmtDate(p.approved_at)} · رفعها ${p.submitted_by_user?.name_ar || '—'}${p.notes ? ` — ${p.notes}` : ''}`, `Approved by ${p.approved_by_user?.name_en || '—'} on ${fmtDate(p.approved_at)}`) });
  }
  if (p.status === 'submitted') {
    const act1 = plan.can.approve ? btn(L('اعتماد الخطة', 'Approve plan'), { primary: true, ic: 'badgeCheck', onClick: (e) => decide('approve', e.currentTarget) }) : null;
    const ret = plan.can.return ? btn(L('إعادة للتعديل', 'Return'), { ic: 'reply', onClick: (e) => decide('return', e.currentTarget) }) : null;
    return nextCard({ tone: 'emph', icon: 'hourglass', title: L('الخطة مرفوعة للاعتماد', 'Plan submitted for approval'),
      body: plan.can.approve_blocked_sod ? L('فصل المهام: رفعتَ الخطة بنفسك، لذا يعتمدها رئيس تدقيق آخر. يمكنك إعادتها للتعديل.', 'Segregation of duties: you submitted it, so another CAE must approve. You may return it.') : L(`رفعها ${p.submitted_by_user?.name_ar || '—'} في ${fmtDate(p.submitted_at)}`, `Submitted by ${p.submitted_by_user?.name_en || '—'} on ${fmtDate(p.submitted_at)}`),
      action: act1, secondary: [ret] });
  }
  return nextCard({ tone: 'warn', icon: 'pencil', title: L('الخطة مسودة', 'Plan is a draft'),
    body: p.notes ? L(`ملاحظة الإعادة: ${p.notes}`, `Return note: ${p.notes}`) : L('أكمل المهام ثم ارفع الخطة لاعتماد رئيس التدقيق.', 'Complete the engagements, then submit for CAE approval.'),
    action: plan.can.submit ? btn(L('رفع للاعتماد', 'Submit for approval'), { primary: true, ic: 'send', onClick: (e) => decide('submit', e.currentTarget) }) : null });
}

function heatMap(plan, ctx) {
  const num = new Map(plan.universe.map((u, i) => [u.id, i + 1]));
  const cells = [];
  for (let l = 5; l >= 1; l--) {
    cells.push(h('div.hm-axis.hm-y', { 'aria-hidden': 'true' }, fmtNum(l)));
    for (let i = 1; i <= 5; i++) {
      const here = plan.universe.filter((u) => u.likelihood === l && u.impact === i);
      const s = l * i;
      cells.push(h(`div.hm-cell.z-${ZONE(s)}`, { role: 'gridcell', 'aria-label': L(`الاحتمالية ${l}، الأثر ${i}، الدرجة ${s}: ${here.length ? here.map((u) => u.name_ar).join('، ') : 'لا عناصر'}`, `Likelihood ${l}, impact ${i}, score ${s}: ${here.length ? here.map((u) => u.name_en || u.name_ar).join(', ') : 'none'}`) },
        h('span.hm-score.num', fmtNum(s)),
        h('div.hm-dots', here.map((u) => h(`button.hm-dot${u.engagements.length ? '.covered' : ''}`, { type: 'button', 'data-tip': `${L(u.name_ar, u.name_en || u.name_ar)} — ${deptName(u.department)}`, 'aria-label': L(u.name_ar, u.name_en || u.name_ar), onclick: () => universeSheet(u, plan, ctx) }, fmtNum(num.get(u.id)))))));
    }
  }
  cells.push(h('div.hm-corner'), ...[1, 2, 3, 4, 5].map((i) => h('div.hm-axis.hm-x', { 'aria-hidden': 'true' }, fmtNum(i))));
  return h('figure.aud-heat', { 'aria-label': L('خريطة المخاطر: الاحتمالية مقابل الأثر', 'Risk heat map: likelihood versus impact') },
    h('div.hm-wrap', h('div.hm-ylabel', L('الاحتمالية', 'Likelihood'), icon('arrowUpRight')), h('div.hm-grid', { role: 'grid' }, cells)),
    h('figcaption.hm-xlabel', L('الأثر', 'Impact')),
    h('div.hm-legend',
      h('span', h('i.sw.z-low'), L('منخفضة (1–7)', 'Low (1–7)')), h('span', h('i.sw.z-medium'), L('متوسطة (8–14)', 'Medium (8–14)')), h('span', h('i.sw.z-high'), L('عالية (15–25)', 'High (15–25)')),
      h('span', h('i.dot.covered'), L('مشمول بخطة العام', 'In this year’s plan')), h('span', h('i.dot'), L('غير مشمول', 'Not covered'))));
}

function coverageCard(plan, ctx) {
  const s = plan.stats;
  const uncovered = plan.universe.filter((u) => u.rating === 'high' && !u.engagements.length);
  const pct = s.high_risk ? Math.round((s.high_risk_covered / s.high_risk) * 100) : 100;
  return card(L('تغطية المخاطر العالية', 'High-risk coverage'),
    h('div.aud-cover', h('div.aud-cover-num', h('span.t-numeral.num', `${fmtNum(s.high_risk_covered)}/${fmtNum(s.high_risk)}`), h('span.faint', L('عنصر عالي الخطورة مشمول', 'high-risk items covered'))),
      h('div.progress.lg', { role: 'progressbar', 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('نسبة التغطية', 'Coverage') }, h('i', { style: { width: `${pct}%` } }))),
    uncovered.length ? h('div.aud-uncovered', h('div.tiny.faint', L('غير مشمول هذا العام:', 'Not covered this year:')),
      h('ul.list', uncovered.map((u) => h('li.clickable', { tabindex: 0, onclick: () => universeSheet(u, plan, ctx), onkeydown: (e) => { if (e.key === 'Enter') universeSheet(u, plan, ctx); } }, h('span.aud-ukey', fmtNum(plan.universe.indexOf(u) + 1)), h('div.grow', h('div.title', L(u.name_ar, u.name_en || u.name_ar)), h('div.meta', `${deptName(u.department)} · ${L('الدرجة', 'score')} ${u.score}`)), icon('chevron', 'flip-rtl')))))
      : h('p.tiny.faint', L('جميع العناصر عالية الخطورة مشمولة بخطة هذا العام.', 'All high-risk items are covered this year.')),
    h('div.aud-ukeys', h('div.lbl-sm', L('دليل أرقام الخريطة', 'Map key')), h('ol', plan.universe.map((u, i) => h('li', h('button', { type: 'button', onclick: () => universeSheet(u, plan, ctx) }, h(`span.aud-ukey${u.engagements.length ? '.covered' : ''}`, fmtNum(i + 1)), h('span.grow.aud-clamp1', L(u.name_ar, u.name_en || u.name_ar)), h('span.num.faint', fmtNum(u.score))))))),
    h('div.aud-cover-stats', h('div', h('strong.num', fmtNum(s.engagements)), h('span', L('مهمة في الخطة', 'engagements'))), h('div', h('strong.num', fmtNum(s.completed)), h('span', L('تقرير صادر', 'reports issued')))));
}

function quarters(plan) {
  const cq = Math.floor(new Date().getUTCMonth() / 3) + 1;
  const cur = new Date().getUTCFullYear() === plan.year;
  return h('div.aud-quarters', [1, 2, 3, 4].map((q) => {
    const list = plan.engagements.filter((e) => e.quarter === q);
    return h(`section.aud-q${cur && q === cq ? '.now' : ''}`, { 'aria-label': L(`الربع ${q}`, `Q${q}`) },
      h('header', h('span.aud-q-name', L(`الربع ${['الأول', 'الثاني', 'الثالث', 'الرابع'][q - 1]}`, `Quarter ${q}`)), cur && q === cq ? h('span.chip.tiny.info', L('الحالي', 'Now')) : null, h('span.grow'), h('span.count.num', fmtNum(list.length))),
      list.length ? list.map((e) => h('a.aud-qitem', { href: `${HREF}/e/${e.id}` },
        h('div.aud-qitem-title', e.title), h('div.aud-qitem-meta', h('span', deptName(e.department)), phaseChip(e.phase), e.added_after_approval ? h('span.chip.tiny.warn', { 'data-tip': L('أضيفت بعد اعتماد الخطة', 'Added after plan approval') }, icon('plus'), L('بعد الاعتماد', 'Post-approval')) : null)))
        : h('div.board-empty', L('لا مهام', 'None')));
  }));
}

function universeTable(plan, ctx) {
  return dataTable({
    caption: L('مجال التدقيق', 'Audit universe'),
    columns: [
      { key: 'n', label: '#', render: (u) => h('span.num.faint', fmtNum(plan.universe.indexOf(u) + 1)), width: '44px' },
      { key: 'name', label: L('العنصر', 'Item'), render: (u) => h('div', h('div', L(u.name_ar, u.name_en || u.name_ar)), u.rationale ? h('div.tiny.faint.aud-clamp', u.rationale) : null), sort: (u) => u.name_ar },
      { key: 'dept', label: L('الإدارة', 'Department'), render: (u) => deptName(u.department), sort: (u) => u.department?.name_ar },
      { key: 'l', label: L('الاحتمالية', 'Likelihood'), num: true, render: (u) => fmtNum(u.likelihood), sort: (u) => u.likelihood },
      { key: 'i', label: L('الأثر', 'Impact'), num: true, render: (u) => fmtNum(u.impact), sort: (u) => u.impact },
      { key: 'score', label: L('الدرجة', 'Score'), render: (u) => h('span.row', h('strong.num', fmtNum(u.score)), riskChip(u.rating, { prefix: false })), sort: (u) => -u.score },
      { key: 'last', label: L('آخر تدقيق', 'Last audit'), render: (u) => (u.last_audit_year ? h('span.num', String(u.last_audit_year)) : h('span.faint', L('لم يُدقق', 'Never'))), sort: (u) => u.last_audit_year || 0 },
      { key: 'plan', label: L('في خطة العام', 'This year'), render: (u) => (u.engagements.length ? u.engagements.map((e) => h('span.chip.tiny.navy', L(`الربع ${e.quarter}`, `Q${e.quarter}`))) : h('span.faint', '—')), sort: (u) => (u.engagements.length ? u.engagements[0].quarter : 9) },
    ],
    rows: plan.universe, sortKey: 'score', onRow: (u) => universeSheet(u, plan, ctx),
  });
}

export function paint(tab, me, ctx, plan) {
  return h('div.aud-plan',
    statusCard(plan, me),
    grid('main-side', card(h('div.row.grow', h('h2.card-title', L('خريطة المخاطر', 'Risk heat map')), h('span.chip.tiny.outline', L(`${fmtNum(plan.universe.length)} عنصراً`, `${plan.universe.length} items`))), heatMap(plan, ctx)), coverageCard(plan, ctx)),
    h('div.section', L('الخطة الربعية', 'Quarterly plan'), h('span.count', L(`${fmtNum(plan.engagements.length)} مهام`, `${plan.engagements.length} engagements`))),
    quarters(plan),
    h('div.section', L('مجال التدقيق وتقييم المخاطر', 'Audit universe & risk assessment')),
    h('section.card.sys-card', universeTable(plan, ctx)));
}

// ---------------- universe item sheet & forms ----------------
function universeSheet(u, plan, ctx) {
  const sheet = openSheet({
    title: L(u.name_ar, u.name_en || u.name_ar), subtitle: deptName(u.department), badges: [riskChip(u.rating), h('span.chip.tiny.outline', L(`الدرجة ${u.score}`, `Score ${u.score}`))],
    body: h('div.stack',
      h('dl.sys-kv', h('dt', L('الاحتمالية', 'Likelihood')), h('dd', h('span.num', `${u.likelihood} / 5`)), h('dt', L('الأثر', 'Impact')), h('dd', h('span.num', `${u.impact} / 5`)),
        h('dt', L('المبرر', 'Rationale')), h('dd', u.rationale || '—'), h('dt', L('آخر تدقيق', 'Last audit')), h('dd', u.last_audit_year ? String(u.last_audit_year) : L('لم يُدقق من قبل', 'Never audited'))),
      u.engagements.length ? h('div', h('div.tiny.faint', L('مهام هذا العام', 'This year’s engagements')), h('ul.list', u.engagements.map((e) => h('li', h('a.grow', { href: `${HREF}/e/${e.id}` }, e.title), phaseChip(e.phase))))) : h('p.callout', icon('info'), L('غير مشمول بخطة هذا العام.', 'Not covered by this year’s plan.'))),
    actions: plan.can.edit ? [
      { label: L('تحديث تقييم المخاطر', 'Update risk rating'), icon: 'sliders', onClick: () => editRisk(u) },
      !u.engagements.length ? { label: L('إضافة مهمة', 'Add engagement'), icon: 'plus', primary: true, onClick: () => newEngagement(ctx, { universe: u }) } : null,
    ].filter(Boolean) : [],
  });
  return sheet;
}
const scale = (label) => ({ type: 'select', label, required: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} — ${L(['نادر', 'غير مرجح', 'ممكن', 'مرجح', 'شبه مؤكد'][n - 1], ['Rare', 'Unlikely', 'Possible', 'Likely', 'Almost certain'][n - 1])}` })) });
const scaleI = (label) => ({ type: 'select', label, required: true, options: [1, 2, 3, 4, 5].map((n) => ({ value: String(n), label: `${n} — ${L(['طفيف', 'محدود', 'متوسط', 'كبير', 'جسيم'][n - 1], ['Minor', 'Limited', 'Moderate', 'Major', 'Severe'][n - 1])}` })) });
async function editRisk(u) {
  const v = await formDialog({ title: L('تحديث تقييم المخاطر', 'Update risk rating'), intro: L(u.name_ar, u.name_en || u.name_ar), values: { likelihood: String(u.likelihood), impact: String(u.impact), rationale: u.rationale },
    fields: [{ name: 'likelihood', ...scale(L('الاحتمالية', 'Likelihood')) }, { name: 'impact', ...scaleI(L('الأثر', 'Impact')) }, { name: 'rationale', type: 'textarea', label: L('المبرر', 'Rationale'), rows: 3, maxLength: 2000 }] });
  if (!v) return false;
  try { await call(`/universe/${u.id}`, { method: 'PUT', body: { likelihood: Number(v.likelihood), impact: Number(v.impact), rationale: v.rationale } }); toast(L('حُدّث تقييم المخاطر وسُجّل في سجل التدقيق', 'Risk rating updated and audited')); }
  catch (e) { toast(e.message, { kind: 'error' }); return false; }
}
async function addUniverse() {
  const depts = (await departments()).filter((d) => d.id !== 'dept_ia');
  const v = await formDialog({ title: L('عنصر جديد في مجال التدقيق', 'New audit universe item'), fields: [
    { name: 'name_ar', label: L('اسم العملية أو النشاط', 'Process / activity'), required: true, full: true, maxLength: 200 },
    { name: 'department_id', type: 'select', label: L('الإدارة', 'Department'), required: true, options: depts.map((d) => ({ value: d.id, label: L(d.name_ar, d.name_en) })) },
    { name: 'name_en', label: L('الاسم بالإنجليزية', 'English name'), maxLength: 200 },
    { name: 'likelihood', ...scale(L('الاحتمالية', 'Likelihood')) }, { name: 'impact', ...scaleI(L('الأثر', 'Impact')) },
    { name: 'rationale', type: 'textarea', label: L('مبرر التقييم', 'Rationale'), rows: 3, maxLength: 2000 }], submitLabel: L('إضافة', 'Add') });
  if (!v) return;
  try { await call('/universe', { method: 'POST', body: { ...v, likelihood: Number(v.likelihood), impact: Number(v.impact), name_en: v.name_en || undefined } }); toast(L('أُضيف العنصر إلى مجال التدقيق', 'Added to the audit universe')); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}
