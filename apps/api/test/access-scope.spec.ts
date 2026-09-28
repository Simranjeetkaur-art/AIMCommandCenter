import { ForbiddenException, NotFoundException } from "@nestjs/common";
import { permissionsFor, type Role } from "@aim/contracts";
import { AccessScopeService } from "../src/common/access/access-scope.service";
import type { Actor } from "../src/common/auth/actor";

function actor(role: Role, id = "self"): Actor {
  return {
    id,
    email: `${id}@aim.edu`,
    name: id,
    role,
    sessionId: "s",
    permissions: permissionsFor(role),
    previewRole: null,
  };
}

function serviceWithAssignments(learnerIds: string[]) {
  const prisma = {
    instructorAssignment: {
      findMany: jest
        .fn()
        .mockResolvedValue(learnerIds.map((learnerId) => ({ learnerId }))),
      findUnique: jest
        .fn()
        .mockImplementation(
          ({
            where,
          }: {
            where: { instructorId_learnerId: { learnerId: string } };
          }) =>
            Promise.resolve(
              learnerIds.includes(where.instructorId_learnerId.learnerId)
                ? { id: "a" }
                : null,
            ),
        ),
    },
  };
  return new AccessScopeService(prisma as never);
}

describe("AccessScopeService", () => {
  it("limits a student to themselves, whatever id they ask for", async () => {
    const scope = serviceWithAssignments([]);
    const student = actor("STUDENT", "mei");

    await expect(scope.visibleLearnerIds(student)).resolves.toEqual(["mei"]);
    await expect(
      scope.assertCanSeeLearner(student, "mei"),
    ).resolves.toBeUndefined();
    await expect(scope.assertCanSeeLearner(student, "jonah")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("limits an instructor to their assigned learners", async () => {
    const scope = serviceWithAssignments(["mei", "jonah"]);
    const examiner = actor("INSTRUCTOR", "tomas");

    await expect(scope.visibleLearnerIds(examiner)).resolves.toEqual([
      "mei",
      "jonah",
    ]);
    await expect(
      scope.assertCanSeeLearner(examiner, "jonah"),
    ).resolves.toBeUndefined();
    await expect(scope.assertCanSeeLearner(examiner, "fatima")).rejects.toThrow(
      NotFoundException,
    );
  });

  it("answers an unassigned learner with not-found, so the roll cannot be enumerated", async () => {
    const scope = serviceWithAssignments(["mei"]);
    const examiner = actor("INSTRUCTOR", "tomas");

    // A 403 here would confirm that 'fatima' exists. A 404 says nothing.
    await expect(scope.assertCanSeeLearner(examiner, "fatima")).rejects.toThrow(
      NotFoundException,
    );
    await expect(
      scope.assertCanSeeLearner(examiner, "nobody-at-all"),
    ).rejects.toThrow(NotFoundException);
  });

  it("places no restriction on a manager or an administrator", async () => {
    const scope = serviceWithAssignments([]);
    await expect(
      scope.visibleLearnerIds(actor("MANAGER", "priya")),
    ).resolves.toBeNull();
    await expect(
      scope.visibleLearnerIds(actor("ADMIN", "rowan")),
    ).resolves.toBeNull();
    await expect(
      scope.learnerScopeFilter(actor("MANAGER", "priya")),
    ).resolves.toEqual({});
  });

  it("builds a query filter that cannot be widened by the caller", async () => {
    const scope = serviceWithAssignments(["mei", "jonah"]);
    await expect(
      scope.learnerScopeFilter(actor("INSTRUCTOR", "tomas")),
    ).resolves.toEqual({
      userId: { in: ["mei", "jonah"] },
    });
    await expect(
      scope.learnerScopeFilter(actor("STUDENT", "mei")),
    ).resolves.toEqual({
      userId: "mei",
    });
  });

  it("refuses self-review even though the examiner holds review.approve", () => {
    const scope = serviceWithAssignments(["tomas"]);
    const examiner = actor("INSTRUCTOR", "tomas");

    expect(() => scope.assertNotSelfReview(examiner, "mei")).not.toThrow();
    expect(() => scope.assertNotSelfReview(examiner, "tomas")).toThrow(
      ForbiddenException,
    );
  });
});
