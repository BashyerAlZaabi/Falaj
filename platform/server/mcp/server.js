// MCP endpoint (Streamable HTTP, JSON-RPC 2.0, JSON responses).
// Authenticated per user (session cookie or Bearer personal token); tools run
// through the same executor, so permissions, validation, confirmation and
// idempotency apply identically. No Vault tools exist here.
import { publicTools } from './tools.js';
import { executeTool, allowedToolNames } from '../ai/executor.js';

const PROTOCOL = '2025-06-18';

export async function handleMcp(req, res) {
  const user = req.user;
  const msgs = Array.isArray(req.body) ? req.body : [req.body];
  const out = [];
  for (const m of msgs) {
    if (!m || m.jsonrpc !== '2.0' || typeof m.method !== 'string') { out.push({ jsonrpc: '2.0', id: m?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }); continue; }
    const reply = (result) => m.id !== undefined && out.push({ jsonrpc: '2.0', id: m.id, result });
    const fail = (code, message) => m.id !== undefined && out.push({ jsonrpc: '2.0', id: m.id, error: { code, message } });
    try {
      switch (m.method) {
        case 'initialize':
          reply({ protocolVersion: PROTOCOL, capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'smart-work-platform', version: '1.0.0' }, instructions: 'Tools act within the authenticated user scope. Vault (FS, Marsad) content is not reachable from this server.' });
          break;
        case 'notifications/initialized': break;
        case 'ping': reply({}); break;
        case 'tools/list': {
          const allowed = allowedToolNames(user);
          reply({ tools: publicTools().filter((t) => allowed.has(t.name)).map((t) => ({ name: t.name, description: t.description, inputSchema: t.input_schema, annotations: { destructiveHint: !!t.destructive, readOnlyHint: !t.mutates } })) });
          break;
        }
        case 'tools/call': {
          const { name, arguments: args = {}, _meta } = m.params || {};
          const r = await executeTool(user, name, args, { source: 'mcp', requestId: _meta?.requestId || (m.id != null ? `mcp:${m.id}` : undefined), confirmed: false });
          const payload = r.status === 'ok' ? r.result : r.status === 'needs_confirmation' ? { needs_confirmation: r.confirmation, message: 'Confirm in the Unified Portal before it is executed.' } : { error: r.error };
          reply({ content: [{ type: 'text', text: JSON.stringify(payload) }], structuredContent: { status: r.status, ...(r.status === 'ok' ? { result: r.result } : payload) }, isError: r.status === 'error' });
          break;
        }
        default: fail(-32601, `Method not found: ${m.method}`);
      }
    } catch (e) { fail(-32603, e.message); }
  }
  if (!out.length) return res.status(202).end();
  res.json(Array.isArray(req.body) ? out : out[0]);
}
