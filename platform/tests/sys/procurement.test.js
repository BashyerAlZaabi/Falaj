// AI Procurement: purchase-request chain with segregation of duties, budget
// commitment, direct purchase, the full RFQ lifecycle (AI scope, shortlist,
// sealed bids, two-key opening, evaluation + masked analysis, committee, legal,
// PO → contract), recusal, isolation of external suppliers, leakage checks,
// Ask AI tools / MCP / intents and validation.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { as, done, stack } from './_stack.js';
import { ROOT } from '../helpers.js';

after(done);
const P = '/api/sys/procurement';
const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lineOf = async (c, code) => { const l = (await c.get(`${P}/budget/options`)).data; return (code ? l.find((x) => x.code.includes(code)) : l[0]).id; };
async function createPr(c, { items = [{ description: 'شاشة عرض 27 بوصة', qty: 4, unit: 'جهاز', est_unit_price: 1500 }], category = 'supplies', line, title = 'طلب اختبار', submit = true } = {}) {
  const r = await c.post(`${P}/requests`, { title, category, justification: 'مبرر اختبار واضح للحاجة إلى البنود المطلوبة', needed_by: day(20), budget_line_id: line || await lineOf(c), items, submit });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  return r.data;
}
const decide = (c, id, decision = 'approve', note) => c.post(`${P}/requests/${id}/decide`, { decision, ...(note ? { note } : {}) });
async function mcp(c, name, args = {}) {
  const S = await stack();
  const { token } = (await c.post('/api/me/tokens', {})).data;
  const r = await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } }) });
  return (await r.json()).result;
}

test('role-aware context: officer, finance, requester, manager and supplier portal', async () => {
  const reem = (await (await as('reem')).get(`${P}/me`)).data;
  assert.equal(reem.roles.officer, true);
  assert.ok(reem.counts.approvals >= 1, 'PR-0138 waits for sourcing');
  const fatima = (await (await as('fatima')).get(`${P}/me`)).data;
  assert.deepEqual([fatima.roles.officer, fatima.roles.finance, fatima.roles.manager], [false, false, false]);
  assert.equal((await (await as('omar')).get(`${P}/approvals`)).data.requests.manager.length, 1);
  assert.equal((await (await as('majed')).get(`${P}/approvals`)).data.requests.finance.length, 1);
  const h = (await (await as('horizon')).get(`${P}/me`)).data;
  assert.equal(h.external, true);
  assert.equal(h.provider.id, 'pv_horizon');
  assert.equal(h.counts.open, 1);
});

test('purchase request validation (400) and budget line of another department', async () => {
  const f = await as('fatima');
  const base = { title: 'طلب', category: 'supplies', justification: 'مبرر اختبار واضح للحاجة', needed_by: day(10), budget_line_id: await lineOf(f), items: [{ description: 'قرطاسية', qty: 1, unit: 'طقم', est_unit_price: 100 }] };
  assert.equal((await f.post(`${P}/requests`, { ...base, items: [] })).status, 400);
  assert.equal((await f.post(`${P}/requests`, { ...base, category: 'toys' })).status, 400);
  assert.equal((await f.post(`${P}/requests`, { ...base, needed_by: day(-3) })).status, 400);
  assert.equal((await f.post(`${P}/requests`, { ...base, items: [{ description: 'x', qty: -2, unit: 'u', est_unit_price: 5 }] })).status, 400);
  assert.equal((await f.post(`${P}/requests`, { ...base, budget_line_id: 'bl_it_hw' })).status, 400, 'IT line from Operations');
  assert.equal((await f.post(`${P}/requests`, { ...base, admin: true })).status, 400, 'unknown field');
});

