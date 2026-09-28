import { PrismaClient } from "@prisma/client";

/**
 * Turns the old `prerequisiteCode` column into a real unlock rule.
 *
 * The ladder used to be one column holding one kind of condition. It is now a
 * list of rules, and a track with no rules is open -- so the existing
 * prerequisites have to become rules or they would silently stop applying.
 * The column stays: it is what the track card shows as a ladder position.
 */
async function main() {
  const prisma = new PrismaClient();

  const author = await prisma.user.findFirst({
    where: { role: "ADMIN", archivedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true },
  });
  if (!author) throw new Error("No administrator to attribute the rules to");

  const programmes = await prisma.programme.findMany({
    select: {
      id: true,
      code: true,
      prerequisiteCode: true,
      _count: { select: { unlockRules: true } },
    },
    orderBy: { level: "asc" },
  });

  for (const programme of programmes) {
    if (programme._count.unlockRules > 0) {
      console.log(`${programme.code.padEnd(8)} already has rules, left alone`);
      continue;
    }
    if (!programme.prerequisiteCode) {
      console.log(`${programme.code.padEnd(8)} no prerequisite, stays open`);
      continue;
    }
    await prisma.unlockRule.create({
      data: {
        programmeId: programme.id,
        type: "CREDENTIAL_HELD",
        requiredProgrammeCode: programme.prerequisiteCode,
        label: "",
        position: 0,
        createdById: author.id,
      },
    });
    console.log(
      `${programme.code.padEnd(8)} CREDENTIAL_HELD ${programme.prerequisiteCode}`,
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
