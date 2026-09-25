// Performance Management — نظام الأداء. Role-aware tabs:
//   «مراجعتي» (employee) · «فريقي» (line manager) · «الموارد البشرية» (performance.hr)
//   · «نظرة المؤسسة» (president: aggregated only) · «الإطار» (competency framework).
// Routes: #/sys/performance/<tab>/<cycleId|current>/<reviewId>. All state that must
// survive the platform's live re-render lives in the hash (or in unsaved drafts).
import { h, icon, L, sysHeader, sysTabs, currentTab, go, errorState, skeleton } from '../../sys-kit.js';
import { call, phaseName, demoChip } from './performance/common.js';

const TAB_DEFS = [
  { key: 'mine', ar: 'مراجعتي', en: 'My review', icon: 'userCheck', show: (me) => me.has_review },
  { key: 'team', ar: 'فريقي', en: 'My team', icon: 'usersRound', show: (me) => me.has_team },
  { key: 'hr', ar: 'الموارد البشرية', en: 'HR', icon: 'scale', show: (me) => me.is_hr },
  { key: 'org', ar: 'نظرة المؤسسة', en: 'Organisation', icon: 'chartBar', show: (me) => me.is_president },
  { key: 'framework', ar: 'الإطار', en: 'Framework', icon: 'compass', show: () => true },
];
const loaders = {
  mine: () => import('./performance/mine.js'),
  team: () => import('./performance/team.js'),
  hr: () => import('./performance/hr.js'),
  org: () => import('./performance/org.js'),
  framework: () => import('./performance/framework.js'),
};

export async function render(root, ctx) {
  const page = h('div.perf');
  root.append(page);
  const paint = async () => {
    const boot = await call('/');
    const tabs = TAB_DEFS.filter((t) => t.show(boot.me)).map((t) => ({ ...t, count: t.key === 'team' && boot.me.pending_team ? boot.me.pending_team : null }));
    const tab = currentTab(ctx, tabs, boot.me.landing);
    const cycleId = ctx.params[0] === tab ? ctx.params[1] : null;
    const reviewId = ctx.params[0] === tab ? ctx.params[2] : null;
    const cycle = cycleId && cycleId !== 'current' ? boot.cycles.find((c) => c.id === cycleId) || boot.current : boot.current;
    const mod = await loaders[tab]();
    const body = await mod.view(ctx, boot, { cycleId: cycle?.id === boot.current?.id ? null : cycle?.id, reviewId, cycle });
    page.replaceChildren(head(ctx, boot, tab, cycle), sysTabs(ctx, tabs, tab), body);
  };
  const fail = (e) => page.replaceChildren(head(ctx, null, null, null), h('div.card', errorState({ message: L(`تعذّر تحميل نظام الأداء: ${e.message}`, `Could not load Performance: ${e.message}`) }, () => { page.replaceChildren(skel()); paint().catch(fail); })));
  if (ctx.soft) { await paint().catch(fail); return; }
  page.append(skel());
  paint().catch(fail);
}

function skel() {
  return h('div.perf-skel', { 'aria-busy': 'true' }, h('div.card', skeleton('card')), h('div.perf-skel-row', h('div.card', skeleton('stat')), h('div.card', skeleton('stat')), h('div.card', skeleton('stat'))), h('div.card', skeleton('list', 4)));
}

function head(ctx, boot, tab, cycle) {
  if (!boot) return sysHeader(ctx);
  const badges = cycle ? [h(`span.chip.tiny.${cycle.phase === 'closed' ? 'outline' : 'purple'}`, icon(cycle.phase === 'closed' ? 'lock' : 'calendarClock'), `${L(cycle.name_ar, cycle.name_en)} · ${phaseName(cycle.phase)}`), demoChip(cycle.is_demo)] : [];
  const actions = [];
  if (tab !== 'framework' && boot.cycles.length > 1) {
    const sel = h('select.field.sm.perf-cycle-select', { 'aria-label': L('دورة الأداء', 'Performance cycle'), onchange: (e) => go(ctx, tab, e.target.value === boot.current?.id ? null : e.target.value) },
      boot.cycles.map((c) => h('option', { value: c.id, selected: c.id === cycle?.id || null }, `${L(c.name_ar, c.name_en)}${c.phase === 'closed' ? L(' (مغلقة)', ' (closed)') : ''}`)));
    actions.push(h('label.perf-cycle', icon('calendarDays'), sel));
  }
  return sysHeader(ctx, { badges: badges.filter(Boolean), actions });
}
