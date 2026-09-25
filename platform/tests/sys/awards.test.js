// Awards (نظام الجوائز): programmes, nominations with consent, committee scoring
// with recusal, finalisation and the public winners wall — plus isolation and
// abuse cases (other departments, platform admin, externals, IDOR, SoD, leakage,
// Ask AI / MCP refusal for the locked evaluations domain, validation).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { as, done } from './_stack.js';

after(done);

const B = '/api/sys/awards';
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const desc = [{ level: 1, ar: 'أداء محدود' }, { level: 3, ar: 'أداء جيد' }, { level: 5, ar: 'أداء استثنائي' }];
const programBody = (over = {}) => ({
  name_ar: 'جائزة خدمة المجتمع', name_en: 'Community Service Award', description_ar: 'تكرّم المبادرات المجتمعية للموظفين', kind: 'excellence', cycle: 'اختبار',
  eligibility: 'all_staff', allow_self: true, nomination_opens: day(0), nomination_closes: day(7), evaluation_closes: day(20), announce_on: day(25),
  categories: [{ name_ar: 'المبادرات التطوعية', max_winners: 1 }, { name_ar: 'الشراكات المجتمعية', max_winners: 1 }],
  criteria: [{ name_ar: 'الأثر المجتمعي', weight: 60, descriptors: desc }, { name_ar: 'الاستدامة والشمول', weight: 40, descriptors: desc }],
  ...over,
});
const just = (p, text = 'قاد مبادرة تطوعية شهرية لخدمة كبار المواطنين بمشاركة أكثر من عشرين زميلاً') => p.criteria.map((c) => ({ criterion_id: c.id, text }));
const scores = (p, vals) => p.criteria.map((c, i) => ({ criterion_id: c.id, score: vals[i] }));
const ok = (r, msg) => assert.equal(r.status, 200, `${msg || ''} ${r.status} ${JSON.stringify(r.data)?.slice(0, 300)}`);

let P; // programme created by the e2e flow
let nFatima; let nSaeed; let nLatifa;

test('programmes: staff see published programmes; drafts are admin-only (404 elsewhere); externals are refused', async () => {
  const ahmed = await as('ahmed');
  const list = (await ahmed.get(`${B}/programs`)).data;
  assert.ok(list.some((p) => p.id === 'awp_employee_2026' && p.phase.window_open));
  assert.ok(!list.some((p) => p.status === 'draft'));
  assert.ok(list.every((p) => p.admin === undefined), 'no admin aggregates for staff');
  assert.equal((await ahmed.get(`${B}/programs/awp_leader_2027`)).status, 404);
  const hessa = await as('hessa');
  assert.ok((await hessa.get(`${B}/programs`)).data.some((p) => p.id === 'awp_leader_2027' && p.admin));
  for (const u of ['horizon', 'oasis', 'rashid']) {
    const c = await as(u);
    for (const p of ['/me', '/programs', '/winners', '/hall', '/nominations/awn_demo_fatima_service']) assert.equal((await c.get(`${B}${p}`)).status, 403, `${u} ${p}`);
    assert.equal((await c.post(`${B}/nominations`, { program_id: 'awp_employee_2026' })).status, 403);
  }
});

test('the platform admin flag grants no awards powers (mariam has no awards capability)', async () => {
  const mariam = await as('mariam');
  assert.equal((await mariam.post(`${B}/programs`, programBody())).status, 403);
  assert.equal((await mariam.get(`${B}/programs/awp_leader_2027`)).status, 404);
  assert.equal((await mariam.get(`${B}/committee`)).status, 403);
  assert.equal((await mariam.get(`${B}/programs/awp_innovation_2026/ranking`)).status, 403);
  assert.equal((await mariam.post(`${B}/programs/awp_innovation_2026/finalize`, { winners: [], confirm: true })).status, 403);
  assert.equal((await mariam.post(`${B}/programs/awp_employee_2026/transition`, { to: 'evaluation', confirm: true })).status, 403);
  // her own nomination is visible to her, others' are not
  assert.equal((await mariam.get(`${B}/nominations/awn_demo_ahmed_perf`)).status, 200);
  assert.equal((await mariam.get(`${B}/nominations/awn_demo_hamad_dash`)).status, 404);
});

