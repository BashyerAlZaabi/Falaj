// Unified Portal home: a conversation-first hero (the assistant orb, «كيف
// أساعدك اليوم؟», a large prompt with dictation, voice mode and send, and
// role-aware suggestion chips — submitting opens the immersive conversation),
// then the excellence journey, my-systems strip and the customisable widget grid.
//
// Cards are keyed by widget id and their DOM is kept across renders in a
// module-level cache. A background refresh (soft=true) re-reads the layout,
// reconciles cards in place (add / remove / reorder / restyle), and refetches
// only the widgets whose sources changed — a body is swapped only when its data
// actually differs (stale-while-revalidate), so the grid never flashes
// skeletons or reflows after a small action. Customising (add, arrange,
// resize, remove, restore) happens in an in-place edit mode.
import { api } from '../api.js';
import { h, icon, toast, modal, menu, emptyState, errorState, segmented, field } from '../ui.js';
import { L, t, fmtTime, fmtNum, getLang } from '../i18n.js';
import { state, on } from '../state.js';
import { renderWidgetView, fetchWidgetData, widgetSkeleton, widgetError, widgetTitle, widgetIcon, sourceLabel, VIEW_META, TYPE_META, runTool, undo } from '../widgets.js';
import * as Chat from '../chat.js';
import * as Assistant from '../assistant-orb.js';
import { gameHero, loadGame } from '../game.js';
import { wsCard } from '../systems.js';

const SIZE_NAMES = { s: ['صغير', 'Small'], m: ['متوسط', 'Medium'], l: ['كبير', 'Large'] };
const SIZE_HINTS = { s: ['ربع العرض', 'Quarter width'], m: ['نصف العرض', 'Half width'], l: ['كامل العرض', 'Full width'] };
// Which data sources each widget type reads (to refetch only what changed).
const DEPS = { summary: ['task', 'project', 'event', 'alert', 'office'], kpi: ['task', 'project'], projects: ['project', 'task'], tasks: ['task', 'project'], week_progress: ['task'], events: ['event'], alerts: ['alert', 'task', 'project'], documents: ['document'] };

const C = {
  uid: null, lang: null, seq: 0,
  dash: null, // last /api/dashboard payload
  cards: new Map(), // id → card record (DOM + widget)
  data: new Map(), // id → { res, hash } — survives navigation, so returning paints instantly
  expanded: new Set(),
  pending: new Set(), // entities changed since the last soft refresh
  head: null, wrap: null, grid: null, editbar: null, emptyEl: null, live: null,
  extras: null, gameSlot: null, wsSlot: null, gameHash: null, wsHash: null, // excellence journey + department workspace strip
  ready: false, lastSync: null, localAt: 0, drag: null, deferred: null, orderBefore: null, orderTimer: 0,
};

// Collect which entities changed; the router's debounced soft refresh follows.
on('data-changed', (ev) => {
  const raw = ev && ev.entity != null ? String(ev.entity) : 'all';
  for (const e of raw.split(',')) C.pending.add(e.trim().toLowerCase().replace(/s$/, '') || 'all');
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && state.arranging && state.route === 'home' && C.grid?.isConnected && !document.querySelector('.modal-wrap, .popover')) setEditing(false);
});

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const token = (name, fallback) => { const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim(); return v || fallback; };
const ms = (name, fallback) => parseFloat(token(name, `${fallback}ms`)) || fallback;
const undoOpts = (r) => (r?.undoable && r.actionId ? { action: t('undo'), onAction: () => undo(r.actionId) } : {});
const order = () => [...C.grid.children].filter((n) => n.dataset.id).map((n) => n.dataset.id);
const announce = (msg) => { if (C.live) { C.live.textContent = ''; setTimeout(() => { C.live.textContent = msg; }, 30); } };
// Content hash that ignores volatile timestamps (generation time, derived alerts'
// "now"), so an unchanged payload never repaints or flashes its card.
function hashRes(res) {
  return JSON.stringify(res, function (k, v) {
    if (k === 'generated_at') return undefined;
    if (k === 'updated_at' && (this === res || this === res?.data)) return undefined;
    if (k === 'created_at' && this?.derived) return undefined;
    return v;
  });
}

// ============================== render ==============================
export async function renderHome(root, params, { soft = false } = {}) {
  const uid = state.me.user.id;
  if (C.uid !== uid) resetAll(uid);
  else if (C.lang !== getLang()) resetDom();
  const my = ++C.seq;
  root.classList.add('dash');
  const entities = soft ? takePending() : (C.pending.clear(), null);
  if (!C.wrap) buildShell();
  if (!C.extras) buildExtras();
  updateHead();
  const focusBack = rememberFocus();

  if (soft && C.dash) {
    let dash = null;
    try { dash = await api('/api/dashboard'); } catch { /* keep the stale layout */ }
    if (my !== C.seq || state.route !== 'home') return;
    if (dash) applyLayout(dash);
    root.append(C.head, C.extras, C.wrap); refreshExtras();
    focusBack();
    refresh(entities);
    return;
  }
  if (C.dash) {
    // Returning to the page: paint instantly from cache, then revalidate.
    if (!C.ready) applyLayout(C.dash);
    root.append(C.head, C.extras, C.wrap); refreshExtras();
    api('/api/dashboard').then((dash) => { if (my === C.seq) { applyLayout(dash); refresh(null); } }).catch(() => refresh(null));
    return;
  }
  root.append(C.head, C.extras, C.wrap); refreshExtras();
  loadLayout(my);
}

function takePending() {
  if (!C.pending.size) return null;
  const s = new Set(C.pending); C.pending.clear();
  return s.has('all') ? null : s;
}
function resetAll(uid) { C.uid = uid; C.dash = null; C.data.clear(); C.expanded.clear(); C.lastSync = null; resetDom(); }
function resetDom() { C.lang = getLang(); C.cards.clear(); C.head = C.wrap = C.grid = C.editbar = C.emptyEl = C.live = null; C.extras = C.gameSlot = C.wsSlot = null; C.gameHash = C.wsHash = null; C.ready = false; C.drag = null; }

// ============================== excellence journey + my systems ==============================
// Two stable sections above the grid: the gamified "رحلة التميّز" hero (points
// derived from real work) and the department workspace strip — cards from every
// enterprise system the person can open (their role decides what appears).
// Contents are swapped only when the data changes, so soft refreshes never flash.
function buildExtras() {
  C.gameSlot = h('div.home-game');
  C.wsSlot = h('section.ws-strip', { 'aria-label': L('مساحتي في الأنظمة', 'My systems'), hidden: true });
  C.extras = h('div.home-extras', C.gameSlot, C.wsSlot);
}
async function refreshExtras() {
  const [g, ws] = await Promise.all([loadGame().catch(() => null), api('/api/workspace').catch(() => null)]);
  if (!C.extras) return;
  if (g) {
    const hash = JSON.stringify([g.xp, g.level?.n, g.today_xp, g.streak, g.rings, g.quests]);
    if (hash !== C.gameHash) { C.gameHash = hash; C.gameSlot.replaceChildren(gameHero(g)); }
  }
  if (ws) {
    const cards = ws.flatMap((s) => s.cards.map((c) => ({ ...c, sys: s }))).slice(0, 6);
    const hash = JSON.stringify(cards);
    if (hash !== C.wsHash) {
      C.wsHash = hash; C.wsSlot.hidden = !cards.length;
      C.wsSlot.replaceChildren(...(cards.length ? [h('div.section', L('مساحتي في الأنظمة', 'My systems'), h('span.count', L('ما يحتاج انتباهك الآن', 'What needs you now'))), h('div.ws-grid', cards.map(wsCard))] : []));
    }
  }
}

