import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, getSession, apiOrNotFound } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { PaperPicker } from "./picker";
import { act } from "@/lib/act";

interface BuilderQuestion {
  id: string;
  stem: string;
  points: number;
  tags: string[];
}

interface Builder {
  assessment: {
    id: string;
    code: string;
    title: string;
    kind: string;
    passMark: number;
    maxAttempts: number;
    requiresReview: boolean;
    visible: boolean;
    moduleId: string | null;
    drawCount: number | null;
    finalExam: boolean;
    sat: number;
    module: { id: string; title: string; position: number } | null;
    programmeVersion: {
      id: string;
      version: number;
      status: string;
      programme: { id: string; code: string; title: string };
      modules: Array<{ id: string; title: string; position: number }>;
    };
    questions: Array<{ position: number; question: BuilderQuestion }>;
  };
  banks: Array<{
    id: string;
    title: string;
    tags: string[];
    module: { id: string; title: string; position: number } | null;
    questions: BuilderQuestion[];
  }>;
  badges: Array<{
    id: string;
    code: string;
    title: string;
    programmeCode: string | null;
  }>;
  linkedBadgeId: string | null;
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";
const KINDS = ["QUIZ", "SIMULATION", "PRACTICAL", "CAPSTONE", "DEFENCE"];

export default async function AssessmentBuilderPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  const canWrite = session.permissions.includes(P.ASSESSMENT_WRITE);

  const { assessment, banks, badges, linkedBadgeId } = await apiOrNotFound<Builder>(
    `/academy/assessments/${id}/builder`,
  );

  const version = assessment.programmeVersion;
  const isDraft = version.status === "DRAFT";
  const frozen = assessment.sat > 0;
  const here = `/authoring/assessments/${id}`;

  async function saveSettings(formData: FormData) {
    "use server";
    const badgeId = String(formData.get("awardsBadgeId") ?? "");
    await act(`/academy/assessments/${id}`, {
      method: "PATCH",
      body: {
        title: String(formData.get("title") ?? ""),
        kind: String(formData.get("kind") ?? "QUIZ"),
        passMark: Number(formData.get("passMark") ?? 80),
        maxAttempts: Number(formData.get("maxAttempts") ?? 3),
        requiresReview: formData.get("requiresReview") === "on",
        drawCount: Number(formData.get("drawCount") ?? 0),
        finalExam: formData.get("finalExam") === "on",
        moduleId: String(formData.get("moduleId") ?? "") || undefined,
        ...(badgeId ? { awardsBadgeId: badgeId } : {}),
      },
    });
    revalidatePath(here);
  }

  async function savePaper(formData: FormData) {
    "use server";
    const questionIds = formData
      .getAll("questionIds")
      .map(String)
      .filter(Boolean);
    await act(`/academy/assessments/${id}/questions`, {
      method: "PUT",
      body: { questionIds },
    });
    revalidatePath(here);
    revalidatePath(`/authoring/tracks/${version.id}`);
  }

