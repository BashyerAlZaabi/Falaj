// Voice: speech-to-text starts ONLY on an explicit user action; the mic state is
// visible for the whole recording; replies can be muted or interrupted; text
// chat always remains available if voice is unsupported or fails.
import { $, h } from './ui.js';
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

function bar(stateText, interim = '') {
  $('#voice-bar').classList.toggle('hidden', !recording && !stateText);
  $('#voice-state').textContent = stateText || '';
  $('#voice-interim').textContent = interim;
  const mic = $('#btn-mic');
  mic.classList.toggle('rec', recording);
  mic.setAttribute('aria-pressed', String(recording));
  mic.title = recording ? L('إيقاف التسجيل', 'Stop recording') : L('تحدّث', 'Speak');
}

export function start(handler, onError) {
  stopSpeaking(); // interrupt any reply being spoken
  onFinal = handler;
  const mode = sttMode();
  if (mode === 'none') { onError(L('التعرّف على الكلام غير مدعوم في هذا المتصفح. يمكنك متابعة المحادثة بالكتابة.', 'Speech recognition is not supported in this browser. You can keep chatting by text.')); return; }
  if (mode === 'server') return startServer(onError);
  rec = new SR();
  rec.lang = getLang() === 'ar' ? 'ar-AE' : 'en-US';
  rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = ''; let conf = 1;
  rec.onstart = () => { recording = true; bar(L('يستمع… تحدّث الآن', 'Listening… speak now')); };
  rec.onresult = (e) => {
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { finalText += r[0].transcript; conf = Math.min(conf, r[0].confidence || 1); } else interim += r[0].transcript;
    }
    bar(L('يستمع…', 'Listening…'), finalText + interim);
  };
  rec.onerror = (e) => {
    recording = false; bar('');
    const msg = { 'not-allowed': L('لم يُسمح باستخدام الميكروفون.', 'Microphone permission denied.'), 'no-speech': L('لم يُلتقط أي كلام.', 'No speech detected.'), network: L('تعذّر الوصول لخدمة التعرّف على الكلام.', 'Speech service unreachable.'), 'audio-capture': L('لا يوجد ميكروفون متاح.', 'No microphone available.') }[e.error] || `${L('تعذّر تشغيل الصوت', 'Voice error')}: ${e.error}`;
    onError(`${msg} ${L('المحادثة النصية متاحة.', 'Text chat is still available.')}`);
  };
  rec.onend = () => {
    recording = false; bar('');
    const text = finalText.trim();
    if (text) onFinal?.(text, { confidence: conf });
  };
  try { rec.start(); } catch (e) { onError(e.message); }
}

async function startServer(onError) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const chunks = [];
    media = new MediaRecorder(stream);
    media.ondataavailable = (e) => chunks.push(e.data);
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      recording = false; bar(L('جارٍ تحويل الكلام إلى نص…', 'Transcribing…'));
      try {
        const blob = new Blob(chunks, { type: media.mimeType || 'audio/webm' });
        const r = await api(`/api/voice/transcribe?lang=${getLang()}`, { method: 'POST', raw: blob, headers: { 'content-type': blob.type } });
        bar('');
        if (r.text?.trim()) onFinal?.(r.text.trim(), { confidence: 1 });
      } catch (e) { bar(''); onError(`${e.message}. ${L('المحادثة النصية متاحة.', 'Text chat is still available.')}`); }
    };
    media.start(); recording = true; bar(L('يسجّل… اضغط إيقاف عند الانتهاء', 'Recording… press stop when done'));
  } catch (e) { recording = false; bar(''); onError(L('لم يُسمح باستخدام الميكروفون. المحادثة النصية متاحة.', 'Microphone permission denied. Text chat is still available.')); }
}

export function stop() {
  if (rec && recording) rec.stop();
  if (media && media.state === 'recording') media.stop();
}

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
  u.onstart = () => { $('#voice-bar').classList.remove('hidden'); $('#voice-state').textContent = L('يتحدث المساعد…', 'Assistant speaking…'); $('#voice-interim').textContent = ''; $('#voice-stop').textContent = L('مقاطعة', 'Interrupt'); };
  u.onend = u.onerror = () => { if (!recording) $('#voice-bar').classList.add('hidden'); $('#voice-stop').textContent = L('إيقاف', 'Stop'); };
  speechSynthesis.speak(u);
  return true;
}
export function stopSpeaking() { if ('speechSynthesis' in window) speechSynthesis.cancel(); }
export const ttsAvailable = () => 'speechSynthesis' in window;
