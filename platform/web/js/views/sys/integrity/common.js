// Conflicts & Gifts — shared vocabulary, chips, formatting and sheet routing.
import { h, icon, L, fmtNum, fmtDate, fmtTime, getLang, avatar, openSheet, sysApi } from '../../../sys-kit.js';

export const call = sysApi('integrity');

// status maps for statusChip(): [ar, en, tone, icon]
export const DECL = {
  not_started: ['لم يبدأ', 'Not started', 'outline', 'circleDashed'],
  draft: ['مسودة', 'Draft', 'outline', 'pencil'],
  submitted: ['مُقدَّم', 'Submitted', 'info', 'send'],
  under_review: ['قيد المراجعة', 'Under review', 'warn', 'scanSearch'],
  cleared: ['مُعتمد — لا يلزم إجراء', 'Cleared', 'good', 'badgeCheck'],
  mitigation: ['مُعتمد مع تعليمات', 'Mitigation required', 'purple', 'shieldAlert'],
  closed: ['مغلق', 'Closed', 'outline', 'archive'],
};
export const GIFT = {
  declared: ['بانتظار القرار', 'Awaiting decision', 'warn', 'hourglass'],
  decided: ['بانتظار التنفيذ', 'Awaiting action', 'purple', 'handCoins'],
  completed: ['مكتمل', 'Completed', 'good', 'circleCheck'],
};
export const DECISION = {
  keep: ['الاحتفاظ بها', 'Keep', 'good', 'gift'],
  handover: ['تسليمها للجهة', 'Hand over', 'navy', 'handCoins'],
  decline_return: ['الاعتذار وإعادتها', 'Decline & return', 'purple', 'return'],
  donate: ['التبرع بها', 'Donate', 'sand', 'heartHandshake'],
};
export const INTEREST = {
  financial: ['مصلحة مالية', 'Financial interest', 'coins', 'أسهم أو حصص أو ملكية في شركة تتعامل معها الجهة', 'Shares, stakes or ownership in a company the entity deals with'],
  relative: ['قريب يعمل في الجهة أو لدى طرف متعامل', 'Relative in the entity or a counterparty', 'people', 'قريب من الدرجة الأولى أو الثانية يعمل في الجهة أو لدى مورد', 'A close relative working in the entity or for a supplier'],
  outside_role: ['عمل خارجي أو عضوية مجلس', 'Outside role or board seat', 'briefcase', 'عمل إضافي، استشارات، عضوية مجالس إدارة أو أمناء', 'Additional work, consulting, board or trustee seats'],
  provider: ['علاقة بمقدّم خدمة', 'Relationship with a provider', 'handshake', 'علاقة شخصية أو مالية بمورد أو مقدّم خدمة', 'A personal or financial relationship with a supplier'],
  other: ['أخرى', 'Other', 'circleDot', 'أي مصلحة أخرى قد يُنظر إليها كتعارض', 'Any other interest that could be seen as a conflict'],
};
export const MITIGATION = {
  recusal: ['تنحٍّ', 'Recusal', 'userX'],
  divestment: ['تخارج من المصلحة', 'Divestment', 'trendDown'],
  reassignment: ['إعادة توزيع مهام', 'Reassignment', 'workflow'],
  other: ['إجراء آخر', 'Other action', 'circleDot'],
};
const ACCESS = {
  view: ['اطّلع', 'Viewed', 'eye'], start_review: ['بدأ المراجعة', 'Started review', 'scanSearch'], decide: ['اتخذ القرار', 'Recorded the decision', 'gavel'],
  return: ['طلب استيضاحاً', 'Asked for clarification', 'reply'], close: ['أغلق الحالة', 'Closed the case', 'archive'], submit: ['قدّم', 'Submitted', 'send'],
  lift: ['رفع التعليمات', 'Lifted an instruction', 'lockOpen'], acknowledge: ['أكّد تطبيق التعليمات', 'Acknowledged the instruction', 'userCheck'], complete: ['أكّد التنفيذ', 'Confirmed completion', 'circleCheck'],
};
const EVENT = {
  created: ['أُنشئت المسودة', 'Draft created', 'pencil'], submitted: ['قُدِّم', 'Submitted', 'send', 'emph'], review_started: ['بدأت المراجعة', 'Review started', 'scanSearch'],
  returned: ['طُلب استيضاح', 'Clarification requested', 'reply'], cleared: ['اعتُمد — لا يلزم إجراء', 'Cleared — no action needed', 'badgeCheck', 'good'],
  mitigation: ['اعتُمد مع تعليمات', 'Approved with instructions', 'shieldAlert', 'emph'], closed: ['أُغلقت الحالة', 'Case closed', 'archive'],
  declared: ['أُفصح عن الهدية', 'Gift declared', 'gift', 'emph'], completed: ['أُكّد تنفيذ القرار', 'Completion confirmed', 'circleCheck', 'good'],
  mitigation_lifted: ['رُفعت تعليمات', 'Instruction lifted', 'lockOpen'],
  decision_keep: ['القرار: الاحتفاظ بها', 'Decision: keep', 'gavel', 'good'], decision_handover: ['القرار: تسليمها للجهة', 'Decision: hand over', 'gavel'],
  decision_decline_return: ['القرار: الاعتذار وإعادتها', 'Decision: decline & return', 'gavel'], decision_donate: ['القرار: التبرع بها', 'Decision: donate', 'gavel'],
};

