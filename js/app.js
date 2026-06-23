/* ===== المنطق الرئيسي لتطبيق فلج رياضة =====
   العرض والتفاعل فقط — الحالة في state.js، المؤثرات في fx.js.
*/
(function () {
  'use strict';

  // ===== أدوات مساعدة =====
  const $  = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));
  const fmt = n => Number(n).toLocaleString('en-US');

  function timeGreeting() {
    const h = new Date().getHours();
    if (h < 12) return 'صباح الخير';
    if (h < 18) return 'مساء الخير';
    return 'مساء الخير';
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

  // ===== حالة العرض =====
  let avatar3dReady = false;
  let avatarMounted = false;

  window.addEventListener('falaj-avatar-ready', () => {
    avatar3dReady = true;
    if (!$('#app').classList.contains('hidden')) renderAvatar();
  });

  // ===== التهيئة =====
  function init() {
    fillIcons();
    if (Store.load()) {
      enterApp();
    } else {
      setupOnboarding();
    }
    bindModalDismiss();
  }

  // ===== شاشة البداية =====
  function setupOnboarding() {
    const nameInput = $('#nameInput');
    const startBtn = $('#startBtn');
    let chosenGender = null;

    $$('.gender-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        $$('.gender-btn').forEach(b => { b.classList.remove('selected'); b.setAttribute('aria-checked', 'false'); });
        btn.classList.add('selected');
        btn.setAttribute('aria-checked', 'true');
        chosenGender = btn.dataset.gender;
        FX.play('tap');
        validate();
      });
    });
    nameInput.addEventListener('input', validate);
    function validate() {
      startBtn.disabled = !(nameInput.value.trim().length >= 1 && chosenGender);
    }
    startBtn.addEventListener('click', () => {
      Store.createNew(nameInput.value, chosenGender);
      FX.play('success');
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
    bindProfile();
    buildWorkoutFilters();
    Store.syncAchievements();   // فتح صامت لأي إنجاز تحقّق من التقدّم السابق
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
    $('#topPoints').textContent = fmt(Store.state.points);
    $('#topCoins').textContent = fmt(Store.state.coins);
  }

  // ===== التنقل =====
  function bindNav() {
    $$('[data-goto]').forEach(el => el.addEventListener('click', () => goto(el.dataset.goto)));
  }
  function goto(screen) {
    $$('.screen').forEach(s => s.classList.toggle('active', s.dataset.screen === screen));
    $$('.nav-btn, .side-link').forEach(b => {
      const on = b.dataset.goto === screen;
      b.classList.toggle('active', on);
      if (b.hasAttribute('role')) b.setAttribute('aria-selected', on ? 'true' : 'false');
    });
    if (screen === 'leaderboard') renderLeaderboard();
    if (screen === 'profile') renderProfile();
    FX.play('tap');
    window.scrollTo({ top: 0, behavior: FX.reduceMotion() ? 'auto' : 'smooth' });
  }

  // ===== الرئيسية =====
  function renderHome() {
    const st = Store.state;
    $('#greetHi').textContent = timeGreeting();
    $('#homeName').textContent = st.name;
    $('#heroName').textContent = st.name;
    $('#streakDays').textContent = st.streak;
    $('#totalWorkouts').textContent = st.totalWorkouts;
    $('#ownedCount').textContent = Store.ownedCount();

    const level = Store.level();
    $('#levelLabel').textContent = 'المستوى ' + level;
    $('#levelPct').textContent = Store.levelPct() + '%';
    $('#levelFill').style.width = Store.levelPct() + '%';
    $('#levelHint').textContent = `باقي ${fmt(Store.levelRemain())} نقطة للمستوى ${level + 1}`;

    $('#homeRank').textContent = '#' + Store.rank();
    renderGoalRing();
    renderAvatar();
  }

  function renderGoalRing() {
    const goal = Store.DAILY_GOAL;
    const done = Math.min(Store.state.goalCount, goal);
    const pct = goal ? done / goal : 0;
    const r = 30, circ = 2 * Math.PI * r;
    const off = circ * (1 - pct);
    $('#goalRing').innerHTML = `
      <svg width="76" height="76" viewBox="0 0 76 76" aria-hidden="true">
        <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--surface-3)" stroke-width="7"/>
        <circle cx="38" cy="38" r="${r}" fill="none" stroke="var(--green)" stroke-width="7"
          stroke-linecap="round" stroke-dasharray="${circ.toFixed(1)}" stroke-dashoffset="${off.toFixed(1)}"
          transform="rotate(-90 38 38)" style="transition:stroke-dashoffset .6s cubic-bezier(.22,1,.36,1)"/>
        <text x="38" y="44" text-anchor="middle" font-size="20" font-weight="800" fill="var(--label)">${done}</text>
      </svg>`;
    $('#goalLabel').textContent = done >= goal ? 'أحسنت! أكملت هدف اليوم 🎉' : `أكمل ${goal} تمارين اليوم`;
    $('#goalCount').textContent = `${done} / ${goal}`;
  }

  function renderAvatar() {
    const st = Store.state;
    const stage = $('#avatarStage');
    if (avatar3dReady && window.FalajAvatar) {
      if (!avatarMounted) { window.FalajAvatar.mount(stage, st.gender, st.equipped); avatarMounted = true; }
      else window.FalajAvatar.update(st.gender, st.equipped);
    } else {
      stage.innerHTML = buildAvatar(st.gender, st.equipped);
    }
  }

  // ===== التمارين =====
  function buildWorkoutFilters() {
    const wrap = $('#workoutFilters');
    wrap.innerHTML = '';
    WORKOUT_CATS.forEach(cat => {
      const b = document.createElement('button');
      b.className = 'filter-tab' + (cat.id === Store.state.workoutFilter ? ' active' : '');
      b.textContent = cat.name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', cat.id === Store.state.workoutFilter ? 'true' : 'false');
      b.addEventListener('click', () => {
        Store.setWorkoutFilter(cat.id);
        $$('#workoutFilters .filter-tab').forEach((t, i) => {
          const on = WORKOUT_CATS[i].id === cat.id;
          t.classList.toggle('active', on);
          t.setAttribute('aria-selected', on ? 'true' : 'false');
        });
        FX.play('tap');
        renderWorkouts();
      });
      wrap.appendChild(b);
    });
  }

  function renderWorkouts() {
    const list = $('#workoutList');
    const filter = Store.state.workoutFilter;
    const items = WORKOUTS.filter(w => filter === 'all' || w.cat === filter);
    list.innerHTML = '';
    $('#workoutEmpty').classList.toggle('hidden', items.length > 0);
    items.forEach(w => {
      const lvl = LEVELS[w.level] || LEVELS.easy;
      const card = document.createElement('button');
      card.className = 'workout-card';
      card.setAttribute('aria-label', `${w.name} — ${w.points} نقطة، ${w.coins} عملة`);
      card.innerHTML = `
        <span class="wc-icon">${ICON(w.icon, { size: 26 })}</span>
        <span class="wc-body">
          <span class="wc-title">
            <h3>${w.name}</h3>
            <span class="wc-badge" style="color:${lvl.color}">${lvl.name}</span>
          </span>
          <span class="wc-meta">
            <span>${w.desc}</span>
            <span class="mini"><span class="ico star">${ICON('star', { size: 14 })}</span> <b>${w.points}</b></span>
            <span class="mini"><span class="ico coin">${ICON('coin', { size: 14 })}</span> <b>${w.coins}</b></span>
          </span>
        </span>
        <span class="wc-chev">${ICON('chevron', { size: 20 })}</span>`;
      card.addEventListener('click', () => startWorkout(w));
      list.appendChild(card);
    });
  }

  // ===== تنفيذ تمرين =====
  let workoutTimer = null;
  function startWorkout(w) {
    $('#wmIcon').innerHTML = ICON(w.icon, { size: 40 });
    $('#wmName').textContent = w.name;
    $('#wmPts').textContent = w.points;
    $('#wmCoins').textContent = w.coins;
    $('#wmHint').textContent = 'جارٍ التمرين… ثبّت!';
    $('#wmProgressFill').style.width = '0%';
    openModal('#workoutModal');
    FX.play('tap'); FX.haptic(12);

    const total = w.seconds;
    let elapsed = 0;
    updateTimer(total);
    clearInterval(workoutTimer);
    workoutTimer = setInterval(() => {
      elapsed += 0.1;
      $('#wmProgressFill').style.width = Math.min(100, (elapsed / total) * 100) + '%';
      updateTimer(Math.max(0, total - elapsed));
      if (elapsed >= total) { clearInterval(workoutTimer); finishWorkout(w); }
    }, 100);

    $('#wmCancel').onclick = () => { clearInterval(workoutTimer); closeModal(); };
  }

  function updateTimer(sec) {
    const s = Math.ceil(sec);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    $('#wmTimer').textContent = `${mm}:${ss}`;
  }

  function finishWorkout(w) {
    const res = Store.recordWorkout(w);
    $('#wmHint').textContent = 'أحسنت! اكتمل التمرين';
    FX.play('success'); FX.haptic([14, 40, 14]);
    setTimeout(() => {
      closeModal();
      renderTopbar(); renderHome(); renderLeaderboard(); renderProfile();
      toast(`<span class="ico star">${ICON('star', { size: 16 })}</span> +${w.points}　<span class="ico coin">${ICON('coin', { size: 16 })}</span> +${w.coins}`);
      if (res.leveledUp) celebrateLevel(res.newLevel);
      announceUnlocks(res.unlocked);
    }, 700);
  }

  function celebrateLevel(level) {
    setTimeout(() => {
      FX.confetti(); FX.play('levelup'); FX.haptic([20, 60, 20, 60, 20]);
      toast(`<span class="ico" style="color:var(--gold)">${ICON('sparkle', { size: 16 })}</span> وصلت إلى المستوى ${level}!`);
    }, 900);
  }

  // ===== المتجر =====
  function bindShop() {
    const tabs = $('#shopTabs');
    tabs.innerHTML = '';
    SHOP_CATS.forEach(cat => {
      const b = document.createElement('button');
      b.className = 'filter-tab' + (cat.id === Store.state.shopFilter ? ' active' : '');
      b.textContent = cat.name;
      b.setAttribute('role', 'tab');
      b.setAttribute('aria-selected', cat.id === Store.state.shopFilter ? 'true' : 'false');
      b.addEventListener('click', () => { Store.setShopFilter(cat.id); FX.play('tap'); renderShop(); });
      tabs.appendChild(b);
    });
    $('#watchAdBtn').addEventListener('click', watchRewardVideo);
  }

  function renderShop() {
    Array.from($('#shopTabs').children).forEach((b, i) => {
      const on = SHOP_CATS[i].id === Store.state.shopFilter;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', on ? 'true' : 'false');
    });

    const grid = $('#shopGrid');
    grid.innerHTML = '';
    SHOP.filter(i => i.cat === Store.state.shopFilter).forEach(item => {
      const owned = Store.state.owned.includes(item.id);
      const equipped = Store.state.equipped[item.cat] === item.id;
      const el = document.createElement('div');
      el.className = 'shop-item';

      let btnLabel, btnClass = 'si-btn', disabled = '';
      if (equipped) { btnLabel = 'مُرتدى'; btnClass += ' equipped'; disabled = 'disabled'; }
      else if (owned) { btnLabel = 'ارتدِ'; btnClass += ' owned'; }
      else { btnLabel = `شراء · ${item.price}`; btnClass += ' buy'; if (Store.state.coins < item.price) disabled = 'disabled'; }

      const light = isLightColor(item.color);
      const iconColor = light ? '#1c1c1e' : '#ffffff';

      el.innerHTML = `
        ${equipped ? `<span class="si-check">${ICON('check', { size: 14 })}</span>` : ''}
        <div class="si-tile" style="background:${item.color}">${ICON(item.icon, { size: 30, color: iconColor })}</div>
        <div class="si-name">${item.name}</div>
        <div class="si-price">${item.price === 0 ? 'مجاني' : `<span class="ico coin">${ICON('coin', { size: 14 })}</span> ${item.price}`}</div>
        <button class="${btnClass}" ${disabled}>${btnLabel}</button>`;

      const btn = el.querySelector('button');
      if (!disabled) btn.addEventListener('click', () => owned ? doEquip(item) : doBuy(item));
      grid.appendChild(el);
    });
  }

  function doBuy(item) {
    const res = Store.buy(item);
    if (!res.ok) {
      FX.play('error');
      toast(res.reason === 'funds' ? 'لا تملك عملات كافية — شاهد فيديو' : 'تملك هذه القطعة');
      return;
    }
    FX.play('coin'); FX.haptic(12);
    renderTopbar(); renderShop(); renderHome();
    toast(`تم شراء ${item.name} وارتداؤها`);
    announceUnlocks(res.unlocked);
  }

  function doEquip(item) {
    if (!Store.equip(item)) return;
    FX.play('tap'); FX.haptic(8);
    renderShop(); renderHome();
    toast(`${ICON('check', { size: 16 })} ارتديت ${item.name}`);
  }

  // ===== فيديو المكافأة =====
  function watchRewardVideo() {
    const countEl = $('#adCount');
    let n = 5;
    countEl.textContent = n;
    openModal('#adModal');
    FX.play('tap');
    const iv = setInterval(() => {
      n -= 1;
      countEl.textContent = Math.max(0, n);
      if (n <= 0) {
        clearInterval(iv);
        closeModal();
        Store.addCoins(Store.REWARD_VIDEO_COINS);
        FX.play('coin');
        renderTopbar(); renderShop();
        toast(`<span class="ico coin">${ICON('coin', { size: 16 })}</span> +${Store.REWARD_VIDEO_COINS} مكافأة المشاهدة`);
      }
    }, 1000);
    // إيقاف العدّاد عند الإغلاق اليدوي
    modalOnClose = () => clearInterval(iv);
  }

  // ===== التصنيف العالمي =====
  function renderLeaderboard() {
    const all = Store.leaderboard();
    renderPodium(all.slice(0, 3));
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

  function renderPodium(top) {
    const order = [1, 0, 2]; // الثاني، الأول، الثالث
    const podium = $('#podium');
    podium.innerHTML = '';
    order.forEach(idx => {
      const p = top[idx];
      if (!p) return;
      const rank = idx + 1;
      const col = document.createElement('div');
      col.className = 'podium-col p' + rank + (p.me ? ' me' : '');
      col.innerHTML = `
        ${rank === 1 ? `<span class="podium-crown">${ICON('crown', { size: 20 })}</span>` : ''}
        <div class="podium-ava" style="background:${avatarColor(p.name)}">${initials(p.name)}</div>
        <div class="podium-name">${p.me ? 'أنت' : p.name.split(' ')[0]}</div>
        <div class="podium-pts">${fmt(p.points)}</div>
        <div class="podium-bar">${rank}</div>`;
      podium.appendChild(col);
    });
  }

  // ===== حسابي =====
  function bindProfile() {
    $('#editNameBtn').addEventListener('click', openNameEditor);
    $('#soundToggle').addEventListener('click', () => {
      const on = !Store.state.settings.sound;
      Store.setSetting('sound', on);
      updateSoundToggle();
      if (on) FX.play('tap');
    });
    $('#switchCharBtn').addEventListener('click', () => {
      const next = Store.state.gender === 'male' ? 'female' : 'male';
      Store.setGender(next);
      FX.play('tap');
      renderAvatar(); renderProfile();   // update() يعيد بناء الشخصية بالجنس الجديد
      toast('تم تبديل الشخصية');
    });
    $('#resetBtn').addEventListener('click', () => {
      confirmDialog({
        icon: 'trash',
        title: 'إعادة ضبط التقدّم',
        text: 'سيُحذف اسمك ونقاطك ومشترياتك نهائياً. لا يمكن التراجع.',
        okLabel: 'حذف الكل',
        onOk: () => {
          Store.reset();
          location.reload();
        },
      });
    });
  }

  function renderProfile() {
    const st = Store.state;
    $('#profileAva').innerHTML = buildAvatar(st.gender, st.equipped);
    $('#profileName').textContent = st.name;
    $('#profileLevel').textContent = 'المستوى ' + Store.level();
    $('#psPoints').textContent = fmt(st.points);
    $('#psCoins').textContent = fmt(st.coins);
    $('#psWorkouts').textContent = fmt(st.totalWorkouts);
    $('#psStreak').textContent = fmt(st.streak);
    $('#charValue').textContent = st.gender === 'female' ? 'أنثى' : 'رجل';
    updateSoundToggle();
    renderAchievements();
  }

  function updateSoundToggle() {
    const on = Store.state.settings.sound !== false;
    const btn = $('#soundToggle');
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    $('.switch', btn).setAttribute('data-on', on ? 'true' : 'false');
    $('.setting-ico', btn).innerHTML = ICON(on ? 'volumeOn' : 'volumeOff', { size: 20 });
  }

  function renderAchievements() {
    const unlocked = Store.state.unlocked;
    $('#achProgress').textContent = `${unlocked.length} / ${ACHIEVEMENTS.length}`;
    const grid = $('#achievementsGrid');
    grid.innerHTML = '';
    ACHIEVEMENTS.forEach(a => {
      const got = unlocked.includes(a.id);
      const el = document.createElement('div');
      el.className = 'ach-card' + (got ? ' got' : ' locked');
      el.setAttribute('title', a.desc);
      el.innerHTML = `
        <span class="ach-ico">${ICON(got ? a.icon : 'lock', { size: 22 })}</span>
        <span class="ach-name">${a.name}</span>
        <span class="ach-desc">${a.desc}</span>`;
      grid.appendChild(el);
    });
  }

  // ===== الإنجازات: تنبيهات الفتح =====
  function announceUnlocks(list) {
    if (!list || !list.length) return;
    list.forEach((a, i) => {
      setTimeout(() => {
        FX.play('unlock');
        toast(`<span class="ico" style="color:var(--gold)">${ICON('award', { size: 16 })}</span> إنجاز جديد: ${a.name}`);
      }, 1600 + i * 1700);
    });
    renderProfile();
  }

  // ===== Toast (مع طابور) =====
  let toastTimer = null;
  const toastQueue = [];
  function toast(msg) {
    toastQueue.push(msg);
    if (!toastTimer) showNextToast();
  }
  function showNextToast() {
    const t = $('#toast');
    if (!toastQueue.length) { t.classList.add('hidden'); toastTimer = null; return; }
    t.innerHTML = toastQueue.shift();
    t.classList.remove('hidden');
    toastTimer = setTimeout(() => { t.classList.add('hidden'); setTimeout(showNextToast, 180); }, 2200);
  }

  // ===== النوافذ: إدارة عامة =====
  let activeModal = null;
  let lastFocus = null;
  let modalOnClose = null;

  function openModal(sel) {
    const m = $(sel);
    if (!m) return;
    modalOnClose = null;
    lastFocus = document.activeElement;
    m.classList.remove('hidden');
    activeModal = m;
    const focusable = m.querySelector('button, input, [tabindex]');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  }
  function closeModal() {
    if (!activeModal) return;
    activeModal.classList.add('hidden');
    activeModal = null;
    if (modalOnClose) { const fn = modalOnClose; modalOnClose = null; fn(); }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }
  // الإغلاق بالنقر على الخلفية + مفتاح Esc + حصر التركيز
  function bindModalDismiss() {
    document.addEventListener('keydown', e => {
      if (!activeModal) return;
      if (e.key === 'Escape') { e.preventDefault(); dismissActive(); }
      else if (e.key === 'Tab') trapFocus(e);
    });
    $$('.modal').forEach(m => {
      m.addEventListener('mousedown', e => { if (e.target === m) dismissActive(); });
    });
  }
  function dismissActive() {
    if (!activeModal) return;
    // إلغاء التمرين الجاري إن وُجد
    if (activeModal.id === 'workoutModal') clearInterval(workoutTimer);
    closeModal();
  }
  function trapFocus(e) {
    const f = $$('button, input, [tabindex]', activeModal).filter(el => !el.disabled && el.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  // نافذة تأكيد عامة
  function confirmDialog({ icon, title, text, okLabel, onOk }) {
    $('#confirmIco').innerHTML = ICON(icon || 'sparkle', { size: 30 });
    $('#confirmTitle').textContent = title || 'تأكيد';
    $('#confirmText').textContent = text || '';
    $('#confirmOk').textContent = okLabel || 'تأكيد';
    openModal('#confirmModal');
    $('#confirmCancel').onclick = () => closeModal();
    $('#confirmOk').onclick = () => { closeModal(); if (onOk) onOk(); };
  }

  // تعديل الاسم
  function openNameEditor() {
    const input = $('#editNameInput');
    input.value = Store.state.name;
    openModal('#nameModal');
    $('#nameCancel').onclick = () => closeModal();
    $('#nameSave').onclick = () => {
      Store.setName(input.value);
      closeModal();
      FX.play('success');
      renderProfile(); renderHome(); renderLeaderboard();
    };
  }

  // ===== أدوات الأيقونات =====
  function fillIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach(el => {
      if (el.dataset.filled) return;
      el.innerHTML = ICON(el.dataset.icon, { size: parseInt(el.dataset.iconSize || '24', 10) });
      el.dataset.filled = '1';
    });
  }

  // ===== تشغيل =====
  document.addEventListener('DOMContentLoaded', init);
})();
