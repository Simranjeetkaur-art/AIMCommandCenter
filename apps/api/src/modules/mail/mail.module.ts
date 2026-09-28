import { Module } from "@nestjs/common";
import { MessagingModule } from "../messaging/messaging.module";
import { MailController } from "./mail.controller";
import { MailConfigService } from "./mail-config.service";
import { MailService } from "./mail.service";
import { OnboardingService } from "./onboarding.service";

/**
 * Outbound mail.
 *
 * Exported rather than kept private, because authentication needs it: the
 * verification link, the welcome message and the reset link are all sent from
 * flows that live in AuthModule. The configuration stays here, where the
 * administration screens reach it.
 */
@Module({
  // Onboarding raises in-app notices for the staff who have to act on a new
  // candidate, so the notifications service comes from here.
  imports: [MessagingModule],
  controllers: [MailController],
  providers: [MailService, MailConfigService, OnboardingService],
  exports: [MailService, OnboardingService],
})
export class MailModule {}
