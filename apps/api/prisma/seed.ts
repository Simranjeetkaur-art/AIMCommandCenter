/**
 * Seeds a complete institution running the three AIM tracks.
 *
 * The people and the shape of the academy are created here; the course content
 * itself comes from import-aim.ts, which reads the corpus extracted from the
 * v4.3.1 prototype. Together they produce a database where every answer key is
 * server-side, every gate is enforced, and the review queue already has work in
 * it.
 *
 * The unassigned learner matters: logging in as the instructor and trying to
 * reach that learner is the fastest way to see the scope rules working.
 */
import { PrismaClient, Role } from "@prisma/client";
import * as argon2 from "argon2";
import {
  AIM_ROLE_BASELINES,
  AIM_TRACKS,
  bandFor,
  computeAai,
} from "@aim/contracts";
import { chainHash } from "../src/common/audit/audit-hash";
import { importAimContent } from "./import-aim";

const prisma = new PrismaClient();
const PASSWORD = "AimAcademy!2026";

async function user(email: string, name: string, role: Role) {
  const passwordHash = await argon2.hash(PASSWORD, { type: argon2.argon2id });
  return prisma.user.upsert({
    where: { email },
    update: { name, role },
    create: { email, name, role, passwordHash },
  });
}

/**
 * Audit rows are chained, and the seed hashes them through the very same
 * helper the API uses. Writing the formula out a second time here is how the
 * chain first came to link correctly while failing to verify.
 */
async function audit(
  actorId: string,
  actorRole: Role,
  actorEmail: string,
  action: string,
  resourceType: string,
  resourceId: string,
) {
  const previous = await prisma.auditEvent.findFirst({
    orderBy: { seq: "desc" },
    select: { hash: true },
  });

  const occurredAt = new Date();
  const payload = {
    occurredAt: occurredAt.toISOString(),
    actorId,
    actorRole,
    actorEmail,
    action,
    resourceType,
    resourceId,
    outcome: "SUCCESS",
    requestId: "seed",
    metadata: { seeded: true },
  };

  const prevHash = previous?.hash ?? null;

  await prisma.auditEvent.create({
    data: {
      ...payload,
      occurredAt,
      outcome: "SUCCESS",
      prevHash,
      hash: chainHash(prevHash, payload),
    },
  });
}

