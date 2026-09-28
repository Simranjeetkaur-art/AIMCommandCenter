"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { PORTAL_HOME, checkPassword, checkProfile } from "@aim/contracts";
import { api, ApiError, getSession } from "@/lib/api";
import { clearSession } from "@/lib/session";
import { act } from "@/lib/act";

export interface PasswordState {
  error?: string;
  /** Every rule the proposed password broke, so the form states them at once. */
  problems?: string[];
  done?: string;
}

/**
 * Changing your own password.
 *
 * The policy runs here as well as on the server, and that is not belt and
 * braces for its own sake: it is the same function from `@aim/contracts`, so
 * the form and the API cannot disagree. What it buys is a person being told
 * their password is too short before it is sent anywhere.
 */
export async function changePassword(
  _prev: PasswordState,
  formData: FormData,
): Promise<PasswordState> {
  const currentPassword = String(formData.get("currentPassword") ?? "");
  const newPassword = String(formData.get("newPassword") ?? "");
  const confirm = String(formData.get("confirmPassword") ?? "");
  const keepOthers = formData.get("keepOthers") === "on";

  if (!currentPassword || !newPassword) {
    return { error: "Fill in your current password and the new one." };
  }
  if (newPassword !== confirm) {
    return { error: "The two new passwords do not match." };
  }

  const verdict = checkPassword(newPassword, {
    email: String(formData.get("email") ?? ""),
    name: String(formData.get("name") ?? ""),
  });
  if (!verdict.ok) return { problems: verdict.problems };

  let result: { otherSessionsEnded: number };
  try {
    result = await api<{ otherSessionsEnded: number }>("/auth/password", {
      method: "POST",
      body: {
        currentPassword,
        newPassword,
        otherSessions: keepOthers ? "KEEP" : "END",
      },
    });

  } catch (error) {
    if (error instanceof ApiError) {
      // The API returns the policy's problems as an array; show them as such
      // rather than flattening a list of rules into one run-on sentence.
      const body = error.body as { message?: string | string[] } | undefined;
      if (Array.isArray(body?.message)) return { problems: body.message };
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/account/security");

  // Held at the password screen until now: the hold has lifted, so carry on
  // into the portal as the button said. Outside the try, because redirect
  // works by throwing.
  if (formData.get("forced") === "1") {
    const session = await getSession();
    redirect(
      `${PORTAL_HOME[session.user.role] ?? "/"}?done=${encodeURIComponent("Password set. Welcome in.")}`,
    );
  }

  return {
    done:
      result.otherSessionsEnded > 0
        ? `Password changed. ${result.otherSessionsEnded} other session${
            result.otherSessionsEnded === 1 ? "" : "s"
          } ended.`
        : "Password changed.",
  };
}

/**
 * Ending one of your own sessions.
 *
 * Ending the one you are sitting in is signing out, so the cookie goes too --
 * otherwise the browser would hold a token the server has already killed and
 * every page would bounce to the sign-in screen without saying why.
 */
export async function endSession(formData: FormData) {
  const id = String(formData.get("sessionId") ?? "");
  if (!id) return;

  const result = await act<{ endedCurrent: boolean }>(`/auth/sessions/${id}`, {
    method: "DELETE",
  });

  if (result.endedCurrent) {
    await clearSession();
    redirect("/login");
  }

  revalidatePath("/account/security");
}

/** Ending every session but this one. */
export async function endOtherSessions() {
  await act("/auth/sessions/revoke-others", { method: "POST" });
  revalidatePath("/account/security");
}

export interface ProfileState {
  error?: string;
  /** Every field that failed, so the form states them at once. */
  problems?: string[];
  done?: string;
}

/**
 * Saving your own profile.
 *
 * Checked here with the same `checkProfile` the API applies, so the form and
 * the server cannot disagree about what "complete" means. When this save lifts
 * the first-sign-in hold, the person carries on into their portal.
 */
export async function saveProfile(
  _prev: ProfileState,
  formData: FormData,
): Promise<ProfileState> {
  const verdict = checkProfile({
    organisation: formData.get("organisation"),
    jobTitle: formData.get("jobTitle"),
    country: formData.get("country"),
    phone: formData.get("phone"),
    address: formData.get("address"),
  });
  if (!verdict.ok) return { problems: verdict.problems };

  const wasHeld = formData.get("required") === "1";
  try {
    await api("/auth/profile", { method: "PUT", body: verdict.profile });
  } catch (error) {
    if (error instanceof ApiError) {
      const body = error.body as { message?: string | string[] } | undefined;
      if (Array.isArray(body?.message)) return { problems: body.message };
      return { error: error.message };
    }
    throw error;
  }

  revalidatePath("/account/profile");

  if (wasHeld) {
    const session = await getSession();
    redirect(
      `${PORTAL_HOME[session.user.role] ?? "/"}?done=${encodeURIComponent("Profile complete. Welcome in — your courses are open.")}`,
    );
  }
  return { done: "Profile saved." };
}
