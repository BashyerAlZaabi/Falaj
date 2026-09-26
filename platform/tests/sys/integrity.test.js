// Conflicts & Gifts (integrity): declaration workflow, gifts policy, mitigation
// instructions, segregation of duties, isolation (discloser / officer / manager /
// HR / admin / president / externals), aggregates, Ask AI lock and the
// procurement contract (declaredConflicts / recusalsFor).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done, stack } from './_stack.js';

after(done);
const API = '/api/sys/integrity';
const S = (r, code, msg) => assert.equal(r.status, code, `${msg || ''} → ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
// The procurement contract is a server-side export: load it against the test database.
async function contract() { const s = await stack(); process.env.DATA_DIR = s.dataDir; return import('../../server/systems/integrity.js'); }

test('discloser overview: own declaration, interests, instructions and role-aware landing', async () => {
  const ahmed = await as('ahmed');
  const o = (await ahmed.get(`${API}/overview`)).data;
  assert.equal(o.declaration.status, 'mitigation');
  assert.equal(o.declaration.interests[0].provider.id, 'ext_v_horizon');
  assert.equal(o.mitigations.length, 1);
  assert.equal(o.roles.landing, 'mine');
  assert.equal(o.roles.officer, false);
  assert.ok(o.access_log.some((a) => a.user_id === 'u_yousef'), 'discloser sees who viewed their record');
  assert.ok(o.gifts.every((g) => g.person.id === 'u_ahmed'));
  const y = (await (await as('yousef')).get(`${API}/overview`)).data;
  assert.equal(y.roles.landing, 'review');
  assert.equal((await (await as('president')).get(`${API}/overview`)).data.roles.landing, 'reports');
  assert.equal((await (await as('mariam')).get(`${API}/overview`)).data.roles.landing, 'instructions');
});

test('lists and counts only contain the caller’s own records (HR and the admin included)', async () => {
  for (const u of ['hessa', 'mariam', 'sara', 'president']) {
    const o = (await (await as(u)).get(`${API}/overview`)).data;
    const id = `u_${u}`;
    assert.ok(o.gifts.every((g) => g.person.id === id), `${u} gifts`);
    assert.ok(o.disclosures.every((d) => d.person.id === id), `${u} disclosures`);
    assert.ok(!o.declaration || o.declaration.person.id === id, `${u} declaration`);
    assert.equal(o.roles.counts.review, 0, `${u} sees no review counts`);
    assert.equal(o.roles.officer, false);
  }
  const y = (await (await as('yousef')).get(`${API}/review`)).data;
  const ownNew = y.items.filter((i) => i.own && i.column === 'new').length;
  assert.equal(y.counts.new, y.items.filter((i) => i.column === 'new').length - ownNew, 'officer counts exclude own records');
});

test('procurement contract: declaredConflicts and recusalsFor return minimal provider data', async () => {
  const m = await contract();
  const c = m.declaredConflicts('u_ahmed');
  assert.deepEqual(Object.keys(c[0]).sort(), ['id', 'kind', 'party_name', 'provider_id', 'status']);
  assert.ok(c.some((x) => x.party_name === 'شركة الأفق للحلول التقنية' && x.provider_id === 'ext_v_horizon' && x.status === 'mitigation'));
  const r = m.recusalsFor('u_ahmed');
  assert.equal(r[0].provider_id, 'ext_v_horizon');
  assert.match(r[0].instruction, /يمتنع عن تقييم عروض شركة الأفق/);
  assert.deepEqual(m.declaredConflicts('u_sara').filter((x) => x.status !== 'pending_review'), []);
  assert.deepEqual(m.recusalsFor('u_fatima'), []);
});

test('annual declaration end-to-end: draft → submit → review → cleared → closed, with access log and points', async () => {
  const mariam = await as('mariam'); const yousef = await as('yousef');
  const d = await mariam.put(`${API}/declarations/current`, { no_conflict: true });
  S(d, 200); assert.equal(d.data.status, 'draft');
  S(await mariam.post(`${API}/declarations/${d.data.id}/submit`, {}), 400, 'attest is required');
  const s = await mariam.post(`${API}/declarations/${d.data.id}/submit`, { attest: true });
  S(s, 200); assert.equal(s.data.status, 'submitted'); assert.equal(s.data.on_time, true);
  S(await mariam.post(`${API}/declarations/${d.data.id}/submit`, { attest: true }), 409, 'cannot submit twice');
  S(await mariam.put(`${API}/declarations/current`, { no_conflict: false }), 409, 'no edits after submission');
  S(await yousef.post(`${API}/declarations/${d.data.id}/decide`, { outcome: 'cleared' }), 409, 'must start review first');
  S(await yousef.post(`${API}/declarations/${d.data.id}/close`, {}), 409);
  S(await yousef.get(`${API}/declarations/${d.data.id}`), 200);
  S(await yousef.post(`${API}/declarations/${d.data.id}/start`), 200);
  const c = await yousef.post(`${API}/declarations/${d.data.id}/decide`, { outcome: 'cleared', note: 'لا يلزم إجراء' });
  S(c, 200); assert.equal(c.data.status, 'cleared');
  S(await yousef.post(`${API}/declarations/${d.data.id}/close`, {}), 200);
  const mine = (await mariam.get(`${API}/overview`)).data;
  assert.equal(mine.declaration.status, 'closed');
  assert.ok(mine.declaration.access_log.some((a) => a.user_id === 'u_yousef' && a.action === 'view'), 'officer view logged');
  const game = (await mariam.get('/api/game/me')).data;
  assert.ok(game.recent.some((e) => e.kind === 'integrity_declaration'), 'on-time declaration earns points');
});

test('validation errors are 400', async () => {
  const sara = await as('sara');
  S(await sara.post(`${API}/gifts`, { giver_name: 'جهة', description: 'هدية', value_aed: -5, received_on: '2026-01-01' }), 400, 'negative value');
  S(await sara.post(`${API}/gifts`, { giver_name: 'جهة', description: 'هدية', value_aed: 50, received_on: '2999-01-01' }), 400, 'future date');
  S(await sara.post(`${API}/gifts`, { giver_name: 'جهة', description: 'هدية', value_aed: 50, received_on: '2026-01-01', extra: 1 }), 400, 'unknown field');
  S(await sara.post(`${API}/disclosures`, { matter: 'قصير', related_party: 'x' }), 400, 'too short');
  S(await sara.post(`${API}/disclosures`, { matter: 'لجنة تقييم عروض الصيانة', related_party: 'شركة', provider_id: 'dept_it' }), 400, 'provider must be a registered provider');
  const fatima = await as('fatima');
  S(await fatima.put(`${API}/declarations/current`, { no_conflict: true, interests: [{ kind: 'financial', party_name: 'شركة' }] }), 400, 'no-conflict with interests');
  S(await fatima.put(`${API}/declarations/current`, { interests: [{ kind: 'bribe', party_name: 'شركة' }] }), 400, 'bad kind');
  S(await (await as('yousef')).post(`${API}/cycles`, { year: 'x', due_on: '2026-12-01' }), 400);
});

test('IDOR: nobody but the discloser and the officer can see a declaration (404, no existence leak)', async () => {
  for (const u of ['sara', 'omar', 'mariam', 'hessa', 'president', 'majed', 'aisha']) {
    const c = await as(u);
    S(await c.get(`${API}/declarations/idc_ahmed_2026`), 404, u);
    S(await c.get(`${API}/gifts/igf_ahmed_watch`), 404, u);
    S(await c.post(`${API}/declarations/idc_ahmed_2026/start`), 404, u);
    S(await c.post(`${API}/gifts/igf_ahmed_watch/decide`, { decision: 'keep' }), 404, u);
  }
  S(await (await as('sara')).get(`${API}/disclosures/ids_omar_horizon`), 404);
  S(await (await as('ahmed')).post(`${API}/declarations/idc_ahmed_2026/start`), 403, 'owner sees it but cannot review it');
  S(await (await as('yousef')).get(`${API}/declarations/idc_ahmed_2026`), 200);
});

test('officer-only queue and aggregates; the platform admin flag and HR unlock nothing', async () => {
  for (const u of ['mariam', 'hessa', 'salem', 'president', 'aisha', 'ahmed']) S(await (await as(u)).get(`${API}/review`), 403, u);
  for (const u of ['mariam', 'hessa', 'ahmed', 'aisha']) S(await (await as(u)).get(`${API}/reports`), 403, u);
  const q = (await (await as('yousef')).get(`${API}/review`)).data;
  assert.ok(q.items.some((i) => i.id === 'idc_reem_2026' && i.column === 'new'));
  assert.ok(q.items.find((i) => i.id === 'idc_yousef_2026').own, 'own record flagged for another reviewer');
  const r = await (await as('president')).get(`${API}/reports`);
  S(r, 200);
  const text = JSON.stringify(r.data);
  for (const leak of ['أحمد', 'u_ahmed', 'الأفق', 'شقيقي', 'ساعة']) assert.ok(!text.includes(leak), `aggregate leaks ${leak}`);
  for (const d of r.data.departments) if (d.hidden) assert.equal(d.rate, null);
  assert.ok(r.data.departments.find((d) => d.id === 'dept_legal').hidden, 'a 1-person department is hidden');
  assert.equal(r.data.departments.find((d) => d.id === 'dept_it').hidden, false);
});

test('external identities cannot reach the system at all', async () => {
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    S(await c.get(`${API}/overview`), 403, u);
    S(await c.get(`${API}/declarations/idc_ahmed_2026`), 403, u);
    S(await c.post(`${API}/gifts`, { giver_name: 'x', description: 'x', value_aed: 1, received_on: '2026-01-01' }), 403, u);
    assert.ok(!(await c.get('/api/workspace')).data.some?.((w) => w.system === 'integrity'), u);
  }
});

test('line manager sees only the instruction to enforce, never the disclosure; acknowledgement is logged', async () => {
  const mariam = await as('mariam');
  const list = (await mariam.get(`${API}/instructions`)).data;
  assert.equal(list.length, 1);
  assert.equal(list[0].text_ar, 'أحمد الشامسي: يمتنع عن تقييم عروض شركة الأفق للحلول التقنية أو المشاركة في أي قرار شراء يخصها');
  const blob = JSON.stringify(list);
  for (const leak of ['شقيقي', '15%', 'idc_ahmed', 'matter', 'provider']) assert.ok(!blob.includes(leak), `instruction view leaks ${leak}`);
  const omar = await as('omar');
  assert.deepEqual((await omar.get(`${API}/instructions`)).data, [], 'another department’s manager sees nothing');
  S(await omar.post(`${API}/mitigations/${list[0].id}/acknowledge`), 404);
  S(await (await as('president')).post(`${API}/mitigations/${list[0].id}/acknowledge`), 404, 'president is not the nearest manager');
  S(await mariam.post(`${API}/mitigations/${list[0].id}/acknowledge`), 200);
  S(await mariam.post(`${API}/mitigations/${list[0].id}/acknowledge`), 409);
  const log = (await (await as('ahmed')).get(`${API}/overview`)).data.access_log;
  assert.ok(log.some((a) => a.user_id === 'u_mariam' && a.action === 'acknowledge'));
  // workspace: manager card names the person and kind only
  const ws = (await mariam.get('/api/workspace')).data.find((w) => w.system === 'integrity');
  const wsText = JSON.stringify(ws);
  assert.ok(wsText.includes('أحمد الشامسي'));
  assert.ok(!wsText.includes('الأفق') && !wsText.includes('يمتنع'), 'home card carries no instruction text');
});

test('mitigation decision: recusal reaches the right manager and the procurement contract; SoD for the officer', async () => {
  const yousef = await as('yousef');
  S(await yousef.post(`${API}/declarations/idc_yousef_2026/start`), 403, 'officer cannot review own declaration');
  S(await yousef.post(`${API}/declarations/idc_reem_2026/start`), 200);
  S(await yousef.post(`${API}/declarations/idc_reem_2026/decide`, { outcome: 'mitigation' }), 400, 'mitigation needs instructions');
  S(await yousef.post(`${API}/declarations/idc_reem_2026/decide`, { outcome: 'cleared', mitigations: [{ kind: 'recusal', matter: 'تقييم العروض', instruction: 'يمتنع عن التقييم' }] }), 400);
  const d = await yousef.post(`${API}/declarations/idc_reem_2026/decide`, { outcome: 'mitigation', note: 'تنحٍّ كافٍ', mitigations: [
    { kind: 'recusal', matter: 'تقييم عروض مؤسسة الواحة للتوريدات', provider_id: 'ext_v_oasis', instruction: 'تمتنع عن تقييم عروض مؤسسة الواحة للتوريدات' },
    { kind: 'divestment', matter: 'مصلحة شخصية', instruction: 'تخارج من المصلحة خلال 60 يوماً' },
  ] });
  S(d, 200); assert.equal(d.data.status, 'mitigation');
  const majed = (await (await as('majed')).get(`${API}/instructions`)).data;
  assert.equal(majed.length, 1, 'only the enforceable instruction (divestment stays private)');
  assert.match(majed[0].text_ar, /^ريم العامري: تمتنع عن تقييم عروض مؤسسة الواحة/);
  assert.deepEqual((await (await as('mariam')).get(`${API}/instructions`)).data.filter((x) => x.person.id === 'u_reem'), []);
  const m = await contract();
  assert.ok(m.declaredConflicts('u_reem').some((x) => x.provider_id === 'ext_v_oasis' && x.status === 'mitigation'));
  assert.equal(m.recusalsFor('u_reem')[0].provider_id, 'ext_v_oasis');
  // lifting is permission-changing: explicit confirmation + audit
  const mit = d.data.mitigations.find((x) => x.kind === 'recusal');
  S(await (await as('reem')).post(`${API}/mitigations/${mit.id}/lift`, { confirm: true }), 403);
  S(await yousef.post(`${API}/mitigations/${mit.id}/lift`, {}), 428);
  S(await yousef.post(`${API}/mitigations/${mit.id}/lift`, { confirm: true, note: 'انتهت المناقصة' }), 200);
  S(await yousef.post(`${API}/mitigations/${mit.id}/lift`, { confirm: true }), 409);
  assert.deepEqual((await (await as('majed')).get(`${API}/instructions`)).data, []);
  assert.deepEqual(m.recusalsFor('u_reem'), []);
});

test('return for clarification sends the declaration back to its owner as a draft', async () => {
  const yousef = await as('yousef'); const noura = await as('noura');
  S(await yousef.post(`${API}/declarations/idc_noura_2026/return`, { note: 'x' }), 400);
  S(await yousef.post(`${API}/declarations/idc_noura_2026/return`, { note: 'يرجى توضيح اسم البنك ونسبة الأسهم.' }), 200);
  const o = (await noura.get(`${API}/overview`)).data;
  assert.equal(o.declaration.status, 'draft');
  assert.match(o.declaration.return_note, /اسم البنك/);
  S(await noura.put(`${API}/declarations/current`, { no_conflict: false, interests: [{ kind: 'financial', party_name: 'بنك محلي', details: 'أسهم أقل من 1%' }] }), 200);
  S(await noura.post(`${API}/declarations/${o.declaration.id}/submit`, { attest: true }), 200);
});

test('ad-hoc disclosure: private divestment is not shown to the manager', async () => {
  const fatima = await as('fatima'); const yousef = await as('yousef');
  const d = await fatima.post(`${API}/disclosures`, { matter: 'عضوية لجنة اختيار نظام إدارة التذاكر', related_party: 'شركة الأفق للحلول التقنية', provider_id: 'ext_v_horizon', relationship: 'أملك أسهماً قليلة في الشركة' });
  S(d, 200); assert.equal(d.data.status, 'submitted');
  S(await (await as('omar')).get(`${API}/disclosures/${d.data.id}`), 404, 'manager cannot read it');
  S(await yousef.post(`${API}/disclosures/${d.data.id}/start`), 200);
  S(await yousef.post(`${API}/disclosures/${d.data.id}/decide`, { outcome: 'mitigation', mitigations: [{ kind: 'divestment', matter: 'أسهم في الشركة', instruction: 'تخارج من الأسهم قبل ترسية العقد' }] }), 200);
  assert.deepEqual((await (await as('omar')).get(`${API}/instructions`)).data, []);
  const m = await contract();
  assert.ok(m.declaredConflicts('u_fatima').some((x) => x.id === d.data.id && x.provider_id === 'ext_v_horizon'));
});

test('gift policy engine proposes; the officer’s decision must respect the policy', async () => {
  const sara = await as('sara'); const yousef = await as('yousef');
  const check = async (b) => (await sara.post(`${API}/policy/check`, b)).data.decision;
  assert.equal(await check({ value_aed: 150 }), 'keep');
  assert.equal(await check({ value_aed: 200 }), 'keep');
  assert.equal(await check({ value_aed: 350 }), 'handover');
  assert.equal(await check({ value_aed: 450, kind: 'hospitality' }), 'decline_return');
  assert.equal(await check({ value_aed: 50, active_tender: true }), 'decline_return');
  assert.equal(await check({ value_aed: 10, cash: true }), 'decline_return');
  const today = new Date().toISOString().slice(0, 10);
  const g = await sara.post(`${API}/gifts`, { giver_name: 'مؤسسة الواحة للتوريدات', provider_id: 'ext_v_oasis', description: 'طقم أقلام فاخر', value_aed: 600, received_on: today, active_tender: true });
  S(g, 200); assert.equal(g.data.proposal.decision, 'decline_return'); assert.equal(g.data.status, 'declared');
  S(await yousef.post(`${API}/gifts/${g.data.id}/decide`, { decision: 'keep' }), 409, 'tender gifts are always declined');
  S(await yousef.post(`${API}/gifts/${g.data.id}/decide`, { decision: 'handover' }), 409);
  S(await sara.post(`${API}/gifts/${g.data.id}/decide`, { decision: 'decline_return' }), 403, 'discloser cannot decide');
  S(await yousef.post(`${API}/gifts/${g.data.id}/complete`, {}), 403, 'only the discloser confirms completion');
  S(await sara.post(`${API}/gifts/${g.data.id}/complete`, {}), 409, 'nothing to complete before a decision');
  const dd = await yousef.post(`${API}/gifts/${g.data.id}/decide`, { decision: 'decline_return' });
  S(dd, 200); assert.equal(dd.data.status, 'decided');
  S(await (await as('ahmed')).post(`${API}/gifts/${g.data.id}/complete`, {}), 404);
  const cc = await sara.post(`${API}/gifts/${g.data.id}/complete`, {});
  S(cc, 200); assert.equal(cc.data.status, 'completed');
  // a stricter-than-proposed decision needs a reason
  const t = await sara.post(`${API}/gifts`, { giver_name: 'جمعية مهنية', description: 'كتاب', value_aed: 80, received_on: today });
  S(await yousef.post(`${API}/gifts/${t.data.id}/decide`, { decision: 'handover' }), 400);
  const k = await yousef.post(`${API}/gifts/${t.data.id}/decide`, { decision: 'keep' });
  S(k, 200); assert.equal(k.data.status, 'completed');
  // officer's own gift needs another reviewer
  const own = await yousef.post(`${API}/gifts`, { giver_name: 'جهة حكومية', description: 'درع تذكاري', value_aed: 120, received_on: today });
  S(await yousef.post(`${API}/gifts/${own.data.id}/decide`, { decision: 'keep' }), 403);
  const game = (await sara.get('/api/game/me')).data;
  assert.ok(game.recent.some((e) => e.kind === 'integrity_gift'), 'timely declaration earns points once decided');
});

test('workspace cards follow the same scopes', async () => {
  const ws = async (u) => (await (await as(u)).get('/api/workspace')).data.find((w) => w.system === 'integrity');
  const y = await ws('yousef');
  assert.ok(y.cards.some((c) => c.href === '#/sys/integrity/review'));
  const hessa = JSON.stringify(await ws('hessa'));
  assert.ok(!hessa.includes('#/sys/integrity/review') && !hessa.includes('أحمد'), 'HR gets only their own card');
  const salem = await ws('salem');
  assert.equal(salem.cards[0].cta.href, '#/sys/integrity/mine/declare', 'not-started declaration is the first thing to do');
  assert.ok(!JSON.stringify(await ws('ahmed')).includes('#/sys/integrity/review'));
});

test('Ask AI and MCP never read disclosures; intents only explain the policy', async () => {
  const ahmed = await as('ahmed'); const s = await stack();
  const token = (await ahmed.post('/api/me/tokens', { label: 'test' })).data.token;
  const mcp = (body) => fetch(`${s.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());
  const list = await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' });
  assert.ok(!list.result.tools.some((t) => t.name.startsWith('integrity_')));
  const call = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'integrity_list_declarations', arguments: {} } });
  assert.equal(call.result.isError, true);
  const domains = (await ahmed.get('/api/systems')).data.find((x) => x.key === 'integrity').domains;
  assert.equal(domains[0].ai_active, false);
  S(await ahmed.put('/api/systems/integrity/prefs', { ai_enabled: true }), 409);
  const sara = await as('sara');
  const r1 = await sara.chat('اعرض إفصاح أحمد الشامسي');
  assert.ok(r1.final.text.includes('#/sys/integrity/mine'));
  for (const leak of ['الأفق', 'شقيقي', 'تعليمات سارية']) assert.ok(!r1.final.text.includes(leak), leak);
  const r2 = await sara.chat('هل يجوز قبول هدية بقيمة 300 درهم من مورد؟');
  assert.match(r2.final.text, /تسليمها للجهة/);
  assert.ok(r2.final.text.includes('#/sys/integrity/gifts'));
  const r3 = await sara.chat('هل استلام بطاقة هدايا مسموح؟');
  assert.match(r3.final.text, /الاعتذار عنها وإعادتها/);
});

