// Ask AI chat panel: context-aware requests, visible request status,
// confirmations, undo, options, downloads, voice.
import { api, chatStream, rid } from './api.js';
import { h, $, icon, md, toast, esc, modal } from './ui.js';
import { t, L, fmtTime } from './i18n.js';
import { state, uiContext, setConversation, emit } from './state.js';
import * as Voice from './voice.js';
import * as Editor from './editor.js';
import { undo } from './widgets.js';

let busy = false;

export function init() {
  $('#chat-collapse').replaceChildren(icon('sidebarR'));
  $('#chat-collapse').setAttribute('aria-label', L('إخفاء المساعد', 'Hide assistant'));
  $('#chat-new').setAttribute('aria-label', L('محادثة جديدة', 'New conversation'));
  $('#chat-history').setAttribute('aria-label', L('المحادثات السابقة', 'Conversation history'));
  $('#chat-expand').setAttribute('aria-label', L('توسيع', 'Expand'));
  $('#btn-attach').setAttribute('aria-label', L('إرفاق ملف', 'Attach file'));
  $('#btn-mic').setAttribute('aria-label', L('تحدّث', 'Speak'));
  $('#btn-send').setAttribute('aria-label', L('إرسال', 'Send'));
  $('#chat-new').replaceChildren(icon('plus'));
  $('#chat-history').replaceChildren(icon('history'));
  $('#chat-expand').replaceChildren(icon('expand'));
  $('#btn-attach').replaceChildren(icon('clip'));
  $('#btn-mic').replaceChildren(icon('mic'));
  $('#btn-send').replaceChildren(icon('send'));
  setMuteIcon();
  $('#ai-mode').textContent = state.me.assistant.mode === 'model' ? t('ai.model') : t('ai.local');
  $('#ai-mode').className = `chip tiny ${state.me.assistant.mode === 'model' ? 'good' : 'warn'}`;
  $('#ai-mode').title = state.me.assistant.degraded ? L(state.me.assistant.status?.label_ar, state.me.assistant.status?.label_en) : state.me.assistant.provider;

  const input = $('#chat-input');
  input.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); } };
  input.oninput = () => { input.style.height = 'auto'; input.style.height = Math.min(160, input.scrollHeight) + 'px'; };
  $('#btn-send').onclick = submit;
  $('#chat-collapse').onclick = () => { $('#chat').classList.remove('expanded'); window.dispatchEvent(new CustomEvent('swp:chat-visible', { detail: false })); };
  $('#chat-expand').onclick = () => { const ex = $('#chat').classList.toggle('expanded'); $('#chat-expand').replaceChildren(icon(ex ? 'shrink' : 'expand')); };
  $('#chat-new').onclick = () => { setConversation(null); $('#chat-body').replaceChildren(); welcome(); };
  $('#chat-history').onclick = showHistory;
  $('#btn-attach').onclick = () => $('#file-input').click();
  $('#file-input').onchange = uploadFile;
  $('#btn-mic').onclick = () => {
    if (Voice.isRecording()) { Voice.stop(); return; }
    Voice.start((text, { confidence }) => {
      if (confidence < 0.55) { input.value = text; input.focus(); addNote(L('لم يكن الكلام واضحاً تماماً — راجع النص ثم أرسله.', 'Speech was unclear — review the text, then send.')); return; }
      send(text, { voice: true });
    }, (err) => addNote(err));
  };
  $('#voice-stop').onclick = () => { Voice.stop(); Voice.stopSpeaking(); $('#voice-bar').classList.add('hidden'); };
  $('#btn-mute').onclick = () => { Voice.setMuted(!Voice.isMuted()); setMuteIcon(); };
  load();
}

function setMuteIcon() {
  const m = Voice.isMuted();
  $('#btn-mute').replaceChildren(icon(m ? 'mute' : 'speaker'));
  $('#btn-mute').setAttribute('aria-pressed', String(m));
  $('#btn-mute').title = m ? L('الرد الصوتي مكتوم', 'Voice replies muted') : L('كتم الرد الصوتي', 'Mute voice replies');
}

