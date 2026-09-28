import { Module } from "@nestjs/common";
import { CertificatesController } from "./certificates.controller";
import { CertificatesService } from "./certificates.service";
import { CertificationController } from "./certification.controller";
import { CertificationService } from "./certification.service";

/**
 * Designing the certificate, and what a candidate must clear to be given one.
 *
 * `CertificatesService` is exported because issuing a credential has to render
 * the design this module owns -- the credentials module asks for the resolved
 * template rather than reading the table itself, so there is one place that
 * decides what a track's certificate looks like.
 */
@Module({
  controllers: [CertificatesController, CertificationController],
  providers: [CertificatesService, CertificationService],
  exports: [CertificatesService],
})
export class CertificatesModule {}