test('programme editor validates weights, dates and descriptors (400) and creates drafts for the admin', async () => {
  const hessa = await as('hessa');
  assert.equal((await hessa.post(`${B}/programs`, programBody({ criteria: [{ name_ar: 'الأثر المجتمعي', weight: 50, descriptors: desc }, { name_ar: 'الاستدامة', weight: 40, descriptors: desc }] }))).status, 400);
  assert.equal((await hessa.post(`${B}/programs`, programBody({ nomination_closes: day(30) }))).status, 400);
  assert.equal((await hessa.post(`${B}/programs`, programBody({ criteria: [{ name_ar: 'الأثر المجتمعي', weight: 60, descriptors: [{ level: 5, ar: 'ممتاز' }] }, { name_ar: 'الاستدامة', weight: 40, descriptors: desc }] }))).status, 400);
  assert.equal((await hessa.post(`${B}/programs`, { ...programBody(), extra: 1 })).status, 400);
  const r = await hessa.post(`${B}/programs`, programBody());
  ok(r, 'create');
  P = r.data;
  assert.equal(P.status, 'draft');
  assert.equal((await (await as('ahmed')).get(`${B}/programs/${P.id}`)).status, 404);
  assert.equal((await (await as('ahmed')).post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, summary: 'ترشيح في مسودة', justifications: just(P) })).status, 404);
  const opened = await hessa.post(`${B}/programs/${P.id}/transition`, { to: 'nominations' });
  ok(opened, 'open');
  assert.equal(opened.data.phase.window_open, true);
  // structure is locked once nominations are open
  assert.equal((await hessa.put(`${B}/programs/${P.id}`, { criteria: programBody().criteria })).status, 409);
  ok(await hessa.put(`${B}/programs/${P.id}`, { description_ar: 'تكرّم المبادرات المجتمعية والتطوعية للموظفين' }), 'edit description');
});

test('nomination by a colleague needs the nominee’s consent; content is visible only to nominator and nominee', async () => {
  const ahmed = await as('ahmed'); const fatima = await as('fatima');
  // validation
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_fatima', summary: 'قصير', justifications: just(P) })).status, 400);
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_fatima', summary: 'مبادرة تطوعية مؤثرة', justifications: just(P).slice(0, 1) })).status, 400);
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_fatima', summary: 'مبادرة تطوعية مؤثرة', justifications: just(P), evidence: [{ title: 'رابط', link: 'javascript:alert(1)' }] })).status, 400);
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_ext_horizon', summary: 'مبادرة تطوعية مؤثرة', justifications: just(P) })).status, 400);
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_president', summary: 'مبادرة تطوعية مؤثرة', justifications: just(P) })).status, 400);
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_fatima', summary: 'مبادرة تطوعية مؤثرة', justifications: just(P), attach_excellence: true })).status, 403);
  const r = await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_fatima', summary: 'قادت مبادرة «رفيق» التطوعية لخدمة كبار المواطنين', justifications: just(P), evidence: [{ title: 'تقرير المبادرة', link: '#/projects/pr_service' }] });
  ok(r, 'nominate');
  nFatima = r.data.id;
  assert.equal(r.data.status, 'awaiting_consent');
  assert.equal(r.data.kind, 'colleague');
  assert.equal((await ahmed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_fatima', summary: 'ترشيح مكرر للزميلة', justifications: just(P) })).status, 409);
  // the nominee is alerted without restricted details
  const al = (await fatima.get('/api/alerts')).data.find((a) => a.entity_id === nFatima);
  assert.ok(al && !al.body.includes('رفيق'));
  // IDOR: nobody else sees it — other departments, managers, committee and the admin during nominations
  for (const u of ['sara', 'omar', 'latifa', 'hessa', 'president', 'mariam']) assert.equal((await (await as(u)).get(`${B}/nominations/${nFatima}`)).status, 404, u);
  // only the nominee consents
  assert.equal((await ahmed.post(`${B}/nominations/${nFatima}/consent`, { accept: true })).status, 403);
  const v = (await fatima.get(`${B}/nominations/${nFatima}`)).data;
  assert.equal(v.view, 'nominee'); assert.equal(v.can_consent, true);
  const c = await fatima.post(`${B}/nominations/${nFatima}/consent`, { accept: true, attach_excellence: true, note: 'شكراً لزملائي' });
  ok(c, 'consent');
  assert.equal(c.data.status, 'submitted');
  assert.equal(typeof c.data.excellence.xp, 'number');
  assert.equal((await fatima.post(`${B}/nominations/${nFatima}/consent`, { accept: true })).status, 409);
  const asNominator = (await ahmed.get(`${B}/nominations/${nFatima}`)).data;
  assert.equal(asNominator.view, 'nominator');
  assert.equal(asNominator.excellence, undefined, 'the nominee’s own excellence summary is not shown to the nominator');
});

test('self-nomination, team-nominee consent for a manager, nominator limits and withdrawal (428 → confirm)', async () => {
  const saeed = await as('saeed');
  const s = await saeed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[1].id, summary: 'شراكة مع جمعية محلية لتدريب الشباب', justifications: just(P, 'أسس شراكة مع جمعية محلية لتدريب الشباب على مهارات التدقيق والتحليل المالي') , attach_excellence: true });
  ok(s, 'self');
  nSaeed = s.data.id;
  assert.equal(s.data.status, 'submitted'); assert.equal(s.data.kind, 'self'); assert.ok(s.data.excellence);
  assert.equal((await saeed.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, summary: 'ترشيح ذاتي ثانٍ مكرر', justifications: just(P) })).status, 409);
  // hamad nominates his director latifa (a committee member) → she must consent
  const hamad = await as('hamad');
  const l = await hamad.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_latifa', summary: 'قادت برنامج الإرشاد المجتمعي للطلبة', justifications: just(P) });
  ok(l, 'nominate latifa');
  nLatifa = l.data.id;
  ok(await (await as('latifa')).post(`${B}/nominations/${nLatifa}/consent`, { accept: true }), 'latifa consent');
  // a throwaway nomination withdrawn by its nominator (needs explicit confirmation)
  const sara = await as('sara');
  const w = await sara.post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[1].id, nominee_id: 'u_noura', summary: 'تنظيم حملة التبرع بالدم السنوية', justifications: just(P) });
  ok(w, 'nominate noura');
  assert.equal((await (await as('noura')).post(`${B}/nominations/${w.data.id}/withdraw`, { confirm: true })).status, 409, 'nominee declines instead of withdrawing a pending nomination');
  assert.equal((await sara.post(`${B}/nominations/${w.data.id}/withdraw`, {})).status, 428);
  const wd = await sara.post(`${B}/nominations/${w.data.id}/withdraw`, { confirm: true });
  ok(wd, 'withdraw');
  assert.equal(wd.data.status, 'withdrawn');
  assert.equal((await (await as('noura')).get(`${B}/nominations/${w.data.id}`)).data.status, 'withdrawn');
});

