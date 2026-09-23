#!/usr/bin/env node
/* ===== Audit MCP server #3 — People, time & independence =====
   Staff directory, budget vs actual hours, time logging and the independence register.
   Stands in for the firm's HR / time & billing / independence-compliance systems. */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { staff, timeEntries, declarations, findEngagement, findStaff, TODAY } from './data.js';

const engId = z.string().describe('Engagement id, e.g. "ENG-001"');
const readOnly = { readOnlyHint: true };

function buildServer() {
  const server = new McpServer({ name: 'audit-people', version: '1.0.0' });

  server.registerTool('list_staff', {
    title: 'Staff directory',
    description: 'Audit staff with grade, hourly charge-out rate (AED) and skills. Optionally filter by skill.',
    inputSchema: { skill: z.string().optional() },
    annotations: readOnly,
  }, async ({ skill }) => json(staff.filter((s) => !skill || s.skills.some((k) => k.toLowerCase().includes(skill.toLowerCase())))));

  server.registerTool('engagement_hours', {
    title: 'Budget vs actual hours',
    description: 'Hours and cost charged to an engagement per staff member against the budget.',
    inputSchema: { engagement_id: engId },
    annotations: readOnly,
  }, async ({ engagement_id }) => {
    const e = findEngagement(engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const by = {};
    for (const t of timeEntries.filter((x) => x.engagement === e.id)) by[t.staff] = (by[t.staff] || 0) + t.hours;
    const rows = Object.entries(by).map(([id, hours]) => { const s = findStaff(id); return { staff: s.name, grade: s.grade, hours, cost: hours * s.rate }; });
    const actual = rows.reduce((a, r) => a + r.hours, 0);
    return json({ engagement: e.id, phase: e.phase, budgetHours: e.budgetHours, actualHours: actual, usedPct: +(100 * actual / e.budgetHours).toFixed(1), cost: rows.reduce((a, r) => a + r.cost, 0), byStaff: rows });
  });

  server.registerTool('log_time', {
    title: 'Log time',
    description: 'Record hours for a staff member on an engagement. Writes to time & billing — only when the user asks.',
    inputSchema: {
      staff: z.string().describe('Staff id (e.g. "S03") or full name'),
      engagement_id: engId,
      hours: z.number().positive().max(24),
      description: z.string().optional(),
      date: z.string().optional().describe('YYYY-MM-DD, defaults to today'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false },
  }, async ({ staff: who, engagement_id, hours, description, date }) => {
    const s = findStaff(who);
    const e = findEngagement(engagement_id);
    if (!s) return fail(`Unknown staff "${who}".`);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const entry = { staff: s.id, engagement: e.id, hours, date: date || TODAY, description: description || '' };
    timeEntries.push(entry);
    return json({ logged: true, ...entry, staffName: s.name });
  });

  server.registerTool('independence_check', {
    title: 'Independence check',
    description: 'Check the engagement team (or one person) against the independence register for relationships with the client (financial interests, family, employment). Returns any conflicts.',
    inputSchema: { engagement_id: engId, staff: z.string().optional().describe('Check only this staff id or name') },
    annotations: readOnly,
  }, async ({ engagement_id, staff: who }) => {
    const e = findEngagement(engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const team = [e.partner, e.manager, ...e.team];
    const ids = who ? [findStaff(who)?.id].filter(Boolean) : team;
    if (!ids.length) return fail(`Unknown staff "${who}".`);
    const conflicts = declarations
      .filter((d) => ids.includes(d.staff) && d.client === e.client)
      .map((d) => ({ ...d, staffName: findStaff(d.staff).name, onTeam: team.includes(d.staff) }));
    return json({ engagement: e.id, client: e.client, checked: ids.map((id) => findStaff(id).name), conflicts, clear: conflicts.length === 0 });
  });

  return server;
}

run(buildServer, { name: 'Audit people', defaultPort: 3403 });
