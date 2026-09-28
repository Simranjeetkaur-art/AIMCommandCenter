import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
} from "@nestjs/common";
import { PERMISSIONS as P } from "@aim/contracts";
import { RequirePermissions } from "../../common/auth/permissions.decorator";
import { CurrentActor } from "../../common/auth/current-user.decorator";
import { Audit } from "../../common/audit/audit.decorator";
import type { Actor } from "../../common/auth/actor";
import { AcademyService } from "./academy.service";
import { RestrictionsService } from "./restrictions.service";
import { QuestionBanksService } from "./question-banks.service";
import {
  AuthorQuestionDto,
  CreateAssessmentDto,
  CreateLessonDto,
  CreateModuleDto,
  CreateProgrammeDto,
  CreateQuestionDto,
  CreateQuestionsBulkDto,
  CreateVersionDto,
  PublishVersionDto,
  UpdateLessonDto,
  UpdateModuleDto,
  UpdateProgrammeDto,
  SetVisibilityDto,
  UpdateAssessmentDto,
  UpdateProgrammeLadderDto,
  CreateUnlockRuleDto,
  UpdateUnlockRuleDto,
  SetUnlockPolicyDto,
  CreateTrackGrantDto,
  CreateQuestionBankDto,
  UpdateQuestionBankDto,
  QuestionBankQuery,
  AttachQuestionsDto,
  UpdateQuestionDto,
} from "./academy.dto";

@Controller("academy")
export class AcademyController {
  constructor(
    private readonly academy: AcademyService,
    private readonly restrictions: RestrictionsService,
    private readonly banks: QuestionBanksService,
  ) {}

  // -- Read paths, open to every role that can see a programme --------------

  @Get("programmes")
  @RequirePermissions(P.PROGRAMME_READ)
  listProgrammes(@CurrentActor() actor: Actor) {
    return this.academy.listProgrammes(actor);
  }

  @Get("versions/:id/outline")
  @RequirePermissions(P.PROGRAMME_READ)
  outline(@Param("id") id: string) {
    return this.academy.versionOutline(id);
  }

  /** One track with the caller's own progress. The Academy path screen. */
  @Get("tracks/:code")
  @RequirePermissions(P.PROGRAMME_READ)
  track(@CurrentActor() actor: Actor, @Param("code") code: string) {
    return this.academy.track(actor, code.toUpperCase());
  }

  @Get("lessons/:id")
  @RequirePermissions(P.LESSON_READ)
  lesson(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.academy.lesson(actor, id);
  }

  // -- Authoring, manager and administration --------------------------------

  @Post("programmes")
  @RequirePermissions(P.PROGRAMME_CREATE)
  @Audit({ action: "programme.create", resourceType: "programme" })
  createProgramme(@Body() dto: CreateProgrammeDto) {
    return this.academy.createProgramme(dto);
  }

  @Patch("programmes/:id")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  @Audit({ action: "programme.update", resourceType: "programme" })
  updateProgramme(@Param("id") id: string, @Body() dto: UpdateProgrammeDto) {
    return this.academy.updateProgramme(id, dto);
  }

  /**
   * Destroying a track. Refuses on anything with a published version, a
   * cohort or a credential against it -- those archive instead.
   */
  @Delete("programmes/:id")
  @RequirePermissions(P.CONTENT_DELETE, P.PROGRAMME_CREATE)
  @Audit({ action: "programme.delete", resourceType: "programme" })
  deleteProgramme(@Param("id") id: string) {
    return this.academy.deleteProgramme(id);
  }

  @Post("programmes/:id/versions")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  @Audit({
    action: "programme.version.create",
    resourceType: "programme_version",
  })
  createVersion(@Param("id") id: string, @Body() dto: CreateVersionDto) {
    return this.academy.createVersion(id, dto);
  }

  /** Discarding a draft nobody is on. A published version never goes. */
  @Delete("versions/:id")
  @RequirePermissions(P.CONTENT_DELETE, P.PROGRAMME_UPDATE)
  @Audit({
    action: "programme.version.delete",
    resourceType: "programme_version",
  })
  deleteVersion(@Param("id") id: string) {
    return this.academy.deleteVersion(id);
  }

