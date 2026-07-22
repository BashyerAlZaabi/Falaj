/* =========================================================================
   academy.js — engine for the Youth Agriculture Ambassadors academy
   · cinematic scroll (parallax / pin / zoom / reveal)
   · data-driven story chapters + workshop library
   · full interactive workshop journeys (choice / match / order / hotspot /
     quiz / calculator / crop-comparison)
   · hash routing, reduced-motion aware, no dependencies
   ========================================================================= */
(function () {
  "use strict";

  const D = window.AcademyData;
  const S = window.AcademyScenes;
  const Icon = window.Icon;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const REDUCED = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fmt = (n) => Math.round(n).toLocaleString("en-US");
  const AR = (n) => fmt(n).replace(/[0-9]/g, (d) => "٠١٢٣٤٥٦٧٨٩"[d]);

  /* resolve a `bg` token → CSS background layer(s) */
  function bgFor(token, pos) {
    if (token.startsWith("img:"))
      return `<div class="scene-photo hero-photo" style="background-image:url('${token.slice(4)}');background-position:${pos || "center"}"></div>`;
    if (token.startsWith("scene:")) {
      const fn = S[token.slice(6)];
      return fn ? `<div class="scene-layers">${fn()}</div>` : "";
    }
    return "";
  }

  /* ============================ BUILD STORY ============================ */
  function buildStory() {
    const story = $("#story");
    const html = D.chapters
      .map((c) => {
        const soft = c.bg.startsWith("scene:") ? "soft" : "";
        return `<section class="scene chapter" data-scene>
          <div class="scene-sticky">
            ${bgFor(c.bg, c.pos)}
            <div class="scene-veil ${soft}"></div>
            <div class="scene-content" data-scene-content>
              <span class="scene-kicker"><span class="dot"></span>${c.kicker}</span>
              <h2 class="scene-title">${c.title}</h2>
              <p class="scene-sub">${c.sub}</p>
            </div>
          </div>
        </section>`;
      })
      .join("");
    story.insertAdjacentHTML("beforeend", html);
  }

  /* ============================ SCROLL ENGINE ============================ */
  const scenes = [];
  function indexScenes() {
    scenes.length = 0;
    $$("[data-scene]").forEach((el) => {
      scenes.push({
        el,
        layers: $$(".scene-layer", el),
        photo: $(".scene-photo", el),
        content: $("[data-scene-content]", el),
      });
    });
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(update);
      ticking = true;
    }
  }
  function update() {
    ticking = false;
    const vh = window.innerHeight;
    const nav = $("#nav");
    if (nav) nav.classList.toggle("scrolled", window.scrollY > 40);

    if (REDUCED) return;
    for (const sc of scenes) {
      const rect = sc.el.getBoundingClientRect();
      if (rect.bottom < -vh * 0.4 || rect.top > vh * 1.4) continue;
      // distance of scene centre from viewport centre, normalised to [-~1 .. ~1]
      const center = rect.top + rect.height / 2;
      const dist = (center - vh / 2) / vh; // 0 = perfectly centred, +down / −up
      const ad = Math.abs(dist);

      // parallax layers — drift + gentle zoom by depth
      for (const L of sc.layers) {
        const d = parseFloat(L.dataset.depth) || 0.1;
        const shift = dist * d * vh * 1.15;
        const zoom = 1.05 + d * 0.55 - dist * d * 0.25;
        L.style.transform = `translate3d(0,${shift.toFixed(1)}px,0) scale(${zoom.toFixed(3)})`;
      }
      // ken-burns photo — slow zoom + parallax drift
      if (sc.photo) {
        const zoom = 1.12 - dist * 0.06;
        const drift = dist * vh * 0.16;
        sc.photo.style.transform = `translate3d(0,${drift.toFixed(1)}px,0) scale(${zoom.toFixed(3)})`;
      }
      // content — rises through centre, fades near the edges (smooth crossfade)
      if (sc.content) {
        const o = clamp(1 - Math.max(0, ad - 0.17) * 1.7, 0, 1);
        const y = dist * -70;
        const s = 1 - ad * 0.05;
        sc.content.style.opacity = o.toFixed(2);
        sc.content.style.transform = `translate3d(0,${y.toFixed(1)}px,0) scale(${s.toFixed(3)})`;
      }
    }
  }

  /* ============================ REVEAL ON SCROLL ============================ */
  function observeReveals(root = document) {
    if (REDUCED) { $$(".reveal", root).forEach((e) => e.classList.add("in")); return; }
    const io = new IntersectionObserver(
      (ents) => ents.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } }),
      { threshold: 0.12, rootMargin: "0px 0px -8% 0px" }
    );
    $$(".reveal", root).forEach((e) => io.observe(e));
  }

  /* ============================ HERO DUST ============================ */
  function dust() {
    const cv = $("#dust");
    if (!cv || REDUCED) return;
    const ctx = cv.getContext("2d");
    let w, h, parts;
    const resize = () => {
      w = cv.width = cv.offsetWidth * devicePixelRatio;
      h = cv.height = cv.offsetHeight * devicePixelRatio;
      parts = Array.from({ length: Math.min(70, Math.floor(w / 30)) }, () => ({
        x: Math.random() * w, y: Math.random() * h,
        r: (Math.random() * 2 + 0.6) * devicePixelRatio,
        vx: (Math.random() - 0.5) * 0.25 * devicePixelRatio,
        vy: -(Math.random() * 0.35 + 0.08) * devicePixelRatio,
        a: Math.random() * 0.5 + 0.15,
      }));
    };
    resize();
    addEventListener("resize", resize);
    (function loop() {
      ctx.clearRect(0, 0, w, h);
      for (const p of parts) {
        p.x += p.vx; p.y += p.vy;
        if (p.y < -10) { p.y = h + 10; p.x = Math.random() * w; }
        if (p.x < -10) p.x = w + 10; if (p.x > w + 10) p.x = -10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r, 0, 6.283);
        ctx.fillStyle = `rgba(255,238,196,${p.a})`;
        ctx.fill();
      }
      requestAnimationFrame(loop);
    })();
  }

  /* ============================ WORKSHOP LIBRARY ============================ */
  function wsCard(w) {
    const cover = w.cover.startsWith("img:")
      ? `<div class="ws-cover-art" style="background-image:url('${w.cover.slice(4)}');background-position:${w.coverPos || "center"}"></div>`
      : `<div class="ws-cover-art">${S[w.cover.slice(6)] ? S[w.cover.slice(6)]() : ""}</div>`;
    return `<article class="ws-card live reveal" data-open="${w.id}" tabindex="0" role="button" aria-label="ادخل ورشة ${w.title}">
      <div class="ws-cover">
        ${cover}
        <span class="ws-badge avail">متاحة الآن</span>
        <span class="ws-cover-icon">${Icon(w.icon)}</span>
      </div>
      <div class="ws-body">
        <h3>${w.title}</h3>
        <div class="ws-sub">${w.subtitle}</div>
        <p>${w.description}</p>
        <div class="ws-meta">
          <span>${Icon("clock")} ${w.duration}</span>
          <span>${Icon("target")} ${w.level}</span>
          <span>${Icon("layers")} ${AR(w.lesson.length)} دروس</span>
        </div>
        <div class="ws-foot">
          <span class="ws-enter">ابدأ الورشة ${Icon("arrowL")}</span>
        </div>
      </div>
    </article>`;
  }
  function soonCard(c) {
    return `<article class="ws-card soon reveal">
      <div class="soon-seed">${Icon("seed")}</div>
      <span class="ws-badge soon" style="position:static;margin-bottom:12px">قريباً</span>
      <h3>${c.title}</h3>
      <p>${c.note}</p>
      <span class="pill">في الطريق إليك 🌱</span>
    </article>`;
  }

  function buildLibrary() {
    const grid = $("#wsGrid");
    const live = D.workshops.filter((w) => w.status === "live");
    const renderTab = (tab) => {
      let cards = "";
      if (tab === "all") cards = live.map(wsCard).join("") + D.comingSoon.map(soonCard).join("");
      else if (tab === "live") cards = live.map(wsCard).join("");
      else cards = D.comingSoon.map(soonCard).join("");
      grid.innerHTML = cards;
      bindOpeners(grid);
      observeReveals(grid);
    };
    renderTab("all");

    $$(".lib-tab").forEach((t) =>
      t.addEventListener("click", () => {
        $$(".lib-tab").forEach((x) => x.classList.remove("active"));
        t.classList.add("active");
        renderTab(t.dataset.tab);
      })
    );

    // categories
    $("#catGrid").innerHTML = D.categories
      .map(
        (c) => `<div class="cat-card reveal">
        <div class="cat-ico">${Icon(c.icon)}</div>
        <h4>${c.name}</h4><p>سيتم إضافة المحتوى قريباً</p>
      </div>`
      )
      .join("");
  }

  function bindOpeners(root) {
    $$("[data-open]", root).forEach((el) => {
      el.addEventListener("click", () => openWorkshop(el.dataset.open));
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openWorkshop(el.dataset.open); }
      });
    });
  }

  /* ============================ WORKSHOP VIEW ============================ */
  const view = $("#wsview");
  const viewInner = $("#wsviewInner");
  let progressEls = [];

  function coverArt(w) {
    return w.cover.startsWith("img:")
      ? `<div class="wsh-art" style="background-image:url('${w.cover.slice(4)}');background-position:${w.coverPos || "center"}"></div>`
      : `<div class="wsh-art">${S[w.cover.slice(6)] ? S[w.cover.slice(6)]() : ""}</div>`;
  }

  function renderWorkshop(w) {
    let n = 0;
    const blk = (tag, ico, title, inner) =>
      `<section class="blk reveal"><span class="blk-tag"><span class="n">${Icon(ico)}</span>${tag}</span>
        ${title ? `<h2>${title}</h2>` : ""}${inner}</section>`;

    // objectives
    const objectives = `<div class="obj-grid">${w.objectives
      .map((o) => `<div class="obj"><span class="obj-dot">${Icon("check")}</span><span>${o}</span></div>`)
      .join("")}</div>`;

    // lesson steps
    const lesson = `<div class="steps">${w.lesson
      .map((l, i) => `<div class="step"><span class="step-dot">${AR(i + 1)}</span><h3>${l.title}</h3><p>${l.body}</p></div>`)
      .join("")}</div>`;

    // activities
    const activities = w.activities.map((a, i) => renderActivity(a, `${w.id}-a${i}`)).join("");

    // quiz
    const quiz = renderQuiz(w);

    // tips
    const tips = w.tips
      .map(
        (t) => `<div class="amb"><div class="amb-av" style="background-image:url('academy/assets/zayed-youth.jpg');background-position:82% 22%"></div>
        <div class="amb-body"><h4>${Icon("star")} نصيحة السفير</h4><div class="who">${t.who}</div><p>${t.text}</p></div></div>`
      )
      .join("");

    // related
    const related = (w.related || [])
      .map((id) => {
        const r = D.workshops.find((x) => x.id === id);
        if (!r) return "";
        return `<div class="rel-card" data-open="${r.id}"><div class="rel-ic">${Icon(r.icon)}</div>
          <div><h4>${r.title}</h4><small>${r.subtitle}</small></div></div>`;
      })
      .join("");

    viewInner.innerHTML = `
      <header class="wsh reveal">
        ${coverArt(w)}
        <div class="wsh-content">
          <div class="k">${w.category}</div>
          <h1>${w.title}</h1>
          <div class="sub">${w.subtitle}</div>
        </div>
      </header>

      ${blk("عن الورشة", "book", "", `<p class="lead">${w.description}</p>`)}
      ${blk("الأهداف", "target", "ماذا ستتعلّم؟", objectives)}
      ${blk("الدرس", "leaf", "خطوة بخطوة", lesson)}
      ${w.activities.length ? blk("نشاط تفاعلي", "hand", "طبّق بنفسك", activities) : ""}
      ${blk("اختبار", "checkCircle", "اختبر معلوماتك", quiz)}
      ${blk("من السفير", "star", "نصائح من سفير الزراعة", tips)}
      <section class="complete reveal" data-complete>
        <div class="complete-badge">${Icon("trophy")}</div>
        <h2>أكملت الورشة! 🌳</h2>
        <p>أنت الآن أقرب لأن تصبح سفير زراعة. أكمل الأنشطة والاختبار لتحصل على شارة الإتمام مستقبلاً.</p>
        <div class="complete-actions">
          <button class="btn btn-green" data-scrolltop>${Icon("up")} أعِد الورشة</button>
          <button class="btn btn-primary" data-close>${Icon("home")} إلى المكتبة</button>
        </div>
      </section>
      ${related ? blk("ورش ذات صلة", "layers", "أكمل رحلتك", `<div class="related-grid">${related}</div>`) : ""}
    `;

    // bind interactions inside the view
    bindActivities(viewInner);
    bindQuiz(viewInner, w);
    bindOpeners(viewInner);
    $$("[data-close]", viewInner).forEach((b) => b.addEventListener("click", closeWorkshop));
    $$("[data-scrolltop]", viewInner).forEach((b) =>
      b.addEventListener("click", () => view.scrollTo({ top: 0, behavior: REDUCED ? "auto" : "smooth" }))
    );

    observeReveals(viewInner);
    // progress bar tracks scroll through the view
    progressEls = [$("#wsProgress")];
    $("#wsTitleMini").textContent = w.title;
  }

  /* ---------- activity renderers ---------- */
  function renderActivity(a, id) {
    const head = (extra = "") =>
      `<div class="activity-head"><span class="ico">${Icon(activityIcon(a.type))}</span>
        <div><h3>${a.title}</h3><span class="q">${extra}</span></div></div>
       <p class="activity-prompt">${a.prompt}</p>`;

    if (a.type === "choice") {
      const opts = a.options
        .map(
          (o, i) => `<button class="choice" data-correct="${o.correct}">
            <span class="letter">${"أبجد"[i] || i + 1}</span>
            <span class="ct"><b>${o.label}</b>${o.note ? `<small>${o.note}</small>` : ""}</span>
            <span class="mark">${Icon("checkCircle")}</span></button>`
        )
        .join("");
      return `<div class="activity" data-activity="choice" id="${id}">${head()}
        <div class="choices">${opts}</div>
        <div class="activity-feedback" data-explain>${a.explain || ""}</div></div>`;
    }

    if (a.type === "match") {
      const li = (arr, side) =>
        arr
          .map(
            (x) => `<button class="match-item" data-side="${side}" data-id="${x.id}">
              <span class="mi-ico">${Icon(x.icon)}</span>${x.label}</button>`
          )
          .join("");
      return `<div class="activity" data-activity="match" data-pairs='${JSON.stringify(a.pairs)}' id="${id}">${head()}
        <div class="match">
          <div class="match-col"><h5>الأداة</h5><div class="match-items">${li(a.left, "L")}</div></div>
          <div class="match-col"><h5>الوظيفة</h5><div class="match-items">${li(shuffle(a.right), "R")}</div></div>
        </div>
        <div class="activity-feedback" data-fb></div></div>`;
    }

    if (a.type === "order") {
      const correct = a.steps.slice();
      const items = shuffle(a.steps.slice())
        .map(
          (s) => `<div class="order-item" draggable="true" data-step="${s}">
            <span class="grip">${Icon("grip")}</span>
            <span class="order-num"></span>
            <span class="otxt">${s}</span>
            <span class="obtns"><button data-up aria-label="أعلى">${Icon("up")}</button><button data-down aria-label="أسفل">${Icon("down")}</button></span>
          </div>`
        )
        .join("");
      return `<div class="activity" data-activity="order" data-correct='${JSON.stringify(correct)}' id="${id}">${head()}
        <div class="order-list">${items}</div>
        <div class="act-actions"><button class="btn btn-green btn-sm" data-check>${Icon("check")} تحقّق من الترتيب</button></div>
        <div class="activity-feedback" data-fb></div></div>`;
    }

    if (a.type === "hotspot") {
      const spots = a.spots
        .map(
          (s, i) => `<g class="hotspot" data-i="${i}" transform="translate(${s.x * 8} ${s.y * 6})">
            <circle class="hs-ring" r="16"/><circle class="hs-core" r="6"/></g>`
        )
        .join("");
      const tips = a.spots
        .map(
          (s, i) => `<div class="hotspot-tip" data-tip="${i}" style="inset-inline-start:${s.x}%;top:${s.y}%">
            <b>${s.title}</b>${s.text}</div>`
        )
        .join("");
      return `<div class="activity" data-activity="hotspot" id="${id}">${head("اضغط النقاط المضيئة")}
        <div class="hotspot-wrap">
          ${S.prune ? "" : ""}
          <svg viewBox="0 0 800 600" preserveAspectRatio="xMidYMid slice">${pruneTree()}${spots}</svg>
          ${tips}
        </div>
        <div class="act-actions"><span class="done-badge" data-hsdone style="display:none">${Icon("checkCircle")} اكتشفت كلّ النقاط</span></div></div>`;
    }

    if (a.type === "calculator") return renderCalculator(a, id);

    if (a.type === "compare") {
      const cards = a.crops
        .map(
          (c) => `<button class="crop-card" data-roi="${c.roi}"><div class="crop-emoji">${c.emoji}</div>
            <h4>${c.name}</h4><div class="roi">اضغط للكشف</div>
            <div class="crop-bar"><span></span></div></button>`
        )
        .join("");
      return `<div class="activity" data-activity="compare" id="${id}">${head()}
        <div class="compare-grid">${cards}</div>
        <div class="activity-feedback" data-fb></div></div>`;
    }
    return "";
  }
  const activityIcon = (t) =>
    ({ choice: "target", match: "layers", order: "grip", hotspot: "eye", calculator: "calc", compare: "chart" }[t] || "hand");

  /* ---------- quiz ---------- */
  function renderQuiz(w) {
    const qs = w.quiz
      .map(
        (q, qi) => `<div class="activity" data-quiz-q="${qi}">
        <div class="activity-head"><span class="ico">${Icon("checkCircle")}</span>
          <div><h3>سؤال ${AR(qi + 1)}</h3><span class="q">${q.q}</span></div></div>
        <div class="choices">${q.options
          .map(
            (o, oi) => `<button class="choice" data-oi="${oi}">
              <span class="letter">${"أبجد"[oi]}</span><span class="ct"><b>${o}</b></span>
              <span class="mark">${Icon("checkCircle")}</span></button>`
          )
          .join("")}</div></div>`
      )
      .join("");
    return `<div id="quizWrap">${qs}
      <div class="quiz-score" data-score>
        <svg class="qs-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,.1)" stroke-width="10"/>
          <circle data-ring cx="60" cy="60" r="52" fill="none" stroke="url(#qg)" stroke-width="10" stroke-linecap="round" stroke-dasharray="327" stroke-dashoffset="327" transform="rotate(-90 60 60)"/>
          <defs><linearGradient id="qg"><stop offset="0" stop-color="#7cae4e"/><stop offset="1" stop-color="#e0b04a"/></linearGradient></defs>
          <text data-scoretxt x="60" y="68" text-anchor="middle" font-size="30" fill="#f4ecdb" font-family="Reem Kufi">0</text></svg>
        <h3 data-scoreh>أحسنت!</h3><p data-scorep></p></div></div>`;
  }

  /* ============================ ACTIVITY BINDINGS ============================ */
  function bindActivities(root) {
    // choice
    $$('[data-activity="choice"]', root).forEach((box) => {
      const fb = $("[data-explain]", box);
      $$(".choice", box).forEach((c) =>
        c.addEventListener("click", () => {
          if (box.dataset.done) return;
          const ok = c.dataset.correct === "true";
          c.classList.add(ok ? "correct" : "wrong");
          if (ok) {
            box.dataset.done = "1";
            $$(".choice", box).forEach((x) => x.classList.add("locked"));
            fb.className = "activity-feedback show good";
            fb.innerHTML = Icon("checkCircle") + " " + fb.textContent;
            markProgress();
          } else {
            fb.className = "activity-feedback show bad";
            fb.textContent = "ليست الإجابة المثلى — جرّب مرة أخرى.";
          }
        })
      );
    });

    // match
    $$('[data-activity="match"]', root).forEach((box) => {
      const pairs = JSON.parse(box.dataset.pairs);
      const fb = $("[data-fb]", box);
      let sel = null, solved = 0;
      const total = Object.keys(pairs).length;
      $$(".match-item", box).forEach((it) =>
        it.addEventListener("click", () => {
          if (it.classList.contains("done")) return;
          if (!sel) {
            $$(".match-item.sel", box).forEach((x) => x.classList.remove("sel"));
            sel = it; it.classList.add("sel"); return;
          }
          if (sel === it) { it.classList.remove("sel"); sel = null; return; }
          if (sel.dataset.side === it.dataset.side) { sel.classList.remove("sel"); sel = it; it.classList.add("sel"); return; }
          const L = sel.dataset.side === "L" ? sel : it;
          const R = sel.dataset.side === "R" ? sel : it;
          if (pairs[L.dataset.id] === R.dataset.id) {
            L.classList.add("done"); R.classList.add("done");
            L.classList.remove("sel"); R.classList.remove("sel"); solved++;
            if (solved === total) {
              fb.className = "activity-feedback show good";
              fb.innerHTML = Icon("checkCircle") + " ممتاز! طابقت كلّ الأدوات مع وظائفها.";
              markProgress();
            }
          } else {
            L.classList.add("wrong"); R.classList.add("wrong");
            setTimeout(() => { L.classList.remove("wrong", "sel"); R.classList.remove("wrong", "sel"); }, 550);
            fb.className = "activity-feedback show bad";
            fb.textContent = "غير مطابق — حاول مرة أخرى.";
          }
          sel = null;
        })
      );
    });

    // order (drag + arrows)
    $$('[data-activity="order"]', root).forEach((box) => {
      const list = $(".order-list", box);
      const correct = JSON.parse(box.dataset.correct);
      const fb = $("[data-fb]", box);
      const renumber = () => $$(".order-item", list).forEach((it, i) => ($(".order-num", it).textContent = AR(i + 1)));
      renumber();
      let dragging = null;
      $$(".order-item", list).forEach((it) => {
        it.addEventListener("dragstart", () => { dragging = it; it.classList.add("dragging"); });
        it.addEventListener("dragend", () => { it.classList.remove("dragging"); $$(".order-item", list).forEach((x) => x.classList.remove("over")); renumber(); });
        it.addEventListener("dragover", (e) => {
          e.preventDefault();
          const after = e.clientY;
          const r = it.getBoundingClientRect();
          it.classList.add("over");
          if (dragging && dragging !== it) {
            if (after < r.top + r.height / 2) list.insertBefore(dragging, it);
            else list.insertBefore(dragging, it.nextSibling);
          }
        });
        it.addEventListener("dragleave", () => it.classList.remove("over"));
        $("[data-up]", it).addEventListener("click", () => { const p = it.previousElementSibling; if (p) list.insertBefore(it, p); renumber(); });
        $("[data-down]", it).addEventListener("click", () => { const nx = it.nextElementSibling; if (nx) list.insertBefore(nx, it); renumber(); });
      });
      $("[data-check]", box).addEventListener("click", () => {
        const cur = $$(".order-item", list).map((x) => x.dataset.step);
        const ok = cur.every((s, i) => s === correct[i]);
        if (ok) {
          $$(".order-item", list).forEach((x) => x.classList.add("ok"));
          fb.className = "activity-feedback show good";
          fb.innerHTML = Icon("checkCircle") + " ترتيب صحيح تماماً!";
          markProgress();
        } else {
          fb.className = "activity-feedback show bad";
          fb.textContent = "الترتيب غير صحيح بعد — أعِد ترتيب الخطوات.";
        }
      });
    });

    // hotspot
    $$('[data-activity="hotspot"]', root).forEach((box) => {
      const spots = $$(".hotspot", box);
      const done = new Set();
      const badge = $("[data-hsdone]", box);
      let openTip = null;
      spots.forEach((sp) => {
        sp.addEventListener("click", () => {
          const i = sp.dataset.i;
          const tip = $(`[data-tip="${i}"]`, box);
          if (openTip && openTip !== tip) openTip.classList.remove("show");
          tip.classList.toggle("show");
          openTip = tip.classList.contains("show") ? tip : null;
          done.add(i);
          if (done.size === spots.length) { badge.style.display = "inline-flex"; markProgress(); }
        });
      });
    });

    // compare
    $$('[data-activity="compare"]', root).forEach((box) => {
      const cards = $$(".crop-card", box);
      const fb = $("[data-fb]", box);
      const max = Math.max(...cards.map((c) => +c.dataset.roi));
      const seen = new Set();
      cards.forEach((c) =>
        c.addEventListener("click", () => {
          if (c.classList.contains("revealed")) return;
          c.classList.add("revealed");
          const roi = +c.dataset.roi;
          $(".roi", c).textContent = "عائد ~" + AR(roi) + "٪";
          $(".crop-bar span", c).style.width = (roi / max) * 100 + "%";
          seen.add(c);
          if (seen.size === cards.length) {
            cards.forEach((x) => { if (+x.dataset.roi === max) x.classList.add("best"); });
            fb.className = "activity-feedback show good";
            fb.innerHTML = Icon("checkCircle") + " المحصول ذو الشريط الأطول يعطي أعلى عائد على الاستثمار — انتبه دائماً للعائد لا للحجم فقط!";
            markProgress();
          }
        })
      );
    });

    // calculator
    $$('[data-calc]', root).forEach(bindCalculator);
  }

  /* ============================ QUIZ BINDING ============================ */
  function bindQuiz(root, w) {
    const wrap = $("#quizWrap", root);
    if (!wrap) return;
    const total = w.quiz.length;
    let answered = 0, correct = 0;
    $$("[data-quiz-q]", wrap).forEach((qbox) => {
      const qi = +qbox.dataset.quizQ;
      const ans = w.quiz[qi].answer;
      $$(".choice", qbox).forEach((c) =>
        c.addEventListener("click", () => {
          if (qbox.dataset.done) return;
          qbox.dataset.done = "1";
          const oi = +c.dataset.oi;
          const ok = oi === ans;
          if (ok) correct++;
          c.classList.add(ok ? "correct" : "wrong");
          if (!ok) $(`.choice[data-oi="${ans}"]`, qbox).classList.add("correct");
          $$(".choice", qbox).forEach((x) => x.classList.add("locked"));
          answered++;
          if (answered === total) showScore(wrap, correct, total);
        })
      );
    });
  }
  function showScore(wrap, correct, total) {
    const box = $("[data-score]", wrap);
    box.classList.add("show");
    const pct = correct / total;
    const ring = $("[data-ring]", box);
    const txt = $("[data-scoretxt]", box);
    const h = $("[data-scoreh]", box);
    const p = $("[data-scorep]", box);
    p.textContent = `أجبت ${AR(correct)} من ${AR(total)} إجابات صحيحة.`;
    h.textContent = pct === 1 ? "علامة كاملة! 🌟" : pct >= 0.5 ? "أحسنت! 👏" : "واصل التعلّم 🌱";
    markProgress();
    const target = 327 - 327 * pct;
    let cur = 0;
    const step = () => {
      cur += (pct * total) / 24;
      txt.textContent = AR(Math.min(correct, Math.round(cur)));
      const off = 327 - 327 * Math.min(pct, cur / total);
      ring.style.strokeDashoffset = off;
      if (Math.round(cur) < correct) requestAnimationFrame(step);
      else { txt.textContent = AR(correct); ring.style.strokeDashoffset = target; }
    };
    if (REDUCED) { txt.textContent = AR(correct); ring.style.strokeDashoffset = target; }
    else step();
    box.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth", block: "center" });
  }

  /* ============================ PROFIT CALCULATOR ============================ */
  function renderCalculator(a, id) {
    const f = (name, label, val, unit = "", cur = "درهم") =>
      `<div class="field"><label>${label} ${unit ? `<span class="unit">${unit}</span>` : ""}</label>
        <div class="field-input"><input type="number" min="0" data-f="${name}" value="${val}"/>${cur ? `<span class="cur">${cur}</span>` : ""}</div></div>`;
    const crops = ["طماطم", "نعناع", "خيار", "فلفل", "أخرى"];
    return `<div class="activity" data-activity="calculator" id="${id}">
      <div class="activity-head"><span class="ico">${Icon("calc")}</span><div><h3>${a.title}</h3><span class="q">${a.prompt}</span></div></div>
      <div class="calc" data-calc>
        <div class="calc-grid">
          <div class="calc-fields">
            <div class="field"><label>المحصول</label>
              <div class="field-input"><select data-f="crop">${crops.map((c) => `<option>${c}</option>`).join("")}</select></div></div>
            <div class="field-row">${f("plants", "عدد النباتات", 100, "", "")}${f("yield", "الإنتاج لكل نبتة", 3, "كجم", "")}</div>
            <div class="field-row">${f("price", "سعر البيع", 8, "للكجم")}</div>
            <div class="calc-cost-title">${Icon("coins")} التكاليف لكل نبتة</div>
            <div class="field-row">${f("seedling", "الشتلة", 2)}${f("soil", "التربة", 1)}</div>
            <div class="field-row">${f("water", "المياه", 1)}${f("fertilizer", "السماد", 1)}</div>
            <div class="calc-cost-title">${Icon("briefcase")} تكاليف عامة للمشروع</div>
            <div class="field-row">${f("equipment", "المعدّات", 150)}${f("labor", "العمالة", 100)}</div>
            <div class="field-row">${f("other", "مصاريف أخرى", 50)}</div>
          </div>
          <div class="calc-results">
            <div class="result-hero" data-rhero>
              <div class="rh-label">صافي الربح</div>
              <div class="rh-value"><span data-net>0</span><span class="cur">درهم</span></div>
              <div class="rh-sub" data-netsub></div>
            </div>
            <div class="result-cards">
              <div class="rcard"><div class="rc-label">${Icon("coins")} إجمالي التكاليف</div><div class="rc-value" data-cost>0</div><span class="rc-unit">درهم</span></div>
              <div class="rcard"><div class="rc-label">${Icon("chart")} إجمالي الإيرادات</div><div class="rc-value up" data-rev>0</div><span class="rc-unit">درهم</span></div>
              <div class="rcard"><div class="rc-label">${Icon("sprout")} ربح كل نبتة</div><div class="rc-value" data-pp>0</div><span class="rc-unit">درهم / نبتة</span></div>
              <div class="rcard"><div class="rc-label">${Icon("target")} هامش الربح</div><div class="rc-value" data-margin>0</div><span class="rc-unit">٪</span></div>
            </div>
            <div class="calc-viz">
              <div class="viz-bar"><div class="vb-top"><span class="vb-name">التكاليف</span><span class="vb-val" data-vcost>0</span></div><div class="viz-track"><div class="viz-fill cost" data-fcost></div></div></div>
              <div class="viz-bar"><div class="vb-top"><span class="vb-name">الإيرادات</span><span class="vb-val" data-vrev>0</span></div><div class="viz-track"><div class="viz-fill rev" data-frev></div></div></div>
              <div class="rcard" style="margin-top:6px"><div class="rc-label">${Icon("shield")} نقطة التعادل &nbsp;·&nbsp; ${Icon("coins")} العائد على الاستثمار</div>
                <div style="display:flex;gap:18px;margin-top:4px"><div><b class="rc-value" data-be style="font-size:19px">0</b> <span class="rc-unit">نبتة</span></div>
                <div><b class="rc-value up" data-roi style="font-size:19px">0</b> <span class="rc-unit">٪ ROI</span></div></div></div>
            </div>
          </div>
        </div>
      </div></div>`;
  }

  function bindCalculator(calc) {
    const get = (n) => parseFloat($(`[data-f="${n}"]`, calc)?.value) || 0;
    const el = (s) => $(s, calc);
    let firstDone = false;
    const anim = (node, to, suffix = "") => {
      if (REDUCED) { node.textContent = AR(to) + suffix; return; }
      const from = parseFloat((node.textContent || "0").replace(/[^\d.-]/g, "").replace(/[٠-٩]/g, (d)=>"٠١٢٣٤٥٦٧٨٩".indexOf(d))) || 0;
      const start = performance.now(), dur = 650;
      const tick = (t) => {
        const k = clamp((t - start) / dur, 0, 1);
        const e = 1 - Math.pow(1 - k, 3);
        node.textContent = AR(from + (to - from) * e) + suffix;
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };
    function compute() {
      const plants = get("plants"), yld = get("yield"), price = get("price");
      const perPlant = get("seedling") + get("soil") + get("water") + get("fertilizer");
      const overhead = get("equipment") + get("labor") + get("other");
      const totalCost = perPlant * plants + overhead;
      const totalRev = plants * yld * price;
      const net = totalRev - totalCost;
      const pp = plants ? net / plants : 0;
      const margin = totalRev ? (net / totalRev) * 100 : 0;
      const roi = totalCost ? (net / totalCost) * 100 : 0;
      const unitRev = yld * price;
      const be = unitRev - perPlant > 0 ? Math.ceil(overhead / (unitRev - perPlant)) : 0;

      anim(el("[data-net]"), net);
      anim(el("[data-cost]"), totalCost);
      anim(el("[data-rev]"), totalRev);
      anim(el("[data-pp]"), pp);
      anim(el("[data-margin]"), Math.round(margin));
      anim(el("[data-be]"), be);
      anim(el("[data-roi]"), Math.round(roi));
      el("[data-vcost]").textContent = AR(totalCost);
      el("[data-vrev]").textContent = AR(totalRev);
      const mx = Math.max(totalCost, totalRev, 1);
      el("[data-fcost]").style.width = (totalCost / mx) * 100 + "%";
      el("[data-frev]").style.width = (totalRev / mx) * 100 + "%";

      const hero = el("[data-rhero]");
      hero.classList.toggle("loss", net < 0);
      el("[data-netsub]").textContent =
        net >= 0 ? "مشروع رابح — واصل! 🌱" : "خسارة — قلّل التكاليف أو ارفع الإنتاج.";
      const ppn = el("[data-pp]"); ppn.classList.toggle("up", pp >= 0); ppn.classList.toggle("down", pp < 0);
      const mn = el("[data-margin]"); mn.classList.toggle("up", margin >= 0); mn.classList.toggle("down", margin < 0);
      if (!firstDone) { firstDone = true; markProgress(); }
    }
    $$("input,select", calc).forEach((i) => { i.addEventListener("input", compute); i.addEventListener("change", compute); });
    compute();
  }

  /* ============================ PROGRESS ============================ */
  let progressCount = 0, progressTotal = 1;
  function resetProgress(w) {
    progressCount = 0;
    // countable checkpoints: activities + quiz(1)
    progressTotal = (w.activities?.length || 0) + 1;
  }
  function markProgress() {
    progressCount++;
    const pct = Math.min(100, (progressCount / progressTotal) * 100);
    const bar = $("#wsProgress");
    if (bar) bar.style.width = pct + "%";
    if (pct >= 100) {
      const c = $("[data-complete]", viewInner);
      if (c && !c.dataset.celebrated) { c.dataset.celebrated = "1"; confetti(); toast("أكملت كل الأنشطة! 🌳"); }
    }
  }

  /* ============================ OPEN / CLOSE ============================ */
  function openWorkshop(id) {
    const w = D.workshops.find((x) => x.id === id);
    if (!w) return;
    resetProgress(w);
    renderWorkshop(w);
    $("#wsProgress").style.width = "0%";
    document.body.style.overflow = "hidden";
    view.classList.add("open");
    view.scrollTop = 0;
    if (location.hash !== "#/ws/" + id) history.pushState({ ws: id }, "", "#/ws/" + id);
    view.setAttribute("aria-hidden", "false");
  }
  function closeWorkshop(push = true) {
    view.classList.remove("open");
    document.body.style.overflow = "";
    view.setAttribute("aria-hidden", "true");
    if (push && location.hash.startsWith("#/ws/")) history.pushState({}, "", "#library");
    setTimeout(() => { if (!view.classList.contains("open")) viewInner.innerHTML = ""; }, 500);
  }

  // view scroll → progress bar reflects reading position too (min with checkpoints)
  view.addEventListener("scroll", () => {
    const max = view.scrollHeight - view.clientHeight;
    const readPct = max > 0 ? (view.scrollTop / max) * 100 : 0;
    const bar = $("#wsProgress");
    if (bar) {
      const check = Math.min(100, (progressCount / progressTotal) * 100);
      bar.style.width = Math.max(check, readPct * 0.6) + "%";
    }
  });

  function routeFromHash() {
    const m = location.hash.match(/^#\/ws\/(.+)$/);
    if (m) openWorkshop(m[1]);
    else if (view.classList.contains("open")) closeWorkshop(false);
  }
  addEventListener("popstate", routeFromHash);

  /* ============================ FX: confetti + toast ============================ */
  function confetti() {
    if (REDUCED) return;
    const colors = ["#e0b04a", "#7cae4e", "#2f8fb8", "#f0c869", "#4f8433"];
    const cv = document.createElement("canvas");
    cv.style.cssText = "position:fixed;inset:0;z-index:800;pointer-events:none";
    document.body.appendChild(cv);
    const ctx = cv.getContext("2d");
    cv.width = innerWidth; cv.height = innerHeight;
    const P = Array.from({ length: 120 }, () => ({
      x: innerWidth / 2, y: innerHeight * 0.4,
      vx: (Math.random() - 0.5) * 14, vy: Math.random() * -14 - 4,
      r: Math.random() * 7 + 3, c: colors[(Math.random() * colors.length) | 0],
      rot: Math.random() * 6, vr: (Math.random() - 0.5) * 0.4,
    }));
    let t = 0;
    (function run() {
      ctx.clearRect(0, 0, cv.width, cv.height);
      P.forEach((p) => {
        p.vy += 0.4; p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.vx *= 0.99;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        ctx.fillStyle = p.c; ctx.fillRect(-p.r / 2, -p.r / 2, p.r, p.r * 0.6); ctx.restore();
      });
      t++;
      if (t < 130) requestAnimationFrame(run); else cv.remove();
    })();
  }
  let toastT;
  function toast(msg) {
    let el = $("#toast");
    if (!el) { el = document.createElement("div"); el.id = "toast"; el.className = "toast"; document.body.appendChild(el); }
    el.innerHTML = Icon("checkCircle") + `<span>${msg}</span>`;
    el.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(() => el.classList.remove("show"), 3200);
  }

  /* ============================ HELPERS ============================ */
  function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }

  /* a pruning-lesson tree drawing (used by hotspot activity) */
  function pruneTree() {
    return `<rect width="800" height="600" fill="#dfe9cf"/>
      <rect width="800" height="600" fill="url(#pg)"/>
      <defs><linearGradient id="pg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#cfe3ea"/><stop offset="1" stop-color="#e6e0c2"/></linearGradient></defs>
      <path d="M380 560 Q 400 380 400 300" stroke="#6b4423" stroke-width="34" fill="none" stroke-linecap="round"/>
      <path d="M400 340 Q 300 300 230 220" stroke="#6b4423" stroke-width="20" fill="none" stroke-linecap="round"/>
      <path d="M400 320 Q 520 300 620 260" stroke="#6b4423" stroke-width="22" fill="none" stroke-linecap="round"/>
      <path d="M400 300 Q 420 220 400 170" stroke="#6b4423" stroke-width="16" fill="none" stroke-linecap="round"/>
      <path d="M545 320 q 40 -6 70 -30" stroke="#8a7355" stroke-width="7" fill="none" stroke-linecap="round" stroke-dasharray="3 6"/>
      <g fill="#4f8433"><circle cx="230" cy="210" r="46"/><circle cx="620" cy="250" r="52"/><circle cx="400" cy="160" r="48"/><circle cx="510" cy="230" r="34"/></g>
      <g fill="#68a544" opacity=".85"><circle cx="250" cy="185" r="26"/><circle cx="640" cy="225" r="30"/><circle cx="420" cy="140" r="26"/></g>
      <g fill="#e0b04a"><circle cx="230" cy="220" r="7"/><circle cx="612" cy="260" r="7"/><circle cx="405" cy="175" r="7"/><circle cx="640" cy="240" r="7"/></g>`;
  }

  /* ============================ NAV / SMOOTH ANCHORS ============================ */
  function initNav() {
    const nav = $("#nav"), burger = $("#burger"), links = $("#navLinks");
    burger?.addEventListener("click", () => links.classList.toggle("open"));
    $$("#navLinks a, [data-jump]").forEach((a) =>
      a.addEventListener("click", (e) => {
        const href = a.getAttribute("href") || a.dataset.jump;
        if (href && href.startsWith("#") && $(href)) {
          e.preventDefault();
          links.classList.remove("open");
          $(href).scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
        }
      })
    );
  }

  /* ============================ INIT ============================ */
  function init() {
    buildStory();
    buildLibrary();
    indexScenes();
    initNav();
    dust();
    observeReveals(document);
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", () => { indexScenes(); update(); }, { passive: true });
    update();

    $("[data-start]")?.addEventListener("click", () => {
      const t = $("#story");
      t?.scrollIntoView({ behavior: REDUCED ? "auto" : "smooth" });
    });

    routeFromHash();

    // hide veil
    requestAnimationFrame(() => setTimeout(() => $("#veil")?.classList.add("gone"), 350));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  // expose prune scene to scenes registry for hotspot cover fallback
  S.prune = pruneTree;
})();
