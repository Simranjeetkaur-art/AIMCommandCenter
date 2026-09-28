import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";

/**
 * The requirements of an AIM certification, in the order the programme states
 * them, and which of them actually decide the credential.
 *
 * Three of these are `optional`. They are real work and they are shown, but
 * they do not gate the certificate: the simulator is practice for the graded
 * papers, and the examiner-marked practical and check ride are offered rather
 * than required. Saying so here, once, is what keeps this screen and the
 * gate that the final examination enforces telling the same story.
 *
 * Each row is computed from what the track actually defines, not from a fixed
 * list: a track with no practical assessment reports that requirement as not
 * part of it rather than as outstanding forever. A tracker that shows a step
 * nobody can clear is worse than one that admits the step is not there.
 */
const REQUIREMENTS = [
  {
    key: "modules",
    ordinal: 1,
    label: "Command modules",
    note: "Work through every lesson in the track.",
    optional: false,
  },
  {
    key: "quizzes",
    ordinal: 2,
    label: "Module quizzes",
    note: "Pass each module's quiz at its pass mark.",
    optional: false,
  },
  {
    key: "exam",
    ordinal: 3,
    label: "Final examination",
    note: "Opens once the modules and their quizzes are done. Passing it issues the certificate.",
    optional: false,
  },
  {
    key: "simulator",
    ordinal: 4,
    label: "Mission simulator — practice",
    note: "Practice for the graded papers. It is not counted towards the certificate.",
    optional: true,
  },
  {
    key: "practical",
    ordinal: 5,
    label: "Practical Dx/Rx assessment — optional",
    note: "Diagnose and prescribe controls for a complete agent case.",
    optional: true,
  },
  {
    key: "checkride",
    ordinal: 6,
    label: "Commander check ride — optional",
    note: "Demonstrate command under pressure before an examiner.",
    optional: true,
  },
] as const;

