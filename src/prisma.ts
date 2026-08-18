import { PrismaPg } from "@prisma/adapter-pg";
import { pool } from "./db.js";
import { PrismaClient } from "./generated/prisma/client.js";

const adapter = new PrismaPg(pool);

export const prisma = new PrismaClient({
  adapter,
  log: process.env.NODE_ENV === "production" ? [] : [{ emit: "stdout", level: "query" }],
});
