import { Global, Module } from "@nestjs/common";
import { BadgesController } from "./badges.controller";
import { BadgesService } from "./badges.service";

/**
 * Global because the evaluator is called from the assessment, review and
 * credential paths: those are the three moments a condition can newly become
 * true, and none of them should have to know how badges work.
 */
@Global()
@Module({
  controllers: [BadgesController],
  providers: [BadgesService],
  exports: [BadgesService],
})
export class BadgesModule {}
