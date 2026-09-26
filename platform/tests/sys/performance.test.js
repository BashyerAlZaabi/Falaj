// Performance Management — end-to-end workflow, visibility, isolation, SoD,
// aggregated views, Ask AI policy, workspace cards and validation.
// Tests run in order against one stack (state carries over between tests).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done, stack } from './_stack.js';
import { Client } from '../helpers.js';

after(done);

const Y = new Date().getUTCFullYear();
const RID = (u, y = Y) => `pr_demo_${y}_${u}`;
const CUR = `pc_demo_${Y}`;
const P = '/api/sys/performance';
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const ratingsBody = (r, v = 4, submit = false, comment = 'أداء متميز والتزام واضح بالمواعيد والجودة طوال الدورة.') => ({
  objectives: r.objectives.map((o) => ({ objective_id: o.id, rating: v })),
  competencies: r.competencies.map((c) => ({ competency_id: c.id, rating: v })),
  comment, submit,
});

test('role-aware landing: employee, manager, HR and president see different entry points', async () => {
  const expect = { ahmed: 'mine', mariam: 'team', hessa: 'hr', salem: 'hr', president: 'team', fatima: 'mine' };
  for (const [u, landing] of Object.entries(expect)) {
    const b = (await (await as(u)).get(`${P}/`)).data;
    assert.equal(b.me.landing, landing, u);
  }
  const pres = (await (await as('president')).get(`${P}/`)).data.me;
  assert.equal(pres.is_president, true); assert.equal(pres.has_review, false); assert.equal(pres.team_count, 7);
  const ahmed = (await (await as('ahmed')).get(`${P}/`)).data;
  assert.equal(ahmed.me.has_team, false); assert.equal(ahmed.me.is_hr, false);
  assert.equal(ahmed.current.phase, 'self_assessment');
});

test('external identities cannot reach the system at all', async () => {
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    for (const p of ['/', '/mine', '/hr', '/insights', `/reviews/${RID('ahmed')}`]) assert.equal((await c.get(`${P}${p}`)).status, 403, `${u} ${p}`);
    assert.equal((await c.put(`${P}/reviews/${RID('ahmed')}/self`, { comment: 'x' })).status, 403);
    const ws = (await c.get('/api/workspace')).data;
    assert.ok(!ws.some?.((s) => s.system === 'performance'), u);
  }
});

test('the manager’s draft stays hidden from the employee (and from HR) until submitted', async () => {
  const fatima = (await (await as('fatima')).get(`${P}/mine`)).data.review;
  assert.equal(fatima.id, RID('fatima'));
  assert.equal(fatima.assessment_visible, false);
  assert.ok(fatima.objectives.every((o) => !('mgr_rating' in o)));
  assert.deepEqual(fatima.comp_ratings, []);
  assert.ok(!('band' in fatima) && !('has_draft' in fatima));
  const omar = (await (await as('omar')).get(`${P}/reviews/${RID('fatima')}`)).data;
  assert.equal(omar.relation, 'manager'); assert.equal(omar.has_draft, true);
  assert.ok(omar.objectives.some((o) => o.mgr_rating != null));
  const hr = (await (await as('hessa')).get(`${P}/reviews/${RID('fatima')}`)).data;
  assert.equal(hr.relation, 'hr'); assert.equal(hr.assessment_visible, false);
  assert.ok(hr.objectives.every((o) => !('mgr_rating' in o)));
  // …and ahmed's unsent self-assessment draft is invisible to his manager
  const draft = (await (await as('mariam')).get(`${P}/reviews/${RID('ahmed')}`)).data;
  assert.equal(draft.self_visible, false);
  assert.ok(draft.objectives.every((o) => !('self_pct' in o)));
});

