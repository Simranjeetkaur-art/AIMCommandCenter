import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import * as argon2 from "argon2";
import { Prisma, Role } from "@prisma/client";
import {
  PASSWORD_RESET_TTL_MINUTES,
  SESSION_END_REASONS,
  checkPassword,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { PageQuery, page } from "../../common/util/pagination";
import type { Actor } from "../../common/auth/actor";
import {
  AuthService,
  LIVE_SESSION_PAGE,
  type RequestContext,
} from "../auth/auth.service";
import type {
  ArchiveUserDto,
  AssignRoleDto,
  ClearLockoutDto,
  CreateUserDto,
  ListUsersQuery,
  ResetUserPasswordDto,
  RevokeUserSessionsDto,
  SuspendUserDto,
  UpdateUserDto,
} from "./users.dto";

const PUBLIC_FIELDS = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  createdAt: true,
  lastLoginAt: true,
  suspendedAt: true,
  suspendedUntil: true,
  suspendedReason: true,
  archivedAt: true,
  archivedReason: true,
  // The password's standing, which is an administrator's business: an account
  // held at the password screen and one locked by repeated failure look
  // identical from the roll otherwise, and they need different help.
  passwordChangedAt: true,
  mustChangePassword: true,
  failedLoginCount: true,
  lockedUntil: true,
  // Null until the address is proven. Without it an account that cannot sign
  // in for want of a confirmation looks exactly like a working one.
  emailVerifiedAt: true,
  // The first-sign-in profile, which staff need to see who somebody is.
  organisation: true,
  jobTitle: true,
  country: true,
  phone: true,
  address: true,
  profileCompletedAt: true,
} satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    /**
     * Reset tokens are issued by AuthService and nowhere else.
     *
     * The administrator-initiated reset and the self-service one must produce
     * the same kind of credential, with the same lifetime and the same
     * single-use rule. A second implementation here would drift, and the one
     * that drifted would be the one nobody was testing.
     */
    private readonly auth: AuthService,
  ) {}

  async list(query: ListUsersQuery) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      // Archived accounts are hidden unless asked for: they are history, not
      // people the institution is currently dealing with.
      ...(query.includeArchived === "true" ? {} : { archivedAt: null }),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: "insensitive" } },
              { email: { contains: query.search, mode: "insensitive" } },
            ],
          }
        : {}),
    };

    const sort = query.sort ?? "role";
    const direction = query.direction ?? "asc";
    const orderBy: Prisma.UserOrderByWithRelationInput[] =
      sort === "role"
        ? [{ role: direction }, { name: "asc" }]
        : [{ [sort]: direction } as Prisma.UserOrderByWithRelationInput];

    /**
     * The same filter, but about the whole roll rather than this page — and
     * for the archived count, with the archived rule lifted.
     *
     * Counting archived accounts from the returned rows would give zero
     * whenever they are hidden, which is precisely when somebody wants to
     * know there are some. Role, status and search still apply, so the figure
     * never contradicts the list beside it.
     */
    const { archivedAt: _hidden, ...withoutArchiveRule } = where;
    const roles: Role[] = ["STUDENT", "INSTRUCTOR", "MANAGER", "ADMIN"];

    const [items, total, archivedTotal, ...roleCounts] =
      await this.prisma.$transaction([
        this.prisma.user.findMany({
          where,
          select: PUBLIC_FIELDS,
          orderBy,
          skip: query.skip,
          take: query.take,
        }),
        this.prisma.user.count({ where }),
        this.prisma.user.count({
          where: { ...withoutArchiveRule, archivedAt: { not: null } },
        }),
        // Four counts rather than a groupBy: there are four roles, and a role
        // with nobody in it should report zero rather than be absent.
        ...roles.map((role) =>
          this.prisma.user.count({ where: { ...where, role } }),
        ),
      ]);

    return {
      ...page(items, total, query as PageQuery),
      /** Totals across the whole filtered roll, not just the page shown. */
      byRole: Object.fromEntries(roles.map((role, i) => [role, roleCounts[i]])),
      archivedTotal,
    };
  }

  async create(actor: Actor, dto: CreateUserDto) {
    const email = dto.email.toLowerCase();
    const existing = await this.prisma.user.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      throw new BadRequestException("A user with that email already exists");
    }

    // argon2id, memory-hard. The plaintext is not stored, logged or returned;
    // there is no column it could be read back from.
    const passwordHash = await argon2.hash(dto.temporaryPassword, {
      type: argon2.argon2id,
    });

    return this.prisma.user.create({
      data: {
        email,
        name: dto.name,
        role: dto.role,
        passwordHash,
        createdById: actor.id,
        passwordChangedAt: new Date(),
        /**
         * Verified on creation, because somebody vouched for them.
         *
         * Email verification exists to prove a stranger owns the address they
         * typed. An administrator typing it on their behalf is the stronger
         * claim, and making this account prove itself to a machine would only
         * lock out the person who was just told their account is ready.
         */
        emailVerifiedAt: new Date(),
        /**
         * A password somebody else chose is not this person's password.
         *
         * The account signs in with it once and can do nothing until it is
         * replaced -- so the string an administrator typed into a form, and
         * very possibly sent over chat, is never the credential protecting a
         * live account.
         */
        mustChangePassword: true,
      },
      select: PUBLIC_FIELDS,
    });
  }

  async assignRole(actor: Actor, userId: string, dto: AssignRoleDto) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("User not found");

    // An administrator does not change their own role. Demoting yourself by
    // accident is one lockout; promoting yourself is the audit trail failing
    // to mean anything.
    if (target.id === actor.id) {
      throw new ForbiddenException(
        "An administrator cannot change their own role",
      );
    }

    if (target.role === dto.role) {
      throw new BadRequestException(`User already holds ${dto.role}`);
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: { role: dto.role },
        select: PUBLIC_FIELDS,
      });

      // A role change invalidates every live session for that person: their
      // next request re-derives permissions from the new role, but there is no
      // reason to let an in-flight session keep the old portal open.
      await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: new Date(),
          revokedReason: SESSION_END_REASONS.ROLE_CHANGED,
          revokedById: actor.id,
        },
      });

      return updated;
    });
  }

  async setSuspension(actor: Actor, userId: string, dto: SuspendUserDto) {
    if (userId === actor.id) {
      throw new ForbiddenException(
        "An administrator cannot suspend their own account",
      );
    }

    const suspend = dto.action === "SUSPEND";
    const until = dto.until ? new Date(dto.until) : null;
    if (until && until <= new Date()) {
      throw new BadRequestException(
        "A suspension that has already lapsed changes nothing",
      );
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          status: suspend ? "SUSPENDED" : "ACTIVE",
          suspendedAt: suspend ? new Date() : null,
          suspendedUntil: suspend ? until : null,
          suspendedReason: suspend ? dto.reason : null,
        },
        select: PUBLIC_FIELDS,
      });

      if (suspend) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revokedReason: SESSION_END_REASONS.ACCOUNT_SUSPENDED,
            revokedById: actor.id,
          },
        });
      }

      return updated;
    });
  }

  /**
   * Correcting a record: a name, an email. Not what the person may do.
   *
   * Kept apart from role and status on purpose — fixing a typo and changing
   * someone's authority are different acts and should not share a control.
   */
  async update(actor: Actor, userId: string, dto: UpdateUserDto) {
    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.archivedAt) {
      throw new BadRequestException("Restore this account before editing it");
    }

    if (dto.email && dto.email.toLowerCase() !== target.email) {
      const taken = await this.prisma.user.findUnique({
        where: { email: dto.email.toLowerCase() },
        select: { id: true },
      });
      if (taken)
        throw new BadRequestException(
          "Another account already uses that email",
        );
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.email !== undefined ? { email: dto.email.toLowerCase() } : {}),
      },
      select: PUBLIC_FIELDS,
    });
  }

  /**
   * Archiving, which is what this system has instead of deleting a person.
   *
   * Every audit event names its actor, and those events are append-only. A
   * deleted user would leave a log full of references to somebody who no
   * longer exists, so an account is closed rather than erased: it cannot sign
   * in, it is hidden from the roll, and its whole history stays readable.
   */
  async setArchived(actor: Actor, userId: string, dto: ArchiveUserDto) {
    if (userId === actor.id) {
      throw new ForbiddenException(
        "An administrator cannot archive their own account",
      );
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("User not found");

    const archiving = dto.action === "ARCHIVE";
    if (archiving && target.archivedAt) {
      throw new BadRequestException("That account is already archived");
    }
    if (!archiving && !target.archivedAt) {
      throw new BadRequestException("That account is not archived");
    }

    if (archiving && target.role === "ADMIN") {
      const admins = await this.prisma.user.count({
        where: { role: "ADMIN", archivedAt: null, status: "ACTIVE" },
      });
      // Archiving the last administrator would lock the institution out of
      // its own settings, with no way back in through the interface.
      if (admins <= 1) {
        throw new BadRequestException("That is the last active administrator");
      }
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.user.update({
        where: { id: userId },
        data: archiving
          ? {
              archivedAt: new Date(),
              archivedReason: dto.reason,
              status: "SUSPENDED",
            }
          : {
              archivedAt: null,
              archivedReason: null,
              status: "ACTIVE",
              suspendedAt: null,
            },
        select: PUBLIC_FIELDS,
      });

      if (archiving) {
        await tx.session.updateMany({
          where: { userId, revokedAt: null },
          data: {
            revokedAt: new Date(),
            revokedReason: SESSION_END_REASONS.ACCOUNT_ARCHIVED,
            revokedById: actor.id,
          },
        });
      }

      return updated;
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Helping somebody back into their account
  // ─────────────────────────────────────────────────────────────────────────

  /**
   * Resetting another person's password.
   *
   * There is no way to read what their password is, here or anywhere: there is
   * no column it could be read back from. What an administrator can do is end
   * the one that exists and arrange for a new one to be set, which is what
   * both modes below do.
   *
   * Refused on your own account. An administrator resetting themselves should
   * use the ordinary change-password screen, where knowing the current one is
   * the point -- and a `LINK` reset on yourself would end the session you are
   * holding while handing you a link you then have to go and find.
   */
  async resetPassword(
    actor: Actor,
    userId: string,
    dto: ResetUserPasswordDto,
    context: RequestContext,
  ) {
    if (userId === actor.id) {
      throw new ForbiddenException(
        "Change your own password from your account screen, where the current one is required",
      );
    }

    const target = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!target) throw new NotFoundException("User not found");
    if (target.archivedAt) {
      throw new BadRequestException(
        "That account is archived. Restore it before resetting the password",
      );
    }

    if (dto.mode === "LINK") {
      const { token, expiresAt } = await this.auth.issueAdminReset(
        target,
        actor,
        context,
      );

      /**
       * The link goes back to the administrator on screen rather than to the
       * person's mailbox, and that is deliberate for this path: they asked for
       * it on behalf of somebody they are dealing with, and the audit log
       * records that they did. The self-service path never returns a token to
       * anybody, because there nobody has proved they are entitled to it.
       *
       * Nothing about the account has changed yet. An administrator who reset
       * the wrong person has inconvenienced nobody.
       */
      return {
        mode: "LINK" as const,
        resetUrl: `${WEB_BASE()}/login/reset?token=${encodeURIComponent(token)}`,
        expiresAt: expiresAt.toISOString(),
        expiresInMinutes: PASSWORD_RESET_TTL_MINUTES,
        sessionsEnded: 0,
        note: `Hand this to ${target.name} yourself. It works once, it dies in ${PASSWORD_RESET_TTL_MINUTES} minutes, and their current password keeps working until they spend it.`,
      };
    }

    const temporary = dto.temporaryPassword ?? "";
    // The same policy the person's own password screen applies. An account
    // whose administrator-set password could be weaker than its owner-set one
    // is an account with a back door.
    const verdict = checkPassword(temporary, {
      email: target.email,
      name: target.name,
    });
    if (!verdict.ok) throw new BadRequestException(verdict.problems);

    const passwordHash = await argon2.hash(temporary, {
      type: argon2.argon2id,
    });
    const now = new Date();

    const sessionsEnded = await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: userId },
        data: {
          passwordHash,
          passwordChangedAt: now,
          // Held at the password screen. The string an administrator typed is
          // good for exactly one sign-in and nothing else.
          mustChangePassword: true,
          // Whoever was guessing has been answered by other means.
          failedLoginCount: 0,
          lockedUntil: null,
        },
      });

      await tx.passwordResetToken.updateMany({
        where: { userId, usedAt: null, voidedAt: null },
        data: { voidedAt: now },
      });

      const { count } = await tx.session.updateMany({
        where: { userId, revokedAt: null },
        data: {
          revokedAt: now,
          revokedReason: SESSION_END_REASONS.PASSWORD_RESET,
          revokedById: actor.id,
        },
      });
      return count;
    });

    return {
      mode: "TEMPORARY_PASSWORD" as const,
      sessionsEnded,
      mustChangePassword: true,
      note: `${target.name} signs in with that password once and must replace it before they can do anything else. Every session they had is ended.`,
    };
  }

  /**
   * Lifting an automatic lockout early.
   *
   * The lock lapses by itself, so this exists only for the person on the phone
   * who cannot wait fifteen minutes. It clears the count as well as the
   * deadline: leaving the count at its ceiling would re-lock the account on
   * the very next typo.
   */
  async clearLockout(actor: Actor, userId: string, _dto: ClearLockoutDto) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, lockedUntil: true, failedLoginCount: true },
    });
    if (!target) throw new NotFoundException("User not found");
    if (!target.lockedUntil || target.lockedUntil <= new Date()) {
      throw new BadRequestException("That account is not locked");
    }

    return this.prisma.user.update({
      where: { id: userId },
      data: { lockedUntil: null, failedLoginCount: 0 },
      select: PUBLIC_FIELDS,
    });
  }

  /** Confirming an address by hand. The work, and its rules, live in AuthService. */
  confirmEmail(userId: string) {
    return this.auth.confirmEmailByAdministrator(userId);
  }

  /** What is signed in as this person, and from where. */
  async sessions(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) throw new NotFoundException("User not found");

    const where = { userId, revokedAt: null, expiresAt: { gt: new Date() } };
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

    // `current` is about the caller's own session and this is somebody else's
    // list, so it is false throughout rather than absent -- the shape matches
    // the one the account screen renders.
    return {
      total,
      shown: sessions.length,
      items: sessions.map((session) => ({ ...session, current: false })),
    };
  }

  /**
   * Ending another person's session: one named one, or all of them.
   *
   * Kept apart from suspending them, because a laptop left on a train is not a
   * disciplinary matter and the control for it should not be the one that
   * stops somebody working.
   */
  async revokeSessions(
    actor: Actor,
    userId: string,
    dto: RevokeUserSessionsDto,
  ) {
    const target = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, name: true },
    });
    if (!target) throw new NotFoundException("User not found");

    /**
     * Never the session making the request.
     *
     * An administrator ending their own current session from somebody else's
     * detail screen would be signing themselves out by accident, which is a
     * strange thing for a button on another person's page to do. Signing out
     * is its own control and says so.
     */
    if (dto.sessionId && dto.sessionId === actor.sessionId) {
      throw new BadRequestException(
        "That is the session you are using. Sign out instead.",
      );
    }

    /**
     * Scoped by user and session together, so a session id on its own names
     * nothing: asking about one that belongs to somebody else answers exactly
     * as asking about one that is not there. That follows AccessScopeService,
     * which hides an out-of-scope subject rather than confirming it with a
     * 403.
     */
    const { count } = await this.prisma.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(dto.sessionId ? { id: dto.sessionId } : {}),
      },
      data: {
        revokedAt: new Date(),
        revokedReason: SESSION_END_REASONS.ENDED_BY_ADMIN,
        revokedById: actor.id,
      },
    });

    if (dto.sessionId && count === 0) {
      throw new NotFoundException("No live session with that id");
    }

    return {
      ended: count,
      note:
        count === 0
          ? `${target.name} had no live session.`
          : `Ended ${count} session${count === 1 ? "" : "s"}. ${target.name} signs in again with their existing password.`,
    };
  }

  /** Everything about one person, in one place. */
  async detail(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        ...PUBLIC_FIELDS,
        updatedAt: true,
        createdBy: { select: { id: true, name: true } },
        enrollments: {
          include: {
            cohort: {
              select: {
                id: true,
                code: true,
                title: true,
                programmeVersion: {
                  select: {
                    programme: { select: { code: true, title: true } },
                  },
                },
              },
            },
          },
        },
        credentials: {
          select: {
            id: true,
            serial: true,
            status: true,
            issuedAt: true,
            programmeVersion: {
              select: { programme: { select: { code: true } } },
            },
          },
        },
        badgeAwards: {
          where: { revokedAt: null },
          select: {
            awardedAt: true,
            badge: {
              select: {
                code: true,
                title: true,
                iconSvg: true,
                iconText: true,
                tone: true,
              },
            },
          },
        },
        assignmentsAsLearner: {
          select: { instructor: { select: { id: true, name: true } } },
        },
        _count: {
          select: { submissions: true, attempts: true, diagnostics: true },
        },
      },
    });
    if (!user) throw new NotFoundException("User not found");

    const sessionWhere = {
      userId,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    };
    // Counted in full, listed in part. "342 live sessions" is the fact an
    // administrator needs; three hundred rows of it are not.
    const sessionTotal = await this.prisma.session.count({
      where: sessionWhere,
    });
    const sessions = await this.prisma.session.findMany({
      where: sessionWhere,
      take: LIVE_SESSION_PAGE,
      select: {
        id: true,
        createdAt: true,
        lastSeenAt: true,
        expiresAt: true,
        ip: true,
        userAgent: true,
        previewRole: true,
      },
      orderBy: { lastSeenAt: "desc" },
    });

    const [progress, attempts] = await Promise.all([
      this.courseProgress(userId),
      this.attemptHistory(userId),
    ]);

    return { ...user, sessions, sessionTotal, progress, attempts };
  }

  /**
   * How far this person has got, per track.
   *
   * Counted against the published version of each track they are enrolled on,
   * and only over lessons a candidate can actually see -- a hidden lesson is
   * not something to hold against their completion.
   */
  private async courseProgress(userId: string) {
    const enrollments = await this.prisma.enrollment.findMany({
      where: { userId },
      select: {
        status: true,
        cohort: {
          select: {
            title: true,
            programmeVersion: {
              select: {
                id: true,
                version: true,
                programme: { select: { code: true, title: true } },
                modules: {
                  where: { visible: true },
                  orderBy: { position: "asc" },
                  select: {
                    id: true,
                    title: true,
                    position: true,
                    lessons: { where: { visible: true }, select: { id: true } },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (enrollments.length === 0) return [];

    const lessonIds = enrollments.flatMap((e) =>
      e.cohort.programmeVersion.modules.flatMap((m) =>
        m.lessons.map((l) => l.id),
      ),
    );
    const done = lessonIds.length
      ? await this.prisma.lessonProgress.findMany({
          where: { userId, lessonId: { in: lessonIds }, status: "COMPLETED" },
          select: { lessonId: true, completedAt: true },
        })
      : [];
    const doneIds = new Set(done.map((d) => d.lessonId));

    return enrollments.map((enrollment) => {
      const version = enrollment.cohort.programmeVersion;
      const modules = version.modules;
      const lessons = modules.reduce((sum, m) => sum + m.lessons.length, 0);
      const completed = modules.reduce(
        (sum, m) => sum + m.lessons.filter((l) => doneIds.has(l.id)).length,
        0,
      );

      return {
        track: version.programme.code,
        title: version.programme.title,
        cohort: enrollment.cohort.title,
        enrollmentStatus: enrollment.status,
        version: version.version,
        lessons,
        lessonsCompleted: completed,
        percent: lessons === 0 ? 0 : Math.round((completed / lessons) * 100),
        modules: modules.map((m) => ({
          title: m.title,
          position: m.position,
          lessons: m.lessons.length,
          completed: m.lessons.filter((l) => doneIds.has(l.id)).length,
          done:
            m.lessons.length > 0 && m.lessons.every((l) => doneIds.has(l.id)),
        })),
      };
    });
  }

  /**
   * Every attempt this person has made, newest first, and how many they have
   * left. "Attempt count" is only half an answer without the limit beside it.
   */
  private async attemptHistory(userId: string) {
    const attempts = await this.prisma.attempt.findMany({
      where: { userId },
      orderBy: { startedAt: "desc" },
      take: 50,
      select: {
        id: true,
        startedAt: true,
        submittedAt: true,
        score: true,
        passed: true,
        assessment: {
          select: {
            id: true,
            code: true,
            title: true,
            passMark: true,
            maxAttempts: true,
            programmeVersion: {
              select: { programme: { select: { code: true } } },
            },
          },
        },
      },
    });

    const used = new Map<string, number>();
    for (const attempt of attempts) {
      used.set(
        attempt.assessment.id,
        (used.get(attempt.assessment.id) ?? 0) + 1,
      );
    }

    return attempts.map((attempt) => ({
      id: attempt.id,
      startedAt: attempt.startedAt,
      submittedAt: attempt.submittedAt,
      score: attempt.score,
      passed: attempt.passed,
      assessment: attempt.assessment.code,
      assessmentTitle: attempt.assessment.title,
      track: attempt.assessment.programmeVersion.programme.code,
      passMark: attempt.assessment.passMark,
      attemptsUsed: used.get(attempt.assessment.id) ?? 0,
      maxAttempts: attempt.assessment.maxAttempts,
    }));
  }

  async findOne(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: PUBLIC_FIELDS,
    });
    if (!user) throw new NotFoundException("User not found");
    return user;
  }

  async instructors() {
    return this.prisma.user.findMany({
      where: { role: Role.INSTRUCTOR, status: "ACTIVE" },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });
  }
}

/** Where the browser-facing application lives, for a link handed to a person. */
function WEB_BASE(): string {
  return process.env.WEB_BASE_URL ?? "http://localhost:3000";
}
