import { Type } from "class-transformer";
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  MinLength,
  ValidateNested,
} from "class-validator";

export class GateOverrideDto {
  @IsString() gate!: string;

  /** A waiver carries its own reason, separate from the issue reason. */
  @IsString()
  @MinLength(20, {
    message: "A waived requirement must say why, in its own words",
  })
  reason!: string;
}

export class IssueCredentialDto {
  @IsString() userId!: string;
  @IsString() programmeVersionId!: string;

  /**
   * Mandatory, on every issue including an automatic-looking one. A credential
   * whose record cannot say why it exists is not evidence of anything.
   */
  @IsString()
  @MinLength(20, { message: "Issuing a credential requires a stated reason" })
  reason!: string;

  /**
   * Requirements being waived. Anything listed here is written onto the
   * credential and shows on the certificate; a gate cannot be bypassed
   * silently, because bypassing it means putting it in this array.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(10)
  @ValidateNested({ each: true })
  @Type(() => GateOverrideDto)
  gateOverrides?: GateOverrideDto[];
}

export class CredentialActionDto {
  @IsString()
  @MinLength(20, {
    message: "This action changes a person's standing; state why",
  })
  reason!: string;
}
