import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from "class-validator";

/**
 * Saving the mail configuration.
 *
 * `secret` is optional and blank means "keep the stored one". An administrator
 * correcting the sender name should not have to find their API key again, and
 * a form that demands it is a form that gets the key copied somewhere
 * convenient.
 */
export class SaveMailConfigDto {
  @IsString() @MinLength(2) @MaxLength(40) provider!: string;
  @IsString() @MinLength(2) @MaxLength(120) fromName!: string;
  @IsEmail() @MaxLength(254) fromEmail!: string;

  /** Required only for providers that do not fix it. */
  @IsOptional() @IsString() @MaxLength(255) host?: string;
  @IsOptional() @IsInt() @Min(1) @Max(65535) port?: number;
  @IsOptional() @IsBoolean() secure?: boolean;
  @IsOptional() @IsString() @MaxLength(255) username?: string;

  /** Write-only. No endpoint ever returns this. */
  @IsOptional() @IsString() @MaxLength(2000) secret?: string;
}

/** Where to send the test. Defaults to the administrator asking for it. */
export class SendTestMailDto {
  @IsOptional() @IsEmail() to?: string;
}

/** Turning outbound mail on or off without discarding the credentials. */
export class SetMailEnabledDto {
  @IsBoolean() enabled!: boolean;
}

/** Which cohort a verified candidate joins, and whether that happens at all. */
export class SaveEnrolmentPolicyDto {
  /** Null clears it, which stops auto-enrolment and says so on screen. */
  @IsOptional() @IsString() intakeCohortId?: string | null;
  @IsOptional() @IsBoolean() autoEnrol?: boolean;
}
