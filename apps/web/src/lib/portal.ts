import "server-only";
import { redirect } from "next/navigation";
import {
  PORTAL_HOME,
  type Permission,
  type Role,
  type SessionEnvelope,
} from "@aim/contracts";
import { getSession } from "./api";

/**
 * Establishes, on the server, that the signed-in role belongs in this portal.
 *
 * The middleware already redirects on a role cookie, but that cookie is
 * editable and the middleware says so. This is the authoritative check: the
 * role comes from /auth/me, which the API derives from the session row.
 *
 * Without it, a forged role cookie reaches the portal shell and the first
 * refused API call surfaces as a 500. No data leaks either way -- every call
 * is still refused -- but an error page is a poor way to say "not your portal".
 */
export async function requirePortal(role: Role): Promise<SessionEnvelope> {
  const session = await getSession();

  // A preview opens the previewed portal and closes the caller's own, which is
  // the point: an administrator looking at the instructor portal should see
  // the instructor portal, not be bounced home by the guard that protects it.
  // The session still says who they are, and the API still refuses every write.
  const standing = session.previewRole ?? session.user.role;

  if (standing !== role) {
    redirect(PORTAL_HOME[standing] ?? "/login");
  }

  return session;
}

/**
 * Establishes that the caller holds a permission before a page that needs it
 * renders, and sends them to their own portal if they do not.
 *
 * The API refuses either way, so nothing leaks without this. What it buys is a
 * redirect instead of an error page: "not yours" is a legitimate answer, and a
 * 500 is a poor way to say it.
 */
export async function requirePermission(
  permission: Permission,
): Promise<SessionEnvelope> {
  const session = await getSession();
  if (!session.permissions.includes(permission)) {
    redirect(PORTAL_HOME[session.user.role] ?? "/login");
  }
  return session;
}
