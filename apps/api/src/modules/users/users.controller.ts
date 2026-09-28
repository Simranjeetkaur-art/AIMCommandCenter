import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { UsersService } from "./users.service";
import type { RequestContext } from "../auth/auth.service";
import {
  ArchiveUserDto,
  AssignRoleDto,
  ClearLockoutDto,
  ConfirmEmailDto,
  CreateUserDto,
  ListUsersQuery,
  ResetUserPasswordDto,
  RevokeUserSessionsDto,
  SuspendUserDto,
  UpdateUserDto,
} from "./users.dto";

@Controller("users")
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(P.USER_READ)
  list(@Query() query: ListUsersQuery) {
    return this.users.list(query);
  }

  @Get("instructors")
  @RequirePermissions(P.INSTRUCTOR_ASSIGN)
  instructors() {
    return this.users.instructors();
  }

  @Get(":id")
  @RequirePermissions(P.USER_READ)
  findOne(@Param("id") id: string) {
    return this.users.findOne(id);
  }

  /** One person, whole: enrolments, credentials, badges, examiners, sessions. */
  @Get(":id/detail")
  @RequirePermissions(P.USER_READ)
  detail(@Param("id") id: string) {
    return this.users.detail(id);
  }

  @Post()
  @RequirePermissions(P.USER_CREATE)
  @Audit({ action: "user.create", resourceType: "user" })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateUserDto) {
    return this.users.create(actor, dto);
  }

  /** Correcting the record. Separate from changing what they may do. */
  @Patch(":id")
  @RequirePermissions(P.USER_UPDATE)
  @Audit({ action: "user.update", resourceType: "user" })
  update(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.users.update(actor, id, dto);
  }

  /** Archiving. There is no delete, and deliberately so. */
  @Post(":id/archive")
  @RequirePermissions(P.USER_ARCHIVE)
  @Audit({ action: "user.archive", resourceType: "user" })
  archive(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ArchiveUserDto,
  ) {
    return this.users.setArchived(actor, id, dto);
  }

  // ── The password ──────────────────────────────────────────────────────────

  /**
   * Resetting an account's password.
   *
   * `user.password.reset` rather than `user.update`: correcting a typo in
   * somebody's name and ending the credential they sign in with are different
   * acts, and one permission covering both would make the narrower one
   * unauditable.
   */
  @Post(":id/password-reset")
  @RequirePermissions(P.USER_PASSWORD_RESET)
  @Audit({ action: "user.password.reset", resourceType: "user" })
  resetPassword(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ResetUserPasswordDto,
    @Req() request: Request,
  ) {
    return this.users.resetPassword(actor, id, dto, requestContext(request));
  }

  /** Lifting an automatic lockout before it lapses by itself. */
  @Post(":id/unlock")
  @RequirePermissions(P.USER_PASSWORD_RESET)
  @Audit({ action: "user.lockout.clear", resourceType: "user" })
  clearLockout(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ClearLockoutDto,
  ) {
    return this.users.clearLockout(actor, id, dto);
  }

  /**
   * Confirming an address by hand, for a candidate mail cannot reach.
   *
   * An identity correction, so it rides on user.update like the other edits
   * to who somebody is; the stated reason goes on the audit event.
   */
  @Post(":id/verify-email")
  @RequirePermissions(P.USER_UPDATE)
  @Audit({ action: "user.email.confirm", resourceType: "user" })
  confirmEmail(@Param("id") id: string, @Body() _dto: ConfirmEmailDto) {
    return this.users.confirmEmail(id);
  }

  /** What is signed in as this person. A read, so USER_READ carries it. */
  @Get(":id/sessions")
  @RequirePermissions(P.USER_READ)
  sessions(@Param("id") id: string) {
    return this.users.sessions(id);
  }

  /**
   * Ending every live session on an account at once, with a stated reason.
   *
   * The single-session control above is the one for "that laptop is gone".
   * This is the one for "sign them out of everything", which is a different
   * decision and the reason it demands a why, like every other act the
   * institution takes on a person's account.
   */
  @Post(":id/sessions/revoke")
  @RequirePermissions(P.USER_SESSION_REVOKE)
  @Audit({ action: "user.session.revoke", resourceType: "user" })
  revokeSessions(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: RevokeUserSessionsDto,
  ) {
    return this.users.revokeSessions(actor, id, dto);
  }

  @Patch(":id/role")
  @RequirePermissions(P.USER_ROLE_ASSIGN)
  @Audit({ action: "user.role.assign", resourceType: "user" })
  assignRole(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: AssignRoleDto,
  ) {
    return this.users.assignRole(actor, id, dto);
  }

  @Patch(":id/status")
  @RequirePermissions(P.USER_SUSPEND)
  @Audit({ action: "user.suspend", resourceType: "user" })
  setSuspension(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: SuspendUserDto,
  ) {
    return this.users.setSuspension(actor, id, dto);
  }
}

/** Where a request came from, for the audit record on a reset. */
function requestContext(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.header("user-agent") ?? null,
    requestId: request.requestId ?? "unknown",
  };
}
