import { api, realtime } from './api.js';
import { t, L, setLang, getLang } from './i18n.js';
import { h, $, $$, icon, toast, initials, debounce, esc } from './ui.js';
import { state, on, emit } from './state.js';
import * as Chat from './chat.js';
import * as Editor from './editor.js';
import { renderHome } from './views/home.js';
import { renderAdaa } from './views/adaa.js';
import { renderProjects, renderProject } from './views/projects.js';
import { renderTasks } from './views/tasks.js';
import { renderDocuments } from './views/documents.js';
import { renderApps } from './views/apps.js';
import { renderUploader } from './views/uploader.js';
import { renderAdmin } from './views/admin.js';
import { renderOffice } from './views/office.js';

// ---------------- theme ----------------
function applyTheme(mode) {
  if (mode) document.documentElement.dataset.theme = mode; else delete document.documentElement.dataset.theme;
  try { mode ? localStorage.setItem('swp.theme', mode) : localStorage.removeItem('swp.theme'); } catch {}
  const dark = mode === 'dark' || (!mode && matchMedia('(prefers-color-scheme: dark)').matches);
  $('#btn-theme').replaceChildren(icon(dark ? 'sun' : 'moon'));
}
try { applyTheme(localStorage.getItem('swp.theme')); } catch { applyTheme(null); }

setLang(getLang());

// ---------------- login ----------------
const DEMO = [['president', 'خالد المنصوري', 'الرئيس'], ['mariam', 'مريم الكعبي', 'مديرة (مدير المنصة)'], ['omar', 'عمر الظاهري', 'مدير'], ['ahmed', 'أحمد الشامسي', 'موظف'], ['sara', 'سارة النعيمي', 'موظفة'], ['noura', 'نورة المهيري', 'موظفة — المالية']];
function showLogin() {
  $('#app').classList.add('hidden'); $('#tabbar').classList.add('hidden'); $('#login').classList.remove('hidden');
  const list = $('#demo-list');
  $$('button', list).forEach((b) => b.remove());
  for (const [u, n, r] of DEMO) list.append(h('button', { type: 'button', onclick: () => { $('#lg-user').value = u; $('#lg-pass').value = 'Demo@2026'; $('#lg-pass').focus(); } }, h('span', n), h('span.muted.small', `${u} · ${r}`)));
  $('#lg-user').focus();
}
$('#login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  $('#lg-err').textContent = '';
  try {
    await api('/api/auth/login', { method: 'POST', body: { username: $('#lg-user').value, password: $('#lg-pass').value } });
    const next = new URLSearchParams(location.search).get('next');
    if (next && next.startsWith('/api/identity/sso/authorize')) { location.href = next; return; }
    await boot();
  } catch (err) { $('#lg-err').textContent = err.message; }
});
$('#lg-lang').onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); $('#lg-lang').textContent = getLang() === 'ar' ? 'English' : 'العربية'; };
window.addEventListener('swp:unauth', () => showLogin());

// ---------------- shell ----------------
const ROUTES = {
  home: { key: 'nav.home', icon: 'home', render: renderHome },
  adaa: { key: 'nav.adaa', icon: 'gauge', render: renderAdaa },
  projects: { key: 'nav.projects', icon: 'folder', render: (v, p) => (p[0] ? renderProject(v, p[0]) : renderProjects(v)) },
  tasks: { key: 'nav.tasks', icon: 'check', render: renderTasks },
  documents: { key: 'nav.documents', icon: 'doc', render: renderDocuments },
  office: { key: 'nav.office', icon: 'people', render: renderOffice },
  apps: { key: 'nav.apps', icon: 'grid', render: renderApps },
  uploader: { key: 'nav.uploader', icon: 'upload', render: renderUploader },
  admin: { key: 'nav.admin', icon: 'settings', render: renderAdmin, admin: true },
};

function buildNav() {
  const nav = $('#nav-items'); nav.replaceChildren();
  const add = (r) => nav.append(h('a.item', { href: `#/${r}`, 'data-route': r, title: t(ROUTES[r].key) }, icon(ROUTES[r].icon), h('span', t(ROUTES[r].key))));
  ['home', 'adaa', 'projects', 'tasks', 'documents', 'office'].forEach(add);
  nav.append(h('div.sep'), h('div.section-title', t('nav.apps')));
  add('apps'); add('uploader');
  if (state.me.user.is_admin) add('admin');
  const u = state.me.user;
  $('#user-card').replaceChildren(h('div.avatar', initials(L(u.name_ar, u.name_en))), h('div', { style: { minWidth: 0 } },
    h('div.small', { style: { fontWeight: 600 } }, L(u.name_ar, u.name_en)),
    h('div.tiny.muted', `${t('role.' + u.role)} · ${L(u.dept_ar, u.dept_en)}`),
    u.is_demo ? h('span.chip.demo.tiny', t('demo')) : null));
  $('#btn-logout').replaceChildren(icon('logout'));
  $('#btn-menu').replaceChildren(icon('menu'));
  $('.search .icon-slot').replaceChildren(icon('search'));
  const tb = $('#tabbar'); tb.replaceChildren();
  const tab = (id, ic, label, fn) => tb.append(h('button', { 'data-tab': id, onclick: fn }, icon(ic), h('span', label)));
  tab('home', 'home', t('tab.home'), () => { setTab('home'); if (!['home', 'adaa', 'projects', 'tasks', 'documents'].includes(state.route)) location.hash = '#/home'; });
  tab('chat', 'chat', t('tab.chat'), () => setTab('chat'));
  tab('doc', 'doc', t('tab.doc'), () => { if (state.openDocumentId) setTab('doc'); else { location.hash = '#/documents'; setTab('home'); toast(L('افتح مستنداً من قائمة المستندات', 'Open a document from the list')); } });
  tab('apps', 'grid', t('tab.apps'), () => { location.hash = '#/apps'; setTab('home'); });
  tab('menu', 'menu', t('tab.menu'), () => toggleNav(true));
}
export function setTab(tab) {
  document.body.dataset.tab = tab;
  $$('#tabbar button').forEach((b) => b.classList.toggle('on', b.dataset.tab === tab));
  if (tab === 'chat') setTimeout(() => $('#chat-input').focus(), 50);
}
function toggleNav(open) { $('#nav').classList.toggle('open', open); $('#scrim').classList.toggle('hidden', !open); }
$('#btn-menu').onclick = () => toggleNav(true);
$('#scrim').onclick = () => toggleNav(false);
$('#btn-theme').onclick = () => { const cur = document.documentElement.dataset.theme; const dark = cur === 'dark' || (!cur && matchMedia('(prefers-color-scheme: dark)').matches); applyTheme(dark ? 'light' : 'dark'); };
$('#btn-lang').onclick = () => { setLang(getLang() === 'ar' ? 'en' : 'ar'); $('#btn-lang').replaceChildren(h('span.tiny', getLang() === 'ar' ? 'EN' : 'ع')); buildNav(); route(); Chat.refreshContext(); };
$('#btn-logout').onclick = async () => { await api('/api/auth/logout', { method: 'POST' }).catch(() => {}); location.hash = ''; location.reload(); };

