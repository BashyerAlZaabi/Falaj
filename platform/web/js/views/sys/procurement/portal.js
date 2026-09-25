// Vendor portal (external identities): invitations with deadlines, the sealed
// bid form, and results. A provider only ever sees its own invitations, its own
// bid and its own outcome («تمت الترسية عليكم» / «لم تتم الترسية عليكم»).
// Used by both systems' external views (procurement and providers).
import { h, icon, toast, emptyState, L, fmtNum, fmtDate, statRow, statTile, card, grid, formDialog, act, money, dataTable } from '../../../sys-kit.js';
import { emit } from '../../../state.js';
import { call, catName, vendorChip, demoChip, n, aed, dt, backLink, section, countdown, countdownPill } from './common.js';

const refresh = () => emit('data-changed', { entity: 'sys:procurement' });

export async function invitationsView(ctx, { base }) {
  const list = await call('/portal/invitations');
  const open = list.filter((i) => i.status === 'open').sort((a, b) => String(a.closes_at).localeCompare(String(b.closes_at)));
  const noBid = open.filter((i) => i.my_bid?.status !== 'submitted');
  const wrap = h('div.pc-portal');
  wrap.append(statRow([
    statTile({ label: L('دعوات مفتوحة', 'Open invitations'), value: open.length, icon: 'inbox', tone: open.length ? 'emph' : null }),
    statTile({ label: L('بلا عرض بعد', 'Without a bid'), value: noBid.length, icon: 'hourglass', tone: noBid.length ? 'warn' : 'good' }),
    statTile({ label: L('قيد التقييم', 'Under evaluation'), value: list.filter((i) => i.status === 'under_evaluation').length, icon: 'scale' }),
    statTile({ label: L('ترسيات لكم', 'Awarded to you'), value: list.filter((i) => i.status === 'awarded').length, icon: 'badgeCheck', tone: 'good' }),
  ]));
  if (!list.length) {
    wrap.append(card(null, emptyState({ icon: 'inbox', title: L('لا توجد دعوات بعد', 'No invitations yet'), body: L('عندما يدعوكم قسم المشتريات لتقديم عرض، تظهر الدعوة هنا مع موعد الإغلاق ويصلكم تنبيه.', 'When Procurement invites you to bid, the invitation appears here with its deadline and you are notified.') })));
    return wrap;
  }
  if (noBid.length) wrap.append(h('div.pc-next-banner', h('span.pc-next-ic', icon('sparkle')), h('div.grow', h('span.pc-next-eyebrow', L('الإجراء التالي', 'Next step')), h('h3', L(`قدّم عرضك في ${noBid[0].number}`, `Submit your bid for ${noBid[0].number}`)), h('p', `${noBid[0].title} — ${countdown(noBid[0].closes_at).text}`)),
    h('div.pc-next-actions', h('a.btn.primary', { href: `${base}/${noBid[0].id}` }, icon('send'), L('قدّم العرض', 'Submit bid')))));
  const groups = [
    [L('مفتوحة لتقديم العروض', 'Open for bids'), open],
    [L('قيد التقييم', 'Under evaluation'), list.filter((i) => i.status === 'under_evaluation')],
    [L('النتائج', 'Results'), list.filter((i) => ['awarded', 'not_awarded'].includes(i.status))],
    [L('مغلقة أو ملغاة', 'Closed or cancelled'), list.filter((i) => ['closed', 'cancelled'].includes(i.status))],
  ];
  for (const [label, rows] of groups) {
    if (!rows.length) continue;
    wrap.append(h('h2.section', label, h('span.count', fmtNum(rows.length))), h('div.pc-cards', rows.map((i) => h('a.card.pc-rfq-card.pc-inv', { href: `${base}/${i.id}` },
      h('div.pc-pr-top', h('span.pc-num.num', i.number), vendorChip(i.status), demoChip(i.is_demo)),
      h('h3.pc-pr-title', i.title),
      h('div.pc-rfq-facts', i.status === 'open' ? countdownPill(i.closes_at) : h('span.pc-fact', icon('calendar'), L('أُغلق', 'Closed'), ' ', n(fmtDate(i.closes_at))), h('span.pc-fact', icon('package'), catName(i.category)),
        i.my_bid ? h(`span.pc-fact.${i.my_bid.status === 'submitted' ? 'good' : ''}`, icon(i.my_bid.status === 'submitted' ? 'circleCheck' : 'undo'), i.my_bid.status === 'submitted' ? L('قُدّم عرضكم', 'Bid submitted') : L('سُحب العرض', 'Withdrawn')) : i.status === 'open' ? h('span.pc-fact.warn', icon('hourglass'), L('لم يُقدَّم عرض بعد', 'No bid yet')) : null,
        i.po_number ? h('span.pc-fact.good', icon('receipt'), h('span.num', i.po_number)) : null)))));
  }
  return wrap;
}

