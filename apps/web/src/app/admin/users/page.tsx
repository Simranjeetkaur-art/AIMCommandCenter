import Link from "next/link";
import { revalidatePath } from "next/cache";
import { MIN_PASSWORD_LENGTH, PERMISSIONS as P } from "@aim/contracts";
import { api, getSession } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { act, done } from "@/lib/act";
import { ConfirmButton } from "@/components/confirm-button";
import { SubmitButton } from "@/components/submit-button";

interface UserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  createdAt: string;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
}

interface UsersPage {
  items: UserRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Counted across the whole filtered roll, not just the page shown. */
  byRole: Record<string, number>;
  /**
   * Archived accounts matching the other filters, counted whether or not they
   * are currently being shown — the tile is most useful exactly when they are
   * hidden.
   */
  archivedTotal: number;
}

const ROLES = ["STUDENT", "INSTRUCTOR", "MANAGER", "ADMIN"];
const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
    search?: string;
    status?: string;
    archived?: string;
    sort?: string;
    direction?: string;
    page?: string;
  }>;
}) {
  const sp = await searchParams;
  const session = await getSession();
  const canEdit = session.permissions.includes(P.USER_UPDATE);
  const canArchive = session.permissions.includes(P.USER_ARCHIVE);

  const query = new URLSearchParams({ pageSize: "25", page: sp.page ?? "1" });
  if (sp.role) query.set("role", sp.role);
  if (sp.search) query.set("search", sp.search);
  if (sp.status) query.set("status", sp.status);
  if (sp.archived === "true") query.set("includeArchived", "true");
  if (sp.sort) query.set("sort", sp.sort);
  if (sp.direction) query.set("direction", sp.direction);

  const users = await api<UsersPage>(`/users?${query.toString()}`);
  const pages = Math.ceil(users.total / users.pageSize);

  async function createUser(formData: FormData) {
    "use server";
    await act("/users", {
      method: "POST",
      body: {
        email: String(formData.get("email") ?? ""),
        name: String(formData.get("name") ?? ""),
        role: String(formData.get("role") ?? "STUDENT"),
        temporaryPassword: String(formData.get("temporaryPassword") ?? ""),
      },
    });
    revalidatePath("/admin/users");
    await done(
      `Created ${String(formData.get("email") ?? "")}. They are held at the password screen until they set their own.`,
    );
  }

  async function editUser(formData: FormData) {
    "use server";
    await act(`/users/${String(formData.get("userId"))}`, {
      method: "PATCH",
      body: {
        name: String(formData.get("name") ?? ""),
        email: String(formData.get("email") ?? ""),
        reason: String(formData.get("reason") ?? ""),
      },
    });
    revalidatePath("/admin/users");
  }

  async function changeRole(formData: FormData) {
    "use server";
    await act(`/users/${String(formData.get("userId"))}/role`, {
      method: "PATCH",
      body: {
        role: String(formData.get("role")),
        reason: String(formData.get("reason") ?? ""),
      },
    });
    revalidatePath("/admin/users");
    await done(
      `Role changed to ${String(formData.get("role"))}. Every session they had has ended.`,
    );
  }

  async function toggleSuspension(formData: FormData) {
    "use server";
    const until = String(formData.get("until") ?? "");
    await act(`/users/${String(formData.get("userId"))}/status`, {
      method: "PATCH",
      body: {
        action: String(formData.get("action")),
        reason: String(formData.get("reason") ?? ""),
        ...(until ? { until: new Date(until).toISOString() } : {}),
      },
    });
    revalidatePath("/admin/users");
    await done(
      String(formData.get("action")) === "SUSPEND"
        ? "Account suspended. Every session it had has ended."
        : "Account reinstated.",
    );
  }

  async function toggleArchive(formData: FormData) {
    "use server";
    await act(`/users/${String(formData.get("userId"))}/archive`, {
      method: "POST",
      body: {
        action: String(formData.get("action")),
        reason: String(formData.get("reason") ?? ""),
      },
    });
    revalidatePath("/admin/users");
    await done(
      String(formData.get("action")) === "ARCHIVE"
        ? "Account archived. It can be restored; it is never deleted."
        : "Account restored.",
    );
  }

  /** The current filter, as a link, so a tile can add one thing to it. */
  const withParam = (key: string, value: string | null) => {
    const next = new URLSearchParams();
    for (const [k, v] of Object.entries(sp)) {
      if (v && k !== "page") next.set(k, String(v));
    }
    if (value === null) next.delete(key);
    else next.set(key, value);
    const qs = next.toString();
    return qs ? `/admin/users?${qs}` : "/admin/users";
  };

  const showingArchived = sp.archived === "true";

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {ROLES.map((role) => (
          <Stat
            key={role}
            label={role.toLowerCase()}
            value={users.byRole[role] ?? 0}
            note="on the roll"
            href={withParam("role", role)}
            active={sp.role === role}
          />
        ))}
        {/* Archived accounts are hidden by default, so this is both the count
            and the way to see them. It is a fact about the roll rather than
            about this page: counting the rows would report zero precisely
            when somebody wants to know there are some. */}
        <Stat
          label="archived"
          value={users.archivedTotal}
          note={showingArchived ? "shown below" : "hidden — open to see"}
          href={withParam("archived", showingArchived ? null : "true")}
          active={showingArchived}
        />
      </div>

      <Panel
        title="Find a user"
        hint="Filters are applied by the server, so a large roll stays workable."
      >
        <form className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-48">
            <label className="rule-label mb-1 block">Name or email</label>
            <input
              name="search"
              defaultValue={sp.search ?? ""}
              placeholder="mei, @aim.edu"
              className={`w-full ${FIELD}`}
            />
          </div>
          <div>
            <label className="rule-label mb-1 block">Role</label>
            <select name="role" defaultValue={sp.role ?? ""} className={FIELD}>
              <option value="">Any</option>
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rule-label mb-1 block">Status</label>
            <select
              name="status"
              defaultValue={sp.status ?? ""}
              className={FIELD}
            >
              <option value="">Any</option>
              <option value="ACTIVE">ACTIVE</option>
              <option value="SUSPENDED">SUSPENDED</option>
            </select>
          </div>
          <div>
            <label className="rule-label mb-1 block">Sort</label>
            <select
              name="sort"
              defaultValue={sp.sort ?? "role"}
              className={FIELD}
            >
              <option value="role">Role</option>
              <option value="name">Name</option>
              <option value="email">Email</option>
              <option value="createdAt">Created</option>
            </select>
          </div>
          <label className="flex items-center gap-2 pb-2 text-xs text-ink-400">
            <input
              type="checkbox"
              name="archived"
              value="true"
              defaultChecked={sp.archived === "true"}
            />
            Show archived
          </label>
          <button type="submit" className={buttonClass("secondary", "md")}>
            Apply
          </button>
          <Link
            href="/admin/users"
            className="px-2 py-2 text-xs text-ink-400 hover:text-ink-200"
          >
            Clear
          </Link>
        </form>
      </Panel>

      <Panel
        title="Create user"
        hint="The temporary password is hashed with argon2id on arrival."
      >
        <form action={createUser} className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-40">
            <label htmlFor="new-user-name" className="rule-label mb-1 block">
              Name
            </label>
            <input
              id="new-user-name"
              name="name"
              required
              minLength={2}
              className={`w-full ${FIELD}`}
            />
          </div>
          <div className="flex-1 min-w-40">
            <label htmlFor="new-user-email" className="rule-label mb-1 block">
              Email
            </label>
            <input
              id="new-user-email"
              name="email"
              type="email"
              required
              className={`w-full ${FIELD}`}
            />
          </div>
          <div>
            <label htmlFor="new-user-role" className="rule-label mb-1 block">
              Role
            </label>
            <select id="new-user-role" name="role" className={FIELD}>
              {ROLES.map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div className="flex-1 min-w-40">
            <label
              htmlFor="new-user-password"
              className="rule-label mb-1 block"
            >
              Temporary password
            </label>
            <input
              id="new-user-password"
              name="temporaryPassword"
              required
              minLength={MIN_PASSWORD_LENGTH}
              className={`w-full font-mono ${FIELD}`}
            />
          </div>
          <SubmitButton pendingLabel="Creating…">Create</SubmitButton>
        </form>
      </Panel>

      <Panel
        title={`Users — ${users.total} matching`}
        hint="A role change, a suspension or an archive revokes every live session immediately."
      >
        {users.items.length === 0 ? (
          <Empty>No user matches those filters.</Empty>
        ) : (
          <ul className="space-y-2">
            {users.items.map((user) => (
              <li
                key={user.id}
                className={`rounded-lg border p-3 ${user.archivedAt ? "border-ink-800 bg-ink-950/40 opacity-70" : "border-ink-800"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`/admin/users/${user.id}`}
                      className="text-sm font-medium hover:text-brass-500"
                    >
                      {user.name}
                    </Link>
                    <p className="mt-0.5 font-mono text-xs text-ink-400">
                      {user.email}
                    </p>
                    {user.suspendedUntil ? (
                      <p className="mt-0.5 text-[11px] text-signal-amber">
                        Suspended until{" "}
                        {new Date(user.suspendedUntil).toLocaleString()}
                      </p>
                    ) : null}
                    {user.archivedReason ? (
                      <p className="mt-0.5 text-[11px] text-ink-400">
                        Archived: {user.archivedReason}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge>{user.role}</Badge>
                    {user.archivedAt ? (
                      <Badge tone="neutral">ARCHIVED</Badge>
                    ) : (
                      <Badge
                        tone={user.status === "ACTIVE" ? "green" : "amber"}
                      >
                        {user.status}
                      </Badge>
                    )}
                  </div>
                </div>

                {!user.archivedAt ? (
                  <div className="mt-2.5 space-y-2">
                    {canEdit ? (
                      <form
                        action={editUser}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          name="name"
                          defaultValue={user.name}
                          className={`w-40 ${FIELD}`}
                          aria-label="Name"
                        />
                        <input
                          name="email"
                          defaultValue={user.email}
                          className={`w-52 font-mono ${FIELD}`}
                          aria-label="Email"
                        />
                        <input
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Why (recorded)"
                          aria-label={`Why ${user.name}'s details are changing`}
                          className={`w-48 ${FIELD}`}
                        />
                        <SubmitButton variant="secondary">
                          Save details
                        </SubmitButton>
                      </form>
                    ) : null}

                    <div className="flex flex-wrap items-end gap-2">
                      <form
                        action={changeRole}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <select
                          name="role"
                          defaultValue={user.role}
                          aria-label={`New role for ${user.name}`}
                          className={FIELD}
                        >
                          {ROLES.map((r) => (
                            <option key={r}>{r}</option>
                          ))}
                        </select>
                        <input
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Reason (recorded)"
                          aria-label={`Why ${user.name}'s role is changing`}
                          className={`w-44 ${FIELD}`}
                        />
                        <ConfirmButton
                          confirm={`Change ${user.name}'s role? Every session they have will end.`}
                          variant="secondary"
                          size="md"
                        >
                          Change role
                        </ConfirmButton>
                      </form>

                      <form
                        action={toggleSuspension}
                        className="flex flex-wrap items-end gap-2"
                      >
                        <input type="hidden" name="userId" value={user.id} />
                        <input
                          type="hidden"
                          name="action"
                          value={
                            user.status === "ACTIVE" ? "SUSPEND" : "REINSTATE"
                          }
                        />
                        {user.status === "ACTIVE" ? (
                          <label className="block">
                            <span className="rule-label mb-1 block">
                              Until (optional)
                            </span>
                            <input
                              name="until"
                              type="datetime-local"
                              className={FIELD}
                            />
                          </label>
                        ) : null}
                        <input
                          name="reason"
                          required
                          minLength={10}
                          placeholder="Reason (recorded)"
                          aria-label={`Why ${user.name} is being ${user.status === "ACTIVE" ? "suspended" : "reinstated"}`}
                          className={`w-44 ${FIELD}`}
                        />
                        <ConfirmButton
                          confirm={
                            user.status === "ACTIVE"
                              ? `Suspend ${user.name} (${user.email})? Every session they have will end.`
                              : `Reinstate ${user.name} (${user.email})?`
                          }
                          variant={
                            user.status === "ACTIVE" ? "danger" : "secondary"
                          }
                          size="md"
                        >
                          {user.status === "ACTIVE" ? "Suspend" : "Reinstate"}
                        </ConfirmButton>
                      </form>
                    </div>
                  </div>
                ) : null}

                {canArchive ? (
                  <form
                    action={toggleArchive}
                    className="mt-2 flex flex-wrap items-end gap-2"
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input
                      type="hidden"
                      name="action"
                      value={user.archivedAt ? "RESTORE" : "ARCHIVE"}
                    />
                    <input
                      name="reason"
                      required
                      minLength={10}
                      placeholder={
                        user.archivedAt
                          ? "Why restore (recorded)"
                          : "Why archive (recorded)"
                      }
                      aria-label={`Why ${user.archivedAt ? "restore" : "archive"} ${user.name}`}
                      className={`w-56 ${FIELD}`}
                    />
                    <ConfirmButton
                      confirm={
                        user.archivedAt
                          ? `Restore ${user.name} (${user.email})?`
                          : `Archive ${user.name} (${user.email})? Every session they have will end.`
                      }
                      variant={user.archivedAt ? "secondary" : "danger"}
                      size="md"
                    >
                      {user.archivedAt ? "Restore account" : "Archive account"}
                    </ConfirmButton>
                    {!user.archivedAt ? (
                      <span className="pb-2 text-[11px] text-ink-400">
                        Archived, never deleted — the audit events they caused
                        must keep naming them.
                      </span>
                    ) : null}
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {pages > 1 ? (
          <nav className="mt-4 flex flex-wrap items-center gap-2 text-xs">
            {Array.from({ length: Math.min(pages, 12) }, (_, i) => i + 1).map(
              (n) => {
                const q = new URLSearchParams(sp as Record<string, string>);
                q.set("page", String(n));
                return (
                  <Link
                    key={n}
                    href={`/admin/users?${q.toString()}`}
                    className={`rounded border px-2 py-1 ${
                      n === users.page
                        ? "border-brass-500 text-brass-500"
                        : "border-ink-800 text-ink-400"
                    }`}
                  >
                    {n}
                  </Link>
                );
              },
            )}
          </nav>
        ) : null}
      </Panel>
    </div>
  );
}
