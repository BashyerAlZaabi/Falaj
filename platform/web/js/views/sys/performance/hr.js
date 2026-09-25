// «الموارد البشرية» — HR console (performance.hr): cycle control with phase
// dates (create / edit dates / advance with confirmation), completion by
// department, rating distribution (aggregated), calibration table and review
// detail with audited calibration, disagreement queue. Every view of an
// individual review is recorded in the access log.
import { h, icon, L, fmtNum, toast, confirmDialog, formDialog, act, go, statTile, statRow, dataTable, filterBar, confidentialBanner, errorState } from '../../../sys-kit.js';
import * as C from './common.js';
import * as B from './blocks.js';

const ui = { q: '', dept: '', status: '' }; // table filters survive live refreshes

export async function view(ctx, boot, { cycleId, reviewId }) {
  if (reviewId) return reviewView(ctx, cycleId, reviewId);
  const data = await C.call(`/hr${C.q(cycleId)}`);
  if (!data.cycle) return h('div.perf-hr', C.emptyCard('calendarPlus', L('لا توجد دورة أداء بعد', 'No performance cycle yet'), L('أنشئ الدورة السنوية وحدّد مواعيد مراحلها؛ تُنشأ المراجعات تلقائياً لموظفي الجهة الذين لهم مدير مباشر.', 'Create the annual cycle with its phase dates; reviews are created for staff with a line manager.'), [{ label: L('إنشاء دورة', 'Create cycle'), icon: 'plus', primary: true, onClick: () => createCycle(boot) }]));
  const cyc = data.cycle; const s = data.stats; const cycKey = cycleId || 'current';
  const metricLabel = { agreed_pct: L('اعتماد الأهداف', 'Objectives agreed'), self_pct: L('التقييم الذاتي', 'Self-assessment'), assessed_pct: L('تقييم المدير', 'Manager assessment'), ack_pct: L('الإقرار', 'Acknowledgement') }[s.metric];
  return h('div.perf-hr',
    confidentialBanner('يطّلع فريق الموارد البشرية على جميع المراجعات لأغراض الحوكمة والمعايرة، وكل اطلاع على مراجعة فردية يُسجَّل ويظهر لصاحبها. المسودات لا تظهر هنا.', 'HR sees every review for governance and calibration; each view of an individual review is logged and shown to its owner. Drafts are not shown here.'),
    cycleControl(ctx, boot, data),
    statRow([
      statTile({ label: L(`اكتمال ${metricLabel}`, `${metricLabel} completion`), value: C.pctTxt(s.metric_pct), icon: 'gauge', tone: s.metric_pct >= 80 ? 'good' : 'emph', hint: cyc.deadline && !cyc.closed ? C.dueText(cyc.deadline) : null }),
      statTile({ label: L('تقييمات ذاتية', 'Self-assessments'), value: `${fmtNum(s.self)}/${fmtNum(s.total)}`, icon: 'userCheck' }),
      statTile({ label: L('تقييمات المدراء', 'Manager assessments'), value: `${fmtNum(s.assessed)}/${fmtNum(s.total)}`, icon: 'clipboardCheck' }),
      statTile({ label: L('معايرة', 'Calibrated'), value: `${fmtNum(s.calibrated)}/${fmtNum(s.assessed)}`, icon: 'scale', hint: s.adjusted ? L(`${fmtNum(s.adjusted)} تعديل موثّق`, `${s.adjusted} documented adjustments`) : null }),
      statTile({ label: L('اعتراضات مفتوحة', 'Open disagreements'), value: data.disagreements.length, icon: 'messageSquare', tone: data.disagreements.length ? 'warn' : 'good' }),
    ]),
    h('div.sys-grid.two',
      h('section.card', h('div.card-head', h('h2.card-title', L('الإنجاز حسب الإدارة', 'Completion by department'))),
        C.completionBars(data.departments, [{ key: 'self_pct', ar: 'التقييم الذاتي', en: 'Self-assessment' }, { key: 'assessed_pct', ar: 'تقييم المدير', en: 'Manager assessment' }])),
      h('section.card', h('div.card-head', h('h2.card-title', L('توزيع التقديرات', 'Rating distribution')), h('span.chip.tiny.outline', icon('users'), L('بيانات مجمّعة', 'Aggregated'))),
        data.distribution.n ? C.distributionChart(data.distribution, { caption: L('توزيع التقديرات', 'Rating distribution') }) : h('p.muted', L('لم يُرسل أي تقييم مدير بعد في هذه الدورة.', 'No manager assessment submitted yet.')),
        h('p.tiny.faint', L('يُحتسب التقدير المعتمد بعد المعايرة إن وُجد، وإلا تقدير المدير. لا تُعرض المسودات.', 'Uses the calibrated band when present, otherwise the manager’s band. Drafts are excluded.')))),
    data.disagreements.length ? disagreementsCard(ctx, data) : null,
    calibrationTable(ctx, data, cycKey));
}

