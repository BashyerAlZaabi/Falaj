// «فريقي» — the line manager's view: team stats, roster (master) and the
// selected review (detail): objectives agreement, mid-year notes, assessment
// sheet with ratings per objective and competency, live weighted score,
// AI-assisted overall comment (policy-aware), save draft / submit.
import { h, icon, L, fmtNum, toast, confirmDialog, act, statTile, statRow, ratingInput, errorState } from '../../../sys-kit.js';
import * as C from './common.js';
import * as B from './blocks.js';

export async function view(ctx, boot, { cycleId, reviewId }) {
  const [data, detail] = await Promise.all([
    C.call(`/team${C.q(cycleId)}`),
    reviewId ? C.call(`/reviews/${encodeURIComponent(reviewId)}`).catch((e) => ({ __error: e })) : null,
  ]);
  if (!data.cycle) return C.emptyCard('calendarClock', L('لا توجد دورة أداء بعد', 'No performance cycle yet'), L('ستظهر مراجعات فريقك هنا عند إطلاق الموارد البشرية للدورة.', 'Your team’s reviews appear here once HR launches a cycle.'));
  const cyc = data.cycle; const s = data.stats;
  const cycKey = cycleId || 'current';
  if (!data.reviews.length) return C.emptyCard('usersRound', L('لا توجد مراجعات تقيّمها في هذه الدورة', 'No reviews to assess in this cycle'), L('تظهر هنا مراجعات من تكون مديرهم المباشر أو مدير إدارتهم.', 'Reviews of people you line-manage appear here.'));
  const tiles = statRow([
    statTile({ label: L('أعضاء الفريق', 'Team members'), value: s.total, icon: 'usersRound' }),
    statTile({ label: L('تقييمات ذاتية مستلمة', 'Self-assessments in'), value: `${fmtNum(s.self)}/${fmtNum(s.total)}`, icon: 'userCheck', hint: C.phaseName(cyc.phase) }),
    statTile({ label: L('تقييمات أرسلتها', 'Assessments sent'), value: `${fmtNum(s.assessed)}/${fmtNum(s.total)}`, icon: 'clipboardCheck', tone: s.assessed === s.total ? 'good' : null }),
    statTile({ label: L('بانتظار إجرائك', 'Awaiting you'), value: s.pending, icon: 'bell', tone: s.pending ? 'emph' : 'good', hint: s.deadline ? L(`آخر موعد لتقييم المدير ${C.shortDate(s.deadline)}`, `Manager deadline ${C.shortDate(s.deadline)}`) : null }),
  ]);
  const selected = detail && !detail.__error ? detail : null;
  const roster = h('nav.perf-roster', { 'aria-label': L('أعضاء الفريق', 'Team members') },
    h('div.perf-roster-head', h('span', L('الفريق', 'Team')), h('span.faint.tiny', C.countText(data.reviews.length, ['مراجعة واحدة', 'مراجعتان', 'مراجعات', 'مراجعة'], ['review', 'reviews']))),
    h('ul', data.reviews.map((r) => rosterItem(r, cycKey, r.id === reviewId))));
  let pane;
  if (detail?.__error) pane = h('section.card', errorState({ message: detail.__error.status === 404 ? L('المراجعة غير موجودة أو ليست ضمن فريقك.', 'Review not found or not in your team.') : detail.__error.message }));
  else if (selected) pane = detailPane(selected, cycKey);
  else pane = overviewPane(data, cycKey);
  const has = selected || detail?.__error ? '.has-detail' : '';
  return h(`div.perf-teamv${has}`, tiles, h(`div.perf-team${has}`, roster, h('div.perf-pane', pane)));
}

