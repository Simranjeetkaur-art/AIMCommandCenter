import { PERMISSIONS as P, type Permission } from "./permissions";

export const ROLES = {
  STUDENT: "STUDENT",
  INSTRUCTOR: "INSTRUCTOR",
  MANAGER: "MANAGER",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];
export const ALL_ROLES: readonly Role[] = Object.freeze(
  Object.values(ROLES) as Role[],
);

/** The candidate. Sees their own record, and nothing that belongs to anyone else. */
const STUDENT: readonly Permission[] = [
  P.LESSON_READ,
  P.PROGRAMME_READ,
  P.ASSESSMENT_READ,
  P.ASSESSMENT_TAKE,
  P.PROGRESS_READ_SELF,
  P.PROGRESS_WRITE_SELF,
  P.SUBMISSION_CREATE_SELF,
  P.SUBMISSION_READ_SELF,
  P.SUBMISSION_RESUBMIT_SELF,
  P.CREDENTIAL_READ_SELF,
  P.BADGE_READ,
  P.MESSAGE_USE,
  // A candidate may read what their examiner wrote about them, once it is
  // released. They assess nobody: there is no rung below them.
  P.PERFORMANCE_READ_SELF,
  // Dx and Rx are the craft being taught, so a candidate practises them. Their
  // diagnostics are their own: no registry agent, and nobody else's work.
  P.DIAGNOSTIC_CREATE,
  P.DIAGNOSTIC_READ_SELF,
  P.PRESCRIPTION_CREATE,
  P.PRESCRIPTION_READ,
];

/** The examiner. Sees only the learners assigned to them, and judges their work. */
const INSTRUCTOR: readonly Permission[] = [
  P.LESSON_READ,
  P.PROGRAMME_READ,
  P.ASSESSMENT_READ,
  P.PROGRESS_READ_ASSIGNED,
  P.SUBMISSION_READ_ASSIGNED,
  P.REVIEW_QUEUE_READ,
  P.REVIEW_CLAIM,
  P.REVIEW_APPROVE,
  P.REVIEW_RETURN,
  P.REVIEW_GRADE,
  // The examiner who marks a learner's work decides whether they get another
  // attempt at a paper they have exhausted -- for their own learners only.
  P.ATTEMPT_GRANT,
  P.LEARNER_NOTE_CREATE,
  P.LEARNER_NOTE_READ,
  // An examiner assesses the candidates assigned to them, and reads what
  // their own manager wrote about them.
  P.PERFORMANCE_WRITE,
  P.PERFORMANCE_READ_SELF,
  P.PERFORMANCE_READ_CHAIN,
  P.CREDENTIAL_READ_SELF,
  P.BADGE_READ,
  P.MESSAGE_USE,
  // A judgement badge is awarded by the person who judged the work.
  P.BADGE_AWARD,
  // An examiner reads the registry because they mark work about it, and runs
  // their own diagnostics. They do not alter the register itself.
  P.AGENT_READ,
  P.DIAGNOSTIC_CREATE,
  P.DIAGNOSTIC_READ_SELF,
  P.PRESCRIPTION_CREATE,
  P.PRESCRIPTION_READ,
];

