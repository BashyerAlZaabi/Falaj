// App shell: authentication, sidebar, contextual toolbar, command palette,
// notifications, router, realtime, mobile tab bar.
import { api, realtime } from './api.js';
import { t, L, setLang, getLang } from './i18n.js';
import { h, $, $$, icon, toast, initials, debounce, menu, isMac, errorState, avatar } from './ui.js';
import { state, on, emit } from './state.js';
import * as Chat from './chat.js';
import * as Editor from './editor.js';
import { openPalette, configure as configurePalette, bindShortcut, remember } from './palette.js';
import { renderHome } from './views/home.js';
import { renderAdaa } from './views/adaa.js';
import { renderProjects, renderProject, newProject, newTask } from './views/projects.js';
import { renderTasks } from './views/tasks.js';
import { renderDocuments, newDoc } from './views/documents.js';
import { renderApps } from './views/apps.js';
import { renderUploader } from './views/uploader.js';
import { renderAdmin } from './views/admin.js';
import { renderOffice, builder as officeBuilder } from './views/office.js';
import { renderAchievements } from './views/achievements.js';
import { initGame } from './game.js';
import { renderSystem, systemMeta, sortSystems } from './systems.js';

const store = { get: (k, d) => { try { return localStorage.getItem(k) ?? d; } catch { return d; } }, set: (k, v) => { try { v == null ? localStorage.removeItem(k) : localStorage.setItem(k, v); } catch {} } };

