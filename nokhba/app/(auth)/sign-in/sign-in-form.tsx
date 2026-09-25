"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/lib/i18n/client";

export function SignInForm({ next, error, providers }: { next: string; error: string | null; providers: { google: boolean; microsoft: boolean; apple: boolean } }) {
  const t = useT();
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(error ? "Invalid email or password." : null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setPending(true);
    setMessage(null);
    const form = new FormData(e.currentTarget);
    const res = await signIn("credentials", { email: String(form.get("email")), password: String(form.get("password")), redirect: false });
    setPending(false);
    if (res?.error) { setMessage("Invalid email or password."); return; }
    router.push(next.startsWith("/") ? next : "/home");
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("common.form.email")}</Label>
        <Input id="email" name="email" type="email" autoComplete="email" required dir="ltr" />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("common.form.password")}</Label>
        <Input id="password" name="password" type="password" autoComplete="current-password" required dir="ltr" />
      </div>
      {message && <p role="alert" className="text-sm text-destructive">{message}</p>}
      <Button type="submit" className="w-full rounded-xl" size="lg" disabled={pending}>{t("common.actions.signIn")}</Button>
      {(providers.google || providers.microsoft || providers.apple) && (
        <div className="grid gap-2">
          {providers.google && <Button type="button" variant="outline" onClick={() => signIn("google", { callbackUrl: next })}>Google</Button>}
          {providers.microsoft && <Button type="button" variant="outline" onClick={() => signIn("microsoft-entra-id", { callbackUrl: next })}>Microsoft</Button>}
          {providers.apple && <Button type="button" variant="outline" onClick={() => signIn("apple", { callbackUrl: next })}>Apple</Button>}
        </div>
      )}
      <p className="text-center text-sm text-muted-foreground">
        <Link href="/sign-up" className="font-medium text-primary hover:underline">{t("common.actions.signUp")}</Link>
      </p>
    </form>
  );
}
