import { revalidatePath } from "next/cache";
import { api, apiOrNull } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { act, done } from "@/lib/act";
import { SubmitButton } from "@/components/submit-button";
import { AttemptRequestsPanel } from "@/components/attempt-requests-panel";

interface Turnaround {
  slaHours: number;
  openCount: number;
  overdueCount: number;
  unclaimedCount: number;
  overdue: Array<{
    id: string;
    submittedAt: string | null;
    slaDueAt: string | null;
    user: { id: string; name: string };
    claimedBy: { id: string; name: string } | null;
    assessment: { code: string; title: string };
  }>;
  /** Every review still waiting on a decision, overdue or not. */
  open: Array<{
    id: string;
    status: string;
    submittedAt: string | null;
    slaDueAt: string | null;
    user: { id: string; name: string };
    claimedBy: { id: string; name: string } | null;
    assessment: { code: string; title: string };
  }>;
  reviewers: Array<{
    instructorId: string;
    name: string;
    decided: number;
    averageHours: number;
  }>;
}

interface Instructor {
  id: string;
  name: string;
  email: string;
}

export default async function TurnaroundPage() {
  const [report, instructors] = await Promise.all([
    api<Turnaround>("/reports/turnaround"),
    // Null for a role preview, which never borrows instructor.assign: the
    // page then renders read-only, with nobody to assign to, instead of failing.
    apiOrNull<Instructor[]>("/users/instructors").then((rows) => rows ?? []),
  ]);

  /**
   * Reassignment is the one review-shaped thing a manager may do. It moves who
   * is holding an item; it cannot set a decision or a score, and there is no
   * field on this form that could.
   */
  async function reassign(formData: FormData) {
    "use server";
    await act(`/submissions/${String(formData.get("submissionId"))}/reassign`, {
      method: "POST",
      body: {
        instructorId: String(formData.get("instructorId")),
        reason: String(formData.get("reason") ?? ""),
      },
    });
    revalidatePath("/manager/turnaround");
    await done("Reassigned. The new examiner can now see and mark this work.");
  }

  const overdueIds = new Set(report.overdue.map((item) => item.id));
  const current = report.open.filter((item) => !overdueIds.has(item.id));

  /** One review's reassign control. Absent in a role preview: nobody to pick. */
  function ReassignForm({ itemId }: { itemId: string }) {
    if (instructors.length === 0) return null;
    return (
      <form action={reassign} className="mt-3 flex flex-wrap items-end gap-2">
        <input type="hidden" name="submissionId" value={itemId} />
        <div>
          <label
            htmlFor={`reassign-to-${itemId}`}
            className="rule-label mb-1 block"
          >
            Reassign to
          </label>
          <select
            id={`reassign-to-${itemId}`}
            name="instructorId"
            required
            className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
          >
            {instructors.map((instructor) => (
              <option key={instructor.id} value={instructor.id}>
                {instructor.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-48">
          <label
            htmlFor={`reassign-reason-${itemId}`}
            className="rule-label mb-1 block"
          >
            Reason (recorded)
          </label>
          <input
            id={`reassign-reason-${itemId}`}
            name="reason"
            required
            minLength={10}
            placeholder="Original examiner on leave"
            className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
          />
        </div>
        <SubmitButton variant="secondary">Reassign</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Open reviews" value={report.openCount} />
        <Stat
          label="Overdue"
          value={report.overdueCount}
          note={`${report.slaHours}h SLA`}
        />
        <Stat label="Unclaimed" value={report.unclaimedCount} />
      </div>

      <Panel
        title="Overdue reviews"
        hint="An item nobody has picked up is an operational failure, not a judgement about the candidate."
      >
        {report.overdue.length === 0 ? (
          <Empty>Nothing is overdue.</Empty>
        ) : (
          <ul className="space-y-3">
            {report.overdue.map((item) => (
              <li
                key={item.id}
                className="rounded-lg border border-signal-red/30 bg-signal-red/5 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-brass-500">
                      {item.assessment.code}
                    </span>
                    <span className="ml-2 text-sm">
                      {item.assessment.title}
                    </span>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {item.user.name} &middot; due{" "}
                      {item.slaDueAt
                        ? new Date(item.slaDueAt).toLocaleDateString()
                        : "n/a"}
                    </p>
                  </div>
                  <Badge tone="red">
                    {item.claimedBy
                      ? `Held by ${item.claimedBy.name}`
                      : "Unclaimed"}
                  </Badge>
                </div>

                <ReassignForm itemId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Other open reviews"
        hint="Everything still waiting on a decision and not yet overdue. Reassign when an examiner is away or the load is uneven, not only once a deadline has passed."
      >
        {current.length === 0 ? (
          <Empty>No other review is waiting.</Empty>
        ) : (
          <ul className="space-y-3">
            {current.map((item) => (
              <li key={item.id} className="rounded-lg border border-ink-800 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <span className="font-mono text-xs text-brass-500">
                      {item.assessment.code}
                    </span>
                    <span className="ml-2 text-sm">
                      {item.assessment.title}
                    </span>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {item.user.name} &middot; due{" "}
                      {item.slaDueAt
                        ? new Date(item.slaDueAt).toLocaleDateString()
                        : "n/a"}
                    </p>
                  </div>
                  <Badge tone={item.claimedBy ? "neutral" : "amber"}>
                    {item.claimedBy
                      ? `Held by ${item.claimedBy.name}`
                      : "Unclaimed"}
                  </Badge>
                </div>
                <ReassignForm itemId={item.id} />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <AttemptRequestsPanel />

      <Panel title="Examiner turnaround" hint="Decisions in the last 30 days.">
        {report.reviewers.length === 0 ? (
          <Empty>No decisions recorded yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {report.reviewers.map((reviewer) => (
              <li
                key={reviewer.instructorId}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
              >
                <span>{reviewer.name}</span>
                <span className="flex items-center gap-4 font-mono tabular-nums text-ink-400">
                  <span>{reviewer.decided} decided</span>
                  <span
                    className={
                      reviewer.averageHours > report.slaHours
                        ? "text-signal-red"
                        : "text-signal-green"
                    }
                  >
                    {reviewer.averageHours}h avg
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
