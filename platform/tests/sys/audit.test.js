// Internal Audit (+ external auditor portal): workflows, segregation of duties,
// data isolation between departments / roles / external identities, Ask AI
// data policy, workspace cards and derived excellence points.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done, stack } from './_stack.js';

after(done);
const A = (p = '') => `/api/sys/audit${p}`;
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const Y = new Date().getUTCFullYear();

async function mcp(client, name, args = {}) {
  const S = await stack();
  const token = (await client.post('/api/me/tokens', { label: 'audit-test' })).data.token;
  const r = await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  return (await r.json()).result;
}

test('each persona lands on its own role in the audit system', async () => {
  const roles = async (u) => (await (await as(u)).get(A('/me'))).data.roles;
  assert.equal((await roles('aisha')).head, true);
  assert.equal((await roles('saeed')).ia, true);
  assert.equal((await roles('saeed')).head, false);
  assert.equal((await roles('president')).committee, true);
  assert.deepEqual((await roles('majed')).auditee_depts.sort(), ['dept_fin', 'dept_proc']);
  assert.equal((await roles('fatima')).owner, true);
  assert.equal((await roles('rashid')).external, true);
  const mariam = await roles('mariam'); // platform admin: configuration only
  assert.equal(mariam.ia || mariam.committee || mariam.head, false);
});

test('seeded plan: approved, risk-scored universe, six engagements; visible to IA and committee only', async () => {
  const plan = (await (await as('saeed')).get(A('/plan'))).data;
  assert.equal(plan.plan.status, 'approved');
  assert.equal(plan.engagements.length, 6);
  const phases = plan.engagements.map((e) => e.phase).sort();
  assert.deepEqual(phases, ['closed', 'fieldwork', 'follow_up', 'planned', 'planned', 'reporting']);
  const top = plan.universe[0];
  assert.equal(top.score, top.likelihood * top.impact);
  assert.equal(top.rating, 'high');
  assert.equal((await (await as('president')).get(A('/plan'))).status, 200);
  for (const u of ['mariam', 'ahmed', 'majed', 'fatima']) assert.equal((await (await as(u)).get(A('/plan'))).status, 403, u);
  assert.equal((await (await as('rashid')).get(A('/plan'))).status, 403);
});

test('plan approval enforces segregation of duties (no approving your own submission)', async () => {
  const aisha = await as('aisha'); const saeed = await as('saeed');
  const e = await aisha.post(A('/engagements'), { title: 'تدقيق إدارة القضايا والعقود القانونية', department_id: 'dept_legal', quarter: 1, plan_year: Y + 1, universe_id: 'au_legal_cases' });
  assert.equal(e.status, 200);
  assert.equal((await aisha.post(A('/plan/submit'), { year: Y + 1 })).status, 200);
  const blocked = await aisha.post(A('/plan/approve'), { year: Y + 1 });
  assert.equal(blocked.status, 403);
  assert.match(blocked.data.message, /فصل المهام/);
  assert.equal((await saeed.post(A('/plan/approve'), { year: Y + 1 })).status, 403); // not the head
  assert.equal((await aisha.post(A('/plan/return'), { year: Y + 1, note: 'أضف مهمة استمرارية الأعمال' })).status, 200);
  assert.equal((await saeed.post(A('/plan/submit'), { year: Y + 1 })).status, 200);
  const ok = await aisha.post(A('/plan/approve'), { year: Y + 1 });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.plan.status, 'approved');
  assert.equal((await aisha.post(A('/plan/approve'), { year: Y + 1 })).status, 409); // already approved
});

