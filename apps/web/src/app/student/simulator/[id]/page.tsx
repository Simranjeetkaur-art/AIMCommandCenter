import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { optionLetter } from "@aim/contracts";
import { Badge, Panel, Stat, buttonClass } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { MissionProgress } from "./progress";
import { api, apiOrNotFound } from "@/lib/api";
import { act } from "@/lib/act";

interface MissionOption {
  id: string;
  text: string;
}

interface Mission {
  id: string;
  position: number;
  stem: string;
  options: MissionOption[];
  band: string | null;
  title: string | null;
}

interface AnsweredMission extends Mission {
  givenOptionId: string | null;
  correctOptionId: string | null;
  correct: boolean;
  explanation: string | null;
}

interface RunState {
  assessment: {
    id: string;
    code: string;
    title: string;
    passMark: number;
    maxAttempts: number;
    programme: { code: string; title: string };
  };
  attemptsUsed: number;
  attemptsRemaining: number;
  run: { id: string; attemptNo: number; startedAt: string } | null;
  progress: {
    total: number;
    answered: number;
    correct: number;
    score: number;
    finished: boolean;
  };
  reachable: boolean;
  mission: Mission | null;
  lastAnswered: AnsweredMission | null;
  history: Array<{
    id: string;
    attemptNo: number;
    score: number | null;
    passed: boolean | null;
    submittedAt: string | null;
  }>;
}

/**
 * The simulator run.
 *
 * Server-rendered all the way down, including the answer itself, which is a
 * plain form post per option. That is not a limitation worked around: a
 * mission's key and rationale arrive only *after* the decision is recorded, so
 * there is nothing for a client component to hold that the candidate should
 * not already have seen. Keeping it on the server means a refresh, a back
 * button or a closed laptop all resume exactly where the run was, because the
 * run's position is a fact in the database rather than state in a tab.
 *
 * `?review` is how the screen distinguishes "here is the next mission" from
 * "here is what happened on the last one". It is a query parameter rather than
 * component state for the same reason: reloading the feedback must show the
 * feedback again, not silently advance past it.
 */