// The router swaps the whole view container; keep keyboard focus where it was.
function rememberFocus() {
  const a = document.activeElement;
  if (!a || a === document.body || !(C.head?.contains(a) || C.wrap?.contains(a))) return () => {};
  return () => requestAnimationFrame(() => { if (a.isConnected && document.activeElement !== a) a.focus({ preventScroll: true }); });
}

async function loadLayout(my) {
  C.grid.classList.remove('grid');
  C.grid.classList.add('is-skeleton');
  C.grid.replaceChildren(...['l', 's', 's', 'm', 'm', 'm'].map((sz) => h(`div.card.dash-card.dash-ph.size-${sz}`, { 'aria-hidden': 'true' }, h('div.sk.sk-title'), h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-60'))));
  C.emptyEl.hidden = true;
  try {
    const dash = await api('/api/dashboard');
    if (my !== C.seq && C.dash) return;
    applyLayout(dash);
    refresh(null);
  } catch (e) {
    if (C.dash) return;
    C.grid.replaceChildren();
    C.emptyEl.hidden = false;
    C.emptyEl.replaceChildren(errorState({ message: L('تعذّر تحميل إعداد الواجهة. تحقّق من الاتصال ثم أعد المحاولة.', 'Couldn’t load your dashboard layout. Check your connection and try again.') }, () => loadLayout(++C.seq)));
  }
}

// ============================== shell (head, edit bar, grid) ==============================
function buildShell() {
  C.headDate = h('span.dash-date');
  C.headTitle = h('h1');
  C.headRole = h('span');
  C.headScope = h('span');
  C.syncEl = h('span.dash-sync');
  C.refreshBtn = h('button.icon-btn.dash-refresh', { type: 'button', onclick: manualRefresh }, icon('refresh'));
  C.editBtn = h('button.btn.dash-edit-btn', { type: 'button', 'aria-pressed': 'false', onclick: () => setEditing(!state.arranging) }, icon('sliders'), h('span.lbl'));
  C.head = h('header.greet.dash-head.home-ask',
    h('div.ha-top', C.headDate, h('div.dash-actions', C.refreshBtn, C.editBtn)),
    h('div.dash-hello.ha-center',
      Chat.orbEl('home'),
      C.headTitle,
      h('div.dash-meta', C.headRole, h('span.sep', { 'aria-hidden': 'true' }, '·'), C.headScope, h('span.sep.sync-sep', { 'aria-hidden': 'true' }, '·'), C.syncEl),
      buildAsk()));

  C.editbar = h('div.dash-editbar.glass-3', { role: 'region', 'aria-label': L('أدوات تخصيص الواجهة', 'Customize tools'), hidden: true },
    h('span.eb-icon', { 'aria-hidden': 'true' }, icon('sliders')),
    h('div.eb-text', h('strong', L('تخصيص الواجهة', 'Customize your dashboard')), h('span', L('اسحب البطاقات لترتيبها، أو غيّر حجمها، أو أزل ما لا تحتاجه.', 'Drag cards to reorder, change their size, or remove what you don’t need.'))),
    h('div.eb-actions',
      h('button.btn.sm', { type: 'button', 'aria-label': t('dash.add'), onclick: addWidgetDialog }, icon('plus'), h('span.lbl', t('dash.add'))),
      h('button.btn.sm.ghost', { type: 'button', 'aria-label': L('استعادة إعداد سابق', 'Restore a layout'), onclick: restoreDialog }, icon('history'), h('span.lbl', L('استعادة إعداد سابق', 'Restore a layout'))),
      h('button.btn.sm.primary', { type: 'button', onclick: () => setEditing(false) }, icon('check'), t('dash.done'))));
  C.grid = h('div.dash-grid');
  C.emptyEl = h('div.card.dash-empty', { hidden: true });
  C.live = h('div.sr-only', { 'aria-live': 'polite' });
  C.wrap = h('div.dash-wrap', C.editbar, C.grid, C.emptyEl, C.live);
}

// ============================== conversation-first prompt ==============================
// ChatGPT-like prompt: typing + Enter (or send) opens the immersive conversation
// and sends; the mic dictates (a spoken request); the wave button starts the
// voice conversation; chips are role-aware starters. The DOM lives in the
// cached head, so a soft refresh never clears what the person is typing.
function buildAsk() {
  const input = h('textarea.ha-input#home-ask-input', { rows: 1, maxlength: 2000, enterkeyhint: 'send', autocomplete: 'off' });
  const send = h('button.ha-send', { type: 'submit', disabled: true }, icon('send'));
  const mic = h('button.icon-btn.ha-mic', { type: 'button', 'aria-pressed': 'false' }, icon('mic'));
  const voice = h('button.ha-voice', { type: 'button' }, Chat.waveIcon(), h('span.ha-voice-l'));
  const grow = () => { input.style.height = 'auto'; input.style.height = `${Math.min(168, input.scrollHeight)}px`; const empty = !input.value.trim(); send.disabled = empty; C.askForm.classList.toggle('has-text', !empty); };
  const submit = () => {
    const text = input.value.trim(); if (!text) { input.focus(); return; }
    if (Chat.isBusy()) { toast(L('طلب آخر قيد التنفيذ — نصّك محفوظ، أرسله بعد اكتماله.', 'Another request is running — your text is kept; send it once that finishes.'), { kind: 'info' }); return; }
    input.value = ''; grow();
    Assistant.ask(text, { from: input });
  };
  input.addEventListener('input', grow);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } });
  mic.addEventListener('click', () => Assistant.dictate({ input, button: mic, onText: grow }));
  voice.addEventListener('click', () => Assistant.openVoice({ from: voice }));
  C.askInput = input; C.askSend = send; C.askMic = mic; C.askVoice = voice;
  C.askForm = h('form.ha-box', { role: 'search', onsubmit: (e) => { e.preventDefault(); submit(); } },
    h('span.ha-lead', { 'aria-hidden': 'true' }, icon('spark')), input, h('div.ha-tools', mic, voice, send));
  C.askChips = h('div.ha-chips', { role: 'group' });
  return h('div.ha-prompt', C.askForm, C.askChips);
}
function paintAsk() {
  const u = state.me.user;
  C.askInput.placeholder = t('ai.ask.ph');
  C.askInput.setAttribute('aria-label', L(`اكتب طلبك للمساعد يا ${L(u.name_ar, u.name_en).split(' ')[0]}`, 'Type your request to the assistant'));
  C.askSend.setAttribute('aria-label', L('إرسال إلى المساعد', 'Send to the assistant')); C.askSend.title = L('إرسال (Enter)', 'Send (Enter)');
  if (!C.askMic.classList.contains('rec')) { C.askMic.setAttribute('aria-label', L('تحدّث', 'Speak')); C.askMic.title = L('تحدّث — يبدأ التسجيل عند الضغط فقط', 'Speak — recording starts only when pressed'); }
  C.askVoice.setAttribute('aria-label', t('ai.voice')); C.askVoice.title = L('محادثة صوتية — تحدّث واستمع دون كتابة', 'Voice conversation — talk and listen hands-free');
  C.askVoice.querySelector('.ha-voice-l').textContent = L('صوت', 'Voice');
  C.askChips.setAttribute('aria-label', L('اقتراحات تناسب دورك', 'Suggestions for your role'));
  const list = Chat.roleSuggestions(4);
  const key = list.map((s) => s.prompt).join('|');
  if (C.askChips.dataset.key !== key) {
    C.askChips.dataset.key = key;
    C.askChips.replaceChildren(...list.map((s) => h('button.ha-chip', { type: 'button', title: s.hint, onclick: (e) => Assistant.ask(s.prompt, { from: e.currentTarget }) }, icon(s.ic), h('span', s.label))));
  }
}

