// Ideas — إدارة الأفكار. Tabs are hash sub-routes (#/sys/ideas/<tab>/<id>):
//   bank        «بنك الأفكار»  hero, next step, trending, filtered gallery
//   mine        «أفكاري»       my ideas journey, drafts and info requests, followed ideas
//   challenges  «التحديات»     open challenges; #/sys/ideas/challenges/<camp_id> for one challenge
//   committee   «اللجنة»       committee queue board + blind scoring matrix (ideas.committee only)
// An idea id as the last segment opens the idea sheet; the sheet is refreshed in
// place on the platform's soft re-render. Role-aware landing: committee members
// land on the committee queue, everyone else on the bank.
import { h, L, toast, sysHeader, sysTabs, currentTab, errorState, skeleton } from '../../sys-kit.js';
import { S, call, keepFocus } from './ideas/ui.js';
import { openIdea } from './ideas/sheet.js';
import { ideaForm, challengeDialog } from './ideas/forms.js';
import * as T from './ideas/tabs.js';

const TABS = [
  { key: 'bank', ar: 'بنك الأفكار', en: 'Ideas bank', icon: 'lightbulb' },
  { key: 'mine', ar: 'أفكاري', en: 'My ideas', icon: 'user' },
  { key: 'challenges', ar: 'التحديات', en: 'Challenges', icon: 'flag' },
  { key: 'committee', ar: 'اللجنة', en: 'Committee', icon: 'scale', committee: true },
];

export async function render(root, ctx) {
  const committee = (ctx.user?.caps || []).includes('ideas.committee');
  const tab = currentTab(ctx, TABS, committee ? 'committee' : 'bank');
  const rest = ctx.params.slice(TABS.some((t) => t.key === ctx.params[0]) ? 1 : 0);
  const ideaId = rest.find((p) => /^idea_\w+$/.test(p || ''));
  const campId = tab === 'challenges' ? rest.find((p) => /^camp_\w+$/.test(p || '')) : null;
  const base = `#/sys/ideas/${tab}${campId ? `/${campId}` : ''}`;
  const page = h('div.ideas');
  root.append(page);
  const app = {
    ctx, tab, base, committee,
    href: (id) => `${base}/${id}`,
    open: (id) => { history.replaceState(null, '', `${base}/${id}`); openIdea(ctx, id, { base }); },
    rerender: () => run(false),
    newIdea: async (opts = {}) => {
      const r = await ideaForm(opts).catch((e) => { toast(e.message, { kind: 'error' }); return null; });
      if (r) { run(true); app.open(r.id); }
    },
    newChallenge: async () => {
      const r = await challengeDialog().catch((e) => { toast(e.message, { kind: 'error' }); return null; });
      if (r) location.hash = `#/sys/ideas/challenges/${r.id}`;
    },
  };
  const tabs = (ov) => sysTabs(ctx, TABS.filter((t) => !t.committee || committee).map((t) => ({ ...t, count: ov ? (t.key === 'mine' ? ov.counts.mine_action : t.key === 'committee' ? ov.counts.committee : 0) : 0 })), tab);
  const header = () => sysHeader(ctx, {
    sub: L('شارك بأفكارك لتبسيط الإجراءات وتحسين الخدمات، وادعم أفكار زملائك، وتابع تحوّل الأفكار المعتمدة إلى مشاريع.', 'Share ideas that simplify procedures and improve services, back colleagues’ ideas, and follow approved ideas into projects.'),
    // The bank's hero owns the primary action; other tabs keep it in the header.
    actions: tab === 'bank' ? [] : [{ label: L('قدّم فكرة', 'Submit an idea'), icon: 'plus', onClick: () => app.newIdea({ campaignId: campId }) }],
  });
  async function run(quiet) {
    const restore = keepFocus(root);
    const ovP = call('/');
    try {
      const body = await (tab === 'challenges' ? T.challenges(app, ovP, campId) : T[tab](app, ovP));
      const ov = await ovP;
      page.replaceChildren(header(), tabs(ov), h('div.ideas-body', body));
      restore();
    } catch (e) {
      if (quiet && page.childElementCount > 2) { toast(e.message, { kind: 'error' }); return; }
      page.replaceChildren(header(), tabs(null), h('div.ideas-body', errorState(e, () => { page.replaceChildren(header(), tabs(null), skel()); run(false); })));
    }
  }
  const skel = () => h('div.ideas-body.is-loading', { 'aria-busy': 'true' }, tab === 'bank' ? h('div.card.ideas-hero-skel', skeleton('card')) : null, h('div.skel-grid', [0, 1, 2].map(() => h('div.card', skeleton('card')))));
  if (ctx.soft) await run(true);
  else { page.append(header(), tabs(null), skel()); run(false); }
  if (ideaId) openIdea(ctx, ideaId, { base });
}
