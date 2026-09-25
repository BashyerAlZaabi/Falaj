// Surveys — builder: sections and questions (add, edit, reorder, delete), survey
// settings, a publish-readiness checklist and a live preview of the respondent form.
// Route: #/sys/surveys/build/<id>[/preview]
import { h, icon, L, fmtNum, toast, modal, confirmDialog, emptyState, errorState, act, go, sysHeader, card } from '../../../sys-kit.js';
import { call, TYPES, typeChip, surveyStatus, anonChip, demoChip, questionsLabel, minutesLabel, dateLabel, keepFocus, ring, pctText } from './common.js';
import { settingsDialog, closeSurveyFlow } from './lists.js';
import { answerForm } from './answer.js';

export async function renderBuilder(root, ctx, id, mode) {
  let s;
  try { s = await call(`/surveys/${id}`); }
  catch (e) {
    root.append(sysHeader(ctx, { eyebrow: L('منشئ الاستبيان', 'Survey builder') }), card(null, e.status === 404 ? emptyState({ icon: 'searchCheck', title: L('الاستبيان غير متاح', 'Survey not available'), body: L('قد يكون حُذف أو لا يحق لك الاطلاع عليه.', 'It may have been deleted, or you may not have access.'), actions: [{ label: L('استبياناتي', 'My surveys'), onClick: () => go(ctx, 'mine') }] }) : errorState(e, () => go(ctx, 'build', id))));
    return;
  }
  const restore = keepFocus();
  const author = s.role === 'author';
  const editable = !!s.can?.edit;
  const preview = mode === 'preview';
  const actions = [
    h('a.btn.ghost', { href: `#/sys/${ctx.key}/${author ? 'mine' : 'pending'}` }, icon('arrowLeft', 'flip-rtl'), author ? L('استبياناتي', 'My surveys') : L('الاستبيانات', 'Surveys')),
    { label: preview ? L('العودة للتحرير', 'Back to editing') : L('معاينة', 'Preview'), icon: preview ? 'pencil' : 'eye', href: `#/sys/${ctx.key}/build/${s.id}${preview ? '' : '/preview'}` },
    s.can?.publish ? { label: L('نشر الاستبيان', 'Publish'), icon: 'send', primary: true, disabled: !(s.checklist || []).every((c) => c.ok), onClick: (e) => publishFlow(e.currentTarget, ctx, s) } : null,
    !s.can?.publish && s.can?.results ? { label: L('النتائج', 'Results'), icon: 'chartBar', primary: true, href: `#/sys/${ctx.key}/results/${s.id}` } : null,
  ].filter(Boolean);
  root.append(sysHeader(ctx, {
    eyebrow: preview ? L('معاينة الاستبيان', 'Survey preview') : L('منشئ الاستبيان', 'Survey builder'), title: s.title,
    sub: s.description || L(s.audience_ar, s.audience_en), actions,
    badges: [surveyStatus(s), anonChip(s), demoChip(s)],
  }));
  if (preview) {
    root.append(h('div.callout.sv-strip', icon('eye'), h('span.grow', L('هكذا يرى الموظف الاستبيان. الإجابات في المعاينة لا تُحفظ ولا تُرسل.', 'This is what staff will see. Answers in preview are neither saved nor sent.'))));
    const qs = s.sections.flatMap((x) => x.questions.map((q) => ({ ...q, section: x })));
    if (!qs.length) { root.append(card(null, emptyState({ icon: 'listChecks', title: L('لا أسئلة للمعاينة', 'Nothing to preview'), body: L('أضف سؤالاً أولاً.', 'Add a question first.'), actions: [{ label: L('العودة للتحرير', 'Back to editing'), primary: true, onClick: () => go(ctx, 'build', s.id) }] }))); return; }
    root.append(answerForm(ctx, s, { preview: true, step: ctx.params[3] }));
    return;
  }
  if (!editable) {
    root.append(h('div.callout.sv-strip', icon('lock'), h('span.grow', author ? L('نُشر الاستبيان؛ تُقفل الأسئلة والأقسام حفاظاً على اتساق النتائج. يمكنك تعديل الوصف وتاريخ الإغلاق من الإعدادات.', 'Published: questions and sections are locked to keep results consistent. You can still edit the description and close date in settings.') : L('اطلاع فقط — يعدّل الاستبيانَ مُعِدُّه.', 'View only — only the author can edit.'))));
  }
  const qCount = s.sections.reduce((a, x) => a + x.questions.length, 0);
  const main = h('div.sv-build-main',
    s.sections.map((sec, si) => sectionCard(ctx, s, sec, si, editable)),
    editable ? h('button.sv-add-section', { type: 'button', 'data-focus-key': 'add-section', onclick: () => addSection(s) }, icon('circlePlus'), L('إضافة قسم', 'Add section')) : null,
    !qCount && editable ? h('p.tiny.faint.sv-center', L('ابدأ بإضافة سؤال إلى القسم الأول. يُفضّل ألا يتجاوز الاستبيان 10 أسئلة.', 'Start by adding a question to the first section. Keep it under 10 questions.')) : null);
  const side = h('aside.sv-side.sv-sticky', settingsCard(ctx, s), s.checklist ? readinessCard(s) : statsCard(ctx, s), editable ? tipsCard() : null);
  root.append(h('div.sv-layout.builder', main, side));
  restore(root);
}

