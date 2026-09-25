// Portal database (outside Vault). Vault has its own separate database in /vault.
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from './config.js';

fs.mkdirSync(path.dirname(config.dbPath), { recursive: true });

export const db = new DatabaseSync(config.dbPath);
db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');

db.exec(`
CREATE TABLE IF NOT EXISTS departments (
  id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  parent_id TEXT REFERENCES departments(id)
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL, email TEXT,
  role TEXT NOT NULL CHECK (role IN ('employee','manager','president')),
  is_admin INTEGER NOT NULL DEFAULT 0,
  department_id TEXT NOT NULL REFERENCES departments(id),
  title_ar TEXT, title_en TEXT, lang TEXT NOT NULL DEFAULT 'ar',
  is_demo INTEGER NOT NULL DEFAULT 0, active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), expires_at TEXT NOT NULL,
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT DEFAULT '',
  department_id TEXT NOT NULL REFERENCES departments(id),
  owner_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','on_hold','done','cancelled')),
  progress INTEGER CHECK (progress IS NULL OR (progress BETWEEN 0 AND 100)),
  progress_updated_at TEXT, progress_updated_by TEXT,
  start_date TEXT, due_date TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_members (
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (project_id, user_id)
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, description TEXT DEFAULT '',
  project_id TEXT REFERENCES projects(id),
  assignee_id TEXT NOT NULL REFERENCES users(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high','urgent')),
  due_date TEXT, completed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, deleted_at TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, title TEXT NOT NULL, starts_at TEXT NOT NULL, ends_at TEXT,
  location TEXT, owner_id TEXT NOT NULL REFERENCES users(id),
  project_id TEXT REFERENCES projects(id),
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS event_attendees (
  event_id TEXT NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  PRIMARY KEY (event_id, user_id)
);
CREATE TABLE IF NOT EXISTS alerts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','critical')),
  title TEXT NOT NULL, body TEXT DEFAULT '', entity TEXT, entity_id TEXT,
  read_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY, title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'note' CHECK (kind IN ('report','letter','plan','minutes','note','summary')),
  owner_id TEXT NOT NULL REFERENCES users(id),
  department_id TEXT NOT NULL REFERENCES departments(id),
  content_html TEXT NOT NULL DEFAULT '', sources TEXT NOT NULL DEFAULT '[]',
  current_version INTEGER NOT NULL DEFAULT 1, lang TEXT NOT NULL DEFAULT 'ar',
  deleted_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS document_versions (
  id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, title TEXT NOT NULL, content_html TEXT NOT NULL,
  author_id TEXT NOT NULL, reason TEXT NOT NULL DEFAULT 'edit',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (document_id, version)
);
CREATE TABLE IF NOT EXISTS document_shares (
  document_id TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  permission TEXT NOT NULL DEFAULT 'view' CHECK (permission IN ('view','edit')),
  PRIMARY KEY (document_id, user_id)
);
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '', context TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('user','assistant','system')),
  content TEXT NOT NULL, meta TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS dashboards (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  layout TEXT NOT NULL, version INTEGER NOT NULL DEFAULT 1,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS dashboard_versions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  version INTEGER NOT NULL, layout TEXT NOT NULL, reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS idempotency (
  user_id TEXT NOT NULL, key TEXT NOT NULL, status TEXT NOT NULL,
  response TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, key)
);
CREATE TABLE IF NOT EXISTS actions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT, request_id TEXT,
  tool TEXT NOT NULL, agent TEXT, input TEXT NOT NULL, result TEXT,
  undo TEXT, undone_at TEXT, status TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS confirmations (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, conversation_id TEXT,
  tool TEXT NOT NULL, agent TEXT, input TEXT NOT NULL, summary TEXT NOT NULL, reason TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending', expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS ai_providers (
  id TEXT PRIMARY KEY, name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('anthropic','openai_compatible','local')),
  base_url TEXT, model TEXT, api_key_env TEXT, enabled INTEGER NOT NULL DEFAULT 1,
  last_check_at TEXT, last_check_ok INTEGER, last_check_message TEXT
);
CREATE TABLE IF NOT EXISTS ai_routing (
  capability TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES ai_providers(id)
);
CREATE TABLE IF NOT EXISTS ai_usage (
  id TEXT PRIMARY KEY, user_id TEXT, capability TEXT, provider_id TEXT, model TEXT,
  input_tokens INTEGER DEFAULT 0, output_tokens INTEGER DEFAULT 0, ok INTEGER NOT NULL,
  error TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS agents (
  key TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ar TEXT, description_en TEXT,
  tools TEXT NOT NULL, allowed_roles TEXT NOT NULL, instructions TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS skills (
  key TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ar TEXT, description_en TEXT,
  inputs TEXT NOT NULL, outputs TEXT NOT NULL, invocation TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE IF NOT EXISTS apps (
  key TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  description_ar TEXT, description_en TEXT, icon TEXT NOT NULL,
  category TEXT NOT NULL, zone TEXT NOT NULL CHECK (zone IN ('portal','vault','external')),
  department_id TEXT, roles TEXT NOT NULL, route TEXT NOT NULL,
  integration_status TEXT NOT NULL DEFAULT 'built_in', sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime TEXT, size INTEGER NOT NULL, text_content TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS su_receipts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, vault_receipt TEXT, status TEXT NOT NULL,
  size INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS api_tokens (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash TEXT NOT NULL UNIQUE, label TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  revoked INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS audit (
  id TEXT PRIMARY KEY, user_id TEXT, action TEXT NOT NULL, target TEXT, detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS office_agents (
  id TEXT PRIMARY KEY, owner_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL, description TEXT, template TEXT NOT NULL, config TEXT NOT NULL DEFAULT '{}',
  schedule TEXT NOT NULL DEFAULT '{}', enabled INTEGER NOT NULL DEFAULT 1,
  next_run_at TEXT, last_run_at TEXT, deleted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS office_runs (
  id TEXT PRIMARY KEY, agent_id TEXT NOT NULL REFERENCES office_agents(id) ON DELETE CASCADE,
  owner_id TEXT NOT NULL, trigger TEXT NOT NULL, status TEXT NOT NULL,
  proposal TEXT NOT NULL DEFAULT '[]', summary TEXT, error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')), reviewed_at TEXT, completed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_office_due ON office_agents(enabled, next_run_at);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_projects_dept ON projects(department_id);
CREATE INDEX IF NOT EXISTS idx_messages_conv ON messages(conversation_id, created_at);
`);

