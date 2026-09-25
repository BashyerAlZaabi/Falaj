// The assistant's face. Three things live here, all built on the one #chat
// engine (chat.js) and the voice engine (voice.js):
//
// 1. The orb (#ai-orb): a floating, breathing brand orb at the bottom
//    inline-end of every page (above the mobile tab bar). Click → immersive
//    conversation; the mic beside it (or a long press) → voice conversation.
//    States: idle · listening (ripples) · thinking (swirl) · speaking (pulses
//    with the voice level) + an attention badge when an answer or a
//    confirmation is waiting while the conversation is off screen.
// 2. Presentation modes of #chat on desktop: closed · side (docked panel, the
//    existing inspector) · immersive (full screen, ChatGPT-like: history rail,
//    centred thread, big composer). Mobile: the Chat tab uses the immersive
//    layout. Esc closes the immersive view and restores focus.
// 3. Voice conversation mode (#ai-voice): a full-screen dialog with a large orb
//    reacting to the real microphone level (WebAudio, only after an explicit
//    action) and to the assistant's voice, live captions, a hands-free loop
//    (listen → send → speak → listen; pauses after two silent turns),
//    interrupt by tapping the orb, mic mute, and explicit confirmations
//    (button, or «نعم» / «لا») for impactful values.
import { h, $, $$, icon, toast, debounce, trapFocus } from './ui.js';
import { L, t } from './i18n.js';
import { state, on, emit } from './state.js';
import * as Chat from './chat.js';
import * as Voice from './voice.js';

const ctl = { setTab: () => {}, setChatVisible: () => {} };
const M = { ready: false, prev: 'closed', returnFocus: null, busy: false, attn: null, long: 0, longFired: false };
const BG = ['#nav', '#main', '#editor', '#tabbar', '#scrim']; // made inert behind full-screen layers
const isMobile = () => innerWidth <= 900;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const chatEl = () => $('#chat');
const isLocal = () => state.me?.assistant?.mode !== 'model';

export const isImmersive = () => !isMobile() && document.body.classList.contains('ai-immersive');
// closed · side · immersive (desktop) | closed · tab (mobile Chat tab)
export function mode() {
  if (isMobile()) return document.body.dataset.tab === 'chat' ? 'tab' : 'closed';
  if (isImmersive()) return 'immersive';
  return chatEl()?.classList.contains('collapsed') ? 'closed' : 'side';
}

// ------------------------------------------------------------------ init
export function init({ setTab, setChatVisible } = {}) {
  if (setTab) ctl.setTab = setTab;
  if (setChatVisible) ctl.setChatVisible = setChatVisible;
  if (M.ready) { buildOrb(); relabel(); sync(); return; }
  M.ready = true;
  buildOrb();
  wireHeader();
  window.addEventListener('swp:voice-mode', (e) => openVoice({ from: e.detail?.from }));
  document.addEventListener('keydown', onKey);
  // Following a link or opening a page from the conversation shows the page, with the conversation docked beside it.
  window.addEventListener('hashchange', () => { if (isImmersive()) dock({ focus: false }); });
  window.addEventListener('resize', debounce(syncLayout, 120));
  document.addEventListener('visibilitychange', () => { document.body.classList.toggle('page-hidden', document.hidden); if (!document.hidden) sync(); loop(); });
  const ed = $('#editor');
  if (ed) new MutationObserver(() => { if (isImmersive() && !ed.classList.contains('collapsed')) dock({ focus: false }); }).observe(ed, { attributes: true, attributeFilter: ['class'] });
  on('ai-busy', (b) => { M.busy = !!b; paint(); });
  on('ai-attention', (a) => setAttention(a));
  on('ai-confirm', (c) => { if (V.open && V.confirm?.id === c.id) confirmed(c.outcome); });
  Voice.on('state', () => { paint(); if (V.open) paintVoice(); });
  syncLayout();
  // A refresh keeps the immersive view (per tab, cheap: session storage only).
  let saved = null; try { saved = sessionStorage.getItem('swp.ai.mode'); } catch { /* storage off */ }
  if (saved === 'immersive' && !isMobile()) openImmersive({ focus: false });
}

// Called by the shell when the side panel or the mobile tab changes.
export function sync() {
  if (!M.ready) return;
  if (Chat.chatVisible()) clearAttention();
  syncLayout();
}

function wireHeader() {
  $('#ai-full')?.addEventListener('click', (e) => openImmersive({ from: $('#btn-ask') || e.currentTarget }));
  $('#ai-dock')?.addEventListener('click', () => dock());
  $('#ai-close')?.addEventListener('click', () => closeImmersive());
}

