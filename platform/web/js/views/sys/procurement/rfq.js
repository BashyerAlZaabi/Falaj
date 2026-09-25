// Requests for quotation: list with deadline countdowns, and the RFQ detail:
// setup checklist (AI scope of work, eligible shortlist, committee, deadline),
// sealed-bid vault with two-key opening, weighted evaluation matrix, line-by-line
// price comparison, the masked AI analysis panel, committee votes, legal review
// and the purchase order.
import {
  h, icon, toast, confirmDialog, emptyState, L, fmtNum, fmtDate,
  statRow, statTile, card, grid, stepper, formDialog, timeline, act, money, whoChip, dataTable, accessLogList, openSheet, confidentialBanner,
} from '../../../sys-kit.js';
import { emit } from '../../../state.js';
import { call, catName, RFQ_STATUS, RFQ_STEPS, rfqStep, rfqChip, demoChip, n, aed, pctTxt, dt, kv, backLink, section, hint, countdown, countdownPill } from './common.js';
import { itemsTable } from './requests.js';

const refresh = () => emit('data-changed', { entity: 'sys:procurement' });
const PHASES = [
  ['draft', L('قيد الإعداد', 'In preparation'), ['draft']],
  ['open', L('مفتوحة لاستقبال العروض', 'Open for bids'), ['open']],
  ['closed', L('بانتظار الفتح بمفتاحين', 'Awaiting two-key opening'), ['closed']],
  ['eval', L('قيد التقييم والاعتماد', 'Evaluation & approvals'), ['opened', 'evaluated', 'recommended', 'committee_approved', 'legal_approved']],
  ['done', L('منتهية', 'Completed'), ['awarded', 'cancelled']],
];
const ROLE = { officer: ['أخصائي المشتريات', 'Procurement officer', 'navy'], member: ['عضو لجنة', 'Committee member', 'purple'], recused: ['متنحٍّ', 'Recused', 'outline'], legal: ['مراجعة قانونية', 'Legal reviewer', 'sand'] };

// ---------------- list ----------------
export async function rfqsTab(ctx, me) {
  const list = await call('/rfqs');
  const count = (s) => list.filter((q) => s.includes(q.status)).length;
  const wrap = h('div.pc-rfqs');
  wrap.append(statRow([
    statTile({ label: L('مفتوحة', 'Open'), value: count(['open']), icon: 'inbox', tone: count(['open']) ? 'emph' : null }),
    statTile({ label: L('بانتظار الفتح', 'Awaiting opening'), value: count(['closed']), icon: 'lockKeyhole', tone: count(['closed']) ? 'warn' : null }),
    statTile({ label: L('قيد التقييم والاعتماد', 'Evaluating'), value: count(PHASES[3][2]), icon: 'scale' }),
    statTile({ label: L('تمت الترسية', 'Awarded'), value: count(['awarded']), icon: 'badgeCheck', tone: 'good' }),
  ]));
  if (!list.length) {
    wrap.append(card(null, emptyState({ icon: 'scale', title: L('لا توجد طلبات عروض ضمن نطاقك', 'No RFQs in your scope'), body: me.roles.officer ? L('تبدأ طلبات العروض من طلبات الشراء المعتمدة في «الاعتمادات».', 'RFQs start from approved purchase requests in «Approvals».') : L('تظهر هنا طلبات العروض التي عُيّنت في لجنة تقييمها أو تنتظر مراجعتك.', 'RFQs appear here when you are on their committee or they need your review.'),
      actions: me.roles.officer ? [{ label: L('الاعتمادات', 'Approvals'), primary: true, onClick: () => { location.hash = '#/sys/procurement/approvals'; } }] : [] })));
    return wrap;
  }
  for (const [, label, sts] of PHASES) {
    const rows = list.filter((q) => sts.includes(q.status));
    if (!rows.length) continue;
    wrap.append(h('h2.section', label, h('span.count', fmtNum(rows.length))), h('div.pc-cards', rows.map(rfqCard)));
  }
  return wrap;
}
function rfqCard(q) {
  const role = ROLE[q.my_role];
  return h('a.card.pc-rfq-card', { href: `#/sys/procurement/rfqs/${q.id}` },
    h('div.pc-pr-top', h('span.pc-num.num', q.number), rfqChip(q.status), demoChip(q.is_demo), h('span.grow'), role ? h(`span.chip.tiny.${role[2]}`, L(role[0], role[1])) : null),
    h('h3.pc-pr-title', q.title),
    h('div.pc-rfq-facts',
      q.status === 'open' ? countdownPill(q.closes_at) : q.status === 'closed' ? h('span.pc-countdown.warn', icon('key'), q.key1 ? L('استُخدم المفتاح الأول', 'First key used') : L('بانتظار المفتاح الأول', 'Awaiting first key')) : h('span.pc-fact', icon('calendar'), L('الإغلاق', 'Closed'), ' ', n(fmtDate(q.closes_at))),
      h('span.pc-fact', icon('people'), L(`${fmtNum(q.invited)} مدعو`, `${fmtNum(q.invited)} invited`)),
      q.bid_count != null ? h('span.pc-fact', icon(['draft', 'open', 'closed'].includes(q.status) ? 'lock' : 'fileText'), ['open', 'closed'].includes(q.status) ? L(`${fmtNum(q.bid_count)} عرض مختوم`, `${fmtNum(q.bid_count)} sealed`) : L(`${fmtNum(q.bid_count)} عرض`, `${fmtNum(q.bid_count)} bids`)) : null,
      q.po_number ? h('span.pc-fact', icon('receipt'), h('span.num', q.po_number)) : null));
}

