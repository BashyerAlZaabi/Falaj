// Service Providers (internal): registry with eligibility at a glance, the provider
// profile (documents with expiry tracking, status workflow, contracts, evaluations,
// history, access log), contracts with owner evaluations, and documents to verify.
import {
  h, icon, toast, confirmDialog, emptyState, L, fmtNum, fmtDate, sysApi, statRow, statTile, card, grid, formDialog, timeline, act, money,
  whoChip, dataTable, filterBar, accessLogList, statusChip, confidentialBanner,
} from '../../../sys-kit.js';
import { emit } from '../../../state.js';

export const call = sysApi('providers');
const refresh = () => emit('data-changed', { entity: 'sys:providers' });
export const CATS = { it: ['خدمات تقنية المعلومات', 'IT services', 'monitor'], supplies: ['التوريدات', 'Supplies', 'package'], consulting: ['الاستشارات', 'Consulting', 'briefcase'], facilities: ['خدمات المرافق', 'Facilities', 'building'] };
export const STATUS = { pending: ['قيد التأهيل', 'Pending', 'warn', 'hourglass'], approved: ['معتمد', 'Approved', 'good', 'badgeCheck'], suspended: ['معلّق', 'Suspended', 'crit', 'pause'], blacklisted: ['محظور', 'Blacklisted', 'crit', 'ban'] };
export const DOC_STATE = { valid: ['سارية', 'Valid', 'good', 'circleCheck'], expiring: ['تنتهي قريباً', 'Expiring soon', 'warn', 'clock'], expired: ['منتهية', 'Expired', 'crit', 'circleAlert'], missing: ['غير مسجّلة', 'Missing', 'outline', 'circleDashed'] };
export const DOC_ICON = { licence: 'idCard', vat: 'receipt', insurance: 'shield' };
export const catName = (k) => (CATS[k] ? L(CATS[k][0], CATS[k][1]) : k);
export const demoChip = (on) => (on ? h('span.chip.tiny.demo', L('تجريبي', 'Demo')) : null);
export const aed = (v) => h('span.num.tabular', money(v));
export const kv = (pairs) => h('dl.sys-kv', pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', k), h('dd', v ?? '—')]));
const section = (title, ...children) => h('section.card.sys-card.pv-card', h('div.card-head', h('h2.card-title', title)), ...children);
const back = (href, label) => h('a.pc-back', { href }, icon('chevronL', 'flip-rtl'), label);
export function stars(r, count) {
  if (r == null) return h('span.pv-stars.none', icon('star'), L('دون تقييم', 'Not rated'));
  return h('span.pv-stars', { 'aria-label': L(`التقييم ${r} من 5`, `Rated ${r} of 5`) }, h('span.pv-stars-track', { 'aria-hidden': 'true' }, Array.from({ length: 5 }, (_, i) => h(`i${i < Math.round(r) ? '.on' : ''}`, icon('star')))), h('span.num', String(r)), count != null ? h('span.faint.tiny', `(${fmtNum(count)})`) : null);
}
export function docDots(docs) {
  return h('span.pv-docdots', Object.entries(docs).map(([k, s]) => h(`span.pv-dot.${s}`, { 'data-tip': `${L({ licence: 'الرخصة التجارية', vat: 'الشهادة الضريبية', insurance: 'التأمين' }[k], { licence: 'Licence', vat: 'VAT', insurance: 'Insurance' }[k])}: ${L(DOC_STATE[s][0], DOC_STATE[s][1])}` }, icon(DOC_ICON[k]))));
}
export function eligibilityChip(p) {
  return p.eligible ? h('span.chip.tiny.good', icon('circleCheck'), L('مؤهل للطرح', 'Eligible'))
    : h('span.chip.tiny.crit', { 'data-tip': (p.reasons || []).map((r) => L(r.ar, r.en)).join(' · ') }, icon('ban'), L('غير مؤهل', 'Not eligible'));
}

// ---------------- registry ----------------
const filters = { q: '', status: '', category: '' }; // kept across live refreshes
export async function registryTab(ctx, me) {
  const list = await call('/providers');
  const wrap = h('div.pv-registry');
  const manage = me.roles.manage;
  const cnt = (s) => list.filter((p) => p.status === s).length;
  wrap.append(statRow([
    statTile({ label: L('معتمدون', 'Approved'), value: cnt('approved'), icon: 'badgeCheck', tone: 'good' }),
    statTile({ label: L('مؤهلون للطرح', 'Eligible to source'), value: list.filter((p) => p.eligible).length, icon: 'circleCheck' }),
    statTile({ label: L('قيد التأهيل', 'Pending'), value: cnt('pending'), icon: 'hourglass', tone: cnt('pending') ? 'warn' : null }),
    statTile({ label: L('معلّقون أو محظورون', 'Suspended / blacklisted'), value: cnt('suspended') + cnt('blacklisted'), icon: 'ban', tone: cnt('suspended') + cnt('blacklisted') ? 'crit' : null }),
    manage ? statTile({ label: L('وثائق تحتاج انتباهاً', 'Documents needing attention'), value: me.counts.expired + me.counts.expiring + me.counts.renewals, icon: 'fileWarning', tone: me.counts.expired ? 'crit' : me.counts.renewals ? 'warn' : null, href: '#/sys/providers/documents' }) : null,
  ]));
  if (!manage) wrap.append(confidentialBanner(me.roles.full ? 'اطلاع على سجل الموردين للقيام بمهامك في المشتريات؛ تغيير الحالات والوثائق من صلاحية قسم المشتريات. يُسجَّل كل اطلاع على ملف مورد.' : 'تظهر لك فقط الشركات المتعاقدة مع إدارتك. يُسجَّل كل اطلاع على ملف مورد.', me.roles.full ? 'Read access for your procurement role; status and documents are managed by Procurement. Every profile view is logged.' : 'You only see suppliers contracted with your department. Every profile view is logged.'));
  const listBox = h('div');
  const draw = () => {
    const q = filters.q.trim().toLowerCase();
    const rows = list.filter((p) => (!filters.status || p.status === filters.status) && (!filters.category || p.categories.includes(filters.category)) && (!q || `${p.name_ar} ${p.name_en}`.toLowerCase().includes(q)));
    listBox.replaceChildren(rows.length ? h('div.pv-grid', rows.map(providerCard)) : card(null, emptyState({ compact: true, icon: 'search', title: L('لا نتائج مطابقة', 'No matching suppliers'), body: L('غيّر عوامل التصفية.', 'Adjust the filters.') })));
  };
  wrap.append(h('div.pv-toolbar',
    filterBar({
      search: { placeholder: L('ابحث باسم الشركة…', 'Search by company…'), value: filters.q, onInput: (v) => { filters.q = v; draw(); } },
      selects: [
        { label: L('الحالة', 'Status'), value: filters.status, options: [{ value: '', label: L('كل الحالات', 'All statuses') }, ...Object.entries(STATUS).map(([k, v]) => ({ value: k, label: L(v[0], v[1]) }))], onChange: (v) => { filters.status = v; draw(); } },
        { label: L('الفئة', 'Category'), value: filters.category, options: [{ value: '', label: L('كل الفئات', 'All categories') }, ...Object.entries(CATS).map(([k, v]) => ({ value: k, label: L(v[0], v[1]) }))], onChange: (v) => { filters.category = v; draw(); } },
      ],
      extra: manage ? [h('button.btn.primary', { type: 'button', onclick: () => newProvider() }, icon('plus'), L('تسجيل مورد', 'Register supplier'))] : [],
    })));
  if (!list.length) { wrap.append(card(null, emptyState({ icon: 'handshake', title: L('لا يوجد موردون ضمن نطاقك', 'No suppliers in your scope'), body: manage ? L('سجّل أول مورد لبدء التأهيل.', 'Register the first supplier.') : L('تظهر هنا الشركات المتعاقدة مع إدارتك.', 'Suppliers contracted with your department appear here.') }))); return wrap; }
  draw();
  wrap.append(listBox);
  return wrap;
}
function providerCard(p) {
  const [ar, en, ic] = CATS[p.category] || ['', '', 'building'];
  return h('a.card.pv-provider', { href: `#/sys/providers/registry/${p.id}` },
    h('div.pv-provider-top', h('span.pv-logo', { 'aria-hidden': 'true' }, icon(ic)), h('div.grow', h('strong.pv-name', L(p.name_ar, p.name_en)), h('div.tiny.faint', L(ar, en), p.categories.length > 1 ? ` +${p.categories.length - 1}` : '')), statusChip(p.status, STATUS)),
    h('div.pv-provider-mid', eligibilityChip(p), p.pending_renewals ? h('span.chip.tiny.warn', icon('fileUp'), L('تحديث بانتظار التحقق', 'Renewal to verify')) : null, demoChip(p.is_demo)),
    h('div.pv-provider-foot', docDots(p.docs), h('span.grow'), stars(p.rating, p.rating_count)),
    p.reasons.length && p.status === 'approved' ? h('div.pv-reason', icon('circleAlert'), p.reasons.map((r) => L(r.ar, r.en)).join(' · ')) : null);
}
async function newProvider() {
  const v = await formDialog({ title: L('تسجيل مورد جديد', 'Register a supplier'), wide: true, intro: L('يُسجَّل المورد «قيد التأهيل» ولا يُدعى للطرح قبل اعتماده واستكمال وثائقه السارية (الرخصة، الشهادة الضريبية، التأمين).', 'New suppliers start as “pending” and cannot be invited until approved with valid licence, VAT and insurance.'),
    fields: [
      { name: 'name_ar', label: L('اسم الشركة (عربي)', 'Company name (Arabic)'), required: true },
      { name: 'name_en', label: L('اسم الشركة (إنجليزي)', 'Company name (English)') },
      { name: 'category', label: L('الفئة الرئيسية', 'Main category'), type: 'select', required: true, options: Object.entries(CATS).map(([k, c]) => ({ value: k, label: L(c[0], c[1]) })) },
      { name: 'categories', label: L('فئات إضافية', 'Additional categories'), type: 'multiselect', options: Object.entries(CATS).map(([k, c]) => ({ value: k, label: L(c[0], c[1]) })) },
      { name: 'licence_no', label: L('رقم الرخصة التجارية', 'Trade licence no.'), required: true },
      { name: 'licence_expiry', label: L('انتهاء الرخصة', 'Licence expiry'), type: 'date', required: true, min: new Date().toISOString().slice(0, 10) },
      { name: 'contact_name', label: L('مسؤول التواصل', 'Contact person') },
      { name: 'contact_email', label: L('البريد الإلكتروني', 'Email') },
      { name: 'contact_phone', label: L('الهاتف', 'Phone') },
    ], submitLabel: L('تسجيل', 'Register') });
  if (!v) return;
  const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== '' && x != null && !(Array.isArray(x) && !x.length)));
  const r = await call('/providers', { method: 'POST', body }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('سُجّل المورد قيد التأهيل', 'Supplier registered as pending')); location.hash = `#/sys/providers/registry/${r.id}`; }
}

