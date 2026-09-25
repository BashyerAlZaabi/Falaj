// Conflicts & Gifts — schema, vocabulary and the gift policy engine.
// Everything in this system is RESTRICTED data (AI locked off): only the
// discloser and the compliance officer read records; managers receive the
// minimal mitigation instruction they must enforce; leadership sees aggregates.
import { db, one, all, run } from '../kit.js';

export const KEY = 'integrity';
export const MIN_GROUP = 3;          // aggregates hide groups smaller than this
export const PROMPT_DAYS = 5;        // gifts must be declared within 5 days of receipt
export const RECENT_DAYS = 30;       // "done" column of the officer board
export const GIFT_POINTS_PER_YEAR = 6; // anti-farming cap for gift points

const TS = "(strftime('%Y-%m-%dT%H:%M:%fZ','now'))";

export function schema() {
  db.exec(`
CREATE TABLE IF NOT EXISTS integrity_cycles (
  id TEXT PRIMARY KEY, year INTEGER NOT NULL UNIQUE,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, opens_on TEXT NOT NULL, due_on TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  last_reminder_at TEXT, created_by TEXT, closed_at TEXT, closed_by TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS integrity_declarations (
  id TEXT PRIMARY KEY, cycle_id TEXT NOT NULL REFERENCES integrity_cycles(id), user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','submitted','under_review','cleared','mitigation','closed')),
  no_conflict INTEGER, statement TEXT, attested_at TEXT, submitted_at TEXT, first_submitted_at TEXT, return_note TEXT,
  reviewer_id TEXT, review_started_at TEXT, decided_by TEXT, decided_at TEXT, outcome TEXT, decision_note TEXT, closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}, updated_at TEXT NOT NULL DEFAULT ${TS}, is_demo INTEGER NOT NULL DEFAULT 0,
  UNIQUE (cycle_id, user_id)
);
CREATE INDEX IF NOT EXISTS ix_integrity_decl_user ON integrity_declarations(user_id);
CREATE INDEX IF NOT EXISTS ix_integrity_decl_status ON integrity_declarations(status);
CREATE TABLE IF NOT EXISTS integrity_interests (
  id TEXT PRIMARY KEY, declaration_id TEXT NOT NULL REFERENCES integrity_declarations(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('financial','relative','outside_role','provider','other')),
  party_name TEXT NOT NULL, provider_id TEXT, details TEXT, sort INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_integrity_int_decl ON integrity_interests(declaration_id);
CREATE TABLE IF NOT EXISTS integrity_disclosures (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','under_review','cleared','mitigation','closed')),
  matter TEXT NOT NULL, related_party TEXT NOT NULL, provider_id TEXT, relationship TEXT, proposed_recusal TEXT,
  submitted_at TEXT NOT NULL, reviewer_id TEXT, review_started_at TEXT, decided_by TEXT, decided_at TEXT, outcome TEXT, decision_note TEXT, closed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_integrity_disc_user ON integrity_disclosures(user_id);
CREATE TABLE IF NOT EXISTS integrity_mitigations (
  id TEXT PRIMARY KEY, source_type TEXT NOT NULL CHECK (source_type IN ('declaration','disclosure')), source_id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  kind TEXT NOT NULL CHECK (kind IN ('recusal','divestment','reassignment','other')),
  matter TEXT NOT NULL, provider_id TEXT, instruction TEXT NOT NULL, manager_visible INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','lifted')),
  created_by TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT ${TS},
  manager_seen_at TEXT, acknowledged_by TEXT, acknowledged_at TEXT, lifted_by TEXT, lifted_at TEXT, lift_note TEXT,
  is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_integrity_mit_user ON integrity_mitigations(user_id, status);
CREATE INDEX IF NOT EXISTS ix_integrity_mit_src ON integrity_mitigations(source_type, source_id);
CREATE TABLE IF NOT EXISTS integrity_gifts (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id),
  giver_name TEXT NOT NULL, giver_type TEXT NOT NULL CHECK (giver_type IN ('organisation','person')), provider_id TEXT,
  description TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'gift' CHECK (kind IN ('gift','hospitality')),
  value_aed REAL NOT NULL, occasion TEXT, received_on TEXT NOT NULL,
  offered_only INTEGER NOT NULL DEFAULT 0, cash INTEGER NOT NULL DEFAULT 0, active_tender INTEGER NOT NULL DEFAULT 0,
  proposal TEXT NOT NULL, proposal_rule TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'declared' CHECK (status IN ('declared','decided','completed')),
  decision TEXT CHECK (decision IS NULL OR decision IN ('keep','handover','decline_return','donate')),
  decided_by TEXT, decided_at TEXT, decision_note TEXT, completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT ${TS}, is_demo INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_integrity_gift_user ON integrity_gifts(user_id);
CREATE INDEX IF NOT EXISTS ix_integrity_gift_status ON integrity_gifts(status);
CREATE TABLE IF NOT EXISTS integrity_events (
  id TEXT PRIMARY KEY, ref_type TEXT NOT NULL, ref_id TEXT NOT NULL, actor_id TEXT, action TEXT NOT NULL, note TEXT,
  at TEXT NOT NULL DEFAULT ${TS}
);
CREATE INDEX IF NOT EXISTS ix_integrity_events_ref ON integrity_events(ref_type, ref_id);
CREATE TABLE IF NOT EXISTS integrity_policy_rules (
  key TEXT PRIMARY KEY, sort INTEGER NOT NULL, outcome TEXT, threshold REAL, icon TEXT,
  title_ar TEXT NOT NULL, title_en TEXT NOT NULL, body_ar TEXT NOT NULL, body_en TEXT NOT NULL
);`);
  // The published gift & hospitality policy is configuration, not demo data:
  // it exists in every installation (existing rows are never overwritten).
  const rule = (key, sort, outcome, threshold, icon, tar, ten, bar, ben) => run(
    'INSERT OR IGNORE INTO integrity_policy_rules (key,sort,outcome,threshold,icon,title_ar,title_en,body_ar,body_en) VALUES (?,?,?,?,?,?,?,?,?)',
    key, sort, outcome, threshold, icon, tar, ten, bar, ben);
  rule('token', 1, 'keep', 200, 'gift', 'الهدايا الرمزية', 'Token gifts',
    'الهدية التي لا تتجاوز قيمتها التقديرية 200 درهم يجوز الاحتفاظ بها بعد الإفصاح عنها.',
    'A gift with an estimated value of up to AED 200 may be kept once it has been declared.');
  rule('over_limit', 2, 'handover', 200, 'handCoins', 'ما يتجاوز 200 درهم', 'Above AED 200',
    'تُسلَّم الهدية إلى الجهة أو يُعتذر عنها بلباقة وتُعاد؛ ويُعتذر عن الضيافة التي تتجاوز الحد.',
    'The gift is handed over to the entity or politely declined and returned; hospitality above the limit is declined.');
  rule('tender', 3, 'decline_return', null, 'ban', 'مقدّم خدمة لديه مناقصة قائمة', 'Provider with an active tender',
    'تُرفض دائماً مهما كانت قيمتها، وتُعاد مع خطاب اعتذار يحفظ العلاقة المهنية.',
    'Always declined whatever the value, and returned with a courteous letter.');
  rule('cash', 4, 'decline_return', null, 'banknote', 'النقد وما في حكمه', 'Cash and equivalents',
    'لا يُقبل النقد أو بطاقات الهدايا أو القسائم الشرائية مطلقاً.',
    'Cash, gift cards and vouchers are never accepted.');
  rule('deadline', 5, null, PROMPT_DAYS, 'calendarClock', 'مهلة الإفصاح', 'Declaration window',
    'أفصح عن كل هدية أو ضيافة تُقدَّم لك خلال 5 أيام من استلامها أو عرضها — حتى لو اعتذرت عنها.',
    'Declare every gift or hospitality offered to you within 5 days of receipt or offer — even if you declined it.');
}

