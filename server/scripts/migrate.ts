import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { Pool } from "pg";
import { env } from "../src/config/env.js";

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const migrationPath = path.resolve(currentDir, "../src/infrastructure/database/migrations/001_initial.sql");
const sql = await readFile(migrationPath, "utf8");
const pool = new Pool({ connectionString: env.DATABASE_URL });

try {
  await pool.query(sql);
  console.log("Database migration complete.");
} finally {
  await pool.end();
}

