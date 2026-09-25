// Shared visualisations for Strategic Performance and My Goals: attainment rings,
// sparklines and an accessible actual-vs-target trend chart. Every colour is a
// token (styles in sys-strategy.css / sys-goals.css under .viz-*); "not
// reported" is always drawn distinctly and never as zero.
import { h, L, getLang } from '../../../sys-kit.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v); return e; };
const rtl = () => document.documentElement.dir === 'rtl';
let seq = 0;

// Numbers: locale digits, fixed max decimals; percentages isolated so Arabic
// context never flips "49%" into "%49".
export const nf = (v, d = 1) => (v == null || !Number.isFinite(+v) ? '—' : Number(v).toLocaleString(getLang() === 'ar' ? 'ar-AE' : 'en-US', { maximumFractionDigits: d, minimumFractionDigits: 0 }));
export const pctText = (v, d = 0) => (v == null ? '—' : `⁦${nf(v, d)}%⁩`);
export const withUnit = (v, unitAr, unitEn, d = 1) => {
  if (v == null) return '—';
  const u = L(unitAr, unitEn || unitAr);
  return u === '%' ? `⁦${nf(v, d)}%⁩` : `⁦${nf(v, d)}⁩ ${u}`;
};
// Keep year ranges and codes readable inside Arabic text («2025–2028», not «2028–2025»).
export const bidi = (text) => String(text ?? '').replace(/(\d{4})\s*([–-])\s*(\d{4})/g, '\u2066$1$2$3\u2069');
export const TONE = { on_track: 'good', at_risk: 'warn', off_track: 'crit', no_data: 'none' };

// ring({ value 0–100|null, size, stroke, tone: good|warn|crit|none|accent|brand|emph, label, sub, title })
export function ring({ value, size = 64, stroke, tone = 'accent', label, sub, title } = {}) {
  const sw = stroke || Math.max(4, Math.round(size * 0.09));
  const r = (size - sw) / 2 - 1; const c = 2 * Math.PI * r; const mid = size / 2;
  const v = value == null ? null : Math.max(0, Math.min(100, value));
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: `viz-ring t-${tone}`, 'aria-hidden': 'true', focusable: 'false' });
  if (tone === 'brand') {
    const id = `vg${++seq}`;
    const defs = s('defs'); const lg = s('linearGradient', { id, x1: '0', y1: '0', x2: '1', y2: '1' });
    lg.append(s('stop', { offset: '0%', class: 'vr-stop-a' }), s('stop', { offset: '100%', class: 'vr-stop-b' }));
    defs.append(lg); svg.append(defs);
    svg.dataset.grad = id;
  }
  svg.append(s('circle', { cx: mid, cy: mid, r, fill: 'none', 'stroke-width': sw, class: `vr-track${v == null ? ' is-missing' : ''}` }));
  if (v != null) {
    const arc = s('circle', { cx: mid, cy: mid, r, fill: 'none', 'stroke-width': sw, class: 'vr-arc', 'stroke-linecap': 'round', 'stroke-dasharray': `${c} ${c}`, 'stroke-dashoffset': String(c * (1 - v / 100)), transform: `rotate(-90 ${mid} ${mid})` });
    if (svg.dataset.grad) arc.style.stroke = `url(#${svg.dataset.grad})`; // inline: beats the tone rule
    svg.append(arc);
    // draw-in motion via the Web Animations API (static under reduced motion, so the final state is always rendered)
    if (v > 0 && typeof arc.animate === 'function' && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      arc.animate([{ strokeDashoffset: String(c) }, { strokeDashoffset: String(c * (1 - v / 100)) }], { duration: 900, easing: 'cubic-bezier(0.22, 1, 0.36, 1)' });
    }
  }
  return h(`div.viz-ring-wrap.sz-${size >= 120 ? 'xl' : size >= 72 ? 'lg' : size >= 52 ? 'md' : 'sm'}`, { style: { width: `${size}px`, height: `${size}px` }, role: 'img', 'aria-label': title || (v == null ? L('لا توجد بيانات', 'No data') : `${Math.round(v)}%`) },
    svg, label != null || sub ? h('div.vr-center', label != null ? h('span.vr-label.num.tabular', label) : null, sub ? h('span.vr-sub', sub) : null) : null);
}

