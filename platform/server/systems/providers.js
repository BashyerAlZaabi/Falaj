// Service Providers — منصة مقدمي الخدمات.
// Registry (status workflow, document metadata with expiry tracking, eligibility),
// contracts and per-contract performance evaluations, and a private vendor portal.
// Services: ./providers/service.js · demo seed: ./providers/seed.js.
import { defineSystem } from './registry.js';
import { isStaff, hasCap, wrap, check, S, str, int, bool, date, arr, requireConfirm, Forbidden } from './kit.js';
import * as P from './providers/service.js';
import { seed } from './providers/seed.js';

// Used by procurement (sourcing, shortlist, award → contract).
export const eligibleProviders = (category) => P.eligibleProviders(category);
export const providerOfUser = (userId) => P.providerOfUser(userId);
export { providerEligibility, providerBrief, providerUserIds, createContract, shortlist, CATEGORIES } from './providers/service.js';

const CAT = Object.keys(P.CATEGORIES);
const KINDS = Object.keys(P.DOC_KINDS);
const LIST_Q = S({ status: str('', { enum: Object.keys(P.STATUS) }), category: str('', { enum: CAT }), q: str('', { maxLength: 80 }) });
const CREATE = S({
  name_ar: str('اسم الشركة بالعربية', { maxLength: 160, minLength: 3 }), name_en: str('', { maxLength: 160 }),
  category: str('', { enum: CAT }), categories: arr(str('', { enum: CAT }), { maxItems: 4 }),
  licence_no: str('', { maxLength: 60, minLength: 3 }), licence_expiry: date(),
  contact_name: str('', { maxLength: 120 }), contact_email: str('', { maxLength: 160 }), contact_phone: str('', { maxLength: 40 }),
}, ['name_ar', 'category', 'licence_no', 'licence_expiry']);
const UPDATE = S({
  name_ar: str('', { maxLength: 160, minLength: 3 }), name_en: str('', { maxLength: 160 }), category: str('', { enum: CAT }), categories: arr(str('', { enum: CAT }), { maxItems: 4 }),
  contact_name: str('', { maxLength: 120 }), contact_email: str('', { maxLength: 160 }), contact_phone: str('', { maxLength: 40 }),
});
const STATUS_B = S({ to: str('', { enum: Object.keys(P.STATUS) }), reason: str('', { maxLength: 500 }), confirm: bool() }, ['to']);
const DOC_B = S({ ref_no: str('', { maxLength: 60 }), issued_on: date(), expires_on: date() }, ['expires_on']);
const VERIFY_B = S({ decision: str('', { enum: ['accept', 'reject'] }), note: str('', { maxLength: 300 }) }, ['decision']);
const EVAL_B = S({ quality: int('', { minimum: 1, maximum: 5 }), timeliness: int('', { minimum: 1, maximum: 5 }), compliance: int('', { minimum: 1, maximum: 5 }), comment: str('', { maxLength: 1000 }) }, ['quality', 'timeliness', 'compliance']);
const CONTACT_B = S({ contact_name: str('', { maxLength: 120 }), contact_email: str('', { maxLength: 160 }), contact_phone: str('', { maxLength: 40 }) });
const CONTRACTS_Q = S({ mine: str('', { enum: ['1', '0'] }), needs_evaluation: str('', { enum: ['1', '0'] }) });

