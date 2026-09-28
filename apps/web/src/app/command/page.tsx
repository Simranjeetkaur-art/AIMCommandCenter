import Image from "next/image";
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api";
import { CommandRoutes } from "@/components/command-routes";

/**
 * The Command Dashboard.
 *
 * Four routes, in the order the method runs: assess the authority that exists,
 * prescribe the controls that bound it, qualify the people who will hold it,
 * certify that they can. The cards are the same four the approved design
 * names; where each one leads depends on the role, because "the Academy" is a
 * syllabus to a manager and a set of lessons to a candidate.
 */
export default async function CommandDashboardPage() {
  const session = await getSession();
  const standing = session.previewRole ?? session.user.role;
  // A candidate's dashboard already carries these four routes, so there is
  // one home for them rather than two that say the same thing.
  if (standing === "STUDENT") redirect("/student");

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-xl border border-ink-800">
        <Image
          src="/aim-command-hero.png"
          alt="Robotic and human hands meeting, over the words The Last Command"
          width={1600}
          height={600}
          priority
          className="h-auto w-full object-cover"
        />
      </div>

      <div>
        <p className="rule-label">AIM Command Center</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Command Dashboard
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          Four routes, in the order the method runs. Assess the authority that
          already exists, prescribe the controls that bound it, qualify the
          people who will hold it, and certify that they can.
        </p>
      </div>

      <CommandRoutes role={standing} />

      <div className="panel flex flex-wrap items-center justify-between gap-3 px-5 py-4">
        <b className="rule-label">Command principle</b>
        <span className="flex-1 text-sm text-ink-300">
          AI provides the intelligence. AIM™ governs the authority. Humans
          retain the command.
        </span>
        <em className="font-mono text-[11px] uppercase not-italic tracking-[0.25em] text-brass-500">
          The Last Command
        </em>
      </div>
    </div>
  );
}
