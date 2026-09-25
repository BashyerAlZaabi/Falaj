// My Apps (#/apps): the launcher. The server decides which apps a person sees
// (role, department, admin flag) and returns them in /api/me. Visibility here
// never grants data access; each app still enforces its own permissions.
// Vault apps open on Vault's own origin in a new window — the portal never
// reads their content. Points shown here come only from GET /api/game/me.
//
// Also exports small helpers shared by the Smart Uploader and admin views
// (bidi isolation, copy to clipboard, Arabic counting, Vault SSO links).
import { api } from '../api.js';
import { h, icon, toast, emptyState, debounce } from '../ui.js';
import { L, t, fmtNum, getLang } from '../i18n.js';
import { state } from '../state.js';
import { ICONS } from '../icons-data.js';

// ---------------------------------------------------------------- shared helpers
// Wrap Latin runs inside Arabic text in <bdi> so parentheses and product names
// ("… (اتجاه واحد إلى Vault)") keep their place in RTL.
const LATIN_RUN = /([A-Za-z][A-Za-z0-9 ._\-/+&]*[A-Za-z0-9]|[A-Za-z])/;
export function bidi(text) {
  const s = String(text ?? '');
  if (document.documentElement.dir !== 'rtl' || !/[A-Za-z]/.test(s) || !/[؀-ۿ]/.test(s)) return s;
  return s.split(LATIN_RUN).filter((p) => p !== '').map((p) => (/^[A-Za-z]/.test(p) ? h('bdi', p) : p));
}

export async function copyText(text, done) {
  let ok = false;
  try { await navigator.clipboard.writeText(text); ok = true; } catch {
    const ta = h('textarea.sr-only', { readonly: true, 'aria-hidden': 'true' }, text);
    document.body.append(ta); ta.select();
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
  }
  toast(ok ? (done || L('نُسخ', 'Copied')) : L('تعذّر النسخ — انسخه يدوياً', 'Could not copy — copy it manually'), { kind: ok ? null : 'error', timeout: 2600 });
  return ok;
}

// Counted nouns with Arabic plural forms: forms = { one, two, few, many, other, zero } ('%' = the number).
const AR_PLURAL = new Intl.PluralRules('ar');
export function countText(n, ar, en) {
  const f = ar[AR_PLURAL.select(n)] ?? ar.other;
  const arText = f.replace('%', fmtNum(n));
  return L(arText, `${fmtNum(n)} ${n === 1 ? en[0] : en[1]}`);
}

// Same SSO hand-off the tiles have always used (Vault origin, /sso/start).
export const vaultHref = (a) => `${a.url.replace(/\/(fs|marsad)$/, '')}/sso/start?next=${encodeURIComponent(a.route)}`;

// Arabic-aware search normalisation
export const norm = (s) => String(s || '').toLowerCase().replace(/[ً-ٰٟـ]/g, '').replace(/[أإآ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي');

const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } } };

// ---------------------------------------------------------------- catalogue presentation
const ICON_FOR = { portal: 'home', adaa: 'gauge', projects: 'folder', tasks: 'listChecks', documents: 'fileText', office: 'bot', smart_uploader: 'fileUp', fs: 'wallet', marsad: 'radar', hr: 'idCard', admin: 'settings' };
const TONE_FOR = { portal: 'accent', adaa: 'emph', projects: 'accent', tasks: 'green', documents: 'orange', office: 'emph', smart_uploader: 'vault', fs: 'vault', marsad: 'vault', hr: 'neutral', admin: 'neutral' };
const SYS_TONE = { strategy: 'accent', governance: 'emph', people: 'green', operations: 'orange', platform: 'sand' };
const SYS_ORDER = ['strategy', 'governance', 'people', 'operations', 'platform'];
// English copy for catalogue rows that only carry an Arabic description.
const DESC_EN = { portal: 'Workspace and chat', adaa: 'Monitoring & follow-up dashboard', projects: 'Projects and their progress', tasks: 'My tasks and my team’s', documents: 'Reports, plans and minutes', office: 'Agents that prepare recurring work after your approval', smart_uploader: 'Send files to Marsad — one way into Vault', fs: 'Financial system — inside Vault', marsad: 'Monitoring platform — inside Vault', hr: 'External enterprise system', admin: 'AI Services, agents, skills and MCP' };
// Where the excellence rule behind an app lives (values always come from /api/game/me → rules)
const APP_RULE = { tasks: 'task_done', documents: 'document', office: 'review', projects: 'progress' };
const CLASSIFICATION = { confidential: ['سري', 'Confidential'], restricted: ['مقيّد', 'Restricted'] };