function sectionCard(ctx, s, sec, si, editable) {
  const n = s.sections.length;
  const offset = s.sections.slice(0, si).reduce((a, x) => a + x.questions.length, 0);
  return h('section.card.sv-section', { 'aria-labelledby': `sec-${sec.id}` },
    h('header.sv-section-head',
      h('div.grow', h('span.eyebrow', L(`القسم ${fmtNum(si + 1)} من ${fmtNum(n)}`, `Section ${si + 1} of ${n}`)), h('h2', { id: `sec-${sec.id}` }, sec.title), sec.description ? h('p.tiny.faint', sec.description) : null),
      editable ? h('div.sv-tools',
        tool('chevronUp', L('نقل القسم لأعلى', 'Move section up'), si === 0, () => moveSection(s, sec, 'up'), `sec-up-${sec.id}`),
        tool('chevronDown', L('نقل القسم لأسفل', 'Move section down'), si === n - 1, () => moveSection(s, sec, 'down'), `sec-down-${sec.id}`),
        tool('pencil', L('تعديل القسم', 'Edit section'), false, () => editSection(s, sec), `sec-edit-${sec.id}`),
        tool('trash', L('حذف القسم', 'Delete section'), n <= 1, () => deleteSection(s, sec), `sec-del-${sec.id}`)) : null),
    sec.questions.length
      ? h('ol.sv-qlist', sec.questions.map((q, qi) => questionItem(s, sec, q, offset + qi, editable, si === 0 && qi === 0, si === n - 1 && qi === sec.questions.length - 1)))
      : h('div.sv-q-empty', icon('listChecks'), h('span', L('لا أسئلة في هذا القسم بعد', 'No questions in this section yet'))),
    editable ? h('div.sv-section-foot', h('button.btn.sm.tertiary', { type: 'button', 'data-focus-key': `add-q-${sec.id}`, onclick: () => addQuestionFlow(s, sec) }, icon('plus'), L('إضافة سؤال', 'Add question'))) : null);
}
function tool(ic, label, disabled, onClick, key) {
  return h('button.icon-btn', { type: 'button', 'aria-label': label, 'data-tip': label, disabled: disabled || null, 'data-focus-key': key, onclick: onClick }, icon(ic));
}
function questionItem(s, sec, q, index, editable, first, last) {
  return h('li.sv-q',
    h('span.sv-q-num.num', fmtNum(index + 1)),
    h('div.sv-q-body',
      h('div.sv-q-chips', typeChip(q.type), q.required ? h('span.chip.tiny.outline', L('إلزامي', 'Required')) : h('span.chip.tiny.sand', L('اختياري', 'Optional'))),
      h('h3.sv-q-text', q.text),
      q.help ? h('p.tiny.faint', q.help) : null,
      q.options?.length ? h('ul.sv-q-opts', q.options.map((o) => h('li', h('i', { 'aria-hidden': 'true', class: q.type === 'multi' ? 'sq' : '' }), o.label))) : previewScale(q)),
    editable ? h('div.sv-tools.vertical',
      tool('chevronUp', L('نقل لأعلى', 'Move up'), first, () => moveQuestion(s, q, 'up'), `q-up-${q.id}`),
      tool('chevronDown', L('نقل لأسفل', 'Move down'), last, () => moveQuestion(s, q, 'down'), `q-down-${q.id}`),
      tool('pencil', L('تعديل السؤال', 'Edit question'), false, () => editQuestionFlow(s, q), `q-edit-${q.id}`),
      tool('trash', L('حذف السؤال', 'Delete question'), false, () => deleteQuestion(s, q), `q-del-${q.id}`)) : null);
}
function previewScale(q) {
  if (q.type === 'rating') return h('div.sv-q-scale', [1, 2, 3, 4, 5].map((i) => h('span', icon('star'))));
  if (q.type === 'nps') return h('div.sv-q-scale.nps', Array.from({ length: 11 }, (_, i) => h('span.num', String(i))));
  if (q.type === 'yesno') return h('div.sv-q-scale.yn', h('span', L('نعم', 'Yes')), h('span', L('لا', 'No')));
  if (q.type === 'text') return h('div.sv-q-textline', L('مساحة للرأي بكلمات المشارك…', 'Room for comments…'));
  return null;
}