// ---------------- theme (system / light / dark) ----------------
const themeMode = () => store.get('swp.theme', 'system');
function applyTheme(mode) {
  if (mode === 'light' || mode === 'dark') document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme;
  store.set('swp.theme', mode === 'system' ? null : mode);
  const dark = mode === 'dark' || (mode === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
  document.head.append(h('meta', { name: 'theme-color', content: dark ? '#070708' : '#F2F2F5' }));
}
applyTheme(themeMode());
setLang(getLang());
$$('.brand-mark').forEach((b) => b.replaceChildren(icon('layers')));
$('#lg-reveal')?.replaceChildren(icon('eye'));
$$('.icon-slot').forEach((s) => s.replaceWith(icon(s.closest('#btn-ask') || s.closest('.panel-head') ? 'spark' : 'search')));

// ---------------- login ----------------
// Demo personas across departments (password Demo@2026), plus external identities.
const DEMO = [
  ['القيادة', 'Leadership', [['president', 'خالد المنصوري', 'Khalid Al Mansoori', 'الرئيس', 'President']]],
  ['التحول الرقمي', 'Digital Transformation', [['mariam', 'مريم الكعبي', 'Mariam Al Kaabi', 'مديرة · مدير المنصة', 'Director · Admin'], ['ahmed', 'أحمد الشامسي', 'Ahmed Al Shamsi', 'مهندس أنظمة', 'Systems Engineer'], ['sara', 'سارة النعيمي', 'Sara Al Nuaimi', 'محللة أعمال', 'Business Analyst']]],
  ['المشاريع الاستراتيجية', 'Strategic Projects', [['latifa', 'لطيفة السويدي', 'Latifa Al Suwaidi', 'مديرة الإدارة', 'Director'], ['hamad', 'حمد الكتبي', 'Hamad Al Ketbi', 'محلل أداء استراتيجي', 'Strategy Analyst']]],
  ['الموارد البشرية', 'Human Resources', [['hessa', 'حصة البلوشي', 'Hessa Al Balushi', 'مديرة الموارد البشرية', 'HR Director'], ['salem', 'سالم الرميثي', 'Salem Al Rumaithi', 'أخصائي موارد بشرية', 'HR Specialist']]],
  ['المالية والمشتريات', 'Finance & Procurement', [['majed', 'ماجد الحوسني', 'Majed Al Hosani', 'المدير المالي', 'CFO'], ['noura', 'نورة المهيري', 'Noura Al Muhairi', 'محاسبة', 'Accountant'], ['reem', 'ريم العامري', 'Reem Al Ameri', 'أخصائية مشتريات', 'Procurement Specialist']]],
  ['الشؤون القانونية', 'Legal Affairs', [['yousef', 'يوسف الزعابي', 'Yousef Al Zaabi', 'مدير قانوني · الامتثال', 'Legal Director · Compliance']]],
  ['التدقيق الداخلي', 'Internal Audit', [['aisha', 'عائشة النقبي', 'Aisha Al Naqbi', 'رئيسة التدقيق', 'Chief Audit Executive'], ['saeed', 'سعيد المزروعي', 'Saeed Al Mazrouei', 'مدقق داخلي', 'Internal Auditor']]],
  ['العمليات', 'Operations', [['omar', 'عمر الظاهري', 'Omar Al Dhaheri', 'مدير العمليات', 'Operations Director'], ['fatima', 'فاطمة الحمادي', 'Fatima Al Hammadi', 'أخصائية عمليات', 'Operations Specialist']]],
  ['جهات خارجية', 'External parties', [['rashid', 'راشد المرر', 'Rashid Al Marar', 'مدقق خارجي', 'External Auditor'], ['horizon', 'عبدالله الفلاسي', 'Abdulla Al Falasi', 'مقدم خدمة — الأفق', 'Provider — Horizon'], ['oasis', 'ليلى الشحي', 'Laila Al Shehhi', 'مقدم خدمة — الواحة', 'Provider — Oasis']]],
];
let sessionExpired = false;
function showLogin() {
  if (state.me) sessionExpired = true;
  $('#login-banner')?.classList.toggle('hidden', !sessionExpired);
  $('#app').classList.add('hidden'); $('#tabbar').classList.add('hidden'); $('#login').classList.remove('hidden');
  $('#demo-grid').replaceChildren(...DEMO.map(([gar, gen, people]) => h('div.demo-dept', { role: 'group', 'aria-label': L(gar, gen) }, h('div.demo-dept-title', L(gar, gen)),
    h('div.demo-people', people.map(([u, ar, en, rar, ren]) => h('button', { type: 'button', 'aria-label': `${L('دخول باسم', 'Sign in as')} ${L(ar, en)} — ${L(rar, ren)}`, onclick: () => { $('#lg-user').value = u; $('#lg-pass').value = 'Demo@2026'; $('#login-form').requestSubmit(); } },
      avatar(ar), h('span', h('span.n', L(ar, en)), h('span.r', L(rar, ren)))))))));
  $('#login-hero').replaceChildren(
    h('div.lh-brand', h('span.brand-mark', icon('layers')), h('span', h('b', L('منصة العمل الذكية', 'Smart Work Platform')), h('small', L('مساحة العمل الحكومية الموحدة', 'Unified government workspace')))),
    h('div', h('h2', L('كل عملك في مكان واحد — بذكاء وأمان', 'All your work in one place — smart and secure')),
      h('p.lh-lead', L('مساحة عمل موحدة تجمع المشاريع والمهام والمستندات والأنظمة المؤسسية، مع مساعد ذكي ينفّذ طلباتك ضمن صلاحياتك.', 'One workspace for projects, tasks, documents and enterprise systems, with an assistant that acts within your permissions.')),
      h('ul',
        h('li', h('span.lh-ic', icon('grid')), h('span', h('b', L('أنظمة متكاملة', 'Integrated systems')), L('الأداء الاستراتيجي، الاجتماعات، المشتريات، التدقيق، الجوائز والمزيد', 'Strategy, meetings, procurement, audit, awards and more'))),
        h('li', h('span.lh-ic', icon('spark')), h('span', h('b', L('مساعد ذكي تحت سيطرتك', 'An assistant you control')), L('ينفّذ ويؤكد قبل الإجراءات الحساسة، ولا يصل إلا لما تسمح به سياسة البيانات', 'Executes, confirms sensitive actions, and only reads what data policy allows'))),
        h('li', h('span.lh-ic', icon('lockKeyhole')), h('span', h('b', L('بيانات لا تختلط', 'Data that never mixes')), L('عزل حسب القسم والتصنيف، وسجل اطلاع للبيانات السرية، وVault معزول', 'Isolation by department and classification, access logs for sensitive data, isolated Vault'))))),
    h('div.lh-foot', L('بيئة تجريبية — البيانات المعروضة تجريبية', 'Demo environment — data shown is sample data')));
  $('#lg-lang').textContent = getLang() === 'ar' ? 'English' : 'العربية';
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => $('#lg-user').focus(), 50);
}
$('#lg-reveal')?.addEventListener('click', () => { const p = $('#lg-pass'); const show = p.type === 'password'; p.type = show ? 'text' : 'password'; $('#lg-reveal').replaceChildren(icon(show ? 'eyeOff' : 'eye')); $('#lg-reveal').setAttribute('aria-pressed', String(show)); $('#lg-reveal').setAttribute('aria-label', show ? L('إخفاء كلمة المرور', 'Hide password') : L('إظهار كلمة المرور', 'Show password')); });
$('#lg-pass').addEventListener('keyup', (e) => { $('#lg-caps').classList.toggle('hidden', !e.getModifierState?.('CapsLock')); });
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = $('#login-form button[type=submit]');
  $('#lg-err').textContent = '';
  const u = $('#lg-user'); const p = $('#lg-pass');
  u.removeAttribute('aria-invalid'); p.removeAttribute('aria-invalid');
  if (!u.value.trim() || !p.value) { $('#lg-err').textContent = L('أدخل اسم المستخدم وكلمة المرور', 'Enter your username and password'); (u.value.trim() ? p : u).setAttribute('aria-invalid', 'true'); return; }
  btn.classList.add('is-loading');
  try {
    await api('/api/auth/login', { method: 'POST', body: { username: u.value, password: p.value } });
    const next = new URLSearchParams(location.search).get('next');
    if (next && next.startsWith('/api/identity/sso/authorize')) { location.href = next; return; }
    sessionExpired = false;
    await boot();
  } catch (err) { $('#lg-err').textContent = err.message; p.setAttribute('aria-invalid', 'true'); p.select(); }
  finally { btn.classList.remove('is-loading'); }
});
$('#lg-lang').onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); showLogin(); };
window.addEventListener('swp:unauth', () => showLogin());

