import { Type } from "class-transformer";
import {
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { SubmissionStatus } from "@prisma/client";
import { MIN_REVIEW_COMMENT_LENGTH } from "@aim/contracts";
import { PageQuery } from "../../common/util/pagination";

export class CreateSubmissionDto {
  @IsString() assessmentId!: string;
  @IsString() @MinLength(1) contentMd!: string;
}

export class ResubmitDto {
  @IsString() @MinLength(1) contentMd!: string;
}

export class ListSubmissionsQuery extends PageQuery {
  @IsOptional() @IsEnum(SubmissionStatus) status?: SubmissionStatus;
  @IsOptional() @IsString() learnerId?: string;
}

export class ApproveDto {
  /**
   * An approval carries a rationale, and the length floor is enforced rather
   * than suggested. A one-word approval is not a record of judgement.
   */
  @IsString()
  @MinLength(MIN_REVIEW_COMMENT_LENGTH, {
    message: `An approval must carry a substantive comment of at least ${MIN_REVIEW_COMMENT_LENGTH} characters`,
  })
  comment!: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100) score?: number;
}

export class ReturnDto {
  @IsString()
  @MinLength(MIN_REVIEW_COMMENT_LENGTH, {
    message: `Returned work must say what has to change, in at least ${MIN_REVIEW_COMMENT_LENGTH} characters`,
  })
  comment!: string;
}

export class GradeDto {
  @Type(() => Number) @IsInt() @Min(0) @Max(100) score!: number;

  @IsString()
  @MinLength(MIN_REVIEW_COMMENT_LENGTH, {
    message: `A grade must carry a written rationale of at least ${MIN_REVIEW_COMMENT_LENGTH} characters`,
  })
  comment!: string;
}

export class ReassignDto {
  @IsString() instructorId!: string;
  @IsString() @MinLength(10) reason!: string;
}

export class LearnerNoteDto {
  @IsString() @MinLength(10) body!: string;
}
