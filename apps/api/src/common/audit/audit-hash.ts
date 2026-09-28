import { createHash } from "node:crypto";

/**
 * The canonical form of an audit event, and the one place it is hashed.
 *
 * This module exists because the hash was originally computed in two places --
 * the service and the seed -- and the two drifted, which produced a chain that
 * linked correctly but could not be recomputed. Anything that appends an event
 * uses these functions, so there is only one definition of what an event is.
 */
export interface ChainPayload {
  occurredAt: string;
  actorId: string;
  actorRole: string;
  actorEmail: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  outcome: string;
  requestId: string;
  metadata: unknown;
}

export const GENESIS = "GENESIS";

export function chainHash(
  prevHash: string | null,
  payload: ChainPayload,
): string {
  return createHash("sha256")
    .update(`${prevHash ?? GENESIS}|${stableStringify(payload)}`)
    .digest("hex");
}

/** Key-sorted JSON, so the same event always hashes to the same digest. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== "object")
    return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`);
  return `{${entries.join(",")}}`;
}
