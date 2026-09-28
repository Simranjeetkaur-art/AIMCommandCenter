import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import {
  drawQuestions,
  drawSize,
  servedIds,
  missionSeed,
  presentOptions,
  simulatorProgress,
  stillReachable,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BadgesService } from "../badges/badges.service";
import { TrackAccessService } from "../academy/track-access.service";
import {
  attemptAllowance,
  attemptAllowances,
} from "../assessments/attempt-allowance";
import type { Actor } from "../../common/auth/actor";
import type { AbandonRunDto, AnswerMissionDto } from "./simulator.dto";

interface StoredOption {
  id: string;
  text: string;
}

interface AnswerKey {
  correct?: string | string[];
}

/** { "<questionId>": "<optionId>" } -- the same shape a paper attempt stores. */
type Responses = Record<string, string>;

interface MissionEntry {
  position: number;
  question: {
    id: string;
    stem: string;
    options: unknown;
    answerKey: unknown;
    explanation: string | null;
    meta: unknown;
  };
}

/**
 * Flying the mission simulator.
 *
 * A run is an ordinary `Attempt`. That is the whole of the storage design and
 * it is deliberate: the simulator counts towards the certification gate, the
 * badge conditions and the attempt history that instructors and administrators
 * already read, so it must leave the same record behind as any other
 * assessment rather than keeping a private tally in a table of its own that
 * the rest of the product would have to learn about.
 *
 * Everything else is derived rather than stored. The mission the candidate is
 * on is the lowest-positioned one absent from `responses`; the score is those
 * responses marked against the keys. There is no counter that can fall out of
 * step with the answers it claims to summarise.
 */
