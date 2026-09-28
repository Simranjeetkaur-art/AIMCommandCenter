"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { DEMO_PASSWORD, ROLE_DIRECTORY } from "@/lib/role-directory";

interface Choice {
  email: string;
  password: string;
  /** Changes on every pick, so choosing the same card twice fills the form again. */
  at: number;
}

const DemoAccountContext = createContext<{
  choice: Choice | null;
  choose: (email: string) => void;
}>({ choice: null, choose: () => undefined });

/**
 * Lets a card on the left fill in the form on the right.
 *
 * The two sit in different columns of the page, so the choice is shared
 * through context rather than passed down; the sign-in form reads it with
 * `useDemoAccountChoice`.
 */
export function DemoAccountProvider({ children }: { children: ReactNode }) {
  const [choice, setChoice] = useState<Choice | null>(null);
  return (
    <DemoAccountContext.Provider
      value={{
        choice,
        choose: (email) =>
          setChoice({ email, password: DEMO_PASSWORD, at: Date.now() }),
      }}
    >
      {children}
    </DemoAccountContext.Provider>
  );
}

export function useDemoAccountChoice(): Choice | null {
  return useContext(DemoAccountContext).choice;
}

/**
 * One card per seeded role. Choosing one fills the sign-in form, password
 * included, and leaves the pressing of "Sign in" to the person: it is still
 * their sign-in, recorded in the audit log like any other.
 */
export function DemoAccounts() {
  const { choice, choose } = useContext(DemoAccountContext);

  return (
    <div>
      <p className="rule-label">Try a demo account</p>
      <div className="mt-3 grid gap-2.5 sm:grid-cols-2">
        {ROLE_DIRECTORY.map(({ role, email, scope, Icon }) => {
          const chosen = choice?.email === email;
          return (
            <button
              key={email}
              type="button"
              onClick={() => choose(email)}
              aria-pressed={chosen}
              className={`flex items-start gap-3 rounded-xl border bg-ink-900/80 p-3.5 text-left transition hover:border-brass-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500 ${
                chosen
                  ? "border-brass-500 ring-1 ring-brass-500"
                  : "border-ink-800"
              }`}
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-ink-700 bg-ink-950/60 text-brass-500">
                <Icon className="size-[18px]" />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-ink-100">
                  {role}
                </span>
                <span className="block text-xs text-ink-400">{scope}</span>
                <span className="mt-1 block truncate font-mono text-[11px] text-brass-500">
                  {email}
                </span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="mt-3 text-xs text-ink-400">
        Pick one and the sign-in form fills itself in, password included.
      </p>
    </div>
  );
}
