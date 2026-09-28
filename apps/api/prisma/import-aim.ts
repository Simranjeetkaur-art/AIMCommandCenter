/**
 * Imports the AIM prototype's content into the system of record.
 *
 * The prototype held ~700 assessment items and 30 lessons in a single
 * browser-side file, with every answer key sitting in the same bundle the
 * candidate downloaded. This turns that corpus into Programme -> Version ->
 * Module -> Lesson / Assessment -> Question rows, so the key lives in Postgres
 * behind assessment.answerkey.read and the marking happens on the server.
 *
 * Three source shapes are normalised here:
 *   { q, a[], c, e }                       ACA / AEL / defence banks
 *   [ stem, choices[], correctIndex, why ] AIM-CP module banks
 *   { q, choices[], correct, why, topic }  certification bank
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { AssessmentKind, PrismaClient, QuestionType } from "@prisma/client";
import {
  AIM_LADDER,
  AIM_PASS_MARK,
  AIM_TRACKS,
  DEFAULT_DRAW,
  type AimTrack,
} from "@aim/contracts";
import { parseLesson } from "./lesson-parser";

const prisma = new PrismaClient();
const CONTENT = join(__dirname, "content");

const content = JSON.parse(
  readFileSync(join(CONTENT, "aim-content.json"), "utf8"),
) as Record<string, unknown>;
const lessons = JSON.parse(
  readFileSync(join(CONTENT, "aim-lessons.json"), "utf8"),
) as Record<string, string>;

export interface NormalisedQuestion {
  stem: string;
  choices: string[];
  correctIndex: number;
  explanation: string | null;
  meta: Record<string, unknown>;
}

/**
 * Accepts any prototype question shape and returns one normal form.
 *
 * The corpus uses ten different literal shapes, and the single-letter keys do
 * not mean the same thing in all of them: in { q, a[], c } the choices are 'a'
 * and the index is 'c', while in { q, c[], a } it is the reverse. Guessing by
 * key name silently dropped 35 items. So the shape decides: the choices are
 * whichever candidate field holds an array, and the answer is whichever holds
 * an integer that indexes into it.
 */
const STEM_KEYS = ["q", "question", "stem", "scenario", "scene"] as const;
const CHOICE_KEYS = ["a", "c", "choices", "options"] as const;
const ANSWER_KEYS = ["c", "a", "correct", "answer"] as const;
const EXPLANATION_KEYS = ["e", "why", "explanation"] as const;
const META_KEYS = [
  "id",
  "n",
  "m",
  "module",
  "topic",
  "domain",
  "band",
  "phase",
  "role",
  "title",
] as const;

export function normaliseQuestion(
  raw: unknown,
  source: string,
  index: number,
): NormalisedQuestion | null {
  if (Array.isArray(raw)) {
    const [stem, choices, correctIndex, why] = raw as [
      string,
      string[],
      number,
      string?,
    ];
    if (typeof stem !== "string" || !Array.isArray(choices)) return null;
    if (
      !Number.isInteger(correctIndex) ||
      correctIndex < 0 ||
      correctIndex >= choices.length
    )
      return null;
    return {
      stem,
      choices,
      correctIndex: Number(correctIndex),
      explanation: typeof why === "string" ? why : null,
      meta: { source, index },
    };
  }

  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;

  // A staged item carries both the situation and the question put on it.
  // Keeping only one would lose what the candidate is being asked to judge.
  const situation = [o.scenario, o.scene].find(
    (v) => typeof v === "string" && v.length > 0,
  ) as string | undefined;
  const asked = [o.q, o.question, o.stem].find(
    (v) => typeof v === "string" && v.length > 0,
  ) as string | undefined;

  let stem: string | undefined;
  if (situation && asked)
    stem = `${situation}

${asked}`;
  else
    stem =
      situation ??
      asked ??
      (STEM_KEYS.map((k) => o[k]).find((v) => typeof v === "string") as
        string | undefined);
  if (!stem) return null;

  const choices = CHOICE_KEYS.map((k) => o[k]).find(
    (v) =>
      Array.isArray(v) && v.length > 1 && v.every((c) => typeof c === "string"),
  ) as string[] | undefined;
  if (!choices) return null;

  const correctIndex = ANSWER_KEYS.map((k) => o[k]).find(
    (v) =>
      Number.isInteger(v) &&
      (v as number) >= 0 &&
      (v as number) < choices.length,
  ) as number | undefined;
  if (correctIndex === undefined) return null;

  const explanation =
    (EXPLANATION_KEYS.map((k) => o[k]).find(
      (v) => typeof v === "string" && v.length > 0,
    ) as string | undefined) ?? null;

  const meta: Record<string, unknown> = { source, index };
  for (const key of META_KEYS) {
    if (o[key] !== undefined)
      meta[key === "id" || key === "n" || key === "m" ? "originalId" : key] =
        o[key];
  }

  return { stem, choices, correctIndex, explanation, meta };
}

