// Voice: speech-to-text starts ONLY on an explicit user action; the mic state is
// visible for the whole recording (red dot + elapsed time + live transcript);
// transcribing and the assistant speaking have their own calm states; replies
// can be muted or interrupted; text chat always remains available if voice is
// unsupported or fails.
//
// Engine extensions used by the voice conversation mode (assistant-orb.js):
// • start(handler, onError, { bar, onInterim, onStart, onEmpty }) — the same
//   recogniser without touching the composer's voice bar, with live captions.
// • abort() — stop listening and DROP whatever was heard (mute / end).
// • speak(text, { onStart, onEnd, onBoundary, force }) — events for captions and
//   the orb; onEnd always fires once (watchdog for engines that never end).
// • speakLevel() — a 0..1 envelope while speaking (boundary-driven, simulated
//   when the engine sends no boundary events); micLevel() from openMeter().
// • openMeter() — WebAudio AnalyserNode on the microphone (only ever called
//   after an explicit user action); close() releases the tracks and context.
// • on('state', fn) — 'listening' | 'transcribing' | 'speaking' | 'idle'.
import { $, h, icon } from './ui.js';
import { L, getLang } from './i18n.js';
import { api } from './api.js';
import { state } from './state.js';

const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null; let media = null; let recording = false; let onFinal = null;
let session = 0; // bumps on every start/abort: late events from an old recogniser are ignored
let muted = (() => { try { return localStorage.getItem('swp.mute') === '1'; } catch { return false; } })();

export const sttMode = () => (state.me?.voice?.stt?.kind === 'openai_compatible' ? 'server' : SR ? 'browser' : 'none');
export const isMuted = () => muted;
export function setMuted(v) { muted = v; try { localStorage.setItem('swp.mute', v ? '1' : '0'); } catch {} if (v) stopSpeaking(); }
export const isRecording = () => recording;

// ---------- tiny event bus (orb + voice mode) ----------
const listeners = new Map();
export function on(type, fn) { if (!listeners.has(type)) listeners.set(type, new Set()); listeners.get(type).add(fn); return () => listeners.get(type)?.delete(fn); }
function fire(type, detail) { for (const fn of listeners.get(type) || []) { try { fn(detail); } catch (e) { console.warn('[voice]', e); } } }
let vstate = 'idle';
function setState(s) { if (s === vstate) return; vstate = s; fire('state', s); }
export const voiceState = () => vstate;

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
let useBar = true; // false while a custom UI (voice conversation mode) drives the recogniser
function bar(kind, stateText = '', interim = '', dom = useBar) {
  setState(kind === 'listening' && recording ? 'listening' : kind === 'transcribing' ? 'transcribing' : kind === 'speaking' ? 'speaking' : (speaking ? 'speaking' : 'idle'));
  if (!dom) return;
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
  if (!mic) return;
  mic.classList.toggle('rec', recording);
  mic.setAttribute('aria-pressed', String(recording));
  const micLabel = recording ? L('إيقاف التسجيل', 'Stop recording') : L('تحدّث', 'Speak');
  mic.title = micLabel; mic.setAttribute('aria-label', micLabel);
}

const TEXT_OK = () => L('المحادثة النصية متاحة.', 'Text chat is still available.');

// opts.bar=false: drive a custom UI through onStart / onInterim / onEmpty instead of #voice-bar.
export function start(handler, onError, opts = {}) {
  stopSpeaking(); // interrupt any reply being spoken
  if (recording) abort();
  onFinal = handler;
  useBar = opts.bar !== false;
  const my = ++session;
  const live = () => my === session;
  const mode = sttMode();
  if (mode === 'none') { onError(L('التعرّف على الكلام غير مدعوم في هذا المتصفح. يمكنك متابعة المحادثة بالكتابة.', 'Speech recognition is not supported in this browser. You can keep chatting by text.'), { code: 'unsupported', retry: false }); return; }
  if (mode === 'server') return startServer(onError, opts, live);
  rec = new SR();
  rec.lang = getLang() === 'ar' ? 'ar-AE' : 'en-US';
  rec.interimResults = true; rec.continuous = false; rec.maxAlternatives = 1;
  let finalText = ''; let conf = 1;
  rec.onstart = () => { if (!live()) return; recording = true; bar('listening', L('يستمع… تحدّث الآن', 'Listening… speak now')); opts.onStart?.(); };
  rec.onresult = (e) => {
    if (!live()) return;
    let interim = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      const r = e.results[i];
      if (r.isFinal) { finalText += r[0].transcript; conf = Math.min(conf, r[0].confidence || 1); } else interim += r[0].transcript;
    }
    bar('listening', L('يستمع…', 'Listening…'), finalText + interim);
    opts.onInterim?.(finalText + interim, { final: !interim });
  };
  rec.onerror = (e) => {
    if (!live()) return;
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
    finalText = ''; // an errored turn never also delivers a result
    onError(`${msg || `${L('تعذّر تشغيل الصوت', 'Voice error')}: ${e.error}`} ${TEXT_OK()}`, { code: e.error, retry: e.error !== 'audio-capture' });
  };
  rec.onend = () => {
    if (!live()) return;
    recording = false; bar('');
    const text = finalText.trim();
    if (text) onFinal?.(text, { confidence: conf });
    else opts.onEmpty?.();
  };
  try { rec.start(); } catch (e) { onError(e.message, { code: 'start', retry: true }); }
}

