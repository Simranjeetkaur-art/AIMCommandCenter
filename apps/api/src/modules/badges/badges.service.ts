import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { BadgeAwardMode } from "@prisma/client";
import { BADGE_CRITERIA_TYPES, type BadgeCriteria } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import type { Actor } from "../../common/auth/actor";
import type {
  AwardBadgeDto,
  CreateBadgeDto,
  RevokeBadgeDto,
  UpdateBadgeDto,
} from "./badges.dto";
import { sanitiseBadgeSvg } from "./svg-sanitiser";

@Injectable()
export class BadgesService {
  private readonly logger = new Logger(BadgesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
  ) {}

  // -- Definitions ----------------------------------------------------------

  list(programmeCode?: string) {
    return this.prisma.badge.findMany({
      where: programmeCode ? { programmeCode } : {},
      include: {
        createdBy: { select: { id: true, name: true } },
        _count: { select: { awards: true } },
      },
      orderBy: [{ programmeCode: "asc" }, { code: "asc" }],
    });
  }

  async create(actor: Actor, dto: CreateBadgeDto) {
    this.assertCriteriaCoherent(dto.criteria as BadgeCriteria, dto.awardMode);

    const created = await this.prisma.badge.create({
      data: {
        code: dto.code.toUpperCase().replace(/\s+/g, "_"),
        title: dto.title,
        description: dto.description ?? "",
        // Artwork is sanitised here rather than at render: what is stored is
        // what is safe, so every consumer of this row gets the same guarantee.
        iconSvg: dto.iconSvg ? sanitiseBadgeSvg(dto.iconSvg) : null,
        iconText: dto.iconText ?? null,
        tone: dto.tone ?? "brass",
        level: dto.level ?? null,
        position: dto.position ?? 0,
        criteria: dto.criteria as object,
        awardMode:
          (dto.criteria as BadgeCriteria).type === BADGE_CRITERIA_TYPES.MANUAL
            ? BadgeAwardMode.MANUAL
            : (dto.awardMode ?? BadgeAwardMode.AUTOMATIC),
        programmeCode: dto.programmeCode ?? null,
        createdById: actor.id,
      },
    });

    // Reaches everyone who already qualifies, so two learners with identical
    // records do not end up with different badges because of when this was
    // written.
    const awarded = await this.backfill(created.id);
    return { ...created, awardedOnCreate: awarded };
  }

