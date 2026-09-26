// My Goals (goals): owner-only data, private by default, shared goals visible
// read-only to exactly the line manager / department manager (never the wider
// hierarchy, HR, SPMO or the platform admin), explicit transitions, carry-over,
// confirmations, access log, opt-in Ask AI, workspace and anti-farming points.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import { as, done, stack } from './_stack.js';

after(done);
const G = '/api/sys/goals';
const localToday = () => new Date(Date.now() + 4 * 3600e3).toISOString().slice(0, 10);

test('owners create goals: current period by default, private for short periods, validated input', async () => {
  const ahmed = await as('ahmed');
  const d = await ahmed.post(`${G}/goals`, { title: 'مراجعة سجلات النسخ الاحتياطي', period_type: 'daily' });
  assert.equal(d.status, 200);
  assert.equal(d.data.period_start, localToday());
  assert.equal(d.data.visibility, 'private');
  assert.equal(d.data.status, 'active');
  const m = await ahmed.post(`${G}/goals`, { title: 'إغلاق ملاحظات التدقيق على الخوادم', period_type: 'monthly', objective_code: 'SO-4.2' });
  assert.equal(m.status, 200);
  assert.equal(m.data.visibility, 'manager');
  assert.equal(m.data.objective.code, 'SO-4.2');
  const bad = [
    {}, { title: 'x', period_type: 'daily' }, { title: 'هدف', period_type: 'hourly' }, { title: 'هدف رقمي', period_type: 'weekly', measure: 'numeric' },
    { title: 'قائمة', period_type: 'weekly', measure: 'checklist', items: [] }, { title: 'تجميعي', period_type: 'daily', measure: 'rollup' },
    { title: 'هدف', period_type: 'weekly', objective_code: 'SO-9.9' }, { title: 'هدف قديم', period_type: 'daily', date: '2020-01-01' },
    { title: 'هدف', period_type: 'weekly', parent_id: d.data.id }, { title: 'هدف', period_type: 'daily', owner_id: 'u_sara' },
  ];
  for (const b of bad) assert.equal((await ahmed.post(`${G}/goals`, b)).status, 400, JSON.stringify(b));
  const list = (await ahmed.get(`${G}/goals?scope=current`)).data;
  assert.ok(list.every((g) => g.owner_id === 'u_ahmed'));
  assert.ok(list.some((g) => g.id === d.data.id));
});

test('private goals are invisible to everyone else; shared goals only to the line manager and department manager', async () => {
  const shared = 'g_demo_a2'; const priv = 'g_demo_a4';
  const mariam = await as('mariam'); // ahmed's department manager (and platform admin)
  const g = await mariam.get(`${G}/goals/${shared}`);
  assert.equal(g.status, 200);
  assert.equal(g.data.is_owner, false);
  assert.equal(g.data.can_edit, false);
  assert.equal(g.data.viewers, undefined, 'the access log is for the owner');
  assert.ok(!g.data.children.some((c) => c.id === priv), 'private sub-goals are not listed to the manager');
  assert.equal((await mariam.get(`${G}/goals/${priv}`)).status, 404);
  for (const u of ['sara', 'omar', 'hessa', 'salem', 'latifa', 'president', 'aisha']) {
    assert.equal((await (await as(u)).get(`${G}/goals/${shared}`)).status, 404, u);
  }
  // the president is mariam's line manager: he sees her shared goal, the Operations director does not
  assert.equal((await (await as('president')).get(`${G}/goals/g_demo_m2`)).status, 200);
  assert.equal((await (await as('omar')).get(`${G}/goals/g_demo_m2`)).status, 404);
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    assert.equal((await c.get(`${G}/goals/${shared}`)).status, 403);
    assert.equal((await c.get(`${G}/summary`)).status, 403);
  }
  // read-only for the manager, but encouragement is allowed
  assert.equal((await mariam.put(`${G}/goals/${shared}`, { title: 'تعديل' })).status, 403);
  assert.equal((await mariam.post(`${G}/goals/${shared}/checkin`, { value: 3 })).status, 403);
  assert.equal((await mariam.post(`${G}/goals/${shared}/status`, { to: 'cancelled' })).status, 403);
  assert.equal((await mariam.post(`${G}/goals/${shared}/delete`, { confirm: true })).status, 403);
  assert.equal((await mariam.post(`${G}/goals/${priv}/comments`, { body: 'أحسنت' })).status, 404);
  assert.equal((await mariam.post(`${G}/goals/${shared}/comments`, { body: 'تقدم ممتاز، استمر!' })).status, 200);
  assert.equal((await mariam.post(`${G}/goals/${shared}/comments`, { body: '' })).status, 400);
  // the owner sees the comment and who looked at the goal
  const own = (await (await as('ahmed')).get(`${G}/goals/${shared}`)).data;
  assert.ok(own.comments.some((c) => c.body === 'تقدم ممتاز، استمر!'));
  assert.ok(own.viewers.some((v) => v.user_id === 'u_mariam' && v.action === 'view'));
  assert.ok(own.shared_with.some((u) => u.id === 'u_mariam'));
});

