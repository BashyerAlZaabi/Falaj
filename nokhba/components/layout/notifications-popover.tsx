"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/lib/i18n/client";
import { api } from "@/lib/api";
import { formatRelative } from "@/lib/i18n/format";
import { cn } from "@/lib/utils";

type Item = { id: string; kind: string; titleEn: string; titleAr: string; bodyEn: string | null; bodyAr: string | null; href: string | null; readAt: string | null; createdAt: string };

export function NotificationsPopover({ unread: initialUnread }: { unread: number }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<Item[] | null>(null);
  const [unread, setUnread] = useState(initialUnread);

  useEffect(() => {
    if (!open) return;
    api<{ items: Item[] }>("/api/notifications").then((r) => setItems(r.items)).catch(() => setItems([]));
  }, [open]);

  const markAll = async () => {
    await api("/api/notifications", { method: "POST", json: { all: true } }).catch(() => null);
    setUnread(0);
    setItems((l) => l?.map((i) => ({ ...i, readAt: i.readAt ?? new Date().toISOString() })) ?? null);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative" aria-label={t("common.notifications.title")}>
          <Bell className="size-4" />
          {unread > 0 && <span className="absolute -end-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">{unread > 9 ? "9+" : unread}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="glass-3 w-[min(92vw,380px)] p-0">
        <div className="flex items-center justify-between px-4 py-3">
          <p className="font-semibold">{t("common.notifications.title")}</p>
          {unread > 0 && <button type="button" onClick={markAll} className="text-xs font-medium text-primary hover:underline">{t("common.notifications.markAllRead")}</button>}
        </div>
        <ul className="max-h-80 overflow-y-auto border-t border-glass-border">
          {items === null && <li className="space-y-2 p-4">{[0, 1, 2].map((i) => <div key={i} className="skeleton h-10" />)}</li>}
          {items?.length === 0 && <li className="p-6 text-center text-sm text-muted-foreground">{t("common.notifications.empty")}</li>}
          {items?.map((n) => {
            const title = locale === "ar" ? n.titleAr : n.titleEn;
            const body = locale === "ar" ? n.bodyAr : n.bodyEn;
            const inner = (
              <div className={cn("flex gap-3 px-4 py-3 text-sm", !n.readAt && "bg-primary/5")}>
                <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-transparent" : "bg-primary")} />
                <div className="min-w-0 flex-1">
                  <p className="font-medium leading-snug">{title}</p>
                  {body && <p className="line-clamp-2 text-xs text-muted-foreground">{body}</p>}
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{formatRelative(n.createdAt, locale)}</p>
                </div>
              </div>
            );
            return <li key={n.id}>{n.href ? <Link href={n.href} onClick={() => setOpen(false)} className="block hover:bg-foreground/[0.04]">{inner}</Link> : inner}</li>;
          })}
        </ul>
        <div className="border-t border-glass-border px-4 py-2 text-center">
          <Link href="/notifications" onClick={() => setOpen(false)} className="text-xs font-medium text-primary hover:underline">{t("common.notifications.viewAll")}</Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
