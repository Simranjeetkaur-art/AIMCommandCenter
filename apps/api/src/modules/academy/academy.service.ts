import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  DEFAULT_DRAW,
  PERMISSIONS as P,
  POOL_LABEL,
  poolForKind,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { normaliseGateSteps, validateGateSteps } from "./gate-steps";
import type { Actor } from "../../common/auth/actor";
import { TrackAccessService } from "./track-access.service";
import type {
  AuthorQuestionDto,
  CreateAssessmentDto,
  CreateLessonDto,
  CreateModuleDto,
  CreateProgrammeDto,
  CreateQuestionDto,
  CreateQuestionsBulkDto,
  CreateVersionDto,
  PublishVersionDto,
  UpdateLessonDto,
  UpdateModuleDto,
  UpdateProgrammeDto,
  UpdateAssessmentDto,
  UpdateProgrammeLadderDto,
  UpdateQuestionDto,
} from "./academy.dto";
import { attemptAllowances } from "../assessments/attempt-allowance";

@Injectable()
export class AcademyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly trackAccess: TrackAccessService,
  ) {}

  private canSeeAnswerKeys(actor: Actor): boolean {
    return (actor.permissions as readonly string[]).includes(P.ANSWER_KEY_READ);
  }

  // -- Programmes -----------------------------------------------------------

  listProgrammes(actor: Actor) {
    // A candidate is shown published versions only. A draft programme is the
    // manager's workbench, not a preview for the roll.
    const onlyPublished = !(actor.permissions as readonly string[]).includes(
      P.PROGRAMME_UPDATE,
    );

    return this.prisma.programme.findMany({
      where: onlyPublished
        ? { visible: true, versions: { some: { status: "PUBLISHED" } } }
        : {},
      include: {
        versions: {
          where: onlyPublished ? { status: "PUBLISHED" } : {},
          orderBy: { version: "desc" },
          select: {
            id: true,
            version: true,
            status: true,
            publishedAt: true,
            requirements: true,
          },
        },
      },
      orderBy: { code: "asc" },
    });
  }

  async createProgramme(dto: CreateProgrammeDto) {
    return this.prisma.$transaction(async (tx) => {
      const programme = await tx.programme.create({
        data: {
          code: dto.code.toUpperCase(),
          title: dto.title,
          summary: dto.summary,
        },
      });
      // A programme without a version is not editable, so version 1 comes with it.
      await tx.programmeVersion.create({
        data: { programmeId: programme.id, version: 1, status: "DRAFT" },
      });
      return tx.programme.findUniqueOrThrow({
        where: { id: programme.id },
        include: { versions: true },
      });
    });
  }

  updateProgramme(id: string, dto: UpdateProgrammeDto) {
    return this.prisma.programme.update({ where: { id }, data: dto });
  }

  async createVersion(programmeId: string, dto: CreateVersionDto) {
    const latest = await this.prisma.programmeVersion.findFirst({
      where: { programmeId },
      orderBy: { version: "desc" },
      select: { version: true },
    });

    const source = dto.cloneCurrent
      ? await this.prisma.programmeVersion.findFirst({
          where: { programmeId, status: "PUBLISHED" },
          orderBy: { version: "desc" },
          include: {
            modules: {
              orderBy: { position: "asc" },
              include: { lessons: true },
            },
            assessments: {
              include: { questions: { orderBy: { position: "asc" } } },
            },
          },
        })
      : null;

    return this.prisma.$transaction(async (tx) => {
      const version = await tx.programmeVersion.create({
        data: {
          programmeId,
          version: (latest?.version ?? 0) + 1,
          requirements: (dto.requirements ??
            source?.requirements ??
            {}) as object,
        },
      });

      if (!source) return version;

      // Modules and lessons are copied; questions are shared rather than
      // duplicated, because a question bank is authored once and a new version
      // of a course is usually the same questions in a changed syllabus.
      //
      // Every authored field is carried across. This is not obvious enough to
      // leave implicit: revising is the *only* sanctioned way to change a
      // published track, so anything this loop forgets is silently destroyed
      // the moment somebody uses it. It previously forgot the module overview
      // and its outcomes, which meant revising a course threw away the part an
      // author had written by hand and kept only what the importer generated.
      const moduleIdFor = new Map<string, string>();

      for (const mod of source.modules) {
        const copy = await tx.module.create({
          data: {
            programmeVersionId: version.id,
            code: mod.code,
            title: mod.title,
            summary: mod.summary,
            overview: mod.overview,
            outcomes: mod.outcomes as object,
            // A module hidden from candidates stays hidden in the revision.
            // Carrying the syllabus but not what is withheld from it would
            // quietly re-expose something somebody took down on purpose.
            visible: mod.visible,
            position: mod.position,
          },
        });
        moduleIdFor.set(mod.id, copy.id);

        for (const lesson of mod.lessons) {
          await tx.lesson.create({
            data: {
              moduleId: copy.id,
              title: lesson.title,
              bodyMd: lesson.bodyMd,
              bodyHtml: lesson.bodyHtml,
              content: (lesson.content ?? undefined) as object | undefined,
              visible: lesson.visible,
              position: lesson.position,
              estimatedMinutes: lesson.estimatedMinutes,
            },
          });
        }
      }

      for (const assessment of source.assessments) {
        // Codes are unique across the table, so a copy has to be distinguished
        // from the one it came from. It is distinguished by a *prefix*.
        //
        // This was a suffix, and that was a real bug. The product tells a
        // module's own paper apart from a qualification milestone by the code
        // ending in "-ASSESS" -- the candidate's assessment list and the track
        // page both group by it. Appending "-V11" to "CP-001-ASSESS" ends the
        // code in the version instead, so after one revision every module
        // paper in the track silently reclassified itself as a milestone.
        // Prefixing keeps whatever convention the code already carries, at
        // either end, intact.
        //
        // Any prefix from an earlier revision is stripped first, so a track
        // revised ten times reads "V11-CP-001-ASSESS" and not "V11-V10-...".
        const baseCode = assessment.code.replace(/^V\d+-/, "");
        const copy = await tx.assessment.create({
          data: {
            programmeVersionId: version.id,
            code: `V${version.version}-${baseCode}`,
            title: assessment.title,
            kind: assessment.kind,
            passMark: assessment.passMark,
            requiresReview: assessment.requiresReview,
            maxAttempts: assessment.maxAttempts,
            visible: assessment.visible,
            position: assessment.position,
            drawCount: assessment.drawCount,
            finalExam: assessment.finalExam,
            // Remapped, not copied. The source id points at a module belonging
            // to the *old* version; carrying it over would leave an assessment
            // in the new version closing a module in the old one.
            moduleId: assessment.moduleId
              ? (moduleIdFor.get(assessment.moduleId) ?? null)
              : null,
          },
        });
        for (const link of assessment.questions) {
          await tx.assessmentQuestion.create({
            data: {
              assessmentId: copy.id,
              questionId: link.questionId,
              position: link.position,
            },
          });
        }
      }

      return version;
    });
  }

  /**
   * Publishing. Administration only, by permission -- and refused here if the
   * version has nothing to teach or nothing to examine, because a published
   * version becomes the thing a credential attests to.
   */
  async publishVersion(
    actor: Actor,
    versionId: string,
    dto: PublishVersionDto,
  ) {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: versionId },
      include: {
        modules: { include: { lessons: { select: { id: true } } } },
        assessments: { select: { id: true } },
      },
    });

    if (!version) throw new NotFoundException("Programme version not found");
    if (version.status === "PUBLISHED") {
      throw new BadRequestException("That version is already published");
    }

    const lessonCount = version.modules.reduce(
      (n, m) => n + m.lessons.length,
      0,
    );
    if (lessonCount === 0) {
      throw new BadRequestException(
        "A version with no lessons cannot be published",
      );
    }
    if (version.assessments.length === 0) {
      throw new BadRequestException(
        "A version with no assessments cannot be published",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      // Publishing a new version retires the previous one. Two live versions
      // of the same programme would make "which requirements applied" a
      // question with no answer.
      await tx.programmeVersion.updateMany({
        where: { programmeId: version.programmeId, status: "PUBLISHED" },
        data: { status: "RETIRED" },
      });

      const published = await tx.programmeVersion.update({
        where: { id: versionId },
        data: {
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishedById: actor.id,
        },
      });

      await tx.programme.update({
        where: { id: version.programmeId },
        data: { status: "ACTIVE" },
      });

      return { ...published, reason: dto.reason };
    });
  }

  // -- Modules and lessons --------------------------------------------------

  private async assertVersionEditable(versionId: string): Promise<void> {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: versionId },
      select: { status: true },
    });
    if (!version) throw new NotFoundException("Programme version not found");
    if (version.status !== "DRAFT") {
      // A published version is what live candidates are being measured
      // against. Editing it retroactively changes what a credential meant.
      throw new BadRequestException(
        "A published version cannot be edited. Create a new version.",
      );
    }
  }

  async createModule(versionId: string, dto: CreateModuleDto) {
    await this.assertVersionEditable(versionId);
    return this.prisma.module.create({
      data: {
        programmeVersionId: versionId,
        code: dto.code?.trim() || null,
        title: dto.title,
        summary: dto.summary ?? "",
        position: dto.position,
      },
    });
  }

  async createLesson(moduleId: string, dto: CreateLessonDto) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { programmeVersionId: true },
    });
    if (!mod) throw new NotFoundException("Module not found");
    await this.assertVersionEditable(mod.programmeVersionId);

    return this.prisma.lesson.create({
      data: {
        moduleId,
        title: dto.title,
        bodyMd: dto.bodyMd,
        position: dto.position,
        estimatedMinutes: dto.estimatedMinutes ?? 15,
      },
    });
  }

  async versionOutline(versionId: string) {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: versionId },
      include: {
        programme: true,
        modules: {
          orderBy: { position: "asc" },
          include: {
            lessons: {
              orderBy: { position: "asc" },
              select: {
                id: true,
                title: true,
                position: true,
                estimatedMinutes: true,
              },
            },
          },
        },
        assessments: {
          select: {
            id: true,
            code: true,
            title: true,
            kind: true,
            passMark: true,
            requiresReview: true,
          },
        },
      },
    });
    if (!version) throw new NotFoundException("Programme version not found");
    return version;
  }

  /**
   * A whole track, with the caller's own progress folded in.
   *
   * This is the screen the prototype called the Academy path. It reports which
   * modules are complete and which assessments are passed, computed from the
   * caller's own rows -- a learner sees their progress and nobody else's,
   * because the only user id in the query is their own.
   */
  async track(actor: Actor, programmeCode: string) {
    // Hiding is only hiding if the hidden thing does not leave the database.
    // An author sees everything so they can un-hide it; a candidate does not
    // see it at all, on this route or any other.
    const authoring = (actor.permissions as readonly string[]).includes(
      P.PROGRAMME_UPDATE,
    );
    const onlyVisible = authoring ? {} : { visible: true };

    const programme = await this.prisma.programme.findUnique({
      where: { code: programmeCode },
      include: {
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          take: 1,
          include: {
            modules: {
              where: onlyVisible,
              orderBy: { position: "asc" },
              include: {
                lessons: {
                  where: onlyVisible,
                  orderBy: { position: "asc" },
                  select: {
                    id: true,
                    title: true,
                    estimatedMinutes: true,
                    visible: true,
                  },
                },
              },
            },
            assessments: {
              where: onlyVisible,
              orderBy: { code: "asc" },
              select: {
                id: true,
                code: true,
                title: true,
                kind: true,
                passMark: true,
                requiresReview: true,
                maxAttempts: true,
                _count: { select: { questions: true } },
              },
            },
          },
        },
      },
    });

    if (!programme || programme.versions.length === 0) {
      throw new NotFoundException("No published version of that track");
    }
    // A draft, archived or hidden track is not on offer to candidates, whatever
    // its version says: the academy list leaves it out, so its URL must too.
    if (!authoring && (programme.status !== "ACTIVE" || !programme.visible)) {
      throw new NotFoundException("No published version of that track");
    }

    const version = programme.versions[0];
    const lessonIds = version.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );
    const assessmentIds = version.assessments.map((a) => a.id);

    const [progress, attempts, submissions, enrollment, credential] =
      await Promise.all([
        this.prisma.lessonProgress.findMany({
          where: { userId: actor.id, lessonId: { in: lessonIds } },
          select: { lessonId: true, status: true },
        }),
        this.prisma.attempt.findMany({
          where: { userId: actor.id, assessmentId: { in: assessmentIds } },
          select: {
            assessmentId: true,
            attemptNo: true,
            score: true,
            passed: true,
            submittedAt: true,
          },
          orderBy: { attemptNo: "desc" },
        }),
        this.prisma.submission.findMany({
          where: { userId: actor.id, assessmentId: { in: assessmentIds } },
          select: {
            assessmentId: true,
            status: true,
            score: true,
            version: true,
          },
        }),
        this.prisma.enrollment.findFirst({
          where: {
            userId: actor.id,
            cohort: { programmeVersionId: version.id },
          },
          select: { id: true, status: true },
        }),
        this.prisma.credential.findFirst({
          where: {
            userId: actor.id,
            status: "ISSUED",
            programmeVersionId: version.id,
          },
          select: { id: true, serial: true },
        }),
      ]);

    const doneLessons = new Set(
      progress.filter((p) => p.status === "COMPLETED").map((p) => p.lessonId),
    );
    const bestAttempt = new Map<string, (typeof attempts)[number]>();
    for (const attempt of attempts) {
      const best = bestAttempt.get(attempt.assessmentId);
      if (!best || (attempt.score ?? -1) > (best.score ?? -1)) {
        bestAttempt.set(attempt.assessmentId, attempt);
      }
    }
    const submissionFor = new Map(submissions.map((s) => [s.assessmentId, s]));

    const access = await this.trackAccess.evaluate(actor.id, programme.code);

    const allowed = await attemptAllowances(
      this.prisma,
      actor.id,
      version.assessments,
    );

    // The ladder prerequisite as the gate shows it. When an unlock rule names
    // the track, the rule decides. When none does (a track "open to
    // everyone"), the step still names a track, and it is met only by an
    // active credential for that track -- never by the absence of a rule.
    const ladderCode = access.prerequisiteCode ?? programme.prerequisiteCode;
    const prerequisiteMet = access.prerequisiteCode
      ? access.prerequisiteMet
      : ladderCode
        ? (await this.prisma.credential.count({
            where: {
              userId: actor.id,
              status: "ISSUED",
              programmeVersion: { programme: { code: ladderCode } },
            },
          })) > 0
        : true;
    // Card chips and gate steps are columns now, so an administrator can
    // change what a track promises without a deploy.
    const gateSteps = normaliseGateSteps(programme.gateSteps, {
      hasPrerequisite: Boolean(programme.prerequisiteCode),
    });
    const cardStats = (programme.cardStats as string[] | null) ?? [];

    // The certification gate, with each step resolved against this learner.
    const moduleStepDone =
      version.modules.length > 0 &&
      version.modules.every(
        (m) =>
          m.lessons.length > 0 && m.lessons.every((l) => doneLessons.has(l.id)),
      );
    const passedAssessment = (code: string) => {
      const assessment = version.assessments.find((a) => a.code === code);
      if (!assessment) return false;
      const best = bestAttempt.get(assessment.id);
      if (best?.passed) return true;
      return submissionFor.get(assessment.id)?.status === "APPROVED";
    };
    const credentialHeld = credential !== null;

    // Only used by steps that have not been mapped yet -- "the first paper of
    // this kind" is a guess, and the whole point of a mapped step is that it
    // does not have to make one.
    const firstOfKind = (kind: string) =>
      version.assessments.find(
        (a) =>
          (a.kind === kind ||
            (kind === "PRACTICAL" && a.kind === "CAPSTONE")) &&
          !a.code.endsWith("-ASSESS"),
      )?.code ?? "";

    const gate = gateSteps.map((step) => {
      let met = false;
      switch (step.requirement) {
        case "CREDENTIAL":
          met = credentialHeld;
          break;
        case "PREREQUISITE":
          met = prerequisiteMet;
          break;
        case "LESSONS":
          met = moduleStepDone;
          break;
        case "ASSESSMENT": {
          const code = step.assessmentCode ?? "";
          met = passedAssessment(
            code.startsWith("@kind:")
              ? firstOfKind(code.slice("@kind:".length))
              : code,
          );
          break;
        }
      }
      // `inferred` travels to the screen so an author can see which steps are
      // still resting on their label rather than on a mapping they made.
      return {
        label: step.label,
        met,
        inferred: step.inferred === true,
        // Shown on the journey, never a condition of the credential.
        optional: step.optional === true,
      };
    });

    return {
      code: programme.code,
      title: programme.title,
      summary: programme.summary,
      level: programme.level,
      levelLabel: programme.levelLabel ?? `LEVEL ${programme.level}`,
      tagline: programme.tagline || programme.summary,
      cardStats,
      prerequisiteCode: access.prerequisiteCode,
      locked: !access.open,
      devAccess: access.devAccess,
      prerequisiteMet,
      accessReason: access.reason,
      credentialHeld,
      gate,
      versionId: version.id,
      version: version.version,
      requirements: version.requirements,
      enrolled: Boolean(enrollment),
      modules: version.modules.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        summary: m.summary,
        position: m.position,
        lessons: m.lessons.map((l) => ({
          ...l,
          completed: doneLessons.has(l.id),
        })),
        completed:
          m.lessons.length > 0 && m.lessons.every((l) => doneLessons.has(l.id)),
      })),
      assessments: version.assessments.map((a) => {
        const attempt = bestAttempt.get(a.id);
        const submission = submissionFor.get(a.id);
        return {
          id: a.id,
          code: a.code,
          title: a.title,
          kind: a.kind,
          passMark: a.passMark,
          requiresReview: a.requiresReview,
          // This learner's allowance, including any extra attempts granted.
          maxAttempts: allowed.get(a.id) ?? a.maxAttempts,
          questionCount: a._count.questions,
          attemptsUsed: attempts.filter((t) => t.assessmentId === a.id).length,
          bestScore: attempt?.score ?? null,
          passed: attempt?.passed ?? null,
          submissionStatus: submission?.status ?? null,
        };
      }),
    };
  }

  /** Structured content for the authoring screen, with its module context. */
  async lessonForAuthoring(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: {
            programmeVersion: {
              select: {
                id: true,
                status: true,
                programme: { select: { code: true, title: true } },
              },
            },
          },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");
    return lesson;
  }

  async lesson(actor: Actor, lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      include: {
        module: {
          include: { programmeVersion: { include: { programme: true } } },
        },
      },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");

    const authoring = (actor.permissions as readonly string[]).includes(
      P.PROGRAMME_UPDATE,
    );
    // A hidden lesson reads as absent rather than refused: a candidate who
    // guesses the URL learns nothing about what the syllabus used to contain.
    if (!authoring && (!lesson.visible || !lesson.module.visible)) {
      throw new NotFoundException("Lesson not found");
    }

    // A locked track is locked for its lessons too, not only on the card that
    // lists them: the lesson URL was a way round the gate. Authors pass.
    await this.trackAccess.assertTrainingOpen(
      actor,
      lesson.module.programmeVersionId,
    );

    /**
     * The syllabus around this lesson, so the reader can move through the
     * track without going back to the track page between every lesson.
     *
     * Built from the same visibility rule the lesson itself obeys: an author
     * sees hidden material, a candidate does not, so "next" never lands a
     * candidate on a lesson that reads as absent.
     */
    const modules = await this.prisma.module.findMany({
      where: {
        programmeVersionId: lesson.module.programmeVersionId,
        ...(authoring ? {} : { visible: true }),
      },
      orderBy: { position: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        position: true,
        lessons: {
          where: authoring ? {} : { visible: true },
          orderBy: { position: "asc" },
          select: {
            id: true,
            title: true,
            estimatedMinutes: true,
            progress: {
              where: { userId: actor.id, status: "COMPLETED" },
              select: { id: true },
            },
          },
        },
      },
    });

    const flat = modules.flatMap((m) =>
      m.lessons.map((l) => ({
        id: l.id,
        title: l.title,
        moduleId: m.id,
        moduleTitle: m.title,
        moduleCode: m.code,
        modulePosition: m.position,
        completed: l.progress.length > 0,
      })),
    );
    const at = flat.findIndex((l) => l.id === lessonId);

    return {
      ...lesson,
      outline: modules.map((m) => ({
        id: m.id,
        code: m.code,
        title: m.title,
        position: m.position,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          estimatedMinutes: l.estimatedMinutes,
          completed: l.progress.length > 0,
        })),
      })),
      position: at < 0 ? null : at + 1,
      total: flat.length,
      previous: at > 0 ? flat[at - 1] : null,
      next: at >= 0 && at + 1 < flat.length ? flat[at + 1] : null,
    };
  }

  /**
   * Destroying a track.
   *
   * Only one nobody has touched: no published version, no enrolments, no
   * credentials. Anything else archives instead, which hides it from
   * candidates and keeps every record that points at it. A track with one
   * credential issued against it is part of somebody's professional history,
   * and deleting it would make that credential name nothing.
   */
  async deleteProgramme(programmeId: string) {
    const programme = await this.prisma.programme.findUnique({
      where: { id: programmeId },
      select: {
        id: true,
        code: true,
        versions: {
          select: {
            id: true,
            status: true,
            _count: { select: { cohorts: true, credentials: true } },
          },
        },
      },
    });
    if (!programme) throw new NotFoundException("Track not found");

    const published = programme.versions.filter(
      (v) => v.status !== "DRAFT",
    ).length;
    const cohorts = programme.versions.reduce(
      (sum, v) => sum + v._count.cohorts,
      0,
    );
    const credentials = programme.versions.reduce(
      (sum, v) => sum + v._count.credentials,
      0,
    );

    const reasons: string[] = [];
    if (published > 0) reasons.push(`${published} published version(s)`);
    if (cohorts > 0) reasons.push(`${cohorts} cohort(s)`);
    if (credentials > 0) reasons.push(`${credentials} credential(s)`);

    if (reasons.length > 0) {
      throw new BadRequestException(
        `${programme.code} has ${reasons.join(", ")}. Archive it instead: it stops being offered and everything pointing at it still resolves.`,
      );
    }

    await this.prisma.programme.delete({ where: { id: programmeId } });
    return { deleted: true, code: programme.code };
  }

  /**
   * Discards a draft version.
   *
   * Cloning a published version to make one change, then thinking better of
   * it, previously left the draft there for good -- and each clone carries a
   * full copy of the modules, lessons and papers. Only a DRAFT goes, and only
   * one nobody is sitting: a published version is what candidates are being
   * measured against, and a draft with a cohort on it is one in use.
   */
  async deleteVersion(versionId: string) {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: versionId },
      select: {
        id: true,
        version: true,
        status: true,
        programme: { select: { code: true } },
        _count: { select: { cohorts: true, credentials: true } },
      },
    });
    if (!version) throw new NotFoundException("Programme version not found");

    if (version.status !== "DRAFT") {
      throw new BadRequestException(
        `v${version.version} is ${version.status}. A published version is what people are measured against and stays.`,
      );
    }
    if (version._count.cohorts > 0 || version._count.credentials > 0) {
      throw new BadRequestException(
        `v${version.version} has ${version._count.cohorts} cohort(s) and ${version._count.credentials} credential(s) against it.`,
      );
    }

    // Attempts and submissions point at assessments, which cascade from the
    // version. Refuse rather than take somebody's work down with the draft.
    const sat = await this.prisma.attempt.count({
      where: { assessment: { programmeVersionId: versionId } },
    });
    const submitted = await this.prisma.submission.count({
      where: { assessment: { programmeVersionId: versionId } },
    });
    if (sat + submitted > 0) {
      throw new BadRequestException(
        `${sat + submitted} attempt(s) exist against this draft's assessments.`,
      );
    }

    await this.prisma.programmeVersion.delete({ where: { id: versionId } });
    return {
      deleted: true,
      code: version.programme.code,
      version: version.version,
    };
  }

  // -- Questions and assessments -------------------------------------------

  async listQuestions(actor: Actor, bankId: string) {
    const questions = await this.prisma.question.findMany({
      where: { bankId },
      orderBy: { createdAt: "asc" },
    });

    // Belt and braces. Reaching this method needs questionbank.read, which no
    // candidate role holds, but the key is stripped on the way out anyway so
    // that a future route reusing this method cannot leak one.
    if (!this.canSeeAnswerKeys(actor)) {
      return questions.map(({ answerKey: _omitted, ...rest }) => rest);
    }
    return questions;
  }

  async createQuestionBank(actor: Actor, title: string) {
    return this.prisma.questionBank.create({
      data: { title, ownerId: actor.id },
    });
  }

  listQuestionBanks() {
    return this.prisma.questionBank.findMany({
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { questions: true } } },
    });
  }

  createQuestion(dto: CreateQuestionDto) {
    const options = dto.options ?? [];
    return this.prisma.question.create({
      data: {
        bankId: dto.bankId,
        stem: dto.stem,
        type: dto.type,
        options: options as object,
        answerKey: normaliseAnswerKey(dto.answerKey, options) as object,
        points: dto.points ?? 1,
        pool: dto.pool ?? "QUIZ",
        tags: (dto.tags ?? [])
          .map((t) => t.trim().toLowerCase())
          .filter(Boolean),
      },
    });
  }

  /**
   * Many questions into one bank, all of them or none.
   *
   * Every question is checked before any is written. A batch that wrote the
   * first nine and refused the tenth would leave an author guessing which
   * nine landed, and re-pasting the block would duplicate them -- so the
   * faults are collected, named by position, and the whole batch refused.
   */
  async createQuestionsBulk(dto: CreateQuestionsBulkDto) {
    const bank = await this.prisma.questionBank.findUnique({
      where: { id: dto.bankId },
      select: { id: true },
    });
    if (!bank) throw new NotFoundException("Question bank not found");

    const faults = dto.questions.flatMap((q, i) => {
      const at = `Question ${i + 1}`;
      if (q.correctIndex >= q.choices.length) {
        return [`${at}: the correct answer must be one of its choices`];
      }
      if (new Set(q.choices.map((c) => c.trim())).size !== q.choices.length) {
        return [`${at}: two of its choices are the same`];
      }
      return [];
    });
    if (faults.length > 0) {
      throw new BadRequestException(
        `Nothing was added. ${faults.join("; ")}.`,
      );
    }

    const tags = (dto.tags ?? [])
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const created = await this.prisma.$transaction(
      dto.questions.map((q) =>
        this.prisma.question.create({
          data: {
            bankId: dto.bankId,
            stem: q.stem,
            type: "SINGLE_CHOICE",
            options: q.choices.map((text, i) => ({ id: String(i), text })),
            answerKey: { correct: String(q.correctIndex) },
            explanation: q.explanation ?? null,
            points: dto.points ?? 1,
            pool: dto.pool ?? "QUIZ",
            tags,
          },
        }),
      ),
    );

    return { created: created.length };
  }

  async createAssessment(versionId: string, dto: CreateAssessmentDto) {
    await this.assertVersionEditable(versionId);
    await this.assertModuleBelongs(versionId, dto.moduleId);
    const finalExam = assertFinalShape(dto.kind, dto.moduleId, dto.finalExam);

    const assessment = await this.prisma.assessment.create({
      data: {
        programmeVersionId: versionId,
        code: dto.code.toUpperCase(),
        title: dto.title,
        kind: dto.kind,
        passMark: dto.passMark,
        requiresReview: dto.requiresReview ?? dto.kind !== "QUIZ",
        maxAttempts: dto.maxAttempts ?? 3,
        moduleId: dto.moduleId ?? null,
        finalExam: finalExam,
        drawCount:
          dto.drawCount !== undefined
            ? dto.drawCount || null
            : defaultDraw(dto.kind, Boolean(dto.moduleId), finalExam),
      },
    });
    if (finalExam) await this.onlyFinal(versionId, assessment.id);

    if (dto.awardsBadgeId)
      await this.linkBadge(dto.awardsBadgeId, assessment.code);
    return assessment;
  }

  /**
   * Points a badge at this assessment by writing the badge's own criteria.
   *
   * The alternative -- a column on the assessment saying which badge it awards
   * -- would be a second place that decides who gets a badge, and the two
   * would eventually disagree. The evaluator already understands
   * ASSESSMENT_PASSED, so this makes the builder set that, and there stays one
   * mechanism.
   */
  private async linkBadge(
    badgeId: string,
    assessmentCode: string,
  ): Promise<void> {
    const badge = await this.prisma.badge.findUnique({
      where: { id: badgeId },
      select: { id: true },
    });
    if (!badge) throw new BadRequestException("No such badge");

    await this.prisma.badge.update({
      where: { id: badgeId },
      data: {
        criteria: { type: "ASSESSMENT_PASSED", assessmentCode } as object,
        awardMode: "AUTOMATIC",
      },
    });
  }

  /** A paper filed under a module of another track is a paper nobody finds. */
  private async assertModuleBelongs(
    versionId: string,
    moduleId?: string,
  ): Promise<void> {
    if (!moduleId) return;
    const module = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { programmeVersionId: true },
    });
    if (!module) throw new BadRequestException("No such module");
    if (module.programmeVersionId !== versionId) {
      throw new BadRequestException(
        "That module belongs to a different version of the track",
      );
    }
  }

  // -- Authoring: editing what already exists ------------------------------

  /**
   * The authoring view of a version: everything, with question counts, so an
   * author can see the shape of a track without loading every item.
   */
  async versionForAuthoring(versionId: string) {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: versionId },
      include: {
        programme: true,
        modules: {
          orderBy: { position: "asc" },
          include: { lessons: { orderBy: { position: "asc" } } },
        },
        assessments: {
          orderBy: { code: "asc" },
          include: { _count: { select: { questions: true } } },
        },
      },
    });
    if (!version) throw new NotFoundException("Programme version not found");
    return version;
  }

  async updateModule(moduleId: string, dto: UpdateModuleDto) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { programmeVersionId: true },
    });
    if (!mod) throw new NotFoundException("Module not found");

    const sent = AcademyService.provided(dto);
    const onlyVisibility =
      sent.length > 0 && sent.every((k) => k === "visible");
    if (!onlyVisibility) {
      await this.assertVersionEditable(mod.programmeVersionId);
    }

    const { outcomes, ...rest } = dto;
    return this.prisma.module.update({
      where: { id: moduleId },
      data: {
        ...rest,
        ...(outcomes !== undefined ? { outcomes: outcomes as object } : {}),
      },
    });
  }

  async deleteModule(moduleId: string) {
    const mod = await this.prisma.module.findUnique({
      where: { id: moduleId },
      select: { programmeVersionId: true },
    });
    if (!mod) throw new NotFoundException("Module not found");
    await this.assertVersionEditable(mod.programmeVersionId);
    return this.prisma.module.delete({ where: { id: moduleId } });
  }

  /**
   * Editing an assessment after publication.
   *
   * Visibility is allowed on a published version; everything else is not. A
   * hidden assessment stops being offered without changing what the people
   * currently sitting it were promised, whereas moving a pass mark under them
   * would change the thing they are being measured against mid-course.
   */
  /** The fields actually sent, as opposed to every field the DTO declares. */
  private static provided(dto: object): string[] {
    return Object.entries(dto)
      .filter(([, value]) => value !== undefined)
      .map(([key]) => key);
  }

  /** One final examination per version: marking a new one unmarks the old. */
  private async onlyFinal(versionId: string, keepId: string) {
    await this.prisma.assessment.updateMany({
      where: { programmeVersionId: versionId, id: { not: keepId }, finalExam: true },
      data: { finalExam: false },
    });
  }

  async updateAssessment(assessmentId: string, dto: UpdateAssessmentDto) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        programmeVersionId: true,
        code: true,
        kind: true,
        moduleId: true,
        finalExam: true,
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    const sent = AcademyService.provided(dto);
    const onlyVisibility =
      sent.length > 0 && sent.every((k) => k === "visible");
    if (!onlyVisibility) {
      await this.assertVersionEditable(assessment.programmeVersionId);
    }
    await this.assertModuleBelongs(assessment.programmeVersionId, dto.moduleId);

    const { awardsBadgeId, drawCount, finalExam, ...fields } = dto;
    const willBeFinal = assertFinalShape(
      dto.kind ?? assessment.kind,
      dto.moduleId ?? assessment.moduleId,
      finalExam ?? assessment.finalExam,
    );
    const updated = await this.prisma.assessment.update({
      where: { id: assessmentId },
      data: {
        ...fields,
        ...(drawCount !== undefined ? { drawCount: drawCount || null } : {}),
        ...(finalExam !== undefined ? { finalExam: willBeFinal } : {}),
      },
    });
    if (finalExam === true) {
      await this.onlyFinal(assessment.programmeVersionId, assessmentId);
    }

    if (awardsBadgeId) await this.linkBadge(awardsBadgeId, updated.code);
    return updated;
  }

  async deleteAssessment(assessmentId: string) {
    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        programmeVersionId: true,
        _count: { select: { attempts: true, submissions: true } },
      },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");

    // Checked before the version rule, because it is the more specific reason
    // and the one that must hold whatever state the version is in: deleting an
    // assessment people have sat would erase their attempts along with it.
    const sat = assessment._count.attempts + assessment._count.submissions;
    if (sat > 0) {
      throw new BadRequestException(
        `${sat} attempt(s) exist against this assessment. Hide it instead of deleting it.`,
      );
    }

    await this.assertVersionEditable(assessment.programmeVersionId);

    return this.prisma.assessment.delete({ where: { id: assessmentId } });
  }

  async deleteLesson(lessonId: string) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        module: { select: { programmeVersionId: true } },
        _count: { select: { progress: true } },
      },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");

    if (lesson._count.progress > 0) {
      throw new BadRequestException(
        `${lesson._count.progress} learner(s) have progress against this lesson. Hide it instead.`,
      );
    }

    await this.assertVersionEditable(lesson.module.programmeVersionId);

    return this.prisma.lesson.delete({ where: { id: lessonId } });
  }

  /**
   * Hiding, which works on a published version where editing does not.
   *
   * Taking something out of a candidate's view is an operational decision an
   * institution makes about a live course. Changing what the course says is
   * not, and still needs a new version.
   */
  async setVisibility(
    kind: "module" | "lesson" | "assessment" | "programme",
    id: string,
    visible: boolean,
  ) {
    switch (kind) {
      case "module":
        return this.prisma.module.update({ where: { id }, data: { visible } });
      case "lesson":
        return this.prisma.lesson.update({ where: { id }, data: { visible } });
      case "assessment":
        return this.prisma.assessment.update({
          where: { id },
          data: { visible },
        });
      case "programme":
        return this.prisma.programme.update({
          where: { id },
          data: { visible },
        });
    }
  }

  async updateLesson(lessonId: string, dto: UpdateLessonDto) {
    const lesson = await this.prisma.lesson.findUnique({
      where: { id: lessonId },
      select: { module: { select: { programmeVersionId: true } } },
    });
    if (!lesson) throw new NotFoundException("Lesson not found");
    const sent = AcademyService.provided(dto);
    const onlyVisibility =
      sent.length > 0 && sent.every((k) => k === "visible");
    if (!onlyVisibility) {
      await this.assertVersionEditable(lesson.module.programmeVersionId);
    }

    const { content, ...rest } = dto;
    if (content !== undefined) assertLessonContent(content);

    return this.prisma.lesson.update({
      where: { id: lessonId },
      data: {
        ...rest,
        ...(content !== undefined ? { content: content as object } : {}),
        // Structured content supersedes the imported markup: keeping both
        // would leave two answers to "what does this lesson say".
        ...(content !== undefined ? { bodyHtml: null } : {}),
      },
    });
  }

  /**
   * Authors a choice question and attaches it, in one transaction.
   *
   * The answer key is written here and never leaves: the candidate-facing
   * projection has no column for it.
   */
  async authorQuestion(actor: Actor, dto: AuthorQuestionDto) {
    if (dto.correctIndex >= dto.choices.length) {
      throw new BadRequestException(
        "The correct answer must be one of the choices",
      );
    }

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: dto.assessmentId },
      select: { id: true, programmeVersionId: true, kind: true },
    });
    if (!assessment) throw new NotFoundException("Assessment not found");
    await this.assertVersionEditable(assessment.programmeVersionId);

    const version = await this.prisma.programmeVersion.findUniqueOrThrow({
      where: { id: assessment.programmeVersionId },
      select: { programme: { select: { code: true } } },
    });

    let bank = await this.prisma.questionBank.findFirst({
      where: { title: `${version.programme.code} question bank` },
    });
    bank ??= await this.prisma.questionBank.create({
      data: {
        title: `${version.programme.code} question bank`,
        ownerId: actor.id,
      },
    });

    const last = await this.prisma.assessmentQuestion.findFirst({
      where: { assessmentId: dto.assessmentId },
      orderBy: { position: "desc" },
      select: { position: true },
    });

    return this.prisma.$transaction(async (tx) => {
      const question = await tx.question.create({
        data: {
          bankId: bank!.id,
          stem: dto.stem,
          type: "SINGLE_CHOICE",
          options: dto.choices.map((text, i) => ({ id: String(i), text })),
          answerKey: { correct: String(dto.correctIndex) },
          explanation: dto.explanation ?? null,
          meta: { authoredBy: actor.id },
          points: dto.points ?? 1,
          // Written for this paper, so it belongs to this paper's pool.
          pool: poolForKind(assessment.kind),
        },
      });
      await tx.assessmentQuestion.create({
        data: {
          assessmentId: dto.assessmentId,
          questionId: question.id,
          position: (last?.position ?? 0) + 1,
        },
      });
      return question;
    });
  }

  async updateQuestion(questionId: string, dto: UpdateQuestionDto) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      include: {
        assessments: { select: { assessment: { select: { code: true, kind: true } } } },
      },
    });
    if (!question) throw new NotFoundException("Question not found");
    if (dto.pool !== undefined && dto.pool !== question.pool) {
      // Moving a question to the other pool while a paper of the old kind
      // still carries it would put it in front of candidates on both sides.
      const clash = question.assessments
        .map((a) => a.assessment)
        .filter((a) => poolForKind(a.kind) !== dto.pool);
      if (clash.length > 0) {
        throw new BadRequestException(
          `This question is on ${clash.map((a) => a.code).join(", ")}. Take it off ${clash.length === 1 ? "that paper" : "those papers"} before moving it to the ${POOL_LABEL[dto.pool].toLowerCase()} pool.`,
        );
      }
    }
    return this.prisma.question.update({
      where: { id: questionId },
      data: {
        ...(dto.stem !== undefined ? { stem: dto.stem } : {}),
        ...(dto.options !== undefined
          ? { options: dto.options as object }
          : {}),
        ...(dto.answerKey !== undefined
          ? { answerKey: dto.answerKey as object }
          : {}),
        ...(dto.explanation !== undefined
          ? { explanation: dto.explanation }
          : {}),
        ...(dto.points !== undefined ? { points: dto.points } : {}),
        ...(dto.pool !== undefined ? { pool: dto.pool } : {}),
        ...(dto.bankId !== undefined ? { bankId: dto.bankId } : {}),
        ...(dto.tags !== undefined
          ? {
              tags: dto.tags.map((t) => t.trim().toLowerCase()).filter(Boolean),
            }
          : {}),
      },
    });
  }

  /**
   * Removes a question. Refuses while it is on a paper: detaching it there is
   * the deliberate act, and doing it silently here would change a paper
   * somebody is about to sit.
   */
  async deleteQuestion(questionId: string) {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: { id: true, _count: { select: { assessments: true } } },
    });
    if (!question) throw new NotFoundException("Question not found");

    if (question._count.assessments > 0) {
      throw new BadRequestException(
        `This question is on ${question._count.assessments} assessment(s). Take it off those papers first.`,
      );
    }

    return this.prisma.question.delete({ where: { id: questionId } });
  }

  /** The ladder: level, prerequisite, card chips and the certification gate. */
  async updateLadder(programmeId: string, dto: UpdateProgrammeLadderDto) {
    const programme = await this.prisma.programme.findUnique({
      where: { id: programmeId },
      select: { code: true },
    });
    if (!programme) throw new NotFoundException("Programme not found");

    if (dto.prerequisiteCode) {
      if (dto.prerequisiteCode === programme.code) {
        throw new BadRequestException("A track cannot be its own prerequisite");
      }
      const prerequisite = await this.prisma.programme.findUnique({
        where: { code: dto.prerequisiteCode },
        select: { code: true, prerequisiteCode: true },
      });
      if (!prerequisite) {
        throw new BadRequestException(
          `No track with code ${dto.prerequisiteCode}`,
        );
      }
      // A cycle would lock every track in it forever, with no error to explain
      // why, so the chain is walked before the edit rather than after.
      const seen = new Set([programme.code]);
      let cursor: string | null = prerequisite.code;
      while (cursor) {
        if (seen.has(cursor)) {
          throw new BadRequestException(
            "That prerequisite would create a loop in the ladder",
          );
        }
        seen.add(cursor);
        const next: { prerequisiteCode: string | null } | null =
          await this.prisma.programme.findUnique({
            where: { code: cursor },
            select: { prerequisiteCode: true },
          });
        cursor = next?.prerequisiteCode ?? null;
      }
    }

    // A step that names a paper is checked against the papers this track
    // actually has. An unmeetable gate is worse than an unmapped one: the
    // unmapped step at least says it is guessing.
    let gateSteps: object | undefined;
    if (dto.gateSteps !== undefined) {
      const codes = await this.prisma.assessment.findMany({
        where: {
          programmeVersion: { programmeId },
        },
        select: { code: true },
      });
      gateSteps = validateGateSteps(
        dto.gateSteps,
        codes.map((c) => c.code),
      ) as unknown as object;
    }

    return this.prisma.programme.update({
      where: { id: programmeId },
      data: {
        ...(dto.level !== undefined ? { level: dto.level } : {}),
        ...(dto.levelLabel !== undefined ? { levelLabel: dto.levelLabel } : {}),
        ...(dto.tagline !== undefined ? { tagline: dto.tagline } : {}),
        ...(dto.prerequisiteCode !== undefined
          ? { prerequisiteCode: dto.prerequisiteCode || null }
          : {}),
        ...(dto.devAccessFlag !== undefined
          ? { devAccessFlag: dto.devAccessFlag }
          : {}),
        ...(dto.visible !== undefined ? { visible: dto.visible } : {}),
        ...(dto.cardStats !== undefined
          ? { cardStats: dto.cardStats as object }
          : {}),
        ...(gateSteps !== undefined ? { gateSteps } : {}),
        ...(dto.selfEnrol !== undefined ? { selfEnrol: dto.selfEnrol } : {}),
      },
    });
  }

  async attachQuestion(
    assessmentId: string,
    questionId: string,
    position: number,
  ) {
    const [assessment, question] = await Promise.all([
      this.prisma.assessment.findUnique({
        where: { id: assessmentId },
        select: { kind: true },
      }),
      this.prisma.question.findUnique({
        where: { id: questionId },
        select: { pool: true },
      }),
    ]);
    if (!assessment) throw new NotFoundException("Assessment not found");
    if (!question) throw new NotFoundException("Question not found");
    assertPoolFits(assessment.kind, [question.pool]);
    return this.prisma.assessmentQuestion.create({
      data: { assessmentId, questionId, position },
    });
  }
}

