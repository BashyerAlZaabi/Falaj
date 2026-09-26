// AI Services (shared layer for components OUTSIDE Vault).
// Centrally managed providers + per-capability routing + usage log.
// No fixed number of models is assumed: admins add providers and route
// capabilities (chat, generate, summarize, analyze, stt, tts) to them.
// API keys are only referenced by env-var name and never leave the server.
import Anthropic from '@anthropic-ai/sdk';
import { all, one, run, uid, now } from '../db.js';

export const CAPABILITIES = ['chat', 'generate', 'summarize', 'analyze', 'stt', 'tts'];

export function listProviders() {
  return all('SELECT * FROM ai_providers ORDER BY name').map((p) => ({ ...p, key_present: p.kind === 'local' ? true : !!(p.api_key_env && process.env[p.api_key_env]), api_key_env: p.api_key_env }));
}

export function routing() {
  return Object.fromEntries(all('SELECT capability, provider_id FROM ai_routing').map((r) => [r.capability, r.provider_id]));
}

export function providerStatus(p) {
  if (!p) return { state: 'missing' };
  if (p.kind === 'local') return { state: 'local', label_ar: 'محلي (قواعد)', label_en: 'Local rules' };
  if (!p.enabled) return { state: 'disabled', label_ar: 'معطّل', label_en: 'Disabled' };
  if (!p.api_key_env || !process.env[p.api_key_env]) return { state: 'not_configured', label_ar: `غير متصل — المفتاح ${p.api_key_env || ''} غير مضبوط`, label_en: `Not connected — ${p.api_key_env || 'key'} not set` };
  if (p.last_check_ok === 0) return { state: 'error', label_ar: `خطأ اتصال: ${p.last_check_message || ''}`, label_en: `Connection error: ${p.last_check_message || ''}` };
  if (p.last_check_ok === 1) return { state: 'connected', label_ar: 'متصل', label_en: 'Connected' };
  return { state: 'configured', label_ar: 'مضبوط (لم يُختبر بعد)', label_en: 'Configured (untested)' };
}

// Returns the provider serving a capability, or the local fallback if the
// routed provider isn't usable. `degraded` tells callers to be honest about it.
export function resolve(capability) {
  const r = one('SELECT p.* FROM ai_routing r JOIN ai_providers p ON p.id=r.provider_id WHERE r.capability=?', capability);
  const st = providerStatus(r);
  if (r && ['connected', 'configured'].includes(st.state)) return { provider: r, status: st, degraded: false };
  const local = one("SELECT * FROM ai_providers WHERE kind='local' LIMIT 1");
  return { provider: local, status: providerStatus(local), degraded: !!r && r.kind !== 'local', wanted: r, wantedStatus: st };
}

function logUsage(user, capability, p, ok, usage = {}, error) {
  run('INSERT INTO ai_usage (id,user_id,capability,provider_id,model,input_tokens,output_tokens,ok,error) VALUES (?,?,?,?,?,?,?,?,?)',
    uid('u_'), user?.id ?? null, capability, p.id, p.model, (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) + (usage.cache_creation_input_tokens || 0), usage.output_tokens || 0, ok ? 1 : 0, error ? String(error).slice(0, 300) : null);
}

// Unified completion. messages: [{role:'user'|'assistant', content: string | blocks}]
// tools: [{name, description, input_schema}]
// Returns { text, tool_calls:[{id,name,input}], raw_content, stop_reason }
export async function complete({ capability = 'chat', system, messages, tools, maxTokens = 2048, user, signal }) {
  const { provider: p, degraded } = resolve(capability);
  if (!p || p.kind === 'local') { const e = new Error('no-remote-model'); e.local = true; e.degraded = degraded; throw e; }
  const key = process.env[p.api_key_env];
  try {
    let out;
    if (p.kind === 'anthropic') out = await anthropic(p, key, { system, messages, tools, maxTokens, signal });
    else out = await openaiCompatible(p, key, { system, messages, tools, maxTokens, signal });
    logUsage(user, capability, p, true, out.usage);
    if (p.last_check_ok !== 1) run('UPDATE ai_providers SET last_check_ok=1,last_check_at=?,last_check_message=NULL WHERE id=?', now(), p.id);
    return { ...out, provider: p.name, model: p.model };
  } catch (e) {
    logUsage(user, capability, p, false, {}, e.message);
    run('UPDATE ai_providers SET last_check_ok=0,last_check_at=?,last_check_message=? WHERE id=?', now(), String(e.message).slice(0, 200), p.id);
    throw e;
  }
}

