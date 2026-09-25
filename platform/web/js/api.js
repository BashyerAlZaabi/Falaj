// HTTP + realtime client. All requests carry the CSRF header; the server
// enforces authentication and permissions on every call.
export class ApiError extends Error { constructor(status, body) { super(body?.message || body?.error || `HTTP ${status}`); this.status = status; this.body = body; } }

export async function api(path, { method = 'GET', body, headers = {}, raw } = {}) {
  const init = { method, headers: { 'x-requested-with': 'swp', ...headers }, credentials: 'same-origin' };
  if (body !== undefined && !raw) { init.headers['content-type'] = 'application/json'; init.body = JSON.stringify(body); }
  if (raw) init.body = raw;
  const r = await fetch(path, init);
  const ct = r.headers.get('content-type') || '';
  const data = ct.includes('json') ? await r.json().catch(() => ({})) : await r.text();
  if (r.status === 401 && !path.startsWith('/api/auth')) { window.dispatchEvent(new CustomEvent('swp:unauth')); }
  if (!r.ok) throw new ApiError(r.status, data);
  return data;
}

export const rid = () => (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now());

// Streams NDJSON stage events from /api/chat. On a dropped connection, the
// same requestId is polled so the request is never re-executed.
export async function chatStream(payload, onEvent) {
  let final = null;
  try {
    const r = await fetch('/api/chat', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json', 'x-requested-with': 'swp' }, body: JSON.stringify(payload) });
    if (r.status === 401) { window.dispatchEvent(new CustomEvent('swp:unauth')); throw new Error('unauthenticated'); }
    const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
        if (!line) continue;
        const ev = JSON.parse(line);
        if (ev.stage === 'final') final = ev;
        onEvent(ev);
      }
    }
  } catch (e) {
    if (e.message === 'unauthenticated') throw e;
    onEvent({ stage: 'reconnecting' });
  }
  if (!final) {
    // Connection lost: recover the outcome by requestId (idempotent — no re-run).
    for (let k = 0; k < 20 && !final; k++) {
      await new Promise((res) => setTimeout(res, 800 + k * 300));
      try {
        const s = await api(`/api/chat/result/${encodeURIComponent(payload.requestId)}`);
        if (s.status === 'done') { final = { stage: 'final', ...s.response, recovered: true }; onEvent(final); }
        else if (s.status === 'unknown') break;
      } catch { /* keep trying */ }
    }
  }
  if (!final) { final = { stage: 'final', status: 'failed', text: 'انقطع الاتصال ولم يُعرف مصير الطلب. أعد المحاولة — لن يتكرر أي إجراء نُفّذ سابقاً لنفس الطلب.', retryable: true }; onEvent(final); }
  return final;
}

export function realtime(onEvent, onState) {
  let es; let retry = 1000;
  const open = () => {
    es = new EventSource('/api/stream');
    es.onopen = () => { retry = 1000; onState('live'); };
    es.onmessage = (m) => { try { onEvent(JSON.parse(m.data)); } catch {} };
    es.onerror = () => { onState('offline'); es.close(); setTimeout(open, retry); retry = Math.min(retry * 2, 15000); };
  };
  open();
  return () => es?.close();
}
