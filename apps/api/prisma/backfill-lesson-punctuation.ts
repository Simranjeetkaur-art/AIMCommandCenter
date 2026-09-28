import { PrismaClient } from "@prisma/client";
import type { LessonContent } from "@aim/contracts";
import { tidyPunctuation } from "./lesson-parser";

/**
 * Corrects the spacing left by the importer in lessons already in the database.
 *
 * Stripping inline tags turned `<strong>capability</strong>,` into
 * "capability ,", so candidates read "capability , autonomy , authority ;".
 * The parser no longer produces this; this applies the same rule to what it
 * produced before.
 */
async function main() {
  const prisma = new PrismaClient();
  const lessons = await prisma.lesson.findMany({
    where: { content: { not: null } },
    select: { id: true, title: true, content: true },
  });

  let lessonsChanged = 0;
  let stringsChanged = 0;

  const tidy = (value: string | undefined) => {
    if (typeof value !== "string") return value;
    const next = tidyPunctuation(value);
    if (next !== value) stringsChanged += 1;
    return next;
  };

  for (const lesson of lessons) {
    const content = lesson.content as unknown as LessonContent;
    const before = stringsChanged;

    const next: LessonContent = {
      ...content,
      lead: tidy(content.lead),
      overview: tidy(content.overview),
      objectivesIntro: tidy(content.objectivesIntro),
      objectives: content.objectives?.map((o) => tidy(o) as string),
      sections: content.sections.map((section) => ({
        ...section,
        heading: tidy(section.heading) as string,
        paragraphs: section.paragraphs?.map((p) => tidy(p) as string),
        blocks: section.blocks?.map((block) => ({
          ...block,
          body: tidy(block.body),
          items: block.items?.map((i) => tidy(i) as string),
          terms: block.terms?.map((t) => ({
            term: tidy(t.term) as string,
            definition: tidy(t.definition) as string,
          })),
        })),
      })),
    };

    if (stringsChanged === before) continue;

    await prisma.lesson.update({
      where: { id: lesson.id },
      data: { content: next as object },
    });
    lessonsChanged += 1;
  }

  console.log(
    `${stringsChanged} string(s) corrected across ${lessonsChanged} of ${lessons.length} lessons`,
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
