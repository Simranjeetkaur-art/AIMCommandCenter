import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from "class-validator";
import { AssessmentKind, QuestionPool, QuestionType } from "@prisma/client";

export class CreateProgrammeDto {
  @IsString() @MinLength(3) code!: string;
  @IsString() @MinLength(3) title!: string;
  @IsString() summary!: string;
}

export class UpdateProgrammeDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  /** The line under the title everywhere the track is listed. */
  @IsOptional() @IsString() @MaxLength(600) summary?: string;
  @IsOptional()
  @IsEnum({ DRAFT: "DRAFT", ACTIVE: "ACTIVE", ARCHIVED: "ARCHIVED" })
  status?: "DRAFT" | "ACTIVE" | "ARCHIVED";
}

/** Destroying a track outright. Only ever an empty one -- see the service. */
export class DeleteProgrammeDto {
  @IsString() @MinLength(8) reason!: string;
}

export class CreateVersionDto {
  @IsOptional() @IsObject() requirements?: Record<string, unknown>;

  /**
   * Copy an existing version's content into the new draft.
   *
   * Without this, correcting a sentence in a published course would mean
   * rebuilding every module by hand, which is the kind of friction that ends
   * with people editing published versions instead.
   */
  @IsOptional() @IsBoolean() cloneCurrent?: boolean;
}

export class PublishVersionDto {
  @IsString()
  @MinLength(10, { message: "Publishing binds live candidates; state why" })
  reason!: string;
}

export class CreateModuleDto {
  // Optional short code (e.g. "CP-001"). The authoring form has always offered
  // it and the column exists; refusing it made the form fail whenever filled.
  @IsOptional() @IsString() @MaxLength(40) code?: string;
  @IsString() @MinLength(3) title!: string;
  @IsOptional() @IsString() summary?: string;
  @Type(() => Number) @IsInt() @Min(1) position!: number;
}

export class CreateLessonDto {
  @IsString() @MinLength(3) title!: string;
  @IsString() @MinLength(1) bodyMd!: string;
  @Type(() => Number) @IsInt() @Min(1) position!: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) estimatedMinutes?: number;
}

export class CreateQuestionDto {
  @IsString() bankId!: string;
  @IsString() @MinLength(5) stem!: string;
  @IsEnum(QuestionType) type!: QuestionType;
  @IsOptional() @IsArray() options?: unknown[];
  @IsObject() answerKey!: Record<string, unknown>;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) points?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
  @IsOptional() @IsEnum(QuestionPool) pool?: QuestionPool;
}

/** One question in a batch. Its own shape, so a fault names the question. */
export class BulkQuestionDto {
  @IsString() @MinLength(5) stem!: string;

  @IsArray()
  @ArrayMinSize(2, { message: "A question needs at least two choices" })
  @ArrayMaxSize(8)
  @IsString({ each: true })
  choices!: string[];

  @Type(() => Number) @IsInt() @Min(0) correctIndex!: number;

  @IsOptional() @IsString() explanation?: string;
}

/**
 * A batch of questions written into one bank.
 *
 * Points, tags and pool are set once for the batch rather than per question:
 * the screen this serves takes a pasted block of questions, and a paste has
 * nowhere to put per-question metadata. A question that needs its own is
 * edited afterwards, where that decision is visible.
 */
export class CreateQuestionsBulkDto {
  @IsString() bankId!: string;

  @IsArray()
  @ArrayMinSize(1, { message: "No questions to add" })
  @ArrayMaxSize(200, { message: "200 questions at a time is the limit" })
  @ValidateNested({ each: true })
  @Type(() => BulkQuestionDto)
  questions!: BulkQuestionDto[];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) points?: number;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];

  @IsOptional() @IsEnum(QuestionPool) pool?: QuestionPool;
}

