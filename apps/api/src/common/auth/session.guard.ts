import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { randomUUID } from "node:crypto";
import type { Request } from "express";
import {
  PASSWORD_CHANGE_REQUIRED,
  permissionsFor,
  previewPermissionsFor,
  PROFILE_REQUIRED,
  profileRequiredFor,
} from "@aim/contracts";
import { PrismaService } from "../prisma/prisma.service";
import { IS_PUBLIC_KEY } from "./public.decorator";
import { ALLOWED_WHILE_PASSWORD_EXPIRED } from "./password-change.decorator";
import { ALLOWED_WHILE_PROFILE_INCOMPLETE } from "./profile.decorator";
import { hashSessionToken } from "./session-token";

/**
 * How stale `lastSeenAt` is allowed to get.
 *
 * The column is what an administrator reads to tell a live session from one
 * somebody abandoned, so it has to move. Writing it on every request would add
 * a write to every read in the system for a figure nobody needs to the second,
 * so it moves at most once a minute.
 */
const LAST_SEEN_INTERVAL_MS = 60_000;

/**
 * Resolves the presented bearer token to a live session, and from it to an
 * actor. Runs before PermissionsGuard.
 *
 * Deliberately strict about three things:
 *  - a revoked or expired session is not a session;
 *  - a suspended account has no session, even if the row is still valid;
 *  - the role and permissions come from the database on every request, so a
 *    role change or a suspension takes effect on the next call rather than
 *    whenever a token happens to expire.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  private readonly logger = new Logger(SessionGuard.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    request.requestId =
      (request.header("x-request-id") as string) || randomUUID();

    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;

    const token = extractBearer(request.header("authorization"));
    if (!token) {
      throw new UnauthorizedException("Session required");
    }

    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: { user: true },
    });

    if (!session || session.revokedAt || session.expiresAt <= new Date()) {
      throw new UnauthorizedException("Session expired or revoked");
    }
    // An archived account is closed. It keeps its history and cannot act.
    if (session.user.archivedAt) {
      throw new UnauthorizedException("Account archived");
    }

    if (session.user.status !== "ACTIVE") {
      // A suspension with an end date lifts itself, here, on the first request
      // after it lapses. Leaving that to a scheduled job would mean the
      // account stays locked for however long the schedule happens to be.
      const lapsed =
        session.user.suspendedUntil !== null &&
        session.user.suspendedUntil <= new Date();

      if (!lapsed) {
        throw new UnauthorizedException(
          session.user.suspendedUntil
            ? `Account suspended until ${session.user.suspendedUntil.toISOString()}`
            : "Account suspended",
        );
      }

      await this.prisma.user.update({
        where: { id: session.user.id },
        data: {
          status: "ACTIVE",
          suspendedAt: null,
          suspendedUntil: null,
          suspendedReason: null,
        },
      });
    }

    /**
     * An account held at the password screen has a session and no authority.
     *
     * Enforced here rather than left to the interface, because "the web app
     * redirects you to the password page" is a routing decision and this is a
     * boundary: a caller with a valid bearer token and a forced reset pending
     * must not be able to reach a single route by skipping the browser. The
     * handful of exceptions are the ones that screen needs, and they say so
     * with a decorator.
     */
    if (session.user.mustChangePassword) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOWED_WHILE_PASSWORD_EXPIRED,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        // A distinguishable code, not just a 403. The web application has to
        // tell this apart from a permission refusal: one sends the person to
        // the password screen, the other is the matrix doing its job.
        throw new ForbiddenException({
          statusCode: 403,
          code: PASSWORD_CHANGE_REQUIRED,
          message:
            "Your password must be changed before you can do anything else.",
        });
      }
    }

    /**
     * An account whose profile is incomplete is held the same way.
     *
     * Checked after the password hold, so an account created by an
     * administrator sets its own password first and then completes its
     * profile. Administrators are never held: they fix everybody else's
     * account and must not be locked out of the screens that do it.
     */
    if (
      profileRequiredFor(session.user.role) &&
      session.user.profileCompletedAt === null
    ) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOWED_WHILE_PROFILE_INCOMPLETE,
        [context.getHandler(), context.getClass()],
      );
      if (!allowed) {
        throw new ForbiddenException({
          statusCode: 403,
          code: PROFILE_REQUIRED,
          message:
            "Complete your profile before you can do anything else.",
        });
      }
    }

    // A preview narrows: the actor holds the previewed role's reads *instead
    // of* their own permissions, not in addition to them. Their identity is
    // untouched, so every audit record still names the person who signed in.
    const previewRole = session.previewRole ?? null;

    // When this session was last actually used. Throttled, and deliberately
    // not awaited: it describes the request rather than deciding it, and a
    // slow write here would slow every read in the system.
    if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_INTERVAL_MS) {
      void this.prisma.session
        .update({
          where: { id: session.id },
          data: { lastSeenAt: new Date() },
        })
        .catch((error: unknown) => {
          this.logger.warn(
            `Could not touch lastSeenAt for session ${session.id}: ${String(error)}`,
          );
        });
    }

    request.actor = {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      role: session.user.role,
      sessionId: session.id,
      permissions: previewRole
        ? previewPermissionsFor(previewRole)
        : permissionsFor(session.user.role),
      previewRole,
    };

    return true;
  }
}

function extractBearer(header?: string): string | null {
  if (!header) return null;
  const [scheme, value] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !value) return null;
  return value.trim() || null;
}
