import { IsObject, IsOptional, IsString, MinLength } from "class-validator";

export class StartAttemptDto {
  @IsString() assessmentId!: string;
}

export class SubmitAttemptDto {
  /** { "<questionId>": "a" | ["a","c"] | "free text" } */
  @IsObject() responses!: Record<string, unknown>;

  /** Required when the assessment is a written one that goes to an examiner. */
  @IsOptional() @IsString() @MinLength(1) contentMd?: string;
}
