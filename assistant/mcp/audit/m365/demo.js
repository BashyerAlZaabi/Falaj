/* Demo Microsoft 365 backend: a fictional audit manager's mailbox, calendar and
   SharePoint library, used when no Graph credentials are configured. Same interface
   as GraphBackend. The client emails carry real CSV extracts, so the whole flow
   (email → import → ERP data → analytics) can be tried without any live system. */
import { SEED } from '../data.js';

function tbCsv() {
  const rows = SEED.trialBalances['ENG-001'].map((a) => [a.account, a.name, a.cy > 0 ? a.cy : 0, a.cy < 0 ? -a.cy : 0, a.py]);
  // Balancing line so the extract nets to zero, like a real TB (retained earnings / current-year result).
  const cy = rows.reduce((s, r) => s + r[2] - r[3], 0), py = SEED.trialBalances['ENG-001'].reduce((s, a) => s + a.py, 0);
  rows.push(['3100', 'Retained earnings', cy < 0 ? -cy : 0, cy > 0 ? cy : 0, -py]);
  return ['Account No,Account Name,Debit,Credit,Prior Year', ...rows.map((r) => `${r[0]},"${r[1]}",${r[2]},${r[3]},${r[4]}`)].join('\n');
}

function glCsv() {
  // Double-entry version of the seed journals: each line gets a contra line (bank or payables).
  const lines = ['Entry No,Posting Date,Account,Description,Debit,Credit,Created By,Source'];
  for (const j of SEED.journalEntries['ENG-001']) {
    const contra = j.account.startsWith('4') ? '1200' : j.account.startsWith('1') || j.account.startsWith('2') ? '1100' : '2100';
    const src = j.source === 'manual' ? 'Manual' : 'System';
    const row = (acc, amt) => `${j.je},${j.date},${acc},"${j.desc}",${amt > 0 ? amt : 0},${amt < 0 ? -amt : 0},${j.user},${src}`;
    lines.push(row(j.account, j.amount), row(contra, -j.amount));
  }
  return lines.join('\n');
}

const att = (id, name, content) => ({ id, name, contentType: name.endsWith('.csv') ? 'text/csv' : 'text/plain', size: Buffer.byteLength(content), content });

const MAIL = [
  { id: 'msg-001', subject: 'FY2026 trial balance and GL extract', from: 'finance.manager@gulftrading.example', fromName: 'Finance Manager — Gulf Trading', to: ['me@audit-firm.example'], received: '2026-08-09T09:12:00',
    body: 'Dear audit team,\n\nPlease find attached the trial balance as at 30 June 2026 and the general ledger journal extract for FY2026, exported from our ERP.\n\nRegards,\nFinance Manager',
    attachments: [att('att-001', 'GulfTrading_TB_FY2026.csv', tbCsv()), att('att-002', 'GulfTrading_GL_FY2026.csv', glCsv())] },
  { id: 'msg-002', subject: 'Cut-off documents — partial', from: 'ar.supervisor@gulftrading.example', fromName: 'AR Supervisor — Gulf Trading', to: ['me@audit-firm.example'], received: '2026-09-18T15:40:00',
    body: 'Hi,\n\nAttached is the listing of sales invoices from 20 June to 10 July. Delivery notes for invoices SI-6620 and SI-6621 (Customer Al Wasl, AED 412,000) are still with the warehouse; we will send them next week.\n\nThanks',
    attachments: [att('att-003', 'cutoff_listing.csv', 'Invoice,Date,Customer,Amount,Delivery date\nSI-6601,2026-06-22,Emirates Retail,86000,2026-06-22\nSI-6620,2026-06-27,Al Wasl Trading,206000,\nSI-6621,2026-06-27,Al Wasl Trading,206000,\nSI-6655,2026-07-03,Emirates Retail,54000,2026-07-03')] },
  { id: 'msg-003', subject: 'Related parties listing', from: 'cfo@gulftrading.example', fromName: 'CFO — Gulf Trading', to: ['me@audit-firm.example'], received: '2026-09-21T11:05:00',
    body: 'Dear Omar,\n\nWe need one more week for the related-party transactions listing — the new subsidiary in Oman is still closing its books. Can we deliver by 28 September?\n\nBest regards,\nCFO', attachments: [] },
  { id: 'msg-004', subject: 'Management representation letter', from: 'ceo@desertlogistics.example', fromName: 'CEO — Desert Logistics', to: ['me@audit-firm.example'], received: '2026-09-22T08:30:00',
    body: 'Dear Hassan,\n\nThe board meets on 29 September. The signed representation letter will follow straight after the meeting.\n\nKind regards', attachments: [] },
  { id: 'msg-005', subject: 'Re: Outstanding fees', from: 'finance@desertlogistics.example', fromName: 'Finance — Desert Logistics', to: ['billing@audit-firm.example'], received: '2026-09-01T10:00:00',
    body: 'Hello,\n\nWe will settle invoice INV-2025-044 (FY2025 audit fee) once this year\'s audit report is issued.\n\nThank you', attachments: [] },
  { id: 'msg-006', subject: 'ENG-002 group audit — planning kick-off', from: 'mariam.alhosani@audit-firm.example', fromName: 'Mariam Al Hosani', to: ['me@audit-firm.example'], received: '2026-09-19T17:20:00',
    body: 'Team,\n\nLet\'s hold the Al Noor planning kick-off on 1 October. Khalid — please circulate the component list beforehand.\n\nMariam', attachments: [] },
];

