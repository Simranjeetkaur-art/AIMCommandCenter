import { Shell } from "@/components/shell";
import { getSession } from "@/lib/api";

/**
 * Governance is shared ground: the registry, Dx and Rx are the craft the
 * academy teaches, so every role reaches some of it. There is no role check
 * here on purpose -- which panels appear is decided by what the API returns
 * for the caller's permissions.
 */
export default async function GovernanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
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
