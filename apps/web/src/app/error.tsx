"use client";

import Link from "next/link";
import { buttonClass } from "@/components/ui";

/**
 * The last resort.
 *
 * Refusals that a page anticipates are handled where they happen -- a redirect
 * to the caller's own portal, or a panel saying the server refused. This
 * catches what is left, and says plainly that the server declined rather than
 * showing a stack trace or pretending the data was empty.
 */
export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const refused = /refus|forbidden|does not hold|holds none/i.test(
    error.message,
  );

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <p className="rule-label">
        {refused ? "Refused" : "Something went wrong"}
      </p>
      <h1 className="text-2xl font-semibold tracking-tight">
        {refused
          ? "Your role does not have access to that"
          : "That page could not be loaded"}
      </h1>
      <p className="text-sm leading-relaxed text-ink-400">
        {refused
          ? "The server declined the request. This is the boundary working: what a role cannot do is enforced there, not hidden in the interface."
          : "The request did not complete. Nothing was changed."}
      </p>
      <div className="flex gap-3">
        <button
          onClick={reset}
          className="rounded-lg border border-ink-700 px-4 py-2 text-xs transition hover:border-brass-500"
        >
          Try again
        </button>
        <Link href="/" className={buttonClass("primary", "md")}>
          Back to my portal
        </Link>
      </div>
    </main>
  );
}
