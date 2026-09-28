import { IsEnum, IsISO8601, IsOptional, IsString } from "class-validator";
import { AuditOutcome } from "@prisma/client";
import { PageQuery } from "../../common/util/pagination";

export class AuditQuery extends PageQuery {
  @IsOptional() @IsString() actorId?: string;
  @IsOptional() @IsString() action?: string;
  @IsOptional() @IsString() resourceType?: string;
  @IsOptional() @IsString() resourceId?: string;
  @IsOptional() @IsEnum(AuditOutcome) outcome?: AuditOutcome;
  @IsOptional() @IsISO8601() from?: string;
  @IsOptional() @IsISO8601() to?: string;
}
