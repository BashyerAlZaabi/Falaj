// Service Providers: registry scopes (manage / procurement roles / department
// managers / nobody else), confidential access log, status workflow with
// confirmation and reasons, document renewal verified by Procurement, contract
// evaluations by the owner only, private vendor portal, Ask AI opt-in domain,
// workspace cards and excellence points.
import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { as, done, stack } from './_stack.js';

// _stack.js starts the stack lazily; start it once before concurrent logins.
before(async () => { await stack(); });
after(done);
const P = '/api/sys/providers';
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
async function mcp(c, name, args = {}) {
  const S = await stack();
  const { token } = (await c.post('/api/me/tokens', {})).data;
  const call = async (body) => (await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) })).json();
  return { res: (await call({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } })).result, list: (await call({ jsonrpc: '2.0', id: 2, method: 'tools/list' })).result.tools.map((t) => t.name) };
}

test('registry scope: Procurement manages, procurement roles read, other managers only see their contracted suppliers', async () => {
  const [reem, mariam, omar, president, fatima, ahmed] = await Promise.all(['reem', 'mariam', 'omar', 'president', 'fatima', 'ahmed'].map(as));
  const all = (await reem.get(`${P}/providers`)).data;
  assert.deepEqual(all.map((p) => p.id).sort(), ['pv_bayan', 'pv_horizon', 'pv_madar', 'pv_oasis', 'pv_riyada', 'pv_saqr']);
  const byId = Object.fromEntries(all.map((p) => [p.id, p]));
  assert.equal(byId.pv_horizon.eligible, true);
  assert.equal(byId.pv_bayan.eligible, false, 'expired insurance');
  assert.equal(byId.pv_saqr.eligible, false, 'suspended');
  assert.equal(byId.pv_riyada.status, 'pending');
  assert.equal((await mariam.get(`${P}/providers`)).data.length, 6, 'committee member reads the registry');
  const mine = (await omar.get(`${P}/providers`)).data.map((p) => p.id).sort();
  assert.deepEqual(mine, ['pv_bayan', 'pv_oasis'], 'Operations manager sees only suppliers contracted with Operations');
  assert.equal((await omar.get(`${P}/providers/pv_horizon`)).status, 404, 'IDOR to another department’s supplier');
  assert.ok((await president.get(`${P}/providers`)).data.length >= 3);
  assert.equal((await fatima.get(`${P}/providers`)).status, 403, 'employees without a procurement role cannot open the system');
  assert.equal((await ahmed.get(`${P}/providers/pv_horizon`)).status, 403);
  assert.equal((await reem.get(`${P}/providers/nope`)).status, 404);
});

test('provider profile is confidential: every view is logged and the log is shown to Procurement only', async () => {
  const [reem, mariam, omar] = await Promise.all(['reem', 'mariam', 'omar'].map(as));
  await omar.get(`${P}/providers/pv_oasis`);
  const p = (await reem.get(`${P}/providers/pv_oasis`)).data;
  assert.ok(p.access_log.some((a) => a.user_id === 'u_omar' && a.action === 'view'));
  assert.ok(p.access_log.some((a) => a.user_id === 'u_reem'));
  assert.equal(p.can.manage, true);
  const m = (await mariam.get(`${P}/providers/pv_oasis`)).data;
  assert.equal(m.access_log, undefined);
  assert.equal(m.portal_users, undefined);
  assert.equal(m.can.manage, false);
  const o = (await omar.get(`${P}/providers/pv_oasis`)).data;
  assert.ok(o.contracts.every((c) => c.department_id === 'dept_ops'), 'contracts limited to the manager’s scope');
});

