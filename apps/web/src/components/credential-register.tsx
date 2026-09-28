import Link from "next/link";
import { ApiError, api } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass, statusTone } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { LocalTime } from "@/components/local-time";

interface CredentialRow {
  id: string;
  serial: string;
  status: string;
  issuedAt: string;
  reason: string;
  autoIssued: boolean;
  examScore: number | null;
  gateOverrides: Array<{ gate: string; reason: string }>;
  user: { id: string; name: string; email: string };
  programmeVersion: {
    version: number;
    programme: { code: string; title: string };
  };
  issuedBy: { name: string } | null;
}

interface CredentialDetail extends CredentialRow {
  suspendedAt: string | null;
  revokedAt: string | null;
  reinstatedAt: string | null;
  events: Array<{
    id: string;
    action: string;
    reason: string;
    createdAt: string;
    actor: { name: string; role: string } | null;
  }>;
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500";

const STANDING: Record<string, { label: string; tone: "green" | "amber" | "red"; note: string }> = {
  ISSUED: {
    label: "Authentic · valid",
    tone: "green",
    note: "This certificate was issued by the academy and is in good standing.",
  },
  SUSPENDED: {
    label: "Authentic · suspended",
    tone: "amber",
    note: "Issued by the academy but currently suspended. It should not be relied on until reinstated.",
  },
  REVOKED: {
    label: "Authentic · revoked",
    tone: "red",
    note: "Issued by the academy and later withdrawn. It is no longer valid.",
  },
};

/**
 * The certificate register, shared by the administration and manager portals.
 *
 * Two jobs on one screen. The first is the desk check: somebody shows you a
 * certificate, you type the serial printed on it, and the register says
 * whether the academy issued it, to whom, for what, and whether it still
 * stands. The second is the register itself, searchable by serial, name,
 * email or track. Changing a credential's standing is an administrator's act,
 * so `act` is passed only by the administration page.
 */
export async function CredentialRegister({
  basePath,
  search,
  act,
}: {
  basePath: string;
  search: { serial?: string; q?: string; status?: string };
  act?: (formData: FormData) => Promise<void>;
}) {
  const serial = search.serial?.trim().toUpperCase() || "";
  const q = search.q?.trim() ?? "";
  const status = ["ISSUED", "SUSPENDED", "REVOKED"].includes(search.status ?? "")
    ? search.status!
    : "";

  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (status) params.set("status", status);

  const [all, rows, checked] = await Promise.all([
    api<CredentialRow[]>("/credentials"),
    q || status
      ? api<CredentialRow[]>(`/credentials?${params.toString()}`)
      : null,
    serial
      ? api<CredentialDetail>(`/credentials/serial/${encodeURIComponent(serial)}`).catch(
          (err) => {
            if (err instanceof ApiError && err.status === 404) return null;
            throw err;
          },
        )
      : undefined,
  ]);
  const list = rows ?? all;

  const count = (s: string) => all.filter((c) => c.status === s).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Certification</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          Certificate register
        </h1>
        <p className="mt-1 max-w-3xl text-xs text-ink-400">
          Every certificate the academy has issued, with the serial number
          printed on it. Passing a track&rsquo;s final examination issues one
          automatically; each is recorded here with its history.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-5">
        <Stat label="Issued in total" value={all.length} />
        <Stat label="Valid" value={count("ISSUED")} />
        <Stat label="Suspended" value={count("SUSPENDED")} />
        <Stat label="Revoked" value={count("REVOKED")} />
        <Stat
          label="Automatic"
          value={all.filter((c) => c.autoIssued).length}
          note="on passing the final exam"
        />
      </div>

      <Panel
        title="Check a certificate"
        hint="Type the serial number printed on the certificate, for example AIM-2026-1A2B3C4D."
      >
        <form action={basePath} className="flex flex-wrap gap-2">
          <input
            name="serial"
            defaultValue={serial}
            required
            placeholder="AIM-2026-XXXXXXXX"
            autoComplete="off"
            spellCheck={false}
            className={`${FIELD} min-w-64 flex-1 font-mono uppercase`}
          />
          <button type="submit" className={buttonClass("primary", "md")}>
            Verify
          </button>
          {serial ? (
            <Link href={basePath} className={buttonClass("secondary", "md")}>
              Clear
            </Link>
          ) : null}
        </form>

        {checked === null ? (
          <div className="mt-4 rounded-lg border border-signal-red/40 bg-signal-red/10 p-4">
            <p className="text-sm font-semibold text-signal-red">
              Not authentic — no certificate with serial{" "}
              <span className="font-mono">{serial}</span>
            </p>
            <p className="mt-1 text-xs text-ink-200">
              The academy has never issued this serial. Check it was typed
              exactly as printed; otherwise treat the certificate as not
              genuine.
            </p>
          </div>
        ) : checked ? (
          <VerifiedCard credential={checked} />
        ) : null}
      </Panel>

      <Panel
        title="Register"
        hint={
          act
            ? "Suspension, revocation and reinstatement each demand a stated reason, recorded against the credential and in the audit log. Revocation is terminal."
            : "Read-only. Changing a certificate's standing is an administration act."
        }
      >
        <form action={basePath} className="mb-4 flex flex-wrap gap-2">
          <input
            name="q"
            defaultValue={q}
            placeholder="Serial, name, email or track code"
            className={`${FIELD} min-w-64 flex-1`}
          />
          <select name="status" defaultValue={status} className={FIELD}>
            <option value="">Any status</option>
            <option value="ISSUED">Valid</option>
            <option value="SUSPENDED">Suspended</option>
            <option value="REVOKED">Revoked</option>
          </select>
          <button type="submit" className={buttonClass("secondary", "md")}>
            Search
          </button>
          {q || status ? (
            <Link href={basePath} className={buttonClass("secondary", "md")}>
              Show all
            </Link>
          ) : null}
        </form>

        {list.length === 0 ? (
          <Empty>
            {q || status
              ? "No certificate matches that search."
              : "No certificates issued yet. One is issued automatically when a candidate passes a final examination."}
          </Empty>
        ) : (
          <ul className="space-y-3">
            {list.map((credential) => (
              <li
                key={credential.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <Link
                      href={`${basePath}?serial=${encodeURIComponent(credential.serial)}`}
                      className="font-mono text-sm text-brass-500 hover:underline"
                    >
                      {credential.serial}
                    </Link>
                    <p className="mt-1 text-sm font-medium">
                      {credential.user.name}{" "}
                      <span className="text-xs font-normal text-ink-400">
                        {credential.user.email}
                      </span>
                    </p>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {credential.programmeVersion.programme.code} —{" "}
                      {credential.programmeVersion.programme.title} v
                      {credential.programmeVersion.version} &middot;{" "}
                      {credential.autoIssued
                        ? `issued automatically${credential.examScore !== null ? ` (final exam ${credential.examScore}%)` : ""}`
                        : `issued by ${credential.issuedBy?.name ?? "—"}`}{" "}
                      &middot; <LocalTime value={credential.issuedAt} />
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    {credential.autoIssued ? <Badge tone="blue">Automatic</Badge> : null}
                    <Badge tone={statusTone(credential.status)}>
                      {credential.status}
                    </Badge>
                  </span>
                </div>

                {credential.gateOverrides?.length > 0 ? (
                  <div className="mt-2 rounded-lg border border-signal-amber/30 bg-signal-amber/5 p-2.5">
                    <p className="rule-label text-signal-amber">
                      Requirements waived
                    </p>
                    <ul className="mt-1 space-y-0.5 text-xs text-ink-200">
                      {credential.gateOverrides.map((override) => (
                        <li key={override.gate}>
                          <span className="font-mono">{override.gate}</span> —{" "}
                          {override.reason}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}

                {act && credential.status !== "REVOKED" ? (
                  <details className="mt-3">
                    <summary className="cursor-pointer text-xs text-ink-400 hover:text-ink-200">
                      Change standing
                    </summary>
                    <form
                      action={act}
                      className="mt-2 flex flex-wrap items-end gap-2"
                    >
                      <input
                        type="hidden"
                        name="credentialId"
                        value={credential.id}
                      />
                      <div>
                        <label
                          htmlFor={`standing-action-${credential.id}`}
                          className="rule-label mb-1 block"
                        >
                          Action
                        </label>
                        <select
                          id={`standing-action-${credential.id}`}
                          name="action"
                          className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                        >
                          {credential.status === "ISSUED" ? (
                            <option value="suspend">Suspend</option>
                          ) : null}
                          {credential.status === "SUSPENDED" ? (
                            <option value="reinstate">Reinstate</option>
                          ) : null}
                          <option value="revoke">Revoke (permanent)</option>
                        </select>
                      </div>
                      <div className="min-w-56 flex-1">
                        <label
                          htmlFor={`standing-reason-${credential.id}`}
                          className="rule-label mb-1 block"
                        >
                          Stated reason
                        </label>
                        <input
                          id={`standing-reason-${credential.id}`}
                          name="reason"
                          required
                          minLength={20}
                          placeholder="At least 20 characters, recorded permanently"
                          className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                        />
                      </div>
                      <ConfirmButton
                        confirm={`Change the standing of ${credential.serial}, held by ${credential.user.name}? Revocation cannot be undone.`}
                      >
                        Apply
                      </ConfirmButton>
                    </form>
                  </details>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function VerifiedCard({ credential }: { credential: CredentialDetail }) {
  const standing = STANDING[credential.status] ?? STANDING.ISSUED;
  const border =
    standing.tone === "green"
      ? "border-signal-green/40 bg-signal-green/10"
      : standing.tone === "amber"
        ? "border-signal-amber/40 bg-signal-amber/10"
        : "border-signal-red/40 bg-signal-red/10";

  return (
    <div className={`mt-4 rounded-lg border p-4 ${border}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Badge tone={standing.tone}>{standing.label}</Badge>
        <span className="font-mono text-sm">{credential.serial}</span>
      </div>
      <p className="mt-2 text-xs text-ink-200">{standing.note}</p>

      <dl className="mt-3 grid gap-x-6 gap-y-2 text-xs sm:grid-cols-[max-content_1fr]">
        <dt className="rule-label">Holder</dt>
        <dd>
          {credential.user.name}{" "}
          <span className="text-ink-400">{credential.user.email}</span>
        </dd>
        <dt className="rule-label">Course</dt>
        <dd>
          {credential.programmeVersion.programme.code} —{" "}
          {credential.programmeVersion.programme.title} (version{" "}
          {credential.programmeVersion.version})
        </dd>
        <dt className="rule-label">Issued</dt>
        <dd>
          <LocalTime value={credential.issuedAt} /> &middot;{" "}
          {credential.autoIssued
            ? "automatically, on passing the final examination"
            : `by ${credential.issuedBy?.name ?? "—"}`}
        </dd>
        {credential.examScore !== null ? (
          <>
            <dt className="rule-label">Final exam</dt>
            <dd>{credential.examScore}%</dd>
          </>
        ) : null}
        <dt className="rule-label">Basis</dt>
        <dd className="text-ink-200">{credential.reason}</dd>
      </dl>

      {credential.events.length > 0 ? (
        <div className="mt-3">
          <p className="rule-label">History</p>
          <ul className="mt-1 space-y-1 text-xs">
            {credential.events.map((e) => (
              <li key={e.id} className="flex flex-wrap gap-x-2 text-ink-300">
                <span className="font-mono text-ink-100">{e.action}</span>
                <LocalTime value={e.createdAt} />
                <span>· {e.actor ? e.actor.name : "System"}</span>
                <span className="text-ink-400">— {e.reason}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
