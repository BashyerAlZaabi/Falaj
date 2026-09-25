// Ideas management: pipeline end-to-end, segregation of duties, anonymous
// authors, blind committee scoring, social features, challenges, isolation
// (other departments, managers, platform admin, external identities), Ask AI
// tools/intents/MCP policy, workspace and derived points.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done, stack } from './_stack.js';

after(done);
const A = '/api/sys/ideas';
const ok = (r, msg) => { assert.equal(r.status, 200, `${msg || ''} ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`); return r.data; };
const mcp = async (token, name, args = {}) => {
  const s = await stack();
  const res = await fetch(`${s.portal}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  return res.json();
};
const mcpList = async (token) => {
  const s = await stack();
  const res = await fetch(`${s.portal}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) });
  return (await res.json()).result.tools.map((t) => t.name);
};
const LONG_P = 'تستغرق مراجعة طلبات الصيانة يومين لأن النماذج متعددة وتُعبأ يدوياً وتُعاد عند النقص.';
const LONG_S = 'نموذج إلكتروني موحد لطلبات الصيانة يتحقق من الحقول آلياً ويوجّه الطلب للفني المختص مباشرة.';

test('demo seed: two challenges, ideas at every stage, one implemented through a project', async () => {
  const sara = await as('sara');
  const camps = ok(await sara.get(`${A}/campaigns`));
  assert.equal(camps.length, 2);
  assert.ok(camps.every((c) => c.state === 'active' && c.days_left > 0));
  const list = ok(await sara.get(`${A}/ideas`));
  assert.ok(list.length >= 12, `ideas: ${list.length}`);
  const statuses = new Set(list.map((i) => i.status));
  for (const s of ['submitted', 'screening', 'evaluation', 'needs_info', 'approved', 'rejected', 'in_implementation', 'implemented']) assert.ok(statuses.has(s), s);
  const impl = ok(await (await as('fatima')).get(`${A}/ideas/idea_demo02`));
  assert.equal(impl.status, 'implemented');
  assert.equal(impl.project.visible, true);
  assert.equal(impl.project.id, 'pr_procedures');
  assert.ok(impl.benefits.saving > 0);
  // Project details stay inside the project scope: a colleague outside it sees only that a project exists.
  const other = ok(await sara.get(`${A}/ideas/idea_demo02`));
  assert.deepEqual(other.project, { linked: true, visible: false });
});

test('external identities and unknown records are refused (no existence leak)', async () => {
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    assert.equal((await c.get(`${A}/`)).status, 403, u);
    assert.equal((await c.get(`${A}/ideas/idea_demo01`)).status, 403, u);
    assert.equal((await c.post(`${A}/ideas`, { title: 'فكرة من جهة خارجية' })).status, 403, u);
    assert.equal((await c.get('/api/workspace')).data.some?.((s) => s.system === 'ideas') || false, false, u);
  }
  const sara = await as('sara');
  assert.equal((await sara.get(`${A}/ideas/idea_nope`)).status, 404);
  assert.equal((await sara.post(`${A}/ideas/idea_nope/vote`, { on: true })).status, 404);
});

