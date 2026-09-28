import Link from "next/link";
import { revalidatePath } from "next/cache";
import { PERMISSIONS as P } from "@aim/contracts";
import { api, getSession, apiOrNotFound } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { act } from "@/lib/act";
import { EnrolPicker, type Candidate } from "@/components/enrol-picker";

interface Cohort {
  id: string;
  code: string;
  title: string;
  startsAt: string;
  endsAt: string | null;
  archivedAt: string | null;
  programmeVersion: {
    id: string;
    version: number;
    programme: { id: string; code: string; title: string };
  };
  enrollments: Array<{
    id: string;
    status: string;
    enrolledAt: string;
    withdrawnAt: string | null;
    user: { id: string; name: string; email: string; status: string };
  }>;
  clashes?: Array<{ userId: string; cohortCode: string }>;
  assignments: Array<{
    instructor: { id: string; name: string };
    learner: { id: string; name: string };
  }>;
}

interface UserRow {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  archivedAt: string | null;
}

const FIELD =
  "rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs";

/**
 * One cohort's roll: who is on it, who marks their work, and how to put
 * somebody on it. Shared by both portals -- see `CohortList`.
 */
export async function CohortRoll({
  id,
  basePath,
}: {
  id: string;
  basePath: string;
}) {
  const session = await getSession();
  const canEnrol = session.permissions.includes(P.ENROLLMENT_WRITE);
  const canAssign = session.permissions.includes(P.INSTRUCTOR_ASSIGN);

  const [cohort, candidates, examiners] = await Promise.all([
    apiOrNotFound<Cohort>(`/cohorts/${id}`),
    // 100 is the API's cap on a page of users, and asking for more is a 400.
    api<{ items: UserRow[] }>(
      "/users?role=STUDENT&pageSize=100&sort=name&direction=asc",
    ),
    api<{ items: UserRow[] }>(
      "/users?role=INSTRUCTOR&pageSize=100&sort=name&direction=asc",
    ),
  ]);

  const here = `${basePath}/${id}`;

  // Who is on this cohort already. They stay in the list, ticked: "already
  // on" and "not in this list at all" are different facts, and hiding the
  // first made them look like the second.
  const enrolled = new Set(
    cohort.enrollments
      .filter((e) => e.status === "ACTIVE")
      .map((e) => e.user.id),
  );

  // Who is on a *different* cohort of this same course, which the server
  // refuses. Named here so the reason is on screen before anyone tries.
  const blockedBy = new Map(
    (cohort.clashes ?? []).map((c) => [c.userId, c.cohortCode]),
  );

  const pickable: Candidate[] = candidates.items
    .filter((c) => !c.archivedAt && c.status === "ACTIVE")
    .map((c) => ({
      id: c.id,
      name: c.name,
      email: c.email,
      enrolled: enrolled.has(c.id),
      blockedBy: blockedBy.get(c.id) ?? null,
    }));

  // The examiner each learner answers to, if any.
  const examinerFor = new Map(
    cohort.assignments.map((a) => [a.learner.id, a.instructor]),
  );

  async function enrol(formData: FormData) {
    "use server";
    const userIds = formData.getAll("userIds").map(String).filter(Boolean);
    if (userIds.length === 0) return;
    await act(`/cohorts/${id}/enrollments/bulk`, {
      method: "POST",
      body: { userIds },
    });
    revalidatePath(here);
  }

  async function withdraw(formData: FormData) {
    "use server";
    await act(`/cohorts/${id}/withdrawals`, {
      method: "POST",
      body: {
        userId: String(formData.get("userId")),
        reason: String(formData.get("reason") ?? ""),
      },
    });
    revalidatePath(here);
  }

  async function assignOne(formData: FormData) {
    "use server";
    await act("/cohorts/assignments", {
      method: "POST",
      body: {
        instructorId: String(formData.get("instructorId")),
        learnerId: String(formData.get("learnerId")),
        cohortId: id,
      },
    });
    revalidatePath(here);
  }

  async function assignWholeCohort(formData: FormData) {
    "use server";
    await act(`/cohorts/${id}/assignments`, {
      method: "POST",
      body: { instructorId: String(formData.get("instructorId")) },
    });
    revalidatePath(here);
  }

  async function unassign(formData: FormData) {
    "use server";
    await act(
      `/cohorts/assignments/${String(formData.get("instructorId"))}/${String(
        formData.get("learnerId"),
      )}`,
      { method: "DELETE" },
    );
    revalidatePath(here);
  }

  const active = cohort.enrollments.filter((e) => e.status === "ACTIVE");
  const unassigned = active.filter((e) => !examinerFor.has(e.user.id));

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            Cohort &middot; {cohort.programmeVersion.programme.code} v
            {cohort.programmeVersion.version}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            <span className="font-mono text-brass-500">{cohort.code}</span>{" "}
            {cohort.title}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            Starts {new Date(cohort.startsAt).toLocaleDateString()}
            {cohort.endsAt
              ? ` · ends ${new Date(cohort.endsAt).toLocaleDateString()}`
              : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {cohort.archivedAt ? <Badge tone="neutral">ARCHIVED</Badge> : null}
          <Link
            href={basePath}
            className={buttonClass("secondary", "md")}
          >
            All cohorts
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Enrolled" value={active.length} />
        <Stat
          label="Withdrawn"
          value={
            cohort.enrollments.filter((e) => e.status === "WITHDRAWN").length
          }
        />
        <Stat label="Examiners assigned" value={cohort.assignments.length} />
        <Stat
          label="Without an examiner"
          value={unassigned.length}
          note={
            unassigned.length > 0
              ? "their work has nobody to mark it"
              : undefined
          }
        />
      </div>

      {canEnrol ? (
        <Panel
          title="Enrol candidates"
          hint="Everyone is listed. A candidate already on this cohort is ticked; one on another cohort of the same course says which, because a candidate sits one cohort of a course at a time."
        >
          {pickable.length === 0 ? (
            <Empty>There are no active candidates to place.</Empty>
          ) : (
            <EnrolPicker candidates={pickable} action={enrol} />
          )}
        </Panel>
      ) : null}

      {canAssign ? (
        <Panel
          title="Assign an examiner to everyone on this cohort"
          hint="The quick way. It assigns each active learner to that examiner; anyone already assigned keeps who they have."
        >
          <form
            action={assignWholeCohort}
            className="flex flex-wrap items-end gap-3"
          >
            <div>
              <label className="rule-label mb-1 block">Examiner</label>
              <select name="instructorId" required className={FIELD}>
                {examiners.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} — {e.email}
                  </option>
                ))}
              </select>
            </div>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Assign to all {active.length} active learners
            </button>
          </form>
        </Panel>
      ) : null}

      <Panel
        title="The roll"
        hint="Who is on this cohort, and which examiner may see and mark their work."
        action={<Badge>{cohort.enrollments.length} total</Badge>}
      >
        {cohort.enrollments.length === 0 ? (
          <Empty>Nobody is enrolled on this cohort yet.</Empty>
        ) : (
          <ul className="space-y-2">
            {cohort.enrollments.map((enrollment) => {
              const examiner = examinerFor.get(enrollment.user.id);
              return (
                <li
                  key={enrollment.id}
                  className="rounded-lg border border-ink-800 p-3"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <Link
                        href={`/admin/users/${enrollment.user.id}`}
                        className="text-sm font-medium hover:text-brass-500"
                      >
                        {enrollment.user.name}
                      </Link>
                      <p className="font-mono text-[11px] text-ink-500">
                        {enrollment.user.email}
                      </p>
                      <p className="mt-1 text-[11px] text-ink-400">
                        {examiner ? (
                          <>
                            Examiner:{" "}
                            <span className="text-ink-200">
                              {examiner.name}
                            </span>
                          </>
                        ) : (
                          <span className="text-signal-amber">
                            No examiner — nobody can mark this learner&rsquo;s
                            work
                          </span>
                        )}
                      </p>
                    </div>
                    <Badge
                      tone={
                        enrollment.status === "ACTIVE"
                          ? "green"
                          : enrollment.status === "COMPLETED"
                            ? "blue"
                            : "neutral"
                      }
                    >
                      {enrollment.status}
                    </Badge>
                  </div>

                  {enrollment.status === "ACTIVE" ? (
                    <div className="mt-2 flex flex-wrap items-end gap-2">
                      {canAssign ? (
                        <form
                          action={assignOne}
                          className="flex items-end gap-2"
                        >
                          <input
                            type="hidden"
                            name="learnerId"
                            value={enrollment.user.id}
                          />
                          <div>
                            <label className="rule-label mb-1 block">
                              {examiner ? "Reassign to" : "Assign examiner"}
                            </label>
                            <select
                              name="instructorId"
                              defaultValue={examiner?.id ?? ""}
                              className={FIELD}
                            >
                              {examiners.items.map((e) => (
                                <option key={e.id} value={e.id}>
                                  {e.name}
                                </option>
                              ))}
                            </select>
                          </div>
                          <button
                            type="submit"
                            className={buttonClass("secondary", "md")}
                          >
                            {examiner ? "Reassign" : "Assign"}
                          </button>
                        </form>
                      ) : null}

                      {canAssign && examiner ? (
                        <form action={unassign}>
                          <input
                            type="hidden"
                            name="instructorId"
                            value={examiner.id}
                          />
                          <input
                            type="hidden"
                            name="learnerId"
                            value={enrollment.user.id}
                          />
                          <ConfirmButton
                            type="submit"
                            confirm={`Unassign ${examiner?.name ?? "this examiner"} from ${enrollment.user.name}? Nobody will be able to mark their work.`}
                          >
                            Unassign
                          </ConfirmButton>
                        </form>
                      ) : null}

                      {canEnrol ? (
                        <form
                          action={withdraw}
                          className="flex items-end gap-2"
                        >
                          <input
                            type="hidden"
                            name="userId"
                            value={enrollment.user.id}
                          />
                          <div className="min-w-48">
                            <label className="rule-label mb-1 block">
                              Withdraw &mdash; why
                            </label>
                            <input
                              name="reason"
                              required
                              minLength={10}
                              className={`${FIELD} w-full`}
                            />
                          </div>
                          <ConfirmButton
                            type="submit"
                            confirm={`Withdraw ${enrollment.user.name} from this cohort?`}
                          >
                            Withdraw
                          </ConfirmButton>
                        </form>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

    </div>
  );
}
