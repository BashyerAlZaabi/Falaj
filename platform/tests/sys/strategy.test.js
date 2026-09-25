// Strategic Performance (strategy): transparency for staff, owner-only reporting,
// SPMO validation with segregation of duties, RAG rules (missing ≠ zero),
// project-scope isolation for initiatives, admin CRUD with confirmation,
// external isolation, workspace cards, Ask AI tools/intents and game events.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done } from './_stack.js';

after(done);
const S = '/api/sys/strategy';

test('every staff member can view the plan; external identities are refused at the router', async () => {
  for (const u of ['fatima', 'noura', 'saeed', 'president', 'mariam']) {
    const c = await as(u);
    const m = await c.get(`${S}/map`);
    assert.equal(m.status, 200, u);
    assert.equal(m.data.pillars.length, 4);
    assert.ok(m.data.pillars.every((p) => p.objectives.length >= 2));
    assert.equal(m.data.kpi_total, m.data.pillars.flatMap((p) => p.objectives).reduce((a, o) => a + o.kpis.length, 0));
  }
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    for (const p of ['/map', '/kpis', '/summary', '/updates', '/admin', '/initiatives', '/kpis/sk_111']) assert.equal((await c.get(`${S}${p}`)).status, 403, `${u} ${p}`);
    assert.equal((await c.post(`${S}/kpis/sk_111/actuals`, { value: 1 })).status, 403);
    const ws = (await c.get('/api/workspace')).data;
    assert.ok(!ws.some((w) => w.system === 'strategy'), `${u} workspace`);
  }
});

test('RAG rules: thresholds, lower-is-better mirrored, missing and returned values are never counted as zero', async () => {
  const c = await as('noura');
  const rows = (await c.get(`${S}/kpis`)).data.rows;
  const by = Object.fromEntries(rows.map((k) => [k.code, k]));
  for (const k of rows) {
    if (k.attainment == null) { assert.equal(k.status, 'no_data'); continue; }
    const expected = k.attainment >= 95 ? 'on_track' : k.attainment >= 80 ? 'at_risk' : 'off_track';
    assert.equal(k.status, expected, k.code);
  }
  // lower-is-better: attainment = target ÷ actual
  const t = by['KPI-1.1.2'];
  assert.equal(t.direction, 'lower');
  if (t.comparable != null) assert.ok(Math.abs(t.attainment - Math.round((t.target / t.comparable) * 1000) / 10) < 0.2);
  // the latest value of KPI-1.1.2 was returned by the SPMO: it does not count, the previous reported period is used
  const d112 = (await c.get(`${S}/kpis/sk_112`)).data;
  const returned = d112.series.find((p) => p.actual_status === 'returned');
  assert.ok(returned, 'seed has a returned actual');
  assert.equal(returned.counted, false);
  assert.equal(returned.status, 'no_data');
  assert.notEqual(d112.period, returned.key);
  // the latest monthly period of KPI-1.2.2 is not reported: shown as a gap (null), never 0
  const d122 = (await c.get(`${S}/kpis/sk_122`)).data;
  const last = d122.series.at(-1);
  assert.equal(last.value, null);
  assert.equal(last.comparable, null);
  assert.equal(last.status, 'no_data');
  assert.ok(d122.series.some((p) => p.counted));
});

