/* ===== FALAJ — app logic (onboarding, auth, farm wizard, dashboard) ===== */

const STORE_KEY = 'falaj_state_v2';

let S = null;
// transient UI state
let obIndex = 0;
let authScreen = 'login';          // login | signup | forgotEmail | otp | reset
let wizardStep = 1;                // 1 | 'field' | 2
let wizardData = {};
let sheet = null;                  // lang | country | state | city | sensor | null
let sensorId = null;               // selected sensor/zone for the live sheet

/* ---------- state ---------- */
function defaultState() {
  return {
    onboarded: false,
    user: null,
    farm: null,
    route: 'home',
    currentFieldId: null,
    fields: FIELDS.map(f => Object.assign({}, f, { exp: Object.assign({}, f.exp), bars: f.bars.slice() })),
    notifications: NOTIFICATIONS.map(n => Object.assign({}, n)),
    notifEmpty: false,
    monZones: MON_ZONES.map(z => Object.assign({}, z)),
    mktFilter: 'all',
    currentThreadId: null,
    threadMsgs: {},
  };
}
function loadState() {
  try { const r = localStorage.getItem(STORE_KEY); S = r ? Object.assign(defaultState(), JSON.parse(r)) : defaultState(); }
  catch (e) { S = defaultState(); }
}
let _pushTimer = null;
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) {}
  if (BK.enabled && BK.user) { clearTimeout(_pushTimer); _pushTimer = setTimeout(() => BK.push(S), 800); }
}
function fieldById(id) { return S.fields.find(f => f.id === id); }
function unread() { return S.notifications.filter(n => n.unread && !S.notifEmpty).length; }