test('IDOR: reviews outside the viewer’s scope are 404 (peers, other departments, other managers, admin, president)', async () => {
  const cases = [['ahmed', 'sara'], ['ahmed', 'omar'], ['sara', 'ahmed'], ['majed', 'ahmed'], ['omar', 'noura'], ['mariam', 'fatima'], ['president', 'ahmed'], ['latifa', 'saeed'], ['noura', 'reem']];
  for (const [viewer, owner] of cases) {
    const c = await as(viewer);
    assert.equal((await c.get(`${P}/reviews/${RID(owner)}`)).status, 404, `${viewer} → ${owner}`);
    assert.equal((await c.put(`${P}/reviews/${RID(owner)}/assessment`, { comment: 'x' })).status, 404, `${viewer} writes ${owner}`);
  }
  assert.equal((await (await as('president')).get(`${P}/reviews/${RID('mariam')}`)).status, 200); // he is her line manager
  assert.equal((await (await as('majed')).get(`${P}/reviews/${RID('reem')}`)).status, 200); // procurement sits under finance
  assert.equal((await (await as('ahmed')).get(`${P}/reviews/nope`)).status, 404);
});

test('lists, counts and workspace cards follow the same scope', async () => {
  const mt = (await (await as('mariam')).get(`${P}/team`)).data;
  assert.deepEqual(mt.reviews.map((r) => r.employee.id).sort(), ['u_ahmed', 'u_sara']);
  assert.equal(mt.stats.total, 2);
  const pt = (await (await as('president')).get(`${P}/team`)).data;
  assert.equal(pt.reviews.length, 7);
  assert.ok(pt.reviews.every((r) => r.employee.role === 'manager'));
  assert.equal((await (await as('ahmed')).get(`${P}/team`)).data.reviews.length, 0);
  // HR console and aggregated insights are capability/role gated — the platform admin gets nothing extra
  for (const u of ['mariam', 'ahmed', 'omar', 'yousef']) assert.equal((await (await as(u)).get(`${P}/hr`)).status, 403, u);
  for (const u of ['mariam', 'ahmed', 'aisha']) assert.equal((await (await as(u)).get(`${P}/insights`)).status, 403, u);
  const hr = (await (await as('salem')).get(`${P}/hr`)).data;
  assert.equal(hr.reviews.length, 15);
  const own = hr.reviews.find((r) => r.employee.id === 'u_salem');
  assert.equal(own.relation, 'employee'); // HR sees their own row as an employee (no calibration preview)
  // workspace
  const cards = async (u) => ((await (await as(u)).get('/api/workspace')).data.find((s) => s.system === 'performance')?.cards || []);
  const aw = await cards('ahmed');
  assert.deepEqual(aw.map((c) => c.title_en), ['My performance review']);
  const mw = await cards('omar');
  const team = mw.find((c) => c.title_en === 'Team reviews awaiting you');
  assert.ok(team && team.items.every((i) => i.title === 'فاطمة الحمادي'));
  assert.ok((await cards('hessa')).some((c) => c.href === '#/sys/performance/hr'));
  assert.ok(!(await cards('president')).some((c) => c.href === '#/sys/performance/hr'));
});

test('president sees aggregated distributions only, suppressed below the minimum group size', async () => {
  const pres = await as('president');
  const ins = (await pres.get(`${P}/insights`)).data;
  assert.equal(ins.min_group, 5);
  assert.equal(ins.distribution.suppressed, true); assert.equal(ins.distribution.bands, null);
  assert.equal(ins.previous.distribution.n, 15);
  assert.equal(ins.previous.distribution.bands.reduce((s, b) => s + b.count, 0), 15);
  const raw = JSON.stringify(ins);
  for (const leak of ['u_ahmed', 'أحمد', 'Ahmed', 'pr_demo', 'score']) assert.ok(!raw.includes(leak), leak);
});