export default async function SimulatorRun({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ review?: string }>;
}) {
  const { id } = await params;
  const { review } = await searchParams;

  const state = await apiOrNotFound<RunState>(`/simulator/${id}`);
  const { assessment, progress } = state;

  async function beginRun() {
    "use server";
    await act(`/simulator/${id}/start`, { method: "POST" });
    revalidatePath(`/student/simulator/${id}`);
    redirect(`/student/simulator/${id}`);
  }

  async function answerMission(formData: FormData) {
    "use server";
    await act(`/simulator/${id}/answer`, {
      method: "POST",
      body: {
        questionId: String(formData.get("questionId") ?? ""),
        optionId: String(formData.get("optionId") ?? ""),
      },
    });
    revalidatePath(`/student/simulator/${id}`);
    // Straight to the debrief for the mission just flown. The candidate
    // presses on from there.
    redirect(`/student/simulator/${id}?review=1`);
  }

  async function abandonRun(formData: FormData) {
    "use server";
    await act(`/simulator/${id}/abandon`, {
      method: "POST",
      body: { reason: String(formData.get("reason") ?? "") },
    });
    revalidatePath(`/student/simulator/${id}`);
    redirect(`/student/simulator/${id}`);
  }

  const showingFeedback = review === "1" && state.lastAnswered !== null;
  const flying = state.run !== null;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="rule-label">
            {assessment.programme.code} &middot; {assessment.code}
          </p>
          <h1 className="mt-1 text-xl font-semibold tracking-tight">
            {assessment.title}
          </h1>
          <p className="mt-1 text-xs text-ink-400">
            {progress.total} missions &middot; pass {assessment.passMark}%
            &middot; {state.attemptsRemaining} of {assessment.maxAttempts}{" "}
            attempts remaining
          </p>
        </div>
        {state.run ? (
          <Badge tone="amber">Run {state.run.attemptNo}</Badge>
        ) : null}
      </div>

      {flying ? (
        <MissionProgress
          answered={progress.answered}
          total={progress.total}
          correct={progress.correct}
          passMark={assessment.passMark}
        />
      ) : null}

      {/* A run that can no longer reach the pass mark is said so plainly.
          Flying sixty more missions that cannot change the outcome wastes the
          candidate's evening and teaches them the instrument is decorative. */}
      {flying && !state.reachable && !progress.finished ? (
        <div className="rounded-lg border border-signal-amber/40 bg-signal-amber/10 p-4">
          <p className="text-sm font-semibold text-signal-amber">
            This run can no longer reach {assessment.passMark}%
          </p>
          <p className="mt-1 text-xs text-ink-200">
            Every remaining mission answered correctly would still fall short.
            You may fly on for the practice — the missions and their reasoning
            are worth having either way — or end the run and start another if
            you have attempts left.
          </p>
        </div>
      ) : null}

      {progress.finished && flying ? (
        <ResultPanel
          score={progress.score}
          correct={progress.correct}
          total={progress.total}
          passMark={assessment.passMark}
        />
      ) : showingFeedback ? (
        <Feedback
          mission={state.lastAnswered as AnsweredMission}
          total={progress.total}
          href={`/student/simulator/${id}`}
        />
      ) : state.mission ? (
        <MissionCard
          mission={state.mission}
          total={progress.total}
          action={answerMission}
        />
      ) : (
        <Panel
          title={state.attemptsUsed === 0 ? "Enter the simulator" : "Fly again"}
          hint="Missions are flown one at a time, in order. Each decision is marked on the server and stands once made."
        >
          {state.attemptsRemaining > 0 ? (
            <form action={beginRun}>
              <button type="submit" className={buttonClass("primary", "lg")}>
                {state.attemptsUsed === 0 ? "Begin run" : "Begin a new run"}
              </button>
            </form>
          ) : (
            <p className="text-xs text-signal-amber">
              No attempts remaining on this simulator. Speak to your instructor.
            </p>
          )}
        </Panel>
      )}

      {flying ? (
        <Panel
          title="End this run early"
          hint="The attempt is spent either way. Unflown missions are marked wrong and the run is scored on what you actually answered."
        >
          <form action={abandonRun} className="flex flex-wrap items-end gap-3">
            <div className="min-w-56 flex-1">
              <label className="rule-label mb-1 block" htmlFor="abandon-reason">
                Reason
              </label>
              <input
                id="abandon-reason"
                name="reason"
                required
                minLength={4}
                placeholder="Why you are stopping here"
                className="w-full rounded-lg border border-ink-700 bg-ink-950/60 px-3 py-2 text-xs outline-none focus:border-brass-500"
              />
            </div>
            <ConfirmButton
              type="submit"
              confirm={`End run ${state.run?.attemptNo} at mission ${progress.answered} of ${progress.total}? The ${progress.total - progress.answered} missions you have not flown will be marked wrong, and this attempt is spent.`}
              size="md"
            >
              End run
            </ConfirmButton>
          </form>
        </Panel>
      ) : null}

      {state.history.length > 0 ? (
        <Panel title="Your runs">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat
              label="Runs used"
              value={`${state.attemptsUsed} / ${assessment.maxAttempts}`}
            />
            <Stat
              label="Best score"
              value={(() => {
                const best = state.history.reduce<number | null>(
                  (acc, a) =>
                    a.score !== null && (acc === null || a.score > acc)
                      ? a.score
                      : acc,
                  null,
                );
                return best === null ? "—" : `${best}%`;
              })()}
            />
            <Stat
              label="Result"
              value={
                state.history.some((a) => a.passed === true)
                  ? "Passed"
                  : "Not yet"
              }
            />
          </div>
          <ul className="mt-3 space-y-1">
            {state.history.map((run) => (
              <li
                key={run.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-ink-800 px-3 py-2 text-xs"
              >
                <span>Run {run.attemptNo}</span>
                <span className="flex items-center gap-2">
                  <span className="font-mono tabular-nums">
                    {run.score === null ? "—" : `${run.score}%`}
                  </span>
                  {run.passed === true ? (
                    <Badge tone="green">Pass</Badge>
                  ) : null}
                  {run.passed === false ? (
                    <Badge tone="red">Not passed</Badge>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      ) : null}

      <Link
        href="/student/simulator"
        className="inline-block text-xs text-ink-400 hover:text-ink-200"
      >
        Back to the simulators
      </Link>
    </div>
  );
}

/**
 * One mission, asked.
 *
 * Each option is its own submit button carrying its own id, so choosing is a
 * single action with nothing held in between. The letters are positional and
 * the server shuffles the order per candidate, so the letter is a label for
 * reading the debrief afterwards, never a stable name for an option.
 */
function MissionCard({
  mission,
  total,
  action,
}: {
  mission: Mission;
  total: number;
  action: (formData: FormData) => Promise<void>;
}) {
  return (
    <section className="panel p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {mission.band ? <p className="rule-label">{mission.band}</p> : <span />}
        <p className="font-mono text-xs text-ink-400">
          Mission {String(mission.position).padStart(3, "0")} / {total}
        </p>
      </div>

      {mission.title ? (
        <h2 className="mt-2 text-lg font-semibold tracking-tight">
          {mission.title}
        </h2>
      ) : null}

      <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-100">
        {mission.stem}
      </p>

      <p className="mt-4 text-xs font-semibold text-brass-500">
        Command decision — what should the practitioner do?
      </p>

      <form action={action} className="mt-2 space-y-1.5">
        <input type="hidden" name="questionId" value={mission.id} />
        {mission.options.map((option, index) => (
          <button
            key={option.id}
            type="submit"
            name="optionId"
            value={option.id}
            className="flex w-full items-start gap-3 rounded-lg border border-ink-800 bg-ink-900 px-3 py-2.5 text-left text-sm transition hover:border-brass-500 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brass-500"
          >
            <span className="mt-px shrink-0 font-mono text-xs text-brass-500">
              {optionLetter(index)}
            </span>
            <span className="flex-1">{option.text}</span>
          </button>
        ))}
      </form>
    </section>
  );
}

/**
 * The debrief.
 *
 * Shows the decision taken, the correct one, and — where the corpus carries it
 * — why. Two of the three imported mission sets have no written rationale, so
 * this says so rather than rendering a heading over nothing: an empty callout
 * reads as a missing answer, which is worse than an absent one.
 */
function Feedback({
  mission,
  total,
  href,
}: {
  mission: AnsweredMission;
  total: number;
  href: string;
}) {
  return (
    <section
      className={`panel border-l-2 p-5 ${
        mission.correct ? "border-l-signal-green" : "border-l-signal-red"
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        {mission.band ? <p className="rule-label">{mission.band}</p> : <span />}
        <p className="font-mono text-xs text-ink-400">
          Mission {String(mission.position).padStart(3, "0")} / {total}
        </p>
      </div>

      <p
        className={`mt-2 text-sm font-semibold ${
          mission.correct ? "text-signal-green" : "text-signal-red"
        }`}
      >
        {mission.correct
          ? "Correct command decision"
          : "Not the command decision"}
      </p>

      {mission.title ? (
        <h2 className="mt-1 text-base font-semibold tracking-tight">
          {mission.title}
        </h2>
      ) : null}

      <p className="mt-3 whitespace-pre-line text-xs leading-relaxed text-ink-300">
        {mission.stem}
      </p>

      <ul className="mt-4 space-y-1.5">
        {mission.options.map((option, index) => {
          const chosen = option.id === mission.givenOptionId;
          const key = option.id === mission.correctOptionId;
          return (
            <li
              key={option.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-2.5 text-sm ${
                key
                  ? "border-signal-green/50 bg-signal-green/10"
                  : chosen
                    ? "border-signal-red/50 bg-signal-red/10"
                    : "border-ink-800"
              }`}
            >
              <span className="mt-px shrink-0 font-mono text-xs text-ink-400">
                {optionLetter(index)}
              </span>
              <span className="flex-1">{option.text}</span>
              {/* Named in words, not by colour alone -- and the candidate's
                  own choice is always named, including when it was the right
                  one. Marking the correct option "Correct" and saying nothing
                  else left a candidate who got it right unable to see from the
                  row which one they had actually picked. */}
              {key && chosen ? (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-signal-green">
                  Your answer &middot; correct
                </span>
              ) : key ? (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-signal-green">
                  Correct
                </span>
              ) : chosen ? (
                <span className="shrink-0 font-mono text-[11px] uppercase tracking-wide text-signal-red">
                  Your answer
                </span>
              ) : null}
            </li>
          );
        })}
      </ul>

      {mission.explanation ? (
        <div className="mt-4 rounded-lg border border-ink-800 bg-ink-950/40 p-4">
          <p className="rule-label">Why this is the command decision</p>
          <p className="mt-1.5 text-sm leading-relaxed text-ink-200">
            {mission.explanation}
          </p>
        </div>
      ) : (
        <p className="mt-4 text-xs text-ink-500">
          This mission carries no written rationale in the syllabus. The correct
          decision is marked above.
        </p>
      )}

      <div className="mt-4">
        <Link href={href} className={buttonClass("primary", "md")}>
          {mission.position >= total ? "See the result" : "Next mission"}
        </Link>
      </div>
    </section>
  );
}

function ResultPanel({
  score,
  correct,
  total,
  passMark,
}: {
  score: number;
  correct: number;
  total: number;
  passMark: number;
}) {
  const passed = score >= passMark;
  return (
    <section
      className={`panel border-l-2 p-5 ${
        passed ? "border-l-signal-green" : "border-l-signal-amber"
      }`}
    >
      <p className="rule-label">Run complete</p>
      <p className="mt-1 text-3xl font-semibold tabular-nums">
        {correct}
        <span className="text-lg font-normal text-ink-500"> / {total}</span>
      </p>
      <p
        className={`mt-1 text-sm font-semibold ${
          passed ? "text-signal-green" : "text-signal-amber"
        }`}
      >
        {score}% &mdash; {passed ? "passed" : `${passMark}% required`}
      </p>
      <p className="mt-2 max-w-prose text-xs text-ink-400">
        {passed
          ? "The simulator requirement is met. It counts towards the certification gate for this track."
          : "Answer keys are not listed after a run. The reasoning for each mission was given at the time it was flown, and a new run puts the same missions in a different order of options."}
      </p>
    </section>
  );
}
