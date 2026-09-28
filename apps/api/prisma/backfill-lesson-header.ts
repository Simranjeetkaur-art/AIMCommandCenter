import { PrismaClient } from "@prisma/client";
import type { LessonContent } from "@aim/contracts";

/**
 * Splits each lesson's free-text stat chips into the three named header fields.
 *
 * The chips were a list of strings, so the editor could only ever offer "type
 * three lines" and nothing could ask a lesson how long it takes. Reading time,
 * question count and pass mark are now fields; this puts the existing values
 * into them. Anything that matches none of the three stays in `stats`, which
 * is what that array is now for.
 */
function classify(
  chip: string,
): "readingTime" | "questionCount" | "passMark" | null {
  const text = chip.toLowerCase();
  if (/\bmin\b|minute|hour|\btime\b/.test(text)) return "readingTime";
  if (/question/.test(text)) return "questionCount";
  if (/pass|%/.test(text)) return "passMark";
  return null;
}

async function main() {
  const prisma = new PrismaClient();
  const lessons = await prisma.lesson.findMany({
    where: { content: { not: null } },
    select: { id: true, title: true, content: true },
  });

  let changed = 0;

  for (const lesson of lessons) {
    const content = lesson.content as unknown as LessonContent;
    const chips = content.stats ?? [];

    // Already done, or nothing to do.
    if (chips.length === 0) continue;
    if (content.readingTime || content.questionCount || content.passMark)
      continue;

    const named: Partial<LessonContent> = {};
    const leftover: string[] = [];

    for (const chip of chips) {
      const field = classify(chip);
      // First match wins: a second "…min" chip is a real extra chip, not a
      // correction of the first.
      if (field && !named[field]) named[field] = chip;
      else leftover.push(chip);
    }

    if (Object.keys(named).length === 0) continue;

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { content: { ...content, ...named, stats: leftover } as object },
    });
    changed += 1;
  }

  console.log(
    `${changed} of ${lessons.length} lessons given named header fields`,
  );

  const sample = await prisma.lesson.findFirst({
    where: { content: { not: null } },
    select: { title: true, content: true },
  });
  const shown = sample?.content as unknown as LessonContent | undefined;
  if (shown) {
    console.log(`  e.g. ${sample?.title}`);
    console.log(`       reading time  ${JSON.stringify(shown.readingTime)}`);
    console.log(`       questions     ${JSON.stringify(shown.questionCount)}`);
    console.log(`       pass mark     ${JSON.stringify(shown.passMark)}`);
    console.log(`       other chips   ${JSON.stringify(shown.stats)}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
