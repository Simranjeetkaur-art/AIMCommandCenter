import { BadRequestException, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  AUTO_ENROL_FLAG,
  INTAKE_COHORT_SETTING,
  MAIL_KINDS,
  MAIL_PROVIDERS,
  checkMailConfig,
  mailPreset,
} from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { sealSecret } from "../../common/crypto/secret-box";
import type { Actor } from "../../common/auth/actor";
import { MailService } from "./mail.service";
import { testEmail } from "./templates";
import type {
  SaveEnrolmentPolicyDto,
  SaveMailConfigDto,
  SendTestMailDto,
  SetMailEnabledDto,
} from "./mail.dto";

/**
 * The mail configuration, as an administrator manages it.
 *
 * The one rule that shapes every method here: **the secret goes in and never
 * comes out.** `current()` reports whether one is stored and nothing about
 * what it is. There is no endpoint that returns it, no "reveal" action, and no
 * field on any response that could accidentally carry it -- which is why the
 * shape returned below is built by hand rather than spread from the row.
 */
@Injectable()
export class MailConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  /** Everything the settings screen needs, and nothing it must not have. */
  async current() {
    const row = await this.prisma.mailConfig.findUnique({
      where: { id: "default" },
      include: { updatedBy: { select: { name: true } } },
    });

    const [intake, autoFlag, cohorts] = await Promise.all([
      this.prisma.setting.findUnique({ where: { key: INTAKE_COHORT_SETTING } }),
      this.prisma.featureFlag.findUnique({ where: { key: AUTO_ENROL_FLAG } }),
      this.prisma.cohort.findMany({
        where: { archivedAt: null },
        orderBy: { startsAt: "desc" },
        select: {
          id: true,
          code: true,
          title: true,
          programmeVersion: {
            select: { programme: { select: { title: true } } },
          },
        },
      }),
    ]);

    return {
      providers: MAIL_PROVIDERS,
      config: row
        ? {
            provider: row.provider,
            fromName: row.fromName,
            fromEmail: row.fromEmail,
            host: row.host,
            port: row.port,
            secure: row.secure,
            username: row.username,
            enabled: row.enabled,
            /** Whether one is stored. Never what it is. */
            hasSecret: Boolean(row.secretCipher),
            lastTestedAt: row.lastTestedAt,
            lastTestOk: row.lastTestOk,
            lastTestError: row.lastTestError,
            updatedAt: row.updatedAt,
            updatedBy: row.updatedBy.name,
          }
        : null,
      enrolment: {
        intakeCohortId: (intake?.value as string | null) ?? null,
        autoEnrol: autoFlag?.enabled ?? true,
        cohorts: cohorts.map((c) => ({
          id: c.id,
          code: c.code,
          title: c.title,
          programme: c.programmeVersion.programme.title,
        })),
      },
    };
  }

  async save(actor: Actor, dto: SaveMailConfigDto) {
    const existing = await this.prisma.mailConfig.findUnique({
      where: { id: "default" },
      select: { secretCipher: true },
    });
    const hasStoredSecret = Boolean(existing?.secretCipher);

    const verdict = checkMailConfig(dto, { hasStoredSecret });
    if (!verdict.ok || !verdict.resolved) {
      throw new BadRequestException(verdict.problems);
    }

    const r = verdict.resolved;
    const secret = (dto.secret ?? "").trim();

    /**
     * Changing the configuration switches sending off until it is tested
     * again.
     *
     * A new key that turns out to be wrong would otherwise mean every
     * verification message silently failing while the screen still says
     * enabled. Better that the administrator presses Test, sees it work, and
     * turns it on deliberately.
     */
    const data = {
      provider: r.provider,
      fromName: r.fromName,
      fromEmail: r.fromEmail,
      host: r.host,
      port: r.port,
      secure: r.secure,
      username: r.username,
      enabled: false,
      lastTestOk: null,
      lastTestError: null,
      lastTestedAt: null,
      updatedById: actor.id,
      ...(secret.length > 0 ? { secretCipher: sealSecret(secret) } : {}),
    };

    const row = await this.prisma.mailConfig.upsert({
      where: { id: "default" },
      create: { id: "default", ...data },
      update: data,
    });

    this.mail.forget();
    return { saved: true, provider: row.provider, enabled: row.enabled };
  }

  /**
   * Sends one real message, and records what happened.
   *
   * This is the only way a configuration becomes usable: `enabled` cannot be
   * turned on until a test has actually been delivered, so "mail is on" always
   * means "mail has left this machine at least once".
   */
  async test(actor: Actor, dto: SendTestMailDto) {
    const row = await this.prisma.mailConfig.findUnique({
      where: { id: "default" },
    });
    if (!row || !row.secretCipher) {
      throw new BadRequestException(
        "Save a provider and its key before sending a test.",
      );
    }

    const to = (dto.to ?? actor.email).trim().toLowerCase();
    const preset = mailPreset(row.provider);

    try {
      await this.mail.sendOrThrow(
        MAIL_KINDS.TEST,
        { email: to, name: actor.name ?? "Administrator" },
        testEmail({
          triggeredBy: actor.email,
          provider: preset?.name ?? row.provider,
        }),
      );
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      await this.prisma.mailConfig.update({
        where: { id: "default" },
        data: {
          lastTestedAt: new Date(),
          lastTestOk: false,
          lastTestError: reason.slice(0, 500),
          enabled: false,
        },
      });
      // Handed back rather than swallowed: the whole point of the button is to
      // find out what the provider objected to.
      throw new BadRequestException(`The provider refused it: ${reason}`);
    }

    await this.prisma.mailConfig.update({
      where: { id: "default" },
      data: {
        lastTestedAt: new Date(),
        lastTestOk: true,
        lastTestError: null,
      },
    });

    return { sent: true, to };
  }

  /** Turning sending on, once a test has proved it works, or off at any time. */
  async setEnabled(actor: Actor, dto: SetMailEnabledDto) {
    const row = await this.prisma.mailConfig.findUnique({
      where: { id: "default" },
      select: { lastTestOk: true, secretCipher: true },
    });
    if (!row?.secretCipher) {
      throw new BadRequestException(
        "There is no mail configuration to enable.",
      );
    }
    if (dto.enabled && row.lastTestOk !== true) {
      throw new BadRequestException(
        "Send a successful test message before switching mail on.",
      );
    }

    await this.prisma.mailConfig.update({
      where: { id: "default" },
      data: { enabled: dto.enabled, updatedById: actor.id },
    });
    this.mail.forget();
    return { enabled: dto.enabled };
  }

  /** Where verified candidates land, and whether they land anywhere. */
  async saveEnrolmentPolicy(actor: Actor, dto: SaveEnrolmentPolicyDto) {
    if (dto.intakeCohortId !== undefined) {
      const id = dto.intakeCohortId;
      if (id) {
        const cohort = await this.prisma.cohort.findUnique({
          where: { id },
          select: { id: true, archivedAt: true },
        });
        if (!cohort || cohort.archivedAt) {
          throw new BadRequestException(
            "That cohort does not exist, or has been archived.",
          );
        }
      }
      await this.prisma.setting.upsert({
        where: { key: INTAKE_COHORT_SETTING },
        create: {
          key: INTAKE_COHORT_SETTING,
          // Prisma wants its own null for a Json column: a bare null there means
          // "do not touch this field", which would make clearing impossible.
          value: id ?? Prisma.JsonNull,
          description:
            "The cohort a self-enrolled candidate joins once they verify their email",
          updatedById: actor.id,
        },
        update: { value: id ?? Prisma.JsonNull, updatedById: actor.id },
      });
    }

    if (dto.autoEnrol !== undefined) {
      await this.prisma.featureFlag.upsert({
        where: { key: AUTO_ENROL_FLAG },
        create: {
          key: AUTO_ENROL_FLAG,
          enabled: dto.autoEnrol,
          description:
            "Enrol a self-registered candidate on the intake cohort when they verify",
          updatedById: actor.id,
        },
        update: { enabled: dto.autoEnrol, updatedById: actor.id },
      });
    }

    return { saved: true };
  }
}
