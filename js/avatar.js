/* ===== مولّد شخصية إماراتية (SVG) =====
   يبني الشخصية حسب الجنس والقطع المرتداة بتفاصيل الزي الإماراتي.
   equipped = { outfit, head, eyes, accessory, shoes }
*/

const OUTFIT_COLORS = {
  outfit_classic_male:   { main: '#fcfbf7', shade: '#e6e2d6', line: '#cdc7b6', dark: '#bdb6a2' },
  outfit_classic_female: { main: '#24272f', shade: '#15171c', line: '#0c0d11', dark: '#070809' },
  outfit_gold:           { main: '#edca5f', shade: '#cda537', line: '#b08e2c', dark: '#8f7220' },
  outfit_navy:           { main: '#314a78', shade: '#203152', line: '#172540', dark: '#101a30' },
  outfit_sport:          { main: '#23805f', shade: '#175740', line: '#10402f', dark: '#0a2e22' },
  outfit_red:            { main: '#ad3535', shade: '#852424', line: '#671b1b', dark: '#4f1414' },
};

const HEAD_COLORS = {
  male:   { cloth: '#fdfdfb', shade: '#e7e4db', line: '#d4d0c3' },
  female: { cloth: '#1c1e25', shade: '#101116', line: '#0a0b0e' },
};

const SKIN = '#eebf94';
const SKIN_SHADE = '#d8a273';
const SKIN_LINE = '#bf875b';

