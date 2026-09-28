import Link from "next/link";
import { Badge, Empty } from "@/components/ui";
import { ChartTable, Gauge, ScoreBars } from "@/components/charts";

/**
 * The bands a person's index sits on.
 *
 * Green at the TOP, and this is the whole reason the constant is declared
 * separately from the AAI's. The exposure gauge runs the other way — a high
 * AAI means authority is concentrated and red is the alarming end. Reusing
 * that arc here would paint an exemplary examiner as a critical risk on an
 * identical-looking dial.
 */
export const PERFORMANCE_ARC = [
  { upTo: 40, colour: "var(--color-signal-red)", label: "Developing" },
  { upTo: 65, colour: "var(--color-signal-amber)", label: "Proficient" },
  { upTo: 85, colour: "var(--color-series-1)", label: "Strong" },
  { upTo: 100, colour: "var(--color-signal-green)", label: "Exemplary" },
];

export interface PerformanceReview {
  id: string;
  cycle: string;
  index: number;
  band: string;
  bandLabel: string;
  bandTone: "red" | "amber" | "blue" | "green";
  strengths: string;
  concerns: string;
  actions: string;
  status: "DRAFT" | "RELEASED";
  releasedAt: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  subject: { id: string; name: string; email: string; role: string };
  reviewer: { id: string; name: string; role: string };
  dimensions: Array<{
    key: string;
    name: string;
    description: string;
    score: number | null;
  }>;
  viewer: {
    isSubject: boolean;
    isReviewer: boolean;
    canRelease: boolean;
    canAcknowledge: boolean;
  };
}

const TONE_BADGE = {
  red: "red",
  amber: "amber",
  blue: "blue",
  green: "green",
} as const;

/** One review, in full: the index on its arc, the dimensions, the words. */
export function ReviewCard({
  review,
  children,
}: {
  review: PerformanceReview;
  children?: React.ReactNode;
}) {
  return (
    <div className="space-y-5">
      <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
        <div>
          <Gauge
            value={review.index}
            label={review.bandLabel}
            bands={PERFORMANCE_ARC}
            size={200}
          />

          {/* The scale, named. Higher is better here, and the list says so
              rather than leaving it to the colour. */}
          <ul className="mt-3 space-y-1">
            {PERFORMANCE_ARC.map((arc, i) => {
              const from = i === 0 ? 0 : PERFORMANCE_ARC[i - 1].upTo;
              const current = review.index >= from && review.index < arc.upTo;
              return (
                <li
                  key={arc.label}
                  className={`flex items-center gap-2 rounded-md px-2 py-1 text-[11px] ${
                    current ? "bg-ink-800/60 text-ink-100" : "text-ink-400"
                  }`}
                >
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: arc.colour }}
                  />
                  <span className="w-14 font-mono tabular-nums">
                    {from}&ndash;{arc.upTo}
                  </span>
                  {arc.label}
                  {current ? (
                    <span className="ml-auto text-brass-500">this review</span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>

        <div>
          <ScoreBars
            title={`${review.subject.role.charAt(0)}${review.subject.role.slice(1).toLowerCase()} dimensions`}
            hint="Each scored 1 to 5 against what that rung is judged on."
            scores={review.dimensions.map((dimension) => ({
              label: dimension.name,
              score: dimension.score ?? 0,
            }))}
            highlight={review.dimensions
              .filter((d) => (d.score ?? 0) <= 2)
              .map((d) => d.name)}
          />

          <ChartTable
            caption="Read the dimensions as a table"
            columns={["Dimension", "Score", "What it measures"]}
            rows={review.dimensions.map((d) => [
              d.name,
              `${d.score ?? "—"} / 5`,
              d.description,
            ])}
          />
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Written title="Strengths" body={review.strengths} />
        <Written title="To work on" body={review.concerns} />
        <Written title="Next" body={review.actions} />
      </div>

      {children}
    </div>
  );
}

function Written({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-ink-800 p-3">
      <p className="rule-label mb-1.5">{title}</p>
      {body.trim() ? (
        <p className="text-xs leading-relaxed text-ink-200">{body}</p>
      ) : (
        <p className="text-xs text-ink-500">Not written yet.</p>
      )}
    </div>
  );
}

/** A review in a list: enough to decide whether to open it. */
export function ReviewRow({
  review,
  href,
}: {
  review: PerformanceReview;
  href: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2.5 text-xs transition hover:border-brass-500"
      >
        <span className="flex flex-wrap items-center gap-2.5">
          <span className="font-mono text-ink-500">{review.cycle}</span>
          <span className="text-ink-200">{review.subject.name}</span>
          <Badge>{review.subject.role}</Badge>
          {review.status === "DRAFT" ? (
            <Badge tone="amber">draft</Badge>
          ) : review.acknowledgedAt ? (
            <Badge tone="green">read</Badge>
          ) : (
            <Badge tone="blue">released</Badge>
          )}
        </span>
        <span className="flex items-center gap-2 text-ink-400">
          <Badge tone={TONE_BADGE[review.bandTone]}>{review.bandLabel}</Badge>
          <span className="w-12 text-right font-mono tabular-nums">
            {review.index}
          </span>
          <span className="hidden sm:inline">by {review.reviewer.name}</span>
        </span>
      </Link>
    </li>
  );
}

export function NoReviews({ who }: { who: string }) {
  return <Empty>{who}</Empty>;
}