function syncLayout() {
  const c = chatEl(); if (!c) return;
  if (isMobile() && document.body.classList.contains('ai-immersive')) { leaveImmersive(); ctl.setTab('chat'); }
  c.classList.toggle('immersive', isMobile() || isImmersive());
  if (!isMobile()) { c.classList.remove('rail-open'); $('#ai-rail')?.removeAttribute('inert'); }
  else $('#ai-rail')?.toggleAttribute('inert', !c.classList.contains('rail-open'));
  syncInert();
  emit('ai-mode', mode());
  paint();
}

function syncInert() {
  const cover = isImmersive() || V.open;
  for (const sel of BG) { const el = $(sel); if (el) el.inert = cover; }
  const c = chatEl(); if (c) c.inert = V.open;
}

const focusComposer = () => setTimeout(() => $('#chat-input')?.focus({ preventScroll: true }), 60);
const shown = (el) => !!el && el.isConnected && el.getClientRects().length > 0 && !el.closest('[inert]');
const firstShown = (...els) => els.find(shown) || null;

// ------------------------------------------------------------------ immersive view
export function openImmersive({ focus = true, from = null } = {}) {
  if (!state.me || state.me.external) return;
  clearAttention();
  if (isMobile()) { ctl.setTab('chat'); return; }
  const c = chatEl(); if (!c) return;
  if (isImmersive()) { if (focus) focusComposer(); return; }
  M.prev = c.classList.contains('collapsed') ? 'closed' : 'side';
  const a = from || document.activeElement;
  M.returnFocus = a && a !== document.body && !c.contains(a) ? a : null;
  c.classList.remove('collapsed');
  document.body.classList.add('ai-immersive');
  c.classList.add('immersive');
  if (!reduced()) { c.classList.add('ai-entering'); setTimeout(() => c.classList.remove('ai-entering'), 460); }
  c.setAttribute('role', 'dialog'); c.setAttribute('aria-modal', 'true');
  c.setAttribute('aria-label', L('المحادثة مع المساعد', 'Conversation with the assistant'));
  $('#btn-ask')?.setAttribute('aria-pressed', 'true');
  try { sessionStorage.setItem('swp.ai.mode', 'immersive'); } catch { /* storage off */ }
  syncInert();
  Chat.refreshRail();
  emit('ai-mode', 'immersive');
  paint();
  if (focus) focusComposer();
}

// Leave the full-screen presentation without deciding where the chat goes.
export function leaveImmersive() {
  const c = chatEl(); if (!c) return;
  document.body.classList.remove('ai-immersive');
  c.classList.toggle('immersive', isMobile());
  c.classList.remove('ai-entering', 'rail-open');
  c.removeAttribute('role'); c.removeAttribute('aria-modal'); c.setAttribute('aria-label', 'Ask AI');
  try { sessionStorage.removeItem('swp.ai.mode'); } catch { /* storage off */ }
  syncInert();
}

// Close (Esc / ×): back to how the page was before — docked panel or closed.
export function closeImmersive({ restoreFocus = true } = {}) {
  if (!isImmersive()) return;
  const back = M.prev;
  leaveImmersive();
  ctl.setChatVisible(back === 'side', { remember: false, focus: false });
  emit('ai-mode', mode()); paint();
  if (restoreFocus) {
    const r = M.returnFocus; M.returnFocus = null;
    firstShown(r, $('#ai-orb'), $('#view'))?.focus({ preventScroll: true });
  }
}

// «إرساء بجانب الصفحة»: keep talking while working on the page.
export function dock({ focus = true } = {}) {
  if (!isImmersive()) { ctl.setChatVisible(true, { focus }); return; }
  leaveImmersive();
  M.returnFocus = null;
  ctl.setChatVisible(true, { focus });
  emit('ai-mode', mode()); paint();
}

// Open the conversation full screen and send a request (Home prompt, palette, chips).
export function ask(text, { voice = false, from = null } = {}) {
  const q = String(text || '').trim(); if (!q) return Promise.resolve(null);
  openImmersive({ focus: false, from });
  return Chat.send(q, { voice });
}

function onKey(e) {
  if (!state.me || state.me.external || V.open) return;
  const mod = e.metaKey || e.ctrlKey;
  if (e.key === 'Escape' && isImmersive() && !e.defaultPrevented && !document.querySelector('.modal-wrap, .popover, .palette-wrap, .cmdk')) { e.preventDefault(); closeImmersive(); return; }
  if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 'o' && mode() !== 'closed') { e.preventDefault(); Chat.newConversation(); return; }
  if (mod && e.shiftKey && !e.altKey && e.key.toLowerCase() === 's' && isImmersive()) { e.preventDefault(); Chat.toggleRail(); }
}

