import { requireUser, subjectOf } from "@/lib/auth/session";
import { areasFor } from "@/lib/auth/permissions";
import { ADMIN_NAV, INSTRUCTOR_NAV, LEARNER_NAV, ORG_NAV } from "@/config/nav";
import { AppShell, type NavSection } from "@/components/layout/app-shell";
import { unreadCount } from "@/server/services/notifications";

export default async function PlatformLayout({ children }: LayoutProps<"/">) {
  const user = await requireUser();
  const areas = areasFor(subjectOf(user));
  const sections: NavSection[] = [{ key: "learning", items: LEARNER_NAV }];
  if (areas.instructor) sections.push({ key: "teaching", items: INSTRUCTOR_NAV });
  if (areas.organization) sections.push({ key: "organization", items: ORG_NAV });
  if (areas.admin) sections.push({ key: "administration", items: ADMIN_NAV });
  const unread = await unreadCount(user.id);
  return (
    <AppShell user={{ id: user.id, name: user.name, email: user.email, image: user.image, role: user.role }} sections={sections} unread={unread}>
      {children}
    </AppShell>
  );
}
