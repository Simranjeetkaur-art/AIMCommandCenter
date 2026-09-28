import { Badge } from "./ui";

/**
 * The certification gate, as the prototype drew it: the ordered path from
 * prerequisite to credential, with each step resolved against this learner.
 */
export function CertificationGate({
  steps,
  levelLabel,
}: {
  steps: Array<{ label: string; met: boolean; optional?: boolean }>;
  levelLabel?: string;
}) {
  if (steps.length === 0) return null;

  // The path to the credential, and the work that sits alongside it. Drawn as
  // two rows rather than one chain, because an arrow between "Final Exam" and
  // "Simulator — practice" would claim an order that is not real: the
  // practice can be flown at any point and never holds the credential up.
  const required = steps.filter((s) => !s.optional);
  const optional = steps.filter((s) => s.optional);

  const chip = (step: { label: string; met: boolean }, dashed = false) => (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs ${
        step.met
          ? "border-signal-green/45 bg-signal-green/10 text-signal-green"
          : `${dashed ? "border-dashed " : ""}border-ink-800 text-ink-400`
      }`}
    >
      <span aria-hidden className="font-mono text-[10px]">
        {step.met ? "✓" : "○"}
      </span>
      {step.label}
    </span>
  );

  return (
    <section className="panel p-5">
      <header className="mb-4 flex items-center gap-3">
        <p className="rule-label">Certification gate</p>
        {levelLabel ? <Badge>{levelLabel}</Badge> : null}
      </header>

      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-2">
        {required.map((step, index) => (
          <li key={step.label} className="flex items-center gap-1.5">
            {chip(step)}
            {index < required.length - 1 ? (
              <span aria-hidden className="text-ink-700">
                →
              </span>
            ) : null}
          </li>
        ))}
      </ol>

      {optional.length > 0 ? (
        <div className="mt-4 border-t border-ink-800 pt-3">
          <p className="rule-label mb-2">
            Practice and optional &mdash; not required for the credential
          </p>
          <ul className="flex flex-wrap gap-1.5">
            {optional.map((step) => (
              <li key={step.label}>{chip(step, true)}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

/** Why a track is open, locked, or open only for development. */
export function AccessNotice({
  locked,
  devAccess,
  reason,
}: {
  locked: boolean;
  devAccess: boolean;
  reason: string;
}) {
  if (!locked && !devAccess) return null;

  const tone = locked
    ? "border-ink-700 bg-ink-900/60 text-ink-200"
    : "border-signal-amber/40 bg-signal-amber/10 text-signal-amber";

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <p className="text-sm font-semibold">
        {locked
          ? "🔒 Prerequisite required"
          : "🧪 Development access — training unlocked"}
      </p>
      <p className="mt-1 text-xs leading-relaxed text-ink-200">{reason}</p>
    </div>
  );
}
