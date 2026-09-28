import { Controller, Get } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import type { Actor } from "../../common/auth/actor";
import { ReportsService } from "./reports.service";
import { OverviewService } from "./overview.service";

@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly overview: OverviewService,
  ) {}

  /**
   * What the institution holds: the register, the control work, the academy
   * and the credentials. Sections the caller may not read come back null.
   */
  @Get("overview")
  @RequirePermissions(P.REPORT_READ)
  institutionOverview(@CurrentActor() actor: Actor) {
    return this.overview.all(actor);
  }

  @Get("progress")
  @RequirePermissions(P.REPORT_READ)
  progress() {
    return this.reports.progress();
  }

  @Get("turnaround")
  @RequirePermissions(P.REVIEW_TURNAROUND_READ)
  turnaround() {
    return this.reports.turnaround();
  }
}
