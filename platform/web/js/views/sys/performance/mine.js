// «مراجعتي» — the employee's own review: hero with the one next action, phase
// stepper, objectives (planning editor / self-assessment form / read-only),
// released manager feedback, acknowledgement with an optional note to HR,
// mid-year notes, history, and who viewed the review.
import { h, icon, L, fmtNum, toast, confirmDialog, formDialog, act } from '../../../sys-kit.js';
import * as C from './common.js';
import * as B from './blocks.js';

export async function view(ctx, boot, { cycleId }) {
  const data = await C.call(`/mine${C.q(cycleId)}`);
  if (!data.cycle) return C.emptyCard('calendarClock', L('لا توجد دورة أداء بعد', 'No performance cycle yet'), L('تُطلق الموارد البشرية دورة الأداء السنوية، وستظهر مراجعتك هنا فور إطلاقها.', 'HR launches the annual cycle; your review will appear here.'));
  const r = data.review;
  if (!r) {
    return h('div.perf-mine',
      C.emptyCard('userCheck', L('لا توجد لك مراجعة في هذه الدورة', 'You have no review in this cycle'), L('تُنشأ المراجعات عند بدء الدورة لموظفي الجهة الذين لهم مدير مباشر. تواصل مع الموارد البشرية إن كنت تتوقع وجود مراجعة لك.', 'Reviews are created for staff with a line manager when the cycle starts. Contact HR if you expected one.')),
      data.history.length ? historyCard(ctx, data.history, boot) : null);
  }
  return h('div.perf-mine',
    hero(ctx, r),
    h('div.perf-cols',
      h('div.perf-main', mainBlocks(r)),
      h('aside.perf-aside', managerCard(r), B.midyearCard(r), data.history.length > 1 ? historyCard(ctx, data.history, boot) : null, B.timelineCard(r), B.accessCard(r))));
}

