// Shared UI helpers for AI Procurement (and the vendor portal): status maps,
// countdowns, money cells, the compact stage track and small building blocks.
import { h, icon, L, fmtNum, fmtDate, fmtTime, getLang, sysApi, statusChip, money } from '../../../sys-kit.js';

export const call = sysApi('procurement');
export const THRESHOLD = 50000;
export const CATS = { it: ['خدمات تقنية المعلومات', 'IT services', 'monitor'], supplies: ['التوريدات', 'Supplies', 'package'], consulting: ['الاستشارات', 'Consulting', 'briefcase'], facilities: ['خدمات المرافق', 'Facilities', 'building'] };
export const catName = (k) => (CATS[k] ? L(CATS[k][0], CATS[k][1]) : k);
export const PR_STATUS = {
  draft: ['مسودة', 'Draft', 'outline', 'pencil'],
  pending_manager: ['بانتظار المدير المباشر', 'Awaiting manager', 'warn', 'hourglass'],
  pending_finance: ['بانتظار المالية', 'Awaiting finance', 'warn', 'wallet'],
  pending_procurement: ['لدى المشتريات', 'With procurement', 'info', 'cart'],
  sourcing: ['قيد طرح العروض', 'Sourcing', 'navy', 'scale'],
  ordered: ['صدر أمر الشراء', 'PO issued', 'good', 'circleCheck'],
  rejected: ['مرفوض', 'Rejected', 'crit', 'circleX'],
  cancelled: ['ملغى', 'Cancelled', 'outline', 'ban'],
};
export const RFQ_STATUS = {
  draft: ['مسودة قيد الإعداد', 'Draft', 'outline', 'pencil'],
  open: ['مفتوح لاستقبال العروض', 'Open for bids', 'info', 'inbox'],
  closed: ['مغلق — بانتظار الفتح', 'Closed — awaiting opening', 'warn', 'lockKeyhole'],
  opened: ['العروض مفتوحة — قيد التقييم', 'Opened — evaluating', 'navy', 'scale'],
  evaluated: ['اكتمل التقييم', 'Evaluation complete', 'navy', 'clipboardCheck'],
  recommended: ['توصية بانتظار اللجنة', 'Recommendation — committee', 'purple', 'vote'],
  committee_approved: ['مراجعة قانونية', 'Legal review', 'purple', 'gavel'],
  legal_approved: ['جاهز لإصدار أمر الشراء', 'Ready for PO', 'good', 'stamp'],
  awarded: ['تمت الترسية', 'Awarded', 'good', 'badgeCheck'],
  cancelled: ['ملغى', 'Cancelled', 'outline', 'ban'],
};
export const VENDOR_STATUS = {
  open: ['مفتوح لتقديم العروض', 'Open for bids', 'info', 'inbox'],
  under_evaluation: ['قيد التقييم', 'Under evaluation', 'warn', 'hourglass'],
  awarded: ['تمت الترسية عليكم', 'Awarded to you', 'good', 'badgeCheck'],
  not_awarded: ['لم تتم الترسية عليكم', 'Not awarded', 'outline', 'circleX'],
  closed: ['مغلق', 'Closed', 'outline', 'lock'],
  cancelled: ['ملغى', 'Cancelled', 'outline', 'ban'],
};
export const prChip = (s) => statusChip(s, PR_STATUS);
export const rfqChip = (s) => statusChip(s, RFQ_STATUS);
export const vendorChip = (s) => statusChip(s, VENDOR_STATUS);
export const demoChip = (on) => (on ? h('span.chip.tiny.demo', { 'data-tip': L('بيانات تجريبية للعرض', 'Demo data') }, L('تجريبي', 'Demo')) : null);
export const PR_STEPS = [
  { ar: 'إعداد الطلب', en: 'Draft' }, { ar: 'المدير المباشر', en: 'Line manager' }, { ar: 'المالية', en: 'Finance' },
  { ar: 'المشتريات', en: 'Procurement' }, { ar: 'طرح العروض', en: 'Sourcing' }, { ar: 'أمر الشراء', en: 'Purchase order' },
];
export const RFQ_STEPS = [
  { ar: 'الإعداد', en: 'Setup', s: ['draft'] }, { ar: 'استقبال العروض', en: 'Bidding', s: ['open'] }, { ar: 'الفتح بمفتاحين', en: 'Two-key opening', s: ['closed'] },
  { ar: 'التقييم', en: 'Evaluation', s: ['opened', 'evaluated'] }, { ar: 'اللجنة', en: 'Committee', s: ['recommended'] }, { ar: 'القانونية', en: 'Legal', s: ['committee_approved'] },
  { ar: 'أمر الشراء', en: 'PO', s: ['legal_approved', 'awarded'] },
];
export const rfqStep = (st) => Math.max(0, RFQ_STEPS.findIndex((x) => x.s.includes(st)));

