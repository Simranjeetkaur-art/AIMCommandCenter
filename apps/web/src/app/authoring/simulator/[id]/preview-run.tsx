"use client";

import { useEffect, useState } from "react";
import { Badge, buttonClass } from "@/components/ui";

export interface PreviewMission {
  id: string;
  number: number;
  stem: string;
  options: Array<{ id: string; text: string }>;
  correctOptionId: string | null;
  explanation: string | null;
  band: string | null;
  title: string | null;
}

const letter = (i: number) => String.fromCharCode(65 + i);

function shuffle<T>(items: readonly T[]): T[] {
  const deck = [...items];
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/**
 * A run, flown in the browser. The draw happens here rather than on the
 * server because nothing about a preview needs recording; "New run" draws
 * again, which is also how an author sees that runs really do differ.
 */
export function PreviewRun({
  missions,
  perRun,
  passMark,
}: {
  missions: PreviewMission[];
  perRun: number;
  passMark: number;
}) {
  const [mode, setMode] = useState<"run" | "pool">("run");
  const [seed, setSeed] = useState(0);
  // Drawn after mount, never during render: a random draw on the server and
  // another in the browser would disagree, and React would discard the page.
  const [run, setRun] = useState<PreviewMission[]>([]);
  useEffect(() => {
    setRun(
      shuffle(missions)
        .slice(0, perRun)
        .map((m) => ({ ...m, options: shuffle(m.options) })),
    );
  }, [missions, perRun, seed]);
  const [at, setAt] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState("");

  const restart = () => {
    setSeed((s) => s + 1);
    setAt(0);
    setAnswers({});
  };

  const correct = run.filter(
    (m) => answers[m.id] && answers[m.id] === m.correctOptionId,
  ).length;
  const drawing = run.length === 0 && missions.length > 0;
  const finished = !drawing && at >= run.length;
  const mission = run[at];
  const given = mission ? answers[mission.id] : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-lg border border-ink-800 p-1">
          {(
            [
              ["run", "Fly a run"],
              ["pool", `Whole pool (${missions.length})`],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              aria-pressed={mode === key}
              onClick={() => setMode(key)}
              className={buttonClass("toggle", "sm")}
            >
              {label}
            </button>
          ))}
        </div>
        {mode === "run" ? (
          <div className="flex items-center gap-3 text-xs text-ink-400">
            <span className="font-mono tabular-nums">
              {run.filter((m) => answers[m.id]).length} / {run.length} flown ·{" "}
              {correct} correct
            </span>
            <button
              type="button"
              onClick={restart}
              className={buttonClass("secondary", "sm")}
            >
              New run
            </button>
          </div>
        ) : (
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter missions"
            className="w-56 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-1.5 text-xs outline-none focus:border-brass-500"
          />
        )}
      </div>

      {missions.length === 0 ? (
        <p className="rounded-lg border border-dashed border-ink-800 px-4 py-6 text-center text-xs text-ink-400">
          This simulator has no missions in its pool yet.
        </p>
      ) : mode === "run" && drawing ? (
        <p className="text-xs text-ink-400">Drawing a run…</p>
      ) : mode === "pool" ? (
        <ol className="space-y-3">
          {missions
            .filter((m) =>
              `${m.title ?? ""} ${m.band ?? ""} ${m.stem}`
                .toLowerCase()
                .includes(filter.toLowerCase()),
            )
            .map((m) => (
              <li key={m.id}>
                <MissionView mission={m} label={`Mission ${m.number}`} reveal />
              </li>
            ))}
        </ol>
      ) : finished ? (
        <section className="panel p-5">
          <p className="rule-label">Run complete</p>
          <p className="mt-2 text-3xl font-semibold tabular-nums">
            {run.length === 0 ? 0 : Math.round((correct / run.length) * 100)}%
          </p>
          <p className="mt-1 text-sm">
            {correct} of {run.length} correct —{" "}
            {Math.round((correct / Math.max(run.length, 1)) * 100) >= passMark ? (
              <Badge tone="green">Would pass</Badge>
            ) : (
              <Badge tone="red">Would not pass</Badge>
            )}{" "}
            <span className="text-xs text-ink-400">at {passMark}%</span>
          </p>
          <button
            type="button"
            onClick={restart}
            className={`${buttonClass("primary", "md")} mt-4`}
          >
            Fly another run
          </button>
        </section>
      ) : (
        <MissionView
          mission={mission}
          label={`Mission ${String(at + 1).padStart(2, "0")} / ${run.length}`}
          given={given}
          reveal={given !== undefined}
          onPick={(optionId) =>
            setAnswers((a) => ({ ...a, [mission.id]: optionId }))
          }
          onNext={() => setAt((n) => n + 1)}
          last={at + 1 >= run.length}
        />
      )}
    </div>
  );
}