/** The programme manager. Builds and runs the academy, but never judges a candidate. */
const MANAGER: readonly Permission[] = [
  P.LESSON_READ,
  P.PROGRAMME_READ,
  P.PROGRAMME_CREATE,
  P.PROGRAMME_UPDATE,
  P.MODULE_WRITE,
  P.LESSON_WRITE,
  P.QUESTION_WRITE,
  P.QUESTION_BANK_READ,
  P.ANSWER_KEY_READ,
  P.ASSESSMENT_READ,
  P.ASSESSMENT_WRITE,
  P.COHORT_READ,
  P.COHORT_WRITE,
  P.ENROLLMENT_WRITE,
  P.INSTRUCTOR_ASSIGN,
  P.PROGRESS_READ_ALL,
  P.SUBMISSION_READ_ALL,
  P.LEARNER_NOTE_READ,
  P.REPORT_READ,
  P.REVIEW_TURNAROUND_READ,
  P.REVIEW_REASSIGN,
  // Running the academy includes letting a stuck learner try again. Deciding
  // a chance is not judging the work, which stays with the examiner.
  P.ATTEMPT_GRANT,
  // A manager assesses the examiners, and sees down the chain from them —
  // which is what makes "your examiner marks inconsistently" checkable.
  P.PERFORMANCE_WRITE,
  P.PERFORMANCE_READ_SELF,
  P.PERFORMANCE_READ_CHAIN,
  P.USER_READ,
  P.SETTINGS_READ,
  P.CREDENTIAL_READ_SELF,
  // Reading the credential register and checking a certificate by its serial.
  // Issuing, suspending and revoking stay with the administrator.
  P.CREDENTIAL_READ_ALL,
  P.BADGE_READ,
  P.MESSAGE_USE,
  // Defining what a badge means, and the condition that earns it, is academy
  // building. Awarding one by hand is not, and stays with the examiner.
  P.BADGE_WRITE,
  P.CONTENT_DELETE,
  // Hiding a module and setting what opens a track are academy building.
  P.CONTENT_VISIBILITY,
  P.UNLOCK_RULE_WRITE,
  P.COHORT_ARCHIVE,
  // The registry is enterprise governance: the manager keeps it, and binds a
  // diagnostic to an agent, which is what changes that agent's recorded AAI.
  P.AGENT_READ,
  P.AGENT_WRITE,
  P.DIAGNOSTIC_CREATE,
  P.DIAGNOSTIC_READ_SELF,
  P.DIAGNOSTIC_READ_ALL,
  P.DIAGNOSTIC_BIND_AGENT,
  P.PRESCRIPTION_CREATE,
  P.PRESCRIPTION_READ,
];

/** The institution. Full authority — and every action written to the audit log. */
const ADMIN: readonly Permission[] = [
  ...MANAGER,
  P.PROGRAMME_PUBLISH,
  P.USER_CREATE,
  P.USER_ROLE_ASSIGN,
  P.USER_SUSPEND,
  P.CREDENTIAL_ISSUE,
  P.CREDENTIAL_SUSPEND,
  P.CREDENTIAL_REVOKE,
  P.CREDENTIAL_REINSTATE,
  P.SETTINGS_WRITE,
  P.FEATURE_FLAG_WRITE,
  P.PORTAL_CONFIGURE,
  P.BRANDING_WRITE,
  // Mail is the institution speaking in its own name, to people who did not
  // ask this system for anything. A manager builds the academy; they do not
  // decide what address it writes from.
  P.MAIL_CONFIG_READ,
  P.MAIL_CONFIG_WRITE,
  P.MAIL_TEST,
  P.AUDIT_READ,
  P.AUDIT_EXPORT,
  // Retiring an agent ends a governed system's authority record. Institution only.
  P.AGENT_RETIRE,
  // Withdrawing an award is an institution act, like revoking a credential.
  // Granting one is not: that stays with the examiner who judged the work,
  // for the same reason review.approve does.
  P.BADGE_REVOKE,
  // Identity is the institution's to correct and to close. There is no
  // user.delete anywhere in the vocabulary: archiving keeps the account out of
  // the way while the audit events it caused keep naming it.
  P.USER_UPDATE,
  P.USER_ARCHIVE,
  // Helping somebody back into their own account, and ending a session on a
  // device they no longer hold. Both are institution acts for the same reason
  // archiving is: they decide, from outside, what an account may do next.
  P.USER_PASSWORD_RESET,
  P.USER_SESSION_REVOKE,
  // Seeing the system as another role sees it, read-only and recorded.
  P.ROLE_PREVIEW,
  // Letting one named candidate past a gate, and what a certificate says.
  P.TRACK_GRANT_WRITE,
  P.CERTIFICATE_TEMPLATE_WRITE,
];

const freeze = (list: readonly Permission[]) =>
  Object.freeze([...new Set(list)]) as readonly Permission[];

export const ROLE_PERMISSIONS: Readonly<Record<Role, readonly Permission[]>> =
  Object.freeze({
    STUDENT: freeze(STUDENT),
    INSTRUCTOR: freeze(INSTRUCTOR),
    MANAGER: freeze(MANAGER),
    ADMIN: freeze(ADMIN),
  });

export function permissionsFor(role: Role): readonly Permission[] {
  return ROLE_PERMISSIONS[role] ?? [];
}

export function roleHas(role: Role, permission: Permission): boolean {
  return permissionsFor(role).includes(permission);
}

/** All of `required` must be held. An empty requirement list is never satisfied. */
export function roleHasAll(
  role: Role,
  required: readonly Permission[],
): boolean {
  if (required.length === 0) return false;
  return required.every((p) => roleHas(role, p));
}
