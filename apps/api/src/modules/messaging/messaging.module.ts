import { Module } from "@nestjs/common";
import { MessagingController } from "./messaging.controller";
import { MessagingService } from "./messaging.service";
import { NotificationsService } from "./notifications.service";

@Module({
  controllers: [MessagingController],
  providers: [MessagingService, NotificationsService],
  exports: [NotificationsService],
})
export class MessagingModule {}
