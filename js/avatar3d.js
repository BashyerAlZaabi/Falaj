/* ===== شخصية إماراتية ثلاثية الأبعاد (Three.js) =====
   تُبنى من مجسّمات أوّلية وتتغيّر حسب الجنس والقطع المرتداة.
   تُعرّض عبر window.FalajAvatar = { mount, update }
*/
import * as THREE from 'three';
import { OrbitControls } from './vendor/OrbitControls.js';
import { RoomEnvironment } from './vendor/RoomEnvironment.js';

/* ===== الألوان ===== */
const OUTFIT = {
  outfit_classic_male:   0xf6f4ee,
  outfit_classic_female: 0x23262e,
  outfit_gold:           0xe7c454,
  outfit_navy:           0x314a78,
  outfit_sport:          0x23805f,
  outfit_red:            0xa83535,
};
const C_SKIN  = 0xeebf94;
const C_DARK  = 0x18181c;   // عقال / زجاج
const C_HAIR  = 0x2a1d12;
const C_GOLD  = 0xf1c40f;

/* ===== نقشة الشماغ (canvas texture) ===== */
function shemaghTexture() {
  const s = 256, c = document.createElement('canvas');
  c.width = c.height = s;
  const x = c.getContext('2d');
  x.fillStyle = '#c41f1f'; x.fillRect(0, 0, s, s);
  const step = s / 8;
  // أقطار داكنة (نقشة العين) أولاً
  x.strokeStyle = 'rgba(110,12,12,0.6)'; x.lineWidth = 2;
  for (let i = -8; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step + s, s); x.stroke();
    x.beginPath(); x.moveTo(i * step, s); x.lineTo(i * step + s, 0); x.stroke();
  }
  // شبكة بيضاء خفيفة
  x.strokeStyle = 'rgba(255,255,255,0.22)'; x.lineWidth = 2.5;
  for (let i = 0; i <= 8; i++) {
    x.beginPath(); x.moveTo(i * step, 0); x.lineTo(i * step, s); x.stroke();
    x.beginPath(); x.moveTo(0, i * step); x.lineTo(s, i * step); x.stroke();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(2, 2);
  return tex;
}