function settingsCard(ctx, s) {
  return h('section.card.sv-settings-card',
    h('div.card-head', h('h2.card-title', L('إعدادات الاستبيان', 'Survey settings')),
      s.can?.settings ? h('button.btn.sm.ghost', { type: 'button', 'data-focus-key': 'settings', onclick: () => editSettings(s) }, icon('sliders'), L('تعديل', 'Edit')) : null),
    h('dl.sys-kv',
      h('dt', L('الجمهور', 'Audience')), h('dd', L(s.audience_ar, s.audience_en)),
      h('dt', L('الخصوصية', 'Privacy')), h('dd', anonChip(s)),
      h('dt', L('الفترة', 'Window')), h('dd', `${dateLabel(s.opens_on)} – ${dateLabel(s.closes_on)}`),
      h('dt', L('الأسئلة', 'Questions')), h('dd', `${questionsLabel(s.question_count)} · ${minutesLabel(s.est_minutes)}`),
      h('dt', L('مشاركة النتائج', 'Sharing')), h('dd', s.share_results ? L('مع المشاركين بعد الإغلاق', 'With participants after closing') : L('للمُعِدّ فقط', 'Author only')),
      h('dt', L('المُعِدّ', 'Author')), h('dd', `${L(s.author?.name_ar, s.author?.name_en)} · ${L(s.author?.dept_ar || '', s.author?.dept_en || '')}`)));
}
function readinessCard(s) {
  const ok = s.checklist.every((c) => c.ok);
  return h('section.card.sv-ready',
    h('div.card-head', h('h2.card-title', L('جاهزية النشر', 'Ready to publish')), h(`span.chip.tiny.${ok ? 'good' : 'warn'}`, icon(ok ? 'circleCheck' : 'circleAlert'), ok ? L('جاهز', 'Ready') : L(`${s.checklist.filter((c) => !c.ok).length} متبقٍ`, `${s.checklist.filter((c) => !c.ok).length} left`))),
    h('ul.sv-check', s.checklist.map((c) => h(`li.${c.ok ? 'ok' : 'todo'}`, icon(c.ok ? 'circleCheck' : 'circleDashed'), h('span', L(c.ar, c.en))))),
    h('button.btn.tertiary.block', { type: 'button', disabled: ok ? null : true, onclick: (e) => publishFlow(e.currentTarget, null, s) }, icon('send'), ok ? L('نشر الاستبيان', 'Publish survey') : L('أكمل البنود أعلاه للنشر', 'Complete the items above to publish')),
    h('p.tiny.faint', L('بعد النشر تُقفل الأسئلة والجمهور وإعداد الهوية، ويصل تنبيه للمدعوين.', 'Publishing locks questions, audience and anonymity, and alerts everyone invited.')));
}
function statsCard(ctx, s) {
  const st = s.stats || {};
  return h('section.card.sv-ready',
    h('div.card-head', h('h2.card-title', L('المشاركة', 'Participation'))),
    h('div.sv-mini-stat', ring(st.rate ?? 0, { size: 84, stroke: 8, label: pctText(st.rate), sub: L('استجابة', 'response') }),
      h('div', h('strong.num.tabular', `${fmtNum(st.responded ?? 0)} / ${fmtNum(st.eligible ?? 0)}`), h('span.tiny.faint', L('شاركوا من المدعوين', 'invited took part')))),
    s.can?.results ? h('a.btn.tertiary.block', { href: `#/sys/${ctx.key}/results/${s.id}` }, icon('chartBar'), L('فتح النتائج', 'Open results')) : null,
    s.can?.close ? h('button.btn.destructive-soft.block', { type: 'button', onclick: () => closeSurveyFlow(s) }, icon('lock'), L('إغلاق الاستبيان', 'Close survey')) : null);
}
function tipsCard() {
  return h('section.card.sv-tips',
    h('div.card-head', h('span.sv-privacy-ic', icon('lightbulb')), h('h2.card-title', L('لاستبيان فعّال', 'For a good survey'))),
    h('ul',
      h('li', L('اجعله قصيراً: 10 أسئلة أو أقل ترفع معدل الاستجابة.', 'Keep it short: 10 questions or fewer lift response rates.')),
      h('li', L('في الاستبيان المجهول لا تسأل عن الإدارة أو المسمى أو العمر — يُحسب التحليل حسب الإدارة تلقائياً وبأمان.', 'In anonymous surveys never ask for department, title or age — department analysis is done automatically and safely.')),
      h('li', L('ضع السؤال النصي المفتوح في النهاية واجعله اختيارياً.', 'Put the open-text question last and make it optional.'))));
}

