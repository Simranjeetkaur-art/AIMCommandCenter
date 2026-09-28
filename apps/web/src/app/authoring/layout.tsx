import { PERMISSIONS as P } from "@aim/contracts";
import { Shell } from "@/components/shell";
import { requirePermission } from "@/lib/portal";

/**
 * Authoring lives outside the role portals because two roles reach it: the
 * manager who builds the academy and the administrator who publishes it. The
 * gate is the permission, not the role -- which is also why an administrator
 * can reach it at all, since /manager is routed by role.
 */
export default async function AuthoringLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // programme.update, not programme.read: every role can read a programme,
  // and only the roles that build the academy belong on these screens.
  const session = await requirePermission(P.PROGRAMME_UPDATE);
  return (
    <Shell
      role={session.user.role}
      name={session.user.name}
      email={session.user.email}
      previewRole={session.previewRole ?? null}
    >
      {children}
    </Shell>
  );
}
