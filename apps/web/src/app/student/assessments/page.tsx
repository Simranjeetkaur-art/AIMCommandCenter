import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, Panel } from "@/components/ui";

interface AssessmentRow {
  id: string;
  code: string;
  title: string;
  kind: string;
  passMark: number;
  requiresReview: boolean;
  maxAttempts: number;
  /** Including any extra attempts granted on request. */
  attemptsAllowed?: number;
  finalExam: boolean;
  moduleId: string | null;
  locked: boolean;
  lockedBecause: string[];
  attempts: Array<{
    id: string;
    attemptNo: number;
    score: number | null;
    passed: boolean | null;
    submittedAt: string | null;
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

export default async function AssessmentsPage() {
  const assessments = await api<AssessmentRow[]>("/assessments/mine");

  if (assessments.length === 0) {
    return <Empty>No assessments are open to you yet.</Empty>;
  }

  const isModuleQuiz = (a: AssessmentRow) =>
    Boolean(a.moduleId) || a.code.endsWith("-ASSESS");
  const modules = assessments.filter(isModuleQuiz);
  const milestones = assessments.filter((a) => !isModuleQuiz(a));

  const row = (assessment: AssessmentRow) => {
    const best = assessment.attempts.reduce<number | null>(
      (acc, a) =>
        a.score !== null && (acc === null || a.score > acc) ? a.score : acc,
      null,
    );
    const passed = assessment.attempts.some((a) => a.passed === true);

    // A simulation is flown, not sat. It has its own runner, and sending it
    // to the paper screen would put a hundred scenarios on one page.
    const href =
      assessment.kind === "SIMULATION"
        ? `/student/simulator/${assessment.id}`
        : `/student/assessments/${assessment.id}`;

    return (
      <li key={assessment.id}>
        <Link
          href={href}
          className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-3 transition hover:border-brass-500"
        >
          <div>
            <div className="flex items-center gap-2.5">
              <span className="font-mono text-xs text-brass-500">
                {assessment.code}
              </span>
              <span className="text-sm font-medium">{assessment.title}</span>
              <Badge tone={KIND_TONE[assessment.kind] ?? "neutral"}>
                {assessment.kind}
              </Badge>
              {assessment.requiresReview ? (
                <Badge tone="blue">Examined</Badge>
              ) : null}
              {assessment.finalExam ? (
                <Badge tone={assessment.locked ? "amber" : "green"}>
                  {assessment.locked ? "Final exam · locked" : "Final exam · open"}
                </Badge>
              ) : null}
            </div>
            {assessment.locked ? (
              <p className="mt-0.5 text-xs text-signal-amber">
                {assessment.lockedBecause.join(" ")}
              </p>
            ) : null}
            <p className="mt-0.5 text-xs text-ink-400">
              Pass {assessment.passMark}% &middot;{" "}
              {Math.max(
                0,
                (assessment.attemptsAllowed ?? assessment.maxAttempts) -
                  assessment.attempts.length,
              )}{" "}
              of {assessment.attemptsAllowed ?? assessment.maxAttempts} attempts
              remaining
            </p>
          </div>

          <div className="text-right">
            {best !== null ? (
              <>
                <p className="font-mono text-lg tabular-nums">{best}%</p>
                <Badge tone={passed ? "green" : "amber"}>
                  {passed ? "Passed" : "Not yet"}
                </Badge>
              </>
            ) : (
              <Badge>Not attempted</Badge>
            )}
          </div>
        </Link>
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <Panel
        title="Module assessments"
        hint="Marked by the server against keys this page never receives."
      >
        <ul className="space-y-2">{modules.map(row)}</ul>
      </Panel>

      <Panel
        title="Qualification milestones"
        hint="Simulator, examination, practical and defence. Written work goes to an examiner."
      >
        <ul className="space-y-2">{milestones.map(row)}</ul>
      </Panel>
    </div>
  );
}
