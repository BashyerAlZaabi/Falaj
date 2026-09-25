// Agents Office: user-built agents prepare work; nothing executes before the
// owner reviews and approves; approvals are human-only and single-use.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, login } from './helpers.js';

let S;
before(async () => { S = await startStack(); });
after(async () => { await S?.stop(); });

test('build an agent by chat; it only prepares; approval executes; history + undo', async () => {
  const a = await login(S.portal, 'ahmed');
  const { final } = await a.chat('ابنِ وكيلاً يجهّز ملخص اليوم كل صباح الساعة 7', { ui: { tzOffset: -240 } });
  assert.equal(final.status, 'done');
  const agents = (await a.get('/api/office/agents')).data;
  assert.equal(agents.length, 1);
  assert.equal(agents[0].template, 'daily_briefing');
  assert.deepEqual({ type: agents[0].schedule.type, time: agents[0].schedule.time }, { type: 'daily', time: '07:00' });
  assert.ok(agents[0].next_run_at);
  const docsBefore = (await a.get('/api/documents')).data.length;
  const run = (await a.post(`/api/office/agents/${agents[0].id}/run`)).data;
  assert.equal(run.status, 'awaiting_review');
  assert.equal(run.proposal[0].tool, 'create_document');
  assert.equal((await a.get('/api/documents')).data.length, docsBefore); // nothing executed yet
  // review shows up in the daily summary
  assert.equal((await a.get('/api/summary')).data.counts.pending_reviews, 1);
  // approval via API token is refused (human-only)
  const token = (await a.post('/api/me/tokens', {})).data.token;
  const viaToken = await fetch(`${S.portal}/api/office/runs/${run.id}/approve`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: '{}' });
  assert.equal(viaToken.status, 403);
  // edit the title while approving
  const approved = (await a.post(`/api/office/runs/${run.id}/approve`, { decisions: [{ id: run.proposal[0].id, selected: true, edits: { title: 'ملخصي المعدّل' } }] })).data;
  assert.equal(approved.status, 'completed');
  const docs = (await a.get('/api/documents')).data;
  assert.equal(docs.length, docsBefore + 1);
  assert.ok(docs.some((d) => d.title === 'ملخصي المعدّل'));
  // approving twice cannot execute twice
  assert.equal((await a.post(`/api/office/runs/${run.id}/approve`, {})).status, 409);
  assert.equal((await a.get('/api/documents')).data.length, docsBefore + 1);
  // undo from history
  const it = approved.proposal[0];
  assert.ok(it.undoable);
  assert.equal((await a.post(`/api/actions/${it.actionId}/undo`)).data.status, 'ok');
  assert.equal((await a.get('/api/documents')).data.length, docsBefore);
});

test('overdue escalation: deselected items are skipped; reject executes nothing', async () => {
  const a = await login(S.portal, 'ahmed');
  const created = await a.post('/api/office/agents', { template: 'overdue_escalation', config: { scope: 'mine' }, schedule: { type: 'manual' } });
  assert.equal(created.data.status, 'ok');
  const id = created.data.result.id;
  const run = (await a.post(`/api/office/agents/${id}/run`)).data;
  assert.equal(run.status, 'awaiting_review');
  assert.ok(run.proposal.length >= 2);
  assert.ok(run.proposal.every((i) => i.tool === 'update_task' && i.input.priority === 'urgent'));
  const [keep, skip] = run.proposal;
  const res = (await a.post(`/api/office/runs/${run.id}/approve`, { decisions: [{ id: skip.id, selected: false }] })).data;
  assert.equal(res.proposal.find((i) => i.id === skip.id).status, 'skipped');
  assert.equal(res.proposal.find((i) => i.id === keep.id).status, 'done');
  const tasks = (await a.get('/api/tasks?mine=1')).data;
  assert.equal(tasks.find((t) => t.id === keep.input.id).priority, 'urgent');
  assert.notEqual(tasks.find((t) => t.id === skip.input.id).priority, 'urgent');
  // next run proposes only the remaining one; reject it
  const run2 = (await a.post(`/api/office/agents/${id}/run`)).data;
  assert.equal(run2.proposal.length, run.proposal.length - 1);
  assert.equal((await a.post(`/api/office/runs/${run2.id}/reject`)).data.status, 'rejected');
  assert.notEqual((await a.get('/api/tasks?mine=1')).data.find((t) => t.id === skip.input.id).priority, 'urgent');
});

