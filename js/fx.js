/* ===== المؤثرات: الصوت، الاهتزاز، الاحتفال =====
   بلا ملفّات خارجية — الصوت يُولَّد عبر WebAudio. يحترم إعداد الصوت وتفضيل تقليل الحركة.
   يُتاح عبر window.FX.
*/
(function () {
  'use strict';

  const reduceMotion = () =>
    window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const soundOn = () => {
    try { return !window.Store || window.Store.state.settings.sound !== false; }
    catch (e) { return true; }
  };

  // ----- الصوت -----
  let ac = null;
  function ctx() {
    if (!ac) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC) ac = new AC();
    }
    if (ac && ac.state === 'suspended') ac.resume();
    return ac;
  }
  function tone(freq, start, dur, type, gain) {
    const c = ctx();
    if (!c) return;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    const t0 = c.currentTime + start;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain || 0.18, t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SOUNDS = {
    tap:     () => tone(420, 0, 0.07, 'sine', 0.10),
    success: () => { tone(660, 0, 0.10, 'sine', 0.16); tone(880, 0.09, 0.16, 'sine', 0.16); },
    coin:    () => { tone(990, 0, 0.07, 'triangle', 0.14); tone(1320, 0.07, 0.10, 'triangle', 0.14); },
    levelup: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.10, 0.18, 'triangle', 0.16)); },
    unlock:  () => { tone(784, 0, 0.10, 'sine', 0.15); tone(1175, 0.10, 0.22, 'sine', 0.15); },
    error:   () => tone(180, 0, 0.18, 'sawtooth', 0.10),
  };

  function play(name) {
    if (!soundOn()) return;
    const fn = SOUNDS[name];
    if (fn) { try { fn(); } catch (e) { /* الصوت غير متاح */ } }
  }

  // ----- الاهتزاز -----
  function haptic(pattern) {
    if (!soundOn()) return;                 // نربطه بنفس مفتاح التحكّم
    if (navigator.vibrate) { try { navigator.vibrate(pattern || 10); } catch (e) {} }
  }

  // ----- الاحتفال (قصاصات) -----
  const COLORS = ['#30d158', '#0a84ff', '#ff9f0a', '#ffd60a', '#ff375f', '#bf5af0', '#40c8e0'];
  function confetti(amount) {
    const canvas = document.getElementById('confetti');
    if (!canvas) return;
    if (reduceMotion()) return;             // نحترم تقليل الحركة
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const W = canvas.width = window.innerWidth * dpr;
    const H = canvas.height = window.innerHeight * dpr;
    canvas.style.width = window.innerWidth + 'px';
    canvas.style.height = window.innerHeight + 'px';
    canvas.classList.remove('hidden');
    const ctx2 = canvas.getContext('2d');

    const N = amount || 90;
    const parts = [];
    for (let i = 0; i < N; i++) {
      parts.push({
        x: W / 2 + (Math.random() - 0.5) * W * 0.3,
        y: H * 0.32,
        vx: (Math.random() - 0.5) * 9 * dpr,
        vy: (Math.random() * -10 - 4) * dpr,
        size: (4 + Math.random() * 5) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.3,
        color: COLORS[(Math.random() * COLORS.length) | 0],
        life: 1,
      });
    }
    const gravity = 0.32 * dpr;
    let frames = 0;
    function tick() {
      ctx2.clearRect(0, 0, W, H);
      let alive = false;
      parts.forEach(p => {
        p.vy += gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (frames > 60) p.life -= 0.02;
        if (p.life > 0 && p.y < H + 40) {
          alive = true;
          ctx2.save();
          ctx2.globalAlpha = Math.max(0, p.life);
          ctx2.translate(p.x, p.y);
          ctx2.rotate(p.rot);
          ctx2.fillStyle = p.color;
          ctx2.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
          ctx2.restore();
        }
      });
      frames++;
      if (alive && frames < 200) {
        requestAnimationFrame(tick);
      } else {
        ctx2.clearRect(0, 0, W, H);
        canvas.classList.add('hidden');
      }
    }
    requestAnimationFrame(tick);
  }

  window.FX = { play, haptic, confetti, reduceMotion };
})();