test('KPI owner reports an actual; SPMO validates it (not their own); forbidden actors are refused', async () => {
  const ahmed = await as('ahmed');
  const u = (await ahmed.get(`${S}/updates`)).data;
  const due = u.due.find((d) => d.code === 'KPI-1.2.2');
  assert.ok(due, 'the unreported period of KPI-1.2.2 is due for its owner');
  // not the owner: another IT employee, another department's manager, the platform admin of another department
  assert.equal((await (await as('sara')).post(`${S}/kpis/sk_122/actuals`, { value: 76, period: due.period })).status, 403);
  assert.equal((await (await as('omar')).post(`${S}/kpis/sk_122/actuals`, { value: 76, period: due.period })).status, 403);
  assert.equal((await (await as('latifa')).post(`${S}/kpis/sk_122/actuals`, { value: 76, period: due.period })).status, 403);
  // validation errors
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { period: due.period })).status, 400);
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 'x', period: due.period })).status, 400);
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 140, period: due.period })).status, 400, 'above the KPI maximum');
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 70, period: '2026-13' })).status, 400);
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 70, period: '2099-01' })).status, 400, 'future period');
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 70, period: due.period, extra: 1 })).status, 400);
  assert.equal((await ahmed.post(`${S}/kpis/does-not-exist/actuals`, { value: 70 })).status, 404);

  const r = await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 76.4, period: due.period, note: 'من سجلات التكامل' });
  assert.equal(r.status, 200);
  assert.equal(r.data.status, 'submitted');
  // SPMO sees it in the queue; the owner does not validate
  const latifa = await as('latifa');
  const q = (await latifa.get(`${S}/updates`)).data.queue;
  const item = q.find((x) => x.actual_id === r.data.id);
  assert.ok(item && !item.own);
  assert.equal((await ahmed.post(`${S}/actuals/${r.data.id}/review`, { decision: 'validate' })).status, 403, 'no strategy.admin');
  assert.equal((await (await as('mariam')).post(`${S}/actuals/${r.data.id}/review`, { decision: 'validate' })).status, 403, 'platform admin has no data power');
  assert.equal((await latifa.post(`${S}/actuals/${r.data.id}/review`, { decision: 'maybe' })).status, 400);
  assert.equal((await latifa.post(`${S}/actuals/${r.data.id}/review`, { decision: 'validate' })).status, 200);
  assert.equal((await latifa.post(`${S}/actuals/${r.data.id}/review`, { decision: 'return', comment: 'late check' })).status, 409, 'already validated');
  assert.equal((await ahmed.post(`${S}/kpis/sk_122/actuals`, { value: 77, period: due.period })).status, 409, 'validated values are locked');
  const k = (await ahmed.get(`${S}/kpis/sk_122`)).data;
  assert.equal(k.series.find((p) => p.key === due.period).actual_status, 'validated');
  assert.ok(k.log.some((l) => l.action === 'validated'));
});

test('segregation of duties: an SPMO analyst never validates a value they submitted', async () => {
  const hamad = await as('hamad');
  const latifa = await as('latifa');
  const u = (await hamad.get(`${S}/updates`)).data;
  if (u.due.length) {
    const d = u.due[0];
    assert.equal((await hamad.post(`${S}/kpis/${d.kpi_id}/actuals`, { value: 70, period: d.period })).status, 200);
  }
  const mine = (await hamad.get(`${S}/updates`)).data.queue.find((x) => x.submitted_by?.id === 'u_hamad');
  assert.ok(mine, 'hamad has a value awaiting validation');
  assert.equal(mine.own, true);
  const r = await hamad.post(`${S}/actuals/${mine.actual_id}/review`, { decision: 'validate' });
  assert.equal(r.status, 403);
  assert.match(r.data.message, /فصل المهام/);
  // returning requires a reason; a colleague returns it and the owner is alerted
  assert.equal((await latifa.post(`${S}/actuals/${mine.actual_id}/review`, { decision: 'return' })).status, 400);
  assert.equal((await latifa.post(`${S}/actuals/${mine.actual_id}/review`, { decision: 'return', comment: 'يرجى إرفاق مصدر القيمة' })).status, 200);
  const due = (await hamad.get(`${S}/updates`)).data.due;
  assert.ok(due.some((d) => d.state === 'returned' && d.actual_id === mine.actual_id && /مصدر/.test(d.review_comment)));
  const alerts = (await hamad.get('/api/alerts')).data;
  assert.ok(alerts.some((a) => /أُعيدت قيمة المؤشر/.test(a.title)));
  // resubmission goes back to the queue
  const again = await hamad.post(`${S}/kpis/${mine.kpi_id}/actuals`, { value: 71, period: mine.period, note: 'مع المصدر' });
  assert.equal(again.status, 200);
  assert.equal(again.data.resubmitted, true);
});