test('agents act within the owner scope only and cannot use destructive tools', async () => {
  const a = await login(S.portal, 'ahmed');
  // employee cannot target the team scope
  assert.equal((await a.post('/api/office/agents', { template: 'overdue_escalation', config: { scope: 'team' } })).data.status, 'error');
  // recurring task cannot be assigned outside the owner's scope
  assert.equal((await a.post('/api/office/agents', { template: 'recurring_task', config: { title: 'x', assignee_id: 'u_omar' } })).data.status, 'error');
  // another user cannot see or run my agents / runs
  const s = await login(S.portal, 'sara');
  const mine = (await a.get('/api/office/agents')).data[0];
  assert.equal((await s.post(`/api/office/agents/${mine.id}/run`)).status, 404);
  const runs = (await a.get('/api/office/runs')).data;
  assert.equal((await s.get(`/api/office/runs/${runs[0].id}`)).status, 404);
  assert.equal((await s.post(`/api/office/runs/${runs[0].id}/approve`, {})).status, 404);
  // deleting an agent needs explicit confirmation
  assert.equal((await a.del(`/api/office/agents/${mine.id}`)).status, 428);
});

test('recurring task + progress follow-up templates, and the scheduler prepares due agents', async () => {
  const m = await login(S.portal, 'mariam');
  const rt = await m.chat('ابنِ وكيلاً ينشئ مهمة رفع تقرير الإنجاز الأسبوعي كل خميس الساعة 9');
  assert.equal(rt.final.status, 'done');
  const agent = (await m.get('/api/office/agents')).data.find((x) => x.template === 'recurring_task');
  assert.equal(agent.config.title, 'رفع تقرير الإنجاز الأسبوعي');
  assert.equal(agent.schedule.type, 'weekly'); assert.equal(agent.schedule.day, 4); assert.equal(agent.schedule.time, '09:00');
  // "make it daily at 8" right after
  const sch = await m.chat('اجعله يومياً الساعة 8');
  assert.equal(sch.final.status, 'done');
  assert.equal((await m.get('/api/office/agents')).data.find((x) => x.id === agent.id).schedule.type, 'daily');
  // progress follow-up never assumes a percentage: it proposes tasks to ask owners
  const pf = await m.post('/api/office/agents', { template: 'progress_followup', config: { stale_days: 0 }, schedule: { type: 'manual' } });
  const run = (await m.post(`/api/office/agents/${pf.data.result.id}/run`)).data;
  assert.equal(run.status, 'awaiting_review');
  assert.ok(run.proposal.every((i) => i.tool === 'create_task' && !('progress' in i.input)));
  // scheduler: force the recurring agent due, then wait for the tick (test interval is 30s -> call via chat run instead)
  const before = (await m.get('/api/office/runs?status=awaiting_review')).data.length;
  const r = await m.chat('شغّل وكيل مهمة متكررة');
  assert.equal(r.final.status, 'done');
  assert.equal((await m.get('/api/office/runs?status=awaiting_review')).data.length, before + 1);
  const pending = await m.chat('ما الأعمال التي بانتظار موافقتي؟');
  assert.match(pending.final.text, /بانتظار مراجعتك/);
});

test('scheduler: a due agent prepares a proposal automatically (and does not pile up)', async () => {
  const { DatabaseSync } = await import('node:sqlite');
  const o = await login(S.portal, 'omar');
  const c = await o.post('/api/office/agents', { template: 'weekly_plan', schedule: { type: 'daily', time: '06:00', tz_offset: -240 } });
  const id = c.data.result.id;
  const db = new DatabaseSync(`${S.dataDir}/portal.db`);
  db.prepare('UPDATE office_agents SET next_run_at=? WHERE id=?').run(new Date(Date.now() - 60e3).toISOString(), id);
  let runs = [];
  for (let i = 0; i < 30 && !runs.length; i++) { await new Promise((r) => setTimeout(r, 200)); runs = (await o.get(`/api/office/runs?agent_id=${id}`)).data; }
  assert.equal(runs.length, 1);
  assert.equal(runs[0].trigger, 'schedule');
  assert.equal(runs[0].status, 'awaiting_review');
  const agent = (await o.get('/api/office/agents')).data.find((a) => a.id === id);
  assert.ok(agent.next_run_at > new Date().toISOString()); // advanced to the next slot
  // due again while a proposal is still pending -> no second proposal
  db.prepare('UPDATE office_agents SET next_run_at=? WHERE id=?').run(new Date(Date.now() - 60e3).toISOString(), id);
  await new Promise((r) => setTimeout(r, 1200));
  assert.equal((await o.get(`/api/office/runs?agent_id=${id}`)).data.length, 1);
  db.close();
  // an alert was raised for the owner
  assert.ok((await o.get('/api/alerts')).data.some((a) => a.entity === 'office_run'));
});
