// Shared UI kit for the enterprise systems (views in js/views/sys/<key>.js).
// Consistent page header with data classification + Ask AI policy, hash-synced
// tabs, status chips, workflow stepper, stat tiles, form dialogs with
// validation, record side-sheets, boards, timelines, people pickers, money and
// rating inputs, confidentiality banners and realtime subscriptions.
// Styles: css/pages/systems.css. Page-specific CSS: css/pages/sys-<key>.css.
import { api } from './api.js';
import { h, icon, toast, modal, confirmDialog, emptyState, errorState, skeleton, dataTable, menu, avatar, debounce } from './ui.js';
import { L, fmtNum, fmtDate, fmtTime, getLang } from './i18n.js';
import { state, on } from './state.js';

export { h, icon, toast, modal, confirmDialog, emptyState, errorState, skeleton, dataTable, menu, avatar, debounce, L, fmtNum, fmtDate, fmtTime, getLang, state, api };

// ---------------- API ----------------
// const call = sysApi('meetings'); await call('/items'); await call('/items', { method: 'POST', body })
export const sysApi = (key) => (path = '', opts) => api(`/api/sys/${key}${path}`, opts);

let dirCache = null; let deptCache = null;
// Staff directory (id, names, department, title) — cached per session.
export async function directory() { dirCache ||= api('/api/users/directory').catch((e) => { dirCache = null; throw e; }); return dirCache; }
export async function departments() { deptCache ||= api('/api/departments').catch((e) => { deptCache = null; throw e; }); return deptCache; }
export const personName = (u) => (u ? L(u.name_ar, u.name_en) : '—');

// ---------------- header ----------------
const CLASS = {
  internal: ['داخلي', 'Internal', 'outline', 'building'],
  confidential: ['سري', 'Confidential', 'warn', 'lock'],
  restricted: ['سري للغاية', 'Restricted', 'crit', 'lockKeyhole'],
};
export function classificationChip(level = 'internal') {
  const [ar, en, tone, ic] = CLASS[level] || CLASS.internal;
  return h(`span.chip.tiny.${tone}.class-chip`, { 'data-tip': L('تصنيف البيانات في هذا النظام', 'Data classification of this system') }, icon(ic), L(ar, en));
}
export function aiChip(meta) {
  const domains = meta?.domains || [];
  const active = domains.filter((d) => d.ai_active);
  const lockedAll = domains.length && domains.every((d) => d.ai_policy === 'off');
  const label = active.length === domains.length && domains.length ? L('Ask AI: متاح', 'Ask AI: on') : active.length ? L('Ask AI: جزئي', 'Ask AI: partial') : L('Ask AI: غير متاح', 'Ask AI: off');
  const tip = domains.map((d) => `${L(d.name_ar, d.name_en)}: ${d.ai_active ? L('متاح للمساعد', 'available to Ask AI') : d.ai_policy === 'off' ? L(d.ai_locked ? 'مقفل بسياسة البيانات' : 'غير متاح', d.ai_locked ? 'locked by data policy' : 'off') : L('بموافقتك من مركز التكامل', 'opt-in in the Control Center')}`).join(' · ');
  return h(`a.chip.tiny.${active.length ? 'info' : 'outline'}.ai-chip`, { href: '#/sys/integrations/ai', 'data-tip': tip || label }, icon(active.length ? 'spark' : lockedAll ? 'shieldBan' : 'shield'), label);
}
// sysHeader(ctx, { title, sub, actions: [node|{label, icon, primary, onClick, href}], eyebrow, badges: [node] })
export function sysHeader(ctx, { title, sub, actions = [], eyebrow, badges = [] } = {}) {
  const m = ctx.meta;
  return h('header.page-head.sys-head',
    h('div.sys-head-main',
      h('div.sys-icon', { 'aria-hidden': 'true' }, icon(m.icon)),
      h('div.grow',
        h('span.eyebrow', eyebrow || L(m.name_ar, m.name_en)),
        h('h1', title || L(m.name_ar, m.name_en)),
        sub !== false ? h('p.sub', sub || L(m.description_ar, m.description_en)) : null,
        h('div.sys-badges', classificationChip(m.classification), aiChip(m), ...badges))),
    actions.length ? h('div.actions', actions.map(actionNode)) : null);
}
function actionNode(a) {
  if (!a || a instanceof Node) return a;
  const cls = `${a.primary ? '.primary' : a.tertiary ? '.tertiary' : ''}${a.danger ? '.danger' : ''}`;
  return a.href ? h(`a.btn${cls}`, { href: a.href }, a.icon ? icon(a.icon) : null, a.label) : h(`button.btn${cls}`, { type: 'button', onclick: a.onClick, disabled: a.disabled || null }, a.icon ? icon(a.icon) : null, a.label);
}

