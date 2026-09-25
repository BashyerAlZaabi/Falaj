// Conflicts & Gifts — الإفصاح عن تضارب المصالح واستقبال الهدايا.
// Annual declarations (draft → submitted → under review → cleared | mitigation → closed),
// ad-hoc disclosures, the gifts & hospitality register with a transparent policy
// engine, mitigation instructions for line managers (minimal text only), and
// aggregated compliance for the compliance officer and the president.
//
// Data domain `integrity.disclosures` is RESTRICTED and locked off for Ask AI/MCP:
// this system deliberately exposes NO tools; its intents only explain the
// policy and point to the screens, without reading any record.
//
// Procurement contract (server-side): declaredConflicts(userId), recusalsFor(userId).
import { defineSystem } from './registry.js';
import { isStaff, wrap, check, S, str, num, int, bool, arr, date, today, daysBetween, all, one } from './kit.js';
import { KEY, schema, INTEREST_KINDS, MITIGATION_KINDS, DECISIONS, MITIGATION_LABEL, DECISION_LABEL, PROMPT_DAYS, GIFT_POINTS_PER_YEAR, propose, tokenLimit } from './integrity/model.js';
import { seed } from './integrity/seed.js';
import * as Svc from './integrity/service.js';

export const declaredConflicts = (userId) => Svc.declaredConflicts(userId);
export const recusalsFor = (userId) => Svc.recusalsFor(userId);

// ---------------- request schemas ----------------
const providerId = str('provider organisation id', { maxLength: 60 });
const INTEREST = S({ kind: str('interest kind', { enum: INTEREST_KINDS }), party_name: str('party', { minLength: 2, maxLength: 200 }), provider_id: providerId, details: str('details', { maxLength: 1000 }) }, ['kind', 'party_name']);
const DRAFT = S({ no_conflict: bool('no conflict to declare'), statement: str('statement', { maxLength: 2000 }), interests: arr(INTEREST, { maxItems: 20 }) });
const SUBMIT = S({ attest: bool('attestation') }, ['attest']);
const RETURN = S({ note: str('what needs clarification', { minLength: 5, maxLength: 1000 }) }, ['note']);
const MITIGATION = S({ kind: str('mitigation kind', { enum: MITIGATION_KINDS }), matter: str('matter', { minLength: 3, maxLength: 200 }), provider_id: providerId, instruction: str('instruction for the manager', { minLength: 5, maxLength: 240 }), notify_manager: bool('notify the line manager') }, ['kind', 'matter', 'instruction']);
const DECIDE = S({ outcome: str('outcome', { enum: ['cleared', 'mitigation'] }), note: str('note', { maxLength: 1000 }), mitigations: arr(MITIGATION, { maxItems: 10 }) }, ['outcome']);
const NOTE = S({ note: str('note', { maxLength: 1000 }) });
const DISCLOSURE = S({ matter: str('matter', { minLength: 5, maxLength: 300 }), related_party: str('related party', { minLength: 2, maxLength: 200 }), provider_id: providerId, relationship: str('relationship', { maxLength: 1000 }), proposed_recusal: str('proposed recusal', { maxLength: 1000 }) }, ['matter', 'related_party']);
const GIFT = S({
  giver_name: str('giver', { minLength: 2, maxLength: 200 }), giver_type: str('giver type', { enum: ['organisation', 'person'] }), provider_id: providerId,
  description: str('description', { minLength: 2, maxLength: 500 }), kind: str('kind', { enum: ['gift', 'hospitality'] }),
  value_aed: num('estimated value AED', { minimum: 0, maximum: 10000000 }), occasion: str('occasion', { maxLength: 200 }), received_on: date('received/offered on'),
  offered_only: bool('offered but not received'), cash: bool('cash or equivalent'), active_tender: bool('giver has an active tender'),
}, ['giver_name', 'description', 'value_aed', 'received_on']);
const GIFT_DECIDE = S({ decision: str('decision', { enum: DECISIONS }), note: str('note', { maxLength: 1000 }) }, ['decision']);
const POLICY_CHECK = S({ value_aed: num('value', { minimum: 0, maximum: 10000000 }), cash: bool(''), active_tender: bool(''), kind: str('kind', { enum: ['gift', 'hospitality'] }), provider_id: providerId }, ['value_aed']);
const LIFT = S({ confirm: bool('explicit confirmation'), note: str('reason', { maxLength: 500 }) });
const CYCLE = S({ year: int('year', { minimum: 2020, maximum: 2100 }), due_on: date('due date'), opens_on: date('opens on') }, ['year', 'due_on']);
const CONFIRM = S({ confirm: bool('explicit confirmation') });
const QUERY = S({ type: str('type', { enum: ['all', 'declaration', 'disclosure', 'gift'] }), q: str('search', { maxLength: 100 }) });

