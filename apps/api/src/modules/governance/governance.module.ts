import { Module } from "@nestjs/common";
import {
  DiagnosticsController,
  PrescriptionsController,
  RegistryController,
} from "./governance.controller";
import { GovernanceService } from "./governance.service";

@Module({
  controllers: [
    RegistryController,
    DiagnosticsController,
    PrescriptionsController,
  ],
  providers: [GovernanceService],
  exports: [GovernanceService],
})
export class GovernanceModule {}
