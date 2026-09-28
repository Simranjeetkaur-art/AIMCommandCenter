import Link from "next/link";
import { PERMISSIONS as P, type Role } from "@aim/contracts";
import { api, apiOrNull, getSession } from "@/lib/api";
import {
  Badge,
  Panel,
  Refused,
  Stat,
  buttonClass,
  statusTone,
} from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { startPreview } from "@/app/preview/actions";
import { MailStatus, type MailConfigView } from "./mail/mail-form";
import { MailSummary } from "./mail/mail-summary";
import {
  AcademyPanel,
  CertificationPanel,
  DxPanel,
  HeadlineTiles,
  RxPanel,
  type InstitutionOverview,
} from "@/components/overview-tiles";
import { AttemptRequestsPanel } from "@/components/attempt-requests-panel";

interface AuditPage {
  items: Array<{
    id: string;
    occurredAt: string;
    actorEmail: string;
    actorRole: string;
    action: string;
    outcome: string;
    resourceType: string;
  }>;
  total: number;
}

interface Integrity {
  ok: boolean;
  checked: number;
  brokenAt?: string;
}

const PREVIEWABLE: Array<[Role, string]> = [
  ["STUDENT", "What a candidate sees: their own record, and nothing else."],
  [
    "INSTRUCTOR",
    "The examiner’s screens: a review queue and assigned learners.",
  ],
  ["MANAGER", "The builder’s screens: programmes, cohorts, reports."],
];

export default async function AdminOverview() {
  const session = await getSession();
  const canPreviewRoles = (
    session.ownPermissions ?? session.permissions
  ).includes(P.ROLE_PREVIEW);

  // The overview answers with nulls for sections the caller may not read, so
  // it is one call rather than four that each need their own refusal handling.
  const [overview, recent, integrity, mail] = await Promise.all([
    apiOrNull<InstitutionOverview>("/reports/overview"),
    api<AuditPage>("/audit?pageSize=12"),
    api<Integrity>("/audit/integrity"),
    // Null for a role that may not read the mail configuration.
    apiOrNull<{ config: MailConfigView | null }>("/mail/config"),
  ]);

  return (
    <div className="space-y-6">
      {overview ? (
        <HeadlineTiles overview={overview} />
      ) : (
        <Refused what="the institution overview" />
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        {overview?.dx ? <DxPanel dx={overview.dx} /> : null}
        {overview?.rx ? <RxPanel rx={overview.rx} /> : null}
        {overview?.academy ? <AcademyPanel academy={overview.academy} /> : null}
        {overview?.certification ? (
          <CertificationPanel certification={overview.certification} />
        ) : null}
      </div>

      {/* The log. Demoted below the four, because it says how much has
          happened and nothing about what the institution holds. */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat label="Audit events" value={recent.total} />
        <Stat
          label="Chain integrity"
          value={integrity.ok ? "Intact" : "Broken"}
          note={`${integrity.checked} events verified`}
        />
        <Stat
          label="Recorded"
          value={
            overview ? (
              <LocalTime value={overview.generatedAt} mode="time" />
            ) : (
              "—"
            )
          }
          note="figures counted at this moment, not cached"
        />
      </div>

      {mail ? (
        <Panel
          title="Outbound mail"
          hint="Verification, welcome and notification messages go out through this connection."
          action={
            <span className="flex items-center gap-3">
              <MailStatus config={mail.config} />
              <Link
                href="/admin/mail"
                className="text-xs text-brass-500 hover:underline"
              >
                Configure &rarr;
              </Link>
            </span>
          }
        >
          {mail.config ? (
            <MailSummary config={mail.config} compact />
          ) : (
            <p className="text-xs text-ink-400">
              No provider is configured, so no mail is sent.
            </p>
          )}
        </Panel>
      ) : null}

      <AttemptRequestsPanel
        learnerHref={(learnerId) => `/admin/users/${learnerId}`}
      />

      <Panel
        title="Recent activity"
        hint="Append-only. A refused attempt is recorded exactly as a successful one is."
        action={
          <Link
            href="/admin/audit"
            className="text-xs text-brass-500 hover:underline"
          >
            Full log &rarr;
          </Link>
        }
      >
        <ul className="space-y-1.5">
          {recent.items.map((event) => (
            <li
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
            >
              <span className="flex items-center gap-2.5">
                <span className="font-mono text-brass-500">{event.action}</span>
                <span className="text-ink-400">{event.actorEmail}</span>
                <Badge>{event.actorRole}</Badge>
              </span>
              <span className="flex items-center gap-2 text-ink-400">
                <Badge tone={statusTone(event.outcome)}>{event.outcome}</Badge>
                <LocalTime value={event.occurredAt} />
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      {canPreviewRoles ? (
        <Panel
          title="See another portal"
          hint="Opens that role’s screens without asking anyone for their password, and without becoming them."
        >
          <p className="mb-4 max-w-2xl text-xs text-ink-400">
            While a preview is on you hold that role&rsquo;s read permissions
            instead of your own, every write is refused, and the audit log still
            records you. It is not impersonation: there is no way in this system
            to act as another person, and this is not a quiet version of one.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            {PREVIEWABLE.map(([role, note]) => (
              <form
                key={role}
                action={startPreview}
                className="rounded-lg border border-ink-800 p-3"
              >
                <input type="hidden" name="role" value={role} />
                <p className="font-mono text-xs text-brass-500">{role}</p>
                <p className="mt-1 mb-3 text-xs text-ink-400">{note}</p>
                <button
                  type="submit"
                  className={buttonClass("secondary", "md")}
                >
                  Preview
                </button>
              </form>
            ))}
          </div>
        </Panel>
      ) : null}
    </div>
  );
}
