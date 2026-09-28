import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from "class-validator";

export class CreateCohortDto {
  @IsString() @MinLength(3) code!: string;
  @IsString() @MinLength(3) title!: string;
  @IsString() programmeVersionId!: string;
  @IsDateString() startsAt!: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

export class EnrollDto {
  @IsString() userId!: string;
}

export class EnrollManyDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsString({ each: true })
  userIds!: string[];
}

export class WithdrawDto {
  @IsString() userId!: string;
  @IsString() @MinLength(10) reason!: string;
}

export class AssignInstructorDto {
  @IsString() instructorId!: string;
  @IsString() learnerId!: string;
  @IsOptional() @IsString() cohortId?: string;
}

export class AssignCohortDto {
  @IsString() instructorId!: string;
}

export class UpdateCohortDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsDateString() startsAt?: string;
  @IsOptional() @IsDateString() endsAt?: string;
}

/**
 * Closing a cohort.
 *
 * Archived rather than deleted, for the same reason accounts are: enrolments,
 * attempts and credentials all point at it, and a deleted cohort would leave
 * every one of those records describing something that no longer exists.
 */
export class ArchiveCohortDto {
  @IsIn(["ARCHIVE", "RESTORE"]) action!: "ARCHIVE" | "RESTORE";
  @IsString()
  @MinLength(10, { message: "Closing a cohort requires a stated reason" })
  reason!: string;
}
