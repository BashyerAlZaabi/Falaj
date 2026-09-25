// Purchase requests: «طلباتي» list, request detail with the role-aware next
// action (requester / line manager / Finance / Procurement officer), the full-page
// request editor, and the «الاعتمادات» queues.
import {
  h, icon, toast, confirmDialog, emptyState, L, fmtNum, fmtDate,
  statRow, statTile, card, grid, stepper, progress, formDialog, timeline, act, money, whoChip, dataTable,
} from '../../../sys-kit.js';
import { emit } from '../../../state.js';
import { call, THRESHOLD, CATS, catName, PR_STATUS, PR_STEPS, prChip, rfqChip, demoChip, n, aed, dt, kv, miniTrack, backLink, section, hint, countdownPill } from './common.js';

const refresh = () => emit('data-changed', { entity: 'sys:procurement' });
const FAILED = ['rejected', 'cancelled'];

// ---------------- «طلباتي» ----------------
export async function mineTab(ctx, me) {
  const list = await call('/requests?scope=mine');
  const by = (s) => list.filter((r) => s.includes(r.status)).length;
  const returned = list.filter((r) => r.status === 'draft' && r.return_note);
  const wrap = h('div.pc-mine');
  if (returned.length) wrap.append(h('div.callout.pc-callout.warn', icon('undo'), h('div.grow', h('strong', L('أُعيد طلب للتعديل', 'A request was returned for changes')), h('div', `${returned[0].number} — ${returned[0].return_note}`)),
    h('a.btn.sm.primary', { href: `#/sys/procurement/mine/${returned[0].id}` }, L('راجع الطلب', 'Review'))));
  wrap.append(statRow([
    statTile({ label: L('قيد الاعتماد', 'In approval'), value: by(['pending_manager', 'pending_finance']), icon: 'hourglass', tone: by(['pending_manager', 'pending_finance']) ? 'warn' : null }),
    statTile({ label: L('لدى المشتريات', 'With procurement'), value: by(['pending_procurement', 'sourcing']), icon: 'scale' }),
    statTile({ label: L('صدر أمر الشراء', 'PO issued'), value: by(['ordered']), icon: 'circleCheck', tone: 'good' }),
    statTile({ label: L('مسودات', 'Drafts'), value: by(['draft']), icon: 'pencil' }),
  ]));
  if (!list.length) {
    wrap.append(card(null, emptyState({ icon: 'cart', title: L('لا توجد طلبات شراء بعد', 'No purchase requests yet'), body: L('أنشئ طلباً ببنوده وسعره التقديري؛ يمرّ على مديرك المباشر ثم المالية ثم المشتريات، وتتابع كل مرحلة هنا.', 'Create a request with its items and estimate; it goes to your line manager, Finance and Procurement — follow each stage here.'), actions: [{ label: L('طلب شراء جديد', 'New purchase request'), icon: 'plus', primary: true, onClick: () => { location.hash = '#/sys/procurement/mine/new'; } }] })));
    return wrap;
  }
  const active = list.filter((r) => !['ordered', 'rejected', 'cancelled'].includes(r.status));
  const closed = list.filter((r) => ['ordered', 'rejected', 'cancelled'].includes(r.status));
  if (active.length) wrap.append(h('h2.section', L('قيد التنفيذ', 'In progress'), h('span.count', fmtNum(active.length))), h('div.pc-cards', active.map((r) => prCard(r, 'mine'))));
  if (closed.length) wrap.append(h('h2.section', L('مكتملة أو مغلقة', 'Completed or closed'), h('span.count', fmtNum(closed.length))), h('div.pc-cards', closed.map((r) => prCard(r, 'mine'))));
  return wrap;
}
export function prCard(r, tab) {
  const failed = FAILED.includes(r.status);
  return h('a.card.pc-pr-card', { href: `#/sys/procurement/${tab}/${r.id}` },
    h('div.pc-pr-top', h('span.pc-num.num', r.number), prChip(r.status), demoChip(r.is_demo), h('span.grow'), h('span.pc-cat', icon(CATS[r.category]?.[2] || 'package'), catName(r.category))),
    h('h3.pc-pr-title', r.title),
    h('div.pc-pr-meta', h('span', aed(r.est_total)), h('span.faint', '·'), h('span', L('مطلوب بحلول', 'Needed by'), ' ', n(fmtDate(r.needed_by))), r.requester && tab !== 'mine' ? [h('span.faint', '·'), h('span', L(r.requester.name_ar, r.requester.name_en))] : null),
    h('div.pc-pr-foot', miniTrack(failed ? Math.max(1, r.stage) : r.status === 'ordered' ? PR_STEPS.length : r.stage, PR_STEPS.length, { failed }), h('span.pc-stage', stageText(r)),
      r.rfq?.status === 'open' ? countdownPill(r.rfq.closes_at) : null));
}
function stageText(r) {
  if (r.status === 'sourcing' && r.rfq) return L(`طلب العروض ${r.rfq.number}`, `RFQ ${r.rfq.number}`);
  if (r.status === 'ordered') return L(`أمر الشراء ${r.po_number}`, `PO ${r.po_number}`);
  if (r.status === 'draft' && r.return_note) return L('أُعيد للتعديل', 'Returned for changes');
  return L(PR_STATUS[r.status][0], PR_STATUS[r.status][1]);
}

