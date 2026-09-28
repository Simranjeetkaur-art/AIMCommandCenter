"use client";

import { useMemo, useState } from "react";
import { buttonClass } from "@/components/ui";

interface Question {
  id: string;
  stem: string;
  points: number;
  tags: string[];
}

interface Bank {
  id: string;
  title: string;
  tags: string[];
  module: { id: string; title: string; position: number } | null;
  questions: Question[];
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

/**
 * Choosing the questions that make up a paper.
 *
 * A bank at a time, filtered by tag, with the chosen set listed in the order
 * they will be asked. The order matters and is not alphabetical, so the picked
 * list is separate from the pool rather than a set of ticks scattered through
 * it.
 */
export function PaperPicker({
  action,
  banks,
  chosen,
  readOnly,
}: {
  action: (formData: FormData) => void | Promise<void>;
  banks: Bank[];
  chosen: string[];
  readOnly: boolean;
}) {
  const [bankId, setBankId] = useState(banks[0]?.id ?? "");
  const [tag, setTag] = useState("");
  const [picked, setPicked] = useState<string[]>(chosen);

  const byId = useMemo(() => {
    const map = new Map<string, Question>();
    for (const bank of banks) for (const q of bank.questions) map.set(q.id, q);
    return map;
  }, [banks]);

  const bank = banks.find((b) => b.id === bankId) ?? banks[0];
  const tags = useMemo(
    () => [...new Set((bank?.questions ?? []).flatMap((q) => q.tags))].sort(),
    [bank],
  );

  const pool = (bank?.questions ?? []).filter((q) =>
    tag ? q.tags.includes(tag) : true,
  );
  const points = picked.reduce(
    (sum, id) => sum + (byId.get(id)?.points ?? 0),
    0,
  );

  const toggle = (id: string) =>
    setPicked((current) =>
      current.includes(id) ? current.filter((x) => x !== id) : [...current, id],
    );

  const move = (index: number, delta: number) =>
    setPicked((current) => {
      const next = [...current];
      const target = index + delta;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });

  return (
    <form action={action} className="space-y-4">
      {picked.map((id) => (
        <input key={id} type="hidden" name="questionIds" value={id} />
      ))}

      <div className="grid gap-4 lg:grid-cols-2">
        {/* The pool */}
        <div>
          <div className="mb-2 flex flex-wrap items-end gap-2">
            <div className="min-w-40 flex-1">
              <label className="rule-label mb-1 block">Bank</label>
              <select
                value={bankId}
                onChange={(event) => {
                  setBankId(event.target.value);
                  setTag("");
                }}
                className={`${FIELD} w-full`}
              >
                {banks.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title}
                    {b.module ? ` — module ${b.module.position}` : ""} (
                    {b.questions.length})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rule-label mb-1 block">Tag</label>
              <select
                value={tag}
                onChange={(event) => setTag(event.target.value)}
                className={FIELD}
              >
                <option value="">Any</option>
                {tags.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <ul className="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-ink-800 p-2">
            {pool.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-ink-500">
                No question here matches that tag.
              </li>
            ) : (
              pool.map((question) => {
                const on = picked.includes(question.id);
                return (
                  <li key={question.id}>
                    <button
                      type="button"
                      disabled={readOnly}
                      onClick={() => toggle(question.id)}
                      className={`flex w-full items-start gap-2 rounded-md border px-2 py-1.5 text-left text-[11px] transition ${
                        on
                          ? "border-brass-500/50 bg-brass-500/10"
                          : "border-transparent hover:border-ink-700"
                      } ${readOnly ? "cursor-not-allowed opacity-60" : ""}`}
                    >
                      <span className="mt-0.5 shrink-0 font-mono text-ink-500">
                        {on ? "✓" : "+"}
                      </span>
                      <span className="min-w-0">
                        <span className="block text-ink-200">
                          {question.stem}
                        </span>
                        {question.tags.length > 0 ? (
                          <span className="mt-0.5 block text-ink-500">
                            {question.tags.join(" · ")}
                          </span>
                        ) : null}
                      </span>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>

        {/* The paper, in order */}
        <div>
          <div className="mb-2 flex items-end justify-between gap-2">
            <p className="rule-label">
              On the paper &mdash; {picked.length} question
              {picked.length === 1 ? "" : "s"}, {points} points
            </p>
            {!readOnly && picked.length > 0 ? (
              <button
                type="button"
                onClick={() => setPicked([])}
                className="text-[11px] text-ink-500 hover:text-brass-500"
              >
                Clear
              </button>
            ) : null}
          </div>

          <ol className="max-h-96 space-y-1 overflow-y-auto rounded-lg border border-ink-800 p-2">
            {picked.length === 0 ? (
              <li className="px-2 py-4 text-center text-xs text-ink-500">
                Nothing chosen yet. Pick from the bank on the left.
              </li>
            ) : (
              picked.map((id, index) => {
                const question = byId.get(id);
                return (
                  <li
                    key={id}
                    className="flex items-start gap-2 rounded-md border border-ink-800 px-2 py-1.5 text-[11px]"
                  >
                    <span className="mt-0.5 shrink-0 font-mono text-ink-500">
                      {index + 1}.
                    </span>
                    <span className="min-w-0 flex-1 text-ink-200">
                      {question?.stem ??
                        "A question that is no longer in these banks"}
                    </span>
                    {!readOnly ? (
                      <span className="flex shrink-0 items-center gap-1">
                        {/* Icon-only, so each carries its own name: a glyph
                            is not a label to anyone using a screen reader. */}
                        <button
                          type="button"
                          onClick={() => move(index, -1)}
                          className={buttonClass("quiet", "icon")}
                          aria-label={`Move question ${index + 1} earlier`}
                          title="Earlier"
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          onClick={() => move(index, 1)}
                          className={buttonClass("quiet", "icon")}
                          aria-label={`Move question ${index + 1} later`}
                          title="Later"
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          onClick={() => toggle(id)}
                          className={buttonClass("danger", "icon")}
                          aria-label={`Take question ${index + 1} off the paper`}
                          title="Take off the paper"
                        >
                          ×
                        </button>
                      </span>
                    ) : null}
                  </li>
                );
              })
            )}
          </ol>
        </div>
      </div>

      {!readOnly ? (
        <button
          type="submit"
          disabled={picked.length === 0}
          className={buttonClass("secondary", "md")}
        >
          Save the paper
        </button>
      ) : (
        <p className="text-[11px] text-ink-500">
          This paper is fixed. Either the version is published or people have
          already sat it.
        </p>
      )}
    </form>
  );
}
