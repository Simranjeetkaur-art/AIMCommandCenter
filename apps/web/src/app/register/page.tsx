import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { ArrowRightIcon, CheckIcon } from "@/components/icons";
import { buttonClass } from "@/components/ui";
import { RegisterForm } from "./register-form";

const WHAT_YOU_GET = [
  "Lessons, assessments and command simulator missions",
  "Practice with AIM™ Dx on real governance scenarios",
  "Every credential you earn, each with its own serial",
];

/**
 * Enrolling yourself.
 *
 * Says plainly what the account will be, because the honest answer is not
 * "an account" but "a candidate's account": a student sees their own record
 * and nothing belonging to anybody else. Somebody who needs to examine, build
 * a programme or govern the register has to be given that by an administrator,
 * and it is better they learn that here than after signing up.
 */
export default function RegisterPage() {
  return (
    <AuthShell
      aside={
        <>
          <p className="rule-label">AIM Academy</p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
            Enrol as a candidate.
          </h1>
          <p className="mt-4 max-w-lg text-base leading-relaxed text-ink-300">
            Create your own account and start the AIM™ programme at Level 1.
            Your record is yours alone, and nobody else&apos;s is visible to
            you.
          </p>

          <ul className="mt-8 max-w-lg space-y-3">
            {WHAT_YOU_GET.map((item) => (
              <li key={item} className="flex items-start gap-3 text-sm text-ink-200">
                <span
                  aria-hidden="true"
                  className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-signal-green/15 text-signal-green"
                >
                  <CheckIcon className="size-3" strokeWidth={3} />
                </span>
                {item}
              </li>
            ))}
          </ul>

          <p className="mt-8 max-w-lg rounded-xl border border-ink-800 bg-ink-900/60 px-4 py-3 text-xs leading-relaxed text-ink-400">
            <span className="font-medium text-ink-200">
              Examining, authoring or administering?
            </span>{" "}
            Those roles carry authority over other people&apos;s records, so
            they are granted by an administrator, never claimed at sign-up.
          </p>
        </>
      }
    >
      <section className="panel w-full max-w-sm p-6">
        <h2 className="text-lg font-semibold">Create account</h2>
        <p className="mt-1 mb-5 text-xs text-ink-400">
          Your password is checked against the same rule every account here is
          held to, and it is never stored in a form anyone can read back.
        </p>

        <RegisterForm />

        <div className="my-5 flex items-center gap-3" aria-hidden="true">
          <span className="h-px flex-1 bg-ink-800" />
          <span className="rule-label">Already enrolled?</span>
          <span className="h-px flex-1 bg-ink-800" />
        </div>

        <Link
          href="/login"
          className={`${buttonClass("secondary", "lg")} w-full`}
        >
          Sign in
          <ArrowRightIcon className="size-4" />
        </Link>
      </section>
    </AuthShell>
  );
}
