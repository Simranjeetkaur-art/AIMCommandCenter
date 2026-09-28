import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsEnum,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from "class-validator";
import { LastCommandStatus } from "@prisma/client";
import { AIM_DIMENSION_COUNT } from "@aim/contracts";

export class CreateAgentDto {
  @IsString() @MinLength(2) code!: string;
  @IsString() @MinLength(2) name!: string;
  /** The accountable human role. Every consequential agent has one. */
  @IsString() @MinLength(2) ownerRole!: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsString() @MinLength(5) purpose!: string;
  @IsOptional() @IsEnum(LastCommandStatus) lastCommand?: LastCommandStatus;
}

export class UpdateAgentDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() ownerRole?: string;
  @IsOptional() @IsString() ownerUserId?: string;
  @IsOptional() @IsString() purpose?: string;
  @IsOptional() @IsEnum(LastCommandStatus) lastCommand?: LastCommandStatus;
}

export class RetireAgentDto {
  @IsString()
  @MinLength(20, {
    message: "Retiring an authority record requires a stated reason",
  })
  reason!: string;
}

/**
 * Destroying an authority record and the diagnostics bound to it.
 *
 * A longer minimum than retiring, because this one cannot be undone: the
 * reason is the only account of it that will exist outside the audit log.
 */
export class DeleteAgentDto {
  @IsString()
  @MinLength(30, {
    message:
      "Deleting an agent and its diagnostics cannot be undone. State why, in a sentence.",
  })
  reason!: string;
}

export class CreateDiagnosticDto {
  @IsString() @MinLength(2) agentName!: string;
  @IsString() @MinLength(2) agentOwner!: string;
  @IsString() @MinLength(5) agentPurpose!: string;

  /**
   * Eleven scores, 1-5, in AIM_DIMENSIONS order.
   *
   * There is deliberately no `aai` field here. The index is computed on the
   * server from these scores; a caller that could post its own index could
   * post any number it liked and have the registry believe it.
   */
  @IsArray()
  @ArrayMinSize(AIM_DIMENSION_COUNT)
  @ArrayMaxSize(AIM_DIMENSION_COUNT)
  @Type(() => Number)
  @IsInt({ each: true })
  @Min(1, { each: true })
  @Max(5, { each: true })
  scores!: number[];

  /** Binding to a registry agent updates that agent's recorded AAI. */
  @IsOptional() @IsString() agentId?: string;
}

export class CreatePrescriptionDto {
  @IsString() diagnosticId!: string;

  /** Overrides for the eight envelope boundaries, keyed P/D/X/F/T/L/S/Q. */
  @IsOptional() envelope?: Record<string, string>;
}