export const uid = (prefix = '') => prefix + crypto.randomUUID().replace(/-/g, '').slice(0, 20);
export const now = () => new Date().toISOString();
export const today = () => new Date().toISOString().slice(0, 10);

export function one(sql, ...params) { return db.prepare(sql).get(...params) ?? null; }
export function all(sql, ...params) { return db.prepare(sql).all(...params); }
export function run(sql, ...params) { return db.prepare(sql).run(...params); }

// Nested-safe transaction helper using savepoints.
let depth = 0;
export function tx(fn) {
  const name = `sp${depth}`;
  db.exec(depth === 0 ? 'BEGIN IMMEDIATE' : `SAVEPOINT ${name}`);
  depth++;
  try {
    const out = fn();
    depth--;
    db.exec(depth === 0 ? 'COMMIT' : `RELEASE ${name}`);
    return out;
  } catch (e) {
    depth--;
    db.exec(depth === 0 ? 'ROLLBACK' : `ROLLBACK TO ${name}; RELEASE ${name}`);
    throw e;
  }
}

export const json = (s, fallback = null) => { try { return s ? JSON.parse(s) : fallback; } catch { return fallback; } };

export function audit(userId, action, target, detail) {
  run('INSERT INTO audit (id,user_id,action,target,detail) VALUES (?,?,?,?,?)',
    uid('au_'), userId ?? null, action, target ?? null, detail ? JSON.stringify(detail) : null);
}