test('anonymous author: hidden from peers, managers, lists, search, filters and rankings; visible to the committee with an access log', async () => {
  const sara = await as('sara');
  const d = ok(await sara.get(`${A}/ideas/idea_demo09`));
  assert.equal(d.author, null); assert.equal(d.department, null); assert.equal(d.author_id, undefined); assert.equal(d.coauthors, null);
  const authorComment = d.comments.find((c) => c.by_idea_author);
  assert.ok(authorComment && authorComment.user === null, 'author comment must be anonymous');
  assert.ok(!JSON.stringify(d).includes('u_saeed'));
  // the author's own manager does not see it either
  const aisha = ok(await (await as('aisha')).get(`${A}/ideas/idea_demo09`));
  assert.equal(aisha.author, null);
  const list = ok(await sara.get(`${A}/ideas`));
  assert.equal(list.find((i) => i.id === 'idea_demo09').author, null);
  assert.ok(!ok(await sara.get(`${A}/ideas?department=dept_ia`)).some((i) => i.id === 'idea_demo09'));
  assert.ok(!ok(await sara.get(`${A}/ideas?q=${encodeURIComponent('سعيد')}`)).some((i) => i.id === 'idea_demo09'));
  assert.ok(!ok(await sara.get(`${A}/`)).departments.some((x) => x.id === 'dept_ia'));
  const top = ok(await sara.tool('ideas_top', { limit: 10 }));
  assert.ok(!JSON.stringify(top).includes('سعيد'));
  // committee sees the identity, and the author sees who looked
  const lat = ok(await (await as('latifa')).get(`${A}/ideas/idea_demo09`));
  assert.equal(lat.author.id, 'u_saeed');
  const own = ok(await (await as('saeed')).get(`${A}/ideas/idea_demo09`));
  assert.ok(own.identity_log.some((x) => x.user_id === 'u_latifa'));
  assert.equal(d.identity_log, null);
});

test('drafts are private to their author (committee included)', async () => {
  for (const u of ['sara', 'latifa', 'omar']) assert.equal((await (await as(u)).get(`${A}/ideas/idea_demo14`)).status, 404, u);
  assert.ok(!ok(await (await as('latifa')).get(`${A}/ideas?status=draft`)).some((i) => i.id === 'idea_demo14'));
  const fatima = await as('fatima');
  assert.equal(ok(await fatima.get(`${A}/ideas/idea_demo14`)).status, 'draft');
  assert.ok(ok(await fatima.get(`${A}/mine`)).ideas.some((i) => i.id === 'idea_demo14'));
  // IDOR on write: invisible draft → 404; visible idea of someone else → 403
  assert.equal((await (await as('sara')).put(`${A}/ideas/idea_demo14`, { title: 'تعديل غير مصرّح' })).status, 404);
  assert.equal((await (await as('sara')).put(`${A}/ideas/idea_demo11`, { title: 'تعديل غير مصرّح' })).status, 403);
});

test('submission validation (400) and campaign deadlines (409)', async () => {
  const f = await as('fatima');
  assert.equal((await f.post(`${A}/ideas`, {})).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'ab' })).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'فكرة صالحة', category: 'nope' })).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'فكرة صالحة', is_admin: true })).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'فكرة صالحة', expected_saving: -5 })).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'فكرة صالحة', submit: true, problem: 'قصير', solution: 'قصير' })).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'فكرة صالحة', coauthor_ids: ['u_ext_horizon'] })).status, 400);
  assert.equal((await f.post(`${A}/ideas`, { title: 'فكرة صالحة', campaign_id: 'camp_nope' })).status, 400);
});

