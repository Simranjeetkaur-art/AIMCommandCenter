import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsService } from "./reports.service";
import { OverviewService } from "./overview.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, OverviewService],
})
export class ReportsModule {}