function routes(r) {
  const b = (req, schemaDef) => check(schemaDef, req.body);
  r.get('/overview', wrap((req) => Svc.overview(req.user)));
  r.get('/policy', wrap(() => Svc.policy()));
  r.post('/policy/check', wrap((req) => Svc.checkPolicy(b(req, POLICY_CHECK))));

  // annual declaration (discloser) + review (officer)
  r.put('/declarations/current', wrap((req) => Svc.saveDraft(req.user, b(req, DRAFT))));
  r.get('/declarations/:id', wrap((req) => Svc.getRecord(req.user, 'declaration', req.params.id)));
  r.post('/declarations/:id/submit', wrap((req) => Svc.submitDeclaration(req.user, req.params.id, b(req, SUBMIT))));
  r.post('/declarations/:id/start', wrap((req) => Svc.startReview(req.user, 'declaration', req.params.id)));
  r.post('/declarations/:id/return', wrap((req) => Svc.returnDeclaration(req.user, req.params.id, b(req, RETURN))));
  r.post('/declarations/:id/decide', wrap((req) => Svc.decideCase(req.user, 'declaration', req.params.id, b(req, DECIDE))));
  r.post('/declarations/:id/close', wrap((req) => Svc.closeCase(req.user, 'declaration', req.params.id, b(req, NOTE))));

  // ad-hoc disclosures
  r.post('/disclosures', wrap((req) => Svc.createDisclosure(req.user, b(req, DISCLOSURE))));
  r.get('/disclosures/:id', wrap((req) => Svc.getRecord(req.user, 'disclosure', req.params.id)));
  r.post('/disclosures/:id/start', wrap((req) => Svc.startReview(req.user, 'disclosure', req.params.id)));
  r.post('/disclosures/:id/decide', wrap((req) => Svc.decideCase(req.user, 'disclosure', req.params.id, b(req, DECIDE))));
  r.post('/disclosures/:id/close', wrap((req) => Svc.closeCase(req.user, 'disclosure', req.params.id, b(req, NOTE))));

  // gifts & hospitality
  r.post('/gifts', wrap((req) => Svc.declareGift(req.user, b(req, GIFT))));
  r.get('/gifts/:id', wrap((req) => Svc.getRecord(req.user, 'gift', req.params.id)));
  r.post('/gifts/:id/decide', wrap((req) => Svc.decideGift(req.user, req.params.id, b(req, GIFT_DECIDE))));
  r.post('/gifts/:id/complete', wrap((req) => Svc.completeGift(req.user, req.params.id, b(req, NOTE))));

  // officer queue, mitigations, managers' instructions, aggregates, cycles
  r.get('/review', wrap((req) => Svc.queue(req.user, check(QUERY, { type: req.query.type || undefined, q: req.query.q || undefined }))));
  r.post('/mitigations/:id/lift', wrap((req) => Svc.liftMitigation(req.user, req.params.id, b(req, LIFT))));
  r.get('/instructions', wrap((req) => Svc.instructions(req.user)));
  r.post('/mitigations/:id/acknowledge', wrap((req) => Svc.acknowledge(req.user, req.params.id)));
  r.get('/reports', wrap((req) => Svc.reports(req.user)));
  r.post('/cycles', wrap((req) => Svc.createCycle(req.user, b(req, CYCLE))));
  r.post('/cycles/:id/close', wrap((req) => Svc.closeCycle(req.user, req.params.id, b(req, CONFIRM))));
  r.post('/cycles/:id/remind', wrap((req) => Svc.remindPending(req.user, req.params.id)));
}