test('the team view lists direct reports only, with shared goals only', async () => {
  const t = (await (await as('mariam')).get(`${G}/team`)).data;
  assert.deepEqual(t.members.map((m) => m.id).sort(), ['u_ahmed', 'u_sara']);
  const a = (await (await as('mariam')).get(`${G}/team/u_ahmed`)).data;
  assert.ok(a.goals.length > 0);
  assert.ok(a.goals.every((g) => g.visibility === 'manager'));
  assert.ok(!a.goals.some((g) => g.id === 'g_demo_a4'));
  assert.equal((await (await as('mariam')).get(`${G}/team/u_fatima`)).status, 404);
  assert.equal((await (await as('omar')).get(`${G}/team/u_ahmed`)).status, 404);
  assert.deepEqual((await (await as('ahmed')).get(`${G}/team`)).data.members, []);
  const majed = (await (await as('majed')).get(`${G}/team`)).data.members.map((m) => m.id).sort();
  assert.deepEqual(majed, ['u_noura', 'u_reem'], 'line manager of Procurement (no own manager) and Finance');
  // the member's owner can see that the manager looked
  const s = (await (await as('ahmed')).get(`${G}/summary`)).data;
  assert.ok(s.viewers.some((v) => v.user_id === 'u_mariam'));
});

test('check-ins, roll-ups and status changes follow explicit transitions', async () => {
  const sara = await as('sara');
  const parent = (await sara.post(`${G}/goals`, { title: 'تحليل متطلبات خدمة التجديد الاستباقي', period_type: 'yearly', measure: 'rollup' })).data;
  const w = await sara.post(`${G}/goals`, { title: 'مقابلة ثلاثة مستخدمين', period_type: 'monthly', measure: 'numeric', target_value: 3, unit: 'مقابلات', parent_id: parent.id });
  assert.equal(w.status, 200);
  let r = await sara.post(`${G}/goals/${w.data.id}/checkin`, { value: 2, note: 'مقابلتان مكتملتان' });
  assert.equal(r.status, 200);
  assert.equal(r.data.progress, 67);
  assert.equal(r.data.status, 'active');
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/checkin`, { item_id: 'x' })).status, 400, 'not a checklist');
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/checkin`, {})).status, 400, 'nothing to record');
  r = await sara.post(`${G}/goals/${w.data.id}/checkin`, { delta: 1 });
  assert.equal(r.data.status, 'achieved');
  assert.equal(r.data.just_achieved, true);
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/checkin`, { delta: 1 })).status, 409, 'already achieved');
  const p = (await sara.get(`${G}/goals/${parent.id}`)).data;
  assert.equal(p.progress, 100, 'the yearly roll-up reflects its achieved sub-goal');
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/status`, { to: 'active' })).status, 200, 'reopen');
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/status`, { to: 'cancelled' })).status, 200);
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/status`, { to: 'achieved' })).status, 409, 'cancelled goals must be reopened first');
  assert.equal((await sara.post(`${G}/goals/${w.data.id}/status`, { to: 'missed' })).status, 400);
  // checklist completes when every step is done
  const c = (await sara.post(`${G}/goals`, { title: 'إعداد وثيقة المتطلبات', period_type: 'weekly', measure: 'checklist', items: ['المسودة الأولى', 'مراجعة الفريق'] })).data;
  assert.equal(c.items.length, 2);
  await sara.post(`${G}/goals/${c.id}/checkin`, { item_id: c.items[0].id, item_done: true });
  r = await sara.post(`${G}/goals/${c.id}/checkin`, { item_id: c.items[1].id, item_done: true });
  assert.equal(r.data.status, 'achieved');
});

