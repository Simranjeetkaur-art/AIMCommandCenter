"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { NewPasswordField } from "@/components/password-field";
import { buttonClass } from "@/components/ui";
import { completeReset, type ResetState } from "../reset-actions";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`${buttonClass("primary", "lg")} w-full`}
    >
      {pending ? "Setting it..." : "Set my password"}
    </button>
  );
}

export function ResetForm({ token }: { token: string }) {
  const [state, formAction] = useActionState<ResetState, FormData>(
    completeReset,
    {},
  );

  if (state.done) {
    return (
      <div className="space-y-4">
        <div
          role="status"
          className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-3 text-xs leading-relaxed text-signal-green"
        >
          <p className="font-semibold">{state.done}</p>
          <p className="mt-1 text-ink-300">
            Every session on the account has been ended, including any you had
            open elsewhere. That is the point of a reset: if somebody else had
            your password, they are now signed out too.
          </p>
        </div>
        <Link
          href="/login"
          className={`${buttonClass("primary", "lg")} w-full`}
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="token" value={token} />

      {/* No subject: the link does not say whose account this is, so the
          name-and-address rule stays neutral here and the server checks it. */}
      <NewPasswordField
        name="newPassword"
        label="New password"
        confirmName="confirmPassword"
        confirmLabel="New password again"
      />

      {state.problems ? (
        <div
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red"
        >
          <p className="font-semibold">That password was not accepted:</p>
          <ul className="mt-1 space-y-0.5">
            {state.problems.map((problem) => (
              <li key={problem}>· {problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      {state.error ? (
        <div
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-sm text-signal-red"
        >
          <p>{state.error}</p>
          <Link
            href="/login/forgot"
            className="mt-1 inline-block text-xs underline"
          >
            Ask for a new link
          </Link>
        </div>
      ) : null}

      <Submit />
    </form>
  );
}
