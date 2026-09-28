import Link from "next/link";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, apiOrNull, getSession } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { ReviewRow, type PerformanceReview } from "@/components/performance";

interface Subjects {
  reviewsRole: string | null;
  dimensions: Array<{ key: string; name: string; description: string }>;
  people: Array<{ id: string; name: string; email: string; role: string }>;
}

export default async function PerformancePage() {
  const session = await getSession();
  const canWrite = session.permissions.includes(P.PERFORMANCE_WRITE);

  const [reviews, subjects] = await Promise.all([
    api<PerformanceReview[]>("/performance"),
    canWrite ? api<Subjects>("/performance/subjects") : Promise.resolve(null),
  ]);

  const aboutMe = reviews.filter((r) => r.viewer.isSubject);
  const written = reviews.filter((r) => r.viewer.isReviewer);
  const belowMe = reviews.filter(
    (r) => !r.viewer.isSubject && !r.viewer.isReviewer,
  );
  const unread = aboutMe.filter((r) => !r.acknowledgedAt);

  // Who has no review yet this reviewer has not written one about.
  const covered = new Set(written.map((r) => r.subject.id));
  const notYet = (subjects?.people ?? []).filter((p) => !covered.has(p.id));

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Performance</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Assessment of people
        </h1>
        <p className="mt-1 max-w-2xl text-xs text-ink-400">
          Distinct from marking work. Each rung assesses the rung below it: an
          examiner assesses the candidates assigned to them, a manager assesses
          the examiners, the institution assesses the managers. Nobody assesses
          themselves, and nobody assesses upward.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="About you"
          value={aboutMe.length}
          note={
            unread.length > 0
              ? `${unread.length} not yet acknowledged`
              : undefined
          }
        />
        <Stat
          label="You have written"
          value={written.length}
          note={
            canWrite && notYet.length > 0
              ? `${notYet.length} still to do`
              : undefined
          }
        />
        <Stat label="Below you" value={belowMe.length} />
      </div>

      <Panel
        title="About you"
        hint="A review appears here once the person who wrote it has released it to you."
      >
        {aboutMe.length === 0 ? (
          <Empty>Nothing has been released to you yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {aboutMe.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                href={`/performance/${review.id}`}
              />
            ))}
          </ul>
        )}
      </Panel>

      {canWrite && subjects ? (
        <Panel
          title={`Your ${subjects.reviewsRole?.toLowerCase() ?? ""} assessments`}
          hint={`You assess ${subjects.reviewsRole} records, on ${subjects.dimensions.length} dimensions. A draft stays yours until you release it.`}
          action={<Badge>{subjects.people.length} people</Badge>}
        >
          {written.length > 0 ? (
            <ul className="mb-4 space-y-2">
              {written.map((review) => (
                <ReviewRow
                  key={review.id}
                  review={review}
                  href={`/performance/${review.id}`}
                />
              ))}
            </ul>
          ) : null}

          {subjects.people.length === 0 ? (
            <Empty>
              Nobody is assigned to you yet, so there is nobody to assess.
            </Empty>
          ) : (
            <>
              <p className="rule-label mb-2">
                {notYet.length > 0 ? "Not yet assessed" : "Start a new cycle"}
              </p>
              <ul className="flex flex-wrap gap-2">
                {(notYet.length > 0 ? notYet : subjects.people).map(
                  (person) => (
                    <li key={person.id}>
                      <Link
                        href={`/performance/write/${person.id}`}
                        className={buttonClass("secondary", "md")}
                      >
                        {person.name}
                        <span className="ml-2 text-ink-500">
                          {notYet.includes(person) ? "assess" : "new cycle"}{" "}
                          &rarr;
                        </span>
                      </Link>
                    </li>
                  ),
                )}
              </ul>
            </>
          )}
        </Panel>
      ) : null}

      {belowMe.length > 0 ? (
        <Panel
          title="Down the chain"
          hint="What the people below you wrote, and what was written about them. Drafts included — that is what oversight is for."
        >
          <ul className="space-y-2">
            {belowMe.map((review) => (
              <ReviewRow
                key={review.id}
                review={review}
                href={`/performance/${review.id}`}
              />
            ))}
          </ul>
        </Panel>
      ) : null}
    </div>
  );
}