/** Draw size a new paper starts with, by what it is. */
function defaultDraw(
  kind: string,
  closesModule: boolean,
  finalExam: boolean,
): number | null {
  if (kind === "SIMULATION") return DEFAULT_DRAW.simulator;
  if (finalExam) return DEFAULT_DRAW.finalExam;
  if (kind === "QUIZ" && closesModule) return DEFAULT_DRAW.moduleQuiz;
  return null;
}

/**
 * A final examination is a machine-marked quiz over the whole track. It is not
 * a module's quiz, and it is not a simulator run.
 */
function assertFinalShape(
  kind: string,
  moduleId: string | null | undefined,
  finalExam: boolean | undefined,
): boolean {
  if (!finalExam) return false;
  if (kind !== "QUIZ") {
    throw new BadRequestException("Only a quiz can be the final examination.");
  }
  if (moduleId) {
    throw new BadRequestException(
      "The final examination covers the whole track. Detach it from its module first.",
    );
  }
  return true;
}

/** Refuses questions from the other half of the bank. */
export function assertPoolFits(kind: string, pools: readonly string[]) {
  const want = poolForKind(kind);
  const wrong = pools.filter((p) => p !== want).length;
  if (wrong > 0) {
    throw new BadRequestException(
      want === "SIMULATOR"
        ? `${wrong} of those question(s) are in the quiz pool. A simulator flies only simulator-pool questions, so no candidate meets the same question in a quiz and a run.`
        : `${wrong} of those question(s) are in the simulator pool. Quizzes and exams use only quiz-pool questions, so no candidate meets the same question in a quiz and a run.`,
    );
  }
}