test('initiatives show linked project progress only within the viewer’s own project scope', async () => {
  const sara = (await (await as('sara')).get(`${S}/initiatives/si_01`)).data; // IT, member of pr_portal
  assert.equal(sara.project.available, true);
  assert.equal(sara.project.name, 'البوابة الموحدة');
  const fatima = (await (await as('fatima')).get(`${S}/initiatives/si_01`)).data; // Operations: no access to pr_portal
  assert.deepEqual(fatima.project, { available: false });
  assert.equal(fatima.has_project, true);
  const list = (await (await as('fatima')).get(`${S}/initiatives`)).data.rows;
  assert.ok(!JSON.stringify(list.map((i) => i.project)).includes('pr_portal'));
  assert.equal((await (await as('fatima')).get(`${S}/initiatives/nope`)).status, 404);
  // milestones: initiative owner or SPMO only
  const ms = sara.milestones.find((m) => !m.done);
  assert.equal((await (await as('ahmed')).post(`${S}/initiatives/si_01/milestones/${ms.id}/toggle`, { done: true })).status, 403);
  assert.equal((await (await as('mariam')).post(`${S}/initiatives/si_01/milestones/${ms.id}/toggle`, { done: true })).status, 200);
  assert.equal((await (await as('mariam')).post(`${S}/initiatives/si_01/milestones/nope/toggle`, {})).status, 404);
  // linking a project the actor cannot see is refused without revealing it
  assert.equal((await (await as('mariam')).put(`${S}/initiatives/si_01/project`, { project_id: 'pr_service' })).status, 404);
});

test('administration is SPMO-only, validated, confirmed and audited', async () => {
  const latifa = await as('latifa');
  for (const u of ['hessa', 'mariam', 'ahmed', 'president']) assert.equal((await (await as(u)).get(`${S}/admin`)).status, 403, u);
  assert.equal((await (await as('hessa')).post(`${S}/admin/pillars`, { code: 'P9', title_ar: 'محور تجريبي' })).status, 403);
  assert.equal((await (await as('hessa')).post(`${S}/admin/pillars/sp_p1/delete`, { confirm: true })).status, 403);
  assert.equal((await latifa.post(`${S}/admin/pillars`, { code: 'P 9', title_ar: 'محور' })).status, 400, 'bad code');
  assert.equal((await latifa.post(`${S}/admin/pillars`, { code: 'P1', title_ar: 'محور مكرر' })).status, 409, 'duplicate code');
  const p = await latifa.post(`${S}/admin/pillars`, { code: 'P5', title_ar: 'استدامة وابتكار', title_en: 'Sustainability & innovation', weight: 1 });
  assert.equal(p.status, 200);
  const o = await latifa.post(`${S}/admin/objectives`, { pillar_id: p.data.id, code: 'SO-5.1', title_ar: 'خفض البصمة الكربونية للمباني', owner_dept_id: 'dept_ops', weight: 1 });
  assert.equal(o.status, 200);
  const k = await latifa.post(`${S}/admin/kpis`, { objective_id: o.data.id, code: 'KPI-5.1.1', name_ar: 'نسبة خفض استهلاك الطاقة', unit_ar: '%', direction: 'higher', frequency: 'quarterly', measure: 'level', owner_dept_id: 'dept_ops', owner_user_id: 'u_fatima', max_value: 100, targets: [{ year: 2026, target: 10 }] });
  assert.equal(k.status, 200);
  assert.equal((await latifa.post(`${S}/admin/kpis`, { objective_id: o.data.id, code: 'KPI-5.1.2', name_ar: 'مؤشر', direction: 'sideways', frequency: 'quarterly', owner_dept_id: 'dept_ops' })).status, 400);
  // deleting needs an explicit confirmation, and structure with children is protected
  assert.equal((await latifa.post(`${S}/admin/pillars/${p.data.id}/delete`, {})).status, 428);
  assert.equal((await latifa.post(`${S}/admin/pillars/${p.data.id}/delete`, { confirm: true })).status, 409);
  assert.equal((await latifa.post(`${S}/admin/kpis/${k.data.id}/delete`, {})).status, 428);
  assert.equal((await latifa.post(`${S}/admin/kpis/${k.data.id}/delete`, { confirm: true })).status, 200);
  assert.equal((await latifa.post(`${S}/admin/objectives/${o.data.id}/delete`, { confirm: true })).status, 200);
  assert.equal((await latifa.post(`${S}/admin/pillars/${p.data.id}/delete`, { confirm: true })).status, 200);
  // a KPI with reported history cannot be deleted — only archived
  assert.equal((await latifa.post(`${S}/admin/kpis/sk_111/delete`, { confirm: true })).status, 409);
  assert.equal((await latifa.post(`${S}/admin/kpis/sk_111/archive`, {})).status, 428);
  assert.equal((await latifa.post(`${S}/admin/kpis/sk_111/archive`, { confirm: true })).status, 200);
  assert.ok(!(await latifa.get(`${S}/kpis`)).data.rows.some((r) => r.code === 'KPI-1.1.1'));
  assert.equal((await latifa.post(`${S}/admin/kpis/sk_111/restore`, {})).status, 200);
  assert.ok((await latifa.get(`${S}/kpis`)).data.rows.some((r) => r.code === 'KPI-1.1.1'));
});

