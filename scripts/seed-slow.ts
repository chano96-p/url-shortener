import { faker } from "@faker-js/faker";
import { pool } from "../src/db.js";
import { generateCode } from "../src/shortCode.js";

// 의도적으로 느린 방식 — 배치/COPY 와 비교하기 위한 기준선
// 10~20초만 돌려보고 Ctrl+C 로 중단할 것
async function main() {
  const total = 1_000_000;
  const started = Date.now();

  for (let i = 0; i < total; i++) {
    await pool.query(
      `INSERT INTO urls (short_code, original_url) VALUES ($1, $2)
       ON CONFLICT (short_code) DO NOTHING`,
      [generateCode(), faker.internet.url()],
    );

    if (i % 1000 === 0 && i > 0) {
      const elapsed = (Date.now() - started) / 1000;
      const rate = i / elapsed;
      console.log(
        `${i} rows | ${rate.toFixed(0)} rows/s | 예상 총 소요: ${(total / rate / 60).toFixed(1)}분`,
      );
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
