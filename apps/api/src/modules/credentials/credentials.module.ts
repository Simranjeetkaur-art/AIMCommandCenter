import { Module } from "@nestjs/common";
import { CertificatesModule } from "../certificates/certificates.module";
import {
  CredentialsController,
  VerifyController,
} from "./credentials.controller";
import { CredentialsService } from "./credentials.service";

@Module({
  imports: [CertificatesModule],
  controllers: [CredentialsController, VerifyController],
  providers: [CredentialsService],
  exports: [CredentialsService],
})
export class CredentialsModule {}
