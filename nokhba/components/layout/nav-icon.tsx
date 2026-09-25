"use client";

import * as Icons from "lucide-react";
import type { LucideProps } from "lucide-react";

/** Resolve an icon name from config/nav.ts to a lucide component. */
export function NavIcon({ name, ...props }: { name: string } & LucideProps) {
  const Icon = (Icons as unknown as Record<string, React.ComponentType<LucideProps>>)[name] ?? Icons.Circle;
  return <Icon aria-hidden {...props} />;
}
