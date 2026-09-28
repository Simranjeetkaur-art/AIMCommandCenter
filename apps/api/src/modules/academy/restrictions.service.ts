import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { reachesOrigin } from "./unlock-graph";
import { normaliseGateSteps } from "./gate-steps";
import { TrackAccessService } from "./track-access.service";
import type { Actor } from "../../common/auth/actor";
import type {
  CreateUnlockRuleDto,
  UpdateUnlockRuleDto,
  SetUnlockPolicyDto,
  CreateTrackGrantDto,
} from "./academy.dto";

/**
 * Who may enter a track, and who was let in by name.
 *
 * Two separate things live here because they answer to different people. The
 * rules are academy building: a manager writes the conditions that open a
 * track for everyone. A grant is an institutional exception: an administrator
 * admits one named person against those conditions, with a reason, and the
 * credential that follows carries the waiver.
 */
@Injectable()
export class RestrictionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trackAccess: TrackAccessService,
  ) {}

  /** Every rule on a track, plus the live grants against it. */
  async forProgramme(programmeId: string) {
    const programme = await this.prisma.programme.findUnique({
      where: { id: programmeId },
      select: {
        id: true,
        code: true,
        title: true,
        level: true,
        levelLabel: true,
        tagline: true,
        prerequisiteCode: true,
        devAccessFlag: true,
        unlockPolicy: true,
        cardStats: true,
        gateSteps: true,
        unlockRules: {
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
          include: { createdBy: { select: { name: true } } },
        },
        trackGrants: {
          orderBy: { createdAt: "desc" },
          include: {
            user: { select: { id: true, name: true, email: true } },
            grantedBy: { select: { name: true } },
          },
        },
      },
    });
    if (!programme) throw new NotFoundException("Track not found");

    // The names a rule can point at, so the editor never asks anyone to type
    // a code from memory.
    const [tracks, badges, cohorts, assessments] = await Promise.all([
      this.prisma.programme.findMany({
        where: { id: { not: programmeId } },
        orderBy: { level: "asc" },
        select: { code: true, title: true },
      }),
      this.prisma.badge.findMany({
        where: { active: true },
        orderBy: { position: "asc" },
        select: { code: true, title: true },
      }),
      this.prisma.cohort.findMany({
        where: { archivedAt: null },
        orderBy: { startsAt: "desc" },
        select: { id: true, title: true },
      }),
      // The papers a gate step may point at, so the editor offers them
      // instead of asking an author to remember a code.
      this.prisma.assessment.findMany({
        where: { programmeVersion: { programmeId } },
        orderBy: [{ code: "asc" }],
        select: { code: true, title: true, kind: true },
      }),
    ]);

    return {
      programme: {
        ...programme,
        // One shape for the editor, whichever shape the column holds. A step
        // still resting on its label comes back marked `inferred`.
        gateSteps: normaliseGateSteps(programme.gateSteps, {
          hasPrerequisite: Boolean(programme.prerequisiteCode),
        }),
      },
      choices: { tracks, badges, cohorts, assessments },
    };
  }

  async setPolicy(programmeId: string, dto: SetUnlockPolicyDto) {
    await this.mustExist(programmeId);
    return this.prisma.programme.update({
      where: { id: programmeId },
      data: { unlockPolicy: dto.policy },
      select: { id: true, code: true, unlockPolicy: true },
    });
  }

  async createRule(
    actor: Actor,
    programmeId: string,
    dto: CreateUnlockRuleDto,
  ) {
    await this.mustExist(programmeId);
    await this.validate(programmeId, dto.type, dto);

    // The same condition twice is noise on a candidate's screen and, under
    // ANY, a rule that looks like two chances and is one.
    const duplicate = await this.prisma.unlockRule.findFirst({
      where: {
        programmeId,
        type: dto.type,
        requiredProgrammeCode: dto.requiredProgrammeCode ?? null,
        requiredBadgeCode: dto.requiredBadgeCode ?? null,
        requiredCohortId: dto.requiredCohortId ?? null,
        threshold: dto.threshold ?? null,
      },
      select: { id: true },
    });
    if (duplicate)
      throw new BadRequestException("This track already has that requirement");

    const last = await this.prisma.unlockRule.findFirst({
      where: { programmeId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    return this.prisma.unlockRule.create({
      data: {
        programmeId,
        type: dto.type,
        requiredProgrammeCode: dto.requiredProgrammeCode ?? null,
        requiredBadgeCode: dto.requiredBadgeCode ?? null,
        requiredCohortId: dto.requiredCohortId ?? null,
        threshold: dto.threshold ?? null,
        opensAt: dto.opensAt ? new Date(dto.opensAt) : null,
        closesAt: dto.closesAt ? new Date(dto.closesAt) : null,
        label: dto.label ?? "",
        position: dto.position ?? (last ? last.position + 1 : 0),
        createdById: actor.id,
      },
    });
  }

  async updateRule(ruleId: string, dto: UpdateUnlockRuleDto) {
    const rule = await this.prisma.unlockRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule) throw new NotFoundException("Rule not found");

    // Validate the rule as it will be, not the fields that happened to be
    // sent. Checking the patch alone makes every partial edit -- switching a
    // rule off, renaming its label -- fail for want of a field nobody touched.
    const merged: Partial<CreateUnlockRuleDto> = {
      requiredProgrammeCode:
        dto.requiredProgrammeCode ?? rule.requiredProgrammeCode ?? undefined,
      requiredBadgeCode:
        dto.requiredBadgeCode ?? rule.requiredBadgeCode ?? undefined,
      requiredCohortId:
        dto.requiredCohortId ?? rule.requiredCohortId ?? undefined,
      threshold: dto.threshold ?? rule.threshold ?? undefined,
      opensAt: dto.opensAt ?? rule.opensAt?.toISOString() ?? undefined,
      closesAt: dto.closesAt ?? rule.closesAt?.toISOString() ?? undefined,
    };
    await this.validate(rule.programmeId, dto.type ?? rule.type, merged);

    return this.prisma.unlockRule.update({
      where: { id: ruleId },
      data: {
        ...(dto.type !== undefined ? { type: dto.type } : {}),
        ...(dto.requiredProgrammeCode !== undefined
          ? { requiredProgrammeCode: dto.requiredProgrammeCode || null }
          : {}),
        ...(dto.requiredBadgeCode !== undefined
          ? { requiredBadgeCode: dto.requiredBadgeCode || null }
          : {}),
        ...(dto.requiredCohortId !== undefined
          ? { requiredCohortId: dto.requiredCohortId || null }
          : {}),
        ...(dto.threshold !== undefined ? { threshold: dto.threshold } : {}),
        ...(dto.opensAt !== undefined
          ? { opensAt: dto.opensAt ? new Date(dto.opensAt) : null }
          : {}),
        ...(dto.closesAt !== undefined
          ? { closesAt: dto.closesAt ? new Date(dto.closesAt) : null }
          : {}),
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
        ...(dto.position !== undefined ? { position: dto.position } : {}),
      },
    });
  }

  /**
   * A rule is deleted outright rather than archived. Nothing is recorded
   * against it -- a candidate's progress is measured by what they did, not by
   * which condition was in force -- so keeping a dead rule would only make the
   * restriction harder to read. The audit log holds what it said.
   */
  async deleteRule(ruleId: string) {
    const rule = await this.prisma.unlockRule.findUnique({
      where: { id: ruleId },
    });
    if (!rule) throw new NotFoundException("Rule not found");
    await this.prisma.unlockRule.delete({ where: { id: ruleId } });
    return { deleted: true };
  }

  /** Lets one named person past the rules, with a reason, until a date. */
  async grant(actor: Actor, programmeId: string, dto: CreateTrackGrantDto) {
    await this.mustExist(programmeId);

    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
      select: { id: true, name: true, role: true, archivedAt: true },
    });
    if (!user || user.archivedAt) throw new NotFoundException("User not found");
    if (user.role !== "STUDENT") {
      throw new BadRequestException("Only a candidate is admitted to a track");
    }

    const expiresAt = dto.expiresAt ? new Date(dto.expiresAt) : null;
    if (expiresAt && expiresAt <= new Date()) {
      throw new BadRequestException("An expiry in the past grants nothing");
    }

    // One grant per person per track: re-granting reopens the existing row so
    // the audit log reads as a sequence of decisions about one person.
    return this.prisma.trackGrant.upsert({
      where: { programmeId_userId: { programmeId, userId: dto.userId } },
      create: {
        programmeId,
        userId: dto.userId,
        reason: dto.reason,
        expiresAt,
        grantedById: actor.id,
      },
      update: {
        reason: dto.reason,
        expiresAt,
        revokedAt: null,
        grantedById: actor.id,
      },
    });
  }

  async revokeGrant(grantId: string) {
    const grant = await this.prisma.trackGrant.findUnique({
      where: { id: grantId },
    });
    if (!grant) throw new NotFoundException("Grant not found");
    if (grant.revokedAt)
      throw new BadRequestException("This grant is already revoked");
    return this.prisma.trackGrant.update({
      where: { id: grantId },
      data: { revokedAt: new Date() },
    });
  }

  /**
   * What one candidate would see, evaluated now.
   *
   * The point of an editable restriction is being able to check it against a
   * real person before it reaches them, rather than publishing a rule and
   * waiting for the support request.
   */
  async preview(programmeId: string, userId: string) {
    const programme = await this.mustExist(programmeId);
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true, email: true, role: true },
    });
    if (!user) throw new NotFoundException("User not found");
    const access = await this.trackAccess.evaluate(userId, programme.code);
    return { user, track: programme.code, access };
  }

  private async mustExist(programmeId: string) {
    const programme = await this.prisma.programme.findUnique({
      where: { id: programmeId },
      select: { id: true, code: true },
    });
    if (!programme) throw new NotFoundException("Track not found");
    return programme;
  }

  /**
   * A rule that names nothing cannot be evaluated, and a rule that names
   * something absent is worse than no rule: it locks a track on a condition
   * nobody can meet. Both are refused at the point of writing.
   */
  private async validate(
    programmeId: string,
    type: string,
    dto: Partial<CreateUnlockRuleDto>,
  ): Promise<void> {
    switch (type) {
      case "CREDENTIAL_HELD": {
        const code = dto.requiredProgrammeCode;
        if (!code)
          throw new BadRequestException(
            "Name the track whose credential is required",
          );
        const target = await this.prisma.programme.findUnique({
          where: { code },
          select: { id: true },
        });
        if (!target)
          throw new BadRequestException(`No track with code ${code}`);
        if (target.id === programmeId) {
          throw new BadRequestException(
            "A track cannot require its own credential",
          );
        }
        await this.assertNoCycle(programmeId, code);
        break;
      }
      case "BADGE_HELD": {
        const code = dto.requiredBadgeCode;
        if (!code)
          throw new BadRequestException("Name the badge that is required");
        const badge = await this.prisma.badge.findUnique({
          where: { code },
          select: { id: true },
        });
        if (!badge) throw new BadRequestException(`No badge with code ${code}`);
        break;
      }
      case "COHORT_MEMBER": {
        const id = dto.requiredCohortId;
        if (!id)
          throw new BadRequestException(
            "Name the cohort whose members are admitted",
          );
        const cohort = await this.prisma.cohort.findUnique({
          where: { id },
          select: { id: true },
        });
        if (!cohort) throw new BadRequestException("No such cohort");
        break;
      }
      case "DATE_WINDOW": {
        if (!dto.opensAt && !dto.closesAt) {
          throw new BadRequestException(
            "A date window needs an opening date, a closing date, or both",
          );
        }
        if (
          dto.opensAt &&
          dto.closesAt &&
          new Date(dto.opensAt) >= new Date(dto.closesAt)
        ) {
          throw new BadRequestException("The window closes before it opens");
        }
        break;
      }
      case "MODULES_COMPLETED": {
        const threshold = dto.threshold;
        if (!threshold || threshold < 1) {
          throw new BadRequestException(
            "Say how many modules must be finished",
          );
        }
        if (dto.requiredProgrammeCode) {
          const target = await this.prisma.programme.findUnique({
            where: { code: dto.requiredProgrammeCode },
            select: { id: true },
          });
          if (!target)
            throw new BadRequestException(
              `No track with code ${dto.requiredProgrammeCode}`,
            );
        }
        break;
      }
      case "MANUAL_GRANT":
        break;
      default:
        throw new BadRequestException(`Unknown rule type ${type}`);
    }
  }

  /**
   * Walks the credential requirements forward from the track being required.
   * Without this, two tracks can be made to require each other's credential
   * and neither is ever enterable again.
   *
   * Inactive rules count. A rule that is switched off is one switch away from
   * being on, so ignoring them lets a cycle be assembled in three legal steps
   * -- switch A's rule off, add the opposite rule on B, switch A's back on --
   * with only the last one refused, by which point the data is already wrong.
   */
  private async assertNoCycle(
    programmeId: string,
    requiredCode: string,
  ): Promise<void> {
    const origin = await this.prisma.programme.findUnique({
      where: { id: programmeId },
      select: { code: true },
    });
    if (!origin) return;

    const loops = await reachesOrigin(
      origin.code,
      requiredCode,
      async (codes) => {
        const nodes = await this.prisma.programme.findMany({
          where: { code: { in: [...codes] } },
          select: {
            code: true,
            unlockRules: {
              where: { type: "CREDENTIAL_HELD" },
              select: { requiredProgrammeCode: true },
            },
          },
        });
        return nodes.map((node) => ({
          code: node.code,
          requires: node.unlockRules
            .map((rule) => rule.requiredProgrammeCode)
            .filter((code): code is string => code !== null),
        }));
      },
    );

    if (loops) {
      throw new BadRequestException(
        "That would make two tracks require each other, and neither could be entered",
      );
    }
  }
}