// ---------------- tabs (synced with the hash: #/sys/<key>/<tab>/…) ----------------
export const currentTab = (ctx, tabs, fallback) => (tabs.find((t) => t.key === ctx.params[0]) ? ctx.params[0] : fallback || tabs[0].key);
export function sysTabs(ctx, tabs, current) {
  return h('nav.tabs.sys-tabs', { 'aria-label': L('أقسام النظام', 'System sections') }, tabs.filter(Boolean).map((t) => h(`a${t.key === current ? '.on' : ''}`,
    { href: `#/sys/${ctx.key}/${t.key}`, 'aria-current': t.key === current ? 'page' : null },
    t.icon ? icon(t.icon) : null, L(t.ar, t.en), t.count ? h('span.count.tabular', fmtNum(t.count)) : null)));
}
export const go = (ctx, ...parts) => { location.hash = `#/sys/${ctx.key}${parts.length ? '/' + parts.filter((p) => p != null).join('/') : ''}`; };

// ---------------- status, stepper, tiles ----------------
// map: { status: [ar, en, tone, icon] } tone: good|warn|crit|info|purple|outline|sand|navy
export function statusChip(status, map) {
  const [ar, en, tone = 'outline', ic] = map[status] || [status, status, 'outline'];
  return h(`span.chip.tiny.${tone}`, ic ? icon(ic) : null, L(ar, en));
}
export function stepper(steps, index, { failed = false, label } = {}) {
  return h('ol.stepper', { 'aria-label': label || L('مراحل سير العمل', 'Workflow stages') }, steps.map((s, i) => h(`li.${i < index ? 'done' : i === index ? (failed ? 'failed' : 'current') : 'todo'}`,
    { 'aria-current': i === index ? 'step' : null },
    h('span.st-dot', { 'aria-hidden': 'true' }, i < index ? icon('check') : failed && i === index ? icon('x') : String(i + 1)), h('span.st-label', L(s.ar, s.en)))));
}
// statTile({ label, value, unit, tone, hint, icon, href, onClick })
export function statTile({ label, value, unit, tone, hint, icon: ic, href, onClick }) {
  const inner = [h('div.st-top', ic ? h('span.st-ic', icon(ic)) : null, h('span.st-label', label)),
    h('div.st-value', h('span.num.tabular', value == null ? '—' : typeof value === 'number' ? fmtNum(value) : value), unit ? h('span.st-unit', unit) : null),
    hint ? h('div.st-hint', hint) : null];
  const cls = `div.stat-tile${tone ? '.' + tone : ''}${href || onClick ? '.clickable' : ''}`;
  if (href) return h(`a.stat-tile${tone ? '.' + tone : ''}.clickable`, { href }, inner);
  return h(cls, onClick ? { role: 'button', tabindex: 0, onclick: onClick, onkeydown: (e) => { if (e.key === 'Enter') onClick(e); } } : {}, inner);
}
export const statRow = (tiles) => h('div.stat-row', tiles.filter(Boolean));
export function progress(pct, { tone, label } = {}) {
  const v = pct == null ? null : Math.max(0, Math.min(100, Math.round(pct)));
  return h(`div.progress${v == null ? '.missing' : ''}${tone ? '.' + tone : ''}`, { role: 'progressbar', 'aria-valuenow': v ?? undefined, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': label || null }, h('i', { style: { width: `${v ?? 0}%` } }));
}

// ---------------- sections & layout ----------------
export const card = (title, ...children) => h('section.card.sys-card', title ? h('div.card-head', typeof title === 'string' ? h('h2.card-title', title) : title) : null, ...children);
export const grid = (cls, ...children) => h(`div.sys-grid${cls ? '.' + cls : ''}`, ...children);
export function confidentialBanner(ar, en, { level = 'confidential' } = {}) {
  return h(`div.callout.sys-banner.${level}`, { role: 'note' }, icon(level === 'restricted' ? 'lockKeyhole' : 'lock'), h('span', L(ar, en)));
}
export function placeholder() {
  return emptyState({ icon: 'hourglass', title: L('قيد الإعداد', 'Being set up'), body: L('يجري تجهيز هذا النظام.', 'This system is being prepared.') });
}
export function loading(root, kind = 'card', n = 3) { const s = skeleton(kind, n); root.append(s); return () => s.remove(); }

// ---------------- formatting ----------------
export const money = (n, { currency = 'AED', digits = 0 } = {}) => (n == null ? '—' : `${Number(n).toLocaleString(getLang() === 'ar' ? 'ar-AE' : 'en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${currency === 'AED' ? L('د.إ', 'AED') : currency}`);
export const pct = (n) => (n == null ? '—' : `${fmtNum(Math.round(n))}%`);
export const dateTime = (iso) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—');
export const plural = (n, [one, two, few, many]) => (getLang() !== 'ar' ? `${n} ${n === 1 ? one : many}` : n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${fmtNum(n)} ${few}` : `${fmtNum(n)} ${many}`);
export function whoChip(u) { return u ? h('span.who-chip', avatar(L(u.name_ar, u.name_en)), h('span', L(u.name_ar, u.name_en))) : h('span.faint', '—'); }

// ---------------- forms ----------------
// formDialog({ title, intro, fields, values, submitLabel, wide }) → values | null
// field: { name, label, type: text|textarea|number|money|date|select|multiselect|checkbox|user|users|rating|info,
//          options: [{value,label}], required, placeholder, help, min, max, step, rows, maxLength, full }
export async function formDialog({ title, intro, fields, values = {}, submitLabel, wide = false, danger = false }) {
  const dir = fields.some((f) => f.type === 'user' || f.type === 'users') ? await directory().catch(() => []) : [];
  const controls = {};
  const body = h('div.form-grid', intro ? h('p.muted.full', intro) : null, fields.filter(Boolean).map((f) => {
    if (f.type === 'info') return h('div.full.callout', f.label);
    const id = `ff-${f.name}-${Math.random().toString(36).slice(2, 7)}`;
    const c = control(f, values[f.name], dir, id);
    controls[f.name] = { f, c };
    const err = h('div.error-text', { id: `${id}-err`, 'aria-live': 'polite' });
    return h(`div.form-row${f.full || ['textarea', 'multiselect', 'users', 'rating'].includes(f.type) ? '.full' : ''}`,
      f.type === 'checkbox' ? null : h('label.lbl', { for: id }, f.label, f.required ? h('span.req', { 'aria-hidden': 'true' }, ' *') : null),
      c.el, f.help ? h('div.helper', f.help) : null, err);
  }));
  let out = null;
  const ok = await modal(title, body, [{ label: L('إلغاء', 'Cancel'), value: false }, { label: submitLabel || L('حفظ', 'Save'), value: true, primary: !danger, danger }], {
    wide,
    beforeClose: () => {
      const vals = {}; let firstBad = null;
      for (const [name, { f, c }] of Object.entries(controls)) {
        const v = c.get(); const errEl = body.querySelector(`#${c.id}-err`);
        let msg = '';
        if (f.required && (v == null || v === '' || (Array.isArray(v) && !v.length))) msg = L('هذا الحقل مطلوب', 'This field is required');
        else if ((f.type === 'number' || f.type === 'money') && v != null && ((f.min != null && v < f.min) || (f.max != null && v > f.max))) msg = L(`القيمة بين ${f.min ?? '—'} و ${f.max ?? '—'}`, `Value between ${f.min ?? '—'} and ${f.max ?? '—'}`);
        if (errEl) errEl.textContent = msg;
        c.el.toggleAttribute?.('aria-invalid', !!msg);
        if (msg && !firstBad) firstBad = c.el;
        vals[name] = v;
      }
      if (firstBad) { firstBad.focus?.(); return false; }
      out = vals; return true;
    },
  });
  return ok ? out : null;
}
function control(f, value, dir, id) {
  const base = { id, name: f.name, 'aria-describedby': `${id}-err` };
  switch (f.type) {
    case 'textarea': { const el = h('textarea.field', { ...base, rows: f.rows || 4, placeholder: f.placeholder || '', maxlength: f.maxLength || null }, value ?? ''); return { id, el, get: () => el.value.trim() }; }
    case 'number': case 'money': { const el = h('input.field', { ...base, type: 'number', inputmode: 'decimal', min: f.min, max: f.max, step: f.step || (f.type === 'money' ? '0.01' : '1'), value: value ?? '', placeholder: f.placeholder || '' }); return { id, el: f.type === 'money' ? h('div.money-field', el, h('span.cur', L('د.إ', 'AED'))) : el, get: () => (el.value === '' ? null : Number(el.value)) }; }
    case 'date': { const el = h('input.field', { ...base, type: 'date', value: value ?? '', min: f.min, max: f.max }); return { id, el, get: () => el.value || null }; }
    case 'select': { const el = h('select.field', base, f.required ? null : h('option', { value: '' }, f.placeholder || L('— اختر —', '— Select —')), (f.options || []).map((o) => h('option', { value: o.value, selected: String(o.value) === String(value ?? '') || null }, o.label))); return { id, el, get: () => el.value || null }; }
    case 'user': { const el = peopleSelect(dir, { ...base, value, placeholder: f.placeholder, filter: f.filter }); return { id, el, get: () => el.value || null }; }
    case 'multiselect': case 'users': {
      const opts = f.type === 'users' ? dir.filter((u) => !f.filter || f.filter(u)).map((u) => ({ value: u.id, label: `${L(u.name_ar, u.name_en)} — ${L(u.dept_ar || '', u.dept_en || '')}` })) : f.options || [];
      const sel = new Set(value || []);
      const el = h('div.check-list', { id, role: 'group', 'aria-label': f.label, tabindex: -1 }, opts.map((o) => h('label.check-label', h('input', { type: 'checkbox', value: o.value, checked: sel.has(o.value) || null }), o.label)));
      return { id, el, get: () => [...el.querySelectorAll('input:checked')].map((x) => x.value) };
    }
    case 'checkbox': { const inp = h('input', { ...base, type: 'checkbox', checked: value ? true : null }); return { id, el: h('label.check-label', inp, f.label), get: () => inp.checked }; }
    case 'rating': { const el = ratingInput({ name: f.name, max: f.max || 5, value, labels: f.labels }); el.id = id; return { id, el, get: () => el.value }; }
    default: { const el = h('input.field', { ...base, type: 'text', value: value ?? '', placeholder: f.placeholder || '', maxlength: f.maxLength || 300 }); return { id, el, get: () => el.value.trim() }; }
  }
}
// People picker grouped by department.
export function peopleSelect(dir, { value, placeholder, filter, ...attrs } = {}) {
  const groups = new Map();
  for (const u of dir.filter((x) => !filter || filter(x))) { const k = L(u.dept_ar || '', u.dept_en || ''); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(u); }
  return h('select.field', attrs, h('option', { value: '' }, placeholder || L('— اختر موظفاً —', '— Select a person —')),
    [...groups].map(([g, us]) => h('optgroup', { label: g }, us.map((u) => h('option', { value: u.id, selected: u.id === value || null }, L(u.name_ar, u.name_en))))));
}
// Star/number rating; element.value holds the current number (or null).
export function ratingInput({ name, max = 5, value = null, labels } = {}) {
  const el = h('div.rating', { role: 'radiogroup', 'aria-label': name });
  el.value = value;
  const draw = () => el.querySelectorAll('button').forEach((b, i) => { const on = el.value != null && i < el.value; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(el.value === i + 1)); });
  for (let i = 1; i <= max; i++) el.append(h('button', { type: 'button', role: 'radio', 'aria-label': labels?.[i - 1] || String(i), 'data-tip': labels?.[i - 1] || null, onclick: () => { el.value = i; draw(); el.dispatchEvent(new Event('change')); } }, max > 5 ? String(i) : icon('star')));
  draw();
  return el;
}