test('approval chain: drafts private, line manager → Finance (commitment) → officer, with segregation of duties', async () => {
  const [f, omar, ahmed, mariam, majed, noura] = await Promise.all(['fatima', 'omar', 'ahmed', 'mariam', 'majed', 'noura'].map(as));
  const draft = await createPr(f, { submit: false, line: await lineOf(f, 'OPS') });
  assert.equal(draft.status, 'draft');
  assert.equal((await omar.get(`${P}/requests/${draft.id}`)).status, 404, 'drafts are private to the requester');
  const sub = (await f.post(`${P}/requests/${draft.id}/submit`)).data;
  assert.equal(sub.status, 'pending_manager');
  assert.equal(sub.manager.id, 'u_omar');
  assert.equal((await decide(f, draft.id)).status, 403, 'requester cannot approve own request');
  assert.equal((await decide(ahmed, draft.id)).status, 404, 'another department employee');
  assert.equal((await decide(mariam, draft.id)).status, 404, 'manager of another department (and platform admin)');
  assert.equal((await decide(majed, draft.id)).status, 404, 'Finance only sees requests after the manager');
  assert.equal((await decide(omar, draft.id, 'reject')).status, 400, 'rejection needs a reason');
  assert.equal((await decide(omar, draft.id)).data.status, 'pending_finance');
  assert.equal((await decide(omar, draft.id)).status, 403, 'manager cannot approve the Finance stage');
  assert.equal((await decide(noura, draft.id)).status, 403, 'finance.budget alone cannot approve');
  const lineBefore = (await noura.get(`${P}/budget/${sub.budget_line.id}`)).data.amounts.committed;
  const fin = (await decide(majed, draft.id)).data;
  assert.equal(fin.status, 'pending_procurement');
  assert.equal(fin.reserved, 6000);
  assert.equal((await noura.get(`${P}/budget/${sub.budget_line.id}`)).data.amounts.committed, lineBefore + 6000);
  assert.equal((await f.post(`${P}/requests/${draft.id}/submit`)).status, 409, 'forbidden transition');
});

test('Finance cannot commit beyond the available balance; Finance maintains lines (audited, bounded)', async () => {
  const [f, omar, majed, noura] = await Promise.all(['fatima', 'omar', 'majed', 'noura'].map(as));
  const line = (await noura.get(`${P}/budget`)).data.lines.find((l) => l.code.startsWith('OPS') && l.code.endsWith('215'));
  const avail = line.amounts.available;
  const pr = await createPr(f, { line: line.id, items: [{ description: 'مستلزمات تشغيلية مجمعة', qty: 1, unit: 'طقم', est_unit_price: avail + 1000 }] });
  await decide(omar, pr.id);
  const refused = await decide(majed, pr.id);
  assert.equal(refused.status, 409);
  assert.match(refused.data.message, /الرصيد المتاح/);
  assert.equal((await f.put(`${P}/budget/${line.id}`, { allocated: line.amounts.allocated + 5000 })).status, 403);
  assert.equal((await majed.put(`${P}/budget/${line.id}`, { allocated: 1 })).status, 409, 'cannot drop below committed + spent');
  assert.equal((await noura.put(`${P}/budget/${line.id}`, { allocated: line.amounts.allocated + 5000, note: 'تعزيز من المناقلة' })).status, 200);
  assert.equal((await decide(majed, pr.id)).data.status, 'pending_procurement');
  assert.equal((await noura.put(`${P}/budget/${line.id}`, { allocated: 'lots' })).status, 400);
});

