/**
 * How the run stands, at a glance.
 *
 * Three numbers that answer three different questions, which is why they are
 * not one bar: how far through am I, how many have I got right, and can I
 * still pass. The score is stated against the whole run rather than against
 * what has been flown so far -- 8 right out of 10 flown is 8%, not 80%, and
 * showing 80% at mission ten would be a promise the run has not earned.
 */
export function MissionProgress({
  answered,
  total,
  correct,
  passMark,
}: {
  answered: number;
  total: number;
  correct: number;
  passMark: number;
}) {
  const flown = total === 0 ? 0 : (answered / total) * 100;
  const scored = total === 0 ? 0 : (correct / total) * 100;
  const ceiling =
    total === 0 ? 0 : ((correct + (total - answered)) / total) * 100;

  return (
    <section className="panel px-5 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <p className="text-xs text-ink-400">
          <span className="font-mono tabular-nums text-ink-100">
            {answered}
          </span>{" "}
          of {total} flown
        </p>
        <p className="text-xs text-ink-400">
          <span className="font-mono tabular-nums text-ink-100">{correct}</span>{" "}
          correct &middot; ceiling{" "}
          <span className="font-mono tabular-nums">{Math.round(ceiling)}%</span>{" "}
          &middot; pass {passMark}%
        </p>
      </div>

      {/* One track, two fills. The lighter one is everything decided; the
          brass one is the part of it that was right. The gap between them is
          the run's losses, readable without a legend. */}
      <div className="relative mt-2 h-2 w-full overflow-hidden rounded-sm bg-ink-900">
        <div
          className="absolute inset-y-0 left-0 bg-ink-700"
          style={{ width: `${flown}%` }}
        />
        <div
          className="absolute inset-y-0 left-0 bg-brass-500"
          style={{ width: `${scored}%` }}
        />
        {/* The pass mark, drawn on the same scale the fills are measured on. */}
        <div
          className="absolute inset-y-0 w-px bg-ink-200"
          style={{ left: `${passMark}%` }}
          aria-hidden="true"
        />
      </div>
    </section>
  );
}
