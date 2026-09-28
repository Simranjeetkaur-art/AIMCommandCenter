import Link from "next/link";
import { revalidatePath } from "next/cache";
import { EMPTY_LESSON_CONTENT, type LessonContent } from "@aim/contracts";
import { api, apiOrNotFound } from "@/lib/api";
import { Badge, buttonClass } from "@/components/ui";
import { LessonEditor } from "./editor";
import { act } from "@/lib/act";

interface AuthoringLesson {
  id: string;
  title: string;
  estimatedMinutes: number;
  visible: boolean;
  bodyMd: string;
  bodyHtml: string | null;
  content: LessonContent | null;
  module: {
    id: string;
    code: string | null;
    title: string;
    programmeVersion: {
      id: string;
      status: string;
      programme: { code: string; title: string };
    };
  };
}

export default async function LessonEditorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const lesson = await apiOrNotFound<AuthoringLesson>(`/academy/lessons/${id}/authoring`);
  const version = lesson.module.programmeVersion;
  const readOnly = version.status !== "DRAFT";

  async function save(formData: FormData) {
    "use server";
    const content = JSON.parse(
      String(formData.get("content") ?? "{}"),
    ) as LessonContent;

    await act(`/academy/lessons/${id}`, {
      method: "PATCH",
      body: { title: content.heading || undefined, content },
    });

    revalidatePath(`/authoring/lessons/${id}`);
    revalidatePath(`/authoring/tracks/${version.id}`);
    revalidatePath(`/student/lessons/${id}`);
  }

  async function setVisible(formData: FormData) {
    "use server";
    await act(`/academy/lessons/${id}/visibility`, {
      method: "PATCH",
      body: { visible: formData.get("visible") === "true" },
    });
    revalidatePath(`/authoring/lessons/${id}`);
    revalidatePath(`/authoring/tracks/${version.id}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            {version.programme.code} &middot;{" "}
            {lesson.module.code ?? lesson.module.title}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {lesson.title}
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-400">
            The lesson renders from this structure, not from markup &mdash; so
            an author edits text and the interface decides how text looks.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={readOnly ? "amber" : "neutral"}>{version.status}</Badge>
          {!lesson.visible ? <Badge tone="amber">hidden</Badge> : null}

          {/* Hiding is allowed on a published version: it stops the lesson
              being offered without changing what anyone was promised. */}
          <form action={setVisible}>
            <input
              type="hidden"
              name="visible"
              value={String(!lesson.visible)}
            />
            <button type="submit" className={buttonClass("secondary", "md")}>
              {lesson.visible ? "Hide from candidates" : "Show to candidates"}
            </button>
          </form>

          <Link
            href={`/student/lessons/${id}`}
            className={buttonClass("secondary", "md")}
          >
            Open the candidate&rsquo;s page
          </Link>
          <Link
            href={`/authoring/tracks/${version.id}`}
            className={buttonClass("secondary", "md")}
          >
            Back to track
          </Link>
        </div>
      </div>

      {readOnly ? (
        <p className="rounded-lg border border-signal-amber/30 bg-signal-amber/5 px-3 py-2 text-xs text-ink-300">
          This version is <b className="text-signal-amber">{version.status}</b>,
          so the lesson is read-only: candidates are being measured against it
          as it stands. Publishing is per version, not per lesson &mdash; take a
          new draft from the{" "}
          <Link
            href="/authoring"
            className="text-brass-500 underline underline-offset-2"
          >
            track screen
          </Link>{" "}
          to revise it.
        </p>
      ) : null}

      <LessonEditor
        action={save}
        initial={
          lesson.content ?? {
            ...EMPTY_LESSON_CONTENT,
            heading: lesson.title,
            // A lesson created from the track screen has only its plain body.
            // Start the first section from it, so the first save carries that
            // text into the structure instead of replacing it with nothing.
            sections: lesson.bodyMd.trim()
              ? [
                  {
                    number: "1",
                    heading: "",
                    paragraphs: lesson.bodyMd
                      .split(/\n\s*\n/)
                      .map((p) => p.trim())
                      .filter(Boolean),
                  },
                ]
              : [],
          }
        }
        readOnly={readOnly}
      />
    </div>
  );
}
