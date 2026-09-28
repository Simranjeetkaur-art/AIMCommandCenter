import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";

/** One condition, resolved against one candidate. */
export interface Requirement {
  id: string;
  type: string;
  /** What the candidate is told, e.g. "Hold an active AIM-CP credential". */
  label: string;
  met: boolean;
  /** Where they have got to, when the rule has a measure, e.g. "6 of 10". */
  detail: string;
}

export interface TrackAccess {
  open: boolean;
  /** ALL: every rule. ANY: one is enough. */
  policy: "ALL" | "ANY";
  requirements: Requirement[];
  /** True when the rules themselves are satisfied, with nothing standing in. */
  requirementsMet: boolean;
  /** True when a named exception opened the track for this person. */
  granted: boolean;
  grantReason: string | null;
  /** True when a feature flag opened training without the requirements. */
  devAccess: boolean;
  /**
   * Kept because the track card still shows a ladder position, and because the
   * common case -- one CREDENTIAL_HELD rule -- is what a candidate calls the
   * prerequisite. Null once a track is gated on something other than a track.
   */
  prerequisiteCode: string | null;
  prerequisiteMet: boolean;
  reason: string;
}

/**
 * What opens a track.
 *
 * The ladder used to be a constant: AIM-CA needs AIM-CP, AIM-EL needs AIM-CA.
 * It is now a list of rules per track, combined by ALL or ANY, which an
 * administrator writes -- so a track can open on a badge, a cohort, a date, a
 * count of finished modules, a named exception, or nothing at all. The
 * sequence is one arrangement of those rules rather than the only one.
 *
 * Two things sit outside the rules and stay outside them:
 *
 *  - A feature flag opens *training* without the requirements, which is what
 *    the prototype called development access. It never opens issuance: a
 *    credential earned behind a development flag would attest to nothing.
 *  - A TrackGrant opens the track for one named person with a reason. It does
 *    reach issuance -- an institution can admit an exception -- but the
 *    credential carries the waiver in `gateOverrides`, so a bypass is never
 *    invisible on the thing it produced.
 */
@Injectable()
export class TrackAccessService {
  constructor(private readonly prisma: PrismaService) {}

  async evaluate(userId: string, programmeCode: string): Promise<TrackAccess> {
    const programme = await this.prisma.programme.findUnique({
      where: { code: programmeCode },
      select: {
        id: true,
        devAccessFlag: true,
        unlockPolicy: true,
        unlockRules: {
          where: { active: true },
          orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        },
      },
    });

    if (!programme) return this.openAccess("No such track.");

    const policy = programme.unlockPolicy;
    const rules = programme.unlockRules;

    // A named exception is read first: it decides the outcome whatever the
    // rules say, and a candidate holding one should be told so rather than
    // shown a list of conditions that no longer applies to them.
    const grant = await this.liveGrant(userId, programme.id);

    if (rules.length === 0) {
      return {
        ...this.openAccess("No restriction on this track."),
        policy,
        granted: grant !== null,
        grantReason: grant?.reason ?? null,
      };
    }

    const requirements = await Promise.all(
      rules.map((rule) => this.resolve(userId, programme.id, rule)),
    );

    const requirementsMet =
      policy === "ANY"
        ? requirements.some((r) => r.met)
        : requirements.every((r) => r.met);

    const flagKey =
      programme.devAccessFlag ??
      `tracks.${programmeCode.toLowerCase()}.devAccess`;
    const flag =
      requirementsMet || grant
        ? null
        : await this.prisma.featureFlag.findUnique({ where: { key: flagKey } });
    const devAccess = Boolean(flag?.enabled);

    // The prerequisite, as a candidate uses the word, is the credential rule --
    // if there is exactly one.
    const credentialRules = rules.filter((r) => r.type === "CREDENTIAL_HELD");
    const prerequisiteCode =
      credentialRules.length === 1
        ? (credentialRules[0].requiredProgrammeCode ?? null)
        : null;
    const prerequisiteMet = prerequisiteCode
      ? (requirements.find((r) => r.id === credentialRules[0].id)?.met ?? false)
      : requirementsMet;

    const unmet = requirements.filter((r) => !r.met);

    return {
      open: requirementsMet || grant !== null || devAccess,
      policy,
      requirements,
      requirementsMet,
      granted: grant !== null,
      grantReason: grant?.reason ?? null,
      devAccess,
      prerequisiteCode,
      prerequisiteMet,
      reason: requirementsMet
        ? "Training unlocked."
        : grant
          ? `Access granted by the academy: ${grant.reason}`
          : devAccess
            ? "Development access: training is open for course development. Certification still requires the listed requirements."
            : policy === "ANY"
              ? `Locked. Any one of: ${requirements.map((r) => r.label).join("; ")}.`
              : `Locked. ${unmet.map((r) => r.label).join("; ")}.`,
    };
  }

