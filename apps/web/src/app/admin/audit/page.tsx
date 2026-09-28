import { api } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass, statusTone } from "@/components/ui";

interface AuditEvent {
  id: string;
  seq: string;
  occurredAt: string;
  actorEmail: string;
  actorRole: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  ip: string | null;
  requestId: string;
  metadata: Record<string, unknown>;
  hash: string;
  prevHash: string | null;
}

interface AuditPage {
  items: AuditEvent[];
  total: number;
  page: number;
  pageSize: number;
}

export default async function AuditPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string; action?: string; outcome?: string }>;
}) {
  const { page = "1", action = "", outcome = "" } = await searchParams;

  const query = new URLSearchParams({ page, pageSize: "40" });
  if (action) query.set("action", action);
  if (outcome) query.set("outcome", outcome);

  const log = await api<AuditPage>(`/audit?${query.toString()}`);
  const pages = Math.ceil(log.total / log.pageSize);

  return (
    <div className="space-y-5">
      <Panel
        title="Audit log"
        hint="Append-only. The database refuses UPDATE, DELETE and TRUNCATE on this table, and no permission exists that would authorise one."
        action={
          <a
            href="/api/audit/export"
            className={buttonClass("secondary", "md")}
          >
            Export NDJSON
          </a>
        }
      >
        <form className="mb-4 flex flex-wrap items-end gap-2">
          <div>
            <label className="rule-label mb-1 block">Action starts with</label>
            <input
              name="action"
              defaultValue={action}
              placeholder="credential."
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-1.5 font-mono text-xs"
            />
          </div>
          <div>
            <label className="rule-label mb-1 block">Outcome</label>
            <select
              name="outcome"
              defaultValue={outcome}
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
            >
              <option value="">Any</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="DENIED">DENIED</option>
              <option value="FAILURE">FAILURE</option>
            </select>
          </div>
          <button type="submit" className={buttonClass("secondary", "md")}>
            Filter
          </button>
        </form>

        {log.items.length === 0 ? (
          <Empty>No events match.</Empty>
        ) : (
          <ul className="space-y-1.5">
            {log.items.map((event) => (
              <li
                key={event.id}
                className="rounded-lg border border-ink-800 px-3 py-2.5 text-xs"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2.5">
                    <span className="font-mono text-ink-400">#{event.seq}</span>
                    <span className="font-mono text-brass-500">
                      {event.action}
                    </span>
                    <Badge tone={statusTone(event.outcome)}>
                      {event.outcome}
                    </Badge>
                  </span>
                  <span className="text-ink-400">
                    {new Date(event.occurredAt).toLocaleString()}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-ink-400">
                  <span>
                    {event.actorEmail} <Badge>{event.actorRole}</Badge>
                  </span>
                  <span className="font-mono">
                    {event.resourceType}
                    {event.resourceId ? `:${event.resourceId.slice(0, 8)}` : ""}
                  </span>
                  {event.ip ? (
                    <span className="font-mono">{event.ip}</span>
                  ) : null}
                  <span className="font-mono" title={event.hash}>
                    hash {event.hash.slice(0, 12)}
                  </span>
                </div>

                {Object.keys(event.metadata ?? {}).length > 0 ? (
                  <pre className="mt-1.5 overflow-x-auto rounded border border-ink-800 bg-ink-950/50 p-2 font-mono text-[11px] text-ink-400">
                    {JSON.stringify(event.metadata)}
                  </pre>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <nav className="mt-4 flex items-center gap-2 text-xs">
            {Array.from({ length: Math.min(pages, 10) }, (_, i) => i + 1).map(
              (n) => (
                <a
                  key={n}
                  href={`/admin/audit?page=${n}${action ? `&action=${action}` : ""}${outcome ? `&outcome=${outcome}` : ""}`}
                  className={`rounded border px-2 py-1 ${
                    n === log.page
                      ? "border-brass-500 text-brass-500"
                      : "border-ink-800 text-ink-400"
                  }`}
                >
                  {n}
                </a>
              ),
            )}
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}