test('end-to-end engagement: launch, information request, working paper, finding, response, follow-up, closure, report', async () => {
  const saeed = await as('saeed'); const aisha = await as('aisha'); const yousef = await as('yousef');
  // create (added after the approved plan) and launch
  const e = (await saeed.post(A('/engagements'), { title: 'تدقيق إجراءات إدارة العقود القانونية', department_id: 'dept_legal', quarter: 4, scope: 'العقود المبرمة خلال العام', objectives: 'التحقق من اكتمال المراجعة القانونية قبل التوقيع' })).data;
  assert.equal(e.added_after_approval, true);
  assert.equal(e.phase, 'planned');
  assert.equal((await yousef.get(A(`/engagements/${e.id}`))).status, 404); // not announced yet
  assert.equal((await saeed.post(A(`/engagements/${e.id}/phase`), { to: 'reporting' })).status, 409); // cannot skip
  assert.equal((await saeed.post(A(`/engagements/${e.id}/phase`), { to: 'planning' })).status, 200);
  assert.equal((await yousef.get(A(`/engagements/${e.id}`))).status, 200); // auditee manager sees it now
  assert.equal((await saeed.post(A(`/engagements/${e.id}/phase`), { to: 'fieldwork' })).status, 200);

  // information request → response with the responder's OWN document → review
  const r = (await saeed.post(A(`/engagements/${e.id}/requests`), { title: 'سجل العقود المبرمة خلال العام', due_date: day(5) })).data;
  assert.equal(r.to.id, 'u_yousef');
  const docId = (await yousef.tool('create_document', { title: 'سجل العقود — ملخص', kind: 'note', content_html: '<p>12 عقداً</p>' })).data.result.id;
  const someoneElsesDoc = (await (await as('sara')).tool('create_document', { title: 'مستند سارة', kind: 'note', content_html: '<p>x</p>' })).data.result.id;
  assert.equal((await yousef.post(A(`/requests/${r.id}/respond`), { response_text: 'مرفق السجل', doc_ids: [someoneElsesDoc] })).status, 400);
  assert.equal((await saeed.post(A(`/requests/${r.id}/respond`), { response_text: 'ليس لي' })).status, 403);
  const resp = (await yousef.post(A(`/requests/${r.id}/respond`), { response_text: 'مرفق سجل العقود المبرمة', doc_ids: [docId] })).data;
  assert.equal(resp.status, 'responded');
  const link = (await saeed.get(A(`/links/${resp.docs[0].id}`))).data;
  assert.match(link.content_html, /12 عقداً/);
  assert.equal((await (await as('majed')).get(A(`/links/${resp.docs[0].id}`))).status, 404);
  assert.equal((await saeed.post(A(`/requests/${r.id}/review`), { decision: 'accept' })).status, 200);

  // working paper (restricted): SoD on review; invisible outside IA
  const wp = (await saeed.post(A(`/engagements/${e.id}/workpapers`), { title: 'فحص عينة من العقود', procedure: 'اختيار 10 عقود', result: 'exception' })).data;
  assert.equal((await saeed.post(A(`/workpapers/${wp.id}/review`), {})).status, 403);
  assert.equal((await yousef.get(A(`/workpapers/${wp.id}`))).status, 404);
  assert.equal((await yousef.get(A(`/engagements/${e.id}/workpapers`))).status, 404);
  assert.equal((await aisha.post(A(`/workpapers/${wp.id}/review`), { note: 'مكتملة' })).status, 200);
  const wpView = (await aisha.get(A(`/workpapers/${wp.id}`))).data;
  assert.ok(wpView.access_log.some((x) => x.action === 'review'));

  // finding: draft invisible to the auditee; issuing needs confirmation
  assert.equal((await saeed.post(A(`/engagements/${e.id}/findings`), { title: 'عقود دون مراجعة قانونية', condition: 'x' })).status, 400); // risk + recommendation missing
  const f = (await saeed.post(A(`/engagements/${e.id}/findings`), { title: 'توقيع عقود دون مراجعة قانونية مسبقة', condition: 'عقدان من عشرة وُقّعا دون مذكرة مراجعة.', risk: 'medium', recommendation: 'اشتراط مذكرة المراجعة قبل التوقيع.' })).data;
  assert.equal((await yousef.get(A(`/findings/${f.id}`))).status, 404);
  assert.equal((await saeed.post(A(`/findings/${f.id}/issue`), { confirm: true })).status, 403); // auditor cannot issue
  assert.equal((await aisha.post(A(`/findings/${f.id}/issue`), {})).status, 428);
  assert.equal((await aisha.post(A(`/findings/${f.id}/issue`), { confirm: true })).status, 200);
  const seen = await yousef.get(A(`/findings/${f.id}`));
  assert.equal(seen.status, 200);
  assert.equal(seen.data.can.respond, true);
  assert.equal(seen.data.raised_by, undefined); // IA-internal fields stay internal

  // management response: owner must be in the manager's own departments; date not in the past
  assert.equal((await yousef.post(A(`/findings/${f.id}/respond`), { position: 'agree', response_text: 'نتفق مع الملاحظة', action_description: 'اعتماد نموذج مذكرة إلزامية', owner_id: 'u_fatima', due_date: day(30) })).status, 400);
  assert.equal((await yousef.post(A(`/findings/${f.id}/respond`), { position: 'agree', response_text: 'نتفق مع الملاحظة', action_description: 'اعتماد نموذج مذكرة إلزامية', owner_id: 'u_yousef', due_date: day(-3) })).status, 400);
  assert.equal((await yousef.post(A(`/findings/${f.id}/respond`), { position: 'agree', response_text: 'نتفق مع الملاحظة', action_description: 'اعتماد نموذج مذكرة مراجعة إلزامية', owner_id: 'u_yousef', due_date: day(30) })).status, 200);
  assert.equal((await yousef.post(A(`/findings/${f.id}/respond`), { position: 'agree', response_text: 'مرة أخرى للمحاولة', action_description: 'تكرار خطة المعالجة للاختبار', owner_id: 'u_yousef', due_date: day(30) })).status, 409);

  // follow-up by the owner, closure validated by the head (not the auditor who raised it)
  assert.equal((await yousef.post(A(`/findings/${f.id}/progress`), { status: 'implemented', note: 'قصير' })).status, 400);
  assert.equal((await yousef.post(A(`/findings/${f.id}/progress`), { status: 'implemented', note: 'اعتُمد النموذج وعُمّم على الإدارات بتعميم رسمي' })).status, 200);
  assert.equal((await saeed.post(A(`/findings/${f.id}/close`), { decision: 'close' })).status, 403);
  assert.equal((await aisha.post(A(`/findings/${f.id}/close`), { decision: 'return' })).status, 400); // reason required
  const closed = (await aisha.post(A(`/findings/${f.id}/close`), { decision: 'close', note: 'تم التحقق' })).data;
  assert.equal(closed.status, 'closed');
  assert.ok(closed.access_log.length >= 3);

  // report: reporting phase → issue (confirmation) → Document owned by the issuer, shared read-only
  assert.equal((await aisha.post(A(`/engagements/${e.id}/issue-report`), { exec_summary: 'ملخص', confirm: true })).status, 409); // still fieldwork
  assert.equal((await saeed.post(A(`/engagements/${e.id}/phase`), { to: 'reporting' })).status, 200);
  const draft = (await saeed.post(A(`/engagements/${e.id}/summary-draft`))).data;
  assert.equal(draft.method, 'local');
  assert.match(draft.note_ar, /تحليل محلي/);
  assert.equal((await saeed.post(A(`/engagements/${e.id}/issue-report`), { exec_summary: draft.text, confirm: true })).status, 403);
  assert.equal((await aisha.post(A(`/engagements/${e.id}/issue-report`), { exec_summary: draft.text })).status, 428);
  const issued = (await aisha.post(A(`/engagements/${e.id}/issue-report`), { exec_summary: draft.text, confirm: true })).data;
  assert.equal(issued.phase, 'follow_up');
  const doc = (await aisha.get(`/api/documents/${issued.document_id}`)).data;
  assert.equal(doc.kind, 'report');
  assert.match(doc.content_html, /جدول الملاحظات/);
  assert.equal((await (await as('president')).get(`/api/documents/${issued.document_id}`)).status, 200);
  assert.equal((await (await as('omar')).get(`/api/documents/${issued.document_id}`)).status, 404);
  assert.equal((await aisha.post(A(`/engagements/${e.id}/phase`), { to: 'closed' })).status, 200);
});

