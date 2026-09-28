import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { api } from "@/lib/api";
import { requirePermission } from "@/lib/portal";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { act } from "@/lib/act";
import { ConfirmButton } from "@/components/confirm-button";

interface Agent {
  id: string;
  code: string;
  name: string;
  ownerRole: string;
  purpose: string;
  aai: number | null;
  band: string | null;
  lastCommand: "VERIFIED" | "PENDING" | "MISSING";
  status: "GOVERNED" | "ATTENTION" | "CRITICAL" | "RETIRED";
  _count: { diagnostics: number };
}

interface Summary {
  total: number;
  governed: number;
  attention: number;
  critical: number;
  lastCommandMissing: number;
  undiagnosed: number;
  averageAai: number | null;
  highestAai: number | null;
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

/**
 * The orders a register can usefully be read in.
 *
 * Sorted rather than hand-arranged. The useful order of a risk register is a
 * fact about its contents — worst exposure first, or least recently assessed —
 * and a position somebody dragged would go stale the moment a diagnostic
 * changed a score.
 */
const SORTS: Array<[string, string]> = [
  ["exposure", "Exposure (AAI)"],
  ["status", "Status"],
  ["code", "Code"],
  ["name", "Name"],
  ["owner", "Owner"],
  ["diagnostics", "Diagnostics run"],
  ["assessed", "Last assessed"],
];

export default async function RegistryPage({
  searchParams,
}: {
  searchParams: Promise<{
    sort?: string;
    direction?: string;
    retired?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await requirePermission(P.AGENT_READ);
  const canWrite = session.permissions.includes(P.AGENT_WRITE);
  const canRetire = session.permissions.includes(P.AGENT_RETIRE);

  const sort = sp.sort ?? "exposure";
  const direction = sp.direction === "asc" ? "asc" : "desc";
  const showRetired = sp.retired === "true";

  const query = new URLSearchParams({ sort, direction });
  if (showRetired) query.set("includeRetired", "true");

  const [summary, agents] = await Promise.all([
    api<Summary>("/registry/summary"),
    api<Agent[]>(`/registry/agents?${query}`),
  ]);

  async function registerAgent(formData: FormData) {
    "use server";
    await act("/registry/agents", {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? ""),
        name: String(formData.get("name") ?? ""),
        ownerRole: String(formData.get("ownerRole") ?? ""),
        purpose: String(formData.get("purpose") ?? ""),
        lastCommand: String(formData.get("lastCommand") ?? "PENDING"),
      },
    });
    revalidatePath("/governance/registry");
  }

  async function retireAgent(formData: FormData) {
    "use server";
    await act(`/registry/agents/${String(formData.get("agentId"))}/retire`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath("/governance/registry");
  }

  async function deleteAgent(formData: FormData) {
    "use server";
    await act(`/registry/agents/${String(formData.get("agentId"))}`, {
      method: "DELETE",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath("/governance/registry");
  }

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Enterprise governance</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">
          AI Agent Registry
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
          Every consequential agent should have an accountable owner, a defined
          purpose, measured authority, and a verified revocation path. An agent
          whose Last Command is not verified is flagged whatever its index says
          — the index measures how much authority exists, not whether it can be
          taken back.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <Stat label="Registered" value={summary.total} />
        <Stat label="Governed" value={summary.governed} />
        <Stat label="Attention" value={summary.attention} />
        <Stat label="Critical" value={summary.critical} />
        <Stat
          label="Last Command missing"
          value={summary.lastCommandMissing}
          note={
            summary.averageAai !== null
              ? `avg AAI ${summary.averageAai}`
              : undefined
          }
        />
      </div>

      {canWrite ? (
        <Panel
          title="Register an agent"
          hint="An agent with no diagnostic starts as attention, not governed."
        >
          <form
            action={registerAgent}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="rule-label mb-1 block">Code</label>
              <input
                name="code"
                required
                minLength={2}
                placeholder="HR-AI-02"
                className="w-32 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
              />
            </div>
            <div className="flex-1 min-w-44">
              <label className="rule-label mb-1 block">Name</label>
              <input
                name="name"
                required
                minLength={2}
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="rule-label mb-1 block">Accountable owner</label>
              <input
                name="ownerRole"
                required
                minLength={2}
                placeholder="CHRO"
                className="w-32 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <div className="flex-1 min-w-52">
              <label className="rule-label mb-1 block">
                Authorized purpose
              </label>
              <input
                name="purpose"
                required
                minLength={5}
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
              />
            </div>
            <div>
              <label className="rule-label mb-1 block">Last Command</label>
              <select
                name="lastCommand"
                defaultValue="PENDING"
                className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
              >
                <option value="VERIFIED">VERIFIED</option>
                <option value="PENDING">PENDING</option>
                <option value="MISSING">MISSING</option>
              </select>
            </div>
            <button type="submit" className={buttonClass("primary", "md")}>
              Register
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel
        title="Registered agents"
        hint="AAI changes only when a diagnostic is bound to the agent."
        action={
          <form method="get" className="flex flex-wrap items-center gap-2">
            <select
              name="sort"
              defaultValue={sort}
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
            >
              {SORTS.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <select
              name="direction"
              defaultValue={direction}
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
            >
              <option value="desc">Highest first</option>
              <option value="asc">Lowest first</option>
            </select>
            <label className="flex items-center gap-1.5 text-xs text-ink-400">
              <input
                type="checkbox"
                name="retired"
                value="true"
                defaultChecked={showRetired}
              />
              Show retired
            </label>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Order
            </button>
          </form>
        }
      >
        {agents.length === 0 ? (
          <Empty>No agents registered.</Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="rule-label">
                <tr className="border-b border-ink-800">
                  <th className="py-2 pr-4 font-normal">Agent</th>
                  <th className="py-2 pr-4 font-normal">Owner</th>
                  <th className="py-2 pr-4 font-normal">Purpose</th>
                  <th className="py-2 pr-4 text-right font-normal">AAI</th>
                  <th className="py-2 pr-4 font-normal">Last Command</th>
                  <th className="py-2 pr-4 font-normal">Status</th>
                  {canRetire ? (
                    <th className="py-2 font-normal">Record</th>
                  ) : null}
                </tr>
              </thead>
              <tbody>
                {agents.map((agent) => (
                  <tr key={agent.id} className="border-b border-ink-800/60">
                    <td className="py-2.5 pr-4">
                      <Link
                        href={`/governance/registry/${agent.id}`}
                        className="hover:text-brass-500"
                      >
                        <span className="font-mono text-brass-500">
                          {agent.code}
                        </span>
                        <span className="ml-2">{agent.name}</span>
                      </Link>
                    </td>
                    <td className="py-2.5 pr-4 text-ink-400">
                      {agent.ownerRole}
                    </td>
                    <td className="py-2.5 pr-4 text-ink-400">
                      {agent.purpose}
                    </td>
                    <td className="py-2.5 pr-4 text-right font-mono tabular-nums">
                      {agent.aai ?? "—"}
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={COMMAND_TONE[agent.lastCommand]}>
                        {agent.lastCommand}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge tone={STATUS_TONE[agent.status]}>
                        {agent.status}
                      </Badge>
                    </td>
                    {canRetire ? (
                      <td className="py-2.5">
                        <details>
                          <summary className="cursor-pointer text-[11px] text-ink-500 hover:text-brass-500">
                            Retire or delete
                          </summary>
                          <div className="mt-2 w-64 space-y-2 rounded-lg border border-ink-800 p-2">
                            {agent.status !== "RETIRED" ? (
                              <form
                                action={retireAgent}
                                className="space-y-1.5"
                              >
                                <input
                                  type="hidden"
                                  name="agentId"
                                  value={agent.id}
                                />
                                <input
                                  name="reason"
                                  required
                                  minLength={20}
                                  placeholder="Why this authority record ends…"
                                  aria-label={`Why retire ${agent.code}`}
                                  className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-[11px]"
                                />
                                <ConfirmButton
                                  confirm={`Retire ${agent.code} ${agent.name}? Its diagnostics stay on the record.`}
                                >
                                  Retire &mdash; keeps every diagnostic
                                </ConfirmButton>
                              </form>
                            ) : null}

                            {/* The other kind of ending: the record itself
                                goes, and the bound diagnostics with it. */}
                            <form action={deleteAgent} className="space-y-1.5">
                              <input
                                type="hidden"
                                name="agentId"
                                value={agent.id}
                              />
                              <input
                                name="reason"
                                required
                                minLength={30}
                                placeholder="Why the record itself must be destroyed…"
                                aria-label={`Why delete ${agent.code}`}
                                className="w-full rounded-lg border border-signal-red/40 bg-ink-950/60 px-2 py-1.5 text-[11px]"
                              />
                              <ConfirmButton
                                confirm={`Delete ${agent.code} ${agent.name} and its ${agent._count.diagnostics} diagnostic(s)? This cannot be undone.`}
                              >
                                Delete &mdash; takes {agent._count.diagnostics}{" "}
                                diagnostic
                                {agent._count.diagnostics === 1 ? "" : "s"} with
                                it
                              </ConfirmButton>
                            </form>
                          </div>
                        </details>
                      </td>
                    ) : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </div>
  );
}
