import { Prisma } from "../src/generated/prisma/client.js";
import { prisma } from "../src/prisma.js";
import { ALPHABET } from "../src/shortCode.js";

const MARKER = "race-test";
const CODE_LENGTH = 2; // 62^2 = 3,844 → 충돌이 확실히 발생
const N = 500;

function tinyCode(): string {
  let code = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
  }
  return code;
}

let retryCount = 0;
let failCount = 0;

function isShortCodeConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

async function createWithRetry() {
  for (let i = 0; i < 5; i++) {
    try {
      return await prisma.url.create({
        data: { shortCode: tinyCode(), originalUrl: MARKER },
      });
    } catch (e) {
      if (isShortCodeConflict(e)) {
        retryCount++;
        continue;
      }
      throw e;
    }
  }
  failCount++;
  return null;
}

async function main() {
  await prisma.$executeRaw`DELETE FROM urls WHERE original_url = ${MARKER}`;

  // allSettled: 일부가 실패해도 나머지 완료를 기다린 뒤 정리해야 잔여 행이 안 남음
  const results = await Promise.allSettled(Array.from({ length: N }, () => createWithRetry()));
  const rejected = results.filter((r) => r.status === "rejected").length;

  const total = await prisma.url.count({ where: { originalUrl: MARKER } });
  const dupes = await prisma.$queryRaw<{ short_code: string }[]>`
    SELECT short_code FROM urls
    WHERE original_url = ${MARKER}
    GROUP BY short_code HAVING count(*) > 1
  `;

  console.log(`시도: ${N}건`);
  console.log(`생성: ${total}건`);
  console.log(`재시도 발생: ${retryCount}회`);
  console.log(`5회 실패: ${failCount}건`);
  console.log(`예외로 종료: ${rejected}건`);
  console.log(`중복 코드: ${dupes.length}종`);

  if (dupes.length > 0) {
    console.error("❌ UNIQUE 제약이 지켜지지 않았습니다");
    process.exitCode = 1;
  }
  if (retryCount === 0) {
    console.error("❌ 재시도가 한 번도 발생하지 않음 — 충돌 감지 로직 확인 필요");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$executeRaw`DELETE FROM urls WHERE original_url = ${MARKER}`;
    await prisma.$disconnect();
  });
