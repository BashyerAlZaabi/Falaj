// Production readiness: health/readiness probes, request ids, versioned
// migrations, per-user AI rate limiting, consistent backups, and refusal to
// start in production with unsafe configuration.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startStack, login, ROOT } from './helpers.js';

let S;
before(async () => { S = await startStack({ extraEnv: { AI_RATE_LIMIT_PER_MIN: '3' } }); });
after(async () => { await S?.stop(); });

test('liveness and readiness probes (no session needed)', async () => {
  const h = await fetch(`${S.portal}/api/health`);
  assert.equal(h.status, 200);
  assert.match(h.headers.get('x-request-id'), /^[0-9a-f-]{36}$/);
  const r = await (await fetch(`${S.portal}/api/ready`)).json();
  assert.equal(r.ready, true);
  assert.equal(r.checks.database, 'ok');
  assert.equal(r.checks.migrations, 'ok');
  assert.equal(r.checks.vault, 'reachable');
  assert.equal(r.checks.model, 'local-rules');
  const v = await (await fetch(`${S.vault}/ready`)).json();
  assert.equal(v.ready, true);
  assert.equal(v.checks.identity_key, 'ok');
});

test('a well-formed incoming request id is echoed back', async () => {
  const r = await fetch(`${S.portal}/api/health`, { headers: { 'x-request-id': 'trace-12345678' } });
  assert.equal(r.headers.get('x-request-id'), 'trace-12345678');
  const bad = await fetch(`${S.portal}/api/health`, { headers: { 'x-request-id': 'x' } });
  assert.notEqual(bad.headers.get('x-request-id'), 'x');
});

test('migrations are recorded once per version', async () => {
  const db = new DatabaseSync(path.join(S.dataDir, 'portal.db'), { readOnly: true });
  const rows = db.prepare('SELECT version, name FROM schema_migrations ORDER BY version').all();
  db.close();
  assert.deepEqual(rows.map((r) => r.version), [1, 2, 3]);
});

test('assistant requests are rate-limited per user with Retry-After', async () => {
  const a = await login(S.portal, 'ahmed');
  for (let i = 0; i < 3; i++) assert.equal((await a.post('/api/chat', { message: 'مهامي', requestId: `rl-${i}` })).status, 200);
  const r = await a.post('/api/chat', { message: 'مهامي', requestId: 'rl-x' });
  assert.equal(r.status, 429);
  assert.equal(r.data.error, 'rate_limited');
  assert.ok(Number(r.headers.get('retry-after')) > 0);
  // another user is not affected
  const b = await login(S.portal, 'sara');
  assert.equal((await b.post('/api/chat', { message: 'مهامي', requestId: 'rl-b' })).status, 200);
});

test('backup script writes consistent snapshots; Vault backups stay under Vault data', () => {
  const dir = path.join(S.dataDir, 'bk');
  const out = spawnSync(process.execPath, ['--no-warnings', 'scripts/backup.js', '--dir', dir], { cwd: ROOT, env: S.env, encoding: 'utf8' });
  assert.equal(out.status, 0, out.stderr);
  const files = fs.readdirSync(dir);
  assert.equal(files.length, 1);
  assert.match(files[0], /^portal-.*\.db$/);
  const db = new DatabaseSync(path.join(dir, files[0]), { readOnly: true });
  assert.ok(db.prepare('SELECT COUNT(*) n FROM users').get().n > 0);
  db.close();
  assert.ok(fs.readdirSync(path.join(S.dataDir, 'vault', 'backups')).some((f) => f.startsWith('vault-')));
});

test('production mode refuses to start with unsafe configuration', () => {
  const out = spawnSync(process.execPath, ['--no-warnings', 'server/index.js'], { cwd: ROOT, env: { ...S.env, NODE_ENV: 'production', PORT: '0', DATA_DIR: path.join(S.dataDir, 'prod') }, encoding: 'utf8', timeout: 20000 });
  assert.equal(out.status, 78);
  assert.match(out.stderr, /COOKIE_SECURE/);
  assert.match(out.stderr, /SEED_DEMO=0/);
});
