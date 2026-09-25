import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { compare } from "bcryptjs";
import { z } from "zod";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";
import { rateLimit } from "@/lib/security/rate-limit";

const credentialsSchema = z.object({ email: z.string().email(), password: z.string().min(8).max(200) });

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  providers: [
    ...authConfig.providers,
    Credentials({
      name: "Email",
      credentials: { email: { label: "Email", type: "email" }, password: { label: "Password", type: "password" } },
      async authorize(raw) {
        const parsed = credentialsSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        if (!rateLimit(`login:${email}`, { limit: 10, windowMs: 15 * 60_000 }).ok) return null;
        const user = await db.user.findUnique({ where: { email } });
        if (!user?.passwordHash) return null;
        const ok = await compare(parsed.data.password, user.passwordHash);
        if (!ok) return null;
        await db.user.update({ where: { id: user.id }, data: { lastActiveAt: new Date() } }).catch(() => null);
        return { id: user.id, email: user.email, name: user.name, image: user.image, role: user.role, onboardingDone: user.onboardingDone, locale: user.locale };
      },
    }),
  ],
  events: {
    async createUser({ user }) {
      if (!user.id) return;
      await db.profile.upsert({ where: { userId: user.id }, update: {}, create: { userId: user.id } });
      await db.analyticsEvent.create({ data: { userId: user.id, name: "user_signed_up", properties: { provider: "oauth" } } });
    },
  },
});
