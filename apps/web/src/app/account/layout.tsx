import { Shell } from "@/components/shell";
import { getSession } from "@/lib/api";

/**
 * The account area belongs to no portal.
 *
 * Every other layout calls `requirePortal`, which sends a manager who lands on
 * /admin back where they belong. There is nothing to check here: everybody has
 * an account, and this is the one screen somebody held at the password gate
 * can still reach, so a role check would be the thing locking them out of the
 * only door left open to them.
 */
export default async function AccountLayout({
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
