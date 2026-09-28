import { Controller, Get, Header, Query } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import { AuditService } from "../../common/audit/audit.service";
import { PrismaService } from "../../common/prisma/prisma.service";
import { page } from "../../common/util/pagination";
import { AuditQuery } from "./audit.query";

/**
 * Reading the log.
 *
 * There is no controller method here that writes, updates or deletes an audit
 * event, and there could not be a useful one: the table refuses both, and no
 * permission exists that would authorise the attempt. Reading it is itself
 * recorded, so "who looked at the log" is answerable too.
 */
@Controller("audit")
export class AuditController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(P.AUDIT_READ)
  @Audit({
    action: "audit.read",
    resourceType: "audit_event",
    recordReads: true,
  })
  async list(@Query() query: AuditQuery) {
    const where = buildWhere(query);

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditEvent.findMany({
        where,
        orderBy: { seq: "desc" },
        skip: query.skip,
        take: query.take,
      }),
      this.prisma.auditEvent.count({ where }),
    ]);

    return page(items.map(serialise), total, query);
  }

  /**
   * Chain verification. Answers whether anything in the log has been altered
   * or removed since it was written, including by someone acting outside the
   * application with raw database access.
   */
  @Get("integrity")
  @RequirePermissions(P.AUDIT_READ)
  @Audit({
    action: "audit.integrity.check",
    resourceType: "audit_event",
    recordReads: true,
  })
  integrity() {
    return this.audit.verifyChain();
  }

  @Get("export")
  @RequirePermissions(P.AUDIT_EXPORT)
  @Audit({
    action: "audit.export",
    resourceType: "audit_event",
    recordReads: true,
  })
  @Header("Content-Type", "application/x-ndjson")
  @Header("Content-Disposition", 'attachment; filename="audit-export.ndjson"')
  async exportLog(@Query() query: AuditQuery) {
    const events = await this.prisma.auditEvent.findMany({
      where: buildWhere(query),
      orderBy: { seq: "asc" },
      take: 50_000,
    });
    // NDJSON: one event per line, hashes included, so the export can be
    // verified independently of this system.
    return events.map((e) => JSON.stringify(serialise(e))).join("\n");
  }
}

function buildWhere(query: AuditQuery): Prisma.AuditEventWhereInput {
  return {
    ...(query.actorId ? { actorId: query.actorId } : {}),
    ...(query.action ? { action: { startsWith: query.action } } : {}),
    ...(query.resourceType ? { resourceType: query.resourceType } : {}),
    ...(query.resourceId ? { resourceId: query.resourceId } : {}),
    ...(query.outcome ? { outcome: query.outcome } : {}),
    ...(query.from || query.to
      ? {
          occurredAt: {
            ...(query.from ? { gte: new Date(query.from) } : {}),
            ...(query.to ? { lte: new Date(query.to) } : {}),
          },
        }
      : {}),
  };
}

/** BigInt does not survive JSON.stringify; seq is part of the evidence. */
function serialise<T extends { seq: bigint }>(event: T) {
  return { ...event, seq: event.seq.toString() };
}
