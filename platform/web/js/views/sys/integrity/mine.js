// «إفصاحاتي» — the discloser's home: annual declaration (hero + guided wizard),
// «الإفصاح يحميك» privacy card with «من اطّلع على إفصاحي», active instructions,
// ad-hoc disclosures and my gifts.
import { h, icon, L, fmtDate, fmtNum, toast, formDialog, stepper, emptyState, grid, act, statusChip } from '../../../sys-kit.js';
import { call, DECL, GIFT, DECISION, INTEREST, MITIGATION, lbl, chip, demoChip, money, accessList, openRouted, isOpen, ring, count, daysWord } from './common.js';
import { openRecord, interestRow } from './record.js';
import { declareGift, giftTodo } from './gifts.js';

const STEPS = [{ ar: 'مسودة', en: 'Draft' }, { ar: 'مُقدَّم', en: 'Submitted' }, { ar: 'قيد المراجعة', en: 'Under review' }, { ar: 'القرار', en: 'Decision' }, { ar: 'مغلق', en: 'Closed' }];
const STEP_INDEX = { draft: 0, submitted: 1, under_review: 2, cleared: 3, mitigation: 3, closed: 4 };

export async function mineTab(env) {
  const { ov } = env;
  const c = ov.cycle; const d = ov.declaration;
  const canDeclare = c && c.status === 'open' && (!d || d.status === 'draft');
  const primary = canDeclare
    ? { label: d ? L('أكمل الإقرار', 'Continue declaration') : L('ابدأ الإقرار', 'Start declaration'), icon: 'fileSign', primary: true, onClick: () => openWizard(env) }
    : { label: L('أفصح عن هدية', 'Declare a gift'), icon: 'gift', primary: true, onClick: () => declareGift(env) };
  const actions = [{ label: L('إفصاح طارئ', 'Ad-hoc disclosure'), icon: 'shieldAlert', onClick: () => newDisclosure(env) }, primary];
  const body = h('div.integ-mine',
    giftTodo(env, 'mine'),
    grid('main-side', hero(env), protect(env)),
    ov.mitigations.length ? myInstructions(ov.mitigations) : null,
    grid('three', adhoc(env), myGifts(env), whoViewed(env)));
  // deep links: #/sys/integrity/mine/declare · #/sys/integrity/mine/<type>:<id>
  const p = env.params[0];
  if (p === 'declare' && canDeclare && !isOpen('declare')) setTimeout(() => openWizard(env), 0);
  else if (p && p.includes(':')) { const [t, id] = p.split(':'); if (['declaration', 'disclosure', 'gift'].includes(t)) setTimeout(() => openRecord(env, t, id, { tab: 'mine' }), 0); }
  return { actions, body };
}

