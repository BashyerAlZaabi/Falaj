// Performance Management — نظام الأداء.
// Annual cycle (HR): goal setting → mid-year check-in → self-assessment →
// manager assessment → calibration → acknowledgement → closed. Per staff member:
// 3–7 weighted objectives (importable from personal yearly goals), a seeded
// competency framework, mid-year notes, self and manager assessment, weighted
// score and band, HR calibration with audited justification, acknowledgement
// with an optional disagreement routed to HR.
// Logic lives in ./performance/{model,service,seed}.js; this file wires it into the platform.
import { defineSystem } from './registry.js';
import { isStaff, wrap, S, NotFound } from './kit.js';
import { complete } from '../ai/services.js';
import * as M from './performance/model.js';
import * as P from './performance/service.js';
import { seed } from './performance/seed.js';

const list = (xs) => xs.filter(Boolean).join('\n');

function formatMyReview(res) {
  if (!res?.cycle) return 'لا توجد دورة تقييم أداء حالياً.';
  const c = res.cycle;
  const head = `**${c.name_ar}** — المرحلة الحالية: «${c.phase_ar}»${c.deadline ? ` (تنتهي ${c.deadline})` : ''}`;
  if (!res.review) return `${head}\nلا توجد لك مراجعة أداء في هذه الدورة.`;
  const r = res.review;
  return list([
    head,
    `حالة مراجعتك: ${r.status_ar}${r.manager_ar ? ` · مديرك: ${r.manager_ar}` : ''}`,
    `الخطوة التالية: ${r.next_ar}${r.next_due ? ` — قبل ${r.next_due}` : ''}`,
    `أهدافك (${r.objectives.length}):`,
    ...r.objectives.map((o) => `– ${o.title} (${o.weight}%)${o.self_pct != null ? ` · إنجازك المسجّل ${o.self_pct}%` : ''}`),
    r.final_band_ar ? `النتيجة النهائية: **${r.final_band_ar}**` : r.band_ar ? `تقدير مديرك (قبل المعايرة): ${r.band_ar}` : r.assessment_released ? null : 'لم يُرسل تقييم المدير بعد.',
    'افتح «مراجعتي» في نظام الأداء للتفاصيل.',
  ]);
}
function formatTeam(res) {
  if (!res?.cycle) return 'لا توجد دورة تقييم أداء حالياً.';
  if (!res.total) return `لا توجد مراجعات أداء تقيّمها في ${res.cycle.name_ar}.`;
  return list([
    `**تقييمات فريقك — ${res.cycle.name_ar}** (المرحلة: ${res.cycle.phase_ar})`,
    `بانتظار إجرائك: ${res.pending} من ${res.total} · تقييمات ذاتية مستلمة: ${res.self} · تقييمات أرسلتها: ${res.assessed}`,
    ...res.members.map((m) => `– ${m.name_ar}: ${m.status_ar}${m.needs_you ? ` ← ${m.next_ar}` : ''}`),
    res.cycle.manager_deadline ? `آخر موعد لتقييم المدير: ${res.cycle.manager_deadline}` : null,
  ]);
}