/* ===== بناء الشخصية ===== */
function buildCharacter(gender, eq) {
  const G = new THREE.Group();
  const isF = gender === 'female';

  const outfitColor = eq.outfit === 'outfit_classic'
    ? (isF ? OUTFIT.outfit_classic_female : OUTFIT.outfit_classic_male)
    : (OUTFIT[eq.outfit] || OUTFIT.outfit_classic_male);
  const clothColor = isF ? 0x1c1e25 : 0xfdfdfb;

  const mat = {
    outfit: new THREE.MeshStandardMaterial({ color: outfitColor, roughness: 0.92, metalness: 0.02 }),
    skin:   new THREE.MeshStandardMaterial({ color: C_SKIN, roughness: 0.55 }),
    cloth:  new THREE.MeshStandardMaterial({ color: clothColor, roughness: 0.85 }),
    dark:   new THREE.MeshStandardMaterial({ color: C_DARK, roughness: 0.45 }),
    hair:   new THREE.MeshStandardMaterial({ color: C_HAIR, roughness: 0.7 }),
    gold:   new THREE.MeshStandardMaterial({ color: C_GOLD, roughness: 0.3, metalness: 0.65 }),
    white:  new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 }),
    eye:    new THREE.MeshStandardMaterial({ color: 0x241810, roughness: 0.3 }),
    glass:  new THREE.MeshStandardMaterial({ color: 0x111114, roughness: 0.15, metalness: 0.4 }),
    lip:    new THREE.MeshStandardMaterial({ color: 0xb3604c, roughness: 0.5 }),
  };

  const add = (geo, m, x, y, z) => {
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.set(x, y, z);
    mesh.castShadow = true; mesh.receiveShadow = true;
    G.add(mesh);
    return mesh;
  };

  /* ----- الأحذية ----- */
  let shoeColor = 0x5a4632;
  if (eq.shoes === 'shoes_runner') shoeColor = 0xfafafa;
  if (eq.shoes === 'shoes_gold')   shoeColor = C_GOLD;
  const matShoe = new THREE.MeshStandardMaterial({ color: shoeColor, roughness: 0.6, metalness: eq.shoes === 'shoes_gold' ? 0.6 : 0.1 });
  [-0.28, 0.28].forEach(sx => {
    const sh = add(new THREE.SphereGeometry(0.22, 18, 14), matShoe, sx, 0.12, 0.12);
    sh.scale.set(1, 0.5, 1.5);
  });

  // نصف قطر سطح المخروط عند ارتفاع y (لوضع تفاصيل الصدر أمام السطح)
  const surfR = (y) => 0.5 + Math.max(0, 2.37 - y) * 0.245;
  const darker = (hex, f) => {
    f = f || 0.82;
    return ((Math.round((hex >> 16 & 255) * f)) << 16) | ((Math.round((hex >> 8 & 255) * f)) << 8) | Math.round((hex & 255) * f);
  };
  const matTrim = new THREE.MeshStandardMaterial({ color: darker(outfitColor), roughness: 0.7 });

  /* ----- الجسم (كندورة / عباية) ----- */
  const body = add(new THREE.CylinderGeometry(0.5, 1.02, 2.12, 48), mat.outfit, 0, 1.31, 0);
  body.receiveShadow = true;
  // أكتاف مدوّرة
  add(new THREE.SphereGeometry(0.5, 28, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), mat.outfit, 0, 2.34, 0);
  // قاعدة سفلية مدوّرة قليلاً
  const hem = add(new THREE.CylinderGeometry(1.02, 0.96, 0.12, 48), mat.outfit, 0, 0.31, 0);
  hem.receiveShadow = true;

  // الكسرة/الفتحة الأمامية تتبع ميل المخروط
  const placketTilt = -0.235;
  if (!isF) {
    // كولّر
    add(new THREE.TorusGeometry(0.17, 0.04, 10, 24, Math.PI), matTrim, 0, 2.44, surfR(2.44) - 0.04)
      .rotation.set(Math.PI / 2, 0, 0);
    // الكسرة (شريط التطريز الأمامي مائل مع السطح)
    add(new THREE.BoxGeometry(0.045, 1.55, 0.03), matTrim, 0, 1.55, surfR(1.55) + 0.02)
      .rotation.set(placketTilt, 0, 0);
    // أزرار على السطح
    [2.08, 1.86, 1.64, 1.42].forEach(by =>
      add(new THREE.SphereGeometry(0.03, 10, 10), mat.dark, 0, by, surfR(by) + 0.03));
    // الفروخة (شرّابة) متدلّية من الياقة
    add(new THREE.SphereGeometry(0.05, 10, 10), matTrim, 0.13, 2.2, surfR(2.2) + 0.02);
    add(new THREE.ConeGeometry(0.045, 0.18, 10), mat.dark, 0.13, 2.06, surfR(2.06) + 0.03);
  } else {
    // فتحة العباية الأمامية
    add(new THREE.BoxGeometry(0.03, 2.0, 0.03), matTrim, 0, 1.32, surfR(1.32) + 0.01)
      .rotation.set(placketTilt, 0, 0);
    // طوق العباية
    add(new THREE.TorusGeometry(0.18, 0.035, 10, 24, Math.PI), mat.dark, 0, 2.42, surfR(2.42) - 0.05)
      .rotation.set(Math.PI / 2, 0, 0);
    if (eq.outfit === 'outfit_gold' || eq.outfit === 'outfit_red') {
      [-0.1, 0.1].forEach(gx =>
        add(new THREE.BoxGeometry(0.025, 2.0, 0.03), mat.gold, gx, 1.32, surfR(1.32) + 0.015)
          .rotation.set(placketTilt, 0, 0));
      // حافة ذهبية سفلية
      add(new THREE.TorusGeometry(0.99, 0.025, 8, 60), mat.gold, 0, 0.33, 0).rotation.x = Math.PI / 2;
    }
  }
  // خط رياضي
  if (eq.outfit === 'outfit_sport') {
    add(new THREE.TorusGeometry(0.72, 0.03, 8, 40), new THREE.MeshStandardMaterial({ color: 0xf1cf63, roughness: 0.5 }), 0, 1.5, 0)
      .rotation.x = Math.PI / 2;
  }

  /* ----- الذراعان واليدان (تتدلّى على جانبي الجسم) ----- */
  const armGeo = new THREE.CapsuleGeometry(0.155, 1.34, 8, 18);
  const la = add(armGeo, mat.outfit, -0.5, 1.5, 0.06); la.rotation.z = -0.30;
  const ra = add(armGeo, mat.outfit, 0.5, 1.5, 0.06); ra.rotation.z = 0.30;
  const lh = add(new THREE.SphereGeometry(0.175, 18, 16), mat.skin, -0.84, 0.86, 0.1);
  const rh = add(new THREE.SphereGeometry(0.175, 18, 16), mat.skin, 0.84, 0.86, 0.1);

  /* ----- الرقبة ----- */
  add(new THREE.CylinderGeometry(0.19, 0.22, 0.34, 18), mat.skin, 0, 2.5, 0);

  /* ----- الرأس ----- */
  const head = add(new THREE.SphereGeometry(0.52, 40, 36), mat.skin, 0, 2.92, 0);
  head.scale.set(1, 1.06, 0.97);
  // أذنان
  add(new THREE.SphereGeometry(0.1, 14, 14), mat.skin, -0.5, 2.9, 0.02);
  add(new THREE.SphereGeometry(0.1, 14, 14), mat.skin, 0.5, 2.9, 0.02);

  /* ----- ملامح الوجه ----- */
  // حواجب
  const browGeo = new THREE.BoxGeometry(0.18, 0.035, 0.05);
  add(browGeo, mat.hair, -0.18, 3.08, 0.46).rotation.z = -0.12;
  add(browGeo, mat.hair, 0.18, 3.08, 0.46).rotation.z = 0.12;
  // عيون (بياض + قزحية + بؤبؤ + بريق) — تُخفى مع النظارات الكاملة
  const wearShades = eq.eyes === 'eyes_shades' || eq.eyes === 'eyes_sport';
  const matIris = new THREE.MeshStandardMaterial({ color: 0x5a3a1f, roughness: 0.35 });
  const matGlint = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.1, emissive: 0x444444 });
  if (!wearShades) {
    [-0.18, 0.18].forEach(ex => {
      const sclera = add(new THREE.SphereGeometry(0.082, 18, 18), mat.white, ex, 2.987, 0.45);
      sclera.scale.set(1.18, 1, 0.5); sclera.castShadow = false;
      const iris = add(new THREE.SphereGeometry(0.05, 16, 16), matIris, ex, 2.985, 0.5);
      iris.scale.set(1, 1, 0.55); iris.castShadow = false;
      add(new THREE.SphereGeometry(0.026, 14, 14), mat.eye, ex, 2.985, 0.515).castShadow = false;
      add(new THREE.SphereGeometry(0.013, 8, 8), matGlint, ex + 0.022, 3.01, 0.52).castShadow = false;
      // جفن علوي (يعطي شكل اللوز)
      const lid = add(new THREE.SphereGeometry(0.095, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.5), mat.skin, ex, 3.025, 0.45);
      lid.scale.set(1.0, 0.45, 0.5); lid.rotation.x = -0.2; lid.castShadow = false;
      // رموش للأنثى
      if (isF) {
        const lash = add(new THREE.TorusGeometry(0.072, 0.008, 6, 16, Math.PI), mat.eye, ex, 2.995, 0.49);
        lash.rotation.set(-0.5, 0, Math.PI); lash.scale.set(1.15, 1, 0.6); lash.castShadow = false;
      }
    });
  }
  // أنف (جسر + أرنبة)
  add(new THREE.SphereGeometry(0.052, 14, 14), mat.skin, 0, 2.86, 0.53).scale.set(1, 1.05, 1);
  add(new THREE.CapsuleGeometry(0.028, 0.06, 4, 10), mat.skin, 0, 2.92, 0.5).rotation.x = 0.3;
  // فم (ابتسامة بشفتين)
  const mouth = add(new THREE.TorusGeometry(0.115, 0.026, 10, 24, Math.PI), mat.lip, 0, 2.78, 0.46);
  mouth.rotation.set(0, 0, Math.PI); mouth.castShadow = false;
  if (isF) {
    // شفة سفلية ممتلئة قليلاً
    add(new THREE.SphereGeometry(0.05, 14, 12), mat.lip, 0, 2.74, 0.47).scale.set(1.5, 0.6, 0.5).castShadow = false;
  }
  // لحية خفيفة للرجل
  if (!isF) {
    const beard = add(new THREE.SphereGeometry(0.5, 28, 24, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38),
      new THREE.MeshStandardMaterial({ color: 0x6b4a2f, roughness: 0.85, transparent: true, opacity: 0.35 }),
      0, 2.92, 0.02);
    beard.scale.set(1.02, 1.06, 1);
  }

  /* ----- غطاء الرأس ----- */
  addHeadwear(G, add, mat, gender, eq, head);

  /* ----- إكسسوارات ----- */
  if (eq.accessory === 'acc_watch') {
    const w = add(new THREE.BoxGeometry(0.16, 0.07, 0.22), mat.dark, 0.8, 0.96, 0.08);
    add(new THREE.BoxGeometry(0.1, 0.04, 0.13), new THREE.MeshStandardMaterial({ color: 0x46d6c0, roughness: 0.3, emissive: 0x0a3b34 }), 0.86, 0.97, 0.09);
  }
  if (eq.accessory === 'acc_medal') {
    const matRibbon = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.6 });
    add(new THREE.BoxGeometry(0.045, 0.46, 0.03), matRibbon, -0.13, 2.12, surfR(2.12) + 0.04).rotation.set(-0.2, 0, 0.42);
    add(new THREE.BoxGeometry(0.045, 0.46, 0.03), matRibbon, 0.13, 2.12, surfR(2.12) + 0.04).rotation.set(-0.2, 0, -0.42);
    add(new THREE.CylinderGeometry(0.14, 0.14, 0.05, 28), mat.gold, 0, 1.86, surfR(1.86) + 0.08).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.09, 0.018, 8, 24), new THREE.MeshStandardMaterial({ color: 0xcaa106, roughness: 0.4, metalness: 0.5 }), 0, 1.86, surfR(1.86) + 0.11).rotation.x = Math.PI / 2;
  }
  if (eq.accessory === 'acc_headphone') {
    const matHp = new THREE.MeshStandardMaterial({ color: 0xec4359, roughness: 0.5 });
    add(new THREE.TorusGeometry(0.55, 0.04, 10, 32, Math.PI), matHp, 0, 3.0, 0)
      .rotation.set(0, 0, 0);
    [-0.55, 0.55].forEach(hx => {
      const cup = add(new THREE.CylinderGeometry(0.12, 0.12, 0.1, 20), matHp, hx, 2.9, 0.02);
      cup.rotation.z = Math.PI / 2;
    });
  }

  // ضبط شدّة الانعكاس البيئي لكل خامة (يبقي الألوان مشبعة، والمعادن لامعة)
  G.traverse(o => {
    if (o.material && 'envMapIntensity' in o.material) {
      o.material.envMapIntensity = (o.material.metalness || 0) > 0.4 ? 0.9 : 0.32;
    }
  });

  return G;
}

