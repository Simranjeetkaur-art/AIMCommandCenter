import {
  missionSeed,
  optionLetter,
  optionOrder,
  presentOptions,
  simulatorProgress,
  stillReachable,
} from "../src/simulator";

describe("optionOrder", () => {
  it("is a permutation — every option appears exactly once", () => {
    for (let n = 2; n <= 6; n += 1) {
      const order = optionOrder(`seed-${n}`, n);
      expect(order).toHaveLength(n);
      expect([...order].sort((a, b) => a - b)).toEqual(
        Array.from({ length: n }, (_, i) => i),
      );
    }
  });

  it("is stable for the same seed", () => {
    // A refresh, a back button, or the feedback screen that follows the
    // answer must show the options where the candidate last saw them.
    const first = optionOrder("attempt-1:question-9", 4);
    const second = optionOrder("attempt-1:question-9", 4);
    expect(second).toEqual(first);
  });

  it("differs between candidates on the same mission", () => {
    const a = optionOrder(missionSeed("attempt-a", "question-9"), 4);
    const b = optionOrder(missionSeed("attempt-b", "question-9"), 4);
    expect(a).not.toEqual(b);
  });

  it("differs between missions in the same run", () => {
    const a = optionOrder(missionSeed("attempt-a", "question-1"), 4);
    const b = optionOrder(missionSeed("attempt-a", "question-2"), 4);
    expect(a).not.toEqual(b);
  });

  /**
   * The defect this whole mechanism exists for.
   *
   * In the imported AIM-CP corpus the correct option sits at stored index 1 in
   * seventy missions and index 2 in the other thirty: never A, never D. Always
   * pressing B scores 70 against a pass mark of 80 without reading a word. The
   * AIM-CA hundred is worse — only ever B or D, so alternating passes.
   *
   * After shuffling, the *presented* position of the correct option must be
   * spread across all four seats. This asserts the property that actually
   * matters rather than a fixed permutation, so it survives a change of PRNG.
   */
  it("breaks the corpus tell: every stored index lands in every seat evenly", () => {
    /**
     * Measured, not eyeballed.
     *
     * The first version of this test only asserted that each seat was used at
     * least once and that no seat took a majority. A shuffle that put option D
     * in seat B 67% more often than chance passed it comfortably — which is
     * exactly what the first implementation did, because it drew from the low
     * bits of a linear congruential generator, where the period is short. A
     * candidate who noticed *that* skew would have had a new tell in place of
     * the old one, and the test would have gone on passing.
     *
     * So this asserts the property that actually matters: over a large sample,
     * each of the four stored options reaches each of the four seats close to a
     * quarter of the time. The tolerance is wide enough not to be flaky and far
     * tighter than any skew a candidate could exploit.
     */
    const sample = 20000;
    const expected = sample / 4;
    const tolerance = 0.1; // 10%

    for (let stored = 0; stored < 4; stored += 1) {
      const seats = [0, 0, 0, 0];
      for (let n = 0; n < sample; n += 1) {
        const order = optionOrder(
          missionSeed(`attempt-${n}`, `q${n % 997}`),
          4,
        );
        seats[order.indexOf(stored)] += 1;
      }
      for (const count of seats) {
        expect(Math.abs(count - expected) / expected).toBeLessThan(tolerance);
      }
    }
  });

  it("draws independently within a single shuffle", () => {
    /**
     * Where the low-bit defect actually lived.
     *
     * Successive draws inside one Fisher-Yates pass came off successive states
     * of the same generator. This one's lowest bit satisfies
     * `low(next) = low(current) + 1`, so it strictly alternates — meaning the
     * second draw of a pass was a function of the first rather than
     * independent of it. A single draw looked fine in isolation, which is why
     * it needs the whole permutation to show up.
     *
     * All six orderings of three options must be about equally likely. Under
     * the remainder form two of the six never occurred at all.
     */
    const counts = new Map<string, number>();
    const sample = 12000;
    for (let n = 0; n < sample; n += 1) {
      const key = optionOrder(`seed-${n}`, 3).join("");
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }

    expect(counts.size).toBe(6);
    const expected = sample / 6;
    for (const count of counts.values()) {
      expect(Math.abs(count - expected) / expected).toBeLessThan(0.1);
    }
  });

  it("keeps ids with their options, so marking needs no inverse mapping", () => {
    const options = [
      { id: "0", text: "alpha" },
      { id: "1", text: "bravo" },
      { id: "2", text: "charlie" },
      { id: "3", text: "delta" },
    ];
    const shown = presentOptions(options, "any-seed");
    expect(shown).toHaveLength(4);
    for (const option of options) {
      expect(shown).toContainEqual(option);
    }
  });
});

describe("optionLetter", () => {
  it("labels by position, so the letter follows the shuffle", () => {
    expect(optionLetter(0)).toBe("A");
    expect(optionLetter(3)).toBe("D");
  });
});

describe("simulatorProgress", () => {
  it("scores against the whole run, not against what has been answered", () => {
    // Ten right out of ten answered is 10%, not 100%, with ninety to fly.
    expect(simulatorProgress(100, 10, 10).score).toBe(10);
  });

  it("is finished only when every mission has been answered", () => {
    expect(simulatorProgress(100, 99, 99).finished).toBe(false);
    expect(simulatorProgress(100, 100, 80).finished).toBe(true);
  });

  it("reports an empty simulator as unfinished rather than complete", () => {
    expect(simulatorProgress(0, 0, 0).finished).toBe(false);
  });
});

describe("stillReachable", () => {
  it("is true while every remaining mission could still carry the run", () => {
    // 15 wrong out of 100 leaves a ceiling of 85, above an 80 pass mark.
    expect(stillReachable(simulatorProgress(100, 20, 5), 80)).toBe(true);
  });

  it("goes false once the ceiling drops below the pass mark", () => {
    // 21 wrong leaves a ceiling of 79. The run cannot pass, and saying so
    // beats letting someone fly seventy-nine more missions for nothing.
    expect(stillReachable(simulatorProgress(100, 25, 4), 80)).toBe(false);
  });

  it("is true at the start of a run", () => {
    expect(stillReachable(simulatorProgress(100, 0, 0), 80)).toBe(true);
  });
});
