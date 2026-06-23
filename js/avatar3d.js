/* ===== شخصية إماراتية ثلاثية الأبعاد — أشكال ناعمة (lathe + رؤوس مدوّرة) =====
   جسم آدمي بأسلوب أنعم وأكثر احترافية، يتغيّر حسب الجنس والعتاد.
*/
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';
import { RoundedBoxGeometry } from './vendor/RoundedBoxGeometry.js';

const OUTFIT = {
  outfit_classic_male:   0xf3efe6,
  outfit_classic_female: 0x1d1f26,
  outfit_gold:           0xd8bd5e,
  outfit_navy:           0x2f4068,
  outfit_sport:          0x27b16b,
  outfit_red:            0x9e3b34,
};
const C_SKIN = 0xeebf94;

const darker = (hex, f) => {
  f = f || 0.82;
  return ((Math.round((hex >> 16 & 255) * f)) << 16) | ((Math.round((hex >> 8 & 255) * f)) << 8) | Math.round((hex & 255) * f);
};
const V2 = (x, y) => new THREE.Vector2(x, y);
function clothMat(color, rough) {
  const m = new THREE.MeshPhysicalMaterial({
    roughness: rough || 0.85, metalness: 0,
    sheen: 0.25, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x8a8a8a),
  });
  m.color.set(color);
  return m;
}

/* ===== نقشة الشماغ ===== */
function shemaghTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#c41f1f'; x.fillRect(0, 0, s, s);
  const step = s / 8;
  x.strokeStyle = 'rgba(110,12,12,0.6)'; x.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step + s, s); x.stroke();
    x.beginPath(); x.moveTo(i * step, s); x.lineTo(i * step + s, 0); x.stroke();
  }
  x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2.5;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, s); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(s, i * step); x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2, 2);
  return t;
}

/* ===== هالة نيون أرضية ===== */
function glowTexture(color) {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  const g = x.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, color);
  g.addColorStop(0.35, color.replace('1)', '0.5)'));
  g.addColorStop(1, color.replace('1)', '0)'));
  x.fillStyle = g; x.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(c);
}