/* ---------- helpers ---------- */
function aed(n) { return 'AED ' + Number(n).toLocaleString('en-US'); }
function greetKey() { const h = new Date().getHours(); return h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening'; }
function flip() { return langDir() === 'rtl' ? 'flip' : ''; }

/* ---------- live farm intelligence ---------- */
const MOIST_MIN = 40;
function zStatus(z) { return z.moisture < MOIST_MIN ? 'alert' : 'ok'; }
function lowZones() { return S.monZones.filter(z => z.moisture < MOIST_MIN); }
function worstZone() { return S.monZones.slice().sort((a, b) => a.moisture - b.moisture)[0]; }
function zoneLabel(z) { return t('mon.zoneN', { n: z.id.replace('Z', '') }); }
function aiRecText() {
  const w = worstZone();
  return w && w.moisture < MOIST_MIN ? t('mon.recDyn', { z: zoneLabel(w), n: Math.round(w.moisture) }) : t('mon.allHealthy');
}
function farmSummary() {
  const lows = lowZones();
  if (!lows.length) return t('ans.statusGood');
  const w = worstZone();
  return t('ans.statusBad', { c: lows.length, z: zoneLabel(w), n: Math.round(w.moisture) });
}

function fieldThumb(f, cls) {
  return `<div class="thumb ${cls || ''}" style="--hue:${f.hue}">
    <svg viewBox="0 0 100 70" preserveAspectRatio="none">
      <polygon points="18,42 44,18 86,32 60,58" fill="rgba(244,208,63,.12)" stroke="#f4d03f" stroke-width="2"/>
      ${[[18, 42], [44, 18], [86, 32], [60, 58]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="2.4" fill="#f4d03f"/>`).join('')}
    </svg></div>`;
}

function illustration(scene) {
  const sun = `<g><path d="M70 70a30 30 0 0 1 60 0" fill="none" stroke="#e23b32" stroke-width="6" stroke-linecap="round"/>
    <path d="M80 70a20 20 0 0 1 40 0" fill="none" stroke="#f0962a" stroke-width="6" stroke-linecap="round"/>
    <path d="M90 70a10 10 0 0 1 20 0" fill="none" stroke="#f4c531" stroke-width="6" stroke-linecap="round"/></g>`;
  if (scene === 'plant') return `<svg viewBox="0 0 200 150">${sun}
    <ellipse cx="100" cy="120" rx="78" ry="16" fill="#6b4a2b"/>
    <path d="M100 120c0-22 0-34 0-34" stroke="#2f8f4e" stroke-width="5" stroke-linecap="round"/>
    <path d="M100 96c-14-2-20-12-20-20 12 0 18 8 20 16M100 100c12-2 18-10 18-18-10 0-16 6-18 12" fill="#3aa55f"/></svg>`;
  if (scene === 'harvest') return `<svg viewBox="0 0 200 150">${sun}
    <ellipse cx="100" cy="124" rx="84" ry="14" fill="#caa84e"/>
    ${[60, 84, 108, 132].map((x, i) => `<g transform="translate(${x} 0)"><path d="M0 124V70" stroke="#caa84e" stroke-width="4"/>
      <path d="M0 78c-7-3-11-9-11-16 8 0 12 5 13 11M0 86c7-3 11-9 11-16-8 0-12 5-13 11M0 70c-7-3-11-9-11-16 8 0 12 5 13 11" fill="#e3b94e"/></g>`).join('')}</svg>`;
  return `<svg viewBox="0 0 200 150">${sun}
    <ellipse cx="100" cy="128" rx="84" ry="12" fill="#6b4a2b"/>
    <path d="M58 120l8-26h46l8 26z" fill="#3aa55f"/><path d="M60 110h60" stroke="#2f8f4e" stroke-width="3"/>
    <circle cx="78" cy="104" r="6" fill="#e23b32"/><circle cx="94" cy="104" r="6" fill="#f0962a"/><circle cx="110" cy="104" r="6" fill="#f4c531"/>
    <circle cx="128" cy="124" r="10" fill="none" stroke="#173d2e" stroke-width="3"/></svg>`;
}

function barChart(bars) {
  const max = 50, grid = [50, 40, 30, 20, 10, 0];
  const labels = [10, 11, 12, 13, 14, 15, 16];
  return `<div class="chart">
    <div class="y-axis">${grid.map(g => `<span>${g}%</span>`).join('')}</div>
    <div class="plot">
      <div class="bars">${bars.map((v, i) => `<div class="bar ${i % 2 ? 'lite' : ''}" style="height:${(v / max * 100).toFixed(0)}%"></div>`).join('')}</div>
      <div class="x-axis"><b>${t('days')}</b>${labels.map(l => `<span>${l}</span>`).join('')}</div>
    </div>
  </div>`;
}

function donut(exp) {
  const r = 46, c = 2 * Math.PI * r; let acc = 0;
  const arcs = EXPENSE_KEYS.map(({ k, c: col }) => {
    const v = exp[k.split('.')[1]]; const len = c * v / 100; const dash = `${len.toFixed(1)} ${(c - len).toFixed(1)}`;
    const seg = `<circle cx="60" cy="60" r="${r}" fill="none" stroke="${col}" stroke-width="20" stroke-dasharray="${dash}" stroke-dashoffset="${(-acc).toFixed(1)}" transform="rotate(-90 60 60)"/>`;
    acc += len; return seg;
  }).join('');
  return `<svg class="donut" viewBox="0 0 120 120">${arcs}</svg>`;
}

/* ---------- root render ---------- */
function render() {
  const app = document.getElementById('app');
  document.documentElement.dir = langDir();
  if (!S.onboarded) { app.innerHTML = renderOnboarding(); return; }
  if (!S.user) { app.innerHTML = renderAuth(); return; }
  if (!S.farm) { app.innerHTML = renderWizard(); return; }
  app.innerHTML = renderApp() + (sheet ? renderSheet() : '');
}

/* ---------- onboarding ---------- */
function renderOnboarding() {
  const s = ONBOARDING[obIndex];
  const lang = LANGS.find(l => l.code === CURRENT_LANG);
  const last = obIndex === ONBOARDING.length - 1;
  return `<div class="onboard">
    <div class="ob-top">
      <button class="lang-drop" data-action="openlang"><span class="flag">${lang.flag}</span>${lang.native}${icon('chevron', 'mini ' + (langDir() === 'rtl' ? '' : 'down'))}</button>
      <button class="ob-skip" data-action="ob-skip">${t('common.skip')}</button>
    </div>
    <div class="ob-illus">${illustration(s.scene)}</div>
    <div class="ob-card">
      <h2>${t(s.titleKey)}</h2>
      <p>${t(s.bodyKey)}</p>
      ${last ? `<button class="btn-green wide" data-action="ob-done">${t('common.getStarted')}</button>`
             : `<div class="ob-foot">
                  <div class="dots">${ONBOARDING.map((_, i) => `<i class="${i === obIndex ? 'on' : ''}"></i>`).join('')}</div>
                  <button class="ob-next" data-action="ob-next">${icon('chevron', flip())}</button>
                </div>`}
    </div>
  </div>`;
}

/* ---------- auth ---------- */
function renderAuth() {
  const back = `<button class="auth-back" data-action="auth-back">${icon('back', flip())}</button>`;
  const logo = `<div class="auth-logo">${falajLogo('color', 34)}</div>`;
  const hero = `<div class="auth-hero"><img src="assets/farm-hero.png" alt=""><div class="auth-hero-ov"></div><div class="auth-hero-logo">${falajLogo('white', 30)}</div></div>`;
  const langChip = `<button class="auth-lang" data-action="openlang">${LANGS.find(l => l.code === CURRENT_LANG).flag}</button>`;

  if (authScreen === 'login') return `<div class="auth has-hero">${langChip}${hero}
    <div class="fields">
      ${input('login_id', 'auth.username', 'user')}
      ${passInput('login_pw', 'auth.password')}
      <button class="link end" data-action="go-forgot">${t('auth.forgot')}</button>
    </div>
    <button class="btn-green" data-action="do-login">${t('auth.login')}</button>
    ${socialRow('auth.orLogin')}
    <p class="auth-foot">${t('auth.noAccount')} <button class="link inline" data-action="to-signup">${t('auth.signup')}</button></p>
  </div>`;

  if (authScreen === 'signup') return `<div class="auth has-hero">${langChip}${hero}
    <div class="fields">
      ${input('su_name', 'auth.name', 'user')}
      ${input('su_email', 'auth.email', 'mail')}
      ${passInput('su_pw', 'auth.password', true)}
      <div class="pw-rules" id="pwRules">
        ${rule('min')}${rule('case')}${rule('special')}
      </div>
    </div>
    <button class="btn-green" data-action="do-signup">${t('auth.signup')}</button>
    ${socialRow('auth.orSignup')}
    <p class="auth-foot">${t('auth.haveAccount')} <button class="link inline" data-action="to-login">${t('auth.login')}</button></p>
  </div>`;

  if (authScreen === 'forgotEmail') return `<div class="auth">${back}${logo}
    <div class="fields">${input('fp_email', 'auth.enterEmail', 'mail')}</div>
    <div class="grow"></div>
    <button class="btn-green" data-action="send-code">${t('auth.sendCode')}</button>
  </div>`;

  if (authScreen === 'otp') return `<div class="auth">${back}${logo}
    <p class="otp-hint">${t('auth.otpHint')}</p>
    <div class="otp">${[0, 1, 2, 3].map(i => `<input class="otp-box" id="otp${i}" inputmode="numeric" maxlength="1" data-i="${i}">`).join('')}</div>
    <div class="grow"></div>
    <button class="btn-green" data-action="verify-otp">${t('auth.verify')}</button>
  </div>`;

  // reset
  return `<div class="auth">${back}${logo}
    <div class="fields">
      ${passInput('rs_pw', 'auth.newPass')}
      ${passInput('rs_pw2', 'auth.confirm')}
      <p class="err-msg hidden" id="rsErr">${t('auth.mismatch')}</p>
    </div>
    <div class="grow"></div>
    <button class="btn-green" data-action="save-pass">${t('auth.savePass')}</button>
  </div>`;
}
function input(id, key, ic) {
  const i = ic === 'mail' ? '✉' : ic === 'user' ? '' : '';
  return `<div class="field"><span class="fi">${ic === 'mail' ? icon('info', 'hide') : ''}</span>
    <input id="${id}" type="${ic === 'mail' ? 'email' : 'text'}" placeholder="${t(key)}"></div>`;
}
function passInput(id, key, rules) {
  return `<div class="field pw"><input id="${id}" type="password" placeholder="${t(key)}" ${rules ? 'data-rules="1"' : ''}>
    <button class="eye" data-action="togglepw" data-target="${id}">${icon('eye')}</button></div>`;
}
function rule(kind) { return `<span class="rule" id="rule_${kind}">${icon('info', 'rule-i')}<small>${t('pass.' + kind)}</small></span>`; }
function socialRow(key) {
  return `<div class="or"><span>${t(key)}</span></div>
    <div class="socials">
      <button class="soc">${social('apple')}</button>
      <button class="soc">${social('google')}</button>
      <button class="soc">${social('facebook')}</button>
    </div>`;
}

/* ---------- farm wizard ---------- */
function renderWizard() {
  const head = `<div class="wiz-head">${falajLogo('white', 22)}<button class="wiz-skip" data-action="wiz-skip">${t('common.skip')}</button></div>`;

  if (wizardStep === 'field') return `<div class="wiz field-select">
    <div class="fs-head"><button class="icon-btn light" data-action="wiz-to1">${icon('back', flip())}</button>
      <b>${t('farm.selectField')}</b><button class="link light" data-action="wiz-clearfield">${t('common.clear')}</button></div>
    <div class="map"><div class="map-grid"></div>
      <svg class="map-poly" viewBox="0 0 300 360" preserveAspectRatio="none">
        <polygon points="70,150 150,90 235,160 165,250" fill="rgba(244,208,63,.15)" stroke="#f4d03f" stroke-width="3"/>
        ${[[70, 150], [150, 90], [235, 160], [165, 250]].map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="5" fill="#f4d03f"/>`).join('')}
      </svg>
      <button class="map-save btn-yellow" data-action="wiz-savefield">${t('farm.saveField')}</button>
    </div>
  </div>`;

  const step2 = wizardStep === 2;
  return `<div class="wiz">${head}
    <div class="wiz-body">
      <div class="wiz-titlerow"><h2>${t('farm.add')}</h2><span class="step">${step2 ? '2/2' : '1/2'}</span></div>
      <p class="wiz-intro">${t('farm.intro')}</p>
      ${step2 ? wizardStep2() : wizardStep1()}
    </div>
    <div class="wiz-actions">
      <button class="btn-ghost" data-action="wiz-clear">${t('common.clear')}</button>
      <button class="btn-green flex" data-action="${step2 ? 'wiz-finish' : 'wiz-next'}">${t('common.save')}</button>
    </div>
  </div>`;
}
function wizardStep1() {
  return `${wlabel('farm.name')}${winput('w_name', 'farm.enter', wizardData.name)}
    <h3 class="wiz-sub">${t('farm.location')}</h3>
    ${wlabel('farm.country')}${wselect('country', wizardData.country, 'farm.country')}
    ${wlabel('farm.state')}${wselect('state', wizardData.state, 'farm.state')}
    ${wlabel('farm.city')}${wselect('city', wizardData.city, 'farm.city')}
    ${wlabel('farm.pincode')}${winput('w_pin', 'farm.pincode', wizardData.pincode)}
    ${wlabel('farm.field')}
    <button class="field-pick ${wizardData.field ? 'done' : ''}" data-action="wiz-field">
      ${wizardData.field ? icon('check', 'c-green') : ''}<span>${wizardData.field ? t('farm.selectField') + ' ✓' : t('farm.clickField')}</span></button>`;
}
function wizardStep2() {
  const f = [['farm.waterUse', 'w_wu'], ['farm.waterCost', 'w_wc'], ['farm.monthRev', 'w_mr'], ['farm.annualRev', 'w_ar'],
    ['farm.monthExp', 'w_me'], ['farm.annualExp', 'w_ae'], ['farm.otherExp', 'w_oe'], ['farm.cropsType', 'w_ct'], ['farm.desc', 'w_d']];
  return f.map(([k, id]) => `${wlabel(k)}${winput(id, 'farm.enter', wizardData[id])}`).join('');
}
function wlabel(k) { return `<label class="wiz-lbl">${t(k)}</label>`; }
function winput(id, ph, val) { return `<input class="wiz-input" id="${id}" placeholder="${t(ph)}" value="${val ? String(val).replace(/"/g, '&quot;') : ''}">`; }
function wselect(kind, val, ph) {
  return `<button class="wiz-select ${val ? 'has' : ''}" data-action="opensel" data-kind="${kind}">
    <span>${val || t(ph)}</span>${icon('chevron', 'down')}</button>`;
}

