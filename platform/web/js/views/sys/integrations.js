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
  // Warm the tab module while the overview loads (the landing tab is known when the hash names it).
  const guess = [...TABS, ...ADMIN_TABS].find((t) => t.key === ctx.params[0]);
  if (guess) import(`./integrations/tab-${guess.file}.js`).catch(() => {});
  let ov;
  try { ov = await call('/overview'); }
  catch (e) { root.append(sysHeader(ctx), h('div.card', errorState(e, () => window.dispatchEvent(new HashChangeEvent('hashchange'))))); return; }
  const tabs = [...TABS, ...(ov.is_admin ? ADMIN_TABS.map((t) => (t.key === 'connectors' && ov.admin.open_requests ? { ...t, count: ov.admin.open_requests } : t)) : [])];
  const tab = currentTab(ctx, tabs, landingTab(ov));
  const def = tabs.find((t) => t.key === tab);

  const header = sysHeader(ctx, {
    sub: L('اختر ما يظهر لك، واعرف أين تذهب بياناتك وأين لا تذهب، واربط التطبيقات بأمان.', 'Choose what you see, know where your data goes — and where it never goes — and connect apps safely.'),
    badges: ov.is_admin ? [h('span.chip.tiny.navy', icon('settings'), L('مدير المنصة: إعدادات فقط — لا وصول لبيانات الأنظمة', 'Platform admin: configuration only — no system data'))] : [],
  });
  // The generic Ask AI chip describes this system's own settings domain; say it precisely.
  header.querySelector('.ai-chip')?.replaceWith(h('span.chip.tiny.outline', { 'data-tip': L('إعداداتك وروابطك في هذا المركز لا يقرؤها المساعد الذكي', 'Your settings and links here are never read by Ask AI') }, icon('lockKeyhole'), L('إعداداتك لا يقرؤها المساعد', 'Ask AI never reads your settings')));
  const nav = sysTabs(ctx, tabs, tab);
  nav.classList.add('ic-tabs');
  if (ov.is_admin) {
    // visual divider before the admin-only tabs
    const first = nav.querySelector(`a[href="#/sys/${ctx.key}/access"]`);
    first?.before(h('span.ic-tab-sep', { role: 'separator', 'aria-hidden': 'true' }));
  }
  const body = h(`div.ic-body.ic-tab-${tab}${ctx.soft ? '.soft' : ''}`);
  root.append(header, nav, body);

  const env = { ov, tab, sub: ctx.params.slice(1), refresh: null };
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
  const fill = async () => {
    try { await load(body, ctx.soft); }
    catch (e) { body.replaceChildren(h('div.card', errorState(e, () => { body.replaceChildren(skeleton('card', 3)); fill(); }))); }
  };
  if (ctx.soft) { await fill(); return; }
  // First paint: header + tabs + skeleton immediately, content streams in.
  body.append(h('div.ic-skel', skeleton('stat', 1), skeleton('card', 3)));
  fill();
}
