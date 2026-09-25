// Surveys — aggregation and privacy rules (pure functions, no database access).
//
// Everything leaving this module is an AGGREGATE:
//  * a survey's results are shown only when at least MIN_GROUP responses are released;
//  * a question with fewer than MIN_GROUP answers is suppressed;
//  * department segments are shown only for groups of ≥ MIN_GROUP responses, with
//    secondary suppression so a hidden group can never be derived by subtraction
//    (total − shown groups); suppressed groups are merged into one "other" group
//    only when that merged group itself reaches MIN_GROUP;
//  * open-text answers are summarised into themes and keywords; a keyword is only
//    reported when it appears in at least two different answers.
export const MIN_GROUP = 5;

export const TYPES = ['single', 'multi', 'rating', 'nps', 'text', 'yesno'];
export const NUMERIC_TYPES = ['rating', 'nps', 'yesno'];

const TASHKEEL = /[ً-ْـٰ]/g;
export function norm(s) {
  return String(s || '').replace(TASHKEEL, '').replace(/[أإآٱ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').toLowerCase();
}
const round1 = (n) => (n == null || !Number.isFinite(n) ? null : Math.round(n * 10) / 10);
const pctOf = (k, n) => (n ? Math.round((1000 * k) / n) / 10 : 0);

// ---------------------------------------------------------------- per question
// answers: [{ response_id, num, text, choices }] for ONE question (released responses only)
export function aggregateQuestion(q, answers, { includeComments = false } = {}) {
  const base = { id: q.id, type: q.type, text: q.text, section_id: q.section_id, position: q.position, required: !!q.required, n: answers.length };
  if (answers.length < MIN_GROUP) return { ...base, suppressed: true };
  const n = answers.length;
  switch (q.type) {
    case 'single': case 'multi': {
      const counts = new Map((q.options || []).map((o) => [o.id, 0]));
      for (const a of answers) for (const c of parseChoices(a.choices)) if (counts.has(c)) counts.set(c, counts.get(c) + 1);
      const options = (q.options || []).map((o) => ({ id: o.id, label: o.label, count: counts.get(o.id) || 0, pct: pctOf(counts.get(o.id) || 0, n) }));
      const top = [...options].sort((a, b) => b.count - a.count)[0] || null;
      return { ...base, options, top: top && top.count ? { id: top.id, label: top.label, pct: top.pct } : null };
    }
    case 'rating': {
      const dist = [1, 2, 3, 4, 5].map((v) => ({ value: v, count: 0 }));
      let sum = 0;
      for (const a of answers) { const v = Math.round(a.num); if (v >= 1 && v <= 5) { dist[v - 1].count++; sum += v; } }
      dist.forEach((d) => { d.pct = pctOf(d.count, n); });
      const fav = dist[3].count + dist[4].count; const unfav = dist[0].count + dist[1].count;
      return { ...base, avg: round1(sum / n), favourable: pctOf(fav, n), neutral: pctOf(dist[2].count, n), unfavourable: pctOf(unfav, n), dist };
    }
    case 'nps': {
      const dist = Array.from({ length: 11 }, (_, v) => ({ value: v, count: 0 }));
      let sum = 0;
      for (const a of answers) { const v = Math.round(a.num); if (v >= 0 && v <= 10) { dist[v].count++; sum += v; } }
      dist.forEach((d) => { d.pct = pctOf(d.count, n); });
      const promoters = dist.slice(9).reduce((s, d) => s + d.count, 0);
      const passives = dist.slice(7, 9).reduce((s, d) => s + d.count, 0);
      const detractors = dist.slice(0, 7).reduce((s, d) => s + d.count, 0);
      return { ...base, nps: Math.round((100 * (promoters - detractors)) / n), avg: round1(sum / n),
        promoters: { count: promoters, pct: pctOf(promoters, n) }, passives: { count: passives, pct: pctOf(passives, n) }, detractors: { count: detractors, pct: pctOf(detractors, n) }, dist };
    }
    case 'yesno': {
      const yes = answers.filter((a) => a.num === 1).length;
      return { ...base, yes: { count: yes, pct: pctOf(yes, n) }, no: { count: n - yes, pct: pctOf(n - yes, n) } };
    }
    case 'text': {
      const texts = answers.map((a) => String(a.text || '').trim()).filter(Boolean);
      const out = { ...base, n: texts.length };
      if (texts.length < MIN_GROUP) return { ...out, suppressed: true };
      out.analysis = themesOf(texts);
      // Verbatim comments only for the survey's own authors, pooled and ordered by a
      // content hash (never by submission time) — no department, date or id.
      if (includeComments) out.comments = [...texts].sort((a, b) => hash(a) - hash(b));
      return out;
    }
    default: return base;
  }
}
export function parseChoices(s) {
  if (Array.isArray(s)) return s;
  try { const v = JSON.parse(s || '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
}
function hash(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h; }

// Single numeric metric of a question for a group of answers (segments & highlights).
export function metricOf(q, answers) {
  if (answers.length < MIN_GROUP) return null;
  if (q.type === 'rating') return round1(answers.reduce((s, a) => s + (a.num || 0), 0) / answers.length);
  if (q.type === 'nps') { const p = answers.filter((a) => a.num >= 9).length; const d = answers.filter((a) => a.num <= 6).length; return Math.round((100 * (p - d)) / answers.length); }
  if (q.type === 'yesno') return pctOf(answers.filter((a) => a.num === 1).length, answers.length);
  return null;
}

// ---------------------------------------------------------------- whole survey
// responses: [{ id, dept_id }] released; answers: [{ response_id, question_id, num, text, choices }]
// departments: [{ id, name_ar, name_en }] — the audience's departments (all are listed so
// that a hidden group never reveals whether it had answers).
export function computeResults({ questions, sections, responses, answers, departments = [], includeComments = false, includeSegments = true }) {
  const n = responses.length;
  const out = { min_group: MIN_GROUP, responses: n, hidden: n < MIN_GROUP };
  if (out.hidden) return out;
  const byQ = new Map(questions.map((q) => [q.id, []]));
  for (const a of answers) byQ.get(a.question_id)?.push(a);
  out.questions = questions.map((q) => aggregateQuestion(q, byQ.get(q.id) || [], { includeComments }));
  out.sections = sections.map((s) => ({ id: s.id, title: s.title, description: s.description, position: s.position }));
  out.highlights = highlights(out.questions);
  if (includeSegments) out.segments = segmentByDepartment({ questions, responses, answers, departments });
  return out;
}

// Strengths / improvement areas from rating questions (overall aggregates only).
function highlights(qs) {
  const rated = qs.filter((q) => q.type === 'rating' && !q.suppressed).sort((a, b) => b.avg - a.avg);
  return { strengths: rated.slice(0, 2).map(pick), improve: rated.length > 2 ? rated.slice(-2).reverse().map(pick) : rated.length === 2 ? [pick(rated[1])] : [] };
  function pick(q) { return { id: q.id, text: q.text, avg: q.avg, favourable: q.favourable }; }
}

// Department segmentation with primary (< MIN_GROUP) and secondary suppression.
export function segmentByDepartment({ questions, responses, answers, departments }) {
  const numeric = questions.filter((q) => NUMERIC_TYPES.includes(q.type));
  const counts = new Map();
  for (const r of responses) counts.set(r.dept_id, (counts.get(r.dept_id) || 0) + 1);
  const deptIds = [...new Set([...departments.map((d) => d.id), ...counts.keys()])];
  const shown = new Set(deptIds.filter((d) => (counts.get(d) || 0) >= MIN_GROUP));
  const hiddenTotal = () => deptIds.filter((d) => !shown.has(d)).reduce((s, d) => s + (counts.get(d) || 0), 0);
  // Secondary suppression: a lone small hidden remainder could be computed as
  // total − shown groups, so hide the smallest shown group until the remainder
  // is either empty or itself large enough to publish as a combined group.
  while (hiddenTotal() > 0 && hiddenTotal() < MIN_GROUP && shown.size) {
    const smallest = [...shown].sort((a, b) => counts.get(a) - counts.get(b))[0];
    shown.delete(smallest);
  }
  const respDept = new Map(responses.map((r) => [r.id, r.dept_id]));
  const groupAnswers = (pred) => {
    const m = new Map(numeric.map((q) => [q.id, []]));
    for (const a of answers) if (m.has(a.question_id) && pred(respDept.get(a.response_id))) m.get(a.question_id).push(a);
    return m;
  };
  const metrics = (m) => Object.fromEntries(numeric.map((q) => [q.id, metricOf(q, m.get(q.id))]));
  const name = (id) => departments.find((d) => d.id === id) || { id, name_ar: '—', name_en: '—' };
  const rows = deptIds.map((id) => {
    const d = name(id);
    if (!shown.has(id)) return { id, name_ar: d.name_ar, name_en: d.name_en, hidden: true };
    return { id, name_ar: d.name_ar, name_en: d.name_en, hidden: false, n: counts.get(id), metrics: metrics(groupAnswers((x) => x === id)) };
  }).sort((a, b) => Number(a.hidden) - Number(b.hidden) || String(a.name_ar).localeCompare(String(b.name_ar), 'ar'));
  const rest = hiddenTotal();
  const other = shown.size && rest >= MIN_GROUP ? { n: rest, metrics: metrics(groupAnswers((x) => !shown.has(x))) } : null;
  const overall = metrics(groupAnswers(() => true));
  return {
    questions: numeric.map((q) => ({ id: q.id, type: q.type, text: q.text })),
    rows, other, overall, shown_groups: shown.size,
    note_ar: `تُعرض الإدارة فقط إذا بلغت إجاباتها ${MIN_GROUP} أو أكثر؛ وإلا تظهر «أقل من ${MIN_GROUP} — مخفي لحماية الخصوصية».`,
    note_en: `A department is shown only with ${MIN_GROUP}+ responses; otherwise “fewer than ${MIN_GROUP} — hidden to protect privacy”.`,
  };
}

// ---------------------------------------------------------------- open text: themes
const THEMES = [
  { key: 'systems', ar: 'الأنظمة والتقنية', en: 'Systems & technology', words: ['نظام', 'انظمه', 'تقني', 'شبكه', 'انترنت', 'حاسوب', 'اجهزه', 'جهاز', 'برنامج', 'تطبيق', 'بوابه', 'منصه', 'الدعم الفني', 'دعم فني', 'طابعه', 'system', 'network', 'laptop', 'software', 'portal', 'it support'] },
  { key: 'development', ar: 'التدريب والتطوير', en: 'Learning & development', words: ['تدريب', 'دوره', 'دورات', 'تطوير', 'تعلم', 'مهارات', 'مسار', 'ورشه', 'ورش', 'training', 'course', 'learning', 'skills', 'career'] },
  { key: 'communication', ar: 'التواصل والشفافية', en: 'Communication & transparency', words: ['تواصل', 'التواصل', 'معلومات', 'شفاف', 'وضوح', 'واضح', 'ابلاغ', 'تعميم', 'قرارات', 'اولويات', 'communication', 'transparen', 'inform', 'clarity'] },
  { key: 'workload', ar: 'عبء العمل والتوازن', en: 'Workload & balance', words: ['ضغط', 'عبء', 'ساعات', 'توازن', 'اجازه', 'مرونه', 'عن بعد', 'دوام', 'ارهاق', 'workload', 'balance', 'flexib', 'remote', 'overtime'] },
  { key: 'recognition', ar: 'التقدير والحوافز', en: 'Recognition & rewards', words: ['تقدير', 'مكافا', 'حوافز', 'حافز', 'ترقيه', 'تكريم', 'ثناء', 'recognition', 'reward', 'incentive', 'promotion'] },
  { key: 'process', ar: 'الإجراءات والموافقات', en: 'Processes & approvals', words: ['اجراء', 'اجراءات', 'موافقات', 'موافقه', 'اعتماد', 'معامله', 'معاملات', 'ورقي', 'روتين', 'توقيع', 'تبسيط', 'process', 'approval', 'paperwork', 'bureaucra'] },
  { key: 'facilities', ar: 'بيئة العمل والمرافق', en: 'Workplace & facilities', words: ['مكتب', 'مكاتب', 'قاعه', 'قاعات', 'تكييف', 'اضاءه', 'مواقف', 'مرافق', 'مقاعد', 'ضوضاء', 'الطابق', 'office', 'room', 'parking', 'facilit'] },
  { key: 'service', ar: 'سرعة الخدمة والاستجابة', en: 'Service speed & response', words: ['استجابه', 'سرعه', 'سريع', 'بطء', 'بطيء', 'تاخير', 'تاخر', 'يتاخر', 'انتظار', 'حاله الطلب', 'response', 'speed', 'fast', 'slow', 'delay', 'waiting'] },
  { key: 'leadership', ar: 'القيادة والإدارة', en: 'Leadership & management', words: ['مدير', 'المدير', 'قياده', 'توجيه', 'متابعه', 'الاداره العليا', 'manager', 'leadership', 'management'] },
];
const POSITIVE = ['ممتاز', 'رايع', 'جيد', 'جيده', 'متعاون', 'شكرا', 'افضل', 'تحسن', 'مرضي', 'سهل', 'مفيد', 'متميز', 'excellent', 'great', 'good', 'helpful', 'thank'];
const NEGATIVE = ['بطء', 'بطيء', 'ضعف', 'ضعيف', 'تاخير', 'يتاخر', 'تاخر', 'صعب', 'صعوبه', 'مشكله', 'مشاكل', 'نقص', 'لا يوجد', 'قليل', 'غير واضح', 'تعقيد', 'معقد', 'سيء', 'ازدحام', 'slow', 'poor', 'delay', 'hard', 'problem', 'lack', 'bad'];
const STOP = new Set(['في', 'من', 'علي', 'الي', 'عن', 'مع', 'هذا', 'هذه', 'ذلك', 'التي', 'الذي', 'ان', 'او', 'كان', 'لا', 'ما', 'هو', 'هي', 'كل', 'بعض', 'جدا', 'ايضا', 'قد', 'لقد', 'تم', 'عند', 'حتي', 'لكن', 'اكثر', 'اقل', 'نحتاج', 'احيانا', 'يكون', 'لكل', 'غير', 'عبر', 'بين', 'خلال', 'the', 'and', 'for', 'with', 'that', 'this', 'are', 'but', 'more', 'our', 'have', 'need']);
const stem = (w) => w.replace(/^(وال|بال|فال|كال|لل|ال|و)(?=\S{3,})/, '');

export function themesOf(texts) {
  const n = texts.length;
  const docs = texts.map((t) => ` ${norm(t).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ')} `);
  const themes = THEMES.map((t) => ({ key: t.key, ar: t.ar, en: t.en, mentions: 0, positive: 0, negative: 0 }));
  const hits = []; let pos = 0; let neg = 0;
  for (const d of docs) {
    const p = POSITIVE.filter((w) => d.includes(w)).length; const q = NEGATIVE.filter((w) => d.includes(w)).length;
    const tone = p > q ? 'positive' : q > p ? 'negative' : null;
    if (tone === 'positive') pos++; else if (tone === 'negative') neg++;
    const mine = new Set();
    THEMES.forEach((t, i) => {
      if (!t.words.some((w) => d.includes(w))) return;
      mine.add(t.key); themes[i].mentions++; if (tone) themes[i][tone]++;
    });
    hits.push(mine);
  }
  // A theme mentioned by a single answer is folded into "other" so no single
  // comment's topic is singled out.
  const shown = themes.filter((t) => t.mentions >= 2)
    .map((t) => ({ ...t, pct: pctOf(t.mentions, n), tone: t.positive > t.negative ? 'positive' : t.negative > t.positive ? 'negative' : 'mixed' }))
    .sort((a, b) => b.mentions - a.mentions);
  const keys = new Set(shown.map((t) => t.key));
  const other = hits.filter((m) => ![...m].some((k) => keys.has(k))).length;
  const df = new Map();
  for (const d of docs) for (const w of new Set(d.trim().split(' ').map(stem).filter((x) => x.length >= 3 && !STOP.has(x) && !/^\d+$/.test(x)))) df.set(w, (df.get(w) || 0) + 1);
  const keywords = [...df].filter(([, c]) => c >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 8).map(([word, count]) => ({ word, count }));
  return { n, themes: shown, other, keywords, sentiment: { positive: pos, negative: neg, neutral: n - pos - neg } };
}

// Deterministic narrative built from the aggregated themes only.
export function localNarrative(a) {
  if (!a || !a.n) return { ar: '', en: '' };
  const top = a.themes.slice(0, 3);
  const toneAr = { positive: 'غالبها إيجابي', negative: 'غالبها ملاحظات للتحسين', mixed: 'آراء متباينة' };
  const toneEn = { positive: 'mostly positive', negative: 'mostly improvement points', mixed: 'mixed views' };
  const ar = top.length
    ? `من ${a.n} تعليقاً، تكررت المحاور التالية: ${top.map((t) => `${t.ar} (${t.mentions} إشارات، ${toneAr[t.tone]})`).join('، ')}.`
    : `من ${a.n} تعليقاً، لم يتكرر محور واحد في أكثر من تعليق؛ الآراء متنوعة.`;
  const en = top.length
    ? `Across ${a.n} comments, recurring themes: ${top.map((t) => `${t.en} (${t.mentions} mentions, ${toneEn[t.tone]})`).join('; ')}.`
    : `Across ${a.n} comments no theme recurred in more than one answer; views are diverse.`;
  const s = a.sentiment;
  return {
    ar: `${ar} الانطباع العام: ${s.positive} إيجابي، ${s.negative} يطلب تحسيناً، ${s.neutral} محايد.`,
    en: `${en} Overall tone: ${s.positive} positive, ${s.negative} asking for improvement, ${s.neutral} neutral.`,
  };
}
