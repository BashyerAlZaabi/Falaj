// Strategic portfolio execution: what SPMO enters (projects, tasks, allocations)
// shows up for the people and managers concerned — and nowhere else.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, login } from './helpers.js';

const S = await startStack();
after(() => S.stop());
const as = {};
const c = async (u) => (as[u] ||= await login(S.portal, u));
const day = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
let projectId; let taskId; let allocId;

test('SPMO creates a strategic project in another department with cross-department tasks and a pending allocation', async () => {
  const lat = await c('latifa');
  const r = await lat.tool('create_strategic_project', {
    name: 'تحسين زمن معالجة طلبات المتعاملين', department_id: 'dept_ops', owner_id: 'u_omar', due_date: day(60), budget: 250000,
    tasks: [{ title: 'تحليل مسار الطلبات الحالي', assignee_id: 'u_fatima', due_date: day(10), priority: 'high' }],
    allocations: [{ user_id: 'u_ahmed', percent: 40, role_ar: 'مهندس تكامل' }],
  });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.status, 'ok', JSON.stringify(r.data));
  const p = r.data.result.project || r.data.result;
  projectId = p.id;
  assert.ok(projectId);
});

test('the assignee sees the task in «assigned to me» with who assigned it, plus an alert', async () => {
  const fat = await c('fatima');
  const a = await fat.tool('my_assignments', {});
  assert.equal(a.data.status, 'ok');
  const t = a.data.result.tasks.find((x) => x.project_id === projectId);
  assert.ok(t, 'task reflected for fatima');
  taskId = t.id;
  const alerts = (await fat.get('/api/alerts')).data;
  assert.ok(alerts.some((x) => /تحليل مسار الطلبات/.test(`${x.title} ${x.body}`)), 'fatima alerted');
});

test('the executing department manager sees the project; an unrelated department does not', async () => {
  const omar = await c('omar');
  assert.equal((await omar.get(`/api/projects/${projectId}`)).status, 200);
  const sara = await c('sara');
  assert.equal((await sara.get(`/api/projects/${projectId}`)).status, 404);
  const hessa = await c('hessa'); // HR director — no link to this project
  assert.equal((await hessa.get(`/api/projects/${projectId}`)).status, 404);
});

test('allocation waits for the person\'s manager; only that manager may confirm', async () => {
  const ahmed = await c('ahmed');
  const mine = (await ahmed.tool('my_assignments', {})).data.result.allocations.find((x) => x.project_id === projectId);
  assert.ok(mine); assert.equal(mine.status, 'pending_manager');
  allocId = mine.id;
  assert.notEqual((await ahmed.tool('decide_allocation', { id: allocId, decision: 'confirm' })).data.status, 'ok', 'no self-approval');
  assert.notEqual((await (await c('omar')).tool('decide_allocation', { id: allocId, decision: 'confirm' })).data.status, 'ok', 'another department manager cannot confirm');
  const ok = await (await c('mariam')).tool('decide_allocation', { id: allocId, decision: 'adjust', percent: 30 });
  assert.equal(ok.data.status, 'ok', JSON.stringify(ok.data));
  const after2 = (await ahmed.tool('my_assignments', {})).data.result.allocations.find((x) => x.id === allocId);
  assert.equal(after2.status, 'active'); assert.equal(after2.percent, 30);
});

test('completing the task rolls progress up into the SPMO portfolio', async () => {
  const fat = await c('fatima');
  assert.equal((await fat.tool('update_task', { id: taskId, status: 'done' })).data.status, 'ok');
  const port = (await (await c('latifa')).get('/api/portfolio')).data;
  const list = port.projects || port.items || port;
  const row = list.find((x) => x.id === projectId);
  assert.ok(row, 'project in portfolio');
  assert.ok(row.progress > 0, `progress ${row.progress}`);
});