test('closing nominations needs confirmation; committee sees nominations only now, with automatic recusal', async () => {
  const hessa = await as('hessa');
  assert.equal((await (await as('latifa')).post(`${B}/programs/${P.id}/transition`, { to: 'evaluation', confirm: true })).status, 403);
  assert.equal((await hessa.post(`${B}/programs/${P.id}/transition`, { to: 'evaluation' })).status, 428);
  ok(await hessa.post(`${B}/programs/${P.id}/transition`, { to: 'evaluation', confirm: true }), 'evaluate');
  assert.equal((await hessa.post(`${B}/programs/${P.id}/transition`, { to: 'nominations' })).status, 409);
  // nominations are closed now
  assert.equal((await (await as('sara')).post(`${B}/nominations`, { program_id: P.id, category_id: P.categories[0].id, nominee_id: 'u_noura', summary: 'تنظيم حملة التبرع بالدم', justifications: just(P) })).status, 409);
  const latifa = await as('latifa');
  const q = (await latifa.get(`${B}/committee`)).data;
  const items = q.programs.find((p) => p.id === P.id).items;
  assert.equal(items.find((x) => x.id === nLatifa).recusal, 'self');
  assert.equal(items.find((x) => x.id === nLatifa).summary, null);
  assert.equal(items.find((x) => x.id === nFatima).recusal, null);
  // non-members are refused the queue; nominators cannot score
  assert.equal((await (await as('ahmed')).get(`${B}/committee`)).status, 403);
  assert.equal((await (await as('ahmed')).put(`${B}/nominations/${nFatima}/review`, { scores: scores(P, [5, 5]) })).status, 403);
  // SoD: nobody scores themselves
  assert.equal((await latifa.put(`${B}/nominations/${nLatifa}/review`, { scores: scores(P, [5, 5]) })).status, 403);
  const lim = (await latifa.get(`${B}/nominations/${nLatifa}`)).data;
  assert.equal(lim.view, 'nominee');
  assert.equal(lim.review, undefined);
});

