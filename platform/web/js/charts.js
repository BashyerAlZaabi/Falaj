// Approved chart components: bars (vertical or horizontal) and a donut with a
// side legend. Charts are drawn at the container's real pixel width, so text
// stays 11–12px at any card size; every colour is a token; "not reported"
// values are drawn distinctly (dashed, labelled) and never as zero; every mark
// has a text equivalent for assistive tech.
//
// barChart(data, opts)   data: [{ label, value, missing?, color?, title?, emphasis?, muted? }]
//   opts: { unit, max, label, color, height, orientation: 'auto'|'vertical'|'horizontal', integer }
// donutChart(data, opts) data: [{ label, value, color? }]  opts: { label, totalLabel, size }
import { h } from './ui.js';
import { fmtNum, L } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
export const SERIES = ['var(--series-1)', 'var(--series-2)', 'var(--series-3)', 'var(--series-4)'];
const TEXT = 11.5; // px — caption size, fixed regardless of chart width

function s(tag, attrs = {}, style) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null && v !== false) e.setAttribute(k, v);
  if (style) for (const [k, v] of Object.entries(style)) if (v != null) e.style.setProperty(k, v);
  return e;
}
const isRtl = () => document.documentElement.dir === 'rtl';

// ---------- text measurement (canvas) so labels are fitted, never clipped mid-glyph ----------
let mctx = null; let family = '';
function measure(text, size = TEXT, weight = 500) {
  mctx ??= document.createElement('canvas').getContext('2d');
  if (!family) family = getComputedStyle(document.body).fontFamily || 'system-ui, sans-serif';
  if (!mctx) return String(text).length * size * 0.56;
  mctx.font = `${weight} ${size}px ${family}`;
  return mctx.measureText(String(text)).width;
}
function fit(text, max, size = TEXT, weight = 500) {
  const str = String(text ?? '');
  if (max <= 8) return '';
  if (measure(str, size, weight) <= max) return str;
  let lo = 0; let hi = str.length;
  while (lo < hi) { const mid = (lo + hi + 1) >> 1; if (measure(`${str.slice(0, mid)}…`, size, weight) <= max) lo = mid; else hi = mid - 1; }
  return lo ? `${str.slice(0, lo).trimEnd()}…` : '…';
}
// Text anchored by *visual* side (left/right/center); the SVG inherits the
// document direction, so text-anchor is mapped accordingly.
function label(x, y, str, { align = 'center', cls = 'ch-tick' } = {}) {
  const anchor = align === 'center' ? 'middle' : (align === 'right') !== isRtl() ? 'end' : 'start';
  const el = s('text', { x, y, class: cls, 'text-anchor': anchor });
  el.textContent = str;
  return el;
}

// ---------- scale: "nice" integer-friendly ticks (no duplicate 0,0,1,1 labels) ----------
export function niceScale(max, { integer = false, count = 4 } = {}) {
  const top0 = max > 0 ? max : 1;
  const raw = top0 / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const steps = integer ? [1, 2, 5, 10] : [1, 2, 2.5, 5, 10];
  let step = steps.map((k) => k * mag).find((st) => st >= raw - 1e-9) || 10 * mag;
  if (integer) step = Math.max(1, Math.round(step));
  const top = Math.ceil(top0 / step - 1e-9) * step;
  const ticks = [];
  for (let v = 0; v <= top + 1e-9; v += step) ticks.push(Math.round(v * 1000) / 1000);
  return { max: top, ticks };
}

