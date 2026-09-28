import { api } from "@/lib/api";
import { Badge, Empty, Panel, statusTone } from "@/components/ui";

interface Credential {
  id: string;
  serial: string;
  status: string;
  issuedAt: string;
  reason: string;
  gateOverrides: Array<{ gate: string; reason: string; waivedByName?: string }>;
  programmeVersion: {
    version: number;
    programme: { code: string; title: string };
  };
}

export default async function CredentialsPage() {
  const credentials = await api<Credential[]>("/credentials/mine");

  if (credentials.length === 0) {
    return <Empty>You hold no credentials yet.</Empty>;
  }

  return (
    <div className="space-y-4">
      {credentials.map((credential) => (
        <Panel
          key={credential.id}
          title={credential.programmeVersion.programme.title}
          hint={`${credential.programmeVersion.programme.code} · version ${credential.programmeVersion.version}`}
          action={
            <Badge tone={statusTone(credential.status)}>
              {credential.status}
            </Badge>
          }
        >
          <dl className="grid gap-3 text-xs sm:grid-cols-3">
            <div>
              <dt className="rule-label">Serial</dt>
              <dd className="mt-0.5 font-mono text-brass-500">
                {credential.serial}
              </dd>
            </div>
            <div>
              <dt className="rule-label">Issued</dt>
              <dd className="mt-0.5">
                {new Date(credential.issuedAt).toLocaleDateString()}
              </dd>
            </div>
            <div>
              <dt className="rule-label">Verify at</dt>
              <dd className="mt-0.5 font-mono">
                <a
                  href={`/verify/${credential.serial}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-brass-500 hover:underline"
                >
                  /verify/{credential.serial}
                </a>
              </dd>
            </div>
          </dl>

          {credential.gateOverrides?.length > 0 ? (
            <div className="mt-4 rounded-lg border border-signal-amber/30 bg-signal-amber/5 p-3">
              <p className="rule-label text-signal-amber">
                Requirements waived on issue
              </p>
              <ul className="mt-2 space-y-1.5 text-xs text-ink-200">
                {credential.gateOverrides.map((override) => (
                  <li key={override.gate}>
                    <span className="font-mono text-signal-amber">
                      {override.gate}
                    </span>
                    {" — "}
                    {override.reason}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] text-ink-400">
                A waiver is part of what this credential means, so it travels
                with it.
              </p>
            </div>
          ) : null}

          <a
            href={`/student/credentials/${credential.id}`}
            className="mt-4 inline-block rounded-lg border border-ink-700 px-3 py-1.5 text-xs transition hover:border-brass-500"
          >
            View certificate
          </a>
        </Panel>
      ))}
    </div>
  );
}