test('committee pipeline: screening → evaluation → blind scoring → approval with sponsor → project → benefits, with SoD at every step', async () => {
  const fatima = await as('fatima'); const sara = await as('sara'); const omar = await as('omar');
  const latifa = await as('latifa'); const mariam = await as('mariam'); const pres = await as('president');
  const idea = ok(await fatima.post(`${A}/ideas`, { title: 'نموذج موحد لطلبات الصيانة', problem: LONG_P, solution: LONG_S, category: 'process', expected_hours: 300, submit: true, coauthor_ids: [] }));
  assert.equal(idea.status, 'submitted');
  assert.match(idea.ref, /^IDEA-\d{4}-\d{3}$/);
  // committee members were alerted (they must act) — the author was not
  assert.ok((await latifa.get('/api/alerts')).data.some((a) => a.entity_id === idea.id));
  assert.ok(!(await fatima.get('/api/alerts')).data.some((a) => a.entity_id === idea.id));
  const tr = (c, to, extra = {}) => c.post(`${A}/ideas/${idea.id}/transition`, { to, ...extra });
  assert.equal((await tr(sara, 'screening')).status, 403, 'employee of another department');
  assert.equal((await tr(omar, 'screening')).status, 403, 'manager of the author (not committee)');
  assert.equal((await tr(latifa, 'approved', { sponsor_id: 'u_omar' })).status, 409, 'skipping stages');
  assert.equal((await tr(latifa, 'bogus')).status, 400);
  ok(await tr(latifa, 'screening'));
  ok(await tr(latifa, 'evaluation'));
  const score = (c, v = {}) => c.put(`${A}/ideas/${idea.id}/score`, { impact: 4, feasibility: 5, cost: 4, alignment: 4, ...v });
  assert.equal((await score(fatima)).status, 403, 'author cannot score');
  assert.equal((await score(latifa, { impact: 6 })).status, 400);
  ok(await score(mariam, { note: 'ملاحظة سرية للجنة' }));
  assert.equal((await tr(latifa, 'approved', { sponsor_id: 'u_omar' })).status, 409, 'needs two scores');
  // blind: a member who has not scored sees no other scores; the author and peers see nothing yet
  const blind = ok(await latifa.get(`${A}/ideas/${idea.id}`)).evaluation;
  assert.equal(blind.blind, true); assert.equal(blind.members, undefined);
  for (const c of [fatima, sara]) { const e = ok(await c.get(`${A}/ideas/${idea.id}`)).evaluation; assert.equal(e.view, 'pending'); assert.equal(e.members, undefined); assert.equal(e.aggregate, undefined); }
  ok(await score(pres, { impact: 5 }));
  assert.equal((await tr(latifa, 'approved')).status, 400, 'sponsor required');
  assert.equal((await tr(latifa, 'approved', { sponsor_id: 'u_fatima' })).status, 400, 'sponsor cannot be the author');
  const appr = ok(await tr(latifa, 'approved', { sponsor_id: 'u_omar', note: 'معتمدة مع تجربة في مستودع واحد أولاً.' }));
  assert.equal(appr.status, 'approved');
  assert.equal(ok(await latifa.get(`${A}/ideas/${idea.id}`)).evaluation.members.length, 2);
  // after the decision peers see an anonymous summary only; the author sees the decision note
  const peer = ok(await sara.get(`${A}/ideas/${idea.id}`));
  assert.equal(peer.evaluation.view, 'summary'); assert.equal(peer.evaluation.members, undefined);
  assert.ok(!JSON.stringify(peer).includes('ملاحظة سرية')); assert.equal(peer.decision, null);
  assert.ok(ok(await fatima.get(`${A}/ideas/${idea.id}`)).decision.note.includes('مستودع'));
  // implementation: sponsor only (not the author, not a colleague); project rules of the Work service apply
  const impl = (c, body) => c.post(`${A}/ideas/${idea.id}/implement`, body);
  assert.equal((await impl(sara, { mode: 'create' })).status, 403);
  assert.equal((await impl(fatima, { mode: 'create' })).status, 403);
  assert.equal((await impl(omar, { mode: 'link', project_id: 'pr_portal' })).status, 404, 'project outside the sponsor scope');
  assert.equal((await impl(omar, { mode: 'teleport' })).status, 400);
  const started = ok(await impl(omar, { mode: 'create', name: 'نموذج الصيانة الموحد', due_date: '2030-01-31' }));
  assert.equal(started.status, 'in_implementation');
  const proj = ok(await omar.get(`/api/projects/${started.project.id}`));
  assert.equal(proj.department_id, 'dept_ops');
  assert.equal((await omar.post(`${A}/ideas/${idea.id}/complete`, {})).status, 400);
  assert.equal((await sara.post(`${A}/ideas/${idea.id}/complete`, { benefits_note: 'تم توفير الوقت بشكل واضح' })).status, 403);
  const fin = ok(await omar.post(`${A}/ideas/${idea.id}/complete`, { benefits_note: 'انخفض زمن معالجة طلب الصيانة من يومين إلى ثلاث ساعات.', realized_hours: 350 }));
  assert.equal(fin.status, 'implemented');
  assert.equal((await impl(omar, { mode: 'create' })).status, 409, 'no transition out of implemented');
  // derived points for the author
  const g = ok(await fatima.get('/api/game/me'));
  assert.ok(g.rules.some((r) => r.key === 'idea_implemented' && r.points === 40));
  assert.ok(g.recent.some((e) => e.id === `ideas:impl:${idea.id}`));
  assert.ok(g.recent.some((e) => e.id === `ideas:app:${idea.id}`));
});