/* ---------- main app shell ---------- */
function renderApp() {
  let body;
  switch (S.route) {
    case 'home': body = screenHome(); break;
    case 'fields': body = screenFields(); break;
    case 'fieldDetail': body = screenFieldDetail(); break;
    case 'support': body = screenSupport(); break;
    case 'settings': body = screenSettings(); break;
    case 'notifications': body = screenNotifications(); break;
    case 'zones': body = screenZones(); break;
    case 'marketplace': body = screenMarketplace(); break;
    case 'rewards': body = screenRewards(); break;
    case 'devices': body = screenDevices(); break;
    case 'log': body = screenLog(); break;
    case 'messages': body = screenMessages(); break;
    case 'thread': body = screenThread(); break;
    case 'contracts': body = screenContracts(); break;
    default: body = screenHome();
  }
  const showNav = S.route !== 'fieldDetail' && S.route !== 'notifications';
  return `<div class="app">${body}${showNav ? renderNav() : ''}</div>`;
}
function renderNav() {
  const items = [['home', 'home'], ['fields', 'fields'], ['support', 'support'], ['settings', 'settings']];
  return `<nav class="tabbar">
    <button class="tab ${S.route === 'home' ? 'on' : ''}" data-action="go" data-route="home">${icon('home')}</button>
    <button class="tab ${S.route === 'fields' ? 'on' : ''}" data-action="go" data-route="fields">${icon('fields')}</button>
    <button class="fab" data-action="add-field">${icon('plus')}</button>
    <button class="tab ${S.route === 'support' ? 'on' : ''}" data-action="go" data-route="support">${icon('spark')}</button>
    <button class="tab ${S.route === 'settings' ? 'on' : ''}" data-action="go" data-route="settings">${icon('settings')}</button>
  </nav>`;
}
function bell() {
  return `<button class="bell" data-action="go" data-route="notifications">${icon('bell')}${unread() ? `<span class="badge">${unread()}</span>` : ''}</button>`;
}

