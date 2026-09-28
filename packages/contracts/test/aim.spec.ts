import {
  AAI_BANDS,
  AIM_DIMENSIONS,
  AIM_DIMENSION_COUNT,
  AIM_ENVELOPE,
  AIM_MAX_TOTAL,
  AIM_ROLE_BASELINES,
  bandFor,
  computeAai,
} from "../src";

describe("the AIM Autonomy Index", () => {
  it("has eleven dimensions scored out of five", () => {
    expect(AIM_DIMENSIONS).toHaveLength(AIM_DIMENSION_COUNT);
    expect(AIM_MAX_TOTAL).toBe(55);
  });

  it("reproduces the prototype formula, 100 x sum / 55", () => {
    // The worked example printed in the AIM-CP module 2 lesson.
    expect(computeAai([3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3])).toBe(60);
    expect(computeAai([1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1])).toBe(20);
    expect(computeAai([5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5])).toBe(100);
  });

  it("reproduces the seeded AP-AI-01 figure of 74.5", () => {
    // 41 of 55 -> 74.5, the value the prototype registry carried.
    const scores = [4, 4, 4, 4, 4, 3, 4, 4, 4, 3, 3];
    expect(scores.reduce((a, b) => a + b, 0)).toBe(41);
    expect(computeAai(scores)).toBe(74.5);
  });

  it("refuses a score vector of the wrong length, rather than scoring it anyway", () => {
    expect(() => computeAai([1, 2, 3])).toThrow();
    expect(() => computeAai([])).toThrow();
  });

  it("places every possible index in exactly one band", () => {
    for (let total = 11; total <= 55; total += 1) {
      const aai = Number(((100 * total) / 55).toFixed(1));
      const matches = AAI_BANDS.filter((b) => aai >= b.min && aai <= b.max);
      expect(matches).toHaveLength(1);
    }
  });

  it("bands at the documented boundaries", () => {
    expect(bandFor(0).band).toBe("LOWER");
    expect(bandFor(24.9).band).toBe("LOWER");
    expect(bandFor(25).band).toBe("MODERATE");
    expect(bandFor(49.9).band).toBe("MODERATE");
    expect(bandFor(50).band).toBe("ELEVATED");
    expect(bandFor(74.9).band).toBe("ELEVATED");
    expect(bandFor(75).band).toBe("CRITICAL");
    expect(bandFor(100).band).toBe("CRITICAL");
  });
});

describe("the authority envelope", () => {
  it("carries all eight boundaries, P through Q", () => {
    expect(AIM_ENVELOPE.map((e) => e.key)).toEqual([
      "P",
      "D",
      "X",
      "F",
      "T",
      "L",
      "S",
      "Q",
    ]);
  });
});

describe("role baselines", () => {
  it("gives every baseline eleven scores in range", () => {
    for (const [role, scores] of Object.entries(AIM_ROLE_BASELINES)) {
      expect(scores).toHaveLength(AIM_DIMENSION_COUNT);
      for (const score of scores) {
        expect(score).toBeGreaterThanOrEqual(1);
        expect(score).toBeLessThanOrEqual(5);
      }
      expect(() => computeAai(scores)).not.toThrow();
      expect(role).toBeTruthy();
    }
  });
});
