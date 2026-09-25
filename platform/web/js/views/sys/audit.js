// Internal Audit — التدقيق الداخلي. Role-aware entry: the same system looks
// different for Internal Audit, the audit committee, auditee managers, action
// owners and the external auditor. Tabs are hash sub-routes (#/sys/audit/<tab>);
// record pages: #/sys/audit/e/<id>[/<section>], /f/<id>, /x/<id>.
import { sysHeader, sysTabs, currentTab } from '../../sys-kit.js';
import { call, mount } from './audit/common.js';

const VIEWS = {
  board: () => import('./audit/board.js'),
  plan: () => import('./audit/plan.js'),
  findings: () => import('./audit/findings.js'),
  mine: () => import('./audit/findings.js'),
  actions: () => import('./audit/findings.js'),
  reports: () => import('./audit/committee.js'),
  committee: () => import('./audit/committee.js'),
  requests: () => import('./audit/requests.js'),
  external: () => import('./audit/external.js'),
  portal: () => import('./audit/external.js'),
};

export function tabsFor(me, user) {
  const r = me.roles; const c = me.counts;
  if (r.external) return [{ key: 'portal', ar: 'طلباتي', en: 'My requests', icon: 'inbox', count: c.ext_mine_open }];
  const tabs = [];
  if (r.ia) {
    tabs.push({ key: 'board', ar: 'المهام', en: 'Engagements', icon: 'kanban', count: c.engagements_open },
      { key: 'plan', ar: 'الخطة', en: 'Plan', icon: 'radar' },
      { key: 'findings', ar: 'الملاحظات', en: 'Findings', icon: 'fileWarning', count: r.head ? c.closures_pending + c.drafts : c.drafts },
      { key: 'requests', ar: 'طلبات المعلومات', en: 'Information requests', icon: 'mailCheck', count: c.requests_to_review },
      { key: 'external', ar: 'المدقق الخارجي', en: 'External auditor', icon: 'globe', count: c.ext_pending },
      { key: 'committee', ar: 'المؤشرات', en: 'Insights', icon: 'dashboard' });
    return tabs;
  }
  if (r.committee) tabs.push({ key: 'committee', ar: 'لوحة اللجنة', en: 'Committee', icon: 'dashboard' }, { key: 'plan', ar: 'الخطة', en: 'Plan', icon: 'radar' }, { key: 'reports', ar: 'التقارير الصادرة', en: 'Issued reports', icon: 'fileCheck' });
  const manager = user.role === 'manager';
  if (r.auditee || manager) tabs.push({ key: 'mine', ar: 'ملاحظات إدارتي', en: 'My department', icon: 'fileWarning', count: c.awaiting_response }, { key: 'requests', ar: 'طلبات المعلومات', en: 'Information requests', icon: 'mailCheck', count: (c.my_requests_open || 0) + (c.my_ext_open || 0) });
  if (r.owner && !r.auditee) tabs.push({ key: 'actions', ar: 'خطط المعالجة', en: 'My action plans', icon: 'listChecks', count: c.my_actions_open });
  if (!tabs.length) tabs.push({ key: 'actions', ar: 'خطط المعالجة', en: 'My action plans', icon: 'listChecks' });
  return tabs;
}
export function landingFor(me, tabs) {
  const r = me.roles; const c = me.counts;
  if (r.external) return 'portal';
  if (r.ia) return 'board';
  if (r.committee) return 'committee';
  if (tabs.some((t) => t.key === 'mine')) return !c.awaiting_response && (c.my_requests_open || c.my_ext_open) ? 'requests' : 'mine';
  return 'actions';
}

export async function render(root, ctx) {
  const [p0] = ctx.params;
  if (p0 === 'e') return (await import('./audit/engagement.js')).render(root, ctx);
  if (p0 === 'f') return (await import('./audit/finding.js')).render(root, ctx);
  if (p0 === 'x') return (await import('./audit/external.js')).renderDetail(root, ctx);
  let mod = null;
  await mount(root, ctx, async () => {
    const me = await call('/me');
    const tabs = tabsFor(me, ctx.user);
    const tab = currentTab(ctx, tabs, landingFor(me, tabs));
    mod = await VIEWS[tab]();
    const data = await mod.load(tab, me, ctx);
    return { me, tabs, tab, data };
  }, ({ me, tabs, tab, data }) => {
    const head = mod.header(tab, me, ctx, data);
    const top = sysHeader(ctx, head);
    if (me.roles.external) top.querySelector('.ai-chip')?.remove(); // external identities never get Ask AI
    return [top, tabs.length > 1 ? sysTabs(ctx, tabs, tab) : null, mod.paint(tab, me, ctx, data)];
  }, { skel: p0 === 'board' || !p0 ? 'board' : 'card' });
}