test('status workflow: reason + explicit confirmation, audited history, eligibility follows, SoD for non-managers', async () => {
  const [reem, mariam, omar] = await Promise.all(['reem', 'mariam', 'omar'].map(as));
  assert.equal((await mariam.post(`${P}/providers/pv_madar/status`, { to: 'suspended', reason: 'تأخر', confirm: true })).status, 403, 'platform admin without providers.manage');
  assert.equal((await omar.post(`${P}/providers/pv_madar/status`, { to: 'suspended', reason: 'تأخر', confirm: true })).status, 404, 'not in the manager’s scope');
  assert.equal((await reem.post(`${P}/providers/pv_madar/status`, { to: 'suspended', reason: 'تأخر متكرر في التوريد' })).status, 428);
  assert.equal((await reem.post(`${P}/providers/pv_madar/status`, { to: 'suspended', confirm: true })).status, 400, 'reason required');
  assert.equal((await reem.post(`${P}/providers/pv_madar/status`, { to: 'unknown', reason: 'x', confirm: true })).status, 400);
  const s = (await reem.post(`${P}/providers/pv_madar/status`, { to: 'suspended', reason: 'تأخر متكرر في التوريد', confirm: true })).data;
  assert.equal(s.status, 'suspended');
  assert.equal(s.eligible, false);
  assert.ok(s.history.some((h) => h.to_status === 'suspended' && h.reason.includes('تأخر')));
  const sl = (await reem.get('/api/sys/procurement/rfqs/rfq_demo_open')).status;
  assert.equal(sl, 200);
  assert.equal((await reem.post(`${P}/providers/pv_madar/status`, { to: 'pending', reason: 'إعادة', confirm: true })).status, 409, 'forbidden transition');
  assert.equal((await reem.post(`${P}/providers/pv_madar/status`, { to: 'approved', reason: 'اكتمال خطة التصحيح', confirm: true })).data.status, 'approved');
  // blacklisting is terminal
  assert.equal((await reem.post(`${P}/providers/pv_saqr/status`, { to: 'blacklisted', reason: 'إخلال جسيم بالعقد', confirm: true })).data.status, 'blacklisted');
  assert.equal((await reem.post(`${P}/providers/pv_saqr/status`, { to: 'approved', reason: 'محاولة', confirm: true })).status, 409);
});

test('registration: validation, managers only, pending until approved; approval without full documents keeps it ineligible', async () => {
  const [reem, mariam] = await Promise.all(['reem', 'mariam'].map(as));
  const body = { name_ar: 'شركة النخبة للتقنية', category: 'it', licence_no: 'CN-9900112', licence_expiry: day(200), contact_email: 'info@nukhba.demo' };
  assert.equal((await mariam.post(`${P}/providers`, body)).status, 403);
  assert.equal((await reem.post(`${P}/providers`, { ...body, licence_no: undefined })).status, 400);
  assert.equal((await reem.post(`${P}/providers`, { ...body, contact_email: 'not-an-email' })).status, 400);
  assert.equal((await reem.post(`${P}/providers`, { ...body, licence_expiry: day(-1) })).status, 400);
  const p = (await reem.post(`${P}/providers`, body)).data;
  assert.equal(p.status, 'pending');
  assert.equal((await reem.post(`${P}/providers`, body)).status, 409, 'duplicate name');
  const a = (await reem.post(`${P}/providers/${p.id}/status`, { to: 'approved', reason: 'استيفاء التأهيل الفني' })).data;
  assert.equal(a.status, 'approved');
  assert.equal(a.eligible, false);
  assert.ok(a.reasons.some((r) => r.code === 'missing_vat'));
});

