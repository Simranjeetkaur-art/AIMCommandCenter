import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { type Permission } from "@aim/contracts";
import { AuditService } from "../audit/audit.service";
import { AUDIT_KEY, type AuditSpec } from "../audit/audit.decorator";
import { IS_PUBLIC_KEY } from "./public.decorator";
import {
  PERMISSIONS_ALL_KEY,
  PERMISSIONS_ANY_KEY,
} from "./permissions.decorator";
import { ALLOWED_IN_PREVIEW } from "./allowed-in-preview.decorator";
import type { Actor } from "./actor";

/**
 * The declared-permission rule, enforced.
 *
 * Two things here are easy to get wrong and are worth stating.
 *
 * First, a handler that declares nothing is not open by default and is not
 * closed quietly either: it is refused and logged as a configuration defect, so
 * an undeclared route surfaces the first time anyone calls it rather than the
 * first time anyone abuses it.
 *
 * Second, this guard writes its own audit record. Nest runs guards before
 * interceptors, so a refusal here never reaches AuditInterceptor -- which would
 * mean the most security-relevant events in the system, the refused ones, were
 * the only ones missing from the log.
 */
/** The methods a preview may still use. */
const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class PermissionsGuard implements CanActivate {
  private readonly logger = new Logger(PermissionsGuard.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (context.getType() !== "http") return true;

    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, targets))
      return true;

    const request = context.switchToHttp().getRequest<Request>();
    const actor = request.actor;
    if (!actor) {
      throw new UnauthorizedException("Session required");
    }

    const requireAll = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_ALL_KEY,
      targets,
    );
    const requireAny = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_ANY_KEY,
      targets,
    );

    const hasAll = Array.isArray(requireAll) && requireAll.length > 0;
    const hasAny = Array.isArray(requireAny) && requireAny.length > 0;

    const handler = `${context.getClass().name}.${context.getHandler().name}`;

    if (!hasAll && !hasAny) {
      this.logger.error(
        `${handler} declares no permission. Refusing. Add @RequirePermissions(), @RequireAnyPermission() or @Public().`,
      );
      await this.recordDenial(request, actor, targets, {
        reason: "route-declares-no-permission",
        handler,
        required: [],
      });
      throw new ForbiddenException("Route declares no permission");
    }

    request.requiredPermissions = [
      ...(requireAll ?? []),
      ...(requireAny ?? []),
    ];

    // The second lock on preview, independent of permissions.
    //
    // While a preview is on the actor already holds nothing but reads, so this
    // should never be the thing that refuses a request. It is here anyway,
    // because "a preview cannot write" is the property the feature rests on
    // and it should not depend on a hand-maintained list being right.
    if (actor.previewRole && !SAFE_METHODS.has(request.method)) {
      const allowed = this.reflector.getAllAndOverride<boolean>(
        ALLOWED_IN_PREVIEW,
        targets,
      );
      if (!allowed) {
        await this.recordDenial(request, actor, targets, {
          reason: "write-during-preview",
          handler,
          required: request.requiredPermissions,
          previewRole: actor.previewRole,
        });
        throw new ForbiddenException(
          `You are previewing the ${actor.previewRole} portal, which is read-only. Leave the preview to act.`,
        );
      }
    }

    const held = new Set<string>(actor.permissions);

    if (hasAll && !requireAll.every((p) => held.has(p))) {
      await this.recordDenial(request, actor, targets, {
        reason: "missing-required-permission",
        handler,
        required: requireAll,
        mode: "all",
      });
      throw new ForbiddenException(
        this.refusal(actor, requireAll, "does not hold"),
      );
    }

    if (hasAny && !requireAny.some((p) => held.has(p))) {
      await this.recordDenial(request, actor, targets, {
        reason: "missing-required-permission",
        handler,
        required: requireAny,
        mode: "any",
      });
      throw new ForbiddenException(
        this.refusal(actor, requireAny, "holds none of"),
      );
    }

    return true;
  }

  /**
   * Says why, in terms of what the caller is actually doing. During a preview
   * "ADMIN does not hold review.claim" is true of nobody and explains nothing;
   * what they need to know is that the preview is why.
   */
  private refusal(
    actor: Actor,
    required: readonly Permission[],
    verb: string,
  ): string {
    const subject = actor.previewRole
      ? `A preview of the ${actor.previewRole} portal`
      : String(actor.role);
    return `${subject} ${verb} ${required.join(", ")}`;
  }

  /**
   * Records the refusal. Uses the route's own audit action where it declares
   * one, so a refused approval and a successful one sit under the same action
   * in the log and can be compared.
   */
  private async recordDenial(
    request: Request,
    actor: Actor,
    targets: Parameters<Reflector["getAllAndOverride"]>[1],
    detail: Record<string, unknown>,
  ): Promise<void> {
    const spec = this.reflector.getAllAndOverride<AuditSpec | undefined>(
      AUDIT_KEY,
      targets,
    );

    await this.audit.record({
      actorId: actor.id,
      actorRole: actor.role,
      actorEmail: actor.email,
      action: spec?.action ?? "access.denied",
      resourceType: spec?.resourceType ?? "route",
      resourceId:
        (request.params as Record<string, string> | undefined)?.[
          spec?.idParam ?? "id"
        ] ?? null,
      outcome: "DENIED",
      ip: request.ip ?? null,
      userAgent: request.header("user-agent") ?? null,
      requestId: request.requestId ?? "unknown",
      metadata: {
        method: request.method,
        path: request.originalUrl,
        role: actor.role,
        ...detail,
      },
    });
  }
}
