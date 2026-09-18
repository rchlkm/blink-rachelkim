import type { Db } from "../db.ts";
import type { Job } from "../types.ts";

/**
 * Atomically claims the oldest queued job whose payload.type is one of `types`.
 * `jobs` is shared with other job types, so we filter rather than take whatever is next.
 * SKIP LOCKED lets multiple workers poll concurrently without blocking on each other.
 */
export async function claimNext(db: Db, types: readonly string[]): Promise<Job | null> {
  const { rows } = await db.query(
    `UPDATE jobs
        SET status = 'running', claimed_at = now(), attempts = attempts + 1, updated_at = now()
      WHERE id = (
        SELECT id FROM jobs
         WHERE status = 'queued' AND payload->>'type' = ANY($1)
         ORDER BY created_at
         LIMIT 1
         FOR UPDATE SKIP LOCKED
      )
      RETURNING id, payload, attempts`,
    [types],
  );
  return rows[0] ?? null;
}

export async function markSucceeded(db: Db, id: string, result: unknown): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'succeeded', result = $2, error = NULL, updated_at = now()
      WHERE id = $1`,
    [id, result],
  );
}

export async function markFailed(db: Db, id: string, error: string): Promise<void> {
  await db.query(
    `UPDATE jobs SET status = 'failed', error = $2, updated_at = now() WHERE id = $1`,
    [id, error],
  );
}
