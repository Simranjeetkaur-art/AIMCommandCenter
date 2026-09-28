import {
  FAILURE_WINDOW_MS,
  LOCKOUT_MS,
  LoginThrottle,
  MAX_FAILURES_PER_ORIGIN,
} from "../src/modules/auth/login-throttle";
import {
  hashResetToken,
  hashSessionToken,
  issueResetToken,
  issueSessionToken,
} from "../src/common/auth/session-token";

/**
 * The per-origin brake.
 *
 * The per-address half of this class is gone: it is `User.failedLoginCount`
 * and `User.lockedUntil` in the database now, where an administrator can see
 * it and clear it. What is left here is the thing a per-account column cannot
 * do, which is notice one machine sweeping many different accounts.
 */
describe("LoginThrottle", () => {
  let now: number;
  let throttle: LoginThrottle;

  beforeEach(() => {
    now = 1_700_000_000_000;
    jest.spyOn(Date, "now").mockImplementation(() => now);
    throttle = new LoginThrottle();
  });

  afterEach(() => jest.restoreAllMocks());

  const sweep = (times: number, ip = "10.0.0.9") => {
    for (let i = 0; i < times; i += 1) throttle.recordFailure(ip);
  };

  it("lets a caller through before the limit is reached", () => {
    sweep(MAX_FAILURES_PER_ORIGIN - 1);
    expect(throttle.retryAfterMs("10.0.0.9")).toBeNull();
  });

  /**
   * The whole point of counting by origin: an attacker spreading guesses
   * across many accounts never trips any single account's limit, so without
   * this the sweep is unopposed.
   */
  it("locks an origin that sweeps many different addresses", () => {
    sweep(MAX_FAILURES_PER_ORIGIN);
    const wait = throttle.retryAfterMs("10.0.0.9");
    expect(wait).not.toBeNull();
    expect(wait).toBeLessThanOrEqual(LOCKOUT_MS);
  });

  it("does not lock an unrelated origin", () => {
    sweep(MAX_FAILURES_PER_ORIGIN);
    expect(throttle.retryAfterMs("10.0.0.8")).toBeNull();
  });

  it("releases the lock once it lapses", () => {
    sweep(MAX_FAILURES_PER_ORIGIN);
    now += LOCKOUT_MS + 1;
    expect(throttle.retryAfterMs("10.0.0.9")).toBeNull();
  });

  it("forgets failures that fall outside the window", () => {
    sweep(MAX_FAILURES_PER_ORIGIN - 1);
    now += FAILURE_WINDOW_MS + 1;
    throttle.recordFailure("10.0.0.9");
    expect(throttle.retryAfterMs("10.0.0.9")).toBeNull();
  });

  it("answers the same for an origin that has never been seen", () => {
    expect(throttle.retryAfterMs("10.0.0.1")).toBeNull();
  });

  /**
   * A request with no address is not throttled here, and that is deliberate.
   * The per-account lock still applies to it, and refusing everything that
   * arrives without an address would take the system down behind a proxy that
   * stopped forwarding one.
   */
  it("does not throttle, or crash on, a request with no origin", () => {
    for (let i = 0; i < MAX_FAILURES_PER_ORIGIN * 2; i += 1) {
      throttle.recordFailure(null);
    }
    expect(throttle.retryAfterMs(null)).toBeNull();
  });
});

/**
 * Session tokens and reset tokens are both looked up by hash, and both live in
 * tables an attacker would love to cross. These assertions are the reason they
 * cannot be crossed.
 */
describe("token domain separation", () => {
  const OLD_SECRET = process.env.SESSION_SECRET;

  beforeAll(() => {
    process.env.SESSION_SECRET = "test-secret";
  });
  afterAll(() => {
    process.env.SESSION_SECRET = OLD_SECRET;
  });

  it("hashes the same string differently for a session and for a reset", () => {
    const value = "the-same-opaque-string";
    expect(hashResetToken(value)).not.toEqual(hashSessionToken(value));
  });

  /**
   * The property that matters, stated as the attack it prevents: a stolen
   * session token presented at the password-reset endpoint must not match a
   * reset row, and a reset token must not work as a bearer credential.
   */
  it("gives a stolen session token no purchase on the reset table", () => {
    const sessionToken = issueSessionToken();
    expect(hashResetToken(sessionToken)).not.toEqual(
      hashSessionToken(sessionToken),
    );
  });

  it("gives a reset token no purchase on the session table", () => {
    const resetToken = issueResetToken();
    expect(hashSessionToken(resetToken)).not.toEqual(
      hashResetToken(resetToken),
    );
  });

  it("issues tokens that do not repeat", () => {
    const issued = new Set(
      Array.from({ length: 200 }, () => issueSessionToken()),
    );
    expect(issued.size).toBe(200);

    const resets = new Set(
      Array.from({ length: 200 }, () => issueResetToken()),
    );
    expect(resets.size).toBe(200);
  });

  it("makes a reset token longer than a session token", () => {
    // It travels through mail, which has more places to sit than a cookie jar.
    expect(issueResetToken().length).toBeGreaterThan(
      issueSessionToken().length,
    );
  });

  it("is deterministic, or nothing could ever be looked up", () => {
    const value = issueResetToken();
    expect(hashResetToken(value)).toEqual(hashResetToken(value));
  });
});
