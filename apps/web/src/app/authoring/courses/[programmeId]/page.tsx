import Link from "next/link";
import { revalidatePath } from "next/cache";
import { api } from "@/lib/api";
import { Badge, Empty, Panel, Stat, buttonClass } from "@/components/ui";
import { SubmitButton } from "@/components/submit-button";
import { act } from "@/lib/act";

interface Programme {
  id: string;
  code: string;
  title: string;
  summary: string;
  status: string;
  level: number;
  levelLabel: string | null;
  tagline: string;
  visible: boolean;
  selfEnrol: boolean;
  prerequisiteCode: string | null;
  versions: Array<{ id: string; version: number; status: string }>;
}

interface Cohort {
  id: string;
  code: string;
  title: string;
  archivedAt: string | null;
  programmeVersion: {
    version: number;
    programme: { code: string };
  };
  _count: { enrollments: number };
}

/**
 * One course's settings, in one place.
 *
 * What belongs here is everything about the course as a thing people join and
 * are measured by -- who may join it and how, whether candidates can see it,
 * where it sits on the ladder -- as opposed to its contents, which are the
 * track version's business and are edited there.
 */
export default async function CourseSettingsPage({
  params,
}: {
  params: Promise<{ programmeId: string }>;
}) {
  const { programmeId } = await params;
  const [programmes, cohorts] = await Promise.all([
    api<Programme[]>("/academy/programmes"),
    api<Cohort[]>("/cohorts"),
  ]);

  const programme = programmes.find((p) => p.id === programmeId);
  if (!programme) {
    return (
      <Panel title="No such course">
        <Empty>That course does not exist, or is not yours to edit.</Empty>
      </Panel>
    );
  }

  const here = `/authoring/courses/${programmeId}`;
  const mine = cohorts.filter(
    (c) => c.programmeVersion.programme.code === programme.code,
  );
  const live = mine.filter((c) => !c.archivedAt);
  const published = programme.versions.find((v) => v.status === "PUBLISHED");

  async function saveEnrolment(formData: FormData) {
    "use server";
    await act(`/academy/programmes/${programmeId}/ladder`, {
      method: "PATCH",
      body: { selfEnrol: formData.get("selfEnrol") === "on" },
    });
    revalidatePath(here);
    revalidatePath("/authoring");
  }

  async function saveVisibility(formData: FormData) {
    "use server";
    await act(`/academy/programmes/${programmeId}/visibility`, {
      method: "PATCH",
      body: { visible: formData.get("visible") === "on" },
    });
    revalidatePath(here);
    revalidatePath("/authoring");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <nav
            aria-label="Breadcrumb"
            className="rule-label flex flex-wrap items-center gap-1.5"
          >
            <Link href="/authoring" className="hover:text-brass-500">
              AIM&trade; Academy
            </Link>
            <span aria-hidden="true">›</span>
            <span className="text-ink-200">Course settings</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            <span className="font-mono text-brass-500">{programme.code}</span>{" "}
            {programme.title}
          </h1>
          <p className="mt-1 max-w-2xl text-xs text-ink-400">
            {programme.summary}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={programme.status === "ACTIVE" ? "green" : "amber"}>
            {programme.status}
          </Badge>
          <Link href="/authoring" className={buttonClass("secondary", "md")}>
            All tracks
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Stat label="Level" value={programme.levelLabel ?? programme.level} />
        <Stat
          label="Live cohorts"
          value={live.length}
          note={`${live.reduce((n, c) => n + c._count.enrollments, 0)} enrolled`}
        />
        <Stat
          label="Published version"
          value={published ? `v${published.version}` : "—"}
        />
        <Stat
          label="Self-enrolment"
          value={programme.selfEnrol ? "On" : "Off"}
          note={
            programme.selfEnrol
              ? "candidates may join unaided"
              : "staff place candidates"
          }
        />
      </div>

      <Panel
        title="How candidates join"
        hint="The one decision that changes who controls the roll."
      >
        <form action={saveEnrolment} className="space-y-3">
          <label className="flex items-start gap-3 rounded-lg border border-ink-800 p-3">
            <input
              type="checkbox"
              name="selfEnrol"
              defaultChecked={programme.selfEnrol}
              className="mt-0.5 h-4 w-4 accent-[var(--color-brass-500)]"
            />
            <span className="text-sm">
              Let candidates enrol themselves on this course
              <span className="mt-1 block text-xs leading-relaxed text-ink-400">
                With this on, any signed-in candidate can put themselves on the
                most recent live cohort from the Academy, without asking. With
                it off, an administrator or manager places them, which is the
                default: a course somebody can join unasked is a decision, not
                a default.
              </span>
              <span className="mt-1 block text-xs leading-relaxed text-ink-400">
                Either way a candidate sits one cohort of this course at a
                time, and the certificate is earned the same way.
              </span>
            </span>
          </label>
          <SubmitButton size="md" pendingLabel="Saving…">
            Save enrolment setting
          </SubmitButton>
        </form>
      </Panel>

      <Panel
        title="Visible to candidates"
        hint="Hiding a course leaves everybody already on it exactly where they are."
      >
        <form action={saveVisibility} className="space-y-3">
          <label className="flex items-start gap-3 rounded-lg border border-ink-800 p-3">
            <input
              type="checkbox"
              name="visible"
              defaultChecked={programme.visible}
              className="mt-0.5 h-4 w-4 accent-[var(--color-brass-500)]"
            />
            <span className="text-sm">
              Show this course in the Academy
              <span className="mt-1 block text-xs text-ink-400">
                Hidden courses stay out of the catalogue and out of
                self-enrolment.
              </span>
            </span>
          </label>
          <SubmitButton size="md" pendingLabel="Saving…">
            Save visibility
          </SubmitButton>
        </form>
      </Panel>

      <Panel
        title="Cohorts running this course"
        hint="Self-enrolment puts a candidate on the most recent live cohort."
      >
        {live.length === 0 ? (
          <Empty>
            No live cohort. Self-enrolment has nowhere to put anybody until one
            exists.
          </Empty>
        ) : (
          <ul className="space-y-2">
            {live.map((cohort) => (
              <li
                key={cohort.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-sm"
              >
                <span>
                  <span className="font-mono text-xs text-brass-500">
                    {cohort.code}
                  </span>{" "}
                  {cohort.title}
                </span>
                <span className="flex items-center gap-2">
                  <Badge>{cohort._count.enrollments} enrolled</Badge>
                  <Link
                    href={`/admin/cohorts/${cohort.id}`}
                    className={buttonClass("secondary", "sm")}
                  >
                    Roll &amp; enrolment &rarr;
                  </Link>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel
        title="The rest of this course"
        hint="Its ladder, its content and the papers candidates sit."
      >
        <div className="flex flex-wrap gap-2">
          <Link
            href={`/authoring/restrictions/${programmeId}`}
            className={buttonClass("secondary", "md")}
          >
            Restriction &amp; certification gate
          </Link>
          <Link
            href={`/authoring/banks?programmeId=${programmeId}`}
            className={buttonClass("secondary", "md")}
          >
            Question banks
          </Link>
          <Link
            href={`/authoring/badges?programmeCode=${programme.code}`}
            className={buttonClass("secondary", "md")}
          >
            Badges
          </Link>
          {published ? (
            <Link
              href={`/authoring/tracks/${published.id}`}
              className={buttonClass("primary", "md")}
            >
              Modules, lessons &amp; papers
            </Link>
          ) : null}
        </div>
      </Panel>
    </div>
  );
}
