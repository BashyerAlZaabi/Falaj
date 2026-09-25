// Awards › «ترشيحاتي» — nominations I received (consent, excellence summary,
// withdrawal) and nominations I submitted (status only). Scores are never shown.
import { h, icon, L, fmtDate, toast, modal, confirmDialog, emptyState, act, timeline, stepper, avatar } from '../../../sys-kit.js';
import { call, refresh, href, N_STATUS, NKIND, EVENT, chip, demoChip, nm, dept, medal, person, teamStack, back, restricted, eyebrow, count } from './common.js';
import { excellenceMini } from './nominate.js';

const FLOW = [
  { ar: 'تقديم الترشيح', en: 'Submitted' },
  { ar: 'موافقة المرشح', en: 'Consent' },
  { ar: 'تقييم اللجنة', en: 'Committee review' },
  { ar: 'إعلان النتائج', en: 'Results' },
];
const stageOf = (s) => ({ awaiting_consent: 1, submitted: 2, in_evaluation: 2, winner: 4, not_selected: 4, declined: 1, withdrawn: 1, lapsed: 1 }[s] ?? 0);
const failed = (s) => ['declined', 'withdrawn', 'lapsed'].includes(s);

export async function view(ctx, me, rest) {
  if (rest[0]) return detail(ctx, me, rest[0]);
  const data = await call('/nominations');
  const pending = [...data.as_nominee, ...data.as_nominator].filter((x) => x.can_consent);
  const wrap = h('div.aw-mine', restricted());
  if (pending.length) wrap.append(h('div.aw-consent-strip', pending.map((x) => consentTeaser(x))));
  const col = (titleText, sub, list, empty) => h('section.card.aw-mine-col',
    h('div.aw-card-head', h('h2.card-title', titleText), h('span.faint.tiny', sub)),
    list.length ? h('ul.aw-nom-list', list.map((x) => row(x))) : empty);
  wrap.append(h('div.sys-grid.two',
    col(L('ترشيحات لي', 'Nominations for me'), L('ما كُتب عنك وحالته — دون درجات', 'What was written about you and its status — no scores'), data.as_nominee,
      emptyState({ compact: true, icon: 'award', title: L('لا ترشيحات لك بعد', 'No nominations for you yet'), body: L('عندما يرشّحك زميل ستصلك دعوة لمراجعة الترشيح والموافقة عليه.', 'When a colleague nominates you, you’ll be asked to review and consent.') })),
    col(L('ترشيحات قدّمتها', 'Nominations I submitted'), L('تتابع الحالة فقط؛ التقييم سري', 'You follow the status; scoring stays confidential'), data.as_nominator,
      emptyState({ compact: true, icon: 'userPlus', title: L('لم تقدّم ترشيحاً بعد', 'You haven’t nominated anyone yet'), body: me.open_programs ? L('كرّم زميلاً تميّز في خدمته — يستغرق الترشيح بضع دقائق.', 'Recognise a colleague — it takes a few minutes.') : L('ستتمكن من الترشيح عند فتح دورة جديدة.', 'You can nominate when a new cycle opens.'),
        actions: me.open_programs ? [{ label: L('رشّح زميلاً', 'Nominate a colleague'), primary: true, icon: 'userPlus', onClick: () => { location.hash = href('nominate'); } }] : [] }))));
  return wrap;
}

function consentTeaser(x) {
  return h('a.aw-consent-card', { href: href('mine', x.id) },
    h('span.aw-consent-glow', { 'aria-hidden': 'true' }),
    medal(x.program.kind, 'lg'),
    h('div.grow',
      eyebrow(L('بانتظار موافقتك', 'Awaiting your consent'), 'sparkle'),
      h('strong.aw-consent-title', x.team_name ? L(`رُشّح فريقك «${x.team_name}» لـ«${nm(x.program)}»`, `Your team “${x.team_name}” was nominated for “${nm(x.program)}”`) : L(`رُشّحت لـ«${nm(x.program)}»`, `You were nominated for “${nm(x.program)}”`)),
      h('span.aw-consent-meta', L(`فئة «${nm(x.category)}» · من ${nm(x.nominator)} · يغلق الترشيح ${fmtDate(x.program.nomination_closes)}`, `“${nm(x.category)}” · by ${nm(x.nominator)} · closes ${fmtDate(x.program.nomination_closes)}`))),
    h('span.btn.primary.aw-consent-cta', L('راجع ووافق', 'Review & consent'), icon('chevron', 'flip-rtl')));
}

