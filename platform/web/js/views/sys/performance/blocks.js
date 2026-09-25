// Performance Management — review building blocks shared by the employee,
// manager and HR views: objectives (read-only + planning editor), released
// manager feedback, mid-year notes, calibration and disagreement blocks,
// timeline and "who viewed my review" access log.
import { h, icon, L, fmtNum, toast, confirmDialog, formDialog, act, timeline, progress, state } from '../../../sys-kit.js';
import { emit } from '../../../state.js';
import * as C from './common.js';

export const refresh = () => emit('data-changed', { entity: 'sys:performance' });
const post = (path, body, method = 'POST') => C.call(path, { method, body });

// ---------------- objectives (read-only) ----------------
export function objectivesList(r, { showSelf = r.self_visible, showMgr = r.assessment_visible } = {}) {
  if (!r.objectives?.length) return h('p.faint', L('لا توجد أهداف بعد.', 'No objectives yet.'));
  return h('ol.perf-objs', r.objectives.map((o, i) => h('li.perf-obj',
    h('span.perf-obj-n', String(i + 1)),
    h('div.grow',
      h('div.perf-obj-head', h('span.perf-obj-title', o.title), C.weightChip(o.weight), o.source === 'goals' ? h('span.chip.tiny.info', { 'data-tip': L('مستورد من أهدافي السنوية', 'Imported from my yearly goals') }, icon('goal'), L('من أهدافي', 'From goals')) : null),
      o.measure ? h('div.perf-obj-measure', icon('ruler'), o.measure) : null,
      showSelf && o.self_pct != null ? h('div.perf-obj-self', h('span.lbl-mini', L('الإنجاز الذاتي', 'Self-rated achievement')), progress(o.self_pct, { label: L('نسبة الإنجاز', 'Achievement') }), h('span.num.tabular', C.pctTxt(o.self_pct))) : null,
      showSelf && o.self_note ? h('p.perf-obj-note', o.self_note) : null,
      showMgr && o.mgr_rating != null ? h('div.perf-obj-mgr', h('span.lbl-mini', L('تقدير المدير', 'Manager rating')), C.stars(o.mgr_rating), h('span.tiny.faint', L(C.SCALE[o.mgr_rating - 1][0], C.SCALE[o.mgr_rating - 1][1]))) : null,
      showMgr && o.mgr_note ? h('p.perf-obj-note.mgr', o.mgr_note) : null))));
}

