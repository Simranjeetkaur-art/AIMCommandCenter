import Link from "next/link";
import { REVIEW_SLA_HOURS } from "@aim/contracts";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, Stat, statusTone } from "@/components/ui";
import { Bars, Meter, StackedBar, type Datum } from "@/components/charts";
import { AttemptRequestsPanel } from "@/components/attempt-requests-panel";

interface QueueItem {
  id: string;
  status: string;
  version: number;
  submittedAt: string | null;
  slaDueAt: string | null;
  claimedById: string | null;
  user: { id: string; name: string };
  assessment: { code: string; title: string; kind: string };
}

/** Past its turnaround target. */
function isLate(item: QueueItem, now: number): boolean {
  return item.slaDueAt !== null && new Date(item.slaDueAt).getTime() < now;
}

/**
 * How much of the queue each paper accounts for.
 *
 * One measure across several papers, so one hue and no legend: the length
 * carries the whole comparison and a colour per paper would imply the papers
 * were different kinds of thing.
 */
function byAssessment(queue: QueueItem[]): Datum[] {
  const counts = new Map<string, { title: string; count: number }>();
  for (const item of queue) {
    const seen = counts.get(item.assessment.code);
    counts.set(item.assessment.code, {
      title: item.assessment.title,
      count: (seen?.count ?? 0) + 1,
    });
  }

  return [...counts.entries()]
    .map(([code, { title, count }]) => ({
      label: code,
      note: title,
      value: count,
      display: `${count} waiting`,
    }))
    .sort((a, b) => b.value - a.value);
}

export default async function ReviewQueuePage() {
  // The queue is built from the examiner's assignments. Work belonging to a
  // learner who is not theirs is not filtered out of the page -- it never
  // leaves the database.
  const queue = await api<QueueItem[]>("/review-queue");

  const now = Date.now();
  const overdue = queue.filter(
    (item) => item.slaDueAt && new Date(item.slaDueAt).getTime() < now,
  );
  const unclaimed = queue.filter((item) => !item.claimedById);

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="In your queue" value={queue.length} />
        <Stat label="Unclaimed" value={unclaimed.length} />
        <Stat
          label="Overdue"
          value={overdue.length}
          note={`${REVIEW_SLA_HOURS}h turnaround`}
        />
      </div>

      {queue.length > 0 ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Panel title="The shape of your queue" hint="">
            {/* State, not identity — so the reserved signal colours, and each
                segment named in the legend rather than left to colour. */}
            <StackedBar
              title="What is waiting on you"
              hint="Overdue first, because that is the part with a person waiting at the other end."
              segments={[
                { label: "Overdue", value: overdue.length, tone: "critical" },
                {
                  label: "Claimed, in time",
                  value: queue.filter((i) => i.claimedById && !isLate(i, now))
                    .length,
                  tone: "good",
                },
                {
                  label: "Unclaimed",
                  value: queue.filter((i) => !i.claimedById && !isLate(i, now))
                    .length,
                  tone: "warning",
                },
              ]}
              empty="Nothing is waiting on you."
            />

            <div className="mt-5">
              <Meter
                title="Claimed"
                hint="An unclaimed submission is one nobody has taken responsibility for yet."
                value={queue.length - unclaimed.length}
                of={queue.length}
                tone={unclaimed.length === 0 ? "good" : "warning"}
              />
            </div>
          </Panel>

          <Panel title="Where the work is coming from" hint="">
            <Bars
              title="Submissions waiting, by assessment"
              hint="One measure across several papers, so one hue: the colour says nothing here, the length does."
              data={byAssessment(queue)}
              empty="Nothing is waiting on you."
            />
          </Panel>
        </div>
      ) : null}

      {/* Learners of yours who have run out of attempts and asked for more. */}
      <AttemptRequestsPanel
        learnerHref={(learnerId) => `/instructor/learners/${learnerId}`}
      />

      <Panel
        title="Review queue"
        hint="Only learners assigned to you. Your own submissions never appear here."
      >
        {queue.length === 0 ? (
          <Empty>Nothing is waiting on you.</Empty>
        ) : (
          <ul className="space-y-2">
            {queue.map((item) => {
              const late =
                item.slaDueAt && new Date(item.slaDueAt).getTime() < now;
              return (
                <li key={item.id}>
                  <Link
                    href={`/instructor/review/${item.id}`}
                    className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 transition hover:border-brass-500 ${
                      late
                        ? "border-signal-red/40 bg-signal-red/5"
                        : "border-ink-800"
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs text-brass-500">
                          {item.assessment.code}
                        </span>
                        <span className="text-sm font-medium">
                          {item.assessment.title}
                        </span>
                        <Badge>v{item.version}</Badge>
                      </div>
                      <p className="mt-0.5 text-xs text-ink-400">
                        {item.user.name}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {late ? <Badge tone="red">Overdue</Badge> : null}
                      {item.claimedById ? (
                        <Badge tone="blue">Claimed by you</Badge>
                      ) : null}
                      <Badge tone={statusTone(item.status)}>
                        {item.status}
                      </Badge>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
}
