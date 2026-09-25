// Performance Management — shared UI helpers: labels, chips, score ring,
// countdown, stars, charts (aggregated, single-series), drafts that survive
// live re-renders, and small formatting helpers.
import { h, icon, L, fmtNum, fmtDate, getLang, sysApi, statusChip, stepper, api } from '../../../sys-kit.js';

export const call = sysApi('performance');
export const q = (cycleId) => (cycleId && cycleId !== 'current' ? `?cycle=${encodeURIComponent(cycleId)}` : '');

// ---------------- labels ----------------
export const PHASES = ['goal_setting', 'midyear', 'self_assessment', 'manager_assessment', 'calibration', 'acknowledgement', 'closed'];
export const PHASE = {
  goal_setting: ['تحديد الأهداف', 'Goal setting', 'target'],
  midyear: ['المراجعة المرحلية', 'Mid-year check-in', 'messageSquare'],
  self_assessment: ['التقييم الذاتي', 'Self-assessment', 'userCheck'],
  manager_assessment: ['تقييم المدير', 'Manager assessment', 'clipboardCheck'],
  calibration: ['المعايرة', 'Calibration', 'scale'],
  acknowledgement: ['الاطلاع والإقرار', 'Acknowledgement', 'badgeCheck'],
  closed: ['مغلقة', 'Closed', 'lock'],
};
export const phaseName = (p) => (PHASE[p] ? L(PHASE[p][0], PHASE[p][1]) : p);
export const STATUS = {
  planning: ['صياغة الأهداف', 'Setting objectives', 'outline', 'pencil'],
  active: ['الأهداف معتمدة', 'Objectives agreed', 'navy', 'target'],
  self_submitted: ['أُرسل التقييم الذاتي', 'Self-assessment sent', 'info', 'userCheck'],
  assessed: ['قيّمه المدير', 'Assessed', 'purple', 'clipboardCheck'],
  acknowledged: ['تم الإقرار', 'Acknowledged', 'good', 'badgeCheck'],
};
export const statusOf = (s) => statusChip(s, STATUS);
export const BANDS = [
  { key: 'exceptional', ar: 'يفوق التوقعات بشكل استثنائي', en: 'Exceptional', short_ar: 'استثنائي', short_en: 'Exceptional', tone: 'purple', min: 4.5 },
  { key: 'exceeds', ar: 'يفوق التوقعات', en: 'Exceeds expectations', short_ar: 'يفوق', short_en: 'Exceeds', tone: 'navy', min: 3.5 },
  { key: 'meets', ar: 'يلبي التوقعات', en: 'Meets expectations', short_ar: 'يلبي', short_en: 'Meets', tone: 'sand', min: 2.5 },
  { key: 'improve', ar: 'يحتاج إلى تحسين', en: 'Needs improvement', short_ar: 'يحتاج تحسيناً', short_en: 'Improve', tone: 'warn', min: 1.5 },
  { key: 'unsatisfactory', ar: 'غير مُرضٍ', en: 'Unsatisfactory', short_ar: 'غير مُرضٍ', short_en: 'Unsatisfactory', tone: 'crit', min: 0 },
];
export const band = (k) => BANDS.find((b) => b.key === k) || null;
export const bandName = (k) => { const b = band(k); return b ? L(b.ar, b.en) : '—'; };
export function bandChip(k, { tiny = true, final = false } = {}) {
  const b = band(k);
  if (!b) return h('span.chip.tiny.outline', L('لم يُحدَّد', 'Not set'));
  return h(`span.chip.${b.tone}${tiny ? '.tiny' : ''}.perf-band`, icon(final ? 'award' : 'star'), L(b.ar, b.en));
}
export const bandOf = (score) => (score == null ? null : BANDS.find((b) => score >= b.min - 1e-9)?.key || 'unsatisfactory');
export const SCALE = [
  ['غير مُرضٍ', 'Unsatisfactory'], ['يحتاج إلى تحسين', 'Needs improvement'], ['يلبي التوقعات', 'Meets expectations'], ['يفوق التوقعات', 'Exceeds expectations'], ['استثنائي', 'Exceptional'],
];
export const scaleLabels = () => SCALE.map(([ar, en], i) => `${i + 1} — ${L(ar, en)}`);