function rosterItem(r, cycKey, on) {
  const idx = C.reviewStepIndex(r);
  return h('li', h(`a.perf-roster-item${on ? '.on' : ''}`, { href: `#/sys/performance/team/${cycKey}/${r.id}`, 'aria-current': on ? 'page' : null },
    h('span.avatar', { 'data-tint': C.tint(r.employee.name_ar), 'aria-hidden': 'true' }, C.initials(r.employee.name_ar)),
    h('div.grow',
      h('div.perf-ri-name', h('span.perf-ri-n', L(r.employee.name_ar, r.employee.name_en)), r.next.actionable ? h('span.perf-dot', { role: 'img', 'aria-label': L('بانتظار إجرائك', 'Needs your action') }) : null),
      h('div.perf-ri-sub', L(r.next.ar, r.next.en)),
      h('div.perf-ri-foot',
        h('div.perf-ri-steps', { role: 'img', 'aria-label': L(`المرحلة ${Math.min(idx + 1, 5)} من 5: ${C.REVIEW_STEPS[Math.min(idx, 4)][0]}`, `Stage ${Math.min(idx + 1, 5)} of 5`) }, C.REVIEW_STEPS.map((_, i) => h(`i${i < idx ? '.done' : i === idx ? '.cur' : ''}`))),
        r.assessment_visible && r.band ? C.bandChip(r.band, { short: true }) : null))));
}

// ---------------- overview (no selection) ----------------
const STAGE = [['planning', 'صياغة الأهداف', 'Setting objectives'], ['active', 'الأهداف معتمدة', 'Objectives agreed'], ['self_submitted', 'تقييم ذاتي مستلم', 'Self-assessment in'], ['assessed', 'قيّمته', 'Assessed'], ['acknowledged', 'أقرّ بالاطلاع', 'Acknowledged']];
function overviewPane(data, cycKey) {
  const counts = STAGE.map(([k]) => data.reviews.filter((r) => r.status === k).length);
  const total = data.reviews.length;
  const pending = data.reviews.filter((r) => r.next.actionable);
  return h('div.perf-over',
    h('section.card',
      h('div.card-head', h('h2.card-title', L('تقدم مراجعات الفريق', 'Team review progress')), h('span.chip.tiny.outline', C.phaseName(data.cycle.phase))),
      h('div.perf-stack', { role: 'img', 'aria-label': STAGE.map(([, ar, en], i) => `${L(ar, en)}: ${counts[i]}`).join('، ') },
        STAGE.map(([k, ar, en], i) => (counts[i] ? h(`i.st-${k}`, { style: { flexGrow: String(counts[i]) }, 'data-tip': `${L(ar, en)}: ${counts[i]}` }) : null))),
      h('ul.perf-stack-legend', STAGE.map(([k, ar, en], i) => h('li', h(`i.st-${k}`), h('span', L(ar, en)), h('b.num', fmtNum(counts[i]))))),
      h('p.tiny.faint', L(`${fmtNum(total)} مراجعة في «${data.cycle.name_ar}». التقديرات الفردية تظهر لك لأنك المدير المباشر، ولا تظهر لغيرك خارج الموارد البشرية.`, `${total} reviews in “${data.cycle.name_en}”. Individual ratings are visible to you as line manager and to HR only.`))),
    h('section.card.perf-next',
      h('div.card-head', h('h2.card-title', pending.length ? L('ابدأ من هنا', 'Start here') : L('لا شيء بانتظارك الآن', 'Nothing awaits you now'))),
      pending.length ? h('ul.perf-next-list', pending.map((r) => h('li',
        C.personLine(r.employee),
        h('a.btn.sm.primary', { href: `#/sys/performance/team/${cycKey}/${r.id}` }, L(r.next.ar, r.next.en), icon('chevron', 'flip-rtl')))))
        : h('p.muted', L('ستصلك تنبيهات عندما يرسل أحد أعضاء فريقك تقييمه الذاتي أو عند بدء مرحلة تتطلب إجراءك.', 'You will be alerted when a team member submits or a phase needs you.'))));
}

