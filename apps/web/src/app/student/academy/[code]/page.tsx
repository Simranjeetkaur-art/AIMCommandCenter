import Link from "next/link";
import { AIM_TRACK_META, type AimTrack } from "@aim/contracts";
import { revalidatePath } from "next/cache";
import { apiOrNotFound, apiOrNull } from "@/lib/api";
import { SubmitButton } from "@/components/submit-button";
import { act, done } from "@/lib/act";
import { Badge, Panel, Stat, buttonClass, statusTone } from "@/components/ui";
import { AccessNotice, CertificationGate } from "@/components/gate";

interface Track {
  code: string;
  title: string;
  summary: string;
  version: number;
  enrolled: boolean;
  levelLabel: string;
  tagline: string;
  cardStats: string[];
  locked: boolean;
  devAccess: boolean;
  prerequisiteMet: boolean;
  prerequisiteCode: string | null;
  accessReason: string;
  credentialHeld: boolean;
  gate: Array<{ label: string; met: boolean }>;
  requirements: Record<string, unknown>;
  modules: Array<{
    id: string;
    code: string | null;
    title: string;
    summary: string;
    position: number;
    completed: boolean;
    lessons: Array<{
      id: string;
      title: string;
      estimatedMinutes: number;
      completed: boolean;
    }>;
  }>;
  assessments: Array<{
    id: string;
    code: string;
    title: string;
    kind: string;
    passMark: number;
    requiresReview: boolean;
    maxAttempts: number;
    questionCount: number;
    attemptsUsed: number;
    bestScore: number | null;
    passed: boolean | null;
    submissionStatus: string | null;
  }>;
}

const KIND_TONE: Record<
  string,
  "green" | "amber" | "blue" | "red" | "neutral"
> = {
  QUIZ: "neutral",
  SIMULATION: "blue",
  PRACTICAL: "amber",
  CAPSTONE: "amber",
  DEFENCE: "red",
};

