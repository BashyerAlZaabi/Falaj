// Versioned, forward-only schema migrations for the Portal database.
//
// db.js creates the baseline schema idempotently (CREATE … IF NOT EXISTS) and
// each system creates its own tables at start-up. Changes that are not purely
// additive — data backfills, new indexes on large tables, renames — go here as
// numbered steps. Each step runs once, inside a transaction, and is recorded in
// schema_migrations. Never edit a step that has shipped; add a new one.
import { db, all, run, tx } from './db.js';

export const MIGRATIONS = [
  { version: 1, name: 'baseline', up() { /* schema created by db.js */ } },
  { version: 2, name: 'operational indexes', up() {
    db.exec(`CREATE INDEX IF NOT EXISTS idx_alerts_user ON alerts(user_id, read_at, created_at);
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id, expires_at);
      CREATE INDEX IF NOT EXISTS idx_audit_created ON audit(created_at);
      CREATE INDEX IF NOT EXISTS idx_ai_usage_created ON ai_usage(created_at);
      CREATE INDEX IF NOT EXISTS ix_access_log_user ON access_log(user_id, at);`);
  } },
  { version: 3, name: 'purge expired sessions', up() {
    run("DELETE FROM sessions WHERE expires_at < datetime('now', '-30 days')");
  } },
];

export function migrate({ log = () => {} } = {}) {
  db.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  const done = new Set(all('SELECT version FROM schema_migrations').map((r) => r.version));
  const applied = [];
  for (const m of MIGRATIONS) {
    if (done.has(m.version)) continue;
    tx(() => { m.up(); run('INSERT INTO schema_migrations (version,name) VALUES (?,?)', m.version, m.name); });
    applied.push(m.version); log(`migration ${m.version} applied: ${m.name}`);
  }
  return { current: Math.max(0, ...MIGRATIONS.map((m) => m.version)), applied };
}
export const schemaVersion = () => all('SELECT MAX(version) v FROM schema_migrations')[0]?.v ?? 0;

// CLI: `npm run migrate`
if (process.argv[1]?.endsWith('migrations.js')) console.log(JSON.stringify(migrate({ log: console.log })));