/* ===== غطاء الرأس ===== */
function addHeadwear(G, add, mat, gender, eq, head) {
  const isF = gender === 'female';
  const headY = 2.92;

  // النظارات
  if (eq.eyes === 'eyes_shades') {
    add(new THREE.BoxGeometry(0.5, 0.14, 0.08), mat.glass, 0, 3.0, 0.46);
    add(new THREE.BoxGeometry(0.5, 0.03, 0.02), mat.dark, 0, 3.07, 0.48);
  } else if (eq.eyes === 'eyes_sport') {
    add(new THREE.BoxGeometry(0.52, 0.18, 0.1),
      new THREE.MeshStandardMaterial({ color: 0x23805f, roughness: 0.25, metalness: 0.3, transparent: true, opacity: 0.92 }),
      0, 3.0, 0.45);
  }

  // كاب رياضي
  if (eq.head === 'head_cap') {
    // شعر جانبي
    add(new THREE.SphereGeometry(0.5, 24, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), mat.hair, 0, headY + 0.02, 0).scale.set(1.04, 1.02, 1.02);
    const matCap = new THREE.MeshStandardMaterial({ color: 0x23805f, roughness: 0.6 });
    add(new THREE.SphereGeometry(0.54, 28, 20, 0, Math.PI * 2, 0, Math.PI * 0.5), matCap, 0, headY + 0.12, 0);
    // الحافة الأمامية
    const brim = add(new THREE.CylinderGeometry(0.5, 0.5, 0.04, 24, 1, false, 0, Math.PI), matCap, 0, headY + 0.14, 0.28);
    brim.scale.set(0.9, 1, 1.1);
    add(new THREE.SphereGeometry(0.05, 10, 10), matCap, 0, headY + 0.55, 0);
    return;
  }
  // عصابة رأس
  if (eq.head === 'head_band') {
    add(new THREE.SphereGeometry(0.52, 28, 22, 0, Math.PI * 2, 0, Math.PI * 0.62), mat.hair, 0, headY + 0.04, 0).scale.set(1.03, 1.04, 1.02);
    add(new THREE.TorusGeometry(0.5, 0.05, 12, 36), new THREE.MeshStandardMaterial({ color: 0xe84393, roughness: 0.5 }), 0, headY + 0.34, 0)
      .rotation.x = Math.PI / 2 - 0.15;
    return;
  }

  // الغترة / الشيلة / الشماغ
  let capMat = mat.cloth, drapeMat = mat.cloth;
  if (eq.head === 'head_shemagh') {
    const tex = shemaghTexture();
    capMat = new THREE.MeshStandardMaterial({ map: tex, color: 0xffffff, roughness: 0.8 });
    drapeMat = capMat;
  }

  // قبّة تغطّي التاج والجبين
  const capTheta = isF ? Math.PI * 0.47 : Math.PI * 0.5;
  const cap = add(new THREE.SphereGeometry(0.6, 40, 28, 0, Math.PI * 2, 0, capTheta), capMat, 0, headY + 0.02, 0);
  cap.scale.set(1.02, 1.04, 1.0);

  // الانسدال (يغطّي الجانبين والخلف ويترك الوجه مفتوحاً)
  const gap = isF ? 1.7 : 1.9;                 // عرض فتحة الوجه (راديان)
  const drape = add(
    new THREE.CylinderGeometry(0.56, isF ? 0.72 : 0.66, isF ? 1.15 : 1.0, 40, 1, true, gap / 2, Math.PI * 2 - gap),
    drapeMat, 0, isF ? 2.45 : 2.55, 0);
  drape.castShadow = true;

  // العقال (للرجل فقط مع الغترة/الشماغ)
  if (!isF) {
    add(new THREE.TorusGeometry(0.51, 0.045, 14, 44), mat.dark, 0, headY + 0.3, 0).rotation.x = Math.PI / 2;
    add(new THREE.TorusGeometry(0.53, 0.045, 14, 44), mat.dark, 0, headY + 0.21, 0).rotation.x = Math.PI / 2;
    // عقدتان أماميتان
    add(new THREE.SphereGeometry(0.05, 10, 10), mat.dark, 0, headY + 0.33, 0.52);
  } else {
    // حافة الشيلة حول الوجه
    add(new THREE.TorusGeometry(0.46, 0.03, 10, 36, Math.PI * 1.2), mat.cloth, 0, headY + 0.05, 0.1)
      .rotation.set(0.2, 0, 0);
  }
}

