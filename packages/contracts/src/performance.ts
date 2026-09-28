import { ROLES, type Role } from "./roles";

/**
 * People assessing people.
 *
 * The academy already judges *work*: an examiner approves a submission, and a
 * credential follows. This is the other axis — how well each person does the
 * job the system gives them — and it runs up the same chain of accountability
 * the rest of the product is built on.
 *
 * Three things are load-bearing here, and each of them is a rule rather than a
 * convention:
 *
 *  1. **Each rung reviews exactly the rung below.** An instructor assesses the
 *     candidates assigned to them; a manager assesses instructors; the
 *     institution assesses managers. Nobody reviews upward, nobody reviews
 *     their own rung, and nobody reviews themselves. An administrator does not
 *     reach past a manager to score a candidate directly — doing so would make
 *     the instructor's judgement decorative.
 *  2. **Higher is better.** The AAI runs the other way: there, a high index
 *     means more exposure and the top of the scale is red. Here the top of the
 *     scale is the good end, so the same gauge must be coloured in the
 *     opposite order. Getting this wrong makes an excellent reviewer look like
 *     a critical risk.
 *  3. **A score without a reason is not a review.** Every one carries written
 *     strengths and concerns, for the same reason an approval needs a
 *     substantive comment.
 */

export interface PerformanceDimension {
  key: string;
  name: string;
  description: string;
}

/**
 * What each rung is actually judged on.
 *
 * Deliberately different per role: the qualities that make a good candidate
 * are not the qualities that make a good examiner, and scoring everyone
 * against one generic list would measure nobody properly.
 */
export const PERFORMANCE_DIMENSIONS: Readonly<
  Record<Role, readonly PerformanceDimension[]>
> = Object.freeze({
  STUDENT: Object.freeze([
    {
      key: "judgement",
      name: "Judgement under pressure",
      description:
        "Reaches a defensible command decision when the evidence is incomplete and the clock is running.",
    },
    {
      key: "evidence",
      name: "Evidence discipline",
      description:
        "Asks for what would actually settle the question, and does not accept confidence as evidence.",
    },
    {
      key: "escalation",
      name: "Escalation timing",
      description:
        "Escalates before the consequence ceiling rather than after the fact.",
    },
    {
      key: "boundaries",
      name: "Boundary reasoning",
      description:
        "Distinguishes what an agent can do from what it is authorized to do, and says why.",
    },
    {
      key: "clarity",
      name: "Command clarity",
      description:
        "States the mission, the limits and the revocation path in terms another person can act on.",
    },
  ]),

  INSTRUCTOR: Object.freeze([
    {
      key: "consistency",
      name: "Marking consistency",
      description:
        "Comparable work receives comparable marks, across learners and over time.",
    },
    {
      key: "turnaround",
      name: "Turnaround",
      description:
        "Work is marked inside the agreed window; a queue is not allowed to age.",
    },
    {
      key: "feedback",
      name: "Quality of feedback",
      description:
        "A returned submission says what was wrong and what would fix it, not merely that it failed.",
    },
    {
      key: "doubt",
      name: "Escalation of doubt",
      description:
        "Raises a borderline or contested judgement rather than quietly resolving it alone.",
    },
    {
      key: "outcomes",
      name: "Learner outcomes",
      description:
        "Assigned learners progress — read alongside the cohort they were given, never as a raw pass rate.",
    },
  ]),

  MANAGER: Object.freeze([
    {
      key: "syllabus",
      name: "Syllabus quality",
      description:
        "Lessons, papers and badges are current, coherent and actually built rather than half-drafted.",
    },
    {
      key: "throughput",
      name: "Cohort throughput",
      description:
        "Candidates move through their cohorts, and those who stall are noticed.",
    },
    {
      key: "oversight",
      name: "Examiner oversight",
      description:
        "Every learner has an examiner, turnaround is watched, and reassignment happens before a queue rots.",
    },
    {
      key: "restriction",
      name: "Restriction hygiene",
      description:
        "What opens a track is deliberate, current, and explicable to a candidate who is locked out of it.",
    },
    {
      key: "responsiveness",
      name: "Responsiveness",
      description: "Acts on what the reports say rather than reading them.",
    },
  ]),

  /**
   * Nobody reviews the institution from inside it.
   *
   * An empty list rather than a missing key, so `dimensionsFor` never returns
   * undefined and a caller cannot accidentally score an administrator against
   * the manager's list.
   */
  ADMIN: Object.freeze([]),
});

export function dimensionsFor(role: Role): readonly PerformanceDimension[] {
  return PERFORMANCE_DIMENSIONS[role] ?? [];
}

export const PERFORMANCE_MAX_SCORE = 5;

/**
 * Who each role may write a review about.
 *
 * One rung down, and only one. Undefined for a role that reviews nobody.
 */
export const REVIEWS_ROLE: Readonly<Partial<Record<Role, Role>>> =
  Object.freeze({
    INSTRUCTOR: ROLES.STUDENT,
    MANAGER: ROLES.INSTRUCTOR,
    ADMIN: ROLES.MANAGER,
  });

export function mayReview(reviewer: Role, subject: Role): boolean {
  return REVIEWS_ROLE[reviewer] === subject;
}

export type PerformanceBand =
  "DEVELOPING" | "PROFICIENT" | "STRONG" | "EXEMPLARY";

/**
 * The bands, low to high — and green is at the *top*.
 *
 * The opposite of `AAI_BANDS`, and deliberately so: there, a high index means
 * a lot of authority concentrated in one agent and the top of the scale is the
 * alarming end. Here a high index means somebody is doing the job well.
 */
export const PERFORMANCE_BANDS: ReadonlyArray<{
  band: PerformanceBand;
  min: number;
  max: number;
  label: string;
  tone: "red" | "amber" | "blue" | "green";
}> = Object.freeze([
  {
    band: "DEVELOPING",
    min: 0,
    max: 39.99,
    label: "Developing",
    tone: "red",
  },
  {
    band: "PROFICIENT",
    min: 40,
    max: 64.99,
    label: "Proficient",
    tone: "amber",
  },
  { band: "STRONG", min: 65, max: 84.99, label: "Strong", tone: "blue" },
  {
    band: "EXEMPLARY",
    min: 85,
    max: 100,
    label: "Exemplary",
    tone: "green",
  },
]);

export function performanceBandFor(
  index: number,
): (typeof PERFORMANCE_BANDS)[number] {
  return (
    PERFORMANCE_BANDS.find((b) => index >= b.min && index <= b.max) ??
    PERFORMANCE_BANDS[0]
  );
}

/**
 * The index, on the same 0–100 shape as the AAI so the two read alike.
 *
 * Computed on the server from the scores, never accepted from a caller — the
 * same rule the diagnostic follows, and for the same reason.
 */
export function computePerformanceIndex(
  scores: readonly number[],
  dimensionCount: number,
): number {
  if (scores.length !== dimensionCount) {
    throw new Error(
      `Expected ${dimensionCount} scores, received ${scores.length}`,
    );
  }
  const total = scores.reduce((sum, score) => sum + score, 0);
  const max = dimensionCount * PERFORMANCE_MAX_SCORE;
  return Number(((100 * total) / max).toFixed(1));
}

/** A review is a draft until its author releases it to the person it is about. */
export type PerformanceStatus = "DRAFT" | "RELEASED";
