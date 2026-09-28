import { ForbiddenException, Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";

export interface FinalExamReadiness {
  ready: boolean;
  lessons: { done: number; total: number };
  quizzes: Array<{
    id: string;
    code: string;
    title: string;
    module: string;
    passMark: number;
    passed: boolean;
    bestScore: number | null;
  }>;
  /** Plain sentences, for the locked screen and the refusal alike. */
  missing: string[];
}

/**
 * Whether a candidate may sit a track's final examination.
 *
 * Two conditions, both over what a candidate can actually see -- a hidden
 * module or lesson is not a requirement they could ever meet:
 *
 *  1. every lesson in every module is marked complete, and
 *  2. every module quiz is passed at the pass mark its author set.
 *
 * One computation, used by the gate that refuses the attempt and by the
 * screens that explain why it is locked, so the two cannot disagree.
 */
@Injectable()
export class FinalExamService {
  constructor(private readonly prisma: PrismaService) {}

  async readiness(
    userId: string,
    programmeVersionId: string,
  ): Promise<FinalExamReadiness> {
    const [lessons, quizzes] = await Promise.all([
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
        where: {
          programmeVersionId,
          kind: "QUIZ",
          finalExam: false,
          visible: true,
          module: { visible: true },
        },
        orderBy: [{ module: { position: "asc" } }, { position: "asc" }],
        select: {
          id: true,
          code: true,
          title: true,
          passMark: true,
          module: { select: { title: true } },
          attempts: {
            where: { userId, submittedAt: { not: null } },
            select: { score: true, passed: true },
          },
        },
      }),
    ]);

    const done = lessons.filter((l) => l.progress.length > 0).length;
    const quizState = quizzes.map((q) => ({
      id: q.id,
      code: q.code,
      title: q.title,
      module: q.module?.title ?? "",
      passMark: q.passMark,
      passed: q.attempts.some((a) => a.passed === true),
      bestScore: q.attempts.reduce<number | null>(
        (best, a) =>
          a.score !== null && (best === null || a.score > best) ? a.score : best,
        null,
      ),
    }));

    const missing: string[] = [];
    if (done < lessons.length) {
      missing.push(
        `Complete every lesson: ${done} of ${lessons.length} done.`,
      );
    }
    const unpassed = quizState.filter((q) => !q.passed);
    if (unpassed.length > 0) {
      missing.push(
        `Pass every module quiz: ${quizState.length - unpassed.length} of ${quizState.length} passed.`,
      );
    }

    return {
      ready: missing.length === 0,
      lessons: { done, total: lessons.length },
      quizzes: quizState,
      missing,
    };
  }

  async assertReady(userId: string, programmeVersionId: string) {
    const state = await this.readiness(userId, programmeVersionId);
    if (!state.ready) {
      throw new ForbiddenException(
        `The final examination is locked. ${state.missing.join(" ")}`,
      );
    }
  }
}
