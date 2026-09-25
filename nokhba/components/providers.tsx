"use client";

import { ThemeProvider } from "next-themes";
import { SessionProvider } from "next-auth/react";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { LocaleProvider } from "@/lib/i18n/client";
import type { Locale } from "@/lib/i18n/config";
import type { Messages } from "@/lib/i18n/messages";
import { MotionConfig } from "framer-motion";

export function Providers({ locale, messages, children }: { locale: Locale; messages: Messages; children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
        <LocaleProvider locale={locale} messages={messages}>
          <MotionConfig reducedMotion="user">
            <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          </MotionConfig>
          <Toaster position={locale === "ar" ? "bottom-left" : "bottom-right"} richColors closeButton />
        </LocaleProvider>
      </ThemeProvider>
    </SessionProvider>
  );
}
