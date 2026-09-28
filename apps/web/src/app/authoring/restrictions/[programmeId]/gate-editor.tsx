"use client";

import { useState } from "react";
import { Badge, Button, FIELD_SM } from "@/components/ui";

export type GateRequirement =
  "PREREQUISITE" | "LESSONS" | "ASSESSMENT" | "CREDENTIAL";

export interface GateStep {
  label: string;
  requirement: GateRequirement;
  assessmentCode?: string;
  /** Set by the server for a step still resting on its label. */
  inferred?: boolean;
}

export interface PaperChoice {
  code: string;
  title: string;
  kind: string;
}

const REQUIREMENT_LABEL: Record<GateRequirement, string> = {
  PREREQUISITE: "Holds the prerequisite track",
  LESSONS: "Every lesson completed",
  ASSESSMENT: "Passes a paper",
  CREDENTIAL: "Credential issued",
};

/**
 * The certification gate, as a mapping.
 *
 * This replaced a textarea of one label per line, where what each line
 * *meant* was recovered by matching words in it. That worked until a track
 * had two quizzes — "the first paper of this kind" is not a thing an author
 * ever chose — or until somebody renamed a step to something clearer and
 * silently unmapped it.
 *
 * The whole list posts as JSON in one hidden field, so the ladder form it
 * sits inside stays a single server action rather than becoming a row of
 * separate saves that could half-apply.
 */
export function GateEditor({
  name,
  initial,
  papers,
}: {
  name: string;
  initial: GateStep[];
  papers: PaperChoice[];
}) {
  const [steps, setSteps] = useState<GateStep[]>(initial);

  function update(index: number, patch: Partial<GateStep>) {
    setSteps((current) =>
      current.map((step, i) =>
        i === index
          ? // Editing a step is the author stating what it means, so it stops
            // being a guess the moment they touch it.
            { ...step, ...patch, inferred: false }
          : step,
      ),
    );
  }

  function move(index: number, by: number) {
    const target = index + by;
    if (target < 0 || target >= steps.length) return;
    setSteps((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  }

  return (
    <div className="space-y-2">
      <input type="hidden" name={name} value={JSON.stringify(steps)} />

      {steps.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-800 px-3 py-4 text-center text-[11px] text-ink-400">
          No gate. A candidate on this track has nothing to clear.
        </p>
      ) : null}

      {steps.map((step, index) => (
        <div
          key={index}
          className="rounded-lg border border-ink-800 p-2.5 space-y-2"
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] text-ink-500">
              {String(index + 1).padStart(2, "0")}
            </span>
            <input
              value={step.label}
              onChange={(e) => update(index, { label: e.target.value })}
              placeholder="What the candidate is told"
              className={`${FIELD_SM} flex-1`}
            />
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label="Move up"
              onClick={() => move(index, -1)}
              disabled={index === 0}
            >
              ↑
            </Button>
            <Button
              type="button"
              variant="quiet"
              size="icon"
              aria-label="Move down"
              onClick={() => move(index, 1)}
              disabled={index === steps.length - 1}
            >
              ↓
            </Button>
            <Button
              type="button"
              variant="danger"
              size="icon"
              aria-label="Remove this step"
              onClick={() =>
                setSteps((current) => current.filter((_, i) => i !== index))
              }
            >
              ×
            </Button>
          </div>

          <div className="flex flex-wrap items-center gap-2 pl-7">
            <select
              value={step.requirement}
              onChange={(e) =>
                update(index, {
                  requirement: e.target.value as GateRequirement,
                })
              }
              className={FIELD_SM}
            >
              {(Object.keys(REQUIREMENT_LABEL) as GateRequirement[]).map(
                (r) => (
                  <option key={r} value={r}>
                    {REQUIREMENT_LABEL[r]}
                  </option>
                ),
              )}
            </select>

            {step.requirement === "ASSESSMENT" ? (
              <select
                value={step.assessmentCode ?? ""}
                onChange={(e) =>
                  update(index, { assessmentCode: e.target.value })
                }
                className={FIELD_SM}
              >
                <option value="">Which paper…</option>
                {/* A legacy step keeps its kind placeholder as an option, so
                    opening the editor and saving does not silently repoint a
                    gate somebody has been assessed against. */}
                {step.assessmentCode?.startsWith("@kind:") ? (
                  <option value={step.assessmentCode}>
                    First {step.assessmentCode.slice(6)} paper (unmapped)
                  </option>
                ) : null}
                {papers.map((paper) => (
                  <option key={paper.code} value={paper.code}>
                    {paper.code} — {paper.title}
                  </option>
                ))}
              </select>
            ) : null}

            {step.inferred ? (
              <Badge tone="amber">Guessed from the label</Badge>
            ) : null}
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        size="sm"
        onClick={() =>
          setSteps((current) => [
            ...current,
            { label: "", requirement: "LESSONS" },
          ])
        }
      >
        Add a step
      </Button>
    </div>
  );
}
