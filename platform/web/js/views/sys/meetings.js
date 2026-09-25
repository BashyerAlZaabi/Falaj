// Meetings — نظام الاجتماعات (view entry).
// Routes (hash sub-routes keep state across live soft refreshes):
//   #/sys/meetings/upcoming[/<YYYY-MM>|/<YYYY-MM-DD>]   landing: today + next two weeks + mini calendar
//   #/sys/meetings/m/<id>[/<section>]                    meeting detail (agenda, minutes, decisions, actions, attendance)
//   #/sys/meetings/decisions[/<kind>/<scope>/<status>]    decisions & action items tracker
//   #/sys/meetings/committees[/<id>]                      committees, members, meeting history
import { currentTab } from '../../sys-kit.js';
import { TABS } from './meetings/common.js';

export async function render(root, ctx) {
  if (ctx.params[0] === 'm' && ctx.params[1]) return (await import('./meetings/detail.js')).render(root, ctx);
  const tab = currentTab(ctx, TABS, 'upcoming');
  if (tab === 'decisions') return (await import('./meetings/tracker.js')).render(root, ctx, tab);
  if (tab === 'committees') return (await import('./meetings/committees.js')).render(root, ctx, tab);
  return (await import('./meetings/upcoming.js')).render(root, ctx, tab);
}
