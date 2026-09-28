/**
 * Enrolling yourself.
 *
 * Everyone else on this system was created by an administrator, who chose the
 * role and typed a temporary password. Self-enrolment has no such person in
 * the loop, so the controls that person represented have to be written down
 * instead. They are here, in the contract package, because the form that
 * collects the details and the server that refuses them must apply the same
 * rule -- a page that accepts what the API rejects is two products.
 *
 * Three controls, in order of how much they matter:
 *
 *  1. The role is not an input. It is fixed at STUDENT below, and the server
 *     never reads a role off the request. A field an attacker can set to
 *     "ADMIN" is not a field with a validation problem; it is a privilege
 *     escalation with a form in front of it.
 *  2. The door can be closed. `SELF_REGISTRATION_FLAG` is a feature flag an
 *     administrator can turn off without a deploy, because "stop letting
 *     strangers in" is not a request that can wait for one.
 *  3. Nobody may do it in bulk. The origin limit below is deliberately far
 *     tighter than the sign-in one: a person enrols once, so a machine
 *     enrolling five times in an hour is not a person.
 */

import { checkPassword, type PasswordVerdict } from "./password";

/**
 * The flag that opens and closes the door.
 *
 * Absent means open. The feature was asked for, so a fresh database should
 * have it working rather than silently off until somebody discovers a row is
 * missing -- but the moment an administrator sets it either way, the row
 * decides.
 */
export const SELF_REGISTRATION_FLAG = "registration.selfService";

/**
 * What somebody who enrols themselves becomes, and the only thing they can.
 *
 * A student holds no authority over anybody else's record. Every other role
 * carries powers -- creating users, publishing programmes, judging a
 * candidate, binding a diagnostic to a registered agent -- that somebody
 * accountable has to grant deliberately.
 */
export const SELF_REGISTRATION_ROLE = "STUDENT" as const;

/** How many accounts one origin may create before it is made to wait. */
export const REGISTRATION_LIMIT_PER_ORIGIN = 5;

export interface RegistrationDetails {
  name: string;
  email: string;
  password: string;
}

export interface RegistrationVerdict extends PasswordVerdict {
  /** The address, folded to lower case, ready to store. */
  email: string;
  /** The name with its edges trimmed. */
  name: string;
}

export const MIN_NAME_LENGTH = 2;
export const MAX_NAME_LENGTH = 120;
export const MAX_EMAIL_LENGTH = 254;

/**
 * Deliberately permissive. Address validity is decided by whether mail to it
 * arrives, not by a regular expression, and every clever pattern rejects
 * somebody's real address. This catches what is plainly not an address and
 * leaves the rest alone.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@.]+\.[^\s@]+$/;

/**
 * Checks a proposed enrolment, and returns every problem rather than the
 * first, for the same reason `checkPassword` does.
 */
export function checkRegistration(
  details: RegistrationDetails,
): RegistrationVerdict {
  const name = details.name.trim();
  const email = details.email.trim().toLowerCase();
  const problems: string[] = [];

  if (name.length < MIN_NAME_LENGTH) {
    problems.push("Give the name you want on your record and credentials.");
  } else if (name.length > MAX_NAME_LENGTH) {
    problems.push(`Keep the name under ${MAX_NAME_LENGTH} characters.`);
  }

  if (email.length > MAX_EMAIL_LENGTH) {
    problems.push(`Keep the address under ${MAX_EMAIL_LENGTH} characters.`);
  } else if (!EMAIL_SHAPE.test(email)) {
    problems.push("That does not look like an email address.");
  }

  // The password is held to exactly the rule every other password on this
  // system is held to, checked against the name and address being registered
  // so the very first password cannot simply be the address it signs in with.
  problems.push(...checkPassword(details.password, { email, name }).problems);

  return { ok: problems.length === 0, problems, email, name };
}
