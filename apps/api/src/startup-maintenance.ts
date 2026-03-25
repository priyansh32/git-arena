import type { Pool } from "pg";

/**
 * Run startup maintenance tasks in a single transaction.
 * Idempotent — safe to run on every app start.
 *
 * Schema DDL lives in sql/schema.sql and numbered migration files.
 * This file only handles runtime data normalization.
 */
export async function runStartupMaintenance(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");
    await client.query(
      `
      WITH ranked AS (
        SELECT
          id,
          ROW_NUMBER() OVER (
            PARTITION BY user_id
            ORDER BY started_at DESC, id DESC
          ) AS rn
        FROM sessions
        WHERE status IN ('active', 'submitted')
      )
      UPDATE sessions AS s
      SET status = 'terminated',
          submitted_at = COALESCE(submitted_at, NOW()),
          termination_reason = COALESCE(termination_reason, 'superseded_active_session')
      FROM ranked AS r
      WHERE s.id = r.id
        AND r.rn > 1
      `
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
