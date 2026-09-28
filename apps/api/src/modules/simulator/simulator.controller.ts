import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { SimulatorService } from "./simulator.service";
import { AbandonRunDto, AnswerMissionDto } from "./simulator.dto";

/**
 * The mission simulator.
 *
 * Every route here demands `assessment.take` rather than `assessment.read`.
 * Reading a paper and flying a simulator are not the same act: this one hands
 * back the answer key and the rationale one mission at a time, so it is only
 * ever for the person sitting it. An authoring role that wants to inspect the
 * missions uses the question bank, where looking at keys is what the screen is
 * for and demands a permission that says so.
 */
@Controller("simulator")
export class SimulatorController {
  constructor(private readonly simulator: SimulatorService) {}

  @Get()
  @RequirePermissions(P.ASSESSMENT_TAKE)
  mine(@CurrentActor() actor: Actor) {
    return this.simulator.list(actor);
  }

  /**
   * Every simulator in the academy, for the authoring screen: which track it
   * belongs to, how big its pool is, and how many missions a run draws.
   */
  @Get("authoring/overview")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  overview() {
    return this.simulator.authoringOverview();
  }

  /**
   * The author's preview: the whole simulator pool with keys and debriefs.
   * Demands the answer-key permission for the same reason the question bank
   * does -- this screen exists to show the keys.
   */
  @Get(":assessmentId/preview")
  @RequirePermissions(P.PROGRAMME_UPDATE, P.ANSWER_KEY_READ)
  preview(@Param("assessmentId") assessmentId: string) {
    return this.simulator.preview(assessmentId);
  }

  @Get(":assessmentId")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  state(
    @CurrentActor() actor: Actor,
    @Param("assessmentId") assessmentId: string,
  ) {
    return this.simulator.state(actor, assessmentId);
  }

  @Post(":assessmentId/start")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  @Audit({ action: "simulator.start", resourceType: "attempt" })
  start(
    @CurrentActor() actor: Actor,
    @Param("assessmentId") assessmentId: string,
  ) {
    return this.simulator.start(actor, assessmentId);
  }

  /**
   * Not audited per mission, and that is a decision rather than an oversight:
   * a hundred missions would put a hundred rows in the audit log for one
   * candidate practising, burying the governance events the log exists to
   * make findable. The responses are on the attempt, and the run's start and
   * its end are both recorded.
   */
  @Post(":assessmentId/answer")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  answer(
    @CurrentActor() actor: Actor,
    @Param("assessmentId") assessmentId: string,
    @Body() dto: AnswerMissionDto,
  ) {
    return this.simulator.answer(actor, assessmentId, dto);
  }

  @Post(":assessmentId/abandon")
  @RequirePermissions(P.ASSESSMENT_TAKE)
  @Audit({ action: "simulator.abandon", resourceType: "attempt" })
  abandon(
    @CurrentActor() actor: Actor,
    @Param("assessmentId") assessmentId: string,
    @Body() dto: AbandonRunDto,
  ) {
    return this.simulator.abandon(actor, assessmentId, dto);
  }
}
