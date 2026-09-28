import { Injectable, Logger } from "@nestjs/common";
import { createTransport, type Transporter } from "nodemailer";
import { MAIL_KINDS, type MailKind } from "@aim/contracts";
import { PrismaService } from "../../common/prisma/prisma.service";
import { openSecret } from "../../common/crypto/secret-box";
import type { Composed } from "./templates";

export interface Recipient {
  email: string;
  name: string;
}

/**
 * Sending mail, when the institution has said how.
 *
 * Two properties this class is built around:
 *
 *  1. **A send never fails the thing that caused it.** Somebody verifying
 *     their address is enrolled whether or not the welcome message goes out;
 *     a manager is notified, or is not, and either way the candidate is on the
 *     roll. Mail providers are the least reliable dependency here and the
 *     least important, so every failure is caught, logged, and reported in the
 *     return value rather than thrown. The one exception is the test message,
 *     where the whole point is to find out what went wrong -- `sendOrThrow`.
 *
 *  2. **No configuration means no send, not a crash.** Before an administrator
 *     has filled the form in, `send` returns `{ sent: false, reason }` and the
 *     caller carries on. This system worked without mail before and must keep
 *     working without it.
 *
 * The transport is rebuilt when the configuration row changes, keyed on
 * `updatedAt`, so saving new credentials takes effect without a restart.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger("Mail");
  private cached: { key: string; transport: Transporter } | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Is mail configured, tested and switched on? */
  async ready(): Promise<boolean> {
    const config = await this.prisma.mailConfig.findUnique({
      where: { id: "default" },
      select: { enabled: true, secretCipher: true },
    });
    return Boolean(config?.enabled && config.secretCipher);
  }

  /**
   * Sends, and tells you whether it went.
   *
   * Never throws. See the class note: the caller's work has already happened
   * and must not be undone because a mail server was unreachable.
   */
  async send(
    kind: MailKind,
    to: Recipient,
    message: Composed,
  ): Promise<{ sent: boolean; reason?: string }> {
    try {
      await this.sendOrThrow(kind, to, message);
      return { sent: true };
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      // Logged with the kind and the recipient, and without the body: a log
      // aggregator is not a place to reproduce a verification link.
      this.logger.error(`${kind} to ${to.email} failed: ${reason}`);
      return { sent: false, reason };
    }
  }

  /** Sends and lets the failure through. Used by the test button. */
  async sendOrThrow(
    kind: MailKind,
    to: Recipient,
    message: Composed,
  ): Promise<void> {
    const config = await this.prisma.mailConfig.findUnique({
      where: { id: "default" },
    });

    if (!config || !config.secretCipher) {
      throw new Error("No mail provider is configured.");
    }
    // The test message is how a configuration becomes enabled in the first
    // place, so it is the one kind allowed to send while disabled.
    if (!config.enabled && kind !== MAIL_KINDS.TEST) {
      throw new Error("Outbound mail is configured but switched off.");
    }

    const transport = this.transportFor(config);

    await transport.sendMail({
      from: { name: config.fromName, address: config.fromEmail },
      to: { name: to.name, address: to.email },
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    this.logger.log(`${kind} sent to ${to.email}`);
  }

  /**
   * The transport for a configuration, rebuilt only when it changes.
   *
   * Keyed on `updatedAt` rather than held forever: an administrator who
   * rotates a leaked key expects the next message to use the new one, and a
   * transport cached for the lifetime of the process would keep presenting the
   * old credential until somebody restarted the server.
   */
  private transportFor(config: {
    host: string;
    port: number;
    secure: boolean;
    username: string;
    secretCipher: string | null;
    updatedAt: Date;
  }): Transporter {
    const key = config.updatedAt.toISOString();
    if (this.cached?.key === key) return this.cached.transport;

    const transport = createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: {
        user: config.username,
        pass: openSecret(config.secretCipher as string),
      },
      // A send that hangs must not hold a request open indefinitely; the
      // caller is usually somebody waiting on a page.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });

    this.cached = { key, transport };
    return transport;
  }

  /** Drops the cached transport. Called when the configuration is written. */
  forget(): void {
    this.cached = null;
  }
}
