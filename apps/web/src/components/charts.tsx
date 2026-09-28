import type { ReactNode } from "react";

/**
 * The charts this application draws.
 *
 * Four rules run through all of them, and they are the reason these are
 * components rather than ad-hoc divs:
 *
 *  - The form follows the data's job. Magnitude is a bar in one hue; identity
 *    is the fixed four-slot series palette; state is the reserved signal
 *    colours; a single number is a tile, not a one-bar chart.
 *  - Colour is never the only channel. Every series is direct-labelled or
 *    named in a legend, and every chart can be read as a table.
 *  - Marks are thin and quiet: bars capped at 24px, 2px gaps in the surface
 *    colour between touching segments, hairline axes, no borders drawn round a
 *    mark to separate it.
 *  - Nothing is drawn over no data. An empty chart of zeros reads as a
 *    finding; these say plainly that there is nothing yet.
 */

/** The fixed series order. A fifth series folds into "Other" — see globals.css. */
export const SERIES = [
  "var(--color-series-1)",
  "var(--color-series-2)",
  "var(--color-series-3)",
  "var(--color-series-4)",
] as const;

export function seriesColour(index: number): string {
  return SERIES[index % SERIES.length];
}

/** Magnitude, light to dark. */
export const SCALE = [
  "var(--color-scale-1)",
  "var(--color-scale-2)",
  "var(--color-scale-3)",
  "var(--color-scale-4)",
  "var(--color-scale-5)",
] as const;

/** State. Reserved — never reused to tell two series apart. */
export const STATE = {
  good: "var(--color-signal-green)",
  warning: "var(--color-signal-amber)",
  critical: "var(--color-signal-red)",
  neutral: "var(--color-ink-700)",
} as const;

export interface Datum {
  label: string;
  value: number;
  /** Shown at the mark's tip instead of the raw value. */
  display?: string;
  /** Second line under the label. */
  note?: string;
  /** Overrides the sequential fill — use only for state, never for identity. */
  tone?: keyof typeof STATE;
  href?: string;
}

function Frame({
  title,
  hint,
  action,
  children,
}: {
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <figure className="m-0">
      <figcaption className="mb-3 flex items-start justify-between gap-3">
        <div>
          <p className="rule-label">{title}</p>
          {hint ? (
            <p className="mt-0.5 text-[11px] text-ink-400">{hint}</p>
          ) : null}
        </div>
        {action}
      </figcaption>
      {children}
    </figure>
  );
}

/** Says there is nothing, rather than drawing a chart of zeros. */
function NoData({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-lg border border-dashed border-ink-800 px-4 py-5 text-center text-xs text-ink-500">
      {children}
    </p>
  );
}

/**
 * Compare magnitude across a handful of named things.
 *
 * Horizontal because the names are long — a track code and title will not fit
 * under a column. One hue: these are the same measure on different rows, not
 * different series, so colour carries no identity and needs no legend.
 */
