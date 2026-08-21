import express from "express";
import { pool } from "./db.js";
import { errorHandler } from "./errorHandler.js";
import {
  CodeExhaustedError,
  InvalidCursorError,
  InvalidUrlError,
  NotFoundError,
} from "./errors.js";
import { Prisma } from "./generated/prisma/client.js";
import { prisma } from "./prisma.js";
import { generateCode } from "./shortCode.js";
import { isValidUrl } from "./validate.js";

// ─── 설정 ──────────────────────────────────────────
const port = Number(process.env.PORT) || 3000;
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;

const CODE_PATTERN = /^[a-zA-Z0-9]{4,10}$/;
const MAX_RETRIES = 5;
const MAX_CURSOR_DIGITS = 19;
const MAX_BIGINT = 9223372036854775807n;

// ─── 헬퍼 ──────────────────────────────────────────
function parseCursor(raw: unknown): bigint | null {
  if (raw === undefined) return null;
  if (typeof raw !== "string") throw new InvalidCursorError();

  const decoded = Buffer.from(raw, "base64url").toString();
  if (!/^\d+$/.test(decoded)) throw new InvalidCursorError();
  if (decoded.length > MAX_CURSOR_DIGITS) throw new InvalidCursorError();

  const value = BigInt(decoded);
  if (value > MAX_BIGINT) throw new InvalidCursorError();

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

// driver adapter 경로에서는 meta.target 이 채워지지 않으므로 code 로만 판정.
// 현재 Url 의 unique 제약은 shortCode 하나뿐이라 안전.
function isShortCodeConflict(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002";
}

function isRecordNotFound(e: unknown): boolean {
  return e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2025";
}

type UrlRow = {
  id: bigint;
  short_code: string;
  original_url: string;
  click_count: bigint;
  created_at: Date;
};

// ─── 도메인 로직 ───────────────────────────────────
async function createShortUrl(originalUrl: string) {
  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      return await prisma.url.create({
        data: { shortCode: generateCode(), originalUrl },
        select: { id: true, shortCode: true, createdAt: true },
      });
    } catch (e) {
      if (isShortCodeConflict(e)) continue;
      throw e;
    }
  }
  throw new CodeExhaustedError();
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
    throw new InvalidUrlError();
  }

  const created = await createShortUrl(url);

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
    throw new NotFoundError();
  }

  try {
    const url = await prisma.url.update({
      where: { shortCode: code },
      data: { clickCount: { increment: 1 } },
      select: { originalUrl: true },
    });

    res.set("Cache-Control", "no-store");
    res.redirect(302, url.originalUrl);
  } catch (e) {
    if (isRecordNotFound(e)) throw new NotFoundError();
    throw e;
  }
});

// ─── 에러 핸들러 (모든 라우트 뒤) ──────────────────
app.use(errorHandler);

// ─── 시작 ──────────────────────────────────────────
app.listen(port, () => console.log(`listening on :${port}`));