function MissionView({
  mission,
  label,
  given,
  reveal,
  onPick,
  onNext,
  last,
}: {
  mission: PreviewMission;
  label: string;
  given?: string;
  reveal: boolean;
  onPick?: (optionId: string) => void;
  onNext?: () => void;
  last?: boolean;
}) {
  const right = given !== undefined && given === mission.correctOptionId;
  return (
    <section
      className={`panel p-5 ${
        reveal && given !== undefined
          ? `border-l-2 ${right ? "border-l-signal-green" : "border-l-signal-red"}`
          : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {mission.band ? <p className="rule-label">{mission.band}</p> : <span />}
        <p className="font-mono text-xs text-ink-400">{label}</p>
      </div>
      {given !== undefined ? (
        <p
          className={`mt-2 text-sm font-semibold ${right ? "text-signal-green" : "text-signal-red"}`}
        >
          {right ? "Correct command decision" : "Not the command decision"}
        </p>
      ) : null}
      {mission.title ? (
        <h2 className="mt-2 text-lg font-semibold tracking-tight">
          {mission.title}
        </h2>
      ) : null}
      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-100">
        {mission.stem}
      </p>

      <ul className="mt-4 space-y-1.5">
        {mission.options.map((option, index) => {
          const isKey = reveal && option.id === mission.correctOptionId;
          const chosen = option.id === given;
          const tone = isKey
            ? "border-signal-green/50 bg-signal-green/10"
            : chosen
              ? "border-signal-red/50 bg-signal-red/10"
              : "border-ink-800";
          const body = (
            <>
              <span className="mt-px shrink-0 font-mono text-xs text-brass-500">
                {letter(index)}
              </span>
              <span className="flex-1">{option.text}</span>
              {isKey ? (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-signal-green">
                  {chosen ? "Picked · correct" : "Correct"}
                </span>
              ) : chosen ? (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-signal-red">
                  Picked
                </span>
              ) : null}
            </>
          );
          return (
            <li key={option.id}>
              {onPick && !reveal ? (
                <button
                  type="button"
                  onClick={() => onPick(option.id)}
                  className="flex w-full items-start gap-3 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-left text-sm transition hover:border-brass-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
                >
                  {body}
                </button>
              ) : (
                <div
                  className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${tone}`}
                >
                  {body}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {reveal ? (
        mission.explanation ? (
          <div className="mt-4 rounded-lg border border-ink-800 bg-ink-950/40 p-4">
            <p className="rule-label">Why this is the command decision</p>
            <p className="mt-1.5 text-sm leading-relaxed text-ink-200">
              {mission.explanation}
            </p>
          </div>
        ) : (
          <p className="mt-4 text-xs text-ink-500">
            No written rationale for this mission. Candidates see the correct
            option only.
          </p>
        )
      ) : null}

      {onNext && reveal ? (
        <button
          type="button"
          onClick={onNext}
          className={`${buttonClass("primary", "md")} mt-4`}
        >
          {last ? "See the result" : "Next mission"}
        </button>
      ) : null}
    </section>
  );
}
