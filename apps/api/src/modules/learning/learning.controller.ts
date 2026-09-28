import { Body, Controller, Get, Param, Put } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { LearningService } from "./learning.service";
import { SetProgressDto } from "./learning.dto";

@Controller()
export class LearningController {
  constructor(private readonly learning: LearningService) {}

  /** The caller's own record. Every role that has one can read it. */
  @Get("me/record")
  @RequirePermissions(P.PROGRESS_READ_SELF)
  myRecord(@CurrentActor() actor: Actor) {
    return this.learning.record(actor);
  }

  @Put("me/progress")
  @RequirePermissions(P.PROGRESS_WRITE_SELF)
  @Audit({ action: "progress.update", resourceType: "lesson_progress" })
  setProgress(@CurrentActor() actor: Actor, @Body() dto: SetProgressDto) {
    return this.learning.setProgress(actor, dto);
  }

  /**
   * Somebody else's record.
   *
   * The permission gets you to the handler; AccessScopeService decides whether
   * this particular learner is yours to see. An examiner holding
   * progress.read.assigned who asks for an unassigned learner is answered with
   * a 404, not a 403: a 403 would confirm the learner exists.
   */
  @Get("learners/:id/record")
  @RequireAnyPermission(P.PROGRESS_READ_ASSIGNED, P.PROGRESS_READ_ALL)
  learnerRecord(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.learning.record(actor, id);
  }

  @Get("learners")
  @RequireAnyPermission(P.PROGRESS_READ_ASSIGNED, P.PROGRESS_READ_ALL)
  learners(@CurrentActor() actor: Actor) {
    return this.learning.learners(actor);
  }
}