// Sparkline of comparable values with gaps for unreported periods and a dashed target.
export function sparkline(points, { width = 88, height = 28 } = {}) {
  const svg = s('svg', { viewBox: `0 0 ${width} ${height}`, width, height, class: 'viz-spark', 'aria-hidden': 'true', focusable: 'false' });
  const vals = points.flatMap((p) => [p.v, p.t]).filter((x) => x != null && Number.isFinite(+x));
  if (!vals.length || points.length < 2) { svg.append(s('line', { x1: 2, x2: width - 2, y1: height / 2, y2: height / 2, class: 'vs-none' })); return svg; }
  let lo = Math.min(...vals); let hi = Math.max(...vals); if (hi === lo) { hi += 1; lo -= 1; }
  const pad = 3; const n = points.length;
  const xOf = (i) => { const x = pad + ((width - 2 * pad) * i) / (n - 1); return rtl() ? width - x : x; };
  const yOf = (v) => pad + (height - 2 * pad) * (1 - (v - lo) / (hi - lo));
  const tpts = points.map((p, i) => (p.t == null ? null : `${xOf(i)},${yOf(p.t)}`)).filter(Boolean);
  if (tpts.length > 1) svg.append(s('polyline', { points: tpts.join(' '), class: 'vs-target', fill: 'none' }));
  let seg = [];
  const flush = () => { if (seg.length > 1) svg.append(s('polyline', { points: seg.join(' '), class: 'vs-line', fill: 'none' })); seg = []; };
  points.forEach((p, i) => { if (p.v == null) flush(); else seg.push(`${xOf(i)},${yOf(p.v)}`); });
  flush();
  const lastIdx = points.map((p) => p.v != null).lastIndexOf(true);
  if (lastIdx >= 0) svg.append(s('circle', { cx: xOf(lastIdx), cy: yOf(points[lastIdx].v), r: 2.6, class: `vs-dot t-${TONE[points[lastIdx].status] || 'none'}` }));
  return svg;
}