// ---------------- Ask AI: explanation only (the data domain is locked off) ----------------
const EXCLUDE = /(^|\s)(اضف|انشي|انشئ|اكتب|جهز|حدث|ابحث|احذف|لخص|صغ|add|create|write|search|delete)(\s|$)|مهمه|مهام|موعد|اجتماع|مشروع|داشبورد|تقرير|خطه|محضر|خطاب|بطاقه (?!هد)|\b(task|meeting|project|report|dashboard)\b/;
const GIFT_WORDS = /(هديه|هدايا|الهديه|ضيافه|\bgifts?\b|hospitality)/;
const DECL_WORDS = /(اقرار|افصاح|تضارب|conflict of interest|declaration|disclos)/;
const PROCUREMENT_WORDS = /(مناقص|طلب عروض|طلب شراء|لجنه التقييم|\brfq\b|tender|purchase)/;
const LINK_GIFTS = '#/sys/integrity/gifts';
const LINK_MINE = '#/sys/integrity/mine';

function giftAnswer(clause, n) {
  const en = /^[\x00-\x7F]+$/.test(clause);
  const limit = tokenLimit();
  const m = n.replace(/[,٬]/g, '').match(/(\d+(?:\.\d+)?)\s*(الف)?/);
  const value = m ? Number(m[1]) * (m[2] ? 1000 : 1) : null;
  const cash = /(نقد|كاش|مبلغ مالي|بطاقه هدايا|بطاقه هديه|بطاقه شراء|قسيمه|قسائم|\bcash\b|voucher|gift ?card)/.test(n);
  const tender = /(مناقص|عطاء|طلب عروض|tender|\brfq\b|\bbid)/.test(n);
  const provider = /(مورد|مقدم خدمه|مقدمي الخدمات|supplier|vendor|provider)/.test(n);
  const kind = /(ضيافه|عشاء|غداء|دعوه|hospitality|dinner|lunch)/.test(n) ? 'hospitality' : 'gift';
  const privacy = en
    ? `I cannot read or file declarations for you — they are restricted data. Declare it yourself within ${PROMPT_DAYS} days from Conflicts & Gifts → Gift register (${LINK_GIFTS}).`
    : `لا أستطيع قراءة إفصاحاتك أو تسجيلها نيابة عنك لأنها بيانات سرية للغاية. أفصح عنها بنفسك خلال ${PROMPT_DAYS} أيام من «الإفصاح والهدايا ← سجل الهدايا» (${LINK_GIFTS}).`;
  if (value != null || cash || tender) {
    const p = propose({ value_aed: value ?? 0, cash, active_tender: tender, kind });
    const d = DECISION_LABEL[p.decision];
    const head = en ? `**Per the gift policy** (general guidance, no record was read): **${d[1]}** — ${p.reason_en}` : `**بحسب سياسة الهدايا** (إرشاد عام دون الاطلاع على أي سجل): **${d[0]}** — ${p.reason_ar}`;
    const extra = provider && !tender ? (en ? '\nIf the provider has an active tender or RFQ, the gift is always declined.' : '\nإن كان لدى مقدّم الخدمة مناقصة أو طلب عروض قائم فيُعتذر عن الهدية دائماً.') : '';
    const final = en ? '\nThe compliance officer records the final decision.' : '\nيعتمد ضابط الامتثال القرار النهائي.';
    return `${head}${extra}${final}\n\n${privacy}`;
  }
  const rules = en
    ? [`**Gifts & hospitality policy** (general guidance):`, `• Token gifts up to AED ${limit}: may be kept once declared.`, `• Above AED ${limit}: handed over to the entity or declined and returned.`, '• Providers with an active tender: always declined.', '• Cash, gift cards and vouchers: never accepted.']
    : ['**سياسة الهدايا والضيافة** (إرشاد عام):', `• الهدايا الرمزية حتى ${limit} درهم: يجوز الاحتفاظ بها بعد الإفصاح.`, `• ما يتجاوز ${limit} درهم: تُسلَّم للجهة أو يُعتذر عنها وتُعاد.`, '• مقدّم خدمة لديه مناقصة قائمة: يُعتذر دائماً مهما كانت القيمة.', '• النقد وبطاقات الهدايا والقسائم: لا تُقبل مطلقاً.'];
  return `${rules.join('\n')}\n\n${privacy}`;
}
function declarationAnswer(clause) {
  const en = /^[\x00-\x7F]+$/.test(clause);
  const c = Svc.currentCycle();
  const left = c ? daysBetween(today(), c.due_on) : null;
  const when = !c ? '' : c.status !== 'open' ? (en ? ` — the ${c.year} cycle is closed.` : ` — دورة ${c.year} مغلقة حالياً.`)
    : en ? ` ${c.year} — due on ${c.due_on}${left >= 0 ? ` (${left} days left)` : ''}.` : ` ${c.year} — الموعد النهائي ${c.due_on}${left >= 0 ? ` (متبقٍ ${left} يوماً)` : ''}.`;
  return en
    ? `**Annual conflict-of-interest declaration**${when} Complete it yourself from Conflicts & Gifts → My disclosures (${LINK_MINE}): choose “no conflict” or list your interests (financial, relatives in the entity, outside roles, relationships with providers), then attest and submit. Situations that arise during the year go in an ad-hoc disclosure on the same page.\n\nDisclosure protects you. Only the compliance officer reviews it and every view is logged — which is why Ask AI cannot read or fill in disclosures.`
    : `**الإقرار السنوي لتضارب المصالح**${when} أكمله بنفسك من «الإفصاح والهدايا ← إفصاحاتي» (${LINK_MINE}): اختر «لا يوجد تضارب» أو أضف مصالحك (مالية، أقارب يعملون في الجهة، عمل خارجي أو عضوية مجالس، علاقة بمقدّم خدمة)، ثم أقرّ وقدّم. وأي موقف يطرأ خلال العام تُفصح عنه بـ«إفصاح طارئ» من الصفحة نفسها.\n\nالإفصاح يحميك. لا يطّلع عليه إلا ضابط الامتثال وكل اطلاع مسجّل — لذلك لا يستطيع المساعد قراءة الإفصاحات أو تعبئتها.`;
}

