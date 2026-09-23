/* Microsoft Dynamics 365 Business Central connector (API v2.0, service-to-service auth).
   Connection: { type: "businesscentral", tenantId, clientId, clientSecret, environment, companyId | companyName }
   Register an Entra ID app with the "API.ReadWrite.All" (or read-only) Business Central
   application permission, and add it in BC › Microsoft Entra Applications with read access. */
import { round } from './normalize.js';
import { shiftYears, withPriorResult } from './odoo.js';

const PL_CATEGORIES = ['Income', 'CostOfGoodsSold', 'Expense'];

export class BusinessCentralConnector {
  constructor(cfg) {
    for (const k of ['tenantId', 'clientId', 'clientSecret', 'environment']) if (!cfg[k]) throw new Error(`Business Central connection is missing "${k}"`);
    if (!cfg.companyId && !cfg.companyName) throw new Error('Business Central connection needs "companyId" or "companyName"');
    this.cfg = cfg;
    this.api = cfg.apiBase || `https://api.businesscentral.dynamics.com/v2.0/${cfg.tenantId}/${cfg.environment}/api/v2.0`;
    this.token = null;
  }

  async auth() {
    if (this.token && this.token.exp > Date.now() + 60_000) return this.token.value;
    const res = await fetch(this.cfg.tokenUrl || `https://login.microsoftonline.com/${this.cfg.tenantId}/oauth2/v2.0/token`, {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'client_credentials', client_id: this.cfg.clientId, client_secret: this.cfg.clientSecret, scope: 'https://api.businesscentral.dynamics.com/.default' }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(`Business Central sign-in failed: ${body.error_description || body.error || res.status}`);
    this.token = { value: body.access_token, exp: Date.now() + body.expires_in * 1000 };
    return this.token.value;
  }

  async get(url) {
    const res = await fetch(url.startsWith('http') ? url : `${this.api}${url}`, { headers: { Authorization: `Bearer ${await this.auth()}`, Accept: 'application/json' } });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Business Central HTTP ${res.status}: ${body.error?.message || ''}`);
    return body;
  }

  async all(url, limit = Infinity) {
    const out = [];
    for (let next = url; next && out.length < limit;) {
      const page = await this.get(next);
      out.push(...(page.value || []));
      next = page['@odata.nextLink'];
    }
    return out.slice(0, limit);
  }

  async company() {
    if (this.companyId) return this.companyId;
    if (this.cfg.companyId) return (this.companyId = this.cfg.companyId);
    const list = await this.all(`/companies?$filter=name eq '${this.cfg.companyName.replace(/'/g, "''")}'`);
    if (!list.length) throw new Error(`Company "${this.cfg.companyName}" not found in Business Central`);
    return (this.companyId = list[0].id);
  }

  async test() {
    const companies = await this.all('/companies?$select=id,name');
    return { system: 'Dynamics 365 Business Central', environment: this.cfg.environment, companies: companies.map((c) => ({ id: c.id, name: c.name })) };
  }

  entries(filter, limit) {
    return this.company().then((c) => this.all(`/companies(${c})/generalLedgerEntries?$filter=${encodeURIComponent(filter)}&$select=entryNumber,postingDate,documentNumber,documentType,accountNumber,description,debitAmount,creditAmount`, limit));
  }

  /** Trial balance at yearEnd with comparatives, built from G/L entries. */
  async trialBalance(yearEnd) {
    const c = await this.company();
    const accounts = await this.all(`/companies(${c})/accounts?$select=number,displayName,category`);
    const fyStart = shiftYears(yearEnd, -1, 1), pyEnd = shiftYears(yearEnd, -1), pyStart = shiftYears(yearEnd, -2, 1);
    const cum = { cy: new Map(), cyOpen: new Map(), py: new Map(), pyOpen: new Map() };
    for (const e of await this.entries(`postingDate le ${yearEnd}`)) {
      const v = (e.debitAmount || 0) - (e.creditAmount || 0), a = e.accountNumber, d = e.postingDate;
      const add = (m) => m.set(a, (m.get(a) || 0) + v);
      add(cum.cy);
      if (d < fyStart) add(cum.cyOpen);
      if (d <= pyEnd) add(cum.py);
      if (d < pyStart) add(cum.pyOpen);
    }
    const lines = [];
    let reCy = 0, rePy = 0;
    for (const a of accounts) {
      const pl = PL_CATEGORIES.includes(a.category);
      if (pl) { reCy += cum.cyOpen.get(a.number) || 0; rePy += cum.pyOpen.get(a.number) || 0; }
      const cy = (cum.cy.get(a.number) || 0) - (pl ? cum.cyOpen.get(a.number) || 0 : 0);
      const py = (cum.py.get(a.number) || 0) - (pl ? cum.pyOpen.get(a.number) || 0 : 0);
      if (!cy && !py) continue;
      lines.push({ account: a.number, name: a.displayName, type: bcType(a.category), cy: round(cy), py: round(py) });
    }
    return withPriorResult(lines, reCy, rePy);
  }

  async journalLines(from, to, limit) {
    const rows = await this.entries(`postingDate ge ${from} and postingDate le ${to}`, limit);
    return rows.map((e) => ({
      je: e.documentNumber || `GL-${e.entryNumber}`, date: e.postingDate, account: e.accountNumber,
      amount: round((e.debitAmount || 0) - (e.creditAmount || 0)), user: null,
      source: !e.documentType || e.documentType === ' ' || e.documentType === '_x0020_' ? 'manual' : 'system', desc: e.description || '',
    }));
  }
}

function bcType(cat) {
  return { Assets: 'asset', Liabilities: 'liability', Equity: 'equity', Income: 'income', CostOfGoodsSold: 'expense', Expense: 'expense' }[cat] || 'expense';
}