async function load() {
  const body = $('#chat-body'); body.replaceChildren();
  if (state.conversationId) {
    try {
      const c = await api(`/api/conversations/${state.conversationId}`);
      for (const m of c.messages) m.role === 'user' ? body.append(userBubble(m.content, m.meta)) : body.append(assistantBubble(m.meta?.status ? m.meta : { text: m.content, status: m.meta?.status }, true));
      scroll();
      return;
    } catch { setConversation(null); }
  }
  welcome();
}

function welcome() {
  const u = state.me.user;
  const s = [L('جهّز لي ملخص اليوم، وحدّث تقدم المشاريع، وابنِ تقريراً عن المشاريع المتأخرة', 'Prepare my daily summary'), L('أضف بطاقة للمشاريع المتأخرة', 'Add a delayed projects card'), L('اعرض إنجاز هذا الأسبوع', "Show this week's achievement"), L('ابنِ وكيلاً يجهّز ملخص اليوم كل صباح الساعة 7', 'Build an agent that prepares my daily summary every morning at 7')];
  $('#chat-body').append(h('div.msg.assistant', h('div', { html: md(L(`أهلاً ${u.name_ar.split(' ')[0]} 👋\nاكتب أو تحدّث بطلبك، وسأنفّذه ضمن صلاحياتك. أفهم «هذا المشروع» و«المستند المفتوح» من الواجهة.`, `Hi ${u.name_en.split(' ')[0]} 👋\nType or speak a request and I'll carry it out within your permissions.`)) }),
    state.me.assistant.mode === 'local' ? h('div.tiny.muted', { style: { marginTop: '6px' } }, L('خدمة النموذج اللغوي غير متصلة حالياً؛ أعمل بالفهم المحلي للأوامر.', 'No language model connected; using local command understanding.')) : null,
    h('div.options', s.map((x) => h('button.btn.sm', { onclick: () => send(x) }, x)))));
}

