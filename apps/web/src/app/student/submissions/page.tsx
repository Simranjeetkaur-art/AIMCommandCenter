import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, statusTone } from "@/components/ui";

interface Submission {
  id: string;
  status: string;
  version: number;
  score: number | null;
  submittedAt: string | null;
  contentMd: string;
  assessment: { code: string; title: string; kind: string };
  reviews: Array<{
    id: string;
    decision: string;
    comment: string;
    createdAt: string;
  }>;
}

export default async function MySubmissionsPage() {
  // /submissions/mine carries submission.read.self. There is no query
  // parameter on this route that could name another candidate.
  const submissions = await api<Submission[]>("/submissions/mine");

  if (submissions.length === 0) {
    return (
      <Empty>
        You have not sent any written work to an examiner yet. Practicals and
        capstones are submitted from their paper in the Academy.
      </Empty>
    );
  }

  return (
    <Panel
      title="Submissions"
      hint="Written work you sent to an examiner — practicals and capstones — with every decision and comment in full. Quizzes and the simulator are marked automatically and are not listed here."
    >
      <ul className="space-y-3">
        {submissions.map((submission) => (
          <li
            key={submission.id}
            className="rounded-lg border border-ink-800 p-4"
          >
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="font-mono text-xs text-brass-500">
                  {submission.assessment.code}
                </span>
                <Link
                  href={`/student/submissions/${submission.id}`}
                  className="text-sm font-medium hover:text-brass-500"
                >
                  {submission.assessment.title}
                </Link>
                <Badge>v{submission.version}</Badge>
              </div>
              <div className="flex items-center gap-2">
                {submission.score !== null ? (
                  <span className="font-mono text-sm tabular-nums">
                    {submission.score}%
                  </span>
                ) : null}
                <Badge tone={statusTone(submission.status)}>
                  {submission.status}
                </Badge>
              </div>
            </div>

            {submission.reviews.length > 0 ? (
              <ul className="mt-3 space-y-2">
                {submission.reviews.map((review) => (
                  <li
                    key={review.id}
                    className="border-l-2 border-ink-700 pl-3 text-xs leading-relaxed text-ink-200"
                  >
                    <span className="rule-label">{review.decision}</span>
                    <p className="mt-1">{review.comment}</p>
                  </li>
                ))}
              </ul>
            ) : null}

            {submission.status === "RETURNED" ? (
              <Link
                href={`/student/submissions/${submission.id}`}
                className="mt-3 inline-block rounded-lg bg-brass-500 px-3 py-1.5 text-xs font-semibold text-ink-950"
              >
                Revise and resubmit
              </Link>
            ) : (
              <Link
                href={`/student/submissions/${submission.id}`}
                className="mt-3 inline-block text-xs text-ink-400 hover:text-brass-500"
              >
                Read what you submitted →
              </Link>
            )}
          </li>
        ))}
      </ul>
    </Panel>
  );
}
