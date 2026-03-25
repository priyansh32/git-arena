import { Pool } from "pg";

import { runMigrations } from "./migrations.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgres://gitarena:gitarena@localhost:5432/gitarena";

const pool = new Pool({ connectionString: databaseUrl });

try {
  console.log("Running database migrations…");
  await runMigrations(pool);
  console.log("Migrations complete.");
} catch (error) {
  console.error("Migration failed:", error);
  process.exit(1);
} finally {
  await pool.end();
}