// ---------------- additive migrations (idempotent) ----------------
export function ensureColumn(table, column, ddl) {
  if (!all(`PRAGMA table_info(${table})`).some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
// Staff vs external identities (external auditors, service providers). External
// users live in external organisations (departments.is_external = 1) and only
// ever reach the systems that expose an external portal.
ensureColumn('users', 'user_type', "user_type TEXT NOT NULL DEFAULT 'staff'");
ensureColumn('departments', 'is_external', 'is_external INTEGER NOT NULL DEFAULT 0');
ensureColumn('agents', 'system', 'system TEXT');
db.exec(`
CREATE TABLE IF NOT EXISTS user_caps (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, cap TEXT NOT NULL,
  granted_by TEXT, granted_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, cap)
);
CREATE TABLE IF NOT EXISTS data_domains (
  key TEXT PRIMARY KEY, system TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT NOT NULL,
  classification TEXT NOT NULL CHECK (classification IN ('internal','confidential','restricted')),
  ai_policy TEXT NOT NULL CHECK (ai_policy IN ('allowed','opt_in','off')),
  ai_locked INTEGER NOT NULL DEFAULT 0, note_ar TEXT, note_en TEXT, updated_by TEXT, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS user_system_prefs (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, system TEXT NOT NULL,
  pinned INTEGER, ai_enabled INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, system)
);
CREATE TABLE IF NOT EXISTS access_log (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, system TEXT NOT NULL, record_type TEXT NOT NULL,
  record_id TEXT NOT NULL, action TEXT NOT NULL DEFAULT 'view', at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_access_log_rec ON access_log(system, record_type, record_id);
`);

// ---------------- strategic portfolio execution (additive, idempotent) ----------------
// Projects may be designated strategic by the SPMO (strategy.admin): sponsor,
// budget (AED), a free reference to a strategy initiative, and a progress mode
// ('manual' keeps the null = "not reported" semantics; 'tasks' derives progress
// from task completion). People are allocated to projects as a % of their time
// (pending the person's line manager unless the proposer is that manager).
ensureColumn('projects', 'is_strategic', 'is_strategic INTEGER NOT NULL DEFAULT 0');
ensureColumn('projects', 'sponsor_id', 'sponsor_id TEXT');
ensureColumn('projects', 'budget', 'budget REAL');
ensureColumn('projects', 'initiative_ref', 'initiative_ref TEXT');
ensureColumn('projects', 'progress_mode', "progress_mode TEXT NOT NULL DEFAULT 'manual'");
// Who gave the task to its current assignee (created_by stays the creator).
ensureColumn('tasks', 'assigned_by', 'assigned_by TEXT');
ensureColumn('tasks', 'assigned_at', 'assigned_at TEXT');
db.exec(`
CREATE TABLE IF NOT EXISTS project_allocations (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, role_ar TEXT NOT NULL DEFAULT '',
  percent INTEGER NOT NULL CHECK (percent BETWEEN 5 AND 100), proposed_percent INTEGER,
  start_date TEXT NOT NULL, end_date TEXT NOT NULL, allocated_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending_manager' CHECK (status IN ('pending_manager','active','declined','ended')),
  decided_by TEXT, decided_at TEXT, note TEXT, decision_note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_alloc_user ON project_allocations(user_id, status);
CREATE INDEX IF NOT EXISTS ix_alloc_project ON project_allocations(project_id, status);
CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL, due_date TEXT NOT NULL, owner_id TEXT REFERENCES users(id), done_at TEXT,
  created_by TEXT, deleted_at TEXT, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_milestones_project ON project_milestones(project_id);
CREATE TABLE IF NOT EXISTS dashboard_migrations (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, key TEXT NOT NULL,
  applied_at TEXT NOT NULL DEFAULT (datetime('now')), PRIMARY KEY (user_id, key)
);
CREATE INDEX IF NOT EXISTS idx_projects_strategic ON projects(is_strategic);
`);