function row(x) {
  const who = x.role === 'nominee' ? (x.kind === 'self' ? L('ترشيح ذاتي', 'Self-nomination') : L(`من ${nm(x.nominator)}`, `By ${nm(x.nominator)}`)) : (x.team_name || nm(x.nominee));
  return h('li', h('a.aw-nom-row', { href: href('mine', x.id) },
    medal(x.program.kind, 'sm'),
    h('div.grow', h('strong', nm(x.program)), h('span.faint', [nm(x.category), who, fmtDate(x.created_at)].join(' · '))),
    h('div.aw-nom-status', chip(N_STATUS, x.status), demoChip(x)),
    icon('chevron', 'flip-rtl aw-row-chev')));
}

async function detail(ctx, me, id) {
  const n = await call(`/nominations/${id}`);
  const isNominee = n.view === 'nominee';
  const lead = n.nominee?.id === ctx.user.id;
  const result = n.result?.winner && n.program.status === 'announced';
  const main = [];
  if (result) {
    main.push(h('section.aw-win-banner', h('span.aw-win-rays', { 'aria-hidden': 'true' }), medal(n.program.kind, 'xl'),
      h('div.grow', eyebrow(L('صدرت النتائج', 'Results announced'), 'party'), h('h2', isNominee ? L('مبروك! فزت بالجائزة', 'Congratulations — you won!') : L('فاز من رشّحته', 'Your nominee won')),
        h('p', L(n.result.citation_ar || '', n.result.citation_en || n.result.citation_ar || ''))),
      h('a.btn.lg.aw-hero-btn', { href: href('hall', n.id) }, icon('award'), L('عرض الشهادة', 'View certificate'))));
  } else if (n.status === 'not_selected' && n.program.status === 'announced') {
    main.push(h('div.callout.aw-result-note', icon('heartHandshake'), L('صدرت نتائج هذه الدورة ولم يُختر هذا الترشيح. شكراً على المشاركة — التميّز يستحق الترشيح دائماً.', 'Results are out and this nomination was not selected. Thank you — excellence always deserves recognition.')));
  }
  if (n.can_consent) main.push(consentPanel(n));
  main.push(h('section.card.aw-nom-body',
    h('div.aw-card-head', h('h2.card-title', L('الترشيح', 'Nomination')), h('span.chip.tiny.outline', L(...NKIND[n.kind]))),
    h('blockquote.aw-quote', n.summary),
    h('ol.aw-review-just', n.justifications.map((j) => h('li', h('div.aw-review-crit', h('strong', nm(j)), h('span.chip.tiny.outline.num', `${j.weight}%`)), h('p', j.text)))),
    n.evidence?.length ? h('div.aw-review-ev', h('h3.aw-sub', L('الأدلة', 'Evidence')), h('ul', n.evidence.map((e) => h('li', icon(e.link ? 'link' : 'fileText'), e.link ? h('a', { href: e.link, target: e.link.startsWith('http') ? '_blank' : null, rel: e.link.startsWith('http') ? 'noopener noreferrer' : null }, e.title) : h('span', e.title), e.note ? h('span.faint', ` — ${e.note}`) : null)))) : null));

  const side = [];
  side.push(h('section.card', h('h2.card-title', L('الأطراف', 'People')),
    h('div.aw-people', h('div', h('span.aw-lbl', n.team_name ? L('الفريق', 'Team') : L('المرشح', 'Nominee')), n.team_name ? h('div.aw-team-line', h('strong', n.team_name), teamStack(n.team)) : person(n.nominee)),
      n.team?.length ? h('ul.aw-team-list', n.team.map((u) => h('li', avatar(u.name_ar), h('span', nm(u)), h('span.faint', dept(u))))) : null,
      h('div', h('span.aw-lbl', L('مقدّم الترشيح', 'Nominator')), person(n.nominator)))));
  if (isNominee && (n.excellence || n.can_attach_excellence)) {
    side.push(h('section.card', h('div.aw-card-head', h('h2.card-title', L('ملخص نقاط التميّز', 'Excellence summary')), h('span.chip.tiny.outline', icon('eye'), L('يراه أعضاء اللجنة', 'Committee sees it'))),
      n.excellence ? excellenceMini(n.excellence) : h('p.faint', L('لم ترفق ملخصاً بعد. الملخص محسوب من عملك الفعلي ويساعد اللجنة على رؤية أثرك.', 'Not attached yet. It is computed from your real work and helps the committee see your impact.')),
      n.can_attach_excellence ? h('div.btn-group', h('button.btn.sm.tertiary', { type: 'button', onclick: (e) => setExcellence(e.currentTarget, n, true) }, icon('refresh'), n.excellence ? L('تحديث الملخص', 'Refresh summary') : L('إرفاق الملخص', 'Attach summary')),
        n.excellence ? h('button.btn.sm.ghost', { type: 'button', onclick: (e) => setExcellence(e.currentTarget, n, false) }, L('إزالة', 'Remove')) : null) : null));
  }
  side.push(h('section.card', h('h2.card-title', L('السجل', 'History')),
    timeline((n.timeline || []).map((e) => { const [ar, en, ic, tone] = EVENT[e.action] || [e.action, e.action, 'circleDot']; return { at: e.at, ar, en, icon: ic, tone, who: e.who || { name_ar: 'لجنة الجوائز', name_en: 'Awards committee' } }; })),
    h('p.faint.tiny.aw-noscore', icon('lock'), L('درجات اللجنة وأسماء المقيّمين لا تظهر لأي طرف.', 'Committee scores and reviewer names are never shown.'))));
  if (n.can_withdraw) {
    side.push(h('section.card.aw-danger-zone', h('h2.card-title', L('سحب الترشيح', 'Withdraw')),
      h('p.faint', lead && n.nominator?.id !== ctx.user.id ? L('يمكنك سحب موافقتك قبل إغلاق باب الترشيح.', 'You can withdraw your consent before nominations close.') : L('يمكنك سحب الترشيح قبل إغلاق باب الترشيح. سيُبلّغ الطرف الآخر.', 'You can withdraw before nominations close. The other party is notified.')),
      h('button.btn.sm.destructive-soft', { type: 'button', onclick: (e) => withdraw(e.currentTarget, n) }, icon('undo'), L('سحب الترشيح', 'Withdraw nomination'))));
  }

  return h('div.aw-detail',
    back(href('mine'), L('ترشيحاتي', 'My nominations')),
    restricted(),
    h('section.card.aw-nom-hero',
      h('div.aw-prog-head', medal(n.program.kind, 'lg'), h('div.grow',
        eyebrow([n.program.cycle, nm(n.category)].filter(Boolean).join(' · ')),
        h('h2.aw-detail-title', n.team_name || nm(n.nominee)),
        h('div.aw-prog-meta', h('a', { href: href('programs', n.program.id) }, nm(n.program)), chip(N_STATUS, n.status), demoChip(n)))),
      stepper(FLOW, Math.min(stageOf(n.status), FLOW.length - 1) + (stageOf(n.status) >= 4 ? 1 : 0), { failed: failed(n.status), label: L('مراحل الترشيح', 'Nomination stages') })),
    h('div.sys-grid.main-side', h('div.aw-stack-col', main), h('div.aw-stack-col', side)));
}

