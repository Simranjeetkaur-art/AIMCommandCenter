import { Body, Controller, Get, Param, Post, Put, Query } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { RequireAnyPermission } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { PerformanceService } from "./performance.service";
import { WritePerformanceReviewDto, PerformanceQuery } from "./performance.dto";

@Controller("performance")
export class PerformanceController {
  constructor(private readonly performance: PerformanceService) {}

  /**
   * Who this actor may assess, and on what.
   *
   * Answered by the server rather than worked out in the page, because "which
   * people" is a scoping decision and scoping decisions are not made in
   * interfaces.
   */
  @Get("subjects")
  @RequirePermissions(P.PERFORMANCE_WRITE)
  subjects(@CurrentActor() actor: Actor) {
    return this.performance.subjects(actor);
  }

  /**
   * Every review this actor may see: their own released ones, the ones they
   * wrote, and the ones about people below them.
   *
   * Declared with "any", because the three entitlements are different and a
   * candidate holds only the first.
   */
  @Get()
  @RequireAnyPermission(P.PERFORMANCE_READ_SELF, P.PERFORMANCE_READ_CHAIN)
  list(@CurrentActor() actor: Actor, @Query() query: PerformanceQuery) {
    return this.performance.list(actor, query);
  }

  @Get(":id")
  @RequireAnyPermission(P.PERFORMANCE_READ_SELF, P.PERFORMANCE_READ_CHAIN)
  detail(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.performance.detail(actor, id);
  }

  /**
   * Writing one. The permission says this role may write a review; the service
   * decides whether this person may write one about that person.
   */
  @Put()
  @RequirePermissions(P.PERFORMANCE_WRITE)
  @Audit({ action: "performance.write", resourceType: "performance_review" })
  write(@CurrentActor() actor: Actor, @Body() dto: WritePerformanceReviewDto) {
    return this.performance.write(actor, dto);
  }

  /** Handing it to the person it is about. Only its author, and only once. */
  @Post(":id/release")
  @RequirePermissions(P.PERFORMANCE_WRITE)
  @Audit({ action: "performance.release", resourceType: "performance_review" })
  release(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.performance.release(actor, id);
  }

  /** The subject saying they have read it. Only ever the subject. */
  @Post(":id/acknowledge")
  @RequirePermissions(P.PERFORMANCE_READ_SELF)
  @Audit({
    action: "performance.acknowledge",
    resourceType: "performance_review",
  })
  acknowledge(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.performance.acknowledge(actor, id);
  }
}
