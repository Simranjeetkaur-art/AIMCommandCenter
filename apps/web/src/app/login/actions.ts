"use server";

import { redirect } from "next/navigation";
import { PORTAL_HOME, type SessionUser } from "@aim/contracts";
import { clearSession, setSession } from "@/lib/session";

interface LoginResult {
  token: string;
  expiresAt: string;
  user: SessionUser;
  /** True when this session may do nothing but set a new password. */
  mustChangePassword?: boolean;
}

export interface LoginState {
  error?: string;
  /** True when the refusal was the verification gate, so the form can offer a way on. */
  unverified?: boolean;
}

/**
 * Sign-in runs entirely on the server.
 *
 * The credentials are posted to a server action, exchanged for a session token
 * against the API, and the token goes straight into an httpOnly cookie. It is
 * never serialised into a page, a props object or a client bundle, so there is
 * no point at which the browser holds something it could replay.
 */
export async function login(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return { error: "Enter an email address and a password." };
  }

  const response = await fetch(
    `${process.env.API_BASE_URL ?? "http://localhost:4000"}/api/auth/login`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    /**
     * A 403 here is the verification gate, not a bad password.
     *
     * The distinction is safe to show because the server only reaches that
     * check *after* the password is correct: nobody learns an address is
     * unconfirmed without already knowing its password. Every other failure
     * still gets the one indistinguishable message, because saying which of
     * address or password was wrong is an account oracle.
     */
    if (response.status === 403) {
      const body = (await response.json().catch(() => null)) as {
        message?: string;
      } | null;
      return {
        error: body?.message ?? "Confirm your email address before signing in.",
        unverified: true,
      };
    }
    return { error: "Those credentials were not accepted." };
  }

  const result = (await response.json()) as LoginResult;
  await setSession(result.token, result.user, result.expiresAt);

  /**
   * An account held at the password screen goes there rather than to its
   * portal.
   *
   * Not a security measure -- the API refuses every other route regardless,
   * and would do so whether or not this line existed. It is the difference
   * between landing on a password screen that explains itself and landing on a
   * dashboard that mysteriously refuses everything.
   */
  if (result.mustChangePassword) redirect("/account/security");

  redirect(PORTAL_HOME[result.user.role]);
}

export async function logout() {
  const { getSessionToken } = await import("@/lib/session");
  const token = await getSessionToken();

  if (token) {
    // Revoke server-side as well as dropping the cookie, so the token is dead
    // even if a copy of it exists somewhere.
    await fetch(
      `${process.env.API_BASE_URL ?? "http://localhost:4000"}/api/auth/logout`,
      {
        method: "POST",
        headers: { authorization: `Bearer ${token}` },
        cache: "no-store",
      },
    ).catch(() => undefined);
  }

  await clearSession();
  redirect("/login");
}
