"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";

export interface PaperQuestion {
  position: number;
  question: {
    id: string;
    stem: string;
    type: string;
    options: Array<{ id: string; text: string }>;
    points: number;
  };
}

function Submit({ answered, total }: { answered: number; total: number }) {
  const { pending } = useFormStatus();
  const incomplete = answered < total;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="submit"
        disabled={pending || incomplete}
        className="rounded-lg bg-brass-500 px-5 py-2.5 text-sm font-semibold text-ink-950 disabled:opacity-50"
      >
        {pending ? "Submitting…" : "Submit for marking"}
      </button>
      <span
        className={`text-xs ${incomplete ? "text-signal-amber" : "text-ink-400"}`}
      >
        {answered} of {total} answered
        {incomplete ? " — answer every item before submitting" : ""}
      </span>
    </div>
  );
}

/**
 * Sits the paper.
 *
 * There is no marking here and nothing to mark against: the options arrive
 * without a key, so this component cannot tell a right answer from a wrong
 * one. It collects responses and posts them; the server scores them against
 * keys it never sent.
 *
 * `readOnly` is how an author previews the paper. It is the same component
 * rather than a second one that renders questions the authoring way, because
 * a preview drawn by a different implementation is a promise the candidate's
 * page is not obliged to keep. Nothing is submittable and nothing is
 * selectable -- what an author is checking is the wording and the order, and
 * a preview that let them tick an answer would imply an attempt they are not
 * making.
 */
export function AssessmentRunner({
  action,
  questions,
  readOnly = false,
}: {
  action?: (formData: FormData) => Promise<void>;
  questions: PaperQuestion[];
  readOnly?: boolean;
}) {
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const answered = Object.keys(answers).length;

  return (
    <form action={readOnly ? undefined : action} className="space-y-4">
      {questions.map((item, index) => (
        <fieldset key={item.question.id} className="panel p-5">
          <legend className="sr-only">Question {index + 1}</legend>
          <div className="flex gap-3">
            <span className="font-mono text-xs text-ink-400">
              {String(index + 1).padStart(2, "0")}
            </span>
            <p className="flex-1 whitespace-pre-line text-sm leading-relaxed">
              {item.question.stem}
            </p>
          </div>

          <div className="mt-4 space-y-1.5 pl-8">
            {item.question.options.map((option) => {
              const selected = answers[item.question.id] === option.id;
              return (
                <label
                  key={option.id}
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm transition ${
                    readOnly ? "" : "cursor-pointer"
                  } ${
                    selected
                      ? "border-brass-500 bg-brass-500/10"
                      : readOnly
                        ? "border-ink-800"
                        : "border-ink-800 hover:border-ink-400"
                  }`}
                >
                  <input
                    type="radio"
                    name={`q_${item.question.id}`}
                    value={option.id}
                    checked={selected}
                    disabled={readOnly}
                    onChange={() =>
                      setAnswers((prev) => ({
                        ...prev,
                        [item.question.id]: option.id,
                      }))
                    }
                    className="mt-0.5 accent-[var(--color-brass-500)]"
                  />
                  <span className="flex-1">{option.text}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}

      <div className="panel px-5 py-4">
        {readOnly ? (
          <p className="text-xs text-ink-400">
            Preview only — nothing here can be answered or submitted. This is
            the paper exactly as a candidate receives it, drawn from the same
            route their page calls: the answer key is not merely hidden from
            this screen, it is absent from what the server sent.
          </p>
        ) : (
          <Submit answered={answered} total={questions.length} />
        )}
      </div>
    </form>
  );
}
