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
    state = load();
    if (state) {
      handleDailyStreak();
      enterApp();
    } else {
      setupOnboarding();
    }
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
      state.name = nameInput.value.trim().slice(0, 16) || 'لاعب';
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
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

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
    $('#levelHint').textContent = `باقي ${POINTS_PER_LEVEL - into} نقطة للمستوى ${level + 1}`;
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
          <h3>${w.name}</h3>
          <div class="wc-meta">
            <span>${w.desc}</span>
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
    $('#wmName').textContent = w.name;
    $('#wmPts').textContent = w.points;
    $('#wmCoins').textContent = w.coins;

    wk = { w, running: false, count: 0, target: w.mode === 'hold' ? w.seconds : w.reps,
           lastMag: null, lastPeak: 0, moving: false, held: 0, lastT: 0, raf: null,
           handler: null, watchdog: null, motionSeen: false };

    if (w.mode === 'hold') {
      $('#wmGoal').textContent = `اثبت ${w.seconds} ثانية`;
      renderWkRing(0, w.seconds);
      $('#wmHint').textContent = 'ضع جهازك على جسمك واضغط ابدأ';
    } else {
      $('#wmGoal').textContent = `الهدف: ${w.reps} عدّة`;
      renderWkRing(0, '0');
      $('#wmHint').textContent = 'امسك جهازك وحرّكه مع كل عدّة';
    }

    const action = $('#wmAction');
    action.innerHTML = '';
    const startBtn = document.createElement('button');
    startBtn.className = 'btn-primary';
    startBtn.textContent = 'ابدأ';
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

    $('#wmHint').textContent = wk.w.mode === 'hold' ? 'اثبت بثبات… لا تتحرّك' : 'حرّك جهازك مع كل عدّة';

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
      $('#wmHint').textContent = wk.moving ? 'ثبّت! لا تتحرّك' : 'ممتاز… استمر بالثبات';
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
      $('#wmHint').textContent = 'اضغط مع الاستمرار وثبّت';
      const b = document.createElement('button');
      b.className = 'btn-primary wm-press';
      b.textContent = 'اضغط مع الاستمرار';
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
      $('#wmHint').textContent = 'لا يوجد مستشعر — اضغط لكل عدّة';
      const b = document.createElement('button');
      b.className = 'btn-primary wm-tap';
      b.textContent = 'عدّة ‎+1';
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
    $('#wmHint').textContent = 'تم التحقّق — أحسنت!';
    $('#wmAction').innerHTML = '';
    haptic([30, 40, 60]);
    confettiBurst();

    state.points += w.points;
    state.coins += w.coins;
    state.totalWorkouts += 1;
    save();

    setTimeout(() => {
      $('#workoutModal').classList.add('hidden');
      renderTopbar();
      renderHome();
      toast(`<span class="ico star">${ICON('star', { size: 16 })}</span> +${w.points}　<span class="ico coin">${ICON('coin', { size: 16 })}</span> +${w.coins}`);
    }, 1100);
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
      b.textContent = cat.name;
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
      if (equipped) { btnLabel = 'مُرتدى'; btnClass += ' equipped'; disabled = 'disabled'; }
      else if (owned) { btnLabel = 'ارتدِ'; btnClass += ' owned'; }
      else { btnLabel = `شراء · ${item.price}`; btnClass += ' buy'; if (state.coins < item.price) disabled = 'disabled'; }

      // لون التمثيل: فاتح؟ استخدم أيقونة داكنة، والعكس
      const light = isLightColor(item.color);
      const iconColor = light ? '#1c1c1e' : '#ffffff';

      el.innerHTML = `
        ${equipped ? `<span class="si-check">${ICON('check', { size: 14 })}</span>` : ''}
        <div class="si-tile" style="background:${item.color}">${ICON(item.icon, { size: 30, color: iconColor })}</div>
        <div class="si-name">${item.name}</div>
        <div class="si-price">${item.price === 0 ? 'مجاني' : `<span class="ico coin">${ICON('coin', { size: 14 })}</span> ${item.price}`}</div>
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
      toast('لا تملك عملات كافية — شاهد فيديو');
      return;
    }
    state.coins -= item.price;
    state.owned.push(item.id);
    state.equipped[item.cat] = item.id;
    save();
    renderTopbar();
    renderShop();
    renderHome();
    toast(`تم شراء ${item.name} وارتداؤها`);
  }

  function equip(item) {
    state.equipped[item.cat] = item.id;
    save();
    renderShop();
    renderHome();
    toast(`${ICON('check', { size: 16 })} ارتديت ${item.name}`);
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
        toast(`<span class="ico coin">${ICON('coin', { size: 16 })}</span> +${REWARD_VIDEO_COINS} مكافأة المشاهدة`);
      }
    }, 1000);
  }

  // ===== التصنيف العالمي =====
  function buildLeaderboard() {
    const me = { name: state.name, country: 'الإمارات', points: state.points, me: true };
    const bots = BOTS.map(b => ({ name: b.name, country: b.country, points: b.base, me: false }));
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
      row.innerHTML = `
        <div class="lb-rank">${rank}</div>
        <div class="lb-ava" style="background:${avatarColor(p.name)}">${initials(p.name)}</div>
        <div class="lb-info">
          <div class="lb-name">${p.me ? p.name + ' (أنت)' : p.name}</div>
          <div class="lb-country">${p.country}</div>
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
