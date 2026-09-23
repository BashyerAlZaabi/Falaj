/* ===== MCP hub — connects the assistant to every MCP server in mcp.config.json =====
   Config uses the same shape as Claude Desktop / Claude Code:
     { "mcpServers": {
         "falaj":  { "command": "node", "args": ["mcp/falaj-server.js"] },        ← local (stdio)
         "remote": { "url": "https://host/mcp", "headers": { "Authorization": "Bearer ${TOKEN}" } } ← remote (HTTP)
     } }
   Optional "assistant": { "profile": "profiles/x.md" } sets the assistant's system prompt.
   "${VAR}" inside any string is replaced with the environment variable VAR.
   Each MCP tool is exposed to Claude as "<server>__<tool>". */
import fs from 'node:fs';
import path from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';

const SEP = '__';

function expandEnv(value) {
  if (typeof value === 'string') return value.replace(/\$\{(\w+)\}/g, (_, k) => process.env[k] ?? '');
  if (Array.isArray(value)) return value.map(expandEnv);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expandEnv(v)]));
  return value;
}

// Claude tool names must match ^[a-zA-Z0-9_-]{1,128}$
const safeName = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '_');

export class McpHub {
  constructor() {
    this.servers = new Map(); // name → { client, tools: [...] }
    this.routes = new Map();  // claude tool name → { server, tool }
    this.errors = {};
  }

  static async fromConfig(configPath) {
    const hub = new McpHub();
    const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const baseDir = path.dirname(path.resolve(configPath));
    hub.name = raw.assistant?.name || path.basename(configPath, '.json');
    hub.suggestions = raw.assistant?.suggestions || [];
    if (raw.assistant?.profile) hub.profilePrompt = fs.readFileSync(path.resolve(baseDir, raw.assistant.profile), 'utf8').trim();
    const entries = Object.entries(raw.mcpServers || {}).filter(([, c]) => !c.disabled);
    await Promise.all(entries.map(([name, cfg]) => hub.connect(name, expandEnv(cfg), baseDir)));
    return hub;
  }

  async connect(name, cfg, baseDir) {
    try {
      const transport = cfg.url
        ? new StreamableHTTPClientTransport(new URL(cfg.url), { requestInit: { headers: cfg.headers || {} } })
        : new StdioClientTransport({
            command: cfg.command,
            args: cfg.args || [],
            env: { ...process.env, ...(cfg.env || {}) },
            cwd: cfg.cwd ? path.resolve(baseDir, cfg.cwd) : baseDir,
            stderr: 'inherit',
          });
      const client = new Client({ name: 'falaj-assistant', version: '1.0.0' });
      await client.connect(transport);
      const tools = [];
      let cursor;
      do {
        const page = await client.listTools(cursor ? { cursor } : undefined);
        tools.push(...page.tools);
        cursor = page.nextCursor;
      } while (cursor);
      this.servers.set(name, { client, tools });
      for (const t of tools) this.routes.set(safeName(`${name}${SEP}${t.name}`).slice(0, 128), { server: name, tool: t.name });
      console.error(`[mcp] ${name}: ${tools.length} tool(s)`);
    } catch (e) {
      this.errors[name] = String(e.message || e);
      console.error(`[mcp] ${name}: failed to connect — ${this.errors[name]}`);
    }
  }

  /** Tools in Claude API format, sorted so the request prefix stays cacheable. */
  claudeTools() {
    const out = [];
    for (const [claudeName, { server, tool }] of this.routes) {
      const def = this.servers.get(server).tools.find((t) => t.name === tool);
      out.push({
        name: claudeName,
        description: `[${server}] ${def.description || def.title || tool}`,
        input_schema: cleanSchema(def.inputSchema),
      });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Run a tool and return { content, is_error } ready for a Claude tool_result block. */
  async call(claudeName, input) {
    const route = this.routes.get(claudeName);
    let out;
    if (!route) out = { content: `Unknown tool ${claudeName}`, is_error: true };
    else {
      try {
        const res = await this.servers.get(route.server).client.callTool({ name: route.tool, arguments: input || {} });
        out = { content: toClaudeContent(res), is_error: !!res.isError };
      } catch (e) {
        out = { content: `Tool ${claudeName} failed: ${e.message || e}`, is_error: true };
      }
    }
    this.trail({ tool: claudeName, input, is_error: out.is_error });
    return out;
  }

  /** Append-only audit trail of every tool call (TOOL_LOG_FILE), without tool outputs. */
  trail(entry) {
    const file = process.env.TOOL_LOG_FILE;
    if (!file) return;
    try { fs.appendFileSync(file, JSON.stringify({ at: new Date().toISOString(), ...entry }) + '\n'); }
    catch (e) { console.error(`[mcp] could not write ${file}: ${e.message}`); }
  }

  summary() {
    return {
      name: this.name,
      suggestions: this.suggestions,
      servers: [...this.servers].map(([name, s]) => ({ name, tools: s.tools.map((t) => t.name) })),
      errors: this.errors,
    };
  }

  async close() {
    await Promise.all([...this.servers.values()].map((s) => s.client.close().catch(() => {})));
  }
}

function cleanSchema(schema) {
  const { $schema, ...rest } = schema || {};
  return { type: 'object', properties: {}, ...rest };
}

// MCP tool result → Claude tool_result content blocks.
function toClaudeContent(res) {
  const blocks = [];
  for (const c of res.content || []) {
    if (c.type === 'text') blocks.push({ type: 'text', text: c.text });
    else if (c.type === 'image') blocks.push({ type: 'image', source: { type: 'base64', media_type: c.mimeType, data: c.data } });
    else if (c.type === 'resource' && c.resource?.text) blocks.push({ type: 'text', text: c.resource.text });
    else blocks.push({ type: 'text', text: JSON.stringify(c) });
  }
  if (!blocks.length && res.structuredContent) blocks.push({ type: 'text', text: JSON.stringify(res.structuredContent) });
  return blocks.length ? blocks : [{ type: 'text', text: '(no output)' }];
}