// ---------- tooltip (anchored to the mark, kept inside the chart, dismissed on outside tap/scroll) ----------
function tipLayer(wrap) {
  const tip = h('div.tip', { 'aria-hidden': 'true' });
  wrap.append(tip);
  let armed = false;
  const hide = () => {
    tip.style.opacity = 0;
    if (armed) { document.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', hide, true); armed = false; }
  };
  const outside = (e) => { if (!wrap.contains(e.target)) hide(); };
  return {
    show(x, y, text) {
      tip.textContent = text;
      tip.style.opacity = 1;
      const half = tip.offsetWidth / 2; const ww = wrap.clientWidth || 0;
      tip.style.left = `${Math.max(half, Math.min(ww - half, x))}px`;
      tip.style.top = `${Math.max(0, y)}px`;
      if (!armed) { document.addEventListener('pointerdown', outside, true); window.addEventListener('scroll', hide, true); armed = true; }
    },
    hide,
  };
}

// Redraw at the real width whenever the container is resized (deferred a frame
// so the resize never feeds back into the observer loop).
function observeWidth(el, draw) {
  if (typeof ResizeObserver !== 'function') return;
  let raf = 0;
  new ResizeObserver((entries) => {
    const w = Math.round(entries[0]?.contentRect?.width || 0);
    if (!w) return;
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => draw(w));
  }).observe(el);
}

// Roving focus across marks: one tab stop, arrow keys move in visual order.
function rovingKeys(svg, marks, rtlOrder) {
  svg.addEventListener('keydown', (e) => {
    const i = marks.indexOf(document.activeElement);
    if (i < 0) return;
    const fwd = rtlOrder ? ['ArrowLeft', 'ArrowDown'] : ['ArrowRight', 'ArrowDown'];
    const back = rtlOrder ? ['ArrowRight', 'ArrowUp'] : ['ArrowLeft', 'ArrowUp'];
    let j = null;
    if (fwd.includes(e.key)) j = Math.min(marks.length - 1, i + 1);
    else if (back.includes(e.key)) j = Math.max(0, i - 1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = marks.length - 1;
    if (j == null) return;
    e.preventDefault();
    marks[i].setAttribute('tabindex', '-1'); marks[j].setAttribute('tabindex', '0'); marks[j].focus();
  });
}

const isMissing = (d) => d.missing || d.value == null;
const valueText = (d, unit = '') => (isMissing(d) ? L('غير محدد', 'Not reported') : `${fmtNum(d.value)}${unit}`);
const fillOf = (d, opts) => d.color || opts.color || SERIES[0];

// ============================== Bar chart ==============================
export function barChart(data, opts = {}) {
  const wrap = h('div.chart.bar-chart');
  const tip = tipLayer(wrap);
  let lastW = 0;
  const draw = (W) => {
    if (Math.abs(W - lastW) < 2) return;
    lastW = W;
    const horizontal = orientation(data, W, opts) === 'horizontal';
    const svg = horizontal ? drawHorizontal(data, W, opts) : drawVertical(data, W, opts, tip);
    wrap.classList.toggle('is-horizontal', horizontal);
    const old = wrap.querySelector(':scope > svg');
    if (old) old.replaceWith(svg); else wrap.prepend(svg);
  };
  draw(opts.width || 560);
  observeWidth(wrap, draw);
  return wrap;
}

function orientation(data, W, opts) {
  if (opts.orientation === 'horizontal' || opts.orientation === 'vertical') return opts.orientation;
  if (!data.length) return 'vertical';
  if (data.length > 12) return 'horizontal';
  const slot = (W - 48) / data.length;
  const widest = Math.max(...data.map((d) => measure(d.label)));
  return widest > slot - 6 ? 'horizontal' : 'vertical';
}

function drawVertical(data, W, opts, tip) {
  const rtl = isRtl();
  const H = opts.height || 200;
  const n = Math.max(1, data.length);
  const unit = opts.unit || '';
  const maxV = Math.max(0, ...data.filter((d) => !isMissing(d)).map((d) => d.value));
  const { max: top, ticks } = niceScale(opts.max ?? maxV, { integer: opts.integer ?? opts.max == null, count: H < 170 ? 3 : 4 });
  const tickW = Math.ceil(Math.max(...ticks.map((v) => measure(fmtNum(v))))) + 10;
  const padT = 20; const padB = 26;
  const x0 = rtl ? 2 : tickW; const x1 = rtl ? W - tickW : W - 2;
  const plotW = Math.max(10, x1 - x0); const plotH = H - padT - padB;
  const yOf = (v) => padT + plotH - (plotH * v) / top;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'list', 'aria-label': opts.label || L('رسم بياني بالأعمدة', 'Bar chart') });
  for (const v of ticks) {
    const y = yOf(v);
    svg.append(s('line', { x1: x0, x2: x1, y1: y, y2: y, class: v === 0 ? 'ch-axis' : 'ch-grid' }));
    svg.append(label(rtl ? x1 + 6 : x0 - 6, y + 4, fmtNum(v), { align: rtl ? 'left' : 'right' }));
  }
  const slot = plotW / n;
  const bw = Math.max(6, Math.min(opts.barWidth || 30, slot * 0.56));
  const marks = [];
  data.forEach((d, i) => {
    const idx = rtl ? n - 1 - i : i;
    const cx = x0 + slot * idx + slot / 2;
    const full = d.title || d.label;
    const g = s('g', { class: `ch-bar${d.muted ? ' is-muted' : ''}`, role: 'listitem', tabindex: i === 0 ? 0 : -1, 'aria-label': `${full}: ${valueText(d, unit)}` });
    let topY = padT + plotH;
    if (isMissing(d)) {
      // Not reported: dashed ghost column + label — visibly different from zero.
      g.append(s('rect', { x: cx - bw / 2, y: padT + 2, width: bw, height: plotH - 2, rx: 4, class: 'ch-missing' }));
      g.append(label(cx, padT - 6, L('غ.م', 'n/a'), { cls: 'ch-val is-missing' }));
      topY = padT;
    } else if (d.value > 0) {
      const bh = Math.max(3, (plotH * d.value) / top);
      const y = padT + plotH - bh; const r = Math.min(4, bw / 2, bh);
      const L0 = cx - bw / 2; const R0 = cx + bw / 2; const B = padT + plotH;
      g.append(s('path', { d: `M${L0},${B} V${y + r} Q${L0},${y} ${L0 + r},${y} H${R0 - r} Q${R0},${y} ${R0},${y + r} V${B} Z`, class: 'ch-fill' }, { fill: fillOf(d, opts) }));
      if (n <= 12 && !d.muted) g.append(label(cx, y - 6, `${fmtNum(d.value)}${unit}`, { cls: 'ch-val' }));
      topY = y;
    }
    g.append(s('rect', { x: x0 + slot * idx, y: padT, width: slot, height: plotH, class: 'ch-hit' }));
    g.append(label(cx, H - 8, fit(d.label, slot - 4), { cls: `ch-cat${d.emphasis ? ' is-em' : ''}` }));
    const show = () => tip.show(cx, topY - 8, `${full}: ${valueText(d, unit)}`);
    g.addEventListener('pointerenter', show); g.addEventListener('focus', show);
    g.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') tip.hide(); });
    g.addEventListener('blur', tip.hide);
    marks.push(g); svg.append(g);
  });
  rovingKeys(svg, marks, rtl);
  return svg;
}