// ---------------- hero: annual declaration ----------------
function hero(env) {
  const { ov } = env; const c = ov.cycle; const d = ov.declaration;
  if (!c) return h('section.card.integ-hero', h('div.integ-hero-main', h('span.eyebrow', L('الإقرار السنوي', 'Annual declaration')), h('h2.integ-hero-title', L('لا توجد دورة إقرار مفتوحة', 'No declaration cycle is open')),
    h('p.integ-hero-sub', L('سيُعلمك ضابط الامتثال عند فتح الدورة القادمة. ويمكنك في أي وقت تقديم إفصاح طارئ أو الإفصاح عن هدية.', 'The compliance officer will let you know when the next cycle opens. You can file an ad-hoc disclosure or declare a gift at any time.'))));
  const status = d ? d.status : 'not_started';
  const open = c.status === 'open';
  const due = fmtDate(c.due_on);
  const T = {
    not_started: [open ? L('إقرارك السنوي بانتظارك', 'Your annual declaration is waiting') : L('انتهت دورة الإقرار', 'The declaration cycle has ended'),
      open ? L(`دقيقتان فقط: اختر «لا يوجد تضارب» أو أفصح عن مصالحك. الموعد النهائي ${due}.`, `Two minutes: choose “no conflict” or declare your interests. Due ${due}.`) : L('تواصل مع ضابط الامتثال لتقديم إقرارك.', 'Contact the compliance officer to file your declaration.')],
    draft: [L('مسودتك محفوظة', 'Your draft is saved'), open ? L(`أكملها وقدّمها قبل ${due}. لا يطّلع أحد على المسودة.`, `Finish and submit before ${due}. Nobody sees drafts.`) : L('انتهت الدورة قبل التقديم؛ تواصل مع ضابط الامتثال.', 'The cycle ended before submission; contact the compliance officer.')],
    submitted: [L('شكراً — قُدّم إقرارك', 'Thank you — your declaration is submitted'), L('بانتظار مراجعة ضابط الامتثال، وسنُعلمك بالقرار. لا مطلوب منك شيء الآن.', 'Awaiting the compliance officer’s review; we will let you know. Nothing is needed from you now.')],
    under_review: [L('إقرارك قيد المراجعة', 'Your declaration is under review'), L('يراجعه ضابط الامتثال الآن. غالباً لا يلزم أي إجراء.', 'The compliance officer is reviewing it. Usually no action is needed.')],
    cleared: [L('إقرارك مُعتمد — لا يلزم أي إجراء', 'Cleared — no action needed'), L('شكراً لشفافيتك. حدّث إفصاحك بإفصاح طارئ إن تغيّر شيء خلال العام.', 'Thank you for your transparency. File an ad-hoc disclosure if anything changes during the year.')],
    mitigation: [L('اعتُمد إقرارك مع تعليمات', 'Approved with instructions'), L('التزم بالتعليمات أدناه. مديرك المباشر يرى التعليمات فقط، لا تفاصيل إفصاحك.', 'Follow the instructions below. Your line manager sees only the instructions, never your disclosure.')],
    closed: [L('أُغلق إقرارك لهذا العام', 'Your declaration is closed for this year'), L('شكراً لشفافيتك.', 'Thank you for your transparency.')],
  }[status];
  const summary = d ? [
    d.no_conflict === true ? h('span.chip.good', icon('badgeCheck'), L('لا يوجد تضارب', 'No conflict')) : d.interests.length ? h('span.chip.navy', icon('fileSign'), count(d.interests.length, ['مصلحة واحدة مُفصح عنها', 'مصلحتان مُفصح عنهما', 'مصالح مُفصح عنها', 'مصلحة مُفصح عنها'], ['declared interest', 'declared interests'])) : null,
    d.submitted_at ? h('span.chip.outline', icon('send'), L(`قُدّم ${fmtDate(d.submitted_at)}`, `Submitted ${fmtDate(d.submitted_at)}`)) : null,
    d.on_time ? h('span.chip.sand', icon('medal'), L('قبل الموعد · +10 نقاط تميّز', 'Before the deadline · +10 points')) : null,
  ] : [];
  const todo = open && (!d || d.status === 'draft');
  const side = todo ? ring(c) : h(`div.integ-hero-badge.${status}`, icon(status === 'cleared' || status === 'closed' ? 'badgeCheck' : status === 'mitigation' ? 'shieldAlert' : 'hourglass'));
  return h(`section.card.integ-hero${todo ? '.todo' : ''}`,
    h('div.integ-hero-main',
      h('div.integ-hero-eyebrow', h('span.eyebrow', L(`الإقرار السنوي لتضارب المصالح · ${c.year}`, `Annual conflict-of-interest declaration · ${c.year}`))),
      h('h2.integ-hero-title', T[0]),
      h('p.integ-hero-sub', T[1]),
      d?.status === 'draft' && d.return_note ? h('div.integ-note.warn', icon('reply'), h('div', h('strong', L('طلب ضابط الامتثال استيضاحاً', 'The compliance officer asked for clarification')), h('p', d.return_note))) : null,
      stepper(STEPS, STEP_INDEX[status] ?? 0, { label: L('مراحل الإقرار', 'Declaration stages') }),
      summary.filter(Boolean).length ? h('div.integ-hero-chips', summary) : null,
      h('div.integ-hero-actions',
        todo ? h('button.btn.primary.lg', { type: 'button', onclick: () => openWizard(env) }, icon('fileSign'), d ? L('أكمل الإقرار', 'Continue declaration') : L('ابدأ الإقرار', 'Start declaration')) : null,
        d && d.status !== 'draft' ? h('button.btn', { type: 'button', onclick: () => openRecord(env, 'declaration', d.id, { tab: 'mine' }) }, icon('eye'), L('عرض الإقرار', 'View declaration')) : null,
        todo ? h('span.integ-hero-hint', icon('lock'), L('تُحفظ مسودتك تلقائياً ولا يراها أحد', 'Drafts save automatically and are private')) : null)),
    h('div.integ-hero-side', side));
}