/**
 * Strips the assessment block and any event handlers out of an imported lesson.
 *
 * The prototype's lesson markup ended with its own quiz, wired to inline
 * onclick handlers and browser state. That quiz is now a server-marked
 * Assessment, so the markup for it would be both dead and misleading.
 */
export function sanitiseLesson(html: string): string {
  let out = html;

  const assessmentMarkers = [
    /<h3>[^<]*Assessment<\/h3>/i,
    /<div class="acaQ">/i,
    /<button[^>]*onclick="submit/i,
  ];
  for (const marker of assessmentMarkers) {
    const hit = out.search(marker);
    if (hit > 0) out = out.slice(0, hit);
  }

  // Remove every inline handler and any leftover script.
  out = out.replace(/<script[\s\S]*?<\/script>/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*"[^"]*"/gi, "");
  out = out.replace(/\son[a-z]+\s*=\s*'[^']*'/gi, "");
  out = out.replace(/<button[^>]*>[\s\S]*?<\/button>/gi, "");
  out = out.replace(/<input[^>]*>/gi, "");

  return out.trim();
}

export function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

interface TrackModuleSpec {
  code: string;
  title: string;
  summary: string;
  lessonKey: string;
  bankKey: string;
}

interface TrackSpec {
  code: string;
  title: string;
  summary: string;
  modules: TrackModuleSpec[];
  assessments: Array<{
    code: string;
    title: string;
    kind: AssessmentKind;
    bankKey?: string;
    /** Written sections become WRITTEN questions reviewed by an examiner. */
    sectionKey?: string;
    passMark?: number;
    maxAttempts?: number;
  }>;
  requirements: Record<string, unknown>;
}

const pair = (v: unknown): [string, string] => v as [string, string];

function cpTrack(): TrackSpec {
  const titles = (content.academyModules as unknown[]).map(pair);
  return {
    code: AIM_TRACKS.CP,
    title: "AIM™ Certified Practitioner",
    summary:
      "Govern AI authority in practice: capability versus authority, the eleven dimensions, the authority envelope, A/G/H/X, Dx and Rx.",
    modules: titles.map(([title, summary], i) => ({
      code: `CP-${String(i + 1).padStart(3, "0")}`,
      title,
      summary,
      lessonKey: `module${i + 1}Lesson`,
      bankKey: `module${i + 1}Questions`,
    })),
    assessments: [
      {
        code: "CP-SIM",
        title: "Command Mission Simulator",
        kind: "SIMULATION",
        bankKey: "authoredMissionBank",
        maxAttempts: 5,
      },
      {
        code: "CP-EXAM",
        title: "AIM-CP™ Final Examination",
        kind: "QUIZ",
        bankKey: "certificationQuestionBank",
        maxAttempts: 3,
      },
      {
        code: "CP-PRACTICAL",
        title: "Practical Dx / Rx",
        kind: "PRACTICAL",
        bankKey: "practicalQuestions",
        maxAttempts: 3,
      },
      {
        code: "CP-CHECKRIDE",
        title: "Commander Check Ride",
        kind: "DEFENCE",
        bankKey: "checkRideStages",
        maxAttempts: 2,
      },
    ],
    requirements: {
      lessonsCompleted: true,
      passMark: AIM_PASS_MARK,
      capstoneApproved: true,
    },
  };
}

