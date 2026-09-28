import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import type { Actor } from "../../common/auth/actor";
import type { SetProgressDto } from "./learning.dto";
import { TrackAccessService } from "../academy/track-access.service";

@Injectable()
export class LearningService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly trackAccess: TrackAccessService,
  ) {}

  /**
   * A learner's record. `learnerId` defaults to the caller, and anything else
   * goes through the scope check first, so a student asking for someone else's
   * id gets the same answer as if that person did not exist.
   */
  async record(actor: Actor, learnerId?: string) {
    const targetId = learnerId ?? actor.id;
    await this.scope.assertCanSeeLearner(actor, targetId);

    const [
      user,
      enrollments,
      progress,
      attempts,
      submissions,
      badges,
      credentials,
    ] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: targetId },
        select: {
          id: true,
          name: true,
          email: true,
          status: true,
          createdAt: true,
        },
      }),
      this.prisma.enrollment.findMany({
        where: { userId: targetId },
        include: {
          cohort: {
            include: { programmeVersion: { include: { programme: true } } },
          },
        },
      }),
      this.prisma.lessonProgress.findMany({
        where: { userId: targetId },
        include: {
          lesson: { select: { id: true, title: true, moduleId: true } },
        },
      }),
      this.prisma.attempt.findMany({
        where: { userId: targetId },
        // Never `include: { assessment: { include: { questions: ... } } }`.
        // Responses may be shown; the key they were marked against may not.
        select: {
          id: true,
          attemptNo: true,
          score: true,
          passed: true,
          startedAt: true,
          submittedAt: true,
          assessment: {
            select: {
              id: true,
              code: true,
              title: true,
              kind: true,
              passMark: true,
            },
          },
        },
        orderBy: { startedAt: "desc" },
      }),
      this.prisma.submission.findMany({
        where: { userId: targetId },
        select: {
          id: true,
          status: true,
          version: true,
          score: true,
          submittedAt: true,
          slaDueAt: true,
          assessment: {
            select: { id: true, code: true, title: true, kind: true },
          },
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
      }),
      this.prisma.badgeAward.findMany({
        where: { userId: targetId },
        include: { badge: true },
      }),
      this.prisma.credential.findMany({
        where: { userId: targetId },
        include: { programmeVersion: { include: { programme: true } } },
      }),
    ]);

    if (!user) throw new NotFoundException("Learner not found");

    return {
      user,
      enrollments,
      progress,
      attempts,
      submissions,
      badges,
      credentials,
    };
  }

  /** A learner marks their own progress. Nobody marks it for them. */
  async setProgress(actor: Actor, dto: SetProgressDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: dto.lessonId },
      select: {
        id: true,
        visible: true,
        module: { select: { visible: true, programmeVersionId: true } },
      },
    });
    // Hidden reads as absent here too, as it does on the lesson itself.
    if (!lesson || !lesson.visible || !lesson.module.visible) {
      throw new NotFoundException("Lesson not found");
    }
    // Progress on a locked track would count towards a gate the candidate
    // has not been let through; the ladder is enforced where the work happens.
    await this.trackAccess.assertTrainingOpen(
      actor,
      lesson.module.programmeVersionId,
    );

    const now = new Date();
    return this.prisma.lessonProgress.upsert({
      where: { userId_lessonId: { userId: actor.id, lessonId: dto.lessonId } },
      create: {
        userId: actor.id,
        lessonId: dto.lessonId,
        status: dto.status,
        startedAt: now,
        completedAt: dto.status === "COMPLETED" ? now : null,
      },
      update: {
        status: dto.status,
        completedAt: dto.status === "COMPLETED" ? now : null,
      },
    });
  }

  /** The roll an actor is allowed to see, which for an examiner is their own list. */
  async learners(actor: Actor) {
    const ids = await this.scope.visibleLearnerIds(actor);

    const users = await this.prisma.user.findMany({
      where: {
        role: "STUDENT",
        ...(ids === null ? {} : { id: { in: ids } }),
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        _count: { select: { submissions: true, credentials: true } },
        enrollments: {
          select: {
            status: true,
            cohort: { select: { id: true, code: true, title: true } },
          },
        },
      },
      orderBy: { name: "asc" },
    });

    return users;
  }
}
