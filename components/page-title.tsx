"use client";

import { useEffect, useRef } from "react";

/**
 * عنوان الصفحة — يستقبل التركيز عند التنقل (PROMPT §11)
 * فيعلن قارئ الشاشة عن الوجهة الجديدة.
 */
export function PageTitle({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    ref.current?.focus({ preventScroll: true });
  }, []);

  return (
    <h1
      ref={ref}
      tabIndex={-1}
      className={`font-head text-2xl text-ink outline-none ${className}`}
    >
      {children}
    </h1>
  );
}
