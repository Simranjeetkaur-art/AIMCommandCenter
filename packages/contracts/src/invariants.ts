import { PERMISSIONS as P, type Permission } from "./permissions";
import { type Role } from "./roles";

/**
 * The "cannot do" column, as data.
 *
 * The interesting question in a system like this is never what a role can do.
 * It is what a role must never be able to do, however the matrix is later
 * edited. Each entry below is asserted by the contract test suite and again by
 * the API guard tests, so a well-meaning widening of the matrix fails the
 * build instead of quietly granting authority in production.
 */
export interface Prohibition {
  readonly role: Role;
  readonly permission: Permission;
  readonly because: string;
}

export const PROHIBITIONS: readonly Prohibition[] = Object.freeze([
  // Student -----------------------------------------------------------------
  {
    role: "STUDENT",
    permission: P.PROGRESS_READ_ASSIGNED,
    because: "sees no learner but themselves",
  },
  {
    role: "STUDENT",
    permission: P.PROGRESS_READ_ALL,
    because: "sees no learner but themselves",
  },
  {
    role: "STUDENT",
    permission: P.SUBMISSION_READ_ASSIGNED,
    because: "sees no learner but themselves",
  },
  {
    role: "STUDENT",
    permission: P.SUBMISSION_READ_ALL,
    because: "sees no learner but themselves",
  },
  {
    role: "STUDENT",
    permission: P.USER_READ,
    because: "sees no learner but themselves",
  },
  {
    role: "STUDENT",
    permission: P.ANSWER_KEY_READ,
    because: "must never see an answer key",
  },
  {
    role: "STUDENT",
    permission: P.QUESTION_BANK_READ,
    because: "a question bank exposes answer keys",
  },
  {
    role: "STUDENT",
    permission: P.REVIEW_GRADE,
    because: "cannot alter a score",
  },
  {
    role: "STUDENT",
    permission: P.REVIEW_APPROVE,
    because: "cannot alter a completion record",
  },
  {
    role: "STUDENT",
    permission: P.ATTEMPT_GRANT,
    because: "cannot give themselves another attempt",
  },
  {
    role: "STUDENT",
    permission: P.CREDENTIAL_ISSUE,
    because: "cannot alter a badge or a credential",
  },
  {
    role: "STUDENT",
    permission: P.REVIEW_QUEUE_READ,
    because: "cannot reach an instructor screen",
  },
  {
    role: "STUDENT",
    permission: P.REPORT_READ,
    because: "cannot reach a manager screen",
  },
  {
    role: "STUDENT",
    permission: P.AUDIT_READ,
    because: "cannot reach an administration screen",
  },
  {
    role: "STUDENT",
    permission: P.SETTINGS_WRITE,
    because: "cannot reach an administration screen",
  },
  {
    role: "STUDENT",
    permission: P.AGENT_READ,
    because: "the registry is the enterprise record, not coursework",
  },
  {
    role: "STUDENT",
    permission: P.AGENT_WRITE,
    because: "cannot alter a governed system record",
  },
  {
    role: "STUDENT",
    permission: P.DIAGNOSTIC_READ_ALL,
    because: "practises Dx on their own work only",
  },
  {
    role: "STUDENT",
    permission: P.DIAGNOSTIC_BIND_AGENT,
    because: "a practice score must never change a real agent AAI",
  },
  {
    role: "STUDENT",
    permission: P.BADGE_WRITE,
    because: "cannot define what earns a badge",
  },
  {
    role: "STUDENT",
    permission: P.BADGE_AWARD,
    because: "cannot award themselves a badge",
  },
  {
    role: "STUDENT",
    permission: P.PERFORMANCE_WRITE,
    because: "there is no rung below a candidate to assess",
  },
  {
    role: "STUDENT",
    permission: P.PERFORMANCE_READ_CHAIN,
    because: "sees no record but their own",
  },
  {
    role: "STUDENT",
    permission: P.CONTENT_DELETE,
    because: "cannot alter the syllabus",
  },
  {
    role: "STUDENT",
    permission: P.CONTENT_VISIBILITY,
    because: "cannot alter the syllabus",
  },
  {
    role: "STUDENT",
    permission: P.UNLOCK_RULE_WRITE,
    because: "cannot decide what opens a track",
  },
  {
    role: "STUDENT",
    permission: P.TRACK_GRANT_WRITE,
    because: "cannot let themselves past a gate",
  },
  {
    role: "STUDENT",
    permission: P.ROLE_PREVIEW,
    because: "sees no view but their own",
  },
  {
    role: "STUDENT",
    permission: P.USER_UPDATE,
    because: "does not administer accounts",
  },
  {
    role: "STUDENT",
    permission: P.USER_PASSWORD_RESET,
    because: "may change their own password and nobody else's",
  },
  {
    role: "STUDENT",
    permission: P.USER_SESSION_REVOKE,
    because: "may end their own sessions and nobody else's",
  },

  // Instructor --------------------------------------------------------------
  {
    role: "INSTRUCTOR",
    permission: P.PROGRESS_READ_ALL,
    because: "sees only assigned learners",
  },
  {
    role: "INSTRUCTOR",
    permission: P.SUBMISSION_READ_ALL,
    because: "sees only assigned learners",
  },
  {
    role: "INSTRUCTOR",
    permission: P.CREDENTIAL_ISSUE,
    because: "does not issue a credential",
  },
  {
    role: "INSTRUCTOR",
    permission: P.CREDENTIAL_SUSPEND,
    because: "does not suspend a credential",
  },
  {
    role: "INSTRUCTOR",
    permission: P.CREDENTIAL_REVOKE,
    because: "does not revoke a credential",
  },
  {
    role: "INSTRUCTOR",
    permission: P.CREDENTIAL_REINSTATE,
    because: "does not reinstate a credential",
  },
  {
    role: "INSTRUCTOR",
    permission: P.USER_CREATE,
    because: "does not create users",
  },
  {
    role: "INSTRUCTOR",
    permission: P.USER_ROLE_ASSIGN,
    because: "does not change a role",
  },
  {
    role: "INSTRUCTOR",
    permission: P.ENROLLMENT_WRITE,
    because: "does not run the academy",
  },
  {
    role: "INSTRUCTOR",
    permission: P.INSTRUCTOR_ASSIGN,
    because: "cannot assign learners to themselves",
  },
  {
    role: "INSTRUCTOR",
    permission: P.PROGRAMME_PUBLISH,
    because: "does not run the academy",
  },
  {
    role: "INSTRUCTOR",
    permission: P.AUDIT_READ,
    because: "cannot reach an administration screen",
  },
  // An examiner judges written work, which has no key. Machine-marked papers
  // are marked by the server, so handing the examiner the key would add
  // authority nothing in their job requires.
  {
    role: "INSTRUCTOR",
    permission: P.ANSWER_KEY_READ,
    because: "judges written work, which has no key",
  },
  {
    role: "INSTRUCTOR",
    permission: P.QUESTION_BANK_READ,
    because: "a question bank exposes answer keys",
  },
  {
    role: "INSTRUCTOR",
    permission: P.BADGE_WRITE,
    because: "awards badges, does not define them",
  },
  {
    role: "INSTRUCTOR",
    permission: P.BADGE_REVOKE,
    because: "withdrawing an award is an institution act",
  },
  {
    role: "INSTRUCTOR",
    permission: P.CONTENT_DELETE,
    because: "does not build the academy",
  },
  {
    role: "INSTRUCTOR",
    permission: P.CONTENT_VISIBILITY,
    because: "does not build the academy",
  },
  {
    role: "INSTRUCTOR",
    permission: P.UNLOCK_RULE_WRITE,
    because: "does not decide what opens a track",
  },
  {
    role: "INSTRUCTOR",
    permission: P.TRACK_GRANT_WRITE,
    because: "cannot let a learner past a gate",
  },
  {
    role: "INSTRUCTOR",
    permission: P.ROLE_PREVIEW,
    because: "sees only their assigned learners",
  },
  {
    role: "INSTRUCTOR",
    permission: P.USER_UPDATE,
    because: "does not administer accounts",
  },
  {
    role: "INSTRUCTOR",
    permission: P.USER_PASSWORD_RESET,
    because: "may change their own password and nobody else's",
  },
  {
    role: "INSTRUCTOR",
    permission: P.USER_SESSION_REVOKE,
    because: "may end their own sessions and nobody else's",
  },
  {
    role: "INSTRUCTOR",
    permission: P.AGENT_WRITE,
    because: "reads the registry, does not keep it",
  },
  {
    role: "INSTRUCTOR",
    permission: P.AGENT_RETIRE,
    because: "reads the registry, does not keep it",
  },
  {
    role: "INSTRUCTOR",
    permission: P.DIAGNOSTIC_READ_ALL,
    because: "sees only assigned learners",
  },
  {
    role: "INSTRUCTOR",
    permission: P.DIAGNOSTIC_BIND_AGENT,
    because: "does not change an agent recorded AAI",
  },

  // Manager -----------------------------------------------------------------
  {
    role: "MANAGER",
    permission: P.REVIEW_APPROVE,
    because: "builds the academy, never judges",
  },
  {
    role: "MANAGER",
    permission: P.REVIEW_RETURN,
    because: "builds the academy, never judges",
  },
  {
    role: "MANAGER",
    permission: P.REVIEW_GRADE,
    because: "builds the academy, never judges",
  },
  {
    role: "MANAGER",
    permission: P.REVIEW_CLAIM,
    because: "builds the academy, never judges",
  },
  {
    role: "MANAGER",
    permission: P.LEARNER_NOTE_CREATE,
    because: "a learner comment is an examiner act",
  },
  {
    role: "MANAGER",
    permission: P.CREDENTIAL_ISSUE,
    because: "does not issue a credential",
  },
  {
    role: "MANAGER",
    permission: P.CREDENTIAL_SUSPEND,
    because: "does not suspend a credential",
  },
  {
    role: "MANAGER",
    permission: P.CREDENTIAL_REVOKE,
    because: "does not revoke a credential",
  },
  {
    role: "MANAGER",
    permission: P.CREDENTIAL_REINSTATE,
    because: "does not reinstate a credential",
  },
  {
    role: "MANAGER",
    permission: P.PROGRAMME_PUBLISH,
    because: "publishing binds live candidates",
  },
  {
    role: "MANAGER",
    permission: P.USER_CREATE,
    because: "does not create users",
  },
  {
    role: "MANAGER",
    permission: P.USER_ROLE_ASSIGN,
    because: "does not change a role",
  },
  {
    role: "MANAGER",
    permission: P.USER_SUSPEND,
    because: "does not suspend an account",
  },
  {
    role: "MANAGER",
    permission: P.SETTINGS_WRITE,
    because: "does not change settings or flags",
  },
  {
    role: "MANAGER",
    permission: P.FEATURE_FLAG_WRITE,
    because: "does not change settings or flags",
  },
  {
    role: "MANAGER",
    permission: P.PORTAL_CONFIGURE,
    because: "does not configure portal areas",
  },
  {
    role: "MANAGER",
    permission: P.BRANDING_WRITE,
    because: "does not change branding",
  },
  {
    role: "MANAGER",
    permission: P.AUDIT_READ,
    because: "the audit log belongs to the institution",
  },
  {
    role: "MANAGER",
    permission: P.AGENT_RETIRE,
    because: "ending an authority record is an institution act",
  },
  // Defining what earns a badge is academy building. Deciding that a
  // particular candidate has earned one is judgement, and stays with the
  // examiner -- the same line that keeps review.approve away from a manager.
  {
    role: "MANAGER",
    permission: P.BADGE_AWARD,
    because: "never judges a candidate",
  },
  {
    role: "MANAGER",
    permission: P.BADGE_REVOKE,
    because: "withdrawing an award is an institution act",
  },
  {
    role: "MANAGER",
    permission: P.USER_UPDATE,
    because: "identity belongs to the institution",
  },
  {
    role: "MANAGER",
    permission: P.USER_ARCHIVE,
    because: "identity belongs to the institution",
  },
  {
    role: "MANAGER",
    permission: P.USER_PASSWORD_RESET,
    because: "identity belongs to the institution",
  },
  {
    role: "MANAGER",
    permission: P.USER_SESSION_REVOKE,
    because: "identity belongs to the institution",
  },
  {
    role: "MANAGER",
    permission: P.ROLE_PREVIEW,
    because: "the whole view belongs to the institution",
  },
  {
    role: "MANAGER",
    permission: P.TRACK_GRANT_WRITE,
    because: "an exception to a gate is an institution act",
  },
  {
    role: "MANAGER",
    permission: P.CERTIFICATE_TEMPLATE_WRITE,
    because: "what a certificate says is the institution speaking",
  },

  // Administrator -----------------------------------------------------------
  // Full authority over the institution. Judgement of a candidate is still an
  // examiner act: authority is not the same thing as standing to examine, and
  // an administrator who could also approve could manufacture a pass silently.
  {
    role: "ADMIN",
    permission: P.REVIEW_APPROVE,
    because: "judgement belongs to the examiner",
  },
  {
    role: "ADMIN",
    permission: P.REVIEW_RETURN,
    because: "judgement belongs to the examiner",
  },
  {
    role: "ADMIN",
    permission: P.REVIEW_GRADE,
    because: "judgement belongs to the examiner",
  },
  {
    role: "ADMIN",
    permission: P.REVIEW_CLAIM,
    because: "judgement belongs to the examiner",
  },
  {
    role: "ADMIN",
    permission: P.ASSESSMENT_TAKE,
    because: "the institution is not a candidate",
  },
  {
    role: "ADMIN",
    permission: P.BADGE_AWARD,
    because: "judgement belongs to the assigned examiner",
  },
]);

/**
 * Capabilities that exist nowhere in the permission vocabulary, for any role.
 * Listed so the intent is greppable, and asserted by the contract test suite.
 *
 *  - audit.update / audit.delete: the database refuses these writes outright
 *    (apps/api/prisma/sql/010_audit_append_only.sql). There is no API for them
 *    because there is no permission that could ever authorise one.
 *  - password.read: passwords are hashed with argon2id, never stored.
 *  - actor.impersonate: no path exists to act without being recorded as the
 *    actor. Every audited write carries a non-null actorId.
 *  - gate.bypass.silent: an administrator may override a requirement gate, but
 *    the override is stamped onto the credential itself and demands a reason.
 */
export const NON_EXISTENT_CAPABILITIES: readonly string[] = Object.freeze([
  "audit.update",
  "audit.delete",
  "password.read",
  "actor.impersonate",
  "gate.bypass.silent",
]);
