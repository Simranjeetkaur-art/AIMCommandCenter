import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";
import type {
  ArchiveCohortDto,
  AssignCohortDto,
  AssignInstructorDto,
  CreateCohortDto,
  EnrollDto,
  UpdateCohortDto,
  WithdrawDto,
} from "./cohorts.dto";

@Injectable()
export class CohortsService {
  constructor(private readonly prisma: PrismaService) {}

  list(includeArchived = false) {
    return this.prisma.cohort.findMany({
      where: includeArchived ? {} : { archivedAt: null },
      include: {
        programmeVersion: {
          include: { programme: { select: { code: true, title: true } } },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: { startsAt: "desc" },
    });
  }

  async detail(cohortId: string) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: {
        programmeVersion: { include: { programme: true } },
        enrollments: {
          include: {
            user: {
              select: { id: true, name: true, email: true, status: true },
            },
          },
          orderBy: { enrolledAt: "asc" },
        },
        assignments: {
          include: {
            instructor: { select: { id: true, name: true } },
            learner: { select: { id: true, name: true } },
          },
        },
      },
    });
    if (!cohort) throw new NotFoundException("Cohort not found");

    /**
     * Candidates held by another cohort of this same course.
     *
     * The enrolment screen has to say *which* cohort, not merely that
     * somebody cannot be added, and this is the narrowest question that
     * answers it: one course, live enrolments, this cohort excluded. It
     * deliberately does not return other courses' rolls, which are nothing to
     * do with the screen asking.
     */
    const clashes = await this.prisma.enrollment.findMany({
      where: {
        status: "ACTIVE",
        cohortId: { not: cohortId },
        cohort: {
          programmeVersion: {
            programmeId: cohort.programmeVersion.programmeId,
          },
        },
      },
      select: { userId: true, cohort: { select: { code: true } } },
    });

