"use client";

import { useState } from "react";
import { useFormStatus } from "react-dom";
import {
  LESSON_BLOCK_LABELS,
  type LessonBlock,
  type LessonBlockKind,
  type LessonContent,
  type LessonSection,
  type LessonTerm,
} from "@aim/contracts";
import { LessonView } from "@/components/lesson-view";
import { buttonClass } from "@/components/ui";

const FIELD =
  "w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs outline-none focus:border-brass-500 disabled:opacity-60";
const AREA = `${FIELD} leading-relaxed`;
const ADD =
  "rounded-lg border border-dashed border-ink-700 px-3 py-2 text-xs text-ink-300 transition hover:border-brass-500 hover:text-brass-500";

/** A real newline, written once so no template literal has to escape one. */
const NEWLINE = String.fromCharCode(10);

const emptySection = (n: number): LessonSection => ({
  number: String(n),
  heading: "",
  paragraphs: [""],
  blocks: [],
});

/** Moves item `index` by `delta`, or returns the list unchanged at either end. */
function shift<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= list.length) return list;
  const next = [...list];
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

/** The numbered step label on a form section, matching the preview's numbering. */
function Step({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="mb-4 flex items-start gap-2.5">
      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-brass-500 text-[11px] font-semibold text-ink-950">
        {n}
      </span>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {hint ? <p className="mt-0.5 text-xs text-ink-400">{hint}</p> : null}
      </div>
    </div>
  );
}

/** Up / down / remove, used on every repeated row in the form. */
function RowControls({
  onUp,
  onDown,
  onRemove,
  disabled,
  first,
  last,
  what,
}: {
  /** What these move, so each glyph carries a real name. */
  what: string;
  onUp: () => void;
  onDown: () => void;
  onRemove: () => void;
  disabled: boolean;
  first: boolean;
  last: boolean;
}) {
  return (
    <span className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={onUp}
        disabled={disabled || first}
        className={buttonClass("quiet", "icon")}
        aria-label={`Move ${what} up`}
        title="Move up"
      >
        ↑
      </button>
      <button
        type="button"
        onClick={onDown}
        disabled={disabled || last}
        className={buttonClass("quiet", "icon")}
        aria-label={`Move ${what} down`}
        title="Move down"
      >
        ↓
      </button>
      <button
        type="button"
        onClick={onRemove}
        disabled={disabled}
        className={buttonClass("danger", "icon")}
        aria-label={`Remove ${what}`}
        title="Remove"
      >
        ✕
      </button>
    </span>
  );
}

function Save({ dirty }: { dirty: boolean }) {
  const { pending } = useFormStatus();
  return (
    <div className="flex items-center gap-3">
      <button
        type="submit"
        disabled={pending}
        className={buttonClass("primary", "lg")}
      >
        {pending ? "Saving…" : "Save lesson"}
      </button>
      {dirty ? (
        <span className="text-xs text-signal-amber">Unsaved changes</span>
      ) : (
        <span className="text-xs text-ink-500">Saved</span>
      )}
    </div>
  );
}

/**
 * The lesson editor.
 *
 * Two columns: the form on the left, and on the right the same component a
 * candidate reads, fed from the state the form is editing. The preview is not
 * an approximation of the lesson -- it is the lesson, rendered by the same code
 * that will render it on the candidate's screen, so there is no second
 * implementation to drift.
 *
 * The whole lesson posts as one JSON field, so a save is atomic rather than a
 * sequence of partial writes that could leave a lesson half-changed.
 */
