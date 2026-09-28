"use server";

import { revalidatePath } from "next/cache";
import { checkPassword } from "@aim/contracts";
import { api, ApiError } from "@/lib/api";
import { act } from "@/lib/act";

export interface ResetState {
  error?: string;
  problems?: string[];
  /** Only ever set for a LINK reset, and only to the administrator who asked. */
  resetUrl?: string;
  expiresAt?: string;
  note?: string;
}

/**
 * Resetting somebody else's password.
 *
 * Two modes, because the situations differ. A link changes nothing until the
 * person spends it, so resetting the wrong account costs nobody anything. A
 * temporary password takes effect at once and ends every session, which is
 * what you want when the person is standing there and their mailbox is the
 * thing they have lost.
 */
export async function resetUserPassword(
  _prev: ResetState,
  formData: FormData,
): Promise<ResetState> {
  const userId = String(formData.get("userId") ?? "");
  const mode = String(formData.get("mode") ?? "LINK") as
    "LINK" | "TEMPORARY_PASSWORD";
  const reason = String(formData.get("reason") ?? "").trim();
  const temporaryPassword = String(formData.get("temporaryPassword") ?? "");

  if (reason.length < 10) {
    return {
      error: "Say why this account is being reset — at least 10 characters.",
    };
  }

  if (mode === "TEMPORARY_PASSWORD") {
    // The same policy the person's own screen applies, from the same module.
    // An administrator-set password that could be weaker than an owner-set one
    // would be a back door with a form in front of it.
    const verdict = checkPassword(temporaryPassword, {
      email: String(formData.get("email") ?? ""),
      name: String(formData.get("name") ?? ""),
    });
    if (!verdict.ok) return { problems: verdict.problems };
  }

  try {
    const result = await api<{
      mode: string;
      resetUrl?: string;
      expiresAt?: string;
      note: string;
    }>(`/users/${userId}/password-reset`, {
      method: "POST",
      body: {
        mode,
        reason,
        ...(mode === "TEMPORARY_PASSWORD" ? { temporaryPassword } : {}),
      },
    });

    revalidatePath(`/admin/users/${userId}`);
    return {
      resetUrl: result.resetUrl,
      expiresAt: result.expiresAt,
      note: result.note,
    };
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string | string[] } | undefined;
      if (Array.isArray(body?.message)) return { problems: body.message };
      return { error: error.message };
    }
    throw error;
  }
}

/**
 * Confirming somebody's address by hand, for a candidate mail cannot reach.
 * Does what their own confirmation link would have: enrolment and welcome follow.
 */
export async function confirmUserEmail(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  await act(`/users/${userId}/verify-email`, {
    method: "POST",
    body: { reason: String(formData.get("reason") ?? "") },
  });
  revalidatePath(`/admin/users/${userId}`);
}

/** Lifting an automatic lockout before it lapses by itself. */
export async function unlockUser(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  await act(`/users/${userId}/unlock`, {
    method: "POST",
    body: { reason: String(formData.get("reason") ?? "") },
  });
  revalidatePath(`/admin/users/${userId}`);
}

/** Ending one of somebody's sessions, or all of them. */
export async function revokeUserSessions(formData: FormData) {
  const userId = String(formData.get("userId") ?? "");
  const sessionId = String(formData.get("sessionId") ?? "");

  await act(`/users/${userId}/sessions/revoke`, {
    method: "POST",
    body: {
      ...(sessionId ? { sessionId } : {}),
      reason: String(formData.get("reason") ?? ""),
    },
  });
  revalidatePath(`/admin/users/${userId}`);
}
