import Link from "next/link";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, getSession, apiOrNotFound } from "@/lib/api";
import { Badge, Empty, FIELD, Panel, Stat, statusTone } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { BadgeMark } from "@/components/badge-mark";
import { ResetPanel } from "./reset-panel";
import {
  confirmUserEmail,
  revokeUserSessions,
  unlockUser,
} from "./security-actions";

interface UserDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  createdAt: string;
  updatedAt: string;
  suspendedAt: string | null;
  suspendedUntil: string | null;
  suspendedReason: string | null;
  archivedAt: string | null;
  archivedReason: string | null;
  emailVerifiedAt: string | null;
  organisation: string | null;
  jobTitle: string | null;
  country: string | null;
  phone: string | null;
  address: string | null;
  profileCompletedAt: string | null;
  createdBy: { id: string; name: string } | null;
  enrollments: Array<{
    id: string;
    status: string;
    enrolledAt: string;
    cohort: {
      id: string;
      code: string;
      title: string;
      programmeVersion: { programme: { code: string; title: string } };
    };
  }>;
  credentials: Array<{
    id: string;
    serial: string;
    status: string;
    issuedAt: string;
    programmeVersion: { programme: { code: string } };
  }>;
  badgeAwards: Array<{
    awardedAt: string;
    badge: {
      code: string;
      title: string;
      iconSvg: string | null;
      iconText: string | null;
      tone: string;
    };
  }>;
  assignmentsAsLearner: Array<{ instructor: { id: string; name: string } }>;
  sessions: Array<{
    id: string;
    createdAt: string;
    lastSeenAt: string;
    expiresAt: string;
    ip: string | null;
    userAgent: string | null;
    previewRole: string | null;
  }>;
  /** Live sessions in full; `sessions` above is the capped page of them. */
  sessionTotal: number;
  _count: { submissions: number; attempts: number; diagnostics: number };
  lastLoginAt: string | null;
  /** The password's standing, which decides which of the controls below apply. */
  passwordChangedAt: string | null;
  mustChangePassword: boolean;
  failedLoginCount: number;
  lockedUntil: string | null;
  progress: Array<{
    track: string;
    title: string;
    cohort: string;
    enrollmentStatus: string;
    version: number;
    lessons: number;
    lessonsCompleted: number;
    percent: number;
    modules: Array<{
      title: string;
      position: number;
      lessons: number;
      completed: number;
      done: boolean;
    }>;
  }>;
  attempts: Array<{
    id: string;
    startedAt: string;
    submittedAt: string | null;
    score: number | null;
    passed: boolean | null;
    assessment: string;
    assessmentTitle: string;
    track: string;
    passMark: number;
    attemptsUsed: number;
    maxAttempts: number;
  }>;
}

