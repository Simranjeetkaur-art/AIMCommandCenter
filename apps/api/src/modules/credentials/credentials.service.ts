import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { randomBytes } from "node:crypto";
import { CredentialStatus, Prisma } from "@prisma/client";
import { PrismaService } from "../../common/prisma/prisma.service";
import { AccessScopeService } from "../../common/access/access-scope.service";
import { TrackAccessService } from "../academy/track-access.service";
import { BadgesService } from "../badges/badges.service";
import { CertificatesService } from "../certificates/certificates.service";
import type { Actor } from "../../common/auth/actor";
import type {
  CredentialActionDto,
  IssueCredentialDto,
} from "./credentials.dto";

/** The gates a programme version may demand before a credential is issued. */
interface Requirements {
  lessonsCompleted?: boolean;
  passMark?: number;
  capstoneApproved?: boolean;
  defenceApproved?: boolean;
}

export interface GateResult {
  gate: string;
  met: boolean;
  detail: string;
}

@Injectable()
export class CredentialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly scope: AccessScopeService,
    private readonly trackAccess: TrackAccessService,
    private readonly badges: BadgesService,
    private readonly certificates: CertificatesService,
  ) {}

  mine(actor: Actor) {
    return this.prisma.credential.findMany({
      where: { userId: actor.id },
      include: {
        programmeVersion: { include: { programme: true } },
        events: { orderBy: { createdAt: "desc" }, take: 10 },
      },
      orderBy: { issuedAt: "desc" },
    });
  }

  /**
   * The register. `q` matches a serial exactly-or-partly, or the holder's name
   * or email, or the track code -- whatever the person at the desk was given.
   */
  list(status?: CredentialStatus, q?: string) {
    const term = q?.trim();
    const where: Prisma.CredentialWhereInput = {
      ...(status ? { status } : {}),
      ...(term
        ? {
            OR: [
              { serial: { contains: term, mode: "insensitive" } },
              { user: { name: { contains: term, mode: "insensitive" } } },
              { user: { email: { contains: term, mode: "insensitive" } } },
              {
                programmeVersion: {
                  programme: { code: { contains: term, mode: "insensitive" } },
                },
              },
            ],
          }
        : {}),
    };
    return this.prisma.credential.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true } },
        programmeVersion: {
          include: { programme: { select: { code: true, title: true } } },
        },
        issuedBy: { select: { id: true, name: true } },
      },
      orderBy: { issuedAt: "desc" },
    });
  }

  async detail(actor: Actor, credentialId: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      include: {
        user: { select: { id: true, name: true, email: true } },
        programmeVersion: { include: { programme: true } },
        issuedBy: { select: { id: true, name: true } },
        events: {
          orderBy: { createdAt: "desc" },
          include: { actor: { select: { id: true, name: true, role: true } } },
        },
      },
    });
    if (!credential) throw new NotFoundException("Credential not found");
    await this.scope.assertCanSeeLearner(actor, credential.userId);
    return credential;
  }

  /**
   * Staff lookup by serial: the whole record, with its history, for an
   * administrator or manager checking a certificate someone has shown them.
   */
  async bySerial(actor: Actor, serial: string) {
    const found = await this.prisma.credential.findUnique({
      where: { serial: serial.trim().toUpperCase() },
      select: { id: true },
    });
    if (!found) throw new NotFoundException("No credential with that serial");
    return this.detail(actor, found.id);
  }

  /**
   * Issued by the system, because the candidate passed the final examination.
   *
   * No waivers and no operator: the examination gate is the requirement, and
   * it was enforced when the attempt was started (every lesson complete, every
   * module quiz passed) and again by the pass mark. Idempotent -- a second pass
   * on a later attempt returns the credential already held rather than
   * minting another serial for the same achievement.
   */
  async autoIssue(input: {
    userId: string;
    programmeVersionId: string;
    attemptId: string;
    score: number;
    examTitle: string;
  }) {
    const existing = await this.prisma.credential.findUnique({
      where: {
        userId_programmeVersionId: {
          userId: input.userId,
          programmeVersionId: input.programmeVersionId,
        },
      },
    });
    if (existing) return { credential: existing, created: false };

    const reason = `Passed ${input.examTitle} with ${input.score}%. Issued automatically on passing the final examination.`;

    for (let tries = 0; ; tries++) {
      try {
        const credential = await this.prisma.$transaction(async (tx) => {
          const created = await tx.credential.create({
            data: {
              serial: mintSerial(),
              userId: input.userId,
              programmeVersionId: input.programmeVersionId,
              issuedById: null,
              autoIssued: true,
              examAttemptId: input.attemptId,
              examScore: input.score,
              reason,
            },
          });
          await tx.credentialEvent.create({
            data: {
              credentialId: created.id,
              action: "ISSUE",
              actorId: null,
              reason,
            },
          });
          return created;
        });
        await this.badges.evaluateFor(input.userId);
        return { credential, created: true };
      } catch (error) {
        const clash =
          error instanceof Prisma.PrismaClientKnownRequestError &&
          error.code === "P2002";
        if (!clash || tries >= 4) throw error;
        // Either the serial collided (retry with a new one) or a concurrent
        // submit issued it first (the lookup below returns that one).
        const raced = await this.prisma.credential.findUnique({
          where: {
            userId_programmeVersionId: {
              userId: input.userId,
              programmeVersionId: input.programmeVersionId,
            },
          },
        });
        if (raced) return { credential: raced, created: false };
      }
    }
  }

  /**
   * Evaluates every gate on a programme version for one candidate, and returns
   * the result whether or not it passes. This is the same computation the
   * issue path runs, exposed so an administrator can see what they are about
   * to waive before they waive it.
   */
  async evaluateGates(
    userId: string,
    programmeVersionId: string,
  ): Promise<GateResult[]> {
    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: programmeVersionId },
      include: {
        modules: { include: { lessons: { select: { id: true } } } },
        assessments: { select: { id: true, kind: true, passMark: true } },
      },
    });
    if (!version) throw new NotFoundException("Programme version not found");

    const requirements = (version.requirements ?? {}) as Requirements;
    const results: GateResult[] = [];

    const lessonIds = version.modules.flatMap((m) =>
      m.lessons.map((l) => l.id),
    );
    if (requirements.lessonsCompleted) {
      const done = await this.prisma.lessonProgress.count({
        where: { userId, lessonId: { in: lessonIds }, status: "COMPLETED" },
      });
      results.push({
        gate: "lessonsCompleted",
        met: lessonIds.length > 0 && done === lessonIds.length,
        detail: `${done} of ${lessonIds.length} lessons completed`,
      });
    }

    if (typeof requirements.passMark === "number") {
      const quizzes = version.assessments.filter((a) => a.kind === "QUIZ");
      const best = await this.prisma.attempt.findMany({
        where: {
          userId,
          assessmentId: { in: quizzes.map((q) => q.id) },
          passed: true,
        },
        select: { assessmentId: true, score: true },
      });
      const passedIds = new Set(best.map((b) => b.assessmentId));
      results.push({
        gate: "passMark",
        met: quizzes.every((q) => passedIds.has(q.id)),
        detail: `${passedIds.size} of ${quizzes.length} assessments passed at ${requirements.passMark}%`,
      });
    }

    for (const [gate, kind] of [
      ["capstoneApproved", "CAPSTONE"],
      ["defenceApproved", "DEFENCE"],
    ] as const) {
      if (!requirements[gate]) continue;
      const ids = version.assessments
        .filter((a) => a.kind === kind)
        .map((a) => a.id);
      const approved = await this.prisma.submission.count({
        where: { userId, assessmentId: { in: ids }, status: "APPROVED" },
      });
      results.push({
        gate,
        met: ids.length > 0 && approved >= ids.length,
        detail: `${approved} of ${ids.length} ${kind.toLowerCase()} items approved`,
      });
    }

    return results;
  }

  /**
   * Issuing.
   *
   * Every unmet gate must be named in gateOverrides, with its own reason, or
   * the issue is refused. That is the whole of the bypass story: an
   * administrator has the authority to waive a requirement and no way to do it
   * quietly, because the waiver is written onto the credential and appears on
   * the certificate alongside it.
   */
  async issue(actor: Actor, dto: IssueCredentialDto) {
    const [holder, version] = await Promise.all([
      this.prisma.user.findUnique({
        where: { id: dto.userId },
        select: { role: true },
      }),
      this.prisma.programmeVersion.findUnique({
        where: { id: dto.programmeVersionId },
        select: { status: true },
      }),
    ]);

    if (holder?.role !== "STUDENT") {
      throw new BadRequestException("A credential is issued to a candidate");
    }
    if (!version) throw new NotFoundException("Programme version not found");
    if (version.status === "DRAFT") {
      throw new BadRequestException(
        "A draft programme version cannot award a credential",
      );
    }

    // The track's own restrictions, before this version's gates. Development
    // access opens training and never issuance, so a candidate who reached
    // AIM-CA through a flag still cannot be issued one without whatever
    // AIM-CA requires. A named grant is the one way past, and it comes back
    // here as a waiver so it lands on the credential rather than beside it.
    const programme = await this.prisma.programmeVersion.findUnique({
      where: { id: dto.programmeVersionId },
      select: { programme: { select: { code: true } } },
    });
    let trackWaiver: { gate: string; reason: string } | null = null;
    if (programme) {
      const eligibility = await this.trackAccess.assertCredentialEligible(
        dto.userId,
        programme.programme.code,
      );
      trackWaiver = eligibility.waived;
    }

    const gates = await this.evaluateGates(dto.userId, dto.programmeVersionId);
    const unmet = gates.filter((g) => !g.met).map((g) => g.gate);
    const waived = new Map(
      (dto.gateOverrides ?? []).map((o) => [o.gate, o.reason]),
    );

    const unexplained = unmet.filter((gate) => !waived.has(gate));
    if (unexplained.length > 0) {
      throw new BadRequestException(
        `Unmet requirements must be waived explicitly: ${unexplained.join(", ")}`,
      );
    }

    // A waiver for a gate that was met is a sign the operator is confused
    // about what they are signing. Refuse rather than record something untrue.
    const spurious = [...waived.keys()].filter((gate) => !unmet.includes(gate));
    if (spurious.length > 0) {
      throw new BadRequestException(
        `These requirements were met and need no waiver: ${spurious.join(", ")}`,
      );
    }

    const stamped = unmet.map((gate) => ({
      gate,
      reason: waived.get(gate),
      waivedBy: actor.id,
      waivedByName: actor.name,
      waivedAt: new Date().toISOString(),
      detail: gates.find((g) => g.gate === gate)?.detail ?? null,
    }));

    // The track restriction a named grant stood in for. The operator did not
    // type this one, so it records who admitted the exception, not who issued.
    if (trackWaiver) {
      stamped.push({
        gate: `Track restriction: ${trackWaiver.gate}`,
        reason: trackWaiver.reason,
        waivedBy: actor.id,
        waivedByName: actor.name,
        waivedAt: new Date().toISOString(),
        detail: "Admitted by a named track grant.",
      });
    }

    const issued = await this.prisma.$transaction(async (tx) => {
      const credential = await tx.credential.create({
        data: {
          serial: mintSerial(),
          userId: dto.userId,
          programmeVersionId: dto.programmeVersionId,
          issuedById: actor.id,
          reason: dto.reason,
          gateOverrides: stamped as object,
        },
      });

      await tx.credentialEvent.create({
        data: {
          credentialId: credential.id,
          action: "ISSUE",
          actorId: actor.id,
          reason: dto.reason,
        },
      });

      return credential;
    });

    // Holding a credential can itself be a badge condition, and it unlocks the
    // next rung of the ladder.
    await this.badges.evaluateFor(dto.userId);
    return issued;
  }

  suspend(actor: Actor, id: string, dto: CredentialActionDto) {
    return this.transition(actor, id, "SUSPEND", dto.reason);
  }

  revoke(actor: Actor, id: string, dto: CredentialActionDto) {
    return this.transition(actor, id, "REVOKE", dto.reason);
  }

  reinstate(actor: Actor, id: string, dto: CredentialActionDto) {
    return this.transition(actor, id, "REINSTATE", dto.reason);
  }

  /**
   * The credential lifecycle, as one guarded transition.
   *
   * Revocation is terminal. Reinstating a revoked credential would make the
   * record ambiguous about whether it was ever withdrawn, so a revoked
   * credential stays revoked and a fresh one is issued instead, with its own
   * serial and its own stated reason.
   */
  private async transition(
    actor: Actor,
    credentialId: string,
    action: "SUSPEND" | "REVOKE" | "REINSTATE",
    reason: string,
  ) {
    const credential = await this.prisma.credential.findUnique({
      where: { id: credentialId },
      select: { id: true, status: true },
    });
    if (!credential) throw new NotFoundException("Credential not found");

    const allowed: Record<typeof action, CredentialStatus[]> = {
      SUSPEND: ["ISSUED"],
      REVOKE: ["ISSUED", "SUSPENDED"],
      REINSTATE: ["SUSPENDED"],
    };

    if (!allowed[action].includes(credential.status)) {
      throw new BadRequestException(
        `Cannot ${action.toLowerCase()} a credential that is ${credential.status}`,
      );
    }

    const now = new Date();
    const patch =
      action === "SUSPEND"
        ? { status: "SUSPENDED" as const, suspendedAt: now }
        : action === "REVOKE"
          ? { status: "REVOKED" as const, revokedAt: now }
          : { status: "ISSUED" as const, suspendedAt: null, reinstatedAt: now };

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.credential.update({
        where: { id: credentialId },
        data: patch,
      });
      await tx.credentialEvent.create({
        data: { credentialId, action, actorId: actor.id, reason },
      });
      return updated;
    });
  }

  /** The certificate payload. Waivers travel with it, by design. */
  async certificate(actor: Actor, credentialId: string) {
    const credential = await this.detail(actor, credentialId);

    // The design is resolved here rather than on the page, so the certificate
    // a candidate sees and the one the designer previewed are the same sheet.
    const template = await this.certificates.resolve(
      credential.programmeVersion.programme.id,
    );

    return {
      template,
      serial: credential.serial,
      holder: credential.user.name,
      programme: credential.programmeVersion.programme.title,
      programmeCode: credential.programmeVersion.programme.code,
      version: credential.programmeVersion.version,
      status: credential.status,
      issuedAt: credential.issuedAt,
      issuedBy: credential.issuedBy?.name ?? "Issued automatically",
      autoIssued: credential.autoIssued,
      examScore: credential.examScore,
      reason: credential.reason,
      // Present on the certificate itself. A waived requirement is part of
      // what this credential means, not a footnote in an internal table.
      gateOverrides: credential.gateOverrides,
      verifyPath: `/verify/${credential.serial}`,
    };
  }

  /** Public-facing check by serial. Confirms standing, discloses nothing else. */
  async verify(serial: string) {
    const credential = await this.prisma.credential.findUnique({
      where: { serial },
      select: {
        serial: true,
        status: true,
        issuedAt: true,
        revokedAt: true,
        suspendedAt: true,
        autoIssued: true,
        user: { select: { name: true } },
        programmeVersion: {
          select: {
            version: true,
            programme: { select: { code: true, title: true } },
          },
        },
      },
    });
    if (!credential)
      throw new NotFoundException("No credential with that serial");
    return credential;
  }
}

function mintSerial(): string {
  const year = new Date().getFullYear();
  return `AIM-${year}-${randomBytes(4).toString("hex").toUpperCase()}`;
}
