// Gamification UI kit: activity rings, level orb, quest list, badge tile,
// sidebar level chip, and celebrations when real work earns points.
import { api } from './api.js';
import { h, icon, toast, debounce } from './ui.js';
import { L, fmtNum } from './i18n.js';
import { on, state } from './state.js';

let last = null;
export const current = () => last;
export async function loadGame() { last = await api('/api/game/me'); return last; }

const NS = 'http://www.w3.org/2000/svg';
const s = (tag, attrs = {}) => { const e = document.createElementNS(NS, tag); for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v); return e; };

// Apple-Activity-style concentric rings. rings: [{pct, color:'series-1', ar, en, value, goal}]
export function ringsSvg(rings, size = 168) {
  const svg = s('svg', { viewBox: `0 0 ${size} ${size}`, width: size, height: size, class: 'rings', role: 'img', 'aria-label': rings.map((r) => `${L(r.ar, r.en)} ${r.value ?? '—'}/${r.goal}`).join('، ') });
  const stroke = Math.round(size * 0.095); const gap = Math.round(stroke * 0.28);
  rings.forEach((r, i) => {
    const rad = size / 2 - stroke / 2 - i * (stroke + gap) - 2;
    const c = 2 * Math.PI * rad; const pct = Math.max(0, r.pct || 0);
    const g = s('g', { class: `ring ring-${i}`, style: `--ring:var(--${r.color})` });
    g.append(s('circle', { cx: size / 2, cy: size / 2, r: rad, fill: 'none', class: 'ring-track', 'stroke-width': stroke }));
    const arc = s('circle', { cx: size / 2, cy: size / 2, r: rad, fill: 'none', class: 'ring-arc', 'stroke-width': stroke, 'stroke-linecap': 'round', 'stroke-dasharray': `${c} ${c}`, 'stroke-dashoffset': c, transform: `rotate(-90 ${size / 2} ${size / 2})` });
    arc.style.setProperty('--target', String(c * (1 - Math.min(1, pct / 100))));
    arc.style.setProperty('--circ', String(c));
    g.append(arc);
    if (pct > 100) g.append(s('circle', { cx: size / 2, cy: size / 2 - rad, r: stroke / 2.4, class: 'ring-lap' }));
    svg.append(g);
  });
  requestAnimationFrame(() => requestAnimationFrame(() => svg.classList.add('in')));
  return svg;
}

export function ringLegend(rings) {
  return h('ul.ring-legend', rings.map((r) => h('li', { style: { '--ring': `var(--${r.color})` } },
    h('span.ring-dot'), h('span.grow', L(r.ar, r.en)),
    h('span.num.tabular', h('strong', r.value == null ? '—' : `${fmtNum(r.value)}${r.unit_ar === '%' ? '%' : ''}`), h('span.faint', r.unit_ar === '%' ? '' : ` / ${fmtNum(r.goal)}`)))));
}