/* ===== بناء الشخصية ===== */
function buildCharacter(gender, eq) {
  const G = new THREE.Group();
  const isF = gender === 'female';

  const robeColor = eq.outfit === 'outfit_classic'
    ? (isF ? OUTFIT.outfit_classic_female : OUTFIT.outfit_classic_male)
    : (OUTFIT[eq.outfit] || OUTFIT.outfit_classic_male);
  const headCloth = isF ? 0x1d1f26 : 0xfbfaf6;

  let shoeColor = 0x33323a;
  if (eq.shoes === 'shoes_runner') shoeColor = 0xf0f0f0;
  if (eq.shoes === 'shoes_gold') shoeColor = 0xe7c454;

  const mat = {
    skin:    new THREE.MeshStandardMaterial({ color: C_SKIN, roughness: 0.5 }),
    robe:    clothMat(robeColor),
    cloth:   clothMat(headCloth, 0.8),
    trouser: clothMat(0x33333c, 0.9),
    dark:    new THREE.MeshStandardMaterial({ color: 0x17171b, roughness: 0.4 }),
    hair:    new THREE.MeshStandardMaterial({ color: 0x271a10, roughness: 0.7 }),
    gold:    new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.25, metalness: 0.8 }),
    white:   new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.35 }),
    eye:     new THREE.MeshStandardMaterial({ color: 0x241810, roughness: 0.25 }),
    lip:     new THREE.MeshStandardMaterial({ color: 0xb3604c, roughness: 0.5 }),
    glass:   new THREE.MeshPhysicalMaterial({ color: 0x111114, roughness: 0.08, metalness: 0.3, clearcoat: 1 }),
    shoe:    new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.55, metalness: eq.shoes === 'shoes_gold' ? 0.6 : 0.1 }),
  };

  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    if (x !== undefined) mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    G.add(mesh); return mesh;
  };
  const lathe = (pts, phiStart, phiLen) =>
    new THREE.LatheGeometry(pts, 56, phiStart || 0, phiLen || Math.PI * 2);

  const shoulderX = isF ? 0.28 : 0.32;

  /* ===== الساقان (سروال) + الحذاء ===== */
  if (!isF) {
    const legs = [{ x: -0.15, z: 0.1 }, { x: 0.16, z: -0.04 }];
    legs.forEach(L => {
      add(new THREE.CapsuleGeometry(0.13, 0.55, 8, 16), mat.trouser, L.x, 1.16, L.z * 0.5);
      add(new THREE.CapsuleGeometry(0.115, 0.5, 8, 16), mat.trouser, L.x, 0.6, L.z);
      add(new RoundedBoxGeometry(0.2, 0.18, 0.36, 3, 0.06), mat.shoe, L.x, 0.13, L.z + 0.07);
    });
  }

  /* ===== الجذع (شكل ناعم بالدوران) ===== */
  const torsoTop = isF ? 2.6 : 2.58;
  const torso = add(lathe([
    V2(0.02, 1.42), V2(0.24, 1.46), V2(0.28, 1.7), V2(0.305, 2.0),
    V2(0.3, 2.22), V2(0.25, 2.42), V2(0.16, 2.54), V2(0.12, torsoTop),
  ]), mat.robe);
  torso.scale.z = 0.86;

  /* ===== الرداء السفلي ===== */
  if (!isF) {
    // ثوب مفتوح من الأمام يكشف الأرجل
    const skirt = add(lathe([
      V2(0.45, 0.26), V2(0.45, 0.34), V2(0.37, 0.8), V2(0.31, 1.25), V2(0.27, 1.55),
    ], 0.85, Math.PI * 2 - 1.7), new THREE.MeshPhysicalMaterial({ color: robeColor, roughness: 0.85, sheen: 0.22, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x8a8a8a), side: THREE.DoubleSide }));
    skirt.scale.z = 0.92;
    // حزام
    add(new THREE.TorusGeometry(0.27, 0.028, 10, 40), mat.dark, 0, 1.5, 0).rotation.x = Math.PI / 2;
    add(new RoundedBoxGeometry(0.09, 0.07, 0.05, 2, 0.02), mat.gold, 0, 1.5, 0.24);
    // كسرة + أزرار + فروخة
    add(new RoundedBoxGeometry(0.028, 1.0, 0.03, 2, 0.01), new THREE.MeshStandardMaterial({ color: darker(robeColor, 0.85), roughness: 0.7 }), 0, 2.0, 0.27).rotation.x = 0.05;
    [2.3, 2.14, 1.98].forEach(by => add(new THREE.SphereGeometry(0.018, 12, 12), mat.dark, 0, by, 0.27 + (2.2 - by) * 0.03));
    add(new THREE.ConeGeometry(0.025, 0.12, 12), mat.dark, 0.09, 2.3, 0.27);
  } else {
    // عباية طويلة محتشمة
    const ab = add(lathe([
      V2(0.5, 0.24), V2(0.5, 0.32), V2(0.4, 0.9), V2(0.32, 1.6),
      V2(0.28, 2.1), V2(0.22, 2.4), V2(0.12, 2.58),
    ]), mat.robe);
    ab.scale.z = 0.9;
    add(new RoundedBoxGeometry(0.022, 2.2, 0.03, 2, 0.01), new THREE.MeshStandardMaterial({ color: darker(robeColor, 0.8), roughness: 0.7 }), 0, 1.4, 0.31);
    if (eq.outfit === 'outfit_gold' || eq.outfit === 'outfit_red') {
      [-0.06, 0.06].forEach(gx => add(new RoundedBoxGeometry(0.018, 2.2, 0.03, 2, 0.008), mat.gold, gx, 1.4, 0.305));
    }
    // حذاء يطلّ قليلاً
    [-0.1, 0.12].forEach(fx => add(new RoundedBoxGeometry(0.16, 0.14, 0.3, 3, 0.05), mat.shoe, fx, 0.11, 0.08));
  }
  if (eq.outfit === 'outfit_sport') {
    add(new THREE.TorusGeometry(0.3, 0.022, 8, 44), new THREE.MeshStandardMaterial({ color: 0xf1cf63, roughness: 0.5 }), 0, 1.78, 0).rotation.x = Math.PI / 2;
  }

  /* ===== الذراعان (مجموعتان مع وقفة مسترخية) ===== */
  [-1, 1].forEach(s => {
    const arm = new THREE.Group();
    const up = new THREE.Mesh(new THREE.CapsuleGeometry(0.1, 0.4, 8, 16), mat.robe); up.position.y = -0.24; up.castShadow = true; arm.add(up);
    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.088, 0.38, 8, 16), mat.robe); fore.position.y = -0.62; fore.castShadow = true; arm.add(fore);
    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.095, 18, 16), mat.skin); hand.position.set(0, -0.86, 0.02); hand.castShadow = true; arm.add(hand);
    arm.position.set(s * shoulderX, 2.46, 0);
    arm.rotation.z = s * 0.13;
    arm.rotation.x = -0.06;
    G.add(arm);
  });

  /* ===== الرقبة والرأس ===== */
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.16, 16), mat.skin, 0, 2.64, 0);
  const head = add(new THREE.SphereGeometry(0.25, 40, 32), mat.skin, 0, 2.9, 0.02);
  head.scale.set(0.95, 1.07, 0.96);
  add(new THREE.SphereGeometry(0.044, 14, 14), mat.skin, -0.235, 2.89, 0.03);
  add(new THREE.SphereGeometry(0.044, 14, 14), mat.skin, 0.235, 2.89, 0.03);

  /* ===== ملامح الوجه ===== */
  const HY = 2.9, FZ = 0.24;
  const brow = new THREE.TorusGeometry(0.05, 0.012, 8, 14, Math.PI);
  add(brow, mat.hair, -0.085, HY + 0.075, FZ - 0.02).rotation.set(0.3, 0, 0);
  add(brow, mat.hair, 0.085, HY + 0.075, FZ - 0.02).rotation.set(0.3, 0, 0);
  const wearShades = eq.eyes === 'eyes_shades' || eq.eyes === 'eyes_sport';
  if (!wearShades) {
    const iris = new THREE.MeshStandardMaterial({ color: 0x55351c, roughness: 0.3 });
    [-0.082, 0.082].forEach(ex => {
      const sc = add(new THREE.SphereGeometry(0.04, 16, 16), mat.white, ex, HY + 0.025, FZ - 0.03);
      sc.scale.set(1.2, 1, 0.5); sc.castShadow = false;
      add(new THREE.SphereGeometry(0.022, 14, 14), iris, ex, HY + 0.023, FZ - 0.005).castShadow = false;
      add(new THREE.SphereGeometry(0.011, 8, 8), mat.eye, ex, HY + 0.023, FZ + 0.006).castShadow = false;
      add(new THREE.SphereGeometry(0.006, 6, 6), mat.white, ex + 0.012, HY + 0.045, FZ + 0.01).castShadow = false;
      if (isF) {
        const lash = add(new THREE.TorusGeometry(0.036, 0.006, 6, 14, Math.PI), mat.eye, ex, HY + 0.04, FZ - 0.02);
        lash.rotation.set(-0.5, 0, Math.PI); lash.castShadow = false;
      }
    });
  }
  add(new THREE.SphereGeometry(0.028, 14, 14), mat.skin, 0, HY - 0.03, FZ + 0.025).scale.set(0.85, 1.15, 1);
  const mouth = add(new THREE.TorusGeometry(0.05, 0.013, 10, 20, Math.PI), mat.lip, 0, HY - 0.1, FZ - 0.02);
  mouth.rotation.set(0, 0, Math.PI); mouth.castShadow = false;
  if (!isF) {
    const beard = add(new THREE.SphereGeometry(0.245, 28, 22, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.85, transparent: true, opacity: 0.3 }), 0, HY, 0.02);
    beard.scale.set(1.0, 1.06, 1.0); beard.castShadow = false;
  }

  /* ===== غطاء الرأس ===== */
  addGear(add, lathe, mat, gender, eq);

  /* ===== إكسسوارات ===== */
  if (eq.accessory === 'acc_watch') {
    add(new RoundedBoxGeometry(0.1, 0.05, 0.12, 2, 0.02), mat.dark, -0.5, 1.62, 0.06);
    add(new RoundedBoxGeometry(0.07, 0.03, 0.08, 2, 0.01), new THREE.MeshStandardMaterial({ color: 0x46d6c0, emissive: 0x0a3b34, roughness: 0.3 }), -0.5, 1.63, 0.07);
  }
  if (eq.accessory === 'acc_medal') {
    const bp = clothMat(0x4a4d3a, 0.9);
    add(new RoundedBoxGeometry(0.4, 0.56, 0.22, 4, 0.06), bp, 0, 2.1, -0.27);
    add(new RoundedBoxGeometry(0.28, 0.18, 0.06, 3, 0.03), mat.dark, 0, 2.22, -0.4);
    [-0.15, 0.15].forEach(sx => add(new RoundedBoxGeometry(0.06, 0.5, 0.05, 2, 0.02), bp, sx, 2.15, 0.2));
  }
  if (eq.accessory === 'acc_headphone') {
    const hp = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5 });
    add(new THREE.TorusGeometry(0.27, 0.022, 10, 32, Math.PI), hp, 0, HY + 0.16, 0.02);
    [-0.26, 0.26].forEach(hx => add(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 18), hp, hx, HY + 0.02, 0.02).rotation.z = Math.PI / 2);
  }

  G.traverse(o => {
    if (o.material && 'envMapIntensity' in o.material) {
      o.material.envMapIntensity = (o.material.metalness || 0) > 0.4 ? 0.85 : 0.35;
    }
  });

  return G;
}

