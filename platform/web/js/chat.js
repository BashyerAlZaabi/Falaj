// Ask AI engine: context-aware requests, a live status card
// (understanding → executing → result) with the step log, an execution receipt
// that shows exactly what was done (with undo), confirmations, options,
// downloads, voice, conversation history, and the points real work earned.
//
// The same #chat engine renders in three presentations (see assistant-orb.js):
// the docked side panel, the full-screen immersive conversation (history rail,
// centred thread, starters under the composer) and the mobile Chat tab. The
// voice conversation mode reuses send(), confirmCard() and the voice engine.
import { api, chatStream, rid } from './api.js';
import { h, $, $$, icon, toast, esc, modal, menu, skeleton, emptyState, errorState, debounce } from './ui.js';
import { t, L, fmtTime, fmtDate, fmtNum, getLang } from './i18n.js';
import { state, uiContext, setConversation, emit, on } from './state.js';
import * as Voice from './voice.js';
import * as Editor from './editor.js';
import { current as gameNow, celebrate } from './game.js';

let busy = false;
let uploading = null; // file name while an upload is in flight
let lang0 = null;
let railRows = null; // last GET /api/conversations (rail + header title)
let revealing = null; // { md, finish } while an answer is being progressively revealed

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const isImmersive = () => $('#chat')?.classList.contains('immersive');
export const isBusy = () => busy;
// Is the conversation on screen right now? (side panel, immersive, or the mobile Chat tab)
export function chatVisible() {
  const c = $('#chat'); if (!c || document.hidden) return false;
  if (innerWidth <= 900) return document.body.dataset.tab === 'chat';
  return !c.classList.contains('collapsed');
}