// ---------------- detail ----------------
function detailPane(r, cycKey) {
  const blocks = [];
  blocks.push(h('section.card.perf-dhead',
    h('a.btn.sm.ghost.perf-back', { href: `#/sys/performance/team/${cycKey}` }, icon('chevronL', 'flip-rtl'), L('الفريق', 'Team')),
    h('div.perf-dhead-row', C.personLine(r.employee), h('div.perf-dhead-chips', C.statusOf(r.status), C.demoChip(r.is_demo))),
    C.reviewStepper(r),
    r.next.actionable ? h('div.perf-dnext', icon('arrowRight', 'flip-rtl'), h('span', L(r.next.ar, r.next.en)), r.next.due ? h('span.faint', `· ${C.dueText(r.next.due)}`) : null) : null));
  if (r.status === 'planning') {
    blocks.push(h('section.card', h('div.card-head', h('h2.card-title', L('أهداف الموظف', 'Objectives'))), B.objectivesEditor(r, { role: 'manager' })));
  } else if (r.can.assess) {
    blocks.push(assessmentForm(r));
  } else if (r.mgr_submitted_at) {
    blocks.push(B.feedbackCard(r, { title: L('تقييمك المُرسل', 'Your submitted assessment') }));
  } else {
    blocks.push(h('section.card', h('div.card-head', h('h2.card-title', L('الأهداف المعتمدة', 'Agreed objectives')), r.can.reopen ? h('button.btn.sm', { type: 'button', onclick: (e) => reopen(r, e.currentTarget) }, icon('undo'), L('إعادة فتح الأهداف', 'Reopen objectives')) : null), B.objectivesList(r)));
  }
  if (r.self_visible && r.self_comment) blocks.push(h('section.card.perf-selfc', h('h2.card-title', L('تعليق الموظف العام', 'Employee’s overall comment')), h('blockquote.perf-quote.soft', h('p', r.self_comment))));
  return h('div.perf-detail', h('div.perf-detail-main', blocks), h('div.perf-detail-side.perf-detail-below', B.midyearCard(r), B.timelineCard(r)));
}
async function reopen(r, btn) {
  const ok = await confirmDialog(L('إعادة فتح الأهداف؟', 'Reopen objectives?'), L('تعود الأهداف إلى الصياغة ليتمكن الموظف وأنت من تعديلها، ثم تعتمدها مجدداً.', 'Objectives return to drafting so you and the employee can edit them; you then agree them again.'), { confirmLabel: L('إعادة فتح', 'Reopen') });
  if (!ok) return;
  if (await act(btn, () => C.call(`/reviews/${r.id}/reopen`, { method: 'POST' }), { success: L('أُعيد فتح الأهداف', 'Objectives reopened') })) B.refresh();
}

