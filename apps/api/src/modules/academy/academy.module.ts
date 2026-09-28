import { Global, Module } from "@nestjs/common";
import { AcademyController } from "./academy.controller";
import { AcademyService } from "./academy.service";
import { TrackAccessService } from "./track-access.service";
import { RestrictionsService } from "./restrictions.service";
import { QuestionBanksService } from "./question-banks.service";

@Global()
@Module({
  controllers: [AcademyController],
  providers: [
    AcademyService,
    TrackAccessService,
    RestrictionsService,
    QuestionBanksService,
  ],
  exports: [
    AcademyService,
    TrackAccessService,
    RestrictionsService,
    QuestionBanksService,
  ],
})
export class AcademyModule {}
