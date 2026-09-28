import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { REVIEW_SLA_HOURS } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import { TrackAccessService } from "../academy/track-access.service";
import { attemptAllowance } from "../assessments/attempt-allowance";
import { page } from "../../common/util/pagination";
import type { Actor } from "../../common/auth/actor";
import type {
  CreateSubmissionDto,
  ListSubmissionsQuery,
  ResubmitDto,
} from "./submissions.dto";

const LIST_SELECT = {
  id: true,
  status: true,
  version: true,
  score: true,
  submittedAt: true,
  slaDueAt: true,
  claimedAt: true,
  updatedAt: true,
  user: { select: { id: true, name: true, email: true } },
  assessment: { select: { id: true, code: true, title: true, kind: true } },
  claimedBy: { select: { id: true, name: true } },
} satisfies Prisma.SubmissionSelect;

@Injectable()
export class SubmissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly trackAccess: TrackAccessService,
  ) {}

  /**
   * Listing. The scope filter is applied before anything else, and it is not
   * optional: a caller who holds neither an assigned nor an all permission
   * sees only their own rows, because `learnerScopeFilter` falls through to
   * their own id.
   */
  async list(actor: Actor, query: ListSubmissionsQuery) {
    const scopeFilter = await this.scope.learnerScopeFilter(actor);

    // A learnerId in the query narrows within scope. It cannot widen it: the
    // scope filter is applied second and wins.
    const where: Prisma.SubmissionWhereInput = {
      ...(query.learnerId ? { userId: query.learnerId } : {}),
      ...scopeFilter,
      ...(query.status ? { status: query.status } : {}),
    };

    if (query.learnerId) {
      await this.scope.assertCanSeeLearner(actor, query.learnerId);
    }

    const [items, total] = await this.prisma.$transaction([
      this.prisma.submission.findMany({
        where,
        select: LIST_SELECT,
        orderBy: [{ slaDueAt: "asc" }, { updatedAt: "desc" }],
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.submission.count({ where }),
    ]);

    return page(items, total, query);
  }

  async detail(actor: Actor, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        assessment: {
          select: {
            id: true,
            code: true,
            title: true,
            kind: true,
            passMark: true,
          },
        },
        claimedBy: { select: { id: true, name: true } },
        reviews: {
          orderBy: { createdAt: "desc" },
          include: { reviewer: { select: { id: true, name: true } } },
        },
      },
    });

    if (!submission) throw new NotFoundException("Submission not found");
    await this.scope.assertCanSeeLearner(actor, submission.userId);
    return submission;
  }

  async create(actor: Actor, dto: CreateSubmissionDto) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: dto.assessmentId },
      select: {
        id: true,
        requiresReview: true,
        programmeVersionId: true,
        maxAttempts: true,
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");
    if (!assessment.requiresReview) {
      throw new BadRequestException(
        "That assessment is machine-marked and takes no written work",
      );
    }

    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        userId: actor.id,
        status: "ACTIVE",
        cohort: { programmeVersionId: assessment.programmeVersionId },
      },
      select: { id: true },
    });
    if (!enrolled)
      throw new BadRequestException("You are not enrolled on that programme");

    await this.trackAccess.assertTrainingOpen(
      actor,
      assessment.programmeVersionId,
    );

    /**
     * One piece of work in flight per paper, and the paper's attempt limit.
     *
     * A new submission is an attempt; a revision of returned work is not (it is
     * the same attempt, carried on). While one is SUBMITTED, IN_REVIEW or
     * RETURNED there is nothing new to submit: it is either with the examiner
     * or waiting to be revised. Checked and written in one serialisable
     * transaction, so a double-click cannot slip two past the check.
     */
    // Base allowance plus any extra attempts granted on request.
    const allowed = await attemptAllowance(this.prisma, actor.id, assessment);
    const now = new Date();
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const mine = await tx.submission.findMany({
            where: { userId: actor.id, assessmentId: assessment.id },
            select: { status: true },
          });
          const open = mine.find((s) =>
            ["SUBMITTED", "IN_REVIEW", "RETURNED"].includes(s.status),
          );
          if (open) {
            throw new BadRequestException(
              open.status === "RETURNED"
                ? "Your returned work is waiting to be revised. Revise and resubmit it from Submissions instead of starting again."
                : "Your work on this paper is already with the examiner. You can submit again only after a decision.",
            );
          }
          if (mine.length >= allowed) {
            throw new BadRequestException(
              `No attempts remaining (${mine.length} of ${allowed} used). You can ask your examiner for another attempt.`,
            );
          }
          return tx.submission.create({
            data: {
              assessmentId: assessment.id,
              // Always the caller. There is no field on the DTO that could name
              // somebody else, so nobody can submit work in another
              // candidate's name.
              userId: actor.id,
              contentMd: dto.contentMd,
              status: "SUBMITTED",
              submittedAt: now,
              slaDueAt: new Date(now.getTime() + REVIEW_SLA_HOURS * 3_600_000),
            },
            select: LIST_SELECT,
          });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
      );
    } catch (error) {
      // The losing side of a concurrent double-submit.
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2034"
      ) {
        throw new ConflictException(
          "That work was submitted a moment ago. It is already with the examiner.",
        );
      }
      throw error;
    }
  }

  /**
   * Revising work an examiner returned. Only the author, only from RETURNED,
   * and the version is bumped so the returned draft and its comments survive.
   */
  async resubmit(actor: Actor, submissionId: string, dto: ResubmitDto) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true, status: true, version: true },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    this.scope.assertOwnRecord(actor, submission.userId);

    if (submission.status !== "RETURNED") {
      throw new BadRequestException(
        "Only work an examiner has returned can be revised",
      );
    }

    const now = new Date();
    return this.prisma.submission.update({
      where: { id: submissionId },
      data: {
        contentMd: dto.contentMd,
        status: "SUBMITTED",
        version: { increment: 1 },
        submittedAt: now,
        slaDueAt: new Date(now.getTime() + REVIEW_SLA_HOURS * 3_600_000),
        // A revision goes back to the queue unclaimed, so it is not parked
        // against an examiner who has moved on.
        claimedById: null,
        claimedAt: null,
      },
      select: LIST_SELECT,
    });
  }

  async mine(actor: Actor) {
    return this.prisma.submission.findMany({
      where: { userId: actor.id },
      select: {
        ...LIST_SELECT,
        contentMd: true,
        reviews: {
          orderBy: { createdAt: "desc" },
          select: {
            id: true,
            decision: true,
            comment: true,
            score: true,
            createdAt: true,
          },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
  }
}