/* ---------- home ---------- */
function screenHome() {
  return `<header class="ghead home">
    <div class="ghead-row"><div><small>${t(greetKey())}</small><b>${S.user.name}</b></div>${bell()}</div>
  </header>
  <div class="scroll">
    <div class="weather card">
      <div class="w-left"><b>${WEATHER.location.split(',')[0]}</b><span>${WEATHER.location.split(',')[1] || ''}</span>
        <div class="w-temp">${icon('cloudsun', 'big')}<em>${WEATHER.tempC}<sup>°C</sup></em></div><span class="w-cond">${t(WEATHER.condKey)}</span></div>
      <div class="w-right"><small>${t('home.today')}, ${WEATHER.date}</small>
        <span>${t('home.wind')} ${WEATHER.wind}km/h</span><span>${t('home.rain')} ${WEATHER.rain}%</span>
        <svg class="w-line" viewBox="0 0 90 30"><path d="M2 22 Q20 6 38 16 T86 8" fill="none" stroke="#5171ff" stroke-width="2.5" stroke-linecap="round"/></svg></div>
    </div>

    <button class="monitor-card card" data-action="go" data-route="zones">
      <div class="mc-map">
        ${S.monZones.slice(0, 4).map(z => `<span class="zbadge ${zStatus(z)}" style="inset-inline-start:${z.x}%;top:${z.y}%">${z.id}<i>${zStatus(z) === 'alert' ? '!' : '✓'}</i></span>`).join('')}
        ${lowZones().length ? `<span class="mc-issues">${icon('alert')}${t('mon.needAttn', { n: lowZones().length })}</span>` : ''}
        <div class="mc-grad"></div>
        <div class="mc-ttl">${icon('pin')}<b>${t('mon.title')}</b></div>
      </div>
      <div class="mc-foot"><span class="mc-ai">${icon('spark')}${aiRecText()}</span>${icon('chevron', 'chev ' + flip())}</div>
    </button>
    <div class="tools">
      ${[['marketplace', 'store', 'mkt.title'], ['rewards', 'gift', 'rew.title'], ['devices', 'chip', 'dev.title'], ['log', 'spark', 'log.title'], ['messages', 'chat', 'msg.title'], ['contracts', 'list', 'ct.title']].map(([r, ic, k]) => `<button class="tool card" data-action="go" data-route="${r}"><span class="tool-ic">${icon(ic)}</span><small>${t(k)}</small></button>`).join('')}
    </div>

    <div class="sec-row"><h3>${t('home.market')}</h3><button class="link" data-action="go" data-route="fields">${t('common.viewAll')} ${icon('chevron', 'mini ' + flip())}</button></div>
    <div class="market-row">${MARKET.map(m => `<div class="mkt card">
      <div class="mkt-top"><span class="dot-crop" style="--hue:${m.hue}"></span><b>${t(m.cropKey)}</b></div>
      <span class="mkt-price">AED ${m.price} ${t('field.perKg')}</span><small>${m.region}</small></div>`).join('')}</div>

    <div class="sec-row"><h3>${t('home.myFields')}</h3><button class="link" data-action="go" data-route="fields">${t('common.viewAll')} ${icon('chevron', 'mini ' + flip())}</button></div>
    ${S.fields.slice(0, 2).map(fieldCard).join('')}
  </div>`;
}
function fieldCard(f) {
  return `<button class="field-card card" data-action="open-field" data-id="${f.id}">
    ${fieldThumb(f, 'sm')}
    <div class="fc-body"><b>${f.name}</b>
      <span>${t('field.water')} : <em>${f.water}% ${t('field.normal')}</em></span>
      <span>${t('field.expense')} : ${aed(f.expense)}</span>
      <span>${t('field.revenue')} : ${aed(f.revenue)}</span></div>
  </button>`;
}

/* ---------- fields ---------- */
function screenFields() {
  return `<header class="ghead"><div class="ghead-row"><b>${t('home.myFields')}</b>${bell()}</div></header>
  <div class="scroll">${S.fields.map(fieldCard).join('')}</div>`;
}

/* ---------- field detail ---------- */
function screenFieldDetail() {
  const f = fieldById(S.currentFieldId) || S.fields[0];
  const cells = [
    ['fd.cropHealth', t('fd.' + f.health), '', 'c-green'],
    ['fd.planting', f.planting, '', ''],
    ['fd.revenue', aed(f.revenue), (f.revChange < 0 ? f.revChange : '+' + f.revChange) + '%', f.revChange < 0 ? 'c-red' : 'c-green'],
    ['fd.harvest', t('fd.months', { n: f.harvest }), '', ''],
  ];
  return `<header class="ghead detail"><div class="ghead-row">
    <button class="bell" data-action="go" data-route="fields">${icon('back', flip())}</button><b class="center">${f.name}</b><span class="sp"></span></div></header>
  <div class="scroll detail-scroll">
    <div class="hero-map">${fieldThumb(f, 'hero')}</div>
    <h3 class="d-sec">${t('fd.field')}</h3>
    <div class="info-grid">${cells.map(c => `<div class="info card"><small>${t(c[0])}</small><div class="info-v"><b>${c[1]}</b>${c[2] ? `<em class="${c[3]}">${c[2]}</em>` : ''}</div></div>`).join('')}</div>

    <h3 class="d-sec">${t('fd.waterTitle')}</h3>
    <div class="card chart-card">
      <div class="kpis">
        <div><small>${t('fd.waterUse')}</small><b>${f.consumption}L</b></div>
        <div><small>${t('fd.workTime')}</small><b>${f.workTime}h</b></div>
        <div><small>${t('fd.workedHa')}</small><b>${f.hectares}ha</b></div>
      </div>${barChart(f.bars)}</div>

    <h3 class="d-sec">${t('fd.expTitle')}</h3>
    <div class="card exp-card">
      <div class="exp-top"><small>${t('fd.totalExp')}</small><b>${aed(f.expense)}</b></div>
      <div class="exp-chart">${donut(f.exp)}
        <div class="legend">${EXPENSE_KEYS.map(({ k, c }) => `<span><i style="background:${c}"></i>${t(k)} ${f.exp[k.split('.')[1]]}%</span>`).join('')}</div>
      </div>
    </div>
  </div>`;
}

/* ---------- notifications ---------- */
function screenNotifications() {
  const list = S.notifications;
  return `<header class="ghead detail"><div class="ghead-row">
    <button class="bell" data-action="go" data-route="home">${icon('back', flip())}</button><b class="center">${t('notif.title')}</b><span class="sp"></span></div></header>
  <div class="scroll">
    ${S.notifEmpty || !list.length ? `<div class="empty"><div class="empty-ill">${icon('bell')}<i class="ex">!</i></div>
        <b>${t('notif.empty')}</b><p>${t('notif.emptyHint')}</p></div>`
      : `<button class="link mark" data-action="clear-notif">${t('common.clear')}</button>` + list.map(n => `<div class="notif ${n.unread ? 'unread' : ''}">
        <span class="n-ico">${icon(n.icon)}${n.unread ? '<i class="d"></i>' : ''}</span><p>${t(n.key)}</p></div>`).join('')}
  </div>`;
}

