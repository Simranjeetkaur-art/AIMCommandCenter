import { BadRequestException } from "@nestjs/common";

/**
 * The certification gate, as a mapping rather than a guess.
 *
 * A gate step used to be a bare label, and which requirement it stood for was
 * recovered by running regular expressions over that label -- `/exam/i`,
 * `/simulat/i`, and so on -- and then resolving to the *first* assessment of
 * the matching kind. Two things went wrong with that, and both are the same
 * mistake: the data did not say what it meant.
 *
 *   - A track with two quizzes lit the wrong step, because "the first QUIZ"
 *     is not a thing an author ever chose.
 *   - Renaming a step to something clearer could silently unmap it. "Final
 *     Examination" matched; "The Last Paper" matched nothing and sat unmet
 *     forever, with nothing anywhere reporting that it had come unstuck.
 *
 * A step now carries its requirement. The label is free text again, which is
 * what a label should be.
 *
 * The legacy shape is still read, because the column holds `string[]` for
 * every track authored before this and a migration that guessed would just be
 * the same inference written once into the data instead of run each time.
 * Legacy steps are marked `inferred`, so a screen can show an author which of
 * their steps are still resting on a guess.
 */
export type GateRequirement =
  "PREREQUISITE" | "LESSONS" | "ASSESSMENT" | "CREDENTIAL";

export interface GateStep {
  label: string;
  requirement: GateRequirement;
  /** Required when the requirement is ASSESSMENT; the paper's own code. */
  assessmentCode?: string;
  /**
   * True when this step came from a bare label and its requirement was
   * guessed rather than stated. Never written by an author.
   */
  inferred?: boolean;
  /**
   * Part of the journey, but not a condition of the credential. Practice
   * runs and examiner-marked extras sit here: they are shown so a candidate
   * knows the work exists, and they never hold the certificate up.
   */
  optional?: boolean;
}

const REQUIREMENTS: readonly GateRequirement[] = [
  "PREREQUISITE",
  "LESSONS",
  "ASSESSMENT",
  "CREDENTIAL",
];

/**
 * Reads whatever is in the column.
 *
 * Accepts the legacy `string[]` and the mapped form, and returns the mapped
 * form either way, so every caller downstream sees one shape.
 */
export function normaliseGateSteps(
  raw: unknown,
  context: { hasPrerequisite: boolean } = { hasPrerequisite: false },
): GateStep[] {
  if (!Array.isArray(raw)) return [];

  const steps = raw as unknown[];
  return steps.map((entry, index) => {
    if (typeof entry === "string") {
      return inferStep(entry, index, steps.length, context.hasPrerequisite);
    }

    if (entry && typeof entry === "object") {
      const step = entry as Record<string, unknown>;
      const label = typeof step.label === "string" ? step.label : "";
      const requirement = step.requirement as GateRequirement;

      if (!REQUIREMENTS.includes(requirement)) {
        // An object that is not a step we understand is still a step somebody
        // wrote, so it keeps its label and falls back to the old guess rather
        // than vanishing off the gate.
        return inferStep(label, index, steps.length, context.hasPrerequisite);
      }

      return {
        label,
        requirement,
        ...(step.optional === true ? { optional: true } : {}),
        ...(requirement === "ASSESSMENT" &&
        typeof step.assessmentCode === "string"
          ? { assessmentCode: step.assessmentCode }
          : {}),
      };
    }

    return inferStep("", index, steps.length, context.hasPrerequisite);
  });
}

/**
 * The old behaviour, kept exactly, for steps that have not been mapped yet.
 *
 * Deliberately unchanged including its faults: this is what those tracks have
 * been doing, and quietly improving it would move the gate under people
 * mid-programme. What is new is that the result says it was a guess.
 */
function inferStep(
  label: string,
  index: number,
  total: number,
  hasPrerequisite: boolean,
): GateStep {
  const isFirst = index === 0;
  const isLast = index === total - 1;

  if (isLast) return { label, requirement: "CREDENTIAL", inferred: true };
  if (isFirst && hasPrerequisite) {
    return { label, requirement: "PREREQUISITE", inferred: true };
  }
  if (/module/i.test(label)) {
    return { label, requirement: "LESSONS", inferred: true };
  }

  // Order matters and always did: "capstone defence" has to read as a defence
  // rather than as a practical, so the narrower test runs first.
  const kind = /defen[cs]e|check ride/i.test(label)
    ? "DEFENCE"
    : /simulat/i.test(label)
      ? "SIMULATION"
      : /practical|capstone/i.test(label)
        ? "PRACTICAL"
        : /exam/i.test(label)
          ? "QUIZ"
          : null;

  if (kind) {
    return {
      label,
      requirement: "ASSESSMENT",
      // No code: the resolver falls back to "first of this kind", which is
      // the behaviour this step already had.
      assessmentCode: `@kind:${kind}`,
      inferred: true,
    };
  }

  return { label, requirement: "LESSONS", inferred: true };
}

/** What an author may save. Rejects a mapping that cannot be honoured. */
export function validateGateSteps(
  raw: unknown,
  knownAssessmentCodes: readonly string[],
): GateStep[] {
  if (!Array.isArray(raw)) {
    throw new BadRequestException("The certification gate must be a list");
  }

  return (raw as unknown[]).map((entry, index) => {
    const position = index + 1;

    if (typeof entry === "string") {
      if (entry.trim().length === 0) {
        throw new BadRequestException(`Step ${position} has no label`);
      }
      return { label: entry.trim(), requirement: "LESSONS" as const };
    }

    if (!entry || typeof entry !== "object") {
      throw new BadRequestException(`Step ${position} is not a step`);
    }

    const step = entry as Record<string, unknown>;
    const label = typeof step.label === "string" ? step.label.trim() : "";
    if (label.length === 0) {
      throw new BadRequestException(`Step ${position} has no label`);
    }

    const requirement = step.requirement as GateRequirement;
    if (!REQUIREMENTS.includes(requirement)) {
      throw new BadRequestException(
        `Step ${position} ("${label}") does not say what it requires`,
      );
    }

    const optional = step.optional === true ? { optional: true } : {};
    if (requirement !== "ASSESSMENT") return { label, requirement, ...optional };

    const code =
      typeof step.assessmentCode === "string" ? step.assessmentCode.trim() : "";
    if (code.length === 0) {
      throw new BadRequestException(
        `Step ${position} ("${label}") must name the paper it requires`,
      );
    }
    // A kind placeholder is how an unmapped legacy step survives a round trip;
    // an author saving a real mapping has to name a paper that exists, or the
    // step would be unmeetable and nothing would say so.
    if (!code.startsWith("@kind:") && !knownAssessmentCodes.includes(code)) {
      throw new BadRequestException(
        `Step ${position} ("${label}") names ${code}, which is not a paper on this track`,
      );
    }

    return { label, requirement, assessmentCode: code, ...optional };
  });
}
