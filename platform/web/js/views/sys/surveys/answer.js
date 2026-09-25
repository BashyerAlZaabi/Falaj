// Surveys — respondent form: an intro with a clear privacy statement, one question
// per card with progress, a review step and a thank-you. Keyboard friendly (Enter
// to continue, digits to pick, native radio/checkbox semantics). The step lives in
// the hash (#/sys/surveys/answer/<id>/<step>); answers stay in memory until sent.
// Also used by the builder's preview (#/sys/surveys/build/<id>/preview/<step>).
import { h, icon, L, fmtNum, toast, emptyState, errorState, act, go, sysHeader, card, progress } from '../../../sys-kit.js';
import { celebrate } from '../../../game.js';
import { call, MIN_GROUP, TYPES, RATING_LABELS, anonChip, demoChip, leftChip, questionsLabel, minutesLabel, dateLabel, keepFocus } from './common.js';

const drafts = new Map();     // surveyId → { answers: {qid: value}, ack }
// One document-level key handler routed to the question card of the current
// hash, so keys typed while the view is being rebuilt (live data refresh) are
// never lost. It ignores keys aimed at other controls and at open dialogs.
const keys = { current: null, bound: false };
function bindKeys() {
  if (keys.bound) return;
  keys.bound = true;
  document.addEventListener('keydown', (e) => {
    const k = keys.current;
    if (!k || k.hash !== location.hash || e.defaultPrevented) return;
    const t = e.target;
    if (document.querySelector('.modal-wrap, .sys-sheet, .popover')) return;
    if (t !== document.body && t?.id !== 'view' && !k.el.contains(t) && !(t?.closest?.('.sv-qcard'))) return;
    k.fn(e);
  });
}
const completed = new Map();  // surveyId → submit result (for the thank-you step)
const cache = new Map();      // surveyId → { s, at }

export async function renderAnswer(root, ctx, id, step) {
  let s;
  try {
    const c = cache.get(id);
    s = !ctx.soft && c && Date.now() - c.at < 60e3 ? c.s : await call(`/surveys/${id}`);
    cache.set(id, { s, at: Date.now() });
  } catch (e) {
    root.append(sysHeader(ctx, { eyebrow: L('الإجابة عن استبيان', 'Answer a survey') }), card(null, e.status === 404
      ? emptyState({ icon: 'searchCheck', title: L('الاستبيان غير متاح', 'Survey not available'), body: L('قد لا يكون موجّهاً إليك أو لم يعد متاحاً.', 'It may not be addressed to you, or is no longer available.'), actions: [{ label: L('الاستبيانات بانتظاري', 'Surveys waiting for me'), primary: true, onClick: () => go(ctx, 'pending') }] })
      : errorState(e, () => go(ctx, 'answer', id))));
    return;
  }
  const restore = keepFocus();
  root.append(sysHeader(ctx, { eyebrow: L('الإجابة عن استبيان', 'Answer a survey'), title: s.title, sub: L(`من ${s.author?.dept_ar || ''}`, `From ${s.author?.dept_en || ''}`),
    badges: [anonChip(s), demoChip(s), s.is_open ? leftChip(s) : null].filter(Boolean),
    actions: [h('a.btn.ghost', { href: `#/sys/${ctx.key}/pending` }, icon('arrowLeft', 'flip-rtl'), L('الاستبيانات', 'Surveys'))] }));
  const done = completed.get(id);
  if (done && step === 'done') { root.append(thankYou(ctx, s, done)); return; }
  if (s.responded) { root.append(alreadyAnswered(ctx, s)); return; }
  if (!s.can?.respond) { root.append(notOpen(ctx, s)); return; }
  root.append(answerForm(ctx, s, { step }));
  restore(root);
}