  /** Refuses work on a locked track. */
  async assertTrainingOpen(
    actor: Actor,
    programmeVersionId: string,
  ): Promise<void> {
    // An authoring or administration role is not a candidate climbing the
    // ladder; they reach the content to build and check it.
    if ((actor.permissions as readonly string[]).includes(P.PROGRAMME_UPDATE))
      return;

    const version = await this.prisma.programmeVersion.findUnique({
      where: { id: programmeVersionId },
      select: { programme: { select: { code: true } } },
    });
    if (!version) throw new NotFoundException("Programme version not found");

    const access = await this.evaluate(actor.id, version.programme.code);
    if (!access.open) throw new ForbiddenException(access.reason);
  }

  /**
   * The harder gate. Development access opens training and never issuance, so
   * this ignores the flag entirely. A named grant does count -- and returns the
   * waiver, which the caller stamps onto the credential.
   */
  async assertCredentialEligible(
    userId: string,
    programmeCode: string,
  ): Promise<{ waived: null | { gate: string; reason: string } }> {
    const access = await this.evaluate(userId, programmeCode);
    if (access.requirementsMet) return { waived: null };

    const unmet = access.requirements.filter((r) => !r.met).map((r) => r.label);

    if (access.granted) {
      return {
        waived: {
          gate: unmet.join("; ") || "track requirements",
          reason: access.grantReason ?? "Named exception",
        },
      };
    }

    throw new ForbiddenException(
      `${programmeCode} cannot be issued: ${unmet.join("; ")}.`,
    );
  }

  // -- Internals ------------------------------------------------------------

  private openAccess(reason: string): TrackAccess {
    return {
      open: true,
      policy: "ALL",
      requirements: [],
      requirementsMet: true,
      granted: false,
      grantReason: null,
      devAccess: false,
      prerequisiteCode: null,
      prerequisiteMet: true,
      reason,
    };
  }