test('Ask AI: the opt-in domain refuses tools until the user enables it; scope is unchanged afterwards', async () => {
  const s = await stack();
  const mariam = await as('mariam');
  const token = (await mariam.post('/api/me/tokens', { label: 'perf test' })).data.token;
  const mcp = new Client(s.portal);
  const call = (name, args = {}) => mcp.post('/mcp', { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }, { authorization: `Bearer ${token}` });
  const list = await mcp.post('/mcp', { jsonrpc: '2.0', id: 2, method: 'tools/list' }, { authorization: `Bearer ${token}` });
  assert.ok(!list.data.result.tools.some((t) => t.name.startsWith('performance_')));
  let r = await call('performance_team_status');
  assert.equal(r.data.result.isError, true);
  assert.match(r.data.result.structuredContent.error, /سياسة البيانات/);
  const chat = await mariam.chat('ما حالة تقييمات فريقي؟');
  assert.match(chat.final.text, /سياسة البيانات|لا تسمح/);
  assert.equal((await mariam.put('/api/systems/performance/prefs', { ai_enabled: true })).status, 200);
  r = await call('performance_team_status');
  assert.equal(r.data.result.isError, false);
  const res = r.data.result.structuredContent.result;
  assert.deepEqual(res.members.map((m) => m.name_ar).sort(), ['أحمد الشامسي', 'سارة النعيمي']);
  assert.ok(!JSON.stringify(res).includes('band'));
  const chat2 = await mariam.chat('حالة تقييمات فريقي');
  assert.match(chat2.final.text, /سارة النعيمي/);
  // another user's opt-in state is independent
  const aTok = (await (await as('ahmed')).post('/api/me/tokens', {})).data.token;
  const r2 = await mcp.post('/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'performance_my_review', arguments: {} } }, { authorization: `Bearer ${aTok}` });
  assert.equal(r2.data.result.isError, true);
  // the rule-based planner routes «مراجعة أدائي» to the same tool, under the same policy
  const ahmed = await as('ahmed');
  assert.match((await ahmed.chat('مراجعة أدائي')).final.text, /سياسة البيانات|لا تسمح/);
  await ahmed.put('/api/systems/performance/prefs', { ai_enabled: true });
  const mine = await ahmed.chat('ما هو تقييمي؟');
  assert.match(mine.final.text, new RegExp(`دورة تقييم الأداء ${Y}`));
  assert.match(mine.final.text, /أكمل تقييمك الذاتي/);
  await ahmed.put('/api/systems/performance/prefs', { ai_enabled: false });
});

test('validation errors are 400', async () => {
  const ahmed = await as('ahmed');
  const r = (await ahmed.get(`${P}/mine`)).data.review;
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/self`, { items: [{ objective_id: r.objectives[0].id, pct: 150 }] })).status, 400);
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/self`, { items: [], hacked: true })).status, 400);
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/self`, { items: [{ objective_id: 'po_nope', pct: 50 }] })).status, 400);
  const mariam = await as('mariam');
  assert.equal((await mariam.put(`${P}/reviews/${RID('sara')}/assessment`, { objectives: [{ objective_id: 'x', rating: 9 }] })).status, 400);
  assert.equal((await (await as('hessa')).post(`${P}/reviews/${RID('sara')}/calibrate`, { band: 'legendary' })).status, 400);
  assert.equal((await (await as('hessa')).post(`${P}/cycles`, { year: 'next', phases: {} })).status, 400);
});

test('self-assessment: draft is private, submission is validated, notifies the manager and cannot be repeated', async () => {
  const ahmed = await as('ahmed'); const mariam = await as('mariam');
  const r = (await ahmed.get(`${P}/mine`)).data.review;
  assert.equal(r.can.self, true);
  const items = r.objectives.map((o, i) => ({ objective_id: o.id, pct: 70 + i * 10, note: 'تم الإنجاز وفق الخطة' }));
  assert.equal((await mariam.put(`${P}/reviews/${r.id}/self`, { items })).status, 403); // only the employee writes it
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/self`, { items, comment: '' })).status, 200); // draft
  assert.equal((await mariam.get(`${P}/reviews/${r.id}`)).data.self_visible, false);
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/self`, { items, comment: 'قصير', submit: true })).status, 400);
  const ok = await ahmed.put(`${P}/reviews/${r.id}/self`, { items, comment: 'أنجزت معظم الأهداف في موعدها وأحتاج دعماً في الترحيل السحابي.', submit: true });
  assert.equal(ok.status, 200); assert.equal(ok.data.status, 'self_submitted');
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/self`, { items, submit: true })).status, 409);
  const seen = (await mariam.get(`${P}/reviews/${r.id}`)).data;
  assert.equal(seen.self_visible, true); assert.equal(seen.objectives[0].self_pct, 70);
  const alerts = (await mariam.get('/api/alerts')).data;
  assert.ok(alerts.some((a) => a.title.includes('أحمد الشامسي') && a.entity === 'sys:performance'));
  const g = (await ahmed.get('/api/game/me')).data;
  assert.ok(g.rules.some((x) => x.key === 'perf_self_on_time' && x.points === 10));
});