test('needs more info: only the author responds, with an answer, and the idea returns to the asking stage', async () => {
  const salem = await as('salem'); const hessa = await as('hessa');
  const before = ok(await salem.get(`${A}/ideas/idea_demo06`));
  assert.equal(before.status, 'needs_info');
  assert.ok(before.info_request.note.length > 10);
  assert.equal((await hessa.post(`${A}/ideas/idea_demo06/submit`, { response: 'رد من غير المؤلف' })).status, 403);
  assert.equal((await salem.post(`${A}/ideas/idea_demo06/submit`, {})).status, 400);
  const back = ok(await salem.post(`${A}/ideas/idea_demo06/submit`, { response: 'الأنظمة: الموارد البشرية والتحول الرقمي والمالية؛ الكلفة التقديرية 60 ألف درهم.' }));
  assert.equal(back.status, 'evaluation');
  assert.ok((await (await as('latifa')).get('/api/alerts')).data.some((a) => a.entity_id === 'idea_demo06'), 'the member who asked is alerted');
  // rejection needs feedback
  assert.equal((await (await as('latifa')).post(`${A}/ideas/idea_demo06/transition`, { to: 'rejected' })).status, 400);
});

test('segregation of duties: committee members cannot act on their own ideas', async () => {
  const latifa = await as('latifa');
  assert.equal((await latifa.post(`${A}/ideas/idea_demo13/transition`, { to: 'evaluation' })).status, 403);
  assert.equal((await latifa.post(`${A}/ideas/idea_demo13/assist`)).status, 403);
  const q = ok(await latifa.get(`${A}/committee`));
  assert.equal(q.items.find((i) => i.id === 'idea_demo13').conflict, true);
  const ws = ok(await latifa.get('/api/workspace')).find((s) => s.system === 'ideas');
  assert.ok(!ws.cards[0].items.some((i) => i.href.includes('idea_demo13')));
});

test('votes: one per person, never on your own or co-authored idea, closed after rejection', async () => {
  const sara = await as('sara');
  const v1 = ok(await sara.post(`${A}/ideas/idea_demo07/vote`, { on: true }));
  const v2 = ok(await sara.post(`${A}/ideas/idea_demo07/vote`, { on: true }));
  assert.equal(v2.votes, v1.votes);
  assert.equal((await sara.post(`${A}/ideas/idea_demo07/vote`, {})).status, 400);
  assert.equal((await (await as('fatima')).post(`${A}/ideas/idea_demo02/vote`, { on: true })).status, 403);
  assert.equal((await (await as('ahmed')).post(`${A}/ideas/idea_demo03/vote`, { on: true })).status, 403, 'co-author');
  assert.equal((await sara.post(`${A}/ideas/idea_demo08/vote`, { on: true })).status, 409);
  const off = ok(await sara.post(`${A}/ideas/idea_demo07/vote`, { on: false }));
  assert.equal(off.votes, v1.votes - 1);
  assert.equal((await (await as('hamad')).post(`${A}/ideas/idea_demo07/follow`, { on: true })).status, 409, 'authors follow automatically');
});