/* ---------- AI support (chat) ---------- */
function screenSupport() {
  const msgs = (S.chat && S.chat.length) ? S.chat : [{ role: 'bot', text: t('ai.welcome') }];
  const fresh = !S.chat || S.chat.length <= 1;
  return `<header class="ghead"><div class="ghead-row">
    <div class="ai-head"><span class="ai-ava">${icon('spark')}</span><div><b>${t('ai.title')}</b><small><i class="d-on"></i>${t('ai.online')}</small></div></div>${bell()}</div></header>
  <div class="scroll chatscroll">
    <div class="chat">${msgs.map(m => `<div class="msg ${m.role}">${m.role === 'bot' ? '<span class="m-ava">' + icon('spark') + '</span>' : ''}<div class="bubble">${m.text}</div></div>`).join('')}</div>
    ${fresh ? `<div class="suggests">${['ai.s1', 'ai.s2', 'ai.s3', 'ai.s4'].map(k => `<button class="chip" data-action="ai-suggest" data-q="${k}">${t(k)}</button>`).join('')}</div>` : ''}
  </div>
  <div class="composer">
    <input id="aiInput" placeholder="${t('ai.placeholder')}" autocomplete="off">
    <button class="ai-send" data-action="ai-send" aria-label="send">${icon('send')}</button>
  </div>`;
}
function aiReply(text) {
  const low = (text || '').toLowerCase();
  for (const it of AI_INTENTS) {
    if (!it.kw.some(k => low.includes(k.toLowerCase()))) continue;
    if (it.key === 'ans.status') return farmSummary();
    let ans = t(it.key);
    if (it.key === 'ans.water') {
      const w = worstZone();
      if (w && w.moisture < MOIST_MIN) ans += ' ' + t('ans.waterLive', { z: zoneLabel(w), n: Math.round(w.moisture) });
    }
    return ans;
  }
  return t('ans.fallback');
}
function aiSend(q) {
  const text = q != null ? q : val('aiInput');
  if (!text) return;
  if (!S.chat || !S.chat.length) S.chat = [{ role: 'bot', text: t('ai.welcome') }];
  S.chat.push({ role: 'user', text });
  S.chat.push({ role: 'bot', text: aiReply(text) });
  save(); render();
  const sc = document.querySelector('.chatscroll'); if (sc) sc.scrollTop = sc.scrollHeight;
}

/* ---------- settings ---------- */
function screenSettings() {
  const lang = LANGS.find(l => l.code === CURRENT_LANG);
  return `<header class="ghead"><div class="ghead-row"><b>${t('set.title')}</b>${bell()}</div></header>
  <div class="scroll">
    <div class="profile card"><div class="pic">${S.user.name.charAt(0).toUpperCase()}</div>
      <div><b>${S.user.name}</b><span>${S.user.email}</span></div></div>
    <div class="list card">
      <button class="row" data-action="openlang"><span class="r-ico blue">${icon('globe')}</span><span>${t('set.language')}</span><em>${lang.flag} ${lang.native}</em>${icon('chevron', 'chev ' + flip())}</button>
      <button class="row" data-action="go" data-route="about"><span class="r-ico green">${icon('info')}</span><span>${t('set.about')}</span>${icon('chevron', 'chev ' + flip())}</button>
      <button class="row danger" data-action="logout"><span class="r-ico red">${icon('logout')}</span><span>${t('set.logout')}</span></button>
    </div>
    <div class="about-box card"><div class="ab-logo">${falajLogo('color', 26)}</div><p>${t('set.aboutBody')}</p></div>
  </div>`;
}

/* ---------- shared back header ---------- */
function gheadBack(titleKey) {
  return `<header class="ghead detail"><div class="ghead-row">
    <button class="bell" data-action="go" data-route="home">${icon('back', flip())}</button>
    <b class="center">${t(titleKey)}</b><span class="sp"></span></div></header>`;
}

