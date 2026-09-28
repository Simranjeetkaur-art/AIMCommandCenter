import Link from "next/link";
import { revalidatePath } from "next/cache";
import { hasLessonContent, type LessonContent } from "@aim/contracts";
import { ApiError, apiOrNotFound, apiOrNull } from "@/lib/api";
import { Panel, buttonClass } from "@/components/ui";
import { LessonView } from "@/components/lesson-view";
import { act, done } from "@/lib/act";
import { SubmitButton } from "@/components/submit-button";
import { LessonJump, type OutlineModule } from "./lesson-nav";

interface Neighbour {
  id: string;
  title: string;
  moduleTitle: string;
  moduleCode: string | null;
  modulePosition: number;
}

interface Lesson {
  id: string;
  title: string;
  bodyMd: string;
  bodyHtml: string | null;
  content: LessonContent | null;
  estimatedMinutes: number;
  module: {
    id: string;
    code: string | null;
    title: string;
    programmeVersion: { programme: { code: string; title: string } };
  };
  outline: OutlineModule[];
  position: number | null;
  total: number;
  previous: Neighbour | null;
  next: Neighbour | null;
}

export default async function LessonPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  let lesson: Lesson;
  try {
    lesson = await apiOrNotFound<Lesson>(`/academy/lessons/${id}`);
  } catch (error) {
    // A lesson on a track the candidate has not been let into. The server says
    // why ("Locked. …"); the page repeats it rather than failing.
    if (error instanceof ApiError && error.status === 403) {
      return (
        <Panel title="This lesson is locked">
          <p className="text-sm leading-relaxed text-ink-200">
            {error.message}
          </p>
          <Link
            href="/student/academy"
            className={`mt-3 inline-flex ${buttonClass("secondary", "md")}`}
          >
            Back to the academy
          </Link>
        </Panel>
      );
    }
    throw error;
  }
  const track = lesson.module.programmeVersion.programme;
  const trackHref = `/student/academy/${track.code}`;

  // Whether this learner has already completed it. Null for a role preview,
  // which has no record of its own; the button then simply offers the action.
  const record = await apiOrNull<{
    progress: Array<{ status: string; lesson: { id: string } }>;
  }>("/me/record");
  const completed = Boolean(
    record?.progress.some(
      (p) => p.lesson.id === id && p.status === "COMPLETED",
    ),
  );

  /** A learner marks their own progress. Nobody marks it for them. */
  async function markComplete() {
    "use server";
    await act("/me/progress", {
      method: "PUT",
      body: { lessonId: id, status: "COMPLETED" },
    });
    revalidatePath(`/student/academy/${track.code}`);
    revalidatePath("/student");
    revalidatePath(`/student/lessons/${id}`);
    await done("Lesson marked complete.");
  }

  /** Undoing it, because a lesson marked by a slip is otherwise permanent. */
  async function markIncomplete() {
    "use server";
    await act("/me/progress", {
      method: "PUT",
      body: { lessonId: id, status: "IN_PROGRESS" },
    });
    revalidatePath(`/student/academy/${track.code}`);
    revalidatePath("/student");
    revalidatePath(`/student/lessons/${id}`);
    await done("Marked as still in progress.");
  }

  return (
    <article className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <nav
            aria-label="Breadcrumb"
            className="rule-label flex flex-wrap items-center gap-1.5"
          >
            <Link href="/student/academy" className="hover:text-brass-500">
              Academy
            </Link>
            <span aria-hidden="true">›</span>
            <Link href={trackHref} className="hover:text-brass-500">
              {track.code}
            </Link>
            <span aria-hidden="true">›</span>
            <span className="text-ink-200">
              {lesson.module.code ?? lesson.module.title}
            </span>
          </nav>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {lesson.title}
          </h1>
          {lesson.content?.eyebrow ? (
            <p className="mt-1 font-mono text-xs text-brass-500">
              {lesson.content.eyebrow}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-ink-400">
            About {lesson.estimatedMinutes} minutes
            {lesson.position ? (
              <>
                {" "}
                &middot; lesson{" "}
                <span className="font-mono tabular-nums">
                  {lesson.position} of {lesson.total}
                </span>{" "}
                in this track
              </>
            ) : null}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link href={trackHref} className={buttonClass("secondary", "md")}>
            Back to {track.code}
          </Link>
          <LessonJump outline={lesson.outline} currentId={lesson.id} />
        </div>
      </div>

      {hasLessonContent(lesson.content) ? (
        /*
         * The lesson renders from structure, which is what the authoring
         * screens edit. Nothing from the database becomes markup here, so a
         * lesson carries text and the interface decides how text looks.
         */
        <LessonView content={lesson.content} />
      ) : lesson.bodyHtml ? (
        /*
         * Course markup, authored by us and seeded through the importer, which
         * strips every inline handler and script on the way in. It is not user
         * input and never has been: no route writes to this column.
         */
        <div
          className="aimLesson panel p-6"
          dangerouslySetInnerHTML={{ __html: lesson.bodyHtml }}
        />
      ) : (
        <Panel title="Lesson">
          <div className="space-y-3 text-sm leading-relaxed text-ink-200">
            {lesson.bodyMd.split("\n\n").map((block, i) => (
              <p key={i}>{block.replace(/^#+\s*/, "")}</p>
            ))}
          </div>
        </Panel>
      )}

      {/*
       * The end of the lesson is where the reader decides what happens next:
       * record that they have read it, or move on. Both live here, in that
       * order, rather than the completion control sitting alone and the way
       * onwards being a trip back to the track page.
       */}
      <div className="panel flex flex-wrap items-center justify-between gap-4 p-4">
        {completed ? (
          <form action={markIncomplete} className="flex items-center gap-3">
            <span
              role="status"
              className="inline-flex items-center gap-2 rounded-lg border border-signal-green/40 bg-signal-green/10 px-3 py-2 text-sm font-medium text-signal-green"
            >
              <span aria-hidden="true">✓</span> Completed
            </span>
            <SubmitButton
              variant="quiet"
              size="sm"
              pendingLabel="Saving…"
              className="text-ink-400 hover:text-ink-100"
            >
              Mark as not complete
            </SubmitButton>
          </form>
        ) : (
          <form action={markComplete}>
            <SubmitButton size="lg" pendingLabel="Saving…">
              Mark complete
            </SubmitButton>
          </form>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {lesson.previous ? (
            <Link
              href={`/student/lessons/${lesson.previous.id}`}
              className={buttonClass("secondary", "md")}
            >
              <span aria-hidden="true">←</span> Previous
              <span className="sr-only">: {lesson.previous.title}</span>
            </Link>
          ) : null}
          {lesson.next ? (
            <Link
              href={`/student/lessons/${lesson.next.id}`}
              className={buttonClass(completed ? "primary" : "secondary", "md")}
            >
              Next <span aria-hidden="true">→</span>
              <span className="sr-only">: {lesson.next.title}</span>
            </Link>
          ) : (
            <Link href={trackHref} className={buttonClass("primary", "md")}>
              Finish &amp; back to {track.code}
            </Link>
          )}
        </div>
      </div>

      {lesson.next ? (
        <p className="text-xs text-ink-400">
          Up next:{" "}
          <Link
            href={`/student/lessons/${lesson.next.id}`}
            className="text-brass-500 hover:underline"
          >
            {lesson.next.title}
          </Link>
          <span className="text-ink-500">
            {" "}
            &middot;{" "}
            {lesson.next.moduleCode ??
              `Module ${lesson.next.modulePosition}`}
          </span>
        </p>
      ) : null}
    </article>
  );
}
