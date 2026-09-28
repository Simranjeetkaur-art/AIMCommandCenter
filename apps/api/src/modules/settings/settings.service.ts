import { Injectable } from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";
import type { SetFlagDto, UpsertSettingDto } from "./settings.dto";

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  listSettings() {
    return this.prisma.setting.findMany({ orderBy: { key: "asc" } });
  }

  listFlags() {
    return this.prisma.featureFlag.findMany({ orderBy: { key: "asc" } });
  }

  /**
   * Settings carry who changed them and when, in the row itself, as well as in
   * the audit log. The row answers "what is the current state and who set it";
   * the log answers "what was it before, and how did it get here".
   */
  upsertSetting(actor: Actor, dto: UpsertSettingDto) {
    return this.prisma.setting.upsert({
      where: { key: dto.key },
      create: {
        key: dto.key,
        value: dto.value as object,
        description: dto.description ?? "",
        updatedById: actor.id,
      },
      update: {
        value: dto.value as object,
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        updatedById: actor.id,
      },
    });
  }

  setFlag(actor: Actor, dto: SetFlagDto) {
    return this.prisma.featureFlag.upsert({
      where: { key: dto.key },
      create: {
        key: dto.key,
        enabled: dto.enabled,
        description: dto.description ?? "",
        updatedById: actor.id,
      },
      update: {
        enabled: dto.enabled,
        ...(dto.description !== undefined
          ? { description: dto.description }
          : {}),
        updatedById: actor.id,
      },
    });
  }
}