// The form itself (live or preview).
export function answerForm(ctx, s, { preview = false, step } = {}) {
  const qs = s.sections.flatMap((sec, si) => sec.questions.map((q) => ({ ...q, section: sec, si })));
  const key = preview ? `preview:${s.id}` : s.id;
  if (!drafts.has(key)) drafts.set(key, { answers: {}, ack: false });
  const d = drafts.get(key);
  const base = preview ? `#/sys/${ctx.key}/build/${s.id}/preview` : `#/sys/${ctx.key}/answer/${s.id}`;
  const nav = (x) => { location.hash = `${base}/${x}`; };
  const n = qs.length;
  const idx = /^\d+$/.test(step || '') ? Math.min(n, Math.max(1, Number(step))) : null;
  const isAnswered = (q) => { const v = d.answers[q.id]; return !(v == null || v === '' || (Array.isArray(v) && !v.length)); };
  const missing = () => qs.filter((q) => q.required && !isAnswered(q));

  const wrap = h('div.sv-answer');
  const mainCol = h('div.sv-answer-main');
  const aside = h('aside.sv-answer-nav', { 'aria-label': L('أسئلة الاستبيان', 'Survey questions') });
  const drawAside = () => aside.replaceChildren(
    h('div.sv-nav-head', h('span.eyebrow', L('تقدّمك', 'Your progress')), h('strong.num.tabular', `${fmtNum(qs.filter(isAnswered).length)} / ${fmtNum(n)}`)),
    progress(n ? (100 * qs.filter(isAnswered).length) / n : 0, { label: L('نسبة الإجابة', 'Answered') }),
    h('ol.sv-nav-list', qs.map((q, i) => h(`li${idx === i + 1 ? '.on' : ''}${isAnswered(q) ? '.ok' : ''}`,
      h('a', { href: `${base}/${i + 1}`, 'aria-current': idx === i + 1 ? 'step' : null },
        h('span.sv-nav-dot.num', isAnswered(q) ? icon('check') : fmtNum(i + 1)), h('span.sv-nav-t', q.text), q.required ? null : h('span.tiny.faint', L('اختياري', 'optional')))))),
    h('a.btn.sm.ghost.block', { href: `${base}/review` }, icon('listChecks'), L('مراجعة وإرسال', 'Review & send')));
  drawAside();

  if (idx == null && step === 'review') mainCol.append(review());
  else if (idx == null) mainCol.append(intro());
  else mainCol.append(questionCard(qs[idx - 1], idx));
  wrap.append(mainCol);
  if (idx != null || step === 'review') wrap.append(aside);
  return wrap;

  // ---------- intro ----------
  function intro() {
    const ack = h('input', { type: 'checkbox', id: `sv-ack-${s.id}`, checked: d.ack || null, onchange: (e) => { d.ack = e.target.checked; startBtn.disabled = !s.anonymous && !d.ack; } });
    const startBtn = h('button.btn.primary.lg', { type: 'button', 'data-focus-key': 'start', disabled: !s.anonymous && !d.ack ? true : null, onclick: () => nav(1) }, L('ابدأ', 'Start'), icon('arrowRight', 'flip-rtl'));
    return h('section.card.sv-intro',
      preview ? h('div.sv-preview-flag', icon('eye'), L('معاينة', 'Preview')) : null,
      h('div.sv-intro-head',
        h('div.sv-intro-ic', icon('clipboardList')),
        h('div.grow', h('span.eyebrow', L(s.author?.dept_ar || '', s.author?.dept_en || '')), h('h2', s.title), s.description ? h('p', s.description) : null)),
      h('ul.sv-meta', h('li', icon('listChecks'), questionsLabel(n)), h('li', icon('clock'), minutesLabel(s.est_minutes)), h('li', icon('calendar'), L(`يُغلق ${dateLabel(s.closes_on)}`, `Closes ${dateLabel(s.closes_on)}`)), h('li', icon('layers'), L(`${fmtNum(s.sections.length)} أقسام`, `${s.sections.length} sections`))),
      s.anonymous
        ? h('div.sv-promise', h('div.sv-promise-ic', icon('shield')), h('div',
          h('strong', L('إجاباتك مجهولة الهوية', 'Your answers are anonymous')),
          h('ul',
            h('li', L('لا تُحفظ هويتك مع إجاباتك. تُسجَّل مشاركتك في سجل منفصل فقط لمنع التكرار وحساب نسبة الاستجابة.', 'Your identity is never stored with your answers. Participation is recorded separately, only to prevent duplicates and compute the response rate.')),
            h('li', L(`لا تظهر أي نتيجة قبل وصول الإجابات إلى ${MIN_GROUP}، وتُحدَّث على دفعات من ${MIN_GROUP}.`, `No result appears before ${MIN_GROUP} responses, and results update in batches of ${MIN_GROUP}.`)),
            h('li', L('قد يطّلع مُعِدّ الاستبيان على التعليقات النصية مجمّعة ودون أي بيانات تعريفية — تجنّب ذكر ما يكشف هويتك.', 'The author may read open-text comments pooled with no identifying data — avoid writing anything that identifies you.')))))
        : h('div.sv-promise.warn', h('div.sv-promise-ic', icon('user')), h('div',
          h('strong', L('هذا الاستبيان غير مجهول الهوية', 'This survey is NOT anonymous')),
          h('ul',
            h('li', L('تُحفظ إجابتك مرتبطة باسمك، ويمكنك مراجعتها لاحقاً من «مشاركاتي».', 'Your answer is stored with your name; you can review it later in “My responses”.')),
            h('li', L('يطّلع مُعِدّ الاستبيان على قائمة من شارك ومن لم يشارك.', 'The author can see who has and has not responded.')),
            h('li', L(`تُعرض النتائج مجمّعة فقط (${MIN_GROUP} مشاركين على الأقل).`, `Results are shown aggregated only (${MIN_GROUP}+ respondents).`))),
          h('label.check-label.sv-ack', { for: `sv-ack-${s.id}` }, ack, L('فهمت ذلك وأرغب في المتابعة', 'I understand and want to continue')))),
      h('div.sv-intro-foot', startBtn, h('span.tiny.faint', L('تبقى إجاباتك في هذه النافذة حتى ترسلها.', 'Your answers stay in this window until you send them.'))));
  }

  // ---------- one question ----------
  function questionCard(q, i) {
    const err = h('div.error-text.sv-q-err', { id: `err-${q.id}`, 'aria-live': 'polite' });
    const headingId = `qh-${q.id}`;
    const next = () => {
      if (!preview && q.required && !isAnswered(q)) { err.textContent = L('هذا السؤال مطلوب — اختر إجابة للمتابعة', 'This question is required — answer to continue'); body.querySelector('input,textarea')?.focus(); return; }
      nav(i < n ? i + 1 : 'review');
    };
    const onChange = () => { err.textContent = ''; drawAside(); nextBtn.textContent = ''; nextBtn.append(...nextLabel()); };
    const nextLabel = () => (i < n ? [L('التالي', 'Next'), icon('arrowRight', 'flip-rtl')] : [L('مراجعة الإجابات', 'Review answers'), icon('listChecks')]);
    const nextBtn = h('button.btn.primary', { type: 'button', 'data-focus-key': `next-${q.id}`, onclick: next }, ...nextLabel());
    const control = controlFor(q, d, onChange);
    const body = h('div.sv-q-control', control);
    const sec = q.section; const firstInSection = qs.findIndex((x) => x.section.id === sec.id) === i - 1;
    const onKey = (e) => {
      const inText = e.target.matches?.('textarea, input[type=text]');
      if (e.key === 'Enter' && !e.shiftKey && (!inText || e.ctrlKey || e.metaKey) && !e.target.matches?.('button, a')) { e.preventDefault(); next(); return; }
      if (!inText && /^[0-9]$/.test(e.key) && !e.altKey && !e.ctrlKey && !e.metaKey) digitPick(q, e.key, el, onChange) && e.preventDefault();
    };
    const el = h('section.card.sv-qcard', { 'aria-labelledby': headingId },
    preview ? h('div.sv-preview-flag', icon('eye'), L('معاينة', 'Preview')) : null,
    h('div.sv-q-progress', h('span.num.tabular', L(`السؤال ${fmtNum(i)} من ${fmtNum(n)}`, `Question ${i} of ${n}`)), progress((100 * (i - 1)) / n, { label: L('التقدّم', 'Progress') }), h('span.sv-q-sec', q.section.title)),
    firstInSection && q.section.description ? h('p.sv-sec-intro', icon('info'), q.section.description) : null,
    h('h2.sv-q-title', { id: headingId, tabindex: -1, 'data-focus-key': `title-${q.id}` }, q.text, q.required ? h('span.sv-req', { 'aria-label': L('إلزامي', 'required') }, ' *') : h('span.sv-opt', L(' (اختياري)', ' (optional)'))),
    q.help ? h('p.sv-q-help', q.help) : null,
    body, err,
    h('footer.sv-q-foot',
      i > 1 ? h('button.btn.ghost', { type: 'button', onclick: () => nav(i - 1) }, icon('arrowLeft', 'flip-rtl'), L('السابق', 'Back')) : h('button.btn.ghost', { type: 'button', onclick: () => nav('intro') }, icon('arrowLeft', 'flip-rtl'), L('التمهيد', 'Intro')),
      h('span.grow'),
      !q.required && !isAnswered(q) ? h('button.btn.ghost', { type: 'button', onclick: () => nav(i < n ? i + 1 : 'review') }, L('تخطٍّ', 'Skip')) : null,
      nextBtn),
    h('p.sv-kbd-hint', icon('keyboard'), hintFor(q)));
    keys.current = { hash: location.hash, el, fn: onKey };
    bindKeys();
    // Put focus on the question (screen readers announce it; digits/Enter work at once)
    // unless the person is already interacting with something meaningful.
    requestAnimationFrame(() => { const a = document.activeElement; if (!el.isConnected || el.contains(a)) return; if (!a || a === document.body || a.id === 'view') el.querySelector(`#${headingId}`)?.focus({ preventScroll: true }); });
    return el;
  }

  // ---------- review ----------
  function review() {
    const miss = missing();
    const submitBtn = h('button.btn.primary.lg', { type: 'button', disabled: (!preview && miss.length) || null, onclick: async () => {
      if (preview) { toast(L('معاينة فقط — لا تُرسل الإجابات', 'Preview only — nothing is sent'), { kind: 'info' }); return; }
      const answers = Object.fromEntries(Object.entries(d.answers).filter(([, v]) => !(v == null || v === '' || (Array.isArray(v) && !v.length))));
      const r = await act(submitBtn, () => call(`/surveys/${s.id}/responses`, { method: 'POST', body: { answers } }));
      if (!r) return;
      completed.set(s.id, r); drafts.delete(key); cache.delete(s.id);
      nav('done');
    } }, icon('send'), L('إرسال الإجابات', 'Send answers'));
    return h('section.card.sv-review',
      preview ? h('div.sv-preview-flag', icon('eye'), L('معاينة', 'Preview')) : null,
      h('div.card-head', h('h2.card-title', L('راجع إجاباتك قبل الإرسال', 'Review before sending')), h(`span.chip.tiny.${miss.length ? 'warn' : 'good'}`, icon(miss.length ? 'circleAlert' : 'circleCheck'), miss.length ? L(`${fmtNum(miss.length)} إلزامي دون إجابة`, `${miss.length} required unanswered`) : L('مكتمل', 'Complete'))),
      h('ol.sv-review-list', qs.map((q, i) => h(`li${q.required && !isAnswered(q) ? '.missing' : ''}`,
        h('span.sv-q-num.num', fmtNum(i + 1)),
        h('div.grow', h('div.sv-rv-q', q.text), h('div.sv-rv-a', isAnswered(q) ? answerText(q, d.answers[q.id]) : q.required ? L('مطلوب — لم تُجب بعد', 'Required — not answered') : L('تخطيت هذا السؤال', 'Skipped'))),
        h('a.btn.sm.ghost', { href: `${base}/${i + 1}` }, icon('pencil'), L('تعديل', 'Edit'))))),
      h('div.sv-review-foot',
        h('p.tiny.faint', icon(s.anonymous ? 'shield' : 'user'), s.anonymous ? L('بعد الإرسال لا يمكن تعديل الإجابات أو استرجاعها، لأنها لا ترتبط بهويتك.', 'Once sent, answers cannot be changed or retrieved — they are not linked to you.') : L('بعد الإرسال تُحفظ إجابتك مرتبطة باسمك ويمكنك مراجعتها من «مشاركاتي».', 'Once sent, your answer is stored with your name; review it in “My responses”.')),
        submitBtn));
  }
}

