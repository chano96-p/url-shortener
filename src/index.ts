import express from "express";
import { pool } from "./db.js";

const app = express();
app.use(express.json());

app.get("/health", async (_req, res) => {
  const result = await pool.query("SELECT NOW()");
  res.json({ ok: true, dbTime: result.rows[0].now });
});

const port = Number(process.env.PORT) || 3000;
app.listen(port, () => console.log(`listening on :${port}`));