test('committee scoring: 1–5 per criterion, own review only, admin sees aggregates; ≥2 reviews before finalising', async () => {
  const latifa = await as('latifa'); const president = await as('president'); const hessa = await as('hessa');
  assert.equal((await latifa.put(`${B}/nominations/${nFatima}/review`, { scores: scores(P, [6, 4]) })).status, 400);
  assert.equal((await latifa.put(`${B}/nominations/${nFatima}/review`, { scores: scores(P, [5]).slice(0, 1) })).status, 400);
  const r1 = await latifa.put(`${B}/nominations/${nFatima}/review`, { scores: scores(P, [5, 4]), comment: 'أثر مجتمعي واضح' });
  ok(r1, 'review');
  assert.equal(r1.data.review.weighted, 4.6);
  // finalising before every nomination has two reviews is refused
  assert.equal((await hessa.post(`${B}/programs/${P.id}/finalize`, { winners: [{ nomination_id: nFatima }], confirm: true })).status, 409);
  ok(await president.put(`${B}/nominations/${nFatima}/review`, { scores: scores(P, [4, 4]) }));
  ok(await president.put(`${B}/nominations/${nSaeed}/review`, { scores: scores(P, [3, 4]) }));
  ok(await latifa.put(`${B}/nominations/${nSaeed}/review`, { scores: scores(P, [4, 3]) }));
  ok(await president.put(`${B}/nominations/${nLatifa}/review`, { scores: scores(P, [4, 3]) }));
  ok(await hessa.put(`${B}/nominations/${nLatifa}/review`, { scores: scores(P, [3, 3]) }));
  // a member sees only their own review; no aggregate, no other scores
  const lv = (await latifa.get(`${B}/nominations/${nFatima}`)).data;
  assert.equal(lv.view, 'committee'); assert.equal(lv.review.weighted, 4.6); assert.equal(lv.aggregate, undefined);
  const pv = (await president.get(`${B}/nominations/${nFatima}`)).data;
  assert.equal(pv.review.weighted, 4);
  // the nominee and nominator never see scores
  for (const u of ['fatima', 'ahmed']) {
    const s = JSON.stringify((await (await as(u)).get(`${B}/nominations/${nFatima}`)).data);
    assert.ok(!/weighted|aggregate|final_score|"scores"/.test(s), u);
  }
  // the admin (chair) sees the aggregate and the access log
  const av = (await hessa.get(`${B}/nominations/${nFatima}`)).data;
  assert.equal(av.view, 'admin'); assert.equal(av.aggregate.reviews, 2); assert.ok(av.access_log.length > 0);
  const rank = (await hessa.get(`${B}/programs/${P.id}/ranking`)).data;
  assert.equal(rank.ready, true);
  assert.equal(rank.categories[0].suggested[0], nFatima);
});