// ---------------- assessment sheet ----------------
function assessmentForm(r) {
  const key = `${r.id}:assess`;
  const cr = new Map((r.comp_ratings || []).map((x) => [x.competency_id, x]));
  const d = C.draft(key) || {
    obj: Object.fromEntries(r.objectives.map((o) => [o.id, { rating: o.mgr_rating ?? null, note: o.mgr_note || '' }])),
    comp: Object.fromEntries(r.competencies.map((c) => [c.id, cr.get(c.id)?.rating ?? null])),
    comment: r.mgr_comment || '', dirty: false, ai: null,
  };
  const labels = C.scaleLabels();
  const score = h('div.perf-live');
  const foot = h('div.perf-form-foot');
  const mark = () => { d.dirty = true; C.setDraft(key, d); paint(); };

  const objRows = r.objectives.map((o, i) => {
    const it = d.obj[o.id] || (d.obj[o.id] = { rating: null, note: '' });
    const rate = ratingInput({ name: L(`تقدير الهدف ${i + 1}: ${o.title}`, `Rating for objective ${i + 1}: ${o.title}`), value: it.rating, labels });
    rate.addEventListener('change', () => { it.rating = rate.value; lab.textContent = labelOf(rate.value); mark(); });
    const lab = h('span.perf-rate-lab', labelOf(it.rating));
    const note = h('textarea.field', { rows: 2, maxlength: 1500, placeholder: L('ملاحظة للموظف على هذا الهدف (اختياري)', 'Note to the employee on this objective (optional)'), 'aria-label': L(`ملاحظة على الهدف ${i + 1}`, `Note on objective ${i + 1}`) }, it.note);
    note.addEventListener('input', () => { it.note = note.value; d.dirty = true; C.setDraft(key, d); });
    return h('li.perf-as-row',
      h('div.perf-self-q', h('span.perf-obj-n', String(i + 1)), h('div.grow', h('div.perf-obj-title', o.title), o.measure ? h('div.perf-obj-measure', icon('ruler'), o.measure) : null), C.weightChip(o.weight)),
      r.self_visible && o.self_pct != null
        ? h('div.perf-as-self', h('span.lbl-mini', L('تقدير الموظف لإنجازه', 'Employee’s self-rating')), h('div.perf-mini-bar', h('i', { style: { width: `${o.self_pct}%` } })), h('b.num', C.pctTxt(o.self_pct)), o.self_note ? h('p.perf-obj-note', o.self_note) : null)
        : h('div.perf-as-self.none', icon('hourglass'), L('لم يُرسل التقييم الذاتي بعد', 'No self-assessment yet')),
      h('div.perf-as-rate', rate, lab),
      h('details.perf-as-note', it.note ? { open: true } : {}, h('summary', icon('messageSquare'), L('ملاحظة للموظف', 'Note to employee')), note));
  });
  const compRows = r.competencies.map((c) => {
    const rate = ratingInput({ name: L(`تقدير جدارة ${c.name_ar}`, `Rating for ${c.name_en}`), value: d.comp[c.id], labels });
    const lab = h('span.perf-rate-lab', labelOf(d.comp[c.id]));
    rate.addEventListener('change', () => { d.comp[c.id] = rate.value; lab.textContent = labelOf(rate.value); mark(); });
    return h('li.perf-comp-row',
      h('span.perf-comp-ic', icon(c.icon || 'star')),
      h('div.grow', h('div.perf-obj-title', L(c.name_ar, c.name_en)), h('p.perf-comp-desc', L(c.description_ar, c.description_en)),
        h('details.perf-beh', h('summary', L('المؤشرات السلوكية', 'Behavioural indicators')), h('ul', c.behaviours.map((b) => h('li', L(b.ar, b.en)))))),
      h('div.perf-as-rate', rate, lab));
  });
  const comment = h('textarea.field', { id: `perf-mc-${r.id}`, rows: 5, maxlength: 4000, placeholder: L('ملخص واضح ومحترم: أبرز نقاط القوة، ومجالات التطوير، والتوصية للدورة القادمة.', 'A clear, respectful summary: strengths, areas to develop and a recommendation.') }, d.comment);
  comment.addEventListener('input', () => { d.comment = comment.value; mark(); });
  const aiNote = h('div.perf-ai-note');
  const paintAi = () => aiNote.replaceChildren(...(d.ai ? [h(`span.chip.tiny.${d.ai.source === 'ai' ? 'purple' : 'outline'}`, icon(d.ai.source === 'ai' ? 'spark' : 'info'), L(d.ai.label_ar, d.ai.label_en))] : []));
  const aiBtn = h('button.btn.sm.tertiary', { type: 'button', onclick: async (e) => {
        const btn = e.currentTarget;
    if ((comment.value || '').trim() && !(await confirmDialog(L('استبدال الملاحظة الحالية؟', 'Replace the current comment?'), L('ستُستبدل الملاحظة المكتوبة بمسودة جديدة يمكنك تعديلها.', 'The current text will be replaced by a new draft you can edit.'), { confirmLabel: L('استبدال', 'Replace') }))) return;
    const out = await act(btn, () => C.call(`/reviews/${r.id}/draft-comment`, { method: 'POST', body: {
      objectives: r.objectives.filter((o) => d.obj[o.id]?.rating != null).map((o) => ({ objective_id: o.id, rating: d.obj[o.id].rating })),
      competencies: r.competencies.filter((c) => d.comp[c.id] != null).map((c) => ({ competency_id: c.id, rating: d.comp[c.id] })),
      lang: document.documentElement.lang === 'en' ? 'en' : 'ar' } }));
    if (!out) return;
    d.comment = out.text; comment.value = out.text; d.ai = out; mark(); paintAi(); comment.focus();
  } }, icon('wand'), L('صياغة مسودة', 'Draft for me'));
  paintAi();

  const payload = (submit) => ({
    objectives: r.objectives.map((o) => ({ objective_id: o.id, rating: d.obj[o.id]?.rating ?? null, note: d.obj[o.id]?.note || '' })),
    competencies: r.competencies.map((c) => ({ competency_id: c.id, rating: d.comp[c.id] ?? null })),
    comment: d.comment || '', submit,
  });
  function paint() {
    const ls = C.liveScore(r.objectives, Object.fromEntries(r.objectives.map((o) => [o.id, d.obj[o.id]?.rating ?? null])), d.comp, r.cycle?.objectives_share ?? 70);
    score.replaceChildren(
      h('div.perf-live-part', h('span', L('الأهداف', 'Objectives')), h('b.num', C.score2(ls.obj))),
      h('div.perf-live-part', h('span', L('الجدارات', 'Competencies')), h('b.num', C.score2(ls.comp))),
      h('div.perf-live-part.total', h('span', L('الدرجة المرجّحة', 'Weighted score')), h('b.num', C.score2(ls.score))),
      ls.band ? C.bandChip(ls.band) : h('span.chip.tiny.outline', L('أكمل التقديرات لحساب التقدير', 'Complete ratings to see the band')));
    const ratedO = r.objectives.filter((o) => d.obj[o.id]?.rating != null).length;
    const ratedC = r.competencies.filter((c) => d.comp[c.id] != null).length;
    const complete = ratedO === r.objectives.length && ratedC === r.competencies.length && (d.comment || '').trim().length >= 20;
    const canSubmit = r.can.submit_assessment;
    foot.replaceChildren(
      h('div.perf-foot-status', h('strong.num', `${fmtNum(ratedO + ratedC)}/${fmtNum(r.objectives.length + r.competencies.length)}`), h('span', L('تقديرات مكتملة', 'ratings done')),
        d.dirty ? h('span.chip.tiny.outline', L('تغييرات غير محفوظة', 'Unsaved changes')) : r.has_draft ? h('span.chip.tiny.outline', icon('lock'), L('مسودة محفوظة — لا يراها الموظف', 'Draft saved — hidden from the employee')) : null),
      h('div.btn-group',
        h('button.btn', { type: 'button', onclick: async (e) => { const btn = e.currentTarget; if (await act(btn, () => C.call(`/reviews/${r.id}/assessment`, { method: 'PUT', body: payload(false) }), { success: L('حُفظت المسودة — لا يراها الموظف قبل الإرسال', 'Draft saved — hidden until you submit') })) { C.clearDraft(key); B.refresh(); } } }, icon('download'), L('حفظ المسودة', 'Save draft')),
        h('button.btn.primary', { type: 'button', 'aria-disabled': canSubmit && complete ? null : 'true', 'data-tip': canSubmit ? null : L('بانتظار التقييم الذاتي — يمكنك حفظ مسودة', 'Waiting for the self-assessment — you can save a draft'), onclick: (e) => submit(e.currentTarget, complete, canSubmit, ratedO, ratedC) }, icon('send'), L('إرسال التقييم', 'Submit assessment'))));
  }
  async function submit(btn, complete, canSubmit, ratedO, ratedC) {
    if (!canSubmit) { toast(L('بانتظار التقييم الذاتي — يمكنك حفظ مسودة الآن والإرسال بعد استلامه، أو بعد انتهاء نافذة التقييم الذاتي.', 'Waiting for the self-assessment — save a draft and submit once it arrives or its window closes.'), { kind: 'info' }); return; }
    if (!complete) {
      const msg = ratedO < r.objectives.length ? L('قيّم كل هدف (1–5) قبل الإرسال', 'Rate every objective (1–5)') : ratedC < r.competencies.length ? L('قيّم كل جدارة (1–5) قبل الإرسال', 'Rate every competency (1–5)') : L('أضف ملاحظة عامة واضحة (20 حرفاً على الأقل)', 'Add an overall comment (at least 20 characters)');
      toast(msg, { kind: 'error' }); if (ratedO === r.objectives.length && ratedC === r.competencies.length) comment.focus(); return;
    }
    const ls = C.liveScore(r.objectives, Object.fromEntries(r.objectives.map((o) => [o.id, d.obj[o.id]?.rating ?? null])), d.comp, r.cycle?.objectives_share ?? 70);
    const ok = await confirmDialog(L('إرسال التقييم؟', 'Submit assessment?'), L(`الدرجة المرجّحة ${C.score2(ls.score)} — «${C.bandName(ls.band)}». سيطّلع عليه ${r.employee.name_ar} فوراً، وتُعتمد النتيجة النهائية بعد معايرة الموارد البشرية. لا يمكن التعديل بعد الإرسال.`, `Weighted score ${C.score2(ls.score)} — “${C.bandName(ls.band)}”. ${r.employee.name_en} will see it now; the final result follows HR calibration. You cannot edit it afterwards.`), { confirmLabel: L('إرسال', 'Submit') });
    if (!ok) return;
    if (await act(btn, () => C.call(`/reviews/${r.id}/assessment`, { method: 'PUT', body: payload(true) }), { success: L('أُرسل التقييم وأُبلغ الموظف', 'Assessment submitted; the employee was notified') })) { C.clearDraft(key); B.refresh(); }
  }
  paint();
  return h('section.card.perf-assess',
    h('div.card-head', h('h2.card-title', L('تقييم الأداء', 'Performance assessment')), h('span.chip.tiny.outline', icon('lock'), L('المسودة مخفية عن الموظف', 'Draft hidden from employee'))),
    r.status === 'active' ? h('div.callout.perf-wait', icon('hourglass'), h('span', r.can.submit_assessment ? L('انتهت نافذة التقييم الذاتي دون إرساله؛ يمكنك الإرسال وسيُوسم التقييم «دون تقييم ذاتي».', 'The self-assessment window closed without a submission; you may submit and it will be marked “no self-assessment”.') : L('لم يُرسل الموظف تقييمه الذاتي بعد. يمكنك البدء وحفظ مسودة، والإرسال بعد استلامه.', 'The employee has not submitted yet. You can start and save a draft, then submit once it arrives.'))) : null,
    h('div.perf-sec-h', h('h3', L('الأهداف', 'Objectives')), h('span.faint.tiny', L(`${r.cycle?.objectives_share ?? 70}% من الدرجة`, `${r.cycle?.objectives_share ?? 70}% of the score`))),
    h('ol.perf-as-list', objRows),
    h('div.perf-sec-h', h('h3', L('الجدارات', 'Competencies')), h('span.faint.tiny', L(`${100 - (r.cycle?.objectives_share ?? 70)}% من الدرجة`, `${100 - (r.cycle?.objectives_share ?? 70)}% of the score`))),
    h('ul.perf-comp-list-as', compRows),
    h('div.perf-sec-h', h('label', { for: `perf-mc-${r.id}` }, h('h3', L('الملاحظة العامة', 'Overall comment'))), aiBtn),
    comment, aiNote,
    h('div.perf-sticky', score, foot));
}
const labelOf = (v) => (v ? L(C.SCALE[v - 1][0], C.SCALE[v - 1][1]) : L('لم يُقيّم', 'Not rated'));