/* ===== غطاء الرأس (غترة/شماغ/شيلة...) ===== */
function addGear(add, lathe, mat, gender, eq) {
  const isF = gender === 'female';
  const HY = 2.9, FZ = 0.24;

  function ponytail() { add(new THREE.SphereGeometry(0.085, 16, 14), mat.hair, 0, HY - 0.02, -0.22); }

  // النظارات
  if (eq.eyes === 'eyes_shades') {
    add(new THREE.TorusGeometry(0.058, 0.016, 10, 20), mat.glass, -0.082, HY + 0.025, FZ - 0.01).scale.set(1.3, 1, 0.4);
    add(new THREE.TorusGeometry(0.058, 0.016, 10, 20), mat.glass, 0.082, HY + 0.025, FZ - 0.01).scale.set(1.3, 1, 0.4);
    add(new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, -0.082, HY + 0.025, FZ - 0.02).scale.set(1.3, 0.6, 0.5);
    add(new THREE.SphereGeometry(0.07, 16, 12, 0, Math.PI * 2, 0, Math.PI / 2), mat.glass, 0.082, HY + 0.025, FZ - 0.02).scale.set(1.3, 0.6, 0.5);
    add(new THREE.BoxGeometry(0.06, 0.012, 0.012), mat.dark, 0, HY + 0.035, FZ);
  } else if (eq.eyes === 'eyes_sport') {
    const gog = add(new THREE.SphereGeometry(0.17, 20, 14, 0, Math.PI, 0, Math.PI / 2),
      new THREE.MeshPhysicalMaterial({ color: 0x1f8f63, roughness: 0.15, metalness: 0.2, clearcoat: 1, transparent: true, opacity: 0.9 }),
      0, HY + 0.02, FZ - 0.12);
    gog.scale.set(1, 0.7, 1); gog.rotation.x = -0.1;
  }

  // كاب رياضي
  if (eq.head === 'head_cap') {
    add(new THREE.SphereGeometry(0.265, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0x27b16b, roughness: 0.6 }), 0, HY + 0.04, 0).scale.set(1.04, 1.0, 1.06);
    add(new THREE.CylinderGeometry(0.25, 0.25, 0.035, 28, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1d8a52, roughness: 0.6 }), 0, HY + 0.04, 0.22).scale.set(0.95, 1, 1.25);
    add(new THREE.SphereGeometry(0.255, 24, 18, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.22), mat.hair, 0, HY - 0.03, -0.02);
    if (isF) ponytail();
    return;
  }
  // عصابة رأس
  if (eq.head === 'head_band') {
    add(new THREE.SphereGeometry(0.265, 26, 20, 0, Math.PI * 2, 0, Math.PI * 0.6), mat.hair, 0, HY + 0.02, 0).scale.set(1.03, 1.05, 1.04);
    add(new THREE.TorusGeometry(0.255, 0.034, 12, 32), new THREE.MeshStandardMaterial({ color: 0xe84393, roughness: 0.5 }), 0, HY + 0.1, 0).rotation.x = Math.PI / 2 - 0.12;
    if (isF) ponytail();
    return;
  }

  // غترة/شماغ/شيلة — قبّة ناعمة + انسدال بالدوران
  const isShemagh = eq.head === 'head_shemagh';
  const baseColor = isShemagh ? 0xffffff : (isF ? 0x1d1f26 : 0xfbfaf6);
  const domeMat = isShemagh
    ? new THREE.MeshStandardMaterial({ map: shemaghTexture(), color: 0xffffff, roughness: 0.8 })
    : clothMat(baseColor, 0.8);
  const drapeMat = isShemagh
    ? new THREE.MeshStandardMaterial({ map: shemaghTexture(), color: 0xffffff, roughness: 0.8, side: THREE.DoubleSide })
    : new THREE.MeshPhysicalMaterial({ color: baseColor, roughness: 0.82, sheen: 0.2, sheenRoughness: 0.8, sheenColor: new THREE.Color(0x8a8a8a), side: THREE.DoubleSide });

  const domeTheta = isF ? Math.PI * 0.5 : Math.PI * 0.46;
  add(new THREE.SphereGeometry(0.3, 36, 26, 0, Math.PI * 2, 0, domeTheta), domeMat, 0, HY + 0.04, 0).scale.set(1.06, 1.06, 1.1);
  // الانسدال (يترك الوجه مفتوحاً من الأمام)
  const gap = isF ? 1.6 : 1.9;
  const drape = add(lathe([
    V2(0.3, isF ? HY - 0.5 : HY - 0.4), V2(0.33, HY - 0.25), V2(0.33, HY - 0.05), V2(0.3, HY + 0.12),
  ], gap / 2, Math.PI * 2 - gap), drapeMat);
  drape.scale.z = 1.06;

  if (!isF) {
    // العقال (يجلس على التاج فوق الجبين)
    add(new THREE.TorusGeometry(0.305, 0.02, 12, 44), mat.dark, 0, HY + 0.14, 0).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.315, 0.02, 12, 44), mat.dark, 0, HY + 0.07, 0).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.026, 12, 12), mat.dark, 0, HY + 0.105, 0.31);
  }
  return;
}

