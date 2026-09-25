// Ideas — dialogs: idea form (with a live "similar ideas" check), committee
// scoring, decisions, implementation, benefits, challenges and moderation.
// Every dialog validates on the client for guidance; the server re-validates
// and its message is shown in place when it refuses.
import { h, icon, modal, toast, formDialog, ratingInput, peopleSelect, directory, api, debounce, L, fmtNum, state } from '../../../sys-kit.js';
import { call, CAT, HAPPY, CRIT, WEIGHTS, chip, pointsFeedback } from './ui.js';

let metaCache = null;
export async function meta() { metaCache ||= call('/meta').catch((e) => { metaCache = null; throw e; }); return metaCache; }

// Run the server call inside the dialog: keep it open (with the message) on failure.
function submitting(dlgRef, errBox, fn) {
  return async (v) => {
    const btn = dlgRef.el?.querySelector('.actions .btn.primary, .actions .btn.danger');
    btn?.classList.add('is-loading');
    errBox.replaceChildren();
    try { dlgRef.result = await fn(v); return true; }
    catch (e) { errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('span', e.message))); errBox.scrollIntoView?.({ block: 'nearest' }); return false; }
    finally { btn?.classList.remove('is-loading'); }
  };
}
const lastModal = () => [...document.querySelectorAll('.modal-wrap .modal')].pop() || null;
const fieldRow = (label, control, { help, req, full, id } = {}) => h(`div.form-row${full ? '.full' : ''}`, h('label.lbl', { for: id }, label, req ? h('span.req', { 'aria-hidden': 'true' }, ' *') : null), control, help ? h('div.helper', help) : null);