async function main() {
  console.log("Seeding AIM Command Center...\n");

  const admin = await user("admin@aim.edu", "Rowan Adeyemi", Role.ADMIN);
  const manager = await user(
    "manager@aim.edu",
    "Priya Raghunathan",
    Role.MANAGER,
  );
  const instructor = await user(
    "instructor@aim.edu",
    "Tomas Lindqvist",
    Role.INSTRUCTOR,
  );
  const instructorTwo = await user(
    "instructor2@aim.edu",
    "Ada Okonkwo",
    Role.INSTRUCTOR,
  );

  const students = await Promise.all([
    user("student@aim.edu", "Mei Sandoval", Role.STUDENT),
    user("student2@aim.edu", "Jonah Weiss", Role.STUDENT),
    user("student3@aim.edu", "Fatima Al-Rashid", Role.STUDENT),
  ]);
  console.log("  people ready");

  // ---- Course content, imported from the prototype corpus -----------------

  // Anything that is not one of the three AIM tracks is scaffold left over
  // from before the corpus existed. Remove it, and its cohorts with it, so the
  // academy contains exactly what the prototype taught and nothing else.
  const TRACK_CODES = [AIM_TRACKS.CP, AIM_TRACKS.CA, AIM_TRACKS.EL];
  const stale = await prisma.programme.findMany({
    where: { code: { notIn: TRACK_CODES } },
    select: { id: true, code: true, versions: { select: { id: true } } },
  });
  if (stale.length > 0) {
    const versionIds = stale.flatMap((p) => p.versions.map((v) => v.id));
    const staleCohorts = await prisma.cohort.findMany({
      where: { programmeVersionId: { in: versionIds } },
      select: { id: true },
    });
    const cohortIds = staleCohorts.map((c) => c.id);
    await prisma.instructorAssignment.deleteMany({
      where: { cohortId: { in: cohortIds } },
    });
    await prisma.enrollment.deleteMany({
      where: { cohortId: { in: cohortIds } },
    });
    await prisma.cohort.deleteMany({ where: { id: { in: cohortIds } } });
    await prisma.credential.deleteMany({
      where: { programmeVersionId: { in: versionIds } },
    });
    await prisma.programme.deleteMany({
      where: { id: { in: stale.map((p) => p.id) } },
    });
    console.log(
      `  removed ${stale.length} stale programme(s): ${stale.map((p) => p.code).join(", ")}`,
    );
  }

  const stats = await importAimContent(admin.id, manager.id);
  console.log(
    `  imported ${stats.programmes} tracks · ${stats.modules} modules · ${stats.lessons} lessons · ${stats.assessments} assessments · ${stats.questions} questions`,
  );
  if (stats.skipped.length > 0) {
    // Not tolerated silently: the normaliser is pinned by a test, so this
    // means a bank shape changed and the syllabus would quietly shrink.
    console.error(`  WARNING: skipped ${stats.skipped.length} items:`);
    for (const s of stats.skipped.slice(0, 10))
      console.error(`    ${s.bank}[${s.index}]`);
    throw new Error(
      "Import dropped content. Refusing to seed an incomplete syllabus.",
    );
  }

  // ---- Cohorts, enrolment and assignment ----------------------------------

  const versions = await prisma.programmeVersion.findMany({
    where: { status: "PUBLISHED" },
    include: { programme: true },
  });

  const cohorts = [];
  for (const version of versions) {
    const cohort = await prisma.cohort.upsert({
      where: { code: `${version.programme.code}-2026A` },
      update: {},
      create: {
        code: `${version.programme.code}-2026A`,
        title: `${version.programme.title}, Spring 2026`,
        programmeVersionId: version.id,
        startsAt: new Date("2026-02-02"),
      },
    });
    cohorts.push(cohort);
  }

  // Everyone starts on AIM-CP; Mei also sits the architect track.
  const cpCohort = cohorts.find((c) => c.code.startsWith(AIM_TRACKS.CP))!;
  const caCohort = cohorts.find((c) => c.code.startsWith(AIM_TRACKS.CA))!;

  for (const student of students) {
    await prisma.enrollment.upsert({
      where: { cohortId_userId: { cohortId: cpCohort.id, userId: student.id } },
      update: {},
      create: { cohortId: cpCohort.id, userId: student.id },
    });
  }
  await prisma.enrollment.upsert({
    where: {
      cohortId_userId: { cohortId: caCohort.id, userId: students[0].id },
    },
    update: {},
    create: { cohortId: caCohort.id, userId: students[0].id },
  });

  // Two of the three learners belong to Tomas. The third does not, and that is
  // what makes the scope rules visible from the instructor portal.
  for (const student of students.slice(0, 2)) {
    await prisma.instructorAssignment.upsert({
      where: {
        instructorId_learnerId: {
          instructorId: instructor.id,
          learnerId: student.id,
        },
      },
      update: {},
      create: {
        instructorId: instructor.id,
        learnerId: student.id,
        cohortId: cpCohort.id,
        assignedById: manager.id,
      },
    });
  }
  console.log(`  ${cohorts.length} cohorts, enrolment and assignments ready`);

  // ---- The agent registry, with one bound diagnostic each -----------------

  const registry = [
    {
      code: "AP-AI-01",
      name: "Accounts Payable Agent",
      ownerRole: "CFO",
      purpose: "Process approved vendor invoices",
      baseline: "finance" as const,
      lastCommand: "VERIFIED" as const,
    },
    {
      code: "SOC-AI-03",
      name: "Security Response Agent",
      ownerRole: "CISO",
      purpose: "Triage and contain security events",
      baseline: "cyber" as const,
      lastCommand: "VERIFIED" as const,
    },
    {
      code: "OPS-AI-07",
      name: "Operations Optimisation Agent",
      ownerRole: "COO",
      purpose: "Optimise plant scheduling and dispatch",
      baseline: "infrastructure" as const,
      lastCommand: "MISSING" as const,
    },
  ];

  for (const spec of registry) {
    const scores = [...AIM_ROLE_BASELINES[spec.baseline]];
    const aai = computeAai(scores);
    const band = bandFor(aai);

    const agent = await prisma.agent.upsert({
      where: { code: spec.code },
      update: {},
      create: {
        code: spec.code,
        name: spec.name,
        ownerRole: spec.ownerRole,
        purpose: spec.purpose,
        aai,
        band: band.band,
        lastCommand: spec.lastCommand,
        // An agent with no verified Last Command needs attention whatever its
        // index says: the index measures exposure, not controllability.
        status:
          spec.lastCommand === "MISSING"
            ? "ATTENTION"
            : aai >= 75
              ? "CRITICAL"
              : aai >= 50
                ? "ATTENTION"
                : "GOVERNED",
        createdById: manager.id,
      },
    });

    await prisma.diagnostic.create({
      data: {
        agentId: agent.id,
        agentName: spec.name,
        agentOwner: spec.ownerRole,
        agentPurpose: spec.purpose,
        scores,
        aai,
        band: band.band,
        isPractice: false,
        createdById: manager.id,
      },
    });
  }
  console.log(`  registry seeded with ${registry.length} governed agents`);

  // ---- Work already in flight ---------------------------------------------

  const capstone = await prisma.assessment.findFirst({
    where: { kind: { in: ["CAPSTONE", "PRACTICAL"] }, requiresReview: true },
    orderBy: { code: "asc" },
  });

  if (capstone) {
    const now = new Date();
    const overdueAt = new Date(now.getTime() - 96 * 3_600_000);

    // Overdue on purpose: it lands on the manager turnaround report as
    // something to reassign, the one review-shaped manager action.
    await prisma.submission.create({
      data: {
        assessmentId: capstone.id,
        userId: students[0].id,
        contentMd:
          "## Authority model for a field logistics command system\n\nThe model separates judgement from administration. Purpose is bounded to dispatch within an approved region; financial authority is capped below the reorder threshold; delegation is disabled outright.",
        status: "SUBMITTED",
        submittedAt: overdueAt,
        slaDueAt: new Date(overdueAt.getTime() + 72 * 3_600_000),
      },
    });

    await prisma.submission.create({
      data: {
        assessmentId: capstone.id,
        userId: students[1].id,
        contentMd:
          "## Draft: enterprise authorisation decision\n\nStarting from the prohibition list rather than the grants, because what the agent must never do is the part that has to hold under pressure.",
        status: "SUBMITTED",
        submittedAt: new Date(now.getTime() - 6 * 3_600_000),
        slaDueAt: new Date(now.getTime() + 66 * 3_600_000),
      },
    });
    console.log("  two submissions waiting in the review queue");
  }

  // Mei has worked through the AIM-CP lessons.
  const cpLessons = await prisma.lesson.findMany({
    where: {
      module: { programmeVersion: { programme: { code: AIM_TRACKS.CP } } },
    },
    select: { id: true },
  });
  await prisma.lessonProgress.createMany({
    data: cpLessons.map((lesson) => ({
      userId: students[0].id,
      lessonId: lesson.id,
      status: "COMPLETED" as const,
      startedAt: new Date(),
      completedAt: new Date(),
    })),
    skipDuplicates: true,
  });

  return { admin, manager, instructor, instructorTwo, students, stats };
}