function updateHead() {
  const u = state.me.user;
  const hr = new Date().getHours();
  const greet = hr < 12 ? t('greet.morning') : hr < 17 ? L('نهارك سعيد', 'Good afternoon') : t('greet.evening');
  C.headDate.textContent = `${new Date().toLocaleDateString(L('ar-AE', 'en-GB'), { weekday: 'long', day: 'numeric', month: 'long' })} · ${greet}`;
  C.headTitle.textContent = t('ai.greet').replace('{name}', L(u.name_ar, u.name_en || u.name_ar).split(' ')[0]);
  paintAsk();
  C.headRole.textContent = [t(`role.${u.role}`), L(u.dept_ar, u.dept_en)].filter(Boolean).join(' · ');
  C.headScope.textContent = `${L('نطاق العرض', 'Scope')}: ${u.role === 'president' ? L('المؤسسة (خارج Vault)', 'Organisation (outside Vault)') : u.role === 'manager' ? L('إدارتك', 'Your department') : L('أعمالك', 'Your work')}`;
  C.refreshBtn.setAttribute('aria-label', L('تحديث البيانات', 'Refresh data'));
  C.refreshBtn.setAttribute('data-tip', L('تحديث البيانات', 'Refresh data'));
  paintSync();
  syncEditing();
}
function noteSync(at) { const d = at ? new Date(/Z|\+/.test(at) ? at : `${at.replace(' ', 'T')}Z`) : new Date(); if (!C.lastSync || d > C.lastSync) C.lastSync = d; paintSync(); }
function paintSync() {
  if (!C.syncEl) return;
  C.syncEl.textContent = C.lastSync ? L(`آخر تحديث ${fmtTime(C.lastSync.toISOString())}`, `Updated ${fmtTime(C.lastSync.toISOString())}`) : '';
  C.head?.querySelector('.sync-sep')?.toggleAttribute('hidden', !C.lastSync);
}
async function manualRefresh() {
  if (C.refreshBtn.classList.contains('is-spinning')) return;
  C.refreshBtn.classList.add('is-spinning'); C.refreshBtn.setAttribute('aria-busy', 'true');
  try {
    const dash = await api('/api/dashboard').catch(() => null);
    if (dash) applyLayout(dash);
    await Promise.allSettled([...C.cards.values()].map((c) => load(c, { force: true })));
    C.lastSync = new Date(); paintSync();
    announce(L('حُدّثت بيانات الواجهة.', 'Dashboard data refreshed.'));
  } finally { C.refreshBtn.classList.remove('is-spinning'); C.refreshBtn.removeAttribute('aria-busy'); }
}

// ============================== reconcile ==============================
function applyLayout(dash) {
  if (C.drag) { C.deferred = dash; return; }
  C.dash = dash;
  const grid = C.grid;
  grid.classList.remove('is-skeleton'); grid.classList.add('grid');
  grid.querySelectorAll('.dash-ph').forEach((n) => n.remove());
  const ids = new Set(dash.layout.map((w) => w.id));
  const created = [];
  const mutate = () => {
    for (const [id, c] of C.cards) if (!ids.has(id)) { c.el.remove(); C.cards.delete(id); }
    dash.layout.forEach((w, i) => {
      let c = C.cards.get(w.id);
      if (!c) { c = createCard(w); C.cards.set(w.id, c); created.push(c); }
      else if (c.sig !== JSON.stringify(w)) updateCard(c, w);
      // keep a pending local reorder until it is saved
      if (!C.orderBefore) { const at = grid.children[i]; if (at !== c.el) grid.insertBefore(c.el, at || null); }
      else if (!c.el.parentNode) grid.append(c.el);
    });
  };
  if (C.ready) flip(mutate); else mutate();
  for (const c of created) { if (C.ready) flash(c); if (!C.data.has(c.id)) load(c); }
  paintEmpty();
  C.ready = true;
  syncEditing();
}

function paintEmpty() {
  const empty = !C.dash?.layout.length;
  C.emptyEl.hidden = !empty;
  if (empty) {
    C.emptyEl.replaceChildren(emptyState({
      icon: 'layers', title: L('واجهتك فارغة', 'Your dashboard is empty'),
      body: L('أضف البطاقات التي تهمّك، أو استعد الإعداد الافتراضي المقترح لدورك.', 'Add the cards you care about, or restore the recommended layout for your role.'),
      actions: [{ label: t('dash.add'), icon: 'plus', primary: true, onClick: addWidgetDialog }, { label: L('استعادة الإعداد الافتراضي', 'Restore default layout'), icon: 'history', onClick: () => doRestore({ reset: true }) }],
    }));
  }
}

function refresh(entities) {
  for (const c of C.cards.values()) {
    if (entities && C.data.has(c.id) && !c.errored && !(DEPS[c.w.type] || []).some((d) => entities.has(d))) continue;
    load(c);
  }
}