// ---------------- idea form ----------------
// mode: 'new' | 'edit' | 'resubmit'. Returns the saved idea (detail) or null.
export async function ideaForm({ idea = null, campaignId = null, mode = idea ? (idea.status === 'needs_info' ? 'resubmit' : 'edit') : 'new' } = {}) {
  const [m, camps, dir] = await Promise.all([meta(), call('/campaigns').catch(() => []), directory().catch(() => [])]);
  const uid = (n) => `if-${n}`;
  const v = idea || {};
  const title = h('input.field', { id: uid('title'), maxlength: 140, value: v.title || '', placeholder: L('مثال: التحقق الآلي من المستندات عبر الهوية الرقمية', 'e.g. Verify documents automatically through the digital ID'), required: true, 'aria-describedby': uid('sim') });
  const cat = h('select.field', { id: uid('cat') }, Object.entries(CAT).map(([k, c]) => h('option', { value: k, selected: (v.category || 'process') === k || null }, L(c[0], c[1]))));
  const open = camps.filter((c) => c.state === 'active' || (idea && c.id === v.campaign?.id));
  const camp = h('select.field', { id: uid('camp') }, h('option', { value: '' }, L('— بدون تحدٍ —', '— No challenge —')),
    open.map((c) => h('option', { value: c.id, selected: (campaignId || v.campaign?.id) === c.id || null }, `${L(c.title_ar, c.title_en)}${c.days_left != null ? ` · ${L(`يُغلق بعد ${c.days_left} يوماً`, `closes in ${c.days_left} d`)}` : ''}`)));
  const objs = m.objectives || [];
  const obj = h('select.field', { id: uid('obj'), disabled: objs.length ? null : true }, h('option', { value: '' }, objs.length ? L('— اختر الهدف الأقرب —', '— Choose the closest objective —') : L('الخطة الاستراتيجية غير متاحة حالياً', 'Strategic plan not available')),
    objs.map((o) => h('option', { value: o.id, selected: v.objective?.id === o.id || null }, `${o.code ? `${o.code} · ` : ''}${L(o.title_ar, o.title_en)}`)));
  const problem = h('textarea.field', { id: uid('problem'), rows: 4, maxlength: 3000, placeholder: L('ما الذي يعيق العمل أو يزعج المتعاملين اليوم؟ كم يتكرر؟ كم يستغرق؟', 'What slows work or frustrates customers today? How often? How long?') }, v.problem || '');
  const solution = h('textarea.field', { id: uid('solution'), rows: 4, maxlength: 4000, placeholder: L('ما الذي تقترحه تحديداً؟ ما الخطوة الأولى؟', 'What exactly do you propose? What is the first step?') }, v.solution || '');
  const saving = h('input.field', { id: uid('saving'), type: 'number', inputmode: 'decimal', min: 0, step: 1000, value: v.impact?.saving ?? '', placeholder: '0' });
  const hours = h('input.field', { id: uid('hours'), type: 'number', inputmode: 'numeric', min: 0, step: 10, value: v.impact?.hours ?? '', placeholder: '0' });
  const happy = h('select.field', { id: uid('happy') }, h('option', { value: '' }, L('— غير محدد —', '— Not set —')), Object.entries(HAPPY).map(([k, x]) => h('option', { value: k, selected: v.impact?.happiness === k || null }, L(x[0], x[1]))));
  const coSel = new Set(v.coauthors?.map((c) => c.id) || []);
  const me = state.me?.user?.id;
  const co = h('div.check-list.co-list', { id: uid('co'), role: 'group', 'aria-label': L('الشركاء في الفكرة', 'Co-authors') },
    dir.filter((u) => u.id !== me).map((u) => h('label.check-label', h('input', { type: 'checkbox', value: u.id, checked: coSel.has(u.id) || null }), h('span', L(u.name_ar, u.name_en), h('small.faint', ` · ${L(u.dept_ar || '', u.dept_en || '')}`)))));
  const hide = h('input', { type: 'checkbox', id: uid('hide'), checked: v.author_hidden || null });
  const response = mode === 'resubmit' ? h('textarea.field', { id: uid('resp'), rows: 3, maxlength: 2000, placeholder: L('ما الذي أضفته أو غيّرته استجابةً لملاحظات اللجنة؟', 'What did you add or change in response to the committee?') }) : null;
  const sim = h('div.similar-box', { id: uid('sim'), 'aria-live': 'polite' });
  const errBox = h('div');
  const checkSimilar = debounce(async () => {
    const t = `${title.value} ${problem.value}`.trim();
    if (title.value.trim().length < 8) { sim.replaceChildren(); return; }
    const list = await call(`/similar?text=${encodeURIComponent(t.slice(0, 600))}${idea ? `&exclude=${idea.id}` : ''}`).catch(() => []);
    sim.replaceChildren(...(list.length ? [h('div.sim-head', icon('lightbulb'), h('span', L('أفكار مشابهة قائمة — إن كانت فكرتك نفسها فادعمها بصوتك بدلاً من تكرارها', 'Similar ideas already exist — if yours is the same, vote for it instead of duplicating'))),
      h('ul.sim-list', list.map((s) => h('li', h('a', { href: `#/sys/ideas/bank/${s.id}`, target: '_blank', rel: 'noopener' }, s.title), chip(s.status), h('span.sim-pct.tabular', `${fmtNum(s.similarity)}%`))))] : []));
  }, 400);
  title.addEventListener('input', checkSimilar); problem.addEventListener('input', checkSimilar);
  if (idea) checkSimilar();

  const info = mode === 'resubmit' && idea.info_request ? h('div.callout.idea-info-req', icon('help'), h('div', h('strong', L('ملاحظات اللجنة', 'Committee notes')), h('p', idea.info_request.note))) : null;
  const body = h('div.idea-form',
    info,
    h('div.form-grid',
      fieldRow(L('عنوان الفكرة', 'Idea title'), title, { req: true, full: true, id: uid('title'), help: L('جملة قصيرة تصف التحسين المقترح', 'One short line describing the improvement') }),
      h('div.full', sim),
      fieldRow(L('الفئة', 'Category'), cat, { id: uid('cat') }),
      fieldRow(L('التحدي', 'Challenge'), camp, { id: uid('camp') }),
      fieldRow(L('الهدف الاستراتيجي', 'Strategic objective'), obj, { full: true, id: uid('obj'), help: objs.length ? L('يساعد اللجنة على تقييم المواءمة', 'Helps the committee assess alignment') : null }),
      fieldRow(L('المشكلة أو الفرصة', 'Problem or opportunity'), problem, { req: true, full: true, id: uid('problem') }),
      fieldRow(L('الحل المقترح', 'Proposed solution'), solution, { req: true, full: true, id: uid('solution') }),
      h('div.full.impact-fields',
        h('div.if-head', h('span.lbl', L('الأثر المتوقع سنوياً', 'Expected annual impact')), h('span.helper', L('تقدير تقريبي يكفي — لا تبالغ؛ تتحقق اللجنة منه', 'A rough estimate is enough — the committee verifies it'))),
        h('div.if-grid',
          fieldRow(L('وفر مالي', 'Saving'), h('div.money-field', saving, h('span.cur', L('د.إ', 'AED'))), { id: uid('saving') }),
          fieldRow(L('ساعات عمل موفرة', 'Hours saved'), hours, { id: uid('hours') }),
          fieldRow(L('سعادة المتعاملين', 'Customer happiness'), happy, { id: uid('happy') }))),
      fieldRow(L('شركاء في الفكرة (اختياري)', 'Co-authors (optional)'), co, { full: true, id: uid('co') }),
      h('div.form-row.full', h('label.check-label.hide-toggle', hide, h('span', h('strong', L('إخفاء اسمي عن الزملاء', 'Hide my name from colleagues')), h('small.helper', L('تبقى هويتك ظاهرة للجنة التقييم فقط، ويُسجَّل كل اطّلاع عليها وتستطيع مراجعته.', 'Only the evaluation committee can see who you are; every view is logged for you to review.'))))),
      response ? fieldRow(L('ردّك على ملاحظات اللجنة', 'Your response to the committee'), response, { req: true, full: true, id: uid('resp') }) : null),
    errBox);
  const collect = () => ({
    title: title.value.trim(), category: cat.value, campaign_id: camp.value || null, objective_id: obj.value || null,
    problem: problem.value.trim(), solution: solution.value.trim(),
    expected_saving: saving.value === '' ? null : Number(saving.value), expected_hours: hours.value === '' ? null : Number(hours.value),
    happiness: happy.value || null, coauthor_ids: [...co.querySelectorAll('input:checked')].map((x) => x.value), hide_author: hide.checked,
  });
  const clientCheck = (vals, submit) => {
    const bad = [];
    if (vals.title.length < 4) bad.push([title, L('اكتب عنواناً للفكرة (4 أحرف على الأقل)', 'Add a title (at least 4 characters)')]);
    if (submit && vals.problem.length < 20) bad.push([problem, L('صِف المشكلة في 20 حرفاً على الأقل', 'Describe the problem in at least 20 characters')]);
    if (submit && vals.solution.length < 20) bad.push([solution, L('صِف الحل المقترح في 20 حرفاً على الأقل', 'Describe the solution in at least 20 characters')]);
    if (response && response.value.trim().length < 5) bad.push([response, L('اكتب ردّك على ملاحظات اللجنة', 'Write your response to the committee')]);
    for (const el of [title, problem, solution, response]) el?.removeAttribute('aria-invalid');
    if (!bad.length) return true;
    for (const [el] of bad) el.setAttribute('aria-invalid', 'true');
    errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('ul', bad.map(([, msg]) => h('li', msg)))));
    bad[0][0].focus();
    return false;
  };
  const ref = {};
  const run = submitting(ref, errBox, async (action) => {
    const vals = collect();
    if (mode === 'new') return call('/ideas', { method: 'POST', body: { ...vals, submit: action === 'submit' } });
    const upd = { ...vals };
    const saved = await call(`/ideas/${idea.id}`, { method: 'PUT', body: upd });
    if (action === 'submit') return call(`/ideas/${idea.id}/submit`, { method: 'POST', body: {} });
    if (action === 'resubmit') return call(`/ideas/${idea.id}/submit`, { method: 'POST', body: { response: response.value.trim() } });
    return saved;
  });
  const actions = mode === 'resubmit'
    ? [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('حفظ دون إرسال', 'Save only'), value: 'save' }, { label: L('إعادة الإرسال للجنة', 'Resubmit to the committee'), value: 'resubmit', primary: true }]
    : [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('حفظ كمسودة', 'Save as draft'), value: 'save' }, { label: L('إرسال للجنة', 'Send to the committee'), value: 'submit', primary: true }];
  const titleText = mode === 'new' ? L('فكرة جديدة', 'New idea') : mode === 'resubmit' ? L('استكمال المعلومات وإعادة الإرسال', 'Complete & resubmit') : L('تعديل الفكرة', 'Edit idea');
  const p = modal(titleText, body, actions, {
    wide: true,
    beforeClose: async (val) => {
      if (!clientCheck(collect(), val === 'submit' || val === 'resubmit')) return false;
      return run(val);
    },
  });
  ref.el = lastModal();
  const val = await p;
  if (!val) return null;
  const out = ref.result;
  toast(val === 'save' ? L('حُفظت الفكرة كمسودة خاصة بك', 'Saved as your private draft') : val === 'resubmit' ? L('أُعيد إرسال الفكرة إلى اللجنة', 'Resubmitted to the committee') : L('وصلت فكرتك إلى لجنة التقييم — شكراً لمبادرتك', 'Your idea reached the committee — thank you'));
  if (val !== 'save') pointsFeedback(document.querySelector('#level-chip-host'));
  return out;
}

