"use server";

export interface ResendState {
  message?: string;
}

/**
 * Asking for another confirmation link.
 *
 * The API answers identically whether or not the address is on the roll, and
 * this passes that answer through unchanged. Improving on it here — "no such
 * account" — would turn a helpful form into a way to ask which addresses are
 * registered.
 */
export async function resendVerification(
  _prev: ResendState,
  formData: FormData,
): Promise<ResendState> {
  const email = String(formData.get("email") ?? "").trim();
  if (!email) return { message: "Give the address you signed up with." };

  const response = await fetch(
    `${process.env.API_BASE_URL ?? "http://localhost:4000"}/api/auth/verify/resend`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email }),
      cache: "no-store",
    },
  );

  const body = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;

  return {
    message:
      body?.message ??
      "If that address belongs to an unconfirmed account, a new link is on its way.",
  };
}
