import Link from "next/link";
import { apiOrNull } from "@/lib/api";
import { Badge, Empty, FIELD, Panel } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { decideAttemptRequest } from "@/app/attempt-requests/actions";

interface AttemptRequestRow {
  id: string;
  reason: string;
  createdAt: string;
  attemptsUsed: number;
  attemptsAllowed: number;
  bestScore: number | null;
  user: { id: string; name: string; email: string };
  assessment: { id: string; code: string; title: string; passMark: number };
}

/**
 * Learners who have used every attempt on a paper without passing and asked
 * for more. An examiner sees their own learners; a manager or administrator
 * sees everyone. Renders nothing for a role that cannot decide these, and
 * nothing when there is nothing waiting.
 */
export async function AttemptRequestsPanel({
  learnerHref,
}: {
  /** Where a learner's name links to, if this portal has a learner page. */
  learnerHref?: (learnerId: string) => string;
}) {
  const rows = await apiOrNull<AttemptRequestRow[]>(
    "/assessments/attempt-requests",
  );
  if (rows === null) return null;

  return (
    <Panel
      title="Requests for another attempt"
      hint="Each learner here has used every attempt on a paper without passing. Grant one to three more, or decline — your note goes to them either way."
    >
      {rows.length === 0 ? (
        <Empty>Nobody is waiting for a decision.</Empty>
      ) : (
        <ul className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="rounded-lg border border-ink-800 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">
                    {learnerHref ? (
                      <Link
                        href={learnerHref(row.user.id)}
                        className="hover:text-brass-500"
                      >
                        {row.user.name}
                      </Link>
                    ) : (
                      row.user.name
                    )}{" "}
                    <span className="font-mono text-xs text-ink-400">
                      {row.user.email}
                    </span>
                  </p>
                  <p className="mt-0.5 text-xs text-ink-400">
                    <span className="font-mono text-brass-500">
                      {row.assessment.code}
                    </span>{" "}
                    {row.assessment.title} &middot; {row.attemptsUsed} of{" "}
                    {row.attemptsAllowed} attempts used &middot; best{" "}
                    {row.bestScore === null ? "—" : `${row.bestScore}%`} (needs{" "}
                    {row.assessment.passMark}%)
                  </p>
                </div>
                <Badge tone="amber">
                  Asked {new Date(row.createdAt).toLocaleDateString()}
                </Badge>
              </div>
              <blockquote className="mt-2 border-l-2 border-ink-700 pl-3 text-xs leading-relaxed text-ink-200">
                {row.reason}
              </blockquote>

              <form
                action={decideAttemptRequest}
                className="mt-3 flex flex-wrap items-end gap-2"
              >
                <input type="hidden" name="requestId" value={row.id} />
                <input type="hidden" name="learner" value={row.user.name} />
                <div>
                  <label
                    htmlFor={`extra-${row.id}`}
                    className="rule-label mb-1 block"
                  >
                    Extra attempts
                  </label>
                  <select
                    id={`extra-${row.id}`}
                    name="extraAttempts"
                    defaultValue="1"
                    className={FIELD}
                  >
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                  </select>
                </div>
                <div className="min-w-56 flex-1">
                  <label
                    htmlFor={`note-${row.id}`}
                    className="rule-label mb-1 block"
                  >
                    Note to the learner (at least 10 characters)
                  </label>
                  <input
                    id={`note-${row.id}`}
                    name="reason"
                    required
                    minLength={10}
                    maxLength={1000}
                    placeholder="What to revise before trying again"
                    className={`w-full ${FIELD}`}
                  />
                </div>
                <SubmitButton name="decision" value="GRANT">
                  Grant
                </SubmitButton>
                <SubmitButton name="decision" value="DECLINE" variant="danger">
                  Decline
                </SubmitButton>
              </form>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
