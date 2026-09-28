import { SetMetadata } from "@nestjs/common";

export const AUDIT_KEY = "aim:audit";

export interface AuditSpec {
  /** Dotted verb recorded in the log, e.g. 'credential.revoke'. */
  action: string;
  resourceType: string;
  /** Route param holding the resource id. Defaults to 'id'. */
  idParam?: string;
  /**
   * Reads are not recorded by default -- the log would drown. Set this on the
   * reads that matter: the audit log itself, a credential list, an export.
   */
  recordReads?: boolean;
}

export const Audit = (spec: AuditSpec) => SetMetadata(AUDIT_KEY, spec);