  @Post("versions/:id/modules")
  @RequirePermissions(P.MODULE_WRITE)
  @Audit({ action: "module.create", resourceType: "module" })
  createModule(@Param("id") id: string, @Body() dto: CreateModuleDto) {
    return this.academy.createModule(id, dto);
  }

  @Post("modules/:id/lessons")
  @RequirePermissions(P.LESSON_WRITE)
  @Audit({ action: "lesson.create", resourceType: "lesson" })
  createLesson(@Param("id") id: string, @Body() dto: CreateLessonDto) {
    return this.academy.createLesson(id, dto);
  }

  @Post("versions/:id/assessments")
  @RequirePermissions(P.ASSESSMENT_WRITE)
  @Audit({ action: "assessment.create", resourceType: "assessment" })
  createAssessment(@Param("id") id: string, @Body() dto: CreateAssessmentDto) {
    return this.academy.createAssessment(id, dto);
  }

  // -- Question banks. The answer key lives behind these two permissions. ----

  @Get("question-banks/:id/questions")
  @RequirePermissions(P.QUESTION_BANK_READ, P.ANSWER_KEY_READ)
  listQuestions(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.academy.listQuestions(actor, id);
  }

  @Post("questions")
  @RequirePermissions(P.QUESTION_WRITE)
  @Audit({ action: "question.create", resourceType: "question" })
  createQuestion(@Body() dto: CreateQuestionDto) {
    return this.academy.createQuestion(dto);
  }

  /** Many questions into one bank in a single write. All land, or none do. */
  @Post("questions/bulk")
  @RequirePermissions(P.QUESTION_WRITE)
  @Audit({ action: "question.create.bulk", resourceType: "question" })
  createQuestionsBulk(@Body() dto: CreateQuestionsBulkDto) {
    return this.academy.createQuestionsBulk(dto);
  }

  @Post("assessments/:id/questions")
  @RequirePermissions(P.ASSESSMENT_WRITE)
  @Audit({ action: "assessment.question.attach", resourceType: "assessment" })
  attachQuestion(
    @Param("id") id: string,
    @Body("questionId") questionId: string,
    @Body("position") position: number,
  ) {
    return this.academy.attachQuestion(id, questionId, Number(position));
  }

  // -- Authoring: editing what already exists -------------------------------

  /** The authoring view: everything in a version, with question counts. */
  @Get("versions/:id/authoring")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  authoring(@Param("id") id: string) {
    return this.academy.versionForAuthoring(id);
  }

  @Patch("modules/:id")
  @RequirePermissions(P.MODULE_WRITE)
  @Audit({ action: "module.update", resourceType: "module" })
  updateModule(@Param("id") id: string, @Body() dto: UpdateModuleDto) {
    return this.academy.updateModule(id, dto);
  }

  @Delete("modules/:id")
  @RequirePermissions(P.CONTENT_DELETE)
  @Audit({ action: "module.delete", resourceType: "module" })
  deleteModule(@Param("id") id: string) {
    return this.academy.deleteModule(id);
  }

  @Get("lessons/:id/authoring")
  @RequirePermissions(P.LESSON_WRITE)
  lessonForAuthoring(@Param("id") id: string) {
    return this.academy.lessonForAuthoring(id);
  }

  @Patch("lessons/:id")
  @RequirePermissions(P.LESSON_WRITE)
  @Audit({ action: "lesson.update", resourceType: "lesson" })
  updateLesson(@Param("id") id: string, @Body() dto: UpdateLessonDto) {
    return this.academy.updateLesson(id, dto);
  }

  /** Authors a choice question and attaches it in one call. */
  @Post("questions/author")
  @RequirePermissions(P.QUESTION_WRITE)
  @Audit({ action: "question.author", resourceType: "question" })
  authorQuestion(@CurrentActor() actor: Actor, @Body() dto: AuthorQuestionDto) {
    return this.academy.authorQuestion(actor, dto);
  }

  @Patch("assessments/:id")
  @RequirePermissions(P.ASSESSMENT_WRITE)
  @Audit({ action: "assessment.update", resourceType: "assessment" })
  updateAssessment(@Param("id") id: string, @Body() dto: UpdateAssessmentDto) {
    return this.academy.updateAssessment(id, dto);
  }

