# 🌾 منظومة الأمن الغذائي — برنامج سفراء الزراعة الشبابية

تطبيق إنتاجي لإدارة المشاريع الزراعية الشبابية في دولة الإمارات: مزرعتك،
خارطة طريقك الحكومية، ومساعد ذكي ينفّذ لك — بهوية بصرية بأسلوب «تم».

## الحزمة

```
Next.js 15 (App Router) · TypeScript strict · Tailwind CSS
Supabase (Auth + Postgres + RLS) · Leaflet · Anthropic SDK (خادمياً فقط)
```

## التشغيل

1. **مشروع Supabase** — أنشئ مشروعاً، ثم نفّذ في SQL Editor:
   - `supabase/migrations/0001_init.sql` (الجداول الأساسية + RLS + trigger)
   - `supabase/migrations/0002_normalize.sql` (جداول المرحلة ٨ المطبّعة)
2. **المتغيرات** — انسخ `.env.example` إلى `.env.local` واملأ مفاتيح Supabase
   و`ANTHROPIC_API_KEY` (لا يصل للعميل أبداً — يمر عبر `/api/agent` حصراً).
3. **تشغيل:**

```bash
npm install
npm run dev        # التطوير
npm run build      # الإنتاج + فحص الأنواع
npx tsx scripts/test-subdivide.ts   # اختبار قبول خوارزمية التقسيم
```

## البنية

```
app/
  (auth)/login          تسجيل/دخول
  onboarding            استقبال محادثي (set_profile) + احتياطي يدوي
  (app)/today           «اليوم» — بطاقات فعل بالإلحاح + قراءة الوكيل
  (app)/farm/[section]  الأرض · القطع · الدورات · المهام · المخزون · الحساسات · المالية · التراخيص
  (app)/path/[section]  خارطة الطريق · الدعم والتمويل · الشراكات · الجهات · المكافآت
  (app)/assistant       المساعد بأدواته (حلقة تنفيذ ≤ ٥ دورات + بحث ويب)
  api/agent             وسيط Anthropic الوحيد (JWT + حد ٤٠/ساعة + فرض model)
lib/
  agent/    الأدوات والسياق والتنفيذ المحلي
  geo/      خوارزمية تقسيم الأرض (بحث ثنائي + Sutherland–Hodgman)
  domain/   الأنشطة والإمارات والجهات والصناديق وخارطة الطريق
supabase/migrations/    0001 الأساس · 0002 التطبيع
scripts/  migrate-jsonb.ts (ترحيل jsonb → جداول) · test-subdivide.ts
```

## ملاحظات تشغيلية

- **بيانات المزرعة** تعمل حالياً على `farms.data` (jsonb) بقرار مقصود.
  جداول التطبيع جاهزة في 0002، والترحيل عبر
  `SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx scripts/migrate-jsonb.ts`
  — بدّل طبقة القراءة بعد التحقق من الأعداد على بيئة حية.
- **بيانات الجهات الحكومية** في الكود نقطة انطلاق متحفظة — كل خدمة
  وتفاصيلها الحديثة يجيبها المساعد ببحث ويب حي.
- الجلسات في كوكيز (بلا localStorage)، والحذف كله قابل للتراجع ٧ ثوانٍ،
  والطباعة تخفي كل شيء عدا `#printArea`.

---
صُنع لرؤية الأمن الغذائي الإماراتي 🇦🇪
