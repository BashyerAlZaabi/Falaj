// Vault boundary tests: inbound-only data paths, no read path from outside,
// separate storage, SSO identity-in only, egress blocked, AI stays inside.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { startStack, Client, login, ROOT } from './helpers.js';

let S;
before(async () => { S = await startStack(); });
after(async () => { await S?.stop(); });

const MARKER = 'علامة-فولت-سرية-93517';
const ingest = (p, token, body, headers = {}) => fetch(`${S.vault}${p}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', ...headers }, body: typeof body === 'string' || body instanceof Uint8Array ? body : JSON.stringify(body) });

async function vaultSession(username) {
  // Full SSO: portal session -> signed assertion -> vault session
  const portal = await login(S.portal, username);
  const vault = new Client(S.vault);
  const start = await vault.get('/sso/start?next=/marsad');
  assert.equal(start.status, 302);
  const authorize = start.headers.get('location');
  const auth = await fetch(authorize, { redirect: 'manual', headers: { cookie: portal.cookieHeader() } });
  assert.equal(auth.status, 302);
  const callback = auth.headers.get('location');
  assert.ok(callback.startsWith(`${S.vault}/sso/callback`));
  const cb = await vault.get(callback.replace(S.vault, ''));
  assert.equal(cb.status, 302);
  return { vault, portal, callback };
}

test('Wajib -> FS and Wajib -> Marsad and SU -> Marsad are inbound only (write-only, receipt only)', async () => {
  const r1 = await ingest('/ingest/wajib/fs', S.env.WAJIB_FS_TOKEN, [{ kind: 'مصروف', title: `سجل ${MARKER}`, amount: 1000, department_id: 'dept_fin' }, { kind: 'مصروف', title: 'سجل تقنية', amount: 500, department_id: 'dept_it' }]);
  assert.equal(r1.status, 202);
  const b1 = await r1.json();
  assert.deepEqual(Object.keys(b1).sort(), ['accepted', 'receipt']); // no content echoed
  const r2 = await ingest('/ingest/wajib/marsad', S.env.WAJIB_MARSAD_TOKEN, { title: 'بلاغ', department_id: 'dept_ops', text: `نص البلاغ ${MARKER}. يتضمن تفاصيل الرصد الأسبوعية المطولة لأغراض الاختبار.` });
  assert.equal(r2.status, 202);
  // wrong/other tokens are rejected; a token for one path cannot write another
  assert.equal((await ingest('/ingest/wajib/fs', 'bad', {})).status, 401);
  assert.equal((await ingest('/ingest/wajib/fs', S.env.SU_SERVICE_TOKEN, {})).status, 401);
  // service credentials cannot read anything
  for (const p of ['/ingest/wajib/fs', '/ingest/wajib/marsad', '/ingest/su/marsad']) {
    assert.equal((await fetch(`${S.vault}${p}`, { headers: { authorization: `Bearer ${S.env.WAJIB_FS_TOKEN}` } })).status, 405);
  }
  assert.equal((await fetch(`${S.vault}/api/fs`, { headers: { authorization: `Bearer ${S.env.WAJIB_FS_TOKEN}` } })).status, 401);
});

test('Smart Uploader (outside Vault) delivers to Marsad; nothing of the file stays outside Vault', async () => {
  const a = await login(S.portal, 'ahmed');
  const up = await a.req('POST', '/api/su/upload', new TextEncoder().encode(`محتوى الملف ${MARKER}-SU سطر ثاني للاختبار والتلخيص داخل البيئة المعزولة.`), { 'content-type': 'application/octet-stream', 'x-filename': encodeURIComponent('تقرير-رصد.txt') });
  assert.equal(up.status, 200);
  assert.ok(up.data.receipt);
  assert.ok(!JSON.stringify(up.data).includes(MARKER));
  // Portal database files (incl. WAL) never contain Vault content
  await new Promise((r) => setTimeout(r, 300));
  const portalFiles = fs.readdirSync(S.dataDir).filter((f) => f.startsWith('portal.db')).map((f) => path.join(S.dataDir, f));
  assert.ok(portalFiles.length);
  for (const f of portalFiles) assert.ok(!fs.readFileSync(f).includes(Buffer.from(MARKER)), `${f} leaked Vault content`);
  // Vault database is separate and holds it
  const vaultFiles = fs.readdirSync(path.join(S.dataDir, 'vault')).map((f) => path.join(S.dataDir, 'vault', f));
  assert.ok(vaultFiles.some((f) => fs.readFileSync(f).includes(Buffer.from(MARKER))));
});

test('no read path from the portal, the assistant, search, MCP or ADAA I into Vault', async () => {
  const p = await login(S.portal, 'president');
  for (const u of ['/api/vault/marsad', '/api/marsad', '/api/fs', '/api/su/files']) assert.equal((await p.get(u)).status, 404);
  assert.equal((await p.get(`/api/search?q=${encodeURIComponent(MARKER)}`)).data.length, 0);
  const kp = JSON.stringify((await p.get('/api/kpis')).data);
  assert.ok(!kp.includes(MARKER));
  const { final } = await p.chat('لخّص آخر بلاغات مرصاد');
  assert.match(final.text, /داخل Vault/);
  assert.equal(final.actions.length, 0);
  const token = (await p.post('/api/me/tokens', {})).data.token;
  const tools = await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list' }) }).then((r) => r.json());
  assert.ok(!JSON.stringify(tools).match(/marsad|vault_|fs_record/i));
  // The admin integration check only sees health, not data
  const m = await login(S.portal, 'mariam');
  const admin = (await m.get('/api/admin/ai')).data;
  assert.equal(admin.vault.reachable, true);
  assert.ok(!JSON.stringify(admin).includes(MARKER));
});

test('browsers on other origins cannot read Vault responses (no CORS, CORP same-origin)', async () => {
  const r = await fetch(`${S.vault}/health`, { headers: { origin: S.portal } });
  assert.equal(r.headers.get('access-control-allow-origin'), null);
  assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal((await fetch(`${S.vault}/api/marsad`, { method: 'OPTIONS', headers: { origin: S.portal, 'access-control-request-method': 'GET' } })).status, 403);
  assert.match(r.headers.get('content-security-policy'), /frame-ancestors 'none'/);
});

test('SSO: identity flows into Vault; assertion replay and foreign redirects are refused', async () => {
  const { vault, callback } = await vaultSession('president');
  const me = await vault.get('/api/me');
  assert.equal(me.status, 200);
  assert.equal(me.data.user.role, 'president');
  // replay the same assertion from a fresh client
  const replay = new Client(S.vault);
  const st = await replay.get('/sso/start');
  void st;
  assert.equal((await replay.get(callback.replace(S.vault, ''))).status, 401);
  // portal refuses to issue assertions to non-Vault redirect targets
  const p = await login(S.portal, 'president');
  assert.equal((await p.get('/api/identity/sso/authorize?redirect_uri=' + encodeURIComponent('https://evil.example/sso/callback'))).status, 400);
});

test('Vault enforces its own scopes and processes AI inside Vault only', async () => {
  const pres = (await vaultSession('president')).vault;
  const noura = (await vaultSession('noura')).vault;
  const ahmed = (await vaultSession('ahmed')).vault;
  const fsTitles = async (c) => (await c.get('/api/fs')).data.map((r) => r.title);
  assert.ok((await fsTitles(noura)).some((t) => t.includes(MARKER)));
  assert.ok(!(await fsTitles(noura)).includes('سجل تقنية'));
  assert.ok(!(await fsTitles(ahmed)).some((t) => t.includes(MARKER)));
  assert.equal((await fsTitles(pres)).length >= 2, true);
  const items = (await pres.get('/api/marsad')).data;
  const item = items.find((i) => i.source === 'wajib');
  assert.ok(item);
  // an employee sees only their own Smart Uploader items in Marsad
  const own = (await ahmed.get('/api/marsad')).data;
  assert.ok(own.length >= 1 && own.every((i) => i.source === 'smart_uploader'));
  const sum = await pres.post(`/api/marsad/${item.id}/summarize`, {}, { 'x-requested-with': 'vault' });
  assert.equal(sum.status, 200);
  assert.equal(sum.data.method, 'extractive');
  assert.ok(sum.data.points.join(' ').includes(MARKER));
  // AI output persisted inside Vault DB only
  const portalFiles = fs.readdirSync(S.dataDir).filter((f) => f.startsWith('portal.db'));
  for (const f of portalFiles) assert.ok(!fs.readFileSync(path.join(S.dataDir, f)).includes(Buffer.from(MARKER)));
  // CSRF on Vault mutations
  assert.equal((await pres.post(`/api/marsad/${item.id}/summarize`, {}, { 'x-requested-with': 'other' })).status, 403);
});

test('Vault egress guard blocks outside services (e.g. public AI APIs), allows internal allow-list', async () => {
  const { stdout: out } = await promisify(execFile)(process.execPath, ['--no-warnings', '--input-type=module', '-e', `
    import { installEgressGuard } from './vault/egress-guard.js';
    installEgressGuard(['127.0.0.1']);
    const res = [];
    for (const u of ['https://api.anthropic.com/v1/messages', 'https://api.openai.com/v1/chat/completions', 'http://127.0.0.1:${S.vault.split(':').pop()}/health']) {
      try { const r = await fetch(u); res.push(u + ' ' + r.status); } catch (e) { res.push(u + ' ' + (e.code || e.message)); }
    }
    const https = await import('node:https');
    try { https.request('https://example.com'); res.push('https ok'); } catch (e) { res.push('https ' + e.code); }
    const tls = await import('node:tls');
    try { tls.connect(443, 'example.com'); res.push('tls ok'); } catch (e) { res.push('tls ' + e.code); }
    const net = await import('node:net');
    try { new net.Socket().connect(80, '1.1.1.1'); res.push('net ok'); } catch (e) { res.push('net ' + e.code); }
    console.log(JSON.stringify(res));
  `], { cwd: ROOT, timeout: 15000, env: Object.fromEntries(Object.entries(process.env).filter(([k]) => k !== 'NODE_TEST_CONTEXT')) });
  const res = JSON.parse(out);
  assert.match(res[0], /EGRESS_BLOCKED/);
  assert.match(res[1], /EGRESS_BLOCKED/);
  assert.match(res[2], / 200$/);
  assert.equal(res[3], 'https EGRESS_BLOCKED');
  assert.equal(res[4], 'tls EGRESS_BLOCKED');
  assert.equal(res[5], 'net EGRESS_BLOCKED');
});
