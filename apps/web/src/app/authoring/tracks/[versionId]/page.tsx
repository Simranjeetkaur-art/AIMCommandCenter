import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, getSession, apiOrNotFound } from "@/lib/api";
import {
  Badge,
  Button,
  Empty,
  Panel,
  Stat,
  buttonClass,
} from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { act, done } from "@/lib/act";

interface AuthoringVersion {
  id: string;
  version: number;
  status: string;
  requirements: Record<string, unknown>;
  programme: { id: string; code: string; title: string; level: number };
  modules: Array<{
    id: string;
    code: string | null;
    title: string;
    summary: string;
    overview: string;
    outcomes: string[];
    visible: boolean;
    position: number;
    lessons: Array<{
      id: string;
      title: string;
      estimatedMinutes: number;
      bodyHtml: string | null;
      visible: boolean;
    }>;
  }>;
  assessments: Array<{
    id: string;
    code: string;
    title: string;
    kind: string;
    passMark: number;
    requiresReview: boolean;
    maxAttempts: number;
    visible: boolean;
    _count: { questions: number; attempts?: number };
  }>;
}

export default async function TrackEditor({
  params,
}: {
  params: Promise<{ versionId: string }>;
}) {
  const { versionId } = await params;
  const session = await getSession();
  const canPublish = session.permissions.includes(P.PROGRAMME_PUBLISH);
  const canDelete = session.permissions.includes(P.CONTENT_DELETE);
  const canUpdate = session.permissions.includes(P.PROGRAMME_UPDATE);

  const version = await apiOrNotFound<AuthoringVersion>(
    `/academy/versions/${versionId}/authoring`,
  );
  const editable = version.status === "DRAFT";

  async function addModule(formData: FormData) {
    "use server";
    await act(`/academy/versions/${versionId}/modules`, {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? "") || undefined,
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
        position: Number(formData.get("position") ?? 1),
      },
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function addLesson(formData: FormData) {
    "use server";
    await act(`/academy/modules/${String(formData.get("moduleId"))}/lessons`, {
      method: "POST",
      body: {
        title: String(formData.get("title") ?? ""),
        bodyMd: String(formData.get("bodyMd") ?? ""),
        position: 1,
        estimatedMinutes: Number(formData.get("estimatedMinutes") ?? 30),
      },
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function addAssessment(formData: FormData) {
    "use server";
    await act(`/academy/versions/${versionId}/assessments`, {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? ""),
        title: String(formData.get("title") ?? ""),
        kind: String(formData.get("kind") ?? "QUIZ"),
        passMark: Number(formData.get("passMark") ?? 80),
      },
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function publish(formData: FormData) {
    "use server";
    await act(`/academy/versions/${versionId}/publish`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
    await done("Published. Candidates are now measured against this version.");
  }

  /**
   * Hiding works on a published version where editing does not: taking a thing
   * out of a candidate's view is an operational call about a live course,
   * whereas changing what it says still needs a new version.
   */
  async function setVisibility(formData: FormData) {
    "use server";
    await act(
      `/academy/${String(formData.get("kind"))}/${String(formData.get("id"))}/visibility`,
      {
        method: "PATCH",
        body: { visible: formData.get("visible") === "true" },
      },
    );
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function saveModuleDetail(formData: FormData) {
    "use server";
    await act(`/academy/modules/${String(formData.get("moduleId"))}`, {
      method: "PATCH",
      body: {
        overview: String(formData.get("overview") ?? ""),
        outcomes: String(formData.get("outcomes") ?? "")
          .split(/\r?\n/)
          .map((o) => o.trim())
          .filter(Boolean),
      },
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function saveAssessment(formData: FormData) {
    "use server";
    await act(`/academy/assessments/${String(formData.get("assessmentId"))}`, {
      method: "PATCH",
      body: {
        title: String(formData.get("title") ?? ""),
        passMark: Number(formData.get("passMark") ?? 80),
        maxAttempts: Number(formData.get("maxAttempts") ?? 3),
        requiresReview: formData.get("requiresReview") === "on",
      },
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function removeAssessment(formData: FormData) {
    "use server";
    await act(`/academy/assessments/${String(formData.get("assessmentId"))}`, {
      method: "DELETE",
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  async function removeLesson(formData: FormData) {
    "use server";
    await act(`/academy/lessons/${String(formData.get("lessonId"))}`, {
      method: "DELETE",
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  /**
   * Takes a draft from the published version and opens it.
   *
   * Offered on the published version's own screen, which is where somebody
   * discovers they cannot edit it. Telling them the rule and then making them
   * find the course page to act on it is the sort of instruction that gets
   * read as a refusal.
   */
  async function reviseFromHere() {
    "use server";
    const draft = await act<{ id: string }>(
      `/academy/programmes/${version.programme.id}/versions`,
      { method: "POST", body: { cloneCurrent: true } },
    );
    revalidatePath("/authoring");
    redirect(`/authoring/tracks/${draft.id}`);
  }

  async function removeModule(formData: FormData) {
    "use server";
    await act(`/academy/modules/${String(formData.get("moduleId"))}`, {
      method: "DELETE",
    });
    revalidatePath(`/authoring/tracks/${versionId}`);
  }

  const totalQuestions = version.assessments.reduce(
    (n, a) => n + a._count.questions,
    0,
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">
            {version.programme.code} &middot; version {version.version}
          </p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {version.programme.title}
          </h1>
        </div>
        <Badge tone={version.status === "PUBLISHED" ? "green" : "neutral"}>
          {version.status}
        </Badge>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Modules" value={version.modules.length} />
        <Stat
          label="Lessons"
          value={version.modules.reduce((n, m) => n + m.lessons.length, 0)}
        />
        <Stat label="Assessments" value={version.assessments.length} />
        <Stat label="Questions" value={totalQuestions} />
      </div>

      {!editable ? (
        <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-4">
          <p className="text-sm font-semibold text-signal-amber">
            This version is published
          </p>
          <p className="mt-1 text-xs text-ink-200">
            Live candidates are being measured against it, so the server refuses
            edits. To change the syllabus, take a draft from this version, edit
            that, and publish it &mdash; this version stays exactly as it is
            until you do, and candidates see no change in the meantime.
          </p>
          <p className="mt-1 text-xs text-ink-400">
            Hiding a module, lesson or paper still works here: taking something
            out of a candidate&rsquo;s view is an operational call about a live
            course, not a change to what it says.
          </p>
          {canUpdate ? (
            <form action={reviseFromHere} className="mt-3">
              <Button type="submit" variant="primary" size="md">
                Revise &mdash; new draft from v{version.version}
              </Button>
            </form>
          ) : null}
        </div>
      ) : null}

      {editable ? (
        <Panel
          title="Add a module"
          hint="Position sets the order a candidate works through them."
        >
          <form action={addModule} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="rule-label mb-1 block">Code</label>
              <input
                name="code"
                placeholder="ACA-111"
                className="w-28 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div className="flex-1 min-w-44">
              <label className="rule-label mb-1 block">Title</label>
              <input
                name="title"
                required
                minLength={3}
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex-1 min-w-52">
              <label className="rule-label mb-1 block">Summary</label>
              <input
                name="summary"
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="rule-label mb-1 block">Position</label>
              <input
                name="position"
                type="number"
                min={1}
                defaultValue={version.modules.length + 1}
                className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <button type="submit" className={buttonClass("primary", "md")}>
              Add module
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel title="Modules and lessons">
        {version.modules.length === 0 ? (
          <Empty>No modules yet.</Empty>
        ) : (
          <ol className="space-y-2">
            {version.modules.map((module) => (
              <li
                key={module.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2.5">
                      <span className="font-mono text-xs text-ink-400">
                        {String(module.position).padStart(2, "0")}
                      </span>
                      {module.code ? (
                        <span className="font-mono text-xs text-brass-500">
                          {module.code}
                        </span>
                      ) : null}
                      <span className="text-sm font-medium">
                        {module.title}
                      </span>
                      <Badge>
                        {module.lessons.length} lesson
                        {module.lessons.length === 1 ? "" : "s"}
                      </Badge>
                      {!module.visible ? (
                        <Badge tone="amber">Hidden</Badge>
                      ) : null}
                    </div>
                    <p className="mt-1 text-xs text-ink-400">
                      {module.summary}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <form action={setVisibility}>
                      <input type="hidden" name="kind" value="modules" />
                      <input type="hidden" name="id" value={module.id} />
                      <input
                        type="hidden"
                        name="visible"
                        value={String(!module.visible)}
                      />
                      <button
                        type="submit"
                        className={buttonClass("toggle", "chip")}
                        aria-pressed={!module.visible}
                      >
                        {module.visible ? "Hide" : "Show"}
                      </button>
                    </form>
                    {editable && canDelete ? (
                      <form action={removeModule}>
                        <input
                          type="hidden"
                          name="moduleId"
                          value={module.id}
                        />
                        <ConfirmButton
                          type="submit"
                          confirm={`Delete module "${module.title}" and everything in it? This cannot be undone.`}
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </div>
                </div>

                {editable ? (
                  <form
                    action={saveModuleDetail}
                    className="mt-3 grid gap-2 rounded-lg border border-ink-800 p-3 sm:grid-cols-2"
                  >
                    <input type="hidden" name="moduleId" value={module.id} />
                    <label className="block">
                      <span className="rule-label mb-1 block">
                        Module overview
                      </span>
                      <textarea
                        name="overview"
                        rows={3}
                        defaultValue={module.overview}
                        placeholder="What this module is about, distinct from any one lesson."
                        className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-2 text-xs"
                      />
                    </label>
                    <label className="block">
                      <span className="rule-label mb-1 block">
                        Learning outcomes (one per line)
                      </span>
                      <textarea
                        name="outcomes"
                        rows={3}
                        defaultValue={(module.outcomes ?? []).join("\n")}
                        placeholder={
                          "Distinguish capability from authority\nName the accountable owner"
                        }
                        className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-2 text-xs"
                      />
                    </label>
                    <div className="sm:col-span-2">
                      <button
                        type="submit"
                        className={buttonClass("secondary", "md")}
                      >
                        Save module detail
                      </button>
                    </div>
                  </form>
                ) : (module.outcomes ?? []).length > 0 ? (
                  <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-ink-400">
                    {module.outcomes.map((o, i) => (
                      <li key={i}>{o}</li>
                    ))}
                  </ul>
                ) : null}

                {module.lessons.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {module.lessons.map((lesson) => (
                      <li
                        key={lesson.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-ink-800/70 px-3 py-1.5 text-xs"
                      >
                        <span>{lesson.title}</span>
                        <span className="flex items-center gap-2 text-ink-400">
                          {!lesson.visible ? (
                            <Badge tone="amber">Hidden</Badge>
                          ) : null}
                          <span className="tabular-nums">
                            {lesson.estimatedMinutes} min
                          </span>

                          {/* Benign to destructive, left to right, and the
                              same order on every row so the position of
                              "delete" is learnable rather than looked up. */}
                          <Link
                            href={`/authoring/lessons/${lesson.id}`}
                            className={buttonClass("secondary", "sm")}
                          >
                            Edit
                          </Link>
                          <form action={setVisibility} className="inline">
                            <input type="hidden" name="kind" value="lessons" />
                            <input type="hidden" name="id" value={lesson.id} />
                            <input
                              type="hidden"
                              name="visible"
                              value={String(!lesson.visible)}
                            />
                            <Button
                              type="submit"
                              variant="toggle"
                              size="chip"
                              aria-pressed={!lesson.visible}
                            >
                              {lesson.visible ? "Hide" : "Show"}
                            </Button>
                          </form>
                          {editable && canDelete ? (
                            <form action={removeLesson} className="inline">
                              <input
                                type="hidden"
                                name="lessonId"
                                value={lesson.id}
                              />
                              <ConfirmButton
                                type="submit"
                                confirm={`Delete lesson "${lesson.title}"? This cannot be undone.`}
                              >
                                Delete
                              </ConfirmButton>
                            </form>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : null}

                {editable ? (
                  <form
                    action={addLesson}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="moduleId" value={module.id} />
                    <div className="flex-1 min-w-44">
                      <label className="rule-label mb-1 block">
                        New lesson title
                      </label>
                      <input
                        name="title"
                        required
                        minLength={3}
                        className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div className="flex-[2] min-w-56">
                      <label className="rule-label mb-1 block">Body</label>
                      <input
                        name="bodyMd"
                        required
                        minLength={10}
                        className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <div>
                      <label className="rule-label mb-1 block">Minutes</label>
                      <input
                        name="estimatedMinutes"
                        type="number"
                        min={1}
                        defaultValue={30}
                        className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                      />
                    </div>
                    <button
                      type="submit"
                      className={buttonClass("secondary", "md")}
                    >
                      Add lesson
                    </button>
                  </form>
                ) : null}
              </li>
            ))}
          </ol>
        )}
      </Panel>

      {editable ? (
        <Panel
          title="Add an assessment"
          hint="A practical, capstone or defence goes to an examiner; a quiz and a simulator are marked by the server."
        >
          <form
            action={addAssessment}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="rule-label mb-1 block">Code</label>
              <input
                name="code"
                required
                placeholder="CP-SIM2"
                className="w-32 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div className="flex-1 min-w-48">
              <label className="rule-label mb-1 block">Title</label>
              <input
                name="title"
                required
                minLength={3}
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="rule-label mb-1 block">Kind</label>
              <select
                name="kind"
                className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
              >
                {["QUIZ", "SIMULATION", "PRACTICAL", "CAPSTONE", "DEFENCE"].map(
                  (k) => (
                    <option key={k}>{k}</option>
                  ),
                )}
              </select>
            </div>
            <div>
              <label className="rule-label mb-1 block">Pass mark</label>
              <input
                name="passMark"
                type="number"
                min={1}
                max={100}
                defaultValue={80}
                className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <button type="submit" className={buttonClass("primary", "md")}>
              Add assessment
            </button>
          </form>
        </Panel>
      ) : null}

      {/* Anchor for "Back to assessments" from a paper's own screen. */}
      <div id="assessments" className="scroll-mt-6" />
      <Panel
        title="Assessments"
        hint="Pass mark, attempts and examiner review are editable on a draft. Hiding works on a published version too."
      >
        {version.assessments.length === 0 ? (
          <Empty>No assessments yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {version.assessments.map((assessment) => (
              <li
                key={assessment.id}
                className="rounded-lg border border-ink-800 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <span className="flex flex-wrap items-center gap-2.5 text-sm">
                    <span className="font-mono text-xs text-brass-500">
                      {assessment.code}
                    </span>
                    {assessment.title}
                    <Badge>{assessment.kind}</Badge>
                    {assessment.requiresReview ? (
                      <Badge tone="blue">Examined</Badge>
                    ) : null}
                    {!assessment.visible ? (
                      <Badge tone="amber">Hidden</Badge>
                    ) : null}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-400">
                    <span className="font-mono tabular-nums">
                      {assessment._count.questions} items
                    </span>
                    <form action={setVisibility}>
                      <input type="hidden" name="kind" value="assessments" />
                      <input type="hidden" name="id" value={assessment.id} />
                      <input
                        type="hidden"
                        name="visible"
                        value={String(!assessment.visible)}
                      />
                      <button
                        type="submit"
                        className={buttonClass("toggle", "chip")}
                        aria-pressed={!assessment.visible}
                      >
                        {assessment.visible ? "Hide" : "Show"}
                      </button>
                    </form>
                    <Link
                      href={`/authoring/assessments/${assessment.id}`}
                      className={buttonClass("secondary", "sm")}
                    >
                      Questions
                    </Link>
                  </span>
                </div>

                {editable ? (
                  <div className="mt-2.5 flex flex-wrap items-end gap-2">
                    <form
                      action={saveAssessment}
                      className="flex flex-wrap items-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="assessmentId"
                        value={assessment.id}
                      />
                      <label className="block">
                        <span className="rule-label mb-1 block">Title</span>
                        <input
                          name="title"
                          defaultValue={assessment.title}
                          className="w-52 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="rule-label mb-1 block">Pass %</span>
                        <input
                          name="passMark"
                          type="number"
                          min={1}
                          max={100}
                          defaultValue={assessment.passMark}
                          className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        />
                      </label>
                      <label className="block">
                        <span className="rule-label mb-1 block">Attempts</span>
                        <input
                          name="maxAttempts"
                          type="number"
                          min={1}
                          max={20}
                          defaultValue={assessment.maxAttempts}
                          className="w-20 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
                        />
                      </label>
                      <label className="flex items-center gap-2 pb-2 text-xs text-ink-400">
                        <input
                          type="checkbox"
                          name="requiresReview"
                          defaultChecked={assessment.requiresReview}
                        />
                        Examiner reviewed
                      </label>
                      <button
                        type="submit"
                        className={buttonClass("secondary", "md")}
                      >
                        Save
                      </button>
                    </form>

                    {canDelete ? (
                      <form action={removeAssessment}>
                        <input
                          type="hidden"
                          name="assessmentId"
                          value={assessment.id}
                        />
                        <ConfirmButton
                          type="submit"
                          size="md"
                          confirm={`Delete assessment "${assessment.title}"? This cannot be undone.`}
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {editable && canPublish ? (
        <Panel
          title="Publish this version"
          hint="Publishing makes this the version live candidates are measured against. It retires the previous published version and cannot be undone by editing."
        >
          <form action={publish} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-64">
              <label htmlFor="publish-reason" className="rule-label mb-1 block">
                Stated reason (at least 10 characters)
              </label>
              <input
                id="publish-reason"
                name="reason"
                required
                minLength={10}
                placeholder="Recorded on the audit event"
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <ConfirmButton
              confirm={`Publish ${version.programme.code} version ${version.version}? Candidates will be measured against it, and the previous published version is retired.`}
              variant="primary"
              size="md"
            >
              Publish version
            </ConfirmButton>
          </form>
        </Panel>
      ) : editable ? (
        <p className="text-xs text-ink-400">
          This draft is ready when you are. Publishing is an administration act.
        </p>
      ) : null}

      <Link
        href="/authoring"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to courses
      </Link>
    </div>
  );
}
