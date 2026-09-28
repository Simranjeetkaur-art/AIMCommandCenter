import {
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from "class-validator";
import {
  MAX_EMAIL_LENGTH,
  MAX_NAME_LENGTH,
  MIN_NAME_LENGTH,
  MIN_PASSWORD_LENGTH,
} from "@aim/contracts";

export class LoginDto {
  @IsEmail()
  email!: string;

  /**
   * Only checked for presence here, not against the password policy.
   *
   * Applying the policy at sign-in would refuse an account whose password
   * predates the rule -- and worse, it would tell an attacker which guesses
   * are worth making. What a password must satisfy is decided when it is set.
   */
  @IsString()
  @MinLength(1)
  password!: string;
}

/** Which portal to look at. Not who to become: preview is not impersonation. */
export class StartPreviewDto {
  @IsIn(["STUDENT", "INSTRUCTOR", "MANAGER", "ADMIN"])
  role!: "STUDENT" | "INSTRUCTOR" | "MANAGER" | "ADMIN";
}

/**
 * Changing your own password.
 *
 * The current one is required even though the session already proves who you
 * are. A session is something a borrowed laptop has; the current password is
 * something only the person has, and it is the difference between an unlocked
 * screen being an annoyance and being an account takeover.
 */
export class ChangePasswordDto {
  @IsString()
  @MinLength(1, { message: "Enter your current password" })
  currentPassword!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  newPassword!: string;

  /**
   * Whether to end every other session.
   *
   * Defaults to ending them, which is the right default: the usual reason for
   * changing a password is a worry that somebody else has it, and leaving
   * their session open would make the change ceremonial.
   */
  @IsOptional()
  @IsIn(["KEEP", "END"])
  otherSessions?: "KEEP" | "END";
}

/** Asking for a reset link, from the sign-in screen, with no session. */
export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

/** Spending a reset link. */
export class ResetPasswordDto {
  @IsString()
  @MinLength(20, { message: "That is not a reset link" })
  token!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  newPassword!: string;
}

/**
 * Enrolling yourself.
 *
 * There is no `role` field, and its absence is the point: the server fixes the
 * role at STUDENT. A role taken from the request body would be an escalation
 * with a form in front of it, and no amount of validation makes that safe.
 *
 * The rules themselves live in `checkRegistration`, which the service calls
 * and the sign-up page calls. What is here is only enough to reject a
 * malformed body before it reaches either.
 */
export class RegisterDto {
  @IsString()
  @MinLength(MIN_NAME_LENGTH)
  @MaxLength(MAX_NAME_LENGTH)
  name!: string;

  @IsEmail()
  @MaxLength(MAX_EMAIL_LENGTH)
  email!: string;

  @IsString()
  @MinLength(MIN_PASSWORD_LENGTH, {
    message: `A password must be at least ${MIN_PASSWORD_LENGTH} characters`,
  })
  password!: string;
}

/** Spending a verification link. The token is the whole credential. */
export class VerifyEmailDto {
  @IsString()
  @MinLength(20, { message: "That is not a confirmation link" })
  token!: string;
}

/** Asking for another confirmation link. */
export class ResendVerificationDto {
  @IsEmail()
  email!: string;
}
