import { Injectable, Logger } from "@nestjs/common";

export interface ResetDispatch {
  email: string;
  name: string;
  /** The raw token. It exists in memory for the length of this call and nowhere else. */
  token: string;
  expiresAt: Date;
  /** Null when the person asked for it themselves at the sign-in screen. */
  issuedByName: string | null;
}

/**
 * How a reset link reaches the person it belongs to.
 *
 * This system has no mail transport, and adding one was not in scope for
 * making the auth flows work. Rather than pretend otherwise, the delivery is a
 * port with one obvious seam: implement this interface against whatever the
 * institution actually sends mail with, bind it in `AuthModule`, and nothing
 * else in the flow changes.
 *
 * What matters is that the *rest* of the feature does not depend on which
 * implementation is bound. The token is issued, hashed, stored, expired and
 * spent identically whether it is mailed, printed, or read out over the phone
 * by an administrator -- so the security of the flow is not waiting on the
 * mail server to arrive.
 */
export abstract class ResetDelivery {
  abstract send(dispatch: ResetDispatch): Promise<void>;
}

/**
 * The implementation that ships.
 *
 * It writes the link to the server log, which is honest about what it is: a
 * development affordance and an operator's fallback, not a mail system. Two
 * things it deliberately does *not* do:
 *
 *  - return the token to the caller of the public endpoint. That endpoint
 *    answers the same way for an address that exists and one that does not,
 *    and handing back a token would undo that in one line.
 *  - log the token in production. Below, that is refused outright rather than
 *    quietly done, because a reset token in a log aggregator is a password
 *    reset anybody with log access can perform.
 *
 * The administrator-initiated path does not go through here at all: there the
 * link is returned to the administrator on screen, because they asked for it
 * on behalf of somebody standing in front of them and the audit log records
 * that they did.
 */
@Injectable()
export class LoggingResetDelivery extends ResetDelivery {
  private readonly logger = new Logger("PasswordReset");

  async send(dispatch: ResetDispatch): Promise<void> {
    const base = process.env.WEB_BASE_URL ?? "http://localhost:3000";
    const link = `${base}/login/reset?token=${encodeURIComponent(dispatch.token)}`;

    if (process.env.NODE_ENV === "production") {
      this.logger.error(
        `A password reset was requested for ${dispatch.email} and there is no mail transport bound. ` +
          `The token has NOT been logged. Bind a ResetDelivery implementation in AuthModule.`,
      );
      return;
    }

    this.logger.warn(
      `Password reset for ${dispatch.email} (${dispatch.name}), valid until ` +
        `${dispatch.expiresAt.toISOString()}${
          dispatch.issuedByName ? `, issued by ${dispatch.issuedByName}` : ""
        }\n  ${link}`,
    );
  }
}