async function load(c, { force = false } = {}) {
  if (c.loading && !force) return c.loading;
  const seq = ++c.loadSeq;
  if (!C.data.has(c.id) || c.errored) { c.body.replaceChildren(widgetSkeleton(c.w)); c.foot.hidden = true; }
  c.el.setAttribute('aria-busy', 'true');
  const run = (async () => {
    try {
      const res = await fetchWidgetData(c.w);
      if (seq !== c.loadSeq || C.cards.get(c.id) !== c) return;
      const hash = hashRes(res);
      const prev = C.data.get(c.id);
      C.data.set(c.id, { res, hash });
      noteSync(res.updated_at);
      c.staleEl.hidden = true; c.el.classList.remove('is-stale');
      if (!prev || prev.hash !== hash || c.renderedView !== c.w.view || c.errored) {
        paintBody(c);
        if (prev && prev.hash !== hash && Date.now() - C.localAt > 4000) flash(c); // changed elsewhere (assistant, teammate)
      }
    } catch (e) {
      if (seq !== c.loadSeq || e?.status === 404) return;
      if (C.data.has(c.id) && !c.errored) { c.staleEl.hidden = false; c.el.classList.add('is-stale'); } // keep the last good data
      else { c.errored = true; c.body.replaceChildren(widgetError(e, () => load(c, { force: true }))); c.foot.hidden = true; }
    } finally {
      if (seq === c.loadSeq) { c.el.removeAttribute('aria-busy'); c.loading = null; }
    }
  })();
  c.loading = run;
  return run;
}

// ============================== card ==============================
function createCard(w) {
  const c = { id: w.id, w, sig: JSON.stringify(w), loadSeq: 0, loading: null };
  const titleId = `wt-${w.id}`;
  c.iconEl = h('span.dash-ticon', { 'aria-hidden': 'true' });
  c.titleEl = h('h2.card-title', { id: titleId });
  c.countEl = h('span.dash-count', { hidden: true });
  c.demoEl = h('span.chip.tiny.outline.dash-demo', { hidden: true }, L('بيانات تجريبية', 'Demo data'));
  c.staleEl = h('span.dash-stale', { hidden: true, tabindex: 0, role: 'img', 'aria-label': L('تعذّر التحديث — تُعرض آخر بيانات متاحة', 'Couldn’t refresh — showing the last available data'), 'data-tip': L('تعذّر التحديث — تُعرض آخر بيانات متاحة', 'Couldn’t refresh — showing last data') }, icon('clock', 'sm'));
  c.viewsEl = h('div.dash-views', { role: 'group' });
  c.moreBtn = h('button.icon-btn.dash-more', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => cardMenu(c) }, icon('more'));
  c.body = h('div.dash-body');
  c.foot = h('div.card-foot.dash-foot', { hidden: true });
  // edit-mode controls
  c.removeBtn = h('button.dash-remove', { type: 'button', onclick: () => removeCard(c) }, icon('minus'));
  c.grip = h('button.dash-grip', { type: 'button', onpointerdown: (e) => startDrag(e, c), onkeydown: (e) => gripKey(e, c) }, icon('drag'));
  c.upBtn = h('button.icon-btn.dash-move', { type: 'button', onclick: (e) => moveBy(c, -1, e.currentTarget) }, icon('chevronUp'));
  c.downBtn = h('button.icon-btn.dash-move', { type: 'button', onclick: (e) => moveBy(c, 1, e.currentTarget) }, icon('chevronDown'));
  c.sizeBtn = h('button.btn.sm.ghost.dash-size', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: () => sizeMenu(c) }, h('span.lbl'), icon('chevronDown'));
  c.el = h('section.card.dash-card', { 'data-id': w.id, tabindex: -1, 'aria-labelledby': titleId, onkeydown: (e) => cardKey(e, c) },
    c.removeBtn,
    h('div.card-head', h('div.dash-title', c.iconEl, c.titleEl, c.countEl, c.demoEl, c.staleEl), h('div.card-tools', c.viewsEl, c.moreBtn)),
    c.body, c.foot,
    h('div.dash-edit', c.grip, h('div.dash-edit-move', c.upBtn, c.downBtn), c.sizeBtn));
  paintHead(c);
  if (C.data.has(w.id)) paintBody(c); else c.body.replaceChildren(widgetSkeleton(w));
  return c;
}

function paintHead(c) {
  const w = c.w; const title = widgetTitle(w); const size = w.size || 'm';
  c.titleEl.textContent = title;
  c.iconEl.replaceChildren(icon(widgetIcon(w)));
  for (const s of ['s', 'm', 'l']) c.el.classList.toggle(`size-${s}`, s === size);
  c.el.dataset.type = w.type;
  c.el.classList.toggle('selected', state.selectedWidgetId === w.id);
  c.moreBtn.setAttribute('aria-label', L(`خيارات بطاقة «${title}»`, `Options for “${title}”`));
  c.viewsEl.setAttribute('aria-label', L(`طريقة عرض «${title}»`, `View for “${title}”`));
  const views = C.dash?.types?.[w.type]?.views || [];
  const vkey = views.join();
  if (c.viewsKey !== vkey) {
    c.viewsKey = vkey;
    const had = c.viewsEl.contains(document.activeElement) ? document.activeElement.dataset.v : null;
    c.viewsEl.replaceChildren(...(views.length > 1 ? views.map((v) => h('button', { type: 'button', 'data-v': v, 'aria-label': L(...VIEW_META[v].name), 'data-tip': L(...VIEW_META[v].name), onclick: () => setView(c, v) }, icon(VIEW_META[v].icon))) : []));
    if (had) c.viewsEl.querySelector(`[data-v="${had}"]`)?.focus();
  }
  c.viewsEl.hidden = views.length < 2;
  for (const b of c.viewsEl.children) b.setAttribute('aria-pressed', String(b.dataset.v === w.view));
  c.removeBtn.setAttribute('aria-label', L(`إزالة «${title}» من الواجهة`, `Remove “${title}” from the dashboard`));
  c.removeBtn.setAttribute('data-tip', L('إزالة', 'Remove'));
  c.grip.setAttribute('aria-label', L(`نقل «${title}» — اسحب، أو استخدم مفاتيح الأسهم`, `Move “${title}” — drag, or use the arrow keys`));
  c.grip.setAttribute('data-tip', L('اسحب لإعادة الترتيب', 'Drag to reorder'));
  c.upBtn.setAttribute('aria-label', L(`تقديم «${title}»`, `Move “${title}” earlier`)); c.upBtn.setAttribute('data-tip', L('تقديم', 'Move earlier'));
  c.downBtn.setAttribute('aria-label', L(`تأخير «${title}»`, `Move “${title}” later`)); c.downBtn.setAttribute('data-tip', L('تأخير', 'Move later'));
  c.sizeBtn.setAttribute('aria-label', L(`حجم «${title}»: ${SIZE_NAMES[size][0]}`, `Size of “${title}”: ${SIZE_NAMES[size][1]}`));
  c.sizeBtn.querySelector('.lbl').textContent = L(...SIZE_NAMES[size]);
}