// ---------------- «الإفصاح يحميك» ----------------
function protect(env) {
  const rows = [
    ['eye', L('أنت وضابط الامتثال فقط', 'Only you and the compliance officer'), L('يطّلع على التفاصيل ضابط الامتثال وحده، وكل اطلاع يُسجَّل ويظهر لك أدناه.', 'Only the compliance officer reads the details; every view is logged below.')],
    ['userCheck', L('مديرك المباشر', 'Your line manager'), L('يرى التعليمات التي يلزمه تطبيقها فقط — دون أي تفاصيل.', 'Sees only instructions they must enforce — no details.')],
    ['eyeOff', L('الموارد البشرية والإدارة العليا ومدير المنصة', 'HR, leadership and the platform admin'), L('لا يطّلعون على بيانات فردية؛ مؤشرات مجمّعة فقط.', 'No individual data; aggregates only.')],
    ['shieldBan', L('المساعد الذكي', 'Ask AI'), L('لا يصل إلى هذه البيانات مطلقاً (سياسة مقفلة).', 'Never reaches this data (locked policy).')],
  ];
  return h('section.card.integ-protect',
    h('div.integ-protect-head', h('span.integ-protect-ic', icon('shield')), h('div', h('h2.card-title', L('الإفصاح يحميك', 'Disclosure protects you')), h('p.integ-protect-sub', L('الإفصاح لا يعني وجود مخالفة؛ إنه يحميك ويحمي قرارات الجهة.', 'Disclosing is not wrongdoing — it protects you and the entity’s decisions.')))),
    h('ul.integ-who', rows.map(([ic, t, s]) => h('li', h('span.integ-who-ic', icon(ic)), h('div', h('strong', t), h('span', s))))));
}
// «من اطّلع على إفصاحي» — every access by someone else to any of my records
function whoViewed(env) {
  const log = env.ov.access_log;
  const list = h('div.integ-log-host', accessList(log.slice(0, 5)));
  return h('section.card.integ-list-card.integ-log-card',
    h('div.card-head', h('h2.card-title', L('من اطّلع على إفصاحي', 'Who viewed my disclosures')), h('span.chip.tiny.outline', icon('history'), L('سجل كامل', 'Full log'))),
    h('p.integ-card-sub', L('كل اطلاع أو إجراء على إفصاحاتك من غيرك يُسجَّل هنا تلقائياً.', 'Every view or action on your disclosures by someone else is recorded here.')),
    list,
    log.length > 5 ? h('button.btn.sm.ghost.integ-more', { type: 'button', onclick: (e) => { list.replaceChildren(accessList(log)); e.currentTarget.remove(); } }, L(`عرض الكل (${fmtNum(log.length)})`, `Show all (${log.length})`)) : null);
}

function myInstructions(mits) {
  return h('section.card.integ-my-mits', h('div.card-head', h('h2.card-title', L('تعليمات يلزم الالتزام بها', 'Instructions to follow')), h('span.chip.tiny.purple', icon('shieldAlert'), L('سارية', 'In force'))),
    h('div.integ-mits', mits.map((m) => h('div.integ-mit', h('span.integ-kind-ic', icon(MITIGATION[m.kind]?.[2] || 'circleDot')),
      h('div.grow', h('div.integ-mit-top', h('span.chip.tiny.purple', lbl(MITIGATION, m.kind)), h('span.chip.tiny.outline', icon(m.manager_visible ? 'userCheck' : 'eyeOff'), m.manager_visible ? L('يراها مديرك المباشر', 'Visible to your manager') : L('خاصة بك', 'Private to you'))),
        h('strong.integ-mit-text', m.instruction), h('span.tiny.faint', `${m.matter} · ${L('منذ', 'since')} ${fmtDate(m.created_at)}`))))));
}

