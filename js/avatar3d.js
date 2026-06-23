/* ===== شخصية إماراتية واقعية (بأسلوب PUBG) ثلاثية الأبعاد =====
   جسم آدمي بنسب طبيعية يرتدي الزي الإماراتي، يتغيّر حسب الجنس والعتاد.
   equipped = { outfit, head, eyes, accessory, shoes }
*/
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

/* ===== ألوان الزي (الكندورة/العباية) ===== */
const OUTFIT = {
  outfit_classic_male:   0xf6f3ec,
  outfit_classic_female: 0x20222a,
  outfit_gold:           0xdcc05e,
  outfit_navy:           0x2f4068,
  outfit_sport:          0x2bbf6a,
  outfit_red:            0x9e3b34,
};
const C_SKIN = 0xeebf94;

const darker = (hex, f) => {
  f = f || 0.82;
  return ((Math.round((hex >> 16 & 255) * f)) << 16) | ((Math.round((hex >> 8 & 255) * f)) << 8) | Math.round((hex & 255) * f);
};

/* ===== نقشة الشماغ (canvas texture) ===== */
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

/* ===== بناء الشخصية (محارب إماراتي بأسلوب PUBG) ===== */
function buildCharacter(gender, eq) {
  const G = new THREE.Group();
  const isF = gender === 'female';

  const robeColor = eq.outfit === 'outfit_classic'
    ? (isF ? OUTFIT.outfit_classic_female : OUTFIT.outfit_classic_male)
    : (OUTFIT[eq.outfit] || OUTFIT.outfit_classic_male);
  const headCloth = isF ? 0x20222a : 0xfcfbf8;
  const line = darker(robeColor, 0.86);

  let shoeColor = 0x3a3a3e;                     // حذاء قتالي داكن
  if (eq.shoes === 'shoes_runner') shoeColor = 0xf2f2f2;
  if (eq.shoes === 'shoes_gold') shoeColor = 0xe7c454;
  if (eq.shoes === 'shoes_default') shoeColor = 0x2e2a22;

  const mat = {
    skin:    new THREE.MeshStandardMaterial({ color: C_SKIN, roughness: 0.55 }),
    robe:    new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.9 }),
    robe2:   new THREE.MeshStandardMaterial({ color: robeColor, roughness: 0.9, side: THREE.DoubleSide }),
    line:    new THREE.MeshStandardMaterial({ color: line, roughness: 0.8 }),
    cloth:   new THREE.MeshStandardMaterial({ color: headCloth, roughness: 0.82 }),
    trouser: new THREE.MeshStandardMaterial({ color: 0x3b3a2e, roughness: 0.92 }),
    dark:    new THREE.MeshStandardMaterial({ color: 0x16161a, roughness: 0.45 }),
    vest:    new THREE.MeshStandardMaterial({ color: 0x2c2f33, roughness: 0.7, metalness: 0.1 }),
    hair:    new THREE.MeshStandardMaterial({ color: 0x2a1d12, roughness: 0.8 }),
    gold:    new THREE.MeshStandardMaterial({ color: 0xf1c40f, roughness: 0.3, metalness: 0.7 }),
    white:   new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    eye:     new THREE.MeshStandardMaterial({ color: 0x241810, roughness: 0.3 }),
    lip:     new THREE.MeshStandardMaterial({ color: 0xb3604c, roughness: 0.5 }),
    glass:   new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.15, metalness: 0.4 }),
    shoe:    new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.6, metalness: eq.shoes === 'shoes_gold' ? 0.6 : 0.1 }),
  };

  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    G.add(mesh);
    return mesh;
  };

  const shoulderX = isF ? 0.30 : 0.36;   // أكتاف عريضة (رياضية)

  /* ===== الساقان (وقفة لاعب: قدمان متباعدتان، واحدة للأمام) ===== */
  // L = القدم الأمامية (يسار الشخصية)، R = القدم الخلفية الثابتة
  const legs = [{ x: -0.17, fz: 0.13 }, { x: 0.18, fz: -0.05 }];
  legs.forEach(L => {
    add(new THREE.CapsuleGeometry(0.125, 0.5, 6, 12), mat.trouser, L.x, 1.12, L.fz * 0.5);  // فخذ
    add(new THREE.CapsuleGeometry(0.105, 0.46, 6, 12), mat.trouser, L.x, 0.58, L.fz);        // ساق
    add(new THREE.BoxGeometry(0.16, 0.12, 0.16), mat.dark, L.x, 0.92, L.fz + 0.05);          // واقي ركبة
    add(new THREE.BoxGeometry(0.19, 0.18, 0.32), mat.shoe, L.x, 0.13, L.fz + 0.07);          // حذاء
    add(new THREE.BoxGeometry(0.2, 0.06, 0.36), mat.dark, L.x, 0.04, L.fz + 0.08);           // نعل
  });

  /* ===== الحوض والحزام ===== */
  add(new THREE.BoxGeometry(0.44, 0.28, 0.32), mat.trouser, 0, 1.46, 0);
  add(new THREE.BoxGeometry(0.48, 0.09, 0.35), mat.dark, 0, 1.58, 0);
  add(new THREE.BoxGeometry(0.08, 0.08, 0.05), mat.gold, 0, 1.58, 0.18);

  /* ===== الجذع (V رياضي) + سترة ===== */
  add(new THREE.BoxGeometry(0.52, 0.5, 0.3), mat.robe, 0, 2.18, 0);     // صدر عريض
  add(new THREE.BoxGeometry(0.4, 0.34, 0.3), mat.robe, 0, 1.78, 0);     // خصر أضيق
  add(new THREE.SphereGeometry(0.16, 18, 14), mat.robe, -shoulderX, 2.5, 0);
  add(new THREE.SphereGeometry(0.16, 18, 14), mat.robe, shoulderX, 2.5, 0);
  // سترة تكتيكية خفيفة على الصدر (للرجل فقط)
  if (!isF) {
    add(new THREE.BoxGeometry(0.46, 0.4, 0.34), mat.vest, 0, 2.12, 0);
    [-0.12, 0.12].forEach(px => add(new THREE.BoxGeometry(0.13, 0.15, 0.08), mat.dark, px, 2.0, 0.19));
  }

  /* ===== الثوب الإماراتي المفتوح من الأمام (يكشف الأرجل) ===== */
  if (!isF) {
    const skirt = add(new THREE.CylinderGeometry(0.32, 0.46, 1.45, 40, 1, true, 0.8, Math.PI * 2 - 1.6), mat.robe2, 0, 0.9, 0);
    skirt.castShadow = true;
    // حواف الفتحة الأمامية مزخرفة
    [-1, 1].forEach(s => add(new THREE.BoxGeometry(0.03, 1.4, 0.04), mat.line, s * 0.22, 0.92, 0.34).rotation.x = -0.05);
    // كولّر + كسرة على الصدر
    add(new THREE.TorusGeometry(0.1, 0.022, 10, 22, Math.PI), mat.line, 0, 2.42, 0.18).rotation.set(Math.PI / 2, 0, 0);
    [2.3, 2.14, 1.98].forEach(by => add(new THREE.SphereGeometry(0.018, 10, 10), mat.dark, 0, by, 0.17));
    add(new THREE.ConeGeometry(0.025, 0.12, 10), mat.dark, 0.09, 2.28, 0.18);     // فروخة
  } else {
    // عباية طويلة محتشمة تغطّي الجذع حتى الكتفين
    const ab = add(new THREE.CylinderGeometry(0.33, 0.52, 2.5, 44), mat.robe, 0, 1.25, 0);
    ab.castShadow = true;
    add(new THREE.BoxGeometry(0.025, 2.4, 0.025), mat.line, 0, 1.25, 0.35).rotation.x = -0.04;
    if (eq.outfit === 'outfit_gold' || eq.outfit === 'outfit_red') {
      [-0.07, 0.07].forEach(gx => add(new THREE.BoxGeometry(0.02, 2.4, 0.03), mat.gold, gx, 1.25, 0.345).rotation.x = -0.04);
    }
  }
  if (eq.outfit === 'outfit_sport') {
    add(new THREE.TorusGeometry(0.34, 0.02, 8, 40), new THREE.MeshStandardMaterial({ color: 0xf1cf63, roughness: 0.5 }), 0, 1.7, 0).rotation.x = Math.PI / 2;
  }

  /* ===== الذراعان (مسترخيتان قليلاً للخارج — وقفة واثقة) ===== */
  [-1, 1].forEach(s => {
    const ax = s * shoulderX;
    add(new THREE.CapsuleGeometry(0.105, 0.46, 6, 12), mat.robe, ax + s * 0.05, 2.12, 0.0).rotation.z = -s * 0.16;  // عضد
    add(new THREE.CapsuleGeometry(0.092, 0.42, 6, 12), mat.robe, ax + s * 0.14, 1.7, 0.04).rotation.z = -s * 0.1;   // ساعد
    add(new THREE.SphereGeometry(0.095, 16, 14), mat.skin, ax + s * 0.2, 1.46, 0.06);                               // كفّ
  });

  /* ===== الرقبة والرأس ===== */
  add(new THREE.CylinderGeometry(0.1, 0.12, 0.18, 14), mat.skin, 0, 2.62, 0);
  const head = add(new THREE.SphereGeometry(0.25, 32, 28), mat.skin, 0, 2.9, 0.02);
  head.scale.set(0.95, 1.08, 0.98);
  add(new THREE.SphereGeometry(0.043, 12, 12), mat.skin, -0.235, 2.89, 0.03);
  add(new THREE.SphereGeometry(0.043, 12, 12), mat.skin, 0.235, 2.89, 0.03);

  /* ===== ملامح الوجه ===== */
  const HY = 2.9, FZ = 0.24;
  const browGeo = new THREE.BoxGeometry(0.088, 0.02, 0.04);
  add(browGeo, mat.hair, -0.083, HY + 0.08, FZ - 0.02).rotation.z = -0.1;
  add(browGeo, mat.hair, 0.083, HY + 0.08, FZ - 0.02).rotation.z = 0.1;
  const wearShades = eq.eyes === 'eyes_shades' || eq.eyes === 'eyes_sport';
  if (!wearShades) {
    const matIris = new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.35 });
    [-0.082, 0.082].forEach(ex => {
      const sc = add(new THREE.SphereGeometry(0.04, 14, 14), mat.white, ex, HY + 0.03, FZ - 0.03);
      sc.scale.set(1.15, 1, 0.5); sc.castShadow = false;
      add(new THREE.SphereGeometry(0.023, 12, 12), matIris, ex, HY + 0.028, FZ - 0.005).castShadow = false;
      add(new THREE.SphereGeometry(0.011, 8, 8), mat.eye, ex, HY + 0.028, FZ + 0.005).castShadow = false;
      if (isF) {
        const lash = add(new THREE.TorusGeometry(0.036, 0.006, 6, 14, Math.PI), mat.eye, ex, HY + 0.045, FZ - 0.02);
        lash.rotation.set(-0.5, 0, Math.PI); lash.castShadow = false;
      }
    });
  }
  add(new THREE.SphereGeometry(0.028, 12, 12), mat.skin, 0, HY - 0.03, FZ + 0.02).scale.set(0.9, 1.1, 1);  // أنف
  const mouth = add(new THREE.TorusGeometry(0.05, 0.013, 8, 18, Math.PI), mat.lip, 0, HY - 0.1, FZ - 0.02);
  mouth.rotation.set(0, 0, Math.PI); mouth.castShadow = false;
  if (!isF) {
    const beard = add(new THREE.SphereGeometry(0.245, 24, 20, 0, Math.PI * 2, Math.PI * 0.58, Math.PI * 0.42),
      new THREE.MeshStandardMaterial({ color: 0x3a2a1a, roughness: 0.85, transparent: true, opacity: 0.32 }),
      0, HY, 0.02);
    beard.scale.set(1.0, 1.06, 1.0); beard.castShadow = false;
  }

  /* ===== غطاء الرأس (غترة/عقال/شماغ...) ===== */
  addGear(add, mat, gender, eq);

  /* ===== إكسسوارات ===== */
  if (eq.accessory === 'acc_watch') {
    add(new THREE.BoxGeometry(0.1, 0.05, 0.12), mat.dark, -0.55, 1.5, 0.06);
    add(new THREE.BoxGeometry(0.07, 0.03, 0.08), new THREE.MeshStandardMaterial({ color: 0x46d6c0, emissive: 0x0a3b34, roughness: 0.3 }), -0.55, 1.51, 0.07);
  }
  if (eq.accessory === 'acc_medal') {
    // حقيبة ظهر تكتيكية
    const bp = new THREE.MeshStandardMaterial({ color: 0x4a4d3a, roughness: 0.85 });
    add(new THREE.BoxGeometry(0.4, 0.56, 0.22), bp, 0, 2.12, -0.26);
    add(new THREE.BoxGeometry(0.28, 0.18, 0.06), mat.dark, 0, 2.24, -0.39);
    [-0.15, 0.15].forEach(sx => add(new THREE.BoxGeometry(0.06, 0.5, 0.05), bp, sx, 2.16, 0.18));
  }
  if (eq.accessory === 'acc_headphone') {
    const hp = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.5 });
    add(new THREE.TorusGeometry(0.27, 0.022, 8, 28, Math.PI), hp, 0, HY + 0.16, 0.02);
    [-0.26, 0.26].forEach(hx => add(new THREE.CylinderGeometry(0.065, 0.065, 0.06, 16), hp, hx, HY + 0.02, 0.02).rotation.z = Math.PI / 2);
  }

  G.traverse(o => {
    if (o.material && 'envMapIntensity' in o.material) {
      o.material.envMapIntensity = (o.material.metalness || 0) > 0.4 ? 0.85 : 0.32;
    }
  });

  return G;
}

