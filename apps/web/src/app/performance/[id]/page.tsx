import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Badge, Panel, buttonClass } from "@/components/ui";
import { ReviewCard, type PerformanceReview } from "@/components/performance";
import { api, apiOrNotFound } from "@/lib/api";
import { act } from "@/lib/act";

export default async function ReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const review = await apiOrNotFound<PerformanceReview>(`/performance/${id}`);

  async function release() {
    "use server";
    await act(`/performance/${id}/release`, { method: "POST" });
    revalidatePath(`/performance/${id}`);
    revalidatePath("/performance");
  }

  async function acknowledge() {
    "use server";
    await act(`/performance/${id}/acknowledge`, { method: "POST" });
    revalidatePath(`/performance/${id}`);
    revalidatePath("/performance");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            Performance &middot; {review.cycle} &middot; {review.subject.role}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {review.subject.name}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            Assessed by {review.reviewer.name} &middot;{" "}
            {review.reviewer.role.toLowerCase()}
            {review.releasedAt
              ? ` · released ${new Date(review.releasedAt).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {review.status === "DRAFT" ? (
            <Badge tone="amber">draft</Badge>
          ) : review.acknowledgedAt ? (
            <Badge tone="green">acknowledged</Badge>
          ) : (
            <Badge tone="blue">released</Badge>
          )}
          {review.viewer.isReviewer && review.status === "DRAFT" ? (
            <Link
              href={`/performance/write/${review.subject.id}`}
              className={buttonClass("secondary", "md")}
            >
              Edit
            </Link>
          ) : null}
          <Link href="/performance" className={buttonClass("secondary", "md")}>
            All reviews
          </Link>
        </div>
      </div>

      {review.status === "DRAFT" ? (
        <p className="rounded-lg border border-signal-amber/30 bg-signal-amber/5 px-3 py-2 text-xs text-ink-300">
          This is a <b className="text-signal-amber">draft</b>.{" "}
          {review.subject.name} cannot see it. Releasing it hands it to them and
          fixes what it says &mdash; a released review is not rewritten under
          somebody who has already read it.
        </p>
      ) : null}

      <Panel title="The assessment" hint="">
        <ReviewCard review={review} />
      </Panel>

      {review.viewer.canRelease ? (
        <Panel
          title="Release it"
          hint="Hands it to the person it is about. Both written sections must be filled in first: a score with no account of it is not a review."
        >
          <form action={release}>
            <button type="submit" className={buttonClass("primary", "lg")}>
              Release to {review.subject.name}
            </button>
          </form>
        </Panel>
      ) : null}

      {review.viewer.canAcknowledge ? (
        <Panel
          title="Acknowledge"
          hint="Says you have read it. It does not mean you agree — it records that it reached you."
        >
          <form action={acknowledge}>
            <button type="submit" className={buttonClass("secondary", "md")}>
              I have read this
            </button>
          </form>
        </Panel>
      ) : null}

      {review.acknowledgedAt ? (
        <p className="text-xs text-ink-500">
          Acknowledged by {review.subject.name} on{" "}
          {new Date(review.acknowledgedAt).toLocaleString()}.
        </p>
      ) : null}

      <Link
        href="/performance"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to performance
      </Link>
    </div>
  );
}