// ---------------- ad-hoc disclosures ----------------
function adhoc(env) {
  const list = env.ov.disclosures;
  return h('section.card.integ-list-card',
    h('div.card-head', h('h2.card-title', L('الإفصاحات الطارئة', 'Ad-hoc disclosures')), h('button.btn.sm.tertiary', { type: 'button', onclick: () => newDisclosure(env) }, icon('plus'), L('إفصاح جديد', 'New disclosure'))),
    h('p.integ-card-sub', L('عند نشوء موقف خلال العام: عضوية لجنة، مناقصة، علاقة جديدة بطرف متعامل…', 'When a situation arises during the year: a committee, a tender, a new relationship…')),
    list.length ? h('ul.list.integ-rows', list.map((x) => h('li.clickable', { tabindex: 0, role: 'button', onclick: () => openRecord(env, 'disclosure', x.id, { tab: 'mine' }), onkeydown: (e) => { if (e.key === 'Enter') openRecord(env, 'disclosure', x.id, { tab: 'mine' }); } },
      h('span.integ-row-ic', icon('shieldAlert')), h('div.grow', h('div.title', x.matter), h('div.meta', `${x.related_party} · ${fmtDate(x.submitted_at)}`)), statusChip(x.status, DECL))))
      : emptyState({ compact: true, icon: 'shieldQuestion', title: L('لا إفصاحات طارئة', 'No ad-hoc disclosures'), body: L('إن نشأ موقف قد يُفهم كتعارض، أفصح عنه فوراً — هذا يحميك.', 'If a situation could look like a conflict, disclose it right away — it protects you.'), actions: [{ label: L('إفصاح طارئ', 'Ad-hoc disclosure'), icon: 'plus', onClick: () => newDisclosure(env) }] }));
}
export async function newDisclosure(env) {
  const providers = (await call('/policy').catch(() => ({ providers: [] }))).providers;
  const v = await formDialog({
    title: L('إفصاح طارئ', 'Ad-hoc disclosure'), wide: true,
    intro: L('صف الموقف باختصار ودون حرج: سيراجعه ضابط الامتثال وحده ويقترح ما يلزم — وغالباً يكفي التنحي عن مسألة محددة.', 'Describe the situation briefly: only the compliance officer reviews it and suggests what is needed — usually stepping back from one matter is enough.'),
    fields: [
      { name: 'matter', label: L('الموقف أو المسألة', 'Situation or matter'), required: true, full: true, maxLength: 300, placeholder: L('مثال: عضوية لجنة تقييم عروض توريد أجهزة الحاسب', 'e.g. Member of the evaluation committee for a laptop tender') },
      { name: 'related_party', label: L('الطرف ذو العلاقة', 'Related party'), required: true, maxLength: 200, placeholder: L('اسم الشركة أو الشخص', 'Company or person') },
      { name: 'provider_id', label: L('مقدّم خدمة مسجّل (اختياري)', 'Registered provider (optional)'), type: 'select', options: providers.map((p) => ({ value: p.id, label: L(p.name_ar, p.name_en) })), placeholder: L('— ليس مقدّم خدمة مسجّلاً —', '— Not a registered provider —') },
      { name: 'relationship', label: L('طبيعة العلاقة', 'Relationship'), type: 'textarea', rows: 3, maxLength: 1000, placeholder: L('مثال: ابن عمي يعمل مديراً للمبيعات لديهم', 'e.g. My cousin is their sales manager') },
      { name: 'proposed_recusal', label: L('ما تقترحه', 'What you propose'), type: 'textarea', rows: 2, maxLength: 1000, placeholder: L('مثال: أتنحى عن تقييم عرضهم', 'e.g. I step back from evaluating their bid') },
    ],
    submitLabel: L('تقديم الإفصاح', 'Submit disclosure'),
  });
  if (!v) return;
  const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x != null && x !== ''));
  try { await call('/disclosures', { method: 'POST', body }); toast(L('قُدّم إفصاحك — شكراً لشفافيتك', 'Disclosure submitted — thank you')); }
  catch (e) { toast(e.message, { kind: 'error' }); }
}

