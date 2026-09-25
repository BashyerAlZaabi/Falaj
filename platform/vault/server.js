// VAULT — isolated service hosting FS and Marsad.
//  * Own process, own origin, own database & logs (never shared with the portal).
//  * Inbound-only ingest:  Wajib -> FS,  Wajib -> Marsad,  Smart Uploader -> Marsad.
//    Ingest endpoints return an opaque receipt only — never content.
//  * Reads are only possible through Vault's own UI, on Vault's origin, for users
//    signed in via SSO assertion (identity flows in; data never flows out).
//  * AI processing happens inside Vault (local summariser / internal model only).
//    The egress guard blocks every outbound connection except allow-listed internal hosts.
import { installEgressGuard } from './egress-guard.js';
import express from 'express';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envFile = path.join(ROOT, '.env');
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, 'utf8').split('\n')) {
  const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
}

const cfg = {
  port: Number(process.env.VAULT_PORT || 4100),
  publicUrl: process.env.VAULT_PUBLIC_URL || `http://localhost:${process.env.VAULT_PORT || 4100}`,
  dataDir: process.env.VAULT_DATA_DIR || path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'vault'),
  identityUrl: process.env.IDENTITY_URL || process.env.PUBLIC_URL || 'http://localhost:4000',
  identityPublicKey: process.env.IDENTITY_PUBLIC_KEY_PATH || path.join(process.env.DATA_DIR || path.join(ROOT, 'data'), 'identity-keys', 'identity-ed25519.pub.pem'),
  tokens: { wajibFs: process.env.WAJIB_FS_TOKEN || '', wajibMarsad: process.env.WAJIB_MARSAD_TOKEN || '', su: process.env.SU_SERVICE_TOKEN || '' },
  internalModelUrl: process.env.VAULT_AI_URL || '', // e.g. http://127.0.0.1:11434 (inside Vault)
  egressAllow: (process.env.VAULT_EGRESS_ALLOW || '').split(',').filter(Boolean),
};
if (cfg.internalModelUrl) cfg.egressAllow.push(new URL(cfg.internalModelUrl).hostname);
export const egress = installEgressGuard(cfg.egressAllow);

fs.mkdirSync(cfg.dataDir, { recursive: true });
export const vdb = new DatabaseSync(path.join(cfg.dataDir, 'vault.db'));
vdb.exec(`PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS fs_records (id TEXT PRIMARY KEY, source TEXT NOT NULL, department_id TEXT, kind TEXT, title TEXT, amount REAL, currency TEXT, period TEXT, payload TEXT, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS marsad_items (id TEXT PRIMARY KEY, source TEXT NOT NULL, department_id TEXT, uploader_id TEXT, title TEXT, filename TEXT, mime TEXT, size INTEGER, content BLOB, text TEXT, received_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ai_outputs (id TEXT PRIMARY KEY, user_id TEXT, target TEXT, method TEXT, output TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions (id TEXT PRIMARY KEY, user TEXT NOT NULL, expires_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS used_assertions (jti TEXT PRIMARY KEY, exp INTEGER);
CREATE TABLE IF NOT EXISTS audit (id TEXT PRIMARY KEY, actor TEXT, action TEXT, target TEXT, at TEXT NOT NULL);`);

const uid = (p) => p + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
const now = () => new Date().toISOString();
const audit = (actor, action, target) => vdb.prepare('INSERT INTO audit (id,actor,action,target,at) VALUES (?,?,?,?,?)').run(uid('va_'), actor, action, target, now());

export const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  // No CORS headers are ever emitted: browsers on other origins (portal, ADAA I) cannot read responses.
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; font-src 'self'; frame-ancestors 'none'; form-action 'self'; base-uri 'none'");
  if (req.method === 'OPTIONS') return res.status(403).end();
  next();
});

app.get('/health', (req, res) => res.json({ status: 'ok', local_ai: cfg.internalModelUrl ? 'internal-model' : 'extractive' }));