// ---------------------------------------------------------------- the assistant orb (shared markup)
// kinds: 'fab' floating button · 'w' conversation hero · 'home' Home prompt · 'voice' voice mode · 'xs' rail brand
export function orbEl(kind = 'w') {
  return h(`span.aio.aio-${kind}`, { 'aria-hidden': 'true', 'data-state': 'idle' },
    h('span.aio-halo'), h('span.aio-ring'), h('span.aio-ring.r2'),
    h('span.aio-body', h('span.aio-core', h('span.aio-swirl'), h('span.aio-swirl.s2'), h('span.aio-gloss'))),
    h('span.aio-arc'));
}
// "Voice conversation" glyph (Lucide audio-lines), not in the icon set.
export function waveIcon(cls = '') {
  const NS = 'http://www.w3.org/2000/svg';
  const s = document.createElementNS(NS, 'svg');
  for (const [k, v] of Object.entries({ viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.9', 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: `icon ${cls}`.trim(), 'aria-hidden': 'true', focusable: 'false' })) s.setAttribute(k, v);
  for (const d of ['M2 10v3', 'M6 6v11', 'M10 3v18', 'M14 8v7', 'M18 5v13', 'M22 10v3']) { const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); s.append(p); }
  return s;
}

// ---------------------------------------------------------------- role-aware starters
// Derived from /api/me: the person's capabilities (department systems), role and
// the systems they can open. Every prompt is something the assistant can act on.
export function roleSuggestions(n = 4) {
  const me = state.me || {}; const u = me.user || {};
  const caps = new Set(u.caps || []);
  const sys = new Set((me.systems || []).map((s) => s.key));
  const has = (...c) => c.some((x) => caps.has(x));
  const out = [];
  const add = (s) => { if (s && out.length < n && !out.some((o) => o.prompt === s.prompt)) out.push(s); };
  // department capability first (what this person is here to do)
  if (has('strategy.admin') && sys.has('strategy')) add({ ic: 'compass', label: L('وضع المحفظة الاستراتيجية', 'Strategic portfolio status'), hint: L('المبادرات المتعثرة ونسب الإنجاز', 'Stalled initiatives and progress'), prompt: L('ما وضع المحفظة الاستراتيجية؟', 'What is the status of the strategic portfolio?') });
  if (has('performance.hr') && sys.has('performance')) add({ ic: 'chartLine', label: L('حالة تقييمات الأداء', 'Performance review status'), hint: L('ما اكتمل وما يحتاج متابعة', 'What is done and what needs follow-up'), prompt: L('ما حالة تقييمات الأداء؟', 'What is the status of performance reviews?') });
  if (has('audit.head', 'audit.auditor') && sys.has('audit')) add({ ic: 'searchCheck', label: L('ملاحظات التدقيق المفتوحة', 'Open audit findings'), hint: L('حسب الخطورة وموعد المعالجة', 'By severity and remediation date'), prompt: L('ما ملاحظات التدقيق المفتوحة؟', 'What are the open audit findings?') });
  if (has('providers.manage') && sys.has('providers')) add({ ic: 'fileWarning', label: L('وثائق الموردين المنتهية', 'Expiring supplier documents'), hint: L('المنتهية والقريبة من الانتهاء', 'Expired and about to expire'), prompt: L('ما وثائق الموردين المنتهية أو القريبة الانتهاء؟', 'Which supplier documents are expired or about to expire?') });
  if (has('procurement.officer') && sys.has('procurement')) add({ ic: 'cart', label: L('طلبات شراء تنتظرني', 'Purchase requests waiting for me'), hint: L('ما يحتاج إجراءك في المشتريات', 'What needs your action in procurement'), prompt: L('ما طلبات الشراء التي تنتظر إجرائي؟', 'Which purchase requests are waiting for my action?') });
  if (has('integrity.officer') && sys.has('integrity')) add({ ic: 'scale', label: L('إفصاحات تنتظر المراجعة', 'Disclosures awaiting review'), hint: L('تضارب المصالح والهدايا', 'Conflicts of interest and gifts'), prompt: L('ما الإفصاحات التي تنتظر مراجعتي؟', 'Which disclosures are waiting for my review?') });
  // role
  if (u.role === 'president') {
    add({ ic: 'alert', label: L('المشاريع المتأخرة في الجهة', 'Delayed projects organisation-wide'), hint: L('ما تجاوز موعده ونسب إنجازه', 'Past due, with progress'), prompt: L('اعرض المشاريع المتأخرة', 'Show the delayed projects') });
    add({ ic: 'gauge', label: L('مؤشرات الأداء المؤسسي', 'Organisational indicators'), hint: L('قراءة ADAA I ضمن نطاقك', 'ADAA I readings in your scope'), prompt: L('ما مؤشرات الأداء؟', 'What are the performance indicators?') });
  } else if (u.role === 'manager') {
    add({ ic: 'usersRound', label: L('من في فريقي مثقل بالعمل؟', 'Who on my team is overloaded?'), hint: L('توزيع المهام المفتوحة والمتأخرة', 'Open and overdue work per person'), prompt: L('من في فريقي مثقل بالعمل؟', 'Who on my team is overloaded?') });
  } else {
    add({ ic: 'listTodo', label: L('ما مهامي اليوم؟', 'What are my tasks today?'), hint: L('المفتوحة والمستحقة والمتأخرة', 'Open, due and overdue'), prompt: L('ما مهامي اليوم؟', 'What are my tasks today?') });
  }
  // everyone
  add({ ic: 'sparkle', label: L('جهّز ملخص يومي', 'Prepare my daily summary'), hint: L('المهام والمواعيد والتنبيهات في نظرة', 'Tasks, events and alerts at a glance'), prompt: L('جهّز لي ملخص اليوم', 'Prepare my daily summary') });
  if (u.role !== 'employee') add({ ic: 'fileText', label: L('تقرير المشاريع المتأخرة', 'Delayed projects report'), hint: L('مستند Word/PDF جاهز للمراجعة', 'A Word/PDF document ready to review'), prompt: L('ابنِ تقريراً عن المشاريع المتأخرة', 'Build a report on delayed projects'), xp: 'document' });
  add({ ic: 'calendarDays', label: L('مواعيدي القادمة', 'My upcoming meetings'), hint: L('الأسبوعان القادمان', 'The next two weeks'), prompt: L('ما مواعيدي؟', 'What are my meetings?') });
  add({ ic: 'bot', label: L('وكيل لملخص الصباح', 'A morning summary agent'), hint: L('يجهّز ملخصك كل يوم الساعة 7', 'Prepares your summary daily at 7'), prompt: L('ابنِ وكيلاً يجهّز ملخص اليوم كل صباح الساعة 7', 'Build an agent that prepares my daily summary every morning at 7'), xp: 'agent' });
  return out;
}

const isLocal = () => state.me?.assistant?.mode !== 'model';
const first = (name) => String(name || '').split(' ')[0];
const PLACEHOLDER = () => L('اسأل أو اطلب أي شيء…', 'Ask or request anything…');
// Arabic count phrases: 1 → singular, 2 → dual, 3–10 → plural, 11+ → singular accusative
const countAr = (n, [one, two, few, many]) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${fmtNum(n)} ${few}` : `${fmtNum(n)} ${many}`);
const nActions = (n) => L(countAr(n, ['إجراء واحد', 'إجراءان', 'إجراءات', 'إجراءً']), `${n} action${n === 1 ? '' : 's'}`);
const nSteps = (n) => L(countAr(n, ['خطوة واحدة', 'خطوتان', 'خطوات', 'خطوة']), `${n} step${n === 1 ? '' : 's'}`);
const toDate = (s) => new Date(!s ? Date.now() : s.endsWith('Z') || s.includes('+') ? s : s.replace(' ', 'T') + 'Z');

// ---------------------------------------------------------------- init
export function init() {
  labelControls();
  const mode = h('button.chip.tiny.ai-mode#ai-mode', { type: 'button', 'aria-haspopup': 'menu', 'aria-expanded': 'false', onclick: (e) => aiModeInfo(e.currentTarget) });
  $('#ai-mode').replaceWith(mode);
  paintMode();

  // live region for results (the stream itself is not announced twice)
  const body = $('#chat-body');
  body.removeAttribute('aria-live');
  body.setAttribute('aria-label', L('المحادثة مع المساعد', 'Conversation with the assistant'));
  $('#chat').append(h('div.sr-only#chat-live', { 'aria-live': 'polite', 'aria-atomic': 'true' }));

  // composer: context tokens live inside the input box; keyboard hint; jump-to-latest
  const box = $('.composer-box');
  box.prepend($('#context-bar'));
  box.append(h('div.drop-label', { 'aria-hidden': 'true' }, icon('upload'), L('أفلت الملف لإرفاقه بطلبك', 'Drop the file to attach it')));
  $('.composer-row .spacer')?.append(h('span.composer-hint', { 'aria-hidden': 'true' }, h('kbd', '↵'), L(' إرسال', ' send'), h('span.sep', '·'), h('kbd', '⇧↵'), L(' سطر جديد', ' new line')));
  const jump = h('button.jump-latest.glass-4', { type: 'button', 'aria-label': L('الانتقال إلى أحدث رسالة', 'Jump to the latest message'), title: L('أحدث رسالة', 'Latest message'), onclick: () => scroll(true) }, icon('chevronDown'));
  $('#chat .composer').prepend(jump);
  body.addEventListener('scroll', () => jump.classList.toggle('show', body.scrollHeight - body.scrollTop - body.clientHeight > 160), { passive: true });

  const input = $('#chat-input');
  input.removeAttribute('data-i18n-ph'); // placeholder is owned here (short, never wraps)
  input.placeholder = PLACEHOLDER();
  input.setAttribute('enterkeyhint', 'send');
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } };
  input.oninput = () => { autosize(); syncSend(); };
  syncSend();

  // Stop only when the button shows "stop" (nothing typed); typed text is always sent.
  $('#btn-send').onclick = () => { if (canStop() && !$('#chat-input').value.trim()) stopOutput(); else submit(); };
  $('#chat-collapse').onclick = () => { $('#chat').classList.remove('expanded'); window.dispatchEvent(new CustomEvent('swp:chat-visible', { detail: false })); };
  $('#chat-expand').onclick = () => { $('#chat').classList.toggle('expanded'); labelControls(); };
  $('#chat-new').onclick = () => newConversation();
  $('#chat-history').onclick = () => (isImmersive() ? toggleRail(true) : showHistory());
  $('#ai-rail-toggle')?.addEventListener('click', () => toggleRail());
  $('#btn-voice-mode')?.addEventListener('click', () => window.dispatchEvent(new CustomEvent('swp:voice-mode', { detail: { from: $('#btn-voice-mode') } })));
  $('#btn-attach').onclick = () => $('#file-input').click();
  $('#file-input').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) uploadFile(f); };
  $('#btn-mic').onclick = startVoice;
  $('#voice-stop').onclick = () => Voice.dismiss();
  $('#btn-mute').onclick = () => {
    Voice.setMuted(!Voice.isMuted()); setMuteIcon();
    announce(Voice.isMuted() ? L('كُتم الرد الصوتي؛ ستصلك الردود كتابةً فقط.', 'Voice replies muted; replies will be text only.') : L('فُعّل الرد الصوتي للطلبات الصوتية.', 'Voice replies on for spoken requests.'));
  };
  setMuteIcon();
  // Esc stops a recording (or closes the mobile history drawer) from anywhere inside the panel
  $('#chat').addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (Voice.isRecording()) { e.stopPropagation(); Voice.stop(); return; }
    if ($('#chat').classList.contains('rail-open')) { e.stopPropagation(); toggleRail(false); $('#chat-history')?.focus(); }
  });
  initDrop();
  buildRail();
  buildStarters();
  // Empty conversation → the immersive layout centres the greeting, composer and starters.
  new MutationObserver(syncEmpty).observe(body, { childList: true });
  syncEmpty();
  Voice.on('state', () => syncSend());
  on('ai-mode', () => { paintTitle(); if (isImmersive() && !railRows) refreshRail(); });
  on('data-changed', () => setTimeout(() => { const qs = $('#chat-body .welcome .quest-strip'); const g = gameNow(); if (qs && g) drawQuests(qs, g); }, 2500));
  load();
}

function syncEmpty() {
  const b = $('#chat-body'); if (!b) return;
  const empty = !b.querySelector('.msg.user, .stage, .chat-skeleton, .msg.assistant:not(.welcome)');
  $('#chat').classList.toggle('is-empty', empty);
  const st = $('#ai-starters'); if (st) st.hidden = !empty;
  paintTitle();
}

function labelControls() {
  lang0 = getLang();
  const set = (sel, ic, label) => { const b = $(sel); if (!b) return; b.replaceChildren(icon(ic)); b.setAttribute('aria-label', label); b.title = label; };
  const ex = $('#chat').classList.contains('expanded');
  set('#chat-collapse', 'sidebarR', L('إخفاء المساعد', 'Hide assistant'));
  set('#chat-new', 'plus', t('ai.new'));
  set('#chat-history', 'history', t('ai.history'));
  set('#chat-expand', ex ? 'shrink' : 'expand', ex ? L('تصغير اللوحة', 'Narrow panel') : L('توسيع اللوحة', 'Widen panel'));
  $('#chat-expand').setAttribute('aria-pressed', String(ex));
  set('#btn-attach', 'clip', L('إرفاق ملف (حتى 8MB)', 'Attach a file (up to 8MB)'));
  set('#btn-send', 'send', L('إرسال', 'Send'));
  $('#btn-send').append(icon('square', 'stop-glyph'));
  set('#ai-full', 'maximize', t('ai.full'));
  set('#ai-dock', 'sidebarR', t('ai.dock'));
  set('#ai-close', 'x', L('إغلاق المحادثة (Esc)', 'Close conversation (Esc)'));
  set('#ai-rail-toggle', 'sidebar', L('إظهار المحادثات السابقة', 'Show conversation history'));
  const vm = $('#btn-voice-mode');
  if (vm) { vm.replaceChildren(waveIcon()); vm.setAttribute('aria-label', L('محادثة صوتية', 'Voice conversation')); vm.title = L('محادثة صوتية — تحدّث واستمع دون كتابة', 'Voice conversation — talk and listen hands-free'); }
  const mic = $('#btn-mic'); mic.replaceChildren(icon('mic'));
  if (!Voice.isRecording()) { mic.setAttribute('aria-label', L('تحدّث', 'Speak')); mic.title = L('تحدّث — يبدأ التسجيل عند الضغط فقط', 'Speak — recording starts only when pressed'); }
  const rail = $('#ai-rail'); if (rail) rail.setAttribute('aria-label', L('المحادثات', 'Conversations'));
}

function paintMode() {
  const b = $('#ai-mode'); if (!b) return;
  const model = !isLocal();
  b.className = `chip tiny ai-mode ${model ? 'good' : 'warn'}`;
  b.replaceChildren(h('span.dot', { 'aria-hidden': 'true' }), model ? t('ai.model') : t('ai.local'));
  b.setAttribute('aria-label', L(`وضع المساعد: ${model ? t('ai.model') : t('ai.local')} — تفاصيل`, `Assistant mode: ${model ? t('ai.model') : t('ai.local')} — details`));
}

function aiModeInfo(anchor) {
  const a = state.me.assistant || {};
  const model = !isLocal();
  const status = a.status ? L(a.status.label_ar, a.status.label_en) : '';
  const info = h('div.ai-mode-info',
    h('p', model
      ? L(`متصل بنموذج لغوي (${a.provider || '—'}). يفهم الطلبات المركّبة وينفّذها ضمن صلاحياتك، ويطلب تأكيدك قبل أي إجراء حساس.`, `Connected to a language model (${a.provider || '—'}). It understands multi-part requests and acts within your permissions, asking before anything sensitive.`)
      : L('يعمل المساعد الآن بوضع الأوامر المحلية: ينفّذ الطلبات الواضحة مباشرة (ملخص اليوم، المهام، تحديث التقدم، التقارير، البطاقات) دون نموذج لغوي.', 'The assistant is running on local commands: it carries out clear requests (daily summary, tasks, progress updates, reports, cards) without a language model.')),
    !model ? h('p.faint', L('اكتب طلباً واحداً واضحاً في كل مرة، مثل: «حدّث تقدم هذا المشروع إلى 60%».', 'Write one clear request at a time, e.g. “Update this project’s progress to 60%”.')) : null,
    a.degraded && status && state.me.user?.is_admin ? h('p.faint', icon('info', 'sm'), ` ${L('حالة خدمة النموذج (للمشرفين)', 'Model service (admins)')}: `, h('bdi', status)) : null);
  menu(anchor, [
    { title: model ? L('نموذج لغوي متصل', 'Language model connected') : L('وضع الأوامر المحلية', 'Local command mode') },
    { node: info },
    { sep: true },
    { label: L('ماذا يمكنني أن أطلب؟', 'What can I ask?'), icon: 'help', onClick: () => send(L('ماذا تستطيع أن تفعل؟', 'What can you do?')) },
  ], { align: 'start', width: 300 });
}

function setMuteIcon() {
  const m = Voice.isMuted(); const b = $('#btn-mute');
  b.replaceChildren(icon(m ? 'mute' : 'speaker'));
  b.setAttribute('aria-pressed', String(m));
  b.setAttribute('aria-label', L('كتم الرد الصوتي', 'Mute voice replies'));
  b.title = m ? L('الرد الصوتي مكتوم — اضغط لتفعيله', 'Voice replies muted — press to turn on') : L('الرد الصوتي مفعّل للطلبات الصوتية — اضغط للكتم', 'Voice replies on for spoken requests — press to mute');
}

function autosize() { const i = $('#chat-input'); i.style.height = 'auto'; i.style.height = `${Math.min(isImmersive() ? 220 : 160, i.scrollHeight)}px`; }
// Send button states: send · busy (the server is executing — it cannot be
// stopped safely mid-way) · stop (skip the reveal / stop the spoken reply).
const canStop = () => !busy && (!!revealing || Voice.isSpeaking());
function syncSend() {
  const b = $('#btn-send'); if (!b) return;
  const empty = !$('#chat-input').value.trim();
  const stop = canStop() && empty;
  b.disabled = !stop && (busy || empty);
  b.classList.toggle('is-busy', busy);
  b.classList.toggle('is-stop', stop);
  b.setAttribute('aria-label', busy ? L('جارٍ تنفيذ الطلب…', 'Working on your request…') : stop ? L('إيقاف', 'Stop') : L('إرسال', 'Send'));
  b.title = busy ? L('يُنفَّذ طلبك الآن', 'Your request is running') : stop ? (Voice.isSpeaking() ? L('إيقاف الرد الصوتي', 'Stop the spoken reply') : L('عرض الرد كاملاً', 'Show the full reply')) : L('إرسال (Enter)', 'Send (Enter)');
  // An empty composer offers the voice conversation instead of a dimmed send (ChatGPT pattern).
  $('#chat .composer-row')?.classList.toggle('offer-voice', empty && !busy && !stop);
}
function stopOutput() {
  revealing?.finish();
  if (Voice.isSpeaking()) Voice.stopSpeaking();
  syncSend();
}
function announce(text) { const r = $('#chat-live'); if (!r) return; r.textContent = ''; setTimeout(() => { r.textContent = text; }, 30); }

function startVoice() {
  if (Voice.isRecording()) { Voice.stop(); return; }
  const input = $('#chat-input');
  Voice.start((text, { confidence }) => {
    if (confidence < 0.55) { input.value = text; autosize(); syncSend(); input.focus(); addNote(L('لم يكن الكلام واضحاً تماماً — راجع النص ثم أرسله.', 'Speech was unclear — review the text, then send.'), { kind: 'warn' }); return; }
    send(text, { voice: true });
  }, (err, info = {}) => addNote(err, { kind: 'warn', icon: 'mic', action: info.retry ? { label: L('حاول مجدداً', 'Try again'), icon: 'mic', onClick: startVoice } : null }));
}

// ---------------------------------------------------------------- load / welcome
let loadSeq = 0;
async function load() {
  const body = $('#chat-body');
  const my = ++loadSeq;
  revealing?.finish();
  paintRail();
  if (state.conversationId) {
    body.replaceChildren(chatSkeleton());
    try {
      const c = await api(`/api/conversations/${state.conversationId}`);
      if (my !== loadSeq) return;
      body.replaceChildren();
      renderHistory(c.messages || []);
      scroll(true);
      paintTitle(c.title);
      return;
    } catch { if (my !== loadSeq) return; setConversation(null); }
  }
  body.replaceChildren();
  welcome();
  paintRail();
}

// Open a conversation from the rail / history (current one: just focus the composer).
export function openConversation(id) {
  if (id !== state.conversationId) { setConversation(id); load(); }
  if (innerWidth <= 900) toggleRail(false);
  $('#chat-input')?.focus();
}

function chatSkeleton() {
  return h('div.chat-skeleton', { 'aria-busy': 'true', 'aria-label': L('جارٍ تحميل المحادثة', 'Loading conversation') },
    h('div.sk.sk-bubble.user'), h('div.sk-assist', h('div.sk.sk-circle'), h('div.grow', h('div.sk.sk-line.w-80'), h('div.sk.sk-line.w-60'), h('div.sk.sk-line.w-40'))), h('div.sk.sk-bubble.user.short'));
}

function renderHistory(messages) {
  const body = $('#chat-body');
  // The server records each confirmation's outcome as a follow-up message.
  const outcomeOf = (summary, from) => {
    for (let j = from + 1; j < messages.length; j++) {
      const m = messages[j];
      if (m.role !== 'assistant' || !m.content || !summary || !m.content.includes(summary)) continue;
      if (/^تم التنفيذ بعد التأكيد/.test(m.content)) return 'ok';
      if (/^أُلغي الإجراء/.test(m.content)) return 'cancelled';
    }
    return null;
  };
  messages.forEach((m, i) => {
    if (m.role === 'user') { body.append(userBubble(m.content, { ...m.meta, at: m.created_at, historic: true })); return; }
    const r = m.meta?.status ? { ...m.meta } : { text: m.content, status: m.meta?.status };
    if (r.text == null) r.text = m.content;
    r.at = m.created_at;
    r.confirmations = (r.confirmations || []).map((c) => ({ ...c, outcome: outcomeOf(c.summary, i), created: m.created_at }));
    body.append(assistantBubble(r, true));
  });
  if (!messages.length) welcome();
}

export function newConversation() {
  setConversation(null);
  loadSeq++;
  revealing?.finish();
  $('#chat-body').replaceChildren();
  welcome();
  paintRail();
  if (innerWidth <= 900) toggleRail(false);
  $('#chat-input').focus();
  announce(L('بدأت محادثة جديدة', 'New conversation started'));
}

function suggestButton(s, cls = 'suggest') {
  return h(`button.${cls}`, { type: 'button', 'data-xp': s.xp || null, 'data-prompt': s.prompt, onclick: () => send(s.prompt) },
    h('span.s-icon', icon(s.ic)),
    h('span.grow', h('span.s-label', s.label), h('span.s-hint', s.hint)),
    h('span.s-xp'),
    icon('arrowUpRight', 's-go flip-rtl'));
}

function welcomeEl() {
  const u = state.me.user;
  const list = h('ul.suggest-list', roleSuggestions(4).map((s) => h('li', suggestButton(s))));
  const quests = h('section.quest-strip', { 'aria-label': L('مهام اليوم', "Today's quests") });
  const el = h('div.msg.assistant.welcome', { 'data-lang': getLang() },
    h('div.w-hero',
      orbEl('w'),
      h('h3.w-title', t('ai.greet').replace('{name}', first(L(u.name_ar, u.name_en || u.name_ar)))),
      h('p.w-sub', L('اكتب طلبك أو تحدّث به، وسأنفّذه ضمن صلاحياتك وأُريك كل خطوة. أفهم «هذا المشروع» و«المستند المفتوح» من الصفحة الحالية.', 'Type or speak a request — I’ll carry it out within your permissions and show every step. I understand “this project” and “the open document” from the current page.')),
      h('ul.trust-row', { 'aria-label': L('ضمانات', 'Safeguards') },
        h('li', icon('shield'), L('ضمن صلاحياتك', 'Within your access')),
        h('li', icon('undo'), L('قابل للتراجع', 'Undoable')),
        h('li', icon('lock'), L('تأكيد قبل الحساس', 'Asks before sensitive steps')))),
    isLocal() ? h('button.w-mode', { type: 'button', onclick: () => aiModeInfo($('#ai-mode')) }, icon('info', 'sm'), h('span', L('يعمل الآن بوضع الأوامر المحلية — ما معنى ذلك؟', 'Running on local commands — what does that mean?'))) : null,
    h('div.w-section', h('h4.w-eyebrow', L('جرّب أن تطلب', 'Try asking')), list),
    quests);
  hydrateGame(list, quests);
  return el;
}

function welcome() { $('#chat-body').append(welcomeEl()); }

// Immersive empty state: the same role-aware starters as cards under the composer.
function buildStarters() {
  const host = $('#ai-starters'); if (!host) return;
  host.setAttribute('role', 'group');
  host.setAttribute('aria-label', L('اقتراحات للبدء', 'Suggestions to get started'));
  const list = h('ul.starter-list', roleSuggestions(4).map((s) => h('li', suggestButton(s, 'starter'))));
  host.replaceChildren(list,
    h('p.starter-foot',
      icon('shield', 'sm'), h('span', L('ضمن صلاحياتك · قابل للتراجع · يطلب تأكيدك قبل الحساس', 'Within your access · undoable · asks before anything sensitive')),
      isLocal() ? h('button.starter-mode', { type: 'button', onclick: () => aiModeInfo($('#ai-mode')) }, L('وضع الأوامر المحلية', 'Local command mode')) : null));
  hydrateGame(list, null);
}

// Points & quests come only from GET /api/game/me (via game.js, or directly).
function whenGame(fn) {
  let n = 0;
  const tryIt = () => {
    const g = gameNow();
    if (g) return fn(g);
    if (++n < 8) return setTimeout(tryIt, 300);
    api('/api/game/me').then(fn).catch(() => fn(null));
  };
  tryIt();
}
const rulePts = (g, k) => g?.rules?.find((r) => r.key === k)?.points;
function hydrateGame(list, host) {
  whenGame((g) => {
    $$('.suggest[data-xp]', list).forEach((b) => {
      const p = rulePts(g, b.dataset.xp); const slot = b.querySelector('.s-xp');
      if (p && slot) { slot.replaceWith(h('span.xp-hint', { title: L(`تكسب حتى ${p} نقاط تميّز عند التنفيذ (ضمن الحد اليومي)`, `Earns up to ${p} excellence points (within the daily cap)`), 'aria-label': L(`حتى ${p} نقاط تميّز`, `up to ${p} excellence points`) }, icon('sparkle'), h('bdi.num', `+${fmtNum(p)}`))); }
    });
    if (host) drawQuests(host, g);
  });
}
function drawQuests(host, g) {
  if (!g?.quests?.length) { host.remove(); return; }
  const open = g.quests.filter((q) => !q.done);
  const done = g.quests.length - open.length;
  const qp = rulePts(g, 'quest');
  const go = () => { if (innerWidth <= 900) import('./app.js').then((m) => m.setTab('home')); };
  host.replaceChildren(
    h('div.qs-head',
      h('span.qs-title', icon('target'), L('مهام اليوم', "Today's quests")),
      h('span.qs-count.tabular', { 'aria-label': L(`${done} من ${g.quests.length} مكتملة`, `${done} of ${g.quests.length} done`) }, `${fmtNum(done)}/${fmtNum(g.quests.length)}`),
      h('span.grow'),
      qp ? h('span.qs-xp', icon('sparkle', 'sm'), h('bdi.num', `+${fmtNum(qp)}`), L(' لكل مهمة', ' each')) : null),
    h('div.qs-bar', { role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': g.quests.length, 'aria-valuenow': done, 'aria-label': L('تقدّم مهام اليوم', "Today's quest progress") }, h('i', { style: { width: `${Math.round((done / g.quests.length) * 100)}%` } })),
    open.length
      ? h('ul.qs-list', open.slice(0, 2).map((q) => h('li', h('a.qs-item', { href: q.cta?.route || '#/achievements', onclick: go }, h('span.qs-icon', icon(q.icon || 'target')), h('span.grow', L(q.ar, q.en)), icon('chevron', 'flip-rtl')))))
      : h('p.qs-done', icon('checkCheck', 'sm'), L('أنجزت كل مهام اليوم — أحسنت!', 'All of today’s quests are done — great work!')));
}

// ---------------------------------------------------------------- context tokens
const VIEW_NAMES = () => ({ home: 'Unified Portal', adaa: 'ADAA I', projects: L('المشاريع', 'Projects'), tasks: L('المهام', 'Tasks'), documents: L('المستندات', 'Documents'), office: L('مكتب الوكلاء', 'Agents Office'), achievements: L('إنجازاتي', 'Achievements'), apps: L('تطبيقاتي', 'My Apps'), uploader: 'Smart Uploader', admin: L('إدارة المنصة', 'Admin') });

export function refreshContext() {
  const bar = $('#context-bar'); if (!bar) return;
  if (lang0 && lang0 !== getLang()) { // language switched: relabel controls, the greeting, starters and rail
    labelControls(); paintMode(); setMuteIcon();
    $('#chat-input').placeholder = PLACEHOLDER();
    const w = $('#chat-body .welcome'); if (w) w.replaceWith(welcomeEl());
    buildStarters();
    const rail = $('#ai-rail'); if (rail) { delete rail.dataset.ready; buildRail(); paintRail(); }
    syncSend(); paintTitle();
  }
  const chips = [];
  const chip = (ic, label, { full, clear, kind, lead } = {}) => h(`span.ctx-chip${kind ? '.' + kind : ''}`, { title: full || label },
    ic === 'spinner' ? h('span.spinner') : icon(ic),
    lead ? h('span.ctx-lead', lead) : null,
    h('bdi.ctx-label', label),
    clear ? h('button.ctx-x', { type: 'button', 'aria-label': L(`إزالة «${full || label}» من سياق الطلب`, `Remove “${full || label}” from the request context`), onclick: () => { clear(); refreshContext(); $('#chat-input').focus(); } }, icon('x')) : null);
  chips.push(chip('pin', VIEW_NAMES()[state.route] || state.route, { kind: 'here', full: L(`الصفحة الحالية: ${VIEW_NAMES()[state.route] || state.route}`, `Current page: ${VIEW_NAMES()[state.route] || state.route}`) }));
  if (state.selectedProjectId && state.projectName) chips.push(chip('folder', state.projectName, { lead: L('المشروع', 'Project'), full: L(`المشروع: ${state.projectName}`, `Project: ${state.projectName}`), clear: () => { state.selectedProjectId = null; } }));
  if (state.openDocumentId && Editor.currentTitle()) chips.push(chip('fileText', Editor.currentTitle(), { lead: L('المستند', 'Doc'), full: L(`المستند المفتوح: ${Editor.currentTitle()} — أغلقه لإزالته من السياق`, `Open document: ${Editor.currentTitle()} — close it to remove it from context`) }));
  if (state.selectedWidgetId) chips.push(chip('grid', L('بطاقة محددة', 'Selected card'), { clear: () => { state.selectedWidgetId = null; $$('.card.selected').forEach((c) => c.classList.remove('selected')); } }));
  if (uploading) chips.push(chip('spinner', L(`جارٍ رفع «${uploading}»…`, `Uploading “${uploading}”…`), { kind: 'busy' }));
  else if (state.lastUploadId) chips.push(chip('clip', state.lastUploadName, { kind: 'file', full: L(`ملف مرفق: ${state.lastUploadName}`, `Attached file: ${state.lastUploadName}`), clear: () => { state.lastUploadId = null; } }));
  bar.replaceChildren(h('span.sr-only', L('يُرسَل مع طلبك:', 'Sent with your request:')), ...chips);
}

// Bring the conversation on screen (docked side panel unless the immersive
// view is already open) and focus the composer, optionally with a prefix.
export function focus(prefix = '') {
  if (window.innerWidth <= 900) import('./app.js').then((m) => m.setTab('chat'));
  else if ($('#chat').classList.contains('collapsed')) window.dispatchEvent(new CustomEvent('swp:chat-visible', { detail: true }));
  const i = $('#chat-input'); if (prefix && !i.value.startsWith(prefix)) i.value = prefix + i.value;
  autosize(); syncSend(); i.focus({ preventScroll: true });
}

function submit() {
  const text = $('#chat-input').value.trim();
  if (!text) return;
  if (busy) { toast(L('طلب آخر قيد التنفيذ — نصّك محفوظ، أرسله بعد اكتماله.', 'Another request is running — your text is kept; send it once that finishes.'), { kind: 'info' }); return; }
  $('#chat-input').value = ''; autosize();
  send(text);
}

// Keep the newest content in view. `anchor`: show this element's top when the
// new block is taller than the viewport (read answers from their start).
function scroll(force = false, anchor = null) {
  const b = $('#chat-body');
  if (anchor) {
    const top = anchor.getBoundingClientRect().top - b.getBoundingClientRect().top + b.scrollTop - 12;
    b.scrollTop = b.scrollHeight - top <= b.clientHeight ? b.scrollHeight : top;
    return;
  }
  if (force || b.scrollHeight - b.scrollTop - b.clientHeight < 240) b.scrollTop = b.scrollHeight;
}

function addNote(text, { kind = 'info', icon: ic, action } = {}) {
  const note = h(`div.chat-note.${kind}`, { role: kind === 'warn' ? 'alert' : 'status' }, icon(ic || (kind === 'warn' ? 'circleAlert' : 'info')), h('span.grow', text),
    action ? h('button.btn.sm.tertiary', { type: 'button', onclick: () => { note.remove(); action.onClick(); } }, action.icon ? icon(action.icon) : null, action.label) : null);
  $('#chat-body').append(note); scroll(true);
  return note;
}

// ---------------------------------------------------------------- messages
function userBubble(text, meta = {}) {
  const files = (meta.attachments || []).map((a) => (/^up_/.test(a) ? L('ملف مرفق', 'Attached file') : a));
  const at = meta.at || new Date().toISOString();
  return h('div.msg.user', { title: `${fmtDate(at)} ${fmtTime(at)}` },
    h('div.msg-text', { dir: 'auto' }, text),
    meta.voice ? h('div.msg-tag', icon('mic'), L('إدخال صوتي', 'Voice input')) : null,
    files.length ? h('div.msg-tag', icon('clip'), h('bdi', files.join('، '))) : null,
    h('time.sr-only', { datetime: at }, fmtTime(at)));
}

const STATUS = {
  done: ['good', 'circleCheck'], ok: ['good', 'circleCheck'], partial: ['warn', 'circleAlert'], failed: ['crit', 'circleX'],
  needs_confirmation: ['warn', 'shieldAlert'], needs_input: ['info', 'messageSquare'], cancelled: ['', 'circleDashed'],
};
const statusLabel = (s) => (s === 'cancelled' ? L('أُلغي', 'Cancelled') : t(`status.${s}`));
function statusPill(s) { const [cls, ic] = STATUS[s] || ['', 'info']; return h(`span.chip.tiny${cls ? '.' + cls : ''}.status-pill`, icon(ic), statusLabel(s)); }

// Localized, readable data sources: "portal.db (projects, tasks)" → المشاريع · المهام
const SRC = { projects: ['المشاريع', 'Projects'], tasks: ['المهام', 'Tasks'], events: ['المواعيد', 'Events'], alerts: ['التنبيهات', 'Alerts'], documents: ['المستندات', 'Documents'], kpis: ['المؤشرات', 'Indicators'], widgets: ['البطاقات', 'Cards'], project_allocations: ['تخصيص الموارد', 'Resource allocations'], allocations: ['تخصيص الموارد', 'Resource allocations'], conversations: ['المحادثات', 'Conversations'], office_runs: ['أعمال الوكلاء', 'Agent runs'] };
function sourceRow(src) {
  const m = String(src).match(/^(.*?)(?:[،,]\s*(\d{1,2}:\d{2}))?\s*$/);
  const what = (m?.[1] || src).trim(); const time = m?.[2];
  const db = what.match(/^portal\.db\s*\(([^)]+)\)$/);
  const parts = db ? db[1].split(/\s*,\s*/).map((k) => (SRC[k] ? L(...SRC[k]) : k)) : null;
  return h('div.msg-source', { title: L('مصدر البيانات', 'Data source') }, icon('database', 'sm'), h('span.sr-only', L('المصدر: ', 'Source: ')),
    parts ? parts.map((p) => h('span.src-chip', p)) : h('bdi.src-chip', what),
    time ? h('span.src-time.tabular', h('bdi', time)) : null);
}

// Safe markdown for answers: escape first, then lists, headings, tables, bold, code.
// ISO dates become readable local dates (e.g. 25 سبتمبر) that never break mid-token.
let dateLang = 'ar';
function isoDate(d) {
  const x = new Date(`${d}T12:00:00Z`); if (Number.isNaN(x.getTime())) return d;
  const opt = { day: 'numeric', month: 'short' }; if (x.getUTCFullYear() !== new Date().getFullYear()) opt.year = 'numeric';
  return x.toLocaleDateString(dateLang === 'ar' ? 'ar-AE' : 'en-GB', opt);
}
function inline(s) {
  return esc(s)
    .replace(/«[^»]*»|\b(\d{4}-\d{2}-\d{2})\b/g, (m, d) => (d ? `<time datetime="${d}">${esc(isoDate(d))}</time>` : m.replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<bdi dir="ltr">$&</bdi>')))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/(^|[\s(])_(.+?)_(?=[\s).,،:؛]|$)/g, '$1<em>$2</em>');
}
function renderRich(text) {
  dateLang = /[\u0600-\u06FF]/.test(text || '') ? 'ar' : getLang();
  const lines = String(text || '').replace(/\r/g, '').split('\n');
  const out = []; const notes = []; let source = null; let para = []; let list = null; let table = null;
  const flushPara = () => { if (para.length) out.push(`<p>${para.map(inline).join('<br>')}</p>`); para = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((x) => `<li>${inline(x)}</li>`).join('')}</${list.tag}>`); list = null; };
  const flushTable = () => {
    if (!table) return;
    const [head, ...rows] = table;
    out.push(`<div class="md-table"><table><thead><tr>${head.map((c) => `<th>${inline(c)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`);
    table = null;
  };
  const flush = () => { flushPara(); flushList(); flushTable(); };
  const filled = lines.filter((x) => x.trim());
  for (const raw of lines) {
    const line = raw.trim(); let m;
    if (!line) { flush(); continue; }
    // A short opening line that starts in bold is the answer's title (e.g. "**ملخص يوم …** — name").
    if (!out.length && !para.length && !list && line === filled[0]?.trim() && filled.length > 2 && /^\*\*[^*]+\*\*/.test(line) && line.length <= 90) { out.push(`<h4 class="md-lead">${inline(line)}</h4>`); continue; }
    if ((m = line.match(/^_(?:المصدر|Source)\s*:\s*(.+?)_$/))) { flush(); source = m[1]; continue; }
    if ((m = line.match(/^_\((.+)\)_$/))) { flush(); notes.push(m[1]); continue; }
    if (/^\|.*\|$/.test(line)) {
      flushPara(); flushList();
      if (/^\|?[\s:|-]+\|?$/.test(line) && line.includes('-')) continue; // separator row
      (table ||= []).push(line.slice(1, -1).split('|').map((c) => c.trim()));
      continue;
    }
    flushTable();
    if ((m = line.match(/^#{1,4}\s+(.+)$/)) || (m = line.match(/^\*\*([^*]+?)\*\*\s*$/))) { flush(); out.push(`<h4>${inline(m[1].replace(/[:：]\s*$/, ''))}</h4>`); continue; }
    if ((m = line.match(/^[•·\-–*]\s+(.+)$/))) { flushPara(); if (list?.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = line.match(/^\d{1,2}[.)]\s+(.+)$/))) { flushPara(); if (list?.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    flushList(); para.push(line);
  }
  flush();
  return { html: out.join(''), source, notes };
}
const plain = (s) => String(s || '').replace(/\*\*/g, '').replace(/(^|\s)_(.+?)_(?=\s|$)/g, '$1$2');

function assistantBubble(r, historic = false, extra = {}) {
  const el = h('div.msg.assistant', { 'data-status': r.status || null });
  const content = h('div.msg-body');
  el.append(h('span.ai-glyph', { 'aria-hidden': 'true' }), content);
  const failed = r.status === 'failed' && !r.actions?.length;
  const rich = renderRich(r.text || '');

  if (failed) content.append(h('div.msg-error', icon('circleX'), h('div.md', { dir: 'auto', html: rich.html || esc(statusLabel('failed')) })));
  else {
    if (r.status && !['done', 'ok'].includes(r.status) && !r.actions?.length) content.append(h('div.msg-status', statusPill(r.status)));
    content.append(h('div.md', { dir: 'auto', html: rich.html }));
  }
  if (r.recovered) content.append(h('div.notes', icon('refresh', 'sm'), h('span', L('استُرجعت النتيجة بعد انقطاع الاتصال — لم يتكرر أي إجراء.', 'Result recovered after the connection dropped — nothing ran twice.'))));
  if (r.replayed) content.append(h('div.notes', icon('history', 'sm'), h('span', L('نُفّذ هذا الطلب سابقاً؛ هذه نتيجته المحفوظة دون تكرار أي إجراء.', 'This request already ran; showing its saved result without repeating anything.'))));

  // What was actually executed (mutations), each with its outcome and undo.
  if (r.actions?.length) {
    const okN = r.actions.filter((a) => a.status === 'ok').length;
    content.append(h('section.receipt', { 'data-status': r.status || null, 'aria-label': L('ما نُفّذ فعلياً', 'What was actually done') },
      h('header.receipt-head', statusPill(r.status || (okN ? 'done' : 'failed')), h('span.grow'), h('span.receipt-count', receiptCount(okN, r.actions.length, r.actions.filter((a) => a.status === 'needs_confirmation').length))),
      h('ul.receipt-list', r.actions.map((a) => actionRow(a, historic)))));
  }
  if (extra.steps?.length && extra.steps.length > (r.actions?.length || 0)) {
    content.append(h('details.run-log', h('summary', icon('listChecks', 'sm'), L(`سجل التنفيذ · ${nSteps(extra.steps.length)}`, `Run log · ${nSteps(extra.steps.length)}`)), stepList(extra.steps)));
  }
  for (const c of r.confirmations || []) { content.append(confirmCard(c, historic)); if (historic && c.outcome) syncReceipt(content, c.tool, c.outcome); }
  if (r.options?.length && !historic) {
    content.append(h('div.options.next-steps', { role: 'group', 'aria-label': L('خيارات للمتابعة', 'Ways to continue') },
      r.options.map((o) => h('button.btn.sm.tertiary.option-chip', { type: 'button', onclick: () => send(o.value) }, o.label))));
  }
  if (r.downloads?.length) {
    content.append(h('div.files', r.downloads.map((d) => {
      const fmt = String(d.format || '').toLowerCase(); const kind = fmt === 'docx' ? 'Word (.docx)' : fmt === 'pdf' ? 'PDF' : fmt.toUpperCase();
      return h('a.file-row', { href: d.url, download: '', 'aria-label': L(`تنزيل «${d.title}» — ${kind}`, `Download “${d.title}” — ${kind}`) },
        h('span.f-icon', icon('fileDown')), h('span.grow', h('bdi.f-title', d.title), h('span.f-kind', kind)), icon('download', 'f-go'));
    })));
  }
  const row = [];
  if (r.open_document) row.push(h('button.btn.sm.tertiary', { type: 'button', onclick: () => Editor.open(r.open_document) }, icon('fileText'), L('فتح المستند', 'Open document')));
  if (r.refresh?.includes('office')) row.push(h('a.btn.sm.tertiary', { href: '#/office' }, icon('bot'), L('فتح مكتب الوكلاء', 'Open Agents Office')));
  // short text drafts: copy / continue editing in the composer
  if (/\*\*مسودة/.test(r.text || '') || /\*\*Draft/.test(r.text || '')) {
    const draft = (r.text || '').replace(/\*\*[^*]+\*\*\n?/, '').split('\n\n')[0];
    row.push(h('button.btn.sm', { type: 'button', onclick: () => copy(draft, L('نُسخت المسودة إلى الحافظة', 'Draft copied to the clipboard')) }, icon('copy'), L('نسخ المسودة', 'Copy draft')));
    row.push(h('button.btn.sm', { type: 'button', onclick: () => { const i = $('#chat-input'); i.value = draft; autosize(); syncSend(); i.focus(); } }, icon('pencil'), L('تعديل في مربع الكتابة', 'Edit in the composer')));
  }
  if (extra.retry) row.push(h('button.btn.sm.primary', { type: 'button', onclick: () => { el.remove(); extra.retry(); } }, icon('refresh'), L('إعادة المحاولة', 'Try again')));
  if (extra.rephrase) row.push(h('button.btn.sm', { type: 'button', onclick: () => { const i = $('#chat-input'); i.value = extra.rephrase; autosize(); syncSend(); i.focus(); } }, icon('pencil'), L('عدّل الطلب', 'Edit request')));
  if (row.length) content.append(h('div.actions-row', row));

  const notes = [...(r.notes || []).filter((n) => !(isLocal() && /خدمة النموذج اللغوي غير متصلة/.test(n))), ...rich.notes];
  if (notes.length) content.append(h('div.notes', icon('info', 'sm'), h('span', notes.join(' '))));
  if (rich.source) content.append(sourceRow(rich.source));

  // hover/focus action bar: copy + time (history included)
  const at = r.at || new Date().toISOString();
  if (r.text) content.append(h('div.msg-actions',
    h('button.icon-btn.sm-btn', { type: 'button', 'aria-label': L('نسخ الرد', 'Copy reply'), title: L('نسخ الرد', 'Copy reply'), onclick: () => copy(plain(r.text), L('نُسخ الرد إلى الحافظة', 'Reply copied to the clipboard')) }, icon('copy')),
    h('time.msg-time', { datetime: at }, fmtTime(at))));
  return el;
}

function copy(text, done) {
  const ok = () => toast(done); const fail = () => toast(L('تعذّر النسخ — حدّد النص وانسخه يدوياً.', 'Could not copy — select the text and copy it manually.'), { kind: 'error' });
  if (!navigator.clipboard) { fail(); return; }
  navigator.clipboard.writeText(text).then(ok, fail);
}

function receiptCount(ok, n, pending = 0) { return ok === n ? nActions(n) : !ok && pending ? L('لم يُنفَّذ شيء بعد', 'Nothing done yet') : L(`نُفّذ ${fmtNum(ok)} من ${fmtNum(n)}`, `${ok} of ${n} done`); }
function stepIcon(status) { return status === 'ok' ? ['ok', 'circleCheck'] : status === 'needs_confirmation' ? ['wait', 'circleAlert'] : ['err', 'circleX']; }
function stepList(steps) {
  return h('ul.steps', steps.map((s) => { const [cls, ic] = stepIcon(s.status); return h(`li.${cls}`, icon(ic), h('span.grow', s.label, s.error ? h('span.step-err', ` — ${s.error}`) : null)); }));
}

function actionRow(a, historic) {
  const st = a.status === 'ok' ? 'ok' : a.status === 'error' ? 'err' : 'wait';
  const label = a.label || a.tool;
  const li = h(`li.${st}`, { 'data-tool': a.tool || null }, icon(st === 'ok' ? 'circleCheck' : st === 'err' ? 'circleX' : 'circleAlert'),
    h('span.grow',
      h('span.sr-only', st === 'ok' ? L('نُفّذ: ', 'Done: ') : st === 'err' ? L('تعذّر: ', 'Failed: ') : L('معلّق: ', 'Pending: ')),
      h('span.a-label', label),
      a.error ? h('span.a-note', a.error) : st === 'wait' ? h('span.a-note', L('بانتظار تأكيدك — لم يُنفَّذ بعد', 'Awaiting your confirmation — not done yet')) : null));
  if (a.status === 'ok' && a.undoable && a.actionId && !historic) li.append(h('button.btn.sm.ghost.undo-btn', { type: 'button', 'aria-label': L(`تراجع عن «${label}»`, `Undo “${label}”`), onclick: (e) => undoAction(a, li, e.currentTarget) }, icon('undo'), t('undo')));
  return li;
}

async function undoAction(a, li, btn) {
  const label = a.label || a.tool;
  btn.disabled = true; btn.classList.add('is-loading');
  let r;
  try { r = await api(`/api/actions/${a.actionId}/undo`, { method: 'POST' }); } catch (e) { r = e.body || { error: e.message }; }
  btn.classList.remove('is-loading');
  if (r?.status === 'ok') {
    li.classList.add('undone');
    btn.replaceWith(h('span.chip.tiny.undone-chip', icon('undo'), L('تم التراجع', 'Undone')));
    toast(L(`تراجعتُ عن «${label}»`, `Undid “${label}”`));
  } else { btn.disabled = false; toast(r?.error || L('تعذّر التراجع', 'Could not undo'), { kind: 'error' }); }
  emit('data-changed', { entity: 'all' });
}

// ---------------------------------------------------------------- confirmations
const RISK = (c) => (c.reason === 'delete' ? 'destructive' : c.reason === 'voice_value' ? 'verify' : 'sensitive');
function confirmCard(c, historic) {
  const risk = RISK(c);
  const title = { destructive: L('إجراء نهائي — يحتاج تأكيدك', 'Permanent action — needs your confirmation'), sensitive: L('تغيير حساس — يحتاج تأكيدك', 'Sensitive change — needs your confirmation'), verify: L('تحقّق مما سمعتُه قبل التنفيذ', 'Check what I heard before it runs') }[risk];
  const verb = { destructive: L('احذف نهائياً', 'Delete permanently'), sensitive: L('نعم، نفّذ', 'Yes, run it'), verify: L('صحيح، نفّذ', 'Correct, run it') }[risk];
  const ic = { destructive: 'trash', sensitive: 'shieldAlert', verify: 'mic' }[risk];
  const card = h('div.confirm-card', { 'data-risk': risk, 'data-cid': c.id || null, role: 'group', 'aria-label': title },
    h('div.cc-head', h('span.cc-icon', icon(ic)), h('strong.cc-title', title)),
    h('p.cc-summary', c.summary));
  // History: the outcome is known; a recent unresolved request can still be answered (the server enforces expiry).
  const age = Date.now() - toDate(c.created || '').getTime();
  if (historic && c.outcome) setOutcome(card, c.outcome);
  else if (historic && !(age < 15 * 60e3)) setOutcome(card, 'expired');
  else {
    card.append(h('p.cc-foot', L('لن يُنفَّذ شيء قبل أن تؤكّد.', 'Nothing runs until you confirm.')),
      h('div.cc-actions',
        h('button.btn.sm.cc-cancel', { type: 'button', onclick: () => resolveConfirm(c, false, card) }, t('cancel')),
        h('button.btn.sm.danger', { type: 'button', onclick: () => resolveConfirm(c, true, card) }, icon(risk === 'destructive' ? 'trash' : 'check'), verb)));
  }
  return card;
}

function setOutcome(card, outcome, err) {
  card.querySelector('.cc-actions')?.remove(); card.querySelector('.cc-foot')?.remove();
  card.dataset.outcome = outcome;
  const [ic, text] = {
    ok: ['circleCheck', L('تم التنفيذ', 'Done')],
    cancelled: ['circleDashed', L('أُلغي — لم يُنفَّذ شيء', 'Cancelled — nothing was done')],
    failed: ['circleX', `${L('لم يُنفَّذ', 'Not done')}${err ? `: ${err}` : ''}`],
    expired: ['clock', L('لم يُنفَّذ — لم يُسجَّل تأكيد خلال المهلة', 'Not done — no confirmation within the time limit')],
  }[outcome];
  card.append(h(`div.cc-outcome.${outcome}`, { role: 'status' }, icon(ic), h('span', text)));
}

// The same confirmation can be on screen twice (conversation + voice mode):
// every copy (matched by data-cid) shows the busy state and the outcome.
const pendingConfirms = new Set();
async function resolveConfirm(c, accept, card) {
  if (pendingConfirms.has(c.id)) return null;
  pendingConfirms.add(c.id);
  const copies = () => { const all = c.id ? $$(`.confirm-card[data-cid="${CSS.escape(c.id)}"]`) : []; return all.includes(card) ? all : [card, ...all]; };
  for (const k of copies()) {
    $$('.cc-actions button', k).forEach((b) => (b.disabled = true));
    (accept ? k.querySelector('.btn.danger') : k.querySelector('.cc-cancel'))?.classList.add('is-loading');
  }
  const before = gameNow();
  let outcome = 'failed'; let err = null;
  try {
    const r = await api(`/api/confirmations/${c.id}`, { method: 'POST', body: { accept } });
    outcome = r.status === 'ok' ? 'ok' : r.status === 'cancelled' ? 'cancelled' : 'failed'; err = r.error;
    for (const k of copies()) { setOutcome(k, outcome, r.error); syncReceipt(k.closest('.msg-body'), c.tool, outcome); }
    announce(outcome === 'ok' ? L(`تم التنفيذ: ${c.summary}`, `Done: ${c.summary}`) : outcome === 'cancelled' ? L('أُلغي الإجراء — لم يُنفَّذ شيء.', 'Cancelled — nothing was done.') : L(`لم يُنفَّذ: ${r.error || ''}`, `Not done: ${r.error || ''}`));
    emit('data-changed', { entity: 'all' });
    if (outcome === 'ok') { const host = copies().map((k) => k.closest('#chat-body .msg-body')).find(Boolean); watchPoints(host || card, before); }
  } catch (e) { err = e.body?.error || e.message; for (const k of copies()) setOutcome(k, 'failed', err); }
  finally { pendingConfirms.delete(c.id); }
  emit('ai-confirm', { id: c.id, outcome, error: err, summary: c.summary });
  return outcome;
}

// Voice conversation mode: a live copy of a pending confirmation card, and
// resolving it by voice («نعم» / «لا») — the same server call as the buttons.
export function confirmCardFor(c) { return confirmCard(c, false); }
export function resolveConfirmation(c, accept) {
  const card = (c.id && $(`#chat-body .confirm-card[data-cid="${CSS.escape(c.id)}"]`)) || confirmCard(c, false);
  if (card.dataset.outcome) return Promise.resolve(card.dataset.outcome);
  return resolveConfirm(c, accept, card);
}

// Keep the execution receipt truthful once a pending confirmation is resolved.
function syncReceipt(scope, tool, outcome) {
  const rec = scope?.querySelector('.receipt'); if (!rec) return;
  const li = $$('li.wait', rec).find((x) => x.dataset.tool === tool); if (!li) return;
  const ok = outcome === 'ok';
  li.className = ok ? 'ok' : 'err';
  li.querySelector('.icon')?.replaceWith(icon(ok ? 'circleCheck' : 'circleX'));
  const note = li.querySelector('.a-note'); if (note) note.textContent = ok ? L('نُفّذ بعد تأكيدك', 'Done after your confirmation') : outcome === 'cancelled' ? L('أُلغي — لم يُنفَّذ', 'Cancelled — not done') : L('لم يُنفَّذ', 'Not done');
  const sr = li.querySelector('.sr-only'); if (sr) sr.textContent = ok ? L('نُفّذ: ', 'Done: ') : L('لم يُنفَّذ: ', 'Not done: ');
  if (rec.querySelector('li.wait')) return;
  const all = $$('.receipt-list > li', rec).length; const okN = $$('.receipt-list > li.ok', rec).length;
  const st = okN === all ? 'done' : okN ? 'partial' : outcome === 'cancelled' ? 'cancelled' : 'failed';
  rec.dataset.status = st;
  rec.querySelector('.status-pill')?.replaceWith(statusPill(st));
  const cnt = rec.querySelector('.receipt-count'); if (cnt) cnt.textContent = receiptCount(okN, all);
}

// ---------------------------------------------------------------- gamification
// Points are never computed here: we compare two snapshots of GET /api/game/me
// (game.js refreshes it after data changes) and show what the server awarded.
const KIND = { task_done: ['إنجاز مهمة', 'Task done'], on_time: ['في الموعد', 'On time'], early: ['إنجاز مبكر', 'Early delivery'], priority: ['أولوية عالية', 'High priority'], backlog: ['إغلاق متأخرة', 'Overdue cleared'], progress: ['تحديث التقدم', 'Progress update'], document: ['مستند جديد', 'New document'], review: ['مراجعة وكيل', 'Agent review'], agent: ['وكيل جديد', 'New agent'], quest: ['مهمة يومية', 'Daily quest'] };
function watchPoints(host, before) {
  if (!before || !host) return;
  let n = 0;
  const tick = () => {
    const now = gameNow();
    if (now && now !== before) {
      const qs = $('#chat-body .welcome .quest-strip'); if (qs) drawQuests(qs, now);
      const gained = (now.xp ?? 0) - (before.xp ?? 0);
      if (gained > 0) showPoints(host, gained, now, before);
      return;
    }
    if (++n < 14) setTimeout(tick, 500);
  };
  setTimeout(tick, 700);
}
function showPoints(host, gained, now, before) {
  const seen = new Set((before.recent || []).map((e) => `${e.kind}:${e.id}:${e.day}`));
  const fresh = (now.recent || []).filter((e) => !seen.has(`${e.kind}:${e.id}:${e.day}`));
  const why = [...new Set(fresh.map((e) => L(...(KIND[e.kind] || [e.kind, e.kind]))))].join(' · ');
  const levelUp = now.level?.n > (before.level?.n ?? 0);
  const chip = h('a.xp-earned', { href: '#/achievements', 'aria-label': L(`كسبت ${gained} نقطة تميّز — عرض إنجازاتي`, `You earned ${gained} excellence points — view achievements`) },
    h('span.xp-orb', icon('sparkle')),
    h('span.grow', h('strong.tabular', h('bdi.num', `+${fmtNum(gained)}`), L(' نقطة تميّز', ' excellence points')), why ? h('span.xp-why', why) : null,
      levelUp ? h('span.xp-why', L(`مستوى جديد: «${now.level.ar}»`, `New level: “${now.level.en}”`)) : null),
    icon('chevron', 'flip-rtl'));
  (host.querySelector?.('.msg-actions') ? host.querySelector('.msg-actions').before(chip) : host.append(chip));
  // game.js celebrates at the sidebar chip; celebrate here when that chip isn't on screen.
  const side = document.querySelector('#level-chip-host .level-chip')?.getBoundingClientRect();
  if (!side || side.width === 0 || side.right <= 0 || side.left >= innerWidth) celebrate(chip.querySelector('.xp-orb'), { big: levelUp });
  if ($('#chat-body').scrollHeight - $('#chat-body').scrollTop - $('#chat-body').clientHeight < 320) scroll(true);
}

// ---------------------------------------------------------------- live status card
const PHASES = () => [['understanding', L('الفهم', 'Understand')], ['executing', L('التنفيذ', 'Execute')], ['result', L('النتيجة', 'Result')]];
function stageCard() {
  const label = h('span.stage-label', t('status.understanding'));
  const time = h('span.stage-time.tabular', { 'aria-hidden': 'true' }, '0s');
  const track = h('ol.stage-track', { 'aria-hidden': 'true' }, PHASES().map(([k, name], i) => h(`li${i === 0 ? '.on' : ''}`, { 'data-k': k }, h('span.st-bar'), h('span.st-name', name))));
  const steps = h('ul.steps');
  const el = h('div.stage', { role: 'status', 'aria-live': 'polite' }, h('div.stage-line', h('span.stage-orb', { 'aria-hidden': 'true' }), label, time), track, steps);
  const t0 = Date.now();
  const timer = setInterval(() => { time.textContent = `${Math.floor((Date.now() - t0) / 1000)}s`; }, 1000);
  const log = [];
  return {
    el, log,
    phase(k, text) {
      const order = PHASES().map(([x]) => x); const idx = order.indexOf(k);
      $$('li', track).forEach((li, i) => { li.classList.toggle('done', i < idx); li.classList.toggle('on', i === idx); });
      if (text) label.textContent = text;
    },
    label(text, tone) { label.textContent = text; el.classList.toggle('warn', tone === 'warn'); },
    step(ev) { log.push(ev); const [cls, ic] = stepIcon(ev.status); steps.append(h(`li.${cls}`, icon(ic), h('span.grow', ev.label, ev.error ? h('span.step-err', ` — ${ev.error}`) : null))); scroll(); },
    stop() { clearInterval(timer); },
  };
}

// Returns the final result (or null when nothing was sent). `speak: false` lets
// the voice conversation mode speak the reply itself (captions + hands-free loop).
export async function send(text, { voice = false, requestId = null, retry = false, speak = true } = {}) {
  if (busy) { toast(L('طلب آخر قيد التنفيذ — انتظر حتى يكتمل.', 'Another request is running — wait for it to finish.'), { kind: 'info' }); return null; }
  focus();
  revealing?.finish();
  busy = true; syncSend(); emit('ai-busy', true);
  const body = $('#chat-body');
  const attachments = state.lastUploadId ? [state.lastUploadName] : [];
  const bubble = retry ? null : userBubble(text, { voice, attachments });
  if (bubble) body.append(bubble);
  const stage = stageCard();
  body.append(stage.el); scroll(true);
  const id = requestId || rid();
  const before = gameNow();
  const payload = { message: text, requestId: id, conversationId: state.conversationId, ui: { ...uiContext(), tzOffset: new Date().getTimezoneOffset() }, voice, attachments: state.lastUploadId ? [state.lastUploadId] : [] };
  const again = () => send(text, { voice, requestId: id, retry: true }); // same requestId: never re-runs finished work
  try {
    const final = await chatStream(payload, (ev) => {
      if (ev.conversationId) setConversation(ev.conversationId);
      if (ev.stage === 'understanding') stage.phase('understanding', t('status.understanding'));
      if (ev.stage === 'executing') stage.phase('executing', `${t('status.executing')}: ${ev.label}…`);
      if (ev.stage === 'step') stage.step(ev);
      if (ev.stage === 'reconnecting') stage.label(t('status.reconnecting'), 'warn');
      if (ev.stage === 'in_progress') stage.label(t('status.in_progress'));
      if (ev.stage === 'replayed') stage.label(L('نُفّذ هذا الطلب سابقاً — أعرض نتيجته دون تكرار…', 'Already done — showing the saved result…'));
      if (ev.stage === 'final') stage.phase('result');
    });
    stage.stop(); stage.el.remove();
    if (final.conversationId) setConversation(final.conversationId);
    const canRetry = final.status === 'failed' && (final.retryable || !final.messageId);
    const msg = assistantBubble(final, false, { steps: stage.log, retry: canRetry ? again : null, rephrase: final.status === 'failed' && !canRetry ? text : null });
    body.append(msg);
    reveal(msg.querySelector('.msg-body > .md'));
    scroll(false, bubble || msg);
    announce(`${statusLabel(final.status || 'done')}. ${plain(final.text || '').slice(0, 160)}`);
    if (final.open_document) {
      // Already open → let the editor reload it through its "newer version" path (keeps unsaved edits safe).
      if (state.openDocumentId === final.open_document) emit('document-changed', { id: final.open_document, entity: 'document', source: 'assistant' });
      else Editor.open(final.open_document);
    }
    if (final.refresh?.length) emit('data-changed', { entity: final.refresh.join(',') });
    if (final.arrange) { state.arranging = true; location.hash = '#/home'; emit('data-changed', {}); }
    if (final.actions?.some((a) => a.status === 'ok')) watchPoints(msg.querySelector('.msg-body'), before);
    if (voice && speak && final.text) { const spoke = Voice.speak(final.text); if (!spoke && !Voice.isMuted() && Voice.ttsAvailable()) addNote(L('لا يتوفر صوت عربي في هذا الجهاز للرد الصوتي؛ الرد معروض كتابةً.', 'No voice available on this device; reply shown as text.')); }
    // Reply arrived while the conversation is off screen → the orb asks for attention.
    if (!chatVisible()) emit('ai-attention', { kind: (final.confirmations || []).length ? 'confirm' : 'answer', text: plain(final.text || '').slice(0, 120) });
    refreshRailSoon();
    return final;
  } catch (e) {
    stage.stop(); stage.el.remove();
    const msg = assistantBubble({ status: 'failed', text: `${t('status.failed')}: ${e.message}` }, false, { retry: again });
    body.append(msg); scroll(true);
    announce(`${t('status.failed')}: ${e.message}`);
    if (!chatVisible()) emit('ai-attention', { kind: 'answer' });
    return { status: 'failed', text: `${t('status.failed')}: ${e.message}` };
  } finally {
    busy = false; syncSend(); emit('ai-busy', false);
  }
}

// ---------------------------------------------------------------- progressive reveal
// The final answer fades in word by word (opacity only; the text is in the DOM
// from the start, so screen readers and copy get it at once). Action receipts,
// confirmations and files are outside `.md` and are never delayed. Reduced
// motion, a hidden tab or a very short answer → shown at once.
function reveal(md) {
  if (!md || reduceMotion() || document.hidden) return;
  const walker = document.createTreeWalker(md, NodeFilter.SHOW_TEXT, { acceptNode: (n) => (n.nodeValue.trim() && !n.parentElement.closest('.md-table') ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT) });
  const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
  let words = 0; for (const n of nodes) words += n.nodeValue.split(/\s+/).filter(Boolean).length;
  if (words < 6) return;
  const step = Math.max(5, Math.min(26, 1500 / words)); // the whole answer settles in ≈1.5s
  const spans = []; let i = 0;
  for (const n of nodes) {
    const frag = document.createDocumentFragment();
    for (const part of n.nodeValue.split(/(\s+)/)) {
      if (!part) continue;
      if (/^\s+$/.test(part)) { frag.append(part); continue; }
      const s = document.createElement('span'); s.className = 'rv'; s.style.setProperty('--rv', `${Math.round(i++ * step)}ms`); s.textContent = part;
      frag.append(s); spans.push(s);
    }
    n.replaceWith(frag);
  }
  for (const tbl of md.querySelectorAll('.md-table')) { tbl.classList.add('rv-block'); tbl.style.setProperty('--rv', `${Math.round(i * step * 0.6)}ms`); }
  md.classList.add('revealing');
  let timer = 0;
  const finish = () => {
    clearTimeout(timer);
    if (revealing?.md === md) revealing = null;
    md.classList.remove('revealing');
    for (const s of spans) if (s.isConnected) s.replaceWith(s.textContent);
    for (const tbl of md.querySelectorAll('.rv-block')) { tbl.classList.remove('rv-block'); tbl.style.removeProperty('--rv'); }
    md.normalize();
    syncSend();
  };
  revealing = { md, finish };
  timer = setTimeout(finish, i * step + 420);
  syncSend();
}

// ---------------------------------------------------------------- attachments
async function uploadFile(f) {
  if (f.size > 8 * 1024 * 1024) { toast(L(`«${f.name}» أكبر من 8MB — الحد الأقصى للمرفقات 8MB.`, `“${f.name}” is over 8MB — the attachment limit is 8MB.`), { kind: 'error' }); return; }
  uploading = f.name; refreshContext();
  try {
    const r = await api('/api/uploads', { method: 'POST', raw: f, headers: { 'content-type': f.type || 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) } });
    state.lastUploadId = r.id; state.lastUploadName = r.filename;
    uploading = null; refreshContext();
    addNote(r.analyzable ? L(`أُرفق «${r.filename}». اطلب مثلاً: «حلّل الملف» أو «لخّص الملف».`, `Attached “${r.filename}”. Try: “analyze the file” or “summarize the file”.`) : r.note, { icon: 'clip', kind: r.analyzable ? 'info' : 'warn' });
  } catch (err) { uploading = null; refreshContext(); toast(L(`تعذّر رفع «${f.name}»: ${err.message}`, `Could not upload “${f.name}”: ${err.message}`), { kind: 'error' }); }
}

// Drag a file anywhere onto the assistant panel to attach it.
function initDrop() {
  const panel = $('#chat'); let depth = 0;
  const hasFiles = (e) => [...(e.dataTransfer?.types || [])].includes('Files');
  panel.addEventListener('dragenter', (e) => { if (!hasFiles(e)) return; e.preventDefault(); depth++; panel.classList.add('drop-armed'); });
  panel.addEventListener('dragover', (e) => { if (!hasFiles(e)) return; e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
  panel.addEventListener('dragleave', () => { depth = Math.max(0, depth - 1); if (!depth) panel.classList.remove('drop-armed'); });
  panel.addEventListener('drop', (e) => {
    if (!hasFiles(e)) return;
    e.preventDefault(); depth = 0; panel.classList.remove('drop-armed');
    const f = e.dataTransfer.files?.[0]; if (f) uploadFile(f);
  });
}

// ---------------------------------------------------------------- history
function dayGroup(d) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const diff = (start - new Date(d.getFullYear(), d.getMonth(), d.getDate())) / 864e5;
  return diff <= 0 ? L('اليوم', 'Today') : diff === 1 ? L('أمس', 'Yesterday') : diff < 7 ? L('هذا الأسبوع', 'This week') : L('أقدم', 'Earlier');
}

async function showHistory() {
  const listHost = h('div.history-list', skeleton('list', 5));
  const search = h('input.field', { type: 'search', placeholder: L('ابحث في عناوين المحادثات…', 'Search conversation titles…'), 'aria-label': L('بحث في المحادثات', 'Search conversations') });
  const tools = h('div.history-tools', h('div.search-field.grow', icon('search'), search),
    h('button.btn.tertiary', { type: 'button', onclick: () => { closeModal(); newConversation(); } }, icon('plus'), L('محادثة جديدة', 'New conversation')));
  const body = h('div.history', tools, listHost);
  let rows = []; let shown = [];
  const closeModal = () => body.closest('.modal')?.querySelector('.modal-close')?.click();
  const pick = (c) => { closeModal(); if (c.id !== state.conversationId) { setConversation(c.id); load(); } };
  const draw = () => {
    const q = search.value.trim().toLowerCase();
    shown = q ? rows.filter((c) => String(c.title || '').toLowerCase().includes(q)) : rows;
    tools.classList.toggle('hidden', !rows.length);
    if (!rows.length) {
      listHost.replaceChildren(emptyState({ icon: 'messageSquare', compact: true, title: L('لا محادثات سابقة بعد', 'No conversations yet'), body: L('اطلب أي شيء من المساعد وستُحفظ محادثاتك هنا.', 'Ask the assistant anything and your conversations will be kept here.'), actions: [{ label: L('ابدأ محادثة', 'Start a conversation'), icon: 'plus', primary: true, onClick: () => { closeModal(); newConversation(); } }] }));
      listHost.querySelector('.btn.primary')?.focus();
      return;
    }
    if (!shown.length) { listHost.replaceChildren(emptyState({ icon: 'search', compact: true, title: L(`لا نتائج لـ«${search.value.trim()}»`, `No results for “${search.value.trim()}”`), body: L('جرّب كلمة أخرى من عنوان المحادثة.', 'Try another word from the conversation title.') })); return; }
    const groups = new Map();
    for (const c of shown) { const g = dayGroup(toDate(c.updated_at)); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
    listHost.replaceChildren(...[...groups].map(([g, items]) => h('section.history-group', h('h4.hg-title', g), h('ul.list', items.map((c) => {
      const cur = c.id === state.conversationId;
      return h('li', h('button.history-item', { type: 'button', 'aria-current': cur ? 'true' : null, onclick: () => pick(c) },
        h('span.h-icon', icon('messageSquare')),
        h('span.grow', h('span.h-title', c.title || L('محادثة بلا عنوان', 'Untitled conversation')), h('span.h-meta', `${fmtDate(c.updated_at)} · ${fmtTime(c.updated_at)}`)),
        cur ? h('span.chip.tiny.info', L('الحالية', 'Current')) : icon('chevron', 'flip-rtl h-go')));
      })))));
  };
  const fetchList = async () => {
    listHost.replaceChildren(skeleton('list', 5));
    try { rows = await api('/api/conversations'); draw(); } catch (e) { listHost.replaceChildren(errorState(e, fetchList)); }
  };
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (shown[0]) pick(shown[0]); } });
  modal(L('المحادثات السابقة', 'Previous conversations'), body, []);
  fetchList();
}

