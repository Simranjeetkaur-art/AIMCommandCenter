/**
 * The AIM framework constants, shared by the API and the interface.
 *
 * These live in the contract package rather than in either app because the
 * server computes with them and the interface labels with them, and the two
 * must never drift. The AAI itself is computed on the server only -- the
 * formula is here so the interface can explain it, not so it can score.
 */

/** The eleven authority dimensions, in the order they are scored. */
export const AIM_DIMENSIONS: ReadonlyArray<{
  key: string;
  name: string;
  description: string;
}> = Object.freeze([
  {
    key: "decision",
    name: "Decision Autonomy",
    description: "Independence in consequential decision-making.",
  },
  {
    key: "action",
    name: "Action Authority",
    description: "Ability to execute rather than merely recommend.",
  },
  {
    key: "financial",
    name: "Financial Authority",
    description: "Ability to commit, authorize, or move money.",
  },
  {
    key: "data",
    name: "Data Authority",
    description: "Sensitivity and mutability of accessible data.",
  },
  {
    key: "tooling",
    name: "Tool & Infrastructure Access",
    description: "Consequential reach of connected tools and systems.",
  },
  {
    key: "delegation",
    name: "Delegation Depth",
    description: "Ability to instruct agents or delegate authority.",
  },
  {
    key: "velocity",
    name: "Execution Velocity",
    description: "Speed at which consequential actions propagate.",
  },
  {
    key: "scale",
    name: "Operational Scale",
    description: "Breadth of transactions, users, systems, or sites affected.",
  },
  {
    key: "severity",
    name: "Consequence Severity",
    description: "Maximum credible harm from an erroneous action.",
  },
  {
    key: "reversibility",
    name: "Reversibility",
    description: "Difficulty of undoing consequential actions.",
  },
  {
    key: "controlDeficit",
    name: "Human-Control Deficit",
    description: "Difficulty of meaningful human detection or intervention.",
  },
]);

export const AIM_SCORE_OPTIONS: readonly string[] = Object.freeze([
  "1 — Minimal / advisory only",
  "2 — Limited / narrow scope",
  "3 — Moderate / bounded execution",
  "4 — High / consequential authority",
  "5 — Very high / broad or difficult to contain",
]);

export const AIM_MAX_SCORE = 5;
export const AIM_DIMENSION_COUNT = 11;
/** 11 dimensions × 5 = 55 points maximum. */
export const AIM_MAX_TOTAL = AIM_DIMENSION_COUNT * AIM_MAX_SCORE;

export type AaiBand = "LOWER" | "MODERATE" | "ELEVATED" | "CRITICAL";

export const AAI_BANDS: ReadonlyArray<{
  band: AaiBand;
  min: number;
  max: number;
  label: string;
  /** What the band means, where the label alone would be read as a grade. */
  note: string;
  tone: "green" | "amber" | "orange" | "red";
}> = Object.freeze([
  {
    band: "LOWER",
    min: 0,
    max: 24.99,
    label: "Lower Autonomy Exposure",
    note: "Lower measured autonomy exposure. Governance controls and context still determine authorization.",
    tone: "green",
  },
  {
    band: "MODERATE",
    min: 25,
    max: 49.99,
    label: "Moderate Exposure",
    note: "Meaningful autonomy is present. Review authority concentrations and control coverage.",
    tone: "amber",
  },
  {
    band: "ELEVATED",
    min: 50,
    max: 74.99,
    label: "Elevated Exposure",
    note: "Material autonomy exposure. Strong gates, human-reserved powers, evidence, and tested revocation are important.",
    tone: "orange",
  },
  {
    band: "CRITICAL",
    min: 75,
    max: 100,
    label: "Critical Control Attention",
    note: "High autonomy concentration. Do not read this score as permission to deploy; require rigorous governance review.",
    tone: "red",
  },
]);

export function bandFor(aai: number): (typeof AAI_BANDS)[number] {
  return (
    AAI_BANDS.find((b) => aai >= b.min && aai <= b.max) ??
    AAI_BANDS[AAI_BANDS.length - 1]
  );
}

/**
 * The AAI. A comparison index, not deployment permission -- the prototype says
 * so on the diagnostic screen and it remains true here.
 */
export function computeAai(scores: readonly number[]): number {
  if (scores.length !== AIM_DIMENSION_COUNT) {
    throw new Error(
      `Expected ${AIM_DIMENSION_COUNT} scores, received ${scores.length}`,
    );
  }
  const total = scores.reduce((sum, score) => sum + score, 0);
  return Number(((100 * total) / AIM_MAX_TOTAL).toFixed(1));
}

