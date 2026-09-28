import { Injectable } from "@nestjs/common";
import { REVIEW_SLA_HOURS } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Programme-level progress across every cohort. */
  async progress() {
    const cohorts = await this.prisma.cohort.findMany({
      include: {
        programmeVersion: {
          include: { programme: { select: { code: true, title: true } } },
        },
        enrollments: { select: { status: true, userId: true } },
      },
      orderBy: { startsAt: "desc" },
    });

    return Promise.all(
      cohorts.map(async (cohort) => {
        const learnerIds = cohort.enrollments
          .filter((e) => e.status === "ACTIVE")
          .map((e) => e.userId);

        const [approved, pending, credentials] = await Promise.all([
          this.prisma.submission.count({
            where: { userId: { in: learnerIds }, status: "APPROVED" },
          }),
          this.prisma.submission.count({
            where: {
              userId: { in: learnerIds },
              status: { in: ["SUBMITTED", "IN_REVIEW"] },
            },
          }),
          this.prisma.credential.count({
            where: {
              userId: { in: learnerIds },
              programmeVersionId: cohort.programmeVersionId,
            },
          }),
        ]);

        return {
          cohortId: cohort.id,
          code: cohort.code,
          title: cohort.title,
          programme: cohort.programmeVersion.programme,
          active: learnerIds.length,
          withdrawn: cohort.enrollments.filter((e) => e.status === "WITHDRAWN")
            .length,
          approvedSubmissions: approved,
          pendingSubmissions: pending,
          credentialsIssued: credentials,
        };
      }),
    );
  }

  /**
   * Review turnaround. This is the report the manager acts on, and the reason
   * review.reassign is a manager permission: an item nobody has picked up is
   * an operational failure, not a judgement about the candidate.
   */
  async turnaround() {
    const now = new Date();

    const [open, overdue, decided] = await Promise.all([
      this.prisma.submission.findMany({
        where: { status: { in: ["SUBMITTED", "IN_REVIEW"] } },
        select: {
          id: true,
          status: true,
          submittedAt: true,
          slaDueAt: true,
          user: { select: { id: true, name: true } },
          claimedBy: { select: { id: true, name: true } },
          assessment: { select: { code: true, title: true, kind: true } },
        },
        orderBy: { slaDueAt: "asc" },
      }),
      this.prisma.submission.findMany({
        where: {
          status: { in: ["SUBMITTED", "IN_REVIEW"] },
          slaDueAt: { lt: now },
        },
        select: {
          id: true,
          submittedAt: true,
          slaDueAt: true,
          user: { select: { id: true, name: true } },
          claimedBy: { select: { id: true, name: true } },
          assessment: { select: { code: true, title: true } },
        },
        orderBy: { slaDueAt: "asc" },
      }),
      this.prisma.review.findMany({
        where: {
          createdAt: { gte: new Date(now.getTime() - 30 * 86_400_000) },
        },
        select: {
          createdAt: true,
          reviewerId: true,
          reviewer: { select: { name: true } },
          submission: { select: { submittedAt: true } },
        },
      }),
    ]);

    const byReviewer = new Map<
      string,
      { name: string; count: number; totalHours: number }
    >();
    for (const review of decided) {
      const submittedAt = review.submission.submittedAt;
      if (!submittedAt) continue;
      const hours =
        (review.createdAt.getTime() - submittedAt.getTime()) / 3_600_000;
      const entry = byReviewer.get(review.reviewerId) ?? {
        name: review.reviewer.name,
        count: 0,
        totalHours: 0,
      };
      entry.count += 1;
      entry.totalHours += hours;
      byReviewer.set(review.reviewerId, entry);
    }

    return {
      slaHours: REVIEW_SLA_HOURS,
      openCount: open.length,
      overdueCount: overdue.length,
      unclaimedCount: open.filter((s) => !s.claimedBy).length,
      overdue,
      open,
      reviewers: [...byReviewer.entries()].map(([id, e]) => ({
        instructorId: id,
        name: e.name,
        decided: e.count,
        averageHours: Number((e.totalHours / e.count).toFixed(1)),
      })),
    };
  }
}