  @Delete("assessments/:id")
  @RequirePermissions(P.CONTENT_DELETE)
  @Audit({ action: "assessment.delete", resourceType: "assessment" })
  deleteAssessment(@Param("id") id: string) {
    return this.academy.deleteAssessment(id);
  }

  @Delete("lessons/:id")
  @RequirePermissions(P.CONTENT_DELETE)
  @Audit({ action: "lesson.delete", resourceType: "lesson" })
  deleteLesson(@Param("id") id: string) {
    return this.academy.deleteLesson(id);
  }

  /**
   * Hiding, which works on a published version where editing does not.
   *
   * One decision, four resources: is this thing offered to candidates right
   * now. Spelled out per resource because Express 5 no longer accepts a
   * pattern in a route parameter, and four plain paths read better anyway.
   */
  @Patch("programmes/:id/visibility")
  @RequirePermissions(P.CONTENT_VISIBILITY)
  @Audit({ action: "programme.visibility", resourceType: "programme" })
  setProgrammeVisibility(
    @Param("id") id: string,
    @Body() dto: SetVisibilityDto,
  ) {
    return this.academy.setVisibility("programme", id, dto.visible);
  }

  @Patch("modules/:id/visibility")
  @RequirePermissions(P.CONTENT_VISIBILITY)
  @Audit({ action: "module.visibility", resourceType: "module" })
  setModuleVisibility(@Param("id") id: string, @Body() dto: SetVisibilityDto) {
    return this.academy.setVisibility("module", id, dto.visible);
  }

  @Patch("lessons/:id/visibility")
  @RequirePermissions(P.CONTENT_VISIBILITY)
  @Audit({ action: "lesson.visibility", resourceType: "lesson" })
  setLessonVisibility(@Param("id") id: string, @Body() dto: SetVisibilityDto) {
    return this.academy.setVisibility("lesson", id, dto.visible);
  }

  @Patch("assessments/:id/visibility")
  @RequirePermissions(P.CONTENT_VISIBILITY)
  @Audit({ action: "assessment.visibility", resourceType: "assessment" })
  setAssessmentVisibility(
    @Param("id") id: string,
    @Body() dto: SetVisibilityDto,
  ) {
    return this.academy.setVisibility("assessment", id, dto.visible);
  }

  @Patch("questions/:id")
  @RequirePermissions(P.QUESTION_WRITE)
  @Audit({ action: "question.update", resourceType: "question" })
  updateQuestion(@Param("id") id: string, @Body() dto: UpdateQuestionDto) {
    return this.academy.updateQuestion(id, dto);
  }

  @Delete("questions/:id")
  @RequirePermissions(P.CONTENT_DELETE)
  @Audit({ action: "question.delete", resourceType: "question" })
  deleteQuestion(@Param("id") id: string) {
    return this.academy.deleteQuestion(id);
  }

  /** Level, prerequisite and card chips: where this track sits on the ladder. */
  @Patch("programmes/:id/ladder")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  @Audit({ action: "programme.ladder.update", resourceType: "programme" })
  updateLadder(@Param("id") id: string, @Body() dto: UpdateProgrammeLadderDto) {
    return this.academy.updateLadder(id, dto);
  }

  // -- Access restriction. What opens a track, and who was let in by name. ---

  /** Every rule on a track, the live grants, and the codes a rule may name. */
  @Get("programmes/:id/restrictions")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  trackRestrictions(@Param("id") id: string) {
    return this.restrictions.forProgramme(id);
  }

  /** ALL: every rule must pass. ANY: one is enough. */
  @Patch("programmes/:id/unlock-policy")
  @RequirePermissions(P.UNLOCK_RULE_WRITE)
  @Audit({ action: "unlock.policy.update", resourceType: "programme" })
  setUnlockPolicy(@Param("id") id: string, @Body() dto: SetUnlockPolicyDto) {
    return this.restrictions.setPolicy(id, dto);
  }

  @Post("programmes/:id/unlock-rules")
  @RequirePermissions(P.UNLOCK_RULE_WRITE)
  @Audit({ action: "unlock.rule.create", resourceType: "unlock_rule" })
  createUnlockRule(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: CreateUnlockRuleDto,
  ) {
    return this.restrictions.createRule(actor, id, dto);
  }