export default async function UserDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [session, user] = await Promise.all([
    getSession(),
    apiOrNotFound<UserDetail>(`/users/${id}/detail`),
  ]);
  /**
   * Ending somebody's session is its own permission now, not a borrowed one.
   *
   * It used to be `user.suspend`, on the reading that both stop somebody being
   * signed in. They are not the same act: a laptop left on a train is not a
   * disciplinary matter, and the control for it should not be the one that
   * stops somebody working.
   */
  const canRevoke = session.permissions.includes(P.USER_SESSION_REVOKE);
  const canResetPassword = session.permissions.includes(P.USER_PASSWORD_RESET);
  const canConfirmEmail = session.permissions.includes(P.USER_UPDATE);

  // A lapsed lock is not a lock. The API lifts it on the next request, so the
  // screen must not still call the account locked after the moment has passed.
  const isLocked =
    user.lockedUntil !== null && new Date(user.lockedUntil) > new Date();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="rule-label">User record</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">
            {user.name}
          </h1>
          <p className="mt-1 font-mono text-xs text-ink-400">{user.email}</p>
          <p className="mt-1 text-xs text-ink-400">
            Created {new Date(user.createdAt).toLocaleDateString()}
            {user.createdBy ? ` by ${user.createdBy.name}` : ""}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {user.lastLoginAt ? (
              <>Last signed in {new Date(user.lastLoginAt).toLocaleString()}</>
            ) : (
              <span className="text-signal-amber">Has never signed in</span>
            )}
          </p>
          <p className="mt-0.5 text-xs text-ink-400">
            {user.emailVerifiedAt ? (
              <>
                Email confirmed{" "}
                {new Date(user.emailVerifiedAt).toLocaleDateString()}
              </>
            ) : (
              <span className="text-signal-amber">
                Email not confirmed — this account cannot sign in yet
              </span>
            )}
          </p>
          {user.profileCompletedAt ? (
            <dl className="mt-2 grid max-w-xl grid-cols-[auto_1fr] gap-x-3 gap-y-0.5 text-xs">
              <dt className="text-ink-400">Organisation</dt>
              <dd>{user.organisation}</dd>
              <dt className="text-ink-400">Job title</dt>
              <dd>{user.jobTitle}</dd>
              <dt className="text-ink-400">Country</dt>
              <dd>{user.country}</dd>
              <dt className="text-ink-400">Phone</dt>
              <dd className="font-mono">{user.phone}</dd>
              <dt className="text-ink-400">Address</dt>
              <dd className="whitespace-pre-line">{user.address}</dd>
            </dl>
          ) : user.role !== "ADMIN" ? (
            <p className="mt-0.5 text-xs text-signal-amber">
              Profile not completed — held at the profile screen on sign-in
            </p>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Badge>{user.role}</Badge>
          {user.archivedAt ? (
            <Badge tone="neutral">ARCHIVED</Badge>
          ) : (
            <Badge tone={user.status === "ACTIVE" ? "green" : "amber"}>
              {user.status}
            </Badge>
          )}
        </div>
      </div>

      {!user.emailVerifiedAt && !user.archivedAt && canConfirmEmail ? (
        <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-4 py-3 text-sm text-signal-amber">
          <p className="font-semibold">This address has not been confirmed.</p>
          <p className="mt-0.5 text-xs leading-relaxed">
            Until it is, the account cannot sign in. If mail cannot reach this
            person, confirm the address here once you are satisfied it is
            theirs. Their enrolment and welcome follow exactly as if they had
            clicked the link, and the reason is recorded.
          </p>
          <form
            action={confirmUserEmail}
            className="mt-2 flex flex-wrap gap-2"
          >
            <input type="hidden" name="userId" value={user.id} />
            <input
              name="reason"
              required
              minLength={10}
              aria-label="Why confirm this address by hand"
              placeholder="How you know the address is theirs (recorded)"
              className={`${FIELD} flex-1`}
            />
            <ConfirmButton
              confirm={`Confirm ${user.email} as ${user.name}'s address?`}
              variant="secondary"
              size="md"
            >
              Confirm address
            </ConfirmButton>
          </form>
        </div>
      ) : null}

      {user.suspendedUntil || user.archivedReason ? (
        <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-4 text-xs text-ink-200">
          {user.archivedReason ? (
            <p>
              <b className="text-signal-amber">Archived.</b>{" "}
              {user.archivedReason}
            </p>
          ) : (
            <p>
              <b className="text-signal-amber">Suspended</b> until{" "}
              {new Date(user.suspendedUntil!).toLocaleString()}
              {user.suspendedReason ? ` — ${user.suspendedReason}` : ""}. It
              lifts by itself.
            </p>
          )}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Submissions" value={user._count.submissions} />
        <Stat
          label="Assessment attempts"
          value={user._count.attempts}
          note={
            user.attempts.length > 0
              ? `${user.attempts.filter((a) => a.passed).length} passed`
              : "none yet"
          }
        />
        <Stat label="Diagnostics" value={user._count.diagnostics} />
        <Stat label="Live sessions" value={user.sessionTotal} />
      </div>

      {user.progress.length > 0 ? (
        <Panel
          title="Course progress"
          hint="Counted over the lessons a candidate can actually see, on the version their cohort sits."
        >
          <ul className="space-y-3">
            {user.progress.map((course) => (
              <li
                key={`${course.track}-${course.cohort}`}
                className="rounded-lg border border-ink-800 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex flex-wrap items-center gap-2.5 text-xs">
                    <span className="font-mono text-brass-500">
                      {course.track}
                    </span>
                    <span className="text-ink-300">{course.title}</span>
                    <Badge
                      tone={
                        course.enrollmentStatus === "ACTIVE"
                          ? "green"
                          : "neutral"
                      }
                    >
                      {course.enrollmentStatus}
                    </Badge>
                    <span className="text-ink-500">
                      {course.cohort} &middot; v{course.version}
                    </span>
                  </span>
                  <span className="font-mono text-xs tabular-nums text-ink-300">
                    {course.lessonsCompleted}/{course.lessons} lessons &middot;{" "}
                    {course.percent}%
                  </span>
                </div>

                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-ink-900">
                  <div
                    className="h-full rounded-full bg-brass-500"
                    style={{ width: `${course.percent}%` }}
                  />
                </div>

                <div className="mt-2 flex flex-wrap gap-1">
                  {course.modules.map((module) => (
                    <span
                      key={module.position}
                      title={`${module.position}. ${module.title} — ${module.completed}/${module.lessons}`}
                      className={`rounded px-1.5 py-0.5 font-mono text-[11px] ${
                        module.done
                          ? "bg-signal-green/15 text-signal-green"
                          : module.completed > 0
                            ? "bg-signal-amber/15 text-signal-amber"
                            : "bg-ink-900 text-ink-500"
                      }`}
                    >
                      {module.position}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      {user.attempts.length > 0 ? (
        <Panel
          title="Assessment attempts"
          hint="Newest first, with how many of the allowed attempts have been used."
        >
          <ul className="space-y-1.5">
            {user.attempts.map((attempt) => (
              <li
                key={attempt.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
              >
                <span className="flex flex-wrap items-center gap-2.5">
                  <span className="font-mono text-brass-500">
                    {attempt.assessment}
                  </span>
                  <span className="text-ink-300">
                    {attempt.assessmentTitle}
                  </span>
                  <span className="text-ink-500">
                    attempt {attempt.attemptsUsed} of {attempt.maxAttempts}
                  </span>
                </span>
                <span className="flex items-center gap-2 text-ink-400">
                  {attempt.submittedAt === null ? (
                    <Badge tone="amber">in progress</Badge>
                  ) : (
                    <Badge tone={attempt.passed ? "green" : "red"}>
                      {attempt.passed ? "passed" : "failed"}
                    </Badge>
                  )}
                  <span className="w-20 text-right font-mono tabular-nums">
                    {attempt.score === null ? "—" : `${attempt.score}%`}
                    <span className="text-ink-600"> /{attempt.passMark}</span>
                  </span>
                  {new Date(attempt.startedAt).toLocaleDateString()}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Enrolments">
          {user.enrollments.length === 0 ? (
            <Empty>Not enrolled on any cohort.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {user.enrollments.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
                >
                  <span>
                    <span className="font-mono text-brass-500">
                      {e.cohort.code}
                    </span>{" "}
                    {e.cohort.title}
                  </span>
                  <Badge tone={statusTone(e.status)}>{e.status}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Examiners" hint="Who may see this learner's work.">
          {user.assignmentsAsLearner.length === 0 ? (
            <Empty>No examiner assigned.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {user.assignmentsAsLearner.map((a) => (
                <li
                  key={a.instructor.id}
                  className="rounded-lg border border-ink-800 px-3 py-2 text-xs"
                >
                  {a.instructor.name}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Credentials">
          {user.credentials.length === 0 ? (
            <Empty>No credential issued.</Empty>
          ) : (
            <ul className="space-y-1.5">
              {user.credentials.map((c) => (
                <li
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
                >
                  <span className="font-mono text-brass-500">{c.serial}</span>
                  <span className="flex items-center gap-2 text-ink-400">
                    {c.programmeVersion.programme.code}
                    <Badge tone={statusTone(c.status)}>{c.status}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Badges held">
          {user.badgeAwards.length === 0 ? (
            <Empty>No badge earned yet.</Empty>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {user.badgeAwards.map((a) => (
                <li
                  key={a.badge.code}
                  className="flex items-center gap-2 rounded-lg border border-ink-800 px-2.5 py-2"
                >
                  <BadgeMark
                    iconSvg={a.badge.iconSvg}
                    iconText={a.badge.iconText}
                    tone={a.badge.tone}
                    size="sm"
                    title={a.badge.title}
                  />
                  <span className="text-xs">{a.badge.title}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Password"
        hint="There is no way to read a password, here or anywhere: the column holds an argon2id hash and nothing else. What an administrator can do is end the one that exists and arrange for a new one."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2 text-xs text-ink-400">
            <p>
              Last set{" "}
              {user.passwordChangedAt ? (
                new Date(user.passwordChangedAt).toLocaleString()
              ) : (
                <span className="text-signal-amber">never recorded</span>
              )}
            </p>

            {user.mustChangePassword ? (
              <p className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-3 py-2 text-signal-amber">
                Held at the password screen. This account can reach nothing else
                until it sets a new password, which is enforced on the server
                rather than by the interface.
              </p>
            ) : null}

            {isLocked ? (
              <div className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2 text-signal-red">
                <p className="font-semibold">
                  Locked by repeated failed sign-ins.
                </p>
                <p className="mt-0.5">
                  Lifts by itself at{" "}
                  {new Date(user.lockedUntil as string).toLocaleString()}, so
                  this matters only for somebody who cannot wait.
                </p>
                {canResetPassword ? (
                  <form
                    action={unlockUser}
                    className="mt-2 flex flex-wrap gap-2"
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input
                      name="reason"
                      required
                      minLength={10}
                      placeholder="Why lift it early?"
                      className={`${FIELD} flex-1`}
                    />
                    <ConfirmButton
                      confirm={`Lift the lock on ${user.name}'s account now?`}
                      variant="secondary"
                      size="md"
                    >
                      Lift the lock
                    </ConfirmButton>
                  </form>
                ) : null}
              </div>
            ) : user.failedLoginCount > 0 ? (
              <p>
                {user.failedLoginCount} failed sign-in
                {user.failedLoginCount === 1 ? "" : "s"} since the last good
                one. A success clears the count.
              </p>
            ) : (
              <p>No failed sign-ins outstanding.</p>
            )}
          </div>

          <div className="rounded-lg border border-ink-800 p-3">
            {canResetPassword ? (
              <ResetPanel
                userId={user.id}
                name={user.name}
                email={user.email}
              />
            ) : (
              <Empty>
                Resetting a password needs {P.USER_PASSWORD_RESET}, which your
                role does not hold.
              </Empty>
            )}
          </div>
        </div>
      </Panel>

      <Panel
        title="Live sessions"
        hint={
          user.sessionTotal > user.sessions.length
            ? `${user.sessionTotal} live, showing the ${user.sessions.length} most recently used. Ending them all covers every one, not just the ones listed.`
            : "Opaque tokens, looked up on every request, so ending one takes effect at once. Suspending, archiving or changing a role revokes all of them as a side effect."
        }
        action={
          canRevoke && user.sessionTotal > 0 ? (
            <form
              action={revokeUserSessions}
              className="flex flex-wrap items-center gap-2"
            >
              <input type="hidden" name="userId" value={user.id} />
              <input
                name="reason"
                required
                minLength={10}
                placeholder="Why end them all?"
                className={`${FIELD} w-52`}
              />
              <ConfirmButton
                confirm={`End all ${user.sessionTotal} of ${user.name}'s sessions? They sign in again with their existing password.`}
                variant="danger"
                size="md"
              >
                End all {user.sessionTotal}
              </ConfirmButton>
            </form>
          ) : null
        }
      >
        {user.sessions.length === 0 ? (
          <Empty>No live session.</Empty>
        ) : (
          <ul className="space-y-2">
            {user.sessions.map((s) => (
              <li
                key={s.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-xs">
                    <span className="font-mono text-ink-200">
                      {s.ip ?? "unknown address"}
                    </span>
                    {s.previewRole ? (
                      <Badge tone="amber">previewing {s.previewRole}</Badge>
                    ) : null}
                  </p>
                  <p className="mt-0.5 max-w-lg truncate text-[11px] text-ink-400">
                    {s.userAgent ?? "unknown client"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-ink-400">
                    last seen {new Date(s.lastSeenAt).toLocaleString()}
                  </p>
                </div>

                {canRevoke ? (
                  <form
                    action={revokeUserSessions}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <input type="hidden" name="userId" value={user.id} />
                    <input type="hidden" name="sessionId" value={s.id} />
                    <input
                      name="reason"
                      required
                      minLength={10}
                      placeholder="Why?"
                      className={`${FIELD} w-40`}
                    />
                    <ConfirmButton
                      confirm={`End ${user.name}'s session from ${s.ip ?? "that address"}? That device is signed out at once.`}
                    >
                      End
                    </ConfirmButton>
                  </form>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Link
        href="/admin/users"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to users
      </Link>
    </div>
  );
}