async function startServer(onError, opts, live) {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!live()) { stream.getTracks().forEach((t) => t.stop()); return; }
    const chunks = [];
    media = new MediaRecorder(stream);
    media.ondataavailable = (e) => chunks.push(e.data);
    media.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (!live()) return; // aborted: discard the recording
      recording = false; bar('transcribing', L('جارٍ تحويل الكلام إلى نص…', 'Transcribing…'));
      opts.onInterim?.(L('جارٍ تحويل الكلام إلى نص…', 'Transcribing…'), { pending: true });
      try {
        const blob = new Blob(chunks, { type: media.mimeType || 'audio/webm' });
        const r = await api(`/api/voice/transcribe?lang=${getLang()}`, { method: 'POST', raw: blob, headers: { 'content-type': blob.type } });
        if (!live()) return;
        bar('');
        if (r.text?.trim()) onFinal?.(r.text.trim(), { confidence: 1 });
        else if (opts.onEmpty) opts.onEmpty();
        else onError(`${L('لم يُلتقط أي كلام واضح.', 'No clear speech was captured.')} ${TEXT_OK()}`, { code: 'no-speech', retry: true });
      } catch (e) { if (live()) { bar(''); onError(`${e.message}. ${TEXT_OK()}`, { code: 'transcribe', retry: true }); } }
    };
    media.start(); recording = true; bar('listening', L('يسجّل… اضغط «إيقاف» عند الانتهاء', 'Recording… press Stop when done')); opts.onStart?.();
  } catch (e) {
    if (!live()) return;
    recording = false; bar('');
    onError(`${L('الميكروفون غير مسموح. فعّله من إعدادات الموقع في المتصفح (رمز القفل بجوار العنوان) ثم حاول مجدداً.', 'Microphone access is blocked. Allow it in the browser’s site settings (the lock icon by the address), then try again.')} ${TEXT_OK()}`, { code: 'not-allowed', retry: true });
  }
}

// Stop listening; what was said so far is still delivered (end of a turn).
export function stop() {
  if (rec && recording) rec.stop();
  if (media && media.state === 'recording') media.stop();
}

// Stop listening and discard what was heard (mute, close, interrupt).
export function abort() {
  session++;
  const r = rec; rec = null;
  if (r) { try { r.abort ? r.abort() : r.stop(); } catch { /* already ended */ } }
  if (media && media.state === 'recording') { try { media.stop(); } catch {} }
  recording = false; stopTimer();
  if (useBar) { const b = $('#voice-bar'); if (b) { b.classList.add('hidden'); b.dataset.state = ''; } const mic = $('#btn-mic'); if (mic) { mic.classList.remove('rec'); mic.setAttribute('aria-pressed', 'false'); } }
  useBar = true;
  setState(speaking ? 'speaking' : 'idle');
}

// Stop listening and any spoken reply, and hide the bar.
export function dismiss() { stop(); stopSpeaking(); stopTimer(); const b = $('#voice-bar'); if (b) { b.classList.add('hidden'); b.dataset.state = ''; } }

// ---------- speech synthesis ----------
let speaking = false; let env = { peak: 0, at: 0, boundary: false, t0: 0 }; let watchdog = null; let endCb = null;
const cleanForSpeech = (text, max = 1200) => String(text || '').replace(/\*\*|_/g, '').replace(/\[يُستكمل[^\]]*\]/g, '').replace(/^\s*[•·\-–*]\s+/gm, '').replace(/\|/g, ' ').replace(/\s+\n/g, '\n').slice(0, max);
export const speechText = cleanForSpeech;
function voiceFor(text) {
  if (!('speechSynthesis' in window)) return null;
  const lang = /[؀-ۿ]/.test(text) ? 'ar' : 'en';
  const v = speechSynthesis.getVoices().find((x) => x.lang.toLowerCase().startsWith(lang));
  return { lang, voice: v || null };
}
// Can this device speak a reply in this language? (no Arabic voice installed → false)
export function canSpeak(text = 'ا') { const v = voiceFor(text); return !!v && (!!v.voice || v.lang !== 'ar'); }

