/**
 * The complete permission vocabulary of AIM Command Center.
 *
 * Rules of this file:
 *  - A permission that does not appear here cannot be required by a route.
 *  - A route with no declared permission is REFUSED at runtime (fail closed).
 *  - Some capabilities are deliberately absent, because no role may ever hold
 *    them. `audit.update` and `audit.delete` do not exist; the database also
 *    refuses those writes. See `invariants.ts`.
 */
export const PERMISSIONS = {
  // ── Learning (consumption) ────────────────────────────────────────────────
  LESSON_READ: "lesson.read",
  PROGRESS_READ_SELF: "progress.read.self",
  PROGRESS_READ_ASSIGNED: "progress.read.assigned",
  PROGRESS_READ_ALL: "progress.read.all",
  PROGRESS_WRITE_SELF: "progress.write.self",

  // ── Assessment ────────────────────────────────────────────────────────────
  ASSESSMENT_READ: "assessment.read",
  ASSESSMENT_TAKE: "assessment.take",
  /** Reading the correct answers. Authoring roles only. Never a candidate. */
  ANSWER_KEY_READ: "assessment.answerkey.read",

  // ── Submissions ───────────────────────────────────────────────────────────
  SUBMISSION_CREATE_SELF: "submission.create.self",
  SUBMISSION_READ_SELF: "submission.read.self",
  SUBMISSION_READ_ASSIGNED: "submission.read.assigned",
  SUBMISSION_READ_ALL: "submission.read.all",
  SUBMISSION_RESUBMIT_SELF: "submission.resubmit.self",

  // ── Review / judgement ────────────────────────────────────────────────────
  REVIEW_QUEUE_READ: "review.queue.read",
  REVIEW_CLAIM: "review.claim",
  REVIEW_APPROVE: "review.approve",
  REVIEW_RETURN: "review.return",
  REVIEW_GRADE: "review.grade",
  /** Operational, not judgemental: moving an overdue item to another examiner. */
  REVIEW_REASSIGN: "review.reassign",
  REVIEW_TURNAROUND_READ: "review.turnaround.read",
  LEARNER_NOTE_CREATE: "learner.note.create",
  LEARNER_NOTE_READ: "learner.note.read",

  /**
   * Assessing a person rather than their work.
   *
   * `write` only ever reaches the rung directly below — that structural rule
   * lives in `performance.ts` and is enforced in the service, because a
   * permission can say "may write a review" but not "of whom".
   */
  PERFORMANCE_WRITE: "review.performance.write",
  /** Reading what has been written about you, once it has been released. */
  PERFORMANCE_READ_SELF: "review.performance.read.self",
  /** Reading what has been written about the people below you. */
  PERFORMANCE_READ_CHAIN: "review.performance.read.chain",

  // ── Academy authoring ─────────────────────────────────────────────────────
  PROGRAMME_READ: "programme.read",
  PROGRAMME_CREATE: "programme.create",
  PROGRAMME_UPDATE: "programme.update",
  /** Making a version binding on live candidates. Administration only. */
  PROGRAMME_PUBLISH: "programme.publish",
  MODULE_WRITE: "module.write",
  LESSON_WRITE: "lesson.write",
  QUESTION_WRITE: "question.write",
  QUESTION_BANK_READ: "questionbank.read",
  ASSESSMENT_WRITE: "assessment.write",
  /**
   * Granting a learner extra attempts at a paper they have run out of, or
   * declining their request. Not judgement of the work: it changes how many
   * more chances somebody gets, never a mark.
   */
  ATTEMPT_GRANT: "assessment.attempt.grant",

  /** Deleting authored content. Separate from writing it, and deliberately so. */
  CONTENT_DELETE: "content.delete",
  /** Hiding authored content from candidates without removing it. */
  CONTENT_VISIBILITY: "content.visibility",
  /** Who may open a track, and on what condition. */
  UNLOCK_RULE_WRITE: "unlock.rule.write",
  /** Letting one named candidate past a locked track, with a reason. */
  TRACK_GRANT_WRITE: "track.grant.write",
  /** What a certificate says and how it is signed. */
  CERTIFICATE_TEMPLATE_WRITE: "certificate.template.write",

  // ── Badges ────────────────────────────────────────────────────────────────
  BADGE_READ: "badge.read",
  /**
   * Reading your own inbox and writing to the people your role may write to.
   *
   * Held by every role, because a messaging screen is a screen about you --
   * like your own record. It does not open anybody else's correspondence:
   * which conversations you can see is decided by being in them, and who you
   * may start one with by the rules in `messaging.ts`.
   */
  MESSAGE_USE: "message.use",
  /** Defining a badge and the condition that earns it. Academy building. */
  BADGE_WRITE: "badge.write",
  /** Awarding a judgement badge by hand. An examiner act, not an authoring one. */
  BADGE_AWARD: "badge.award",
  /** Withdrawing an award. Like a credential, this is an institution act. */
  BADGE_REVOKE: "badge.revoke",

  // ── Cohorts & people logistics ────────────────────────────────────────────
  COHORT_READ: "cohort.read",
  COHORT_WRITE: "cohort.write",
  /** Closing a cohort. Archived, never deleted. */
  COHORT_ARCHIVE: "cohort.archive",
  ENROLLMENT_WRITE: "enrollment.write",
  INSTRUCTOR_ASSIGN: "instructor.assign",
  REPORT_READ: "report.read",

  // ── Credentials ───────────────────────────────────────────────────────────
  CREDENTIAL_READ_SELF: "credential.read.self",
  CREDENTIAL_READ_ALL: "credential.read.all",
  CREDENTIAL_ISSUE: "credential.issue",
  CREDENTIAL_SUSPEND: "credential.suspend",
  CREDENTIAL_REVOKE: "credential.revoke",
  CREDENTIAL_REINSTATE: "credential.reinstate",

  // ── Institution ───────────────────────────────────────────────────────────
  USER_READ: "user.read",
  USER_CREATE: "user.create",
  USER_ROLE_ASSIGN: "user.role.assign",
  USER_SUSPEND: "user.suspend",
  /** Correcting a name or an email. Distinct from changing what they may do. */
  USER_UPDATE: "user.update",
  /** Archiving an account. There is deliberately no user.delete. */
  USER_ARCHIVE: "user.archive",
  /**
   * Forcing a password change on somebody else's account.
   *
   * Not reading their password -- `password.read` is in
   * `NON_EXISTENT_CAPABILITIES` and always will be. This ends the password
   * they have and requires them to set a new one, which is the only form of
   * help with a password this system can offer.
   */
  USER_PASSWORD_RESET: "user.password.reset",
  /**
   * Ending somebody else's live session.
   *
   * Separate from suspending them: a laptop left on a train is not a
   * disciplinary matter, and the control for it should not be the one that
   * locks somebody out of their job.
   */
  USER_SESSION_REVOKE: "user.session.revoke",
  /**
   * Seeing the system as another role sees it, read-only.
   *
   * Not impersonation: no action can be taken while previewing, and the audit
   * log records the administrator as the actor with the subject beside them.
   */
  ROLE_PREVIEW: "role.preview",
  SETTINGS_WRITE: "settings.write",
  SETTINGS_READ: "settings.read",
  FEATURE_FLAG_WRITE: "featureflag.write",
  PORTAL_CONFIGURE: "portal.configure",
  BRANDING_WRITE: "branding.write",
  /**
   * Reading the outbound mail configuration.
   *
   * Separate from settings.read, which a manager holds: a mail configuration
   * names the account this institution sends as, and the endpoint that returns
   * it is the one place a stored secret would leak if anybody ever made it
   * return one. Kept to the institution.
   */
  MAIL_CONFIG_READ: "mail.config.read",
  /** Changing it, including replacing the key. */
  MAIL_CONFIG_WRITE: "mail.config.write",
  /** Sending a test message, which spends real quota against a real provider. */
  MAIL_TEST: "mail.test",

  // ── Governance: the AI agent registry ─────────────────────────────────────
  AGENT_READ: "agent.read",
  AGENT_WRITE: "agent.write",
  /** Retiring a registered agent. An institution act, not a programme one. */
  AGENT_RETIRE: "agent.retire",

  // ── Governance: Dx (authority diagnostic) ─────────────────────────────────
  /** Run a diagnostic. A candidate may, as practice, against their own work. */
  DIAGNOSTIC_CREATE: "diagnostic.create",
  DIAGNOSTIC_READ_SELF: "diagnostic.read.self",
  /** Read every diagnostic in the registry, including other people's. */
  DIAGNOSTIC_READ_ALL: "diagnostic.read.all",
  /** Bind a diagnostic to a registered agent, changing that agent's recorded AAI. */
  DIAGNOSTIC_BIND_AGENT: "diagnostic.bind.agent",

  // ── Governance: Rx (authority prescription) ───────────────────────────────
  PRESCRIPTION_CREATE: "prescription.create",
  PRESCRIPTION_READ: "prescription.read",

  // ── Audit ─────────────────────────────────────────────────────────────────
  AUDIT_READ: "audit.read",
  AUDIT_EXPORT: "audit.export",
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: readonly Permission[] = Object.freeze(
  Object.values(PERMISSIONS) as Permission[],
);

export function isPermission(value: string): value is Permission {
  return (ALL_PERMISSIONS as readonly string[]).includes(value);
}
