import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { MIN_REVIEW_COMMENT_LENGTH } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import { BadgesService } from "../badges/badges.service";
import type { Actor } from "../../common/auth/actor";
import type {
  ApproveDto,
  GradeDto,
  LearnerNoteDto,
  ReassignDto,
  ReturnDto,
} from "../submissions/submissions.dto";

@Injectable()
export class ReviewsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly badges: BadgesService,
  ) {}

  /**
   * The queue an examiner works from: submitted or in-review work belonging to
   * their assigned learners, unclaimed or already claimed by them.
   */
  async queue(actor: Actor) {
    const learnerIds = await this.scope.visibleLearnerIds(actor);

    return this.prisma.submission.findMany({
      where: {
        status: { in: ["SUBMITTED", "IN_REVIEW"] },
        ...(learnerIds === null ? {} : { userId: { in: learnerIds } }),
        OR: [{ claimedById: null }, { claimedById: actor.id }],
        // Work an examiner authored never enters their own queue. The rule is
        // enforced again at the point of decision; this keeps it off screen.
        NOT: { userId: actor.id },
      },
      select: {
        id: true,
        status: true,
        version: true,
        submittedAt: true,
        slaDueAt: true,
        claimedById: true,
        claimedAt: true,
        user: { select: { id: true, name: true } },
        assessment: {
          select: { id: true, code: true, title: true, kind: true },
        },
      },
      orderBy: [{ slaDueAt: "asc" }],
    });
  }

  /**
   * Claiming. Conditional on the row still being unclaimed, in one statement,
   * so two examiners opening the same queue do not both take the same item.
   */
  async claim(actor: Actor, submissionId: string) {
    const submission = await this.loadForReview(actor, submissionId);

    if (submission.claimedById && submission.claimedById !== actor.id) {
      throw new ConflictException(
        "Another examiner has already claimed this item",
      );
    }

    const result = await this.prisma.submission.updateMany({
      where: { id: submissionId, claimedById: null, status: "SUBMITTED" },
      data: {
        claimedById: actor.id,
        claimedAt: new Date(),
        status: "IN_REVIEW",
      },
    });

    if (result.count === 0 && submission.claimedById !== actor.id) {
      throw new ConflictException("That item was claimed a moment ago");
    }

    return this.prisma.submission.findUniqueOrThrow({
      where: { id: submissionId },
      include: {
        user: { select: { id: true, name: true } },
        assessment: {
          select: { code: true, title: true, kind: true, passMark: true },
        },
      },
    });
  }

  async approve(actor: Actor, submissionId: string, dto: ApproveDto) {
    const submission = await this.loadForReview(actor, submissionId);
    this.assertClaimedBy(actor, submission.claimedById);
    assertSubstantive(dto.comment);

    const result = await this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          submissionId,
          reviewerId: actor.id,
          decision: "APPROVED",
          comment: dto.comment,
          score: dto.score ?? null,
          submissionVersion: submission.version,
        },
      });

      return tx.submission.update({
        where: { id: submissionId },
        data: { status: "APPROVED", score: dto.score ?? submission.score },
        select: { id: true, status: true, score: true, version: true },
      });
    });

    // An approval can be the thing that completes a track.
    await this.badges.evaluateFor(submission.userId);
    return result;
  }

  async returnForRevision(actor: Actor, submissionId: string, dto: ReturnDto) {
    const submission = await this.loadForReview(actor, submissionId);
    this.assertClaimedBy(actor, submission.claimedById);
    assertSubstantive(dto.comment);

    return this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          submissionId,
          reviewerId: actor.id,
          decision: "RETURNED",
          comment: dto.comment,
          submissionVersion: submission.version,
        },
      });

      return tx.submission.update({
        where: { id: submissionId },
        data: { status: "RETURNED", claimedById: null, claimedAt: null },
        select: { id: true, status: true, version: true },
      });
    });
  }

  async grade(actor: Actor, submissionId: string, dto: GradeDto) {
    const submission = await this.loadForReview(actor, submissionId);
    this.assertClaimedBy(actor, submission.claimedById);
    assertSubstantive(dto.comment);

    const passMark = submission.assessment.passMark;

    return this.prisma.$transaction(async (tx) => {
      await tx.review.create({
        data: {
          submissionId,
          reviewerId: actor.id,
          decision: "GRADED",
          comment: dto.comment,
          score: dto.score,
          submissionVersion: submission.version,
        },
      });

      return tx.submission.update({
        where: { id: submissionId },
        data: {
          score: dto.score,
          status: dto.score >= passMark ? "APPROVED" : "REJECTED",
        },
        select: { id: true, status: true, score: true },
      });
    });
  }

  /**
   * Reassignment. A manager may move an overdue item to another examiner --
   * queue logistics, not judgement, which is why review.reassign sits apart
   * from review.approve in the matrix. It sets who holds the item. It cannot
   * set a decision or a score, and there is no parameter here that could.
   */
  async reassign(actor: Actor, submissionId: string, dto: ReassignDto) {
    const instructor = await this.prisma.user.findUnique({
      where: { id: dto.instructorId },
      select: { role: true, status: true },
    });
    if (instructor?.role !== "INSTRUCTOR" || instructor.status !== "ACTIVE") {
      throw new BadRequestException(
        "Reassignment target must be an active instructor",
      );
    }

    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      select: { id: true, userId: true, status: true },
    });
    if (!submission) throw new NotFoundException("Submission not found");
    if (submission.userId === dto.instructorId) {
      throw new ForbiddenException(
        "An examiner cannot be handed their own submission",
      );
    }
    if (submission.status === "APPROVED" || submission.status === "REJECTED") {
      throw new BadRequestException("That item is already decided");
    }

    return this.prisma.$transaction(async (tx) => {
      // Reassigning also grants the visibility that makes it actionable.
      await tx.instructorAssignment.upsert({
        where: {
          instructorId_learnerId: {
            instructorId: dto.instructorId,
            learnerId: submission.userId,
          },
        },
        create: {
          instructorId: dto.instructorId,
          learnerId: submission.userId,
          assignedById: actor.id,
        },
        update: { assignedById: actor.id },
      });

      return tx.submission.update({
        where: { id: submissionId },
        data: {
          claimedById: dto.instructorId,
          claimedAt: new Date(),
          status: "IN_REVIEW",
        },
        select: { id: true, status: true, claimedById: true },
      });
    });
  }

  async addLearnerNote(actor: Actor, learnerId: string, dto: LearnerNoteDto) {
    await this.scope.assertCanSeeLearner(actor, learnerId);
    return this.prisma.learnerNote.create({
      data: { learnerId, authorId: actor.id, body: dto.body },
      include: { author: { select: { id: true, name: true } } },
    });
  }

  async learnerNotes(actor: Actor, learnerId: string) {
    await this.scope.assertCanSeeLearner(actor, learnerId);
    return this.prisma.learnerNote.findMany({
      where: { learnerId },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    });
  }

  /**
   * Loads a submission for a decision, refusing three things at once: an item
   * that does not exist, one belonging to a learner who is not this examiner's,
   * and one the examiner wrote themselves.
   */
  private async loadForReview(actor: Actor, submissionId: string) {
    const submission = await this.prisma.submission.findUnique({
      where: { id: submissionId },
      include: { assessment: { select: { passMark: true, kind: true } } },
    });
    if (!submission) throw new NotFoundException("Submission not found");

    await this.scope.assertCanSeeLearner(actor, submission.userId);
    this.scope.assertNotSelfReview(actor, submission.userId);

    return submission;
  }

  /** A decision is made by the examiner holding the item, not by a bystander. */
  private assertClaimedBy(actor: Actor, claimedById: string | null): void {
    if (claimedById !== actor.id) {
      throw new ForbiddenException("Claim this item before deciding it");
    }
  }
}

/**
 * The length floor is checked in the DTO and again here. The DTO protects the
 * HTTP route; this protects the method, so a future caller that is not an HTTP
 * route still cannot approve work with an empty rationale.
 */
function assertSubstantive(comment: string): void {
  if (comment.trim().length < MIN_REVIEW_COMMENT_LENGTH) {
    throw new BadRequestException(
      `A decision must carry a written rationale of at least ${MIN_REVIEW_COMMENT_LENGTH} characters`,
    );
  }
}