function paintBody(c) {
  const entry = C.data.get(c.id);
  if (!entry) return;
  let out;
  try { out = renderWidgetView(c.w, entry.res, { expanded: C.expanded, rerender: () => paintBody(c), onLocalChange: () => { C.localAt = Date.now(); } }); c.errored = false; }
  catch (e) { out = { body: widgetError(e, () => load(c, { force: true })) }; c.errored = true; }
  const a = document.activeElement;
  const key = a && c.body.contains(a) ? a.closest('[data-key]')?.dataset.key || (a.classList.contains('dash-more-link') ? 'more-link' : null) : null;
  const footKey = a && c.foot.contains(a) ? 'more-link' : null;
  c.body.replaceChildren(out.body);
  c.foot.replaceChildren(...(out.foot ? [out.foot] : []));
  c.foot.hidden = !out.foot;
  c.countEl.hidden = !(out.count > 0);
  c.countEl.textContent = out.count > 0 ? fmtNum(out.count) : '';
  c.demoEl.hidden = !out.demo;
  c.empty = !!out.empty;
  for (const b of c.viewsEl.children) b.disabled = c.empty;
  c.renderedView = c.w.view;
  c.body.inert = !!state.arranging;
  if (key) (c.body.querySelector(`[data-key="${CSS.escape(key)}"]`) || c.body.querySelector('.dash-more-link'))?.focus({ preventScroll: true });
  else if (footKey) c.foot.querySelector('.dash-more-link, button')?.focus({ preventScroll: true });
}

function updateCard(c, w) {
  const prev = c.w;
  c.w = w; c.sig = JSON.stringify(w);
  paintHead(c);
  const dataChanged = prev.type !== w.type || JSON.stringify(prev.filters || {}) !== JSON.stringify(w.filters || {}) || prev.sort !== w.sort;
  if (dataChanged) load(c, { force: true });
  else if (prev.view !== w.view) paintBody(c);
  if (C.ready && Date.now() - C.localAt > 4000) flash(c);
}

function flash(c) {
  c.el.classList.remove('flash');
  void c.el.offsetWidth;
  c.el.classList.add('flash');
  clearTimeout(c.flashT);
  c.flashT = setTimeout(() => c.el.classList.remove('flash'), 1600);
}

// FLIP: animate siblings from their old to their new grid position.
function flip(mutate, except) {
  const grid = C.grid;
  if (reduced() || !grid.isConnected) { mutate(); return; }
  const first = new Map([...grid.children].map((e) => [e, e.getBoundingClientRect()]));
  mutate();
  const duration = ms('--dur-slow', 300); const easing = token('--ease-out', 'ease-out');
  for (const e of grid.children) {
    if (e === except) continue;
    const a = first.get(e); if (!a) continue;
    const b = e.getBoundingClientRect();
    const dx = a.left - b.left; const dy = a.top - b.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
    e.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'none' }], { duration, easing });
  }
}

function syncCache(w) { if (C.dash) C.dash = { ...C.dash, layout: C.dash.layout.map((x) => (x.id === w.id ? w : x)) }; }
function adoptLayout(r) { if (r?.result?.dashboard?.layout && C.dash) applyLayout({ ...C.dash, layout: r.result.dashboard.layout }); }

// ============================== card actions ==============================
function discuss(c) {
  const title = widgetTitle(c.w);
  state.selectedWidgetId = c.id;
  for (const x of C.cards.values()) x.el.classList.toggle('selected', x === c);
  Chat.refreshContext();
  Chat.focus(L(`بخصوص بطاقة «${title}»: `, `About the “${title}” card: `));
}

function cardMenu(c) {
  const w = c.w;
  const views = C.dash?.types?.[w.type]?.views || [];
  const res = C.data.get(c.id)?.res;
  const info = h('div.menu-title.dash-src',
    h('div', h('strong', `${t('dash.source')}: `), sourceLabel(res?.source)),
    res?.updated_at ? h('div', `${t('dash.updated')} ${fmtTime(res.updated_at)}`) : null);
  menu(c.moreBtn, [
    views.length > 1 ? { title: L('طريقة العرض', 'View') } : null,
    ...(views.length > 1 ? views.map((v) => ({ label: L(...VIEW_META[v].name), icon: VIEW_META[v].icon, checked: w.view === v, onClick: () => setView(c, v) })) : []),
    views.length > 1 ? { sep: true } : null,
    { label: L('ناقش مع المساعد', 'Discuss with the assistant'), icon: 'chat', onClick: () => discuss(c) },
    { label: L('إعادة تسمية البطاقة', 'Rename card'), icon: 'pencil', onClick: () => renameCard(c) },
    { label: L('تحديث البطاقة', 'Refresh card'), icon: 'refresh', onClick: () => load(c, { force: true }) },
    { label: L('تخصيص الواجهة', 'Customize dashboard'), icon: 'sliders', onClick: () => setEditing(true, c) },
    { sep: true },
    { node: info },
    { sep: true },
    { label: L('إزالة من الواجهة', 'Remove from dashboard'), icon: 'trash', danger: true, onClick: () => removeCard(c) },
  ], { width: 270 });
}

async function renameCard(c) {
  const prev = c.w; const before = widgetTitle(prev);
  const input = h('input.field', { type: 'text', value: before, maxlength: 80, autocomplete: 'off' });
  const ok = await modal(L('إعادة تسمية البطاقة', 'Rename card'), field(L('الاسم', 'Name'), input, { helper: L('اتركه فارغاً لاستعادة الاسم التلقائي.', 'Leave empty to use the automatic name.') }),
    [{ label: t('cancel'), value: null }, { label: t('save'), value: 'ok', primary: true }]);
  if (!ok) return;
  const title = input.value.trim();
  if (title === before) return;
  C.localAt = Date.now();
  c.w = { ...prev, title }; c.sig = JSON.stringify(c.w); syncCache(c.w); paintHead(c);
  const r = await runTool('update_widget', { id: c.id, title }, { quiet: true });
  if (!r || r.status !== 'ok') { c.w = prev; c.sig = JSON.stringify(prev); syncCache(prev); paintHead(c); return; }
  toast(L(`أصبح اسم البطاقة «${widgetTitle(c.w)}»`, `Card renamed to “${widgetTitle(c.w)}”`), undoOpts(r));
}

async function setView(c, v) {
  if (c.w.view === v) return;
  const prev = c.w;
  C.localAt = Date.now();
  c.w = { ...prev, view: v }; c.sig = JSON.stringify(c.w); syncCache(c.w);
  paintHead(c); paintBody(c); // instant, from cached data
  announce(L(`«${widgetTitle(c.w)}»: ${VIEW_META[v].name[0]}`, `“${widgetTitle(c.w)}”: ${VIEW_META[v].name[1]}`));
  const r = await runTool('update_widget', { id: c.id, view: v }, { quiet: true });
  if (!r || r.status !== 'ok') { c.w = prev; c.sig = JSON.stringify(prev); syncCache(prev); paintHead(c); paintBody(c); }
}

async function setSize(c, size) {
  if ((c.w.size || 'm') === size) return;
  const prev = c.w; const title = widgetTitle(prev);
  C.localAt = Date.now();
  flip(() => { c.w = { ...prev, size }; c.sig = JSON.stringify(c.w); syncCache(c.w); paintHead(c); });
  const r = await runTool('update_widget', { id: c.id, size }, { quiet: true });
  if (!r || r.status !== 'ok') { flip(() => { c.w = prev; c.sig = JSON.stringify(prev); syncCache(prev); paintHead(c); }); return; }
  toast(L(`صار حجم «${title}» ${SIZE_NAMES[size][0]}`, `“${title}” is now ${SIZE_NAMES[size][1].toLowerCase()}`), undoOpts(r));
}

