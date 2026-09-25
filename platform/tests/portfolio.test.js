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