test('the head cannot issue or close a finding she raised herself', async () => {
  const aisha = await as('aisha');
  const f = (await aisha.post(A('/engagements/ae_demo_it_access/findings'), { title: 'ملاحظة أثبتتها رئيسة التدقيق', condition: 'وضع قائم للاختبار', risk: 'low', recommendation: 'توصية للاختبار' })).data;
  const r = await aisha.post(A(`/findings/${f.id}/issue`), { confirm: true });
  assert.equal(r.status, 403);
  assert.match(r.data.message, /فصل المهام/);
  assert.equal((await aisha.post(A(`/findings/${f.id}/withdraw`), {})).status, 428);
  assert.equal((await aisha.post(A(`/findings/${f.id}/withdraw`), { confirm: true })).status, 200);
  assert.equal((await aisha.get(A(`/findings/${f.id}`))).status, 404);
});

test('auditee managers see only their departments’ ISSUED findings and requests addressed to them', async () => {
  const majed = (await (await as('majed')).get(A('/findings'))).data;
  assert.deepEqual(majed.map((f) => f.id).sort(), ['af_demo_06', 'af_demo_07']); // the procurement draft stays in IA
  const mariam = await as('mariam');
  assert.equal((await mariam.get(A('/findings'))).data.length, 0); // IT findings are still drafts
  assert.equal((await mariam.get(A('/findings/af_demo_09'))).status, 404);
  assert.equal((await mariam.get(A('/findings/af_demo_06'))).status, 404); // another department
  const reqs = (await mariam.get(A('/requests'))).data;
  assert.ok(reqs.length === 3 && reqs.every((r) => r.to.id === 'u_mariam'));
  assert.equal((await mariam.get(A('/requests/ar_demo_p1'))).status, 404);
  assert.equal((await mariam.get(A('/engagements/ae_demo_proc'))).status, 404);
  const omar = await as('omar');
  assert.equal((await omar.get(A('/engagements/ae_demo_fin_cash'))).status, 404);
  const eng = (await omar.get(A('/engagements/ae_demo_ops_cs'))).data;
  assert.equal(eng.can.workpapers, false);
  assert.equal(eng.findings_list.length, 3);
  assert.equal((await omar.get(A('/engagements/ae_demo_ops_cs/workpapers'))).status, 404);
  assert.equal((await omar.get(A('/workpapers/aw_demo_o1'))).status, 404);
});