/**
 * Validates a structured lesson.
 *
 * Nested enough that decorators would obscure rather than clarify, and the
 * errors that matter are about the content: a section without a heading, or a
 * callout with nothing in it, would render as an empty box a learner cannot
 * interpret and an author cannot see is wrong.
 */
export function assertLessonContent(content: Record<string, unknown>): void {
  const sections = content.sections;
  if (!Array.isArray(sections)) {
    throw new BadRequestException(
      "A lesson needs a sections array, even an empty one",
    );
  }

  sections.forEach((raw, index) => {
    const section = raw as {
      heading?: unknown;
      paragraphs?: unknown;
      blocks?: unknown;
    };
    if (
      typeof section.heading !== "string" ||
      section.heading.trim().length < 2
    ) {
      // Says the length, because "needs a heading" on a section that has one
      // reads as a system fault rather than as the two-character minimum.
      throw new BadRequestException(
        `Section ${index + 1} needs a heading of at least 2 characters`,
      );
    }
    if (
      section.paragraphs !== undefined &&
      !Array.isArray(section.paragraphs)
    ) {
      throw new BadRequestException(
        `Section ${index + 1}: paragraphs must be a list`,
      );
    }
    if (section.blocks !== undefined) {
      if (!Array.isArray(section.blocks)) {
        throw new BadRequestException(
          `Section ${index + 1}: blocks must be a list`,
        );
      }
      section.blocks.forEach((rawBlock, blockIndex) => {
        const block = rawBlock as {
          kind?: unknown;
          body?: unknown;
          items?: unknown;
          terms?: unknown;
          url?: unknown;
          label?: unknown;
        };
        const where = `Section ${index + 1}, callout ${blockIndex + 1}`;

        if (typeof block.kind !== "string") {
          throw new BadRequestException(`${where} needs a kind`);
        }

        const text = (value: unknown) =>
          typeof value === "string" && value.trim().length > 0;

        // A callout carries its content in whichever field its kind uses.
        // Checking only `body` and `items` meant a key-terms block, whose
        // content is `terms`, and a link, whose content is `url` and `label`,
        // were both refused as empty -- so those kinds could be offered by the
        // editor and never saved.
        const hasBody = text(block.body);
        const hasItems = Array.isArray(block.items) && block.items.length > 0;
        const hasLink = text(block.url) || text(block.label);

        if (block.terms !== undefined && !Array.isArray(block.terms)) {
          throw new BadRequestException(`${where}: terms must be a list`);
        }
        const terms = Array.isArray(block.terms) ? block.terms : [];
        terms.forEach((rawTerm, termIndex) => {
          const term = rawTerm as { term?: unknown; definition?: unknown };
          if (!text(term.term)) {
            throw new BadRequestException(
              `${where}, term ${termIndex + 1} has no name`,
            );
          }
          if (!text(term.definition)) {
            throw new BadRequestException(
              `${where}: "${String(term.term)}" has no definition`,
            );
          }
        });

        if (!hasBody && !hasItems && !hasLink && terms.length === 0) {
          throw new BadRequestException(
            `${where} is empty. Give it text, list items, terms or a link.`,
          );
        }
      });
    }
  });
}

/**
 * An answer key in the one shape marking understands: `correct` holds option
 * ids, as strings.
 *
 * Marking compares the candidate's chosen option id with `correct` exactly. A
 * key written as a choice *index* (`{ correct: 1 }`) against options with ids
 * like "b" would never match, so the question could never be answered right.
 * Indexes are translated to the ids of the options they point at.
 */
export function normaliseAnswerKey(
  key: Record<string, unknown>,
  options: unknown[],
): Record<string, unknown> {
  const idAt = (index: number): string => {
    const option = options[index];
    if (option && typeof option === "object" && "id" in option) {
      return String((option as { id: unknown }).id);
    }
    return String(index);
  };
  const one = (value: unknown): unknown =>
    typeof value === "number" && Number.isInteger(value) ? idAt(value) : value;

  const correct = key.correct;
  if (correct === undefined) return key;
  return {
    ...key,
    correct: Array.isArray(correct) ? correct.map(one) : one(correct),
  };
}