// ---------------- hero ----------------
function hero(ctx, r) {
  const cyc = r.cycle; const n = r.next;
  const scrollTo = (id, focusSel) => { const el = document.getElementById(id); el?.scrollIntoView({ behavior: 'smooth', block: 'start' }); setTimeout(() => (focusSel ? el?.querySelector(focusSel) : el)?.focus?.({ preventScroll: true }), 350); };
  const primary = (label, ic, onClick) => h('button.btn.primary.lg', { type: 'button', onclick: onClick }, icon(ic), label);
  const secondary = (label, ic, onClick) => h('button.btn.lg', { type: 'button', onclick: onClick }, icon(ic), label);
  let title = L(n.ar, n.en); let sub = n.due ? C.dueText(n.due) : ''; const actions = [];
  switch (n.key) {
    case 'self':
      title = r.has_self_draft ? L('أكمل تقييمك الذاتي', 'Finish your self-assessment') : L('ابدأ تقييمك الذاتي', 'Start your self-assessment');
      sub = `${C.dueText(n.due)} · ${L(`أكملت ${fmtNum(r.self_progress || 0)} من ${fmtNum(r.objectives_count)} أهداف`, `${r.self_progress || 0} of ${r.objectives_count} objectives done`)}`;
      actions.push(primary(r.has_self_draft ? L('متابعة التقييم الذاتي', 'Continue self-assessment') : L('ابدأ الآن', 'Start now'), 'arrowRight', () => scrollTo('perf-self', 'input:not([disabled]), textarea')));
      break;
    case 'set_objectives':
      title = L('صِغ أهدافك لهذا العام', 'Set your objectives for the year');
      actions.push(primary(L('إضافة هدف', 'Add objective'), 'plus', () => B.objectiveDialog(r)));
      break;
    case 'await_agree': actions.push(secondary(L('مراجعة أهدافي', 'Review my objectives'), 'target', () => scrollTo('perf-objectives'))); break;
    case 'midyear': actions.push(primary(L('إضافة ملاحظاتي', 'Add my notes'), 'messageSquare', () => B.editMidyear(r))); break;
    case 'await_manager':
      sub = L(`أرسلت تقييمك الذاتي ${C.longDate(r.self_submitted_at)}. سيصلك تنبيه فور إرسال مديرك لتقييمه.`, `You submitted on ${C.longDate(r.self_submitted_at)}. You will be alerted when your manager submits.`);
      actions.push(secondary(L('عرض تقييمي الذاتي', 'View my self-assessment'), 'eye', () => scrollTo('perf-objectives')));
      break;
    case 'await_calibration':
      title = L('تقييم مديرك متاح الآن', 'Your manager’s assessment is ready');
      sub = L('النتيجة أولية وتُعتمد بعد معايرة الموارد البشرية، ثم تُطلب منك الإحاطة والإقرار.', 'Provisional until HR calibration; you will then be asked to acknowledge it.');
      actions.push(primary(L('عرض التقييم', 'View assessment'), 'eye', () => scrollTo('perf-feedback')));
      break;
    case 'acknowledge':
      title = L('نتيجتك النهائية جاهزة', 'Your final result is ready');
      actions.push(primary(L('الإقرار بالاطلاع', 'Acknowledge'), 'badgeCheck', () => acknowledge(r, false)), secondary(L('لديّ ملاحظة', 'I have a concern'), 'messageSquare', () => acknowledge(r, true)));
      break;
    case 'done': case 'closed':
      if (r.assessment_visible) actions.push(secondary(L('عرض النتيجة', 'View result'), 'eye', () => scrollTo('perf-feedback')));
      break;
    default: break;
  }
  return h(`section.card.perf-hero${n.actionable ? '.act' : ''}`,
    h('div.perf-hero-main',
      h('span.perf-eyebrow', icon(C.PHASE[cyc.phase]?.[2] || 'calendarClock'), `${L(cyc.name_ar, cyc.name_en)} · ${C.phaseName(cyc.phase)}`),
      h('h2.perf-hero-title', title),
      sub ? h('p.perf-hero-sub', sub) : null,
      actions.length ? h('div.perf-hero-actions', actions) : null),
    h('div.perf-hero-visual', heroVisual(r)),
    h('div.perf-hero-steps', C.phaseStepper(cyc)));
}
function heroVisual(r) {
  const cyc = r.cycle; const n = r.next;
  const finalBand = r.calibration_visible && r.final_band;
  if (r.assessment_visible && r.score != null && r.relation === 'employee') {
    const b = C.band(finalBand || r.band);
    return C.ring(r.score / 5, { figure: C.score2(r.score), caption: b ? L(b.short_ar, b.short_en) : '', tone: finalBand && r.released ? 'emph' : 'accent', label: L(`الدرجة ${r.score} من 5`, `Score ${r.score} of 5`) });
  }
  if (n.due) {
    const ph = (cyc.phases || []).find((p) => p.ends_on === n.due);
    const days = Math.max(0, C.daysUntil(n.due));
    const span = ph ? Math.max(1, C.daysUntil(ph.ends_on) - C.daysUntil(ph.starts_on) + 1) : 14;
    return C.ring(Math.min(1, days / span), { figure: fmtNum(days), caption: L(days === 1 ? 'يوم متبقٍ' : days === 2 ? 'يومان متبقيان' : 'أيام متبقية', days === 1 ? 'day left' : 'days left'), tone: days <= 3 ? 'warn' : 'accent', label: C.dueText(n.due) });
  }
  const done = r.self_visible ? r.self_progress || 0 : 0;
  return C.ring(r.objectives_count ? done / r.objectives_count : 0, { figure: `${fmtNum(r.objectives_count)}`, caption: L('أهداف', 'objectives'), tone: 'accent' });
}