const GROUPS = [
  { key: 'core', ar: 'المنصة', en: 'Platform', icon: 'layers', match: (a) => a.category === 'core' },
  { key: 'work', ar: 'العمل', en: 'Work', icon: 'briefcase', match: (a) => a.category === 'work' },
  { key: 'enterprise', ar: 'الأنظمة المؤسسية', en: 'Enterprise systems', icon: 'building', match: (a) => a.category === 'enterprise' },
  { key: 'vault', ar: 'Vault', en: 'Vault', icon: 'lock', vault: true, match: (a) => a.category === 'vault' || a.category === 'vault-feed' },
  { key: 'admin', ar: 'الإدارة', en: 'Administration', icon: 'shield', match: (a) => a.category === 'admin' },
];
const KNOWN = (a) => GROUPS.some((g) => g.match(a));

const ui = { q: '' };
let lastGame = null;

const sysOf = (a) => (a.system ? state.me.systems?.find((s) => s.key === a.system) : null);
const iconOf = (a) => { const k = ICON_FOR[a.key] || a.icon; return ICONS[k] ? k : 'grid'; };
const toneOf = (a) => TONE_FOR[a.key] || SYS_TONE[sysOf(a)?.category] || (a.zone === 'vault' ? 'vault' : 'accent');
const nameOf = (a) => L(a.name_ar, a.name_en);
const descOf = (a) => L(a.description_ar, a.description_en || DESC_EN[a.key]);
const isOff = (a) => a.integration_status === 'not_connected';
const isVault = (a) => a.zone === 'vault';

const pointsSig = (g) => (g?.rules && g.today_xp < g.daily_cap ? g.rules.map((r) => `${r.key}:${r.points}`).join() : '');
function pointsFor(a, g) {
  if (!g?.rules || !(g.today_xp < g.daily_cap)) return null;
  const rules = a.system ? g.rules.filter((r) => r.system === a.system) : g.rules.filter((r) => r.key === APP_RULE[a.key]);
  const best = Math.max(0, ...rules.map((r) => r.points || 0));
  return best ? { points: best, rule: rules.find((r) => r.points === best) } : null;
}

