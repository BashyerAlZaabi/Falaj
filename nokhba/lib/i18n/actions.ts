"use server";

import { cookies } from "next/headers";
import { LOCALE_COOKIE, isLocale } from "./config";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export async function setLocale(locale: string) {
  if (!isLocale(locale)) return { ok: false as const };
  const jar = await cookies();
  jar.set(LOCALE_COOKIE, locale, { path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  const session = await auth();
  if (session?.user?.id) {
    await db.user.update({ where: { id: session.user.id }, data: { locale } }).catch(() => null);
  }
  return { ok: true as const };
}