test('employees see only action plans assigned to them; forbidden actions return 403', async () => {
  const fatima = await as('fatima');
  const list = (await fatima.get(A('/findings'))).data;
  assert.deepEqual(list.map((f) => f.id).sort(), ['af_demo_03', 'af_demo_04']);
  assert.ok(list.every((f) => f.action.mine && f.criteria === undefined));
  assert.equal((await fatima.get(A('/findings/af_demo_05'))).status, 404); // same department, owner is Omar
  assert.equal((await fatima.get(A('/engagements/ae_demo_ops_cs'))).status, 404);
  assert.equal((await fatima.get(A('/requests/ar_demo_ops1'))).status, 404);
  const omar = await as('omar');
  assert.equal((await omar.post(A('/findings/af_demo_03/progress'), { status: 'implemented', note: 'ليس المسؤول عن التنفيذ' })).status, 403);
  assert.equal((await (await as('ahmed')).get(A('/findings/af_demo_03'))).status, 404);
  assert.equal((await (await as('hessa')).get(A('/findings/af_demo_03'))).status, 404);
  const ok = await fatima.post(A('/findings/af_demo_03/progress'), { status: 'in_progress', note: 'تم اختيار نظام التذاكر الجديد' });
  assert.equal(ok.status, 200);
  assert.equal((await fatima.post(A('/findings/af_demo_03/progress'), { status: 'open' })).status, 400);
});