// ---------------- vocabulary ----------------
export const DECL_STATUS = {
  draft: ['مسودة', 'Draft'], submitted: ['مُقدَّم', 'Submitted'], under_review: ['قيد المراجعة', 'Under review'],
  cleared: ['مُعتمد — لا يلزم إجراء', 'Cleared'], mitigation: ['مُعتمد مع تعليمات', 'Mitigation required'], closed: ['مغلق', 'Closed'],
};
export const GIFT_STATUS = { declared: ['بانتظار القرار', 'Awaiting decision'], decided: ['بانتظار التنفيذ', 'Awaiting action'], completed: ['مكتمل', 'Completed'] };
export const INTEREST_KINDS = ['financial', 'relative', 'outside_role', 'provider', 'other'];
export const MITIGATION_KINDS = ['recusal', 'divestment', 'reassignment', 'other'];
export const MITIGATION_LABEL = { recusal: 'تنحٍّ', divestment: 'تخارج من المصلحة', reassignment: 'إعادة توزيع مهام', other: 'إجراء آخر' };
export const DECISIONS = ['keep', 'handover', 'decline_return', 'donate'];
export const DECISION_LABEL = {
  keep: ['الاحتفاظ بها', 'Keep'], handover: ['تسليمها للجهة', 'Hand over to the entity'],
  decline_return: ['الاعتذار عنها وإعادتها', 'Decline and return'], donate: ['التبرع بها', 'Donate'],
};
// Final decisions the officer may record for each policy rule (the policy can be
// applied more strictly than proposed, never more leniently).
export const ALLOWED_DECISIONS = {
  token: ['keep', 'handover', 'donate', 'decline_return'],
  over_limit: ['handover', 'donate', 'decline_return'],
  tender: ['decline_return'],
  cash: ['decline_return'],
};

