import { Module } from "@nestjs/common";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { ResetDelivery } from "./password-reset-delivery";
import { LoginThrottle } from "./login-throttle";
import { MailResetDelivery } from "./email-verification-delivery";
import { MailModule } from "../mail/mail.module";

/**
 * `ResetDelivery` is bound here and nowhere else.
 *
 * It is the one seam an institution has to close to put this system into real
 * use: swap `LoggingResetDelivery` for an implementation that sends mail, and
 * every other part of the reset flow -- issuing, hashing, expiring, spending
 * -- is unchanged, because none of it knows how the link travels.
 *
 * `AuthService` is exported because UsersService issues a reset on somebody
 * else's behalf, and there must not be a second place that knows how to make
 * one of these tokens.
 */
@Module({
  imports: [MailModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    LoginThrottle,
    // The seam described above, now closed. MailResetDelivery falls back to
    // LoggingResetDelivery behaviour when no provider is configured, so an
    // institution without mail keeps exactly what it had.
    { provide: ResetDelivery, useClass: MailResetDelivery },
  ],
  exports: [AuthService],
})
export class AuthModule {}