function consentPanel(n) {
  const state = { attach: true, note: '' };
  const prev = h('div.aw-excel-slot', h('span.faint.tiny', L('جارٍ حساب الملخص…', 'Computing summary…')));
  call('/excellence-preview').then((x) => prev.replaceChildren(excellenceMini(x))).catch(() => prev.replaceChildren(h('span.faint.tiny', L('تعذّر حساب الملخص الآن', 'Could not compute the summary now'))));
  const accept = h('button.btn.primary.lg', { type: 'button', onclick: async (e) => {
    const r = await act(e.currentTarget, () => call(`/nominations/${n.id}/consent`, { method: 'POST', body: { accept: true, attach_excellence: state.attach, note: state.note.trim() || undefined } }), { success: L('شكراً! أُحيل ترشيحك إلى مرحلة التقييم عند إغلاق باب الترشيح', 'Thank you! Your nomination goes to the committee when nominations close') });
    if (r) refresh();
  } }, icon('circleCheck'), L('أوافق على الترشيح', 'I consent'));
  const decline = h('button.btn.lg', { type: 'button', onclick: async (e) => {
    const ta = h('textarea.field', { rows: 3, maxlength: 500, placeholder: L('سبب الاعتذار (اختياري — لا يطّلع عليه غيرك)', 'Reason (optional — only you can see it)'), 'aria-label': L('سبب الاعتذار', 'Reason') });
    const ok = await modal(L('الاعتذار عن الترشيح؟', 'Decline the nomination?'), h('div', h('p.muted', L('سيُبلّغ مقدّم الترشيح باعتذارك دون ذكر السبب، ولن يصل الترشيح إلى اللجنة.', 'The nominator is told you declined (without your reason); it will not reach the committee.')), ta),
      [{ label: L('تراجع', 'Back'), value: false }, { label: L('أعتذر عن الترشيح', 'Decline'), value: true, danger: true }]);
    if (!ok) return;
    const r = await act(e.currentTarget, () => call(`/nominations/${n.id}/consent`, { method: 'POST', body: { accept: false, decline_reason: ta.value.trim() || undefined } }), { success: L('سُجّل اعتذارك', 'Your decision was recorded') });
    if (r) refresh();
  } }, L('أعتذر', 'Decline'));
  return h('section.card.aw-consent-panel', { 'aria-labelledby': 'aw-consent-h' },
    h('div.aw-card-head', h('h2#aw-consent-h.card-title', icon('sparkle'), L('رشّحك زميلك — هل توافق؟', 'You were nominated — do you consent?'))),
    h('p', L(`رشّحك ${nm(n.nominator)} لـ«${nm(n.program)}» في فئة «${nm(n.category)}». اطّلع على المبررات أدناه، ثم أكّد موافقتك قبل ${fmtDate(n.program.nomination_closes)} ليصل الترشيح إلى لجنة الجوائز.`,
      `${nm(n.nominator)} nominated you for “${nm(n.program)}” (“${nm(n.category)}”). Review the justification below and consent before ${fmtDate(n.program.nomination_closes)} so it reaches the committee.`)),
    h('label.check-label.aw-attach', h('input', { type: 'checkbox', checked: true, onchange: (e) => { state.attach = e.target.checked; } }),
      h('span', h('strong', L('أرفق ملخص نقاط التميّز الخاص بي', 'Attach my excellence-points summary')), h('span.faint.block', L('محسوب من عملك الفعلي في المنصة؛ يراه أعضاء اللجنة فقط، ويمكنك تحديثه أو إزالته قبل الإغلاق.', 'Computed from your real work; visible to the committee only, and you can refresh or remove it before closing.')))),
    prev,
    h('div.form-row', h('label.lbl', { for: 'aw-note' }, L('كلمة للجنة (اختياري)', 'A note for the committee (optional)')), h('textarea.field', { id: 'aw-note', 'data-fk': 'consent-note', rows: 2, maxlength: 500, oninput: (e) => { state.note = e.target.value; } })),
    h('div.btn-group.aw-consent-actions', accept, decline));
}

async function setExcellence(btn, n, attach) {
  const r = await act(btn, () => call(`/nominations/${n.id}/excellence`, { method: 'POST', body: { attach } }), { success: attach ? L('حُدّث ملخص نقاط التميّز', 'Excellence summary updated') : L('أُزيل الملخص', 'Summary removed') });
  if (r) refresh();
}

async function withdraw(btn, n) {
  const ok = await confirmDialog(L('سحب الترشيح؟', 'Withdraw the nomination?'), L('لا يمكن التراجع عن السحب، وسيُبلّغ الطرف الآخر. يمكن تقديم ترشيح جديد ما دام باب الترشيح مفتوحاً.', 'This cannot be undone and the other party is notified. A new nomination is possible while nominations are open.'), { danger: true, confirmLabel: L('سحب الترشيح', 'Withdraw') });
  if (!ok) return;
  const r = await act(btn, () => call(`/nominations/${n.id}/withdraw`, { method: 'POST', body: { confirm: true } }), { success: L('سُحب الترشيح', 'Nomination withdrawn') });
  if (r) refresh();
}
void count; void toast;