// ---------------------------------------------------------------- history rail (immersive view)
// Start-side rail: new conversation, search, conversations grouped by date.
// Desktop: collapsible column (remembered). Mobile Chat tab: a drawer opened by
// the history button. Rows come from GET /api/conversations (the person's own).
let railState = 'idle'; // idle · loading · error
const railQuery = { q: '' };
function buildRail() {
  const rail = $('#ai-rail'); if (!rail || rail.dataset.ready) return;
  rail.dataset.ready = '1';
  const search = h('input.field.rail-search-input', { type: 'search', value: railQuery.q, placeholder: L('ابحث في المحادثات…', 'Search conversations…'), 'aria-label': L('بحث في عناوين المحادثات', 'Search conversation titles'), autocomplete: 'off' });
  search.addEventListener('input', () => { railQuery.q = search.value; paintRail(); });
  search.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); $('#ai-rail .rail-item')?.click(); }
    if (e.key === 'Escape' && search.value) { e.stopPropagation(); search.value = ''; railQuery.q = ''; paintRail(); }
  });
  rail.replaceChildren(
    h('div.rail-head',
      h('span.rail-brand', orbEl('xs'), h('span.rail-brand-text', h('b', 'Ask AI'), h('small', L('مساعد المنصة', 'Platform assistant')))),
      h('button.icon-btn.rail-hide', { type: 'button', 'aria-label': L('إخفاء المحادثات', 'Hide conversations'), title: L('إخفاء المحادثات', 'Hide conversations'), onclick: () => { toggleRail(false); ($('#ai-rail-toggle')?.offsetParent ? $('#ai-rail-toggle') : $('#chat-history'))?.focus(); } }, icon('sidebar', 'rh-desk'), icon('x', 'rh-mob'))),
    h('button.rail-new', { type: 'button', onclick: () => newConversation() }, h('span.rn-ic', icon('pencil')), h('span.grow', L('محادثة جديدة', 'New conversation')), h('kbd.rail-kbd', { 'aria-hidden': 'true' }, /Mac|iPhone|iPad/.test(navigator.platform || '') ? '⇧⌘O' : 'Ctrl ⇧ O')),
    h('div.search-field.rail-search', icon('search'), search),
    h('nav.rail-list', { 'aria-label': L('المحادثات السابقة', 'Previous conversations'), 'aria-busy': 'false' }),
    h('p.rail-foot', icon('lock', 'sm'), h('span', L('محادثاتك خاصة بحسابك ولا يراها غيرك', 'Your conversations are private to your account'))));
  if (!$('#chat .rail-scrim')) $('#chat').append(h('div.rail-scrim', { 'aria-hidden': 'true', onclick: () => toggleRail(false) }));
  // Desktop default: open on wide screens, remembered afterwards.
  let pref = null; try { pref = localStorage.getItem('swp.ai.rail'); } catch {}
  $('#chat').classList.toggle('rail-collapsed', pref ? pref === 'collapsed' : innerWidth < 1100);
}