// ------------------------------------------------------------------ the orb
function buildOrb() {
  const main = $('#main');
  if (!main || $('#ai-orb')) return;
  const orb = h('button.ai-orb#ai-orb', {
    type: 'button', 'aria-keyshortcuts': '/',
    onclick: (e) => { if (M.longFired) { M.longFired = false; return; } openImmersive({ from: e.currentTarget }); },
    onpointerdown: (e) => { if (e.button !== 0) return; clearTimeout(M.long); M.longFired = false; M.long = setTimeout(() => { M.longFired = true; openVoice({ from: orb }); }, 560); },
    onpointerup: () => clearTimeout(M.long), onpointerleave: () => clearTimeout(M.long), onpointercancel: () => clearTimeout(M.long),
    oncontextmenu: (e) => { if (e.pointerType !== 'mouse') e.preventDefault(); },
  }, Chat.orbEl('fab'), h('span.ai-orb-badge', { 'aria-hidden': 'true' }));
  const mic = h('button.ai-orb-mic#ai-orb-mic', { type: 'button', onclick: (e) => openVoice({ from: e.currentTarget }) }, Chat.waveIcon());
  const label = h('span.ai-orb-label', { 'aria-hidden': 'true' }, h('span.aol-text'), h('kbd', '/'));
  main.append(h('div.ai-orb-wrap#ai-orb-wrap', { 'data-state': 'idle' }, label, mic, orb));
  relabel();
}

export function relabel() {
  const orb = $('#ai-orb'); if (!orb) return;
  if (isImmersive()) chatEl()?.setAttribute('aria-label', L('المحادثة مع المساعد', 'Conversation with the assistant'));
  const base = `${t('ai.orb')} (/)`;
  const extra = M.attn === 'confirm' ? L(' — إجراء بانتظار تأكيدك', ' — an action is waiting for your confirmation') : M.attn ? L(' — وصل رد جديد', ' — a new reply is waiting') : '';
  orb.setAttribute('aria-label', base + extra);
  $('#ai-orb-wrap .aol-text').textContent = M.attn === 'confirm' ? L('بانتظار تأكيدك', 'Needs your confirmation') : M.attn ? L('وصل رد جديد', 'New reply') : t('ai.orb');
  const mic = $('#ai-orb-mic');
  mic.setAttribute('aria-label', t('ai.voice'));
  mic.title = L('محادثة صوتية (أو اضغط مطولاً على الدائرة)', 'Voice conversation (or long-press the orb)');
  if (V.open) buildVoiceTexts();
}

function orbState() {
  const vs = Voice.voiceState();
  return vs === 'listening' || vs === 'transcribing' ? 'listening' : vs === 'speaking' ? 'speaking' : M.busy ? 'thinking' : 'idle';
}
function paint() {
  const s = orbState();
  const wrap = $('#ai-orb-wrap');
  if (wrap) { wrap.dataset.state = s; wrap.querySelector('.aio').dataset.state = s; }
  M.fabShown = shown($('#ai-orb')); // read once per state change, never per animation frame
  for (const o of $$('.home-ask .aio, #chat .welcome .aio')) o.dataset.state = s === 'idle' ? 'idle' : s;
  loop();
}

function setAttention(a) {
  if (Chat.chatVisible() || V.open) return;
  M.attn = a?.kind === 'confirm' ? 'confirm' : 'answer';
  const wrap = $('#ai-orb-wrap'); if (wrap) wrap.dataset.attn = M.attn;
  relabel();
}
function clearAttention() {
  if (!M.attn) return;
  M.attn = null;
  const wrap = $('#ai-orb-wrap'); if (wrap) delete wrap.dataset.attn;
  relabel();
}

// Level loop: only while something is listening or speaking and the page is visible.
let raf = 0;
function needsLoop() { if (document.hidden || reduced()) return false; const s = orbState(); return V.open || s === 'listening' || s === 'speaking'; }
function loop() {
  if (needsLoop()) { if (!raf) raf = requestAnimationFrame(frame); return; }
  if (raf) { cancelAnimationFrame(raf); raf = 0; }
  for (const el of $$('.aio[style]')) el.style.removeProperty('--lvl');
}
function frame(ts) {
  raf = 0;
  let lvl = 0;
  if (Voice.isSpeaking()) lvl = Voice.speakLevel();
  else if (Voice.isRecording() || V.phase === 'listening') {
    lvl = Voice.micLevel();
    if (!lvl && !Voice.hasMeter()) lvl = 0.14 + 0.08 * Math.sin(ts / 240) + 0.05 * Math.sin(ts / 83); // no meter: a calm "I'm listening" wobble
  } else if (V.phase === 'thinking') lvl = 0.06;
  const v = Math.max(0, Math.min(1, lvl)).toFixed(3);
  if (M.fabShown) $('#ai-orb .aio')?.style.setProperty('--lvl', v);
  if (V.open && V.orb) V.orb.style.setProperty('--lvl', v);
  if (needsLoop()) raf = requestAnimationFrame(frame);
}

