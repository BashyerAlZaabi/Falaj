/* =============================================================================
   محرّك الطيران بالتمرير  ·  scroll-flight engine
   -----------------------------------------------------------------------------
   التمرير لا يحرّك الصفحة — التمرير يحرّك *كاميرا*. الكاميرا تنطلق من خارج
   المشهد، تغوص إلى داخله عبر بوابته، ثم ترتفع وتنعطف إلى المشهد التالي
   دون قطع. المشاهد كلها موجودة في عالمٍ واحد بإحداثيات ثلاثية، والطبقات
   تتمدّد وتتلاشى وهي تمرّ بجانب الكاميرا — وهذا مصدر الإحساس بالعمق.

   Scroll doesn't move the page — scroll moves a *camera*. It starts outside a
   scene, dives through its gateway into the interior, then lifts and banks into
   the next one with no cut. Every scene lives in one 3D world; layers swell and
   dissolve as the camera passes them, and that is where the depth comes from.

   لا تبعيات. لا فيديو. لا WebGL.  ·  No dependencies. No video. No WebGL.
   ========================================================================== */

window.mountWorldFlight = function mountWorldFlight(root, opts) {
  'use strict';

  const SCENES  = opts.scenes;                   // من world-content.js
  const ART     = window.WORLD_SCENES;
  const N       = SCENES.length;

  /* ---- ثوابت الكاميرا · camera constants -------------------------------- */
  const P        = 820;     // بُعد المنظور — يحدّد قوة الغوص · perspective depth
  const GAP      = 2600;    // المسافة بين مشهدٍ وآخر · z distance between scenes
  const APPROACH = 1060;    // موضع الكاميرا عند بداية الغوص · camZ at dive start
  const INSIDE   = -80;     // وموضعها وقد صارت في الداخل · camZ once inside
  const DIVE_VH  = 1.55;    // ارتفاعات شاشة من التمرير لكل غوص · scroll per dive
  const CONN_VH  = 1.05;    // ...ولكل وصلة بين مشهدين · ...per connector
  const HOLD_VH  = 1.0;     // وقفةٌ في المشهد الأخير كي يستقرّ النداء · a hold on the finale
  const LINGER   = 0.42;    // تمهّل الكاميرا في منتصف المشهد · mid-scene settle
  const FADE_A   = 0.34 * P, FADE_B = 0.74 * P;  // متى تتلاشى الطبقة المارّة

  /* مواضع المشاهد في العالم · where each scene sits in the world */
  const WX = [0, 560, -480, 620, -560, 0];
  const WY = [0, -90, 70, -50, 90, 0];
  const wx = i => WX[i % WX.length], wy = i => WY[i % WY.length], wz = i => -i * GAP;

  /* ---- أدوات · small maths --------------------------------------------- */
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp  = (a, b, t) => a + (b - a) * t;
  const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
  const easeOut = t => 1 - Math.pow(1 - t, 2.2);

  function hexLerp(a, b, t) {
    const p = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const [r1, g1, b1] = p(a), [r2, g2, b2] = p(b);
    return `rgb(${Math.round(lerp(r1, r2, t))},${Math.round(lerp(g1, g2, t))},${Math.round(lerp(b1, b2, t))})`;
  }

  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---- بناء الـ DOM · build the DOM ------------------------------------- */
  root.classList.add('wf-root');
  root.innerHTML = '';

  // التعريفات المشتركة للـ SVG، مرّة واحدة لكل الصفحة
  const defs = document.createElement('div');
  defs.className = 'wf-defs';
  defs.innerHTML = `<svg width="0" height="0" aria-hidden="true"><defs>${ART.DEFS}</defs></svg>`;
  root.appendChild(defs);

  const stage = document.createElement('div'); stage.className = 'wf-stage';
  const fit   = document.createElement('div'); fit.className   = 'wf-fit';
  const rig   = document.createElement('div'); rig.className   = 'wf-rig';
  fit.appendChild(rig); stage.appendChild(fit); root.appendChild(stage);

  const grain = document.createElement('div'); grain.className = 'wf-grain'; stage.appendChild(grain);

  // طبقات كل مشهد · every scene's layers
  const built = SCENES.map((s, i) => {
    const layers = ART.build[s.id]().map((L) => {
      const d = document.createElement('div');
      d.className = 'wf-layer';
      const spread = L.z <= -900 ? 2.35 : L.z <= -400 ? 1.7 : 1;
      // الطبقات الخلفية تُكبَّر وتُذوَّب حوافّها كي لا تُظهر مستطيلاً:
      // قناع أفقي داخل الـ SVG للجانبين، وقناع دائري في CSS للأعلى والأسفل.
      // Background layers are enlarged and dissolved so they never read as a rectangle:
      // a horizontal mask inside the SVG for the sides, a radial one in CSS for top/bottom.
      const body = L.z !== 0 ? `<g mask="url(#mGround)">${L.svg}</g>` : L.svg;
      d.innerHTML = `<svg viewBox="0 0 ${ART.W} ${ART.H}" preserveAspectRatio="xMidYMid meet"
                          width="${ART.W}" height="${ART.H}" aria-hidden="true">${body}</svg>`;
      if (spread !== 1) d.classList.add('bg');
      rig.appendChild(d);
      return { el: d, z: L.z, spread, shown: true };
    });
    return { i, id: s.id, layers };
  });

  /* ---- طبقة النصوص · the copy overlay ----------------------------------- */
  const copyWrap = document.createElement('div'); copyWrap.className = 'wf-copy'; stage.appendChild(copyWrap);
  const copyCards = SCENES.map((s) => {
    const c = document.createElement('article');
    c.className = 'wf-card';
    c.id = 'scene-' + s.id;
    c.style.setProperty('--accent', s.accent);
    copyWrap.appendChild(c);
    return c;
  });

  /* ---- الهيكل العلوي: تقدّم + تنقّل · progress + scene nav --------------- */
  const bar = document.createElement('div'); bar.className = 'wf-bar';
  const barFill = document.createElement('span'); bar.appendChild(barFill); stage.appendChild(bar);

  const nav = document.createElement('nav'); nav.className = 'wf-nav'; stage.appendChild(nav);
  const navBtns = SCENES.map((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'wf-dot';
    b.style.setProperty('--accent', s.accent);
    b.innerHTML = `<i></i><span></span>`;
    b.addEventListener('click', () => {
      const y = flightTop() + (segStart(i * 2) + segLen(i * 2) * 0.98) * vh();
      scrollTo({ top: y, behavior: 'smooth' });
    });
    nav.appendChild(b);
    return b;
  });

  const hint = document.createElement('div'); hint.className = 'wf-hint';
  hint.innerHTML = `<span></span><i></i>`; stage.appendChild(hint);

  /* ---- خريطة التمرير · the scroll map ----------------------------------- */
  // المقاطع بالتناوب: غوص، وصلة، غوص، وصلة … · dive, connector, dive, …
  const SEGS = [];
  for (let i = 0; i < N; i++) {
    SEGS.push({ kind: 'dive', i, len: DIVE_VH });
    if (i < N - 1) SEGS.push({ kind: 'conn', i, len: CONN_VH });
  }
  // وقفة أخيرة: الكاميرا تثبت داخل المشهد الأخير والنداء يبقى ظاهراً وقابلاً للنقر
  // A final hold: the camera settles inside the last scene and the CTA stays up and clickable.
  SEGS.push({ kind: 'hold', i: N - 1, len: HOLD_VH });
  const TOTAL_VH = SEGS.reduce((a, s) => a + s.len, 0);
  const segLen = k => SEGS[k].len;
  const segStart = k => SEGS.slice(0, k).reduce((a, s) => a + s.len, 0);

  const spacer = document.createElement('div'); spacer.className = 'wf-spacer'; root.appendChild(spacer);

  const vh = () => stage.clientHeight || innerHeight;
  const flightTop = () => root.offsetTop;

  /* ---- الكاميرا · the camera ------------------------------------------- */
  const kApproach = i => ({ x: wx(i) + (i % 2 ? -270 : 270), y: wy(i) - 40, z: wz(i) + APPROACH });
  const kInside   = i => ({ x: wx(i), y: wy(i) * 0.35, z: wz(i) + INSIDE });

  function cameraAt(gp) {                       // gp = التقدّم بارتفاعات الشاشة
    let acc = 0, k = 0;
    for (; k < SEGS.length; k++) { if (gp < acc + SEGS[k].len || k === SEGS.length - 1) break; acc += SEGS[k].len; }
    const seg = SEGS[k];
    const t = clamp((gp - acc) / seg.len, 0, 1);

    if (seg.kind === 'hold') {
      const b = kInside(seg.i);
      return { seg: k, t, kind: 'hold', si: seg.i, x: b.x, y: b.y, z: b.z, rx: 0, ry: 0 };
    }
    if (seg.kind === 'dive') {
      // تمهّل في المنتصف حيث يبلغ النص ذروته · settle mid-scene, where the copy peaks
      const te = clamp(t - LINGER * Math.sin(2 * Math.PI * t) / (2 * Math.PI), 0, 1);
      const a = kApproach(seg.i), b = kInside(seg.i);
      const e = easeOut(te);
      return {
        seg: k, t, kind: 'dive', si: seg.i,
        x: lerp(a.x, b.x, e), y: lerp(a.y, b.y, e), z: lerp(a.z, b.z, te),
        rx: -3.0 * Math.sin(Math.PI * te), ry: (seg.i % 2 ? 2.5 : -2.5) * Math.sin(Math.PI * te),
      };
    }
    // وصلة: قوس يرتفع فوق العالم ثم ينحدر إلى المشهد التالي
    const a = kInside(seg.i), b = kApproach(seg.i + 1);
    const swing = (seg.i % 2 ? -1 : 1);
    const c = { x: (a.x + b.x) / 2 + swing * 760, y: Math.min(a.y, b.y) - 1060, z: (a.z + b.z) / 2 + 300 };
    const u = 1 - t;
    return {
      seg: k, t, kind: 'conn', si: seg.i,
      x: u * u * a.x + 2 * u * t * c.x + t * t * b.x,
      y: u * u * a.y + 2 * u * t * c.y + t * t * b.y,
      z: u * u * a.z + 2 * u * t * c.z + t * t * b.z,
      rx: -8 * Math.sin(Math.PI * t), ry: swing * 16 * Math.sin(Math.PI * t),
    };
  }

  /* ---- القياس · layout -------------------------------------------------- */
  let scaleFit = 1, portrait = false, bandY = 0.5;
  function layout() {
    spacer.style.height = (TOTAL_VH * 100) + 'dvh';
    const w = stage.clientWidth, h = stage.clientHeight;
    portrait = (w / h) < 1.02;
    // أفقياً نملأ الشاشة؛ رأسياً نقتصّ إلى قلب المشهد ونترك أسفلها للنص
    scaleFit = portrait ? w / 820 : Math.max(w / ART.W, h / ART.H);
    bandY = portrait ? 0.365 : 0.5;
    fit.style.transform = `translate(-50%, -50%) scale(${scaleFit.toFixed(4)})`;
    fit.style.top = (bandY * 100) + '%';
    root.classList.toggle('is-portrait', portrait);
  }

  /* ---- الرسم · the render pass ------------------------------------------ */
  let lastActive = -1;
  function render(gp) {
    const cam = cameraAt(gp);
    rig.style.transform = `rotateX(${cam.rx.toFixed(3)}deg) rotateY(${cam.ry.toFixed(3)}deg)`;

    for (const sc of built) {
      const d = cam.z - wz(sc.i);                      // + = الكاميرا أمام المشهد
      const alphaScene = (1 - smooth(2100, 2600, d)) * smooth(-1600, -500, d);
      if (alphaScene < 0.006) {
        for (const L of sc.layers) if (L.shown) { L.el.style.display = 'none'; L.shown = false; }
        continue;
      }
      const dx = wx(sc.i) - cam.x, dy = wy(sc.i) - cam.y;
      for (const L of sc.layers) {
        const rel = (wz(sc.i) + L.z) - cam.z;
        const a = rel >= P - 10 ? 0 : alphaScene * (1 - smooth(FADE_A, FADE_B, rel));
        if (a < 0.006) { if (L.shown) { L.el.style.display = 'none'; L.shown = false; } continue; }
        if (!L.shown) { L.el.style.display = ''; L.shown = true; }
        L.el.style.opacity = a.toFixed(3);
        L.el.style.transform =
          `translate3d(${dx.toFixed(1)}px, ${dy.toFixed(1)}px, ${rel.toFixed(1)}px)` +
          (L.spread !== 1 ? ` scale(${L.spread})` : '');
      }
    }

    // النص: يظهر في النصف الثاني من الغوص، ويغيب مع بداية الوصلة
    let copyPeak = 0;
    for (let i = 0; i < N; i++) {
      let a = 0;
      if (cam.kind === 'dive' && cam.si === i) a = smooth(0.34, 0.72, cam.t);
      else if (cam.kind === 'hold' && cam.si === i) a = 1;
      else if (cam.kind === 'conn' && cam.si === i) a = 1 - smooth(0, 0.3, cam.t);
      else if (cam.kind === 'dive' && cam.si > i) a = 0;
      const c = copyCards[i];
      c.style.opacity = a.toFixed(3);
      c.style.transform = `translateY(${((1 - a) * 26).toFixed(1)}px)`;
      c.style.pointerEvents = a > 0.55 ? 'auto' : 'none';
      c.setAttribute('aria-hidden', a > 0.4 ? 'false' : 'true');
      if (a > copyPeak) copyPeak = a;
    }
    copyWrap.style.setProperty('--scrim', copyPeak.toFixed(3));

    // لون السماء خلف كل شيء · the sky behind everything
    const i0 = cam.si, i1 = Math.min(N - 1, cam.kind === 'conn' ? cam.si + 1 : cam.si);
    const mix = cam.kind === 'conn' ? smooth(0.15, 0.85, cam.t) : 0;
    stage.style.setProperty('--wf-sky-a', hexLerp(SCENES[i0].sky[0], SCENES[i1].sky[0], mix));
    stage.style.setProperty('--wf-sky-b', hexLerp(SCENES[i0].sky[1], SCENES[i1].sky[1], mix));

    const active = (cam.kind === 'conn') ? (cam.t >= 0.5 ? cam.si + 1 : cam.si) : cam.si;
    if (active !== lastActive) {
      lastActive = active;
      navBtns.forEach((b, i) => b.classList.toggle('on', i === active));
      root.dataset.theme = SCENES[active].theme || 'light';
      root.style.setProperty('--accent', SCENES[active].accent);
    }
    barFill.style.transform = `scaleX(${(gp / TOTAL_VH).toFixed(4)})`;
    hint.style.opacity = (1 - smooth(0.02, 0.32, gp)).toFixed(3);
  }

  /* ---- حلقة التمرير مع تنعيم · smoothed scroll loop --------------------- */
  let target = 0, cur = 0, running = false, pinned = false;
  function readScroll() {
    const top = flightTop(), H = TOTAL_VH * vh();
    const y = clamp(scrollY - top, 0, H);
    target = y / vh();
    const inside = scrollY >= top - 1 && scrollY <= top + H + 1;
    if (inside !== pinned) { pinned = inside; root.classList.toggle('is-flying', inside); }
    kick();
  }
  function kick() { if (!running) { running = true; requestAnimationFrame(tick); } }
  function tick() {
    const diff = target - cur;
    cur += diff * (Math.abs(diff) > 2.2 ? 0.5 : 0.16);
    if (Math.abs(target - cur) < 0.0012) { cur = target; running = false; render(cur); return; }
    render(cur);
    requestAnimationFrame(tick);
  }

  /* ---- اللغة · language ------------------------------------------------- */
  const T = (o, lang) => (o && (o[lang] != null ? o[lang] : o.ar)) || '';
  let LANG = opts.lang || 'ar';

  function paint(lang) {
    LANG = lang;
    SCENES.forEach((s, i) => {
      const c = copyCards[i];
      const tags = (T(s.tags, lang) || []).map(t => `<li>${t}</li>`).join('');
      const cta = s.cta ? `<div class="wf-cta">
          <a class="wf-btn" href="${s.cta.primary.href}">${T(s.cta.primary.label, lang)}</a>
          <a class="wf-btn ghost" href="${s.cta.secondary.href}">${T(s.cta.secondary.label, lang)}</a>
        </div>` : '';
      c.innerHTML = `
        <p class="wf-eyebrow">${T(s.eyebrow, lang)}</p>
        <h2 class="wf-title">${T(s.title, lang)}</h2>
        <p class="wf-body">${T(s.body, lang)}</p>
        ${tags ? `<ul class="wf-tags">${tags}</ul>` : ''}${cta}`;
    });
    navBtns.forEach((b, i) => {
      const label = T(SCENES[i].label, lang);
      b.querySelector('span').textContent = label;
      b.setAttribute('aria-label', label);
    });
    hint.querySelector('span').textContent = T(window.WORLD.UI.hint, lang);
    lastActive = -1;
  }

  /* ---- بديل لمن يفضّل تقليل الحركة · reduced-motion fallback ------------- */
  if (reduce) {
    root.classList.add('is-static');
    spacer.remove();
    built.forEach((sc) => {
      const sec = document.createElement('section');
      sec.className = 'wf-still';
      const art = document.createElement('div');
      art.className = 'wf-still__art';
      art.innerHTML = `<svg viewBox="0 0 ${ART.W} ${ART.H}" aria-hidden="true">${
        sc.layers.filter(L => L.z < 700).slice().reverse()
          .map(L => L.el.querySelector('svg').innerHTML).join('')}</svg>`;
      sec.appendChild(art);
      sec.appendChild(copyCards[sc.i]);
      root.appendChild(sec);
      sc.layers.forEach(L => L.el.remove());
    });
    stage.remove(); nav.remove(); bar.remove(); hint.remove();
    paint(LANG);
    return { setLang: paint, isStatic: true };
  }

  /* ---- التشغيل · go ----------------------------------------------------- */
  layout(); paint(LANG); readScroll(); render(cur);
  addEventListener('scroll', readScroll, { passive: true });
  addEventListener('resize', () => { layout(); readScroll(); render(cur); });
  addEventListener('orientationchange', () => setTimeout(() => { layout(); readScroll(); }, 220));

  return {
    setLang: paint,
    isStatic: false,
    top: () => flightTop(),
    end: () => flightTop() + TOTAL_VH * vh(),
  };
};
