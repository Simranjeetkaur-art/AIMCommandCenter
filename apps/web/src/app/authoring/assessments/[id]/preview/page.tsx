import Link from "next/link";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, apiOrNotFound } from "@/lib/api";
import { requirePermission } from "@/lib/portal";
import { Badge, Empty, Panel } from "@/components/ui";
import {
  AssessmentRunner,
  type PaperQuestion,
} from "@/app/student/assessments/[id]/runner";

interface Paper {
  id: string;
  code: string;
  title: string;
  kind: string;
  passMark: number;
  requiresReview: boolean;
  maxAttempts: number;
  visible: boolean;
  questions: PaperQuestion[];
}

/**
 * The paper, as a candidate receives it.
 *
 * This calls `/assessments/:id/paper` -- the candidate's own route, not an
 * authoring one -- so what is on screen is what the server would send them,
 * including the fact that the answer key is absent from the payload rather
 * than merely unrendered. An author checking their wording is checking the
 * real thing.
 *
 * A hidden paper still previews here. That is the point of a preview: an
 * author has to be able to read what they have not yet published.
 */
export default async function AssessmentPreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  await requirePermission(P.ASSESSMENT_READ);

  const paper = await apiOrNotFound<Paper>(`/assessments/${id}/paper`);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">Preview as a candidate</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            <span className="font-mono text-brass-500">{paper.code}</span>
            <span className="ml-2">{paper.title}</span>
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {paper.questions.length} question
            {paper.questions.length === 1 ? "" : "s"} &middot; pass mark{" "}
            {paper.passMark}% &middot;{" "}
            {paper.maxAttempts === 0
              ? "unlimited attempts"
              : `${paper.maxAttempts} attempt${paper.maxAttempts === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge>{paper.kind}</Badge>
          {paper.requiresReview ? (
            <Badge tone="amber">Examiner marked</Badge>
          ) : null}
          {paper.visible ? null : <Badge tone="amber">Hidden</Badge>}
        </div>
      </div>

      {paper.questions.length === 0 ? (
        <Panel title="Nothing to sit">
          <Empty>
            This paper has no questions on it yet, so a candidate opening it
            would see an empty sheet.
          </Empty>
        </Panel>
      ) : (
        <AssessmentRunner questions={paper.questions} readOnly />
      )}

      <Link
        href={`/authoring/assessments/${id}`}
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to the paper
      </Link>
    </div>
  );
}