function buildAvatar(gender, eq) {
  let outfit;
  if (eq.outfit === 'outfit_classic') {
    outfit = gender === 'female' ? OUTFIT_COLORS.outfit_classic_female : OUTFIT_COLORS.outfit_classic_male;
  } else {
    outfit = OUTFIT_COLORS[eq.outfit] || OUTFIT_COLORS.outfit_classic_male;
  }

  const p = [];

  // ===== التعريفات =====
  p.push(`<defs>
    <linearGradient id="gOutfit" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0" stop-color="${outfit.main}"/>
      <stop offset="1" stop-color="${outfit.shade}"/>
    </linearGradient>
    <linearGradient id="gSleeveR" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${outfit.main}"/>
      <stop offset="1" stop-color="${outfit.shade}"/>
    </linearGradient>
    <linearGradient id="gSleeveL" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0" stop-color="${outfit.dark}"/>
      <stop offset="1" stop-color="${outfit.shade}"/>
    </linearGradient>
    <radialGradient id="gFace" cx="0.5" cy="0.4" r="0.7">
      <stop offset="0" stop-color="${SKIN}"/>
      <stop offset="0.75" stop-color="${SKIN}"/>
      <stop offset="1" stop-color="${SKIN_SHADE}"/>
    </radialGradient>
    <linearGradient id="gHead" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${(HEAD_COLORS[gender]||HEAD_COLORS.male).cloth}"/>
      <stop offset="1" stop-color="${(HEAD_COLORS[gender]||HEAD_COLORS.male).shade}"/>
    </linearGradient>
    <linearGradient id="gHair" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#3d2c1c"/>
      <stop offset="1" stop-color="#281b10"/>
    </linearGradient>
  </defs>`);

  // ===== الظل الأرضي =====
  p.push(`<ellipse cx="100" cy="231" rx="54" ry="7.5" fill="#000" opacity="0.22"/>`);

  // ===== الأحذية =====
  p.push(shoesSVG(eq.shoes));

  // ===== الجسم =====
  p.push(bodySVG(gender, outfit, eq.outfit));

  // ===== الذراعان =====
  p.push(armsSVG(gender, outfit, eq.accessory));

  // ===== الرقبة =====
  p.push(`<path d="M91 88 q9 11 18 0 l0 18 q-9 8 -18 0 z" fill="${SKIN_SHADE}"/>`);

  // ===== الوجه =====
  p.push(`<path d="M67 64
      C67 41 84 33 100 33
      C116 33 133 41 133 64
      C133 90 119 106 100 106
      C81 106 67 90 67 64 Z" fill="url(#gFace)"/>`);
  // أذنان
  p.push(`<ellipse cx="67" cy="73" rx="6" ry="8.5" fill="${SKIN}"/><ellipse cx="133" cy="73" rx="6" ry="8.5" fill="${SKIN}"/>`);
  p.push(`<path d="M65 70 q3 3 1 7" stroke="${SKIN_LINE}" stroke-width="1.4" fill="none" opacity="0.6"/>`);
  p.push(`<path d="M135 70 q-3 3 -1 7" stroke="${SKIN_LINE}" stroke-width="1.4" fill="none" opacity="0.6"/>`);
  // خدّان
  p.push(`<ellipse cx="80" cy="83" rx="7" ry="4.5" fill="#e8997a" opacity="0.38"/><ellipse cx="120" cy="83" rx="7" ry="4.5" fill="#e8997a" opacity="0.38"/>`);

  // ===== غطاء الرأس =====
  p.push(headwearSVG(gender, eq.head));

  // ===== الحاجبان =====
  p.push(`<path d="M79 62 q9 -6 18 -1" stroke="#3a2a1c" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);
  p.push(`<path d="M103 61 q9 -5 18 1" stroke="#3a2a1c" stroke-width="3.2" fill="none" stroke-linecap="round"/>`);

  // ===== العيون / النظارة =====
  p.push(eyesSVG(eq.eyes));

  // ===== الأنف والفم =====
  p.push(`<path d="M99 70 q4 8 1 13 q-3 2 -6 1" stroke="${SKIN_LINE}" stroke-width="2.2" fill="none" stroke-linecap="round"/>`);
  p.push(`<path d="M89 91 q11 9 22 0" stroke="#9a4636" stroke-width="2.6" fill="none" stroke-linecap="round"/>`);
  p.push(`<path d="M92 92 q8 4 16 0" fill="#c76b58" opacity="0.45"/>`);

  // لحية خفيفة للرجل
  if (gender === 'male') {
    p.push(`<path d="M71 80 q29 28 58 0 q-6 24 -29 26 q-23 -2 -29 -26z" fill="#2f2114" opacity="0.24"/>`);
  }

  // ===== سماعات =====
  if (eq.accessory === 'acc_headphone') {
    p.push(`<path d="M63 54 q37 -44 74 0" stroke="#ec4359" stroke-width="6" fill="none"/>`);
    p.push(`<rect x="56" y="52" width="13" height="25" rx="6" fill="#ec4359"/><rect x="59" y="56" width="7" height="17" rx="3" fill="#b8283c"/>`);
    p.push(`<rect x="131" y="52" width="13" height="25" rx="6" fill="#ec4359"/><rect x="134" y="56" width="7" height="17" rx="3" fill="#b8283c"/>`);
  }

  // ===== ميدالية =====
  if (eq.accessory === 'acc_medal') {
    p.push(`<path d="M100 110 l-13 26 M100 110 l13 26" stroke="#c0392b" stroke-width="4.5" fill="none"/>`);
    p.push(`<circle cx="100" cy="144" r="12" fill="#f1c40f" stroke="#caa106" stroke-width="2.5"/>`);
    p.push(`<circle cx="100" cy="144" r="7" fill="none" stroke="#caa106" stroke-width="1.5"/>`);
    p.push(`<text x="100" y="149" font-size="12" text-anchor="middle">★</text>`);
  }

  return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-label="الشخصية">${p.join('')}</svg>`;
}

/* ===== الجسم ===== */
function bodySVG(gender, outfit, outfitId) {
  if (gender === 'female') {
    // عباية بأكتاف مدوّرة وانسدال واسع
    let s = `<path d="M100 103
        C81 103 69 109 66 126
        L54 214 Q53 222 63 223 L137 223 Q147 222 146 214
        L134 126 C131 109 119 103 100 103 Z" fill="url(#gOutfit)"/>`;
    // فتحة أمامية
    s += `<path d="M100 104 L100 222" stroke="${outfit.line}" stroke-width="1.6" opacity="0.55"/>`;
    s += `<path d="M100 104 C96 130 96 170 100 222" stroke="${outfit.dark}" stroke-width="3" fill="none" opacity="0.35"/>`;
    // طوق رقبة العباية
    s += `<path d="M88 105 q12 13 24 0 l-2 7 q-10 9 -20 0 z" fill="${outfit.shade}"/>`;
    // تطريز الحافة الأمامية والسفلية للأزياء الفاخرة
    if (outfitId === 'outfit_gold' || outfitId === 'outfit_red') {
      s += `<path d="M93 110 L93 220 M107 110 L107 220" stroke="#f3d985" stroke-width="2" opacity="0.85"/>`;
      s += `<path d="M58 210 Q100 220 142 210" stroke="#f3d985" stroke-width="2.4" fill="none" opacity="0.85"/>`;
    } else {
      s += `<path d="M58 211 Q100 220 142 211" stroke="${outfit.dark}" stroke-width="2" fill="none" opacity="0.4"/>`;
    }
    return s;
  }

  // ===== كندورة (رجل) =====
  let s = `<path d="M100 100
      C84 100 72 107 69 123
      L59 213 Q58 221 68 222 L132 222 Q142 221 141 213
      L131 123 C128 107 116 100 100 100 Z" fill="url(#gOutfit)"/>`;
  // الكولّر (ياقة قائمة)
  s += `<path d="M86 102 q14 12 28 0 l0 7 q-14 11 -28 0 z" fill="${outfit.main}" stroke="${outfit.line}" stroke-width="1.4"/>`;
  s += `<path d="M86 102 q14 12 28 0" stroke="${outfit.line}" stroke-width="1.6" fill="none"/>`;
  // الفتحة الأمامية (الكسرة) + أزرار
  s += `<path d="M100 110 L100 214" stroke="${outfit.line}" stroke-width="1.8" opacity="0.7"/>`;
  s += `<g fill="${outfit.line}">
      <circle cx="100" cy="124" r="1.7"/><circle cx="100" cy="138" r="1.7"/>
      <circle cx="100" cy="152" r="1.7"/><circle cx="100" cy="166" r="1.7"/>
    </g>`;
  // الفروخة (الشرّابة المتدلّية من الياقة)
  s += `<path d="M108 108 q7 5 6 16" stroke="${outfit.line}" stroke-width="1.6" fill="none"/>`;
  s += `<g>
      <circle cx="114" cy="126" r="2.6" fill="${outfit.shade}"/>
      <path d="M114 128 l-1.5 8 M114 128 l1.5 8 M114 128 l0 8.5" stroke="${outfit.dark}" stroke-width="1.2"/>
    </g>`;
  // طيّات خفيفة على الكندورة
  s += `<path d="M78 130 Q74 175 70 212" stroke="${outfit.dark}" stroke-width="1.6" fill="none" opacity="0.18"/>`;
  s += `<path d="M122 130 Q126 175 130 212" stroke="${outfit.dark}" stroke-width="1.6" fill="none" opacity="0.18"/>`;
  // ذيل سفلي
  s += `<path d="M58 212 Q100 220 142 212" stroke="${outfit.dark}" stroke-width="1.8" fill="none" opacity="0.3"/>`;
  // خط رياضي للبدلة الرياضية
  if (outfitId === 'outfit_sport') {
    s += `<path d="M69 148 L131 154" stroke="#f1cf63" stroke-width="4" opacity="0.9"/>`;
    s += `<path d="M73 162 L127 167" stroke="#f1cf63" stroke-width="2" opacity="0.5"/>`;
  }
  return s;
}

/* ===== الذراعان ===== */
function armsSVG(gender, outfit, accessory) {
  let s = '';
  // كمّان واسعان منسدلان
  s += `<path d="M70 122 C54 134 49 160 54 184 C56 192 70 191 71 183 C69 160 75 140 85 128 Z" fill="url(#gSleeveL)"/>`;
  s += `<path d="M130 122 C146 134 151 160 146 184 C144 192 130 191 129 183 C131 160 125 140 115 128 Z" fill="url(#gSleeveR)"/>`;
  // أساور الكمّ (كفّة)
  s += `<path d="M54 178 q9 5 17 1 l-1 6 q-7 4 -15 0 z" fill="${outfit.shade}"/>`;
  s += `<path d="M129 179 q9 4 17 -1 l1 6 q-8 4 -15 0 z" fill="${outfit.dark}"/>`;
  // اليدان
  s += `<circle cx="62" cy="186" r="8.5" fill="${SKIN}"/><circle cx="138" cy="186" r="8.5" fill="${SKIN}"/>`;
  // ساعة
  if (accessory === 'acc_watch') {
    s += `<rect x="130" y="172" width="15" height="10" rx="2.5" fill="#1f2329" transform="rotate(16 137 177)"/>`;
    s += `<rect x="132" y="174" width="11" height="6" rx="1.5" fill="#46d6c0" transform="rotate(16 137 177)"/>`;
  }
  return s;
}

/* ===== غطاء الرأس =====
   الوجه يُكشف عبر فتحة (بشرة) أعلاها y≈50 لتغطية الجبين/منبت الشعر. */
function faceHole(fill) {
  return `<path d="M70 60 C70 50 84 45 100 45 C116 45 130 50 130 60 C130 87 117 104 100 104 C83 104 70 87 70 60 Z" fill="${fill}"/>`;
}

function headwearSVG(gender, head) {
  // كاب رياضي
  if (head === 'head_cap') {
    let s = `<path d="M66 64 q-3 14 2 26 q5 -10 5 -22z" fill="url(#gHair)"/>`;
    s += `<path d="M134 64 q3 14 -2 26 q-5 -10 -5 -22z" fill="url(#gHair)"/>`;
    s += `<path d="M65 50 C70 22 130 22 135 50 C135 56 130 58 125 56 C108 47 92 47 75 56 C70 58 65 56 65 50 Z" fill="#23805f"/>`;
    s += `<path d="M64 52 C47 54 41 63 45 68 C66 63 70 58 73 54 Z" fill="#16563d"/>`;
    s += `<path d="M100 24 C90 24 84 32 84 46 q16 -7 32 0 C116 32 110 24 100 24 Z" fill="#1d6b4f"/>`;
    s += `<ellipse cx="100" cy="30" rx="4.5" ry="4" fill="#16563d"/>`;
    return s;
  }
  // عصابة رأس + شعر
  if (head === 'head_band') {
    let s = `<path d="M61 50 C68 26 132 26 139 50 C141 62 139 74 134 84 C130 62 119 50 100 50 C81 50 70 62 66 84 C61 74 59 62 61 50 Z" fill="url(#gHair)"/>`;
    // خصلات
    s += `<path d="M66 56 q-4 14 0 26 q5 -12 6 -22z M134 56 q4 14 0 26 q-5 -12 -6 -22z" fill="url(#gHair)"/>`;
    s += `<path d="M64 55 q36 -17 72 0 l0 9 q-36 -15 -72 0 z" fill="#e84393"/>`;
    s += `<path d="M64 60 q36 -13 72 0" stroke="#c0306f" stroke-width="1.6" fill="none" opacity="0.7"/>`;
    return s;
  }
  // شماغ أحمر إماراتي بنقشة
  if (head === 'head_shemagh') {
    let s = `<path d="M61 58 C61 16 139 16 139 58 C141 86 139 116 135 140 C124 130 116 132 110 137 L110 92 Q100 80 90 92 L90 137 C84 132 76 130 65 140 C61 116 59 86 61 58 Z" fill="#d63031"/>`;
    // النقشة المعيّنة الكلاسيكية للشماغ
    s += `<g stroke="#fff" stroke-width="1.1" opacity="0.30" fill="none">
        <path d="M70 70 L130 70 M68 82 L132 82 M67 94 L133 94 M67 106 L133 106 M68 118 L132 118"/>
        <path d="M78 64 L78 132 M90 62 L90 86 M110 62 L110 86 M122 64 L122 132 M100 100 L100 132"/>
      </g>`;
    s += `<g stroke="#a31f1f" stroke-width="1" opacity="0.4" fill="none">
        <path d="M74 76 L126 76 M73 100 L127 100 M74 124 L126 124"/>
      </g>`;
    // ظل علوي
    s += `<path d="M61 58 C61 16 139 16 139 58 C140 68 140 78 139 88 C100 64 100 64 61 88 C60 78 60 68 61 58 Z" fill="#fff" opacity="0.08"/>`;
    // فتحة الوجه (تعيد لون الشماغ فوق الجبين)
    s += `<path d="M70 60 C70 50 84 45 100 45 C116 45 130 50 130 60 C130 56 118 51 100 51 C82 51 70 56 70 60 Z" fill="#c52a2a"/>`;
    s += agalSVG();
    return s;
  }

  const c = HEAD_COLORS[gender] || HEAD_COLORS.male;
  if (gender === 'female') {
    // شيلة تغطّي التاج والكتفين وتؤطّر الوجه
    let s = `<path d="M57 60 C57 16 143 16 143 60 C146 92 144 126 138 154 C125 142 116 146 110 153
        Q100 150 90 153 C84 146 75 142 62 154 C56 126 54 92 57 60 Z" fill="url(#gHead)"/>`;
    // طيّة/ظل
    s += `<path d="M57 60 C57 16 143 16 143 60 C144 72 144 84 143 96 C100 70 100 70 57 96 C56 84 56 72 57 60 Z" fill="${c.shade}" opacity="0.8"/>`;
    s += `<path d="M62 120 Q70 145 66 152" stroke="${c.line}" stroke-width="1.4" fill="none" opacity="0.5"/>`;
    s += `<path d="M138 120 Q130 145 134 152" stroke="${c.line}" stroke-width="1.4" fill="none" opacity="0.5"/>`;
    // فتحة الوجه
    s += faceHole('url(#gFace)');
    // حافة الشيلة حول الوجه
    s += `<path d="M70 60 C70 50 84 45 100 45 C116 45 130 50 130 60" stroke="${c.line}" stroke-width="1.6" fill="none" opacity="0.6"/>`;
    return s;
  }

  // ===== غترة بيضاء + عقال (رجل) =====
  let s = `<path d="M61 58 C61 16 139 16 139 58 C141 88 139 118 135 142 C124 132 116 134 110 139 L110 92 Q100 80 90 92 L90 139 C84 134 76 132 65 142 C61 118 59 88 61 58 Z" fill="url(#gHead)"/>`;
  // ظل علوي ناعم
  s += `<path d="M61 58 C61 16 139 16 139 58 C140 70 140 80 139 90 C100 66 100 66 61 90 C60 80 60 70 61 58 Z" fill="${c.shade}" opacity="0.55"/>`;
  // طيّات الغترة الجانبية
  s += `<path d="M72 96 Q68 120 70 138" stroke="${c.line}" stroke-width="1.4" fill="none" opacity="0.6"/>`;
  s += `<path d="M128 96 Q132 120 130 138" stroke="${c.line}" stroke-width="1.4" fill="none" opacity="0.6"/>`;
  s += `<path d="M84 92 L84 132 M116 92 L116 132" stroke="${c.line}" stroke-width="1" fill="none" opacity="0.35"/>`;
  // فتحة الوجه (تعيد لون الغترة فوق الجبين)
  s += `<path d="M70 60 C70 50 84 45 100 45 C116 45 130 50 130 60 C130 56 118 51 100 51 C82 51 70 56 70 60 Z" fill="${c.cloth}"/>`;
  s += agalSVG();
  return s;
}

/* ===== العقال (حبل أسود مجدول يجلس على التاج) ===== */
function agalSVG() {
  let s = `<g fill="none" stroke="#16161a" stroke-linecap="round">`;
  // حلقتان رئيسيتان
  s += `<path d="M68 52 C76 43 124 43 132 52" stroke-width="7"/>`;
  s += `<path d="M67 60 C76 51 124 51 133 60" stroke-width="7"/>`;
  s += `</g>`;
  // لمعان الجدل
  s += `<g fill="none" stroke="#3a3a40" stroke-width="1.4" opacity="0.7">`;
  s += `<path d="M72 50 C80 44 120 44 128 50"/>`;
  s += `<path d="M71 58 C80 52 120 52 129 58"/>`;
  s += `</g>`;
  // عقدتان جانبيتان
  s += `<ellipse cx="68" cy="56" rx="4" ry="6" fill="#16161a"/><ellipse cx="132" cy="56" rx="4" ry="6" fill="#16161a"/>`;
  return s;
}

/* ===== العيون ===== */
function eyesSVG(eyes) {
  if (eyes === 'eyes_shades') {
    return `<g>
      <path d="M73 67 q12 -3 23 0 q1 10 -5 13 q-10 2 -16 -2 q-3 -5 -2 -11z" fill="#15151a"/>
      <path d="M104 67 q12 -3 23 0 q1 10 -5 13 q-10 2 -16 -2 q-3 -5 -2 -11z" fill="#15151a"/>
      <rect x="96" y="70" width="8" height="3" rx="1.5" fill="#15151a"/>
      <path d="M76 69 q6 -2 11 0" stroke="#5a5a62" stroke-width="2" fill="none" opacity="0.7"/>
    </g>`;
  }
  if (eyes === 'eyes_sport') {
    return `<g>
      <path d="M71 65 q29 -10 58 0 q3 14 -5 19 q-24 6 -48 0 q-8 -5 -5 -19z" fill="#23805f" opacity="0.92"/>
      <path d="M75 69 q25 -6 50 0" stroke="#9bf3da" stroke-width="2.4" fill="none" opacity="0.75"/>
      <path d="M77 78 q23 4 46 0" stroke="#0c3e2c" stroke-width="1.6" fill="none" opacity="0.5"/>
    </g>`;
  }
  // عيون لوزية
  return `<g>
    <path d="M78 72 q8 -7 15 0 q-8 7 -15 0z" fill="#fff"/>
    <path d="M107 72 q8 -7 15 0 q-8 7 -15 0z" fill="#fff"/>
    <circle cx="85.5" cy="72" r="3.7" fill="#2a1a10"/>
    <circle cx="114.5" cy="72" r="3.7" fill="#2a1a10"/>
    <circle cx="86.8" cy="70.8" r="1.2" fill="#fff"/>
    <circle cx="115.8" cy="70.8" r="1.2" fill="#fff"/>
  </g>`;
}

/* ===== الأحذية ===== */
function shoesSVG(shoes) {
  let col = '#5a4632', accent = '#3a2e20', sole = '#2a2018';
  if (shoes === 'shoes_runner') { col = '#fefefe'; accent = '#23805f'; sole = '#cfcfcf'; }
  if (shoes === 'shoes_gold')   { col = '#edca5f'; accent = '#cda537'; sole = '#b08e2c'; }
  return `<g>
    <path d="M70 217 q-3 9 4 10 l20 0 q4 -1 4 -6 l0 -5 z" fill="${col}"/>
    <path d="M102 217 q-3 9 4 10 l20 0 q4 -1 4 -6 l0 -5 z" fill="${col}"/>
    <path d="M70 226 l28 0 M102 226 l28 0" stroke="${sole}" stroke-width="3" stroke-linecap="round"/>
    <path d="M74 220 q10 -3 18 1 M106 220 q10 -3 18 1" stroke="${accent}" stroke-width="2.4" fill="none"/>
  </g>`;
}
