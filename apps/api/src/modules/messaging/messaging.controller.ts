import { Body, Controller, Get, Param, Post, Query } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { MessagingService } from "./messaging.service";
import { NotificationsService } from "./notifications.service";
import { SendMessageDto } from "./messaging.dto";

/**
 * Messages, and the notices that are not messages.
 *
 * Every route is self-scoped. There is no permission that opens somebody
 * else's inbox here and no query parameter that could name one: the actor's
 * own id is the only key these methods read by. Correspondence between two
 * people is theirs, and an administrator who needs to know what was said asks
 * them, or reads the audit log for the fact that a message was sent.
 *
 * `profile.read.self` is the permission because every role holds it: this is
 * a screen about you, like your own record.
 */
@Controller()
export class MessagingController {
  constructor(
    private readonly messaging: MessagingService,
    private readonly notifications: NotificationsService,
  ) {}

  @Get("messages")
  @RequirePermissions(P.MESSAGE_USE)
  inbox(@CurrentActor() actor: Actor) {
    return this.messaging.inbox(actor);
  }

  /** The unread count for the header, kept cheap enough to poll. */
  @Get("messages/unread")
  @RequirePermissions(P.MESSAGE_USE)
  async unread(@CurrentActor() actor: Actor) {
    const [messages, notices] = await Promise.all([
      this.messaging.unreadCount(actor),
      this.notifications.list(actor, 1),
    ]);
    return { messages, notices: notices.unread };
  }

  /** Who this actor may write to for the first time. */
  @Get("messages/address-book")
  @RequirePermissions(P.MESSAGE_USE)
  addressBook(@CurrentActor() actor: Actor) {
    return this.messaging.addressBook(actor);
  }

  @Get("messages/:id")
  @RequirePermissions(P.MESSAGE_USE)
  conversation(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.messaging.conversation(actor, id);
  }

  /**
   * Audited as the fact of a message, never its text: who wrote to whom and
   * when is an institutional record; what they said is theirs.
   */
  @Post("messages")
  @RequirePermissions(P.MESSAGE_USE)
  @Audit({ action: "message.send", resourceType: "conversation" })
  send(@CurrentActor() actor: Actor, @Body() dto: SendMessageDto) {
    return this.messaging.send(actor, dto.recipientId, dto.body);
  }

  @Get("notifications")
  @RequirePermissions(P.MESSAGE_USE)
  notices(@CurrentActor() actor: Actor, @Query("limit") limit?: string) {
    return this.notifications.list(actor, limit ? Number(limit) : 30);
  }

  @Post("notifications/:id/read")
  @RequirePermissions(P.MESSAGE_USE)
  markRead(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.notifications.markRead(actor, id);
  }

  @Post("notifications/read-all")
  @RequirePermissions(P.MESSAGE_USE)
  markAllRead(@CurrentActor() actor: Actor) {
    return this.notifications.markAllRead(actor);
  }
}