export class CreateAssessmentDto {
  @IsString() code!: string;
  @IsString() @MinLength(3) title!: string;
  @IsEnum(AssessmentKind) kind!: AssessmentKind;
  @Type(() => Number) @IsInt() @Min(1) @Max(100) passMark!: number;
  @IsOptional() @IsBoolean() requiresReview?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) maxAttempts?: number;
  /** Questions drawn per attempt. 0 serves the whole paper. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) drawCount?: number;
  @IsOptional() @IsBoolean() finalExam?: boolean;
  /** The module this paper closes. Blank for a final exam spanning the track. */
  @IsOptional() @IsUUID() moduleId?: string;
  /**
   * The badge earned by passing it.
   *
   * Setting this writes the badge's own criteria to "passed this assessment",
   * so there is one mechanism that awards badges rather than two that can
   * disagree. Clearing it leaves the badge alone: withdrawing a condition is
   * a badge decision, made on the badge screen.
   */
  @IsOptional() @IsUUID() awardsBadgeId?: string;
}

export class UpdateModuleDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() summary?: string;
  /** Module-level overview, distinct from any one lesson inside it. */
  @IsOptional() @IsString() overview?: string;
  /** What a candidate should be able to do after this module. */
  @IsOptional() @IsArray() @IsString({ each: true }) outcomes?: string[];
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) position?: number;
}

/**
 * Editing an assessment after it exists.
 *
 * Pass mark, attempt limit and whether it goes to an examiner were fixed at
 * creation, which meant a course could be published with the wrong gate and no
 * way to correct it short of rebuilding the track.
 */
export class UpdateAssessmentDto {
  @IsOptional() @IsString() @MinLength(3) title?: string;
  @IsOptional() @IsEnum(AssessmentKind) kind?: AssessmentKind;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  passMark?: number;
  @IsOptional() @IsBoolean() requiresReview?: boolean;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  maxAttempts?: number;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
  @IsOptional() @IsUUID() moduleId?: string;
  @IsOptional() @IsUUID() awardsBadgeId?: string;
  /** Questions drawn per attempt. 0 serves the whole paper. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(500) drawCount?: number;
  @IsOptional() @IsBoolean() finalExam?: boolean;
}

/** Hiding a thing from candidates without removing it from the syllabus. */
export class SetVisibilityDto {
  @IsBoolean() visible!: boolean;
}

export class UpdateLessonDto {
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsString() title?: string;
  @IsOptional() @IsString() bodyMd?: string;
  @IsOptional() @IsString() bodyHtml?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) estimatedMinutes?: number;

  /**
   * The lesson as structure. Validated in the service rather than by decorator
   * because the shape is nested and the useful errors are about the content --
   * a section with no heading, a block with neither body nor items.
   */
  @IsOptional() @IsObject() content?: Record<string, unknown>;
}

export class UpdateQuestionDto {
  @IsOptional() @IsString() @MinLength(5) stem?: string;
  @IsOptional() @IsArray() options?: unknown[];
  @IsOptional() @IsObject() answerKey?: Record<string, unknown>;
  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) points?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
  /** Moving a question between banks, without retyping it. */
  @IsOptional() @IsEnum(QuestionPool) pool?: QuestionPool;
  @IsOptional() @IsUUID() bankId?: string;
}

/** Authoring a choice question in one call, rather than four. */
export class AuthorQuestionDto {
  @IsString() assessmentId!: string;
  @IsString() @MinLength(10) stem!: string;

  @IsArray()
  @ArrayMinSize(2, { message: "A question needs at least two choices" })
  @ArrayMaxSize(8)
  @IsString({ each: true })
  choices!: string[];

  @Type(() => Number)
  @IsInt()
  @Min(0)
  correctIndex!: number;

  @IsOptional() @IsString() explanation?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) points?: number;
}

/**
 * Everything about where a track sits and what it promises.
 *
 * These were constants in code. They are editable because a course ladder is a
 * decision the institution makes and revises, and a decision that needs a
 * deploy to change is a decision nobody revises.
 */
export class UpdateProgrammeLadderDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(9) level?: number;
  @IsOptional() @IsString() levelLabel?: string;
  @IsOptional() @IsString() tagline?: string;
  /** Empty string clears the prerequisite, making the track a level-one entry. */
  @IsOptional() @IsString() prerequisiteCode?: string;
  @IsOptional() @IsString() devAccessFlag?: string;
  @IsOptional() @IsBoolean() visible?: boolean;
  @IsOptional() @IsArray() @IsString({ each: true }) cardStats?: string[];
  /**
   * The certification gate.
   *
   * Deliberately not `@IsString({ each: true })` any more: a step is an object
   * that names its requirement, and the legacy bare string is still accepted.
   * What a valid step is lives in `validateGateSteps`, in one place, rather
   * than half here and half there.
   */
  @IsOptional() @IsArray() gateSteps?: unknown[];
  /** Whether a candidate may put themselves on this course. */
  @IsOptional() @IsBoolean() selfEnrol?: boolean;
}

// -- Access restriction ------------------------------------------------------

/**
 * What opens a track.
 *
 * The sequence AIM-CP then AIM-CA then AIM-EL is one arrangement of these
 * rules, not the shape of the thing. An academy that admits a cohort by date,
 * or opens a track on a badge, writes that instead.
 */
export const UNLOCK_RULE_TYPES = [
  "CREDENTIAL_HELD",
  "BADGE_HELD",
  "COHORT_MEMBER",
  "DATE_WINDOW",
  "MANUAL_GRANT",
  "MODULES_COMPLETED",
] as const;

export class CreateUnlockRuleDto {
  @IsEnum(UNLOCK_RULE_TYPES as unknown as object)
  type!: (typeof UNLOCK_RULE_TYPES)[number];
  @IsOptional() @IsString() requiredProgrammeCode?: string;
  @IsOptional() @IsString() requiredBadgeCode?: string;
  @IsOptional() @IsUUID() requiredCohortId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  threshold?: number;
  @IsOptional() @IsDateString() opensAt?: string;
  @IsOptional() @IsDateString() closesAt?: string;
  /** Overrides the wording a candidate is shown. Blank uses the default. */
  @IsOptional() @IsString() @MaxLength(160) label?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class UpdateUnlockRuleDto {
  @IsOptional()
  @IsEnum(UNLOCK_RULE_TYPES as unknown as object)
  type?: (typeof UNLOCK_RULE_TYPES)[number];
  @IsOptional() @IsString() requiredProgrammeCode?: string;
  @IsOptional() @IsString() requiredBadgeCode?: string;
  @IsOptional() @IsString() requiredCohortId?: string;
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(99)
  threshold?: number;
  @IsOptional() @IsDateString() opensAt?: string;
  @IsOptional() @IsDateString() closesAt?: string;
  @IsOptional() @IsString() @MaxLength(160) label?: string;
  @IsOptional() @IsBoolean() active?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) position?: number;
}

export class SetUnlockPolicyDto {
  /** ALL: every rule must pass. ANY: one is enough. */
  @IsEnum({ ALL: "ALL", ANY: "ANY" }) policy!: "ALL" | "ANY";
}

/** Letting one named candidate past the rules. Never anonymous, never silent. */
export class CreateTrackGrantDto {
  @IsUUID() userId!: string;
  @IsString() @MinLength(8) @MaxLength(400) reason!: string;
  @IsOptional() @IsDateString() expiresAt?: string;
}

// -- Question banks ----------------------------------------------------------

export class CreateQuestionBankDto {
  @IsString() @MinLength(3) @MaxLength(120) title!: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  /** Which track this bank serves. Blank for a bank shared across tracks. */
  @IsOptional() @IsUUID() programmeId?: string;
  /** Which module. Blank for a bank that spans the track. */
  @IsOptional() @IsUUID() moduleId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class UpdateQuestionBankDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(400) description?: string;
  @IsOptional() @IsString() programmeId?: string;
  @IsOptional() @IsString() moduleId?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @IsString({ each: true })
  tags?: string[];
}

export class QuestionBankQuery {
  @IsOptional() @IsUUID() programmeId?: string;
  @IsOptional() @IsUUID() moduleId?: string;
  @IsOptional() @IsString() tag?: string;
  @IsOptional() @IsString() search?: string;
}

/** The paper, as a list. Sending it replaces what was there. */
export class AttachQuestionsDto {
  @IsArray()
  @ArrayMinSize(1, { message: "An assessment needs at least one question" })
  @ArrayMaxSize(200)
  @IsUUID("4", { each: true })
  questionIds!: string[];
}
