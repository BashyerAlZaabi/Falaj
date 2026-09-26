// API documentation: OpenAPI 3.1 generated from live routes + tool schemas,
// scoped to what the caller may reach; external accounts get none.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startStack, login } from './helpers.js';
import { toolByName } from '../server/mcp/tools.js';

let S;
before(async () => { S = await startStack(); });
after(async () => { await S?.stop(); });

test('spec requires a session; the viewer page is public and self-hosted', async () => {
  assert.equal((await fetch(`${S.portal}/api/openapi.json`)).status, 401);
  const page = await fetch(`${S.portal}/docs`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /\/js\/developers\.js/);
  assert.doesNotMatch(html, /https?:\/\/(?!localhost)/); // no CDN
});

test('admin spec: OpenAPI 3.1, core routes, tools with validated schemas, MCP, security', async () => {
  const admin = await login(S.portal, 'mariam');
  const { status, data: spec } = await admin.get('/api/openapi.json');
  assert.equal(status, 200);
  assert.equal(spec.openapi, '3.1.0');
  for (const p of ['/api/me', '/api/chat', '/api/projects/{id}', '/mcp', '/api/admin/caps', '/api/ready'])
    assert.ok(spec.paths[p], `missing ${p}`);
  assert.deepEqual(spec.paths['/api/ready'].get.security, []);
  assert.equal(spec.paths['/api/projects/{id}'].get.parameters[0].name, 'id');
  // each tool documented with the exact schema the server validates
  const ct = spec.paths['/api/tools/create_task'].post;
  assert.deepEqual(ct.requestBody.content['application/json'].schema.properties.input, toolByName.get('create_task').input_schema);
  assert.equal(ct['x-mutates'], true);
  assert.ok(Object.keys(spec.components.securitySchemes).includes('bearerToken'));
  // enterprise-system routes are expanded
  assert.ok(Object.keys(spec.paths).some((p) => p.startsWith('/api/sys/strategy/')));
  // operationIds are unique
  const ids = Object.values(spec.paths).flatMap((o) => Object.values(o).map((x) => x.operationId));
  assert.equal(new Set(ids).size, ids.length);
});

test('spec is scoped to the caller: no admin routes or unreachable systems for an employee', async () => {
  const emp = await login(S.portal, 'ahmed');
  const { data: spec } = await emp.get('/api/openapi.json');
  assert.ok(!Object.keys(spec.paths).some((p) => p.startsWith('/api/admin')));
  const { data: systems } = await emp.get('/api/systems');
  const allowed = new Set(systems.map((s) => s.key));
  for (const p of Object.keys(spec.paths)) {
    const m = p.match(/^\/api\/sys\/([a-z_]+)\//);
    if (m) assert.ok(allowed.has(m[1]), `employee sees routes of ${m[1]}`);
  }
  for (const op of Object.values(spec.paths).flatMap((o) => Object.values(o))) if (op['x-system']) assert.ok(allowed.has(op['x-system']));
});

test('external accounts get no API documentation', async () => {
  const ext = await login(S.portal, 'rashid');
  assert.equal((await ext.get('/api/openapi.json')).status, 403);
});
