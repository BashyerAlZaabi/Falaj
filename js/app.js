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
        <div class="wc-emoji">${w.emoji}</div>
        <div class="wc-body">
          <h3>${w.name}</h3>
          <div class="wc-meta">
            <span>${w.desc}</span>
            <span>+<b>${w.points}</b> ⭐</span>
            <span>+<b>${w.coins}</b> 🪙</span>
          </div>
        </div>
        <button class="wc-go">ابدأ</button>`;
      card.querySelector('.wc-go').addEventListener('click', () => startWorkout(w));
      list.appendChild(card);
    });
  }

  // ===== تنفيذ تمرين =====
  let workoutTimer = null;
  function startWorkout(w) {
    const modal = $('#workoutModal');
    modal.classList.remove('hidden');
    $('#wmEmoji').textContent = w.emoji;
    $('#wmName').textContent = w.name;
    $('#wmPts').textContent = w.points;
    $('#wmCoins').textContent = w.coins;
    $('#wmHint').textContent = 'جاري التمرين... ثبّت! 💪';
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
    $('#wmHint').textContent = 'أحسنت! اكتمل التمرين 🎉';
    setTimeout(() => {
      $('#workoutModal').classList.add('hidden');
      renderTopbar();
      renderHome();
      toast(`+${w.points} ⭐  +${w.coins} 🪙`);
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
      el.className = 'shop-item' + (equipped ? ' equipped' : '');

      let btnLabel, btnClass = 'si-btn', disabled = '';
      if (equipped) { btnLabel = 'مرتدى ✓'; btnClass += ' equipped'; disabled = 'disabled'; }
      else if (owned) { btnLabel = 'ارتدِ'; btnClass += ' owned'; }
      else { btnLabel = `شراء 🪙 ${item.price}`; if (state.coins < item.price) disabled = 'disabled'; }

      el.innerHTML = `
        ${equipped ? '<span class="si-tag">مرتدى</span>' : ''}
        <div class="si-preview">${item.icon}</div>
        <div class="si-name">${item.name}</div>
        <div class="si-price">${item.price === 0 ? 'مجاني' : '🪙 ' + item.price}</div>
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
      toast('ما عندك عملات كافية! شاهد فيديو 🎬');
      return;
    }
    state.coins -= item.price;
    state.owned.push(item.id);
    state.equipped[item.cat] = item.id;
    save();
    renderTopbar();
    renderShop();
    renderHome();
    toast(`تم شراء ${item.name} وارتداؤها! 🎉`);
  }

  function equip(item) {
    state.equipped[item.cat] = item.id;
    save();
    renderShop();
    renderHome();
    toast(`ارتديت ${item.name} ✓`);
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
        toast(`+${REWARD_VIDEO_COINS} 🪙 مكافأة المشاهدة! 🎬`);
      }
    }, 1000);
  }

  // ===== التصنيف العالمي =====
  function buildLeaderboard() {
    const me = {
      name: state.name, flag: '🇦🇪',
      ava: state.gender === 'female' ? '🧕🏻' : '🧔🏻',
      points: state.points, me: true,
    };
    const bots = BOTS.map(b => ({ name: b.name, flag: b.flag, ava: b.ava, points: b.base, me: false }));
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
      const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : rank;
      row.innerHTML = `
        <div class="lb-rank">${medal}</div>
        <div class="lb-ava">${p.ava}</div>
        <div class="lb-name">${p.me ? p.name + ' (أنت)' : p.name}</div>
        <div class="lb-flag">${p.flag}</div>
        <div class="lb-pts">${fmt(p.points)} <small>⭐</small></div>`;
      list.appendChild(row);
    });
  }

  // ===== Toast =====
  let toastTimer = null;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.add('hidden'), 2200);
  }

  // ===== تشغيل =====
  document.addEventListener('DOMContentLoaded', init);
})();
