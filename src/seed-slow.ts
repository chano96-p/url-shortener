import { faker } from "@faker-js/faker";
import { pool } from "./db.js";
import { generateCode } from "./shortCode.js";

async function main() {
  const total = 1_000_000;
  const started = Date.now();

  for (let i = 0; i < total; i++) {
    await pool.query("INSERT INTO urls (short_code, original_url) VALUES ($1, $2)", [
      generateCode(),
      faker.internet.url(),
    ]);

    if (i % 1000 === 0 && i > 0) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = i / elapsed;
      console.log(
        `${i} rows | ${rate.toFixed(0)} rows/s | 예상 총 소요: ${(total / rate / 60).toFixed(1)}분`,
      );
    }
  }
  await pool.end();
}

main();
