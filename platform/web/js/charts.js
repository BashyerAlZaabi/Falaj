// Approved chart components: vertical bar & donut. Thin marks, rounded data
// ends anchored to the baseline, recessive grid, hover tooltips, legends for
// multi-series, and "not reported" values drawn distinctly (never as zero).
import { h } from './ui.js';
import { fmtNum, L } from './i18n.js';

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };
const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)', 'var(--s4)'];

function tipLayer(wrap) {
  const tip = h('div.tip', { role: 'tooltip' });
  wrap.append(tip);
  return {
    show(x, y, text) { tip.textContent = text; tip.style.left = `${x}px`; tip.style.top = `${y}px`; tip.style.opacity = 1; },
    hide() { tip.style.opacity = 0; },
  };
}

// data: [{label, value, missing?}] ; opts: {unit, max, color}
export function barChart(data, opts = {}) {
  const wrap = h('div.chart');
  const W = 560, H = 220, padB = 44, padT = 14, padX = 28;
  const max = opts.max ?? Math.max(1, ...data.map((d) => d.value || 0));
  const niceMax = opts.max ?? (max <= 5 ? Math.max(1, Math.ceil(max)) : Math.ceil(max / 5) * 5);
  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': opts.label || 'bar chart' });
  const plotH = H - padB - padT; const plotW = W - padX * 2;
  // grid
  for (let i = 0; i <= 4; i++) {
    const y = padT + plotH - (plotH * i) / 4;
    svg.append(s('line', { x1: padX, x2: W - padX, y1: y, y2: y, stroke: i === 0 ? 'var(--axis)' : 'var(--grid)', 'stroke-width': 1 }));
    const tl = s('text', { x: padX - 6, y: y + 4, 'font-size': 10, fill: 'var(--faint)', 'text-anchor': 'end', style: 'font-variant-numeric:tabular-nums' });
    tl.textContent = fmtNum(Math.round((niceMax * i) / 4)); svg.append(tl);
  }
  const n = Math.max(1, data.length);
  const slot = plotW / n; const bw = Math.min(36, slot * 0.55);
  const tip = tipLayer(wrap);
  const rtl = document.documentElement.dir === 'rtl';
  data.forEach((d, i) => {
    const idx = rtl ? n - 1 - i : i;
    const cx = padX + slot * idx + slot / 2;
    const g = s('g', { tabindex: 0, role: 'listitem' });
    const label = `${d.label}: ${d.missing || d.value == null ? L('غير محدد', 'not reported') : fmtNum(d.value) + (opts.unit || '')}`;
    g.setAttribute('aria-label', label);
    if (d.missing || d.value == null) {
      g.append(s('rect', { x: cx - bw / 2, y: padT + plotH - 6, width: bw, height: 6, rx: 3, fill: 'none', stroke: 'var(--faint)', 'stroke-dasharray': '3 2' }));
    } else {
      const bh = Math.max(d.value > 0 ? 3 : 0, (plotH * d.value) / niceMax);
      const y = padT + plotH - bh; const r = Math.min(4, bw / 2, bh);
      // rounded top only, square at baseline
      g.append(s('path', { d: `M${cx - bw / 2},${padT + plotH} V${y + r} Q${cx - bw / 2},${y} ${cx - bw / 2 + r},${y} H${cx + bw / 2 - r} Q${cx + bw / 2},${y} ${cx + bw / 2},${y + r} V${padT + plotH} Z`, fill: d.color || opts.color || SERIES[0] }));
      if (data.length <= 8) { const v = s('text', { x: cx, y: y - 4, 'font-size': 11, fill: 'var(--ink-2)', 'text-anchor': 'middle' }); v.textContent = fmtNum(d.value) + (opts.unit || ''); g.append(v); }
    }
    const hit = s('rect', { x: padX + slot * idx, y: padT, width: slot, height: plotH, fill: 'transparent' });
    g.append(hit);
    const lbl = s('text', { x: cx, y: H - padB + 16, 'font-size': 11, fill: 'var(--muted)', 'text-anchor': 'middle' });
    lbl.textContent = d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label; g.append(lbl);
    const show = () => { const b = wrap.getBoundingClientRect(); const sc = b.width / W; tip.show(cx * sc, padT * sc + 10, label); };
    g.addEventListener('mouseenter', show); g.addEventListener('focus', show);
    g.addEventListener('mouseleave', tip.hide); g.addEventListener('blur', tip.hide);
    svg.append(g);
  });
  wrap.prepend(svg);
  return wrap;
}

// data: [{label, value}] -> donut with legend + direct labels
export function donutChart(data, opts = {}) {
  const wrap = h('div.chart', { style: { maxWidth: '360px', margin: 'auto' } });
  const total = data.reduce((a, d) => a + (d.value || 0), 0);
  const size = 200, r = 78, sw = 22, c = size / 2;
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, role: 'img', 'aria-label': opts.label || 'donut chart' });
  svg.append(s('circle', { cx: c, cy: c, r, fill: 'none', stroke: 'var(--grid)', 'stroke-width': sw }));
  const tip = tipLayer(wrap);
  let acc = 0; const circ = 2 * Math.PI * r;
  data.forEach((d, i) => {
    if (!d.value) return;
    const frac = d.value / total; const gap = data.filter((x) => x.value).length > 1 ? 2 : 0;
    const seg = s('circle', { cx: c, cy: c, r, fill: 'none', stroke: SERIES[i % SERIES.length], 'stroke-width': sw, 'stroke-dasharray': `${Math.max(0, frac * circ - gap)} ${circ}`, 'stroke-dashoffset': -acc * circ, transform: `rotate(-90 ${c} ${c})`, tabindex: 0 });
    const label = `${d.label}: ${fmtNum(d.value)} (${Math.round(frac * 100)}%)`;
    seg.setAttribute('aria-label', label);
    const show = () => { const b = wrap.getBoundingClientRect(); tip.show(b.width / 2, b.width / 2 - 20, label); };
    seg.addEventListener('mouseenter', show); seg.addEventListener('focus', show); seg.addEventListener('mouseleave', tip.hide); seg.addEventListener('blur', tip.hide);
    svg.append(seg); acc += frac;
  });
  const tv = s('text', { x: c, y: c + 2, 'text-anchor': 'middle', 'font-size': 28, 'font-weight': 600, fill: 'var(--ink)' }); tv.textContent = fmtNum(total);
  const tl = s('text', { x: c, y: c + 22, 'text-anchor': 'middle', 'font-size': 11, fill: 'var(--muted)' }); tl.textContent = opts.totalLabel || L('الإجمالي', 'Total');
  svg.append(tv, tl);
  wrap.prepend(svg);
  wrap.append(h('div.legend', data.map((d, i) => h('span', h('i', { style: { background: SERIES[i % SERIES.length] } }), `${d.label} · ${fmtNum(d.value)}`))));
  return wrap;
}