test('SPMO powers stop at strategic work: no access to other departments\' ordinary projects', async () => {
  const lat = await c('latifa');
  assert.equal((await lat.get('/api/projects/pr_procedures')).status, 404);
  const t = await lat.tool('create_task', { title: 'مهمة خارج النطاق', project_id: 'pr_procedures', assignee_id: 'u_fatima' });
  assert.notEqual(t.data.status, 'ok');
});

test('employees cannot create strategic projects or allocate people; external users are refused', async () => {
  const ahmed = await c('ahmed');
  assert.notEqual((await ahmed.tool('create_strategic_project', { name: 'مشروع', department_id: 'dept_it', owner_id: 'u_mariam', due_date: day(30) })).data.status, 'ok');
  assert.notEqual((await ahmed.tool('allocate_resource', { project_id: projectId, user_id: 'u_sara', percent: 20 })).data.status, 'ok');
  const ext = await c('horizon');
  assert.equal((await ext.get('/api/portfolio')).status, 403);
  assert.equal((await ext.get('/api/allocations')).status, 403);
});

test('a task assignee on a strategic project cannot change its budget, dates or status', async () => {
  const fat = await c('fatima');
  const r = await fat.tool('update_project', { id: projectId, due_date: day(5) });
  assert.notEqual(r.data.status, 'ok');
  const b = await fat.tool('update_project', { id: projectId, status: 'on_hold' });
  assert.notEqual(b.data.status, 'ok');
  const own = await (await c('omar')).tool('update_project', { id: projectId, due_date: day(70) });
  assert.equal(own.data.status, 'ok', JSON.stringify(own.data));
});

test('allocation ids outside the caller\'s scope are 404 — never a 403 that confirms they exist', async () => {
  for (const u of ['hessa', 'fatima']) {
    const cl = await c(u);
    for (const decision of ['confirm', 'end', 'withdraw']) {
      const r = await cl.tool('decide_allocation', { id: allocId, decision, reason: 'اختبار' });
      assert.notEqual(r.data.status, 'ok');
      assert.equal(r.data.code, 'not_found', `${u} ${decision}: ${JSON.stringify(r.data)}`);
    }
    assert.equal((await cl.get(`/api/allocations/${allocId}`)).status, 404);
  }
  // the person's own manager still gets the real (state) answer
  const again = await (await c('mariam')).tool('decide_allocation', { id: allocId, decision: 'confirm' });
  assert.equal(again.data.code, 'bad_input', JSON.stringify(again.data));
});

test('SPMO un-designating a project saves cleanly; capacity never leaks out-of-scope allocation details', async () => {
  const lat = await c('latifa');
  // a second strategic project keeps ahmed inside the SPMO capacity view
  const r2 = await lat.tool('create_strategic_project', { name: 'مشروع قياس الأثر', department_id: 'dept_it', owner_id: 'u_mariam', due_date: day(40),
    allocations: [{ user_id: 'u_ahmed', percent: 10, role_ar: 'مهندس' }] });
  assert.equal(r2.data.status, 'ok', JSON.stringify(r2.data));
  const un = await lat.tool('update_project', { id: projectId, is_strategic: false });
  assert.equal(un.data.status, 'ok', `designation removed without an error: ${JSON.stringify(un.data)}`);
  assert.equal((await lat.get(`/api/projects/${projectId}`)).status, 404, 'no longer in the SPMO scope');
  const cap = (await (await c('hamad')).get('/api/capacity/team')).data;
  const ahmed = cap.people.find((p) => p.id === 'u_ahmed');
  assert.ok(ahmed, 'ahmed is on strategic work');
  const hidden = ahmed.allocations.filter((a) => !a.project_name);
  assert.ok(hidden.length >= 1, 'the ordinary project allocation counts toward the load');
  for (const a of hidden) { assert.equal(a.project_id, null); assert.equal(a.role_ar, null); assert.equal(a.id, null); }
  assert.ok(!JSON.stringify(cap).includes(projectId), 'no trace of the out-of-scope project id');
});
