import type { NextAuthConfig } from "next-auth";
import Google from "next-auth/providers/google";
import MicrosoftEntraID from "next-auth/providers/microsoft-entra-id";
import Apple from "next-auth/providers/apple";

/**
 * Edge-safe part of the Auth.js configuration (no Prisma, no bcrypt) so proxy.ts can
 * read the session. Social providers activate automatically when their env vars exist;
 * until then they are listed as "coming soon" in the UI (see socialProviders()).
 */
export const socialProviders = () => ({
  google: !!(process.env.AUTH_GOOGLE_ID && process.env.AUTH_GOOGLE_SECRET),
  microsoft: !!(process.env.AUTH_MICROSOFT_ENTRA_ID_ID && process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET),
  apple: !!(process.env.AUTH_APPLE_ID && process.env.AUTH_APPLE_SECRET),
});

const enabled = socialProviders();

export const authConfig = {
  pages: { signIn: "/sign-in", error: "/sign-in", newUser: "/onboarding" },
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 30 },
  providers: [
    ...(enabled.google ? [Google({ allowDangerousEmailAccountLinking: false })] : []),
    ...(enabled.microsoft ? [MicrosoftEntraID({})] : []),
    ...(enabled.apple ? [Apple({})] : []),
  ],
  callbacks: {
    jwt({ token, user, trigger, session }) {
      if (user) {
        token.id = user.id;
        token.role = (user as { role?: string }).role ?? "LEARNER";
        token.onboardingDone = (user as { onboardingDone?: boolean }).onboardingDone ?? false;
        token.locale = (user as { locale?: string }).locale ?? "en";
      }
      if (trigger === "update" && session) {
        if (typeof session.onboardingDone === "boolean") token.onboardingDone = session.onboardingDone;
        if (typeof session.role === "string") token.role = session.role;
        if (typeof session.name === "string") token.name = session.name;
        if (typeof session.locale === "string") token.locale = session.locale;
      }
      return token;
    },
    session({ session, token }) {
      session.user.id = token.id as string;
      session.user.role = token.role as string;
      session.user.onboardingDone = token.onboardingDone as boolean;
      session.user.locale = token.locale as string;
      return session;
    },
  },
} satisfies NextAuthConfig;
