// Client side of the enterprise systems registry: route rendering
// (#/sys/<key>/…), lazy loading of each system's view + stylesheet, and the
// Home "my systems" workspace strip built from /api/workspace.
import { api } from './api.js';
import { h, icon, emptyState, skeleton } from './ui.js';
import { L, fmtNum } from './i18n.js';
import { state } from './state.js';

const cssLoaded = new Set();
export function ensureCss(href) {
  if (cssLoaded.has(href)) return;
  cssLoaded.add(href);
  document.head.append(h('link', { rel: 'stylesheet', href }));
}
export const systemMeta = (key) => state.me?.systems?.find((s) => s.key === key) || null;
export const CATEGORY = { strategy: ['الاستراتيجية والأداء', 'Strategy & performance'], governance: ['الحوكمة والامتثال', 'Governance & compliance'], people: ['الموظفون', 'People'], operations: ['العمليات', 'Operations'], platform: ['المنصة', 'Platform'] };
export const CATEGORY_ORDER = ['strategy', 'people', 'operations', 'governance', 'platform'];
export const sortSystems = (list) => [...list].sort((a, b) => CATEGORY_ORDER.indexOf(a.category) - CATEGORY_ORDER.indexOf(b.category));

// Render #/sys/<key>/<params…>. The view module exports render(root, ctx).
export async function renderSystem(root, key, params = [], opts = {}) {
  const meta = systemMeta(key);
  if (!meta) {
    root.append(emptyState({ icon: 'lock', title: L('هذا النظام غير متاح لحسابك', 'This system is not available to your account'), body: L('تُمنح صلاحيات الأنظمة من مدير المنصة. تواصل معه إن كنت تحتاج الوصول.', 'System access is granted by the platform admin.'), actions: [{ label: L('العودة', 'Back'), onClick: () => history.back() }] }));
    return;
  }
  ensureCss(`/css/pages/sys-${key}.css`);
  const mod = await import(`./views/sys/${key}.js`);
  await mod.render(root, { key, meta, params, soft: !!opts.soft, user: state.me.user });
}

// Home strip: one card per workspace card returned by accessible systems.
export async function workspaceStrip({ limit = 8 } = {}) {
  const wrap = h('section.ws-strip', { 'aria-label': L('مساحتي في الأنظمة', 'My systems') }, skeleton('stat', 3));
  api('/api/workspace').then((list) => {
    const cards = list.flatMap((s) => s.cards.map((c) => ({ ...c, sys: s }))).slice(0, limit);
    if (!cards.length) { wrap.remove(); return; }
    wrap.replaceChildren(h('div.section', L('مساحتي في الأنظمة', 'My systems'), h('span.count', L('ما يحتاج انتباهك الآن', 'What needs you now'))),
      h('div.ws-grid', cards.map(wsCard)));
  }).catch(() => wrap.remove());
  return wrap;
}
export function wsCard(c) {
  return h(`article.ws-card${c.tone ? '.' + c.tone : ''}`,
    h('div.ws-head', h('span.sys-mini', icon(c.sys.icon)), h('span.grow', L(c.sys.name_ar, c.sys.name_en))),
    h('div.ws-title', L(c.title_ar, c.title_en)),
    c.value != null ? h('div.ws-value', h('span.num.tabular', typeof c.value === 'number' ? fmtNum(c.value) : c.value), c.unit_ar ? h('small', L(c.unit_ar, c.unit_en)) : null) : null,
    c.hint_ar ? h('div.tiny.faint', L(c.hint_ar, c.hint_en)) : null,
    c.items?.length ? h('ul', c.items.slice(0, 3).map((it) => h('li', h('a', { href: it.href || c.href || `#/sys/${c.sys.system}` }, h('span.grow', it.title), it.meta_ar ? h('span.meta', L(it.meta_ar, it.meta_en)) : null)))) : null,
    h('a.btn.sm.tertiary.ws-cta', { href: c.cta?.href || c.href || `#/sys/${c.sys.system}` }, c.cta ? L(c.cta.label_ar, c.cta.label_en) : L('فتح', 'Open'), icon('chevron', 'flip-rtl')));
}
