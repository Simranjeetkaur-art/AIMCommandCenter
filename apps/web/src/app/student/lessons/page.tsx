import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, Panel } from "@/components/ui";
import type { LearnerRecord } from "../types";

interface Programme {
  id: string;
  code: string;
  title: string;
  summary: string;
  versions: Array<{ id: string; version: number; status: string }>;
}

interface Outline {
  id: string;
  version: number;
  programme: { code: string; title: string };
  modules: Array<{
    id: string;
    title: string;
    summary: string;
    lessons: Array<{
      id: string;
      title: string;
      position: number;
      estimatedMinutes: number;
    }>;
  }>;
}

export default async function LessonsPage() {
  const [programmes, record] = await Promise.all([
    api<Programme[]>("/academy/programmes"),
    api<LearnerRecord>("/me/record"),
  ]);

  const done = new Set(
    record.progress
      .filter((p) => p.status === "COMPLETED")
      .map((p) => p.lesson.id),
  );

  const versionIds = programmes
    .flatMap((p) => p.versions)
    .filter((v) => v.status === "PUBLISHED")
    .map((v) => v.id);

  const outlines = await Promise.all(
    versionIds.map((id) => api<Outline>(`/academy/versions/${id}/outline`)),
  );

  if (outlines.length === 0) {
    return <Empty>No published programme is available to you.</Empty>;
  }

  return (
    <div className="space-y-6">
      {outlines.map((outline) => (
        <Panel
          key={outline.id}
          title={outline.programme.title}
          hint={`${outline.programme.code} · version ${outline.version}`}
        >
          <div className="space-y-5">
            {outline.modules.map((module) => (
              <div key={module.id}>
                <h3 className="text-xs font-semibold tracking-tight text-ink-200">
                  {module.title}
                </h3>
                {module.summary ? (
                  <p className="mt-0.5 text-xs text-ink-400">
                    {module.summary}
                  </p>
                ) : null}
                <ul className="mt-2 space-y-1.5">
                  {module.lessons.map((lesson) => (
                    <li key={lesson.id}>
                      <Link
                        href={`/student/lessons/${lesson.id}`}
                        className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-sm transition hover:border-brass-500"
                      >
                        <span className="flex items-center gap-2.5">
                          <span className="font-mono text-xs text-ink-400">
                            {String(lesson.position).padStart(2, "0")}
                          </span>
                          {lesson.title}
                        </span>
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-ink-400">
                            {lesson.estimatedMinutes} min
                          </span>
                          {done.has(lesson.id) ? (
                            <Badge tone="green">Done</Badge>
                          ) : null}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Panel>
      ))}
    </div>
  );
}
