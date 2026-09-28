import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  PERFORMANCE_MAX_SCORE,
  PERMISSIONS as P,
  REVIEWS_ROLE,
  computePerformanceIndex,
  dimensionsFor,
  mayReview,
  performanceBandFor,
  type Role,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";
import type {
  WritePerformanceReviewDto,
  PerformanceQuery,
} from "./performance.dto";

/**
 * Assessing people, up the chain of accountability.
 *
 * The permission says a role may write a review. It cannot say *of whom* —
 * that is a fact about two people, so it is enforced here, in three layers:
 *
 *  1. The rung rule. An examiner assesses candidates, a manager assesses
 *     examiners, the institution assesses managers. Never sideways, never
 *     upward, never skipping a rung, never yourself.
 *  2. The assignment rule. An examiner may only assess a candidate actually
 *     assigned to them — the same scoping that decides whose work they mark.
 *  3. The release rule. A draft belongs to its author and the chain above; the
 *     subject sees it only once it has been released to them, and releasing it
 *     requires the written part to be filled in.
 */
@Injectable()
export class PerformanceService {
  constructor(private readonly prisma: PrismaService) {}

  private holds(actor: Actor, permission: string): boolean {
    return (actor.permissions as readonly string[]).includes(permission);
  }

  /** What this actor may be asked to fill in, and about whom. */
  async subjects(actor: Actor) {
    const target = REVIEWS_ROLE[actor.role];
    if (!target) return { reviewsRole: null, dimensions: [], people: [] };

    // An examiner is scoped to their own assignments. A manager and the
    // institution see every person on the rung below them.
    const people =
      actor.role === "INSTRUCTOR"
        ? await this.assignedLearners(actor.id)
        : await this.prisma.user.findMany({
            where: { role: target, archivedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, email: true, role: true },
          });

    return {
      reviewsRole: target,
      dimensions: dimensionsFor(target),
      people,
    };
  }