// ---------------- objectives planning editor ----------------
export function weightMeter(r) {
  const ok = r.objectives_ready;
  const countOk = r.objectives_count >= 3 && r.objectives_count <= 7;
  return h(`div.perf-meter${ok ? '.ok' : ''}`, { role: 'status' },
    h('div.perf-meter-row', h('span', L('مجموع الأوزان', 'Weights total')), h('strong.num', `${fmtNum(r.weight_total)} / 100`)),
    progress(Math.min(100, r.weight_total), { tone: r.weight_total === 100 ? 'good' : r.weight_total > 100 ? 'crit' : 'warn', label: L('مجموع الأوزان', 'Weights total') }),
    h('ul.perf-checks',
      h(`li${countOk ? '.ok' : ''}`, icon(countOk ? 'circleCheck' : 'circleDashed'), L(`من 3 إلى 7 أهداف (${fmtNum(r.objectives_count)})`, `3 to 7 objectives (${r.objectives_count})`)),
      h(`li${r.weight_total === 100 ? '.ok' : ''}`, icon(r.weight_total === 100 ? 'circleCheck' : 'circleDashed'), L('مجموع الأوزان 100%', 'Weights add up to 100%'))));
}
async function saveList(r, list) {
  return post(`/reviews/${r.id}/objectives`, { objectives: list.map((o) => ({ ...(o.id ? { id: o.id } : {}), title: o.title, measure: o.measure || '', weight: Number(o.weight) || 0 })) }, 'PUT');
}
export async function objectiveDialog(r, o = null) {
  const v = await formDialog({
    title: o ? L('تعديل الهدف', 'Edit objective') : L('هدف جديد', 'New objective'),
    intro: L('صِغ الهدف بصيغة نتيجة قابلة للقياس، وحدّد المؤشر أو المستهدف ووزنه النسبي.', 'Phrase it as a measurable outcome with a target and a relative weight.'),
    fields: [
      { name: 'title', label: L('الهدف', 'Objective'), required: true, maxLength: 300, full: true, placeholder: L('مثال: خفض زمن إنجاز المعاملات', 'e.g. Reduce transaction processing time') },
      { name: 'measure', label: L('المؤشر / المستهدف', 'Measure / target'), type: 'textarea', rows: 2, maxLength: 600, placeholder: L('مثال: خفض 20% بنهاية الربع الرابع', 'e.g. 20% lower by end of Q4') },
      { name: 'weight', label: L('الوزن %', 'Weight %'), type: 'number', min: 1, max: 100, required: true, help: L('مجموع أوزان جميع الأهداف 100', 'All weights must add up to 100') },
    ],
    values: o ? { title: o.title, measure: o.measure, weight: o.weight } : { weight: 100 - (r.weight_total || 0) > 0 ? 100 - (r.weight_total || 0) : 10 },
    submitLabel: o ? L('حفظ', 'Save') : L('إضافة', 'Add'),
  });
  if (!v) return null;
  const list = (r.objectives || []).map((x) => ({ ...x }));
  if (o) Object.assign(list.find((x) => x.id === o.id), v); else list.push(v);
  try { await saveList(r, list); toast(o ? L('حُفظ الهدف', 'Objective saved') : L('أُضيف الهدف', 'Objective added')); refresh(); return true; } catch (e) { toast(e.message, { kind: 'error' }); return null; }
}
export function objectivesEditor(r, { role = 'employee' } = {}) {
  const canAdd = r.can.edit_objectives && r.objectives.length < 7;
  const rows = r.objectives.map((o, i) => h('li.perf-edit-row',
    h('span.perf-obj-n', String(i + 1)),
    h('div.grow', h('div.perf-obj-title', o.title), o.measure ? h('div.perf-obj-measure', icon('ruler'), o.measure) : null),
    C.weightChip(o.weight),
    o.source === 'goals' ? h('span.chip.tiny.info', icon('goal'), L('من أهدافي', 'From goals')) : null,
    r.can.edit_objectives ? h('div.perf-row-actions',
      h('button.icon-btn', { type: 'button', 'aria-label': L(`تعديل الهدف ${i + 1}`, `Edit objective ${i + 1}`), 'data-tip': L('تعديل', 'Edit'), onclick: () => objectiveDialog(r, o) }, icon('pencil')),
      h('button.icon-btn', { type: 'button', 'aria-label': L(`حذف الهدف ${i + 1}`, `Delete objective ${i + 1}`), 'data-tip': L('حذف', 'Delete'), onclick: async (e) => {
        const btn = e.currentTarget;
        const ok = await confirmDialog(L('حذف الهدف؟', 'Delete objective?'), L(`سيُحذف «${o.title}» من أهدافك لهذه الدورة. يمكنك إضافته لاحقاً.`, `“${o.title}” will be removed from this cycle’s objectives.`), { danger: true, confirmLabel: L('حذف', 'Delete') });
        if (!ok) return;
        await act(btn, () => saveList(r, r.objectives.filter((x) => x.id !== o.id)), { success: L('حُذف الهدف', 'Objective deleted') });
        refresh();
      } }, icon('trash'))) : null));
  const tools = r.can.edit_objectives ? h('div.perf-edit-tools',
    h('button.btn.sm', { type: 'button', disabled: !canAdd || null, onclick: () => objectiveDialog(r) }, icon('plus'), L('إضافة هدف', 'Add objective')),
    h('button.btn.sm.tertiary', { type: 'button', disabled: r.objectives.length >= 7 || null, onclick: (e) => importGoals(r, e.currentTarget) }, icon('goal'), L('استيراد من أهدافي السنوية', 'Import yearly goals')),
    r.objectives.length ? h('button.btn.sm.ghost', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
      const n = r.objectives.length; const base = Math.floor(100 / n); let rest = 100 - base * n;
      await act(btn, () => saveList(r, r.objectives.map((o) => ({ ...o, weight: base + (rest-- > 0 ? 1 : 0) }))), { success: L('وُزّعت الأوزان بالتساوي', 'Weights split evenly') });
      refresh();
    } }, icon('scale'), L('توزيع الأوزان بالتساوي', 'Split weights evenly')) : null) : null;
  const agree = role === 'manager' && r.can.agree ? h('button.btn.primary', { type: 'button', disabled: !r.objectives_ready || null, onclick: async (e) => {
        const btn = e.currentTarget;
    const ok = await confirmDialog(L('اعتماد الأهداف؟', 'Agree objectives?'), L(`ستُعتمد ${fmtNum(r.objectives_count)} أهداف لـ${r.employee?.name_ar}، وتصبح أساس التقييم في هذه الدورة.`, `${r.objectives_count} objectives will be agreed as the basis of this cycle’s assessment.`), { confirmLabel: L('اعتماد', 'Agree') });
    if (!ok) return;
    await act(btn, () => post(`/reviews/${r.id}/agree`), { success: L('اعتُمدت الأهداف', 'Objectives agreed') });
    refresh();
  } }, icon('badgeCheck'), L('اعتماد الأهداف', 'Agree objectives')) : null;
  return h('div.perf-editor',
    rows.length ? h('ol.perf-edit-list', rows) : h('div.perf-edit-empty', icon('target'), h('div', h('strong', L('لم تُضف أهداف بعد', 'No objectives yet')), h('p.faint.tiny', L('أضف من 3 إلى 7 أهداف، أو استوردها من أهدافك السنوية في نظام «أهدافي».', 'Add 3–7 objectives, or import them from your yearly goals.')))),
    h('div.perf-editor-foot', weightMeter(r), h('div.perf-editor-actions', tools,
      role === 'employee' && r.can.edit_objectives ? h('p.tiny.faint.perf-note', icon('info'), L('عند اكتمال الأهداف يراجعها مديرك ويعتمدها — لا يعتمد الموظف أهدافه بنفسه.', 'When complete, your manager reviews and agrees them — nobody agrees their own objectives.')) : null,
      agree)));
}
async function importGoals(r, btn) {
  const out = await act(btn, () => post(`/reviews/${r.id}/import-goals`));
  if (!out) return;
  if (!out.available) toast(L('نظام «أهدافي» غير متاح حالياً للاستيراد — أضف الأهداف يدوياً.', 'The goals system is not available — add objectives manually.'), { kind: 'info' });
  else if (!out.imported) toast(L(out.found ? 'أهدافك السنوية مستوردة مسبقاً' : 'لا توجد أهداف سنوية قابلة للاستيراد لهذه السنة', out.found ? 'Already imported' : 'No yearly goals to import for this year'), { kind: 'info' });
  else toast(L(`استُورد ${fmtNum(out.imported)} من أهدافك — وُزّعت الأوزان بالتساوي، عدّلها حسب الأولوية`, `${out.imported} goals imported — weights split evenly; adjust by priority`));
  refresh();
}