let bidCache = null; // unsaved prices survive live refreshes of the same invitation
export async function invitationDetail(ctx, id, { base }) {
  const key = location.hash;
  if (ctx.soft && bidCache?.key === key) return bidCache.node;
  const r = await call(`/portal/rfqs/${id}`);
  const page = h('div.pc-detail.pc-portal-detail');
  page.append(backLink(base, L('الدعوات', 'Invitations')));
  const cd = r.status === 'open' ? countdown(r.closes_at) : null;
  page.append(h('div.pc-detail-head',
    h('div.grow', h('div.pc-eyebrow', h('span.num', r.number), vendorChip(r.status), demoChip(r.is_demo)), h('h2.pc-title', r.title), h('p.pc-sub', catName(r.category), h('span.faint', '·'), L('آخر موعد', 'Deadline'), ' ', dt(r.closes_at))),
    h('div.pc-amount', cd ? [h('span.pc-amount-label', L('الوقت المتبقي', 'Time left')), h(`span.pc-amount-value.pc-cd.${cd.tone || ''}`, cd.text)] : [h('span.pc-amount-label', L('الحالة', 'Status')), vendorChip(r.status)])));
  if (r.status === 'awarded') page.append(h('div.pc-result.good', h('span.pc-result-ic', icon('badgeCheck')), h('div', h('h3', L('تمت الترسية عليكم', 'This RFQ was awarded to you')), h('p', L(`رقم أمر الشراء ${r.po_number}. سيتواصل معكم مالك العقد لترتيب التسليم، ويظهر العقد في «عقودي».`, `PO ${r.po_number}. The contract owner will contact you; the contract appears under «My contracts».`)))));
  if (r.status === 'not_awarded') page.append(h('div.pc-result', h('span.pc-result-ic', icon('info')), h('div', h('h3', L('لم تتم الترسية عليكم', 'Not awarded to you')), h('p', L('شكراً لمشاركتكم. لا تُعرض تفاصيل العروض الأخرى حفاظاً على سرية المنافسة.', 'Thank you for participating. Other bids are never disclosed.')))));
  if (r.status === 'under_evaluation') page.append(h('div.pc-result', h('span.pc-result-ic', icon('hourglass')), h('div', h('h3', L('عرضكم قيد التقييم', 'Your bid is under evaluation')), h('p', L('فُتحت العروض بعد الإغلاق بمفتاحين من لجنة التقييم. ستصلكم النتيجة عند اعتمادها.', 'Bids were opened after closing by two committee members. You will be notified of the outcome.')))));
  if (r.status === 'cancelled') page.append(h('div.pc-result', h('span.pc-result-ic', icon('ban')), h('div', h('h3', L('أُلغي طلب العروض', 'This RFQ was cancelled')))));
  if (!r.eligibility.eligible || r.eligibility.warnings.length) page.append(h(`div.callout.pc-callout.${r.eligibility.eligible ? 'warn' : 'crit'}`, icon('fileWarning'), h('div', h('strong', L('وثائق شركتكم: ', 'Your documents: ')), [...r.eligibility.reasons, ...r.eligibility.warnings].map((x) => L(x.ar, x.en)).join(' · '), ' — ', h('a', { href: '#/sys/providers/company' }, L('تحديث الوثائق', 'Update documents')))));

  const lines = new Map((r.bid?.lines || []).map((l) => [l.item_id, l.unit_price]));
  const editable = r.can_bid;
  const totalEl = h('strong.num.tabular');
  const drawTotal = () => { totalEl.textContent = money(r.items.reduce((a, it) => a + (lines.get(it.id) ?? 0) * it.qty, 0)); };
  const rows = r.items.map((it) => {
    const lt = h('span.num.tabular.pc-item-total', money((lines.get(it.id) ?? 0) * it.qty));
    const input = editable ? h('div.money-field', h('input.field', { type: 'number', min: 0, step: '0.01', inputmode: 'decimal', value: lines.get(it.id) ?? '', 'aria-label': L(`سعر وحدة البند ${it.line_no}`, `Unit price, item ${it.line_no}`), placeholder: L('غير مسعّر', 'Not priced'),
      oninput: (e) => { const v = e.target.value === '' ? null : Number(e.target.value); if (v == null) lines.delete(it.id); else lines.set(it.id, v); lt.textContent = money((lines.get(it.id) ?? 0) * it.qty); drawTotal(); } }), h('span.cur', L('د.إ', 'AED')))
      : (lines.get(it.id) != null ? aed(lines.get(it.id)) : h('span.faint', L('غير مسعّر', 'Not priced')));
    return { it, input, lt };
  });
  drawTotal();
  const f = {
    delivery: h('input.field#bid-delivery', { type: 'number', min: 1, max: 365, value: r.bid?.delivery_days ?? '', disabled: !editable || null }),
    validity: h('input.field#bid-validity', { type: 'number', min: 30, max: 365, value: r.bid?.validity_days ?? 90, disabled: !editable || null }),
    note: h('textarea.field#bid-note', { rows: 4, maxlength: 3000, disabled: !editable || null, placeholder: L('العرض الفني: المواصفات المعروضة، بلد المنشأ، الضمان، خطة التسليم…', 'Technical offer: specs, origin, warranty, delivery plan…') }, r.bid?.technical_note || ''),
  };
  const errBox = h('div.error-text', { role: 'alert', 'aria-live': 'polite' });
  const submit = async (btn) => {
    const body = { lines: r.items.map((it) => ({ item_id: it.id, ...(lines.get(it.id) != null ? { unit_price: lines.get(it.id) } : {}) })), delivery_days: Number(f.delivery.value), validity_days: Number(f.validity.value), technical_note: f.note.value.trim() };
    const msg = !lines.size ? L('سعّر بنداً واحداً على الأقل', 'Price at least one item') : !(body.delivery_days >= 1 && body.delivery_days <= 365) ? L('مدة التسليم من 1 إلى 365 يوماً', 'Delivery 1–365 days') : !(body.validity_days >= 30 && body.validity_days <= 365) ? L('صلاحية العرض من 30 إلى 365 يوماً', 'Validity 30–365 days') : '';
    errBox.textContent = msg;
    if (msg) return;
    const missing = r.items.length - lines.size;
    const res = await act(btn, () => call(`/portal/rfqs/${id}/bid`, { method: 'PUT', body }), { success: r.bid?.status === 'submitted' ? L('حُدّث عرضكم المختوم', 'Your sealed bid was updated') : L('قُدّم عرضكم وهو مختوم حتى موعد الإغلاق', 'Bid submitted — sealed until closing') });
    if (res) { if (missing) toast(L(`تنبيه: ${missing === 1 ? 'بند واحد غير مسعّر' : `${missing} بنود غير مسعّرة`} — يُعدّ العرض غير مكتمل`, `Note: ${missing} item(s) not priced — the bid is incomplete`), { kind: 'info' }); bidCache = null; refresh(); }
  };
  const withdraw = async (btn) => {
    const v = await formDialog({ title: L('سحب العرض', 'Withdraw bid'), danger: true, intro: L('يمكنكم تقديم عرض جديد قبل موعد الإغلاق. بعد الإغلاق لا يمكن السحب أو التعديل.', 'You can submit again before closing. After closing, bids cannot be withdrawn or changed.'), fields: [{ type: 'info', label: L('سيُسجَّل السحب في سجل التدقيق.', 'The withdrawal is audited.') }], submitLabel: L('سحب العرض', 'Withdraw') });
    if (!v) return;
    if (await act(btn, () => call(`/portal/rfqs/${id}/withdraw`, { method: 'POST', body: { confirm: true } }), { success: L('سُحب العرض', 'Bid withdrawn') })) { bidCache = null; refresh(); }
  };
  const itemsTbl = h('div.table-wrap', h('table.tbl.stack-mobile.pc-bid-tbl', h('caption.sr-only', L('بنود طلب العروض وأسعاركم', 'RFQ items and your prices')),
    h('thead', h('tr', h('th.num', { scope: 'col' }, '#'), h('th', { scope: 'col' }, L('البند', 'Item')), h('th.num', { scope: 'col' }, L('الكمية', 'Qty')), h('th', { scope: 'col' }, L('الوحدة', 'Unit')), h('th.num', { scope: 'col' }, L('سعر الوحدة', 'Unit price')), h('th.num', { scope: 'col' }, L('الإجمالي', 'Total')))),
    h('tbody', rows.map(({ it, input, lt }) => h('tr', h('td.num', { 'data-label': '#' }, String(it.line_no)), h('td', { 'data-label': L('البند', 'Item') }, it.description), h('td.num', { 'data-label': L('الكمية', 'Qty') }, h('span.num', fmtNum(it.qty))), h('td', { 'data-label': L('الوحدة', 'Unit') }, it.unit), h('td.num', { 'data-label': L('سعر الوحدة', 'Unit price') }, input), h('td.num', { 'data-label': L('الإجمالي', 'Total') }, lt))))));
  const main = h('div.pc-main',
    section(L('عرضكم المالي', 'Your financial offer'), itemsTbl, h('div.pc-items-foot', h('span.tiny.faint', L('الأسعار بالدرهم دون ضريبة القيمة المضافة. البند غير المسعّر يُعدّ غير مقدَّم.', 'AED, excluding VAT. An unpriced item is treated as not offered.')), h('span.grow'), h('div.pc-total', h('span', L('إجمالي العرض', 'Bid total')), totalEl))),
    section(L('العرض الفني والشروط', 'Technical offer & terms'), h('div.form-grid',
      h('div.form-row', h('label.lbl', { for: 'bid-delivery' }, L('مدة التسليم (أيام)', 'Delivery (days)')), f.delivery),
      h('div.form-row', h('label.lbl', { for: 'bid-validity' }, L('صلاحية العرض (أيام)', 'Validity (days)')), f.validity),
      h('div.form-row.full', h('label.lbl', { for: 'bid-note' }, L('العرض الفني', 'Technical offer')), f.note))),
    r.spec_html ? h('section.card.sys-card.pc-card', h('details.pc-spec', { open: editable || null }, h('summary', icon('fileText'), L('نطاق العمل والمواصفات', 'Scope of work & specification')), h('div.pc-spec-body.doc-prose', { html: r.spec_html }))) : null);
  const side = h('div.pc-side',
    h('section.card.pc-next.pc-seal', h('span.pc-next-eyebrow', icon('lockKeyhole'), L('عرض مختوم', 'Sealed bid')),
      h('h3', r.bid?.status === 'submitted' ? L('قُدّم عرضكم', 'Your bid is in') : r.bid?.status === 'withdrawn' ? L('سُحب عرضكم', 'Your bid was withdrawn') : editable ? L('لم تقدّموا عرضاً بعد', 'You have not bid yet') : L('لم يُقدَّم عرض', 'No bid submitted')),
      h('p', L('لا يطّلع أحد على عرضكم قبل موعد الإغلاق، ويُفتح بمفتاحين من لجنة التقييم. لا يرى أي مورد آخر عرضكم أو عدد المتقدمين.', 'Nobody can read your bid before closing; it is opened with two committee keys. No other supplier sees your bid or the number of bidders.')),
      r.bid?.submitted_at ? h('p.tiny.faint', L('آخر تقديم', 'Last submitted'), ' ', dt(r.bid.submitted_at)) : null,
      editable ? h('div.pc-next-actions', errBox, (() => { const b = h('button.btn.primary.block', { type: 'button' }, icon('send'), r.bid?.status === 'submitted' ? L('تحديث العرض', 'Update bid') : L('تقديم العرض', 'Submit bid')); b.addEventListener('click', () => submit(b)); return b; })(),
        r.bid?.status === 'submitted' ? (() => { const b = h('button.btn.ghost.block', { type: 'button' }, icon('undo'), L('سحب العرض', 'Withdraw')); b.addEventListener('click', () => withdraw(b)); return b; })() : null) : null),
    section(L('معايير التقييم المعلنة', 'Published evaluation criteria'), h('ul.list.pc-criteria', r.criteria.map((c) => h('li', h('span.grow', L(c.ar, c.en)), h('span.chip.tiny.navy', h('span.num', `${c.weight}%`))))),
      h('p.tiny.faint', L(`الوزن الفني ${r.tech_weight}% والمالي ${100 - r.tech_weight}%، وحد القبول الفني ${r.min_tech}%. الدرجة المالية بمعادلة أقل سعر.`, `Technical ${r.tech_weight}%, financial ${100 - r.tech_weight}%, pass mark ${r.min_tech}%. Financial score uses the lowest-price formula.`))));
  page.append(grid('main-side', main, side));
  bidCache = { key, node: page };
  window.addEventListener('hashchange', () => { if (location.hash !== key) bidCache = null; }, { once: true });
  return page;
}

