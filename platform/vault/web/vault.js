// Vault UI — isolated app served by vault/server.js on Vault's own origin.
// It talks only to /api on this origin (CSP is self-only), so nothing is loaded
// from the portal: this file carries small local copies of the portal's UI
// primitives (h, icon, toast, menu, segmented, skeleton, emptyState, errorState,
// table) to speak the same Liquid Glass language with Vault's own secure
// identity (amber accent, lock mark, «بيئة معزولة»). Styling lives in vault.css.
//
// Data flow is unchanged: GET /api/me, GET /api/fs + /api/fs/summary,
// GET /api/marsad, POST /api/marsad/:id/summarize. Summaries are kept in memory
// only (never in browser storage) — they stay inside Vault.

// ---------- preferences (this origin only; the portal's storage is not shared) ----------
const store = {
  get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } },
  set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch { /* private mode */ } },
};
// Optional hand-off from the portal link: /sso/start?next=/marsad?lang=en&theme=dark
(() => {
  const q = new URLSearchParams(location.search); let changed = false;
  if (['ar', 'en'].includes(q.get('lang'))) { store.set('swp.lang', q.get('lang')); q.delete('lang'); changed = true; }
  if (['light', 'dark', 'system'].includes(q.get('theme'))) { store.set('swp.theme', q.get('theme') === 'system' ? null : q.get('theme')); q.delete('theme'); changed = true; }
  if (changed) history.replaceState(null, '', location.pathname + (String(q) ? `?${q}` : '') + location.hash);
})();

let lang = store.get('swp.lang', 'ar') === 'en' ? 'en' : 'ar';
const L = (ar, en) => (lang === 'en' ? en : ar);
const NUM_LOC = () => (lang === 'en' ? 'en-US' : 'ar-AE-u-nu-latn'); // same digits as the portal
const DATE_LOC = () => (lang === 'en' ? 'en-GB' : 'ar-AE-u-nu-latn');

function applyLang() { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; }
const themeMode = () => store.get('swp.theme', 'system');
function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme;
  store.set('swp.theme', mode === 'light' || mode === 'dark' ? mode : null);
}
applyLang(); applyTheme(themeMode());

