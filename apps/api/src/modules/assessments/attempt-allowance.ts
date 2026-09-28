import type { PrismaService } from "../../common/prisma/prisma.service";

/**
 * How many attempts one learner has at one paper.
 *
 * The paper's own `maxAttempts`, plus whatever an examiner or manager has
 * granted this learner on request. Every place that counts attempts asks this
 * one function, so a grant cannot open the quiz while the simulator, or the
 * written submission, still says no.
 */
export async function attemptAllowance(
  prisma: PrismaService,
  userId: string,
  assessment: { id: string; maxAttempts: number },
): Promise<number> {
  const granted = await prisma.attemptRequest.aggregate({
    where: { userId, assessmentId: assessment.id, status: "GRANTED" },
    _sum: { extraAttempts: true },
  });
  return assessment.maxAttempts + (granted._sum.extraAttempts ?? 0);
}

/** The same, for many papers at once, keyed by assessment id. */
export async function attemptAllowances(
  prisma: PrismaService,
  userId: string,
  assessments: Array<{ id: string; maxAttempts: number }>,
): Promise<Map<string, number>> {
  const granted = await prisma.attemptRequest.groupBy({
    by: ["assessmentId"],
    where: {
      userId,
      status: "GRANTED",
      assessmentId: { in: assessments.map((a) => a.id) },
    },
    _sum: { extraAttempts: true },
  });
  const extra = new Map(
    granted.map((g) => [g.assessmentId, g._sum.extraAttempts ?? 0]),
  );
  return new Map(
    assessments.map((a) => [a.id, a.maxAttempts + (extra.get(a.id) ?? 0)]),
  );
}
