"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  MIN_PASSWORD_LENGTH,
  PASSWORD_RESET_TTL_MINUTES,
} from "@aim/contracts";
import { PasswordChecklist, useFieldMirror } from "@/components/password-field";
import { buttonClass, FIELD } from "@/components/ui";
import { resetUserPassword, type ResetState } from "./security-actions";

function Submit({ mode }: { mode: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("danger", "md")}
    >
      {pending
        ? "Working..."
        : mode === "LINK"
          ? "Issue a reset link"
          : "Set a temporary password"}
    </button>
  );
}

export function ResetPanel({
  userId,
  name,
  email,
}: {
  userId: string;
  name: string;
  email: string;
}) {
  const [mode, setMode] = useState<"LINK" | "TEMPORARY_PASSWORD">("LINK");
  const [state, formAction] = useActionState<ResetState, FormData>(
    resetUserPassword,
    {},
  );
  const temporary = useFieldMirror();

  // Once a link has been issued the form is replaced by the link. Leaving the
  // form up would invite a second issue, which voids the first -- and an
  // administrator who has just handed somebody a link should not be able to
  // kill it by absent-mindedly pressing the button again.
  if (state.resetUrl) {
    return (
      <div className="space-y-3">
        <div className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-3 text-xs text-signal-green">
          <p className="font-semibold">Link issued. Hand it to {name}.</p>
          <p className="mt-1 text-ink-200">{state.note}</p>
        </div>

        <div>
          <label htmlFor="resetUrl" className="rule-label mb-1.5 block">
            One-time reset link
          </label>
          <input
            id="resetUrl"
            readOnly
            value={state.resetUrl}
            onFocus={(event) => event.currentTarget.select()}
            className={`${FIELD} w-full font-mono`}
          />
          <p className="mt-1 text-[11px] text-ink-400">
            Shown once, here, because you asked for it on their behalf and the
            audit log records that you did. Nothing about the account has
            changed yet — their current password keeps working until this is
            spent, so issuing it against the wrong person has locked nobody out.
            {state.expiresAt
              ? ` Expires ${new Date(state.expiresAt).toLocaleString()}.`
              : ""}
          </p>
        </div>
      </div>
    );
  }

  if (state.note) {
    return (
      <div className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-3 text-xs text-signal-green">
        <p className="font-semibold">Temporary password set.</p>
        <p className="mt-1 text-ink-200">{state.note}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="userId" value={userId} />
      <input type="hidden" name="email" value={email} />
      <input type="hidden" name="name" value={name} />
      <input type="hidden" name="mode" value={mode} />

      <fieldset className="space-y-2">
        <legend className="rule-label mb-1.5">How</legend>

        <label className="flex items-start gap-2 text-xs text-ink-300">
          <input
            type="radio"
            checked={mode === "LINK"}
            onChange={() => setMode("LINK")}
            className="mt-0.5 accent-brass-500"
          />
          <span>
            Issue a one-time link
            <span className="mt-0.5 block text-[11px] text-ink-400">
              Good for {PASSWORD_RESET_TTL_MINUTES} minutes. Their current
              password keeps working until they use it, and no session ends.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-2 text-xs text-ink-300">
          <input
            type="radio"
            checked={mode === "TEMPORARY_PASSWORD"}
            onChange={() => setMode("TEMPORARY_PASSWORD")}
            className="mt-0.5 accent-brass-500"
          />
          <span>
            Set a temporary password
            <span className="mt-0.5 block text-[11px] text-ink-400">
              Takes effect now, ends every session they have, and holds the
              account at the password screen until they replace it.
            </span>
          </span>
        </label>
      </fieldset>

      {mode === "TEMPORARY_PASSWORD" ? (
        <div>
          <label
            htmlFor="temporaryPassword"
            className="rule-label mb-1.5 block"
          >
            Temporary password
          </label>
          <input
            ref={temporary.ref}
            id="temporaryPassword"
            name="temporaryPassword"
            type="text"
            autoComplete="off"
            onChange={temporary.onChange}
            className={`${FIELD} w-full font-mono`}
            placeholder={`at least ${MIN_PASSWORD_LENGTH} characters`}
          />
          {/* Held to the same rules as a password they choose themselves, so
              the administrator sees which ones it misses before it is refused. */}
          <PasswordChecklist
            password={temporary.value}
            subject={{ name, email }}
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="reason" className="rule-label mb-1.5 block">
          Why
        </label>
        <input
          id="reason"
          name="reason"
          required
          minLength={10}
          className={`${FIELD} w-full`}
          placeholder="Goes on the audit event"
        />
      </div>

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

      <Submit mode={mode} />
    </form>
  );
}
