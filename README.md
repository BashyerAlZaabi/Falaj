# 🌱 سفراء الزراعة الشباب — Young Agriculture Ambassadors

موقعٌ **يُطار فيه بالتمرير**: المؤشّر لا يحرّك الصفحة، بل يقود **كاميرا** تنطلق من خارج كل
مشهد، وتغوص إلى داخله عبر بوابته، ثم ترتفع وتنعطف إلى المشهد التالي **دون قطع** — رحلةٌ
واحدة متّصلة عبر عالمٍ مصغّر يحكي البرنامج من البذرة إلى السفير.

A **scroll-flown** landing page: scroll doesn't move the page, it drives a **camera** that
starts outside each scene, dives through its gateway into the interior, then lifts and banks
into the next one **with no cut** — one continuous flight through a miniature world that tells
the programme from the seed to the ambassador.

> **نموذج أوّلي.** نصوص البرنامج وأرقامه *مقترحة* كنقطة انطلاق، والأرقام مصاغة كـ«أهداف»
> لا كإنجازات محقّقة. عدّلها كلها من ملفٍ واحد: `js/world-content.js`.
>
> **Prototype.** The programme copy and figures are a *proposal* to start from, and the figures
> are phrased as goals, never as achieved results. Edit all of it in one file: `js/world-content.js`.

## 🎬 الرحلة · The flight

ستة مشاهد، تمرّ الكاميرا في كل واحدٍ منها من الخارج إلى الداخل:

| # | المشهد | Scene | ماذا يحكي |
|---|--------|-------|-----------|
| 1 | البذرة | The Seed | الفكرة والدعوة — من بذرةٍ واحدة يبدأ وطنٌ أخضر |
| 2 | المشتل | The Nursery | المرحلة الأولى: الأساسيات بالأيدي |
| 3 | الفلج الذكي | The Smart Falaj | من الفلج التقليدي إلى الحسّاس وإنترنت الأشياء |
| 4 | الحقل | The Field | المشروع الميداني: قطعة أرض حقيقية لموسمٍ كامل |
| 5 | السوق | The Market | من الحصاد إلى الرزق: التسعير والتغليف والتبريد |
| 6 | السفراء | The Ambassadors | التخرّج، والشبكة، ونداء التسجيل |

## 🛠 كيف يعمل · How it works

لا فيديو، ولا WebGL، ولا أي تبعية. كل مشهد **خمس طبقات SVG** على أعماقٍ مختلفة داخل
مشهدٍ ثلاثي الأبعاد من CSS (`perspective` + `translate3d`)، والكاميرا تتحرّك بينها:

No video, no WebGL, no dependencies. Each scene is **five SVG layers** at different depths
inside a CSS 3D scene (`perspective` + `translate3d`), and the camera moves between them:

```
+760  الغلاف · shell   ← ما نطير من خلاله (باب، قوس، مظلّة، سعف)
+380  القريب · near    ← عناصر أمامية تتمدّد وتمرّ
   0  القلب  · core    ← داخل المشهد: موضوعه
-420  الوسط  · mid     ← ما خلف الموضوع
-980  البعيد · far     ← الشمس والغيوم والجبال (السماء نفسها تدرّجُ CSS)
```

الطبقة التي تقترب من الكاميرا تكبر ثم تتلاشى وتُقصى، فتُترك الطبقة الداخلية وحدها — وهذا
مصدر الإحساس بالدخول بدل التكبير. المشاهد كلها في **عالمٍ واحد** بإحداثيات، فيظهر المشهد
التالي في الأفق قبل الوصول إليه، ولذلك لا يوجد أي قطع.

A layer approaching the camera swells, fades, and is culled — leaving the interior behind it.
That is what makes it read as *entering* rather than *zooming*. All six scenes live in **one
coordinate world**, so the next one is already on the horizon before you get there — which is
why there is never a cut.

المسافة على المحور: `الغوص = 1.55` ارتفاع شاشة، `الوصلة = 1.05`. تُضبط كلها من أعلى
`js/world-flight.js`.

## 🗂 البنية · Structure

