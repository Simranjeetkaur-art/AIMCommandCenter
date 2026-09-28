"use server";

import { checkPassword } from "@aim/contracts";
import { clearSession } from "@/lib/session";

const BASE = process.env.API_BASE_URL ?? "http://localhost:4000";

export interface ForgotState {
  sent?: string;
  error?: string;
}

/**
 * "I have forgotten my password."
 *
 * Runs against the API without a session, because somebody who cannot sign in
 * has none. Note what is *not* here: no branch on whether the address was
 * known. The API answers identically either way and so does this, because a
 * reset form that says "no such user" is a way to enumerate the roll.
 */
export async function requestReset(
  _prev: ForgotState,
  formData: FormData,
): Promise<ForgotState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { error: "Enter the email address for your account." };

  try {
    const response = await fetch(`${BASE}/api/auth/password/forgot`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    });

    if (!response.ok && response.status !== 202) {
      // A malformed address is the only thing that gets here, and saying so
      // reveals nothing about who holds an account.
      return { error: "That does not look like an email address." };
    }

    const body = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;

    return {
      sent:
        body?.message ??
        "If that address belongs to an account, a reset link is on its way.",
    };
  } catch {
    return { error: "Could not reach the server. Try again in a moment." };
  }
}

export interface ResetState {
  error?: string;
  problems?: string[];
  done?: string;
}

/**
 * Spending a reset link.
 *
 * Every session on the account ends, including any this browser was holding,
 * so the cookie is cleared here too -- otherwise the person would be left
 * carrying a token the server has already killed.
 */
export async function completeReset(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const token = String(formData.get("token") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");

  if (!token) {
    return { error: "This link is missing its token. Ask for a new one." };
  }
  if (newPassword !== confirm) {
    return { error: "The two passwords do not match." };
  }

  // The same check the API will run, from the same module, so the form cannot
  // accept something the server is about to refuse.
  const verdict = checkPassword(newPassword);
  if (!verdict.ok) return { problems: verdict.problems };

  try {
    const response = await fetch(`${BASE}/api/auth/password/reset`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
      cache: "no-store",
    });

    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;

    if (!response.ok) {
      if (Array.isArray(body?.message)) return { problems: body.message };
      return {
        error:
          typeof body?.message === "string"
            ? body.message
            : "That reset link is not valid any more. Ask for a new one.",
      };
    }

    await clearSession();
    return {
      done:
        typeof body?.message === "string"
          ? body.message
          : "Your password is set. Sign in with it.",
    };
  } catch {
    return { error: "Could not reach the server. Try again in a moment." };
  }
}
