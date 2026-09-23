#!/usr/bin/env node
/* ===== Audit MCP server — Client ERP data =====
   Brings each client's accounting data into the audit file, three ways:
     • Live Odoo           (JSON-RPC)                       — erp/odoo.js
     • Live Business Central (Dynamics 365, API v2.0)       — erp/businesscentral.js
     • File extracts (CSV / XLSX) from SAP, Oracle, Tally, QuickBooks, Zoho, Excel… — any ERP
   Connections per engagement live in erp.connections.json (see erp.connections.example.json).
   Imported data lands in the shared store, where the analytics server tests it. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { load, update, findEngagement, today } from './store.js';
import { readTable, safeImportPath, listImportFiles, IMPORT_DIR } from './tables.js';
import { tbFromRows, jeFromRows, checkTB, checkJE, round } from './erp/normalize.js';
import { OdooConnector, shiftYears } from './erp/odoo.js';
import { BusinessCentralConnector } from './erp/businesscentral.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const CONN_FILE = path.resolve(process.env.AUDIT_ERP_CONNECTIONS || path.join(here, '..', '..', 'erp.connections.json'));
const engId = z.string().describe('Engagement id, e.g. "ENG-001"');
const readOnly = { readOnlyHint: true };
const SECRET = /(key|secret|password)$|^token$/i;

function expandEnv(v) {
  if (typeof v === 'string') return v.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '');
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, expandEnv(x)]));
  return v;
}
function connections() {
  try { return expandEnv(JSON.parse(fs.readFileSync(CONN_FILE, 'utf8'))); }
  catch (e) { if (e.code === 'ENOENT') return {}; throw new Error(`Cannot read ${CONN_FILE}: ${e.message}`); }
}
function connector(engagementId) {
  const cfg = Object.entries(connections()).find(([k]) => k.toLowerCase() === engagementId.toLowerCase())?.[1];
  if (!cfg) return null;
  if (cfg.type === 'odoo') return new OdooConnector(cfg);
  if (cfg.type === 'businesscentral') return new BusinessCentralConnector(cfg);
  throw new Error(`Unsupported ERP type "${cfg.type}" — use odoo, businesscentral, or file extracts.`);
}
const masked = (cfg) => Object.fromEntries(Object.entries(cfg).map(([k, v]) => [k, SECRET.test(k) ? (v ? '••••' : '(missing)') : v]));

function save(engagementId, kind, lines, meta) {
  update((s) => {
    const e = findEngagement(s, engagementId);
    if (kind === 'trial_balance') s.trialBalances[e.id] = lines; else s.journalEntries[e.id] = lines;
    s.extracts ||= {};
    s.extracts[e.id] = { ...(s.extracts[e.id] || {}), [kind]: { ...meta, importedAt: new Date().toISOString() } };
  });
}

function buildServer() {
  const server = new McpServer({ name: 'audit-erp', version: '1.0.0' });

  server.registerTool('erp_status', {
    title: 'ERP connections & loaded data',
    description: 'For each engagement: configured ERP connection (secrets hidden), what accounting data is loaded in the audit file and from where, integrity checks, plus extract files waiting in the imports folder.',
    inputSchema: { engagement_id: engId.optional() },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const s = load();
    const conns = connections();
    const list = s.engagements.filter((e) => !engagement_id || e.id.toLowerCase() === engagement_id.toLowerCase());
    return json({
      connectionsFile: CONN_FILE, importsFolder: IMPORT_DIR, importFiles: listImportFiles(),
      engagements: list.map((e) => ({
        engagement: e.id, client: e.client, yearEnd: e.yearEnd,
        connection: conns[e.id] ? masked(conns[e.id]) : null,
        trialBalance: s.trialBalances[e.id] ? { accounts: s.trialBalances[e.id].length, ...(s.extracts?.[e.id]?.trial_balance || { source: 'demo seed' }) } : null,
        journalEntries: s.journalEntries[e.id] ? { lines: s.journalEntries[e.id].length, ...(s.extracts?.[e.id]?.journal_entries || { source: 'demo seed' }) } : null,
      })),
    });
  });

  server.registerTool('test_erp_connection', {
    title: 'Test ERP connection',
    description: "Sign in to the engagement's client ERP (read-only) and list the companies visible to the audit user.",
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    try {
      const c = connector(engagement_id);
      if (!c) return fail(`No ERP connection configured for ${engagement_id} in ${CONN_FILE}. Use a file extract instead, or add a connection.`);
      return json({ ok: true, ...(await c.test()) });
    } catch (e) { return fail(`Connection failed: ${e.message}`); }
  });

  server.registerTool('pull_from_erp', {
    title: 'Pull data from the client ERP',
    description: "Read the trial balance (year end + prior-year comparatives) and/or the year's posted journal lines from the client's ERP and load them into the audit file, replacing what was there. Only when the user asks.",
    inputSchema: {
      engagement_id: engId,
      include: z.array(z.enum(['trial_balance', 'journal_entries'])).optional().describe('Default: both'),
      max_journal_lines: z.number().int().min(1).max(500_000).optional().describe('Default 50,000'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
  }, async ({ engagement_id, include = ['trial_balance', 'journal_entries'], max_journal_lines = 50_000 }) => {
    const e = findEngagement(load(), engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    let c;
    try { c = connector(e.id); } catch (err) { return fail(err.message); }
    if (!c) return fail(`No ERP connection configured for ${e.id}.`);
    const out = { engagement: e.id, yearEnd: e.yearEnd };
    try {
      if (include.includes('trial_balance')) {
        const lines = await c.trialBalance(e.yearEnd);
        const check = checkTB(lines);
        save(e.id, 'trial_balance', lines, { source: c.constructor.name.replace('Connector', ''), check });
        out.trialBalance = check;
      }
      if (include.includes('journal_entries')) {
        const lines = await c.journalLines(shiftYears(e.yearEnd, -1, 1), e.yearEnd, max_journal_lines);
        const check = checkJE(lines);
        save(e.id, 'journal_entries', lines, { source: c.constructor.name.replace('Connector', ''), check, truncated: lines.length >= max_journal_lines });
        out.journalEntries = { ...check, truncated: lines.length >= max_journal_lines };
      }
    } catch (err) { return fail(`ERP pull failed: ${err.message}`); }
    return json(out);
  });

  server.registerTool('import_extract', {
    title: 'Import an ERP extract file',
    description: `Load a trial balance or journal-entry extract (CSV or XLSX, from any ERP) into the audit file. The file must be in the imports folder. Column names are recognised automatically (account, name, debit/credit or balance, date, entry number, user…). Use dry_run to validate first. Writes to the audit file — only when the user asks.`,
    inputSchema: {
      engagement_id: engId,
      file: z.string().describe('File name inside the imports folder'),
      kind: z.enum(['trial_balance', 'journal_entries']),
      sheet: z.string().optional().describe('XLSX sheet name (default: first sheet)'),
      dry_run: z.boolean().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ engagement_id, file, kind, sheet, dry_run }) => {
    const e = findEngagement(load(), engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const full = safeImportPath(file);
    if (!full) return fail(`File must be inside ${IMPORT_DIR}.`);
    let rows;
    try { rows = await readTable(full, { sheet }); } catch (err) { return fail(`Could not read ${file}: ${err.message}`); }
    const { lines, rejected } = kind === 'trial_balance' ? tbFromRows(rows) : jeFromRows(rows);
    if (!lines.length) return fail(`No usable rows in ${file}. Columns found: ${Object.keys(rows[0] || {}).join(', ') || '(none)'}`);
    const check = kind === 'trial_balance' ? checkTB(lines) : checkJE(lines);
    if (!dry_run) save(e.id, kind, lines, { source: `file: ${path.basename(full)}`, check, rejectedRows: rejected.length });
    return json({ engagement: e.id, kind, file: path.basename(full), saved: !dry_run, rows: rows.length, loaded: lines.length, rejected: rejected.slice(0, 30), check, preview: lines.slice(0, 5) });
  });

  server.registerTool('reconcile_je_to_tb', {
    title: 'Reconcile journals to trial balance',
    description: "Completeness check: for each account, the year's journal lines should equal the trial-balance movement (P&L: current-year balance; balance sheet: current minus prior year). Lists differences.",
    inputSchema: { engagement_id: engId, tolerance: z.number().min(0).optional().describe('AED, default 1') },
    annotations: readOnly,
  }, async ({ engagement_id, tolerance = 1 }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const tb = s.trialBalances[e.id], jes = s.journalEntries[e.id];
    if (!tb || !jes) return fail(`Need both a trial balance and journal entries for ${e.id}.`);
    const from = shiftYears(e.yearEnd, -1, 1);
    const inYear = jes.filter((j) => j.date >= from && j.date <= e.yearEnd);
    const sums = new Map();
    for (const j of inYear) sums.set(j.account, (sums.get(j.account) || 0) + j.amount);
    const rows = tb.map((a) => {
      const movement = ['income', 'expense'].includes(a.type) ? a.cy : a.cy - (a.py || 0);
      const journals = sums.get(a.account) || 0;
      return { account: a.account, name: a.name, tbMovement: round(movement), journals: round(journals), difference: round(movement - journals) };
    });
    const diffs = rows.filter((r) => Math.abs(r.difference) > tolerance);
    const unknown = [...sums.keys()].filter((k) => !tb.some((a) => a.account === k));
    return json({ engagement: e.id, period: [from, e.yearEnd], journalLines: inYear.length, accountsReconciled: rows.length - diffs.length, accountsWithDifferences: diffs.length, differences: diffs, journalAccountsNotInTB: unknown,
      note: s.extracts?.[e.id]?.journal_entries ? undefined : 'Journal data is the demo sample, not the full ledger — differences are expected.' });
  });

  server.registerTool('search_gl', {
    title: 'Search the general ledger',
    description: 'Find journal lines by text, account, user, amount or date range (e.g. to vouch a specific transaction or follow up an analytics flag).',
    inputSchema: {
      engagement_id: engId,
      text: z.string().optional().describe('Matches entry number or description'),
      account: z.string().optional(), user: z.string().optional(),
      min_amount: z.number().optional().describe('Absolute amount ≥ this'),
      date_from: z.string().optional(), date_to: z.string().optional(),
      limit: z.number().int().min(1).max(500).optional(),
    },
    annotations: readOnly,
  }, async ({ engagement_id, text, account, user, min_amount, date_from, date_to, limit = 50 }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const t = text?.toLowerCase();
    const hits = (s.journalEntries[e.id] || []).filter((j) =>
      (!t || j.je.toLowerCase().includes(t) || (j.desc || '').toLowerCase().includes(t)) &&
      (!account || j.account === account) && (!user || (j.user || '').toLowerCase() === user.toLowerCase()) &&
      (min_amount == null || Math.abs(j.amount) >= min_amount) && (!date_from || j.date >= date_from) && (!date_to || j.date <= date_to));
    return json({ engagement: e.id, matches: hits.length, lines: hits.slice(0, limit), asOf: today() });
  });

  return server;
}

run(buildServer, { name: 'Audit ERP', defaultPort: 3405 });
