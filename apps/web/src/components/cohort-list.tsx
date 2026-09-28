import Link from "next/link";
import { revalidatePath } from "next/cache";
import { api, apiOrNull } from "@/lib/api";
import { Badge, Empty, Panel, buttonClass } from "@/components/ui";
import { act } from "@/lib/act";

interface Cohort {
  id: string;
  code: string;
  title: string;
  startsAt: string;
  programmeVersion: {
    version: number;
    programme: { code: string; title: string };
  };
  _count: { enrollments: number };
}

interface Programme {
  id: string;
  code: string;
  versions: Array<{ id: string; version: number; status: string }>;
}

interface Instructor {
  id: string;
  name: string;
}

/**
 * Every cohort, and the way on to each one's roll.
 *
 * Shared by the manager and administration portals rather than living in one
 * of them: both roles hold enrollment.write, and a screen only one of them
 * could reach was the reason an administrator had no way to place a candidate
 * at all. `basePath` is the portal it is being rendered in, so every link and
 * every revalidate points back at the screen the reader is actually on.
 */
export async function CohortList({ basePath }: { basePath: string }) {
  const [cohorts, programmes, instructors] = await Promise.all([
    api<Cohort[]>("/cohorts"),
    api<Programme[]>("/academy/programmes"),
    // Null for a role preview, which never borrows instructor.assign: the
    // page then renders read-only, with nobody to assign to, instead of failing.
    apiOrNull<Instructor[]>("/users/instructors").then((rows) => rows ?? []),
  ]);

  const publishedVersions = programmes.flatMap((programme) =>
    programme.versions
      .filter((version) => version.status === "PUBLISHED")
      .map((version) => ({
        id: version.id,
        label: `${programme.code} v${version.version}`,
      })),
  );

  async function createCohort(formData: FormData) {
    "use server";
    await act("/cohorts", {
      method: "POST",
      body: {
        code: String(formData.get("code") ?? ""),
        title: String(formData.get("title") ?? ""),
        programmeVersionId: String(formData.get("programmeVersionId") ?? ""),
        startsAt: new Date(String(formData.get("startsAt"))).toISOString(),
      },
    });
    revalidatePath(basePath);
  }

  async function assignCohort(formData: FormData) {
    "use server";
    await act(`/cohorts/${String(formData.get("cohortId"))}/assignments`, {
      method: "POST",
      body: { instructorId: String(formData.get("instructorId")) },
    });
    revalidatePath(basePath);
  }

  return (
    <div className="space-y-6">
      <Panel
        title="New cohort"
        hint="A cohort can only run a published programme version."
      >
        <form action={createCohort} className="flex flex-wrap items-end gap-3">
          <div>
            <label className="rule-label mb-1 block">Code</label>
            <input
              name="code"
              required
              className="w-40 rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 font-mono text-xs"
            />
          </div>
          <div className="flex-1 min-w-48">
            <label className="rule-label mb-1 block">Title</label>
            <input
              name="title"
              required
              className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
            />
          </div>
          <div>
            <label className="rule-label mb-1 block">Programme version</label>
            <select
              name="programmeVersionId"
              required
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-2 text-xs"
            >
              {publishedVersions.map((version) => (
                <option key={version.id} value={version.id}>
                  {version.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="rule-label mb-1 block">Starts</label>
            <input
              name="startsAt"
              type="date"
              required
              className="rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs"
            />
          </div>
          <button type="submit" className={buttonClass("primary", "md")}>
            Create cohort
          </button>
        </form>
      </Panel>

      <Panel
        title="Cohorts"
        hint="Open a cohort to enrol candidates on it, withdraw them, and set who marks their work."
      >
        {cohorts.length === 0 ? (
          <Empty>No cohorts yet.</Empty>
        ) : (
          <ul className="space-y-3">
            {cohorts.map((cohort) => (
              <li
                key={cohort.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <Link
                      href={`${basePath}/${cohort.id}`}
                      className="hover:text-brass-500"
                    >
                      <span className="font-mono text-xs text-brass-500">
                        {cohort.code}
                      </span>
                      <span className="ml-2 text-sm font-medium">
                        {cohort.title}
                      </span>
                    </Link>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {cohort.programmeVersion.programme.code} v
                      {cohort.programmeVersion.version} &middot; starts{" "}
                      {new Date(cohort.startsAt).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="flex items-center gap-2">
                    <Badge>{cohort._count.enrollments} enrolled</Badge>
                    <Link
                      href={`${basePath}/${cohort.id}`}
                      className={buttonClass("secondary", "md")}
                    >
                      Roll &amp; enrolment &rarr;
                    </Link>
                  </span>
                </div>

                <form
                  action={assignCohort}
                  className="mt-3 flex flex-wrap items-end gap-2"
                >
                  <input type="hidden" name="cohortId" value={cohort.id} />
                  <div>
                    <label className="rule-label mb-1 block">
                      Assign examiner to all learners
                    </label>
                    <select
                      name="instructorId"
                      required
                      className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
                    >
                      {instructors.map((instructor) => (
                        <option key={instructor.id} value={instructor.id}>
                          {instructor.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className={buttonClass("secondary", "md")}
                  >
                    Assign
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}
