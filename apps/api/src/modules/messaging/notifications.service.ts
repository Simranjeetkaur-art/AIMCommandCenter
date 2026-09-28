import { Injectable, Logger } from "@nestjs/common";
import { NOTICE_KINDS } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";

interface Notice {
  userId: string;
  kind: string;
  title: string;
  body?: string;
  href?: string;
}

/**
 * Notices: things the system needs a particular person to know.
 *
 * Not messages -- nobody replies to these -- and not email, which is where a
 * notice goes to be ignored. A candidate arriving is work for whoever places
 * them, and work belongs in the product they do it in, with a link to the
 * screen that does it.
 *
 * Nothing here ever throws into the caller. Raising a notice is always a side
 * effect of something more important that has already happened: a candidate
 * has verified their address, a message has been stored. Failing that work
 * because a notice could not be written would be the wrong trade every time.
 */
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger("Notifications");

  constructor(private readonly prisma: PrismaService) {}

  /** The actor's own notices, newest first. */
  async list(actor: Actor, limit = 30) {
    const [items, unread] = await Promise.all([
      this.prisma.notification.findMany({
        where: { userId: actor.id },
        orderBy: { createdAt: "desc" },
        take: Math.min(Math.max(limit, 1), 100),
        select: {
          id: true,
          kind: true,
          title: true,
          body: true,
          href: true,
          readAt: true,
          createdAt: true,
        },
      }),
      this.prisma.notification.count({
        where: { userId: actor.id, readAt: null },
      }),
    ]);
    return { items, unread };
  }

  async markRead(actor: Actor, id: string) {
    // Scoped by userId in the where clause rather than checked afterwards:
    // there is no id somebody can guess that touches another person's row.
    const { count } = await this.prisma.notification.updateMany({
      where: { id, userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: count };
  }

  async markAllRead(actor: Actor) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId: actor.id, readAt: null },
      data: { readAt: new Date() },
    });
    return { marked: count };
  }

  /** Writes one notice. Never throws. */
  async raise(notice: Notice): Promise<void> {
    try {
      await this.prisma.notification.create({
        data: {
          userId: notice.userId,
          kind: notice.kind,
          title: notice.title,
          body: notice.body ?? "",
          href: notice.href ?? null,
        },
      });
    } catch (error) {
      this.logger.error(
        `Notice ${notice.kind} for ${notice.userId} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Raises one only if an unread one of the same kind and link is not already
   * waiting. This is what stops a conversation turning into a column of
   * identical "you have a message" rows.
   */
  async raiseOnce(notice: Notice): Promise<void> {
    try {
      const pending = await this.prisma.notification.findFirst({
        where: {
          userId: notice.userId,
          kind: notice.kind,
          href: notice.href ?? null,
          readAt: null,
        },
        select: { id: true },
      });
      if (pending) {
        // Kept current rather than duplicated, so the row says what is
        // actually waiting rather than what was waiting first.
        await this.prisma.notification.update({
          where: { id: pending.id },
          data: {
            title: notice.title,
            body: notice.body ?? "",
            createdAt: new Date(),
          },
        });
        return;
      }
    } catch (error) {
      this.logger.error(
        `Notice de-duplication failed, raising anyway: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
    await this.raise(notice);
  }

  /**
   * Tells the people responsible that somebody new has arrived.
   *
   * Administrators and managers get the one that is work -- place them on a
   * cohort, with a link to the screen that does it. Examiners get the one
   * that is news: somebody new is on the roll. The difference is deliberate:
   * a notice that asks for an action nobody holding that role can take is how
   * people learn to ignore notices.
   */
  async candidateJoined(candidate: {
    id: string;
    name: string;
    email: string;
    enrolled: boolean;
    programme: string | null;
  }): Promise<void> {
    const staff = await this.prisma.user.findMany({
      where: {
        role: { in: ["ADMIN", "MANAGER", "INSTRUCTOR"] },
        status: "ACTIVE",
        archivedAt: null,
      },
      select: { id: true, role: true },
    });

    for (const person of staff) {
      const placer = person.role === "ADMIN" || person.role === "MANAGER";

      if (placer && !candidate.enrolled) {
        await this.raise({
          userId: person.id,
          kind: NOTICE_KINDS.CANDIDATE_NEEDS_PLACING,
          title: `${candidate.name} needs placing on a course`,
          body: `${candidate.email} confirmed their address but was not placed automatically. Put them on a cohort.`,
          href:
            person.role === "ADMIN" ? "/admin/cohorts" : "/manager/cohorts",
        });
        continue;
      }

      await this.raise({
        userId: person.id,
        kind: NOTICE_KINDS.CANDIDATE_JOINED,
        title: `${candidate.name} joined the academy`,
        body: candidate.programme
          ? `${candidate.email} · enrolled on ${candidate.programme}`
          : `${candidate.email} · not yet on a course`,
        href: placer
          ? person.role === "ADMIN"
            ? "/admin/cohorts"
            : "/manager/cohorts"
          : "/instructor/learners",
      });
    }
  }
}
