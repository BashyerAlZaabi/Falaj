// Awards › «رشّح» — nomination wizard: programme → category & nominee →
// justification per criterion → evidence → review & submit. The draft lives in
// this module (survives live soft refreshes); the step is in the hash
// (#/sys/awards/nominate/<programme>/<step>). The server re-validates everything.
import { h, icon, L, fmtDate, fmtNum, toast, emptyState, directory, peopleSelect, act, avatar, api, menu } from '../../../sys-kit.js';
import { call, href, ELIG, nm, dept, title, medal, phaseTrack, daysText, eligible, back, eyebrow, count } from './common.js';

const STEPS = [
  { key: 'who', ar: 'الفئة والمرشح', en: 'Category & nominee', icon: 'userPlus' },
  { key: 'why', ar: 'المبررات', en: 'Justification', icon: 'fileText' },
  { key: 'evidence', ar: 'الأدلة', en: 'Evidence', icon: 'clip' },
  { key: 'review', ar: 'المراجعة والإرسال', en: 'Review & submit', icon: 'send' },
];
const MIN_JUST = 20;
let draft = null; // { pid, category_id, mode, nominee_id, team_name, team_member_ids, summary, justifications, evidence, attach_excellence }
let preview = null; // excellence preview (own)

const fresh = (p, mode = 'colleague') => ({ pid: p.id, category_id: p.categories.length === 1 ? p.categories[0].id : '', mode: p.eligibility === 'team' ? 'team' : mode, nominee_id: '', team_name: '', team_member_ids: [], summary: '', justifications: {}, evidence: [], attach_excellence: false });

export async function view(ctx, me, rest) {
  const [pid, stepKey] = rest;
  if (!pid) return chooseProgramme(ctx, me);
  const p = await call(`/programs/${pid}`).catch((e) => { if (e.status === 404) return null; throw e; });
  if (!p) return emptyState({ icon: 'award', title: L('البرنامج غير متاح', 'Programme not available'), actions: [{ label: L('البرامج المفتوحة', 'Open programmes'), primary: true, onClick: () => { location.hash = href('nominate'); } }] });
  if (!p.phase.window_open) {
    return h('div.aw-wizard', back(href('programs', p.id), nm(p)), emptyState({ icon: 'clock', title: L('باب الترشيح لهذا البرنامج غير مفتوح', 'Nominations are not open for this programme'),
      body: p.phase.not_yet_open ? L(`يفتح في ${fmtDate(p.nomination_opens)}`, `Opens ${fmtDate(p.nomination_opens)}`) : L('يمكنك متابعة المراحل والنتائج من صفحة البرنامج.', 'Follow the stages and results on the programme page.'),
      actions: [{ label: L('صفحة البرنامج', 'Programme page'), primary: true, onClick: () => { location.hash = href('programs', p.id); } }] }));
  }
  if (!draft || draft.pid !== p.id) draft = fresh(p);
  if (p.my_nominations >= me.max_per_nominator) {
    return h('div.aw-wizard', back(href('programs', p.id), nm(p)), emptyState({ icon: 'circleCheck', title: L('استوفيت حد الترشيحات في هذا البرنامج', 'You reached the nomination limit for this programme'),
      body: L(`لكل موظف ${fmtNum(me.max_per_nominator)} ترشيحات في البرنامج الواحد. يمكنك متابعة ترشيحاتك أو سحب أحدها قبل الإغلاق.`, `Each person may submit ${me.max_per_nominator} per programme. Follow them, or withdraw one before closing.`),
      actions: [{ label: L('ترشيحاتي', 'My nominations'), primary: true, onClick: () => { location.hash = href('mine'); } }] }));
  }
  if (stepKey === 'self') { if (p.allow_self && eligible(p, ctx.user) && p.eligibility !== 'team' && !p.my_nominees.includes(ctx.user.id)) { draft.mode = 'self'; draft.nominee_id = ctx.user.id; } history.replaceState(null, '', href('nominate', p.id, 'who')); }
  const dir = (await directory().catch(() => [])).filter((u) => u.id);
  let idx = Math.max(0, STEPS.findIndex((s) => s.key === stepKey));
  // never land on a later step with an incomplete earlier one
  for (let i = 0; i < idx; i++) if (problems(p, STEPS[i].key, ctx.user).length) { idx = i; history.replaceState(null, '', href('nominate', p.id, STEPS[i].key)); break; }
  const step = STEPS[idx];
  if (step.key === 'review' && draft.mode === 'self' && !preview) preview = await call('/excellence-preview').catch(() => null);

  const panel = { who: stepWho, why: stepWhy, evidence: stepEvidence, review: stepReview }[step.key](ctx, me, p, dir);
  const errors = h('div.aw-wiz-errors', { role: 'alert', 'aria-live': 'polite' });
  const goto = (i) => { location.hash = href('nominate', p.id, STEPS[i].key); };
  const next = () => {
    const bad = problems(p, step.key, ctx.user);
    if (bad.length) { errors.replaceChildren(h('div.callout.aw-wiz-bad', icon('circleAlert'), h('ul', bad.map((b) => h('li', b))))); errors.querySelector('.callout')?.focus?.(); return; }
    goto(idx + 1);
  };
  const submitBtn = h('button.btn.primary.lg', { type: 'button', onclick: (e) => submit(e.currentTarget, p, ctx) }, icon('send'), L('إرسال الترشيح', 'Submit nomination'));
  const nav = h('div.aw-wiz-nav',
    idx > 0 ? h('button.btn.lg', { type: 'button', onclick: () => goto(idx - 1) }, icon('chevron', 'aw-back-ic'), L('السابق', 'Back')) : h('a.btn.lg.ghost', { href: href('programs', p.id) }, L('إلغاء', 'Cancel')),
    h('span.grow'),
    step.key === 'review' ? submitBtn : h('button.btn.primary.lg', { type: 'button', onclick: next }, L('التالي', 'Next'), icon('chevron', 'flip-rtl')));

  return h('div.aw-wizard',
    h('div.aw-wiz-top', back(href('programs', p.id), nm(p)), h('span.aw-wiz-close', icon('clock'), daysText(p.phase.days_left))),
    h('ol.aw-wiz-steps', { 'aria-label': L('خطوات الترشيح', 'Nomination steps') }, STEPS.map((s, i) => h(`li.${i < idx ? 'done' : i === idx ? 'current' : 'todo'}`, { 'aria-current': i === idx ? 'step' : null },
      i < idx ? h('a', { href: href('nominate', p.id, s.key) }, h('span.aw-ws-dot', icon('check')), h('span', L(s.ar, s.en))) : h('span.aw-ws-item', h('span.aw-ws-dot', i === idx ? icon(s.icon) : h('span.num', String(i + 1))), h('span', L(s.ar, s.en)))))),
    h('div.aw-wiz-grid',
      h('section.card.aw-wiz-panel', { 'aria-labelledby': 'aw-step-title' }, h('h2#aw-step-title.aw-wiz-title', L(step.ar, step.en)), panel, errors, nav),
      summaryPanel(ctx, p, dir, idx)));
}

