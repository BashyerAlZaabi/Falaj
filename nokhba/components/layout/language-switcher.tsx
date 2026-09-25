"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Languages } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { setLocale } from "@/lib/i18n/actions";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className, variant = "ghost" }: { className?: string; variant?: "ghost" | "outline" }) {
  const { locale, t } = useI18n();
  const router = useRouter();
  const [pending, start] = useTransition();
  const next = locale === "ar" ? "en" : "ar";
  return (
    <Button
      variant={variant}
      size="sm"
      className={cn("gap-1.5", className)}
      disabled={pending}
      aria-label={t("common.language.switch")}
      onClick={() => start(async () => { await setLocale(next); router.refresh(); })}
    >
      <Languages className="size-4" />
      <span className="font-medium">{next === "ar" ? "العربية" : "English"}</span>
    </Button>
  );
}
