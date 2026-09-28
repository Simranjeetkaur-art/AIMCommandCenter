import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { CredentialStatus } from "@prisma/client";
import { PERMISSIONS as P } from "@aim/contracts";
import { Public } from "../../common/auth/public.decorator";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { CredentialsService } from "./credentials.service";
import { CredentialActionDto, IssueCredentialDto } from "./credentials.dto";

@Controller("credentials")
export class CredentialsController {
  constructor(private readonly credentials: CredentialsService) {}

  @Get("mine")
  @RequirePermissions(P.CREDENTIAL_READ_SELF)
  mine(@CurrentActor() actor: Actor) {
    return this.credentials.mine(actor);
  }

  @Get()
  @RequirePermissions(P.CREDENTIAL_READ_ALL)
  @Audit({
    action: "credential.list",
    resourceType: "credential",
    recordReads: true,
  })
  list(
    @Query("status") status?: CredentialStatus,
    @Query("q") q?: string,
  ) {
    return this.credentials.list(status, q);
  }

  /** Checking a certificate someone has shown you, by the serial printed on it. */
  @Get("serial/:serial")
  @RequirePermissions(P.CREDENTIAL_READ_ALL)
  @Audit({
    action: "credential.lookup",
    resourceType: "credential",
    recordReads: true,
  })
  bySerial(@CurrentActor() actor: Actor, @Param("serial") serial: string) {
    return this.credentials.bySerial(actor, serial);
  }

  @Get("gates")
  @RequirePermissions(P.CREDENTIAL_ISSUE)
  gates(
    @Query("userId") userId: string,
    @Query("programmeVersionId") versionId: string,
  ) {
    return this.credentials.evaluateGates(userId, versionId);
  }

  @Get(":id")
  @RequireAnyPermission(P.CREDENTIAL_READ_SELF, P.CREDENTIAL_READ_ALL)
  detail(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.credentials.detail(actor, id);
  }

  @Get(":id/certificate")
  @RequireAnyPermission(P.CREDENTIAL_READ_SELF, P.CREDENTIAL_READ_ALL)
  @Audit({
    action: "credential.certificate.download",
    resourceType: "credential",
    recordReads: true,
  })
  certificate(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.credentials.certificate(actor, id);
  }

  @Post()
  @RequirePermissions(P.CREDENTIAL_ISSUE)
  @Audit({ action: "credential.issue", resourceType: "credential" })
  issue(@CurrentActor() actor: Actor, @Body() dto: IssueCredentialDto) {
    return this.credentials.issue(actor, dto);
  }

  @Post(":id/suspend")
  @RequirePermissions(P.CREDENTIAL_SUSPEND)
  @Audit({ action: "credential.suspend", resourceType: "credential" })
  suspend(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: CredentialActionDto,
  ) {
    return this.credentials.suspend(actor, id, dto);
  }

  @Post(":id/revoke")
  @RequirePermissions(P.CREDENTIAL_REVOKE)
  @Audit({ action: "credential.revoke", resourceType: "credential" })
  revoke(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: CredentialActionDto,
  ) {
    return this.credentials.revoke(actor, id, dto);
  }

  @Post(":id/reinstate")
  @RequirePermissions(P.CREDENTIAL_REINSTATE)
  @Audit({ action: "credential.reinstate", resourceType: "credential" })
  reinstate(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: CredentialActionDto,
  ) {
    return this.credentials.reinstate(actor, id, dto);
  }
}

/**
 * Verification is deliberately unauthenticated: a credential nobody outside
 * the institution can check is not worth much. It answers with standing and
 * the programme, and nothing about the holder beyond the name on the
 * certificate they chose to show you.
 */
@Controller("verify")
export class VerifyController {
  constructor(private readonly credentials: CredentialsService) {}

  @Public()
  @Get(":serial")
  verify(@Param("serial") serial: string) {
    return this.credentials.verify(serial);
  }
}