    return {
      ...cohort,
      clashes: clashes.map((c) => ({
        userId: c.userId,
        cohortCode: c.cohort.code,
      })),
    };
  }

  async create(dto: CreateCohortDto) {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: dto.programmeVersionId },
      select: { status: true },
    });
    if (!version) throw new NotFoundException("Programme version not found");
    // Enrolling a cohort onto a draft would mean the requirements could still
    // change underneath the people being measured by them.
    if (version.status !== "PUBLISHED") {
      throw new BadRequestException(
        "A cohort can only run a published programme version",
      );
    }

    return this.prisma.cohort.create({
      data: {
        code: dto.code.toUpperCase(),
        title: dto.title,
        programmeVersionId: dto.programmeVersionId,
        startsAt: new Date(dto.startsAt),
        endsAt: dto.endsAt ? new Date(dto.endsAt) : null,
      },
    });
  }

  async update(cohortId: string, dto: UpdateCohortDto) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
    });
    if (!cohort) throw new NotFoundException("Cohort not found");
    if (cohort.archivedAt) {
      throw new BadRequestException("Restore this cohort before editing it");
    }

    return this.prisma.cohort.update({
      where: { id: cohortId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.startsAt !== undefined
          ? { startsAt: new Date(dto.startsAt) }
          : {}),
        ...(dto.endsAt !== undefined
          ? { endsAt: dto.endsAt ? new Date(dto.endsAt) : null }
          : {}),
      },
    });
  }

  async setArchived(cohortId: string, dto: ArchiveCohortDto) {
    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      include: { _count: { select: { enrollments: true } } },
    });
    if (!cohort) throw new NotFoundException("Cohort not found");

    const archiving = dto.action === "ARCHIVE";
    if (archiving && cohort.archivedAt)
      throw new BadRequestException("Already archived");
    if (!archiving && !cohort.archivedAt)
      throw new BadRequestException("Not archived");

    if (archiving) {
      const active = await this.prisma.enrollment.count({
        where: { cohortId, status: "ACTIVE" },
      });
      // Closing a cohort with people still on it would strand them mid-course
      // with no record of why their training stopped.
      if (active > 0) {
        throw new BadRequestException(
          `${active} learner(s) are still active on this cohort. Withdraw or complete them first.`,
        );
      }
    }

    return this.prisma.cohort.update({
      where: { id: cohortId },
      data: archiving
        ? { archivedAt: new Date(), archivedReason: dto.reason }
        : { archivedAt: null, archivedReason: null },
    });
  }

  async enroll(cohortId: string, dto: EnrollDto) {
    await this.assertEnrollable(cohortId, dto.userId);

    // The unique constraint on (cohortId, userId) is the real guard here; this
    // is only the friendlier error.
    return this.prisma.enrollment.create({
      data: { cohortId, userId: dto.userId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  /**
   * Several candidates in one act.
   *
   * Each is checked and placed on its own rather than in a single
   * transaction: placing nine people should not be undone because the tenth
   * turned out to be on another cohort of the same course. The refusals come
   * back named, so the screen can say which ones did not go and why.
   */
  async enrollMany(cohortId: string, userIds: readonly string[]) {
    const enrolled: Array<{ id: string; name: string }> = [];
    const refused: Array<{ userId: string; name: string; reason: string }> = [];

    for (const userId of [...new Set(userIds)]) {
      try {
        const row = await this.enroll(cohortId, { userId });
        enrolled.push({ id: row.user.id, name: row.user.name });
      } catch (error) {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: { name: true },
        });
        refused.push({
          userId,
          name: user?.name ?? "Unknown",
          reason:
            error instanceof Error ? error.message : "Could not be enrolled",
        });
      }
    }

    return { enrolled, refused };
  }

  /**
   * Everything that has to be true before somebody joins a cohort.
   *
   * The rule worth naming is the last one: a candidate sits one cohort of a
   * course at a time. Two live enrolments on the same course would give them
   * two sets of attempts against the same papers, two progress records and
   * two routes to one credential -- and the credential is unique per version,
   * so the second would fail at the end rather than at the start. Refusing
   * here is the difference between a rule and a surprise.
   */
  private async assertEnrollable(cohortId: string, userId: string) {
    const [learner, cohort] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { role: true, status: true, archivedAt: true },
      }),
      this.prisma.cohort.findUnique({
        where: { id: cohortId },
        select: {
          id: true,
          archivedAt: true,
          programmeVersion: {
            select: {
              programme: { select: { id: true, code: true, title: true } },
            },
          },
        },
      }),
    ]);

    if (!learner) throw new NotFoundException("User not found");
    if (!cohort) throw new NotFoundException("Cohort not found");
    if (cohort.archivedAt) {
      throw new BadRequestException("That cohort has been archived");
    }
    if (learner.role !== "STUDENT") {
      throw new BadRequestException(
        "Only a student can be enrolled in a cohort",
      );
    }
    if (learner.status !== "ACTIVE" || learner.archivedAt) {
      throw new BadRequestException("A suspended account cannot be enrolled");
    }

    const clash = await this.prisma.enrollment.findFirst({
      where: {
        userId,
        status: "ACTIVE",
        cohortId: { not: cohortId },
        cohort: {
          programmeVersion: {
            programmeId: cohort.programmeVersion.programme.id,
          },
        },
      },
      select: { cohort: { select: { code: true, title: true } } },
    });
    if (clash) {
      throw new BadRequestException(
        `Already on ${clash.cohort.code} for ${cohort.programmeVersion.programme.code}. A candidate sits one cohort of a course at a time — withdraw them from ${clash.cohort.code} first.`,
      );
    }
  }

  /**
   * A candidate putting themselves on a course.
   *
   * Only where the course says they may, and only onto a cohort that is
   * actually running. Every other rule an administrator's placement obeys
   * applies here too, which is why this goes through the same check rather
   * than writing the enrolment itself.
   */
  async selfEnrol(actor: { id: string; role: string }, cohortId: string) {
    if (actor.role !== "STUDENT") {
      throw new BadRequestException(
        "Only a candidate enrols themselves. Staff place candidates from the cohort screen.",
      );
    }

    const cohort = await this.prisma.cohort.findUnique({
      where: { id: cohortId },
      select: {
        id: true,
        programmeVersion: {
          select: {
            status: true,
            programme: {
              select: { code: true, title: true, selfEnrol: true, status: true },
            },
          },
        },
      },
    });
    if (!cohort) throw new NotFoundException("Cohort not found");

    const programme = cohort.programmeVersion.programme;
    if (!programme.selfEnrol) {
      throw new ForbiddenException(
        `${programme.code} is not open for self-enrolment. An administrator or manager places candidates on it.`,
      );
    }
    if (cohort.programmeVersion.status !== "PUBLISHED") {
      throw new BadRequestException("That cohort is not running yet");
    }

    await this.assertEnrollable(cohortId, actor.id);
    return this.prisma.enrollment.create({
      data: { cohortId, userId: actor.id },
      include: {
        cohort: {
          select: {
            code: true,
            title: true,
            programmeVersion: {
              select: { programme: { select: { code: true, title: true } } },
            },
          },
        },
      },
    });
  }

  /**
   * The courses a candidate may join unaided, and the cohort each would put
   * them on. Empty is the normal answer: self-enrolment is off by default.
   */
  async openToSelfEnrol(userId: string) {
    const cohorts = await this.prisma.cohort.findMany({
      where: {
        archivedAt: null,
        programmeVersion: {
          status: "PUBLISHED",
          programme: { selfEnrol: true, status: "ACTIVE", visible: true },
        },
      },
      orderBy: [{ startsAt: "desc" }],
      select: {
        id: true,
        code: true,
        title: true,
        startsAt: true,
        programmeVersion: {
          select: {
            version: true,
            programme: {
              select: { id: true, code: true, title: true, summary: true, level: true },
            },
          },
        },
      },
    });

    const mine = await this.prisma.enrollment.findMany({
      where: { userId, status: "ACTIVE" },
      select: {
        cohort: {
          select: {
            programmeVersion: { select: { programmeId: true } },
          },
        },
      },
    });
    const already = new Set(
      mine.map((e) => e.cohort.programmeVersion.programmeId),
    );

    // One cohort per course on offer -- the most recent intake. Offering three
    // intakes of one course to somebody who may join exactly one of them is a
    // choice with no meaning behind it.
    const seen = new Set<string>();
    return cohorts
      .filter((c) => {
        const id = c.programmeVersion.programme.id;
        if (already.has(id) || seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map((c) => ({
        cohortId: c.id,
        cohortCode: c.code,
        cohortTitle: c.title,
        startsAt: c.startsAt,
        version: c.programmeVersion.version,
        programme: c.programmeVersion.programme,
      }));
  }

  async withdraw(cohortId: string, dto: WithdrawDto) {
    const enrollment = await this.prisma.enrollment.findUnique({
      where: { cohortId_userId: { cohortId, userId: dto.userId } },
    });
    if (!enrollment) throw new NotFoundException("Enrollment not found");

    // Withdrawal is a status change, never a delete. The learner's attempts,
    // submissions and reviews remain attached to the record.
    return this.prisma.enrollment.update({
      where: { id: enrollment.id },
      data: { status: "WITHDRAWN", withdrawnAt: new Date() },
    });
  }

  async assignInstructor(actor: Actor, dto: AssignInstructorDto) {
    const [instructor, learner] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.instructorId },
        select: { role: true },
      }),
      this.prisma.user.findUnique({
        where: { id: dto.learnerId },
        select: { role: true },
      }),
    ]);

    if (instructor?.role !== "INSTRUCTOR") {
      throw new BadRequestException("That user is not an instructor");
    }
    if (learner?.role !== "STUDENT") {
      throw new BadRequestException("That user is not a student");
    }

    return this.prisma.instructorAssignment.upsert({
      where: {
        instructorId_learnerId: {
          instructorId: dto.instructorId,
          learnerId: dto.learnerId,
        },
      },
      create: {
        instructorId: dto.instructorId,
        learnerId: dto.learnerId,
        cohortId: dto.cohortId ?? null,
        assignedById: actor.id,
      },
      update: { cohortId: dto.cohortId ?? null, assignedById: actor.id },
    });
  }

  /** Assigns one instructor to every active learner in a cohort. */
  async assignCohort(actor: Actor, cohortId: string, dto: AssignCohortDto) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { cohortId, status: "ACTIVE" },
      select: { userId: true },
    });

    const results = await this.prisma.$transaction(
      enrollments.map((e) =>
        this.prisma.instructorAssignment.upsert({
          where: {
            instructorId_learnerId: {
              instructorId: dto.instructorId,
              learnerId: e.userId,
            },
          },
          create: {
            instructorId: dto.instructorId,
            learnerId: e.userId,
            cohortId,
            assignedById: actor.id,
          },
          update: { cohortId, assignedById: actor.id },
        }),
      ),
    );

    return {
      assigned: results.length,
      cohortId,
      instructorId: dto.instructorId,
    };
  }

  async unassign(instructorId: string, learnerId: string) {
    await this.prisma.instructorAssignment.deleteMany({
      where: { instructorId, learnerId },
    });
    return { instructorId, learnerId, assigned: false };
  }
}
