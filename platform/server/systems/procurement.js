// AI Procurement — المشتريات الذكية.
// Purchase requests → line manager → Finance (budget check & commitment) →
// Procurement officer → direct purchase (< 50,000 AED) or RFQ (≥ 50,000 AED):
// AI-drafted scope of work, eligible-provider shortlist, sealed bids, two-key
// opening, weighted committee evaluation with a masked AI analysis panel,
// recommendation → committee (2) → legal → PO → contract in the providers registry.
// Modules: ./procurement/{schema,requests,rfq,ai,seed}.js.
import { defineSystem } from './registry.js';
import { isStaff, isExternal, hasCap, wrap, check, S, str, int, num, bool, date, arr, obj, requireConfirm, requireStaff, Forbidden, BadRequest, NotFound, Conflict, day, round } from './kit.js';
import { THRESHOLD, CATEGORIES, PR_STATUS, schema, isOfficer, isFinance, isBudget, isLegal, isCommittee } from './procurement/schema.js';
import * as R from './procurement/requests.js';
import * as Q from './procurement/rfq.js';
import { draftSpec, runAnalysis } from './procurement/ai.js';
import { seed } from './procurement/seed.js';
import { providerOfUser } from './providers.js';

const CAT = Object.keys(CATEGORIES);
const ITEM = S({ description: str('', { maxLength: 300 }), qty: num('', { minimum: 0 }), unit: str('', { maxLength: 30 }), est_unit_price: num('', { minimum: 0 }) }, ['description', 'qty', 'unit', 'est_unit_price']);
const PR_CREATE = S({ title: str('', { maxLength: 200 }), category: str('', { enum: CAT }), justification: str('', { maxLength: 2000 }), needed_by: date(), budget_line_id: str('', { maxLength: 40 }), items: arr(ITEM, { maxItems: 40 }), submit: bool() }, ['title', 'category', 'justification', 'needed_by', 'budget_line_id', 'items']);
const PR_UPDATE = S({ title: str('', { maxLength: 200 }), category: str('', { enum: CAT }), justification: str('', { maxLength: 2000 }), needed_by: date(), budget_line_id: str('', { maxLength: 40 }), items: arr(ITEM, { maxItems: 40 }) });
const PR_LIST = S({ scope: str('', { enum: ['mine', 'all'] }), status: str('', { enum: Object.keys(PR_STATUS) }), q: str('', { maxLength: 80 }) });
const DECIDE = S({ decision: str('', { enum: ['approve', 'reject', 'return'] }), note: str('', { maxLength: 1000 }) }, ['decision']);
const CANCEL = S({ reason: str('', { maxLength: 500 }), confirm: bool() });
const SOURCE = S({ method: str('', { enum: ['rfq', 'direct'] }), provider_id: str('', { maxLength: 40 }), amount: num('', { minimum: 0 }), quote_ref: str('', { maxLength: 60 }), note: str('', { maxLength: 300 }) }, ['method']);
const BUDGET_NEW = S({ department_id: str('', { maxLength: 40 }), code: str('', { maxLength: 30, minLength: 3 }), name_ar: str('', { maxLength: 160, minLength: 3 }), name_en: str('', { maxLength: 160 }), allocated: num('', { minimum: 0, maximum: 1e10 }), spent: num('', { minimum: 0, maximum: 1e10 }) }, ['department_id', 'code', 'name_ar', 'allocated']);
const BUDGET_UPD = S({ name_ar: str('', { maxLength: 160, minLength: 3 }), name_en: str('', { maxLength: 160 }), allocated: num('', { minimum: 0, maximum: 1e10 }), spent: num('', { minimum: 0, maximum: 1e10 }), note: str('', { maxLength: 300 }) });
const CRIT = S({ key: str('', { maxLength: 30 }), ar: str('', { maxLength: 120 }), en: str('', { maxLength: 120 }), weight: int('', { minimum: 1, maximum: 100 }) }, ['ar', 'weight']);
const RFQ_UPD = S({ title: str('', { maxLength: 200 }), closes_at: str('ISO datetime', { maxLength: 40 }), criteria: arr(CRIT, { maxItems: 6 }), tech_weight: int('', { minimum: 30, maximum: 90 }), min_tech: int('', { minimum: 0, maximum: 90 }), committee: arr(str('', { maxLength: 40 }), { maxItems: 9 }) });
const INVITE = S({ provider_ids: arr(str('', { maxLength: 40 }), { maxItems: 20 }) }, ['provider_ids']);
const EXTEND = S({ closes_at: str('', { maxLength: 40 }), reason: str('', { maxLength: 300 }) }, ['closes_at', 'reason']);
const REASON_C = S({ reason: str('', { maxLength: 500 }), confirm: bool() });
const SCORE = S({ bid_id: str('', { maxLength: 40 }), scores: obj('criterion → 0..10') }, ['bid_id', 'scores']);
const RECOMMEND = S({ bid_id: str('', { maxLength: 40 }), note: str('', { maxLength: 1000 }) }, ['bid_id']);
const VOTE = S({ decision: str('', { enum: ['approve', 'reject'] }), note: str('', { maxLength: 1000 }) }, ['decision']);
const LEGAL = S({ decision: str('', { enum: ['approve', 'return'] }), note: str('', { maxLength: 1000 }) }, ['decision']);
const BID = S({
  lines: arr(S({ item_id: str('', { maxLength: 40 }), unit_price: num('', { minimum: 0, maximum: 1e8 }) }, ['item_id']), { maxItems: 40 }),
  delivery_days: int('', { minimum: 1, maximum: 365 }), validity_days: int('', { minimum: 30, maximum: 365 }), technical_note: str('', { maxLength: 3000 }),
}, ['lines', 'delivery_days', 'validity_days']);
const CONFIRM = S({ confirm: bool() });

