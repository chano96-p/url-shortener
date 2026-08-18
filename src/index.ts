import express from "express";
import { pool } from "./db.js";
import { prisma } from "./prisma.js";
import { generateCode } from "./shortCode.js";
import { isValidUrl } from "./validate.js";

// ─── 설정 ──────────────────────────────────────────
const port = Number(process.env.PORT) || 3000;
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
const CODE_PATTERN = /^[a-zA-Z0-9]{4,10}$/;

// ─── 헬퍼 ──────────────────────────────────────────
type UrlRow = {
  id: bigint;
  short_code: string;
  original_url: string;
  click_count: bigint;
  created_at: Date;
};

function parseCursor(raw: unknown): bigint | null | "invalid" {
  if (raw === undefined) return null;
  if (typeof raw !== "string") return "invalid";

  const decoded = Buffer.from(raw, "base64url").toString();
  if (!/^\d+$/.test(decoded)) return "invalid";
  if (decoded.length > 19) return "invalid";

  const value = BigInt(decoded);
  if (value > 9223372036854775807n) return "invalid";

  return value;
}

function encodeCursor(id: bigint): string {
  return Buffer.from(id.toString()).toString("base64url");
}

function parseLimit(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n) || n < 1) return 20;
  return Math.min(n, 100);
}

// ─── 앱 ────────────────────────────────────────────
const app = express();
app.use(express.json());

// ─── 헬스체크 ──────────────────────────────────────
app.get("/health", async (_req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ ok: true, dbTime: result.rows[0].now });
});

// ─── 단축 URL 생성 ─────────────────────────────────
app.post("/api/urls", async (req, res) => {
  const { url } = req.body ?? {};

  if (typeof url !== "string" || !isValidUrl(url)) {
    return res.status(400).json({
      error: { code: "INVALID_URL", message: "Valid http/https URL required" },
    });
  }

  const created = await prisma.url.create({
    data: { shortCode: generateCode(), originalUrl: url },
    select: { id: true, shortCode: true, createdAt: true },
  });

  res.status(201).json({
    id: created.id.toString(),
    shortCode: created.shortCode,
    shortUrl: `${baseUrl}/${created.shortCode}`,
    originalUrl: url,
    createdAt: created.createdAt,
  });
});

// ─── 목록 조회 (커서 페이지네이션) ──────────────────
app.get("/api/urls", async (req, res) => {
  const limit = parseLimit(req.query.limit);
  const cursor = parseCursor(req.query.cursor);

  if (cursor === "invalid") {
    return res.status(400).json({
      error: { code: "INVALID_CURSOR", message: "Malformed cursor" },
    });
  }

  // limit + 1 조회 → 초과 여부로 다음 페이지 판정
  const take = limit + 1;
  const rows =
    cursor === null
      ? await prisma.$queryRaw<UrlRow[]>`
          SELECT id, short_code, original_url, click_count, created_at
          FROM urls
          ORDER BY id DESC
          LIMIT ${take}
        `
      : await prisma.$queryRaw<UrlRow[]>`
          SELECT id, short_code, original_url, click_count, created_at
          FROM urls
          WHERE id < ${cursor}
          ORDER BY id DESC
          LIMIT ${take}
        `;

  const hasNext = rows.length > limit;
  const page = hasNext ? rows.slice(0, limit) : rows;

  const items = page.map((r) => ({
    id: r.id.toString(),
    shortCode: r.short_code,
    originalUrl: r.original_url,
    clickCount: r.click_count.toString(),
    createdAt: r.created_at,
  }));

  const last = page.at(-1);
  const nextCursor = hasNext && last ? encodeCursor(last.id) : null;

  res.json({ items, nextCursor });
});

// ─── 리다이렉트 (반드시 맨 아래) ────────────────────
app.get("/:code", async (req, res) => {
  const { code } = req.params;

  if (!CODE_PATTERN.test(code)) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Short URL not found" },
    });
  }

  const rows = await prisma.url.updateManyAndReturn({
    where: { shortCode: code },
    data: { clickCount: { increment: 1 } },
    select: { originalUrl: true },
  });

  if (rows.length === 0) {
    return res.status(404).json({
      error: { code: "NOT_FOUND", message: "Short URL not found" },
    });
  }

  res.set("Cache-Control", "no-store");
  res.redirect(302, rows[0].originalUrl);
});

// ─── 시작 ──────────────────────────────────────────
app.listen(port, () => console.log(`listening on :${port}`));