// ---------------- Home workspace cards ----------------
const KIND_AR = MITIGATION_LABEL;
const KIND_EN = { recusal: 'Recusal', divestment: 'Divestment', reassignment: 'Reassignment', other: 'Other action' };
function workspace(user) {
  const cards = []; let first = null;
  const c = Svc.currentCycle();
  if (c) {
    const d = one('SELECT id,status FROM integrity_declarations WHERE cycle_id=? AND user_id=?', c.id, user.id);
    const left = daysBetween(today(), c.due_on);
    const mine = all("SELECT kind FROM integrity_mitigations WHERE user_id=? AND status='active'", user.id);
    const giftsToDo = one("SELECT COUNT(*) n FROM integrity_gifts WHERE user_id=? AND status='decided'", user.id).n;
    const items = [
      ...mine.slice(0, 2).map((m) => ({ title: `تعليمات سارية: ${KIND_AR[m.kind]}`, meta_ar: 'التزم بها', meta_en: 'In force', href: '#/sys/integrity/mine' })),
      ...(giftsToDo ? [{ title: giftsToDo === 1 ? 'هدية بانتظار تأكيد تنفيذ القرار' : `${giftsToDo} هدايا بانتظار تأكيد تنفيذ القرار`, meta_ar: 'سجل الهدايا', meta_en: 'Gift register', href: '#/sys/integrity/gifts' }] : []),
    ];
    const todo = c.status === 'open' && (!d || d.status === 'draft');
    const card = todo
      ? { title_ar: `إقرارك السنوي ${c.year}`, title_en: `Your ${c.year} declaration`, value: Math.max(0, left), unit_ar: left < 0 ? 'متأخر' : 'يوماً متبقياً', unit_en: left < 0 ? 'overdue' : 'days left',
        tone: left < 0 || left <= 7 ? 'crit' : 'warn', hint_ar: d ? 'مسودتك محفوظة — أكملها وقدّمها. الإفصاح يحميك.' : 'لم تبدأ بعد — يستغرق دقيقتين. الإفصاح يحميك.', hint_en: d ? 'Your draft is saved — finish and submit it.' : 'Not started — it takes two minutes.',
        href: '#/sys/integrity/mine', items, cta: { label_ar: d ? 'أكمل الإقرار' : 'ابدأ الإقرار', label_en: d ? 'Continue' : 'Start declaration', href: '#/sys/integrity/mine/declare' } }
      : d ? { title_ar: `إقرارك السنوي ${c.year}`, title_en: `Your ${c.year} declaration`,
        value: { submitted: 'مُقدَّم', under_review: 'قيد المراجعة', cleared: 'مُعتمد', mitigation: 'مع تعليمات', closed: 'مغلق' }[d.status] || '—', tone: d.status === 'cleared' || d.status === 'closed' ? 'good' : d.status === 'mitigation' ? 'emph' : null,
        hint_ar: d.status === 'mitigation' ? 'اعتُمد إقرارك مع تعليمات يلزم الالتزام بها.' : 'لا مطلوب منك الآن. شكراً لشفافيتك.', hint_en: d.status === 'mitigation' ? 'Approved with instructions you must follow.' : 'Nothing needed from you now. Thank you.',
        href: '#/sys/integrity/mine', items, cta: { label_ar: 'إفصاحاتي', label_en: 'My disclosures', href: '#/sys/integrity/mine' } } : null;
    if (card && todo) first = card; else if (card && (items.length || d)) cards.push(card);
  }
  if (Svc.isOfficer(user)) {
    const q = Svc.queueCounts(user);
    const pending = q.new + q.review;
    const recent = all(`SELECT 'declaration' t, x.id, x.submitted_at at, d.name_ar dar, d.name_en den FROM integrity_declarations x JOIN users u ON u.id=x.user_id JOIN departments d ON d.id=u.department_id WHERE x.status IN ('submitted','under_review') AND x.user_id<>?
      UNION ALL SELECT 'disclosure', x.id, x.submitted_at, d.name_ar, d.name_en FROM integrity_disclosures x JOIN users u ON u.id=x.user_id JOIN departments d ON d.id=u.department_id WHERE x.status IN ('submitted','under_review') AND x.user_id<>?
      UNION ALL SELECT 'gift', x.id, x.created_at, d.name_ar, d.name_en FROM integrity_gifts x JOIN users u ON u.id=x.user_id JOIN departments d ON d.id=u.department_id WHERE x.status='declared' AND x.user_id<>?
      ORDER BY at LIMIT 3`, user.id, user.id, user.id);
    const T = { declaration: ['إقرار سنوي', 'Annual declaration'], disclosure: ['إفصاح طارئ', 'Ad-hoc disclosure'], gift: ['إفصاح عن هدية', 'Gift declaration'] };
    if (pending) cards.unshift({
      title_ar: 'إفصاحات بانتظار المراجعة', title_en: 'Disclosures awaiting review', value: pending, unit_ar: 'حالة', unit_en: 'cases', tone: 'warn',
      hint_ar: `${q.gifts ? `منها ${q.gifts} هدايا بانتظار القرار · ` : ''}كل اطلاع مسجّل`, hint_en: `${q.gifts ? `${q.gifts} gifts awaiting a decision · ` : ''}every view is logged`,
      href: '#/sys/integrity/review', items: recent.map((r) => ({ title: `${T[r.t][0]} · ${r.dar}`, meta_ar: String(r.at).slice(0, 10), meta_en: String(r.at).slice(0, 10), href: `#/sys/integrity/review/${r.t}:${r.id}` })),
      cta: { label_ar: 'افتح المراجعة', label_en: 'Open review', href: '#/sys/integrity/review' },
    });
  }
  const ins = Svc.instructionSummary(user);
  if (ins.length) {
    const unack = ins.filter((i) => !i.acknowledged_at).length;
    cards.push({
      title_ar: 'تعليمات امتثال لفريقك', title_en: 'Compliance instructions for your team', value: ins.length, unit_ar: 'سارية', unit_en: 'in force', tone: unack ? 'emph' : null,
      hint_ar: unack ? `${unack} بانتظار تأكيد تطبيقك — دون تفاصيل الإفصاح` : 'طبّقها عند توزيع المهام', hint_en: unack ? `${unack} awaiting your acknowledgement` : 'Apply them when assigning work',
      href: '#/sys/integrity/instructions', items: ins.slice(0, 3).map((i) => ({ title: i.name_ar, meta_ar: i.acknowledged_at ? KIND_AR[i.kind] : 'بانتظار تأكيدك', meta_en: i.acknowledged_at ? KIND_EN[i.kind] : 'Awaiting you', href: '#/sys/integrity/instructions' })),
      cta: { label_ar: 'عرض التعليمات', label_en: 'View instructions', href: '#/sys/integrity/instructions' },
    });
  }
  return (first ? [first, ...cards] : cards).slice(0, 3);
}

