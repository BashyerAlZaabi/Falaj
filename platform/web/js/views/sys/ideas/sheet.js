// Ideas — the idea sheet: stepper, "what's next" for this viewer, problem &
// solution, impact, evaluation (committee or anonymous summary), decision,
// implementation, identity access log, timeline and comments. It is refreshed
// in place on realtime changes (comment drafts and focus are kept).
import { h, icon, toast, confirmDialog, openSheet, stepper, timeline, accessLogList, act, avatar, L, fmtNum, fmtDate, dateTime, skeleton, errorState, money } from '../../../sys-kit.js';
import { call, S, CRIT, WEIGHTS, HAPPY, STEPS, stepIndex, stepFailed, chip, catChip, demoChip, authorLine, voteButton, num, compactMoney, stLabel, keepFocus } from './ui.js';
import { ideaForm, scoreDialog, decisionDialog, implementDialog, completeDialog, hideCommentDialog } from './forms.js';

// ctx: platform view context; base: hash to return to when the sheet closes.
export async function openIdea(ctx, id, { base } = {}) {
  let sh = S.sheet;
  if (!(sh && sh.id === id && sh.handle.el.isConnected)) {
    const handle = openSheet({ title: L('جارٍ التحميل…', 'Loading…'), subtitle: ' ', body: h('div.idea-sheet', skeleton('card'), skeleton('list', 3)), wide: true });
    handle.el.classList.add('idea-sheet-panel');
    sh = S.sheet = { id, handle, base };
    watchClose(sh);
  }
  if (base) sh.base = base;
  try {
    const d = await call(`/ideas/${id}`);
    if (S.sheet !== sh) return;
    paint(ctx, sh, d);
  } catch (e) {
    if (S.sheet !== sh) return;
    sh.handle.setBody(h('div.idea-sheet', errorState(e, () => openIdea(ctx, id))));
  }
}
function watchClose(sh) {
  const mo = new MutationObserver(() => {
    if (sh.handle.el.isConnected) return;
    mo.disconnect();
    if (S.sheet === sh) S.sheet = null;
    if (location.hash.includes(sh.id) && sh.base) history.replaceState(null, '', sh.base);
  });
  mo.observe(document.body, { childList: true });
}
const refresh = (ctx, sh) => openIdea(ctx, sh.id);