export async function bidsView(ctx, { base }) {
  const list = (await call('/portal/invitations')).filter((i) => i.my_bid);
  if (!list.length) return card(null, emptyState({ icon: 'fileText', title: L('لم تقدّموا عروضاً بعد', 'No bids yet'), body: L('تظهر هنا عروضكم وحالتها ونتائجها.', 'Your bids, their status and outcomes appear here.'), actions: [{ label: L('الدعوات', 'Invitations'), primary: true, onClick: () => { location.hash = base; } }] }));
  return card(null, dataTable({ rows: list, onRow: (i) => { location.hash = `${base}/${i.id}`; }, caption: L('عروضي', 'My bids'), columns: [
    { key: 'number', label: L('الطلب', 'RFQ'), render: (i) => h('span.num', i.number) },
    { key: 'title', label: L('العنوان', 'Title') },
    { key: 'total', label: L('إجمالي عرضكم', 'Your total'), num: true, render: (i) => aed(i.my_bid.total) },
    { key: 'submitted', label: L('آخر تقديم', 'Submitted'), render: (i) => dt(i.my_bid.submitted_at) },
    { key: 'status', label: L('النتيجة', 'Outcome'), render: (i) => (i.my_bid.status === 'withdrawn' ? h('span.chip.tiny.outline', L('مسحوب', 'Withdrawn')) : vendorChip(i.status)) },
  ] }));
}
