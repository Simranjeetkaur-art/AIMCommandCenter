import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { poolForKind } from "@aim/contracts";
import { assertPoolFits } from "./academy.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";
import type {
  CreateQuestionBankDto,
  UpdateQuestionBankDto,
  QuestionBankQuery,
  AttachQuestionsDto,
} from "./academy.dto";

/**
 * Where questions live before an assessment asks for them.
 *
 * A bank used to be a free-floating list with a title, which made "the
 * questions for module 3 of AIM-CP" something you found by reading titles. A
 * bank now knows which track and module it belongs to and carries tags, so the
 * assessment builder can offer the right ones instead of all of them.
 *
 * Both of those are optional on purpose: a bank shared across tracks is a
 * legitimate thing to want, and forcing it into one module would mean copying
 * questions to reuse them.
 */
@Injectable()
export class QuestionBanksService {
  constructor(private readonly prisma: PrismaService) {}

  /** Nobody without this reads an answer key, whatever route they came in by. */
  private canSeeKeys(actor: Actor): boolean {
    return (actor.permissions as readonly string[]).includes(P.ANSWER_KEY_READ);
  }

  async list(query: QuestionBankQuery) {
    const tag = query.tag?.trim();

    const banks = await this.prisma.questionBank.findMany({
      where: {
        ...(query.programmeId ? { programmeId: query.programmeId } : {}),
        ...(query.moduleId ? { moduleId: query.moduleId } : {}),
        ...(query.search
          ? { title: { contains: query.search, mode: "insensitive" as const } }
          : {}),
      },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        _count: { select: { questions: true } },
        owner: { select: { name: true } },
        programme: { select: { code: true, title: true } },
        module: { select: { id: true, title: true, position: true } },
      },
    });

    // Tag filtering in memory: the tag list is a JSON array, and a handful of
    // banks is not worth a GIN index and a raw query.
    const filtered = tag
      ? banks.filter((bank) =>
          (bank.tags as string[]).some(
            (t) => t.toLowerCase() === tag.toLowerCase(),
          ),
        )
      : banks;

