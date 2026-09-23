#!/usr/bin/env node
/* ===== Audit MCP server #2 — Data analytics =====
   Trial balance, analytical review, journal-entry testing, materiality and sampling.
   Stands in for the firm's audit data-analytics platform fed by client ERP extracts. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { trialBalances, journalEntries, findEngagement } from './data.js';

const engId = z.string().describe('Engagement id, e.g. "ENG-001"');
const readOnly = { readOnlyHint: true };
const APPROVAL_LIMIT = 500_000;   // client's single-approver limit (AED)
const SENIOR_USERS = ['cfo', 'ceo', 'fin.director'];
const EXPECTED_POSTERS = ['ar.clerk', 'ap.clerk', 'payroll', 'fin.manager', 'wh.controller', 'cfo'];

const JE_TESTS = {
  round_amount: { label: 'Round amount (multiple of 100,000)', test: (j) => Math.abs(j.amount) >= 100_000 && Math.abs(j.amount) % 100_000 === 0 },
  just_below_limit: { label: `Just below the ${APPROVAL_LIMIT.toLocaleString()} approval limit`, test: (j) => Math.abs(j.amount) >= APPROVAL_LIMIT * 0.95 && Math.abs(j.amount) < APPROVAL_LIMIT },
  period_end: { label: 'Posted in the last 5 days of the year or after year end', test: (j, e) => { const d = (new Date(j.date) - new Date(e.yearEnd)) / 86_400_000; return d > -5; } },
  weekend: { label: 'Posted on a weekend (Sat/Sun)', test: (j) => [0, 6].includes(new Date(j.date).getUTCDay()) },
  senior_manual: { label: 'Manual entry by senior management', test: (j) => j.source === 'manual' && SENIOR_USERS.includes(j.user) },
  unexpected_user: { label: 'Posted by a user who normally does not post journals', test: (j) => !EXPECTED_POSTERS.includes(j.user) },
  revenue_debit: { label: 'Manual debit to revenue', test: (j, _e, tb) => j.source === 'manual' && j.amount > 0 && tb.find((a) => a.account === j.account)?.type === 'income' },
};

function data(id) {
  const e = findEngagement(id);
  if (!e) return { error: `Unknown engagement "${id}".` };
  const tb = trialBalances[e.id];
  if (!tb) return { error: `No ERP extract loaded for ${e.id} (${e.client}) yet.` };
  return { e, tb, jes: journalEntries[e.id] || [] };
}

// Deterministic PRNG so the same seed gives the same sample (re-performable).
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32); }

function buildServer() {
  const server = new McpServer({ name: 'audit-analytics', version: '1.0.0' });

  server.registerTool('get_trial_balance', {
    title: 'Trial balance',
    description: 'Client trial balance (AED) for current and prior year. Credits are negative.',
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const d = data(engagement_id);
    return d.error ? fail(d.error) : json({ engagement: d.e.id, client: d.e.client, yearEnd: d.e.yearEnd, accounts: d.tb });
  });

  server.registerTool('analytical_review', {
    title: 'Analytical review (YoY variances)',
    description: 'Year-on-year fluctuation analysis. Flags accounts whose change exceeds both the % threshold and the amount threshold (defaults: 10% and performance materiality).',
    inputSchema: {
      engagement_id: engId,
      threshold_pct: z.number().min(0).optional(),
      threshold_amount: z.number().min(0).optional().describe('AED'),
    },
    annotations: readOnly,
  }, async ({ engagement_id, threshold_pct = 10, threshold_amount }) => {
    const d = data(engagement_id);
    if (d.error) return fail(d.error);
    const amt = threshold_amount ?? d.e.materiality?.performance ?? 0;
    const rows = d.tb.map((a) => {
      const change = a.cy - a.py;
      const pct = a.py ? (100 * change) / Math.abs(a.py) : null;
      return { account: a.account, name: a.name, cy: a.cy, py: a.py, change, pct: pct == null ? null : +pct.toFixed(1) };
    });
    const flagged = rows.filter((r) => Math.abs(r.change) >= amt && (r.pct == null || Math.abs(r.pct) >= threshold_pct));
    return json({ engagement: d.e.id, thresholds: { pct: threshold_pct, amount: amt }, flagged, allAccounts: rows });
  });

  server.registerTool('journal_entry_testing', {
    title: 'Journal-entry testing',
    description: `Run risk-based tests over the journal entries (management-override procedures). Available tests: ${Object.keys(JE_TESTS).join(', ')}. Defaults to all.`,
    inputSchema: {
      engagement_id: engId,
      tests: z.array(z.enum(Object.keys(JE_TESTS))).optional(),
    },
    annotations: readOnly,
  }, async ({ engagement_id, tests }) => {
    const d = data(engagement_id);
    if (d.error) return fail(d.error);
    const run = tests?.length ? tests : Object.keys(JE_TESTS);
    const flagged = [];
    for (const j of d.jes) {
      const hits = run.filter((t) => JE_TESTS[t].test(j, d.e, d.tb));
      if (hits.length) flagged.push({ ...j, flags: hits, riskScore: hits.length });
    }
    flagged.sort((a, b) => b.riskScore - a.riskScore || Math.abs(b.amount) - Math.abs(a.amount));
    return json({
      engagement: d.e.id, population: d.jes.length, testsRun: run.map((t) => ({ test: t, description: JE_TESTS[t].label, hits: flagged.filter((f) => f.flags.includes(t)).length })),
      flagged,
    });
  });

  server.registerTool('calculate_materiality', {
    title: 'Calculate materiality',
    description: 'Suggest overall, performance (75%) and clearly-trivial (5%) materiality from a benchmark using common percentage ranges. Professional judgement still applies.',
    inputSchema: {
      benchmark: z.enum(['profit before tax', 'revenue', 'total assets', 'equity', 'expenses']),
      amount: z.number().positive().describe('Benchmark amount in AED'),
      percentage: z.number().positive().optional().describe('Override the default % for the benchmark'),
    },
    annotations: readOnly,
  }, async ({ benchmark, amount, percentage }) => {
    const ranges = { 'profit before tax': [5, 10], revenue: [0.5, 1], 'total assets': [1, 2], equity: [1, 2], expenses: [0.5, 1] };
    const [lo, hi] = ranges[benchmark];
    const pct = percentage ?? lo;
    const overall = Math.round((amount * pct) / 100);
    return json({ benchmark, amount, typicalRangePct: [lo, hi], pctUsed: pct, overall, performance: Math.round(overall * 0.75), clearlyTrivial: Math.round(overall * 0.05) });
  });

  server.registerTool('select_sample', {
    title: 'Select an audit sample',
    description: 'Pick journal entries for detailed testing. method "random" (seeded, re-performable) or "largest" (top items by value). Optionally restrict to one account.',
    inputSchema: {
      engagement_id: engId,
      size: z.number().int().min(1).max(100),
      method: z.enum(['random', 'largest']).optional(),
      account: z.string().optional().describe('GL account number, e.g. "4000"'),
      seed: z.number().int().optional(),
    },
    annotations: readOnly,
  }, async ({ engagement_id, size, method = 'random', account, seed = 2026 }) => {
    const d = data(engagement_id);
    if (d.error) return fail(d.error);
    let pop = d.jes.filter((j) => !account || j.account === account);
    if (method === 'largest') pop = [...pop].sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
    else { const r = rng(seed); pop = pop.map((j) => [r(), j]).sort((a, b) => a[0] - b[0]).map((x) => x[1]); }
    return json({ engagement: d.e.id, method, seed: method === 'random' ? seed : undefined, populationSize: pop.length, sample: pop.slice(0, size) });
  });

  return server;
}

run(buildServer, { name: 'Audit analytics', defaultPort: 3402 });