// ---------------- released manager feedback ----------------
export function scoreSummary(r) {
  const b = r.calibration_visible && r.final_band ? r.final_band : r.band;
  return h('div.perf-score',
    h('div.perf-score-main', h('span.perf-score-big.num', C.score2(r.score)), h('span.perf-score-of', L('من 5', 'of 5'))),
    h('div.perf-score-meta',
      C.bandChip(b, { tiny: false, final: r.calibration_visible && !!r.final_band }),
      h('div.perf-score-parts',
        h('span', L('الأهداف', 'Objectives'), ' ', h('b.num', C.score2(r.obj_score))),
        h('span', L('الجدارات', 'Competencies'), ' ', h('b.num', C.score2(r.comp_score))),
        h('span.faint', L(`الوزن ${r.cycle?.objectives_share ?? 70}% / ${100 - (r.cycle?.objectives_share ?? 70)}%`, `Weights ${r.cycle?.objectives_share ?? 70}/${100 - (r.cycle?.objectives_share ?? 70)}`)))));
}
export function competencyRatings(r) {
  const map = new Map((r.comp_ratings || []).map((x) => [x.competency_id, x]));
  return h('ul.perf-comp-read', r.competencies.map((c) => { const x = map.get(c.id); return h('li', h('span.perf-comp-ic', icon(c.icon || 'star')), h('span.grow', L(c.name_ar, c.name_en)), C.stars(x?.rating ?? null), h('span.perf-rate-lab', x?.rating ? L(C.SCALE[x.rating - 1][0], C.SCALE[x.rating - 1][1]) : L('لم يُقيّم', 'Not rated')), x?.note ? h('p.perf-obj-note.full', x.note) : null); }));
}
export function feedbackCard(r, { title, withObjectives = true } = {}) {
  const provisional = !r.released && !(r.relation === 'hr');
  return h(`section.card.perf-feedback${withObjectives ? '' : '.solo'}`, { id: 'perf-feedback' },
    h('div.card-head', h('h2.card-title', title || L('تقييم المدير', 'Manager assessment')),
      provisional ? h('span.chip.tiny.warn', icon('hourglass'), L('نتيجة أولية — تُعتمد بعد المعايرة', 'Provisional — final after calibration')) : r.calibration_visible && r.final_band ? h('span.chip.tiny.good', icon('badgeCheck'), L('نتيجة معتمدة', 'Final result')) : null,
      r.no_self ? h('span.chip.tiny.outline', L('دون تقييم ذاتي', 'No self-assessment')) : null),
    scoreSummary(r),
    r.calibration_visible && r.final_band && r.final_band !== r.band ? h('div.callout.perf-cal-note', icon('scale'), h('div', h('strong', L(`عُدّل التقدير في المعايرة: من «${C.bandName(r.band)}» إلى «${C.bandName(r.final_band)}»`, `Adjusted in calibration: from “${C.bandName(r.band)}” to “${C.bandName(r.final_band)}”`)), r.calibration_note ? h('p', r.calibration_note) : null)) : null,
    r.mgr_comment ? h('blockquote.perf-quote', h('p', r.mgr_comment), r.assessed_by ? h('footer', '— ', L(r.assessed_by.name_ar, r.assessed_by.name_en)) : null) : null,
    h('div.perf-two',
      withObjectives ? h('div', C.section(L('الأهداف', 'Objectives')), objectivesList(r, { showSelf: false, showMgr: true })) : null,
      h('div', C.section(L('الجدارات', 'Competencies')), competencyRatings(r))));
}