// ------------------------------------------------------------------ Home helpers
// Dictation into a text field (Home prompt). Low confidence → the text is put
// in the field to review; otherwise it is sent as a voice request.
export function dictate({ input, button, onText }) {
  if (Voice.isRecording()) { Voice.stop(); return; }
  const ph = input.placeholder;
  const setRec = (on) => {
    button.classList.toggle('rec', on); button.setAttribute('aria-pressed', String(on));
    const label = on ? L('إيقاف التسجيل', 'Stop recording') : L('تحدّث', 'Speak');
    button.setAttribute('aria-label', label); button.title = label;
    input.placeholder = on ? L('أستمع… تحدّث الآن', 'Listening… speak now') : ph;
  };
  setRec(true);
  Voice.start((text, { confidence }) => {
    setRec(false);
    if (confidence < 0.55) { input.value = text; onText?.(); input.focus(); toast(L('لم يكن الكلام واضحاً تماماً — راجع النص ثم أرسله.', 'Speech was unclear — review the text, then send.'), { kind: 'info' }); return; }
    input.value = ''; onText?.();
    ask(text, { voice: true, from: button });
  }, (msg) => { setRec(false); toast(msg, { kind: 'error', timeout: 7000 }); }, {
    bar: false,
    onInterim: (txt) => { input.value = txt; onText?.(); },
    onEmpty: () => { setRec(false); toast(L('لم يُلتقط أي كلام — حاول مجدداً أو اكتب طلبك.', 'No speech was captured — try again or type your request.'), { kind: 'info' }); },
  });
}

// ------------------------------------------------------------------ voice conversation mode
const V = { open: false, el: null, orb: null, orbBtn: null, phase: 'idle', silent: 0, turn: 0, micMuted: false, confirm: null, misses: 0, returnFocus: null, sayDone: null, readTimer: 0, noVoiceNoted: false, capText: '', capTimer: 0 };
const YES = /^(نعم|اي|ايوه|ايوا|اجل|بلى|تاكيد|اكد|صحيح|نفذ|موافق|تمام|اكيد|yes|yeah|yep|confirm|ok|okay|sure|correct)/;
const NO = /^(لا|كلا|الغ|الغاء|توقف|لا تنفذ|no|nope|cancel|stop|dont)/;
const norm = (s) => String(s || '').toLowerCase().replace(/[\u064B-\u065F\u0670]/g, '').replace(/[أإآ]/g, 'ا').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
// Readable captions: no markdown marks, ISO dates as local dates (25 سبتمبر), one line per item.
const niceDate = (d) => { const x = new Date(`${d}T12:00:00Z`); return Number.isNaN(x.getTime()) ? d : x.toLocaleDateString(L('ar-AE', 'en-GB'), { day: 'numeric', month: 'long' }); };
const plainText = (s) => String(s || '').replace(/\*\*/g, '').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1$2').replace(/^\s*[•·\-–*]\s+/gm, '').replace(/^#{1,4}\s+/gm, '').replace(/\|/g, ' ').replace(/\b(\d{4}-\d{2}-\d{2})\b/g, (m, d) => niceDate(d)).replace(/[ \t]+/g, ' ').trim();

export const voiceOpen = () => V.open;

export function openVoice({ from = null } = {}) {
  if (V.open || !state.me || state.me.external) return;
  clearAttention();
  V.open = true; V.returnFocus = from || document.activeElement; V.silent = 0; V.micMuted = false; V.confirm = null; V.misses = 0;
  buildVoice();
  document.body.append(V.el);
  document.body.classList.add('ai-voice-open');
  syncInert();
  setTimeout(() => V.orbBtn?.focus({ preventScroll: true }), 40);
  if (Voice.sttMode() === 'none') { unsupported(); return; }
  // Explicit user action (this click) → the microphone level meter may start.
  Voice.openMeter().then((m) => { if (!V.open) m.close(); }).catch(() => { /* no meter: a calm simulated level is used */ });
  listen();
  loop();
}

export function closeVoice() {
  if (!V.open) return;
  V.sayDone?.(false);
  V.open = false; V.turn++; V.confirm = null; V.phase = 'idle';
  clearTimeout(V.readTimer); clearInterval(V.capTimer);
  Voice.abort(); Voice.stopSpeaking(); Voice.closeMeter();
  V.el?.remove(); V.el = null; V.orb = null;
  document.body.classList.remove('ai-voice-open');
  syncInert(); paint(); loop();
  const r = V.returnFocus; V.returnFocus = null;
  firstShown(r, $('#ai-orb'), $('#chat-input'), $('#view'))?.focus({ preventScroll: true });
}