/* ---------- zone monitor ---------- */
function screenZones() {
  const alerts = lowZones();
  return `${gheadBack('mon.title')}
  <div class="scroll detail-scroll">
    <div class="zmap">${S.monZones.map(z => `<span class="zbadge ${zStatus(z)}" data-action="open-sensor" data-id="${z.id}" style="inset-inline-start:${z.x}%;top:${z.y}%">${z.id}<i>${zStatus(z) === 'alert' ? '!' : '✓'}</i></span>`).join('')}</div>
    <p class="muted maphint">${icon('pin')}${t('sen.tapHint')}</p>

    <div class="card pad">
      <h3 class="sect tight">${t('mon.issues')}</h3>
      ${alerts.length ? alerts.map(z => `<div class="issue">
        <span class="iss-ic">${icon('alert')}</span>
        <div class="iss-b"><b>${zoneLabel(z)} · ${t('mon.iss.moisture')}</b><small>${Math.round(z.moisture)}% · ${t('mon.ago', { n: 3 })}</small></div>
        <button class="mini-btn" data-action="zone-irrigate" data-id="${z.id}">${icon('drop')}${t('mon.irrigate')}</button>
      </div>`).join('') : `<p class="muted">${t('mon.healthy')} ✓</p>`}
    </div>

    <div class="card pad">
      <div class="airec-row"><h3 class="sect tight">${t('mon.airec')}</h3><button class="link" data-action="ai-why">${t('mon.why')}</button></div>
      <div class="airec-body"><span class="ai-bulb">${icon('spark')}</span><p>${aiRecText()}</p>${icon('chevron', 'chev ' + flip())}</div>
    </div>

    <h3 class="d-sec">${t('mon.zones')}</h3>
    ${S.monZones.map(z => {
      const low = z.moisture < 40;
      return `<div class="zrow card">
        <div class="zrow-id ${zStatus(z)}">${z.id}</div>
        <div class="zrow-b"><b>${t(z.cropKey)}</b><div class="zbar"><div class="zfill ${low ? 'low' : ''}" style="width:${z.moisture}%"></div></div></div>
        <div class="zrow-m"><b class="${low ? 'c-red' : ''}">${z.moisture}%</b><button class="mini-btn ghost" data-action="zone-irrigate" data-id="${z.id}">${t('mon.irrigate')}</button></div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------- marketplace ---------- */
function screenMarketplace() {
  const list = PRODUCTS.filter(p => S.mktFilter === 'all' || p.cat === S.mktFilter);
  return `${gheadBack('mkt.title')}
  <div class="scroll flat">
    <div class="filters">${MKT_FILTERS.map(([c, k]) => `<button class="fchip ${S.mktFilter === c ? 'on' : ''}" data-action="mkt-filter" data-cat="${c}">${t(k)}</button>`).join('')}</div>
    <button class="btn-green sell-btn" data-action="toast-soon">${icon('plus')}${t('mkt.sell')}</button>
    ${list.map(p => `<div class="prod card">
      <div class="prod-th" style="--hue:${p.hue}">${icon('leaf')}</div>
      <div class="prod-b"><b>${t(p.nameKey)}</b><small>${t('mkt.seller')}: ${p.seller}</small>${p.hot ? `<span class="hot">${icon('trend')}${t('mkt.demand')}</span>` : ''}</div>
      <div class="prod-p">AED ${p.price}</div>
    </div>`).join('')}
  </div>`;
}

/* ---------- rewards ---------- */
function screenRewards() {
  return `${gheadBack('rew.title')}
  <div class="scroll flat">
    <div class="pts-card"><span class="pts-ic">${icon('trophy')}</span><div><b>${POINTS}</b><small>${t('rew.season')}</small></div></div>
    <div class="card pad chal"><div class="chal-top">${icon('spark')}<b>${t('rew.challenge')}</b></div>
      <p>${t('rew.c1')}</p><div class="zbar"><div class="zfill" style="width:66%"></div></div><small class="muted">2 / 3</small></div>
    <h3 class="d-sec">${t('rew.earn')}</h3>
    <div class="list card">${['rew.e1', 'rew.e2', 'rew.e3'].map(k => `<div class="row static"><span class="r-ico green">${icon('check')}</span><span>${t(k)}</span></div>`).join('')}</div>
    <h3 class="d-sec">${t('rew.redeem')}</h3>
    ${REDEEMS.map(r => `<div class="prod card">
      <div class="prod-th" style="--hue:${r.hue}">${icon('gift')}</div>
      <div class="prod-b"><b>${t(r.key)}</b><small>${t('rew.pts', { n: r.pts })}</small></div>
      <button class="mini-btn ${POINTS >= r.pts ? '' : 'dis'}" data-action="toast-soon">${t('rew.redeemBtn')}</button>
    </div>`).join('')}
    <h3 class="d-sec">${t('rew.badges')}</h3>
    <div class="badges">${BADGES.map(b => `<div class="badge ${b.earned ? 'on' : ''}"><span>${icon(b.icon)}</span><small>${t(b.key)}</small></div>`).join('')}</div>
  </div>`;
}

/* ---------- devices ---------- */
function screenDevices() {
  const tone = { active: 'green', offline: 'amber', error: 'red' };
  return `${gheadBack('dev.title')}
  <div class="scroll flat">
    <button class="btn-green sell-btn" data-action="toast-soon">${icon('plus')}${t('dev.add')}</button>
    <div class="list card">${DEVICES.map(d => `<div class="row static">
      <span class="r-ico ${tone[d.status]}">${icon('chip')}</span>
      <div class="dev-b"><b>${d.id}</b><small>${t('dev.zone')} ${d.zone.replace('Z', '')} · ${d.loc}</small></div>
      <span class="dstat ${tone[d.status]}"><i></i>${t('dev.' + d.status)}</span>
    </div>`).join('')}</div>
    <div class="aitip card">${icon('spark')}<div><b>${t('dev.aiTitle')}</b><p>${t('dev.aiBody')}</p></div></div>
  </div>`;
}

/* ---------- AI iteration log ---------- */
function screenLog() {
  const tone = { accepted: 'green', dismissed: 'red', pending: 'amber' };
  return `${gheadBack('log.title')}
  <div class="scroll flat">
    <p class="muted log-intro">${t('log.intro')}</p>
    <button class="btn-ghost exp-btn" data-action="toast-soon">${icon('chart')}${t('log.export')}</button>
    <div class="list card">${AI_LOG.map(e => `<div class="logrow">
      <span class="r-ico ${tone[e.resp]}">${icon('spark')}</span>
      <div class="dev-b"><b>${t(e.key)}</b><small>${e.time}${e.zone === '—' ? '' : ' · ' + t('dev.zone') + ' ' + e.zone.replace('Z', '')}</small></div>
      <span class="rtag ${e.resp}">${t('log.' + e.resp)}</span>
    </div>`).join('')}</div>
  </div>`;
}

/* ---------- messages (inbox + thread) ---------- */
function threadLast(th) {
  const a = S.threadMsgs[th.id] || [];
  const last = a.length ? a[a.length - 1] : th.seed[th.seed.length - 1];
  return last.text || t(last.key);
}
function screenMessages() {
  return `${gheadBack('msg.title')}
  <div class="scroll flat">
    <div class="list card">${THREADS.map(th => `<button class="row inbox" data-action="open-thread" data-id="${th.id}">
      <span class="prod-th" style="--hue:${th.hue}">${icon('user')}</span>
      <div class="dev-b"><b>${th.name}</b><small>${threadLast(th)}</small></div>
      <span class="role-tag">${t('msg.' + th.role)}</span>
    </button>`).join('')}</div>
  </div>`;
}
function screenThread() {
  const th = THREADS.find(x => x.id === S.currentThreadId) || THREADS[0];
  const msgs = th.seed.concat(S.threadMsgs[th.id] || []);
  return `<header class="ghead detail"><div class="ghead-row">
    <button class="bell" data-action="go" data-route="messages">${icon('back', flip())}</button>
    <b class="center">${th.name}</b><span class="sp"></span></div></header>
  <div class="scroll chatscroll msgscroll">
    <div class="chat">${msgs.map(m => `<div class="msg ${m.role === 'me' ? 'user' : 'bot'}">${m.role !== 'me' ? '<span class="m-ava">' + icon('user') + '</span>' : ''}<div class="bubble">${m.text || t(m.key)}</div></div>`).join('')}</div>
  </div>
  <div class="composer">
    <input id="msgInput" placeholder="${t('msg.placeholder')}" autocomplete="off">
    <button class="ai-send" data-action="msg-send" aria-label="send">${icon('send')}</button>
  </div>`;
}
function msgSend() {
  const id = S.currentThreadId; const text = val('msgInput'); if (!id || !text) return;
  S.threadMsgs[id] = S.threadMsgs[id] || [];
  S.threadMsgs[id].push({ role: 'me', text });
  S.threadMsgs[id].push({ role: 'them', key: 'msg.reply' });
  save(); render();
  const sc = document.querySelector('.msgscroll'); if (sc) sc.scrollTop = sc.scrollHeight;
}

/* ---------- contracts ---------- */
function screenContracts() {
  return `${gheadBack('ct.title')}
  <div class="scroll flat">
    <button class="btn-green sell-btn" data-action="toast-soon">${icon('plus')}${t('ct.new')}</button>
    ${CONTRACTS.map(c => `<div class="contract card">
      <div class="ct-top"><b>${c.party}</b><span class="rtag ${c.status}">${t('ct.' + c.status)}</span></div>
      <div class="ct-mid">${t(c.cropKey)} · ${c.qty} kg · AED ${c.price}${t('ct.per')}</div>
      ${c.status === 'pending' ? `<button class="mini-btn ghost" data-action="toast-soon">${t('ct.counter')}</button>` : ''}
    </div>`).join('')}
  </div>`;
}

/* ---------- toast ---------- */
function toast(msg) {
  const host = document.getElementById('app'); if (!host) return;
  const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; host.appendChild(d);
  setTimeout(() => d.classList.add('show'), 10);
  setTimeout(() => { d.classList.remove('show'); setTimeout(() => d.remove(), 250); }, 2800);
}

/* ---------- bottom sheet (lang / location) ---------- */
function renderSensorSheet() {
  const z = S.monZones.find(x => x.id === sensorId) || S.monZones[0];
  const low = z.moisture < 40, acidic = z.ph < 6;
  const rec = low ? t('sen.recLow') : acidic ? t('sen.recAcidic') : t('sen.healthy');
  const crops = ['crop.tomato', 'crop.dates', 'crop.wheat', 'crop.maize', 'crop.potato'];
  const cell = (ic, lbl, id, val) => `<div class="sn-cell">${icon(ic)}<small>${lbl}</small><b id="${id}">${val}</b></div>`;
  return `<div class="sheet-mask" data-action="closesheet"></div>
  <div class="sheet sensor-sheet"><div class="grip"></div>
    <div class="sn-head"><span class="sn-pin ${z.status}">${z.id}</span><div><b>${t(z.cropKey)}</b><small><i class="d-on"></i>${t('sen.live')}</small></div></div>
    <div class="sn-grid">
      ${cell('drop', t('mon.moisture'), 'sn-moist', Math.round(z.moisture) + '%')}
      ${cell('temp', t('sen.temp'), 'sn-temp', z.temp.toFixed(0) + '°C')}
      ${cell('humid', t('sen.humid'), 'sn-humid', z.humidity.toFixed(0) + '%')}
      ${cell('flask', t('sen.ph'), 'sn-ph', z.ph.toFixed(1))}
      ${cell('leaf', t('sen.npk'), 'sn-npk', z.n + '-' + z.p + '-' + z.k)}
    </div>
    <div class="zbar sn-bar-wrap"><div id="sn-bar" class="zfill ${low ? 'low' : ''}" style="width:${z.moisture}%"></div></div>
    <div class="airec-body sn-rec"><span class="ai-bulb">${icon('spark')}</span><p>${rec}</p></div>
    <label class="sn-lbl">${t('sen.crop')}</label>
    <div class="filters">${crops.map(c => `<button class="fchip ${z.cropKey === c ? 'on' : ''}" data-action="sensor-crop" data-id="${z.id}" data-crop="${c}">${t(c)}</button>`).join('')}</div>
    <button class="btn-green" data-action="zone-irrigate" data-id="${z.id}">${icon('drop')} ${t('mon.irrigate')}</button>
  </div>`;
}

function renderSheet() {
  if (sheet === 'sensor') return renderSensorSheet();
  let title = '', rows = '';
  if (sheet === 'lang') {
    title = t('set.language');
    rows = LANGS.map(l => `<button class="sheet-row ${l.code === CURRENT_LANG ? 'sel' : ''}" data-action="setlang" data-lang="${l.code}">
      <span class="flag">${l.flag}</span><b>${l.native}</b><small>${l.name}</small>${l.code === CURRENT_LANG ? icon('check', 'c-green') : ''}</button>`).join('');
  } else {
    const list = sheet === 'country' ? COUNTRIES.map(c => c.name)
      : sheet === 'state' ? (countryObj() ? countryObj().states.map(s => s.name) : [])
      : (stateObj() ? stateObj().cities : []);
    title = t('farm.' + sheet);
    rows = list.length ? list.map(n => `<button class="sheet-row" data-action="pick" data-kind="${sheet}" data-val="${n}"><b>${n}</b></button>`).join('')
      : `<p class="sheet-empty">—</p>`;
  }
  return `<div class="sheet-mask" data-action="closesheet"></div>
    <div class="sheet"><div class="grip"></div><h3>${title}</h3><div class="sheet-list">${rows}</div></div>`;
}
function countryObj() { return COUNTRIES.find(c => c.name === wizardData.country); }
function stateObj() { const c = countryObj(); return c ? c.states.find(s => s.name === wizardData.state) : null; }

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-action]'); if (!el) return;
  const a = el.dataset.action, d = el.dataset;

  const map = {
    'openlang': () => { sheet = 'lang'; render(); },
    'closesheet': () => { sheet = null; render(); },
    'setlang': () => { setLang(d.lang); sheet = null; render(); },
    'ob-next': () => { obIndex++; render(); },
    'ob-skip': () => { obIndex = ONBOARDING.length - 1; render(); },
    'ob-done': () => { S.onboarded = true; save(); render(); },
    'to-signup': () => { authScreen = 'signup'; render(); },
    'to-login': () => { authScreen = 'login'; render(); },
    'go-forgot': () => { authScreen = 'forgotEmail'; render(); },
    'auth-back': () => { authScreen = authScreen === 'reset' ? 'otp' : authScreen === 'otp' ? 'forgotEmail' : 'login'; render(); },
    'do-login': () => { if (BK.enabled) return doAuthRemote('login'); S.user = { name: val('login_id') || 'Jacob Jones', email: (val('login_id') || 'jacob@falajae.com') }; S.farm = S.farm || demoFarm(); save(); render(); },
    'do-signup': () => { if (BK.enabled) return doAuthRemote('signup'); S.user = { name: val('su_name') || 'Jacob Jones', email: val('su_email') || 'jacob@falajae.com' }; S.farm = null; wizardStep = 1; wizardData = {}; save(); render(); },
    'send-code': () => { authScreen = 'otp'; render(); setTimeout(() => { const f = document.getElementById('otp0'); if (f) f.focus(); }, 30); },
    'verify-otp': () => { authScreen = 'reset'; render(); },
    'save-pass': () => { if (val('rs_pw') && val('rs_pw') !== val('rs_pw2')) { const e2 = document.getElementById('rsErr'); if (e2) e2.classList.remove('hidden'); return; } authScreen = 'login'; render(); },
    'togglepw': () => togglePw(d.target, el),
    'wiz-skip': () => { S.farm = demoFarm(); save(); render(); },
    'wiz-next': () => { captureStep1(); wizardStep = 2; render(); },
    'wiz-finish': () => { captureStep2(); finishWizard(); },
    'wiz-clear': () => { wizardData = {}; render(); },
    'wiz-field': () => { captureStep1(); wizardStep = 'field'; render(); },
    'wiz-to1': () => { wizardStep = 1; render(); },
    'wiz-savefield': () => { wizardData.field = true; wizardStep = 1; render(); },
    'wiz-clearfield': () => { wizardData.field = false; render(); },
    'opensel': () => { sheet = d.kind; render(); },
    'pick': () => pickLoc(d.kind, d.val),
    'go': () => { S.route = d.route; save(); render(); },
    'open-field': () => { S.currentFieldId = d.id; S.route = 'fieldDetail'; save(); render(); },
    'add-field': () => { wizardStep = 1; wizardData = {}; S.farm = null; save(); render(); },
    'clear-notif': () => { S.notifEmpty = true; save(); render(); },
    'ai-send': () => aiSend(),
    'ai-suggest': () => aiSend(t(d.q)),
    'zone-irrigate': () => { const z = S.monZones.find(x => x.id === d.id); if (z) { z.moisture = 78; z.status = 'ok'; } save(); render(); if (z) toast(t('toast.irrigated', { z: zoneLabel(z) })); },
    'open-sensor': () => { sensorId = d.id; sheet = 'sensor'; render(); },
    'sensor-crop': () => { const z = S.monZones.find(x => x.id === d.id); if (z) z.cropKey = d.crop; save(); render(); if (z) toast(t('toast.crop', { c: t(d.crop) })); },
    'ai-why': () => { const w = worstZone(); toast(w && w.moisture < MOIST_MIN ? t('mon.whyDyn', { z: zoneLabel(w), n: Math.round(w.moisture) }) : t('mon.allHealthy')); },
    'mkt-filter': () => { S.mktFilter = d.cat; save(); render(); },
    'toast-soon': () => toast(t('common.soon')),
    'open-thread': () => { S.currentThreadId = d.id; S.route = 'thread'; save(); render(); },
    'msg-send': () => msgSend(),
    'logout': () => { if (BK.enabled) BK.signOut(); S.user = null; S.farm = null; S.route = 'home'; authScreen = 'login'; save(); render(); },
  };
  if (map[a]) map[a]();
});