// ---------------- provider profile ----------------
export async function providerProfile(ctx, id) {
  const p = await call(`/providers/${id}`);
  const page = h('div.pv-profile');
  const [, , cic] = CATS[p.category] || [];
  page.append(back('#/sys/providers/registry', L('سجل الموردين', 'Registry')));
  page.append(h('div.pv-hero.card',
    h('span.pv-hero-logo', { 'aria-hidden': 'true' }, icon(cic || 'building')),
    h('div.grow', h('div.pc-eyebrow', statusChip(p.status, STATUS), eligibilityChip(p), demoChip(p.is_demo)), h('h2.pc-title', L(p.name_ar, p.name_en)), h('p.pc-sub', h('span', { dir: 'ltr' }, p.name_en), h('span.faint', '·'), p.categories.map(catName).join('، '), h('span.faint', '·'), L('رخصة', 'Licence'), ' ', h('span.num', p.licence_no || '—'))),
    h('div.pv-hero-side', stars(p.rating, p.rating_count), statusActions(p))));
  if (p.status_reason && p.status !== 'approved') page.append(h(`div.callout.pc-callout.${p.status === 'pending' ? 'warn' : 'crit'}`, icon(p.status === 'pending' ? 'hourglass' : 'ban'), h('div', h('strong', `${L(STATUS[p.status][0], STATUS[p.status][1])}: `), p.status_reason)));
  const main = h('div.pc-main', documentsCard(p), contractsCard(p), evaluationsCard(p));
  const side = h('div.pc-side',
    section(L('الأهلية للطرح', 'Sourcing eligibility'), p.eligible ? h('p.pv-ok', icon('circleCheck'), L('معتمد ووثائقه سارية — يظهر في القائمة المؤهلة لطلبات العروض.', 'Approved with valid documents — appears in RFQ shortlists.')) : h('ul.pv-reasons', p.reasons.map((r) => h('li', icon('ban'), L(r.ar, r.en)))),
      p.warnings.length ? h('ul.pv-reasons.warn', p.warnings.map((w) => h('li', icon('clock'), L(w.ar, w.en)))) : null),
    section(L('التواصل', 'Contact'), kv([[L('المسؤول', 'Contact'), p.contact_name], [L('البريد', 'Email'), p.contact_email ? h('span', { dir: 'ltr' }, p.contact_email) : null], [L('الهاتف', 'Phone'), p.contact_phone ? h('span.num', { dir: 'ltr' }, p.contact_phone) : null]]),
      p.portal_users ? h('div.pv-portal-users', h('span.tiny.faint', L('حسابات بوابة المورد:', 'Portal accounts:')), p.portal_users.length ? p.portal_users.map((u) => h('span.chip.tiny.outline', icon('user'), L(u.name_ar, u.name_en))) : h('span.tiny.faint', L(' لا يوجد', ' none'))) : null,
      p.can.manage ? h('button.btn.sm', { type: 'button', onclick: () => editProvider(p) }, icon('pencil'), L('تعديل البيانات', 'Edit details')) : null),
    section(L('سجل الحالة', 'Status history'), timeline(p.history.map((x) => ({ at: x.at, ar: `${x.label[0]}${x.to_label ? ` → ${x.to_label[0]}` : ''}${x.reason ? ` — ${x.reason}` : ''}`, en: `${x.label[1]}${x.to_label ? ` → ${x.to_label[1]}` : ''}${x.reason ? ` — ${x.reason}` : ''}`, who: x.by, icon: x.action === 'status' ? 'flag' : x.action.includes('document') || x.action === 'verified' || x.action === 'renewal' ? 'fileCheck' : 'circleDot', tone: x.to_status === 'approved' ? 'good' : ['suspended', 'blacklisted'].includes(x.to_status) ? 'crit' : null })))),
    p.access_log ? section(L('سجل الوصول', 'Access log'), h('p.tiny.faint', L('ملف المورد سري: كل اطلاع أو تغيير مسجَّل.', 'Confidential: every view or change is logged.')), accessLogList(p.access_log.slice(0, 10))) : null);
  page.append(grid('main-side', main, side));
  return page;
}
const TRANSITION = {
  approved: [L('اعتماد', 'Approve'), 'badgeCheck', '.primary'], suspended: [L('تعليق', 'Suspend'), 'pause', '.destructive-soft'], blacklisted: [L('حظر', 'Blacklist'), 'ban', '.destructive-soft'],
};
function statusActions(p) {
  if (!p.can.manage || !p.can.transitions.length) return null;
  return h('div.pv-actions', p.can.transitions.map((to) => {
    const [label, ic, cls] = TRANSITION[to];
    const reinstate = to === 'approved' && p.status === 'suspended';
    const b = h(`button.btn.sm${cls}`, { type: 'button' }, icon(reinstate ? 'undo' : ic), reinstate ? L('إعادة التفعيل', 'Reinstate') : label);
    b.addEventListener('click', () => changeStatus(b, p, to));
    return b;
  }));
}
async function changeStatus(btn, p, to) {
  const destructive = to !== 'approved' || p.status !== 'pending';
  const title = { approved: p.status === 'pending' ? L('اعتماد المورد', 'Approve supplier') : L('إعادة تفعيل المورد', 'Reinstate supplier'), suspended: L('تعليق المورد', 'Suspend supplier'), blacklisted: L('حظر المورد', 'Blacklist supplier') }[to];
  const intro = { approved: p.status === 'pending' ? L('يصبح المورد مؤهلاً للطرح متى كانت وثائقه سارية.', 'The supplier becomes eligible once its documents are valid.') : L('يعود المورد للقائمة المؤهلة إن كانت وثائقه سارية. يُسجَّل القرار ويُبلَّغ المورد.', 'The supplier returns to shortlists if documents are valid. Audited and notified.'),
    suspended: L('يُستبعد فوراً من القوائم المؤهلة ولا يستطيع تقديم عروض جديدة. يُسجَّل القرار في سجل التدقيق ويُبلَّغ المورد.', 'Immediately excluded from shortlists and cannot bid. Audited and the supplier is notified.'),
    blacklisted: L('إيقاف دائم للتعامل مع المورد. لا يمكن التراجع عن الحظر من هذه الشاشة. يُسجَّل القرار ويُبلَّغ المورد.', 'Permanent stop. Cannot be undone here. Audited and notified.') }[to];
  const v = await formDialog({ title, intro, danger: destructive && to !== 'approved', fields: [{ name: 'reason', label: L('السبب (يُسجَّل)', 'Reason (recorded)'), type: 'textarea', required: true, rows: 3, maxLength: 500 }], submitLabel: title });
  if (!v) return;
  if (await act(btn, () => call(`/providers/${p.id}/status`, { method: 'POST', body: { to, reason: v.reason, confirm: destructive ? true : undefined } }), { success: L('حُدّثت حالة المورد', 'Status updated') })) refresh();
}
async function editProvider(p) {
  const v = await formDialog({ title: L('تعديل بيانات المورد', 'Edit supplier'), wide: true, fields: [
    { name: 'name_ar', label: L('الاسم (عربي)', 'Name (Arabic)'), required: true }, { name: 'name_en', label: L('الاسم (إنجليزي)', 'Name (English)') },
    { name: 'category', label: L('الفئة الرئيسية', 'Main category'), type: 'select', required: true, options: Object.entries(CATS).map(([k, c]) => ({ value: k, label: L(c[0], c[1]) })) },
    { name: 'categories', label: L('كل الفئات', 'All categories'), type: 'multiselect', options: Object.entries(CATS).map(([k, c]) => ({ value: k, label: L(c[0], c[1]) })) },
    { name: 'contact_name', label: L('مسؤول التواصل', 'Contact') }, { name: 'contact_email', label: L('البريد', 'Email') }, { name: 'contact_phone', label: L('الهاتف', 'Phone') },
  ], values: p, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  const r = await call(`/providers/${p.id}`, { method: 'PUT', body: v }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('حُفظت البيانات', 'Saved')); refresh(); }
}
function documentsCard(p) {
  return section(L('الوثائق النظامية', 'Statutory documents'),
    h('div.pv-docs', p.documents.map((d) => h(`div.pv-doc.${d.state}`,
      h('span.pv-doc-ic', icon(DOC_ICON[d.kind])),
      h('div.grow', h('strong', L(d.name_ar, d.name_en)), h('div.tiny.faint', d.ref_no ? h('span.num', d.ref_no) : L('لا مرجع', 'No reference')),
        h('div.pv-doc-exp', statusChip(d.state, DOC_STATE), d.expires_on ? h('span.tiny', L('تنتهي', 'Expires'), ' ', h('span.num', fmtDate(d.expires_on)), d.days_left != null ? h('span.faint', ` · ${d.days_left >= 0 ? L(`${fmtNum(d.days_left)} يوماً متبقية`, `${d.days_left} days left`) : L(`منذ ${fmtNum(-d.days_left)} يوماً`, `${-d.days_left} days ago`)}`) : null) : null),
        d.pending ? h('div.pv-renewal', icon('fileUp'), h('span.grow', L('تحديث مقدَّم من المورد: ', 'Renewal from supplier: '), h('span.num', d.pending.ref_no || '—'), ' · ', L('حتى', 'until'), ' ', h('span.num', fmtDate(d.pending.expires_on))),
          p.can.manage ? [btnVerify(p, d, 'accept'), btnVerify(p, d, 'reject')] : null) : null),
      p.can.manage ? h('button.icon-btn', { type: 'button', 'aria-label': L(`تحديث ${d.name_ar}`, `Update ${d.name_en}`), onclick: () => editDoc(p, d) }, icon('pencil')) : null))),
    h('p.tiny.faint', L('بيانات وصفية فقط (المرجع والتواريخ). الوثيقة المنتهية تجعل المورد غير مؤهل للطرح تلقائياً.', 'Metadata only (reference and dates). An expired document makes the supplier ineligible automatically.')));
}
function btnVerify(p, d, decision) {
  const b = h(`button.btn.sm${decision === 'accept' ? '.primary' : '.ghost'}`, { type: 'button' }, icon(decision === 'accept' ? 'check' : 'x'), decision === 'accept' ? L('اعتماد التحديث', 'Accept') : L('رفض', 'Reject'));
  b.addEventListener('click', async () => {
    let note = '';
    if (decision === 'reject') { const v = await formDialog({ title: L('رفض تحديث الوثيقة', 'Reject renewal'), fields: [{ name: 'note', label: L('السبب', 'Reason'), type: 'textarea', required: true, rows: 2 }], submitLabel: L('رفض', 'Reject'), danger: true }); if (!v) return; note = v.note; }
    else if (!(await confirmDialog(L('اعتماد تحديث الوثيقة', 'Accept renewal'), L('تحققتَ من الوثيقة الأصلية؟ تُعتمد البيانات الجديدة فوراً.', 'Verified against the original? The new data applies immediately.'), { confirmLabel: L('اعتماد', 'Accept') }))) return;
    if (await act(b, () => call(`/providers/${p.id}/documents/${d.kind}/verify`, { method: 'POST', body: { decision, note } }), { success: decision === 'accept' ? L('اعتُمد التحديث', 'Renewal accepted') : L('رُفض التحديث', 'Renewal rejected') })) refresh();
  });
  return b;
}
async function editDoc(p, d) {
  const v = await formDialog({ title: L(`تحديث ${d.name_ar}`, `Update ${d.name_en}`), fields: [
    { name: 'ref_no', label: L('رقم المرجع', 'Reference no.') }, { name: 'issued_on', label: L('تاريخ الإصدار', 'Issued on'), type: 'date' }, { name: 'expires_on', label: L('تاريخ الانتهاء', 'Expires on'), type: 'date', required: true },
  ], values: d, submitLabel: L('حفظ', 'Save') });
  if (!v) return;
  const body = Object.fromEntries(Object.entries(v).filter(([, x]) => x));
  const r = await call(`/providers/${p.id}/documents/${d.kind}`, { method: 'PUT', body }).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
  if (r) { toast(L('حُدّثت الوثيقة', 'Document updated')); refresh(); }
}
function contractsCard(p) {
  return section(L('العقود', 'Contracts'), p.contracts.length ? contractsTable(p.contracts, { provider: false }) : emptyState({ compact: true, icon: 'handshake', title: L('لا عقود ضمن نطاقك', 'No contracts in your scope') }));
}
function evaluationsCard(p) {
  const r = p.rating_detail;
  return section(L('تقييم الأداء', 'Performance'),
    r.count ? h('div.pv-scores', [[L('الجودة', 'Quality'), r.quality], [L('الالتزام بالمواعيد', 'Timeliness'), r.timeliness], [L('الامتثال', 'Compliance'), r.compliance]].map(([k, v]) => h('div.pv-score', h('span', k), h('div.pv-bar', h('i', { style: { width: `${(v / 5) * 100}%` } })), h('strong.num', String(v))))) : null,
    p.evaluations.length ? h('ul.list.pv-evals', p.evaluations.map((e) => h('li', h('div.grow', h('div', h('strong.num', e.contract_number), h('span.faint', ` · ${e.period}`), ' ', demoChip(e.is_demo)), e.comment ? h('p.pc-prose', e.comment) : null, h('div.tiny.faint', L(e.evaluator?.name_ar, e.evaluator?.name_en))), stars(e.score)))) : emptyState({ compact: true, icon: 'star', title: L('لا تقييمات بعد', 'No evaluations yet'), body: L('يقيّم مالك العقد أداء المورد كل ربع.', 'Contract owners review suppliers each quarter.') }));
}

// ---------------- contracts ----------------
export function contractsTable(rows, { provider = true } = {}) {
  return dataTable({ rows, onRow: (c) => { location.hash = `#/sys/providers/contracts/${c.id}`; }, caption: L('العقود', 'Contracts'), columns: [
    { key: 'number', label: L('العقد', 'Contract'), sort: (c) => c.number, render: (c) => h('div.pc-cell-stack', h('strong.num', c.number), c.po_number ? h('span.tiny.faint.num', c.po_number) : null) },
    provider ? { key: 'provider', label: L('المورد', 'Supplier'), render: (c) => L(c.provider?.name_ar, c.provider?.name_en) } : null,
    { key: 'title', label: L('الموضوع', 'Subject') },
    { key: 'dept', label: L('الإدارة / المالك', 'Department / owner'), render: (c) => h('div.pc-cell-stack', h('span', L(c.dept_ar, c.dept_en)), h('span.tiny.faint', L(c.owner?.name_ar, c.owner?.name_en))) },
    { key: 'value', label: L('القيمة', 'Value'), num: true, sort: (c) => c.value, render: (c) => aed(c.value) },
    { key: 'period', label: L('المدة', 'Term'), render: (c) => h('span.num.tiny', `${fmtDate(c.start_date)} – ${fmtDate(c.end_date)}`) },
    { key: 'eval', label: L(`تقييم ${rows[0]?.period || ''}`, `Review ${rows[0]?.period || ''}`), render: (c) => (c.evaluated_this_period ? h('span.chip.tiny.good', icon('check'), L('قُيّم', 'Done')) : c.can_evaluate ? h('span.chip.tiny.purple', icon('star'), L('بانتظار تقييمك', 'Your review')) : h('span.chip.tiny.outline', L('لم يُقيَّم', 'Pending'))) },
  ].filter(Boolean) });
}
export async function contractsTab(ctx, me) {
  const list = await call('/contracts');
  const mine = list.filter((c) => c.can_evaluate && !c.evaluated_this_period);
  const wrap = h('div.pv-contracts');
  wrap.append(statRow([
    statTile({ label: L('عقود ضمن نطاقك', 'Contracts in scope'), value: list.length, icon: 'handshake' }),
    statTile({ label: L('بانتظار تقييمك', 'Awaiting your review'), value: mine.length, icon: 'star', tone: mine.length ? 'emph' : 'good' }),
    statTile({ label: L('القيمة الإجمالية', 'Total value'), value: money(list.reduce((a, c) => a + c.value, 0)), icon: 'banknote' }),
  ]));
  if (mine.length) wrap.append(h('div.pc-next-banner', h('span.pc-next-ic', icon('star')), h('div.grow', h('span.pc-next-eyebrow', L('الإجراء التالي', 'Next step')), h('h3', L(`قيّم أداء «${mine[0].provider?.name_ar}» في العقد ${mine[0].number}`, `Review ${mine[0].provider?.name_en} on ${mine[0].number}`)), h('p', L('الجودة والالتزام بالمواعيد والامتثال (1–5). يسهم التقييم في تأهيل الموردين للطرح القادم.', 'Quality, timeliness and compliance (1–5). Reviews inform future sourcing.'))),
    h('div.pc-next-actions', (() => { const b = h('button.btn.primary', { type: 'button' }, icon('star'), L('قيّم الآن', 'Review now')); b.addEventListener('click', () => evaluate(b, mine[0])); return b; })())));
  wrap.append(list.length ? card(null, contractsTable(list)) : card(null, emptyState({ icon: 'handshake', title: L('لا توجد عقود ضمن نطاقك', 'No contracts in your scope'), body: L('تُنشأ العقود تلقائياً عند إصدار أوامر الشراء.', 'Contracts are created automatically when purchase orders are issued.') })));
  return wrap;
}
export async function contractDetail(ctx, id) {
  const c = await call(`/contracts/${id}`);
  const page = h('div.pv-contract');
  page.append(back('#/sys/providers/contracts', L('العقود', 'Contracts')));
  page.append(h('div.pc-detail-head', h('div.grow', h('div.pc-eyebrow', h('span.num', c.number), demoChip(c.is_demo)), h('h2.pc-title', c.title), h('p.pc-sub', L(c.provider?.name_ar, c.provider?.name_en), h('span.faint', '·'), L(c.dept_ar, c.dept_en))),
    h('div.pc-amount', h('span.pc-amount-label', L('قيمة العقد', 'Contract value')), h('span.pc-amount-value.num.tabular', money(c.value)))));
  const canEval = c.can_evaluate && !c.evaluated_this_period;
  if (canEval) page.append(h('div.pc-next-banner', h('span.pc-next-ic', icon('star')), h('div.grow', h('span.pc-next-eyebrow', L('الإجراء التالي', 'Next step')), h('h3', L(`قيّم أداء المورد للربع ${c.period}`, `Review the supplier for ${c.period}`)), h('p', L('بصفتك مالك العقد. تقييم واحد لكل ربع.', 'As contract owner. One review per quarter.'))),
    h('div.pc-next-actions', (() => { const b = h('button.btn.primary', { type: 'button' }, icon('star'), L('قيّم الآن', 'Review now')); b.addEventListener('click', () => evaluate(b, c)); return b; })())));
  page.append(grid('main-side',
    h('div.pc-main', section(L('التقييمات', 'Reviews'), c.evaluations.length ? h('ul.list.pv-evals', c.evaluations.map((e) => h('li', h('div.grow', h('div', h('strong', e.period), h('span.faint', ' · '), L(e.evaluator?.name_ar, e.evaluator?.name_en)),
      h('div.pv-crit', h('span', L('الجودة', 'Quality'), ' ', h('b.num', e.quality)), h('span', L('المواعيد', 'Timeliness'), ' ', h('b.num', e.timeliness)), h('span', L('الامتثال', 'Compliance'), ' ', h('b.num', e.compliance))), e.comment ? h('p.pc-prose', e.comment) : null), stars(e.score)))) : emptyState({ compact: true, icon: 'star', title: L('لا تقييمات بعد', 'No reviews yet') }))),
    h('div.pc-side', section(L('بيانات العقد', 'Contract'), kv([[L('المورد', 'Supplier'), L(c.provider?.name_ar, c.provider?.name_en)], [L('أمر الشراء', 'PO'), c.po_number ? h('span.num', c.po_number) : '—'], [L('المصدر', 'Source'), c.source_ref ? h('span.num', c.source_ref) : '—'], [L('المالك', 'Owner'), whoChip(c.owner)], [L('البداية', 'Start'), h('span.num', fmtDate(c.start_date))], [L('النهاية', 'End'), h('span.num', fmtDate(c.end_date))]])))));
  return page;
}
async function evaluate(btn, c) {
  const v = await formDialog({ title: L(`تقييم أداء ${c.provider?.name_ar || 'المورد'}`, `Review ${c.provider?.name_en || 'supplier'}`), intro: L(`العقد ${c.number} — الربع ${c.period}. التقييم من 1 (ضعيف) إلى 5 (ممتاز)، ويطّلع المورد على الدرجات دون اسم المقيّم.`, `${c.number} — ${c.period}. 1 (poor) to 5 (excellent); the supplier sees the scores without the reviewer’s name.`),
    fields: [
      { name: 'quality', label: L('جودة التوريد أو الخدمة', 'Quality'), type: 'rating', required: true, labels: [L('ضعيف', 'Poor'), L('مقبول', 'Fair'), L('جيد', 'Good'), L('جيد جداً', 'Very good'), L('ممتاز', 'Excellent')] },
      { name: 'timeliness', label: L('الالتزام بالمواعيد', 'Timeliness'), type: 'rating', required: true, labels: [L('ضعيف', 'Poor'), L('مقبول', 'Fair'), L('جيد', 'Good'), L('جيد جداً', 'Very good'), L('ممتاز', 'Excellent')] },
      { name: 'compliance', label: L('الامتثال لشروط العقد', 'Compliance'), type: 'rating', required: true, labels: [L('ضعيف', 'Poor'), L('مقبول', 'Fair'), L('جيد', 'Good'), L('جيد جداً', 'Very good'), L('ممتاز', 'Excellent')] },
      { name: 'comment', label: L('ملاحظات موضوعية', 'Objective notes'), type: 'textarea', rows: 3, maxLength: 1000 },
    ], submitLabel: L('حفظ التقييم', 'Save review') });
  if (!v) return;
  if (await act(btn, () => call(`/contracts/${c.id}/evaluations`, { method: 'POST', body: { quality: v.quality, timeliness: v.timeliness, compliance: v.compliance, comment: v.comment || undefined } }), { success: L('سُجّل التقييم — شكراً لإسهامك في جودة التوريد', 'Review saved — thank you') })) refresh();
}

// ---------------- documents needing attention (providers.manage) ----------------
export async function documentsTab() {
  const rows = await call('/documents');
  const wrap = h('div.pv-docs-tab');
  const groups = [
    [L('تحديثات بانتظار التحقق', 'Renewals to verify'), rows.filter((d) => d.pending), 'fileUp', 'warn'],
    [L('وثائق منتهية', 'Expired documents'), rows.filter((d) => !d.pending && (d.state === 'expired' || d.state === 'missing')), 'circleAlert', 'crit'],
    [L('تنتهي خلال 30 يوماً', 'Expiring within 30 days'), rows.filter((d) => !d.pending && d.state === 'expiring'), 'clock', 'emph'],
  ];
  wrap.append(statRow(groups.map(([label, list, ic, tone]) => statTile({ label, value: list.length, icon: ic, tone: list.length ? tone : 'good' }))));
  if (!rows.length) { wrap.append(card(null, emptyState({ icon: 'fileCheck', title: L('كل الوثائق سارية', 'All documents valid'), body: L('لا وثائق منتهية أو قريبة الانتهاء، ولا تحديثات بانتظار التحقق.', 'Nothing expired, expiring or awaiting verification.') }))); return wrap; }
  for (const [label, list, ic] of groups) {
    if (!list.length) continue;
    wrap.append(h('h2.section', icon(ic), label, h('span.count', fmtNum(list.length))), card(null, h('ul.list.separated.pv-attn', list.map((d) => h('li.clickable', { tabindex: 0, onclick: () => { location.hash = `#/sys/providers/registry/${d.provider_id}`; }, onkeydown: (e) => { if (e.key === 'Enter') location.hash = `#/sys/providers/registry/${d.provider_id}`; } },
      h('span.pv-doc-ic.sm', icon(DOC_ICON[d.kind])), h('div.grow', h('div.title', `${L(d.provider_ar, d.provider_en)} — ${L(d.name_ar, d.name_en)}`), h('div.meta', d.pending ? L(`مقدَّم: ${d.pending.ref_no || '—'} حتى ${d.pending.expires_on}`, `Submitted: ${d.pending.ref_no || '—'} until ${d.pending.expires_on}`) : d.expires_on ? L(`تنتهي ${d.expires_on}`, `Expires ${d.expires_on}`) : L('غير مسجّلة', 'Missing'))),
      statusChip(d.pending ? 'expiring' : d.state, d.pending ? { expiring: ['بانتظار التحقق', 'To verify', 'warn', 'fileUp'] } : DOC_STATE), statusChip(d.provider_status, STATUS), icon('chevron', 'flip-rtl'))))));
  }
  return wrap;
}
