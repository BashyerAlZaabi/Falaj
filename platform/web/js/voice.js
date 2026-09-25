// Voice: speech-to-text starts ONLY on an explicit user action; the mic state is
// visible for the whole recording (red dot + elapsed time + live transcript);
// transcribing and the assistant speaking have their own calm states; replies
// can be muted or interrupted; text chat always remains available if voice is
// unsupported or fails.
import { $, h, icon } from './ui.js';
import { L, getLang } from './i18n.js';
import { api } from './api.js';
import { state } from './state.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null; let media = null; let recording = false; let onFinal = null;
let muted = (() => { try { return localStorage.getItem('swp.mute') === '1'; } catch { return false; } })();

export const sttMode = () => (state.me?.voice?.stt?.kind === 'openai_compatible' ? 'server' : SR ? 'browser' : 'none');
export const isMuted = () => muted;
export function setMuted(v) { muted = v; try { localStorage.setItem('swp.mute', v ? '1' : '0'); } catch {} if (v) stopSpeaking(); }
export const isRecording = () => recording;

// ---------- voice bar (states: listening · transcribing · speaking) ----------
// Adds an indicator slot, a text column and an elapsed-time counter around the
// static markup (#voice-state, #voice-interim, #voice-stop keep their ids).
function ensureBar() {
  const bar = $('#voice-bar');
  if (!bar || bar.dataset.ready) return bar;
  bar.dataset.ready = '1';
  bar.querySelector('.rec-dot')?.remove();
  const ind = h('span.vb-ind', { 'aria-hidden': 'true' },
    h('span.rec-dot'), h('span.spinner.vb-spin'), h('span.vb-wave', h('i'), h('i'), h('i'), h('i')));
  const text = h('div.vb-text', $('#voice-state'), $('#voice-interim'));
  const timer = h('span.vb-timer.tabular', { 'aria-hidden': 'true' }, '0:00');
  bar.prepend(ind, text, timer);
  $('#voice-stop').prepend(icon('stop'));
  return bar;
}

let t0 = 0; let tick = null;
function startTimer() {
  stopTimer(); t0 = Date.now();
  const el = $('#voice-bar .vb-timer');
  const draw = () => { const s = Math.floor((Date.now() - t0) / 1000); if (el) el.textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  draw(); tick = setInterval(draw, 1000);
}
function stopTimer() { clearInterval(tick); tick = null; }

function setStopLabel(kind) {
  const b = $('#voice-stop'); if (!b) return;
  const label = kind === 'speaking' ? L('مقاطعة', 'Interrupt') : L('إيقاف', 'Stop');
  const txt = [...b.childNodes].find((n) => n.nodeType === 3);
  if (txt) txt.textContent = label; else b.append(label);
  b.setAttribute('aria-label', kind === 'speaking' ? L('مقاطعة الرد الصوتي', 'Interrupt the spoken reply') : L('إيقاف التسجيل', 'Stop recording'));
}

// kind: 'listening' | 'transcribing' | 'speaking' | '' (hidden)
function bar(kind, stateText = '', interim = '') {
  const el = ensureBar();
  if (!el) return;
  const show = !!kind && (recording || !!stateText);
  el.classList.toggle('hidden', !show);
  el.dataset.state = show ? kind : '';
  $('#voice-state').textContent = stateText || '';
  $('#voice-interim').textContent = interim;
  $('#voice-interim').classList.toggle('hidden', !interim);
  setStopLabel(kind);
  if (kind === 'listening' && recording) { if (!tick) startTimer(); } else stopTimer();
  const mic = $('#btn-mic');
  mic.classList.toggle('rec', recording);
  mic.setAttribute('aria-pressed', String(recording));
  const micLabel = recording ? L('إيقاف التسجيل', 'Stop recording') : L('تحدّث', 'Speak');
  mic.title = micLabel; mic.setAttribute('aria-label', micLabel);
}

const TEXT_OK = () => L('المحادثة النصية متاحة.', 'Text chat is still available.');

export function start(handler, onError) {
  stopSpeaking(); // interrupt any reply being spoken
  onFinal = handler;
  const mode = sttMode();
  if (mode === 'none') { onError(L('التعرّف على الكلام غير مدعوم في هذا المتصفح. يمكنك متابعة المحادثة بالكتابة.', 'Speech recognition is not supported in this browser. You can keep chatting by text.'), { code: 'unsupported', retry: false }); return; }
  if (mode === 'server') return startServer(onError);
  rec = new SR();
  rec.lang = getLang() === 'ar' ? 'ar-AE' : 'en-US';
  rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = ''; let conf = 1;
  rec.onstart = () => { recording = true; bar('listening', L('يستمع… تحدّث الآن', 'Listening… speak now')); };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { finalText += r[0].transcript; conf = Math.min(conf, r[0].confidence || 1); } else interim += r[0].transcript;
    }
    bar('listening', L('يستمع…', 'Listening…'), finalText + interim);
  };
  rec.onerror = (e) => {
    recording = false; bar('');
    const msg = {
      'not-allowed': L('الميكروفون غير مسموح. فعّله من إعدادات الموقع في المتصفح (رمز القفل بجوار العنوان) ثم حاول مجدداً.', 'Microphone access is blocked. Allow it in the browser’s site settings (the lock icon by the address), then try again.'),
      'service-not-allowed': L('الميكروفون غير مسموح. فعّله من إعدادات الموقع في المتصفح ثم حاول مجدداً.', 'Microphone access is blocked. Allow it in the browser’s site settings, then try again.'),
      'no-speech': L('لم يُلتقط أي كلام. اقترب من الميكروفون وحاول مجدداً.', 'No speech detected. Move closer to the mic and try again.'),
      network: L('تعذّر الوصول لخدمة التعرّف على الكلام.', 'Speech service unreachable.'),
      'audio-capture': L('لا يوجد ميكروفون متاح على هذا الجهاز.', 'No microphone available on this device.'),
      aborted: null,
    }[e.error];
    if (msg === null) return; // user stopped it
    onError(`${msg || `${L('تعذّر تشغيل الصوت', 'Voice error')}: ${e.error}`} ${TEXT_OK()}`, { code: e.error, retry: e.error !== 'audio-capture' });
  };
  rec.onend = () => {
    recording = false; bar('');
    const text = finalText.trim();
    if (text) onFinal?.(text, { confidence: conf });
  };
  try { rec.start(); } catch (e) { onError(e.message, { code: 'start', retry: true }); }
}

