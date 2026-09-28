import type { PrismaClient } from "@prisma/client";

/**
 * Awards every automatic badge to the learners who already meet its condition.
 *
 * The evaluator normally runs at the moments a condition can newly become
 * true. A badge seeded or defined after the work was done has no such moment,
 * so without this a learner's shelf would depend on the order in which the
 * database was populated rather than on what they actually did.
 *
 * A deliberately small reimplementation of the service's rules, because the
 * seed runs outside the Nest container. The shared cases are the ones the seed
 * actually uses; anything else is left to the running application.
 */
export async function evaluateSeededBadges(
  prisma: PrismaClient,
): Promise<number> {
  const badges = await prisma.badge.findMany({
    where: { active: true, awardMode: "AUTOMATIC" },
  });
  const learners = await prisma.user.findMany({
    where: { role: "STUDENT", status: "ACTIVE" },
    select: { id: true },
  });

  let awarded = 0;

  for (const badge of badges) {
    const criteria = badge.criteria as {
      type?: string;
      level?: number;
      threshold?: number;
      programmeCode?: string;
    } | null;
    if (!criteria?.type) continue;

    for (const learner of learners) {
      const existing = await prisma.badgeAward.findUnique({
        where: { badgeId_userId: { badgeId: badge.id, userId: learner.id } },
        select: { id: true },
      });
      if (existing) continue;

      let earned = false;

      if (
        criteria.type === "LEVEL_MODULES_COMPLETED" &&
        criteria.level &&
        criteria.threshold
      ) {
        earned =
          (await modulesDoneAtLevel(prisma, learner.id, criteria.level)) >=
          criteria.threshold;
      } else if (
        criteria.type === "MODULES_COMPLETED" &&
        criteria.programmeCode &&
        criteria.threshold
      ) {
        earned =
          (await modulesDoneInProgramme(
            prisma,
            learner.id,
            criteria.programmeCode,
          )) >= criteria.threshold;
      }

      if (earned) {
        await prisma.badgeAward.create({
          data: { badgeId: badge.id, userId: learner.id, source: "SYSTEM" },
        });
        awarded += 1;
      }
    }
  }

  return awarded;
}

async function countCompleteModules(
  prisma: PrismaClient,
  userId: string,
  lessons: Array<{ id: string; moduleId: string }>,
): Promise<number> {
  if (lessons.length === 0) return 0;

  const done = await prisma.lessonProgress.findMany({
    where: {
      userId,
      lessonId: { in: lessons.map((l) => l.id) },
      status: "COMPLETED",
    },
    select: { lessonId: true },
  });
  const doneIds = new Set(done.map((d) => d.lessonId));

  const byModule = new Map<string, { total: number; done: number }>();
  for (const lesson of lessons) {
    const entry = byModule.get(lesson.moduleId) ?? { total: 0, done: 0 };
    entry.total += 1;
    if (doneIds.has(lesson.id)) entry.done += 1;
    byModule.set(lesson.moduleId, entry);
  }

  return [...byModule.values()].filter((m) => m.total > 0 && m.done === m.total)
    .length;
}

async function modulesDoneAtLevel(
  prisma: PrismaClient,
  userId: string,
  level: number,
) {
  const lessons = await prisma.lesson.findMany({
    where: {
      module: {
        programmeVersion: {
          status: "PUBLISHED",
          programme: { level, visible: true },
        },
      },
    },
    select: { id: true, moduleId: true },
  });
  return countCompleteModules(prisma, userId, lessons);
}

async function modulesDoneInProgramme(
  prisma: PrismaClient,
  userId: string,
  code: string,
) {
  const lessons = await prisma.lesson.findMany({
    where: {
      module: {
        programmeVersion: { status: "PUBLISHED", programme: { code } },
      },
    },
    select: { id: true, moduleId: true },
  });
  return countCompleteModules(prisma, userId, lessons);
}