function buildVoice() {
  V.orb = Chat.orbEl('voice');
  V.orbBtn = h('button.vo-orb', { type: 'button', onclick: orbTap }, V.orb);
  V.status = h('p.vo-status', { id: 'ai-voice-status', 'aria-live': 'polite' });
  V.hint = h('p.vo-hint');
  V.youText = h('span.vo-text');
  V.aiSpoken = h('span.vo-spoken'); V.aiRest = h('span.vo-rest');
  V.you = h('p.vo-line.you', { hidden: true }, h('span.vo-who'), V.youText);
  V.ai = h('p.vo-line.ai', { hidden: true }, h('span.vo-who'), h('span.vo-text', V.aiSpoken, V.aiRest));
  V.captions = h('div.vo-captions', V.you, V.ai);
  V.confirmSlot = h('div.vo-confirm', { hidden: true });
  V.note = h('div.vo-note', { hidden: true, role: 'status' });
  V.live = h('p.sr-only', { 'aria-live': 'polite', 'aria-atomic': 'true' }); // the reply, announced once (captions update word by word)
  V.micBtn = h('button.vo-ctl.vo-mic', { type: 'button', 'aria-pressed': 'false', onclick: toggleMic }, icon('mic'), h('span.vo-ctl-l'));
  V.spkBtn = h('button.vo-ctl.vo-spk', { type: 'button', 'aria-pressed': String(Voice.isMuted()), onclick: toggleSpeaker }, icon(Voice.isMuted() ? 'mute' : 'speaker'), h('span.vo-ctl-l'));
  V.textBtn = h('button.vo-ctl.vo-text-btn', { type: 'button', onclick: () => { closeVoice(); openImmersive(); } }, icon('keyboard'), h('span.vo-ctl-l'));
  V.endBtn = h('button.vo-end#ai-voice-end', { type: 'button', onclick: closeVoice }, icon('x'), h('span.vo-end-l'));
  V.title = h('span#ai-voice-title');
  V.modeChip = h('span.chip.tiny.vo-mode');
  V.el = h('div.ai-voice#ai-voice', { role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'ai-voice-title', 'aria-describedby': 'ai-voice-status', 'data-phase': 'idle' },
    h('div.vo-bg', { 'aria-hidden': 'true' }),
    h('header.vo-head', h('span.vo-chip', Chat.waveIcon(), V.title), V.modeChip, h('span.grow'),
      h('button.icon-btn.vo-close', { type: 'button', onclick: closeVoice }, icon('x'))),
    h('div.vo-stage', V.orbBtn, V.status, V.hint),
    h('div.vo-lower', V.captions, V.confirmSlot, V.note, V.live),
    h('footer.vo-controls', V.micBtn, V.endBtn, V.spkBtn, V.textBtn));
  V.el.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); closeVoice(); return; }
    trapFocus(V.el, e);
  });
  buildVoiceTexts();
  setPhase('idle');
}

function buildVoiceTexts() {
  if (!V.el) return;
  V.title.textContent = t('ai.voice');
  V.modeChip.className = `chip tiny vo-mode ${isLocal() ? 'warn' : 'good'}`;
  V.modeChip.textContent = isLocal() ? t('ai.local') : t('ai.model');
  V.you.querySelector('.vo-who').textContent = L('أنت', 'You');
  V.ai.querySelector('.vo-who').textContent = L('المساعد', 'Assistant');
  V.el.querySelector('.vo-close').setAttribute('aria-label', L('إغلاق المحادثة الصوتية', 'Close voice conversation'));
  V.textBtn.querySelector('.vo-ctl-l').textContent = L('الكتابة', 'Type');
  V.textBtn.setAttribute('aria-label', L('التبديل إلى المحادثة الكتابية', 'Switch to typing'));
  V.endBtn.querySelector('.vo-end-l').textContent = L('إنهاء', 'End');
  V.endBtn.setAttribute('aria-label', L('إنهاء المحادثة الصوتية', 'End voice conversation'));
  paintControls();
  if (V.phase) setPhase(V.phase, V.hintText);
}

function paintControls() {
  if (!V.el) return;
  V.micBtn.setAttribute('aria-pressed', String(V.micMuted));
  V.micBtn.replaceChildren(icon(V.micMuted ? 'mic2' : 'mic'), h('span.vo-ctl-l', V.micMuted ? L('إلغاء الكتم', 'Unmute') : L('كتم', 'Mute')));
  V.micBtn.setAttribute('aria-label', V.micMuted ? L('إلغاء كتم الميكروفون', 'Unmute the microphone') : L('كتم الميكروفون', 'Mute the microphone'));
  const m = Voice.isMuted();
  V.spkBtn.setAttribute('aria-pressed', String(m));
  V.spkBtn.replaceChildren(icon(m ? 'mute' : 'speaker'), h('span.vo-ctl-l', m ? L('الصوت مكتوم', 'Voice off') : L('الصوت', 'Voice')));
  V.spkBtn.setAttribute('aria-label', m ? L('تشغيل صوت المساعد', 'Turn the assistant’s voice on') : L('كتم صوت المساعد (تبقى الترجمة النصية)', 'Mute the assistant’s voice (captions stay)'));
}

