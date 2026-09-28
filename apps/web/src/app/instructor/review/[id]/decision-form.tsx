"use client";

import { useState } from "react";
import { MIN_REVIEW_COMMENT_LENGTH } from "@aim/contracts";

/**
 * The comment floor is shown here as a courtesy, and enforced in the DTO and
 * again in the service. Removing this counter would change nothing about what
 * the server accepts.
 */
export function DecisionForm({
  action,
  kind,
}: {
  action: (formData: FormData) => Promise<void>;
  kind: string;
}) {
  const [decision, setDecision] = useState<"approve" | "return" | "grade">(
    kind === "QUIZ" ? "approve" : "grade",
  );
  const [comment, setComment] = useState("");

  const short = comment.trim().length < MIN_REVIEW_COMMENT_LENGTH;

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="decision" value={decision} />

      <div className="flex flex-wrap gap-2">
        {(["approve", "return", "grade"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setDecision(option)}
            aria-pressed={decision === option}
            className={`rounded-lg border px-3 py-1.5 text-xs transition ${
              decision === option
                ? "border-brass-500 bg-brass-500/10 text-brass-500"
                : "border-ink-800 text-ink-200 hover:border-ink-400"
            }`}
          >
            {option === "approve"
              ? "Approve"
              : option === "return"
                ? "Return for revision"
                : "Grade"}
          </button>
        ))}
      </div>

      {decision !== "return" ? (
        <div>
          <label htmlFor="score" className="rule-label mb-1.5 block">
            Score {decision === "grade" ? "(required)" : "(optional)"}
          </label>
          <input
            id="score"
            name="score"
            type="number"
            min={0}
            max={100}
            required={decision === "grade"}
            className="w-28 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
          />
        </div>
      ) : null}

      <div>
        <label htmlFor="comment" className="rule-label mb-1.5 block">
          Written rationale
        </label>
        <textarea
          id="comment"
          name="comment"
          rows={6}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          placeholder={
            decision === "return"
              ? "Say what has to change, and why."
              : "Say what was demonstrated, and against which criteria."
          }
          className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-3 text-xs leading-relaxed outline-none focus:border-brass-500"
        />
        <p
          className={`mt-1 text-[11px] ${short ? "text-signal-amber" : "text-ink-400"}`}
        >
          {comment.trim().length} / {MIN_REVIEW_COMMENT_LENGTH} characters
          minimum
          {short ? " — the server will refuse a shorter rationale" : ""}
        </p>
      </div>

      <button
        type="submit"
        disabled={short}
        className="rounded-lg bg-brass-500 px-4 py-2 text-sm font-semibold text-ink-950 disabled:opacity-50"
      >
        Record decision
      </button>
    </form>
  );
}
