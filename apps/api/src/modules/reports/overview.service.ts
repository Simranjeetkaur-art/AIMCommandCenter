import { Injectable } from "@nestjs/common";
import { AAI_BANDS, PERMISSIONS as P, bandFor } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";

/**
 * What the institution actually holds, in four numbers-with-shape.
 *
 * The administrator's overview used to be four tiles about the audit log,
 * which says how much has happened and nothing about what exists. These are
 * the four things this system is for: the register it governs (Dx), the
 * control work it prescribes (Rx), the academy it runs, and the credentials it
 * stands behind.
 *
 * Every figure is counted here rather than in the page, because a tile that
 * disagrees with the screen behind it is worse than no tile.
 */
@Injectable()
export class OverviewService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The sections this caller may read, and nulls for the rest.
   *
   * The four tiles cut across four permission domains, so a single blanket
   * permission on the route would either lock a manager out of the academy
   * figures they are responsible for, or hand them credential counts they do
   * not hold. A null section is an honest "not yours" the page can render,
   * which is the same answer `apiOrNull` gives a panel elsewhere.
   */
  async all(actor: Actor) {
    const holds = (permission: string) =>
      (actor.permissions as readonly string[]).includes(permission);

    const canSeeRegister = holds(P.DIAGNOSTIC_READ_ALL) && holds(P.AGENT_READ);
    const canSeeAcademy = holds(P.PROGRAMME_READ);
    const canSeeCertification = holds(P.CREDENTIAL_READ_ALL);

    const [dx, rx, academy, certification] = await Promise.all([
      canSeeRegister ? this.dx() : null,
      canSeeRegister ? this.rx() : null,
      canSeeAcademy ? this.academy() : null,
      canSeeCertification ? this.certification() : null,
    ]);

    return {
      dx,
      rx,
      academy,
      certification,
      generatedAt: new Date().toISOString(),
    };
  }

  /** The register, and what the diagnostics say about it. */
  private async dx() {
    const [agents, retired, bound, practice, assessed] = await Promise.all([
      this.prisma.agent.count({ where: { retiredAt: null } }),
      this.prisma.agent.count({ where: { retiredAt: { not: null } } }),
      this.prisma.diagnostic.count({ where: { isPractice: false } }),
      this.prisma.diagnostic.count({ where: { isPractice: true } }),
      this.prisma.agent.findMany({
        where: { retiredAt: null, aai: { not: null } },
        select: {
          code: true,
          name: true,
          aai: true,
          band: true,
          status: true,
          lastCommand: true,
        },
        orderBy: { aai: "desc" },
      }),
    ]);

    // An agent with no bound diagnostic has no AAI, and averaging over the
    // ones that do would read as though the register were fully assessed.
    const scored = assessed.map((a) => a.aai as number);
    const mean = scored.length
      ? scored.reduce((sum, n) => sum + n, 0) / scored.length
      : null;

    const byBand = AAI_BANDS.map((band) => ({
      band: band.band,
      label: band.label,
      tone: band.tone,
      count: assessed.filter((a) => a.band === band.band).length,
    }));

    return {
      agents,
      retired,
      /** Agents in the register that nobody has yet run a diagnostic against. */
      unassessed: agents - assessed.length,
      diagnostics: { bound, practice, total: bound + practice },
      meanAai: mean === null ? null : Math.round(mean * 10) / 10,
      meanBand: mean === null ? null : bandFor(mean).band,
      byBand,
      /** The register's own attention list, worst first. */
      highest: assessed.slice(0, 5),
      needingAttention: assessed.filter((a) => a.status !== "GOVERNED").length,
    };
  }

  /** The control work that came out of those diagnostics. */
  private async rx() {
    const [total, recent, diagnostics] = await Promise.all([
      this.prisma.prescription.count(),
      this.prisma.prescription.findMany({
        orderBy: { createdAt: "desc" },
        take: 5,
        select: {
          id: true,
          controls: true,
          createdAt: true,
          diagnostic: {
            select: {
              agentName: true,
              aai: true,
              band: true,
              isPractice: true,
            },
          },
        },
      }),
      this.prisma.diagnostic.count(),
    ]);

    // Which controls the academy keeps prescribing, across every prescription.
    const all = await this.prisma.prescription.findMany({
      select: { controls: true },
    });
    const tally = new Map<string, number>();
    for (const row of all) {
      const controls = Array.isArray(row.controls) ? row.controls : [];
      for (const control of controls) {
        const label = this.controlLabel(control);
        if (label) tally.set(label, (tally.get(label) ?? 0) + 1);
      }
    }
    const mostPrescribed = [...tally.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([label, count]) => ({ label, count }));

    return {
      total,
      /** Diagnostics that have not been followed by a prescription. */
      withoutPrescription: Math.max(0, diagnostics - total),
      mostPrescribed,
      recent: recent.map((p) => ({
        id: p.id,
        agentName: p.diagnostic.agentName,
        aai: p.diagnostic.aai,
        band: p.diagnostic.band,
        practice: p.diagnostic.isPractice,
        controls: Array.isArray(p.controls) ? p.controls.length : 0,
        createdAt: p.createdAt,
      })),
    };
  }

  /** A control is stored as an object or a bare string depending on its age. */
  private controlLabel(control: unknown): string | null {
    if (typeof control === "string") return control;
    if (control && typeof control === "object") {
      const record = control as Record<string, unknown>;
      for (const key of ["control", "label", "title", "dimension", "name"]) {
        if (typeof record[key] === "string") return record[key] as string;
      }
    }
    return null;
  }

  /** What the academy holds, and who is moving through it. */
  private async academy() {
    const [programmes, published, drafts, cohorts, archivedCohorts] =
      await Promise.all([
        this.prisma.programme.count(),
        this.prisma.programmeVersion.count({ where: { status: "PUBLISHED" } }),
        this.prisma.programmeVersion.count({ where: { status: "DRAFT" } }),
        this.prisma.cohort.count({ where: { archivedAt: null } }),
        this.prisma.cohort.count({ where: { archivedAt: { not: null } } }),
      ]);

    const tracks = await this.prisma.programme.findMany({
      orderBy: { level: "asc" },
      select: {
        id: true,
        code: true,
        title: true,
        level: true,
        visible: true,
        unlockPolicy: true,
        _count: { select: { unlockRules: true, trackGrants: true } },
        versions: {
          where: { status: "PUBLISHED" },
          orderBy: { version: "desc" },
          take: 1,
          select: {
            id: true,
            version: true,
            _count: { select: { assessments: true } },
            modules: {
              select: {
                id: true,
                visible: true,
                _count: { select: { lessons: true } },
              },
            },
          },
        },
      },
    });

    const [candidates, enrolled, completed, lessonsDone, attempts, passes] =
      await Promise.all([
        this.prisma.user.count({
          where: { role: "STUDENT", archivedAt: null },
        }),
        this.prisma.enrollment.count({ where: { status: "ACTIVE" } }),
        this.prisma.enrollment.count({ where: { status: "COMPLETED" } }),
        this.prisma.lessonProgress.count({ where: { status: "COMPLETED" } }),
        this.prisma.attempt.count(),
        this.prisma.attempt.count({ where: { passed: true } }),
      ]);

    return {
      programmes,
      publishedVersions: published,
      draftVersions: drafts,
      cohorts,
      archivedCohorts,
      candidates,
      enrolled,
      completed,
      lessonsCompleted: lessonsDone,
      attempts,
      passes,
      passRate:
        attempts === 0 ? null : Math.round((passes / attempts) * 1000) / 10,
      tracks: tracks.map((t) => {
        const version = t.versions[0] ?? null;
        const modules = version?.modules ?? [];
        return {
          id: t.id,
          code: t.code,
          title: t.title,
          level: t.level,
          visible: t.visible,
          published: version !== null,
          version: version?.version ?? null,
          modules: modules.length,
          hiddenModules: modules.filter((m) => !m.visible).length,
          lessons: modules.reduce((sum, m) => sum + m._count.lessons, 0),
          assessments: version?._count.assessments ?? 0,
          unlockRules: t._count.unlockRules,
          unlockPolicy: t.unlockPolicy,
          grants: t._count.trackGrants,
        };
      }),
    };
  }

  /** What the institution has put its name to. */
  private async certification() {
    const [issued, suspended, revoked, waived, badges, awarded, revokedBadges] =
      await Promise.all([
        this.prisma.credential.count({ where: { status: "ISSUED" } }),
        this.prisma.credential.count({ where: { status: "SUSPENDED" } }),
        this.prisma.credential.count({ where: { status: "REVOKED" } }),
        this.prisma.credential.count({
          where: { NOT: { gateOverrides: { equals: [] } } },
        }),
        this.prisma.badge.count({ where: { active: true } }),
        this.prisma.badgeAward.count({ where: { revokedAt: null } }),
        this.prisma.badgeAward.count({ where: { revokedAt: { not: null } } }),
      ]);

    const byTrack = await this.prisma.credential.groupBy({
      by: ["programmeVersionId"],
      _count: { _all: true },
      where: { status: "ISSUED" },
    });

    const versions = byTrack.length
      ? await this.prisma.programmeVersion.findMany({
          where: { id: { in: byTrack.map((r) => r.programmeVersionId) } },
          select: {
            id: true,
            version: true,
            programme: { select: { code: true, level: true } },
          },
        })
      : [];

    const perTrack = new Map<
      string,
      { code: string; level: number; issued: number }
    >();
    for (const row of byTrack) {
      const version = versions.find((v) => v.id === row.programmeVersionId);
      if (!version) continue;
      const entry = perTrack.get(version.programme.code) ?? {
        code: version.programme.code,
        level: version.programme.level,
        issued: 0,
      };
      entry.issued += row._count._all;
      perTrack.set(version.programme.code, entry);
    }

    const recent = await this.prisma.credential.findMany({
      orderBy: { issuedAt: "desc" },
      take: 5,
      select: {
        id: true,
        serial: true,
        status: true,
        issuedAt: true,
        gateOverrides: true,
        user: { select: { name: true } },
        programmeVersion: { select: { programme: { select: { code: true } } } },
      },
    });

    return {
      issued,
      suspended,
      revoked,
      /**
       * Credentials carrying a waived requirement. Surfaced on the overview
       * rather than buried, because an institution that cannot see how many of
       * its credentials went round a gate is not really enforcing the gate.
       */
      waived,
      badges,
      awarded,
      revokedBadges,
      byTrack: [...perTrack.values()].sort((a, b) => a.level - b.level),
      recent: recent.map((c) => ({
        id: c.id,
        serial: c.serial,
        status: c.status,
        holder: c.user.name,
        track: c.programmeVersion.programme.code,
        issuedAt: c.issuedAt,
        waivers: Array.isArray(c.gateOverrides) ? c.gateOverrides.length : 0,
      })),
    };
  }
}