export function LessonEditor({
  action,
  initial,
  readOnly,
}: {
  action: (formData: FormData) => Promise<void>;
  initial: LessonContent;
  readOnly: boolean;
}) {
  const [content, setContent] = useState<LessonContent>({
    ...initial,
    sections: initial.sections?.length ? initial.sections : [emptySection(1)],
  });
  const [dirty, setDirty] = useState(false);

  const change = (next: Partial<LessonContent>) => {
    setContent((prev) => ({ ...prev, ...next }));
    setDirty(true);
  };

  const changeSection = (index: number, next: Partial<LessonSection>) => {
    setContent((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === index ? { ...s, ...next } : s,
      ),
    }));
    setDirty(true);
  };

  const changeBlock = (si: number, bi: number, next: Partial<LessonBlock>) => {
    setContent((prev) => ({
      ...prev,
      sections: prev.sections.map((s, i) =>
        i === si
          ? {
              ...s,
              blocks: (s.blocks ?? []).map((b, j) =>
                j === bi ? { ...b, ...next } : b,
              ),
            }
          : s,
      ),
    }));
    setDirty(true);
  };

  /** Renumbers after a move or a removal, so 1, 2, 3 stays 1, 2, 3. */
  const setSections = (sections: LessonSection[]) => {
    change({
      sections: sections.map((s, i) => ({
        ...s,
        number: s.number === undefined ? undefined : String(i + 1),
      })),
    });
  };

  const objectives = content.objectives ?? [];
  const setObjectives = (next: string[]) => change({ objectives: next });

  const blocksOf = (si: number) => content.sections[si].blocks ?? [];
  const setBlocks = (si: number, blocks: LessonBlock[]) =>
    changeSection(si, { blocks });

  const newBlock = (kind: LessonBlockKind): LessonBlock => {
    if (kind === "LIST") return { kind, items: [""] };
    if (kind === "TERMS")
      return {
        kind,
        title: "KEY TERMS",
        terms: [{ term: "", definition: "" }],
      };
    if (kind === "LINK" || kind === "REFERENCE")
      return {
        kind,
        title: LESSON_BLOCK_LABELS[kind].toUpperCase(),
        label: "",
        url: "",
      };
    return { kind, title: LESSON_BLOCK_LABELS[kind].toUpperCase(), body: "" };
  };

  return (
    <form action={action} onSubmit={() => setDirty(false)}>
      <input type="hidden" name="content" value={JSON.stringify(content)} />

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <Save dirty={dirty} />
        <p className="text-xs text-ink-500">
          The panel on the right is this lesson, drawn by the same component the
          candidate&rsquo;s page uses.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* ------------------------------------------------ the form ---- */}
        <div className="space-y-4">
          <section className="panel p-5">
            <Step
              n={1}
              title="Header"
              hint="What a candidate sees before they start reading."
            />

            <div className="space-y-3">
              <label className="block">
                <span className="rule-label mb-1.5 block">
                  Eyebrow <span className="text-ink-500">— optional</span>
                </span>
                <input
                  disabled={readOnly}
                  value={content.eyebrow ?? ""}
                  onChange={(e) => change({ eyebrow: e.target.value })}
                  placeholder="MODULE 1 · AIM™"
                  className={FIELD}
                />
              </label>

              <label className="block">
                <span className="rule-label mb-1.5 block">Module title *</span>
                <input
                  required
                  disabled={readOnly}
                  value={content.heading ?? ""}
                  onChange={(e) => change({ heading: e.target.value })}
                  className={FIELD}
                />
              </label>

              <label className="block">
                <span className="rule-label mb-1.5 block">
                  Short description *
                </span>
                <textarea
                  required
                  disabled={readOnly}
                  rows={4}
                  value={content.lead ?? ""}
                  onChange={(e) => change({ lead: e.target.value })}
                  className={AREA}
                />
              </label>

              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  <span className="rule-label mb-1.5 block">Reading time</span>
                  <input
                    disabled={readOnly}
                    value={content.readingTime ?? ""}
                    onChange={(e) => change({ readingTime: e.target.value })}
                    placeholder="20–25 min"
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="rule-label mb-1.5 block">
                    Assessment questions
                  </span>
                  <input
                    disabled={readOnly}
                    value={content.questionCount ?? ""}
                    onChange={(e) => change({ questionCount: e.target.value })}
                    placeholder="10 questions"
                    className={FIELD}
                  />
                </label>
                <label className="block">
                  <span className="rule-label mb-1.5 block">Pass mark</span>
                  <input
                    disabled={readOnly}
                    value={content.passMark ?? ""}
                    onChange={(e) => change({ passMark: e.target.value })}
                    placeholder="80% (8/10)"
                    className={FIELD}
                  />
                </label>
              </div>

              <details>
                <summary className="cursor-pointer text-[11px] text-ink-500">
                  Learning path and extra chips
                </summary>
                <div className="mt-2 grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="rule-label mb-1.5 block">
                      Learning path (one step per line)
                    </span>
                    <textarea
                      disabled={readOnly}
                      rows={4}
                      value={(content.path ?? []).join(NEWLINE)}
                      onChange={(e) =>
                        change({
                          path: e.target.value
                            .split(NEWLINE)
                            .map((v) => v.trim())
                            .filter(Boolean),
                        })
                      }
                      placeholder={`LEARN${NEWLINE}ASSESSMENT${NEWLINE}EARN BADGE`}
                      className={AREA}
                    />
                  </label>
                  <label className="block">
                    <span className="rule-label mb-1.5 block">
                      Further chips (one per line)
                    </span>
                    <textarea
                      disabled={readOnly}
                      rows={4}
                      value={(content.stats ?? []).join(NEWLINE)}
                      onChange={(e) =>
                        change({
                          stats: e.target.value
                            .split(NEWLINE)
                            .map((v) => v.trim())
                            .filter(Boolean),
                        })
                      }
                      className={AREA}
                    />
                  </label>
                </div>
              </details>
            </div>
          </section>

          <section className="panel p-5">
            <Step
              n={2}
              title="Learning objectives"
              hint="Each objective is its own item, in the order they are read."
            />

            <label className="mb-3 block">
              <span className="rule-label mb-1.5 block">
                Overview <span className="text-ink-500">— optional</span>
              </span>
              <textarea
                disabled={readOnly}
                rows={3}
                value={content.overview ?? ""}
                onChange={(e) => change({ overview: e.target.value })}
                className={AREA}
              />
            </label>

            <label className="mb-3 block">
              <span className="rule-label mb-1.5 block">Objectives intro</span>
              <input
                disabled={readOnly}
                value={content.objectivesIntro ?? ""}
                onChange={(e) => change({ objectivesIntro: e.target.value })}
                placeholder="After this module you should be able to:"
                className={FIELD}
              />
            </label>

            <ul className="space-y-2">
              {objectives.map((objective, i) => (
                <li key={i} className="flex items-center gap-2">
                  <input
                    disabled={readOnly}
                    value={objective}
                    onChange={(e) =>
                      setObjectives(
                        objectives.map((o, j) =>
                          j === i ? e.target.value : o,
                        ),
                      )
                    }
                    className={FIELD}
                  />
                  <RowControls
                    what="this objective"
                    disabled={readOnly}
                    first={i === 0}
                    last={i === objectives.length - 1}
                    onUp={() => setObjectives(shift(objectives, i, -1))}
                    onDown={() => setObjectives(shift(objectives, i, 1))}
                    onRemove={() =>
                      setObjectives(objectives.filter((_, j) => j !== i))
                    }
                  />
                </li>
              ))}
            </ul>

            {!readOnly ? (
              <button
                type="button"
                onClick={() => setObjectives([...objectives, ""])}
                className={`${ADD} mt-3`}
              >
                + Add learning objective
              </button>
            ) : null}
          </section>

          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">
                <span className="mr-2 inline-flex h-5 w-5 items-center justify-center rounded-full bg-brass-500 text-[11px] font-semibold text-ink-950">
                  3
                </span>
                Content sections
              </h2>
              <span className="text-xs text-ink-500">
                {content.sections.length} section
                {content.sections.length === 1 ? "" : "s"}
              </span>
            </div>

            {content.sections.map((section, si) => (
              <div key={si} className="panel p-5">
                <div className="mb-3 flex items-start gap-2">
                  <label className="block w-14 shrink-0">
                    <span className="rule-label mb-1.5 block">No.</span>
                    <input
                      disabled={readOnly}
                      value={section.number ?? ""}
                      onChange={(e) =>
                        changeSection(si, { number: e.target.value })
                      }
                      className={FIELD}
                    />
                  </label>
                  <label className="block flex-1">
                    <span className="rule-label mb-1.5 block">Title</span>
                    <input
                      disabled={readOnly}
                      value={section.heading}
                      onChange={(e) =>
                        changeSection(si, { heading: e.target.value })
                      }
                      className={FIELD}
                    />
                  </label>
                  <span className="pt-6">
                    <RowControls
                      what="this section"
                      disabled={readOnly}
                      first={si === 0}
                      last={si === content.sections.length - 1}
                      onUp={() => setSections(shift(content.sections, si, -1))}
                      onDown={() => setSections(shift(content.sections, si, 1))}
                      onRemove={() =>
                        setSections(content.sections.filter((_, j) => j !== si))
                      }
                    />
                  </span>
                </div>

                <label className="block">
                  <span className="rule-label mb-1.5 block">
                    Body (one paragraph per blank line)
                  </span>
                  <textarea
                    disabled={readOnly}
                    rows={6}
                    value={(section.paragraphs ?? []).join(NEWLINE + NEWLINE)}
                    onChange={(e) =>
                      changeSection(si, {
                        paragraphs: e.target.value
                          .split(NEWLINE + NEWLINE)
                          .map((p) => p.trim())
                          .filter(Boolean),
                      })
                    }
                    className={AREA}
                  />
                </label>

                <div className="mt-3 space-y-2">
                  {blocksOf(si).map((block, bi) => (
                    <div
                      key={bi}
                      className="rounded-lg border border-ink-800 border-l-2 border-l-brass-500 p-3"
                    >
                      <div className="flex flex-wrap items-end gap-2">
                        <label className="block">
                          <span className="rule-label mb-1.5 block">
                            Callout
                          </span>
                          <select
                            disabled={readOnly}
                            value={block.kind}
                            onChange={(e) =>
                              changeBlock(si, bi, {
                                kind: e.target.value as LessonBlockKind,
                              })
                            }
                            className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
                          >
                            {(
                              Object.keys(
                                LESSON_BLOCK_LABELS,
                              ) as LessonBlockKind[]
                            ).map((kind) => (
                              <option key={kind} value={kind}>
                                {LESSON_BLOCK_LABELS[kind]}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="block min-w-40 flex-1">
                          <span className="rule-label mb-1.5 block">
                            Label (optional)
                          </span>
                          <input
                            disabled={readOnly}
                            value={block.title ?? ""}
                            onChange={(e) =>
                              changeBlock(si, bi, { title: e.target.value })
                            }
                            placeholder="KEY INSIGHT"
                            className={FIELD}
                          />
                        </label>
                        <span className="pb-1">
                          <RowControls
                            what="this callout"
                            disabled={readOnly}
                            first={bi === 0}
                            last={bi === blocksOf(si).length - 1}
                            onUp={() =>
                              setBlocks(si, shift(blocksOf(si), bi, -1))
                            }
                            onDown={() =>
                              setBlocks(si, shift(blocksOf(si), bi, 1))
                            }
                            onRemove={() =>
                              setBlocks(
                                si,
                                blocksOf(si).filter((_, j) => j !== bi),
                              )
                            }
                          />
                        </span>
                      </div>

                      {block.kind === "LIST" ? (
                        <label className="mt-2 block">
                          <span className="rule-label mb-1.5 block">
                            Items (one per line)
                          </span>
                          <textarea
                            disabled={readOnly}
                            rows={4}
                            value={(block.items ?? []).join(NEWLINE)}
                            onChange={(e) =>
                              changeBlock(si, bi, {
                                items: e.target.value
                                  .split(NEWLINE)
                                  .map((v) => v.trim())
                                  .filter(Boolean),
                              })
                            }
                            className={AREA}
                          />
                        </label>
                      ) : block.kind === "TERMS" ? (
                        <TermRows
                          terms={block.terms ?? []}
                          readOnly={readOnly}
                          onChange={(terms) => changeBlock(si, bi, { terms })}
                        />
                      ) : block.kind === "LINK" ||
                        block.kind === "REFERENCE" ? (
                        <div className="mt-2 space-y-2">
                          <label className="block">
                            <span className="rule-label mb-1.5 block">
                              {block.kind === "LINK" ? "Link text" : "Source"}
                            </span>
                            <input
                              disabled={readOnly}
                              value={block.label ?? ""}
                              onChange={(e) =>
                                changeBlock(si, bi, { label: e.target.value })
                              }
                              placeholder={
                                block.kind === "LINK"
                                  ? "Read the full standard"
                                  : "The Last Command"
                              }
                              className={FIELD}
                            />
                          </label>
                          <label className="block">
                            <span className="rule-label mb-1.5 block">
                              Address{" "}
                              <span className="text-ink-500">— optional</span>
                            </span>
                            <input
                              disabled={readOnly}
                              value={block.url ?? ""}
                              onChange={(e) =>
                                changeBlock(si, bi, { url: e.target.value })
                              }
                              placeholder="https://"
                              className={FIELD}
                            />
                          </label>
                          <label className="block">
                            <span className="rule-label mb-1.5 block">
                              Note
                            </span>
                            <textarea
                              disabled={readOnly}
                              rows={2}
                              value={block.body ?? ""}
                              onChange={(e) =>
                                changeBlock(si, bi, { body: e.target.value })
                              }
                              className={AREA}
                            />
                          </label>
                        </div>
                      ) : (
                        <label className="mt-2 block">
                          <span className="rule-label mb-1.5 block">Text</span>
                          <textarea
                            disabled={readOnly}
                            rows={3}
                            value={block.body ?? ""}
                            onChange={(e) =>
                              changeBlock(si, bi, { body: e.target.value })
                            }
                            className={AREA}
                          />
                        </label>
                      )}
                    </div>
                  ))}
                </div>

                {!readOnly ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {(
                      Object.keys(LESSON_BLOCK_LABELS) as LessonBlockKind[]
                    ).map((kind) => (
                      <button
                        key={kind}
                        type="button"
                        onClick={() =>
                          setBlocks(si, [...blocksOf(si), newBlock(kind)])
                        }
                        className="rounded-md border border-ink-800 px-2 py-1 text-[11px] text-ink-400 transition hover:border-brass-500 hover:text-brass-500"
                      >
                        + {LESSON_BLOCK_LABELS[kind]}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}

            {!readOnly ? (
              <button
                type="button"
                onClick={() =>
                  setSections([
                    ...content.sections,
                    emptySection(content.sections.length + 1),
                  ])
                }
                className={`${ADD} w-full`}
              >
                + Add another section
              </button>
            ) : null}
          </section>
        </div>

        {/* --------------------------------------------- the preview ---- */}
        <div>
          <div className="xl:sticky xl:top-6">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-sm font-semibold">Preview</h2>
              <span className="text-[11px] text-ink-500">
                as a candidate reads it
              </span>
            </div>
            <div className="max-h-[calc(100vh-9rem)] overflow-y-auto rounded-xl border border-ink-800 bg-ink-950/40 p-5">
              <LessonView content={content} />
            </div>
          </div>
        </div>
      </div>
    </form>
  );
}

/**
 * Key terms, as a row each.
 *
 * Previously one textarea of "term — definition" lines, which asked an author
 * to remember a separator and made an em dash inside a definition ambiguous.
 */
function TermRows({
  terms,
  readOnly,
  onChange,
}: {
  terms: LessonTerm[];
  readOnly: boolean;
  onChange: (terms: LessonTerm[]) => void;
}) {
  return (
    <div className="mt-2">
      <span className="rule-label mb-1.5 block">Terms</span>
      <ul className="space-y-2">
        {terms.map((term, i) => (
          <li key={i} className="flex items-center gap-2">
            <input
              disabled={readOnly}
              value={term.term}
              onChange={(e) =>
                onChange(
                  terms.map((t, j) =>
                    j === i ? { ...t, term: e.target.value } : t,
                  ),
                )
              }
              placeholder="Capability"
              className={`${FIELD} w-32 shrink-0`}
            />
            <input
              disabled={readOnly}
              value={term.definition}
              onChange={(e) =>
                onChange(
                  terms.map((t, j) =>
                    j === i ? { ...t, definition: e.target.value } : t,
                  ),
                )
              }
              placeholder="The ability of a system to perform a task."
              className={FIELD}
            />
            <RowControls
              what="this term"
              disabled={readOnly}
              first={i === 0}
              last={i === terms.length - 1}
              onUp={() => onChange(shift(terms, i, -1))}
              onDown={() => onChange(shift(terms, i, 1))}
              onRemove={() => onChange(terms.filter((_, j) => j !== i))}
            />
          </li>
        ))}
      </ul>
      {!readOnly ? (
        <button
          type="button"
          onClick={() => onChange([...terms, { term: "", definition: "" }])}
          className={`${ADD} mt-2`}
        >
          + Add term
        </button>
      ) : null}
    </div>
  );
}