// ---------------- excellence points (derived from real records) ----------------
function gameEvents(userId) {
  const out = [];
  for (const d of all(`SELECT d.id, d.submitted_at, c.due_on, c.year FROM integrity_declarations d JOIN integrity_cycles c ON c.id=d.cycle_id
    WHERE d.user_id=? AND d.status<>'draft' AND d.submitted_at IS NOT NULL`, userId)) {
    if (d.submitted_at.slice(0, 10) <= d.due_on) out.push({ kind: 'integrity_declaration', points: 10, at: d.submitted_at, ref: `الإقرار السنوي ${d.year}`, id: `integrity:decl:${d.id}` });
  }
  // Timely gift declarations count once the officer has decided (no points for unverified entries),
  // capped per year so volume can't be farmed.
  const perYear = {};
  for (const g of all("SELECT id, received_on, created_at FROM integrity_gifts WHERE user_id=? AND status IN ('decided','completed') ORDER BY created_at", userId)) {
    const y = g.received_on.slice(0, 4);
    if (daysBetween(g.received_on, g.created_at) > PROMPT_DAYS || (perYear[y] || 0) >= GIFT_POINTS_PER_YEAR) continue;
    perYear[y] = (perYear[y] || 0) + 1;
    out.push({ kind: 'integrity_gift', points: 5, at: g.created_at, ref: 'إفصاح في الوقت عن هدية', id: `integrity:gift:${g.id}` });
  }
  return out;
}