export function speak(text, opts = {}) {
  if ((muted && !opts.force) || !('speechSynthesis' in window) || !text) return false;
  stopSpeaking();
  const clean = cleanForSpeech(text, opts.max || 1200);
  const u = new SpeechSynthesisUtterance(clean);
  const vf = voiceFor(clean);
  u.lang = vf.lang === 'ar' ? 'ar-SA' : 'en-US';
  if (vf.voice) u.voice = vf.voice; else if (vf.lang === 'ar') return false; // no Arabic voice installed
  u.rate = 1;
  let done = false;
  const finish = (interrupted) => {
    if (done) return; done = true;
    clearTimeout(watchdog); watchdog = null; speaking = false; endCb = null;
    if (!recording && opts.bar !== false) bar('', '', '', true); else setState(recording ? 'listening' : 'idle');
    opts.onEnd?.({ interrupted: !!interrupted });
  };
  endCb = finish;
  u.onstart = () => {
    speaking = true; env = { peak: 0.6, at: performance.now(), boundary: false, t0: performance.now() };
    if (opts.bar !== false) bar('speaking', L('يتحدث المساعد… يمكنك المقاطعة في أي لحظة', 'Assistant speaking… interrupt any time'), '', true); else setState('speaking');
    opts.onStart?.();
  };
  u.onboundary = (e) => { env.peak = 0.55 + Math.random() * 0.45; env.at = performance.now(); env.boundary = true; opts.onBoundary?.(e.charIndex || 0, clean); };
  u.onend = () => finish(false);
  u.onerror = (e) => finish(e?.error === 'interrupted' || e?.error === 'canceled');
  // Some engines never fire onend for long text: end after a generous estimate.
  watchdog = setTimeout(() => { try { speechSynthesis.cancel(); } catch {} finish(false); }, 4000 + clean.length * 110);
  speechSynthesis.speak(u);
  return true;
}
export function stopSpeaking() {
  if ('speechSynthesis' in window) speechSynthesis.cancel();
  if (endCb) endCb(true);
}
export const ttsAvailable = () => 'speechSynthesis' in window;
export const isSpeaking = () => speaking;

// 0..1 loudness envelope while the assistant speaks. Boundary events (word
// starts) set a peak that decays; without them a syllable-rate envelope is
// simulated so the orb still breathes with the voice.
export function speakLevel() {
  if (!speaking) return 0;
  const now = performance.now();
  const since = now - env.at;
  if (env.boundary && since < 700) return Math.max(0.12, env.peak * Math.exp(-since / 180));
  const t = (now - env.t0) / 1000;
  return 0.28 + 0.22 * Math.abs(Math.sin(t * 7.3)) + 0.16 * Math.abs(Math.sin(t * 2.1 + 1.3));
}

// ---------- microphone level meter (WebAudio) ----------
// Only called after an explicit user action (opening the voice conversation).
let meter = null;
export async function openMeter() {
  if (meter) return meter;
  if (!navigator.mediaDevices?.getUserMedia || !(window.AudioContext || window.webkitAudioContext)) throw new Error('unsupported');
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const src = ctx.createMediaStreamSource(stream);
  const an = ctx.createAnalyser(); an.fftSize = 512; an.smoothingTimeConstant = 0.6;
  src.connect(an);
  const buf = new Uint8Array(an.fftSize);
  let smooth = 0;
  meter = {
    level() {
      an.getByteTimeDomainData(buf);
      let sum = 0; for (let i = 0; i < buf.length; i++) { const v = (buf[i] - 128) / 128; sum += v * v; }
      const rms = Math.sqrt(sum / buf.length);
      const lvl = Math.min(1, Math.max(0, (rms - 0.015) * 7));
      smooth = smooth * 0.7 + lvl * 0.3;
      return smooth;
    },
    close() {
      try { src.disconnect(); } catch {}
      stream.getTracks().forEach((t) => t.stop());
      ctx.close?.().catch?.(() => {});
      meter = null;
    },
  };
  return meter;
}
export function closeMeter() { meter?.close(); }
export const micLevel = () => (meter ? meter.level() : 0);
export const hasMeter = () => !!meter;