// ---------------- router ----------------
let renderSeq = 0;
export async function route({ soft = false } = {}) {
  const [, r = 'home', ...params] = (location.hash || '#/home').split('/');
  const def = ROUTES[r] || ROUTES.home;
  if (def.admin && !state.me.user.is_admin) { location.hash = '#/home'; return; }
  const changed = state.route !== r || JSON.stringify(state.params) !== JSON.stringify(params);
  state.route = ROUTES[r] ? r : 'home'; state.params = params;
  if (changed && r === 'projects' && params[0]) state.selectedProjectId = params[0];
  $$('#nav a.item').forEach((a) => a.classList.toggle('on', a.dataset.route === state.route));
  $('#view-title').textContent = t(def.key);
  toggleNav(false);
  const seq = ++renderSeq;
  const view = $('#view');
  const container = h('div', { class: soft ? '' : 'view-enter' });
  try {
    await def.render(container, params, { soft });
    if (seq !== renderSeq) return;
    const scroll = view.scrollTop;
    view.replaceChildren(container);
    if (soft) view.scrollTop = scroll;
  } catch (e) {
    if (seq !== renderSeq) return;
    view.replaceChildren(h('div.card', h('p', `${L('تعذّر التحميل', 'Failed to load')}: ${e.message}`)));
  }
  Chat.refreshContext();
}
window.addEventListener('hashchange', () => route());

// Live refresh: any change to data the user can see re-renders the open view softly.
const softRefresh = debounce(() => route({ soft: true }), 250);
on('data-changed', softRefresh);

// ---------------- search ----------------
const doSearch = debounce(async (q) => {
  const box = $('#search-results');
  if (!q.trim()) { box.classList.add('hidden'); return; }
  const res = await api(`/api/search?q=${encodeURIComponent(q)}`).catch(() => []);
  const TYPES = { project: L('مشروع', 'Project'), task: L('مهمة', 'Task'), document: L('مستند', 'Document'), event: L('موعد', 'Event') };
  box.replaceChildren(...(res.length ? res.map((r) => h('button', { role: 'option', onclick: () => { box.classList.add('hidden'); $('#search').value = ''; openResult(r); } }, h('span.chip.tiny', TYPES[r.type]), h('span', r.title))) : [h('div.empty.small', L('لا نتائج ضمن صلاحياتك', 'No results within your access'))]));
  box.classList.remove('hidden');
}, 200);
$('#search').addEventListener('input', (e) => doSearch(e.target.value));
$('#search').addEventListener('blur', () => setTimeout(() => $('#search-results').classList.add('hidden'), 200));
function openResult(r) {
  if (r.type === 'project') location.hash = `#/projects/${r.id}`;
  else if (r.type === 'document') Editor.open(r.id);
  else if (r.type === 'task') location.hash = '#/tasks';
  else location.hash = '#/home';
}

// ---------------- boot ----------------
let stopRt = null;
async function boot() {
  let me;
  try { me = await api('/api/me'); } catch { showLogin(); return; }
  state.me = me;
  $('#login').classList.add('hidden'); $('#app').classList.remove('hidden'); $('#tabbar').classList.remove('hidden');
  if (me.user.lang && !localStorage.getItem('swp.lang')) setLang(me.user.lang);
  buildNav(); setTab('home');
  Chat.init(); Editor.init();
  stopRt?.();
  stopRt = realtime((ev) => {
    if (ev.type === 'changed') {
      emit('data-changed', ev);
      if (ev.entity === 'document') emit('document-changed', ev);
      if (ev.entity === 'dashboard') emit('dashboard-changed', ev);
    }
  }, (st) => {
    const el = $('#rt-status');
    el.className = `chip ${st === 'live' ? 'good' : 'warn'}`;
    el.replaceChildren(h('span.dot'), h('span.tiny', t(`rt.${st}`)));
    if (st === 'live') emit('data-changed', { entity: 'all' });
  });
  await route();
}
boot();

export { toggleNav };