@Injectable()
export class SimulatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly badges: BadgesService,
    private readonly trackAccess: TrackAccessService,
  ) {}

  /**
   * The simulators open to this candidate, with how each run stands.
   *
   * Scoped by enrolment, like every other candidate-facing list: a simulator
   * belonging to a programme they are not on is not theirs to see.
   */
  async list(actor: Actor) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: actor.id, status: "ACTIVE" },
      select: { cohort: { select: { programmeVersionId: true } } },
    });
    const versionIds = enrollments.map((e) => e.cohort.programmeVersionId);

    const assessments = await this.prisma.assessment.findMany({
      where: {
        kind: "SIMULATION",
        visible: true,
        programmeVersionId: { in: versionIds },
      },
      select: {
        id: true,
        code: true,
        title: true,
        passMark: true,
        maxAttempts: true,
        drawCount: true,
        programmeVersion: {
          select: {
            version: true,
            programme: { select: { code: true, title: true } },
          },
        },
        _count: {
          select: { questions: { where: { question: { pool: "SIMULATOR" } } } },
        },
        attempts: {
          where: { userId: actor.id },
          orderBy: { attemptNo: "desc" },
          select: {
            id: true,
            attemptNo: true,
            responses: true,
            score: true,
            passed: true,
            submittedAt: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });

    const allowed = await attemptAllowances(this.prisma, actor.id, assessments);

    return assessments.map((assessment) => {
      const open = assessment.attempts.find((a) => a.submittedAt === null);
      const answered = open
        ? Object.keys((open.responses ?? {}) as Responses).length
        : 0;
      const best = assessment.attempts.reduce<number | null>(
        (acc, a) =>
          a.score !== null && (acc === null || a.score > acc) ? a.score : acc,
        null,
      );

      return {
        id: assessment.id,
        code: assessment.code,
        title: assessment.title,
        passMark: assessment.passMark,
        maxAttempts: allowed.get(assessment.id) ?? assessment.maxAttempts,
        attemptsUsed: assessment.attempts.length,
        programme: assessment.programmeVersion.programme,
        total: drawSize(assessment._count.questions, assessment.drawCount),
        inProgress: open ? { id: open.id, answered } : null,
        bestScore: best,
        passed: assessment.attempts.some((a) => a.passed === true),
      };
    });
  }

  /**
   * Where the run stands, and what to put in front of the candidate next.
   *
   * Returns at most one unanswered mission, and it carries no key -- the key
   * is absent from the projection rather than stripped from it. The mission
   * just answered is returned separately and *does* carry its key, because the
   * candidate has already been shown it; that is what the feedback screen
   * reads, and it means a refresh mid-feedback does not lose the rationale.
   */
  async state(actor: Actor, assessmentId: string) {
    const loaded = await this.load(assessmentId);
    const attempt = await this.openRun(actor, loaded.id);
    const assessment = this.forRun(loaded, attempt);

    const responses = (attempt?.responses ?? {}) as Responses;
    // Before a run there is nothing drawn yet; say how long a run will be.
    const total = attempt
      ? assessment.questions.length
      : drawSize(loaded.questions.length, loaded.drawCount);
    const answered = assessment.questions.filter(
      (aq) => responses[aq.question.id] !== undefined,
    ).length;
    const correct = this.countCorrect(assessment.questions, responses);
    const progress = simulatorProgress(total, answered, correct);

    // The next mission is the first one not yet decided. Missions run in
    // order, so this is also the only one the candidate may answer.
    const next = attempt
      ? assessment.questions.find(
          (aq) => responses[aq.question.id] === undefined,
        )
      : undefined;

    // The last one decided, for the feedback screen.
    const decided = assessment.questions.filter(
      (aq) => responses[aq.question.id] !== undefined,
    );
    const last = decided[decided.length - 1];

    const attemptsUsed = await this.prisma.attempt.count({
      where: { assessmentId: assessment.id, userId: actor.id },
    });

    // Answering the last mission closes the run, so there is no open run to
    // take the debrief from. Without this the final decision's debrief was the
    // one never shown: the page went straight to the result. The run that
    // closed a moment ago supplies it instead.
    let finalDebrief: ReturnType<SimulatorService["presentMission"]> | null =
      null;
    if (!attempt) {
      const finished = await this.prisma.attempt.findFirst({
        where: {
          assessmentId: loaded.id,
          userId: actor.id,
          submittedAt: { gte: new Date(Date.now() - 15 * 60_000) },
        },
        orderBy: { attemptNo: "desc" },
        select: { id: true, responses: true, questionIds: true },
      });
      if (finished) {
        const run = this.forRun(loaded, finished);
        const given = (finished.responses ?? {}) as Responses;
        const flown = run.questions.filter(
          (aq) => given[aq.question.id] !== undefined,
        );
        const final = flown[flown.length - 1];
        if (final) {
          finalDebrief = this.presentMission(
            finished.id,
            final,
            true,
            given[final.question.id],
          );
        }
      }
    }

    // Base allowance plus any extra attempts granted on request.
    const allowed = await attemptAllowance(this.prisma, actor.id, assessment);

    return {
      assessment: {
        id: assessment.id,
        code: assessment.code,
        title: assessment.title,
        passMark: assessment.passMark,
        maxAttempts: allowed,
        programme: assessment.programmeVersion.programme,
      },
      attemptsUsed,
      attemptsRemaining: Math.max(0, allowed - attemptsUsed),
      run: attempt
        ? {
            id: attempt.id,
            attemptNo: attempt.attemptNo,
            startedAt: attempt.startedAt,
          }
        : null,
      progress,
      reachable: stillReachable(progress, assessment.passMark),
      mission:
        attempt && next
          ? this.presentMission(attempt.id, next, false, undefined)
          : null,
      lastAnswered:
        attempt && last
          ? this.presentMission(
              attempt.id,
              last,
              true,
              responses[last.question.id],
            )
          : finalDebrief,
      history: await this.history(actor, assessment.id),
    };
  }

  /** Begins a run, subject to every gate an ordinary attempt passes. */
  async start(actor: Actor, assessmentId: string) {
    const assessment = await this.load(assessmentId);

    if (assessment.questions.length === 0) {
      throw new BadRequestException(
        "This simulator has no missions in it yet.",
      );
    }

    const existing = await this.openRun(actor, assessment.id);
    // Re-entering a run in progress is the normal case, not an error: the
    // candidate closed the tab at mission 40 and has come back to it.
    if (existing) return { id: existing.id, resumed: true };

    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        userId: actor.id,
        status: "ACTIVE",
        cohort: { programmeVersionId: assessment.programmeVersionId },
      },
      select: { id: true },
    });
    if (!enrolled) {
      throw new ForbiddenException(
        "You are not enrolled on the programme this simulator belongs to",
      );
    }

    // A locked track is locked here too. The simulator is a way into the
    // syllabus, so it honours the same restrictions the syllabus does.
    await this.trackAccess.assertTrainingOpen(
      actor,
      assessment.programmeVersionId,
    );

    const used = await this.prisma.attempt.count({
      where: { assessmentId: assessment.id, userId: actor.id },
    });
    const allowed = await attemptAllowance(this.prisma, actor.id, assessment);
    if (used >= allowed) {
      throw new BadRequestException(
        `No attempts remaining (${used} of ${allowed} used). You can ask your examiner for another attempt.`,
      );
    }

    const created = await this.prisma.attempt.create({
      data: {
        assessmentId: assessment.id,
        userId: actor.id,
        attemptNo: used + 1,
        // Each run flies its own random selection from the simulator pool.
        questionIds: drawQuestions(
          assessment.questions.map((aq) => aq.question.id),
          assessment.drawCount,
          randomInt,
        ),
      },
    });
    return { id: created.id, resumed: false };
  }

  /**
   * Records one command decision and tells the candidate how it went.
   *
   * Three refusals here, and each closes a way of scoring without judging:
   *
   *  - answering a mission that is not the one in front of them stops a
   *    candidate skipping to the end or working the list out of order;
   *  - answering a mission already decided stops them re-answering one whose
   *    key this endpoint has *already shown them*, which would otherwise be a
   *    free mark for anyone who pressed back;
   *  - an option id that is not on that mission is refused outright rather
   *    than recorded as wrong, because it means the screen and the server
   *    disagree about what is being asked.
   */
  async answer(actor: Actor, assessmentId: string, dto: AnswerMissionDto) {
    const loaded = await this.load(assessmentId);
    const attempt = await this.openRun(actor, loaded.id);
    if (!attempt) {
      throw new BadRequestException(
        "You have no run in progress on this simulator.",
      );
    }
    const assessment = this.forRun(loaded, attempt);

    const responses = (attempt.responses ?? {}) as Responses;
    const next = assessment.questions.find(
      (aq) => responses[aq.question.id] === undefined,
    );
    if (!next) throw new BadRequestException("This run is already complete.");

    if (next.question.id !== dto.questionId) {
      if (responses[dto.questionId] !== undefined) {
        throw new BadRequestException(
          "You have already answered that mission. A command decision stands once it is made.",
        );
      }
      throw new BadRequestException(
        `Missions are flown in order. You are on mission ${next.position}.`,
      );
    }

    const options = (next.question.options ?? []) as unknown as StoredOption[];
    if (!options.some((option) => option.id === dto.optionId)) {
      throw new BadRequestException("That is not an option on this mission.");
    }

    const updated: Responses = {
      ...responses,
      [next.question.id]: dto.optionId,
    };

    const total = assessment.questions.length;
    const progress = simulatorProgress(
      total,
      Object.keys(updated).length,
      this.countCorrect(assessment.questions, updated),
    );
    const finished = progress.finished;
    const passed = progress.score >= assessment.passMark;

    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: {
        responses: updated as object,
        // A run closes only when the last mission is flown. The score and the
        // pass flag are written in the same statement, so a completed run can
        // never be observed without its result.
        ...(finished
          ? { submittedAt: new Date(), score: progress.score, passed }
          : {}),
      },
    });

    // A newly finished run is one of the moments a badge condition can become
    // true. Evaluated after the write, never before it.
    const badgesEarned = finished
      ? await this.badges.evaluateFor(actor.id)
      : [];

    const key = next.question.answerKey as AnswerKey;

    return {
      correct: this.isCorrect(key, dto.optionId),
      correctOptionId: typeof key.correct === "string" ? key.correct : null,
      explanation: next.question.explanation,
      progress,
      reachable: stillReachable(progress, assessment.passMark),
      finished,
      passed: finished ? passed : null,
      badgesEarned,
    };
  }

  /**
   * Ends a run early.
   *
   * The unflown missions are marked wrong and the attempt is scored and
   * closed. It deliberately is not a way to wipe a bad run and pretend it did
   * not happen: the attempt is spent either way, and the record shows what was
   * actually answered. Anything softer would make the attempt limit
   * meaningless, because a candidate could abandon every run that was going
   * badly and only ever finish a good one.
   */
  async abandon(actor: Actor, assessmentId: string, dto: AbandonRunDto) {
    const loaded = await this.load(assessmentId);
    const attempt = await this.openRun(actor, loaded.id);
    if (!attempt) {
      throw new BadRequestException(
        "You have no run in progress on this simulator.",
      );
    }
    const assessment = this.forRun(loaded, attempt);

    const responses = (attempt.responses ?? {}) as Responses;
    const progress = simulatorProgress(
      assessment.questions.length,
      Object.keys(responses).length,
      this.countCorrect(assessment.questions, responses),
    );
    const passed = progress.score >= assessment.passMark;

    await this.prisma.attempt.update({
      where: { id: attempt.id },
      data: { submittedAt: new Date(), score: progress.score, passed },
    });

    return {
      id: attempt.id,
      score: progress.score,
      passed,
      flown: progress.answered,
      total: progress.total,
      reason: dto.reason,
    };
  }

  /** Every simulator, grouped by track, for the authoring screen. */
  async authoringOverview() {
    const [sims, pools] = await Promise.all([
      this.prisma.assessment.findMany({
        where: { kind: "SIMULATION" },
        orderBy: [{ code: "asc" }],
        select: {
          id: true,
          code: true,
          title: true,
          passMark: true,
          maxAttempts: true,
          drawCount: true,
          visible: true,
          programmeVersion: {
            select: {
              id: true,
              version: true,
              status: true,
              programme: {
                select: { id: true, code: true, title: true, level: true },
              },
            },
          },
          _count: {
            select: {
              attempts: true,
              questions: { where: { question: { pool: "SIMULATOR" } } },
            },
          },
        },
      }),
      this.prisma.question.groupBy({
        by: ["bankId", "pool"],
        _count: true,
      }),
    ]);

    const banks = await this.prisma.questionBank.findMany({
      select: { id: true, title: true, programmeId: true },
    });

    return {
      simulators: sims.map((s) => ({
        id: s.id,
        code: s.code,
        title: s.title,
        passMark: s.passMark,
        maxAttempts: s.maxAttempts,
        visible: s.visible,
        poolSize: s._count.questions,
        perRun: drawSize(s._count.questions, s.drawCount),
        drawCount: s.drawCount,
        runs: s._count.attempts,
        version: {
          id: s.programmeVersion.id,
          number: s.programmeVersion.version,
          status: s.programmeVersion.status,
        },
        programme: s.programmeVersion.programme,
      })),
      banks: banks.map((b) => ({
        id: b.id,
        title: b.title,
        programmeId: b.programmeId,
        quiz:
          pools.find((p) => p.bankId === b.id && p.pool === "QUIZ")?._count ?? 0,
        simulator:
          pools.find((p) => p.bankId === b.id && p.pool === "SIMULATOR")
            ?._count ?? 0,
      })),
    };
  }

  /** The whole pool, keys and all, as an author checks it. */
  async preview(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        code: true,
        title: true,
        kind: true,
        passMark: true,
        drawCount: true,
        programmeVersion: {
          select: {
            version: true,
            status: true,
            programme: { select: { code: true, title: true } },
          },
        },
        questions: {
          where: { question: { pool: "SIMULATOR" } },
          orderBy: { position: "asc" },
          select: {
            position: true,
            question: {
              select: {
                id: true,
                stem: true,
                options: true,
                answerKey: true,
                explanation: true,
                meta: true,
              },
            },
          },
        },
      },
    });
    if (!assessment || assessment.kind !== "SIMULATION") {
      throw new NotFoundException("Simulator not found");
    }

    return {
      id: assessment.id,
      code: assessment.code,
      title: assessment.title,
      passMark: assessment.passMark,
      poolSize: assessment.questions.length,
      perRun: drawSize(assessment.questions.length, assessment.drawCount),
      programme: assessment.programmeVersion.programme,
      version: assessment.programmeVersion.version,
      versionStatus: assessment.programmeVersion.status,
      missions: assessment.questions.map((entry, index) => {
        const meta = (entry.question.meta ?? {}) as Record<string, unknown>;
        const key = entry.question.answerKey as AnswerKey;
        return {
          id: entry.question.id,
          number: index + 1,
          stem: entry.question.stem,
          options: ((entry.question.options ?? []) as unknown as StoredOption[]).map(
            (o) => ({ id: o.id, text: o.text }),
          ),
          correctOptionId:
            typeof key.correct === "string" ? key.correct : null,
          explanation: entry.question.explanation,
          band:
            (meta.band as string | undefined) ??
            (meta.domain as string | undefined) ??
            (meta.phase as string | undefined) ??
            null,
          title: (meta.title as string | undefined) ?? null,
        };
      }),
    };
  }

  // -------------------------------------------------------------------------

  /**
   * The assessment with its missions in flight order.
   *
   * Loads the answer keys, which is why it is private and why nothing it
   * returns reaches a caller unshaped. `presentMission` decides what a
   * candidate actually sees.
   */
  private async load(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        code: true,
        title: true,
        kind: true,
        passMark: true,
        maxAttempts: true,
        visible: true,
        drawCount: true,
        programmeVersionId: true,
        programmeVersion: {
          select: {
            version: true,
            programme: { select: { code: true, title: true } },
          },
        },
        questions: {
          // Only simulator missions. A quiz question attached here by mistake
          // is not flown, which keeps the two pools apart for candidates.
          where: { question: { pool: "SIMULATOR" } },
          orderBy: { position: "asc" },
          select: {
            position: true,
            question: {
              select: {
                id: true,
                stem: true,
                options: true,
                answerKey: true,
                explanation: true,
                meta: true,
              },
            },
          },
        },
      },
    });

    if (!assessment) throw new NotFoundException("Simulator not found");
    // A hidden simulator reads as absent, the same as a hidden paper.
    if (!assessment.visible) throw new NotFoundException("Simulator not found");
    // This module flies simulations. Pointed at an examination it would hand
    // out the key one question at a time, so it refuses to be.
    if (assessment.kind !== "SIMULATION") {
      throw new NotFoundException("Simulator not found");
    }
    return assessment;
  }

  private openRun(actor: Actor, assessmentId: string) {
    return this.prisma.attempt.findFirst({
      where: { assessmentId, userId: actor.id, submittedAt: null },
      orderBy: { attemptNo: "desc" },
      select: {
        id: true,
        attemptNo: true,
        responses: true,
        startedAt: true,
        questionIds: true,
      },
    });
  }

  /**
   * The assessment narrowed to the missions this run drew, in drawn order and
   * numbered 1..n. Everything downstream -- the next mission, the score, the
   * finish line -- then works on the run, not on the whole pool.
   */
  private forRun<T extends { questions: MissionEntry[] }>(
    assessment: T,
    run: { questionIds: unknown } | null,
  ): T {
    if (!run) return assessment;
    const byId = new Map(assessment.questions.map((q) => [q.question.id, q]));
    const ids = servedIds(
      run.questionIds,
      assessment.questions.map((q) => q.question.id),
    );
    return {
      ...assessment,
      questions: ids.map((id, index) => ({
        ...byId.get(id)!,
        position: index + 1,
      })),
    };
  }

  private history(actor: Actor, assessmentId: string) {
    return this.prisma.attempt.findMany({
      where: { assessmentId, userId: actor.id, submittedAt: { not: null } },
      orderBy: { attemptNo: "desc" },
      select: {
        id: true,
        attemptNo: true,
        score: true,
        passed: true,
        submittedAt: true,
      },
    });
  }

  private countCorrect(entries: MissionEntry[], responses: Responses): number {
    return entries.reduce(
      (n, aq) =>
        this.isCorrect(
          aq.question.answerKey as AnswerKey,
          responses[aq.question.id],
        )
          ? n + 1
          : n,
      0,
    );
  }

  /**
   * What the candidate is shown for one mission.
   *
   * `revealed` is the whole of the difference between a mission being asked
   * and a mission being explained. While it is false, neither the key nor the
   * rationale is in the returned object at all -- not present and empty, not
   * present and null: absent. A screen cannot leak what it was never sent.
   */
  private presentMission(
    attemptId: string,
    entry: MissionEntry,
    revealed: boolean,
    givenOptionId: string | undefined,
  ) {
    const meta = (entry.question.meta ?? {}) as Record<string, unknown>;
    const options = (entry.question.options ?? []) as StoredOption[];

    // Shuffled for display only; every option keeps its own id, so marking
    // compares ids and never has to undo the permutation.
    const shown = presentOptions(
      options,
      missionSeed(attemptId, entry.question.id),
    );

    const base = {
      id: entry.question.id,
      position: entry.position,
      stem: entry.question.stem,
      options: shown.map((option) => ({ id: option.id, text: option.text })),
      // The corpus labels a mission's grouping under three different keys
      // depending on which track authored it. One field out, so the screen
      // does not have to know that.
      band:
        (meta.band as string | undefined) ??
        (meta.domain as string | undefined) ??
        (meta.phase as string | undefined) ??
        null,
      title: (meta.title as string | undefined) ?? null,
    };

    if (!revealed) return base;

    const key = entry.question.answerKey as AnswerKey;
    return {
      ...base,
      givenOptionId: givenOptionId ?? null,
      correctOptionId: typeof key.correct === "string" ? key.correct : null,
      correct: this.isCorrect(key, givenOptionId),
      explanation: entry.question.explanation,
    };
  }

  private isCorrect(key: AnswerKey, given: unknown): boolean {
    if (given === undefined || given === null) return false;
    const correct = key.correct;
    if (correct === undefined) return false;
    if (Array.isArray(correct)) {
      if (!Array.isArray(given)) return false;
      const a = [...correct].sort();
      const b = [...(given as string[])].sort();
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return correct === given;
  }
}
