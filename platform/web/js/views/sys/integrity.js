// Conflicts & Gifts — الإفصاح عن تضارب المصالح واستقبال الهدايا.
// Role-aware landing: discloser → «إفصاحاتي», compliance officer → «المراجعة»,
// line manager with instructions to acknowledge → «التعليمات», president → «التقارير».
// Tabs are hash sub-routes (#/sys/integrity/<tab>/<record|declare|new>) so a live
// refresh keeps the open record / wizard; the server decides every scope.
import { h, L, sysHeader, sysTabs, currentTab, skeleton, errorState } from '../../sys-kit.js';
import { call, demoChip } from './integrity/common.js';
import { mineTab } from './integrity/mine.js';
import { giftsTab } from './integrity/gifts.js';
import { reviewTab } from './integrity/review.js';
import { instructionsTab } from './integrity/instructions.js';
import { reportsTab } from './integrity/reports.js';

const TAB = { mine: mineTab, gifts: giftsTab, review: reviewTab, instructions: instructionsTab, reports: reportsTab };
const tabsFor = (roles) => [
  { key: 'mine', ar: 'إفصاحاتي', en: 'My disclosures', icon: 'fileSign' },
  { key: 'gifts', ar: 'سجل الهدايا', en: 'Gift register', icon: 'gift' },
  roles.officer ? { key: 'review', ar: 'المراجعة', en: 'Review', icon: 'scanSearch', count: roles.counts.review } : null,
  roles.line_manager ? { key: 'instructions', ar: 'التعليمات', en: 'Instructions', icon: 'userCheck', count: roles.counts.instructions } : null,
  roles.reports ? { key: 'reports', ar: 'التقارير', en: 'Reports', icon: 'chartBar' } : null,
].filter(Boolean);
const SUB = {
  mine: ['الإفصاح يحميك ويحمي قرارات الجهة. بياناتك سرية للغاية: لا يطّلع عليها إلا ضابط الامتثال، وكل اطلاع مسجّل.', 'Disclosure protects you and the entity’s decisions. Restricted: only the compliance officer can see it, and every view is logged.'],
  gifts: ['أفصح عن الهدايا والضيافة خلال 5 أيام؛ يقترح النظام القرار وفق السياسة ويعتمده ضابط الامتثال.', 'Declare gifts and hospitality within 5 days; the system proposes a decision and the compliance officer confirms it.'],
  review: ['قائمة المراجعة لضابط الامتثال — كل اطلاع على إفصاح يُسجَّل ويظهر لصاحبه.', 'The compliance officer’s queue — every view of a disclosure is logged and shown to the discloser.'],
  instructions: ['تعليمات الامتثال التي يلزمك تطبيقها لفريقك — دون أي تفاصيل عن الإفصاحات.', 'Compliance instructions to apply for your team — without any disclosure details.'],
  reports: ['مؤشرات امتثال مجمّعة — دون بيانات فردية.', 'Aggregated compliance — no individual data.'],
};

export async function render(root, ctx) {
  const page = h('div.integ');
  root.append(page);
  const paint = async () => {
    try {
      const ov = await call('/overview');
      const tabs = tabsFor(ov.roles);
      const tab = currentTab(ctx, tabs, ov.roles.landing);
      const env = { ctx, ov, roles: ov.roles, params: tab === ctx.params[0] ? ctx.params.slice(1) : [], refresh: () => paint() };
      const { actions, body } = await TAB[tab](env);
      page.replaceChildren(sysHeader(ctx, { sub: L(...SUB[tab]), actions, badges: [demoChip(ov.cycle?.is_demo)].filter(Boolean) }), sysTabs(ctx, tabs, tab), body);
    } catch (e) {
      page.replaceChildren(sysHeader(ctx), errorState(e, () => { page.replaceChildren(sysHeader(ctx), skeleton('card', 3)); paint(); }));
    }
  };
  // A live refresh keeps the current screen until fresh data arrives; a visit shows a skeleton first.
  if (ctx.soft) { await paint(); return; }
  page.append(sysHeader(ctx, { sub: false }), h('div.integ-skel', { 'aria-busy': 'true' }, h('div.card', skeleton('card')), h('div.card', skeleton('list', 4))));
  paint();
}