test('finalising: admin only, explicit confirmation, max winners per category, justified overrides → public winners, private scores', async () => {
  const hessa = await as('hessa');
  const rank = (await hessa.get(`${B}/programs/${P.id}/ranking`)).data;
  const cat0 = rank.categories[0];
  assert.equal((await (await as('president')).post(`${B}/programs/${P.id}/finalize`, { winners: [{ nomination_id: nFatima }], confirm: true })).status, 403);
  assert.equal((await hessa.post(`${B}/programs/${P.id}/finalize`, { winners: [{ nomination_id: nFatima }, { nomination_id: nLatifa }], confirm: true })).status, 400, 'max 1 winner per category');
  const runnerUp = cat0.nominations.find((x) => x.id !== cat0.suggested[0]).id;
  assert.equal((await hessa.post(`${B}/programs/${P.id}/finalize`, { winners: [{ nomination_id: runnerUp }], confirm: true })).status, 400, 'override needs a written reason');
  assert.equal((await hessa.post(`${B}/programs/${P.id}/finalize`, { winners: [{ nomination_id: nFatima }] })).status, 428);
  const f = await hessa.post(`${B}/programs/${P.id}/finalize`, { winners: [{ nomination_id: nFatima, citation_ar: 'تقديراً لمبادرة «رفيق» التطوعية وأثرها على كبار المواطنين' }, { nomination_id: nSaeed }], confirm: true });
  ok(f, 'finalize');
  assert.equal(f.data.program.status, 'announced');
  // winners are public to every staff member, without scores or nomination content
  const sara = await as('sara');
  const winners = (await sara.get(`${B}/winners?program_id=${P.id}`)).data;
  assert.deepEqual(winners.map((w) => w.id).sort(), [nFatima, nSaeed].sort());
  const cert = (await sara.get(`${B}/winners/${nFatima}`)).data;
  assert.equal(cert.nominee.id, 'u_fatima');
  assert.ok(!/"(weighted|final_score|justifications|summary|evidence|excellence|scores|nominator)":/.test(JSON.stringify(winners) + JSON.stringify(cert)));
  assert.equal((await sara.get(`${B}/winners/${nLatifa}`)).status, 404, 'a non-winner has no public record');
  // the nominee sees the result, still no score
  const mine = (await (await as('fatima')).get(`${B}/nominations/${nFatima}`)).data;
  assert.equal(mine.status, 'winner'); assert.equal(mine.result.winner, true);
  assert.ok(!/weighted|final_score|aggregate/.test(JSON.stringify(mine)));
  // derived excellence points: winner (50) and nominator of a consented colleague (5)
  const gf = (await (await as('fatima')).get('/api/game/me')).data;
  assert.ok(gf.recent.some((e) => e.kind === 'awards_won' && e.points === 50) || gf.xp >= 50);
  const ga = (await (await as('ahmed')).get('/api/game/me')).data;
  assert.ok(ga.rules.some((r) => r.key === 'awards_nominated' && r.points === 5));
});

test('recusal on seeded evaluation: own department and own nomination are blocked; declared conflicts need confirmation', async () => {
  const hessa = await as('hessa'); const latifa = await as('latifa'); const president = await as('president');
  const S2 = (await hessa.get(`${B}/programs/awp_innovation_2026`)).data;
  assert.equal((await hessa.put(`${B}/nominations/awn_demo_salem_hiring/review`, { scores: scores(S2, [4, 4, 4, 4]) })).status, 403, 'HR nominee, HR member');
  assert.equal((await latifa.put(`${B}/nominations/awn_demo_hamad_dash/review`, { scores: scores(S2, [4, 4, 4, 4]) })).status, 403, 'own nomination');
  // latifa is not the admin: her view of her own nomination is the nominator view (no committee data)
  const lv = (await latifa.get(`${B}/nominations/awn_demo_hamad_dash`)).data;
  assert.equal(lv.view, 'nominator'); assert.equal(lv.review, undefined);
  // a recused member without admin rights only sees a limited card
  const saeedCase = (await latifa.get(`${B}/committee`)).data.programs.find((p) => p.id === 'awp_innovation_2026').items.find((x) => x.id === 'awn_demo_hamad_dash');
  assert.equal(saeedCase.recusal, 'nominator');
  assert.equal((await president.post(`${B}/nominations/awn_demo_reem_portal/recuse`, { reason: 'تربطني صلة قرابة بالمرشحة' })).status, 428);
  assert.equal((await president.post(`${B}/nominations/awn_demo_reem_portal/recuse`, { reason: 'x', confirm: true })).status, 400);
  ok(await president.post(`${B}/nominations/awn_demo_reem_portal/recuse`, { reason: 'تربطني صلة قرابة بالمرشحة', confirm: true }), 'recuse');
  assert.equal((await president.put(`${B}/nominations/awn_demo_reem_portal/review`, { scores: scores(S2, [4, 4, 4, 4]) })).status, 403);
  const limited = (await president.get(`${B}/nominations/awn_demo_reem_portal`)).data;
  assert.equal(limited.view, 'recused'); assert.equal(limited.limited, true); assert.equal(limited.summary, undefined);
  // forbidden transitions on a programme under evaluation
  assert.equal((await hessa.post(`${B}/programs/awp_innovation_2026/transition`, { to: 'nominations' })).status, 409);
  assert.equal((await hessa.post(`${B}/nominations/awn_demo_hamad_dash/withdraw`, { confirm: true })).status, 403);
});

