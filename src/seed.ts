import { faker } from "@faker-js/faker";
import { pool } from "./db.js";
import { generateCode } from "./shortCode.js";

const TOTAL = 1_000_000;
const BATCH_SIZE = 1000;

async function main() {
  const started = Date.now();

  for (let offset = 0; offset < TOTAL; offset += BATCH_SIZE) {
    const params: string[] = [];
    const placeholders: string[] = [];

    for (let i = 0; i < BATCH_SIZE; i++) {
      params.push(generateCode(), faker.internet.url());
      placeholders.push(`($${i * 2 + 1}, $${i * 2 + 2})`);
    }

    await pool.query(
      `INSERT INTO urls (short_code, original_url) VALUES ${placeholders.join(",")}`,
      params,
    );

    const done = offset + BATCH_SIZE;
    const elapsed = (Date.now() - started) / 1000;
    console.log(`${done} rows | ${(done / elapsed).toFixed(0)} rows/s`);
  }

  console.log(`완료: ${((Date.now() - started) / 1000).toFixed(1)}초`);
  await pool.end();
}

main();
