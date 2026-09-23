/* ===== Seed data for the audit-firm MCP servers =====
   Fictional clients, staff and numbers (AED). On first run store.js copies this
   into data/audit-store.json; from then on all servers read and write that file,
   so a time entry logged in one app shows up in billing, an ERP extract imported
   by the ERP server feeds analytics, and nothing is lost on restart.
   Delete data/audit-store.json to reset to this seed. */

export const engagements = [
  {
    id: 'ENG-001', client: 'Gulf Trading LLC', type: 'Statutory audit', yearEnd: '2026-06-30',
    framework: 'IFRS', phase: 'fieldwork', reportDue: '2026-10-15',
    partner: 'S01', manager: 'S02', team: ['S03', 'S04', 'S05'], budgetHours: 1200,
    materiality: { benchmark: 'profit before tax', overall: 1_150_000, performance: 862_500, trivial: 57_500 },
    significantRisks: ['Revenue recognition — cut-off at year end', 'Management override of controls', 'Inventory valuation (slow-moving stock)'],
  },
  {
    id: 'ENG-002', client: 'Al Noor Healthcare Group', type: 'Group audit', yearEnd: '2026-12-31',
    framework: 'IFRS', phase: 'planning', reportDue: '2027-03-31',
    partner: 'S01', manager: 'S06', team: ['S04', 'S07'], budgetHours: 2400,
    materiality: null,
    significantRisks: ['Revenue from insurance claims — estimates of rejections', 'Management override of controls'],
  },
  {
    id: 'ENG-003', client: 'Desert Logistics PJSC', type: 'Statutory audit', yearEnd: '2026-03-31',
    framework: 'IFRS', phase: 'completion', reportDue: '2026-09-30',
    partner: 'S08', manager: 'S02', team: ['S05', 'S07'], budgetHours: 900,
    materiality: { benchmark: 'total assets', overall: 3_400_000, performance: 2_550_000, trivial: 170_000 },
    significantRisks: ['Impairment of fleet assets', 'Management override of controls'],
  },
];

export const pbcRequests = [
  { id: 'PBC-101', engagement: 'ENG-001', item: 'Trial balance and GL extract FY2026', clientOwner: 'Finance Manager', due: '2026-08-10', status: 'received' },
  { id: 'PBC-102', engagement: 'ENG-001', item: 'Bank confirmations authorisation letter', clientOwner: 'CFO', due: '2026-08-15', status: 'received' },
  { id: 'PBC-103', engagement: 'ENG-001', item: 'Sales invoices & delivery notes ±10 days around year end (cut-off)', clientOwner: 'AR Supervisor', due: '2026-09-05', status: 'outstanding' },
  { id: 'PBC-104', engagement: 'ENG-001', item: 'Inventory ageing report and provision workings', clientOwner: 'Warehouse Controller', due: '2026-09-12', status: 'outstanding' },
  { id: 'PBC-105', engagement: 'ENG-001', item: 'Board minutes Jul 2025 – Sep 2026', clientOwner: 'Company Secretary', due: '2026-09-30', status: 'outstanding' },
  { id: 'PBC-106', engagement: 'ENG-001', item: 'Related-party transactions listing', clientOwner: 'CFO', due: '2026-09-20', status: 'partially received' },
  { id: 'PBC-201', engagement: 'ENG-002', item: 'Group structure chart and component list', clientOwner: 'Group Financial Controller', due: '2026-10-01', status: 'outstanding' },
  { id: 'PBC-301', engagement: 'ENG-003', item: 'Signed management representation letter', clientOwner: 'CEO', due: '2026-09-25', status: 'outstanding' },
];

export const findings = [
  { id: 'F-01', engagement: 'ENG-001', area: 'Revenue', title: 'Two June invoices (AED 412k) delivered in July', severity: 'high', status: 'open', type: 'misstatement', amount: 412_000 },
  { id: 'F-02', engagement: 'ENG-001', area: 'IT general controls', title: 'Finance staff share an ERP admin account', severity: 'medium', status: 'open', type: 'control deficiency', amount: null },
  { id: 'F-03', engagement: 'ENG-003', area: 'PPE', title: 'Impairment model uses 2024 fuel-cost assumptions', severity: 'medium', status: 'resolved', type: 'judgement', amount: null },
];

