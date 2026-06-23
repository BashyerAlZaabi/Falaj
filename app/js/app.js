/* ===== FALAJ — app logic (auth, routing, live simulation, rendering) ===== */

const STORE_KEY = 'falaj_state_v1';
const DYNAMIC_ROUTES = ['home', 'irrigation', 'alerts'];

let S = null;          // app state
let sheet = null;      // open bottom-sheet name or null

/* ---------- state ---------- */
function defaultState() {
  return {
    user: null,
    plan: 'standard',
    route: 'home',
    zones: ZONES.map(z => ({
      id: z.id, mode: z.id === 'B' ? 'manual' : 'auto',
      watering: z.id === 'D', moisture: z.baseMoisture,
      lastWateredAt: Date.now() - (z.id === 'A' ? 3 : 1) * 3600 * 1000,
      usedToday: [320, 140, 260, 90][ZONES.findIndex(x => x.id === z.id)] || 100,
    })),
    sensors: { temp: 34, humidity: 41, nutrients: 78, tank: 82 },
    metrics: { waterSavedToday: 1240, waterSavedMonth: 38600, moneySaved: 2150, productivity: 23 },
    alerts: SEED_ALERTS.map((type, i) => makeAlert(type, Date.now() - (i + 1) * 5400 * 1000, i > 1)),
    water7: [820, 760, 690, 730, 540, 610, 480], // liters/day, trending down (savings)
  };
}

function makeAlert(type, ts, read) {
  const tpl = ALERT_TEMPLATES.find(a => a.type === type);
  return { id: type + '_' + ts, type, params: tpl.param(), ts: ts || Date.now(), read: !!read };
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) S = Object.assign(defaultState(), JSON.parse(raw));
    else S = defaultState();
  } catch (e) { S = defaultState(); }
}
function saveState() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {} }

function zoneMeta(id) { return ZONES.find(z => z.id === id); }
function unreadCount() { return S.alerts.filter(a => !a.read).length; }

/* ---------- helpers ---------- */
function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
function relTime(ts) {
  const h = Math.floor((Date.now() - ts) / 3600000);
  if (h < 1) return t('irr.justNow');
  return t('irr.hoursAgo', { n: h });
}
function ring(pct, color, label, sub) {
  const r = 26, c = 2 * Math.PI * r, off = c * (1 - Math.max(0, Math.min(100, pct)) / 100);
  return `<div class="ring">
    <svg viewBox="0 0 64 64">
      <circle cx="32" cy="32" r="${r}" stroke="rgba(255,255,255,.1)" stroke-width="6" fill="none"/>
      <circle cx="32" cy="32" r="${r}" stroke="${color}" stroke-width="6" fill="none" stroke-linecap="round"
        stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}" transform="rotate(-90 32 32)"/>
    </svg>
    <div class="ring-c"><b>${label}</b>${sub ? '<small>' + sub + '</small>' : ''}</div>
  </div>`;
}

