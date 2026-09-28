import { Module } from "@nestjs/common";
import { UsersController } from "./users.controller";
import { UsersService } from "./users.service";
import { AuthModule } from "../auth/auth.module";

/**
 * `AuthModule` is imported for one thing: issuing a reset token.
 *
 * An administrator resetting somebody's password and that person asking for a
 * link themselves have to produce the same credential, with the same lifetime
 * and the same single-use rule. Reaching across for it keeps that true; a
 * second implementation here would be the one that quietly drifted.
 */
@Module({
  imports: [AuthModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