test('a missed daily goal can be carried to today exactly once', async () => {
  const ahmed = await as('ahmed');
  const missed = (await ahmed.get(`${G}/goals/g_demo_a7`)).data;
  assert.equal(missed.status, 'missed');
  assert.equal(missed.can_carry, true);
  const r = await ahmed.post(`${G}/goals/g_demo_a7/carry`, {});
  assert.equal(r.status, 200);
  assert.equal(r.data.period_start, localToday());
  assert.equal(r.data.carried_from, 'g_demo_a7');
  assert.equal((await ahmed.post(`${G}/goals/g_demo_a7/carry`, {})).status, 409);
  assert.equal((await ahmed.post(`${G}/goals/g_demo_a2/carry`, {})).status, 409, 'only daily goals are carried');
  assert.equal((await ahmed.post(`${G}/goals/g_demo_a7/checkin`, { done: true })).status, 409, 'a missed goal is closed');
});

test('sharing and deletion need an explicit confirmation; direct ids of others return 404', async () => {
  const ahmed = await as('ahmed');
  const g = (await ahmed.post(`${G}/goals`, { title: 'تحديث دليل الاستعادة من الكوارث', period_type: 'weekly' })).data;
  assert.equal((await ahmed.put(`${G}/goals/${g.id}`, { visibility: 'manager' })).status, 428);
  assert.equal((await (await as('mariam')).get(`${G}/goals/${g.id}`)).status, 404);
  assert.equal((await ahmed.put(`${G}/goals/${g.id}`, { visibility: 'manager', confirm: true })).status, 200);
  assert.equal((await (await as('mariam')).get(`${G}/goals/${g.id}`)).status, 200);
  assert.equal((await ahmed.put(`${G}/goals/${g.id}`, { visibility: 'everyone', confirm: true })).status, 400);
  assert.equal((await ahmed.post(`${G}/goals/${g.id}/delete`, {})).status, 428);
  assert.equal((await ahmed.post(`${G}/goals/${g.id}/delete`, { confirm: true })).status, 200);
  assert.equal((await ahmed.get(`${G}/goals/${g.id}`)).status, 404);
  // other people's goals by direct id: not found, whatever the action
  const sara = await as('sara');
  for (const [m, p, b] of [['get', `/goals/g_demo_a1`], ['post', `/goals/g_demo_a1/checkin`, { done: true }], ['post', `/goals/g_demo_a1/delete`, { confirm: true }], ['put', `/goals/g_demo_a1`, { title: 'x y' }], ['post', `/goals/g_demo_a1/carry`, {}]]) {
    assert.equal((await sara[m](`${G}${p}`, b)).status, 404, `${m} ${p}`);
  }
});

test('Ask AI access to personal goals is opt-in per user (tools, MCP and the local planner)', async () => {
  const ahmed = await as('ahmed');
  const token = (await ahmed.post('/api/me/tokens', { label: 'goals test' })).data.token;
  const mcp = async (name, args) => (await ahmed.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { authorization: `Bearer ${token}` })).data.result;
  let r = await mcp('goals_list', {});
  assert.equal(r.isError, true);
  assert.match(r.structuredContent.error, /سياسة البيانات/);
  const chatOff = await ahmed.chat('ما أهدافي اليوم؟');
  assert.match(chatOff.final.text, /سياسة البيانات/);
  assert.equal((await ahmed.put('/api/systems/goals/prefs', { ai_enabled: true })).status, 200);
  r = await mcp('goals_list', { scope: 'current' });
  assert.equal(r.isError, false);
  const ids = r.structuredContent.result.goals.map((g) => g.id);
  assert.ok(ids.length && ids.every((id) => !id.startsWith('g_demo_s') && !id.startsWith('g_demo_m')), 'only his own goals');
  const add = await ahmed.chat('أضف هدف يومي: تحديث توثيق الخوادم');
  assert.match(add.final.text, /أضفت الهدف «تحديث توثيق الخوادم»/);
  const doneIt = await ahmed.chat('أنجزت هدف تحديث توثيق الخوادم');
  assert.match(doneIt.final.text, /تحقق هدفك «تحديث توثيق الخوادم»/);
  const mine = await ahmed.chat('أهدافي');
  assert.match(mine.final.text, /أهدافك/);
  // another user has not opted in
  const sara = await as('sara');
  assert.match((await sara.chat('أهدافي')).final.text, /سياسة البيانات/);
  assert.equal((await ahmed.put('/api/systems/goals/prefs', { ai_enabled: false })).status, 200);
});