// ---------------------------------------------------------------- page
export async function renderApps(root, _params = [], { soft = false } = {}) {
  const apps = state.me.apps || [];
  const hadFocus = document.activeElement?.id === 'apps-search' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const page = h('div.ap-page', { onkeydown: onGridKey });
  root.append(page);

  const results = h('div.ap-results');
  const live = h('p.sr-only', { role: 'status', 'aria-live': 'polite' });
  const questSlot = h('div.ap-quest-slot');
  const search = h('input.field#apps-search', { type: 'search', value: ui.q, placeholder: L('ابحث في تطبيقاتك…', 'Search your apps…'), 'aria-label': L('ابحث في التطبيقات', 'Search apps'), autocomplete: 'off',
    oninput: debounce((e) => { ui.q = e.target.value; draw(); }, 100),
    onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; ui.q = ''; draw(); } } });

  page.append(head(apps, search), questSlot, results, live);

  let drawnSig = null;
  function draw() {
    drawnSig = pointsSig(lastGame);
    const focused = document.activeElement?.closest?.('.ap-tile')?.dataset.app;
    const q = norm(ui.q.trim());
    const hit = (a) => !q || norm(`${a.name_ar} ${a.name_en} ${a.description_ar} ${a.description_en || DESC_EN[a.key] || ''}`).includes(q);
    const shown = apps.filter(hit);
    const sections = [];
    if (!q) { const r = recentSection(apps); if (r) sections.push(r); }
    for (const g of GROUPS) {
      const list = shown.filter(g.match);
      if (list.length) sections.push(group(g, sortGroup(g, list)));
    }
    const other = shown.filter((a) => !KNOWN(a));
    if (other.length) sections.push(group({ key: 'other', ar: 'أخرى', en: 'Other', icon: 'grid', match: () => true }, other));
    if (!apps.length) {
      results.replaceChildren(h('section.card', emptyState({ icon: 'grid', title: L('لا تطبيقات متاحة لك بعد', 'No apps available to you yet'), body: L('تظهر التطبيقات هنا حسب دورك وإدارتك. تواصل مع مدير المنصة إن كنت تحتاج إلى تطبيق معيّن.', 'Apps appear here based on your role and department. Contact the platform admin if you need a specific app.'), actions: [{ label: L('العودة إلى مساحة العمل', 'Back to the workspace'), icon: 'home', primary: true, onClick: () => { location.hash = '#/home'; } }] })));
    } else if (!shown.length) {
      results.replaceChildren(h('section.card', emptyState({ compact: true, icon: 'search', title: L('لا تطبيقات مطابقة', 'No matching apps'), body: L(`لا يوجد تطبيق يطابق «${ui.q.trim()}».`, `No app matches “${ui.q.trim()}”.`),
        actions: [{ label: L('مسح البحث', 'Clear search'), icon: 'x', onClick: () => { ui.q = ''; search.value = ''; draw(); search.focus(); } }] })));
    } else results.replaceChildren(...sections);
    live.textContent = q ? L(`${countText(shown.length, AR_APPS, EN_APPS)} مطابقة`, `${countText(shown.length, AR_APPS, EN_APPS)} match`) : '';
    if (focused) results.querySelector(`.ap-tile[data-app="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
  }
  draw();
  if (hadFocus) requestAnimationFrame(() => { search.focus({ preventScroll: true }); try { search.setSelectionRange(...hadFocus); } catch { /* type=search */ } });

  // gamification hint: today's next quest (server-derived); tiles get their
  // points chips once the rules arrive
  const paintQuest = (g) => { const el = questCard(g); questSlot.replaceChildren(...(el ? [el] : [])); if (pointsSig(g) !== drawnSig) draw(); };
  if (lastGame) paintQuest(lastGame); else questSlot.append(h('div.card.ap-quest.is-loading', { 'aria-hidden': 'true' }, h('div.sk.ap-sk-orb'), h('div.grow', h('div.sk.sk-line.w-40'), h('div.sk.sk-line.w-60'))));
  const load = api('/api/game/me').then((g) => { lastGame = g; paintQuest(g); }, () => questSlot.replaceChildren());
  if (soft) await load;
}

const AR_APPS = { zero: 'لا تطبيقات', one: 'تطبيق واحد', two: 'تطبيقان', few: '% تطبيقات', many: '% تطبيقاً', other: '% تطبيق' };
const EN_APPS = ['app', 'apps'];

function head(apps, search) {
  const u = state.me.user;
  const role = t(`role.${u.role}`); const dept = L(u.dept_ar, u.dept_en || u.dept_ar);
  return h('header.page-head.ap-head',
    h('div.ap-titles',
      h('span.eyebrow', L('مساحة التطبيقات', 'App launcher')),
      h('h1', L('تطبيقاتي', 'My Apps'), apps.length ? h('span.ap-count', { 'aria-label': countText(apps.length, AR_APPS, EN_APPS) }, fmtNum(apps.length)) : null),
      h('p.sub',
        h('span', L(`لديك ${countText(apps.length, AR_APPS, EN_APPS)} حسب دورك (${role}) وإدارتك (${dept}).`, `${countText(apps.length, AR_APPS, EN_APPS)} for your role (${role}) and department (${dept}).`)), ' ',
        h('span.sub-more', L('ظهور التطبيق لا يمنح صلاحية على بياناته — كل تطبيق يتحقق من صلاحياتك بنفسه.', 'Seeing an app never grants access to its data — each app checks your permissions itself.')))),
    h('div.actions', h('div.search-field.ap-search', icon('search'), search)));
}

function sortGroup(g, list) {
  if (g.key === 'vault') return [...list].sort((a, b) => (a.category === 'vault-feed' ? -1 : 0) - (b.category === 'vault-feed' ? -1 : 0));
  if (g.key === 'enterprise') {
    const rank = (a) => (isOff(a) ? 99 : SYS_ORDER.indexOf(sysOf(a)?.category) + 1 || 50);
    return [...list].sort((a, b) => rank(a) - rank(b) || nameOf(a).localeCompare(nameOf(b), getLang()));
  }
  return list;
}

function group(g, list) {
  const id = `ap-g-${g.key}`;
  return h(`section.ap-group${g.vault ? '.is-vault' : ''}`, { 'aria-labelledby': id, 'data-group': g.key },
    h('div.ap-group-head',
      h(`h2#${id}.ap-group-title`, icon(g.icon), h('span', L(g.ar, g.en)), h('span.ap-group-count.num', fmtNum(list.length))),
      g.vault ? h('p.ap-group-note', icon('lock', 'sm'), L('تطبيقات Vault تُفتح في نافذة جديدة داخل بيئة معزولة، ولا تقرأ المنصة محتواها.', 'Vault apps open in a new window inside an isolated environment; the platform never reads their content.')) : null),
    h('div.ap-grid', list.map((a) => tile(a))));
}

