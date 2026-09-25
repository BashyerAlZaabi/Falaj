// Surveys — shared UI helpers (labels, chips, time left, rings, focus keeping).
import { sysApi, h, icon, L, fmtNum, fmtDate, getLang, statusChip } from '../../../sys-kit.js';

export const call = sysApi('surveys');
export const MIN_GROUP = 5;

export const STATUS = {
  draft: ['مسودة', 'Draft', 'outline', 'pencil'],
  published: ['مفتوح', 'Open', 'good', 'circlePlay'],
  scheduled: ['مجدول', 'Scheduled', 'sand', 'calendarClock'],
  closed: ['مغلق', 'Closed', 'navy', 'lock'],
};
export const statusOf = (s) => (s.scheduled ? 'scheduled' : s.status);
export const surveyStatus = (s) => statusChip(statusOf(s), STATUS);

export const TYPES = {
  single: { ar: 'اختيار واحد', en: 'Single choice', icon: 'circleDot', dar: 'يختار المشارك خياراً واحداً من قائمة', den: 'Pick one option from a list' },
  multi: { ar: 'اختيار متعدد', en: 'Multiple choice', icon: 'listChecks', dar: 'يختار المشارك كل ما ينطبق', den: 'Pick every option that applies' },
  rating: { ar: 'تقييم من 1 إلى 5', en: 'Rating 1–5', icon: 'star', dar: 'مقياس رضا من خمس درجات', den: 'A five-point satisfaction scale' },
  nps: { ar: 'مؤشر صافي الترويج', en: 'Net Promoter Score', icon: 'gauge', dar: 'احتمال التوصية من 0 إلى 10', den: 'Likelihood to recommend, 0–10' },
  yesno: { ar: 'نعم / لا', en: 'Yes / No', icon: 'thumbsUp', dar: 'سؤال بإجابة ثنائية', den: 'A two-way answer' },
  text: { ar: 'نص مفتوح', en: 'Open text', icon: 'messageSquare', dar: 'رأي بكلمات المشارك — يُلخَّص في محاور', den: 'Comments in their own words — summarised as themes' },
};
export const typeChip = (t) => h('span.chip.tiny.outline.sv-type', icon(TYPES[t]?.icon || 'info'), L(TYPES[t]?.ar || t, TYPES[t]?.en || t));

export const RATING_LABELS = [
  ['غير راضٍ إطلاقاً', 'Very dissatisfied'], ['غير راضٍ', 'Dissatisfied'], ['محايد', 'Neutral'], ['راضٍ', 'Satisfied'], ['راضٍ جداً', 'Very satisfied'],
];

export function anonChip(s, { tiny = true } = {}) {
  return s.anonymous
    ? h(`span.chip${tiny ? '.tiny' : ''}.navy.sv-anon`, { 'data-tip': L('لا تُحفظ هويتك مع إجاباتك', 'Your identity is not stored with your answers') }, icon('eyeOff'), L('مجهول الهوية', 'Anonymous'))
    : h(`span.chip${tiny ? '.tiny' : ''}.warn.sv-anon`, { 'data-tip': L('تُحفظ الإجابة مرتبطة باسم المشارك', 'Answers are stored with the respondent’s name') }, icon('user'), L('غير مجهول', 'Not anonymous'));
}
export const demoChip = (s) => (s.demo ? h('span.chip.tiny.demo', { 'data-tip': L('بيانات تجريبية للعرض', 'Demo data') }, L('تجريبي', 'Demo')) : null);

// Arabic counted nouns: [one, two, few (3–10), many (11+)]
export function countAr(n, [one, two, few, many]) {
  return n === 1 ? one : n === 2 ? two : n >= 3 && n <= 10 ? `${fmtNum(n)} ${few}` : `${fmtNum(n)} ${many}`;
}
export function count(n, ar, en) {
  return getLang() === 'ar' ? countAr(n, ar) : `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`;
}
export const questionsLabel = (n) => count(n, ['سؤال واحد', 'سؤالان', 'أسئلة', 'سؤالاً'], ['question', 'questions']);
export const minutesLabel = (n) => L(`نحو ${countAr(n, ['دقيقة', 'دقيقتين', 'دقائق', 'دقيقة'])}`, `about ${n} min`);
export function timeLeft(days) {
  if (days == null) return '';
  if (days < 0) return L('انتهت المدة', 'Ended');
  if (days === 0) return L('يُغلق اليوم', 'Closes today');
  return L(`يتبقى ${countAr(days, ['يوم واحد', 'يومان', 'أيام', 'يوماً'])}`, `${days} day${days === 1 ? '' : 's'} left`);
}
export function leftChip(s) {
  const d = s.days_left;
  const tone = d <= 1 ? 'warn' : d <= 3 ? 'sand' : 'outline';
  return h(`span.chip.tiny.${tone}`, icon('hourglass'), timeLeft(d));
}
export const dateLabel = (iso) => (iso ? fmtDate(iso) : '—');

// Ring (response rate, time remaining). value 0–100 or null.
export function ring(value, { size = 76, stroke = 7, label, sub, tone = 'accent' } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(100, value));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`); svg.setAttribute('width', size); svg.setAttribute('height', size); svg.setAttribute('aria-hidden', 'true');
  const mk = (cls, extra = {}) => { const e = document.createElementNS(NS, 'circle'); e.setAttribute('cx', size / 2); e.setAttribute('cy', size / 2); e.setAttribute('r', r); e.setAttribute('class', cls); for (const [k, x] of Object.entries(extra)) e.setAttribute(k, x); return e; };
  svg.append(mk('sv-ring-track'), mk('sv-ring-arc', { 'stroke-dasharray': `${(c * v) / 100} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  svg.querySelectorAll('circle').forEach((e) => e.setAttribute('stroke-width', stroke));
  return h(`div.sv-ring.${tone}`, { role: 'img', 'aria-label': `${label ?? ''} ${sub ?? ''}`.trim() || null, style: { width: `${size}px`, height: `${size}px` } }, svg,
    h('div.sv-ring-center', h('strong.num.tabular', label ?? (value == null ? '—' : `${fmtNum(Math.round(value))}%`)), sub ? h('small', sub) : null));
}

// Keep focus and caret across the platform's soft re-renders (the view is rebuilt
// whenever data changes): elements carry data-focus-key.
export function keepFocus() {
  const a = document.activeElement;
  const key = a?.dataset?.focusKey;
  if (!key) return () => {};
  const sel = typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  return (root) => requestAnimationFrame(() => {
    const el = root.querySelector(`[data-focus-key="${CSS.escape(key)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (sel && el.setSelectionRange) try { el.setSelectionRange(...sel); } catch { /* not a text field */ }
  });
}
export const errMsg = (e) => e?.message || L('تعذّر تنفيذ الإجراء', 'Action failed');
export const pctText = (v) => (v == null ? '—' : `${fmtNum(Math.round(v))}%`);
