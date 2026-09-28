import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ArrowRightIcon, LockIcon, LogIcon, AdminIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { DemoAccountProvider, DemoAccounts } from "./demo-accounts";
import { LoginForm } from "./login-form";

/** What the platform promises, in three words each, under the demo cards. */
const ASSURANCES = [
  { Icon: LockIcon, text: "Sessions held server-side" },
  { Icon: LogIcon, text: "Every action audited" },
  { Icon: AdminIcon, text: "Access enforced by role" },
];

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ expired?: string }>;
}) {
  const { expired } = await searchParams;

  return (
    <DemoAccountProvider>
      <AuthShell
        aside={
          <>
            <p className="rule-label">AIM Academy</p>
            <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
              Welcome back.
            </h1>
            <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-300">
              Sign in and you land in your own portal: lessons and credentials,
              a review queue, the programmes you build, or the whole
              institution.
            </p>

            <div className="mt-8 max-w-xl">
              <DemoAccounts />
            </div>

            <ul className="mt-8 flex max-w-xl flex-wrap gap-x-6 gap-y-2 border-t border-ink-800 pt-5">
              {ASSURANCES.map(({ Icon, text }) => (
                <li
                  key={text}
                  className="flex items-center gap-2 text-xs text-ink-400"
                >
                  <Icon className="size-4 text-brass-500" />
                  {text}
                </li>
              ))}
            </ul>
          </>
        }
      >
        <section className="panel w-full max-w-sm p-6">
          <h2 className="text-lg font-semibold">Sign in</h2>
          <p className="mt-1 mb-5 text-xs text-ink-400">
            Credentials are exchanged server-side. The browser never holds the
            session token.
          </p>

          {expired ? (
            <p className="mb-4 rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-3 py-2 text-xs text-signal-amber">
              Your session ended. Sign in again.
            </p>
          ) : null}

          <LoginForm />

          <p className="mt-3 text-right text-xs">
            <a href="/login/forgot" className="text-brass-500 hover:underline">
              Forgotten your password?
            </a>
          </p>

          <div className="my-5 flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-ink-800" />
            <span className="rule-label">New here?</span>
            <span className="h-px flex-1 bg-ink-800" />
          </div>

          <Link
            href="/register"
            className={`${buttonClass("secondary", "lg")} w-full`}
          >
            Create an account
            <ArrowRightIcon className="size-4" />
          </Link>
          <p className="mt-2 text-center text-[11px] text-ink-400">
            Enrol as a candidate. It takes a minute.
          </p>
        </section>
      </AuthShell>
    </DemoAccountProvider>
  );
}
