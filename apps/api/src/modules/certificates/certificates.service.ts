import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { PrismaService } from "../../common/prisma/prisma.service";
import type { Actor } from "../../common/auth/actor";
import { sanitiseBadgeSvg } from "../badges/svg-sanitiser";
import type { UpdateCertificateTemplateDto } from "./certificate-template.dto";

/**
 * What a certificate says when nobody has designed one.
 *
 * Held here rather than relied on from the column defaults, because a track
 * with no row of its own still has to render something, and a caller should
 * never have to decide what a missing field means. Every read returns a whole
 * template.
 */
export const DEFAULT_TEMPLATE = {
  institutionName: "AIM Academy",
  title: "Certificate of Achievement",
  subtitle: "",
  statement: "has successfully completed the requirements for",
  scopeNote: "",
  signatoryName: "",
  signatoryTitle: "",
  signatureSvg: null as string | null,
  sealSvg: null as string | null,
  logoSvg: null as string | null,
  footnote: "",
  accentColor: "#B4752A",
  orientation: "LANDSCAPE" as "LANDSCAPE" | "PORTRAIT",
};

export type ResolvedTemplate = typeof DEFAULT_TEMPLATE & {
  /** Where the design came from, so a screen can say so rather than imply it. */
  source: "PROGRAMME" | "DEFAULT" | "BUILT_IN";
};

const SVG_FIELDS = ["signatureSvg", "sealSvg", "logoSvg"] as const;

@Injectable()
export class CertificatesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The design a certificate for this track is drawn with.
   *
   * Three steps, most specific first: the track's own template, the house
   * default, then the built-in. A track that has never been designed still
   * prints, and prints the same way the designer previewed it.
   */
  async resolve(programmeId: string | null): Promise<ResolvedTemplate> {
    if (programmeId) {
      const own = await this.prisma.certificateTemplate.findUnique({
        where: { programmeId },
      });
      if (own) return { ...strip(own), source: "PROGRAMME" };
    }

    const house = await this.prisma.certificateTemplate.findFirst({
      where: { programmeId: null },
    });
    if (house) return { ...strip(house), source: "DEFAULT" };

    return { ...DEFAULT_TEMPLATE, source: "BUILT_IN" };
  }

  /**
   * One template for the designer.
   *
   * `scope` is a programme id, or "default" for the house template that every
   * track without its own falls back to.
   */
  async get(scope: string) {
    const programmeId = await this.scopeToProgrammeId(scope);

    const row = programmeId
      ? await this.prisma.certificateTemplate.findUnique({
          where: { programmeId },
          include: { updatedBy: { select: { name: true } } },
        })
      : await this.prisma.certificateTemplate.findFirst({
          where: { programmeId: null },
          include: { updatedBy: { select: { name: true } } },
        });

    const resolved = await this.resolve(programmeId);

    return {
      scope,
      programmeId,
      // False means the fields below are inherited and editing them creates a
      // template of this track's own. The screen says which.
      hasOwn: row !== null,
      updatedAt: row?.updatedAt ?? null,
      updatedBy: row?.updatedBy.name ?? null,
      template: resolved,
    };
  }

  /** Every track, and whether it has a design of its own. */
  async list() {
    const [programmes, templates] = await Promise.all([
      this.prisma.programme.findMany({
        select: { id: true, code: true, title: true, level: true },
        orderBy: [{ level: "asc" }, { code: "asc" }],
      }),
      this.prisma.certificateTemplate.findMany({
        select: { programmeId: true, updatedAt: true },
      }),
    ]);

    const designed = new Map(
      templates
        .filter((t) => t.programmeId !== null)
        .map((t) => [t.programmeId as string, t.updatedAt]),
    );
    const house = templates.find((t) => t.programmeId === null) ?? null;

    return {
      house: { hasOwn: house !== null, updatedAt: house?.updatedAt ?? null },
      programmes: programmes.map((p) => ({
        ...p,
        hasOwnTemplate: designed.has(p.id),
        updatedAt: designed.get(p.id) ?? null,
      })),
    };
  }

  /**
   * Saves a design.
   *
   * The whole form arrives each time, so this writes what it is given and
   * leaves anything omitted as it was. A `null` on one of the three artwork
   * fields is a clearing, which is why they are checked for `undefined`
   * rather than for truthiness.
   */
  async save(actor: Actor, scope: string, dto: UpdateCertificateTemplateDto) {
    const programmeId = await this.scopeToProgrammeId(scope);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(dto)) {
      if (value === undefined) continue;
      data[key] = (SVG_FIELDS as readonly string[]).includes(key)
        ? cleanSvg(key, value as string | null)
        : value;
    }
    data.updatedById = actor.id;

    // programmeId is nullable-unique, and Postgres lets every NULL be its own
    // value -- so an upsert on the house template would quietly create a
    // second one. Found by id instead.
    const existing = programmeId
      ? await this.prisma.certificateTemplate.findUnique({
          where: { programmeId },
          select: { id: true },
        })
      : await this.prisma.certificateTemplate.findFirst({
          where: { programmeId: null },
          select: { id: true },
        });

    if (existing) {
      await this.prisma.certificateTemplate.update({
        where: { id: existing.id },
        data,
      });
    } else {
      await this.prisma.certificateTemplate.create({
        data: { ...data, programmeId } as never,
      });
    }

    return this.get(scope);
  }

  /**
   * Drops a track's own design so it inherits the house one again.
   *
   * The house template itself cannot be dropped this way: something has to be
   * the fallback, and "delete the thing everything else falls back to" is not
   * an act with a sensible outcome.
   */
  async remove(scope: string) {
    const programmeId = await this.scopeToProgrammeId(scope);
    if (!programmeId) {
      throw new BadRequestException(
        "The house template is the fallback and cannot be removed. Edit it instead.",
      );
    }

    const existing = await this.prisma.certificateTemplate.findUnique({
      where: { programmeId },
      select: { id: true },
    });
    if (!existing) {
      throw new NotFoundException("That track has no template of its own");
    }

    await this.prisma.certificateTemplate.delete({
      where: { id: existing.id },
    });
    return this.get(scope);
  }

  private async scopeToProgrammeId(scope: string): Promise<string | null> {
    if (scope === "default") return null;

    const programme = await this.prisma.programme.findUnique({
      where: { id: scope },
      select: { id: true },
    });
    if (!programme) throw new NotFoundException("Track not found");
    return programme.id;
  }
}

/** The design fields only -- no row id, no audit columns. */
function strip(row: Record<string, unknown>): typeof DEFAULT_TEMPLATE {
  const out = {} as Record<string, unknown>;
  for (const key of Object.keys(DEFAULT_TEMPLATE)) out[key] = row[key];
  return out as typeof DEFAULT_TEMPLATE;
}

/**
 * Artwork on a certificate is markup in our origin, exactly as badge artwork
 * is, so it goes through the same allow-list rather than a second one written
 * for this screen. Only the message changes, because "Badge artwork must be an
 * SVG element" is a confusing thing to be told about a seal.
 */
function cleanSvg(field: string, value: string | null): string | null {
  if (value === null) return null;
  if (value.trim().length === 0) return null;

  const label =
    field === "signatureSvg"
      ? "The signature"
      : field === "sealSvg"
        ? "The seal"
        : "The logo";

  try {
    return sanitiseBadgeSvg(value);
  } catch (error) {
    const detail =
      error instanceof BadRequestException
        ? String((error.getResponse() as { message?: string }).message ?? "")
        : "";
    throw new BadRequestException(
      `${label} must be a plain SVG image${
        detail.includes("under") ? " under 64 KB" : ""
      }.`,
    );
  }
}
