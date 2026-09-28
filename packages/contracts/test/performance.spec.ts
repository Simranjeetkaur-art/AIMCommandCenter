import {
  AAI_BANDS,
  ALL_ROLES,
  PERFORMANCE_BANDS,
  PERFORMANCE_DIMENSIONS,
  PERFORMANCE_MAX_SCORE,
  PERMISSIONS as P,
  REVIEWS_ROLE,
  computePerformanceIndex,
  dimensionsFor,
  mayReview,
  performanceBandFor,
  permissionsFor,
  roleHas,
} from "../src";

describe("the evaluation ladder", () => {
  describe("each rung reviews exactly the rung below", () => {
    it("an instructor assesses candidates", () => {
      expect(mayReview("INSTRUCTOR", "STUDENT")).toBe(true);
    });

    it("a manager assesses instructors", () => {
      expect(mayReview("MANAGER", "INSTRUCTOR")).toBe(true);
    });

    it("the institution assesses managers", () => {
      expect(mayReview("ADMIN", "MANAGER")).toBe(true);
    });

    it("nobody reviews their own rung", () => {
      for (const role of ALL_ROLES) {
        expect(mayReview(role, role)).toBe(false);
      }
    });

    it("nobody reviews upward", () => {
      expect(mayReview("STUDENT", "INSTRUCTOR")).toBe(false);
      expect(mayReview("INSTRUCTOR", "MANAGER")).toBe(false);
      expect(mayReview("MANAGER", "ADMIN")).toBe(false);
    });

    /**
     * The one that is easy to get wrong by being helpful.
     *
     * An administrator can see everything, so it is tempting to let them score
     * a candidate directly. That would make the examiner's judgement
     * decorative and break the chain the rest of the product is built on.
     */
    it("an administrator does not reach past a manager to a candidate", () => {
      expect(mayReview("ADMIN", "STUDENT")).toBe(false);
      expect(mayReview("ADMIN", "INSTRUCTOR")).toBe(false);
    });

    it("a candidate reviews nobody", () => {
      expect(REVIEWS_ROLE.STUDENT).toBeUndefined();
      for (const role of ALL_ROLES) {
        expect(mayReview("STUDENT", role)).toBe(false);
      }
    });
  });

  describe("who holds what", () => {
    it("a candidate cannot write a review", () => {
      expect(roleHas("STUDENT", P.PERFORMANCE_WRITE)).toBe(false);
    });

    it("nor read anybody else's", () => {
      expect(roleHas("STUDENT", P.PERFORMANCE_READ_CHAIN)).toBe(false);
    });

    it("but can read their own", () => {
      expect(roleHas("STUDENT", P.PERFORMANCE_READ_SELF)).toBe(true);
    });

    it("everyone can read their own", () => {
      for (const role of ALL_ROLES) {
        expect(roleHas(role, P.PERFORMANCE_READ_SELF)).toBe(true);
      }
    });

    it("every role that reviews somebody can write one", () => {
      for (const role of ALL_ROLES) {
        if (REVIEWS_ROLE[role]) {
          expect(roleHas(role, P.PERFORMANCE_WRITE)).toBe(true);
        }
      }
    });

    it("and every role that writes one reviews somebody", () => {
      for (const role of ALL_ROLES) {
        if (roleHas(role, P.PERFORMANCE_WRITE)) {
          expect(REVIEWS_ROLE[role]).toBeDefined();
        }
      }
    });
  });

  describe("what each rung is judged on", () => {
    it("every reviewable role has dimensions", () => {
      for (const role of ALL_ROLES) {
        if (Object.values(REVIEWS_ROLE).includes(role)) {
          expect(dimensionsFor(role).length).toBeGreaterThan(0);
        }
      }
    });

    it("the institution is not scored from inside itself", () => {
      expect(dimensionsFor("ADMIN")).toHaveLength(0);
    });

    it("the rungs are judged on different things", () => {
      const student = dimensionsFor("STUDENT").map((d) => d.key);
      const instructor = dimensionsFor("INSTRUCTOR").map((d) => d.key);
      expect(student.some((k) => instructor.includes(k))).toBe(false);
    });

    it("every dimension says what it measures", () => {
      for (const role of ALL_ROLES) {
        for (const dimension of dimensionsFor(role)) {
          expect(dimension.name.length).toBeGreaterThan(3);
          expect(dimension.description.length).toBeGreaterThan(20);
        }
      }
    });

    it("no duplicate keys within a rung", () => {
      for (const role of ALL_ROLES) {
        const keys = dimensionsFor(role).map((d) => d.key);
        expect(new Set(keys).size).toBe(keys.length);
      }
    });
  });

  describe("the index", () => {
    it("is 100 when everything is full marks", () => {
      const dims = dimensionsFor("STUDENT").length;
      const full = Array(dims).fill(PERFORMANCE_MAX_SCORE);
      expect(computePerformanceIndex(full, dims)).toBe(100);
    });

    it("is 20 when everything is the floor", () => {
      const dims = dimensionsFor("STUDENT").length;
      expect(computePerformanceIndex(Array(dims).fill(1), dims)).toBe(20);
    });

    it("refuses a score list of the wrong length", () => {
      expect(() => computePerformanceIndex([5, 5], 5)).toThrow(
        /Expected 5 scores/,
      );
    });
  });

  describe("polarity", () => {
    /**
     * The trap this block exists for.
     *
     * The AAI runs the other way: a high index there means authority is
     * concentrated and the top of that scale is red. If performance reused
     * that colouring, an exemplary reviewer would be painted as a critical
     * risk on the same gauge component.
     */
    it("runs green at the top, unlike the AAI", () => {
      const topPerformance = PERFORMANCE_BANDS[PERFORMANCE_BANDS.length - 1];
      const topExposure = AAI_BANDS[AAI_BANDS.length - 1];

      expect(topPerformance.tone).toBe("green");
      expect(topExposure.tone).toBe("red");
    });

    it("and red at the bottom", () => {
      expect(PERFORMANCE_BANDS[0].tone).toBe("red");
      expect(AAI_BANDS[0].tone).toBe("green");
    });

    it("bands cover 0 to 100 with no gap", () => {
      expect(PERFORMANCE_BANDS[0].min).toBe(0);
      expect(PERFORMANCE_BANDS[PERFORMANCE_BANDS.length - 1].max).toBe(100);
      for (let i = 1; i < PERFORMANCE_BANDS.length; i += 1) {
        expect(PERFORMANCE_BANDS[i].min).toBeCloseTo(
          PERFORMANCE_BANDS[i - 1].max,
          1,
        );
      }
    });

    it("every index lands in exactly one band", () => {
      for (let i = 0; i <= 100; i += 1) {
        const matches = PERFORMANCE_BANDS.filter(
          (b) => i >= b.min && i <= b.max,
        );
        expect(matches).toHaveLength(1);
      }
    });

    it("full marks is exemplary and the floor is developing", () => {
      expect(performanceBandFor(100).band).toBe("EXEMPLARY");
      expect(performanceBandFor(20).band).toBe("DEVELOPING");
    });
  });

  it("scores every role against its own list, never a shared one", () => {
    const lists = ALL_ROLES.map((role) => PERFORMANCE_DIMENSIONS[role]);
    // Four distinct arrays, not one reused.
    expect(new Set(lists).size).toBe(ALL_ROLES.length);
  });

  it("gives a reviewer the reads they need to write one", () => {
    for (const [reviewer] of Object.entries(REVIEWS_ROLE)) {
      const held = permissionsFor(reviewer as never);
      expect(held).toContain(P.PERFORMANCE_READ_CHAIN);
    }
  });
});