// ---------------- detail ----------------
export async function rfqDetail(ctx, id) {
  const q = await call(`/rfqs/${id}`);
  const page = h('div.pc-detail.pc-rfq');
  page.append(backLink('#/sys/procurement/rfqs', L('طلبات العروض', 'RFQs')));
  const cd = q.status === 'open' ? countdown(q.closes_at) : null;
  page.append(h('div.pc-detail-head',
    h('div.grow', h('div.pc-eyebrow', h('span.num', q.number), rfqChip(q.status), demoChip(q.is_demo), q.my_role && ROLE[q.my_role] ? h(`span.chip.tiny.${ROLE[q.my_role][2]}`, L(ROLE[q.my_role][0], ROLE[q.my_role][1])) : null), h('h2.pc-title', q.title),
      h('p.pc-sub', h('span.num', q.request.number), h('span.faint', '·'), whoChip(q.request.requester), h('span.faint', '·'), L(q.request.dept?.name_ar, q.request.dept?.name_en), h('span.faint', '·'), catName(q.category))),
    h('div.pc-amount', cd ? [h('span.pc-amount-label', L('موعد الإغلاق', 'Closing')), h(`span.pc-amount-value.pc-cd.${cd.tone || ''}`, cd.text), h('span.tiny.faint', dt(q.closes_at))]
      : [h('span.pc-amount-label', L('القيمة التقديرية (داخلية)', 'Estimate (internal)')), h('span.pc-amount-value.num.tabular', money(q.request.est_total)), q.award ? h('span.chip.tiny.good', icon('receipt'), h('span.num', q.award.po_number)) : null])));
  page.append(h('div.card.pc-stepper-card', stepper(RFQ_STEPS, q.status === 'cancelled' ? 1 : q.status === 'awarded' ? RFQ_STEPS.length : rfqStep(q.status), { failed: q.status === 'cancelled' })));
  if (q.cancel_note) page.append(h('div.callout.pc-callout.crit', icon('ban'), h('div', h('strong', L('أُلغي طلب العروض: ', 'RFQ cancelled: ')), q.cancel_note)));
  page.append(nextBanner(q));
  if (q.can_see_bids) page.append(confidentialBanner('بيانات العروض سرية للغاية: يُسجَّل كل اطلاع في سجل الوصول، ولا تُتاح للمساعد الذكي أو MCP.', 'Bid data is restricted: every view is access-logged and never available to Ask AI or MCP.', { level: 'restricted' }));

  const main = h('div.pc-main');
  if (q.can.edit) main.append(setupCard(q));
  if (q.sealed && q.status !== 'draft') main.append(vaultCard(q));
  if (q.can_see_bids) main.append(matrixCard(q), priceCard(q));
  if (q.recommendation || q.legal || q.award) main.append(decisionCard(q));
  main.append(section(L('البنود والتقديرات الداخلية', 'Items & internal estimates'), itemsTable(q.items), hint(L('التقديرات لا تظهر للموردين؛ تُستخدم لرصد الأسعار غير الاعتيادية.', 'Estimates are never shown to suppliers; they are used to detect abnormal prices.'), 'eyeOff')));
  const spec = specCard(q); if (spec) main.append(spec);
  const side = h('div.pc-side');
  if (q.can_see_bids) side.append(aiPanel(q));
  side.append(committeeCard(q), invitesCard(q), section(L('سجل طلب العروض', 'RFQ history'), timeline(q.timeline.map((e) => ({ at: e.at, ar: `${(EV[e.action] || [e.action])[0]}${e.note ? ` — ${e.note}` : ''}`, en: `${(EV[e.action] || [e.action, e.action])[1]}${e.note ? ` — ${e.note}` : ''}`, who: e.who, icon: EV[e.action]?.[2] || 'circleDot', tone: EV[e.action]?.[3] })))));
  if (q.access_log) side.append(section(L('سجل الوصول', 'Access log'), h('p.tiny.faint', L('من اطّلع على طلب العروض أو عروضه ومتى.', 'Who viewed this RFQ or its bids, and when.')), accessLogList(q.access_log.slice(0, 12))));
  page.append(grid('main-side', main, side));
  return page;
}
const EV = {
  rfq_started: ['بدأ إعداد طلب العروض', 'RFQ started', 'scale'], rfq_published: ['نُشر للموردين المدعوين', 'Published to invited suppliers', 'inbox', 'good'], extended: ['مُدّد موعد الإغلاق', 'Deadline extended', 'calendarClock'],
  key1: ['استُخدم مفتاح الفتح الأول', 'First opening key used', 'key', 'emph'], opened: ['فُتحت العروض بالمفتاح الثاني', 'Bids opened with the second key', 'lockOpen', 'emph'], recused: ['تنحٍّ عن اللجنة', 'Committee recusal', 'shieldAlert', 'crit'],
  evaluated: ['اعتُمدت نتيجة التقييم', 'Evaluation finalised', 'clipboardCheck', 'good'], recommended: ['رُفعت توصية الترسية', 'Award recommended', 'thumbsUp'], vote_approve: ['موافقة عضو لجنة', 'Committee approval', 'vote', 'good'],
  committee_rejected: ['لم توافق اللجنة على التوصية', 'Committee rejected the recommendation', 'thumbsDown', 'crit'], committee_approved: ['اعتمدت اللجنة الترسية', 'Committee approved', 'badgeCheck', 'good'],
  legal_approved: ['اعتماد قانوني', 'Legal approval', 'gavel', 'good'], legal_returned: ['إعادة قانونية بملاحظات', 'Returned by Legal', 'gavel', 'crit'], awarded: ['صدر أمر الشراء', 'PO issued', 'receipt', 'good'], rfq_cancelled: ['أُلغي طلب العروض', 'RFQ cancelled', 'ban', 'crit'],
};