function caTrack(): TrackSpec {
  const mods = (content.AIM_CA_MODULES as unknown[]).map(
    (m) => m as [string, string, string],
  );
  return {
    code: AIM_TRACKS.CA,
    title: "AIM™ Certified Architect",
    summary:
      "Architect enforceable authority boundaries: control-plane engineering, envelopes as controls, identity and privilege, delegation chains.",
    modules: mods.map(([code, title, summary], i) => ({
      code,
      title,
      summary,
      lessonKey: `openAimCa1${String(i + 1).padStart(2, "0")}`,
      bankKey: `ACA1${String(i + 1).padStart(2, "0")}_QUESTIONS`,
    })),
    assessments: [
      {
        code: "CA-SIM",
        title: "Advanced Architecture Simulator",
        kind: "SIMULATION",
        bankKey: "AIM_CA_ADVANCED_MISSIONS",
        maxAttempts: 5,
      },
      {
        code: "CA-EXAM",
        title: "AIM-CA™ Final Examination",
        kind: "QUIZ",
        bankKey: "AIM_CA_FINAL_EXAM_BANK",
        maxAttempts: 3,
      },
      {
        code: "CA-PRACTICAL",
        title: "Enterprise Design Practical",
        kind: "PRACTICAL",
        sectionKey: "AIM_CA_PRACTICAL_SECTIONS",
        maxAttempts: 3,
      },
      {
        code: "CA-DEFENCE",
        title: "Architecture Defence",
        kind: "DEFENCE",
        bankKey: "AIM_CA_DEFENSE_CHALLENGES",
        maxAttempts: 2,
      },
    ],
    requirements: {
      lessonsCompleted: true,
      passMark: AIM_PASS_MARK,
      capstoneApproved: true,
      defenceApproved: true,
    },
  };
}

/** The AEL module titles live in the lesson markup, not in a data array. */
const EL_MODULES: Array<[string, string, string]> = [
  [
    "AEL-101",
    "Executive AI Authority & Accountability",
    "Capability versus authority, executive accountability, decision rights, human-reserved powers.",
  ],
  [
    "AEL-102",
    "Enterprise AI Governance & Operating Model",
    "Governance bodies, decision rights, and the operating model behind machine authority.",
  ],
  [
    "AEL-103",
    "AI Portfolio Risk & Authority Concentration",
    "Govern the AI workforce as a portfolio of machine authority, not unrelated projects.",
  ],
  [
    "AEL-104",
    "Human-Reserved Powers & Executive Decision Rights",
    "What must never leave human hands, and who holds it.",
  ],
  [
    "AEL-105",
    "Enterprise AI Strategy, Value & Risk",
    "Connect value creation to the authority actually being delegated.",
  ],
  [
    "AEL-106",
    "Organizational Adoption, Skills & Accountability",
    "Build the capability and accountability the architecture assumes.",
  ],
  [
    "AEL-107",
    "Regulatory, Legal & Board Governance",
    "Translate obligations into accountable ownership and bounded authority.",
  ],
  [
    "AEL-108",
    "Executive Crisis Command & Loss of Control",
    "Command an authority incident before harm is confirmed.",
  ],
  [
    "AEL-109",
    "Enterprise Last Command & Sovereign Control",
    "Preserve a verified path to stop, contain and reverse machine authority.",
  ],
  [
    "AEL-110",
    "Board Reporting & Enterprise Assurance",
    "Evidence the board can rely on, and what assurance actually requires.",
  ],
];

function elTrack(): TrackSpec {
  return {
    code: AIM_TRACKS.EL,
    title: "AIM™ Enterprise Leader",
    summary:
      "Govern machine authority at enterprise scale: portfolio concentration, human-reserved powers, crisis command, board assurance.",
    modules: EL_MODULES.map(([code, title, summary], i) => ({
      code,
      title,
      summary,
      lessonKey: `openAimEl1${String(i + 1).padStart(2, "0")}`,
      bankKey: `AEL1${String(i + 1).padStart(2, "0")}_QUESTIONS`,
    })),
    assessments: [
      {
        code: "EL-CRISIS",
        title: "Executive Crisis Simulation",
        kind: "SIMULATION",
        bankKey: "AEL_CRISIS_MISSIONS",
        maxAttempts: 5,
      },
      {
        code: "EL-EXAM",
        title: "AIM-EL™ Executive Examination",
        kind: "QUIZ",
        bankKey: "AEL_EXEC_QUESTIONS",
        maxAttempts: 3,
      },
      {
        code: "EL-CAPSTONE",
        title: "Governance Capstone",
        kind: "CAPSTONE",
        sectionKey: "AEL_GOV_CAPSTONE_SECTIONS",
        maxAttempts: 3,
      },
      {
        code: "EL-DEFENCE",
        title: "Executive Defence",
        kind: "DEFENCE",
        bankKey: "AEL_DEFENSE_CHALLENGES",
        maxAttempts: 2,
      },
    ],
    requirements: {
      lessonsCompleted: true,
      passMark: AIM_PASS_MARK,
      capstoneApproved: true,
      defenceApproved: true,
    },
  };
}

