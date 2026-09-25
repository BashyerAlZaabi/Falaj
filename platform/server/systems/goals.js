// My Goals — أهدافي.
// Personal daily/weekly/monthly/quarterly/yearly goals with check-ins, roll-up to
// longer periods and alignment to the strategic objectives. Private by default;
// shared goals are visible read-only to the owner's line manager and the manager
// of the owner's department only. Ask AI access is opt-in (goals.personal).
import { defineSystem } from './registry.js';
import { isStaff, wrap, check, requireConfirm, S, str, num, int, bool, arr, date } from './kit.js';
import * as G from './goals/core.js';
import { seed as seedDemo } from './goals/seed.js';

const { KEY } = G;

// Contract used by performance reviews (the caller authorises the reader).
export function goalsForReview(userId, year, opts) { return G.goalsForReviewData(userId, year, opts); }

// ---------------------------------------------------------------- schemas
const TYPE = str('daily|weekly|monthly|quarterly|yearly', { enum: G.TYPES });
const CREATE = S({
  title: str('title', { maxLength: 200 }), description: str('', { maxLength: 2000 }), period_type: TYPE, date: date('any day inside the target period'),
  measure: str('binary|numeric|checklist|rollup', { enum: G.MEASURES }), target_value: num('', { minimum: 0 }), current_value: num('', { minimum: 0 }), unit: str('', { maxLength: 30 }),
  items: arr(str('', { maxLength: 200 }), { maxItems: 20 }), objective_id: str(), objective_code: str('', { maxLength: 24 }), parent_id: str(), visibility: str('private|manager', { enum: ['private', 'manager'] }),
}, ['title', 'period_type']);
const UPDATE = S({
  title: str('', { maxLength: 200 }), description: str('', { maxLength: 2000 }), unit: str('', { maxLength: 30 }), target_value: num('', { minimum: 0 }),
  objective_id: str('strategic objective id (null clears)'), objective_code: str('', { maxLength: 24 }), parent_id: str(), visibility: str('', { enum: ['private', 'manager'] }), confirm: bool(),
});
const CHECKIN = S({ value: num('', { minimum: 0 }), delta: num(), done: bool(), note: str('', { maxLength: 1000 }), item_id: str(), item_done: bool() });
const STATUS = S({ to: str('achieved|cancelled|active', { enum: ['achieved', 'cancelled', 'active'] }) }, ['to']);
const ITEM = S({ title: str('', { maxLength: 200 }) }, ['title']);
const COMMENT = S({ body: str('', { maxLength: 500 }) }, ['body']);
const CONFIRM = S({ confirm: bool() });

// ---------------------------------------------------------------- routes
function routes(r) {
  r.get('/summary', wrap((req) => G.summary(req.user)));
  r.get('/lanes', wrap((req) => G.lanes(req.user)));
  r.get('/alignment', wrap((req) => G.alignment(req.user)));
  r.get('/goals', wrap((req) => G.listOwn(req.user, { scope: ['current', 'today', 'history', 'all'].includes(req.query.scope) ? req.query.scope : 'current', period_type: G.TYPES.includes(req.query.type) ? req.query.type : undefined, status: req.query.status || undefined })));
  r.get('/goals/:id', wrap((req) => G.getGoal(req.user, req.params.id)));
  r.post('/goals', wrap((req) => G.createGoal(req.user, check(CREATE, req.body)).result));
  r.put('/goals/:id', wrap((req) => G.updateGoal(req.user, req.params.id, check(UPDATE, req.body))));
  r.post('/goals/:id/checkin', wrap((req) => G.checkin(req.user, req.params.id, check(CHECKIN, req.body)).result));
  r.post('/goals/:id/status', wrap((req) => G.setStatus(req.user, req.params.id, check(STATUS, req.body).to)));
  r.post('/goals/:id/carry', wrap((req) => G.carry(req.user, req.params.id)));
  r.post('/goals/:id/items', wrap((req) => G.addItem(req.user, req.params.id, check(ITEM, req.body).title)));
  r.post('/goals/:id/items/:itemId/delete', wrap((req) => G.removeItem(req.user, req.params.id, req.params.itemId)));
  r.post('/goals/:id/comments', wrap((req) => G.comment(req.user, req.params.id, check(COMMENT, req.body).body)));
  r.post('/goals/:id/delete', wrap((req) => {
    check(CONFIRM, req.body);
    G.getGoalForDelete(req.user, req.params.id); // 404 / 403 before asking for confirmation
    requireConfirm(req.body, 'حذف الهدف نهائياً يتطلب تأكيداً صريحاً');
    return G.deleteGoal(req.user, req.params.id);
  }));
  r.get('/parents', wrap((req) => G.parentCandidates(req.user, req.query.type, /^\d{4}-\d{2}-\d{2}$/.test(req.query.date || '') ? req.query.date : undefined)));
  r.get('/objectives', wrap((req) => G.objectivesForPicker(req.user)));
  r.get('/team', wrap((req) => G.team(req.user)));
  r.get('/team/:userId', wrap((req) => G.memberGoals(req.user, req.params.userId)));
}