// Trial balance, AED. cy = current year, py = prior year.
export const trialBalances = {
  'ENG-001': [
    { account: '4000', name: 'Revenue', type: 'income', cy: -48_600_000, py: -41_200_000 },
    { account: '5000', name: 'Cost of sales', type: 'expense', cy: 33_900_000, py: 29_300_000 },
    { account: '6100', name: 'Salaries', type: 'expense', cy: 4_800_000, py: 4_650_000 },
    { account: '6200', name: 'Rent', type: 'expense', cy: 1_200_000, py: 1_200_000 },
    { account: '6300', name: 'Marketing', type: 'expense', cy: 1_950_000, py: 820_000 },
    { account: '6400', name: 'Consultancy fees', type: 'expense', cy: 1_310_000, py: 390_000 },
    { account: '6900', name: 'Depreciation', type: 'expense', cy: 640_000, py: 610_000 },
    { account: '1100', name: 'Cash at bank', type: 'asset', cy: 6_400_000, py: 5_900_000 },
    { account: '1200', name: 'Trade receivables', type: 'asset', cy: 12_700_000, py: 8_100_000 },
    { account: '1300', name: 'Inventory', type: 'asset', cy: 9_300_000, py: 8_800_000 },
    { account: '1500', name: 'Property, plant & equipment', type: 'asset', cy: 5_100_000, py: 5_400_000 },
    { account: '2100', name: 'Trade payables', type: 'liability', cy: -7_900_000, py: -7_300_000 },
    { account: '2200', name: 'Accruals', type: 'liability', cy: -1_100_000, py: -1_600_000 },
    { account: '3000', name: 'Equity', type: 'equity', cy: -20_000_000, py: -18_000_000 },
  ],
};

// Journal entries (sample of the GL). user: who posted; source: 'system' or 'manual'.
export const journalEntries = {
  'ENG-001': [
    { je: 'JE-1001', date: '2026-01-14', account: '4000', amount: -380_000, user: 'ar.clerk', source: 'system', desc: 'Sales invoice batch' },
    { je: 'JE-1002', date: '2026-02-03', account: '6100', amount: 402_000, user: 'payroll', source: 'system', desc: 'Payroll January' },
    { je: 'JE-1003', date: '2026-03-06', account: '6300', amount: 250_000, user: 'fin.manager', source: 'manual', desc: 'Marketing campaign accrual' },
    { je: 'JE-1004', date: '2026-03-20', account: '6400', amount: 500_000, user: 'cfo', source: 'manual', desc: 'Consultancy — strategy project' },
    { je: 'JE-1005', date: '2026-04-10', account: '4000', amount: -2_000_000, user: 'cfo', source: 'manual', desc: 'Revenue adjustment' },
    { je: 'JE-1006', date: '2026-04-17', account: '5000', amount: 1_120_450, user: 'ap.clerk', source: 'system', desc: 'Purchase invoices' },
    { je: 'JE-1007', date: '2026-05-08', account: '6200', amount: 100_000, user: 'ap.clerk', source: 'system', desc: 'Rent May' },
    { je: 'JE-1008', date: '2026-05-29', account: '1300', amount: -95_000, user: 'wh.controller', source: 'manual', desc: 'Stock write-off' },
    { je: 'JE-1009', date: '2026-06-26', account: '4000', amount: -412_000, user: 'fin.manager', source: 'manual', desc: 'June invoices — Customer Al Wasl' },
    { je: 'JE-1010', date: '2026-06-28', account: '6400', amount: 499_000, user: 'cfo', source: 'manual', desc: 'Consultancy — misc.' },
    { je: 'JE-1011', date: '2026-06-30', account: '2200', amount: 600_000, user: 'fin.manager', source: 'manual', desc: 'Release of accruals' },
    { je: 'JE-1012', date: '2026-06-30', account: '4000', amount: -1_250_000, user: 'ar.clerk', source: 'system', desc: 'Sales invoice batch' },
    { je: 'JE-1013', date: '2026-07-03', account: '4000', amount: 300_000, user: 'fin.manager', source: 'manual', desc: 'Credit note — June sales reversed' },
    { je: 'JE-1014', date: '2026-07-10', account: '6300', amount: 860_000, user: 'fin.manager', source: 'manual', desc: 'Marketing FY2026 — late invoice' },
    { je: 'JE-1015', date: '2026-02-17', account: '5000', amount: 874_300, user: 'ap.clerk', source: 'system', desc: 'Purchase invoices' },
    { je: 'JE-1016', date: '2026-05-16', account: '1200', amount: 1_500_000, user: 'it.admin', source: 'manual', desc: 'Receivable reclass' },
  ],
};

