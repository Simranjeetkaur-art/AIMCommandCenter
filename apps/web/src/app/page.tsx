import { redirect } from "next/navigation";
import { PORTAL_HOME } from "@aim/contracts";
import { getRoleHint, getSessionToken } from "@/lib/session";
import { Landing } from "./landing";

/**
 * The front door.
 *
 * Somebody already signed in goes straight to their portal, as before.
 * Everybody else gets the landing page, which says what this is and offers
 * both ways in, rather than a sign-in form that assumes they already know.
 */
export default async function Home() {
  if (await getSessionToken()) {
    const role = await getRoleHint();
    if (role) redirect(PORTAL_HOME[role]);
  }

  return <Landing />;
}