function recentSection(apps) {
  const keys = store.get('swp.apps.recent');
  if (!Array.isArray(keys)) return null;
  const list = keys.map((k) => apps.find((a) => a.key === k)).filter((a) => a && !isOff(a)).slice(0, 4);
  if (!list.length) return null;
  return h('section.ap-group.is-recent', { 'aria-labelledby': 'ap-g-recent' },
    h('div.ap-group-head', h('h2#ap-g-recent.ap-group-title', icon('history'), h('span', L('المستخدمة مؤخراً', 'Recently used')))),
    h('div.ap-grid', list.map((a) => tile(a, { recent: true }))));
}
function remember(a) {
  const keys = (store.get('swp.apps.recent') || []).filter((k) => k !== a.key);
  store.set('swp.apps.recent', [a.key, ...keys].slice(0, 6));
}

function tile(a, { recent = false } = {}) {
  const vault = isVault(a); const off = isOff(a);
  const name = nameOf(a); const desc = descOf(a);
  const pts = !off ? pointsFor(a, lastGame) : null;
  const sys = sysOf(a);
  const cl = CLASSIFICATION[sys?.classification];
  const meta = [];
  if (vault) meta.push(h('span.chip.tiny.vault', icon('lock'), L('يفتح داخل Vault', 'Opens in Vault')));
  else if (a.category === 'vault-feed') meta.push(h('span.chip.tiny.vault', icon('arrowRight', 'flip-rtl'), L('اتجاه واحد إلى مرصاد', 'One way to Marsad')));
  if (off) meta.push(h('span.chip.tiny.crit', icon('unplug'), L('غير متصل', 'Not connected')));
  if (cl) meta.push(h('span.chip.tiny.outline', icon('lockKeyhole'), L(...cl)));
  if (pts) meta.push(h('span.chip.tiny.purple.ap-pts', { title: L(`حتى +${pts.points} نقاط تميّز: ${pts.rule.ar}`, `Up to +${pts.points} excellence points: ${pts.rule.en}`) }, icon('zap'), h('span.num', `+${fmtNum(pts.points)}`)));
  const offNote = off ? h('span.ap-off-note', state.me.user.is_admin ? L('اضبط التكامل من إدارة المنصة', 'Set up the integration in Platform admin') : L('يُفعَّل بعد ربطه من مدير المنصة', 'Available once the platform admin connects it')) : null;

  const inner = [
    h('span.ap-icon', { 'data-tone': toneOf(a), 'aria-hidden': 'true' }, icon(iconOf(a)), vault ? h('span.ap-icon-badge', icon('lock')) : off ? h('span.ap-icon-badge.off', icon('unplug')) : null),
    h('span.ap-text',
      h('span.ap-name', bidi(name)),
      !recent && desc ? h('span.ap-desc', bidi(desc)) : null,
      !recent && (meta.length || offNote) ? h('span.ap-meta', meta, offNote) : null),
    off && !state.me.user.is_admin ? null : h('span.ap-go', { 'aria-hidden': 'true' }, icon(vault ? 'ext' : 'chevron', vault ? '' : 'flip-rtl')),
    vault ? h('span.sr-only', L(' (يفتح في نافذة جديدة)', ' (opens in a new window)')) : null,
  ];
  if (off && !state.me.user.is_admin) {
    return h('div.card.ap-tile.app-tile.off', { 'aria-disabled': 'true', 'data-app': a.key }, inner);
  }
  const href = off ? '#/admin/integrations' : vault ? vaultHref(a) : a.url;
  return h(`a.card.ap-tile.app-tile${vault ? '.vault' : ''}${off ? '.off' : ''}`, {
    href, 'data-app': a.key, target: vault ? '_blank' : null, rel: vault ? 'noopener noreferrer' : null,
    onclick: off ? null : () => remember(a),
  }, inner);
}

