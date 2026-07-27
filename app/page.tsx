/**
 * شاشة تمهيدية للمرحلة صفر — تتحقّق بصرياً من الهوية:
 * الخطوط الثلاثة، التوكنز، الطبقة المادية (grain)، واتجاه RTL.
 * تُستبدل بالمصادقة و«اليوم» في المراحل ١ و٤.
 */
export default function Home() {
  return (
    <main className="surface-dark flex min-h-dvh flex-col items-center justify-center px-6 text-center">
      <p className="mb-4 font-head text-sm tracking-wide text-brass-l">
        برنامج سفراء الزراعة الشبابية
      </p>

      <h1 className="display text-5xl leading-tight text-nacre sm:text-6xl">
        المنظومة الوطنية
        <br />
        للأمن الغذائي
      </h1>

      <p className="subtle mt-6 max-w-md text-base text-nacre/70">
        دولة الإمارات العربية المتحدة — رؤية الأمن الغذائي
      </p>

      <div className="mt-10 flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-sm bg-falaj-l" />
        <span className="h-2.5 w-2.5 rounded-sm bg-brass-l" />
        <span className="h-2.5 w-2.5 rounded-sm bg-sand" />
      </div>

      <p className="mt-12 font-head text-xs text-nacre/45">
        المرحلة صفر · التهيئة
      </p>
    </main>
  );
}
