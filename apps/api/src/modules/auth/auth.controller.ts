import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Put,
  Req,
} from "@nestjs/common";
import type { Request } from "express";
import { permissionsFor } from "@aim/contracts";
import { Public } from "../../common/auth/public.decorator";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import { AllowedInPreview } from "../../common/auth/allowed-in-preview.decorator";
import { AllowedWhilePasswordExpired } from "../../common/auth/password-change.decorator";
import { AllowedWhileProfileIncomplete } from "../../common/auth/profile.decorator";
import type { Actor } from "../../common/auth/actor";
import { AuthService, type RequestContext } from "./auth.service";
import {
  ChangePasswordDto,
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResendVerificationDto,
  VerifyEmailDto,
  ResetPasswordDto,
  StartPreviewDto,
} from "./auth.dto";
import { PERMISSIONS as P } from "@aim/contracts";

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * Enrolling yourself.
   *
   * Public, because somebody without an account cannot present a session.
   * What keeps it safe is not who may call it but what it can produce: the
   * service fixes the role, an administrator can close it with a flag, and
   * the origin brake stops it being used in bulk. See `AuthService.register`.
   */
  @Public()
  @Post("register")
  @HttpCode(201)
  register(@Body() dto: RegisterDto, @Req() request: Request) {
    return this.auth.register(dto, context(request));
  }

  @Public()
  @Post("login")
  @HttpCode(200)
  login(@Body() dto: LoginDto, @Req() request: Request) {
    return this.auth.login(dto.email, dto.password, context(request));
  }

  /**
   * Every authenticated role may ask who it is. Declared with the one
   * permission every role holds, so the route still states its requirement
   * rather than opting out of the rule.
   */
  @Post("logout")
  @HttpCode(204)
  @AllowedInPreview()
  @AllowedWhilePasswordExpired()
  @AllowedWhileProfileIncomplete()
  @RequirePermissions(P.PROGRAMME_READ)
  @Audit({ action: "auth.logout", resourceType: "session" })
  async logout(@CurrentActor() actor: Actor): Promise<void> {
    await this.auth.logout(actor.sessionId);
  }

  @Get("me")
  @AllowedWhilePasswordExpired()
  @AllowedWhileProfileIncomplete()
  @RequirePermissions(P.PROGRAMME_READ)
  async me(@CurrentActor() actor: Actor) {
    const standing = await this.auth.passwordStanding(actor);

    return {
      user: {
        id: actor.id,
        email: actor.email,
        name: actor.name,
        role: actor.role,
        status: "ACTIVE",
      },
      // What they hold right now, which during a preview is narrower than
      // their role. Reading it back off the role would have the interface
      // offering buttons the guard is about to refuse.
      permissions: actor.permissions,
      previewRole: actor.previewRole,
      /** Their own permissions, so the interface can say what is being set aside. */
      ownPermissions: permissionsFor(actor.role),
      ...standing,
    };
  }

  // ── The password ──────────────────────────────────────────────────────────

  /**
   * Changing your own password.
   *
   * Allowed while the account is held at the password screen, for the obvious
   * reason: it is the act that clears the hold. Not allowed during a preview,
   * which is not an exception -- a preview is for looking at a portal, and
   * changing a credential is not looking.
   */
  @Post("password")
  @HttpCode(200)
  @AllowedWhilePasswordExpired()
  @AllowedWhileProfileIncomplete()
  @RequirePermissions(P.PROGRAMME_READ)
  @Audit({ action: "auth.password.change", resourceType: "user" })
  changePassword(
    @CurrentActor() actor: Actor,
    @Body() dto: ChangePasswordDto,
    @Req() request: Request,
  ) {
    return this.auth.changePassword(
      actor,
      dto.currentPassword,
      dto.newPassword,
      dto.otherSessions !== "KEEP",
      context(request),
    );
  }

  /**
   * "I have forgotten my password."
   *
   * Public, because somebody who cannot sign in cannot present a session. It
   * answers identically for an address that exists and one that does not --
   * see the service, where that property is the whole design.
   */
  /**
   * Confirming an address.
   *
   * Public because the person clicking has no session -- that is the whole
   * point of the flow -- and safe for the reason the reset route is: the token
   * is the credential, it is single use, it expires, and it is stored only as
   * a hash under its own domain separator.
   */
  @Public()
  @Post("verify")
  @HttpCode(200)
  verify(@Body() dto: VerifyEmailDto, @Req() request: Request) {
    return this.auth.verifyEmail(dto.token, context(request));
  }

  /** Another link, for somebody who lost the first. Answers the same either way. */
  @Public()
  @Post("verify/resend")
  @HttpCode(202)
  resendVerification(
    @Body() dto: ResendVerificationDto,
    @Req() request: Request,
  ) {
    return this.auth.resendVerification(dto.email, context(request));
  }

  @Public()
  @Post("password/forgot")
  @HttpCode(202)
  forgot(@Body() dto: ForgotPasswordDto, @Req() request: Request) {
    return this.auth.requestReset(dto.email, context(request));
  }

  /**
   * Spending a reset link. Public for the same reason, and safe for a
   * different one: the token is the credential, it is single-use, and it dies
   * in half an hour.
   */
  @Public()
  @Post("password/reset")
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto, @Req() request: Request) {
    return this.auth.resetPassword(
      dto.token,
      dto.newPassword,
      context(request),
    );
  }

  // ── The profile ───────────────────────────────────────────────────────────

  /** Your own profile, as it stands. Readable while the profile hold is on. */
  @Get("profile")
  @AllowedWhileProfileIncomplete()
  @RequirePermissions(P.PROGRAMME_READ)
  profile(@CurrentActor() actor: Actor) {
    return this.auth.getProfile(actor);
  }

  /**
   * Completing or updating your own profile. Every field is required; the
   * first complete save lifts the hold. Not during a preview: it is a write.
   */
  @Put("profile")
  @HttpCode(200)
  @AllowedWhileProfileIncomplete()
  @RequirePermissions(P.PROGRAMME_READ)
  @Audit({ action: "user.profile.update", resourceType: "user" })
  updateProfile(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.auth.updateProfile(actor, body);
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  /** What is signed in as you, and where. */
  @Get("sessions")
  @AllowedWhilePasswordExpired()
  @AllowedWhileProfileIncomplete()
  @RequirePermissions(P.PROGRAMME_READ)
  sessions(@CurrentActor() actor: Actor) {
    return this.auth.listSessions(actor);
  }

  /** Ending one of them. Your own only: the id is scoped in the query. */
  @Delete("sessions/:id")
  @HttpCode(200)
  @RequirePermissions(P.PROGRAMME_READ)
  @Audit({ action: "auth.session.revoke", resourceType: "session" })
  revokeSession(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Req() request: Request,
  ) {
    return this.auth.revokeOwnSession(actor, id, context(request));
  }

  /** Ending every one but this. The "I left it signed in somewhere" button. */
  @Post("sessions/revoke-others")
  @HttpCode(200)
  @RequirePermissions(P.PROGRAMME_READ)
  @Audit({ action: "auth.session.revoke", resourceType: "session" })
  revokeOthers(@CurrentActor() actor: Actor, @Req() request: Request) {
    return this.auth.revokeOtherSessions(actor, context(request));
  }

  // ── Role preview ──────────────────────────────────────────────────────────

  /**
   * Looking at another role's screens.
   *
   * Not impersonation: there is no `actor.impersonate` in the vocabulary and
   * this is not a quiet version of it. The session keeps its identity and
   * loses authority -- it holds the previewed role's reads and nothing else,
   * and every write is refused until the preview ends.
   */
  @Post("preview")
  @HttpCode(200)
  @RequirePermissions(P.ROLE_PREVIEW)
  @Audit({ action: "role.preview.start", resourceType: "session" })
  startPreview(@CurrentActor() actor: Actor, @Body() dto: StartPreviewDto) {
    return this.auth.startPreview(actor, dto.role);
  }

  /**
   * The way out. Allowed in preview for the obvious reason: without it the
   * only way to stop previewing would be to sign out.
   */
  @Post("preview/end")
  @HttpCode(200)
  @AllowedInPreview()
  @RequirePermissions(P.PROGRAMME_READ)
  @Audit({ action: "role.preview.end", resourceType: "session" })
  endPreview(@CurrentActor() actor: Actor) {
    return this.auth.endPreview(actor);
  }
}

/** Where a request came from, for the audit record and the session row. */
function context(request: Request): RequestContext {
  return {
    ip: request.ip,
    userAgent: request.header("user-agent") ?? null,
    requestId: request.requestId ?? "unknown",
  };
}
