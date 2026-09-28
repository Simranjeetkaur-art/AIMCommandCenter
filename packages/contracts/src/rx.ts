/**
 * AIM(tm) Rx: from a diagnosis to a prescription.
 *
 * Rx is derived, never authored. Everything here is a pure function of the
 * eleven scores and the three facts about the agent, so the evaluation a
 * reader sees and the prescription the server stored cannot say different
 * things about the same diagnostic.
 *
 * The rules are the prototype's: the same ranking, the same band-scaled
 * remedy set, the same domain-aware boundaries. They live in the contract
 * package because the API computes with them and the interface explains
 * them, and those two must not drift.
 */

import {
  AIM_ACTION_CLASSES,
  AIM_CONTROL_MAP,
  AIM_DIMENSIONS,
  bandFor,
} from "./aim";

/** The three facts a diagnostic records about the agent it scored. */
export interface RxAgent {
  name: string;
  owner: string;
  purpose: string;
}

/**
 * What the agent's purpose makes consequential.
 *
 * A prescription that cannot say "vendor banking changes" to a payables agent
 * and "medication changes" to a clinical one is giving general advice, which
 * is the one thing Rx is not for.
 */
export interface RxContext {
  /** Domain slug, which also picks the boundary pack. */
  domain: string;
  /** What the agent's actions act on. */
  noun: string;
  /** What must stay with a human in this domain. */
  human: string;
}

export type RxSeverity = "Critical" | "High" | "Moderate" | "Lower";

const DOMAIN_PATTERNS: ReadonlyArray<{ test: RegExp; context: RxContext }> =
  Object.freeze([
    {
      test: /payable|invoice|payment|vendor|procure|purchase|financial|finance|account/,
      context: {
        domain: "financial",
        noun: "financial transactions",
        human:
          "material payments, vendor banking changes, exceptions, and release of funds",
      },
    },
    {
      // "diagnos" alone matched "diagnostic", the word every AIM Dx run uses
      // about itself, so any agent named "... diagnostic" read as clinical.
      test: /clinical|patient|medical|health|diagnos(?!tic)|treatment|medication/,
      context: {
        domain: "healthcare",
        noun: "patient or clinical actions",
        human:
          "diagnosis/treatment decisions, medication changes, and other high-consequence clinical actions",
      },
    },
    {
      test: /cyber|security|incident|firewall|credential|network|endpoint/,
      context: {
        domain: "cybersecurity",
        noun: "security and infrastructure actions",
        human:
          "destructive containment, privileged credential changes, production shutdowns, and irreversible security actions",
      },
    },
    {
      test: /manufactur|production|plant|robot|physical|machine|warehouse|distribution/,
      context: {
        domain: "physical operations",
        noun: "physical or production actions",
        human:
          "safety overrides, irreversible physical actions, and material production exceptions",
      },
    },
    {
      test: /human resource|hiring|employee|workforce|termination|candidate/,
      context: {
        domain: "workforce",
        noun: "workforce decisions",
        human:
          "hiring, termination, compensation exceptions, and other consequential employment decisions",
      },
    },
    {
      test: /legal|contract|agreement|compliance/,
      context: {
        domain: "legal",
        noun: "legal or contractual actions",
        human:
          "binding commitments, legal exceptions, waivers, and final contractual approval",
      },
    },
    {
      test: /customer|commerce|sales|refund|order/,
      context: {
        domain: "commerce",
        noun: "customer and commercial actions",
        human:
          "material refunds, pricing exceptions, binding commitments, and high-impact customer actions",
      },
    },
  ]);

const GENERIC_CONTEXT: RxContext = Object.freeze({
  domain: "enterprise",
  noun: "real-world actions",
  human:
    "irreversible, high-consequence, exceptional, or authority-expanding actions",
});

/** Reads the agent's name and purpose for what it is actually doing. */
export function purposeContext(agent: RxAgent): RxContext {
  const text = `${agent.name} ${agent.purpose}`.toLowerCase();
  return (
    DOMAIN_PATTERNS.find((entry) => entry.test.test(text))?.context ??
    GENERIC_CONTEXT
  );
}

export function severityFor(score: number): RxSeverity {
  if (score >= 5) return "Critical";
  if (score === 4) return "High";
  if (score === 3) return "Moderate";
  return "Lower";
}

