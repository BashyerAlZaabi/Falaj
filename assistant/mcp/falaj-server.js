#!/usr/bin/env node
/* ===== FALAJ MCP server =====
   Exposes the farm (zones, sensors, fields, weather, market, irrigation) as MCP tools.
   Any MCP client can use it: the FALAJ assistant in this folder, Claude Desktop,
   Claude Code, or a claude.ai custom connector.

     node mcp/falaj-server.js              → stdio (for local clients)
     node mcp/falaj-server.js --http       → Streamable HTTP on :3334/mcp
     MCP_PORT=8080 node mcp/falaj-server.js --http
*/
import http from 'node:http';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import * as farm from './farm-data.js';

const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });
const zoneId = z.string().describe('Zone id, e.g. "Z1"');

function buildServer() {
  const server = new McpServer({ name: 'falaj-farm', version: '1.0.0' });
  const readOnly = { readOnlyHint: true };

  server.registerTool('get_farm_overview', {
    title: 'Farm overview',
    description: 'Summary of the whole farm: every zone with soil moisture and status, zones needing water, devices with problems, and fields.',
    annotations: readOnly,
  }, async () => json(farm.getOverview()));

  server.registerTool('get_zone_details', {
    title: 'Zone sensor readings',
    description: 'Live sensor readings for one farm zone: soil moisture %, temperature °C, humidity %, soil pH and N/P/K nutrient levels (0–100).',
    inputSchema: { zone_id: zoneId },
    annotations: readOnly,
  }, async ({ zone_id }) => {
    const zd = farm.getZone(zone_id);
    return zd ? json(zd) : fail(`Unknown zone "${zone_id}". Valid zones: Z1–Z6.`);
  });

  server.registerTool('list_fields', {
    title: 'Fields',
    description: 'All fields with crop, area (hectares), water level %, expense and revenue in AED, health, planting date and months until harvest.',
    annotations: readOnly,
  }, async () => json(farm.listFields()));

  server.registerTool('list_devices', {
    title: 'IoT devices',
    description: 'Registered FALAJ IoT sensor devices with their zone, location and status (active / offline / error) plus a diagnostic note when not active.',
    annotations: readOnly,
  }, async () => json(farm.listDevices()));

  server.registerTool('get_weather', {
    title: 'Weather',
    description: 'Current weather and tomorrow’s forecast for the farm location, with an irrigation hint.',
    annotations: readOnly,
  }, async () => json(farm.getWeather()));

  server.registerTool('get_market_prices', {
    title: 'Market prices',
    description: 'Today’s UAE wholesale crop prices in AED per kg with weekly change. Optionally filter by crop (tomato, potato, dates, wheat).',
    inputSchema: { crop: z.string().optional().describe('Crop name in English, e.g. "tomato"') },
    annotations: readOnly,
  }, async ({ crop }) => json(farm.getMarket(crop)));

  server.registerTool('recommend_irrigation', {
    title: 'Irrigation recommendation',
    description: 'Compute whether a zone should be irrigated now, for how many minutes, and the best time of day.',
    inputSchema: { zone_id: zoneId },
    annotations: readOnly,
  }, async ({ zone_id }) => {
    const r = farm.recommendIrrigation(zone_id);
    return r ? json(r) : fail(`Unknown zone "${zone_id}".`);
  });

  server.registerTool('start_irrigation', {
    title: 'Start irrigation',
    description: 'Open the drip-irrigation valve of a zone for the given minutes. This changes the farm — only call it when the farmer explicitly asks to irrigate.',
    inputSchema: {
      zone_id: zoneId,
      minutes: z.number().int().min(1).max(120).describe('Irrigation duration in minutes (1–120)'),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false },
  }, async ({ zone_id, minutes }) => {
    const r = farm.startIrrigation(zone_id, minutes);
    return r ? json({ started: true, ...r }) : fail(`Unknown zone "${zone_id}".`);
  });

  server.registerTool('get_irrigation_log', {
    title: 'Irrigation log',
    description: 'Irrigation runs started since the server came up.',
    annotations: readOnly,
  }, async () => json(farm.getIrrigationLog()));

  return server;
}

async function main() {
  if (!process.argv.includes('--http')) {
    await buildServer().connect(new StdioServerTransport());
    console.error('FALAJ MCP server running on stdio');
    return;
  }

  const port = Number(process.env.MCP_PORT || 3334);
  const token = process.env.MCP_AUTH_TOKEN || '';
  http.createServer(async (req, res) => {
    if (!req.url.startsWith('/mcp')) { res.writeHead(404).end(); return; }
    if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('unauthorized'); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    // Stateless mode: a fresh server + transport per request.
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on('close', () => { transport.close(); server.close(); });
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body ? JSON.parse(body) : undefined);
    } catch (e) {
      console.error(e);
      if (!res.headersSent) res.writeHead(400, { 'Content-Type': 'application/json' }).end(JSON.stringify({ error: String(e.message || e) }));
    }
  }).listen(port, () => console.error(`FALAJ MCP server on http://localhost:${port}/mcp`));
}

main().catch((e) => { console.error(e); process.exit(1); });
