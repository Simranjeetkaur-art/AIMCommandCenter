import Link from "next/link";
import { Badge, Empty, Panel, Stat } from "@/components/ui";
import { LocalTime } from "@/components/local-time";

export interface Mark {
  id: string;
  code: string;
  title: string;
  kind: string;
  role: "MODULE_QUIZ" | "FINAL_EXAM" | "PRACTICE" | "OTHER";
  module: { title: string; position: number } | null;
  itemsPerAttempt: number;
  submissionStatus: string | null;
  passMark: number;
  maxAttempts: number;
  attemptsUsed: number;
  bestScore: number | null;
  passed: boolean | null;
  lastSatAt: string | null;
  counts: boolean;
}

export interface TrackGrades {
  version: {
    id: string;
    number: number;
    programme: { id: string; code: string; title: string; level: number };
  };
  lessons: { done: number; total: number };
  quizzes: { passed: number; total: number };
  average: number | null;
  finalExam: Mark | null;
  finalExamOpen: boolean;
  blocking: string[];
  credential: {
    id: string;
    serial: string;
    status: string;
    issuedAt: string;
    examScore: number | null;
  } | null;
  standing: string;
  marks: Mark[];
}

export const STANDING: Record<
  string,
  { label: string; tone: "green" | "amber" | "blue" | "red" | "neutral" }
> = {
  CERTIFIED: { label: "Certified", tone: "green" },
  AWAITING_CERTIFICATE: { label: "Passed — certificate pending", tone: "blue" },
  EXAM_OPEN: { label: "Final exam open", tone: "blue" },
  IN_PROGRESS: { label: "In progress", tone: "amber" },
  SUSPENDED: { label: "Certificate suspended", tone: "amber" },
  REVOKED: { label: "Certificate revoked", tone: "red" },
};

/** A score, or an honest blank. Never 0 for "has not sat it". */
export function Score({ mark }: { mark: Mark }) {
  if (mark.bestScore === null) {
    return <span className="text-ink-500">—</span>;
  }
  return (
    <span
      className={`font-mono tabular-nums ${
        mark.passed === true
          ? "text-signal-green"
          : mark.passed === false
            ? "text-signal-amber"
            : ""
      }`}
    >
      {mark.bestScore}%
    </span>
  );
}

function Result({ mark }: { mark: Mark }) {
  if (mark.submissionStatus && mark.bestScore === null) {
    return <Badge tone="blue">{mark.submissionStatus.toLowerCase()}</Badge>;
  }
  if (mark.passed === true) return <Badge tone="green">Passed</Badge>;
  if (mark.passed === false) return <Badge tone="amber">Not yet</Badge>;
  return <Badge>Not attempted</Badge>;
}

const SECTIONS: Array<{
  role: Mark["role"];
  title: string;
  hint: string;
}> = [
  {
    role: "MODULE_QUIZ",
    title: "Module quizzes",
    hint: "Every one of these must be passed at its pass mark before the final examination opens.",
  },
  {
    role: "FINAL_EXAM",
    title: "Final examination",
    hint: "Passing it issues the certificate, automatically and with a serial number.",
  },
  {
    role: "PRACTICE",
    title: "Simulator — practice",
    hint: "Practice for the graded papers. It is recorded, and it never counts towards the certificate.",
  },
  {
    role: "OTHER",
    title: "Examiner-marked — optional",
    hint: "Offered as part of the journey. These do not hold the certificate up.",
  },
];

/**
 * One track's marks, as a candidate reads them and as staff read them.
 *
 * Grouped by what each paper is *for* rather than listed flat, because the
 * single most important thing a gradebook has to say here is which marks
 * decide the certificate and which do not. A simulator run and a module quiz
 * are both a percentage; only one of them is a grade.
 */