/**
 * Where a dimension should end up once the change is really made.
 *
 * Rx never subtracts from the recorded AAI. This is the score the agent
 * should earn when it is scored again, not a discount on the one it holds.
 */
export function targetScoreFor(score: number, aai: number): number {
  if (score >= 5) return aai >= 75 ? 2 : 3;
  if (score === 4) return 2;
  if (score === 3) return 2;
  return Math.max(1, score);
}

/** Why a dimension scoring high is a governance concern. */
const DRIVER_EXPLANATION: Readonly<Record<string, string>> = Object.freeze({
  decision:
    "The agent can make material decisions with limited human intervention.",
  action:
    "The agent can translate decisions into real-world actions rather than only recommendations.",
  financial:
    "The agent can create, approve, commit, move, or influence financial value.",
  data: "The agent can access or use sensitive, broad, or consequential data.",
  tooling:
    "The agent has access to systems or tools that can materially affect operations.",
  delegation:
    "The agent can delegate work or propagate authority to other agents or processes.",
  velocity:
    "The agent can act faster than ordinary human review and intervention cycles.",
  scale:
    "A single agent decision can affect a broad population, workload, system, or operating scope.",
  severity:
    "A wrong or manipulated action could create material operational, financial, legal, safety, or stakeholder consequences.",
  reversibility:
    "Actions may be difficult, slow, costly, or impossible to reverse after execution.",
  controlDeficit:
    "Human intervention may occur too late, or revocation may not be sufficiently independent of the agent.",
});

/** The same eleven powers as clauses, for the combination sentence. */
const COMBINATION_CLAUSE: Readonly<Record<string, string>> = Object.freeze({
  decision: "the agent can decide with limited human intervention",
  action: "it can convert decisions into real-world execution",
  financial: "it can create or influence financial consequences",
  data: "it has broad or consequential data access",
  tooling: "it can reach operational systems and tools",
  delegation: "it can propagate work or authority to other agents or processes",
  velocity: "it can act faster than ordinary human review cycles",
  scale: "one decision can affect a broad operating scope",
  severity: "a wrong action can produce material consequences",
  reversibility: "completed actions may be difficult to reverse",
  controlDeficit: "human intervention or revocation may occur too late",
});

/** What management should do about each dimension, when it is in play. */
function managementAction(key: string, context: RxContext): string {
  switch (key) {
    case "decision":
      return "separate analysis and recommendations from consequential final decisions";
    case "action":
      return "move consequential real-world actions into gated or human-reserved execution paths";
    case "financial":
      return "place material financial commitments, payment release, exceptions, and payment-destination changes behind enforceable human approval";
    case "data":
      return "reduce data access to the minimum fields, records, purposes, and retention period required";
    case "tooling":
      return "separate privileged credentials and restrict production and tool access using least privilege";
    case "delegation":
      return "prevent the agent from expanding its own authority or delegating authority it does not possess";
    case "velocity":
      return "add rate limits, anomaly tripwires, and automatic pause conditions so humans have time to intervene";
    case "scale":
      return "cap the number of transactions, systems, users, locations, or records affected per operating cycle";
    case "severity":
      return `reserve ${context.human} for authorized humans`;
    case "reversibility":
      return "require rollback, reversal, recovery, and safe-reversion mechanisms before autonomous execution";
    case "controlDeficit":
      return "install external revocation, independent monitoring, cessation verification, and a tested safe-state procedure";
    default:
      return "";
  }
}

/** The purpose-specific sentence appended to a generic control change. */
function remedyNote(key: string, agent: RxAgent, context: RxContext): string {
  switch (key) {
    case "financial":
      return context.domain === "financial"
        ? "For this financial agent, separate invoice and recommendation work from release of funds, and reserve material payment exceptions and banking changes for humans."
        : "";
    case "data":
      return `Limit data to what is necessary for ${quoted(agent.purpose)}; remove broad datasets, write privileges, or records the agent does not need.`;
    case "decision":
      return `Keep routine decisions inside explicit rules for ${quoted(agent.purpose)}; move consequential exceptions to human approval.`;
    case "action":
      return "Convert consequential execution into a gated action rather than allowing direct autonomous completion.";
    case "tooling":
      return `Remove administrative or production privileges that are not essential to ${quoted(agent.purpose)}, and separate execution credentials from privileged credentials.`;
    case "velocity":
      return "Slow consequential execution with rate limits and pause conditions so humans have time to intervene.";
    case "scale":
      return "Reduce the transactions, systems, users, locations, or records one autonomous run can affect.";
    case "severity":
      return `Reserve ${context.human} for authorized humans and keep the agent in analysis, preparation, or bounded execution roles.`;
    case "reversibility":
      return "Redesign execution so material actions can be reversed, rolled back, or safely restored before granting autonomy.";
    case "controlDeficit":
      return "Make shutdown external to the agent, independently monitored, verifiable, and tested under failure conditions.";
    case "delegation":
      return "Prevent self-created sub-agents or delegated authority beyond the original approved envelope.";
    default:
      return "";
  }
}

