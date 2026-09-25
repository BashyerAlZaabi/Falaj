// AI Procurement — المشتريات الذكية.
// Role-aware landing: employees → «طلباتي»; line managers, Finance, Legal and
// committee members → «الاعتمادات»; the procurement officer → «طلبات العروض»;
// budget holders → «الميزانية»; service providers → their invitations portal.
// Routes: #/sys/procurement/<tab>[/<id>[/edit]] (hash sub-routes survive live refresh).
import { h, L, sysHeader, sysTabs, currentTab, errorState, skeleton, card } from '../../sys-kit.js';
import { call, vendorHeader } from './procurement/common.js';
import { mineTab, prDetail, prEditor, approvalsTab } from './procurement/requests.js';
import { rfqsTab, rfqDetail } from './procurement/rfq.js';
import { budgetTab } from './procurement/budget.js';
import { invitationsView, invitationDetail, bidsView } from './procurement/portal.js';

export async function render(root, ctx) {
  let me;
  try { me = await call('/me'); } catch (e) { root.append(sysHeader(ctx), card(null, errorState(e, () => location.reload()))); return; }
  ctx.me = me;
  if (me.external) return renderVendor(root, ctx, me);
  const r = me.roles;
  const tabs = [
    { key: 'mine', ar: 'طلباتي', en: 'My requests', icon: 'cart', count: me.counts.mine_active },
    r.manager || r.finance || r.officer || r.legal || r.committee || me.counts.approvals ? { key: 'approvals', ar: 'الاعتمادات', en: 'Approvals', icon: 'userCheck', count: me.counts.approvals } : null,
    r.officer || r.committee || r.legal ? { key: 'rfqs', ar: 'طلبات العروض', en: 'RFQs', icon: 'scale', count: me.counts.rfqs } : null,
    r.budget || r.finance || r.manager ? { key: 'budget', ar: 'الميزانية', en: 'Budget', icon: 'wallet' } : null,
  ].filter(Boolean);
  const landing = r.officer ? 'rfqs' : me.counts.approvals || r.finance || r.legal ? 'approvals' : r.budget && !me.counts.mine_total ? 'budget' : r.manager && me.counts.approvals ? 'approvals' : 'mine';
  const tab = currentTab(ctx, tabs, landing);
  const id = tabs.find((t) => t.key === ctx.params[0]) ? ctx.params[1] : null;
  const sub = {
    mine: L('أنشئ طلب شراء وتابع مراحله حتى أمر الشراء.', 'Raise a purchase request and follow it to the purchase order.'),
    approvals: L('ما ينتظر قرارك: المدير المباشر، المالية، المشتريات، اللجنة والشؤون القانونية.', 'What needs your decision: line manager, Finance, Procurement, committee and Legal.'),
    rfqs: L('طلبات العروض: نطاق عمل بالذكاء الاصطناعي، عروض مختومة، فتح بمفتاحين، وتقييم بمساندة ذكية.', 'RFQs: AI-drafted scope, sealed bids, two-key opening and AI-assisted evaluation.'),
    budget: L('بنود ميزانية المشتريات: الاعتماد والملتزم به والمصروف.', 'Procurement budget lines: allocated, committed and spent.'),
  }[tab];
  root.append(sysHeader(ctx, { sub, actions: [{ label: L('طلب شراء جديد', 'New purchase request'), icon: 'plus', primary: tab === 'mine' && !id, href: '#/sys/procurement/mine/new' }] }), sysTabs(ctx, tabs, tab));
  const body = h('div.pc-body');
  root.append(body);
  const load = async () => {
    try {
      let view;
      if (tab === 'mine' && id === 'new') view = await prEditor(ctx, null);
      else if (tab === 'mine' && id && ctx.params[2] === 'edit') view = await prEditor(ctx, id);
      else if ((tab === 'mine' || tab === 'approvals') && id) view = await prDetail(ctx, id, tab);
      else if (tab === 'rfqs' && id) view = await rfqDetail(ctx, id);
      else view = await ({ mine: mineTab, approvals: approvalsTab, rfqs: rfqsTab, budget: budgetTab })[tab](ctx, me);
      body.replaceChildren(view);
    } catch (e) {
      body.replaceChildren(card(null, errorState(e.status === 404 ? { message: L('العنصر غير موجود أو غير متاح لك.', 'Not found or not available to you.') } : e, () => { body.replaceChildren(skeleton('card', 3)); load(); })));
    }
  };
  // Live refreshes keep the screen until fresh data arrives; a normal visit shows a skeleton first.
  if (ctx.soft) await load(); else { body.append(skeleton('card', 3)); load(); }
}

async function renderVendor(root, ctx, me) {
  const tabs = [
    { key: 'invitations', ar: 'الدعوات', en: 'Invitations', icon: 'inbox', count: me.counts.open },
    { key: 'bids', ar: 'عروضي', en: 'My bids', icon: 'fileText' },
  ];
  const tab = currentTab(ctx, tabs, 'invitations');
  const id = ctx.params[0] === 'invitations' ? ctx.params[1] : null;
  root.append(vendorHeader(sysHeader(ctx, {
    eyebrow: me.provider ? L(me.provider.name_ar, me.provider.name_en) : L('بوابة الموردين', 'Supplier portal'),
    title: L('بوابة العروض', 'Bidding portal'),
    sub: L('دعواتكم لتقديم العروض ومواعيد إغلاقها. عروضكم مختومة ولا يطّلع عليها أحد قبل موعد الإغلاق.', 'Your invitations to bid and their deadlines. Your bids are sealed until closing.'),
    actions: [{ label: L('ملف شركتي', 'My company'), icon: 'building', href: '#/sys/providers/company' }],
  })), sysTabs(ctx, tabs, tab));
  const body = h('div.pc-body'); root.append(body);
  if (!me.provider) { body.append(card(null, errorState({ message: L('حسابك غير مرتبط بمورد مسجّل — تواصل مع قسم المشتريات.', 'Your account is not linked to a registered supplier.') }))); return; }
  const base = '#/sys/procurement/invitations';
  const load = async () => {
    try { body.replaceChildren(id ? await invitationDetail(ctx, id, { base }) : tab === 'bids' ? await bidsView(ctx, { base }) : await invitationsView(ctx, { base })); }
    catch (e) { body.replaceChildren(card(null, errorState(e.status === 404 ? { message: L('الدعوة غير موجودة أو غير متاحة لكم.', 'Invitation not found.') } : e, () => { body.replaceChildren(skeleton('card', 3)); load(); }))); }
  };
  if (ctx.soft) await load(); else { body.append(skeleton('card', 3)); load(); }
}
