import type { Permission, Role } from "@aim/contracts";

/**
 * Who is acting. Attached to the request by SessionGuard and never built from
 * anything the caller sends: it comes from a session row looked up by the
 * hash of the presented token.
 */
export interface Actor {
  id: string;
  email: string;
  name: string;
  role: Role;
  sessionId: string;
  permissions: readonly Permission[];
  /**
   * Set while this session is looking at another role's screens.
   *
   * `role` above stays what it always was -- the actor's own -- because every
   * audit record names them, not the role they are looking at. What changes is
   * `permissions`, which becomes the previewed role's reads and nothing else.
   */
  previewRole: Role | null;
}

declare module "express" {
  interface Request {
    actor?: Actor;
    requestId?: string;
    /** Set by PermissionsGuard so the audit record can state what was demanded. */
    requiredPermissions?: readonly Permission[];
  }
}
