/* ===== مولّد شخصية إماراتية (SVG) =====
   يبني الشخصية حسب الجنس والقطع المرتداة.
   equipped = { outfit, head, eyes, accessory, shoes }
*/

const OUTFIT_COLORS = {
  outfit_classic_male:   { main: '#f6f4ef', shade: '#dcd8cf' },
  outfit_classic_female: { main: '#15171c', shade: '#0b0c0f' },
  outfit_gold:           { main: '#e8c45a', shade: '#c79f34' },
  outfit_navy:           { main: '#283a5e', shade: '#1c2a45' },
  outfit_sport:          { main: '#1f6f54', shade: '#15503c' },
  outfit_red:            { main: '#9e2b2b', shade: '#7a1f1f' },
};

const HEAD_COLORS = {
  head_default_male:   { cloth: '#fbfbf8', shade: '#e4e2da' },
  head_default_female: { cloth: '#16181d', shade: '#0c0d11' },
};

function buildAvatar(gender, eq) {
  const skin = '#e8b98c';
  const skinShade = '#d49f6f';

  // لون الزي
  let outfit;
  if (eq.outfit === 'outfit_classic') {
    outfit = gender === 'female' ? OUTFIT_COLORS.outfit_classic_female : OUTFIT_COLORS.outfit_classic_male;
  } else {
    outfit = OUTFIT_COLORS[eq.outfit] || OUTFIT_COLORS.outfit_classic_male;
  }

  const parts = [];

  // ===== الأرضية / الظل =====
  parts.push(`<ellipse cx="100" cy="228" rx="58" ry="9" fill="#000" opacity="0.25"/>`);

  // ===== الأحذية =====
  parts.push(shoesSVG(eq.shoes));

  // ===== الجسم / الزي =====
  parts.push(bodySVG(gender, outfit, eq.outfit));

  // ===== الذراعان =====
  parts.push(`<path d="M62 132 q-14 18 -10 44" stroke="${outfit.shade}" stroke-width="15" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M138 132 q14 18 10 44" stroke="${outfit.main}" stroke-width="15" fill="none" stroke-linecap="round"/>`);
  // اليدان
  parts.push(`<circle cx="50" cy="178" r="9" fill="${skin}"/>`);
  parts.push(`<circle cx="150" cy="178" r="9" fill="${skin}"/>`);

  // ===== ساعة على المعصم (إكسسوار) =====
  if (eq.accessory === 'acc_watch') {
    parts.push(`<rect x="143" y="166" width="14" height="9" rx="2" fill="#222" transform="rotate(20 150 170)"/>`);
    parts.push(`<rect x="145" y="167" width="10" height="6" rx="1" fill="#4ad6c0" transform="rotate(20 150 170)"/>`);
  }

  // ===== الرقبة =====
  parts.push(`<rect x="92" y="92" width="16" height="20" rx="6" fill="${skinShade}"/>`);

  // ===== الوجه =====
  parts.push(`<circle cx="100" cy="74" r="34" fill="${skin}"/>`);
  parts.push(`<ellipse cx="100" cy="80" rx="34" ry="30" fill="${skin}"/>`);
  // أذنان
  parts.push(`<circle cx="67" cy="76" r="6" fill="${skin}"/><circle cx="133" cy="76" r="6" fill="${skin}"/>`);

  // ===== غطاء الرأس =====
  parts.push(headwearSVG(gender, eq.head));

  // ===== الحاجبان =====
  parts.push(`<path d="M82 64 q8 -5 16 0" stroke="#3a2a1c" stroke-width="3" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M102 64 q8 -5 16 0" stroke="#3a2a1c" stroke-width="3" fill="none" stroke-linecap="round"/>`);

  // ===== العيون / النظارة =====
  parts.push(eyesSVG(eq.eyes));

  // ===== الأنف والفم =====
  parts.push(`<path d="M100 74 q3 6 0 10" stroke="${skinShade}" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);
  parts.push(`<path d="M90 92 q10 8 20 0" stroke="#7a3b2e" stroke-width="2.5" fill="none" stroke-linecap="round"/>`);

  // لحية خفيفة للرجل
  if (gender === 'male') {
    parts.push(`<path d="M74 84 q26 30 52 0 q-4 22 -26 24 q-22 -2 -26 -24z" fill="#3a2a1c" opacity="0.32"/>`);
  }

  // ===== السماعات (إكسسوار فوق الرأس) =====
  if (eq.accessory === 'acc_headphone') {
    parts.push(`<path d="M64 60 q36 -40 72 0" stroke="#e8455b" stroke-width="6" fill="none"/>`);
    parts.push(`<rect x="58" y="58" width="13" height="22" rx="6" fill="#e8455b"/>`);
    parts.push(`<rect x="129" y="58" width="13" height="22" rx="6" fill="#e8455b"/>`);
  }

  // ===== ميدالية على الصدر (إكسسوار) =====
  if (eq.accessory === 'acc_medal') {
    parts.push(`<path d="M100 112 l-12 26 M100 112 l12 26" stroke="#c0392b" stroke-width="4" fill="none"/>`);
    parts.push(`<circle cx="100" cy="146" r="11" fill="#f1c40f" stroke="#caa106" stroke-width="2"/>`);
    parts.push(`<text x="100" y="151" font-size="13" text-anchor="middle">★</text>`);
  }

  return `<svg viewBox="0 0 200 240" xmlns="http://www.w3.org/2000/svg" aria-label="الشخصية">${parts.join('')}</svg>`;
}

function bodySVG(gender, outfit, outfitId) {
  if (gender === 'female') {
    // عباية واسعة
    let s = `<path d="M72 108 q28 -14 56 0 l22 110 q-50 16 -100 0 z" fill="${outfit.main}"/>`;
    s += `<path d="M100 108 l0 110" stroke="${outfit.shade}" stroke-width="2" opacity="0.5"/>`;
    if (outfitId === 'outfit_gold' || outfitId === 'outfit_red') {
      s += `<path d="M72 108 q28 -14 56 0 l3 14 q-31 -12 -62 0 z" fill="${outfit.shade}"/>`;
    }
    return s;
  }
  // كندورة (رجل)
  let s = `<path d="M76 108 q24 -12 48 0 l16 110 q-40 12 -80 0 z" fill="${outfit.main}"/>`;
  // طوق الرقبة
  s += `<path d="M88 110 q12 10 24 0" stroke="${outfit.shade}" stroke-width="2.5" fill="none"/>`;
  // التطريز الأمامي (الكسرة)
  s += `<path d="M100 116 l0 96" stroke="${outfit.shade}" stroke-width="2"/>`;
  if (outfitId === 'outfit_sport') {
    s += `<path d="M76 150 l 70 6" stroke="#f1cf63" stroke-width="4" opacity="0.8"/>`;
  }
  return s;
}

function headwearSVG(gender, head) {
  // كاب رياضي
  if (head === 'head_cap') {
    return `<path d="M66 60 q34 -34 68 0 q2 6 -2 8 q-32 -10 -64 0 q-4 -2 -2 -8z" fill="#1f6f54"/>
            <path d="M66 67 q-16 2 -20 9 q22 -2 24 -4z" fill="#15503c"/>
            <circle cx="100" cy="40" r="4" fill="#15503c"/>`;
  }
  // عصابة رأس
  if (head === 'head_band') {
    return `<path d="M66 58 q34 -16 68 0 l0 8 q-34 -14 -68 0z" fill="#e84393"/>
            <ellipse cx="100" cy="44" rx="36" ry="20" fill="#2b1d12"/>`;
  }
  // شماغ أحمر (نمط مربعات)
  if (head === 'head_shemagh') {
    let s = `<path d="M60 70 q40 -52 80 0 q6 14 2 64 q-14 -10 -22 -8 l0 -34 q-30 -22 -60 0 l0 34 q-8 -2 -22 8 q-4 -50 2 -64z" fill="#d63031"/>`;
    s += `<path d="M60 70 q40 -52 80 0 q4 10 3 28 q-43 -22 -86 0 q-1 -18 3 -28z" fill="#fff" opacity="0.22"/>`;
    // العقال الأسود
    s += `<ellipse cx="100" cy="44" rx="33" ry="9" fill="none" stroke="#111" stroke-width="6"/>`;
    s += `<ellipse cx="100" cy="52" rx="33" ry="9" fill="none" stroke="#111" stroke-width="6"/>`;
    return s;
  }

  // الافتراضي: غترة بيضاء (رجل) أو شيلة (أنثى)
  const c = gender === 'female' ? HEAD_COLORS.head_default_female : HEAD_COLORS.head_default_male;
  if (gender === 'female') {
    // شيلة تغطي الرأس والكتفين مع فتحة تُظهر الوجه
    let s = `<path d="M56 78 q44 -60 88 0 q9 40 4 80 q-22 -10 -34 -6 l0 -2 q-58 0 -58 0 l0 2 q-12 -4 -34 6 q-5 -40 4 -80z" fill="${c.cloth}"/>`;
    // ظل علوي خفيف
    s += `<path d="M56 78 q44 -60 88 0 q2 9 3 16 q-47 -26 -94 0 q1 -7 3 -16z" fill="${c.shade}" opacity="0.55"/>`;
    // فتحة الوجه (بشرة) تُظهر العينين والأنف والفم
    s += `<ellipse cx="100" cy="80" rx="27" ry="29" fill="#e8b98c"/>`;
    return s;
  }
  // غترة بيضاء + عقال أسود
  let s = `<path d="M60 70 q40 -54 80 0 q6 14 2 66 q-14 -10 -22 -8 l0 -36 q-30 -20 -60 0 l0 36 q-8 -2 -22 8 q-4 -52 2 -66z" fill="${c.cloth}"/>`;
  s += `<path d="M60 70 q40 -54 80 0 q3 8 3 18 q-43 -22 -86 0 q0 -10 3 -18z" fill="${c.shade}" opacity="0.7"/>`;
  s += `<ellipse cx="100" cy="44" rx="33" ry="9" fill="none" stroke="#161616" stroke-width="6"/>`;
  s += `<ellipse cx="100" cy="52" rx="33" ry="9" fill="none" stroke="#161616" stroke-width="6"/>`;
  return s;
}

function eyesSVG(eyes) {
  if (eyes === 'eyes_shades') {
    return `<g>
      <rect x="74" y="68" width="22" height="13" rx="5" fill="#111"/>
      <rect x="104" y="68" width="22" height="13" rx="5" fill="#111"/>
      <rect x="96" y="72" width="8" height="3" fill="#111"/>
      <rect x="77" y="70" width="8" height="4" rx="2" fill="#444"/>
    </g>`;
  }
  if (eyes === 'eyes_sport') {
    return `<g>
      <path d="M72 66 q28 -8 56 0 q2 12 -4 16 q-24 6 -48 0 q-6 -4 -4 -16z" fill="#1f6f54" opacity="0.85"/>
      <path d="M76 70 q24 -6 48 0" stroke="#8ef0d6" stroke-width="2" fill="none" opacity="0.6"/>
    </g>`;
  }
  // عيون عادية
  return `<g>
    <circle cx="86" cy="74" r="4.5" fill="#2a1a10"/>
    <circle cx="114" cy="74" r="4.5" fill="#2a1a10"/>
    <circle cx="87.5" cy="72.5" r="1.5" fill="#fff"/>
    <circle cx="115.5" cy="72.5" r="1.5" fill="#fff"/>
  </g>`;
}

function shoesSVG(shoes) {
  let col = '#4a3b2a', accent = '#2e251a';
  if (shoes === 'shoes_runner') { col = '#ffffff'; accent = '#1f6f54'; }
  if (shoes === 'shoes_gold')   { col = '#e8c45a'; accent = '#c79f34'; }
  return `<g>
    <ellipse cx="84" cy="222" rx="16" ry="8" fill="${col}"/>
    <ellipse cx="116" cy="222" rx="16" ry="8" fill="${col}"/>
    <path d="M70 222 q14 -4 28 0" stroke="${accent}" stroke-width="3" fill="none"/>
    <path d="M102 222 q14 -4 28 0" stroke="${accent}" stroke-width="3" fill="none"/>
  </g>`;
}