// ---------------- inbound-only ingest ----------------
const safeEq = (a, b) => a && b && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
function service(tokenKey) {
  return (req, res, next) => {
    const t = (req.headers.authorization || '').replace(/^Bearer /, '');
    if (!cfg.tokens[tokenKey]) return res.status(503).json({ error: 'not_configured' });
    if (!safeEq(t, cfg.tokens[tokenKey])) return res.status(401).json({ error: 'unauthorized' });
    next();
  };
}
// Service credentials can never read: any non-POST on /ingest is refused.
app.all('/ingest/*path', (req, res, next) => (req.method === 'POST' ? next() : res.status(405).json({ error: 'write_only' })));

app.post('/ingest/wajib/fs', service('wajibFs'), express.json({ limit: '2mb' }), (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const receipt = uid('rc_');
  const ins = vdb.prepare('INSERT INTO fs_records (id,source,department_id,kind,title,amount,currency,period,payload,received_at) VALUES (?,?,?,?,?,?,?,?,?,?)');
  for (const r of items) ins.run(uid('fs_'), 'wajib', r.department_id || null, String(r.kind || 'record').slice(0, 40), String(r.title || '').slice(0, 300), Number.isFinite(+r.amount) ? +r.amount : null, r.currency || 'AED', r.period || null, JSON.stringify(r).slice(0, 100000), now());
  audit('svc:wajib', 'ingest.fs', `${items.length} records`);
  res.status(202).json({ receipt, accepted: items.length });
});
app.post('/ingest/wajib/marsad', service('wajibMarsad'), express.json({ limit: '2mb' }), (req, res) => {
  const items = Array.isArray(req.body) ? req.body : [req.body];
  const receipt = uid('rc_');
  const ins = vdb.prepare('INSERT INTO marsad_items (id,source,department_id,title,text,size,received_at) VALUES (?,?,?,?,?,?,?)');
  for (const r of items) { const text = String(r.text || r.body || ''); ins.run(uid('ms_'), 'wajib', r.department_id || null, String(r.title || '').slice(0, 300), text.slice(0, 500000), text.length, now()); }
  audit('svc:wajib', 'ingest.marsad', `${items.length} items`);
  res.status(202).json({ receipt, accepted: items.length });
});
app.post('/ingest/su/marsad', service('su'), express.raw({ type: '*/*', limit: '25mb' }), (req, res) => {
  const buf = req.body;
  if (!Buffer.isBuffer(buf) || !buf.length) return res.status(400).json({ error: 'empty' });
  const filename = decodeURIComponent(String(req.headers['x-filename'] || 'upload.bin')).slice(0, 200);
  const text = /\.(txt|md|csv|json|log)$/i.test(filename) ? buf.toString('utf8').slice(0, 500000) : null;
  const id = uid('ms_');
  vdb.prepare('INSERT INTO marsad_items (id,source,department_id,uploader_id,title,filename,mime,size,content,text,received_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)')
    .run(id, 'smart_uploader', String(req.headers['x-department'] || '') || null, String(req.headers['x-uploader'] || '') || null, filename, filename, req.headers['content-type'] || null, buf.length, buf, text, now());
  audit('svc:smart_uploader', 'ingest.marsad', id);
  res.status(202).json({ receipt: uid('rc_') });
});

