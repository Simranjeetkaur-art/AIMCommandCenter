import { BadRequestException } from "@nestjs/common";
import {
  normaliseGateSteps,
  validateGateSteps,
} from "../src/modules/academy/gate-steps";

const PAPERS = ["AIM-CP-EXAM", "AIM-CP-EXAM-2", "AIM-CP-SIM"];

describe("normaliseGateSteps", () => {
  it("returns nothing for a column that has never been set", () => {
    expect(normaliseGateSteps(null)).toEqual([]);
    expect(normaliseGateSteps(undefined)).toEqual([]);
    expect(normaliseGateSteps("not a list")).toEqual([]);
  });

  /**
   * Every track authored before the mapping existed holds bare labels, and
   * they have to keep gating exactly as they did.
   */
  describe("the legacy bare-label shape", () => {
    const legacy = [
      "Hold AIM-CP",
      "Ten command modules",
      "Final examination",
      "Commander check ride",
      "Credential issued",
    ];

    it("marks every inferred step as a guess", () => {
      const steps = normaliseGateSteps(legacy, { hasPrerequisite: true });
      expect(steps.every((s) => s.inferred)).toBe(true);
    });

    it("reads the first step as the prerequisite when the track has one", () => {
      const [first] = normaliseGateSteps(legacy, { hasPrerequisite: true });
      expect(first.requirement).toBe("PREREQUISITE");
    });

    it("does not invent a prerequisite for a track without one", () => {
      const [first] = normaliseGateSteps(legacy, { hasPrerequisite: false });
      expect(first.requirement).not.toBe("PREREQUISITE");
    });

    it("always reads the last step as the credential", () => {
      const steps = normaliseGateSteps(legacy, { hasPrerequisite: true });
      expect(steps[steps.length - 1].requirement).toBe("CREDENTIAL");
    });

    it("reads a module step as the lessons", () => {
      const steps = normaliseGateSteps(legacy, { hasPrerequisite: true });
      expect(steps[1].requirement).toBe("LESSONS");
    });

    it("resolves an examination to a paper by kind, not by name", () => {
      const steps = normaliseGateSteps(legacy, { hasPrerequisite: true });
      expect(steps[2]).toMatchObject({
        requirement: "ASSESSMENT",
        assessmentCode: "@kind:QUIZ",
      });
    });

    /** "Capstone defence" is a defence. The narrower test has to win. */
    it("reads a capstone defence as a defence, not a practical", () => {
      const [step] = normaliseGateSteps(["Capstone defence", "x"], {
        hasPrerequisite: false,
      });
      expect(step.assessmentCode).toBe("@kind:DEFENCE");
    });
  });

  describe("the mapped shape", () => {
    it("keeps a stated requirement instead of guessing from the label", () => {
      const steps = normaliseGateSteps([
        {
          label: "The Last Paper",
          requirement: "ASSESSMENT",
          assessmentCode: "AIM-CP-EXAM-2",
        },
      ]);
      expect(steps[0]).toEqual({
        label: "The Last Paper",
        requirement: "ASSESSMENT",
        assessmentCode: "AIM-CP-EXAM-2",
      });
    });

    /**
     * The whole gap: a label that matches no regular expression used to sit
     * unmet forever. Mapped, it does not care what it is called.
     */
    it("honours a step whose label matches none of the old patterns", () => {
      const [step] = normaliseGateSteps([
        { label: "Prove it", requirement: "LESSONS" },
      ]);
      expect(step.requirement).toBe("LESSONS");
      expect(step.inferred).toBeUndefined();
    });

    it("falls back to inference for an object with no usable requirement", () => {
      const [step] = normaliseGateSteps(
        [
          { label: "Final examination", requirement: "NONSENSE" },
          { label: "x" },
        ],
        { hasPrerequisite: false },
      );
      expect(step.inferred).toBe(true);
      expect(step.assessmentCode).toBe("@kind:QUIZ");
    });

    it("reads a mixed list, old and new together", () => {
      const steps = normaliseGateSteps([
        "Ten command modules",
        {
          label: "Paper two",
          requirement: "ASSESSMENT",
          assessmentCode: "AIM-CP-EXAM-2",
        },
        "Credential issued",
      ]);
      expect(steps.map((s) => s.requirement)).toEqual([
        "LESSONS",
        "ASSESSMENT",
        "CREDENTIAL",
      ]);
      expect(steps[1].inferred).toBeUndefined();
      expect(steps[0].inferred).toBe(true);
    });
  });
});

describe("validateGateSteps", () => {
  it("refuses anything that is not a list", () => {
    expect(() => validateGateSteps("nope", PAPERS)).toThrow(
      BadRequestException,
    );
  });

  it("refuses a step with no label", () => {
    expect(() =>
      validateGateSteps([{ label: "   ", requirement: "LESSONS" }], PAPERS),
    ).toThrow(BadRequestException);
  });

  it("refuses a step that does not say what it requires", () => {
    expect(() => validateGateSteps([{ label: "Something" }], PAPERS)).toThrow(
      BadRequestException,
    );
  });

  it("refuses an assessment step that names no paper", () => {
    expect(() =>
      validateGateSteps([{ label: "Exam", requirement: "ASSESSMENT" }], PAPERS),
    ).toThrow(BadRequestException);
  });

  /** An unmeetable gate is worse than an unmapped one: nothing reports it. */
  it("refuses a paper that is not on this track", () => {
    expect(() =>
      validateGateSteps(
        [
          {
            label: "Exam",
            requirement: "ASSESSMENT",
            assessmentCode: "OTHER-TRACK-EXAM",
          },
        ],
        PAPERS,
      ),
    ).toThrow(/not a paper on this track/);
  });

  it("accepts a paper that is", () => {
    expect(
      validateGateSteps(
        [
          {
            label: "Exam",
            requirement: "ASSESSMENT",
            assessmentCode: "AIM-CP-EXAM-2",
          },
        ],
        PAPERS,
      ),
    ).toEqual([
      {
        label: "Exam",
        requirement: "ASSESSMENT",
        assessmentCode: "AIM-CP-EXAM-2",
      },
    ]);
  });

  /** So an untouched legacy step survives a round trip through the editor. */
  it("accepts a kind placeholder", () => {
    expect(
      validateGateSteps(
        [
          {
            label: "Exam",
            requirement: "ASSESSMENT",
            assessmentCode: "@kind:QUIZ",
          },
        ],
        PAPERS,
      ),
    ).toHaveLength(1);
  });

  it("trims a label rather than storing the whitespace", () => {
    const [step] = validateGateSteps(
      [{ label: "  Ten modules  ", requirement: "LESSONS" }],
      PAPERS,
    );
    expect(step.label).toBe("Ten modules");
  });
});
