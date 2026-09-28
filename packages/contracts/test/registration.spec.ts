import {
  MIN_PASSWORD_LENGTH,
  REGISTRATION_LIMIT_PER_ORIGIN,
  SELF_REGISTRATION_FLAG,
  SELF_REGISTRATION_ROLE,
  checkRegistration,
  permissionsFor,
  PERMISSIONS as P,
} from "../src";

const GOOD = {
  name: "Ada Lovelace",
  email: "ada@example.com",
  password: "analytical engine 1843!",
};

describe("what enrolling yourself can produce", () => {
  it("can only ever make a candidate", () => {
    expect(SELF_REGISTRATION_ROLE).toBe("STUDENT");
  });

  it("gives that candidate no authority over anybody else", () => {
    const held = permissionsFor(SELF_REGISTRATION_ROLE);
    // The powers that would make open enrolment an escalation rather than a
    // sign-up. If any of these ever lands on STUDENT, this test is the alarm.
    for (const forbidden of [
      P.USER_CREATE,
      P.USER_ROLE_ASSIGN,
      P.USER_ARCHIVE,
      P.USER_PASSWORD_RESET,
      P.DIAGNOSTIC_BIND_AGENT,
      P.PROGRAMME_PUBLISH,
    ]) {
      expect(held).not.toContain(forbidden);
    }
  });

  it("names a flag an administrator can close the door with", () => {
    expect(SELF_REGISTRATION_FLAG).toBe("registration.selfService");
  });

  it("holds one origin to a handful of accounts, not thirty", () => {
    expect(REGISTRATION_LIMIT_PER_ORIGIN).toBeLessThanOrEqual(5);
    expect(REGISTRATION_LIMIT_PER_ORIGIN).toBeGreaterThan(0);
  });
});

describe("checking a proposed enrolment", () => {
  it("accepts an ordinary one", () => {
    const verdict = checkRegistration(GOOD);
    expect(verdict.problems).toEqual([]);
    expect(verdict.ok).toBe(true);
  });

  it("folds the address and trims the name, ready to store", () => {
    const verdict = checkRegistration({
      ...GOOD,
      name: "  Ada Lovelace  ",
      email: "  Ada@Example.COM ",
    });
    expect(verdict.email).toBe("ada@example.com");
    expect(verdict.name).toBe("Ada Lovelace");
  });

  it("refuses a name too short to put on a credential", () => {
    expect(checkRegistration({ ...GOOD, name: "A" }).ok).toBe(false);
    expect(checkRegistration({ ...GOOD, name: "   " }).ok).toBe(false);
  });

  it("refuses what is plainly not an address, and allows what is", () => {
    for (const email of [
      "ada",
      "ada@",
      "@example.com",
      "ada@example",
      "a b@c.d",
    ]) {
      expect(checkRegistration({ ...GOOD, email }).ok).toBe(false);
    }
    for (const email of [
      "ada+aim@example.co.uk",
      "a.b-c_d@sub.example.com",
      "ADA@EXAMPLE.COM",
    ]) {
      expect(checkRegistration({ ...GOOD, email }).problems).toEqual([]);
    }
  });

  it("holds the first password to the same rule as every later one", () => {
    expect(checkRegistration({ ...GOOD, password: "short" }).ok).toBe(false);
    expect(
      checkRegistration({ ...GOOD, password: "a".repeat(MIN_PASSWORD_LENGTH) })
        .ok,
    ).toBe(false);
    expect(
      checkRegistration({ ...GOOD, password: "aimacademy2026!!" }).ok,
    ).toBe(false);
  });

  it("will not let the very first password be the address or the name", () => {
    expect(
      checkRegistration({ ...GOOD, password: "ada@example.com pass" }).ok,
    ).toBe(false);
    expect(
      checkRegistration({ ...GOOD, password: "lovelace lovelace 12" }).ok,
    ).toBe(false);
  });

  it("returns every problem at once rather than the first", () => {
    const verdict = checkRegistration({
      name: "A",
      email: "nope",
      password: "x",
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.problems.length).toBeGreaterThanOrEqual(3);
  });
});
