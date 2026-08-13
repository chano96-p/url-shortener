import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { faker } from "@faker-js/faker";
import { from as copyFrom } from "pg-copy-streams";
import { pool } from "./db.js";
import { generateCode } from "./shortCode.js";

const TOTAL = 1_000_000;

async function main() {
  const started = Date.now();
  const client = await pool.connect();

  const stream = client.query(
    copyFrom("COPY urls (short_code, original_url) FROM STDIN WITH (FORMAT csv)"),
  );

  const rows = Readable.from(
    (function* () {
      for (let i = 0; i < TOTAL; i++) {
        yield `${generateCode()},"${faker.internet.url()}"\n`;
      }
    })(),
  );

  await pipeline(rows, stream);

  console.log(`완료: ${((Date.now() - started) / 1000).toFixed(1)}초`);
  client.release();
  await pool.end();
}

main();
