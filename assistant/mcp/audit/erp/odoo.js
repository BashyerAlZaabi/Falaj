/* Odoo connector (Odoo 16–18, JSON-RPC external API).
   Connection: { type: "odoo", url, db, username, apiKey }  — apiKey from Odoo › Preferences › Account Security.
   The API user only needs read access to Accounting. */
import { round } from './normalize.js';

const PL_TYPES = /^(income|expense)/; // Odoo account_type values: income, income_other, expense, expense_depreciation, expense_direct_cost…

export class OdooConnector {
  constructor(cfg) {
    for (const k of ['url', 'db', 'username', 'apiKey']) if (!cfg[k]) throw new Error(`Odoo connection is missing "${k}"`);
    this.cfg = { ...cfg, url: cfg.url.replace(/\/+$/, '') };
    this.uid = null;
  }

  async rpc(service, method, args) {
    const res = await fetch(`${this.cfg.url}/jsonrpc`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'call', params: { service, method, args }, id: Date.now() }),
    });
    if (!res.ok) throw new Error(`Odoo HTTP ${res.status}`);
    const body = await res.json();
    if (body.error) throw new Error(`Odoo: ${body.error.data?.message || body.error.message}`);
    return body.result;
  }

  async login() {
    if (this.uid) return this.uid;
    this.uid = await this.rpc('common', 'login', [this.cfg.db, this.cfg.username, this.cfg.apiKey]);
    if (!this.uid) throw new Error('Odoo login failed — check db, username and API key');
    return this.uid;
  }

  async call(model, method, args, kwargs = {}) {
    await this.login();
    return this.rpc('object', 'execute_kw', [this.cfg.db, this.uid, this.cfg.apiKey, model, method, args, kwargs]);
  }

  async test() {
    const version = await this.rpc('common', 'version', []);
    await this.login();
    const companies = await this.call('res.company', 'search_read', [[]], { fields: ['name', 'currency_id'], limit: 5 });
    return { system: 'Odoo', version: version?.server_version, companies: companies.map((c) => ({ name: c.name, currency: c.currency_id?.[1] })) };
  }

  // Sum of balance per account for move lines matching the domain.
  async balances(domain) {
    const groups = await this.call('account.move.line', 'read_group', [[['parent_state', '=', 'posted'], ...domain], ['balance:sum'], ['account_id']], { lazy: false });
    const out = new Map();
    for (const g of groups) if (g.account_id) out.set(g.account_id[0], g.balance || 0);
    return out;
  }

  /** Trial balance at yearEnd with prior-year comparatives. P&L accounts show the year's movement. */
  async trialBalance(yearEnd) {
    const fyStart = shiftYears(yearEnd, -1, 1);
    const pyEnd = shiftYears(yearEnd, -1), pyStart = shiftYears(yearEnd, -2, 1);
    const [accounts, cyCum, cyOpen, pyCum, pyOpen] = await Promise.all([
      this.call('account.account', 'search_read', [[]], { fields: ['code', 'name', 'account_type'] }),
      this.balances([['date', '<=', yearEnd]]),
      this.balances([['date', '<', fyStart]]),
      this.balances([['date', '<=', pyEnd]]),
      this.balances([['date', '<', pyStart]]),
    ]);
    const lines = [];
    let reCy = 0, rePy = 0;
    for (const a of accounts) {
      const pl = PL_TYPES.test(a.account_type || '');
      if (pl) { reCy += cyOpen.get(a.id) || 0; rePy += pyOpen.get(a.id) || 0; }
      const cy = (cyCum.get(a.id) || 0) - (pl ? cyOpen.get(a.id) || 0 : 0);
      const py = (pyCum.get(a.id) || 0) - (pl ? pyOpen.get(a.id) || 0 : 0);
      if (!cy && !py) continue;
      lines.push({ account: a.code, name: a.name, type: odooType(a.account_type), cy: round(cy), py: round(py) });
    }
    return withPriorResult(lines, reCy, rePy);
  }

  /** Posted journal lines in [from, to], newest ids last; max `limit` lines. */
  async journalLines(from, to, limit) {
    const domain = [['parent_state', '=', 'posted'], ['date', '>=', from], ['date', '<=', to]];
    const base = ['move_name', 'date', 'account_id', 'balance', 'name', 'create_uid', 'journal_id'];
    const out = [];
    const page = 2000;
    let fields = [...base, 'move_type'];
    for (let offset = 0; offset < limit; offset += page) {
      let batch;
      try { batch = await this.call('account.move.line', 'search_read', [domain], { fields, order: 'date asc, id asc', limit: Math.min(page, limit - offset), offset }); }
      catch (e) { if (fields.includes('move_type')) { fields = base; offset -= page; continue; } throw e; }
      for (const l of batch) out.push({
        je: l.move_name, date: l.date, account: String(l.account_id?.[1] || '').split(' ')[0], amount: round(l.balance),
        user: l.create_uid?.[1] || null,
        source: l.move_type ? (l.move_type === 'entry' ? 'manual' : 'system') : 'unknown',
        desc: l.name || '', journal: l.journal_id?.[1],
      });
      if (batch.length < page) break;
    }
    return out;
  }
}

// Odoo (and BC) keep P&L balances open across years; show the earlier years' result as an
// equity line so the year-end trial balance nets to zero, as an auditor expects.
export function withPriorResult(lines, cy, py) {
  if (Math.abs(cy) >= 0.01 || Math.abs(py) >= 0.01) lines.push({ account: 'RE-OPEN', name: "Prior years' result not yet closed to equity", type: 'equity', cy: round(cy), py: round(py) });
  return lines.sort((x, y) => x.account.localeCompare(y.account));
}

function odooType(t = '') {
  if (t.startsWith('asset')) return 'asset';
  if (t.startsWith('liability')) return 'liability';
  if (t.startsWith('equity')) return 'equity';
  if (t.startsWith('income')) return 'income';
  if (t.startsWith('expense')) return 'expense';
  return 'expense';
}

// shiftYears('2026-06-30', -1) → '2025-06-30'; with plusDays=1 → '2025-07-01'
export function shiftYears(date, years, plusDays = 0) {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCFullYear(d.getUTCFullYear() + years);
  d.setUTCDate(d.getUTCDate() + plusDays);
  return d.toISOString().slice(0, 10);
}
