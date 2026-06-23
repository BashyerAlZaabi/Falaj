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

    // المستوى
    const level = Math.floor(state.points / POINTS_PER_LEVEL) + 1;
    const into = state.points % POINTS_PER_LEVEL;
    const pct = Math.round((into / POINTS_PER_LEVEL) * 100);
    $('#levelLabel').textContent = 'المستوى ' + level;
    $('#levelPct').textContent = pct + '%';
    $('#levelFill').style.width = pct + '%';
    $('#levelHint').textContent = `باقي ${POINTS_PER_LEVEL - into} نقطة للمستوى ${level + 1}`;

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

  // ===== تنفيذ تمرين =====
  let workoutTimer = null;
  function startWorkout(w) {
    const modal = $('#workoutModal');
    modal.classList.remove('hidden');
    $('#wmIcon').innerHTML = ICON(w.icon, { size: 40 });
    $('#wmName').textContent = w.name;
    $('#wmPts').textContent = w.points;
    $('#wmCoins').textContent = w.coins;
    $('#wmHint').textContent = 'جارٍ التمرين… ثبّت!';
    $('#wmProgressFill').style.width = '0%';

    const total = w.seconds;
    let elapsed = 0;
    updateTimer(total);

    clearInterval(workoutTimer);
    workoutTimer = setInterval(() => {
      elapsed += 0.1;
      const pct = Math.min(100, (elapsed / total) * 100);
      $('#wmProgressFill').style.width = pct + '%';
      updateTimer(Math.max(0, total - elapsed));
      if (elapsed >= total) {
        clearInterval(workoutTimer);
        finishWorkout(w);
      }
    }, 100);

    $('#wmCancel').onclick = () => {
      clearInterval(workoutTimer);
      modal.classList.add('hidden');
    };
  }

  function updateTimer(sec) {
    const s = Math.ceil(sec);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('#wmTimer').textContent = `${mm}:${ss}`;
  }

  function finishWorkout(w) {
    state.points += w.points;
    state.coins += w.coins;
    state.totalWorkouts += 1;
    save();
    $('#wmHint').textContent = 'أحسنت! اكتمل التمرين';
    setTimeout(() => {
      $('#workoutModal').classList.add('hidden');
      renderTopbar();
      renderHome();
      toast(`<span class="ico star">${ICON('star', { size: 16 })}</span> +${w.points}　<span class="ico coin">${ICON('coin', { size: 16 })}</span> +${w.coins}`);
    }, 700);
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
