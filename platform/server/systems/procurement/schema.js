// AI Procurement — tables, constants and shared helpers.
import { run, one, isStaff, hasCap } from '../kit.js';

export const SYS = 'procurement';
export const THRESHOLD = 50000; // AED: direct purchase below, RFQ at or above
export const CATEGORIES = {
  it: ['خدمات تقنية المعلومات', 'IT services'],
  supplies: ['التوريدات', 'Supplies'],
  consulting: ['الاستشارات', 'Consulting'],
  facilities: ['خدمات المرافق', 'Facilities'],
};
export const PR_STATUS = {
  draft: ['مسودة', 'Draft'],
  pending_manager: ['بانتظار اعتماد المدير', 'Awaiting manager'],
  pending_finance: ['بانتظار اعتماد المالية', 'Awaiting finance'],
  pending_procurement: ['لدى المشتريات', 'With procurement'],
  sourcing: ['قيد طرح العروض', 'Sourcing'],
  ordered: ['صدر أمر الشراء', 'PO issued'],
  rejected: ['مرفوض', 'Rejected'],
  cancelled: ['ملغى', 'Cancelled'],
};
export const PR_FLOW = {
  draft: ['pending_manager', 'cancelled'],
  pending_manager: ['pending_finance', 'rejected', 'draft', 'cancelled'],
  pending_finance: ['pending_procurement', 'rejected', 'draft', 'cancelled'],
  pending_procurement: ['sourcing', 'ordered', 'rejected', 'cancelled'],
  sourcing: ['ordered', 'pending_procurement'],
  ordered: [], rejected: [], cancelled: [],
};
export const RFQ_STATUS = {
  draft: ['مسودة', 'Draft'],
  open: ['مفتوح لاستقبال العروض', 'Open for bids'],
  closed: ['مغلق — بانتظار الفتح', 'Closed — awaiting opening'],
  opened: ['العروض مفتوحة — قيد التقييم', 'Bids opened — evaluating'],
  evaluated: ['اكتمل التقييم', 'Evaluation complete'],
  recommended: ['توصية بالترسية — بانتظار اللجنة', 'Award recommended — committee'],
  committee_approved: ['اعتمدته اللجنة — مراجعة قانونية', 'Committee approved — legal review'],
  legal_approved: ['اعتمدته الشؤون القانونية', 'Legal approved'],
  awarded: ['تمت الترسية وصدر أمر الشراء', 'Awarded — PO issued'],
  cancelled: ['ملغى', 'Cancelled'],
};
export const RFQ_FLOW = {
  draft: ['open', 'cancelled'],
  open: ['opened', 'cancelled'],
  opened: ['evaluated', 'cancelled'],
  evaluated: ['recommended', 'cancelled'],
  recommended: ['committee_approved', 'evaluated', 'cancelled'],
  committee_approved: ['legal_approved', 'evaluated', 'cancelled'],
  legal_approved: ['awarded', 'cancelled'],
  awarded: [], cancelled: [],
};
export const labelsAr = (map) => Object.fromEntries(Object.entries(map).map(([k, v]) => [k, v[0]]));
export const DEFAULT_CRITERIA = [
  { key: 'compliance', ar: 'المطابقة للمواصفات الفنية', en: 'Compliance with specification', weight: 40 },
  { key: 'experience', ar: 'الخبرة والمراجع السابقة', en: 'Experience and references', weight: 30 },
  { key: 'delivery', ar: 'خطة التنفيذ والتسليم والضمان', en: 'Delivery plan and warranty', weight: 30 },
];
export const DEFAULT_TECH_WEIGHT = 70; // financial = 100 − technical
export const DEFAULT_MIN_TECH = 60;    // technical pass mark (%)