test('the platform admin (mariam) gains no audit data from the admin flag', async () => {
  const m = await as('mariam');
  assert.equal((await m.get(A('/plan'))).status, 403);
  assert.equal((await m.get(A('/dashboard'))).status, 403);
  assert.equal((await m.get(A('/ext'))).data.length, 0);
  assert.equal((await m.get(A('/ext/ax_demo_1'))).status, 404);
  assert.equal((await m.get(A('/workpapers/aw_demo_i1'))).status, 404);
  const engs = (await m.get(A('/engagements'))).data;
  assert.deepEqual(engs.map((e) => e.id), ['ae_demo_it_access']);
  assert.equal(engs[0].workpapers, undefined);
  assert.equal(engs[0].findings.drafts, 0);
  assert.equal((await m.post(A('/engagements'), { title: 'مهمة غير مصرح بها', department_id: 'dept_it', quarter: 2 })).status, 403);
});

test('committee sees the plan, issued reports and aggregates without individuals or drafts', async () => {
  const p = await as('president');
  const list = (await p.get(A('/findings'))).data;
  assert.ok(list.length > 0 && list.every((f) => !['ae_demo_proc', 'ae_demo_it_access'].includes(f.engagement.id))); // only issued reports
  assert.ok(list.every((f) => !f.action || f.action.owner === null));
  assert.equal((await p.get(A('/findings/af_demo_06'))).status, 404); // report not issued yet
  assert.equal((await p.get(A('/requests/ar_demo_ops1'))).status, 404);
  assert.equal((await p.get(A('/engagements/ae_demo_ops_cs/workpapers'))).status, 404);
  const d = (await p.get(A('/dashboard'))).data;
  assert.equal(d.scope, 'committee');
  assert.ok(!d.by_department.some((x) => x.department.id === 'dept_proc'));
  assert.ok(d.overdue.length >= 2 && d.overdue.every((o) => o.owner === null));
  const ws = (await p.get('/api/workspace')).data.find((s) => s.system === 'audit');
  assert.equal(ws.cards[0].title_en, 'Open high-risk findings');
});

test('external auditor portal: own requests only, internal routing hidden, release by IA after review', async () => {
  const rashid = await as('rashid'); const aisha = await as('aisha'); const majed = await as('majed');
  for (const p of ['/engagements', '/findings', '/requests', '/dashboard', '/plan']) assert.equal((await rashid.get(A(p))).status, 403, p);
  assert.equal((await rashid.get(A('/findings/af_demo_03'))).status, 404);
  assert.equal((await rashid.get(A('/workpapers/aw_demo_p1'))).status, 404);
  assert.equal((await rashid.get('/api/users/directory')).status, 403);
  const mine = (await rashid.get(A('/ext'))).data;
  assert.equal(mine.length, 3);
  const released = mine.find((x) => x.status === 'released');
  assert.ok(released.released_text && released.docs.length === 1);
  const inProg = mine.find((x) => x.id === 'ax_demo_2');
  assert.equal(inProg.status, 'in_progress');
  for (const k of ['internal_note', 'assigned_to', 'response_text', 'prepared_by', 'requester']) assert.equal(inProg[k], undefined, k);
  assert.equal((await rashid.get(A(`/links/${released.docs[0].id}`))).status, 200);

  const x = (await rashid.post(A('/ext'), { title: 'تزويدنا بجدول أعمار الذمم المدينة', details: 'كما في نهاية الربع', due_date: day(10) })).data;
  assert.equal(x.status, 'submitted');
  assert.equal((await rashid.post(A('/ext'), { title: 'x' })).status, 400);
  assert.equal((await aisha.post(A('/ext'), { title: 'طلب داخلي ليس من المدقق' })).status, 403);
  assert.equal((await rashid.post(A(`/ext/${x.id}/assign`), { to_user_id: 'u_majed' })).status, 403);
  assert.equal((await majed.get(A(`/ext/${x.id}`))).status, 404); // not assigned yet
  assert.equal((await aisha.post(A(`/ext/${x.id}/assign`), { to_user_id: 'u_fatima' })).status, 400); // not a manager
  assert.equal((await aisha.post(A(`/ext/${x.id}/assign`), { to_user_id: 'u_majed', note: 'تعليمات داخلية: لا تُرفق مراسلات' })).status, 200);
  const rView = (await rashid.get(A(`/ext/${x.id}`))).data;
  assert.equal(rView.status, 'in_progress');
  assert.equal(JSON.stringify(rView).includes('تعليمات داخلية'), false);
  const docId = (await majed.tool('create_document', { title: 'جدول أعمار الذمم', kind: 'report', content_html: '<p>أعمار الذمم</p>' })).data.result.id;
  const prepared = (await majed.post(A(`/ext/${x.id}/prepare`), { response_text: 'مرفق جدول أعمار الذمم المدينة', doc_ids: [docId] })).data;
  assert.equal(prepared.status, 'prepared');
  const hidden = (await rashid.get(A(`/ext/${x.id}`))).data;
  assert.equal(hidden.docs.length, 0);
  assert.equal((await rashid.get(A(`/links/${prepared.docs[0].id}`))).status, 404); // not released yet
  assert.equal((await majed.post(A(`/ext/${x.id}/release`), { confirm: true })).status, 403);
  assert.equal((await aisha.post(A(`/ext/${x.id}/release`), {})).status, 428);
  assert.equal((await aisha.post(A(`/ext/${x.id}/release`), { confirm: true, released_text: 'نرفق لكم جدول أعمار الذمم المدينة كما في نهاية الربع.' })).status, 200);
  const final = (await rashid.get(A(`/ext/${x.id}`))).data;
  assert.equal(final.status, 'released');
  assert.equal(final.docs.length, 1);
  assert.equal((await rashid.get(A(`/links/${final.docs[0].id}`))).data.content_html.includes('أعمار الذمم'), true);
  // other external organisations cannot even open the system
  for (const u of ['horizon', 'oasis']) assert.equal((await (await as(u)).get(A('/ext'))).status, 403, u);
});

