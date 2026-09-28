import Link from "next/link";
import { revalidatePath } from "next/cache";
import {
  AAI_BANDS,
  AIM_ENVELOPE,
  bandFor,
  buildRx,
  type RxActionClassKey,
} from "@aim/contracts";
import { api, apiOrNull, apiOrNotFound } from "@/lib/api";
import { Badge, Panel, Stat, buttonClass } from "@/components/ui";
import { ChartTable, Gauge, ScoreBars } from "@/components/charts";
import { RxHelp } from "../rx-help";
import { act } from "@/lib/act";

/**
 * The risk scale the gauge is drawn on, low to high.
 *
 * `upTo` is geometry -- where the arc segment ends. `from` and `to` are what
 * the reader is shown, and they stop one short of the next band, because
 * printing "0-25" above "25-50" reads as though 25 belongs to both.
 */
const BAND_COLOUR: Record<string, string> = {
  LOWER: "var(--color-signal-green)",
  MODERATE: "var(--color-signal-amber)",
  ELEVATED: "var(--color-scale-3)",
  CRITICAL: "var(--color-signal-red)",
};

const AAI_ARC = AAI_BANDS.map((b) => ({
  upTo: Math.ceil(b.max),
  colour: BAND_COLOUR[b.band] ?? "var(--color-ink-700)",
  label: b.label,
  from: b.min,
  to: Math.floor(b.max),
}));

interface Diagnostic {
  id: string;
  agentName: string;
  agentOwner: string;
  agentPurpose: string;
  aai: number;
  band: string;
  isPractice: boolean;
  createdAt: string;
  agent: { id: string; code: string; name: string } | null;
  createdBy: { name: string };
  dimensions: Array<{
    key: string;
    name: string;
    description: string;
    score: number | null;
  }>;
}

/**
 * The stored prescription.
 *
 * The richer control fields are optional because prescriptions written before
 * they existed are still valid records, and a page that throws on one of them
 * would be hiding work somebody did.
 */
interface Prescription {
  id: string;
  narrative: string;
  envelope: Record<string, string>;
  actionClasses: Record<string, string[]>;
  controls: Array<{
    rank: number;
    dimension: string;
    score: number;
    fix: string;
    effect: string;
    severity?: string;
    lead?: string;
    note?: string;
    target?: number;
  }>;
  createdBy: { name: string };
}

const TONES = {
  LOWER: "green",
  MODERATE: "amber",
  ELEVATED: "amber",
  CRITICAL: "red",
} as const;

const CLASS_TONE: Record<RxActionClassKey, "green" | "amber" | "blue" | "red"> =
  {
    A: "green",
    G: "amber",
    H: "blue",
    X: "red",
  };

function severityTone(score: number): "red" | "amber" | "neutral" {
  if (score >= 5) return "red";
  if (score >= 3) return "amber";
  return "neutral";
}

/** The numbered step tag each Rx section carries, as the prototype had it. */
function Step({ children }: { children: string }) {
  return <span className="rule-label">{children}</span>;
}

