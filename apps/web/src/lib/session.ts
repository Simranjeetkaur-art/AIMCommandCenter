import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { Role, SessionUser } from "@aim/contracts";

export const SESSION_COOKIE = "aim_session";
export const ROLE_COOKIE = "aim_role";
export const PREVIEW_COOKIE = "aim_preview";

/**
 * Where the session credential lives.
 *
 * The token is set httpOnly, so no script on the page can read it, and every
 * call that uses it happens in a server component or a server action. The
 * browser holds an opaque string it cannot read and never sends anywhere
 * except back to this server.
 *
 * The role is stored in a second, readable cookie purely so middleware can
 * redirect without a round trip. It is a hint for routing and nothing else --
 * the API re-derives the role from the session row on every request, so
 * forging this cookie changes which page is rendered and not one thing about
 * what the server will do for you.
 */
/**
 * Whether these cookies carry the Secure flag.
 *
 * On in production, as it should be. The exception is a deployment served
 * over plain HTTP -- a bare IP before a certificate exists -- where a browser
 * silently discards any Secure cookie the page sets. Sign-in then appears to
 * work, because the first page after it is rendered in the same response, and
 * the very next click lands back on the sign-in screen with no error anywhere.
 * `SESSION_COOKIE_SECURE=false` is for exactly that deployment, and should be
 * removed the day it gets HTTPS.
 */
function secureCookies(): boolean {
  const override = process.env.SESSION_COOKIE_SECURE;
  if (override === "false") return false;
  if (override === "true") return true;
  return process.env.NODE_ENV === "production";
}

export async function getSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

export async function getRoleHint(): Promise<Role | null> {
  const store = await cookies();
  return (store.get(ROLE_COOKIE)?.value as Role) ?? null;
}

export async function setSession(
  token: string,
  user: SessionUser,
  expiresAt: string,
) {
  const store = await cookies();
  const expires = new Date(expiresAt);

  store.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires,
  });

  store.set(ROLE_COOKIE, user.role, {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    expires,
  });
}

/**
 * Mirrors the preview onto a cookie so middleware can route to the previewed
 * portal without a round trip. Like the role cookie it decides which page
 * renders and nothing else: the preview that matters is the one on the session
 * row, which is what narrows permissions and refuses writes.
 */
export async function setPreviewHint(role: Role | null) {
  const store = await cookies();
  if (!role) {
    store.delete(PREVIEW_COOKIE);
    return;
  }
  store.set(PREVIEW_COOKIE, role, {
    httpOnly: false,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
  });
}

export async function clearSession() {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(ROLE_COOKIE);
  store.delete(PREVIEW_COOKIE);
}

/** Every portal page starts here. No token, no page. */
export async function requireSession(): Promise<string> {
  const token = await getSessionToken();
  if (!token) redirect("/login");
  return token;
}
