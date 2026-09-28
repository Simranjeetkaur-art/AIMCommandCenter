import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";

interface SimulatorRow {
  id: string;
  code: string;
  title: string;
  passMark: number;
  maxAttempts: number;
  attemptsUsed: number;
  programme: { code: string; title: string };
  total: number;
  inProgress: { id: string; answered: number } | null;
  bestScore: number | null;
  passed: boolean;
}

export default async function SimulatorsPage() {
  const simulators = await api<SimulatorRow[]>("/simulator");

  if (simulators.length === 0) {
    return (
      <Empty>
        No simulator is open to you yet. One appears here when you are enrolled
        on a track that has one.
      </Empty>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Practice under pressure</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          Command simulators
        </h1>
        <p className="mt-1 max-w-prose text-xs text-ink-400">
          One scenario at a time, in order, each one a command decision with a
          consequence. You are told straight away whether the call was right and
          why — that feedback is the point of the exercise. A decision stands
          once it is made.
        </p>
      </div>

      <div className="space-y-3">
        {simulators.map((simulator) => {
          const remaining = simulator.maxAttempts - simulator.attemptsUsed;
          const resumable = simulator.inProgress !== null;

          return (
            <Panel
              key={simulator.id}
              title={simulator.title}
              hint={`${simulator.programme.code} · ${simulator.total} missions · pass ${simulator.passMark}%`}
              action={
                simulator.passed ? (
                  <Badge tone="green">Passed</Badge>
                ) : resumable ? (
                  <Badge tone="amber">In progress</Badge>
                ) : remaining === 0 ? (
                  <Badge tone="red">No attempts left</Badge>
                ) : (
                  <Badge>Not started</Badge>
                )
              }
            >
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="min-w-48 flex-1">
                  {resumable ? (
                    <>
                      <p className="text-xs text-ink-400">
                        Mission {(simulator.inProgress?.answered ?? 0) + 1} of{" "}
                        {simulator.total}
                      </p>
                      <div className="mt-1.5 h-2 w-full overflow-hidden rounded-sm bg-ink-900">
                        <div
                          className="h-full rounded-r-[4px] bg-brass-500"
                          style={{
                            width: `${
                              simulator.total === 0
                                ? 0
                                : ((simulator.inProgress?.answered ?? 0) /
                                    simulator.total) *
                                  100
                            }%`,
                          }}
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-ink-400">
                      {simulator.bestScore === null
                        ? "Not attempted."
                        : `Best ${simulator.bestScore}%.`}{" "}
                      {remaining} of {simulator.maxAttempts} attempts remaining.
                    </p>
                  )}
                </div>

                <Link
                  href={`/student/simulator/${simulator.id}`}
                  className={buttonClass(
                    resumable || remaining > 0 ? "primary" : "secondary",
                    "md",
                  )}
                >
                  {resumable
                    ? "Resume run"
                    : remaining > 0
                      ? "Enter simulator"
                      : "View record"}
                </Link>
              </div>
            </Panel>
          );
        })}
      </div>
    </div>
  );
}