// ---------------- the one next step ----------------
function nextBanner(q) {
  const c = q.can;
  const b = (label, ic, fn, cls = '.primary') => { const x = h(`button.btn${cls}`, { type: 'button' }, icon(ic), label); x.addEventListener('click', () => fn(x)); return x; };
  let title; let sub; const actions = [];
  if (c.publish) { title = L('أكمل الإعداد ثم انشر للموردين', 'Complete the setup, then publish'); sub = L('نطاق العمل، الموردون المؤهلون، اللجنة (عضوان على الأقل) وموعد الإغلاق.', 'Scope of work, eligible suppliers, committee (2+) and closing time.'); actions.push(b(L('نشر طلب العروض', 'Publish RFQ'), 'send', (x) => publish(x, q))); }
  else if (c.open_key) { title = q.keys.first ? L('استخدم المفتاح الثاني لفتح العروض', 'Use the second key to open the bids') : L('انتهى موعد الإغلاق — استخدم مفتاح الفتح الأول', 'Bidding closed — use the first opening key'); sub = L('يلزم عضوان مختلفان من اللجنة لفتح العروض؛ يُسجَّل الفتح في سجل التدقيق.', 'Two different committee members are required; the opening is audited.'); actions.push(b(q.keys.first ? L('استخدم المفتاح الثاني', 'Use second key') : L('استخدم مفتاحي', 'Use my key'), 'key', (x) => openKey(x, q))); }
  else if (c.waiting_second_key) { title = L('استخدمتَ المفتاح الأول', 'You used the first key'); sub = L('بانتظار عضو آخر من اللجنة لاستخدام المفتاح الثاني.', 'Waiting for another committee member to use the second key.'); }
  else if (c.score) { const mine = (q.bids || []).filter((x) => Object.keys(x.my_scores).length < q.criteria.length); title = mine.length ? L(`قيّم ${mine.length === 1 ? 'العرض المتبقي' : `${fmtNum(mine.length)} عروض`} فنياً`, `Score ${mine.length} bid(s)`) : L('أكملتَ تقييمك الفني', 'Your scoring is complete'); sub = L('درجة من 0 إلى 10 لكل معيار؛ الدرجات المجمعة تظهر بعد اكتمال تقييم الأعضاء لتجنّب التأثر.', '0–10 per criterion; aggregates appear after all members finish.'); if (mine.length) actions.push(b(L('ابدأ التقييم', 'Start scoring'), 'star', () => scoreDialog(q, mine[0]))); }
  else if (c.finalize) { const done = q.evaluation?.completion?.every((x) => x.done); title = done ? L('اكتمل تقييم الأعضاء — اعتمد النتيجة', 'All members scored — finalise') : L('بانتظار اكتمال التقييم الفني', 'Waiting for technical scoring'); sub = L('بعد الاعتماد تُعدّ توصية الترسية.', 'After finalising, prepare the award recommendation.'); actions.push(b(L('اعتماد نتيجة التقييم', 'Finalise evaluation'), 'clipboardCheck', (x) => post(x, q, '/finalize', {}, L('اعتُمدت نتيجة التقييم', 'Evaluation finalised')), done ? '.primary' : '')); }
  else if (c.recommend) { title = L('أعدّ توصية الترسية', 'Prepare the award recommendation'); sub = L('الأعلى في الدرجة المركبة ما لم يوجد مبرر مكتوب؛ وثائق المورد يجب أن تكون سارية.', 'Highest combined score unless justified in writing; the supplier’s documents must be valid.'); actions.push(b(L('رفع التوصية', 'Recommend'), 'thumbsUp', () => recommendDialog(q))); }
  else if (c.vote) { title = L('صوّت على توصية الترسية', 'Vote on the recommendation'); sub = L('تُعتمد الترسية بموافقة عضوين غير متنحّيين.', 'Two non-recused approvals are required.'); actions.push(b(L('موافقة', 'Approve'), 'thumbsUp', (x) => voteDialog(x, q, 'approve')), b(L('عدم الموافقة', 'Reject'), 'thumbsDown', (x) => voteDialog(x, q, 'reject'), '.destructive-soft')); }
  else if (c.legal) { title = L('مراجعة قانونية للترسية', 'Legal review of the award'); sub = L('راجع التوصية وشروط التعاقد قبل إصدار أمر الشراء.', 'Review the recommendation and contract terms before the PO.'); actions.push(b(L('اعتماد قانوني', 'Approve'), 'gavel', (x) => legalDialog(x, q, 'approve')), b(L('إعادة بملاحظات', 'Return'), 'undo', (x) => legalDialog(x, q, 'return'), '')); }
  else if (c.award) { title = L('أصدر أمر الشراء', 'Issue the purchase order'); sub = L('يُنشأ العقد في منصة مقدمي الخدمات ويُبلَّغ الموردون بالنتيجة.', 'A contract is created in the provider registry and suppliers are notified.'); actions.push(b(L('إصدار أمر الشراء', 'Issue PO'), 'stamp', (x) => award(x, q))); }
  else if (q.status === 'open') { title = L('العروض مختومة حتى موعد الإغلاق', 'Bids are sealed until closing'); sub = countdown(q.closes_at).text; if (c.extend) actions.push(b(L('تمديد الموعد', 'Extend'), 'calendarClock', () => extendDialog(q), '')); }
  else if (q.status === 'awarded') { title = L('اكتمل طلب العروض', 'RFQ complete'); sub = L(`صدر أمر الشراء ${q.award?.po_number || ''} وأُنشئ العقد.`, `PO ${q.award?.po_number || ''} issued; contract created.`); if (q.award?.contract_id) actions.push(h('a.btn', { href: `#/sys/providers/contracts/${q.award.contract_id}` }, icon('handshake'), L('العقد', 'Contract'))); }
  else if (q.status === 'cancelled') { title = L('أُلغي طلب العروض', 'RFQ cancelled'); sub = L('عاد طلب الشراء إلى قسم المشتريات.', 'The purchase request returned to Procurement.'); }
  else { title = L(RFQ_STATUS[q.status][0], RFQ_STATUS[q.status][1]); sub = L('لا إجراء مطلوب منك الآن.', 'No action needed from you now.'); }
  if (c.cancel && !['awarded', 'cancelled'].includes(q.status)) actions.push(b(L('إلغاء طلب العروض', 'Cancel RFQ'), 'ban', (x) => cancelRfq(x, q), '.ghost'));
  if (c.recuse) actions.push(b(L('أفصح عن تضارب وتنحَّ', 'Declare conflict & recuse'), 'shieldAlert', (x) => recuse(x, q), '.ghost'));
  return h('section.pc-next-banner', h('span.pc-next-ic', icon('sparkle')), h('div.grow', h('span.pc-next-eyebrow', L('الإجراء التالي', 'Next step')), h('h3', title), sub ? h('p', sub) : null), h('div.pc-next-actions', actions));
}

