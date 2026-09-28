import {
  ALL_PERMISSIONS,
  ALL_ROLES,
  NON_EXISTENT_CAPABILITIES,
  PERMISSIONS as P,
  PROHIBITIONS,
  ROLE_PERMISSIONS,
  isPermission,
  permissionsFor,
  roleHas,
  roleHasAll,
} from "../src";

describe("permission vocabulary", () => {
  it("has no duplicate permission strings", () => {
    expect(new Set(ALL_PERMISSIONS).size).toBe(ALL_PERMISSIONS.length);
  });

  it("grants every role only permissions that exist in the vocabulary", () => {
    for (const role of ALL_ROLES) {
      for (const permission of permissionsFor(role)) {
        expect(isPermission(permission)).toBe(true);
      }
    }
  });

  it("does not define capabilities that must never exist", () => {
    for (const capability of NON_EXISTENT_CAPABILITIES) {
      expect(isPermission(capability)).toBe(false);
    }
  });
});

describe("the cannot-do column", () => {
  it.each(PROHIBITIONS)(
    "$role cannot $permission, because it $because",
    ({ role, permission }) => {
      expect(roleHas(role, permission)).toBe(false);
    },
  );
});

describe("positive grants that the product depends on", () => {
  it("lets a student take assessments and read their own record only", () => {
    expect(roleHas("STUDENT", P.ASSESSMENT_TAKE)).toBe(true);
    expect(roleHas("STUDENT", P.SUBMISSION_READ_SELF)).toBe(true);
    expect(roleHas("STUDENT", P.CREDENTIAL_READ_SELF)).toBe(true);
  });

  it("lets an instructor judge, within their assignment", () => {
    expect(roleHas("INSTRUCTOR", P.REVIEW_APPROVE)).toBe(true);
    expect(roleHas("INSTRUCTOR", P.REVIEW_GRADE)).toBe(true);
    expect(roleHas("INSTRUCTOR", P.SUBMISSION_READ_ASSIGNED)).toBe(true);
  });

  it("lets a manager build the academy and watch turnaround", () => {
    expect(roleHas("MANAGER", P.PROGRAMME_CREATE)).toBe(true);
    expect(roleHas("MANAGER", P.INSTRUCTOR_ASSIGN)).toBe(true);
    expect(roleHas("MANAGER", P.REVIEW_REASSIGN)).toBe(true);
    expect(roleHas("MANAGER", P.REVIEW_TURNAROUND_READ)).toBe(true);
  });

  it("gives an administrator everything a manager has, plus publishing", () => {
    for (const permission of ROLE_PERMISSIONS.MANAGER) {
      expect(roleHas("ADMIN", permission)).toBe(true);
    }
    expect(roleHas("ADMIN", P.PROGRAMME_PUBLISH)).toBe(true);
    expect(roleHas("ADMIN", P.AUDIT_READ)).toBe(true);
    expect(roleHas("ADMIN", P.AUDIT_EXPORT)).toBe(true);
  });
});

describe("roleHasAll fails closed", () => {
  it("refuses an empty requirement list", () => {
    for (const role of ALL_ROLES) {
      expect(roleHasAll(role, [])).toBe(false);
    }
  });

  it("requires every listed permission, not any", () => {
    expect(
      roleHasAll("INSTRUCTOR", [P.REVIEW_APPROVE, P.CREDENTIAL_ISSUE]),
    ).toBe(false);
    expect(roleHasAll("INSTRUCTOR", [P.REVIEW_APPROVE, P.REVIEW_RETURN])).toBe(
      true,
    );
  });
});

describe("separation of duties", () => {
  const judgement = [
    P.REVIEW_APPROVE,
    P.REVIEW_RETURN,
    P.REVIEW_GRADE,
  ] as const;
  const credentialLifecycle = [
    P.CREDENTIAL_ISSUE,
    P.CREDENTIAL_SUSPEND,
    P.CREDENTIAL_REVOKE,
    P.CREDENTIAL_REINSTATE,
  ] as const;

  it("never lets one role both judge work and control the credential it leads to", () => {
    for (const role of ALL_ROLES) {
      const judges = judgement.some((p) => roleHas(role, p));
      const controls = credentialLifecycle.some((p) => roleHas(role, p));
      expect(judges && controls).toBe(false);
    }
  });

  it("never lets one role both author an assessment and sit it", () => {
    for (const role of ALL_ROLES) {
      expect(
        roleHas(role, P.ASSESSMENT_WRITE) && roleHas(role, P.ASSESSMENT_TAKE),
      ).toBe(false);
    }
  });

  it("keeps the answer key away from anyone who can sit an assessment", () => {
    for (const role of ALL_ROLES) {
      expect(
        roleHas(role, P.ASSESSMENT_TAKE) && roleHas(role, P.ANSWER_KEY_READ),
      ).toBe(false);
    }
  });

  it("gives audit read to exactly one role", () => {
    const readers = ALL_ROLES.filter((r) => roleHas(r, P.AUDIT_READ));
    expect(readers).toEqual(["ADMIN"]);
  });
});

describe("the answer key", () => {
  it("is held by exactly the roles that author assessments", () => {
    const holders = ALL_ROLES.filter((r) => roleHas(r, P.ANSWER_KEY_READ));
    expect(holders.sort()).toEqual(["ADMIN", "MANAGER"]);

    // Holding the key is useless without a route that serves one, and reaching
    // that route needs both. A grant of one without the other is dead
    // authority: it looks like access and buys nothing.
    for (const role of ALL_ROLES) {
      expect(roleHas(role, P.ANSWER_KEY_READ)).toBe(
        roleHas(role, P.QUESTION_BANK_READ),
      );
    }
  });
});

describe("badges follow the same line as reviews", () => {
  it("lets exactly one role award a judgement badge, and it is the examiner", () => {
    expect(ALL_ROLES.filter((r) => roleHas(r, P.BADGE_AWARD))).toEqual([
      "INSTRUCTOR",
    ]);
  });

  it("lets exactly one role withdraw an award, and it is the institution", () => {
    expect(ALL_ROLES.filter((r) => roleHas(r, P.BADGE_REVOKE))).toEqual([
      "ADMIN",
    ]);
  });

  it("never lets one role both define a badge and award it by hand", () => {
    // Defining the condition is academy building; deciding a candidate has met
    // it is judgement. One role holding both could invent a condition and
    // declare it satisfied in the same breath.
    for (const role of ALL_ROLES) {
      expect(roleHas(role, P.BADGE_WRITE) && roleHas(role, P.BADGE_AWARD)).toBe(
        false,
      );
    }
  });

  it("holds the same separation for reviews, which is where the rule comes from", () => {
    for (const role of ALL_ROLES) {
      expect(
        roleHas(role, P.ASSESSMENT_WRITE) && roleHas(role, P.REVIEW_APPROVE),
      ).toBe(false);
    }
  });
});
