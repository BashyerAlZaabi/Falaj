// Surveys — الاستبيانات.
// Staff answer surveys addressed to them (anonymous by default); authors
// (surveys.author) build, publish and close their own surveys and read
// aggregated results (≥ 5 responses, department segments ≥ 5 with secondary
// suppression, open text as themes; verbatim comments to the author only, logged).
// The service lives in ./surveys/service.js; aggregation rules in ./surveys/analysis.js.
import { defineSystem } from './registry.js';
import { isStaff, hasCap, wrap, S, str, NotFound, BadRequest, all } from './kit.js';
import * as SV from './surveys/service.js';
import { seedSurveys } from './surveys/seed.js';
import { norm } from './surveys/analysis.js';

const { KEY, CAP } = SV;
const leftAr = (d) => (d <= 0 ? 'يُغلق اليوم' : d === 1 ? 'يتبقى يوم' : d === 2 ? 'يتبقى يومان' : d <= 10 ? `يتبقى ${d} أيام` : `يتبقى ${d} يوماً`);
const leftEn = (d) => (d <= 0 ? 'closes today' : d === 1 ? '1 day left' : `${d} days left`);
const safeSweep = () => { try { SV.sweep(); } catch (e) { console.error('[surveys] sweep:', e.message); } };

// ---------------------------------------------------------------- Ask AI helpers
function pickSurvey(user, input) {
  if (input.id) return SV.visible(user, input.id);
  const list = SV.resultsViewable(user);
  if (!list.length) throw new NotFound('لا توجد استبيانات منشورة من إعدادك أو إعداد فريقك');
  if (input.title) {
    const q = norm(input.title).replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter((w) => w.length > 2 && w !== 'استبيان');
    const scored = list.map((s) => { const t = norm(s.title); return { s, k: q.filter((w) => t.includes(w)).length }; }).filter((x) => x.k > 0).sort((a, b) => b.k - a.k);
    if (!scored.length) throw new NotFound('لم أجد استبياناً بهذا الاسم ضمن استبياناتك');
    return scored[0].s;
  }
  if (list.length === 1) return list[0];
  throw new BadRequest(`حدّد الاستبيان: ${list.slice(0, 5).map((s) => `«${s.title}»`).join('، ')}`);
}
function formatResults(r) {
  const head = `«${r.title}» — ${r.status === 'closed' ? 'مغلق' : 'مفتوح'}: شارك ${r.responded} من ${r.eligible}${r.response_rate != null ? ` (${r.response_rate}%)` : ''}.`;
  if (r.hidden) return `${head}\nالنتائج مخفية حتى تبلغ الإجابات المُفرج عنها ${r.min_group} على الأقل (حالياً ${r.released_responses}) لحماية الخصوصية.`;
  const lines = r.questions.slice(0, 8).map((q) => {
    if (q.suppressed) return `– ${q.text}: أقل من ${r.min_group} إجابات — مخفي`;
    if (q.type === 'rating') return `– ${q.text}: ${q.average}/5 (${q.favourable_pct}% راضون)`;
    if (q.type === 'nps') return `– ${q.text}: صافي نقاط الترويج ${q.nps > 0 ? '+' : ''}${q.nps}`;
    if (q.type === 'yesno') return `– ${q.text}: نعم ${q.yes_pct}%`;
    if (q.type === 'single' || q.type === 'multi') { const top = [...q.options].sort((a, b) => b.pct - a.pct)[0]; return `– ${q.text}: الأعلى «${top?.label}» ${top?.pct}%`; }
    if (q.type === 'text') return `– ${q.text}: ${q.themes?.length ? `أبرز المحاور ${q.themes.slice(0, 3).map((t) => `${t.theme} (${t.mentions})`).join('، ')}` : 'لا محاور متكررة'}`;
    return `– ${q.text}`;
  });
  return `${head}\n${lines.join('\n')}\n(نتائج مجمّعة فقط — لا تُعرض أي إجابة فردية.)`;
}

