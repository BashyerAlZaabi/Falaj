/* Shared launcher for the MCP servers in this folder.
     node <server>.js          → stdio (local clients: this assistant, Claude Desktop, Claude Code)
     node <server>.js --http   → Streamable HTTP on MCP_PORT (default given per server) at /mcp
   Set MCP_AUTH_TOKEN to require "Authorization: Bearer <token>" on HTTP. */
import http from 'node:http';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

export const json = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
export const fail = (msg) => ({ content: [{ type: 'text', text: msg }], isError: true });

export async function serve(buildServer, { name, defaultPort }) {
  if (!process.argv.includes('--http')) {
    await buildServer().connect(new StdioServerTransport());
    console.error(`${name} MCP server running on stdio`);
    return;
  }
  const port = Number(process.env.MCP_PORT || defaultPort);
  const token = process.env.MCP_AUTH_TOKEN || '';
  http.createServer(async (req, res) => {
    if (!req.url.startsWith('/mcp')) { res.writeHead(404).end(); return; }
    if (token && req.headers.authorization !== `Bearer ${token}`) { res.writeHead(401).end('unauthorized'); return; }
    if (req.method !== 'POST') { res.writeHead(405, { Allow: 'POST' }).end(); return; }
    // Stateless mode: a fresh server + transport per request (data modules stay in memory).
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
  }).listen(port, () => console.error(`${name} MCP server on http://localhost:${port}/mcp`));
}

export function run(buildServer, opts) {
  serve(buildServer, opts).catch((e) => { console.error(e); process.exit(1); });
}
