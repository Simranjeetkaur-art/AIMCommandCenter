import { SetMetadata } from "@nestjs/common";

export const ALLOWED_WHILE_PASSWORD_EXPIRED = "aim:allowedWhilePasswordExpired";

/**
 * Marks the few routes that still answer while an account is held at the
 * password screen.
 *
 * An account with `mustChangePassword` set has a valid session and no
 * authority: SessionGuard refuses every route but these. The exceptions exist
 * for the same reason the preview has one -- without them the screen that
 * clears the condition could not load, and the only way out of a forced reset
 * would be to sign out and back in, which changes nothing.
 *
 * There are four, and each is either the act of changing the password or a
 * read that screen needs to draw itself:
 *
 *   POST /auth/password    the act itself
 *   GET  /auth/me          who you are, and why you are being held here
 *   GET  /auth/sessions    what else is signed in as you, which is often
 *                          exactly what somebody wants to check at this moment
 *   POST /auth/logout      the way out that does not involve a password
 *
 * A fifth should be a decision somebody makes on purpose. Anything that is not
 * one of these is refused, whatever permissions the role holds.
 */
export const AllowedWhilePasswordExpired = () =>
  SetMetadata(ALLOWED_WHILE_PASSWORD_EXPIRED, true);