function hintFor(q) {
  if (q.type === 'rating') return L('اضغط من 1 إلى 5 للتقييم · Enter للمتابعة', 'Press 1–5 to rate · Enter to continue');
  if (q.type === 'nps') return L('اضغط من 0 إلى 9 أو استخدم الأسهم · Enter للمتابعة', 'Press 0–9 or use arrows · Enter to continue');
  if (q.type === 'yesno') return L('1 = نعم · 2 = لا · Enter للمتابعة', '1 = yes · 2 = no · Enter to continue');
  if (q.type === 'single' || q.type === 'multi') return L('اضغط رقم الخيار للاختيار · Enter للمتابعة', 'Press an option’s number · Enter to continue');
  return L('Ctrl + Enter للمتابعة', 'Ctrl + Enter to continue');
}
function digitPick(q, k, el, onChange) {
  const num = Number(k);
  let input = null;
  if (q.type === 'rating' && num >= 1 && num <= 5) input = el.querySelector(`input[value="${num}"]`);
  else if (q.type === 'nps') input = el.querySelector(`input[value="${num}"]`);
  else if (q.type === 'yesno' && (num === 1 || num === 2)) input = el.querySelector(`input[value="${num === 1 ? 'yes' : 'no'}"]`);
  else if ((q.type === 'single' || q.type === 'multi') && num >= 1) input = el.querySelectorAll('input')[num - 1];
  if (!input) return false;
  if (input.type === 'checkbox') input.checked = !input.checked; else input.checked = true;
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.focus();
  void onChange;
  return true;
}
function answerText(q, v) {
  if (q.type === 'single' || q.type === 'multi') return (Array.isArray(v) ? v : [v]).map((id) => q.options.find((o) => o.id === id)?.label).filter(Boolean).join(L('، ', ', '));
  if (q.type === 'yesno') return v ? L('نعم', 'Yes') : L('لا', 'No');
  if (q.type === 'rating') return `${fmtNum(v)}/5 — ${L(...RATING_LABELS[v - 1])}`;
  if (q.type === 'nps') return `${fmtNum(v)}/10`;
  return String(v);
}