// ---------------- committee: scoring ----------------
export async function scoreDialog(idea) {
  const mine = idea.evaluation?.mine || {};
  const rows = {};
  const live = h('div.weighted-live', { 'aria-live': 'polite' });
  const draw = () => {
    const vals = Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, rows[k].value]));
    const done = Object.values(vals).every((x) => x != null);
    const w = done ? Object.entries(WEIGHTS).reduce((a, [k, wt]) => a + wt * vals[k], 0) : null;
    live.replaceChildren(h('span', L('النتيجة الموزونة', 'Weighted score')), h('strong.num.tabular', w == null ? '—' : `${fmtNum(Math.round(w * 100) / 100)} / ${fmtNum(5)}`), w == null ? h('small.faint', L('قيّم المعايير الأربعة', 'Rate all four criteria')) : h('small.faint', `${fmtNum(Math.round((w / 5) * 100))}%`));
  };
  const labels = [L('ضعيف', 'Weak'), L('مقبول', 'Fair'), L('جيد', 'Good'), L('جيد جداً', 'Very good'), L('ممتاز', 'Excellent')];
  const grid = h('div.score-rows', Object.entries(CRIT).map(([k, c]) => {
    rows[k] = ratingInput({ name: L(c[0], c[1]), max: 5, value: mine[k] ?? null, labels });
    rows[k].addEventListener('change', draw);
    return h('div.score-row', h('div.sr-text', h('div.sr-name', L(c[0], c[1]), h('span.chip.tiny.outline', `${fmtNum(WEIGHTS[k] * 100)}%`)), h('div.helper', L(c[2], c[3]))), rows[k]);
  }));
  const note = h('textarea.field', { rows: 3, maxlength: 1500, placeholder: L('ملاحظة للجنة (لا تظهر لمقدّم الفكرة)', 'Note to the committee (not shown to the author)') }, mine.note || '');
  const errBox = h('div');
  draw();
  const ref = {};
  const run = submitting(ref, errBox, () => call(`/ideas/${idea.id}/score`, { method: 'PUT', body: { ...Object.fromEntries(Object.keys(WEIGHTS).map((k) => [k, rows[k].value])), note: note.value.trim() || null } }));
  const p = modal(L('تقييم الفكرة', 'Score the idea'), h('div.score-form',
    h('p.muted', h('strong', idea.title), h('br'), L('قيّم باستقلالية: تظهر تقييمات الأعضاء الآخرين بعد حفظ تقييمك. لا يمكنك تقييم فكرة أنت من مقدّميها.', 'Score independently: other members’ scores appear after you save yours. You cannot score an idea you authored.')),
    grid, live, h('div.form-row', h('label.lbl', L('ملاحظة للجنة', 'Committee note')), note), errBox),
  [{ label: L('إلغاء', 'Cancel'), value: false }, { label: idea.evaluation?.mine ? L('تحديث التقييم', 'Update score') : L('حفظ التقييم', 'Save score'), value: true, primary: true }], {
    wide: true,
    beforeClose: async () => {
      if (Object.values(rows).some((r) => r.value == null)) { errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('span', L('قيّم المعايير الأربعة جميعها', 'Rate all four criteria')))); return false; }
      return run();
    },
  });
  ref.el = lastModal();
  if (!(await p)) return null;
  toast(L('حُفظ تقييمك', 'Your score was saved'));
  return ref.result;
}

