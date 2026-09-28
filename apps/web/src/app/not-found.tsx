import Link from "next/link";
import { buttonClass } from "@/components/ui";

/**
 * Nothing here, said the same way whatever the reason.
 *
 * A record that does not exist and one outside the caller's scope get this
 * one page, so it cannot be used to learn which ids are real.
 */
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <p className="rule-label">Not found</p>
      <h1 className="text-2xl font-semibold tracking-tight">
        There is nothing here for you
      </h1>
      <p className="text-sm leading-relaxed text-ink-400">
        The address may be mistyped, the record may have been removed, or it
        may not be one your role can open.
      </p>
      <div className="flex gap-3">
        <Link href="/" className={buttonClass("primary", "md")}>
          Back to my portal
        </Link>
      </div>
    </main>
  );
}