async function startServer(onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    media = new MediaRecorder(stream);
    media.ondataavailable = (e) => chunks.push(e.data);
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recording = false; bar('transcribing', L('جارٍ تحويل الكلام إلى نص…', 'Transcribing…'));
      try {
        const blob = new Blob(chunks, { type: media.mimeType || 'audio/webm' });
        const r = await api(`/api/voice/transcribe?lang=${getLang()}`, { method: 'POST', raw: blob, headers: { 'content-type': blob.type } });
        bar('');
        if (r.text?.trim()) onFinal?.(r.text.trim(), { confidence: 1 });
        else onError(`${L('لم يُلتقط أي كلام واضح.', 'No clear speech was captured.')} ${TEXT_OK()}`, { code: 'no-speech', retry: true });
      } catch (e) { bar(''); onError(`${e.message}. ${TEXT_OK()}`, { code: 'transcribe', retry: true }); }
    };
    media.start(); recording = true; bar('listening', L('يسجّل… اضغط «إيقاف» عند الانتهاء', 'Recording… press Stop when done'));
  } catch (e) {
    recording = false; bar('');
    onError(`${L('الميكروفون غير مسموح. فعّله من إعدادات الموقع في المتصفح (رمز القفل بجوار العنوان) ثم حاول مجدداً.', 'Microphone access is blocked. Allow it in the browser’s site settings (the lock icon by the address), then try again.')} ${TEXT_OK()}`, { code: 'not-allowed', retry: true });
  }
}

export function stop() {
  if (rec && recording) rec.stop();
  if (media && media.state === 'recording') media.stop();
}

// Stop listening and any spoken reply, and hide the bar.
export function dismiss() { stop(); stopSpeaking(); stopTimer(); const b = $('#voice-bar'); if (b) { b.classList.add('hidden'); b.dataset.state = ''; } }

export function speak(text) {
  if (muted || !('speechSynthesis' in window) || !text) return false;
  stopSpeaking();
  const clean = text.replace(/\*\*|_/g, '').replace(/\[يُستكمل[^\]]*\]/g, '').slice(0, 1200);
  const u = new SpeechSynthesisUtterance(clean);
  const lang = /[؀-ۿ]/.test(clean) ? 'ar' : 'en';
  u.lang = lang === 'ar' ? 'ar-SA' : 'en-US';
  const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
  if (v) u.voice = v; else if (lang === 'ar') return false; // no Arabic voice installed
  u.rate = 1;
  u.onstart = () => bar('speaking', L('يتحدث المساعد… يمكنك المقاطعة في أي لحظة', 'Assistant speaking… interrupt any time'));
  u.onend = u.onerror = () => { if (!recording) bar(''); };
  speechSynthesis.speak(u);
  return true;
}
export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
export const ttsAvailable = () => 'speechSynthesis' in window;