// ---------------- routes ----------------
const ROUTES = {
  home: { key: 'nav.home', icon: 'home', group: 'work', render: renderHome },
  adaa: { key: 'nav.adaa', icon: 'gauge', group: 'work', render: renderAdaa },
  projects: { key: 'nav.projects', icon: 'folder', group: 'work', render: (v, p, o) => (p[0] ? renderProject(v, p[0], o) : renderProjects(v, o)) },
  tasks: { key: 'nav.tasks', icon: 'check', group: 'work', render: renderTasks },
  documents: { key: 'nav.documents', icon: 'doc', group: 'work', render: renderDocuments },
  office: { key: 'nav.office', icon: 'bot', group: 'work', render: renderOffice },
  achievements: { key: 'nav.achievements', icon: 'badgeCheck', group: 'work', render: renderAchievements },
  apps: { key: 'nav.apps', icon: 'grid', group: 'apps', render: renderApps },
  uploader: { key: 'nav.uploader', icon: 'upload', group: 'apps', render: renderUploader },
  admin: { key: 'nav.admin', icon: 'settings', group: 'admin', render: renderAdmin, admin: true },
  // enterprise systems: #/sys/<key>/<tab>/<id>… (nav entries are built from /api/me.systems)
  sys: { key: 'nav.sys', icon: 'grid', group: null, render: (v, p, o) => renderSystem(v, p[0], p.slice(1), o), external: true },
  integrations: { key: 'nav.sys', icon: 'plug', group: null, alias: '#/sys/integrations' },
};
const GROUPS = [['work', 'nav.group.work'], ['apps', 'nav.apps'], ['admin', 'nav.group.admin']];

