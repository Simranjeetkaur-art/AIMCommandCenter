"use client";

import { useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { type MailProviderPreset } from "@aim/contracts";
import { Badge, buttonClass } from "@/components/ui";

const FIELD =
  "w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500";

export interface MailConfigView {
  provider: string;
  fromName: string;
  fromEmail: string;
  host: string;
  port: number;
  secure: boolean;
  username: string;
  enabled: boolean;
  hasSecret: boolean;
  lastTestedAt: string | null;
  lastTestOk: boolean | null;
  lastTestError: string | null;
  updatedAt: string;
  updatedBy: string;
}

function Submit({ label, busy }: { label: string; busy: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={buttonClass("primary", "md")}
    >
      {pending ? busy : label}
    </button>
  );
}

/**
 * Choosing a provider.
 *
 * The provider is picked first and everything else follows from it: the
 * hostname, the port, whether TLS is implicit, and for two providers the
 * username, which is a fixed magic string people lose an afternoon to. What
 * remains is a name, an address and one secret — which is as close to "paste
 * your key and press save" as this can honestly get.
 */
export function MailForm({
  providers,
  config,
  action,
}: {
  providers: readonly MailProviderPreset[];
  config: MailConfigView | null;
  action: (formData: FormData) => Promise<void>;
}) {
  const [providerKey, setProviderKey] = useState(
    config?.provider ?? providers[0]?.key ?? "SMTP",
  );
  const preset = providers.find((p) => p.key === providerKey) ?? providers[0];

  // Editing the provider that is already saved? Then the stored values are the
  // sensible defaults; switching to a different one means starting from its
  // preset instead of carrying the old server's hostname across.
  const editingSaved = config?.provider === providerKey;

  // "smtp.example.com:2525" is how Moodle and most mail clients take it, and
  // pasted here it would be looked up as a hostname. Split it on the way out.
  const portRef = useRef<HTMLInputElement>(null);
  const [hostNote, setHostNote] = useState<string | null>(null);
  function tidyHost(input: HTMLInputElement) {
    const { host, port } = splitHost(input.value);
    input.value = host;
    if (port && portRef.current) {
      portRef.current.value = String(port);
      setHostNote(`Port ${port} moved to the port field.`);
    } else {
      setHostNote(null);
    }
  }

  return (
    <form action={action} className="space-y-5">
      <div>
        <span className="rule-label mb-2 block">Provider</span>
        <div className="flex flex-wrap gap-1.5">
          {providers.map((p) => (
            <button
              key={p.key}
              type="button"
              aria-pressed={p.key === providerKey}
              onClick={() => setProviderKey(p.key)}
              className={buttonClass("toggle", "sm")}
            >
              {p.name}
            </button>
          ))}
        </div>
        <input type="hidden" name="provider" value={providerKey} />
        {preset ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-400">
            {preset.hint}
          </p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rule-label mb-1.5 block">Sender name</span>
          <input
            name="fromName"
            required
            defaultValue={config?.fromName ?? "AIM Academy"}
            className={FIELD}
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            What recipients see in their inbox.
          </span>
        </label>
        <label className="block">
          <span className="rule-label mb-1.5 block">Sender address</span>
          <input
            name="fromEmail"
            type="email"
            required
            defaultValue={config?.fromEmail ?? ""}
            placeholder="academy@your-domain.edu"
            className={FIELD}
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            Must be an address your provider lets you send from.
          </span>
        </label>
      </div>

      {/* Only the providers that cannot decide these for you ask for them. */}
      {preset?.custom ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-2">
            <span className="rule-label mb-1.5 block">Host</span>
            <input
              name="host"
              required
              defaultValue={editingSaved ? config?.host : ""}
              placeholder="smtp.your-provider.com"
              onBlur={(e) => tidyHost(e.currentTarget)}
              className={FIELD}
            />
            <span className="mt-1 block text-[11px] text-ink-400">
              {hostNote ?? "Hostname only. The port goes in its own field."}
            </span>
          </label>
          <label className="block">
            <span className="rule-label mb-1.5 block">Port</span>
            <input
              name="port"
              type="number"
              min={1}
              max={65535}
              required
              defaultValue={editingSaved ? config?.port : preset.port}
              ref={portRef}
              className={FIELD}
            />
          </label>
          <label className="flex items-center gap-2 sm:col-span-3">
            <input
              type="checkbox"
              name="secure"
              value="true"
              defaultChecked={editingSaved ? config?.secure : preset.secure}
              className="h-4 w-4 accent-[var(--color-brass-500)]"
            />
            <span className="text-xs text-ink-200">
              Connect with TLS immediately (port 465). Leave unticked for 587,
              which starts plain and upgrades — that is not less secure, and it
              is what most providers want.
            </span>
          </label>
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="rule-label mb-1.5 block">Username</span>
          <input
            name="username"
            required={!preset?.fixedUsername}
            readOnly={Boolean(preset?.fixedUsername)}
            defaultValue={
              preset?.fixedUsername ?? (editingSaved ? config?.username : "")
            }
            className={`${FIELD} ${preset?.fixedUsername ? "text-ink-400" : ""}`}
          />
          {preset?.fixedUsername ? (
            <span className="mt-1 block text-[11px] text-ink-400">
              {preset.name} requires this exact word. Filled in for you.
            </span>
          ) : null}
        </label>
        <label className="block">
          <span className="rule-label mb-1.5 block">
            {preset?.secretLabel ?? "Password"}
          </span>
          <input
            name="secret"
            type="password"
            autoComplete="off"
            required={!config?.hasSecret}
            placeholder={
              config?.hasSecret ? "Stored — leave blank to keep it" : ""
            }
            className={FIELD}
          />
          <span className="mt-1 block text-[11px] text-ink-400">
            {config?.hasSecret
              ? "One is stored. It is never shown again, here or anywhere else."
              : "Encrypted before it is stored, and never returned by any screen."}
          </span>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Submit label="Save configuration" busy="Saving…" />
        <p className="text-xs text-ink-400">
          Saving switches sending off until a test message gets through.
        </p>
      </div>
    </form>
  );
}

/** "smtp://host:2525/" → host and port; anything else is left as typed. */
function splitHost(raw: string): { host: string; port: number | null } {
  const bare = raw.trim().replace(/^[a-z]+:\/\//i, "").replace(/\/+$/, "");
  const match = /^([^:\s]+):(\d{1,5})$/.exec(bare);
  return match
    ? { host: match[1], port: Number(match[2]) }
    : { host: bare, port: null };
}

/** The state of the configuration, said in one line at the top of the page. */
export function MailStatus({ config }: { config: MailConfigView | null }) {
  if (!config) {
    return <Badge>Not configured</Badge>;
  }
  if (config.enabled) {
    return <Badge tone="green">Sending</Badge>;
  }
  if (config.lastTestOk) {
    return <Badge tone="amber">Tested, not switched on</Badge>;
  }
  if (config.lastTestOk === false) {
    return <Badge tone="red">Last test failed</Badge>;
  }
  return <Badge tone="amber">Saved, untested</Badge>;
}
