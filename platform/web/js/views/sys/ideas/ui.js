// Ideas — shared view helpers: labels, chips, idea cards, formatting, module
// state that survives the platform's soft re-render, and small utilities.
import { h, icon, toast, act, L, fmtNum, fmtDate, getLang, statusChip, avatar, sysApi, money } from '../../../sys-kit.js';
import { loadGame, current as currentGame, celebrate } from '../../../game.js';

export const call = sysApi('ideas');

// Transient UI state (filters, committee view, open sheet, unsent comment drafts).
export const S = {
  bank: { q: '', category: '', status: '', campaign: '', sort: 'newest' },
  committeeView: 'board',
  sheet: null,
  drafts: {},
};

// [ar, en, icon]
export const CAT = {
  process: ['تبسيط الإجراءات', 'Process simplification', 'workflow'],
  digital: ['التحول الرقمي', 'Digital transformation', 'zap'],
  service: ['تجربة المتعاملين', 'Customer experience', 'faceHappy'],
  cost: ['كفاءة الإنفاق', 'Spending efficiency', 'coins'],
  people: ['بيئة العمل والموظفين', 'People & workplace', 'usersRound'],
  sustainability: ['الاستدامة', 'Sustainability', 'globe'],
  governance: ['الحوكمة والامتثال', 'Governance & compliance', 'scale'],
};
// [ar, en, tone, icon]
export const ST = {
  draft: ['مسودة', 'Draft', 'outline', 'pencil'],
  submitted: ['مقدّمة', 'Submitted', 'info', 'send'],
  screening: ['قيد الفرز', 'Screening', 'info', 'scanSearch'],
  evaluation: ['قيد التقييم', 'Evaluation', 'purple', 'scale'],
  needs_info: ['بحاجة لمعلومات', 'Needs info', 'warn', 'help'],
  approved: ['معتمدة', 'Approved', 'good', 'badgeCheck'],
  rejected: ['غير معتمدة', 'Not approved', 'outline', 'circleX'],
  in_implementation: ['قيد التنفيذ', 'In implementation', 'navy', 'rocket'],
  implemented: ['مُنفّذة', 'Implemented', 'good', 'trophy'],
  withdrawn: ['مسحوبة', 'Withdrawn', 'outline', 'undo'],
};
export const HAPPY = { low: ['أثر محدود', 'Low', 1], medium: ['أثر متوسط', 'Medium', 2], high: ['أثر كبير', 'High', 3] };
export const CRIT = {
  impact: ['الأثر', 'Impact', 'الوفر والوقت وسعادة المتعاملين المتوقعة', 'Expected savings, time and customer happiness'],
  feasibility: ['قابلية التطبيق', 'Feasibility', 'سهولة التنفيذ بالموارد والأنظمة الحالية', 'Ease of delivery with current resources and systems'],
  cost: ['الكلفة والجدوى', 'Cost-effectiveness', '٥ = كلفة منخفضة مقابل عائد مرتفع', '5 = low cost for high value'],
  alignment: ['المواءمة الاستراتيجية', 'Strategic alignment', 'ارتباط الفكرة بأهداف الخطة الاستراتيجية', 'Fit with the strategic plan'],
};
export const WEIGHTS = { impact: 0.35, feasibility: 0.25, cost: 0.2, alignment: 0.2 };
export const STEPS = [
  { ar: 'التقديم', en: 'Submitted' }, { ar: 'الفرز', en: 'Screening' }, { ar: 'التقييم', en: 'Evaluation' },
  { ar: 'الاعتماد', en: 'Decision' }, { ar: 'التنفيذ', en: 'Implementation' }, { ar: 'تحقق الأثر', en: 'Benefits' },
];
export function stepIndex(i) {
  const s = i.status;
  const map = { draft: 0, submitted: 1, screening: 1, evaluation: 2, approved: 4, in_implementation: 4, implemented: 6, rejected: 3 };
  if (s === 'needs_info' || s === 'withdrawn') {
    const from = (i.history || []).filter((x) => x.to === s).pop()?.from;
    return from === 'evaluation' ? 2 : from === 'submitted' ? 1 : 1;
  }
  return map[s] ?? 0;
}
export const stepFailed = (i) => ['rejected', 'withdrawn'].includes(i.status);