// ---------------- shell ----------------
const isExternal = () => !!state.me?.external;
function systemsGroup() {
  const list = sortSystems((state.me.systems || []).filter((s) => s.pinned));
  if (!list.length) return null;
  return h('div.nav-group.nav-systems', { role: 'group', 'aria-label': t('nav.group.systems') }, h('div.nav-group-title', t('nav.group.systems')),
    list.map((s) => h('a.item', { href: `#/sys/${s.key}`, 'data-route': `sys:${s.key}`, title: L(s.name_ar, s.name_en) }, icon(s.icon), h('span.label', L(s.name_ar, s.name_en)), h('span.nav-badge.hidden', { 'data-badge': `sys:${s.key}` }))));
}
function buildNav() {
  const nav = $('#nav-items'); nav.replaceChildren();
  document.body.dataset.external = isExternal() ? '1' : '';
  if (isExternal()) { nav.append(systemsGroup() || ''); }
  for (const [g, key] of isExternal() ? [] : GROUPS) {
    if (g === 'apps') { const sg = systemsGroup(); if (sg) nav.append(sg); }
    const keys = Object.keys(ROUTES).filter((r) => ROUTES[r].group === g && (!ROUTES[r].admin || state.me.user.is_admin));
    if (!keys.length) continue;
    nav.append(h('div.nav-group', { role: 'group', 'aria-label': t(key) }, h('div.nav-group-title', t(key)),
      keys.map((r) => h('a.item', { href: `#/${r}`, 'data-route': r, title: t(ROUTES[r].key) }, icon(ROUTES[r].icon), h('span.label', t(ROUTES[r].key)), h('span.nav-badge.hidden', { 'data-badge': r })))));
  }
  const u = state.me.user;
  $('#user-card').replaceChildren(avatar(u.name_ar), h('span.who', h('div.name', L(u.name_ar, u.name_en)), h('div.role', L(u.title_ar, u.title_en) || `${t('role.' + u.role)} · ${L(u.dept_ar, u.dept_en)}`)), u.is_demo ? h('span.chip.demo.tiny', t('demo')) : null, icon('chevronDown', 'chev'));
  $('#btn-collapse').replaceChildren(icon('sidebar'));
  $('#btn-collapse').setAttribute('aria-label', L('طي/توسيع الشريط الجانبي', 'Collapse/expand sidebar'));
  $('#btn-menu').replaceChildren(icon('menu'));
  $('#btn-alerts').replaceChildren(icon('bell'), h('span.badge-dot.hidden', { id: 'alerts-count' }));
  $('#btn-alerts').setAttribute('aria-label', L('التنبيهات', 'Notifications')); $('#btn-alerts').setAttribute('data-tip', L('التنبيهات', 'Notifications'));
  $('#btn-new').replaceChildren(icon('plus'));
  $('#btn-new').setAttribute('aria-label', L('إنشاء جديد', 'Create new')); $('#btn-new').setAttribute('data-tip', L('إنشاء جديد', 'Create new'));
  $$('#kbd-hint, .search-trigger kbd').forEach((k) => { k.textContent = isMac ? '⌘K' : 'Ctrl K'; });
  const tb = $('#tabbar'); tb.replaceChildren();
  const tab = (id, ic, label, fn) => tb.append(h('button', { type: 'button', 'data-tab': id, onclick: fn, 'aria-label': label }, icon(ic), h('span', label)));
  // The first tab is the workspace (whatever page is open), not only the Home page.
  tab('home', 'home', t('tab.home'), () => { setTab('home'); if (['apps', 'uploader', 'admin'].includes(state.route)) location.hash = '#/home'; });
  tab('chat', 'chat', t('tab.chat'), () => setTab('chat'));
  tab('doc', 'doc', t('tab.doc'), () => { if (state.openDocumentId) setTab('doc'); else { location.hash = '#/documents'; setTab('home'); toast(L('افتح مستنداً من قائمة المستندات', 'Open a document from the list'), { kind: 'info' }); } });
  tab('apps', 'grid', t('tab.apps'), () => { location.hash = '#/apps'; setTab('apps'); });
  tab('menu', 'menu', t('tab.menu'), () => toggleNav(true));
}