/** The authority envelope: what an agent is actually authorized to do. */
export const AIM_ENVELOPE: ReadonlyArray<{
  key: string;
  name: string;
  defaultValue: string;
}> = Object.freeze([
  { key: "P", name: "P — Purpose", defaultValue: "Authorized mission only" },
  {
    key: "D",
    name: "D — Data",
    defaultValue: "Approved minimum-necessary data",
  },
  {
    key: "X",
    name: "X — Action",
    defaultValue: "Explicit allowed actions only",
  },
  {
    key: "F",
    name: "F — Financial",
    defaultValue: "Defined autonomous financial ceiling",
  },
  { key: "T", name: "T — Time", defaultValue: "Authority lease with expiry" },
  {
    key: "L",
    name: "L — Delegation",
    defaultValue: "No self-expansion or inherited authority",
  },
  {
    key: "S",
    name: "S — Systems",
    defaultValue: "Named systems through controlled adapters",
  },
  {
    key: "Q",
    name: "Q — Consequence",
    defaultValue: "Escalate before consequence ceiling",
  },
]);

/** A/G/H/X: what the agent may do alone, what is gated, what stays human. */
export const AIM_ACTION_CLASSES: ReadonlyArray<{
  key: string;
  name: string;
  example: string;
}> = Object.freeze([
  {
    key: "A",
    name: "Autonomous",
    example:
      "Match PO/invoice; duplicate detection; prepare action within approved limit.",
  },
  {
    key: "G",
    name: "Gated",
    example: "Threshold exception; new vendor; material anomaly.",
  },
  {
    key: "H",
    name: "Human Reserved",
    example: "Banking change; high-value commitment; override fraud warning.",
  },
  {
    key: "X",
    name: "Prohibited",
    example:
      "Self-expanding authority; disabling controls; concealing activity.",
  },
]);

/** Role baselines used to pre-fill a diagnostic for a known agent shape. */
export const AIM_ROLE_BASELINES: Readonly<Record<string, readonly number[]>> =
  Object.freeze({
    advisory: [1, 1, 1, 2, 1, 1, 2, 2, 2, 1, 1],
    finance: [3, 3, 3, 3, 3, 2, 3, 3, 4, 3, 3],
    procurement: [3, 3, 3, 3, 3, 2, 3, 3, 3, 3, 3],
    clinical: [3, 3, 1, 4, 3, 2, 3, 3, 5, 4, 3],
    cyber: [4, 4, 1, 4, 5, 3, 5, 4, 5, 4, 4],
    hr: [3, 3, 1, 4, 3, 2, 3, 3, 4, 4, 3],
    legal: [3, 3, 2, 4, 3, 2, 2, 3, 4, 4, 3],
    manufacturing: [4, 4, 3, 3, 4, 3, 4, 4, 5, 4, 4],
    infrastructure: [4, 4, 3, 3, 5, 3, 5, 5, 5, 4, 4],
    customer: [3, 3, 2, 3, 3, 2, 4, 4, 3, 3, 3],
    other: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
  });

/** The three certification tracks. */
export const AIM_TRACKS = {
  CP: "AIM-CP",
  CA: "AIM-CA",
  EL: "AIM-EL",
} as const;

export type AimTrack = (typeof AIM_TRACKS)[keyof typeof AIM_TRACKS];

export const AIM_TRACK_META: Readonly<
  Record<AimTrack, { title: string; subtitle: string }>
> = Object.freeze({
  "AIM-CP": {
    title: "AIM™ Certified Practitioner",
    subtitle: "Govern AI authority in practice.",
  },
  "AIM-CA": {
    title: "AIM™ Certified Architect",
    subtitle: "Architect enforceable authority boundaries.",
  },
  "AIM-EL": {
    title: "AIM™ Enterprise Leader",
    subtitle: "Govern machine authority at enterprise scale.",
  },
});

/** Every track assessment passes at 80%, as the prototype gates did. */
export const AIM_PASS_MARK = 80;

/**
 * What to change when a dimension scores high, aligned index-for-index with
 * AIM_DIMENSIONS. Rx ranks the dimensions by score and prescribes from here,
 * so the remedy names the specific authority that produced the exposure.
 */
