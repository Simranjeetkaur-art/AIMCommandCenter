"use server";

import { checkRegistration } from "@aim/contracts";

/**
 * What the API answers now: an account exists, and a link is on its way.
 *
 * Deliberately no session. The address has not been proven to reach anybody
 * yet, and signing somebody in before that would make the confirmation step
 * decorative.
 */
interface RegisterResult {
  pending: true;
  email: string;
  mailSent: boolean;
}

export interface RegisterState {
  /** Every problem at once, because a form that reveals one at a time is a quiz. */
  problems?: string[];
  /** What was typed, so a refusal does not also empty the form. */
  values?: { name: string; email: string };
  /** Set once the account exists and the confirmation link has gone out. */
  sent?: { email: string; mailSent: boolean };
}

/**
 * Enrolling, from the server.
 *
 * The details go to a server action and never touch a client bundle. Unlike
 * `login`, nothing comes back to put in a cookie: an account exists, a
 * confirmation link is in the post, and until it is clicked there is no
 * session to hold.
 *
 * The local `checkRegistration` call is a courtesy, not the control. It exists
 * so somebody who mistypes gets an answer without a round trip; the server
 * runs the identical function from the identical package and its answer is the
 * one that decides.
 */
export async function register(
  _prev: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  const name = String(formData.get("name") ?? "").trim();
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");
  const values = { name, email };

  const verdict = checkRegistration({ name, email, password });
  const problems = [...verdict.problems];

  // Not a server rule: the API never sees this field. A mistyped password
  // somebody cannot see is the one mistake this form can actually prevent.
  if (password !== confirm) {
    problems.push("The two passwords do not match.");
  }
  if (problems.length > 0) return { problems, values };

  const response = await fetch(
    `${process.env.API_BASE_URL ?? "http://localhost:4000"}/api/auth/register`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name, email, password }),
      cache: "no-store",
    },
  );

  if (!response.ok) {
    // The API answers with a message or a list of them. Both are shown as
    // given: it refused for a reason, and inventing a friendlier one here
    // would hide which rule was broken.
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = body?.message;
    return {
      problems: Array.isArray(message)
        ? message
        : [message ?? "That account could not be created."],
      values,
    };
  }

  const result = (await response.json()) as RegisterResult;

  // No redirect: the next thing that happens is in their inbox, and the page
  // has to say so. `mailSent` is passed through rather than assumed, so an
  // academy with no mail provider configured says that plainly instead of
  // telling somebody to check an inbox nothing was sent to.
  return { sent: { email: result.email, mailSent: result.mailSent } };
}
