import Link from "next/link";
import { PASSWORD_RESET_TTL_MINUTES } from "@aim/contracts";
import { ForgotForm } from "./forgot-form";

export default function ForgotPage() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center px-6 py-12">
      <section className="panel p-6">
        <p className="rule-label">AIM Academy</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-2 mb-6 text-xs leading-relaxed text-ink-400">
          We will send a link that works once and expires in{" "}
          {PASSWORD_RESET_TTL_MINUTES} minutes. Your current password keeps
          working until you use it, so asking for one by mistake costs you
          nothing.
        </p>

        <ForgotForm />

        <p className="mt-6 border-t border-ink-800 pt-4 text-xs text-ink-400">
          Remembered it?{" "}
          <Link href="/login" className="text-brass-500 hover:underline">
            Back to sign in
          </Link>
        </p>
      </section>
    </main>
  );
}
