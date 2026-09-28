import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, getSession, apiOrNotFound } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { act } from "@/lib/act";
import { SubmitButton } from "@/components/submit-button";
import {
  MAX_BULK_QUESTIONS,
  parseQuestionBlock,
} from "@/lib/parse-questions";

interface QuestionRow {
  id: string;
  stem: string;
  type: string;
  options: Array<{ id?: string; text?: string } | string>;
  answerKey?: {
    correct?: number | string | Array<number | string>;
    [key: string]: unknown;
  };
  explanation: string | null;
  points: number;
  tags: string[];
  pool: "QUIZ" | "SIMULATOR";
  _count: { assessments: number };
}

interface BankDetail {
  id: string;
  title: string;
  description: string;
  tags: string[];
  programme: { id: string; code: string; title: string } | null;
  module: { id: string; title: string; position: number } | null;
  owner: { name: string };
  questions: QuestionRow[];
  tagsInUse: string[];
}

interface Programme {
  id: string;
  code: string;
  title: string;
  versions: Array<{ id: string; version: number; status: string }>;
}

/** Shown in the paste box, so the format is read rather than explained. */
const EXAMPLE_BLOCK = `Which control bounds an agent's authority?
*An envelope
A system prompt
A rate limit

Who approves a privilege escalation?
The agent itself
*A named human owner
The adapter`;

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

/** Choice text, whichever shape the option happens to be stored in. */
function optionText(option: QuestionRow["options"][number]): string {
  if (typeof option === "string") return option;
  return option.text ?? "";
}

/**
 * Which choices the key marks correct, by position.
 *
 * Keys name option ids ("2", or "b" on older authored questions); a few older
 * rows hold a bare index instead. Both are read, so every stored key shows.
 */
function correctIndexes(question: QuestionRow): number[] {
  const raw = question.answerKey?.correct;
  if (raw === undefined) return [];
  const values = Array.isArray(raw) ? raw : [raw];
  const ids = values.filter((v) => typeof v === "string").map(String);
  const positions = values.filter((v): v is number => typeof v === "number");
  return question.options.flatMap((option, index) => {
    const id =
      typeof option === "string" ? String(index) : (option.id ?? String(index));
    return ids.includes(String(id)) || positions.includes(index) ? [index] : [];
  });
}

