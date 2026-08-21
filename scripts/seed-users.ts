import { prisma } from "../src/prisma.js";

async function main() {
  await prisma.user.createMany({
    data: Array.from({ length: 1000 }, (_, i) => ({
      id: BigInt(i + 1),
      email: `user${i + 1}@example.com`,
    })),
    skipDuplicates: true,
  });

  await prisma.$executeRaw`
    UPDATE urls SET user_id = (random() * 999)::int + 1
    WHERE id <= 100000
  `;

  console.log("done");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
