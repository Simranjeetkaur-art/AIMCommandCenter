"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { NewPasswordField } from "@/components/password-field";
import { register, type RegisterState } from "./actions";

const FIELD =
  "w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2.5 text-sm outline-none focus:border-brass-500";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brass-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brass-600 disabled:opacity-60"
    >
      {pending ? "Creating your account..." : "Create account"}
    </button>
  );
}

export function RegisterForm() {
  const [state, formAction] = useActionState<RegisterState, FormData>(
    register,
    {},
  );
  // Mirrored as they are typed so the password rules can check against them
  // live: a password built out of your own name is refused before you submit.
  const [name, setName] = useState(state.values?.name ?? "");
  const [email, setEmail] = useState(state.values?.email ?? "");

  // The account exists and the link has gone. The form has nothing left to
  // collect, so it stops being a form and says what happens next.
  if (state.sent) {
    return (
      <div className="space-y-3">
        {/* Worded so it is true whether or not the address already had an
            account: the screen must not say which. */}
        <p className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-2.5 text-sm leading-relaxed text-signal-green">
          Check your email to finish.
        </p>
        {state.sent.mailSent ? (
          <p className="text-sm leading-relaxed text-ink-200">
            We have sent a message to{" "}
            <span className="font-medium">{state.sent.email}</span>. Follow the
            link in it to confirm your address; you will then be signed in and
            enrolled. The link is good for 24 hours.
          </p>
        ) : (
          <p className="text-sm leading-relaxed text-signal-amber">
            This academy is not sending email at the moment, so no message could
            go to <span className="font-medium">{state.sent.email}</span>. Ask
            an administrator to confirm your address, or to switch email on and
            send you a new link.
          </p>
        )}
        <p className="text-xs leading-relaxed text-ink-400">
          Nothing arrived? Check spam, then ask for another link from the{" "}
          <a href="/verify" className="text-brass-500 hover:underline">
            confirmation page
          </a>
          .
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="name" className="rule-label mb-1.5 block">
          Your name
        </label>
        <input
          id="name"
          name="name"
          autoComplete="name"
          required
          defaultValue={state.values?.name ?? ""}
          onChange={(event) => setName(event.target.value)}
          className={FIELD}
          placeholder="Ada Lovelace"
        />
        <p className="mt-1 text-[11px] text-ink-400">
          This is the name that will appear on any credential you earn.
        </p>
      </div>

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
          defaultValue={state.values?.email ?? ""}
          onChange={(event) => setEmail(event.target.value)}
          className={FIELD}
          placeholder="you@example.com"
        />
      </div>

      {/* The rules, before anybody types rather than after they are refused,
          ticking over as they are met. Same rules the server enforces. */}
      <NewPasswordField
        name="password"
        label="Password"
        confirmName="confirm"
        subject={{ name, email }}
      />

      {state.problems && state.problems.length > 0 ? (
        <div
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-sm text-signal-red"
        >
          <ul className="space-y-1">
            {state.problems.map((problem) => (
              <li key={problem}>{problem}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <Submit />
    </form>
  );
}
