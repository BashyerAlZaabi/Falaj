// Platform admin (#/admin/:tab): AI Services (providers, routing, usage),
// Agents & Skills, MCP, integrations status and users. Admin rights configure
// the platform; they grant no extra data access and cannot reach Vault.
// Tabs live in the URL (#/admin/ai|agents|mcp|integrations|users) so reload,
// back/forward and links work; switching tabs repaints only the tab body.
import { api } from '../api.js';
import { h, icon, modal, toast, skeleton, emptyState, errorState, dataTable, segmented, field, avatar, debounce } from '../ui.js';
import { L, t, fmtDate, fmtTime, fmtNum } from '../i18n.js';
import { state, emit } from '../state.js';
import { bidi, copyText, countText, norm } from './apps.js';

const TAB_KEYS = ['ai', 'agents', 'mcp', 'integrations', 'users'];
const TABS = () => [
  ['ai', L('خدمات الذكاء الاصطناعي', 'AI Services'), 'spark'],
  ['agents', L('الوكلاء والمهارات', 'Agents & Skills'), 'bot'],
  ['mcp', L('خادم MCP', 'MCP server'), 'plug'],
  ['integrations', L('التكاملات', 'Integrations'), 'cable'],
  ['users', L('المستخدمون', 'Users'), 'people'],
];
let lastTab = 'ai';
let loadSeq = 0;
const ui = { users: { q: '', role: 'all', dept: 'all' }, tools: { q: '', kind: 'all' }, flashUser: null, token: null };

const CAPS = () => ({
  chat: [L('المحادثة وفهم الطلبات', 'Chat & intent'), 'chat'],
  generate: [L('إنشاء المحتوى', 'Content generation'), 'wand'],
  summarize: [L('التلخيص', 'Summarization'), 'listChecks'],
  analyze: [L('التحليل', 'Analysis'), 'chartBar'],
  stt: [L('تحويل الكلام إلى نص', 'Speech-to-text'), 'mic'],
  tts: [L('تحويل النص إلى كلام', 'Text-to-speech'), 'speaker'],
});
const capLabel = (c) => CAPS()[c]?.[0] || c;
const KIND = () => ({ anthropic: 'Anthropic', openai_compatible: L('متوافق مع OpenAI', 'OpenAI-compatible'), local: L('محلي', 'Local') });
const ROLES = ['employee', 'manager', 'president'];
const ROLE_TONE = { employee: '', manager: '.info', president: '.purple' };

const AR_USERS = { zero: 'لا مستخدمين', one: 'مستخدم واحد', two: 'مستخدمان', few: '% مستخدمين', many: '% مستخدماً', other: '% مستخدم' };
const AR_DEPTS = { zero: 'لا إدارات', one: 'إدارة واحدة', two: 'إدارتان', few: '% إدارات', many: '% إدارة', other: '% إدارة' };
const AR_AGENTS = { zero: 'لا وكلاء', one: 'وكيل واحد', two: 'وكيلان', few: '% وكلاء', many: '% وكيلاً', other: '% وكيل' };
const AR_TOOLS = { zero: 'لا أدوات', one: 'أداة واحدة', two: 'أداتان', few: '% أدوات', many: '% أداة', other: '% أداة' };

// ---------------------------------------------------------------- page
export async function renderAdmin(root, params = [], { soft = false } = {}) {
  const tab = TAB_KEYS.includes(params[0]) ? params[0] : lastTab;
  lastTab = tab;
  const page = h('div.adm-page');
  root.append(page);
  const body = h('div.adm-body', { role: 'tabpanel', id: 'adm-panel', tabindex: -1 });
  const tabs = tabBar(tab, (k) => switchTab(k, body, tabs));
  page.append(head(), tabs, body);
  body.setAttribute('aria-labelledby', `adm-tab-${tab}`);
  await loadTab(body, tab, { soft });
}

function head() {
  return h('header.page-head.adm-head',
    h('div.adm-titles',
      h('span.eyebrow', L('الإدارة', 'Administration')),
      h('h1', L('إدارة المنصة', 'Platform admin')),
      h('p.sub',
        h('span', L('اضبط خدمات الذكاء الاصطناعي والوكلاء والتكاملات والمستخدمين.', 'Configure AI Services, agents, integrations and users.')), ' ',
        h('span.sub-more', bidi(L('صلاحيات الإدارة تضبط المنصة فقط — لا تمنح اطلاعاً إضافياً على البيانات ولا تصل إلى Vault.', 'Admin rights configure the platform only — they grant no extra data access and cannot reach Vault.'))))),
    h('span.chip.adm-scope', icon('shield'), L('صلاحيات إعداد فقط', 'Configuration only')));
}