test('workspace cards follow the same scope as the detail endpoints', async () => {
  const card = async (u) => (await (await as(u)).get('/api/workspace')).data.find((s) => s.system === 'audit')?.cards || [];
  const majed = await card('majed');
  assert.ok(majed.some((c) => c.title_en === 'Findings awaiting your response'));
  assert.ok(!JSON.stringify(majed).includes('حسابات نشطة')); // IT draft never leaks
  const fatima = await card('fatima');
  assert.equal(fatima[0].title_en, 'Your audit action plans');
  assert.ok(fatima[0].items.every((i) => /af_demo_0[34]/.test(i.href)));
  assert.deepEqual(await card('ahmed'), []);
  const rashid = await card('rashid');
  assert.equal(rashid[0].title_en, 'My requests');
  const aisha = await card('aisha');
  assert.equal(aisha.length, 3);
});

test('Ask AI: findings are opt-in per user; working papers are locked for everyone', async () => {
  const saeed = await as('saeed');
  const refused = await mcp(saeed, 'audit_findings_summary');
  assert.equal(refused.isError, true);
  assert.match(refused.content[0].text, /سياسة البيانات/);
  const admin = await as('mariam');
  assert.equal((await admin.put('/api/admin/domains/audit.workpapers', { ai_policy: 'allowed', confirm: true })).status, 409);
  assert.equal((await saeed.put('/api/systems/audit/prefs', { ai_enabled: true })).status, 200);
  const ok = await mcp(saeed, 'audit_findings_summary');
  assert.equal(ok.isError, false);
  assert.ok(ok.structuredContent.result.open.total >= 1);
  // not a reviewer → refused even when opted in
  const fatima = await as('fatima');
  await fatima.put('/api/systems/audit/prefs', { ai_enabled: true });
  const denied = await mcp(fatima, 'audit_findings_summary');
  assert.equal(denied.isError, true);
  const mine = await mcp(fatima, 'audit_my_actions', { overdue: true });
  assert.deepEqual(mine.structuredContent.result.map((f) => f.id), ['af_demo_03']);
});

