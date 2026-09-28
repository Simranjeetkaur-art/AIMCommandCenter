import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Session tokens are opaque, not JWTs.
 *
 * A JWT would have to be trusted until it expired; an opaque token is looked
 * up, so suspending an account or revoking a session takes effect on the next
 * request. Only the hash is stored, so a database leak yields nothing
 * replayable.
 */
export function issueSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHash("sha256").update(`${token}.${secret}`).digest("hex");
}

/**
 * A one-time credential for setting a password without knowing the old one.
 *
 * Longer than a session token because it travels through mail, which is a
 * medium with more places to sit than a cookie jar.
 */
export function issueResetToken(): string {
  return randomBytes(48).toString("base64url");
}

/**
 * Hashed under its own domain, which is the whole reason this is a separate
 * function rather than a second caller of `hashSessionToken`.
 *
 * Both tables are looked up by hash. Sharing the hash construction would mean
 * a stolen session token could be presented at the password-reset endpoint and
 * matched against a reset row, and a reset token could be presented as a
 * bearer credential. The two values now live in different spaces and neither
 * can be mistaken for the other, whatever a caller sends.
 */
export function hashResetToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHash("sha256")
    .update(`password-reset.${token}.${secret}`)
    .digest("hex");
}

export function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Proof that an address reaches the person who typed it.
 *
 * Its own domain, for the reason given above `hashResetToken`: a verification
 * link and a reset link both arrive by mail and both are spent at a public
 * endpoint, so if they shared a hash space, clicking one could be made to
 * satisfy the other. Verifying an address must never set a password.
 */
export function issueVerificationToken(): string {
  return randomBytes(48).toString("base64url");
}

export function hashVerificationToken(token: string): string {
  const secret = process.env.SESSION_SECRET ?? "";
  return createHash("sha256")
    .update(`email-verification.${token}.${secret}`)
    .digest("hex");
}