// live password rules + otp advance + confirm-match
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset && el.dataset.rules) updateRules(el.value);
  if (el.classList && el.classList.contains('otp-box')) {
    el.value = el.value.replace(/\D/g, '');
    if (el.value) { const nx = document.getElementById('otp' + (Number(el.dataset.i) + 1)); if (nx) nx.focus(); }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && e.target) {
    if (e.target.id === 'aiInput') { e.preventDefault(); aiSend(); }
    else if (e.target.id === 'msgInput') { e.preventDefault(); msgSend(); }
  }
});

function val(id) { const e = document.getElementById(id); return e ? e.value.trim() : ''; }
function togglePw(id, btn) {
  const e = document.getElementById(id); if (!e) return;
  e.type = e.type === 'password' ? 'text' : 'password';
  btn.innerHTML = icon(e.type === 'password' ? 'eye' : 'eyeoff');
}
function updateRules(v) {
  const set = (k, ok) => { const el = document.getElementById('rule_' + k); if (el) el.classList.toggle('ok', ok); };
  set('min', v.length >= 8);
  set('case', /[a-z]/.test(v) && /[A-Z]/.test(v));
  set('special', /[^A-Za-z0-9]/.test(v));
}
function captureStep1() { wizardData.name = val('w_name') || wizardData.name; wizardData.pincode = val('w_pin') || wizardData.pincode; }
function captureStep2() { ['w_wu', 'w_wc', 'w_mr', 'w_ar', 'w_me', 'w_ae', 'w_oe', 'w_ct', 'w_d'].forEach(id => { const v = val(id); if (v) wizardData[id] = v; }); }
function pickLoc(kind, v) {
  if (kind === 'country') { wizardData.country = v; wizardData.state = null; wizardData.city = null; }
  else if (kind === 'state') { wizardData.state = v; wizardData.city = null; }
  else wizardData.city = v;
  sheet = null; render();
}
function demoFarm() { return { name: 'Al Ain Grove', country: 'United Arab Emirates', state: 'Abu Dhabi', city: 'Al Ain' }; }
function finishWizard() {
  if (!S.farm) S.farm = { name: wizardData.name || 'My Farm', country: wizardData.country, state: wizardData.state, city: wizardData.city };
  // create a field from wizard input so the user sees their farm
  if (wizardData.name) {
    const rev = Number((wizardData.w_mr || '').replace(/\D/g, '')) || 8000;
    S.fields.unshift({ id: 'u' + Date.now(), name: wizardData.name, cropKey: 'crop.tomato',
      water: 70, expense: Number((wizardData.w_me || '').replace(/\D/g, '')) || 3000, revenue: rev, revChange: 4,
      health: 'good', planting: '01/06/2026', harvest: 3, consumption: 2400, workTime: 180, hectares: 60,
      bars: [22, 26, 20, 28, 24, 30, 23], exp: { seeds: 38, fertilizer: 26, pesticide: 22, chemicals: 14 }, hue: 96 });
  }
  S._addField = false; wizardStep = 1; wizardData = {}; S.route = 'home'; save(); render();
}

