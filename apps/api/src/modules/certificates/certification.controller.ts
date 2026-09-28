import { Controller, Get } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import type { Actor } from "../../common/auth/actor";
import { CertificationService } from "./certification.service";

/**
 * The candidate's own standing against the five requirements.
 *
 * Self-scoped by construction -- the actor is the subject, and there is no
 * parameter that could name anyone else, which is why this needs only
 * credential.read.self and not the examiner's or registrar's permissions.
 */
@Controller("certification")
export class CertificationController {
  constructor(private readonly certification: CertificationService) {}

  @Get("standing")
  @RequirePermissions(P.CREDENTIAL_READ_SELF)
  standing(@CurrentActor() actor: Actor) {
    return this.certification.standing(actor);
  }
}