export function refreshContext() {
  const bar = $('#context-bar'); if (!bar) return;
  const chips = [];
  const chip = (label, clear) => h('span.chip.tiny', label, clear ? h('button.icon-btn', { style: { width: '18px', height: '18px' }, 'aria-label': L('إزالة', 'Remove'), onclick: () => { clear(); refreshContext(); } }, icon('x')) : null);
  const viewNames = { home: 'Unified Portal', adaa: 'ADAA I', projects: L('المشاريع', 'Projects'), tasks: L('المهام', 'Tasks'), documents: L('المستندات', 'Documents'), office: L('مكتب الوكلاء', 'Agents Office') };
  chips.push(chip(`📍 ${viewNames[state.route] || state.route}`));
  if (state.selectedProjectId && state.projectName) chips.push(chip(`${L('المشروع', 'Project')}: ${state.projectName}`, () => { state.selectedProjectId = null; }));
  if (state.openDocumentId && Editor.currentTitle()) chips.push(chip(`${L('المستند', 'Doc')}: ${Editor.currentTitle()}`));
  if (state.selectedWidgetId) chips.push(chip(L('بطاقة محددة', 'Selected card'), () => { state.selectedWidgetId = null; document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected')); }));
  if (state.lastUploadId) chips.push(chip(`📎 ${state.lastUploadName}`, () => { state.lastUploadId = null; }));
  bar.replaceChildren(...chips);
}

export function focus(prefix = '') {
  if (window.innerWidth <= 900) import('./app.js').then((m) => m.setTab('chat'));
  if ($('#chat').classList.contains('collapsed')) window.dispatchEvent(new CustomEvent('swp:chat-visible', { detail: true }));
  const i = $('#chat-input'); if (prefix && !i.value.startsWith(prefix)) i.value = prefix + i.value; i.focus();
}

function submit() {
  const text = $('#chat-input').value.trim();
  if (!text || busy) return;
  $('#chat-input').value = ''; $('#chat-input').style.height = 'auto';
  send(text);
}

function scroll() { const b = $('#chat-body'); b.scrollTop = b.scrollHeight; }
function addNote(text) { $('#chat-body').append(h('div.stage', icon('info'), h('span', text))); scroll(); }

function userBubble(text, meta = {}) {
  return h('div.msg.user', text, meta.voice ? h('div.voice-tag', '🎙 ', L('إدخال صوتي', 'Voice input')) : null, meta.attachments?.length ? h('div.voice-tag', '📎 ', meta.attachments.join(', ')) : null);
}

const STATUS_CHIP = { done: 'good', failed: 'crit', partial: 'warn', needs_input: '', needs_confirmation: 'warn', cancelled: '', ok: 'good' };

function assistantBubble(r, historic = false) {
  const el = h('div.msg.assistant');
  el.append(h('div.md', { html: md(r.text || '') }));
  if (r.status && r.status !== 'done' || r.actions?.length) {
    const meta = h('div.meta');
    if (r.status) meta.append(h(`span.chip.tiny${STATUS_CHIP[r.status] ? '.' + STATUS_CHIP[r.status] : ''}`, t(`status.${r.status}`)));
    for (const a of r.actions || []) {
      meta.append(h(`span.chip.tiny${a.status === 'ok' ? '.good' : a.status === 'error' ? '.crit' : '.warn'}`, a.status === 'ok' ? '✓ ' : a.status === 'error' ? '✗ ' : '… ', a.label || a.tool));
      if (a.status === 'ok' && a.undoable && a.actionId && !historic) meta.append(h('button.btn.sm', { onclick: (e) => { e.target.disabled = true; undo(a.actionId); } }, icon('undo'), t('undo')));
    }
    el.append(meta);
  }
  for (const c of r.confirmations || []) {
    const card = h('div.confirm-card', h('div.small', h('strong', L('يتطلب تأكيدك: ', 'Needs your confirmation: ')), c.summary));
    if (!historic) card.append(h('div.actions-row',
      h('button.btn.sm.danger', { onclick: () => resolveConfirm(c.id, true, card) }, t('confirm')),
      h('button.btn.sm', { onclick: () => resolveConfirm(c.id, false, card) }, t('cancel'))));
    el.append(card);
  }
  if (r.options?.length && !historic) el.append(h('div.options', r.options.map((o) => h('button.btn.sm', { onclick: () => send(o.value) }, o.label))));
  if (r.downloads?.length) el.append(h('div.actions-row', r.downloads.map((d) => h('a.btn.sm', { href: d.url, download: '' }, icon('download'), `${d.format.toUpperCase()} — ${d.title}`))));
  if (r.open_document) el.append(h('div.actions-row', h('button.btn.sm', { onclick: () => Editor.open(r.open_document) }, icon('doc'), L('فتح المستند', 'Open document'))));
  if (r.notes?.length) el.append(h('div.tiny.muted', { style: { marginTop: '6px' } }, r.notes.join(' ')));
  if (r.refresh?.includes('office')) el.append(h('div.actions-row', h('a.btn.sm', { href: '#/office' }, icon('people'), L('فتح مكتب الوكلاء', 'Open Agents Office'))));
  // short text drafts: copy / open as document
  if (/\*\*مسودة/.test(r.text || '') || /\*\*Draft/.test(r.text || '')) {
    const draft = (r.text || '').replace(/\*\*[^*]+\*\*\n?/, '').split('\n\n')[0];
    el.append(h('div.actions-row',
      h('button.btn.sm', { onclick: () => { navigator.clipboard?.writeText(draft); toast(L('نُسخ النص', 'Copied')); } }, icon('copy'), t('copy')),
      h('button.btn.sm', { onclick: () => { $('#chat-input').value = draft; $('#chat-input').focus(); } }, icon('doc'), t('edit'))));
  } else if (!historic && r.text && r.text.length > 40) {
    el.append(h('div.actions-row', { style: { opacity: .7 } }, h('button.btn.sm.ghost', { onclick: () => { navigator.clipboard?.writeText(r.text.replace(/\*\*/g, '')); toast(L('نُسخ النص', 'Copied')); } }, icon('copy'), t('copy'))));
  }
  return el;
}

async function resolveConfirm(id, accept, card) {
  card.querySelectorAll('button').forEach((b) => (b.disabled = true));
  try {
    const r = await api(`/api/confirmations/${id}`, { method: 'POST', body: { accept } });
    card.append(h('div.small', { style: { marginTop: '6px' } }, r.status === 'ok' ? `✓ ${L('تم التنفيذ', 'Done')}` : r.status === 'cancelled' ? L('أُلغي — لم يُنفَّذ شيء', 'Cancelled — nothing was done') : `✗ ${r.error}`));
    emit('data-changed', { entity: 'all' });
  } catch (e) { card.append(h('div.small', `✗ ${e.message}`)); }
}

export async function send(text, { voice = false } = {}) {
  if (busy) { toast(L('طلب آخر قيد التنفيذ…', 'Another request is running…')); return; }
  focus();
  busy = true; $('#btn-send').disabled = true;
  const body = $('#chat-body');
  const attachments = state.lastUploadId ? [state.lastUploadName] : [];
  body.append(userBubble(text, { voice, attachments }));
  const stage = h('div.stage', { role: 'status' }, h('span.spin'), h('span.lbl', t('status.understanding')));
  const steps = h('ul.steps');
  const wrap = h('div', stage, steps);
  body.append(wrap); scroll();
  const requestId = rid();
  const payload = { message: text, requestId, conversationId: state.conversationId, ui: { ...uiContext(), tzOffset: new Date().getTimezoneOffset() }, voice, attachments: state.lastUploadId ? [state.lastUploadId] : [] };
  try {
    const final = await chatStream(payload, (ev) => {
      if (ev.conversationId) setConversation(ev.conversationId);
      if (ev.stage === 'understanding') stage.querySelector('.lbl').textContent = t('status.understanding');
      if (ev.stage === 'executing') stage.querySelector('.lbl').textContent = `${t('status.executing')}: ${ev.label}…`;
      if (ev.stage === 'step') steps.append(h('li', ev.status === 'ok' ? '✓' : ev.status === 'needs_confirmation' ? '⚠' : '✗', ' ', ev.label, ev.error ? h('span.muted', ` — ${ev.error}`) : null));
      if (ev.stage === 'reconnecting') stage.querySelector('.lbl').textContent = t('status.reconnecting');
      if (ev.stage === 'in_progress') stage.querySelector('.lbl').textContent = t('status.in_progress');
    });
    wrap.remove();
    if (final.conversationId) setConversation(final.conversationId);
    body.append(assistantBubble(final));
    if (final.open_document) Editor.open(final.open_document);
    if (final.refresh?.length) emit('data-changed', { entity: final.refresh.join(',') });
    if (final.arrange) { state.arranging = true; location.hash = '#/home'; emit('data-changed', {}); }
    if (voice && final.text) { const spoke = Voice.speak(final.text); if (!spoke && !Voice.isMuted() && Voice.ttsAvailable()) addNote(L('لا يتوفر صوت عربي في هذا الجهاز للرد الصوتي؛ الرد معروض كتابةً.', 'No voice available on this device; reply shown as text.')); }
  } catch (e) {
    wrap.remove();
    body.append(assistantBubble({ status: 'failed', text: `${t('status.failed')}: ${e.message}` }));
  } finally {
    busy = false; $('#btn-send').disabled = false; scroll();
  }
}

async function uploadFile(e) {
  const f = e.target.files[0]; e.target.value = '';
  if (!f) return;
  if (f.size > 8 * 1024 * 1024) { toast(L('الحد الأقصى 8MB', 'Max 8MB'), { kind: 'error' }); return; }
  try {
    const r = await api('/api/uploads', { method: 'POST', raw: f, headers: { 'content-type': f.type || 'application/octet-stream', 'x-filename': encodeURIComponent(f.name) } });
    state.lastUploadId = r.id; state.lastUploadName = r.filename;
    refreshContext();
    addNote(r.analyzable ? L(`أُرفق «${r.filename}». اطلب: «حلّل الملف» أو «لخّص الملف».`, `Attached "${r.filename}". Ask: "analyze the file" or "summarize the file".`) : r.note);
  } catch (err) { toast(err.message, { kind: 'error' }); }
}

async function showHistory() {
  const list = await api('/api/conversations');
  const sel = await modal(L('المحادثات السابقة', 'Previous conversations'), h('ul.list', list.length ? list.map((c) => h('li.clickable', { onclick: (e) => { setConversation(c.id); load(); e.target.closest('.modal-wrap').remove(); } }, h('div.grow', h('div.title', c.title || '—'), h('div.tiny.muted', new Date(c.updated_at + 'Z').toLocaleString())))) : [h('li', L('لا توجد محادثات', 'No conversations'))]), [{ label: t('close'), value: null }]);
  void sel;
}
