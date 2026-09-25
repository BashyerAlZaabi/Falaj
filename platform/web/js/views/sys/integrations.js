// Integration & Control Center — مركز التكامل والتحكم.
// Tabs are hash sub-routes (#/sys/integrations/<tab>/<…>) so the platform's
// soft refresh keeps the user where they are. Each tab lives in its own module
// under ./integrations/ and is loaded on demand.
import { sysHeader, sysTabs, currentTab, h, icon, L, skeleton, errorState } from '../../sys-kit.js';
import { call } from './integrations/common.js';

const TABS = [
  { key: 'systems', ar: 'أنظمتي', en: 'My systems', icon: 'grid', file: 'systems' },
  { key: 'ai', ar: 'الذكاء الاصطناعي والبيانات', en: 'AI & data', icon: 'spark', file: 'ai' },
  { key: 'apps', ar: 'التطبيقات المرتبطة', en: 'Connected apps', icon: 'plug', file: 'apps' },
  { key: 'activity', ar: 'سجل النشاط', en: 'Activity', icon: 'history', file: 'activity' },
];
const ADMIN_TABS = [
  { key: 'access', ar: 'الصلاحيات', en: 'Permissions', icon: 'userCog', file: 'admin' },
  { key: 'policies', ar: 'سياسات البيانات', en: 'Data policies', icon: 'shield', file: 'admin' },
  { key: 'connectors', ar: 'الموصلات', en: 'Connectors', icon: 'cable', file: 'admin' },
];

// Role-aware landing: the platform admin starts where governance work is due;
// everyone else starts on the data-boundaries hero.
function landingTab(ov) {
  if (ov.is_admin && ov.admin) {
    if (!ov.admin.access_review.done_at) return 'access';
    if (ov.admin.open_requests) return 'connectors';
  }
  return 'ai';
}

export async function render(root, ctx) {
  const isAdmin = !!ctx.user?.is_admin;
  // Warm the tab module while the overview loads (known when the hash names it; staff land on «ai»).
  const guess = [...TABS, ...(isAdmin ? ADMIN_TABS : [])].find((t) => t.key === ctx.params[0]) || (isAdmin ? null : TABS[1]);
  if (guess) import(`./integrations/tab-${guess.file}.js`).catch(() => {});
  // …and its data, so the first paint needs one round trip less. Each prefetched
  // response is used once (a refresh always fetches fresh data).
  const pre = {};
  const ENDPOINT = { systems: '/systems', ai: '/ai', apps: '/connectors', activity: '/activity', access: '/admin/matrix', policies: '/admin/domains', connectors: '/admin/connectors' };
  if (guess && ENDPOINT[guess.key]) { const p = call(ENDPOINT[guess.key]); p.catch(() => {}); pre[ENDPOINT[guess.key]] = p; }

  const header = sysHeader(ctx, {
    sub: L('اختر ما يظهر لك، واعرف أين تذهب بياناتك وأين لا تذهب، واربط التطبيقات بأمان.', 'Choose what you see, know where your data goes — and where it never goes — and connect apps safely.'),
    badges: isAdmin ? [h('span.chip.tiny.navy', icon('settings'), L('مدير المنصة: إعدادات فقط — لا وصول لبيانات الأنظمة', 'Platform admin: configuration only — no system data'))] : [],
  });
  // The generic Ask AI chip describes this system's own settings domain; say it precisely.
  header.querySelector('.ai-chip')?.replaceWith(h('span.chip.tiny.outline', { 'data-tip': L('إعداداتك وروابطك في هذا المركز لا يقرؤها المساعد الذكي', 'Your settings and links here are never read by Ask AI') }, icon('lockKeyhole'), L('إعداداتك لا يقرؤها المساعد', 'Ask AI never reads your settings')));
  const navSlot = h('div.ic-nav-slot', { 'aria-hidden': 'true' });
  const body = h(`div.ic-body${ctx.soft ? '.soft' : ''}`);
  root.append(header, navSlot, body);

  const env = { ov: null, tab: null, sub: ctx.params.slice(1), refresh: null,
    // tabs call env.get(path): the prefetched promise the first time, a fresh request afterwards
    get: (path) => { const p = pre[path]; delete pre[path]; return p || call(path); } };
  let def = null;
  const load = async (target, soft) => {
    const mod = await import(`./integrations/tab-${def.file}.js`);
    const frag = h('div.ic-frag');
    await mod.render(frag, { ...ctx, soft }, env);
    target.replaceChildren(...frag.childNodes);
  };
  // In-place refresh after the user's own actions (keeps scroll and focus context).
  env.refresh = async () => {
    try { env.ov = await call('/overview'); await load(body, true); }
    catch (e) { body.replaceChildren(h('div.card', errorState(e, () => env.refresh()))); }
  };
  const run = async () => {
    try {
      if (!def) {
        env.ov = await call('/overview');
        const ov = env.ov;
        const tabs = [...TABS, ...(ov.is_admin ? ADMIN_TABS.map((t) => (t.key === 'connectors' && ov.admin.open_requests ? { ...t, count: ov.admin.open_requests } : t)) : [])];
        env.tab = currentTab(ctx, tabs, landingTab(ov));
        def = tabs.find((t) => t.key === env.tab);
        const nav = sysTabs(ctx, tabs, env.tab);
        nav.classList.add('ic-tabs');
        if (ov.is_admin) nav.querySelector(`a[href="#/sys/${ctx.key}/access"]`)?.before(h('span.ic-tab-sep', { role: 'separator', 'aria-hidden': 'true' }));
        navSlot.replaceWith(nav);
        // On narrow screens the tab strip scrolls: keep the current tab in view.
        if (!ctx.soft) requestAnimationFrame(() => { const on = nav.querySelector('a.on'); if (on && nav.scrollWidth > nav.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' }); });
        body.classList.add(`ic-tab-${env.tab}`);
      }
      await load(body, ctx.soft);
    } catch (e) {
      body.replaceChildren(h('div.card', errorState(e, () => { body.replaceChildren(skeleton('card', 3)); run(); })));
    }
  };
  if (ctx.soft) { await run(); return; }
  // First paint: header + skeleton immediately; tabs and content stream in.
  body.append(h('div.ic-skel', h('div.card', skeleton('stat', 1)), h('div.card', skeleton('card', 3))));
  run();
}
