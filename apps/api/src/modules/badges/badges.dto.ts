import { Type } from "class-transformer";
import {
  IsBoolean,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { BadgeAwardMode } from "@prisma/client";
import { BADGE_CRITERIA_TYPES, type BadgeCriteriaType } from "@aim/contracts";

export class BadgeCriteriaDto {
  @IsEnum(BADGE_CRITERIA_TYPES) type!: BadgeCriteriaType;
  @IsOptional() @IsString() assessmentCode?: string;
  @IsOptional() @IsString() programmeCode?: string;
  @IsOptional() @IsString() assessmentKind?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9) level?: number;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(1000)
  threshold?: number;
}

export class CreateBadgeDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(3) title!: string;
  @IsOptional() @IsString() description?: string;
  @IsObject() criteria!: BadgeCriteriaDto;
  @IsOptional() @IsEnum(BadgeAwardMode) awardMode?: BadgeAwardMode;
  @IsOptional() @IsString() programmeCode?: string;
  /** Inline SVG artwork. Sanitised before it is stored. */
  @IsOptional() @IsString() iconSvg?: string;
  @IsOptional() @IsString() iconText?: string;
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9) level?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateBadgeDto {
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsObject() criteria?: BadgeCriteriaDto;
  @IsOptional() @IsEnum(BadgeAwardMode) awardMode?: BadgeAwardMode;
  @IsOptional() @IsString() programmeCode?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @IsString() iconSvg?: string;
  @IsOptional() @IsString() iconText?: string;
  @IsOptional() @IsString() tone?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9) level?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class AwardBadgeDto {
  @IsString() learnerId!: string;

  /**
   * Mandatory. A badge handed over without a stated reason records that
   * something happened and nothing about why, which is the same failure as an
   * approval with no rationale.
   */
  @IsString()
  @MinLength(20, {
    message: "Say what this learner did to earn it, in at least 20 characters",
  })
  reason!: string;
}

export class RevokeBadgeDto {
  @IsString() learnerId!: string;
  @IsString()
  @MinLength(20, { message: "Withdrawing an award requires a stated reason" })
  reason!: string;
}