// ---------------- record side-sheet ----------------
// openSheet({ title, subtitle, body, actions: [{label, primary, danger, icon, onClick}], badges }) → { close, el, setBody }
let openSheetClose = null;
export function openSheet({ title, subtitle, body, actions = [], badges = [], wide = false }) {
  openSheetClose?.();
  const prev = document.activeElement;
  const titleId = `sh-${Math.random().toString(36).slice(2, 8)}`;
  const content = h('div.sheet-body', body);
  const panel = h(`aside.sys-sheet.glass-4${wide ? '.wide' : ''}`, { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': titleId, tabindex: -1 },
    h('header.sheet-head', h('div.grow', h('h2', { id: titleId }, title), subtitle ? h('p.sub', subtitle) : null, badges.length ? h('div.sys-badges', badges) : null),
      h('button.icon-btn', { type: 'button', 'aria-label': L('إغلاق', 'Close'), onclick: () => close() }, icon('x'))),
    content,
    actions.length ? h('footer.sheet-actions', actions.filter(Boolean).map((a) => actionNode({ ...a, onClick: async (e) => { const r = await a.onClick?.(e); if (r !== false && a.closes !== false) close(); } }))) : null);
  const scrim = h('div.sys-sheet-scrim', { onclick: () => close() });
  const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } };
  const onNav = () => close();
  function close() {
    if (!panel.isConnected) return;
    panel.classList.add('leaving'); scrim.classList.add('leaving');
    document.removeEventListener('keydown', onKey, true); window.removeEventListener('hashchange', onNav);
    setTimeout(() => { panel.remove(); scrim.remove(); if (prev?.isConnected) prev.focus?.(); }, 180);
    if (openSheetClose === close) openSheetClose = null;
  }
  document.body.append(scrim, panel);
  document.addEventListener('keydown', onKey, true); window.addEventListener('hashchange', onNav);
  setTimeout(() => (panel.querySelector('input,textarea,select,button:not(.icon-btn)') || panel).focus?.(), 40);
  openSheetClose = close;
  return { close, el: panel, setBody: (n) => content.replaceChildren(n) };
}

