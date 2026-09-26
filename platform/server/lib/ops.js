// Operational concerns shared by the Portal (and reused by Vault): structured
// logs, request ids + access log, rate limiting, config validation and
// scheduled SQLite backups. No request/response bodies are ever logged.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

// ---------------- structured logging ----------------
// LOG_FORMAT=json turns every console.* line into one JSON object per line
// (for log shippers); the default stays human-readable for development.
export function setupLogging(service) {
  if (process.env.LOG_FORMAT !== 'json') return;
  const emit = (level, orig) => (...args) => {
    const err = args.find((a) => a instanceof Error);
    const msg = args.map((a) => (a instanceof Error ? a.message : typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
    orig(JSON.stringify({ t: new Date().toISOString(), level, service, msg, ...(err?.stack ? { stack: err.stack } : {}) }));
  };
  const out = console.log.bind(console); const errOut = console.error.bind(console);
  console.log = emit('info', out); console.info = emit('info', out);
  console.warn = emit('warn', errOut); console.error = emit('error', errOut);
}
export function log(service, level, msg, fields = {}) {
  const line = process.env.LOG_FORMAT === 'json'
    ? JSON.stringify({ t: new Date().toISOString(), level, service, msg, ...fields })
    : `[${service}] ${msg} ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`;
  (level === 'error' || level === 'warn' ? process.stderr : process.stdout).write(line + '\n');
}

// Request id (echoed as X-Request-Id) + one access-log line per request.
// Logged: method, path (no query string: it may carry tokens), status, duration,
// user id. ACCESS_LOG=0 disables it.
export function requestLogger(service, userOf = () => null) {
  const on = process.env.ACCESS_LOG !== '0' && (process.env.ACCESS_LOG === '1' || process.env.NODE_ENV === 'production' || process.env.LOG_FORMAT === 'json');
  return (req, res, next) => {
    const incoming = String(req.headers['x-request-id'] || '');
    req.id = /^[A-Za-z0-9._-]{8,64}$/.test(incoming) ? incoming : crypto.randomUUID();
    res.setHeader('X-Request-Id', req.id);
    if (!on) return next();
    const t0 = process.hrtime.bigint();
    res.on('finish', () => {
      const ms = Number(process.hrtime.bigint() - t0) / 1e6;
      if (req.path.endsWith('/health') || req.path === '/api/stream') return;
      log(service, res.statusCode >= 500 ? 'error' : 'info', 'request', { id: req.id, method: req.method, path: req.path, status: res.statusCode, ms: Math.round(ms), user: userOf(req) || undefined });
    });
    next();
  };
}

// ---------------- rate limiting (fixed window, in memory, per key) ----------------
// Single-node limiter; behind several replicas use the reverse proxy's limiter too.
export function rateLimit({ windowMs = 60_000, max, key = (req) => req.ip, name = 'default' }) {
  const hits = new Map();
  setInterval(() => { const t = Date.now(); for (const [k, v] of hits) if (t - v.start > windowMs) hits.delete(k); }, windowMs).unref();
  return (req, res, next) => {
    if (!max || process.env.RATE_LIMIT === '0') return next();
    const k = `${name}:${key(req)}`; const t = Date.now();
    let h = hits.get(k);
    if (!h || t - h.start > windowMs) { h = { start: t, n: 0 }; hits.set(k, h); }
    h.n++;
    res.setHeader('RateLimit-Limit', String(max));
    res.setHeader('RateLimit-Remaining', String(Math.max(0, max - h.n)));
    if (h.n > max) {
      const retry = Math.ceil((h.start + windowMs - t) / 1000);
      res.setHeader('Retry-After', String(retry));
      return res.status(429).json({ error: 'rate_limited', message: `طلبات كثيرة خلال وقت قصير. حاول بعد ${retry} ثانية.`, retry_after: retry });
    }
    next();
  };
}

// ---------------- configuration validation ----------------
// In production, refuse to start with settings that would be unsafe; in
// development, only warn. Returns the list of problems found.
export function validateConfig(service, checks) {
  const prod = process.env.NODE_ENV === 'production';
  const problems = checks.filter((c) => !c.ok);
  for (const p of problems) log(service, prod && p.fatal ? 'error' : 'warn', `config: ${p.msg}`);
  if (prod && problems.some((p) => p.fatal)) {
    log(service, 'error', 'refusing to start in production with unsafe configuration (see messages above)');
    process.exit(78); // EX_CONFIG
  }
  return problems;
}

// ---------------- backups ----------------
// Consistent online snapshot of a live SQLite database (WAL-safe) via VACUUM INTO,
// with retention. Returns the file written.
export function backupSqlite(db, dir, prefix, keep = Number(process.env.BACKUP_KEEP || 14)) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const file = path.join(dir, `${prefix}-${stamp}.db`);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  fs.chmodSync(file, 0o600);
  const old = fs.readdirSync(dir).filter((f) => f.startsWith(`${prefix}-`) && f.endsWith('.db')).sort();
  for (const f of old.slice(0, Math.max(0, old.length - keep))) fs.rmSync(path.join(dir, f), { force: true });
  return file;
}
export function scheduleBackups(service, db, dir, prefix) {
  const hours = Number(process.env.BACKUP_INTERVAL_HOURS || 0);
  if (!hours) return null;
  const tick = () => {
    try { const f = backupSqlite(db, dir, prefix); log(service, 'info', 'backup written', { file: path.basename(f) }); }
    catch (e) { log(service, 'error', 'backup failed', { error: e.message }); }
  };
  const t = setInterval(tick, hours * 3600e3); t.unref();
  return t;
}