const PHASES = () => ({
  idle: [L('جاهز', 'Ready'), L('اضغط على الدائرة لتبدأ الحديث', 'Tap the orb to start talking'), L('ابدأ الاستماع', 'Start listening')],
  listening: [L('أستمع…', 'Listening…'), L('تحدّث بشكل طبيعي — اضغط على الدائرة عندما تنتهي', 'Speak naturally — tap the orb when you’re done'), L('إنهاء كلامي الآن', 'I’m done speaking')],
  thinking: [L('أفكّر وأنفّذ…', 'Thinking…'), L('أعمل على طلبك ضمن صلاحياتك', 'Working on your request within your access'), L('جارٍ التنفيذ', 'Working')],
  speaking: [L('يتحدث المساعد', 'Assistant speaking'), L('اضغط على الدائرة للمقاطعة والتحدّث', 'Tap the orb to interrupt and talk'), L('مقاطعة الرد والتحدّث', 'Interrupt and talk')],
  reading: [L('الرد معروض كتابةً', 'Reply shown as text'), L('سأستمع بعد لحظات — اضغط على الدائرة للمتابعة الآن', 'I’ll listen again in a moment — tap the orb to continue now'), L('المتابعة الآن', 'Continue now')],
  confirm: [L('بانتظار تأكيدك', 'Waiting for your confirmation'), L('قل «نعم» للتأكيد أو «لا» للإلغاء، أو استخدم الأزرار', 'Say “yes” to confirm or “no” to cancel, or use the buttons'), L('ابدأ الاستماع', 'Start listening')],
  paused: [L('متوقف مؤقتاً', 'Paused'), L('اضغط على الدائرة للمتابعة', 'Tap the orb to continue'), L('متابعة الاستماع', 'Resume listening')],
  muted: [L('الميكروفون مكتوم', 'Microphone muted'), L('ألغِ الكتم أو اضغط على الدائرة لتتحدث', 'Unmute, or tap the orb to talk'), L('إلغاء الكتم والاستماع', 'Unmute and listen')],
  error: [L('تعذّر الاستماع', 'Couldn’t listen'), '', L('حاول مجدداً', 'Try again')],
  unsupported: [L('المحادثة الصوتية غير متاحة هنا', 'Voice conversation isn’t available here'), '', L('غير متاح', 'Unavailable')],
});
function setPhase(phase, hint) {
  V.phase = phase; V.hintText = hint;
  if (!V.el) return;
  const [status, defHint, orbLabel] = PHASES()[phase] || PHASES().idle;
  V.el.dataset.phase = phase;
  V.status.textContent = status;
  V.hint.textContent = hint ?? defHint;
  V.orbBtn.setAttribute('aria-label', orbLabel);
  V.orbBtn.disabled = phase === 'thinking' || phase === 'unsupported';
  V.orb.dataset.state = phase === 'listening' ? 'listening' : phase === 'thinking' ? 'thinking' : phase === 'speaking' ? 'speaking' : 'idle';
  loop();
}
// Voice engine state → overlay (server speech-to-text has a visible "transcribing" step;
// while a confirmation waits, the orb ripples only while the mic is actually open).
function paintVoice() {
  if (!V.open) return;
  if (V.phase === 'listening' && Voice.voiceState() === 'transcribing') setPhase('thinking', L('أحوّل كلامك إلى نص…', 'Transcribing what you said…'));
  if (V.phase === 'confirm' && V.orb) V.orb.dataset.state = Voice.isRecording() ? 'listening' : 'idle';
}

