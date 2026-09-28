import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import {
  MAX_MESSAGE_LENGTH,
  NOTICE_KINDS,
  PORTAL_HOME,
  conversationPair,
  mayStartConversation,
} from "@aim/contracts";
import type { Role } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { NotificationsService } from "./notifications.service";
import type { Actor } from "../../common/auth/actor";

/**
 * Messages between two people.
 *
 * Two rules do the work, and they are deliberately different from each other:
 *
 *  - **Starting** a conversation is governed by role, and for the teaching
 *    line by an actual assignment. A candidate writes to their examiner; they
 *    cannot write to the registry, to a manager, or to another candidate.
 *  - **Continuing** one is governed by being in it. Anybody addressed can
 *    answer, whatever the matrix says about who could have started it, because
 *    being written to and having no way to reply is not a rule -- it is a
 *    fault in the product.
 *
 * Reading is the same rule as continuing: a conversation is visible to its two
 * participants and to nobody else. There is no administrative route through
 * this service to somebody else's correspondence, which is why every query
 * below is scoped by the actor's own id rather than filtered afterwards.
 */
@Injectable()
export class MessagingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Every conversation the actor is in, most recently active first. */
  async inbox(actor: Actor) {
    const rows = await this.prisma.conversation.findMany({
      where: { OR: [{ lowUserId: actor.id }, { highUserId: actor.id }] },
      orderBy: { lastMessageAt: "desc" },
      select: {
        id: true,
        lastMessageAt: true,
        lowUser: { select: { id: true, name: true, email: true, role: true } },
        highUser: { select: { id: true, name: true, email: true, role: true } },
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { body: true, senderId: true, createdAt: true },
        },
        _count: {
          select: {
            messages: { where: { readAt: null, senderId: { not: actor.id } } },
          },
        },
      },
    });

    return rows.map((row) => {
      const other = row.lowUser.id === actor.id ? row.highUser : row.lowUser;
      const last = row.messages[0] ?? null;
      return {
        id: row.id,
        with: other,
        lastMessageAt: row.lastMessageAt,
        unread: row._count.messages,
        preview: last
          ? {
              body: last.body.slice(0, 160),
              mine: last.senderId === actor.id,
              at: last.createdAt,
            }
          : null,
      };
    });
  }

  /** How many unread messages the actor has, for the badge in the header. */
  async unreadCount(actor: Actor): Promise<number> {
    return this.prisma.message.count({
      where: {
        readAt: null,
        senderId: { not: actor.id },
        conversation: {
          OR: [{ lowUserId: actor.id }, { highUserId: actor.id }],
        },
      },
    });
  }

  /**
   * One conversation, and marking what the actor has now seen.
   *
   * Opening it is what reads it: a separate "mark read" call is a second
   * thing to remember and a second thing to get wrong.
   */
  async conversation(actor: Actor, conversationId: string) {
    const row = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: {
        id: true,
        lowUser: { select: { id: true, name: true, email: true, role: true } },
        highUser: { select: { id: true, name: true, email: true, role: true } },
      },
    });
    // Somebody else's conversation does not exist to you, rather than being
    // refused: a 403 would confirm who is talking to whom.
    if (!row || (row.lowUser.id !== actor.id && row.highUser.id !== actor.id)) {
      throw new NotFoundException("Conversation not found");
    }

    await this.prisma.message.updateMany({
      where: {
        conversationId,
        senderId: { not: actor.id },
        readAt: null,
      },
      data: { readAt: new Date() },
    });

    const messages = await this.prisma.message.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        body: true,
        senderId: true,
        createdAt: true,
        readAt: true,
      },
    });

    return {
      id: row.id,
      with: row.lowUser.id === actor.id ? row.highUser : row.lowUser,
      messages: messages.map((m) => ({ ...m, mine: m.senderId === actor.id })),
    };
  }

  /**
   * Sends a message, opening the conversation if this is the first one.
   *
   * The permission question is asked only when the conversation is new. Once
   * two people are talking, they are talking.
   */
  async send(actor: Actor, recipientId: string, body: string) {
    const text = body.trim();
    if (text.length === 0) {
      throw new BadRequestException("Write something first");
    }
    if (text.length > MAX_MESSAGE_LENGTH) {
      throw new BadRequestException(
        `A message is at most ${MAX_MESSAGE_LENGTH} characters`,
      );
    }
    if (recipientId === actor.id) {
      throw new BadRequestException("You cannot message yourself");
    }

    const recipient = await this.prisma.user.findUnique({
      where: { id: recipientId },
      select: { id: true, name: true, role: true, status: true, archivedAt: true },
    });
    if (!recipient || recipient.archivedAt) {
      throw new NotFoundException("That person is not here");
    }
    if (recipient.status !== "ACTIVE") {
      throw new BadRequestException(
        "That account is suspended, so it cannot be written to",
      );
    }

    const pair = conversationPair(actor.id, recipient.id);
    const existing = await this.prisma.conversation.findUnique({
      where: { lowUserId_highUserId: pair },
      select: { id: true },
    });

    if (!existing) {
      await this.assertMayStart(actor, recipient.id, recipient.role as Role);
    }

    const conversation =
      existing ??
      (await this.prisma.conversation.create({
        data: pair,
        select: { id: true },
      }));

    const [message] = await this.prisma.$transaction([
      this.prisma.message.create({
        data: { conversationId: conversation.id, senderId: actor.id, body: text },
        select: { id: true, body: true, createdAt: true },
      }),
      this.prisma.conversation.update({
        where: { id: conversation.id },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    // Told once per conversation rather than once per message: a notice per
    // line would bury everything else the moment two people had a chat.
    await this.notifications.raiseOnce({
      userId: recipient.id,
      kind: NOTICE_KINDS.MESSAGE_RECEIVED,
      title: `Message from ${actor.name ?? "a colleague"}`,
      body: text.slice(0, 160),
      // Where the recipient reads it, which is their own portal's inbox --
      // there is no `/messages` route, each portal carries its own. Built
      // from their role for the same reason every other notice is: the href
      // is a place in this product, and the portals are not interchangeable.
      href: `${PORTAL_HOME[recipient.role as Role]}/messages?c=${conversation.id}`,
    });

    return { conversationId: conversation.id, message };
  }

  /**
   * Who this actor may write to for the first time.
   *
   * The list the compose screen offers, built from the same rule the send
   * path enforces -- so the screen never offers somebody the server will
   * refuse, and never hides somebody it would allow.
   */
  async addressBook(actor: Actor) {
    const role = actor.role as Role;
    const allowed = (
      ["ADMIN", "MANAGER", "INSTRUCTOR", "STUDENT"] as const
    ).filter((target) => mayStartConversation(role, target).ok);

    const assignedOnly = new Set<string>();
    for (const target of allowed) {
      if (mayStartConversation(role, target).requiresAssignment) {
        assignedOnly.add(target);
      }
    }

    const people = await this.prisma.user.findMany({
      where: {
        role: { in: allowed as unknown as Role[] },
        status: "ACTIVE",
        archivedAt: null,
        id: { not: actor.id },
      },
      // Staff first. The Role enum is declared candidate-upwards, so
      // descending puts administrators, managers and examiners above a roll
      // of candidates that could run to hundreds of rows.
      orderBy: [{ role: "desc" }, { name: "asc" }],
      select: { id: true, name: true, email: true, role: true },
    });

    if (assignedOnly.size === 0) return people;

    // Only the learners actually taught by this examiner, or the examiners
    // actually teaching this learner.
    const links = await this.prisma.instructorAssignment.findMany({
      where:
        role === "INSTRUCTOR"
          ? { instructorId: actor.id }
          : { learnerId: actor.id },
      select: { instructorId: true, learnerId: true },
    });
    const reachable = new Set(
      links.map((l) => (role === "INSTRUCTOR" ? l.learnerId : l.instructorId)),
    );

    return people.filter(
      (person) =>
        !assignedOnly.has(person.role) || reachable.has(person.id),
    );
  }

  private async assertMayStart(actor: Actor, toId: string, toRole: Role) {
    const verdict = mayStartConversation(actor.role as Role, toRole);
    if (!verdict.ok) {
      throw new ForbiddenException(verdict.reason ?? "You cannot write to them");
    }
    if (!verdict.requiresAssignment) return;

    const link = await this.prisma.instructorAssignment.findFirst({
      where:
        actor.role === "INSTRUCTOR"
          ? { instructorId: actor.id, learnerId: toId }
          : { instructorId: toId, learnerId: actor.id },
      select: { id: true },
    });
    if (!link) {
      throw new ForbiddenException(
        actor.role === "INSTRUCTOR"
          ? "That candidate is not assigned to you."
          : "That examiner is not yours. You can write to the examiner marking your work.",
      );
    }
  }
}