test('forbidden transitions in the wrong phase or state are 409', async () => {
  const ahmed = await as('ahmed'); const mariam = await as('mariam'); const hessa = await as('hessa');
  const r = (await mariam.get(`${P}/reviews/${RID('sara')}`)).data;
  const objs = r.objectives.map((o) => ({ id: o.id, title: o.title, measure: o.measure || '', weight: o.weight }));
  assert.equal((await mariam.put(`${P}/reviews/${r.id}/objectives`, { objectives: objs })).status, 409); // objectives already agreed
  assert.equal((await mariam.post(`${P}/reviews/${r.id}/agree`)).status, 409);
  assert.equal((await mariam.post(`${P}/reviews/${r.id}/reopen`)).status, 409); // only in goal setting / mid-year
  assert.equal((await hessa.post(`${P}/reviews/${r.id}/calibrate`, { band: 'meets', justification: 'مبرر موثق بالأدلة للتعديل' })).status, 409); // not the calibration phase
  assert.equal((await (await as('sara')).post(`${P}/reviews/${r.id}/acknowledge`, {})).status, 409);
  assert.equal((await mariam.put(`${P}/reviews/${r.id}/assessment`, ratingsBody(r, 3, true))).status, 409); // already submitted
  assert.equal((await ahmed.put(`${P}/reviews/${RID('ahmed')}/midyear`, { note: 'ملاحظة متأخرة' })).status, 409);
});