export function Bars({
  title,
  hint,
  data,
  max,
  unit = "",
  empty = "Nothing to show yet.",
  action,
}: {
  title: string;
  hint?: string;
  data: Datum[];
  /** Fixed scale ceiling. Defaults to the largest value present. */
  max?: number;
  unit?: string;
  empty?: string;
  action?: ReactNode;
}) {
  const ceiling = max ?? Math.max(...data.map((d) => d.value), 0);

  return (
    <Frame title={title} hint={hint} action={action}>
      {data.length === 0 || ceiling === 0 ? (
        <NoData>{empty}</NoData>
      ) : (
        <ul className="space-y-2.5">
          {data.map((datum) => {
            const share = ceiling === 0 ? 0 : (datum.value / ceiling) * 100;
            const fill = datum.tone
              ? STATE[datum.tone]
              : "var(--color-scale-2)";
            return (
              <li key={datum.label}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate text-xs text-ink-200">
                    {datum.label}
                    {datum.note ? (
                      <span className="ml-2 text-[11px] text-ink-500">
                        {datum.note}
                      </span>
                    ) : null}
                  </span>
                  {/* The value rides the mark rather than a number on every
                      gridline. Text wears an ink token, never the fill. */}
                  <span className="shrink-0 font-mono text-[11px] tabular-nums text-ink-300">
                    {datum.display ?? `${datum.value}${unit}`}
                  </span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-sm bg-ink-900">
                  <div
                    className="h-full rounded-r-[4px]"
                    style={{
                      width: `${Math.max(share, share > 0 ? 1 : 0)}%`,
                      background: fill,
                    }}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Frame>
  );
}

export interface Segment {
  label: string;
  value: number;
  tone?: keyof typeof STATE;
  colour?: string;
}

/**
 * Part-to-whole across one bar.
 *
 * Segments are separated by a 2px gap in the surface colour rather than a
 * stroke: a border adds ink that is not data. The legend always appears —
 * an interior segment has no free end to label.
 */
export function StackedBar({
  title,
  hint,
  segments,
  empty = "Nothing to divide up yet.",
  action,
}: {
  title: string;
  hint?: string;
  segments: Segment[];
  empty?: string;
  action?: ReactNode;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const shown = segments.filter((s) => s.value > 0);

  return (
    <Frame title={title} hint={hint} action={action}>
      {total === 0 ? (
        <NoData>{empty}</NoData>
      ) : (
        <>
          <div className="flex h-2.5 w-full gap-[2px] overflow-hidden rounded-sm bg-ink-900">
            {shown.map((segment, i) => (
              <div
                key={segment.label}
                title={`${segment.label}: ${segment.value}`}
                style={{
                  width: `${(segment.value / total) * 100}%`,
                  background:
                    segment.colour ??
                    (segment.tone ? STATE[segment.tone] : seriesColour(i)),
                }}
                className="first:rounded-l-sm last:rounded-r-sm"
              />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
            {segments.map((segment, i) => (
              <li
                key={segment.label}
                className="flex items-center gap-1.5 text-[11px] text-ink-400"
              >
                <span
                  aria-hidden
                  className="inline-block h-2 w-2 shrink-0 rounded-full"
                  style={{
                    background:
                      segment.colour ??
                      (segment.tone ? STATE[segment.tone] : seriesColour(i)),
                  }}
                />
                {segment.label}
                <span className="font-mono tabular-nums text-ink-300">
                  {segment.value}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </Frame>
  );
}

/**
 * A single ratio against a limit.
 *
 * A meter rather than a two-slice pie, and it carries the limit it is measured
 * against — a percentage with nothing to compare it to is half a fact.
 */
export function Meter({
  title,
  hint,
  value,
  of,
  unit = "",
  tone,
}: {
  title: string;
  hint?: string;
  value: number;
  of: number;
  unit?: string;
  tone?: keyof typeof STATE;
}) {
  const share = of === 0 ? 0 : Math.min(100, (value / of) * 100);

  return (
    <Frame title={title} hint={hint}>
      {of === 0 ? (
        <NoData>Nothing measured yet.</NoData>
      ) : (
        <>
          <p className="mb-1.5 text-2xl font-semibold tabular-nums">
            {value}
            {unit}
            <span className="ml-1.5 text-xs font-normal text-ink-500">
              of {of}
              {unit}
            </span>
          </p>
          <div className="h-2 w-full overflow-hidden rounded-sm bg-ink-900">
            <div
              className="h-full rounded-r-[4px]"
              style={{
                width: `${share}%`,
                background: tone ? STATE[tone] : "var(--color-scale-2)",
              }}
            />
          </div>
        </>
      )}
    </Frame>
  );
}

/**
 * The AIM Dx gauge: one index on a banded arc.
 *
 * Drawn rather than borrowed, because the bands are the point — the number
 * means nothing without the scale it sits on, and a bare figure would let a
 * 45.5 read as "fine". The arc is a 180° sweep so the needle's angle is
 * readable at a glance, and the figure is stated as text beside it for anyone
 * the arc does not reach.
 */
export function Gauge({
  value,
  max = 100,
  label,
  bands,
  size = 200,
}: {
  value: number | null;
  max?: number;
  label?: string;
  /** Ordered low → high, each with the share of the arc it occupies. */
  bands: Array<{ upTo: number; colour: string; label: string }>;
  size?: number;
}) {
  const r = 70;
  const cx = 100;
  const cy = 88;
  const stroke = 16;

  const point = (fraction: number, radius: number) => {
    const angle = Math.PI * (1 - Math.min(1, Math.max(0, fraction)));
    return [cx + radius * Math.cos(angle), cy - radius * Math.sin(angle)];
  };

  const arc = (from: number, to: number) => {
    const [x1, y1] = point(from, r);
    const [x2, y2] = point(to, r);
    return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
  };

  let cursor = 0;
  const segments = bands.map((band) => {
    const from = cursor;
    const to = band.upTo / max;
    cursor = to;
    return { ...band, from, to };
  });

  const fraction = value === null ? 0 : Math.min(1, Math.max(0, value / max));
  const [nx, ny] = point(fraction, r - stroke / 2 - 4);

  // The scale, so a reading can be taken off the arc itself: a small tick
  // every tenth, and a number at each end and at every band boundary.
  const outer = r + stroke / 2;
  const minorTicks = Array.from({ length: 11 }, (_, i) => i / 10);
  const scaleValues = [
    0,
    ...segments.map((segment) => Math.round(segment.to * max)),
  ]
    .filter((v, i, all) => all.indexOf(v) === i)
    // Where the reading lands on a scale number, the reading replaces it.
    .filter((v) => value === null || Math.abs(v - value) > max * 0.06);
  /** A scale number's position: outside the arc, or under the arc's two ends. */
  const scalePoint = (v: number): [number, number] => {
    const f = v / max;
    if (f <= 0) return [cx - r, cy + 11];
    if (f >= 1) return [cx + r, cy + 11];
    return point(f, outer + 10) as [number, number];
  };
  // Where the value itself is marked, just outside the scale numbers.
  const [vx, vy] =
    fraction <= 0.02 || fraction >= 0.98
      ? scalePoint(fraction <= 0.02 ? 0 : max)
      : point(fraction, outer + 19);

  return (
    <div className="flex flex-col items-center">
      <svg
        viewBox="-10 -18 220 126"
        width={size}
        height={(size * 126) / 220}
        role="img"
        aria-label={
          value === null
            ? `${label ?? "Index"}: not yet measured`
            : `${label ?? "Index"}: ${value} of ${max}`
        }
      >
        {segments.map((segment) => (
          <path
            key={segment.label}
            d={arc(segment.from, segment.to)}
            fill="none"
            stroke={segment.colour}
            strokeWidth={stroke}
            /* A 2px gap in the surface colour separates the bands, rather than
               a stroke drawn around each one. */
            strokeLinecap="butt"
            opacity={value === null ? 0.25 : 1}
          />
        ))}

        {minorTicks.map((f) => {
          const [x1, y1] = point(f, outer + 1);
          const [x2, y2] = point(f, outer + 4);
          return (
            <line
              key={`tick-${f}`}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="var(--color-ink-500)"
              strokeWidth={0.75}
            />
          );
        })}
        {scaleValues.map((v) => {
          const [tx, ty] = scalePoint(v);
          return (
            <text
              key={`scale-${v}`}
              x={tx}
              y={ty}
              fontSize={8}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-ink-400)"
              className="tabular-nums"
            >
              {v}
            </text>
          );
        })}

        {value !== null ? (
          <>
            {/* The reading, marked on the scale where the needle points. */}
            <text
              x={vx}
              y={vy}
              fontSize={9}
              fontWeight={700}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-ink-50)"
              className="tabular-nums"
            >
              {value}
            </text>
            <line
              x1={cx}
              y1={cy}
              x2={nx}
              y2={ny}
              stroke="var(--color-ink-50)"
              strokeWidth={2}
              strokeLinecap="round"
            />
            <circle cx={cx} cy={cy} r={5} fill="var(--color-ink-50)" />
            <circle cx={cx} cy={cy} r={2} fill="var(--color-ink-950)" />
          </>
        ) : null}
      </svg>

      <p className="-mt-1 text-center">
        <span className="text-3xl font-semibold tabular-nums">
          {value === null ? "—" : value}
        </span>
        <span className="ml-1 text-xs text-ink-500">/ {max}</span>
      </p>
      {label ? (
        <p className="mt-0.5 text-[11px] text-ink-400">{label}</p>
      ) : null}
    </div>
  );
}

/**
 * The dimension bars beside a gauge: every dimension, scored out of five.
 *
 * Sequential by score rather than categorical — these are the same measure
 * eleven times, and giving each its own hue would say they were different
 * kinds of thing.
 */
export function ScoreBars({
  title,
  hint,
  scores,
  outOf = 5,
  highlight,
}: {
  title?: string;
  hint?: string;
  scores: Array<{ label: string; score: number; note?: string }>;
  outOf?: number;
  /** Labels to mark as the ones driving the result. */
  highlight?: string[];
}) {
  const marked = new Set(highlight ?? []);

  const body = (
    <ul className="space-y-1.5">
      {scores.map((row) => {
        const share = (row.score / outOf) * 100;
        // More is more exposure, so the ramp darkens with the score.
        const step =
          SCALE[Math.min(SCALE.length - 1, Math.max(0, row.score - 1))];
        const isMarked = marked.has(row.label);
        return (
          <li key={row.label} className="flex items-center gap-3">
            <span
              className={`w-44 shrink-0 truncate text-[11px] ${
                isMarked ? "text-ink-100" : "text-ink-400"
              }`}
            >
              {row.label}
            </span>
            <span className="h-1.5 flex-1 overflow-hidden rounded-sm bg-ink-900">
              <span
                className="block h-full rounded-r-[4px]"
                style={{
                  width: `${share}%`,
                  background: isMarked ? "var(--color-signal-amber)" : step,
                }}
              />
            </span>
            <span className="w-8 shrink-0 text-right font-mono text-[11px] tabular-nums text-ink-300">
              {row.score}/{outOf}
            </span>
          </li>
        );
      })}
    </ul>
  );

  return title ? (
    <Frame title={title} hint={hint}>
      {body}
    </Frame>
  ) : (
    body
  );
}

/**
 * The same numbers as a table.
 *
 * Present on every chart, because colour and length are not available to
 * everyone and a figure nobody can read is not reported.
 */
export function ChartTable({
  caption,
  columns,
  rows,
}: {
  caption: string;
  columns: string[];
  rows: Array<Array<ReactNode>>;
}) {
  return (
    <details className="mt-3">
      <summary className="cursor-pointer text-[11px] text-ink-500 hover:text-brass-500">
        {caption}
      </summary>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full text-left text-[11px]">
          <thead className="rule-label">
            <tr className="border-b border-ink-800">
              {columns.map((column) => (
                <th key={column} className="py-1.5 pr-4 font-normal">
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr key={i} className="border-b border-ink-800/60">
                {row.map((cell, j) => (
                  <td key={j} className="py-1.5 pr-4 text-ink-300">
                    {cell}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