  const chosen = assessment.questions.map((q) => q.question.id);
  const points = assessment.questions.reduce(
    (sum, q) => sum + q.question.points,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          {/* Where this paper sits, each step a way back. */}
          <nav aria-label="Breadcrumb" className="rule-label flex flex-wrap items-center gap-1.5">
            <Link href="/authoring" className="hover:text-brass-500">
              AIM&trade; Academy
            </Link>
            <span aria-hidden="true">›</span>
            {assessment.kind === "SIMULATION" ? (
              <>
                <Link href="/authoring?view=simulator" className="hover:text-brass-500">
                  Simulators
                </Link>
                <span aria-hidden="true">›</span>
              </>
            ) : null}
            <Link href={`/authoring/tracks/${version.id}`} className="hover:text-brass-500">
              {version.programme.code} v{version.version}
            </Link>
            <span aria-hidden="true">›</span>
            <Link
              href={`/authoring/tracks/${version.id}#assessments`}
              className="hover:text-brass-500"
            >
              Assessments
            </Link>
            <span aria-hidden="true">›</span>
            <span className="text-ink-200">
              {assessment.module
                ? `Module ${assessment.module.position}`
                : "Whole track"}
            </span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            <span className="font-mono text-brass-500">{assessment.code}</span>{" "}
            {assessment.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {assessment.finalExam ? (
            <Badge tone="blue">Final exam · issues certificate</Badge>
          ) : null}
          <Badge tone={isDraft ? "neutral" : "amber"}>{version.status}</Badge>
          {/* The candidate's own route, rendered by the candidate's own
              component, so an author reads the paper they are actually
              setting rather than an authoring-side approximation of it. */}
          <Link
            href={
              assessment.kind === "SIMULATION"
                ? `/authoring/simulator/${assessment.id}`
                : `/authoring/assessments/${assessment.id}/preview`
            }
            className={buttonClass("secondary", "md")}
          >
            Preview as a candidate
          </Link>
          {assessment.kind === "SIMULATION" ? (
            <Link
              href="/authoring?view=simulator"
              className={buttonClass("secondary", "md")}
            >
              Back to simulators
            </Link>
          ) : null}
          <Link
            href={`/authoring/tracks/${version.id}#assessments`}
            className={buttonClass("secondary", "md")}
          >
            Back to assessments
          </Link>
        </div>
      </div>

      {frozen ? (
        <p className="rounded-lg border border-signal-amber/30 bg-signal-amber/5 px-3 py-2 text-xs text-ink-300">
          <span className="font-medium text-signal-amber">
            {assessment.sat}
          </span>{" "}
          attempt
          {assessment.sat === 1 ? "" : "s"} exist against this paper, so its
          questions are fixed. Changing them would change what those people were
          measured on. A new version is the way to revise it.
        </p>
      ) : null}

      <Panel
        title="What this assessment is"
        hint="Name it, place it under a module, set what passing means and how many attempts anyone gets."
      >
        {canWrite ? (
          <form action={saveSettings} className="space-y-3">
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <label className="rule-label mb-1 block">Name</label>
                <input
                  name="title"
                  defaultValue={assessment.title}
                  required
                  minLength={3}
                  className={`${FIELD} w-full`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">Module</label>
                <select
                  name="moduleId"
                  defaultValue={assessment.moduleId ?? ""}
                  className={FIELD}
                >
                  <option value="">
                    {assessment.finalExam
                      ? "Whole track — final exam"
                      : "Whole track"}
                  </option>
                  {version.modules.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.position}. {m.title}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="rule-label mb-1 block">Kind</label>
                <select
                  name="kind"
                  defaultValue={assessment.kind}
                  className={FIELD}
                >
                  {KINDS.map((k) => (
                    <option key={k} value={k}>
                      {k}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="rule-label mb-1 block">
                  Passing criteria
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    name="passMark"
                    type="number"
                    min={1}
                    max={100}
                    defaultValue={assessment.passMark}
                    className={`${FIELD} w-20`}
                  />
                  <span className="text-xs text-ink-400">% to pass</span>
                </div>
              </div>
              <div>
                <label className="rule-label mb-1 block">
                  Attempts allowed
                </label>
                <input
                  name="maxAttempts"
                  type="number"
                  min={1}
                  max={20}
                  defaultValue={assessment.maxAttempts}
                  className={`${FIELD} w-20`}
                />
              </div>
              <div>
                <label className="rule-label mb-1 block">
                  {assessment.kind === "SIMULATION"
                    ? "Missions per run"
                    : "Questions per attempt"}
                </label>
                <div className="flex items-center gap-1.5">
                  <input
                    name="drawCount"
                    type="number"
                    min={0}
                    max={500}
                    defaultValue={assessment.drawCount ?? 0}
                    className={`${FIELD} w-20`}
                  />
                  <span className="text-xs text-ink-400">
                    drawn at random &middot; 0 = all
                  </span>
                </div>
              </div>
              <label className="flex items-center gap-2 pb-2 text-xs">
                <input
                  type="checkbox"
                  name="requiresReview"
                  defaultChecked={assessment.requiresReview}
                />
                An examiner marks it
              </label>
              <div className="min-w-56 flex-1">
                <label className="rule-label mb-1 block">
                  Badge earned by passing{" "}
                  <span className="text-ink-500">&mdash; optional</span>
                </label>
                <select
                  name="awardsBadgeId"
                  defaultValue={linkedBadgeId ?? ""}
                  className={`${FIELD} w-full`}
                >
                  <option value="">No badge</option>
                  {badges.map((badge) => (
                    <option key={badge.id} value={badge.id}>
                      {badge.title}
                      {badge.programmeCode ? ` (${badge.programmeCode})` : ""}
                    </option>
                  ))}
                </select>
              </div>
              <button type="submit" className={buttonClass("secondary", "md")}>
                Save
              </button>
            </div>

            {assessment.kind === "QUIZ" && !assessment.moduleId ? (
              <label className="flex items-start gap-2 rounded-lg border border-ink-800 px-3 py-2 text-xs">
                <input
                  type="checkbox"
                  name="finalExam"
                  defaultChecked={assessment.finalExam}
                  className="mt-0.5"
                />
                <span>
                  This is the track&rsquo;s final examination.
                  <span className="block text-ink-400">
                    It opens only once a candidate has completed every lesson
                    and passed every module quiz at its pass mark. Passing it
                    issues the certificate automatically, with a serial number.
                    One per track version.
                  </span>
                </span>
              </label>
            ) : null}

            <p className="text-[11px] text-ink-500">
              Choosing a badge writes that badge&rsquo;s own condition to
              &ldquo;passed {assessment.code}&rdquo;, so one evaluator decides
              who holds it. Clearing it here leaves the badge alone &mdash;
              withdrawing a condition is a decision made on the badge screen.
            </p>
          </form>
        ) : (
          <Empty>
            Building assessments belongs to whoever builds the academy.
          </Empty>
        )}
      </Panel>

      <Panel
        title="The paper"
        hint={
          assessment.kind === "SIMULATION"
            ? "The simulator pool: missions from the simulator half of the bank. Each run draws its missions at random from these."
            : assessment.drawCount
              ? "The pool this paper draws from: quiz & exam questions only. Each attempt draws its questions at random from these."
              : "Pick the questions from the quiz & exam half of a bank under this track and module. The order here is the order they are asked."
        }
        action={
          <Badge>
            {chosen.length} question{chosen.length === 1 ? "" : "s"} &middot;{" "}
            {points} points
          </Badge>
        }
      >
        {banks.length === 0 ? (
          <Empty>
            No question bank serves this track yet.{" "}
            <Link
              href="/authoring/banks"
              className="text-brass-500 hover:underline"
            >
              Create one
            </Link>
            .
          </Empty>
        ) : (
          <PaperPicker
            action={savePaper}
            banks={banks}
            chosen={chosen}
            readOnly={!canWrite || !isDraft || frozen}
          />
        )}
      </Panel>
    </div>
  );
}