/* ===== العارض (Viewer) ===== */
let V = null;

function mount(container, gender, eq) {
  if (V) { update(gender, eq); return; }

  const w = container.clientWidth || 220;
  const h = container.clientHeight || 260;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, w / h, 0.1, 100);
  camera.position.set(0, 1.85, 9.9);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x2a3b34, 0.85));
  const front = new THREE.DirectionalLight(0xfff3e0, 0.95);
  front.position.set(0, 3, 6);
  scene.add(front);
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(3.5, 6.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 22;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 5;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7affc8, 0.55);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.ShadowMaterial({ opacity: 0.32 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(3.2, 3.2),
    new THREE.MeshBasicMaterial({ map: glowTexture('rgba(0,245,160,1)'), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  scene.add(glow);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0x00f5a0, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
  const neonRing = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.02, 8, 64), ringMat);
  neonRing.rotation.x = -Math.PI / 2;
  neonRing.position.y = 0.05;
  scene.add(neonRing);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.55, 0);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  controls.minPolarAngle = Math.PI * 0.32;
  controls.maxPolarAngle = Math.PI * 0.56;
  controls.update();

  let charGroup = buildCharacter(gender, eq);
  scene.add(charGroup);

  function onResize() {
    const nw = container.clientWidth || w, nh = container.clientHeight || h;
    camera.aspect = nw / nh; camera.updateProjectionMatrix();
    renderer.setSize(nw, nh);
  }
  window.addEventListener('resize', onResize);

  const clock = new THREE.Clock();
  let raf;
  function loop() {
    raf = requestAnimationFrame(loop);
    const t = clock.getElapsedTime();
    if (V && V.charGroup) {
      V.charGroup.position.y = Math.sin(t * 1.7) * 0.028;
      V.charGroup.rotation.z = Math.sin(t * 1.1) * 0.006;
    }
    neonRing.material.opacity = 0.6 + Math.sin(t * 2.2) * 0.25;
    controls.update();
    renderer.render(scene, camera);
  }

  V = { scene, camera, renderer, controls, charGroup, container, onResize, raf };
  loop();
}

function update(gender, eq) {
  if (!V) return;
  V.scene.remove(V.charGroup);
  disposeGroup(V.charGroup);
  V.charGroup = buildCharacter(gender, eq);
  V.scene.add(V.charGroup);
}

function disposeGroup(g) {
  g.traverse(o => {
    if (o.geometry) o.geometry.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach(m => m.dispose());
      else o.material.dispose();
    }
  });
}

window.FalajAvatar = { mount, update };
window.dispatchEvent(new Event('falaj-avatar-ready'));