```
index.html              ← الصفحة: الرحلة + الأقسام الأرضية + نموذج التسجيل
css/world.css           ← الهوية، المسرح ثلاثي الأبعاد، أقنعة الحوافّ، RTL/LTR
js/world-content.js     ← ✏️ كل النصوص والأرقام (عربي + إنجليزي) — عدّل هنا
js/world-scenes.js      ← رسوم المشاهد الستة (SVG مكتوبة بالكامل، بلا صور)
js/world-flight.js      ← محرّك الكاميرا: خريطة التمرير، القوس، التلاشي، النص
js/world-page.js        ← الأقسام الأرضية، تبديل اللغة، النموذج

fitness/                ← تطبيق «فلج رياضة» السابق (كان في الجذر)
app/                    ← تطبيق فلج للزراعة الذكية
```

## 🚀 التشغيل · Run

بدون بناء وبدون تبعيات:

```bash
python3 -m http.server 8000
# سفراء الزراعة الشباب:  http://localhost:8000/
# تطبيق الزراعة الذكية:  http://localhost:8000/app/
# تطبيق اللياقة:          http://localhost:8000/fitness/
```

## 📦 نسخة الملف الواحد · Single-file build

لمشاركة الموقع أو رفعه على أي استضافة ثابتة بلا مجلدات:

```bash
node tools/bundle.js          # → dist/index.html  (ملف واحد يُفتح مباشرة)
node tools/bundle.js --body   # → dist/body.html   (بلا وسوم html/head/body،
                              #    لمنصّات تُغلّف المحتوى بنفسها)
```

السكربت يدمج `css/world.css` وملفات `js/world-*.js` داخل `index.html`، ويفشل عمداً إن
بقي أي أصلٍ محلي غير مدموج. المجلد `dist/` مولَّد ولا يُتتبَّع في git — أعد توليده بعد كل
تعديل على النصوص.

## ✏️ التعديل · Editing

- **النصوص والأرقام** — `js/world-content.js` فقط. كل نص كائن `{ ar, en }`، وتبديل اللغة
  يقلب الاتجاه (RTL/LTR) ويعيد بناء الصفحة كلها.
- **إضافة مشهد** — أضف كائناً في `SCENES` ودالة رسمٍ بنفس المُعرّف في `WORLD_SCENES.build`.
  المحرّك يمدّد خريطة التمرير ونقاط التنقّل تلقائياً.
- **الإيقاع** — `DIVE_VH` و`CONN_VH` و`LINGER` (تمهّل الكاميرا في منتصف المشهد حيث يبلغ
  النص ذروته) في أعلى `js/world-flight.js`.
- **الألوان** — لوحة البرنامج في `BRAND.palette`، ولون كل مشهد في `accent`، وسماؤه في `sky`.

## ♿ الوصول · Accessibility

- **`prefers-reduced-motion`** — تنطفئ الرحلة كلياً وتتحوّل إلى أقسامٍ ساكنة: رسم المشهد
  إلى جانب نصّه، بلا تثبيت ولا حركة.
- ثنائي اللغة مع اتجاهٍ صحيح، ونصوص فوق ستارةٍ تضمن التباين، ومؤشّر تركيزٍ ظاهر.
- الرسوم كلها `aria-hidden`؛ المعنى كله في النص.

## 📝 ملاحظة عن النموذج · About the form

نموذج التسجيل **تجريبي**: لا يرسل أي بيانات إلى أي خادم. لربطه بخدمة حقيقية، عدّل معالج
`submit` في `js/world-page.js`.

The application form is a **demo**: it posts nothing anywhere. Wire it to a real service in the
`submit` handler in `js/world-page.js`.

---

الفكرة مستوحاة من [`oso95/scroll-world`](https://github.com/oso95/scroll-world) — تقنية الطيران
بالتمرير نفسها، لكن بأصولٍ متجهية مرسومة هنا بدل السلسلة المولَّدة بالذكاء الاصطناعي.

Technique inspired by [`oso95/scroll-world`](https://github.com/oso95/scroll-world) — the same
scroll-flown idea, with hand-authored vector assets instead of its AI-generated video chain.

صُنع لرؤية الأمن الغذائي الإماراتي 2051 🇦🇪
