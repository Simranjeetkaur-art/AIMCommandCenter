import { Injectable, NotFoundException } from "@nestjs/common";
import { drawSize } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import { FinalExamService } from "../assessments/final-exam.service";
import type { Actor } from "../../common/auth/actor";

/** One paper, as it appears in a row of marks. */
export interface Mark {
  id: string;
  code: string;
  title: string;
  kind: string;
  /** QUIZ papers that close a module, the final examination, or practice. */
  role: "MODULE_QUIZ" | "FINAL_EXAM" | "PRACTICE" | "OTHER";
  module: { title: string; position: number } | null;
  itemsPerAttempt: number;
  submissionStatus: string | null;
  passMark: number;
  maxAttempts: number;
  attemptsUsed: number;
  bestScore: number | null;
  passed: boolean | null;
  lastSatAt: Date | null;
  /** Practice does not count towards the certificate. */
  counts: boolean;
}

/**
 * The gradebook.
 *
 * One computation of "how is this candidate doing on this track", used by the
 * candidate's own screen and by the staff screens alike, so a learner and a
 * manager reading the same row never see two different numbers.
 *
 * What counts is stated rather than implied. The certificate is earned by
 * completing every lesson, passing every module quiz, and passing the final
 * examination; the simulator is practice and is reported as practice, so a
 * strong simulator score never looks like progress towards certification and
 * a weak one never looks like a failure that blocks it.
 */