  /**
   * Evaluates one badge against every candidate.
   *
   * Run when a badge is defined or its condition changes. Without it, a new
   * badge would only reach people who happen to sit an assessment afterwards,
   * so two learners with identical records would hold different badges purely
   * because of when the badge was written.
   */
  async backfill(badgeId: string): Promise<number> {
    const badge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
    });
    if (!badge || !badge.active || badge.awardMode !== BadgeAwardMode.AUTOMATIC)
      return 0;

    const criteria = badge.criteria as unknown as BadgeCriteria;
    const learners = await this.prisma.user.findMany({
      where: { role: "STUDENT", status: "ACTIVE" },
      select: { id: true },
    });

    let awarded = 0;
    for (const learner of learners) {
      const held = await this.prisma.badgeAward.findUnique({
        where: { badgeId_userId: { badgeId, userId: learner.id } },
        select: { id: true, revokedAt: true },
      });
      // A withdrawn award is a decision, not an absence: backfill does not
      // undo an administrator who took a badge away.
      if (held) continue;

      try {
        if (await this.isEarned(learner.id, criteria)) {
          await this.prisma.badgeAward.create({
            data: { badgeId, userId: learner.id, source: "SYSTEM" },
          });
          awarded += 1;
        }
      } catch (err) {
        this.logger.warn(
          `Backfill of ${badge.code} skipped ${learner.id}: ${(err as Error).message}`,
        );
      }
    }

    return awarded;
  }

  async update(badgeId: string, dto: UpdateBadgeDto) {
    const badge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
    });
    if (!badge) throw new NotFoundException("Badge not found");

    if (dto.criteria)
      this.assertCriteriaCoherent(dto.criteria as BadgeCriteria, dto.awardMode);

    const updated = await this.prisma.badge.update({
      where: { id: badgeId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.criteria !== undefined
          ? { criteria: dto.criteria as object }
          : {}),
        ...(dto.awardMode !== undefined ? { awardMode: dto.awardMode } : {}),
        ...(dto.programmeCode !== undefined
          ? { programmeCode: dto.programmeCode }
          : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.iconSvg !== undefined
          ? { iconSvg: dto.iconSvg ? sanitiseBadgeSvg(dto.iconSvg) : null }
          : {}),
        ...(dto.iconText !== undefined ? { iconText: dto.iconText } : {}),
        ...(dto.tone !== undefined ? { tone: dto.tone } : {}),
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });

    // A changed condition means a different set of people qualify.
    const awarded = await this.backfill(updated.id);
    return { ...updated, awardedOnUpdate: awarded };
  }

  /**
   * A condition has to be answerable, or the badge is unearnable and nobody
   * finds out until a learner asks why they have not got it.
   */
  private assertCriteriaCoherent(
    criteria: BadgeCriteria,
    mode?: BadgeAwardMode,
  ): void {
    const { type } = criteria;

    if (type === BADGE_CRITERIA_TYPES.MANUAL) {
      if (mode === BadgeAwardMode.AUTOMATIC) {
        throw new BadRequestException(
          "A manual condition cannot be awarded automatically",
        );
      }
      return;
    }

    const needsAssessment: string[] = [
      BADGE_CRITERIA_TYPES.ASSESSMENT_PASSED,
      BADGE_CRITERIA_TYPES.ASSESSMENT_SCORE,
    ];
    const needsProgramme: string[] = [
      BADGE_CRITERIA_TYPES.MODULES_COMPLETED,
      BADGE_CRITERIA_TYPES.TRACK_COMPLETE,
      BADGE_CRITERIA_TYPES.CREDENTIAL_HELD,
    ];
    const needsThreshold: string[] = [
      BADGE_CRITERIA_TYPES.ASSESSMENT_SCORE,
      BADGE_CRITERIA_TYPES.MODULES_COMPLETED,
      BADGE_CRITERIA_TYPES.DIAGNOSTICS_RUN,
      BADGE_CRITERIA_TYPES.LEVEL_MODULES_COMPLETED,
      BADGE_CRITERIA_TYPES.BADGES_HELD,
    ];
    const needsLevel: string[] = [
      BADGE_CRITERIA_TYPES.LEVEL_MODULES_COMPLETED,
      BADGE_CRITERIA_TYPES.LEVEL_COMPLETE,
    ];
    if (needsLevel.includes(type) && !criteria.level) {
      throw new BadRequestException(`${type} needs a ladder level`);
    }
    if (
      type === BADGE_CRITERIA_TYPES.ASSESSMENT_KIND_PASSED &&
      !criteria.assessmentKind
    ) {
      throw new BadRequestException(`${type} needs an assessment kind`);
    }

    if (needsAssessment.includes(type) && !criteria.assessmentCode) {
      throw new BadRequestException(`${type} needs an assessment code`);
    }
    if (needsProgramme.includes(type) && !criteria.programmeCode) {
      throw new BadRequestException(`${type} needs a track code`);
    }
    if (needsThreshold.includes(type) && !criteria.threshold) {
      throw new BadRequestException(`${type} needs a threshold`);
    }
  }

  // -- Evaluation -----------------------------------------------------------

  /**
   * Evaluates every automatic badge for one learner and awards what is earned.
   *
   * Called after an attempt is marked, after a review is recorded and after a
   * credential is issued -- the three moments a condition can newly become
   * true. It never removes an award: a badge earned stays earned unless an
   * administrator withdraws it and says why.
   */
  async evaluateFor(userId: string): Promise<string[]> {
    const badges = await this.prisma.badge.findMany({
      where: { active: true, awardMode: BadgeAwardMode.AUTOMATIC },
    });
    if (badges.length === 0) return [];

    const held = new Set(
      (
        await this.prisma.badgeAward.findMany({
          where: { userId, revokedAt: null },
          select: { badgeId: true },
        })
      ).map((a) => a.badgeId),
    );

    const awarded: string[] = [];
    for (const badge of badges) {
      if (held.has(badge.id)) continue;
      try {
        if (
          await this.isEarned(
            userId,
            badge.criteria as unknown as BadgeCriteria,
          )
        ) {
          await this.prisma.badgeAward.upsert({
            where: { badgeId_userId: { badgeId: badge.id, userId } },
            create: { badgeId: badge.id, userId, source: "SYSTEM" },
            update: { revokedAt: null, revokedReason: null },
          });
          awarded.push(badge.code);
        }
      } catch (err) {
        // A badge whose condition cannot be evaluated must not break the
        // request that triggered the evaluation. It is logged and skipped.
        this.logger.warn(
          `Badge ${badge.code} could not be evaluated: ${(err as Error).message}`,
        );
      }
    }

    return awarded;
  }

  private async isEarned(
    userId: string,
    criteria: BadgeCriteria,
  ): Promise<boolean> {
    switch (criteria.type) {
      case BADGE_CRITERIA_TYPES.ASSESSMENT_PASSED: {
        const assessment = await this.prisma.assessment.findUnique({
          where: { code: criteria.assessmentCode! },
          select: { id: true },
        });
        if (!assessment) return false;
        const passed = await this.prisma.attempt.count({
          where: { userId, assessmentId: assessment.id, passed: true },
        });
        if (passed > 0) return true;
        // A reviewed milestone passes by approval rather than by score.
        const approved = await this.prisma.submission.count({
          where: { userId, assessmentId: assessment.id, status: "APPROVED" },
        });
        return approved > 0;
      }

      case BADGE_CRITERIA_TYPES.ASSESSMENT_SCORE: {
        const assessment = await this.prisma.assessment.findUnique({
          where: { code: criteria.assessmentCode! },
          select: { id: true },
        });
        if (!assessment) return false;
        const best = await this.prisma.attempt.findFirst({
          where: {
            userId,
            assessmentId: assessment.id,
            score: { gte: criteria.threshold! },
          },
          select: { id: true },
        });
        return best !== null;
      }

      case BADGE_CRITERIA_TYPES.MODULES_COMPLETED: {
        const lessons = await this.prisma.lesson.findMany({
          where: {
            module: {
              programmeVersion: {
                programme: { code: criteria.programmeCode! },
              },
            },
          },
          select: { id: true, moduleId: true },
        });
        if (lessons.length === 0) return false;
        const done = await this.prisma.lessonProgress.findMany({
          where: {
            userId,
            lessonId: { in: lessons.map((l) => l.id) },
            status: "COMPLETED",
          },
          select: { lessonId: true },
        });
        const doneIds = new Set(done.map((d) => d.lessonId));
        const byModule = new Map<string, { total: number; done: number }>();
        for (const lesson of lessons) {
          const entry = byModule.get(lesson.moduleId) ?? { total: 0, done: 0 };
          entry.total += 1;
          if (doneIds.has(lesson.id)) entry.done += 1;
          byModule.set(lesson.moduleId, entry);
        }
        const complete = [...byModule.values()].filter(
          (m) => m.done === m.total,
        ).length;
        return complete >= criteria.threshold!;
      }

      case BADGE_CRITERIA_TYPES.TRACK_COMPLETE: {
        return this.trackComplete(userId, criteria.programmeCode!);
      }

      case BADGE_CRITERIA_TYPES.CREDENTIAL_HELD: {
        const credential = await this.prisma.credential.findFirst({
          where: {
            userId,
            status: "ISSUED",
            programmeVersion: { programme: { code: criteria.programmeCode! } },
          },
          select: { id: true },
        });
        return credential !== null;
      }

      case BADGE_CRITERIA_TYPES.DIAGNOSTICS_RUN: {
        const runs = await this.prisma.diagnostic.count({
          where: { createdById: userId },
        });
        return runs >= criteria.threshold!;
      }

      case BADGE_CRITERIA_TYPES.LEVEL_MODULES_COMPLETED: {
        // "Five modules of level one" — counted across whichever tracks sit at
        // that rung, so a level with two tracks still answers the question.
        const done = await this.modulesCompletedAtLevel(
          userId,
          criteria.level!,
        );
        return done >= criteria.threshold!;
      }

      case BADGE_CRITERIA_TYPES.LEVEL_COMPLETE: {
        const programmes = await this.prisma.programme.findMany({
          where: { level: criteria.level!, visible: true },
          select: { code: true },
        });
        if (programmes.length === 0) return false;
        for (const programme of programmes) {
          if (!(await this.trackComplete(userId, programme.code))) return false;
        }
        return true;
      }

      case BADGE_CRITERIA_TYPES.ASSESSMENT_KIND_PASSED: {
        const assessments = await this.prisma.assessment.findMany({
          where: {
            kind: criteria.assessmentKind as never,
            ...(criteria.programmeCode
              ? {
                  programmeVersion: {
                    programme: { code: criteria.programmeCode },
                  },
                }
              : {}),
          },
          select: { id: true },
        });
        if (assessments.length === 0) return false;
        const ids = assessments.map((a) => a.id);
        const passed = await this.prisma.attempt.count({
          where: { userId, assessmentId: { in: ids }, passed: true },
        });
        if (passed > 0) return true;
        const approved = await this.prisma.submission.count({
          where: { userId, assessmentId: { in: ids }, status: "APPROVED" },
        });
        return approved > 0;
      }

      case BADGE_CRITERIA_TYPES.BADGES_HELD: {
        const held = await this.prisma.badgeAward.count({
          where: { userId, revokedAt: null },
        });
        return held >= criteria.threshold!;
      }

      case BADGE_CRITERIA_TYPES.MANUAL:
      default:
        return false;
    }
  }

  /**
   * How many modules the learner has finished at one rung of the ladder.
   *
   * A module counts when every lesson in it is complete. Counted across all
   * tracks at that level, because the level is the unit the badge names.
   */
  async modulesCompletedAtLevel(
    userId: string,
    level: number,
  ): Promise<number> {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        module: {
          programmeVersion: {
            status: "PUBLISHED",
            programme: { level, visible: true },
          },
        },
      },
      select: { id: true, moduleId: true },
    });
    if (lessons.length === 0) return 0;

    const done = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: lessons.map((l) => l.id) },
        status: "COMPLETED",
      },
      select: { lessonId: true },
    });
    const doneIds = new Set(done.map((d) => d.lessonId));

    const byModule = new Map<string, { total: number; done: number }>();
    for (const lesson of lessons) {
      const entry = byModule.get(lesson.moduleId) ?? { total: 0, done: 0 };
      entry.total += 1;
      if (doneIds.has(lesson.id)) entry.done += 1;
      byModule.set(lesson.moduleId, entry);
    }

    return [...byModule.values()].filter(
      (m) => m.total > 0 && m.done === m.total,
    ).length;
  }

  /** Every module read and every assessment of the track cleared. */
  async trackComplete(userId: string, programmeCode: string): Promise<boolean> {
    const version = await this.prisma.programmeVersion.findFirst({
      where: { programme: { code: programmeCode }, status: "PUBLISHED" },
      include: {
        modules: { include: { lessons: { select: { id: true } } } },
        assessments: { select: { id: true, requiresReview: true } },
      },
    });
    if (!version) return false;

    const lessonIds = version.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );
    if (lessonIds.length === 0 || version.assessments.length === 0)
      return false;

    const doneLessons = await this.prisma.lessonProgress.count({
      where: { userId, lessonId: { in: lessonIds }, status: "COMPLETED" },
    });
    if (doneLessons < lessonIds.length) return false;

    for (const assessment of version.assessments) {
      if (assessment.requiresReview) {
        const approved = await this.prisma.submission.count({
          where: { userId, assessmentId: assessment.id, status: "APPROVED" },
        });
        if (approved === 0) return false;
      } else {
        const passed = await this.prisma.attempt.count({
          where: { userId, assessmentId: assessment.id, passed: true },
        });
        if (passed === 0) return false;
      }
    }

    return true;
  }

  // -- Awarding -------------------------------------------------------------

  /**
   * A manual award.
   *
   * Only a badge whose condition is MANUAL can be given this way: an automatic
   * badge is earned by meeting its condition, and handing one over by fiat
   * would make the condition a suggestion. The learner must be within the
   * awarder's scope, and the reason is recorded on the award itself.
   */
  /**
   * Removes a badge definition entirely.
   *
   * A badge that has been awarded is part of somebody's record, so this only
   * works on one nobody holds. Deactivating is the answer for the rest: it
   * stops further awards and leaves the ones already made standing, which is
   * almost always what the question "can I delete this badge" really means.
   */
  async remove(badgeId: string) {
    const badge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
      select: { id: true, title: true, _count: { select: { awards: true } } },
    });
    if (!badge) throw new NotFoundException("Badge not found");

    if (badge._count.awards > 0) {
      throw new BadRequestException(
        `${badge._count.awards} learner(s) hold this badge. Deactivate it instead: their awards stand and nobody else earns it.`,
      );
    }

    await this.prisma.badge.delete({ where: { id: badgeId } });
    return { deleted: true, title: badge.title };
  }

  async award(actor: Actor, badgeId: string, dto: AwardBadgeDto) {
    const badge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
    });
    if (!badge) throw new NotFoundException("Badge not found");
    if (!badge.active)
      throw new BadRequestException("That badge is not active");

    if (badge.awardMode !== BadgeAwardMode.MANUAL) {
      throw new BadRequestException(
        "This badge is earned by meeting its condition. Only a manual badge can be awarded by hand.",
      );
    }

    await this.scope.assertCanSeeLearner(actor, dto.learnerId);

    const learner = await this.prisma.user.findUnique({
      where: { id: dto.learnerId },
      select: { role: true },
    });
    if (learner?.role !== "STUDENT") {
      throw new BadRequestException("A badge is awarded to a candidate");
    }
    if (dto.learnerId === actor.id) {
      throw new ForbiddenException("Nobody awards themselves a badge");
    }

    return this.prisma.badgeAward.upsert({
      where: { badgeId_userId: { badgeId, userId: dto.learnerId } },
      create: {
        badgeId,
        userId: dto.learnerId,
        source: "INSTRUCTOR",
        awardedById: actor.id,
        reason: dto.reason,
      },
      update: {
        revokedAt: null,
        revokedReason: null,
        awardedById: actor.id,
        reason: dto.reason,
      },
      include: { badge: { select: { code: true, title: true } } },
    });
  }

  async revoke(actor: Actor, badgeId: string, dto: RevokeBadgeDto) {
    const award = await this.prisma.badgeAward.findUnique({
      where: { badgeId_userId: { badgeId, userId: dto.learnerId } },
    });
    if (!award)
      throw new NotFoundException("That learner does not hold this badge");
    if (award.revokedAt)
      throw new BadRequestException("That award is already withdrawn");

    // Withdrawn, never deleted: the record shows it was held and then was not.
    return this.prisma.badgeAward.update({
      where: { id: award.id },
      data: {
        revokedAt: new Date(),
        revokedReason: dto.reason,
        awardedById: actor.id,
      },
    });
  }

  /** A learner's shelf: what they hold, and what is still open to them. */
  async forLearner(actor: Actor, learnerId: string) {
    await this.scope.assertCanSeeLearner(actor, learnerId);

    const [badges, awards] = await Promise.all([
      this.prisma.badge.findMany({
        where: { active: true },
        orderBy: [{ level: "asc" }, { position: "asc" }, { code: "asc" }],
      }),
      this.prisma.badgeAward.findMany({
        where: { userId: learnerId },
        include: { awardedBy: { select: { id: true, name: true } } },
      }),
    ]);

    const awardByBadge = new Map(awards.map((a) => [a.badgeId, a]));

    return badges.map((badge) => {
      const award = awardByBadge.get(badge.id);
      return {
        id: badge.id,
        code: badge.code,
        title: badge.title,
        description: badge.description,
        criteria: badge.criteria,
        awardMode: badge.awardMode,
        programmeCode: badge.programmeCode,
        iconSvg: badge.iconSvg,
        iconText: badge.iconText,
        tone: badge.tone,
        level: badge.level,
        position: badge.position,
        held: Boolean(award && !award.revokedAt),
        awardedAt: award?.awardedAt ?? null,
        awardedBy: award?.awardedBy?.name ?? (award ? "System" : null),
        reason: award?.reason ?? null,
        revokedAt: award?.revokedAt ?? null,
        revokedReason: award?.revokedReason ?? null,
      };
    });
  }
}