// ---------------- my gifts ----------------
function myGifts(env) {
  const gifts = env.ov.gifts.slice(0, 4);
  return h('section.card.integ-list-card',
    h('div.card-head', h('h2.card-title', L('هداياي', 'My gifts')), h('a.btn.sm.ghost', { href: '#/sys/integrity/gifts' }, L('سجل الهدايا', 'Gift register'), icon('chevron', 'flip-rtl'))),
    h('p.integ-card-sub', L('أفصح عن أي هدية أو ضيافة خلال 5 أيام — حتى لو اعتذرت عنها.', 'Declare any gift or hospitality within 5 days — even if you declined it.')),
    gifts.length ? h('ul.list.integ-rows', gifts.map((g) => h('li.clickable', { tabindex: 0, role: 'button', onclick: () => openRecord(env, 'gift', g.id, { tab: 'mine' }), onkeydown: (e) => { if (e.key === 'Enter') openRecord(env, 'gift', g.id, { tab: 'mine' }); } },
      h('span.integ-row-ic', icon('gift')), h('div.grow', h('div.title', g.description), h('div.meta', `${g.giver_name} · ${money(g.value_aed)}`)),
      g.decision ? chip(DECISION, g.decision) : statusChip(g.status, GIFT), g.status === 'decided' ? h('span.chip.tiny.warn', icon('alarm'), L('أكّد التنفيذ', 'Confirm')) : null)))
      : emptyState({ compact: true, icon: 'gift', title: L('لم تُفصح عن هدايا', 'No gifts declared'), body: L('تلقيت هدية أو دعوة؟ سيقترح النظام القرار وفق السياسة فوراً.', 'Received a gift or invitation? The system proposes a decision instantly.'), actions: [{ label: L('أفصح عن هدية', 'Declare a gift'), icon: 'gift', onClick: () => declareGift(env) }] }),
    gifts.length ? h('div.card-foot', h('span', L(`هذا العام: ${fmtNum(env.ov.gifts.length)}`, `All: ${fmtNum(env.ov.gifts.length)}`)), h('button.btn.sm.tertiary', { type: 'button', onclick: () => declareGift(env) }, icon('plus'), L('أفصح عن هدية', 'Declare a gift'))) : null);
}