// ---------------- cycle control ----------------
function cycleControl(ctx, boot, data) {
  const cyc = data.cycle; const adv = data.advance;
  const idx = C.PHASES.indexOf(cyc.phase);
  const steps = cyc.phases.map((p) => { const i = C.PHASES.indexOf(p.phase); return h(`li.${i < idx ? 'done' : i === idx ? 'cur' : 'todo'}`, h('span.pc-dot', i < idx ? icon('check') : icon(C.PHASE[p.phase][2])), h('span.pc-name', C.phaseName(p.phase)), C.dateRange(p.starts_on, p.ends_on)); });
  const actions = [];
  if (adv) actions.push(h('button.btn.primary', { type: 'button', onclick: (e) => advance(cyc, adv, e.currentTarget) }, icon('arrowRight', 'flip-rtl'), L(`الانتقال إلى «${C.phaseName(adv.to)}»`, `Move to “${C.phaseName(adv.to)}”`)));
  if (!cyc.closed) actions.push(h('button.btn', { type: 'button', onclick: () => editDates(cyc) }, icon('calendarDays'), L('تعديل المواعيد', 'Edit dates')));
  if (!cyc.closed && C.PHASES.indexOf(cyc.phase) < C.PHASES.indexOf('calibration')) actions.push(h('button.btn.ghost', { type: 'button', onclick: (e) => sync(cyc, e.currentTarget) }, icon('userPlus'), L('إضافة المراجعات الناقصة', 'Add missing reviews')));
  if (cyc.closed && !boot.cycles.some((c) => c.phase !== 'closed')) actions.push(h('button.btn.primary', { type: 'button', onclick: () => createCycle(boot) }, icon('calendarPlus'), L('إنشاء دورة جديدة', 'Create new cycle')));
  return h('section.card.perf-cycle-card',
    h('div.perf-cc-head',
      h('div.grow', h('span.perf-eyebrow', icon('calendarClock'), L('التحكم في الدورة', 'Cycle control')), h('h2.perf-cc-title', L(cyc.name_ar, cyc.name_en)),
        h('p.muted', cyc.closed ? L('الدورة مغلقة. تبقى السجلات متاحة للاطلاع والاعتراضات المفتوحة.', 'The cycle is closed; records stay available.') : L(`المرحلة الحالية: «${C.phaseName(cyc.phase)}» — ${C.dueText(cyc.deadline)}`, `Current phase: “${C.phaseName(cyc.phase)}” — ${C.dueText(cyc.deadline)}`))),
      h('div.perf-cc-actions', actions)),
    h('ol.perf-pc', { 'aria-label': L('مراحل الدورة ومواعيدها', 'Cycle phases and dates') }, steps, h(`li.${cyc.closed ? 'cur' : 'todo'}`, h('span.pc-dot', icon('lock')), h('span.pc-name', C.phaseName('closed')), h('span.pc-dates', ''))));
}
function advanceMessage(cyc, adv) {
  const lines = [];
  const n = (x, ar, en) => (x ? L(`${fmtNum(x)} ${ar}`, `${x} ${en}`) : null);
  if (adv.to === 'midyear' || adv.to === 'self_assessment') lines.push(n(adv.not_agreed, 'مراجعات لم تُعتمد أهدافها بعد', 'reviews without agreed objectives'));
  if (adv.to === 'manager_assessment') lines.push(n(adv.no_self, 'موظفين لم يرسلوا تقييمهم الذاتي (يمكنهم الإرسال متأخراً خلال هذه المرحلة)', 'people have not submitted a self-assessment'));
  if (adv.to === 'calibration') lines.push(n(adv.not_assessed, 'مراجعات لم يُرسل تقييم المدير لها ولن تدخل المعايرة', 'reviews not assessed will not enter calibration'));
  if (adv.to === 'acknowledgement') lines.push(n(adv.not_calibrated, 'تقييمات لم تُعاير وستُعتمد بتقدير المدير', 'assessments not calibrated will keep the manager’s band'));
  if (adv.to === 'closed') lines.push(n(adv.not_acknowledged, 'موظفين لم يقرّوا بالاطلاع بعد', 'people have not acknowledged'));
  const head = L(`ستنتقل «${cyc.name_ar}» من «${C.phaseName(cyc.phase)}» إلى «${C.phaseName(adv.to)}» وتُرسل تنبيهات لمن عليهم إجراء. لا يمكن التراجع عن الانتقال.`, `“${cyc.name_en}” moves from “${C.phaseName(cyc.phase)}” to “${C.phaseName(adv.to)}” and alerts the people who must act. This cannot be undone.`);
  const extra = lines.filter(Boolean);
  return extra.length ? `${head} ${L('تنبيه:', 'Note:')} ${extra.join(' · ')}.` : head;
}
async function advance(cyc, adv, btn) {
  const ok = await confirmDialog(L(`الانتقال إلى «${C.phaseName(adv.to)}»؟`, `Move to “${C.phaseName(adv.to)}”?`), advanceMessage(cyc, adv), { confirmLabel: L('تأكيد الانتقال', 'Confirm move') });
  if (!ok) return;
  if (await act(btn, () => C.call(`/cycles/${cyc.id}/advance`, { method: 'POST', body: { to: adv.to, confirm: true } }), { success: L(`بدأت مرحلة «${C.phaseName(adv.to)}»`, `“${C.phaseName(adv.to)}” started`) })) B.refresh();
}
async function sync(cyc, btn) {
  const out = await act(btn, () => C.call(`/cycles/${cyc.id}/sync`, { method: 'POST' }));
  if (!out) return;
  toast(out.added ? L(`أُضيفت ${fmtNum(out.added)} مراجعات جديدة`, `${out.added} reviews added`) : L('جميع الموظفين المؤهلين لديهم مراجعات', 'Every eligible employee already has a review'), { kind: out.added ? 'success' : 'info' });
  if (out.added) B.refresh();
}
const SCHED = C.PHASES.slice(0, 6);
function dateFields(values) {
  return SCHED.flatMap((p) => [
    { name: `${p}_s`, label: L(`${C.PHASE[p][0]} — البداية`, `${C.PHASE[p][1]} — start`), type: 'date', required: true },
    { name: `${p}_e`, label: L(`${C.PHASE[p][0]} — النهاية`, `${C.PHASE[p][1]} — end`), type: 'date', required: true },
  ]).map((f) => ({ ...f, value: values[f.name] }));
}
function phasesFrom(v) {
  const out = {};
  for (const p of SCHED) {
    if (v[`${p}_e`] < v[`${p}_s`]) throw new Error(L(`نهاية «${C.PHASE[p][0]}» تسبق بدايتها`, `${C.PHASE[p][1]} ends before it starts`));
    out[p] = { starts_on: v[`${p}_s`], ends_on: v[`${p}_e`] };
  }
  return out;
}
async function editDates(cyc) {
  const values = Object.fromEntries(cyc.phases.flatMap((p) => [[`${p.phase}_s`, p.starts_on], [`${p.phase}_e`, p.ends_on]]));
  const v = await formDialog({ title: L('مواعيد مراحل الدورة', 'Cycle phase dates'), intro: L('تبدأ كل مرحلة بعد انتهاء سابقتها. يُعلَم المشاركون بالمواعيد الجديدة ويُسجَّل التغيير.', 'Each phase starts after the previous ends. Participants see the new dates; the change is audited.'), fields: dateFields(values), values, wide: true });
  if (!v) return;
  try { await C.call(`/cycles/${cyc.id}/phases`, { method: 'PUT', body: { phases: phasesFrom(v) } }); toast(L('حُدّثت المواعيد', 'Dates updated')); B.refresh(); } catch (e) { toast(e.message, { kind: 'error' }); }
}
async function createCycle(boot) {
  const year = Math.max(new Date().getUTCFullYear(), ...boot.cycles.map((c) => c.year + 1));
  const d = (m, day) => `${year}-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const values = { year, name_ar: `دورة تقييم الأداء ${year}`, share: 70, goal_setting_s: d(1, 11), goal_setting_e: d(2, 12), midyear_s: d(6, 14), midyear_e: d(7, 9), self_assessment_s: d(10, 25), self_assessment_e: d(11, 12), manager_assessment_s: d(11, 13), manager_assessment_e: d(11, 30), calibration_s: d(12, 1), calibration_e: d(12, 14), acknowledgement_s: d(12, 15), acknowledgement_e: d(12, 28) };
  const v = await formDialog({
    title: L('إنشاء دورة أداء', 'Create performance cycle'), wide: true,
    intro: L('تُنشأ مراجعة لكل موظف له مدير مباشر، وتبدأ الدورة بمرحلة «تحديد الأهداف».', 'A review is created for every employee with a line manager; the cycle starts with goal setting.'),
    fields: [
      { name: 'year', label: L('السنة', 'Year'), type: 'number', min: 2020, max: 2100, required: true },
      { name: 'share', label: L('وزن الأهداف من الدرجة %', 'Objectives share %'), type: 'number', min: 50, max: 90, required: true, help: L('الباقي للجدارات', 'The rest is competencies') },
      { name: 'name_ar', label: L('اسم الدورة', 'Cycle name'), required: true, full: true, maxLength: 120 },
      ...dateFields(values),
    ], values, submitLabel: L('متابعة', 'Continue'),
  });
  if (!v) return;
  let phases; try { phases = phasesFrom(v); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  const ok = await confirmDialog(L('إنشاء الدورة؟', 'Create the cycle?'), L(`ستُنشأ «${v.name_ar}» وتُفتح مراجعات الموظفين وتصلهم تنبيهات لتحديد أهدافهم.`, `“${v.name_ar}” will be created and staff alerted to set objectives.`), { confirmLabel: L('إنشاء', 'Create') });
  if (!ok) return;
  try {
    const out = await C.call('/cycles', { method: 'POST', body: { year: v.year, name_ar: v.name_ar, objectives_share: v.share, phases, confirm: true } });
    toast(L(`أُنشئت الدورة و${fmtNum(out.reviews)} مراجعة`, `Cycle created with ${out.reviews} reviews`)); B.refresh();
  } catch (e) { toast(e.message, { kind: 'error' }); }
}

// ---------------- disagreements ----------------
function disagreementsCard(ctx, data) {
  return h('section.card.perf-dis-card',
    h('div.card-head', h('h2.card-title', L('ملاحظات اعتراض بانتظار الرد', 'Disagreements awaiting a response')), h('span.chip.tiny.warn', fmtNum(data.disagreements.length))),
    h('ul.perf-next-list', data.disagreements.map((x) => h('li',
      h('div.grow', h('b', L(x.employee.name_ar, x.employee.name_en)), h('div.tiny.faint', `${L(x.cycle_ar, x.cycle_en)} · ${C.shortDate(x.at)}`)),
      x.own ? h('span.chip.tiny.outline', L('تخصّك — يرد زميل آخر', 'Yours — a colleague responds')) : h('a.btn.sm.primary', { href: `#/sys/performance/hr/${x.cycle_id}/${x.id}` }, L('مراجعة والرد', 'Review & respond'), icon('chevron', 'flip-rtl'))))));
}

