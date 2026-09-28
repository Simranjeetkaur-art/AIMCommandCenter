import { redirect } from "next/navigation";
import { PORTAL_HOME, type SessionUser } from "@aim/contracts";
import { setSession } from "@/lib/session";
import { ResendForm } from "./resend-form";

interface VerifyResult {
  token: string;
  expiresAt: string;
  user: SessionUser;
  alreadyVerified: boolean;
  enrolled: boolean;
  programme: string | null;
}

/**
 * Where a confirmation link lands.
 *
 * The token is spent on the server the moment this page renders, and the
 * session it returns goes straight into an httpOnly cookie — so the link both
 * confirms the address and signs the person in, which is the behaviour anybody
 * clicking a link in their inbox expects.
 *
 * It is a page rather than a form because the person has already acted: they
 * clicked the thing we sent them. Asking them to press another button to
 * confirm the confirmation would be ceremony.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (token) {
    const response = await fetch(
      `${process.env.API_BASE_URL ?? "http://localhost:4000"}/api/auth/verify`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
        cache: "no-store",
      },
    );

    if (response.ok) {
      const result = (await response.json()) as VerifyResult;
      await setSession(result.token, result.user, result.expiresAt);
      // Straight into the portal. They have proved the address and been placed.
      redirect(PORTAL_HOME[result.user.role]);
    }

    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body?.message.join(" ")
      : (body?.message ?? "That confirmation link could not be used.");

    return <Shell problem={message} />;
  }

  return (
    <Shell problem="This page needs a confirmation link. Open the one in your email." />
  );
}

function Shell({ problem }: { problem: string }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="rule-label">AIM Academy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Confirm your email
        </h1>
      </div>

      <p
        role="alert"
        className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-4 py-3 text-sm leading-relaxed text-signal-amber"
      >
        {problem}
      </p>

      <section className="panel p-6">
        <h2 className="text-sm font-semibold">Send me a new link</h2>
        <p className="mt-1 mb-4 text-xs leading-relaxed text-ink-400">
          Links expire after a day and can only be used once. Give the address
          you signed up with and we will send another.
        </p>
        <ResendForm />
      </section>

      <p className="text-xs text-ink-400">
        Already confirmed?{" "}
        <a href="/login" className="text-brass-500 hover:underline">
          Sign in
        </a>
      </p>
    </main>
  );
}
