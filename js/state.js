/* ===== متجر الحالة: التخزين، الاشتقاق، والتعديلات =====
   يفصل منطق الحالة عن العرض. يُتاح عبر window.Store.
*/
(function () {
  'use strict';

  const SAVE_KEY = 'falaj_fitness_save_v1';   // نُبقي المفتاح للحفاظ على تقدّم اللاعبين الحاليين
  const POINTS_PER_LEVEL = 250;
  const REWARD_VIDEO_COINS = 50;
  const DAILY_GOAL = 3;

  function todayKey(date) {
    const d = date || new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
  }
  function yesterdayKey() {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return todayKey(d);
  }

  const defaultState = () => ({
    name: 'لاعب',
    gender: 'male',
    points: 0,
    coins: 120,
    totalWorkouts: 0,
    streak: 1,
    lastDay: todayKey(),
    goalDay: todayKey(),
    goalCount: 0,
    owned: SHOP.filter(i => i.default).map(i => i.id),
    equipped: {
      outfit: 'outfit_classic',
      head: 'head_default',
      eyes: 'eyes_none',
      accessory: 'acc_none',
      shoes: 'shoes_default',
    },
    unlocked: [],                 // معرّفات الإنجازات المفتوحة
    settings: { sound: true },
    shopFilter: 'outfit',
    workoutFilter: 'all',
  });

  let state = defaultState();

  // ===== التخزين =====
  function save() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* ممتلئ أو محظور */ }
  }
  function load() {
    let saved = null;
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) saved = JSON.parse(raw);
    } catch (e) { saved = null; }
    if (!saved) return false;
    const base = defaultState();
    // دمج آمن مع ترقية الحقول الناقصة (بما فيها الكائنات المتداخلة)
    state = Object.assign(base, saved, {
      equipped: Object.assign(base.equipped, saved.equipped || {}),
      settings: Object.assign(base.settings, saved.settings || {}),
      unlocked: Array.isArray(saved.unlocked) ? saved.unlocked : [],
    });
    refreshDaily();
    return true;
  }
  function reset() {
    state = defaultState();
    save();
  }
  function createNew(name, gender) {
    state = defaultState();
    state.name = (name || '').trim().slice(0, 16) || 'لاعب';
    state.gender = gender === 'female' ? 'female' : 'male';
    save();
  }

  // ===== التحديث اليومي: السلسلة + هدف اليوم =====
  function refreshDaily() {
    const t = todayKey();
    if (state.lastDay !== t) {
      state.streak = (state.lastDay === yesterdayKey()) ? state.streak + 1 : 1;
      state.lastDay = t;
    }
    if (state.goalDay !== t) {
      state.goalDay = t;
      state.goalCount = 0;
    }
    save();
  }

  // ===== الاشتقاق =====
  function level()        { return Math.floor(state.points / POINTS_PER_LEVEL) + 1; }
  function levelInto()    { return state.points % POINTS_PER_LEVEL; }
  function levelPct()     { return Math.round((levelInto() / POINTS_PER_LEVEL) * 100); }
  function levelRemain()  { return POINTS_PER_LEVEL - levelInto(); }
  function ownedCount()   { return state.owned.filter(id => { const it = SHOP.find(s => s.id === id); return it && !it.default; }).length; }

  function leaderboard() {
    const me = { name: state.name, country: 'الإمارات', points: state.points, me: true };
    const all = BOTS.map(b => ({ name: b.name, country: b.country, points: b.base, me: false }));
    all.push(me);
    all.sort((a, b) => b.points - a.points);
    return all;
  }
  function rank() {
    return leaderboard().findIndex(p => p.me) + 1;
  }

  // لقطة مشتقّة تُمرَّر لاختبارات الإنجازات
  function derived() {
    return {
      points: state.points,
      coins: state.coins,
      totalWorkouts: state.totalWorkouts,
      streak: state.streak,
      level: level(),
      rank: rank(),
      ownedCount: ownedCount(),
      goalDone: state.goalCount >= DAILY_GOAL,
    };
  }

  // يحسب الإنجازات المفتوحة حديثاً ويخزّنها. يعيد قائمة التعريفات الجديدة.
  function syncAchievements() {
    const d = derived();
    const fresh = [];
    ACHIEVEMENTS.forEach(a => {
      if (!state.unlocked.includes(a.id) && a.test(d)) {
        state.unlocked.push(a.id);
        fresh.push(a);
      }
    });
    if (fresh.length) save();
    return fresh;
  }

  // ===== التعديلات =====
  // تسجيل تمرين مكتمل. يعيد { leveledUp, newLevel, unlocked: [] }
  function recordWorkout(w) {
    const before = level();
    state.points += w.points;
    state.coins += w.coins;
    state.totalWorkouts += 1;
    if (state.goalDay !== todayKey()) { state.goalDay = todayKey(); state.goalCount = 0; }
    state.goalCount += 1;
    save();
    const after = level();
    return { leveledUp: after > before, newLevel: after, unlocked: syncAchievements() };
  }

  function addCoins(n) { state.coins += n; save(); }

  function buy(item) {
    if (state.owned.includes(item.id)) return { ok: false, reason: 'owned' };
    if (state.coins < item.price) return { ok: false, reason: 'funds' };
    state.coins -= item.price;
    state.owned.push(item.id);
    state.equipped[item.cat] = item.id;
    save();
    return { ok: true, unlocked: syncAchievements() };
  }
  function equip(item) {
    if (!state.owned.includes(item.id)) return false;
    state.equipped[item.cat] = item.id;
    save();
    return true;
  }

  function setSetting(key, val) { state.settings[key] = val; save(); }
  function setName(name) { state.name = (name || '').trim().slice(0, 16) || state.name; save(); }
  function setGender(g)  { state.gender = g === 'female' ? 'female' : 'male'; save(); }
  function setShopFilter(id)    { state.shopFilter = id; save(); }
  function setWorkoutFilter(id) { state.workoutFilter = id; save(); }

  // ===== الواجهة العامة =====
  window.Store = {
    POINTS_PER_LEVEL, REWARD_VIDEO_COINS, DAILY_GOAL,
    get state() { return state; },
    save, load, reset, createNew, refreshDaily,
    level, levelInto, levelPct, levelRemain, ownedCount,
    leaderboard, rank, derived, syncAchievements,
    recordWorkout, addCoins, buy, equip,
    setSetting, setName, setGender, setShopFilter, setWorkoutFilter,
  };
})();