  @Patch("unlock-rules/:id")
  @RequirePermissions(P.UNLOCK_RULE_WRITE)
  @Audit({ action: "unlock.rule.update", resourceType: "unlock_rule" })
  updateUnlockRule(@Param("id") id: string, @Body() dto: UpdateUnlockRuleDto) {
    return this.restrictions.updateRule(id, dto);
  }

  @Delete("unlock-rules/:id")
  @RequirePermissions(P.UNLOCK_RULE_WRITE)
  @Audit({ action: "unlock.rule.delete", resourceType: "unlock_rule" })
  deleteUnlockRule(@Param("id") id: string) {
    return this.restrictions.deleteRule(id);
  }

  /**
   * Admitting one named candidate against the rules. Institution only: a
   * manager writes the conditions, and does not decide who is exempt from
   * them, for the same reason they do not issue credentials.
   */
  @Post("programmes/:id/grants")
  @RequirePermissions(P.TRACK_GRANT_WRITE)
  @Audit({ action: "track.grant.create", resourceType: "track_grant" })
  grantTrack(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: CreateTrackGrantDto,
  ) {
    return this.restrictions.grant(actor, id, dto);
  }

  @Post("grants/:id/revoke")
  @RequirePermissions(P.TRACK_GRANT_WRITE)
  @Audit({ action: "track.grant.revoke", resourceType: "track_grant" })
  revokeTrackGrant(@Param("id") id: string) {
    return this.restrictions.revokeGrant(id);
  }

  /** What one named candidate would see, evaluated against the rules now. */
  @Get("programmes/:id/restrictions/preview/:userId")
  @RequirePermissions(P.PROGRAMME_UPDATE)
  previewRestrictions(
    @Param("id") id: string,
    @Param("userId") userId: string,
  ) {
    return this.restrictions.preview(id, userId);
  }

  // -- Question banks. Where questions live before a paper asks for them. ---

  @Get("banks")
  @RequirePermissions(P.QUESTION_BANK_READ)
  listBanks(@Query() query: QuestionBankQuery) {
    return this.banks.list(query);
  }

  @Get("banks/:id")
  @RequirePermissions(P.QUESTION_BANK_READ)
  bankDetail(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.banks.detail(actor, id);
  }

  @Post("banks")
  @RequirePermissions(P.QUESTION_WRITE)
  @Audit({ action: "questionbank.create", resourceType: "question_bank" })
  createBank(@CurrentActor() actor: Actor, @Body() dto: CreateQuestionBankDto) {
    return this.banks.create(actor, dto);
  }

  @Patch("banks/:id")
  @RequirePermissions(P.QUESTION_WRITE)
  @Audit({ action: "questionbank.update", resourceType: "question_bank" })
  updateBank(@Param("id") id: string, @Body() dto: UpdateQuestionBankDto) {
    return this.banks.update(id, dto);
  }

  @Delete("banks/:id")
  @RequirePermissions(P.CONTENT_DELETE)
  @Audit({ action: "questionbank.delete", resourceType: "question_bank" })
  deleteBank(@Param("id") id: string) {
    return this.banks.remove(id);
  }

  /** One paper, with the banks it may draw from and the badge it earns. */
  @Get("assessments/:id/builder")
  @RequirePermissions(P.ASSESSMENT_WRITE)
  assessmentBuilder(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.banks.assessmentForBuilder(actor, id);
  }

  /** The chosen paper, in order. Sending it replaces what was there. */
  @Put("assessments/:id/questions")
  @RequirePermissions(P.ASSESSMENT_WRITE)
  @Audit({ action: "assessment.questions.set", resourceType: "assessment" })
  setAssessmentQuestions(
    @Param("id") id: string,
    @Body() dto: AttachQuestionsDto,
  ) {
    return this.banks.attachToAssessment(id, dto);
  }

  // -- Publishing. Administration only. -------------------------------------

  @Post("versions/:id/publish")
  @RequirePermissions(P.PROGRAMME_PUBLISH)
  @Audit({ action: "programme.publish", resourceType: "programme_version" })
  publish(
    @CurrentActor() actor: Actor,
    @Param("id") id: string,
    @Body() dto: PublishVersionDto,
  ) {
    return this.academy.publishVersion(actor, id, dto);
  }
}
