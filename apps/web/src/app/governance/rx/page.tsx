import Link from "next/link";
import { api } from "@/lib/api";
import { Badge, Empty, LinkButton, Panel, Stat } from "@/components/ui";
import { RxHelp } from "./rx-help";

interface PrescriptionRow {
  id: string;
  diagnosticId: string;
  createdAt: string;
  author: string;
  agentName: string;
  agentCode: string | null;
  agentOwner: string;
  aai: number;
  band: string;
  practice: boolean;
  controls: number;
  narrative: string;
}

interface DiagnosticRow {
  id: string;
  agentName: string;
  aai: number;
  band: string;
  isPractice: boolean;
  createdAt: string;
  agent: { id: string; code: string; name: string } | null;
  createdBy: { id: string; name: string };
  prescription: { id: string } | null;
}

const BAND_TONE: Record<string, "green" | "amber" | "red" | "neutral"> = {
  LOWER: "green",
  MODERATE: "amber",
  ELEVATED: "amber",
  CRITICAL: "red",
};

export default async function RxIndexPage() {
  const [prescriptions, diagnostics] = await Promise.all([
    api<PrescriptionRow[]>("/prescriptions"),
    api<DiagnosticRow[]>("/diagnostics"),
  ]);

  const unprescribed = diagnostics.filter((d) => d.prescription === null);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">AIM&trade; Rx</p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            Evaluation &amp; Prescription
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-400">
            Dx states how much authority an agent holds. Rx says what is driving
            that exposure and what to change. There are no questions here: a
            prescription is written against a diagnostic that already exists.
          </p>
        </div>
        <RxHelp />
      </div>

      {diagnostics.length === 0 ? (
        <div className="panel flex flex-wrap items-center justify-between gap-4 border-dashed p-5">
          <div>
            <p className="text-sm font-semibold">Complete AIM™ Dx first.</p>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-ink-400">
              Rx needs the calculated AAI and the eleven authority scores before
              it can produce an evaluation and a remedy. There are no questions
              here — the prescription is derived from a diagnostic that already
              exists.
            </p>
          </div>
          <LinkButton href="/governance/dx" variant="primary" size="md">
            Open AIM™ Dx
          </LinkButton>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Prescriptions" value={prescriptions.length} />
        <Stat
          label="Diagnostics awaiting one"
          value={unprescribed.length}
          note="a diagnostic states the exposure; the prescription is what anyone does about it"
        />
        <Stat
          label="Controls prescribed"
          value={prescriptions.reduce((sum, p) => sum + p.controls, 0)}
        />
      </div>

      <Panel
        title="Written"
        hint="Newest first. Opening one shows the situation analysis, the exposure drivers, the remedy in priority order and the A/G/H/X boundaries."
      >
        {prescriptions.length === 0 ? (
          <Empty>No prescription has been written yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {prescriptions.map((rx) => (
              <li key={rx.id}>
                <Link
                  href={`/governance/rx/${rx.diagnosticId}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs transition hover:border-brass-500"
                >
                  <span className="flex flex-wrap items-center gap-2.5">
                    {rx.agentCode ? (
                      <span className="font-mono text-brass-500">
                        {rx.agentCode}
                      </span>
                    ) : null}
                    <span className="text-ink-200">{rx.agentName}</span>
                    {rx.practice ? (
                      <Badge>practice</Badge>
                    ) : (
                      <Badge tone="blue">bound</Badge>
                    )}
                    <span className="text-ink-500">{rx.controls} controls</span>
                  </span>
                  <span className="flex items-center gap-2 text-ink-400">
                    <Badge tone={BAND_TONE[rx.band] ?? "neutral"}>
                      {rx.band}
                    </Badge>
                    <span className="w-12 text-right font-mono tabular-nums">
                      {rx.aai}
                    </span>
                    <span className="hidden sm:inline">{rx.author}</span>
                    {new Date(rx.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="Diagnostics with no prescription"
        hint="Each of these has a score and no stated remedy."
        action={
          <Link
            href="/governance/dx"
            className="text-xs text-brass-500 hover:underline"
          >
            Run a diagnostic &rarr;
          </Link>
        }
      >
        {unprescribed.length === 0 ? (
          <Empty>Every diagnostic has a prescription against it.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {unprescribed.slice(0, 25).map((dx) => (
              <li key={dx.id}>
                <Link
                  href={`/governance/rx/${dx.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-ink-800 px-3 py-2 text-xs transition hover:border-brass-500"
                >
                  <span className="flex flex-wrap items-center gap-2.5">
                    {dx.agent?.code ? (
                      <span className="font-mono text-brass-500">
                        {dx.agent.code}
                      </span>
                    ) : null}
                    <span className="text-ink-200">{dx.agentName}</span>
                    {dx.isPractice ? (
                      <Badge>practice</Badge>
                    ) : (
                      <Badge tone="blue">bound</Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-ink-400">
                    <Badge tone={BAND_TONE[dx.band] ?? "neutral"}>
                      {dx.band}
                    </Badge>
                    <span className="w-12 text-right font-mono tabular-nums">
                      {dx.aai}
                    </span>
                    <span className="text-brass-500">prescribe &rarr;</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {unprescribed.length > 25 ? (
          <p className="mt-3 text-[11px] text-ink-500">
            Showing 25 of {unprescribed.length}.
          </p>
        ) : null}
      </Panel>
    </div>
  );
}
