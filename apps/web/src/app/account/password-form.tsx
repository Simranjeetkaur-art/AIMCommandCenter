"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { NewPasswordField, PasswordInput } from "@/components/password-field";
import { buttonClass } from "@/components/ui";
import { changePassword, type PasswordState } from "./actions";

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("primary", "lg")}
    >
      {pending ? "Setting it..." : label}
    </button>
  );
}

export function PasswordForm({
  email,
  name,
  forced,
}: {
  /** Carried so the shared policy can refuse a password built out of either. */
  email: string;
  name: string;
  /** True when the account may do nothing else until this is done. */
  forced: boolean;
}) {
  const [state, formAction] = useActionState<PasswordState, FormData>(
    changePassword,
    {},
  );

  return (
    <form action={formAction} className="max-w-md space-y-4">
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="name" value={name} />

      <div>
        <label htmlFor="currentPassword" className="rule-label mb-1.5 block">
          Current password
        </label>
        <PasswordInput
          id="currentPassword"
          name="currentPassword"
          autoComplete="current-password"
          required
        />
        <p className="mt-1 text-[11px] text-ink-400">
          Asked for even though you are signed in. A session is something a
          borrowed laptop has; this is something only you have.
        </p>
      </div>

      <NewPasswordField
        name="newPassword"
        label="New password"
        confirmName="confirmPassword"
        confirmLabel="New password again"
        subject={{ email, name }}
      />

      <label className="flex items-start gap-2 text-xs text-ink-300">
        <input
          type="checkbox"
          name="keepOthers"
          className="mt-0.5 accent-brass-500"
        />
        <span>
          Keep my other sessions signed in.
          <span className="mt-0.5 block text-[11px] text-ink-400">
            Off by default. The usual reason to change a password is a worry
            that somebody else has it, and leaving their session open would make
            the change ceremonial.
          </span>
        </span>
      </label>

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
        <p
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-xs text-signal-red"
        >
          {state.error}
        </p>
      ) : null}

      {state.done ? (
        <p
          role="status"
          className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-2 text-xs text-signal-green"
        >
          {state.done}
        </p>
      ) : null}

      {/* Tells the action to carry on into the portal once the hold lifts,
          which is what the button promises. */}
      {forced ? <input type="hidden" name="forced" value="1" /> : null}
      <Submit
        label={forced ? "Set my password and continue" : "Change password"}
      />
    </form>
  );
}