test('direct purchase: below 50,000 AED and only from an eligible supplier; PO creates a contract', async () => {
  const [f, omar, majed, reem] = await Promise.all(['fatima', 'omar', 'majed', 'reem'].map(as));
  const pr = await createPr(f, { line: await lineOf(f, '210'), items: [{ description: 'لوحات إرشادية للصالة', qty: 10, unit: 'لوحة', est_unit_price: 900 }] });
  await decide(omar, pr.id); await decide(majed, pr.id);
  assert.equal((await f.post(`${P}/requests/${pr.id}/source`, { method: 'direct', provider_id: 'pv_madar', amount: 8000 })).status, 403, 'requester is not the officer');
  assert.equal((await reem.post(`${P}/requests/${pr.id}/source`, { method: 'direct', provider_id: 'pv_bayan', amount: 8000 })).status, 409, 'expired insurance');
  assert.equal((await reem.post(`${P}/requests/${pr.id}/source`, { method: 'direct', provider_id: 'pv_riyada', amount: 8000 })).status, 409, 'pending provider');
  assert.equal((await reem.post(`${P}/requests/${pr.id}/source`, { method: 'direct', provider_id: 'pv_madar', amount: 60000 })).status, 400);
  const ok = await reem.post(`${P}/requests/${pr.id}/source`, { method: 'direct', provider_id: 'pv_madar', amount: 8500, quote_ref: 'MD-Q-77' });
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.status, 'ordered');
  assert.match(ok.data.po.po_number, /^PO-\d{4}-\d{4}$/);
  const contracts = (await omar.get('/api/sys/providers/contracts')).data;
  assert.ok(contracts.some((c) => c.id === ok.data.po.contract_id && c.owner.id === 'u_omar'), 'contract owned by the requester’s line manager');
  // ≥ 50,000 must go to RFQ
  const big = await createPr(f, { line: await lineOf(f, '210'), items: [{ description: 'أثاث صالة', qty: 1, unit: 'طقم', est_unit_price: 52000 }] });
  await decide(omar, big.id); await decide(majed, big.id);
  assert.equal((await reem.post(`${P}/requests/${big.id}/source`, { method: 'direct', provider_id: 'pv_madar', amount: 40000 })).status, 409);
});

