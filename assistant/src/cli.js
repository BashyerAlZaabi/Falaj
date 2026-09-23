#!/usr/bin/env node
/* ===== Assistant — terminal chat =====   npm run chat   (MCP_CONFIG=mcp.audit.json npm run chat) */
import path from 'node:path';
import readline from 'node:readline/promises';
import { fileURLToPath } from 'node:url';
import { McpHub } from './mcp-hub.js';
import { FalajAgent, MODEL } from './agent.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const hub = await McpHub.fromConfig(process.argv[2] || process.env.MCP_CONFIG || path.join(root, 'mcp.config.json'));
const agent = new FalajAgent(hub);
const tools = hub.claudeTools().map((t) => t.name);
console.log(`\n🤖 ${hub.name} assistant (${MODEL}) — ${tools.length} MCP tool(s). Type "exit" to quit.\n`);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
let history = [];
while (true) {
  const q = (await rl.question('أنت › ')).trim();
  if (!q) continue;
  if (q === 'exit' || q === 'خروج') break;
  try {
    const out = await agent.chat(history, q, {}, (ev) => { if (ev.type === 'tool') console.log(`   ⚙️  ${ev.name} ${JSON.stringify(ev.input)}`); });
    console.log(`\nالمساعد › ${out.text}\n`);
    history = out.messages;
  } catch (e) {
    console.error(`\n⚠️  ${e.message || e}\n`);
  }
}
rl.close();
await hub.close();