// ---------------- request detail ----------------
export async function prDetail(ctx, id, tab) {
  const r = await call(`/requests/${id}`);
  const failed = FAILED.includes(r.status);
  const idx = FAILED.includes(r.status) ? stageFailedAt(r) : r.status === 'ordered' ? PR_STEPS.length : r.stage;
  const page = h('div.pc-detail');
  page.append(backLink(`#/sys/procurement/${tab}`, tab === 'approvals' ? L('الاعتمادات', 'Approvals') : L('طلباتي', 'My requests')));
  page.append(h('div.pc-detail-head',
    h('div.grow', h('div.pc-eyebrow', h('span.num', r.number), prChip(r.status), demoChip(r.is_demo)), h('h2.pc-title', r.title),
      h('p.pc-sub', whoChip(r.requester), h('span.faint', '·'), L(r.dept_ar, r.dept_en), h('span.faint', '·'), catName(r.category))),
    h('div.pc-amount', h('span.pc-amount-label', L('القيمة التقديرية', 'Estimated value')), h('span.pc-amount-value.num.tabular', money(r.est_total)),
      h('span.chip.tiny', { class: r.suggested_method === 'rfq' ? 'navy' : 'sand' }, icon(r.suggested_method === 'rfq' ? 'scale' : 'receipt'), r.suggested_method === 'rfq' ? L('طلب عروض أسعار', 'Request for quotation') : L('شراء مباشر', 'Direct purchase')))));
  page.append(h('div.card.pc-stepper-card', stepper(PR_STEPS, idx, { failed })));
  if (r.return_note && r.status === 'draft') page.append(h('div.callout.pc-callout.warn', icon('undo'), h('div', h('strong', L('ملاحظات الإعادة: ', 'Returned: ')), r.return_note)));
  if (r.reject_note && r.status === 'rejected') page.append(h('div.callout.pc-callout.crit', icon('circleX'), h('div', h('strong', L('سبب الرفض: ', 'Rejected: ')), r.reject_note)));

  const main = h('div.pc-main',
    section(L('البنود', 'Items'), itemsTable(r.items, { estimates: true }), h('div.pc-total', h('span', L('الإجمالي التقديري', 'Estimated total')), h('strong.num.tabular', money(r.est_total)))),
    section(L('مبرر الحاجة', 'Justification'), h('p.pc-prose', r.justification), kv([[L('مطلوب بحلول', 'Needed by'), n(fmtDate(r.needed_by))], [L('المدير المباشر', 'Line manager'), whoChip(r.manager)]])),
    r.sourcing ? section(L('طلب العروض', 'Request for quotation'), h('div.pc-row', h('span.num', r.sourcing.number), rfqChip(r.sourcing.status === 'open' && Date.parse(r.sourcing.closes_at) <= Date.now() ? 'closed' : r.sourcing.status),
      r.sourcing.status === 'open' ? countdownPill(r.sourcing.closes_at) : null, h('span.grow')),
    hint(L('العروض مختومة حتى موعد الإغلاق، وتُفتح بمفتاحين من عضوين في لجنة التقييم. لا تظهر أسعار الموردين لمقدّم الطلب.', 'Bids stay sealed until closing and are opened with two committee keys. Supplier prices are not shown to the requester.'), 'lockKeyhole')) : null,
    r.order ? section(L('أمر الشراء', 'Purchase order'), kv([[L('رقم أمر الشراء', 'PO number'), h('strong.num', r.order.po_number)], [L('المورد', 'Supplier'), r.order.provider ? L(r.order.provider.name_ar, r.order.provider.name_en) : '—'], [L('القيمة', 'Amount'), aed(r.order.amount)], [L('طريقة الشراء', 'Method'), r.order.method === 'direct' ? L('شراء مباشر', 'Direct purchase') : L('طلب عروض أسعار', 'RFQ')]])) : null);
  const side = h('div.pc-side', nextAction(ctx, r, tab), budgetCard(r), section(L('سجل الطلب', 'History'), timeline(r.timeline.map((e) => ({ at: e.at, ar: e.note ? `${e.ar} — ${e.note}` : e.ar, en: e.note ? `${e.en} — ${e.note}` : e.en, who: e.who, icon: EV_ICON[e.action] || 'circleDot', tone: EV_TONE[e.action] })))));
  page.append(grid('main-side', main, side));
  return page;
}
const EV_ICON = { created: 'filePlus', submitted: 'send', edited: 'pencil', mgr_approved: 'userCheck', fin_approved: 'wallet', returned: 'undo', rejected: 'circleX', cancelled: 'ban', rfq_started: 'scale', rfq_published: 'inbox', rfq_cancelled: 'ban', direct_po: 'receipt', awarded: 'badgeCheck' };
const EV_TONE = { mgr_approved: 'good', fin_approved: 'good', rejected: 'crit', awarded: 'good', direct_po: 'good', returned: 'emph' };
function stageFailedAt(r) { if (r.approvals.finance) return 3; if (r.approvals.manager) return 2; return r.submitted_at ? 1 : 0; }
export function itemsTable(items, { estimates = true } = {}) {
  return dataTable({
    rows: items, stackMobile: true, caption: L('بنود الطلب', 'Request items'),
    columns: [
      { key: 'line_no', label: '#', num: true, width: '44px' },
      { key: 'description', label: L('الوصف', 'Description') },
      { key: 'qty', label: L('الكمية', 'Qty'), num: true, render: (i) => h('span.num.tabular', fmtNum(i.qty)) },
      { key: 'unit', label: L('الوحدة', 'Unit') },
      estimates ? { key: 'est_unit_price', label: L('سعر الوحدة التقديري', 'Est. unit price'), num: true, render: (i) => aed(i.est_unit_price) } : null,
      estimates ? { key: 'est_total', label: L('الإجمالي', 'Total'), num: true, render: (i) => aed(i.est_total ?? i.qty * i.est_unit_price) } : null,
    ].filter(Boolean),
  });
}
function budgetCard(r) {
  const b = r.budget_line;
  if (!b) return null;
  const a = b.amounts;
  const body = [h('div.pc-budget-name', h('span.num.pc-code', b.code), h('span', L(b.name_ar, b.name_en)))];
  if (a) {
    const pctUsed = a.allocated ? ((a.committed + a.spent) / a.allocated) * 100 : 0;
    body.push(budgetBar(a), kv([[L('الاعتماد', 'Allocated'), aed(a.allocated)], [L('ملتزم به', 'Committed'), aed(a.committed)], [L('مصروف', 'Spent'), aed(a.spent)], [L('المتاح', 'Available'), h(`strong.num.tabular${a.available < r.est_total && r.status === 'pending_finance' ? '.pc-neg' : ''}`, money(a.available))]]),
      r.status === 'pending_finance' ? h(`div.pc-budget-check.${a.available >= r.est_total ? 'ok' : 'bad'}`, icon(a.available >= r.est_total ? 'circleCheck' : 'circleAlert'), a.available >= r.est_total ? L('الرصيد المتاح يغطي قيمة الطلب؛ الاعتماد يحجز المبلغ في البند.', 'Available balance covers the request; approval commits the amount.') : L('الرصيد المتاح لا يغطي قيمة الطلب — لا يمكن الاعتماد قبل تعزيز البند.', 'Available balance does not cover the request.')) : null,
      h('p.tiny.faint', L(`الاستغلال ${Math.round(pctUsed)}% · تُدار البنود من الإدارة المالية؛ النظام المالي FS يبقى داخل Vault ولا يُقرأ من هنا.`, `Utilisation ${Math.round(pctUsed)}% · Lines are maintained by Finance; FS stays inside Vault and is not read here.`)));
  } else body.push(hint(L('أرصدة البند تظهر للمالية ومديري الإدارة فقط.', 'Line balances are visible to Finance and department managers only.'), 'lock'));
  if (r.reserved > 0) body.push(h('div.pc-reserved', icon('lock'), L('محجوز لهذا الطلب: ', 'Committed for this request: '), aed(r.reserved)));
  return section(L('بند الميزانية', 'Budget line'), ...body);
}
export function budgetBar(a) {
  const pct = (v) => (a.allocated ? Math.max(0, Math.min(100, (v / a.allocated) * 100)) : 0);
  return h('div.pc-bbar', { role: 'img', 'aria-label': L(`مصروف ${Math.round(pct(a.spent))}% وملتزم ${Math.round(pct(a.committed))}%`, `Spent ${Math.round(pct(a.spent))}%, committed ${Math.round(pct(a.committed))}%`) },
    h('i.spent', { style: { width: `${pct(a.spent)}%` } }), h('i.committed', { style: { width: `${pct(a.committed)}%` } }));
}

