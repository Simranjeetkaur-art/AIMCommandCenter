import {
  BadRequestException,
  Logger,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import type { User } from "@prisma/client";
import {
  LOCKOUT_MINUTES,
  MAX_FAILED_LOGINS,
  PASSWORD_RESET_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_COOLDOWN_SECONDS,
  EMAIL_VERIFICATION_TTL_HOURS,
  MAIL_KINDS,
  PASSWORD_RESET_TTL_MINUTES,
  SELF_REGISTRATION_FLAG,
  SELF_REGISTRATION_ROLE,
  SESSION_END_REASONS,
  canPreview,
  checkPassword,
  checkRegistration,
  permissionsFor,
  previewPermissionsFor,
  type Role,
  type SessionEndReason,
  checkProfile,
  profileRequiredFor,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import {
  hashResetToken,
  hashSessionToken,
  hashVerificationToken,
  issueResetToken,
  issueSessionToken,
  issueVerificationToken,
} from "../../common/auth/session-token";
import { AuditService } from "../../common/audit/audit.service";
import type { Actor } from "../../common/auth/actor";
import { ResetDelivery } from "./password-reset-delivery";
import { LoginThrottle } from "./login-throttle";
import type { RegisterDto } from "./auth.dto";
import { MailService } from "../mail/mail.service";
import { OnboardingService } from "../mail/onboarding.service";
import { accountExistsEmail, verificationEmail } from "../mail/templates";

/**
 * A placeholder hash, verified against when the email is unknown, so that a
 * wrong address and a wrong password take the same time to fail. Otherwise the
 * login endpoint quietly answers "does this person exist here".
 */
const DUMMY_HASH =
  "$argon2id$v=19$m=65536,t=3,p=4$c29tZXNhbHR2YWx1ZQ$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";

/**
 * How many live sessions a screen shows at once.
 *
 * Found by driving it: a seeded administrator that automated suites had signed
 * in as, over and over without signing out, had 342 live sessions, and the
 * panel rendered all of them. A list that long is not a control, it is a wall.
 */
export const LIVE_SESSION_PAGE = 25;

/** argon2id everywhere a password is hashed, with one set of parameters. */
const HASH_OPTIONS = { type: argon2.argon2id } as const;

export interface RequestContext {
  ip?: string | null;
  userAgent?: string | null;
  requestId: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger("Auth");

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly delivery: ResetDelivery,
    /**
     * The second brake, and it is not the same brake.
     *
     * `User.lockedUntil` below counts failures against one *account*: durable,
     * visible to an administrator, and clearable by one. It is blind to the
     * attack that matters most here -- one machine trying one likely password
     * against every address on the roll, which never gives any single account
     * enough failures to lock it.
     *
     * `LoginThrottle` counts by origin, in memory, and catches exactly that.
     * Neither subsumes the other, so both run.
     */
    private readonly throttle: LoginThrottle,
    private readonly mail: MailService,
    private readonly onboarding: OnboardingService,
  ) {}

  // ───────────────────────────────────────────────────────────────────────────
  // Signing in
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Enrolling yourself.
   *
   * Everybody else on this system exists because an administrator created
   * them, chose their role and typed a temporary password. This path has no
   * such person in it, so the controls that person represented are written
   * out here instead, and each one is load-bearing:
   *
   *  - **The role is not an input.** It comes from the contract, never from
   *    the body. `RegisterDto` has no role field and this method does not
   *    read one, so the worst a forged request achieves is another student.
   *  - **The door can be closed** by an administrator, without a deploy.
   *  - **No bulk.** The origin brake is separate from the sign-in one and much
   *    tighter, because a person enrols once.
   *  - **`createdById` stays null**, and that null is information: it is how
   *    the roll tells somebody an administrator vouched for from somebody who
   *    walked in off the street.
   *  - **`mustChangePassword` stays false.** That flag exists because a
   *    password somebody else chose is not yours. Here nobody else chose it.
   *
   * It returns a session, exactly as `login` does, because an enrolment that
   * drops you back on the sign-in screen to retype what you just typed is a
   * form that does not believe its own success.
   */
  async register(dto: RegisterDto, context: RequestContext) {
    const origin = context.ip ?? null;

    if (!(await this.selfRegistrationOpen())) {
      throw new ForbiddenException(
        "This academy is not accepting self-enrolment. Ask an administrator for an account.",
      );
    }

    // Checked before anything is written and before any address is looked up,
    // so a braked origin learns nothing about who is on the roll.
    if (this.throttle.registrationRetryAfterMs(origin) !== null) {
      throw new BadRequestException(
        "Too many accounts have been created from here recently. Try again shortly.",
      );
    }

    const verdict = checkRegistration(dto);
    if (!verdict.ok) throw new BadRequestException(verdict.problems);

    // Counted whatever happens next. A script hunting for addresses already on
    // the roll works this endpoint exactly as hard as one creating accounts,
    // and counting only successes would leave that unbraked.
    this.throttle.recordRegistration(origin);

    /**
     * A taken address gets exactly the answer a new one does.
     *
     * Saying "that address already has an account" would let anybody find out
     * who is on the roll, one guess at a time. Instead nothing is created, and
     * the owner of the address is told by mail: an unconfirmed account gets a
     * fresh confirmation link, a confirmed one gets a note saying to sign in or
     * reset. Only the person who can read that mailbox learns anything.
     */
    const taken = await this.prisma.user.findUnique({
      where: { email: verdict.email },
    });
    if (taken) {
      await this.answerTakenAddress(taken, context);
      return {
        pending: true as const,
        email: verdict.email,
        mailSent: await this.mail.ready(),
      };
    }

    const passwordHash = await argon2.hash(dto.password, {
      type: argon2.argon2id,
    });

    const user = await this.prisma.user.create({
      data: {
        email: verdict.email,
        name: verdict.name,
        // From the contract, never from the request. See the note above.
        role: SELF_REGISTRATION_ROLE,
        passwordHash,
        passwordChangedAt: new Date(),
        mustChangePassword: false,
        createdById: null,
      },
    });

    // The new account is the actor. Nobody else acted, and attributing this to
    // an administrator who was not there would make the log say something
    // untrue about a person.
    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "auth.register",
      resourceType: "user",
      resourceId: user.id,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { selfEnrolled: true },
    });

    // Deliberately no session. The address has not been proven to reach
    // anybody yet, and an account that can act before that is an account
    // anybody can open in somebody else's name.
    await this.issueVerification(user, context);

    return {
      pending: true as const,
      email: user.email,
      /**
       * Whether a message actually left the building.
       *
       * Told to the interface so it can say "check your email" or "mail is not
       * configured, ask an administrator" instead of a cheerful lie. It is not
       * an oracle: the caller already knows this address, having just typed it.
       */
      mailSent: await this.mail.ready(),
    };
  }

  /**
   * What happens, out of sight, when somebody enrols with a taken address.
   *
   * Recorded against the account the attempt named, as a refused login is.
   * Archived and suspended accounts are left alone: writing to them would tell
   * the owner nothing they can act on.
   */
  private async answerTakenAddress(user: User, context: RequestContext) {
    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "auth.register",
      resourceType: "user",
      resourceId: user.id,
      outcome: "DENIED",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { reason: "address-taken" },
    });

    if (user.archivedAt || user.status !== "ACTIVE") return;

    if (!user.emailVerifiedAt) {
      await this.issueVerification(user, context);
      return;
    }

    const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
    await this.mail.send(
      MAIL_KINDS.ACCOUNT_EXISTS,
      { email: user.email, name: user.name },
      accountExistsEmail({
        name: user.name,
        signInUrl: `${base}/login`,
        resetUrl: `${base}/login/forgot`,
      }),
    );
  }

  /**
   * Issues a verification link and sends it.
   *
   * A new link voids every older one, for the reason the reset flow does the
   * same: a message from last week should not still be a way in after the
   * person has asked for a fresh one.
   */
  private async issueVerification(
    user: { id: string; name: string; email: string },
    context: RequestContext,
  ): Promise<void> {
    const token = issueVerificationToken();
    const expiresAt = new Date(
      Date.now() + EMAIL_VERIFICATION_TTL_HOURS * 3_600_000,
    );

    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null, voidedAt: null },
        data: { voidedAt: new Date() },
      });
      await tx.emailVerificationToken.create({
        data: {
          userId: user.id,
          tokenHash: hashVerificationToken(token),
          expiresAt,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
    });

    const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
    const link = `${base}/verify?token=${encodeURIComponent(token)}`;

    const result = await this.mail.send(
      MAIL_KINDS.VERIFY,
      { email: user.email, name: user.name },
      verificationEmail({
        name: user.name,
        link,
        hours: EMAIL_VERIFICATION_TTL_HOURS,
      }),
    );

    // Same operator fallback as the reset flow, and the same refusal to write
    // a live token into a production log.
    if (!result.sent && process.env.NODE_ENV !== "production") {
      this.logger.warn(`Verification link for ${user.email}\n  ${link}`);
    }
  }

  /**
   * Spending a verification link.
   *
   * The token is the credential: single use, expiring, stored only as a hash
   * under its own domain. Verifying is idempotent in effect -- clicking a link
   * twice gets the second click a clear "already confirmed" rather than an
   * error -- but the token itself is spent exactly once.
   */
  async verifyEmail(token: string, context: RequestContext) {
    const row = await this.prisma.emailVerificationToken.findUnique({
      where: { tokenHash: hashVerificationToken(token) },
      include: { user: true },
    });

    if (!row || row.voidedAt || row.usedAt || row.expiresAt < new Date()) {
      throw new BadRequestException(
        "That confirmation link is no longer valid. Ask for a new one from the sign-in screen.",
      );
    }

    const user = row.user;

    // Already verified by an earlier click, or by an administrator. Spend the
    // token and send them on rather than manufacturing an error.
    if (user.emailVerifiedAt) {
      await this.prisma.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return {
        ...(await this.startSession(user, context, "auth.login")),
        alreadyVerified: true as const,
        enrolled: false,
        programme: null as string | null,
      };
    }

    const verified = await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.update({
        where: { id: row.id },
        data: { usedAt: new Date() },
      });
      return tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: new Date() },
      });
    });

    await this.audit.record({
      actorId: verified.id,
      actorRole: verified.role,
      actorEmail: verified.email,
      action: "auth.email.verified",
      resourceType: "user",
      resourceId: verified.id,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: {},
    });

    // Enrolment, the welcome message and the staff notice. None of it can fail
    // the verification that has already happened.
    const placement = await this.onboarding.onVerified({
      id: verified.id,
      name: verified.name,
      email: verified.email,
    });

    return {
      ...(await this.startSession(verified, context, "auth.login")),
      alreadyVerified: false as const,
      enrolled: placement.enrolled,
      programme: placement.programme,
    };
  }

  /**
   * An administrator confirming an address on somebody's behalf.
   *
   * For when mail cannot reach them, or is switched off. The outcome is the
   * one a clicked link produces — outstanding links voided, the address marked
   * confirmed, and the same onboarding (intake enrolment, welcome, staff
   * notice) — but no session starts: the administrator is not the candidate.
   * The audit event and its reason are written by the controller.
   */
  async confirmEmailByAdministrator(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException("User not found");
    if (user.archivedAt) {
      throw new BadRequestException(
        "That account is archived. Restore it before confirming its address",
      );
    }
    if (user.emailVerifiedAt) {
      throw new BadRequestException("That address is already confirmed");
    }

    const confirmedAt = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.emailVerificationToken.updateMany({
        where: { userId: user.id, usedAt: null, voidedAt: null },
        data: { voidedAt: confirmedAt },
      });
      await tx.user.update({
        where: { id: user.id },
        data: { emailVerifiedAt: confirmedAt },
      });
    });

    const placement = await this.onboarding.onVerified({
      id: user.id,
      name: user.name,
      email: user.email,
    });

    return {
      emailVerifiedAt: confirmedAt.toISOString(),
      enrolled: placement.enrolled,
      programme: placement.programme,
    };
  }

  /**
   * "Send me that link again."
   *
   * Answers identically whether or not the address is on the roll, for the
   * same reason `requestReset` does: this endpoint is public, and one that
   * answered differently would be a way to ask which addresses are registered.
   */
  async resendVerification(email: string, context: RequestContext) {
    const settled = {
      message:
        "If that address belongs to an unconfirmed account, a new link is on its way.",
    };

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Every early return is the same object. Resist making any more helpful.
    if (!user || user.archivedAt || user.status !== "ACTIVE") return settled;
    if (user.emailVerifiedAt) return settled;

    const recent = await this.prisma.emailVerificationToken.findFirst({
      where: { userId: user.id, usedAt: null, voidedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() <
        EMAIL_VERIFICATION_COOLDOWN_SECONDS * 1000
    ) {
      return settled;
    }

    await this.issueVerification(user, context);
    return settled;
  }

  /**
   * Whether the door is open.
   *
   * Absent means open: the feature was asked for, and a fresh database should
   * have it working rather than silently off until somebody discovers a row is
   * missing. The moment an administrator sets the flag either way, the row is
   * the answer.
   */
  private async selfRegistrationOpen(): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key: SELF_REGISTRATION_FLAG },
      select: { enabled: true },
    });
    return flag?.enabled ?? true;
  }

  async login(email: string, password: string, context: RequestContext) {
    const origin = context.ip ?? null;

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    /**
     * Checked before the account is even looked at, and refused in the same
     * words as every other failure.
     *
     * Saying "too many attempts, wait 12 minutes" would confirm that the
     * address is worth attacking, which is the account oracle `DUMMY_HASH`
     * exists to close. The dummy verify keeps the timing even too.
     */
    const waitMs = this.throttle.retryAfterMs(origin);
    if (waitMs !== null) {
      await argon2.verify(DUMMY_HASH, password).catch(() => false);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (!user) {
      await argon2.verify(DUMMY_HASH, password).catch(() => false);
      this.throttle.recordFailure(origin);
      throw new UnauthorizedException("Invalid credentials");
    }

    /**
     * A locked account does not answer, even to the right password.
     *
     * The dummy verify is not decorative: without it, a locked account fails
     * in microseconds while every other account spends argon2's full cost, and
     * the difference is a side channel that says "this address is real and
     * somebody has been guessing at it".
     */
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await argon2.verify(DUMMY_HASH, password).catch(() => false);
      await this.recordLoginDenial(user, context, {
        reason: "account-locked",
        lockedUntil: user.lockedUntil.toISOString(),
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    const ok = await argon2
      .verify(user.passwordHash, password)
      .catch(() => false);

    if (!ok) {
      this.throttle.recordFailure(origin);
      await this.registerFailure(user, context);
      throw new UnauthorizedException("Invalid credentials");
    }

    if (user.archivedAt) {
      await this.recordLoginDenial(user, context, {
        reason: "account-archived",
      });
      // Same words as a wrong password: the reason is in the audit record,
      // not in a response that would confirm the address is on the roll.
      throw new UnauthorizedException("Invalid credentials");
    }

    // A lapsed suspension is not a suspension: let them in and clear it.
    if (
      user.status !== "ACTIVE" &&
      user.suspendedUntil !== null &&
      user.suspendedUntil <= new Date()
    ) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          status: "ACTIVE",
          suspendedAt: null,
          suspendedUntil: null,
          suspendedReason: null,
        },
      });
      user.status = "ACTIVE";
    }

    if (user.status !== "ACTIVE") {
      await this.recordLoginDenial(user, context, {
        reason: "account-suspended",
      });
      throw new UnauthorizedException("Invalid credentials");
    }

    /**
     * An address nobody has proved reaches them does not get a session.
     *
     * Checked *after* the password, and that ordering is the point: telling an
     * anonymous caller "that account exists but is unverified" would be an
     * oracle on the roll. Only somebody who already knows the password learns
     * anything here, and they learn something they need.
     *
     * Accounts an administrator created are verified on creation, so this can
     * only ever hold up somebody who enrolled themselves.
     */
    if (!user.emailVerifiedAt) {
      await this.recordLoginDenial(user, context, {
        reason: "email-unverified",
      });
      throw new ForbiddenException(
        "Confirm your email address before signing in. Check your inbox, or ask for a new link.",
      );
    }

    // Nothing to clear. The origin counter is deliberately left alone on a
    // success: one good login from a machine that has been sweeping the roll
    // is not evidence the sweep has stopped. The per-account counter is
    // cleared below, in the same write that stamps lastLoginAt.

    return this.startSession(user, context, "auth.login");
  }

  /**
   * Opens a session and hands back the credential, once.
   *
   * Shared by signing in and by enrolling, for the same reason
   * `issueResetFor` is shared by the two reset paths: if a session were built
   * in two places, one of them would eventually stop clearing the failure
   * count, or stop writing the audit row, and nobody would notice until it
   * mattered.
   *
   * `action` distinguishes them in the log. A session that began because
   * somebody signed in and a session that began because somebody enrolled are
   * different events, and the log should not have to guess which it was.
   */
  private async startSession(
    user: User,
    context: RequestContext,
    action: "auth.login" | "auth.register.session",
  ) {
    const token = issueSessionToken();
    const ttlHours = Number(process.env.SESSION_TTL_HOURS ?? 12);
    const expiresAt = new Date(Date.now() + ttlHours * 3_600_000);

    // When they were last actually here, which is what an administrator looks
    // for on a dormant account. Session rows expire and are pruned; this does
    // not. The same write clears the failure count, because a success is what
    // "consecutive failures" is counted against.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    });

    const session = await this.prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
        ip: context.ip ?? null,
        userAgent: context.userAgent ?? null,
      },
    });

    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action,
      resourceType: "session",
      resourceId: session.id,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: user.mustChangePassword ? { heldAtPasswordScreen: true } : {},
    });

    return {
      // Returned once, to the Next.js server. It is put straight into an
      // httpOnly cookie and never reaches browser JavaScript.
      token,
      expiresAt: expiresAt.toISOString(),
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
      },
      /**
       * True when this session may do nothing but set a new password.
       *
       * Returned so the sign-in screen can send them straight there instead of
       * to a portal that will refuse every call it makes. It is a courtesy,
       * not the enforcement: SessionGuard refuses regardless.
       */
      mustChangePassword: user.mustChangePassword,
      permissions: permissionsFor(user.role),
    };
  }

  /**
   * Counts a wrong password, and locks the account once there have been
   * enough of them.
   *
   * The lock lifts by itself. A lockout an administrator has to clear turns
   * every mistyped password into a support ticket, and the pressure that
   * creates is how lockouts end up switched off entirely.
   */
  private async registerFailure(user: User, context: RequestContext) {
    const failures = user.failedLoginCount + 1;
    const locking = failures >= MAX_FAILED_LOGINS;
    const lockedUntil = locking
      ? new Date(Date.now() + LOCKOUT_MINUTES * 60_000)
      : null;

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginCount: failures,
        ...(locking ? { lockedUntil } : {}),
      },
    });

    await this.recordLoginDenial(user, context, {
      reason: "bad-password",
      consecutiveFailures: failures,
      ...(locking ? { lockedUntil: lockedUntil?.toISOString() } : {}),
    });

    if (locking) {
      await this.audit.record({
        actorId: user.id,
        actorRole: user.role,
        actorEmail: user.email,
        action: "auth.lockout",
        resourceType: "user",
        resourceId: user.id,
        outcome: "DENIED",
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: {
          failures,
          lockedUntil: lockedUntil?.toISOString(),
          minutes: LOCKOUT_MINUTES,
        },
      });
    }
  }

  private recordLoginDenial(
    user: User,
    context: RequestContext,
    metadata: Record<string, unknown>,
  ) {
    return this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "auth.login",
      resourceType: "session",
      outcome: "DENIED",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: metadata as never,
    });
  }

  async logout(sessionId: string): Promise<void> {
    await this.prisma.session.update({
      where: { id: sessionId },
      data: {
        revokedAt: new Date(),
        revokedReason: SESSION_END_REASONS.SIGNED_OUT,
      },
    });
  }

  // ───────────────────────────────────────────────────────────────────────────
  // The password
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Changing your own password, knowing the old one.
   *
   * Four things happen together and all four matter: the old password is
   * verified, the new one is checked against the policy, the hold (if any) is
   * lifted, and every other session is ended. That last one is the default
   * rather than an option buried in a checkbox, because the ordinary reason
   * for changing a password is a suspicion that somebody else has it.
   */
  async changePassword(
    actor: Actor,
    currentPassword: string,
    newPassword: string,
    endOthers: boolean,
    context: RequestContext,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
    });
    if (!user) throw new UnauthorizedException("Session required");

    const ok = await argon2
      .verify(user.passwordHash, currentPassword)
      .catch(() => false);
    if (!ok) {
      await this.audit.record({
        actorId: user.id,
        actorRole: user.role,
        actorEmail: user.email,
        action: "auth.password.change",
        resourceType: "user",
        resourceId: user.id,
        outcome: "DENIED",
        ip: context.ip,
        userAgent: context.userAgent,
        requestId: context.requestId,
        metadata: { reason: "current-password-wrong" },
      });
      throw new BadRequestException("That is not your current password");
    }

    if (
      await argon2.verify(user.passwordHash, newPassword).catch(() => false)
    ) {
      throw new BadRequestException(
        "The new password is the one you already have",
      );
    }

    this.assertPolicy(newPassword, user);

    const revoked = await this.setPassword(user, newPassword, {
      endSessions: endOthers ? "OTHERS" : "NONE",
      keepSessionId: actor.sessionId,
      reason: SESSION_END_REASONS.PASSWORD_CHANGED,
    });

    await this.audit.record({
      actorId: user.id,
      actorRole: user.role,
      actorEmail: user.email,
      action: "auth.password.change",
      resourceType: "user",
      resourceId: user.id,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: {
        otherSessionsEnded: revoked,
        clearedHold: user.mustChangePassword,
      },
    });

    return {
      changedAt: new Date().toISOString(),
      otherSessionsEnded: revoked,
      /** Cleared, so the interface knows the person is free to go. */
      mustChangePassword: false,
    };
  }

  /**
   * "I have forgotten my password", from the sign-in screen.
   *
   * Answers identically whether or not the address is one this system knows.
   * Everything interesting about this method is in what it refuses to tell the
   * caller: no field in the response, no difference in status code, and no
   * difference in shape between a known address, an unknown one, an archived
   * account and one already holding a live token. A reset form that says "no
   * such user" is a way to enumerate the roll.
   */
  async requestReset(email: string, context: RequestContext) {
    const settled = {
      message:
        "If that address belongs to an account, a reset link is on its way. " +
        "It is good for " +
        `${PASSWORD_RESET_TTL_MINUTES} minutes.`,
    };

    const user = await this.prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    // Every early return below is the same object. Resist the temptation to
    // make any of them more helpful.
    if (!user || user.archivedAt || user.status !== "ACTIVE") return settled;

    // One live token at a time, and a floor on how often one may be asked for,
    // so the form cannot be used to post mail at somebody repeatedly.
    const recent = await this.prisma.passwordResetToken.findFirst({
      where: { userId: user.id, usedAt: null, voidedAt: null },
      orderBy: { createdAt: "desc" },
    });
    if (
      recent &&
      Date.now() - recent.createdAt.getTime() <
        PASSWORD_RESET_COOLDOWN_SECONDS * 1000
    ) {
      return settled;
    }

    await this.issueResetFor(user, null, context, "self-service");
    return settled;
  }

  /**
   * Issues a token, voids any earlier one, and hands it to delivery.
   *
   * Shared by the self-service flow and the administrator-initiated one. The
   * only difference between them is `issuedBy` and where the link ends up --
   * the token itself is made, stored and expired the same way, which is the
   * property that keeps one path from being weaker than the other.
   */
  private async issueResetFor(
    user: User,
    issuedBy: Actor | null,
    context: RequestContext,
    how: "self-service" | "administrator",
  ): Promise<{ token: string; expiresAt: Date }> {
    const token = issueResetToken();
    const expiresAt = new Date(
      Date.now() + PASSWORD_RESET_TTL_MINUTES * 60_000,
    );

    await this.prisma.$transaction(async (tx) => {
      // A new link supersedes every older one. Otherwise a mail from last week
      // is still a way in, which is exactly what somebody clearing out a
      // compromised mailbox is trying to stop.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, voidedAt: null },
        data: { voidedAt: new Date() },
      });

      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash: hashResetToken(token),
          expiresAt,
          issuedById: issuedBy?.id ?? null,
          ip: context.ip ?? null,
          userAgent: context.userAgent ?? null,
        },
      });
    });

    await this.audit.record({
      // Self-service has no session and therefore no actor but the account
      // itself, which is the truthful attribution: nobody else did this.
      actorId: issuedBy?.id ?? user.id,
      actorRole: issuedBy?.role ?? user.role,
      actorEmail: issuedBy?.email ?? user.email,
      action: "auth.password.reset.request",
      resourceType: "user",
      resourceId: user.id,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: {
        how,
        subject: user.email,
        expiresAt: expiresAt.toISOString(),
      },
    });

    if (how === "self-service") {
      await this.delivery.send({
        email: user.email,
        name: user.name,
        token,
        expiresAt,
        issuedByName: issuedBy?.name ?? null,
      });
    }

    return { token, expiresAt };
  }

  /** Issues a reset on somebody else's behalf. Called by UsersService. */
  issueAdminReset(user: User, actor: Actor, context: RequestContext) {
    return this.issueResetFor(user, actor, context, "administrator");
  }

  /**
   * Spending a reset link.
   *
   * Every session belonging to the account ends, including the one the person
   * may be sitting in. A reset is what you do when you believe somebody else
   * has your password; leaving their session alive would be the one thing the
   * act was meant to stop.
   */
  async resetPassword(
    token: string,
    newPassword: string,
    context: RequestContext,
  ) {
    const row = await this.prisma.passwordResetToken.findUnique({
      where: { tokenHash: hashResetToken(token) },
      include: { user: true },
    });

    // One message for expired, spent, voided and never-existed alike. Telling
    // them apart is only useful to somebody holding a token they should not.
    const refusal = new BadRequestException(
      "That reset link is not valid any more. Ask for a new one.",
    );

    if (!row) throw refusal;
    if (row.usedAt || row.voidedAt) throw refusal;
    if (row.expiresAt <= new Date()) throw refusal;
    if (row.user.archivedAt) throw refusal;

    this.assertPolicy(newPassword, row.user);

    await this.prisma.passwordResetToken.update({
      where: { id: row.id },
      data: { usedAt: new Date() },
    });

    const revoked = await this.setPassword(row.user, newPassword, {
      endSessions: "ALL",
      reason: SESSION_END_REASONS.PASSWORD_RESET,
    });

    await this.audit.record({
      actorId: row.user.id,
      actorRole: row.user.role,
      actorEmail: row.user.email,
      action: "auth.password.reset.complete",
      resourceType: "user",
      resourceId: row.user.id,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: {
        sessionsEnded: revoked,
        issuedBy: row.issuedById ?? "self-service",
      },
    });

    return {
      message: "Your password is set. Sign in with it.",
      sessionsEnded: revoked,
    };
  }

  /**
   * The one place a password hash is written.
   *
   * Everything that must happen alongside it happens here, so no caller can
   * set a password and forget to lift the hold, clear the lockout, void
   * outstanding reset links, or end the sessions that the old password opened.
   */
  private async setPassword(
    user: User,
    plaintext: string,
    options: {
      endSessions: "ALL" | "OTHERS" | "NONE";
      keepSessionId?: string;
      reason: SessionEndReason;
    },
  ): Promise<number> {
    const passwordHash = await argon2.hash(plaintext, HASH_OPTIONS);
    const now = new Date();

    return this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: user.id },
        data: {
          passwordHash,
          passwordChangedAt: now,
          // Whatever held this account at the password screen is now answered.
          mustChangePassword: false,
          // A person who knows their password is not mid-attack on themselves.
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      // Any outstanding link is dead: the password it would have set has been
      // set by other means.
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null, voidedAt: null },
        data: { voidedAt: now },
      });

      if (options.endSessions === "NONE") return 0;

      const { count } = await tx.session.updateMany({
        where: {
          userId: user.id,
          revokedAt: null,
          ...(options.endSessions === "OTHERS" && options.keepSessionId
            ? { id: { not: options.keepSessionId } }
            : {}),
        },
        data: { revokedAt: now, revokedReason: options.reason },
      });
      return count;
    });
  }

  /**
   * The policy, applied. Throws with every problem at once rather than the
   * first, because a form that reveals one rule at a time is a guessing game.
   */
  private assertPolicy(password: string, subject: User): void {
    const verdict = checkPassword(password, {
      email: subject.email,
      name: subject.name,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.problems);
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Sessions
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Everything signed in as you, with the one you are using marked.
   *
   * Capped, because the list is a control surface rather than a report and a
   * person with a great many live sessions is exactly the person who needs to
   * act on the recent ones. The total comes back beside it so the screen can
   * say what it is not showing, and "end all others" operates on all of them
   * rather than on the page.
   */
  async listSessions(actor: Actor) {
    const where = {
      userId: actor.id,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };
    const total = await this.prisma.session.count({ where });
    const sessions = await this.prisma.session.findMany({
      where,
      take: LIVE_SESSION_PAGE,
      orderBy: { lastSeenAt: "desc" },
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
        previewRole: true,
      },
    });

    return {
      total,
      shown: sessions.length,
      items: sessions.map((session) => ({
        ...session,
        createdAt: session.createdAt.toISOString(),
        lastSeenAt: session.lastSeenAt.toISOString(),
        expiresAt: session.expiresAt.toISOString(),
        current: session.id === actor.sessionId,
      })),
    };
  }

  /**
   * Ending one of your own sessions.
   *
   * Scoped to the caller's own rows by the `where`, not by a check after the
   * lookup: an id belonging to somebody else simply does not match, so the
   * refusal is structural rather than a comparison somebody could later
   * rearrange.
   */
  async revokeOwnSession(
    actor: Actor,
    sessionId: string,
    context: RequestContext,
  ) {
    const { count } = await this.prisma.session.updateMany({
      where: { id: sessionId, userId: actor.id, revokedAt: null },
      data: {
        revokedAt: new Date(),
        revokedReason: SESSION_END_REASONS.ENDED_BY_OWNER,
        revokedById: actor.id,
      },
    });

    if (count === 0) {
      throw new NotFoundException("No live session of yours with that id");
    }

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: "auth.session.revoke",
      resourceType: "session",
      resourceId: sessionId,
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { scope: "own", wasCurrent: sessionId === actor.sessionId },
    });

    return {
      ended: 1,
      /** True when they have just signed themselves out. The screen must say so. */
      endedCurrent: sessionId === actor.sessionId,
    };
  }

  /** Ending every session but this one. The "I left it signed in somewhere" button. */
  async revokeOtherSessions(actor: Actor, context: RequestContext) {
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId: actor.id,
        revokedAt: null,
        id: { not: actor.sessionId },
      },
      data: {
        revokedAt: new Date(),
        revokedReason: SESSION_END_REASONS.ENDED_BY_OWNER,
        revokedById: actor.id,
      },
    });

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: "auth.session.revoke",
      resourceType: "session",
      outcome: "SUCCESS",
      ip: context.ip,
      userAgent: context.userAgent,
      requestId: context.requestId,
      metadata: { scope: "own-others", ended: count },
    });

    return { ended: count };
  }

  // ───────────────────────────────────────────────────────────────────────────
  // Role preview
  // ───────────────────────────────────────────────────────────────────────────

  /**
   * Looks at another role's screens.
   *
   * Written onto the session rather than held in a cookie, for two reasons:
   * a cookie is editable by the person holding it, and a preview has to be
   * something the server can see, refuse writes against, and end. While it is
   * on, this session holds the previewed role's reads instead of its own
   * permissions -- see `previewPermissionsFor`.
   */
  async startPreview(actor: Actor, role: Role) {
    if (!canPreview(actor.role, role)) {
      throw new BadRequestException(
        `You cannot preview the ${role.toLowerCase()} portal: that is your own role`,
      );
    }

    await this.prisma.session.update({
      where: { id: actor.sessionId },
      data: { previewRole: role, previewStartedAt: new Date() },
    });

    return {
      previewRole: role,
      permissions: previewPermissionsFor(role),
      // Said plainly, because it is the part people get wrong about a feature
      // like this: the screens change, the person does not.
      note: `You are looking at the ${role} portal as ${actor.name}. Nothing can be changed while this is on, and anything you read is recorded against you.`,
    };
  }

  async endPreview(actor: Actor) {
    await this.prisma.session.update({
      where: { id: actor.sessionId },
      data: { previewRole: null, previewStartedAt: null },
    });
    return { previewRole: null, permissions: permissionsFor(actor.role) };
  }

  /** Read back for `/auth/me`, so the interface can say why it is being held. */
  async passwordStanding(actor: Actor) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        mustChangePassword: true,
        passwordChangedAt: true,
        role: true,
        profileCompletedAt: true,
      },
    });
    if (!user) throw new ForbiddenException("No such account");
    return {
      mustChangePassword: user.mustChangePassword,
      passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
      // Explains the profile hold SessionGuard enforces; decides nothing.
      profileRequired:
        profileRequiredFor(user.role) && user.profileCompletedAt === null,
    };
  }

  // ── The profile ─────────────────────────────────────────────────────────

  async getProfile(actor: Actor) {
    const user = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: {
        name: true,
        email: true,
        role: true,
        organisation: true,
        jobTitle: true,
        country: true,
        phone: true,
        address: true,
        profileCompletedAt: true,
      },
    });
    if (!user) throw new ForbiddenException("No such account");
    return {
      ...user,
      profileCompletedAt: user.profileCompletedAt?.toISOString() ?? null,
      profileRequired:
        profileRequiredFor(user.role) && user.profileCompletedAt === null,
    };
  }

  /**
   * Saving your own profile. Every field is required, by the same rules the
   * form applies (`checkProfile`), and the first complete save stamps
   * `profileCompletedAt`, which is what lifts the hold.
   */
  async updateProfile(actor: Actor, body: unknown) {
    const verdict = checkProfile(
      (body && typeof body === "object" ? body : {}) as Record<string, unknown>,
    );
    if (!verdict.ok) throw new BadRequestException(verdict.problems);

    const current = await this.prisma.user.findUnique({
      where: { id: actor.id },
      select: { profileCompletedAt: true },
    });
    if (!current) throw new ForbiddenException("No such account");

    await this.prisma.user.update({
      where: { id: actor.id },
      data: {
        ...verdict.profile,
        profileCompletedAt: current.profileCompletedAt ?? new Date(),
      },
    });
    return this.getProfile(actor);
  }
}
