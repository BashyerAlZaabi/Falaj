// Surveys — نظام الاستبيانات.
// Role-aware landing: employees land on «بانتظاري» (what to answer next), authors
// (surveys.author) on «استبياناتي», managers also get «مشاركة فريقي».
// Sub-routes keep all transient state in the hash so the platform's soft refresh
// never loses it: #/sys/surveys/<tab> · build/<id>[/preview/<step>] ·
// answer/<id>/<step> · results/<id>.
// First renders paint a skeleton immediately and fill in when data arrives; soft
// re-renders (live data changes) wait for the data so nothing flickers.
import { h, L, sysHeader, sysTabs, currentTab, errorState, skeleton, card } from '../../sys-kit.js';
import { call } from './surveys/common.js';
import { renderPending, renderAnswered, renderMine, renderTeam, newSurvey } from './surveys/lists.js';
import { renderBuilder } from './surveys/builder.js';
import { renderAnswer } from './surveys/answer.js';
import { renderResults } from './surveys/results.js';

export async function render(root, ctx) {
  const [tab, id, extra] = ctx.params;
  if (tab === 'answer' && id) return deferred(root, ctx, (el) => renderAnswer(el, ctx, id, extra));
  if (tab === 'build' && id) return deferred(root, ctx, (el) => renderBuilder(el, ctx, id, extra));
  if (tab === 'results' && id) return deferred(root, ctx, (el) => renderResults(el, ctx, id));

  const isAuthor = (ctx.user.caps || []).includes('surveys.author');
  const isManager = ['manager', 'president'].includes(ctx.user.role);
  const tabs = [
    { key: 'pending', ar: 'بانتظاري', en: 'Waiting for me', icon: 'inbox' },
    { key: 'answered', ar: 'مشاركاتي', en: 'My responses', icon: 'clipboardCheck' },
    isAuthor ? { key: 'mine', ar: 'استبياناتي', en: 'My surveys', icon: 'clipboardList' } : null,
    isManager ? { key: 'team', ar: 'مشاركة فريقي', en: 'Team participation', icon: 'usersRound' } : null,
  ].filter(Boolean);
  const current = currentTab(ctx, tabs, isAuthor ? 'mine' : 'pending');
  const tabsEl = h('div.sv-tabs-host', sysTabs(ctx, tabs, current));
  root.append(sysHeader(ctx, { actions: isAuthor ? [{ label: L('استبيان جديد', 'New survey'), icon: 'plus', primary: current === 'mine', onClick: () => newSurvey(ctx) }] : [] }), tabsEl);
  return deferred(root, ctx, async (body) => {
    const [ov, data] = await Promise.all([call('/overview'), load(current)]);
    tabsEl.replaceChildren(sysTabs(ctx, tabs.map((t) => ({ ...t, count: t.key === 'pending' ? ov.pending : t.key === 'mine' ? ov.open_authored : 0 })), current));
    if (current === 'pending') await renderPending(body, ctx, data);
    else if (current === 'answered') renderAnswered(body, ctx, data);
    else if (current === 'mine') renderMine(body, ctx, data.mine, data.pending);
    else if (current === 'team') renderTeam(body, ctx, data);
  }, current === 'answered' ? 'table' : 'card');
}

// Soft render: build in place (awaited). First render: skeleton now, content later.
async function deferred(root, ctx, fill, kind = 'card') {
  if (ctx.soft) {
    try { await fill(root); } catch (e) { root.append(card(null, errorState(e, () => window.dispatchEvent(new HashChangeEvent('hashchange'))))); }
    return;
  }
  const holder = h('div.sv-loading', { 'aria-busy': 'true' }, skeleton(kind, 4));
  root.append(holder);
  const tmp = h('div');
  Promise.resolve().then(() => fill(tmp))
    .then(() => { if (holder.isConnected || holder.parentNode) holder.replaceWith(...tmp.childNodes); })
    .catch((e) => holder.replaceWith(card(null, errorState(e, () => window.dispatchEvent(new HashChangeEvent('hashchange'))))));
}

async function load(tab) {
  if (tab === 'pending') { const [p, answered] = await Promise.all([call('/pending'), call('/answered')]); return { ...p, answered }; }
  if (tab === 'answered') return call('/answered');
  if (tab === 'mine') { const [mine, p] = await Promise.all([call('/mine'), call('/pending')]); return { mine, pending: p.pending }; }
  if (tab === 'team') return call('/team');
  return null;
}