export function TrackGradeCard({
  grades,
  /** Links to the paper. Absent on staff screens, where they are not sitting it. */
  learnerLinks = false,
  heading,
}: {
  grades: TrackGrades;
  learnerLinks?: boolean;
  heading?: React.ReactNode;
}) {
  const standing = STANDING[grades.standing] ?? STANDING.IN_PROGRESS;

  return (
    <Panel
      title={
        (heading as string) ??
        `${grades.version.programme.code} — ${grades.version.programme.title}`
      }
      hint={`Version ${grades.version.number}`}
      action={<Badge tone={standing.tone}>{standing.label}</Badge>}
    >
      <div className="grid gap-3 sm:grid-cols-4">
        <Stat
          label="Lessons"
          value={`${grades.lessons.done} / ${grades.lessons.total}`}
        />
        <Stat
          label="Module quizzes passed"
          value={`${grades.quizzes.passed} / ${grades.quizzes.total}`}
        />
        <Stat
          label="Average"
          value={grades.average === null ? "—" : `${grades.average}%`}
          note="graded papers only"
        />
        <Stat
          label="Final exam"
          value={
            grades.finalExam?.bestScore === null ||
            grades.finalExam === null
              ? grades.finalExamOpen
                ? "Open"
                : "Locked"
              : `${grades.finalExam.bestScore}%`
          }
        />
      </div>

      {!grades.finalExamOpen && grades.blocking.length > 0 ? (
        <p className="mt-3 rounded-lg border border-signal-amber/30 bg-signal-amber/5 px-3 py-2 text-xs text-ink-200">
          <span className="font-medium text-signal-amber">
            Final examination locked.
          </span>{" "}
          {grades.blocking.join(" ")}
        </p>
      ) : null}

      {grades.credential ? (
        <p className="mt-3 rounded-lg border border-signal-green/30 bg-signal-green/5 px-3 py-2 text-xs text-ink-200">
          Certificate{" "}
          <span className="font-mono text-signal-green">
            {grades.credential.serial}
          </span>{" "}
          &middot; issued <LocalTime value={grades.credential.issuedAt} />
          {grades.credential.examScore !== null
            ? ` · final exam ${grades.credential.examScore}%`
            : ""}
        </p>
      ) : null}

      <div className="mt-4 space-y-4">
        {SECTIONS.map((section) => {
          const rows = grades.marks.filter((m) => m.role === section.role);
          if (rows.length === 0) return null;
          return (
            <section key={section.role}>
              <p className="rule-label">{section.title}</p>
              <p className="mt-0.5 mb-1.5 text-[11px] text-ink-400">
                {section.hint}
              </p>
              <ul className="space-y-1">
                {rows.map((mark) => {
                  const body = (
                    <>
                      <span className="flex min-w-0 items-center gap-2.5">
                        <span className="font-mono text-xs text-brass-500">
                          {mark.code}
                        </span>
                        <span className="truncate">{mark.title}</span>
                      </span>
                      <span className="flex shrink-0 items-center gap-3">
                        <span className="font-mono text-[11px] text-ink-500 tabular-nums">
                          {mark.attemptsUsed}/{mark.maxAttempts} attempts &middot;
                          pass {mark.passMark}%
                        </span>
                        <Score mark={mark} />
                        <Result mark={mark} />
                      </span>
                    </>
                  );
                  return (
                    <li key={mark.id}>
                      {learnerLinks ? (
                        <Link
                          href={
                            mark.kind === "SIMULATION"
                              ? `/student/simulator/${mark.id}`
                              : `/student/assessments/${mark.id}`
                          }
                          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-sm transition hover:border-brass-500"
                        >
                          {body}
                        </Link>
                      ) : (
                        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-sm">
                          {body}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          );
        })}
      </div>
    </Panel>
  );
}

export function NoGrades({ href }: { href: string }) {
  return (
    <Empty>
      Nothing to report yet.{" "}
      <Link href={href} className="text-brass-500 hover:underline">
        Open the Academy
      </Link>{" "}
      to begin.
    </Empty>
  );
}
