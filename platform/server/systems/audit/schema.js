// Internal Audit — tables (all prefixed audit_). Idempotent.
import { db, all } from '../kit.js';

export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS audit_plans (
  id TEXT PRIMARY KEY, year INTEGER NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','approved')),
  notes TEXT NOT NULL DEFAULT '', submitted_by TEXT, submitted_at TEXT, approved_by TEXT, approved_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_universe (
  id TEXT PRIMARY KEY, name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
  department_id TEXT NOT NULL REFERENCES departments(id),
  likelihood INTEGER NOT NULL CHECK (likelihood BETWEEN 1 AND 5),
  impact INTEGER NOT NULL CHECK (impact BETWEEN 1 AND 5),
  rationale TEXT NOT NULL DEFAULT '', last_audit_year INTEGER, active INTEGER NOT NULL DEFAULT 1,
  is_demo INTEGER NOT NULL DEFAULT 0, updated_by TEXT, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_engagements (
  id TEXT PRIMARY KEY, plan_year INTEGER NOT NULL, universe_id TEXT REFERENCES audit_universe(id),
  title TEXT NOT NULL, department_id TEXT NOT NULL REFERENCES departments(id),
  scope TEXT NOT NULL DEFAULT '', objectives TEXT NOT NULL DEFAULT '',
  quarter INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  phase TEXT NOT NULL DEFAULT 'planned' CHECK (phase IN ('planned','planning','fieldwork','reporting','follow_up','closed')),
  lead_id TEXT REFERENCES users(id), start_date TEXT, end_date TEXT,
  exec_summary TEXT NOT NULL DEFAULT '', report_doc_id TEXT, report_issued_by TEXT, report_issued_at TEXT,
  started_at TEXT, closed_at TEXT, added_after_approval INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_eng_dept ON audit_engagements(department_id, phase);
CREATE TABLE IF NOT EXISTS audit_team (
  engagement_id TEXT NOT NULL REFERENCES audit_engagements(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), PRIMARY KEY (engagement_id, user_id)
);
CREATE TABLE IF NOT EXISTS audit_requests (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES audit_engagements(id),
  department_id TEXT NOT NULL, to_user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','responded','returned','accepted')),
  response_text TEXT, responded_by TEXT, responded_at TEXT,
  review_note TEXT, reviewed_by TEXT, reviewed_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_by TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_req_to ON audit_requests(to_user_id, status);
CREATE TABLE IF NOT EXISTS audit_workpapers (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES audit_engagements(id),
  ref TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
  procedure TEXT NOT NULL DEFAULT '', evidence TEXT NOT NULL DEFAULT '', conclusion TEXT NOT NULL DEFAULT '',
  result TEXT NOT NULL DEFAULT 'pending' CHECK (result IN ('pending','satisfactory','exception')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','reviewed')),
  prepared_by TEXT NOT NULL, reviewed_by TEXT, reviewed_at TEXT, review_note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE TABLE IF NOT EXISTS audit_findings (
  id TEXT PRIMARY KEY, engagement_id TEXT NOT NULL REFERENCES audit_engagements(id),
  department_id TEXT NOT NULL, ref TEXT NOT NULL DEFAULT '', title TEXT NOT NULL,
  criteria TEXT NOT NULL DEFAULT '', condition TEXT NOT NULL DEFAULT '', cause TEXT NOT NULL DEFAULT '', effect TEXT NOT NULL DEFAULT '',
  risk TEXT NOT NULL CHECK (risk IN ('high','medium','low')), recommendation TEXT NOT NULL DEFAULT '',
  workpaper_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','issued','in_follow_up','implemented','closed')),
  raised_by TEXT NOT NULL, issued_by TEXT, issued_at TEXT,
  position TEXT CHECK (position IS NULL OR position IN ('agree','partial')),
  response_text TEXT, response_by TEXT, response_at TEXT,
  closed_by TEXT, closed_at TEXT, withdrawn_at TEXT, withdrawn_by TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_find_dept ON audit_findings(department_id, status);
CREATE TABLE IF NOT EXISTS audit_actions (
  id TEXT PRIMARY KEY, finding_id TEXT NOT NULL UNIQUE REFERENCES audit_findings(id),
  description TEXT NOT NULL, owner_id TEXT NOT NULL REFERENCES users(id), due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','in_progress','implemented','closed')),
  implemented_at TEXT, closed_at TEXT, returned_count INTEGER NOT NULL DEFAULT 0,
  created_by TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_act_owner ON audit_actions(owner_id, status);
CREATE TABLE IF NOT EXISTS audit_updates (
  id TEXT PRIMARY KEY, finding_id TEXT NOT NULL REFERENCES audit_findings(id), user_id TEXT NOT NULL,
  kind TEXT NOT NULL, note TEXT NOT NULL DEFAULT '', internal INTEGER NOT NULL DEFAULT 0,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_upd ON audit_updates(finding_id, created_at);
CREATE TABLE IF NOT EXISTS audit_ext_requests (
  id TEXT PRIMARY KEY, requester_id TEXT NOT NULL REFERENCES users(id), org_id TEXT NOT NULL,
  title TEXT NOT NULL, details TEXT NOT NULL DEFAULT '', due_date TEXT,
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','assigned','prepared','released')),
  assigned_to TEXT, assigned_by TEXT, assigned_at TEXT, internal_note TEXT, return_note TEXT,
  response_text TEXT, prepared_by TEXT, prepared_at TEXT,
  released_text TEXT, released_by TEXT, released_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_audit_ext_req ON audit_ext_requests(requester_id, status);
CREATE TABLE IF NOT EXISTS audit_links (
  id TEXT PRIMARY KEY, kind TEXT NOT NULL CHECK (kind IN ('pbc','ext','action')), ref_id TEXT NOT NULL,
  document_id TEXT NOT NULL, title TEXT NOT NULL, linked_by TEXT NOT NULL, linked_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_audit_links ON audit_links(kind, ref_id);
`);
  // Snapshot of a document as released to the external auditor (added later; idempotent).
  const cols = new Set(all('PRAGMA table_info(audit_links)').map((c) => c.name));
  if (!cols.has('released_html')) db.exec('ALTER TABLE audit_links ADD COLUMN released_html TEXT');
  if (!cols.has('released_title')) db.exec('ALTER TABLE audit_links ADD COLUMN released_title TEXT');
}
