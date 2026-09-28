import Link from "next/link";
import { redirect } from "next/navigation";
import { AIM_DIMENSION_COUNT, PERMISSIONS as P, bandFor } from "@aim/contracts";
import { api, getSession } from "@/lib/api";
import { Badge, Empty, Panel } from "@/components/ui";
import { HelpBlock, Modal } from "@/components/modal";
import { DxForm } from "./dx-form";
import { act } from "@/lib/act";

interface Diagnostic {
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

const TONES = {
  LOWER: "green",
  MODERATE: "amber",
  ELEVATED: "amber",
  CRITICAL: "red",
} as const;

/** What a person actually does on this screen, in order. */
const DX_STEPS: ReadonlyArray<[string, string, string]> = [
  [
    "describe",
    "Describe the agent",
    "Name the agent, the accountable human owner, and the authorized purpose. The purpose is not decoration: Rx reads it to decide what counts as consequential for this agent.",
  ],
  [
    "baseline",
    "Start from a baseline, if one fits",
    "The role baselines are a starting position for a known agent shape, not an answer. Every score still has to be changed to what this agent actually holds.",
  ],
  [
    "score",
    "Score the eleven dimensions on actual authority",
    "Score what the agent can really cause today — not what the policy says, and not what it was approved for. A capability that exists is authority whether or not anyone intended it.",
  ],
  [
    "calculate",
    "Calculate",
    "The eleven scores are posted and the server computes the AAI. Nothing here can assert an index; that is why the number in the record can be trusted.",
  ],
  [
    "read",
    "Read the band, not just the number",
    "The AAI is a comparison index, not deployment permission and not a safety grade. The band names what kind of attention the profile needs.",
  ],
  [
    "prescribe",
    "Continue to AIM™ Rx",
    "Rx explains what is driving the exposure and prescribes the specific authority to change. Implement the change, then score the agent here again.",
  ],
];

export default async function DxPage() {
  const session = await getSession();
  const canBind = session.permissions.includes(P.DIAGNOSTIC_BIND_AGENT);

  const history = await api<Diagnostic[]>("/diagnostics");
  // Only for a role that may bind; retired agents are not offered.
  const agents = canBind
    ? await api<Array<{ id: string; code: string; name: string }>>(
        "/registry/agents",
      )
    : undefined;

  async function runDiagnostic(formData: FormData) {
    "use server";
    const scores = Array.from({ length: AIM_DIMENSION_COUNT }, (_, i) =>
      Number(formData.get(`score_${i}`) ?? 3),
    );
    const created = await act<{ id: string }>("/diagnostics", {
      method: "POST",
      body: {
        agentName: String(formData.get("agentName") ?? ""),
        agentOwner: String(formData.get("agentOwner") ?? ""),
        agentPurpose: String(formData.get("agentPurpose") ?? ""),
        ...(String(formData.get("agentId") ?? "")
          ? { agentId: String(formData.get("agentId")) }
          : {}),
        scores,
      },
    });

    redirect(`/governance/rx/${created.id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">AIM™ Dx</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Authority Diagnostic
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
            Score the agent across the eleven AIM™ authority dimensions. The AAI
            is a comparison index, not deployment permission — and it is
            calculated on the server, from the scores you submit, so the number
            in the record is one nobody could simply assert.
          </p>
        </div>

        <Modal
          label="? How to use"
          title="How to use the Authority Diagnostic"
          hint="AIM™ Dx workflow"
        >
          <ol className="space-y-2">
            {DX_STEPS.map(([step, what, detail], i) => (
              <li key={step} className="flex gap-3">
                <span className="mt-0.5 font-mono text-xs text-brass-500">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div>
                  <p className="text-xs font-medium">{what}</p>
                  <p className="mt-0.5 text-xs leading-relaxed text-ink-400">
                    {detail}
                  </p>
                </div>
              </li>
            ))}
          </ol>

          <div className="mt-4">
            <HelpBlock title="Core principle">
              <p>
                Controls may reduce residual exposure. They do not erase the
                authority the agent actually possesses — so a lower AAI has to
                come from a real reduction in authority, reach, velocity,
                consequence or human-control deficit, scored again here.
              </p>
            </HelpBlock>
          </div>
        </Modal>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {(["LOWER", "MODERATE", "ELEVATED", "CRITICAL"] as const).map(
          (band) => {
            const meta = bandFor(
              band === "LOWER"
                ? 10
                : band === "MODERATE"
                  ? 30
                  : band === "ELEVATED"
                    ? 60
                    : 90,
            );
            return (
              <div
                key={band}
                className="panel flex items-center gap-3 px-4 py-3"
              >
                <Badge tone={TONES[band]}>
                  {meta.min}–{Math.floor(meta.max)}
                </Badge>
                <span className="text-xs text-ink-400">{meta.label}</span>
              </div>
            );
          },
        )}
      </div>

      <DxForm action={runDiagnostic} agents={agents} />

      <Panel
        title="Your diagnostics"
        hint={
          canBind
            ? "Every diagnostic you have run, bound and practice alike."
            : "Practice runs. These belong to you and change no registry record."
        }
      >
        {history.length === 0 ? (
          <Empty>No diagnostics yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {history.map((dx) => (
              <li key={dx.id}>
                <Link
                  href={`/governance/rx/${dx.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-2.5 transition hover:border-brass-500"
                >
                  <span className="flex items-center gap-2.5 text-sm">
                    <span className="font-mono text-lg tabular-nums text-brass-500">
                      {dx.aai}
                    </span>
                    <span>{dx.agentName}</span>
                    {dx.agent ? (
                      <Badge tone="blue">{dx.agent.code}</Badge>
                    ) : (
                      <Badge>Practice</Badge>
                    )}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-400">
                    {dx.prescription ? <Badge tone="green">Rx</Badge> : null}
                    <Badge
                      tone={TONES[dx.band as keyof typeof TONES] ?? "neutral"}
                    >
                      {dx.band}
                    </Badge>
                    {new Date(dx.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
