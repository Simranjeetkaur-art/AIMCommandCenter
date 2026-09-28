import Link from "next/link";
import { AIM_TRACK_META, type AimTrack } from "@aim/contracts";
import { api, apiOrNull } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass, statusTone } from "@/components/ui";
import type { LearnerRecord } from "./types";
import { CommandRoutes } from "@/components/command-routes";

export default async function StudentDashboard() {
  // /me/record. There is no learner id in this call, and no way to supply one:
  // the server reads the actor from the session and answers about them.
  // Every live track, as the academy lists them; not a fixed three.
  const liveCodes = (
    (await apiOrNull<
      Array<{
        code: string;
        status: string;
        visible: boolean;
        versions?: Array<{ status: string }>;
      }>
    >("/academy/programmes")) ?? []
  )
    .filter(
      (p) =>
        p.status === "ACTIVE" &&
        p.visible &&
        (p.versions ?? []).some((v) => v.status === "PUBLISHED"),
    )
    .map((p) => p.code);
  const [record, ...tracks] = await Promise.all([
    api<LearnerRecord>("/me/record"),
    ...liveCodes.map((code) =>
      apiOrNull<{
        code: string;
        modules: Array<{ completed: boolean }>;
        assessments: Array<{ passed: boolean | null }>;
        enrolled: boolean;
      }>(`/academy/tracks/${code}`),
    ),
  ]);
  const enrolledTracks = tracks.filter(
    (t): t is NonNullable<typeof t> => t !== null && t.enrolled,
  );

  const completed = record.progress.filter(
    (p) => p.status === "COMPLETED",
  ).length;
  const awaiting = record.submissions.filter((s) =>
    ["SUBMITTED", "IN_REVIEW"].includes(s.status),
  ).length;
  const returned = record.submissions.filter((s) => s.status === "RETURNED");

  return (
    <div className="space-y-6">
      {/*
       * The first thing a new candidate sees.
       *
       * An empty dashboard used to be four zeroes and a sentence saying they
       * were not enrolled -- true, and no help at all: nothing on the screen
       * said what to do about it or where the courses were. This is the way
       * in, and it disappears the moment they are on a track.
       */}
      {enrolledTracks.length === 0 ? (
        <section className="panel p-6">
          <p className="rule-label">Welcome to the AIM Academy</p>
          <h2 className="mt-1.5 text-xl font-semibold tracking-tight">
            Start with the Academy
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-300">
            {record.enrollments.length === 0
              ? "You are not on a course yet. Open the Academy to see the tracks, read what each one leads to, and begin the modules that are open to you."
              : "Your place is being set up. Open the Academy to see the tracks and what each one leads to."}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href="/student/academy"
              className={buttonClass("primary", "lg")}
            >
              Go to the Academy
            </Link>
            <Link
              href="/student/certification"
              className={buttonClass("secondary", "lg")}
            >
              How certification works
            </Link>
          </div>
        </section>
      ) : null}

      {/* The method's four routes, once, here: this page is the candidate's
          home, so the separate Command Dashboard is not in their nav. */}
      <CommandRoutes role="STUDENT" compact />

      {enrolledTracks.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-3">
          {enrolledTracks.map((track) => {
            const done = track.modules.filter((m) => m.completed).length;
            const passed = track.assessments.filter(
              (a) => a.passed === true,
            ).length;
            const meta = AIM_TRACK_META[track.code as AimTrack];
            return (
              <Link
                key={track.code}
                href={`/student/academy/${track.code}`}
                className="panel p-5 transition hover:border-brass-500"
              >
                <span className="font-mono text-xs text-brass-500">
                  {track.code}
                </span>
                <h2 className="mt-1.5 text-base font-semibold tracking-tight">
                  {meta?.title}
                </h2>
                <p className="mt-1 text-xs text-ink-400">{meta?.subtitle}</p>
                <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-ink-800">
                  <div
                    className="h-full rounded-full bg-brass-500"
                    style={{
                      width: `${Math.round((done / Math.max(track.modules.length, 1)) * 100)}%`,
                    }}
                  />
                </div>
                <p className="mt-2 font-mono text-xs tabular-nums text-ink-400">
                  {done}/{track.modules.length} modules · {passed}/
                  {track.assessments.length} assessments
                </p>
              </Link>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Lessons completed"
          value={completed}
          note={`of ${record.progress.length} started`}
        />
        <Stat
          label="Assessments sat"
          value={record.attempts.length}
          href="/student/grades"
        />
        <Stat label="Awaiting review" value={awaiting} />
        {/* Valid ones only: a revoked or suspended credential is on the
            record, but it is not one the candidate holds. */}
        <Stat
          label="Credentials held"
          value={
            record.credentials.filter((c) => c.status === "ISSUED").length
          }
        />
      </div>

      {returned.length > 0 ? (
        <Panel
          title="Work returned to you"
          hint="An examiner has asked for changes. Their comments are on each item."
        >
          <ul className="space-y-3">
            {returned.map((submission) => (
              <li
                key={submission.id}
                className="rounded-lg border border-signal-amber/30 bg-signal-amber/5 p-4"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs text-brass-500">
                    {submission.assessment.code}
                  </span>
                  <span className="text-sm font-medium">
                    {submission.assessment.title}
                  </span>
                  <Badge tone="amber">v{submission.version}</Badge>
                </div>
                {submission.reviews[0] ? (
                  <p className="mt-2 border-l-2 border-signal-amber/50 pl-3 text-xs leading-relaxed text-ink-200">
                    {submission.reviews[0].comment}
                  </p>
                ) : null}
                <Link
                  href={`/student/submissions/${submission.id}`}
                  className="mt-3 inline-block rounded-lg bg-brass-500 px-3 py-1.5 text-xs font-semibold text-ink-950"
                >
                  Revise and resubmit
                </Link>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-2">
        <Panel
          title="Enrolment"
          hint="The programme version you are being measured against."
        >
          {record.enrollments.length === 0 ? (
            <div className="rounded-lg border border-dashed border-ink-800 px-4 py-6 text-center">
              <p className="text-xs text-ink-400">
                You are not on a course yet. New candidates are placed
                automatically once their email is confirmed.
              </p>
              <Link
                href="/student/academy"
                className={`mt-3 inline-flex ${buttonClass("secondary", "md")}`}
              >
                Browse the Academy
              </Link>
            </div>
          ) : (
            <ul className="space-y-3">
              {record.enrollments.map((enrollment) => (
                <li
                  key={enrollment.id}
                  className="rounded-lg border border-ink-800 p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-xs text-brass-500">
                      {enrollment.cohort.programmeVersion.programme.code}
                    </span>
                    <Badge tone={statusTone(enrollment.status)}>
                      {enrollment.status}
                    </Badge>
                  </div>
                  <p className="mt-1.5 text-sm font-medium">
                    {enrollment.cohort.programmeVersion.programme.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    {enrollment.cohort.title} &middot; version{" "}
                    {enrollment.cohort.programmeVersion.version}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel
          title="Badges"
          hint="Awarded by the system when a gate is cleared, never by request."
        >
          {record.badges.length === 0 ? (
            <Empty>No badges yet.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {record.badges.map((award) => (
                <li key={award.id}>
                  <Badge tone="green">{award.badge.title}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
