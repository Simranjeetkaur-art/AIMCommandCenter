import {
  attemptAllowance,
  attemptAllowances,
} from "../src/modules/assessments/attempt-allowance";

/**
 * A grant adds to one learner's allowance on one paper, and only GRANTED
 * requests count. The database is stubbed: what is tested is the arithmetic
 * and the filter that is asked for.
 */
function stubPrisma(granted: Record<string, number>) {
  const seen: unknown[] = [];
  const prisma = {
    attemptRequest: {
      aggregate: async (args: { where: { assessmentId: string; status: string } }) => {
        seen.push(args.where);
        return { _sum: { extraAttempts: granted[args.where.assessmentId] ?? null } };
      },
      groupBy: async (args: { where: { status: string } }) => {
        seen.push(args.where);
        return Object.entries(granted).map(([assessmentId, n]) => ({
          assessmentId,
          _sum: { extraAttempts: n },
        }));
      },
    },
  };
  return { prisma: prisma as never, seen };
}

describe("attempt allowance", () => {
  it("is the paper's limit when nothing is granted", async () => {
    const { prisma } = stubPrisma({});
    expect(await attemptAllowance(prisma, "u1", { id: "a1", maxAttempts: 5 })).toBe(5);
  });

  it("adds granted extras, counting only GRANTED requests for that learner", async () => {
    const { prisma, seen } = stubPrisma({ a1: 2 });
    expect(await attemptAllowance(prisma, "u1", { id: "a1", maxAttempts: 5 })).toBe(7);
    expect(seen[0]).toEqual({ userId: "u1", assessmentId: "a1", status: "GRANTED" });
  });

  it("keys many papers at once", async () => {
    const { prisma } = stubPrisma({ a2: 1 });
    const map = await attemptAllowances(prisma, "u1", [
      { id: "a1", maxAttempts: 3 },
      { id: "a2", maxAttempts: 3 },
    ]);
    expect(map.get("a1")).toBe(3);
    expect(map.get("a2")).toBe(4);
  });
});