export const TRACKS = (): TrackSpec[] => [cpTrack(), caTrack(), elTrack()];

interface ImportStats {
  programmes: number;
  modules: number;
  lessons: number;
  assessments: number;
  questions: number;
  skipped: Array<{ bank: string; index: number }>;
}

export async function importAimContent(
  publisherId: string,
  bankOwnerId: string,
): Promise<ImportStats> {
  const stats: ImportStats = {
    programmes: 0,
    modules: 0,
    lessons: 0,
    assessments: 0,
    questions: 0,
    skipped: [],
  };

  for (const track of TRACKS()) {
    // The ladder travels with the content: level, prerequisite, card chips and
    // the certification gate, so a fresh database knows the shape of the
    // programme and not only its questions.
    const ladder = AIM_LADDER[track.code as AimTrack];
    // Seeded from the constants once, then owned by the database: from here
    // an administrator edits these, and the constants are only a starting shape.
    const ladderFields = {
      level: ladder?.level ?? 1,
      levelLabel: ladder?.levelLabel ?? `LEVEL ${ladder?.level ?? 1}`,
      tagline: ladder?.tagline ?? track.summary,
      prerequisiteCode: ladder?.prerequisite ?? null,
      devAccessFlag: ladder?.devAccessFlag ?? null,
      visible: true,
      cardStats: (ladder?.stats ?? []) as object,
      gateSteps: (ladder?.gate ?? []) as object,
    };

    const programme = await prisma.programme.upsert({
      where: { code: track.code },
      update: {
        title: track.title,
        summary: track.summary,
        status: "ACTIVE",
        ...ladderFields,
      },
      create: {
        code: track.code,
        title: track.title,
        summary: track.summary,
        status: "ACTIVE",
        ...ladderFields,
      },
    });
    stats.programmes += 1;

    const version = await prisma.programmeVersion.upsert({
      where: { programmeId_version: { programmeId: programme.id, version: 1 } },
      update: { requirements: track.requirements as object },
      create: {
        programmeId: programme.id,
        version: 1,
        status: "DRAFT",
        requirements: track.requirements as object,
      },
    });

    // Re-running the import replaces the version's content rather than
    // duplicating it. Safe because a published version is never re-imported.
    await prisma.module.deleteMany({
      where: { programmeVersionId: version.id },
    });
    await prisma.assessment.deleteMany({
      where: { programmeVersionId: version.id },
    });

    const bank = await prisma.questionBank.create({
      data: {
        title: `${track.code} question bank`,
        ownerId: bankOwnerId,
        // Linked to its track, so the builder offers it to this track only.
        programmeId: programme.id,
      },
    });

    for (const [index, spec] of track.modules.entries()) {
      const mod = await prisma.module.create({
        data: {
          programmeVersionId: version.id,
          code: spec.code,
          title: spec.title,
          summary: spec.summary,
          position: index + 1,
        },
      });
      stats.modules += 1;

      const rawLesson = lessons[spec.lessonKey];
      const html = rawLesson ? sanitiseLesson(rawLesson) : "";
      // Parsed into structure so an author can edit it afterwards. The markup
      // is kept alongside as the original, but the structure is what renders.
      const structured = html ? parseLesson(html) : null;
      await prisma.lesson.create({
        data: {
          moduleId: mod.id,
          title: structured?.heading || spec.title,
          bodyMd: html ? plainText(html).slice(0, 800) : spec.summary,
          bodyHtml: html || null,
          content: (structured ?? undefined) as object | undefined,
          position: 1,
          estimatedMinutes: 30,
        },
      });
      stats.lessons += 1;

      // Each module carries its own 10-question gate at 80%.
      const moduleAssessment = await prisma.assessment.create({
        data: {
          programmeVersionId: version.id,
          code: `${spec.code}-ASSESS`,
          title: `${spec.title} — Assessment`,
          kind: AssessmentKind.QUIZ,
          passMark: AIM_PASS_MARK,
          requiresReview: false,
          maxAttempts: 5,
          // Linked to its module, so the final examination can require it.
          moduleId: mod.id,
          drawCount: DEFAULT_DRAW.moduleQuiz,
        },
      });
      stats.assessments += 1;

      const items = (content[spec.bankKey] as unknown[]) ?? [];
      await attachQuestions(
        bank.id,
        moduleAssessment.id,
        items,
        spec.bankKey,
        stats,
      );
    }

    for (const spec of track.assessments) {
      const requiresReview =
        spec.kind === "PRACTICAL" ||
        spec.kind === "CAPSTONE" ||
        spec.kind === "DEFENCE";
      const assessment = await prisma.assessment.create({
        data: {
          programmeVersionId: version.id,
          code: spec.code,
          title: spec.title,
          kind: spec.kind,
          passMark: spec.passMark ?? AIM_PASS_MARK,
          requiresReview: requiresReview && Boolean(spec.sectionKey),
          maxAttempts: spec.maxAttempts ?? 3,
          finalExam: spec.kind === "QUIZ" && /-EXAM$/.test(spec.code),
          drawCount:
            spec.kind === "SIMULATION"
              ? DEFAULT_DRAW.simulator
              : spec.kind === "QUIZ" && /-EXAM$/.test(spec.code)
                ? DEFAULT_DRAW.finalExam
                : null,
        },
      });
      stats.assessments += 1;

      if (spec.sectionKey) {
        // Written sections: the candidate writes, an examiner judges.
        const sections = (content[spec.sectionKey] as unknown[]) ?? [];
        for (const [i, section] of sections.entries()) {
          const [title, prompt] = section as [string, string];
          const question = await prisma.question.create({
            data: {
              bankId: bank.id,
              stem: `${title}\n\n${prompt}`,
              type: QuestionType.WRITTEN,
              options: [],
              answerKey: {},
              explanation: null,
              meta: { source: spec.sectionKey, index: i, section: title },
              points: 10,
            },
          });
          await prisma.assessmentQuestion.create({
            data: {
              assessmentId: assessment.id,
              questionId: question.id,
              position: i + 1,
            },
          });
          stats.questions += 1;
        }
        continue;
      }

      const items = (content[spec.bankKey as string] as unknown[]) ?? [];
      await attachQuestions(
        bank.id,
        assessment.id,
        items,
        spec.bankKey as string,
        stats,
        spec.kind === "SIMULATION" ? "SIMULATOR" : "QUIZ",
      );
    }

    // Publishing is an administration act everywhere else in this system, so
    // the import does it explicitly and records who.
    await prisma.programmeVersion.update({
      where: { id: version.id },
      data: {
        status: "PUBLISHED",
        publishedAt: new Date(),
        publishedById: publisherId,
      },
    });
  }

  return stats;
}

async function attachQuestions(
  bankId: string,
  assessmentId: string,
  items: unknown[],
  bankKey: string,
  stats: ImportStats,
  pool: "QUIZ" | "SIMULATOR" = "QUIZ",
): Promise<void> {
  let position = 0;
  for (const [index, raw] of items.entries()) {
    const q = normaliseQuestion(raw, bankKey, index);
    if (!q) {
      stats.skipped.push({ bank: bankKey, index });
      continue;
    }

    position += 1;
    const question = await prisma.question.create({
      data: {
        bankId,
        stem: q.stem,
        type: QuestionType.SINGLE_CHOICE,
        options: q.choices.map((text, i) => ({ id: String(i), text })),
        // The key stays here, and only here.
        answerKey: { correct: String(q.correctIndex) },
        explanation: q.explanation,
        meta: q.meta as object,
        points: 1,
        pool,
      },
    });
    await prisma.assessmentQuestion.create({
      data: { assessmentId, questionId: question.id, position },
    });
    stats.questions += 1;
  }
}

export { prisma as importPrisma };
