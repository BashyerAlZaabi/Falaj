// Connected-model path: a local mock of an OpenAI-compatible endpoint drives the
// tool-use loop (no real model key exists in CI). Verifies routing via AI
// Services, tool execution through the executor, honest fallback on failure.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startStack, login } from './helpers.js';

let S; let mock; let mode = 'ok'; const calls = [];
before(async () => {
  mock = http.createServer((req, res) => {
    let body = ''; req.on('data', (d) => (body += d)); req.on('end', () => {
      const b = JSON.parse(body); calls.push({ auth: req.headers.authorization, body: b });
      if (req.url.endsWith('/v1/messages')) { // Anthropic Messages API shape
        assert.equal(req.headers['anthropic-version'], '2023-06-01');
        const hasResult = b.messages.some((m) => Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result'));
        const content = hasResult ? [{ type: 'text', text: 'أضفت المهمة.' }] : [{ type: 'tool_use', id: 'tu1', name: 'create_task', input: { title: 'مهمة من Claude' } }];
        res.writeHead(200, { 'content-type': 'application/json' });
        return res.end(JSON.stringify({ content, stop_reason: hasResult ? 'end_turn' : 'tool_use', usage: { input_tokens: 5, output_tokens: 3 } }));
      }
      if (mode === 'fail') { res.writeHead(500, { 'content-type': 'application/json' }); return res.end('{"error":{"message":"boom"}}'); }
      const hasToolResult = b.messages.some((m) => m.role === 'tool');
      const msg = hasToolResult
        ? { role: 'assistant', content: 'تم تحديث نسبة إنجاز مشروع البوابة الموحدة إلى 62%.' }
        : { role: 'assistant', content: null, tool_calls: [{ id: 'c1', type: 'function', function: { name: 'update_project', arguments: JSON.stringify({ id: 'pr_portal', progress: 62 }) } }] };
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 10, completion_tokens: 5 } }));
    });
  }).listen(0);
  await new Promise((r) => mock.once('listening', r));
  S = await startStack({ extraEnv: { MOCK_LLM_KEY: 'test-key' } });
});
after(async () => { await S?.stop(); mock?.close(); });

test('admin routes chat to a model provider; the assistant uses tools through the executor', async () => {
  const admin = await login(S.portal, 'mariam');
  const p = await admin.put('/api/admin/ai/providers', { id: 'ap_mock', name: 'Mock gateway', kind: 'openai_compatible', base_url: `http://127.0.0.1:${mock.address().port}/v1`, model: 'mock-1', api_key_env: 'MOCK_LLM_KEY' });
  assert.equal(p.status, 200);
  assert.equal((await admin.post('/api/admin/ai/providers/ap_mock/test')).data.ok, true);
  await admin.put('/api/admin/ai/routing', { capability: 'chat', provider_id: 'ap_mock' });
  const ahmed = await login(S.portal, 'ahmed');
  assert.equal((await ahmed.get('/api/me')).data.assistant.mode, 'model');
  const { final } = await ahmed.chat('ارفع نسبة البوابة');
  assert.equal(final.mode, 'model');
  assert.equal(final.status, 'done');
  assert.match(final.text, /62%/);
  assert.equal((await ahmed.get('/api/projects/pr_portal')).data.progress, 62);
  const last = calls.at(-1);
  assert.equal(last.auth, 'Bearer test-key'); // key read from server env only
  assert.ok(last.body.tools.some((t) => t.function.name === 'update_project'));
  assert.ok(!last.body.tools.some((t) => /vault|marsad/i.test(t.function.name)));
  // the key never reaches the browser
  assert.ok(!JSON.stringify((await admin.get('/api/admin/ai')).data).includes('test-key'));
  const usage = (await admin.get('/api/admin/ai')).data.usage;
  assert.ok(usage.some((u) => u.provider_id === 'ap_mock' && u.calls >= 2));
});

test('model tool calls are still permission-checked on the server', async () => {
  const omar = await login(S.portal, 'omar');
  const { final } = await omar.chat('ارفع نسبة البوابة');
  assert.equal(final.actions[0].status, 'error'); // pr_portal outside omar's scope
  assert.equal((await omar.get('/api/projects/pr_portal')).status, 404);
});

test('model failure -> honest local fallback, nothing claimed', async () => {
  mode = 'fail';
  const a = await login(S.portal, 'ahmed');
  const { final } = await a.chat('ما هي مهامي؟');
  assert.equal(final.mode, 'local-fallback');
  assert.ok(final.notes.some((n) => /تعذّر الاتصال بخدمة النموذج/.test(n)));
  mode = 'ok';
});

test('Anthropic Messages API adapter: tool_use -> tool_result loop', async () => {
  const admin = await login(S.portal, 'mariam');
  await admin.put('/api/admin/ai/providers', { id: 'ap_anthropic', name: 'Anthropic Claude', kind: 'anthropic', base_url: `http://127.0.0.1:${mock.address().port}`, model: 'claude-sonnet-5', api_key_env: 'MOCK_LLM_KEY' });
  await admin.put('/api/admin/ai/routing', { capability: 'chat', provider_id: 'ap_anthropic' });
  const a = await login(S.portal, 'ahmed');
  const { final } = await a.chat('أضف مهمة');
  assert.equal(final.mode, 'model');
  assert.equal(final.status, 'done');
  assert.ok((await a.get('/api/tasks?mine=1')).data.some((t) => t.title === 'مهمة من Claude'));
  const last = calls.at(-1).body;
  assert.equal(last.model, 'claude-sonnet-5');
  assert.ok(last.messages.some((m) => Array.isArray(m.content) && m.content[0]?.type === 'tool_result'));
});