function note(text, action) {
  if (!V.el) return;
  V.note.hidden = !text;
  V.note.replaceChildren(...(text ? [icon('info', 'sm'), h('span.grow', text), action ? h('button.btn.sm.tertiary', { type: 'button', onclick: action.onClick }, action.icon ? icon(action.icon) : null, action.label) : null] : []));
}
function setYou(text, kind = 'final') {
  if (!V.el) return;
  V.you.hidden = !text;
  V.youText.textContent = text || '';
  V.you.classList.toggle('interim', kind === 'interim' || kind === 'pending');
}
// Captions for the reply: the spoken part is bright, the rest dims until spoken (karaoke).
function setAi(text) {
  if (!V.el) return;
  clearInterval(V.capTimer);
  const p = plainText(text);
  V.capText = p.length > 520 ? `${p.slice(0, 500).replace(/\s+\S*$/, '')}…` : p;
  V.ai.hidden = !V.capText;
  V.aiSpoken.textContent = reduced() ? V.capText : '';
  V.aiRest.textContent = reduced() ? '' : V.capText;
}
function captionTo(i) {
  if (!V.el || reduced()) return;
  const k = Math.min(V.capText.length, Math.max(i, V.aiSpoken.textContent.length));
  const cut = V.capText.indexOf(' ', k); const at = cut < 0 ? V.capText.length : cut;
  V.aiSpoken.textContent = V.capText.slice(0, at); V.aiRest.textContent = V.capText.slice(at);
  V.captions.scrollTop = V.captions.scrollHeight;
}
function captionAll() { if (V.el) { clearInterval(V.capTimer); V.aiSpoken.textContent = V.capText; V.aiRest.textContent = ''; } }

// Speak (or show) a reply; resolves true when it finished, false if interrupted.
function say(text, { caption = true } = {}) {
  return new Promise((resolve) => {
    if (!V.open) { resolve(false); return; }
    const done = (ok) => { if (V.sayDone !== done) return; V.sayDone = null; clearTimeout(V.readTimer); clearInterval(V.capTimer); captionAll(); resolve(ok); };
    V.sayDone?.(false);
    V.sayDone = done;
    if (caption) setAi(text);
    let boundary = false;
    const spoke = !Voice.isMuted() && Voice.speak(text, {
      bar: false, max: 700,
      onStart: () => {
        if (V.sayDone !== done) return;
        setPhase('speaking');
        // No boundary events from this engine → advance the captions at a speaking pace.
        const t0 = performance.now();
        V.capTimer = setInterval(() => { if (!boundary) captionTo(Math.round(((performance.now() - t0) / 1000) * 14)); }, 120);
      },
      onBoundary: (i) => { boundary = true; captionTo(i); },
      onEnd: ({ interrupted }) => done(!interrupted),
    });
    if (spoke) return;
    // Muted, or no voice for this language: the captions carry the reply.
    if (!Voice.isMuted() && !V.noVoiceNoted) { V.noVoiceNoted = true; note(Voice.ttsAvailable() ? L('لا يتوفر صوت عربي على هذا الجهاز — ستظهر الردود كتابةً وأواصل الاستماع.', 'No voice is available on this device — replies appear as text and I keep listening.') : L('نطق الردود غير مدعوم في هذا المتصفح — ستظهر كتابةً.', 'Spoken replies aren’t supported in this browser — they appear as text.')); }
    captionAll();
    setPhase('reading');
    V.readTimer = setTimeout(() => done(true), Math.min(5000, 1400 + plainText(text).length * 22));
  });
}

function listen() {
  if (!V.open) return;
  clearTimeout(V.readTimer);
  if (V.micMuted) { setPhase('muted'); return; }
  if (Chat.isBusy()) { setPhase('thinking'); return; }
  const turn = ++V.turn;
  setPhase(V.confirm ? 'confirm' : 'listening', V.confirm && V.misses ? V.hintText : undefined);
  Voice.start((text, meta) => { if (turn === V.turn) heard(text, meta); },
    (msg, info = {}) => { if (turn === V.turn) voiceError(msg, info); },
    {
      bar: false,
      onStart: () => { if (turn === V.turn && V.open) { if (!V.confirm) setPhase('listening'); } },
      onInterim: (txt, o = {}) => { if (turn === V.turn) setYou(txt, o.pending ? 'pending' : o.final ? 'final' : 'interim'); },
      onEmpty: () => { if (turn === V.turn) silence(); },
    });
}

function silence() {
  if (!V.open) return;
  V.silent++;
  if (V.silent >= 2) { setPhase('paused', L('لم ألتقط كلاماً مرتين — اضغط على الدائرة عندما تكون جاهزاً', 'I didn’t hear anything twice — tap the orb when you’re ready')); return; }
  listen();
}

function voiceError(msg, info) {
  if (!V.open) return;
  if (info.code === 'no-speech') { silence(); return; }
  if (info.code === 'unsupported') { unsupported(); return; }
  setPhase('error', '');
  note(msg, info.retry ? { label: L('حاول مجدداً', 'Try again'), icon: 'mic', onClick: () => { note(''); listen(); } } : { label: L('التبديل إلى الكتابة', 'Switch to typing'), icon: 'keyboard', onClick: () => { closeVoice(); openImmersive(); } });
}

function unsupported() {
  setPhase('unsupported', '');
  note(L('التعرّف على الكلام غير مدعوم في هذا المتصفح. يمكنك متابعة المحادثة بالكتابة — كل شيء آخر يعمل كالمعتاد.', 'Speech recognition isn’t supported in this browser. You can keep the conversation going by typing — everything else works as usual.'),
    { label: L('التبديل إلى الكتابة', 'Switch to typing'), icon: 'keyboard', onClick: () => { closeVoice(); openImmersive(); } });
}

