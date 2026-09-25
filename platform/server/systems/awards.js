// Awards — نظام الجوائز.
// Programmes (cycle, categories, weighted criteria with descriptors, eligibility,
// nomination / evaluation windows, announcement), nominations with nominee
// consent, committee scoring with automatic recusal, admin finalisation and the
// public «قاعة التميّز». Nominations and scores are restricted (AI locked); only
// programmes and announced winners are public to staff.
// Service: ./awards/service.js · schema: ./awards/schema.js · demo seed: ./awards/seed.js
import { defineSystem } from './registry.js';
import * as K from './kit.js';
import * as A from './awards/service.js';
import { schema } from './awards/schema.js';
import { seed } from './awards/seed.js';

const { S, str, isStaff, hasCap } = K;
const DOMAIN_PUBLIC = 'awards.public';
const DOMAIN_EVAL = 'awards.evaluations';

// ---------------- Ask AI formatting (public data only) ----------------
const ELIG_AR = { employees: 'الموظفون', managers: 'القيادات', all_staff: 'جميع الموظفين', team: 'فرق العمل' };
const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);
function phaseText(p) {
  const ph = p.phase;
  if (p.status === 'nominations') {
    if (ph.window_open) return `باب الترشيح مفتوح حتى ${p.nomination_closes} (${ph.days_left === 0 ? 'يغلق اليوم' : `متبقٍ ${plural(ph.days_left, 'يوم واحد', 'يومان', 'أيام', 'يوماً')}`})`;
    return ph.not_yet_open ? `يفتح باب الترشيح في ${p.nomination_opens}` : 'انتهت مدة الترشيح';
  }
  if (p.status === 'evaluation') return `قيد التقييم — إعلان النتائج المتوقع ${p.announce_on}`;
  if (p.status === 'announced') return `أُعلنت النتائج (${plural(p.winners_count || 0, 'فائز واحد', 'فائزان', 'فائزين', 'فائزاً')})`;
  return A.P_STATUS[p.status];
}
const programFacts = (p) => `الفئات: ${p.categories.map((c) => c.name_ar).join('، ')}. الأهلية: ${ELIG_AR[p.eligibility]}${p.allow_self ? '، ويُقبل الترشيح الذاتي' : ''}.`;
const programLine = (p) => `– «${p.name_ar}»${p.cycle ? ` (${p.cycle})` : ''}: ${phaseText(p)}. ${programFacts(p)}`;
function winnerLine(w) {
  const who = w.team_name ? `${w.team_name} (${w.team.map((t) => t.name_ar).join('، ')})` : `${w.nominee.name_ar} — ${w.nominee.dept_ar}`;
  return `– ${w.program.name_ar}${w.program.cycle ? ` ${w.program.cycle}` : ''} · فئة «${w.category.name_ar}»: ${who}`;
}

// Public programme data only: admin aggregates and the user's own nomination facts
// (restricted awards.evaluations data) are removed before anything reaches Ask AI / MCP.
const publicProgram = ({ admin, my_nominations, my_nominees, ...rest }) => { void admin; void my_nominations; void my_nominees; return rest; };

