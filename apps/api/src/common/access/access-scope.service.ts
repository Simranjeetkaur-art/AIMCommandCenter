import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { PrismaService } from "../prisma/prisma.service";
import type { Actor } from "../auth/actor";

/**
 * Row-level scope.
 *
 * A permission says what kind of thing a role may do. It does not say which
 * learner it may do it to. Holding submission.read.assigned is not permission
 * to read every submission; it is permission to read the ones belonging to
 * learners this examiner has been assigned.
 *
 * Every read path that touches another person's record goes through here.
 * The methods throw rather than return false, so a forgotten `if` is a crash
 * in test rather than a leak in production.
 */
@Injectable()
export class AccessScopeService {
  constructor(private readonly prisma: PrismaService) {}

  private can(actor: Actor, permission: string): boolean {
    return (actor.permissions as readonly string[]).includes(permission);
  }

  /** Learner ids this actor may see, or `null` meaning "no restriction". */
  async visibleLearnerIds(actor: Actor): Promise<string[] | null> {
    if (
      this.can(actor, P.PROGRESS_READ_ALL) ||
      this.can(actor, P.SUBMISSION_READ_ALL)
    ) {
      return null;
    }
    if (
      this.can(actor, P.PROGRESS_READ_ASSIGNED) ||
      this.can(actor, P.SUBMISSION_READ_ASSIGNED)
    ) {
      const rows = await this.prisma.instructorAssignment.findMany({
        where: { instructorId: actor.id },
        select: { learnerId: true },
      });
      return rows.map((r) => r.learnerId);
    }
    return [actor.id];
  }

  /**
   * A Prisma `where` fragment restricting a query to what this actor may see.
   * Returns {} only when the actor genuinely holds an all-learners permission.
   */
  async learnerScopeFilter(
    actor: Actor,
  ): Promise<{ userId?: string | { in: string[] } }> {
    const ids = await this.visibleLearnerIds(actor);
    if (ids === null) return {};
    if (ids.length === 1) return { userId: ids[0] };
    return { userId: { in: ids } };
  }

  async assertCanSeeLearner(actor: Actor, learnerId: string): Promise<void> {
    if (actor.id === learnerId) return;

    const ids = await this.visibleLearnerIds(actor);
    if (ids === null) return;
    if (ids.includes(learnerId)) return;

    // Deliberately indistinguishable from a learner who does not exist. An
    // examiner should not be able to enumerate the roll by probing ids.
    throw new NotFoundException("Learner not found");
  }

  async isAssignedTo(
    instructorId: string,
    learnerId: string,
  ): Promise<boolean> {
    const row = await this.prisma.instructorAssignment.findUnique({
      where: { instructorId_learnerId: { instructorId, learnerId } },
      select: { id: true },
    });
    return row !== null;
  }

  /**
   * Nobody judges their own work. This is not covered by the permission
   * matrix -- an instructor legitimately holds review.approve -- so it is
   * checked against the specific submission instead.
   */
  assertNotSelfReview(actor: Actor, submissionAuthorId: string): void {
    if (actor.id === submissionAuthorId) {
      throw new ForbiddenException(
        "An examiner cannot review their own submission",
      );
    }
  }

  /** The learner owns this record, or the caller is refused. */
  assertOwnRecord(actor: Actor, ownerId: string): void {
    if (actor.id !== ownerId) {
      throw new NotFoundException("Record not found");
    }
  }
}