test('integrity intents never capture existing platform commands', async () => {
  const sara = await as('sara');
  const t = await sara.chat('أضف مهمة شراء هدية للزميل المتقاعد غداً');
  assert.ok(!t.final.text.includes('#/sys/integrity'), t.final.text);
  const en = await sara.chat('Can I accept a gift worth 150 AED?');
  assert.match(en.final.text, /Keep/);
  assert.ok(en.final.text.includes('#/sys/integrity/gifts'));
});

test('cycle administration: officer only, reminders rate-limited, closing requires confirmation', async () => {
  const yousef = await as('yousef');
  const cy = (await yousef.get(`${API}/overview`)).data.cycle;
  S(await (await as('hessa')).post(`${API}/cycles/${cy.id}/remind`), 403);
  const r = await yousef.post(`${API}/cycles/${cy.id}/remind`);
  S(r, 200); assert.ok(r.data.reminded >= 1);
  S(await yousef.post(`${API}/cycles/${cy.id}/remind`), 409);
  S(await yousef.post(`${API}/cycles`, { year: 2031, due_on: '2031-12-01' }), 409, 'a cycle is already open');
  S(await (await as('mariam')).post(`${API}/cycles/${cy.id}/close`, { confirm: true }), 403);
  S(await yousef.post(`${API}/cycles/${cy.id}/close`, {}), 428);
  S(await yousef.post(`${API}/cycles/${cy.id}/close`, { confirm: true }), 200);
  S(await (await as('salem')).put(`${API}/declarations/current`, { no_conflict: true }), 409, 'closed cycle accepts no declarations');
  const n = await yousef.post(`${API}/cycles`, { year: new Date().getUTCFullYear() + 1, due_on: `${new Date().getUTCFullYear() + 1}-03-31` });
  S(n, 200); assert.equal(n.data.status, 'open');
});

