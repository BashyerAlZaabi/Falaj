// UI primitives shared by every screen (GlassModal, GlassPopover, GlassTable,
// skeletons, empty states, segmented control, toasts). Styling lives in
// css/components.css; these functions only build accessible DOM.
import { t, L } from './i18n.js';
import { ICONS } from './icons-data.js';

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

// Minimal element builder: h('div.card#x', {onclick}, children…)
export function h(tag, attrs = {}, ...children) {
  const m = String(tag).replace(/\.{2,}/g, '.').replace(/\.(?=#)|[.#]$/g, '').match(/^([a-z0-9]+)?((?:[.#][\w-]+)*)$/i) || [null, 'div', ''];
  const el = document.createElement(m[1] || 'div');
  for (const p of (m[2] || '').match(/[.#][\w-]+/g) || []) p[0] === '.' ? el.classList.add(p.slice(1)) : (el.id = p.slice(1));
  if (attrs && (typeof attrs !== 'object' || attrs instanceof Node || Array.isArray(attrs))) { children.unshift(attrs); attrs = {}; }
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (k === 'html') el.innerHTML = v;
    else if (k === 'class') el.className += ' ' + v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of children.flat(Infinity)) if (c != null && c !== false) el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  return el;
}

// ---------- Icons (Lucide) ----------
const SVG = 'http://www.w3.org/2000/svg';
export function icon(name, cls = '') {
  const s = document.createElementNS(SVG, 'svg');
  s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('fill', 'none'); s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', '1.75'); s.setAttribute('stroke-linecap', 'round'); s.setAttribute('stroke-linejoin', 'round');
  s.setAttribute('class', `icon ${cls}`.trim()); s.setAttribute('aria-hidden', 'true'); s.setAttribute('focusable', 'false');
  for (const [tag, attrs] of ICONS[name] || ICONS.info) {
    const n = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    s.append(n);
  }
  return s;
}

// ---------- Toasts ----------
export function toast(msg, { action, onAction, timeout = 5000, kind } = {}) {
  const k = kind === 'error' ? 'error' : kind === 'info' ? 'info' : 'success';
  const el = h(`div.toast.${k}`, { role: k === 'error' ? 'alert' : 'status' }, icon(k === 'error' ? 'circleAlert' : k === 'info' ? 'info' : 'circleCheck'), h('span.grow', msg));
  const close = () => { el.classList.add('leaving'); setTimeout(() => el.remove(), 220); };
  if (action) el.append(h('button.btn.sm.tertiary', { onclick: () => { onAction(); close(); } }, action));
  $('#toast')?.append(el);
  setTimeout(close, timeout);
  return close;
}

// ---------- Focus management ----------
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';
function trapFocus(container, e) {
  if (e.key !== 'Tab') return;
  const f = $$(FOCUSABLE, container).filter((x) => x.offsetParent !== null);
  if (!f.length) return;
  const first = f[0]; const last = f[f.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

// ---------- Modal / bottom sheet (GlassModal) ----------
let modalSeq = 0;
export function modal(title, body, actions = [], { wide = false, dismissible = true } = {}) {
  return new Promise((resolve) => {
    const prevFocus = document.activeElement;
    const id = `mdl-${++modalSeq}`;
    let done = false;
    const close = (v) => {
      if (done) return; done = true;
      wrap.classList.add('leaving');
      document.removeEventListener('keydown', onKey, true);
      setTimeout(() => { wrap.remove(); prevFocus?.focus?.(); }, 200);
      resolve(v);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) { e.stopPropagation(); close(null); } else trapFocus(dlg, e); };
    const dlg = h(`div.modal.glass-4${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': id },
      h('div.sheet-grabber', { 'aria-hidden': 'true' }),
      h('h3', { id }, title),
      dismissible ? h('button.icon-btn.modal-close', { type: 'button', 'aria-label': t('close'), onclick: () => close(null) }, icon('x')) : null,
      body,
      actions.length ? h('div.actions', actions.map((a) => h(`button.btn${a.primary ? '.primary' : ''}${a.danger ? '.danger' : ''}${!a.primary && !a.danger ? '.secondary' : ''}`, { type: 'button', onclick: () => close(a.value) }, a.icon ? icon(a.icon) : null, a.label))) : null);
    const wrap = h('div.modal-wrap', { onclick: (e) => { if (e.target === wrap && dismissible) close(null); } }, dlg);
    document.body.append(wrap);
    document.addEventListener('keydown', onKey, true);
    // Enter submits the primary action from single-line inputs
    dlg.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('input:not([type=checkbox]):not([type=radio])')) { const p = actions.find((a) => a.primary); if (p) { e.preventDefault(); close(p.value); } } });
    setTimeout(() => (dlg.querySelector('input,textarea,select') || dlg.querySelector('.actions .btn.primary, .actions .btn.danger') || dlg).focus?.(), 40);
  });
}
export const confirmDialog = (title, text, { danger, confirmLabel } = {}) => modal(title, h('p.muted', { style: { margin: 0 } }, text), [{ label: t('cancel'), value: false }, { label: confirmLabel || t('confirm'), value: true, primary: !danger, danger }]);

// ---------- Popover menu (GlassPopover) ----------
let openMenu = null;
export function closeMenu() { openMenu?.(); }
export function menu(anchor, items, { align = 'end', width } = {}) {
  closeMenu();
  const pop = h('div.popover.glass-4', { role: 'menu', style: width ? { minWidth: `${width}px` } : {} });
  for (const it of items) {
    if (!it) continue;
    if (it.sep) { pop.append(h('div.menu-sep', { role: 'separator' })); continue; }
    if (it.title) { pop.append(h('div.menu-title', it.title)); continue; }
    if (it.node) { pop.append(it.node); continue; }
    const el = h(`${it.href ? 'a' : 'button'}.menu-item${it.danger ? '.danger' : ''}`, {
      role: it.checked != null ? 'menuitemradio' : 'menuitem', type: it.href ? null : 'button', href: it.href || null, id: it.id || null,
      'aria-checked': it.checked != null ? String(!!it.checked) : null, target: it.target || null, rel: it.target ? 'noopener noreferrer' : null,
      onclick: (e) => { if (!it.keepOpen) close(); it.onClick?.(e); },
    }, it.icon ? icon(it.icon) : null, h('span.grow', it.label), it.hint ? h('span.hint', it.hint) : null);
    pop.append(el);
  }
  document.body.append(pop);
  // position relative to anchor, flipping to stay on screen
  const r = anchor.getBoundingClientRect(); const pr = pop.getBoundingClientRect();
  const rtl = document.documentElement.dir === 'rtl';
  let left = (align === 'end') !== rtl ? r.right - pr.width : r.left;
  left = Math.max(8, Math.min(left, innerWidth - pr.width - 8));
  let top = r.bottom + 6;
  if (top + pr.height > innerHeight - 8) top = Math.max(8, r.top - pr.height - 6);
  pop.style.left = `${left}px`; pop.style.top = `${top}px`;
  pop.style.setProperty('--origin', `${top < r.top ? 'bottom' : 'top'} ${left + pr.width / 2 < r.left + r.width / 2 ? 'right' : 'left'}`);
  anchor.setAttribute('aria-expanded', 'true');
  const itemsEls = () => $$('.menu-item', pop);
  const onKey = (e) => {
    const list = itemsEls(); const i = list.indexOf(document.activeElement);
    if (e.key === 'Escape') { e.preventDefault(); close(); anchor.focus(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); list[(i + 1) % list.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); list[(i - 1 + list.length) % list.length]?.focus(); }
    else if (e.key === 'Tab') close();
  };
  const onDown = (e) => { if (!pop.contains(e.target) && !anchor.contains(e.target)) close(); };
  function close() {
    if (!pop.isConnected) return;
    anchor.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', onKey, true); document.removeEventListener('pointerdown', onDown, true); window.removeEventListener('resize', close);
    pop.remove(); openMenu = null;
  }
  document.addEventListener('keydown', onKey, true); document.addEventListener('pointerdown', onDown, true); window.addEventListener('resize', close);
  setTimeout(() => itemsEls()[0]?.focus(), 20);
  openMenu = close;
  return close;
}

// ---------- Segmented control ----------
// options: [[value, label, count?]]
export function segmented(options, value, onChange, { label } = {}) {
  const el = h('div.tabs', { role: 'tablist', 'aria-label': label || null });
  for (const [v, l, count] of options) {
    el.append(h(`button${v === value ? '.on' : ''}`, { type: 'button', role: 'tab', 'aria-selected': String(v === value), onclick: () => {
      $$('button', el).forEach((b) => { b.classList.remove('on'); b.setAttribute('aria-selected', 'false'); });
      const b = $$('button', el).find((x) => x.dataset.v === String(v)); b?.classList.add('on'); b?.setAttribute('aria-selected', 'true');
      onChange(v);
    }, 'data-v': String(v) }, l, count != null ? h('span.count', count) : null));
  }
  return el;
}

// ---------- Skeletons ----------
export function skeleton(kind = 'card', n = 3) {
  const w = h('div', { 'aria-busy': 'true', 'aria-label': L('جارٍ التحميل', 'Loading') });
  if (kind === 'stat') w.append(h('div.sk.sk-line.w-40'), h('div.sk.sk-num'), h('div.sk.sk-line.w-60'));
  else if (kind === 'list' || kind === 'table') for (let i = 0; i < n; i++) w.append(h('div.sk.sk-row'));
  else if (kind === 'chart') w.append(h('div.sk.sk-block', { style: { height: '180px' } }));
  else w.append(h('div.sk.sk-title'), h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-60'), h('div.sk.sk-line.w-40'));
  return w;
}

// ---------- Empty / error states ----------
export function emptyState({ icon: ic = 'inbox', title, body, actions = [], compact = false, error = false } = {}) {
  return h(`div.empty-state${compact ? '.compact' : ''}${error ? '.error' : ''}`, { role: error ? 'alert' : null },
    h('div.es-icon', icon(ic)),
    title ? h('h4', title) : null,
    body ? h('p', body) : null,
    actions.length ? h('div.btn-group', actions.map((a) => h(`button.btn${a.primary ? '.primary' : a.tertiary ? '.tertiary' : ''}${compact ? '.sm' : ''}`, { type: 'button', onclick: a.onClick }, a.icon ? icon(a.icon) : null, a.label))) : null);
}
export const errorState = (err, retry) => emptyState({ icon: 'circleAlert', error: true, title: L('تعذّر التحميل', 'Could not load'), body: err?.message || String(err || ''), actions: retry ? [{ label: L('إعادة المحاولة', 'Try again'), icon: 'refresh', onClick: retry }] : [] });

// ---------- Data table (GlassTable): sortable, mobile-stacking ----------
// columns: [{ key, label, render?(row) -> Node|string, sort?(row) -> comparable, num?, width? }]
export function dataTable({ columns, rows, onRow, empty, sortKey, sortDir = 'asc', stackMobile = true, caption, rowAttrs }) {
  let key = sortKey; let dir = sortDir;
  const wrap = h('div.table-wrap');
  const draw = () => {
    const col = columns.find((c) => c.key === key);
    const sorted = col?.sort ? [...rows].sort((a, b) => { const x = col.sort(a); const y = col.sort(b); const r = x == null ? 1 : y == null ? -1 : x < y ? -1 : x > y ? 1 : 0; return dir === 'asc' ? r : -r; }) : rows;
    const thead = h('thead', h('tr', columns.map((c) => {
      const th = h(`th${c.sort ? '.sortable' : ''}${c.num ? '.num' : ''}`, { scope: 'col', 'aria-sort': c.key === key ? (dir === 'asc' ? 'ascending' : 'descending') : c.sort ? 'none' : null, tabindex: c.sort ? 0 : null, style: c.width ? { width: c.width } : null },
        c.label, c.sort ? h('span.sort-ind', icon(c.key === key ? (dir === 'asc' ? 'sortUp' : 'sortDown') : 'sort', 'sm')) : null);
      if (c.sort) {
        const act = () => { if (key === c.key) dir = dir === 'asc' ? 'desc' : 'asc'; else { key = c.key; dir = 'asc'; } draw(); };
        th.addEventListener('click', act); th.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(); } });
      }
      return th;
    })));
    const tbody = h('tbody', sorted.map((r) => h(`tr${onRow ? '.clickable' : ''}`, { ...(rowAttrs ? rowAttrs(r) : {}), tabindex: onRow ? 0 : null, onclick: onRow ? (e) => { if (!e.target.closest('a,button,input,select')) onRow(r, e); } : null, onkeydown: onRow ? (e) => { if (e.key === 'Enter' && e.target === e.currentTarget) onRow(r, e); } : null },
      columns.map((c) => { const v = c.render ? c.render(r) : r[c.key]; return h(`td${c.num ? '.num' : ''}`, { 'data-label': c.label || null }, v ?? '—'); }))));
    wrap.replaceChildren(rows.length ? h(`table.tbl${stackMobile ? '.stack-mobile' : ''}`, caption ? h('caption.sr-only', caption) : null, thead, tbody) : (empty || emptyState({ compact: true, title: L('لا توجد بيانات', 'No data') })));
  };
  draw();
  return wrap;
}

// ---------- Form field helper ----------
export function field(label, control, { helper, error, id } = {}) {
  const cid = id || control.id || `f-${Math.random().toString(36).slice(2, 8)}`;
  control.id = cid;
  if (error) control.setAttribute('aria-invalid', 'true');
  return h('div.form-field', h('label.lbl', { for: cid }, label), control, helper ? h('div.helper', helper) : null, error ? h('div.error-text', icon('circleAlert', 'sm'), error) : null);
}

// Safe markdown-lite: escape first, then **bold**, _italic_, line breaks.
export function md(text) {
  return esc(text).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1<em>$2</em>');
}

export function debounce(fn, ms) { let tm; return (...a) => { clearTimeout(tm); tm = setTimeout(() => fn(...a), ms); }; }
// Initials: skip Arabic articles (ال / آل) so "مريم الكعبي" → "م ك", not "ما".
export const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/^(ال|آل)(?=\S{2,})/, ''));
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map((w) => w[0]).join(/[\u0600-\u06FF]/.test(name) ? ' ' : '').toUpperCase();
};
// Stable avatar tint per person (0–6)
export const avatarTint = (name) => String([...String(name || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7) % 7);
export function avatar(name, cls = '') { return h(`span.avatar${cls ? '.' + cls : ''}`, { 'data-tint': avatarTint(name), 'aria-hidden': 'true' }, initials(name)); }
export const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
