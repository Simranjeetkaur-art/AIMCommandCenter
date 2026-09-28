"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import { Gauge, ScoreBars } from "@/components/charts";
import { PERFORMANCE_ARC } from "@/components/performance";
import { buttonClass } from "@/components/ui";

const FIELD =
  "w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs outline-none focus:border-brass-500";

const SCORE_LABELS = [
  "1 — Not yet",
  "2 — Developing",
  "3 — Meets",
  "4 — Strong",
  "5 — Exemplary",
];

interface Dimension {
  key: string;
  name: string;
  description: string;
}

function Save() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("primary", "lg")}
    >
      {pending ? "Saving…" : "Save draft"}
    </button>
  );
}

/**
 * Scoring somebody, with the result shown as it is typed.
 *
 * The index is recomputed here only to show the reviewer where their scores
 * land. The number that is stored is computed on the server from the same
 * scores — a caller that could post its own index could post any number.
 */
export function ScoreForm({
  action,
  dimensions,
  cycle,
  initial,
}: {
  action: (formData: FormData) => void | Promise<void>;
  dimensions: Dimension[];
  cycle: string;
  initial: {
    scores: number[];
    strengths: string;
    concerns: string;
    actions: string;
  } | null;
}) {
  const [scores, setScores] = useState<number[]>(
    initial?.scores ?? dimensions.map(() => 3),
  );

  const total = scores.reduce((sum, s) => sum + s, 0);
  const index = Number(((100 * total) / (dimensions.length * 5)).toFixed(1));

  return (
    <form action={action} className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
        <div className="space-y-3">
          <label className="block max-w-40">
            <span className="rule-label mb-1.5 block">Cycle</span>
            <input name="cycle" defaultValue={cycle} className={FIELD} />
          </label>

          {dimensions.map((dimension, i) => (
            <div
              key={dimension.key}
              className="rounded-lg border border-ink-800 p-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-ink-100">
                    {dimension.name}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    {dimension.description}
                  </p>
                </div>
                <select
                  name={`score-${dimension.key}`}
                  value={scores[i]}
                  onChange={(event) =>
                    setScores((current) =>
                      current.map((s, j) =>
                        j === i ? Number(event.target.value) : s,
                      ),
                    )
                  }
                  className="shrink-0 rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                >
                  {SCORE_LABELS.map((label, value) => (
                    <option key={value} value={value + 1}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Where these scores land, updated as they are chosen. */}
        <div className="lg:sticky lg:top-6">
          <Gauge
            value={index}
            label="as scored"
            bands={PERFORMANCE_ARC}
            size={180}
          />
          <div className="mt-3 w-64">
            <ScoreBars
              scores={dimensions.map((dimension, i) => ({
                label: dimension.name,
                score: scores[i],
              }))}
              highlight={dimensions
                .filter((_, i) => scores[i] <= 2)
                .map((d) => d.name)}
            />
          </div>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="block">
          <span className="rule-label mb-1.5 block">
            Strengths{" "}
            <span className="text-ink-500">— required to release</span>
          </span>
          <textarea
            name="strengths"
            rows={4}
            defaultValue={initial?.strengths ?? ""}
            placeholder="What they do well, specifically."
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className="rule-label mb-1.5 block">
            To work on{" "}
            <span className="text-ink-500">— required to release</span>
          </span>
          <textarea
            name="concerns"
            rows={4}
            defaultValue={initial?.concerns ?? ""}
            placeholder="What is not yet there, and how you know."
            className={FIELD}
          />
        </label>
        <label className="block">
          <span className="rule-label mb-1.5 block">Next</span>
          <textarea
            name="actions"
            rows={4}
            defaultValue={initial?.actions ?? ""}
            placeholder="What they should do before the next cycle."
            className={FIELD}
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Save />
        <p className="text-xs text-ink-500">
          Saved as a draft. Nothing reaches them until you release it.
        </p>
      </div>
    </form>
  );
}