function paint(ctx, sh, d) {
  const el = sh.handle.el;
  const restore = keepFocus(el);
  el.querySelector('.sheet-head h2').textContent = d.title;
  const sub = el.querySelector('.sheet-head .sub');
  if (sub) sub.replaceChildren(h('span.num', d.ref || L('مسودة', 'Draft')), ' · ', d.submitted_at ? L(`قُدّمت ${fmtDate(d.submitted_at)}`, `Submitted ${fmtDate(d.submitted_at)}`) : L(`أُنشئت ${fmtDate(d.created_at)}`, `Created ${fmtDate(d.created_at)}`));
  const headGrow = el.querySelector('.sheet-head .grow');
  headGrow.querySelector('.sys-badges')?.remove();
  headGrow.append(h('div.sys-badges', chip(d.status), catChip(d.category), demoChip(d.is_demo)));
  sh.handle.setBody(h('div.idea-sheet', { 'data-cat': d.category },
    stepper(STEPS.map((s) => ({ ar: s.ar, en: s.en })), stepIndex(d), { failed: stepFailed(d), label: L('مراحل الفكرة', 'Idea stages') }),
    nextBlock(ctx, sh, d),
    h('div.is-grid',
      h('div.is-main',
        section(L('المشكلة أو الفرصة', 'Problem or opportunity'), 'target', h('p.is-text', d.problem || h('span.faint', L('لم تُكتب بعد', 'Not written yet')))),
        section(L('الحل المقترح', 'Proposed solution'), 'lightbulb', h('p.is-text', d.solution || h('span.faint', L('لم يُكتب بعد', 'Not written yet')))),
        impactBlock(d),
        d.benefits ? benefitsBlock(d) : null,
        evaluationBlock(ctx, sh, d),
        d.decision ? decisionBlock(d) : null,
        d.project ? projectBlock(d) : null),
      h('aside.is-side',
        peopleBlock(d),
        socialBlock(ctx, sh, d),
        contextBlock(d),
        d.identity_log ? h('section.is-sec.is-card', h('h3.is-h', icon('eye'), L('من اطّلع على هويتك', 'Who viewed your identity')), h('p.tiny.faint', L('أعضاء اللجنة فقط يرون اسمك، وكل اطّلاع يُسجَّل هنا.', 'Only committee members can see your name; every view is logged here.')), accessLogList(d.identity_log)) : null)),
    section(L('سجل المراحل', 'Stage history'), 'history', timeline(d.history.map((x) => ({ at: x.at, ar: histText(x, 'ar'), en: histText(x, 'en'), who: x.who.role ? { name_ar: x.who.role === 'author' ? 'مقدّم الفكرة' : 'لجنة تقييم الأفكار', name_en: x.who.role === 'author' ? 'The author' : 'Ideas committee' } : x.who, icon: ST_ICON[x.to] || 'circleDot', tone: ['approved', 'implemented'].includes(x.to) ? 'good' : x.to === 'rejected' ? 'crit' : x.to === 'needs_info' ? 'emph' : null })))),
    commentsBlock(ctx, sh, d)));
  restore();
}
const ST_ICON = { draft: 'pencil', submitted: 'send', screening: 'scanSearch', evaluation: 'scale', needs_info: 'help', approved: 'badgeCheck', rejected: 'circleX', in_implementation: 'rocket', implemented: 'trophy', withdrawn: 'undo' };
function histText(x, lang) {
  const to = lang === 'ar' ? { draft: 'أُنشئت كمسودة', submitted: 'قُدّمت إلى اللجنة', screening: x.from === 'needs_info' ? 'أُعيد إرسالها للفرز بعد الاستكمال' : 'بدأ فرزها', evaluation: x.from === 'needs_info' ? 'أُعيد إرسالها للتقييم بعد الاستكمال' : 'أُحيلت للتقييم', needs_info: 'طُلبت معلومات إضافية', approved: 'اعتُمدت', rejected: 'لم تُعتمد', in_implementation: 'بدأ تنفيذها', implemented: 'نُفّذت وتحقق أثرها', withdrawn: 'سُحبت' }
    : { draft: 'Created as a draft', submitted: 'Submitted to the committee', screening: x.from === 'needs_info' ? 'Resubmitted for screening' : 'Screening started', evaluation: x.from === 'needs_info' ? 'Resubmitted for evaluation' : 'Referred for evaluation', needs_info: 'More information requested', approved: 'Approved', rejected: 'Not approved', in_implementation: 'Implementation started', implemented: 'Implemented, benefits realised', withdrawn: 'Withdrawn' };
  return `${to[x.to] || x.to}${x.note ? ` — «${x.note}»` : ''}`;
}
const section = (title, ic, ...body) => h('section.is-sec', h('h3.is-h', icon(ic), title), ...body);