export const staff = [
  { id: 'S01', name: 'Mariam Al Hosani', grade: 'Partner', rate: 1400, skills: ['IFRS', 'Healthcare', 'Group audits'] },
  { id: 'S02', name: 'Omar Khalid', grade: 'Senior Manager', rate: 950, skills: ['IFRS', 'Trading', 'Logistics'] },
  { id: 'S03', name: 'Fatima Rashed', grade: 'Senior', rate: 520, skills: ['Revenue', 'Inventory'] },
  { id: 'S04', name: 'Ahmed Saeed', grade: 'Senior', rate: 520, skills: ['Data analytics', 'IT audit'] },
  { id: 'S05', name: 'Noura Salem', grade: 'Associate', rate: 310, skills: ['Cash', 'Payables'] },
  { id: 'S06', name: 'Khalid Mansoori', grade: 'Manager', rate: 780, skills: ['Healthcare', 'Group audits'] },
  { id: 'S07', name: 'Reem Yousef', grade: 'Associate', rate: 310, skills: ['PPE', 'Leases'] },
  { id: 'S08', name: 'Hassan Ali', grade: 'Partner', rate: 1400, skills: ['Logistics', 'Impairment'] },
];

// Independence register: declared relationships with clients.
export const declarations = [
  { staff: 'S05', client: 'Gulf Trading LLC', type: 'close family member employed', detail: 'Brother works in the client warehouse team', declared: '2026-07-01' },
  { staff: 'S07', client: 'Desert Logistics PJSC', type: 'financial interest', detail: 'Holds shares in the client (listed)', declared: '2025-11-20' },
];

// billed: already included on an invoice. Unbilled entries are work in progress (WIP).
export const timeEntries = [
  { staff: 'S01', engagement: 'ENG-001', hours: 18, date: '2026-07-20', billed: true },
  { staff: 'S02', engagement: 'ENG-001', hours: 70, date: '2026-07-31', billed: true },
  { staff: 'S03', engagement: 'ENG-001', hours: 180, date: '2026-08-15', billed: true },
  { staff: 'S01', engagement: 'ENG-001', hours: 24, date: '2026-09-15', billed: false },
  { staff: 'S02', engagement: 'ENG-001', hours: 90, date: '2026-09-15', billed: false },
  { staff: 'S03', engagement: 'ENG-001', hours: 210, date: '2026-09-15', billed: false },
  { staff: 'S04', engagement: 'ENG-001', hours: 210, date: '2026-09-15', billed: false },
  { staff: 'S05', engagement: 'ENG-001', hours: 330, date: '2026-09-15', billed: false },
  { staff: 'S06', engagement: 'ENG-002', hours: 60, date: '2026-09-15', billed: false },
  { staff: 'S02', engagement: 'ENG-003', hours: 140, date: '2026-06-30', billed: true },
  { staff: 'S05', engagement: 'ENG-003', hours: 380, date: '2026-06-30', billed: true },
  { staff: 'S07', engagement: 'ENG-003', hours: 420, date: '2026-08-31', billed: false },
  { staff: 'S08', engagement: 'ENG-003', hours: 38, date: '2026-09-10', billed: false },
];

// Agreed audit fees (engagement letter) and fee invoices.
export const fees = { 'ENG-001': 520_000, 'ENG-002': 900_000, 'ENG-003': 350_000 };

export const invoices = [
  { id: 'INV-2025-044', engagement: 'ENG-003', description: 'FY2025 audit — final fee', amount: 180_000, issued: '2025-09-10', dueDays: 30, status: 'unpaid' },
  { id: 'INV-2026-021', engagement: 'ENG-001', description: 'FY2026 audit — interim', amount: 150_000, issued: '2026-07-15', dueDays: 30, status: 'paid', paid: '2026-08-10' },
  { id: 'INV-2026-028', engagement: 'ENG-001', description: 'FY2026 audit — progress billing', amount: 120_000, issued: '2026-08-31', dueDays: 30, status: 'unpaid' },
  { id: 'INV-2026-029', engagement: 'ENG-003', description: 'FY2026 audit — fieldwork', amount: 170_000, issued: '2026-07-05', dueDays: 30, status: 'paid', paid: '2026-08-02' },
  { id: 'INV-2026-030', engagement: 'ENG-002', description: 'FY2026 group audit — planning', amount: 60_000, issued: '2026-09-10', dueDays: 30, status: 'unpaid' },
];

export const SEED = { engagements, pbcRequests, findings, trialBalances, journalEntries, staff, declarations, timeEntries, fees, invoices };