// Accessible controls built on native inputs (radio groups get arrow keys for free).
function controlFor(q, d, onChange) {
  const name = `sv-${q.id}`;
  const set = (v) => { d.answers[q.id] = v; onChange(); };
  const cur = d.answers[q.id];
  const labelled = { 'aria-labelledby': `qh-${q.id}`, 'aria-describedby': `err-${q.id}` };
  switch (q.type) {
    case 'single': return h('div.sv-choices', { role: 'radiogroup', ...labelled }, q.options.map((o, i) => h('label.sv-choice',
      h('input', { type: 'radio', name, value: o.id, checked: cur === o.id || null, 'data-focus-key': `${q.id}-${o.id}`, onchange: (e) => { if (e.target.checked) { set(o.id); mark(e.target); } } }),
      h('span.sv-choice-mark', { 'aria-hidden': 'true' }), h('span.grow', o.label), h('kbd.sv-kbd', { 'aria-hidden': 'true' }, String(i + 1)))));
    case 'multi': return h('div.sv-choices', { role: 'group', ...labelled }, q.options.map((o, i) => h('label.sv-choice.multi',
      h('input', { type: 'checkbox', value: o.id, checked: (cur || []).includes(o.id) || null, 'data-focus-key': `${q.id}-${o.id}`, onchange: (e) => { const list = new Set(d.answers[q.id] || []); e.target.checked ? list.add(o.id) : list.delete(o.id); set(q.options.map((x) => x.id).filter((x) => list.has(x))); mark(e.target); } }),
      h('span.sv-choice-mark', { 'aria-hidden': 'true' }, icon('check')), h('span.grow', o.label), h('kbd.sv-kbd', { 'aria-hidden': 'true' }, String(i + 1)))));
    case 'rating': return h('div.sv-rating', { role: 'radiogroup', ...labelled }, [1, 2, 3, 4, 5].map((v) => h('label.sv-rate',
      h('input', { type: 'radio', name, value: String(v), checked: cur === v || null, 'data-focus-key': `${q.id}-${v}`, onchange: (e) => { if (e.target.checked) { set(v); mark(e.target, true); } } }),
      h('span.sv-rate-face', { 'aria-hidden': 'true' }, h('span.sv-stars', Array.from({ length: v }, () => icon('star'))), h('b.num', String(v))),
      h('span.sv-rate-l', L(...RATING_LABELS[v - 1])))));
    case 'nps': return h('div.sv-nps-wrap',
      h('div.sv-nps', { role: 'radiogroup', ...labelled }, Array.from({ length: 11 }, (_, v) => h(`label.sv-nps-n.${v <= 6 ? 'd' : v <= 8 ? 'p' : 'pr'}`,
        h('input', { type: 'radio', name, value: String(v), checked: cur === v || null, 'data-focus-key': `${q.id}-${v}`, 'aria-label': String(v), onchange: (e) => { if (e.target.checked) { set(v); mark(e.target, true); } } }),
        h('span.num', String(v))))),
      h('div.sv-nps-ends', h('span', L('0 — غير مرجّح إطلاقاً', '0 — Not at all likely')), h('span', L('10 — مرجّح جداً', '10 — Extremely likely'))));
    case 'yesno': return h('div.sv-yesno', { role: 'radiogroup', ...labelled }, [['yes', true, 'thumbsUp', 'نعم', 'Yes'], ['no', false, 'thumbsDown', 'لا', 'No']].map(([val, b, ic, ar, en]) => h('label.sv-yn',
      h('input', { type: 'radio', name, value: val, checked: cur === b || null, 'data-focus-key': `${q.id}-${val}`, onchange: (e) => { if (e.target.checked) { set(b); mark(e.target, true); } } }),
      h('span.sv-yn-ic', { 'aria-hidden': 'true' }, icon(ic)), h('span', L(ar, en)))));
    case 'text': {
      const counter = h('span.tiny.faint.num', `${fmtNum((cur || '').length)} / 2000`);
      return h('div.sv-text',
        h('textarea.field', { rows: 5, maxlength: 2000, 'data-focus-key': `${q.id}-text`, placeholder: L('اكتب رأيك هنا…', 'Write your thoughts here…'), ...labelled, oninput: (e) => { d.answers[q.id] = e.target.value; counter.textContent = `${fmtNum(e.target.value.length)} / 2000`; onChange(); } }, cur || ''),
        h('div.sv-text-foot', h('span.tiny.faint', icon('shield'), L('لا تذكر أسماء أو تفاصيل تكشف هويتك أو هوية غيرك.', 'Do not include names or details that identify you or others.')), counter));
    }
    default: return h('p', TYPES[q.type]?.ar || q.type);
  }
}
// Visual selection state (CSS :has() also covers it; this keeps older engines right).
function mark(input, single = input.type === 'radio') {
  const group = input.closest('.sv-choices, .sv-rating, .sv-nps, .sv-yesno');
  if (single) group?.querySelectorAll('label').forEach((l) => l.classList.toggle('on', l.contains(input)));
  else input.closest('label')?.classList.toggle('on', input.checked);
}

