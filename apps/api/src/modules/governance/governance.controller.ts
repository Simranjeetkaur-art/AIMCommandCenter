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
import { GovernanceService } from "./governance.service";
import {
  CreateAgentDto,
  CreateDiagnosticDto,
  CreatePrescriptionDto,
  RetireAgentDto,
  DeleteAgentDto,
  UpdateAgentDto,
} from "./governance.dto";

@Controller("registry")
export class RegistryController {
  constructor(private readonly governance: GovernanceService) {}

  @Get("summary")
  @RequirePermissions(P.AGENT_READ)
  summary() {
    return this.governance.registrySummary();
  }

  @Get("agents")
  @RequirePermissions(P.AGENT_READ)
  list(
    @Query("includeRetired") includeRetired?: string,
    @Query("sort") sort?: string,
    @Query("direction") direction?: string,
  ) {
    return this.governance.listAgents(
      includeRetired === "true",
      sort,
      direction,
    );
  }

  @Get("agents/:id")
  @RequirePermissions(P.AGENT_READ)
  agent(@Param("id") id: string) {
    return this.governance.agent(id);
  }

  @Post("agents")
  @RequirePermissions(P.AGENT_WRITE)
  @Audit({ action: "agent.create", resourceType: "agent" })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateAgentDto) {
    return this.governance.createAgent(actor, dto);
  }

  @Patch("agents/:id")
  @RequirePermissions(P.AGENT_WRITE)
  @Audit({ action: "agent.update", resourceType: "agent" })
  update(@Param("id") id: string, @Body() dto: UpdateAgentDto) {
    return this.governance.updateAgent(id, dto);
  }

  /** Ending an authority record. Administration only, with a stated reason. */
  @Post("agents/:id/retire")
  @RequirePermissions(P.AGENT_RETIRE)
  @Audit({ action: "agent.retire", resourceType: "agent" })
  retire(@Param("id") id: string, @Body() dto: RetireAgentDto) {
    return this.governance.retireAgent(id, dto);
  }

  /**
   * Destroying the record rather than closing it.
   *
   * Same permission as retiring -- both end an agent's authority record and
   * both belong to the institution -- but this one takes the bound diagnostics
   * with it and cannot be undone, so it asks for a longer reason and says in
   * the audit event exactly how much went.
   */
  @Delete("agents/:id")
  @RequirePermissions(P.AGENT_RETIRE)
  @Audit({ action: "agent.delete", resourceType: "agent" })
  remove(@Param("id") id: string, @Body() dto: DeleteAgentDto) {
    return this.governance.deleteAgent(id, dto.reason);
  }
}

@Controller("diagnostics")
export class DiagnosticsController {
  constructor(private readonly governance: GovernanceService) {}

  @Get()
  @RequirePermissions(P.DIAGNOSTIC_READ_SELF)
  list(@CurrentActor() actor: Actor, @Query("agentId") agentId?: string) {
    return this.governance.listDiagnostics(actor, agentId);
  }

  @Get(":id")
  @RequirePermissions(P.DIAGNOSTIC_READ_SELF)
  detail(@CurrentActor() actor: Actor, @Param("id") id: string) {
    return this.governance.diagnostic(actor, id);
  }

  /**
   * Running a diagnostic. The AAI is computed here from the eleven scores;
   * there is no field on the DTO that could carry an index of the caller's
   * choosing, which is what would make the registry lie.
   */
  @Post()
  @RequirePermissions(P.DIAGNOSTIC_CREATE)
  @Audit({ action: "diagnostic.create", resourceType: "diagnostic" })
  create(@CurrentActor() actor: Actor, @Body() dto: CreateDiagnosticDto) {
    return this.governance.createDiagnostic(actor, dto);
  }
}

@Controller("prescriptions")
export class PrescriptionsController {
  constructor(private readonly governance: GovernanceService) {}

  /** Declared before the parameterised route, or "list" reads as an id. */
  @Get()
  @RequirePermissions(P.PRESCRIPTION_READ)
  list(@CurrentActor() actor: Actor) {
    return this.governance.listPrescriptions(actor);
  }

  @Get(":diagnosticId")
  @RequirePermissions(P.PRESCRIPTION_READ)
  detail(
    @CurrentActor() actor: Actor,
    @Param("diagnosticId") diagnosticId: string,
  ) {
    return this.governance.prescription(actor, diagnosticId);
  }

  @Post()
  @RequirePermissions(P.PRESCRIPTION_CREATE)
  @Audit({ action: "prescription.create", resourceType: "prescription" })
  create(@CurrentActor() actor: Actor, @Body() dto: CreatePrescriptionDto) {
    return this.governance.createPrescription(actor, dto);
  }
}