const tools = [
  {
    name: 'awards_programs', domain: DOMAIN_PUBLIC,
    description: 'Award programmes visible to staff (never drafts): phase, nomination window and days left, categories, eligibility, criteria weights. status=open lists programmes accepting nominations right now.',
    input_schema: S({ status: str('open | evaluation | announced | all', { enum: ['open', 'evaluation', 'announced', 'all'] }), q: str('programme name filter', { maxLength: 80 }) }),
    handler: (user, input) => ({ result: A.listPrograms(user, { status: input.status || 'all', q: input.q, publicOnly: true }).map(publicProgram) }),
    format: (res, { step }) => {
      if (!res.length) return step?.input?.status === 'open' ? 'لا توجد حالياً برامج جوائز مفتوحة للترشيح. تابع «نظام الجوائز» لمواعيد الدورات القادمة.' : 'لا توجد برامج جوائز مطابقة.';
      const open = res.filter((p) => p.phase.window_open);
      return `${step?.input?.status === 'open' ? 'برامج الجوائز المفتوحة للترشيح الآن' : 'برامج الجوائز'}:\n${res.map(programLine).join('\n')}${open.length ? '\nللترشيح افتح «نظام الجوائز» ← «رشّح» (الترشيحات سرية ولا يطّلع عليها المساعد).' : ''}`;
    },
  },
  {
    name: 'awards_program', domain: DOMAIN_PUBLIC,
    description: 'One award programme (not a draft): categories, weighted criteria with level descriptors, eligibility and timeline. Pass id, or a (partial) name.',
    input_schema: S({ id: str('programme id'), name: str('programme name (partial)', { maxLength: 80 }) }),
    handler: (user, input) => {
      let id = input.id;
      if (!id) {
        const list = A.listPrograms(user, { status: 'all', q: input.name, publicOnly: true });
        if (!list.length) throw new K.NotFound('لم أجد برنامج جوائز بهذا الاسم');
        id = list[0].id;
      }
      const p = A.getProgram(user, id);
      if (p.status === 'draft') throw new K.NotFound();
      return { result: publicProgram(p) };
    },
    format: (p) => `«${p.name_ar}»${p.cycle ? ` — ${p.cycle}` : ''}: ${phaseText(p)}.\n${p.description_ar ? `${p.description_ar}\n` : ''}${programFacts(p)}\nمعايير التقييم (من 1 إلى 5):\n${p.criteria.map((c) => `– ${c.name_ar} (${c.weight}%)${c.descriptors?.find((d) => d.level === 5) ? `: المستوى المتميز «${c.descriptors.find((d) => d.level === 5).ar}»` : ''}`).join('\n')}`,
  },
  {
    name: 'awards_winners', domain: DOMAIN_PUBLIC,
    description: 'Announced award winners — public recognition only (name, department, programme, category, citation). Never scores or nomination content.',
    input_schema: S({ program_id: str('programme id'), q: str('programme / category name filter', { maxLength: 80 }) }),
    handler: (user, input) => ({ result: A.winnersList(user, input) }),
    format: (res) => (res.length ? `الفائزون المعلنون:\n${res.map(winnerLine).join('\n')}\nتفاصيل التكريم والشهادات في «قاعة التميّز».` : 'لم تُعلن نتائج جوائز بعد.'),
  },
  {
    // Restricted domain (AI locked): usable from the Portal UI only; Ask AI and MCP are always refused by the executor.
    name: 'awards_my_nominations', domain: DOMAIN_EVAL,
    description: "The user's own nominations (as nominator or nominee) and their status. Restricted: never available to Ask AI or MCP.",
    input_schema: S({}),
    handler: (user) => ({ result: A.myNominations(user) }),
    format: (r) => `لديك ${r.as_nominee.length + r.as_nominator.length} ترشيحات.`,
  },
];

