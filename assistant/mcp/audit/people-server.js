#!/usr/bin/env node
/* ===== Audit MCP server — People & independence =====
   Staff directory and the independence register. Stands in for the firm's HR system
   and its independence / conflicts-check tool. (Time & fees live in billing-server.js.) */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { json, fail, run } from '../lib/serve.js';
import { load, findEngagement, findStaff } from './store.js';

const readOnly = { readOnlyHint: true };

function buildServer() {
  const server = new McpServer({ name: 'audit-people', version: '1.1.0' });

  server.registerTool('list_staff', {
    title: 'Staff directory',
    description: 'Audit staff with grade, hourly charge-out rate (AED), skills and the engagements they are assigned to. Optionally filter by skill.',
    inputSchema: { skill: z.string().optional() },
    annotations: readOnly,
  }, async ({ skill }) => {
    const s = load();
    return json(s.staff
      .filter((x) => !skill || x.skills.some((k) => k.toLowerCase().includes(skill.toLowerCase())))
      .map((x) => ({ ...x, engagements: s.engagements.filter((e) => [e.partner, e.manager, ...e.team].includes(x.id)).map((e) => e.id) })));
  });

  server.registerTool('independence_check', {
    title: 'Independence check',
    description: 'Check the engagement team (or one person) against the independence register for relationships with the client (financial interests, family, employment). Returns any conflicts. Overdue audit fees are a separate self-interest threat — see billing fee_debtors.',
    inputSchema: {
      engagement_id: z.string().describe('Engagement id, e.g. "ENG-001"'),
      staff: z.string().optional().describe('Check only this staff id or name'),
    },
    annotations: readOnly,
  }, async ({ engagement_id, staff: who }) => {
    const s = load();
    const e = findEngagement(s, engagement_id);
    if (!e) return fail(`Unknown engagement "${engagement_id}".`);
    const team = [e.partner, e.manager, ...e.team];
    const ids = who ? [findStaff(s, who)?.id].filter(Boolean) : team;
    if (!ids.length) return fail(`Unknown staff "${who}".`);
    const conflicts = s.declarations
      .filter((d) => ids.includes(d.staff) && d.client === e.client)
      .map((d) => ({ ...d, staffName: findStaff(s, d.staff).name, onTeam: team.includes(d.staff) }));
    return json({ engagement: e.id, client: e.client, checked: ids.map((id) => findStaff(s, id).name), conflicts, clear: conflicts.length === 0 });
  });

  return server;
}

run(buildServer, { name: 'Audit people', defaultPort: 3403 });