export default async function RxPage({
  params,
}: {
  params: Promise<{ diagnosticId: string }>;
}) {
  const { diagnosticId } = await params;

  const [dx, rx] = await Promise.all([
    apiOrNotFound<Diagnostic>(`/diagnostics/${diagnosticId}`),
    apiOrNull<Prescription>(`/prescriptions/${diagnosticId}`),
  ]);

  async function prescribe() {
    "use server";
    await act("/prescriptions", { method: "POST", body: { diagnosticId } });
    revalidatePath(`/governance/rx/${diagnosticId}`);
  }

  const band = bandFor(dx.aai);
  const tone = TONES[dx.band as keyof typeof TONES] ?? "neutral";
  const scores = dx.dimensions.map((d) => d.score ?? 0);
  const total = scores.reduce((n, s) => n + s, 0);

  // The evaluation is re-derived from the same scores the server prescribed
  // from. It is a pure function of those scores, so the reading below and the
  // record the server stored cannot say different things.
  const evaluation = buildRx({
    agent: {
      name: dx.agentName,
      owner: dx.agentOwner,
      purpose: dx.agentPurpose,
    },
    aai: dx.aai,
    scores,
  });

  // Prefer what was prescribed; fall back to the derivation where an older
  // prescription has nothing stored for a field.
  const controls =
    rx && rx.controls.length > 0 ? rx.controls : evaluation.controls;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">AIM™ Rx — Evaluation &amp; Remedy</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {dx.agentName}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {dx.agentOwner} &middot; {dx.agentPurpose}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {dx.agent ? (
            <Badge tone="blue">{dx.agent.code}</Badge>
          ) : (
            <Badge>Practice</Badge>
          )}
          <Badge tone={tone}>{band.label}</Badge>
          <RxHelp />
        </div>
      </div>

      <Panel
        title="AIM™ Autonomy Index"
        hint="A comparison index, not deployment permission. The number means nothing without the scale it sits on."
      >
        <div className="grid gap-6 lg:grid-cols-[auto_1fr] lg:items-start">
          <div>
            <Gauge
              value={dx.aai}
              label={band.label}
              bands={AAI_ARC}
              size={220}
            />

            {/* What the band means. The label on its own gets read as a
                grade, which is the one thing the index is not. */}
            <p className="mt-2 text-xs leading-relaxed text-ink-400">
              {band.note}
            </p>

            {/* The risk scale, named. Four states, each with its label beside
                its colour — the band is never carried by colour alone. */}
            <ul className="mt-3 space-y-1">
              {AAI_ARC.map((arc) => {
                const current = dx.aai >= arc.from && dx.aai <= arc.to;
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
                      {arc.from}–{arc.to}
                    </span>
                    {arc.label}
                    {current ? (
                      <span className="ml-auto text-brass-500">this agent</span>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>

          <div>
            <ScoreBars
              title="Authority concentrations"
              hint="The eleven dimensions as scored. Highest first: those are what the remedy addresses."
              scores={[...dx.dimensions]
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((dim) => ({ label: dim.name, score: dim.score ?? 0 }))}
              highlight={dx.dimensions
                .filter((dim) => (dim.score ?? 0) >= 4)
                .map((dim) => dim.name)}
            />

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Stat label="Observed total" value={`${total} / 55`} />
              <Stat
                label="Diagnosed by"
                value={dx.createdBy.name}
                note={new Date(dx.createdAt).toLocaleDateString()}
              />
            </div>

            <ChartTable
              caption="Read the eleven dimensions as a table"
              columns={["Dimension", "Score", "What it measures"]}
              rows={[...dx.dimensions]
                .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
                .map((dim) => [dim.name, `${dim.score} / 5`, dim.description])}
            />
          </div>
        </div>
      </Panel>

      {!rx ? (
        <Panel
          title="Prescribe"
          hint="Rx is derived from the diagnosis: it names the specific authority to reduce, not general advice."
        >
          <form action={prescribe}>
            <button type="submit" className={buttonClass("primary", "lg")}>
              Build controls from this diagnosis
            </button>
          </form>
        </Panel>
      ) : (
        <>
          {/* The Dx result, restated where the prescription begins, so the
              reading below is never separated from the score it came from. */}
          <section className="panel flex flex-wrap items-start gap-6 p-5">
            <div className="shrink-0">
              <p className="rule-label">Dx result</p>
              <p className="mt-1 flex items-baseline gap-1.5">
                <span className="font-mono text-4xl font-semibold tabular-nums text-brass-500">
                  {dx.aai}
                </span>
                <span className="text-sm text-ink-400">/100</span>
              </p>
              <Badge tone={tone}>{band.label}</Badge>
            </div>
            <div className="min-w-64 flex-1">
              <h2 className="text-sm font-semibold tracking-tight">
                Executive summary
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-200">
                {rx.narrative}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <p className="text-xs text-ink-400">
                  Prescribed by {rx.createdBy.name}.
                </p>
                {/* The remedy is derived, so it can always be derived again.
                    A prescription written under an older derivation is not
                    wrong, but it should be possible to bring it up to date
                    without first having to score the agent a second time. */}
                <form action={prescribe}>
                  <button type="submit" className={buttonClass("quiet", "sm")}>
                    Rebuild from this diagnosis
                  </button>
                </form>
              </div>
            </div>
          </section>

          <Panel
            title="Situation analysis"
            hint="What AIM™ Dx is telling us about this agent."
            action={<Step>1 · Evaluation</Step>}
          >
            <div className="space-y-3 text-sm leading-relaxed text-ink-200">
              <p>
                <span className="font-medium">Overall evaluation. </span>
                {dx.agentName} has an AAI of{" "}
                <span className="font-mono text-brass-500">{dx.aai}</span>. Its
                most significant authority concentrations are{" "}
                {evaluation.situation.concentrations.join(", ")}. The primary
                concern is the <span className="font-medium">combination</span>{" "}
                of these capabilities: {evaluation.situation.combination} A
                single error, manipulated instruction, compromised credential or
                misunderstood objective could therefore propagate into a
                consequential action.
              </p>
              <p>
                <span className="font-medium">Management interpretation. </span>
                {evaluation.situation.interpretation}
              </p>
              {evaluation.situation.actions.length > 0 ? (
                <div>
                  <p className="text-xs text-ink-400">
                    For this agent, management should:
                  </p>
                  <ul className="mt-1.5 space-y-1">
                    {evaluation.situation.actions.map((action) => (
                      <li
                        key={action}
                        className="flex gap-2 text-xs leading-relaxed text-ink-200"
                      >
                        <span aria-hidden className="text-brass-500">
                          —
                        </span>
                        <span>{action}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <p className="text-xs text-ink-400">
                <span className="font-medium text-ink-200">
                  {evaluation.situation.accountable}
                </span>{" "}
                remains accountable for the authorized operating envelope.
              </p>
            </div>
          </Panel>

          <Panel
            title="What is driving the exposure?"
            hint="The authority concentrations that matter most, and why."
            action={<Step>2 · Why</Step>}
          >
            <ol className="space-y-2">
              {evaluation.drivers.map((driver) => (
                <li
                  key={driver.key}
                  className="flex gap-4 rounded-lg border border-ink-800 p-4"
                >
                  <span className="font-mono text-lg tabular-nums text-brass-500">
                    {driver.rank}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-medium">
                        {driver.dimension}
                      </span>
                      <Badge tone={severityTone(driver.score)}>
                        {driver.score}/5 · {driver.severity}
                      </Badge>
                    </div>
                    <p className="mt-1.5 text-xs leading-relaxed text-ink-200">
                      {driver.explanation}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      Why it matters: {driver.effect}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel
            title="Recommended remedy"
            hint="Ranked by the dimensions that actually produced the exposure. P means priority, not dimension."
            action={<Step>3 · Prescription</Step>}
          >
            <div className="space-y-2 text-sm leading-relaxed text-ink-200">
              <p>
                <span className="font-medium">Prescription objective: </span>
                {evaluation.remedyObjective}
              </p>
              <p>{evaluation.remedyFocus}</p>
            </div>

            <ol className="mt-4 space-y-2">
              {controls.map((control) => (
                <li
                  key={control.rank}
                  className="flex gap-4 rounded-lg border border-ink-800 p-4"
                >
                  <span className="shrink-0 rounded-md border border-brass-500/40 bg-brass-500/10 px-2 py-0.5 font-mono text-xs font-semibold text-brass-500">
                    P{control.rank}
                  </span>
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span className="text-sm font-medium">
                        {control.dimension}
                      </span>
                      <Badge tone={severityTone(control.score)}>
                        current {control.score}/5
                        {control.severity ? ` · ${control.severity}` : ""}
                      </Badge>
                    </div>
                    <p className="mt-2 text-xs leading-relaxed text-ink-200">
                      {control.lead ? (
                        <span className="font-medium">{control.lead} </span>
                      ) : null}
                      {control.fix}
                      {control.note ? ` ${control.note}` : ""}
                    </p>
                    <p className="mt-1 text-xs text-ink-400">
                      {control.target != null ? (
                        <>
                          Target authority state after the change is actually
                          made:{" "}
                          <span className="font-mono text-ink-200">
                            {control.target}/5
                          </span>
                          {" · "}
                        </>
                      ) : null}
                      {control.effect}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </Panel>

          <Panel
            title="Agent modification specification"
            hint="The prescription in the language of the product, engineering, security and business teams who will implement it."
            action={<Step>4 · Modify</Step>}
          >
            <div className="grid gap-3 lg:grid-cols-[1fr_auto_1fr] lg:items-center">
              <div className="rounded-lg border border-ink-800 px-4 py-3">
                <p className="rule-label">Current authority profile</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-200">
                  {evaluation.modification.current}
                </p>
              </div>
              <span
                aria-hidden
                className="hidden text-center font-mono text-lg text-brass-500 lg:block"
              >
                →
              </span>
              <div className="rounded-lg border border-brass-500/40 bg-brass-500/5 px-4 py-3">
                <p className="rule-label">Target authority profile</p>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-200">
                  {evaluation.modification.target}
                </p>
              </div>
            </div>

            <h3 className="mt-4 text-xs font-semibold tracking-tight">
              Implementation requirements
            </h3>
            <ul className="mt-2 space-y-1.5">
              {evaluation.modification.requirements.map((req) => (
                <li
                  key={req.dimension}
                  className="rounded-lg border border-ink-800 px-3 py-2 text-xs leading-relaxed"
                >
                  <span className="font-medium text-brass-500">
                    {req.dimension}:
                  </span>{" "}
                  <span className="text-ink-200">{req.fix}</span>
                </li>
              ))}
            </ul>
          </Panel>

          <div className="grid gap-5 lg:grid-cols-2">
            <Panel
              title="Authority envelope"
              hint="What this agent is actually authorized to do."
            >
              {/* Walked in framework order, not in whatever order the
                  stored JSON happens to enumerate: P D X F T L S Q is the
                  order the envelope formula is written in, and a reader
                  checking one against the other should not have to hunt. */}
              <ul className="space-y-1.5">
                {AIM_ENVELOPE.map((boundary) => (
                  <li
                    key={boundary.key}
                    className="flex gap-3 rounded-lg border border-ink-800 px-3 py-2"
                  >
                    <span className="w-6 shrink-0 font-mono text-sm font-semibold text-brass-500">
                      {boundary.key}
                    </span>
                    <span className="text-xs">
                      <span className="block text-ink-400">
                        {boundary.name}
                      </span>
                      <span className="text-ink-200">
                        {rx.envelope[boundary.key] ?? boundary.defaultValue}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>

            <Panel
              title="Recommended A/G/H/X boundaries"
              hint="How consequential actions should be classified after remediation."
              action={<Step>5 · Bound authority</Step>}
            >
              <ul className="space-y-1.5">
                {evaluation.actionClasses.map((klass) => {
                  // What was prescribed, where there is anything prescribed.
                  const stored = rx.actionClasses[klass.key];
                  const items =
                    Array.isArray(stored) && stored.length > 0
                      ? stored
                      : klass.items;
                  return (
                    <li
                      key={klass.key}
                      className="rounded-lg border border-ink-800 px-3 py-2"
                    >
                      <div className="flex items-center gap-2">
                        <Badge tone={CLASS_TONE[klass.key]}>{klass.key}</Badge>
                        <span className="text-sm font-medium">
                          {klass.name}
                        </span>
                      </div>
                      <p className="mt-1 text-[11px] text-ink-400">
                        {klass.intro}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {items.map((item) => (
                          <li
                            key={item}
                            className="flex gap-2 text-xs leading-relaxed text-ink-200"
                          >
                            <span aria-hidden className="text-ink-400">
                              —
                            </span>
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    </li>
                  );
                })}
              </ul>
            </Panel>
          </div>

          {/* The rule the whole framework turns on, said where it is needed:
              at the end of the prescription, before anyone concludes the
              number has already come down. */}
          <Panel
            title="Reassess after changes"
            hint="A prescription is not a reduction."
            action={<Step>6 · Verify the fix</Step>}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <p className="max-w-3xl text-sm leading-relaxed text-ink-200">
                Implement the prescribed changes, then return to AIM™ Dx and
                score the agent on its{" "}
                <span className="font-medium">new actual authority</span>. Rx
                does not subtract points from the current AAI. A lower AAI must
                come from a real reduction in authority, reach, velocity,
                consequence or human-control deficit — not from a paper
                adjustment to the old score.
              </p>
              <Link
                href="/governance/dx"
                className={buttonClass("primary", "md")}
              >
                Reassess in AIM™ Dx
              </Link>
            </div>
          </Panel>
        </>
      )}

      <Link
        href="/governance/dx"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to diagnostics
      </Link>
    </div>
  );
}