// ---------------- main column ----------------
function mainBlocks(r) {
  const out = [];
  const released = r.assessment_visible && r.mgr_submitted_at;
  if (released) {
    out.push(B.feedbackCard(r, { title: L('تقييم مديرك', 'Your manager’s assessment'), withObjectives: false }));
    if (r.can.acknowledge) out.push(ackCard(r));
    if (r.ack_at) out.push(h('section.card.perf-ack-done', h('div.perf-ack-line', icon('badgeCheck'), h('span', L(`أقررت بالاطلاع على النتيجة ${C.longDate(r.ack_at)}`, `You acknowledged the result on ${C.longDate(r.ack_at)}`))), B.disagreementBlock(r)));
  }
  if (r.can.self) out.push(selfForm(r));
  else if (r.status === 'planning') {
    out.push(h('section.card#perf-objectives', h('div.card-head', h('h2.card-title', L('أهدافي لهذه الدورة', 'My objectives this cycle')), r.objectives_ready ? h('span.chip.tiny.info', icon('hourglass'), L('بانتظار اعتماد المدير', 'Awaiting manager')) : null), B.objectivesEditor(r, { role: 'employee' })));
  } else {
    out.push(h('section.card#perf-objectives',
      h('div.card-head', h('h2.card-title', released ? L('أهدافي: تقديري وتقدير مديري', 'My objectives: my view and my manager’s') : L('أهدافي لهذه الدورة', 'My objectives this cycle')), r.objectives_agreed_at ? h('span.chip.tiny.good', icon('badgeCheck'), L(`معتمدة ${C.shortDate(r.objectives_agreed_at)}`, `Agreed ${C.shortDate(r.objectives_agreed_at)}`)) : null),
      B.objectivesList(r, { showMgr: !!released }),
      r.self_visible && r.self_comment ? h('div.perf-self-comment', h('span.lbl-mini', L('تعليقي العام', 'My overall comment')), h('p', r.self_comment)) : null));
  }
  if (!released && ['self_submitted', 'active'].includes(r.status)) {
    out.push(h('div.callout.perf-private', icon('lock'), h('span', L('يظهر تقييم مديرك هنا فور إرساله. المسودات لا يراها أحد غير كاتبها، وكل اطلاع على مراجعتك يُسجَّل.', 'Your manager’s assessment appears here once submitted. Drafts are visible only to their author, and every view is logged.'))));
  }
  return out;
}

function ackCard(r) {
  return h('section.card.perf-ack',
    h('div.perf-ack-text', h('h2.card-title', L('الإحاطة والإقرار', 'Acknowledgement')),
      h('p.muted', L('إقرارك يؤكد اطلاعك على النتيجة ولا يعني بالضرورة موافقتك. إن كانت لديك ملاحظة، تُرسل إلى الموارد البشرية للرد عليك.', 'Acknowledging confirms you have seen the result; it does not necessarily mean you agree. Any concern goes to HR for a response.'))),
    h('div.perf-ack-actions', h('button.btn.primary', { type: 'button', onclick: () => acknowledge(r, false) }, icon('badgeCheck'), L('أقرّ بالاطلاع', 'Acknowledge')), h('button.btn', { type: 'button', onclick: () => acknowledge(r, true) }, icon('messageSquare'), L('أقرّ مع ملاحظة', 'Acknowledge with a note'))));
}
async function acknowledge(r, disagree) {
  let body = {};
  if (disagree) {
    const v = await formDialog({ title: L('ملاحظة على نتيجة التقييم', 'A note on your result'), intro: L('تُرسل ملاحظتك إلى الموارد البشرية لمراجعتها والرد عليك، ويبقى الإقرار بالاطلاع مسجلاً. لا تتغير النتيجة تلقائياً.', 'Your note goes to HR for review and a response; your acknowledgement is recorded. The result does not change automatically.'),
      fields: [{ name: 'note', label: L('ملاحظتك', 'Your note'), type: 'textarea', rows: 5, required: true, maxLength: 3000, placeholder: L('وضّح ما تراه غير منعكس في التقييم، مع الأدلة إن وُجدت.', 'Explain what is not reflected, with evidence if any.') }],
      submitLabel: L('إقرار وإرسال الملاحظة', 'Acknowledge and send') });
    if (!v) return;
    if (v.note.length < 10) { toast(L('اكتب الملاحظة بوضوح (10 أحرف على الأقل)', 'Please write at least 10 characters'), { kind: 'error' }); return; }
    body = { disagree: true, note: v.note };
  } else {
    const ok = await confirmDialog(L('الإقرار بالاطلاع؟', 'Acknowledge result?'), L('تُقرّ بأنك اطّلعت على نتيجة تقييم أدائك النهائية لهذه الدورة.', 'You confirm you have seen your final result for this cycle.'), { confirmLabel: L('أقرّ بالاطلاع', 'Acknowledge') });
    if (!ok) return;
  }
  try { await C.call(`/reviews/${r.id}/acknowledge`, { method: 'POST', body }); toast(disagree ? L('سُجّل إقرارك وأُرسلت ملاحظتك إلى الموارد البشرية', 'Acknowledged; your note was sent to HR') : L('سُجّل إقرارك بالاطلاع', 'Acknowledgement recorded')); B.refresh(); } catch (e) { toast(e.message, { kind: 'error' }); }
}

