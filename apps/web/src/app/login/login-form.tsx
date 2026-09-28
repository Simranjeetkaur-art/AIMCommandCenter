"use client";

import { useActionState, useEffect, useRef, type Ref } from "react";
import { useFormStatus } from "react-dom";
import { PasswordInput } from "@/components/password-field";
import { login, type LoginState } from "./actions";
import { useDemoAccountChoice } from "./demo-accounts";

function Submit({ ref }: { ref: Ref<HTMLButtonElement> }) {
  const { pending } = useFormStatus();
  return (
    <button
      ref={ref}
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-brass-500 px-4 py-2.5 text-sm font-semibold text-ink-950 transition hover:bg-brass-600 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500 disabled:opacity-60"
    >
      {pending ? "Checking credentials..." : "Sign in"}
    </button>
  );
}

export function LoginForm() {
  const [state, formAction] = useActionState<LoginState, FormData>(login, {});
  const email = useRef<HTMLInputElement>(null);
  const password = useRef<HTMLInputElement>(null);
  const submit = useRef<HTMLButtonElement>(null);
  const choice = useDemoAccountChoice();

  // A demo card was picked: fill the fields and hand focus to "Sign in", so
  // Enter completes it. On a phone the form sits above the cards, so it is
  // brought back into view as well.
  useEffect(() => {
    if (!choice || !email.current || !password.current) return;
    email.current.value = choice.email;
    password.current.value = choice.password;
    email.current.form?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    submit.current?.focus({ preventScroll: true });
  }, [choice]);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label htmlFor="email" className="rule-label mb-1.5 block">
          Email
        </label>
        <input
          ref={email}
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2.5 text-sm outline-none focus:border-brass-500"
          placeholder="you@aim.edu"
        />
      </div>

      <div>
        <label htmlFor="password" className="rule-label mb-1.5 block">
          Password
        </label>
        <PasswordInput
          ref={password}
          id="password"
          name="password"
          autoComplete="current-password"
          required
        />
      </div>

      {state.error ? (
        <div
          role="alert"
          className={`rounded-lg border px-3 py-2 text-sm ${
            state.unverified
              ? "border-signal-amber/40 bg-signal-amber/10 text-signal-amber"
              : "border-signal-red/40 bg-signal-red/10 text-signal-red"
          }`}
        >
          <p>{state.error}</p>
          {state.unverified ? (
            <p className="mt-1 text-xs">
              <a href="/verify" className="underline">
                Send me a new confirmation link
              </a>
            </p>
          ) : null}
        </div>
      ) : null}

      <Submit ref={submit} />
    </form>
  );
}