async function settingsAndAudit(ctx: Awaited<ReturnType<typeof main>>) {
  const { admin, manager, instructor } = ctx;

  // Badges with conditions the server can actually evaluate. A manager or an
  // administrator defines these; the evaluator awards them the moment a
  // condition becomes true.
  const badgeDefinitions = [
    {
      code: "CP_FOUNDATIONS",
      title: "Command Fundamentals",
      description: "Completed the first three AIM-CP command modules.",
      criteria: {
        type: "MODULES_COMPLETED",
        programmeCode: "AIM-CP",
        threshold: 3,
      },
      programmeCode: "AIM-CP",
      level: 1,
      tone: "green",
      iconText: "CF",
      iconSvg:
        '<svg viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg"><path d="M24 2 4 10v18c0 12 8 21 20 26 12-5 20-14 20-26V10L24 2z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="2"/><path d="M15 28l6 7 12-14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      position: 1,
    },
    {
      // The case described on the admin screens: five modules at level one
      // earns the badge, before the level itself is finished.
      code: "LEVEL1_HALFWAY",
      title: "Level 1 — Halfway",
      description: "Completed five modules at level one.",
      criteria: { type: "LEVEL_MODULES_COMPLETED", level: 1, threshold: 5 },
      programmeCode: null,
      level: 1,
      tone: "amber",
      iconText: "5",
      iconSvg:
        '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="21" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="2"/><path d="M24 11l3.8 8.2 9 1.1-6.6 6.2 1.7 8.9L24 31.2l-7.9 4.2 1.7-8.9-6.6-6.2 9-1.1L24 11z" fill="currentColor"/></svg>',
      position: 2,
    },
    {
      code: "LEVEL1_COMPLETE",
      title: "Level 1 Complete",
      description: "Cleared every requirement of level one.",
      criteria: { type: "LEVEL_COMPLETE", level: 1 },
      programmeCode: null,
      level: 1,
      tone: "brass",
      iconText: "L1",
      iconSvg:
        '<svg viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg"><path d="M24 2 4 10v18c0 12 8 21 20 26 12-5 20-14 20-26V10L24 2z" fill="currentColor" fill-opacity="0.16" stroke="currentColor" stroke-width="2"/><path d="M15 28l6 7 12-14" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      position: 3,
    },
    {
      code: "CP_SIMULATOR",
      title: "100-Mission Commander",
      description: "Passed the 100-Mission Command Simulator.",
      criteria: {
        type: "ASSESSMENT_KIND_PASSED",
        assessmentKind: "SIMULATION",
        programmeCode: "AIM-CP",
      },
      programmeCode: "AIM-CP",
      level: 1,
      tone: "blue",
      iconText: "100",
      iconSvg:
        '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="21" fill="currentColor" fill-opacity="0.14" stroke="currentColor" stroke-width="2"/><path d="M24 11l3.8 8.2 9 1.1-6.6 6.2 1.7 8.9L24 31.2l-7.9 4.2 1.7-8.9-6.6-6.2 9-1.1L24 11z" fill="currentColor"/></svg>',
      position: 4,
    },
    {
      code: "CP_DISTINCTION",
      title: "Final Exam Distinction",
      description: "Scored 95% or better on the AIM-CP final examination.",
      criteria: {
        type: "ASSESSMENT_SCORE",
        assessmentCode: "CP-EXAM",
        threshold: 95,
      },
      programmeCode: "AIM-CP",
    },
    {
      code: "CA_ARCHITECT",
      title: "Certified Architect",
      description: "Completed every AIM-CA module and assessment.",
      criteria: { type: "TRACK_COMPLETE", programmeCode: "AIM-CA" },
      programmeCode: "AIM-CA",
    },
    {
      code: "EL_EXECUTIVE",
      title: "Enterprise Leader",
      description: "Holds an active AIM-EL credential.",
      criteria: { type: "CREDENTIAL_HELD", programmeCode: "AIM-EL" },
      programmeCode: "AIM-EL",
    },
    {
      code: "DX_PRACTITIONER",
      title: "Diagnostic Practitioner",
      description: "Ran five authority diagnostics.",
      criteria: { type: "DIAGNOSTICS_RUN", threshold: 5 },
      programmeCode: null,
    },
    {
      code: "LAST_COMMAND",
      title: "Last Command",
      description:
        "Awarded by an instructor for demonstrating a verified revocation path under pressure.",
      criteria: { type: "MANUAL" },
      programmeCode: null,
      awardMode: "MANUAL" as const,
      tone: "red",
      iconText: "LC",
      iconSvg:
        '<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg"><circle cx="24" cy="24" r="21" fill="currentColor" fill-opacity="0.12" stroke="currentColor" stroke-width="2"/><path d="M17 24V15a3 3 0 016 0v7m0-2a3 3 0 016 0v4m0-2a3 3 0 016 0v8c0 6-4 10-10 10s-10-4-10-10v-7a3 3 0 016 0" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>',
      position: 9,
    },
  ];

  // A badge whose criteria the evaluator cannot read is unearnable, and a
  // learner has no way to discover that. Remove any that predate the typed
  // conditions, along with anything left behind by a test run.
  const orphaned = await prisma.badge.findMany({
    where: { code: { notIn: badgeDefinitions.map((b) => b.code) } },
    select: { id: true, code: true, criteria: true },
  });
  const unearnable = orphaned.filter((b) => {
    const c = b.criteria as { type?: string } | null;
    // Unreadable criteria, or scratch left behind by a verification run.
    return !c || typeof c.type !== "string" || /^(TEST|Xd|PROBE)_/.test(b.code);
  });
  if (unearnable.length > 0) {
    await prisma.badgeAward.deleteMany({
      where: { badgeId: { in: unearnable.map((b) => b.id) } },
    });
    await prisma.badge.deleteMany({
      where: { id: { in: unearnable.map((b) => b.id) } },
    });
    console.log(
      `  removed ${unearnable.length} unearnable badge(s): ${unearnable.map((b) => b.code).join(", ")}`,
    );
  }

  for (const badge of badgeDefinitions) {
    await prisma.badge.upsert({
      where: { code: badge.code },
      update: {
        title: badge.title,
        description: badge.description,
        criteria: badge.criteria as object,
        awardMode: badge.awardMode ?? "AUTOMATIC",
        programmeCode: badge.programmeCode,
        iconSvg: (badge as { iconSvg?: string }).iconSvg ?? null,
        iconText: (badge as { iconText?: string }).iconText ?? null,
        tone: (badge as { tone?: string }).tone ?? "brass",
        level: (badge as { level?: number }).level ?? null,
        position: (badge as { position?: number }).position ?? 0,
      },
      create: {
        code: badge.code,
        title: badge.title,
        description: badge.description,
        criteria: badge.criteria as object,
        awardMode: badge.awardMode ?? "AUTOMATIC",
        programmeCode: badge.programmeCode,
        iconSvg: (badge as { iconSvg?: string }).iconSvg ?? null,
        iconText: (badge as { iconText?: string }).iconText ?? null,
        tone: (badge as { tone?: string }).tone ?? "brass",
        level: (badge as { level?: number }).level ?? null,
        position: (badge as { position?: number }).position ?? 0,
        createdById: manager.id,
      },
    });
  }

  // Seeded badges reach whoever already qualifies, the same way a badge
  // defined through the admin screens does. Without this, a learner's shelf
  // would depend on whether their work happened before or after the seed.
  const { evaluateSeededBadges } = await import("./badge-backfill");
  const awarded = await evaluateSeededBadges(prisma);
  if (awarded > 0)
    console.log(
      `  backfilled ${awarded} badge award(s) to qualifying learners`,
    );

  await prisma.setting.createMany({
    data: [
      {
        key: "branding.institutionName",
        value: "AIM Academy",
        description: "Name printed on certificates",
        updatedById: admin.id,
      },
      {
        key: "branding.commandPrinciple",
        value:
          "AI provides the intelligence. AIM governs the authority. Humans retain the command.",
        description: "Shown on the command strip",
        updatedById: admin.id,
      },
      {
        key: "portal.student.showBadges",
        value: true,
        description: "Show the badge shelf on the student dashboard",
        updatedById: admin.id,
      },
      {
        key: "registry.requireLastCommand",
        value: true,
        description: "Flag any agent without a verified Last Command",
        updatedById: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  await prisma.featureFlag.createMany({
    data: [
      {
        key: "registration.selfService",
        enabled: true,
        description:
          "Allow people to create their own candidate account from the sign-in screen",
        updatedById: admin.id,
      },
      {
        key: "simulations.enabled",
        enabled: true,
        description: "Allow simulation-type assessments",
        updatedById: admin.id,
      },
      {
        key: "credentials.selfVerify",
        enabled: true,
        description: "Public verification endpoint",
        updatedById: admin.id,
      },
      {
        key: "registry.enabled",
        enabled: true,
        description: "Expose the AI agent registry",
        updatedById: admin.id,
      },
      {
        key: "tracks.el.enabled",
        enabled: true,
        description: "Offer the AIM-EL executive track",
        updatedById: admin.id,
      },
      // Development access opens training without the prerequisite credential.
      // It never opens issuance: a credential earned behind a flag would
      // attest to a prerequisite the holder does not have.
      {
        key: "tracks.ca.devAccess",
        enabled: true,
        description: "AIM-CA training open without the AIM-CP credential",
        updatedById: admin.id,
      },
      {
        key: "tracks.el.devAccess",
        enabled: true,
        description: "AIM-EL training open without the AIM-CA credential",
        updatedById: admin.id,
      },
    ],
    skipDuplicates: true,
  });

  const version = await prisma.programmeVersion.findFirst({
    where: { status: "PUBLISHED" },
  });
  if (version) {
    await audit(
      admin.id,
      "ADMIN",
      admin.email,
      "programme.publish",
      "programme_version",
      version.id,
    );
  }
  const cohort = await prisma.cohort.findFirst();
  if (cohort) {
    await audit(
      manager.id,
      "MANAGER",
      manager.email,
      "cohort.create",
      "cohort",
      cohort.id,
    );
  }
  await audit(
    manager.id,
    "MANAGER",
    manager.email,
    "instructor.assign",
    "instructor_assignment",
    instructor.id,
  );
  const agent = await prisma.agent.findFirst();
  if (agent) {
    await audit(
      manager.id,
      "MANAGER",
      manager.email,
      "agent.create",
      "agent",
      agent.id,
    );
  }
}

main()
  .then(async (ctx) => {
    await settingsAndAudit(ctx);
    console.log("\nSeed complete. Sign in at http://localhost:3000 with:");
    console.log(`  Administrator  admin@aim.edu       ${PASSWORD}`);
    console.log(`  Manager        manager@aim.edu     ${PASSWORD}`);
    console.log(`  Instructor     instructor@aim.edu  ${PASSWORD}`);
    console.log(`  Student        student@aim.edu     ${PASSWORD}`);
    console.log(
      "\nFatima Al-Rashid is deliberately NOT assigned to Tomas Lindqvist.",
    );
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
