import { Shell } from "@/components/shell";
import { getSession } from "@/lib/api";

/**
 * Shared ground, like governance.
 *
 * Every role reaches this screen, because every role has a review about them
 * — including a candidate, who reads theirs and writes none. What each person
 * can see and do is decided by the API from their permissions and their place
 * on the ladder, not by a role check here.
 */
export default async function PerformanceLayout({
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