let rfqId; let prId;
test('RFQ lifecycle: AI scope (labelled local fallback), eligible shortlist, sealed bids, two-key opening, masked analysis, committee, legal, PO', async () => {
  const [ahmed, mariam, majed, reem, yousef, horizon, oasis, rashid] = await Promise.all(['ahmed', 'mariam', 'majed', 'reem', 'yousef', 'horizon', 'oasis', 'rashid'].map(as));
  const pr = await createPr(ahmed, { line: await lineOf(ahmed, '301'), title: 'خوادم تخزين للنسخ الاحتياطي', items: [{ description: 'خادم تخزين 48 تيرابايت', qty: 2, unit: 'جهاز', est_unit_price: 30000 }, { description: 'تركيب وتهيئة', qty: 1, unit: 'خدمة', est_unit_price: 6000 }] });
  prId = pr.id;
  await decide(mariam, pr.id); await decide(majed, pr.id);
  const src = await reem.post(`${P}/requests/${pr.id}/source`, { method: 'rfq' });
  assert.equal(src.status, 200); rfqId = src.data.rfq_id;
  const sl = (await reem.get(`${P}/rfqs/${rfqId}/shortlist`)).data;
  assert.ok(['pv_horizon', 'pv_oasis', 'pv_madar'].every((id) => sl.eligible.some((p) => p.id === id)));
  assert.ok(sl.excluded.find((p) => p.id === 'pv_bayan').reasons.some((r) => r.code === 'expired_insurance'));
  assert.ok(!sl.eligible.some((p) => ['pv_saqr', 'pv_riyada', 'pv_bayan'].includes(p.id)));
  assert.equal((await majed.get(`${P}/rfqs/${rfqId}/shortlist`)).status, 403, 'committee member is not the officer');
  const spec = (await reem.post(`${P}/rfqs/${rfqId}/spec`)).data;
  assert.equal(spec.mode, 'template');
  assert.match(spec.note, /غير متصل/);
  assert.ok(!spec.rfq.spec.html.includes('30000') && !spec.rfq.spec.html.includes('30,000'), 'estimates never go into the published scope');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/invites`, { provider_ids: ['pv_bayan'] })).status, 409);
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/invites`, { provider_ids: ['pv_horizon', 'pv_oasis'] })).status, 200);
  assert.equal((await reem.put(`${P}/rfqs/${rfqId}`, { committee: ['u_ahmed'] })).status, 400, 'requester cannot sit on the committee');
  assert.equal((await reem.put(`${P}/rfqs/${rfqId}`, { criteria: [{ key: 'a', ar: 'معيار أ', weight: 50 }, { key: 'b', ar: 'معيار ب', weight: 40 }] })).status, 400, 'weights must add to 100');
  const closes = new Date(Date.now() + 3500).toISOString();
  assert.equal((await reem.put(`${P}/rfqs/${rfqId}`, { closes_at: closes })).status, 200);
  const pub = (await reem.post(`${P}/rfqs/${rfqId}/publish`)).data;
  assert.equal(pub.status, 'open');
  const inv = (await horizon.get(`${P}/portal/rfqs/${rfqId}`)).data;
  assert.equal(inv.can_bid, true);
  assert.ok(!JSON.stringify(inv).includes('est_unit_price'), 'suppliers never see estimates');
  const items = inv.items;
  assert.equal((await horizon.put(`${P}/portal/rfqs/${rfqId}/bid`, { lines: [{ item_id: items[0].id, unit_price: 27000 }, { item_id: items[1].id, unit_price: 5000 }], delivery_days: 20, validity_days: 90, technical_note: 'خوادم مؤسسية بضمان ثلاث سنوات' })).status, 200);
  assert.equal((await oasis.put(`${P}/portal/rfqs/${rfqId}/bid`, { lines: [{ item_id: items[0].id, unit_price: 29500 }, { item_id: items[1].id, unit_price: 6500 }], delivery_days: 30, validity_days: 90 })).status, 200);
  assert.equal((await oasis.put(`${P}/portal/rfqs/${rfqId}/bid`, { lines: [{ item_id: 'nope', unit_price: 1 }], delivery_days: 30, validity_days: 90 })).status, 400);
  assert.equal((await rashid.get(`${P}/portal/rfqs/${rfqId}`)).status, 403, 'external auditor has no procurement access');
  // sealed: count only, for everyone internal
  const sealed = (await reem.get(`${P}/rfqs/${rfqId}`)).data;
  assert.equal(sealed.bid_count, 2);
  assert.equal(sealed.bids, undefined);
  assert.equal(sealed.sealed, true);
  assert.equal((await majed.get(`${P}/rfqs/${rfqId}`)).data.bids, undefined);
  assert.equal((await majed.post(`${P}/rfqs/${rfqId}/open`)).status, 409, 'cannot open before closing');
  const mine = JSON.stringify((await horizon.get(`${P}/portal/rfqs/${rfqId}`)).data);
  assert.ok(!mine.includes('29500') && !mine.includes('pv_oasis') && !mine.includes('bid_count'), 'a supplier only sees its own bid');
  await sleep(Math.max(0, Date.parse(closes) - Date.now()) + 300);
  assert.equal((await horizon.put(`${P}/portal/rfqs/${rfqId}/bid`, { lines: [{ item_id: items[0].id, unit_price: 1 }], delivery_days: 5, validity_days: 90 })).status, 409, 'no bids after closing');
  assert.equal((await horizon.post(`${P}/portal/rfqs/${rfqId}/withdraw`, { confirm: true })).status, 409);
  // two-key opening by two different committee members
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/open`)).status, 403, 'officer holds no key');
  assert.equal((await majed.post(`${P}/rfqs/${rfqId}/open`)).data.stage, 'key1');
  assert.equal((await majed.post(`${P}/rfqs/${rfqId}/open`)).status, 409, 'same member cannot use both keys');
  assert.equal((await mariam.post(`${P}/rfqs/${rfqId}/open`)).data.stage, 'opened');
  const opened = (await majed.get(`${P}/rfqs/${rfqId}`)).data;
  assert.equal(opened.bids.length, 2);
  assert.ok(opened.access_log.some((a) => a.action === 'view_bids'));
  assert.equal((await ahmed.get(`${P}/rfqs/${rfqId}`)).status, 404, 'requester never reads bids');
  const prView = (await ahmed.get(`${P}/requests/${pr.id}`)).data;
  assert.equal(prView.sourcing.rfq_id, rfqId);
  assert.ok(!JSON.stringify(prView).includes('29500'));
  // scoring
  const hBid = opened.bids.find((b) => b.provider.id === 'pv_horizon'); const oBid = opened.bids.find((b) => b.provider.id === 'pv_oasis');
  assert.equal((await majed.put(`${P}/rfqs/${rfqId}/scores`, { bid_id: hBid.id, scores: { compliance: 11, experience: 8, delivery: 8 } })).status, 400);
  assert.equal((await reem.put(`${P}/rfqs/${rfqId}/scores`, { bid_id: hBid.id, scores: { compliance: 8, experience: 8, delivery: 8 } })).status, 403);
  for (const [who, b, s] of [[majed, hBid, [9, 8, 8]], [majed, oBid, [8, 8, 7]]]) assert.equal((await who.put(`${P}/rfqs/${rfqId}/scores`, { bid_id: b.id, scores: { compliance: s[0], experience: s[1], delivery: s[2] } })).status, 200);
  assert.equal((await majed.get(`${P}/rfqs/${rfqId}`)).data.bids[0].tech, null, 'aggregates hidden from members until everyone scores');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/finalize`)).status, 409, 'scoring incomplete');
  for (const [b, s] of [[hBid, [8, 8, 9]], [oBid, [8, 7, 7]]]) await mariam.put(`${P}/rfqs/${rfqId}/scores`, { bid_id: b.id, scores: { compliance: s[0], experience: s[1], delivery: s[2] } });
  // AI analysis: local fallback, masked labels only
  const an = (await reem.post(`${P}/rfqs/${rfqId}/analysis`)).data;
  assert.equal(an.mode, 'local');
  assert.match(an.narrative, /المورّد أ/);
  assert.ok(!/الأفق|الواحة|Horizon|Oasis/.test(an.narrative), 'no supplier names in the analysis text');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/finalize`)).data.status, 'evaluated');
  const ev = (await reem.get(`${P}/rfqs/${rfqId}`)).data;
  assert.equal(ev.evaluation.top, hBid.id, 'cheaper and technically stronger bid ranks first');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/recommend`, { bid_id: oBid.id })).status, 400, 'non-top recommendation needs a justification');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/recommend`, { bid_id: hBid.id })).data.status, 'recommended');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/vote`, { decision: 'approve' })).status, 403);
  assert.equal((await majed.post(`${P}/rfqs/${rfqId}/vote`, { decision: 'approve' })).status, 200);
  assert.equal((await majed.post(`${P}/rfqs/${rfqId}/vote`, { decision: 'approve' })).status, 409, 'one vote per member');
  assert.equal((await reem.post(`${P}/rfqs/${rfqId}/award`)).status, 409, 'award needs committee and legal first');
  assert.equal((await mariam.post(`${P}/rfqs/${rfqId}/vote`, { decision: 'approve' })).data.status, 'committee_approved');
  assert.equal((await ahmed.post(`${P}/rfqs/${rfqId}/legal`, { decision: 'approve' })).status, 404);
  assert.equal((await majed.post(`${P}/rfqs/${rfqId}/legal`, { decision: 'approve' })).status, 403);
  assert.equal((await yousef.post(`${P}/rfqs/${rfqId}/legal`, { decision: 'approve', note: 'نموذج العقد الموحد' })).data.status, 'legal_approved');
  const po = (await reem.post(`${P}/rfqs/${rfqId}/award`)).data;
  assert.match(po.po_number, /^PO-/);
  assert.equal((await ahmed.get(`${P}/requests/${pr.id}`)).data.status, 'ordered');
  const hv = (await horizon.get(`${P}/portal/invitations`)).data.find((i) => i.id === rfqId);
  const ov = (await oasis.get(`${P}/portal/invitations`)).data.find((i) => i.id === rfqId);
  assert.equal(hv.status, 'awarded'); assert.equal(hv.po_number, po.po_number);
  assert.equal(ov.status, 'not_awarded'); assert.equal(ov.po_number, null);
  const contract = (await horizon.get('/api/sys/providers/portal')).data.contracts.find((c) => c.po_number === po.po_number);
  assert.ok(contract, 'the winner sees its new contract');
});