export default async function BankDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pool?: string; refused?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const poolFilter =
    sp.pool === "QUIZ" || sp.pool === "SIMULATOR" ? sp.pool : null;
  const session = await getSession();
  const canWrite = session.permissions.includes(P.QUESTION_WRITE);
  const canDelete = session.permissions.includes(P.CONTENT_DELETE);
  const canSeeKeys = session.permissions.includes(P.ANSWER_KEY_READ);

  const bank = await apiOrNotFound<BankDetail>(`/academy/banks/${id}`);
  const programmes = await api<Programme[]>("/academy/programmes");

  const version =
    programmes
      .find((p) => p.id === bank.programme?.id)
      ?.versions.find((v) => v.status === "DRAFT") ??
    programmes
      .find((p) => p.id === bank.programme?.id)
      ?.versions.find((v) => v.status === "PUBLISHED") ??
    null;

  const modules = version
    ? (
        await api<{
          modules: Array<{ id: string; title: string; position: number }>;
        }>(`/academy/versions/${version.id}/authoring`)
      ).modules
    : [];

  const here = `/authoring/banks/${id}`;

  async function saveBank(formData: FormData) {
    "use server";
    await act(`/academy/banks/${id}`, {
      method: "PATCH",
      body: {
        title: String(formData.get("title") ?? ""),
        description: String(formData.get("description") ?? ""),
        programmeId: String(formData.get("programmeId") ?? ""),
        moduleId: String(formData.get("moduleId") ?? ""),
        tags: String(formData.get("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
    });
    revalidatePath(here);
  }

  async function addQuestion(formData: FormData) {
    "use server";
    const choices = [0, 1, 2, 3]
      .map((i) => String(formData.get(`choice${i}`) ?? "").trim())
      .filter(Boolean);
    const correct = Number(formData.get("correctIndex") ?? 0);

    await act("/academy/questions", {
      method: "POST",
      body: {
        bankId: id,
        stem: String(formData.get("stem") ?? ""),
        type: "SINGLE_CHOICE",
        // Option ids are the choice positions as strings, and the key names
        // the correct option's id: the shape marking compares against.
        options: choices.map((text, index) => ({ id: String(index), text })),
        answerKey: { correct: String(correct) },
        points: Number(formData.get("points") ?? 1),
        pool: formData.get("pool") === "SIMULATOR" ? "SIMULATOR" : "QUIZ",
        tags: String(formData.get("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
    });
    revalidatePath(here);
  }

  /**
   * A pasted block of questions, read here and written in one call.
   *
   * The parse happens on this side because the format is this screen's:
   * the API takes questions, not somebody's text file. A fault refuses the
   * whole paste and says which question is wrong, so re-pasting a corrected
   * block cannot half-duplicate the batch.
   */
  async function addManyQuestions(formData: FormData) {
    "use server";
    const parsed = parseQuestionBlock(String(formData.get("block") ?? ""));
    if (parsed.errors.length > 0) {
      const message = `Nothing was added. ${parsed.errors.join("; ")}.`;
      redirect(`${here}?refused=${encodeURIComponent(message)}`);
    }

    await act("/academy/questions/bulk", {
      method: "POST",
      body: {
        bankId: id,
        questions: parsed.questions,
        points: Number(formData.get("points") ?? 1),
        pool: formData.get("pool") === "SIMULATOR" ? "SIMULATOR" : "QUIZ",
        tags: String(formData.get("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
    });
    revalidatePath(here);
  }

  async function retagQuestion(formData: FormData) {
    "use server";
    await act(`/academy/questions/${String(formData.get("questionId"))}`, {
      method: "PATCH",
      body: {
        stem: String(formData.get("stem") ?? ""),
        points: Number(formData.get("points") ?? 1),
        explanation: String(formData.get("explanation") ?? ""),
        tags: String(formData.get("tags") ?? "")
          .split(",")
          .map((t) => t.trim())
          .filter(Boolean),
      },
    });
    revalidatePath(here);
  }

  async function movePool(formData: FormData) {
    "use server";
    try {
      await api(`/academy/questions/${String(formData.get("questionId"))}`, {
        method: "PATCH",
        body: { pool: String(formData.get("pool")) },
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "That did not work.";
      redirect(`${here}?refused=${encodeURIComponent(message)}`);
    }
    revalidatePath(here);
  }

  async function removeQuestion(formData: FormData) {
    "use server";
    await act(`/academy/questions/${String(formData.get("questionId"))}`, {
      method: "DELETE",
    });
    revalidatePath(here);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            Question bank
            {bank.programme ? ` · ${bank.programme.code}` : " · shared"}
            {bank.module ? ` · module ${bank.module.position}` : ""}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {bank.title}
          </h1>
          {bank.description ? (
            <p className="mt-1 max-w-2xl text-xs text-ink-400">
              {bank.description}
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge>{bank.questions.length} questions</Badge>
          <Link
            href="/authoring/banks"
            className={buttonClass("secondary", "md")}
          >
            All banks
          </Link>
        </div>
      </div>

      {canWrite ? (
        <Panel
          title="Where this bank belongs"
          hint="Track and module decide where it is offered."
        >
          <form action={saveBank} className="flex flex-wrap items-end gap-3">
            <div className="min-w-48 flex-1">
              <label className="rule-label mb-1 block">Title</label>
              <input
                name="title"
                defaultValue={bank.title}
                required
                minLength={3}
                className={`${FIELD} w-full`}
              />
            </div>
            <div>
              <label className="rule-label mb-1 block">Track</label>
              <select
                name="programmeId"
                defaultValue={bank.programme?.id ?? ""}
                className={FIELD}
              >
                <option value="">Shared</option>
                {programmes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="rule-label mb-1 block">Module</label>
              <select
                name="moduleId"
                defaultValue={bank.module?.id ?? ""}
                className={FIELD}
              >
                <option value="">Whole track</option>
                {modules.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.position}. {m.title}
                  </option>
                ))}
              </select>
            </div>
            <div className="min-w-40 flex-1">
              <label className="rule-label mb-1 block">Tags</label>
              <input
                name="tags"
                defaultValue={bank.tags.join(", ")}
                className={`${FIELD} w-full`}
              />
            </div>
            <div className="min-w-56 flex-1">
              <label className="rule-label mb-1 block">Description</label>
              <input
                name="description"
                defaultValue={bank.description}
                className={`${FIELD} w-full`}
              />
            </div>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Save
            </button>
          </form>
        </Panel>
      ) : null}

      {canWrite ? (
        <Panel
          title="Add a question"
          hint="Four choices, one correct. The key is stored server-side and never reaches a candidate's browser."
        >
          <form action={addQuestion} className="space-y-3">
            <div>
              <label className="rule-label mb-1 block">Question</label>
              <textarea
                name="stem"
                required
                minLength={10}
                rows={3}
                className={`${FIELD} w-full`}
              />
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              {[0, 1, 2, 3].map((i) => (
                <div key={i}>
                  <label className="rule-label mb-1 block">
                    Choice {i + 1}
                  </label>
                  <input
                    name={`choice${i}`}
                    required={i < 2}
                    className={`${FIELD} w-full`}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="rule-label mb-1 block">Correct</label>
                <select name="correctIndex" className={FIELD}>
                  {[0, 1, 2, 3].map((i) => (
                    <option key={i} value={i}>
                      Choice {i + 1}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rule-label mb-1 block">Points</label>
                <input
                  name="points"
                  type="number"
                  min={1}
                  defaultValue={1}
                  className={`${FIELD} w-20`}
                />
              </div>
              <div className="min-w-48 flex-1">
                <label className="rule-label mb-1 block">
                  Tags{" "}
                  <span className="text-ink-500">&mdash; comma separated</span>
                </label>
                <input
                  name="tags"
                  placeholder={
                    bank.tagsInUse.slice(0, 3).join(", ") ||
                    "authority, escalation"
                  }
                  className={`${FIELD} w-full`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Pool</label>
                <select
                  name="pool"
                  defaultValue={poolFilter ?? "QUIZ"}
                  className={FIELD}
                >
                  <option value="QUIZ">Quiz &amp; exam</option>
                  <option value="SIMULATOR">Simulator</option>
                </select>
              </div>
              <button type="submit" className={buttonClass("secondary", "md")}>
                Add question
              </button>
            </div>
          </form>
        </Panel>
      ) : null}

      {canWrite ? (
        <Panel
          title="Add many questions"
          hint={`Paste them in. The question on one line, its choices under it, a * against the correct one, a blank line between questions. Up to ${MAX_BULK_QUESTIONS} at a time, and either all of them are added or none are.`}
        >
          <form action={addManyQuestions} className="space-y-3">
            <div>
              <label className="rule-label mb-1 block" htmlFor="bulk-block">
                Questions
              </label>
              <textarea
                id="bulk-block"
                name="block"
                required
                rows={12}
                spellCheck={false}
                placeholder={EXAMPLE_BLOCK}
                className={`${FIELD} w-full font-mono text-xs leading-relaxed`}
              />
              <p className="mt-1.5 text-xs text-ink-500">
                Two to eight choices each, exactly one marked. A choice that
                starts with a real asterisk is written{" "}
                <code className="text-ink-400">\*</code>.
              </p>
            </div>
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="rule-label mb-1 block">Points each</label>
                <input
                  name="points"
                  type="number"
                  min={1}
                  defaultValue={1}
                  className={`${FIELD} w-20`}
                />
              </div>
              <div className="min-w-48 flex-1">
                <label className="rule-label mb-1 block">
                  Tags{" "}
                  <span className="text-ink-500">
                    &mdash; comma separated, applied to all of them
                  </span>
                </label>
                <input
                  name="tags"
                  placeholder={
                    bank.tagsInUse.slice(0, 3).join(", ") ||
                    "authority, escalation"
                  }
                  className={`${FIELD} w-full`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Pool</label>
                <select
                  name="pool"
                  defaultValue={poolFilter ?? "QUIZ"}
                  className={FIELD}
                >
                  <option value="QUIZ">Quiz &amp; exam</option>
                  <option value="SIMULATOR">Simulator</option>
                </select>
              </div>
              <SubmitButton size="md" pendingLabel="Adding…">
                Add all of them
              </SubmitButton>
            </div>
          </form>
        </Panel>
      ) : null}

      {sp.refused ? (
        <p
          role="alert"
          className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-4 py-3 text-xs text-ink-200"
        >
          {decodeURIComponent(sp.refused)}
        </p>
      ) : null}

      <Panel
        title="Questions"
        action={
          <nav aria-label="Pool" className="flex gap-1.5">
            {(
              [
                [null, "All", bank.questions.length],
                [
                  "QUIZ",
                  "Quiz & exam",
                  bank.questions.filter((q) => q.pool === "QUIZ").length,
                ],
                [
                  "SIMULATOR",
                  "Simulator",
                  bank.questions.filter((q) => q.pool === "SIMULATOR").length,
                ],
              ] as const
            ).map(([key, label, count]) => (
              <Link
                key={label}
                href={key ? `${here}?pool=${key}` : here}
                aria-pressed={poolFilter === key}
                className={buttonClass("toggle", "sm")}
              >
                {label} ({count})
              </Link>
            ))}
          </nav>
        }
        hint={
          canSeeKeys
            ? "The correct choice is marked. This view needs assessment.answerkey.read."
            : "Choices only — the key is not served to your role."
        }
      >
        {bank.questions.length === 0 ? (
          <Empty>This bank has no questions yet.</Empty>
        ) : (
          <ol className="space-y-3">
            {bank.questions
              .map((question, index) => ({ question, index }))
              .filter(({ question }) => !poolFilter || question.pool === poolFilter)
              .map(({ question, index }) => {
              const correct = correctIndexes(question);
              return (
                <li
                  key={question.id}
                  className="rounded-lg border border-ink-800 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <p className="min-w-0 text-xs">
                      <span className="mr-2 font-mono text-ink-500">
                        {index + 1}.
                      </span>
                      {question.stem}
                    </p>
                    <div className="flex shrink-0 items-center gap-2">
                      <Badge tone={question.pool === "SIMULATOR" ? "amber" : "blue"}>
                        {question.pool === "SIMULATOR" ? "Simulator" : "Quiz & exam"}
                      </Badge>
                      {canWrite ? (
                        <form action={movePool}>
                          <input type="hidden" name="questionId" value={question.id} />
                          <input
                            type="hidden"
                            name="pool"
                            value={question.pool === "SIMULATOR" ? "QUIZ" : "SIMULATOR"}
                          />
                          <button
                            type="submit"
                            title="A question on a paper must come off it before it can change pool."
                            className="text-[11px] text-brass-500 hover:underline"
                          >
                            Move to {question.pool === "SIMULATOR" ? "quiz" : "simulator"}
                          </button>
                        </form>
                      ) : null}
                      {question._count.assessments > 0 ? (
                        <Badge tone="amber">
                          on {question._count.assessments} paper(s)
                        </Badge>
                      ) : null}
                      <Badge>{question.points} pt</Badge>
                    </div>
                  </div>

                  <ul className="mt-2 space-y-0.5">
                    {question.options.map((option, oi) => (
                      <li
                        key={oi}
                        className={`text-[11px] ${
                          canSeeKeys && correct.includes(oi)
                            ? "text-signal-green"
                            : "text-ink-400"
                        }`}
                      >
                        {canSeeKeys && correct.includes(oi) ? "✓" : "·"}{" "}
                        {optionText(option)}
                      </li>
                    ))}
                  </ul>

                  {question.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {question.tags.map((tag) => (
                        <span
                          key={tag}
                          className="rounded-md border border-ink-800 px-1.5 py-0.5 text-[11px] text-ink-400"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  ) : null}

                  {canWrite ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-[11px] text-ink-500">
                        Edit
                      </summary>
                      <form action={retagQuestion} className="mt-2 space-y-2">
                        <input
                          type="hidden"
                          name="questionId"
                          value={question.id}
                        />
                        <textarea
                          name="stem"
                          defaultValue={question.stem}
                          rows={2}
                          className={`${FIELD} w-full`}
                        />
                        <div className="flex flex-wrap items-end gap-2">
                          <div>
                            <label className="rule-label mb-1 block">
                              Points
                            </label>
                            <input
                              name="points"
                              type="number"
                              min={1}
                              defaultValue={question.points}
                              className={`${FIELD} w-20`}
                            />
                          </div>
                          <div className="min-w-40 flex-1">
                            <label className="rule-label mb-1 block">
                              Tags
                            </label>
                            <input
                              name="tags"
                              defaultValue={question.tags.join(", ")}
                              className={`${FIELD} w-full`}
                            />
                          </div>
                          <div className="min-w-56 flex-1">
                            <label className="rule-label mb-1 block">
                              Explanation{" "}
                              <span className="text-ink-500">
                                &mdash; shown only after a pass
                              </span>
                            </label>
                            <input
                              name="explanation"
                              defaultValue={question.explanation ?? ""}
                              className={`${FIELD} w-full`}
                            />
                          </div>
                          <button
                            type="submit"
                            className={buttonClass("secondary", "md")}
                          >
                            Save
                          </button>
                          {canDelete ? (
                            <button
                              type="submit"
                              formAction={removeQuestion}
                              className={buttonClass("secondary", "md")}
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      </form>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </Panel>
    </div>
  );
}