    return {
      banks: filtered,
      /** Every tag in use, so the interface can offer them rather than ask. */
      tags: [...new Set(banks.flatMap((b) => b.tags as string[]))].sort(),
    };
  }

  async detail(actor: Actor, bankId: string) {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: bankId },
      include: {
        owner: { select: { name: true } },
        programme: { select: { id: true, code: true, title: true } },
        module: { select: { id: true, title: true, position: true } },
        questions: {
          orderBy: { createdAt: "asc" },
          include: { _count: { select: { assessments: true } } },
        },
      },
    });
    if (!bank) throw new NotFoundException("Question bank not found");

    // Stripped here rather than trusted to the route, so a future caller that
    // reuses this method cannot leak a key by forgetting to.
    const questions = this.canSeeKeys(actor)
      ? bank.questions
      : bank.questions.map(({ answerKey: _omitted, ...rest }) => rest);

    return {
      ...bank,
      questions,
      tagsInUse: [
        ...new Set(bank.questions.flatMap((q) => q.tags as string[])),
      ].sort(),
    };
  }

  async create(actor: Actor, dto: CreateQuestionBankDto) {
    await this.assertTargets(dto.programmeId, dto.moduleId);

    return this.prisma.questionBank.create({
      data: {
        title: dto.title,
        description: dto.description ?? "",
        programmeId: dto.programmeId ?? null,
        moduleId: dto.moduleId ?? null,
        tags: this.cleanTags(dto.tags),
        ownerId: actor.id,
      },
    });
  }

  async update(bankId: string, dto: UpdateQuestionBankDto) {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: bankId },
    });
    if (!bank) throw new NotFoundException("Question bank not found");

    await this.assertTargets(
      dto.programmeId === undefined
        ? (bank.programmeId ?? undefined)
        : dto.programmeId,
      dto.moduleId === undefined ? (bank.moduleId ?? undefined) : dto.moduleId,
    );

    return this.prisma.questionBank.update({
      where: { id: bankId },
      data: {
        ...(dto.title !== undefined ? { title: dto.title } : {}),
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        ...(dto.programmeId !== undefined
          ? { programmeId: dto.programmeId || null }
          : {}),
        ...(dto.moduleId !== undefined
          ? { moduleId: dto.moduleId || null }
          : {}),
        ...(dto.tags !== undefined ? { tags: this.cleanTags(dto.tags) } : {}),
      },
    });
  }

  /**
   * Deleting a bank would cascade its questions away, and a question that has
   * been sat is part of somebody's record. So a bank whose questions are on an
   * assessment refuses, and says which.
   */
  async remove(bankId: string) {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: bankId },
      include: {
        questions: {
          select: { id: true, _count: { select: { assessments: true } } },
        },
      },
    });
    if (!bank) throw new NotFoundException("Question bank not found");

    const onPapers = bank.questions.filter(
      (q) => q._count.assessments > 0,
    ).length;
    if (onPapers > 0) {
      throw new BadRequestException(
        `${onPapers} question(s) in this bank are on an assessment. Detach them first.`,
      );
    }

    await this.prisma.questionBank.delete({ where: { id: bankId } });
    return { deleted: true, questions: bank.questions.length };
  }

  /**
   * Puts a chosen set of questions onto an assessment in one act.
   *
   * The builder's whole point is picking questions out of a bank, and doing
   * that one request at a time makes a twenty-question paper twenty chances to
   * half-finish.
   */
  async attachToAssessment(assessmentId: string, dto: AttachQuestionsDto) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        kind: true,
        programmeVersionId: true,
        _count: { select: { attempts: true, submissions: true } },
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    const sat = assessment._count.attempts + assessment._count.submissions;
    if (sat > 0) {
      throw new BadRequestException(
        `${sat} attempt(s) exist against this assessment. Changing its questions would change what those people were measured on.`,
      );
    }

    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: assessment.programmeVersionId },
      select: { status: true },
    });
    if (version?.status !== "DRAFT") {
      throw new BadRequestException(
        "A published version cannot be edited. Create a new version.",
      );
    }

    const found = await this.prisma.question.findMany({
      where: { id: { in: dto.questionIds } },
      select: { id: true, pool: true },
    });
    if (found.length !== dto.questionIds.length) {
      throw new BadRequestException(
        "One or more of those questions no longer exists",
      );
    }
    assertPoolFits(
      assessment.kind,
      found.map((q) => q.pool),
    );

    // Replace rather than append: the caller sends the paper it wants, which
    // makes removing a question the same act as adding one.
    await this.prisma.$transaction([
      this.prisma.assessmentQuestion.deleteMany({ where: { assessmentId } }),
      this.prisma.assessmentQuestion.createMany({
        data: dto.questionIds.map((questionId, index) => ({
          assessmentId,
          questionId,
          position: index,
        })),
      }),
    ]);

    return { assessmentId, questions: dto.questionIds.length };
  }

  /**
   * One assessment, as the builder needs it: where it sits, what is on it, and
   * which banks could supply more.
   */
  async assessmentForBuilder(actor: Actor, assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      include: {
        module: { select: { id: true, title: true, position: true } },
        programmeVersion: {
          select: {
            id: true,
            version: true,
            status: true,
            programme: { select: { id: true, code: true, title: true } },
            modules: {
              orderBy: { position: "asc" },
              select: { id: true, title: true, position: true },
            },
          },
        },
        questions: {
          orderBy: { position: "asc" },
          include: {
            question: {
              select: { id: true, stem: true, points: true, tags: true },
            },
          },
        },
        _count: { select: { attempts: true, submissions: true } },
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    const programmeId = assessment.programmeVersion.programme.id;

    // Banks this paper could draw from: its own module's, the track's, and the
    // shared ones. Not every bank in the system, which is the whole point of
    // having placed them.
    const banks = await this.prisma.questionBank.findMany({
      where: {
        OR: [
          ...(assessment.moduleId ? [{ moduleId: assessment.moduleId }] : []),
          { programmeId, moduleId: null },
          { programmeId: null },
        ],
      },
      orderBy: [{ updatedAt: "desc" }],
      include: {
        module: { select: { id: true, title: true, position: true } },
        questions: {
          // Only the half of the bank this kind of paper may use, so the
          // picker cannot offer a simulator mission to a quiz or the reverse.
          where: { pool: poolForKind(assessment.kind) },
          orderBy: { createdAt: "asc" },
          select: {
            id: true,
            stem: true,
            points: true,
            tags: true,
            type: true,
          },
        },
      },
    });

    // The badge whose condition already points at this paper, if any.
    const badges = await this.prisma.badge.findMany({
      where: { active: true },
      orderBy: { position: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        criteria: true,
        programmeCode: true,
      },
    });
    const linkedBadge =
      badges.find((badge) => {
        const criteria = badge.criteria as {
          type?: string;
          assessmentCode?: string;
        };
        return (
          criteria?.type === "ASSESSMENT_PASSED" &&
          criteria.assessmentCode === assessment.code
        );
      }) ?? null;

    return {
      assessment: {
        ...assessment,
        sat: assessment._count.attempts + assessment._count.submissions,
      },
      banks: banks.map((bank) => ({
        id: bank.id,
        title: bank.title,
        tags: bank.tags,
        module: bank.module,
        questions: this.canSeeKeys(actor)
          ? bank.questions
          : bank.questions.map(({ ...rest }) => rest),
      })),
      badges,
      linkedBadgeId: linkedBadge?.id ?? null,
    };
  }

  private cleanTags(tags?: string[]): string[] {
    return [
      ...new Set(
        (tags ?? [])
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean)
          .slice(0, 20),
      ),
    ];
  }

  /** A bank pointed at a module of a different track is a bank nobody finds. */
  private async assertTargets(
    programmeId?: string,
    moduleId?: string,
  ): Promise<void> {
    if (programmeId) {
      const programme = await this.prisma.programme.findUnique({
        where: { id: programmeId },
        select: { id: true },
      });
      if (!programme) throw new BadRequestException("No such track");
    }

    if (!moduleId) return;

    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { programmeVersion: { select: { programmeId: true } } },
    });
    if (!module) throw new BadRequestException("No such module");

    if (programmeId && module.programmeVersion.programmeId !== programmeId) {
      throw new BadRequestException("That module belongs to a different track");
    }
  }
}
