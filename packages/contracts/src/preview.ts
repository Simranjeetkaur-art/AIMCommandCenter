import { PERMISSIONS as P, type Permission } from "./permissions";
import { permissionsFor, type Role } from "./roles";

/**
 * Seeing the system as another role sees it.
 *
 * An administrator needs to check that the instructor's screens are right
 * without asking an instructor for their password. The obvious way to build
 * that is impersonation -- act as someone else -- and it is the wrong way:
 * it breaks the one rule the audit log depends on, that the person who did a
 * thing is the person recorded as having done it. There is no
 * `actor.impersonate` anywhere in this vocabulary, and preview is not it.
 *
 * Preview instead *narrows*. While it is on, the actor holds the previewed
 * role's read permissions and nothing else -- strictly less authority than
 * they normally have, never more. Their identity does not change: every
 * request is still theirs, and every audit record still names them.
 *
 * Two independent locks make it safe:
 *
 *  1. Only permissions in `PREVIEW_LENDABLE` are ever held during a preview,
 *     and every one of them is a read.
 *  2. Every request that is not a read is refused outright while a preview is
 *     on, whatever permissions say. So even a mistake in the list above
 *     cannot turn into a write.
 */
export const PREVIEW_LENDABLE: readonly Permission[] = Object.freeze([
  P.LESSON_READ,
  P.PROGRAMME_READ,
  P.ASSESSMENT_READ,
  P.BADGE_READ,
  P.COHORT_READ,
  P.QUESTION_BANK_READ,
  P.SETTINGS_READ,
  P.USER_READ,
  P.REPORT_READ,
  P.PROGRESS_READ_SELF,
  P.PROGRESS_READ_ASSIGNED,
  P.PROGRESS_READ_ALL,
  P.SUBMISSION_READ_SELF,
  P.SUBMISSION_READ_ASSIGNED,
  P.SUBMISSION_READ_ALL,
  P.REVIEW_QUEUE_READ,
  P.REVIEW_TURNAROUND_READ,
  P.LEARNER_NOTE_READ,
  P.CREDENTIAL_READ_SELF,
  P.CREDENTIAL_READ_ALL,
  P.AGENT_READ,
  P.DIAGNOSTIC_READ_SELF,
  P.DIAGNOSTIC_READ_ALL,
  P.PRESCRIPTION_READ,
  P.PRESCRIPTION_CREATE,
  P.AUDIT_READ,
]);

/**
 * Deliberately absent from the list above, although each one reads something.
 *
 * `assessment.answerkey.read` is the boundary the whole student portal is
 * built around, and a preview is not a reason to relax it. The rest either
 * write, or decide something about a person.
 */
export const PREVIEW_WITHHELD: readonly Permission[] = Object.freeze([
  P.ANSWER_KEY_READ,
  P.ASSESSMENT_TAKE,
  P.PROGRESS_WRITE_SELF,
  P.SUBMISSION_CREATE_SELF,
  P.SUBMISSION_RESUBMIT_SELF,
  P.REVIEW_CLAIM,
  P.REVIEW_APPROVE,
  P.REVIEW_RETURN,
  P.REVIEW_GRADE,
  P.REVIEW_REASSIGN,
  P.BADGE_AWARD,
  P.BADGE_REVOKE,
  P.CREDENTIAL_ISSUE,
  P.LEARNER_NOTE_CREATE,
  P.DIAGNOSTIC_CREATE,
  P.DIAGNOSTIC_BIND_AGENT,
  // Acts on somebody else's account. A preview is for looking at a portal, and
  // ending another person's session is not a thing you do by looking.
  P.USER_PASSWORD_RESET,
  P.USER_SESSION_REVOKE,
]);

/**
 * What the actor holds while previewing `role`.
 *
 * The previewed role's permissions, filtered to the reads. Note what this is
 * not: it is not the actor's own permissions with anything added. Whatever
 * they normally hold is set aside for the duration.
 */
export function previewPermissionsFor(role: Role): readonly Permission[] {
  const lendable = new Set<string>(PREVIEW_LENDABLE);
  return Object.freeze(permissionsFor(role).filter((p) => lendable.has(p)));
}

/**
 * Whether one role may preview another.
 *
 * Previewing your own role is refused because it would do nothing except
 * quietly remove your ability to write, which is a confusing thing for a
 * button to do.
 */
export function canPreview(actorRole: Role, target: Role): boolean {
  return actorRole !== target;
}
