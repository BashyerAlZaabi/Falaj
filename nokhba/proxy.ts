import NextAuth from "next-auth";
import { NextResponse, type NextRequest } from "next/server";
import { authConfig } from "./auth.config";

const { auth } = NextAuth(authConfig);

// Route classes. Everything under (platform) requires a session; admin/instructor/org
// areas additionally require a role (fine-grained permission checks happen in pages/APIs).
const PUBLIC_PREFIXES = ["/", "/programs", "/courses", "/enterprise", "/about", "/verify", "/sign-in", "/sign-up", "/forgot-password", "/reset-password", "/verify-email", "/api/auth", "/api/public", "/api/health"];
const ROLE_AREAS: Array<{ prefix: string; roles: string[] }> = [
  { prefix: "/admin", roles: ["COURSE_MANAGER", "ADMIN", "SUPER_ADMIN"] },
  { prefix: "/instructor", roles: ["INSTRUCTOR", "COURSE_MANAGER", "ADMIN", "SUPER_ADMIN"] },
  { prefix: "/org", roles: ["ORG_MANAGER", "ADMIN", "SUPER_ADMIN"] }, // org MANAGER members are re-checked in the page
];

const isPublic = (pathname: string) =>
  PUBLIC_PREFIXES.some((p) => (p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/")));

export default auth((req: NextRequest & { auth: { user?: { role?: string; onboardingDone?: boolean } } | null }) => {
  const { pathname } = req.nextUrl;
  const session = req.auth;

  // Security headers on every response.
  const withHeaders = (res: NextResponse) => {
    res.headers.set("X-Frame-Options", "DENY");
    res.headers.set("X-Content-Type-Options", "nosniff");
    res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    res.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return res;
  };

  if (isPublic(pathname)) {
    // Signed-in users skip the auth pages.
    if (session?.user && ["/sign-in", "/sign-up"].includes(pathname)) return withHeaders(NextResponse.redirect(new URL("/home", req.url)));
    return withHeaders(NextResponse.next());
  }

  if (!session?.user) {
    if (pathname.startsWith("/api/")) return withHeaders(NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    const url = new URL("/sign-in", req.url);
    url.searchParams.set("next", pathname);
    return withHeaders(NextResponse.redirect(url));
  }

  // Force onboarding once (learners only; staff roles are seeded as onboarded).
  if (!session.user.onboardingDone && !pathname.startsWith("/onboarding") && !pathname.startsWith("/api/") && !pathname.startsWith("/sign-out")) {
    return withHeaders(NextResponse.redirect(new URL("/onboarding", req.url)));
  }

  const area = ROLE_AREAS.find((a) => pathname === a.prefix || pathname.startsWith(a.prefix + "/") || pathname.startsWith("/api" + a.prefix));
  if (area) {
    const role = session.user.role ?? "LEARNER";
    const orgManagerCookie = req.cookies.get("nokhba_org_manager")?.value === "1"; // set on sign-in for org MANAGER/OWNER members
    const allowed = area.roles.includes(role) || (area.prefix === "/org" && orgManagerCookie);
    if (!allowed) {
      if (pathname.startsWith("/api/")) return withHeaders(NextResponse.json({ error: "Forbidden" }, { status: 403 }));
      return withHeaders(NextResponse.redirect(new URL("/home?denied=1", req.url)));
    }
  }
  return withHeaders(NextResponse.next());
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icons|images|fonts|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)"],
};