export function levelOrb(g, { size = 'md' } = {}) {
  return h(`div.level-orb.${size}`, { role: 'img', 'aria-label': L(`المستوى ${g.level.n}: ${g.level.ar}`, `Level ${g.level.n}: ${g.level.en}`) },
    h('span.lvl-n', String(g.level.n)), h('span.lvl-cap', L('المستوى', 'Level')));
}
export function xpBar(g) {
  return h('div.xp', h('div.xp-row', h('strong', L(g.level.ar, g.level.en)), h('span.faint.tabular.num', g.level.to ? `${fmtNum(g.xp)} / ${fmtNum(g.level.to)}` : fmtNum(g.xp))),
    h('div.progress.xp-bar', { role: 'progressbar', 'aria-valuenow': g.level.progress, 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-label': L('التقدم نحو المستوى التالي', 'Progress to next level') }, h('i', { style: { width: `${g.level.progress}%` } })),
    g.level.to ? h('div.tiny.faint', L(`${fmtNum(g.level.to - g.xp)} نقطة للوصول إلى «${g.level.next_ar}»`, `${fmtNum(g.level.to - g.xp)} pts to “${g.level.next_en}”`)) : h('div.tiny.faint', L('وصلت لأعلى مستوى', 'Top level reached')));
}

export function questList(quests, { compact = false } = {}) {
  if (!quests.length) return h('div.empty.tiny', L('لا مهام يومية الآن — أحسنت!', 'No quests right now — nice work!'));
  return h('ul.quests', quests.map((q) => h(`li${q.done ? '.done' : ''}`,
    h('span.q-check', { 'aria-hidden': 'true' }, icon(q.done ? 'check' : q.icon || 'target')),
    h('span.grow', h('span.q-title', L(q.ar, q.en)), compact ? null : h('span.q-xp', q.done ? L('+15 نقطة · مكتملة', '+15 pts · done') : L('+15 نقطة', '+15 pts'))),
    !q.done && q.cta ? h('a.btn.sm.tertiary', { href: q.cta.route, 'aria-label': L(`ابدأ: ${q.ar}`, `Start: ${q.en}`) }, L('ابدأ', 'Go')) : null)));
}

export function badgeTile(b) {
  return h(`div.badge-tile${b.earned ? '.earned' : ''}`, { tabindex: 0, role: 'group', 'aria-label': `${L(b.ar, b.en)} — ${b.earned ? L('مكتسبة', 'earned') : `${b.have}/${b.need}`}`, 'data-tip': L(b.desc_ar, b.desc_en) },
    h('div.badge-medal', icon(b.icon)),
    h('div.badge-name', L(b.ar, b.en)),
    b.earned ? h('div.badge-meta', b.live ? L('حالياً', 'currently') : L('مكتسبة', 'Earned')) : h('div.badge-meta.tabular.num', `${Math.min(b.have, b.need)} / ${b.need}`),
    b.earned ? null : h('div.progress', h('i', { style: { width: `${b.progress}%` } })));
}

// Home hero — «رحلة التميّز»: rings + level/XP + streak + today's points on top,
// today's quests as three actionable cards below. Everything is derived from real work.
export function gameHero(g) {
  const doneQ = g.quests.filter((q) => q.done).length;
  return h('section.card.game-hero', { 'aria-label': L('رحلة التميّز', 'Excellence journey') },
    h('div.gh-rings', ringsSvg(g.rings, 128), h('ul.gh-ring-keys', g.rings.map((r) => h('li', { style: { '--ring': `var(--${r.color})` } }, h('span.ring-dot'), h('span', L(r.ar, r.en)), h('b.tabular.num', r.value == null ? '—' : `${fmtNum(r.value)}${r.unit_ar === '%' ? '%' : `/${fmtNum(r.goal)}`}`))))),
    h('div.gh-body',
      h('div.gh-top',
        levelOrb(g, { size: 'sm' }),
        h('div.grow', xpBar(g)),
        h('div.gh-stat.streak', { 'data-tip': L(`أفضل سلسلة: ${g.streak.best} · عطلة نهاية الأسبوع لا تقطعها`, `Best streak: ${g.streak.best} · weekends never break it`) }, h('span.gs-ic', icon('zap')), h('span', h('strong.tabular', fmtNum(g.streak.current)), h('small', L('يوم متتالٍ', 'day streak')))),
        h('div.gh-stat.today', h('span.gs-ic', icon('sparkle')), h('span', h('strong.tabular.num', `+${fmtNum(g.today_xp)}`), h('small', L('نقطة اليوم', 'points today'))))),
      h('div.gh-q-head', h('span.eyebrow', L(`مهام اليوم · ${doneQ}/${g.quests.length}`, `Today's quests · ${doneQ}/${g.quests.length}`)), h('a.tiny', { href: '#/achievements' }, L('كل الإنجازات', 'All achievements'), icon('chevron', 'flip-rtl'))),
      g.quests.length ? h('ul.quest-cards', g.quests.slice(0, 3).map((q) => h(`li${q.done ? '.done' : ''}`,
        h(q.done || !q.cta ? 'div.qc' : 'a.qc', q.done || !q.cta ? {} : { href: q.cta.route, 'aria-label': L(`ابدأ: ${q.ar}`, `Start: ${q.en}`) },
          h('span.q-check', { 'aria-hidden': 'true' }, icon(q.done ? 'check' : q.icon || 'target')),
          h('span.qc-title', L(q.ar, q.en)),
          h('span.qc-foot', h('span.q-xp', q.done ? L('مكتملة', 'Done') : L('+15 نقطة', '+15 pts')), !q.done && q.cta ? h('span.qc-go', L('ابدأ', 'Go'), icon('chevron', 'flip-rtl')) : null)))))
        : h('div.empty.tiny', L('لا مهام يومية الآن — أحسنت!', 'No quests right now — nice work!'))));
}

// Sidebar chip
export function sidebarChip(g) {
  return h('a.level-chip', { href: '#/achievements', 'aria-label': L(`المستوى ${g.level.n} ${g.level.ar}، ${g.xp} نقطة`, `Level ${g.level.n} ${g.level.en}, ${g.xp} points`) },
    h('span.lc-n', String(g.level.n)),
    h('span.lc-body', h('span.lc-name', L(g.level.ar, g.level.en)), h('span.progress', h('i', { style: { width: `${g.level.progress}%` } }))),
    h('span.lc-xp.tabular', fmtNum(g.xp)));
}

// ---------- celebrations ----------
export function celebrate(anchor, { big = false } = {}) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || last?.prefs?.celebrations === false) return;
  const r = anchor?.getBoundingClientRect?.() || { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
  const layer = h('div.celebrate', { 'aria-hidden': 'true', style: { left: `${r.left + r.width / 2}px`, top: `${r.top + r.height / 2}px` } });
  const n = big ? 28 : 16;
  for (let i = 0; i < n; i++) {
    const a = (Math.PI * 2 * i) / n + (i % 3) * 0.2; const d = (big ? 110 : 70) + (i % 5) * 14;
    layer.append(h('i', { style: { '--dx': `${Math.cos(a) * d}px`, '--dy': `${Math.sin(a) * d}px`, '--c': `var(--series-${(i % 4) + 1})`, animationDelay: `${(i % 4) * 25}ms` } }));
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1400);
}

// Watch real data changes: award feedback only when the SERVER-derived score changed.
let chipHost = null;
export function initGame(host) {
  chipHost = host;
  const refresh = debounce(async () => {
    const prev = last;
    try { await loadGame(); } catch { return; }
    renderChip();
    if (!prev) return;
    const gained = last.xp - prev.xp;
    const newBadges = last.badges.filter((b) => b.earned && !prev.badges.find((x) => x.key === b.key)?.earned);
    const newQuests = last.quests.filter((q) => q.done && !prev.quests.find((x) => x.key === q.key)?.done);
    if (last.level.n > prev.level.n) {
      celebrate(chipHost, { big: true });
      toast(L(`مستوى جديد! أصبحت «${last.level.ar}» (المستوى ${last.level.n})`, `Level up! You're now “${last.level.en}” (level ${last.level.n})`), { kind: 'success', timeout: 6000 });
    } else if (gained > 0) {
      celebrate(chipHost);
      toast(L(`+${gained} نقطة تميّز`, `+${gained} excellence points`), { timeout: 2600 });
    }
    for (const b of newBadges) toast(L(`شارة جديدة: «${b.ar}» — ${b.desc_ar}`, `New badge: “${b.en}” — ${b.desc_en}`), { timeout: 5000 });
    for (const q of newQuests) toast(L(`أنجزت مهمة اليوم: ${q.ar}`, `Quest complete: ${q.en}`), { timeout: 3500 });
  }, 600);
  on('data-changed', (ev) => { if (!ev || ['task', 'project', 'document', 'office', 'all'].includes(ev.entity) || String(ev.entity).includes(',')) refresh(); });
  loadGame().then(renderChip).catch(() => {});
}
function renderChip() { if (chipHost && last) chipHost.replaceChildren(sidebarChip(last)); }
export { state };
