import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { CohortsService } from "./cohorts.service";
import {
  ArchiveCohortDto,
  AssignCohortDto,
  AssignInstructorDto,
  CreateCohortDto,
  EnrollDto,
  EnrollManyDto,
  UpdateCohortDto,
  WithdrawDto,
} from "./cohorts.dto";

@Controller("cohorts")
export class CohortsController {
  constructor(private readonly cohorts: CohortsService) {}

  @Get()
  @RequirePermissions(P.COHORT_READ)
  list(@Query("includeArchived") includeArchived?: string) {
    return this.cohorts.list(includeArchived === "true");
  }

  @Get(":id")
  @RequirePermissions(P.COHORT_READ)
  detail(@Param("id") id: string) {
    return this.cohorts.detail(id);
  }

  @Post()
  @RequirePermissions(P.COHORT_WRITE)
  @Audit({ action: "cohort.create", resourceType: "cohort" })
  create(@Body() dto: CreateCohortDto) {
    return this.cohorts.create(dto);
  }

  @Patch(":id")
  @RequirePermissions(P.COHORT_WRITE)
  @Audit({ action: "cohort.update", resourceType: "cohort" })
  update(@Param("id") id: string, @Body() dto: UpdateCohortDto) {
    return this.cohorts.update(id, dto);
  }

  /** Closing a cohort. Archived, never deleted. */
  @Post(":id/archive")
  @RequirePermissions(P.COHORT_ARCHIVE)
  @Audit({ action: "cohort.archive", resourceType: "cohort" })
  archive(@Param("id") id: string, @Body() dto: ArchiveCohortDto) {
    return this.cohorts.setArchived(id, dto);
  }

  @Post(":id/enrollments")
  @RequirePermissions(P.ENROLLMENT_WRITE)
  @Audit({ action: "enrollment.create", resourceType: "enrollment" })
  enroll(@Param("id") id: string, @Body() dto: EnrollDto) {
    return this.cohorts.enroll(id, dto);
  }

  /** Several candidates at once. Each refusal is named rather than swallowed. */
  @Post(":id/enrollments/bulk")
  @RequirePermissions(P.ENROLLMENT_WRITE)
  @Audit({ action: "enrollment.create.bulk", resourceType: "enrollment" })
  enrollMany(@Param("id") id: string, @Body() dto: EnrollManyDto) {
    return this.cohorts.enrollMany(id, dto.userIds);
  }

  /**
   * A candidate joining a course themselves, where the course allows it.
   *
   * Deliberately not behind enrollment.write: that permission is "may place
   * other people", which a candidate must never hold. What protects this
   * route is the course's own self-enrolment setting, checked server side,
   * plus the actor only ever being able to act on themselves.
   */
  @Post("self-enrolment/:cohortId")
  @RequirePermissions(P.PROGRESS_WRITE_SELF)
  @Audit({ action: "enrollment.self", resourceType: "enrollment" })
  selfEnrol(@CurrentActor() actor: Actor, @Param("cohortId") cohortId: string) {
    return this.cohorts.selfEnrol(actor, cohortId);
  }

  /** Courses this candidate may join unaided. */
  @Get("self-enrolment/open")
  @RequirePermissions(P.PROGRESS_WRITE_SELF)
  openToSelfEnrol(@CurrentActor() actor: Actor) {
    return this.cohorts.openToSelfEnrol(actor.id);
  }

  @Post(":id/withdrawals")
  @RequirePermissions(P.ENROLLMENT_WRITE)
  @Audit({ action: "enrollment.withdraw", resourceType: "enrollment" })
  withdraw(@Param("id") id: string, @Body() dto: WithdrawDto) {
    return this.cohorts.withdraw(id, dto);
  }

  @Post("assignments")
  @RequirePermissions(P.INSTRUCTOR_ASSIGN)
  @Audit({ action: "instructor.assign", resourceType: "instructor_assignment" })
  assign(@CurrentActor() actor: Actor, @Body() dto: AssignInstructorDto) {
    return this.cohorts.assignInstructor(actor, dto);
  }

  @Post(":id/assignments")
  @RequirePermissions(P.INSTRUCTOR_ASSIGN)
  @Audit({ action: "instructor.assign.cohort", resourceType: "cohort" })
  assignCohort(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: AssignCohortDto,
  ) {
    return this.cohorts.assignCohort(actor, id, dto);
  }

  @Delete("assignments/:instructorId/:learnerId")
  @RequirePermissions(P.INSTRUCTOR_ASSIGN)
  @Audit({
    action: "instructor.unassign",
    resourceType: "instructor_assignment",
  })
  unassign(
    @Param("instructorId") instructorId: string,
    @Param("learnerId") learnerId: string,
  ) {
    return this.cohorts.unassign(instructorId, learnerId);
  }
}