test('committee recusal: self-declared and (when the disclosure system is present) automatic from declared conflicts', async () => {
  const [mariam, reem, hessa, salem, majed, oasis] = await Promise.all(['mariam', 'reem', 'hessa', 'salem', 'majed', 'oasis'].map(as));
  const grant = (user_id, grantIt) => mariam.put('/api/admin/caps', { user_id, cap: 'procurement.committee', grant: grantIt, confirm: true });
  assert.equal((await grant('u_hessa', true)).status, 200);
  assert.equal((await grant('u_ahmed', true)).status, 200);
  try {
    const pr = await createPr(salem, { category: 'supplies', title: 'أجهزة عرض لقاعات التدريب', items: [{ description: 'جهاز عرض ليزري', qty: 6, unit: 'جهاز', est_unit_price: 9500 }] });
    await decide(hessa, pr.id); await decide(majed, pr.id);
    const id = (await reem.post(`${P}/requests/${pr.id}/source`, { method: 'rfq' })).data.rfq_id;
    await reem.post(`${P}/rfqs/${id}/invites`, { provider_ids: ['pv_horizon', 'pv_madar'] });
    assert.equal((await reem.put(`${P}/rfqs/${id}`, { committee: ['u_majed', 'u_mariam', 'u_hessa', 'u_ahmed'] })).status, 200);
    await reem.post(`${P}/rfqs/${id}/spec`);
    await reem.put(`${P}/rfqs/${id}`, { closes_at: new Date(Date.now() + 3600e3).toISOString() });
    assert.equal((await reem.post(`${P}/rfqs/${id}/publish`)).status, 200);
    assert.equal((await hessa.post(`${P}/rfqs/${id}/recuse`, { reason: 'قرابة مع أحد الشركاء' })).status, 428, 'recusal needs explicit confirmation');
    const r = (await hessa.post(`${P}/rfqs/${id}/recuse`, { reason: 'قرابة مع أحد الشركاء', confirm: true })).data;
    assert.ok(r.committee.find((m) => m.member.id === 'u_hessa').recused);
    assert.equal((await hessa.post(`${P}/rfqs/${id}/open`)).status, 403, 'recused member holds no key');
    const integrity = fs.existsSync(`${ROOT}/server/systems/integrity/service.js`) && fs.readFileSync(`${ROOT}/server/systems/integrity.js`, 'utf8').includes('declaredConflicts');
    const ahmedRow = r.committee.find((m) => m.member.id === 'u_ahmed');
    if (integrity) { assert.equal(ahmedRow.recused, true, 'declared conflict with Horizon → automatic recusal'); assert.equal(ahmedRow.recusal_source, 'integrity'); assert.ok(!/الأفق/.test(ahmedRow.recusal_reason || ''), 'recusal reason does not expose the declaration'); }
    assert.equal((await oasis.get(`${P}/portal/rfqs/${id}`)).status, 404, 'a supplier that was not invited cannot see the RFQ (IDOR)');
    assert.equal((await oasis.put(`${P}/portal/rfqs/${id}/bid`, { lines: [], delivery_days: 5, validity_days: 90 })).status, 404);
    // cancellation: officer only, explicit confirmation, back to procurement
    assert.equal((await majed.post(`${P}/rfqs/${id}/cancel`, { reason: 'إعادة طرح', confirm: true })).status, 403);
    assert.equal((await reem.post(`${P}/rfqs/${id}/cancel`, { reason: 'إعادة طرح بمواصفات محدثة' })).status, 428);
    assert.equal((await reem.post(`${P}/rfqs/${id}/cancel`, { reason: 'إعادة طرح بمواصفات محدثة', confirm: true })).data.status, 'cancelled');
    assert.equal((await salem.get(`${P}/requests/${pr.id}`)).data.status, 'pending_procurement');
  } finally {
    await grant('u_hessa', false); await grant('u_ahmed', false);
  }
});

