import { SetMetadata } from "@nestjs/common";

export const ALLOWED_WHILE_PROFILE_INCOMPLETE = "aim:allowedWhileProfileIncomplete";

/**
 * Marks the few routes that still answer while an account is held at the
 * profile screen.
 *
 * A student, instructor or manager whose profile is incomplete has a valid
 * session and no authority: SessionGuard refuses every route but these, for
 * the same reason it holds an account at the password screen. The exceptions
 * are the ones the profile screen needs to draw itself and to clear the hold:
 *
 *   GET  /auth/me          who you are, and why you are being held here
 *   POST /auth/logout      the way out
 *   GET  /auth/sessions    what else is signed in as you
 *   POST /auth/password    changing your password is never blocked
 *   GET  /me/profile       the profile as it stands
 *   PUT  /me/profile       the act that lifts the hold
 */
export const AllowedWhileProfileIncomplete = () =>
  SetMetadata(ALLOWED_WHILE_PROFILE_INCOMPLETE, true);