defineSystem({
  key: 'performance',
  name_ar: 'نظام الأداء', name_en: 'Performance Management',
  description_ar: 'دورات تقييم الأداء: الأهداف، المراجعة المرحلية، التقييم الذاتي وتقييم المدير، المعايرة',
  description_en: 'Performance cycles: objectives, mid-year check-in, self and manager assessment, calibration',
  icon: 'chartLine', category: 'people',
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: 'performance.hr', ar: 'إدارة دورات الأداء والمعايرة (الموارد البشرية)', en: 'Manage performance cycles and calibration (HR)' },
  ],
  domains: [
    { key: 'performance.reviews', name_ar: 'تقييمات الأداء', name_en: 'Performance reviews', classification: 'confidential', ai: 'opt_in', note_ar: 'للموظف ومديره المباشر والموارد البشرية فقط', note_en: 'Employee, line manager and HR only' },
  ],

  schema: M.schema,
  seed,

  routes(r) {
    r.get('/', wrap((req) => P.bootstrap(req.user)));
    r.get('/framework', wrap(() => P.framework()));
    r.get('/cycles', wrap(() => P.listCycles()));
    r.get('/cycles/:id', wrap((req) => { const c = P.resolveCycle(req.params.id); if (!c) throw new NotFound('دورة الأداء غير موجودة'); return P.cycleView(c); }));
    r.post('/cycles', wrap((req) => P.createCycle(req.user, req.body)));
    r.put('/cycles/:id/phases', wrap((req) => P.updateDates(req.user, req.params.id, req.body)));
    r.post('/cycles/:id/advance', wrap((req) => P.advanceCycle(req.user, req.params.id, req.body)));
    r.post('/cycles/:id/sync', wrap((req) => P.syncReviews(req.user, req.params.id)));
    r.get('/mine', wrap((req) => P.myReview(req.user, req.query.cycle)));
    r.get('/team', wrap((req) => P.teamList(req.user, req.query.cycle)));
    r.get('/hr', wrap((req) => P.hrOverview(req.user, req.query.cycle)));
    r.get('/insights', wrap((req) => P.insights(req.user, req.query.cycle)));
    r.get('/reviews/:id', wrap((req) => P.reviewDetail(req.user, req.params.id)));
    r.put('/reviews/:id/objectives', wrap((req) => P.saveObjectives(req.user, req.params.id, req.body)));
    r.post('/reviews/:id/import-goals', wrap((req) => P.importGoals(req.user, req.params.id)));
    r.post('/reviews/:id/agree', wrap((req) => P.agreeObjectives(req.user, req.params.id)));
    r.post('/reviews/:id/reopen', wrap((req) => P.reopenObjectives(req.user, req.params.id)));
    r.put('/reviews/:id/midyear', wrap((req) => P.saveMidyear(req.user, req.params.id, req.body)));
    r.put('/reviews/:id/self', wrap((req) => P.saveSelf(req.user, req.params.id, req.body)));
    r.put('/reviews/:id/assessment', wrap((req) => P.saveAssessment(req.user, req.params.id, req.body)));
    r.post('/reviews/:id/draft-comment', wrap((req) => P.draftComment(req.user, req.params.id, req.body, complete)));
    r.post('/reviews/:id/calibrate', wrap((req) => P.calibrate(req.user, req.params.id, req.body)));
    r.post('/reviews/:id/acknowledge', wrap((req) => P.acknowledge(req.user, req.params.id, req.body)));
    r.post('/reviews/:id/resolve', wrap((req) => P.resolveDisagreement(req.user, req.params.id, req.body)));
  },

  tools: [
    {
      name: 'performance_my_review', domain: 'performance.reviews',
      description: "The current user's own performance review in the current cycle: phase, status, next action and deadline, objectives with weights and recorded self-achievement; the manager's assessment only once it has been submitted, the final band only once results are released. Read-only.",
      input_schema: S({}), handler: (u) => ({ result: P.myReviewSummary(u) }), format: formatMyReview,
    },
    {
      name: 'performance_team_status', domain: 'performance.reviews',
      description: 'Status of the performance reviews the current user assesses as line manager in the current cycle: who submitted a self-assessment and which reviews await the user. No ratings are returned. Read-only.',
      input_schema: S({}), handler: (u) => ({ result: P.teamStatus(u) }), format: formatTeam,
    },
  ],
  agent: {
    name_ar: 'مساعد الأداء', name_en: 'Performance assistant',
    description_ar: 'يعرض مراجعة أدائك وحالة تقييمات فريقك ضمن صلاحياتك', description_en: 'Shows your performance review and your team’s review status within your permissions',
    instructions: 'يقرأ مراجعة أداء المستخدم نفسه وحالة تقييمات فريقه فقط. لا يكشف تقديرات موظفين آخرين، ولا ينشئ أو يعدّل أي تقييم، ولا يفترض نتائج لم تُعتمد.',
  },
  intents: [
    {
      test: (n) => /(تقييمات|تقييم|مراجعات|مراجعه)\s+(اداء\s+)?(فريقي|موظفيني|موظفي|فريق عملي)/.test(n) || /\bteam (performance|reviews?)\b/.test(n),
      plan: () => [{ tool: 'performance_team_status', input: {}, label: 'حالة تقييمات فريقي' }],
    },
    {
      test: (n) => /(^|\s)(تقييمي|تقييم ادايي|مراجعه ادايي|مراجعتي السنويه|تقييم الاداء الخاص بي)(\s|$|[؟?.،])/.test(n) || /\bmy (performance )?review\b/.test(n),
      plan: () => [{ tool: 'performance_my_review', input: {}, label: 'مراجعة أدائي' }],
    },
  ],
  workspace: (u) => P.workspace(u),
  gameRules: [
    { key: 'perf_self_on_time', points: 10, ar: 'إرسال التقييم الذاتي قبل موعده النهائي', en: 'Self-assessment submitted before its deadline' },
    { key: 'perf_team_on_time', points: 15, ar: 'إكمال تقييمات فريقك جميعها في موعدها', en: 'All your team assessments completed on time' },
  ],
  gameEvents: (userId) => P.gameEvents(userId),
});