export const AIM_CONTROL_MAP: ReadonlyArray<{
  dimension: string;
  fix: string;
  effect: string;
}> = Object.freeze([
  {
    dimension: "Decision Autonomy",
    fix: "Move consequential decisions behind explicit approval gates; allow autonomous recommendations only within pre-approved rules.",
    effect: "Reduces independent decision authority.",
  },
  {
    dimension: "Action Authority",
    fix: "Define enforceable A/G/H/X action boundaries and technically block prohibited actions.",
    effect: "Reduces what the agent can cause directly.",
  },
  {
    dimension: "Financial Authority",
    fix: "Set transaction and aggregate ceilings; require human or dual approval above thresholds; prohibit autonomous changes to payment destinations.",
    effect: "Reduces autonomous financial consequence.",
  },
  {
    dimension: "Data Authority",
    fix: "Apply minimum-necessary access, purpose restrictions, field-level controls, retention limits, and immutable access logging.",
    effect: "Reduces data reach and misuse exposure.",
  },
  {
    dimension: "Tool & Infrastructure Access",
    fix: "Use least-privilege service identities, segmented credentials, environment restrictions, and separate execution from administration.",
    effect: "Reduces system reach and blast radius.",
  },
  {
    dimension: "Delegation Depth",
    fix: "Prevent self-expansion of authority; restrict sub-agent creation and require inherited authority limits for every delegated task.",
    effect: "Reduces uncontrolled authority propagation.",
  },
  {
    dimension: "Execution Velocity",
    fix: "Add rate limits, transaction throttles, anomaly tripwires, cooling-off periods, and automatic pause conditions.",
    effect: "Creates time for detection and intervention.",
  },
  {
    dimension: "Operational Scale",
    fix: "Cap populations, accounts, systems, locations, or transactions per run; use staged rollout and bounded operating scopes.",
    effect: "Reduces maximum blast radius.",
  },
  {
    dimension: "Consequence Severity",
    fix: "Reserve irreversible or high-consequence actions for humans and require escalation before consequential execution.",
    effect: "Keeps the highest consequences outside autonomous control.",
  },
  {
    dimension: "Reversibility",
    fix: "Add rollback, transaction reversal, versioned state, recovery procedures, and safe reversion testing before production.",
    effect: "Improves recovery when an action is wrong.",
  },
  {
    dimension: "Human-Control Deficit",
    fix: "Install external revocation, independent monitoring, automatic tripwires, cessation verification, and a tested safe-state procedure.",
    effect: "Strengthens the human ability to stop the agent.",
  },
]);

/**
 * A track's place in the ladder, and what must be held before it opens.
 *
 * The prototype hard-coded each gate into its own render function. Here the
 * ladder is data, so the server can enforce it and the interface can draw it
 * from the same source.
 */
export interface TrackLadder {
  code: AimTrack;
  level: number;
  levelLabel: string;
  tagline: string;
  /** The credential that must be ACTIVE before training opens. */
  prerequisite: AimTrack | null;
  /** Feature flag that opens training without the prerequisite. */
  devAccessFlag: string;
  /** Chips on the track card. */
  stats: readonly string[];
  /**
   * The certification gate, in order. A step marked `optional` is part of the
   * journey and never a condition of the credential: the simulator is
   * practice for the graded papers, and the examiner-marked extras are
   * offered rather than required.
   */
  gate: readonly Readonly<{
    label: string;
    requirement: "PREREQUISITE" | "LESSONS" | "ASSESSMENT" | "CREDENTIAL";
    assessmentCode?: string;
    optional?: boolean;
  }>[];
}