const EVENTS = [
  { id: 'evt-1', subject: 'Gulf Trading — cut-off walkthrough with AR team', start: '2026-09-24T10:00:00', end: '2026-09-24T11:30:00', location: 'Client office, Dubai', organizer: 'me@audit-firm.example', attendees: ['ar.supervisor@gulftrading.example', 'fatima.rashed@audit-firm.example'] },
  { id: 'evt-2', subject: 'Desert Logistics — closing meeting with audit committee', start: '2026-09-29T14:00:00', end: '2026-09-29T15:00:00', location: 'Teams', organizer: 'hassan.ali@audit-firm.example', attendees: ['ceo@desertlogistics.example', 'me@audit-firm.example'], online: true },
  { id: 'evt-3', subject: 'Al Noor — group audit planning kick-off', start: '2026-10-01T09:00:00', end: '2026-10-01T10:30:00', location: 'Audit firm office', organizer: 'mariam.alhosani@audit-firm.example', attendees: ['khalid.mansoori@audit-firm.example', 'me@audit-firm.example'] },
  { id: 'evt-4', subject: 'Gulf Trading — clearance meeting with CFO', start: '2026-10-12T11:00:00', end: '2026-10-12T12:00:00', location: 'Client office, Dubai', organizer: 'me@audit-firm.example', attendees: ['cfo@gulftrading.example', 'mariam.alhosani@audit-firm.example'] },
];

const FILES = {
  'Clients/Gulf Trading LLC/FY2026/Planning/Audit planning memo.md': `# Gulf Trading LLC — FY2026 audit planning memo\n\nYear end: 30 June 2026. Framework: IFRS.\n\n## Materiality\n- Benchmark: profit before tax (AED 23.0m) × 5% = AED 1,150,000\n- Performance materiality 75% = AED 862,500\n- Clearly trivial 5% = AED 57,500\n\n## Significant risks\n1. Revenue recognition — cut-off at year end (new customer Al Wasl with large June sales).\n2. Management override of controls — CFO posts manual journals directly.\n3. Inventory valuation — slow-moving stock in the Jebel Ali warehouse.\n\n## Planned responses\n- Cut-off testing ±10 days around year end; delivery notes for all invoices > AED 100k.\n- Journal-entry testing with focus on manual entries by senior management and post-close entries.\n- Inventory ageing review and NRV testing.\n`,
  'Clients/Gulf Trading LLC/FY2026/Planning/Engagement letter.txt': 'Engagement letter — statutory audit of Gulf Trading LLC for the year ending 30 June 2026.\nAgreed fee: AED 520,000 plus VAT, billed interim / progress / final.\nReport deadline: 15 October 2026.\n',
  'Clients/Gulf Trading LLC/FY2026/Fieldwork/.keep': '',
  'Clients/Desert Logistics PJSC/FY2026/Completion/Summary of unadjusted differences.csv': 'Ref,Description,Amount,Status\nSUD-1,Fuel cost assumption in impairment model,0,Resolved\n',
  'Firm/Methodology/Journal entry testing checklist.md': '# Journal-entry testing (ISA 240)\n\n- Obtain complete population; reconcile to TB.\n- Risk criteria: post-close, round amounts, just below approval limits, weekend postings, senior-management manual entries, unusual users, debits to revenue.\n- Test selected entries to support; evaluate business rationale.\n',
};

const match = (hay, needle) => String(hay || '').toLowerCase().includes(String(needle).toLowerCase());