  private async liveGrant(userId: string, programmeId: string) {
    return this.prisma.trackGrant.findFirst({
      where: {
        userId,
        programmeId,
        revokedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { id: true, reason: true, expiresAt: true },
    });
  }

  /** Resolves one rule against one candidate. */
  private async resolve(
    userId: string,
    programmeId: string,
    rule: {
      id: string;
      type: string;
      requiredProgrammeCode: string | null;
      requiredBadgeCode: string | null;
      requiredCohortId: string | null;
      threshold: number | null;
      opensAt: Date | null;
      closesAt: Date | null;
      label: string;
    },
  ): Promise<Requirement> {
    const out = (
      met: boolean,
      fallbackLabel: string,
      detail = "",
    ): Requirement => ({
      id: rule.id,
      type: rule.type,
      label: rule.label || fallbackLabel,
      met,
      detail,
    });

    switch (rule.type) {
      case "CREDENTIAL_HELD": {
        const code = rule.requiredProgrammeCode;
        if (!code)
          return out(
            true,
            "Credential required",
            "No track named on this rule.",
          );
        const held = await this.prisma.credential.findFirst({
          where: {
            userId,
            status: "ISSUED",
            programmeVersion: { programme: { code } },
          },
          select: { serial: true },
        });
        return out(
          held !== null,
          `Hold an active ${code} credential`,
          held ? held.serial : "Not yet held",
        );
      }

      case "BADGE_HELD": {
        const code = rule.requiredBadgeCode;
        if (!code)
          return out(true, "Badge required", "No badge named on this rule.");
        const award = await this.prisma.badgeAward.findFirst({
          where: { userId, revokedAt: null, badge: { code } },
          select: { awardedAt: true },
        });
        return out(
          award !== null,
          `Hold the ${code} badge`,
          award
            ? `Awarded ${award.awardedAt.toISOString().slice(0, 10)}`
            : "Not yet earned",
        );
      }

      case "COHORT_MEMBER": {
        const cohortId = rule.requiredCohortId;
        if (!cohortId)
          return out(true, "Cohort membership required", "No cohort named.");
        const [cohort, enrollment] = await Promise.all([
          this.prisma.cohort.findUnique({
            where: { id: cohortId },
            select: { title: true },
          }),
          this.prisma.enrollment.findFirst({
            where: {
              userId,
              cohortId,
              status: { in: ["ACTIVE", "COMPLETED"] },
            },
            select: { status: true },
          }),
        ]);
        return out(
          enrollment !== null,
          `Be enrolled on ${cohort?.title ?? "a named cohort"}`,
          enrollment ? enrollment.status : "Not enrolled",
        );
      }

      case "DATE_WINDOW": {
        const now = new Date();
        const afterOpen = !rule.opensAt || rule.opensAt <= now;
        const beforeClose = !rule.closesAt || rule.closesAt > now;
        const from = rule.opensAt
          ? rule.opensAt.toISOString().slice(0, 10)
          : null;
        const to = rule.closesAt
          ? rule.closesAt.toISOString().slice(0, 10)
          : null;
        const window =
          from && to
            ? `${from} to ${to}`
            : from
              ? `from ${from}`
              : to
                ? `until ${to}`
                : "always";
        return out(
          afterOpen && beforeClose,
          `Open ${window}`,
          !afterOpen
            ? `Opens ${from}`
            : !beforeClose
              ? `Closed ${to}`
              : "Open now",
        );
      }

      case "MANUAL_GRANT": {
        const grant = await this.liveGrant(userId, programmeId);
        return out(
          grant !== null,
          "Admission by the academy",
          grant ? grant.reason : "No grant on file",
        );
      }

      case "MODULES_COMPLETED": {
        const code = rule.requiredProgrammeCode;
        const need = rule.threshold ?? 1;
        const finished = await this.modulesFinished(userId, code, programmeId);
        return out(
          finished >= need,
          `Finish ${need} module${need === 1 ? "" : "s"}${code ? ` of ${code}` : ""}`,
          `${finished} of ${need}`,
        );
      }

      default:
        // An unknown rule type must not silently open a track.
        return out(
          false,
          `Unrecognised requirement (${rule.type})`,
          "Refused by default.",
        );
    }
  }

  /**
   * How many modules of a track this candidate has actually finished.
   *
   * Counted across **every version of the track**, not against the currently
   * published one, and that is the whole point of this method.
   *
   * The old reading asked "how many modules of the live version has this
   * person completed?" — which sounds right and is wrong, because a cohort
   * stays on the version it enrolled against. It has to: moving people onto
   * new content half way through would change what they are measured on after
   * they began. So the moment a newer version was published, every learner
   * still working through the old one counted as having finished **nothing**,
   * and any track gated on "finish three modules of AIM-CP" locked shut behind
   * them. Somebody who had completed all ten modules read as 0 of 3. Making
   * revision a two-click operation turned that from a latent bug into one that
   * fires on every publish.
   *
   * A module is finished when every *visible* lesson in it is complete —
   * hiding a lesson takes it out of the requirement as well as out of view.
   *
   * Modules are then deduplicated by identity — their code, falling back to
   * their position — so the same module carried across ten versions counts
   * once. Simply counting completed module rows would have been the opposite
   * error: a candidate enrolled on two versions would have had their work
   * counted twice, and three modules done would have read as six.
   */
  private async modulesFinished(
    userId: string,
    code: string | null | undefined,
    programmeId: string,
  ): Promise<number> {
    const lessons = await this.prisma.lesson.findMany({
      where: {
        visible: true,
        module: {
          visible: true,
          programmeVersion: code ? { programme: { code } } : { programmeId },
        },
      },
      select: {
        id: true,
        module: {
          select: { id: true, code: true, position: true },
        },
      },
    });
    if (lessons.length === 0) return 0;

    const done = await this.prisma.lessonProgress.findMany({
      where: {
        userId,
        lessonId: { in: lessons.map((l) => l.id) },
        status: "COMPLETED",
      },
      select: { lessonId: true },
    });
    const doneIds = new Set(done.map((d) => d.lessonId));

    // Tally per module row first: a module is finished only if all of it is.
    const perModule = new Map<
      string,
      { identity: string; total: number; done: number }
    >();
    for (const lesson of lessons) {
      const entry = perModule.get(lesson.module.id) ?? {
        // Code is the stable name for "the same module in another version";
        // position is the fallback for a module that was never given one.
        identity: lesson.module.code ?? `#${lesson.module.position}`,
        total: 0,
        done: 0,
      };
      entry.total += 1;
      if (doneIds.has(lesson.id)) entry.done += 1;
      perModule.set(lesson.module.id, entry);
    }

    const finished = new Set<string>();
    for (const entry of perModule.values()) {
      if (entry.total > 0 && entry.done === entry.total) {
        finished.add(entry.identity);
      }
    }
    return finished.size;
  }
}
