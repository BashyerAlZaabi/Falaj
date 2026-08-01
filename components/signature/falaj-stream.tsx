/**
 * «مجرى الفلج» — خط مائي متموّج يفصل الأقسام ويحمل روح الاسم.
 * حركة انسياب بطيئة عبر stroke-dashoffset، تتعطّل تلقائياً مع
 * prefers-reduced-motion (globals.css يصفّر مدد الحركة).
 */
export function FalajStream({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`overflow-hidden ${className}`}>
      <svg
        viewBox="0 0 400 24"
        preserveAspectRatio="none"
        className="h-6 w-full"
      >
        <path
          d="M0 12 Q 25 4, 50 12 T 100 12 T 150 12 T 200 12 T 250 12 T 300 12 T 350 12 T 400 12"
          fill="none"
          stroke="var(--brass)"
          strokeWidth="1.5"
          strokeLinecap="round"
          opacity="0.5"
          strokeDasharray="6 10"
          className="falaj-flow"
        />
        <path
          d="M0 16 Q 25 8, 50 16 T 100 16 T 150 16 T 200 16 T 250 16 T 300 16 T 350 16 T 400 16"
          fill="none"
          stroke="var(--falaj-l)"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.35"
          strokeDasharray="4 12"
          className="falaj-flow-slow"
        />
      </svg>
    </div>
  );
}
