import { Body, Controller, Delete, Get, Param, Put } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { CertificatesService } from "./certificates.service";
import { UpdateCertificateTemplateDto } from "./certificate-template.dto";

/**
 * Designing the certificate, which is authoring -- not issuing one, which is
 * the credential lifecycle and lives in its own module behind its own
 * permissions. The same separation the rest of this system keeps between
 * defining an award and granting it.
 *
 * `scope` is a track id, or the literal "default" for the house template every
 * track without one falls back to.
 */
@Controller("certificate-templates")
export class CertificatesController {
  constructor(private readonly certificates: CertificatesService) {}

  @Get()
  @RequirePermissions(P.CERTIFICATE_TEMPLATE_WRITE)
  list() {
    return this.certificates.list();
  }

  @Get(":scope")
  @RequirePermissions(P.CERTIFICATE_TEMPLATE_WRITE)
  get(@Param("scope") scope: string) {
    return this.certificates.get(scope);
  }

  @Put(":scope")
  @RequirePermissions(P.CERTIFICATE_TEMPLATE_WRITE)
  @Audit({
    action: "certificate.template.save",
    resourceType: "certificate_template",
  })
  save(
    @CurrentActor() actor: Actor,
    @Param("scope") scope: string,
    @Body() dto: UpdateCertificateTemplateDto,
  ) {
    return this.certificates.save(actor, scope, dto);
  }

  /** Drops a track's own design so it inherits the house one again. */
  @Delete(":scope")
  @RequirePermissions(P.CERTIFICATE_TEMPLATE_WRITE)
  @Audit({
    action: "certificate.template.reset",
    resourceType: "certificate_template",
  })
  remove(@Param("scope") scope: string) {
    return this.certificates.remove(scope);
  }
}