function tabBar(tab, onChange) {
  const seg = segmented(TABS().map(([k, label, ic]) => [k, [icon(ic), h('span', label)]]), tab, onChange, { label: L('أقسام إدارة المنصة', 'Platform admin sections') });
  seg.classList.add('adm-tabs');
  const buttons = () => [...seg.querySelectorAll('button[role="tab"]')];
  const sync = () => buttons().forEach((b) => { const on = b.classList.contains('on'); b.id = `adm-tab-${b.dataset.v}`; b.setAttribute('aria-controls', 'adm-panel'); b.tabIndex = on ? 0 : -1; });
  sync();
  seg.addEventListener('click', () => requestAnimationFrame(sync));
  // arrow keys move between tabs (APG tabs pattern, RTL-aware)
  seg.addEventListener('keydown', (e) => {
    const list = buttons(); const i = list.indexOf(document.activeElement);
    if (i < 0) return;
    const rtl = document.documentElement.dir === 'rtl';
    let j = null;
    if (e.key === 'ArrowRight') j = i + (rtl ? -1 : 1);
    else if (e.key === 'ArrowLeft') j = i + (rtl ? 1 : -1);
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = list.length - 1;
    if (j == null) return;
    e.preventDefault();
    const b = list[(j + list.length) % list.length];
    b.focus(); b.click();
  });
  const wrap = h('div.adm-tabs-wrap', seg);
  const edges = () => {
    const max = seg.scrollWidth - seg.clientWidth;
    const pos = Math.abs(seg.scrollLeft);
    wrap.dataset.fade = max <= 1 ? '' : pos <= 1 ? 'end' : pos >= max - 1 ? 'start' : 'both';
  };
  seg.addEventListener('scroll', edges, { passive: true });
  requestAnimationFrame(() => { edges(); const on = seg.querySelector('button.on'); if (on && seg.scrollWidth > seg.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center' }); });
  return wrap;
}

function switchTab(k, body, tabsWrap) {
  if (!TAB_KEYS.includes(k) || k === lastTab) return;
  lastTab = k;
  state.params = [k];
  try { history.pushState(history.state, '', `#/admin/${k}`); } catch { /* ignore */ }
  body.setAttribute('aria-labelledby', `adm-tab-${k}`);
  const on = tabsWrap.querySelector(`button[data-v="${k}"]`);
  if (on && tabsWrap.firstChild.scrollWidth > tabsWrap.firstChild.clientWidth) on.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  loadTab(body, k, { soft: false });
}

const IMPL = () => ({
  ai: { load: () => api('/api/admin/ai'), draw: aiTab, sk: () => [statsSkeleton(4), cardSkeleton('table', 4), cardSkeleton('table', 3)] },
  agents: { load: () => Promise.all([api('/api/admin/agents'), api('/api/skills'), api('/api/catalog')]), draw: agentsTab, sk: () => [statsSkeleton(3), cardSkeleton('table', 4), cardSkeleton('table', 3)] },
  mcp: { load: async () => null, draw: mcpTab, sk: () => [cardSkeleton('card')] },
  integrations: { load: async () => ({ d: await api('/api/admin/ai'), at: new Date().toISOString() }), draw: integrationsTab, sk: () => [cardSkeleton('stat'), h('div.adm-int-grid', [1, 2, 3].map(() => cardSkeleton('card')))] },
  users: { load: () => Promise.all([api('/api/admin/users'), api('/api/admin/departments')]), draw: usersTab, sk: () => [h('div.adm-toolbar', { 'aria-hidden': 'true' }, h('div.sk.adm-sk-seg'), h('div.sk.adm-sk-search')), cardSkeleton('table', 6)] },
});
const cardSkeleton = (kind, n) => h('section.card.adm-card', skeleton(kind, n));
const statsSkeleton = (n) => h('div.adm-stats', { 'aria-hidden': 'true' }, Array.from({ length: n }, () => h('div.card.adm-stat', skeleton('stat'))));

async function loadTab(body, tab, { soft }) {
  const impl = IMPL()[tab];
  const my = ++loadSeq;
  const run = async () => {
    try {
      const data = await impl.load();
      if (my !== loadSeq) return;
      body.replaceChildren(...[].concat(impl.draw(data, body)));
    } catch (e) {
      if (my !== loadSeq) return;
      body.replaceChildren(h('section.card.adm-card', errorState(e, () => { body.replaceChildren(...impl.sk()); run(); })));
    }
  };
  if (soft) return run();
  body.replaceChildren(...impl.sk());
  body.classList.remove('adm-in'); void body.offsetWidth; body.classList.add('adm-in');
  run();
}
const reloadTab = (body) => loadTab(body, lastTab, { soft: true });

// ---------------------------------------------------------------- small building blocks
function cardHead(id, title, { count, sub, actions } = {}) {
  return h('div.card-head.adm-card-head',
    h('div.adm-card-titles',
      h(`h2#${id}.card-title`, title, count != null ? h('span.adm-count.num', fmtNum(count)) : null),
      sub ? h('p.card-sub', sub) : null),
    actions ? h('div.adm-card-actions', actions) : null);
}
function stat({ icon: ic, label, value, sub, tone = '' }) {
  return h(`div.card.adm-stat${tone ? `.is-${tone}` : ''}`,
    h('div.adm-stat-top', h('span.adm-stat-icon', { 'aria-hidden': 'true' }, icon(ic)), h('span.adm-stat-label', label)),
    h('div.adm-stat-value.num', value),
    sub ? h('div.adm-stat-sub', sub) : null);
}
const STATE = {
  connected: ['good', 'circleCheck', 'متصل', 'Connected'],
  local: ['', 'monitor', 'محلي', 'Local'],
  configured: ['warn', 'circleDashed', 'لم يُختبر بعد', 'Untested'],
  not_configured: ['crit', 'unplug', 'غير متصل', 'Not connected'],
  error: ['crit', 'circleX', 'خطأ اتصال', 'Connection error'],
  disabled: ['', 'ban', 'معطّل', 'Disabled'],
  missing: ['crit', 'circleAlert', 'غير موجود', 'Missing'],
};
const stateChip = (s) => { const [tone, ic, ar, en] = STATE[s?.state] || STATE.missing; return h(`span.chip.tiny${tone ? `.${tone}` : ''}`, icon(ic), L(ar, en)); };
const usable = (p) => !!p && (p.kind === 'local' || ['connected', 'configured'].includes(p.status?.state));
function formError(body, msg) {
  let el = body.querySelector('.adm-form-error');
  if (!msg) { el?.remove(); return; }
  if (!el) { el = h('div.adm-form-error', { role: 'alert' }); body.prepend(el); }
  el.replaceChildren(icon('circleAlert'), h('span', bidi(msg)));
}
function setFieldError(control, msg) {
  const wrap = control.closest('.form-field'); if (!wrap) return;
  wrap.querySelector('.error-text')?.remove();
  if (msg) {
    const id = `${control.id}-err`;
    control.setAttribute('aria-invalid', 'true'); control.setAttribute('aria-describedby', id);
    wrap.append(h('div.error-text', { id }, icon('circleAlert', 'sm'), msg));
  } else { control.removeAttribute('aria-invalid'); control.removeAttribute('aria-describedby'); }
}
const dialogButton = (body, sel = '.actions .btn.primary, .actions .btn.danger') => body.closest('.modal')?.querySelector(sel);
async function submitting(body, fn) {
  const btn = dialogButton(body);
  if (btn?.classList.contains('is-loading')) return false;
  btn?.classList.add('is-loading');
  try { return await fn(); } finally { btn?.classList.remove('is-loading'); }
}

// ================================================================ AI Services
function aiTab(d) {
  const caps = d.capabilities;
  const byId = new Map(d.providers.map((p) => [p.id, p]));
  const summary = h('div.adm-ai-summary');
  const paintSummary = () => summary.replaceChildren(aiHealth(d, byId), aiStats(d, byId));
  paintSummary();

  // providers
  const providers = h('section.card.adm-card', { 'aria-labelledby': 'adm-prov-title' },
    cardHead('adm-prov-title', L('المزوّدون والنماذج', 'Providers & models'), {
      count: d.providers.length,
      sub: L('المفاتيح تُحفظ في متغيرات بيئة الخادم فقط ولا تُعرض هنا.', 'Keys live only in server environment variables and are never shown here.'),
      actions: h('button.btn.sm.tertiary', { type: 'button', onclick: () => editProvider() }, icon('plus'), L('إضافة مزوّد', 'Add provider')) }),
    dataTable({
      caption: L('مزوّدو النماذج وحالتهم', 'Model providers and their status'),
      sortKey: 'name',
      rowAttrs: (p) => ({ 'data-provider': p.id }),
      columns: [
        { key: 'name', label: L('المزوّد', 'Provider'), sort: (p) => p.name, render: (p) => h('div.adm-prov',
          h('span.adm-glyph', { 'data-kind': p.kind, 'aria-hidden': 'true' }, icon(p.kind === 'local' ? 'monitor' : p.kind === 'anthropic' ? 'sparkle' : 'network')),
          h('div.adm-prov-text', h('span.adm-prov-name', bidi(p.name)), h('span.adm-prov-sub', KIND()[p.kind] || p.kind, p.model ? [' · ', h('bdi.adm-nowrap', p.model)] : null))) },
        { key: 'status', label: L('الحالة', 'Status'), sort: (p) => Object.keys(STATE).indexOf(p.status?.state), render: (p) => h('div.adm-status',
          stateChip(p.status),
          p.api_key_env ? h('span.adm-status-sub', L('متغير المفتاح', 'Key variable'), ' ', h('code', p.api_key_env)) : null,
          p.status?.state === 'error' && p.last_check_message ? h('span.adm-status-sub.adm-bad', bidi(p.last_check_message)) : null,
          p.last_check_at ? h('span.adm-status-sub', L(`آخر اختبار ${fmtDate(p.last_check_at)} ${fmtTime(p.last_check_at)}`, `Last tested ${fmtDate(p.last_check_at)} ${fmtTime(p.last_check_at)}`)) : null) },
        { key: 'actions', label: '', render: (p) => (p.kind === 'local'
          ? h('span.adm-builtin', L('مدمج — لا يحتاج ضبطاً', 'Built in — nothing to set up'))
          : h('div.adm-row-actions',
            h('button.btn.sm', { type: 'button', onclick: (e) => testProvider(p, e.currentTarget) }, icon('activity'), L('اختبار', 'Test')),
            h('button.icon-btn', { type: 'button', 'aria-label': L(`تعديل ${p.name}`, `Edit ${p.name}`), 'data-tip': t('edit'), onclick: () => editProvider(p) }, icon('pencil')))) },
      ],
      rows: d.providers,
    }));

  // routing
  const routeRows = caps.map((c) => {
    const status = h('div.adm-route-status');
    const paint = () => {
      const p = byId.get(d.routing[c]);
      const ok = usable(p);
      status.replaceChildren(h(`span.adm-dot.is-${!p ? 'bad' : p.kind === 'local' ? 'local' : ok ? 'good' : 'warn'}`, { 'aria-hidden': 'true' }),
        h('span', !p ? L('غير موجَّه', 'Not routed') : p.kind === 'local' ? L('محلي', 'Local') : ok ? L('يعمل عبر المزوّد', 'Served by provider') : L('يعمل بالبديل المحلي', 'Running on local fallback')));
    };
    const sel = h('select.field.adm-route-select', { 'aria-label': L(`المزوّد الموجَّه لـ ${capLabel(c)}`, `Provider for ${capLabel(c)}`),
      onchange: async () => {
        const prev = d.routing[c]; const next = sel.value;
        if (prev === next) return;
        d.routing[c] = next; paint(); paintSummary();
        sel.disabled = true;
        try {
          await api('/api/admin/ai/routing', { method: 'PUT', body: { capability: c, provider_id: next } });
          const name = byId.get(next)?.name || next;
          toast(L(`تم توجيه «${capLabel(c)}» إلى «${name}»`, `“${capLabel(c)}” now routes to “${name}”`), { action: prev ? t('undo') : null, onAction: () => { sel.value = prev; sel.dispatchEvent(new Event('change')); } });
        } catch (e) {
          d.routing[c] = prev; sel.value = prev; paint(); paintSummary();
          toast(L(`تعذّر حفظ التوجيه: ${e.message}`, `Could not save routing: ${e.message}`), { kind: 'error' });
        } finally { sel.disabled = false; }
      } }, d.providers.map((p) => h('option', { value: p.id, selected: d.routing[c] === p.id || null }, p.name)));
    paint();
    const [label, ic] = CAPS()[c] || [c, 'spark'];
    return h('tr', { 'data-capability': c },
      h('td', h('div.adm-cap', h('span.adm-glyph.sm', { 'aria-hidden': 'true' }, icon(ic)), h('span', label))),
      h('td', { 'data-label': L('المزوّد', 'Provider') }, sel),
      h('td', { 'data-label': L('الحالة', 'Status') }, status));
  });
  const routing = h('section.card.adm-card', { 'aria-labelledby': 'adm-route-title' },
    cardHead('adm-route-title', L('توجيه القدرات', 'Capability routing'), { sub: L('اختر المزوّد الذي يخدم كل قدرة. إن لم يكن متصلاً تعمل المنصة بالبديل المحلي وتوضّح ذلك للمستخدم.', 'Pick the provider behind each capability. If it isn’t connected, the platform falls back to local and says so.') }),
    h('div.table-wrap', h('table.tbl.stack-mobile.adm-route-table',
      h('caption.sr-only', L('توجيه القدرات إلى المزوّدين', 'Capability routing')),
      h('thead', h('tr', h('th', { scope: 'col' }, L('القدرة', 'Capability')), h('th', { scope: 'col' }, L('المزوّد', 'Provider')), h('th', { scope: 'col' }, L('الحالة', 'Status')))),
      h('tbody', routeRows))));

  // usage
  const totalCalls = d.usage.reduce((a, u) => a + (u.calls || 0), 0);
  const usage = h('section.card.adm-card', { 'aria-labelledby': 'adm-usage-title' },
    cardHead('adm-usage-title', L('الاستخدام', 'Usage'), { sub: totalCalls ? L(`إجمالي الاستدعاءات ${fmtNum(totalCalls)} — موزّعة حسب القدرة والمزوّد.`, `${fmtNum(totalCalls)} calls so far, by capability and provider.`) : null }),
    dataTable({
      caption: L('استخدام خدمات الذكاء الاصطناعي', 'AI Services usage'),
      sortKey: 'calls', sortDir: 'desc',
      empty: emptyState({ compact: true, icon: 'activity', title: L('لا استخدام مسجّل بعد', 'No usage yet'), body: L('تظهر هنا الاستدعاءات ونسب النجاح بعد أول طلب يُخدَم عبر مزوّد.', 'Calls and success rates appear here after the first request served by a provider.') }),
      columns: [
        { key: 'capability', label: L('القدرة', 'Capability'), sort: (u) => capLabel(u.capability), render: (u) => capLabel(u.capability) },
        { key: 'provider', label: L('المزوّد', 'Provider'), sort: (u) => byId.get(u.provider_id)?.name || u.provider_id, render: (u) => bidi(byId.get(u.provider_id)?.name || u.provider_id) },
        { key: 'calls', label: L('الاستدعاءات', 'Calls'), num: true, sort: (u) => u.calls, render: (u) => h('span.num', fmtNum(u.calls)) },
        { key: 'rate', label: L('النجاح', 'Success'), sort: (u) => (u.calls ? u.ok / u.calls : 0), render: (u) => { const pct = u.calls ? Math.round((u.ok / u.calls) * 100) : 0; return h('div.adm-rate', h('span.num', `${fmtNum(pct)}%`), h(`span.progress${pct >= 95 ? '.good' : pct >= 70 ? '.warn' : '.crit'}`, { 'aria-hidden': 'true' }, h('i', { style: { width: `${pct}%` } }))); } },
        { key: 'tokens', label: L('الرموز (إدخال/إخراج)', 'Tokens (in/out)'), num: true, sort: (u) => (u.input_tokens || 0) + (u.output_tokens || 0), render: (u) => h('span.num', `${fmtNum(u.input_tokens || 0)} / ${fmtNum(u.output_tokens || 0)}`) },
        { key: 'last', label: L('آخر استخدام', 'Last used'), sort: (u) => u.last, render: (u) => h('span.adm-nowrap', `${fmtDate(u.last)} ${fmtTime(u.last)}`) },
      ],
      rows: d.usage,
    }));

  return [summary, providers, h('div.adm-split', routing, usage)];
}

function aiHealth(d, byId) {
  const external = d.providers.filter((p) => p.kind !== 'local');
  const degraded = d.capabilities.filter((c) => { const p = byId.get(d.routing[c]); return !usable(p); });
  const untested = external.filter((p) => p.status?.state === 'configured');
  const testBtn = external.length ? h('button.btn.sm', { type: 'button', onclick: (e) => testAll(external, e.currentTarget) }, icon('activity'), L('اختبار كل المزوّدين', 'Test all providers')) : null;
  if (degraded.length) {
    const names = degraded.map(capLabel);
    return h('div.adm-health.is-warn', { role: 'status' },
      h('span.adm-health-icon', { 'aria-hidden': 'true' }, icon('circleAlert')),
      h('div.adm-health-text',
        h('strong', L('بعض القدرات تعمل بالبديل المحلي', 'Some capabilities are running on the local fallback')),
        h('span', L(`${names.join('، ')}: المزوّد الموجَّه غير متصل، فتعمل المنصة بالفهم المحلي وتوضّح ذلك للمستخدمين. اضبط المفتاح على الخادم ثم اختبر الاتصال.`,
          `${names.join(', ')}: the routed provider isn’t connected, so the platform uses local understanding and tells users so. Set the key on the server, then test the connection.`))),
      testBtn);
  }
  return h(`div.adm-health.${untested.length ? 'is-info' : 'is-good'}`, { role: 'status' },
    h('span.adm-health-icon', { 'aria-hidden': 'true' }, icon(untested.length ? 'circleDashed' : 'circleCheck')),
    h('div.adm-health-text',
      h('strong', L('كل القدرات تعمل عبر المزوّدين الموجَّهين', 'Every capability runs on its routed provider')),
      h('span', untested.length ? L('بعض المزوّدين لم يُختبروا بعد — اختبرهم للتأكد من الاتصال.', 'Some providers haven’t been tested yet — test them to confirm the connection.') : L('لا شيء يحتاج انتباهك الآن.', 'Nothing needs your attention right now.'))),
    testBtn);
}

function aiStats(d, byId) {
  const external = d.providers.filter((p) => p.kind !== 'local');
  const connected = external.filter((p) => p.status?.state === 'connected').length;
  const onRoute = d.capabilities.filter((c) => usable(byId.get(d.routing[c]))).length;
  const calls = d.usage.reduce((a, u) => a + (u.calls || 0), 0);
  const ok = d.usage.reduce((a, u) => a + (u.ok || 0), 0);
  const tokens = d.usage.reduce((a, u) => a + (u.input_tokens || 0) + (u.output_tokens || 0), 0);
  return h('div.adm-stats',
    stat({ icon: 'plug', label: L('مزوّدون خارجيون متصلون', 'External providers connected'), value: `${fmtNum(connected)}/${fmtNum(external.length)}`, tone: external.length && connected === external.length ? 'good' : connected ? '' : 'warn',
      sub: L(`المحلية المدمجة: ${fmtNum(d.providers.length - external.length)}`, `Built-in local: ${fmtNum(d.providers.length - external.length)}`) }),
    stat({ icon: 'workflow', label: L('قدرات تعمل كما وُجِّهت', 'Capabilities on their route'), value: `${fmtNum(onRoute)}/${fmtNum(d.capabilities.length)}`, tone: onRoute === d.capabilities.length ? 'good' : 'warn',
      sub: onRoute === d.capabilities.length ? L('لا بديل محلي قيد التشغيل', 'No local fallback in use') : L(`${fmtNum(d.capabilities.length - onRoute)} على البديل المحلي`, `${fmtNum(d.capabilities.length - onRoute)} on local fallback`) }),
    stat({ icon: 'activity', label: L('الاستدعاءات', 'Calls'), value: fmtNum(calls), sub: calls ? L(`نسبة النجاح ${fmtNum(Math.round((ok / calls) * 100))}%`, `${fmtNum(Math.round((ok / calls) * 100))}% successful`) : L('لم يُسجَّل استخدام بعد', 'No usage recorded yet') }),
    stat({ icon: 'hash', label: L('الرموز المعالَجة', 'Tokens processed'), value: fmtNum(tokens), sub: L('إدخال وإخراج معاً', 'Input and output combined') }));
}

async function testProvider(p, btn) {
  if (btn?.classList.contains('is-loading')) return;
  btn?.classList.add('is-loading'); btn?.setAttribute('aria-busy', 'true');
  try {
    const r = await api(`/api/admin/ai/providers/${p.id}/test`, { method: 'POST' });
    toast(r.ok ? L(`نجح الاتصال بـ «${p.name}»`, `Connected to “${p.name}”`) : L(`تعذّر الاتصال بـ «${p.name}»: ${r.message}`, `Could not connect to “${p.name}”: ${r.message}`), { kind: r.ok ? null : 'error', timeout: 6000 });
    emit('data-changed', {});
  } catch (e) { toast(e.message, { kind: 'error' }); } finally { btn?.classList.remove('is-loading'); btn?.removeAttribute('aria-busy'); }
}
async function testAll(list, btn) {
  if (btn.classList.contains('is-loading')) return;
  btn.classList.add('is-loading');
  let ok = 0;
  try {
    for (const p of list) { try { const r = await api(`/api/admin/ai/providers/${p.id}/test`, { method: 'POST' }); if (r.ok) ok++; } catch { /* counted as not connected */ } }
    toast(L(`اكتمل الاختبار — متصل ${fmtNum(ok)} من ${fmtNum(list.length)}`, `Test complete — ${fmtNum(ok)} of ${fmtNum(list.length)} connected`), { kind: ok === list.length ? null : 'info', timeout: 6000 });
    emit('data-changed', {});
  } finally { btn.classList.remove('is-loading'); }
}

async function editProvider(p = {}) {
  const kinds = ['anthropic', 'openai_compatible'];
  const f = {
    name: h('input.field', { value: p.name || '', autocomplete: 'off', placeholder: L('مثال: بوابة النماذج المؤسسية', 'e.g. Enterprise model gateway') }),
    kind: h('select.field', kinds.map((k) => h('option', { value: k, selected: p.kind === k || null }, KIND()[k]))),
    base_url: h('input.field', { value: p.base_url || '', placeholder: 'https://…', dir: 'ltr', inputmode: 'url', autocomplete: 'off' }),
    model: h('input.field', { value: p.model || '', dir: 'ltr', autocomplete: 'off', placeholder: 'claude-sonnet-5' }),
    api_key_env: h('input.field', { value: p.api_key_env || '', placeholder: 'MY_PROVIDER_KEY', dir: 'ltr', autocomplete: 'off', spellcheck: 'false' }),
  };
  const body = h('div.adm-form',
    field(L('الاسم الظاهر', 'Display name'), f.name),
    h('div.form-grid', field(L('النوع', 'Type'), f.kind), field(L('النموذج', 'Model'), f.model)),
    field(L('عنوان الخادم', 'Base URL'), f.base_url, { helper: L('يبدأ بـ https:// — اتركه فارغاً لاستخدام العنوان الافتراضي للنوع.', 'Starts with https:// — leave empty for the type’s default.') }),
    field(L('متغير بيئة المفتاح', 'Key environment variable'), f.api_key_env, { helper: L('اسم متغير البيئة على الخادم الذي يحمل المفتاح — لا تكتب المفتاح نفسه هنا. بعد ضبطه أعد تشغيل الخادم.', 'The server environment variable that holds the key — never the key itself. Restart the server after setting it.') }));
  const validate = () => {
    const errs = [
      [f.name, f.name.value.trim() ? null : L('أدخل اسماً يميّز المزوّد', 'Give the provider a name')],
      [f.base_url, !f.base_url.value || /^https?:\/\//.test(f.base_url.value) ? null : L('يجب أن يبدأ العنوان بـ https://', 'The URL must start with https://')],
      [f.api_key_env, !f.api_key_env.value || /^[A-Z][A-Z0-9_]{2,60}$/.test(f.api_key_env.value) ? null : L('أحرف إنجليزية كبيرة وأرقام و_ فقط، ويبدأ بحرف (مثل MY_PROVIDER_KEY)', 'Uppercase letters, digits and _ only, starting with a letter (e.g. MY_PROVIDER_KEY)')],
    ];
    errs.forEach(([c, m]) => setFieldError(c, m));
    const first = errs.find(([, m]) => m); first?.[0].focus();
    return !first;
  };
  let saved = null;
  const ok = await modal(p.id ? L(`تعديل «${p.name}»`, `Edit “${p.name}”`) : L('إضافة مزوّد نماذج', 'Add a model provider'), body, [{ label: t('cancel'), value: false }, { label: t('save'), value: true, primary: true }], {
    beforeClose: () => submitting(body, async () => {
      formError(body, null);
      if (!validate()) return false;
      try { saved = await api('/api/admin/ai/providers', { method: 'PUT', body: { id: p.id, ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])) } }); return true; } catch (e) { formError(body, e.message); return false; }
    }),
  });
  if (!ok) return;
  const name = f.name.value.trim();
  toast(p.id ? L(`حُفظت تعديلات «${name}»`, `Saved “${name}”`) : L(`أُضيف المزوّد «${name}»`, `Added “${name}”`), saved?.id && f.api_key_env.value ? { action: L('اختبار الآن', 'Test now'), onAction: () => testProvider({ ...saved, name }), timeout: 7000 } : {});
  emit('data-changed', {});
}

// ================================================================ Agents & Skills
function agentsTab([agents, skills, cat]) {
  const enabled = agents.filter((a) => a.enabled).length;
  const needConfirm = cat.tools.filter((x) => x.destructive).length;
  const agentsCard = h('section.card.adm-card', { 'aria-labelledby': 'adm-agents-title' },
    cardHead('adm-agents-title', L('الوكلاء', 'Agents'), { count: agents.length, sub: L('يعمل كل وكيل بصلاحيات المستخدم الذي يستدعيه، وللأدوار المحددة فقط.', 'Each agent runs with the caller’s permissions, and only for the roles listed.') }),
    dataTable({
      caption: L('الوكلاء', 'Agents'), sortKey: 'name',
      rowAttrs: (a) => ({ 'data-agent': a.key }),
      columns: [
        { key: 'name', label: L('الوكيل', 'Agent'), sort: (a) => L(a.name_ar, a.name_en), render: (a) => h('div.adm-prov',
          h('span.adm-glyph', { 'aria-hidden': 'true' }, icon('bot')),
          h('div.adm-prov-text', h('span.adm-prov-name', bidi(L(a.name_ar, a.name_en))), h('span.adm-prov-sub.adm-clamp', bidi(L(a.description_ar, a.description_en || a.description_ar))))) },
        { key: 'tools', label: L('الأدوات', 'Tools'), sort: (a) => a.tools.length, render: (a) => h('div.adm-tools', { title: a.tools.join('، ') },
          h('span.chip.tiny.info', icon('sliders'), countText(a.tools.length, AR_TOOLS, ['tool', 'tools'])),
          h('span.adm-tools-list', a.tools.slice(0, 3).map((x) => h('code', x)), a.tools.length > 3 ? h('span.faint', `+${fmtNum(a.tools.length - 3)}`) : null)) },
        { key: 'roles', label: L('الأدوار', 'Roles'), render: (a) => h('div.adm-chips', a.allowed_roles.map((r) => h(`span.chip.tiny${ROLE_TONE[r] || ''}`, t(`role.${r}`)))) },
        { key: 'enabled', label: L('مفعّل', 'On'), sort: (a) => (a.enabled ? 0 : 1), render: (a) => agentSwitch(a) },
      ],
      rows: agents,
    }));

  const skillsCard = h('section.card.adm-card', { 'aria-labelledby': 'adm-skills-title' },
    cardHead('adm-skills-title', L('المهارات', 'Skills'), { count: skills.length, sub: L('مهارات جاهزة يستدعيها المساعد والوكلاء وعملاء MCP.', 'Ready-made skills called by the assistant, agents and MCP clients.') }),
    dataTable({
      caption: L('المهارات', 'Skills'), sortKey: 'name',
      empty: emptyState({ compact: true, icon: 'wand', title: L('لا مهارات مفعّلة', 'No skills enabled') }),
      columns: [
        { key: 'name', label: L('المهارة', 'Skill'), sort: (s) => L(s.name_ar, s.name_en), render: (s) => h('div.adm-prov-text', h('span.adm-prov-name', bidi(L(s.name_ar, s.name_en))), h('span.adm-prov-sub', bidi(L(s.description_ar, s.description_en || s.description_ar)))) },
        { key: 'inputs', label: L('المدخلات', 'Inputs'), render: (s) => { const keys = Object.keys(s.inputs?.properties || {}); return keys.length ? h('div.adm-chips', keys.map((k) => h('code', k))) : h('span.faint', L('بلا مدخلات', 'None')); } },
        { key: 'outputs', label: L('المخرجات', 'Outputs'), render: (s) => h('code.adm-code', s.outputs) },
        { key: 'invocation', label: L('الاستدعاء', 'Invocation'), render: (s) => h('code.adm-code', s.invocation) },
      ],
      rows: skills,
    }));

  // MCP tools: searchable, filterable
  const slot = h('div.adm-tools-slot');
  const kindOf = (x) => (x.destructive ? 'confirm' : x.mutates ? 'undo' : 'read');
  const counts = { all: cat.tools.length, read: 0, undo: 0, confirm: 0 };
  cat.tools.forEach((x) => { counts[kindOf(x)]++; });
  const search = h('input.field#adm-tools-search', { type: 'search', value: ui.tools.q, placeholder: L('ابحث في الأدوات…', 'Search tools…'), 'aria-label': L('ابحث في أدوات التنفيذ', 'Search execution tools'), autocomplete: 'off', oninput: debounce((e) => { ui.tools.q = e.target.value; drawTools(); }, 120) });
  const filter = segmented([['all', L('الكل', 'All'), fmtNum(counts.all)], ['read', L('قراءة', 'Read'), fmtNum(counts.read)], ['undo', L('قابل للتراجع', 'Undoable'), fmtNum(counts.undo)], ['confirm', L('يتطلب تأكيداً', 'Needs confirmation'), fmtNum(counts.confirm)]], ui.tools.kind, (v) => { ui.tools.kind = v; drawTools(); }, { label: L('تصفية الأدوات حسب النوع', 'Filter tools by type') });
  const KINDCHIP = { read: ['good', 'eye', 'قراءة', 'Read'], undo: ['', 'undo', 'قابل للتراجع', 'Undoable'], confirm: ['warn', 'shieldAlert', 'يتطلب تأكيداً', 'Needs confirmation'] };
  function drawTools() {
    const q = norm(ui.tools.q.trim());
    const rows = cat.tools.filter((x) => (ui.tools.kind === 'all' || kindOf(x) === ui.tools.kind) && (!q || norm(`${x.name} ${x.description}`).includes(q)));
    slot.replaceChildren(dataTable({
      caption: L('أدوات التنفيذ', 'Execution tools'), sortKey: 'name',
      empty: emptyState({ compact: true, icon: 'search', title: L('لا أدوات مطابقة', 'No matching tools'), actions: [{ label: L('مسح البحث والتصفية', 'Clear search & filter'), icon: 'x', onClick: () => { ui.tools.q = ''; search.value = ''; filter.querySelector('button[data-v="all"]')?.click(); } }] }),
      columns: [
        { key: 'name', label: L('الأداة', 'Tool'), sort: (x) => x.name, render: (x) => h('code.adm-nowrap', x.name) },
        { key: 'description', label: L('الوصف', 'Description'), render: (x) => h('span.adm-desc', bidi(x.description)) },
        { key: 'kind', label: L('النوع', 'Type'), sort: (x) => ['read', 'undo', 'confirm'].indexOf(kindOf(x)), render: (x) => { const [tone, ic, ar, en] = KINDCHIP[kindOf(x)]; return h(`span.chip.tiny${tone ? `.${tone}` : ''}`, icon(ic), L(ar, en)); } },
      ],
      rows,
    }));
  }
  drawTools();
  const toolsCard = h('section.card.adm-card', { 'aria-labelledby': 'adm-tools-title' },
    cardHead('adm-tools-title', L('أدوات التنفيذ (MCP)', 'Execution tools (MCP)'), { count: cat.tools.length, sub: L('كل أداة تُنفَّذ بصلاحيات المستخدم؛ الأدوات الحساسة تطلب تأكيداً صريحاً قبل التنفيذ.', 'Every tool runs with the user’s permissions; sensitive tools ask for explicit confirmation first.') }),
    h('div.adm-toolbar.adm-toolbar-in', h('div.adm-filter', filter), h('div.search-field.adm-search', icon('search'), search)),
    slot);

  const stats = h('div.adm-stats.is-3',
    stat({ icon: 'bot', label: L('الوكلاء المفعّلون', 'Agents enabled'), value: `${fmtNum(enabled)}/${fmtNum(agents.length)}`, tone: enabled === agents.length ? 'good' : '', sub: enabled === agents.length ? L('كل الوكلاء متاحون للمستخدمين', 'All agents are available to users') : L(`موقوف: ${fmtNum(agents.length - enabled)}`, `${countText(agents.length - enabled, AR_AGENTS, ['agent', 'agents'])} paused`) }),
    stat({ icon: 'wand', label: L('المهارات', 'Skills'), value: fmtNum(skills.length), sub: L('متاحة للمساعد وعملاء MCP', 'Available to the assistant and MCP clients') }),
    stat({ icon: 'sliders', label: L('أدوات التنفيذ', 'Execution tools'), value: fmtNum(cat.tools.length), sub: L(`${fmtNum(needConfirm)} منها تتطلب تأكيداً`, `${fmtNum(needConfirm)} need confirmation`) }));
  return [stats, agentsCard, skillsCard, toolsCard];
}

function agentSwitch(a) {
  const name = L(a.name_ar, a.name_en);
  const cb = h('input.switch', { type: 'checkbox', role: 'switch', checked: a.enabled ? true : null, 'aria-label': L(`تفعيل ${name}`, `Enable ${name}`),
    onchange: async () => {
      const on = cb.checked;
      cb.disabled = true;
      try {
        await api(`/api/admin/agents/${a.key}`, { method: 'PUT', body: { enabled: on } });
        a.enabled = on ? 1 : 0;
        toast(on ? L(`فُعِّل «${name}» — صار متاحاً للأدوار المحددة`, `“${name}” is on for its roles`) : L(`أُوقف «${name}» — لن يظهر للمستخدمين حتى تعيد تفعيله`, `“${name}” is paused — hidden from users until you turn it back on`),
          { action: t('undo'), onAction: () => { cb.checked = !on; cb.dispatchEvent(new Event('change')); } });
      } catch (e) {
        cb.checked = !on;
        toast(L(`تعذّر تحديث «${name}»: ${e.message}`, `Could not update “${name}”: ${e.message}`), { kind: 'error' });
      } finally { cb.disabled = false; }
    } });
  return h('label.adm-switch', cb, h('span.adm-switch-label', { 'aria-hidden': 'true' }, a.enabled ? L('مفعّل', 'On') : L('موقوف', 'Off')));
}

// ================================================================ MCP
function mcpTab() {
  const endpoint = `${location.origin}/mcp`;
  const tokenOut = h('div.adm-token-slot', { 'aria-live': 'polite' });
  const snippet = h('code');
  const paintSnippet = () => { snippet.textContent = JSON.stringify({ mcpServers: { 'smart-work-platform': { type: 'http', url: endpoint, headers: { Authorization: `Bearer ${ui.token || 'swp_…'}` } } } }, null, 2); };
  paintSnippet();
  const paintToken = () => {
    if (!ui.token) { tokenOut.replaceChildren(); return; }
    tokenOut.replaceChildren(h('div.adm-token', { role: 'status' },
      h('div.adm-token-head', icon('key'), h('strong', L('انسخ الرمز الآن — لن يظهر مجدداً', 'Copy it now — it won’t be shown again'))),
      h('div.adm-token-value', h('code', { dir: 'ltr' }, ui.token),
        h('button.btn.sm.primary', { type: 'button', onclick: () => copyText(ui.token, L('نُسخ الرمز — احفظه في مكان آمن', 'Token copied — keep it somewhere safe')) }, icon('copy'), t('copy'))),
      h('p.adm-token-note', L('يعمل الرمز بصلاحياتك أنت. عامله ككلمة مرور ولا تشاركه.', 'The token acts with your permissions. Treat it like a password and never share it.'))));
  };
  paintToken();
  const create = h('button.btn.primary', { type: 'button', onclick: async () => {
    if (create.classList.contains('is-loading')) return;
    create.classList.add('is-loading');
    try {
      const r = await api('/api/me/tokens', { method: 'POST', body: { label: 'MCP client' } });
      ui.token = r.token; paintToken(); paintSnippet();
      tokenOut.querySelector('.btn')?.focus();
    } catch (e) { toast(L(`تعذّر إنشاء الرمز: ${e.message}`, `Could not create the token: ${e.message}`), { kind: 'error' }); } finally { create.classList.remove('is-loading'); }
  } }, icon('key'), L('إنشاء رمز شخصي', 'Create personal token'));

  const kvRow = (label, value, copyVal) => h('div.adm-kv-row',
    h('span.adm-kv-label', label),
    h('span.adm-kv-value', value),
    copyVal ? h('button.icon-btn', { type: 'button', 'aria-label': L(`نسخ ${label}`, `Copy ${label}`), 'data-tip': t('copy'), onclick: () => copyText(copyVal, L(`نُسخ: ${label}`, `Copied: ${label}`)) }, icon('copy')) : h('span'));

  const server = h('section.card.adm-card', { 'aria-labelledby': 'adm-mcp-title' },
    cardHead('adm-mcp-title', L('خادم MCP للمنصة', 'Platform MCP server'), { sub: L('يربط المساعد والعملاء المصرّح لهم بأدوات المنصة. كل استدعاء يُنفَّذ بصلاحيات صاحب الرمز مع التحقق والتأكيد ومنع التكرار. لا توجد أدوات تصل إلى Vault.', 'Connects the assistant and authorised clients to platform tools, under the token owner’s permissions, with validation, confirmation and de-duplication. No tool reaches Vault.') }),
    h('div.adm-kv',
      kvRow(L('نقطة الاتصال', 'Endpoint'), h('code', { dir: 'ltr' }, endpoint), endpoint),
      kvRow(L('طريقة النقل', 'Transport'), h('bdi', 'Streamable HTTP (JSON-RPC 2.0)')),
      kvRow(L('المصادقة', 'Authentication'), h('code', { dir: 'ltr' }, 'Authorization: Bearer swp_…'))),
    h('div.adm-token-block',
      h('h3.adm-sub-title', L('رمز وصول شخصي', 'Personal access token')),
      h('p.adm-muted', L('يُنشأ باسمك ويعمل بصلاحياتك، ويظهر مرة واحدة فقط.', 'Created in your name, acts with your permissions, and is shown only once.')),
      create, tokenOut),
    h('div.callout.adm-callout', icon('info'), h('span', L('الموافقة على أعمال وكلاء المكتب لا تتم عبر الرموز؛ تتطلب جلسة تفاعلية.', 'Approving Agents Office work is not possible with tokens; it needs an interactive session.'))));

  const guide = h('section.card.adm-card.adm-guide', { 'aria-labelledby': 'adm-guide-title' },
    cardHead('adm-guide-title', L('ربط عميل MCP', 'Connect an MCP client')),
    h('ol.adm-steps',
      h('li', h('span.adm-step-n.num', '1'), h('div', h('strong', L('أنشئ رمزاً شخصياً', 'Create a personal token')), h('span', L('من البطاقة المجاورة، وانسخه فوراً.', 'From the card alongside — copy it right away.')))),
      h('li', h('span.adm-step-n.num', '2'), h('div', h('strong', L('أضف الخادم في العميل', 'Add the server to your client')), h('span', L('استخدم نقطة الاتصال والترويسة كما في الإعداد التالي.', 'Use the endpoint and header as in the config below.')))),
      h('li', h('span.adm-step-n.num', '3'), h('div', h('strong', L('جرّب أداة قراءة أولاً', 'Try a read tool first')), h('span', bidi(L('مثل get_daily_summary للتأكد من الاتصال والصلاحيات.', 'Such as get_daily_summary, to confirm access and permissions.')))))),
    h('div.adm-snippet',
      h('div.adm-snippet-head', h('span', L('إعداد العميل (JSON)', 'Client config (JSON)')), h('button.btn.sm.ghost', { type: 'button', onclick: () => copyText(snippet.textContent, L('نُسخ الإعداد', 'Config copied')) }, icon('copy'), t('copy'))),
      h('pre', { dir: 'ltr' }, snippet)));
  return h('div.adm-mcp', server, guide);
}

// ================================================================ Integrations
function integrationsTab({ d, at }, body) {
  const items = [
    { key: 'vault', name: L('Vault (FS، مرصاد)', 'Vault (FS, Marsad)'), icon: 'vault', ok: d.vault.reachable, label: d.vault.reachable ? L('يعمل', 'Reachable') : L('غير متاح', 'Unreachable'),
      desc: L('فحص صحة فقط — لا تُقرأ أي بيانات من Vault.', 'Health check only — no data is read from Vault.'), tech: [[L('الذكاء داخل Vault', 'AI inside Vault'), d.vault.local_ai || '—']] },
    { key: 'su', name: L('Smart Uploader ← مرصاد', 'Smart Uploader → Marsad'), icon: 'fileUp', ok: d.su.configured && d.vault.reachable,
      label: d.su.configured ? (d.vault.reachable ? L('مضبوط', 'Configured') : L('مضبوط لكن Vault غير متاح', 'Configured, Vault down')) : L('غير مضبوط', 'Not configured'),
      desc: L('يسلّم ملفات الموظفين إلى مرصاد في اتجاه واحد، ولا يحتفظ إلا بالإيصال.', 'Delivers staff files to Marsad one way, keeping only the receipt.'), tech: [[L('متغير الخادم', 'Server variable'), h('code', 'SU_SERVICE_TOKEN')]] },
    { key: 'wajib', name: L('واجب ← FS / مرصاد', 'Wajib → FS / Marsad'), icon: 'lock', ok: null, tone: 'vault', stateIcon: 'lock', label: L('يُدار داخل Vault', 'Managed inside Vault'),
      desc: L('نقاط استقبال للكتابة فقط داخل Vault؛ حالته لا تُعرض خارج Vault.', 'Write-only ingest inside Vault; its status is never shown outside Vault.'), tech: [[L('المحاكاة', 'Simulator'), h('code', 'npm run wajib:sim')]] },
    { key: 'pdf', name: L('محرك PDF', 'PDF engine'), icon: 'fileDown', ok: d.pdf.ok, label: d.pdf.ok ? h('bdi', d.pdf.engine) : L('غير متاح', 'Missing'),
      desc: L('يصدّر المستندات إلى PDF من المحرر.', 'Exports documents to PDF from the editor.'), tech: d.pdf.message ? [[L('التفاصيل', 'Details'), bidi(d.pdf.message)]] : [] },
    { key: 'voice', name: L('الصوت', 'Voice'), icon: 'mic', ok: null, tone: 'info', stateIcon: 'monitor', label: L('من المتصفح', 'In the browser'),
      desc: L('يعتمد على دعم المتصفح؛ يمكن توجيه تحويل الكلام إلى نص لمزوّد خادمي من خدمات الذكاء الاصطناعي.', 'Depends on browser support; route speech-to-text to a server provider in AI Services.'), tech: [[L('المحرك', 'Engine'), h('bdi', 'Web Speech API')]],
      action: h('a.btn.sm.tertiary', { href: '#/admin/ai' }, icon('spark'), L('توجيه القدرات', 'Capability routing')) },
    { key: 'hr', name: L('الخدمة الذاتية للموارد البشرية', 'HR self-service'), icon: 'idCard', ok: false, label: L('غير متصل', 'Not connected'),
      desc: L('يحتاج بيانات اتصال النظام المؤسسي قبل ظهوره للموظفين.', 'Needs the enterprise system’s connection details before staff can use it.'), tech: [] },
  ];
  const checked = items.filter((x) => x.ok !== null);
  const good = checked.filter((x) => x.ok).length;
  const attention = checked.filter((x) => !x.ok);
  const recheck = h('button.btn.sm', { type: 'button', onclick: async () => { recheck.classList.add('is-loading'); try { await reloadTab(body); } finally { recheck.classList.remove('is-loading'); } } }, icon('refresh'), L('إعادة الفحص', 'Re-check'));
  const summary = h(`div.adm-health.${attention.length ? 'is-warn' : 'is-good'}`, { role: 'status' },
    h('span.adm-health-icon', { 'aria-hidden': 'true' }, icon(attention.length ? 'circleAlert' : 'circleCheck')),
    h('div.adm-health-text',
      h('strong', L(`${fmtNum(good)} من ${fmtNum(checked.length)} تكاملات تعمل`, `${fmtNum(good)} of ${fmtNum(checked.length)} integrations working`)),
      h('span', attention.length ? L(`تحتاج انتباهك: ${attention.map((x) => x.name).join('، ')}.`, `Needs attention: ${attention.map((x) => x.name).join(', ')}.`) : L('كل ما يمكن فحصه من هنا يعمل.', 'Everything that can be checked from here is working.'),
        ' ', h('span.adm-nowrap.faint', L(`آخر فحص ${fmtTime(at)}`, `Checked ${fmtTime(at)}`)))),
    recheck);
  const card = (x) => {
    const [tone, ic] = x.ok === true ? ['good', 'circleCheck'] : x.ok === false ? ['crit', 'circleX'] : [x.tone || '', x.stateIcon || 'info'];
    return h(`section.card.adm-int.is-${x.ok === true ? 'good' : x.ok === false ? 'bad' : 'neutral'}`, { 'aria-labelledby': `adm-int-${x.key}`, 'data-integration': x.key },
      h('div.adm-int-head',
        h('span.adm-glyph.lg', { 'data-tone': x.ok === true ? 'good' : x.ok === false ? 'bad' : x.tone || '', 'aria-hidden': 'true' }, icon(x.icon)),
        h('div.adm-int-titles', h(`h3#adm-int-${x.key}.adm-int-name`, bidi(x.name)), h(`span.chip.tiny${tone ? `.${tone}` : ''}`, icon(ic), x.label))),
      h('p.adm-int-desc', bidi(x.desc)),
      x.tech.length || x.action ? h('div.adm-int-foot',
        x.tech.length ? h('details.adm-tech', h('summary', icon('chevron', 'flip-rtl adm-tech-chev'), L('تفاصيل تقنية', 'Technical details')),
          h('dl', x.tech.map(([k, v]) => [h('dt', k), h('dd', typeof v === 'string' ? bidi(v) : v)]))) : h('span'),
        x.action || null) : null);
  };
  return [summary, h('div.adm-int-grid', items.map(card))];
}

// ================================================================ Users & departments
function usersTab([users, depts]) {
  const deptById = new Map(depts.map((d) => [d.id, d]));
  const deptName = (id, fallback) => { const d = deptById.get(id); return d ? L(d.name_ar, d.name_en || d.name_ar) : fallback || '—'; };
  const usedDepts = [...new Set(users.map((u) => u.department_id))].map((id) => deptById.get(id)).filter(Boolean);
  if (ui.users.dept !== 'all' && !usedDepts.some((d) => d.id === ui.users.dept)) ui.users.dept = 'all';
  const roleCounts = Object.fromEntries(ROLES.map((r) => [r, users.filter((u) => u.role === r).length]));
  const admins = users.filter((u) => u.is_admin).length;

  const hadFocus = document.activeElement?.id === 'adm-users-search' ? [document.activeElement.selectionStart, document.activeElement.selectionEnd] : null;
  const search = h('input.field#adm-users-search', { type: 'search', value: ui.users.q, placeholder: L('ابحث بالاسم أو اسم المستخدم…', 'Search by name or username…'), 'aria-label': L('ابحث في المستخدمين', 'Search users'), autocomplete: 'off',
    oninput: debounce((e) => { ui.users.q = e.target.value; draw(); }, 120),
    onkeydown: (e) => { if (e.key === 'Escape' && e.target.value) { e.preventDefault(); e.stopPropagation(); e.target.value = ''; ui.users.q = ''; draw(); } } });
  const roles = segmented([['all', L('الكل', 'All'), fmtNum(users.length)], ...ROLES.map((r) => [r, t(`role.${r}`), fmtNum(roleCounts[r])])], ui.users.role, (v) => { ui.users.role = v; draw(); }, { label: L('تصفية حسب الدور', 'Filter by role') });
  const dept = h('select.field.adm-dept-filter', { 'aria-label': L('تصفية حسب الإدارة', 'Filter by department'), onchange: () => { ui.users.dept = dept.value; draw(); } },
    h('option', { value: 'all' }, L('كل الإدارات', 'All departments')),
    usedDepts.map((d) => h('option', { value: d.id, selected: ui.users.dept === d.id || null }, L(d.name_ar, d.name_en || d.name_ar))));
  const result = h('span.adm-result', { role: 'status', 'aria-live': 'polite' });
  const slot = h('div.adm-users-slot');
  const flash = ui.flashUser; ui.flashUser = null;

  function draw() {
    const q = norm(ui.users.q.trim());
    const rows = users.filter((u) => (ui.users.role === 'all' || u.role === ui.users.role) && (ui.users.dept === 'all' || u.department_id === ui.users.dept)
      && (!q || norm(`${u.name_ar} ${u.name_en || ''} ${u.username}`).includes(q)));
    result.textContent = rows.length === users.length ? countText(users.length, AR_USERS, ['user', 'users']) : L(`${fmtNum(rows.length)} من ${fmtNum(users.length)}`, `${fmtNum(rows.length)} of ${fmtNum(users.length)}`);
    slot.replaceChildren(dataTable({
      caption: L('المستخدمون وصلاحياتهم', 'Users and their permissions'), sortKey: 'name',
      rowAttrs: (u) => ({ 'data-user': u.id, class: [u.id === flash ? 'adm-row-new' : '', u.active === 0 ? 'adm-row-off' : ''].filter(Boolean).join(' ') || null }),
      empty: emptyState({ compact: true, icon: 'search', title: L('لا مستخدمين مطابقين', 'No matching users'), body: L('جرّب اسماً آخر أو أزل عوامل التصفية.', 'Try another name or clear the filters.'),
        actions: [{ label: L('مسح البحث والتصفية', 'Clear search & filters'), icon: 'x', onClick: () => { ui.users = { q: '', role: 'all', dept: 'all' }; search.value = ''; dept.value = 'all'; roles.querySelector('button[data-v="all"]')?.click(); } }] }),
      columns: [
        { key: 'name', label: L('المستخدم', 'User'), sort: (u) => L(u.name_ar, u.name_en || u.name_ar), render: (u) => h('div.adm-user',
          avatar(u.name_ar),
          h('div.adm-prov-text',
            h('span.adm-prov-name', L(u.name_ar, u.name_en || u.name_ar)),
            h('span.adm-prov-sub', h('bdi.adm-username', u.username),
              u.is_admin ? h('span.chip.tiny.info', icon('shield'), L('مدير المنصة', 'Platform admin')) : null,
              u.is_demo ? h('span.chip.demo.tiny', t('demo')) : null,
              u.active === 0 ? h('span.chip.tiny', L('غير نشط', 'Inactive')) : null))) },
        { key: 'dept', label: L('الإدارة', 'Department'), sort: (u) => deptName(u.department_id, u.dept_ar), render: (u) => deptName(u.department_id, u.dept_ar) },
        { key: 'role', label: L('الدور', 'Role'), sort: (u) => ROLES.indexOf(u.role), render: (u) => h(`span.chip${ROLE_TONE[u.role] || ''}`, t(`role.${u.role}`)) },
        { key: 'actions', label: '', render: (u) => h('button.btn.sm', { type: 'button', onclick: () => editUser(u, depts), 'aria-label': L(`تغيير الصلاحيات — ${u.name_ar}`, `Change permissions — ${u.name_en || u.name_ar}`) }, icon('userCog'), L('تغيير الصلاحيات', 'Change permissions')) },
      ],
      rows,
    }));
  }
  draw();
  if (hadFocus) requestAnimationFrame(() => { search.focus({ preventScroll: true }); try { search.setSelectionRange(...hadFocus); } catch { /* type=search */ } });
  if (flash) requestAnimationFrame(() => slot.querySelector(`tr[data-user="${CSS.escape(flash)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));

  const card = h('section.card.adm-card', { 'aria-labelledby': 'adm-users-title' },
    cardHead('adm-users-title', L('المستخدمون والإدارات', 'Users & departments'), {
      sub: L(`${countText(users.length, AR_USERS, ['user', 'users'])} في ${countText(usedDepts.length, AR_DEPTS, ['department', 'departments'])} · ${fmtNum(admins)} بصلاحية إدارة المنصة`, `${countText(users.length, AR_USERS, ['user', 'users'])} across ${countText(usedDepts.length, AR_DEPTS, ['department', 'departments'])} · ${fmtNum(admins)} platform admins`),
      actions: [
        h('button.btn.sm', { type: 'button', onclick: () => newDept(depts) }, icon('building'), L('إدارة جديدة', 'New department')),
        h('button.btn.sm.primary', { type: 'button', onclick: () => newUser(depts) }, icon('userPlus'), L('مستخدم جديد', 'New user'))] }),
    h('div.adm-toolbar.adm-toolbar-in',
      h('div.adm-filter', roles),
      h('div.adm-toolbar-end', dept, h('div.search-field.adm-search', icon('search'), search))),
    h('div.adm-result-row', result),
    slot);
  return card;
}

const roleSelect = (value) => h('select.field', ROLES.map((r) => h('option', { value: r, selected: value === r || null }, t(`role.${r}`))));
const deptSelect = (depts, value, { empty } = {}) => h('select.field', empty ? h('option', { value: '' }, empty) : null, depts.map((d) => h('option', { value: d.id, selected: value === d.id || null }, L(d.name_ar, d.name_en || d.name_ar))));
const deptLabel = (depts, id) => { const d = depts.find((x) => x.id === id); return d ? L(d.name_ar, d.name_en || d.name_ar) : '—'; };

async function editUser(u, depts) {
  const name = L(u.name_ar, u.name_en || u.name_ar);
  const role = roleSelect(u.role);
  const dept = deptSelect(depts, u.department_id);
  const summary = h('div.adm-change', { 'aria-live': 'polite' });
  const body = h('div.adm-form',
    h('div.adm-person', avatar(u.name_ar, 'lg'), h('div', h('strong', name), h('span.adm-prov-sub', h('bdi', u.username), ' · ', t(`role.${u.role}`), ' · ', deptLabel(depts, u.department_id)))),
    h('div.form-grid', field(L('الدور', 'Role'), role), field(L('الإدارة', 'Department'), dept)),
    summary,
    h('p.helper', L(`يتغير نطاق وصول ${u.name_ar} فوراً بعد التأكيد، ويُسجَّل التغيير في سجل التدقيق.`, `${name}’s access scope changes as soon as you confirm, and the change is written to the audit log.`)));
  const paint = () => {
    const changes = [];
    if (role.value !== u.role) changes.push([L('الدور', 'Role'), t(`role.${u.role}`), t(`role.${role.value}`)]);
    if (dept.value !== u.department_id) changes.push([L('الإدارة', 'Department'), deptLabel(depts, u.department_id), deptLabel(depts, dept.value)]);
    summary.replaceChildren(...(changes.length
      ? [h('span.adm-change-title', L('سيتغير:', 'Will change:')), ...changes.map(([k, from, to]) => h('div.adm-change-row', h('span.adm-change-k', k), h('span.adm-change-from', from), icon('arrowRight', 'sm flip-rtl adm-change-arrow'), h('strong', to)))]
      : [h('span.faint', L('لم تغيّر شيئاً بعد — اختر دوراً أو إدارة جديدة.', 'Nothing changed yet — pick a new role or department.'))]));
    const btn = dialogButton(body, '.actions .btn.danger'); if (btn) btn.disabled = !changes.length;
    return changes.length;
  };
  role.addEventListener('change', paint); dept.addEventListener('change', paint);
  const pending = modal(L('تغيير الصلاحيات', 'Change permissions'), body, [{ label: t('cancel'), value: false }, { label: L('تأكيد تغيير الصلاحيات', 'Confirm permission change'), value: true, danger: true, icon: 'shieldAlert' }], {
    beforeClose: () => submitting(body, async () => {
      formError(body, null);
      if (!paint()) return false;
      try { await api(`/api/admin/users/${u.id}`, { method: 'PUT', body: { role: role.value, department_id: dept.value, confirm: true } }); return true; } catch (e) { formError(body, e.message); return false; }
    }),
  });
  paint();
  if (!(await pending)) return;
  toast(L(`حُدِّثت صلاحيات ${u.name_ar}: ${t(`role.${role.value}`)} في ${deptLabel(depts, dept.value)}`, `Updated ${name}: ${t(`role.${role.value}`)} in ${deptLabel(depts, dept.value)}`));
  ui.flashUser = u.id;
  emit('data-changed', {});
}

async function newUser(depts) {
  const f = {
    username: h('input.field', { autocomplete: 'off', dir: 'ltr', spellcheck: 'false', autocapitalize: 'off', placeholder: 'f.alali' }),
    name_ar: h('input.field', { autocomplete: 'off' }),
    name_en: h('input.field', { autocomplete: 'off', dir: 'ltr' }),
    password: h('input.field', { type: 'password', autocomplete: 'new-password' }),
  };
  const role = roleSelect('employee');
  const dept = deptSelect(depts, depts[0]?.id);
  const summary = h('p.adm-grant', { 'aria-live': 'polite' });
  const paint = () => { summary.replaceChildren(icon('shield', 'sm'), h('span', L(`سيحصل المستخدم على صلاحيات «${t(`role.${role.value}`)}» ضمن «${deptLabel(depts, dept.value)}».`, `The user gets “${t(`role.${role.value}`)}” access within “${deptLabel(depts, dept.value)}”.`))); };
  role.addEventListener('change', paint); dept.addEventListener('change', paint); paint();
  const body = h('div.adm-form',
    field(L('اسم المستخدم', 'Username'), f.username, { helper: L('3–40 حرفاً: أحرف إنجليزية صغيرة وأرقام و . _ -', '3–40 characters: lowercase letters, digits, . _ -') }),
    h('div.form-grid', field(L('الاسم (عربي)', 'Name (Arabic)'), f.name_ar), field(L('الاسم (إنجليزي)', 'Name (English)'), f.name_en)),
    field(L('كلمة المرور المؤقتة', 'Temporary password'), f.password, { helper: L('8 أحرف على الأقل. سلّمها للمستخدم بطريقة آمنة.', 'At least 8 characters. Hand it over securely.') }),
    h('div.form-grid', field(L('الدور', 'Role'), role), field(L('الإدارة', 'Department'), dept)),
    summary);
  const validate = () => {
    const errs = [
      [f.username, /^[a-z0-9._-]{3,40}$/.test(f.username.value) ? null : L('3–40 حرفاً من الأحرف الإنجليزية الصغيرة والأرقام و . _ - فقط', '3–40 lowercase letters, digits, . _ - only')],
      [f.password, f.password.value.length >= 8 ? null : L('كلمة المرور 8 أحرف على الأقل', 'At least 8 characters')],
    ];
    errs.forEach(([c, m]) => setFieldError(c, m));
    const first = errs.find(([, m]) => m); first?.[0].focus();
    return !first;
  };
  let created = null;
  const ok = await modal(L('مستخدم جديد', 'New user'), body, [{ label: t('cancel'), value: false }, { label: L('إنشاء ومنح الصلاحيات', 'Create & grant access'), value: true, primary: true, icon: 'userPlus' }], {
    beforeClose: () => submitting(body, async () => {
      formError(body, null);
      if (!validate()) return false;
      try { created = await api('/api/admin/users', { method: 'POST', body: { ...Object.fromEntries(Object.entries(f).map(([k, el]) => [k, el.value])), role: role.value, department_id: dept.value, confirm: true } }); return true; } catch (e) { formError(body, e.message); return false; }
    }),
  });
  if (!ok) return;
  const name = f.name_ar.value.trim() || f.username.value;
  toast(L(`أُنشئ حساب «${name}» — ${t(`role.${role.value}`)} في ${deptLabel(depts, dept.value)}`, `Created “${name}” — ${t(`role.${role.value}`)} in ${deptLabel(depts, dept.value)}`));
  ui.flashUser = created?.id || null;
  emit('data-changed', {});
}

async function newDept(depts) {
  const ar = h('input.field', { autocomplete: 'off', placeholder: L('مثال: إدارة الابتكار', 'e.g. Innovation Department') });
  const en = h('input.field', { autocomplete: 'off', dir: 'ltr', placeholder: 'Innovation' });
  const parent = deptSelect(depts, '', { empty: L('— إدارة رئيسية (لا تتبع إدارة أخرى) —', '— Top level (no parent) —') });
  const body = h('div.adm-form',
    field(L('الاسم (عربي)', 'Name (Arabic)'), ar),
    field(L('الاسم (إنجليزي)', 'Name (English)'), en, { helper: L('اختياري — يُستخدم الاسم العربي إن تُرك فارغاً.', 'Optional — the Arabic name is used when empty.') }),
    field(L('تتبع إدارة', 'Parent department'), parent));
  const ok = await modal(L('إدارة جديدة', 'New department'), body, [{ label: t('cancel'), value: false }, { label: L('إنشاء الإدارة', 'Create department'), value: true, primary: true }], {
    beforeClose: () => submitting(body, async () => {
      formError(body, null);
      setFieldError(ar, ar.value.trim() ? null : L('اسم الإدارة مطلوب', 'The department name is required'));
      if (!ar.value.trim()) { ar.focus(); return false; }
      try { await api('/api/admin/departments', { method: 'POST', body: { name_ar: ar.value, name_en: en.value, parent_id: parent.value || null } }); return true; } catch (e) { formError(body, e.message); return false; }
    }),
  });
  if (!ok) return;
  toast(L(`أُنشئت «${ar.value.trim()}» — يمكنك الآن نقل المستخدمين إليها`, `Created “${(en.value || ar.value).trim()}” — you can now move users into it`));
  emit('data-changed', {});
}

