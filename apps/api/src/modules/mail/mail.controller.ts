import { Body, Controller, Get, Post, Put } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { MailConfigService } from "./mail-config.service";
import {
  SaveEnrolmentPolicyDto,
  SaveMailConfigDto,
  SendTestMailDto,
  SetMailEnabledDto,
} from "./mail.dto";

/**
 * How this institution sends mail, and where new candidates land.
 *
 * Every route here is administration-only, including the read. A manager may
 * read ordinary settings; the mail configuration is not an ordinary setting,
 * because it names the account the institution speaks as and it is the one
 * record with a stored credential beside it.
 */
@Controller("mail")
export class MailController {
  constructor(private readonly config: MailConfigService) {}

  /** The configuration, the provider list, and the enrolment policy. Never the secret. */
  @Get("config")
  @RequirePermissions(P.MAIL_CONFIG_READ)
  current() {
    return this.config.current();
  }

  @Put("config")
  @RequirePermissions(P.MAIL_CONFIG_WRITE)
  @Audit({ action: "mail.config.save", resourceType: "mail-config" })
  save(@CurrentActor() actor: Actor, @Body() dto: SaveMailConfigDto) {
    return this.config.save(actor, dto);
  }

  /**
   * One real message, to prove the credentials work.
   *
   * Audited, because it spends the institution's quota against a real provider
   * and an administrator should be able to see who did it.
   */
  @Post("test")
  @RequirePermissions(P.MAIL_TEST)
  @Audit({ action: "mail.test", resourceType: "mail-config" })
  test(@CurrentActor() actor: Actor, @Body() dto: SendTestMailDto) {
    return this.config.test(actor, dto);
  }

  @Put("enabled")
  @RequirePermissions(P.MAIL_CONFIG_WRITE)
  @Audit({ action: "mail.enabled.set", resourceType: "mail-config" })
  setEnabled(@CurrentActor() actor: Actor, @Body() dto: SetMailEnabledDto) {
    return this.config.setEnabled(actor, dto);
  }

  /** Which cohort a verified candidate joins, and whether they join one at all. */
  @Put("enrolment")
  @RequirePermissions(P.MAIL_CONFIG_WRITE)
  @Audit({ action: "enrolment.policy.save", resourceType: "setting" })
  saveEnrolment(
    @CurrentActor() actor: Actor,
    @Body() dto: SaveEnrolmentPolicyDto,
  ) {
    return this.config.saveEnrolmentPolicy(actor, dto);
  }
}
