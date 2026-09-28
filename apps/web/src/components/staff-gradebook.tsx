import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import {
  STANDING,
  TrackGradeCard,
  type TrackGrades,
} from "@/components/gradebook";

interface TrackRow {
  id: string;
  number: number;
  programme: { id: string; code: string; title: string; level: number };
  learners: number;
}

interface Row extends TrackGrades {
  learner: { id: string; name: string; email: string };
  cohort: { id: string; code: string; title: string };
}

/**
 * The cohort's standing, for the people accountable for it.
 *
 * A track is chosen first and then read as a table, because the question staff
 * actually arrive with is "how is this cohort doing", not "how is this one
 * person doing" -- and the one person is one click inside the table.
 */
export async function StaffGradebook({
  basePath,
  search,
}: {
  basePath: string;
  search: { version?: string; learner?: string };
}) {
  const tracks = await api<TrackRow[]>("/gradebook/tracks");
  const versionId = search.version ?? tracks[0]?.id ?? null;

  const data = versionId
    ? await api<{ version: TrackRow; rows: Row[] }>(
        `/gradebook/versions/${versionId}`,
      )
    : null;

  const opened = search.learner
    ? (data?.rows.find((r) => r.learner.id === search.learner) ?? null)
    : null;

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Academy</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Grade book
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-ink-400">
          Where every candidate stands on a track. Lessons and module quizzes
          open the final examination; passing that issues the certificate. The
          simulator is practice and is shown but never counted.
        </p>
      </div>

      {tracks.length === 0 ? (
        <Empty>No cohort with active enrolments is visible to you.</Empty>
      ) : (
        <>
          <nav aria-label="Track" className="flex flex-wrap gap-1.5">
            {tracks.map((t) => (
              <Link
                key={t.id}
                href={`${basePath}?version=${t.id}`}
                aria-pressed={t.id === versionId}
                className={buttonClass("toggle", "sm")}
              >
                {t.programme.code} v{t.number} ({t.learners})
              </Link>
            ))}
          </nav>

          {data ? (
            <>
              <Cohort rows={data.rows} basePath={basePath} versionId={versionId!} />
              {opened ? (
                <div>
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium">
                      {opened.learner.name}{" "}
                      <span className="text-xs font-normal text-ink-400">
                        {opened.learner.email} · {opened.cohort.code}
                      </span>
                    </p>
                    <Link
                      href={`${basePath}?version=${versionId}`}
                      className={buttonClass("secondary", "sm")}
                    >
                      Close
                    </Link>
                  </div>
                  <TrackGradeCard
                    grades={opened}
                    heading={`${opened.learner.name} — ${opened.version.programme.code}`}
                  />
                </div>
              ) : null}
            </>
          ) : null}
        </>
      )}
    </div>
  );
}

function Cohort({
  rows,
  basePath,
  versionId,
}: {
  rows: Row[];
  basePath: string;
  versionId: string;
}) {
  const certified = rows.filter((r) => r.standing === "CERTIFIED").length;
  const examOpen = rows.filter((r) => r.finalExamOpen).length;
  const averages = rows
    .map((r) => r.average)
    .filter((a): a is number => a !== null);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Candidates" value={rows.length} />
        <Stat label="Final exam open" value={examOpen} />
        <Stat label="Certified" value={certified} />
        <Stat
          label="Cohort average"
          value={
            averages.length === 0
              ? "—"
              : `${Math.round(averages.reduce((n, a) => n + a, 0) / averages.length)}%`
          }
          note="graded papers only"
        />
      </div>

      <Panel
        title="Candidates"
        hint="Open a row for every mark on that candidate's record."
      >
        {rows.length === 0 ? (
          <Empty>Nobody is enrolled on this track version yet.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[46rem] text-left text-xs">
              <thead className="text-ink-400">
                <tr className="border-b border-ink-800">
                  <th scope="col" className="rule-label py-2 pr-3">Candidate</th>
                  <th scope="col" className="rule-label py-2 pr-3">Lessons</th>
                  <th scope="col" className="rule-label py-2 pr-3">Quizzes</th>
                  <th scope="col" className="rule-label py-2 pr-3">Average</th>
                  <th scope="col" className="rule-label py-2 pr-3">Final exam</th>
                  <th scope="col" className="rule-label py-2">Standing</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const standing = STANDING[row.standing] ?? STANDING.IN_PROGRESS;
                  return (
                    <tr
                      key={row.learner.id}
                      className="border-b border-ink-800/60 last:border-0"
                    >
                      <td className="py-2 pr-3">
                        <Link
                          href={`${basePath}?version=${versionId}&learner=${row.learner.id}`}
                          className="hover:text-brass-500"
                        >
                          <span className="block font-medium text-ink-100">
                            {row.learner.name}
                          </span>
                          <span className="block text-ink-500">
                            {row.learner.email}
                          </span>
                        </Link>
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {row.lessons.done}/{row.lessons.total}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {row.quizzes.passed}/{row.quizzes.total}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {row.average === null ? "—" : `${row.average}%`}
                      </td>
                      <td className="py-2 pr-3 font-mono tabular-nums">
                        {row.finalExam?.bestScore != null
                          ? `${row.finalExam.bestScore}%`
                          : row.finalExamOpen
                            ? "open"
                            : "locked"}
                      </td>
                      <td className="py-2">
                        <Badge tone={standing.tone}>{standing.label}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