test('comments: authors delete their own (confirmed); the committee hides with a reason (confirmed)', async () => {
  const sara = await as('sara'); const fatima = await as('fatima'); const latifa = await as('latifa');
  assert.equal((await sara.post(`${A}/ideas/idea_demo07/comments`, { body: '' })).status, 400);
  const c1 = ok(await sara.post(`${A}/ideas/idea_demo07/comments`, { body: 'فكرة ممتازة، أقترح ربطها بمؤشرات ADAA.' }));
  const c2 = ok(await sara.post(`${A}/ideas/idea_demo07/comments`, { body: 'تعليق للاختبار سيُخفى.' }));
  assert.equal((await fatima.req('DELETE', `${A}/ideas/idea_demo07/comments/${c1.id}`, { confirm: true })).status, 403);
  assert.equal((await sara.req('DELETE', `${A}/ideas/idea_demo07/comments/${c1.id}`, {})).status, 428);
  ok(await sara.req('DELETE', `${A}/ideas/idea_demo07/comments/${c1.id}`, { confirm: true }));
  assert.equal((await sara.post(`${A}/ideas/idea_demo07/comments/${c2.id}/hide`, { reason: 'خارج الموضوع', confirm: true })).status, 403);
  assert.equal((await latifa.post(`${A}/ideas/idea_demo07/comments/${c2.id}/hide`, { reason: 'خارج الموضوع' })).status, 428);
  ok(await latifa.post(`${A}/ideas/idea_demo07/comments/${c2.id}/hide`, { reason: 'خارج الموضوع', confirm: true }));
  const peer = ok(await fatima.get(`${A}/ideas/idea_demo07`)).comments.find((c) => c.id === c2.id);
  assert.equal(peer.hidden, true); assert.equal(peer.body, null); assert.equal(peer.hidden_reason, null);
  const mine = ok(await sara.get(`${A}/ideas/idea_demo07`)).comments.find((c) => c.id === c2.id);
  assert.equal(mine.hidden_reason, 'خارج الموضوع');
  assert.ok(!ok(await fatima.get(`${A}/ideas/idea_demo07`)).comments.some((c) => c.id === c1.id));
});

test('withdrawal needs confirmation; withdrawn ideas leave the bank but stay with the author and committee', async () => {
  const hamad = await as('hamad');
  assert.equal((await (await as('sara')).post(`${A}/ideas/idea_demo07/withdraw`, { confirm: true })).status, 403);
  assert.equal((await hamad.post(`${A}/ideas/idea_demo07/withdraw`, {})).status, 428);
  ok(await hamad.post(`${A}/ideas/idea_demo07/withdraw`, { confirm: true }));
  assert.equal((await (await as('sara')).get(`${A}/ideas/idea_demo07`)).status, 404);
  assert.ok(!ok(await (await as('sara')).get(`${A}/ideas`)).some((i) => i.id === 'idea_demo07'));
  assert.equal(ok(await hamad.get(`${A}/ideas/idea_demo07`)).status, 'withdrawn');
  assert.equal(ok(await (await as('latifa')).get(`${A}/ideas/idea_demo07`)).status, 'withdrawn');
  assert.equal((await hamad.post(`${A}/ideas/idea_demo07/withdraw`, { confirm: true })).status, 409);
});

test('committee queue: capability-scoped — the platform admin flag grants nothing', async () => {
  for (const u of ['sara', 'omar', 'hessa', 'aisha']) assert.equal((await (await as(u)).get(`${A}/committee`)).status, 403, u);
  const mariam = await as('mariam');
  ok(await mariam.get(`${A}/committee`));
  ok(await mariam.put('/api/admin/caps', { user_id: 'u_mariam', cap: 'ideas.committee', grant: false, confirm: true }));
  try {
    assert.equal((await mariam.get(`${A}/committee`)).status, 403);
    assert.equal((await mariam.put(`${A}/ideas/idea_demo12/score`, { impact: 5, feasibility: 5, cost: 5, alignment: 5 })).status, 403);
    assert.equal(ok(await mariam.get(`${A}/ideas/idea_demo09`)).author, null, 'admin without the capability cannot unmask authors');
    assert.ok(!ok(await mariam.get('/api/workspace')).find((s) => s.system === 'ideas')?.cards.some((c) => c.href === '#/sys/ideas/committee'));
  } finally {
    ok(await mariam.put('/api/admin/caps', { user_id: 'u_mariam', cap: 'ideas.committee', grant: true, confirm: true }));
  }
});