test('the seeded open RFQ stays sealed; the awarded one exposes its analysis only to the committee, officer and legal', async () => {
  const [reem, majed, yousef, omar, fatima] = await Promise.all(['reem', 'majed', 'yousef', 'omar', 'fatima'].map(as));
  const open = (await majed.get(`${P}/rfqs/rfq_demo_open`)).data;
  assert.equal(open.bid_count, 1); assert.equal(open.bids, undefined);
  const aw = (await yousef.get(`${P}/rfqs/rfq_demo_awarded`)).data;
  assert.equal(aw.status, 'awarded');
  assert.equal(aw.bids.length, 3);
  assert.equal(aw.analysis.mode, 'local');
  const bayan = aw.bids.find((b) => b.provider.id === 'pv_bayan');
  assert.ok(bayan.flags.some((f) => f.code === 'expired_docs'));
  assert.ok(bayan.flags.some((f) => f.code === 'line_low_vs_estimate'));
  assert.ok(aw.bids.find((b) => b.provider.id === 'pv_horizon').flags.some((f) => f.code === 'missing_items'));
  assert.equal((await yousef.get(`${P}/rfqs/rfq_demo_open`)).status, 404, 'legal only sees RFQs at the legal stage');
  for (const c of [omar, fatima]) assert.equal((await c.get(`${P}/rfqs/rfq_demo_awarded`)).status, 404);
  assert.equal((await fatima.get(`${P}/rfqs`)).data.length, 0, 'no RFQs listed for a requester');
  assert.ok((await reem.get(`${P}/rfqs`)).data.length >= 2);
});

