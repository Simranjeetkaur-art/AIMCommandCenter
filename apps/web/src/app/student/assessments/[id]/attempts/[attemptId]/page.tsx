import Link from "next/link";
import { apiOrNotFound } from "@/lib/api";
import { Badge, Stat } from "@/components/ui";

type Option = { id?: string; text?: string } | string;

interface Review {
  attempt: {
    id: string;
    attemptNo: number;
    score: number | null;
    passed: boolean | null;
    submittedAt: string;
  };
  assessment: {
    id: string;
    code: string;
    title: string;
    passMark: number;
    programme: { code: string; title: string };
  };
  /** True once this learner has passed the paper: answers and explanations shown. */
  revealed: boolean;
  items: Array<{
    position: number;
    id: string;
    stem: string;
    options: Option[];
    given: string | string[] | null;
    correct: boolean;
    correctAnswer?: string | string[] | null;
    explanation?: string | null;
  }>;
}

const optionId = (option: Option, index: number) =>
  typeof option === "string" ? String(index) : (option.id ?? String(index));
const optionText = (option: Option) =>
  typeof option === "string" ? option : (option.text ?? "");
const asList = (v: string | string[] | null | undefined) =>
  v === null || v === undefined ? [] : Array.isArray(v) ? v : [v];

/**
 * One marked attempt, question by question.
 *
 * What was asked, in the order it was asked, what the learner chose, and
 * whether it was right. The right answer and why are shown only once the
 * paper is passed: before then, the key would be a crib for the next attempt.
 */
export default async function AttemptReviewPage({
  params,
}: {
  params: Promise<{ id: string; attemptId: string }>;
}) {
  const { id, attemptId } = await params;
  const review = await apiOrNotFound<Review>(
    `/assessments/attempts/${attemptId}/review`,
  );
  const right = review.items.filter((item) => item.correct).length;
  const unanswered = review.items.filter((item) => item.given === null).length;

  return (
    <div className="space-y-5">
      <Link
        href={`/student/assessments/${id}`}
        className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-brass-500"
      >
        <span aria-hidden>←</span> Back to the assessment
      </Link>

      <div>
        <p className="rule-label">
          {review.assessment.code} &middot; Attempt {review.attempt.attemptNo}
        </p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {review.assessment.title}
        </h1>
        <p className="mt-1 text-xs text-ink-400">
          Submitted {new Date(review.attempt.submittedAt).toLocaleString()}
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Score"
          value={review.attempt.score === null ? "—" : `${review.attempt.score}%`}
          note={`pass mark ${review.assessment.passMark}%`}
        />
        <Stat
          label="Right"
          value={`${right} / ${review.items.length}`}
          note={unanswered ? `${unanswered} left unanswered` : undefined}
        />
        <Stat
          label="Result"
          value={review.attempt.passed ? "Passed" : "Not passed"}
        />
      </div>

      <p
        role="note"
        className="rounded-lg border border-ink-800 px-4 py-3 text-xs leading-relaxed text-ink-300"
      >
        {review.revealed
          ? "You have passed this paper, so each question shows the correct answer and, where the syllabus gives one, why."
          : "Each question shows what you chose and whether it was right. The correct answers are shown once you pass this paper — until then they would give away the next attempt, whose questions and options come in a new order."}
      </p>

      <ol className="space-y-3">
        {review.items.map((item) => {
          const given = asList(item.given);
          const key = asList(item.correctAnswer);
          return (
            <li key={item.id} className="panel p-5">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm leading-relaxed">
                    <span className="mr-2 font-mono text-xs text-ink-400">
                      {String(item.position).padStart(2, "0")}
                    </span>
                    {item.stem}
                  </p>
                  <Badge
                    tone={
                      item.given === null ? "neutral" : item.correct ? "green" : "red"
                    }
                  >
                    {item.given === null
                      ? "Not answered"
                      : item.correct
                        ? "✓ Right"
                        : "✗ Wrong"}
                  </Badge>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {item.options.map((option, index) => {
                    const oid = optionId(option, index);
                    const chosen = given.includes(oid);
                    const isKey = review.revealed && key.includes(oid);
                    return (
                      <li
                        key={oid}
                        className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${
                          isKey
                            ? "border-signal-green/50 bg-signal-green/10"
                            : chosen && !item.correct
                              ? "border-signal-red/50 bg-signal-red/10"
                              : chosen
                                ? "border-signal-green/50 bg-signal-green/10"
                                : "border-ink-800"
                        }`}
                      >
                        <span className="w-24 shrink-0 font-mono text-[11px] uppercase text-ink-400">
                          {chosen ? "Your answer" : isKey ? "Correct" : ""}
                        </span>
                        <span className="flex-1">{optionText(option)}</span>
                        {isKey ? (
                          <span className="text-xs font-semibold text-signal-green">
                            ✓ correct
                          </span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
                {review.revealed && item.explanation ? (
                  <p className="mt-3 border-l-2 border-brass-500 pl-3 text-xs leading-relaxed text-ink-300">
                    {item.explanation}
                  </p>
                ) : null}
            </li>
          );
        })}
      </ol>

      <Link
        href={`/student/assessments/${id}`}
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to the assessment
      </Link>
    </div>
  );
}
