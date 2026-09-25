// Ideas — Ask AI tools, rule-based intents and the committee screening brief.
// Tools call the same service functions as the UI (same authorization); the
// executor blocks them when the ideas.pool AI policy is switched off.
import * as K from '../kit.js';
import * as S from './service.js';
import { complete } from '../../ai/services.js';

const { str, int, num, bool } = K;
const cat = (c) => S.categoryAr(c);
const st = (s) => S.statusAr(s);
const plural = (n, one, two, few, many) => (n === 1 ? one : n === 2 ? two : n <= 10 ? `${n} ${few}` : `${n} ${many}`);

export const tools = [
  {
    name: 'ideas_submit', domain: S.DOMAIN, mutates: true,
    description: 'Submit a new improvement idea to the Ideas bank on behalf of the current user. Without a problem AND a solution (or when as_draft=true) it is saved as a private draft the user completes in the Ideas system before sending. Never invent impact numbers.',
    input_schema: K.S({
      title: str('Short title of the idea (4-140 chars)', { maxLength: 140 }),
      problem: str('The problem or opportunity, in the user’s words', { maxLength: 3000 }),
      solution: str('The proposed solution, in the user’s words', { maxLength: 4000 }),
      category: str('Category', { enum: Object.keys(S.CATEGORIES) }),
      campaign_id: str('Challenge id (see ideas_challenges)', { maxLength: 64 }),
      expected_saving: num('Annual saving in AED — only if the user stated it', { minimum: 0, maximum: 1e9 }),
      expected_hours: num('Hours saved per year — only if the user stated it', { minimum: 0, maximum: 1e6 }),
      hide_author: bool('Hide the author name from colleagues'),
      as_draft: bool('Save as a draft for review instead of sending to the committee'),
    }, ['title']),
    handler: async (user, i) => {
      const { as_draft, ...rest } = i;
      const submit = !as_draft && K.clean(i.problem).length >= 20 && K.clean(i.solution).length >= 20;
      const r = await S.createIdea(user, { ...rest, submit });
      return { result: { id: r.id, ref: r.ref, title: r.title, status: r.status, campaign: r.campaign, href: `#/sys/ideas/mine/${r.id}` }, undo: { tool: 'ideas__undo_submit', input: { id: r.id } } };
    },
    format: (r) => (r.status === 'draft'
      ? `حفظتُ فكرتك «${r.title}» كمسودة خاصة بك. أكمل وصف المشكلة والحل من «أفكاري» ثم أرسلها للجنة — لن يراها أحد قبل الإرسال.`
      : `أرسلتُ فكرتك «${r.title}» (${r.ref}) إلى لجنة تقييم الأفكار${r.campaign ? ` ضمن «${r.campaign.title_ar}»` : ''}. ستصلك ملاحظات اللجنة في النظام.`),
  },
  {
    name: 'ideas_top', domain: S.DOMAIN,
    description: 'Top / trending ideas in the Ideas bank visible to the user (votes, recent activity). Optionally for one challenge or the last week/month. Anonymous authors stay anonymous.',
    input_schema: K.S({ limit: int('1-10', { minimum: 1, maximum: 10 }), campaign_id: str('Challenge id', { maxLength: 64 }), period: str('all | month | week', { enum: ['all', 'month', 'week'] }) }),
    handler: (user, i) => ({ result: S.topIdeas(user, { limit: i.limit || 5, campaign_id: i.campaign_id, period: i.period || 'all' }).map((x) => ({ id: x.id, ref: x.ref, title: x.title, status: x.status, category: x.category, votes: x.votes, comments: x.comments, author: x.author ? x.author.name_ar : null, author_hidden: x.author_hidden, campaign: x.campaign?.title_ar || null })) }),
    format: (r) => (r.length ? `أبرز الأفكار الآن:\n${r.map((x, n) => `${n + 1}. ${x.title} — ${plural(x.votes, 'صوت واحد', 'صوتان', 'أصوات', 'صوتاً')} · ${st(x.status)}${x.author ? ` · ${x.author}` : x.author_hidden ? ' · مقدّم مجهول' : ''}`).join('\n')}` : 'لا توجد أفكار منشورة بعد. كن أول من يشارك بفكرة!'),
  },
  {
    name: 'ideas_my', domain: S.DOMAIN,
    description: "The current user's own ideas (authored or co-authored) with their stage, votes and what is needed next.",
    input_schema: K.S({}),
    handler: (user) => { const m = S.myIdeas(user); return { result: { stats: m.stats, ideas: m.ideas.filter((x) => x.status !== 'withdrawn').map((x) => ({ id: x.id, ref: x.ref, title: x.title, status: x.status, votes: x.votes, comments: x.comments })) } }; },
    format: (r) => {
      if (!r.ideas.length) return 'لم تقدّم أي فكرة بعد. قل مثلاً: «عندي فكرة: …» وسأحفظها لك كمسودة.';
      const next = { draft: 'أكمل المسودة وأرسلها', needs_info: 'اللجنة تنتظر معلومات منك', submitted: 'بانتظار الفرز', screening: 'قيد الفرز', evaluation: 'قيد تقييم اللجنة', approved: 'بانتظار بدء التنفيذ', in_implementation: 'قيد التنفيذ', implemented: 'نُفّذت وتحقق أثرها', rejected: 'لم تُعتمد — اطلع على الملاحظات' };
      return `أفكارك (${r.ideas.length}):\n${r.ideas.map((x) => `– ${x.title}: ${next[x.status] || st(x.status)} · ${plural(x.votes, 'صوت واحد', 'صوتان', 'أصوات', 'صوتاً')}`).join('\n')}${r.stats.needs_info ? `\nتنبيه: ${plural(r.stats.needs_info, 'فكرة واحدة تحتاج', 'فكرتان تحتاجان', 'أفكار تحتاج', 'فكرة تحتاج')} معلومات منك.` : ''}`;
    },
  },
  {
    name: 'ideas_challenges', domain: S.DOMAIN,
    description: 'Open innovation challenges (campaigns) with their deadlines and participation.',
    input_schema: K.S({}),
    handler: (user) => ({ result: S.listCampaigns(user).filter((c) => c.state !== 'closed').map((c) => ({ id: c.id, title: c.title_ar, state: c.state, ends_on: c.ends_on, days_left: c.days_left, ideas: c.stats.ideas })) }),
    format: (r) => (r.length ? `التحديات المفتوحة:\n${r.map((c) => `– ${c.title}: ${c.state === 'active' ? `يُغلق بعد ${c.days_left} يوماً (${c.ends_on})` : `يبدأ قريباً`} · ${c.ideas} فكرة`).join('\n')}` : 'لا توجد تحديات مفتوحة حالياً.'),
  },
  { name: 'ideas__undo_submit', internal: true, input_schema: K.S({ id: str('') }, ['id']), handler: (user, i) => S.undoCreate(user, i.id) },
];

