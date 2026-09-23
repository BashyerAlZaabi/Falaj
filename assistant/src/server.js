#!/usr/bin/env node
/* ===== FALAJ assistant — HTTP API (+ serves the web app) =====
     POST /api/chat    { message, history?: [{role:'user'|'assistant', text}], lang?, app? }
                       → { reply, tools: [{name, is_error}] }
     GET  /api/health  → model + connected MCP servers and their tools
     GET  /chat/       → built-in chat page (assistant/web)
     GET  /*           → static files from the repo root (so /app/ works on the same origin)
   Pick the assistant with MCP_CONFIG, e.g. MCP_CONFIG=mcp.audit.json for the audit-firm profile. */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Anthropic from '@anthropic-ai/sdk';
import { McpHub } from './mcp-hub.js';
import { FalajAgent, MODEL } from './agent.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, '..');
const STATIC_ROOT = path.resolve(ROOT, '..');
const PORT = Number(process.env.PORT || 8787);
const ORIGINS = (process.env.ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
const RATE_PER_MIN = Number(process.env.RATE_LIMIT_PER_MIN || 20);
const MAX_HISTORY = 20;

const hub = await McpHub.fromConfig(process.argv[2] || process.env.MCP_CONFIG || path.join(ROOT, 'mcp.config.json'));
const agent = new FalajAgent(hub);

// Tiny per-IP rate limiter so a public deployment can't burn the API key.
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 60_000);
  list.push(now);
  hits.set(ip, list);
  return list.length > RATE_PER_MIN;
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (ORIGINS.includes('*')) res.setHeader('Access-Control-Allow-Origin', '*');
  else if (origin && ORIGINS.includes(origin)) { res.setHeader('Access-Control-Allow-Origin', origin); res.setHeader('Vary', 'Origin'); }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
}

const send = (res, code, data) => { res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(data)); };

async function readJson(req) {
  let body = '';
  for await (const chunk of req) { body += chunk; if (body.length > 200_000) throw new Error('body too large'); }
  return body ? JSON.parse(body) : {};
}

function toHistory(list) {
  if (!Array.isArray(list)) return [];
  const turns = list
    .filter((m) => m && typeof m.text === 'string' && m.text.trim() && (m.role === 'user' || m.role === 'assistant'))
    .slice(-MAX_HISTORY)
    .map((m) => ({ role: m.role, content: m.text.slice(0, 4000) }));
  while (turns.length && turns[0].role !== 'user') turns.shift(); // must start with a user turn
  // Merge consecutive same-role turns so roles alternate.
  const out = [];
  for (const t of turns) {
    if (out.length && out[out.length - 1].role === t.role) out[out.length - 1].content += '\n\n' + t.content;
    else out.push({ ...t });
  }
  if (out.length && out[out.length - 1].role === 'user') out.pop(); // the new message is appended by the agent
  return out;
}

async function handleChat(req, res) {
  const ip = req.socket.remoteAddress || '?';
  if (limited(ip)) return send(res, 429, { error: 'Too many requests — try again in a minute.' });
  let body;
  try { body = await readJson(req); } catch { return send(res, 400, { error: 'Invalid JSON body' }); }
  const message = typeof body.message === 'string' ? body.message.trim().slice(0, 4000) : '';
  if (!message) return send(res, 400, { error: '"message" is required' });
  try {
    const out = await agent.chat(toHistory(body.history), message, { lang: body.lang, app: body.app });
    send(res, 200, { reply: out.text, tools: out.tools.map(({ name, is_error }) => ({ name, is_error })), model: out.model });
  } catch (e) {
    console.error('[chat]', e);
    if (e instanceof Anthropic.AuthenticationError) return send(res, 500, { error: 'Anthropic API key missing or invalid on the server.' });
    if (e instanceof Anthropic.RateLimitError) return send(res, 503, { error: 'The AI service is busy — try again shortly.' });
    if (e instanceof Anthropic.APIError) return send(res, 502, { error: 'The AI service returned an error.' });
    send(res, 500, { error: 'Assistant error' });
  }
}

const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.ico': 'image/x-icon' };
const WEB_ROOT = path.join(ROOT, 'web');
function serveStatic(req, res) {
  let rel = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (rel === '/chat') { res.writeHead(301, { Location: '/chat/' }).end(); return; }
  let base = STATIC_ROOT;
  if (rel.startsWith('/chat/')) { base = WEB_ROOT; rel = rel.slice('/chat'.length); }
  if (rel.endsWith('/')) rel += 'index.html';
  const file = path.resolve(base, '.' + rel);
  const inside = path.relative(base, file);
  if (inside.startsWith('..') || path.isAbsolute(inside) || inside.split(path.sep).some((p) => p.startsWith('.') || p === 'node_modules') || (base === STATIC_ROOT && inside.split(path.sep)[0] === 'assistant')) {
    res.writeHead(404).end(); return;
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404).end('not found'); return; }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  cors(req, res);
  if (req.method === 'OPTIONS') { res.writeHead(204).end(); return; }
  const url = req.url.split('?')[0];
  if (url === '/api/health') return send(res, 200, { ok: true, model: MODEL, mcp: hub.summary() });
  if (url === '/api/chat' && req.method === 'POST') return handleChat(req, res);
  if (req.method === 'GET') return serveStatic(req, res);
  res.writeHead(405).end();
});

server.listen(PORT, () => {
  console.error(`Assistant "${hub.name}" on http://localhost:${PORT}  (chat: http://localhost:${PORT}/chat/, FALAJ app: /app/)`);
});

const shutdown = async () => { server.close(); await hub.close(); process.exit(0); };
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