/* ---------- backend auth ---------- */
function mapUser(u) {
  const name = (u.user_metadata && u.user_metadata.name) || (u.email || '').split('@')[0];
  return { name, email: u.email || '' };
}
async function doAuthRemote(mode) {
  const email = mode === 'login' ? val('login_id') : val('su_email');
  const pw = mode === 'login' ? val('login_pw') : val('su_pw');
  if (!email || !pw) { toast(t('auth.' + (mode === 'login' ? 'login' : 'signup'))); return; }
  const res = mode === 'login' ? await BK.signIn(email, pw) : await BK.signUp(email, pw, val('su_name'));
  if (res.error) { toast(res.error); return; }
  if (res.needsConfirm) { toast(t('auth.otpHint')); authScreen = 'login'; render(); return; }
  S.user = mapUser(res.user || BK.user);
  const remote = await BK.pull();
  if (remote) { const u = S.user; Object.assign(S, remote); S.user = u; }
  else if (mode === 'signup') { S.farm = null; wizardStep = 1; wizardData = {}; }
  S.route = 'home'; save(); render();
}

/* ---------- live sensor simulation ---------- */
function rnd(a, b) { return a + Math.random() * (b - a); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function setTxt(id, v) { const e = document.getElementById(id); if (e) e.textContent = v; }
function sensorTick() {
  if (!S || !S.monZones) return;
  S.monZones.forEach(z => {
    z.moisture = clamp(z.moisture + rnd(-1.0, 0.8), 6, 96);
    z.temp = clamp(z.temp + rnd(-0.3, 0.3), 20, 45);
    z.humidity = clamp(z.humidity + rnd(-1, 1), 20, 82);
    z.ph = clamp(z.ph + rnd(-0.05, 0.05), 4.5, 8.5);
  });
  if (sheet === 'sensor') {
    const z = S.monZones.find(x => x.id === sensorId); if (!z) return;
    setTxt('sn-moist', Math.round(z.moisture) + '%');
    setTxt('sn-temp', z.temp.toFixed(0) + '°C');
    setTxt('sn-humid', z.humidity.toFixed(0) + '%');
    setTxt('sn-ph', z.ph.toFixed(1));
    const bar = document.getElementById('sn-bar'); if (bar) bar.style.width = z.moisture + '%';
  }
}

/* ---------- boot ---------- */
loadState();
setLang(CURRENT_LANG);
if (BK.enabled) {
  S.user = null;            // trust the backend session, not local cache
  render();
  BK.init().then(async (u) => {
    if (u) { S.user = mapUser(u); const r = await BK.pull(); if (r) { const uu = S.user; Object.assign(S, r); S.user = uu; } }
    render();
  }).catch(() => render());
} else {
  render();
}
setInterval(sensorTick, 2500);