async function heard(text, { confidence = 1 } = {}) {
  if (!V.open) return;
  V.silent = 0;
  setYou(text, 'final');
  note('');
  if (V.confirm) { answerConfirm(text); return; }
  if (confidence < 0.5) { await say(L('لم أسمعك بوضوح. أعد من فضلك.', 'I didn’t catch that clearly. Please say it again.')); if (V.open) listen(); return; }
  setPhase('thinking');
  setAi('');
  const turn = V.turn;
  const final = await Chat.send(text, { voice: true, speak: false });
  if (!V.open || turn !== V.turn) return;
  if (!final) { setPhase('paused', L('طلب آخر قيد التنفيذ — اضغط على الدائرة بعد اكتماله', 'Another request is running — tap the orb once it finishes')); return; }
  const pending = (final.confirmations || [])[0];
  if (V.live) { V.live.textContent = ''; setTimeout(() => { if (V.live) V.live.textContent = plainText(final.text || '').slice(0, 400); }, 40); }
  if (pending) { askConfirm(pending, final); return; }
  await say(final.text || L('تم.', 'Done.'));
  if (V.open && turn === V.turn) listen();
}

async function askConfirm(c) {
  V.confirm = c; V.misses = 0;
  V.confirmSlot.replaceChildren(Chat.confirmCardFor(c));
  V.confirmSlot.hidden = false;
  setPhase('confirm');
  const turn = V.turn;
  await say(L(`${c.summary}. هل أنفّذ؟ قل «نعم» للتأكيد أو «لا» للإلغاء.`, `${c.summary}. Shall I go ahead? Say “yes” to confirm or “no” to cancel.`));
  if (V.open && V.confirm === c && turn === V.turn) listen();
}

function answerConfirm(text) {
  const n = norm(text); const c = V.confirm;
  if (YES.test(n) || NO.test(n)) {
    setPhase('thinking', YES.test(n) ? L('أنفّذ بعد تأكيدك…', 'Running it after your confirmation…') : L('ألغي الإجراء…', 'Cancelling…'));
    Chat.resolveConfirmation(c, YES.test(n)); // outcome arrives through 'ai-confirm'
    return;
  }
  V.misses++;
  if (V.misses >= 2) { setPhase('confirm', L('استخدم زر التأكيد أو الإلغاء أدناه', 'Use the confirm or cancel button below')); return; }
  const turn = V.turn;
  say(L('لم أفهم. قل «نعم» للتأكيد أو «لا» للإلغاء.', 'I didn’t get that. Say “yes” to confirm or “no” to cancel.')).then(() => { if (V.open && V.confirm === c && turn === V.turn) listen(); });
}

async function confirmed(outcome) {
  V.confirm = null;
  V.turn++; Voice.abort();
  const msg = outcome === 'ok' ? L('تم التنفيذ.', 'Done.') : outcome === 'cancelled' ? L('ألغيت الإجراء، ولم يُنفَّذ شيء.', 'Cancelled — nothing was done.') : L('لم يُنفَّذ الإجراء.', 'That action wasn’t done.');
  const turn = V.turn;
  await say(msg);
  if (V.open && turn === V.turn) { setTimeout(() => { if (V.open && !V.confirm) V.confirmSlot.hidden = true; }, 2600); listen(); }
}

function orbTap() {
  if (!V.open) return;
  switch (V.phase) {
    case 'listening': if (Voice.isRecording()) Voice.stop(); else listen(); break;
    case 'speaking': case 'reading': V.turn++; Voice.stopSpeaking(); V.sayDone?.(false); listen(); break;
    case 'thinking': case 'unsupported': break;
    case 'muted': V.micMuted = false; paintControls(); V.silent = 0; listen(); break;
    default: V.silent = 0; note(''); listen();
  }
}

function toggleMic() {
  V.micMuted = !V.micMuted;
  paintControls();
  if (V.micMuted) { V.turn++; Voice.abort(); if (V.phase === 'listening' || V.phase === 'confirm') setPhase('muted'); }
  else if (['muted', 'paused', 'idle'].includes(V.phase)) { V.silent = 0; listen(); }
}
function toggleSpeaker() {
  Voice.setMuted(!Voice.isMuted());
  paintControls();
  if (Voice.isMuted() && V.phase === 'speaking') { V.turn++; V.sayDone?.(false); listen(); }
}

// Mobile: the voice overlay follows the viewport; nothing to do on resize beyond CSS.
export function _debug() { return { mode: mode(), phase: V.phase, open: V.open }; }