// ---------------- mid-year check-in ----------------
export function midyearCard(r) {
  const m = r.midyear || {};
  const note = (who, text, at, mine) => h('div.perf-mid-note', h('div.perf-mid-who', icon(mine ? 'user' : 'userCheck'), h('span', who), at ? h('span.faint.tiny', C.shortDate(at)) : null), text ? h('p', text) : h('p.faint', L('لم تُسجّل ملاحظة', 'No note yet')));
  const canEdit = r.can.midyear;
  const mine = r.relation === 'employee';
  return h('section.card.perf-mid',
    h('div.card-head', h('h2.card-title', L('المراجعة المرحلية', 'Mid-year check-in')), canEdit ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => editMidyear(r) }, icon('pencil'), mine ? L('ملاحظاتي', 'My notes') : L('ملاحظات المدير', 'Manager notes')) : null),
    note(L('الموظف', 'Employee'), m.employee_note, m.employee_at, mine),
    note(L('المدير', 'Manager'), m.manager_note, m.manager_at, !mine));
}
export async function editMidyear(r) {
  const mine = r.relation === 'employee';
  const v = await formDialog({ title: L('ملاحظات المراجعة المرحلية', 'Mid-year notes'), intro: mine ? L('ما الذي أنجزته حتى الآن؟ وما الذي تحتاجه من دعم في النصف الثاني؟', 'What have you delivered so far, and what support do you need?') : L('لخّص التقدم واتفق على أولويات النصف الثاني.', 'Summarise progress and agree second-half priorities.'),
    fields: [{ name: 'note', label: L('الملاحظة', 'Note'), type: 'textarea', rows: 5, required: true, maxLength: 3000 }], values: { note: mine ? r.midyear?.employee_note : r.midyear?.manager_note } });
  if (!v) return;
  try { await post(`/reviews/${r.id}/midyear`, { note: v.note }, 'PUT'); toast(L('حُفظت الملاحظة', 'Note saved')); refresh(); } catch (e) { toast(e.message, { kind: 'error' }); }
}