test('segregation of duties: the admin cannot finalise a programme she nominated in', async () => {
  const hessa = await as('hessa');
  const p = (await hessa.post(`${B}/programs`, programBody({ name_ar: 'جائزة روح الفريق', categories: [{ name_ar: 'روح الفريق', max_winners: 1 }] }))).data;
  ok(await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'nominations' }));
  const n = (await hessa.post(`${B}/nominations`, { program_id: p.id, category_id: p.categories[0].id, nominee_id: 'u_omar', summary: 'روح إيجابية ودعم دائم للزملاء', justifications: just(p) })).data;
  ok(await (await as('omar')).post(`${B}/nominations/${n.id}/consent`, { accept: true }));
  ok(await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'evaluation', confirm: true }));
  ok(await (await as('president')).put(`${B}/nominations/${n.id}/review`, { scores: scores(p, [4, 4]) }));
  ok(await (await as('latifa')).put(`${B}/nominations/${n.id}/review`, { scores: scores(p, [5, 4]) }));
  assert.equal((await hessa.put(`${B}/nominations/${n.id}/review`, { scores: scores(p, [5, 5]) })).status, 403, 'the nominator never scores');
  assert.equal((await hessa.post(`${B}/programs/${p.id}/finalize`, { winners: [{ nomination_id: n.id }], confirm: true })).status, 403);
});

test('lists, counts and workspace cards never leak other people’s nominations', async () => {
  const ahmed = await as('ahmed');
  const mine = (await ahmed.get(`${B}/nominations`)).data;
  const ids = [...mine.as_nominee, ...mine.as_nominator].map((x) => x.id);
  assert.ok(ids.includes(nFatima));
  assert.ok(!ids.includes('awn_demo_sara_self') && !ids.includes('awn_demo_fatima_service'));
  // the admin's own list contains only her own records; programme stats are aggregates without names
  const hessa = await as('hessa');
  const hm = (await hessa.get(`${B}/nominations`)).data;
  assert.ok(![...hm.as_nominee, ...hm.as_nominator].some((x) => x.id === 'awn_demo_ahmed_perf'));
  const emp = (await hessa.get(`${B}/programs/awp_employee_2026`)).data;
  assert.ok(emp.admin.active >= 3);
  assert.ok(!/u_fatima|u_sara|فاطمة|سارة/.test(JSON.stringify(emp.admin)));
  // workspace: committee card only for members; items name programmes, never nominees
  const wsA = (await ahmed.get('/api/workspace')).data.find((s) => s.system === 'awards');
  assert.ok(!wsA || !wsA.cards.some((c) => /لجنة/.test(c.title_ar)));
  const wsP = (await (await as('president')).get('/api/workspace')).data.find((s) => s.system === 'awards');
  const card = wsP.cards.find((c) => /لجنة/.test(c.title_ar));
  assert.ok(card && card.value >= 1);
  assert.ok(!/حمد|سالم|نورة|ريم|فاطمة/.test(JSON.stringify(card)));
  const wsF = (await (await as('fatima')).get('/api/workspace')).data.find((s) => s.system === 'awards');
  assert.ok(wsF.cards.some((c) => c.href.includes('awn_demo_fatima_service')));
  const wsS = (await (await as('sara')).get('/api/workspace')).data.find((s) => s.system === 'awards');
  assert.ok(!wsS || !JSON.stringify(wsS).includes('awn_demo_fatima_service'));
});