function sizeMenu(c) {
  const cur = c.w.size || 'm';
  menu(c.sizeBtn, [{ title: L('حجم البطاقة', 'Card size') }, ...['s', 'm', 'l'].map((s) => ({ label: L(...SIZE_NAMES[s]), hint: L(...SIZE_HINTS[s]), checked: s === cur, onClick: () => setSize(c, s) }))], { width: 220 });
}

async function removeCard(c) {
  const title = widgetTitle(c.w);
  C.localAt = Date.now();
  const next = c.el.nextElementSibling || c.el.previousElementSibling;
  if (!reduced()) await c.el.animate([{ opacity: 1, transform: 'none' }, { opacity: 0, transform: 'scale(0.96)' }], { duration: ms('--dur-fast', 150), easing: token('--ease-out', 'ease-out'), fill: 'forwards' }).finished.catch(() => {});
  flip(() => { c.el.remove(); C.cards.delete(c.id); });
  if (C.dash) C.dash = { ...C.dash, layout: C.dash.layout.filter((w) => w.id !== c.id) };
  paintEmpty();
  if (next?.isConnected) (state.arranging ? next.querySelector('.dash-grip') : next)?.focus({ preventScroll: true });
  const r = await runTool('remove_widget', { id: c.id }, { quiet: true });
  if (!r || r.status !== 'ok') { const dash = await api('/api/dashboard').catch(() => null); if (dash) applyLayout(dash); return; }
  adoptLayout(r);
  toast(L(`أُزيلت بطاقة «${title}»`, `Removed “${title}”`), undoOpts(r));
}

// ============================== edit mode ==============================
function setEditing(on, focusCard) {
  const was = !!state.arranging;
  state.arranging = !!on;
  syncEditing();
  if (was === !!on) return;
  if (on) {
    announce(L('وضع التخصيص مفعّل: اسحب البطاقات أو استخدم أزرار التقديم والتأخير، ثم اضغط «تم».', 'Customize mode on: drag cards or use the move buttons, then press Done.'));
    (focusCard?.grip || C.editbar.querySelector('.btn'))?.focus({ preventScroll: true });
  } else {
    flushOrder();
    announce(L('انتهى التخصيص.', 'Customize mode off.'));
    C.editBtn.focus({ preventScroll: true });
  }
}
function syncEditing() {
  if (!C.grid) return;
  const on = !!state.arranging;
  C.grid.classList.toggle('editing', on);
  C.editbar.hidden = !on;
  C.editBtn.setAttribute('aria-pressed', String(on));
  C.editBtn.classList.toggle('is-on', on);
  C.editBtn.querySelector('.lbl').textContent = on ? L('إنهاء التخصيص', 'Done') : L('تخصيص', 'Customize');
  C.editBtn.setAttribute('aria-label', on ? L('إنهاء تخصيص الواجهة', 'Finish customizing') : L('تخصيص الواجهة', 'Customize dashboard'));
  for (const c of C.cards.values()) { c.body.inert = on; c.el.setAttribute('aria-roledescription', on ? L('بطاقة قابلة للنقل', 'movable card') : L('بطاقة', 'card')); }
}