// ---------- what should this viewer do next? ----------
function nextBlock(ctx, sh, d) {
  const c = d.can;
  const acts = [];
  const add = (label, ic, fn, { primary, danger, tertiary } = {}) => acts.push(h(`button.btn${primary ? '.primary' : danger ? '.destructive-soft' : tertiary ? '.tertiary' : ''}`, { type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, fn); if (r !== null && r !== undefined) refresh(ctx, sh); } }, icon(ic), label));
  let msg = null; let tone = 'info'; let ic = 'arrowRight';
  if (d.relation.committee && d.relation.owner && ['submitted', 'screening', 'evaluation'].includes(d.status)) { ic = 'shieldAlert'; tone = 'warn';
    msg = L('تعارض مصالح: أنت من مقدّمي هذه الفكرة، فلا يمكنك فرزها أو تقييمها أو اتخاذ قرار بشأنها. يتولاها بقية أعضاء اللجنة.', 'Conflict of interest: you cannot screen, score or decide on your own idea. Other committee members handle it.');
  } else if (c.submit) { msg = L('مسودتك خاصة بك حتى ترسلها. أكمل الوصف ثم أرسلها للجنة.', 'Your draft is private until you send it. Complete it, then send it to the committee.'); ic = 'pencil';
    add(L('إرسال للجنة', 'Send to the committee'), 'send', async () => { const r = await call(`/ideas/${d.id}/submit`, { method: 'POST', body: {} }); toast(L('وصلت فكرتك إلى اللجنة', 'Your idea reached the committee')); const { pointsFeedback } = await import('./ui.js'); pointsFeedback(document.querySelector('#level-chip-host')); return r; }, { primary: true });
    add(L('تعديل', 'Edit'), 'pencil', () => ideaForm({ idea: d }));
    add(L('حذف المسودة', 'Delete draft'), 'trash', async () => { if (!(await confirmDialog(L('حذف المسودة؟', 'Delete draft?'), L('ستُحذف المسودة نهائياً. لا يمكن التراجع.', 'The draft will be permanently deleted.'), { danger: true, confirmLabel: L('حذف', 'Delete') }))) return null; const r = await call(`/ideas/${d.id}`, { method: 'DELETE', body: { confirm: true } }); toast(L('حُذفت المسودة', 'Draft deleted')); sh.handle.close(); return null; }, { danger: true });
  } else if (c.resubmit) { tone = 'warn'; ic = 'help'; msg = h('div', h('strong', L('طلبت اللجنة معلومات إضافية', 'The committee asked for more information')), d.info_request?.note ? h('p', d.info_request.note) : null);
    add(L('استكمل وأعد الإرسال', 'Complete & resubmit'), 'send', () => ideaForm({ idea: d }), { primary: true });
  } else if (c.screen) { msg = L('فكرة جديدة بانتظار الفرز: تحقّق من اكتمالها وعدم تكرارها.', 'New idea awaiting screening: check completeness and duplicates.'); ic = 'scanSearch';
    add(L('بدء الفرز', 'Start screening'), 'scanSearch', () => transition(d, 'screening'), { primary: true });
    add(L('ملخص الفرز', 'Screening brief'), 'spark', () => assist(d), { tertiary: true });
  } else if (c.refer) { msg = L('أنهِ الفرز: أحِل الفكرة للتقييم، أو اطلب معلومات، أو قرّر عدم اعتمادها مع ملاحظات.', 'Finish screening: refer for evaluation, ask for info, or decline with feedback.'); ic = 'scanSearch';
    add(L('إحالة للتقييم', 'Refer for evaluation'), 'scale', () => transition(d, 'evaluation'), { primary: true });
    add(L('طلب معلومات / عدم اعتماد', 'Ask for info / decline'), 'help', () => decisionDialog(d, { options: ['needs_info', 'rejected'] }));
    add(L('ملخص الفرز', 'Screening brief'), 'spark', () => assist(d), { tertiary: true });
  } else if (c.score && !d.evaluation?.mine) { msg = L('قيّم الفكرة وفق المعايير الأربعة. تقييمك مستقل ولا ترى تقييمات الآخرين قبل حفظه.', 'Score the idea on the four criteria. Scoring is blind until you save yours.'); ic = 'scale'; tone = 'emph';
    add(L('قيّم الفكرة', 'Score the idea'), 'star', () => scoreDialog(d), { primary: true });
    add(c.approve ? L('اتخاذ القرار', 'Decide') : L('طلب معلومات / عدم اعتماد', 'Ask for info / decline'), 'gavel', () => decisionDialog(d, { options: c.approve ? ['approved', 'needs_info', 'rejected'] : ['needs_info', 'rejected'] }));
    add(L('ملخص الفرز', 'Screening brief'), 'spark', () => assist(d), { tertiary: true });
  } else if (c.score) { ic = 'scale'; tone = 'emph';
    msg = c.approve ? L('اكتمل الحد الأدنى من التقييمات — يمكن اتخاذ القرار.', 'Minimum scores reached — ready for a decision.') : L(`بانتظار تقييم أعضاء آخرين (${d.evaluation.count}/${d.evaluation.min_scores}).`, `Waiting for other members (${d.evaluation.count}/${d.evaluation.min_scores}).`);
    add(L('اتخاذ القرار', 'Decide'), 'gavel', () => decisionDialog(d), { primary: true });
    add(L('تعديل تقييمي', 'Edit my score'), 'star', () => scoreDialog(d));
  } else if (c.implement) { msg = L('الفكرة معتمدة: ابدأ التنفيذ بإنشاء مشروع أو ربط مشروع قائم.', 'Approved: start implementation with a new or existing project.'); ic = 'rocket'; tone = 'good';
    add(L('بدء التنفيذ', 'Start implementation'), 'rocket', () => implementDialog(d), { primary: true });
  } else if (c.complete) { msg = L('عند اكتمال التنفيذ سجّل الأثر المحقق بالأدلة لإغلاق الفكرة.', 'When delivered, record the realised benefits to close the idea.'); ic = 'trophy'; tone = 'good';
    add(L('تسجيل الأثر المحقق', 'Record benefits'), 'trophy', () => completeDialog(d), { primary: true });
  } else if (d.relation.owner && ['submitted', 'screening', 'evaluation'].includes(d.status)) { ic = 'hourglass';
    msg = L('فكرتك لدى اللجنة الآن. ستصلك الملاحظات هنا وفي التنبيهات.', 'Your idea is with the committee. Feedback arrives here and in your alerts.');
  } else if (d.relation.judge && d.status === 'needs_info') { ic = 'hourglass';
    msg = L('بانتظار استكمال مقدّم الفكرة للمعلومات المطلوبة.', 'Waiting for the author to provide the requested information.');
  }
  if (c.withdraw) add(L('سحب الفكرة', 'Withdraw'), 'undo', async () => { if (!(await confirmDialog(L('سحب الفكرة؟', 'Withdraw the idea?'), L('ستتوقف مراجعة اللجنة وتختفي الفكرة من بنك الأفكار. يبقى سجلها لديك.', 'Committee review stops and the idea leaves the bank. You keep its record.'), { danger: true, confirmLabel: L('سحب', 'Withdraw') }))) return null; const r = await call(`/ideas/${d.id}/withdraw`, { method: 'POST', body: { confirm: true } }); toast(L('سُحبت الفكرة', 'Idea withdrawn')); return r; }, { danger: true });
  if (!msg && !acts.length) return null;
  return h(`div.is-next.${tone}`, h('span.in-ic', icon(ic)), h('div.grow', typeof msg === 'string' ? h('p', msg) : msg), acts.length ? h('div.in-acts', acts) : null);
}
async function transition(d, to) {
  const r = await call(`/ideas/${d.id}/transition`, { method: 'POST', body: { to } });
  toast(to === 'screening' ? L('بدأ الفرز', 'Screening started') : L('أُحيلت الفكرة للتقييم', 'Referred for evaluation'));
  return r;
}
async function assist(d) {
  const r = await call(`/ideas/${d.id}/assist`, { method: 'POST', body: {} });
  const { modal } = await import('../../../ui.js');
  await modal(L('ملخص الفرز', 'Screening brief'), h('div.assist',
    h(`div.assist-mode.${r.mode}`, icon(r.mode === 'ai' ? 'spark' : 'sliders'), h('span', L(r.label_ar, r.label_en))),
    r.text ? h('div.assist-text', r.text) : h('p', L(r.summary_ar, r.summary_en)),
    h('ul.assist-checks', r.checks.map((c) => h(`li.${c.ok ? 'ok' : 'miss'}`, icon(c.ok ? 'circleCheck' : 'circleAlert'), L(c.ar, c.en)))),
    r.similar?.length ? h('div', h('div.lbl', L('أفكار مشابهة', 'Similar ideas')), h('ul.sim-list', r.similar.map((s) => h('li', h('span.grow', s.title), h('span.sim-pct.tabular', `${fmtNum(s.similarity)}%`))))) : null,
    r.questions?.length ? h('div', h('div.lbl', L('أسئلة مقترحة لمقدّم الفكرة', 'Suggested questions for the author')), h('ul.assist-q', r.questions.map((q) => h('li', q)))) : null,
    r.method_ar && r.mode !== 'ai' ? h('p.tiny.faint', L(`طريقة التحليل: ${r.method_ar}`, 'Method: fixed rules (description length, quantified impact, objective link, word-overlap similarity).')) : null),
  [{ label: L('إغلاق', 'Close'), value: true, primary: true }]);
  return null;
}