export const catLabel = (c) => (CAT[c] ? L(CAT[c][0], CAT[c][1]) : c);
export const stLabel = (s) => (ST[s] ? L(ST[s][0], ST[s][1]) : s);
export const chip = (s) => statusChip(s, ST);
export function catChip(c, { tiny = true } = {}) {
  const x = CAT[c] || [c, c, 'tag'];
  return h(`span.chip.idea-cat${tiny ? '.tiny' : ''}`, { 'data-cat': c }, icon(x[2]), L(x[0], x[1]));
}
export const demoChip = (on) => (on ? h('span.chip.demo.tiny', L('تجريبي', 'Demo')) : null);
export const num = (n, opts) => h('span.num.tabular', typeof n === 'number' ? fmtNum(n) : n, opts);
export const nbsp = ' ';
export function daysLabel(n) {
  if (getLang() === 'en') return `${fmtNum(n)} ${n === 1 ? 'day' : 'days'}`;
  if (n === 0) return 'اليوم';
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  return `${fmtNum(n)} ${n <= 10 ? 'أيام' : 'يوماً'}`;
}
export function countLabel(n, [one, two, few, many], en) {
  if (getLang() === 'en') return `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`;
  if (n === 1) return one;
  if (n === 2) return two;
  return `${fmtNum(n)} ${n <= 10 && n > 2 ? few : many}`;
}
export const votesLabel = (n) => countLabel(n, ['صوت واحد', 'صوتان', 'أصوات', 'صوتاً'], ['vote', 'votes']);
export const ideasLabel = (n) => countLabel(n, ['فكرة واحدة', 'فكرتان', 'أفكار', 'فكرة'], ['idea', 'ideas']);
export const compactMoney = (n) => {
  if (n == null) return '—';
  if (n >= 1e6) return `${fmtNum(Math.round(n / 1e5) / 10)} ${L('مليون د.إ', 'M AED')}`;
  if (n >= 1e3) return `${fmtNum(Math.round(n / 100) / 10)} ${L('ألف د.إ', 'K AED')}`;
  return money(n);
};
export function authorLine(i, { withDept = true } = {}) {
  if (i.author) {
    return h('span.idea-author', avatar(i.author.name_ar), h('span.grow', h('span.an', L(i.author.name_ar, i.author.name_en)),
      withDept && i.department ? h('span.ad', L(i.department.name_ar, i.department.name_en)) : null),
    i.author_hidden ? h('span.chip.tiny.outline', { 'data-tip': L('اسمك مخفي عن الزملاء — يظهر للجنة فقط', 'Hidden from colleagues — visible to the committee only') }, icon('eyeOff'), L('مخفي عن الزملاء', 'Hidden from peers')) : null);
  }
  return h('span.idea-author.anon', h('span.anon-ic', { 'aria-hidden': 'true' }, icon('eyeOff')), h('span.grow', h('span.an', L('مقدّم مجهول', 'Anonymous author')), withDept ? h('span.ad', L('اختار إخفاء اسمه عن الزملاء', 'Chose to stay anonymous')) : null));
}

