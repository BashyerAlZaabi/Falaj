// Enterprise systems platform: identities, capabilities, external isolation,
// data-domain AI policy and admin controls.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done } from './_stack.js';

after(done);

test('each department persona signs in and sees the systems their role allows', async () => {
  const hessa = (await (await as('hessa')).get('/api/me')).data;
  assert.equal(hessa.user.dept_en, 'Human Resources');
  assert.ok(hessa.user.caps.includes('performance.hr'));
  const keys = hessa.systems.map((s) => s.key);
  for (const k of ['strategy', 'goals', 'performance', 'meetings', 'integrity', 'ideas', 'awards', 'surveys', 'integrations']) assert.ok(keys.includes(k), k);
  const aisha = (await (await as('aisha')).get('/api/me')).data;
  assert.ok(aisha.user.caps.includes('audit.head'));
  assert.ok(aisha.systems.find((s) => s.key === 'audit').pinned);
});

test('external identities are confined to their portal systems (no workspace data, AI, MCP or Vault)', async () => {
  const v = await as('horizon');
  const me = (await v.get('/api/me')).data;
  assert.equal(me.external, true);
  assert.deepEqual(me.systems.map((s) => s.key).sort(), ['procurement', 'providers']);
  assert.equal(me.agents.length, 0);
  for (const p of ['/api/projects', '/api/tasks', '/api/documents', '/api/summary', '/api/kpis', '/api/users/directory', '/api/game/me', '/api/conversations', '/api/sys/strategy/', '/api/sys/integrity/', '/api/sys/audit/']) {
    assert.equal((await v.get(p)).status, 403, p);
  }
  assert.equal((await v.post('/api/chat', { message: 'hi' })).status, 403);
  assert.equal((await v.post('/api/me/tokens', {})).status, 403);
  assert.equal((await v.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/list' })).status, 403);
  const auditor = (await (await as('rashid')).get('/api/me')).data;
  assert.deepEqual(auditor.systems.map((s) => s.key), ['audit']);
});

test('internal scopes exclude external organisations and people', async () => {
  const pres = await as('president');
  const dir = (await pres.get('/api/users/directory')).data;
  assert.ok(!dir.some((u) => ['u_ext_rashid', 'u_ext_horizon', 'u_ext_oasis'].includes(u.id)));
  const me = (await pres.get('/api/me')).data;
  assert.ok(!me.managed_departments.some((d) => d.startsWith('ext_')));
  const assignable = (await (await as('mariam')).get('/api/users/assignable')).data;
  assert.ok(!assignable.some((u) => u.id.startsWith('u_ext_')));
});

test('capability grants need an admin, explicit confirmation, the right identity type, and are audited', async () => {
  const admin = await as('mariam');
  assert.equal((await (await as('ahmed')).get('/api/admin/caps')).status, 403);
  assert.equal((await admin.put('/api/admin/caps', { user_id: 'u_ahmed', cap: 'ideas.committee', grant: true })).status, 428);
  assert.equal((await admin.put('/api/admin/caps', { user_id: 'u_ahmed', cap: 'providers.portal', grant: true, confirm: true })).status, 400);
  assert.equal((await admin.put('/api/admin/caps', { user_id: 'u_ext_horizon', cap: 'strategy.admin', grant: true, confirm: true })).status, 400);
  assert.equal((await admin.put('/api/admin/caps', { user_id: 'u_sara', cap: 'surveys.author', grant: true, confirm: true })).status, 200);
  const sara = (await (await as('sara')).get('/api/me')).data;
  assert.ok(sara.user.caps.includes('surveys.author'));
  assert.equal((await admin.put('/api/admin/caps', { user_id: 'u_sara', cap: 'surveys.author', grant: false, confirm: true })).status, 200);
});

test('data-domain AI policy: locked domains can never be opened; opt-in is per user', async () => {
  const admin = await as('mariam');
  const domains = (await admin.get('/api/admin/domains')).data;
  for (const k of ['integrity.disclosures', 'audit.workpapers', 'surveys.responses', 'procurement.bids', 'awards.evaluations', 'meetings.confidential']) {
    const d = domains.find((x) => x.key === k);
    assert.ok(d && d.ai_locked === 1 && d.ai_policy === 'off', k);
    assert.equal((await admin.put(`/api/admin/domains/${k}`, { ai_policy: 'allowed', confirm: true })).status, 409, k);
  }
  const ahmed = await as('ahmed');
  assert.equal((await ahmed.put('/api/systems/integrity/prefs', { ai_enabled: true })).status, 409);
  const g = (await ahmed.put('/api/systems/goals/prefs', { ai_enabled: true })).data;
  assert.equal(g.ai_enabled, true);
  assert.ok(g.domains.find((d) => d.key === 'goals.personal').ai_active);
  const other = (await (await as('sara')).get('/api/systems')).data.find((s) => s.key === 'goals');
  assert.equal(other.domains.find((d) => d.key === 'goals.personal').ai_active, false);
  const pinned = (await ahmed.put('/api/systems/ideas/prefs', { pinned: false })).data;
  assert.equal(pinned.pinned, false);
});

test('a system the user cannot open is refused at the router', async () => {
  const fatima = await as('fatima'); // employee, no procurement/provider capability
  assert.equal((await fatima.get('/api/sys/providers/')).status, 403);
  assert.equal((await fatima.get('/api/sys/nope/')).status, 404);
});