/* ---------- live simulation ---------- */
function tick() {
  const sn = S.sensors;
  sn.temp = clamp(sn.temp + rnd(-0.4, 0.4), 28, 42);
  sn.humidity = clamp(sn.humidity + rnd(-1.2, 1.2), 25, 70);
  sn.nutrients = clamp(sn.nutrients + rnd(-0.3, 0.2), 55, 95);

  let draining = false;
  S.zones.forEach(z => {
    const meta = zoneMeta(z.id);
    if (z.watering) {
      z.moisture = clamp(z.moisture + rnd(1.5, 3), 0, 100);
      z.usedToday += rnd(2, 5); draining = true;
      if (z.moisture >= 88) { z.watering = false; z.lastWateredAt = Date.now(); }
    } else {
      z.moisture = clamp(z.moisture - rnd(0.2, 0.7), 0, 100);
      if (z.mode === 'auto' && z.moisture < meta.moistureMin) z.watering = true;
    }
  });
  if (draining) { S.sensors.tank = clamp(S.sensors.tank - rnd(0.1, 0.3), 20, 100); S.metrics.waterSavedToday += rnd(1, 4); }
  else S.sensors.tank = clamp(S.sensors.tank + rnd(0, 0.15), 0, 100);

  saveState();
  if (DYNAMIC_ROUTES.includes(S.route) && S.user && !sheet) render();
}
function rnd(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

/* ---------- top-level render ---------- */
function render() {
  const app = document.getElementById('app');
  if (!S.user) { app.innerHTML = renderAuth(); document.documentElement.dir = langDir(); return; }
  app.innerHTML =
    renderHeader() +
    '<main class="screen" id="screen">' + renderScreen() + '</main>' +
    renderNav() +
    (sheet ? renderSheet() : '');
}

function renderScreen() {
  switch (S.route) {
    case 'home': return renderHome();
    case 'irrigation': return renderIrrigation();
    case 'alerts': return renderAlerts();
    case 'analytics': return renderAnalytics();
    case 'more': return renderMore();
    case 'plans': return renderPlans();
    case 'market': return renderMarket();
    case 'about': return renderAbout();
    default: return renderHome();
  }
}

/* ---------- auth ---------- */
let authMode = 'login';
function renderAuth() {
  const roles = [['manager', 'auth.role.manager'], ['expert', 'auth.role.expert']];
  return `<div class="auth">
    <div class="auth-hero">
      ${falajLogo('#fff')}
      <p class="auth-tagline">${t('tagline')}</p>
      <div class="auth-facts">
        ${FACTS.map(f => `<div><b>${f.value}</b><span>${t(f.key)}</span></div>`).join('')}
      </div>
    </div>
    <div class="auth-card">
      <button class="lang-chip" data-action="openlang">${icon('globe')}<span>${LANGS.find(l => l.code === CURRENT_LANG).native}</span></button>
      <h2>${authMode === 'login' ? t('auth.login') : t('auth.signup')}</h2>
      <div class="fields">
        ${authMode === 'signup' ? field('name', 'auth.name', 'text') : ''}
        ${field('email', 'auth.email', 'email')}
        ${field('password', 'auth.password', 'password')}
        ${authMode === 'signup' ? field('farm', 'auth.farm', 'text') : ''}
        ${authMode === 'signup' ? `<label class="lbl">${t('auth.role')}</label>
          <div class="role-pick">
            ${roles.map((r, i) => `<button class="role-btn ${i === 0 ? 'sel' : ''}" data-action="role" data-role="${r[0]}">${icon(r[0] === 'manager' ? 'user' : 'leaf')}<span>${t(r[1])}</span></button>`).join('')}
          </div>` : ''}
      </div>
      <button class="btn-primary" data-action="${authMode}">${t('auth.continue')}</button>
      ${authMode === 'login' ? `<button class="link" data-action="toggleauth">${t('auth.noAccount')}</button>`
                             : `<button class="link" data-action="toggleauth">${t('auth.haveAccount')}</button>`}
      <button class="link dim" data-action="demo">${t('auth.demo')}</button>
    </div>
  </div>`;
}
function field(id, key, type) {
  return `<div class="field"><label for="f_${id}">${t(key)}</label>
    <input id="f_${id}" type="${type}" autocomplete="off" placeholder="${t(key)}"></div>`;
}
let selectedRole = 'manager';

/* ---------- header & nav ---------- */
function renderHeader() {
  return `<header class="topbar">
    <div class="brand-row">${falajLogo('#2f4cff')}</div>
    <div class="top-actions">
      <button class="icon-btn" data-action="openlang" aria-label="language">${icon('globe')}</button>
      <button class="icon-btn rel" data-action="go" data-route="alerts" aria-label="alerts">
        ${icon('bell')}${unreadCount() ? `<span class="badge">${unreadCount()}</span>` : ''}</button>
      <button class="avatar" data-action="go" data-route="more">${(S.user.name || 'F').trim().charAt(0).toUpperCase()}</button>
    </div>
  </header>`;
}
function renderNav() {
  const items = [['home', 'home', 'nav.home'], ['irrigation', 'leaf', 'nav.irrigation'],
    ['alerts', 'bell', 'nav.alerts'], ['analytics', 'chart', 'nav.analytics'], ['more', 'grid', 'nav.more']];
  return `<nav class="tabbar">${items.map(([r, ic, k]) =>
    `<button class="tab ${S.route === r ? 'on' : ''}" data-action="go" data-route="${r}">
      <span class="rel">${icon(ic)}${r === 'alerts' && unreadCount() ? `<span class="badge">${unreadCount()}</span>` : ''}</span>
      <small>${t(k)}</small></button>`).join('')}</nav>`;
}

/* ---------- home / dashboard ---------- */
function renderHome() {
  const hour = new Date().getHours();
  const m = S.metrics;
  const active = S.zones.filter(z => z.watering).length;
  const cards = [
    ['drop', 'dash.waterSaved', fmt(m.waterSavedToday) + ' ' + t('dash.liters'), t('dash.today'), 'cyan'],
    ['cash', 'dash.moneySaved', 'AED ' + fmt(m.moneySaved), t('dash.thisMonth'), 'green'],
    ['trend', 'dash.productivity', '+' + m.productivity + '%', t('dash.thisMonth'), 'violet'],
    ['leaf', 'dash.activeZones', active + '/' + S.zones.length, t('irr.watering'), 'blue'],
  ];
  return `
  <div class="greet">
    <p class="hello">${t('dash.greeting')}, ${S.user.name || 'FALAJ'} <span class="wave">🌱</span></p>
    <p class="sub">${t('dash.farmStatus')}</p>
  </div>
  <div class="device-pill">${icon('sun')}<span>${t('dash.deviceOnline')} · ${t('dash.solar')}</span><i class="dot live"></i></div>

  <div class="metric-grid">
    ${cards.map(([ic, k, v, s, tone]) => `<div class="metric ${tone}">
      <div class="m-ico">${icon(ic)}</div><b>${v}</b><span>${t(k)}</span><small>${s}</small></div>`).join('')}
  </div>

  <h3 class="sect">${t('dash.liveSensors')}</h3>
  <div class="sensor-grid">
    <div class="sensor">${ring(avgMoisture(), '#06b6d4', Math.round(avgMoisture()) + '%')}<span>${t('dash.soilMoisture')}</span></div>
    <div class="sensor">${ring(S.sensors.tank, '#2f4cff', Math.round(S.sensors.tank) + '%')}<span>${t('dash.waterLevel')}</span></div>
    <div class="sensor mini">${icon('temp', 'c-amber')}<b>${S.sensors.temp.toFixed(0)}°C</b><span>${t('dash.temp')}</span></div>
    <div class="sensor mini">${icon('humid', 'c-cyan')}<b>${S.sensors.humidity.toFixed(0)}%</b><span>${t('dash.humidity')}</span></div>
    <div class="sensor mini">${icon('flask', 'c-green')}<b>${S.sensors.nutrients.toFixed(0)}%</b><span>${t('dash.nutrients')}</span></div>
  </div>

  <div class="tip-card">${icon('spark')}<div><b>${t('dash.recommendation')}</b><p>${t('dash.recText')}</p></div></div>`;
}
function avgMoisture() { return S.zones.reduce((s, z) => s + z.moisture, 0) / S.zones.length; }

/* ---------- irrigation ---------- */
function renderIrrigation() {
  return `<div class="page-head"><h2>${t('irr.title')}</h2><p>${t('irr.subtitle')}</p></div>
  ${S.zones.map(z => {
    const meta = zoneMeta(z.id);
    const low = z.moisture < meta.moistureMin;
    return `<div class="zone ${z.watering ? 'active' : ''}">
      <div class="zone-top">
        <div class="zone-id">${z.id}</div>
        <div class="zone-name"><b>${t(meta.cropKey)}</b><small>${t('irr.area')}: ${meta.area} ${dirUnit('ha')} · ${t('irr.lastWatered')}: ${relTime(z.lastWateredAt)}</small></div>
        <div class="mode-toggle">
          <button class="${z.mode === 'auto' ? 'on' : ''}" data-action="zone-mode" data-zone="${z.id}" data-mode="auto">${t('irr.auto')}</button>
          <button class="${z.mode === 'manual' ? 'on' : ''}" data-action="zone-mode" data-zone="${z.id}" data-mode="manual">${t('irr.manual')}</button>
        </div>
      </div>
      <div class="zone-bar"><div class="zone-fill ${low ? 'low' : ''}" style="width:${z.moisture.toFixed(0)}%"></div>
        <i class="thresh" style="${threshSide()}:${meta.moistureMin}%"></i></div>
      <div class="zone-meta">
        <span>${t('irr.moisture')}: <b class="${low ? 'c-red' : ''}">${z.moisture.toFixed(0)}%</b></span>
        <span>${t('irr.usedToday')}: <b>${fmt(z.usedToday)} ${t('dash.liters')}</b></span>
        <span class="status ${z.watering ? 'on' : ''}">${z.watering ? t('irr.watering') : t('irr.idle')}</span>
      </div>
      <button class="btn-water ${z.watering ? 'stop' : ''}" data-action="zone-water" data-zone="${z.id}" ${z.mode === 'auto' ? 'disabled' : ''}>
        ${icon('drop')}${z.watering ? t('irr.closeValve') : t('irr.openValve')}</button>
    </div>`;
  }).join('')}
  <div class="tip-card sm">${icon('info')}<p>${t('irr.smartTip')}</p></div>`;
}
function dirUnit(u) { return u; }
function threshSide() { return langDir() === 'rtl' ? 'right' : 'left'; }

/* ---------- alerts ---------- */
function renderAlerts() {
  const list = S.alerts.slice().sort((a, b) => b.ts - a.ts);
  return `<div class="page-head"><h2>${t('alerts.title')}</h2><p>${t('alerts.subtitle')}</p></div>
  ${unreadCount() ? `<button class="link mark" data-action="markread">${t('alerts.markAll')}</button>` : ''}
  ${list.length ? list.map(a => {
    const tpl = ALERT_TEMPLATES.find(x => x.type === a.type);
    return `<div class="alert ${a.read ? '' : 'unread'}">
      <div class="a-ico ${tpl.tone}">${icon(tpl.icon)}</div>
      <div class="a-body"><b>${t('alert.' + a.type + '.title')}</b><p>${t('alert.' + a.type + '.body', a.params)}</p>
        <small>${relTime(a.ts)}</small></div>
      ${a.read ? '' : '<i class="dot live"></i>'}
    </div>`;
  }).join('') : `<div class="empty">${icon('check')}<p>${t('alerts.empty')}</p></div>`}`;
}

/* ---------- analytics ---------- */
function renderAnalytics() {
  const days = ['days.sun', 'days.mon', 'days.tue', 'days.wed', 'days.thu', 'days.fri', 'days.sat'];
  const max = Math.max(...S.water7);
  const bars = S.water7.map((v, i) => `<div class="bar-col"><div class="bar" style="height:${(v / max * 100).toFixed(0)}%"></div><small>${t(days[i])}</small></div>`).join('');
  const compare = [['analytics.waterCut', 42, '#06b6d4'], ['analytics.costCut', 31, '#16a34a'], ['analytics.yieldUp', 23, '#a855ff']];
  return `<div class="page-head"><h2>${t('analytics.title')}</h2><p>${t('analytics.subtitle')}</p></div>
  <div class="card"><h3 class="sect tight">${t('analytics.waterUsage')}</h3>
    <div class="bars">${bars}</div></div>
  <div class="card"><h3 class="sect tight">${t('analytics.vsTraditional')}</h3>
    ${compare.map(([k, v, c]) => `<div class="cmp"><span>${t(k)}</span>
      <div class="cmp-bar"><div style="width:${v}%;background:${c}"></div></div><b>−${v}%</b></div>`).join('')}
  </div>
  <div class="metric-grid two">
    <div class="metric green"><div class="m-ico">${icon('cash')}</div><b>AED 1,200</b><span>${t('analytics.sales')}</span></div>
    <div class="metric cyan"><div class="m-ico">${icon('drop')}</div><b>${fmt(S.metrics.waterSavedMonth)} ${t('dash.liters')}</b><span>${t('dash.waterSaved')} · ${t('dash.thisMonth')}</span></div>
  </div>`;
}

/* ---------- more ---------- */
function renderMore() {
  const rows = [
    ['plans', 'cash', 'more.plans'], ['market', 'store', 'more.market'],
    ['about', 'info', 'more.about'],
  ];
  const role = S.user.role === 'manager' ? 'auth.role.manager' : 'auth.role.expert';
  return `<div class="page-head"><h2>${t('more.title')}</h2></div>
  <div class="profile-card">
    <div class="avatar big">${(S.user.name || 'F').charAt(0).toUpperCase()}</div>
    <div><b>${S.user.name || 'FALAJ'}</b><span>${S.user.farm || ''}</span>
      <small class="role-tag">${t(role)}</small></div>
  </div>
  <div class="list">
    ${rows.map(([r, ic, k]) => `<button class="row" data-action="go" data-route="${r}">${icon(ic)}<span>${t(k)}</span>${icon('chevron', 'chev')}</button>`).join('')}
    <button class="row" data-action="openlang">${icon('globe')}<span>${t('more.language')}</span><em>${LANGS.find(l => l.code === CURRENT_LANG).native}</em>${icon('chevron', 'chev')}</button>
    <button class="row danger" data-action="logout">${icon('logout')}<span>${t('more.logout')}</span></button>
  </div>`;
}

/* ---------- plans ---------- */
function renderPlans() {
  return `${backHead('plans.title', 'plans.subtitle')}
  <div class="plans">${PLANS.map(p => {
    const cur = S.plan === p.id;
    return `<div class="plan ${cur ? 'current' : ''} ${p.popular ? 'pop' : ''}" style="--accent:${p.accent}">
      ${p.popular ? `<span class="pop-tag">★</span>` : ''}
      <h3>${t(p.nameKey)}</h3>
      <div class="price">${p.price != null ? '<b>AED ' + p.price + '</b><small>' + t('plans.month') + '</small>' : '<b>' + t('plans.customQuote') + '</b>'}</div>
      <ul>${(p.features[CURRENT_LANG] || p.features.en).map(f => `<li>${icon('check')}<span>${f}</span></li>`).join('')}</ul>
      <button class="btn-plan ${cur ? 'is-cur' : ''}" data-action="plan" data-plan="${p.id}">
        ${cur ? t('plans.current') : (p.price != null ? t('plans.select') : t('plans.contact'))}</button>
    </div>`;
  }).join('')}</div>`;
}

/* ---------- market ---------- */
function renderMarket() {
  return `${backHead('market.title', 'market.subtitle')}
  <div class="soon-card">${icon('store')}<b>${t('market.soon')}</b><p>${t('market.soonText')}</p></div>
  <div class="list">${MARKET.map(m => `<div class="row static">
    ${icon('leaf')}<span>${t(m.cropKey)}</span>
    <div class="price-tag"><b>AED ${m.price.toFixed(1)}</b><small>${t('market.unit')}</small></div>
    <em class="${m.trend >= 0 ? 'up' : 'down'}">${m.trend >= 0 ? '+' : ''}${m.trend}%</em></div>`).join('')}</div>`;
}

/* ---------- about ---------- */
function renderAbout() {
  return `${backHead('about.title')}
  <div class="about-logo">${falajLogo('#2f4cff')}</div>
  <p class="about-body">${t('about.body')}</p>
  <p class="about-mission">${t('mission')}</p>
  <div class="facts-grid">${FACTS.map(f => `<div class="fact"><b>${f.value}</b><span>${t(f.key)}</span></div>`).join('')}</div>`;
}

function backHead(titleKey, subKey) {
  return `<div class="page-head withback">
    <button class="icon-btn" data-action="go" data-route="more">${icon('chevron', 'flip')}</button>
    <div><h2>${t(titleKey)}</h2>${subKey ? `<p>${t(subKey)}</p>` : ''}</div></div>`;
}

/* ---------- bottom sheet (language) ---------- */
function renderSheet() {
  if (sheet !== 'lang') return '';
  return `<div class="sheet-mask" data-action="closesheet"></div>
  <div class="sheet">
    <div class="sheet-grip"></div>
    <h3>${t('auth.langPick')}</h3>
    ${LANGS.map(l => `<button class="lang-row ${l.code === CURRENT_LANG ? 'sel' : ''}" data-action="setlang" data-lang="${l.code}">
      <span>${l.native}</span><small>${l.name}</small>${l.code === CURRENT_LANG ? icon('check', 'c-green') : ''}</button>`).join('')}
  </div>`;
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;

  switch (a) {
    case 'go': S.route = el.dataset.route; sheet = null; saveState(); render(); break;
    case 'toggleauth': authMode = authMode === 'login' ? 'signup' : 'login'; render(); break;
    case 'role':
      selectedRole = el.dataset.role;
      document.querySelectorAll('.role-btn').forEach(b => b.classList.toggle('sel', b.dataset.role === selectedRole));
      break;
    case 'login': case 'signup': doAuth(a); break;
    case 'demo': demoLogin(); break;
    case 'openlang': sheet = 'lang'; render(); break;
    case 'closesheet': sheet = null; render(); break;
    case 'setlang': setLang(el.dataset.lang); sheet = null; render(); break;
    case 'zone-mode': setZoneMode(el.dataset.zone, el.dataset.mode); break;
    case 'zone-water': toggleWater(el.dataset.zone); break;
    case 'plan': S.plan = el.dataset.plan; saveState(); render(); break;
    case 'markread': S.alerts.forEach(x => x.read = true); saveState(); render(); break;
    case 'logout': logout(); break;
  }
});