// ---------------------------------------------------------------- quest hint
function questCard(g) {
  if (!g?.quests?.length) return null;
  const done = g.quests.filter((q) => q.done).length; const total = g.quests.length;
  const next = g.quests.find((q) => !q.done);
  const qp = g.rules?.find((r) => r.key === 'quest')?.points;
  const href = next?.cta ? (next.cta.filter ? `${next.cta.route}/${next.cta.filter}` : next.cta.route) : null;
  return h(`section.card.ap-quest${next ? '' : '.all-done'}`, { 'aria-labelledby': 'ap-quest-title' },
    h('span.ap-quest-orb', { 'aria-hidden': 'true' }, icon(next ? next.icon || 'target' : 'trophy')),
    h('div.ap-quest-main',
      h('span.eyebrow#ap-quest-title', next ? L('مهمتك التالية اليوم', 'Your next quest today') : L('مهام اليوم', 'Today’s quests')),
      h('p.ap-quest-text', next ? L(next.ar, next.en) : L('أنجزت كل مهام اليوم — أحسنت!', 'All of today’s quests are done — great work!')),
      h('div.ap-quest-progress', { role: 'img', 'aria-label': L(`أنجزت ${fmtNum(done)} من ${fmtNum(total)}`, `${fmtNum(done)} of ${fmtNum(total)} done`) },
        g.quests.map((q) => h(`i${q.done ? '.on' : ''}`)), h('span.num', `${fmtNum(done)}/${fmtNum(total)}`))),
    h('div.ap-quest-side',
      next && qp ? h('span.chip.purple.ap-pts', icon('zap'), h('span.num', `+${fmtNum(qp)}`), L('نقطة', 'pts')) : null,
      next && href ? h('a.btn.primary.sm', { href, 'aria-label': L(`ابدأ: ${next.ar}`, `Start: ${next.en}`) }, L('ابدأ', 'Start'), icon('arrowRight', 'flip-rtl')) : null,
      h('a.ap-quest-score', { href: '#/achievements', 'aria-label': L(`${fmtNum(g.today_xp)} نقطة اليوم — كل الإنجازات`, `${fmtNum(g.today_xp)} points today — all achievements`) },
        h('strong.num', g.today_xp > 0 ? `+${fmtNum(g.today_xp)}` : fmtNum(0)), h('span', L('نقطة اليوم', 'pts today')))));
}

// ---------------------------------------------------------------- keyboard: arrows move across tiles
function onGridKey(e) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(e.key)) return;
  const tileEl = e.target.closest?.('a.ap-tile');
  if (!tileEl || e.target !== tileEl) return;
  const page = e.currentTarget;
  const all = [...page.querySelectorAll('a.ap-tile')];
  const grid = tileEl.parentElement; const inGrid = [...grid.querySelectorAll(':scope > a.ap-tile')];
  const cols = Math.max(1, getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length);
  const rtl = document.documentElement.dir === 'rtl';
  let target = null;
  if (e.key === 'Home') target = all[0];
  else if (e.key === 'End') target = all[all.length - 1];
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') target = all[all.indexOf(tileEl) + ((e.key === 'ArrowRight') !== rtl ? 1 : -1)];
  else {
    const i = inGrid.indexOf(tileEl) + (e.key === 'ArrowDown' ? cols : -cols);
    if (inGrid[i]) target = inGrid[i];
    else {
      const grids = [...page.querySelectorAll('.ap-grid')].filter((g) => g.querySelector(':scope > a.ap-tile'));
      const other = grids[grids.indexOf(grid) + (e.key === 'ArrowDown' ? 1 : -1)];
      const list = other ? [...other.querySelectorAll(':scope > a.ap-tile')] : [];
      target = e.key === 'ArrowDown' ? list[Math.min(inGrid.indexOf(tileEl) % cols, list.length - 1)] : list[Math.min(list.length - 1, Math.floor((list.length - 1) / cols) * cols + (inGrid.indexOf(tileEl) % cols))];
    }
  }
  if (target) { e.preventDefault(); target.focus(); }
}