  private async assignedLearners(instructorId: string) {
    const assignments = await this.prisma.instructorAssignment.findMany({
      where: { instructorId },
      select: {
        learner: {
          select: {
            id: true,
            name: true,
            email: true,
            role: true,
            archivedAt: true,
          },
        },
      },
    });

    return assignments
      .map((a) => a.learner)
      .filter((learner) => learner.archivedAt === null)
      .map(({ archivedAt: _omitted, ...rest }) => rest)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Refuses to let this actor write about this person, and says which rule
   * stopped them — a refusal that does not say why is a support ticket.
   */
  private async assertMayReview(
    actor: Actor,
    subjectId: string,
  ): Promise<Role> {
    if (subjectId === actor.id) {
      throw new ForbiddenException("Nobody reviews themselves");
    }

    const subject = await this.prisma.user.findUnique({
      where: { id: subjectId },
      select: { id: true, role: true, archivedAt: true, name: true },
    });
    if (!subject || subject.archivedAt)
      throw new NotFoundException("User not found");

    if (!mayReview(actor.role, subject.role)) {
      const target = REVIEWS_ROLE[actor.role];
      throw new ForbiddenException(
        target
          ? `A ${actor.role} assesses ${target} records, not ${subject.role} ones.`
          : `A ${actor.role} assesses nobody.`,
      );
    }

    // An examiner's reach is their assignments, exactly as it is for marking.
    if (actor.role === "INSTRUCTOR") {
      const assigned = await this.prisma.instructorAssignment.findFirst({
        where: { instructorId: actor.id, learnerId: subjectId },
        select: { id: true },
      });
      if (!assigned) {
        throw new NotFoundException("User not found");
      }
    }

    return subject.role;
  }

  /**
   * Writes or updates a review.
   *
   * One per subject, reviewer and cycle: a second is an edit of the first
   * rather than a second opinion filed beside it.
   */
  async write(actor: Actor, dto: WritePerformanceReviewDto) {
    const subjectRole = await this.assertMayReview(actor, dto.subjectId);

    const dimensions = dimensionsFor(subjectRole);
    if (dto.scores.length !== dimensions.length) {
      throw new BadRequestException(
        `A ${subjectRole} is scored on ${dimensions.length} dimensions; ${dto.scores.length} were sent.`,
      );
    }
    if (dto.scores.some((s) => s < 1 || s > PERFORMANCE_MAX_SCORE)) {
      throw new BadRequestException(
        `Every score is 1 to ${PERFORMANCE_MAX_SCORE}.`,
      );
    }

    const index = computePerformanceIndex(dto.scores, dimensions.length);
    const band = performanceBandFor(index);

    const existing = await this.prisma.performanceReview.findUnique({
      where: {
        subjectId_reviewerId_cycle: {
          subjectId: dto.subjectId,
          reviewerId: actor.id,
          cycle: dto.cycle,
        },
      },
      select: { id: true, status: true },
    });

    // A released review is what the subject has already read. Changing it
    // under them would make the copy they were given untrue, so it is a new
    // cycle or nothing.
    if (existing?.status === "RELEASED") {
      throw new BadRequestException(
        "This review has been released. Open a new cycle rather than rewriting what they have already read.",
      );
    }

    return this.prisma.performanceReview.upsert({
      where: {
        subjectId_reviewerId_cycle: {
          subjectId: dto.subjectId,
          reviewerId: actor.id,
          cycle: dto.cycle,
        },
      },
      create: {
        subjectId: dto.subjectId,
        subjectRole,
        reviewerId: actor.id,
        reviewerRole: actor.role,
        cycle: dto.cycle,
        scores: dto.scores,
        index,
        band: band.band,
        strengths: dto.strengths ?? "",
        concerns: dto.concerns ?? "",
        actions: dto.actions ?? "",
      },
      update: {
        scores: dto.scores,
        index,
        band: band.band,
        ...(dto.strengths !== undefined ? { strengths: dto.strengths } : {}),
        ...(dto.concerns !== undefined ? { concerns: dto.concerns } : {}),
        ...(dto.actions !== undefined ? { actions: dto.actions } : {}),
      },
    });
  }

  /**
   * Hands the review to the person it is about.
   *
   * The written part is required here rather than on save, so a reviewer can
   * keep a half-finished draft without being nagged — but cannot hand somebody
   * a number with no account of it.
   */
  async release(actor: Actor, reviewId: string) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      select: {
        id: true,
        reviewerId: true,
        status: true,
        strengths: true,
        concerns: true,
        subject: { select: { name: true } },
      },
    });
    if (!review) throw new NotFoundException("Review not found");

    if (review.reviewerId !== actor.id) {
      throw new ForbiddenException(
        "A review is released by the person who wrote it.",
      );
    }
    if (review.status === "RELEASED") {
      throw new BadRequestException("This review has already been released.");
    }
    if (
      review.strengths.trim().length < 20 ||
      review.concerns.trim().length < 20
    ) {
      throw new BadRequestException(
        "Say what they do well and what to work on, in a sentence each. A score with no account of it is not a review.",
      );
    }

    return this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: { status: "RELEASED", releasedAt: new Date() },
    });
  }

  /** The subject saying they have read it. Only ever the subject. */
  async acknowledge(actor: Actor, reviewId: string) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      select: { id: true, subjectId: true, status: true, acknowledgedAt: true },
    });
    if (!review) throw new NotFoundException("Review not found");

    if (review.subjectId !== actor.id) {
      throw new ForbiddenException(
        "Only the person a review is about can acknowledge it.",
      );
    }
    if (review.status !== "RELEASED") {
      throw new NotFoundException("Review not found");
    }
    if (review.acknowledgedAt) return review;

    return this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: { acknowledgedAt: new Date() },
    });
  }

  /**
   * Every review this actor may see.
   *
   * Three separate entitlements, combined rather than conflated: the ones
   * about them (released only), the ones they wrote (any status), and the ones
   * about people below them (any status, because that is the point of
   * oversight).
   */
  async list(actor: Actor, query: PerformanceQuery) {
    const clauses: Array<Record<string, unknown>> = [];

    if (this.holds(actor, P.PERFORMANCE_READ_SELF)) {
      clauses.push({ subjectId: actor.id, status: "RELEASED" });
    }
    clauses.push({ reviewerId: actor.id });

    if (this.holds(actor, P.PERFORMANCE_READ_CHAIN)) {
      const below = this.rolesBelow(actor.role);
      if (below.length > 0) {
        clauses.push(
          actor.role === "INSTRUCTOR"
            ? // An examiner's oversight is their own writing; they do not read
              // what another examiner wrote about a different candidate.
              { reviewerId: actor.id }
            : { subjectRole: { in: below } },
        );
      }
    }

    const reviews = await this.prisma.performanceReview.findMany({
      where: {
        OR: clauses,
        ...(query.subjectId ? { subjectId: query.subjectId } : {}),
        ...(query.cycle ? { cycle: query.cycle } : {}),
        ...(query.status ? { status: query.status } : {}),
      },
      orderBy: [{ cycle: "desc" }, { createdAt: "desc" }],
      include: {
        subject: { select: { id: true, name: true, email: true, role: true } },
        reviewer: { select: { id: true, name: true, role: true } },
      },
    });

    return reviews.map((review) => this.decorate(review, actor));
  }

  async detail(actor: Actor, reviewId: string) {
    const review = await this.prisma.performanceReview.findUnique({
      where: { id: reviewId },
      include: {
        subject: { select: { id: true, name: true, email: true, role: true } },
        reviewer: { select: { id: true, name: true, role: true } },
      },
    });
    if (!review) throw new NotFoundException("Review not found");

    const isSubject = review.subjectId === actor.id;
    const isReviewer = review.reviewerId === actor.id;
    const inChain =
      this.holds(actor, P.PERFORMANCE_READ_CHAIN) &&
      this.rolesBelow(actor.role).includes(review.subjectRole);

    // A draft is not visible to its subject: "not yet released" and "does not
    // exist" are the same answer from outside, which is the point.
    if (isSubject && review.status !== "RELEASED") {
      throw new NotFoundException("Review not found");
    }
    if (!isSubject && !isReviewer && !inChain) {
      throw new NotFoundException("Review not found");
    }

    return this.decorate(review, actor);
  }

  /** The rungs an actor may look down at. */
  private rolesBelow(role: Role): Role[] {
    const ladder: Role[] = ["STUDENT", "INSTRUCTOR", "MANAGER", "ADMIN"];
    return ladder.slice(0, ladder.indexOf(role));
  }

  /** Adds what the interface needs and never recomputes the index. */
  private decorate(
    review: {
      scores: number[];
      index: number;
      band: string;
      subjectRole: Role;
      subjectId: string;
      reviewerId: string;
      status: string;
    } & Record<string, unknown>,
    actor: Actor,
  ) {
    const dimensions = dimensionsFor(review.subjectRole);
    const band = performanceBandFor(review.index);

    return {
      ...review,
      bandLabel: band.label,
      bandTone: band.tone,
      dimensions: dimensions.map((dimension, i) => ({
        ...dimension,
        score: review.scores[i] ?? null,
      })),
      /** What this reader may do with it, decided here rather than in the page. */
      viewer: {
        isSubject: review.subjectId === actor.id,
        isReviewer: review.reviewerId === actor.id,
        canRelease: review.reviewerId === actor.id && review.status === "DRAFT",
        canAcknowledge:
          review.subjectId === actor.id && review.status === "RELEASED",
      },
    };
  }
}
