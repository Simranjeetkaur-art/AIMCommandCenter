import { Module } from "@nestjs/common";
import { AssessmentsModule } from "../assessments/assessments.module";
import { GradebookController } from "./gradebook.controller";
import { GradebookService } from "./gradebook.service";

@Module({
  imports: [AssessmentsModule],
  controllers: [GradebookController],
  providers: [GradebookService],
})
export class GradebookModule {}