// ---------------------------------------------------------------- actions
async function publishFlow(btn, ctx, s) {
  const ok = await confirmDialog(L('نشر الاستبيان؟', 'Publish this survey?'),
    L(`سيصل تنبيه إلى المدعوين (${s.audience_ar}). بعد النشر لا يمكن تعديل الأسئلة أو الجمهور أو إعداد إخفاء الهوية.`, `Everyone invited (${s.audience_en}) will be alerted. After publishing, questions, audience and anonymity cannot change.`), { confirmLabel: L('نشر الآن', 'Publish now') });
  if (!ok) return;
  const r = await act(btn, () => call(`/surveys/${s.id}/publish`, { method: 'POST', body: {} }), { success: L('نُشر الاستبيان ووصل التنبيه للمدعوين', 'Published — everyone invited was alerted') });
  if (r) location.hash = `#/sys/surveys/results/${s.id}`;
  void ctx;
}
async function editSettings(s) {
  const v = await settingsDialog({ mode: 'edit', survey: s });
  if (!v) return;
  await act(null, () => call(`/surveys/${s.id}`, { method: 'PUT', body: v }), { success: L('حُفظت الإعدادات', 'Settings saved') });
}
async function addSection(s) {
  const v = await sectionDialog();
  if (!v) return;
  await act(null, () => call(`/surveys/${s.id}/sections`, { method: 'POST', body: v }), { success: L('أُضيف القسم', 'Section added') });
}
async function editSection(s, sec) {
  const v = await sectionDialog(sec);
  if (!v) return;
  await act(null, () => call(`/surveys/${s.id}/sections/${sec.id}`, { method: 'PUT', body: v }), { success: L('حُفظ القسم', 'Section saved') });
}
async function deleteSection(s, sec) {
  const n = sec.questions.length;
  const ok = await confirmDialog(L('حذف القسم؟', 'Delete section?'), n ? L(`سيُحذف القسم «${sec.title}» مع أسئلته (${fmtNum(n)}).`, `“${sec.title}” and its ${n} questions will be deleted.`) : L(`سيُحذف القسم «${sec.title}».`, `“${sec.title}” will be deleted.`), { danger: true, confirmLabel: L('حذف', 'Delete') });
  if (!ok) return;
  await act(null, () => call(`/surveys/${s.id}/sections/${sec.id}`, { method: 'DELETE', body: { confirm: true } }), { success: L('حُذف القسم', 'Section deleted') });
}
const moveSection = (s, sec, dir) => act(null, () => call(`/surveys/${s.id}/sections/${sec.id}/move`, { method: 'POST', body: { dir } }));
const moveQuestion = (s, q, dir) => act(null, () => call(`/surveys/${s.id}/questions/${q.id}/move`, { method: 'POST', body: { dir } }));
async function deleteQuestion(s, q) {
  const ok = await confirmDialog(L('حذف السؤال؟', 'Delete question?'), `«${q.text}»`, { danger: true, confirmLabel: L('حذف', 'Delete') });
  if (!ok) return;
  await act(null, () => call(`/surveys/${s.id}/questions/${q.id}`, { method: 'DELETE', body: { confirm: true } }), { success: L('حُذف السؤال', 'Question deleted') });
}
async function sectionDialog(sec = {}) {
  const t = h('input.field', { id: 'svsec-t', maxlength: 160, value: sec.title || '' });
  const d = h('textarea.field', { id: 'svsec-d', rows: 2, maxlength: 600 }, sec.description || '');
  const err = h('div.error-text', { 'aria-live': 'polite' });
  let out = null;
  const ok = await modal(sec.id ? L('تعديل القسم', 'Edit section') : L('قسم جديد', 'New section'), h('div.sv-settings',
    h('div.form-row', h('label.lbl', { for: 'svsec-t' }, L('عنوان القسم', 'Section title'), h('span.req', ' *')), t, err),
    h('div.form-row', h('label.lbl', { for: 'svsec-d' }, L('تمهيد (اختياري)', 'Intro (optional)')), d)),
  [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('حفظ', 'Save'), value: true, primary: true }], {
    beforeClose: () => { if (t.value.trim().length < 2) { err.textContent = L('اكتب عنواناً للقسم', 'Enter a section title'); t.focus(); return false; } out = { title: t.value.trim(), description: d.value.trim() }; return true; },
  });
  return ok ? out : null;
}

