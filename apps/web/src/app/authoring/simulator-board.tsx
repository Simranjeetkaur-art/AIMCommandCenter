import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";

interface Overview {
  simulators: Array<{
    id: string;
    code: string;
    title: string;
    passMark: number;
    maxAttempts: number;
    visible: boolean;
    poolSize: number;
    perRun: number;
    drawCount: number | null;
    runs: number;
    version: { id: string; number: number; status: string };
    programme: { id: string; code: string; title: string; level: number };
  }>;
  banks: Array<{
    id: string;
    title: string;
    programmeId: string | null;
    quiz: number;
    simulator: number;
  }>;
}

/**
 * The simulator side of the academy.
 *
 * A simulator is a paper of kind SIMULATION that draws its missions from the
 * simulator half of the track's question bank. The other half feeds the
 * module quizzes and the final examination, and no question sits in both, so
 * a candidate never meets a mission again as a quiz question.
 */
export async function SimulatorBoard() {
  const data = await api<Overview>("/simulator/authoring/overview");

  const bankFor = (programme: { id: string; code: string }) =>
    data.banks.find(
      (b) =>
        b.programmeId === programme.id ||
        b.title === `${programme.code} question bank`,
    );

  const sims = [...data.simulators].sort(
    (a, b) =>
      a.programme.level - b.programme.level ||
      b.version.number - a.version.number,
  );

  return (
    <div className="space-y-6">
      <Panel
        title="How a run is built"
        hint="Every run is drawn fresh, so no two candidates — and no two attempts — fly the same sequence."
      >
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            [
              "1",
              "One bank, two pools",
              "Each track's question bank is split into a Quiz & exam pool and a Simulator pool. A question lives in exactly one.",
            ],
            [
              "2",
              "Random draw per run",
              "A run draws its missions at random from the simulator pool, in a random order, and keeps that draw until it ends.",
            ],
            [
              "3",
              "Debrief every mission",
              "The candidate commits a decision, then sees the correct call and why. The run is scored against its pass mark.",
            ],
          ].map(([step, name, detail]) => (
            <li key={step} className="rounded-lg border border-ink-800 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brass-500 text-[11px] font-semibold text-ink-950">
                  {step}
                </span>
                <span className="text-sm font-medium">{name}</span>
              </div>
              <p className="mt-1.5 text-xs text-ink-400">{detail}</p>
            </li>
          ))}
        </ol>
      </Panel>

      <Panel
        title="Simulators"
        hint="Preview a simulator exactly as a run plays, with the key and debrief shown after each decision."
      >
        {sims.length === 0 ? (
          <Empty>
            No simulators yet. Add an assessment of kind Simulation to a track
            version.
          </Empty>
        ) : (
          <ul className="space-y-4">
            {sims.map((sim) => {
              const bank = bankFor(sim.programme);
              return (
                <li
                  key={sim.id}
                  className="rounded-xl border border-ink-800 p-4"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>Level {sim.programme.level}</Badge>
                        <span className="font-mono text-sm text-brass-500">
                          {sim.code}
                        </span>
                        <span className="text-base font-medium">
                          {sim.title}
                        </span>
                        {!sim.visible ? <Badge tone="amber">Hidden</Badge> : null}
                      </div>
                      <p className="mt-1 text-xs text-ink-400">
                        {sim.programme.code} — {sim.programme.title} · v
                        {sim.version.number}
                      </p>
                    </div>
                    <Badge
                      tone={
                        sim.version.status === "PUBLISHED" ? "green" : "amber"
                      }
                    >
                      {sim.version.status}
                    </Badge>
                  </div>

                  <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                    {[
                      ["Missions in pool", sim.poolSize],
                      ["Per run", sim.perRun],
                      ["Pass mark", `${sim.passMark}%`],
                      ["Attempts allowed", sim.maxAttempts],
                      ["Runs flown", sim.runs],
                    ].map(([label, value]) => (
                      <div
                        key={String(label)}
                        className="rounded-lg border border-ink-800 px-3 py-2"
                      >
                        <dt className="rule-label">{label}</dt>
                        <dd className="mt-0.5 text-sm font-semibold tabular-nums">
                          {value}
                        </dd>
                      </div>
                    ))}
                  </dl>

                  {sim.poolSize < sim.perRun * 2 && sim.poolSize > 0 ? (
                    <p className="mt-2 text-[11px] text-signal-amber">
                      The pool is less than twice the run length, so repeat
                      runs will overlap heavily. Add missions to the simulator
                      pool.
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap gap-2">
                    <Link
                      href={`/authoring/simulator/${sim.id}`}
                      className={buttonClass("primary", "md")}
                    >
                      Preview simulator
                    </Link>
                    <Link
                      href={`/authoring/assessments/${sim.id}`}
                      className={buttonClass("secondary", "md")}
                    >
                      Missions &amp; run length
                    </Link>
                    {bank ? (
                      <Link
                        href={`/authoring/banks/${bank.id}?pool=SIMULATOR`}
                        className={buttonClass("secondary", "md")}
                      >
                        Simulator pool ({bank.simulator})
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <Panel
        title="Question pools by track"
        hint="Quiz & exam questions and simulator missions never overlap. Move a question between pools from its bank."
      >
        {data.banks.length === 0 ? (
          <Empty>No question banks yet.</Empty>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-3">
            {data.banks.map((bank) => (
              <li key={bank.id}>
                <Link
                  href={`/authoring/banks/${bank.id}`}
                  className="panel block px-4 py-3 transition hover:border-brass-500"
                >
                  <p className="text-sm font-medium">{bank.title}</p>
                  <p className="mt-1 flex flex-wrap gap-2 text-xs text-ink-400">
                    <Badge tone="blue">Quiz &amp; exam {bank.quiz}</Badge>
                    <Badge tone="amber">Simulator {bank.simulator}</Badge>
                  </p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
