import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { Badge, Panel, buttonClass, statusTone } from "@/components/ui";
import { api, apiOrNotFound } from "@/lib/api";
import { act } from "@/lib/act";

interface Submission {
  id: string;
  status: string;
  version: number;
  contentMd: string;
  assessment: { code: string; title: string; kind: string };
  reviews: Array<{
    id: string;
    decision: string;
    comment: string;
    createdAt: string;
    reviewer: { name: string };
  }>;
}

export default async function SubmissionPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await apiOrNotFound<Submission>(`/submissions/${id}`);

  async function resubmit(formData: FormData) {
    "use server";
    await act(`/submissions/${id}/resubmit`, {
      method: "POST",
      body: { contentMd: String(formData.get("contentMd") ?? "") },
    });
    revalidatePath("/student/submissions");
    redirect("/student/submissions");
  }

  const returned = submission.status === "RETURNED";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="rule-label">{submission.assessment.code}</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {submission.assessment.title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          <Badge>v{submission.version}</Badge>
          <Badge tone={statusTone(submission.status)}>
            {submission.status}
          </Badge>
        </div>
      </div>

      {submission.reviews.length > 0 ? (
        <Panel
          title="Examiner comments"
          hint="Required in writing before any decision is recorded."
        >
          <ul className="space-y-3">
            {submission.reviews.map((review) => (
              <li
                key={review.id}
                className="border-l-2 border-brass-500/50 pl-3"
              >
                <p className="rule-label">
                  {review.decision} &middot; {review.reviewer.name} &middot;{" "}
                  {new Date(review.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-200">
                  {review.comment}
                </p>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Panel
        title={returned ? "Revise your submission" : "Your submission"}
        hint={
          returned
            ? "Resubmitting creates a new version. The returned draft and its comments are kept."
            : "This is read-only unless an examiner returns it to you."
        }
      >
        {returned ? (
          <form action={resubmit} className="space-y-3">
            <textarea
              name="contentMd"
              rows={16}
              defaultValue={submission.contentMd}
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-3 font-mono text-xs leading-relaxed outline-none focus:border-brass-500"
            />
            <button type="submit" className={buttonClass("primary", "lg")}>
              Resubmit for review
            </button>
          </form>
        ) : (
          <pre className="overflow-x-auto whitespace-pre-wrap rounded-lg border border-ink-800 p-3 font-mono text-xs leading-relaxed text-ink-200">
            {submission.contentMd}
          </pre>
        )}
      </Panel>

      <Link
        href="/student/submissions"
        className="text-xs text-ink-400 hover:text-ink-200"
      >
        Back to my work
      </Link>
    </div>
  );
}