// trendChart(series, opts) — actual vs target over periods on ONE axis.
// series: [{ key, label, short, v (actual/comparable), t (target), status, missing }]
// opts: { unitAr, unitEn, decimals, height, statusLabel(status), valueLabel }
export function trendChart(series, opts = {}) {
  const wrap = h('div.viz-trend');
  const tip = h('div.viz-tip', { role: 'status', 'aria-live': 'polite' });
  const d = opts.decimals ?? 1;
  const fmt = (v) => withUnit(v, opts.unitAr, opts.unitEn, d);
  const describe = (p) => (p.v == null
    ? `${p.label}: ${L('لم يُرصد', 'Not reported')} · ${L('المستهدف', 'Target')} ${fmt(p.t)}`
    : `${p.label}: ${opts.valueLabel || L('الفعلي', 'Actual')} ${fmt(p.v)} · ${L('المستهدف', 'Target')} ${fmt(p.t)}${p.status && opts.statusLabel ? ` · ${opts.statusLabel(p.status)}` : ''}`);
  let lastW = 0;
  const draw = (W) => {
    if (!W || Math.abs(W - lastW) < 2) return;
    lastW = W;
    const H = opts.height || 220;
    const vals = series.flatMap((p) => [p.v, p.t]).filter((x) => x != null && Number.isFinite(+x));
    let lo = vals.length ? Math.min(...vals) : 0; let hi = vals.length ? Math.max(...vals) : 1;
    if (hi === lo) { hi += Math.abs(hi) * 0.1 || 1; lo -= Math.abs(lo) * 0.1 || 1; }
    const span = hi - lo; lo -= span * 0.18; hi += span * 0.18;
    if (vals.length && Math.min(...vals) >= 0 && lo < 0) lo = 0;
    const step = niceStep((hi - lo) / 4);
    lo = Math.floor(lo / step) * step; hi = Math.ceil(hi / step) * step;
    const ticks = []; for (let v = lo; v <= hi + step / 2; v += step) ticks.push(Math.round(v * 1e6) / 1e6);
    const R = rtl();
    const tickW = Math.max(...ticks.map((v) => nf(v, step < 1 ? 1 : 0).length)) * 7 + 12;
    const padT = 14; const padB = 30; const x0 = R ? 8 : tickW; const x1 = R ? W - tickW : W - 8;
    const plotW = Math.max(40, x1 - x0); const plotH = H - padT - padB;
    const n = series.length;
    const slot = plotW / Math.max(1, n);
    const xOf = (i) => { const x = x0 + slot * i + slot / 2; return R ? x0 + x1 - x : x; };
    const yOf = (v) => padT + plotH * (1 - (v - lo) / (hi - lo));
    const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, class: 'viz-trend-svg', role: 'img', 'aria-label': opts.label || L('اتجاه الفعلي مقابل المستهدف', 'Actual vs target trend') });
    for (const v of ticks) {
      const y = yOf(v);
      svg.append(s('line', { x1: x0, x2: x1, y1: y, y2: y, class: 'vt-grid' }));
      const t = s('text', { x: R ? x1 + 6 : x0 - 6, y: y + 4, class: 'vt-tick', 'text-anchor': R ? 'start' : 'end' }); t.textContent = nf(v, step < 1 ? 1 : 0); svg.append(t);
    }
    // target (dashed step line)
    const tp = []; series.forEach((p, i) => { if (p.t != null) tp.push([xOf(i), yOf(p.t)]); });
    if (tp.length > 1) svg.append(s('polyline', { points: tp.map((q) => q.join(',')).join(' '), class: 'vt-target', fill: 'none' }));
    // actual segments with gaps
    let seg = [];
    const flush = () => { if (seg.length > 1) svg.append(s('polyline', { points: seg.map((q) => q.join(',')).join(' '), class: 'vt-line', fill: 'none' })); seg = []; };
    series.forEach((p, i) => { if (p.v == null) flush(); else seg.push([xOf(i), yOf(p.v)]); });
    flush();
    const marks = [];
    series.forEach((p, i) => {
      const cx = xOf(i);
      const g = s('g', { class: 'vt-mark', tabindex: i === n - 1 ? 0 : -1, role: 'img', 'aria-label': describe(p) });
      g.append(s('rect', { x: cx - slot / 2, y: padT, width: slot, height: plotH, class: 'vt-hit' }));
      if (p.v == null) {
        g.append(s('line', { x1: cx, x2: cx, y1: padT + 4, y2: padT + plotH, class: 'vt-missing' }));
        g.append(s('circle', { cx, cy: padT + plotH, r: 3.5, class: 'vt-missing-dot' }));
      } else {
        g.append(s('circle', { cx, cy: yOf(p.v), r: 4.2, class: `vt-dot t-${TONE[p.status] || 'none'}` }));
      }
      const lbl = s('text', { x: cx, y: H - 10, class: `vt-cat${i === n - 1 ? ' is-last' : ''}`, 'text-anchor': 'middle' });
      lbl.textContent = n > 9 && i % 2 && i !== n - 1 ? '' : p.short || p.label; g.append(lbl);
      const show = () => { tip.textContent = describe(p); tip.classList.add('on'); const tw = tip.offsetWidth / 2; tip.style.left = `${Math.max(tw, Math.min(W - tw, cx))}px`; tip.style.top = `${p.v == null ? padT + plotH - 12 : yOf(p.v) - 12}px`; };
      const hide = () => tip.classList.remove('on');
      g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
      g.addEventListener('pointerleave', hide); g.addEventListener('blur', hide);
      marks.push(g); svg.append(g);
    });
    svg.addEventListener('keydown', (e) => {
      const i = marks.indexOf(document.activeElement); if (i < 0) return;
      const fwd = R ? 'ArrowLeft' : 'ArrowRight'; const back = R ? 'ArrowRight' : 'ArrowLeft';
      const j = e.key === fwd ? Math.min(n - 1, i + 1) : e.key === back ? Math.max(0, i - 1) : e.key === 'Home' ? 0 : e.key === 'End' ? n - 1 : null;
      if (j == null) return; e.preventDefault(); marks[i].setAttribute('tabindex', '-1'); marks[j].setAttribute('tabindex', '0'); marks[j].focus();
    });
    const old = wrap.querySelector(':scope > svg'); if (old) old.replaceWith(svg); else wrap.prepend(svg);
  };
  wrap.append(tip,
    h('div.viz-legend', h('span', h('i.lg-actual'), opts.valueLabel || L('الفعلي', 'Actual')), h('span', h('i.lg-target'), L('المستهدف', 'Target')), h('span', h('i.lg-missing'), L('لم يُرصد', 'Not reported'))),
    h('table.sr-only', h('caption', opts.label || L('الفعلي مقابل المستهدف', 'Actual vs target')), h('tbody', series.map((p) => h('tr', h('th', { scope: 'row' }, p.label), h('td', p.v == null ? L('لم يُرصد', 'Not reported') : fmt(p.v)), h('td', fmt(p.t)))))));
  requestAnimationFrame(() => draw(wrap.clientWidth || opts.width || 560));
  if (typeof ResizeObserver === 'function') {
    let raf = 0;
    new ResizeObserver((en) => { const w = Math.round(en[0]?.contentRect?.width || 0); cancelAnimationFrame(raf); raf = requestAnimationFrame(() => draw(w)); }).observe(wrap);
  }
  return wrap;
}
function niceStep(raw) {
  if (!(raw > 0)) return 1;
  const mag = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((k) => k * mag).find((x) => x >= raw) || 10 * mag;
}
