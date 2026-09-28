import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { api, apiOrNull, apiOrNotFound } from "@/lib/api";
import { Badge, Panel, Stat, buttonClass } from "@/components/ui";
import { AssessmentRunner, type PaperQuestion } from "./runner";
import { act, done } from "@/lib/act";
import { SubmitButton } from "@/components/submit-button";

interface Paper {
  id: string;
  code: string;
  title: string;
  kind: string;
  passMark: number;
  requiresReview: boolean;
  maxAttempts: number;
  /** This learner's allowance: the paper's own plus any granted on request. */
  attemptsAllowed: number;
  /** Their most recent request for more attempts, if any. */
  attemptRequest: {
    id: string;
    status: "PENDING" | "GRANTED" | "DECLINED";
    reason: string;
    extraAttempts: number;
    decisionNote: string | null;
    createdAt: string;
    decidedAt: string | null;
  } | null;
  /** The track this paper belongs to, which is where "back" goes. */
  programme: { code: string; title: string };
  finalExam: boolean;
  itemsPerAttempt: number;
  poolSize: number;
  readiness: {
    ready: boolean;
    lessons: { done: number; total: number };
    quizzes: Array<{
      id: string;
      code: string;
      title: string;
      module: string;
      passMark: number;
      passed: boolean;
      bestScore: number | null;
    }>;
    missing: string[];
  } | null;
  questions: PaperQuestion[];
}

interface MyAssessment {
  id: string;
  attempts: Array<{
    id: string;
    attemptNo: number;
    score: number | null;
    passed: boolean | null;
    submittedAt: string | null;
  }>;
}