// The one clear next step for the current user on this request.
function nextAction(ctx, r, tab) {
  const c = r.can;
  const box = (title, sub, ...actions) => h('section.card.pc-next', h('span.pc-next-eyebrow', icon('sparkle'), L('الإجراء التالي', 'Next step')), h('h3', title), sub ? h('p', sub) : null, h('div.pc-next-actions', actions.filter(Boolean)));
  const btn = (label, ic, cls, fn) => { const b = h(`button.btn${cls}`, { type: 'button' }, icon(ic), label); b.addEventListener('click', () => fn(b)); return b; };
  if (c.decide && r.status === 'pending_procurement') return officerPanel(r, box, btn);
  if (c.decide) {
    const stage = r.status === 'pending_manager' ? L('اعتماد المدير المباشر', 'Line-manager approval') : L('اعتماد الميزانية', 'Budget approval');
    const sub = r.status === 'pending_finance' ? L('تحقّق من الرصيد المتاح في البند؛ الاعتماد يحجز المبلغ ويحوّل الطلب للمشتريات.', 'Check the available balance; approval commits the amount and forwards to Procurement.') : L('راجع الحاجة والبنود والقيمة التقديرية. لا يعتمد أحد طلبه بنفسه.', 'Review the need, items and estimate. Nobody approves their own request.');
    const insufficient = r.status === 'pending_finance' && r.budget_line?.amounts && r.budget_line.amounts.available < r.est_total;
    return box(stage, sub,
      btn(L('اعتماد', 'Approve'), 'check', '.primary', (b) => decide(b, r, 'approve')),
      btn(L('إعادة للتعديل', 'Return'), 'undo', '', (b) => decide(b, r, 'return')),
      btn(L('رفض', 'Reject'), 'circleX', '.destructive-soft', (b) => decide(b, r, 'reject')),
      insufficient ? h('p.pc-next-warn', icon('circleAlert'), L('الرصيد غير كافٍ — سيرفض النظام الاعتماد.', 'Insufficient balance — approval will be refused.')) : null);
  }
  if (c.submit) return box(L('أرسل الطلب للاعتماد', 'Submit for approval'), L('سيصل إلى مديرك المباشر أولاً ثم المالية ثم المشتريات.', 'It goes to your line manager, then Finance, then Procurement.'),
    btn(L('إرسال للاعتماد', 'Submit'), 'send', '.primary', (b) => act(b, () => call(`/requests/${r.id}/submit`, { method: 'POST', body: {} }), { success: L('أُرسل الطلب لمديرك المباشر', 'Sent to your line manager') }).then((x) => x && refresh())),
    h('a.btn', { href: `#/sys/procurement/mine/${r.id}/edit` }, icon('pencil'), L('تعديل', 'Edit')),
    btn(L('حذف المسودة', 'Discard draft'), 'trash', '.ghost', (b) => cancel(b, r)));
  if (c.cancel) return box(L('طلبك قيد المعالجة', 'Your request is in progress'), waitingText(r), btn(L('إلغاء الطلب', 'Cancel request'), 'ban', '.ghost', (b) => cancel(b, r)));
  return box(r.status === 'ordered' ? L('اكتمل الطلب', 'Request complete') : FAILED.includes(r.status) ? L('أُغلق الطلب', 'Request closed') : L('متابعة', 'Follow-up'), waitingText(r),
    r.sourcing && ctx.me?.roles?.officer ? h('a.btn.primary', { href: `#/sys/procurement/rfqs/${r.sourcing.rfq_id}` }, icon('scale'), L('افتح طلب العروض', 'Open the RFQ')) : null);
}
function waitingText(r) {
  switch (r.status) {
    case 'pending_manager': return L(`بانتظار اعتماد ${r.manager?.name_ar || 'المدير المباشر'}.`, `Waiting for ${r.manager?.name_en || 'the line manager'}.`);
    case 'pending_finance': return L('بانتظار تحقق الإدارة المالية من الرصيد وحجز المبلغ.', 'Waiting for Finance to check and commit the budget.');
    case 'pending_procurement': return L('لدى قسم المشتريات لاختيار طريقة الشراء.', 'With Procurement to choose the sourcing method.');
    case 'sourcing': return L('طلب العروض مطروح للموردين المؤهلين؛ ستصلك النتيجة عند إصدار أمر الشراء.', 'The RFQ is out to eligible suppliers; you will be notified when the PO is issued.');
    case 'ordered': return L(`صدر أمر الشراء ${r.po_number}. تابع التسليم مع مالك العقد.`, `PO ${r.po_number} issued. Follow delivery with the contract owner.`);
    case 'rejected': return L('رُفض الطلب. يمكنك إنشاء طلب جديد بعد معالجة سبب الرفض.', 'Rejected. You can raise a new request after addressing the reason.');
    case 'cancelled': return L('أُلغي الطلب وأُفرج عن أي مبلغ محجوز.', 'Cancelled; any committed amount was released.');
    default: return '';
  }
}
function officerPanel(r, box, btn) {
  const rfqFirst = r.est_total >= THRESHOLD;
  const opt = (method, title, sub, ic, recommended, disabled, fn) => h(`button.pc-method${recommended ? '.rec' : ''}`, { type: 'button', disabled: disabled || null, onclick: (e) => fn(e.currentTarget) },
    h('span.pc-method-ic', icon(ic)), h('span.grow', h('strong', title), h('span', sub)), recommended ? h('span.chip.tiny.navy', L('المسار النظامي', 'Required path')) : null);
  return box(L('اختر طريقة الشراء', 'Choose the sourcing method'), L(`حد الشراء المباشر أقل من ${fmtNum(THRESHOLD)} د.إ؛ ما يساويه أو يزيد يُطرح كطلب عروض أسعار.`, `Direct purchase is below AED ${fmtNum(THRESHOLD)}; at or above it an RFQ is required.`),
    h('div.pc-methods',
      opt('rfq', L('طلب عروض أسعار', 'Request for quotation'), L('نطاق عمل بمساعدة الذكاء الاصطناعي، دعوة الموردين المؤهلين، عروض مختومة وتقييم لجنة', 'AI-drafted scope, eligible suppliers, sealed bids, committee evaluation'), 'scale', rfqFirst, false, (b) => act(b, () => call(`/requests/${r.id}/source`, { method: 'POST', body: { method: 'rfq' } }), { success: L('أُنشئ طلب العروض — أكمل إعداده', 'RFQ created — complete the setup') }).then((x) => { if (x) location.hash = `#/sys/procurement/rfqs/${x.rfq_id}`; })),
      opt('direct', L('شراء مباشر', 'Direct purchase'), rfqFirst ? L('غير متاح: القيمة تتجاوز حد الشراء المباشر', 'Not available above the threshold') : L('عرض سعر من مورد مؤهل ثم أمر شراء', 'Quotation from an eligible supplier, then PO'), 'receipt', !rfqFirst, rfqFirst, (b) => direct(b, r))),
    btn(L('رفض الطلب', 'Reject'), 'circleX', '.destructive-soft', (b) => decide(b, r, 'reject')));
}
async function decide(btn, r, decision) {
  let note = '';
  if (decision !== 'approve') {
    const v = await formDialog({ title: decision === 'return' ? L('إعادة الطلب للتعديل', 'Return for changes') : L('رفض الطلب', 'Reject request'), danger: decision === 'reject',
      intro: decision === 'return' ? L('تصل ملاحظاتك لمقدّم الطلب ليعدّله ويعيد إرساله.', 'Your note goes to the requester.') : L('الرفض نهائي ويُفرج عن أي مبلغ محجوز. اذكر السبب بوضوح.', 'Rejection is final and releases any commitment.'),
      fields: [{ name: 'note', label: L('الملاحظات', 'Note'), type: 'textarea', required: true, rows: 3, maxLength: 1000 }], submitLabel: decision === 'return' ? L('إعادة', 'Return') : L('رفض', 'Reject') });
    if (!v) return;
    note = v.note;
  } else if (!(await confirmDialog(L('تأكيد الاعتماد', 'Confirm approval'), r.status === 'pending_finance' ? L(`سيُحجز مبلغ ${money(r.est_total)} في بند ${r.budget_line?.code || ''} ويُحوّل الطلب للمشتريات.`, `${money(r.est_total)} will be committed and the request forwarded to Procurement.`) : L('سيُحوّل الطلب إلى الإدارة المالية للتحقق من الميزانية.', 'The request will go to Finance for the budget check.'), { confirmLabel: L('اعتماد', 'Approve') }))) return;
  const res = await act(btn, () => call(`/requests/${r.id}/decide`, { method: 'POST', body: { decision, note } }), { success: decision === 'approve' ? L('تم الاعتماد', 'Approved') : decision === 'return' ? L('أُعيد الطلب لمقدّمه', 'Returned to the requester') : L('رُفض الطلب', 'Rejected') });
  if (res) refresh();
}
async function cancel(btn, r) {
  const v = await formDialog({ title: r.status === 'draft' ? L('حذف المسودة', 'Discard draft') : L('إلغاء طلب الشراء', 'Cancel purchase request'), danger: true,
    intro: L('لا يمكن التراجع عن الإلغاء. يُفرج عن أي مبلغ محجوز في الميزانية.', 'This cannot be undone. Any committed amount is released.'),
    fields: [{ name: 'reason', label: L('السبب', 'Reason'), type: 'textarea', rows: 2, maxLength: 500 }], submitLabel: L('إلغاء الطلب', 'Cancel request') });
  if (!v) return;
  const res = await act(btn, () => call(`/requests/${r.id}/cancel`, { method: 'POST', body: { reason: v.reason || '', confirm: true } }), { success: L('أُلغي الطلب', 'Request cancelled') });
  if (res) refresh();
}
async function direct(btn, r) {
  const opts = (r.direct_candidates || []).map((p) => ({ value: p.id, label: `${L(p.name_ar, p.name_en)}${p.rating != null ? ` — ${p.rating}/5` : ''}` }));
  if (!opts.length) { toast(L('لا يوجد مورد مؤهل في هذه الفئة — استخدم طلب عروض أو سجّل مورداً', 'No eligible supplier in this category'), { kind: 'error' }); return; }
  const v = await formDialog({ title: L('شراء مباشر — إصدار أمر شراء', 'Direct purchase — issue PO'),
    intro: L('المورّدون المعروضون مؤهلون فقط (معتمدون ووثائقهم سارية). قيمة أمر الشراء أقل من حد الشراء المباشر، ويُعدّل الالتزام في الميزانية تلقائياً.', 'Only eligible suppliers are listed. The PO amount must be below the direct-purchase threshold; the budget commitment is adjusted automatically.'),
    fields: [
      { name: 'provider_id', label: L('المورد', 'Supplier'), type: 'select', required: true, options: opts },
      { name: 'amount', label: L('قيمة عرض السعر', 'Quoted amount'), type: 'money', required: true, min: 1, max: THRESHOLD - 0.01 },
      { name: 'quote_ref', label: L('مرجع عرض السعر', 'Quotation reference'), placeholder: 'Q-2026-…' },
      { name: 'note', label: L('ملاحظات', 'Notes'), type: 'textarea', rows: 2, maxLength: 300 },
    ], submitLabel: L('إصدار أمر الشراء', 'Issue PO') });
  if (!v) return;
  const res = await act(btn, () => call(`/requests/${r.id}/source`, { method: 'POST', body: { method: 'direct', ...v } }));
  if (res) { toast(L(`صدر أمر الشراء ${res.po?.po_number}`, `PO ${res.po?.po_number} issued`)); refresh(); }
}