test('challenges: committee creates (validated), closes with confirmation; closed challenges refuse submissions', async () => {
  const sara = await as('sara'); const latifa = await as('latifa');
  const body = { title_ar: 'تحدي الاستدامة في المباني', description_ar: 'أفكار لخفض استهلاك الطاقة والمياه في مباني الجهة.', starts_on: new Date().toISOString().slice(0, 10), ends_on: '2030-12-31' };
  assert.equal((await sara.post(`${A}/campaigns`, body)).status, 403);
  assert.equal((await latifa.post(`${A}/campaigns`, { ...body, ends_on: body.starts_on })).status, 400);
  assert.equal((await latifa.post(`${A}/campaigns`, { ...body, extra: 1 })).status, 400);
  const c = ok(await latifa.post(`${A}/campaigns`, body));
  assert.equal(c.state, 'active');
  const draft = ok(await sara.post(`${A}/ideas`, { title: 'حساسات إضاءة ذكية في الممرات', campaign_id: c.id }));
  assert.equal(draft.status, 'draft');
  assert.equal((await sara.put(`${A}/campaigns/${c.id}`, { close: true, confirm: true })).status, 403);
  assert.equal((await latifa.put(`${A}/campaigns/${c.id}`, { close: true })).status, 428);
  assert.equal(ok(await latifa.put(`${A}/campaigns/${c.id}`, { close: true, confirm: true })).state, 'closed');
  assert.equal((await sara.post(`${A}/ideas`, { title: 'فكرة متأخرة', campaign_id: c.id, problem: LONG_P, solution: LONG_S, submit: true })).status, 409);
  assert.equal((await sara.post(`${A}/ideas/${draft.id}/submit`, {})).status, 400, 'draft is incomplete');
});

test('similar ideas and the screening brief (transparent local fallback without a model)', async () => {
  const sara = await as('sara');
  const sim = ok(await sara.get(`${A}/similar?text=${encodeURIComponent('التحقق الآلي من المستندات عبر الهوية الرقمية للمتعاملين')}`));
  assert.equal(sim[0].id, 'idea_demo01');
  const priv = ok(await sara.get(`${A}/similar?text=${encodeURIComponent('رمز QR على الأصول لتتبع العهد')}`));
  assert.ok(!priv.some((x) => x.id === 'idea_demo14'), 'drafts of others never surface');
  assert.equal((await sara.post(`${A}/ideas/idea_demo12/assist`)).status, 403);
  const brief = ok(await (await as('latifa')).post(`${A}/ideas/idea_demo12/assist`));
  assert.equal(brief.mode, 'local');
  assert.match(brief.label_ar, /تحليل محلي/);
  assert.equal(brief.checks.length, 5);
});

test('workspace cards follow the role and the same scope', async () => {
  const sara = ok(await (await as('sara')).get('/api/workspace')).find((s) => s.system === 'ideas');
  assert.ok(sara && sara.cards.length <= 3);
  assert.ok(!sara.cards.some((c) => c.href === '#/sys/ideas/committee'));
  assert.ok(sara.cards.some((c) => c.href.startsWith('#/sys/ideas/challenges/')));
  const lat = ok(await (await as('latifa')).get('/api/workspace')).find((s) => s.system === 'ideas');
  assert.equal(lat.cards[0].href, '#/sys/ideas/committee');
  assert.ok(lat.cards[0].value > 0);
  const majed = ok(await (await as('majed')).get('/api/workspace')).find((s) => s.system === 'ideas');
  assert.ok(majed.cards.some((c) => c.items.some((i) => i.href.includes('idea_demo05'))), 'sponsor card');
  const salem = ok(await (await as('salem')).get(`${A}/`));
  assert.ok(['needs_info', 'challenge', 'draft', 'submit'].includes(salem.next.kind));
});

