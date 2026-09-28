import Link from "next/link";
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

export default async function MyLearnersPage() {
  const learners = await api<Learner[]>("/learners");

  return (
    <Panel
      title="My learners"
      hint="Assigned to you by a programme manager. There is no way from this screen to reach anyone else."
    >
      {learners.length === 0 ? (
        <Empty>No learners are assigned to you.</Empty>
      ) : (
        <ul className="space-y-2">
          {learners.map((learner) => (
            <li key={learner.id}>
              <Link
                href={`/instructor/learners/${learner.id}`}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-3 transition hover:border-brass-500"
              >
                <div>
                  <p className="text-sm font-medium">{learner.name}</p>
                  <p className="mt-0.5 font-mono text-xs text-ink-400">
                    {learner.email}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {learner.enrollments[0] ? (
                    <Badge>{learner.enrollments[0].cohort.code}</Badge>
                  ) : null}
                  <span className="text-xs text-ink-400">
                    {learner._count.submissions} submissions
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