// ---------------- guided wizard ----------------
export async function openWizard(env) {
  if (isOpen('declare')) return;
  const c = env.ov.cycle; const d = env.ov.declaration;
  const providers = (await call('/policy').catch(() => ({ providers: [] }))).providers;
  const st = { step: 0, no_conflict: d?.no_conflict ?? null, interests: (d?.interests || []).map((i) => ({ kind: i.kind, party_name: i.party_name, provider_id: i.provider?.id || '', details: i.details || '' })), statement: d?.statement || '', attest: false, adding: null };
  if (st.no_conflict !== null) st.step = st.no_conflict ? 2 : 1;
  const sheet = openRouted('mine', 'declare', { title: L(`الإقرار السنوي ${c.year}`, `Annual declaration ${c.year}`), subtitle: L(`الموعد النهائي ${fmtDate(c.due_on)} · تُحفظ مسودتك عند كل خطوة`, `Due ${fmtDate(c.due_on)} · your draft is saved at every step`), body: h('div'), wide: true });
  const save = () => call('/declarations/current', { method: 'PUT', body: { no_conflict: st.no_conflict ?? undefined, statement: st.statement || undefined, interests: st.no_conflict ? [] : st.interests.map((i) => ({ kind: i.kind, party_name: i.party_name, provider_id: i.provider_id || undefined, details: i.details || undefined })) } });
  const W = [{ ar: 'هل لديك ما تفصح عنه؟', en: 'Anything to declare?' }, { ar: 'المصالح', en: 'Interests' }, { ar: 'المراجعة والإقرار', en: 'Review & attest' }];
  const draw = () => {
    const stepEl = [choose, interests, review][st.step]();
    const back = st.step > 0 ? h('button.btn', { type: 'button', onclick: () => { st.step = st.step === 2 && st.no_conflict ? 0 : st.step - 1; draw(); } }, icon('chevronL', 'flip-rtl'), L('السابق', 'Back')) : h('span');
    const next = st.step < 2
      ? h('button.btn.primary', { type: 'button', disabled: (st.step === 0 && st.no_conflict === null) || (st.step === 1 && !st.interests.length) || null, onclick: async (e) => {
        const r = await act(e.currentTarget, save); if (!r) return;
        st.step = st.step === 0 && st.no_conflict ? 2 : st.step + 1; draw();
      } }, L('حفظ ومتابعة', 'Save & continue'), icon('chevron', 'flip-rtl'))
      : h('div.btn-group',
        h('button.btn', { type: 'button', onclick: async (e) => { const r = await act(e.currentTarget, save, { success: L('حُفظت المسودة', 'Draft saved') }); if (r) sheet.close(); } }, L('حفظ كمسودة', 'Save draft')),
        h('button.btn.primary', { type: 'button', disabled: !st.attest || null, onclick: async (e) => {
          const r = await act(e.currentTarget, async () => { const saved = await save(); return call(`/declarations/${saved.id}/submit`, { method: 'POST', body: { attest: true } }); });
          if (!r) return;
          sheet.close();
          toast(r.on_time ? L('قُدّم إقرارك قبل الموعد — شكراً لشفافيتك (+10 نقاط تميّز)', 'Submitted before the deadline — thank you (+10 points)') : L('قُدّم إقرارك — شكراً لشفافيتك', 'Declaration submitted — thank you'));
          import('../../../game.js').then((g) => g.celebrate?.(document.querySelector('.integ-hero'), { big: true })).catch(() => {});
        } }, icon('send'), L('تقديم الإقرار', 'Submit declaration')));
    sheet.setBody(h('div.integ-wizard',
      stepper(W, st.step, { label: L('خطوات الإقرار', 'Declaration steps') }),
      h('div.integ-wizard-step', stepEl),
      h('div.integ-wizard-bar', back, h('span.integ-wizard-count', L(`الخطوة ${st.step + 1} من 3`, `Step ${st.step + 1} of 3`)), next)));
  };
  const choice = (val, ic, title, sub) => h(`button.integ-choice-card${st.no_conflict === val ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(st.no_conflict === val), onclick: () => { st.no_conflict = val; if (val) st.interests = []; draw(); } },
    h('span.integ-choice-ic', icon(ic)), h('strong', title), h('span', sub), h('span.integ-choice-tick', { 'aria-hidden': 'true' }, icon('check')));
  function choose() {
    return h('div', h('h3.integ-step-title', L('هل لديك مصالح قد تتعارض مع عملك في الجهة؟', 'Do you have interests that could conflict with your work?')),
      h('p.integ-step-sub', L('فكّر في: مصالح مالية، أقارب يعملون في الجهة أو لدى مورد، عمل خارجي أو عضوية مجالس، علاقات بمقدّمي خدمات.', 'Think of: financial interests, relatives in the entity or at a supplier, outside roles or board seats, relationships with providers.')),
      h('div.integ-choice-grid', { role: 'radiogroup', 'aria-label': L('نوع الإقرار', 'Declaration type') },
        choice(true, 'badgeCheck', L('لا يوجد لدي تضارب مصالح', 'I have no conflict of interest'), L('لا مصالح أو علاقات قد تؤثر في قراراتي الوظيفية.', 'No interests or relationships that could affect my decisions.')),
        choice(false, 'fileSign', L('لدي مصالح أفصح عنها', 'I have interests to declare'), L('سيقترح ضابط الامتثال ما يلزم — وغالباً لا يلزم شيء.', 'The compliance officer suggests what is needed — often nothing.'))),
      h('div.integ-examples', h('span.eyebrow', L('أمثلة على ما يُفصح عنه', 'Examples of what to declare')),
        h('ul', Object.keys(INTEREST).filter((k) => k !== 'other').map((k) => h('li', h('span.integ-kind-ic', icon(INTEREST[k][2])), h('div', h('strong', lbl(INTEREST, k)), h('span', L(INTEREST[k][3], INTEREST[k][4])))))),
        h('p.integ-examples-foot', icon('lock'), L('ما تكتبه لا يطّلع عليه إلا ضابط الامتثال، ولا يُعد الإفصاح اعترافاً بمخالفة.', 'Only the compliance officer reads what you write; disclosing is not an admission of wrongdoing.'))));
  }
  function interests() {
    const a = st.adding || (st.adding = { kind: 'provider', party_name: '', provider_id: '', details: '' });
    const err = h('div.error-text', { 'aria-live': 'polite' });
    const party = h('input.field', { id: 'iw-party', value: a.party_name, maxlength: 200, placeholder: L(INTEREST[a.kind][3], INTEREST[a.kind][4]), oninput: (e) => { a.party_name = e.target.value; } });
    const details = h('textarea.field', { id: 'iw-details', rows: 3, maxlength: 1000, placeholder: L('صف المصلحة باختصار: طبيعتها، نسبتها أو دور القريب…', 'Describe it briefly: nature, share, the relative’s role…'), oninput: (e) => { a.details = e.target.value; } }, a.details);
    const prov = h('select.field', { id: 'iw-prov', onchange: (e) => { a.provider_id = e.target.value; const p = providers.find((x) => x.id === e.target.value); if (p && !a.party_name) { a.party_name = L(p.name_ar, p.name_en).replace(/\s*\((تجريبية|demo)\)\s*$/, ''); party.value = a.party_name; } } },
      h('option', { value: '' }, L('— ليس مقدّم خدمة مسجّلاً —', '— Not a registered provider —')), providers.map((p) => h('option', { value: p.id, selected: a.provider_id === p.id || null }, L(p.name_ar, p.name_en))));
    return h('div', h('h3.integ-step-title', L('ما المصالح التي تفصح عنها؟', 'Which interests are you declaring?')),
      h('p.integ-step-sub', L('أضف كل مصلحة على حدة. التفاصيل لا يطّلع عليها إلا ضابط الامتثال.', 'Add each interest separately. Only the compliance officer sees the details.')),
      st.interests.length ? h('ul.integ-interests.editable', st.interests.map((i, k) => h('li.integ-interest', h('span.integ-kind-ic', icon(INTEREST[i.kind][2])), h('div.grow', h('div.integ-interest-top', h('strong', i.party_name), h('span.chip.tiny.outline', lbl(INTEREST, i.kind)), i.provider_id ? h('span.chip.tiny.navy', icon('handshake'), L('مقدّم خدمة', 'Provider')) : null), i.details ? h('p', i.details) : null),
        h('button.icon-btn', { type: 'button', 'aria-label': L(`حذف «${i.party_name}»`, `Remove “${i.party_name}”`), onclick: () => { st.interests.splice(k, 1); draw(); } }, icon('trash'))))) : null,
      h('div.integ-add', h('div.integ-add-title', icon('plus'), L(st.interests.length ? 'إضافة مصلحة أخرى' : 'أضف أول مصلحة', st.interests.length ? 'Add another interest' : 'Add your first interest')),
        h('div.integ-kind-grid', { role: 'radiogroup', 'aria-label': L('نوع المصلحة', 'Interest type') }, Object.keys(INTEREST).map((k) => h(`button.integ-kind${a.kind === k ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(a.kind === k), onclick: () => { a.kind = k; draw(); } }, icon(INTEREST[k][2]), h('span', lbl(INTEREST, k))))),
        h('div.form-grid',
          h('div.form-row', h('label.lbl', { for: 'iw-party' }, L('الجهة أو الطرف', 'Party'), h('span.req', ' *')), party),
          h('div.form-row', h('label.lbl', { for: 'iw-prov' }, L('مرتبطة بمقدّم خدمة مسجّل؟', 'Linked to a registered provider?')), prov),
          h('div.form-row.full', h('label.lbl', { for: 'iw-details' }, L('التفاصيل', 'Details')), details)),
        err,
        h('button.btn.tertiary', { type: 'button', onclick: () => {
          if (a.party_name.trim().length < 2) { err.textContent = L('اكتب اسم الجهة أو الطرف.', 'Enter the party name.'); party.focus(); return; }
          st.interests.push({ ...a, party_name: a.party_name.trim(), details: a.details.trim() }); st.adding = null; draw();
          toast(L('أُضيفت المصلحة — احفظ وتابع عند الانتهاء', 'Interest added — save & continue when done'), { kind: 'info', timeout: 2500 });
        } }, icon('plus'), L('إضافة إلى الإقرار', 'Add to declaration'))));
  }
  function review() {
    const attest = h('input', { type: 'checkbox', id: 'iw-attest', checked: st.attest || null, onchange: (e) => { st.attest = e.target.checked; draw(); } });
    return h('div', h('h3.integ-step-title', L('راجع إقرارك', 'Review your declaration')),
      st.no_conflict ? h('div.integ-verdict.good', icon('badgeCheck'), h('div', h('strong', L('لا يوجد لدي تضارب مصالح', 'No conflict of interest')), h('p', L('يمكنك العودة لتغيير اختيارك قبل التقديم.', 'You can go back and change this before submitting.'))))
        : h('ul.integ-interests', st.interests.map((i) => interestRow({ ...i, provider: i.provider_id ? {} : null }))),
      h('div.form-row', h('label.lbl', { for: 'iw-statement' }, L('ملاحظة إضافية (اختياري)', 'Additional note (optional)')), h('textarea.field', { id: 'iw-statement', rows: 2, maxlength: 2000, oninput: (e) => { st.statement = e.target.value; } }, st.statement)),
      h('label.integ-attest', { for: 'iw-attest' }, attest, h('span', L('أقرّ بأن المعلومات أعلاه صحيحة وكاملة، وأتعهد بتحديثها فور تغيّرها بإفصاح طارئ.', 'I confirm the information above is true and complete, and I will update it through an ad-hoc disclosure if anything changes.'))));
  }
  draw();
}
