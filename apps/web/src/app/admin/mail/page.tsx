import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { MailProviderPreset } from "@aim/contracts";
import { ApiError, api } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { LocalTime } from "@/components/local-time";
import { MailForm, MailStatus, type MailConfigView } from "./mail-form";
import { MailSummary } from "./mail-summary";

interface MailPage {
  providers: MailProviderPreset[];
  config: MailConfigView | null;
  enrolment: {
    intakeCohortId: string | null;
    autoEnrol: boolean;
    cohorts: Array<{
      id: string;
      code: string;
      title: string;
      programme: string;
    }>;
  };
}

/**
 * Outbound mail, and what happens when somebody confirms their address.
 *
 * One screen rather than two, because they are one decision in practice: an
 * administrator turning self-enrolment on needs to know that mail works *and*
 * where the people it lets in will end up, and splitting those across two
 * pages is how one of them ends up unset.
 */
export default async function MailSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ saved?: string; tested?: string; error?: string }>;
}) {
  const { saved, tested, error } = await searchParams;
  const data = await api<MailPage>("/mail/config");
  const { config, enrolment } = data;

  async function saveConfig(formData: FormData) {
    "use server";
    const secret = String(formData.get("secret") ?? "");
    const port = formData.get("port");
    try {
      await api("/mail/config", {
        method: "PUT",
        body: {
          provider: String(formData.get("provider") ?? ""),
          fromName: String(formData.get("fromName") ?? ""),
          fromEmail: String(formData.get("fromEmail") ?? ""),
          host: String(formData.get("host") ?? "") || undefined,
          port: port ? Number(port) : undefined,
          secure: formData.get("secure") === "true",
          username: String(formData.get("username") ?? "") || undefined,
          // Absent rather than empty, so the server knows to keep the stored one.
          ...(secret ? { secret } : {}),
        },
      });
    } catch (err) {
      redirect(`/admin/mail?error=${encodeURIComponent(refusalMessage(err))}`);
    }
    revalidatePath("/admin/mail");
    redirect("/admin/mail?saved=1");
  }

  async function sendTest(formData: FormData) {
    "use server";
    const to = String(formData.get("to") ?? "").trim();
    try {
      await api("/mail/test", {
        method: "POST",
        body: to ? { to } : {},
      });
    } catch (err) {
      redirect(`/admin/mail?error=${encodeURIComponent(refusalMessage(err))}`);
    }
    revalidatePath("/admin/mail");
    redirect("/admin/mail?tested=1");
  }

  async function setEnabled(formData: FormData) {
    "use server";
    try {
      await api("/mail/enabled", {
        method: "PUT",
        body: { enabled: formData.get("enabled") === "true" },
      });
    } catch (err) {
      redirect(`/admin/mail?error=${encodeURIComponent(refusalMessage(err))}`);
    }
    revalidatePath("/admin/mail");
  }

  async function saveEnrolment(formData: FormData) {
    "use server";
    const cohort = String(formData.get("intakeCohortId") ?? "");
    try {
      await api("/mail/enrolment", {
        method: "PUT",
        body: {
          intakeCohortId: cohort || null,
          autoEnrol: formData.get("autoEnrol") === "true",
        },
      });
    } catch (err) {
      redirect(`/admin/mail?error=${encodeURIComponent(refusalMessage(err))}`);
    }
    revalidatePath("/admin/mail");
    redirect("/admin/mail?saved=1");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">Administration</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            Email &amp; enrolment
          </h1>
          <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-400">
            How this academy sends mail, and where a candidate who confirms
            their address ends up. Nothing is sent until a test message has
            actually been delivered.
          </p>
        </div>
        <MailStatus config={config} />
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red"
        >
          {decodeURIComponent(error)}
        </p>
      ) : null}
      {saved ? (
        <p className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-4 py-3 text-sm text-signal-green">
          Saved.
        </p>
      ) : null}
      {tested ? (
        <p className="rounded-lg border border-signal-green/40 bg-signal-green/10 px-4 py-3 text-sm text-signal-green">
          Test message sent. If it arrives, switch sending on below.
        </p>
      ) : null}

      {config ? (
        <Panel
          title="Connection in use"
          hint="What is stored and what the next message will use. The password is never shown, only whether one is stored."
        >
          <MailSummary config={config} />
        </Panel>
      ) : null}

      <Panel
        title="Mail provider"
        hint="Pick the service, give it a sender identity, and paste one key. The hostname and port come from the provider."
      >
        <MailForm
          providers={data.providers}
          config={config}
          action={saveConfig}
        />
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Send a test"
          hint="One real message, to prove the credentials work before anybody depends on them."
        >
          {!config?.hasSecret ? (
            <Empty>Save a provider and its key first.</Empty>
          ) : (
            <>
              <form action={sendTest} className="flex flex-wrap gap-2">
                <input
                  name="to"
                  type="email"
                  placeholder="Leave blank to send to yourself"
                  className="min-w-56 flex-1 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
                />
                <button
                  type="submit"
                  className={buttonClass("secondary", "md")}
                >
                  Send test
                </button>
              </form>

              {config.lastTestedAt ? (
                <div className="mt-3 rounded-lg border border-ink-800 px-3 py-2 text-xs">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={config.lastTestOk ? "green" : "red"}>
                      {config.lastTestOk ? "delivered" : "refused"}
                    </Badge>
                    <span className="text-ink-400">
                      <LocalTime value={config.lastTestedAt} />
                    </span>
                  </div>
                  {config.lastTestError ? (
                    <p className="mt-1.5 font-mono text-[11px] leading-relaxed text-signal-red">
                      {config.lastTestError}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className="mt-3 text-xs text-ink-400">
                  No test has been sent yet.
                </p>
              )}
            </>
          )}
        </Panel>

        <Panel
          title="Sending"
          hint="The switch. Off means verification, welcome and notification messages are not sent at all."
        >
          {!config?.hasSecret ? (
            <Empty>Nothing to switch on yet.</Empty>
          ) : (
            <div className="space-y-3">
              <p className="flex items-center gap-2 text-sm text-ink-200">
                Outbound mail is
                {config.enabled ? (
                  <Badge tone="green">On</Badge>
                ) : (
                  <Badge tone="amber">Off</Badge>
                )}
              </p>
              <form action={setEnabled}>
                <input
                  type="hidden"
                  name="enabled"
                  value={config.enabled ? "false" : "true"}
                />
                <button
                  type="submit"
                  disabled={!config.enabled && !config.lastTestOk}
                  className={buttonClass(
                    config.enabled ? "secondary" : "primary",
                    "md",
                  )}
                >
                  {config.enabled ? "Switch sending off" : "Switch sending on"}
                </button>
              </form>
              {!config.enabled && !config.lastTestOk ? (
                <p className="text-xs text-ink-400">
                  A test message has to get through before this can be switched
                  on. That way &ldquo;mail is on&rdquo; always means mail has
                  actually left this machine.
                </p>
              ) : null}
              {config.updatedBy ? (
                <p className="text-[11px] text-ink-400">
                  Last changed by {config.updatedBy},{" "}
                  <LocalTime value={config.updatedAt} />.
                </p>
              ) : null}
            </div>
          )}
        </Panel>
      </div>

      <Panel
        title="Where new candidates land"
        hint="A candidate who confirms their address is enrolled here automatically, and the administrators and managers are told."
      >
        {enrolment.cohorts.length === 0 ? (
          <Empty>
            There are no active cohorts. Create one before turning automatic
            enrolment on.
          </Empty>
        ) : (
          <form action={saveEnrolment} className="space-y-4">
            <label className="block max-w-lg">
              <span className="rule-label mb-1.5 block">Intake cohort</span>
              <select
                name="intakeCohortId"
                defaultValue={enrolment.intakeCohortId ?? ""}
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-sm outline-none focus:border-brass-500"
              >
                <option value="">
                  None — a manager places every candidate by hand
                </option>
                {enrolment.cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.code} — {c.programme}: {c.title}
                  </option>
                ))}
              </select>
            </label>

            <label className="flex items-start gap-2">
              <input
                type="checkbox"
                name="autoEnrol"
                value="true"
                defaultChecked={enrolment.autoEnrol}
                className="mt-0.5 h-4 w-4 accent-[var(--color-brass-500)]"
              />
              <span className="text-xs leading-relaxed text-ink-200">
                Enrol automatically when a candidate confirms their email.
                <span className="block text-ink-400">
                  With this off, or with no intake cohort chosen, a
                  self-enrolled candidate still gets an account — they simply
                  wait for a manager to place them, and the notification says
                  so.
                </span>
              </span>
            </label>

            <button type="submit" className={buttonClass("primary", "md")}>
              Save enrolment policy
            </button>
          </form>
        )}
      </Panel>
    </div>
  );
}

/**
 * Surfacing an API refusal on the page that caused it.
 *
 * The API answers with a message or a list of them, joined by ApiError, and it
 * is shown as given: it refused for a reason, and a friendlier invention here
 * would hide which rule was broken.
 */
function refusalMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  return "That did not work.";
}