// ---------------- rule-based planner intents ----------------
const AWARD = /(جايزه|جوايز|الجوايز|الجايزه|award)/;
const intents = [
  {
    // «جوائز مفتوحة للترشيح» · «ما الجوائز المتاحة للترشيح؟»
    test: (n) => AWARD.test(n) && /(مفتوح|متاح|للترشيح|باب الترشيح|open|nominat)/.test(n) && !/(فايز|فاز|winner)/.test(n) && !/(معايير|معيار|criteria)/.test(n),
    plan: () => [{ tool: 'awards_programs', input: { status: 'open' }, label: 'قراءة برامج الجوائز المفتوحة للترشيح' }],
  },
  {
    // «الفائزون» · «من فاز بجائزة الفريق المتميز؟»
    test: (n) => /(^|\s)(ال)?فايز(ون|ين)|قاعه التميز|award winners/.test(n) ||(/(^|\s)(من )?(فاز|فازت|فازوا)(\s|$)/.test(n) && AWARD.test(n)),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const hit = A.listPrograms(user, { status: 'announced', publicOnly: true }).find((p) => n.includes(norm(p.name_ar).replace(/^جايزه\s*/, '')));
      return [{ tool: 'awards_winners', input: hit ? { program_id: hit.id } : {}, label: hit ? `قراءة الفائزين في «${hit.name_ar}»` : 'قراءة الفائزين المعلنين' }];
    },
  },
  {
    // «ما معايير جائزة الابتكار؟»
    test: (n) => AWARD.test(n) && /(معايير|معيار|اوزان|فيات|شروط|criteria)/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const list = A.listPrograms(user, { status: 'all', publicOnly: true });
      const hit = list.find((p) => n.includes(norm(p.name_ar).replace(/^جايزه\s*/, '')));
      if (hit) return [{ tool: 'awards_program', input: { id: hit.id }, label: `قراءة معايير «${hit.name_ar}»` }];
      if (!list.length) return [{ say: 'لا توجد برامج جوائز منشورة حالياً.' }];
      return [{ ask: `أي برنامج تقصد؟ ${list.map((p) => `«${p.name_ar}»`).join(' أو ')}`, options: list.map((p) => p.name_ar) }];
    },
  },
  {
    // «رشّح سارة لجائزة الموظف المتميز» — nominations are restricted: guide to the system instead of acting.
    test: (n) => AWARD.test(n) && /(^|\s)(رشح|ارشح|رشحني|ترشيح)(\s|$)/.test(n),
    plan: () => [{ say: 'الترشيح للجوائز يتم من «نظام الجوائز» مباشرة لأن الترشيحات والتقييمات سرية ومقفلة أمام المساعد الذكي. افتح: نظام الجوائز ← «رشّح» — يرشدك المعالج خطوة بخطوة، ويُطلب من الزميل تأكيد موافقته.' }],
  },
];

// ---------------- Home workspace ----------------
function workspace(user) {
  if (!isStaff(user)) return [];
  const en = user.lang === 'en';
  const nm = (x) => (en && x.name_en ? x.name_en : x.name_ar);
  const cards = [];
  const mine = A.myNominations(user);
  const pend = [...mine.as_nominee, ...mine.as_nominator].filter((x) => x.can_consent);
  if (pend.length) {
    cards.push({
      title_ar: 'ترشيح بانتظار موافقتك', title_en: 'A nomination awaits your consent', value: pend.length, unit_ar: pend.length === 1 ? 'ترشيح' : 'ترشيحات', unit_en: pend.length === 1 ? 'nomination' : 'nominations', tone: 'emph',
      hint_ar: 'اطّلع على ما كُتب عنك وأكّد موافقتك قبل إغلاق باب الترشيح', hint_en: 'Review what was written about you and consent before nominations close',
      href: `#/sys/awards/mine/${pend[0].id}`,
      items: pend.slice(0, 3).map((x) => ({ title: nm(x.program), meta_ar: `يغلق ${x.program.nomination_closes}`, meta_en: `Closes ${x.program.nomination_closes}`, href: `#/sys/awards/mine/${x.id}` })),
      cta: { label_ar: 'راجع الترشيح', label_en: 'Review nomination', href: `#/sys/awards/mine/${pend[0].id}` },
    });
  }
  if (A.isMember(user)) {
    const q = A.committeeQueue(user);
    if (q.stats.pending) {
      const progs = q.programs.map((p) => ({ p, n: p.items.filter((x) => !x.recusal && !x.my_review).length })).filter((x) => x.n);
      const first = progs[0].p.items.find((x) => !x.recusal && !x.my_review);
      cards.push({
        title_ar: 'تقييمات بانتظارك في لجنة الجوائز', title_en: 'Awards committee reviews pending', value: q.stats.pending, unit_ar: 'ترشيح', unit_en: q.stats.pending === 1 ? 'nomination' : 'nominations', tone: 'warn',
        hint_ar: q.stats.recused ? `تنحٍّ تلقائي عن ${plural(q.stats.recused, 'ترشيح واحد', 'ترشيحين', 'ترشيحات', 'ترشيحاً')} لضمان الحياد` : 'تقييمك مستقل وسري ولا يطّلع عليه غيرك',
        hint_en: q.stats.recused ? `Automatically recused from ${q.stats.recused} to keep scoring impartial` : 'Your review is independent and confidential',
        href: '#/sys/awards/committee',
        items: progs.slice(0, 3).map((x) => ({ title: nm(x.p), meta_ar: `${plural(x.n, 'ترشيح واحد', 'ترشيحان', 'ترشيحات', 'ترشيحاً')} · حتى ${x.p.evaluation_closes}`, meta_en: `${x.n} to score · by ${x.p.evaluation_closes}`, href: '#/sys/awards/committee' })),
        cta: { label_ar: 'ابدأ التقييم', label_en: 'Start scoring', href: `#/sys/awards/committee/${first.id}` },
      });
    }
  }
  const open = A.listPrograms(user, { status: 'open' });
  if (open.length) {
    const soonest = [...open].sort((a, b) => a.nomination_closes.localeCompare(b.nomination_closes))[0];
    cards.push({
      title_ar: 'باب الترشيح مفتوح', title_en: 'Nominations are open', value: open.length, unit_ar: open.length === 1 ? 'برنامج' : 'برامج', unit_en: open.length === 1 ? 'programme' : 'programmes', tone: 'good',
      hint_ar: 'كرّم زميلاً تميّز في خدمته — الترشيح سري حتى إعلان النتائج', hint_en: 'Recognise a colleague — nominations stay confidential until results',
      href: '#/sys/awards/programs',
      items: open.slice(0, 3).map((p) => ({ title: nm(p), meta_ar: p.phase.days_left === 0 ? 'يغلق اليوم' : `يغلق خلال ${plural(p.phase.days_left, 'يوم واحد', 'يومين', 'أيام', 'يوماً')}`, meta_en: p.phase.days_left === 0 ? 'Closes today' : `Closes in ${p.phase.days_left} days`, href: `#/sys/awards/programs/${p.id}` })),
      cta: { label_ar: 'رشّح زميلاً', label_en: 'Nominate a colleague', href: `#/sys/awards/nominate/${soonest.id}` },
    });
  }
  return cards.slice(0, 3);
}