// ---------------- SSO (identity in) ----------------
function verifyAssertion(token) {
  const [body, sig] = String(token || '').split('.');
  if (!body || !sig) return null;
  const key = crypto.createPublicKey(fs.readFileSync(cfg.identityPublicKey));
  if (!crypto.verify(null, Buffer.from(body), key, Buffer.from(sig, 'base64url'))) return null;
  const claims = JSON.parse(Buffer.from(body, 'base64url').toString());
  if (claims.aud !== 'vault' || claims.iss !== 'identity' || claims.exp < Date.now() / 1000) return null;
  try { vdb.prepare('INSERT INTO used_assertions (jti,exp) VALUES (?,?)').run(claims.jti, claims.exp); } catch { return null; } // replay
  return claims;
}
const cookie = (req) => (req.headers.cookie || '').match(/vault_session=([^;]+)/)?.[1];
function vaultUser(req) {
  const id = cookie(req);
  if (!id) return null;
  const s = vdb.prepare('SELECT user,expires_at FROM sessions WHERE id=?').get(crypto.createHash('sha256').update(id).digest('hex'));
  return s && s.expires_at > now() ? JSON.parse(s.user) : null;
}
app.get('/sso/start', (req, res) => {
  const state = crypto.randomBytes(12).toString('base64url');
  res.setHeader('Set-Cookie', `vault_state=${state}; Path=/sso; HttpOnly; SameSite=Lax; Max-Age=300`);
  const next = String(req.query.next || '/').startsWith('/') ? String(req.query.next || '/') : '/';
  res.redirect(`${cfg.identityUrl}/api/identity/sso/authorize?client=vault&state=${state}.${encodeURIComponent(next)}&redirect_uri=${encodeURIComponent(cfg.publicUrl + '/sso/callback')}`);
});
app.get('/sso/callback', (req, res) => {
  const claims = verifyAssertion(req.query.assertion);
  const expectedState = (req.headers.cookie || '').match(/vault_state=([^;]+)/)?.[1];
  const [state, nextEnc] = String(claims?.state || '').split('.');
  if (!claims || !expectedState || state !== expectedState) return res.status(401).send('SSO failed');
  const id = crypto.randomBytes(32).toString('base64url');
  const user = { id: claims.sub, name_ar: claims.name_ar, name_en: claims.name_en, role: claims.role, department_id: claims.department_id };
  vdb.prepare('INSERT INTO sessions (id,user,expires_at) VALUES (?,?,?)').run(crypto.createHash('sha256').update(id).digest('hex'), JSON.stringify(user), new Date(Date.now() + 8 * 3600e3).toISOString());
  audit(user.id, 'login', null);
  res.setHeader('Set-Cookie', `vault_session=${id}; Path=/; HttpOnly; SameSite=Lax; Max-Age=28800`);
  const next = decodeURIComponent(nextEnc || '/');
  res.redirect(next.startsWith('/') && !next.startsWith('//') ? next : '/');
});
// Logout invalidates the server-side session row, not only the cookie.
app.post('/logout', (req, res) => {
  const id = cookie(req);
  if (id) vdb.prepare('DELETE FROM sessions WHERE id=?').run(crypto.createHash('sha256').update(id).digest('hex'));
  res.setHeader('Set-Cookie', 'vault_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'); res.redirect('/');
});

function requireVaultUser(req, res, next) {
  const u = vaultUser(req);
  if (!u) return req.originalUrl.startsWith('/api/') ? res.status(401).json({ error: 'unauthenticated' }) : res.redirect(`/sso/start?next=${encodeURIComponent(req.originalUrl)}`);
  req.vuser = u; next();
}

// ---------------- Vault-internal scopes ----------------
// FS: members of the record's department, plus leadership.
// Marsad: managers see their department, leadership sees all, uploaders see their own uploads.
function fsScope(u) { return u.role === 'president' ? ['1=1', []] : ['department_id = ?', [u.department_id]]; }
function marsadScope(u) {
  if (u.role === 'president') return ['1=1', []];
  if (u.role === 'manager') return ['(department_id = ? OR uploader_id = ?)', [u.department_id, u.id]];
  return ['uploader_id = ?', [u.id]];
}

app.use('/api', requireVaultUser, express.json({ limit: '256kb' }));
app.use((req, res, next) => { // CSRF for vault API mutations
  if (req.path.startsWith('/api/') && req.method !== 'GET' && req.headers['x-requested-with'] !== 'vault') return res.status(403).json({ error: 'csrf' });
  next();
});
app.get('/api/me', (req, res) => res.json({ user: req.vuser, local_ai: cfg.internalModelUrl ? 'internal-model' : 'extractive', egress_allow: egress.allowed, portal_url: cfg.identityUrl }));
app.get('/api/fs', (req, res) => {
  const [w, p] = fsScope(req.vuser);
  res.json(vdb.prepare(`SELECT id,kind,title,amount,currency,period,department_id,received_at FROM fs_records WHERE ${w} ORDER BY received_at DESC LIMIT 200`).all(...p));
});
app.get('/api/marsad', (req, res) => {
  const [w, p] = marsadScope(req.vuser);
  res.json(vdb.prepare(`SELECT id,source,title,filename,size,department_id,received_at, text IS NOT NULL AS has_text FROM marsad_items WHERE ${w} ORDER BY received_at DESC LIMIT 200`).all(...p));
});
app.get('/api/marsad/:id', (req, res) => {
  const [w, p] = marsadScope(req.vuser);
  const r = vdb.prepare(`SELECT id,source,title,filename,size,text,received_at FROM marsad_items WHERE id=? AND ${w}`).get(req.params.id, ...p);
  if (!r) return res.status(404).json({ error: 'not_found' });
  audit(req.vuser.id, 'read.marsad', r.id);
  res.json(r);
});

