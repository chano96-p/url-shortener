import express from "express";
import { pool } from "./db.js";
import { generateCode } from "./shortCode.js";
import { isValidUrl } from "./validate.js";

const port = Number(process.env.PORT) || 3000;
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
const CODE_PATTERN = /^[a-zA-Z0-9]{4,10}$/;

type Cursor = { createdAt: string; id: string };

function parseCursor(raw: unknown): Cursor | null | "invalid" {
  if (raw === undefined) return null;
  if (typeof raw !== "string") return "invalid";

  let decoded: string;
  try {
    decoded = Buffer.from(raw, "base64url").toString();
  } catch {
    return "invalid";
  }

  const parts = decoded.split("|");
  if (parts.length !== 2) return "invalid";

  const [createdAt, id] = parts;
  if (Number.isNaN(Date.parse(createdAt))) return "invalid";
  if (!/^\d+$/.test(id)) return "invalid";

  return { createdAt, id };
}

function parseLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 100);
}

const LIST_COLUMNS = "id, short_code, original_url, click_count, created_at";

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ ok: true, dbTime: result.rows[0].now });
});

app.post("/api/urls", async (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== "string" || !isValidUrl(url)) {
    return res.status(400).json({
      error: { code: "INVALID_URL", message: "Valid http/https URL required" },
    });
  }

  const code = generateCode();

  const result = await pool.query(
    "INSERT INTO urls (short_code, original_url) VALUES ($1, $2) RETURNING id, short_code, created_at",
    [code, url],
  );

  const row = result.rows[0];

  res.status(201).json({
    id: String(row.id),
    shortCode: row.short_code,
    shortUrl: `${baseUrl}/${row.short_code}`,
    originalUrl: url,
    createdAt: row.created_at,
  });
});

app.get("/api/urls", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const cursor = parseCursor(req.query.cursor);

  if (cursor === "invalid") {
    return res.status(400).json({
      error: { code: "INVALID_CURSOR", message: "Malformed cursor" },
    });
  }

  // limit + 1 조회 → 초과 여부로 다음 페이지 판정
  const result = cursor
    ? await pool.query(
        `SELECT ${LIST_COLUMNS} FROM urls
         WHERE (created_at, id) < ($1, $2)
         ORDER BY created_at DESC, id DESC
         LIMIT $3`,
        [cursor.createdAt, cursor.id, limit + 1],
      )
    : await pool.query(
        `SELECT ${LIST_COLUMNS} FROM urls
         ORDER BY created_at DESC, id DESC
         LIMIT $1`,
        [limit + 1],
      );

  const hasNext = result.rows.length > limit;
  const rows = hasNext ? result.rows.slice(0, limit) : result.rows;

  const items = rows.map((r) => ({
    id: String(r.id),
    shortCode: r.short_code,
    originalUrl: r.original_url,
    clickCount: String(r.click_count),
    createdAt: r.created_at,
  }));

  const last = rows.at(-1);
  const nextCursor =
    hasNext && last
      ? Buffer.from(`${last.created_at.toISOString()}|${last.id}`).toString("base64url")
      : null;

  res.json({ items, nextCursor });
});

app.get("/:code", async (req, res) => {
  const { code } = req.params;

  if (!CODE_PATTERN.test(code)) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Short URL not found" },
    });
  }

  const result = await pool.query(
    "UPDATE urls SET click_count = click_count + 1 WHERE short_code = $1 RETURNING original_url",
    [code],
  );

  if (result.rows.length === 0) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Short URL not found" },
    });
  }

  res.set("Cache-Control", "no-store");
  res.redirect(302, result.rows[0].original_url);
});

app.listen(port, () => console.log(`listening on :${port}`));