// Horizontal bars: full label on its own line, value at the end of the line,
// bar underneath (grows from the right in RTL). Best for long category names.
function drawHorizontal(data, W, opts) {
  const rtl = isRtl();
  const unit = opts.unit || '';
  const maxV = Math.max(0, ...data.filter((d) => !isMissing(d)).map((d) => d.value));
  const top = opts.max ?? niceScale(maxV, { integer: opts.integer ?? true, count: 4 }).max;
  const rowH = 44; const barH = 8; const lineY = 14; const barY = 22;
  const H = Math.max(rowH, data.length * rowH - 8);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'list', 'aria-label': opts.label || L('رسم بياني بالأعمدة', 'Bar chart') });
  const marks = [];
  data.forEach((d, i) => {
    const y0 = i * rowH;
    const val = valueText(d, unit);
    const vw = measure(val, TEXT, 600) + 12;
    const g = s('g', { class: 'ch-row', role: 'listitem', tabindex: i === 0 ? 0 : -1, 'aria-label': `${d.title || d.label}: ${val}` });
    g.append(s('rect', { x: 0, y: y0 - 2, width: W, height: rowH - 6, rx: 8, class: 'ch-hit' }));
    // label (start side) and value (end side) on one line
    g.append(label(rtl ? W : 0, y0 + lineY, fit(d.label, W - vw), { align: rtl ? 'right' : 'left', cls: 'ch-name' }));
    g.append(label(rtl ? 0 : W, y0 + lineY, val, { align: rtl ? 'left' : 'right', cls: `ch-val${isMissing(d) ? ' is-missing' : ''}` }));
    if (isMissing(d)) {
      g.append(s('rect', { x: 0.5, y: y0 + barY + 0.5, width: W - 1, height: barH - 1, rx: barH / 2, class: 'ch-missing' }));
    } else {
      g.append(s('rect', { x: 0, y: y0 + barY, width: W, height: barH, rx: barH / 2, class: 'ch-track' }));
      const bw = top > 0 ? Math.max(d.value > 0 ? barH : 0, (W * Math.min(d.value, top)) / top) : 0;
      if (bw > 0) g.append(s('rect', { x: rtl ? W - bw : 0, y: y0 + barY, width: bw, height: barH, rx: barH / 2, class: 'ch-fill' }, { fill: fillOf(d, opts) }));
    }
    marks.push(g); svg.append(g);
  });
  rovingKeys(svg, marks, false);
  return svg;
}