// ---------------- excellence points (derived) ----------------
const gameRules = [
  { key: 'awards_nominated', points: 5, ar: 'ترشيح زميل لجائزة (بعد موافقته، مرة لكل برنامج)', en: 'Nominated a colleague for an award (once consented, once per programme)' },
  { key: 'awards_won', points: 50, ar: 'الفوز بجائزة مؤسسية', en: 'Won an institutional award' },
];
function gameEvents(userId) {
  const out = [];
  const seen = new Set();
  for (const r of K.all(`SELECT n.program_id, n.consent_at, p.name_ar FROM awards_nominations n JOIN awards_programs p ON p.id=n.program_id
      WHERE n.nominator_id=? AND n.nominee_id<>? AND n.consent_at IS NOT NULL AND n.status IN ('submitted','in_evaluation','winner','not_selected') AND p.status<>'cancelled'
      ORDER BY n.consent_at`, userId, userId)) {
    if (seen.has(r.program_id)) continue;
    seen.add(r.program_id);
    out.push({ kind: 'awards_nominated', points: 5, at: r.consent_at, ref: r.name_ar, id: `awards:nominated:${r.program_id}` });
  }
  for (const r of K.all(`SELECT n.id, p.name_ar, p.announced_at, c.name_ar cat FROM awards_nominations n JOIN awards_programs p ON p.id=n.program_id JOIN awards_categories c ON c.id=n.category_id
      WHERE n.status='winner' AND p.status='announced' AND (n.nominee_id=? OR n.id IN (SELECT nomination_id FROM awards_team WHERE user_id=?))`, userId, userId)) {
    out.push({ kind: 'awards_won', points: 50, at: r.announced_at, ref: `${r.name_ar} — ${r.cat}`, id: `awards:won:${r.id}` });
  }
  return out;
}

