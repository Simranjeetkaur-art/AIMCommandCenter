import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
} from "class-validator";

export class WritePerformanceReviewDto {
  @IsUUID() subjectId!: string;

  /** "2026-Q3" or "2026-H1": a named period, so reviews stack up over time. */
  @IsString()
  @Matches(/^[0-9]{4}-[A-Za-z0-9]{1,6}$/, {
    message: 'A cycle looks like "2026-Q3"',
  })
  cycle!: string;

  /**
   * One score per dimension, in that role's dimension order.
   *
   * There is deliberately no `index` field: the index is computed on the
   * server from these, the same rule the diagnostic follows. A caller that
   * could post its own index could post any number it liked.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  scores!: number[];

  @IsOptional() @IsString() @MaxLength(4000) strengths?: string;
  @IsOptional() @IsString() @MaxLength(4000) concerns?: string;
  @IsOptional() @IsString() @MaxLength(4000) actions?: string;
}

export class PerformanceQuery {
  @IsOptional() @IsUUID() subjectId?: string;
  @IsOptional() @IsString() cycle?: string;
  @IsOptional()
  @IsEnum({ DRAFT: "DRAFT", RELEASED: "RELEASED" })
  status?: "DRAFT" | "RELEASED";
}
