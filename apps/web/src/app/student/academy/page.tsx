import Link from "next/link";
import { AIM_TRACK_META, type AimTrack } from "@aim/contracts";
import { revalidatePath } from "next/cache";
import { apiOrNull } from "@/lib/api";
import { SubmitButton } from "@/components/submit-button";
import { act, done } from "@/lib/act";
import { Badge, Empty, Panel } from "@/components/ui";

interface Track {
  code: string;
  title: string;
  summary: string;
  enrolled: boolean;
  level: number;
  levelLabel: string;
  tagline: string;
  cardStats: string[];
  locked: boolean;
  devAccess: boolean;
  prerequisiteCode: string | null;
  prerequisiteMet: boolean;
  credentialHeld: boolean;
  modules: Array<{ id: string; completed: boolean }>;
  assessments: Array<{ id: string; kind: string; passed: boolean | null }>;
}

interface ProgrammeRow {
  code: string;
  status: string;
  visible: boolean;
  versions?: Array<{ status: string }>;
}

export default async function AcademyPage() {
  // Every live track, not a fixed list: a track an author builds and an
  // administrator publishes has to appear here without a code change.
  const programmes = (await apiOrNull<ProgrammeRow[]>("/academy/programmes")) ?? [];
  const codes = programmes
    .filter(
      (p) =>
        p.status === "ACTIVE" &&
        p.visible &&
        (p.versions ?? []).some((v) => v.status === "PUBLISHED"),
    )
    .map((p) => p.code);
  const tracks = await Promise.all(
    codes.map((code) => apiOrNull<Track>(`/academy/tracks/${code}`)),
  );

  const available = tracks.filter((t): t is Track => t !== null);

  // Courses this candidate may put themselves on. Empty unless a course has
  // self-enrolment switched on, which is off by default.
  const open =
    (await apiOrNull<
      Array<{
        cohortId: string;
        cohortCode: string;
        cohortTitle: string;
        programme: { code: string; title: string; summary: string };
      }>
    >("/cohorts/self-enrolment/open")) ?? [];

  async function join(formData: FormData) {
    "use server";
    const cohortId = String(formData.get("cohortId") ?? "");
    await act(`/cohorts/self-enrolment/${cohortId}`, { method: "POST" });
    revalidatePath("/student/academy");
    revalidatePath("/student");
    await done("You are on the course.");
  }

  if (available.length === 0 && open.length === 0) {
    return <Empty>No published track is available to you.</Empty>;
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">AIM™ Academy</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Qualification tracks
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          {available.length === 1 ? "One track" : `${available.length} tracks`},
          each gated the same way: work the modules, pass each assessment at
          its pass mark, and clear the practical and defence before a
          credential can be issued. Every answer is marked on the server — the
          key is never sent to this page.
        </p>
      </div>

      {open.length > 0 ? (
        <Panel
          title="Open to join"
          hint="These courses let you enrol yourself. Nobody has to place you."
        >
          <ul className="space-y-2">
            {open.map((course) => (
              <li
                key={course.cohortId}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 p-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium">
                    <span className="font-mono text-xs text-brass-500">
                      {course.programme.code}
                    </span>{" "}
                    {course.programme.title}
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    Joins {course.cohortCode} &middot; {course.cohortTitle}
                  </p>
                </div>
                <form action={join}>
                  <input
                    type="hidden"
                    name="cohortId"
                    value={course.cohortId}
                  />
                  <SubmitButton size="md" pendingLabel="Joining…">
                    Join this course
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {[...available]
          .sort((a, b) => a.level - b.level)
          .map((track) => {
            const done = track.modules.filter((m) => m.completed).length;
            const passed = track.assessments.filter(
              (a) => a.passed === true,
            ).length;
            const meta = AIM_TRACK_META[track.code as AimTrack];

            return (
              <Link
                key={track.code}
                href={`/student/academy/${track.code}`}
                className="panel flex flex-col p-5 transition hover:border-brass-500"
              >
                <div className="flex items-start justify-between gap-3">
                  <span className="rule-label">{track.levelLabel}</span>
                  {track.credentialHeld ? (
                    <Badge tone="green">Credential held</Badge>
                  ) : track.locked ? (
                    <Badge tone="amber">🔒 Locked</Badge>
                  ) : track.devAccess ? (
                    <Badge tone="amber">🧪 Dev access</Badge>
                  ) : track.enrolled ? (
                    <Badge tone="green">Enrolled</Badge>
                  ) : (
                    <Badge>Open</Badge>
                  )}
                </div>
                <p className="mt-2 font-mono text-xs text-brass-500">
                  {track.code}
                </p>
                <h2 className="mt-1 text-base font-semibold tracking-tight">
                  {meta?.title ?? track.title}
                </h2>
                <p className="mt-1.5 flex-1 text-xs leading-relaxed text-ink-400">
                  {track.tagline || track.summary}
                </p>
                {track.cardStats?.length ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {track.cardStats.map((stat) => (
                      <span
                        key={stat}
                        className="rounded-md border border-ink-800 px-2 py-0.5 text-[11px] text-ink-400"
                      >
                        {stat}
                      </span>
                    ))}
                  </div>
                ) : null}

                <dl className="mt-4 flex gap-5 border-t border-ink-800 pt-3 text-xs">
                  <div>
                    <dt className="rule-label">Modules</dt>
                    <dd className="mt-0.5 font-mono tabular-nums">
                      {done} / {track.modules.length}
                    </dd>
                  </div>
                  <div>
                    <dt className="rule-label">Assessments passed</dt>
                    <dd className="mt-0.5 font-mono tabular-nums">
                      {passed} / {track.assessments.length}
                    </dd>
                  </div>
                </dl>
                <span className="mt-3 text-xs font-semibold text-brass-500">
                  {track.locked ? "REVIEW PATH →" : "START TRAINING →"}
                </span>
              </Link>
            );
          })}
      </div>
    </div>
  );
}