test('Ask AI: tools reuse the same scope; intents save drafts and list top ideas without capturing platform commands', async () => {
  const fatima = await as('fatima');
  const mine = ok(await fatima.tool('ideas_my', {}));
  assert.equal(mine.status, 'ok');
  assert.ok(mine.result.ideas.length > 0);
  const own = ok(await fatima.get(`${A}/mine`)).ideas.map((i) => i.id);
  assert.ok(mine.result.ideas.every((i) => own.includes(i.id)));
  const t = ok(await fatima.tool('ideas_submit', { title: 'تذكير آلي بمواعيد تجديد العقود' }));
  assert.equal(t.status, 'ok'); assert.equal(t.result.status, 'draft'); assert.ok(t.undoable);
  const u = ok(await fatima.post(`/api/actions/${t.actionId}/undo`));
  assert.equal(u.status, 'ok');
  assert.equal((await fatima.get(`${A}/ideas/${t.result.id}`)).status, 404);
  const bad = await fatima.tool('ideas_submit', { title: 'x'.repeat(200) });
  assert.equal(bad.status, 400); assert.equal(bad.data.code, 'bad_input');
  const sara = await as('sara');
  const r = await sara.chat('عندي فكرة: توحيد نماذج طلبات الصيانة في نموذج إلكتروني واحد');
  assert.match(r.final.text, /مسودة/);
  assert.ok(ok(await sara.get(`${A}/mine`)).ideas.some((i) => i.status === 'draft' && i.title.includes('توحيد نماذج طلبات الصيانة')));
  const top = await sara.chat('اعرض أفضل الأفكار');
  assert.match(top.final.text, /أبرز الأفكار/);
  const mineChat = await sara.chat('ما حالة أفكاري؟');
  assert.match(mineChat.final.text, /أفكارك/);
  const task = await sara.chat('أضف مهمة مراجعة نماذج الصيانة');
  assert.doesNotMatch(task.final.text, /فكرتك|بنك الأفكار/);
});

test('MCP: ideas tools follow the data-domain AI policy set by the admin (off → refused and unlisted)', async () => {
  const sara = await as('sara'); const admin = await as('mariam');
  const token = ok(await sara.post('/api/me/tokens', { label: 'ideas test' })).token;
  const r1 = await mcp(token, 'ideas_top', { limit: 3 });
  assert.equal(r1.result.isError, false);
  assert.ok((await mcpList(token)).includes('ideas_top'));
  assert.equal((await admin.put('/api/admin/domains/ideas.pool', { ai_policy: 'off' })).status, 428);
  ok(await admin.put('/api/admin/domains/ideas.pool', { ai_policy: 'off', confirm: true }));
  try {
    const r2 = await mcp(token, 'ideas_top', {});
    assert.equal(r2.result.isError, true);
    assert.equal(r2.result.structuredContent.status, 'error');
    assert.ok(!(await mcpList(token)).includes('ideas_top'));
    const chat = await sara.chat('اعرض أفضل الأفكار');
    assert.doesNotMatch(chat.final.text, /أبرز الأفكار الآن/);
    // the UI itself (direct, user-driven) keeps working
    ok(await sara.get(`${A}/ideas`));
  } finally {
    ok(await admin.put('/api/admin/domains/ideas.pool', { ai_policy: 'allowed', confirm: true }));
  }
  const r3 = await mcp(token, 'ideas_submit', { title: 'فكرة عبر MCP', hide_author: true });
  assert.equal(r3.result.isError, false);
  assert.equal(r3.result.structuredContent.result.status, 'draft');
});