// ---------------- routes (/api/sys/awards; access(user) already checked) ----------------
function routes(r) {
  const w = K.wrap;
  r.get('/me', w((req) => A.me(req.user)));
  // programmes (public to staff; drafts for the awards admin)
  r.get('/programs', w((req) => A.listPrograms(req.user, { status: ['open', 'nominations', 'evaluation', 'announced', 'draft', 'cancelled', 'all'].includes(req.query.status) ? req.query.status : 'all' })));
  r.post('/programs', w((req) => A.createProgram(req.user, req.body)));
  r.get('/programs/:id', w((req) => A.getProgram(req.user, req.params.id)));
  r.put('/programs/:id', w((req) => A.updateProgram(req.user, req.params.id, req.body)));
  r.post('/programs/:id/transition', w((req) => A.transitionProgram(req.user, req.params.id, req.body)));
  r.post('/programs/:id/copy', w((req) => A.copyProgram(req.user, req.params.id, req.body)));
  r.get('/programs/:id/ranking', w((req) => A.ranking(req.user, req.params.id)));
  r.post('/programs/:id/finalize', w((req) => A.finalize(req.user, req.params.id, req.body)));
  // nominations (restricted)
  r.get('/nominations', w((req) => A.myNominations(req.user)));
  r.post('/nominations', w((req) => A.createNomination(req.user, req.body)));
  r.get('/nominations/:id', w((req) => A.getNomination(req.user, req.params.id)));
  r.post('/nominations/:id/consent', w((req) => A.consent(req.user, req.params.id, req.body)));
  r.post('/nominations/:id/excellence', w((req) => A.setExcellence(req.user, req.params.id, req.body)));
  r.post('/nominations/:id/withdraw', w((req) => A.withdraw(req.user, req.params.id, req.body)));
  r.put('/nominations/:id/review', w((req) => A.saveReview(req.user, req.params.id, req.body)));
  r.post('/nominations/:id/recuse', w((req) => A.declareRecusal(req.user, req.params.id, req.body)));
  r.get('/excellence-preview', w((req) => A.excellenceOf(req.user)));
  // committee
  r.get('/committee', w((req) => A.committeeQueue(req.user)));
  // public recognition
  r.get('/hall', w((req) => A.hall(req.user)));
  r.get('/winners', w((req) => A.winnersList(req.user, { program_id: req.query.program_id ? String(req.query.program_id) : undefined })));
  r.get('/winners/:id', w((req) => A.winner(req.user, req.params.id)));
}

defineSystem({
  key: 'awards',
  name_ar: 'نظام الجوائز', name_en: 'Awards',
  description_ar: 'برامج الجوائز والترشيحات وتقييم اللجنة وإعلان الفائزين',
  description_en: 'Award programmes, nominations, committee scoring and winners',
  icon: 'trophy', category: 'people',
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: 'awards.admin', ar: 'إدارة برامج الجوائز', en: 'Manage award programmes' },
    { cap: 'awards.committee', ar: 'عضو لجنة الجوائز', en: 'Awards committee member' },
  ],
  domains: [
    { key: 'awards.public', name_ar: 'البرامج والفائزون المعلنون', name_en: 'Programmes and announced winners', classification: 'internal', ai: 'allowed' },
    { key: 'awards.evaluations', name_ar: 'الترشيحات وتقييمات اللجنة', name_en: 'Nominations and committee scores', classification: 'restricted', ai: 'off', locked: true, note_ar: 'سرية حتى إعلان النتائج', note_en: 'Confidential until results are announced' },
  ],
  agent: {
    name_ar: 'مساعد الجوائز', name_en: 'Awards assistant',
    description_ar: 'برامج الجوائز المفتوحة ومعاييرها والفائزون المعلنون (بيانات عامة فقط)',
    description_en: 'Open award programmes, their criteria and announced winners (public data only)',
    instructions: 'يقرأ برامج الجوائز المنشورة والفائزين المعلنين فقط. الترشيحات والتقييمات سرية ولا يطّلع عليها؛ يوجّه المستخدم لنظام الجوائز للترشيح.',
  },
  schema, seed, routes, tools, intents, workspace, gameRules, gameEvents,
});

void hasCap;