export const AIM_LADDER: Readonly<Record<AimTrack, TrackLadder>> =
  Object.freeze({
    "AIM-CP": {
      code: "AIM-CP",
      level: 1,
      levelLabel: "LEVEL 1",
      tagline:
        "Foundation certification for professionals who assess and govern AI authority using AIM™.",
      prerequisite: null,
      devAccessFlag: "tracks.cp.devAccess",
      stats: ["10 Modules", "10 Questions / Module", "80% Passing"],
      gate: [
        { label: "10 Command Modules", requirement: "LESSONS" },
        {
          label: "Final Exam",
          requirement: "ASSESSMENT",
          assessmentCode: "CP-EXAM",
        },
        { label: "AIM-CP™", requirement: "CREDENTIAL" },
        {
          label: "100-Mission Command Simulator — practice",
          requirement: "ASSESSMENT",
          assessmentCode: "CP-SIM",
          optional: true,
        },
        {
          label: "Practical Dx / Rx — optional",
          requirement: "ASSESSMENT",
          assessmentCode: "CP-PRACTICAL",
          optional: true,
        },
        {
          label: "Commander Check Ride — optional",
          requirement: "ASSESSMENT",
          assessmentCode: "CP-CHECKRIDE",
          optional: true,
        },
      ],
    },
    "AIM-CA": {
      code: "AIM-CA",
      level: 2,
      levelLabel: "LEVEL 2",
      tagline:
        "Advanced certification for designing bounded authority and enforceable AI control planes.",
      prerequisite: "AIM-CP",
      devAccessFlag: "tracks.ca.devAccess",
      stats: ["Advanced", "Requires AIM-CP™"],
      gate: [
        { label: "AIM-CP™", requirement: "PREREQUISITE" },
        { label: "10 Architecture Modules", requirement: "LESSONS" },
        {
          label: "Architecture Exam",
          requirement: "ASSESSMENT",
          assessmentCode: "CA-EXAM",
        },
        { label: "AIM-CA™", requirement: "CREDENTIAL" },
        {
          label: "Advanced Simulator — practice",
          requirement: "ASSESSMENT",
          assessmentCode: "CA-SIM",
          optional: true,
        },
        {
          label: "Design Practical — optional",
          requirement: "ASSESSMENT",
          assessmentCode: "CA-PRACTICAL",
          optional: true,
        },
        {
          label: "Architecture Defence — optional",
          requirement: "ASSESSMENT",
          assessmentCode: "CA-DEFENCE",
          optional: true,
        },
      ],
    },
    "AIM-EL": {
      code: "AIM-EL",
      level: 3,
      levelLabel: "LEVEL 3",
      tagline:
        "Executive certification for governing enterprise AI workforces and human-reserved powers.",
      prerequisite: "AIM-CA",
      devAccessFlag: "tracks.el.devAccess",
      stats: ["Executive", "Enterprise"],
      gate: [
        { label: "AIM-CA™ prerequisite", requirement: "PREREQUISITE" },
        { label: "10 Executive Modules", requirement: "LESSONS" },
        {
          label: "Executive Exam",
          requirement: "ASSESSMENT",
          assessmentCode: "EL-EXAM",
        },
        { label: "AIM-EL™", requirement: "CREDENTIAL" },
        {
          label: "Enterprise Crisis Simulation — practice",
          requirement: "ASSESSMENT",
          assessmentCode: "EL-CRISIS",
          optional: true,
        },
        {
          label: "Governance Capstone — optional",
          requirement: "ASSESSMENT",
          assessmentCode: "EL-CAPSTONE",
          optional: true,
        },
        {
          label: "Executive Defence — optional",
          requirement: "ASSESSMENT",
          assessmentCode: "EL-DEFENCE",
          optional: true,
        },
      ],
    },
  });

/** Badge conditions an author can choose from. Evaluated on the server. */
export const BADGE_CRITERIA_TYPES = {
  ASSESSMENT_PASSED: "ASSESSMENT_PASSED",
  ASSESSMENT_SCORE: "ASSESSMENT_SCORE",
  MODULES_COMPLETED: "MODULES_COMPLETED",
  TRACK_COMPLETE: "TRACK_COMPLETE",
  CREDENTIAL_HELD: "CREDENTIAL_HELD",
  DIAGNOSTICS_RUN: "DIAGNOSTICS_RUN",
  /** N modules of a given ladder level, across whichever track sits there. */
  LEVEL_MODULES_COMPLETED: "LEVEL_MODULES_COMPLETED",
  /** Every requirement of a ladder level cleared. */
  LEVEL_COMPLETE: "LEVEL_COMPLETE",
  /** A named assessment kind passed, e.g. the 100-mission simulator. */
  ASSESSMENT_KIND_PASSED: "ASSESSMENT_KIND_PASSED",
  /** N badges already held: a badge for collecting badges. */
  BADGES_HELD: "BADGES_HELD",
  /** No automatic condition: an examiner decides, and says why. */
  MANUAL: "MANUAL",
} as const;

export type BadgeCriteriaType =
  (typeof BADGE_CRITERIA_TYPES)[keyof typeof BADGE_CRITERIA_TYPES];

export interface BadgeCriteria {
  type: BadgeCriteriaType;
  /** Ladder level, for the LEVEL_* conditions. */
  level?: number;
  /** Assessment kind, for ASSESSMENT_KIND_PASSED. */
  assessmentKind?: string;
  /** Assessment code, e.g. 'CA-EXAM'. */
  assessmentCode?: string;
  /** Track code, e.g. 'AIM-CP'. */
  programmeCode?: string;
  /** Threshold for ASSESSMENT_SCORE, MODULES_COMPLETED or DIAGNOSTICS_RUN. */
  threshold?: number;
}

