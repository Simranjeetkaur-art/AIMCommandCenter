"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { buttonClass, FIELD } from "@/components/ui";
import { requestReset, type ForgotState } from "../reset-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary", "lg")} w-full`}
    >
      {pending ? "Sending..." : "Send a reset link"}
    </button>
  );
}

export function ForgotForm() {
  const [state, formAction] = useActionState<ForgotState, FormData>(
    requestReset,
    {},
  );

  // Once it has been sent the form is replaced rather than left sitting there
  // inviting a second attempt -- there is a cooldown on the server, and a
  // button that silently does nothing is worse than no button.
  if (state.sent) {
    return (
      <div
        role="status"
        className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-3 text-xs leading-relaxed text-signal-green"
      >
        <p className="font-semibold">Check your mail.</p>
        <p className="mt-1">{state.sent}</p>
        <p className="mt-2 text-ink-300">
          Nothing on this screen tells you whether that address has an account
          here, and that is on purpose: a form that said so would be a way to
          find out who does.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="rule-label mb-1.5 block">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          placeholder="you@aim.edu"
          className={`${FIELD} w-full py-2.5 text-sm`}
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-sm text-signal-red"
        >
          {state.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