test('home workspace cards follow the same scope as the system', async () => {
  const card = async (u) => ((await (await as(u)).get('/api/workspace')).data.find((w) => w.system === 'strategy')?.cards || []);
  const lat = await card('latifa');
  assert.ok(lat.some((c) => c.title_en === 'Actuals awaiting your validation'));
  assert.ok(lat.some((c) => c.title_en === 'Off-track KPIs'));
  assert.ok(lat.length <= 3);
  const omar = await card('omar');
  assert.ok(omar.some((c) => c.title_en === 'My department’s objectives'));
  assert.ok(!omar.some((c) => c.title_en === 'Actuals awaiting your validation'));
  const saeed = await card('saeed'); // internal auditor: owns no KPI, not a manager
  assert.deepEqual(saeed, []);
  const pres = await card('president');
  assert.ok(pres.some((c) => c.title_en === 'Strategic plan status'));
});

test('Ask AI: tools and intents act within the same authorisation', async () => {
  const ahmed = await as('ahmed');
  const token = (await ahmed.post('/api/me/tokens', { label: 'test' })).data.token;
  const mcp = async (name, args) => (await ahmed.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { authorization: `Bearer ${token}` })).data.result;
  const list = await mcp('strategy_kpis', { status: 'off_track' });
  assert.equal(list.isError, false);
  assert.ok(list.structuredContent.result.rows.every((r) => r.status === 'off_track'));
  const denied = await mcp('strategy_submit_actual', { kpi: 'KPI-2.1.1', value: 90 }); // Finance KPI, not his
  assert.equal(denied.isError, true);
  assert.match(denied.structuredContent.error, /لمالكه/);
  // rule-based planner
  const ov = await ahmed.chat('ما وضع الخطة الاستراتيجية؟');
  assert.match(ov.final.text, /نسبة التحقق الإجمالية/);
  const off = await ahmed.chat('اعرض المؤشرات المتعثرة');
  assert.match(off.final.text, /خارج المسار/);
  const fat = await as('fatima');
  const sub = await fat.chat('أدخل قيمة مؤشر رضا المتعاملين = 88.4');
  assert.ok(/رُصدت|أُعيد رصد|لا يمكن|معتمدة/.test(sub.final.text), sub.final.text);
  // intents never capture platform commands
  const t = await fat.chat('أضف مهمة مراجعة المؤشرات غداً');
  assert.ok(!/نسبة التحقق الإجمالية/.test(t.final.text));
});

test('excellence points are derived from on-time reports by the KPI owner', async () => {
  const g = (await (await as('ahmed')).get('/api/game/me')).data;
  assert.ok(g.rules.some((r) => r.key === 'strategy_actual_on_time' && r.points === 8));
  const hessa = (await (await as('hessa')).get('/api/game/me')).data;
  assert.ok(hessa.xp >= 8, 'seeded on-time reports earn points');
});
