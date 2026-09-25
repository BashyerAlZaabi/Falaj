// Vendor portal (external): my company profile & document metadata (renewals are
// verified by Procurement before they count), my contracts / purchase orders and
// my evaluation summary. A provider never sees another provider or internal data.
import { h, icon, emptyState, L, fmtNum, fmtDate, statRow, statTile, card, grid, formDialog, act, money, statusChip } from '../../../sys-kit.js';
import { emit } from '../../../state.js';
import { call, STATUS, DOC_STATE, DOC_ICON, catName, demoChip, aed, kv, stars } from './internal.js';

const refresh = () => emit('data-changed', { entity: 'sys:providers' });
const section = (title, ...children) => h('section.card.sys-card.pv-card', h('div.card-head', h('h2.card-title', title)), ...children);

export async function companyTab() {
  const d = await call('/portal');
  const c = d.company; const el = d.eligibility;
  const wrap = h('div.pv-company');
  wrap.append(h('div.pv-hero.card', h('span.pv-hero-logo', { 'aria-hidden': 'true' }, icon('building')),
    h('div.grow', h('div.pc-eyebrow', statusChip(c.status, STATUS), el.eligible ? h('span.chip.tiny.good', icon('circleCheck'), L('مؤهل لتلقي الدعوات', 'Eligible for invitations')) : h('span.chip.tiny.crit', icon('ban'), L('غير مؤهل حالياً', 'Not eligible now')), demoChip(c.is_demo)),
      h('h2.pc-title', L(c.name_ar, c.name_en)), h('p.pc-sub', c.categories.map(catName).join('، '))),
    h('div.pv-hero-side', stars(d.evaluation.rating, d.evaluation.count))));
  const attention = [...el.reasons, ...el.warnings];
  if (attention.length) wrap.append(h(`div.callout.pc-callout.${el.eligible ? 'warn' : 'crit'}`, icon('fileWarning'), h('div', h('strong', el.eligible ? L('انتبه: ', 'Heads-up: ') : L('لن تصلكم دعوات جديدة حتى المعالجة: ', 'No new invitations until resolved: ')), attention.map((x) => L(x.ar, x.en)).join(' · '))));
  const docs = section(L('وثائق الشركة', 'Company documents'),
    h('div.pv-docs', d.documents.map((doc) => h(`div.pv-doc.${doc.state}`,
      h('span.pv-doc-ic', icon(DOC_ICON[doc.kind])),
      h('div.grow', h('strong', L(doc.name_ar, doc.name_en)), h('div.tiny.faint', doc.ref_no ? h('span.num', doc.ref_no) : L('لا مرجع', 'No reference')),
        h('div.pv-doc-exp', statusChip(doc.state, DOC_STATE), doc.expires_on ? h('span.tiny', L('تنتهي', 'Expires'), ' ', h('span.num', fmtDate(doc.expires_on))) : null),
        doc.pending ? h('div.pv-renewal', icon('hourglass'), L(`تحديثكم (حتى ${doc.pending.expires_on}) بانتظار تحقق قسم المشتريات`, `Your renewal (until ${doc.pending.expires_on}) is awaiting verification`)) : null),
      (() => { const b = h('button.btn.sm', { type: 'button' }, icon('fileUp'), L('تحديث', 'Renew')); b.addEventListener('click', () => renew(b, doc)); return b; })()))),
    h('p.tiny.faint', L('تُسجَّل البيانات الوصفية فقط (المرجع والتواريخ). يعتمد قسم المشتريات التحديث بعد مطابقته بالوثيقة الأصلية.', 'Only metadata (reference and dates) is recorded. Procurement verifies renewals against the originals.')));
  const contact = section(L('بيانات التواصل', 'Contact details'), kv([[L('المسؤول', 'Contact'), c.contact_name], [L('البريد', 'Email'), c.contact_email ? h('span', { dir: 'ltr' }, c.contact_email) : null], [L('الهاتف', 'Phone'), c.contact_phone ? h('span.num', { dir: 'ltr' }, c.contact_phone) : null]]),
    (() => { const b = h('button.btn.sm', { type: 'button' }, icon('pencil'), L('تعديل', 'Edit')); b.addEventListener('click', () => editContact(b, c)); return b; })());
  wrap.append(grid('main-side', h('div.pc-main', docs), h('div.pc-side', contact, evaluationCard(d.evaluation))));
  return wrap;
}
function evaluationCard(ev) {
  return section(L('ملخص تقييم الأداء', 'Performance summary'),
    ev.count ? [h('div.pv-big-rating', h('span.num', String(ev.rating)), h('span.faint', L('من 5', 'of 5')), h('span.tiny.faint', L(`${fmtNum(ev.count)} تقييم`, `${ev.count} review(s)`))),
      h('div.pv-scores', [[L('الجودة', 'Quality'), ev.quality], [L('الالتزام بالمواعيد', 'Timeliness'), ev.timeliness], [L('الامتثال', 'Compliance'), ev.compliance]].map(([k, v]) => h('div.pv-score', h('span', k), h('div.pv-bar', h('i', { style: { width: `${(v / 5) * 100}%` } })), h('strong.num', String(v))))),
      h('p.tiny.faint', L('يقيّم مالك كل عقد أداءكم ربع سنوياً.', 'Each contract owner reviews you quarterly.'))]
      : emptyState({ compact: true, icon: 'star', title: L('لا تقييمات بعد', 'No reviews yet'), body: L('تظهر التقييمات بعد تنفيذ العقود.', 'Reviews appear once contracts are delivered.') }));
}
async function renew(btn, doc) {
  const v = await formDialog({ title: L(`تحديث ${doc.name_ar}`, `Renew ${doc.name_en}`), intro: L('أدخلوا بيانات الوثيقة المجددة. تبقى البيانات الحالية سارية حتى يعتمد قسم المشتريات التحديث.', 'Enter the renewed document data. Current data stays in force until Procurement verifies it.'),
    fields: [{ name: 'ref_no', label: L('رقم الوثيقة', 'Document no.'), required: true }, { name: 'issued_on', label: L('تاريخ الإصدار', 'Issued on'), type: 'date', required: true, max: new Date().toISOString().slice(0, 10) }, { name: 'expires_on', label: L('تاريخ الانتهاء', 'Expires on'), type: 'date', required: true, min: new Date().toISOString().slice(0, 10) }],
    submitLabel: L('إرسال للتحقق', 'Submit for verification') });
  if (!v) return;
  if (await act(btn, () => call(`/portal/documents/${doc.kind}`, { method: 'PUT', body: v }), { success: L('أُرسل التحديث — بانتظار التحقق', 'Submitted — awaiting verification') })) refresh();
}
async function editContact(btn, c) {
  const v = await formDialog({ title: L('بيانات التواصل', 'Contact details'), fields: [{ name: 'contact_name', label: L('المسؤول', 'Contact person'), required: true }, { name: 'contact_email', label: L('البريد الإلكتروني', 'Email'), required: true }, { name: 'contact_phone', label: L('الهاتف', 'Phone') }], values: c, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  if (await act(btn, () => call('/portal/contact', { method: 'PUT', body: v }), { success: L('حُفظت بيانات التواصل', 'Saved') })) refresh();
}

export async function vendorContractsTab() {
  const d = await call('/portal');
  const list = d.contracts;
  const wrap = h('div.pv-vcontracts');
  wrap.append(statRow([
    statTile({ label: L('عقود قائمة', 'Active contracts'), value: list.filter((c) => c.status === 'active').length, icon: 'handshake' }),
    statTile({ label: L('قيمة أوامر الشراء', 'PO value'), value: money(list.reduce((a, c) => a + c.value, 0)), icon: 'receipt' }),
    statTile({ label: L('متوسط التقييم', 'Average rating'), value: d.evaluation.rating, unit: d.evaluation.rating != null ? L('من 5', '/5') : null, icon: 'star', tone: 'emph' }),
  ]));
  if (!list.length) { wrap.append(card(null, emptyState({ icon: 'handshake', title: L('لا عقود بعد', 'No contracts yet'), body: L('عند ترسية طلب عروض عليكم يصدر أمر الشراء ويظهر العقد هنا.', 'When an RFQ is awarded to you, the PO and contract appear here.') }))); return wrap; }
  wrap.append(h('div.pv-vlist', list.map((c) => h('article.card.pv-vcontract',
    h('div.pc-pr-top', h('strong.num', c.number), c.po_number ? h('span.chip.tiny.navy', icon('receipt'), h('span.num', c.po_number)) : null, demoChip(c.is_demo), h('span.grow'), aed(c.value)),
    h('h3.pc-pr-title', c.title),
    h('div.pc-pr-meta', L(c.dept_ar, c.dept_en), h('span.faint', '·'), h('span.num', `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`)),
    c.evaluations.length ? h('ul.pv-vevals', c.evaluations.map((e) => h('li', h('span.chip.tiny.outline', e.period), h('span', L('الجودة', 'Quality'), ' ', h('b.num', e.quality)), h('span', L('المواعيد', 'Timeliness'), ' ', h('b.num', e.timeliness)), h('span', L('الامتثال', 'Compliance'), ' ', h('b.num', e.compliance)), e.comment ? h('p.pc-prose', e.comment) : null)))
      : h('p.tiny.faint', icon('hourglass'), L(' لم يُقيَّم بعد', ' Not reviewed yet'))))));
  return wrap;
}
