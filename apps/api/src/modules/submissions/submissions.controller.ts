import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { SubmissionsService } from "./submissions.service";
import {
  CreateSubmissionDto,
  ListSubmissionsQuery,
  ResubmitDto,
} from "./submissions.dto";

@Controller("submissions")
export class SubmissionsController {
  constructor(private readonly submissions: SubmissionsService) {}

  @Get("mine")
  @RequirePermissions(P.SUBMISSION_READ_SELF)
  mine(@CurrentActor() actor: Actor) {
    return this.submissions.mine(actor);
  }

  /**
   * One list, three answers. An examiner sees their assigned learners, a
   * manager sees everyone, and neither sees a row the other does by accident:
   * the rows come from AccessScopeService, not from the query string.
   */
  @Get()
  @RequireAnyPermission(P.SUBMISSION_READ_ASSIGNED, P.SUBMISSION_READ_ALL)
  list(@CurrentActor() actor: Actor, @Query() query: ListSubmissionsQuery) {
    return this.submissions.list(actor, query);
  }

  @Get(":id")
  @RequireAnyPermission(
    P.SUBMISSION_READ_ASSIGNED,
    P.SUBMISSION_READ_ALL,
    P.SUBMISSION_READ_SELF,
  )
  detail(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.submissions.detail(actor, id);
  }

  @Post()
  @RequirePermissions(P.SUBMISSION_CREATE_SELF)
  @Audit({ action: "submission.create", resourceType: "submission" })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateSubmissionDto) {
    return this.submissions.create(actor, dto);
  }

  @Post(":id/resubmit")
  @RequirePermissions(P.SUBMISSION_RESUBMIT_SELF)
  @Audit({ action: "submission.resubmit", resourceType: "submission" })
  resubmit(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ResubmitDto,
  ) {
    return this.submissions.resubmit(actor, id, dto);
  }
}
