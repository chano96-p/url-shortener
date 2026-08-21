import { prisma } from "../src/prisma.js";

const QUERY_ARGS = {
  where: { userId: { not: null } },
  orderBy: { id: "desc" as const },
  take: 20,
};

async function n1() {
  const urls = await prisma.url.findMany(QUERY_ARGS);
  for (const url of urls) {
    if (url.userId === null) continue;
    await prisma.user.findUnique({ where: { id: url.userId } });
  }
}

async function withInclude() {
  await prisma.url.findMany({
    ...QUERY_ARGS,
    include: { user: { select: { email: true } } },
  });
}

async function bench(label: string, fn: () => Promise<void>, n = 30) {
  await fn();
  const times: number[] = [];
  for (let i = 0; i < n; i++) {
    const t = performance.now();
    await fn();
    times.push(performance.now() - t);
  }
  times.sort((a, b) => a - b);
  console.log(
    `${label}  중앙값 ${times[Math.floor(n / 2)].toFixed(1)}ms  최소 ${times[0].toFixed(1)}ms`,
  );
}

async function main() {
  await bench("N+1     ", n1);
  await bench("include ", withInclude);
  await bench("N+1     ", n1);
  await bench("include ", withInclude);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