// ---------------- calibration table ----------------
const STATUS_OPTS = [['', 'كل الحالات', 'All statuses'], ['planning', 'صياغة الأهداف', 'Setting objectives'], ['active', 'الأهداف معتمدة', 'Objectives agreed'], ['self_submitted', 'تقييم ذاتي مستلم', 'Self-assessment in'], ['assessed', 'قيّمه المدير', 'Assessed'], ['acknowledged', 'تم الإقرار', 'Acknowledged']];
function calibrationTable(ctx, data, cycKey) {
  const depts = [...new Map(data.reviews.map((r) => [r.department?.id, r.department])).values()].filter(Boolean);
  const holder = h('div');
  const draw = () => {
    const q = ui.q.trim().toLowerCase();
    const rows = data.reviews.filter((r) => (!ui.dept || r.department?.id === ui.dept) && (!ui.status || r.status === ui.status)
      && (!q || `${r.employee.name_ar} ${r.employee.name_en}`.toLowerCase().includes(q)));
    holder.replaceChildren(dataTable({
      caption: L('جدول المعايرة', 'Calibration table'), rows, sortKey: 'employee',
      onRow: (r) => go(ctx, 'hr', cycKey, r.id),
      columns: [
        { key: 'employee', label: L('الموظف', 'Employee'), sort: (r) => r.employee.name_ar, render: (r) => h('div.perf-cell-person', h('b', L(r.employee.name_ar, r.employee.name_en)), h('span.tiny.faint', L(r.department?.name_ar || '', r.department?.name_en || ''))) },
        { key: 'manager', label: L('المقيِّم', 'Assessor'), sort: (r) => r.manager?.name_ar || '', render: (r) => (r.manager ? L(r.manager.name_ar, r.manager.name_en) : '—') },
        { key: 'status', label: L('الحالة', 'Status'), sort: (r) => C.reviewStepIndex(r), render: (r) => C.statusOf(r.status) },
        { key: 'score', label: L('الدرجة', 'Score'), num: true, sort: (r) => r.score ?? -1, render: (r) => h('span.num', C.score2(r.score)) },
        { key: 'band', label: L('تقدير المدير', 'Manager band'), sort: (r) => (r.band ? C.BANDS.findIndex((b) => b.key === r.band) : 9), render: (r) => (r.band ? C.bandChip(r.band) : h('span.faint', '—')) },
        { key: 'final', label: L('المعتمد', 'Final'), sort: (r) => (r.final_band ? C.BANDS.findIndex((b) => b.key === r.final_band) : 9), render: (r) => (r.calibrated ? h('span.perf-final', C.bandChip(r.final_band, { final: true }), r.final_band !== r.band ? h('span.chip.tiny.warn', { 'data-tip': L('عُدّل في المعايرة بمبرر موثّق', 'Adjusted with a documented justification') }, icon('scale'), L('معدّل', 'Adjusted')) : null) : h('span.faint', '—')) },
        { key: 'act', label: '', render: (r) => rowAction(r) },
      ],
      empty: h('p.muted.perf-pad', L('لا توجد مراجعات مطابقة.', 'No matching reviews.')),
    }));
  };
  draw();
  const phaseNote = data.cycle.phase === 'calibration' ? L('اعتمد التقدير كما هو أو افتح المراجعة لتعديله بمبرر موثّق. لا تعاير مراجعتك أو تقييماً أرسلته بنفسك.', 'Confirm as is or open the review to adjust with a documented reason. You cannot calibrate your own review or one you assessed.')
    : L(`المعايرة متاحة في مرحلة «المعايرة»${data.cycle.phases.find((p) => p.phase === 'calibration') ? ` (${C.shortDate(data.cycle.phases.find((p) => p.phase === 'calibration').starts_on)})` : ''}.`, 'Calibration opens in the calibration phase.');
  return h('section.card.perf-table-card',
    h('div.card-head', h('h2.card-title', L('المراجعات والمعايرة', 'Reviews & calibration')), h('span.chip.tiny.outline', fmtNum(data.reviews.length))),
    h('p.tiny.faint', phaseNote),
    filterBar({
      search: { placeholder: L('ابحث باسم الموظف…', 'Search by name…'), value: ui.q, onInput: (v) => { ui.q = v; draw(); } },
      selects: [
        { label: L('الإدارة', 'Department'), value: ui.dept, options: [{ value: '', label: L('كل الإدارات', 'All departments') }, ...depts.map((d) => ({ value: d.id, label: L(d.name_ar, d.name_en) }))], onChange: (v) => { ui.dept = v; draw(); } },
        { label: L('الحالة', 'Status'), value: ui.status, options: STATUS_OPTS.map(([v, ar, en]) => ({ value: v, label: L(ar, en) })), onChange: (v) => { ui.status = v; draw(); } },
      ],
    }),
    holder);
}
function rowAction(r) {
  if (r.can.calibrate) return h('button.btn.sm.tertiary', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
    e.stopPropagation();
    const ok = await confirmDialog(L('اعتماد التقدير دون تعديل؟', 'Confirm without change?'), L(`يُعتمد تقدير المدير «${C.bandName(r.band)}» لـ${r.employee.name_ar} كما هو.`, `The manager’s band “${C.bandName(r.band)}” is confirmed for ${r.employee.name_en}.`), { confirmLabel: L('اعتماد', 'Confirm') });
    if (!ok) return;
    if (await act(btn, () => C.call(`/reviews/${r.id}/calibrate`, { method: 'POST', body: { band: r.band } }), { success: L('اعتُمد التقدير', 'Band confirmed') })) B.refresh();
  } }, icon('check'), L('اعتماد', 'Confirm'));
  if (r.relation === 'employee') return h('span.chip.tiny.outline', L('مراجعتك', 'Yours'));
  if (r.sod?.assessor) return h('span.chip.tiny.outline', { 'data-tip': L('أرسلت هذا التقييم كمدير — يعايره زميل آخر', 'You assessed this — a colleague calibrates it') }, L('قيّمتَه', 'You assessed'));
  return null;
}