function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function doAuth(mode) {
  const email = val('f_email');
  if (!email) { const e = document.getElementById('f_email'); if (e) { e.focus(); e.classList.add('err'); } return; }
  S.user = {
    name: mode === 'signup' ? (val('f_name') || email.split('@')[0]) : (S.user && S.user.name) || email.split('@')[0],
    email, farm: val('f_farm') || 'Al Falaj Farm', role: mode === 'signup' ? selectedRole : 'manager',
  };
  S.route = 'home'; saveState(); render();
}
function demoLogin() {
  S.user = { name: 'Rashid', email: 'demo@falajae.com', farm: 'Liwa Oasis Farm', role: 'manager' };
  S.route = 'home'; saveState(); render();
}
function logout() { S.user = null; S.route = 'home'; saveState(); render(); }

function setZoneMode(id, mode) {
  const z = S.zones.find(x => x.id === id); if (!z) return;
  z.mode = mode; if (mode === 'auto') { /* auto decides */ } else if (z.watering) {/* keep */}
  saveState(); render();
}
function toggleWater(id) {
  const z = S.zones.find(x => x.id === id); if (!z || z.mode === 'auto') return;
  z.watering = !z.watering; if (!z.watering) z.lastWateredAt = Date.now();
  saveState(); render();
}

/* ---------- boot ---------- */
loadState();
setLang(CURRENT_LANG);
render();
setInterval(tick, 3000);