export default async function TrackPage({
  params,
}: {
  params: Promise<{ code: string }>;
}) {
  const { code } = await params;
  const track = await apiOrNotFound<Track>(`/academy/tracks/${code}`);
  const meta = AIM_TRACK_META[track.code as AimTrack];

  const modulesDone = track.modules.filter((m) => m.completed).length;
  const moduleAssessments = track.assessments.filter((a) =>
    a.code.endsWith("-ASSESS"),
  );
  const milestones = track.assessments.filter(
    (a) => !a.code.endsWith("-ASSESS"),
  );
  const badgesEarned = moduleAssessments.filter(
    (a) => a.passed === true,
  ).length;

  // The cohort this candidate may put themselves on, or null. The server
  // decides: this is the same list the Academy screen offers, so a course
  // with self-enrolment off never yields a button here, whatever this page
  // believes. Not asked for at all once they are on the course.
  const openCohort = track.enrolled
    ? null
    : ((
        (await apiOrNull<
          Array<{
            cohortId: string;
            cohortCode: string;
            programme: { code: string };
          }>
        >("/cohorts/self-enrolment/open")) ?? []
      ).find((c) => c.programme.code === track.code) ?? null);

  async function enrol(formData: FormData) {
    "use server";
    const cohortId = String(formData.get("cohortId") ?? "");
    await act(`/cohorts/self-enrolment/${cohortId}`, { method: "POST" });
    revalidatePath(`/student/academy/${code}`);
    revalidatePath("/student/academy");
    revalidatePath("/student");
    await done("You are on the course.");
  }

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2.5">
          <Badge>{track.levelLabel}</Badge>
          <p className="rule-label">
            {track.code} &middot; version {track.version}
          </p>
          {track.prerequisiteCode ? (
            <Badge tone={track.prerequisiteMet ? "green" : "amber"}>
              Requires {track.prerequisiteCode}
            </Badge>
          ) : null}
        </div>
        <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
          {meta?.title ?? track.title}
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          {track.tagline || track.summary}
        </p>
        {track.cardStats?.length ? (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {track.cardStats.map((stat) => (
              <span
                key={stat}
                className="rounded-md border border-ink-800 px-2.5 py-1 text-[11px] text-ink-400"
              >
                {stat}
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <AccessNotice
        locked={track.locked}
        devAccess={track.devAccess}
        reason={track.accessReason}
      />

      <CertificationGate
        steps={track.gate ?? []}
        levelLabel={track.levelLabel}
      />

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Modules complete"
          value={`${modulesDone} / ${track.modules.length}`}
        />
        <Stat
          label="Module quizzes passed"
          value={`${badgesEarned} / ${moduleAssessments.length}`}
        />
        <Stat
          label="Milestones passed"
          value={`${milestones.filter((m) => m.passed === true || m.submissionStatus === "APPROVED").length} / ${milestones.length}`}
        />
        <Stat
          label="Enrolment"
          value={
            track.enrolled ? (
              "Active"
            ) : openCohort ? (
              <form action={enrol}>
                <input
                  type="hidden"
                  name="cohortId"
                  value={openCohort.cohortId}
                />
                <SubmitButton size="md" pendingLabel="Enrolling…">
                  Enrol
                </SubmitButton>
              </form>
            ) : (
              "Not enrolled"
            )
          }
          note={openCohort ? `Joins ${openCohort.cohortCode}` : undefined}
        />
      </div>

      <Panel
        title="Command modules"
        hint="Each module carries its own assessment. The pass mark is 80%, enforced on the server."
      >
        <ol className="space-y-2">
          {track.modules.map((module) => {
            const assessment = moduleAssessments.find((a) =>
              module.code ? a.code.startsWith(module.code) : false,
            );
            return (
              <li
                key={module.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs text-brass-500">
                        {module.code ??
                          String(module.position).padStart(2, "0")}
                      </span>
                      <span className="text-sm font-medium">
                        {module.title}
                      </span>
                      {module.completed ? (
                        <Badge tone="green">Read</Badge>
                      ) : null}
                      {assessment?.passed === true ? (
                        <Badge tone="green">Quiz passed</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      {module.summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {track.locked ? (
                      <span className="rounded-lg border border-ink-800 px-3 py-1.5 text-xs text-ink-400">
                        Locked
                      </span>
                    ) : module.lessons[0] ? (
                      <Link
                        href={`/student/lessons/${module.lessons[0].id}`}
                        className={buttonClass("secondary", "md")}
                      >
                        Open lesson
                      </Link>
                    ) : null}
                    {assessment && !track.locked ? (
                      <Link
                        href={`/student/assessments/${assessment.id}`}
                        className="rounded-lg bg-brass-500 px-3 py-1.5 text-xs font-semibold text-ink-950"
                      >
                        {assessment.attemptsUsed >= assessment.maxAttempts
                          ? "Results"
                          : assessment.passed
                            ? "Retake"
                            : "Assessment"}
                      </Link>
                    ) : null}
                  </div>
                </div>

                {assessment && assessment.bestScore !== null ? (
                  <p className="mt-2 text-xs text-ink-400">
                    Best {assessment.bestScore}% &middot;{" "}
                    {assessment.attemptsUsed} of {assessment.maxAttempts}{" "}
                    attempts used
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
      </Panel>

      <Panel
        title="Qualification milestones"
        hint="Simulator, examination, practical and defence. Written milestones go to an examiner."
      >
        <ul className="space-y-2">
          {milestones.map((milestone) => (
            <li
              key={milestone.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-3"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-xs text-brass-500">
                    {milestone.code}
                  </span>
                  <span className="text-sm font-medium">{milestone.title}</span>
                  <Badge tone={KIND_TONE[milestone.kind] ?? "neutral"}>
                    {milestone.kind}
                  </Badge>
                </div>
                <p className="mt-0.5 text-xs text-ink-400">
                  {milestone.questionCount} items &middot; pass{" "}
                  {milestone.passMark}% &middot; {milestone.attemptsUsed} of{" "}
                  {milestone.maxAttempts} attempts used
                </p>
              </div>

              <div className="flex items-center gap-2">
                {milestone.submissionStatus ? (
                  <Badge tone={statusTone(milestone.submissionStatus)}>
                    {milestone.submissionStatus}
                  </Badge>
                ) : milestone.passed === true ? (
                  <Badge tone="green">Passed {milestone.bestScore}%</Badge>
                ) : milestone.bestScore !== null ? (
                  <Badge tone="amber">Best {milestone.bestScore}%</Badge>
                ) : null}

                {track.locked ? (
                  <span className="rounded-lg border border-ink-800 px-3 py-1.5 text-xs text-ink-400">
                    Locked
                  </span>
                ) : (
                  <Link
                    href={
                      milestone.kind === "SIMULATION"
                        ? `/student/simulator/${milestone.id}`
                        : `/student/assessments/${milestone.id}`
                    }
                    className={buttonClass("secondary", "md")}
                  >
                    {milestone.kind === "SIMULATION" ? "Fly" : "Open"}
                  </Link>
                )}
              </div>
            </li>
          ))}
        </ul>
      </Panel>

      <Link
        href="/student/academy"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to tracks
      </Link>
    </div>
  );
}
