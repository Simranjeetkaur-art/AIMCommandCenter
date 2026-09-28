import { ApiError, api } from "@/lib/api";
import { Badge } from "@/components/ui";
import { LocalTime } from "@/components/local-time";

interface Verified {
  serial: string;
  status: "ISSUED" | "SUSPENDED" | "REVOKED";
  issuedAt: string;
  suspendedAt: string | null;
  revokedAt: string | null;
  autoIssued: boolean;
  user: { name: string };
  programmeVersion: {
    version: number;
    programme: { code: string; title: string };
  };
}

const STANDING = {
  ISSUED: {
    tone: "green" as const,
    label: "Valid",
    line: "This certificate was issued by the academy and is in good standing.",
  },
  SUSPENDED: {
    tone: "amber" as const,
    label: "Suspended",
    line: "This certificate was issued by the academy but is currently suspended.",
  },
  REVOKED: {
    tone: "red" as const,
    label: "Revoked",
    line: "This certificate was issued by the academy and has since been withdrawn. It is no longer valid.",
  },
};

/**
 * The public check behind the link printed on every certificate.
 *
 * Anyone holding a certificate's serial can confirm it here without an
 * account. It says whether the academy issued it, to whom, for which course,
 * and whether it still stands -- nothing else about the holder.
 */
export default async function VerifyCertificatePage({
  params,
}: {
  params: Promise<{ serial: string }>;
}) {
  const { serial: raw } = await params;
  const serial = decodeURIComponent(raw).trim().toUpperCase();

  let found: Verified | null = null;
  try {
    found = await api<Verified>(`/verify/${encodeURIComponent(serial)}`);
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-6 px-6 py-12">
      <div>
        <p className="rule-label">AIM Academy</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Certificate verification
        </h1>
        <p className="mt-2 font-mono text-sm text-ink-400">{serial}</p>
      </div>

      {found ? (
        <section className="panel p-6">
          <div className="flex items-center justify-between gap-3">
            <Badge tone={STANDING[found.status].tone}>
              Authentic &middot; {STANDING[found.status].label}
            </Badge>
          </div>
          <p className="mt-3 text-sm text-ink-200">
            {STANDING[found.status].line}
          </p>
          <dl className="mt-4 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[max-content_1fr]">
            <dt className="rule-label pt-0.5">Awarded to</dt>
            <dd className="font-medium">{found.user.name}</dd>
            <dt className="rule-label pt-0.5">Course</dt>
            <dd>
              {found.programmeVersion.programme.title}{" "}
              <span className="text-ink-400">
                ({found.programmeVersion.programme.code}, version{" "}
                {found.programmeVersion.version})
              </span>
            </dd>
            <dt className="rule-label pt-0.5">Issued</dt>
            <dd>
              <LocalTime value={found.issuedAt} />
            </dd>
            {found.revokedAt ? (
              <>
                <dt className="rule-label pt-0.5">Revoked</dt>
                <dd>
                  <LocalTime value={found.revokedAt} />
                </dd>
              </>
            ) : null}
          </dl>
        </section>
      ) : (
        <section
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 p-6"
        >
          <p className="text-base font-semibold text-signal-red">
            No certificate with this serial
          </p>
          <p className="mt-2 text-sm text-ink-200">
            The academy has no record of this serial number. Check it was typed
            exactly as printed; otherwise the certificate should not be treated
            as genuine.
          </p>
        </section>
      )}
    </main>
  );
}