test('Ask AI & MCP: public tools answer; the locked evaluations domain is always refused', async () => {
  const ahmed = await as('ahmed');
  const token = (await ahmed.post('/api/me/tokens', { label: 'awards test' })).data.token;
  const mcp = (body) => fetch(`${ahmed.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) }).then((r) => r.json());
  const listed = (await mcp({ jsonrpc: '2.0', id: 1, method: 'tools/list' })).result.tools.map((t) => t.name);
  assert.ok(listed.includes('awards_programs') && listed.includes('awards_winners'));
  assert.ok(!listed.includes('awards_my_nominations'));
  const locked = await mcp({ jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'awards_my_nominations', arguments: {} } });
  assert.equal(locked.result.isError, true);
  assert.equal(locked.result.structuredContent.status, 'error');
  assert.ok(!JSON.stringify(locked).includes('awn_'));
  const open = await mcp({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'awards_programs', arguments: { status: 'all' } } });
  assert.equal(open.result.isError, false);
  assert.ok(!open.result.structuredContent.result.some((p) => p.status === 'draft' || p.admin || p.my_nominees || p.my_nominations != null), 'no drafts, aggregates or own-nomination facts reach Ask AI');
  const hessaTok = (await (await as('hessa')).post('/api/me/tokens', {})).data.token;
  const hs = await fetch(`${ahmed.base}/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${hessaTok}` }, body: JSON.stringify({ jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'awards_program', arguments: { id: 'awp_leader_2027' } } }) }).then((r) => r.json());
  assert.equal(hs.result.isError, true, 'drafts are not exposed to Ask AI, even for the admin');
  // rule-based planner intents
  const c1 = await ahmed.chat('جوائز مفتوحة للترشيح');
  assert.match(c1.final.text, /جائزة الموظف المتميز/);
  const c2 = await ahmed.chat('الفائزون');
  assert.match(c2.final.text, /فريق البوابة الموحدة/);
  assert.ok(!/\d\.\d{2}/.test(c2.final.text), 'no scores');
  const c3 = await ahmed.chat('رشّح سارة لجائزة الموظف المتميز');
  assert.match(c3.final.text, /نظام الجوائز/);
});

test('declining keeps the reason private; the nominator earns points only for consented nominations (once per programme)', async () => {
  const sara = await as('sara'); const noura = await as('noura');
  const hessa = await as('hessa');
  const p = (await hessa.post(`${B}/programs`, programBody({ name_ar: 'جائزة المبادرة الخضراء' }))).data;
  ok(await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'nominations' }));
  const n = (await sara.post(`${B}/nominations`, { program_id: p.id, category_id: p.categories[0].id, nominee_id: 'u_noura', summary: 'مبادرة ترشيد استهلاك الورق في الإدارة', justifications: just(p) })).data;
  assert.equal((await sara.post(`${B}/nominations/${n.id}/consent`, { accept: false })).status, 403);
  const d = await noura.post(`${B}/nominations/${n.id}/consent`, { accept: false, decline_reason: 'أفضّل ترشيح زميلتي بدلاً مني' });
  ok(d, 'decline');
  assert.equal(d.data.status, 'declined');
  const seen = (await sara.get(`${B}/nominations/${n.id}`)).data;
  assert.equal(seen.status, 'declined');
  assert.equal(seen.decline_reason, undefined, 'the reason stays with the nominee');
  assert.equal((await noura.get(`${B}/nominations/${n.id}`)).data.decline_reason, 'أفضّل ترشيح زميلتي بدلاً مني');
  const gs = (await sara.get('/api/game/me')).data;
  assert.ok(!gs.recent.some((e) => e.id === `awards:nominated:${p.id}`), 'no points for a declined nomination');
  const ga = (await (await as('ahmed')).get('/api/game/me')).data;
  assert.ok(ga.recent.some((e) => e.id === `awards:nominated:${P.id}` && e.points === 5), 'ahmed nominated fatima who consented');
});

test('eligibility and programme rules: employees-only, no self when disallowed, team data only for team awards', async () => {
  const sara = await as('sara'); const hessa = await as('hessa');
  const emp = (await sara.get(`${B}/programs/awp_employee_2026`)).data;
  const r = await sara.post(`${B}/nominations`, { program_id: emp.id, category_id: emp.categories[0].id, nominee_id: 'u_omar', summary: 'قيادة متميزة لإدارة العمليات', justifications: just(emp) });
  assert.equal(r.status, 400, 'a manager cannot receive an employees-only award');
  assert.equal((await sara.post(`${B}/nominations`, { program_id: emp.id, category_id: 'awc_inn_ops', nominee_id: 'u_noura', summary: 'فئة من برنامج آخر', justifications: just(emp) })).status, 400, 'category of another programme');
  assert.equal((await sara.post(`${B}/nominations`, { program_id: emp.id, category_id: emp.categories[0].id, nominee_id: 'u_noura', team_name: 'فريق', team_member_ids: ['u_reem'], summary: 'ترشيح فردي بفريق', justifications: just(emp) })).status, 400);
  const noSelf = (await hessa.post(`${B}/programs`, programBody({ name_ar: 'جائزة القدوة الحسنة', allow_self: false }))).data;
  ok(await hessa.post(`${B}/programs/${noSelf.id}/transition`, { to: 'nominations' }));
  assert.equal((await sara.post(`${B}/nominations`, { program_id: noSelf.id, category_id: noSelf.categories[0].id, summary: 'أرشح نفسي لهذه الجائزة', justifications: just(noSelf) })).status, 400);
  // team awards: a named team of at least two staff; members follow the status; only the lead consents
  const team = (await hessa.post(`${B}/programs`, programBody({ name_ar: 'جائزة فريق الإنجاز', kind: 'team', eligibility: 'team' }))).data;
  ok(await hessa.post(`${B}/programs/${team.id}/transition`, { to: 'nominations' }));
  assert.equal((await sara.post(`${B}/nominations`, { program_id: team.id, category_id: team.categories[0].id, nominee_id: 'u_fatima', summary: 'فريق بلا اسم ولا أعضاء', justifications: just(team) })).status, 400);
  assert.equal((await sara.post(`${B}/nominations`, { program_id: team.id, category_id: team.categories[0].id, nominee_id: 'u_fatima', team_name: 'فريق الخدمة', team_member_ids: ['u_ext_oasis'], summary: 'فريق مع عضو خارجي', justifications: just(team) })).status, 400);
  const t = await sara.post(`${B}/nominations`, { program_id: team.id, category_id: team.categories[0].id, nominee_id: 'u_fatima', team_name: 'فريق مركز الخدمة', team_member_ids: ['u_omar'], summary: 'فريق أعاد تصميم تجربة المتعاملين', justifications: just(team) });
  ok(t, 'team nomination');
  assert.equal(t.data.team.length, 2);
  const omar = await as('omar');
  assert.equal((await omar.get(`${B}/nominations/${t.data.id}`)).data.view, 'nominee');
  assert.equal((await omar.post(`${B}/nominations/${t.data.id}/consent`, { accept: true })).status, 403, 'only the team lead consents');
});

test('excellence summary: attached, refreshed or removed by the nominee only — never by others', async () => {
  const saeed = await as('saeed'); const hessa = await as('hessa');
  const p = (await hessa.post(`${B}/programs`, programBody({ name_ar: 'جائزة الإتقان' }))).data;
  ok(await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'nominations' }));
  const n = (await saeed.post(`${B}/nominations`, { program_id: p.id, category_id: p.categories[0].id, summary: 'منهجية تدقيق مبنية على المخاطر', justifications: just(p) })).data;
  assert.equal(n.excellence, null);
  const on = await saeed.post(`${B}/nominations/${n.id}/excellence`, { attach: true });
  ok(on, 'attach');
  assert.equal(typeof on.data.excellence.level.n, 'number');
  assert.ok(Array.isArray(on.data.excellence.badges));
  const aisha = await as('aisha');
  assert.equal((await aisha.post(`${B}/nominations/${n.id}/excellence`, { attach: true })).status, 404, 'not visible to a colleague, even the manager');
  assert.equal((await saeed.post(`${B}/nominations/${n.id}/excellence`, {})).status, 400);
  const off = await saeed.post(`${B}/nominations/${n.id}/excellence`, { attach: false });
  ok(off, 'remove');
  assert.equal(off.data.excellence, null);
  assert.equal((await saeed.get(`${B}/excellence-preview`)).data.level.n >= 1, true);
});

test('lifecycle controls: cancelling needs confirmation, new cycles are admin-only drafts, criteria intent answers publicly', async () => {
  const hessa = await as('hessa');
  const p = (await hessa.post(`${B}/programs`, programBody({ name_ar: 'جائزة مؤقتة للاختبار' }))).data;
  assert.equal((await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'cancelled' })).status, 428);
  ok(await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'cancelled', confirm: true }), 'cancel');
  assert.equal((await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'nominations' })).status, 409);
  assert.equal((await hessa.post(`${B}/programs/${p.id}/transition`, { to: 'launch' })).status, 400);
  const copyBody = { cycle: 'دورة 2027', nomination_opens: day(30), nomination_closes: day(50), evaluation_closes: day(70), announce_on: day(80) };
  assert.equal((await (await as('latifa')).post(`${B}/programs/awp_team_2026/copy`, copyBody)).status, 403);
  const c = await hessa.post(`${B}/programs/awp_team_2026/copy`, copyBody);
  ok(c, 'copy');
  assert.equal(c.data.status, 'draft'); assert.equal(c.data.eligibility, 'team'); assert.equal(c.data.criteria.length, 4);
  assert.equal((await (await as('sara')).get(`${B}/programs/${c.data.id}`)).status, 404);
  const chat = await (await as('sara')).chat('ما معايير جائزة الابتكار؟');
  assert.match(chat.final.text, /الأصالة والجِدّة/);
});
