import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { BadgesService } from "./badges.service";
import {
  AwardBadgeDto,
  CreateBadgeDto,
  RevokeBadgeDto,
  UpdateBadgeDto,
} from "./badges.dto";

@Controller("badges")
export class BadgesController {
  constructor(private readonly badges: BadgesService) {}

  @Get()
  @RequirePermissions(P.BADGE_READ)
  list(@Query("programmeCode") programmeCode?: string) {
    return this.badges.list(programmeCode);
  }

  /** The caller's own shelf: held and still open. */
  @Get("mine")
  @RequirePermissions(P.BADGE_READ)
  mine(@CurrentActor() actor: Actor) {
    return this.badges.forLearner(actor, actor.id);
  }

  @Get("learner/:id")
  @RequireAnyPermission(P.PROGRESS_READ_ASSIGNED, P.PROGRESS_READ_ALL)
  forLearner(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.badges.forLearner(actor, id);
  }

  /** Defining a badge and its condition. Academy building. */
  @Post()
  @RequirePermissions(P.BADGE_WRITE)
  @Audit({ action: "badge.create", resourceType: "badge" })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateBadgeDto) {
    return this.badges.create(actor, dto);
  }

  @Patch(":id")
  @RequirePermissions(P.BADGE_WRITE)
  @Audit({ action: "badge.update", resourceType: "badge" })
  update(@Param("id") id: string, @Body() dto: UpdateBadgeDto) {
    return this.badges.update(id, dto);
  }

  /**
   * Removing a badge definition. Academy building, like defining one -- and it
   * refuses on any badge a learner actually holds.
   */
  @Delete(":id")
  @RequirePermissions(P.BADGE_WRITE)
  @Audit({ action: "badge.delete", resourceType: "badge" })
  remove(@Param("id") id: string) {
    return this.badges.remove(id);
  }

  /**
   * Awarding a judgement badge. An examiner act: it needs badge.award, which
   * the instructor holds and the manager who defined the badge does not.
   */
  @Post(":id/award")
  @RequirePermissions(P.BADGE_AWARD)
  @Audit({ action: "badge.award", resourceType: "badge" })
  award(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: AwardBadgeDto,
  ) {
    return this.badges.award(actor, id, dto);
  }

  @Post(":id/revoke")
  @RequirePermissions(P.BADGE_REVOKE)
  @Audit({ action: "badge.revoke", resourceType: "badge" })
  revoke(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: RevokeBadgeDto,
  ) {
    return this.badges.revoke(actor, id, dto);
  }
}