function moveBy(c, delta, focusEl) {
  const ids = order(); const i = ids.indexOf(c.id);
  const j = Math.max(0, Math.min(ids.length - 1, i + delta));
  const title = widgetTitle(c.w);
  if (i < 0 || i === j) { announce(delta < 0 ? L(`«${title}» في أول الواجهة`, `“${title}” is already first`) : L(`«${title}» في آخر الواجهة`, `“${title}” is already last`)); return; }
  const before = ids.slice();
  const target = C.grid.children[j];
  flip(() => C.grid.insertBefore(c.el, delta < 0 ? target : target.nextElementSibling));
  (focusEl || c.grip).focus({ preventScroll: true });
  c.el.scrollIntoView({ block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
  announce(L(`«${title}» الآن في الموضع ${fmtNum(j + 1)} من ${fmtNum(ids.length)}`, `“${title}” moved to position ${j + 1} of ${ids.length}`));
  queueOrderSave(before);
}
function gripKey(e, c) {
  const rtl = document.documentElement.dir === 'rtl';
  const map = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: rtl ? 1 : -1, ArrowRight: rtl ? -1 : 1, Home: -999, End: 999 };
  if (!(e.key in map)) return;
  e.preventDefault(); e.stopPropagation();
  moveBy(c, map[e.key], c.grip);
}
function cardKey(e, c) {
  if (!state.arranging || !e.altKey || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
  e.preventDefault();
  moveBy(c, e.key === 'ArrowUp' ? -1 : 1, document.activeElement);
}

function queueOrderSave(before) {
  if (!C.orderBefore) C.orderBefore = before;
  clearTimeout(C.orderTimer);
  C.orderTimer = setTimeout(saveOrder, 900);
}
function flushOrder() { if (C.orderBefore) { clearTimeout(C.orderTimer); saveOrder(); } }
async function saveOrder() {
  const before = C.orderBefore; C.orderBefore = null;
  const after = order();
  if (!before || before.join() === after.join()) return;
  C.localAt = Date.now();
  const r = await runTool('reorder_widgets', { order: after }, { quiet: true });
  if (!r || r.status !== 'ok') { const dash = await api('/api/dashboard').catch(() => null); if (dash) applyLayout(dash); return; }
  adoptLayout(r);
  toast(L('حُفظ الترتيب الجديد للبطاقات', 'New card order saved'), undoOpts(r));
}

// Pointer-based drag (mouse, pen and touch) with RTL-aware hit testing and
// FLIP-animated siblings. The grip is the only drag handle (touch-action: none).
function startDrag(e, c) {
  if (!state.arranging || (e.pointerType === 'mouse' && e.button !== 0)) return;
  e.preventDefault();
  const grip = e.currentTarget; const el = c.el; const grid = C.grid;
  grip.setPointerCapture?.(e.pointerId);
  const r = el.getBoundingClientRect();
  const off = { x: e.clientX - r.left, y: e.clientY - r.top };
  const view = document.getElementById('view');
  const drag = C.drag = { c, before: order(), x: e.clientX, y: e.clientY, lock: 0, dy: 0, raf: 0, moved: false };
  el.classList.add('dragging'); grid.classList.add('is-dragging');
  const place = () => {
    el.style.transform = '';
    const lr = el.getBoundingClientRect();
    el.style.transform = `translate(${drag.x - off.x - lr.left}px, ${drag.y - off.y - lr.top}px)`;
  };
  const scrollStep = () => {
    if (!drag.dy || C.drag !== drag) { drag.raf = 0; return; }
    view.scrollTop += drag.dy; place();
    drag.raf = requestAnimationFrame(scrollStep);
  };
  const onMove = (ev) => {
    drag.x = ev.clientX; drag.y = ev.clientY; drag.moved = true;
    const now = performance.now();
    if (now > drag.lock) {
      const target = [...grid.children].find((n) => n !== el && n.dataset.id && inside(n.getBoundingClientRect(), ev.clientX, ev.clientY));
      if (target) {
        const tr = target.getBoundingClientRect(); const rtl = document.documentElement.dir === 'rtl';
        const wide = tr.width > grid.clientWidth * 0.7;
        const first = wide ? ev.clientY < tr.top + tr.height / 2 : rtl ? ev.clientX > tr.left + tr.width / 2 : ev.clientX < tr.left + tr.width / 2;
        const ref = first ? target : target.nextElementSibling;
        if (ref !== el && el.nextElementSibling !== ref) { flip(() => grid.insertBefore(el, ref), el); drag.lock = now + 220; }
      }
    }
    place();
    const vr = view?.getBoundingClientRect();
    if (vr) {
      const edge = 72;
      drag.dy = ev.clientY < vr.top + edge + 40 ? -10 : ev.clientY > vr.bottom - edge ? 10 : 0;
      if (drag.dy && !drag.raf) drag.raf = requestAnimationFrame(scrollStep);
    }
  };
  const onUp = () => {
    grip.removeEventListener('pointermove', onMove); grip.removeEventListener('pointerup', onUp); grip.removeEventListener('pointercancel', onUp);
    drag.dy = 0; cancelAnimationFrame(drag.raf);
    const tf = el.style.transform; el.style.transform = '';
    if (tf && !reduced()) el.animate([{ transform: tf }, { transform: 'none' }], { duration: ms('--dur-normal', 220), easing: token('--ease-out', 'ease-out') });
    el.classList.remove('dragging'); grid.classList.remove('is-dragging');
    C.drag = null;
    const after = order();
    if (drag.before.join() !== after.join()) {
      const i = after.indexOf(c.id);
      announce(L(`«${widgetTitle(c.w)}» الآن في الموضع ${fmtNum(i + 1)} من ${fmtNum(after.length)}`, `“${widgetTitle(c.w)}” moved to position ${i + 1} of ${after.length}`));
      queueOrderSave(drag.before);
    }
    if (C.deferred) { const d = C.deferred; C.deferred = null; applyLayout(d); }
  };
  grip.addEventListener('pointermove', onMove); grip.addEventListener('pointerup', onUp); grip.addEventListener('pointercancel', onUp);
}
const inside = (r, x, y) => x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;

// ============================== add (widget gallery) ==============================
const CATALOG = [
  { group: 'kpi', type: 'kpi', filters: { metric: 'delayed_projects' }, view: 'stat', size: 's', desc: ['عدد المشاريع التي تجاوزت موعدها', 'Projects past their due date'] },
  { group: 'kpi', type: 'kpi', filters: { metric: 'overdue_tasks' }, view: 'stat', size: 's', desc: ['المهام التي فات استحقاقها', 'Tasks past their due date'] },
  { group: 'kpi', type: 'kpi', filters: { metric: 'avg_progress' }, view: 'stat', size: 's', desc: ['متوسط الإنجاز للمشاريع المسجّلة', 'Mean progress of reporting projects'] },
  { group: 'kpi', type: 'kpi', filters: { metric: 'task_completion' }, view: 'stat', size: 's', desc: ['نسبة المهام المنجزة من الكل', 'Share of tasks completed'] },
  { group: 'kpi', type: 'kpi', filters: { metric: 'active_projects' }, view: 'stat', size: 's', desc: ['المشاريع قيد التنفيذ الآن', 'Projects currently in progress'] },
  { group: 'kpi', type: 'kpi', filters: { metric: 'week_done' }, view: 'stat', size: 's', desc: ['ما أُنجز منذ بداية الأسبوع', 'Completed since the week began'] },
  { group: 'list', type: 'summary', filters: {}, view: 'cards', size: 'l', desc: ['أرقام اليوم وما يحتاج إجراءً منك', 'Today’s numbers and what needs you'] },
  { group: 'list', type: 'tasks', filters: { mine: true, open: true }, view: 'list', size: 'm', desc: ['مهامك المفتوحة مع إنجاز سريع', 'Your open tasks, with quick check-off'] },
  { group: 'list', type: 'projects', filters: { delayed: true }, view: 'cards', size: 'm', desc: ['المشاريع المتأخرة ونسب إنجازها', 'Delayed projects and their progress'] },
  { group: 'list', type: 'projects', filters: {}, view: 'cards', size: 'm', desc: ['كل مشاريعك ونسب إنجازها', 'All your projects and their progress'] },
  { group: 'list', type: 'events', filters: {}, view: 'list', size: 'm', desc: ['مواعيد الأسبوعين القادمين', 'Your next two weeks'] },
  { group: 'list', type: 'alerts', filters: {}, view: 'list', size: 'm', desc: ['التنبيهات مرتّبة حسب الأهمية', 'Alerts, most important first'] },
  { group: 'list', type: 'documents', filters: {}, view: 'list', size: 'm', desc: ['آخر المستندات والتقارير', 'Latest documents and reports'] },
  { group: 'chart', type: 'projects', filters: {}, view: 'bar', size: 'm', title: ['تقدم المشاريع', 'Project progress'], desc: ['نسبة إنجاز كل مشروع بالألوان', 'Each project’s progress, colour-coded'] },
  { group: 'chart', type: 'tasks', filters: {}, view: 'donut', size: 'm', title: ['المهام حسب الحالة', 'Tasks by status'], desc: ['توزيع المهام: انتظار، تنفيذ، منجزة', 'To do, in progress and done'] },
  { group: 'chart', type: 'week_progress', filters: {}, view: 'bar', size: 'm', desc: ['المهام المنجزة يوماً بيوم', 'Tasks completed day by day'] },
];
const GROUPS = [['kpi', ['مؤشرات', 'Indicators']], ['list', ['قوائم', 'Lists']], ['chart', ['رسوم بيانية', 'Charts']]];
const catTitle = (o) => (o.title ? L(...o.title) : widgetTitle({ type: o.type, filters: o.filters }));
const catIcon = (o) => (o.group === 'chart' ? VIEW_META[o.view]?.icon || 'chartBar' : widgetIcon({ type: o.type, filters: o.filters }));
const sameFilters = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());

async function addWidgetDialog() {
  const layout = C.dash?.layout || [];
  const isChart = (v) => v === 'bar' || v === 'donut';
  const added = (o) => layout.some((w) => w.type === o.type && sameFilters(w.filters, o.filters) && (o.group === 'chart' ? w.view === o.view : o.group === 'list' ? !isChart(w.view) : true));
  let sel = CATALOG.find((o) => !added(o)) || CATALOG[0];
  let size = sel.size;
  const tiles = new Map();
  const note = h('p.gallery-note', { 'aria-live': 'polite' });
  const sizeSlot = h('div.gallery-size-ctl');
  const paintSize = () => sizeSlot.replaceChildren(segmented(['s', 'm', 'l'].map((s) => [s, L(...SIZE_NAMES[s])]), size, (v) => { size = v; }, { label: L('حجم البطاقة', 'Card size') }));
  const pick = (o) => {
    sel = o; size = o.size;
    for (const [k, b] of tiles) b.setAttribute('aria-pressed', String(k === o));
    note.textContent = added(o) ? L('هذه البطاقة موجودة في واجهتك، وستُضاف نسخة ثانية منها.', 'This card is already on your dashboard; a second copy will be added.') : '';
    paintSize();
  };
  let submit = null;
  const body = h('div.gallery',
    GROUPS.map(([g, name]) => h('section.gallery-group', { 'aria-label': L(...name) }, h('h4.gallery-h', L(...name)),
      h('div.gallery-grid', CATALOG.filter((o) => o.group === g).map((o) => {
        const b = h('button.gallery-tile', { type: 'button', 'aria-pressed': 'false', 'data-group': g, onclick: () => pick(o), ondblclick: () => { pick(o); submit?.click(); } },
          h('span.gt-icon', { 'aria-hidden': 'true' }, icon(catIcon(o))),
          h('span.gt-text', h('span.gt-title', catTitle(o)), h('span.gt-desc', L(...o.desc))),
          added(o) ? h('span.chip.tiny.gt-added', icon('check'), L('مضافة', 'Added')) : null);
        tiles.set(o, b);
        return b;
      })))),
    h('div.gallery-size', h('span.lbl', L('الحجم', 'Size')), sizeSlot),
    note);
  pick(sel);
  const p = modal(L('إضافة بطاقة إلى الواجهة', 'Add a card'), body, [{ label: t('cancel'), value: null }, { label: L('إضافة البطاقة', 'Add card'), value: 'ok', primary: true, icon: 'plus' }], { wide: true });
  setTimeout(() => { submit = body.closest('.modal')?.querySelector('.actions .btn.primary'); tiles.get(sel)?.focus(); }, 60);
  if (!(await p)) return;
  const o = sel; const title = catTitle(o);
  const derived = widgetTitle({ type: o.type, filters: o.filters });
  C.localAt = Date.now();
  const r = await runTool('add_widget', { type: o.type, filters: o.filters, view: o.view, size, title: title !== derived ? title : undefined }, { quiet: true });
  if (!r || r.status !== 'ok') return;
  adoptLayout(r);
  const c = C.cards.get(r.result?.widget?.id);
  if (c) {
    c.el.scrollIntoView({ block: 'center', behavior: reduced() ? 'auto' : 'smooth' });
    flash(c);
    c.el.focus({ preventScroll: true });
  }
  toast(L(`أُضيفت بطاقة «${title}»`, `Added “${title}”`), undoOpts(r));
}

// ============================== restore ==============================
const parseTs = (s) => new Date(/[TZ+]/.test(s) ? s : `${String(s).replace(' ', 'T')}Z`);
function relTime(s) {
  const diff = (parseTs(s) - Date.now()) / 1000; const abs = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(getLang() === 'ar' ? 'ar' : 'en', { numeric: 'auto' });
  if (abs < 45) return L('قبل لحظات', 'moments ago');
  if (abs < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (abs < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  if (abs < 7 * 86400) return rtf.format(Math.round(diff / 86400), 'day');
  return parseTs(s).toLocaleDateString(L('ar-AE', 'en-GB'), { day: 'numeric', month: 'long' });
}
function reasonText(reason = '') {
  const typeName = (tp) => L(...(TYPE_META[tp]?.name || [tp, tp]));
  const known = (id) => { const w = C.dash?.layout.find((x) => x.id === id); return w ? widgetTitle(w) : null; };
  let m;
  if ((m = reason.match(/^add (\w+)/))) return L(`قبل إضافة بطاقة «${typeName(m[1])}»`, `Before adding “${typeName(m[1])}”`);
  if ((m = reason.match(/^update (\S+)/))) { const n = known(m[1]); return n ? L(`قبل تعديل بطاقة «${n}»`, `Before changing “${n}”`) : L('قبل تعديل بطاقة', 'Before changing a card'); }
  if (reason.startsWith('remove')) return L('قبل إزالة بطاقة', 'Before removing a card');
  if (reason === 'reorder') return L('قبل إعادة ترتيب البطاقات', 'Before reordering cards');
  if (reason === 'reset') return L('قبل استعادة الإعداد الافتراضي', 'Before resetting to default');
  if (reason.startsWith('restore')) return L('قبل استعادة إعداد سابق', 'Before restoring a layout');
  return reason || L('تغيير على الواجهة', 'Dashboard change');
}
async function restoreDialog() {
  let versions;
  try { versions = await api('/api/dashboard/versions'); } catch (e) { toast(e.message, { kind: 'error' }); return; }
  let choice = versions.length ? 'prev' : 'reset';
  const opt = (value, title, meta) => h('label.restore-opt',
    h('input', { type: 'radio', name: 'dash-restore', value, checked: value === choice || null, onchange: () => { choice = value; } }),
    h('span.ro-text', h('span.ro-title', title), meta ? h('span.ro-meta', meta) : null));
  const list = h('div.restore-list', { role: 'radiogroup', 'aria-label': L('الإعدادات المحفوظة', 'Saved layouts') },
    versions.length ? opt('prev', L('الإعداد السابق مباشرة', 'The previous layout'), L('يلغي آخر تغيير على الواجهة', 'Reverts the most recent change')) : null,
    versions.map((v) => opt(String(v.version), reasonText(v.reason), `${relTime(v.created_at)} · ${L('النسخة', 'Version')} ${fmtNum(v.version)}`)),
    opt('reset', L('الإعداد الافتراضي', 'Default layout'), L('البطاقات المقترحة لدورك', 'The recommended cards for your role')));
  const ok = await modal(L('استعادة إعداد سابق للواجهة', 'Restore a previous layout'), h('div', h('p.restore-note', icon('info', 'sm'), L('يغيّر طريقة العرض فقط ولا يمسّ بياناتك، ويمكنك التراجع بعدها.', 'This changes the layout only — never your data — and can be undone.')), list),
    [{ label: t('cancel'), value: null }, { label: t('restore'), value: 'ok', primary: true, icon: 'history' }]);
  if (!ok) return;
  await doRestore(choice === 'reset' ? { reset: true } : choice === 'prev' ? {} : { version: Number(choice) });
}
async function doRestore(input) {
  C.localAt = Date.now();
  const r = await runTool('restore_dashboard', input, { quiet: true });
  if (!r || r.status !== 'ok') return;
  adoptLayout(r);
  toast(input.reset ? L('استُعيد الإعداد الافتراضي للواجهة', 'Default layout restored') : L('استُعيد الإعداد السابق للواجهة', 'Previous layout restored'), undoOpts(r));
}