test('vendor portal: own company only; renewals count only after Procurement verifies them', async () => {
  const [horizon, oasis, reem, rashid] = await Promise.all(['horizon', 'oasis', 'reem', 'rashid'].map(as));
  const h = (await horizon.get(`${P}/portal`)).data;
  assert.equal(h.company.id, 'pv_horizon');
  const txt = JSON.stringify(h);
  assert.ok(!/pv_oasis|الواحة|pv_bayan|u_mariam/.test(txt), 'no other supplier or internal identifiers');
  assert.ok(h.documents.every((d) => d.verified_by === null), 'internal verifier names are not exposed');
  assert.equal((await oasis.get(`${P}/portal`)).data.company.id, 'pv_oasis');
  for (const p of ['/providers', '/providers/pv_oasis', '/contracts', '/documents', '/me']) if (p !== '/me') assert.equal((await horizon.get(P + p)).status, 403, p);
  assert.equal((await reem.get(`${P}/portal`)).status, 403);
  assert.equal((await rashid.get(`${P}/portal`)).status, 403, 'external auditor cannot open the providers system');
  assert.equal((await horizon.put(`${P}/portal/documents/insurance`, { ref_no: 'POL-HZ-2026-201', issued_on: day(-1), expires_on: day(-2) })).status, 400);
  assert.equal((await horizon.put(`${P}/portal/documents/passport`, { expires_on: day(300) })).status, 404);
  const sub = (await horizon.put(`${P}/portal/documents/insurance`, { ref_no: 'POL-HZ-2026-201', issued_on: day(-1), expires_on: day(364) })).data;
  const ins = sub.documents.find((d) => d.kind === 'insurance');
  assert.ok(ins.pending);
  assert.notEqual(ins.expires_on, day(364), 'not applied before verification');
  assert.equal((await horizon.post(`${P}/providers/pv_horizon/documents/insurance/verify`, { decision: 'accept' })).status, 403);
  const attn = (await reem.get(`${P}/documents`)).data;
  assert.ok(attn.some((d) => d.provider_id === 'pv_horizon' && d.pending));
  const alerts = (await reem.get('/api/alerts')).data;
  assert.ok(JSON.stringify(alerts).includes('تحديث وثيقة بانتظار التحقق'));
  const v = (await reem.post(`${P}/providers/pv_horizon/documents/insurance/verify`, { decision: 'accept' })).data;
  assert.equal(v.documents.find((d) => d.kind === 'insurance').expires_on, day(364));
  assert.equal(v.warnings.length, 0);
  assert.equal((await reem.post(`${P}/providers/pv_horizon/documents/insurance/verify`, { decision: 'accept' })).status, 409, 'nothing pending anymore');
  assert.equal((await horizon.put(`${P}/portal/contact`, { contact_email: 'bad' })).status, 400);
  assert.equal((await horizon.put(`${P}/portal/contact`, { contact_phone: '+971 2 555 0199' })).data.company.contact_phone, '+971 2 555 0199');
});

test('contract evaluations: owner only, 1–5, once per quarter; supplier sees its own summary; excellence points derived', async () => {
  const [omar, reem, mariam, oasis] = await Promise.all(['omar', 'reem', 'mariam', 'oasis'].map(as));
  const list = (await omar.get(`${P}/contracts?needs_evaluation=1`)).data;
  assert.ok(list.some((c) => c.id === 'ct_demo_bldg_maint'));
  assert.equal((await omar.post(`${P}/contracts/ct_demo_bldg_maint/evaluations`, { quality: 0, timeliness: 3, compliance: 3 })).status, 400);
  assert.equal((await omar.post(`${P}/contracts/ct_demo_bldg_maint/evaluations`, { quality: 3, timeliness: 3 })).status, 400);
  assert.equal((await reem.post(`${P}/contracts/ct_demo_bldg_maint/evaluations`, { quality: 5, timeliness: 5, compliance: 5 })).status, 403, 'not the owner');
  assert.equal((await mariam.post(`${P}/contracts/ct_demo_bldg_maint/evaluations`, { quality: 5, timeliness: 5, compliance: 5 })).status, 403);
  assert.equal((await mariam.get(`${P}/contracts/ct_demo_service_ctr`)).status, 200, 'committee reads contracts');
  assert.equal((await omar.get(`${P}/contracts/ct_demo_portal_ops`)).status, 404, 'IT contract is outside Operations');
  const r = (await omar.post(`${P}/contracts/ct_demo_bldg_maint/evaluations`, { quality: 4, timeliness: 3, compliance: 4, comment: 'تحسن ملحوظ بعد خطة التصحيح' })).data;
  assert.equal(r.evaluated_this_period, true);
  assert.equal((await omar.post(`${P}/contracts/ct_demo_bldg_maint/evaluations`, { quality: 4, timeliness: 3, compliance: 4 })).status, 409, 'once per quarter');
  assert.equal((await omar.post(`${P}/contracts/ct_demo_service_ctr/evaluations`, { quality: 4, timeliness: 4, compliance: 4 })).status, 409, 'already reviewed this quarter (seed)');
  const o = (await oasis.get(`${P}/portal`)).data;
  assert.ok(o.evaluation.count >= 1);
  assert.ok(o.contracts.every((c) => !('owner' in c)), 'supplier does not see internal owners');
  const g = (await omar.get('/api/game/me')).data;
  assert.ok(g.rules.some((x) => x.key === 'provider_evaluation' && x.points === 8));
  assert.ok(g.recent.some((e) => e.kind === 'provider_evaluation'), 'points are derived from the real evaluation');
  assert.equal((await (await as('horizon')).get('/api/game/me')).status, 403, 'suppliers have no excellence points');
});

