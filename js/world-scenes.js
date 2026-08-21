/* =============================================================================
   سفراء الزراعة الشباب — رسوم المشاهد  ·  scene artwork
   -----------------------------------------------------------------------------
   كل مشهد = عدة طبقات SVG على أعماق مختلفة (z). الكاميرا تمرّ *بين* الطبقات،
   فتكبر الطبقات القريبة وتختفي، وتبقى الطبقة الداخلية — وهذا ما يعطي إحساس
   الدخول إلى داخل المشهد بدل تكبير صورة مسطّحة.

   Each scene is a stack of SVG layers at different depths (z). The camera passes
   *between* them: near layers swell and fade as it goes through, leaving the
   interior — which is what makes it read as flying inside, not zooming a flat image.

   Layer depth convention (relative to the scene, +z = nearer the viewer):
      +760  shell   ← what you fly THROUGH (doorway, arch, awning, fronds)
      +380  near    ← foreground props
         0  core    ← the interior: the subject of the scene
      -420  mid     ← what's behind the subject
      -980  far     ← sky / horizon
   ========================================================================== */

window.WORLD_SCENES = (function () {
  'use strict';

  const W = 1600, H = 900;                       // مساحة رسم كل طبقة · per-layer canvas

  /* ---- أدوات رسم مشتركة · shared drawing helpers ------------------------- */

  const rnd = (seed) => {                        // عشوائية ثابتة · deterministic RNG
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  };

  /** نخلة · a palm tree */
  function palm(x, y, s, trunk = '#8A6A45', frond = '#2E8C5C', frond2 = '#4FBF83') {
    const f = (a, len, curve, c) =>
      `<path d="M0 0 Q ${Math.cos(a) * len * .5} ${Math.sin(a) * len * .5 - curve} ${Math.cos(a) * len} ${Math.sin(a) * len}
                Q ${Math.cos(a) * len * .55} ${Math.sin(a) * len * .55 - curve - 16} 0 0 Z" fill="${c}"/>`;
    let fronds = '';
    for (let i = 0; i < 7; i++) {
      const a = Math.PI + (i / 6) * Math.PI;
      fronds += f(a, 66, 26, i % 2 ? frond2 : frond);
    }
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-7 0 Q -3 -60 -9 -122 L 9 -122 Q 5 -60 7 0 Z" fill="${trunk}"/>
      <g transform="translate(0 -124)">${fronds}
        <circle r="7" fill="#7A5B3B"/></g></g>`;
  }

  /** شخصية بالكندورة أو العباية · a kandura / abaya figure */
  function person(x, y, s, robe = '#FFFFFF', head = '#E9B44C', female = false) {
    const cover = female
      ? `<path d="M-15 -46 q15 -20 30 0 q2 26 -15 34 q-17 -8 -15 -34 Z" fill="${head}"/>`
      : `<path d="M-16 -47 q16 -16 32 0 q0 12 -16 12 q-16 0 -16 -12 Z" fill="${head}"/>
         <path d="M-16 -47 q16 -16 32 0 l3 8 q-19 -10 -38 0 Z" fill="#000" opacity=".08"/>`;
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cy="2" rx="20" ry="5" fill="#000" opacity=".13"/>
      <path d="M-17 0 q3 -44 17 -46 q14 2 17 46 Z" fill="${robe}"/>
      <path d="M0 -46 q14 2 17 46 l-8 0 q-2 -38 -9 -46 Z" fill="#000" opacity=".07"/>
      <circle cy="-52" r="11" fill="#C98A5E"/>${cover}</g>`;
  }

  /** صندوق محصول · a produce crate */
  function crate(x, y, s, wood = '#C98A55', crop = '#4FBF83') {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-34" y="-30" width="68" height="30" rx="4" fill="${wood}"/>
      <rect x="-34" y="-30" width="68" height="30" rx="4" fill="#000" opacity=".08"/>
      <rect x="-30" y="-26" width="60" height="6" rx="3" fill="#E3B583"/>
      <rect x="-30" y="-14" width="60" height="6" rx="3" fill="#E3B583"/>
      <circle cx="-16" cy="-34" r="10" fill="${crop}"/>
      <circle cx="2"   cy="-37" r="11" fill="${crop}"/>
      <circle cx="20"  cy="-34" r="10" fill="${crop}"/>
      <circle cx="-6"  cy="-31" r="9"  fill="#6FD09A"/></g>`;
  }

  /** عمود حسّاس ذكي · an IoT sensor post */
  function sensorPost(x, y, s, accent = '#35A0C4') {
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <ellipse cy="2" rx="14" ry="4" fill="#000" opacity=".15"/>
      <rect x="-3" y="-86" width="6" height="86" rx="3" fill="#8F98B5"/>
      <rect x="-20" y="-118" width="40" height="30" rx="7" fill="#F7FAFF" stroke="#C9D2E8" stroke-width="2"/>
      <rect x="-13" y="-111" width="26" height="6" rx="3" fill="${accent}"/>
      <rect x="-13" y="-101" width="17" height="5" rx="2.5" fill="#C9D2E8"/>
      <circle cx="0" cy="-124" r="4" fill="${accent}"/>
      <path d="M-12 -132 a17 17 0 0 1 24 0" stroke="${accent}" stroke-width="3" fill="none" opacity=".65"/>
      <path d="M-20 -141 a29 29 0 0 1 40 0" stroke="${accent}" stroke-width="3" fill="none" opacity=".35"/></g>`;
  }

  /** بطاقة بيانات عائمة · a floating data card */
  function dataCard(x, y, s, title, accent, bars = [.9, .55, .7]) {
    const b = bars.map((v, i) =>
      `<rect x="${-40 + i * 28}" y="${18 - 34 * v}" width="18" height="${34 * v}" rx="4" fill="${accent}" opacity="${.55 + i * .18}"/>`
    ).join('');
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <rect x="-62" y="-52" width="124" height="88" rx="16" fill="#fff" opacity=".95"/>
      <rect x="-62" y="-52" width="124" height="88" rx="16" fill="none" stroke="${accent}" stroke-width="2" opacity=".35"/>
      <rect x="-46" y="-38" width="${title}" height="8" rx="4" fill="${accent}" opacity=".8"/>
      <rect x="-46" y="-24" width="40" height="6" rx="3" fill="#C9D2E8"/>${b}</g>`;
  }

  /** كثبان رملية · a run of dunes */
  function dunes(y, fill, amp = 70, seed = 7, op = 1) {
    const r = rnd(seed);
    let d = `M-200 ${H} L-200 ${y}`;
    for (let x = -200; x <= W + 200; x += 220) {
      d += ` Q ${x + 110} ${y - amp * (.5 + r())} ${x + 220} ${y - amp * .25 * r()}`;
    }
    return `<path d="${d} L${W + 200} ${H} Z" fill="${fill}" opacity="${op}"/>`;
  }

  /** صفوف محصول بمنظور · perspective crop rows */
  function cropRows(cx, baseY, rows, accent) {
    let out = '';
    for (let i = 0; i < rows; i++) {
      const t = i / (rows - 1), y = baseY - t * 132, w = 820 - t * 560, h = 24 - t * 14;
      out += `<rect x="${cx - w / 2}" y="${y}" width="${w}" height="${h}" rx="${h / 2}"
                fill="${i % 2 ? accent : '#3FB37A'}" opacity="${.95 - t * .35}"/>`;
      const dots = Math.round(9 - t * 5);
      for (let k = 0; k < dots; k++) {
        out += `<circle cx="${cx - w / 2 + (w / (dots - 1)) * k}" cy="${y + h / 2}" r="${9 - t * 5}"
                 fill="#67D69C" opacity="${.9 - t * .4}"/>`;
      }
    }
    return out;
  }

  const shadow = (cx, cy, rx, ry, op = .16) =>
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="#000" opacity="${op}"/>`;

  /** لوح الديوراما · the diorama slab every interior sits on */
  function slab(cx, cy, rx, top, side) {
    return `<g><ellipse cx="${cx}" cy="${cy + 46}" rx="${rx}" ry="${rx * .19}" fill="#000" opacity=".12"/>
      <path d="M${cx - rx} ${cy} a${rx} ${rx * .22} 0 0 0 ${rx * 2} 0 l0 44 a${rx} ${rx * .22} 0 0 1 ${-rx * 2} 0 Z" fill="${side}"/>
      <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${rx * .22}" fill="${top}"/></g>`;
  }

  /* ---- التعريفات المشتركة (تُحقن مرة واحدة) · shared defs, injected once -- */
  const DEFS = `
    <linearGradient id="gDawn"  x1="0" y1="0" x2="0" y2="1">
      <stop offset="0"   stop-color="#8FB6E8"/><stop offset=".45" stop-color="#F6D9A8"/>
      <stop offset="1"   stop-color="#F3BE86"/></linearGradient>
    <linearGradient id="gDay"   x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#7FB4E4"/><stop offset="1" stop-color="#D9EEF6"/></linearGradient>
    <linearGradient id="gGrow"  x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#CFEBD4"/><stop offset="1" stop-color="#F0F7E4"/></linearGradient>
    <linearGradient id="gDusk"  x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#4C5AA0"/><stop offset=".5" stop-color="#E8935C"/>
      <stop offset="1" stop-color="#F5C98E"/></linearGradient>
    <linearGradient id="gNight" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#0D1330"/><stop offset="1" stop-color="#2A3570"/></linearGradient>
    <linearGradient id="gWater" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#8FDDEE"/><stop offset="1" stop-color="#2E8FB5"/></linearGradient>
    <linearGradient id="gGlass" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity=".55"/>
      <stop offset="1" stop-color="#BFE6D6" stop-opacity=".25"/></linearGradient>
    <radialGradient id="gSun"><stop offset="0" stop-color="#FFF3D0"/>
      <stop offset="1" stop-color="#FFD37E" stop-opacity="0"/></radialGradient>
    <radialGradient id="gGlow"><stop offset="0" stop-color="#8FC46B" stop-opacity=".85"/>
      <stop offset="1" stop-color="#8FC46B" stop-opacity="0"/></radialGradient>
    <linearGradient id="gFadeX" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="#fff" stop-opacity="0"/>
      <stop offset=".28" stop-color="#fff" stop-opacity="1"/>
      <stop offset=".72" stop-color="#fff" stop-opacity="1"/>
      <stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
    <mask id="mGround" maskUnits="userSpaceOnUse" x="-300" y="-300" width="2200" height="1500">
      <rect x="-300" y="-300" width="2200" height="1500" fill="url(#gFadeX)"/></mask>`;

  /* ========================================================================
     المشهد ١ — البذرة · Scene 1 — the seed
     ===================================================================== */
  function seedScene() {
    const r = rnd(11);
    let stars = '';
    for (let i = 0; i < 26; i++) stars += `<circle cx="${r() * W}" cy="${r() * 220}" r="${r() * 1.6 + .6}" fill="#fff" opacity="${.25 + r() * .4}"/>`;

    const far = `${stars}
      <circle cx="1150" cy="330" r="230" fill="url(#gSun)"/>
      <circle cx="1150" cy="330" r="62" fill="#FFE9B8"/>
      ${dunes(560, '#E7C9A0', 60, 3, .75)}`;

    const mid = `${dunes(620, '#DFB98A', 80, 9)}
      ${palm(210, 660, .78)}${palm(300, 676, .6)}${palm(1420, 656, .72)}
      ${dunes(720, '#D4A876', 60, 21)}`;

    const core = `
      ${slab(800, 700, 380, '#EBD3A8', '#C79E6B')}
      <path d="M470 706 q160 -22 320 -6 q170 16 330 -4" stroke="#9FD8E8" stroke-width="16"
            fill="none" stroke-linecap="round" opacity=".9"/>
      <path d="M470 706 q160 -22 320 -6 q170 16 330 -4" stroke="#fff" stroke-width="5"
            fill="none" stroke-linecap="round" opacity=".5"/>
      ${shadow(800, 690, 62, 13, .18)}
      <g transform="translate(800 686)">
        <path d="M-4 0 q-2 -46 2 -78" stroke="#5E8F3E" stroke-width="9" fill="none" stroke-linecap="round"/>
        <path d="M-2 -52 q-52 -14 -62 -54 q48 -6 64 44 Z" fill="#8FC46B"/>
        <path d="M0 -66 q50 -18 62 -58 q-48 -4 -64 48 Z" fill="#2FA36B"/>
        <path d="M-1 -30 q-40 -8 -50 -40 q38 -4 52 34 Z" fill="#6FB84F" opacity=".9"/>
        <ellipse cy="4" rx="46" ry="10" fill="#8B6A45" opacity=".35"/></g>
      ${person(614, 704, .95, '#FFFFFF', '#E9B44C')}
      ${person(982, 706, .95, '#2A3570', '#5171FF', true)}
      <circle cx="800" cy="640" r="150" fill="url(#gGlow)" opacity=".5"/>`;

    const near = `${dunes(830, '#B98A5C', 46, 33)}
      <g opacity=".9">
        <path d="M120 900 q22 -70 8 -120 q34 54 30 120 Z" fill="#9E7448"/>
        <path d="M1480 900 q-24 -80 -6 -132 q-36 60 -30 132 Z" fill="#9E7448"/></g>`;

    const shell = `<g opacity=".92">
      ${palm(-60, 940, 2.5, '#6B4F33', '#1E5E3E', '#2E8C5C')}
      ${palm(1680, 980, 2.7, '#6B4F33', '#1E5E3E', '#2E8C5C')}</g>`;

    return [
      { z: -980, svg: far }, { z: -420, svg: mid }, { z: 0, svg: core },
      { z: 380, svg: near }, { z: 760, svg: shell },
    ];
  }

  /* ========================================================================
     المشهد ٢ — المشتل · Scene 2 — the nursery
     ===================================================================== */
  function nurseryScene() {
    const far = `<circle cx="380" cy="250" r="180" fill="#fff" opacity=".45"/>
      <circle cx="470" cy="290" r="120" fill="#fff" opacity=".35"/>
      <path d="M0 640 q300 -90 640 -20 q380 78 960 -30 L${W} ${H} L0 ${H} Z" fill="#CBE3B8"/>`;

    // الجدار الخلفي بألواح زجاجية · the glass back wall
    let panes = '';
    for (let i = 0; i < 8; i++)
      for (let j = 0; j < 3; j++)
        panes += `<rect x="${300 + i * 125}" y="${250 + j * 118}" width="112" height="105" rx="7"
                   fill="url(#gGlass)" stroke="#9CC9AE" stroke-width="3"/>`;
    const mid = `<rect x="270" y="215" width="1060" height="430" rx="18" fill="#EAF6EA" opacity=".8"/>
      ${panes}
      <path d="M258 222 L800 96 L1342 222 Z" fill="#DDEFE0" stroke="#9CC9AE" stroke-width="4"/>
      <path d="M800 96 L800 222" stroke="#9CC9AE" stroke-width="4"/>
      <g fill="#2FA36B" opacity=".5">
        <circle cx="360" cy="600" r="22"/><circle cx="1240" cy="604" r="26"/></g>`;

    // مصاطب الشتلات · seedling benches
    const tray = (x, y, s, tone) => {
      let pots = '';
      for (let i = 0; i < 6; i++)
        for (let j = 0; j < 2; j++)
          pots += `<g transform="translate(${x - 130 + i * 52} ${y - 18 - j * 22})">
            <ellipse rx="17" ry="7" fill="#B4855A"/>
            <path d="M0 -4 q-1 -14 1 -22" stroke="#5E8F3E" stroke-width="4" fill="none" stroke-linecap="round"/>
            <path d="M0 -16 q-19 -5 -22 -20 q18 -2 23 16 Z" fill="${tone}"/>
            <path d="M1 -22 q18 -6 22 -21 q-18 -2 -23 17 Z" fill="#2FA36B"/></g>`;
      return `<g transform="translate(0 0) scale(${s})" transform-origin="${x}px ${y}px">
        ${shadow(x, y + 8, 150, 16, .13)}
        <rect x="${x - 150}" y="${y - 14}" width="300" height="20" rx="6" fill="#D8C29B"/>
        <rect x="${x - 138}" y="${y + 4}" width="14" height="54" rx="5" fill="#B99C74"/>
        <rect x="${x + 124}" y="${y + 4}" width="14" height="54" rx="5" fill="#B99C74"/>
        ${pots}</g>`;
    };

    const core = `${slab(800, 748, 420, '#E4EFD9', '#BFCDA9')}
      ${tray(430, 700, 1, '#8FC46B')}${tray(1180, 706, 1, '#A7D47C')}${tray(800, 776, 1.12, '#8FC46B')}
      ${person(566, 806, 1.2, '#FFFFFF', '#2FA36B')}
      ${person(1046, 810, 1.2, '#F2F6FF', '#5171FF', true)}
      <g opacity=".9">
        <path d="M540 130 L540 232" stroke="#B9C6D8" stroke-width="4"/>
        <path d="M508 232 h64 l-12 30 h-40 Z" fill="#FFE9B8"/>
        <path d="M1060 130 L1060 232" stroke="#B9C6D8" stroke-width="4"/>
        <path d="M1028 232 h64 l-12 30 h-40 Z" fill="#FFE9B8"/></g>
      ${dataCard(1330, 430, .95, 62, '#2FA36B', [.6, .85, .45])}`;

    const near = `${crate(230, 880, 1.25, '#C98A55', '#8FC46B')}
      ${crate(1400, 894, 1.3, '#B97C4C', '#6FD09A')}
      <rect x="-40" y="820" width="1680" height="120" fill="#D6C7A4" opacity=".55"/>`;

    // الواجهة التي نطير من بابها · the front wall we fly through
    let front = `<path d="M-160 ${H} L-160 300 L800 -30 L1760 300 L1760 ${H} Z" fill="#E7F3E7"/>
      <path d="M-160 300 L800 -30 L1760 300" fill="none" stroke="#9CC9AE" stroke-width="10"/>
      <path d="M560 ${H} L560 300 L800 190 L1040 300 L1040 ${H} Z" fill="#F8FBF6" opacity=".0"/>`;
    for (let i = 0; i < 4; i++) {
      front += `<rect x="${60 + i * 118}" y="${360 + i * 22}" width="104" height="${420 - i * 20}" rx="8"
                 fill="url(#gGlass)" stroke="#9CC9AE" stroke-width="4"/>`;
      front += `<rect x="${1436 - i * 118}" y="${360 + i * 22}" width="104" height="${420 - i * 20}" rx="8"
                 fill="url(#gGlass)" stroke="#9CC9AE" stroke-width="4"/>`;
    }
    front += `<path d="M556 ${H} L556 296 L800 186 L1044 296 L1044 ${H}" fill="none" stroke="#7FB48F" stroke-width="12" stroke-linejoin="round"/>`;

    return [
      { z: -980, svg: far }, { z: -420, svg: mid }, { z: 0, svg: core },
      { z: 380, svg: near }, { z: 760, svg: front },
    ];
  }

  /* ========================================================================
     المشهد ٣ — الفلج الذكي · Scene 3 — the smart falaj
     ===================================================================== */
  function falajScene() {
    const far = `<path d="M-100 520 L180 300 L360 430 L520 288 L760 500 L980 330 L1220 500 L1420 350 L1720 540 L1720 ${H} L-100 ${H} Z"
            fill="#9AA8C4" opacity=".55"/>
      <path d="M-100 560 L200 380 L430 520 L640 400 L900 570 L1180 420 L1450 570 L1720 470 L1720 ${H} L-100 ${H} Z"
            fill="#7E8DAE" opacity=".45"/>`;

    let grove = '';
    for (let i = 0; i < 9; i++) grove += palm(90 + i * 180, 600 + (i % 2) * 16, .62 + (i % 3) * .06);
    const mid = `<rect y="560" width="${W}" height="${H - 560}" fill="#E0CFA8"/>${grove}
      <rect y="600" width="${W}" height="26" fill="#C9B287" opacity=".6"/>`;

    // القناة تتّجه نحو الكاميرا · the channel running toward the camera
    const core = `${slab(800, 700, 430, '#E7D6AE', '#C2A473')}
      <path d="M700 560 L900 560 L1180 900 L420 900 Z" fill="#CBB68C"/>
      <path d="M726 566 L874 566 L1120 900 L480 900 Z" fill="url(#gWater)"/>
      <g opacity=".55" fill="#fff">
        <path d="M742 610 q60 -14 118 0 q-58 12 -118 0 Z"/>
        <path d="M712 700 q92 -18 180 0 q-90 16 -180 0 Z"/>
        <path d="M664 812 q140 -22 274 0 q-136 20 -274 0 Z"/></g>
      <path d="M700 560 L900 560 L1180 900" fill="none" stroke="#A98E63" stroke-width="10" stroke-linejoin="round"/>
      <path d="M700 560 L420 900" fill="none" stroke="#A98E63" stroke-width="10"/>
      ${sensorPost(1180, 706, 1.05)}${sensorPost(452, 700, .95)}
      ${dataCard(1300, 330, 1, 70, '#35A0C4', [.5, .8, .95])}
      ${dataCard(300, 380, .85, 54, '#5171FF', [.85, .4, .62])}
      <g transform="translate(800 512)">
        <rect x="-52" y="-30" width="104" height="46" rx="12" fill="#F7FAFF" stroke="#C9D2E8" stroke-width="3"/>
        <circle cx="-22" cy="-7" r="11" fill="#35A0C4"/>
        <rect x="-4" y="-16" width="44" height="7" rx="3.5" fill="#C9D2E8"/>
        <rect x="-4" y="-2" width="30" height="7" rx="3.5" fill="#2FA36B"/></g>
      ${person(1010, 690, .9, '#FFFFFF', '#35A0C4')}`;

    const near = `<path d="M-100 900 L360 900 L120 640 L-100 660 Z" fill="#B99155"/>
      <path d="M1720 900 L1240 900 L1500 640 L1720 668 Z" fill="#B99155"/>
      ${sensorPost(250, 880, 1.5)}`;

    // قوس القناة الحجري نمرّ تحته · the stone aqueduct arch we pass under
    let bricks = '';
    for (let i = 0; i < 14; i++)
      bricks += `<rect x="${-60 + i * 126}" y="146" width="112" height="54" rx="8" fill="#C7A778" stroke="#A98E63" stroke-width="3"/>`;
    const shell = `<g>
      <path d="M-160 ${H} L-160 200 L1760 200 L1760 ${H} L1180 ${H} L1180 470
               a380 380 0 0 0 -760 0 L420 ${H} Z" fill="#D6B686"/>
      <path d="M420 ${H} L420 470 a380 380 0 0 1 760 0 L1180 ${H}" fill="none" stroke="#A98E63" stroke-width="14"/>
      ${bricks}
      <rect x="-160" y="120" width="1920" height="34" rx="10" fill="#E0C79B"/></g>`;

    return [
      { z: -980, svg: far }, { z: -420, svg: mid }, { z: 0, svg: core },
      { z: 380, svg: near }, { z: 760, svg: shell },
    ];
  }

  /* ========================================================================
     المشهد ٤ — الحقل · Scene 4 — the field
     ===================================================================== */
  function fieldScene() {
    const far = `<circle cx="300" cy="200" r="86" fill="#FFF2CE"/>
      <g fill="#fff" opacity=".7">
        <ellipse cx="1180" cy="210" rx="130" ry="44"/><ellipse cx="1270" cy="188" rx="86" ry="36"/>
        <ellipse cx="640" cy="150" rx="100" ry="34"/></g>
      <path d="M0 520 q400 -60 820 -14 q420 46 780 -26 L${W} ${H} L0 ${H} Z" fill="#BFD9A8"/>`;

    let trees = '';
    for (let i = 0; i < 11; i++)
      trees += `<g transform="translate(${60 + i * 152} 566)">
        <rect x="-5" y="-56" width="10" height="56" fill="#7C5F3F"/>
        <circle cy="-72" r="34" fill="#3E9E62"/><circle cx="-20" cy="-58" r="24" fill="#4FBF83"/>
        <circle cx="22" cy="-60" r="22" fill="#348F58"/></g>`;
    const mid = `<rect y="560" width="${W}" height="${H - 560}" fill="#A8CE86"/>${trees}
      <g transform="translate(1330 500)">
        <path d="M-92 66 L-92 -18 L0 -64 L92 -18 L92 66 Z" fill="#F1E3C6"/>
        <path d="M-100 -14 L0 -70 L100 -14" fill="none" stroke="#C96F4A" stroke-width="14" stroke-linejoin="round"/>
        <rect x="-24" y="12" width="48" height="54" rx="6" fill="#C96F4A"/></g>`;

    const core = `${slab(800, 736, 470, '#9CCB7B', '#6E9E55')}
      ${cropRows(800, 716, 7, '#4FBF83')}
      ${person(360, 726, 1, '#FFFFFF', '#E9B44C')}${person(452, 736, 1, '#2A3570', '#5171FF', true)}
      ${person(1160, 736, 1, '#EFE7D8', '#2FA36B')}${person(1252, 726, 1, '#FFFFFF', '#D98E3B', true)}
      <g transform="translate(880 320)">
        ${shadow(-40, 420, 60, 12, .1)}
        <rect x="-56" y="-14" width="112" height="30" rx="14" fill="#2A3570"/>
        <circle cx="0" cy="20" r="9" fill="#35A0C4"/>
        <g stroke="#4A5590" stroke-width="7" stroke-linecap="round">
          <path d="M-52 -6 L-96 -34"/><path d="M52 -6 L96 -34"/>
          <path d="M-52 8 L-96 34"/><path d="M52 8 L96 34"/></g>
        <g fill="#8F98B5" opacity=".85">
          <ellipse cx="-96" cy="-36" rx="44" ry="7"/><ellipse cx="96" cy="-36" rx="44" ry="7"/>
          <ellipse cx="-96" cy="32" rx="44" ry="7"/><ellipse cx="96" cy="32" rx="44" ry="7"/></g>
        <path d="M0 30 L-46 150 L46 150 Z" fill="#35A0C4" opacity=".16"/></g>
      ${dataCard(330, 300, .9, 58, '#2FA36B', [.7, .95, .5])}`;

    const near = `<g opacity=".95">
      <path d="M-60 900 q170 -170 130 -330 q120 190 40 330 Z" fill="#2E8C5C"/>
      <path d="M1660 900 q-180 -160 -140 -340 q-130 200 -46 340 Z" fill="#2E8C5C"/></g>
      ${crate(760, 898, 1.35, '#C98A55', '#67D69C')}`;

    const shell = `<g opacity=".95">
      <path d="M-200 -80 q300 260 210 520 q-150 -220 -330 -300 Z" fill="#1E7A4C"/>
      <path d="M1800 -60 q-320 250 -230 540 q160 -230 350 -320 Z" fill="#1E7A4C"/>
      <path d="M-120 980 q260 -240 180 -520 q140 260 40 520 Z" fill="#246E48"/>
      <path d="M1720 980 q-260 -240 -180 -520 q-140 260 -40 520 Z" fill="#246E48"/></g>`;

    return [
      { z: -980, svg: far }, { z: -420, svg: mid }, { z: 0, svg: core },
      { z: 380, svg: near }, { z: 760, svg: shell },
    ];
  }

  /* ========================================================================
     المشهد ٥ — السوق · Scene 5 — the market
     ===================================================================== */
  function souqScene() {
    const far = `<circle cx="1240" cy="430" r="200" fill="url(#gSun)"/>
      <path d="M0 600 q260 -60 520 -20 q300 46 560 -16 q260 -50 520 6 L${W} ${H} L0 ${H} Z" fill="#B98A5C" opacity=".7"/>`;

    // أروقة السوق · the souq arcade
    let arches = '';
    for (let i = 0; i < 6; i++) {
      const x = 130 + i * 268;
      arches += `<path d="M${x} 660 L${x} 430 a86 86 0 0 1 172 0 L${x + 172} 660 Z" fill="#2A1E18" opacity=".35"/>
        <path d="M${x} 660 L${x} 430 a86 86 0 0 1 172 0" fill="none" stroke="#E7C79B" stroke-width="12"/>
        <circle cx="${x + 86}" cy="392" r="9" fill="#FFD98A"/>`;
    }
    const mid = `<rect x="60" y="300" width="1480" height="360" rx="14" fill="#C79A6A"/>
      ${arches}
      <rect x="60" y="272" width="1480" height="46" rx="12" fill="#E7C79B"/>
      <g fill="#FFD98A" opacity=".9">
        <circle cx="240" cy="250" r="7"/><circle cx="800" cy="238" r="8"/><circle cx="1360" cy="250" r="7"/></g>`;

    const stall = (x, y, s, cloth, crop) => `<g transform="translate(${x} ${y}) scale(${s})">
      ${shadow(0, 12, 150, 18, .18)}
      <rect x="-140" y="-40" width="280" height="52" rx="8" fill="#B4855A"/>
      <rect x="-140" y="-40" width="280" height="14" rx="7" fill="#CE9B69"/>
      <path d="M-160 -128 L160 -128 L128 -70 L-128 -70 Z" fill="${cloth}"/>
      <path d="M-160 -128 L160 -128 L150 -110 L-150 -110 Z" fill="#000" opacity=".12"/>
      <rect x="-134" y="-128" width="9" height="88" fill="#8A6A45"/>
      <rect x="125" y="-128" width="9" height="88" fill="#8A6A45"/>
      ${crate(-70, -40, .82, '#C98A55', crop)}${crate(24, -40, .82, '#B97C4C', crop)}
      </g>`;

    const core = `${slab(800, 764, 460, '#D8BE96', '#B0906A')}
      ${stall(400, 740, 1, '#C96F4A', '#E9B44C')}
      ${stall(1190, 744, 1, '#2FA36B', '#C96F4A')}
      ${stall(800, 812, 1.14, '#5171FF', '#8FC46B')}
      ${person(632, 782, 1, '#FFFFFF', '#E9B44C')}
      ${person(986, 786, 1, '#2A3570', '#D98E3B', true)}
      <g transform="translate(800 640)">
        <rect x="-46" y="-26" width="92" height="42" rx="10" fill="#F7FAFF" stroke="#C9D2E8" stroke-width="3"/>
        <rect x="-32" y="-14" width="40" height="8" rx="4" fill="#D98E3B"/>
        <rect x="-32" y="0" width="26" height="7" rx="3.5" fill="#C9D2E8"/></g>
      ${dataCard(1330, 400, .88, 60, '#D98E3B', [.8, .55, .9])}`;

    const near = `${crate(190, 892, 1.5, '#B97C4C', '#E9B44C')}
      ${crate(1420, 900, 1.55, '#C98A55', '#6FD09A')}
      <rect x="-40" y="856" width="1680" height="90" fill="#8C6842" opacity=".35"/>`;

    // المظلّة التي نمرّ تحتها · the awning we fly under
    let scallop = '';
    for (let i = 0; i < 13; i++) scallop += `<path d="M${-80 + i * 140} 300 a70 70 0 0 0 140 0 Z" fill="#C96F4A"/>`;
    const shell = `<rect x="-160" y="-120" width="1920" height="420" fill="#D8763F"/>
      <rect x="-160" y="-120" width="1920" height="420" fill="#000" opacity=".08"/>
      ${scallop}
      <g fill="#8A6A45"><rect x="60" y="300" width="20" height="620" rx="8"/>
        <rect x="1520" y="300" width="20" height="620" rx="8"/></g>`;

    return [
      { z: -980, svg: far }, { z: -420, svg: mid }, { z: 0, svg: core },
      { z: 380, svg: near }, { z: 760, svg: shell },
    ];
  }

  /* ========================================================================
     المشهد ٦ — السفراء · Scene 6 — the ambassadors
     ===================================================================== */
  function ambassadorsScene() {
    const r = rnd(77);
    let stars = '';
    for (let i = 0; i < 70; i++)
      stars += `<circle cx="${r() * W}" cy="${r() * 520}" r="${r() * 1.9 + .5}" fill="#fff" opacity="${.25 + r() * .6}"/>`;

    const far = `${stars}
      <circle cx="800" cy="600" r="420" fill="url(#gGlow)" opacity=".35"/>`;

    let skyline = '';
    for (let i = 0; i < 16; i++) {
      const x = -40 + i * 108, h = 90 + ((i * 37) % 190);
      skyline += `<rect x="${x}" y="${640 - h}" width="84" height="${h + 40}" rx="8" fill="#1B2450"/>`;
      for (let k = 0; k < 4; k++)
        skyline += `<rect x="${x + 12 + (k % 2) * 34}" y="${640 - h + 18 + Math.floor(k / 2) * 32}" width="24" height="18" rx="4"
                     fill="#FFD98A" opacity="${.3 + ((i + k) % 3) * .25}"/>`;
    }
    const mid = `${skyline}
      ${palm(150, 700, .8, '#25315E', '#1E5E3E', '#276E4A')}
      ${palm(1470, 706, .84, '#25315E', '#1E5E3E', '#276E4A')}
      <rect y="640" width="${W}" height="${H - 640}" fill="#182147"/>`;

    // حلقة السفراء حول الشتلة · the ring of ambassadors around the sapling
    let ring = '', links = '';
    const people = 8;
    for (let i = 0; i < people; i++) {
      const a = Math.PI * (0.06 + (i / (people - 1)) * 0.88);
      const x = 800 + Math.cos(a) * 430, y = 748 + Math.sin(a) * 90;
      const female = i % 2 === 1;
      ring += person(x, y, .9 + Math.sin(a) * .16, female ? '#C9D6FF' : '#F4F6FF',
        ['#E9B44C', '#5171FF', '#2FA36B', '#D98E3B'][i % 4], female);
      links += `<path d="M${x} ${y - 60} Q 800 ${y - 190} 800 700" stroke="#8FC46B" stroke-width="2"
                 fill="none" opacity=".28"/>`;
    }

    const core = `${slab(800, 780, 500, '#202B5C', '#151D42')}
      <ellipse cx="800" cy="780" rx="460" ry="100" fill="#5171FF" opacity=".12"/>
      ${links}
      <g transform="translate(800 764)">
        <circle cy="-90" r="150" fill="url(#gGlow)" opacity=".55"/>
        <path d="M-5 0 q-3 -70 3 -122" stroke="#5E8F3E" stroke-width="12" fill="none" stroke-linecap="round"/>
        <path d="M-3 -80 q-72 -20 -86 -74 q66 -8 90 60 Z" fill="#8FC46B"/>
        <path d="M0 -100 q70 -26 86 -80 q-66 -6 -90 66 Z" fill="#2FA36B"/>
        <path d="M-2 -46 q-56 -12 -70 -56 q54 -6 74 48 Z" fill="#6FB84F"/>
        <ellipse cy="6" rx="60" ry="13" fill="#0D1330" opacity=".5"/></g>
      ${ring}
      <g transform="translate(800 300)">
        <circle r="164" fill="url(#gGlow)" opacity=".26"/>
        <path d="M-36 34 L-62 138 L-18 116 L4 156 L28 56 Z" fill="#5171FF"/>
        <path d="M36 34 L62 138 L18 116 L-4 156 L-28 56 Z" fill="#3B55CC"/>
        <circle r="66" fill="#131C42" stroke="#5171FF" stroke-width="4"/>
        <circle r="53" fill="none" stroke="#8FC46B" stroke-width="2" opacity=".55"/>
        <g transform="translate(0 26)">
          <path d="M-2 0 q-2 -28 2 -50" stroke="#5E8F3E" stroke-width="6" fill="none" stroke-linecap="round"/>
          <path d="M-1 -30 q-28 -9 -34 -32 q28 -3 37 26 Z" fill="#2FA36B"/>
          <path d="M1 -40 q28 -11 34 -34 q-28 -2 -37 28 Z" fill="#8FC46B"/></g>
        <g fill="#E9B44C">
          <path d="M-104 -34 l5 11 12 2 -9 9 2 12 -10 -6 -11 6 2 -12 -8 -9 12 -2 Z"/>
          <path d="M104 -34 l5 11 12 2 -9 9 2 12 -10 -6 -11 6 2 -12 -8 -9 12 -2 Z"/></g></g>`;

    const near = `<g fill="#FFD98A">
      <g transform="translate(170 560)"><rect x="-4" y="0" width="8" height="300" fill="#25315E"/>
        <path d="M-30 0 h60 l-14 -46 h-32 Z" fill="#FFD98A" opacity=".9"/>
        <circle cy="-20" r="40" fill="#FFD98A" opacity=".12"/></g>
      <g transform="translate(1440 578)"><rect x="-4" y="0" width="8" height="300" fill="#25315E"/>
        <path d="M-30 0 h60 l-14 -46 h-32 Z" fill="#FFD98A" opacity=".9"/>
        <circle cy="-20" r="40" fill="#FFD98A" opacity=".12"/></g></g>`;

    let bokeh = '';
    for (let i = 0; i < 16; i++)
      bokeh += `<circle cx="${r() * W}" cy="${r() * H}" r="${28 + r() * 66}" fill="#8FC46B" opacity="${.05 + r() * .09}"/>`;
    const shell = bokeh;

    return [
      { z: -980, svg: far }, { z: -420, svg: mid }, { z: 0, svg: core },
      { z: 380, svg: near }, { z: 760, svg: shell },
    ];
  }

  return {
    W, H, DEFS,
    build: {
      seed: seedScene, nursery: nurseryScene, falaj: falajScene,
      field: fieldScene, souq: souqScene, ambassadors: ambassadorsScene,
    },
  };
})();
