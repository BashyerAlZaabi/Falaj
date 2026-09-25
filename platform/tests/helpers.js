// Test harness: boots the Portal and Vault as separate processes on free ports
// with a throwaway data directory, plus a tiny cookie-aware HTTP client.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import net from 'node:net';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const freePort = () => new Promise((res, rej) => { const srv = net.createServer(); srv.unref(); srv.on('error', rej); srv.listen(0, () => { const { port } = srv.address(); srv.close(() => res(port)); }); });
const children = new Set();
process.on('exit', () => { for (const c of children) try { c.kill('SIGKILL'); } catch {} });

export async function startStack({ portalPort, vaultPort, extraEnv = {} } = {}) {
  portalPort ??= await freePort();
  vaultPort ??= await freePort();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'swp-test-'));
  const env = {
    ...process.env, DATA_DIR: dataDir, PORT: String(portalPort), VAULT_PORT: String(vaultPort),
    PUBLIC_URL: `http://localhost:${portalPort}`, IDENTITY_URL: `http://localhost:${portalPort}`,
    VAULT_PUBLIC_URL: `http://localhost:${vaultPort}`, VAULT_INGEST_URL: `http://localhost:${vaultPort}/ingest/su/marsad`,
    SU_SERVICE_TOKEN: crypto.randomBytes(16).toString('hex'), WAJIB_FS_TOKEN: crypto.randomBytes(16).toString('hex'), WAJIB_MARSAD_TOKEN: crypto.randomBytes(16).toString('hex'),
    ANTHROPIC_API_KEY: '', LLM_GATEWAY_KEY: '', OFFICE_TICK_MS: '400', ...extraEnv,
  };
  const stack = { dataDir, env, portal: `http://localhost:${portalPort}`, vault: `http://localhost:${vaultPort}`, procs: {} };
  stack.startPortal = async () => { stack.procs.portal = spawnSvc('server/index.js', env); await waitUp(`${stack.portal}/api/health`, stack.procs.portal); };
  stack.startVault = async () => { stack.procs.vault = spawnSvc('vault/server.js', env); await waitUp(`${stack.vault}/health`, stack.procs.vault); };
  stack.stopPortal = async () => { await kill(stack.procs.portal); };
  stack.stop = async () => { await kill(stack.procs.portal); await kill(stack.procs.vault); fs.rmSync(dataDir, { recursive: true, force: true }); };
  await stack.startPortal();
  await stack.startVault();
  return stack;
}

function spawnSvc(file, env) {
  const p = spawn(process.execPath, ['--no-warnings', file], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] });
  p.stderr.on('data', (d) => { if (process.env.DEBUG_TESTS) process.stderr.write(d); });
  p.stdout.on('data', (d) => { if (process.env.DEBUG_TESTS) process.stdout.write(d); });
  children.add(p); p.on('exit', () => children.delete(p));
  return p;
}
const kill = (p) => new Promise((r) => { if (!p || p.exitCode !== null) return r(); p.once('exit', r); p.kill('SIGTERM'); setTimeout(() => { p.kill('SIGKILL'); r(); }, 3000); });
async function waitUp(url, proc) {
  for (let i = 0; i < 100; i++) {
    if (proc && proc.exitCode !== null) throw new Error(`service exited early (${url})`);
    try { const r = await fetch(url); if (r.ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error(`service did not start: ${url}`);
}

export class Client {
  constructor(base) { this.base = base; this.cookies = {}; }
  cookieHeader() { return Object.entries(this.cookies).map(([k, v]) => `${k}=${v}`).join('; '); }
  store(res) {
    for (const c of res.headers.getSetCookie?.() || []) { const [kv] = c.split(';'); const i = kv.indexOf('='); this.cookies[kv.slice(0, i)] = kv.slice(i + 1); }
  }
  async req(method, p, body, headers = {}) {
    const res = await fetch(this.base + p, { method, redirect: 'manual', headers: { 'x-requested-with': 'swp', cookie: this.cookieHeader(), ...(body !== undefined && !(body instanceof Uint8Array) ? { 'content-type': 'application/json' } : {}), ...headers }, body: body === undefined ? undefined : body instanceof Uint8Array ? body : JSON.stringify(body) });
    this.store(res);
    const ct = res.headers.get('content-type') || '';
    const data = ct.includes('ndjson') ? (await res.text()).trim().split('\n').map((l) => JSON.parse(l)) : ct.includes('json') ? await res.json() : Buffer.from(await res.arrayBuffer());
    return { status: res.status, data, headers: res.headers };
  }
  get(p, h) { return this.req('GET', p, undefined, h); }
  post(p, b, h) { return this.req('POST', p, b ?? {}, h); }
  put(p, b, h) { return this.req('PUT', p, b, h); }
  del(p, h) { return this.req('DELETE', p, undefined, h); }
  async login(username, password = 'Demo@2026') { const r = await this.post('/api/auth/login', { username, password }); if (r.status !== 200) throw new Error(`login ${username} failed`); this.user = r.data.user; return this; }
  async chat(message, extra = {}) {
    const r = await this.post('/api/chat', { message, requestId: extra.requestId || crypto.randomUUID(), conversationId: extra.conversationId ?? this.conversationId, ui: extra.ui || {}, voice: !!extra.voice });
    const final = r.data.find((e) => e.stage === 'final');
    if (final?.conversationId) this.conversationId = final.conversationId;
    return { events: r.data, final };
  }
  tool(name, input, extra = {}) { return this.post(`/api/tools/${name}`, { input, requestId: extra.requestId || crypto.randomUUID() }); }
}

export async function login(base, username) { return new Client(base).login(username); }
