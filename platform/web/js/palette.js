// Command palette (⌘K / Ctrl+K): navigation, quick actions, recent places,
// live workspace search (server-scoped), and "ask the assistant".
import { api } from './api.js';
import { h, $$, icon, debounce } from './ui.js';
import { L, t } from './i18n.js';
import { state } from './state.js';

let wrapEl = null;
const RECENT_KEY = 'swp.recent';
export function remember(route, label) {
  try {
    const r = JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').filter((x) => x.route !== route);
    r.unshift({ route, label }); localStorage.setItem(RECENT_KEY, JSON.stringify(r.slice(0, 5)));
  } catch { /* storage unavailable */ }
}
const recent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch { return []; } };

// providers are injected by app.js so the palette stays decoupled from views
let P = { routes: [], actions: [], openResult: () => {}, ask: () => {} };
export function configure(p) { P = { ...P, ...p }; }

export function openPalette(initial = '') {
  if (wrapEl) return;
  const prevFocus = document.activeElement;
  const input = h('input', { type: 'text', value: initial, 'aria-label': L('بحث أو أمر', 'Search or command'), placeholder: L('ابحث عن صفحة أو مشروع أو مستند، أو اكتب أمراً…', 'Search pages, projects, documents, or type a command…'), autocomplete: 'off', spellcheck: 'false', role: 'combobox', 'aria-expanded': 'true', 'aria-controls': 'palette-results' });
  const results = h('div.palette-results#palette-results', { role: 'listbox' });
  const pal = h('div.palette.glass-4', { role: 'dialog', 'aria-modal': 'true', 'aria-label': L('لوحة الأوامر', 'Command palette') },
    h('div.palette-input', icon('search'), input, h('kbd.kbd', 'esc')),
    results,
    h('div.palette-foot', h('span', h('kbd.kbd', '↑'), h('kbd.kbd', '↓'), L('للتنقل', 'navigate')), h('span', h('kbd.kbd', '↵'), L('للفتح', 'open')), h('span', h('kbd.kbd', 'esc'), L('للإغلاق', 'close'))));
  wrapEl = h('div.palette-wrap', { onmousedown: (e) => { if (e.target === wrapEl) close(); } }, pal);
  document.body.append(wrapEl);
  let items = []; let active = 0; let searchSeq = 0;

  const norm = (s) => String(s || '').toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');
  const match = (q, ...fields) => !q || fields.some((f) => norm(f).includes(norm(q)));

  function render(q, remote = null) {
    const groups = [];
    const qq = q.trim();
    if (qq) groups.push({ title: 'Ask AI', items: [{ icon: 'spark', label: L(`اسأل المساعد: «${qq}»`, `Ask the assistant: "${qq}"`), run: () => P.ask(qq), sub: '↵' }] });
    const nav = P.routes.filter((r) => match(qq, r.label, r.key));
    if (nav.length) groups.push({ title: L('الانتقال إلى', 'Go to'), items: nav.map((r) => ({ icon: r.icon, label: r.label, run: () => { location.hash = `#/${r.key}`; }, sub: r.hint })) });
    const acts = P.actions.filter((a) => match(qq, a.label, a.keywords));
    if (acts.length) groups.push({ title: L('إجراءات', 'Actions'), items: acts.map((a) => ({ icon: a.icon, label: a.label, run: a.run, sub: a.hint })) });
    if (!qq) {
      const rec = recent().filter((r) => r.route && r.label);
      if (rec.length) groups.splice(1, 0, { title: L('الأخيرة', 'Recent'), items: rec.map((r) => ({ icon: 'clock', label: r.label, run: () => { location.hash = r.route; } })) });
    }
    if (remote) {
      const TYPES = { project: [L('مشروع', 'Project'), 'folder'], task: [L('مهمة', 'Task'), 'check'], document: [L('مستند', 'Document'), 'doc'], event: [L('موعد', 'Event'), 'calendar'] };
      groups.push({ title: L('في مساحة العمل', 'In your workspace'), items: remote.length ? remote.map((r) => ({ icon: TYPES[r.type][1], label: r.title, sub: TYPES[r.type][0], run: () => P.openResult(r) })) : [{ icon: 'search', label: L('لا نتائج ضمن صلاحياتك', 'No results within your access'), disabled: true }] });
    } else if (qq.length >= 2) groups.push({ title: L('في مساحة العمل', 'In your workspace'), items: [{ icon: 'loader', label: L('جارٍ البحث…', 'Searching…'), disabled: true }] });
    items = groups.flatMap((g) => g.items.filter((i) => !i.disabled));
    active = Math.min(active, Math.max(0, items.length - 1));
    let idx = 0;
    results.replaceChildren(...groups.flatMap((g) => [h('div.palette-group', g.title), ...g.items.map((it) => {
      const my = it.disabled ? -1 : idx++;
      return h(`button.palette-item${my === active ? '.active' : ''}`, { type: 'button', role: 'option', 'aria-selected': String(my === active), disabled: it.disabled || null, 'data-i': my, onmousemove: () => { if (my >= 0 && my !== active) { active = my; paint(); } }, onclick: () => it.run && exec(it) },
        h('span.pi-icon', icon(it.icon || 'arrowRight')), h('span.grow.truncate', it.label), it.sub ? h('span.pi-sub', it.sub) : null);
    })]));
  }
  function paint() { $$('.palette-item', results).forEach((b) => { const on = Number(b.dataset.i) === active; b.classList.toggle('active', on); b.setAttribute('aria-selected', String(on)); if (on) b.scrollIntoView({ block: 'nearest' }); }); }
  function exec(it) { close(); setTimeout(() => it.run(), 10); }
  const search = debounce(async (q) => {
    const seq = ++searchSeq;
    if (q.trim().length < 2) return;
    const res = await api(`/api/search?q=${encodeURIComponent(q.trim())}`).catch(() => []);
    if (seq === searchSeq && wrapEl) render(input.value, res);
  }, 180);
  input.addEventListener('input', () => { active = 0; render(input.value); search(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); active = (active + 1) % Math.max(1, items.length); paint(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); active = (active - 1 + items.length) % Math.max(1, items.length); paint(); }
    else if (e.key === 'Enter') { e.preventDefault(); const it = items[active]; if (it) exec(it); }
    else if (e.key === 'Escape') { e.preventDefault(); close(); }
    else if (e.key === 'Tab') e.preventDefault();
  });
  function close() {
    if (!wrapEl) return;
    wrapEl.remove(); wrapEl = null;
    prevFocus?.focus?.();
  }
  render(initial); if (initial) search(initial);
  setTimeout(() => input.focus(), 10);
}

export function bindShortcut() {
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); if (state.me) openPalette(); }
  });
}
export { t };
