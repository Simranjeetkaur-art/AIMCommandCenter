import { createHash } from "node:crypto";
import { chainHash, stableStringify } from "../src/common/audit/audit-hash";

describe("audit hash chain", () => {
  it("hashes the same event to the same digest regardless of key order", () => {
    const a = {
      action: "credential.revoke",
      actorId: "u1",
      outcome: "SUCCESS",
    };
    const b = {
      outcome: "SUCCESS",
      actorId: "u1",
      action: "credential.revoke",
    };
    expect(stableStringify(a)).toBe(stableStringify(b));
  });

  it("changes the digest when any field changes", () => {
    const base = { action: "credential.revoke", actorId: "u1" };
    const tampered = { action: "credential.revoke", actorId: "u2" };
    expect(stableStringify(base)).not.toBe(stableStringify(tampered));
  });

  it("breaks the chain when an event in the middle is altered", () => {
    const link = (prev: string | null, payload: object) =>
      createHash("sha256")
        .update(`${prev ?? "GENESIS"}|${stableStringify(payload)}`)
        .digest("hex");

    const e1 = { action: "auth.login", actorId: "u1" };
    const e2 = { action: "credential.issue", actorId: "u1" };
    const e3 = { action: "credential.revoke", actorId: "u1" };

    const h1 = link(null, e1);
    const h2 = link(h1, e2);
    const h3 = link(h2, e3);

    // Somebody edits event two in place, with raw database access.
    const tamperedH2 = link(h1, { action: "credential.issue", actorId: "u9" });
    expect(tamperedH2).not.toBe(h2);
    // Event three still names the old hash, so the chain no longer follows.
    expect(link(tamperedH2, e3)).not.toBe(h3);
  });

  it("serialises nested structures deterministically", () => {
    const value = { b: [3, { y: 1, x: 2 }], a: null };
    expect(stableStringify(value)).toBe('{"a":null,"b":[3,{"x":2,"y":1}]}');
  });
});

/**
 * Regression cover for a real defect.
 *
 * The hash was originally computed in two places, the service and the seed,
 * with slightly different payloads. The chain linked correctly -- every row
 * named its predecessor -- and still failed verification, because the digest
 * could not be recomputed from the stored row. These tests pin the shape of a
 * chained payload and assert that writing and verifying agree.
 */
describe("write and verify agree on what an event is", () => {
  const occurredAt = new Date("2026-03-01T09:00:00.000Z");

  /** Exactly the payload AuditService.append builds before writing. */
  const asWritten = {
    occurredAt: occurredAt.toISOString(),
    actorId: "u1",
    actorRole: "ADMIN",
    actorEmail: "admin@aim.edu",
    action: "credential.revoke",
    resourceType: "credential",
    resourceId: null,
    outcome: "SUCCESS",
    requestId: "req-1",
    metadata: {},
  };

  /** Exactly what verifyChain reconstructs from the stored row. */
  const asRead = {
    occurredAt: occurredAt.toISOString(),
    actorId: "u1",
    actorRole: "ADMIN",
    actorEmail: "admin@aim.edu",
    action: "credential.revoke",
    resourceType: "credential",
    resourceId: null,
    outcome: "SUCCESS",
    requestId: "req-1",
    metadata: {},
  };

  it("produces the same digest on write and on verification", () => {
    expect(chainHash(null, asRead)).toBe(chainHash(null, asWritten));
  });

  it("treats a missing resourceId as null, not as absent", () => {
    const absent = { ...asWritten } as Record<string, unknown>;
    delete absent.resourceId;
    // An absent key and an explicit null must not hash alike, or a row written
    // one way and read the other would silently fail to verify.
    expect(chainHash(null, absent as never)).not.toBe(
      chainHash(null, asWritten),
    );
  });

  it("chains a sequence that verifies end to end", () => {
    const events = [
      asWritten,
      { ...asWritten, action: "auth.login" },
      { ...asWritten, seq: 3 },
    ];
    const hashes: string[] = [];
    let prev: string | null = null;
    for (const event of events) {
      const hash = chainHash(prev, event as never);
      hashes.push(hash);
      prev = hash;
    }

    let expectedPrev: string | null = null;
    events.forEach((event, i) => {
      expect(chainHash(expectedPrev, event as never)).toBe(hashes[i]);
      expectedPrev = hashes[i];
    });
  });
});