export function schema() {
  run(`CREATE TABLE IF NOT EXISTS procurement_counters (key TEXT PRIMARY KEY, n INTEGER NOT NULL)`);
  run(`CREATE TABLE IF NOT EXISTS procurement_budget_lines (
    id TEXT PRIMARY KEY, department_id TEXT NOT NULL, code TEXT NOT NULL, name_ar TEXT NOT NULL, name_en TEXT,
    fiscal_year INTEGER NOT NULL, allocated REAL NOT NULL DEFAULT 0, committed REAL NOT NULL DEFAULT 0, spent REAL NOT NULL DEFAULT 0,
    updated_by TEXT, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0, UNIQUE (code, fiscal_year))`);
  run(`CREATE TABLE IF NOT EXISTS procurement_requests (
    id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, requester_id TEXT NOT NULL, department_id TEXT NOT NULL,
    title TEXT NOT NULL, category TEXT NOT NULL, justification TEXT NOT NULL, needed_by TEXT NOT NULL, budget_line_id TEXT NOT NULL,
    est_total REAL NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'draft', method TEXT,
    manager_id TEXT, mgr_by TEXT, mgr_at TEXT, fin_by TEXT, fin_at TEXT, proc_by TEXT, proc_at TEXT,
    reserved REAL NOT NULL DEFAULT 0, return_note TEXT, reject_note TEXT, rfq_id TEXT, po_number TEXT, provider_id TEXT, po_amount REAL,
    contract_id TEXT, created_at TEXT NOT NULL, submitted_at TEXT, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS procurement_items (
    id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES procurement_requests(id) ON DELETE CASCADE, line_no INTEGER NOT NULL,
    description TEXT NOT NULL, qty REAL NOT NULL, unit TEXT NOT NULL, est_unit_price REAL NOT NULL)`);
  run(`CREATE TABLE IF NOT EXISTS procurement_events (
    id TEXT PRIMARY KEY, request_id TEXT, rfq_id TEXT, action TEXT NOT NULL, by_id TEXT, note TEXT, at TEXT NOT NULL)`);
  run(`CREATE TABLE IF NOT EXISTS procurement_rfqs (
    id TEXT PRIMARY KEY, number TEXT NOT NULL UNIQUE, request_id TEXT NOT NULL, title TEXT NOT NULL, category TEXT NOT NULL,
    officer_id TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'draft', closes_at TEXT,
    spec_doc_id TEXT, spec_html TEXT, spec_mode TEXT, spec_at TEXT,
    criteria TEXT NOT NULL, tech_weight INTEGER NOT NULL, min_tech INTEGER NOT NULL,
    key1_by TEXT, key1_at TEXT, opened_by TEXT, opened_at TEXT,
    analysis TEXT, analysis_mode TEXT, analysis_at TEXT, analysis_by TEXT,
    recommended_bid TEXT, recommended_by TEXT, recommended_at TEXT, recommendation_note TEXT,
    legal_by TEXT, legal_at TEXT, legal_note TEXT, cancel_note TEXT,
    po_number TEXT, po_amount REAL, contract_id TEXT, awarded_at TEXT, published_at TEXT,
    created_at TEXT NOT NULL, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0)`);
  run(`CREATE TABLE IF NOT EXISTS procurement_invites (
    rfq_id TEXT NOT NULL REFERENCES procurement_rfqs(id) ON DELETE CASCADE, provider_id TEXT NOT NULL, invited_by TEXT, invited_at TEXT NOT NULL,
    PRIMARY KEY (rfq_id, provider_id))`);
  run(`CREATE TABLE IF NOT EXISTS procurement_committee (
    rfq_id TEXT NOT NULL REFERENCES procurement_rfqs(id) ON DELETE CASCADE, member_id TEXT NOT NULL,
    recused INTEGER NOT NULL DEFAULT 0, recusal_reason TEXT, recusal_source TEXT, recused_at TEXT,
    PRIMARY KEY (rfq_id, member_id))`);
  run(`CREATE TABLE IF NOT EXISTS procurement_bids (
    id TEXT PRIMARY KEY, rfq_id TEXT NOT NULL REFERENCES procurement_rfqs(id) ON DELETE CASCADE, provider_id TEXT NOT NULL,
    submitted_by TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'submitted', lines TEXT NOT NULL, total REAL NOT NULL,
    delivery_days INTEGER, validity_days INTEGER, technical_note TEXT,
    submitted_at TEXT NOT NULL, withdrawn_at TEXT, updated_at TEXT NOT NULL, is_demo INTEGER NOT NULL DEFAULT 0,
    UNIQUE (rfq_id, provider_id))`);
  run(`CREATE TABLE IF NOT EXISTS procurement_scores (
    rfq_id TEXT NOT NULL, bid_id TEXT NOT NULL, member_id TEXT NOT NULL, criterion TEXT NOT NULL, score INTEGER NOT NULL, at TEXT NOT NULL,
    PRIMARY KEY (rfq_id, bid_id, member_id, criterion))`);
  run(`CREATE TABLE IF NOT EXISTS procurement_votes (
    rfq_id TEXT NOT NULL, member_id TEXT NOT NULL, bid_id TEXT NOT NULL, decision TEXT NOT NULL, note TEXT, at TEXT NOT NULL,
    PRIMARY KEY (rfq_id, member_id, bid_id))`);
  run('CREATE INDEX IF NOT EXISTS ix_proc_req_requester ON procurement_requests(requester_id)');
  run('CREATE INDEX IF NOT EXISTS ix_proc_req_status ON procurement_requests(status)');
  run('CREATE INDEX IF NOT EXISTS ix_proc_items_req ON procurement_items(request_id)');
  run('CREATE INDEX IF NOT EXISTS ix_proc_bids_rfq ON procurement_bids(rfq_id)');
}

// Sequential human numbers: PR-2026-0142, RFQ-2026-0023, PO-2026-0419
export function nextNumber(prefix, start) {
  const year = new Date().getUTCFullYear();
  const key = `${prefix}-${year}`;
  const cur = one('SELECT n FROM procurement_counters WHERE key=?', key)?.n;
  const n = (cur ?? start - 1) + 1;
  run('INSERT INTO procurement_counters (key,n) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET n=excluded.n', key, n);
  return `${prefix}-${year}-${String(n).padStart(4, '0')}`;
}

// ---------------- roles ----------------
export const isOfficer = (u) => isStaff(u) && hasCap(u, 'procurement.officer');
export const isFinance = (u) => isStaff(u) && hasCap(u, 'procurement.finance');
export const isBudget = (u) => isStaff(u) && hasCap(u, 'finance.budget');
export const isLegal = (u) => isStaff(u) && hasCap(u, 'procurement.legal');
export const isCommittee = (u) => isStaff(u) && hasCap(u, 'procurement.committee');