// ---------------- gift policy engine ----------------
export const policyRules = () => all('SELECT key,sort,outcome,threshold,icon,title_ar,title_en,body_ar,body_en FROM integrity_policy_rules ORDER BY sort');
export const tokenLimit = () => one("SELECT threshold FROM integrity_policy_rules WHERE key='token'")?.threshold ?? 200;

// Deterministic, transparent proposal (the compliance officer records the final decision).
export function propose({ value_aed, cash, active_tender, kind }) {
  const limit = tokenLimit();
  const v = Number(value_aed) || 0;
  let decision; let rule;
  if (cash) { decision = 'decline_return'; rule = 'cash'; }
  else if (active_tender) { decision = 'decline_return'; rule = 'tender'; }
  else if (v <= limit) { decision = 'keep'; rule = 'token'; }
  else { decision = kind === 'hospitality' ? 'decline_return' : 'handover'; rule = 'over_limit'; }
  return { decision, rule, limit, ...explain(rule, decision, v, limit, kind) };
}
function explain(rule, decision, v, limit, kind) {
  const hosp = kind === 'hospitality';
  switch (rule) {
    case 'cash': return { reason_ar: 'النقد وبطاقات الهدايا والقسائم لا تُقبل مطلقاً مهما كانت قيمتها.', reason_en: 'Cash, gift cards and vouchers are never accepted, whatever the value.' };
    case 'tender': return { reason_ar: 'الجهة المانحة مقدّم خدمة لديه مناقصة أو طلب عروض قائم، لذا يُعتذر عن الهدية وتُعاد دائماً.', reason_en: 'The giver is a provider with an active tender or RFQ, so the gift is always declined and returned.' };
    case 'token': return { reason_ar: `القيمة التقديرية ضمن حد الهدايا الرمزية (${limit} درهم)؛ يجوز الاحتفاظ بها بعد الإفصاح.`, reason_en: `The estimated value is within the token-gift limit (AED ${limit}); it may be kept once declared.` };
    default: return hosp
      ? { reason_ar: `ضيافة تتجاوز ${limit} درهم؛ يُعتذر عنها بلباقة.`, reason_en: `Hospitality above AED ${limit} is politely declined.` }
      : { reason_ar: `القيمة تتجاوز ${limit} درهم؛ تُسلَّم الهدية إلى الجهة أو يُعتذر عنها وتُعاد.`, reason_en: `The value exceeds AED ${limit}; hand the gift over to the entity or decline and return it.` };
  }
}