@Injectable()
export class GradebookService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly finalExam: FinalExamService,
  ) {}

  /** The signed-in candidate's own gradebook, one card per enrolled track. */
  async mine(actor: Actor) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId: actor.id, status: "ACTIVE" },
      select: { cohort: { select: { programmeVersionId: true } } },
    });

    const cards = await Promise.all(
      enrollments.map((e) =>
        this.forLearner(actor.id, e.cohort.programmeVersionId),
      ),
    );
    return { tracks: cards };
  }

  /**
   * Every learner this actor may see, on one track, as a table.
   *
   * Scoped by `AccessScopeService`: an administrator or manager holding
   * progress.read.all sees the cohort; an examiner sees the learners assigned
   * to them and nobody else.
   */
  async forVersion(actor: Actor, programmeVersionId: string) {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: programmeVersionId },
      select: {
        id: true,
        version: true,
        programme: { select: { id: true, code: true, title: true } },
      },
    });
    if (!version) throw new NotFoundException("Programme version not found");

    const visible = await this.scope.visibleLearnerIds(actor);
    const enrollments = await this.prisma.enrollment.findMany({
      where: {
        status: "ACTIVE",
        cohort: { programmeVersionId },
        ...(visible === null ? {} : { userId: { in: visible } }),
      },
      select: {
        user: { select: { id: true, name: true, email: true } },
        cohort: { select: { id: true, code: true, title: true } },
      },
      orderBy: { user: { name: "asc" } },
    });

    const rows = await Promise.all(
      enrollments.map(async (e) => ({
        ...(await this.forLearner(e.user.id, programmeVersionId)),
        learner: e.user,
        cohort: e.cohort,
      })),
    );

    return {
      version: {
        id: version.id,
        number: version.version,
        programme: version.programme,
      },
      rows,
    };
  }

  /** Which tracks a staff screen can open a gradebook for. */
  async tracks(actor: Actor) {
    const visible = await this.scope.visibleLearnerIds(actor);
    const versions = await this.prisma.programmeVersion.findMany({
      where: {
        status: "PUBLISHED",
        cohorts: {
          some: {
            archivedAt: null,
            enrollments: {
              some: {
                status: "ACTIVE",
                ...(visible === null ? {} : { userId: { in: visible } }),
              },
            },
          },
        },
      },
      orderBy: [{ programme: { level: "asc" } }, { version: "desc" }],
      select: {
        id: true,
        version: true,
        programme: {
          select: { id: true, code: true, title: true, level: true },
        },
        cohorts: {
          where: { archivedAt: null },
          select: {
            _count: {
              select: {
                enrollments: {
                  where: {
                    status: "ACTIVE",
                    ...(visible === null ? {} : { userId: { in: visible } }),
                  },
                },
              },
            },
          },
        },
      },
    });

    return versions.map((v) => ({
      id: v.id,
      number: v.version,
      programme: v.programme,
      learners: v.cohorts.reduce((n, c) => n + c._count.enrollments, 0),
    }));
  }

  /** One learner on one track: lessons, every mark, and where they stand. */
  private async forLearner(userId: string, programmeVersionId: string) {
    const [version, lessons, assessments, credential, readiness] =
      await Promise.all([
        this.prisma.programmeVersion.findUniqueOrThrow({
          where: { id: programmeVersionId },
          select: {
            id: true,
            version: true,
            programme: {
              select: { id: true, code: true, title: true, level: true },
            },
          },
        }),
        this.prisma.lesson.findMany({
          where: {
            visible: true,
            module: { programmeVersionId, visible: true },
          },
          select: {
            id: true,
            progress: {
              where: { userId, status: "COMPLETED" },
              select: { id: true },
            },
          },
        }),
        this.prisma.assessment.findMany({
          where: { programmeVersionId, visible: true },
          orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
          select: {
            id: true,
            code: true,
            title: true,
            kind: true,
            passMark: true,
            maxAttempts: true,
            drawCount: true,
            moduleId: true,
            finalExam: true,
            module: { select: { title: true, position: true } },
            _count: { select: { questions: true } },
            attempts: {
              where: { userId, submittedAt: { not: null } },
              orderBy: { submittedAt: "desc" },
              select: { score: true, passed: true, submittedAt: true },
            },
            submissions: {
              where: { userId },
              orderBy: { submittedAt: "desc" },
              take: 1,
              select: { status: true, submittedAt: true },
            },
          },
        }),
        this.prisma.credential.findUnique({
          where: {
            userId_programmeVersionId: { userId, programmeVersionId },
          },
          select: {
            id: true,
            serial: true,
            status: true,
            issuedAt: true,
            examScore: true,
          },
        }),
        this.finalExam.readiness(userId, programmeVersionId),
      ]);

    const marks: Mark[] = assessments.map((a) => {
      const role: Mark["role"] = a.finalExam
        ? "FINAL_EXAM"
        : a.kind === "SIMULATION"
          ? "PRACTICE"
          : a.moduleId || a.code.endsWith("-ASSESS")
            ? "MODULE_QUIZ"
            : "OTHER";

      return {
        id: a.id,
        code: a.code,
        title: a.title,
        kind: a.kind,
        role,
        module: a.module
          ? { title: a.module.title, position: a.module.position }
          : null,
        passMark: a.passMark,
        maxAttempts: a.maxAttempts,
        itemsPerAttempt: drawSize(a._count.questions, a.drawCount),
        attemptsUsed: a.attempts.length,
        bestScore: a.attempts.reduce<number | null>(
          (best, x) =>
            x.score !== null && (best === null || x.score > best)
              ? x.score
              : best,
          null,
        ),
        passed: a.attempts.some((x) => x.passed === true)
          ? true
          : a.attempts.length > 0
            ? false
            : null,
        lastSatAt: a.attempts[0]?.submittedAt ?? null,
        submissionStatus: a.submissions[0]?.status ?? null,
        // Practice never counts, and neither does anything an examiner marks:
        // the certificate turns on the module quizzes and the final paper.
        counts: role === "MODULE_QUIZ" || role === "FINAL_EXAM",
      };
    });

    const counting = marks.filter((m) => m.counts && m.bestScore !== null);
    const quizzes = marks.filter((m) => m.role === "MODULE_QUIZ");
    const finalMark = marks.find((m) => m.role === "FINAL_EXAM") ?? null;
    const lessonsDone = lessons.filter((l) => l.progress.length > 0).length;

    return {
      version: {
        id: version.id,
        number: version.version,
        programme: version.programme,
      },
      lessons: { done: lessonsDone, total: lessons.length },
      quizzes: {
        passed: quizzes.filter((q) => q.passed === true).length,
        total: quizzes.length,
      },
      /**
       * The average of every graded paper that counts, which is what a
       * gradebook usually means by "the grade". Null until one has been sat --
       * never 0, because "has not sat it" and "scored nothing" are different
       * facts and only one of them is a mark.
       */
      average:
        counting.length === 0
          ? null
          : Math.round(
              counting.reduce((n, m) => n + (m.bestScore ?? 0), 0) /
                counting.length,
            ),
      finalExam: finalMark,
      finalExamOpen: readiness.ready,
      blocking: readiness.missing,
      credential,
      standing: credential
        ? credential.status === "ISSUED"
          ? "CERTIFIED"
          : credential.status
        : finalMark?.passed === true
          ? "AWAITING_CERTIFICATE"
          : readiness.ready
            ? "EXAM_OPEN"
            : "IN_PROGRESS",
      marks,
    };
  }
}
