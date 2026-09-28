import type { LiveSessionPage } from "@aim/contracts";
import { api, getSession } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { PasswordForm } from "../password-form";
import { endOtherSessions, endSession } from "../actions";

export default async function SecurityPage({
  searchParams,
}: {
  searchParams: Promise<{ forced?: string }>;
}) {
  const { forced } = await searchParams;
  const session = await getSession();
  const live = await api<LiveSessionPage>("/auth/sessions");
  const sessions = live.items;

  // The hold is the server's fact, not the query string's. The `forced` flag
  // only says how the person arrived here.
  const held = session.mustChangePassword === true;
  // Every session but this one, counted over the whole set rather than the
  // page: the button ends all of them and must not understate what it does.
  const otherTotal = live.total - live.items.filter((s) => s.current).length;

  return (
    <div className="space-y-6">
      <div>
        <p className="rule-label">Your account</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Security</h1>
        <p className="mt-1 max-w-2xl text-xs text-ink-400">
          Your password and everything signed in as you. Passwords are stored as
          argon2id hashes — there is no column anyone, including an
          administrator, could read one back from.
        </p>
      </div>

      {held ? (
        <div
          role="alert"
          className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-4 py-3 text-sm text-signal-amber"
        >
          <p className="font-semibold">
            Your password must be changed before you can go anywhere else.
          </p>
          <p className="mt-1 text-xs leading-relaxed">
            Either an administrator reset this account, or it is new and the
            password was chosen by somebody other than you. Until you set your
            own, this screen is the only one that answers — that is enforced on
            the server, not just here.
            {forced ? " You were sent here from a page that refused." : ""}
          </p>
        </div>
      ) : null}

      <Panel
        title="Change your password"
        hint={
          session.previewRole
            ? "Not while a role preview is on — leave the preview first."
            : "The current one is required, even though you are already signed in."
        }
      >
        {session.previewRole ? (
          <Empty>
            You are previewing the {session.previewRole} portal, which is
            read-only. Leave the preview to change your password.
          </Empty>
        ) : (
          <PasswordForm
            email={session.user.email}
            name={session.user.name}
            forced={held}
          />
        )}
      </Panel>

      <Panel
        title="Where you are signed in"
        hint={
          live.total > live.shown
            ? `${live.total} live sessions, showing the ${live.shown} most recently used. Ending all others covers every one of them, not just the ones listed.`
            : "Sessions are opaque tokens looked up on every request, so ending one takes effect immediately rather than whenever it would have expired."
        }
        action={
          otherTotal > 0 && !held ? (
            <form action={endOtherSessions}>
              <ConfirmButton
                confirm={`End ${otherTotal} other session${
                  otherTotal === 1 ? "" : "s"
                }? You will stay signed in here.`}
                variant="secondary"
                size="md"
              >
                End all {otherTotal} other{otherTotal === 1 ? "" : "s"}
              </ConfirmButton>
            </form>
          ) : null
        }
      >
        {sessions.length === 0 ? (
          <Empty>
            No live session, which should be impossible while you are reading
            this.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {sessions.map((row) => (
              <li
                key={row.id}
                className={`flex flex-wrap items-center justify-between gap-3 rounded-lg border px-3 py-2.5 ${
                  row.current
                    ? "border-brass-500/50 bg-brass-500/5"
                    : "border-ink-800"
                }`}
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-ink-200">
                      {row.ip ?? "unknown address"}
                    </span>
                    {row.current ? <Badge tone="green">This one</Badge> : null}
                    {row.previewRole ? (
                      <Badge tone="amber">previewing {row.previewRole}</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 max-w-xl truncate text-[11px] text-ink-400">
                    {row.userAgent ?? "unknown client"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    Started {new Date(row.createdAt).toLocaleString()} · last
                    seen {new Date(row.lastSeenAt).toLocaleString()} · expires{" "}
                    {new Date(row.expiresAt).toLocaleString()}
                  </p>
                </div>

                {held ? null : (
                  <form action={endSession}>
                    <input type="hidden" name="sessionId" value={row.id} />
                    <ConfirmButton
                      confirm={
                        row.current
                          ? "End this session? You will be signed out."
                          : `End the session from ${row.ip ?? "that address"}?`
                      }
                    >
                      {row.current ? "Sign out here" : "End"}
                    </ConfirmButton>
                  </form>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {held ? null : (
        <p className="text-xs text-ink-400">
          Forgotten it instead?{" "}
          <a href="/login/forgot" className={buttonClass("quiet", "sm")}>
            Ask for a reset link
          </a>
        </p>
      )}
    </div>
  );
}