// ---------------- request editor (full page) ----------------
let editorCache = null; // keeps unsaved input across live refreshes of the same route
export async function prEditor(ctx, id) {
  const key = location.hash;
  if (ctx.soft && editorCache?.key === key) return editorCache.node;
  const [lines, existing] = await Promise.all([call('/budget/options'), id ? call(`/requests/${id}`) : null]);
  if (existing && !existing.can.edit) return h('div', backLink(`#/sys/procurement/mine/${id}`, L('الطلب', 'Request')), card(null, emptyState({ icon: 'lock', title: L('لا يمكن تعديل هذا الطلب', 'This request cannot be edited'), body: L('يُعدّل الطلب وهو مسودة فقط.', 'Only drafts can be edited.') })));
  const v = existing || { title: '', category: 'supplies', justification: '', needed_by: '', budget_line: null, items: [] };
  const items = (v.items.length ? v.items : [{ description: '', qty: 1, unit: L('وحدة', 'unit'), est_unit_price: null }]).map((i) => ({ description: i.description, qty: i.qty, unit: i.unit, est_unit_price: i.est_unit_price }));
  const state = { category: v.category };
  const f = {};
  const field = (label, control, { help, full } = {}) => h(`div.form-row${full ? '.full' : ''}`, h('label.lbl', { for: control.id }, label), control, help ? h('div.helper', help) : null);
  f.title = h('input.field#pr-title', { type: 'text', maxlength: 200, value: v.title, placeholder: L('مثال: أجهزة حاسب محمولة لفريق خدمة المتعاملين', 'e.g. Laptops for the customer service team'), required: true });
  f.needed = h('input.field#pr-needed', { type: 'date', value: v.needed_by || '', min: new Date().toISOString().slice(0, 10), required: true });
  f.line = h('select.field#pr-line', { required: true }, h('option', { value: '' }, lines.length ? L('— اختر بند الميزانية —', '— Select budget line —') : L('لا توجد بنود لإدارتك', 'No lines for your department')),
    lines.map((l) => h('option', { value: l.id, selected: l.id === v.budget_line?.id || null }, `${l.code} — ${L(l.name_ar, l.name_en)}${l.amounts ? ` (${L('المتاح', 'available')} ${money(l.amounts.available)})` : ''}`)));
  f.just = h('textarea.field#pr-just', { rows: 4, maxlength: 2000, placeholder: L('لماذا تحتاج هذه البنود؟ ما أثرها على الخدمة أو المشروع؟', 'Why are these needed? What is the impact?') }, v.justification);
  const catSeg = h('div.pc-seg', { role: 'radiogroup', 'aria-label': L('الفئة', 'Category') }, Object.entries(CATS).map(([k, [ar, en, ic]]) => {
    const b = h(`button.pc-seg-btn${k === state.category ? '.on' : ''}`, { type: 'button', role: 'radio', 'aria-checked': String(k === state.category), onclick: () => { state.category = k; catSeg.querySelectorAll('button').forEach((x) => { const on = x === b; x.classList.toggle('on', on); x.setAttribute('aria-checked', String(on)); }); } }, icon(ic), L(ar, en));
    return b;
  }));
  const rowsBox = h('div.pc-items');
  const totalEl = h('strong.num.tabular');
  const methodEl = h('div.pc-method-hint');
  const drawTotal = () => {
    const t = items.reduce((a, i) => a + (Number(i.qty) || 0) * (Number(i.est_unit_price) || 0), 0);
    totalEl.textContent = money(t);
    methodEl.replaceChildren(t >= THRESHOLD ? h('span.chip.navy', icon('scale'), L('سيُطرح كطلب عروض أسعار', 'Will be sourced by RFQ')) : h('span.chip.sand', icon('receipt'), L('ضمن حد الشراء المباشر', 'Within the direct-purchase limit')),
      h('span.tiny.faint', L(`الحد ${fmtNum(THRESHOLD)} د.إ`, `Threshold AED ${fmtNum(THRESHOLD)}`)));
  };
  const drawRows = () => {
    rowsBox.replaceChildren(h('div.pc-item-head', { 'aria-hidden': 'true' }, h('span', '#'), h('span', L('الوصف والمواصفات الدنيا', 'Description & minimum specs')), h('span', L('الكمية', 'Qty')), h('span', L('الوحدة', 'Unit')), h('span', L('سعر الوحدة التقديري', 'Est. unit price')), h('span', L('الإجمالي', 'Total')), h('span')),
      ...items.map((it, i) => {
        const lineTotal = h('span.pc-item-total.num.tabular', money((Number(it.qty) || 0) * (Number(it.est_unit_price) || 0)));
        const upd = (k, val) => { it[k] = val; lineTotal.textContent = money((Number(it.qty) || 0) * (Number(it.est_unit_price) || 0)); drawTotal(); };
        return h('div.pc-item-row',
          h('span.pc-item-no.num', String(i + 1)),
          h('input.field', { type: 'text', value: it.description, maxlength: 300, 'aria-label': L(`وصف البند ${i + 1}`, `Item ${i + 1} description`), placeholder: L('مثال: شاشة 27 بوصة بدقة 4K', 'e.g. 27" 4K monitor'), oninput: (e) => upd('description', e.target.value) }),
          h('input.field', { type: 'number', min: 0, step: 'any', inputmode: 'decimal', value: it.qty ?? '', 'aria-label': L(`كمية البند ${i + 1}`, `Item ${i + 1} quantity`), oninput: (e) => upd('qty', e.target.value === '' ? null : Number(e.target.value)) }),
          h('input.field', { type: 'text', value: it.unit, maxlength: 30, list: 'pc-units', 'aria-label': L(`وحدة البند ${i + 1}`, `Item ${i + 1} unit`), oninput: (e) => upd('unit', e.target.value) }),
          h('div.money-field', h('input.field', { type: 'number', min: 0, step: '0.01', inputmode: 'decimal', value: it.est_unit_price ?? '', 'aria-label': L(`سعر وحدة البند ${i + 1}`, `Item ${i + 1} unit price`), oninput: (e) => upd('est_unit_price', e.target.value === '' ? null : Number(e.target.value)) }), h('span.cur', L('د.إ', 'AED'))),
          lineTotal,
          h('button.icon-btn', { type: 'button', 'aria-label': L(`حذف البند ${i + 1}`, `Remove item ${i + 1}`), disabled: items.length === 1 || null, onclick: () => { items.splice(i, 1); drawRows(); drawTotal(); } }, icon('trash')));
      }),
      h('datalist#pc-units', ['وحدة', 'جهاز', 'قطعة', 'ترخيص', 'اشتراك', 'خدمة', 'ساعة', 'شهر', 'طقم', 'نسخة', 'unit'].map((u) => h('option', { value: u }))));
  };
  drawRows(); drawTotal();
  const errBox = h('div.error-text', { role: 'alert', 'aria-live': 'polite' });
  const collect = () => ({
    title: f.title.value.trim(), category: state.category, justification: f.just.value.trim(), needed_by: f.needed.value, budget_line_id: f.line.value,
    items: items.map((i) => ({ description: String(i.description || '').trim(), qty: Number(i.qty), unit: String(i.unit || '').trim(), est_unit_price: Number(i.est_unit_price) })),
  });
  const validate = (b) => {
    if (b.title.length < 3) return [f.title, L('اكتب عنواناً واضحاً للطلب', 'Enter a clear title')];
    if (!b.needed_by) return [f.needed, L('حدّد تاريخ الحاجة', 'Set the needed-by date')];
    if (!b.budget_line_id) return [f.line, L('اختر بند الميزانية', 'Select the budget line')];
    if (b.justification.length < 10) return [f.just, L('اكتب مبرراً واضحاً (10 أحرف على الأقل)', 'Write a clear justification (10+ characters)')];
    const bad = b.items.findIndex((i) => i.description.length < 3 || !(i.qty > 0) || !i.unit || !(i.est_unit_price > 0));
    if (bad >= 0) return [rowsBox.querySelectorAll('.pc-item-row')[bad]?.querySelector('input'), L(`أكمل البند ${bad + 1}: الوصف والكمية والوحدة والسعر التقديري`, `Complete item ${bad + 1}`)];
    return null;
  };
  const save = async (btn, submit) => {
    const b = collect(); const bad = validate(b);
    errBox.textContent = bad ? bad[1] : '';
    if (bad) { bad[0]?.focus(); return; }
    const res = await act(btn, () => (id ? call(`/requests/${id}`, { method: 'PUT', body: b }).then((x) => (submit ? call(`/requests/${id}/submit`, { method: 'POST', body: {} }) : x)) : call('/requests', { method: 'POST', body: { ...b, submit } })),
      { success: submit ? L('أُرسل الطلب لمديرك المباشر', 'Sent to your line manager') : L('حُفظت المسودة', 'Draft saved') });
    if (res) { editorCache = null; location.hash = `#/sys/procurement/mine/${res.id}`; }
  };
  const saveBtn = h('button.btn', { type: 'button', onclick: (e) => save(e.currentTarget, false) }, icon('doc'), L('حفظ كمسودة', 'Save draft'));
  const submitBtn = h('button.btn.primary', { type: 'button', onclick: (e) => save(e.currentTarget, true) }, icon('send'), L('إرسال للاعتماد', 'Submit for approval'));
  const node = h('div.pc-editor',
    backLink(id ? `#/sys/procurement/mine/${id}` : '#/sys/procurement/mine', id ? L('الطلب', 'Request') : L('طلباتي', 'My requests')),
    h('div.pc-detail-head', h('div.grow', h('div.pc-eyebrow', icon('filePlus'), id ? h('span.num', existing.number) : L('طلب شراء جديد', 'New purchase request')), h('h2.pc-title', id ? L('تعديل طلب الشراء', 'Edit purchase request') : L('ماذا تحتاج أن تشتري؟', 'What do you need to buy?')),
      h('p.pc-sub', L('اكتب البنود بمواصفاتها الدنيا وسعراً تقديرياً واقعياً. تُستخدم التقديرات داخلياً فقط ولا تظهر للموردين.', 'Describe items with minimum specs and a realistic estimate. Estimates stay internal and are never shown to suppliers.')))),
    grid('main-side',
      h('div.pc-main',
        section(L('بيانات الطلب', 'Request details'), h('div.form-grid',
          field(L('عنوان الطلب', 'Title'), f.title, { full: true }),
          h('div.form-row.full', h('span.lbl', L('الفئة', 'Category')), catSeg),
          field(L('مطلوب بحلول', 'Needed by'), f.needed),
          field(L('بند الميزانية', 'Budget line'), f.line, { help: L('بنود إدارتك فقط', 'Your department’s lines only') }),
          field(L('مبرر الحاجة', 'Justification'), f.just, { full: true }))),
        section(L('البنود', 'Items'), rowsBox,
          h('div.pc-items-foot', h('button.btn.sm.tertiary', { type: 'button', onclick: () => { items.push({ description: '', qty: 1, unit: items[items.length - 1]?.unit || L('وحدة', 'unit'), est_unit_price: null }); drawRows(); drawTotal(); rowsBox.querySelector('.pc-item-row:last-of-type input')?.focus(); } }, icon('plus'), L('إضافة بند', 'Add item')),
            h('span.grow'), methodEl, h('div.pc-total', h('span', L('الإجمالي التقديري', 'Estimated total')), totalEl)))),
      h('div.pc-side',
        h('section.card.pc-next', h('span.pc-next-eyebrow', icon('workflow'), L('ماذا يحدث بعد الإرسال؟', 'What happens next?')),
          h('ol.pc-flow', [
            [L('مديرك المباشر', 'Your line manager'), L('يعتمد الحاجة أو يعيدها بملاحظات', 'Approves the need or returns it')],
            [L('الإدارة المالية', 'Finance'), L('تتحقق من رصيد البند وتحجز المبلغ', 'Checks the line and commits the amount')],
            [L('قسم المشتريات', 'Procurement'), L('شراء مباشر أو طلب عروض بمساعدة الذكاء الاصطناعي', 'Direct purchase or AI-assisted RFQ')],
            [L('أمر الشراء', 'Purchase order'), L('يصلك إشعار عند صدوره', 'You are notified when issued')],
          ].map(([a, b]) => h('li', h('strong', a), h('span', b))))),
        h('div.pc-editor-actions', errBox, submitBtn, saveBtn))));
  editorCache = { key, node };
  window.addEventListener('hashchange', () => { if (location.hash !== key) editorCache = null; }, { once: true });
  return node;
}