// ---------------- setup (draft) ----------------
function setupCard(q) {
  const invited = q.invites.length; const members = q.committee.filter((m) => !m.recused).length;
  const step = (done, ic, title, body, ...actions) => h(`li.pc-step${done ? '.done' : ''}`, h('span.pc-step-ic', icon(done ? 'check' : ic)), h('div.grow', h('strong', title), h('div.pc-step-body', body)), h('div.pc-step-actions', actions.filter(Boolean)));
  const modeChip = q.spec.mode === 'ai' ? h('span.chip.tiny.purple', icon('spark'), L('مسودة بالذكاء الاصطناعي — راجعها', 'AI draft — review it')) : q.spec.mode ? h('span.chip.tiny.sand', icon('info'), L('تحليل محلي — نموذج الذكاء الاصطناعي غير متصل (قالب معتمد)', 'Local — AI model not connected (approved template)')) : null;
  return section(L('إعداد طلب العروض', 'RFQ setup'),
    h('ol.pc-steps',
      step(!!q.spec.doc_id, 'wand', L('نطاق العمل والمواصفات', 'Scope of work & specification'),
        q.spec.doc_id ? [modeChip, ' ', h('span.tiny.faint', dt(q.spec.at))] : L('يصوغ الذكاء الاصطناعي مسودة من بنود الطلب ومبرره، وتُحفظ مستنداً تراجعه وتعدّله. لا تتضمن التقديرات.', 'AI drafts a document from the request items and justification; estimates are excluded.'),
        q.spec.doc_id ? h('a.btn.sm', { href: `#/documents/${q.spec.doc_id}` }, icon('pencil'), L('فتح في المحرر', 'Open in editor')) : null,
        btnAct(q.spec.doc_id ? L('إعادة الصياغة', 'Redraft') : L('صياغة بالذكاء الاصطناعي', 'Draft with AI'), 'spark', q.spec.doc_id ? '.sm' : '.sm.primary', async (x) => {
          const r = await act(x, () => call(`/rfqs/${q.id}/spec`, { method: 'POST', body: {} }));
          if (r) { toast(r.mode === 'ai' ? L('جُهّزت مسودة بالذكاء الاصطناعي — راجعها قبل النشر', 'AI draft ready — review before publishing') : L('تحليل محلي — نموذج الذكاء الاصطناعي غير متصل: استُخدم القالب المعتمد', 'Local — AI model not connected: approved template used'), { kind: r.mode === 'ai' ? 'success' : 'info' }); refresh(); }
        })),
      step(invited > 0, 'people', L('الموردون المدعوون', 'Invited suppliers'),
        invited ? h('span', L(`${fmtNum(invited)} مورد مؤهل`, `${fmtNum(invited)} eligible supplier(s)`), invited < 3 ? h('span.tiny.faint', ' · ', L('يُفضَّل ثلاثة على الأقل للمنافسة', 'three or more recommended')) : null) : L('من القائمة المؤهلة فقط: معتمدون ووثائقهم سارية، دون المعلّقين أو منتهيي الوثائق.', 'From the eligible shortlist only: approved with valid documents.'),
        btnAct(L('القائمة المؤهلة', 'Shortlist'), 'listChecks', '.sm', () => shortlistSheet(q))),
      step(members >= 2, 'usersRound', L('لجنة التقييم', 'Evaluation committee'),
        members ? q.committee.map((m) => whoChip(m.member)) : L('عضوان على الأقل من حاملي صلاحية «لجنة تقييم العروض»، دون مقدّم الطلب.', 'At least two holders of the committee capability, excluding the requester.'),
        btnAct(L('تعديل', 'Edit'), 'userCog', '.sm', () => committeeDialog(q))),
      step(Date.parse(q.closes_at) > Date.now(), 'calendarClock', L('الموعد ومعايير التقييم', 'Deadline & criteria'),
        h('span', dt(q.closes_at), ' · ', L(`فني ${q.tech_weight}% / مالي ${100 - q.tech_weight}% · حد القبول ${q.min_tech}%`, `Technical ${q.tech_weight}% / financial ${100 - q.tech_weight}% · pass ${q.min_tech}%`)),
        btnAct(L('تعديل', 'Edit'), 'sliders', '.sm', () => settingsDialog(q)))));
}
const btnAct = (label, ic, cls, fn) => { const x = h(`button.btn${cls}`, { type: 'button' }, icon(ic), label); x.addEventListener('click', () => fn(x)); return x; };
async function shortlistSheet(q) {
  const s = await call(`/rfqs/${q.id}/shortlist`).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (!s) return;
  const chosen = new Set(s.eligible.filter((p) => p.invited).map((p) => p.id));
  const stars = (r) => (r == null ? h('span.tiny.faint', L('دون تقييم بعد', 'Not rated yet')) : h('span.pc-stars', icon('star'), h('span.num', String(r))));
  const body = h('div.pc-shortlist',
    h('p.muted', L(`الفئة: ${catName(s.category)}. يُستبعد تلقائياً: المعلّق والمحظور وقيد التأهيل ومنتهي الوثائق.`, `Category: ${catName(s.category)}. Suspended, blacklisted, pending and expired-document providers are excluded.`)),
    h('h3.pc-mini-title', L('مؤهلون', 'Eligible'), h('span.count', fmtNum(s.eligible.length))),
    s.eligible.length ? h('ul.list.inset', s.eligible.map((p) => h('li', h('label.check-label.grow', h('input', { type: 'checkbox', checked: chosen.has(p.id) || null, disabled: p.invited || null, onchange: (e) => (e.target.checked ? chosen.add(p.id) : chosen.delete(p.id)) }), h('span.grow', L(p.name_ar, p.name_en))),
      p.warnings.length ? h('span.chip.tiny.warn', { 'data-tip': p.warnings.map((w) => L(w.ar, w.en)).join(' · ') }, icon('clock'), L('وثيقة تنتهي قريباً', 'Expiring soon')) : null, stars(p.rating)))) : emptyState({ compact: true, icon: 'people', title: L('لا يوجد مورد مؤهل في هذه الفئة', 'No eligible supplier in this category') }),
    s.excluded.length ? [h('h3.pc-mini-title', L('مستبعدون', 'Excluded'), h('span.count', fmtNum(s.excluded.length))), h('ul.list.inset.pc-excluded', s.excluded.map((p) => h('li', h('span.grow', L(p.name_ar, p.name_en)), h('span.tiny.pc-reason', icon('ban'), p.reasons.map((r) => L(r.ar, r.en)).join(' · ')))))] : null);
  openSheet({ title: L('القائمة المؤهلة للدعوة', 'Eligible shortlist'), subtitle: q.number, body, actions: [
    { label: L('إغلاق', 'Close') },
    { label: L('دعوة المحددين', 'Invite selected'), primary: true, icon: 'send', onClick: async () => {
      const ids = [...chosen].filter((id) => !s.eligible.find((p) => p.id === id)?.invited);
      if (!ids.length) return;
      const r = await call(`/rfqs/${q.id}/invites`, { method: 'POST', body: { provider_ids: ids } }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
      if (r) { toast(L('أُضيفت الدعوات', 'Invitations added')); refresh(); } else return false;
    } },
  ] });
}
async function committeeDialog(q) {
  const cands = q.committee_candidates || [];
  const v = await formDialog({ title: L('لجنة التقييم', 'Evaluation committee'), intro: L('عضوان على الأقل. لا يكون مقدّم الطلب أو أخصائي المشتريات عضواً. من لديه تضارب مصالح مُفصح عنه مع مورد مدعو يُنحّى تلقائياً.', 'At least two. The requester and the officer cannot be members. Members with a declared conflict with an invited supplier are recused automatically.'),
    fields: [{ name: 'committee', label: L('الأعضاء', 'Members'), type: 'multiselect', options: cands.map((u) => ({ value: u.id, label: `${L(u.name_ar, u.name_en)} — ${L(u.dept_ar, u.dept_en)}` })) }], values: { committee: q.committee.map((m) => m.member.id) }, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  const r = await call(`/rfqs/${q.id}`, { method: 'PUT', body: { committee: v.committee } }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('حُدّثت اللجنة', 'Committee updated')); refresh(); }
}
const pad = (x) => String(x).padStart(2, '0');
async function settingsDialog(q) {
  const d = new Date(q.closes_at);
  const localDate = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; const localTime = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const v = await formDialog({ title: L('الموعد ومعايير التقييم', 'Deadline & criteria'), wide: true,
    fields: [
      { name: 'date', label: L('تاريخ الإغلاق', 'Closing date'), type: 'date', required: true, min: new Date().toISOString().slice(0, 10) },
      { name: 'time', label: L('الساعة (بتوقيتك)', 'Time (your timezone)'), required: true, placeholder: '14:00', help: 'HH:MM' },
      { name: 'tech_weight', label: L('الوزن الفني %', 'Technical weight %'), type: 'number', min: 30, max: 90, required: true, help: L('المالي = 100 − الفني', 'Financial = 100 − technical') },
      { name: 'min_tech', label: L('حد القبول الفني %', 'Technical pass mark %'), type: 'number', min: 0, max: 90, required: true },
      ...q.criteria.map((c) => ({ name: `w_${c.key}`, label: L(`وزن «${c.ar}» %`, `Weight: ${c.en} %`), type: 'number', min: 5, max: 80, required: true })),
      { type: 'info', label: L('مجموع أوزان المعايير الفنية يجب أن يساوي 100.', 'Technical criteria weights must add up to 100.') },
    ],
    values: { date: localDate, time: localTime, tech_weight: q.tech_weight, min_tech: q.min_tech, ...Object.fromEntries(q.criteria.map((c) => [`w_${c.key}`, c.weight])) }, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  if (!/^\d{1,2}:\d{2}$/.test(v.time)) { toast(L('صيغة الساعة HH:MM', 'Time format HH:MM'), { kind: 'error' }); return; }
  const closes = new Date(`${v.date}T${v.time.padStart(5, '0')}:00`);
  const body = { closes_at: closes.toISOString(), tech_weight: v.tech_weight, min_tech: v.min_tech, criteria: q.criteria.map((c) => ({ key: c.key, ar: c.ar, en: c.en, weight: v[`w_${c.key}`] })) };
  const r = await call(`/rfqs/${q.id}`, { method: 'PUT', body }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('حُفظت الإعدادات', 'Settings saved')); refresh(); }
}
async function publish(btn, q) {
  if (!(await confirmDialog(L('نشر طلب العروض؟', 'Publish the RFQ?'), L(`يُرسل نطاق العمل والبنود (دون التقديرات) إلى ${q.invites.length} مورد، ويُغلق في ${dt(q.closes_at)}. لا يمكن تعديل النطاق بعد النشر.`, `Scope and items (without estimates) go to ${q.invites.length} supplier(s); closes ${dt(q.closes_at)}. The scope cannot be edited afterwards.`), { confirmLabel: L('نشر', 'Publish') }))) return;
  if (await act(btn, () => call(`/rfqs/${q.id}/publish`, { method: 'POST', body: {} }), { success: L('نُشر طلب العروض وأُبلغ الموردون', 'Published; suppliers notified') })) refresh();
}

// ---------------- sealed vault & two keys ----------------
function vaultCard(q) {
  const closed = q.status === 'closed';
  const slot = (k, label) => h(`div.pc-key${k ? '.used' : ''}`, h('span.pc-key-ic', icon(k ? 'key' : 'lock')), h('div', h('strong', label), h('span.tiny.faint', k ? `${L(k.by.name_ar, k.by.name_en)} · ${dt(k.at)}` : L('لم يُستخدم', 'Not used'))));
  return h('section.card.pc-vault',
    h('div.pc-vault-orb', { 'aria-hidden': 'true' }, icon(closed ? 'lockKeyhole' : 'lock')),
    h('div.pc-vault-body',
      h('h3', q.bid_count != null ? L(`${fmtNum(q.bid_count)} ${q.bid_count === 1 ? 'عرض مختوم' : 'عروض مختومة'}`, `${fmtNum(q.bid_count)} sealed bid(s)`) : L('العروض مختومة', 'Bids are sealed')),
      h('p', closed ? L('انتهى موعد الإغلاق. تُفتح العروض بمفتاحين من عضوين مختلفين في اللجنة، ثم يبدأ التقييم الفني.', 'Bidding has closed. Two different committee members must use their keys to open the bids.') : L('لا يستطيع أحد — بما في ذلك قسم المشتريات — الاطلاع على محتوى العروض قبل موعد الإغلاق. يظهر العدد فقط.', 'Nobody — including Procurement — can read bid contents before closing. Only the count is shown.')),
      h('div.pc-keys', slot(q.keys.first, L('المفتاح الأول', 'First key')), slot(q.keys.opened, L('المفتاح الثاني', 'Second key')))));
}
async function openKey(btn, q) {
  if (!(await confirmDialog(L('استخدام مفتاح الفتح', 'Use opening key'), q.keys.first ? L('سيفتح مفتاحك العروض فوراً لأعضاء اللجنة وأخصائي المشتريات، ويُسجَّل ذلك باسمك.', 'Your key opens the bids for the committee and the officer, recorded in your name.') : L('يُسجَّل المفتاح الأول باسمك؛ تُفتح العروض عند استخدام عضو آخر للمفتاح الثاني.', 'The first key is recorded in your name; bids open when another member uses the second key.'), { confirmLabel: L('استخدم مفتاحي', 'Use my key') }))) return;
  const r = await act(btn, () => call(`/rfqs/${q.id}/open`, { method: 'POST', body: {} }));
  if (r) { toast(r.stage === 'opened' ? L('فُتحت العروض — ابدأ التقييم الفني', 'Bids opened — start scoring') : L('سُجّل المفتاح الأول — بانتظار المفتاح الثاني', 'First key recorded — waiting for the second')); refresh(); }
}

// ---------------- evaluation ----------------
const FLAG_TONE = { crit: 'crit', warn: 'warn', info: 'outline' };
function flagChips(flags, { max = 3 } = {}) {
  if (!flags?.length) return h('span.chip.tiny.good', icon('check'), L('لا ملاحظات', 'No flags'));
  const sorted = [...flags].sort((a, b) => ['crit', 'warn', 'info'].indexOf(a.severity) - ['crit', 'warn', 'info'].indexOf(b.severity));
  return h('span.pc-flags', sorted.slice(0, max).map((f) => h(`span.chip.tiny.${FLAG_TONE[f.severity]}`, { 'data-tip': L(f.ar, f.en) }, icon(f.severity === 'crit' ? 'circleAlert' : f.severity === 'warn' ? 'alert' : 'info'), h('span.pc-flag-txt', L(f.ar, f.en)))), sorted.length > max ? h('span.tiny.faint', `+${sorted.length - max}`) : null);
}
function matrixCard(q) {
  const agg = q.evaluation.aggregate_visible;
  const rec = q.recommendation?.bid_id;
  const rows = [...q.bids].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const table = dataTable({
    rows, caption: L('مصفوفة التقييم', 'Evaluation matrix'),
    rowAttrs: (b) => ({ class: `${b.id === rec ? 'pc-rec-row' : ''}${b.id === q.evaluation.top ? ' pc-top-row' : ''}` }),
    columns: [
      { key: 'provider', label: L('المورد', 'Supplier'), render: (b) => h('div.pc-bidder', h('span.pc-mask', b.label), h('strong', L(b.provider.name_ar, b.provider.name_en)), b.id === rec ? h('span.chip.tiny.purple', icon('thumbsUp'), L('موصى به', 'Recommended')) : null) },
      { key: 'total', label: L('الإجمالي', 'Total'), num: true, sort: (b) => b.total, render: (b) => h('div.pc-cell-stack', aed(b.total), b.complete ? null : h('span.chip.tiny.warn', L('غير مكتمل', 'Incomplete'))) },
      { key: 'tech', label: L('فني', 'Tech'), num: true, sort: (b) => b.tech, render: (b) => (agg ? scoreCell(b.tech, b.passed === false) : h('span.faint', '—')) },
      { key: 'fin', label: L('مالي', 'Fin.'), num: true, sort: (b) => b.fin, render: (b) => (agg ? scoreCell(b.fin) : h('span.faint', '—')) },
      { key: 'combined', label: L('المركّب', 'Combined'), num: true, sort: (b) => b.combined, render: (b) => (agg ? h('div.pc-combined', scoreCell(b.combined), b.rank ? h('span.pc-rank', `#${b.rank}`) : null) : h('span.faint', '—')) },
      { key: 'flags', label: L('ملاحظات التحليل', 'Analysis flags'), render: (b) => flagChips(b.flags, { max: 2 }) },
      q.can.score ? { key: 'mine', label: L('تقييمي', 'My score'), render: (b) => { const done = Object.keys(b.my_scores).length >= q.criteria.length; return h(`button.btn.sm${done ? '' : '.primary'}`, { type: 'button', onclick: () => scoreDialog(q, b) }, icon(done ? 'pencil' : 'star'), done ? L('تعديل', 'Edit') : L('قيّم', 'Score')); } } : null,
    ].filter(Boolean),
  });
  const done = q.evaluation.completion;
  return section(L('مصفوفة التقييم', 'Evaluation matrix'),
    h('p.pc-formula', icon('sigma'), L(`المركّب = فني × ${100 - q.evaluation.fin_weight}% + مالي × ${q.evaluation.fin_weight}% · المالي = أقل سعر مكتمل ÷ سعر العرض × 100 · حد القبول الفني ${q.min_tech}%`, `Combined = tech × ${100 - q.evaluation.fin_weight}% + fin × ${q.evaluation.fin_weight}% · Fin = lowest complete price ÷ bid × 100 · pass ${q.min_tech}%`)),
    table,
    !agg ? hint(L('تظهر الدرجات المجمعة بعد اكتمال تقييم جميع الأعضاء لتجنّب التأثر بتقييم الآخرين.', 'Aggregate scores appear after all members finish, to avoid anchoring.'), 'eyeOff') : null,
    h('div.pc-completion', h('span.tiny.faint', L('اكتمال التقييم الفني:', 'Scoring completion:')), done.map((c) => h(`span.chip.tiny.${c.done ? 'good' : 'outline'}`, icon(c.done ? 'check' : 'hourglass'), L(c.member.name_ar, c.member.name_en)))));
}
const scoreCell = (v, fail) => (v == null ? h('span.faint', '—') : h(`span.pc-score${fail ? '.fail' : ''}`, h('span.num.tabular', fmtNum(v)), h('i', { style: { width: `${Math.max(0, Math.min(100, v))}%` } })));
async function scoreDialog(q, bid) {
  const v = await formDialog({ title: L(`التقييم الفني — ${bid.provider.name_ar}`, `Technical score — ${bid.provider.name_en}`), wide: true,
    intro: L('درجة من 0 إلى 10 لكل معيار وفق نطاق العمل المنشور. تبقى درجاتك مستقلة حتى يكمل الجميع.', 'Score 0–10 per criterion against the published scope. Your scores stay independent until everyone finishes.'),
    fields: [
      bid.technical_note ? { type: 'info', label: h('div', h('strong', L('العرض الفني: ', 'Technical offer: ')), bid.technical_note, h('div.tiny.faint', L(`التسليم ${bid.delivery_days} يوماً · صلاحية ${bid.validity_days} يوماً`, `Delivery ${bid.delivery_days} days · validity ${bid.validity_days} days`))) } : null,
      ...q.criteria.map((c) => ({ name: c.key, label: L(`${c.ar} (الوزن ${c.weight}%)`, `${c.en} (weight ${c.weight}%)`), type: 'number', min: 0, max: 10, step: 1, required: true })),
    ].filter(Boolean),
    values: bid.my_scores, submitLabel: L('حفظ التقييم', 'Save scores') });
  if (!v) return;
  const scores = Object.fromEntries(q.criteria.map((c) => [c.key, Math.round(Number(v[c.key]))]));
  const r = await call(`/rfqs/${q.id}/scores`, { method: 'PUT', body: { bid_id: bid.id, scores } }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (!r) return;
  toast(L('حُفظ تقييمك', 'Scores saved'));
  const next = r.bids?.find((b) => Object.keys(b.my_scores).length < r.criteria.length);
  refresh();
  if (next) setTimeout(() => scoreDialog(r, next), 250);
}
function priceCard(q) {
  const bids = q.bids;
  const cell = (p) => {
    if (!p || p.missing) return h('span.pc-miss', icon('minus'), L('لم يُسعَّر', 'Not priced'));
    const worst = p.flags.find((f) => f.startsWith('low')) ? 'low' : p.flags.find((f) => f.startsWith('high')) ? 'high' : null;
    return h(`div.pc-price${worst ? '.' + worst : ''}`, aed(p.unit_price), h('span.pc-dev', { 'data-tip': L(`مقابل التقدير ${pctTxt(p.dev_est)} · مقابل العروض الأخرى ${pctTxt(p.dev_peers)}`, `vs estimate ${pctTxt(p.dev_est)} · vs others ${pctTxt(p.dev_peers)}`) }, pctTxt(p.dev_est)));
  };
  const table = h('div.table-wrap', h('table.tbl.pc-price-tbl', h('caption.sr-only', L('مقارنة الأسعار لكل بند', 'Price comparison per item')),
    h('thead', h('tr', h('th', { scope: 'col' }, L('البند', 'Item')), h('th.num', { scope: 'col' }, L('التقدير', 'Estimate')), bids.map((b) => h('th.num', { scope: 'col' }, h('span.pc-mask', b.label), ' ', L(b.provider.name_ar, b.provider.name_en))))),
    h('tbody', q.lines_analysis.map((l) => h('tr', h('th', { scope: 'row' }, h('span.num.faint', `${l.line_no}. `), l.description, h('div.tiny.faint', `${fmtNum(l.qty)} ${l.unit}`)), h('td.num', aed(l.est_unit_price)), bids.map((b) => h('td.num', cell(l.prices.find((p) => p.bid_id === b.id)))))))));
  return section(L('مقارنة الأسعار لكل بند', 'Price comparison per item'), h('div.pc-legend', h('span.pc-price.low', L('أقل بأكثر من 25%', '>25% below')), h('span.pc-price.high', L('أعلى بأكثر من 30%', '>30% above')), h('span.tiny.faint', L('النسبة مقابل السعر التقديري؛ مرّر المؤشر لمقارنة العروض الأخرى', '% vs estimate; hover for vs others'))), table);
}
async function recommendDialog(q) {
  const ranked = q.bids.filter((b) => b.rank).sort((a, b) => a.rank - b.rank);
  const v = await formDialog({ title: L('توصية الترسية', 'Award recommendation'),
    intro: L('العرض الأعلى في الدرجة المركبة هو الأصل. التوصية بغيره تتطلب مبرراً مكتوباً يُعرض على اللجنة.', 'The highest combined score is the default; any other choice needs a written justification.'),
    fields: [
      { name: 'bid_id', label: L('العرض الموصى به', 'Recommended bid'), type: 'select', required: true, options: ranked.map((b) => ({ value: b.id, label: `#${b.rank} ${L(b.provider.name_ar, b.provider.name_en)} — ${money(b.total)} — ${fmtNum(b.combined)}${b.eligible_now ? '' : L(' (وثائق غير سارية)', ' (documents invalid)')}` })) },
      { name: 'note', label: L('المبرر (إلزامي لغير الأول)', 'Justification (required if not #1)'), type: 'textarea', rows: 3, maxLength: 1000 },
    ], values: { bid_id: ranked[0]?.id }, submitLabel: L('رفع التوصية', 'Recommend') });
  if (!v) return;
  const r = await call(`/rfqs/${q.id}/recommend`, { method: 'POST', body: { bid_id: v.bid_id, note: v.note || '' } }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('رُفعت التوصية للجنة', 'Recommendation sent to the committee')); refresh(); }
}
async function voteDialog(btn, q, decision) {
  let note = '';
  if (decision === 'reject') {
    const v = await formDialog({ title: L('عدم الموافقة على التوصية', 'Reject the recommendation'), danger: true, fields: [{ name: 'note', label: L('السبب', 'Reason'), type: 'textarea', required: true, rows: 3 }], submitLabel: L('تسجيل عدم الموافقة', 'Reject') });
    if (!v) return; note = v.note;
  } else if (!(await confirmDialog(L('الموافقة على التوصية', 'Approve the recommendation'), L('تُعتمد الترسية عند موافقة عضوين غير متنحّيين، ثم تنتقل للمراجعة القانونية.', 'The award is approved after two non-recused approvals, then goes to Legal.'), { confirmLabel: L('موافقة', 'Approve') }))) return;
  if (await act(btn, () => call(`/rfqs/${q.id}/vote`, { method: 'POST', body: { decision, note } }), { success: L('سُجّل صوتك', 'Vote recorded') })) refresh();
}
async function legalDialog(btn, q, decision) {
  const v = await formDialog({ title: decision === 'approve' ? L('اعتماد قانوني', 'Legal approval') : L('إعادة بملاحظات قانونية', 'Return with legal notes'), danger: decision !== 'approve',
    fields: [{ name: 'note', label: L('الملاحظات القانونية', 'Legal notes'), type: 'textarea', required: decision !== 'approve', rows: 3 }], submitLabel: decision === 'approve' ? L('اعتماد', 'Approve') : L('إعادة', 'Return') });
  if (!v) return;
  if (await act(btn, () => call(`/rfqs/${q.id}/legal`, { method: 'POST', body: { decision, note: v.note || '' } }), { success: decision === 'approve' ? L('اعتُمدت الترسية قانونياً', 'Legally approved') : L('أُعيدت بملاحظات', 'Returned') })) refresh();
}
async function award(btn, q) {
  const rec = q.bids?.find((b) => b.id === q.recommendation?.bid_id);
  if (!(await confirmDialog(L('إصدار أمر الشراء', 'Issue purchase order'), L(`سيصدر أمر شراء لـ«${rec?.provider?.name_ar || ''}» بقيمة ${money(rec?.total)}، ويُنشأ العقد، ويُبلَّغ الفائز وحده بالترسية والآخرون بعدمها.`, `A PO for ${rec?.provider?.name_en || ''} (${money(rec?.total)}) will be issued, a contract created, and suppliers notified.`), { confirmLabel: L('إصدار', 'Issue') }))) return;
  const r = await act(btn, () => call(`/rfqs/${q.id}/award`, { method: 'POST', body: {} }));
  if (r) { toast(L(`صدر أمر الشراء ${r.po_number}`, `PO ${r.po_number} issued`)); refresh(); }
}
function decisionCard(q) {
  const rec = q.bids?.find((b) => b.id === q.recommendation?.bid_id);
  const votes = q.votes || [];
  return section(L('التوصية والاعتمادات', 'Recommendation & approvals'),
    q.recommendation ? h('div.pc-rec', h('span.pc-rec-ic', icon('thumbsUp')), h('div.grow', h('strong', rec ? L(rec.provider.name_ar, rec.provider.name_en) : L('العرض الموصى به', 'Recommended bid')), rec ? h('div', aed(rec.total), h('span.faint', ' · '), L('مركّب', 'combined'), ' ', n(rec.combined ?? '—')) : null,
      h('div.tiny.faint', L('أعدّها', 'By'), ' ', L(q.recommendation.by.name_ar, q.recommendation.by.name_en), ' · ', dt(q.recommendation.at)), q.recommendation.note ? h('p.pc-prose', q.recommendation.note) : null)) : null,
    votes.length ? h('ul.list.pc-votes', votes.map((v) => h('li', icon(v.decision === 'approve' ? 'thumbsUp' : 'thumbsDown'), h('span.grow', L(v.member.name_ar, v.member.name_en)), h(`span.chip.tiny.${v.decision === 'approve' ? 'good' : 'crit'}`, v.decision === 'approve' ? L('موافقة', 'Approved') : L('عدم موافقة', 'Rejected')), h('span.tiny.faint', dt(v.at))))) : null,
    q.legal ? h('div.pc-legal', icon('gavel'), h('div', h('strong', L('المراجعة القانونية: ', 'Legal review: ')), L(q.legal.by.name_ar, q.legal.by.name_en), ' · ', dt(q.legal.at), q.legal.note ? h('p.pc-prose', q.legal.note) : null)) : null,
    q.award ? h('div.pc-award', icon('receipt'), h('div.grow', h('strong', L('أمر الشراء ', 'PO '), h('span.num', q.award.po_number)), h('div', aed(q.award.amount), h('span.faint', ' · '), dt(q.award.at))), q.award.contract_id ? h('a.btn.sm', { href: `#/sys/providers/contracts/${q.award.contract_id}` }, icon('handshake'), L('العقد', 'Contract')) : null) : null);
}

// ---------------- AI analysis panel ----------------
function aiPanel(q) {
  const a = q.analysis;
  const mode = a.mode === 'ai' ? h('span.chip.tiny.purple', icon('spark'), L('ذكاء اصطناعي', 'AI model')) : a.narrative ? h('span.chip.tiny.sand', icon('info'), a.mode === 'local_error' ? L('تحليل محلي — تعذّر الوصول للنموذج', 'Local — model unreachable') : L('تحليل محلي — نموذج الذكاء الاصطناعي غير متصل', 'Local analysis — AI model not connected')) : null;
  const counts = { crit: 0, warn: 0, info: 0 };
  for (const b of q.bids) for (const f of b.flags) counts[f.severity]++;
  const legend = h('ul.pc-ai-legend', q.bids.map((b) => h('li', h('span.pc-mask', b.label), h('span.grow', L(b.provider.name_ar, b.provider.name_en)), flagChips(b.flags.filter((f) => f.severity !== 'info'), { max: 2 }))));
  return h('section.card.pc-ai',
    h('div.pc-ai-head', h('span.pc-ai-orb', icon('spark')), h('div.grow', h('h2.card-title', L('التحليل الذكي للعروض', 'AI bid analysis')), h('div.pc-ai-meta', mode, a.at ? h('span.tiny.faint', dt(a.at)) : null))),
    h('div.pc-ai-stats', h('span', h('strong.num', fmtNum(counts.crit)), L('حرجة', 'critical')), h('span', h('strong.num', fmtNum(counts.warn)), L('تنبيه', 'warnings')), h('span', h('strong.num', fmtNum(counts.info)), L('ملاحظات بنود', 'item notes')), h('span', h('strong.num', fmtNum(a.findings.recusals.length)), L('تنحٍّ', 'recusals'))),
    a.narrative ? h('div.pc-ai-text', a.narrative.text) : h('p.muted', L('لم يُشغَّل التحليل بعد. شغّله لرصد الأسعار غير الاعتيادية والبنود الناقصة والوثائق المنتهية وحالات التنحي.', 'Not run yet. Run it to detect abnormal prices, missing items, expired documents and recusals.')),
    h('div.pc-ai-sub', h('span.tiny.faint', L('دليل الأسماء المقنّعة (للجنة فقط):', 'Masked names (committee only):')), legend),
    a.findings.recusals.length ? h('div.pc-ai-recusals', a.findings.recusals.map((r) => h('div', icon('shieldAlert'), L(r.member.name_ar, r.member.name_en), ' — ', r.reason))) : null,
    q.can.analyse ? btnAct(a.narrative ? L('تحديث التحليل', 'Refresh analysis') : L('تشغيل التحليل', 'Run analysis'), 'spark', '.tertiary.block', async (x) => {
      const r = await act(x, () => call(`/rfqs/${q.id}/analysis`, { method: 'POST', body: {} }));
      if (r) { toast(r.mode === 'ai' ? L('حُدّث التحليل', 'Analysis updated') : L('تحليل محلي — نموذج الذكاء الاصطناعي غير متصل', 'Local analysis — AI model not connected'), { kind: r.mode === 'ai' ? 'success' : 'info' }); refresh(); }
    }) : null,
    h('p.pc-ai-foot', icon('shield'), L('يُرسل للنموذج مؤشرات مقنّعة فقط (نِسب ودرجات) دون أسماء أو مبالغ. تحليل مساند — القرار للجنة التقييم.', 'Only masked indicators (percentages, scores) are sent to a model — no names or amounts. Advisory — the committee decides.')));
}

// ---------------- side cards ----------------
function committeeCard(q) {
  const voted = new Set((q.votes || []).filter((v) => v.bid_id === q.recommendation?.bid_id).map((v) => v.member.id));
  const done = new Set((q.evaluation?.completion || []).filter((c) => c.done).map((c) => c.member.id));
  return section(L('لجنة التقييم', 'Evaluation committee'),
    q.committee.length ? h('ul.list.pc-members', q.committee.map((m) => h(`li${m.recused ? '.recused' : ''}`, whoChip(m.member), h('span.grow'),
      m.me ? h('span.chip.tiny.info', L('أنت', 'You')) : null,
      m.recused ? h('span.chip.tiny.outline', { 'data-tip': m.recusal_reason || '' }, icon('shieldAlert'), m.recusal_source === 'integrity' ? L('متنحٍّ — نظام الإفصاح', 'Recused — disclosure') : L('متنحٍّ', 'Recused'))
        : [q.keys.first?.by.id === m.member.id || q.keys.opened?.by.id === m.member.id ? h('span.chip.tiny.purple', { 'data-tip': L('استخدم مفتاح الفتح', 'Used an opening key') }, icon('key')) : null,
          done.has(m.member.id) ? h('span.chip.tiny.good', { 'data-tip': L('أكمل التقييم الفني', 'Scoring complete') }, icon('star')) : null,
          voted.has(m.member.id) ? h('span.chip.tiny.good', { 'data-tip': L('صوّت', 'Voted') }, icon('vote')) : null]))) : h('p.tiny.faint', L('لم تُشكَّل اللجنة بعد', 'No committee yet')),
    h('p.tiny.faint', L('من لديه تضارب مصالح مُفصح عنه مع مورد مدعو يُنحّى تلقائياً وتُستبعد درجاته.', 'Members with a declared conflict with an invited supplier are recused automatically and their scores excluded.')));
}
function invitesCard(q) {
  return section(L('الموردون المدعوون', 'Invited suppliers'),
    q.invites.length ? h('ul.list.pc-invites', q.invites.map((i) => h('li', h('span.pc-inv-ic', icon('building')), h('span.grow', L(i.provider.name_ar, i.provider.name_en)),
      i.eligible_now ? null : h('span.chip.tiny.crit', { 'data-tip': i.reasons.map((r) => L(r.ar, r.en)).join(' · ') }, icon('circleAlert'), L('غير مؤهل حالياً', 'Not eligible now')),
      q.can.edit ? h('button.icon-btn', { type: 'button', 'aria-label': L(`إزالة دعوة ${i.provider.name_ar}`, `Remove ${i.provider.name_en}`), onclick: async () => {
        const r = await call(`/rfqs/${q.id}/invites/${i.provider.id}`, { method: 'DELETE' }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
        if (r) refresh();
      } }, icon('x')) : null))) : h('p.tiny.faint', L('لا دعوات بعد', 'No invitations yet')));
}
function specCard(q) {
  const s = q.spec;
  if (!s.html) return null;
  const body = h('div.pc-spec-body.doc-prose', { html: s.html });
  const det = h('details.pc-spec', h('summary', icon('fileText'), s.published ? L('نطاق العمل المنشور للموردين', 'Published scope of work') : L('مسودة نطاق العمل', 'Scope of work draft'), s.doc_id ? h('a.btn.sm.ghost', { href: `#/documents/${s.doc_id}`, onclick: (e) => e.stopPropagation() }, icon('pencil'), L('المستند', 'Document')) : null), body);
  return h('section.card.sys-card.pc-card', det);
}

// ---------------- other dialogs ----------------
async function extendDialog(q) {
  const d = new Date(Date.parse(q.closes_at) + 3 * 864e5);
  const v = await formDialog({ title: L('تمديد موعد الإغلاق', 'Extend the deadline'), intro: L('يُبلَّغ الموردون المدعوون بالموعد الجديد، ويُسجَّل التمديد في سجل التدقيق.', 'Invited suppliers are notified; the extension is audited.'),
    fields: [{ name: 'date', label: L('التاريخ الجديد', 'New date'), type: 'date', required: true }, { name: 'time', label: L('الساعة', 'Time'), required: true, placeholder: '14:00' }, { name: 'reason', label: L('السبب', 'Reason'), type: 'textarea', required: true, rows: 2 }],
    values: { date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }, submitLabel: L('تمديد', 'Extend') });
  if (!v) return;
  const r = await call(`/rfqs/${q.id}/extend`, { method: 'POST', body: { closes_at: new Date(`${v.date}T${v.time.padStart(5, '0')}:00`).toISOString(), reason: v.reason } }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('مُدّد الموعد وأُبلغ الموردون', 'Deadline extended; suppliers notified')); refresh(); }
}
async function cancelRfq(btn, q) {
  const v = await formDialog({ title: L('إلغاء طلب العروض', 'Cancel the RFQ'), danger: true, intro: L('يُبلَّغ الموردون المدعوون بالإلغاء، ويعود طلب الشراء إلى قسم المشتريات. لا يمكن التراجع.', 'Invited suppliers are notified and the purchase request returns to Procurement. This cannot be undone.'),
    fields: [{ name: 'reason', label: L('السبب', 'Reason'), type: 'textarea', required: true, rows: 3 }], submitLabel: L('إلغاء طلب العروض', 'Cancel RFQ') });
  if (!v) return;
  if (await act(btn, () => call(`/rfqs/${q.id}/cancel`, { method: 'POST', body: { reason: v.reason, confirm: true } }), { success: L('أُلغي طلب العروض', 'RFQ cancelled') })) refresh();
}
async function recuse(btn, q) {
  const v = await formDialog({ title: L('الإفصاح عن تضارب مصالح والتنحي', 'Declare a conflict and recuse'), danger: true,
    intro: L('لن تتمكن من استخدام مفتاح الفتح أو التقييم أو التصويت في هذا الطلب، وتُستبعد أي درجات سابقة لك. يُسجَّل التنحي في سجل التدقيق. يُنصح أيضاً بتسجيل إفصاح في نظام الإفصاح عن تضارب المصالح.', 'You will no longer open, score or vote on this RFQ and your scores are excluded. The recusal is audited.'),
    fields: [{ name: 'reason', label: L('طبيعة التضارب باختصار', 'Nature of the conflict'), type: 'textarea', required: true, rows: 3 }], submitLabel: L('تنحٍّ', 'Recuse') });
  if (!v) return;
  if (await act(btn, () => call(`/rfqs/${q.id}/recuse`, { method: 'POST', body: { reason: v.reason, confirm: true } }), { success: L('سُجّل تنحيك', 'Recusal recorded') })) refresh();
}
async function post(btn, q, path, body, success) { if (await act(btn, () => call(`/rfqs/${q.id}${path}`, { method: 'POST', body }), { success })) refresh(); }
