import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import { NotificationsService } from "../messaging/notifications.service";
import type { Actor } from "../../common/auth/actor";
import { attemptAllowance } from "./attempt-allowance";

export const MIN_REQUEST_REASON = 20;
export const MIN_DECISION_NOTE = 10;
export const MAX_EXTRA_ATTEMPTS = 3;

/**
 * "I have used every attempt and not passed. May I try again?"
 *
 * A learner asks from the paper's page; an examiner assigned to them, or a
 * manager or administrator, grants one to three more attempts or declines,
 * with a note either way. A grant raises that learner's allowance on that
 * paper only (see `attemptAllowance`), and nobody else's.
 */
@Injectable()
export class AttemptRequestsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly notifications: NotificationsService,
  ) {}

  /** A learner asking for more attempts at one paper. */
  async request(actor: Actor, assessmentId: string, reason: string) {
    const text = (reason ?? "").trim();
    if (text.length < MIN_REQUEST_REASON) {
      throw new BadRequestException(
        `Say why you should have another attempt, in at least ${MIN_REQUEST_REASON} characters.`,
      );
    }

    const assessment = await this.prisma.assessment.findUnique({
      where: { id: assessmentId },
      select: {
        id: true,
        code: true,
        title: true,
        maxAttempts: true,
        visible: true,
        requiresReview: true,
        programmeVersionId: true,
      },
    });
    if (!assessment || !assessment.visible) {
      throw new NotFoundException("Assessment not found");
    }

    const enrolled = await this.prisma.enrollment.findFirst({
      where: {
        userId: actor.id,
        status: "ACTIVE",
        cohort: { programmeVersionId: assessment.programmeVersionId },
      },
      select: { id: true },
    });
    if (!enrolled) {
      throw new BadRequestException(
        "You are not enrolled on the programme this assessment belongs to",
      );
    }

    // Only once there is genuinely nothing left: every attempt used, none passed.
    const [used, passed, allowed, pending] = await Promise.all([
      assessment.requiresReview
        ? this.prisma.submission.count({
            where: { userId: actor.id, assessmentId: assessment.id },
          })
        : this.prisma.attempt.count({
            where: { userId: actor.id, assessmentId: assessment.id },
          }),
      assessment.requiresReview
        ? this.prisma.submission.count({
            where: {
              userId: actor.id,
              assessmentId: assessment.id,
              status: "APPROVED",
            },
          })
        : this.prisma.attempt.count({
            where: {
              userId: actor.id,
              assessmentId: assessment.id,
              passed: true,
            },
          }),
      attemptAllowance(this.prisma, actor.id, assessment),
      this.prisma.attemptRequest.findFirst({
        where: {
          userId: actor.id,
          assessmentId: assessment.id,
          status: "PENDING",
        },
        select: { id: true },
      }),
    ]);
    if (passed > 0) {
      throw new BadRequestException("You have already passed this paper.");
    }
    if (used < allowed) {
      throw new BadRequestException(
        `You still have ${allowed - used} attempt${allowed - used === 1 ? "" : "s"} left on this paper.`,
      );
    }
    if (pending) {
      throw new ConflictException(
        "You already have a request waiting for a decision on this paper.",
      );
    }

    const created = await this.prisma.attemptRequest.create({
      data: { userId: actor.id, assessmentId: assessment.id, reason: text },
      select: { id: true, status: true, createdAt: true },
    });

    // Told to the examiners who can see this learner, and to the managers.
    const deciders = await this.decidersFor(actor.id);
    await Promise.all(
      deciders.map((d) =>
        this.notifications.raise({
          userId: d.id,
          kind: "attempt.request",
          title: `${actor.name} asks for another attempt at ${assessment.code}`,
          body: text,
          href:
            d.role === "INSTRUCTOR"
              ? "/instructor"
              : d.role === "ADMIN"
                ? "/admin"
                : "/manager/turnaround",
        }),
      ),
    );

    return created;
  }

  /**
   * Requests the caller may decide. An examiner sees only learners assigned
   * to them; a manager or administrator sees all of them.
   */
  async list(actor: Actor, status: "PENDING" | "ALL" = "PENDING") {
    const ids = await this.scope.visibleLearnerIds(actor);
    const rows = await this.prisma.attemptRequest.findMany({
      where: {
        ...(status === "PENDING" ? { status: "PENDING" as const } : {}),
        ...(ids === null ? {} : { userId: { in: ids } }),
      },
      orderBy: { createdAt: "asc" },
      take: 100,
      select: {
        id: true,
        status: true,
        reason: true,
        extraAttempts: true,
        decisionNote: true,
        createdAt: true,
        decidedAt: true,
        user: { select: { id: true, name: true, email: true } },
        decidedBy: { select: { name: true } },
        assessment: {
          select: { id: true, code: true, title: true, passMark: true, maxAttempts: true },
        },
      },
    });

    // The record a decider needs beside each request: attempts used and best score.
    return Promise.all(
      rows.map(async (row) => {
        const attempts = await this.prisma.attempt.findMany({
          where: { userId: row.user.id, assessmentId: row.assessment.id },
          select: { score: true },
        });
        const best = attempts.reduce<number | null>(
          (acc, a) =>
            a.score !== null && (acc === null || a.score > acc) ? a.score : acc,
          null,
        );
        return {
          ...row,
          attemptsUsed: attempts.length,
          attemptsAllowed: await attemptAllowance(
            this.prisma,
            row.user.id,
            row.assessment,
          ),
          bestScore: best,
        };
      }),
    );
  }

  /** Granting or declining. The note is required either way and goes to the learner. */
  async decide(
    actor: Actor,
    requestId: string,
    // `reason` is the note to the learner; named so the audit record keeps it.
    body: { decision?: unknown; extraAttempts?: unknown; reason?: unknown },
  ) {
    const decision = body.decision === "GRANT" ? "GRANT" : body.decision === "DECLINE" ? "DECLINE" : null;
    if (!decision) {
      throw new BadRequestException("Choose to grant or to decline.");
    }
    const note = typeof body.reason === "string" ? body.reason.trim() : "";
    if (note.length < MIN_DECISION_NOTE) {
      throw new BadRequestException(
        `Write a note for the learner of at least ${MIN_DECISION_NOTE} characters.`,
      );
    }
    const extra = decision === "GRANT" ? Number(body.extraAttempts ?? 1) : 0;
    if (
      decision === "GRANT" &&
      (!Number.isInteger(extra) || extra < 1 || extra > MAX_EXTRA_ATTEMPTS)
    ) {
      throw new BadRequestException(
        `Grant between 1 and ${MAX_EXTRA_ATTEMPTS} extra attempts.`,
      );
    }

    const request = await this.prisma.attemptRequest.findUnique({
      where: { id: requestId },
      select: {
        id: true,
        userId: true,
        status: true,
        assessment: { select: { id: true, code: true } },
      },
    });
    if (!request) throw new NotFoundException("Request not found");
    // Out of scope reads as absent, as it does everywhere else.
    await this.scope.assertCanSeeLearner(actor, request.userId);
    if (request.status !== "PENDING") {
      throw new ConflictException("That request has already been decided.");
    }

    // Conditional on still being PENDING, so two deciders cannot both act.
    const updated = await this.prisma.attemptRequest.updateMany({
      where: { id: request.id, status: "PENDING" },
      data: {
        status: decision === "GRANT" ? "GRANTED" : "DECLINED",
        extraAttempts: extra,
        decisionNote: note,
        decidedById: actor.id,
        decidedAt: new Date(),
      },
    });
    if (updated.count === 0) {
      throw new ConflictException("That request was decided a moment ago.");
    }

    await this.notifications.raise({
      userId: request.userId,
      kind: decision === "GRANT" ? "attempt.granted" : "attempt.declined",
      title:
        decision === "GRANT"
          ? `${extra} more attempt${extra === 1 ? "" : "s"} at ${request.assessment.code}`
          : `Your request for another attempt at ${request.assessment.code} was declined`,
      body: note,
      href: `/student/assessments/${request.assessment.id}`,
    });

    return { id: request.id, status: decision === "GRANT" ? "GRANTED" : "DECLINED", extraAttempts: extra };
  }

  /** The examiners assigned to this learner, and every manager and administrator. */
  private async decidersFor(learnerId: string) {
    const [assigned, staff] = await Promise.all([
      this.prisma.instructorAssignment.findMany({
        where: { learnerId },
        select: { instructor: { select: { id: true, role: true, status: true } } },
      }),
      this.prisma.user.findMany({
        where: {
          role: { in: ["MANAGER", "ADMIN"] },
          status: "ACTIVE",
          archivedAt: null,
        },
        select: { id: true, role: true },
      }),
    ]);
    const examiners = assigned
      .map((a) => a.instructor)
      .filter((i) => i.status === "ACTIVE")
      .map((i) => ({ id: i.id, role: i.role }));
    return [...examiners, ...staff];
  }
}