// ---------------- numbers & dates ----------------
export const score2 = (n) => (n == null ? '—' : Number(n).toLocaleString(getLang() === 'ar' ? 'ar-AE' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
export const pctTxt = (n) => (n == null ? '—' : `⁦${fmtNum(Math.round(n))}%⁩`);
export function longDate(iso) {
  if (!iso) return '—';
  const d = new Date(iso.length === 10 ? `${iso}T12:00:00Z` : iso);
  return d.toLocaleDateString(getLang() === 'ar' ? 'ar-AE' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
}
export const shortDate = (iso) => fmtDate(iso);
// "4 Feb – 2 Mar": each date isolated so Arabic month names never reorder around the digits.
export const dateRange = (s, e) => h('span.pc-dates', h('bdi', fmtDate(s)), ' – ', h('bdi', fmtDate(e)));
export const todayIso = () => new Date().toISOString().slice(0, 10);
export const daysUntil = (iso) => (iso ? Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.parse(`${todayIso()}T00:00:00Z`)) / 864e5) : null);
const arRules = new Intl.PluralRules('ar');
export function daysText(n) {
  if (n == null) return '';
  const a = Math.abs(n);
  if (getLang() === 'en') return `${fmtNum(a)} ${a === 1 ? 'day' : 'days'}`;
  const c = arRules.select(a);
  if (c === 'zero') return 'اليوم';
  if (c === 'one') return 'يوم واحد';
  if (c === 'two') return 'يومان';
  if (c === 'few') return `${fmtNum(a)} أيام`;
  return `${fmtNum(a)} يوماً`;
}
export function dueText(iso) {
  const n = daysUntil(iso);
  if (n == null) return '';
  if (n < 0) return L(`انتهى الموعد قبل ${daysText(n)}`, `${daysText(n)} overdue`);
  if (n === 0) return L('الموعد النهائي اليوم', 'Due today');
  return L(`يتبقى ${daysText(n)} · ${longDate(iso)}`, `${daysText(n)} left · ${longDate(iso)}`);
}
export function countText(n, [one, two, few, many], en) {
  if (getLang() === 'en') return `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`;
  const c = arRules.select(n);
  return c === 'one' ? one : c === 'two' ? two : c === 'few' ? `${fmtNum(n)} ${few}` : `${fmtNum(n)} ${many}`;
}

// Mirror of the server formula (the server recomputes on submit).
export function liveScore(objectives, ratings, compRatings, share = 70) {
  const wsum = objectives.reduce((s, o) => s + (o.weight || 0), 0);
  const all = objectives.length && objectives.every((o) => ratings[o.id] != null);
  const obj = all && wsum ? objectives.reduce((s, o) => s + o.weight * ratings[o.id], 0) / wsum : null;
  const cr = Object.values(compRatings).filter((v) => v != null);
  const comp = cr.length ? cr.reduce((s, v) => s + v, 0) / cr.length : null;
  const overall = obj != null && comp != null ? (share / 100) * obj + (1 - share / 100) * comp : null;
  const r2 = (x) => (x == null ? null : Math.round(x * 100) / 100);
  return { obj: r2(obj), comp: r2(comp), score: r2(overall), band: bandOf(r2(overall)) };
}

// ---------------- visual atoms ----------------
const SVGNS = 'http://www.w3.org/2000/svg';
const svg = (tag, attrs = {}) => { const el = document.createElementNS(SVGNS, tag); for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v); return el; };
// Progress ring: value 0..1; centre shows a big figure and a caption.
export function ring(value, { size = 132, stroke = 10, figure, caption, tone = 'accent', label } = {}) {
  const r = (size - stroke) / 2; const c = 2 * Math.PI * r;
  const v = value == null ? 0 : Math.max(0, Math.min(1, value));
  const s = svg('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, 'aria-hidden': 'true', class: 'perf-ring-svg' });
  s.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: 'track', 'stroke-width': stroke, fill: 'none' }));
  s.append(svg('circle', { cx: size / 2, cy: size / 2, r, class: `bar ${tone}`, 'stroke-width': stroke, fill: 'none', 'stroke-linecap': 'round', 'stroke-dasharray': `${c * v} ${c}`, transform: `rotate(-90 ${size / 2} ${size / 2})` }));
  return h('div.perf-ring', { role: 'img', 'aria-label': label || `${figure ?? ''} ${caption ?? ''}`.trim(), style: { width: `${size}px`, height: `${size}px` } }, s,
    h('div.perf-ring-c', figure != null ? h('strong.num', figure) : null, caption ? h('span', caption) : null));
}
// Read-only stars.
export function stars(n, { max = 5 } = {}) {
  return h('span.perf-stars', { role: 'img', 'aria-label': n == null ? L('غير مُقيّم', 'Not rated') : L(`${n} من ${max}`, `${n} of ${max}`) },
    Array.from({ length: max }, (_, i) => h(`span${n != null && i < n ? '.on' : ''}`, icon('star'))));
}
export function weightChip(w) { return h('span.chip.tiny.outline.perf-weight', { 'data-tip': L('وزن الهدف من إجمالي الأهداف', 'Objective weight') }, h('span.num', `${fmtNum(w || 0)}%`)); }
export function demoChip(on) { return on ? h('span.chip.tiny.demo', { 'data-tip': L('بيانات تجريبية للعرض', 'Demo data') }, L('تجريبي', 'Demo')) : null; }
export function personLine(u, { sub = true } = {}) {
  if (!u) return h('span.faint', '—');
  return h('div.perf-person', h('span.avatar', { 'data-tint': tint(u.name_ar), 'aria-hidden': 'true' }, initials(u.name_ar)),
    h('div.grow', h('div.perf-person-name', L(u.name_ar, u.name_en)), sub ? h('div.perf-person-sub', [L(u.title_ar || '', u.title_en || ''), L(u.dept_ar || '', u.dept_en || '')].filter(Boolean).join(' · ')) : null));
}
export const initials = (name) => {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean).map((w) => w.replace(/^(ال|آل)(?=\S{2,})/, ''));
  const pick = parts.length > 1 ? [parts[0], parts[parts.length - 1]] : parts;
  return pick.map((w) => w[0]).join(/[؀-ۿ]/.test(name) ? ' ' : '').toUpperCase();
};
export const tint = (name) => String([...String(name || '')].reduce((a, c) => (a * 31 + c.codePointAt(0)) >>> 0, 7) % 7);

