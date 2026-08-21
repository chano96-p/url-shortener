import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { faker } from "@faker-js/faker";
import { from as copyFrom } from "pg-copy-streams";
import { pool } from "../src/db.js";
import { generateCode } from "../src/shortCode.js";

const TOTAL = 1_000_000;

// CSV 규격: 값 안의 " 는 "" 로 이스케이프
function csvQuote(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

async function main() {
  const started = Date.now();
  const client = await pool.connect();

  try {
    // COPY 는 ON CONFLICT 를 지원하지 않으므로 임시 테이블 경유
    await client.query("CREATE TEMP TABLE urls_staging (short_code TEXT, original_url TEXT)");

    const stream = client.query(
      copyFrom("COPY urls_staging (short_code, original_url) FROM STDIN WITH (FORMAT csv)"),
    );

    const rows = Readable.from(
      (function* () {
        for (let i = 0; i < TOTAL; i++) {
          yield `${csvQuote(generateCode())},${csvQuote(faker.internet.url())}\n`;
        }
      })(),
    );

    await pipeline(rows, stream);

    const result = await client.query(`
      INSERT INTO urls (short_code, original_url)
      SELECT short_code, original_url FROM urls_staging
      ON CONFLICT (short_code) DO NOTHING
    `);

    const inserted = result.rowCount ?? 0;
    console.log(`삽입: ${inserted}건 (충돌 ${TOTAL - inserted}건 스킵)`);
    console.log(`완료: ${((Date.now() - started) / 1000).toFixed(1)}초`);
  } finally {
    client.release();
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