// ============================== Donut ==============================
export function donutChart(data, opts = {}) {
  const wrap = h('div.chart.donut-chart');
  const total = data.reduce((a, d) => a + (d.value || 0), 0);
  const size = opts.size || 156; const sw = 18; const c = size / 2; const r = c - sw / 2 - 1;
  const circ = 2 * Math.PI * r;
  const summary = data.map((d) => `${d.label} ${fmtNum(d.value || 0)}`).join(L('، ', ', '));
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, role: 'img', 'aria-label': `${opts.label || L('رسم دائري', 'Donut chart')}: ${summary}` });
  svg.append(s('circle', { cx: c, cy: c, r, class: 'ch-ring' }));
  const shown = data.filter((d) => d.value > 0);
  const gap = shown.length > 1 ? 3 : 0;
  let acc = 0;
  const segs = new Map();
  data.forEach((d, i) => {
    const color = d.color || SERIES[i % SERIES.length];
    if (!(d.value > 0) || !total) return;
    const frac = d.value / total;
    const seg = s('circle', { cx: c, cy: c, r, class: 'ch-seg', 'data-i': i, 'stroke-dasharray': `${Math.max(0.01, frac * circ - gap)} ${circ}`, 'stroke-dashoffset': -acc * circ, transform: `rotate(-90 ${c} ${c})` }, { stroke: color });
    segs.set(i, seg); svg.append(seg); acc += frac;
  });
  const tv = s('text', { x: c, y: c + 4, 'text-anchor': 'middle', class: 'ch-total' }); tv.textContent = fmtNum(total);
  const tl = s('text', { x: c, y: c + 22, 'text-anchor': 'middle', class: 'ch-cap' }); tl.textContent = opts.totalLabel || L('الإجمالي', 'Total');
  svg.append(tv, tl);

  const rows = data.map((d, i) => {
    const pct = total ? Math.round(((d.value || 0) / total) * 100) : 0;
    return h('li', { 'data-i': i }, h('i.sw', { style: { background: d.color || SERIES[i % SERIES.length] } }), h('span.lbl', d.label), h('span.v', fmtNum(d.value || 0)), h('span.p', `${fmtNum(pct)}%`));
  });
  const legend = h('ul.donut-legend', rows);
  const activate = (i) => {
    wrap.classList.toggle('has-active', i != null);
    for (const [k, seg] of segs) seg.classList.toggle('is-active', k === i);
    rows.forEach((row, k) => row.classList.toggle('is-active', k === i));
  };
  rows.forEach((row, i) => { row.addEventListener('pointerenter', () => activate(i)); row.addEventListener('pointerleave', () => activate(null)); });
  for (const [i, seg] of segs) { seg.addEventListener('pointerenter', () => activate(i)); seg.addEventListener('pointerleave', () => activate(null)); }
  wrap.append(h('div.donut-figure', svg), legend);
  return wrap;
}
