import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { PERMISSIONS as P, permissionsFor, type Role } from "@aim/contracts";
import { PermissionsGuard } from "../src/common/auth/permissions.guard";
import {
  PERMISSIONS_ALL_KEY,
  PERMISSIONS_ANY_KEY,
} from "../src/common/auth/permissions.decorator";
import { IS_PUBLIC_KEY } from "../src/common/auth/public.decorator";
import { AUDIT_KEY } from "../src/common/audit/audit.decorator";

type Metadata = Partial<Record<string, unknown>>;

function contextFor(role: Role | null, metadata: Metadata) {
  const request: Record<string, unknown> = {
    method: "POST",
    originalUrl: "/api/test",
    params: {},
    ip: "127.0.0.1",
    header: () => undefined,
    requestId: "test-request",
    ...(role
      ? {
          actor: {
            id: "u1",
            email: "a@b.c",
            name: "A",
            role,
            sessionId: "s1",
            permissions: permissionsFor(role),
          },
        }
      : {}),
  };

  const reflector = new Reflector();
  jest
    .spyOn(reflector, "getAllAndOverride")
    .mockImplementation(((key: string) => metadata[key]) as never);

  const context = {
    getType: () => "http",
    getHandler: () => function handler() {},
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;

  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return {
    guard: new PermissionsGuard(reflector, audit as never),
    context,
    request,
    audit,
  };
}

describe("PermissionsGuard", () => {
  it("refuses a route that declares no permission, even for an administrator", async () => {
    const { guard, context } = contextFor("ADMIN", {});
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("refuses an empty permission list, which is the same mistake written differently", async () => {
    const { guard, context } = contextFor("ADMIN", {
      [PERMISSIONS_ALL_KEY]: [],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("allows a public route with no actor", () => {
    const { guard, context } = contextFor(null, { [IS_PUBLIC_KEY]: true });
    return expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("demands a session on any non-public route", async () => {
    const { guard, context } = contextFor(null, {
      [PERMISSIONS_ALL_KEY]: [P.LESSON_READ],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it("requires every permission in an all-list, not merely one", async () => {
    const { guard, context } = contextFor("INSTRUCTOR", {
      [PERMISSIONS_ALL_KEY]: [P.REVIEW_APPROVE, P.CREDENTIAL_ISSUE],
    });
    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );
  });

  it("accepts one of an any-list", async () => {
    const { guard, context } = contextFor("MANAGER", {
      [PERMISSIONS_ANY_KEY]: [
        P.SUBMISSION_READ_ASSIGNED,
        P.SUBMISSION_READ_ALL,
      ],
    });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it("records what was demanded, so the audit entry can state it", async () => {
    const { guard, context, request } = contextFor("INSTRUCTOR", {
      [PERMISSIONS_ALL_KEY]: [P.REVIEW_APPROVE],
    });
    await guard.canActivate(context);
    expect(request.requiredPermissions).toEqual([P.REVIEW_APPROVE]);
  });

  describe("the prohibitions, at the guard rather than in the matrix", () => {
    const cases: Array<[Role, string]> = [
      ["STUDENT", P.ANSWER_KEY_READ],
      ["STUDENT", P.SUBMISSION_READ_ALL],
      ["STUDENT", P.REVIEW_APPROVE],
      ["STUDENT", P.CREDENTIAL_ISSUE],
      ["INSTRUCTOR", P.SUBMISSION_READ_ALL],
      ["INSTRUCTOR", P.CREDENTIAL_ISSUE],
      ["INSTRUCTOR", P.USER_ROLE_ASSIGN],
      ["MANAGER", P.REVIEW_APPROVE],
      ["MANAGER", P.REVIEW_GRADE],
      ["MANAGER", P.CREDENTIAL_ISSUE],
      ["MANAGER", P.PROGRAMME_PUBLISH],
      ["MANAGER", P.AUDIT_READ],
      ["ADMIN", P.REVIEW_APPROVE],
      ["ADMIN", P.ASSESSMENT_TAKE],
    ];

    it.each(cases)("refuses %s at %s", async (role, permission) => {
      const { guard, context } = contextFor(role, {
        [PERMISSIONS_ALL_KEY]: [permission],
      });
      await expect(guard.canActivate(context)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });
});

/**
 * Regression cover for a real gap.
 *
 * Nest runs guards before interceptors, so a refusal in this guard never
 * reached AuditInterceptor. The effect was that every successful action was
 * logged and every refused one was not -- exactly backwards for answering who
 * probed what.
 */
describe("a refusal is recorded", () => {
  it("writes a DENIED event when the role lacks the permission", async () => {
    const { guard, context, audit } = contextFor("MANAGER", {
      [PERMISSIONS_ALL_KEY]: [P.REVIEW_APPROVE],
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );

    expect(audit.record).toHaveBeenCalledTimes(1);
    const event = audit.record.mock.calls[0][0];
    expect(event.outcome).toBe("DENIED");
    expect(event.actorId).toBe("u1");
    expect(event.actorRole).toBe("MANAGER");
    expect(event.metadata.required).toEqual([P.REVIEW_APPROVE]);
    expect(event.metadata.reason).toBe("missing-required-permission");
  });

  it("writes a DENIED event when a route declares no permission at all", async () => {
    const { guard, context, audit } = contextFor("ADMIN", {});

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );

    const event = audit.record.mock.calls[0][0];
    expect(event.outcome).toBe("DENIED");
    expect(event.metadata.reason).toBe("route-declares-no-permission");
  });

  it("files the refusal under the route own audit action, so it sits beside the successes", async () => {
    const { guard, context, audit } = contextFor("MANAGER", {
      [PERMISSIONS_ALL_KEY]: [P.REVIEW_APPROVE],
      [AUDIT_KEY]: { action: "review.approve", resourceType: "submission" },
    });

    await expect(guard.canActivate(context)).rejects.toThrow(
      ForbiddenException,
    );

    const event = audit.record.mock.calls[0][0];
    expect(event.action).toBe("review.approve");
    expect(event.resourceType).toBe("submission");
  });

  it("records nothing when the role is permitted", async () => {
    const { guard, context, audit } = contextFor("INSTRUCTOR", {
      [PERMISSIONS_ALL_KEY]: [P.REVIEW_APPROVE],
    });

    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