// ---------------------------------------------------------------- Ask AI tools (domain goals.personal is opt-in)
const typeAr = (t) => G.TYPE_AR[t] || t;
const statusAr = (s) => G.STATUS_AR[s] || s;
const goalLine = (g) => `– ${g.status === 'achieved' ? '✓' : g.status === 'missed' ? '✗' : '○'} ${g.title} (${typeAr(g.period_type)} · ${g.period_label})${g.measure === 'numeric' ? ` — ${g.current_value}/${g.target_value} ${g.unit || ''}` : ''}${g.status === 'active' ? ` — ${g.progress}%` : ` — ${statusAr(g.status)}`}${g.objective?.code ? ` · ${g.objective.code}` : ''}`;
const tools = [
  {
    name: 'goals_list', domain: 'goals.personal',
    description: "The current user's OWN personal goals (never anyone else's). scope: today (daily goals of today + goals whose period includes today) | current (default: current and upcoming periods) | history. Optional period_type and status (active|achieved|missed|cancelled).",
    input_schema: S({ scope: str('today|current|history', { enum: ['today', 'current', 'history'] }), period_type: TYPE, status: str('status', { enum: ['active', 'achieved', 'missed', 'cancelled'] }) }),
    handler: (user, i) => {
      const rows = G.listOwn(user, { scope: i.scope || 'current', period_type: i.period_type, status: i.status, limit: 40 });
      return { result: { scope: i.scope || 'current', total: rows.length, goals: rows.map((g) => ({ id: g.id, title: g.title, period_type: g.period_type, period_label: g.period_label, measure: g.measure, current_value: g.current_value, target_value: g.target_value, unit: g.unit, progress: g.progress, status: g.status, objective: g.objective?.code ? { code: g.objective.code } : null })) } };
    },
    format: (r) => (r.goals.length ? `أهدافك (${r.total}):\n${r.goals.map(goalLine).join('\n')}` : 'لا توجد أهداف في هذه الفترة بعد. قل مثلاً: «أضف هدف يومي مراجعة التقارير».'),
  },
  {
    name: 'goals_create', domain: 'goals.personal', mutates: true,
    description: 'Create a personal goal for the current user. period_type daily|weekly|monthly|quarterly|yearly (the current period by default, or the period containing date). measure binary (default) or numeric with target_value/unit. Optional objective_code (strategic objective like SO-1.1). Visibility defaults to private for daily/weekly and to the line manager for monthly and longer. Use exactly the title the user gave.',
    input_schema: S({ title: str('goal title', { maxLength: 200 }), period_type: TYPE, date: date('a day inside the target period (optional)'), measure: str('binary|numeric', { enum: ['binary', 'numeric'] }), target_value: num('numeric target', { minimum: 0 }), unit: str('unit', { maxLength: 30 }), objective_code: str('strategic objective code, e.g. SO-1.1', { maxLength: 24 }), visibility: str('private|manager', { enum: ['private', 'manager'] }), description: str('', { maxLength: 2000 }) }, ['title', 'period_type']),
    handler: (user, i) => G.createGoal(user, i),
    format: (g) => `أضفت الهدف «${g.title}» — ${typeAr(g.period_type)} · ${g.period_label}${g.objective?.code ? ` · مرتبط بـ ${g.objective.code}` : ''} · ${g.visibility === 'manager' ? 'مشترك مع مديرك المباشر' : 'خاص بك'}.`,
  },
  {
    name: 'goals_checkin', domain: 'goals.personal', mutates: true,
    description: "Record progress on one of the user's OWN active goals. goal: goal id or (part of) its title. done=true marks it achieved; value sets a numeric goal's current value; delta adds to it; note adds a check-in note. Never guess values.",
    input_schema: S({ goal: str('goal id or title', { maxLength: 200 }), done: bool('mark achieved'), value: num('new current value', { minimum: 0 }), delta: num('add to current value'), note: str('note', { maxLength: 1000 }) }, ['goal']),
    handler: (user, i) => { const g = G.resolveOwnGoal(user, i.goal); const { goal, ...rest } = i; void goal; return G.checkin(user, g.id, rest); },
    format: (g) => (g.just_achieved ? `أحسنت! تحقق هدفك «${g.title}» ✓` : `سُجّل التقدم على «${g.title}»: ${g.measure === 'numeric' ? `${g.current_value}/${g.target_value} ${g.unit || ''} — ` : ''}${g.progress}%.`),
  },
  { name: 'goals_undo_create', internal: true, domain: 'goals.personal', mutates: true, input_schema: S({ id: str('') }, ['id']), handler: (user, i) => G.undoCreate(user, i.id) },
  { name: 'goals_undo_checkin', internal: true, domain: 'goals.personal', mutates: true, input_schema: S({ id: str(''), checkin_id: str(''), snapshot: str('') }, ['id', 'checkin_id', 'snapshot']), handler: (user, i) => G.undoCheckin(user, i) },
];

