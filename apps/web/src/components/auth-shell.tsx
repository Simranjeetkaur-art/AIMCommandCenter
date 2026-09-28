import Link from "next/link";
import type { ReactNode } from "react";
import { Wordmark } from "@/components/brand";
import { ThemeToggle } from "@/components/theme-toggle";

/**
 * The frame the sign-in and sign-up screens share.
 *
 * The form is the reason either page exists, so on a phone it comes first and
 * the explanation follows. From a laptop up, the explanation sits on the left
 * where it is read first and the form on the right where the hand goes. The
 * mark leads back to the landing page, which is otherwise a dead end away.
 */
export function AuthShell({
  aside,
  children,
}: {
  aside: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
        <Link
          href="/"
          aria-label="AIM Command Center home"
          className="rounded-lg focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-brass-500"
        >
          <Wordmark />
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto grid w-full max-w-6xl flex-1 grid-cols-1 content-center gap-10 px-4 pt-4 pb-12 sm:px-6 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-16">
        <div className="order-2 lg:order-1 lg:self-center">{aside}</div>
        <div className="order-1 flex justify-center lg:order-2 lg:self-center">
          {children}
        </div>
      </main>
    </div>
  );
}