/* ===== غطاء الرأس (غترة/شماغ/شيلة...) ===== */
function addGear(add, mat, gender, eq) {
  const isF = gender === 'female';
  const HY = 2.9, FZ = 0.24;

  function agal() {
    const d = mat.dark;
    add(new THREE.TorusGeometry(0.3, 0.021, 10, 40), d, 0, HY + 0.07, 0).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.31, 0.021, 10, 40), d, 0, HY + 0.0, 0).rotation.x = Math.PI / 2;
    add(new THREE.SphereGeometry(0.028, 10, 10), d, 0, HY + 0.04, 0.3);
  }
  function ponytail() {
    add(new THREE.SphereGeometry(0.085, 14, 12), mat.hair, 0, HY - 0.02, -0.22);
  }

  // النظارات
  if (eq.eyes === 'eyes_shades') {
    add(new THREE.BoxGeometry(0.26, 0.065, 0.05), mat.glass, 0, HY + 0.03, FZ - 0.02);
    add(new THREE.BoxGeometry(0.26, 0.02, 0.02), mat.dark, 0, HY + 0.06, FZ - 0.01);
  } else if (eq.eyes === 'eyes_sport') {
    add(new THREE.BoxGeometry(0.29, 0.1, 0.07),
      new THREE.MeshStandardMaterial({ color: 0x23805f, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.9 }), 0, HY + 0.03, FZ - 0.04);
  }

  // كاب رياضي
  if (eq.head === 'head_cap') {
    add(new THREE.SphereGeometry(0.27, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.5), new THREE.MeshStandardMaterial({ color: 0x23805f, roughness: 0.6 }), 0, HY + 0.04, 0).scale.set(1.03, 1.0, 1.05);
    add(new THREE.CylinderGeometry(0.255, 0.255, 0.04, 24, 1, false, 0, Math.PI), new THREE.MeshStandardMaterial({ color: 0x1d6b4f, roughness: 0.6 }), 0, HY + 0.04, 0.22).scale.set(0.9, 1, 1.2);
    add(new THREE.SphereGeometry(0.26, 24, 18, 0, Math.PI * 2, Math.PI * 0.42, Math.PI * 0.22), mat.hair, 0, HY - 0.03, -0.02);
    if (isF) ponytail();
    return;
  }
  // عصابة رأس
  if (eq.head === 'head_band') {
    add(new THREE.SphereGeometry(0.265, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.6), mat.hair, 0, HY + 0.02, 0).scale.set(1.03, 1.04, 1.04);
    add(new THREE.TorusGeometry(0.255, 0.038, 10, 28), new THREE.MeshStandardMaterial({ color: 0xe84393, roughness: 0.5 }), 0, HY + 0.1, 0).rotation.x = Math.PI / 2 - 0.12;
    if (isF) ponytail();
    return;
  }

  // غترة/شماغ/شيلة
  let domeMat = mat.cloth;
  if (eq.head === 'head_shemagh') {
    const tex = shemaghTexture();
    domeMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.8 });
  }
  const domeTheta = isF ? Math.PI * 0.47 : Math.PI * 0.43;
  add(new THREE.SphereGeometry(0.31, 32, 24, 0, Math.PI * 2, 0, domeTheta), domeMat, 0, HY + 0.04, 0).scale.set(1.06, 1.05, 1.1);
  // الانسدال (يترك الوجه مفتوحاً)
  const gap = isF ? 1.7 : 1.9;
  add(new THREE.CylinderGeometry(0.3, isF ? 0.4 : 0.35, isF ? 0.72 : 0.6, 36, 1, true, gap / 2, Math.PI * 2 - gap),
    new THREE.MeshStandardMaterial({ map: domeMat.map || null, color: domeMat.color.getHex(), roughness: 0.82, side: THREE.DoubleSide }),
    0, isF ? HY - 0.26 : HY - 0.2, 0);

  if (!isF) agal();
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
  renderer.toneMappingExposure = 1.04;
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
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7affc8, 0.55);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  const ground = new THREE.Mesh(new THREE.CircleGeometry(2.4, 48), new THREE.ShadowMaterial({ opacity: 0.34 }));
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
      V.charGroup.position.y = Math.sin(t * 1.7) * 0.03;
      V.charGroup.rotation.z = Math.sin(t * 1.1) * 0.008;
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