export const lbl = (map, k, i = 0) => (map[k] ? L(map[k][i], map[k][i + 1]) : k);
export const isAr = () => getLang() !== 'en';
export const demoChip = (on) => (on ? h('span.chip.tiny.demo', { 'data-tip': L('بيانات تجريبية للعرض', 'Demo data') }, L('تجريبي', 'Demo')) : null);
export const stamp = (iso) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—');
export const money = (n) => (n == null ? '—' : `${Number(n).toLocaleString(isAr() ? 'ar-AE' : 'en-US', { maximumFractionDigits: 0 })} ${L('د.إ', 'AED')}`);
export const nameOf = (p) => (p ? L(p.name_ar, p.name_en) : '—');
export const deptOf = (p) => (p ? L(p.dept_ar, p.dept_en) : '');
const rtf = () => new Intl.RelativeTimeFormat(isAr() ? 'ar-AE' : 'en', { numeric: 'auto' });
const parse = (s) => new Date(String(s).length === 10 ? `${s}T12:00:00Z` : String(s).includes('T') || String(s).endsWith('Z') ? s : `${String(s).replace(' ', 'T')}Z`);
export function ago(s) {
  if (!s) return '';
  const sec = Math.round((parse(s) - Date.now()) / 1000); const a = Math.abs(sec);
  if (a < 60) return L('الآن', 'just now');
  if (a < 3600) return rtf().format(Math.round(sec / 60), 'minute');
  if (a < 86400) return rtf().format(Math.round(sec / 3600), 'hour');
  return rtf().format(Math.round(sec / 86400), 'day');
}
// Arabic counted nouns: [one, two, few(3–10), many(11+)]; English [singular, plural]
export function count(n, ar, en) {
  if (!isAr()) return `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`;
  if (n === 1) return ar[0];
  if (n === 2) return ar[1];
  return `${fmtNum(n)} ${n >= 3 && n <= 10 ? ar[2] : ar[3]}`;
}
export const daysWord = (n) => count(n, ['يوم واحد', 'يومان', 'أيام', 'يوماً'], ['day', 'days']);

export function personLine(p, { sub = true } = {}) {
  if (!p) return h('span.faint', '—');
  return h('span.integ-person', avatar(L(p.name_ar, p.name_en)), h('span.grow', h('span.integ-person-name', nameOf(p)), sub ? h('span.integ-person-sub', [L(p.title_ar, p.title_en), deptOf(p)].filter(Boolean).join(' · ')) : null));
}
export function chip(map, k, extra = '') {
  const [ar, en, tone = 'outline', ic] = map[k] || [k, k];
  return h(`span.chip.tiny.${tone}${extra}`, ic ? icon(ic) : null, L(ar, en));
}