test('home workspace and excellence points (derived, capped, not gameable)', async () => {
  const ws = (await (await as('ahmed')).get('/api/workspace')).data.find((w) => w.system === 'goals');
  assert.ok(ws.cards.some((c) => c.title_en === 'Today’s goals'));
  assert.ok(ws.cards.length <= 3);
  const sara = await as('sara');
  const before = (await sara.get('/api/game/me')).data;
  assert.ok(before.rules.some((r) => r.key === 'goal_yearly' && r.points === 25));
  const countWeekly = (g) => g.recent.filter((e) => e.kind === 'goal_weekly').length;
  // creating and immediately completing a weekly goal earns nothing (it must be planned ahead)
  const g = (await sara.post(`${G}/goals`, { title: 'هدف لحظي للتجربة', period_type: 'weekly' })).data;
  await sara.post(`${G}/goals/${g.id}/checkin`, { done: true });
  const after = (await sara.get('/api/game/me')).data;
  assert.equal(countWeekly(after), countWeekly(before));
  assert.ok(!after.recent.some((e) => e.ref === 'هدف لحظي للتجربة'));
});

test('a shared roll-up never reveals the progress of private sub-goals to the manager', async () => {
  const sara = await as('sara');
  const parent = (await sara.post(`${G}/goals`, { title: 'رفع جودة تحليل المتطلبات', period_type: 'yearly', measure: 'rollup', visibility: 'manager' })).data;
  const child = (await sara.post(`${G}/goals`, { title: 'هدف فرعي خاص جداً', period_type: 'weekly', parent_id: parent.id, visibility: 'private' })).data;
  assert.equal((await sara.post(`${G}/goals/${child.id}/checkin`, { done: true })).status, 200);
  assert.equal((await sara.get(`${G}/goals/${parent.id}`)).data.progress, 100, 'the owner sees the full roll-up');
  const mariam = await as('mariam');
  const seen = (await mariam.get(`${G}/goals/${parent.id}`)).data;
  assert.equal(seen.progress, 0, 'the manager’s roll-up only counts shared sub-goals');
  assert.deepEqual(seen.children, []);
  const team = (await mariam.get(`${G}/team/u_sara`)).data.goals.find((g) => g.id === parent.id);
  assert.equal(team.progress, 0);
});

test('goals planned for a future period earn no points when "achieved" before the period starts', async () => {
  const sara = await as('sara');
  const future = new Date(Date.now() + 4 * 3600e3 + 21 * 864e5).toISOString().slice(0, 10);
  assert.equal((await sara.post(`${G}/goals`, { title: 'هدف بعيد جداً', period_type: 'yearly', date: '2099-06-01' })).status, 400, 'no planning decades ahead');
  const g = (await sara.post(`${G}/goals`, { title: 'هدف أسبوع قادم للتجربة', period_type: 'weekly', date: future })).data;
  assert.ok(g.period_start > localToday());
  // planned "ahead" (backdated creation) so only the period rule can stop it
  const db = new DatabaseSync(path.join((await stack()).dataDir, 'portal.db'));
  try { db.prepare('UPDATE goals_goals SET created_at=? WHERE id=?').run(new Date(Date.now() - 3 * 864e5).toISOString(), g.id); } finally { db.close(); }
  assert.equal((await sara.post(`${G}/goals/${g.id}/checkin`, { done: true })).status, 200);
  const game = (await sara.get('/api/game/me')).data;
  assert.ok(!game.recent.some((e) => e.id === `goals:${g.id}`), 'no points for a period that has not started');
});
