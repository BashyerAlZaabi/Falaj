// Execution pipeline for one tool call:
//  select tool -> agent/role check -> validate input -> confirmation gate
//  -> execute (policy enforced in services) -> verify & persist -> log with undo.
import crypto from 'node:crypto';
import { one, all, run, uid, json, now } from '../db.js';
import { toolByName, validate } from '../mcp/tools.js';
import { canAccess } from '../systems/registry.js';
import { aiAllowed } from '../systems/kit.js';

export function agentsFor(user) {
  // External identities (auditors, providers) never get Ask AI / MCP agents.
  if (user.user_type === 'external') return [];
  return all('SELECT * FROM agents WHERE enabled=1').map((a) => ({ ...a, tools: JSON.parse(a.tools), allowed_roles: JSON.parse(a.allowed_roles) }))
    .filter((a) => a.allowed_roles.includes(user.role) && (!a.system || canAccess(user, a.system)));
}

export function agentForTool(user, toolName) {
  return agentsFor(user).find((a) => a.tools.includes(toolName)) || null;
}

// Tools offered to Ask AI / MCP: allowed by an agent for the user's role and not
// blocked by the data-domain AI policy.
export function allowedToolNames(user) {
  const s = new Set();
  for (const a of agentsFor(user)) for (const t of a.tools) { const tool = toolByName.get(t); if (tool?.domain && !aiAllowed(user, tool.domain)) continue; s.add(t); }
  return s;
}

const hash = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 24);

// ctx: { conversationId, requestId, voice, confirmed, source: 'assistant'|'mcp'|'api' }
export async function executeTool(user, name, input = {}, ctx = {}) {
  const tool = toolByName.get(name);
  if (!tool || (tool.internal && !ctx.internal)) return { status: 'error', code: 'unknown_tool', error: `أداة غير معروفة: ${name}` };
  let agent = null;
  if (!tool.internal) {
    agent = agentForTool(user, name);
    if (!agent) return { status: 'error', code: 'forbidden', error: 'لا يوجد مساعد مصرّح له بتنفيذ هذه الأداة لدورك' };
  }
  // Data-domain AI policy: Ask AI and MCP clients may only touch a system's data
  // when its domain allows it (or the user opted in). Direct UI actions are the
  // user's own and are governed by the system's authorisation alone.
  if (tool.domain && ['assistant', 'mcp', 'office'].includes(ctx.source) && !aiAllowed(user, tool.domain)) {
    return { status: 'error', code: 'ai_policy', error: 'سياسة البيانات لا تسمح للمساعد الذكي بالوصول إلى هذا النوع من البيانات. يمكنك فتح النظام مباشرة، أو تفعيل الوصول من «مركز التكامل والتحكم» إن كانت السياسة تسمح بذلك.' };
  }
  const errors = validate(tool.input_schema, input);
  if (errors.length) return { status: 'error', code: 'bad_input', error: `مدخلات غير صالحة: ${errors.join('; ')}` };

  // Idempotency per (request, tool, input): replays return the stored outcome.
  const fingerprint = ctx.requestId ? `${ctx.requestId}:${name}:${hash(input)}` : null;
  if (fingerprint && tool.mutates) {
    const prev = one("SELECT * FROM actions WHERE user_id=? AND request_id=? AND status='ok'", user.id, fingerprint);
    if (prev) return { status: 'ok', replayed: true, actionId: prev.id, result: json(prev.result), undoable: !!prev.undo && !prev.undone_at, agent: prev.agent };
  }

  // Confirmation gate: deletion, permission changes, external sharing,
  // or uncertain impactful values captured by voice.
  const voiceFields = ctx.voice && tool.voiceSensitive?.filter((f) => input[f] !== undefined);
  const needs = tool.destructive || (voiceFields?.length ? 'voice_value' : null);
  if (needs && !ctx.confirmed) {
    const id = uid('cf_');
    let summary = tool.summarize ? tool.summarize(user, input) : `${name} ${JSON.stringify(input)}`;
    if (needs === 'voice_value') {
      const FIELD = { progress: ['نسبة الإنجاز', '%'], due_date: ['تاريخ الاستحقاق', ''], start_date: ['تاريخ البدء', ''], assignee_id: ['المسؤول', ''] };
      const target = name === 'update_project' ? one('SELECT name FROM projects WHERE id=?', input.id)?.name : name === 'update_task' ? one('SELECT title FROM tasks WHERE id=?', input.id)?.title : null;
      const val = (f) => (f === 'assignee_id' ? one('SELECT name_ar FROM users WHERE id=?', input[f])?.name_ar || input[f] : `${input[f]}${FIELD[f]?.[1] || ''}`);
      summary = `سمعتُ: ${voiceFields.map((f) => `${FIELD[f]?.[0] || f} = ${val(f)}`).join('، ')}${target ? ` لـ«${target}»` : ''}. هل هذه القيمة صحيحة؟`;
    }
    run('INSERT INTO confirmations (id,user_id,conversation_id,tool,agent,input,summary,reason,expires_at) VALUES (?,?,?,?,?,?,?,?,?)',
      id, user.id, ctx.conversationId || null, name, agent?.key || null, JSON.stringify(input), summary, needs, new Date(Date.now() + 15 * 60e3).toISOString());
    return { status: 'needs_confirmation', confirmation: { id, summary, reason: needs, tool: name }, agent: agent?.key };
  }

  try {
    const out = await tool.handler(user, input, ctx);
    const actionId = uid('ac_');
    if (tool.mutates) {
      run('INSERT INTO actions (id,user_id,conversation_id,request_id,tool,agent,input,result,undo,status) VALUES (?,?,?,?,?,?,?,?,?,?)',
        actionId, user.id, ctx.conversationId || null, fingerprint, name, agent?.key || null, JSON.stringify(input),
        JSON.stringify(out.result ?? null).slice(0, 200000), out.undo ? JSON.stringify(out.undo) : null, 'ok');
    }
    return { status: 'ok', actionId: tool.mutates ? actionId : null, result: out.result, undoable: !!out.undo, open_document: out.open_document, agent: agent?.key };
  } catch (e) {
    if (tool.mutates) {
      run('INSERT INTO actions (id,user_id,conversation_id,request_id,tool,agent,input,result,status) VALUES (?,?,?,?,?,?,?,?,?)',
        uid('ac_'), user.id, ctx.conversationId || null, null, name, agent?.key || null, JSON.stringify(input), JSON.stringify({ error: e.message }), 'failed');
    }
    if (!e.status) console.error('[tool]', name, e);
    return { status: 'error', code: e.code || 'failed', error: e.status ? e.message : `تعذّر التنفيذ: ${e.message}` };
  }
}