function routes(r) {
  r.get('/me', wrap((req) => P.me(req.user)));
  r.get('/providers', wrap((req) => P.listProviders(req.user, check(LIST_Q, { ...req.query }))));
  r.post('/providers', wrap((req) => P.createProvider(req.user, check(CREATE, req.body))));
  r.get('/providers/:id', wrap((req) => P.getProvider(req.user, req.params.id)));
  r.put('/providers/:id', wrap((req) => P.updateProvider(req.user, req.params.id, check(UPDATE, req.body))));
  r.post('/providers/:id/status', wrap((req) => {
    const b = check(STATUS_B, req.body);
    return P.setStatus(req.user, req.params.id, b, { confirm: () => requireConfirm(b, 'تعليق المورد أو حظره أو إعادة تفعيله يتطلب تأكيداً صريحاً') });
  }));
  r.put('/providers/:id/documents/:kind', wrap((req) => P.setDocument(req.user, req.params.id, req.params.kind, check(DOC_B, req.body))));
  r.post('/providers/:id/documents/:kind/verify', wrap((req) => P.verifyRenewal(req.user, req.params.id, req.params.kind, check(VERIFY_B, req.body))));
  r.get('/documents', wrap((req) => P.documentsAttention(req.user)));
  r.get('/contracts', wrap((req) => { const q = check(CONTRACTS_Q, { ...req.query }); return P.listContracts(req.user, { mine: q.mine === '1', needs_evaluation: q.needs_evaluation === '1' }); }));
  r.get('/contracts/:id', wrap((req) => P.getContract(req.user, req.params.id)));
  r.post('/contracts/:id/evaluations', wrap((req) => P.evaluateContract(req.user, req.params.id, check(EVAL_B, req.body))));
  // vendor portal (external identities, own company only)
  r.get('/portal', wrap((req) => P.portal(req.user)));
  r.put('/portal/contact', wrap((req) => P.portalContact(req.user, check(CONTACT_B, req.body))));
  r.put('/portal/documents/:kind', wrap((req) => P.portalRenewal(req.user, req.params.kind, check(DOC_B, req.body))));
}

const catName = (k) => P.CATEGORIES[k]?.[0] || k;
const tools = [
  {
    name: 'providers_find', domain: 'providers.registry',
    description: 'Search the service-provider registry within the user scope (name, category, status, eligibility for sourcing: approved with valid licence, VAT and insurance).',
    input_schema: S({ q: str('name contains', { maxLength: 80 }), category: str('it|supplies|consulting|facilities', { enum: CAT }), status: str('', { enum: Object.keys(P.STATUS) }), eligible_only: bool('only providers eligible for sourcing') }),
    handler: (user, i) => {
      if (!isStaff(user)) throw new Forbidden('متاح لموظفي الجهة فقط');
      const rows = P.listProviders(user, { q: i.q, category: i.category, status: i.status }).filter((p) => !i.eligible_only || p.eligible);
      return { result: rows.map((p) => ({ id: p.id, name_ar: p.name_ar, name_en: p.name_en, category: p.category, status: p.status, eligible: p.eligible, reasons: p.reasons.map((x) => x.ar), rating: p.rating })) };
    },
    format: (res) => (res.length ? `${res.length === 1 ? 'مورد واحد' : `${res.length} موردين`}:\n${res.slice(0, 8).map((p) => `• ${p.name_ar} — ${catName(p.category)} — ${p.eligible ? 'مؤهل' : `غير مؤهل (${p.reasons.join('، ')})`}${p.rating != null ? ` — التقييم ${p.rating}/5` : ''}`).join('\n')}` : 'لا يوجد موردون مطابقون ضمن صلاحياتك.'),
  },
  {
    name: 'providers_expiring_documents', domain: 'providers.registry',
    description: 'Provider documents (licence, VAT, insurance) that are expired, expiring within 30 days, or renewals awaiting verification. Registry managers only.',
    input_schema: S({}),
    handler: (user) => ({ result: P.documentsAttention(user).map((d) => ({ provider: d.provider_ar, document: d.name_ar, state: d.state, expires_on: d.expires_on, pending: !!d.pending })) }),
    format: (res) => (res.length ? `وثائق تحتاج متابعة (${res.length}):\n${res.slice(0, 8).map((d) => `• ${d.provider} — ${d.document}: ${d.pending ? 'تحديث بانتظار التحقق' : d.state === 'expired' ? `منتهية منذ ${d.expires_on}` : d.state === 'missing' ? 'غير مسجّلة' : `تنتهي ${d.expires_on}`}`).join('\n')}` : 'لا توجد وثائق منتهية أو قريبة الانتهاء.'),
  },
  {
    name: 'providers_contracts_to_evaluate', domain: 'providers.registry',
    description: 'Contracts owned by the user whose supplier performance has not been evaluated this quarter.',
    input_schema: S({}),
    handler: (user) => ({ result: P.listContracts(user, { needs_evaluation: true }).map((c) => ({ id: c.id, number: c.number, title: c.title, provider: c.provider?.name_ar, period: c.period })) }),
    format: (res) => (res.length ? `عقود بانتظار تقييم أدائها:\n${res.map((c) => `• ${c.number} — ${c.provider}: ${c.title}`).join('\n')}\nافتح «منصة مقدمي الخدمات ← العقود» لتسجيل التقييم.` : 'لا توجد عقود بانتظار تقييمك هذا الربع.'),
  },
];

