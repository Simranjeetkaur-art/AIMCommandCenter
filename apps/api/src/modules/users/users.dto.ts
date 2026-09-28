import {
  IsBooleanString,
  IsEmail,
  IsEnum,
  IsISO8601,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
  ValidateIf,
} from "class-validator";
import { Role } from "@prisma/client";
import { MIN_PASSWORD_LENGTH } from "@aim/contracts";
import { PageQuery } from "../../common/util/pagination";

export class CreateUserDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsEnum(Role)
  role!: Role;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `Temporary passwords must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  temporaryPassword!: string;
}

export class AssignRoleDto {
  @IsEnum(Role)
  role!: Role;

  /** Recorded on the audit event. A role change without a stated why is not one. */
  @IsString()
  @MinLength(10)
  reason!: string;
}

export class SuspendUserDto {
  @IsIn(["SUSPEND", "REINSTATE"])
  action!: "SUSPEND" | "REINSTATE";

  @IsString()
  @MinLength(10)
  reason!: string;

  /**
   * When the suspension lifts by itself. Omit for indefinite.
   *
   * A suspension that has to be remembered and reversed by hand is one that
   * quietly becomes permanent.
   */
  @IsOptional()
  @IsISO8601()
  until?: string;
}

/** Correcting a record. Deliberately separate from changing what someone may do. */
export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(2) name?: string;
  @IsOptional() @IsEmail() email?: string;

  @IsString()
  @MinLength(10, { message: "Say why the record is being corrected" })
  reason!: string;
}

export class ArchiveUserDto {
  @IsIn(["ARCHIVE", "RESTORE"])
  action!: "ARCHIVE" | "RESTORE";

  @IsString()
  @MinLength(10, { message: "Archiving an account requires a stated reason" })
  reason!: string;
}

export class ListUsersQuery extends PageQuery {
  @IsOptional() @IsEnum(Role) role?: Role;
  @IsOptional() @IsString() search?: string;
  @IsOptional() @IsIn(["ACTIVE", "SUSPENDED"]) status?: "ACTIVE" | "SUSPENDED";
  /** Archived accounts are hidden unless asked for by name. */
  @IsOptional() @IsBooleanString() includeArchived?: string;
  @IsOptional() @IsIn(["name", "email", "role", "createdAt"]) sort?: string;
  @IsOptional() @IsIn(["asc", "desc"]) direction?: "asc" | "desc";
}

/**
 * Resetting somebody else's password.
 *
 * Two ways, because the two situations are genuinely different and one control
 * for both would be wrong for each.
 *
 *  - `LINK` issues a single-use link, valid for half an hour, returned to the
 *    administrator to hand over. Nothing is changed about the account's
 *    current password until the person spends it, so an administrator who
 *    reset the wrong account has not locked anybody out.
 *  - `TEMPORARY_PASSWORD` sets one the administrator has chosen and holds the
 *    account at the password screen until it is replaced. For the case where
 *    somebody is standing there and has no working mailbox.
 *
 * Both end every live session on the account. A reset whose point is that
 * somebody else may have the password would be pointless otherwise.
 */
export class ResetUserPasswordDto {
  @IsIn(["LINK", "TEMPORARY_PASSWORD"])
  mode!: "LINK" | "TEMPORARY_PASSWORD";

  /** Required for TEMPORARY_PASSWORD, refused for LINK. */
  @ValidateIf((dto: ResetUserPasswordDto) => dto.mode === "TEMPORARY_PASSWORD")
  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A temporary password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  temporaryPassword?: string;

  /** On the audit event. Resetting somebody's password without a stated why is not one. */
  @IsString()
  @MinLength(10, { message: "Say why this account is being reset" })
  reason!: string;
}

/** Ending somebody else's sessions: one named one, or all of them. */
export class RevokeUserSessionsDto {
  /** Omit to end every live session on the account. */
  @IsOptional()
  @IsString()
  sessionId?: string;

  @IsString()
  @MinLength(10, { message: "Say why the session is being ended" })
  reason!: string;
}

/** Lifting an automatic lockout before it lapses by itself. */
export class ConfirmEmailDto {
  @IsString()
  @MinLength(10, { message: "Say why the address is being confirmed by hand" })
  reason!: string;
}

export class ClearLockoutDto {
  @IsString()
  @MinLength(10, { message: "Say why the lock is being lifted" })
  reason!: string;
}
