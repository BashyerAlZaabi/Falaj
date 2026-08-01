/** هيكل تحميل — يُستخدم أثناء نداءات الوكيل والبيانات، لا دوّامات (PROMPT §11). */
export function Skeleton({ className = "" }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={`animate-pulse rounded-md bg-ink-24/40 ${className}`}
    />
  );
}

export function SkeletonCard() {
  return (
    <div className="rounded-lg border border-ink-24 bg-paper p-5">
      <Skeleton className="h-4 w-1/3" />
      <Skeleton className="mt-3 h-3 w-2/3" />
      <Skeleton className="mt-2 h-3 w-1/2" />
    </div>
  );
}
