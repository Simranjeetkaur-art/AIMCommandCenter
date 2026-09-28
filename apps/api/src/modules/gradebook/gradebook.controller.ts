import { Controller, Get, Param, Query } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { GradebookService } from "./gradebook.service";

/**
 * Marks, for the person who earned them and for the staff accountable for
 * them. Two views of one computation, never two computations.
 */
@Controller("gradebook")
export class GradebookController {
  constructor(private readonly gradebook: GradebookService) {}

  /** The caller's own marks. No learner id, and no way to supply one. */
  @Get("mine")
  @RequirePermissions(P.PROGRESS_READ_SELF)
  mine(@CurrentActor() actor: Actor) {
    return this.gradebook.mine(actor);
  }

  /** The tracks this actor can open a gradebook for. */
  @Get("tracks")
  @RequireAnyPermission(P.PROGRESS_READ_ASSIGNED, P.PROGRESS_READ_ALL)
  tracks(@CurrentActor() actor: Actor) {
    return this.gradebook.tracks(actor);
  }

  /**
   * Every learner on one track version.
   *
   * Audited as a read: a gradebook is the whole cohort's standing in one
   * place, and who looked at it is worth recording.
   */
  @Get("versions/:id")
  @RequireAnyPermission(P.PROGRESS_READ_ASSIGNED, P.PROGRESS_READ_ALL)
  @Audit({
    action: "gradebook.read",
    resourceType: "programme_version",
    recordReads: true,
  })
  forVersion(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.gradebook.forVersion(actor, id);
  }
}