function thankYou(ctx, s, r) {
  const el = h('section.card.sv-done',
    h('div.sv-done-ic', icon('checkCheck')),
    h('h2', L('شكراً لمشاركتك', 'Thank you for taking part')),
    h('p', r.anonymous ? L('وصلت إجاباتك دون أي ربط بهويتك. سيطّلع المُعِدّ على النتائج مجمّعة فقط.', 'Your answers arrived with no link to your identity. The author only sees aggregated results.') : L('حُفظت إجابتك، ويمكنك مراجعتها من «مشاركاتي».', 'Your answer was saved; review it in “My responses”.')),
    h('span.chip.purple.sv-points', icon('sparkle'), L(`+${fmtNum(r.points || 3)} نقاط تميّز`, `+${r.points || 3} excellence points`)),
    h('div.btn-group',
      r.next ? h('a.btn.primary', { href: `#/sys/${ctx.key}/answer/${r.next.id}` }, L(`الاستبيان التالي: ${r.next.title}`, `Next survey: ${r.next.title}`), icon('arrowRight', 'flip-rtl')) : h('a.btn.primary', { href: `#/sys/${ctx.key}/pending` }, L('العودة إلى الاستبيانات', 'Back to surveys')),
      h('a.btn.ghost', { href: `#/sys/${ctx.key}/answered` }, L('مشاركاتي', 'My responses'))));
  if (!ctx.soft) requestAnimationFrame(() => { el.querySelector('.btn.primary')?.focus({ preventScroll: true }); try { celebrate(el.querySelector('.sv-done-ic')); } catch { /* optional */ } });
  void s;
  return el;
}
function alreadyAnswered(ctx, s) {
  return card(null, emptyState({ icon: 'circleCheck', title: L('شاركت في هذا الاستبيان', 'You have answered this survey'),
    body: s.anonymous ? L('يُقبل رد واحد لكل موظف. إجابتك غير مرتبطة بهويتك لذلك لا يمكن تعديلها أو عرضها.', 'One response per person. Your answer is not linked to you, so it cannot be edited or shown.') : L('يُقبل رد واحد لكل موظف. يمكنك مراجعة إجابتك من «مشاركاتي».', 'One response per person. Review your answer in “My responses”.'),
    actions: [s.results_available ? { label: L('عرض النتائج', 'View results'), primary: true, onClick: () => go(ctx, 'results', s.id) } : { label: L('مشاركاتي', 'My responses'), primary: true, onClick: () => go(ctx, 'answered') }] }));
}
function notOpen(ctx, s) {
  const author = s.role === 'author' || s.role === 'overseer';
  const [title, body] = s.status === 'closed' ? [L('أُغلق الاستبيان', 'This survey is closed'), L('لم يعد يستقبل إجابات.', 'It no longer accepts responses.')]
    : s.scheduled ? [L('لم يُفتح بعد', 'Not open yet'), L(`يُفتح للإجابة في ${dateLabel(s.opens_on)}.`, `Opens on ${dateLabel(s.opens_on)}.`)]
      : s.status === 'draft' ? [L('الاستبيان مسودة', 'This survey is a draft'), L('استخدم المعاينة لتجربة الأسئلة.', 'Use the preview to try the questions.')]
        : [L('هذا الاستبيان غير موجّه إليك', 'Not addressed to you'), L('يمكنك متابعته من النتائج إن كنت مُعِدّه.', 'Follow it from the results if you are its author.')];
  return card(null, emptyState({ icon: 'lock', title, body, actions: [author ? { label: s.status === 'draft' ? L('المعاينة', 'Preview') : L('النتائج', 'Results'), primary: true, onClick: () => (s.status === 'draft' ? go(ctx, 'build', s.id, 'preview') : go(ctx, 'results', s.id)) } : { label: L('الاستبيانات بانتظاري', 'Surveys waiting for me'), primary: true, onClick: () => go(ctx, 'pending') }] }));
}