defineSystem({
  key: 'integrity',
  name_ar: 'الإفصاح والهدايا', name_en: 'Conflicts & Gifts',
  description_ar: 'الإفصاح عن تضارب المصالح وسجل الهدايا والضيافة ومراجعة الامتثال',
  description_en: 'Conflict-of-interest disclosures, gifts & hospitality register, compliance review',
  icon: 'scale', category: 'governance',
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: 'integrity.officer', ar: 'مراجعة الإفصاحات والهدايا (ضابط الامتثال)', en: 'Review disclosures and gifts (compliance officer)' },
  ],
  domains: [
    { key: 'integrity.disclosures', name_ar: 'إفصاحات تضارب المصالح وسجل الهدايا', name_en: 'Conflict disclosures and gift register', classification: 'restricted', ai: 'off', locked: true, note_ar: 'لا يطّلع عليها إلا مقدّمها وضابط الامتثال؛ كل اطلاع يُسجَّل', note_en: 'Only the discloser and the compliance officer; every view is logged' },
  ],
  schema,
  seed,
  routes,
  tools: [], // deliberately none: the domain is restricted and locked off for Ask AI / MCP
  intents: [
    { test: (n) => GIFT_WORDS.test(n) && !EXCLUDE.test(n), plan: (user, clause, ctx, { norm }) => [{ say: giftAnswer(clause, norm(clause)) }] },
    { test: (n) => DECL_WORDS.test(n) && !EXCLUDE.test(n) && !PROCUREMENT_WORDS.test(n), plan: (user, clause) => [{ say: declarationAnswer(clause) }] },
  ],
  workspace,
  gameRules: [
    { key: 'integrity_declaration', points: 10, ar: 'تقديم الإقرار السنوي لتضارب المصالح قبل الموعد النهائي', en: 'Annual conflict-of-interest declaration submitted before the deadline' },
    { key: 'integrity_gift', points: 5, ar: `الإفصاح عن هدية أو ضيافة خلال ${PROMPT_DAYS} أيام من استلامها (بعد اعتماد القرار)`, en: `Gift or hospitality declared within ${PROMPT_DAYS} days of receipt (once decided)` },
  ],
  gameEvents,
});

