import Link from "next/link";
import { revalidatePath } from "next/cache";
import { api, apiOrNotFound } from "@/lib/api";
import {
  Badge as Chip,
  Empty,
  Panel,
  buttonClass,
  statusTone,
} from "@/components/ui";
import type { LearnerRecord } from "@/app/student/types";
import { act } from "@/lib/act";

interface BadgeRow {
  id: string;
  code: string;
  title: string;
  description: string;
  awardMode: "AUTOMATIC" | "MANUAL";
  held: boolean;
  reason: string | null;
  awardedBy: string | null;
}

interface Note {
  id: string;
  body: string;
  createdAt: string;
  author: { name: string; role: string };
}

export default async function LearnerRecordPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  // If this learner is not assigned to the signed-in examiner, the API answers
  // 404 and this page renders Next's not-found. Not 403: a 403 would confirm
  // that the learner exists.
  const [record, notes, badges] = await Promise.all([
    apiOrNotFound<LearnerRecord>(`/learners/${id}/record`),
    api<Note[]>(`/learners/${id}/notes`),
    api<BadgeRow[]>(`/badges/learner/${id}`),
  ]);

  const manualBadges = badges.filter((b) => b.awardMode === "MANUAL");

  /**
   * Awarding a judgement badge. The examiner who marked the work decides, and
   * says why: the reason is recorded on the award and shown to the candidate.
   */
  async function awardBadge(formData: FormData) {
    "use server";
    await act(`/badges/${String(formData.get("badgeId"))}/award`, {
      method: "POST",
      body: { learnerId: id, reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath(`/instructor/learners/${id}`);
  }

  async function addNote(formData: FormData) {
    "use server";
    await act(`/learners/${id}/notes`, {
      method: "POST",
      body: { body: String(formData.get("body") ?? "") },
    });
    revalidatePath(`/instructor/learners/${id}`);
  }

  return (
    <div className="space-y-5">
      <div>
        <p className="rule-label">Learner record</p>
        <h1 className="mt-1 text-xl font-semibold tracking-tight">
          {record.user.name}
        </h1>
        <p className="mt-0.5 font-mono text-xs text-ink-400">
          {record.user.email}
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel
          title="Submissions"
          hint="Every version, with the decisions made on it."
        >
          {record.submissions.length === 0 ? (
            <Empty>No submitted work.</Empty>
          ) : (
            <ul className="space-y-2">
              {record.submissions.map((submission) => (
                <li
                  key={submission.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2"
                >
                  <span className="text-xs">
                    <span className="font-mono text-brass-500">
                      {submission.assessment.code}
                    </span>{" "}
                    {submission.assessment.title}
                  </span>
                  <Chip tone={statusTone(submission.status)}>
                    {submission.status}
                  </Chip>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="Assessment attempts">
          {record.attempts.length === 0 ? (
            <Empty>No attempts.</Empty>
          ) : (
            <ul className="space-y-2">
              {record.attempts.map((attempt) => (
                <li
                  key={attempt.id}
                  className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
                >
                  <span>
                    <span className="font-mono text-brass-500">
                      {attempt.assessment.code}
                    </span>{" "}
                    attempt {attempt.attemptNo}
                  </span>
                  <span className="font-mono tabular-nums">
                    {attempt.score === null ? "pending" : `${attempt.score}%`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <Panel
        title="Badges"
        hint="Automatic badges are earned by meeting their condition. A manual badge is your judgement, and carries your reason."
      >
        {badges.filter((b) => b.held).length === 0 ? (
          <Empty>This learner holds no badges yet.</Empty>
        ) : (
          <ul className="mb-4 space-y-1.5">
            {badges
              .filter((b) => b.held)
              .map((badge) => (
                <li
                  key={badge.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-signal-green/30 bg-signal-green/5 px-3 py-2 text-xs"
                >
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-brass-500">
                      {badge.code}
                    </span>
                    {badge.title}
                  </span>
                  <span className="text-ink-400">
                    {badge.awardedBy ?? "System"}
                    {badge.reason ? ` — ${badge.reason}` : ""}
                  </span>
                </li>
              ))}
          </ul>
        )}

        {manualBadges.filter((b) => !b.held).length > 0 ? (
          <form action={awardBadge} className="flex flex-wrap items-end gap-2">
            <div>
              <label className="rule-label mb-1 block">
                Award a judgement badge
              </label>
              <select
                name="badgeId"
                required
                className="rounded-lg border border-ink-700 bg-ink-950/60 px-2 py-1.5 text-xs"
              >
                {manualBadges
                  .filter((b) => !b.held)
                  .map((badge) => (
                    <option key={badge.id} value={badge.id}>
                      {badge.code} — {badge.title}
                    </option>
                  ))}
              </select>
            </div>
            <div className="flex-1 min-w-56">
              <label className="rule-label mb-1 block">
                What they did to earn it
              </label>
              <input
                name="reason"
                required
                minLength={20}
                placeholder="At least 20 characters, shown to the candidate"
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-1.5 text-xs"
              />
            </div>
            <button type="submit" className={buttonClass("secondary", "md")}>
              Award
            </button>
          </form>
        ) : (
          <p className="text-[11px] text-ink-400">
            No manual badges are open for this learner.
          </p>
        )}
      </Panel>

      <Panel
        title="Instructor comments"
        hint="Kept on the learner record. A manager can read these; only an examiner writes one."
      >
        <form action={addNote} className="mb-4 space-y-2">
          <textarea
            name="body"
            rows={3}
            required
            minLength={10}
            placeholder="An observation about this learner's work."
            className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-3 text-xs outline-none focus:border-brass-500"
          />
          <button type="submit" className={buttonClass("secondary", "md")}>
            Add comment
          </button>
        </form>

        {notes.length === 0 ? (
          <Empty>No comments on this record.</Empty>
        ) : (
          <ul className="space-y-3">
            {notes.map((note) => (
              <li key={note.id} className="border-l-2 border-ink-700 pl-3">
                <p className="rule-label">
                  {note.author.name} &middot;{" "}
                  {new Date(note.createdAt).toLocaleDateString()}
                </p>
                <p className="mt-1 text-xs leading-relaxed text-ink-200">
                  {note.body}
                </p>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Link
        href="/instructor/learners"
        className="text-xs text-ink-400 hover:text-ink-200"
      >
        Back to my learners
      </Link>
    </div>
  );
}
