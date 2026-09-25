// Service Providers — منصة مقدمي الخدمات.
// Internal: registry (Procurement manages; procurement roles read; other managers
// see only suppliers contracted with their departments), provider profile,
// contracts with owner reviews, documents to verify.
// External (supplier accounts): landing = open invitations with deadlines, then
// company profile & documents, and contracts / POs with the evaluation summary.
import { h, L, sysHeader, sysTabs, currentTab, errorState, skeleton, card } from '../../sys-kit.js';
import { call, registryTab, providerProfile, contractsTab, contractDetail, documentsTab } from './providers/internal.js';
import { companyTab, vendorContractsTab } from './providers/vendor.js';
import { invitationsView, invitationDetail } from './procurement/portal.js';
import { vendorHeader } from './procurement/common.js';
import { ensureCss } from '../../systems.js';

export async function render(root, ctx) {
  let me;
  try { me = await call('/me'); } catch (e) { root.append(sysHeader(ctx), card(null, errorState(e, () => location.reload()))); return; }
  const external = me.external;
  let tabs; let landing; let views; let header;
  ensureCss('/css/pages/sys-procurement.css'); // shared layout patterns and the bidding portal
  if (external) {
    tabs = [
      { key: 'invitations', ar: 'الدعوات المفتوحة', en: 'Open invitations', icon: 'inbox' },
      { key: 'company', ar: 'ملف شركتي', en: 'My company', icon: 'building' },
      { key: 'contracts', ar: 'عقودي وأوامر الشراء', en: 'Contracts & POs', icon: 'handshake' },
    ];
    landing = 'invitations';
    views = { invitations: (c, id) => (id ? invitationDetail(c, id, { base: '#/sys/providers/invitations' }) : invitationsView(c, { base: '#/sys/providers/invitations' })), company: () => companyTab(), contracts: () => vendorContractsTab() };
    header = { eyebrow: me.provider ? L(me.provider.name_ar, me.provider.name_en) : L('بوابة المورد', 'Supplier portal'), title: L('بوابة المورد', 'Supplier portal'), sub: L('دعواتكم ومواعيد إغلاقها، ووثائق شركتكم، وعقودكم وتقييم أدائكم. لا يطّلع أي مورد على بيانات غيره.', 'Your invitations, company documents, contracts and performance. No supplier ever sees another supplier’s data.') };
  } else {
    const r = me.roles;
    tabs = [
      { key: 'registry', ar: 'سجل الموردين', en: 'Registry', icon: 'handshake', count: r.manage ? me.counts.pending : null },
      { key: 'contracts', ar: 'العقود', en: 'Contracts', icon: 'fileSign', count: me.counts.to_evaluate },
      r.manage ? { key: 'documents', ar: 'الوثائق', en: 'Documents', icon: 'fileWarning', count: me.counts.renewals + me.counts.expired } : null,
    ].filter(Boolean);
    landing = r.manage || r.full ? 'registry' : 'contracts';
    views = { registry: (c, id) => (id ? providerProfile(c, id) : registryTab(c, me)), contracts: (c, id) => (id ? contractDetail(c, id) : contractsTab(c, me)), documents: () => documentsTab() };
    header = { sub: r.manage ? L('تأهيل الموردين ووثائقهم وحالاتهم، وعقودهم وتقييم أدائهم.', 'Supplier qualification, documents, status, contracts and performance.') : L('الموردون والعقود ضمن نطاقك، وتقييم أداء العقود التي تملكها.', 'Suppliers and contracts in your scope, and reviews of contracts you own.') };
  }
  if (!external && !me.roles.manage && !me.roles.full) tabs = tabs.filter((t) => t.key !== 'registry' || me.counts.providers);
  const tab = currentTab(ctx, tabs, landing);
  const id = tabs.find((t) => t.key === ctx.params[0]) ? ctx.params[1] : null;
  const head = sysHeader(ctx, header);
  root.append(external ? vendorHeader(head) : head, sysTabs(ctx, tabs, tab));
  const body = h('div.pv-body'); root.append(body);
  if (external && !me.provider) { body.append(card(null, errorState({ message: L('حسابكم غير مرتبط بمورد مسجّل — تواصلوا مع قسم المشتريات.', 'Your account is not linked to a registered supplier.') }))); return; }
  const load = async () => {
    try { body.replaceChildren(await views[tab](ctx, id)); }
    catch (e) { body.replaceChildren(card(null, errorState(e.status === 404 ? { message: L('العنصر غير موجود أو غير متاح لك.', 'Not found or not available to you.') } : e, () => { body.replaceChildren(skeleton('card', 3)); load(); }))); }
  };
  if (ctx.soft) await load(); else { body.append(skeleton('card', 3)); load(); }
}