test('manager assessment: nobody assesses themselves; incomplete submissions are refused; the score is computed server-side', async () => {
  const ahmed = await as('ahmed'); const mariam = await as('mariam');
  const r = (await mariam.get(`${P}/reviews/${RID('ahmed')}`)).data;
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/assessment`, ratingsBody(r))).status, 403);
  assert.equal((await ahmed.post(`${P}/reviews/${r.id}/agree`)).status, 403);
  const partial = ratingsBody(r, 4, true); partial.competencies = partial.competencies.slice(0, 2);
  assert.equal((await mariam.put(`${P}/reviews/${r.id}/assessment`, partial)).status, 400);
  assert.equal((await mariam.put(`${P}/reviews/${r.id}/assessment`, ratingsBody(r, 4, true, 'قصير'))).status, 400);
  // save a draft first: still hidden from the employee
  assert.equal((await mariam.put(`${P}/reviews/${r.id}/assessment`, ratingsBody(r, 4))).status, 200);
  assert.equal((await ahmed.get(`${P}/mine`)).data.review.assessment_visible, false);
  const body = ratingsBody(r, 4, true);
  body.objectives[0].rating = 5;
  const out = await mariam.put(`${P}/reviews/${r.id}/assessment`, body);
  assert.equal(out.status, 200); assert.equal(out.data.status, 'assessed');
  const w = r.objectives.reduce((s, o) => s + o.weight, 0);
  const obj = r.objectives.reduce((s, o, i) => s + o.weight * (i === 0 ? 5 : 4), 0) / w;
  const expected = Math.round((0.7 * obj + 0.3 * 4) * 100) / 100;
  assert.equal(out.data.score, expected);
  assert.equal(out.data.band, expected >= 4.5 ? 'exceptional' : 'exceeds');
  const mine = (await ahmed.get(`${P}/mine`)).data.review;
  assert.equal(mine.assessment_visible, true); assert.equal(mine.objectives[0].mgr_rating, 5);
  assert.ok(!('final_band' in mine)); // calibration not released yet
  assert.ok((await ahmed.get('/api/alerts')).data.some((a) => a.entity === 'sys:performance' && /مديرك/.test(a.title)));
});

test('AI-assisted comment is for the manager only and falls back transparently without a model or opt-in', async () => {
  const hessa = await as('hessa');
  const d = await hessa.post(`${P}/reviews/${RID('salem')}/draft-comment`, { lang: 'ar' });
  assert.equal(d.status, 200); assert.equal(d.data.source, 'local');
  assert.match(d.data.label_ar, /محلي|محلية/);
  assert.ok(d.data.text.length > 20);
  assert.equal((await (await as('salem')).post(`${P}/reviews/${RID('salem')}/draft-comment`, {})).status, 403);
  await hessa.put('/api/systems/performance/prefs', { ai_enabled: true });
  const d2 = await hessa.post(`${P}/reviews/${RID('salem')}/draft-comment`, {});
  assert.equal(d2.data.source, 'local'); assert.equal(d2.data.reason, 'no_model');
  assert.match(d2.data.label_ar, /نموذج الذكاء الاصطناعي غير متصل/);
});

test('cycle advance: HR only, explicit confirmation, one step at a time, alerts managers', async () => {
  assert.equal((await (await as('mariam')).post(`${P}/cycles/${CUR}/advance`, { to: 'manager_assessment', confirm: true })).status, 403);
  const hessa = await as('hessa');
  assert.equal((await hessa.post(`${P}/cycles/${CUR}/advance`, { to: 'manager_assessment' })).status, 428);
  assert.equal((await hessa.post(`${P}/cycles/${CUR}/advance`, { to: 'calibration', confirm: true })).status, 409);
  const ok = await hessa.post(`${P}/cycles/${CUR}/advance`, { to: 'manager_assessment', confirm: true });
  assert.equal(ok.status, 200); assert.equal(ok.data.cycle.phase, 'manager_assessment');
  assert.ok((await (await as('majed')).get('/api/alerts')).data.some((a) => a.entity === 'sys:performance' && /تقييم المدراء/.test(a.title)));
  assert.ok(!(await (await as('latifa')).get('/api/alerts')).data.some((a) => a.entity === 'sys:performance' && /تقييم المدراء/.test(a.title))); // nothing left for her to assess
});

test('manager may submit without a self-assessment only after the self-assessment window has closed', async () => {
  const pres = await as('president'); const hessa = await as('hessa');
  const omar = (await pres.get(`${P}/reviews/${RID('omar')}`)).data;
  assert.equal(omar.status, 'active');
  assert.equal((await pres.put(`${P}/reviews/${omar.id}/assessment`, ratingsBody(omar, 3, true))).status, 409);
  const phases = { goal_setting: { starts_on: day(-235), ends_on: day(-205) }, midyear: { starts_on: day(-110), ends_on: day(-85) }, self_assessment: { starts_on: day(-12), ends_on: day(-1) }, manager_assessment: { starts_on: day(0), ends_on: day(10) }, calibration: { starts_on: day(11), ends_on: day(20) }, acknowledgement: { starts_on: day(21), ends_on: day(30) } };
  assert.equal((await hessa.put(`${P}/cycles/${CUR}/phases`, { phases: { ...phases, calibration: { starts_on: day(12), ends_on: day(11) } } })).status, 400);
  assert.equal((await (await as('salem')).put(`${P}/cycles/${CUR}/phases`, { phases })).status, 200);
  const out = await pres.put(`${P}/reviews/${omar.id}/assessment`, ratingsBody(omar, 3, true));
  assert.equal(out.status, 200); assert.equal(out.data.no_self, true);
  // HR director assesses her own report (salem) as his manager — needed for the SoD check below
  const salem = (await hessa.get(`${P}/reviews/${RID('salem')}`)).data;
  assert.equal((await hessa.put(`${P}/reviews/${salem.id}/assessment`, ratingsBody(salem, 4, true))).status, 200);
  const fat = (await (await as('omar')).get(`${P}/reviews/${RID('fatima')}`)).data;
  assert.equal((await (await as('omar')).put(`${P}/reviews/${fat.id}/assessment`, ratingsBody(fat, 3, true, 'أداء يلبي التوقعات مع تقدم واضح في مركز خدمة المتعاملين.'))).status, 200);
});

test('calibration: HR only, mandatory justification for changes, no calibrating your own review or your own assessment', async () => {
  const hessa = await as('hessa'); const salem = await as('salem');
  assert.equal((await hessa.post(`${P}/cycles/${CUR}/advance`, { to: 'calibration', confirm: true })).status, 200);
  assert.equal((await (await as('mariam')).post(`${P}/reviews/${RID('sara')}/calibrate`, { band: 'exceeds' })).status, 403);
  assert.equal((await salem.post(`${P}/reviews/${RID('salem')}/calibrate`, { band: 'meets', justification: 'محاولة معايرة المراجعة الذاتية' })).status, 403);
  assert.equal((await hessa.post(`${P}/reviews/${RID('salem')}/calibrate`, { band: 'meets', justification: 'قيّمته بنفسي ولا يجوز أن أعايره' })).status, 403);
  assert.equal((await hessa.post(`${P}/reviews/${RID('ahmed')}/calibrate`, { band: 'meets' })).status, 400);
  const ok = await hessa.post(`${P}/reviews/${RID('ahmed')}/calibrate`, { band: 'meets', justification: 'لضمان الاتساق مع نتائج إدارة التحول الرقمي ومؤشرات المشاريع المتأخرة.' });
  assert.equal(ok.status, 200); assert.equal(ok.data.final_band, 'meets'); assert.equal(ok.data.calibrations.length, 1);
  assert.equal((await salem.post(`${P}/reviews/${RID('sara')}/calibrate`, { band: (await salem.get(`${P}/reviews/${RID('sara')}`)).data.band })).status, 200); // confirm unchanged
  // not released yet: neither the employee nor the manager sees the calibration
  const mine = (await (await as('ahmed')).get(`${P}/mine`)).data.review;
  assert.equal(mine.calibration_visible, false); assert.ok(!('final_band' in mine) && !('calibration_note' in mine));
  const mgr = (await (await as('mariam')).get(`${P}/reviews/${RID('ahmed')}`)).data;
  assert.ok(!('calibration_note' in mgr));
  const hrv = (await hessa.get(`${P}/hr`)).data;
  assert.equal(hrv.stats.calibrated, 2); assert.equal(hrv.stats.adjusted, 1);
});

test('acknowledgement: results released, disagreement routed to HR, answered by HR, visible only to the employee and HR', async () => {
  const hessa = await as('hessa'); const ahmed = await as('ahmed'); const mariam = await as('mariam');
  assert.equal((await hessa.post(`${P}/cycles/${CUR}/advance`, { to: 'acknowledgement', confirm: true })).status, 200);
  const mine = (await ahmed.get(`${P}/mine`)).data.review;
  assert.equal(mine.final_band, 'meets'); assert.match(mine.calibration_note, /الاتساق/);
  assert.equal(mine.can.acknowledge, true);
  assert.equal((await mariam.post(`${P}/reviews/${mine.id}/acknowledge`, {})).status, 403);
  assert.equal((await ahmed.post(`${P}/reviews/${mine.id}/acknowledge`, { disagree: true, note: 'لا' })).status, 400);
  const ack = await ahmed.post(`${P}/reviews/${mine.id}/acknowledge`, { disagree: true, note: 'أرى أن إنجازي في ربط الهوية الرقمية لم ينعكس في النتيجة النهائية.' });
  assert.equal(ack.status, 200); assert.equal(ack.data.status, 'acknowledged'); assert.equal(ack.data.disagreement_status, 'open');
  assert.equal((await ahmed.post(`${P}/reviews/${mine.id}/acknowledge`, {})).status, 409);
  const alerts = (await (await as('salem')).get('/api/alerts')).data;
  const al = alerts.find((a) => a.entity === 'sys:performance' && /اعتراض/.test(a.title));
  assert.ok(al); assert.ok(!al.body.includes('الهوية الرقمية')); // the note itself is not copied into alerts
  const mgrView = (await mariam.get(`${P}/reviews/${mine.id}`)).data;
  assert.ok(!('disagreement' in mgrView) && !('disagreement_status' in mgrView));
  assert.equal((await hessa.get(`${P}/hr`)).data.disagreements.length, 1);
  assert.equal((await hessa.post(`${P}/reviews/${mine.id}/resolve`, { response: 'قصير' })).status, 400);
  const res = await hessa.post(`${P}/reviews/${mine.id}/resolve`, { response: 'راجعنا ملاحظتك مع المديرة وأُضيف إنجاز ربط الهوية الرقمية إلى ملفك.' });
  assert.equal(res.status, 200);
  assert.equal((await hessa.post(`${P}/reviews/${mine.id}/resolve`, { response: 'رد مكرر على الملاحظة نفسها' })).status, 409);
  const after2 = (await ahmed.get(`${P}/mine`)).data.review;
  assert.match(after2.hr_response, /الهوية الرقمية/);
  // access log: the employee sees who else viewed or changed the review (not themselves)
  assert.ok(after2.access_log.some((x) => x.user_id === 'u_hessa'));
  assert.ok(after2.access_log.some((x) => x.user_id === 'u_mariam' && x.action === 'assess_submit'));
  assert.ok(!after2.access_log.some((x) => x.user_id === 'u_ahmed'));
});

test('a new cycle needs confirmation; objectives are 3–7 weighted to 100, agreed by the manager (never by the employee)', async () => {
  const hessa = await as('hessa');
  const Y2 = Y + 1;
  const d = (m, dd) => `${Y2}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
  const phases = { goal_setting: { starts_on: d(1, 10), ends_on: d(2, 10) }, midyear: { starts_on: d(6, 1), ends_on: d(6, 30) }, self_assessment: { starts_on: d(10, 20), ends_on: d(11, 5) }, manager_assessment: { starts_on: d(11, 6), ends_on: d(11, 25) }, calibration: { starts_on: d(11, 26), ends_on: d(12, 5) }, acknowledgement: { starts_on: d(12, 6), ends_on: d(12, 20) } };
  assert.equal((await hessa.post(`${P}/cycles`, { year: Y2, phases, confirm: true })).status, 409); // current cycle still open
  assert.equal((await hessa.post(`${P}/cycles/${CUR}/advance`, { to: 'closed', confirm: true })).status, 200);
  assert.equal((await (await as('mariam')).post(`${P}/cycles`, { year: Y2, phases, confirm: true })).status, 403);
  assert.equal((await hessa.post(`${P}/cycles`, { year: Y2, phases })).status, 428);
  assert.equal((await hessa.post(`${P}/cycles`, { year: Y2, phases: { ...phases, midyear: { starts_on: d(1, 20), ends_on: d(1, 25) } }, confirm: true })).status, 400);
  const c = await hessa.post(`${P}/cycles`, { year: Y2, phases, confirm: true });
  assert.equal(c.status, 200); assert.ok(c.data.reviews >= 15); assert.equal(c.data.cycle.phase, 'goal_setting');
  const ahmed = await as('ahmed'); const mariam = await as('mariam');
  const r = (await ahmed.get(`${P}/mine`)).data.review;
  assert.equal(r.status, 'planning'); assert.equal(r.can.edit_objectives, true); assert.equal(r.can.agree, false);
  const imp = await ahmed.post(`${P}/reviews/${r.id}/import-goals`);
  assert.equal(imp.status, 200); assert.equal(typeof imp.data.imported, 'number');
  const eight = Array.from({ length: 8 }, (_, i) => ({ title: `هدف تجريبي رقم ${i + 1}`, weight: 12 }));
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/objectives`, { objectives: eight })).status, 400);
  const two = [{ title: 'رفع جاهزية الأنظمة الحرجة', measure: 'توافر 99.5%', weight: 50 }, { title: 'أتمتة النسخ الاحتياطي', weight: 50 }];
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/objectives`, { objectives: two })).status, 200);
  assert.equal((await ahmed.post(`${P}/reviews/${r.id}/agree`)).status, 403); // nobody agrees their own objectives
  assert.equal((await mariam.post(`${P}/reviews/${r.id}/agree`)).status, 409); // only 2 objectives
  const three = [...two.map((o) => ({ ...o, weight: 35 })), { title: 'توثيق إجراءات الاستعادة من الكوارث', weight: 30 }];
  const saved = await ahmed.put(`${P}/reviews/${r.id}/objectives`, { objectives: three });
  assert.equal(saved.data.objectives_ready, true);
  assert.equal((await (await as('sara')).post(`${P}/reviews/${r.id}/agree`)).status, 404);
  const agreed = await mariam.post(`${P}/reviews/${r.id}/agree`);
  assert.equal(agreed.status, 200); assert.equal(agreed.data.status, 'active');
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/objectives`, { objectives: three })).status, 409);
  assert.equal((await mariam.post(`${P}/reviews/${r.id}/reopen`)).status, 200);
});

test('mid-year check-in: employee and manager each write their own note, only in the mid-year phase', async () => {
  const hessa = await as('hessa'); const ahmed = await as('ahmed'); const mariam = await as('mariam');
  const r = (await ahmed.get(`${P}/mine`)).data.review;
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/midyear`, { note: 'مبكر جداً' })).status, 409); // still goal setting
  const cyc = (await ahmed.get(`${P}/`)).data.current;
  assert.equal((await hessa.post(`${P}/cycles/${cyc.id}/advance`, { to: 'midyear', confirm: true })).status, 200);
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/midyear`, { note: 'أنجزت نصف أهداف العام وأحتاج دعماً في التوثيق.' })).status, 200);
  const m = await mariam.put(`${P}/reviews/${r.id}/midyear`, { note: 'تقدم جيد؛ نركز على التوثيق في النصف الثاني.' });
  assert.equal(m.status, 200);
  assert.match(m.data.midyear.employee_note, /التوثيق/); assert.match(m.data.midyear.manager_note, /النصف الثاني/);
  assert.equal((await hessa.put(`${P}/reviews/${r.id}/midyear`, { note: 'ملاحظة من الموارد البشرية' })).status, 403);
  assert.equal((await (await as('sara')).put(`${P}/reviews/${r.id}/midyear`, { note: 'ملاحظة زميلة' })).status, 404);
  assert.equal((await ahmed.put(`${P}/reviews/${r.id}/midyear`, {})).status, 400);
});

test('history stays with its cycle: closed-cycle results are released to the employee', async () => {
  const sara = await as('sara');
  const prev = (await sara.get(`${P}/mine?cycle=pc_demo_${Y - 1}`)).data.review;
  assert.equal(prev.status, 'acknowledged'); assert.equal(prev.released, true); assert.ok(prev.final_band);
  const hist = (await sara.get(`${P}/mine`)).data.history;
  assert.ok(hist.length >= 3);
  assert.equal((await sara.get(`${P}/mine?cycle=pc_nope`)).status, 404);
  const fw = (await sara.get(`${P}/framework`)).data;
  assert.equal(fw.competencies.length, 5);
  assert.ok(fw.competencies.every((c) => c.behaviours.length >= 3));
});

test('a fellow manager of the same department is a peer: never sees or assesses the other manager’s review', async () => {
  const mariam = await as('mariam'); // platform admin: promotes sara to a second manager of Digital Transformation
  assert.equal((await mariam.put('/api/admin/users/u_sara', { role: 'manager', confirm: true })).status, 200);
  try {
    const sara = await as('sara');
    assert.equal((await sara.get(`${P}/reviews/${RID('mariam')}`)).status, 404, 'peer manager → 404');
    assert.equal((await sara.put(`${P}/reviews/${RID('mariam')}/assessment`, { comment: 'x' })).status, 404);
    const team = (await sara.get(`${P}/team`)).data;
    assert.ok(!team.reviews.some((r) => r.employee.id === 'u_mariam'), 'not in the peer’s team list');
    assert.ok(team.reviews.some((r) => r.employee.id === 'u_ahmed'), 'the department’s employees still are');
    assert.equal((await mariam.get(`${P}/reviews/${RID('sara')}`)).status, 200, 'sara’s own review stays with her line manager');
  } finally {
    assert.equal((await mariam.put('/api/admin/users/u_sara', { role: 'employee', confirm: true })).status, 200);
  }
});
