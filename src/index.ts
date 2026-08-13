import express from "express";
import { pool } from "./db.js";
import { generateCode } from "./shortCode.js";
import { isValidUrl } from "./validate.js";

const port = Number(process.env.PORT) || 3000;
const baseUrl = process.env.BASE_URL ?? `http://localhost:${port}`;
const CODE_PATTERN = /^[a-zA-Z0-9]{4,10}$/;

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