// ---------------- adversarial review (regressions) ----------------
test('procurement contract: declared conflicts survive a new cycle and a return for clarification', async () => {
  // the previous test closed the seeded cycle and opened next year's: nobody has declared in it yet
  const m = await contract();
  assert.ok(m.declaredConflicts('u_ahmed').some((x) => x.provider_id === 'ext_v_horizon'), 'last cycle’s mitigation still applies until a new declaration is filed');
  const yousef = await as('yousef'); const salem = await as('salem');
  const d = (await salem.put(`${API}/declarations/current`, { no_conflict: false, interests: [{ kind: 'relative', party_name: 'مؤسسة الواحة للتوريدات', provider_id: 'ext_v_oasis', details: 'قريب يعمل في المبيعات' }] })).data;
  S(await salem.post(`${API}/declarations/${d.id}/submit`, { attest: true }), 200);
  assert.ok(m.declaredConflicts('u_salem').some((x) => x.provider_id === 'ext_v_oasis'));
  S(await yousef.post(`${API}/declarations/${d.id}/return`, { note: 'يرجى توضيح طبيعة العلاقة بالمؤسسة.' }), 200);
  assert.ok(m.declaredConflicts('u_salem').some((x) => x.provider_id === 'ext_v_oasis'), 'a declaration returned for clarification still discloses the conflict');
});