// ---------------- role context ----------------
function me(user) {
  if (isExternal(user)) {
    const p = providerOfUser(user.id);
    let inv = [];
    try { inv = p ? Q.portalInvitations(user) : []; } catch { inv = []; }
    return { external: true, provider: p ? { id: p.id, name_ar: p.name_ar, name_en: p.name_en, status: p.status } : null, counts: { open: inv.filter((i) => i.status === 'open').length, total: inv.length } };
  }
  const qs = R.requestQueues(user); const rq = Q.rfqQueues(user);
  const mine = R.listRequests(user, { scope: 'mine' });
  return {
    external: false, threshold: THRESHOLD, categories: CATEGORIES,
    roles: { officer: isOfficer(user), finance: isFinance(user), budget: isBudget(user), legal: isLegal(user), committee: isCommittee(user), manager: user.role !== 'employee' },
    counts: {
      mine_active: mine.filter((r) => !['ordered', 'rejected', 'cancelled'].includes(r.status)).length, mine_total: mine.length,
      approvals: qs.manager.length + qs.finance.length + qs.procurement.length + rq.length,
      rfqs: Q.listRfqs(user).filter((q) => !['awarded', 'cancelled'].includes(q.status)).length,
    },
  };
}

function routes(r) {
  r.get('/me', wrap((req) => me(req.user)));
  // purchase requests
  r.get('/requests', wrap((req) => R.listRequests(req.user, check(PR_LIST, { ...req.query }))));
  r.post('/requests', wrap((req) => R.createRequest(req.user, check(PR_CREATE, req.body))));
  r.get('/requests/:id', wrap((req) => R.getRequest(req.user, req.params.id)));
  r.put('/requests/:id', wrap((req) => R.updateRequest(req.user, req.params.id, check(PR_UPDATE, req.body))));
  r.post('/requests/:id/submit', wrap((req) => R.submitRequest(req.user, req.params.id)));
  r.post('/requests/:id/cancel', wrap((req) => {
    const b = check(CANCEL, req.body);
    const pr = R.visibleRequest(req.user, req.params.id);
    if (pr.requester_id !== req.user.id) throw new Forbidden('يلغي الطلبَ مقدّمُه فقط');
    requireConfirm(b, 'إلغاء طلب الشراء يتطلب تأكيداً صريحاً');
    return R.cancelRequest(req.user, req.params.id, b);
  }));
  r.post('/requests/:id/decide', wrap((req) => R.decide(req.user, req.params.id, check(DECIDE, req.body))));
  r.post('/requests/:id/source', wrap((req) => {
    const b = check(SOURCE, req.body);
    if (b.method === 'rfq') { const id = Q.startRfq(req.user, req.params.id); return { rfq_id: id }; }
    if (!b.provider_id || b.amount == null) throw new BadRequest('اختر المورد وأدخل قيمة عرض السعر');
    return R.directPurchase(req.user, req.params.id, b);
  }));
  r.get('/approvals', wrap((req) => { requireStaff(req.user); return { requests: R.requestQueues(req.user), rfqs: Q.rfqQueues(req.user) }; }));
  // budget lines (Finance maintains them here; FS stays inside Vault and is never read)
  r.get('/budget', wrap((req) => R.listBudget(req.user)));
  r.get('/budget/options', wrap((req) => R.budgetOptions(req.user)));
  r.get('/budget/:id', wrap((req) => R.getBudgetLine(req.user, req.params.id)));
  r.post('/budget', wrap((req) => R.createBudgetLine(req.user, check(BUDGET_NEW, req.body))));
  r.put('/budget/:id', wrap((req) => R.updateBudgetLine(req.user, req.params.id, check(BUDGET_UPD, req.body))));
  // RFQs
  r.get('/rfqs', wrap((req) => Q.listRfqs(req.user)));
  r.get('/rfqs/:id', wrap((req) => Q.getRfq(req.user, req.params.id)));
  r.put('/rfqs/:id', wrap((req) => { Q.updateRfq(req.user, req.params.id, check(RFQ_UPD, req.body)); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/spec', wrap(async (req) => ({ ...(await draftSpec(req.user, req.params.id)), rfq: await Q.getRfq(req.user, req.params.id) })));
  r.get('/rfqs/:id/shortlist', wrap((req) => Q.shortlistFor(req.user, req.params.id)));
  r.post('/rfqs/:id/invites', wrap((req) => { Q.invite(req.user, req.params.id, check(INVITE, req.body).provider_ids); return Q.getRfq(req.user, req.params.id); }));
  r.delete('/rfqs/:id/invites/:pid', wrap((req) => { Q.uninvite(req.user, req.params.id, req.params.pid); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/publish', wrap(async (req) => { await Q.publish(req.user, req.params.id); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/extend', wrap((req) => { Q.extend(req.user, req.params.id, check(EXTEND, req.body)); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/cancel', wrap((req) => {
    const b = check(REASON_C, req.body);
    Q.visibleRfq(req.user, req.params.id);
    if (!isOfficer(req.user)) throw new Forbidden('هذا الإجراء من صلاحية أخصائي المشتريات');
    requireConfirm(b, 'إلغاء طلب العروض يتطلب تأكيداً صريحاً');
    Q.cancelRfq(req.user, req.params.id, b); return Q.getRfq(req.user, req.params.id);
  }));
  r.post('/rfqs/:id/open', wrap(async (req) => ({ ...(await Q.openKey(req.user, req.params.id)), rfq: await Q.getRfq(req.user, req.params.id) })));
  r.post('/rfqs/:id/recuse', wrap((req) => {
    const b = check(REASON_C, req.body);
    Q.visibleRfq(req.user, req.params.id);
    requireConfirm(b, 'التنحي عن اللجنة يتطلب تأكيداً صريحاً');
    Q.recuse(req.user, req.params.id, b); return Q.getRfq(req.user, req.params.id);
  }));
  r.put('/rfqs/:id/scores', wrap(async (req) => { await Q.score(req.user, req.params.id, check(SCORE, req.body)); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/analysis', wrap(async (req) => ({ ...(await runAnalysis(req.user, req.params.id)), rfq: await Q.getRfq(req.user, req.params.id) })));
  r.post('/rfqs/:id/finalize', wrap(async (req) => { await Q.finalize(req.user, req.params.id); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/recommend', wrap(async (req) => { const b = check(RECOMMEND, req.body); await Q.recommend(req.user, req.params.id, b); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/vote', wrap(async (req) => { const b = check(VOTE, req.body); await Q.vote(req.user, req.params.id, b); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/legal', wrap(async (req) => { const b = check(LEGAL, req.body); await Q.legalReview(req.user, req.params.id, b); return Q.getRfq(req.user, req.params.id); }));
  r.post('/rfqs/:id/award', wrap(async (req) => ({ ...(await Q.award(req.user, req.params.id)), rfq: null })));
  // provider portal (external identities; own invitations and own bid only)
  r.get('/portal/invitations', wrap((req) => Q.portalInvitations(req.user)));
  r.get('/portal/rfqs/:id', wrap((req) => Q.portalInvitation(req.user, req.params.id)));
  r.put('/portal/rfqs/:id/bid', wrap((req) => Q.submitBid(req.user, req.params.id, check(BID, req.body))));
  r.post('/portal/rfqs/:id/withdraw', wrap((req) => {
    const b = check(CONFIRM, req.body);
    Q.portalInvitation(req.user, req.params.id);
    requireConfirm(b, 'سحب العرض يتطلب تأكيداً صريحاً');
    return Q.withdrawBid(req.user, req.params.id);
  }));
}

// ---------------- Ask AI tools (domain procurement.requests; bids are never exposed) ----------------
const statusAr = (s) => PR_STATUS[s]?.[0] || s;
const fmtAed = (n) => `${Number(n || 0).toLocaleString('en-US')} د.إ`;
const brief = (r) => ({ id: r.id, number: r.number, title: r.title, status: r.status, status_ar: statusAr(r.status), est_total: r.est_total, needed_by: r.needed_by, po_number: r.po_number || null });
function resolveLine(user, code, text, matchByName) {
  const lines = R.budgetOptions(user);
  if (!lines.length) throw new Conflict('لا توجد بنود ميزانية لإدارتك — تواصل مع الإدارة المالية');
  if (code) { const l = lines.find((x) => x.code.toLowerCase() === String(code).toLowerCase()); if (!l) throw new BadRequest(`بند الميزانية ${code} غير متاح لإدارتك. البنود المتاحة: ${lines.map((x) => x.code).join('، ')}`); return l; }
  if (lines.length === 1) return lines[0];
  if (text && matchByName) { const m = matchByName(lines, text, (l) => l.name_ar); if (m.matches.length === 1) return m.matches[0]; }
  return null;
}
const tools = [
  {
    name: 'procurement_my_requests', domain: 'procurement.requests',
    description: "The user's own purchase requests with their workflow status (draft, awaiting manager/finance, with procurement, sourcing, PO issued, rejected).",
    input_schema: S({ status: str('filter by status', { enum: Object.keys(PR_STATUS) }) }),
    handler: (user, i) => ({ result: R.listRequests(user, { scope: 'mine', status: i.status }).map(brief) }),
    format: (res) => (res.length ? `طلبات الشراء الخاصة بك (${res.length}):\n${res.slice(0, 10).map((r) => `• ${r.number} «${r.title}» — ${r.status_ar} — ${fmtAed(r.est_total)}${r.po_number ? ` — أمر الشراء ${r.po_number}` : ''}`).join('\n')}` : 'لا توجد لديك طلبات شراء. يمكنك قول: «طلب شراء 5 شاشات بسعر 1200 درهم للوحدة».'),
  },
  {
    name: 'procurement_create_request', domain: 'procurement.requests', mutates: true,
    description: 'Create a purchase request DRAFT for the user (own department budget line). Never invent quantities or prices: ask the user. The user reviews and submits it for approval in the system (submit=true only if the user explicitly asked to submit).',
    input_schema: S({
      title: str('short title', { maxLength: 200 }), category: str('it|supplies|consulting|facilities', { enum: CAT }), justification: str('why it is needed', { maxLength: 2000 }),
      needed_by: date('needed-by date'), budget_line_code: str('budget line code of the user department', { maxLength: 30 }),
      items: arr(ITEM, { maxItems: 40 }), submit: bool('submit for approval now'),
    }, ['title', 'category', 'justification', 'needed_by', 'items']),
    handler: (user, i) => {
      const line = resolveLine(user, i.budget_line_code);
      if (!line) throw new BadRequest(`حدّد بند الميزانية: ${R.budgetOptions(user).map((l) => `${l.code} (${l.name_ar})`).join('، ')}`);
      const r = R.createRequest(user, { title: i.title, category: i.category, justification: i.justification, needed_by: i.needed_by, budget_line_id: line.id, items: i.items, submit: !!i.submit });
      return { result: { ...brief(r), budget_line: line.code, href: `#/sys/procurement/mine/${r.id}` }, undo: { tool: 'procurement_undo_request', input: { id: r.id } } };
    },
    format: (r) => `${r.status === 'draft' ? 'أنشأتُ مسودة' : 'أرسلتُ'} طلب الشراء ${r.number} «${r.title}» بقيمة تقديرية ${fmtAed(r.est_total)} على البند ${r.budget_line}. ${r.status === 'draft' ? 'راجعها وأكمل المبرر ثم أرسلها للاعتماد من «المشتريات الذكية ← طلباتي».' : 'الطلب الآن بانتظار اعتماد مديرك المباشر.'}`,
  },
  {
    name: 'procurement_undo_request', internal: true, mutates: true,
    description: 'Undo a purchase request created by the assistant (only while it is still an untouched draft or awaiting the manager).',
    input_schema: S({ id: str('request id') }, ['id']),
    handler: (user, i) => {
      const r = R.visibleRequest(user, i.id);
      if (r.requester_id !== user.id) throw new NotFound();
      if (r.status === 'draft') { R.cancelRequest(user, r.id, { reason: 'تراجع عن إنشاء الطلب عبر المساعد' }); return { result: { id: r.id, undone: true } }; }
      if (r.status === 'pending_manager' && !r.mgr_by) { R.cancelRequest(user, r.id, { reason: 'تراجع عن إرسال الطلب عبر المساعد' }); return { result: { id: r.id, undone: true } }; }
      throw new Conflict('لا يمكن التراجع: بدأت اعتمادات الطلب');
    },
  },
  {
    name: 'procurement_pending_approvals', domain: 'procurement.requests',
    description: 'Purchase requests and RFQ steps waiting for the current user (as line manager, Finance, Procurement officer, committee member or legal reviewer). Bid contents are never included.',
    input_schema: S({}),
    handler: (user) => {
      const q = R.requestQueues(user); const rq = Q.rfqQueues(user);
      return { result: {
        manager: q.manager.map(brief), finance: q.finance.map((r) => ({ ...brief(r), budget_sufficient: r.budget?.sufficient ?? null })), procurement: q.procurement.map((r) => ({ ...brief(r), suggested_method: r.suggested_method })),
        rfq_steps: rq.map((x) => ({ rfq: x.rfq.number, title: x.rfq.title, step_ar: x.ar })),
      } };
    },
    format: (res) => {
      const lines = [];
      if (res.manager.length) lines.push(`اعتماد المدير (${res.manager.length}):`, ...res.manager.map((r) => `• ${r.number} «${r.title}» — ${fmtAed(r.est_total)}`));
      if (res.finance.length) lines.push(`اعتماد الميزانية (${res.finance.length}):`, ...res.finance.map((r) => `• ${r.number} «${r.title}» — ${fmtAed(r.est_total)}${r.budget_sufficient === false ? ' — الرصيد غير كافٍ' : ''}`));
      if (res.procurement.length) lines.push(`للطرح في المشتريات (${res.procurement.length}):`, ...res.procurement.map((r) => `• ${r.number} «${r.title}» — ${r.suggested_method === 'rfq' ? 'طلب عروض' : 'شراء مباشر'}`));
      if (res.rfq_steps.length) lines.push('طلبات العروض:', ...res.rfq_steps.map((x) => `• ${x.rfq}: ${x.step_ar}`));
      return lines.length ? `${lines.join('\n')}\nافتح «المشتريات الذكية ← الاعتمادات» لاتخاذ القرار.` : 'لا توجد طلبات شراء بانتظار اعتمادك الآن.';
    },
  },
];

// ---------------- rule-based planner intents ----------------
const CREATE_RE = /^(?:(?:اريد|ابغي|ابغى|ابي|ممكن|لو سمحت|من فضلك)\s+)?(?:(?:انشي|اعمل|قدم|ارفع|سجل|اضف|جهز)\s+)?(?:لي\s+)?طلب\s+شراء(?:\s|$|:)/;
function guessCategory(n) {
  if (/(ترخيص|تراخيص|برمجي|برنامج|استضافه|دعم فني|خدمه تقنيه|منصه|اشتراك سحابي)/.test(n)) return 'it';
  if (/(استشار|دراسه|تدريب|برنامج تدريبي)/.test(n)) return 'consulting';
  if (/(صيانه|تنظيف|نقل|مرافق)/.test(n)) return 'facilities';
  return 'supplies';
}
const intents = [
  {
    test: (n) => /طلبات\s+(ال)?شراء/.test(n) && /(بانتظار|تنتظر|تحتاج|المعلقه لدي|لاعتمادي)\s*(اعتمادي|موافقتي|قراري|لدي)?/.test(n) && /(اعتماد|موافق|قرار|لدي)/.test(n),
    plan: () => [{ tool: 'procurement_pending_approvals', input: {}, label: 'طلبات الشراء بانتظار اعتمادي' }],
  },
  {
    test: (n) => /(طلبات\s+(ال)?شراء\s+(الخاصه بي|حقي|التي قدمتها|الخاصه|اللي قدمتها)|^(ما\s+)?(حاله|وضع)\s+طلبات?\s+(ال)?شراء|^طلبات الشراء$|طلباتي في المشتريات)/.test(n),
    plan: () => [{ tool: 'procurement_my_requests', input: {}, label: 'طلبات الشراء الخاصة بي' }],
  },
  {
    test: (n) => CREATE_RE.test(n),
    plan: (user, clause, ctx, { norm, digits, parseDate, matchByName }) => {
      if (!isStaff(user)) return [{ say: 'طلبات الشراء متاحة لموظفي الجهة فقط.' }];
      const t = digits(clause).replace(/(\d)[٬،,](?=\d{3})/g, '$1');
      const after = (t.split(/طلب\s+شراء\s*:?/)[1] || '').trim();
      const priceM = after.match(/(?:بسعر|سعر|بقيم[ةه]|بتكلف[ةه])\s*(?:تقديري\s*)?(?:قدره\s*)?(\d+(?:\.\d+)?)/) || after.match(/(\d+(?:\.\d+)?)\s*(?:درهم|دراهم|د\.?\s?إ|aed|AED)/);
      let rest = priceM ? after.replace(priceM[0], ' ') : after;
      rest = rest.replace(/(?:درهم|دراهم|د\.?\s?إ|AED|aed)|(?:لل|ل)(?:وحد[ةه]|قطع[ةه])|لكل\s+واحد[ةه]?/g, ' ');
      const dateTxt = rest.match(/(?:قبل|بتاريخ|بحلول|خلال|في موعد|موعد)\s+.*$/)?.[0] || '';
      rest = rest.replace(dateTxt, ' ');
      const qtyM = rest.match(/(\d+(?:\.\d+)?)/);
      const desc = rest.replace(qtyM?.[0] ?? '', ' ').replace(/^[\s:،,-]+|[\s:،,.-]+$/g, '').replace(/\s+/g, ' ').trim();
      if (!desc || desc.length < 3) return [{ ask: 'ما الذي تريد شراءه؟ مثال: «طلب شراء 5 شاشات عرض بسعر 1200 درهم للوحدة».' }];
      if (!qtyM) return [{ ask: `كم الكمية المطلوبة من «${desc}»؟ أعد الطلب مع الكمية والسعر التقديري للوحدة، مثل: «طلب شراء 3 ${desc} بسعر 900 درهم للوحدة».` }];
      if (!priceM) return [{ ask: `ما السعر التقديري للوحدة من «${desc}»؟ مثال: «طلب شراء ${qtyM[1]} ${desc} بسعر 900 درهم للوحدة».` }];
      const qty = Number(qtyM[1]); const price = Number(priceM[1]);
      if (!(qty > 0) || !(price > 0)) return [{ ask: 'الكمية والسعر يجب أن يكونا أكبر من صفر.' }];
      let line;
      try { line = resolveLine(user, (t.match(/[A-Z]{2,5}-\d{4}-\d{2,4}/) || [])[0], clause, matchByName); } catch (e) { return [{ say: e.message }]; }
      if (!line) return [{ ask: `على أي بند ميزانية؟ ${R.budgetOptions(user).map((l) => `${l.code} (${l.name_ar})`).join('، ')} — أعد الطلب مع رمز البند.` }];
      const needed = (dateTxt && parseDate(dateTxt)) || day(30);
      const n = norm(clause);
      return [{
        tool: 'procurement_create_request',
        input: { title: desc.slice(0, 200), category: guessCategory(n), justification: `مسودة من المساعد الذكي — أكمل مبرر الحاجة قبل الإرسال: ${desc}`.slice(0, 2000), needed_by: needed < day(0) ? day(30) : needed, budget_line_code: line.code, items: [{ description: desc.slice(0, 300), qty, unit: 'وحدة', est_unit_price: price }] },
        label: `إنشاء مسودة طلب شراء: ${qty} × ${desc} (${round(qty * price, 2)} د.إ)`,
      }];
    },
  },
];

// ---------------- Home workspace ----------------
const dmy = (iso) => String(iso || '').slice(0, 10);
function workspace(user) {
  if (isExternal(user)) {
    let inv = [];
    try { inv = Q.portalInvitations(user); } catch { return []; }
    const open = inv.filter((i) => i.status === 'open').sort((a, b) => String(a.closes_at).localeCompare(String(b.closes_at)));
    if (!inv.length) return [];
    const noBid = open.filter((i) => i.my_bid?.status !== 'submitted');
    return [{
      title_ar: 'دعوات مفتوحة لتقديم العروض', title_en: 'Open invitations to bid', value: open.length, unit_ar: 'دعوة', unit_en: 'open',
      tone: noBid.length ? 'emph' : open.length ? 'good' : null,
      hint_ar: open.length ? `أقرب إغلاق ${dmy(open[0].closes_at)} · ${noBid.length} بلا عرض بعد` : 'لا دعوات مفتوحة حالياً', hint_en: open.length ? `Next closing ${dmy(open[0].closes_at)} · ${noBid.length} without a bid` : 'No open invitations',
      href: '#/sys/procurement/invitations',
      items: open.slice(0, 3).map((i) => ({ title: `${i.number} — ${i.title}`, meta_ar: i.my_bid?.status === 'submitted' ? 'قُدّم عرضك' : `يُغلق ${dmy(i.closes_at)}`, meta_en: i.my_bid?.status === 'submitted' ? 'bid submitted' : `closes ${dmy(i.closes_at)}`, href: `#/sys/procurement/invitations/${i.id}` })),
      cta: { label_ar: noBid.length ? 'قدّم عرضك' : 'عرض الدعوات', label_en: noBid.length ? 'Submit a bid' : 'View invitations', href: noBid.length ? `#/sys/procurement/invitations/${noBid[0].id}` : '#/sys/procurement/invitations' },
    }];
  }
  const cards = [];
  const qs = R.requestQueues(user); const rq = Q.rfqQueues(user);
  const reqs = [...qs.manager, ...qs.finance, ...qs.procurement];
  const n = reqs.length + rq.length;
  if (n) {
    cards.push({
      title_ar: 'بانتظار اعتمادك في المشتريات', title_en: 'Procurement approvals waiting for you', value: n, unit_ar: 'إجراء', unit_en: 'actions', tone: 'warn',
      hint_ar: 'القرار لك — لا يعتمد أحد طلبه بنفسه', hint_en: 'Your decision — nobody approves their own request',
      href: '#/sys/procurement/approvals',
      items: [...reqs.map((r) => ({ title: `${r.number} — ${r.title}`, meta_ar: `${round(r.est_total, 0)} د.إ`, meta_en: `AED ${round(r.est_total, 0)}`, href: `#/sys/procurement/approvals/${r.id}` })),
        ...rq.map((x) => ({ title: `${x.rfq.number} — ${x.ar}`, meta_ar: x.rfq.title, meta_en: x.rfq.title, href: `#/sys/procurement/rfqs/${x.rfq.id}` }))].slice(0, 3),
      cta: { label_ar: 'افتح الاعتمادات', label_en: 'Open approvals', href: '#/sys/procurement/approvals' },
    });
  }
  if (isOfficer(user)) {
    const soon = Q.listRfqs(user).filter((q) => (q.status === 'open' && Date.parse(q.closes_at) - Date.now() < 7 * 864e5) || q.status === 'closed').sort((a, b) => String(a.closes_at).localeCompare(String(b.closes_at)));
    const drafts = Q.listRfqs(user).filter((q) => q.status === 'draft');
    if (soon.length || drafts.length) cards.push({
      title_ar: 'طلبات عروض تُغلق قريباً', title_en: 'RFQs closing soon', value: soon.length, unit_ar: 'طلب', unit_en: 'RFQs', tone: soon.some((q) => q.status === 'closed') ? 'emph' : null,
      hint_ar: `${drafts.length} مسودة قيد الإعداد`, hint_en: `${drafts.length} draft(s) in preparation`, href: '#/sys/procurement/rfqs',
      items: [...soon, ...drafts].slice(0, 3).map((q) => ({ title: `${q.number} — ${q.title}`, meta_ar: q.status === 'draft' ? 'مسودة' : q.status === 'closed' ? 'بانتظار الفتح' : `يُغلق ${dmy(q.closes_at)}`, meta_en: q.status === 'draft' ? 'draft' : q.status === 'closed' ? 'awaiting opening' : `closes ${dmy(q.closes_at)}`, href: `#/sys/procurement/rfqs/${q.id}` })),
      cta: { label_ar: 'طلبات العروض', label_en: 'RFQs', href: '#/sys/procurement/rfqs' },
    });
  }
  if (isBudget(user) || isFinance(user)) {
    const b = R.listBudget(user);
    if (b.totals) {
      const top = b.lines.filter((l) => l.amounts).sort((x, y) => (y.amounts.utilisation ?? 0) - (x.amounts.utilisation ?? 0)).slice(0, 3);
      cards.push({
        title_ar: 'استغلال ميزانية المشتريات', title_en: 'Procurement budget utilisation', value: round(b.totals.utilisation, 0), unit_ar: '%', unit_en: '%',
        tone: b.totals.utilisation >= 90 ? 'crit' : b.totals.utilisation >= 75 ? 'warn' : 'good',
        hint_ar: `ملتزم به ومصروف من إجمالي الاعتمادات ${b.fiscal_year}`, hint_en: `Committed + spent of ${b.fiscal_year} allocations`, href: '#/sys/procurement/budget',
        items: top.map((l) => ({ title: `${l.code} — ${l.name_ar}`, meta_ar: `${round(l.amounts.utilisation, 0)}%`, meta_en: `${round(l.amounts.utilisation, 0)}%`, href: '#/sys/procurement/budget' })),
        cta: { label_ar: 'الميزانية', label_en: 'Budget', href: '#/sys/procurement/budget' },
      });
    }
  }
  const mine = R.listRequests(user, { scope: 'mine' }).filter((r) => !['ordered', 'rejected', 'cancelled'].includes(r.status));
  if (mine.length) cards.push({
    title_ar: 'طلبات الشراء الخاصة بي', title_en: 'My purchase requests', value: mine.length, unit_ar: 'قيد التنفيذ', unit_en: 'in progress', tone: mine.some((r) => r.status === 'draft' && r.return_note) ? 'warn' : null,
    hint_ar: 'تابع مرحلة كل طلب', hint_en: 'Follow each request’s stage', href: '#/sys/procurement/mine',
    items: mine.slice(0, 3).map((r) => ({ title: `${r.number} — ${r.title}`, meta_ar: PR_STATUS[r.status][0], meta_en: PR_STATUS[r.status][1], href: `#/sys/procurement/mine/${r.id}` })),
    cta: { label_ar: 'طلب شراء جديد', label_en: 'New purchase request', href: '#/sys/procurement/mine/new' },
  });
  return cards.slice(0, 3);
}

defineSystem({
  key: 'procurement',
  name_ar: 'المشتريات الذكية', name_en: 'AI Procurement',
  description_ar: 'طلبات الشراء والاعتمادات وطلبات العروض وتقييمها بمساعدة الذكاء الاصطناعي حتى أمر الشراء',
  description_en: 'Purchase requests, approvals, RFQs and AI-assisted evaluation through to purchase order',
  icon: 'cart', category: 'operations',
  external: true,
  access: (u) => isStaff(u) || hasCap(u, 'providers.portal'),
  defaultPinned: (u) => hasCap(u, 'procurement.officer', 'procurement.finance', 'procurement.committee', 'procurement.legal', 'providers.portal') || u.role !== 'employee',
  caps: [
    { cap: 'procurement.officer', ar: 'أخصائي مشتريات (طلبات العروض والترسية)', en: 'Procurement officer (RFQs and award)' },
    { cap: 'procurement.finance', ar: 'اعتماد الميزانية للمشتريات (المالية)', en: 'Budget approval for procurement (Finance)' },
    { cap: 'procurement.legal', ar: 'مراجعة قانونية للعقود', en: 'Legal contract review' },
    { cap: 'procurement.committee', ar: 'لجنة تقييم العروض', en: 'Bid evaluation committee' },
    { cap: 'finance.budget', ar: 'إدارة اعتمادات الميزانية', en: 'Manage budget allocations' },
  ],
  domains: [
    { key: 'procurement.requests', name_ar: 'طلبات الشراء والاعتمادات', name_en: 'Purchase requests and approvals', classification: 'internal', ai: 'allowed' },
    { key: 'procurement.bids', name_ar: 'العروض المالية والفنية', name_en: 'Financial and technical bids', classification: 'restricted', ai: 'off', locked: true, note_ar: 'مختومة حتى موعد الفتح؛ التحليل الذكي داخل النظام بأسماء مقنّعة', note_en: 'Sealed until opening; in-system AI analysis uses masked bidder names' },
  ],
  schema,
  seed,
  routes,
  tools,
  intents,
  agent: {
    name_ar: 'مساعد المشتريات', name_en: 'Procurement assistant',
    description_ar: 'إنشاء مسودات طلبات الشراء ومتابعة حالتها والاعتمادات المنتظرة — دون الوصول إلى العروض المختومة',
    description_en: 'Draft purchase requests, follow their status and pending approvals — never the sealed bids',
    instructions: 'ينشئ مسودات طلبات الشراء فقط ولا يخمّن الكميات أو الأسعار (يسأل المستخدم). لا يعتمد ولا يرفض نيابة عن أحد. لا يصل إلى العروض أو التقييمات (نطاق مقفل).',
  },
  workspace,
});

export { THRESHOLD };