// ---------- DOM kit (local copy of web/js/ui.js primitives) ----------
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
function h(tag, attrs = {}, ...children) {
  const m = String(tag).match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i) || [null, 'div', ''];
  const el = document.createElement(m[1] || 'div');
  for (const p of (m[2] || '').match(/[.#][\w-]+/g) || []) p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1));
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = {}; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'class') el.className += ` ${v}`;
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}
const bdi = (s, cls = '') => h(`bdi${cls ? `.${cls}` : ''}`, s);

// Lucide icons — subset of web/js/icons-data.js (same names, same geometry).
const ICONS = {"lock":[["rect",{"width":"18","height":"11","x":"3","y":"11","rx":"2","ry":"2"}],["path",{"d":"M7 11V7a5 5 0 0 1 10 0v4"}]],"lockKeyhole":[["circle",{"cx":"12","cy":"16","r":"1"}],["rect",{"x":"3","y":"10","width":"18","height":"12","rx":"2"}],["path",{"d":"M7 10V7a5 5 0 0 1 10 0v3"}]],"shield":[["path",{"d":"M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"}],["path",{"d":"m9 12 2 2 4-4"}]],"vault":[["rect",{"width":"18","height":"18","x":"3","y":"3","rx":"2"}],["circle",{"cx":"7.5","cy":"7.5","r":".5","fill":"currentColor"}],["path",{"d":"m7.9 7.9 2.7 2.7"}],["circle",{"cx":"16.5","cy":"7.5","r":".5","fill":"currentColor"}],["path",{"d":"m13.4 10.6 2.7-2.7"}],["circle",{"cx":"7.5","cy":"16.5","r":".5","fill":"currentColor"}],["path",{"d":"m7.9 16.1 2.7-2.7"}],["circle",{"cx":"16.5","cy":"16.5","r":".5","fill":"currentColor"}],["path",{"d":"m13.4 13.4 2.7 2.7"}],["circle",{"cx":"12","cy":"12","r":"2"}]],"wallet":[["path",{"d":"M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1"}],["path",{"d":"M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4"}]],"banknote":[["rect",{"width":"20","height":"12","x":"2","y":"6","rx":"2"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"M6 12h.01M18 12h.01"}]],"landmark":[["path",{"d":"M10 18v-7"}],["path",{"d":"M11.119 2.205a2 2 0 0 1 1.762 0l7.84 3.846A.5.5 0 0 1 20.5 7h-17a.5.5 0 0 1-.22-.949z"}],["path",{"d":"M14 18v-7"}],["path",{"d":"M18 18v-7"}],["path",{"d":"M3 22h18"}],["path",{"d":"M6 18v-7"}]],"radar":[["path",{"d":"M19.07 4.93A10 10 0 0 0 6.99 3.34"}],["path",{"d":"M4 6h.01"}],["path",{"d":"M2.29 9.62A10 10 0 1 0 21.31 8.35"}],["path",{"d":"M16.24 7.76A6 6 0 1 0 8.23 16.67"}],["path",{"d":"M12 18h.01"}],["path",{"d":"M17.99 11.66A6 6 0 0 1 15.77 16.67"}],["circle",{"cx":"12","cy":"12","r":"2"}],["path",{"d":"m13.41 10.59 5.66-5.66"}]],"scanSearch":[["path",{"d":"M3 7V5a2 2 0 0 1 2-2h2"}],["path",{"d":"M17 3h2a2 2 0 0 1 2 2v2"}],["path",{"d":"M21 17v2a2 2 0 0 1-2 2h-2"}],["path",{"d":"M7 21H5a2 2 0 0 1-2-2v-2"}],["circle",{"cx":"12","cy":"12","r":"3"}],["path",{"d":"m16 16-1.9-1.9"}]],"fileText":[["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M10 9H8"}],["path",{"d":"M16 13H8"}],["path",{"d":"M16 17H8"}]],"doc":[["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M10 9H8"}],["path",{"d":"M16 13H8"}],["path",{"d":"M16 17H8"}]],"search":[["path",{"d":"m21 21-4.34-4.34"}],["circle",{"cx":"11","cy":"11","r":"8"}]],"refresh":[["path",{"d":"M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"}],["path",{"d":"M21 3v5h-5"}],["path",{"d":"M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"}],["path",{"d":"M8 16H3v5"}]],"sparkle":[["path",{"d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}]],"spark":[["path",{"d":"M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z"}],["path",{"d":"M20 2v4"}],["path",{"d":"M22 4h-4"}],["circle",{"cx":"4","cy":"20","r":"2"}]],"circleAlert":[["circle",{"cx":"12","cy":"12","r":"10"}],["line",{"x1":"12","x2":"12","y1":"8","y2":"12"}],["line",{"x1":"12","x2":"12.01","y1":"16","y2":"16"}]],"circleCheck":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"m16 9-5.5 5.5L8 12"}]],"inboxEmpty":[["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}]],"inbox":[["polyline",{"points":"22 12 16 12 14 15 10 15 8 12 2 12"}],["path",{"d":"M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"}]],"chevronDown":[["path",{"d":"m6 9 6 6 6-6"}]],"chevronUp":[["path",{"d":"m18 15-6-6-6 6"}]],"x":[["path",{"d":"M18 6 6 18"}],["path",{"d":"m6 6 12 12"}]],"logout":[["path",{"d":"m16 17 5-5-5-5"}],["path",{"d":"M21 12H9"}],["path",{"d":"M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"}]],"sun":[["circle",{"cx":"12","cy":"12","r":"4"}],["path",{"d":"M12 2v2"}],["path",{"d":"M12 20v2"}],["path",{"d":"m4.93 4.93 1.41 1.41"}],["path",{"d":"m17.66 17.66 1.41 1.41"}],["path",{"d":"M2 12h2"}],["path",{"d":"M20 12h2"}],["path",{"d":"m6.34 17.66-1.41 1.41"}],["path",{"d":"m19.07 4.93-1.41 1.41"}]],"moon":[["path",{"d":"M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401"}]],"monitor":[["rect",{"width":"20","height":"14","x":"2","y":"3","rx":"2"}],["line",{"x1":"8","x2":"16","y1":"21","y2":"21"}],["line",{"x1":"12","x2":"12","y1":"17","y2":"21"}]],"languages":[["path",{"d":"m5 8 6 6"}],["path",{"d":"m4 14 6-6 2-3"}],["path",{"d":"M2 5h12"}],["path",{"d":"M7 2h1"}],["path",{"d":"m22 22-5-10-5 10"}],["path",{"d":"M14 18h6"}]],"ext":[["path",{"d":"M15 3h6v6"}],["path",{"d":"M10 14 21 3"}],["path",{"d":"M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"}]],"clock":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 6v6l4 2"}]],"upload":[["path",{"d":"M12 13v8"}],["path",{"d":"M4 14.899A7 7 0 1 1 15.71 8h1.79a4.5 4.5 0 0 1 2.5 8.242"}],["path",{"d":"m8 17 4-4 4 4"}]],"fileUp":[["path",{"d":"M6 22a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.704.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2z"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M12 12v6"}],["path",{"d":"m15 15-3-3-3 3"}]],"eye":[["path",{"d":"M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"}],["circle",{"cx":"12","cy":"12","r":"3"}]],"info":[["circle",{"cx":"12","cy":"12","r":"10"}],["path",{"d":"M12 16v-4"}],["path",{"d":"M12 8h.01"}]],"sort":[["path",{"d":"m21 16-4 4-4-4"}],["path",{"d":"M17 20V4"}],["path",{"d":"m3 8 4-4 4 4"}],["path",{"d":"M7 4v16"}]],"sortUp":[["path",{"d":"m3 8 4-4 4 4"}],["path",{"d":"M7 4v16"}],["path",{"d":"M11 12h4"}],["path",{"d":"M11 16h7"}],["path",{"d":"M11 20h10"}]],"sortDown":[["path",{"d":"m3 16 4 4 4-4"}],["path",{"d":"M7 20V4"}],["path",{"d":"M11 4h10"}],["path",{"d":"M11 8h7"}],["path",{"d":"M11 12h4"}]],"check":[["path",{"d":"M20 6 9 17l-5-5"}]],"unplug":[["path",{"d":"m19 5 3-3"}],["path",{"d":"m2 22 3-3"}],["path",{"d":"M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z"}],["path",{"d":"M7.5 13.5 10 11"}],["path",{"d":"M10.5 16.5 13 14"}],["path",{"d":"m12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z"}]],"fingerprint":[["path",{"d":"M12 10a2 2 0 0 0-2 2c0 1.02-.1 2.51-.26 4"}],["path",{"d":"M14 13.12c0 2.38 0 6.38-1 8.88"}],["path",{"d":"M17.29 21.02c.12-.6.43-2.3.5-3.02"}],["path",{"d":"M2 12a10 10 0 0 1 18-6"}],["path",{"d":"M2 16h.01"}],["path",{"d":"M21.8 16c.2-2 .131-5.354 0-6"}],["path",{"d":"M5 19.5C5.5 18 6 15 6 12a6 6 0 0 1 .34-2"}],["path",{"d":"M8.65 22c.21-.66.45-1.32.57-2"}],["path",{"d":"M9 6.8a6 6 0 0 1 9 5.2v2"}]],"coins":[["path",{"d":"M13.744 17.736a6 6 0 1 1-7.48-7.48"}],["path",{"d":"M15 6h1v4"}],["path",{"d":"m6.134 14.768.866-.5 2 3.464"}],["circle",{"cx":"16","cy":"8","r":"6"}]],"fileLock":[["path",{"d":"M4 9.8V4a2 2 0 0 1 2-2h8a2.4 2.4 0 0 1 1.706.706l3.588 3.588A2.4 2.4 0 0 1 20 8v12a2 2 0 0 1-2 2h-3"}],["path",{"d":"M14 2v5a1 1 0 0 0 1 1h5"}],["path",{"d":"M9 17v-2a2 2 0 0 0-4 0v2"}],["rect",{"width":"8","height":"5","x":"3","y":"17","rx":"1"}]],"eyeCheck":[["path",{"d":"M3 7V5a2 2 0 0 1 2-2h2"}],["path",{"d":"M17 3h2a2 2 0 0 1 2 2v2"}],["path",{"d":"M21 17v2a2 2 0 0 1-2 2h-2"}],["path",{"d":"M7 21H5a2 2 0 0 1-2-2v-2"}],["circle",{"cx":"12","cy":"12","r":"1"}],["path",{"d":"M18.944 12.33a1 1 0 0 0 0-.66 7.5 7.5 0 0 0-13.888 0 1 1 0 0 0 0 .66 7.5 7.5 0 0 0 13.888 0"}]],"receipt":[["path",{"d":"M12 17V7"}],["path",{"d":"M16 8h-6a2 2 0 0 0 0 4h4a2 2 0 0 1 0 4H8"}],["path",{"d":"M4 3a1 1 0 0 1 1-1 1.3 1.3 0 0 1 .7.2l.933.6a1.3 1.3 0 0 0 1.4 0l.934-.6a1.3 1.3 0 0 1 1.4 0l.933.6a1.3 1.3 0 0 0 1.4 0l.933-.6a1.3 1.3 0 0 1 1.4 0l.934.6a1.3 1.3 0 0 0 1.4 0l.933-.6A1.3 1.3 0 0 1 19 2a1 1 0 0 1 1 1v18a1 1 0 0 1-1 1 1.3 1.3 0 0 1-.7-.2l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.934.6a1.3 1.3 0 0 1-1.4 0l-.933-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-1.4 0l-.934-.6a1.3 1.3 0 0 0-1.4 0l-.933.6a1.3 1.3 0 0 1-.7.2 1 1 0 0 1-1-1z"}]],"calendar":[["path",{"d":"M8 2v3"}],["path",{"d":"M16 2v3"}],["rect",{"x":"3","y":"3","width":"18","height":"18","rx":"2"}],["path",{"d":"M3 9h18"}]],"database":[["ellipse",{"cx":"12","cy":"5","rx":"9","ry":"3"}],["path",{"d":"M3 5V19A9 3 0 0 0 21 19V5"}],["path",{"d":"M3 12A9 3 0 0 0 21 12"}]],"activity":[["path",{"d":"M22 12h-2.48a2 2 0 0 0-1.93 1.46l-2.35 8.36a.25.25 0 0 1-.48 0L9.24 2.18a.25.25 0 0 0-.48 0l-2.35 8.36A2 2 0 0 1 4.49 12H2"}]],"filter":[["path",{"d":"M2 5h20"}],["path",{"d":"M6 12h12"}],["path",{"d":"M9 19h6"}]]};
const SVG = 'http://www.w3.org/2000/svg';
function icon(name, cls = '') {
  const s = document.createElementNS(SVG, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: `icon ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' })) s.setAttribute(k, v);
  for (const [tag, attrs] of ICONS[name] || ICONS.info) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    s.append(n);
  }
  return s;
}

function toast(msg, { kind, timeout = 5000 } = {}) {
  const k = kind === 'error' ? 'error' : kind === 'info' ? 'info' : 'success';
  const el = h(`div.toast.${k}`, { role: k === 'error' ? 'alert' : 'status' }, icon(k === 'error' ? 'circleAlert' : k === 'info' ? 'info' : 'circleCheck'), h('span.grow', msg));
  const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); };
  el.append(h('button.icon-btn.toast-x', { type: 'button', 'aria-label': L('إغلاق', 'Close'), onclick: close }, icon('x', 'sm')));
  $('#toast')?.append(el);
  setTimeout(close, timeout);
}
const announce = (msg) => { const r = $('#live'); if (r) { r.textContent = ''; setTimeout(() => { r.textContent = msg; }, 30); } };

// Popover menu (GlassPopover): ↑ ↓ Home End Esc, closes on outside press / resize.
let closeOpenMenu = null;
function menu(anchor, items) {
  closeOpenMenu?.();
  const pop = h('div.popover.glass-4', { role: 'menu' });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { pop.append(h('div.menu-sep', { role: 'separator' })); continue; }
    if (it.title) { pop.append(h('div.menu-title', { role: 'presentation' }, it.title)); continue; }
    pop.append(h(`button.menu-item${it.danger ? '.danger' : ''}`, {
      type: 'button', role: it.checked != null ? 'menuitemradio' : 'menuitem', 'aria-checked': it.checked != null ? String(!!it.checked) : null,
      onclick: () => { close(); it.onClick?.(); },
    }, it.icon ? icon(it.icon) : null, h('span.grow', it.label), it.hint ? h('span.hint', it.hint) : null));
  }
  document.body.append(pop);
  const r = anchor.getBoundingClientRect(); const pr = pop.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  let left = rtl ? r.left : r.right - pr.width;
  left = Math.max(8, Math.min(left, innerWidth - pr.width - 8));
  let top = r.bottom + 6;
  if (top + pr.height > innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
  pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  pop.style.setProperty('--origin', `${top < r.top ? 'bottom' : 'top'} ${rtl ? 'left' : 'right'}`);
  anchor.setAttribute('aria-expanded', 'true');
  const list = () => $$('.menu-item', pop);
  const onKey = (e) => {
    const l = list(); const i = l.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); l[(i + 1) % l.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); l[(i - 1 + l.length) % l.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); l[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); l[l.length - 1]?.focus(); }
    else if (e.key === 'Tab') close();
  };
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  function close() {
    if (!pop.isConnected) return;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', close);
    pop.remove(); closeOpenMenu = null;
  }
  document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onDown, true); window.addEventListener('resize', close);
  setTimeout(() => (list().find((b) => b.getAttribute('aria-checked') === 'true') || list()[0])?.focus(), 20);
  closeOpenMenu = close;
}

// Segmented control: options [[value, label, count?]]
function segmented(options, value, onChange, { label } = {}) {
  const el = h('div.tabs', { role: 'tablist', 'aria-label': label || null });
  for (const [v, l, n] of options) {
    el.append(h(`button${v === value ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(v === value), 'data-fk': `seg:${v}`, onclick: () => onChange(v) },
      h('bdi', l), n != null ? h('span.count', fmtNum(n)) : null));
  }
  el.addEventListener('keydown', (e) => { // arrow keys move between segments
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const b = $$('button', el); const i = b.indexOf(document.activeElement); if (i < 0) return;
    const fwd = (e.key === 'ArrowLeft') === (document.documentElement.dir === 'rtl');
    b[(i + (fwd ? 1 : -1) + b.length) % b.length].focus(); e.preventDefault();
  });
  return el;
}

