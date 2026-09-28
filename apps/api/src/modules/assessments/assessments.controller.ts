import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { AssessmentsService } from "./assessments.service";
import { AttemptRequestsService } from "./attempt-requests.service";
import { StartAttemptDto, SubmitAttemptDto } from "./assessments.dto";

@Controller("assessments")
export class AssessmentsController {
  constructor(
    private readonly assessments: AssessmentsService,
    private readonly attemptRequests: AttemptRequestsService,
  ) {}

  @Get("mine")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  mine(@CurrentActor() actor: Actor) {
    return this.assessments.listForLearner(actor);
  }

  /**
   * The paper. Reachable with assessment.read, which an authoring role also
   * holds -- and it still returns no answer key, because the key is simply not
   * in the projection. There is one route that returns keys, and it demands
   * assessment.answerkey.read.
   */
  @Get(":id/paper")
  @RequirePermissions(P.ASSESSMENT_READ)
  paper(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Query("attempt") attemptId?: string,
  ) {
    return this.assessments.paper(actor, id, attemptId);
  }

  /**
   * Asking for more attempts at a paper you have used up without passing.
   * Refused unless there is genuinely nothing left, and one at a time.
   */
  @Post(":id/attempt-requests")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  @Audit({ action: "attempt.request", resourceType: "assessment" })
  requestAttempts(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { reason?: string },
  ) {
    return this.attemptRequests.request(actor, id, body?.reason ?? "");
  }

  /** Requests the caller may decide: their own learners, or all for a manager. */
  @Get("attempt-requests")
  @RequirePermissions(P.ATTEMPT_GRANT)
  attemptRequestsToDecide(
    @CurrentActor() actor: Actor,
    @Query("status") status?: string,
  ) {
    return this.attemptRequests.list(actor, status === "ALL" ? "ALL" : "PENDING");
  }

  /** Granting one to three more attempts, or declining; a note either way. */
  @Post("attempt-requests/:id/decide")
  @RequirePermissions(P.ATTEMPT_GRANT)
  @Audit({ action: "attempt.request.decide", resourceType: "attempt_request" })
  decideAttemptRequest(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() body: { decision?: string; extraAttempts?: number; reason?: string },
  ) {
    return this.attemptRequests.decide(actor, id, body ?? {});
  }

  /** One of your own marked attempts, question by question. */
  @Get("attempts/:id/review")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  review(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.assessments.review(actor, id);
  }

  @Post("attempts")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  @Audit({ action: "attempt.start", resourceType: "attempt" })
  start(@CurrentActor() actor: Actor, @Body() dto: StartAttemptDto) {
    return this.assessments.start(actor, dto);
  }

  @Post("attempts/:id/submit")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  @Audit({ action: "attempt.submit", resourceType: "attempt" })
  submit(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: SubmitAttemptDto,
  ) {
    return this.assessments.submit(actor, id, dto);
  }
}