// ---------------------------------------------------------------- intents (rule-based planner)
const PERIOD_WORDS = [
  [/(يومي|لليوم|هدف اليوم)/, 'daily'], [/(اسبوعي|للاسبوع|هذا الاسبوع)/, 'weekly'], [/(ربع سنوي|ربعي|للربع|فصلي)/, 'quarterly'],
  [/(شهري|للشهر|هذا الشهر)/, 'monthly'], [/(سنوي|للسنه|لهذا العام|هذا العام|لهذه السنه)/, 'yearly'],
];
const periodOf = (n) => PERIOD_WORDS.find(([re]) => re.test(n))?.[1] || null;
const intents = [
  {
    // «أضف هدف يومي: مراجعة التقارير» · «أضف هدفاً أسبوعياً إنهاء …» · «هدف شهري …»
    test: (n) => /(^|\s)(اضف|سجل|انشي|انشئ|ضع|حدد|اكتب)\s+(لي\s+)?(هدف|هدفا)(\s|$)/.test(n) || /^هدف(ا)?\s+(يومي|اسبوعي|شهري|ربع سنوي|ربعي|سنوي)/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const type = periodOf(n);
      const code = clause.match(/SO-\d+(?:\.\d+)?/i)?.[0]?.toUpperCase();
      let title = clause.replace(/SO-\d+(?:\.\d+)?/ig, '')
        .replace(/^[\s«"]*(?:من فضلك|لو سمحت)?\s*(?:أ|ا|إ)?(?:ضف|سجّ?ل|نشئ|نشي|ضع|حدّ?د|كتب)\s+(?:لي\s+)?/u, '')
        .replace(/^هدف(?:اً|ا)?\s*/u, '')
        .replace(/^(?:يومي(?:اً|ا)?|أسبوعي(?:اً|ا)?|اسبوعي(?:اً|ا)?|شهري(?:اً|ا)?|ربع\s*سنوي(?:اً|ا)?|ربعي(?:اً|ا)?|سنوي(?:اً|ا)?|جديد(?:اً|ا)?|لليوم|للأسبوع|للاسبوع|للشهر|للربع|للسنة|لهذا العام|هذا الأسبوع|هذا الشهر)\s*/gu, '')
        .replace(/^(?:يومي(?:اً|ا)?|أسبوعي(?:اً|ا)?|شهري(?:اً|ا)?|سنوي(?:اً|ا)?)\s*/u, '')
        .replace(/^(?:باسم|بعنوان|عنوانه|وهو|هو)\s*/u, '').replace(/^[:：\-–—\s]+/, '')
        .replace(/\s*(?:مرتبط(?:اً|ا)?|مرتبطه)\s*(?:ب|بـ|بال)?\s*$/u, '').replace(/[«»"]/g, '').trim();
      if (!type) return [{ ask: 'لأي فترة هذا الهدف؟', options: ['يومي', 'أسبوعي', 'شهري', 'ربع سنوي', 'سنوي'].map((l) => ({ label: l, value: `أضف هدف ${l}: ${title || '…'}` })) }];
      if (title.length < 2) return [{ ask: `ما عنوان الهدف ${G.TYPE_AR[type]}؟ مثال: «أضف هدف ${G.TYPE_AR[type]}: مراجعة تقارير الأداء».` }];
      const input = { title, period_type: type };
      if (code) input.objective_code = code;
      return [{ tool: 'goals_create', input, label: `إضافة هدف ${G.TYPE_AR[type]}: ${title}` }];
    },
  },
  {
    // «أنجزت هدف مراجعة التقارير» · «حققت هدف …»
    test: (n) => /(^|\s)(انجزت|حققت|اكملت|اتممت|خلصت)\s+(ال)?هدف/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const ref = n.replace(/^.*?(انجزت|حققت|اكملت|اتممت|خلصت)\s+(ال)?هدف(ي)?\s*/, '').replace(/^(اليوم|الاسبوعي|اليومي|الشهري)\s*/, '').replace(/[«»"]/g, '').trim();
      if (ref.length < 2) return [{ ask: 'أي هدف أنجزت؟ اذكر عنوانه، مثال: «أنجزت هدف مراجعة التقارير».' }];
      return [{ tool: 'goals_checkin', input: { goal: ref, done: true }, label: 'تسجيل تحقيق الهدف' }];
    },
  },
  {
    // «أهدافي» · «ما أهدافي اليوم؟» · «أهدافي هذا الأسبوع»
    test: (n) => /(^|\s)اهدافي(\s|$|[؟?.،])/.test(n) && !/(استراتيج|موشر)/.test(n),
    plan: (user, clause, ctx, { norm }) => {
      const n = norm(clause);
      const input = { scope: /(اليوم|today)/.test(n) ? 'today' : /(السابقه|الماضيه|سجل|history)/.test(n) ? 'history' : 'current' };
      const t = periodOf(n.replace(/اليوم/, ''));
      if (t && input.scope !== 'today') input.period_type = t;
      return [{ tool: 'goals_list', input, label: 'قراءة أهدافي' }];
    },
  },
];

// ---------------------------------------------------------------- Home workspace
function workspace(user) {
  if (!isStaff(user)) return [];
  const s = G.summary(user);
  const href = '#/sys/goals/today';
  if (!s.has_any) {
    return [{ title_ar: 'ابدأ يومك بهدف واضح', title_en: 'Start your day with a clear goal', value: null, tone: 'emph', hint_ar: 'حدّد هدفاً يومياً أو أسبوعياً واربطه بالأهداف الاستراتيجية', hint_en: 'Set a daily or weekly goal and align it to strategy', href, items: [], cta: { label_ar: 'أضف هدفاً', label_en: 'Add a goal', href } }];
  }
  const cards = [];
  const open = s.today_goals.filter((g) => g.status === 'active');
  cards.push({
    title_ar: 'أهداف اليوم', title_en: 'Today’s goals', value: s.today_total ? `${s.today_done}/${s.today_total}` : 0, unit_ar: s.today_total ? 'متحققة' : 'لا أهداف بعد', unit_en: s.today_total ? 'achieved' : 'none yet',
    tone: s.today_total && s.today_done === s.today_total ? 'good' : 'emph',
    hint_ar: s.missed.length ? `${s.missed.length} ${s.missed.length === 1 ? 'هدف فات موعده ويمكن نقله لليوم' : 'أهداف فات موعدها ويمكن نقلها لليوم'}` : s.streak > 1 ? `سلسلة ${s.streak} أيام عمل متتالية` : 'خطوة صغيرة كل يوم تصنع الفرق',
    hint_en: s.missed.length ? `${s.missed.length} missed goal(s) you can carry to today` : s.streak > 1 ? `${s.streak} working-day streak` : 'Small steps every day add up',
    href, items: open.slice(0, 3).map((g) => ({ title: g.title, meta_ar: g.measure === 'numeric' ? `${g.current_value}/${g.target_value}` : `${g.progress}%`, meta_en: g.measure === 'numeric' ? `${g.current_value}/${g.target_value}` : `${g.progress}%`, href: `#/sys/goals/today/${g.id}` })),
    cta: { label_ar: open.length ? 'سجّل تقدمك' : 'أضف هدف اليوم', label_en: open.length ? 'Check in' : 'Add today’s goal', href },
  });
  if (s.week_goals.length) {
    cards.push({
      title_ar: 'تقدّم الأسبوع', title_en: 'This week’s progress', value: s.week_progress ?? 0, unit_ar: '%', unit_en: '%', tone: s.week_progress >= 70 ? 'good' : s.week_progress >= 40 ? 'emph' : 'warn',
      hint_ar: `${s.week_done} من ${s.week_goals.length} أهداف أسبوعية متحققة`, hint_en: `${s.week_done} of ${s.week_goals.length} weekly goals achieved`,
      href: '#/sys/goals/periods', items: s.week_goals.filter((g) => g.status === 'active').slice(0, 3).map((g) => ({ title: g.title, meta_ar: `${g.progress}%`, meta_en: `${g.progress}%`, href: `#/sys/goals/periods/${g.id}` })),
      cta: { label_ar: 'كل الفترات', label_en: 'All periods', href: '#/sys/goals/periods' },
    });
  }
  return cards;
}

defineSystem({
  key: KEY,
  name_ar: 'أهدافي', name_en: 'My Goals',
  description_ar: 'أهداف شخصية يومية وأسبوعية وشهرية وربعية وسنوية، مرتبطة بالأهداف الاستراتيجية',
  description_en: 'Personal daily, weekly, monthly, quarterly and yearly goals aligned to strategy',
  icon: 'goal', category: 'strategy',
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [],
  domains: [
    { key: 'goals.personal', name_ar: 'الأهداف الشخصية', name_en: 'Personal goals', classification: 'confidential', ai: 'opt_in', note_ar: 'تظهر لصاحبها ولمديره المباشر حسب إعداد الظهور', note_en: 'Visible to the owner and their line manager per the visibility setting' },
  ],
  schema: G.schema,
  seed: seedDemo,
  routes,
  tools,
  intents,
  workspace,
  gameRules: G.GAME_RULES,
  gameEvents: G.gameEvents,
  agent: {
    name_ar: 'مساعد أهدافي', name_en: 'My goals assistant',
    description_ar: 'يضيف أهدافك الشخصية ويسجّل تقدمك ويعرضها لك وحدك',
    description_en: 'Adds your personal goals, records progress and shows them to you only',
    instructions: 'تعامل مع أهداف المستخدم نفسه فقط. لا تفترض قيماً أو إنجازات لم يذكرها. هذه بيانات شخصية سرية: لا تنقلها إلى أي جهة أخرى.',
  },
});
