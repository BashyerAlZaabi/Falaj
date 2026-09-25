// Gamification: points are derived from real work, reward timeliness, cannot be
// posted by clients, disappear on undo, respect privacy (opt-in board).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, login } from './helpers.js';

let S;
before(async () => { S = await startStack(); });
after(async () => { await S?.stop(); });
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);

test('points come from real work: on-time + early + priority bonuses; undo removes them', async () => {
  const a = await login(S.portal, 'ahmed');
  const g0 = (await a.get('/api/game/me')).data;
  assert.equal(typeof g0.xp, 'number');
  assert.ok(g0.level.n >= 1 && g0.rings.length === 3 && g0.badges.length >= 8);
  const t = (await a.tool('create_task', { title: 'مهمة للنقاط', due_date: day(3), priority: 'high' })).data.result;
  const done = await a.tool('update_task', { id: t.id, status: 'done' });
  assert.equal(done.data.status, 'ok');
  const g1 = (await a.get('/api/game/me')).data;
  // 10 done + 5 on time + 5 early + 5 priority = 25 (plus possibly a quest bonus)
  assert.ok(g1.xp - g0.xp >= 25, `expected ≥25, got ${g1.xp - g0.xp}`);
  assert.ok(g1.recent.some((e) => e.kind === 'early' && e.ref === 'مهمة للنقاط'));
  assert.ok(g1.badges.find((b) => b.key === 'first_step').earned);
  assert.ok(g1.badges.find((b) => b.key === 'service_excellence').earned);
  // undo the completion → the task points disappear (quest memo may remain)
  await a.post(`/api/actions/${done.data.actionId}/undo`);
  const g2 = (await a.get('/api/game/me')).data;
  assert.ok(!g2.recent.some((e) => e.ref === 'مهمة للنقاط' && e.kind !== 'quest'));
});

test('clearing an overdue task earns the backlog bonus and completes the daily quest', async () => {
  const a = await login(S.portal, 'ahmed');
  const g0 = (await a.get('/api/game/me')).data;
  const q = g0.quests.find((x) => x.key === 'clear_overdue');
  assert.ok(q && !q.done); // ahmed has overdue demo tasks
  const overdue = (await a.get('/api/tasks?mine=1&overdue=1')).data[0];
  await a.tool('update_task', { id: overdue.id, status: 'done' });
  const g1 = (await a.get('/api/game/me')).data;
  assert.ok(g1.recent.some((e) => e.kind === 'backlog'));
  assert.ok(g1.quests.find((x) => x.key === 'clear_overdue').done);
  assert.ok(g1.recent.some((e) => e.kind === 'quest' && e.ref === 'clear_overdue'));
  // idempotent: asking again doesn't award the quest twice
  const g2 = (await a.get('/api/game/me')).data;
  assert.equal(g2.recent.filter((e) => e.kind === 'quest' && e.ref === 'clear_overdue').length, 1);
  assert.equal(g2.xp, g1.xp);
});

test('progress transparency counts once per project per day; points cannot be posted by clients', async () => {
  const m = await login(S.portal, 'mariam');
  const g0 = (await m.get('/api/game/me')).data;
  await m.tool('update_project', { id: 'pr_portal', progress: 57 });
  await m.tool('update_project', { id: 'pr_portal', progress: 58 });
  const g1 = (await m.get('/api/game/me')).data;
  assert.equal(g1.recent.filter((e) => e.kind === 'progress').length, 1);
  assert.ok(g1.xp > g0.xp);
  for (const p of ['/api/game/xp', '/api/game/me', '/api/game/award']) assert.ok([404, 405].includes((await m.post(p, { points: 9999 })).status));
  assert.equal((await m.get('/api/game/me')).data.xp, g1.xp);
});

test('daily cap limits farming', async () => {
  const a = await login(S.portal, 'sara');
  for (let i = 0; i < 12; i++) {
    const t = (await a.tool('create_task', { title: `مهمة سريعة ${i}`, due_date: day(5), priority: 'urgent' })).data.result;
    await a.tool('update_task', { id: t.id, status: 'done' });
  }
  const g = (await a.get('/api/game/me')).data;
  assert.ok(g.today_xp <= g.daily_cap);
});

test('privacy: department challenge is aggregate; personal board shows only opted-in colleagues', async () => {
  const a = await login(S.portal, 'ahmed');
  const t0 = (await a.get('/api/game/team')).data;
  assert.ok(t0.departments.length >= 3);
  assert.ok(t0.departments.every((d) => !('people' in d) && d.members >= 1));
  assert.equal(t0.people.length, 0); // nobody opted in yet
  const s = await login(S.portal, 'sara');
  await s.put('/api/game/prefs', { leaderboard_opt_in: true });
  const t1 = (await a.get('/api/game/team')).data;
  assert.deepEqual(t1.people.map((p) => p.id), ['u_sara']); // same department, opted in
  const o = await login(S.portal, 'omar');
  assert.equal((await o.get('/api/game/team')).data.people.length, 0); // other department never sees her
  // the assistant can answer "how many points do I have?"
  const { final } = await a.chat('كم نقاطي؟');
  assert.match(final.text, /نقاط التميّز/);
});