// ---------------- review detail (HR) ----------------
async function reviewView(ctx, cycleId, reviewId) {
  const cycKey = cycleId || 'current';
  let r;
  try { r = await C.call(`/reviews/${encodeURIComponent(reviewId)}`); } catch (e) {
    return h('div.perf-hr', h('a.btn.sm.ghost.perf-back.always', { href: `#/sys/performance/hr/${cycKey}` }, icon('chevron', 'flip-rtl perf-back-ic'), L('لوحة الموارد البشرية', 'HR console')),
      h('section.card', errorState({ message: e.status === 404 ? L('المراجعة غير موجودة.', 'Review not found.') : e.message })));
  }
  const main = [];
  main.push(h('section.card.perf-dhead',
    h('a.btn.sm.ghost.perf-back.always', { href: `#/sys/performance/hr/${cycKey}` }, icon('chevron', 'flip-rtl perf-back-ic'), L('لوحة الموارد البشرية', 'HR console')),
    h('div.perf-dhead-row', C.personLine(r.employee), h('div.perf-dhead-chips', C.statusOf(r.status), C.demoChip(r.is_demo))),
    h('div.perf-dmeta', h('span', icon('userCheck'), L('المقيِّم: ', 'Assessor: '), r.manager ? L(r.manager.name_ar, r.manager.name_en) : '—'), h('span', icon('calendarClock'), `${L(r.cycle.name_ar, r.cycle.name_en)} · ${C.phaseName(r.cycle.phase)}`)),
    C.reviewStepper(r)));
  if (r.relation === 'employee') main.push(h('div.callout', icon('info'), L('هذه مراجعتك؛ تُعرض لك كما تُعرض لأي موظف، ولا يمكنك معايرتها.', 'This is your own review; you see it as an employee and cannot calibrate it.')));
  if (r.mgr_submitted_at) {
    main.push(B.feedbackCard(r, { title: L('تقييم المدير', 'Manager assessment') }));
    main.push(calibrationPanel(r));
  } else {
    main.push(h('section.card', h('div.card-head', h('h2.card-title', L('الأهداف', 'Objectives'))), B.objectivesList(r),
      h('div.callout.perf-private', icon('lock'), h('span', L('لم يُرسل تقييم المدير بعد. المسودات لا تظهر للموارد البشرية.', 'The manager has not submitted yet. Drafts are not visible to HR.')))));
  }
  if (r.disagreement) main.push(h('section.card', h('h2.card-title', L('ملاحظة الموظف على النتيجة', 'Employee’s note on the result')), B.disagreementBlock(r), r.can.resolve ? respondForm(r) : r.disagreement_status === 'open' ? h('p.tiny.faint', L('يرد على هذه الملاحظة زميل في الموارد البشرية لم يشارك في التقييم.', 'A colleague not involved in the assessment responds.')) : null));
  return h('div.perf-detail.perf-hrd', h('div.perf-detail-main', main), h('div.perf-detail-side', B.accessCard(r, { title: L('سجل الوصول', 'Access log'), hr: true }), B.timelineCard(r)));
}
function calibrationPanel(r) {
  const hist = r.calibrations || [];
  const body = [];
  if (r.can.calibrate) {
    let chosen = r.final_band || r.band;
    const just = h('textarea.field', { id: `perf-just-${r.id}`, rows: 3, maxlength: 2000, placeholder: L('مبرر موثّق يستند إلى أدلة (إلزامي عند تغيير التقدير)', 'A documented, evidence-based justification (required when changing the band)') });
    const req = h('span.req', { 'aria-hidden': 'true' }, ' *');
    const opts = h('div.perf-bands', { role: 'radiogroup', 'aria-label': L('التقدير المعتمد', 'Final band') }, C.BANDS.map((b) => h(`label.perf-band-opt${b.key === chosen ? '.on' : ''}`,
      h('input', { type: 'radio', name: `band-${r.id}`, value: b.key, checked: b.key === chosen || null, onchange: () => { chosen = b.key; opts.querySelectorAll('.perf-band-opt').forEach((x) => x.classList.toggle('on', x.querySelector('input').value === chosen)); req.hidden = chosen === r.band; } }),
      h('span.perf-band-name', L(b.ar, b.en)), b.key === r.band ? h('span.tiny.faint', L('تقدير المدير', 'Manager’s band')) : null)));
    req.hidden = chosen === r.band;
    body.push(opts, h('label.lbl', { for: `perf-just-${r.id}` }, L('المبرر', 'Justification'), req), just,
      h('div.perf-cal-actions', h('button.btn.primary', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
        const j = just.value.trim();
        if (chosen !== r.band && j.length < 15) { toast(L('تعديل التقدير يتطلب مبرراً موثقاً (15 حرفاً على الأقل)', 'A change needs a documented justification (15+ characters)'), { kind: 'error' }); just.focus(); return; }
        const ok = await confirmDialog(L('اعتماد المعايرة؟', 'Confirm calibration?'), chosen === r.band ? L(`يُعتمد «${C.bandName(chosen)}» كما قيّمه المدير.`, `“${C.bandName(chosen)}” is confirmed as assessed.`) : L(`يُعدّل التقدير من «${C.bandName(r.band)}» إلى «${C.bandName(chosen)}». يُسجَّل التعديل ومبرره في سجل التدقيق ويظهر للموظف ومديره عند إعلان النتائج.`, `The band changes from “${C.bandName(r.band)}” to “${C.bandName(chosen)}”. The change and its reason are audited and shown to the employee and manager when results are released.`), { confirmLabel: L('اعتماد', 'Confirm') });
        if (!ok) return;
        if (await act(btn, () => C.call(`/reviews/${r.id}/calibrate`, { method: 'POST', body: { band: chosen, ...(j ? { justification: j } : {}) } }), { success: L('اعتُمدت المعايرة', 'Calibration recorded') })) B.refresh();
      } }, icon('scale'), L('اعتماد المعايرة', 'Record calibration'))));
  } else {
    const why = r.relation === 'employee' ? L('لا يمكنك معايرة مراجعتك.', 'You cannot calibrate your own review.')
      : r.sod?.assessor ? L('أرسلت هذا التقييم بصفتك مديراً؛ يعايره زميل آخر في الموارد البشرية (فصل المهام).', 'You submitted this assessment as manager; a colleague calibrates it (segregation of duties).')
        : C.PHASES.indexOf(r.cycle.phase) > C.PHASES.indexOf('calibration') ? L('انتهت مرحلة المعايرة في هذه الدورة؛ السجل أدناه للاطلاع.', 'The calibration phase of this cycle has ended; the history below is read-only.')
          : r.cycle.phase !== 'calibration' ? L('تبدأ المعايرة في مرحلة «المعايرة» بعد اكتمال تقييمات المدراء.', 'Calibration opens in the calibration phase, after manager assessments.') : L('لا تتوفر معايرة لهذه المراجعة.', 'Calibration is not available for this review.');
    body.push(h('div.callout', icon('info'), h('span', why)));
  }
  return h('section.card.perf-cal',
    h('div.card-head', h('h2.card-title', L('المعايرة', 'Calibration')), r.calibrated ? h('span.chip.tiny.good', icon('badgeCheck'), L('معايَرة', 'Calibrated')) : null),
    ...body,
    hist.length ? h('div.perf-cal-hist', h('span.lbl-mini', L('سجل المعايرة', 'Calibration history')), h('ul', hist.map((k) => h('li', icon('scale'),
      h('div.grow', h('div', k.from_band === k.to_band ? L(`اعتُمد «${C.bandName(k.to_band)}» دون تعديل`, `Confirmed “${C.bandName(k.to_band)}”`) : L(`من «${C.bandName(k.from_band)}» إلى «${C.bandName(k.to_band)}»`, `From “${C.bandName(k.from_band)}” to “${C.bandName(k.to_band)}”`)), k.justification ? h('p.tiny', k.justification) : null),
      h('span.tiny.faint', `${L(k.name_ar, k.name_en)} · ${C.shortDate(k.at)}`))))) : null);
}
function respondForm(r) {
  const ta = h('textarea.field', { id: `perf-resp-${r.id}`, rows: 4, maxlength: 3000, placeholder: L('رد واضح ومحترم يوضح ما رُوجع وما تقرر.', 'A clear, respectful response explaining what was reviewed and decided.') });
  return h('div.perf-respond', h('label.lbl', { for: `perf-resp-${r.id}` }, L('رد الموارد البشرية', 'HR response')), ta,
    h('div.perf-cal-actions', h('button.btn.primary', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
      if (ta.value.trim().length < 10) { toast(L('اكتب رداً واضحاً (10 أحرف على الأقل)', 'Write at least 10 characters'), { kind: 'error' }); ta.focus(); return; }
      const ok = await confirmDialog(L('إرسال الرد؟', 'Send response?'), L('يُرسل الرد إلى الموظف ويُغلق الاعتراض ويُسجَّل في سجل التدقيق.', 'The response goes to the employee, closes the disagreement and is audited.'), { confirmLabel: L('إرسال', 'Send') });
      if (!ok) return;
      if (await act(btn, () => C.call(`/reviews/${r.id}/resolve`, { method: 'POST', body: { response: ta.value.trim() } }), { success: L('أُرسل الرد إلى الموظف', 'Response sent') })) B.refresh();
    } }, icon('reply'), L('إرسال الرد', 'Send response'))));
}
