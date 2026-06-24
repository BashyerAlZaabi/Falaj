/* ===== المنطق الرئيسي لتطبيق فلج رياضة ===== */
(function () {
  'use strict';

  const SAVE_KEY = 'falaj_fitness_save_v1';
  const REWARD_VIDEO_COINS = 50;
  const POINTS_PER_LEVEL = 250;

  // ===== الحالة =====
  let state = null;
  let avatar3dReady = false;
  let avatarMounted = false;

  window.addEventListener('falaj-avatar-ready', () => {
    avatar3dReady = true;
    if (state && !$('#app').classList.contains('hidden')) renderHome();
  });

  const defaultState = () => ({
    name: 'لاعب',
    gender: 'male',
    points: 0,
    coins: 120,           // رصيد بداية بسيط
    totalWorkouts: 0,
    streak: 1,
    lastDay: todayKey(),
    owned: SHOP.filter(i => i.default).map(i => i.id),
    equipped: {
      outfit: 'outfit_classic',
      head: 'head_default',
      eyes: 'eyes_none',
      accessory: 'acc_none',
      shoes: 'shoes_default',
    },
    shopFilter: 'outfit',
    unlocked: [],
  });

  // ===== أدوات مساعدة =====
  const $ = sel => document.querySelector(sel);
  const $$ = sel => Array.from(document.querySelectorAll(sel));
  function todayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`; }
  function fmt(n) { return n.toLocaleString('en-US'); }

  function save() { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const s = JSON.parse(raw);
      // ترقية الحقول الناقصة بأمان
      return Object.assign(defaultState(), s, { equipped: Object.assign(defaultState().equipped, s.equipped || {}) });
    } catch (e) { return null; }
  }

  // ===== التهيئة =====
  function init() {
    fillIcons();
    I18N.applyStatic();
    bindLang();
    updateLangUI();
    state = load();
    if (state) {
      handleDailyStreak();
      enterApp();
    } else {
      setupOnboarding();
    }
  }

  // ===== اللغة =====
  function updateLangUI() {
    const lb = $('#langBtn'); if (lb) lb.textContent = I18N.otherLabel();
    $$('#langSwitch button').forEach(b => b.classList.toggle('active', b.dataset.lang === I18N.lang));
  }
  function bindLang() {
    $$('#langSwitch button').forEach(b => b.addEventListener('click', () => setLanguage(b.dataset.lang)));
    const lb = $('#langBtn'); if (lb) lb.addEventListener('click', () => setLanguage(I18N.other()));
  }
  function setLanguage(l) {
    if (l === I18N.lang) return;
    I18N.setLang(l);
    I18N.applyStatic();
    updateLangUI();
    if (state && !$('#app').classList.contains('hidden')) { bindShop(); renderAll(); }
  }

  function handleDailyStreak() {
    const t = todayKey();
    if (state.lastDay !== t) {
      // تحقق إذا كان أمس (مبسّط: أي يوم مختلف يحافظ على السلسلة مرة واحدة)
      const prev = new Date();
      prev.setDate(prev.getDate() - 1);
      const prevKey = `${prev.getFullYear()}-${prev.getMonth()}-${prev.getDate()}`;
      state.streak = (state.lastDay === prevKey) ? state.streak + 1 : 1;
      state.lastDay = t;
      save();
    }
  }

  // ===== شاشة البداية =====
  function setupOnboarding() {
    const nameInput = $('#nameInput');
    const startBtn = $('#startBtn');
    let chosenGender = null;

    $$('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.gender-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        chosenGender = btn.dataset.gender;
        validate();
      });
    });
    nameInput.addEventListener('input', validate);

    function validate() {
      startBtn.disabled = !(nameInput.value.trim().length >= 1 && chosenGender);
    }

    startBtn.addEventListener('click', () => {
      state = defaultState();
      state.name = nameInput.value.trim().slice(0, 16) || I18N.t('default_player');
      state.gender = chosenGender;
      save();
      enterApp();
    });
  }

  // ===== الدخول للتطبيق =====
  function enterApp() {
    $('#onboarding').classList.add('hidden');
    $('#app').classList.remove('hidden');
    fillIcons($('#app'));
    I18N.applyStatic($('#app'));
    updateLangUI();
    bindNav();
    bindShop();
    renderAll();
  }

  function renderAll() {
    renderTopbar();
    renderHome();
    renderWorkouts();
    renderShop();
    renderLeaderboard();
    renderProfile();
  }

  // ===== الشريط العلوي =====
  function renderTopbar() {
    $('#topPoints').textContent = fmt(state.points);
    $('#topCoins').textContent = fmt(state.coins);
  }

  // ===== التنقل =====
  function bindNav() {
    $$('[data-goto]').forEach(el => {
      el.addEventListener('click', () => goto(el.dataset.goto));
    });
  }
  function goto(screen) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === screen));
    $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.goto === screen));
    if (screen === 'leaderboard') renderLeaderboard();
    if (screen === 'profile') renderProfile();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function levelOf(points) { return Math.floor(points / POINTS_PER_LEVEL) + 1; }

  // ===== الرئيسية =====
  function renderHome() {
    $('#homeName').textContent = state.name;
    $('#streakDays').textContent = state.streak;
    $('#totalWorkouts').textContent = state.totalWorkouts;
    $('#ownedCount').textContent = state.owned.filter(id => {
      const it = SHOP.find(s => s.id === id); return it && !it.default;
    }).length;

    // المستوى — حلقة دائرية
    const level = Math.floor(state.points / POINTS_PER_LEVEL) + 1;
    const into = state.points % POINTS_PER_LEVEL;
    const pct = Math.round((into / POINTS_PER_LEVEL) * 100);
    $('#levelNum').textContent = level;
    $('#levelHint').textContent = I18N.t('level_hint', { n: POINTS_PER_LEVEL - into, m: level + 1 });
    $('#levelRing').innerHTML = ringSVG(pct, { size: 96, stroke: 11 });

    // الترتيب
    $('#homeRank').textContent = '#' + computeRank();

    // الشخصية (3D إن توفّر، وإلا SVG)
    const stage = $('#avatarStage');
    if (avatar3dReady && window.FalajAvatar) {
      if (!avatarMounted) { window.FalajAvatar.mount(stage, state.gender, state.equipped); avatarMounted = true; }
      else window.FalajAvatar.update(state.gender, state.equipped);
    } else {
      stage.innerHTML = buildAvatar(state.gender, state.equipped);
    }
  }

  // ===== التمارين =====
  function renderWorkouts() {
    const list = $('#workoutList');
    list.innerHTML = '';
    WORKOUTS.forEach(w => {
      const card = document.createElement('div');
      card.className = 'workout-card';
      card.innerHTML = `
        <div class="wc-icon">${ICON(w.icon, { size: 26 })}</div>
        <div class="wc-body">
          <h3>${I18N.loc(w, 'name')}</h3>
          <div class="wc-meta">
            <span>${I18N.loc(w, 'desc')}</span>
            <span class="mini"><span class="ico star">${ICON('star', { size: 14 })}</span> <b>${w.points}</b></span>
            <span class="mini"><span class="ico coin">${ICON('coin', { size: 14 })}</span> <b>${w.coins}</b></span>
          </div>
        </div>
        <span class="wc-chev">${ICON('chevron', { size: 20 })}</span>`;
      card.addEventListener('click', () => startWorkout(w));
      list.appendChild(card);
    });
  }

  // ===== تنفيذ تمرين مع التحقّق من الحركة =====
  const REP_THRESHOLD = 5.5;   // شدّة الحركة لاحتساب عدّة (m/s²)
  const REP_DEBOUNCE = 320;    // أقل فاصل زمني بين عدّتين (ms)
  const HOLD_MOVE = 2.4;       // حدّ الحركة الذي يُعتبر "غير ثابت" في البلانك
  let wk = null;

  function haptic(ms) { if (navigator.vibrate) { try { navigator.vibrate(ms || 18); } catch (e) {} } }

  function renderWkRing(pct, center) {
    $('#wmRing').innerHTML = ringSVG(pct * 100, { size: 150, stroke: 14, center: String(center) });
  }

  function startWorkout(w) {
    const modal = $('#workoutModal');
    modal.classList.remove('hidden');
    $('#wmIcon').innerHTML = ICON(w.icon, { size: 40 });
    $('#wmName').textContent = I18N.loc(w, 'name');
    $('#wmPts').textContent = w.points;
    $('#wmCoins').textContent = w.coins;

    wk = { w, running: false, count: 0, target: w.mode === 'hold' ? w.seconds : w.reps,
           lastMag: null, lastPeak: 0, moving: false, held: 0, lastT: 0, raf: null,
           handler: null, watchdog: null, motionSeen: false };

    if (w.mode === 'hold') {
      $('#wmGoal').textContent = I18N.t('goal_hold', { n: w.seconds });
      renderWkRing(0, w.seconds);
      $('#wmHint').textContent = I18N.t('hint_pre_hold');
    } else {
      $('#wmGoal').textContent = I18N.t('goal_reps', { n: w.reps });
      renderWkRing(0, '0');
      $('#wmHint').textContent = I18N.t('hint_pre_reps');
    }

    const action = $('#wmAction');
    action.innerHTML = '';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = I18N.t('start');
    startBtn.onclick = () => beginWorkout();
    action.appendChild(startBtn);

    $('#wmCancel').onclick = () => endWorkout();
  }

  async function beginWorkout() {
    if (!wk || wk.running) return;
    wk.running = true;
    wk.lastT = performance.now();
    $('#wmAction').innerHTML = '';

    let granted = true;
    try {
      if (window.DeviceMotionEvent && typeof DeviceMotionEvent.requestPermission === 'function') {
        granted = (await DeviceMotionEvent.requestPermission()) === 'granted';
      }
    } catch (e) { granted = false; }

    if (granted && window.DeviceMotionEvent) {
      wk.handler = onMotion;
      window.addEventListener('devicemotion', wk.handler);
    }

    $('#wmHint').textContent = wk.w.mode === 'hold' ? I18N.t('hint_hold') : I18N.t('hint_reps');

    // إن لم تصل أي قراءة حركة خلال 1.6ث → بديل يدوي
    wk.watchdog = setTimeout(() => { if (!wk.motionSeen) enableManual(); }, 1600);

    if (wk.w.mode === 'hold') startHoldLoop();
  }

  function onMotion(e) {
    if (!wk || !wk.running) return;
    const a = e.accelerationIncludingGravity || e.acceleration;
    if (!a) return;
    const mag = Math.sqrt((a.x || 0) ** 2 + (a.y || 0) ** 2 + (a.z || 0) ** 2);
    if (mag > 0.5) wk.motionSeen = true;   // قراءة حقيقية (جاذبية فعلية)
    if (wk.lastMag !== null) {
      const d = Math.abs(mag - wk.lastMag);
      if (wk.w.mode === 'hold') {
        wk.moving = d > HOLD_MOVE;
      } else {
        const now = performance.now();
        if (d > REP_THRESHOLD && now - wk.lastPeak > REP_DEBOUNCE) { wk.lastPeak = now; addRep(); }
      }
    }
    wk.lastMag = mag;
  }

  function addRep() {
    if (!wk || !wk.running) return;
    wk.count += 1;
    renderWkRing(Math.min(1, wk.count / wk.target), wk.count);
    haptic(20);
    if (wk.count >= wk.target) completeWorkout();
  }

  function startHoldLoop() {
    const step = () => {
      if (!wk || !wk.running) return;
      const now = performance.now();
      const dt = (now - wk.lastT) / 1000; wk.lastT = now;
      if (!wk.moving) wk.held += dt;
      const pct = Math.min(1, wk.held / wk.w.seconds);
      renderWkRing(pct, Math.max(0, Math.ceil(wk.w.seconds - wk.held)));
      $('#wmHint').textContent = wk.moving ? I18N.t('hint_hold_move') : I18N.t('hint_hold_ok');
      if (wk.held >= wk.w.seconds) { completeWorkout(); return; }
      wk.raf = requestAnimationFrame(step);
    };
    wk.raf = requestAnimationFrame(step);
  }

  // بديل يدوي عند غياب مستشعر الحركة
  function enableManual() {
    if (!wk || !wk.running) return;
    if (wk.handler) { window.removeEventListener('devicemotion', wk.handler); wk.handler = null; }
    const action = $('#wmAction');
    action.innerHTML = '';

    if (wk.w.mode === 'hold') {
      $('#wmHint').textContent = I18N.t('hint_manual_hold');
      const b = document.createElement('button');
      b.className = 'btn-primary wm-press';
      b.textContent = I18N.t('press_hold');
      action.appendChild(b);
      let holding = false;
      wk.lastT = performance.now();
      const loop = () => {
        if (!wk || !wk.running) return;
        const now = performance.now();
        const dt = (now - wk.lastT) / 1000; wk.lastT = now;
        if (holding) wk.held += dt;
        renderWkRing(Math.min(1, wk.held / wk.w.seconds), Math.max(0, Math.ceil(wk.w.seconds - wk.held)));
        if (wk.held >= wk.w.seconds) { completeWorkout(); return; }
        wk.raf = requestAnimationFrame(loop);
      };
      const dn = (e) => { e.preventDefault(); holding = true; b.classList.add('active'); };
      const up = () => { holding = false; b.classList.remove('active'); };
      b.addEventListener('pointerdown', dn);
      b.addEventListener('pointerup', up);
      b.addEventListener('pointerleave', up);
      wk.raf = requestAnimationFrame(loop);
    } else {
      $('#wmHint').textContent = I18N.t('hint_manual_reps');
      const b = document.createElement('button');
      b.className = 'btn-primary wm-tap';
      b.textContent = I18N.t('tap_rep');
      action.appendChild(b);
      b.addEventListener('click', () => {
        const now = performance.now();
        if (now - wk.lastPeak < 250) return;   // منع الضغط السريع جداً
        wk.lastPeak = now; addRep();
      });
    }
  }

  function cleanupWk() {
    if (!wk) return;
    if (wk.handler) { window.removeEventListener('devicemotion', wk.handler); wk.handler = null; }
    if (wk.watchdog) { clearTimeout(wk.watchdog); wk.watchdog = null; }
    if (wk.raf) { cancelAnimationFrame(wk.raf); wk.raf = null; }
  }

  function endWorkout() {
    cleanupWk();
    if (wk) wk.running = false;
    $('#workoutModal').classList.add('hidden');
  }

  function completeWorkout() {
    if (!wk || !wk.running) return;
    wk.running = false;
    cleanupWk();
    const w = wk.w;
    renderWkRing(1, wk.w.mode === 'hold' ? '0' : wk.count);
    $('#wmHint').textContent = I18N.t('verified');
    $('#wmAction').innerHTML = '';
    haptic([30, 40, 60]);
    confettiBurst();

    const oldLevel = levelOf(state.points);
    state.points += w.points;
    state.coins += w.coins;
    state.totalWorkouts += 1;
    save();

    setTimeout(() => {
      $('#workoutModal').classList.add('hidden');
      renderTopbar();
      renderHome();
      toast(`<span class="ico star">${ICON('star', { size: 16 })}</span> +${w.points}　<span class="ico coin">${ICON('coin', { size: 16 })}</span> +${w.coins}`);
      const newLevel = levelOf(state.points);
      if (newLevel > oldLevel) setTimeout(() => levelUp(newLevel), 600);
      else checkAchievements();
    }, 1100);
  }

  // ===== المستوى والإنجازات =====
  function levelUp(n) {
    const bonus = n * 20;
    state.coins += bonus;
    save();
    renderTopbar();
    $('#luBadge').innerHTML = ICON('star', { size: 38 });
    $('#luSub').textContent = I18N.t('levelup_sub', { n });
    $('#luReward').innerHTML = `<span class="ico coin">${ICON('coin', { size: 20 })}</span> ${I18N.t('reward_coins', { n: bonus })}`;
    $('#levelModal').classList.remove('hidden');
    confettiBurst();
    haptic([30, 40, 80]);
    $('#luClose').onclick = () => { $('#levelModal').classList.add('hidden'); checkAchievements(); };
  }

  function checkAchievements() {
    if (!state.unlocked) state.unlocked = [];
    const newly = [];
    ACHIEVEMENTS.forEach(a => {
      if (!state.unlocked.includes(a.id) && a.check(state)) {
        state.unlocked.push(a.id);
        state.coins += a.reward;
        newly.push(a);
      }
    });
    if (newly.length) {
      save();
      renderTopbar();
      renderProfile();
      newly.forEach((a, i) => setTimeout(() =>
        toast(`${ICON('check', { size: 16 })} ${I18N.t('ach_unlocked', { name: I18N.loc(a, 'name') })}`), 500 * i));
    }
  }

  // ===== الملف الشخصي =====
  function renderProfile() {
    if (!state) return;
    $('#profileName').textContent = state.name;
    $('#profileRank').textContent = computeRank();
    const ava = $('#profileAva');
    ava.style.background = avatarColor(state.name);
    ava.textContent = initials(state.name);

    const owned = state.owned.filter(id => { const it = SHOP.find(s => s.id === id); return it && !it.default; }).length;
    const rows = [
      { icon: 'star',     color: 'star',   label: I18N.t('total_points'),   val: fmt(state.points) },
      { icon: 'flame',    color: 'c-pink', label: I18N.t('streak'),         val: state.streak },
      { icon: 'dumbbell', color: 'c-green',label: I18N.t('workouts_done'),  val: state.totalWorkouts },
      { icon: 'tshirt',   color: 'c-blue', label: I18N.t('owned'),          val: owned },
    ];
    $('#profileStats').innerHTML = rows.map(r => `
      <div class="stat-row">
        <span class="sr-ico ${r.color}">${ICON(r.icon, { size: 20 })}</span>
        <span class="sr-label">${r.label}</span>
        <span class="sr-val">${r.val}</span>
      </div>`).join('');

    const unlocked = state.unlocked || [];
    $('#achProgress').textContent = I18N.t('ach_progress', { n: unlocked.length, m: ACHIEVEMENTS.length });
    $('#achGrid').innerHTML = ACHIEVEMENTS.map(a => {
      const on = unlocked.includes(a.id);
      return `<div class="ach ${on ? 'on' : 'off'}">
        <span class="ach-ico">${ICON(on ? a.icon : 'ring', { size: 24 })}</span>
        <span class="ach-name">${I18N.loc(a, 'name')}</span>
        <span class="ach-desc">${on ? I18N.loc(a, 'desc') : `+${a.reward}`}</span>
      </div>`;
    }).join('');
  }

  // ===== احتفال confetti نيون =====
  function confettiBurst() {
    const cv = document.createElement('canvas');
    cv.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:80';
    cv.width = window.innerWidth; cv.height = window.innerHeight;
    document.body.appendChild(cv);
    const ctx = cv.getContext('2d');
    const colors = ['#00f5a0', '#00d4ff', '#ff2d8e', '#a855ff', '#ffd23f'];
    const parts = [];
    for (let i = 0; i < 110; i++) {
      parts.push({
        x: cv.width / 2, y: cv.height * 0.42,
        vx: (Math.random() - 0.5) * 12, vy: (Math.random() * -1 - 0.4) * 11,
        r: 3 + Math.random() * 4, c: colors[i % colors.length],
        rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.5,
      });
    }
    let f = 0;
    (function anim() {
      f++; ctx.clearRect(0, 0, cv.width, cv.height);
      parts.forEach(p => {
        p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r, -p.r, p.r * 2, p.r * 2);
        ctx.restore();
      });
      if (f < 95) requestAnimationFrame(anim); else cv.remove();
    })();
  }

  // ===== المتجر =====
  function bindShop() {
    // تبويبات الفئات
    const tabs = $('#shopTabs');
    tabs.innerHTML = '';
    SHOP_CATS.forEach(cat => {
      const b = document.createElement('button');
      b.className = 'shop-tab' + (cat.id === state.shopFilter ? ' active' : '');
      b.textContent = I18N.loc(cat, 'name');
      b.addEventListener('click', () => {
        state.shopFilter = cat.id;
        save();
        renderShop();
      });
      tabs.appendChild(b);
    });

    $('#watchAdBtn').addEventListener('click', watchRewardVideo);
  }

  function renderShop() {
    // تحديث حالة التبويبات النشطة
    Array.from($('#shopTabs').children).forEach((b, i) => {
      b.classList.toggle('active', SHOP_CATS[i].id === state.shopFilter);
    });

    const grid = $('#shopGrid');
    grid.innerHTML = '';
    SHOP.filter(i => i.cat === state.shopFilter).forEach(item => {
      const owned = state.owned.includes(item.id);
      const equipped = state.equipped[item.cat] === item.id;
      const el = document.createElement('div');
      el.className = 'shop-item';

      let btnLabel, btnClass = 'si-btn', disabled = '';
      if (equipped) { btnLabel = I18N.t('equipped'); btnClass += ' equipped'; disabled = 'disabled'; }
      else if (owned) { btnLabel = I18N.t('equip'); btnClass += ' owned'; }
      else { btnLabel = `${I18N.t('buy')} · ${item.price}`; btnClass += ' buy'; if (state.coins < item.price) disabled = 'disabled'; }

      // لون التمثيل: فاتح؟ استخدم أيقونة داكنة، والعكس
      const light = isLightColor(item.color);
      const iconColor = light ? '#1c1c1e' : '#ffffff';

      el.innerHTML = `
        ${equipped ? `<span class="si-check">${ICON('check', { size: 14 })}</span>` : ''}
        <div class="si-tile" style="background:${item.color}">${ICON(item.icon, { size: 30, color: iconColor })}</div>
        <div class="si-name">${I18N.loc(item, 'name')}</div>
        <div class="si-price">${item.price === 0 ? I18N.t('free') : `<span class="ico coin">${ICON('coin', { size: 14 })}</span> ${item.price}`}</div>
        <button class="${btnClass}" ${disabled}>${btnLabel}</button>`;

      const btn = el.querySelector('button');
      if (!disabled) {
        btn.addEventListener('click', () => {
          if (owned) equip(item);
          else buy(item);
        });
      }
      grid.appendChild(el);
    });
  }

  function buy(item) {
    if (state.coins < item.price) {
      toast(I18N.t('toast_no_coins'));
      return;
    }
    state.coins -= item.price;
    state.owned.push(item.id);
    state.equipped[item.cat] = item.id;
    save();
    renderTopbar();
    renderShop();
    renderHome();
    toast(I18N.t('toast_bought', { name: I18N.loc(item, 'name') }));
    checkAchievements();
  }

  function equip(item) {
    state.equipped[item.cat] = item.id;
    save();
    renderShop();
    renderHome();
    toast(`${ICON('check', { size: 16 })} ${I18N.t('toast_equipped', { name: I18N.loc(item, 'name') })}`);
  }

  // ===== فيديو المكافأة =====
  function watchRewardVideo() {
    const modal = $('#adModal');
    const countEl = $('#adCount');
    modal.classList.remove('hidden');
    let n = 5;
    countEl.textContent = n;
    const iv = setInterval(() => {
      n -= 1;
      countEl.textContent = n;
      if (n <= 0) {
        clearInterval(iv);
        modal.classList.add('hidden');
        state.coins += REWARD_VIDEO_COINS;
        save();
        renderTopbar();
        renderShop();
        toast(`<span class="ico coin">${ICON('coin', { size: 16 })}</span> ${I18N.t('toast_reward', { n: REWARD_VIDEO_COINS })}`);
      }
    }, 1000);
  }

  // ===== التصنيف العالمي =====
  function buildLeaderboard() {
    const me = { name: state.name, country: 'الإمارات', country_en: 'UAE', points: state.points, me: true };
    const bots = BOTS.map(b => ({ name: b.name, name_en: b.name_en, country: b.country, country_en: b.country_en, points: b.base, me: false }));
    const all = bots.concat(me);
    all.sort((a, b) => b.points - a.points);
    return all;
  }

  function computeRank() {
    const all = buildLeaderboard();
    return all.findIndex(p => p.me) + 1;
  }

  function renderLeaderboard() {
    const all = buildLeaderboard();
    const list = $('#leaderboardList');
    list.innerHTML = '';
    all.forEach((p, i) => {
      const rank = i + 1;
      const row = document.createElement('div');
      row.className = 'lb-row' + (p.me ? ' me' : '') + (rank <= 3 ? ' top' + rank : '');
      const nm = I18N.loc(p, 'name');
      row.innerHTML = `
        <div class="lb-rank">${rank}</div>
        <div class="lb-ava" style="background:${avatarColor(p.name)}">${initials(nm)}</div>
        <div class="lb-info">
          <div class="lb-name">${p.me ? nm + ' ' + I18N.t('you') : nm}</div>
          <div class="lb-country">${I18N.loc(p, 'country')}</div>
        </div>
        <div class="lb-pts">${fmt(p.points)} <span class="ico star">${ICON('star', { size: 14 })}</span></div>`;
      list.appendChild(row);
    });
  }

  // ===== Toast =====
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.innerHTML = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  // ===== أدوات الأيقونات/الألوان =====
  function fillIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.filled) return;
      el.innerHTML = ICON(el.dataset.icon, { size: parseInt(el.dataset.iconSize || '24', 10) });
      el.dataset.filled = '1';
    });
  }
  function ringSVG(pct, opts) {
    opts = opts || {};
    const size = opts.size || 96, sw = opts.stroke || 10;
    const r = (size - sw) / 2, cx = size / 2;
    const c = 2 * Math.PI * r;
    const off = c * (1 - Math.max(0, Math.min(1, pct / 100)));
    const center = opts.center !== undefined ? opts.center : Math.round(pct) + '%';
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="#2b2b34" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cx}" r="${r}" fill="none" stroke="url(#ringGrad)" stroke-width="${sw}"
        stroke-linecap="round" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
        transform="rotate(-90 ${cx} ${cx})" filter="url(#ringGlow)"/>
      ${center ? `<text x="${cx}" y="${cx}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="${(size * 0.26).toFixed(0)}" font-weight="800">${center}</text>` : ''}
    </svg>`;
  }
  function initials(name) {
    const parts = String(name).trim().split(/\s+/);
    const a = parts[0] ? parts[0][0] : '';
    const b = parts[1] ? parts[1][0] : '';
    return (a + b) || a || '؟';
  }
  const AVA_COLORS = ['#0a84ff', '#30d158', '#ff9f0a', '#ff375f', '#bf5af0', '#40c8e0', '#ff453a', '#5e5ce6'];
  function avatarColor(name) {
    let h = 0;
    for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
    return AVA_COLORS[h % AVA_COLORS.length];
  }
  function isLightColor(hex) {
    const c = hex.replace('#', '');
    const r = parseInt(c.substr(0, 2), 16), g = parseInt(c.substr(2, 2), 16), b = parseInt(c.substr(4, 2), 16);
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150;
  }

  // ===== تشغيل =====
  document.addEventListener('DOMContentLoaded', init);
})();
