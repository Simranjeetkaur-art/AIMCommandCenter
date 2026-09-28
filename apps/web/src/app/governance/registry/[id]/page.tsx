import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { requirePermission } from "@/lib/portal";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { api, apiOrNotFound } from "@/lib/api";
import { act } from "@/lib/act";
import { ConfirmButton } from "@/components/confirm-button";

interface AgentDetail {
  id: string;
  code: string;
  name: string;
  ownerRole: string;
  purpose: string;
  aai: number | null;
  band: string | null;
  lastCommand: "VERIFIED" | "PENDING" | "MISSING";
  status: "GOVERNED" | "ATTENTION" | "CRITICAL" | "RETIRED";
  retiredAt: string | null;
  createdBy: { name: string };
  diagnostics: Array<{
    id: string;
    aai: number;
    band: string;
    createdAt: string;
    createdBy: { name: string };
    prescription: { id: string } | null;
  }>;
}

const STATUS_TONE = {
  GOVERNED: "green",
  ATTENTION: "amber",
  CRITICAL: "red",
  RETIRED: "neutral",
} as const;
const COMMAND_TONE = {
  VERIFIED: "green",
  PENDING: "amber",
  MISSING: "red",
} as const;

export default async function AgentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requirePermission(P.AGENT_READ);
  const canRetire = session.permissions.includes(P.AGENT_RETIRE);
  const canWrite = session.permissions.includes(P.AGENT_WRITE);

  const agent = await apiOrNotFound<AgentDetail>(`/registry/agents/${id}`);

  async function setLastCommand(formData: FormData) {
    "use server";
    await act(`/registry/agents/${id}`, {
      method: "PATCH",
      body: { lastCommand: String(formData.get("lastCommand")) },
    });
    revalidatePath(`/governance/registry/${id}`);
  }

  async function retire(formData: FormData) {
    "use server";
    await act(`/registry/agents/${id}/retire`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath(`/governance/registry/${id}`);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">Registered agent</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            <span className="font-mono text-brass-500">{agent.code}</span>{" "}
            <span className="ml-1">{agent.name}</span>
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {agent.ownerRole} &middot; {agent.purpose}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={COMMAND_TONE[agent.lastCommand]}>
            Last Command {agent.lastCommand}
          </Badge>
          <Badge tone={STATUS_TONE[agent.status]}>{agent.status}</Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Recorded AAI"
          value={agent.aai ?? "—"}
          note={agent.band ?? "Not yet diagnosed"}
        />
        <Stat label="Diagnoses on record" value={agent.diagnostics.length} />
        <Stat label="Registered by" value={agent.createdBy.name} />
      </div>

      {canWrite && agent.status !== "RETIRED" ? (
        <Panel
          title="Last Command"
          hint="A verified revocation path is what makes the authority reversible."
        >
          <form
            action={setLastCommand}
            className="flex flex-wrap items-end gap-2"
          >
            <select
              name="lastCommand"
              defaultValue={agent.lastCommand}
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
            >
              <option value="VERIFIED">VERIFIED</option>
              <option value="PENDING">PENDING</option>
              <option value="MISSING">MISSING</option>
            </select>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Update
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel
        title="Diagnostic history"
        hint="Each bound diagnosis, and the index it set."
      >
        {agent.diagnostics.length === 0 ? (
          <Empty>No diagnostic has been bound to this agent yet.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {agent.diagnostics.map((dx) => (
              <li key={dx.id}>
                <Link
                  href={`/governance/rx/${dx.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-4 py-2.5 transition hover:border-brass-500"
                >
                  <span className="flex items-center gap-3 text-sm">
                    <span className="font-mono text-lg tabular-nums text-brass-500">
                      {dx.aai}
                    </span>
                    <Badge>{dx.band}</Badge>
                    <span className="text-xs text-ink-400">
                      by {dx.createdBy.name}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs text-ink-400">
                    {dx.prescription ? <Badge tone="green">Rx</Badge> : null}
                    {new Date(dx.createdAt).toLocaleDateString()}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {canRetire && agent.status !== "RETIRED" ? (
        <Panel
          title="Retire this agent"
          hint="A status change, never a delete: the diagnostics that described this authority stay on the record."
        >
          <form action={retire} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-64">
              <label htmlFor="retire-reason" className="rule-label mb-1 block">
                Stated reason
              </label>
              <input
                id="retire-reason"
                name="reason"
                required
                minLength={20}
                placeholder="At least 20 characters, recorded permanently"
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <ConfirmButton
              confirm={`Retire ${agent.code} ${agent.name}? Its diagnostics stay on the record.`}
              size="md"
            >
              Retire agent
            </ConfirmButton>
          </form>
        </Panel>
      ) : null}

      <Link
        href="/governance/registry"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to registry
      </Link>
    </div>
  );
}