export async function undoAction(user, actionId) {
  const a = one('SELECT * FROM actions WHERE id=? AND user_id=?', actionId, user.id);
  if (!a) return { status: 'error', error: 'الإجراء غير موجود' };
  if (a.undone_at) return { status: 'error', error: 'تم التراجع عن هذا الإجراء مسبقاً' };
  const undo = json(a.undo);
  if (!undo) return { status: 'error', error: 'هذا الإجراء غير قابل للتراجع' };
  const r = await executeTool(user, undo.tool, undo.input, { internal: true, confirmed: true, source: 'undo' });
  if (r.status === 'ok') run('UPDATE actions SET undone_at=? WHERE id=?', now(), actionId);
  return r;
}

export async function resolveConfirmation(user, id, accept) {
  const c = one("SELECT * FROM confirmations WHERE id=? AND user_id=?", id, user.id);
  if (!c) return { status: 'error', error: 'طلب التأكيد غير موجود' };
  if (c.status !== 'pending') return { status: 'error', error: 'تمت معالجة طلب التأكيد مسبقاً', previous: c.status };
  if (c.expires_at < new Date().toISOString()) { run("UPDATE confirmations SET status='expired' WHERE id=?", id); return { status: 'error', error: 'انتهت صلاحية طلب التأكيد' }; }
  // Atomically claim so a double click cannot execute twice.
  const claimed = run("UPDATE confirmations SET status=? WHERE id=? AND status='pending'", accept ? 'confirmed' : 'cancelled', id);
  if (!claimed.changes) return { status: 'error', error: 'تمت معالجة طلب التأكيد مسبقاً' };
  if (!accept) return { status: 'cancelled', confirmation: c };
  const r = await executeTool(user, c.tool, json(c.input), { conversationId: c.conversation_id, confirmed: true, requestId: `confirm:${id}` });
  if (r.status !== 'ok') run("UPDATE confirmations SET status='failed' WHERE id=?", id);
  return { ...r, confirmation: c };
}