// ---------------- rule-based intents (normalized text: أإآ→ا, ة→ه, ى→ي) ----------------
const SUBMIT = /(^|\s)(عندي|لدي|عندنا|لدينا|اقترح|اقتراح|اريد تقديم|اود تقديم|ابي اقدم|ابغي اقدم|ودي اقدم|سجل|سجلي)\s+(لي\s+)?فكره|^فكره جديده|\bi have an idea\b|\bsubmit (an |my )?idea\b/;
const TOP = /(افضل|اقوي|ابرز|اكثر|اعلي|اهم)\s+(ال)?افكار|(ال)?افكار\s+(ال)?(الاكثر|الاعلي|الرائجه|المميزه|الاكثر تصويتا)|\b(top|best|trending) ideas\b/;
const MINE = /(^|\s)(ال)?افكاري(\s|$|[؟?])|حاله\s+(فكرتي|افكاري)|\bmy ideas\b/;
const CHALLENGES = /(تحديات|تحدي|مسابقات)\s+(ال)?(افكار|ابتكار)|(ال)?تحديات\s+(ال)?(المفتوحه|النشطه|الحاليه)\s+(لل)?(افكار|ابتكار)|\bidea challenges\b/;

function extractIdea(clause) {
  let t = String(clause).replace(/^\s*و(?=\S)/, '');
  const m = t.match(/(فكر[ةه]|idea)\s*(?:جديد[ةه])?\s*(?:[:：\-–—]\s*|(?:وهي|هي|بعنوان|عن|is)\s+)?/i);
  t = m ? t.slice(m.index + m[0].length) : t;
  const grab = (re) => { const x = t.match(re); return x ? x[1].trim() : ''; };
  const problem = grab(/(?:المشكل[ةه]|problem)\s*[:：]\s*([\s\S]*?)(?=(?:الحل|solution)\s*[:：]|$)/i);
  const solution = grab(/(?:الحل(?: المقترح)?|solution)\s*[:：]\s*([\s\S]*)$/i);
  let title = t.replace(/(?:المشكل[ةه]|problem)\s*[:：][\s\S]*$/i, '').replace(/(?:الحل(?: المقترح)?|solution)\s*[:：][\s\S]*$/i, '').replace(/^[«"“'\s]+|[»"”'،,.\s]+$/g, '').trim();
  let rest = '';
  if (title.length > 120) { const cut = title.slice(0, 120).lastIndexOf(' '); rest = title; title = `${title.slice(0, cut > 40 ? cut : 120).trim()}…`; }
  return { title, problem, solution: solution || rest };
}
export const intents = [
  {
    test: (n) => SUBMIT.test(n) && !/(مهمه|موعد|مشروع|تقرير|task|meeting)/.test(n.split(/فكره|idea/)[0]),
    plan: (user, clause, ctx, { matchByName }) => {
      const { title, problem, solution } = extractIdea(clause);
      if (title.length < 4) return [{ ask: 'رائع! ما فكرتك؟ اكتبها في جملة واحدة، مثلاً: «عندي فكرة: أتمتة طلبات الإجازة عبر البوابة الموحدة».' }];
      const input = { title, as_draft: true };
      if (problem) input.problem = problem.slice(0, 3000);
      if (solution) input.solution = solution.slice(0, 4000);
      const camps = S.listCampaigns(user).filter((c) => c.state === 'active');
      const { matches } = matchByName(camps, clause, (c) => c.title_ar);
      if (matches?.length === 1) input.campaign_id = matches[0].id;
      return [{ tool: 'ideas_submit', input, label: 'حفظ الفكرة كمسودة في بنك الأفكار' }];
    },
  },
  {
    test: (n) => TOP.test(n),
    plan: (user, clause, ctx, { norm, matchByName }) => {
      const n = norm(clause);
      const input = { limit: 5 };
      if (/(هذا الاسبوع|الاسبوع|this week)/.test(n)) input.period = 'week';
      else if (/(هذا الشهر|الشهر|this month)/.test(n)) input.period = 'month';
      const { matches } = matchByName(S.listCampaigns(user), clause, (c) => c.title_ar);
      if (matches?.length === 1) input.campaign_id = matches[0].id;
      return [{ tool: 'ideas_top', input, label: 'أفضل الأفكار' }];
    },
  },
  { test: (n) => MINE.test(n), plan: () => [{ tool: 'ideas_my', input: {}, label: 'أفكاري' }] },
  { test: (n) => CHALLENGES.test(n), plan: () => [{ tool: 'ideas_challenges', input: {}, label: 'تحديات الأفكار' }] },
];

// ---------------- committee screening brief (AI with a transparent local fallback) ----------------
export async function assist(user, id) {
  const d = S.detail(user, id);
  if (!d.can.assist) throw new K.Forbidden(d.relation.owner ? 'تعارض مصالح: لا يمكنك استخدام أداة الفرز على فكرتك' : 'أداة الفرز لأعضاء لجنة تقييم الأفكار أثناء الفرز والتقييم');
  const similar = S.similarIdeas(user, `${d.title} ${d.problem}`, { exclude: d.id, limit: 3 });
  const checks = [
    { key: 'problem', ok: K.clean(d.problem).length >= 80, ar: 'وصف المشكلة مفصّل وواضح', en: 'Problem is described in detail' },
    { key: 'solution', ok: K.clean(d.solution).length >= 80, ar: 'الحل المقترح محدد وقابل للتنفيذ', en: 'Solution is specific' },
    { key: 'impact', ok: (d.impact.saving || 0) > 0 || (d.impact.hours || 0) > 0, ar: 'الأثر المتوقع مقدّر بالأرقام', en: 'Impact is quantified' },
    { key: 'alignment', ok: !!d.objective, ar: 'مرتبطة بهدف استراتيجي', en: 'Linked to a strategic objective' },
    { key: 'duplicates', ok: !similar.some((s) => s.similarity >= 45), ar: 'لا توجد فكرة قائمة شديدة التشابه', en: 'No closely similar idea exists' },
  ];
  const missing = checks.filter((c) => !c.ok);
  const questions = [];
  if (!checks[0].ok) questions.push('ما حجم المشكلة اليوم (عدد المعاملات أو الوقت المستغرق)؟');
  if (!checks[1].ok) questions.push('ما الخطوات العملية للتنفيذ ومن الجهات المعنية؟');
  if (!checks[2].ok) questions.push('ما الوفر المالي أو الساعات المتوقع توفيرها سنوياً؟');
  if (!checks[3].ok) questions.push('بأي هدف استراتيجي ترتبط الفكرة؟');
  if (!checks[4].ok) questions.push(`ما الفرق بين الفكرة و«${similar[0].title}»؟`);
  const local = {
    mode: 'local',
    label_ar: 'تحليل محلي — نموذج الذكاء الاصطناعي غير متصل', label_en: 'Local analysis — AI model not connected',
    summary_ar: `${missing.length ? `اكتمل ${checks.length - missing.length} من ${checks.length} معايير الفرز. ينقص: ${missing.map((m) => m.ar).join('، ')}.` : 'الفكرة مكتملة وفق معايير الفرز الخمسة ويمكن إحالتها للتقييم.'}${similar.length ? ` توجد ${similar.length} فكرة مشابهة يجدر مقارنتها.` : ''}`,
    summary_en: missing.length ? `${checks.length - missing.length} of ${checks.length} screening checks passed.` : 'All five screening checks passed.',
    checks, similar, questions,
    method_ar: 'قواعد ثابتة: طول الوصف، وجود أرقام للأثر، ربط بهدف استراتيجي، وتشابه الكلمات (معامل جاكارد) مع الأفكار القائمة.',
  };
  if (!K.aiAllowed(user, S.DOMAIN)) return { ...local, label_ar: 'تحليل محلي — سياسة البيانات لا تسمح بإرسال المحتوى للنموذج', label_en: 'Local analysis — data policy keeps this content away from the model' };
  try {
    const out = await complete({
      capability: 'analyze', user, maxTokens: 700,
      system: 'أنت مساعد لجنة تقييم الأفكار في جهة حكومية إماراتية. اكتب ملخص فرز موجزاً بالعربية في نقاط: جوهر الفكرة، نقاط القوة، المخاطر، المعلومات الناقصة، وأسئلة مقترحة لمقدّم الفكرة. لا تقترح درجات ولا قراراً، ولا تفترض أرقاماً غير واردة.',
      messages: [{ role: 'user', content: `العنوان: ${d.title}\nالفئة: ${cat(d.category)}\nالمشكلة: ${d.problem}\nالحل المقترح: ${d.solution}\nالأثر المتوقع: وفر ${d.impact.saving ?? 'غير محدد'} درهم سنوياً، ${d.impact.hours ?? 'غير محدد'} ساعة سنوياً\nالهدف الاستراتيجي: ${d.objective?.title_ar || 'غير محدد'}\nأفكار مشابهة قائمة: ${similar.map((s) => s.title).join('؛ ') || 'لا يوجد'}` }],
    });
    const text = String(out.text || '').trim();
    if (!text) return local;
    return { ...local, mode: 'ai', label_ar: `ملخص بالذكاء الاصطناعي (${out.model || out.provider}) — راجِعه قبل الاعتماد عليه`, label_en: `AI summary (${out.model || out.provider}) — review before relying on it`, text };
  } catch (e) {
    if (e.local) return local;
    return { ...local, label_ar: 'تحليل محلي — تعذّر الوصول إلى نموذج الذكاء الاصطناعي', label_en: 'Local analysis — the AI model could not be reached' };
  }
}