// Claude via the official SDK. The SDK sends the API key from the server's
// environment only; retries 429/5xx with backoff; honours the abort signal.
const clients = new Map();
function claudeClient(p, key) {
  const id = `${p.base_url || ''}|${key}`;
  if (!clients.has(id)) {
    clients.set(id, new Anthropic({ apiKey: key, ...(p.base_url ? { baseURL: p.base_url } : {}), maxRetries: 2, timeout: Number(process.env.ANTHROPIC_TIMEOUT_MS || 120_000) }));
    if (clients.size > 8) clients.delete(clients.keys().next().value);
  }
  return clients.get(id);
}
// Adaptive thinking on models that support it (Claude 4.6+ / 5 family) unless disabled.
const thinks = (model) => process.env.ANTHROPIC_THINKING !== 'off' && /^claude-(opus|sonnet|fable)-(5|4-[6-9])/.test(model || '');

function claudeError(e) {
  const map = [
    [Anthropic.AuthenticationError, 'مفتاح Claude غير صالح — راجع ANTHROPIC_API_KEY'],
    [Anthropic.PermissionDeniedError, 'المفتاح لا يملك صلاحية هذا النموذج'],
    [Anthropic.NotFoundError, 'النموذج غير موجود — راجع ANTHROPIC_MODEL'],
    [Anthropic.RateLimitError, 'تجاوزنا حد الطلبات لدى Claude مؤقتاً، حاول بعد قليل'],
    [Anthropic.BadRequestError, 'رفض Claude الطلب'],
    [Anthropic.APIConnectionError, 'تعذّر الاتصال بخدمة Claude'],
  ];
  const hit = map.find(([cls]) => e instanceof cls);
  const out = new Error(`Anthropic ${e.status || ''}: ${hit ? hit[1] : 'خطأ من خدمة Claude'} (${String(e.message || '').slice(0, 160)})`);
  out.status = e.status; out.retryable = e instanceof Anthropic.RateLimitError || e instanceof Anthropic.APIConnectionError || e instanceof Anthropic.InternalServerError;
  return out;
}

async function anthropic(p, key, { system, messages, tools, maxTokens, signal, ping }) {
  const thinking = !ping && thinks(p.model);
  // Stable prefix (tools + system) is cached; the conversation varies per turn.
  const cachedTools = tools?.length ? tools.map((t, i) => (i === tools.length - 1 ? { ...t, cache_control: { type: 'ephemeral' } } : t)) : undefined;
  const params = {
    model: p.model,
    max_tokens: thinking ? Math.max(maxTokens, 16000) : maxTokens,
    ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
    messages,
    ...(cachedTools ? { tools: cachedTools } : {}),
    ...(thinking ? { thinking: { type: 'adaptive' } } : {}),
    ...(process.env.ANTHROPIC_EFFORT ? { output_config: { effort: process.env.ANTHROPIC_EFFORT } } : {}),
  };
  let msg;
  try { msg = await claudeClient(p, key).messages.create(params, { signal }); }
  catch (e) { if (e instanceof Anthropic.APIUserAbortError) throw e; throw claudeError(e); }
  const content = msg.content || [];
  if (msg.stop_reason === 'refusal') {
    const text = 'لا يمكنني المساعدة في هذا الطلب. يمكنك إعادة صياغته أو التواصل مع المختص.';
    return { text, tool_calls: [], raw_content: [{ type: 'text', text }], stop_reason: 'refusal', usage: msg.usage };
  }
  const text = content.filter((b) => b.type === 'text').map((b) => b.text).join('\n');
  const tool_calls = content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, name: b.name, input: b.input }));
  // raw_content keeps thinking blocks so the tool loop can pass them back unchanged.
  return { text, tool_calls, raw_content: content, stop_reason: msg.stop_reason, usage: msg.usage };
}

