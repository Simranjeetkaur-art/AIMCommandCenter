import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { PERMISSIONS as P } from "@aim/contracts";
import { ApiError, api, getSession } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { SimulatorBoard } from "./simulator-board";
import { act } from "@/lib/act";

interface Programme {
  id: string;
  code: string;
  title: string;
  summary: string;
  status: string;
  level: number;
  levelLabel: string | null;
  tagline: string;
  visible: boolean;
  prerequisiteCode: string | null;
  cardStats: string[];
  versions: Array<{
    id: string;
    version: number;
    status: string;
    publishedAt: string | null;
  }>;
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

/**
 * The three steps every module follows, stated once at the top.
 *
 * The prototype says it on every module card: Learn, then Command Practice and
 * Assessment, then the badge. Saying it here as well means an author building
 * a module can see which of the three they have and which they have not.
 */
const PATH = [
  {
    step: "1",
    name: "Learn",
    detail:
      "The lesson: an about section, the learning outcomes, then numbered sections carrying key insights, cases, terms and references.",
  },
  {
    step: "2",
    name: "Assessment",
    detail:
      "A question bank under the module, tagged; then a paper drawn from it with a pass mark and an attempt limit.",
  },
  {
    step: "3",
    name: "Earn badge",
    detail:
      "The badge the pass earns, with its condition. Defined once and awarded by the evaluator, never by hand.",
  },
];

export default async function AcademyPage({
  searchParams,
}: {
  searchParams: Promise<{
    refused?: string;
    discarded?: string;
    view?: string;
  }>;
}) {
  const notice = await searchParams;
  const view = notice.view === "simulator" ? "simulator" : "course";
  const session = await getSession();
  const canCreate = session.permissions.includes(P.PROGRAMME_CREATE);
  const canUpdate = session.permissions.includes(P.PROGRAMME_UPDATE);
  const canPublish = session.permissions.includes(P.PROGRAMME_PUBLISH);
  const canDelete = session.permissions.includes(P.CONTENT_DELETE) && canCreate;
  // Exactly what the discard route demands. Offering a control the server will
  // refuse is worse than not offering one.
  const canDiscardDraft =
    session.permissions.includes(P.CONTENT_DELETE) && canUpdate;

  const programmes = await api<Programme[]>("/academy/programmes");

  async function createTrack(formData: FormData) {
    "use server";
    await act("/academy/programmes", {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? "").toUpperCase(),
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
      },
    });
    revalidatePath("/authoring");
  }

  async function updateTrack(formData: FormData) {
    "use server";
    await act(`/academy/programmes/${String(formData.get("programmeId"))}`, {
      method: "PATCH",
      body: {
        title: String(formData.get("title") ?? ""),
        summary: String(formData.get("summary") ?? ""),
        status: String(formData.get("status") ?? "DRAFT"),
      },
    });
    revalidatePath("/authoring");
  }

  async function setTrackVisible(formData: FormData) {
    "use server";
    await act(
      `/academy/programmes/${String(formData.get("programmeId"))}/visibility`,
      {
        method: "PATCH",
        body: { visible: formData.get("visible") === "true" },
      },
    );
    revalidatePath("/authoring");
  }

  async function deleteTrack(formData: FormData) {
    "use server";
    await act(`/academy/programmes/${String(formData.get("programmeId"))}`, {
      method: "DELETE",
    });
    revalidatePath("/authoring");
  }

  /**
   * Discards a draft from the version row.
   *
   * A refusal here is an ordinary answer, not a crash: the server declines to
   * discard a draft that has cohorts, credentials or sat attempts against it,
   * and the reason it gives is the useful part. So it is caught and shown,
   * rather than thrown into an error page that loses the sentence explaining
   * why the draft is staying.
   */
  async function discardVersion(formData: FormData) {
    "use server";
    const versionId = String(formData.get("versionId"));

    // Next signals a redirect by throwing, so neither redirect below sits
    // inside the try -- catching one would report a successful discard as a
    // failed one.
    let gone: { version: number; code: string };
    try {
      gone = await api<{ version: number; code: string }>(
        `/academy/versions/${versionId}`,
        { method: "DELETE" },
      );
    } catch (error) {
      const reason =
        error instanceof ApiError ? error.message : "The discard was refused.";
      redirect(`/authoring?refused=${encodeURIComponent(reason)}`);
    }

    revalidatePath("/authoring");
    redirect(
      `/authoring?discarded=${encodeURIComponent(`${gone.code} v${gone.version}`)}`,
    );
  }

  async function reviseTrack(formData: FormData) {
    "use server";
    await act(
      `/academy/programmes/${String(formData.get("programmeId"))}/versions`,
      {
        method: "POST",
        body: { cloneCurrent: true },
      },
    );
    revalidatePath("/authoring");
  }

  const ordered = [...programmes].sort((a, b) => a.level - b.level);

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">AIM&trade; Academy</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">Tracks</h1>
        <p className="mt-1 max-w-2xl text-xs text-ink-400">
          A track holds modules; a module holds a lesson, an assessment and the
          badge that assessment earns. Everything below is data, so changing
          what a track promises is an edit rather than a deploy.
        </p>
      </div>

      {/* Two ways into the same academy: the course a candidate studies, and
          the simulator they practise command decisions in. */}
      <nav
        aria-label="Academy view"
        className="inline-flex rounded-xl border border-ink-800 bg-ink-900/60 p-1"
      >
        {(
          [
            ["course", "Course", "Tracks, modules, lessons and papers"],
            ["simulator", "Simulator", "Mission pools, runs and preview"],
          ] as const
        ).map(([key, label, hint]) => (
          <Link
            key={key}
            href={key === "course" ? "/authoring" : "/authoring?view=simulator"}
            aria-current={view === key ? "page" : undefined}
            className={`rounded-lg px-4 py-2 text-left transition focus-visible:outline-2 focus-visible:outline-brass-500 ${
              view === key
                ? "bg-brass-500/15 text-brass-500"
                : "text-ink-400 hover:bg-ink-800/70 hover:text-ink-100"
            }`}
          >
            <span className="block text-sm font-medium">{label}</span>
            <span className="block text-[11px] opacity-80">{hint}</span>
          </Link>
        ))}
      </nav>

      {view === "simulator" ? (
        <SimulatorBoard />
      ) : (
      <>
      <Panel
        title="Every module follows the same path"
        hint="Learn, then assessment, then badge."
      >
        <ol className="grid gap-3 sm:grid-cols-3">
          {PATH.map((stage) => (
            <li
              key={stage.step}
              className="rounded-lg border border-ink-800 p-3"
            >
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brass-500 text-[11px] font-semibold text-ink-950">
                  {stage.step}
                </span>
                <span className="text-sm font-medium">{stage.name}</span>
              </div>
              <p className="mt-1.5 text-xs text-ink-400">{stage.detail}</p>
            </li>
          ))}
        </ol>
      </Panel>

      {canCreate ? (
        <Panel
          title="New track"
          hint="Created as a draft at version 1. Its level, restriction and gate are set on the track's own screen."
        >
          <form action={createTrack} className="flex flex-wrap items-end gap-3">
            <div>
              <label className="rule-label mb-1 block">Code</label>
              <input
                name="code"
                required
                minLength={3}
                placeholder="AIM-XX"
                className={`${FIELD} w-32 font-mono uppercase`}
              />
            </div>
            <div className="min-w-48 flex-1">
              <label className="rule-label mb-1 block">Title</label>
              <input
                name="title"
                required
                minLength={3}
                className={`${FIELD} w-full`}
              />
            </div>
            <div className="min-w-56 flex-1">
              <label className="rule-label mb-1 block">Summary</label>
              <input name="summary" required className={`${FIELD} w-full`} />
            </div>
            <button type="submit" className={buttonClass("primary", "md")}>
              Create track
            </button>
          </form>
        </Panel>
      ) : null}

      {/* What happened to the last discard.
          A refusal carries the server's own sentence -- "4 attempt(s) exist
          against this draft's assessments" -- which is the part worth reading.
          Showing it beats an error page, because the refusal is a normal
          answer here rather than a fault. */}
      {notice.refused ? (
        <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-4">
          <p className="text-sm font-semibold text-signal-amber">
            That draft is staying
          </p>
          <p className="mt-1 text-xs text-ink-200">{notice.refused}</p>
        </div>
      ) : null}

      {notice.discarded ? (
        <div className="rounded-lg border border-ink-800 px-4 py-3">
          <p className="text-xs text-ink-200">
            Discarded {notice.discarded}. Nothing a candidate could see has
            changed.
          </p>
        </div>
      ) : null}

      <Panel
        title="Tracks"
        hint="Open a version to build its modules, lessons and papers."
      >
        {ordered.length === 0 ? (
          <Empty>No tracks yet.</Empty>
        ) : (
          <ul className="space-y-4">
            {ordered.map((programme) => {
              // The live version, and the newest draft if one is open. Both
              // read straight off the versions the server already sent, so
              // the buttons below and the version chips above can never
              // disagree about what is published.
              const published = [...programme.versions]
                .filter((v) => v.status === "PUBLISHED")
                .sort((a, b) => b.version - a.version)[0];
              const openDraft = [...programme.versions]
                .filter((v) => v.status === "DRAFT")
                .sort((a, b) => b.version - a.version)[0];
              const staleDrafts = programme.versions.filter(
                (v) => v.status === "DRAFT",
              ).length;

              return (
                <li
                  key={programme.id}
                  className="rounded-lg border border-ink-800 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <Badge>
                          {programme.levelLabel ?? `LEVEL ${programme.level}`}
                        </Badge>
                        <span className="font-mono text-xs text-brass-500">
                          {programme.code}
                        </span>
                        <span className="text-sm font-medium">
                          {programme.title}
                        </span>
                        {!programme.visible ? (
                          <Badge tone="amber">hidden</Badge>
                        ) : null}
                        {programme.prerequisiteCode ? (
                          <Badge tone="amber">
                            after {programme.prerequisiteCode}
                          </Badge>
                        ) : null}
                      </div>
                      <p className="mt-1 max-w-3xl text-xs text-ink-400">
                        {programme.summary}
                      </p>
                      {programme.cardStats?.length ? (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {programme.cardStats.map((stat) => (
                            <span
                              key={stat}
                              className="rounded-md border border-ink-800 px-2 py-0.5 text-[11px] text-ink-400"
                            >
                              {stat}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                    <Badge
                      tone={programme.status === "ACTIVE" ? "green" : "neutral"}
                    >
                      {programme.status}
                    </Badge>
                  </div>

                  <ul className="mt-3 flex flex-wrap gap-2">
                    {programme.versions.map((version) => (
                      <li key={version.id} className="flex items-center gap-1">
                        <Link
                          href={`/authoring/tracks/${version.id}`}
                          className="flex items-center gap-2 rounded-lg border border-ink-800 px-3 py-1.5 text-xs transition hover:border-brass-500"
                        >
                          <span className="font-mono">v{version.version}</span>
                          <Badge
                            tone={
                              version.status === "PUBLISHED"
                                ? "green"
                                : "neutral"
                            }
                          >
                            {version.status}
                          </Badge>
                          <span className="text-ink-400">
                            {version.status === "PUBLISHED"
                              ? "review"
                              : "build"}{" "}
                            &rarr;
                          </span>
                        </Link>

                        {/* Discarding a draft from the row it is on.
                          Only a draft gets this. A published version is what
                          people are measured against and a retired one is the
                          record of what they were measured against before, so
                          neither is a thing to throw away from a list -- and
                          the server refuses both regardless of what is drawn
                          here. Shown as its own control beside the chip rather
                          than inside it, because a button nested in a link is
                          neither reliably clickable nor reachable by keyboard. */}
                        {canDiscardDraft && version.status === "DRAFT" ? (
                          <form action={discardVersion}>
                            <input
                              type="hidden"
                              name="versionId"
                              value={version.id}
                            />
                            <ConfirmButton
                              type="submit"
                              size="sm"
                              confirm={`Discard ${programme.code} v${version.version}? It was never published, so no candidate has seen it. This cannot be undone.`}
                            >
                              Discard
                            </ConfirmButton>
                          </form>
                        ) : null}
                      </li>
                    ))}
                  </ul>

                  {/* Said in words, because a row of version chips does not
                    explain itself. The question this answers is the one a
                    person actually asks on seeing nine of them: which is live,
                    and where do I make a change? */}
                  {published ? (
                    <p className="mt-2 text-[11px] text-ink-400">
                      v{published.version} is live and cannot be edited in place
                      &mdash; candidates are being measured against it.
                      {staleDrafts > 0
                        ? ` ${staleDrafts} draft${staleDrafts === 1 ? "" : "s"} open; a draft changes nothing for candidates until it is published.`
                        : " To change it, take a draft from it, edit that, and publish."}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/authoring/courses/${programme.id}`}
                      className={buttonClass("secondary", "md")}
                    >
                      Course settings
                    </Link>
                    <Link
                      href={`/authoring/restrictions/${programme.id}`}
                      className={buttonClass("secondary", "md")}
                    >
                      Restriction &amp; ladder
                    </Link>
                    <Link
                      href={`/authoring/banks?programmeId=${programme.id}`}
                      className={buttonClass("secondary", "md")}
                    >
                      Question banks
                    </Link>
                    <Link
                      href={`/authoring/badges?programmeCode=${programme.code}`}
                      className={buttonClass("secondary", "md")}
                    >
                      Badges
                    </Link>

                    {canUpdate ? (
                      <form action={setTrackVisible}>
                        <input
                          type="hidden"
                          name="programmeId"
                          value={programme.id}
                        />
                        <input
                          type="hidden"
                          name="visible"
                          value={String(!programme.visible)}
                        />
                        <button
                          type="submit"
                          className={buttonClass("secondary", "md")}
                        >
                          {programme.visible
                            ? "Hide from candidates"
                            : "Show to candidates"}
                        </button>
                      </form>
                    ) : null}

                    {/* Changing a published track.
                      A published version is not editable in place -- live
                      candidates are being measured against it -- so the way to
                      change one is to take a draft from it, edit that, and
                      publish. That control used to be hidden whenever any
                      draft already existed, which left a track like AIM-CP,
                      carrying eight abandoned drafts, with no visible route to
                      change it at all and nothing on the screen saying why.
                      Now the route is always shown: the open draft if there is
                      one, a fresh revision if there is not, and both when
                      continuing an old draft and starting from what is
                      actually live are different things to want. */}
                    {published ? (
                      <>
                        {openDraft ? (
                          <Link
                            href={`/authoring/tracks/${openDraft.id}`}
                            className={buttonClass("primary", "md")}
                          >
                            Continue draft v{openDraft.version} &rarr;
                          </Link>
                        ) : null}

                        <form action={reviseTrack}>
                          <input
                            type="hidden"
                            name="programmeId"
                            value={programme.id}
                          />
                          <button
                            type="submit"
                            className={buttonClass(
                              openDraft ? "secondary" : "primary",
                              "md",
                            )}
                          >
                            {openDraft
                              ? `Start a fresh draft from v${published.version}`
                              : `Revise — new draft from v${published.version}`}
                          </button>
                        </form>
                      </>
                    ) : null}

                    {canDelete ? (
                      <form action={deleteTrack}>
                        <input
                          type="hidden"
                          name="programmeId"
                          value={programme.id}
                        />
                        <ConfirmButton
                          type="submit"
                          confirm={`Delete the ${programme.code} track? The server refuses this if it has a published version, a cohort or a credential against it.`}
                        >
                          Delete
                        </ConfirmButton>
                      </form>
                    ) : null}
                  </div>

                  {canUpdate ? (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-xs text-ink-500">
                        Edit details
                      </summary>
                      <form
                        action={updateTrack}
                        className="mt-2 flex flex-wrap items-end gap-3"
                      >
                        <input
                          type="hidden"
                          name="programmeId"
                          value={programme.id}
                        />
                        <div className="min-w-48 flex-1">
                          <label className="rule-label mb-1 block">Title</label>
                          <input
                            name="title"
                            defaultValue={programme.title}
                            required
                            minLength={3}
                            className={`${FIELD} w-full`}
                          />
                        </div>
                        <div className="min-w-64 flex-1">
                          <label className="rule-label mb-1 block">
                            Summary
                          </label>
                          <input
                            name="summary"
                            defaultValue={programme.summary}
                            required
                            className={`${FIELD} w-full`}
                          />
                        </div>
                        <div>
                          <label className="rule-label mb-1 block">
                            Status
                          </label>
                          <select
                            name="status"
                            defaultValue={programme.status}
                            className={FIELD}
                          >
                            <option value="DRAFT">DRAFT</option>
                            <option value="ACTIVE">ACTIVE</option>
                            <option value="ARCHIVED">ARCHIVED</option>
                          </select>
                        </div>
                        <button
                          type="submit"
                          className={buttonClass("secondary", "md")}
                        >
                          Save
                        </button>
                      </form>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        {!canPublish ? (
          <p className="mt-4 text-[11px] text-ink-400">
            Publishing is an administration act; you can build and edit drafts.
          </p>
        ) : null}
      </Panel>
      </>
      )}
    </div>
  );
}