defineSystem({
  key: 'surveys',
  name_ar: 'الاستبيانات', name_en: 'Surveys',
  description_ar: 'استبيانات الموظفين بإجابات مجهولة الهوية ونتائج مجمّعة تحمي الخصوصية',
  description_en: 'Staff surveys with anonymous answers and privacy-preserving aggregated results',
  icon: 'clipboardList', category: 'people',
  access: (u) => isStaff(u),
  defaultPinned: () => true,
  caps: [
    { cap: 'surveys.author', ar: 'إعداد الاستبيانات ونشرها', en: 'Create and publish surveys' },
  ],
  domains: [
    { key: 'surveys.results', name_ar: 'النتائج المجمّعة', name_en: 'Aggregated results', classification: 'internal', ai: 'allowed' },
    { key: 'surveys.responses', name_ar: 'الإجابات الفردية', name_en: 'Individual responses', classification: 'restricted', ai: 'off', locked: true, note_ar: 'لا تُعرض إجابة فردية لأحد؛ النتائج مجمّعة بحد أدنى 5 مشاركين', note_en: 'No individual answer is ever shown; results aggregate at least 5 respondents' },
  ],

  schema: SV.schema,
  seed: seedSurveys,

  routes(r) {
    r.use((req, res, next) => { safeSweep(); next(); });
    r.get('/overview', wrap((req) => {
      const u = req.user;
      const m = SV.mine(u);
      return {
        is_author: hasCap(u, CAP), is_manager: ['manager', 'president'].includes(u.role),
        pending: SV.pending(u).length, answered: SV.answered(u).length,
        authored: m.authored.length, open_authored: m.authored.filter((s) => s.status === 'published').length, overseen: m.overseen.length,
      };
    }));
    r.get('/pending', wrap((req) => ({ pending: SV.pending(req.user), upcoming: SV.upcoming(req.user) })));
    r.get('/answered', wrap((req) => SV.answered(req.user)));
    r.get('/mine', wrap((req) => SV.mine(req.user)));
    r.get('/team', wrap((req) => SV.team(req.user)));
    r.post('/surveys', wrap((req) => SV.createSurvey(req.user, req.body)));
    r.get('/surveys/:id', wrap((req) => SV.getSurvey(req.user, req.params.id)));
    r.put('/surveys/:id', wrap((req) => SV.updateSurvey(req.user, req.params.id, req.body)));
    r.delete('/surveys/:id', wrap((req) => SV.deleteSurvey(req.user, req.params.id, req.body)));
    r.post('/surveys/:id/publish', wrap((req) => SV.publish(req.user, req.params.id)));
    r.post('/surveys/:id/close', wrap((req) => SV.closeSurvey(req.user, req.params.id, req.body)));
    r.post('/surveys/:id/remind', wrap((req) => SV.remind(req.user, req.params.id)));
    r.post('/surveys/:id/duplicate', wrap((req) => SV.duplicate(req.user, req.params.id)));
    r.post('/surveys/:id/sections', wrap((req) => SV.addSection(req.user, req.params.id, req.body)));
    r.put('/surveys/:id/sections/:sid', wrap((req) => SV.updateSection(req.user, req.params.id, req.params.sid, req.body)));
    r.delete('/surveys/:id/sections/:sid', wrap((req) => SV.deleteSection(req.user, req.params.id, req.params.sid, req.body)));
    r.post('/surveys/:id/sections/:sid/move', wrap((req) => SV.moveSection(req.user, req.params.id, req.params.sid, req.body)));
    r.post('/surveys/:id/questions', wrap((req) => SV.addQuestion(req.user, req.params.id, req.body)));
    r.put('/surveys/:id/questions/:qid', wrap((req) => SV.updateQuestion(req.user, req.params.id, req.params.qid, req.body)));
    r.delete('/surveys/:id/questions/:qid', wrap((req) => SV.deleteQuestion(req.user, req.params.id, req.params.qid, req.body)));
    r.post('/surveys/:id/questions/:qid/move', wrap((req) => SV.moveQuestion(req.user, req.params.id, req.params.qid, req.body)));
    r.post('/surveys/:id/responses', wrap((req) => SV.submitResponse(req.user, req.params.id, req.body)));
    r.get('/surveys/:id/my-response', wrap((req) => SV.myResponse(req.user, req.params.id)));
    r.get('/surveys/:id/participants', wrap((req) => SV.participants(req.user, req.params.id)));
    r.get('/surveys/:id/results', wrap((req) => SV.results(req.user, req.params.id)));
    r.get('/surveys/:id/questions/:qid/summary', wrap((req) => SV.textSummary(req.user, req.params.id, req.params.qid)));
    r.get('/surveys/:id/questions/:qid/comments', wrap((req) => SV.comments(req.user, req.params.id, req.params.qid)));
  },

  // ---------------------------------------------------------------- Ask AI
  agent: {
    name_ar: 'مساعد الاستبيانات', name_en: 'Surveys assistant',
    description_ar: 'يعرض الاستبيانات بانتظارك ونتائج استبياناتك المجمّعة', description_en: 'Shows surveys awaiting you and aggregated results of your surveys',
    instructions: 'اعرض الاستبيانات بانتظار المستخدم ونتائج استبياناته المجمّعة فقط. لا تطلب ولا تعرض أي إجابة فردية أو تعليق نصي حرفي؛ النتائج مجمّعة لخمسة مشاركين على الأقل، والمحاور النصية أعداد فقط.',
  },
  tools: [
    {
      name: 'surveys_pending', domain: 'surveys.results',
      description: 'Surveys waiting for the current user to answer (open, addressed to them, not yet answered) with days left, number of questions and whether answers are anonymous.',
      input_schema: S({}),
      handler: (u) => { safeSweep(); return { result: SV.pending(u).map((s) => ({ id: s.id, title: s.title, closes_on: s.closes_on, days_left: s.days_left, questions: s.question_count, minutes: s.est_minutes, anonymous: s.anonymous, from_ar: s.author?.dept_ar, url: `#/sys/surveys/answer/${s.id}` })) }; },
      format: (r) => (r.length
        ? `لديك ${r.length === 1 ? 'استبيان واحد' : r.length === 2 ? 'استبيانان' : `${r.length} استبيانات`} بانتظار مشاركتك:\n${r.map((s) => `– «${s.title}» (${s.from_ar || ''}) — ${leftAr(s.days_left)} · ${s.questions} أسئلة · نحو ${s.minutes} د${s.anonymous ? ' · مجهول الهوية' : ' · غير مجهول'}`).join('\n')}\nافتح «الاستبيانات» ← «بانتظاري» للإجابة.`
        : 'لا توجد استبيانات بانتظار مشاركتك حالياً. شكراً لتفاعلك!'),
    },
    {
      name: 'surveys_results', domain: 'surveys.results',
      description: 'Aggregated results of a survey the current user authored (or oversees as the author department director): response rate, per-question averages / NPS / yes-% / option shares, and open-text THEMES as counts. Never individual answers or verbatim comments; hidden below 5 responses. Give the survey id, or a title (or part of it).',
      input_schema: S({ id: str('survey id'), title: str('survey title (or part of it) when the id is unknown') }),
      handler: (u, i) => { safeSweep(); return { result: SV.resultsForAI(u, pickSurvey(u, i)) }; },
      format: (r) => formatResults(r),
    },
    {
      name: 'surveys_mine', domain: 'surveys.results',
      description: "Surveys the current user authored (and their team's surveys for an author who directs the department) with status, days left and response rate. Authors only.",
      input_schema: S({}),
      handler: (u) => {
        if (!hasCap(u, CAP)) return { result: { is_author: false, surveys: [] } };
        const m = SV.mine(u);
        const map = (s, team) => ({ id: s.id, title: s.title, status: s.status, days_left: s.days_left, eligible: s.stats?.eligible, responded: s.stats?.responded, rate: s.stats?.rate, team });
        return { result: { is_author: true, surveys: [...m.authored.map((s) => map(s, false)), ...m.overseen.map((s) => map(s, true))] } };
      },
      format: (r) => {
        if (!r.is_author) return 'إعداد الاستبيانات متاح لمن يحمل صلاحية «إعداد الاستبيانات ونشرها».';
        if (!r.surveys.length) return 'لا توجد استبيانات من إعدادك بعد. أنشئ استبياناً من «الاستبيانات» ← «استبياناتي».';
        const st = { draft: 'مسودة', published: 'مفتوح', closed: 'مغلق' };
        return `استبياناتك:\n${r.surveys.map((s) => `– «${s.title}» — ${st[s.status]}${s.status !== 'draft' ? ` · الاستجابة ${s.rate ?? 0}% (${s.responded}/${s.eligible})` : ''}${s.status === 'published' ? ` · ${leftAr(s.days_left)}` : ''}${s.team ? ' · من فريقك' : ''}`).join('\n')}`;
      },
    },
  ],
  intents: [
    {
      test: (n) => /(استبيان|survey)/.test(n) && /(بانتظاري|بانتظار|معلقه|لم اجب|المطلوب|pending|waiting|awaiting|to answer)/.test(n) && !/(نتايج|نتيجه|result)/.test(n),
      plan: () => [{ tool: 'surveys_pending', input: {}, label: 'قراءة الاستبيانات بانتظارك' }],
    },
    {
      test: (n) => /(نتايج|نتيجه|results?)/.test(n) && /(استبيان|survey)/.test(n),
      plan: (user, clause, ctx, { matchByName }) => {
        if (!hasCap(user, CAP)) return [{ say: 'نتائج الاستبيانات متاحة لمُعِدّيها. إن كنت مشاركاً فستجد النتائج المشتركة في «الاستبيانات» ← «مشاركاتي» بعد إغلاق الاستبيان إن قرر المُعِدّ مشاركتها.' }];
        const list = SV.resultsViewable(user);
        if (!list.length) return [{ say: 'لا توجد لديك استبيانات منشورة بعد — أنشئ استبياناً من «الاستبيانات» ← «استبياناتي».' }];
        const m = matchByName(list, clause, (s) => s.title);
        const pick = m.matches.length === 1 ? m.matches[0] : !m.matches.length && list.length === 1 ? list[0] : null;
        if (pick) return [{ tool: 'surveys_results', input: { id: pick.id }, label: `قراءة نتائج «${pick.title}»` }];
        const opts = (m.matches.length ? m.matches : list).slice(0, 5);
        return [{ ask: `أي استبيان تقصد؟ ${opts.map((s) => `«${s.title}»`).join('، ')}` }];
      },
    },
    {
      test: (n) => /(استبياناتي|نسبه الاستجابه|معدل الاستجابه|response rate|my surveys)/.test(n),
      plan: () => [{ tool: 'surveys_mine', input: {}, label: 'قراءة استبياناتي ونسب الاستجابة' }],
    },
  ],

  // ---------------------------------------------------------------- Home workspace
  workspace(user) {
    if (!isStaff(user)) return [];
    safeSweep();
    const cards = [];
    const p = SV.pending(user);
    if (p.length) {
      const urgent = p.some((s) => s.days_left <= 2);
      cards.push({
        title_ar: 'استبيانات بانتظار مشاركتك', title_en: 'Surveys awaiting you', value: p.length, unit_ar: p.length === 1 ? 'استبيان' : 'استبيانات', unit_en: p.length === 1 ? 'survey' : 'surveys',
        tone: urgent ? 'warn' : 'emph', hint_ar: `أقرب إغلاق: ${leftAr(p[0].days_left)} · نحو ${p[0].est_minutes} دقائق`, hint_en: `Next closes: ${leftEn(p[0].days_left)} · about ${p[0].est_minutes} min`,
        href: '#/sys/surveys/pending',
        items: p.slice(0, 3).map((s) => ({ title: s.title, meta_ar: leftAr(s.days_left), meta_en: leftEn(s.days_left), href: `#/sys/surveys/answer/${s.id}` })),
        cta: { label_ar: 'أجب الآن', label_en: 'Answer now', href: `#/sys/surveys/answer/${p[0].id}` },
      });
    }
    if (hasCap(user, CAP)) {
      const m = SV.mine(user);
      const open = m.authored.filter((s) => s.status === 'published' && !s.scheduled);
      if (open.length) {
        const el = open.reduce((a, s) => a + (s.stats?.eligible || 0), 0); const rs = open.reduce((a, s) => a + (s.stats?.responded || 0), 0);
        const rate = el ? Math.round((100 * rs) / el) : 0;
        cards.push({
          title_ar: 'معدل الاستجابة لاستبياناتك المفتوحة', title_en: 'Response rate of your open surveys', value: rate, unit_ar: '%', unit_en: '%',
          tone: rate >= 60 ? 'good' : rate >= 30 ? 'warn' : 'crit', hint_ar: `${rs} مشاركة من ${el} مدعواً`, hint_en: `${rs} of ${el} invited responded`,
          href: '#/sys/surveys/mine',
          items: open.slice(0, 3).map((s) => ({ title: s.title, meta_ar: `${s.stats?.rate ?? 0}% · ${leftAr(s.days_left)}`, meta_en: `${s.stats?.rate ?? 0}% · ${leftEn(s.days_left)}`, href: `#/sys/surveys/results/${s.id}` })),
          cta: { label_ar: 'افتح النتائج', label_en: 'Open results', href: `#/sys/surveys/results/${open[0].id}` },
        });
      }
      const drafts = m.authored.filter((s) => s.status === 'draft');
      if (drafts.length) {
        cards.push({
          title_ar: 'مسودات استبيانات لم تُنشر', title_en: 'Unpublished survey drafts', value: drafts.length, unit_ar: drafts.length === 1 ? 'مسودة' : 'مسودات', unit_en: 'drafts', tone: null,
          hint_ar: 'راجع الأسئلة والجمهور ثم انشر', hint_en: 'Review questions and audience, then publish', href: '#/sys/surveys/mine',
          items: drafts.slice(0, 3).map((s) => ({ title: s.title, meta_ar: `${s.question_count} أسئلة`, meta_en: `${s.question_count} questions`, href: `#/sys/surveys/build/${s.id}` })),
          cta: { label_ar: 'أكمل الإعداد', label_en: 'Continue', href: `#/sys/surveys/build/${drafts[0].id}` },
        });
      }
    }
    return cards.slice(0, 3);
  },

  // ---------------------------------------------------------------- excellence points
  // Derived from participation only (never from answers): 3 points per survey taken.
  gameRules: [{ key: 'survey_response', points: 3, ar: 'المشاركة في استبيان مؤسسي', en: 'Take part in an organisational survey' }],
  gameEvents(userId) {
    return all(`SELECT p.survey_id, p.responded_on, s.title FROM surveys_participation p JOIN surveys_surveys s ON s.id=p.survey_id WHERE p.user_id=?`, userId)
      .map((r) => ({ kind: 'survey_response', points: 3, at: `${r.responded_on}T06:00:00.000Z`, ref: r.title, id: `survey:${r.survey_id}` }));
  },
});