function userMenu() {
  const u = state.me.user; const mode = themeMode();
  menu($('#user-card'), [
    { node: h('div.menu-title', `${L(u.name_ar, u.name_en)} · ${L(u.title_ar, u.title_en) || t('role.' + u.role)}`) },
    { sep: true },
    { title: L('المظهر', 'Appearance') },
    { label: L('حسب النظام', 'System'), icon: 'monitor', checked: mode === 'system', onClick: () => applyTheme('system') },
    { label: L('فاتح', 'Light'), icon: 'sun', checked: mode === 'light', onClick: () => applyTheme('light') },
    { label: L('داكن', 'Dark'), icon: 'moon', checked: mode === 'dark', onClick: () => applyTheme('dark') },
    { sep: true },
    { label: getLang() === 'ar' ? 'English' : 'العربية', icon: 'languages', onClick: switchLang },
    { label: L('لوحة الأوامر', 'Command palette'), icon: 'command', hint: isMac ? '⌘K' : 'Ctrl K', onClick: () => openPalette() },
    { sep: true },
    { label: L('تسجيل الخروج', 'Sign out'), icon: 'logout', danger: true, id: 'btn-logout', onClick: logout },
  ], { align: 'start', width: 250 });
}
async function logout() { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.hash = ''; location.reload(); }
function switchLang() { setLang(getLang() === 'ar' ? 'en' : 'ar'); buildNav(); route(); Chat.refreshContext(); refreshBadges(); }

async function alertsMenu() {
  const list = await api('/api/alerts').catch(() => []);
  const items = list.slice(0, 8).map((a) => ({ node: h('div.menu-item.alert-item', { role: 'menuitem', tabindex: -1 },
    h(`span.chip.tiny.${a.level === 'critical' ? 'crit' : a.level === 'warning' ? 'warn' : 'info'}`, icon(a.level === 'info' ? 'info' : 'alert')),
    h('span.grow', h('div.alert-title', a.title), a.body ? h('div.tiny.faint', a.body) : null),
    !a.derived && !a.read_at ? h('button.btn.sm.ghost', { type: 'button', onclick: async (e) => { e.stopPropagation(); await api(`/api/alerts/${a.id}/read`, { method: 'POST' }); e.target.closest('.menu-item').style.opacity = 0.5; refreshBadges(); } }, L('قُرئ', 'Read')) : null) }));
  menu($('#btn-alerts'), [{ title: L('التنبيهات', 'Notifications') }, ...(items.length ? items : [{ node: h('div.empty.tiny', L('لا تنبيهات جديدة', 'You are all caught up')) }]), { sep: true }, { label: L('فتح ملخص اليوم', 'Open daily summary'), icon: 'spark', onClick: () => { location.hash = '#/home'; } }], { width: 340 });
}
const newActions = () => [
  { label: L('مهمة جديدة', 'New task'), icon: 'taskPlus', keywords: 'task مهمة', run: () => newTask(null) },
  { label: L('مشروع جديد', 'New project'), icon: 'folderPlus', keywords: 'project مشروع', run: () => newProject() },
  { label: L('مستند جديد', 'New document'), icon: 'filePlus', keywords: 'document مستند', run: () => newDoc() },
  { label: L('وكيل جديد', 'New agent'), icon: 'bot', keywords: 'agent وكيل office', run: async () => officeBuilder(await api('/api/office/templates')) },
  { label: L('رفع ملف إلى مرصاد', 'Upload to Marsad'), icon: 'upload', keywords: 'upload رفع marsad', run: () => { location.hash = '#/uploader'; } },
];
function newMenu() { menu($('#btn-new'), [{ title: L('إنشاء', 'Create') }, ...newActions().map((a) => ({ label: a.label, icon: a.icon, onClick: a.run }))], { width: 230 }); }