// Converts our Anthropic-shaped messages to OpenAI chat format.
async function openaiCompatible(p, key, { system, messages, tools, maxTokens, signal }) {
  const msgs = [{ role: 'system', content: system || '' }];
  for (const m of messages) {
    if (typeof m.content === 'string') { msgs.push({ role: m.role, content: m.content }); continue; }
    if (m.role === 'assistant') {
      msgs.push({ role: 'assistant', content: m.content.filter((b) => b.type === 'text').map((b) => b.text).join('\n') || null,
        tool_calls: m.content.filter((b) => b.type === 'tool_use').map((b) => ({ id: b.id, type: 'function', function: { name: b.name, arguments: JSON.stringify(b.input) } })) });
    } else {
      for (const b of m.content) {
        if (b.type === 'tool_result') msgs.push({ role: 'tool', tool_call_id: b.tool_use_id, content: typeof b.content === 'string' ? b.content : JSON.stringify(b.content) });
        else if (b.type === 'text') msgs.push({ role: 'user', content: b.text });
      }
    }
  }
  const res = await fetch(`${p.base_url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: p.model, max_tokens: maxTokens, messages: msgs, ...(tools?.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } })) } : {}) }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${body?.error?.message || res.statusText}`);
  const msg = body.choices?.[0]?.message || {};
  const tool_calls = (msg.tool_calls || []).map((c) => ({ id: c.id, name: c.function.name, input: JSON.parse(c.function.arguments || '{}') }));
  const raw_content = [...(msg.content ? [{ type: 'text', text: msg.content }] : []), ...tool_calls.map((c) => ({ type: 'tool_use', ...c }))];
  return { text: msg.content || '', tool_calls, raw_content, stop_reason: tool_calls.length ? 'tool_use' : 'end_turn', usage: { input_tokens: body.usage?.prompt_tokens, output_tokens: body.usage?.completion_tokens } };
}

export async function testProvider(id) {
  const p = one('SELECT * FROM ai_providers WHERE id=?', id);
  if (!p) throw new Error('not found');
  if (p.kind === 'local') return { ok: true, message: 'local' };
  if (!process.env[p.api_key_env]) {
    run('UPDATE ai_providers SET last_check_ok=NULL,last_check_at=?,last_check_message=? WHERE id=?', now(), 'key missing', id);
    return { ok: false, message: `المتغير ${p.api_key_env} غير مضبوط في الخادم` };
  }
  try {
    const out = p.kind === 'anthropic'
      ? await anthropic(p, process.env[p.api_key_env], { system: 'ping', messages: [{ role: 'user', content: 'ping' }], maxTokens: 5, ping: true })
      : await openaiCompatible(p, process.env[p.api_key_env], { system: 'ping', messages: [{ role: 'user', content: 'ping' }], maxTokens: 5 });
    run('UPDATE ai_providers SET last_check_ok=1,last_check_at=?,last_check_message=NULL WHERE id=?', now(), id);
    return { ok: true, message: 'connected', sample: out.text };
  } catch (e) {
    run('UPDATE ai_providers SET last_check_ok=0,last_check_at=?,last_check_message=? WHERE id=?', now(), String(e.message).slice(0, 200), id);
    return { ok: false, message: e.message };
  }
}

export function upsertProvider(input) {
  const kinds = ['anthropic', 'openai_compatible', 'local'];
  if (!kinds.includes(input.kind)) throw new Error('bad kind');
  if (input.api_key_env && !/^[A-Z][A-Z0-9_]{2,60}$/.test(input.api_key_env)) throw new Error('اسم متغير البيئة غير صالح');
  if (input.base_url && !/^https?:\/\//.test(input.base_url)) throw new Error('رابط غير صالح');
  const id = input.id || uid('ap_');
  run(`INSERT INTO ai_providers (id,name,kind,base_url,model,api_key_env,enabled) VALUES (?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET name=excluded.name,kind=excluded.kind,base_url=excluded.base_url,model=excluded.model,api_key_env=excluded.api_key_env,enabled=excluded.enabled,last_check_ok=NULL`,
    id, input.name, input.kind, input.base_url || null, input.model || null, input.api_key_env || null, input.enabled === false ? 0 : 1);
  return one('SELECT * FROM ai_providers WHERE id=?', id);
}
export function setRoute(capability, providerId) {
  if (!CAPABILITIES.includes(capability)) throw new Error('bad capability');
  if (!one('SELECT 1 FROM ai_providers WHERE id=?', providerId)) throw new Error('provider not found');
  run('INSERT INTO ai_routing (capability,provider_id) VALUES (?,?) ON CONFLICT(capability) DO UPDATE SET provider_id=excluded.provider_id', capability, providerId);
}
export function usageSummary() {
  return all(`SELECT capability, provider_id, COUNT(*) calls, SUM(ok) ok, SUM(input_tokens) input_tokens, SUM(output_tokens) output_tokens, MAX(created_at) last
              FROM ai_usage GROUP BY capability, provider_id`);
}