test('isolation: external suppliers, other departments, the platform admin, list/workspace leakage', async () => {
  const [horizon, oasis, ahmed, fatima, omar, mariam, reem] = await Promise.all(['horizon', 'oasis', 'ahmed', 'fatima', 'omar', 'mariam', 'reem'].map(as));
  for (const p of ['/requests', '/rfqs', '/budget', '/approvals', '/requests/prq_demo_workshop', '/rfqs/rfq_demo_open']) assert.equal((await horizon.get(P + p)).status, 403, p);
  assert.equal((await reem.get(`${P}/portal/invitations`)).status, 403, 'internal staff do not use the supplier portal');
  assert.equal((await ahmed.get(`${P}/requests/prq_demo_workshop`)).status, 404, 'IDOR on another department request');
  assert.ok((await ahmed.get(`${P}/requests`)).data.every((r) => r.requester.id === 'u_ahmed' || r.department_id === 'dept_it'));
  assert.ok(!(await fatima.get(`${P}/requests`)).data.some((r) => r.department_id !== 'dept_ops'));
  assert.equal((await ahmed.get(`${P}/requests/prq_demo_draft`)).status, 404, 'a colleague’s draft is private');
  // platform admin: configuration only — no Finance or officer powers, IT budget lines only
  const b = (await mariam.get(`${P}/budget`)).data;
  assert.ok(b.lines.every((l) => l.department_id === 'dept_it'));
  assert.equal(b.can_edit, false);
  assert.equal((await mariam.post(`${P}/budget`, { department_id: 'dept_it', code: 'X-1', name_ar: 'بند تجريبي', allocated: 1 })).status, 403);
  assert.equal((await mariam.post(`${P}/requests/prq_demo_soc/source`, { method: 'rfq' })).status, 403);
  assert.equal((await fatima.get(`${P}/budget`)).data.lines.every((l) => l.amounts === null), true, 'employees do not see balances');
  // workspace cards follow the same scope
  const ws = async (c) => (await c.get('/api/workspace')).data.find((s) => s.system === 'procurement')?.cards || [];
  assert.ok((await ws(omar)).some((c) => c.title_en.includes('approvals')));
  assert.ok(!(await ws(fatima)).some((c) => c.title_en.includes('approvals')));
  const hws = await ws(horizon);
  assert.equal(hws.length, 1);
  assert.ok(hws[0].items.every((i) => i.href.startsWith('#/sys/procurement/invitations/')));
  const ows = JSON.stringify(await ws(oasis));
  assert.ok(!ows.includes('119200') && !ows.includes('pv_horizon'));
});