export function setTab(tab) {
  document.body.dataset.tab = tab;
  $$('#tabbar button').forEach((b) => { const on = b.dataset.tab === tab; b.classList.toggle('on', on); on ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current'); });
  if (tab === 'chat') setTimeout(() => $('#chat-input').focus(), 50);
}
function toggleNav(open) { $('#nav').classList.toggle('open', open); $('#scrim').classList.toggle('hidden', !open); $('#btn-menu').setAttribute('aria-expanded', String(!!open)); if (open && innerWidth <= 900) setTimeout(() => ($('#nav a.item.on') || $('#nav a.item'))?.focus(), 60); }
function setChatVisible(v, { remember = true } = {}) {
  if (innerWidth <= 900) { setTab(v ? 'chat' : 'home'); return; }
  $('#chat').classList.toggle('collapsed', !v);
  $('#btn-ask').setAttribute('aria-pressed', String(v));
  $('#ask-dock').classList.toggle('hidden', v);
  if (remember) store.set('swp.chat', v ? 'shown' : 'hidden');
  if (v) setTimeout(() => $('#chat-input').focus(), 60);
}
$('#ask-dock').onclick = () => setChatVisible(true);
// "/" opens Ask AI from anywhere (unless typing)
document.addEventListener('keydown', (e) => {
  if (e.key !== '/' || e.metaKey || e.ctrlKey || e.altKey || !state.me) return;
  if (e.target.closest('input, textarea, select, [contenteditable="true"]')) return;
  e.preventDefault(); setChatVisible(true);
});
$('#btn-menu').onclick = () => toggleNav(true);
$('#scrim').onclick = () => toggleNav(false);
$('#btn-collapse').onclick = () => {
  const app = $('#app');
  if (innerWidth <= 900) { toggleNav(false); $('#btn-menu').focus(); return; }
  if (innerWidth <= 1280 && innerWidth > 900) { app.classList.toggle('nav-expanded'); return; }
  const c = app.classList.toggle('nav-collapsed'); store.set('swp.nav', c ? 'collapsed' : null);
};
$('#user-card').onclick = userMenu;
$('#btn-alerts').onclick = alertsMenu;
$('#btn-new').onclick = newMenu;
$('#btn-search').onclick = () => openPalette();
$('#nav-search').onclick = () => { toggleNav(false); openPalette(); };
$('#btn-ask').onclick = () => setChatVisible($('#chat').classList.contains('collapsed') || innerWidth <= 900);
document.addEventListener('keydown', (e) => {
  const nav = $('#nav');
  if (!nav.classList.contains('open')) return;
  if (e.key === 'Escape') { toggleNav(false); $('#btn-menu').focus(); return; }
  if (e.key === 'Tab') { // keep focus inside the open drawer
    const f = $$('a[href], button:not([disabled])', nav).filter((x) => x.offsetParent !== null);
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }
});
// Swipe the drawer back towards its edge to dismiss (touch)
(() => {
  const nav = $('#nav'); let x0 = null; let dx = 0;
  nav.addEventListener('touchstart', (e) => { if (nav.classList.contains('open')) { x0 = e.touches[0].clientX; dx = 0; nav.style.transition = 'none'; } }, { passive: true });
  nav.addEventListener('touchmove', (e) => {
    if (x0 == null) return;
    const rtl = document.documentElement.dir === 'rtl';
    dx = e.touches[0].clientX - x0;
    const toward = rtl ? Math.max(0, dx) : Math.min(0, dx);
    nav.style.transform = `translateX(${toward}px)`;
  }, { passive: true });
  nav.addEventListener('touchend', () => {
    if (x0 == null) return;
    nav.style.transition = ''; nav.style.transform = '';
    const rtl = document.documentElement.dir === 'rtl';
    if ((rtl && dx > 70) || (!rtl && dx < -70)) toggleNav(false);
    x0 = null;
  });
})();
window.addEventListener('swp:chat-visible', (e) => setChatVisible(e.detail));

// ---------------- router ----------------
let renderSeq = 0;
export async function route({ soft = false } = {}) {
  const [, r = 'home', ...params] = (location.hash || '#/home').split('/');
  if (ROUTES[r]?.alias) { location.replace(ROUTES[r].alias + (params.length ? '/' + params.join('/') : '')); return; }
  // External identities only ever see their portal systems.
  if (isExternal() && r !== 'sys') { const first = sortSystems(state.me.systems || [])[0]; location.replace(first ? `#/sys/${first.key}` : '#/sys/none'); return; }
  const def = ROUTES[r] || ROUTES.home;
  if (def.admin && !state.me.user.is_admin) { location.hash = '#/home'; return; }
  const key = ROUTES[r] ? r : 'home';
  if (key === 'projects' && params[0]) state.selectedProjectId = params[0];
  state.route = key; state.params = params;
  if (innerWidth <= 900 && !['chat', 'doc'].includes(document.body.dataset.tab)) setTab(['apps', 'uploader', 'admin'].includes(key) ? 'apps' : 'home');
  const navKey = key === 'sys' ? `sys:${params[0]}` : key;
  $$('#nav a.item').forEach((a) => { const on = a.dataset.route === navKey; a.classList.toggle('on', on); on ? a.setAttribute('aria-current', 'page') : a.removeAttribute('aria-current'); });
  toggleNav(false);
  const seq = ++renderSeq;
  const view = $('#view');
  const prog = $('#route-progress'); const progTimer = soft ? null : setTimeout(() => prog?.classList.add('on'), 160);
  const container = h('div', { class: soft ? '' : 'view-enter' });
  if (!soft) setCrumbs(key, params);
  try {
    await def.render(container, params, { soft });
    if (seq !== renderSeq) return;
    const scroll = view.scrollTop;
    view.replaceChildren(container);
    view.scrollTop = soft ? scroll : 0;
  } catch (e) {
    if (seq !== renderSeq) return;
    view.replaceChildren(h('div', h('div.card', errorState({ message: `${L('تعذّر التحميل', 'Failed to load')}: ${e.message}` }, () => route()))));
  }
  clearTimeout(progTimer); prog?.classList.remove('on');
  setCrumbs(key, params);
  if (!soft) { view.focus({ preventScroll: true }); const title = routeTitle(key, params); document.title = `${title} · ${t('brand')}`; remember(location.hash || '#/home', title + (key === 'projects' && params[0] && state.projectName ? ` › ${state.projectName}` : '')); }
  Chat.refreshContext();
}
function routeTitle(key, params) {
  if (key === 'sys') { const m = systemMeta(params[0]); return m ? L(m.name_ar, m.name_en) : t('nav.sys'); }
  return t(ROUTES[key].key);
}
function setCrumbs(key, params) {
  const c = $('#crumbs'); const title = routeTitle(key, params);
  if (key === 'projects' && params[0]) c.replaceChildren(h('a', { href: '#/projects' }, title), h('span.sep', { 'aria-hidden': 'true' }, icon('chevron', 'sm')), h('h2#view-title', state.projectName || '…'));
  else c.replaceChildren(h('h2#view-title', title));
}
window.addEventListener('hashchange', () => route());

// Live refresh: any change to data the user can see re-renders the open view softly.
const softRefresh = debounce(() => { route({ soft: true }); refreshBadges(); }, 250);
on('data-changed', softRefresh);

// ---------------- badges (alerts, pending agent reviews) ----------------
async function refreshBadges() {
  const [alerts, runs] = await Promise.all([api('/api/alerts').catch(() => []), isExternal() ? [] : api('/api/office/runs?status=awaiting_review').catch(() => [])]);
  const unread = alerts.filter((a) => a.derived || !a.read_at).length;
  const ac = $('#alerts-count'); if (ac) { ac.textContent = unread > 9 ? '9+' : String(unread); ac.classList.toggle('hidden', !unread); }
  const ob = $('[data-badge="office"]'); if (ob) { ob.textContent = String(runs.length); ob.classList.toggle('hidden', !runs.length); ob.classList.add('alert'); }
}

// ---------------- palette ----------------
function openResult(r) {
  if (r.type === 'project') location.hash = `#/projects/${r.id}`;
  else if (r.type === 'document') Editor.open(r.id);
  else if (r.type === 'task') location.hash = '#/tasks';
  else location.hash = '#/home';
}
configurePalette({ openResult, ask: (q) => { setChatVisible(true); Chat.send(q); } });
bindShortcut();

// ---------------- boot ----------------
let stopRt = null;
async function boot() {
  let me;
  try { me = await api('/api/me'); } catch { showLogin(); return; }
  state.me = me;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#tabbar').classList.remove('hidden');
  if (me.user.lang && !store.get('swp.lang')) setLang(me.user.lang);
  if (store.get('swp.nav') === 'collapsed') $('#app').classList.add('nav-collapsed');
  // Desktop-first: the Ask AI inspector is open by default only on wide screens;
  // otherwise the floating Ask AI bar keeps it one click / "/" away.
  if (innerWidth > 900 && !me.external) { const pref = store.get('swp.chat'); setChatVisible(pref ? pref === 'shown' : innerWidth >= 1600, { remember: false }); }
  buildNav(); setTab('home');
  configurePalette({
    routes: [
      ...(me.external ? [] : Object.entries(ROUTES).filter(([, d]) => d.group && (!d.admin || me.user.is_admin)).map(([k, d]) => ({ key: k, label: t(d.key), icon: d.icon }))),
      ...sortSystems(me.systems || []).map((s) => ({ key: `sys/${s.key}`, label: L(s.name_ar, s.name_en), icon: s.icon, hint: L(s.description_ar, s.description_en) })),
    ],
    actions: [
      ...newActions(),
      { label: L('جهّز ملخص اليوم', 'Prepare my daily summary'), icon: 'spark', keywords: 'summary ملخص', run: () => { setChatVisible(true); Chat.send(L('جهّز لي ملخص اليوم', 'Prepare my daily summary')); } },
      { label: L('تبديل المظهر الفاتح/الداكن', 'Toggle light/dark'), icon: 'moon', keywords: 'theme dark light مظهر داكن', run: () => { const d = document.documentElement.dataset.theme === 'dark' || (!document.documentElement.dataset.theme && matchMedia('(prefers-color-scheme: dark)').matches); applyTheme(d ? 'light' : 'dark'); } },
      { label: getLang() === 'ar' ? 'Switch to English' : 'التبديل إلى العربية', icon: 'languages', keywords: 'language لغة', run: switchLang },
      { label: L('إظهار/إخفاء Ask AI', 'Show/hide Ask AI'), icon: 'chat', keywords: 'chat محادثة ai', run: () => setChatVisible($('#chat').classList.contains('collapsed')) },
      { label: L('تسجيل الخروج', 'Sign out'), icon: 'logout', keywords: 'logout خروج', run: logout },
    ].filter((a) => !me.external || ['moon', 'languages', 'logout'].includes(a.icon)),
  });
  if (!me.external) { Chat.init(); Editor.init(); initGame($('#level-chip-host')); }
  else { setChatVisible(false, { remember: false }); $('#level-chip-host').replaceChildren(); }
  // Mobile "Document" tab reflects whether a document is open
  const syncDocTab = () => { const b = $('#tabbar button[data-tab="doc"]'); if (b) { const off = $('#editor').classList.contains('collapsed'); b.classList.toggle('dim', off); b.setAttribute('aria-disabled', String(off)); if (off && document.body.dataset.tab === 'doc') setTab('home'); } };
  new MutationObserver(syncDocTab).observe($('#editor'), { attributes: true, attributeFilter: ['class'] });
  syncDocTab();
  let rtWas = null;
  stopRt?.();
  stopRt = realtime((ev) => {
    if (ev.type === 'changed') {
      emit('data-changed', ev);
      if (ev.entity === 'document') emit('document-changed', ev);
      if (ev.entity === 'dashboard') emit('dashboard-changed', ev);
    }
  }, (st) => {
    const el = $('#rt-status');
    el.querySelector('.dot').className = `dot ${st === 'live' ? 'live' : 'off'}`;
    el.setAttribute('data-tip', st === 'live' ? L('متصل — التحديثات لحظية', 'Live — updates in real time') : L('غير متصل — جارٍ إعادة الاتصال', 'Offline — reconnecting'));
    el.setAttribute('aria-label', el.getAttribute('data-tip'));
    if (st === 'live') emit('data-changed', { entity: 'all' });
    // Only speak up on transitions (quiet while healthy)
    if (rtWas === 'live' && st === 'offline') toast(L('انقطع الاتصال اللحظي — جارٍ إعادة الاتصال…', 'Live updates paused — reconnecting…'), { kind: 'info', timeout: 4000 });
    if (rtWas === 'offline' && st === 'live') toast(L('عادت التحديثات اللحظية', 'Live updates resumed'), { timeout: 2500 });
    rtWas = st;
  });
  await route();
  refreshBadges();
}
boot();

export { toggleNav, applyTheme };
