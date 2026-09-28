import {
  BadRequestException,
  ForbiddenException,
  HttpStatus,
} from "@nestjs/common";
import { PASSWORD_CHANGE_REQUIRED } from "@aim/contracts";
import { AllExceptionsFilter } from "../src/common/filters/all-exceptions.filter";

/**
 * What a refusal says on the wire.
 *
 * This exists because of a bug that typechecked perfectly and was only found
 * by driving the running system: SessionGuard threw a 403 carrying
 * `code: PASSWORD_CHANGE_REQUIRED`, the filter rebuilt the response body from
 * scratch, and the code was dropped on the floor. Every caller saw a bare
 * FORBIDDEN, identical to an ordinary permission refusal.
 *
 * Nothing was insecure -- the guard still refused. What broke was the web
 * application's ability to tell the two apart, so an account held at the
 * password screen would have been bounced from page to page with no way to
 * reach the screen that fixes it.
 */
function capture(exception: unknown) {
  const json = jest.fn();
  const status = jest.fn().mockReturnValue({ json });

  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({
        method: "GET",
        originalUrl: "/api/anything",
        requestId: "test-request",
      }),
    }),
  };

  new AllExceptionsFilter().catch(
    exception,
    host as unknown as Parameters<AllExceptionsFilter["catch"]>[1],
  );

  return { status: status.mock.calls[0][0], body: json.mock.calls[0][0] };
}

describe("a refusal that names itself", () => {
  it("carries a thrown code through to the response", () => {
    const { status, body } = capture(
      new ForbiddenException({
        statusCode: 403,
        code: PASSWORD_CHANGE_REQUIRED,
        message:
          "Your password must be changed before you can do anything else.",
      }),
    );

    expect(status).toBe(HttpStatus.FORBIDDEN);
    expect(body.error).toBe(PASSWORD_CHANGE_REQUIRED);
    expect(body.message).toContain("password");
  });

  /**
   * The distinction the web application acts on. If these two ever report the
   * same thing, a forced password change becomes an unexplained wall.
   */
  it("keeps a password hold distinguishable from an ordinary refusal", () => {
    const held = capture(
      new ForbiddenException({
        statusCode: 403,
        code: PASSWORD_CHANGE_REQUIRED,
        message: "held",
      }),
    );
    const refused = capture(new ForbiddenException("ADMIN does not hold x.y"));

    expect(held.status).toBe(refused.status);
    expect(held.body.error).not.toBe(refused.body.error);
    expect(refused.body.error).toBe("FORBIDDEN");
  });

  it("falls back to the status name when nothing names itself", () => {
    const { body } = capture(new BadRequestException("plain refusal"));
    expect(body.error).toBe("BAD_REQUEST");
    expect(body.message).toBe("plain refusal");
  });

  it("still passes a validation failure through as a list", () => {
    // class-validator throws with an array, and the password policy relies on
    // it: a form that shows one broken rule at a time is a guessing game.
    const { body } = capture(
      new BadRequestException(["too short", "too obvious"]),
    );
    expect(body.message).toEqual(["too short", "too obvious"]);
  });

  it("never leaks internal detail from an unexpected throw", () => {
    const { status, body } = capture(new Error("connection string: secret"));
    expect(status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(body)).not.toContain("secret");
  });
});
