import Link from "next/link";
import { revalidatePath } from "next/cache";
import { MIN_REVIEW_COMMENT_LENGTH } from "@aim/contracts";
import { Badge, Panel, buttonClass, statusTone } from "@/components/ui";
import { DecisionForm } from "./decision-form";
import { api, apiOrNotFound } from "@/lib/api";
import { act, done } from "@/lib/act";

interface Submission {
  id: string;
  status: string;
  version: number;
  contentMd: string;
  score: number | null;
  claimedById: string | null;
  submittedAt: string | null;
  user: { id: string; name: string; email: string };
  assessment: { code: string; title: string; kind: string; passMark: number };
  reviews: Array<{
    id: string;
    decision: string;
    comment: string;
    score: number | null;
    createdAt: string;
    reviewer: { name: string };
  }>;
}

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const submission = await apiOrNotFound<Submission>(`/submissions/${id}`);

  async function claim() {
    "use server";
    await act(`/submissions/${id}/claim`, { method: "POST" });
    revalidatePath(`/instructor/review/${id}`);
  }

  async function decide(formData: FormData) {
    "use server";
    const decision = String(formData.get("decision"));
    const comment = String(formData.get("comment") ?? "");
    const score = formData.get("score");

    const path =
      decision === "approve"
        ? `/submissions/${id}/approve`
        : decision === "return"
          ? `/submissions/${id}/return`
          : `/submissions/${id}/grade`;

    const body =
      decision === "return"
        ? { comment }
        : decision === "approve"
          ? { comment, ...(score ? { score: Number(score) } : {}) }
          : { comment, score: Number(score ?? 0) };

    await act(path, { method: "POST", body });
    revalidatePath("/instructor");
    // Back to the queue, saying what was recorded and about whom: the item
    // leaving the list is otherwise the only sign anything happened.
    const verb =
      decision === "approve"
        ? "Approved"
        : decision === "return"
          ? "Returned for revision"
          : "Graded";
    await done(
      `${verb}: ${submission.assessment.code} by ${submission.user.name}. The candidate can see your rationale.`,
      "/instructor",
    );
  }

  const claimed = Boolean(submission.claimedById);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            {submission.assessment.code} &middot; {submission.assessment.kind}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {submission.assessment.title}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {submission.user.name} &middot; version {submission.version}{" "}
            &middot; pass mark {submission.assessment.passMark}%
          </p>
        </div>
        <Badge tone={statusTone(submission.status)}>{submission.status}</Badge>
      </div>

      <Panel title="Submitted work">
        <pre className="max-h-[32rem] overflow-auto whitespace-pre-wrap rounded-lg border border-ink-800 p-4 font-mono text-xs leading-relaxed text-ink-200">
          {submission.contentMd}
        </pre>
      </Panel>

      {submission.reviews.length > 0 ? (
        <Panel title="Earlier decisions">
          <ul className="space-y-3">
            {submission.reviews.map((review) => (
              <li key={review.id} className="border-l-2 border-ink-700 pl-3">
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

      {!claimed ? (
        <Panel
          title="Claim this item"
          hint="A decision is made by the examiner holding the item. Claiming is one statement, so two examiners cannot take the same item."
        >
          <form action={claim}>
            <button type="submit" className={buttonClass("primary", "lg")}>
              Claim for review
            </button>
          </form>
        </Panel>
      ) : (
        <Panel
          title="Decision"
          hint={`Every decision carries a written rationale of at least ${MIN_REVIEW_COMMENT_LENGTH} characters. The server refuses a shorter one.`}
        >
          <DecisionForm action={decide} kind={submission.assessment.kind} />
        </Panel>
      )}

      <Link
        href="/instructor"
        className="text-xs text-ink-400 hover:text-ink-200"
      >
        Back to queue
      </Link>
    </div>
  );
}