// ---------------- disagreement ----------------
export function disagreementBlock(r) {
  if (!r.disagreement) return null;
  return h('div.perf-dis',
    h('div.perf-dis-head', icon('messageSquare'), h('strong', L('ملاحظة الاعتراض', 'Disagreement note')), r.disagreement_status === 'open' ? h('span.chip.tiny.warn', icon('hourglass'), L('بانتظار رد الموارد البشرية', 'Awaiting HR')) : h('span.chip.tiny.good', icon('circleCheck'), L('تم الرد', 'Answered'))),
    h('p', r.disagreement),
    r.hr_response ? h('div.perf-dis-reply', h('div.perf-mid-who', icon('reply'), h('span', r.hr_response_by ? L(r.hr_response_by.name_ar, r.hr_response_by.name_en) : L('الموارد البشرية', 'HR')), h('span.faint.tiny', C.shortDate(r.hr_response_at))), h('p', r.hr_response)) : null);
}

// ---------------- timeline & access log ----------------
export function timelineCard(r) {
  return h('section.card.perf-side', h('h2.card-title', L('سجل المراجعة', 'Review history')), timeline((r.timeline || []).slice().reverse()));
}
const ACTIONS = {
  view: ['اطّلع', 'Viewed', 'eye'], list: ['اطّلع ضمن قائمة', 'Viewed in a list', 'list'], ai_view: ['قرأه المساعد الذكي', 'Read by Ask AI', 'spark'],
  objectives: ['عدّل الأهداف', 'Edited objectives', 'pencil'], agree: ['اعتمد الأهداف', 'Agreed objectives', 'badgeCheck'], reopen: ['أعاد فتح الأهداف', 'Reopened objectives', 'undo'],
  midyear: ['سجّل ملاحظة مرحلية', 'Mid-year note', 'messageSquare'], self_draft: ['حفظ مسودة التقييم الذاتي', 'Saved self draft', 'pencil'], self_submit: ['أرسل التقييم الذاتي', 'Submitted self-assessment', 'userCheck'],
  assess_draft: ['حفظ مسودة التقييم', 'Saved assessment draft', 'pencil'], assess_submit: ['أرسل التقييم', 'Submitted assessment', 'clipboardCheck'], calibrate: ['اعتمد المعايرة', 'Calibrated', 'scale'],
  acknowledge: ['أقرّ بالاطلاع', 'Acknowledged', 'badgeCheck'], acknowledge_disagree: ['أقرّ مع ملاحظة', 'Acknowledged with a note', 'messageSquare'], resolve: ['ردّ على الملاحظة', 'Responded', 'reply'],
};
export function accessCard(r, { title, hr = false } = {}) {
  if (!r.access_log) return null;
  const rows = r.access_log;
  return h('section.card.perf-side',
    h('div.card-head', h('h2.card-title', title || L('من اطّلع على مراجعتي', 'Who viewed my review')), h('span.chip.tiny.outline', icon('lock'), L('سجل وصول', 'Access log'))),
    h('p.tiny.faint', hr ? L('كل اطلاع أو تعديل على هذه المراجعة يُسجَّل تلقائياً ويظهر لصاحبها.', 'Every view or change to this review is logged and shown to its owner.') : L('كل اطلاع أو تعديل على مراجعة أدائك يُسجَّل تلقائياً ويظهر هنا.', 'Every view or change to your review is logged automatically.')),
    rows.length ? h('ul.perf-access', rows.slice(0, 8).map((x) => { const a = ACTIONS[x.action] || [x.action, x.action, 'eye']; return h('li', h('span.perf-acc-ic', icon(a[2])), h('span.grow', h('b', L(x.name_ar, x.name_en)), ' ', h('span.faint', L(a[0], a[1]))), h('span.tiny.faint', `${C.shortDate(x.at)}`)); }))
      : h('p.faint.tiny', L('لم يطّلع أحد غيرك بعد.', 'Nobody else has viewed it yet.')));
}
void state;