/* ===== العارض (Viewer) ===== */
let V = null;

function mount(container, gender, eq) {
  if (V) { update(gender, eq); return; }

  const w = container.clientWidth || 220;
  const h = container.clientHeight || 260;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, w / h, 0.1, 100);
  camera.position.set(0, 2.05, 8.2);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(w, h);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;
  container.innerHTML = '';
  container.appendChild(renderer.domElement);

  // إضاءة بيئية واقعية (يعطي انعكاسات ناعمة وعمق للخامات)
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  // إضاءة
  scene.add(new THREE.HemisphereLight(0xfff6e6, 0x2a3b34, 0.8));
  // ضوء أمامي ناعم لإنارة الوجه
  const front = new THREE.DirectionalLight(0xfff3e0, 0.95);
  front.position.set(0, 2.9, 6);
  scene.add(front);
  const key = new THREE.DirectionalLight(0xffffff, 1.7);
  key.position.set(3.5, 6.5, 4.5);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.near = 1; key.shadow.camera.far = 20;
  key.shadow.camera.left = -3; key.shadow.camera.right = 3;
  key.shadow.camera.top = 5; key.shadow.camera.bottom = -1;
  key.shadow.bias = -0.0006;
  key.shadow.radius = 4;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfe8d8, 0.6);
  rim.position.set(-4, 3, -3);
  scene.add(rim);

  // أرضية للظل
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(2.4, 48),
    new THREE.ShadowMaterial({ opacity: 0.28 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = 0.02;
  ground.receiveShadow = true;
  scene.add(ground);

  // تحكّم الدوران
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 1.78, 0);
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.rotateSpeed = 0.6;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 1.4;
  controls.minPolarAngle = Math.PI * 0.30;
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

  let raf;
  function loop() {
    raf = requestAnimationFrame(loop);
    controls.update();
    renderer.render(scene, camera);
  }
  loop();

  V = { scene, camera, renderer, controls, charGroup, container, onResize, raf };
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