// Numbers inside Arabic text keep their own direction.
export const n = (v) => h('span.num.tabular', typeof v === 'number' ? fmtNum(v) : v);
export const aed = (v, opts) => h('span.num.tabular.money', money(v, opts));
export const pctTxt = (v) => (v == null ? '—' : `⁦${v > 0 ? '+' : ''}${fmtNum(v)}%⁩`);
export const dt = (iso) => (iso ? `${fmtDate(iso)} · ${fmtTime(iso)}` : '—');
const parse = (iso) => (iso ? new Date(/Z|\+/.test(iso) ? iso : `${iso.replace(' ', 'T')}Z`) : null);

// Countdown to an ISO timestamp: { text, tone, past }
export function countdown(iso, { prefix = true } = {}) {
  const d = parse(iso); if (!d) return { text: '—', tone: null, past: false };
  const ms = d - Date.now();
  const past = ms <= 0;
  const a = Math.abs(ms); const days = Math.floor(a / 864e5); const hours = Math.floor((a % 864e5) / 36e5); const mins = Math.max(1, Math.floor((a % 36e5) / 6e4));
  const ar = (x, one, two, few, many) => (x === 1 ? one : x === 2 ? two : x <= 10 ? `${fmtNum(x)} ${few}` : `${fmtNum(x)} ${many}`);
  let span;
  if (getLang() === 'en') span = days ? `${days}d ${hours}h` : hours ? `${hours}h ${mins}m` : `${mins}m`;
  else span = days ? `${ar(days, 'يوم', 'يومين', 'أيام', 'يوماً')}${hours ? ` و${ar(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}` : ''}` : hours ? `${ar(hours, 'ساعة', 'ساعتين', 'ساعات', 'ساعة')}${mins ? ` و${ar(mins, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة')}` : ''}` : ar(mins, 'دقيقة', 'دقيقتين', 'دقائق', 'دقيقة');
  const text = past ? L(`أُغلق منذ ${span}`, `Closed ${span} ago`) : prefix ? L(`يُغلق خلال ${span}`, `Closes in ${span}`) : span;
  return { text, tone: past ? null : ms < 864e5 ? 'crit' : ms < 3 * 864e5 ? 'warn' : 'info', past };
}
export function countdownPill(iso, opts) {
  const c = countdown(iso, opts);
  return h(`span.pc-countdown${c.tone ? '.' + c.tone : ''}`, { title: dt(iso) }, icon(c.past ? 'lock' : 'timer'), h('span', c.text));
}
// Small key/value list.
export const kv = (pairs) => h('dl.sys-kv', pairs.filter(Boolean).flatMap(([k, v]) => [h('dt', k), h('dd', v ?? '—')]));
// Stage track (compact dots) for list cards.
export function miniTrack(index, total, { failed = false } = {}) {
  return h('div.pc-track', { role: 'img', 'aria-label': L(`المرحلة ${index + 1} من ${total}`, `Stage ${index + 1} of ${total}`) },
    Array.from({ length: total }, (_, i) => h(`i.${i < index ? 'done' : i === index ? (failed ? 'failed' : 'now') : 'todo'}`)));
}
export function backLink(href, label) { return h('a.pc-back', { href }, icon('chevronL', 'flip-rtl pc-back-ic'), label); }
export function section(title, ...children) { return h('section.card.sys-card.pc-card', h('div.card-head', h('h2.card-title', title)), ...children); }
export function hint(text, ic = 'info') { return h('p.pc-hint', icon(ic), h('span', text)); }
export const plainMoney = money;
// Supplier accounts never get Ask AI / MCP: make the header say so plainly.
export function vendorHeader(header) {
  header.querySelector('.ai-chip')?.replaceWith(h('span.chip.tiny.outline', { 'data-tip': L('حسابات الجهات الخارجية لا تستخدم المساعد الذكي أو MCP', 'External accounts never use Ask AI or MCP') }, icon('shieldBan'), L('Ask AI: غير متاح لحسابات الموردين', 'Ask AI: not for supplier accounts')));
  return header;
}
