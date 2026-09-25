"use client";

import Link from "next/link";
import { signOut } from "next-auth/react";
import { LogOut, Settings, UserRound } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { useT } from "@/lib/i18n/client";
import { initials } from "@/lib/utils";

export type ShellUser = { id: string; name: string | null; email: string; image: string | null; role: string };

export function UserMenu({ user }: { user: ShellUser }) {
  const t = useT();
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="ms-1 rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={user.name ?? user.email}>
          <Avatar className="size-8 border border-glass-border">
            <AvatarImage src={user.image ?? undefined} alt="" />
            <AvatarFallback className="bg-primary/10 text-xs font-semibold text-primary">{initials(user.name ?? user.email)}</AvatarFallback>
          </Avatar>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="glass-3 min-w-56">
        <DropdownMenuLabel className="flex flex-col">
          <span className="truncate font-semibold">{user.name ?? user.email}</span>
          <span className="truncate text-xs font-normal text-muted-foreground">{t(`common.roles.${user.role}`)}</span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild><Link href="/profile"><UserRound className="size-4" /> {t("nav.profile")}</Link></DropdownMenuItem>
        <DropdownMenuItem asChild><Link href="/profile/settings"><Settings className="size-4" /> {t("nav.settings")}</Link></DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => signOut({ callbackUrl: "/" })}><LogOut className="size-4" /> {t("common.actions.signOut")}</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
