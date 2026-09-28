import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, catchError, tap, throwError } from "rxjs";
import type { Request } from "express";
import { AUDIT_KEY, type AuditSpec } from "./audit.decorator";
import { AuditService } from "./audit.service";

const READ_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

/**
 * Writes the audit record for every state-changing request, and for reads that
 * are themselves sensitive.
 *
 * Three decisions worth stating:
 *  - Failures are recorded too, with outcome DENIED or FAILURE. A log of only
 *    the successful attempts tells you nothing about who probed what.
 *  - The actor is taken from the request, which SessionGuard populated from a
 *    session row. There is no header, claim or body field that can set it.
 *  - The record is written after the handler resolves, so resourceId is known
 *    even for a create.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const request = context.switchToHttp().getRequest<Request>();
    const spec = this.reflector.getAllAndOverride<AuditSpec | undefined>(
      AUDIT_KEY,
      [context.getHandler(), context.getClass()],
    );

    const isRead = READ_METHODS.has(request.method);
    const shouldRecord =
      Boolean(spec) && (!isRead || spec?.recordReads === true);

    if (!shouldRecord || !spec) return next.handle();

    const base = {
      action: spec.action,
      resourceType: spec.resourceType,
      requestId: request.requestId ?? "unknown",
      ip: request.ip ?? null,
      userAgent: request.header("user-agent") ?? null,
    };

    const idFromParams = () => {
      const key = spec.idParam ?? "id";
      const params = request.params as Record<string, string> | undefined;
      return params?.[key] ?? null;
    };

    return next.handle().pipe(
      tap((result) => {
        const actor = request.actor;
        if (!actor) return;
        void this.audit.record({
          ...base,
          actorId: actor.id,
          actorRole: actor.role,
          actorEmail: actor.email,
          resourceId: resourceIdOf(result) ?? idFromParams(),
          outcome: "SUCCESS",
          metadata: {
            method: request.method,
            path: request.originalUrl,
            required: [...(request.requiredPermissions ?? [])],
            ...(reasonOf(request) ? { reason: reasonOf(request) } : {}),
            // A review decision's written rationale is its reason; it arrives
            // as `comment`. Recorded so the log says why, not only that.
            ...(spec.action.startsWith("review.") && rationaleOf(request)
              ? { rationale: rationaleOf(request) }
              : {}),
          },
        });
      }),
      catchError((error: unknown) => {
        const actor = request.actor;
        if (actor) {
          const status = (error as { status?: number })?.status ?? 500;
          void this.audit.record({
            ...base,
            actorId: actor.id,
            actorRole: actor.role,
            actorEmail: actor.email,
            resourceId: idFromParams(),
            outcome:
              status === 403 || status === 401 || status === 404
                ? "DENIED"
                : "FAILURE",
            metadata: {
              method: request.method,
              path: request.originalUrl,
              required: [...(request.requiredPermissions ?? [])],
              status,
              message: (error as Error)?.message ?? "unknown",
            },
          });
        }
        return throwError(() => error);
      }),
    );
  }
}

function resourceIdOf(result: unknown): string | null {
  if (result && typeof result === "object" && "id" in result) {
    const id = (result as { id: unknown }).id;
    return typeof id === "string" ? id : null;
  }
  return null;
}

/** Reasons are mandatory on several actions; surface them in the record. */
function reasonOf(request: Request): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  const reason = body?.reason;
  return typeof reason === "string" ? reason : null;
}

/** The rationale a review decision carries, which the API names `comment`. */
function rationaleOf(request: Request): string | null {
  const body = request.body as Record<string, unknown> | undefined;
  const comment = body?.comment;
  return typeof comment === "string" ? comment : null;
}