export async function refreshRail() {
  railState = 'loading'; if (!railRows) paintRail();
  try { railRows = await api('/api/conversations'); railState = 'idle'; }
  catch (e) { railState = 'error'; railRows = railRows || null; paintRail(e); return; }
  paintRail(); paintTitle();
}
const refreshRailSoon = debounce(() => { if (railRows || isImmersive()) refreshRail(); }, 350);

function paintRail(err) {
  const list = $('#ai-rail .rail-list'); if (!list) return;
  list.setAttribute('aria-busy', String(railState === 'loading' && !railRows));
  if (!railRows) {
    if (railState === 'error') list.replaceChildren(h('div.rail-empty', icon('circleAlert'), h('p', L('تعذّر تحميل المحادثات.', 'Couldn’t load conversations.')), h('button.btn.sm.tertiary', { type: 'button', onclick: () => refreshRail() }, icon('refresh'), L('إعادة المحاولة', 'Try again'))));
    else list.replaceChildren(h('div.rail-skeleton', { 'aria-label': L('جارٍ تحميل المحادثات', 'Loading conversations') }, [80, 64, 72, 56, 68].map((w) => h('div.sk.sk-line', { style: { width: `${w}%` } }))));
    return;
  }
  const q = railQuery.q.trim().toLowerCase();
  const rows = q ? railRows.filter((c) => String(c.title || '').toLowerCase().includes(q)) : railRows;
  if (!railRows.length) { list.replaceChildren(h('div.rail-empty', icon('messageSquare'), h('p', L('لا محادثات سابقة بعد', 'No conversations yet')), h('small', L('ستظهر هنا محادثاتك مع المساعد.', 'Your conversations with the assistant will appear here.')))); return; }
  if (!rows.length) { list.replaceChildren(h('div.rail-empty', icon('search'), h('p', L(`لا نتائج لـ«${railQuery.q.trim()}»`, `No results for “${railQuery.q.trim()}”`)))); return; }
  const groups = new Map();
  for (const c of rows) { const g = dayGroup(toDate(c.updated_at)); if (!groups.has(g)) groups.set(g, []); groups.get(g).push(c); }
  const had = list.contains(document.activeElement) ? document.activeElement.dataset.id : null;
  list.replaceChildren(...[...groups].map(([g, items]) => h('section.rail-group', h('h4.rail-group-title', g), h('ul', items.map((c) => {
    const cur = c.id === state.conversationId;
    return h('li', h('button.rail-item', { type: 'button', 'data-id': c.id, 'aria-current': cur ? 'true' : null, title: c.title || '', onclick: () => openConversation(c.id) },
      h('span.ri-title', c.title || L('محادثة بلا عنوان', 'Untitled conversation')),
      h('time.ri-time', { datetime: c.updated_at }, dayGroup(toDate(c.updated_at)) === L('اليوم', 'Today') ? fmtTime(c.updated_at) : fmtDate(c.updated_at))));
  })))));
  if (had) $(`#ai-rail .rail-item[data-id="${CSS.escape(had)}"]`)?.focus({ preventScroll: true });
  void err;
}