// Vote pill: optimistic toggle, reverts on error. Owners see a disabled count.
export function voteButton(i, { size = 'sm', onChange } = {}) {
  const can = !i.mine && !['draft', 'withdrawn', 'rejected'].includes(i.status);
  const label = () => (i.my_vote ? L('إلغاء دعمك لهذه الفكرة', 'Remove your vote') : L('ادعم هذه الفكرة', 'Vote for this idea'));
  const count = h('span.num.tabular', fmtNum(i.votes));
  const btn = h(`button.vote-btn.${size}${i.my_vote ? '.on' : ''}`, {
    type: 'button', 'aria-pressed': String(!!i.my_vote), 'aria-label': `${label()} (${fmtNum(i.votes)})`, disabled: can ? null : true,
    'data-tip': can ? null : i.mine ? L('لا يمكنك التصويت لفكرتك', 'You cannot vote for your own idea') : L('التصويت مغلق', 'Voting closed'),
    onclick: async (e) => {
      e.stopPropagation();
      const on = !i.my_vote;
      i.my_vote = on; i.votes += on ? 1 : -1; paint();
      if (on) btn.classList.add('pop');
      const r = await act(null, () => call(`/ideas/${i.id}/vote`, { method: 'POST', body: { on } }));
      if (!r) { i.my_vote = !on; i.votes += on ? -1 : 1; paint(); return; }
      i.votes = r.votes; paint();
      onChange?.(r);
    },
  }, icon('thumbsUp'), count);
  function paint() { btn.classList.toggle('on', !!i.my_vote); btn.setAttribute('aria-pressed', String(!!i.my_vote)); btn.setAttribute('aria-label', `${label()} (${fmtNum(i.votes)})`); count.textContent = fmtNum(i.votes); }
  btn.addEventListener('animationend', () => btn.classList.remove('pop'));
  return btn;
}

// Gallery card. `open(id)` opens the idea sheet without a full route change.
export function ideaCard(i, { open, href, rank } = {}) {
  const o = (e) => { if (e.defaultPrevented || e.target.closest('button, a')) return; open(i.id); };
  const imp = i.status === 'implemented' && i.realized ? i.realized : i.impact;
  const impact = [
    imp.saving ? h('span.imp', icon('coins'), h('span', compactMoney(imp.saving), h('small', L('/سنة', '/yr')))) : null,
    imp.hours ? h('span.imp', icon('clock'), h('span', num(Math.round(imp.hours)), h('small', L(' ساعة/سنة', ' h/yr')))) : null,
  ].filter(Boolean);
  return h(`article.idea-card${i.mine ? '.mine' : ''}${rank ? '.trend' : ''}`, { 'data-cat': i.category, onclick: o },
    rank ? h('span.ic-rank.tabular', { 'aria-hidden': 'true' }, String(rank).padStart(2, '0')) : null,
    h('div.ic-top', catChip(i.category), chip(i.status)),
    h('h3.ic-title', h('a', { href: href(i.id), onclick: (e) => { e.preventDefault(); open(i.id); } }, rank ? h('span.sr-only', L(`المرتبة ${rank}: `, `Rank ${rank}: `)) : null, i.title)),
    i.summary ? h('p.ic-sum', i.summary) : null,
    impact.length ? h('div.ic-impact', { 'aria-label': L(i.status === 'implemented' ? 'الأثر المحقق' : 'الأثر المتوقع', i.status === 'implemented' ? 'Realised impact' : 'Expected impact') }, impact) : null,
    i.campaign ? h('div.ic-camp', icon('flag'), h('span', L(i.campaign.title_ar, i.campaign.title_en))) : null,
    h('div.ic-foot', authorLine(i, { withDept: true }),
      h('span.ic-meta', { 'aria-label': L(`${i.comments} تعليق`, `${i.comments} comments`) }, icon('messageSquare'), num(i.comments)),
      voteButton(i)));
}

// Keep keyboard focus (and caret) across the platform's soft re-render.
export function keepFocus(root) {
  const a = document.activeElement;
  const key = a?.dataset?.keep;
  if (!key) return () => {};
  const s = a.selectionStart; const e = a.selectionEnd;
  return () => setTimeout(() => { const n = root.querySelector(`[data-keep="${key}"]`); if (n && document.activeElement !== n) { n.focus({ preventScroll: true }); try { n.setSelectionRange(s, e); } catch { /* not a text input */ } } }, 0);
}

// Excellence points feedback after an action that may have earned points (server-derived).
export async function pointsFeedback(anchor) {
  const before = currentGame()?.xp;
  try { await loadGame(); } catch { return; }
  const gained = before == null ? 0 : (currentGame()?.xp ?? 0) - before;
  if (gained > 0) { celebrate(anchor); toast(L(`+${gained} نقطة تميّز`, `+${gained} excellence points`), { timeout: 2600 }); }
}

export const fmtDay = (s) => (s ? fmtDate(s) : '—');
export { h, icon, L, fmtNum };
