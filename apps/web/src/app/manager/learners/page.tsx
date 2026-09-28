import { api } from "@/lib/api";
import { Badge, Empty, Panel } from "@/components/ui";

interface Learner {
  id: string;
  name: string;
  email: string;
  status: string;
  _count: { submissions: number; credentials: number };
  enrollments: Array<{
    status: string;
    cohort: { code: string; title: string };
  }>;
}

export default async function ManagerLearnersPage() {
  // Same route as the instructor portal calls. The manager holds
  // progress.read.all, so the scope service places no restriction and the
  // whole roll comes back. Same code, different answer, by permission.
  const learners = await api<Learner[]>("/learners");

  return (
    <Panel
      title="All learners"
      hint="Everyone on the roll. Progress is visible; judgement is not available."
    >
      {learners.length === 0 ? (
        <Empty>No learners enrolled.</Empty>
      ) : (
        <ul className="space-y-2">
          {learners.map((learner) => (
            <li
              key={learner.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-3"
            >
              <div>
                <p className="text-sm font-medium">{learner.name}</p>
                <p className="mt-0.5 font-mono text-xs text-ink-400">
                  {learner.email}
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs text-ink-400">
                {learner.enrollments.map((enrollment) => (
                  <Badge key={enrollment.cohort.code}>
                    {enrollment.cohort.code}
                  </Badge>
                ))}
                <span>{learner._count.submissions} submissions</span>
                <span>{learner._count.credentials} credentials</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