// ---------------- self-assessment form ----------------
function selfForm(r) {
  const key = `${r.id}:self`;
  const d = C.draft(key) || { items: Object.fromEntries(r.objectives.map((o) => [o.id, { pct: o.self_pct ?? null, note: o.self_note || '' }])), comment: r.self_comment || '', dirty: false };
  const mark = () => { d.dirty = true; C.setDraft(key, d); paintFoot(); };
  const rows = r.objectives.map((o, i) => {
    const it = d.items[o.id] || (d.items[o.id] = { pct: null, note: '' });
    const id = `perf-pct-${o.id}`;
    const num = h('input.field.perf-pct-num', { id, type: 'number', min: 0, max: 100, step: 5, inputmode: 'numeric', value: it.pct ?? '', placeholder: '—', 'aria-describedby': `${id}-h` });
    const range = h('input.perf-range', { type: 'range', min: 0, max: 100, step: 5, value: it.pct ?? 0, 'aria-label': L(`نسبة إنجاز الهدف ${i + 1}`, `Achievement for objective ${i + 1}`) });
    const paint = () => { range.style.setProperty('--v', `${it.pct ?? 0}%`); range.classList.toggle('unset', it.pct == null); };
    range.addEventListener('input', () => { it.pct = Number(range.value); num.value = range.value; paint(); mark(); });
    num.addEventListener('input', () => { it.pct = num.value === '' ? null : Math.max(0, Math.min(100, Math.round(Number(num.value)))); range.value = it.pct ?? 0; paint(); mark(); });
    paint();
    const note = h('textarea.field', { rows: 2, maxlength: 1500, placeholder: L('ما الذي أنجزته؟ اذكر الدليل باختصار (اختياري)', 'What did you deliver? Evidence in brief (optional)'), 'aria-label': L(`ملاحظة على الهدف ${i + 1}`, `Note for objective ${i + 1}`) }, it.note);
    note.addEventListener('input', () => { it.note = note.value; mark(); });
    return h('li.perf-self-row',
      h('div.perf-self-q', h('span.perf-obj-n', String(i + 1)), h('div.grow', h('label.perf-obj-title', { for: id }, o.title), o.measure ? h('div.perf-obj-measure', { id: `${id}-h` }, icon('ruler'), o.measure) : null), C.weightChip(o.weight)),
      h('div.perf-self-a', h('div.perf-pct', range, h('div.perf-pct-box', num, h('span', '%'))), note));
  });
  const comment = h('textarea.field', { id: 'perf-self-comment', rows: 4, maxlength: 4000, placeholder: L('لخّص أبرز إنجازاتك وما تعلمته، وما تحتاجه من دعم للعام القادم.', 'Summarise your key achievements, lessons and the support you need next year.') }, d.comment);
  comment.addEventListener('input', () => { d.comment = comment.value; mark(); });
  const foot = h('div.perf-form-foot');
  const payload = (submit) => ({ items: r.objectives.map((o) => ({ objective_id: o.id, pct: d.items[o.id]?.pct ?? null, note: d.items[o.id]?.note || '' })), comment: d.comment || '', submit });
  function paintFoot() {
    const done = r.objectives.filter((o) => d.items[o.id]?.pct != null).length;
    const ready = done === r.objectives.length && (d.comment || '').trim().length >= 10;
    foot.replaceChildren(
      h('div.perf-foot-status', h('strong.num', `${fmtNum(done)}/${fmtNum(r.objectives.length)}`), h('span', L('أهداف مكتملة', 'objectives done')), d.dirty ? h('span.chip.tiny.outline', L('تغييرات غير محفوظة', 'Unsaved changes')) : r.has_self_draft ? h('span.chip.tiny.outline', icon('check'), L('مسودة محفوظة', 'Draft saved')) : null),
      h('div.btn-group',
        h('button.btn', { type: 'button', onclick: async (e) => { const btn = e.currentTarget; const ok = await act(btn, () => C.call(`/reviews/${r.id}/self`, { method: 'PUT', body: payload(false) }), { success: L('حُفظت المسودة — لا يراها أحد غيرك', 'Draft saved — only you can see it') }); if (ok) { C.clearDraft(key); B.refresh(); } } }, icon('download'), L('حفظ كمسودة', 'Save draft')),
        h('button.btn.primary', { type: 'button', 'aria-disabled': ready ? null : 'true', onclick: (e) => submit(e.currentTarget) }, icon('send'), L('إرسال التقييم الذاتي', 'Submit self-assessment'))));
  }
  async function submit(btn) {
    const missing = r.objectives.find((o) => d.items[o.id]?.pct == null);
    if (missing) { toast(L('أدخل نسبة الإنجاز لكل هدف قبل الإرسال', 'Enter the achievement for every objective'), { kind: 'error' }); document.getElementById(`perf-pct-${missing.id}`)?.focus(); return; }
    if ((d.comment || '').trim().length < 10) { toast(L('أضف تعليقاً عاماً على أدائك (10 أحرف على الأقل)', 'Add an overall comment (at least 10 characters)'), { kind: 'error' }); comment.focus(); return; }
    const ok = await confirmDialog(L('إرسال التقييم الذاتي؟', 'Submit self-assessment?'), L('بعد الإرسال لا يمكن التعديل، ويطّلع عليه مديرك المباشر ليبدأ تقييمه.', 'After submitting you cannot edit it; your line manager will see it and start the assessment.'), { confirmLabel: L('إرسال', 'Submit') });
    if (!ok) return;
    const res = await act(btn, () => C.call(`/reviews/${r.id}/self`, { method: 'PUT', body: payload(true) }), { success: L('أُرسل تقييمك الذاتي — شكراً لالتزامك بالموعد', 'Self-assessment submitted — thank you') });
    if (res) { C.clearDraft(key); B.refresh(); }
  }
  paintFoot();
  return h('section.card.perf-self#perf-self',
    h('div.card-head', h('h2.card-title', L('التقييم الذاتي', 'Self-assessment')), h('span.chip.tiny.outline', icon('lock'), L('المسودة لك وحدك', 'Draft is private'))),
    h('p.muted.perf-lead', L('قدّر نسبة إنجاز كل هدف مقارنة بالمستهدف المتفق عليه، وأضف ما يدعم تقديرك. يُحتسب الإرسال قبل الموعد النهائي ضمن نقاط التميّز.', 'Estimate how far you achieved each objective against its agreed target. Submitting before the deadline earns excellence points.')),
    h('ol.perf-self-list', rows),
    h('div.perf-self-overall', h('label.lbl', { for: 'perf-self-comment' }, L('تعليقك العام', 'Overall comment'), h('span.req', { 'aria-hidden': 'true' }, ' *')), comment),
    foot);
}

// ---------------- side column ----------------
function managerCard(r) {
  return h('section.card.perf-side',
    h('h2.card-title', L('مديرك المباشر', 'Your line manager')),
    C.personLine(r.manager),
    h('p.tiny.faint.perf-side-note', icon('shield'), L('يطّلع على مراجعتك أنت ومديرك المباشر والموارد البشرية فقط.', 'Only you, your line manager and HR can see your review.')));
}
function historyCard(ctx, history, boot) { // eslint-disable-line no-unused-vars
  return h('section.card.perf-side',
    h('h2.card-title', L('سجلّ دوراتي', 'My cycles')),
    h('ul.perf-hist', history.map((x) => h(`li${x.current ? '.cur' : ''}`,
      h('a', { href: `#/sys/performance/mine/${x.cycle_id === boot.current?.id ? '' : x.cycle_id}`.replace(/\/$/, '') },
        h('span.grow', L(x.name_ar, x.name_en)),
        x.final_band ? C.bandChip(x.final_band, { final: true }) : C.statusOf(x.status))))));
}
