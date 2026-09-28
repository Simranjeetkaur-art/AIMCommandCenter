"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { resendVerification, type ResendState } from "./actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg bg-brass-500 px-4 py-2 text-sm font-semibold text-ink-950 transition hover:bg-brass-600 disabled:opacity-60"
    >
      {pending ? "Sending…" : "Send a new link"}
    </button>
  );
}

export function ResendForm() {
  const [state, formAction] = useActionState<ResendState, FormData>(
    resendVerification,
    {},
  );

  return (
    <form action={formAction} className="space-y-3">
      <label htmlFor="email" className="rule-label block">
        Email
      </label>
      <div className="flex flex-wrap gap-2">
        <input
          id="email"
          name="email"
          type="email"
          required
          placeholder="you@example.com"
          className="min-w-56 flex-1 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
        />
        <Submit />
      </div>
      {state.message ? (
        <p role="status" className="text-xs leading-relaxed text-ink-400">
          {state.message}
        </p>
      ) : null}
    </form>
  );
}