export const BADGE_CRITERIA_LABELS: Readonly<
  Record<BadgeCriteriaType, string>
> = Object.freeze({
  ASSESSMENT_PASSED: "Passes a named assessment",
  ASSESSMENT_SCORE: "Scores at least N% on a named assessment",
  MODULES_COMPLETED: "Completes N modules of a track",
  TRACK_COMPLETE: "Completes every module and assessment of a track",
  CREDENTIAL_HELD: "Holds an active credential for a track",
  DIAGNOSTICS_RUN: "Runs at least N authority diagnostics",
  LEVEL_MODULES_COMPLETED: "Completes N modules at a given level",
  LEVEL_COMPLETE: "Completes every requirement of a level",
  ASSESSMENT_KIND_PASSED: "Passes an assessment of a given kind",
  BADGES_HELD: "Holds at least N other badges",
  MANUAL: "Awarded by an instructor, with a stated reason",
});

/**
 * A lesson as structure rather than markup.
 *
 * The prototype's lessons were HTML strings built inside render functions, so
 * the only way to change a sentence was to edit JavaScript. Modelling the same
 * shape as data makes every one of them editable in the authoring screens, and
 * lets the interface render them consistently instead of trusting markup.
 */
export type LessonBlockKind =
  | "KEY_INSIGHT"
  | "CASE"
  | "RULE"
  | "FORMULA"
  | "PRACTICE"
  | "LIST"
  | "TERMS"
  | "REFERENCE"
  | "LINK"
  | "EXAMPLE"
  | "NOTE";

export const LESSON_BLOCK_LABELS: Readonly<Record<LessonBlockKind, string>> =
  Object.freeze({
    KEY_INSIGHT: "Key insight",
    CASE: "Case",
    RULE: "Command rule",
    FORMULA: "Formula",
    PRACTICE: "Command practice",
    LIST: "List",
    TERMS: "Key terms",
    REFERENCE: "Reference",
    LINK: "Link",
    EXAMPLE: "Example",
    NOTE: "Note",
  });

/** A term and what it means, for a TERMS block. */
export interface LessonTerm {
  term: string;
  definition: string;
}

export interface LessonBlock {
  kind: LessonBlockKind;
  title?: string;
  body?: string;
  items?: string[];
  /** TERMS: the definitions this section introduces. */
  terms?: LessonTerm[];
  /** LINK and REFERENCE: where to go, and what to call it. */
  url?: string;
  label?: string;
}

export interface LessonSection {
  /** "1", "2" ... or absent for an unnumbered section. */
  number?: string;
  heading: string;
  paragraphs: string[];
  blocks?: LessonBlock[];
}

export interface LessonContent {
  /** "AIM-EL™ · AEL-101" */
  eyebrow?: string;
  heading?: string;
  /** LEARN → EXECUTIVE CASE → KEY INSIGHT → LEADERSHIP DECISION → ASSESSMENT */
  path?: string[];
  lead?: string;
  /**
   * The three figures every module header carries, each named.
   *
   * These were one free-text list of chips, which meant the editor could only
   * offer "type three lines" and nothing could ask a lesson how long it takes.
   * They are strings rather than numbers because "20–25 min" and "80% (8/10)"
   * are what the header actually says.
   */
  readingTime?: string;
  questionCount?: string;
  passMark?: string;
  /** Any further chip beyond those three. */
  stats?: string[];
  overview?: string;
  objectivesIntro?: string;
  objectives?: string[];
  sections: LessonSection[];
}

/**
 * The header chips, in the order a reader meets them.
 *
 * Kept here rather than in the renderer so the editor's preview and the
 * candidate's page cannot drift apart about what a header shows.
 */
export function lessonChips(content: LessonContent): string[] {
  return [
    content.readingTime,
    content.questionCount,
    content.passMark,
    ...(content.stats ?? []),
  ]
    .map((chip) => (chip ?? "").trim())
    .filter(Boolean);
}

export const EMPTY_LESSON_CONTENT: LessonContent = Object.freeze({
  sections: [],
});

/** True when there is enough here to render a lesson. */
export function hasLessonContent(content: unknown): content is LessonContent {
  if (!content || typeof content !== "object") return false;
  const c = content as LessonContent;
  return (
    Array.isArray(c.sections) &&
    (c.sections.length > 0 ||
      Boolean(c.overview) ||
      (c.objectives?.length ?? 0) > 0)
  );
}