// ---------- content blocks ----------
function impactBlock(d) {
  const i = d.impact;
  const tile = (ic, label, value, unit) => h('div.imp-tile', h('span.it-ic', icon(ic)), h('div', h('div.it-l', label), h('div.it-v', value == null ? h('span.faint', '—') : value, unit && value != null ? h('small', unit) : null)));
  return section(L('الأثر المتوقع سنوياً', 'Expected annual impact'), 'trendUp', h('div.imp-tiles',
    tile('coins', L('وفر مالي', 'Saving'), i.saving ? money(i.saving) : null),
    tile('clock', L('ساعات عمل موفرة', 'Hours saved'), i.hours ? num(Math.round(i.hours)) : null, L('ساعة', 'h')),
    tile('faceHappy', L('سعادة المتعاملين', 'Customer happiness'), i.happiness ? L(HAPPY[i.happiness][0], HAPPY[i.happiness][1]) : null)),
  h('p.tiny.faint', L('تقديرات مقدّم الفكرة — تتحقق منها اللجنة أثناء التقييم.', 'Author’s estimates — verified by the committee.')));
}
function benefitsBlock(d) {
  const b = d.benefits;
  return h('section.is-sec.is-benefits', h('h3.is-h', icon('trophy'), L('الأثر المحقق', 'Realised benefits'), h('span.chip.tiny.good', icon('badgeCheck'), fmtDate(b.at))),
    h('div.imp-tiles', b.saving ? h('div.imp-tile.good', h('span.it-ic', icon('coins')), h('div', h('div.it-l', L('وفر محقق سنوياً', 'Realised saving / yr')), h('div.it-v', money(b.saving)))) : null,
      b.hours ? h('div.imp-tile.good', h('span.it-ic', icon('clock')), h('div', h('div.it-l', L('ساعات موفرة سنوياً', 'Hours saved / yr')), h('div.it-v', num(Math.round(b.hours)), h('small', L('ساعة', 'h'))))) : null),
    b.note ? h('p.is-text', b.note) : null);
}
function evaluationBlock(ctx, sh, d) {
  const e = d.evaluation;
  if (!e || e.view === 'none') return null;
  if (e.view === 'pending') {
    if (!['screening', 'evaluation', 'submitted', 'needs_info'].includes(d.status)) return null;
    return section(L('تقييم اللجنة', 'Committee evaluation'), 'scale', h('p.faint.tiny', L('تبقى درجات اللجنة وملاحظاتها سرية حتى صدور القرار، ثم يظهر ملخص مجمّع دون أسماء.', 'Committee scores and notes stay confidential until the decision; then an anonymous summary appears.')));
  }
  if (e.view === 'summary') {
    return section(L('ملخص تقييم اللجنة', 'Committee evaluation summary'), 'scale', critBars(e.aggregate),
      h('p.tiny.faint', L(`متوسط ${e.aggregate.count} من أعضاء اللجنة — دون أسماء أو ملاحظات فردية.`, `Average of ${e.aggregate.count} committee members — no names or individual notes.`)));
  }
  // committee view
  const blind = e.blind ? h('div.callout.is-blind', icon('eyeOff'), h('span', L(`قيّمها ${fmtNum(e.count)} من الأعضاء. تظهر تقييماتهم بعد حفظ تقييمك (تقييم مستقل).`, `${e.count} member(s) scored. Their scores appear after you save yours (blind scoring).`))) : null;
  const mine = e.mine ? h('div.my-score', h('span.lbl', L('تقييمي', 'My score')), h('div.ms-pills', Object.keys(WEIGHTS).map((k) => h('span.sc-pill', { 'data-v': e.mine[k] }, h('small', L(CRIT[k][0], CRIT[k][1])), h('b.num', fmtNum(e.mine[k]))))), h('strong.num.tabular', `${fmtNum(e.mine.weighted)}/5`)) : null;
  const members = e.members?.length ? h('table.tbl.score-tbl', h('thead', h('tr', h('th', L('العضو', 'Member')), Object.keys(WEIGHTS).map((k) => h('th.num', L(CRIT[k][0], CRIT[k][1]))), h('th.num', L('الموزونة', 'Weighted')))),
    h('tbody', e.members.map((m) => h(`tr${m.me ? '.me' : ''}`, h('td', h('span.who-chip', avatar(m.user.name_ar), L(m.user.name_ar, m.user.name_en)), m.note ? h('div.tiny.faint', m.note) : null), Object.keys(WEIGHTS).map((k) => h('td.num', fmtNum(m[k]))), h('td.num', h('strong', fmtNum(m.weighted))))))) : null;
  return h('section.is-sec.is-committee', h('h3.is-h', icon('scale'), L('تقييم اللجنة', 'Committee evaluation'), h('span.chip.tiny.outline', icon('lock'), L('للجنة فقط', 'Committee only'))),
    e.aggregate ? critBars(e.aggregate) : null, mine, blind, members ? h('div.table-wrap', members) : null,
    h('p.tiny.faint', L(`الأوزان: الأثر 35% · قابلية التطبيق 25% · الكلفة 20% · المواءمة 20%. الحد الأدنى للاعتماد ${e.min_scores} تقييمات.`, `Weights: impact 35% · feasibility 25% · cost 20% · alignment 20%. Approval needs ${e.min_scores} scores.`)));
}
function critBars(a) {
  return h('div.crit-bars',
    h('div.cb-total', h('span.cb-num.num.tabular', `${fmtNum(a.pct)}%`), h('span.faint', L(`${fmtNum(a.weighted)} من ${fmtNum(5)}`, `${a.weighted} of 5`))),
    h('div.cb-list', Object.keys(WEIGHTS).map((k) => h('div.cb-row', h('span.cb-l', L(CRIT[k][0], CRIT[k][1])), h('div.progress', { role: 'progressbar', 'aria-valuenow': Math.round((a.avg[k] / 5) * 100), 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L(CRIT[k][0], CRIT[k][1]) }, h('i', { style: { width: `${(a.avg[k] / 5) * 100}%` } })), h('span.cb-v.num.tabular', fmtNum(a.avg[k]))))));
}
function decisionBlock(d) {
  const dec = d.decision;
  const tone = d.status === 'rejected' ? 'outline' : 'good';
  return h(`section.is-sec.is-decision.${tone}`, h('h3.is-h', icon(d.status === 'rejected' ? 'messageSquare' : 'badgeCheck'), d.status === 'rejected' ? L('ملاحظات اللجنة', 'Committee feedback') : L('قرار اللجنة', 'Committee decision'),
    h('span.tiny.faint', fmtDate(dec.at))),
  dec.note ? h('p.is-text', dec.note) : h('p.faint.tiny', L('دون ملاحظات إضافية.', 'No additional notes.')),
  h('p.tiny.faint', L('تظهر هذه الملاحظات لمقدّمي الفكرة واللجنة وراعي التنفيذ فقط.', 'Visible to the authors, the committee and the sponsor only.')));
}
function projectBlock(d) {
  const p = d.project;
  if (!p.visible) return section(L('التنفيذ', 'Implementation'), 'rocket', h('p.tiny', L('الفكرة مرتبطة بمشروع تنفيذي. تفاصيل المشروع متاحة لفريقه ومديري إدارته.', 'Linked to an implementation project. Its details are available to the project team and its managers.')));
  return section(L('مشروع التنفيذ', 'Implementation project'), 'rocket',
    h('a.is-project', { href: `#/projects/${p.id}` }, h('span.ip-ic', icon('folder')), h('div.grow', h('div.ip-name', p.name), h('div.tiny.faint', `${L(p.dept_ar, p.dept_en)}${p.due_date ? ` · ${L('الاستحقاق', 'Due')} ${fmtDate(p.due_date)}` : ''}`),
      h('div.ip-prog', h('div.progress', { role: 'progressbar', 'aria-valuenow': p.progress ?? undefined, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('نسبة الإنجاز', 'Progress'), class: p.progress == null ? 'missing' : '' }, h('i', { style: { width: `${p.progress ?? 0}%` } })), h('span.tiny.tabular', p.progress == null ? L('غير محددة', 'Not reported') : `${fmtNum(p.progress)}%`))),
    icon('chevron', 'flip-rtl')));
}
function peopleBlock(d) {
  return h('section.is-sec.is-card', h('h3.is-h', icon('usersRound'), L('فريق الفكرة', 'People')),
    authorLine(d, { withDept: true }),
    d.coauthors?.length ? h('div.is-co', h('div.tiny.faint', L('شركاء في الفكرة', 'Co-authors')), d.coauthors.map((c) => h('div.idea-author.small', avatar(c.name_ar), h('span.grow', h('span.an', L(c.name_ar, c.name_en)), h('span.ad', L(c.dept_ar, c.dept_en)))))) : null,
    d.sponsor ? h('div.is-co', h('div.tiny.faint', L('راعي التنفيذ', 'Implementation sponsor')), h('div.idea-author.small', avatar(d.sponsor.name_ar), h('span.grow', h('span.an', L(d.sponsor.name_ar, d.sponsor.name_en)), h('span.ad', L(d.sponsor.title_ar, d.sponsor.title_en))))) : null);
}
function socialBlock(ctx, sh, d) {
  const follow = d.can.follow ? h(`button.btn.sm${d.following ? '.tertiary' : ''}`, { type: 'button', 'aria-pressed': String(!!d.following), onclick: async (e) => { const r = await act(e.currentTarget, () => call(`/ideas/${d.id}/follow`, { method: 'POST', body: { on: !d.following } })); if (r) { toast(r.following ? L('ستصلك تحديثات هذه الفكرة', 'You will get updates on this idea') : L('أُلغيت المتابعة', 'Unfollowed')); refresh(ctx, sh); } } }, icon('bell'), d.following ? L('تتابعها', 'Following') : L('متابعة', 'Follow')) : null;
  return h('section.is-sec.is-card.is-social',
    h('div.soc-row', voteButton(d, { size: 'lg' }), h('div.grow', h('div.soc-n', L('دعم الزملاء', 'Colleague support')), h('div.tiny.faint', d.mine ? L('لا يمكنك التصويت لفكرتك', 'You cannot vote for your own idea') : L('صوت واحد لكل موظف', 'One vote per person')))),
    follow ? h('div.soc-row', follow, h('span.tiny.faint', L('تحديثات فورية عند تغيّر المرحلة', 'Live updates when the stage changes'))) : null);
}
function contextBlock(d) {
  const rows = [
    d.campaign ? [L('التحدي', 'Challenge'), h('a', { href: `#/sys/ideas/challenges/${d.campaign.id}` }, L(d.campaign.title_ar, d.campaign.title_en))] : null,
    d.objective ? [L('الهدف الاستراتيجي', 'Strategic objective'), h('span', L(d.objective.title_ar, d.objective.title_en))] : null,
    [L('المرجع', 'Reference'), h('span.num', d.ref || '—')],
    [L('آخر تحديث', 'Last update'), dateTime(d.updated_at)],
  ].filter(Boolean);
  return h('section.is-sec.is-card', h('h3.is-h', icon('info'), L('السياق', 'Context')), h('dl.is-kv', rows.map(([k, v]) => h('div', h('dt', k), h('dd', v)))));
}