@Injectable()
export class CertificationService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Where the signed-in candidate stands on every track they are enrolled on.
   *
   * Read-only and self-scoped: it reports the same gates the issue path
   * evaluates, so a candidate is never told they are ready for something the
   * registrar's screen will refuse.
   */
  async standing(actor: Actor) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: actor.id },
      orderBy: { enrolledAt: "asc" },
      include: {
        cohort: {
          include: {
            programmeVersion: {
              include: {
                programme: {
                  select: { id: true, code: true, title: true, level: true },
                },
                modules: {
                  where: { visible: true },
                  include: { lessons: { select: { id: true } } },
                },
                assessments: {
                  select: {
                    id: true,
                    kind: true,
                    title: true,
                    passMark: true,
                    moduleId: true,
                    code: true,
                    finalExam: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    const tracks = [];
    for (const enrollment of enrollments) {
      tracks.push(await this.forVersion(actor.id, enrollment));
    }

    return {
      candidate: { id: actor.id, name: actor.name },
      tracks,
    };
  }

  private async forVersion(
    userId: string,
    enrollment: {
      status: string;
      enrolledAt: Date;
      cohort: {
        code: string;
        title: string;
        programmeVersion: {
          id: string;
          version: number;
          programme: {
            id: string;
            code: string;
            title: string;
            level: number;
          };
          modules: Array<{ lessons: Array<{ id: string }> }>;
          assessments: Array<{
            id: string;
            kind: string;
            title: string;
            passMark: number;
            moduleId: string | null;
            code: string;
            finalExam: boolean;
          }>;
        };
      };
    },
  ) {
    const version = enrollment.cohort.programmeVersion;
    const lessonIds = version.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );

    const byKind = (kind: string) =>
      version.assessments.filter((a) => a.kind === kind);

    const [
      lessonsDone,
      passedAttempts,
      approvedSubmissions,
      credential,
      badges,
    ] = await Promise.all([
      this.prisma.lessonProgress.count({
        where: { userId, lessonId: { in: lessonIds }, status: "COMPLETED" },
      }),
      this.prisma.attempt.findMany({
        where: {
          userId,
          passed: true,
          assessmentId: { in: version.assessments.map((a) => a.id) },
        },
        select: { assessmentId: true },
      }),
      this.prisma.submission.findMany({
        where: {
          userId,
          status: "APPROVED",
          assessmentId: { in: version.assessments.map((a) => a.id) },
        },
        select: { assessmentId: true },
      }),
      this.prisma.credential.findFirst({
        where: { userId, programmeVersionId: version.id },
        select: {
          id: true,
          serial: true,
          status: true,
          issuedAt: true,
        },
      }),
      this.prisma.badgeAward.findMany({
        where: {
          userId,
          badge: { programmeCode: version.programme.code },
        },
        include: {
          badge: {
            select: {
              id: true,
              code: true,
              title: true,
              iconSvg: true,
              iconText: true,
              tone: true,
            },
          },
        },
        orderBy: { awardedAt: "asc" },
      }),
    ]);

    // An assessment is cleared either by a passing attempt (machine-marked) or
    // by an approved submission (examiner-marked). Which one applies is a
    // property of the assessment, so both count and neither is assumed.
    const cleared = new Set([
      ...passedAttempts.map((a) => a.assessmentId),
      ...approvedSubmissions.map((s) => s.assessmentId),
    ]);

    const clearedOf = (kind: string) => {
      const items = byKind(kind);
      const done = items.filter((a) => cleared.has(a.id)).length;
      return { total: items.length, done };
    };

    // The module quizzes and the final examination are different papers and
    // are counted as such. Lumping every QUIZ together read "0 of 11 cleared"
    // against the final exam, which named the wrong requirement and made the
    // one paper that issues the certificate impossible to see.
    const moduleQuizzes = version.assessments.filter(
      (a) =>
        a.kind === "QUIZ" &&
        !a.finalExam &&
        (a.moduleId !== null || a.code.endsWith("-ASSESS")),
    );
    const finalExams = version.assessments.filter(
      (a) =>
        a.finalExam ||
        (a.kind === "QUIZ" &&
          a.moduleId === null &&
          !a.code.endsWith("-ASSESS")),
    );
    const countOf = (items: Array<{ id: string }>) => ({
      total: items.length,
      done: items.filter((a) => cleared.has(a.id)).length,
    });

    const requirements = REQUIREMENTS.map((requirement) => {
      if (requirement.key === "modules") {
        return {
          ...requirement,
          tracked: lessonIds.length > 0,
          met: lessonIds.length > 0 && lessonsDone === lessonIds.length,
          detail: `${lessonsDone} of ${lessonIds.length} lessons completed`,
        };
      }

      const counts =
        requirement.key === "quizzes"
          ? countOf(moduleQuizzes)
          : requirement.key === "exam"
            ? countOf(finalExams)
            : requirement.key === "simulator"
              ? clearedOf("SIMULATION")
              : requirement.key === "practical"
                ? clearedOf("PRACTICAL")
                : {
                    total:
                      clearedOf("CAPSTONE").total + clearedOf("DEFENCE").total,
                    done:
                      clearedOf("CAPSTONE").done + clearedOf("DEFENCE").done,
                  };

      return {
        ...requirement,
        tracked: counts.total > 0,
        met: counts.total > 0 && counts.done === counts.total,
        detail:
          counts.total === 0
            ? "Not part of this track"
            : requirement.key === "quizzes"
              ? `${counts.done} of ${counts.total} passed`
              : `${counts.done} of ${counts.total} cleared`,
      };
    });

    // The score counts what the certificate actually turns on. Practice and
    // the optional extras are reported beside it, never inside it.
    const trackedRequirements = requirements.filter(
      (r) => r.tracked && !r.optional,
    );

    return {
      programme: version.programme,
      versionId: version.id,
      version: version.version,
      cohort: { code: enrollment.cohort.code, title: enrollment.cohort.title },
      enrollmentStatus: enrollment.status,
      enrolledAt: enrollment.enrolledAt,
      requirements,
      // Counted over what this track actually measures, so a track with four
      // requirements does not sit permanently at four fifths.
      metCount: trackedRequirements.filter((r) => r.met).length,
      trackedCount: trackedRequirements.length,
      credential,
      badges: badges.map((award) => ({
        ...award.badge,
        awardedAt: award.awardedAt,
      })),
    };
  }
}