// ---------------- board, timeline, lists ----------------
// board(columns: [{key, ar, en, tone}], items, { columnOf, renderCard, emptyText })
export function board(columns, items, { columnOf, renderCard, emptyText } = {}) {
  return h('div.sys-board', columns.map((c) => {
    const list = items.filter((it) => columnOf(it) === c.key);
    return h(`section.board-col${c.tone ? '.' + c.tone : ''}`, { 'aria-label': L(c.ar, c.en) },
      h('header.board-head', h('span.board-dot', { 'aria-hidden': 'true' }), h('span.grow', L(c.ar, c.en)), h('span.count.tabular', fmtNum(list.length))),
      h('div.board-list', list.length ? list.map(renderCard) : h('div.board-empty', emptyText || L('لا عناصر', 'Nothing here'))));
  }));
}
// timeline([{ at, ar, en, who, icon, tone }])
export function timeline(entries) {
  if (!entries?.length) return h('p.faint.tiny', L('لا يوجد سجل بعد', 'No history yet'));
  return h('ol.sys-timeline', entries.map((e) => h(`li${e.tone ? '.' + e.tone : ''}`, h('span.tl-ic', icon(e.icon || 'circleDot')),
    h('div.grow', h('div.tl-text', L(e.ar, e.en || e.ar)), h('div.tl-meta', [e.who ? L(e.who.name_ar, e.who.name_en) : null, dateTime(e.at)].filter(Boolean).join(' · '))))));
}
// Access log for sensitive records (who viewed/changed it).
export function accessLogList(rows) {
  if (!rows?.length) return h('p.faint.tiny', L('لم يطّلع أحد بعد', 'No access recorded yet'));
  return h('ul.list.access-log', rows.map((r) => h('li', icon(r.action === 'view' ? 'eye' : 'pencil'), h('span.grow', L(r.name_ar, r.name_en)), h('span.tiny.faint', `${r.action} · ${dateTime(r.at)}`))));
}
// filterBar({ search: { placeholder, value, onInput }, selects: [{ label, value, options, onChange }], extra })
export function filterBar({ search, selects = [], extra = [] } = {}) {
  return h('div.sys-filters', { role: 'search' },
    search ? h('label.search-field', icon('search'), h('input.field', { type: 'search', placeholder: search.placeholder || L('بحث…', 'Search…'), value: search.value || '', 'aria-label': search.placeholder || L('بحث', 'Search'), oninput: debounce((e) => search.onInput(e.target.value), 200) })) : null,
    selects.map((s) => h('select.field.sm', { 'aria-label': s.label, onchange: (e) => s.onChange(e.target.value) }, s.options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(s.value ?? '') || null }, o.label)))),
    ...extra);
}

// ---------------- realtime ----------------
// Re-run fn when this system's data changes; the listener stops when the route changes.
export function onSysChange(key, fn) {
  let active = true;
  const stop = () => { active = false; window.removeEventListener('hashchange', stop); };
  window.addEventListener('hashchange', stop);
  on('data-changed', (ev) => { if (active && (ev?.entity === `sys:${key}` || ev?.entity === 'all')) fn(ev); });
}
// Run an async action with button loading state + error toast. Returns the result or null.
export async function act(btn, fn, { success } = {}) {
  btn?.classList.add('is-loading'); if (btn) btn.disabled = true;
  try { const r = await fn(); if (success) toast(success); return r; }
  catch (e) { toast(e.message, { kind: 'error' }); return null; }
  finally { btn?.classList.remove('is-loading'); if (btn) btn.disabled = false; }
}