test('Ask AI intents: «خطط المعالجة المتأخرة» and «ملاحظات التدقيق على إدارتي» stay in scope', async () => {
  const omar = await as('omar');
  const blocked = await omar.chat('خطط المعالجة المتأخرة');
  assert.match(blocked.final.text, /سياسة البيانات/); // opt-in not enabled for Omar
  await omar.put('/api/systems/audit/prefs', { ai_enabled: true });
  const r = await omar.chat('ملاحظات التدقيق على إدارتي');
  assert.match(r.final.text, /تجاوز المدة المعيارية لمعالجة الشكاوى/);
  assert.doesNotMatch(r.final.text, /تجزئة أوامر الشراء|حسابات نشطة/);
  const late = await omar.chat('خطط المعالجة المتأخرة');
  assert.match(late.final.text, /متأخرة/);
});

test('validation errors and forbidden transitions', async () => {
  const saeed = await as('saeed'); const aisha = await as('aisha'); const majed = await as('majed');
  assert.equal((await saeed.post(A('/engagements'), { title: 'x', department_id: 'dept_it', quarter: 2 })).status, 400);
  assert.equal((await saeed.post(A('/engagements'), { title: 'مهمة لجهة خارجية', department_id: 'ext_audit', quarter: 2 })).status, 400);
  assert.equal((await saeed.post(A('/engagements'), { title: 'مهمة بربع غير صالح', department_id: 'dept_it', quarter: 5 })).status, 400);
  assert.equal((await saeed.post(A('/engagements/ae_demo_it_access/requests'), { title: 'طلب بتاريخ ماضٍ', due_date: day(-1) })).status, 400);
  assert.equal((await saeed.post(A('/engagements/ae_demo_fin_cash/findings'), { title: 'ملاحظة قبل العمل الميداني', condition: 'x', risk: 'low', recommendation: 'y' })).status, 409);
  assert.equal((await aisha.post(A('/engagements/ae_demo_it_access/issue-report'), { exec_summary: 'ملخص تنفيذي كافٍ للاختبار فقط لا غير', confirm: true })).status, 409);
  assert.equal((await aisha.post(A('/engagements/ae_demo_ops_cs/phase'), { to: 'closed' })).status, 409); // open findings remain
  assert.equal((await majed.post(A('/findings/af_demo_07/respond'), { position: 'agree', response_text: 'رد مكرر للاختبار', action_description: 'خطة مكررة للاختبار', owner_id: 'u_reem', due_date: day(10) })).status, 409);
  assert.equal((await majed.post(A('/findings/af_demo_06/respond'), { position: 'maybe', response_text: 'رد', action_description: 'خطة', owner_id: 'u_reem', due_date: day(10) })).status, 400);
  assert.equal((await majed.post(A('/requests/ar_demo_p1/respond'), { response_text: 'رد جديد على طلب مقبول' })).status, 409);
  assert.equal((await saeed.post(A('/requests/ar_demo_i3/review'), { decision: 'return' })).status, 400); // reason required
  assert.equal((await saeed.get(A('/findings?risk=critical'))).status, 400);
  assert.equal((await saeed.put(A('/workpapers/aw_demo_p1'), { title: 'تعديل ورقة معتمدة' })).status, 409);
});

test('closure validation and excellence points derived from validated records', async () => {
  const aisha = await as('aisha');
  const r = await aisha.post(A('/findings/af_demo_04/close'), { decision: 'close', note: 'تحقق المكتب من المؤشر الموحد' });
  assert.equal(r.status, 200);
  const fatima = (await (await as('fatima')).get('/api/game/me')).data;
  assert.ok(fatima.rules.some((x) => x.key === 'audit_action_on_time'));
  const salem = (await (await as('salem')).get('/api/game/me')).data;
  assert.ok(salem.xp >= 10);
  const majed = (await (await as('majed')).get('/api/game/me')).data;
  assert.ok(majed.recent.some((e) => e.kind === 'audit_info_on_time') || majed.xp >= 5);
  assert.ok(!JSON.stringify(majed.recent).includes('تجزئة')); // no audit details in game history
});