// ---------------- validation (mirrors the server; the server is the authority) ----------------
function problems(p, key, me) {
  const out = [];
  if (key === 'who') {
    if (!draft.category_id) out.push(L('اختر فئة الجائزة', 'Choose a category'));
    if (draft.mode === 'team') {
      if (!draft.nominee_id) out.push(L('اختر قائد الفريق', 'Choose the team lead'));
      if ((draft.team_name || '').trim().length < 3) out.push(L('اكتب اسم الفريق', 'Name the team'));
      if (new Set([draft.nominee_id, ...draft.team_member_ids].filter(Boolean)).size < 2) out.push(L('الفريق يتكون من عضوين على الأقل', 'A team needs at least two members'));
    } else if (draft.mode === 'colleague' && !draft.nominee_id) out.push(L('اختر الزميل الذي ترشّحه', 'Choose the colleague you nominate'));
    if (draft.mode === 'self' && !eligible(p, me)) out.push(L('لست ضمن الفئة المؤهلة لهذه الجائزة', 'You are not eligible for this award'));
  }
  if (key === 'why') {
    if (draft.summary.trim().length < 10) out.push(L('اكتب عنوان الترشيح (10 أحرف على الأقل)', 'Write a headline (at least 10 characters)'));
    for (const c of p.criteria) if ((draft.justifications[c.id] || '').trim().length < MIN_JUST) out.push(L(`مبرر «${c.name_ar}» يحتاج ${MIN_JUST} حرفاً على الأقل`, `“${nm(c)}” needs at least ${MIN_JUST} characters`));
  }
  if (key === 'evidence') {
    for (const e of draft.evidence) {
      if (!e.title.trim()) out.push(L('لكل دليل عنوان', 'Every evidence item needs a title'));
      if (e.link && !/^(https?:\/\/|#\/)/.test(e.link.trim())) out.push(L(`رابط «${e.title || '—'}» يجب أن يبدأ بـ https://`, `Link for “${e.title || '—'}” must start with https://`));
    }
  }
  return out;
}

// ---------------- steps ----------------
function chooseProgramme(ctx, me) {
  return call('/programs?status=open').then((list) => {
    if (list.length === 1) { history.replaceState(null, '', href('nominate', list[0].id, 'who')); return view(ctx, me, [list[0].id, 'who']); }
    if (!list.length) return emptyState({ icon: 'calendarClock', title: L('لا توجد برامج مفتوحة للترشيح الآن', 'No programme is open for nominations'), body: L('تابع صفحة البرامج لمعرفة موعد الدورة القادمة، أو تعرّف على الفائزين السابقين.', 'Check the programmes page for the next cycle, or meet past winners.'), actions: [{ label: L('قاعة التميّز', 'Hall of excellence'), primary: true, onClick: () => { location.hash = href('hall'); } }] });
    return h('div.aw-choose', h('h2.aw-section-title', L('اختر الجائزة', 'Choose the award')), h('div.aw-choose-grid', list.map((p) => h('a.card.aw-choose-card', { href: href('nominate', p.id, 'who') },
      h('div.aw-prog-head', medal(p.kind), h('div.grow', h('strong', nm(p)), h('div.aw-prog-meta', h('span', p.cycle), h('span', daysText(p.phase.days_left)))), icon('chevron', 'flip-rtl')),
      h('p.faint', L(p.description_ar, p.description_en || p.description_ar)), phaseTrack(p)))));
  });
}

function radioCard(name, value, checked, onPick, body) {
  const id = `aw-${name}-${value}`;
  return h(`label.aw-radio${checked ? '.on' : ''}`, { for: id }, h('input', { type: 'radio', id, name, value, checked: checked || null, onchange: () => onPick(value) }), h('span.aw-radio-mark', { 'aria-hidden': 'true' }), h('div.grow', body));
}

function stepWho(ctx, me, p, dir) {
  const redraw = () => ctx.rerender();
  const cats = h('fieldset.aw-fieldset', h('legend', L('الفئة', 'Category')),
    h('div.aw-radio-grid', p.categories.map((c) => radioCard('cat', c.id, draft.category_id === c.id, (v) => { draft.category_id = v; redraw(); },
      [h('strong', nm(c)), c.description_ar ? h('span.faint', L(c.description_ar, c.description_en || c.description_ar)) : null]))));
  const pool = dir.filter((u) => eligible(p, u));
  let who;
  if (draft.mode === 'team') {
    const lead = h('div.form-row', h('label.lbl', { for: 'aw-lead' }, L('قائد الفريق (يؤكد الموافقة نيابة عن الفريق)', 'Team lead (consents for the team)')),
      peopleSelect(pool, { id: 'aw-lead', value: draft.nominee_id, 'data-fk': 'lead', onchange: (e) => { draft.nominee_id = e.target.value; redraw(); } }));
    const name = h('div.form-row', h('label.lbl', { for: 'aw-team' }, L('اسم الفريق', 'Team name')), h('input.field', { id: 'aw-team', 'data-fk': 'team', maxlength: 120, value: draft.team_name, placeholder: L('مثال: فريق البوابة الموحدة', 'e.g. Unified Portal team'), oninput: (e) => { draft.team_name = e.target.value; } }));
    const members = h('fieldset.aw-fieldset', h('legend', L('أعضاء الفريق', 'Team members'), h('span.faint.tiny', L(' (حتى 10)', ' (up to 10)'))),
      h('div.check-list.aw-members', pool.filter((u) => u.id !== draft.nominee_id).map((u) => h('label.check-label', h('input', { type: 'checkbox', value: u.id, checked: draft.team_member_ids.includes(u.id) || null, onchange: (e) => { draft.team_member_ids = e.target.checked ? [...new Set([...draft.team_member_ids, u.id])] : draft.team_member_ids.filter((x) => x !== u.id); } }), `${nm(u)} — ${dept(u)}`))));
    who = h('div.aw-who', h('div.form-grid', lead, name), members);
  } else {
    const modes = [['colleague', L('زميل أو موظف في فريقي', 'A colleague or team member'), 'people']];
    if (p.allow_self && eligible(p, ctx.user) && !p.my_nominees.includes(ctx.user.id)) modes.push(['self', L('نفسي', 'Myself'), 'user']);
    const seg = modes.length > 1 ? h('div.aw-seg', { role: 'radiogroup', 'aria-label': L('من ترشّح؟', 'Who are you nominating?') }, modes.map(([v, t, ic]) => h(`button${draft.mode === v ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(draft.mode === v), onclick: () => { draft.mode = v; draft.nominee_id = v === 'self' ? ctx.user.id : ''; redraw(); } }, icon(ic), t))) : null;
    const chosen = dir.find((u) => u.id === draft.nominee_id);
    const picker = draft.mode === 'colleague' ? h('div.form-row', h('label.lbl', { for: 'aw-nominee' }, L('المرشَّح', 'Nominee')),
      peopleSelect(pool.filter((u) => u.id !== ctx.user.id && !p.my_nominees.includes(u.id)), { id: 'aw-nominee', value: draft.nominee_id, 'data-fk': 'nominee', onchange: (e) => { draft.nominee_id = e.target.value; redraw(); } }),
      h('div.helper', L(`تظهر فقط الفئة المؤهلة: ${ELIG[p.eligibility][0]}${p.my_nominees.length ? ' — ومن رشّحتهم سابقاً لا يظهرون' : ''}`, `Only eligible people are listed: ${ELIG[p.eligibility][1]}${p.my_nominees.length ? ' — people you already nominated are hidden' : ''}`))) : null;
    who = h('div.aw-who', seg, picker,
      chosen || draft.mode === 'self' ? h('div.aw-nominee-card', avatar((chosen || ctx.user).name_ar), h('div.grow', h('strong', nm(chosen || ctx.user)), h('span.faint', [title(chosen || ctx.user), dept(chosen || ctx.user)].filter(Boolean).join(' · '))),
        h('span.chip.tiny.info', icon(draft.mode === 'self' ? 'user' : 'hourglass'), draft.mode === 'self' ? L('ترشيح ذاتي — يُرسل مباشرة', 'Self — submitted directly') : L('سيُطلب منه الموافقة', 'Will be asked to consent'))) : null);
  }
  return h('div.aw-step', cats, h('fieldset.aw-fieldset', h('legend', p.eligibility === 'team' ? L('الفريق', 'Team') : L('من ترشّح؟', 'Who are you nominating?')), who));
}

function stepWhy(ctx, me, p) {
  const counter = (el, n) => { el.textContent = `${fmtNum(n)} / 2000`; el.classList.toggle('ok', n >= MIN_JUST); };
  const sumCount = h('span.aw-count.num');
  const summary = h('div.form-row', h('label.lbl', { for: 'aw-summary' }, L('عنوان الترشيح', 'Headline'), h('span.req', ' *')),
    h('input.field.lg', { id: 'aw-summary', 'data-fk': 'summary', maxlength: 300, value: draft.summary, placeholder: L('جملة واحدة تلخص سبب التميّز — مثال: أسست نموذج الاستقبال الموحد وخفّضت زمن الانتظار', 'One sentence on why — e.g. launched the unified reception model and cut waiting time'), oninput: (e) => { draft.summary = e.target.value; sumCount.textContent = `${fmtNum(e.target.value.length)} / 300`; liveChecks(p); } }),
    h('div.helper', L('يظهر هذا العنوان للجنة، ويُقترح نصاً لشهادة التكريم إن فاز المرشح.', 'Shown to the committee and suggested as the certificate citation if the nominee wins.'), ' ', sumCount));
  sumCount.textContent = `${fmtNum(draft.summary.length)} / 300`;
  return h('div.aw-step',
    h('p.aw-step-intro', L('اكتب لكل معيار أمثلة محددة ونتائج قابلة للقياس. اللجنة تقيّم كل معيار من 1 إلى 5 وفق الأوصاف الظاهرة.', 'For each criterion give specific examples and measurable results. The committee scores each 1–5 against the descriptors shown.')),
    summary,
    p.criteria.map((c, i) => {
      const cnt = h('span.aw-count.num');
      const five = c.descriptors.find((d) => d.level === 5);
      const ta = h('textarea.field', { id: `aw-j-${c.id}`, 'data-fk': `j-${c.id}`, rows: 4, maxlength: 2000, placeholder: L('ماذا فعل؟ ما النتيجة؟ كيف نعرف؟', 'What was done? What changed? How do we know?'), oninput: (e) => { draft.justifications[c.id] = e.target.value; counter(cnt, e.target.value.trim().length); liveChecks(p); } }, draft.justifications[c.id] || '');
      counter(cnt, (draft.justifications[c.id] || '').trim().length);
      return h('div.aw-just',
        h('div.aw-just-head', h('span.aw-just-n', String(i + 1)), h('label.grow', { for: `aw-j-${c.id}` }, h('strong', nm(c))), h('span.chip.tiny.outline.num', `${fmtNum(c.weight)}%`)),
        five ? h('p.aw-just-hint', icon('star'), L('المستوى المتميز: ', 'Outstanding: '), L(five.ar, five.en || five.ar)) : null,
        ta, h('div.aw-just-foot', h('span.faint.tiny', L(`${MIN_JUST} حرفاً على الأقل`, `At least ${MIN_JUST} characters`)), cnt));
    }));
}

function stepEvidence(ctx, me, p) {
  const list = h('div.aw-ev-list');
  const draw = () => list.replaceChildren(...(draft.evidence.length ? draft.evidence.map((e, i) => h('div.aw-ev',
    h('span.aw-ev-ic', icon(e.link?.startsWith('#/projects') ? 'folder' : e.link ? 'link' : 'fileText')),
    h('div.aw-ev-fields',
      h('input.field', { value: e.title, 'data-fk': `ev-t-${i}`, maxlength: 200, 'aria-label': L('عنوان الدليل', 'Evidence title'), placeholder: L('عنوان الدليل — مثال: تقرير مؤشرات الربع الثالث', 'Title — e.g. Q3 indicators report'), oninput: (ev) => { e.title = ev.target.value; } }),
      h('input.field', { value: e.link || '', 'data-fk': `ev-l-${i}`, maxlength: 500, dir: 'ltr', 'aria-label': L('رابط (اختياري)', 'Link (optional)'), placeholder: 'https://…', oninput: (ev) => { e.link = ev.target.value; } }),
      h('input.field', { value: e.note || '', 'data-fk': `ev-n-${i}`, maxlength: 500, 'aria-label': L('ملاحظة (اختياري)', 'Note (optional)'), placeholder: L('ملاحظة مختصرة (اختياري)', 'Short note (optional)'), oninput: (ev) => { e.note = ev.target.value; } })),
    h('button.icon-btn', { type: 'button', 'aria-label': L('حذف الدليل', 'Remove evidence'), onclick: () => { draft.evidence.splice(i, 1); draw(); } }, icon('trash')))) : [h('div.aw-ev-empty', icon('clip'), h('span', L('الأدلة اختيارية لكنها ترفع جودة التقييم: تقارير، مؤشرات، رسائل شكر، روابط مشاريع.', 'Evidence is optional but strengthens the review: reports, indicators, thank-you notes, project links.')))]));
  draw();
  const add = h('button.btn', { type: 'button', disabled: draft.evidence.length >= 10 || null, onclick: () => { draft.evidence.push({ title: '', link: '', note: '' }); draw(); list.querySelector('.aw-ev:last-child input')?.focus(); } }, icon('plus'), L('إضافة دليل', 'Add evidence'));
  const fromProjects = h('button.btn.tertiary', { type: 'button', onclick: async (e) => {
    const btn = e.currentTarget;
    const projects = await act(btn, () => api('/api/projects'));
    if (!projects) return;
    menu(btn, projects.length ? projects.slice(0, 12).map((pr) => ({ label: pr.name, icon: 'folder', onClick: () => { if (draft.evidence.length < 10 && !draft.evidence.some((x) => x.link === `#/projects/${pr.id}`)) { draft.evidence.push({ title: pr.name, link: `#/projects/${pr.id}`, note: '' }); draw(); } } })) : [{ title: L('لا توجد مشاريع متاحة لك', 'No projects available to you') }]);
  } }, icon('folder'), L('إضافة من مشاريعي', 'Add from my projects'));
  return h('div.aw-step', h('p.aw-step-intro', L('أرفق ما يثبت الأثر. الروابط الداخلية للمشاريع تفتح فقط لمن يملك صلاحية الاطلاع عليها.', 'Attach proof of impact. Internal project links open only for people allowed to see them.')), list, h('div.btn-group', add, fromProjects));
}

function stepReview(ctx, me, p, dir) {
  const cat = p.categories.find((c) => c.id === draft.category_id);
  const nominee = dir.find((u) => u.id === draft.nominee_id) || (draft.mode === 'self' ? ctx.user : null);
  const team = draft.mode === 'team' ? [...new Set([draft.nominee_id, ...draft.team_member_ids])].map((id) => dir.find((u) => u.id === id)).filter(Boolean) : [];
  const ex = draft.mode === 'self' ? h('div.aw-excel-opt',
    h('label.check-label', h('input', { type: 'checkbox', checked: draft.attach_excellence || null, onchange: (e) => { draft.attach_excellence = e.target.checked; } }), h('span', h('strong', L('أرفق ملخص نقاط التميّز الخاص بي', 'Attach my excellence-points summary')), h('span.faint.block', L('ملخص محسوب من عملك الفعلي في المنصة (المستوى، النقاط، الشارات) — يراه أعضاء اللجنة فقط.', 'Computed from your real work (level, points, badges) — visible to the committee only.')))),
    preview ? excellenceMini(preview) : null) : h('div.callout.aw-consent-note', icon('hourglass'), L('سيصل إشعار إلى المرشح لمراجعة الترشيح والموافقة عليه، ويمكنه إرفاق ملخص نقاط التميّز الخاص به. لا يصل الترشيح إلى اللجنة دون موافقته.', 'The nominee is notified to review and consent, and may attach their own excellence summary. Nothing reaches the committee without their consent.'));
  return h('div.aw-step',
    h('div.aw-review-top', medal(p.kind), h('div.grow', h('strong', nm(p)), h('span.faint', cat ? nm(cat) : '—')),
      team.length ? h('div.aw-review-team', h('strong', draft.team_name), h('span.faint', team.map(nm).join('، '))) : nominee ? h('div.aw-review-who', avatar(nominee.name_ar), h('div', h('strong', nm(nominee)), h('span.faint', dept(nominee)))) : null),
    h('blockquote.aw-quote', draft.summary),
    h('ol.aw-review-just', p.criteria.map((c) => h('li', h('div.aw-review-crit', h('strong', nm(c)), h('span.chip.tiny.outline.num', `${fmtNum(c.weight)}%`)), h('p', draft.justifications[c.id] || '')))),
    draft.evidence.length ? h('div.aw-review-ev', h('h3.aw-sub', L('الأدلة', 'Evidence')), h('ul', draft.evidence.map((e) => h('li', icon(e.link ? 'link' : 'fileText'), e.title)))) : null,
    ex,
    h('p.aw-privacy', icon('lockKeyhole'), L('بإرسال الترشيح تؤكد صحة المعلومات. الترشيح سري: لا يطّلع عليه إلا أنت والمرشح، ثم لجنة الجوائز أثناء التقييم. المساعد الذكي لا يصل إلى الترشيحات.', 'By submitting you confirm the information is accurate. Only you and the nominee see it, then the awards committee during evaluation. Ask AI never reads nominations.')));
}

export function excellenceMini(x) {
  return h('div.aw-excel',
    h('div.aw-excel-level', h('span.aw-excel-orb', String(x.level.n)), h('div', h('strong', L(x.level.ar, x.level.en)), h('span.faint', L(`${fmtNum(x.xp)} نقطة تميّز · أفضل سلسلة ${fmtNum(x.streak_best)} يوم`, `${x.xp} excellence points · best streak ${x.streak_best} days`)))),
    x.badges.length ? h('div.aw-excel-badges', x.badges.map((b) => h('span.chip.tiny.sand', icon(b.icon || 'badgeCheck'), L(b.ar, b.en)))) : h('span.faint.tiny', L('لا شارات مكتسبة بعد', 'No badges earned yet')),
    x.at ? h('span.faint.tiny', L(`محسوب في ${fmtDate(x.at)}`, `Computed ${fmtDate(x.at)}`)) : null);
}

// Keep the side checklist in sync while typing (no re-render, so the caret stays put).
function liveChecks(p) {
  const li = document.querySelector('[data-live="just"]');
  if (!li) return;
  const filled = p.criteria.filter((c) => (draft.justifications[c.id] || '').trim().length >= MIN_JUST).length;
  const ok = draft.summary.trim().length >= 10 && filled === p.criteria.length;
  li.classList.toggle('ok', ok);
  li.replaceChildren(icon(ok ? 'circleCheck' : 'circleDashed'), h('span', L(`المبررات: ${fmtNum(filled)} من ${fmtNum(p.criteria.length)}`, `Justification: ${filled} of ${p.criteria.length}`)));
}

function summaryPanel(ctx, p, dir, idx) {
  const cat = p.categories.find((c) => c.id === draft.category_id);
  const nominee = dir.find((u) => u.id === draft.nominee_id) || (draft.mode === 'self' ? ctx.user : null);
  const filled = p.criteria.filter((c) => (draft.justifications[c.id] || '').trim().length >= MIN_JUST).length;
  const checks = [
    [!!cat, cat ? nm(cat) : L('الفئة', 'Category')],
    [!!nominee, draft.mode === 'team' ? (draft.team_name || L('الفريق', 'Team')) : nominee ? nm(nominee) : L('المرشح', 'Nominee')],
    [draft.summary.trim().length >= 10 && filled === p.criteria.length, L(`المبررات: ${fmtNum(filled)} من ${fmtNum(p.criteria.length)}`, `Justification: ${filled} of ${p.criteria.length}`)],
    [draft.evidence.length > 0, draft.evidence.length ? count(draft.evidence.length, ['دليل واحد', 'دليلان', 'أدلة', 'دليلاً'], ['item', 'items']) : L('الأدلة (اختياري)', 'Evidence (optional)')],
  ];
  return h('aside.aw-wiz-side',
    h('section.card.aw-wiz-summary',
      h('div.aw-prog-head', medal(p.kind, 'sm'), h('div.grow', eyebrow(L('ملخص الترشيح', 'Nomination summary')), h('strong', nm(p)))),
      h('ul.aw-checks', { 'aria-live': 'polite' }, checks.map(([ok, t], i) => h(`li${ok ? '.ok' : ''}`, { 'data-live': i === 2 ? 'just' : null }, icon(ok ? 'circleCheck' : 'circleDashed'), h('span', t)))),
      h('div.aw-wiz-meter', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': STEPS.length, 'aria-valuenow': idx, 'aria-label': L('التقدم في الخطوات', 'Step progress') }, h('i', { style: { width: `${Math.round((idx / (STEPS.length - 1)) * 100)}%` } }))),
    h('section.aw-wiz-note', icon('lockKeyhole'), h('div', h('strong', L('سري حتى إعلان النتائج', 'Confidential until results')), h('p', L('لا يطّلع على الترشيح إلا أنت والمرشح، ثم اللجنة أثناء التقييم مع تنحٍّ تلقائي لأعضاء إدارته.', 'Only you and the nominee see it, then the committee — members from the nominee’s department recuse automatically.')))),
    h('section.aw-wiz-note', icon('shieldBan'), h('div', h('strong', L('المساعد الذكي لا يصل إلى الترشيحات', 'Ask AI cannot read nominations')), h('p', L('سياسة البيانات تقفل الترشيحات والتقييمات أمام المساعد وMCP.', 'The data policy locks nominations and scores from Ask AI and MCP.')))));
}

async function submit(btn, p, ctx) {
  for (const k of ['who', 'why', 'evidence']) if (problems(p, k, ctx.user).length) { location.hash = href('nominate', p.id, k); return; }
  const body = {
    program_id: p.id, category_id: draft.category_id, summary: draft.summary.trim(),
    nominee_id: draft.mode === 'self' ? undefined : draft.nominee_id,
    justifications: p.criteria.map((c) => ({ criterion_id: c.id, text: (draft.justifications[c.id] || '').trim() })),
    evidence: draft.evidence.map((e) => ({ title: e.title.trim(), link: e.link?.trim() || undefined, note: e.note?.trim() || undefined })).filter((e) => e.title),
  };
  if (draft.mode === 'team') { body.team_name = draft.team_name.trim(); body.team_member_ids = draft.team_member_ids.filter((x) => x !== draft.nominee_id); }
  if (draft.mode === 'self' && draft.attach_excellence) body.attach_excellence = true;
  const r = await act(btn, () => call('/nominations', { method: 'POST', body }));
  if (!r) return;
  toast(draft.mode === 'self' ? L('أُرسل ترشيحك — بالتوفيق!', 'Your nomination was submitted — good luck!') : L('أُرسل الترشيح وأُبلغ المرشح لتأكيد موافقته', 'Nomination sent; the nominee was asked to consent'));
  draft = null; preview = null;
  location.hash = href('mine', r.id);
}
void title;