// Vault-internal AI. Output stays in the Vault DB and is shown only in Vault UI.
async function vaultSummarize(text) {
  if (cfg.internalModelUrl) {
    try {
      const r = await fetch(`${cfg.internalModelUrl.replace(/\/$/, '')}/v1/chat/completions`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model: process.env.VAULT_AI_MODEL || 'local', messages: [{ role: 'system', content: 'لخّص في نقاط موجزة دون إضافة معلومات.' }, { role: 'user', content: text.slice(0, 20000) }] }) });
      const b = await r.json();
      const out = b.choices?.[0]?.message?.content;
      if (out) return { method: 'internal-model', points: out.split('\n').map((s) => s.replace(/^[-•*]\s*/, '').trim()).filter(Boolean) };
    } catch { /* fall back to extractive */ }
  }
  const sentences = text.replace(/\s+/g, ' ').split(/(?<=[.!؟?])\s+|\n+/).map((s) => s.trim()).filter((s) => s.length > 15);
  const freq = {};
  for (const w of text.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []) if (w.length > 3) freq[w] = (freq[w] || 0) + 1;
  const ranked = sentences.map((s, i) => ({ s, i, v: (s.toLowerCase().match(/[\p{L}\p{N}]+/gu) || []).reduce((a, w) => a + (freq[w] || 0), 0) / Math.sqrt(s.length) }));
  return { method: 'extractive', points: ranked.sort((a, b) => b.v - a.v).slice(0, 5).sort((a, b) => a.i - b.i).map((x) => x.s) };
}
app.post('/api/marsad/:id/summarize', async (req, res) => {
  const [w, p] = marsadScope(req.vuser);
  const r = vdb.prepare(`SELECT id,text FROM marsad_items WHERE id=? AND ${w}`).get(req.params.id, ...p);
  if (!r) return res.status(404).json({ error: 'not_found' });
  if (!r.text) return res.status(400).json({ error: 'no_text', message: 'لا يوجد نص قابل للتلخيص' });
  const out = await vaultSummarize(r.text);
  vdb.prepare('INSERT INTO ai_outputs (id,user_id,target,method,output,created_at) VALUES (?,?,?,?,?,?)').run(uid('ao_'), req.vuser.id, r.id, out.method, JSON.stringify(out.points), now());
  audit(req.vuser.id, 'ai.summarize', r.id);
  res.json(out);
});
app.get('/api/fs/summary', (req, res) => {
  const [w, p] = fsScope(req.vuser);
  res.json(vdb.prepare(`SELECT kind, COUNT(*) n, SUM(amount) total, currency FROM fs_records WHERE ${w} GROUP BY kind, currency`).all(...p));
});

// ---------------- Vault UI (same origin only) ----------------
app.use('/fonts', express.static(path.join(ROOT, 'node_modules/@fontsource/ibm-plex-sans-arabic/files'), { maxAge: '30d' }));
app.use('/fonts', express.static(path.join(ROOT, 'node_modules/@fontsource-variable/inter/files'), { maxAge: '30d' }));
const page = fs.readFileSync(path.join(ROOT, 'vault/web/index.html'), 'utf8');
app.get(['/', '/fs', '/marsad'], requireVaultUser, (req, res) => res.type('html').send(page));
app.use('/static', express.static(path.join(ROOT, 'vault/web')));

if (process.argv[1] && process.argv[1].endsWith(path.join('vault', 'server.js'))) {
  app.listen(cfg.port, () => console.log(`[vault] Vault (FS, Marsad) on ${cfg.publicUrl} — egress allow-list: [${egress.allowed.join(', ') || 'none'}]`));
}
