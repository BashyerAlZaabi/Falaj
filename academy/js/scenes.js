/* =========================================================================
   scenes.js — layered SVG scene art for the cinematic chapters
   Each scene returns HTML: several <div class="scene-layer" data-depth>…</div>
   layers, ordered back → front, each holding an inline <svg>. The academy
   engine translates each layer by its data-depth for parallax.
   ========================================================================= */
(function () {
  "use strict";

  // shared defs: sky gradients, sun, reusable palm + plant symbols
  const svg = (w, h, inner, extra = "") =>
    `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice" width="100%" height="100%" ${extra}>${inner}</svg>`;

  // a stylised date palm
  const palm = (x, y, s, tone = "#3f6b2b", trunk = "#6b4423") => {
    const fronds = [];
    for (let i = 0; i < 9; i++) {
      const a = -90 + (i - 4) * 26;
      const len = 62 - Math.abs(i - 4) * 4;
      const rad = (a * Math.PI) / 180;
      const ex = Math.cos(rad) * len, ey = Math.sin(rad) * len;
      const cx = Math.cos(rad) * len * 0.5 - Math.sin(rad) * 16;
      const cy = Math.sin(rad) * len * 0.5 + Math.cos(rad) * 16;
      fronds.push(
        `<path d="M0 0 Q ${cx} ${cy} ${ex} ${ey}" stroke="${tone}" stroke-width="7" fill="none" stroke-linecap="round" opacity="${0.85 - Math.abs(i - 4) * 0.05}"/>`
      );
    }
    // date clusters
    const dates = `<g fill="#7a4a24"><circle cx="-6" cy="6" r="3"/><circle cx="6" cy="7" r="3"/><circle cx="0" cy="11" r="3"/></g>`;
    return `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M-6 0 Q -3 60 -4 120 L 4 120 Q 3 60 6 0 Z" fill="${trunk}"/>
      <g opacity=".25" stroke="#000" stroke-width="1">${Array.from({length:6},(_,k)=>`<line x1="-5" y1="${18*k+10}" x2="5" y2="${18*k+14}"/>`).join("")}</g>
      <g>${fronds.join("")}</g>${dates}
    </g>`;
  };

  // a young green sprout / seedling
  const sprout = (x, y, s, tone = "#7cae4e") =>
    `<g transform="translate(${x} ${y}) scale(${s})">
      <path d="M0 0 C 0 -14 0 -22 0 -30" stroke="#4f8433" stroke-width="3" fill="none"/>
      <path d="M0 -14 C -10 -18 -16 -12 -18 -4 C -8 -6 -2 -10 0 -14Z" fill="${tone}"/>
      <path d="M0 -22 C 10 -26 16 -20 18 -12 C 8 -14 2 -18 0 -22Z" fill="${tone}"/>
      <path d="M0 -30 C -3 -40 3 -46 8 -48 C 6 -40 4 -34 0 -30Z" fill="${tone}"/>
    </g>`;

  const dunes = (h, c1, c2) =>
    `<path d="M0 ${h*0.62} Q 300 ${h*0.5} 640 ${h*0.6} T 1440 ${h*0.56} V ${h} H0 Z" fill="${c1}"/>
     <path d="M0 ${h*0.74} Q 400 ${h*0.62} 820 ${h*0.72} T 1440 ${h*0.7} V ${h} H0 Z" fill="${c2}"/>`;

  /* ---------------- Scene registry ---------------- */
  const scenes = {

    /* النخيل — palm grove at golden hour */
    palms() {
      const back = svg(1440, 900,
        `<defs><linearGradient id="skP" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#f6d68c"/><stop offset=".45" stop-color="#e8b06a"/><stop offset="1" stop-color="#c98f52"/>
        </linearGradient></defs>
        <rect width="1440" height="900" fill="url(#skP)"/>
        <circle cx="720" cy="330" r="120" fill="#fff3d0" opacity=".85"/>
        <circle cx="720" cy="330" r="200" fill="#ffe9b0" opacity=".3"/>
        ${dunes(900,"#d9a45f","#c58a49")}`);
      const mid = svg(1440, 900,
        `${palm(230,470,1.5,"#4a6b32","#5c3a1e")}${palm(1180,500,1.7,"#456530","#5c3a1e")}
         ${palm(560,520,1.2,"#3f6b2b","#6b4423")}${palm(900,540,1.35,"#3f6b2b","#6b4423")}`,
        'style="filter:saturate(1.05)"');
      const front = svg(1440, 900,
        `${palm(90,720,2.2,"#2f5220","#4e2f16")}${palm(1350,760,2.4,"#2f5220","#4e2f16")}
         <path d="M0 820 Q 720 760 1440 820 V900 H0Z" fill="#3a5226"/>
         ${Array.from({length:14},(_,i)=>sprout(120+i*95,860,1.1,"#5c8a3a")).join("")}`);
      return [
        `<div class="scene-layer" data-depth="0.04">${back}</div>`,
        `<div class="scene-layer" data-depth="0.14">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.28">${front}</div>`,
      ].join("");
    },

    /* المعرفة — greenhouse of knowledge */
    greenhouse() {
      const back = svg(1440, 900,
        `<defs><linearGradient id="skG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#bfe3c9"/><stop offset="1" stop-color="#6fae8f"/></linearGradient></defs>
        <rect width="1440" height="900" fill="url(#skG)"/>
        <circle cx="1080" cy="220" r="90" fill="#f6f2d8" opacity=".7"/>
        <path d="M0 640 Q 400 600 1440 650 V900 H0Z" fill="#4f8455" opacity=".5"/>`);
      const mid = svg(1440, 900,
        `<g opacity=".95">
          <path d="M360 620 L720 340 L1080 620 Z" fill="rgba(255,255,255,.14)" stroke="#e8f3ea" stroke-width="3"/>
          <rect x="360" y="620" width="720" height="230" fill="rgba(210,235,215,.16)" stroke="#e8f3ea" stroke-width="3"/>
          <g stroke="#dff0e2" stroke-width="2" opacity=".7">
            <line x1="540" y1="480" x2="540" y2="850"/><line x1="720" y1="340" x2="720" y2="850"/>
            <line x1="900" y1="480" x2="900" y2="850"/><line x1="360" y1="700" x2="1080" y2="700"/>
          </g>
          ${Array.from({length:7},(_,i)=>sprout(430+i*100,820,1.4,"#4f8433")).join("")}
        </g>`);
      const front = svg(1440, 900,
        `<path d="M0 780 Q 720 720 1440 790 V900 H0Z" fill="#356b3d"/>
         ${Array.from({length:12},(_,i)=>sprout(90+i*115,880,1.6,"#68a544")).join("")}`);
      return [
        `<div class="scene-layer" data-depth="0.05">${back}</div>`,
        `<div class="scene-layer" data-depth="0.16">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.3">${front}</div>`,
      ].join("");
    },

    /* المهارات — hands grafting a branch */
    graft() {
      const back = svg(1440, 900,
        `<defs><radialGradient id="skS" cx="50%" cy="35%" r="80%">
          <stop offset="0" stop-color="#eadfc4"/><stop offset="1" stop-color="#b98d5a"/></radialGradient></defs>
        <rect width="1440" height="900" fill="url(#skS)"/>
        ${dunes(900,"#c99a63","#a87843")}`);
      const mid = svg(1440, 900,
        `<g transform="translate(720 470)">
          <path d="M0 300 C -20 120 -30 -40 -10 -180" stroke="#6b4423" stroke-width="46" fill="none" stroke-linecap="round"/>
          <path d="M-10 -60 C 60 -110 120 -150 190 -150" stroke="#6b4423" stroke-width="26" fill="none" stroke-linecap="round"/>
          <path d="M-10 -60 C 60 -110 120 -150 190 -150" stroke="#7a4a24" stroke-width="10" fill="none" stroke-linecap="round" opacity=".5"/>
          <!-- graft scion -->
          <g transform="translate(190 -150) rotate(20)">
            <path d="M0 0 L 0 -90" stroke="#5c8a3a" stroke-width="16" stroke-linecap="round"/>
            ${sprout(0,-90,1.6,"#7cae4e")}
            <path d="M-9 6 L 9 6 L 4 22 L -4 22 Z" fill="#c98f52"/>
          </g>
          <!-- graft tape -->
          <g transform="translate(190 -150)"><ellipse cx="0" cy="0" rx="16" ry="9" fill="#e0b04a" opacity=".9"/><ellipse cx="0" cy="6" rx="15" ry="8" fill="#c9902b" opacity=".9"/></g>
        </g>`);
      const front = svg(1440, 900,
        `<!-- two hands -->
        <g fill="#d9a878">
          <path d="M470 780 q 60 -120 150 -150 q 40 -12 70 6 q -20 30 -60 46 q 50 -6 84 18 q -18 34 -70 40 q 40 6 60 34 q -26 26 -80 20 q -60 -8 -160 34 Z"/>
        </g>
        <g fill="#c99368">
          <path d="M980 800 q -60 -130 -150 -160 q -40 -12 -70 8 q 22 30 62 44 q -50 -4 -84 22 q 20 32 72 36 q -40 8 -58 36 q 28 24 82 16 q 58 -10 154 30 Z"/>
        </g>
        <path d="M0 820 Q 720 790 1440 820 V900 H0Z" fill="#7a4a24"/>`);
      return [
        `<div class="scene-layer" data-depth="0.05">${back}</div>`,
        `<div class="scene-layer" data-depth="0.18">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.32">${front}</div>`,
      ].join("");
    },

    /* الإنتاج — laden fruit trees / orchard */
    orchard() {
      const back = svg(1440, 900,
        `<defs><linearGradient id="skO" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#cfe6f2"/><stop offset="1" stop-color="#e8dfb8"/></linearGradient></defs>
        <rect width="1440" height="900" fill="url(#skO)"/>
        <circle cx="300" cy="200" r="70" fill="#fff5d8" opacity=".8"/>
        <path d="M0 660 Q 500 610 1440 670 V900 H0Z" fill="#8fb567" opacity=".5"/>`);
      const tree = (x, y, s) =>
        `<g transform="translate(${x} ${y}) scale(${s})">
          <path d="M-8 0 Q -4 -60 -6 -120 L 6 -120 Q 4 -60 8 0 Z" fill="#6b4423"/>
          <circle cx="0" cy="-160" r="80" fill="#4f8433"/><circle cx="-50" cy="-130" r="55" fill="#3f6b2b"/>
          <circle cx="50" cy="-135" r="58" fill="#5c9a3c"/><circle cx="0" cy="-120" r="60" fill="#68a544"/>
          <g fill="#e0b04a">${Array.from({length:14},()=>0).map((_,i)=>{const ax=-70+(i*10)%140,ay=-190+((i*37)%90);return `<circle cx="${ax}" cy="${ay}" r="7"/>`}).join("")}</g>
          <g fill="#c9902b" opacity=".8">${Array.from({length:8},(_,i)=>`<circle cx="${-50+i*14}" cy="${-130+((i*23)%70)}" r="5"/>`).join("")}</g>
        </g>`;
      const mid = svg(1440, 900, `${tree(360,720,1.4)}${tree(1080,720,1.5)}${tree(720,700,1.2)}`);
      const front = svg(1440, 900,
        `<path d="M0 760 Q 720 720 1440 770 V900 H0Z" fill="#4f7a34"/>
         ${Array.from({length:20},(_,i)=>`<g transform="translate(${60+i*72} 840)"><rect x="-3" y="0" width="6" height="34" fill="#5c8a3a"/><circle cx="0" cy="-4" r="12" fill="#e0b04a"/></g>`).join("")}`);
      return [
        `<div class="scene-layer" data-depth="0.05">${back}</div>`,
        `<div class="scene-layer" data-depth="0.17">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.3">${front}</div>`,
      ].join("");
    },

    /* الاقتصاد — growth, coins & value */
    economy() {
      const back = svg(1440, 900,
        `<defs><linearGradient id="skE" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#20361b"/><stop offset="1" stop-color="#2b3b22"/></linearGradient></defs>
        <rect width="1440" height="900" fill="url(#skE)"/>
        <g opacity=".14" stroke="#e0b04a" stroke-width="1">${Array.from({length:9},(_,i)=>`<line x1="0" y1="${100*i+60}" x2="1440" y2="${100*i+60}"/>`).join("")}</g>`);
      const mid = svg(1440, 900,
        `<!-- rising bar chart made of soil + plants -->
        <g>${[0,1,2,3,4].map(i=>{const bh=140+i*110,bx=360+i*160;return `<rect x="${bx}" y="${760-bh}" width="110" height="${bh}" rx="10" fill="rgba(124,174,78,${.35+i*.12})"/>${sprout(bx+55,760-bh,1.4+i*.25,"#9ccf5f")}`}).join("")}
        <path d="M360 620 L 520 540 L 680 470 L 840 380 L 1000 280" stroke="#e0b04a" stroke-width="4" fill="none" stroke-linecap="round"/>
        <path d="M980 270 l 30 4 l -14 -28 Z" fill="#e0b04a"/></g>`);
      const front = svg(1440, 900,
        `<g fill="#e0b04a">${Array.from({length:10},(_,i)=>`<g transform="translate(${120+i*140} ${830-((i%3)*22)})"><ellipse cx="0" cy="0" rx="26" ry="26" fill="#e8b84b"/><ellipse cx="0" cy="0" rx="26" ry="26" fill="none" stroke="#c9902b" stroke-width="3"/><text x="0" y="8" text-anchor="middle" font-size="26" fill="#7a4a24" font-family="serif">د</text></g>`).join("")}</g>
        <path d="M0 850 H1440 V900 H0Z" fill="#20361b"/>`);
      return [
        `<div class="scene-layer" data-depth="0.05">${back}</div>`,
        `<div class="scene-layer" data-depth="0.16">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.3">${front}</div>`,
      ].join("");
    },

    /* الابتكار — smart farm / sensors & pivot */
    smart() {
      const back = svg(1440, 900,
        `<defs><linearGradient id="skI" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#a9d8e8"/><stop offset="1" stop-color="#cfe8d4"/></linearGradient></defs>
        <rect width="1440" height="900" fill="url(#skI)"/>
        <circle cx="1120" cy="200" r="80" fill="#fbf7df" opacity=".7"/>
        <path d="M0 650 Q 720 600 1440 660 V900 H0Z" fill="#77b17f" opacity=".6"/>`);
      const mid = svg(1440, 900,
        `<!-- pivot irrigation boom -->
        <g stroke="#6b7f88" stroke-width="6" fill="none">
          <line x1="720" y1="640" x2="720" y2="470"/>
          <line x1="220" y1="600" x2="1220" y2="600"/>
          ${Array.from({length:6},(_,i)=>`<line x1="${300+i*160}" y1="600" x2="${300+i*160}" y2="660"/>`).join("")}
        </g>
        <g stroke="#6cc3dd" stroke-width="2" opacity=".6">${Array.from({length:24},(_,i)=>`<line x1="${240+i*44}" y1="608" x2="${240+i*44}" y2="700"/>`).join("")}</g>
        <!-- drone -->
        <g transform="translate(1050 330)"><rect x="-26" y="-6" width="52" height="12" rx="6" fill="#2b3b22"/><circle cx="-30" cy="-2" r="14" fill="none" stroke="#20361b" stroke-width="3"/><circle cx="30" cy="-2" r="14" fill="none" stroke="#20361b" stroke-width="3"/><circle cx="0" cy="8" r="5" fill="#e0b04a"/></g>`);
      const front = svg(1440, 900,
        `<path d="M0 720 Q 720 680 1440 730 V900 H0Z" fill="#4f8455"/>
         ${Array.from({length:9},(_,i)=>sprout(120+i*150,820,1.5,"#8fc752")).join("")}
         <!-- sensor stake -->
         <g transform="translate(300 760)"><rect x="-3" y="0" width="6" height="70" fill="#6b7f88"/><rect x="-16" y="-30" width="32" height="34" rx="6" fill="#20361b"/><circle cx="0" cy="-13" r="6" fill="#6cc3dd"/></g>
         <g transform="translate(1140 780)"><rect x="-3" y="0" width="6" height="60" fill="#6b7f88"/><rect x="-14" y="-26" width="28" height="30" rx="6" fill="#20361b"/><circle cx="0" cy="-11" r="5" fill="#9ccf5f"/></g>`);
      return [
        `<div class="scene-layer" data-depth="0.05">${back}</div>`,
        `<div class="scene-layer" data-depth="0.17">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.31">${front}</div>`,
      ].join("");
    },

    /* المستقبل — sunrise over green fields, vision */
    future() {
      const back = svg(1440, 900,
        `<defs><linearGradient id="skF" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stop-color="#3a2c52"/><stop offset=".4" stop-color="#a85a5a"/><stop offset=".7" stop-color="#e8a45a"/><stop offset="1" stop-color="#f6d68c"/></linearGradient></defs>
        <rect width="1440" height="900" fill="url(#skF)"/>
        <circle cx="720" cy="560" r="150" fill="#fff0c4" opacity=".95"/>
        <circle cx="720" cy="560" r="260" fill="#ffe4a0" opacity=".28"/>
        <g fill="#fff" opacity=".8">${Array.from({length:30},(_,i)=>`<circle cx="${(i*97)%1440}" cy="${(i*53)%320}" r="${(i%3)+1}"/>`).join("")}</g>`);
      const mid = svg(1440, 900,
        `<path d="M0 640 Q 400 600 720 630 T 1440 640 V900 H0Z" fill="#3f6b2b" opacity=".85"/>
         ${Array.from({length:5},(_,i)=>palm(180+i*270,700,1.3,"#2f5220","#3a2410")).join("")}`);
      const front = svg(1440, 900,
        `<path d="M0 740 Q 720 700 1440 750 V900 H0Z" fill="#20361b"/>
         ${Array.from({length:22},(_,i)=>sprout(60+i*66,830,1.4,"#68a544")).join("")}`);
      return [
        `<div class="scene-layer" data-depth="0.04">${back}</div>`,
        `<div class="scene-layer" data-depth="0.15">${mid}</div>`,
        `<div class="scene-layer" data-depth="0.3">${front}</div>`,
      ].join("");
    },
  };

  window.AcademyScenes = scenes;
})();
