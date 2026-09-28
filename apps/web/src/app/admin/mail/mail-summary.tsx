import type { ReactNode } from "react";
import { mailPreset } from "@aim/contracts";
import { Badge } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import type { MailConfigView } from "./mail-form";

/**
 * The connection actually in use, read back as facts rather than as a form.
 *
 * The form shows what is being typed; this shows what is stored. They differ
 * exactly when it matters -- a half-edited form, or a host saved with a port
 * glued to it -- and an administrator checking "is this pointed at the right
 * server" should not have to read input boxes to find out.
 */
export function MailSummary({
  config,
  compact = false,
}: {
  config: MailConfigView;
  /** Drops the audit line, for places that link through to the full page. */
  compact?: boolean;
}) {
  const provider = mailPreset(config.provider)?.name ?? config.provider;

  return (
    <dl className="grid gap-x-6 gap-y-2.5 text-xs sm:grid-cols-[max-content_1fr]">
      <Row label="Provider">{provider}</Row>
      <Row label="Server">
        <Mono>
          {config.host}:{config.port}
        </Mono>
      </Row>
      <Row label="Encryption">
        {config.secure ? (
          <>
            <Badge tone="green">TLS</Badge>
            <span className="text-ink-400">encrypted from the first byte</span>
          </>
        ) : (
          <>
            <Badge tone="green">STARTTLS</Badge>
            <span className="text-ink-400">
              connects plain, then upgrades before signing in
            </span>
          </>
        )}
      </Row>
      <Row label="Username">
        <Mono>{config.username}</Mono>
      </Row>
      <Row label="Password">
        {config.hasSecret ? (
          <Badge tone="green">Stored</Badge>
        ) : (
          <Badge tone="red">Not set</Badge>
        )}
      </Row>
      <Row label="Sender">
        <span>
          {config.fromName} <Mono>&lt;{config.fromEmail}&gt;</Mono>
        </span>
      </Row>
      <Row label="Sending">
        {config.enabled ? (
          <Badge tone="green">On</Badge>
        ) : (
          <Badge tone="amber">Off</Badge>
        )}
      </Row>
      <Row label="Last test">
        {config.lastTestedAt ? (
          <>
            <Badge tone={config.lastTestOk ? "green" : "red"}>
              {config.lastTestOk ? "Delivered" : "Refused"}
            </Badge>
            <span className="text-ink-400">
              <LocalTime value={config.lastTestedAt} />
            </span>
          </>
        ) : (
          <span className="text-ink-400">Not tested since last change</span>
        )}
      </Row>
      {!compact && config.updatedBy ? (
        <Row label="Changed">
          <span className="text-ink-400">
            {config.updatedBy}, <LocalTime value={config.updatedAt} />
          </span>
        </Row>
      ) : null}
    </dl>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="rule-label pt-0.5">{label}</dt>
      <dd className="flex flex-wrap items-center gap-2 text-ink-200">
        {children}
      </dd>
    </>
  );
}

function Mono({ children }: { children: ReactNode }) {
  return <span className="font-mono text-[12px] break-all">{children}</span>;
}
