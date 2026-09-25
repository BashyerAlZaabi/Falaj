// Identity: password auth, server-side sessions, API tokens (for MCP clients),
// and short-lived signed SSO assertions (Ed25519) consumed by Vault.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { db, one, run, uid, all } from './db.js';
import { config } from './config.js';

// ---------- passwords ----------
export function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(pw, salt, 64);
  return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}
export function verifyPassword(pw, stored) {
  const [alg, s, h] = String(stored).split('$');
  if (alg !== 'scrypt') return false;
  const hash = crypto.scryptSync(pw, Buffer.from(s, 'base64'), 64);
  const expected = Buffer.from(h, 'base64');
  return expected.length === hash.length && crypto.timingSafeEqual(expected, hash);
}

// ---------- signing keys (SSO) ----------
fs.mkdirSync(config.keysDir, { recursive: true });
const privPath = path.join(config.keysDir, 'identity-ed25519.pem');
const pubPath = path.join(config.keysDir, 'identity-ed25519.pub.pem');
if (!fs.existsSync(privPath)) {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519');
  fs.writeFileSync(privPath, privateKey.export({ type: 'pkcs8', format: 'pem' }), { mode: 0o600 });
  fs.writeFileSync(pubPath, publicKey.export({ type: 'spki', format: 'pem' }));
}
const privateKey = crypto.createPrivateKey(fs.readFileSync(privPath));
export const publicKeyPem = fs.readFileSync(pubPath, 'utf8');

const b64u = (b) => Buffer.from(b).toString('base64url');
export function signAssertion(claims, ttlSec = 60) {
  const payload = { ...claims, iss: 'identity', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + ttlSec, jti: crypto.randomUUID() };
  const body = b64u(JSON.stringify(payload));
  const sig = crypto.sign(null, Buffer.from(body), privateKey);
  return `${body}.${b64u(sig)}`;
}

// ---------- sessions ----------
export const SESSION_COOKIE = 'swp_session';
export function createSession(userId) {
  const id = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.sessionHours * 3600e3).toISOString();
  run('INSERT INTO sessions (id,user_id,expires_at) VALUES (?,?,?)', sha(id), userId, expires);
  return { id, expires };
}
export function revokeSession(rawId) { run('UPDATE sessions SET revoked=1 WHERE id=?', sha(rawId)); }
const sha = (s) => crypto.createHash('sha256').update(s).digest('hex');

export function createApiToken(userId, label) {
  const raw = 'swp_' + crypto.randomBytes(24).toString('base64url');
  run('INSERT INTO api_tokens (id,user_id,token_hash,label) VALUES (?,?,?,?)', uid('tk_'), userId, sha(raw), label || 'MCP');
  return raw;
}

const USER_COLS = 'u.id,u.username,u.name_ar,u.name_en,u.email,u.role,u.is_admin,u.department_id,u.title_ar,u.title_en,u.lang,u.is_demo,u.user_type';
// caps: fine-grained system capabilities (e.g. strategy.admin, audit.auditor),
// granted explicitly by a platform admin and audited. Roles stay coarse.
export function getUser(id) {
  const u = one(`SELECT ${USER_COLS}, d.name_ar AS dept_ar, d.name_en AS dept_en FROM users u JOIN departments d ON d.id=u.department_id WHERE u.id=? AND u.active=1`, id);
  if (u) u.caps = all('SELECT cap FROM user_caps WHERE user_id=? ORDER BY cap', id).map((r) => r.cap);
  return u;
}
export const isExternal = (user) => user?.user_type === 'external';

function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export function userFromRequest(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer swp_')) {
    const row = one('SELECT user_id FROM api_tokens WHERE token_hash=? AND revoked=0', sha(auth.slice(7)));
    return row ? getUser(row.user_id) : null;
  }
  const raw = parseCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!raw) return null;
  const s = one("SELECT user_id FROM sessions WHERE id=? AND revoked=0 AND expires_at > ?", sha(raw), new Date().toISOString());
  return s ? getUser(s.user_id) : null;
}

export function requireAuth(req, res, next) {
  const user = userFromRequest(req);
  if (!user) return res.status(401).json({ error: 'unauthenticated' });
  req.user = user;
  next();
}
export function requireAdmin(req, res, next) {
  if (!req.user?.is_admin || isExternal(req.user)) return res.status(403).json({ error: 'forbidden', message: 'تتطلب صلاحية مدير المنصة' });
  next();
}

export function login(username, password) {
  const u = one('SELECT id,password_hash FROM users WHERE username=? AND active=1', String(username || '').trim().toLowerCase());
  if (!u || !verifyPassword(String(password || ''), u.password_hash)) return null;
  return u.id;
}

export function cookieHeader(value, maxAgeSec) {
  return `${SESSION_COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${config.cookieSecure ? '; Secure' : ''}`;
}

export function departmentsTree() { return all('SELECT * FROM departments'); }
export { db };
