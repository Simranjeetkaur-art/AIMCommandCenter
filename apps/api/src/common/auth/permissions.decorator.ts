import { SetMetadata } from "@nestjs/common";
import type { Permission } from "@aim/contracts";

export const PERMISSIONS_ALL_KEY = "aim:permissions:all";
export const PERMISSIONS_ANY_KEY = "aim:permissions:any";

/**
 * Declares what a route demands. Every permission listed must be held.
 *
 * A route with none of these decorators and no @Public is refused at runtime
 * by PermissionsGuard, which is the point: a new endpoint is unreachable until
 * somebody states, in the route definition, who it is for.
 */
export const RequirePermissions = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_ALL_KEY, permissions);

/**
 * Declares a route reachable by holders of any one of several permissions.
 *
 * This exists for the handful of routes where two roles arrive by different
 * routes to the same screen -- an examiner with submission.read.assigned and a
 * manager with submission.read.all both list submissions. They see different
 * rows: the permission opens the handler, and AccessScopeService decides the
 * scope. It is not a way to avoid declaring a requirement.
 */
export const RequireAnyPermission = (...permissions: Permission[]) =>
  SetMetadata(PERMISSIONS_ANY_KEY, permissions);