// ---------- comments ----------
function commentsBlock(ctx, sh, d) {
  const list = d.comments.length ? h('ol.is-comments', d.comments.map((c) => commentItem(ctx, sh, d, c))) : h('p.faint.tiny', L('لا تعليقات بعد — شارك بملاحظة بنّاءة.', 'No comments yet — share a constructive thought.'));
  let composer = null;
  if (d.can.comment) {
    const ta = h('textarea.field', { rows: 2, maxlength: 1500, 'data-keep': `cmt-${d.id}`, 'aria-label': L('اكتب تعليقاً', 'Write a comment'), placeholder: L('أضف ملاحظة أو اقتراحاً لتطوير الفكرة…', 'Add a note or suggestion to improve the idea…'), oninput: (e) => { S.drafts[d.id] = e.target.value; } }, S.drafts[d.id] || '');
    const send = h('button.btn.primary.sm', { type: 'button', onclick: async (e) => {
      const body = ta.value.trim();
      if (body.length < 2) { ta.focus(); return; }
      const r = await act(e.currentTarget, () => call(`/ideas/${d.id}/comments`, { method: 'POST', body: { body } }));
      if (r) { S.drafts[d.id] = ''; ta.value = ''; refresh(ctx, sh); }
    } }, icon('send'), L('إرسال', 'Send'));
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send.click(); });
    composer = h('div.is-composer', ta, h('div.ic-bar', h('span.tiny.faint', L('التعليقات مرئية لجميع الموظفين · Ctrl+Enter للإرسال', 'Comments are visible to all staff · Ctrl+Enter to send')), send));
  }
  return h('section.is-sec', h('h3.is-h', icon('messageSquare'), L('النقاش', 'Discussion'), h('span.count.tabular', fmtNum(d.comments.filter((c) => !c.hidden).length))), list, composer);
}
function commentItem(ctx, sh, d, c) {
  const who = c.user ? L(c.user.name_ar, c.user.name_en) : L('مقدّم الفكرة', 'The author');
  const tools = [
    c.can_delete ? h('button.icon-btn', { type: 'button', 'aria-label': L('حذف تعليقي', 'Delete my comment'), 'data-tip': L('حذف', 'Delete'), onclick: async () => {
      if (!(await confirmDialog(L('حذف التعليق؟', 'Delete comment?'), L('سيُحذف تعليقك من النقاش.', 'Your comment will be removed.'), { danger: true, confirmLabel: L('حذف', 'Delete') }))) return;
      const r = await act(null, () => call(`/ideas/${d.id}/comments/${c.id}`, { method: 'DELETE', body: { confirm: true } }));
      if (r) { toast(L('حُذف التعليق', 'Comment deleted')); refresh(ctx, sh); }
    } }, icon('trash')) : null,
    c.can_hide ? h('button.icon-btn', { type: 'button', 'aria-label': L('إخفاء التعليق (اللجنة)', 'Hide comment (committee)'), 'data-tip': L('إخفاء', 'Hide'), onclick: async () => { const r = await hideCommentDialog(d, c).catch((e) => { toast(e.message, { kind: 'error' }); return null; }); if (r) refresh(ctx, sh); } }, icon('eyeOff')) : null,
  ].filter(Boolean);
  return h(`li.is-comment${c.hidden ? '.hidden' : ''}${c.by_idea_author ? '.by-author' : ''}`,
    c.user ? avatar(c.user.name_ar) : h('span.anon-ic', { 'aria-hidden': 'true' }, icon('eyeOff')),
    h('div.grow',
      h('div.cm-head', h('strong', who), c.by_idea_author ? h('span.chip.tiny.purple', L('مقدّم الفكرة', 'Author')) : null, h('span.tiny.faint', dateTime(c.created_at)), tools.length ? h('span.cm-tools', tools) : null),
      c.hidden ? h('p.cm-hidden', icon('eyeOff'), h('span', L('أخفت اللجنة هذا التعليق', 'Hidden by the committee'), c.hidden_reason ? ` — ${c.hidden_reason}` : ''), c.body ? h('span.cm-orig', `«${c.body}»`) : null) : h('p.cm-body', c.body)));
}
void stLabel; void compactMoney;
