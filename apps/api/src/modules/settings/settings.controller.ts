import { Body, Controller, Get, Put } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { SettingsService } from "./settings.service";
import { SetFlagDto, UpsertSettingDto } from "./settings.dto";

@Controller("settings")
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** A manager may read the configuration they operate within; only administration changes it. */
  @Get()
  @RequirePermissions(P.SETTINGS_READ)
  list() {
    return this.settings.listSettings();
  }

  @Get("flags")
  @RequirePermissions(P.SETTINGS_READ)
  flags() {
    return this.settings.listFlags();
  }

  @Put()
  @RequirePermissions(P.SETTINGS_WRITE)
  @Audit({ action: "settings.update", resourceType: "setting" })
  upsert(@CurrentActor() actor: Actor, @Body() dto: UpsertSettingDto) {
    return this.settings.upsertSetting(actor, dto);
  }

  @Put("flags")
  @RequirePermissions(P.FEATURE_FLAG_WRITE)
  @Audit({ action: "featureflag.update", resourceType: "feature_flag" })
  setFlag(@CurrentActor() actor: Actor, @Body() dto: SetFlagDto) {
    return this.settings.setFlag(actor, dto);
  }
}