// «من اطّلع على إفصاحي» / access log with human labels
export function accessList(rows, { empty } = {}) {
  if (!rows?.length) return h('p.integ-empty-line', icon('eyeOff'), empty || L('لم يطّلع أحد على إفصاحاتك بعد.', 'Nobody has viewed your disclosures yet.'));
  return h('ul.integ-access', rows.map((r) => h('li', h('span.integ-access-ic', icon(ACCESS[r.action]?.[2] || 'eye')),
    h('span.grow', h('span.integ-access-who', L(r.name_ar, r.name_en)), h('span.integ-access-what', `${lbl(ACCESS, r.action)}${r.record_type ? ` · ${recordLabel(r.record_type)}` : ''}`)),
    h('time.integ-access-when', { datetime: r.at, title: stamp(r.at) }, ago(r.at)))));
}
const RECORD = { declaration: ['الإقرار السنوي', 'annual declaration'], disclosure: ['إفصاح طارئ', 'ad-hoc disclosure'], gift: ['إفصاح عن هدية', 'gift declaration'], mitigation: ['تعليمات', 'instruction'] };
export const recordLabel = (t) => lbl(RECORD, t);
export function historyList(events) {
  if (!events?.length) return h('p.faint.tiny', L('لا يوجد سجل بعد', 'No history yet'));
  return h('ol.sys-timeline', events.map((e) => { const m = EVENT[e.action] || [e.action, e.action, 'circleDot']; return h(`li${m[3] ? '.' + m[3] : ''}`, h('span.tl-ic', icon(m[2])),
    h('div.grow', h('div.tl-text', L(m[0], m[1])), e.note ? h('div.integ-tl-note', e.note) : null, h('div.tl-meta', [e.name_ar ? L(e.name_ar, e.name_en) : null, stamp(e.at)].filter(Boolean).join(' · ')))); }));
}
export const kv = (pairs) => h('dl.sys-kv', pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', k), h('dd', v ?? '—')]));
export const section = (title, ...children) => h('section.integ-sec', h('h3.integ-sec-title', title), ...children);

// ---------------- sheet ↔ hash (the open record survives live refreshes) ----------------
let current = null;
export const isOpen = (ref) => !!(current && current.ref === ref && current.sheet.el.isConnected);
export function openRouted(tab, ref, opts) {
  const base = `#/sys/integrity/${tab}`;
  if (location.hash !== `${base}/${ref}`) history.replaceState(null, '', `${base}/${ref}`);
  const sheet = openSheet(opts);
  current = { ref, sheet };
  const obs = new MutationObserver(() => {
    if (sheet.el.isConnected) return;
    obs.disconnect();
    if (current?.sheet === sheet) current = null;
    if (location.hash === `${base}/${ref}`) history.replaceState(null, '', base);
  });
  obs.observe(document.body, { childList: true });
  return sheet;
}
export const closeCurrent = () => current?.sheet.close();

// Days-left ring (progress through the declaration window)
export function ring(cycle, { size = 132 } = {}) {
  const total = Math.max(1, Math.round((Date.parse(`${cycle.due_on}T12:00:00Z`) - Date.parse(`${cycle.opens_on}T12:00:00Z`)) / 864e5));
  const left = Math.max(0, cycle.days_left);
  const frac = Math.min(1, Math.max(0, (total - left) / total));
  const r = 52; const c = 2 * Math.PI * r;
  const tone = cycle.days_left < 0 || cycle.days_left <= 7 ? 'crit' : cycle.days_left <= 14 ? 'warn' : 'ok';
  const svg = `<svg viewBox="0 0 120 120" width="${size}" height="${size}" aria-hidden="true"><circle cx="60" cy="60" r="${r}" class="integ-ring-track"/><circle cx="60" cy="60" r="${r}" class="integ-ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - frac)}" transform="rotate(-90 60 60)"/></svg>`;
  return h(`div.integ-ring.${tone}`, { role: 'img', 'aria-label': cycle.days_left < 0 ? L('انتهى الموعد', 'Past due') : L(`متبقٍ ${cycle.days_left} يوماً`, `${cycle.days_left} days left`) },
    h('div', { html: svg }), h('div.integ-ring-center', h('strong.num.tabular', fmtNum(left)), h('span', cycle.days_left < 0 ? L('متأخر', 'overdue') : left === 1 ? L('يوم متبقٍ', 'day left') : L('يوماً متبقياً', 'days left'))));
}
