import { Injectable, Logger } from "@nestjs/common";
import { MAIL_KINDS, PASSWORD_RESET_TTL_MINUTES } from "@aim/contracts";
import { MailService } from "../mail/mail.service";
import { passwordResetEmail } from "../mail/templates";
import { ResetDelivery, type ResetDispatch } from "./password-reset-delivery";

/**
 * The implementation `password-reset-delivery.ts` was written to receive.
 *
 * That file says a reset link should be mailed by "whatever the institution
 * actually sends mail with", and until now nothing did. This binds the seam to
 * `MailService`, so the reset flow stops depending on somebody reading a
 * server log.
 *
 * Its one interesting behaviour is the fallback: when no provider has been
 * configured yet, it hands back to the logging implementation rather than
 * throwing, because an institution that has not set mail up should still be
 * able to reset a password the way it could yesterday. A half-installed
 * feature must not take a working one away.
 */
@Injectable()
export class MailResetDelivery extends ResetDelivery {
  private readonly logger = new Logger("PasswordReset");

  constructor(private readonly mail: MailService) {
    super();
  }

  async send(dispatch: ResetDispatch): Promise<void> {
    const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
    const link = `${base}/login/reset?token=${encodeURIComponent(dispatch.token)}`;

    if (!(await this.mail.ready())) {
      this.logFallback(dispatch, link);
      return;
    }

    const result = await this.mail.send(
      MAIL_KINDS.PASSWORD_RESET,
      { email: dispatch.email, name: dispatch.name },
      passwordResetEmail({
        name: dispatch.name,
        link,
        minutes: PASSWORD_RESET_TTL_MINUTES,
        issuedByName: dispatch.issuedByName,
      }),
    );

    // A provider that refused it leaves the person with no link at all, so the
    // operator fallback applies here too.
    if (!result.sent) this.logFallback(dispatch, link);
  }

  /**
   * The behaviour that shipped before mail existed, kept exactly.
   *
   * In production the token is never written to a log, because a reset token
   * in a log aggregator is a password reset anybody with log access can
   * perform. Outside production it is written, because otherwise nobody can
   * test the flow.
   */
  private logFallback(dispatch: ResetDispatch, link: string): void {
    if (process.env.NODE_ENV === "production") {
      this.logger.error(
        `A password reset was requested for ${dispatch.email} and mail could not be sent. ` +
          `The token has NOT been logged. Check the mail configuration.`,
      );
      return;
    }
    this.logger.warn(
      `Password reset for ${dispatch.email} (${dispatch.name}), valid until ` +
        `${dispatch.expiresAt.toISOString()}\n  ${link}`,
    );
  }
}
