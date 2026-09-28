import { Injectable, Logger } from "@nestjs/common";
import { chainHash, stableStringify } from "./audit-hash";
import type { AuditOutcome, Prisma, Role } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export interface AuditRecord {
  actorId: string;
  actorRole: Role;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  outcome: AuditOutcome;
  ip?: string | null;
  userAgent?: string | null;
  requestId: string;
  metadata?: Prisma.InputJsonValue;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  /** Serialises the chain. Two concurrent writes must not share a predecessor. */
  private chainLock: Promise<unknown> = Promise.resolve();

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Appends one event, chained to its predecessor.
   *
   * There is no update path and no delete path anywhere in this class, because
   * there is no such thing in the table: the database refuses both.
   */
  async record(record: AuditRecord): Promise<void> {
    this.chainLock = this.chainLock
      .then(() => this.append(record))
      .catch((err) => {
        // A failed audit write must never be swallowed into silence, but it
        // must also not take down the request it was describing -- the action
        // already happened. It is logged loudly for the operator.
        this.logger.error(
          `AUDIT WRITE FAILED action=${record.action}`,
          err as Error,
        );
      });
    await this.chainLock;
  }

  private async append(record: AuditRecord): Promise<void> {
    const previous = await this.prisma.auditEvent.findFirst({
      orderBy: { seq: "desc" },
      select: { hash: true },
    });

    const occurredAt = new Date();
    const payload = {
      occurredAt: occurredAt.toISOString(),
      actorId: record.actorId,
      actorRole: record.actorRole,
      actorEmail: record.actorEmail,
      action: record.action,
      resourceType: record.resourceType,
      resourceId: record.resourceId ?? null,
      outcome: record.outcome,
      requestId: record.requestId,
      metadata: record.metadata ?? {},
    };

    const prevHash = previous?.hash ?? null;
    const hash = chainHash(prevHash, payload);

    await this.prisma.auditEvent.create({
      data: {
        ...payload,
        occurredAt,
        metadata: (record.metadata ?? {}) as Prisma.InputJsonValue,
        ip: record.ip ?? null,
        userAgent: record.userAgent ?? null,
        prevHash,
        hash,
      },
    });
  }

  /**
   * Walks the chain and reports the first row whose hash does not follow from
   * its predecessor. A clean result means no row has been altered or removed
   * since it was written, including by someone with raw database access.
   */
  async verifyChain(
    limit = 10_000,
  ): Promise<{ ok: boolean; checked: number; brokenAt?: string }> {
    const events = await this.prisma.auditEvent.findMany({
      orderBy: { seq: "asc" },
      take: limit,
    });

    let expectedPrev: string | null = null;
    for (const event of events) {
      if (event.prevHash !== expectedPrev) {
        return { ok: false, checked: events.length, brokenAt: event.id };
      }
      const recomputed = chainHash(expectedPrev, {
        occurredAt: event.occurredAt.toISOString(),
        actorId: event.actorId,
        actorRole: event.actorRole,
        actorEmail: event.actorEmail,
        action: event.action,
        resourceType: event.resourceType,
        resourceId: event.resourceId,
        outcome: event.outcome,
        requestId: event.requestId,
        metadata: event.metadata,
      });
      if (recomputed !== event.hash) {
        return { ok: false, checked: events.length, brokenAt: event.id };
      }
      expectedPrev = event.hash;
    }

    return { ok: true, checked: events.length };
  }
}

/** Re-exported so existing importers keep working. */
export { stableStringify, chainHash };
