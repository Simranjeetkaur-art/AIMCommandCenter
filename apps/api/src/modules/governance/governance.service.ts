import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { AgentStatus, Prisma } from "@prisma/client";
import {
  AIM_DIMENSIONS,
  AIM_DIMENSION_COUNT,
  AIM_ENVELOPE,
  PERMISSIONS as P,
  bandFor,
  buildRx,
  computeAai,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";
import type {
  CreateAgentDto,
  CreateDiagnosticDto,
  CreatePrescriptionDto,
  RetireAgentDto,
  UpdateAgentDto,
} from "./governance.dto";

@Injectable()
export class GovernanceService {
  constructor(private readonly prisma: PrismaService) {}

  private can(actor: Actor, permission: string): boolean {
    return (actor.permissions as readonly string[]).includes(permission);
  }

  // -- Registry -------------------------------------------------------------

  /**
   * The register, in a chosen order.
   *
   * Sorted rather than hand-ordered. A risk register's useful order is a fact
   * about its contents -- worst exposure first, or least recently assessed --
   * and a position column would go stale the moment a diagnostic changed a
   * score. `exposure` is the default because it is the question the register
   * exists to answer.
   */
  listAgents(includeRetired = false, sort = "exposure", direction = "desc") {
    const dir = direction === "asc" ? "asc" : "desc";

    const orderBy: Prisma.AgentOrderByWithRelationInput[] =
      sort === "code"
        ? [{ code: dir }]
        : sort === "name"
          ? [{ name: dir }]
          : sort === "owner"
            ? [{ ownerRole: dir }, { code: "asc" }]
            : sort === "status"
              ? [{ status: dir }, { code: "asc" }]
              : sort === "diagnostics"
                ? [{ diagnostics: { _count: dir } }, { code: "asc" }]
                : sort === "assessed"
                  ? [{ updatedAt: dir }]
                  : // exposure: the highest AAI first, and agents nobody has
                    // assessed at the end rather than treated as zero risk.
                    [{ aai: { sort: dir, nulls: "last" } }, { code: "asc" }];

    return this.prisma.agent.findMany({
      where: includeRetired ? {} : { status: { not: AgentStatus.RETIRED } },
      include: {
        ownerUser: { select: { id: true, name: true } },
        _count: { select: { diagnostics: true } },
      },
      orderBy,
    });
  }

  /**
   * Removes an agent and its governance record.
   *
   * Retiring is the usual act: it ends the agent's authority and keeps every
   * diagnostic that was ever run against it. This is the other one -- a
   * registry entry made in error, or a system whose record the institution has
   * decided to destroy -- and it takes the bound diagnostics with it, because
   * a diagnostic naming an agent that no longer exists attests to nothing.
   *
   * Practice diagnostics are unbound rather than deleted. A candidate who
   * practised against this agent did their own work, and it is theirs.
   *
   * The audit event survives either way: it is append-only, it names who did
   * this and why, and it carries the counts of what went.
   */
  async deleteAgent(agentId: string, reason: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      select: {
        id: true,
        code: true,
        name: true,
        _count: { select: { diagnostics: true } },
      },
    });
    if (!agent) throw new NotFoundException("Agent not found");

    const [bound, practice] = await Promise.all([
      this.prisma.diagnostic.count({ where: { agentId, isPractice: false } }),
      this.prisma.diagnostic.count({ where: { agentId, isPractice: true } }),
    ]);

    await this.prisma.$transaction([
      // Prescriptions cascade from their diagnostic, so this takes them too.
      this.prisma.diagnostic.deleteMany({
        where: { agentId, isPractice: false },
      }),
      this.prisma.diagnostic.updateMany({
        where: { agentId, isPractice: true },
        data: { agentId: null },
      }),
      this.prisma.agent.delete({ where: { id: agentId } }),
    ]);

    return {
      deleted: true,
      code: agent.code,
      name: agent.name,
      diagnosticsDeleted: bound,
      practiceRunsUnbound: practice,
      reason,
    };
  }

  async agent(agentId: string) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
      include: {
        ownerUser: { select: { id: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        diagnostics: {
          where: { isPractice: false },
          orderBy: { createdAt: "desc" },
          include: {
            createdBy: { select: { id: true, name: true } },
            prescription: true,
          },
        },
      },
    });
    if (!agent) throw new NotFoundException("Agent not found");
    return agent;
  }

  createAgent(actor: Actor, dto: CreateAgentDto) {
    return this.prisma.agent.create({
      data: {
        code: dto.code.toUpperCase(),
        name: dto.name,
        ownerRole: dto.ownerRole,
        ownerUserId: dto.ownerUserId ?? null,
        purpose: dto.purpose,
        lastCommand: dto.lastCommand ?? "PENDING",
        // No diagnostic yet, so no index and nothing to be reassured by.
        status: AgentStatus.ATTENTION,
        createdById: actor.id,
      },
    });
  }

  async updateAgent(agentId: string, dto: UpdateAgentDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException("Agent not found");
    if (agent.status === AgentStatus.RETIRED) {
      throw new BadRequestException("A retired agent record cannot be edited");
    }

    const updated = await this.prisma.agent.update({
      where: { id: agentId },
      data: {
        ...(dto.name !== undefined ? { name: dto.name } : {}),
        ...(dto.ownerRole !== undefined ? { ownerRole: dto.ownerRole } : {}),
        ...(dto.ownerUserId !== undefined
          ? { ownerUserId: dto.ownerUserId }
          : {}),
        ...(dto.purpose !== undefined ? { purpose: dto.purpose } : {}),
        ...(dto.lastCommand !== undefined
          ? { lastCommand: dto.lastCommand }
          : {}),
      },
    });

    return this.prisma.agent.update({
      where: { id: agentId },
      data: { status: statusFor(updated.aai, updated.lastCommand) },
    });
  }

  async retireAgent(agentId: string, dto: RetireAgentDto) {
    const agent = await this.prisma.agent.findUnique({
      where: { id: agentId },
    });
    if (!agent) throw new NotFoundException("Agent not found");
    if (agent.status === AgentStatus.RETIRED) {
      throw new BadRequestException("That agent is already retired");
    }

    // Retirement is a status change, never a delete: the diagnostics that
    // described this agent's authority remain part of the record.
    return this.prisma.agent.update({
      where: { id: agentId },
      data: { status: AgentStatus.RETIRED, retiredAt: new Date() },
    });
  }

  // -- Dx: the authority diagnostic ----------------------------------------

  /**
   * Runs a diagnostic.
   *
   * The index is computed here from the eleven scores and nowhere else. A
   * candidate practising Dx produces a practice record bound to nothing;
   * binding one to a registry agent, which moves that agent's recorded AAI,
   * needs diagnostic.bind.agent, which no candidate holds.
   */
  async createDiagnostic(actor: Actor, dto: CreateDiagnosticDto) {
    if (dto.scores.length !== AIM_DIMENSION_COUNT) {
      throw new BadRequestException(
        `Expected ${AIM_DIMENSION_COUNT} dimension scores`,
      );
    }

    const aai = computeAai(dto.scores);
    const band = bandFor(aai);

    let agentId: string | null = null;
    if (dto.agentId) {
      if (!this.can(actor, P.DIAGNOSTIC_BIND_AGENT)) {
        throw new ForbiddenException(
          "Binding a diagnostic to a registered agent requires diagnostic.bind.agent",
        );
      }
      const agent = await this.prisma.agent.findUnique({
        where: { id: dto.agentId },
        select: { id: true, status: true },
      });
      if (!agent) throw new NotFoundException("Agent not found");
      if (agent.status === AgentStatus.RETIRED) {
        throw new BadRequestException("A retired agent cannot be re-diagnosed");
      }
      agentId = agent.id;
    }

    return this.prisma.$transaction(async (tx) => {
      const diagnostic = await tx.diagnostic.create({
        data: {
          agentId,
          agentName: dto.agentName,
          agentOwner: dto.agentOwner,
          agentPurpose: dto.agentPurpose,
          scores: dto.scores,
          aai,
          band: band.band,
          isPractice: agentId === null,
          createdById: actor.id,
        },
      });

      if (agentId) {
        const agent = await tx.agent.findUniqueOrThrow({
          where: { id: agentId },
          select: { lastCommand: true },
        });
        await tx.agent.update({
          where: { id: agentId },
          data: {
            aai,
            band: band.band,
            status: statusFor(aai, agent.lastCommand),
          },
        });
      }

      return diagnostic;
    });
  }

  /**
   * Lists diagnostics within the caller's scope: their own unless they hold
   * diagnostic.read.all, in which case the whole register.
   */
  async listDiagnostics(actor: Actor, agentId?: string) {
    const seesAll = this.can(actor, P.DIAGNOSTIC_READ_ALL);

    const where: Prisma.DiagnosticWhereInput = {
      ...(seesAll ? {} : { createdById: actor.id }),
      ...(agentId ? { agentId } : {}),
    };

    return this.prisma.diagnostic.findMany({
      where,
      include: {
        agent: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        prescription: { select: { id: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
  }

  async diagnostic(actor: Actor, diagnosticId: string) {
    const diagnostic = await this.prisma.diagnostic.findUnique({
      where: { id: diagnosticId },
      include: {
        agent: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        prescription: true,
      },
    });
    if (!diagnostic) throw new NotFoundException("Diagnostic not found");

    // Someone else's diagnostic does not exist to you unless you read all.
    if (
      diagnostic.createdById !== actor.id &&
      !this.can(actor, P.DIAGNOSTIC_READ_ALL)
    ) {
      throw new NotFoundException("Diagnostic not found");
    }

    return {
      ...diagnostic,
      dimensions: AIM_DIMENSIONS.map((dim, i) => ({
        ...dim,
        score: diagnostic.scores[i] ?? null,
      })),
    };
  }

  // -- Rx: from diagnosis to prescription ----------------------------------

  /**
   * Builds the remedy from the diagnosis.
   *
   * Rx is derived, not authored: the controls are ranked by the dimensions
   * that actually produced the exposure, so the prescription names the
   * specific authority to reduce rather than offering general advice. A
   * diagnostic has one prescription, so re-running replaces it.
   */
  async createPrescription(actor: Actor, dto: CreatePrescriptionDto) {
    const diagnostic = await this.prisma.diagnostic.findUnique({
      where: { id: dto.diagnosticId },
      include: { prescription: { select: { id: true } } },
    });
    if (!diagnostic) throw new NotFoundException("Diagnostic not found");

    if (
      diagnostic.createdById !== actor.id &&
      !this.can(actor, P.DIAGNOSTIC_READ_ALL)
    ) {
      throw new NotFoundException("Diagnostic not found");
    }

    // The whole evaluation is derived in one place, from the eleven scores
    // and the three facts the diagnostic recorded. The server stores what it
    // derived, so a prescription stays a record of what was said rather than
    // something re-rendered differently each time it is read.
    const rx = buildRx({
      agent: {
        name: diagnostic.agentName,
        owner: diagnostic.agentOwner,
        purpose: diagnostic.agentPurpose,
      },
      aai: diagnostic.aai,
      scores: diagnostic.scores,
    });

    const controls = rx.controls;

    const envelope: Record<string, string> = {};
    for (const boundary of AIM_ENVELOPE) {
      envelope[boundary.key] =
        dto.envelope?.[boundary.key] ?? boundary.defaultValue;
    }

    // A/G/H/X is stored as the boundaries this agent earned -- from the
    // domain its purpose puts it in, and from the dimensions it actually
    // scored high on. Storing the four framework examples instead would
    // give every agent in the registry identical boundaries, which would
    // say nothing about any of them.
    const actionClasses: Record<string, string[]> = {};
    for (const klass of rx.actionClasses) {
      actionClasses[klass.key] = klass.items;
    }

    const material = rx.drivers.filter((d) => d.score >= 4);
    const narrative = [
      rx.summary,
      material.length > 0
        ? `The exposure is driven by ${material
            .map((d) => d.dimension.toLowerCase())
            .join(", ")}.`
        : "No single dimension dominates; the exposure is broad rather than concentrated.",
      `Reducing it means changing what ${diagnostic.agentName} is authorized to do, not how confident it is.`,
      `Accountable owner: ${diagnostic.agentOwner}. Authorized purpose: ${diagnostic.agentPurpose}.`,
    ].join(" ");

    const data = {
      diagnosticId: diagnostic.id,
      envelope: envelope as object,
      actionClasses: actionClasses as object,
      controls: controls as object,
      narrative,
      createdById: actor.id,
    };

    return this.prisma.prescription.upsert({
      where: { diagnosticId: diagnostic.id },
      create: data,
      update: { ...data, createdById: actor.id },
    });
  }

  /**
   * Every prescription the caller may see, newest first.
   *
   * Scoped the same way diagnostics are: a candidate practising Rx sees their
   * own work and nobody else's, because a prescription names an agent and
   * what is wrong with it.
   */
  async listPrescriptions(actor: Actor) {
    const seesAll = this.can(actor, P.DIAGNOSTIC_READ_ALL);

    const rows = await this.prisma.prescription.findMany({
      where: seesAll ? {} : { createdById: actor.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        createdBy: { select: { id: true, name: true } },
        diagnostic: {
          select: {
            id: true,
            agentName: true,
            agentOwner: true,
            aai: true,
            band: true,
            isPractice: true,
            agent: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    return rows.map((row) => ({
      id: row.id,
      diagnosticId: row.diagnosticId,
      createdAt: row.createdAt,
      author: row.createdBy.name,
      agentName: row.diagnostic.agent?.name ?? row.diagnostic.agentName,
      agentCode: row.diagnostic.agent?.code ?? null,
      agentOwner: row.diagnostic.agentOwner,
      aai: row.diagnostic.aai,
      band: row.diagnostic.band,
      practice: row.diagnostic.isPractice,
      controls: Array.isArray(row.controls) ? row.controls.length : 0,
      narrative: row.narrative,
    }));
  }

  async prescription(actor: Actor, diagnosticId: string) {
    const prescription = await this.prisma.prescription.findUnique({
      where: { diagnosticId },
      include: {
        diagnostic: {
          include: { agent: { select: { id: true, code: true, name: true } } },
        },
        createdBy: { select: { id: true, name: true } },
      },
    });
    if (!prescription)
      throw new NotFoundException("No prescription for that diagnostic");

    if (
      prescription.diagnostic.createdById !== actor.id &&
      !this.can(actor, P.DIAGNOSTIC_READ_ALL)
    ) {
      throw new NotFoundException("No prescription for that diagnostic");
    }

    return prescription;
  }

  /** Registry-wide posture, for the command dashboard. */
  async registrySummary() {
    const agents = await this.prisma.agent.findMany({
      where: { status: { not: AgentStatus.RETIRED } },
      select: { aai: true, status: true, lastCommand: true },
    });

    const scored = agents
      .filter((a) => a.aai !== null)
      .map((a) => a.aai as number);

    return {
      total: agents.length,
      governed: agents.filter((a) => a.status === "GOVERNED").length,
      attention: agents.filter((a) => a.status === "ATTENTION").length,
      critical: agents.filter((a) => a.status === "CRITICAL").length,
      lastCommandMissing: agents.filter((a) => a.lastCommand === "MISSING")
        .length,
      undiagnosed: agents.filter((a) => a.aai === null).length,
      averageAai: scored.length
        ? Number((scored.reduce((n, v) => n + v, 0) / scored.length).toFixed(1))
        : null,
      highestAai: scored.length ? Math.max(...scored) : null,
    };
  }
}

/**
 * An agent's posture.
 *
 * A missing Last Command means attention whatever the index says: the index
 * measures how much authority exists, not whether it can be taken back.
 */
export function statusFor(
  aai: number | null,
  lastCommand: string,
): AgentStatus {
  if (lastCommand === "MISSING") return AgentStatus.ATTENTION;
  if (aai === null) return AgentStatus.ATTENTION;
  if (aai >= 75) return AgentStatus.CRITICAL;
  if (aai >= 50) return AgentStatus.ATTENTION;
  return AgentStatus.GOVERNED;
}
