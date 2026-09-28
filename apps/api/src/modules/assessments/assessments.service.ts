import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomInt } from "node:crypto";
import {
  PERMISSIONS as P,
  REVIEW_SLA_HOURS,
  drawQuestions,
  drawSize,
  poolForKind,
  seededShuffle,
  servedIds,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { BadgesService } from "../badges/badges.service";
import { TrackAccessService } from "../academy/track-access.service";
import { CredentialsService } from "../credentials/credentials.service";
import { FinalExamService } from "./final-exam.service";
import type { Actor } from "../../common/auth/actor";
import type { StartAttemptDto, SubmitAttemptDto } from "./assessments.dto";
import { attemptAllowance, attemptAllowances } from "./attempt-allowance";

interface AnswerKey {
  correct?: string | string[];
}

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly badges: BadgesService,
    private readonly trackAccess: TrackAccessService,
    private readonly finalExam: FinalExamService,
    private readonly credentials: CredentialsService,
  ) {}

  /**
   * The candidate-facing view of an assessment.
   *
   * The select list is exhaustive and deliberate rather than an `include` with
   * an omit afterwards: adding a field to Question does not silently add it to
   * what a candidate is served.
   */
  async paper(actor: Actor, assessmentId: string, attemptId?: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        code: true,
        title: true,
        kind: true,
        passMark: true,
        requiresReview: true,
        maxAttempts: true,
        visible: true,
        drawCount: true,
        finalExam: true,
        programmeVersionId: true,
        // Where "back" goes from this paper.
        programmeVersion: {
          select: { programme: { select: { code: true, title: true } } },
        },
        questions: {
          orderBy: { position: "asc" },
          select: {
            position: true,
            question: {
              select: {
                id: true,
                stem: true,
                type: true,
                options: true,
                points: true,
                pool: true,
                // answerKey is absent. Not omitted downstream: absent.
              },
            },
          },
        },
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    // A hidden paper reads as absent to a candidate, on this route as on the
    // list. Anything less would make hiding a matter of not linking to it.
    const authoring = (actor.permissions as readonly string[]).includes(
      P.PROGRAMME_UPDATE,
    );
    if (!authoring && !assessment.visible) {
      throw new NotFoundException("Assessment not found");
    }

    // Only questions from the half of the bank this kind of paper draws on.
    const pool = poolForKind(assessment.kind);
    const onPaper = assessment.questions.filter(
      (aq) => aq.question.pool === pool,
    );
    const drawn = drawnPaper(assessment);
    const itemsPerAttempt = drawn
      ? drawSize(onPaper.length, assessment.drawCount)
      : onPaper.length;

    const readiness =
      assessment.finalExam && !authoring
        ? await this.finalExam.readiness(
            actor.id,
            assessment.programmeVersionId,
          )
        : null;

    const { programmeVersionId: _v, programmeVersion, ...rest } = assessment;

    // An author sees the whole pool. A candidate sees the questions their
    // attempt drew, in the order drawn -- and, before an attempt, none of a
    // drawn paper at all: showing the pool would turn a random draw into a
    // question list to revise from.
    let questions = onPaper;
    if (!authoring && attemptId) {
      const attempt = await this.prisma.attempt.findUnique({
        where: { id: attemptId },
        select: { userId: true, assessmentId: true, questionIds: true },
      });
      if (
        !attempt ||
        attempt.userId !== actor.id ||
        attempt.assessmentId !== assessment.id
      ) {
        throw new NotFoundException("Attempt not found");
      }
      const byId = new Map(onPaper.map((aq) => [aq.question.id, aq]));
      questions = servedIds(
        attempt.questionIds,
        onPaper.map((aq) => aq.question.id),
      ).map((id, index) => {
        const aq = byId.get(id)!;
        // The options too are in an order of this attempt's own, so one
        // attempt's layout is no crib for the next. Marked by option id, so
        // the order never touches the score.
        return {
          ...aq,
          position: index,
          question: {
            ...aq.question,
            options: Array.isArray(aq.question.options)
              ? (seededShuffle(
                  aq.question.options,
                  `${attemptId}:${aq.question.id}`,
                ) as typeof aq.question.options)
              : aq.question.options,
          },
        };
      });
    } else if (!authoring && drawn) {
      questions = [];
    }

    // The learner's own standing on this paper: their allowance (base plus
    // any granted extras) and their most recent request for more attempts.
    const learner = authoring
      ? null
      : {
          attemptsAllowed: await attemptAllowance(this.prisma, actor.id, {
            id: assessment.id,
            maxAttempts: assessment.maxAttempts,
          }),
          attemptRequest: await this.prisma.attemptRequest.findFirst({
            where: { userId: actor.id, assessmentId: assessment.id },
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              reason: true,
              extraAttempts: true,
              decisionNote: true,
              createdAt: true,
              decidedAt: true,
            },
          }),
        };

    return {
      ...rest,
      programme: programmeVersion.programme,
      attemptsAllowed: learner?.attemptsAllowed ?? assessment.maxAttempts,
      attemptRequest: learner?.attemptRequest ?? null,
      poolSize: onPaper.length,
      itemsPerAttempt,
      readiness,
      questions: questions.map(({ position, question }) => {
        const { pool: _p, ...q } = question;
        return { position, question: q };
      }),
    };
  }

  async listForLearner(actor: Actor) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: actor.id, status: "ACTIVE" },
      select: { cohort: { select: { programmeVersionId: true } } },
    });
    const versionIds = enrollments.map((e) => e.cohort.programmeVersionId);

    const assessments = await this.prisma.assessment.findMany({
      where: { programmeVersionId: { in: versionIds }, visible: true },
      select: {
        id: true,
        code: true,
        title: true,
        kind: true,
        passMark: true,
        requiresReview: true,
        maxAttempts: true,
        finalExam: true,
        moduleId: true,
        programmeVersionId: true,
        attempts: {
          where: { userId: actor.id },
          select: {
            id: true,
            attemptNo: true,
            score: true,
            passed: true,
            submittedAt: true,
          },
          orderBy: { attemptNo: "desc" },
        },
      },
      orderBy: { code: "asc" },
    });

    // One readiness check per track that has a final examination on it.
    const locks = new Map<string, string[]>();
    for (const a of assessments.filter((x) => x.finalExam)) {
      if (!locks.has(a.programmeVersionId)) {
        const state = await this.finalExam.readiness(
          actor.id,
          a.programmeVersionId,
        );
        locks.set(a.programmeVersionId, state.missing);
      }
    }

    const allowed = await attemptAllowances(this.prisma, actor.id, assessments);

    return assessments.map(({ programmeVersionId, ...a }) => ({
      ...a,
      attemptsAllowed: allowed.get(a.id) ?? a.maxAttempts,
      locked: a.finalExam ? (locks.get(programmeVersionId)?.length ?? 0) > 0 : false,
      lockedBecause: a.finalExam ? (locks.get(programmeVersionId) ?? []) : [],
    }));
  }

  async start(actor: Actor, dto: StartAttemptDto) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: dto.assessmentId },
      select: {
        id: true,
        kind: true,
        maxAttempts: true,
        programmeVersionId: true,
        visible: true,
        requiresReview: true,
        drawCount: true,
        finalExam: true,
        questions: {
          orderBy: { position: "asc" },
          select: { question: { select: { id: true, pool: true } } },
        },
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");
    if (!assessment.visible)
      throw new NotFoundException("Assessment not found");

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
        "You are not enrolled on the programme this assessment belongs to",
      );
    }

    // A locked track is locked for real: the ladder is enforced where the
    // work happens, not only on the screen that lists it.
    await this.trackAccess.assertTrainingOpen(
      actor,
      assessment.programmeVersionId,
    );

    // The final examination is the last door, and it opens only once the
    // track behind it is done: every lesson, every module quiz passed.
    if (assessment.finalExam) {
      await this.finalExam.assertReady(actor.id, assessment.programmeVersionId);
    }

    const used = await this.prisma.attempt.count({
      where: { assessmentId: assessment.id, userId: actor.id },
    });
    const allowed = await attemptAllowance(this.prisma, actor.id, assessment);
    if (used >= allowed) {
      throw new BadRequestException(
        `No attempts remaining (${used} of ${allowed} used). You can ask your examiner for another attempt from the paper's page.`,
      );
    }

    const pool = poolForKind(assessment.kind);
    const ids = assessment.questions
      .filter((aq) => aq.question.pool === pool)
      .map((aq) => aq.question.id);
    if (ids.length === 0 && !assessment.requiresReview) {
      throw new BadRequestException("This paper has no questions on it yet.");
    }

    return this.prisma.attempt.create({
      data: {
        assessmentId: assessment.id,
        userId: actor.id,
        attemptNo: used + 1,
        // The draw is fixed at the start, so what is marked is what was served.
        // Every machine-marked paper is shuffled, drawn or not: each attempt
        // asks its questions in a new order. A written paper keeps its order,
        // because its sections are read as one piece of work.
        questionIds: assessment.requiresReview
          ? ids
          : drawQuestions(
              ids,
              drawnPaper(assessment) ? assessment.drawCount : null,
              randomInt,
            ),
      },
    });
  }

  /**
   * Looking back at one of your own marked attempts.
   *
   * Every question as it was served, in the order served, with what the
   * learner chose and whether it was right. The correct answer and the
   * explanation are revealed only once the learner has passed this paper:
   * before that, showing the key would hand them the answers for their next
   * attempt, which is exactly what shuffling each attempt is meant to prevent.
   */
  async review(actor: Actor, attemptId: string) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: {
          select: {
            id: true,
            code: true,
            title: true,
            kind: true,
            passMark: true,
            requiresReview: true,
            programmeVersion: {
              select: { programme: { select: { code: true, title: true } } },
            },
            questions: {
              orderBy: { position: "asc" },
              select: {
                question: {
                  select: {
                    id: true,
                    stem: true,
                    type: true,
                    options: true,
                    answerKey: true,
                    explanation: true,
                    pool: true,
                  },
                },
              },
            },
          },
        },
      },
    });
    // Somebody else's attempt does not exist to you.
    if (!attempt || attempt.userId !== actor.id) {
      throw new NotFoundException("Attempt not found");
    }
    if (!attempt.submittedAt) {
      throw new BadRequestException(
        "That attempt is still open. Submit it, then review it.",
      );
    }
    if (attempt.assessment.requiresReview) {
      throw new BadRequestException(
        "Written work is reviewed by an examiner; read their decision under Submissions.",
      );
    }

    const revealed =
      (await this.prisma.attempt.count({
        where: {
          userId: actor.id,
          assessmentId: attempt.assessmentId,
          passed: true,
        },
      })) > 0;

    const pool = poolForKind(attempt.assessment.kind);
    const onPaper = attempt.assessment.questions.filter(
      (aq) => aq.question.pool === pool,
    );
    const byId = new Map(onPaper.map((aq) => [aq.question.id, aq.question]));
    const responses = (attempt.responses ?? {}) as Record<string, unknown>;

    const items = servedIds(
      attempt.questionIds,
      onPaper.map((aq) => aq.question.id),
    ).map((id, index) => {
      const q = byId.get(id)!;
      const key = q.answerKey as AnswerKey;
      const given = responses[id];
      return {
        position: index + 1,
        id: q.id,
        stem: q.stem,
        type: q.type,
        options: Array.isArray(q.options)
          ? (seededShuffle(q.options, `${attempt.id}:${q.id}`) as unknown[])
          : [],
        given: given ?? null,
        correct: isCorrect(key, given),
        // Only after a pass. Before it, right/wrong is feedback enough.
        ...(revealed
          ? { correctAnswer: key.correct ?? null, explanation: q.explanation }
          : {}),
      };
    });

    return {
      attempt: {
        id: attempt.id,
        attemptNo: attempt.attemptNo,
        score: attempt.score,
        passed: attempt.passed,
        submittedAt: attempt.submittedAt,
      },
      assessment: {
        id: attempt.assessment.id,
        code: attempt.assessment.code,
        title: attempt.assessment.title,
        passMark: attempt.assessment.passMark,
        programme: attempt.assessment.programmeVersion.programme,
      },
      revealed,
      items,
    };
  }

  /**
   * Marking happens here, on the server, against keys the candidate was never
   * served. A written assessment is not scored at all at this point: it
   * becomes a submission and waits for an examiner.
   */
  async submit(actor: Actor, attemptId: string, dto: SubmitAttemptDto) {
    const attempt = await this.prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        assessment: { include: { questions: { include: { question: true } } } },
      },
    });

    if (!attempt) throw new NotFoundException("Attempt not found");
    // Someone else's attempt is not yours to submit, and does not exist to you.
    if (attempt.userId !== actor.id)
      throw new NotFoundException("Attempt not found");
    if (attempt.submittedAt)
      throw new BadRequestException("That attempt is already submitted");

    // Marked against the questions this attempt drew, and only those.
    const served = new Set(
      servedIds(
        attempt.questionIds,
        attempt.assessment.questions.map((aq) => aq.question.id),
      ),
    );
    const machineMarkable = attempt.assessment.questions.filter(
      (aq) =>
        served.has(aq.question.id) &&
        (aq.question.type === "SINGLE_CHOICE" ||
          aq.question.type === "MULTI_CHOICE"),
    );

    let score: number | null = null;
    let passed: boolean | null = null;

    if (machineMarkable.length > 0 && !attempt.assessment.requiresReview) {
      const totalPoints = machineMarkable.reduce(
        (n, aq) => n + aq.question.points,
        0,
      );
      const earned = machineMarkable.reduce((n, aq) => {
        const key = aq.question.answerKey as AnswerKey;
        const given = dto.responses[aq.question.id];
        return n + (isCorrect(key, given) ? aq.question.points : 0);
      }, 0);
      score = totalPoints === 0 ? 0 : Math.round((earned / totalPoints) * 100);
      passed = score >= attempt.assessment.passMark;
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.attempt.update({
        where: { id: attemptId },
        data: {
          responses: dto.responses as object,
          submittedAt: new Date(),
          score,
          passed,
        },
      });

      if (attempt.assessment.requiresReview) {
        const now = new Date();
        await tx.submission.create({
          data: {
            assessmentId: attempt.assessmentId,
            userId: actor.id,
            attemptId: attempt.id,
            contentMd: dto.contentMd ?? "",
            status: "SUBMITTED",
            submittedAt: now,
            slaDueAt: new Date(now.getTime() + REVIEW_SLA_HOURS * 3_600_000),
          },
        });
      }

      // The score is returned; the key it was compared against is not.
      return {
        id: updated.id,
        submittedAt: updated.submittedAt,
        score: updated.score,
        passed: updated.passed,
        awaitingReview: attempt.assessment.requiresReview,
      };
    });

    // A marked attempt is one of the three moments a badge condition can newly
    // become true. Evaluated after the transaction commits, so a badge is never
    // awarded against a score that was rolled back.
    const earned = await this.badges.evaluateFor(actor.id);

    // Passing the final examination is the credential. Issued here, after the
    // attempt is committed, so a certificate never exists for a score that
    // was rolled back.
    let credential: { id: string; serial: string; created: boolean } | null =
      null;
    if (attempt.assessment.finalExam && result.passed === true) {
      const issued = await this.credentials.autoIssue({
        userId: actor.id,
        programmeVersionId: attempt.assessment.programmeVersionId,
        attemptId: attempt.id,
        score: result.score ?? 0,
        examTitle: attempt.assessment.title,
      });
      credential = {
        id: issued.credential.id,
        serial: issued.credential.serial,
        created: issued.created,
      };
    }

    return { ...result, badgesEarned: earned, credential };
  }
}

/**
 * Whether attempts at this paper draw a random selection. A written paper goes
 * to an examiner whole; anything else with a draw size is drawn.
 */
function drawnPaper(a: { drawCount: number | null; requiresReview: boolean }) {
  return a.drawCount !== null && a.drawCount > 0 && !a.requiresReview;
}

function isCorrect(key: AnswerKey, given: unknown): boolean {
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
