#!/usr/bin/env node
/* ===== Audit MCP server #1 — Engagement platform =====
   Engagements, client document requests (PBC lists) and the findings / issues log.
   Stands in for the firm's engagement-management system. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { load, update, findEngagement, findStaff, today } from './store.js';

const engId = z.string().describe('Engagement id, e.g. "ENG-001"');
const readOnly = { readOnlyHint: true };
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86_400_000);
const staffName = (s, id) => findStaff(s, id)?.name || id;

function pbcView(r) {
  const t = today();
  const overdue = r.status !== 'received' && r.due < t;
  return { ...r, overdue, daysOverdue: overdue ? daysBetween(r.due, t) : 0 };
}

function buildServer() {
  const server = new McpServer({ name: 'audit-engagements', version: '1.0.0' });

  server.registerTool('list_engagements', {
    title: 'List engagements',
    description: 'All audit engagements with client, phase, year end, report due date and days left.',
    inputSchema: { phase: z.enum(['planning', 'fieldwork', 'completion']).optional() },
    annotations: readOnly,
  }, async ({ phase }) => {
    const s = load();
    return json(s.engagements
      .filter((e) => !phase || e.phase === phase)
      .map((e) => ({ id: e.id, client: e.client, type: e.type, phase: e.phase, yearEnd: e.yearEnd, reportDue: e.reportDue, daysToReport: daysBetween(today(), e.reportDue), partner: staffName(s, e.partner), manager: staffName(s, e.manager) })));
  });

  server.registerTool('get_engagement', {
    title: 'Engagement details',
    description: 'Full engagement file header: team, budget hours, materiality (overall / performance / clearly trivial, AED), significant risks and deadlines.',
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    return json({ ...e, today: today(), daysToReport: daysBetween(today(), e.reportDue), partner: staffName(s, e.partner), manager: staffName(s, e.manager), team: e.team.map((id) => ({ id, name: staffName(s, id) })) });
  });

  server.registerTool('list_pbc_requests', {
    title: 'Client document requests (PBC)',
    description: 'Prepared-by-client request list for an engagement with status and overdue days. Filter with status or overdue_only.',
    inputSchema: {
      engagement_id: engId,
      status: z.enum(['outstanding', 'partially received', 'received']).optional(),
      overdue_only: z.boolean().optional(),
    },
    annotations: readOnly,
  }, async ({ engagement_id, status, overdue_only }) => json(load().pbcRequests
    .filter((r) => r.engagement.toLowerCase() === engagement_id.toLowerCase())
    .map(pbcView)
    .filter((r) => (!status || r.status === status) && (!overdue_only || r.overdue))));

  server.registerTool('update_pbc_request', {
    title: 'Update a PBC request',
    description: 'Change the status of a client document request (e.g. mark as received). Writes to the engagement file — only when the user asks.',
    inputSchema: {
      request_id: z.string().describe('e.g. "PBC-103"'),
      status: z.enum(['outstanding', 'partially received', 'received']),
      note: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ request_id, status, note }) => {
    const r = update((s) => {
      const x = s.pbcRequests.find((y) => y.id.toLowerCase() === request_id.toLowerCase());
      if (x) Object.assign(x, { status, updated: today() }, note ? { note } : {});
      return x;
    });
    return r ? json(pbcView(r)) : fail(`Unknown request "${request_id}".`);
  });

  server.registerTool('list_findings', {
    title: 'Findings / issues log',
    description: 'Audit findings (misstatements, control deficiencies, judgement issues) with severity and status.',
    inputSchema: { engagement_id: engId.optional(), status: z.enum(['open', 'resolved']).optional() },
    annotations: readOnly,
  }, async ({ engagement_id, status }) => json(load().findings.filter((f) =>
    (!engagement_id || f.engagement.toLowerCase() === engagement_id.toLowerCase()) && (!status || f.status === status))));

  server.registerTool('log_finding', {
    title: 'Log a finding',
    description: 'Add a finding to the engagement issues log. Writes to the engagement file — only when the user asks to record it.',
    inputSchema: {
      engagement_id: engId,
      area: z.string().describe('Audit area, e.g. "Revenue"'),
      title: z.string(),
      severity: z.enum(['low', 'medium', 'high']),
      type: z.enum(['misstatement', 'control deficiency', 'judgement', 'other']),
      amount: z.number().optional().describe('Misstatement amount in AED, if any'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ engagement_id, area, title, severity, type, amount }) => {
    const f = update((s) => {
      const e = findEngagement(s, engagement_id);
      if (!e) return null;
      const x = { id: `F-${String(s.findings.length + 1).padStart(2, '0')}`, engagement: e.id, area, title, severity, status: 'open', type, amount: amount ?? null, logged: today() };
      s.findings.push(x);
      return x;
    });
    return f ? json(f) : fail(`Unknown engagement "${engagement_id}".`);
  });

  server.registerTool('misstatements_vs_materiality', {
    title: 'Unadjusted misstatements vs materiality',
    description: 'Sum open misstatements for an engagement and compare with overall, performance and clearly-trivial materiality.',
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    if (!e.materiality) return fail(`Materiality has not been set for ${e.id} yet (phase: ${e.phase}).`);
    const open = s.findings.filter((f) => f.engagement === e.id && f.status === 'open' && f.type === 'misstatement' && f.amount);
    const total = open.reduce((s, f) => s + Math.abs(f.amount), 0);
    const m = e.materiality;
    return json({
      engagement: e.id, misstatements: open.map(({ id, title, amount }) => ({ id, title, amount })), total,
      materiality: m, pctOfOverall: +(100 * total / m.overall).toFixed(1),
      conclusion: total >= m.overall ? 'exceeds overall materiality — modification of opinion likely unless adjusted'
        : total >= m.performance ? 'above performance materiality — request adjustment and extend testing'
        : total > m.trivial ? 'below performance materiality — report to management and those charged with governance'
        : 'clearly trivial',
    });
  });

  return server;
}

run(buildServer, { name: 'Audit engagements', defaultPort: 3401 });