export default async function AssessmentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ attempt?: string; certified?: string; error?: string }>;
}) {
  const { id } = await params;
  const { attempt: attemptId, certified, error } = await searchParams;

  // With an attempt open, the paper is that attempt's own draw.
  const [paper, mine] = await Promise.all([
    apiOrNotFound<Paper>(
      `/assessments/${id}/paper${attemptId ? `?attempt=${encodeURIComponent(attemptId)}` : ""}`,
    ),
    // Null only for a role preview, which borrows assessment.read but never
    // assessment.take: the paper still renders, with no attempts of its own.
    apiOrNull<MyAssessment[]>("/assessments/mine"),
  ]);

  // A simulation reached by its paper URL -- a bookmark, a stale link -- goes
  // to its own runner. Serving it here would present a hundred missions as one
  // page and drop the per-mission debrief that is the whole exercise.
  if (paper.kind === "SIMULATION") redirect(`/student/simulator/${id}`);

  const record = (mine ?? []).find((a) => a.id === id);
  const attempts = record?.attempts ?? [];
  const best = attempts.reduce<number | null>(
    (acc, a) =>
      a.score !== null && (acc === null || a.score > acc) ? a.score : acc,
    null,
  );
  // A written paper is attempted by submitting work, not by starting an
  // attempt, so its count comes from the submissions. Revisions of returned
  // work are the same attempt and do not use another.
  const written = paper.requiresReview
    ? (
        (await apiOrNull<Array<{ id: string; status: string; assessment: { id: string } }>>(
          "/submissions/mine",
        )) ?? []
      ).filter((s) => s.assessment.id === id)
    : [];
  const openWork = written.find((s) =>
    ["SUBMITTED", "IN_REVIEW", "RETURNED"].includes(s.status),
  );
  const used = paper.requiresReview ? written.length : attempts.length;
  const allowed = paper.attemptsAllowed ?? paper.maxAttempts;
  const remaining = allowed - used;
  const passedPaper = paper.requiresReview
    ? written.some((s) => s.status === "APPROVED")
    : attempts.some((a) => a.passed === true);
  const marked = attempts.filter((a) => a.submittedAt !== null);
  // Out of attempts without a pass, and nothing left open: the moment to ask.
  const exhausted = !passedPaper && remaining <= 0 && !openWork;
  const request = paper.attemptRequest;
  const live = attemptId
    ? attempts.find((a) => a.id === attemptId && !a.submittedAt)
    : undefined;

  async function begin() {
    "use server";
    let createdId: string;
    try {
      const created = await api<{ id: string }>("/assessments/attempts", {
        method: "POST",
        body: { assessmentId: id },
      });
      createdId = created.id;
    } catch (err) {
      const message = err instanceof Error ? err.message : "That did not work.";
      redirect(`/student/assessments/${id}?error=${encodeURIComponent(message)}`);
    }
    redirect(`/student/assessments/${id}?attempt=${createdId}`);
  }

  async function submitAttempt(formData: FormData) {
    "use server";
    const responses: Record<string, string> = {};
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("q_")) responses[key.slice(2)] = String(value);
    }
    const result = await act<{
      credential: { id: string; serial: string; created: boolean } | null;
    }>(`/assessments/attempts/${attemptId}/submit`, {
      method: "POST",
      body: { responses },
    });
    revalidatePath(`/student/assessments/${id}`);
    redirect(
      result.credential
        ? `/student/assessments/${id}?certified=${encodeURIComponent(result.credential.id)}`
        : `/student/assessments/${id}`,
    );
  }

  /** Asking the examiner for more attempts, once every one is used. */
  async function requestAttempts(formData: FormData) {
    "use server";
    await act(`/assessments/${id}/attempt-requests`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath(`/student/assessments/${id}`);
    await done(
      "Request sent. Your examiner has been told, and you will see their decision here.",
    );
  }

  async function submitWritten(formData: FormData) {
    "use server";
    await act("/submissions", {
      method: "POST",
      body: {
        assessmentId: id,
        contentMd: String(formData.get("contentMd") ?? ""),
      },
    });
    redirect("/student/submissions");
  }

  return (
    <div className="space-y-5">
      <Link
        href={`/student/academy/${paper.programme.code}`}
        className="inline-flex items-center gap-1.5 text-xs text-ink-400 hover:text-brass-500"
      >
        <span aria-hidden>←</span> Back to {paper.programme.code}
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            {paper.code} &middot; {paper.kind}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {paper.title}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {paper.itemsPerAttempt} questions
            {paper.itemsPerAttempt < paper.poolSize ? " drawn at random" : ""}{" "}
            &middot; pass {paper.passMark}%
            &middot; {Math.max(0, remaining)} of {allowed} attempts remaining
          </p>
        </div>
        {best !== null ? (
          <Badge tone={best >= paper.passMark ? "green" : "amber"}>
            Best {best}%
          </Badge>
        ) : null}
      </div>

      {certified ? (
        <div className="rounded-xl border border-signal-green/40 bg-signal-green/10 p-5">
          <p className="text-base font-semibold text-signal-green">
            Final examination passed — your certificate has been issued.
          </p>
          <p className="mt-1 text-xs text-ink-200">
            It carries a unique serial number anyone can verify.
          </p>
          <Link
            href={`/student/credentials/${certified}`}
            className={`${buttonClass("primary", "md")} mt-3 inline-flex`}
          >
            View your certificate
          </Link>
        </div>
      ) : null}

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-signal-red/40 bg-signal-red/10 px-4 py-3 text-sm text-signal-red"
        >
          {decodeURIComponent(error)}
        </p>
      ) : null}

      {paper.finalExam && paper.readiness && !paper.readiness.ready && !live ? (
        <Panel
          title="Final examination — locked"
          hint="It opens once you have completed every lesson and passed every module quiz. Passing it issues your certificate."
        >
          <ul className="space-y-1.5 text-xs">
            <li className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2">
              <span>Lessons completed</span>
              <Badge
                tone={
                  paper.readiness.lessons.done >= paper.readiness.lessons.total
                    ? "green"
                    : "amber"
                }
              >
                {paper.readiness.lessons.done} / {paper.readiness.lessons.total}
              </Badge>
            </li>
            {paper.readiness.quizzes.map((q) => (
              <li
                key={q.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2"
              >
                <Link
                  href={`/student/assessments/${q.id}`}
                  className="hover:text-brass-500"
                >
                  <span className="font-mono text-ink-400">{q.code}</span>{" "}
                  {q.title}
                </Link>
                <span className="flex items-center gap-2">
                  <span className="font-mono text-ink-400 tabular-nums">
                    {q.bestScore === null ? "not attempted" : `best ${q.bestScore}%`} · need {q.passMark}%
                  </span>
                  <Badge tone={q.passed ? "green" : "amber"}>
                    {q.passed ? "Passed" : "Not yet"}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : paper.requiresReview ? (
        <Panel
          title="Written submission"
          hint="This goes to an examiner, who must give a substantive written rationale before any decision is recorded."
        >
          <form action={submitWritten} className="space-y-3">
            {paper.questions.map((item, i) => (
              <div
                key={item.question.id}
                className="rounded-lg border border-ink-800 p-4"
              >
                <p className="whitespace-pre-line text-sm leading-relaxed">
                  <span className="mr-2 font-mono text-xs text-ink-400">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  {item.question.stem}
                </p>
              </div>
            ))}
            {openWork ? (
              <p className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-3 py-2.5 text-sm text-signal-amber">
                {openWork.status === "RETURNED"
                  ? "Your work was returned for revision. Revise it from "
                  : "Your work is with the examiner. You can submit again only after a decision. See "}
                <Link
                  href={`/student/submissions/${openWork.id}`}
                  className="underline"
                >
                  Submissions
                </Link>
                .
              </p>
            ) : remaining > 0 ? (
              <>
                <label htmlFor="contentMd" className="rule-label block">
                  Your submission (at least 80 characters)
                </label>
                <textarea
                  id="contentMd"
                  name="contentMd"
                  rows={18}
                  required
                  minLength={80}
                  placeholder="Address each section in turn."
                  className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-3 font-mono text-xs leading-relaxed outline-none focus:border-brass-500"
                />
                <SubmitButton size="lg" pendingLabel="Submitting…">
                  Submit for examiner review
                </SubmitButton>
              </>
            ) : (
              <p className="text-xs text-signal-amber">
                No attempts remaining. You can ask for another below.
              </p>
            )}
          </form>
        </Panel>
      ) : live ? (
        <AssessmentRunner action={submitAttempt} questions={paper.questions} />
      ) : (
        <Panel
          title={
            attempts.length === 0
              ? "Begin"
              : remaining > 0
                ? "Attempt again"
                : "No attempts left"
          }
          hint="Answers are marked on the server. The key is never sent to this page, so it cannot be read from it."
        >
          {remaining > 0 ? (
            <form action={begin}>
              <SubmitButton size="lg" pendingLabel="Starting…">
                {attempts.length === 0
                  ? "Begin assessment"
                  : "Start a new attempt"}
              </SubmitButton>
            </form>
          ) : (
            <p className="text-xs text-signal-amber">
              No attempts remaining. You can ask for another below.
            </p>
          )}
        </Panel>
      )}

      {exhausted ? (
        <Panel
          title="Ask for another attempt"
          hint="Every attempt on this paper is used and it is not yet passed. Your examiner decides whether you get more, and tells you why either way."
        >
          {request?.status === "PENDING" ? (
            <p
              role="status"
              className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-3 py-2.5 text-sm text-signal-amber"
            >
              Request sent {new Date(request.createdAt).toLocaleDateString()}.
              Waiting for your examiner&rsquo;s decision.
            </p>
          ) : (
            <>
              {request?.status === "DECLINED" ? (
                <div className="mb-3 rounded-lg border border-signal-red/40 bg-signal-red/10 px-3 py-2.5 text-sm text-signal-red">
                  <p className="font-semibold">Your last request was declined.</p>
                  {request.decisionNote ? (
                    <p className="mt-1 text-xs">&ldquo;{request.decisionNote}&rdquo;</p>
                  ) : null}
                </div>
              ) : null}
              <form action={requestAttempts} className="space-y-2">
                <label htmlFor="attempt-reason" className="rule-label block">
                  Why should you have another attempt? (at least 20 characters)
                </label>
                <textarea
                  id="attempt-reason"
                  name="reason"
                  required
                  minLength={20}
                  maxLength={1000}
                  rows={3}
                  placeholder="For example: I have re-read the module and the Authority Envelope section in particular."
                  className="w-full rounded-lg border border-ink-700 bg-ink-950/60 p-3 text-xs leading-relaxed outline-none focus:border-brass-500"
                />
                <SubmitButton pendingLabel="Sending…">
                  Request another attempt
                </SubmitButton>
              </form>
            </>
          )}
        </Panel>
      ) : null}

      {attempts.length > 0 ? (
        <Panel title="Your attempts">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Attempts used"
              value={`${attempts.length} / ${allowed}`}
            />
            <Stat
              label="Best score"
              value={best === null ? "—" : `${best}%`}
              note={`pass mark ${paper.passMark}%`}
            />
            <Stat
              label="Result"
              value={
                passedPaper
                  ? "Passed"
                  : marked.length === 0
                    ? "In progress"
                    : remaining > 0
                      ? "Not passed yet"
                      : "Not passed"
              }
              note={
                passedPaper
                  ? "You can review every attempt, with the answers."
                  : marked.length === 0
                    ? "Submit your attempt to get a result."
                    : remaining > 0
                      ? `${best ?? 0}% so far — ${paper.passMark}% needed. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
                      : request?.status === "PENDING"
                        ? "No attempts left. Your request is with your examiner."
                        : "No attempts left. Ask your examiner for another above."
              }
            />
          </div>
          <ul className="mt-3 space-y-1">
            {attempts.map((a) => (
              <li
                key={a.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
              >
                <span>Attempt {a.attemptNo}</span>
                <span className="flex items-center gap-2">
                  {a.submittedAt === null ? (
                    <>
                      <Badge tone="amber">In progress</Badge>
                      {a.id !== attemptId ? (
                        <Link
                          href={`/student/assessments/${id}?attempt=${a.id}`}
                          className="text-brass-500 hover:underline"
                        >
                          Continue
                        </Link>
                      ) : null}
                    </>
                  ) : (
                    <>
                      <span className="font-mono tabular-nums">
                        {a.score === null ? "awaiting review" : `${a.score}%`}
                      </span>
                      {a.passed === true ? <Badge tone="green">Pass</Badge> : null}
                      {a.passed === false ? (
                        <Badge tone="red">Not passed</Badge>
                      ) : null}
                      {!paper.requiresReview ? (
                        <Link
                          href={`/student/assessments/${id}/attempts/${a.id}`}
                          className="text-brass-500 hover:underline"
                        >
                          Review
                        </Link>
                      ) : null}
                    </>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Link
        href="/student/academy"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to the Academy
      </Link>
    </div>
  );
}