// ---------------- committee: decisions ----------------
// options: which outcomes are offered for the current stage.
export async function decisionDialog(idea, { options = ['approved', 'needs_info', 'rejected'], initial } = {}) {
  const dir = options.includes('approved') ? await directory().catch(() => []) : [];
  const owners = new Set([idea.author_id, ...(idea.coauthor_ids || [])].filter(Boolean));
  const OPT = {
    approved: [L('اعتماد', 'Approve'), 'badgeCheck', L('تنتقل الفكرة إلى التنفيذ مع راعٍ مسؤول', 'Moves to implementation with an accountable sponsor')],
    needs_info: [L('طلب معلومات', 'Ask for info'), 'help', L('تعود لمقدّم الفكرة لاستكمال ما ينقص', 'Returns to the author to complete')],
    rejected: [L('عدم اعتماد', 'Do not approve'), 'circleX', L('قرار نهائي مع ملاحظات بنّاءة لمقدّم الفكرة', 'Final decision with constructive feedback')],
  };
  let choice = initial && options.includes(initial) ? initial : options.find((o) => o !== 'approved' || idea.can.approve) || options[0];
  const agg = idea.evaluation?.aggregate;
  const segs = h('div.decision-opts', { role: 'radiogroup', 'aria-label': L('القرار', 'Decision') });
  const note = h('textarea.field', { id: 'dd-note', rows: 4, maxlength: 2000 });
  const noteLbl = h('label.lbl', { for: 'dd-note' });
  const sponsor = peopleSelect(dir, { id: 'dd-sponsor', filter: (u) => !owners.has(u.id), placeholder: L('— اختر راعي التنفيذ —', '— Choose the sponsor —') });
  const sponsorRow = h('div.form-row', h('label.lbl', { for: 'dd-sponsor' }, L('راعي التنفيذ', 'Implementation sponsor'), h('span.req', ' *')), sponsor, h('div.helper', L('مدير الإدارة الأنسب للتنفيذ — لا يكون من مقدّمي الفكرة', 'The director best placed to deliver — never one of the authors')));
  const errBox = h('div');
  const draw = () => {
    segs.replaceChildren(...options.map((o) => {
      const disabled = o === 'approved' && !idea.can.approve;
      return h(`button.dopt${choice === o ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(choice === o), disabled: disabled || null, 'data-o': o, onclick: () => { choice = o; draw(); } },
        icon(OPT[o][1]), h('span.do-t', OPT[o][0]), h('small', disabled ? L(`يتطلب ${idea.evaluation?.min_scores || 2} تقييمات على الأقل`, `Needs at least ${idea.evaluation?.min_scores || 2} scores`) : OPT[o][2]));
    }));
    noteLbl.replaceChildren(...[choice === 'approved' ? L('ملاحظة القرار (اختيارية)', 'Decision note (optional)') : choice === 'needs_info' ? L('ما المعلومات المطلوبة؟', 'What information is needed?') : L('سبب القرار وملاحظات بنّاءة', 'Reason and constructive feedback'), choice === 'approved' ? null : h('span.req', ' *')].filter(Boolean));
    note.placeholder = choice === 'rejected' ? L('اشرح السبب بلغة بنّاءة واقترح بديلاً إن وُجد', 'Explain kindly and suggest an alternative if any') : choice === 'needs_info' ? L('مثال: نرجو تقدير الكلفة وعدد المعاملات الشهرية', 'e.g. please estimate the cost and monthly volume') : '';
    sponsorRow.hidden = choice !== 'approved';
  };
  draw();
  const ref = {};
  const run = submitting(ref, errBox, () => call(`/ideas/${idea.id}/transition`, { method: 'POST', body: { to: choice, note: note.value.trim() || null, sponsor_id: choice === 'approved' ? sponsor.value || null : null } }));
  const p = modal(L('قرار اللجنة', 'Committee decision'), h('div.decision-form',
    h('p.muted', h('strong', idea.title)),
    agg ? h('div.decision-agg', icon('scale'), h('span', L('متوسط اللجنة', 'Committee average'), ' ', h('bdi.num', `${fmtNum(agg.weighted)}/${fmtNum(5)}`), ' · ', h('bdi.num', `${fmtNum(agg.pct)}%`), ' · ', L(`${fmtNum(agg.count)} تقييمات`, `${agg.count} scores`))) : null,
    segs, h('div.form-row', noteLbl, note), sponsorRow, errBox),
  [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('تأكيد القرار', 'Confirm decision'), value: true, primary: true }], {
    wide: true,
    beforeClose: async () => {
      if (choice !== 'approved' && note.value.trim().length < 10) { errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('span', L('اكتب ملاحظاتك لمقدّم الفكرة (10 أحرف على الأقل)', 'Write feedback for the author (at least 10 characters)')))); note.focus(); return false; }
      if (choice === 'approved' && !sponsor.value) { errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('span', L('اختر راعي التنفيذ', 'Choose the implementation sponsor')))); sponsor.focus(); return false; }
      return run();
    },
  });
  ref.el = lastModal();
  if (!(await p)) return null;
  toast(choice === 'approved' ? L('اعتُمدت الفكرة وأُبلغ راعي التنفيذ', 'Approved — the sponsor was notified') : choice === 'needs_info' ? L('أُرسل طلب المعلومات إلى مقدّم الفكرة', 'Information request sent to the author') : L('سُجّل القرار وأُبلغ مقدّم الفكرة', 'Decision recorded and the author notified'));
  return ref.result;
}

// ---------------- implementation ----------------
export async function implementDialog(idea) {
  const projects = (await api('/api/projects?status=active').catch(() => [])).filter((p) => !p.deleted_at);
  let mode = 'create';
  const name = h('input.field', { id: 'im-name', maxlength: 160, value: `${L('تنفيذ', 'Implement')}: ${idea.title}`.slice(0, 160) });
  const due = h('input.field', { id: 'im-due', type: 'date', min: new Date().toISOString().slice(0, 10) });
  const proj = h('select.field', { id: 'im-proj' }, h('option', { value: '' }, projects.length ? L('— اختر مشروعاً —', '— Choose a project —') : L('لا توجد مشاريع نشطة ضمن نطاقك', 'No active projects in your scope')), projects.map((p) => h('option', { value: p.id }, `${p.name} · ${L(p.dept_ar, p.dept_en)}`)));
  const createBox = h('div.form-grid', fieldRow(L('اسم المشروع', 'Project name'), name, { full: true, id: 'im-name', req: true }), fieldRow(L('تاريخ الاستحقاق', 'Due date'), due, { id: 'im-due' }));
  const linkBox = h('div.form-grid', fieldRow(L('المشروع القائم', 'Existing project'), proj, { full: true, id: 'im-proj', req: true, help: L('تظهر المشاريع النشطة ضمن نطاقك؛ يلزم أن تملك صلاحية تعديلها', 'Active projects in your scope; you need edit rights') }));
  const seg = h('div.decision-opts.two', { role: 'radiogroup', 'aria-label': L('طريقة التنفيذ', 'How to implement') });
  const drawSeg = () => {
    seg.replaceChildren(...[['create', 'folderPlus', L('إنشاء مشروع جديد', 'Create a new project'), L('في إدارتك، ويظهر في المشاريع وADAA I', 'In your department; shows in Projects and ADAA I')], ['link', 'link', L('ربط بمشروع قائم', 'Link an existing project'), L('عندما تكون الفكرة جزءاً من مشروع جارٍ', 'When the idea is part of an ongoing project')]]
      .map(([k, ic, t, s]) => h(`button.dopt${mode === k ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(mode === k), onclick: () => { mode = k; drawSeg(); } }, icon(ic), h('span.do-t', t), h('small', s))));
    createBox.hidden = mode !== 'create'; linkBox.hidden = mode !== 'link';
  };
  drawSeg();
  const errBox = h('div');
  const ref = {};
  const run = submitting(ref, errBox, () => call(`/ideas/${idea.id}/implement`, { method: 'POST', body: mode === 'create' ? { mode, name: name.value.trim(), due_date: due.value || null } : { mode, project_id: proj.value || null } }));
  const p = modal(L('بدء التنفيذ', 'Start implementation'), h('div.decision-form', h('p.muted', h('strong', idea.title)), seg, createBox, linkBox, errBox),
    [{ label: L('إلغاء', 'Cancel'), value: false }, { label: L('بدء التنفيذ', 'Start'), value: true, primary: true }], {
      wide: true,
      beforeClose: async () => {
        if (mode === 'link' && !proj.value) { errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('span', L('اختر المشروع', 'Choose the project')))); return false; }
        if (mode === 'create' && name.value.trim().length < 2) { errBox.replaceChildren(h('div.callout.idea-form-error', { role: 'alert' }, icon('circleAlert'), h('span', L('اكتب اسم المشروع', 'Name the project')))); return false; }
        return run();
      },
    });
  ref.el = lastModal();
  if (!(await p)) return null;
  toast(mode === 'create' ? L('أُنشئ مشروع التنفيذ وارتبط بالفكرة', 'Implementation project created and linked') : L('رُبطت الفكرة بالمشروع', 'Idea linked to the project'));
  return ref.result;
}
export async function completeDialog(idea) {
  const v = await formDialog({
    title: L('تسجيل الأثر المحقق', 'Record realised benefits'), wide: true,
    intro: L('يُغلق هذا الإجراء الفكرة كمنفّذة ويمنح مقدّميها نقاط التميّز. سجّل ما تحقق فعلاً مع الدليل.', 'This closes the idea as implemented and awards the authors excellence points. Record what was actually achieved, with evidence.'),
    fields: [
      { name: 'benefits_note', label: L('ما الذي تغيّر؟', 'What changed?'), type: 'textarea', required: true, rows: 4, placeholder: L('مثال: انخفض زمن الخدمة من 3 أيام إلى 4 ساعات…', 'e.g. service time dropped from 3 days to 4 hours…') },
      { name: 'realized_saving', label: L('الوفر المالي المحقق سنوياً', 'Realised annual saving'), type: 'money', min: 0 },
      { name: 'realized_hours', label: L('الساعات الموفرة سنوياً', 'Hours saved per year'), type: 'number', min: 0 },
    ],
    submitLabel: L('تسجيل وإغلاق الفكرة', 'Record & close'),
  });
  if (!v) return null;
  if (String(v.benefits_note).length < 10) { toast(L('صِف الأثر المحقق بتفصيل أكثر (10 أحرف على الأقل)', 'Describe the benefits in more detail'), { kind: 'error' }); return null; }
  const r = await call(`/ideas/${idea.id}/complete`, { method: 'POST', body: { benefits_note: v.benefits_note, realized_saving: v.realized_saving, realized_hours: v.realized_hours } });
  toast(L('سُجّل الأثر المحقق وأُغلقت الفكرة كمنفّذة', 'Benefits recorded — idea implemented'));
  return r;
}

