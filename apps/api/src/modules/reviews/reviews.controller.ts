import { Body, Controller, Get, Param, Post } from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import {
  RequireAnyPermission,
  RequirePermissions,
} from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { ReviewsService } from "./reviews.service";
import {
  ApproveDto,
  GradeDto,
  LearnerNoteDto,
  ReassignDto,
  ReturnDto,
} from "../submissions/submissions.dto";

@Controller()
export class ReviewsController {
  constructor(private readonly reviews: ReviewsService) {}

  @Get("review-queue")
  @RequirePermissions(P.REVIEW_QUEUE_READ)
  queue(@CurrentActor() actor: Actor) {
    return this.reviews.queue(actor);
  }

  @Post("submissions/:id/claim")
  @RequirePermissions(P.REVIEW_CLAIM)
  @Audit({ action: "review.claim", resourceType: "submission" })
  claim(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.reviews.claim(actor, id);
  }

  @Post("submissions/:id/approve")
  @RequirePermissions(P.REVIEW_APPROVE)
  @Audit({ action: "review.approve", resourceType: "submission" })
  approve(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ApproveDto,
  ) {
    return this.reviews.approve(actor, id, dto);
  }

  @Post("submissions/:id/return")
  @RequirePermissions(P.REVIEW_RETURN)
  @Audit({ action: "review.return", resourceType: "submission" })
  returnForRevision(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ReturnDto,
  ) {
    return this.reviews.returnForRevision(actor, id, dto);
  }

  @Post("submissions/:id/grade")
  @RequirePermissions(P.REVIEW_GRADE)
  @Audit({ action: "review.grade", resourceType: "submission" })
  grade(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: GradeDto,
  ) {
    return this.reviews.grade(actor, id, dto);
  }

  /**
   * Reassignment sits on review.reassign, which the manager holds and the
   * examiner does not. It is the one review-shaped thing a manager may do.
   */
  @Post("submissions/:id/reassign")
  @RequirePermissions(P.REVIEW_REASSIGN)
  @Audit({ action: "review.reassign", resourceType: "submission" })
  reassign(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: ReassignDto,
  ) {
    return this.reviews.reassign(actor, id, dto);
  }

  @Get("learners/:id/notes")
  @RequireAnyPermission(P.LEARNER_NOTE_READ)
  notes(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.reviews.learnerNotes(actor, id);
  }

  @Post("learners/:id/notes")
  @RequirePermissions(P.LEARNER_NOTE_CREATE)
  @Audit({ action: "learner.note.create", resourceType: "learner_note" })
  addNote(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: LearnerNoteDto,
  ) {
    return this.reviews.addLearnerNote(actor, id, dto);
  }
}