function skeleton(kind, n = 4) {
  const w = h('div.sk-wrap', { 'aria-busy': 'true', 'aria-label': L('جارٍ التحميل', 'Loading') });
  if (kind === 'stats') for (let i = 0; i < n; i++) w.append(h('div.card.stat', h('div.sk.sk-line.w-40'), h('div.sk.sk-num'), h('div.sk.sk-line.w-60')));
  else if (kind === 'rows') for (let i = 0; i < n; i++) w.append(h('div.sk.sk-row'));
  else w.append(h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-60'), h('div.sk.sk-line.w-40'));
  return w;
}
function emptyState({ icon: ic = 'inbox', title, body, actions = [], compact = false, error = false, tone } = {}) {
  return h(`div.empty-state${compact ? '.compact' : ''}${error ? '.error' : ''}${tone ? `.${tone}` : ''}`, { role: error ? 'alert' : null },
    h('div.es-icon', icon(ic)),
    title ? h('h3.es-title', title) : null,
    body ? h('p', body) : null,
    actions.length ? h('div.btn-group', actions.map((a) => h(`button.btn${a.primary ? '.primary' : a.tertiary ? '.tertiary' : ''}`, { type: 'button', onclick: a.onClick }, a.icon ? icon(a.icon) : null, a.label))) : null);
}
const errorState = (err, retry, { title } = {}) => emptyState({ icon: 'circleAlert', error: true, title: title || L('تعذّر التحميل', 'Could not load'), body: err?.message || String(err || ''), actions: retry ? [{ label: L('إعادة المحاولة', 'Try again'), icon: 'refresh', onClick: retry }] : [] });

const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/^(ال|آل)(?=\S{2,})/, ''));
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map((w) => w[0]).join(/[؀-ۿ]/.test(name) ? ' ' : '').toUpperCase();
};
const avatarTint = (name) => String([...String(name || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7) % 7);
const avatar = (name) => h('span.avatar', { 'data-tint': avatarTint(name), 'aria-hidden': 'true' }, initials(name));

// Keep keyboard focus across re-renders: interactive elements carry data-fk.
function keepFocus(fn) {
  const fk = document.activeElement?.closest?.('[data-fk]')?.dataset.fk;
  fn();
  if (fk) { const el = $$('[data-fk]').find((x) => x.dataset.fk === fk); el?.focus({ preventScroll: true }); }
}

// ---------- formatting ----------
const fmtNum = (n, max = 2) => (n == null ? '—' : new Intl.NumberFormat(NUM_LOC(), { maximumFractionDigits: max }).format(n));
const parseTs = (s) => new Date(/Z$|[+-]\d\d:?\d\d$/.test(String(s)) ? s : `${String(s).replace(' ', 'T')}Z`);
function fmtWhen(s) {
  const d = parseTs(s); const now = new Date();
  const dayNo = (x) => Math.floor(new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime() / 864e5);
  const diff = dayNo(now) - dayNo(d);
  const time = d.toLocaleTimeString(DATE_LOC(), { hour: '2-digit', minute: '2-digit' });
  const date = diff === 0 ? L('اليوم', 'Today') : diff === 1 ? L('أمس', 'Yesterday')
    : d.toLocaleDateString(DATE_LOC(), { day: 'numeric', month: 'short', ...(d.getFullYear() !== now.getFullYear() ? { year: 'numeric' } : {}) });
  return `${date} · ${time}`;
}
const fmtTime = (d) => d.toLocaleTimeString(DATE_LOC(), { hour: '2-digit', minute: '2-digit' });
const fmtFull = (s) => parseTs(s).toLocaleString(DATE_LOC(), { dateStyle: 'full', timeStyle: 'short' });
function fmtRel(s) {
  const sec = (parseTs(s).getTime() - Date.now()) / 1000; const a = Math.abs(sec);
  const rtf = new Intl.RelativeTimeFormat(lang === 'en' ? 'en' : 'ar', { numeric: 'auto' });
  if (a < 60) return L('الآن', 'Just now');
  if (a < 3600) return rtf.format(Math.round(sec / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(sec / 3600), 'hour');
  if (a < 86400 * 14) return rtf.format(Math.round(sec / 86400), 'day');
  return fmtWhen(s);
}
const when = (iso) => (iso ? h('time.when', { datetime: iso, title: fmtFull(iso) }, bdi(fmtWhen(iso))) : dash());
const dash = () => h('span.faint', { 'aria-label': L('غير متوفر', 'Not available') }, '—');

// Arabic counting (zero/one/two/few/many/other) via Intl.PluralRules.
const N = {
  records: { ar: { zero: 'لا سجلات', one: 'سجل واحد', two: 'سجلان', few: '# سجلات', many: '# سجلاً', other: '# سجل' }, en: { one: '# record', other: '# records' } },
  items: { ar: { zero: 'لا عناصر', one: 'عنصر واحد', two: 'عنصران', few: '# عناصر', many: '# عنصراً', other: '# عنصر' }, en: { one: '# item', other: '# items' } },
  chars: { ar: { zero: '0 حرف', one: 'حرف واحد', two: 'حرفان', few: '# أحرف', many: '# حرفاً', other: '# حرف' }, en: { one: '# character', other: '# characters' } },
  points: { ar: { one: 'بند واحد', two: 'بندان', few: '# بنود', many: '# بنداً', other: '# بند' }, en: { one: '# key point', other: '# key points' } },
};
function count(n, forms) {
  const f = forms[lang] || forms.ar;
  const cat = new Intl.PluralRules(lang === 'en' ? 'en' : 'ar').select(n);
  return (f[cat] ?? f.other).replace('#', fmtNum(n, 0));
}
function money(amount, currency) {
  if (amount == null || !Number.isFinite(Number(amount))) return null;
  const v = Number(amount); const frac = v % 1 ? 2 : 0;
  try {
    const parts = new Intl.NumberFormat(NUM_LOC(), { style: 'currency', currency: currency || 'AED', currencyDisplay: lang === 'en' ? 'code' : 'symbol', minimumFractionDigits: frac, maximumFractionDigits: 2 }).formatToParts(v);
    const unit = parts.filter((p) => p.type === 'currency').map((p) => p.value).join('').replace(/[‎‏]/g, '').replace(/\.$/, '');
    const num = parts.filter((p) => p.type !== 'currency' && p.type !== 'literal').map((p) => p.value).join('').replace(/[‎‏]/g, '');
    return { num, unit };
  } catch { return { num: fmtNum(v), unit: currency || '' }; }
}
const moneyEl = (amount, currency, cls = 'money') => {
  const m = money(amount, currency);
  return m ? h(`bdi.${cls}`, h('span.amt', m.num), m.unit ? h('span.unit', m.unit) : null) : dash();
};
function fmtSize(r) {
  if (r.size == null) return null;
  if (r.source === 'wajib') return count(r.size, N.chars); // Wajib items are text: size = characters
  const n = Number(r.size);
  if (n < 1024) return `${fmtNum(n, 0)} ${L('بايت', 'B')}`;
  if (n < 1048576) return `${fmtNum(n / 1024, 1)} ${L('ك.ب', 'KB')}`;
  return `${fmtNum(n / 1048576, 1)} ${L('م.ب', 'MB')}`;
}
const DEMO_RE = /^\s*\[(تجريبي|demo)\]\s*/i;
const isDemo = (s) => DEMO_RE.test(String(s || ''));
const stripDemo = (s) => String(s || '').replace(DEMO_RE, '');
const demoChip = () => h('span.chip.demo.tiny', L('تجريبي', 'Demo'));
const ROLE = { employee: ['موظف', 'Employee'], manager: ['مدير', 'Manager'], president: ['الرئيس', 'President'] };
const roleLabel = (r) => (ROLE[r] ? L(...ROLE[r]) : r || '');
// Common Wajib record kinds read naturally; unknown kinds show as sent.
const KIND = {
  invoice: ['فاتورة', 'فواتير', 'Invoice', 'Invoices'], payment: ['دفعة', 'مدفوعات', 'Payment', 'Payments'], budget: ['ميزانية', 'ميزانيات', 'Budget', 'Budgets'],
  record: ['سجل', 'سجلات', 'Record', 'Records'], expense: ['مصروف', 'مصروفات', 'Expense', 'Expenses'], revenue: ['إيراد', 'إيرادات', 'Revenue', 'Revenue'],
  transfer: ['تحويل', 'تحويلات', 'Transfer', 'Transfers'], contract: ['عقد', 'عقود', 'Contract', 'Contracts'], payroll: ['رواتب', 'رواتب', 'Payroll', 'Payroll'],
};
const kindLabel = (k, plural = false) => { const m = KIND[String(k || '').toLowerCase()]; return m ? L(m[plural ? 1 : 0], m[plural ? 3 : 2]) : (k || L('غير مصنّف', 'Uncategorised')); };
const SOURCE = { wajib: ['واجب', 'Wajib', 'inbox'], smart_uploader: ['Smart Uploader', 'Smart Uploader', 'upload'] };
const sourceLabel = (s) => (SOURCE[s] ? L(SOURCE[s][0], SOURCE[s][1]) : s);

// ---------- API (same origin only) ----------
const ERR = {
  unauthenticated: () => L('انتهت جلسة Vault.', 'Your Vault session has ended.'),
  not_found: () => L('العنصر غير متاح ضمن نطاقك، ربما أُزيل.', 'This item is not available in your scope — it may have been removed.'),
  csrf: () => L('رُفض الطلب لحماية الجلسة. حدّث الصفحة ثم أعد المحاولة.', 'The request was blocked to protect your session. Reload and try again.'),
};
async function api(p, o = {}) {
  let r;
  try { r = await fetch(`/api${p}`, { ...o, headers: { 'x-requested-with': 'vault', 'content-type': 'application/json' } }); }
  catch { throw Object.assign(new Error(L('تعذّر الوصول إلى خادم Vault. تحقّق من الاتصال ثم أعد المحاولة.', 'Could not reach the Vault server. Check your connection and try again.')), { offline: true }); }
  const b = await r.json().catch(() => ({}));
  const fallback = r.status >= 500 ? L('خدمة Vault غير متاحة مؤقتاً — أعد المحاولة بعد لحظات.', 'Vault is temporarily unavailable — try again in a moment.') : b.error || L(`تعذّر إتمام الطلب (${r.status})`, `The request could not be completed (${r.status})`);
  if (!r.ok) throw Object.assign(new Error(b.message || ERR[b.error]?.() || fallback), { status: r.status, code: b.error });
  return b;
}

// ---------- state ----------
const viewFromPath = () => (location.pathname.includes('marsad') ? 'marsad' : 'fs');
const freshFs = () => ({ rows: null, sum: null, q: '', kind: 'all', sort: ['received_at', 'desc'], loadedAt: null, newIds: new Set() });
const freshMarsad = () => ({ rows: null, q: '', source: 'all', sort: ['received_at', 'desc'], loadedAt: null, newIds: new Set(), sums: new Map(), open: new Set() });
const state = { me: null, view: viewFromPath(), seq: 0, animate: true, sealed: false, fs: freshFs(), marsad: freshMarsad() };

const VIEWS = {
  fs: { icon: 'wallet', label: () => L('السجلات المالية', 'Financial records'), sub: () => 'FS', short: () => L('السجلات', 'Records') },
  marsad: { icon: 'radar', label: () => L('مرصاد', 'Marsad'), sub: () => L('العناصر الواردة', 'Incoming items'), short: () => L('مرصاد', 'Marsad') },
};
// Mirrors Vault's server-side scopes (fsScope / marsadScope) so people know why they see what they see.
function scopeText(view, u = state.me?.user) {
  if (!u) return '';
  if (u.role === 'president') return L('كل الأقسام', 'All departments');
  if (view === 'fs') return L('سجلات قسمك', 'Your department’s records');
  return u.role === 'manager' ? L('قسمك وما رفعته أنت', 'Your department and your own uploads') : L('ما رفعته أنت فقط', 'Only what you uploaded');
}

// ---------- shell ----------
function navLink(key, cls) {
  const v = VIEWS[key];
  return h(`a.${cls}`, { href: `/${key}`, 'data-nav': key, onclick: onNav },
    icon(v.icon), cls === 'tab' ? h('span', v.short()) : h('span.label', h('span.nl-title', v.label()), h('span.nl-sub', bdi(v.sub()))));
}
function onNav(e) {
  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const key = e.currentTarget.dataset.nav;
  e.preventDefault();
  if (key === state.view && location.pathname !== '/') { $('#page h1')?.focus(); return; }
  history.pushState(null, '', `/${key}`);
  go(key, { focus: true });
}
window.addEventListener('popstate', () => go(viewFromPath()));

function buildShell() {
  const app = $('#app');
  app.removeAttribute('aria-busy');
  app.replaceChildren(
    h('a.skip', { href: '#content' }, L('تخطَّ إلى المحتوى', 'Skip to content')),
    h('aside.v-side.glass-3', { 'aria-label': L('Vault — التنقل وحالة العزل', 'Vault — navigation and isolation status') },
      h('div.v-brand', h('span.v-mark', icon('lockKeyhole')), h('span.v-brand-text', h('b', 'Vault'), h('small', L('منصة العمل الذكية', 'Smart Work Platform')))),
      h('span.chip.vault.iso-chip', icon('shield'), L('بيئة معزولة', 'Isolated environment')),
      h('nav.v-nav', { 'aria-label': L('أقسام Vault', 'Vault sections') }, navLink('fs', 'item'), navLink('marsad', 'item')),
      h('section#iso.iso', { 'aria-labelledby': 'iso-title' }),
      h('div.v-foot', h('div#user-slot'))),
    h('header.m-bar.glass-3',
      h('span.v-mark.sm', icon('lockKeyhole')), h('b.m-title', 'Vault'),
      h('span.chip.vault.tiny', icon('shield'), L('بيئة معزولة', 'Isolated')),
      h('span.spacer'), h('div#m-user-slot')),
    h('main#content.v-main', { tabindex: '-1' }, h('div#page.page')),
    h('nav.tabbar.glass-3', { 'aria-label': L('أقسام Vault', 'Vault sections') }, navLink('fs', 'tab'), navLink('marsad', 'tab')),
  );
  renderIso(); renderUser();
}
function renderNav() {
  $$('[data-nav]').forEach((a) => {
    const on = a.dataset.nav === state.view;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}
function renderIso() {
  const box = $('#iso'); if (!box) return;
  const me = state.me;
  const row = (ic, title, meta) => h('li', h('span.iso-ic', icon(ic)), h('span.iso-text', h('b', title), h('span', meta)));
  if (!me) { box.replaceChildren(h('div.sk.sk-line.w-60'), h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-40')); return; }
  const allow = me.egress_allow || [];
  box.replaceChildren(
    h('div.iso-head', h('h2#iso-title', L('حالة العزل', 'Isolation status')), h('span.iso-live', h('span.dot.live', { 'aria-hidden': 'true' }), L('نشطة', 'Active'))),
    h('p.iso-note', L('البيانات والنتائج ومخرجات الذكاء الاصطناعي هنا تبقى داخل Vault. المعالجة تتم بخدمات داخلية فقط، ولا اتصال بخدمات خارجية.', 'Data, results and AI output here stay inside Vault. Processing uses internal services only — no connection to external services.')),
    h('ul.iso-list',
      row('unplug', L('لا اتصال بخدمات خارجية', 'No external connections'), allow.length ? [L('مسموح داخلياً فقط: ', 'Internal only: '), bdi(allow.join('، '))] : L('لا توجد وجهات خارجية مسموح بها', 'No external destinations allowed')),
      row('sparkle', me.local_ai === 'extractive' ? L('ذكاء داخلي: تلخيص محلي', 'Internal AI: local summarizer') : L('ذكاء داخلي: نموذج داخلي', 'Internal AI: internal model'), me.local_ai === 'extractive' ? L('يعمل داخل Vault دون أي نموذج خارجي', 'Runs inside Vault, no external model') : L('نموذج مستضاف داخل البيئة المعزولة', 'A model hosted inside the isolated environment')),
      row('eye', L('نطاق اطلاعك', 'Your access scope'), scopeText(state.view)),
      row('fingerprint', L('دخول موحّد', 'Single sign-on'), L('جلسة Vault مستقلة عن المنصة', 'A Vault session separate from the portal'))));
}
function renderUser() {
  const u = state.me?.user;
  const slots = [['#user-slot', 'full'], ['#m-user-slot', 'compact']];
  for (const [sel, mode] of slots) {
    const slot = $(sel); if (!slot) continue;
    if (!u && !state.meFailed) { slot.replaceChildren(h('div.user-card.is-skeleton', h('span.sk.sk-circle'), mode === 'full' ? h('span.grow', h('div.sk.sk-line.w-60')) : null)); continue; }
    if (!u) { slot.replaceChildren(h(`button.user-card${mode === 'compact' ? '.compact' : ''}`, { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': L('حسابك في Vault', 'Your Vault account'), onclick: (e) => userMenu(e.currentTarget) }, h('span.avatar', icon('lock', 'sm')), mode === 'full' ? h('span.who', h('span.name', L('حسابك في Vault', 'Your Vault account'))) : null)); continue; }
    const name = L(u.name_ar, u.name_en || u.name_ar);
    const btn = h(`button.user-card${mode === 'compact' ? '.compact' : ''}`, { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': L(`حسابك في Vault: ${name}، ${roleLabel(u.role)}`, `Your Vault account: ${name}, ${roleLabel(u.role)}`), 'data-fk': `user:${mode}`, onclick: (e) => userMenu(e.currentTarget) },
      avatar(name),
      mode === 'full' ? h('span.who', h('span.name', bdi(name)), h('span.role', roleLabel(u.role))) : null,
      mode === 'full' ? icon('chevronDown', 'sm chev') : null);
    slot.replaceChildren(btn);
  }
}
function userMenu(anchor) {
  const mode = themeMode();
  const setTheme = (m) => { applyTheme(m); toast(m === 'dark' ? L('المظهر الداكن مفعّل في Vault', 'Dark appearance on in Vault') : m === 'light' ? L('المظهر الفاتح مفعّل في Vault', 'Light appearance on in Vault') : L('يتبع Vault مظهر جهازك', 'Vault now follows your device appearance'), { kind: 'info', timeout: 2500 }); };
  menu(anchor, [
    { title: L('المظهر', 'Appearance') },
    { label: L('تلقائي (حسب الجهاز)', 'Automatic (device)'), icon: 'monitor', checked: mode === 'system', onClick: () => setTheme('system') },
    { label: L('فاتح', 'Light'), icon: 'sun', checked: mode === 'light', onClick: () => setTheme('light') },
    { label: L('داكن', 'Dark'), icon: 'moon', checked: mode === 'dark', onClick: () => setTheme('dark') },
    { sep: true },
    { label: lang === 'ar' ? 'English' : 'العربية', icon: 'languages', hint: lang === 'ar' ? 'EN' : 'ع', onClick: () => { lang = lang === 'ar' ? 'en' : 'ar'; store.set('swp.lang', lang); applyLang(); rerenderAll(); } },
    { sep: true },
    { label: L('إغلاق Vault والعودة إلى المنصة', 'Close Vault and return to the portal'), icon: 'ext', onClick: backToPortal },
    { label: L('إنهاء جلسة Vault', 'End Vault session'), icon: 'logout', danger: true, onClick: endSession },
  ]);
}
function backToPortal() {
  window.close(); // Vault opens in its own window from the portal
  setTimeout(() => { if (!window.closed) toast(L('أغلق هذه النافذة للعودة إلى المنصة — لا يبقى أي محتوى من Vault خارجها.', 'Close this window to return to the portal — no Vault content leaves it.'), { kind: 'info', timeout: 7000 }); }, 250);
}
async function endSession() {
  try { await fetch('/logout', { method: 'POST', redirect: 'manual', credentials: 'same-origin' }); } catch { /* the cookie is cleared either way on the next load */ }
  state.me = null; state.fs = freshFs(); state.marsad = freshMarsad(); // drop everything held in memory
  sealedScreen({
    icon: 'lock', title: L('أُنهيت جلسة Vault', 'Vault session ended'),
    body: L('لم تعد هذه النافذة تعرض أي بيانات. يمكنك إغلاقها، أو الدخول مجدداً عبر الدخول الموحّد.', 'This window no longer shows any data. Close it, or sign in again with single sign-on.'),
  });
}
function sessionExpired() {
  state.me = null;
  sealedScreen({
    icon: 'lockKeyhole', title: L('انتهت جلسة Vault', 'Your Vault session has ended'),
    body: L('لحماية البيانات تنتهي جلسة Vault تلقائياً. ادخل مجدداً عبر الدخول الموحّد لتتابع من حيث توقفت.', 'Vault sessions end automatically to protect the data. Sign in again with single sign-on to pick up where you left off.'),
  });
}
function sealedScreen({ icon: ic, title, body }) {
  closeOpenMenu?.(); state.sealed = true; state.seq++;
  const next = `/${state.view}`;
  $('#app').replaceChildren(h('main.sealed', h('section.sealed-card.glass-4', { role: 'alert' },
    h('span.v-mark.lg', icon(ic)),
    h('h1', title), h('p', body),
    h('div.btn-group',
      h('button.btn.primary.lg', { type: 'button', onclick: () => location.assign(`/sso/start?next=${encodeURIComponent(next)}`) }, icon('fingerprint'), L('الدخول مجدداً', 'Sign in again')),
      h('button.btn.lg', { type: 'button', onclick: backToPortal }, icon('x'), L('إغلاق النافذة', 'Close window'))))));
  document.title = `Vault — ${title}`;
  setTimeout(() => $('.sealed .btn.primary')?.focus(), 30);
}

// ---------- page scaffolding ----------
function pageHead(view, actions = []) {
  const v = VIEWS[view];
  const title = view === 'marsad' ? L('مرصاد — العناصر الواردة', 'Marsad — Incoming items') : L('السجلات المالية', 'Financial records');
  const sub = view === 'marsad'
    ? [L('تصل من «واجب» ومن ', 'Arriving from Wajib and '), bdi('Smart Uploader'), L('. لخّص أي عنصر نصي داخل Vault — لا يغادر المحتوى البيئة المعزولة.', '. Summarize any text item inside Vault — the content never leaves the isolated environment.')]
    : [L('سجلات تصل من «واجب» في اتجاه واحد وتبقى داخل Vault.', 'Records arrive from Wajib one way and stay inside Vault.'), scopeText('fs') ? [' ', L('النطاق: ', 'Scope: '), scopeText('fs'), '.'] : null];
  return h('header.page-head',
    h('div.ph-text',
      h('span.eyebrow', icon('lock', 'sm'), h('span', bdi('Vault'), ' · ', v.label())),
      h('h1', { tabindex: '-1' }, title, view === 'fs' ? [' ', h('span.chip.outline.ph-tag', bdi('FS'))] : null),
      h('p.sub', sub)),
    h('div#ph-actions.actions', actions));
}
const refreshBtn = () => h('button.btn', { type: 'button', 'data-fk': 'refresh', onclick: (e) => refresh(e.currentTarget) }, icon('refresh'), L('تحديث', 'Refresh'));
const isoCallout = () => h('div.callout.vault.iso-callout', icon('shield'),
  h('span', L('تبقى البيانات ومخرجات الذكاء الاصطناعي داخل Vault — المعالجة داخلية فقط، ولا اتصال بخدمات خارجية.', 'Data and AI output stay inside Vault — internal processing only, no external connections.')));
function stat({ icon: ic, label, value, unit, foot, cls = '', valueCls = '' }) {
  return h(`div.card.stat${cls ? `.${cls}` : ''}`,
    h('div.stat-label', h('span.stat-ic', icon(ic)), h('span', label)),
    h(`div.stat-value${valueCls ? `.${valueCls}` : ''}`, value, unit ? h('span.stat-unit', unit) : null),
    foot ? h('div.stat-foot', foot) : null);
}
function listCard({ id, title, n, total, tools, body, foot }) {
  return h('section.card.list-card', { 'aria-labelledby': `${id}-title` },
    h('div.lc-head',
      h('h2.card-title', { id: `${id}-title` }, title, h('span#lc-count.count', { 'aria-live': 'polite' }, n === total ? fmtNum(total, 0) : L(`${fmtNum(n, 0)} من ${fmtNum(total, 0)}`, `${fmtNum(n, 0)} of ${fmtNum(total, 0)}`))),
      h('div.lc-tools', tools)),
    h('div#lc-body.lc-body', body),
    foot ? h('div.card-foot', foot) : null);
}
function searchBox(view, placeholder) {
  const V = state[view];
  const input = h('input.field', { type: 'search', value: V.q, placeholder, 'aria-label': placeholder, 'data-fk': 'search', autocomplete: 'off', spellcheck: 'false' });
  let tm;
  input.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { V.q = input.value.trim(); renderList(); }, 120); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; V.q = ''; renderList(); } });
  return h('div.search-field', icon('search'), input, h('kbd.sf-kbd', { 'aria-hidden': 'true' }, '/'));
}
function sortableTable({ columns, rows, sort, onSort, caption, cls = '', rowAttrs, after }) {
  const [key, dir] = sort;
  const col = columns.find((c) => c.key === key);
  const sorted = col?.sort ? [...rows].sort((a, b) => { const x = col.sort(a); const y = col.sort(b); const r = x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0; return x == null || y == null ? r : dir === 'asc' ? r : -r; }) : rows;
  const thead = h('thead', h('tr', columns.map((c) => {
    const active = c.key === key;
    if (!c.sort) return h(`th${c.num ? '.num' : ''}`, { scope: 'col', class: c.cls || null }, c.hideLabel ? h('span.sr-only', c.label) : c.label);
    const act = () => onSort(active ? [c.key, dir === 'asc' ? 'desc' : 'asc'] : [c.key, c.defaultDir || 'asc']);
    return h(`th.sortable${c.num ? '.num' : ''}`, { scope: 'col', class: c.cls || null, 'aria-sort': active ? (dir === 'asc' ? 'ascending' : 'descending') : 'none' },
      h('button.th-btn', { type: 'button', 'data-fk': `sort:${c.key}`, onclick: act }, c.label, h('span.sort-ind', icon(active ? (dir === 'asc' ? 'sortUp' : 'sortDown') : 'sort', 'sm'))));
  })));
  const tbody = h('tbody');
  sorted.forEach((r, i) => {
    const attrs = rowAttrs?.(r, i) || {};
    tbody.append(h('tr', attrs, columns.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h(`td${c.num ? '.num' : ''}`, { class: c.cls || null, 'data-label': c.label }, v ?? dash()); })));
    const extra = after?.(r); if (extra) tbody.append(extra);
  });
  return h('div.table-wrap', h(`table.tbl.stack${cls ? `.${cls}` : ''}`, caption ? h('caption.sr-only', caption) : null, thead, tbody));
}
const enterAttrs = (i) => (state.animate ? { class: 'enter', style: `animation-delay:${Math.min(i, 12) * 28}ms` } : {});

// ---------- FS ----------
function fsFiltered() {
  const F = state.fs; const q = F.q.toLowerCase();
  return (F.rows || []).filter((r) => (F.kind === 'all' || r.kind === F.kind) && (!q || [r.title, r.kind, kindLabel(r.kind), r.period].some((v) => String(v || '').toLowerCase().includes(q))));
}
function renderFs() {
  const F = state.fs; const page = $('#page');
  const rows = F.rows; const sum = F.sum || [];
  const total = sum.reduce((a, s) => a + (s.n || 0), 0) || rows.length;
  const parts = [pageHead('fs', [refreshBtn()]), isoCallout()];
  if (!rows.length) {
    parts.push(h('section.card.empty-card', emptyState({
      icon: 'inboxEmpty', title: L('لا توجد سجلات ضمن نطاقك', 'No records in your scope yet'),
      body: L(`تصل السجلات المالية من «واجب» تلقائياً في اتجاه واحد، وتظهر هنا فور وصولها. نطاق اطلاعك: ${scopeText('fs')}.`, `Financial records arrive from Wajib automatically, one way, and appear here as soon as they land. Your scope: ${scopeText('fs')}.`),
      actions: [{ label: L('تحقّق من وصول سجلات جديدة', 'Check for new records'), icon: 'refresh', tertiary: true, onClick: (e) => refresh(e.currentTarget) }],
    })));
    page.replaceChildren(...parts); return;
  }
  const latest = rows[0]?.received_at;
  const tiles = [stat({ icon: 'database', label: L('إجمالي السجلات', 'Total records'), value: fmtNum(total, 0), foot: latest ? [L('آخر استلام ', 'Last received '), h('time', { datetime: latest, title: fmtFull(latest) }, fmtRel(latest))] : null, cls: 'primary-stat' })];
  const byKind = new Map(); // one tile per kind; extra currencies listed under the lead one
  for (const s of sum) { const k = s.kind || ''; byKind.set(k, [...(byKind.get(k) || []), s]); }
  const groups = [...byKind.entries()].map(([kind, list]) => ({ kind, n: list.reduce((a, s) => a + (s.n || 0), 0), list: [...list].sort((a, b) => (b.n || 0) - (a.n || 0) || Math.abs(b.total || 0) - Math.abs(a.total || 0)) }))
    .sort((a, b) => b.n - a.n);
  for (const g of groups) {
    const [lead, ...more] = g.list;
    const m = money(lead.total || 0, lead.currency) || { num: fmtNum(lead.total || 0), unit: lead.currency || '' };
    tiles.push(stat({
      icon: 'coins', label: bdi(kindLabel(g.kind, true)), value: bdi(m.num), unit: m.unit ? bdi(m.unit) : null, valueCls: 'money-value',
      foot: [h('span', count(g.n, N.records)), ...more.map((x) => { const mm = money(x.total || 0, x.currency); return mm ? h('span.more-cur', '+ ', h('bdi', h('b', mm.num), ' ', mm.unit)) : null; })],
    }));
  }
  parts.push(h('div.stats.money-stats', { role: 'list', 'aria-label': L('ملخص السجلات', 'Records summary') }, tiles.map((t, i) => { t.setAttribute('role', 'listitem'); if (state.animate) { t.classList.add('enter'); t.style.animationDelay = `${i * 40}ms`; } return t; })));
  const kinds = [...new Set(rows.map((r) => r.kind).filter(Boolean))];
  const tools = [
    kinds.length > 1 ? segmented([['all', L('الكل', 'All'), rows.length], ...kinds.map((k) => [k, kindLabel(k, true), rows.filter((r) => r.kind === k).length])], F.kind, (v) => { F.kind = v; renderList(); }, { label: L('تصفية حسب النوع', 'Filter by type') }) : null,
    searchBox('fs', L('ابحث في العنوان أو النوع أو الفترة…', 'Search title, type or period…')),
  ];
  const n = fsFiltered().length;
  parts.push(listCard({ id: 'fs-list', title: L('السجلات الواردة', 'Incoming records'), n, total: rows.length, tools, body: fsTable(), foot: listFoot(rows.length) }));
  page.replaceChildren(...parts);
}
function fsTable() {
  const F = state.fs; const rows = fsFiltered();
  if (!rows.length) return noMatches('fs');
  return sortableTable({
    caption: L('السجلات المالية الواردة من «واجب»', 'Financial records received from Wajib'), cls: 'fs-table', sort: F.sort, onSort: (s) => { F.sort = s; renderList(); },
    rowAttrs: (r, i) => ({ ...enterAttrs(i), class: [state.animate ? 'enter' : '', F.newIds.has(r.id) ? 'is-new' : ''].filter(Boolean).join(' ') || null }),
    columns: [
      { key: 'title', label: L('العنوان', 'Title'), cls: 'c-title', sort: (r) => stripDemo(r.title).toLowerCase(), render: (r) => h('div.cell-title', h('span.ft-ic', icon('receipt')), h('span.ct-text', h('bdi.ct-name', stripDemo(r.title) || L('بلا عنوان', 'Untitled')), isDemo(r.title) ? demoChip() : null)) },
      { key: 'kind', label: L('النوع', 'Type'), cls: 'c-meta c-kind', sort: (r) => kindLabel(r.kind), render: (r) => (r.kind ? h('span.chip', { title: r.kind }, bdi(kindLabel(r.kind))) : null) },
      { key: 'period', label: L('الفترة', 'Period'), cls: 'c-meta', sort: (r) => r.period || null, render: (r) => (r.period ? bdi(r.period, 'nowrap') : null) },
      { key: 'amount', label: L('المبلغ', 'Amount'), cls: 'c-amount', num: true, defaultDir: 'desc', sort: (r) => (r.amount == null ? null : Number(r.amount)), render: (r) => moneyEl(r.amount, r.currency) },
      { key: 'received_at', label: L('وقت الاستلام', 'Received'), cls: 'c-meta c-when', defaultDir: 'desc', sort: (r) => r.received_at, render: (r) => when(r.received_at) },
    ],
    rows,
  });
}

// ---------- Marsad ----------
const titleOf = (r) => stripDemo(r.title || r.filename) || L('بلا عنوان', 'Untitled');
function marsadFiltered() {
  const M = state.marsad; const q = M.q.toLowerCase();
  return (M.rows || []).filter((r) => (M.source === 'all' || r.source === M.source) && (!q || [r.title, r.filename].some((v) => String(v || '').toLowerCase().includes(q))));
}
const nextItem = () => (state.marsad.rows || []).find((r) => r.has_text && !state.marsad.sums.has(r.id));
function marsadActions() {
  const nx = nextItem();
  const done = [...state.marsad.sums.values()].filter((s) => s.state === 'done').length;
  return [refreshBtn(), nx ? h('button.btn.primary.next-btn', { type: 'button', 'data-fk': 'next', onclick: () => summarizeNext() }, icon('sparkle'), done ? L('لخّص العنصر التالي', 'Summarize the next item') : L('لخّص أحدث عنصر', 'Summarize the newest item')) : null];
}
function renderMarsad() {
  const M = state.marsad; const page = $('#page'); const rows = M.rows;
  const parts = [pageHead('marsad', marsadActions()), isoCallout()];
  if (!rows.length) {
    parts.push(h('section.card.empty-card', emptyState({
      icon: 'inboxEmpty', title: L('لا توجد عناصر ضمن نطاقك', 'No items in your scope yet'),
      body: [L('تصل العناصر من «واجب» ومن ', 'Items arrive from Wajib and from '), bdi('Smart Uploader'), L(` في المنصة، وتظهر هنا فور وصولها. نطاق اطلاعك: ${scopeText('marsad')}.`, ` in the portal, and appear here as soon as they land. Your scope: ${scopeText('marsad')}.`)],
      actions: [{ label: L('تحقّق من وصول عناصر جديدة', 'Check for new items'), icon: 'refresh', tertiary: true, onClick: (e) => refresh(e.currentTarget) }],
    })));
    page.replaceChildren(...parts); return;
  }
  const bySrc = (s) => rows.filter((r) => r.source === s).length;
  const latest = rows[0]?.received_at;
  const srcFoot = Object.keys(SOURCE).filter((s) => bySrc(s)).map((s) => h('span.src-count', bdi(sourceLabel(s)), ' ', h('b', fmtNum(bySrc(s), 0))));
  parts.push(h('div.stats', { role: 'list', 'aria-label': L('ملخص مرصاد', 'Marsad summary') },
    [stat({ icon: 'radar', label: L('العناصر الواردة', 'Incoming items'), value: fmtNum(rows.length, 0), foot: srcFoot, cls: 'primary-stat.src-stat' }),
      h('div#progress-slot.card.stat'),
      stat({ icon: 'clock', label: L('آخر استلام', 'Last received'), value: latest ? h('time', { datetime: latest, title: fmtFull(latest) }, fmtRel(latest)) : '—', foot: latest ? bdi(fmtWhen(latest)) : null, valueCls: 'text-value' })]
      .map((t, i) => { t.setAttribute('role', 'listitem'); if (state.animate) { t.classList.add('enter'); t.style.animationDelay = `${i * 40}ms`; } return t; })));
  const srcs = Object.keys(SOURCE).filter((s) => bySrc(s));
  const tools = [
    srcs.length > 1 ? segmented([['all', L('الكل', 'All'), rows.length], ...srcs.map((s) => [s, sourceLabel(s), bySrc(s)])], M.source, (v) => { M.source = v; renderList(); }, { label: L('تصفية حسب المصدر', 'Filter by source') }) : null,
    searchBox('marsad', L('ابحث بالعنوان أو اسم الملف…', 'Search by title or file name…')),
  ];
  parts.push(listCard({ id: 'ms-list', title: L('العناصر', 'Items'), n: marsadFiltered().length, total: rows.length, tools, body: marsadTable(), foot: listFoot(rows.length) }));
  page.replaceChildren(...parts);
  renderProgress();
}
function renderProgress() {
  const slot = $('#progress-slot'); if (!slot) return;
  const M = state.marsad; const text = (M.rows || []).filter((r) => r.has_text);
  const done = text.filter((r) => M.sums.get(r.id)?.state === 'done').length;
  const pct = text.length ? Math.round((done / text.length) * 100) : 0;
  const tile = stat({
    icon: 'sparkle', label: L('قابلة للتلخيص داخل Vault', 'Summarizable inside Vault'), value: fmtNum(text.length, 0), cls: 'progress-stat',
    foot: text.length ? [h('div.progress', { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(text.length), 'aria-valuenow': String(done), 'aria-label': L('تقدّم التلخيص في هذه الجلسة', 'Summaries this session') }, h('i', { style: `width:${pct}%` })),
      h('span.stat-hint', done ? L(`لخّصت ${fmtNum(done, 0)} من ${fmtNum(text.length, 0)} في هذه الجلسة`, `${fmtNum(done, 0)} of ${fmtNum(text.length, 0)} summarized this session`) : L('ابدأ بأحدث عنصر — المعالجة داخلية بالكامل', 'Start with the newest item — processing stays internal'))]
      : L('لا نصوص قابلة للتلخيص حالياً', 'No summarizable text right now'),
  });
  tile.setAttribute('role', 'listitem'); tile.id = 'progress-slot';
  if (slot.classList.contains('enter')) { tile.classList.add('enter'); tile.style.animationDelay = slot.style.animationDelay; }
  slot.replaceWith(tile);
}
function marsadTable() {
  const M = state.marsad; const rows = marsadFiltered();
  if (!rows.length) return noMatches('marsad');
  return sortableTable({
    caption: L('عناصر مرصاد الواردة', 'Incoming Marsad items'), cls: 'ms-table', sort: M.sort, onSort: (s) => { M.sort = s; renderList(); },
    rowAttrs: (r, i) => ({ 'data-id': r.id, ...enterAttrs(i), class: [state.animate ? 'enter' : '', M.newIds.has(r.id) ? 'is-new' : '', M.open.has(r.id) && M.sums.has(r.id) ? 'has-sum' : ''].filter(Boolean).join(' ') || null }),
    columns: [
      { key: 'title', label: L('العنوان', 'Title'), cls: 'c-title', sort: (r) => titleOf(r).toLowerCase(), render: (r) => h('div.cell-title', h(`span.ft-ic${r.has_text ? '.text' : ''}`, icon(r.has_text ? 'fileText' : 'fileLock')), h('span.ct-text', h('bdi.ct-name', titleOf(r)), isDemo(r.title || r.filename) ? demoChip() : null, r.filename && r.title && r.filename !== r.title ? h('bdi.ct-sub', r.filename) : null)) },
      { key: 'source', label: L('المصدر', 'Source'), cls: 'c-meta', sort: (r) => r.source, render: (r) => h('span.chip.src', icon(SOURCE[r.source]?.[2] || 'inbox'), bdi(sourceLabel(r.source))) },
      { key: 'size', label: L('الحجم', 'Size'), cls: 'c-meta c-size', num: true, defaultDir: 'desc', sort: (r) => (r.size == null ? null : Number(r.size)), render: (r) => { const s = fmtSize(r); return s ? h('span.nowrap', s) : null; } },
      { key: 'received_at', label: L('الاستلام', 'Received'), cls: 'c-meta c-when', defaultDir: 'desc', sort: (r) => r.received_at, render: (r) => when(r.received_at) },
      { key: 'act', label: L('الإجراء', 'Action'), cls: 'c-act', render: actionCell },
    ],
    rows,
    after: (r) => (M.open.has(r.id) && M.sums.has(r.id) ? h('tr.sum-row', h('td', { colspan: '5' }, summaryPanel(r, M.sums.get(r.id)))) : null),
  });
}
function actionCell(r) {
  const M = state.marsad; const s = M.sums.get(r.id);
  if (!r.has_text) return h('span.chip.outline.no-text', { title: L('ملف بلا نص قابل للاستخراج — يبقى محفوظاً داخل Vault', 'A file with no extractable text — kept safely inside Vault') }, icon('fileLock'), L('لا نص للتلخيص', 'No text to summarize'));
  if (s?.state === 'done') {
    const open = M.open.has(r.id);
    return h('button.btn.sm.ghost.sum-toggle', { type: 'button', 'aria-expanded': String(open), 'aria-controls': `sum-${r.id}`, 'data-fk': `sum:${r.id}`, onclick: () => { open ? M.open.delete(r.id) : M.open.add(r.id); renderList(); } },
      icon(open ? 'chevronUp' : 'chevronDown'), open ? L('إخفاء الملخص', 'Hide summary') : L('عرض الملخص', 'Show summary'));
  }
  const loading = s?.state === 'loading';
  return h(`button.btn.sm.tertiary.sum-btn${loading ? '.is-loading' : ''}`, { type: 'button', 'aria-disabled': loading ? 'true' : null, 'aria-busy': loading ? 'true' : null, 'data-fk': `sum:${r.id}`, onclick: () => summarize(r) },
    icon('sparkle'), L('تلخيص داخل Vault', 'Summarize inside Vault'));
}
function summaryPanel(r, s) {
  const id = `sum-${r.id}`;
  if (s.state === 'loading') {
    return h('section.sum-panel.is-loading', { id, 'aria-busy': 'true', 'aria-label': L(`جارٍ تلخيص «${titleOf(r)}»`, `Summarizing “${titleOf(r)}”`) },
      h('div.sum-head', h('span.sum-ic', h('span.spinner')), h('span.sum-title', L('جارٍ التلخيص داخل Vault…', 'Summarizing inside Vault…'))),
      h('div.sum-sk', h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-60'), h('div.sk.sk-line.w-40')));
  }
  if (s.state === 'error') {
    return h('section.sum-panel.is-error', { id, role: 'alert' },
      h('div.sum-head', h('span.sum-ic', icon('circleAlert')), h('span.sum-title', L('تعذّر التلخيص', 'Could not summarize')), h('span.spacer'),
        h('button.btn.sm', { type: 'button', 'data-fk': `retry:${r.id}`, onclick: () => summarize(r) }, icon('refresh'), L('إعادة المحاولة', 'Try again'))),
      h('p.sum-msg', s.message));
  }
  const method = s.method === 'extractive' ? L('تلخيص محلي داخل Vault', 'Local summary inside Vault') : L('نموذج داخلي داخل Vault', 'Internal model inside Vault');
  return h(`section.sum-panel${s.fresh ? '.fresh' : ''}`, { id, 'aria-labelledby': `${id}-t` },
    h('div.sum-head',
      h('span.sum-ic', icon('sparkle')),
      h('span.sum-title', { id: `${id}-t` }, L('ملخص', 'Summary'), ' · ', h('bdi', titleOf(r))),
      h('span.chip.vault.tiny', icon('lock'), method),
      h('span.spacer'),
      h('time.sum-time', { datetime: s.at, title: fmtFull(s.at) }, fmtRel(s.at))),
    s.points.length ? h('ol.sum-points', s.points.map((p) => h('li', h('bdi', p))))
      : h('p.sum-msg', L('لم يُستخرج ملخص من هذا النص — قد يكون قصيراً جداً.', 'No summary could be extracted — the text may be too short.')),
    h('div.sum-foot',
      h('span.sum-note', icon('shield', 'sm'), L('لا يغادر هذا الملخص Vault ولا يُرسل إلى أي خدمة خارجية.', 'This summary never leaves Vault and is not sent to any external service.')),
      h('button.btn.sm.ghost', { type: 'button', 'data-fk': `again:${r.id}`, onclick: () => summarize(r) }, icon('refresh'), L('تلخيص مجدداً', 'Summarize again'))));
}
async function summarize(r) {
  const M = state.marsad;
  if (M.sums.get(r.id)?.state === 'loading') return; // no duplicate POSTs
  M.sums.set(r.id, { state: 'loading' }); M.open.add(r.id);
  renderList(); updateHead();
  announce(L(`جارٍ تلخيص «${titleOf(r)}» داخل Vault`, `Summarizing “${titleOf(r)}” inside Vault`));
  try {
    const out = await api(`/marsad/${encodeURIComponent(r.id)}/summarize`, { method: 'POST' });
    if (state.sealed) return;
    const points = Array.isArray(out.points) ? out.points : [];
    M.sums.set(r.id, { state: 'done', points, method: out.method, at: new Date().toISOString(), fresh: true });
    toast(L(`لُخّص «${titleOf(r)}» داخل Vault — ${count(points.length, N.points)}`, `“${titleOf(r)}” summarized inside Vault — ${count(points.length, N.points)}`));
    setTimeout(() => { const s = M.sums.get(r.id); if (s) s.fresh = false; $(`#sum-${CSS.escape(r.id)}`)?.classList.remove('fresh'); }, 1800);
  } catch (e) {
    if (state.sealed) return;
    if (e.status === 401) { sessionExpired(); return; }
    M.sums.set(r.id, { state: 'error', message: e.message });
    announce(L(`تعذّر تلخيص «${titleOf(r)}»: ${e.message}`, `Could not summarize “${titleOf(r)}”: ${e.message}`));
  }
  if (state.view !== 'marsad' || !$('#lc-body')) return;
  renderList(); updateHead();
}
function summarizeNext() {
  const M = state.marsad; const r = nextItem(); if (!r) return;
  if (!marsadFiltered().some((x) => x.id === r.id)) { M.q = ''; M.source = 'all'; const s = $('#page input[type=search]'); if (s) s.value = ''; }
  const rowBtn = () => $(`[data-fk="sum:${CSS.escape(r.id)}"]`);
  const lost = () => !document.activeElement || document.activeElement === document.body;
  const p = summarize(r);
  if (lost()) rowBtn()?.focus({ preventScroll: true });
  p.then(() => { if (lost()) rowBtn()?.focus({ preventScroll: true }); });
  requestAnimationFrame(() => $(`tr[data-id="${CSS.escape(r.id)}"]`)?.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' }));
}
function updateHead() {
  if (state.view !== 'marsad') return;
  const box = $('#ph-actions'); if (!box) return;
  keepFocus(() => box.replaceChildren(...marsadActions().filter(Boolean)));
  renderProgress();
}

// ---------- shared list pieces ----------
function listFoot(n) {
  return [h('span.lf-note', icon('lock', 'sm'), L('يبقى المحتوى داخل Vault — لا تصدير ولا مشاركة خارجية', 'Content stays inside Vault — no export, no external sharing')),
    h('span.lf-meta', n >= 200 ? L('تُعرض أحدث 200 فقط · ', 'Showing the latest 200 · ') : '', state[state.view].loadedAt ? L(`حُدّث ${fmtTime(state[state.view].loadedAt)}`, `Updated ${fmtTime(state[state.view].loadedAt)}`) : '')];
}
function noMatches(view) {
  const V = state[view];
  return emptyState({
    compact: true, icon: 'search', title: L('لا نتائج مطابقة', 'No matching results'),
    body: V.q ? L(`لا يوجد ما يطابق «${V.q}» ضمن التصفية الحالية.`, `Nothing matches “${V.q}” with the current filter.`) : L('لا يوجد ما يطابق التصفية الحالية.', 'Nothing matches the current filter.'),
    actions: [{ label: L('مسح البحث والتصفية', 'Clear search and filter'), icon: 'x', onClick: () => { V.q = ''; if (view === 'fs') V.kind = 'all'; else V.source = 'all'; keepFocus(renderPage); $('#page input[type=search]')?.focus(); } }],
  });
}
function renderList() {
  const body = $('#lc-body'); if (!body) return;
  state.animate = false;
  keepFocus(() => {
    const view = state.view; const V = state[view];
    body.replaceChildren(view === 'fs' ? fsTable() : marsadTable());
    const n = (view === 'fs' ? fsFiltered() : marsadFiltered()).length; const total = V.rows.length;
    const c = $('#lc-count'); if (c) c.textContent = n === total ? fmtNum(total, 0) : L(`${fmtNum(n, 0)} من ${fmtNum(total, 0)}`, `${fmtNum(n, 0)} of ${fmtNum(total, 0)}`);
    const seg = $('.lc-tools .tabs');
    if (seg) $$('button', seg).forEach((b) => { const on = b.dataset.fk === `seg:${view === 'fs' ? V.kind : V.source}`; b.classList.toggle('on', on); b.setAttribute('aria-selected', String(on)); });
  });
}
function renderPage() {
  const V = state[state.view];
  if (!V.rows) return;
  if (state.view === 'fs') renderFs(); else renderMarsad();
  state.animate = false;
}

// ---------- loading ----------
const load = (view) => (view === 'fs'
  ? Promise.all([api('/fs'), api('/fs/summary')]).then(([rows, sum]) => ({ rows, sum }))
  : api('/marsad').then((rows) => ({ rows })));
function loadingPage(view) {
  $('#page').replaceChildren(pageHead(view, [h('button.btn.is-loading', { type: 'button', 'aria-disabled': 'true' }, icon('refresh'), L('تحديث', 'Refresh'))]), isoCallout(),
    h('div.stats', { 'aria-busy': 'true', 'aria-label': L('جارٍ التحميل', 'Loading') }, [...skeleton('stats', 3).children]),
    h('section.card.list-card', h('div.lc-head', h('div.sk.sk-title')), h('div.lc-pad', skeleton('rows', 5))));
}
async function go(view, { focus = false } = {}) {
  state.view = view; const seq = ++state.seq; const V = state[view];
  document.title = `Vault — ${VIEWS[view].label()}`;
  renderNav(); renderIso(); closeOpenMenu?.();
  if (V.rows) { state.animate = false; keepFocus(renderPage); } else { state.animate = true; loadingPage(view); }
  if (focus) $('#page h1')?.focus({ preventScroll: true });
  window.scrollTo({ top: 0 });
  try {
    const data = await load(view);
    if (seq !== state.seq || state.sealed) return;
    const hadRows = !!V.rows;
    Object.assign(V, data, { loadedAt: new Date() });
    if (!hadRows) state.animate = true;
    keepFocus(renderPage);
    if (focus && !hadRows) $('#page h1')?.focus({ preventScroll: true });
  } catch (e) {
    if (seq !== state.seq || state.sealed) return;
    if (e.status === 401) { sessionExpired(); return; }
    if (V.rows) { toast(L(`تعذّر تحديث البيانات: ${e.message}`, `Could not update: ${e.message}`), { kind: 'error' }); return; }
    $('#page').replaceChildren(pageHead(view, [refreshBtn()]), h('section.card.empty-card', errorState(e, () => go(view))));
  }
}
async function refresh(btn) {
  const view = state.view; const V = state[view]; const seq = state.seq;
  if (btn?.classList.contains('is-loading')) return;
  btn?.classList.add('is-loading'); btn?.setAttribute('aria-busy', 'true');
  const before = new Set((V.rows || []).map((r) => r.id));
  try {
    const data = await load(view);
    if (seq !== state.seq || state.view !== view || state.sealed) return;
    const fresh = data.rows.filter((r) => !before.has(r.id)).map((r) => r.id);
    Object.assign(V, data, { loadedAt: new Date(), newIds: new Set(before.size ? fresh : []) });
    state.animate = false; keepFocus(renderPage);
    const noun = view === 'fs' ? N.records : N.items;
    if (fresh.length && before.size) toast(L(`جديد في Vault: ${count(fresh.length, noun)}`, `New in Vault: ${count(fresh.length, noun)}`));
    else toast(L('القائمة محدّثة — لا جديد منذ آخر تحميل', 'Up to date — nothing new since the last load'), { kind: 'info', timeout: 3000 });
    setTimeout(() => { V.newIds = new Set(); $$('tr.is-new').forEach((tr) => tr.classList.remove('is-new')); }, 2600);
  } catch (e) {
    if (state.sealed) return;
    if (e.status === 401) { sessionExpired(); return; }
    toast(L(`تعذّر التحديث: ${e.message}`, `Could not refresh: ${e.message}`), { kind: 'error' });
  } finally {
    const b = $('[data-fk="refresh"]') || btn; b?.classList.remove('is-loading'); b?.removeAttribute('aria-busy');
  }
}
function rerenderAll() {
  buildShell(); renderNav();
  document.title = `Vault — ${VIEWS[state.view].label()}`;
  if (state[state.view].rows) { state.animate = false; renderPage(); } else go(state.view);
  $$('.user-card').find((b) => b.offsetParent !== null)?.focus();
}

// "/" focuses the list search (like the portal's quick-find habit)
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || e.target.closest?.('input, textarea, select, [contenteditable="true"]')) return;
  const s = $('#page input[type=search]'); if (s) { e.preventDefault(); s.focus(); s.select(); }
});

// ---------- boot ----------
(async () => {
  buildShell(); renderNav();
  const mePromise = api('/me');
  const first = go(state.view);
  try {
    state.me = await mePromise;
    renderIso(); renderUser();
    if (state[state.view].rows) keepFocus(renderPage); // scope texts depend on the role
  } catch (e) {
    if (e.status === 401) { sessionExpired(); return; }
    state.meFailed = true; renderUser();
    toast(L(`تعذّر تحميل بيانات حسابك: ${e.message}`, `Could not load your account: ${e.message}`), { kind: 'error' });
  }
  await first;
})();