// ---------------- challenges ----------------
export async function challengeDialog() {
  const m = await meta().catch(() => ({ objectives: [] }));
  const today = new Date().toISOString().slice(0, 10);
  const inMonth = new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
  const v = await formDialog({
    title: L('تحدٍ جديد', 'New challenge'), wide: true,
    intro: L('التحدي سؤال محدد يدعو الموظفين للمشاركة بأفكار ضمن موعد. اجعله واضحاً وقابلاً للقياس.', 'A challenge is a focused question inviting ideas before a deadline. Keep it clear and measurable.'),
    fields: [
      { name: 'title_ar', label: L('عنوان التحدي', 'Title (Arabic)'), required: true, full: true, maxLength: 140 },
      { name: 'title_en', label: L('العنوان بالإنجليزية (اختياري)', 'Title (English, optional)'), full: true, maxLength: 140 },
      { name: 'description_ar', label: L('ما المطلوب؟', 'What are we asking?'), type: 'textarea', required: true, rows: 3 },
      { name: 'starts_on', label: L('يبدأ في', 'Starts on'), type: 'date', required: true, min: today },
      { name: 'ends_on', label: L('يُغلق في', 'Closes on'), type: 'date', required: true, min: today },
      { name: 'objective_id', label: L('الهدف الاستراتيجي', 'Strategic objective'), type: 'select', options: (m.objectives || []).map((o) => ({ value: o.id, label: `${o.code ? `${o.code} · ` : ''}${L(o.title_ar, o.title_en)}` })), full: true },
      { name: 'sponsor_id', label: L('راعي التحدي', 'Challenge sponsor'), type: 'user', full: true },
    ],
    values: { starts_on: today, ends_on: inMonth },
    submitLabel: L('إطلاق التحدي', 'Launch challenge'),
  });
  if (!v) return null;
  const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== null && x !== ''));
  const r = await call('/campaigns', { method: 'POST', body });
  toast(L('أُطلق التحدي وأصبح متاحاً لجميع الموظفين', 'Challenge launched for all staff'));
  return r;
}

// ---------------- moderation ----------------
export async function hideCommentDialog(idea, c) {
  const v = await formDialog({
    title: L('إخفاء تعليق', 'Hide comment'), danger: true,
    intro: L('يبقى التعليق محفوظاً ويظهر سبب الإخفاء لكاتبه وللجنة. يُسجَّل الإجراء في سجل التدقيق.', 'The comment is kept; the reason is shown to its author and the committee. The action is audited.'),
    fields: [{ name: 'reason', label: L('سبب الإخفاء', 'Reason'), type: 'textarea', required: true, rows: 2, placeholder: L('مثال: خارج موضوع الفكرة', 'e.g. off-topic') }],
    submitLabel: L('إخفاء التعليق', 'Hide comment'),
  });
  if (!v) return null;
  const r = await call(`/ideas/${idea.id}/comments/${c.id}/hide`, { method: 'POST', body: { reason: v.reason, confirm: true } });
  toast(L('أُخفي التعليق', 'Comment hidden'));
  return r;
}