// ---------------- «الاعتمادات» ----------------
export async function approvalsTab(ctx, me) {
  const q = await call('/approvals');
  const wrap = h('div.pc-approvals');
  const total = q.requests.manager.length + q.requests.finance.length + q.requests.procurement.length + q.rfqs.length;
  const tiles = [
    statTile({ label: L('اعتماد المدير', 'Manager approval'), value: q.requests.manager.length, icon: 'userCheck', tone: q.requests.manager.length ? 'warn' : null }),
    me.roles.finance ? statTile({ label: L('اعتماد الميزانية', 'Budget approval'), value: q.requests.finance.length, icon: 'wallet', tone: q.requests.finance.length ? 'warn' : null }) : null,
    me.roles.officer ? statTile({ label: L('للطرح', 'To source'), value: q.requests.procurement.length, icon: 'cart', tone: q.requests.procurement.length ? 'emph' : null }) : null,
    me.roles.committee || me.roles.legal || me.roles.officer ? statTile({ label: L('خطوات طلبات العروض', 'RFQ steps'), value: q.rfqs.length, icon: 'scale', tone: q.rfqs.length ? 'emph' : null }) : null,
  ].filter(Boolean);
  if (tiles.length > 1) wrap.append(statRow(tiles));
  if (!total) {
    wrap.append(card(null, emptyState({ icon: 'checkCheck', title: L('لا شيء بانتظارك الآن', 'Nothing waiting for you'), body: L('ستظهر هنا طلبات الشراء وخطوات طلبات العروض التي تحتاج قرارك، وتصلك تنبيهات عند وصولها.', 'Purchase requests and RFQ steps that need your decision appear here; you are notified when they arrive.'), actions: [{ label: L('طلباتي', 'My requests'), onClick: () => { location.hash = '#/sys/procurement/mine'; } }] })));
    return wrap;
  }
  const group = (title, sub, rows, render) => (rows.length ? h('section.pc-queue', h('header.pc-queue-head', h('h2.card-title', title, ' ', h('span.count.tabular', fmtNum(rows.length))), sub ? h('p.tiny.faint', sub) : null), h('div.pc-queue-list', rows.map(render))) : null);
  const reqRow = (extra) => (r) => h('a.card.pc-qrow', { href: `#/sys/procurement/approvals/${r.id}` },
    h('div.pc-qrow-main', h('div.pc-pr-top', h('span.pc-num.num', r.number), prChip(r.status), demoChip(r.is_demo)), h('strong.pc-qrow-title', r.title),
      h('div.pc-pr-meta', whoChip(r.requester), h('span.faint', '·'), L(r.dept_ar, r.dept_en), h('span.faint', '·'), L('مطلوب بحلول', 'Needed by'), ' ', n(fmtDate(r.needed_by)))),
    h('div.pc-qrow-side', aed(r.est_total), extra?.(r), h('span.btn.sm.primary', L('مراجعة', 'Review'), icon('chevron', 'flip-rtl'))));
  wrap.append(...[
    group(L('اعتماد المدير المباشر', 'Line-manager approval'), L('طلبات موظفي إدارتك. لا يعتمد أحد طلبه بنفسه.', 'Requests from your department. Nobody approves their own request.'), q.requests.manager, reqRow()),
    group(L('اعتماد الميزانية', 'Budget approval'), L('التحقق من الرصيد المتاح وحجز المبلغ.', 'Check the available balance and commit the amount.'), q.requests.finance,
      reqRow((r) => (r.budget ? h(`span.chip.tiny.${r.budget.sufficient ? 'good' : 'crit'}`, icon(r.budget.sufficient ? 'circleCheck' : 'circleAlert'), r.budget.sufficient ? L('الرصيد كافٍ', 'Budget OK') : L('الرصيد غير كافٍ', 'Insufficient')) : null))),
    group(L('بانتظار الطرح', 'Ready to source'), L('اختر الشراء المباشر أو طلب العروض وفق حد 50,000 د.إ.', 'Choose direct purchase or RFQ (AED 50,000 threshold).'), q.requests.procurement,
      reqRow((r) => h(`span.chip.tiny.${r.suggested_method === 'rfq' ? 'navy' : 'sand'}`, r.suggested_method === 'rfq' ? L('طلب عروض', 'RFQ') : L('شراء مباشر', 'Direct')))),
    group(L('طلبات العروض', 'RFQs'), L('مفاتيح الفتح، التقييم الفني، التصويت، المراجعة القانونية وإصدار أمر الشراء.', 'Opening keys, scoring, votes, legal review and PO issue.'), q.rfqs,
      (x) => h('a.card.pc-qrow', { href: `#/sys/procurement/rfqs/${x.rfq.id}` },
        h('div.pc-qrow-main', h('div.pc-pr-top', h('span.pc-num.num', x.rfq.number), rfqChip(x.rfq.status), demoChip(x.rfq.is_demo)), h('strong.pc-qrow-title', x.rfq.title), h('div.pc-pr-meta', icon(QICON[x.kind] || 'circleDot'), L(x.ar, x.en))),
        h('div.pc-qrow-side', h('span.btn.sm.primary', L('افتح', 'Open'), icon('chevron', 'flip-rtl'))))),
  ].filter(Boolean));
  return wrap;
}
const QICON = { open_key: 'key', score: 'star', vote: 'vote', legal: 'gavel', finalize: 'clipboardCheck', recommend: 'thumbsUp', award: 'stamp' };
