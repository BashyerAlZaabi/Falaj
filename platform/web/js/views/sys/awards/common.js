// Awards — shared UI helpers: API, labels, medallions, the three-stage
// programme track, chips, people rows and focus-preserving soft re-renders.
import { h, icon, L, fmtDate, fmtNum, getLang, sysApi, avatar, confidentialBanner } from '../../../sys-kit.js';
import { emit } from '../../../state.js';

export const call = sysApi('awards');
export const refresh = () => emit('data-changed', { entity: 'sys:awards' });
export const href = (...parts) => `#/sys/awards/${parts.filter((p) => p != null && p !== '').join('/')}`;

// ---------------- labels ----------------
export const P_STATUS = {
  draft: ['مسودة', 'Draft', 'outline', 'pencil'],
  nominations: ['باب الترشيح مفتوح', 'Nominations open', 'good', 'circleDot'],
  evaluation: ['قيد التقييم', 'Under evaluation', 'navy', 'scale'],
  announced: ['أُعلنت النتائج', 'Results announced', 'sand', 'trophy'],
  cancelled: ['ملغى', 'Cancelled', 'outline', 'ban'],
};
export const N_STATUS = {
  awaiting_consent: ['بانتظار موافقة المرشح', 'Awaiting consent', 'warn', 'hourglass'],
  submitted: ['مُقدَّم', 'Submitted', 'info', 'send'],
  declined: ['اعتذر المرشح', 'Declined', 'outline', 'x'],
  withdrawn: ['مسحوب', 'Withdrawn', 'outline', 'undo'],
  lapsed: ['انتهت المهلة', 'Lapsed', 'outline', 'clockAlert'],
  in_evaluation: ['قيد التقييم', 'Under evaluation', 'navy', 'scale'],
  winner: ['فائز', 'Winner', 'sand', 'trophy'],
  not_selected: ['لم يُختر هذه الدورة', 'Not selected', 'outline', 'circleDot'],
};
export const KIND_ICON = { excellence: 'award', team: 'usersRound', innovation: 'lightbulb', leadership: 'crown' };
export const KIND = { excellence: ['التميز الفردي', 'Individual excellence'], team: ['الفرق', 'Teams'], innovation: ['الابتكار', 'Innovation'], leadership: ['القيادة', 'Leadership'] };
export const ELIG = { employees: ['الموظفون (غير الإداريين)', 'Employees (non-managers)'], managers: ['القيادات (المديرون)', 'Leaders (managers)'], all_staff: ['جميع موظفي الجهة', 'All staff'], team: ['فرق العمل', 'Teams'] };
export const NKIND = { self: ['ترشيح ذاتي', 'Self-nomination'], colleague: ['ترشيح من زميل', 'By a colleague'], manager: ['ترشيح من المدير', 'By a manager'] };
export const RECUSAL = {
  self: ['أنت المرشح في هذا الترشيح', 'You are the nominee'],
  nominator: ['أنت من قدّم هذا الترشيح', 'You submitted this nomination'],
  department: ['المرشح من إدارتك', 'The nominee is from your department'],
  declared: ['أعلنت تعارض مصالح', 'You declared a conflict of interest'],
};
export const LEVEL = [['ضعيف', 'Weak'], ['مقبول', 'Fair'], ['جيد', 'Good'], ['جيد جداً', 'Very good'], ['متميز', 'Outstanding']];
export const EVENT = {
  created: ['قُدّم الترشيح', 'Nomination submitted', 'send'],
  consented: ['وافق المرشح', 'Nominee consented', 'circleCheck', 'good'],
  declined: ['اعتذر المرشح', 'Nominee declined', 'circleX'],
  withdrawn: ['سُحب الترشيح', 'Nomination withdrawn', 'undo'],
  excellence: ['أُرفق ملخص نقاط التميّز', 'Excellence summary attached', 'sparkle'],
  excellence_removed: ['أُزيل ملخص نقاط التميّز', 'Excellence summary removed', 'minus'],
  evaluation: ['أُحيل إلى لجنة الجوائز', 'Sent to the awards committee', 'scale'],
  lapsed: ['أُغلق باب الترشيح قبل الموافقة', 'Nominations closed before consent', 'clockAlert'],
  winner: ['أُعلن فائزاً', 'Announced as winner', 'trophy', 'emph'],
  not_selected: ['صدرت النتائج', 'Results published', 'flag'],
};

export const statusOf = (map, s) => map[s] || [s, s, 'outline'];
export function chip(map, s, extra = '') {
  const [ar, en, tone, ic] = statusOf(map, s);
  return h(`span.chip.tiny.${tone}${extra}`, ic ? icon(ic) : null, L(ar, en));
}
export const demoChip = (x) => (x?.is_demo ? h('span.chip.tiny.demo', { 'data-tip': L('بيانات تجريبية', 'Demo data') }, L('تجريبي', 'Demo')) : null);
export const nm = (x) => (x ? L(x.name_ar, x.name_en || x.name_ar) : '—');
export const dept = (u) => (u ? L(u.dept_ar || '', u.dept_en || u.dept_ar || '') : '');
export const title = (u) => (u ? L(u.title_ar || '', u.title_en || u.title_ar || '') : '');
export const num = (v) => h('span.num.tabular', typeof v === 'number' ? fmtNum(v) : v);
export const score = (v, d = 2) => (v == null ? '—' : Number(v).toLocaleString(getLang() === 'ar' ? 'ar-AE' : 'en-US', { minimumFractionDigits: d, maximumFractionDigits: d }));