test('Ask AI on the opt-in registry domain: refused until the user opts in, then scoped', async () => {
  const [reem, omar] = await Promise.all(['reem', 'omar'].map(as));
  const before = await mcp(reem, 'providers_find', { eligible_only: true });
  assert.equal(before.res.structuredContent.status, 'error');
  assert.match(before.res.structuredContent.error, /سياسة البيانات/);
  assert.ok(!before.list.includes('providers_find'));
  assert.equal((await reem.put('/api/systems/providers/prefs', { ai_enabled: true })).status, 200);
  const after2 = await mcp(reem, 'providers_find', { eligible_only: true, category: 'supplies' });
  assert.equal(after2.res.structuredContent.status, 'ok');
  assert.ok(after2.res.structuredContent.result.every((p) => p.eligible));
  assert.ok(!after2.res.structuredContent.result.some((p) => p.id === 'pv_bayan'));
  assert.equal((await omar.put('/api/systems/providers/prefs', { ai_enabled: true })).status, 200);
  const o = await mcp(omar, 'providers_find', {});
  assert.deepEqual(o.res.structuredContent.result.map((p) => p.id).sort(), ['pv_bayan', 'pv_oasis']);
  const denied = await mcp(omar, 'providers_expiring_documents', {});
  assert.equal(denied.res.structuredContent.status, 'error', 'registry managers only');
  const chat = await reem.chat('الموردين المؤهلين للتوريدات');
  assert.match(JSON.stringify(chat.final), /مؤهل/);
  await reem.put('/api/systems/providers/prefs', { ai_enabled: false });
  await omar.put('/api/systems/providers/prefs', { ai_enabled: false });
});

test('workspace cards follow the same scope for Procurement, contract owners and suppliers', async () => {
  const [reem, mariam, horizon, fatima] = await Promise.all(['reem', 'mariam', 'horizon', 'fatima'].map(as));
  const ws = async (c) => (await c.get('/api/workspace')).data.find((s) => s.system === 'providers')?.cards || [];
  const r = await ws(reem);
  assert.ok(r.some((c) => c.href === '#/sys/providers/documents'));
  const m = await ws(mariam);
  assert.ok(m.some((c) => c.title_en.includes('Supplier performance') && c.items.some((i) => i.title.includes('CN-'))), 'IT contract owner is asked to review');
  const h = await ws(horizon);
  assert.equal(h.length, 1);
  assert.equal(h[0].href, '#/sys/providers/company');
  assert.equal((await ws(fatima)).length, 0);
});
