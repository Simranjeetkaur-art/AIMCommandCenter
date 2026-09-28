import Link from "next/link";
import { ResetForm } from "./reset-form";

export default async function ResetPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-12">
      <section className="panel p-6">
        <p className="rule-label">AIM Academy</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Choose a new password
        </h1>

        {token ? (
          <>
            <p className="mt-2 mb-6 text-xs leading-relaxed text-ink-400">
              This link works once. Setting a password here ends every session
              on the account, everywhere.
            </p>
            {/*
              The token is put straight into a hidden field and posted back to
              a server action. It is never held in component state and never
              read by anything other than the server, which looks it up by hash
              -- the raw value exists in this page and nowhere else.
            */}
            <ResetForm token={token} />
          </>
        ) : (
          <div className="mt-4 rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-3 text-sm text-signal-red">
            <p className="font-semibold">This link is missing its token.</p>
            <p className="mt-1 text-xs">
              Reset links are long and mail clients sometimes break them across
              lines. Copy the whole thing, or ask for a new one.
            </p>
            <Link
              href="/login/forgot"
              className="mt-2 inline-block text-xs underline"
            >
              Ask for a new link
            </Link>
          </div>
        )}

        <p className="mt-6 border-t border-ink-800 pt-4 text-xs text-ink-400">
          <Link href="/login" className="text-brass-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