export function daysText(n, { verb = 'close' } = {}) {
  if (n == null) return '';
  if (n < 0) return L('انتهت المدة', 'Ended');
  if (n === 0) return verb === 'close' ? L('يغلق اليوم', 'Closes today') : L('ينتهي اليوم', 'Ends today');
  if (getLang() === 'en') return `${n} ${n === 1 ? 'day' : 'days'} left`;
  if (n === 1) return 'متبقٍ يوم واحد';
  if (n === 2) return 'متبقٍ يومان';
  return `متبقٍ ${fmtNum(n)} ${n <= 10 ? 'أيام' : 'يوماً'}`;
}
export function count(n, [one, two, few, many], en) {
  if (getLang() === 'en') return `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`;
  if (n === 1) return one;
  if (n === 2) return two;
  return `${fmtNum(n)} ${n >= 3 && n <= 10 ? few : many}`;
}

// ---------------- visuals ----------------
export const medal = (kind, size = 'md') => h(`span.aw-medal.${size}.k-${kind || 'excellence'}`, { 'aria-hidden': 'true' }, icon(KIND_ICON[kind] || 'award'));
export function person(u, { sub = true, size } = {}) {
  if (!u) return h('span.faint', '—');
  return h(`div.aw-person${size ? '.' + size : ''}`, avatar(u.name_ar), h('div.aw-person-text', h('strong', nm(u)), sub ? h('span', [title(u), dept(u)].filter(Boolean).join(' · ')) : null));
}
export function teamStack(team = [], max = 4) {
  return h('span.aw-stack', { 'aria-label': team.map(nm).join('، ') }, team.slice(0, max).map((u) => avatar(u.name_ar)), team.length > max ? h('span.aw-stack-more', `+${team.length - max}`) : null);
}
export const back = (to, label) => h('a.aw-back', { href: to }, icon('chevron', 'aw-back-ic'), label);

// Three-stage programme track: nominations → evaluation → announcement, with progress inside the current stage.
const todayIso = () => new Date().toISOString().slice(0, 10);
const frac = (from, to) => { const t = Date.parse(todayIso()); const a = Date.parse(from); const b = Date.parse(to); if (!(b > a)) return t >= b ? 1 : 0; return Math.max(0, Math.min(1, (t - a) / (b - a))); };
export function phaseTrack(p, { tone } = {}) {
  const stage = p.status === 'announced' ? 3 : p.status === 'evaluation' ? 1 : p.status === 'nominations' ? 0 : -1;
  const steps = [
    { ar: 'الترشيح', en: 'Nominations', from: p.nomination_opens, to: p.nomination_closes, range: true },
    { ar: 'تقييم اللجنة', en: 'Committee review', from: p.nomination_closes, to: p.evaluation_closes, range: true },
    { ar: 'إعلان الفائزين', en: 'Winners announced', from: p.evaluation_closes, to: p.announce_on },
  ];
  return h(`ol.aw-track${tone ? '.' + tone : ''}`, { 'aria-label': L('مراحل البرنامج', 'Programme stages') }, steps.map((s, i) => {
    const state = stage === 3 || i < stage ? 'done' : i === stage ? 'current' : 'todo';
    const fill = state === 'done' ? 100 : state === 'current' ? Math.round(frac(s.from, s.to) * 100) : 0;
    const when = s.range ? `${fmtDate(s.from)} – ${fmtDate(s.to)}` : (p.status === 'announced' && p.announced_at ? fmtDate(p.announced_at) : fmtDate(s.to));
    return h(`li.${state}`, { 'aria-current': state === 'current' ? 'step' : null },
      h('div.aw-track-bar', { 'aria-hidden': 'true' }, h('i', { style: { width: `${fill}%` } })),
      h('div.aw-track-label', h('strong', state === 'done' ? icon('check') : null, L(s.ar, s.en)), h('span', when)));
  }));
}

export const restricted = () => confidentialBanner('الترشيحات والتقييمات سرية للغاية حتى إعلان النتائج: يراها مقدّم الترشيح والمرشح فقط، وتطّلع عليها اللجنة أثناء التقييم. الدرجات لا تُنشر أبداً.',
  'Nominations and scores are restricted until results are announced: only the nominator and nominee see them, the committee during evaluation. Scores are never published.', { level: 'restricted' });

export const eligible = (p, u) => !!u && u.role !== 'president' && (p.eligibility === 'employees' ? u.role === 'employee' : p.eligibility === 'managers' ? u.role === 'manager' : true);

// Soft re-renders rebuild the page; keep the caret where the user was typing.
export function captureFocus() {
  const a = document.activeElement;
  const key = a?.dataset?.fk;
  if (!key) return () => {};
  const sel = typeof a.selectionStart === 'number' ? [a.selectionStart, a.selectionEnd] : null;
  return (root) => setTimeout(() => {
    const el = root.querySelector(`[data-fk="${CSS.escape(key)}"]`);
    if (!el) return;
    el.focus({ preventScroll: true });
    if (sel && typeof el.setSelectionRange === 'function') try { el.setSelectionRange(...sel); } catch { /* not a text field */ }
  }, 0);
}

export function kv(rows) {
  return h('dl.sys-kv', rows.filter(Boolean).flatMap(([k, v]) => [h('dt', k), h('dd', v)]));
}
export const eyebrow = (text, ic) => h('span.aw-eyebrow', ic ? icon(ic) : null, text);
