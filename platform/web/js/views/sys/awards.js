// Awards — نظام الجوائز. Role-aware landing:
//  committee member with pending reviews → «اللجنة»; nominee awaiting consent → «ترشيحاتي»;
//  awards admin / open programmes → «البرامج»; otherwise → «قاعة التميّز».
// Tabs are hash sub-routes (#/sys/awards/<tab>/<id>) so live soft refreshes keep the screen.
import { h, icon, L, sysHeader, sysTabs, skeleton, errorState, emptyState } from '../../sys-kit.js';
import { call, captureFocus } from './awards/common.js';
import * as Programs from './awards/programs.js';
import * as Nominate from './awards/nominate.js';
import * as Mine from './awards/mine.js';
import * as Committee from './awards/committee.js';
import * as Hall from './awards/hall.js';

const VIEWS = { programs: Programs, nominate: Nominate, mine: Mine, committee: Committee, hall: Hall };

function tabsFor(me) {
  return [
    { key: 'programs', ar: 'البرامج', en: 'Programmes', icon: 'award' },
    { key: 'nominate', ar: 'رشّح', en: 'Nominate', icon: 'userPlus' },
    { key: 'mine', ar: 'ترشيحاتي', en: 'My nominations', icon: 'inbox', count: me?.pending_consent || 0 },
    me?.member ? { key: 'committee', ar: 'اللجنة', en: 'Committee', icon: 'scale', count: me.pending_reviews || 0 } : null,
    { key: 'hall', ar: 'قاعة التميّز', en: 'Hall of excellence', icon: 'trophy' },
  ].filter(Boolean);
}

function header(ctx, me, tab) {
  const role = me?.admin ? h('span.chip.tiny.sand', icon('crown'), L('مسؤول برامج الجوائز', 'Awards admin'))
    : me?.member ? h('span.chip.tiny.navy', icon('scale'), L('عضو لجنة الجوائز', 'Awards committee')) : null;
  const actions = [];
  if (me?.admin && tab === 'programs') actions.push({ label: L('برنامج جديد', 'New programme'), icon: 'plus', primary: true, onClick: () => Programs.openEditor(ctx) });
  // The spotlight carries the nominate CTA on «البرامج»; the committee's primary action is scoring.
  if (me?.open_programs && !['nominate', 'programs'].includes(tab)) actions.push({ label: L('رشّح زميلاً', 'Nominate a colleague'), icon: 'userPlus', primary: !actions.length && !(tab === 'committee' || (tab === 'mine' && me.pending_consent) || (tab === 'hall' && me.my_wins)), href: '#/sys/awards/nominate' });
  return sysHeader(ctx, {
    title: L('نظام الجوائز', 'Awards'),
    sub: L('نحتفي بالتميّز في الخدمة العامة: رشّح زميلاً، وتابع ترشيحاتك، وتعرّف على الفائزين. الترشيحات سرية حتى إعلان النتائج.',
      'Celebrate excellence in public service: nominate a colleague, follow your nominations and meet the winners. Nominations stay confidential until results.'),
    badges: [role].filter(Boolean), actions,
  });
}

function skeletonPage() {
  return h('div.aw-skel', { 'aria-busy': 'true' }, h('div.card.aw-skel-hero', skeleton('card', 1)), h('div.sys-grid.three', [1, 2, 3].map(() => h('div.card', skeleton('card', 1)))));
}

export async function render(root, ctx) {
  const page = h('div.aw-page');
  root.append(page);
  const restore = ctx.soft ? captureFocus() : () => {};
  // Local UI changes (wizard choices, scores) re-render this page at once, keeping focus.
  const rerender = () => { const back = captureFocus(); return paint().then(() => back(page)).catch(fail); };
  ctx = { ...ctx, rerender };
  const paint = async () => {
    const me = await call('/me');
    const tabs = tabsFor(me);
    let tab = ctx.params[0];
    let body;
    if (!tab) {
      tab = tabs.some((t) => t.key === me.landing) ? me.landing : 'programs';
      history.replaceState(null, '', `#/sys/awards/${tab}`);
      ctx = { ...ctx, params: [tab] };
    }
    if (!tabs.some((t) => t.key === tab)) {
      body = emptyState({ icon: 'lock', title: L('هذا القسم غير متاح لحسابك', 'This section is not available to your account'), body: L('قسم اللجنة مخصص لأعضاء لجنة الجوائز المعتمدين.', 'The committee section is for approved awards committee members.'), actions: [{ label: L('برامج الجوائز', 'Award programmes'), primary: true, onClick: () => { location.hash = '#/sys/awards/programs'; } }] });
    } else {
      body = await VIEWS[tab].view(ctx, me, ctx.params.slice(1));
    }
    page.replaceChildren(header(ctx, me, tab), sysTabs(ctx, tabs, tab), h('div.aw-body', body));
    restore(page);
  };
  const fail = (e) => page.replaceChildren(header(ctx, null, null), errorState(e, () => { page.replaceChildren(header(ctx, null, null), skeletonPage()); paint().catch(fail); }));
  if (ctx.soft) { try { await paint(); } catch (e) { fail(e); } return; }
  page.replaceChildren(header(ctx, null, ctx.params[0]), skeletonPage());
  paint().catch(fail);
}
