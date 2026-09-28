import { Module } from "@nestjs/common";
import { CredentialsModule } from "../credentials/credentials.module";
import { AssessmentsController } from "./assessments.controller";
import { AssessmentsService } from "./assessments.service";
import { FinalExamService } from "./final-exam.service";
import { AttemptRequestsService } from "./attempt-requests.service";
import { MessagingModule } from "../messaging/messaging.module";

@Module({
  imports: [CredentialsModule, MessagingModule],
  controllers: [AssessmentsController],
  providers: [AssessmentsService, FinalExamService, AttemptRequestsService],
  exports: [FinalExamService],
})
export class AssessmentsModule {}