// Two steps: pick a type (tiles), then write the question.
async function addQuestionFlow(s, sec) {
  let picked = null;
  const tiles = h('div.sv-type-grid', Object.entries(TYPES).map(([k, t]) => h('button.sv-type-tile', { type: 'button', onclick: () => { picked = k; tiles.closest('.modal')?.querySelector('.actions .btn.primary')?.click(); } },
    h('span.sv-tpl-ic', icon(t.icon)), h('span.sv-tpl-t', L(t.ar, t.en)), h('span.sv-tpl-d', L(t.dar, t.den)))));
  const ok = await modal(L('نوع السؤال', 'Question type'), tiles, [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('التالي', 'Next'), value: true, primary: true }], { wide: true, beforeClose: () => !!picked || (toast(L('اختر نوع السؤال', 'Pick a question type'), { kind: 'error' }), false) });
  if (!ok || !picked) return;
  const v = await questionDialog(s, { type: picked, section_id: sec.id, required: picked !== 'text' });
  if (!v) return;
  await act(null, () => call(`/surveys/${s.id}/questions`, { method: 'POST', body: v }), { success: L('أُضيف السؤال', 'Question added') });
}
async function editQuestionFlow(s, q) {
  const v = await questionDialog(s, q);
  if (!v) return;
  await act(null, () => call(`/surveys/${s.id}/questions/${q.id}`, { method: 'PUT', body: v }), { success: L('حُفظ السؤال', 'Question saved') });
}
async function questionDialog(s, q) {
  const st = { type: q.type, options: (q.options?.length ? q.options : [{ label: '' }, { label: '' }]).map((o) => ({ ...o })) };
  const text = h('textarea.field', { id: 'svq-text', rows: 2, maxlength: 500, placeholder: L('اكتب السؤال بصيغة واضحة ومحايدة', 'Write a clear, neutral question') }, q.text || '');
  const help = h('input.field', { id: 'svq-help', maxlength: 500, value: q.help || '', placeholder: L('توضيح اختياري يظهر تحت السؤال', 'Optional hint under the question') });
  const req = h('input.switch', { type: 'checkbox', id: 'svq-req', checked: q.required === false ? null : true });
  const type = h('select.field', { id: 'svq-type', onchange: () => { st.type = type.value; drawOpts(); } }, Object.entries(TYPES).map(([k, t]) => h('option', { value: k, selected: k === st.type || null }, L(t.ar, t.en))));
  const sectionSel = s.sections.length > 1 ? h('select.field', { id: 'svq-sec' }, s.sections.map((x) => h('option', { value: x.id, selected: x.id === q.section_id || null }, x.title))) : null;
  const optsBox = h('div.sv-opts-editor');
  const err = h('div.error-text', { 'aria-live': 'polite' });
  const drawOpts = () => {
    if (!['single', 'multi'].includes(st.type)) { optsBox.replaceChildren(h('p.tiny.faint', L(TYPES[st.type].dar, TYPES[st.type].den))); return; }
    optsBox.replaceChildren(...[h('span.lbl', L('الخيارات', 'Options')), h('ol', st.options.map((o, i) => h('li',
      h('input.field', { value: o.label, maxlength: 120, 'aria-label': L(`الخيار ${i + 1}`, `Option ${i + 1}`), placeholder: L(`الخيار ${i + 1}`, `Option ${i + 1}`), oninput: (e) => { o.label = e.target.value; } }),
      h('button.icon-btn', { type: 'button', 'aria-label': L('حذف الخيار', 'Remove option'), disabled: st.options.length <= 2 || null, onclick: () => { st.options.splice(i, 1); drawOpts(); } }, icon('x'))))),
    st.options.length < 12 ? h('button.btn.sm.ghost', { type: 'button', onclick: () => { st.options.push({ label: '' }); drawOpts(); optsBox.querySelector('li:last-child input')?.focus(); } }, icon('plus'), L('إضافة خيار', 'Add option')) : null].filter(Boolean));
  };
  drawOpts();
  let out = null;
  const ok = await modal(q.id ? L('تعديل السؤال', 'Edit question') : L(`سؤال جديد — ${TYPES[q.type].ar}`, `New question — ${TYPES[q.type].en}`), h('div.sv-settings',
    h('div.form-grid', h('div.form-row', h('label.lbl', { for: 'svq-type' }, L('النوع', 'Type')), type), sectionSel ? h('div.form-row', h('label.lbl', { for: 'svq-sec' }, L('القسم', 'Section')), sectionSel) : null),
    h('div.form-row', h('label.lbl', { for: 'svq-text' }, L('نص السؤال', 'Question'), h('span.req', ' *')), text, err),
    h('div.form-row', h('label.lbl', { for: 'svq-help' }, L('توضيح', 'Hint')), help),
    optsBox,
    h('label.sv-switch-row', { for: 'svq-req' }, h('span.grow', h('strong', L('سؤال إلزامي', 'Required')), h('span.tiny.faint', L('الأسئلة النصية يُفضّل أن تكون اختيارية.', 'Open-text questions work best as optional.'))), req)),
  [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('حفظ السؤال', 'Save question'), value: true, primary: true }], {
    wide: true,
    beforeClose: () => {
      const t = text.value.trim();
      if (t.length < 3) { err.textContent = L('اكتب نص السؤال (3 أحرف على الأقل)', 'Write the question (3+ characters)'); text.focus(); return false; }
      err.textContent = '';
      const v = { type: st.type, text: t, help: help.value.trim(), required: req.checked };
      if (sectionSel) v.section_id = sectionSel.value; else if (!q.id) v.section_id = q.section_id;
      if (['single', 'multi'].includes(st.type)) {
        const opts = st.options.map((o) => ({ ...(o.id ? { id: o.id } : {}), label: o.label.trim() })).filter((o) => o.label);
        if (opts.length < 2) { toast(L('أضف خيارين على الأقل', 'Add at least two options'), { kind: 'error' }); return false; }
        if (new Set(opts.map((o) => o.label)).size !== opts.length) { toast(L('يوجد خيار مكرر', 'Duplicate option'), { kind: 'error' }); return false; }
        v.options = opts;
      }
      out = v; return true;
    },
  });
  return ok ? out : null;
}