// Desktop immersive: collapse/expand the rail (remembered). Mobile: open/close the drawer.
export function toggleRail(force) {
  const c = $('#chat'); if (!c) return;
  if (innerWidth <= 900) {
    const open = force ?? !c.classList.contains('rail-open');
    c.classList.toggle('rail-open', open);
    $('#ai-rail')?.toggleAttribute('inert', !open);
    if (open) { if (!railRows) refreshRail(); else refreshRailSoon(); setTimeout(() => ($('#ai-rail .rail-item[aria-current="true"]') || $('#ai-rail .rail-new'))?.focus({ preventScroll: true }), 80); }
    return;
  }
  const collapsed = force == null ? !c.classList.contains('rail-collapsed') : !force;
  c.classList.toggle('rail-collapsed', collapsed);
  try { localStorage.setItem('swp.ai.rail', collapsed ? 'collapsed' : 'open'); } catch {}
  if (!collapsed && !railRows) refreshRail();
  if (!collapsed && force == null) setTimeout(() => $('#ai-rail .rail-new')?.focus({ preventScroll: true }), 40);
}

// Header title: the conversation's title in the immersive view, "Ask AI" in the side panel.
export function conversationTitle(hint) {
  const row = railRows?.find((c) => c.id === state.conversationId);
  if (row?.title) return row.title;
  if (hint && state.conversationId) return hint;
  const firstMsg = $('#chat-body .msg.user .msg-text')?.textContent?.trim();
  return firstMsg ? firstMsg.slice(0, 60) : L('محادثة جديدة', 'New conversation');
}
export function paintTitle(hint) {
  const el = $('#ai-title'); if (!el) return;
  const text = isImmersive() ? conversationTitle(hint) : 'Ask AI';
  if (el.textContent !== text) el.textContent = text;
  el.title = isImmersive() ? text : '';
}
