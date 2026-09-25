// Awards — database schema (idempotent). Every table is prefixed awards_.
//  programmes → categories, weighted criteria (descriptors per level)
//  nominations (+ team members) → committee reviews, declared recusals, lifecycle events
import { db } from '../kit.js';

export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS awards_programs (
  id TEXT PRIMARY KEY,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '',
  description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'excellence' CHECK (kind IN ('excellence','team','innovation','leadership')),
  cycle TEXT NOT NULL DEFAULT '',
  eligibility TEXT NOT NULL DEFAULT 'all_staff' CHECK (eligibility IN ('employees','managers','all_staff','team')),
  allow_self INTEGER NOT NULL DEFAULT 1,
  nomination_opens TEXT NOT NULL, nomination_closes TEXT NOT NULL, evaluation_closes TEXT NOT NULL, announce_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','nominations','evaluation','announced','cancelled')),
  decision_note TEXT, announced_at TEXT, announced_by TEXT,
  created_by TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS awards_categories (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES awards_programs(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  max_winners INTEGER NOT NULL DEFAULT 1, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_awards_categories_prog ON awards_categories(program_id);
CREATE TABLE IF NOT EXISTS awards_criteria (
  id TEXT PRIMARY KEY, program_id TEXT NOT NULL REFERENCES awards_programs(id) ON DELETE CASCADE,
  name_ar TEXT NOT NULL, name_en TEXT NOT NULL DEFAULT '', description_ar TEXT NOT NULL DEFAULT '', description_en TEXT NOT NULL DEFAULT '',
  weight INTEGER NOT NULL, descriptors TEXT NOT NULL DEFAULT '[]', sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_awards_criteria_prog ON awards_criteria(program_id);
CREATE TABLE IF NOT EXISTS awards_nominations (
  id TEXT PRIMARY KEY,
  program_id TEXT NOT NULL REFERENCES awards_programs(id), category_id TEXT NOT NULL REFERENCES awards_categories(id),
  nominee_id TEXT NOT NULL REFERENCES users(id), nominee_department_id TEXT NOT NULL,
  nominator_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('self','colleague','manager')),
  team_name TEXT,
  summary TEXT NOT NULL, justifications TEXT NOT NULL DEFAULT '{}', evidence TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL CHECK (status IN ('awaiting_consent','submitted','declined','withdrawn','lapsed','in_evaluation','winner','not_selected')),
  consent_at TEXT, consent_note TEXT, decline_reason TEXT, withdrawn_by TEXT,
  excellence TEXT, excellence_at TEXT,
  final_score REAL, final_rank INTEGER, citation_ar TEXT, citation_en TEXT, decided_at TEXT,
  created_at TEXT NOT NULL, updated_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_awards_nom_prog ON awards_nominations(program_id, status);
CREATE INDEX IF NOT EXISTS ix_awards_nom_nominator ON awards_nominations(nominator_id);
CREATE INDEX IF NOT EXISTS ix_awards_nom_nominee ON awards_nominations(nominee_id);
CREATE TABLE IF NOT EXISTS awards_team (
  nomination_id TEXT NOT NULL REFERENCES awards_nominations(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id), department_id TEXT NOT NULL,
  PRIMARY KEY (nomination_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_awards_team_user ON awards_team(user_id);
CREATE TABLE IF NOT EXISTS awards_reviews (
  id TEXT PRIMARY KEY,
  nomination_id TEXT NOT NULL REFERENCES awards_nominations(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES users(id),
  scores TEXT NOT NULL, weighted REAL NOT NULL, comment TEXT,
  submitted_at TEXT NOT NULL, updated_at TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (nomination_id, member_id)
);
CREATE TABLE IF NOT EXISTS awards_recusals (
  nomination_id TEXT NOT NULL REFERENCES awards_nominations(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES users(id), reason TEXT NOT NULL, at TEXT NOT NULL,
  PRIMARY KEY (nomination_id, member_id)
);
CREATE TABLE IF NOT EXISTS awards_events (
  id TEXT PRIMARY KEY, nomination_id TEXT NOT NULL REFERENCES awards_nominations(id) ON DELETE CASCADE,
  actor_id TEXT, action TEXT NOT NULL, at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_awards_events_nom ON awards_events(nomination_id);
`);
}
