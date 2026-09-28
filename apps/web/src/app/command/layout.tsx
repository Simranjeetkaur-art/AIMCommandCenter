import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { getSession } from "@/lib/api";

/**
 * The dashboard is the hub every role arrives at, so there is no role check
 * here -- the same reasoning as the governance layout. Which of the four
 * routes a card points at is decided per role by the page, and each
 * destination enforces its own permissions on arrival.
 */
export default async function CommandLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getSession();
  // /auth/me stays reachable while an account is held at the password screen,
  // so the hold has to be applied here as it is on every data-bearing page.
  if (session.mustChangePassword) redirect("/account/security?forced=1");
  if (session.profileRequired) redirect("/account/profile?required=1");
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