export class DemoBackend {
  constructor() {
    this.mode = 'demo mailbox & SharePoint (set M365_* variables for the real Microsoft 365)';
    this.mail = structuredClone(MAIL);
    this.events = structuredClone(EVENTS);
    this.files = { ...FILES };
    this.n = 0;
  }

  async searchEmails({ query, from, since, top }) {
    return this.mail
      .filter((m) => (!query || query.split(/\s+/).every((w) => match(`${m.subject} ${m.body} ${m.fromName} ${m.from} ${m.attachments.map((a) => a.name).join(' ')}`, w)))
        && (!from || match(`${m.from} ${m.fromName}`, from)) && (!since || m.received >= since) && !m.draft)
      .sort((a, b) => b.received.localeCompare(a.received)).slice(0, top)
      .map((m) => ({ id: m.id, subject: m.subject, from: m.from, fromName: m.fromName, received: m.received, preview: m.body.slice(0, 160), hasAttachments: m.attachments.length > 0 }));
  }

  async readEmail(id) {
    const m = this.mail.find((x) => x.id === id);
    if (!m) throw new Error(`No email with id ${id}`);
    return { ...m, attachments: m.attachments.map(({ id: aid, name, contentType, size }) => ({ id: aid, name, contentType, size })) };
  }

  async getAttachment(messageId, attachmentId) {
    const a = this.mail.find((x) => x.id === messageId)?.attachments.find((x) => x.id === attachmentId);
    if (!a) throw new Error('Attachment not found');
    return { name: a.name, contentType: a.contentType, buffer: Buffer.from(a.content, 'utf8') };
  }

  async draftEmail({ to, cc, subject, body, replyTo }) {
    const orig = replyTo && this.mail.find((x) => x.id === replyTo);
    const d = { id: `draft-${++this.n}`, draft: true, subject: subject || (orig ? `Re: ${orig.subject}` : ''), to: to?.length ? to : orig ? [orig.from] : [], cc: cc || [], body, received: new Date().toISOString(), attachments: [] };
    this.mail.push(d);
    return { id: d.id, status: 'draft saved (demo) — not sent', subject: d.subject, to: d.to };
  }

  async listEvents({ from, to }) {
    return this.events.filter((e) => e.start.slice(0, 10) >= from && e.start.slice(0, 10) <= to).sort((a, b) => a.start.localeCompare(b.start));
  }

  async createEvent(ev) {
    const e = { id: `evt-${this.events.length + 1}`, organizer: 'me@audit-firm.example', ...ev, attendees: ev.attendees || [] };
    this.events.push(e);
    return { ...e, invitationsSentTo: e.attendees, note: 'demo — no invitations actually sent' };
  }

  item(p) {
    const isFolder = p.endsWith('/');
    const clean = p.replace(/\/$/, '');
    return { id: clean, name: clean.split('/').pop(), folder: isFolder, size: isFolder ? undefined : Buffer.byteLength(this.files[clean] || ''), path: '/' + clean.split('/').slice(0, -1).join('/') };
  }

  async searchFiles({ query, top }) {
    return Object.keys(this.files).filter((p) => !p.endsWith('.keep') && (match(p, query) || match(this.files[p], query))).slice(0, top).map((p) => this.item(p));
  }

  async listFolder(path) {
    const base = String(path || '').replace(/^\/+|\/+$/g, '');
    const prefix = base ? base + '/' : '';
    const kids = new Set();
    for (const p of Object.keys(this.files)) {
      if (!p.startsWith(prefix)) continue;
      const rest = p.slice(prefix.length);
      const [head, ...tail] = rest.split('/');
      if (head === '.keep') continue;
      kids.add(tail.length ? prefix + head + '/' : prefix + head);
    }
    if (!kids.size && base) throw new Error(`Folder not found: ${path}`);
    return [...kids].sort().map((p) => this.item(p));
  }

  async downloadFile({ path, id }) {
    const p = String(id || path || '').replace(/^\/+/, '');
    if (!(p in this.files)) throw new Error(`File not found: ${p}`);
    return { ...this.item(p), buffer: Buffer.from(this.files[p], 'utf8') };
  }

  async saveFile({ folder, name, content }) {
    let p = [String(folder || '').replace(/^\/+|\/+$/g, ''), name].filter(Boolean).join('/');
    for (let i = 1; p in this.files; i++) p = p.replace(/( \(\d+\))?(\.\w+)?$/, (_, _n, ext = '') => ` (${i})${ext}`);
    this.files[p] = content;
    return this.item(p);
  }
}