const intents = [
  {
    test: (n) => /(الموردين|الموردون|موردين|مقدمي الخدمات|الشركات) (المؤهلين|المؤهلون|المؤهله|مؤهلين)/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const category = /(تقنيه|تقني|it\b)/.test(n) ? 'it' : /(توريد|توريدات|مستلزمات)/.test(n) ? 'supplies' : /(استشار)/.test(n) ? 'consulting' : /(مرافق|صيانه)/.test(n) ? 'facilities' : undefined;
      return [{ tool: 'providers_find', input: { eligible_only: true, ...(category ? { category } : {}) }, label: 'الموردون المؤهلون' }];
    },
  },
  {
    test: (n) => /وثائق/.test(n) && /(الموردين|موردين|مقدمي الخدمات)/.test(n) && /(منتهي|تنتهي|انتهاء|تجديد)/.test(n),
    plan: () => [{ tool: 'providers_expiring_documents', input: {}, label: 'وثائق الموردين المنتهية والقريبة الانتهاء' }],
  },
  {
    test: (n) => /تقييم/.test(n) && /(الموردين|المورد|موردين)/.test(n) && /(عقود|العقود|بانتظار)/.test(n),
    plan: () => [{ tool: 'providers_contracts_to_evaluate', input: {}, label: 'عقود بانتظار تقييم الأداء' }],
  },
];

defineSystem({
  key: 'providers',
  name_ar: 'منصة مقدمي الخدمات', name_en: 'Service Providers',
  description_ar: 'سجل مقدمي الخدمات ووثائقهم وعقودهم وتقييم أدائهم، وبوابة خاصة لكل مورد',
  description_en: 'Provider registry, documents, contracts and performance evaluations, with a private portal per provider',
  icon: 'handshake', category: 'operations',
  external: true,
  access: (u) => (isStaff(u) && (hasCap(u, 'providers.manage', 'procurement.officer', 'procurement.finance', 'procurement.committee', 'procurement.legal') || u.role !== 'employee')) || hasCap(u, 'providers.portal'),
  defaultPinned: (u) => hasCap(u, 'providers.manage', 'providers.portal'),
  caps: [
    { cap: 'providers.manage', ar: 'إدارة سجل مقدمي الخدمات والعقود', en: 'Manage the provider registry and contracts' },
    { cap: 'providers.portal', ar: 'حساب مقدم خدمة (بوابة المورد فقط)', en: 'Service provider account (supplier portal only)', external: true },
  ],
  domains: [
    { key: 'providers.registry', name_ar: 'سجل مقدمي الخدمات والعقود والتقييمات', name_en: 'Provider registry, contracts and evaluations', classification: 'confidential', ai: 'opt_in' },
  ],
  schema: P.schema,
  seed,
  routes,
  tools,
  intents,
  agent: {
    name_ar: 'مساعد مقدمي الخدمات', name_en: 'Service providers assistant',
    description_ar: 'البحث في سجل الموردين المؤهلين، ومتابعة الوثائق المنتهية، والعقود بانتظار التقييم — ضمن صلاحياتك وبموافقتك',
    description_en: 'Find eligible providers, follow expiring documents and contracts awaiting review — within your scope and with your opt-in',
    instructions: 'يقرأ سجل الموردين ضمن نطاق المستخدم فقط. لا يغيّر حالة مورد ولا يعرض بيانات مورد لآخر. لا يخمّن تقييمات.',
  },
  workspace: (user) => P.workspace(user),
  gameRules: [{ key: 'provider_evaluation', points: 8, ar: 'تقييم أداء مورد عن عقد تملكه (مرة لكل عقد في كل ربع)', en: 'Review a supplier on a contract you own (once per contract per quarter)' }],
  gameEvents: (userId) => P.gameEvents(userId),
});