/** The authorized purpose reads as a quotation wherever it is inlined. */
function quoted(text: string): string {
  return `“${text}”`;
}

function remedyLead(score: number): string {
  if (score >= 5) return "Immediate architecture change recommended.";
  if (score === 4) return "High-priority authority reduction recommended.";
  if (score === 3) return "Bound or gate this authority before expansion.";
  return "Maintain the current bounded authority.";
}

// -- ranking ---------------------------------------------------------------

/** One dimension, as scored, with everything a remedy needs about it. */
export interface RxRanked {
  /** Position in AIM_DIMENSIONS, so the control map lines up. */
  index: number;
  key: string;
  dimension: string;
  score: number;
  severity: RxSeverity;
  fix: string;
  effect: string;
}

/** Highest first, ties broken by dimension order rather than by chance. */
export function rankDimensions(scores: readonly number[]): RxRanked[] {
  return scores
    .map((score, index) => ({
      index,
      key: AIM_DIMENSIONS[index]?.key ?? String(index),
      dimension: AIM_DIMENSIONS[index]?.name ?? `Dimension ${index + 1}`,
      score,
      severity: severityFor(score),
      fix: AIM_CONTROL_MAP[index]?.fix ?? "",
      effect: AIM_CONTROL_MAP[index]?.effect ?? "",
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
}

// -- 1. situation analysis --------------------------------------------------

export interface RxSituation {
  /** The top three, as "Name (4/5)". */
  concentrations: string[];
  /** Why the combination, rather than any one power, is the concern. */
  combination: string;
  /** The band read as a management position. */
  interpretation: string;
  /** What management should do, at most five, in dimension order. */
  actions: string[];
  /** Who stays accountable for the authorized envelope. */
  accountable: string;
}

function buildSituation(
  agent: RxAgent,
  aai: number,
  scores: readonly number[],
  ranked: readonly RxRanked[],
  context: RxContext,
): RxSituation {
  const top = ranked.slice(0, 3);
  const clauses = AIM_DIMENSIONS.map((dim) =>
    top.some((t) => t.key === dim.key) ? COMBINATION_CLAUSE[dim.key] : "",
  ).filter(Boolean);

  const combination = `${
    clauses.length > 0
      ? clauses.join("; ")
      : "multiple forms of authority are concentrated in the same agent"
  }. In this ${context.domain} context, that concentration can directly affect ${context.noun}.`;

  const interpretation =
    aai >= 75
      ? `This profile requires critical control attention. ${agent.name} should be treated as a consequential autonomous system, not as a simple productivity tool.`
      : aai >= 50
        ? `This profile has elevated autonomy exposure. ${agent.name} can provide useful automation, but its consequential authority should be reduced, gated, or reserved before broader autonomous operation.`
        : aai >= 25
          ? "This profile has moderate autonomy exposure. The higher-scoring authority dimensions should receive explicit limits and human gates before the agent's scope expands."
          : "This profile has lower autonomy exposure relative to more autonomous agents. That does not make the agent automatically safe or approved: its purpose, permissions, logging, revocation, and human-reserved powers should still be explicit.";

  // A dimension earns a management action by placing in the top three or by
  // scoring 4 and over. A high score matters whether or not it placed.
  const actions = AIM_DIMENSIONS.map((dim, i) =>
    top.some((t) => t.key === dim.key) || (scores[i] ?? 0) >= 4
      ? managementAction(dim.key, context)
      : "",
  )
    .filter(Boolean)
    .slice(0, 5);

  return {
    concentrations: top.map((t) => `${t.dimension} (${t.score}/5)`),
    combination,
    interpretation,
    actions,
    accountable: agent.owner,
  };
}

// -- 2. exposure drivers ----------------------------------------------------

export interface RxDriver {
  rank: number;
  key: string;
  dimension: string;
  score: number;
  severity: RxSeverity;
  explanation: string;
  /** Why it matters, from the control map. */
  effect: string;
}

function buildDrivers(ranked: readonly RxRanked[]): RxDriver[] {
  return ranked.slice(0, 3).map((r, i) => ({
    rank: i + 1,
    key: r.key,
    dimension: r.dimension,
    score: r.score,
    severity: r.severity,
    explanation: DRIVER_EXPLANATION[r.key] ?? "",
    effect: r.effect,
  }));
}

// -- 3. the remedy ----------------------------------------------------------

/** One prescribed change. P1 first. */
export interface RxControl {
  rank: number;
  key: string;
  dimension: string;
  score: number;
  severity: RxSeverity;
  /** How urgent the change is, in one sentence. */
  lead: string;
  /** The generic control change for this dimension. */
  fix: string;
  /** The same change said for this agent's purpose. May be empty. */
  note: string;
  effect: string;
  /** The score this dimension should earn once the change is real. */
  target: number;
}

/**
 * How many priorities this agent gets.
 *
 * A critical profile that returns two priorities is not a prescription, and a
 * lower-exposure profile with seven is noise, so the set is scaled by band.
 */
export function remedySetFor(
  ranked: readonly RxRanked[],
  aai: number,
): RxRanked[] {
  const material = [
    ...ranked.filter((r) => r.score >= 5),
    ...ranked.filter((r) => r.score === 4),
    ...ranked.filter((r) => r.score === 3),
  ];

  let set: RxRanked[];
  if (aai >= 75) set = material.slice(0, 7);
  else if (aai >= 50) set = material.slice(0, 5);
  else if (aai >= 25) set = material.slice(0, 3);
  else set = ranked.filter((r) => r.score >= 2).slice(0, 2);

  // Something is always prescribed: an agent with no material concentration
  // still has a highest dimension, and that is where attention belongs.
  return set.length > 0 ? set : ranked.slice(0, 1);
}

function buildControls(
  agent: RxAgent,
  aai: number,
  ranked: readonly RxRanked[],
  context: RxContext,
): RxControl[] {
  return remedySetFor(ranked, aai).map((r, i) => ({
    rank: i + 1,
    key: r.key,
    dimension: r.dimension,
    score: r.score,
    severity: r.severity,
    lead: remedyLead(r.score),
    fix: r.fix,
    note: remedyNote(r.key, agent, context),
    effect: r.effect,
    target: targetScoreFor(r.score, aai),
  }));
}

// -- 4. modification specification -----------------------------------------

export interface RxModification {
  /** Where the agent's authority sits now. */
  current: string;
  /** Where it should sit once the prescription is implemented. */
  target: string;
  /** What has to change, for the teams who will change it. */
  requirements: Array<{ dimension: string; fix: string }>;
}

function buildModification(
  agent: RxAgent,
  ranked: readonly RxRanked[],
  controls: readonly RxControl[],
): RxModification {
  const top = ranked.slice(0, 3).map((r) => r.dimension);
  return {
    current: `The agent currently carries its assessed authority across ${top.join(", ")}.`,
    target: `Keep autonomous operation only inside the minimum authority needed for ${quoted(agent.purpose)}. Consequential actions should be gated or human-reserved; prohibited actions should be technically blocked.`,
    requirements: controls
      .slice(0, 6)
      .map((c) => ({ dimension: c.dimension, fix: c.fix })),
  };
}

// -- 5. A/G/H/X -------------------------------------------------------------

export type RxActionClassKey = "A" | "G" | "H" | "X";

export interface RxActionClass {
  key: RxActionClassKey;
  name: string;
  intro: string;
  items: string[];
}

const CLASS_INTRO: Readonly<Record<RxActionClassKey, string>> = Object.freeze({
  A: "May operate without case-by-case human approval, and only when every applicable AIM™ limit is satisfied.",
  G: "May proceed only after the defined authorization, threshold, or control gate is satisfied.",
  H: "Must remain under explicit authorized human decision or approval.",
  X: "The agent must not perform these actions, and the restriction should be technically enforceable.",
});

/** One boundary pack per domain, keyed by the context's domain slug. */
const DOMAIN_BOUNDARIES: Readonly<
  Record<string, Record<RxActionClassKey, string>>
> = Object.freeze({
  financial: {
    A: "invoice review, PO and receipt matching, discrepancy detection, duplicate checks, and preparation of payment recommendations within approved rules",
    G: "payment execution within approved ceilings, new-vendor activation, unusual transactions, and invoice or payment exceptions",
    H: "large payment approval, release of material funds, vendor banking changes, approval-limit changes, and material financial exceptions",
    X: "unauthorized payment-destination changes, creation of hidden vendors, splitting transactions to evade thresholds, or releasing funds outside approved authority",
  },
  healthcare: {
    A: "record summarization, administrative follow-up, bounded monitoring, and non-consequential clinical workflow support",
    G: "recommendations that may influence diagnosis, treatment, medication, scheduling priority, or patient disposition",
    H: "final diagnosis and treatment decisions, medication changes, emergency exceptions, and other high-consequence clinical actions",
    X: "autonomous treatment outside approved protocols, concealment of uncertainty, alteration of clinical evidence, or bypass of required clinician review",
  },
  cybersecurity: {
    A: "log analysis, alert correlation, evidence collection, bounded scanning, and preparation of response recommendations",
    G: "account isolation, firewall or rule changes, service interruption, credential resets, or production containment actions",
    H: "destructive containment, privileged credential changes, production shutdowns, restoration decisions, and irreversible security actions",
    X: "disabling security monitoring, deleting forensic evidence, expanding its own privilege, or blocking authorized human access and revocation",
  },
  "physical operations": {
    A: "planning, monitoring, optimization recommendations, inventory analysis, and reversible actions inside deterministic operating limits",
    G: "production schedule changes, equipment commands, routing changes, or physical actions approaching safety or quality thresholds",
    H: "safety overrides, shutdown and restart decisions, irreversible physical actions, and material production exceptions",
    X: "bypassing safety interlocks, modifying safety limits, concealing equipment alarms, or overriding emergency human control",
  },
  workforce: {
    A: "administrative screening support, scheduling, document checks, and policy-consistent recommendations",
    G: "candidate ranking, compensation recommendations, performance flags, or actions materially affecting an employee or candidate",
    H: "hiring, termination, discipline, compensation exceptions, and final consequential employment decisions",
    X: "autonomous discriminatory filtering, retaliation, concealment of decision evidence, or employment action outside authorized policy",
  },
  legal: {
    A: "document review, clause extraction, comparison, drafting, obligation tracking, and non-binding recommendations",
    G: "contract changes, exception clauses, compliance dispositions, or communications that may create material reliance",
    H: "binding commitments, waivers, settlements, legal exceptions, and final contractual approval",
    X: "executing unauthorized agreements, concealing material clauses, altering evidence, or representing unauthorized legal authority",
  },
  commerce: {
    A: "routine customer responses, order-status actions, recommendations, and bounded service recovery within approved limits",
    G: "refunds, credits, pricing exceptions, account restrictions, or commitments above normal service limits",
    H: "material refunds, pricing exceptions, binding commitments, account termination, and high-impact customer actions",
    X: "unauthorized financial commitments, deceptive representations, bypassing customer protections, or altering its own commercial limits",
  },
});

/**
 * The boundaries this agent should operate under.
 *
 * Three things decide them: the baseline every agent carries, the domain its
 * purpose puts it in, and the dimensions it actually scored high on. A
 * boundary set identical for every agent would not be a prescription.
 */
export function buildActionClasses(
  agent: RxAgent,
  scores: readonly number[],
  context: RxContext,
): RxActionClass[] {
  const A: string[] = [];
  const G: string[] = [];
  const H: string[] = [];
  const X: string[] = [];
  const high = (i: number) => (scores[i] ?? 0) >= 4;
  const critical = (i: number) => (scores[i] ?? 0) >= 5;

  A.push(
    `analysis, monitoring, drafting, validation, and reversible work that stays strictly inside the authorized purpose ${quoted(agent.purpose)}`,
  );
  G.push(
    "exceptions, threshold crossings, or actions that materially change an external state",
  );
  H.push(
    "approval of authority expansion, policy exceptions, and irreversible or high-consequence decisions",
  );
  X.push(
    "self-expansion of authority, bypassing approval gates, disabling monitoring, altering audit evidence, or interfering with human revocation",
  );

  const pack = DOMAIN_BOUNDARIES[context.domain];
  if (pack) {
    A.push(pack.A);
    G.push(pack.G);
    H.push(pack.H);
    X.push(pack.X);
  }

  if (high(0))
    G.push(
      "consequential decisions that would otherwise be made without prior human review",
    );
  if (high(1))
    G.push("direct real-world execution with material external effect");
  if (high(2))
    H.push("financial commitments above the approved autonomous ceiling");
  if (high(3))
    G.push(
      "access to sensitive or broad datasets beyond minimum-necessary use",
    );
  if (high(4))
    H.push(
      "administrative, privileged, or production-system access not essential to routine execution",
    );
  if (high(5))
    X.push(
      "creation of sub-agents or delegation beyond the original Authority Envelope",
    );
  if (high(6))
    G.push(
      "high-velocity or bulk execution until rate limits and tripwires authorize continuation",
    );
  if (high(7))
    G.push(
      "actions exceeding the approved population, transaction, system, or geographic scope",
    );
  if (high(8))
    H.push(
      `the highest-consequence ${context.noun}, and any exception capable of material harm`,
    );
  if (high(9))
    H.push(
      "actions that cannot be reliably reversed, rolled back, or safely restored",
    );
  if (high(10))
    X.push(
      "any action that disables, delays, circumvents, or makes human shutdown dependent on the agent itself",
    );

  if (critical(2))
    X.push(
      "autonomous financial activity above the explicitly authorized hard ceiling",
    );
  if (critical(4))
    X.push(
      "use of unapproved privileged credentials, or lateral movement into systems outside the authorized scope",
    );
  if (critical(8))
    X.push(
      "autonomous execution of prohibited catastrophic or irreversibly harmful actions",
    );
  if (critical(10))
    X.push(
      "modification of external kill switches, tripwires, cessation verification, or safe-state controls",
    );

  const items: Record<RxActionClassKey, string[]> = { A, G, H, X };
  return (["A", "G", "H", "X"] as const).map((key) => ({
    key,
    name: AIM_ACTION_CLASSES.find((k) => k.key === key)?.name ?? key,
    intro: CLASS_INTRO[key],
    items: [...new Set(items[key])],
  }));
}

// -- the whole evaluation ---------------------------------------------------

export interface RxEvaluation {
  agent: RxAgent;
  aai: number;
  bandLabel: string;
  context: RxContext;
  /** One line stating what was scored and what it means. */
  summary: string;
  situation: RxSituation;
  drivers: RxDriver[];
  /** The objective of the prescription, before the priorities. */
  remedyObjective: string;
  /** Which changes come first, and where they have to be made. */
  remedyFocus: string;
  controls: RxControl[];
  modification: RxModification;
  actionClasses: RxActionClass[];
}

/**
 * Everything Rx says about one diagnostic.
 *
 * Deterministic: the same eleven scores and the same three facts always
 * produce the same evaluation, which is what lets the server store it and the
 * interface re-derive it without the two disagreeing.
 */
export function buildRx(input: {
  agent: RxAgent;
  aai: number;
  scores: readonly number[];
}): RxEvaluation {
  const { agent, aai, scores } = input;
  const context = purposeContext(agent);
  const ranked = rankDimensions(scores);
  const bandLabel = bandFor(aai).label;
  const controls = buildControls(agent, aai, ranked, context);

  const summary =
    `${agent.name} was assessed for the authorized purpose ${quoted(agent.purpose)}. ` +
    `The Dx result is ${aai}/100 (${bandLabel}). ` +
    "The prescription below changes the agent's actual authority architecture rather than administratively lowering the score.";

  const remedyObjective =
    "Reduce the agent's actual ability to create uncontrolled consequence while preserving useful automation. " +
    "The highest-value changes are to remove authority the agent does not need, gate consequential authority that must remain, and make human revocation external and enforceable. " +
    "The priority list below is generated from this score profile; its number, order, and recommended changes vary with the agent.";

  const remedyFocus =
    `For ${agent.name}, AIM™ Rx recommends addressing ${controls
      .slice(0, 3)
      .map((c) => c.dimension)
      .join(", ")} first. ` +
    "These changes belong in the agent's permissions, workflow, credentials, transaction rules, orchestration layer, or surrounding control plane, not merely in policy.";

  return {
    agent,
    aai,
    bandLabel,
    context,
    summary,
    situation: buildSituation(agent, aai, scores, ranked, context),
    drivers: buildDrivers(ranked),
    remedyObjective,
    remedyFocus,
    controls,
    modification: buildModification(agent, ranked, controls),
    actionClasses: buildActionClasses(agent, scores, context),
  };
}