test('requester cancellation needs confirmation and releases the commitment', async () => {
  const [f, omar, majed, noura] = await Promise.all(['fatima', 'omar', 'majed', 'noura'].map(as));
  const pr = await createPr(f, { line: await lineOf(f, '210'), items: [{ description: 'حوامل كتيبات', qty: 5, unit: 'قطعة', est_unit_price: 400 }] });
  await decide(omar, pr.id); await decide(majed, pr.id);
  const lineId = (await f.get(`${P}/requests/${pr.id}`)).data.budget_line.id;
  const before = (await noura.get(`${P}/budget/${lineId}`)).data.amounts.committed;
  assert.equal((await f.post(`${P}/requests/${pr.id}/cancel`, { reason: 'لم تعد الحاجة قائمة' })).status, 428);
  assert.equal((await omar.post(`${P}/requests/${pr.id}/cancel`, { reason: 'x', confirm: true })).status, 403);
  assert.equal((await f.post(`${P}/requests/${pr.id}/cancel`, { reason: 'لم تعد الحاجة قائمة', confirm: true })).data.status, 'cancelled');
  assert.equal((await noura.get(`${P}/budget/${lineId}`)).data.amounts.committed, before - 2000);
});

test('Ask AI: tools and MCP within scope, intents create drafts and list approvals, bids never exposed', async () => {
  const [f, omar, salem] = await Promise.all(['fatima', 'omar', 'salem'].map(as));
  const mine = await f.tool('procurement_my_requests', {});
  assert.equal(mine.data.status, 'ok');
  assert.ok(mine.data.result.every((r) => !('bids' in r)));
  const ambiguous = await mcp(f, 'procurement_create_request', { title: 'أقلام', category: 'supplies', justification: 'قرطاسية للفريق', needed_by: day(14), items: [{ description: 'أقلام حبر', qty: 50, unit: 'قطعة', est_unit_price: 3 }] });
  assert.equal(ambiguous.structuredContent.status, 'error');
  assert.match(ambiguous.structuredContent.error, /OPS-/, 'asks for the budget line');
  const made = await mcp(f, 'procurement_create_request', { title: 'أقلام', category: 'supplies', justification: 'قرطاسية للفريق', needed_by: day(14), budget_line_code: `OPS-${new Date().getUTCFullYear()}-215`, items: [{ description: 'أقلام حبر', qty: 50, unit: 'قطعة', est_unit_price: 3 }] });
  assert.equal(made.structuredContent.status, 'ok');
  assert.equal(made.structuredContent.result.status, 'draft');
  const listed = await mcp(omar, 'procurement_pending_approvals', {});
  assert.ok(listed.structuredContent.result.manager.some((r) => r.number.startsWith('PR-')));
  const chat = await omar.chat('طلبات الشراء بانتظار اعتمادي');
  assert.ok(chat.events.some((e) => e.tool === 'procurement_pending_approvals' || e.step?.tool === 'procurement_pending_approvals' || JSON.stringify(e).includes('procurement_pending_approvals')));
  assert.match(chat.final.text || chat.final.message || JSON.stringify(chat.final), /PR-\d{4}-\d{4}/);
  const before = (await salem.get(`${P}/requests?scope=mine`)).data.length;
  const created = await salem.chat('طلب شراء 3 حقائب تدريبية بسعر 250 درهم للوحدة');
  assert.match(JSON.stringify(created.final), /مسودة طلب الشراء PR-/);
  const after2 = (await salem.get(`${P}/requests?scope=mine`)).data;
  assert.equal(after2.length, before + 1);
  assert.equal(after2[0].status, 'draft');
  const ask = await salem.chat('طلب شراء حقائب تدريبية');
  assert.match(JSON.stringify(ask.final), /الكمية/);
  // task command is not captured by the procurement intent
  const task = await f.chat('أضف مهمة متابعة طلب شراء المقاعد غداً');
  assert.ok(!JSON.stringify(task.events).includes('procurement_create_request'));
  // no tool touches the locked bids domain
  const S = await stack();
  const { token } = (await f.post('/api/me/tokens', {})).data;
  const tl = await (await fetch(`${S.portal}/mcp`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) })).json();
  const names = tl.result.tools.map((t) => t.name);
  assert.ok(names.includes('procurement_my_requests'));
  assert.ok(!names.some((n) => /bid|rfq/.test(n)));
  assert.ok(!names.includes('procurement_undo_request'), 'internal undo tool is not exposed');
});

test('no excellence points for procurement', async () => {
  const g = (await (await as('reem')).get('/api/game/me')).data;
  assert.ok(!g.rules.some((r) => r.system === 'procurement'));
});