// Cycle phase stepper (7 steps).
export function phaseStepper(cycle) {
  const idx = PHASES.indexOf(cycle.phase);
  return stepper(PHASES.map((p) => ({ ar: PHASE[p][0], en: PHASE[p][1] })), cycle.phase === 'closed' ? PHASES.length : idx, { label: L('مراحل دورة الأداء', 'Performance cycle phases') });
}
// Review-level steps for one person.
export const REVIEW_STEPS = [['الأهداف', 'Objectives'], ['التقييم الذاتي', 'Self'], ['تقييم المدير', 'Manager'], ['المعايرة', 'Calibration'], ['الإقرار', 'Acknowledged']];
export function reviewStepIndex(r) {
  if (r.status === 'planning') return 0;
  if (r.status === 'active') return 1;
  if (r.status === 'self_submitted') return 2;
  if (r.status === 'assessed') return r.calibrated || r.released ? 4 : 3;
  return 5;
}
export const reviewStepper = (r) => stepper(REVIEW_STEPS.map(([ar, en]) => ({ ar, en })), reviewStepIndex(r), { label: L('مراحل المراجعة', 'Review stages') });

// ---------------- charts (aggregated only) ----------------
// Rating distribution: one series (navy) across the five ordered bands, value on the cap,
// hover tooltip, and an accessible table.
export function distributionChart(dist, { caption, compact = false } = {}) {
  const bands = dist?.bands || [];
  const n = dist?.n || 0;
  const max = Math.max(1, ...bands.map((b) => b.count));
  const cols = bands.map((b) => {
    const meta = band(b.key); const pct = n ? Math.round((b.count / n) * 100) : 0;
    const tip = `${L(meta.ar, meta.en)}: ${fmtNum(b.count)} (${pct}%)`;
    return h('div.perf-col', { 'data-tip': tip, tabindex: 0, 'aria-label': tip },
      h('div.perf-col-plot', h('span.perf-col-val.num', fmtNum(b.count)), h('i.perf-col-bar', { style: { height: `${b.count ? Math.max(4, (b.count / max) * 100) : 0}%` } })),
      h('div.perf-col-lab', L(meta.short_ar, meta.short_en)));
  });
  return h(`figure.perf-dist${compact ? '.compact' : ''}`,
    h('div.perf-dist-plot', { 'aria-hidden': 'true' }, cols),
    h('table.sr-only', caption ? h('caption', caption) : null, h('thead', h('tr', h('th', L('التقدير', 'Band')), h('th', L('العدد', 'Count')))),
      h('tbody', bands.map((b) => h('tr', h('td', bandName(b.key)), h('td', String(b.count)))))),
    h('figcaption.perf-dist-cap', L(`${fmtNum(n)} تقييماً مُرسلاً`, `${fmtNum(n)} submitted assessments`)));
}
// Completion by department: two thin bars per department (legend + values in text).
export function completionBars(rows, series) {
  return h('div.perf-cbar',
    h('div.perf-legend', series.map((s, i) => h('span', h('i', { class: `sw s${i + 1}` }), L(s.ar, s.en)))),
    h('ul.perf-cbar-list', rows.map((d) => h('li', { 'data-tip': series.map((s) => `${L(s.ar, s.en)}: ${d[s.key] ?? 0}%`).join(' · ') },
      h('div.perf-cbar-name', h('span', L(d.name_ar, d.name_en)), h('span.faint.tiny', countText(d.total, ['موظف واحد', 'موظفان', 'موظفين', 'موظفاً'], ['person', 'people']))),
      h('div.perf-cbar-bars', series.map((s, i) => h('div.perf-cbar-track', { role: 'img', 'aria-label': `${L(s.ar, s.en)}: ${d[s.key] ?? 0}%` }, h('i', { class: `s${i + 1}`, style: { width: `${d[s.key] ?? 0}%` } })))),
      h('div.perf-cbar-vals', series.map((s) => h('span.num', pctTxt(d[s.key] ?? 0))))))));
}

// ---------------- drafts (survive live re-renders until saved) ----------------
const drafts = new Map();
export const draft = (key) => drafts.get(key) || null;
export const setDraft = (key, value) => drafts.set(key, value);
export const clearDraft = (key) => drafts.delete(key);

// ---------------- misc ----------------
export const section = (title, extra) => h('div.perf-sec', h('h3', title), extra || null);
export function emptyCard(ic, title, body, actions = []) {
  return h('section.card.perf-empty', h('div.es-icon', icon(ic)), h('h4', title), body ? h('p', body) : null,
    actions.length ? h('div.btn-group', actions.map((a) => h(`button.btn${a.primary ? '.primary' : ''}`, { type: 'button', onclick: a.onClick }, a.icon ? icon(a.icon) : null, a.label))) : null);
}
export async function myPrefs() { return api('/api/systems').then((l) => l.find((s) => s.key === 'performance')).catch(() => null); }
